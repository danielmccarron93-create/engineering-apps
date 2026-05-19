/**
 * StructDraw v2 · Catalogue Layer · families · Universal Beam (UB)
 * LAYER: catalogue — the `ub` family. Pure data; self-registers on load.
 * READS:  window.v2.families; v1 globals UB_DB, UC_DB, WB_DB
 * WRITES: window.v2.families.UbFamily (+ registry entry 'ub')
 *
 * Classic <script>, no build step. Imports the v1 section catalogue rather than
 * duplicating it (04 §11). v1 declares UB_DB as a bare top-level `const` shared
 * across classic <script>s — 04 §11's `window.UB_DB` pseudocode predates that
 * reality, so the import is a guarded bare-global reference. The v1 type key is
 * kept verbatim as the v2 type id so the Phase 0e migrator maps 1:1.
 *
 * NOTE: 03-data-bolts.js merges UC_DB + WB_DB rows into UB_DB at load; the
 * UB-only set is recovered here by removing whatever UC/WB contributed.
 * See 04-catalogue-system.md §3.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});

  const UB_SRC = (typeof UB_DB !== 'undefined') ? UB_DB : {};
  const UC_SRC = (typeof UC_DB !== 'undefined') ? UC_DB : {};
  const WB_SRC = (typeof WB_DB !== 'undefined') ? WB_DB : {};

  const types = Object.keys(UB_SRC)
    .filter(function (k) { return !(k in UC_SRC) && !(k in WB_SRC); })
    .map(function (k) {
      const r = UB_SRC[k];
      return { id: k, d: r.d, bf: r.bf, tf: r.tf, tw: r.tw, r1: r.r1 };
    });

  const UbFamily = {
    id: 'ub',
    category: 'beam',
    label: 'Universal Beam',
    sourceStandard: 'AS/NZS 3679.1-2016',
    paramSchema: {
      d:  { type: 'number', label: 'Section depth',    unit: 'mm', min: 50 },
      bf: { type: 'number', label: 'Flange width',     unit: 'mm', min: 30 },
      tf: { type: 'number', label: 'Flange thickness', unit: 'mm', min: 3 },
      tw: { type: 'number', label: 'Web thickness',    unit: 'mm', min: 3 },
      r1: { type: 'number', label: 'Root radius',      unit: 'mm', min: 0 },
    },
    types: types,
    defaultMaterial: 'steel-s300',
    rendererKey: 'beam:ub',
    orientationPresets: [
      { id: 'web-vertical-flange-top', label: 'Web vertical, top flange up',
        rotation: 0, icon: '#icon-ub-orient-1' },
      { id: 'web-vertical-flange-bot', label: 'Web vertical, bottom flange up',
        rotation: Math.PI, icon: '#icon-ub-orient-2' },
      { id: 'web-horizontal', label: 'Web horizontal (laid on side)',
        rotation: Math.PI / 2, icon: '#icon-ub-orient-3' },
    ],
  };

  v2.families.register(UbFamily);
  v2.families.UbFamily = UbFamily;
})();
