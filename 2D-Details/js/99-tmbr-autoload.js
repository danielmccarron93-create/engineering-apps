'use strict';

// Timber-screw connection feature — autoload + visible UI hook.
// Added 2026-05-18. Makes the feature discoverable when you open index.html
// without typing console commands. Loads LAST in the script order (number 99)
// so every dependency the autoload calls into has already been defined.
//
// Behaviour:
//   1. On window 'load' (after DOMContentLoaded init completes), if the
//      entities2D bucket has no Connection yet AND the demo 3D objects from
//      73-init.js are still untouched, clear those demo objects, switch the
//      active sheet to 2D paper-space mode (the natural home for a connection
//      detail), build the Test 1 fixture, run the rule engine, fit-to-view,
//      and print a console banner with quick-reference commands.
//   2. Inject a floating "🔩 Load timber-screw example" button into the
//      top-right of the canvas container. Clicking it re-runs step 1
//      (after clearing any existing example).
//
// Gated on TMBR_AUTOLOAD_EXAMPLE — set to false in a v1 release build that
// wants the feature available but not auto-fired. The flag is declared with
// `let` so a console tweak works for the current session.


// Default OFF (2026-06-03): the autoload demo + floating button is the
// "make it visible" anti-pattern CLAUDE.md bans; the real discoverable surface is
// the HBS-screw tile in the V26 BB-rail Draw tab. The script tag is also commented
// out in index.html, so this file does not load in the running app.
let TMBR_AUTOLOAD_EXAMPLE = false;


// ============================================================
// PUBLIC API — re-buildable from the UI button or the console
// ============================================================

function tmbrLoadExample(opts) {
  opts = opts || {};
  if (typeof FEATURE_TIMBER_SCREWS !== 'undefined' && !FEATURE_TIMBER_SCREWS) {
    console.warn('[Timber screws] FEATURE_TIMBER_SCREWS is off — turn it on first.');
    return;
  }
  if (typeof tmbrCreateExampleConnection !== 'function') {
    console.error('[Timber screws] tmbrCreateExampleConnection is not defined — the entity / connection scripts did not load.');
    return;
  }

  // Clear any existing timber-screw entities from the elevation bucket so the
  // demo is repeatable. We only clear timber-feature types, not generic
  // entities (the user may have other content drawn).
  if (typeof entities2D === 'object' && entities2D.elevation) {
    entities2D.elevation = entities2D.elevation.filter(function (e) {
      return e.type !== 'timber-member'
          && e.type !== 'steel-plate'
          && e.type !== 'screw'
          && e.type !== 'connection';
    });
  }

  // Also clear the demo 3D objects from 73-init.js — they overlap visually
  // with the connection in elevation view and add noise.
  if (opts.clearDemoObjects !== false && typeof objects3D !== 'undefined') {
    const before = objects3D.length;
    objects3D = objects3D.filter(function (o) {
      // The 73-init.js demo objects are a 360UB beam and a 150x6 SHS column.
      // Keep anything the user has added (anything not matching those exact specs).
      const isDemoUB  = o.type === 'ub'  && o.section === '360UB 50.7' && o.length === 600;
      const isDemoSHS = o.type === 'shs' && o.section === '150x6'      && o.length === 500;
      return !(isDemoUB || isDemoSHS);
    });
    if (before !== objects3D.length && typeof v3dMarkDirty === 'function') v3dMarkDirty();
  }

  // Switch the active sheet to 2D paper-space mode if available. Connection
  // details live in paper space — at 1:10 the 340 mm column is 34 mm wide,
  // legible on screen, and we don't have to fight the 3D projection pipeline.
  if (typeof applySheetMode === 'function' && typeof sheetMode === 'string' && sheetMode !== '2d') {
    applySheetMode('2d', /*silent=*/true);
  }

  // Build the fixture (column + plate + connection + 6 screws all wired up)
  const result = tmbrCreateExampleConnection();

  // Run the rule engine and cache on the Connection
  if (typeof tmbrCheckExampleConnection === 'function') {
    tmbrCheckExampleConnection();
  }

  // Reset undo stack so the demo isn't undoable into the demo-3D state
  if (typeof undoStack !== 'undefined') { undoStack = []; redoStack = []; }

  if (typeof fitToView === 'function') fitToView();
  if (typeof requestRender === 'function') requestRender();

  if (!opts.quiet) _tmbrPrintBanner();
  return result;
}


