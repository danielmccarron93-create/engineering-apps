/**
 * StructDraw v2 · Catalogue Layer · families · Universal Column (UC)
 * LAYER: catalogue — the `uc` family. Pure data; self-registers on load.
 * READS:  window.v2.families; v1 global UC_DB
 * WRITES: window.v2.families.UcFamily (+ registry entry 'uc')
 *
 * Classic <script>, no build step. Imports the v1 UC_DB section catalogue
 * (04 §11). UC geometry is an I-section identical in shape to UB; it is its own
 * family so the catalogue, palette and labels can distinguish columns.
 * See 04-catalogue-system.md §3.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});

  const UC_SRC = (typeof UC_DB !== 'undefined') ? UC_DB : {};

  const UcFamily = {
    id: 'uc',
    category: 'beam',
    label: 'Universal Column',
    sourceStandard: 'AS/NZS 3679.1-2016',
    paramSchema: {
      d:  { type: 'number', label: 'Section depth',    unit: 'mm', min: 50 },
      bf: { type: 'number', label: 'Flange width',     unit: 'mm', min: 30 },
      tf: { type: 'number', label: 'Flange thickness', unit: 'mm', min: 3 },
      tw: { type: 'number', label: 'Web thickness',    unit: 'mm', min: 3 },
      r1: { type: 'number', label: 'Root radius',      unit: 'mm', min: 0 },
    },
    types: Object.keys(UC_SRC).map(function (k) {
      const r = UC_SRC[k];
      return { id: k, d: r.d, bf: r.bf, tf: r.tf, tw: r.tw, r1: r.r1 };
    }),
    defaultMaterial: 'steel-s300',
    rendererKey: 'beam:uc',
  };

  v2.families.register(UcFamily);
  v2.families.UcFamily = UcFamily;
})();
