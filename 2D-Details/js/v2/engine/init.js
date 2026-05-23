/**
 * StructDraw v2 · Engine Layer · bootstrap
 * LAYER: engine — wires every Phase-1 v2 surface to the running app on
 *        DOMContentLoaded. The LAST v2 script loaded.
 * READS:  document.readyState; window.v2.engine.{v1Bridge, eventDispatch,
 *           autosave}; window.v2.ui.{paletteBBRail, liveRender};
 *           window.canvas (v1 global, `typeof`-guarded)
 * WRITES: window.v2.engine.boot; (a DOMContentLoaded listener)
 *
 * Classic <script>, no build step (CLAUDE.md rules 3 & 8). The Phase 0d
 * scaffold had ONE deferred side effect (install the v1 -> v2 shadow bridge);
 * Phase 1 extends boot() with the additional install calls every later phase
 * inherits. EVERY install() is idempotent so re-running boot() (e.g. via the
 * DevTools console) is a safe no-op.
 *
 * --- BOOT ORDER ON DOMContentLoaded ---------------------------------------
 *   1. v1 bridge — keeps the v2 shadow in sync with v1.
 *   2. event dispatch — binds pointer/key listeners to v1's canvas. Listens
 *      in CAPTURE phase so v2 sees events before v1 and can claim them.
 *   3. BB-rail Plate tile activator — registers `v2.ui.paletteBBRail.activatePlate`
 *      which the v26 BB-rail tile in `js/74-v26-bb-rail.js` calls directly.
 *      Phase 2 retired the v1 `v25SetPlate` wrap; activation is unconditional.
 *   4. live-render shim — wraps drawBlockContent + v3dRebuildScene so v2
 *      plates render on the user-facing canvas + iso block. Unconditional
 *      after Phase 2 retired the `useV2For.plates` flag.
 *   5. autosave — debounced localStorage persistence + title dirty indicator.
 *
 * Browser: index.html loads every v1 + v2 <script> before DOMContentLoaded,
 * so this listener fires exactly once, AFTER v1's own DOMContentLoaded
 * bootstrap (js/73-init.js) — v1 finishes initialising (incl. its demo
 * objects + canvas listeners), then the v2 layers attach.
 *
 * JSDOM test harness: DOMContentLoaded has already fired by the time
 * tests/v2/setup.mjs evaluates this file, so the listener never runs — the
 * test files invoke boot() (or individual installs) themselves. Either way:
 * no double-install, and loading this file under test has no effect on
 * window.v2 beyond defining v2.engine.boot.
 * See PlannedBuilds/architecture-v2/07-migration-strategy.md §1 and
 *     PlannedBuilds/architecture-v2/09-build-plan.md "Phase 1".
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.engine = v2.engine || {};

  /** Install every v2 boot surface that is loaded. Idempotent. */
  function boot() {
    // Phase 0d — install the v1 shadow bridge (no-op when already installed).
    const bridge = v2.engine && v2.engine.v1Bridge;
    if (bridge && !bridge.installed && typeof bridge.install === 'function') {
      try { bridge.install(); } catch (e) { warn('v1Bridge.install', e); }
    }

    // Phase 1 — event-dispatch onto v1's canvas (typeof-guarded for JSDOM).
    if (v2.engine.eventDispatch && typeof v2.engine.eventDispatch.install === 'function' &&
        !v2.engine.eventDispatch.handle.installed) {
      try {
        const canvasEl = (typeof canvas !== 'undefined') ? canvas
          : (typeof document !== 'undefined' ? document.getElementById('mainCanvas') : null);
        if (canvasEl) v2.engine.eventDispatch.install(canvasEl);
      } catch (e) { warn('eventDispatch.install', e); }
    }

    // Phase 1+2 — BB-rail Plate tile activator. Phase 2 turned this into a
    // no-op install() — the activator function is published unconditionally
    // when palette-bb-rail.js loads; the v26 BB-rail tile in
    // js/74-v26-bb-rail.js calls it directly. Kept here for parity with the
    // other v2 surfaces (and so a future install hook can attach without
    // changing boot() shape).
    if (v2.ui && v2.ui.paletteBBRail && typeof v2.ui.paletteBBRail.install === 'function') {
      try { v2.ui.paletteBBRail.install(); } catch (e) { warn('paletteBBRail.install', e); }
    }

    // Phase 1 — live-render shim. Wraps drawBlockContent + v3dRebuildScene so
    // v2 plates render on the user-facing canvas + iso block.
    if (v2.ui && v2.ui.liveRender && typeof v2.ui.liveRender.install === 'function') {
      try { v2.ui.liveRender.install(); } catch (e) { warn('liveRender.install', e); }
    }

    // Phase 1 — autosave. Phase-1 default cadence; tests pass their own opts.
    if (v2.engine.autosave && typeof v2.engine.autosave.install === 'function' &&
        !v2.engine.autosave.state.installed) {
      try { v2.engine.autosave.install(); } catch (e) { warn('autosave.install', e); }
    }

    // Stamp the BUILD descriptor as the LAST thing boot() does, so it can't
    // be silently overwritten by any later top-level eval (e.g. the threejs
    // renderer's own stamp at load time).
    stampBuild();
  }

  function warn(label, err) {
    if (window.console && console.warn) console.warn('[v2.engine.boot] ' + label + ' threw:', err);
  }

  function stampBuild() {
    if (!v2.BUILD) return;
    v2.BUILD.phase = '3';
    const layers = v2.BUILD.layers;
    if (Array.isArray(layers)) {
      if (layers.indexOf('io') === -1)            layers.push('io');
      if (layers.indexOf('engine') === -1)        layers.push('engine');
      if (layers.indexOf('tools') === -1)         layers.push('tools');
      if (layers.indexOf('ui') === -1)            layers.push('ui');
      if (layers.indexOf('feature-flags') === -1) layers.push('feature-flags');
    }
    v2.BUILD.note =
      'Phase 3 introduces v2 bolt support alongside v1. useV2For.bolts feature ' +
      'flag added (default OFF); js/v2/tools/place-bolt-tool.js + ' +
      'js/v2/ui/inspector-bolt.js are new; v1-bridge graft captures v2 bolts ' +
      'when the flag is on; live-render shim paints v2 bolts on the canvas + ' +
      'iso block; v26 BB-rail Bolt tile routes to v2.ui.paletteBBRail.activateBolt ' +
      'when the flag is on, falls through to v1 selectMemberByBolt when off. ' +
      'Phase 2 plate retirement carries forward unchanged.';
  }

  v2.engine.boot = boot;

  // Register for the browser path. If DOMContentLoaded has already fired
  // (the test harness), the listener simply never runs — by design.
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('DOMContentLoaded', boot);
  }
})();