// ============================================================
// FLOATING BUTTON — visible reload trigger
// ============================================================

function _tmbrInjectButton() {
  if (document.getElementById('tmbr-demo-btn')) return;  // already injected

  const btn = document.createElement('button');
  btn.id = 'tmbr-demo-btn';
  btn.type = 'button';
  btn.innerHTML = '🔩 Timber-screw example';
  btn.title = 'Load the Rothoblaas HBS Plate connection example (Dan worked example)';
  btn.style.cssText = [
    'position: fixed',
    'top: 12px',
    'right: 12px',
    'z-index: 9999',
    'padding: 8px 14px',
    'background: #c44',
    'color: white',
    'border: none',
    'border-radius: 6px',
    'font: 600 13px system-ui, sans-serif',
    'cursor: pointer',
    'box-shadow: 0 2px 6px rgba(0,0,0,0.25)',
    'transition: background 120ms ease'
  ].join('; ');
  btn.addEventListener('mouseenter', function () { btn.style.background = '#a33'; });
  btn.addEventListener('mouseleave', function () { btn.style.background = '#c44'; });
  btn.addEventListener('click', function () {
    tmbrLoadExample();
    btn.blur();
  });
  document.body.appendChild(btn);
}


// ============================================================
// CONSOLE BANNER
// ============================================================

function _tmbrPrintBanner() {
  console.log(
    '%c[Timber screws] Example connection loaded',
    'color: #c44; font: bold 14px sans-serif'
  );
  console.log(
    '%cFixture: GL28h column 340×1220, steel plate 120×900×10, 6× Rothoblaas HBSPL12×200\n' +
    'Load:    25 kN ↓, medium-term, SC1 — checked, η ≈ 0.80 PASS\n' +
    '\n' +
    'Try:\n' +
    '  tmbrCheckExampleConnection()    — re-run the rule engine\n' +
    '  tmbrLoadExample()               — clear and rebuild\n' +
    '  TMBR_AUTOLOAD_EXAMPLE = false   — disable autoload on next refresh\n' +
    '\n' +
    'Tweak the live connection:\n' +
    '  const c = entities2D.elevation.find(e => e.type === "connection");\n' +
    '  tmbrSetLoad(c, {u:1, v:0}, 25);                            // horizontal load\n' +
    '  tmbrSetPreDrilled(c, false);                               // toggle pre-drilling\n' +
    '  c.load.serviceClass = "SC3"; c.checks = null;              // change service class\n' +
    '  tmbrCheckExampleConnection();                              // re-check\n',
    'color: #444; font: 12px monospace'
  );
}


// ============================================================
// BOOTSTRAP
// ============================================================

// 73-init.js runs on 'DOMContentLoaded'; this runs on 'load' (after 'DOMContentLoaded'),
// so by the time we fire, all the existing init has completed.
window.addEventListener('load', function () {
  // Small delay so any v3d / v25 post-init scheduling settles first.
  setTimeout(function () {
    // Always inject the button — it's the discoverable UI even if autoload
    // is off.
    _tmbrInjectButton();

    if (!TMBR_AUTOLOAD_EXAMPLE) return;
    if (typeof FEATURE_TIMBER_SCREWS !== 'undefined' && !FEATURE_TIMBER_SCREWS) return;

    // Skip autoload if there's a non-demo project already loaded
    const ents = (typeof entities2D === 'object' && entities2D.elevation) || [];
    const hasUserEntities = ents.some(function (e) {
      // Anything that isn't a timber-feature entity counts as "user content"
      return e.type !== 'timber-member'
          && e.type !== 'steel-plate'
          && e.type !== 'screw'
          && e.type !== 'connection';
    });
    if (hasUserEntities) {
      console.log('%c[Timber screws] Skipping autoload — other 2D entities present. Click the red button to load the example.', 'color: #888');
      return;
    }

    tmbrLoadExample({ quiet: false });
  }, 150);
});
