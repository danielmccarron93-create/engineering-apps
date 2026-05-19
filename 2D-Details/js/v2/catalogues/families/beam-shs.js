/**
 * StructDraw v2 · Catalogue Layer · families · Square Hollow Section (SHS)
 * LAYER: catalogue — the `shs` family. Pure data; self-registers on load.
 * READS:  window.v2.families; v1 global SHS_DB
 * WRITES: window.v2.families.ShsFamily (+ registry entry 'shs')
 *
 * Classic <script>, no build step. Imports the v1 SHS_DB catalogue (04 §11).
 * See 04-catalogue-system.md §3.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});

  const SHS_SRC = (typeof SHS_DB !== 'undefined') ? SHS_DB : {};

  const ShsFamily = {
    id: 'shs',
    category: 'beam',
    label: 'Square Hollow Section',
    sourceStandard: 'AS/NZS 1163-2016',
    paramSchema: {
      B: { type: 'number', label: 'Section size',   unit: 'mm', min: 20 },
      t: { type: 'number', label: 'Wall thickness', unit: 'mm', min: 1.5 },
    },
    types: Object.keys(SHS_SRC).map(function (k) {
      const r = SHS_SRC[k];
      return { id: k, B: r.B, t: r.t };
    }),
    defaultMaterial: 'steel-s355',
    rendererKey: 'beam:shs',
  };

  v2.families.register(ShsFamily);
  v2.families.ShsFamily = ShsFamily;
})();
