/**
 * StructDraw v2 · I/O Layer · load (file ingest → model)
 * LAYER: io — the top-level v1/v2 file-load orchestrator. Detects the saved
 *        file's schema, routes to v1 migration or v2 deserialise, and
 *        publishes the result on `v2.appState.model`.
 * READS:  window.v2.io.{migrations.v1ToV2, modelFromJSON}; window.v2.engine
 *           .v1Bridge (optional); window.v2.appState; window.v2.model.makeModel
 * WRITES: window.v2.io.load (with the public entry points listed below);
 *           window.v2.appState.model on every successful load
 *
 * Classic <script>, no build step (CLAUDE.md rules 3 & 8). Pure data + pure
 * functions where possible (no DOM, no canvas). The one async surface is
 * `readFileAsText`, used by browser FileReader flows; it is a thin wrapper that
 * keeps tests synchronous by accepting an already-parsed object.
 *
 * --- WHAT WAS LOADED (PHASE 0d gap closed by this file) -------------------
 * Phase 0d wraps v1's `loadProject` / `importProject` with the shadow bridge,
 * but those v1 functions read the file via an async FileReader — so the
 * bridge's post-call sync runs BEFORE the file has loaded. Phase 0e closes that
 * gap by giving the v1 callers an explicit `v2.io.load.afterV1Load(trigger)`
 * hook to invoke at the END of their `reader.onload` body, AFTER the v1
 * globals have been repopulated. That call re-runs the deterministic v1->v2
 * migrator on the live v1 state and replaces `v2.appState.model` — so a file
 * load is observable in the v2 shadow within the same tick as v1 finishes.
 * See 07-migration-strategy.md §4 ("save-file lifecycle") and Phase 0d's
 * "KNOWN PHASE-0d LIMITATION" note in v1-bridge.js.
 *
 * --- PUBLIC API ------------------------------------------------------------
 *   v2.io.load.detectSchemaVersion(parsed)
 *     -> 'v1-single' | 'v1-project' | 'v2' | 'unknown'
 *
 *   v2.io.load.fromParsed(parsed, opts?)
 *     -> a v2 StructuralModel. Pure. Always returns SOMETHING (an empty model
 *        for unrecognised input). Does NOT touch appState.
 *
 *   v2.io.load.applyToShadow(parsed, opts?)
 *     -> same as fromParsed, but ALSO assigns to v2.appState.model and emits
 *        on dirtyBus. Returns the new model. Use this for direct ingestion of
 *        a parsed object (tests, future drag-and-drop wiring).
 *
 *   v2.io.load.afterV1Load(trigger?)
 *     -> the v1 integration point. Idempotent. Re-migrates the LIVE v1 state
 *        (read via the v1 bridge if installed, otherwise direct bare globals)
 *        and assigns to v2.appState.model. Called by `js/46-save-load.js` and
 *        `js/50-project.js` at the end of their FileReader onload callbacks.
 *
 *   v2.io.load.readFileAsText(file)
 *     -> Promise<string>. Tiny wrapper around FileReader.readAsText. Browser-
 *        only; the test harness drives the pure functions above instead.
 *
 * Phase 0e does NOT delete the v1 file-load path — v1's loadProject /
 * importProject still repopulate v1 globals (the rendering app still reads
 * those). load.js sits ALONGSIDE that, lifting the v2 shadow in step.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.io = v2.io || {};

  // --- schema detection -----------------------------------------------------

  /**
   * Classify a parsed save payload by its visible shape.
   *
   *   v1 single-sheet: `46-save-load.js` writes { version: '1.0', objects3D,
   *                    entities2D, blocks, … }. No `format` field.
   *   v1 multi-sheet:  `50-project.js`   writes { format: 'structdraw-project',
   *                    version: 1, project: { sheets: [...] } }.
   *   v2:              the future shape — { schemaVersion: 2, v2: {...},
   *                    optionally v1: {...} }.
   * @param {object} parsed
   * @returns {'v1-single'|'v1-project'|'v2'|'unknown'}
   */
  function detectSchemaVersion(parsed) {
    if (!parsed || typeof parsed !== 'object') return 'unknown';
    // v2 shape: a numeric schemaVersion of 2 or greater wins outright.
    if (typeof parsed.schemaVersion === 'number' && parsed.schemaVersion >= 2) {
      return 'v2';
    }
    // v1 multi-sheet shape (.sdproj).
    if (parsed.format === 'structdraw-project' &&
        parsed.project && Array.isArray(parsed.project.sheets)) {
      return 'v1-project';
    }
    // v1 single-sheet shape. The required telltale is objects3D and/or
    // entities2D — `version: '1.0'` is a soft hint but not required (early
    // demo saves omit it).
    if (Array.isArray(parsed.objects3D) ||
        (parsed.entities2D && typeof parsed.entities2D === 'object')) {
      return 'v1-single';
    }
    return 'unknown';
  }

  // --- v1 -> v2 routing -----------------------------------------------------

  /** Compact a v1 single-sheet payload to just the three migrator-relevant keys. */
  function v1SingleSlice(parsed) {
    return {
      objects3D:  Array.isArray(parsed.objects3D) ? parsed.objects3D : [],
      entities2D: (parsed.entities2D && typeof parsed.entities2D === 'object')
        ? parsed.entities2D : {},
      blocks:     Array.isArray(parsed.blocks) ? parsed.blocks : [],
    };
  }

  /**
   * For a v1 multi-sheet .sdproj we migrate the ACTIVE sheet only — the v2
   * model represents one sheet today (per Phase 0d's v1ToV2 contract). Once
   * v2 sheets are first-class (Phase 9), this can grow into a per-sheet loop.
   */
  function v1ProjectActiveSlice(parsed) {
    const proj = parsed.project || {};
    const sheets = Array.isArray(proj.sheets) ? proj.sheets : [];
    let idx = (typeof proj.activeSheetIdx === 'number') ? proj.activeSheetIdx : 0;
    if (idx < 0 || idx >= sheets.length) idx = 0;
    const active = sheets[idx] || {};
    return {
      objects3D:  Array.isArray(active.objects3D) ? active.objects3D : [],
      entities2D: (active.entities2D && typeof active.entities2D === 'object')
        ? active.entities2D : {},
      blocks: [],   // v1 multi-sheet saves do not carry blocks per sheet
    };
  }

  /**
   * Build a v2 model from a parsed save payload. Pure — does not touch appState.
   * Always returns a model: an unrecognised input yields an empty model rather
   * than throwing, so callers can still wire side-effects safely.
   * @param {object} parsed
   * @param {object} [opts]
   * @returns {StructuralModel}
   */
  function fromParsed(parsed, opts) {
    void opts;
    const schema = detectSchemaVersion(parsed);
    if (schema === 'v1-single' && v2.io.migrations &&
        typeof v2.io.migrations.v1ToV2 === 'function') {
      return v2.io.migrations.v1ToV2(v1SingleSlice(parsed));
    }
    if (schema === 'v1-project' && v2.io.migrations &&
        typeof v2.io.migrations.v1ToV2 === 'function') {
      return v2.io.migrations.v1ToV2(v1ProjectActiveSlice(parsed));
    }
    if (schema === 'v2' && typeof v2.io.modelFromJSON === 'function') {
      // The payload may either be `{ schemaVersion, v2: {...}, v1: {...} }`
      // (Phase 1+ files with a legacy slice) or a bare v2 model object.
      const v2Slice = (parsed.v2 && typeof parsed.v2 === 'object') ? parsed.v2 : parsed;
      return v2.io.modelFromJSON(v2Slice);
    }
    return (typeof v2.model.makeModel === 'function')
      ? v2.model.makeModel()
      : null;
  }

  /**
   * Assign the new model to appState and emit dirtyBus. Pure-ish — the only
   * side effects are the two namespaced writes Phase 0d already documents.
   */
  function publish(model, trigger) {
    if (v2.appState) v2.appState.model = model;
    if (v2.engine && v2.engine.dirtyBus &&
        typeof v2.engine.dirtyBus.emit === 'function') {
      v2.engine.dirtyBus.emit('model-changed', {
        model: model, source: 'v2.io.load', trigger: trigger || null,
      });
    }
    return model;
  }

  /**
   * Convenience: fromParsed + publish to appState/dirtyBus.
   * @param {object} parsed
   * @param {object} [opts]   opts.trigger sets the dirtyBus trigger label
   * @returns {StructuralModel}
   */
  function applyToShadow(parsed, opts) {
    const model = fromParsed(parsed, opts);
    return publish(model, (opts && opts.trigger) || 'applyToShadow');
  }

  // --- the v1 file-load integration point -----------------------------------

  /**
   * Called by `js/46-save-load.js`'s `loadProject` and `js/50-project.js`'s
   * `importProject` at the END of their FileReader onload callbacks, AFTER the
   * v1 globals have been repopulated. Re-migrates the live v1 state into the
   * v2 shadow. Idempotent — calling it twice in a row is safe (the second call
   * just produces the same model again).
   *
   * Three resolution paths in order of preference:
   *   1. The Phase-0d bridge is installed -> delegate to bridge.syncFromV1
   *      (which emits dirtyBus with source 'v1-bridge', matching every other
   *      bridge sync).
   *   2. The bridge is loaded but NOT installed (a test harness or a partially-
   *      wired browser) -> bridge.readV1State() gives us a clean read of the
   *      v1 stores; migrate that and publish ourselves.
   *   3. Neither -> the migrator alone, on bare globals via `typeof` guards.
   *
   * @param {?string} trigger
   * @returns {?StructuralModel}
   */
  function afterV1Load(trigger) {
    trigger = trigger || 'afterV1Load';
    // Path 1 — fully installed bridge.
    if (v2.engine && v2.engine.v1Bridge &&
        v2.engine.v1Bridge.installed &&
        typeof v2.engine.v1Bridge.syncFromV1 === 'function') {
      try { return v2.engine.v1Bridge.syncFromV1(trigger); }
      catch (e) {
        if (window.console && console.error) {
          console.error('[v2.io.load] bridge sync failed (' + trigger + '):', e);
        }
        // Fall through to path 2/3 — never let the file load break the shadow.
      }
    }
    // Path 2 — bridge present but not installed: borrow its state reader.
    let state;
    if (v2.engine && v2.engine.v1Bridge &&
        typeof v2.engine.v1Bridge.readV1State === 'function') {
      try { state = v2.engine.v1Bridge.readV1State(); } catch (e) { state = null; }
    }
    // Path 3 — bare-globals fallback.
    if (!state) state = readBareV1State();
    if (!v2.io.migrations || typeof v2.io.migrations.v1ToV2 !== 'function') return null;
    const model = v2.io.migrations.v1ToV2(state);
    return publish(model, trigger);
  }

  /** A `typeof`-guarded read of the v1 stores — mirrors v1-bridge.readV1State. */
  function readBareV1State() {
    const objs = (typeof objects3D  !== 'undefined') ? objects3D  : undefined;
    const ents = (typeof entities2D !== 'undefined') ? entities2D : undefined;
    const blks = (typeof blocks     !== 'undefined') ? blocks     : undefined;
    return {
      objects3D:  Array.isArray(objs) ? objs : [],
      entities2D: (ents && typeof ents === 'object') ? ents : {},
      blocks:     Array.isArray(blks) ? blks : [],
    };
  }

  // --- File -> text (browser-only, async) -----------------------------------

  /**
   * Read a Blob / File as UTF-8 text. The promise resolves with the text and
   * rejects on read error. Used by the v1 file-load wrappers in Phase 1+; this
   * file does NOT call it itself in Phase 0e (the v1 path still owns the
   * FileReader and just calls `afterV1Load` at the end of its onload).
   * @param {Blob|File} file
   * @returns {Promise<string>}
   */
  function readFileAsText(file) {
    return new Promise(function (resolve, reject) {
      if (!file || typeof FileReader !== 'function') {
        reject(new Error('v2.io.load.readFileAsText: a Blob/File and FileReader are required'));
        return;
      }
      const reader = new FileReader();
      reader.onload  = function () { resolve(reader.result); };
      reader.onerror = function () { reject(reader.error || new Error('FileReader error')); };
      reader.readAsText(file);
    });
  }

  v2.io.load = {
    detectSchemaVersion: detectSchemaVersion,
    fromParsed:          fromParsed,
    applyToShadow:       applyToShadow,
    afterV1Load:         afterV1Load,
    readFileAsText:      readFileAsText,
  };
})();
