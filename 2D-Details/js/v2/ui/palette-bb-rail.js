/**
 * StructDraw v2 · UI · BB-rail Plate tile wrapper
 * LAYER: ui — when `v2.featureFlags.useV2For.plates` is on, the BB-rail's
 *        Plate tile activates the v2 PlacePlateTool instead of v1's
 *        v25SetPlate. When off, the tile behaves exactly as today.
 * READS:  window.v25SetPlate; v2.featureFlags.useV2For.plates;
 *           v2.engine.setActiveTool; v2.tools.PlacePlateTool;
 *           v2.engine.dirtyBus (subscribes to 'feature-flags-changed')
 * WRITES: window.v25SetPlate (wrapped — original captured for fall-through);
 *           v2.ui.paletteBBRail
 *
 * Classic <script>, no build step (CLAUDE.md rules 3 & 8). Loading this file
 * defines the namespace and the install() function; install() does the wrap.
 * `v2.engine.init.js` calls install() on DOMContentLoaded (after v1's
 * `js/74-v26-bb-rail.js` and v1's `js/76-v25-plate.js` have published their
 * globals).
 *
 * --- Why we wrap rather than register a parallel tile ---------------------
 * The build plan's Files-touched table for Phase 1 lists "ui/palette-bb-rail.js
 * — Register a Plate tile in the v2 BB-rail." Per Q11 (the v2 BB-rail
 * relationship to v1 is "phased replacement"), Phase 1 doesn't ship a
 * standalone v2 BB-rail yet — the v1 rail stays. The minimum-impact pilot
 * intercepts v1's Plate tile click via `v25SetPlate`. Phase 2 retires v1's
 * tile; Phase 11+ stands up the standalone v2 BB-rail and removes this wrap.
 *
 * NON-INTERFERENCE GUARANTEE: with the flag off, the wrapper calls through
 * to the original `v25SetPlate` and returns its result unchanged.
 * See PlannedBuilds/architecture-v2/08-pilot-feature.md §4.6 (UI additions)
 *     and 09-build-plan.md "Phase 1" Files-touched table.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.ui = v2.ui || {};

  /** Captured original — set by install() on first call. */
  let originalV25SetPlate = null;
  let installed = false;

  /**
   * The tile-click replacement. Decides between v2 (flag on) and v1
   * (flag off, or v2 layers not yet loaded).
   * @param {string} [aspect]  'elev' | 'sec' — preserved so the flag-off
   *                            path is byte-identical to today.
   */
  function v25SetPlateRouted(aspect) {
    const flag = v2.featureFlags && typeof v2.featureFlags.get === 'function'
      ? v2.featureFlags.get('plates') : false;
    if (!flag) {
      // Fall through to v1's behaviour, unmodified.
      if (typeof originalV25SetPlate === 'function') return originalV25SetPlate(aspect);
      return undefined;
    }
    // v2 path: activate the place-plate tool. The aspect argument is left for
    // a future v2 sec-cleat mode; Phase 1's rectangle + polygon both render in
    // elevation. We stash the requested aspect on appState.ui for diagnostics
    // so a future cleat mode can read it without changing the wrapper shape.
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
    return undefined;
  }

  /**
   * Wrap window.v25SetPlate (idempotent). Returns true when the wrap was
   * applied (the global was present and not already wrapped); false otherwise.
   */
  function install() {
    if (installed) return true;
    if (typeof window === 'undefined') return false;
    const current = window.v25SetPlate;
    if (typeof current !== 'function') return false;
    if (current._v2Wrapped) return false;
    originalV25SetPlate = current;
    v25SetPlateRouted._v2Wrapped = true;
    v25SetPlateRouted._v2Original = current;
    window.v25SetPlate = v25SetPlateRouted;
    installed = true;
    return true;
  }

  /** Restore the original v25SetPlate. Idempotent. */
  function uninstall() {
    if (!installed) return;
    if (typeof window !== 'undefined' && typeof originalV25SetPlate === 'function' &&
        window.v25SetPlate === v25SetPlateRouted) {
      window.v25SetPlate = originalV25SetPlate;
    }
    installed = false;
  }

  /**
   * On flag flip back to false, deactivate the v2 tool so v1 can own the
   * canvas cleanly again. (The flag-off branch above already passes through
   * to v1, but a stale "active v2 tool" would still intercept pointer events
   * via the dispatcher — clearing it returns the canvas to v1.)
   */
  function onFlagFlip(payload) {
    if (!payload || payload.key !== 'plates') return;
    if (!payload.value && v2.engine && typeof v2.engine.setActiveTool === 'function') {
      const active = v2.engine.activeTool && v2.engine.activeTool();
      if (active && active.id === 'place-plate') v2.engine.setActiveTool(null);
    }
  }

  /** Subscribe to dirty-bus 'feature-flags-changed' once at install time. */
  let unsubscribeFlag = null;
  function subscribeFlagBus() {
    if (unsubscribeFlag) return;
    if (!v2.engine || !v2.engine.dirtyBus || typeof v2.engine.dirtyBus.on !== 'function') return;
    unsubscribeFlag = v2.engine.dirtyBus.on('feature-flags-changed', onFlagFlip);
  }

  v2.ui.paletteBBRail = {
    install: function () { subscribeFlagBus(); return install(); },
    uninstall: uninstall,
    routed: v25SetPlateRouted,
    installed: function () { return installed; },
  };
})();
