/**
 * StructDraw v2 · UI · BB-rail Plate tile activator
 * LAYER: ui — exposes `v2.ui.paletteBBRail.activatePlate(aspect)`, the function
 *        the v26 BB-rail's Plate tile calls in 2D mode. Activates the v2
 *        PlacePlateTool and seeds the appState.ui slots the tool consults.
 * READS:  v2.appState; v2.engine.setActiveTool
 * WRITES: v2.ui.paletteBBRail
 *
 * Classic <script>, no build step (CLAUDE.md rules 3 & 8). Loading this file
 * only defines the namespace; the activation side effects happen when the
 * BB-rail tile fires `activatePlate(aspect)`.
 *
 * --- HISTORY ---------------------------------------------------------------
 * Phase 1 wrapped v1's `window.v25SetPlate` so the BB-rail tile (in
 * `js/74-v26-bb-rail.js`) — which called `v25SetPlate()` — routed to the v2
 * tool when the `useV2For.plates` flag was on, otherwise passed through to v1.
 * Phase 2 retired the v1 plate path entirely: `js/76-v25-plate.js` is deleted,
 * the flag is gone, and the BB-rail tile now calls this module directly. No
 * more wrapping, no more flag-off fall-through.
 * See PlannedBuilds/architecture-v2/09-build-plan.md "Phase 2".
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.ui = v2.ui || {};

  /**
   * Activate the v2 PlacePlateTool. The BB-rail Plate tile calls this in
   * 2D mode; 3D mode still routes to the legacy `setTool('draw-plate')`
   * for `objects3D` plates (Phase 4+ territory).
   * @param {string} [aspect]  'elev' | 'sec' — stashed on appState.ui so a
   *                            future v2 sec-cleat mode can read it. Phase 2's
   *                            tool renders elevation only; the field is kept
   *                            for forward-compat with v1 callers.
   */
  function activatePlate(aspect) {
    if (v2.appState) {
      if (!v2.appState.ui) v2.appState.ui = {};
      v2.appState.ui.activePlateAspect = (aspect === 'sec' || aspect === 'elev')
        ? aspect : (v2.appState.ui.activePlateAspect || 'elev');
      v2.appState.ui.activeFamily = v2.appState.ui.activePlateFamily || 'plate-flat';
      v2.appState.ui.activeType   = v2.appState.ui.activePlateType   || 'PL10';
    }
    if (v2.engine && typeof v2.engine.setActiveTool === 'function') {
      v2.engine.setActiveTool('place-plate');
    }
  }

  /** Phase 1 left install/uninstall hooks on this module. Phase 2 keeps them
   *  as no-ops for parity with the other v2 surfaces `engine/init.js` boots —
   *  there is no longer any v1 function to wrap. */
  function install() { return true; }
  function uninstall() { /* no-op */ }

  v2.ui.paletteBBRail = {
    install:        install,
    uninstall:      uninstall,
    activatePlate:  activatePlate,
    installed:      function () { return true; },
  };
})();
