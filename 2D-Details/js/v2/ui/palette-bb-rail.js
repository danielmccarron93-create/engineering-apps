/**
 * StructDraw v2 · UI · BB-rail tile activators (plate + bolt)
 * LAYER: ui — exposes the v26 BB-rail's per-tile activators in 2D mode:
 *          - `v2.ui.paletteBBRail.activatePlate(aspect)` — Phase 2, unconditional
 *          - `v2.ui.paletteBBRail.activateBolt(opts)`    — Phase 3, flag-gated
 *        Each activator seeds the appState.ui slots the corresponding tool
 *        consults, then asks the engine to switch to that tool.
 * READS:  v2.appState; v2.featureFlags.get('bolts'); v2.engine.setActiveTool
 * WRITES: v2.ui.paletteBBRail
 *
 * Classic <script>, no build step (CLAUDE.md rules 3 & 8). Loading this file
 * only defines the namespace; the activation side effects happen when the
 * BB-rail tile fires `activatePlate(...)` / `activateBolt(...)`.
 *
 * --- HISTORY ---------------------------------------------------------------
 * Phase 1 wrapped v1's `window.v25SetPlate` so the BB-rail tile (in
 * `js/74-v26-bb-rail.js`) — which called `v25SetPlate()` — routed to the v2
 * tool when the `useV2For.plates` flag was on, otherwise passed through to v1.
 * Phase 2 retired the v1 plate path entirely: `js/76-v25-plate.js` is deleted,
 * the flag is gone, and the BB-rail tile now calls activatePlate directly. No
 * more wrapping, no more flag-off fall-through.
 *
 * Phase 3 adds the BOLT activator alongside the plate activator. Unlike
 * Phase 2's unconditional plate path, `activateBolt` is GATED on the
 * `useV2For.bolts` feature flag and falls back to v1's `selectMemberByBolt`
 * when the flag is off — so until Dan flips the flag, the running app is
 * byte-identical to today. The BB-rail tile in `js/74-v26-bb-rail.js`
 * inverts the gate: it calls `activateBolt()` when the flag is on and
 * `selectMemberByBolt()` directly when the flag is off. Either entry leaves
 * the activator a clean target for the Phase 3 retirement chat to point at
 * unconditionally once the v1 bolt path is deleted.
 * See PlannedBuilds/architecture-v2/09-build-plan.md "Phase 3".
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
      const ui = v2.appState.ui;
      ui.activePlateAspect = (aspect === 'sec' || aspect === 'elev')
        ? aspect : (ui.activePlateAspect || 'elev');
      ui.activePlateFamily = ui.activePlateFamily || 'plate-flat';
      // Fix G (2026-05-23): default thickness is PL12 (12 mm) — matches AS/NZS
      // 3678 typical detailing minimum for Bligh Tanner connection work.
      ui.activePlateType   = ui.activePlateType   || 'PL12';
      // Fix H (2026-05-23): default orientation is 'vertical' (free-draw face).
      ui.activePlateOrientation = (ui.activePlateOrientation === 'horizontal')
        ? 'horizontal' : 'vertical';
      // Mirror activePlate* into the generic active* slots so the catalogue
      // lookups in place-plate-tool see the same defaults.
      ui.activeFamily = ui.activePlateFamily;
      ui.activeType   = ui.activePlateType;
    }
    if (v2.engine && typeof v2.engine.setActiveTool === 'function') {
      v2.engine.setActiveTool('place-plate');
    }
  }

  /**
   * Activate the v2 PlaceBoltTool. The v26 BB-rail Bolt tile calls this in
   * 2D mode WHEN the `useV2For.bolts` feature flag is on; when the flag is off
   * the tile calls v1's `selectMemberByBolt` directly. The activator does NOT
   * check the flag — it is the caller's job — so a test or DevTools poke can
   * activate the v2 tool regardless of flag state.
   * @param {?{size?:string, grade?:string, aspect?:string, rot?:number}} opts
   */
  function activateBolt(opts) {
    opts = opts || {};
    if (v2.appState) {
      if (!v2.appState.ui) v2.appState.ui = {};
      const ui = v2.appState.ui;
      ui.activeBoltFamily = ui.activeBoltFamily || 'as1252-bolt';
      ui.activeBoltType   = (typeof opts.size  === 'string' && opts.size)  || ui.activeBoltType  || 'M20';
      ui.activeBoltGrade  = (typeof opts.grade === 'string' && opts.grade) || ui.activeBoltGrade || '8.8';
      ui.activeBoltAspect = (opts.aspect === 'elev' || opts.aspect === 'sec')
        ? opts.aspect : (ui.activeBoltAspect || 'sec');
      ui.activeBoltRot    = (typeof opts.rot === 'number' && isFinite(opts.rot))
        ? opts.rot : (typeof ui.activeBoltRot === 'number' ? ui.activeBoltRot : 0);
    }
    if (v2.engine && typeof v2.engine.setActiveTool === 'function') {
      v2.engine.setActiveTool('place-bolt');
    }
  }

  /** Fix D (2026-05-23): install() now subscribes to v2's `tool-changed`
   *  dirtyBus event so v1's quick-options bar AND v1's status bar refresh
   *  whenever a v2 tool becomes active or deactivates. Without this the
   *  Mode chip (Rect/Poly) wouldn't appear when the user clicks the Plate
   *  tile, and the v2 statusText wouldn't reach the status bar.
   *  Idempotent — second install call is a no-op. */
  let installedFlag = false;
  let toolChangedOff = null;
  function install() {
    if (installedFlag) return true;
    installedFlag = true;
    if (v2.engine && v2.engine.dirtyBus && typeof v2.engine.dirtyBus.on === 'function') {
      toolChangedOff = v2.engine.dirtyBus.on('tool-changed', function () {
        if (typeof window.v25UpdateOptionsBar === 'function') {
          try { window.v25UpdateOptionsBar(); } catch (e) {
            if (window.console && console.error) {
              console.error('[v2.ui.paletteBBRail] v25UpdateOptionsBar threw:', e);
            }
          }
        }
        if (typeof window.updateStatus === 'function') {
          try { window.updateStatus(); } catch (e) { /* status update is decorative */ }
        }
      });
    }
    return true;
  }
  function uninstall() {
    if (typeof toolChangedOff === 'function') {
      try { toolChangedOff(); } catch (e) { /* unsubscribe failed; harmless */ }
      toolChangedOff = null;
    }
    installedFlag = false;
  }

  v2.ui.paletteBBRail = {
    install:        install,
    uninstall:      uninstall,
    activatePlate:  activatePlate,
    activateBolt:   activateBolt,
    installed:      function () { return true; },
  };
})();
