/**
 * StructDraw v2 · Catalogue Layer · families · Welded Beam (WB)
 * LAYER: catalogue — the `wb` family. Pure data; self-registers on load.
 * READS:  window.v2.families; v1 global WB_DB
 * WRITES: window.v2.families.WbFamily (+ registry entry 'wb')
 *
 * Classic <script>, no build step. Imports the v1 WB_DB catalogue (04 §11).
 * WB sections are fabricated I-sections — same shape as UB, so r1 = 0 (the
 * flange-to-web transition is a fillet weld, drawn by the weld layer).
 * See 04-catalogue-system.md §3.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});

  const WB_SRC = (typeof WB_DB !== 'undefined') ? WB_DB : {};

  const WbFamily = {
    id: 'wb',
    category: 'beam',
    label: 'Welded Beam',
    sourceStandard: 'AS/NZS 3679.2-2016',
    paramSchema: {
      d:  { type: 'number', label: 'Section depth',    unit: 'mm', min: 500 },
      bf: { type: 'number', label: 'Flange width',     unit: 'mm', min: 200 },
      tf: { type: 'number', label: 'Flange thickness', unit: 'mm', min: 8 },
      tw: { type: 'number', label: 'Web thickness',    unit: 'mm', min: 8 },
      r1: { type: 'number', label: 'Root radius',      unit: 'mm', min: 0 },
    },
    types: Object.keys(WB_SRC).map(function (k) {
      const r = WB_SRC[k];
      return { id: k, d: r.d, bf: r.bf, tf: r.tf, tw: r.tw, r1: r.r1 };
    }),
    defaultMaterial: 'steel-s300',
    rendererKey: 'beam:wb',
  };

  v2.families.register(WbFamily);
  v2.families.WbFamily = WbFamily;
})();
