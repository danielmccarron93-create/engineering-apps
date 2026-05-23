/**
 * StructDraw v2 · Engine Layer · v1 -> v2 bridge (shadow model)
 * LAYER: engine — wraps the v1 state mutators so that, after every v1 edit,
 *        the v2 StructuralModel (v2.appState.model) is rebuilt from the
 *        current v1 state. v1 stays fully authoritative; v2 only SHADOWS.
 * READS:  v1 globals objects3D / entities2D / blocks; window.v2.io.migrations
 *           .v1ToV2; window.v2.appState; window.v2.engine.dirtyBus
 * WRITES: window.v2.engine.v1Bridge; (on install()) the wrapped v1 mutator
 *           globals window.{addObj, delObj, addEnt2D, undo, redo,
 *           v25DeleteSelected, _projectLoadSheet, loadProject, saveProject,
 *           exportProject, importProject}
 *
 * Classic <script>, no build step (CLAUDE.md rules 3 & 8). Loading this file
 * has NO side effect — it only defines the v1Bridge object. The wrapping
 * happens in install(), which js/v2/engine/init.js calls on DOMContentLoaded,
 * AFTER v1's own bootstrap (js/73-init.js) has finished.
 *
 * STRATEGY (07-migration-strategy.md §1, the "shadow model" phase). Each wrap
 * is a thin "run the original v1 mutator, then re-migrate". syncFromV1() does
 * a FULL re-migration of objects3D + entities2D + blocks through the
 * deterministic v1ToV2 migrator — so v2.appState.model is, by construction,
 * always exactly v1ToV2(current v1 state), no matter HOW v1 mutated. A bug in
 * the shadow can NEVER break v1: every wrapper runs the original first and
 * isolates any sync error.
 *
 * v1 mutator surface wrapped (09-build-plan.md Phase 0d "Files touched"):
 *   - addObj / delObj         — 3D-mode object placement + delete (js/05-state.js)
 *   - addEnt2D                — every V25 paper entity add routes through this
 *                               (js/05-state.js); v25Add() calls it internally
 *   - undo / redo             — both mutate objects3D + entities2D directly
 *   - v25DeleteSelected       — V25 entity delete (js/71-v25-selection.js)
 *   - _projectLoadSheet       — sheet switch / project import store-swap
 *   - loadProject / saveProject / exportProject / importProject — file I/O
 *
 * Reading v1 state: in the browser the v1 stores are bare top-level `let`s in
 * the shared classic-script global scope (NOT window.* properties), so the
 * bridge reads them by bare name under a `typeof` guard. The same guarded read
 * also works under the JSDOM test harness, where the harness publishes the
 * stores as global-object properties.
 *
 * KNOWN PHASE-0d LIMITATION: loadProject() reads the file via an async
 * FileReader, so the wrapper's post-call sync captures the PRE-load state; the
 * post-load state is picked up by the next mutator. Phase 0e ("v1->v2 file
 * migration") wires file load through the migrator properly. The Phase 0d exit
 * criterion (100 randomised mutations) and browser smoke-test (placements)
 * exercise only the synchronous mutators, which ARE live-synced.
 * See 09-build-plan.md Phase 0d and 03-model-layer.md §10.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.engine = v2.engine || {};

  /** v1 mutator globals the bridge wraps. Order is not significant. */
  const WRAPPED = [
    'addObj', 'delObj', 'addEnt2D', 'undo', 'redo',
    'v25DeleteSelected', '_projectLoadSheet',
    'loadProject', 'saveProject', 'exportProject', 'importProject',
  ];

  // name -> the original (pre-wrap) function, captured at install().
  const originals = {};

  /**
   * Fix 1 (2026-05-23) — v1 tool-activation functions the bridge wraps to
   * RELEASE any active v2 tool BEFORE the v1 tool takes over. Different from
   * WRAPPED — these wrappers don't trigger a shadow sync; they just close
   * the v2 lifecycle gap so a user switching v1 tools doesn't leave a v2
   * tool capturing canvas events. Without this, clicking the UB tile while
   * the v2 PlacePlateTool was active would leave PlacePlateTool active and
   * eating every canvas click. See
   * PlannedBuilds/architecture-v2/12-plate-fix-plan.md Fix 1.
   */
  const RELEASE_WRAPPED = [
    'setTool', 'v25SetTool', 'v25PickAndSetMember', 'v25SetHatch',
  ];

  // name -> the original (pre-release-wrap) function, captured at install().
  const releaseOriginals = {};

  /**
   * Read the current v1 state. In the browser objects3D / entities2D / blocks
   * are bare globals; the `typeof` guard makes this total in any environment
   * (and the bare reference in the ternary's consequent is reached only when
   * the guard has already proven the binding exists).
   * @returns {{objects3D:Array, entities2D:Object, blocks:Array}}
   */
  function readV1State() {
    const objs = (typeof objects3D  !== 'undefined') ? objects3D  : undefined;
    const ents = (typeof entities2D !== 'undefined') ? entities2D : undefined;
    const blks = (typeof blocks     !== 'undefined') ? blocks     : undefined;
    return {
      objects3D:  Array.isArray(objs) ? objs : [],
      entities2D: (ents && typeof ents === 'object') ? ents : {},
      blocks:     Array.isArray(blks) ? blks : [],
    };
  }

  /**
   * Capture every v2-authoritative element from the current shadow model so
   * the next migrator pass can graft them back on. An element is
   * "v2-authoritative" when its `params.v2Source` identifies a v2 tool that
   * created it (rather than a v1 migration that produced it). Phase 2 retired
   * the feature-flag gate for plates — plates are now unconditionally v2-
   * native, so their graft is always on. Phase 3 adds BOLTS to the filter,
   * gated by the `useV2For.bolts` feature flag — bolts soak in daily use with
   * the flag off being byte-identical to today, then Dan flips it on for the
   * one-week soak, then the Phase 3 retirement chat removes the gate.
   * Returns an array of Element objects in their existing form (sharing
   * references with the prior model — the caller hands them to the new model
   * unchanged, so undo replay still works on them).
   * @returns {Element[]}
   */
  function captureV2Authoritative() {
    const prior = v2.appState && v2.appState.model;
    if (!prior || !(prior.elements instanceof Map)) return [];
    const boltsAuthoritative = !!(v2.featureFlags &&
      typeof v2.featureFlags.get === 'function' && v2.featureFlags.get('bolts'));
    const out = [];
    prior.elements.forEach(function (el) {
      if (!el || !el.params) return;
      const src = el.params.v2Source;
      const isV2Plate = el.category === 'plate'    && src === 'place-plate-tool';
      const isV2Bolt  = el.category === 'fastener' && src === 'place-bolt-tool' && boltsAuthoritative;
      if (isV2Plate || isV2Bolt) out.push(el);
    });
    return out;
  }

  /**
   * Fix F (2026-05-23) — strip any previously-grafted v2→v1 mirror entries
   * from `entities2D` so the migrator doesn't re-process them as fresh v1
   * plates. Called at the START of every syncFromV1 AND before saveProject /
   * exportProject run, so persisted files never include mirrors.
   * @returns {number} count of mirrors removed (for diagnostics)
   */
  function stripMirrorsFromEntities2D() {
    if (typeof entities2D !== 'object' || !entities2D) return 0;
    let removed = 0;
    Object.keys(entities2D).forEach(function (viewKey) {
      const arr = entities2D[viewKey];
      if (!Array.isArray(arr)) return;
      for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i] && arr[i]._v2Mirror) { arr.splice(i, 1); removed++; }
      }
    });
    return removed;
  }

  /**
   * Fix F (2026-05-23) — push synthetic `plate2`-shaped entries into v1's
   * `entities2D` for every v2-authoritative plate. v1's selection, snap, edge-
   * snap, auto-weld, hit-test, and PDF/DXF pipelines all iterate `entities2D`
   * — adding mirrors lets v2 plates participate as if they were native v1
   * plate2 entries WITHOUT v2 having to rebuild every layer in v2-native form.
   *
   * Each mirror carries `_v2Mirror: true` and `_v2Id: el.id` so consumers can
   * distinguish a mirror from a real v1 plate (and the next syncFromV1 strips
   * mirrors before re-migrating, so they never round-trip through the
   * migrator). The mirror is read-only — v1 code that mutates a mirror is a
   * future-round fix (grip-drag → editElement translation); for now mirrors
   * support hit-test, draw-pass, auto-weld and export ONLY.
   *
   * Mirror shape (matches the v1 plate2 entity contract from the deleted
   * `js/76-v25-plate.js`):
   *   { type: 'plate2', _v2Mirror, _v2Id, id, aspect: 'elev',
   *     shape: 'poly', pts: [{u,v}, ...], u, v, thk, rot: 0 }
   *
   * The 'poly' shape is used uniformly even for rectangles — v25Plate2Faces'
   * polygon branch walks any N-vertex polygon (and auto-detects CCW/CW
   * winding for correct outward normals).
   * @returns {number} count of mirrors added (for diagnostics)
   */
  function mirrorV2IntoV1() {
    if (typeof entities2D !== 'object' || !entities2D) return 0;
    if (!v2.appState || !v2.appState.model ||
        !(v2.appState.model.elements instanceof Map)) return 0;
    let added = 0;
    v2.appState.model.elements.forEach(function (el) {
      if (!el || el.category !== 'plate') return;
      if (!el.params || el.params.v2Source !== 'place-plate-tool') return;
      const g = el.geometry;
      if (!g || g.kind !== 'region' || !Array.isArray(g.polygon) || g.polygon.length < 3) return;
      const m = /^v1-view-(.+)$/.exec(g.viewId || '');
      const viewKey = m ? m[1] : 'elevation';
      const bucket = entities2D[viewKey];
      if (!Array.isArray(bucket)) return;
      const first = g.polygon[0];
      const mirror = {
        type:      'plate2',
        _v2Mirror: true,
        _v2Id:     el.id,
        id:        'v2mirror-' + el.id,
        aspect:    'elev',
        shape:     'poly',
        pts:       g.polygon.map(function (p) { return { u: p.x, v: p.y }; }),
        u:         (first && typeof first.x === 'number') ? first.x : 0,
        v:         (first && typeof first.y === 'number') ? first.y : 0,
        thk:       (el.params && typeof el.params.thickness === 'number') ? el.params.thickness : 10,
        rot:       0,
      };
      bucket.push(mirror);
      added++;
    });
    return added;
  }

  /**
   * Re-migrate the current v1 state into v2.appState.model, then graft any
   * v2-authoritative elements (captured before the re-migration) back on top
   * so a v1 mutation never clobbers a v2-native element. Without this graft
   * the Phase 1 pilot would silently lose every v2 plate the moment v1 added
   * a single object3D or 2D entity.
   *
   * Can throw if the migrator or appState is missing — callers that must not
   * disturb v1 (the wrappers, install) go through the try/catch in syncSafe().
   * @param {string} [trigger] the v1 mutator name that prompted the sync
   * @returns {StructuralModel}
   */
  function syncFromV1(trigger) {
    if (!v2.io || !v2.io.migrations || typeof v2.io.migrations.v1ToV2 !== 'function') {
      throw new Error('v1Bridge.syncFromV1: v2.io.migrations.v1ToV2 is not loaded');
    }
    if (!v2.appState) {
      throw new Error('v1Bridge.syncFromV1: v2.appState is not loaded');
    }
    // Fix F (2026-05-23) — strip prior mirrors so the migrator sees only real
    // v1 entries. Without this, mirrors would round-trip into v2 as duplicate
    // plates on every sync.
    stripMirrorsFromEntities2D();
    // Capture v2-authoritative elements BEFORE re-migration overwrites them.
    const v2Survivors = captureV2Authoritative();
    const model = v2.io.migrations.v1ToV2(readV1State());
    // Graft the survivors back. They keep their original ids; if the migrator
    // happened to produce an element with a colliding id, the v2-authoritative
    // version wins (it carries the user's actual work).
    for (let i = 0; i < v2Survivors.length; i++) {
      const el = v2Survivors[i];
      model.elements.set(el.id, el);
    }
    v2.appState.model = model;
    // Fix F (2026-05-23) — add v2→v1 mirrors AFTER the graft so v1's layers
    // (auto-weld, selection, snap, export) see v2 plates as plate2 entries.
    const mirrorsAdded = mirrorV2IntoV1();
    bridge.syncCount += 1;
    bridge.lastTrigger = trigger || null;
    bridge.lastV2Survivors = v2Survivors.length;
    bridge.lastMirrorsAdded = mirrorsAdded;
    // Fix F (2026-05-23) — invalidate the auto-weld interface cache so the
    // next render recomputes welds with the newly-mirrored plates included.
    if (typeof invalidateWeldCache === 'function') {
      try { invalidateWeldCache(); } catch (e) { /* harmless */ }
    }
    if (v2.engine.dirtyBus && typeof v2.engine.dirtyBus.emit === 'function') {
      v2.engine.dirtyBus.emit('model-changed', {
        model: model, source: 'v1-bridge', trigger: trigger || null,
        v2Survivors: v2Survivors.length, mirrorsAdded: mirrorsAdded,
      });
    }
    return model;
  }

  /** syncFromV1 with the shadow's errors isolated — v1 must never break. */
  function syncSafe(trigger) {
    try {
      return syncFromV1(trigger);
    } catch (e) {
      if (window.console && console.error) {
        console.error('[v2.engine.v1Bridge] shadow sync failed (' + trigger + '):', e);
      }
      return null;
    }
  }

  /**
   * Fix K (2026-05-23) — refresh v2→v1 mirrors WITHOUT re-running the
   * v1→v2 migrator. Called when a v2 transaction (placeElement, editElement,
   * removeElement) emits 'model-changed' — without this hook the mirror seam
   * is silent for v2-originated changes and auto-weld doesn't fire until the
   * next v1 mutation forces a full syncFromV1.
   *
   * Strips prior mirrors, re-adds from the current v2 model, invalidates the
   * auto-weld cache, and pumps a render so the new welds paint immediately.
   * Trigger-string is for diagnostics only.
   */
  function refreshMirrors(trigger) {
    try { stripMirrorsFromEntities2D(); } catch (e) {
      if (window.console && console.error) {
        console.error('[v2.engine.v1Bridge] strip-mirrors failed (' + trigger + '):', e);
      }
      return 0;
    }
    let added = 0;
    try { added = mirrorV2IntoV1(); } catch (e) {
      if (window.console && console.error) {
        console.error('[v2.engine.v1Bridge] mirror-add failed (' + trigger + '):', e);
      }
    }
    bridge.lastMirrorsAdded = added;
    if (typeof invalidateWeldCache === 'function') {
      try { invalidateWeldCache(); } catch (e) { /* harmless */ }
    }
    if (typeof requestRender === 'function') {
      try { requestRender(); } catch (e) { /* harmless */ }
    }
    return added;
  }

  /** Wrap one v1 mutator: run the original, then re-sync the shadow. */
  function makeWrapper(orig, name) {
    function v1BridgeWrapper() {
      const result = orig.apply(this, arguments);
      syncSafe(name);
      return result;
    }
    v1BridgeWrapper._v1BridgeWrapped = true;
    v1BridgeWrapper._v1BridgeName = name;
    return v1BridgeWrapper;
  }

  /**
   * Fix 1 (2026-05-23) — wrap one v1 tool-activation fn so any active v2
   * tool is released BEFORE the v1 fn runs. Pure pass-through when no v2
   * tool is active. The try/catch isolates v2 errors so a misbehaving v2
   * tool can never break v1's tool activation.
   */
  function makeReleaseWrapper(orig, name) {
    function v1BridgeReleaseWrapper() {
      try {
        if (v2.engine && typeof v2.engine.setActiveTool === 'function' &&
            typeof v2.engine.activeTool === 'function' &&
            v2.engine.activeTool()) {
          v2.engine.setActiveTool(null);
        }
      } catch (e) {
        if (window.console && console.error) {
          console.error('[v2.engine.v1Bridge] release-wrap pre-call failed (' + name + '):', e);
        }
      }
      return orig.apply(this, arguments);
    }
    v1BridgeReleaseWrapper._v1BridgeReleaseWrapped = true;
    v1BridgeReleaseWrapper._v1BridgeName = name;
    return v1BridgeReleaseWrapper;
  }

  /**
   * Wrap every present v1 mutator and take an initial shadow snapshot.
   * Idempotent — a second call while installed is a no-op.
   * @returns {object} the bridge
   */
  function install() {
    if (bridge.installed) return bridge;
    bridge.installedNames = [];
    for (let i = 0; i < WRAPPED.length; i++) {
      const name = WRAPPED[i];
      const current = window[name];
      // Skip a mutator that is not present (e.g. a partial test harness) or one
      // already wearing this bridge's wrapper (defensive against double-wrap).
      if (typeof current !== 'function' || current._v1BridgeWrapped) continue;
      originals[name] = current;
      window[name] = makeWrapper(current, name);
      bridge.installedNames.push(name);
    }
    // Fix 1 (2026-05-23) — install the release-wrap layer on v1 tool fns.
    // Separate loop from WRAPPED because the semantics differ (release-first,
    // no sync-after). See PlannedBuilds/architecture-v2/12-plate-fix-plan.md.
    bridge.releaseInstalledNames = [];
    for (let i = 0; i < RELEASE_WRAPPED.length; i++) {
      const name = RELEASE_WRAPPED[i];
      const current = window[name];
      if (typeof current !== 'function' || current._v1BridgeReleaseWrapped) continue;
      releaseOriginals[name] = current;
      window[name] = makeReleaseWrapper(current, name);
      bridge.releaseInstalledNames.push(name);
    }
    // Fix F (2026-05-23) — outer-wrap saveProject / exportProject so mirrors
    // are stripped BEFORE the original serialises entities2D. The standard
    // WRAPPED sync-wrap is already in place at this point; we wrap on top of
    // it. Order at call-time: stripMirrors → wrappedSave → original → sync
    // (re-adds mirrors). Files never include mirrors.
    ['saveProject', 'exportProject'].forEach(function (name) {
      const current = window[name];
      if (typeof current !== 'function' || current._v1BridgeMirrorAware) return;
      function v1BridgeMirrorWrapper() {
        try { stripMirrorsFromEntities2D(); } catch (e) {
          if (window.console && console.error) {
            console.error('[v2.engine.v1Bridge] stripMirrors before ' + name + ' threw:', e);
          }
        }
        return current.apply(this, arguments);
      }
      v1BridgeMirrorWrapper._v1BridgeMirrorAware = true;
      v1BridgeMirrorWrapper._v1BridgeWrapped     = !!current._v1BridgeWrapped;
      v1BridgeMirrorWrapper._v1BridgeName        = name;
      window[name] = v1BridgeMirrorWrapper;
    });
    // Fix K (2026-05-23) — subscribe to v2's dirtyBus 'model-changed' so
    // v2-originated transactions (place/edit/remove plate via the v2 tool
    // and undoStack) refresh the v1 mirror immediately. Without this, the
    // mirror only updated on v1 mutations — v2 plate placement appeared on
    // the canvas via live-render but didn't reach v1's auto-weld until the
    // user happened to do something else that triggered syncFromV1.
    // Skip events sourced from this bridge to avoid recursion (syncFromV1
    // emits its own 'model-changed' after adding mirrors).
    if (v2.engine.dirtyBus && typeof v2.engine.dirtyBus.on === 'function' &&
        !bridge._modelChangedOff) {
      bridge._modelChangedOff = v2.engine.dirtyBus.on('model-changed', function (payload) {
        if (payload && payload.source === 'v1-bridge') return;
        refreshMirrors(payload && payload.source || 'unknown');
      });
    }
    bridge.installed = true;
    syncSafe('install');
    return bridge;
  }

  /**
   * Restore every wrapped v1 mutator to its original. Idempotent.
   * @returns {object} the bridge
   */
  function uninstall() {
    if (!bridge.installed) return bridge;
    for (let i = 0; i < WRAPPED.length; i++) {
      const name = WRAPPED[i];
      if (typeof originals[name] === 'function' && window[name] &&
          window[name]._v1BridgeWrapped) {
        window[name] = originals[name];
      }
      delete originals[name];
    }
    // Fix 1 (2026-05-23) — also restore the release-wrapped v1 tool fns.
    for (let i = 0; i < RELEASE_WRAPPED.length; i++) {
      const name = RELEASE_WRAPPED[i];
      if (typeof releaseOriginals[name] === 'function' && window[name] &&
          window[name]._v1BridgeReleaseWrapped) {
        window[name] = releaseOriginals[name];
      }
      delete releaseOriginals[name];
    }
    // Fix K (2026-05-23) — unsubscribe the dirtyBus model-changed listener.
    if (typeof bridge._modelChangedOff === 'function') {
      try { bridge._modelChangedOff(); } catch (e) { /* harmless */ }
      bridge._modelChangedOff = null;
    }
    bridge.installed = false;
    bridge.installedNames = [];
    bridge.releaseInstalledNames = [];
    return bridge;
  }

  const bridge = {
    installed: false,
    installedNames: [],
    releaseInstalledNames: [],         // Fix 1 (2026-05-23)
    syncCount: 0,
    lastTrigger: null,
    lastV2Survivors: 0,
    lastMirrorsAdded: 0,               // Fix F (2026-05-23)
    WRAPPED: WRAPPED.slice(),
    RELEASE_WRAPPED: RELEASE_WRAPPED.slice(),   // Fix 1 (2026-05-23)
    install: install,
    uninstall: uninstall,
    syncFromV1: syncFromV1,
    readV1State: readV1State,
    captureV2Authoritative: captureV2Authoritative,
    stripMirrorsFromEntities2D: stripMirrorsFromEntities2D,  // Fix F (2026-05-23)
    mirrorV2IntoV1: mirrorV2IntoV1,                          // Fix F (2026-05-23)
    refreshMirrors: refreshMirrors,                          // Fix K (2026-05-23)
    _modelChangedOff: null,                                  // Fix K (2026-05-23)
  };

  v2.engine.v1Bridge = bridge;
})();
