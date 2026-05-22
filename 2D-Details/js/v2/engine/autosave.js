/**
 * StructDraw v2 · Engine Layer · autosave
 * LAYER: engine — debounced localStorage autosave of the v2 model + title-bar
 *        dirty indicator. Activated by `v2.engine.autosave.install(opts)`
 *        (the boot script calls this on DOMContentLoaded when running in the
 *        browser). In the JSDOM test harness `install` is a no-op unless the
 *        test opts in — autosave is a side-effecting layer.
 * READS:  window.v2.io.{save.saveModelToString, serialise};
 *           window.v2.appState; window.v2.engine.dirtyBus
 * WRITES: window.v2.engine.autosave
 *
 * Classic <script>, no build step (CLAUDE.md rules 3 & 8). Loading this file
 * defines the namespace; install() is what attaches the polling loop and the
 * title-bar update. The autosave key is namespaced per project id so multiple
 * sheets don't trample each other.
 *
 * SHIPS THE v2 SLICE ONLY — Phase 1's autosave writes the v2 model JSON. A
 * full v1+v2 round-trip lives in v1's `js/46-save-load.js` save path (which
 * will be extended in Phase 2 to embed the v2 slice). The autosave is for
 * crash recovery; explicit Save still goes through v1's UI.
 * See PlannedBuilds/architecture-v2/06-tools-and-transactions.md §6 and
 *     PlannedBuilds/architecture-v2/09-build-plan.md "Phase 1" exit criterion.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.engine = v2.engine || {};

  const DEFAULTS = Object.freeze({
    pollMs: 1500,
    debounceMs: 800,
    storagePrefix: 'structdraw_v2_autosave_',
    titlePrefix: 'StructDraw',
  });

  const state = {
    installed: false,
    dirty: false,
    lastSavedAt: 0,
    lastDirtyAt: 0,
    pollHandle: null,
    pollMs: DEFAULTS.pollMs,
    debounceMs: DEFAULTS.debounceMs,
    storagePrefix: DEFAULTS.storagePrefix,
    titlePrefix: DEFAULTS.titlePrefix,
    storage: null,                  // injectable for tests
    documentRef: null,              // injectable for tests
    titleBaseline: null,            // remembered on install
  };

  function projectId() {
    const m = (v2.appState && v2.appState.model) || null;
    const p = m && m.project;
    return (p && typeof p.id === 'string' && p.id.length) ? p.id : 'untitled';
  }

  function storageKey() { return state.storagePrefix + projectId(); }

  function updateTitleIndicator() {
    const doc = state.documentRef || (typeof document !== 'undefined' ? document : null);
    if (!doc) return;
    if (state.titleBaseline == null) state.titleBaseline = doc.title || state.titlePrefix;
    const base = state.titleBaseline;
    const next = state.dirty ? ('● ' + base) : base;
    if (doc.title !== next) doc.title = next;
  }

  /** Mark the model dirty. Called by undoStack on every apply/undo/redo. */
  function markDirty() {
    state.dirty = true;
    state.lastDirtyAt = Date.now();
    updateTitleIndicator();
  }

  /** Force a save immediately (regardless of debounce). Returns the JSON. */
  function flush() {
    const model = v2.appState && v2.appState.model;
    if (!model) return null;
    const json = (v2.io && v2.io.save && typeof v2.io.save.saveModelToString === 'function')
      ? v2.io.save.saveModelToString(model)
      : ((v2.io && typeof v2.io.modelToString === 'function')
          ? v2.io.modelToString(model)
          : JSON.stringify(model));
    try {
      const store = state.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
      if (store) store.setItem(storageKey(), json);
    } catch (e) {
      if (window.console && console.warn) {
        console.warn('[v2.engine.autosave] localStorage write failed:', e);
      }
    }
    state.lastSavedAt = Date.now();
    state.dirty = false;
    updateTitleIndicator();
    return json;
  }

  /**
   * Debounced tick — called from the poll. Saves only when (a) the model has
   * been marked dirty AND (b) `debounceMs` has elapsed since the last dirty
   * event (so a flurry of edits collapses to one save).
   */
  function tick() {
    if (!state.dirty) return;
    if (Date.now() - state.lastDirtyAt < state.debounceMs) return;
    flush();
  }

  /**
   * Read the most recently autosaved payload back into a v2 model. Pure-ish —
   * mutates v2.appState.model on success. Returns the model (or null when
   * nothing has been autosaved yet).
   */
  function restore() {
    const store = state.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!store) return null;
    let text;
    try { text = store.getItem(storageKey()); } catch (e) { return null; }
    if (!text) return null;
    let parsed;
    try { parsed = JSON.parse(text); } catch (e) { return null; }
    if (v2.io && v2.io.load && typeof v2.io.load.fromParsed === 'function') {
      const model = v2.io.load.fromParsed(parsed);
      if (model && v2.appState) v2.appState.model = model;
      return model || null;
    }
    return null;
  }

  /**
   * Mount the poll loop + the title indicator. Idempotent.
   * @param {object} [opts]
   * @param {number} [opts.pollMs]
   * @param {number} [opts.debounceMs]
   * @param {string} [opts.storagePrefix]
   * @param {string} [opts.titlePrefix]
   * @param {object} [opts.storage]      injectable (tests)
   * @param {object} [opts.documentRef]  injectable (tests)
   */
  function install(opts) {
    if (state.installed) return;
    opts = opts || {};
    if (typeof opts.pollMs === 'number')     state.pollMs = opts.pollMs;
    if (typeof opts.debounceMs === 'number') state.debounceMs = opts.debounceMs;
    if (typeof opts.storagePrefix === 'string') state.storagePrefix = opts.storagePrefix;
    if (typeof opts.titlePrefix === 'string')   state.titlePrefix   = opts.titlePrefix;
    if (opts.storage)     state.storage     = opts.storage;
    if (opts.documentRef) state.documentRef = opts.documentRef;
    state.installed = true;
    state.lastSavedAt = Date.now();
    updateTitleIndicator();
    state.pollHandle = (typeof setInterval !== 'undefined')
      ? setInterval(tick, state.pollMs) : null;
  }

  /** Tear down the poll loop. Idempotent. */
  function uninstall() {
    if (!state.installed) return;
    if (state.pollHandle && typeof clearInterval !== 'undefined') {
      clearInterval(state.pollHandle);
    }
    state.pollHandle = null;
    state.installed = false;
  }

  v2.engine.autosave = {
    state: state,
    install:   install,
    uninstall: uninstall,
    markDirty: markDirty,
    flush:     flush,
    restore:   restore,
    tick:      tick,
    storageKey: storageKey,
  };
})();
