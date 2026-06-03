'use strict';

/* ============================================================================
 * 72d-v25-plate.js — V25 2D-mode plate orientation presets: icon-button row
 * ----------------------------------------------------------------------------
 * Band-9 (V25 2D-mode core). Sibling of 72c-v25-bolt.js. Loaded in index.html
 * AFTER 72c and BEFORE 73-init.js (classic <script>, per-file strict; globals
 * flow between files — no import/export).
 *
 * What this file owns:
 *   - V25_PLATE_ORIENT             — the 3 orientation presets for a 2D plate.
 *   - v25BuildPlateOrientationRow() — the live icon-button row for the options
 *                                  bar (mirror of v25BuildBoltOrientationRow in
 *                                  72c).
 *
 * Plates are the one LIVE piece of the abandoned architecture-v2 rebuild, so
 * orientation lives on the v2 UI state (v2.appState.ui.activePlateOrientation),
 * NOT in v25State like the member/bolt rows. Orientation is a UI-only concept —
 * it is never serialised onto the placed element. The three ids match the
 * shared contract in PlannedBuilds/plate-orientation-presets/02-design.md and
 * the v2 PlacePlateTool (js/v2/tools/place-plate-tool.js):
 *   'elevation' (face-on rect/poly) | 'h-cleat' (flat strip) | 'v-cleat' (upright strip)
 * Legacy in-memory values map: 'vertical' -> 'elevation', 'horizontal' -> 'h-cleat'.
 * ============================================================================ */

/* ---- Orientation presets (one per icon-bank symbol in index.html) ---------- */
const V25_PLATE_ORIENT = [
  { id: 'elevation', label: 'Elevation — face on',   icon: 'icon-orient-plate-elev' },
  { id: 'h-cleat',   label: 'Flat horizontal cleat', icon: 'icon-orient-plate-hcleat' },
  { id: 'v-cleat',   label: 'Vertical cleat',        icon: 'icon-orient-plate-vcleat' },
];

/* ----------------------------------------------------------------------------
 * v25BuildPlateOrientationRow() → HTMLDivElement
 * Live element (carries click handlers, so it can't be serialised into the
 * options-bar innerHTML string). Mirrors v25BuildBoltOrientationRow in 72c:
 * reuses #v25OrientRow + .v25-orient-btn CSS (only one row shows at a time).
 * Active id is the mapped (legacy) v2.appState.ui.activePlateOrientation,
 * default 'elevation'. Clicking sets the v2 UI state, resets any in-flight
 * place-plate tool state so a mid-placement orientation switch can't leave
 * half-built geometry, then refreshes the options bar + canvas.
 * -------------------------------------------------------------------------- */
function v25BuildPlateOrientationRow() {
  const row = document.createElement('div');
  row.id = 'v25OrientRow';

  // Active id: mapped legacy v2 UI state, default 'elevation'.
  let activeId = 'elevation';
  if (window.v2 && v2.appState && v2.appState.ui) {
    const raw = v2.appState.ui.activePlateOrientation;
    if (raw === 'elevation' || raw === 'h-cleat' || raw === 'v-cleat') {
      activeId = raw;
    } else if (raw === 'horizontal') {
      activeId = 'h-cleat';   // legacy map
    } else if (raw === 'vertical') {
      activeId = 'elevation'; // legacy map
    }
  }

  V25_PLATE_ORIENT.forEach(function (preset) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'v25-orient-btn' + (preset.id === activeId ? ' active' : '');
    btn.title = preset.label;
    btn.setAttribute('aria-label', preset.label);
    btn.innerHTML = '<svg class="icon"><use href="#' + preset.icon + '"/></svg>';
    btn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      if (window.v2 && v2.appState) {
        if (!v2.appState.ui) v2.appState.ui = {};
        v2.appState.ui.activePlateOrientation = preset.id;
        // Reset the in-flight place-plate tool state (anchor / poly / preview)
        // so switching orientation mid-placement can't leave half-built
        // geometry behind.
        if (v2.appState.tools && v2.appState.tools['place-plate']) {
          const slot = v2.appState.tools['place-plate'];
          slot.mode = 'rect';
          slot.anchor = null;
          slot.anchorPx = null;
          slot.poly = [];
          slot.preview = null;
        }
      }
      if (typeof v25UpdateOptionsBar === 'function') v25UpdateOptionsBar();
      if (typeof requestRender === 'function') requestRender();
    });
    row.appendChild(btn);
  });

  return row;
}
