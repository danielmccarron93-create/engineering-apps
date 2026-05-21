/**
 * StructDraw v2 · Engine Layer · bootstrap
 * LAYER: engine — installs the v1 -> v2 bridge once the page is ready. The
 *        LAST v2 script loaded.
 * READS:  document.readyState; window.v2.engine.v1Bridge
 * WRITES: window.v2.engine.boot; (a DOMContentLoaded listener)
 *
 * Classic <script>, no build step (CLAUDE.md rules 3 & 8). This is the one v2
 * file with a deliberate deferred side effect: it registers a
 * DOMContentLoaded listener that installs the shadow bridge.
 *
 * Browser: index.html loads every v1 + v2 <script> before DOMContentLoaded, so
 * this listener fires exactly once, AFTER v1's own DOMContentLoaded bootstrap
 * (js/73-init.js) — v1 finishes initialising (incl. its demo objects), then
 * the v2 shadow attaches and takes its first snapshot.
 *
 * JSDOM test harness: DOMContentLoaded has already fired by the time
 * tests/v2/setup.mjs evaluates this file, so the listener never runs — the
 * test files install the bridge themselves. Either way: no double-install,
 * and loading this file under test has no effect on window.v2 beyond defining
 * v2.engine.boot.
 * See 07-migration-strategy.md §1 and 09-build-plan.md Phase 0d.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.engine = v2.engine || {};

  /** Install the v1 bridge, unless it is already installed. */
  function boot() {
    const bridge = v2.engine && v2.engine.v1Bridge;
    if (bridge && !bridge.installed && typeof bridge.install === 'function') {
      bridge.install();
    }
  }

  v2.engine.boot = boot;

  // Register for the browser path. If DOMContentLoaded has already fired
  // (the test harness), the listener simply never runs — by design.
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('DOMContentLoaded', boot);
  }

  // Keep the build stamp truthful as the engine layer comes online.
  if (v2.BUILD) {
    v2.BUILD.phase = '0e';
    const layers = v2.BUILD.layers;
    if (Array.isArray(layers)) {
      if (layers.indexOf('io') === -1) layers.push('io');
      if (layers.indexOf('engine') === -1) layers.push('engine');
    }
    v2.BUILD.note =
      'Model + transactions + catalogue + io (serialise/deserialise/save-stub/load) + engine ' +
      '(v1->v2 shadow bridge, with file-load sync wired through v2.io.load.afterV1Load). ' +
      'v1 remains authoritative for the running app.';
  }
})();
