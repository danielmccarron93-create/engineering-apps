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
   * the feature-flag gate — plates are now unconditionally v2-native, so the
   * graft is always on. Future families (bolts, members…) extend this filter
   * as each migrates.
   * Returns an array of Element objects in their existing form (sharing
   * references with the prior model — the caller hands them to the new model
   * unchanged, so undo replay still works on them).
   * @returns {Element[]}
   */
  function captureV2Authoritative() {
    const prior = v2.appState && v2.appState.model;
    if (!prior || !(prior.elements instanceof Map)) return [];
    const out = [];
    prior.elements.forEach(function (el) {
      if (!el) return;
      const isV2Plate = el.category === 'plate' && el.params &&
                        el.params.v2Source === 'place-plate-tool';
      if (isV2Plate) out.push(el);
    });
    return out;
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
    bridge.syncCount += 1;
    bridge.lastTrigger = trigger || null;
    bridge.lastV2Survivors = v2Survivors.length;
    if (v2.engine.dirtyBus && typeof v2.engine.dirtyBus.emit === 'function') {
      v2.engine.dirtyBus.emit('model-changed', {
        model: model, source: 'v1-bridge', trigger: trigger || null,
        v2Survivors: v2Survivors.length,
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
    bridge.installed = false;
    bridge.installedNames = [];
    return bridge;
  }

  const bridge = {
    installed: false,
    installedNames: [],
    syncCount: 0,
    lastTrigger: null,
    lastV2Survivors: 0,
    WRAPPED: WRAPPED.slice(),
    install: install,
    uninstall: uninstall,
    syncFromV1: syncFromV1,
    readV1State: readV1State,
    captureV2Authoritative: captureV2Authoritative,
  };

  v2.engine.v1Bridge = bridge;
})();
