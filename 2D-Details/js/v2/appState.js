/**
 * StructDraw v2 · app-state singleton
 * LAYER: engine — the single v2 application-state object. It holds the v2
 *        StructuralModel plus the (still-empty) UI / tool / dialog / wizard
 *        slots that later phases fill. The Phase 0d v1-bridge keeps `.model`
 *        in sync with v1 state; nothing else writes it yet.
 * READS:  window.v2.model.makeModel
 * WRITES: window.v2.appState
 *
 * Classic <script>, no build step (CLAUDE.md rules 3 & 8). Loading this file
 * only creates the singleton (seeded with an empty model); it has no side
 * effect on the running app. v1 stays authoritative — `v2.appState.model` is
 * the SHADOW model, read by tests and (later) the v2 renderer, never by v1.
 *
 * This is the v2 answer to v1's scattered top-level globals (CLAUDE.md "Known
 * issues" #4: "All mutable globals are top-level ... lift into a single
 * appState object"). In v2 every mutable app-state slice hangs off here.
 * See 07-migration-strategy.md §1 and 09-build-plan.md Phase 0d.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});

  /** Build the initial app-state. `model` is an empty v2 StructuralModel. */
  function freshState() {
    return {
      // The v2 shadow model. Replaced wholesale by the v1-bridge on each sync
      // (Phase 0d); mutated via transactions once v2 is authoritative (Phase 1+).
      model: (v2.model && typeof v2.model.makeModel === 'function')
        ? v2.model.makeModel()
        : null,
      // Slots reserved for later phases — kept present (empty) so consumers can
      // always reach `v2.appState.ui` etc. without a guard.
      ui: {},        // panels, palettes, selection, viewport — Phase 1+
      tools: {},     // active tool + tool registry state — Phase 1+
      dialogs: {},   // open modal dialogs — Phase 1+
      wizards: {},   // connection-wizard state — Phase 11
    };
  }

  const appState = v2.appState || freshState();

  /**
   * Reset the singleton to a fresh empty state (used by tests for isolation).
   * Mutates the existing object in place so any held reference stays valid.
   */
  appState.reset = function reset() {
    const fresh = freshState();
    appState.model = fresh.model;
    appState.ui = fresh.ui;
    appState.tools = fresh.tools;
    appState.dialogs = fresh.dialogs;
    appState.wizards = fresh.wizards;
    return appState;
  };

  v2.appState = appState;
})();
