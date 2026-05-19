/**
 * StructDraw v2 · Catalogue Layer · families · Circular Hollow Section (CHS)
 * LAYER: catalogue — the `chs` family. Pure data; self-registers on load.
 * READS:  window.v2.families; v1 global CHS_DB
 * WRITES: window.v2.families.ChsFamily (+ registry entry 'chs')
 *
 * Classic <script>, no build step. Imports the v1 CHS_DB catalogue (04 §11).
 * See 04-catalogue-system.md §3.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});

  const CHS_SRC = (typeof CHS_DB !== 'undefined') ? CHS_DB : {};

  const ChsFamily = {
    id: 'chs',
    category: 'beam',
    label: 'Circular Hollow Section',
    sourceStandard: 'AS/NZS 1163-2016',
    paramSchema: {
      D: { type: 'number', label: 'Outside diameter', unit: 'mm', min: 20 },
      t: { type: 'number', label: 'Wall thickness',   unit: 'mm', min: 1.5 },
    },
    types: Object.keys(CHS_SRC).map(function (k) {
      const r = CHS_SRC[k];
      return { id: k, D: r.D, t: r.t };
    }),
    defaultMaterial: 'steel-s355',
    rendererKey: 'beam:chs',
  };

  v2.families.register(ChsFamily);
  v2.families.ChsFamily = ChsFamily;
})();
