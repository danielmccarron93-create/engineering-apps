/**
 * StructDraw v2 · Catalogue Layer · families · Rectangular Hollow Section (RHS)
 * LAYER: catalogue — the `rhs` family. Pure data; self-registers on load.
 * READS:  window.v2.families; v1 global RHS_DB
 * WRITES: window.v2.families.RhsFamily (+ registry entry 'rhs')
 *
 * Classic <script>, no build step. Imports the v1 RHS_DB catalogue (04 §11).
 * See 04-catalogue-system.md §3.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});

  const RHS_SRC = (typeof RHS_DB !== 'undefined') ? RHS_DB : {};

  const RhsFamily = {
    id: 'rhs',
    category: 'beam',
    label: 'Rectangular Hollow Section',
    sourceStandard: 'AS/NZS 1163-2016',
    paramSchema: {
      d:  { type: 'number', label: 'Section depth',  unit: 'mm', min: 20 },
      bf: { type: 'number', label: 'Section width',  unit: 'mm', min: 20 },
      t:  { type: 'number', label: 'Wall thickness', unit: 'mm', min: 1.5 },
    },
    types: Object.keys(RHS_SRC).map(function (k) {
      const r = RHS_SRC[k];
      return { id: k, d: r.d, bf: r.bf, t: r.t };
    }),
    defaultMaterial: 'steel-s355',
    rendererKey: 'beam:rhs',
  };

  v2.families.register(RhsFamily);
  v2.families.RhsFamily = RhsFamily;
})();
