/**
 * StructDraw v2 · Catalogue Layer · families · Parallel Flange Channel (PFC)
 * LAYER: catalogue — the `pfc` family. Pure data; self-registers on load.
 * READS:  window.v2.families; v1 global PFC_DB
 * WRITES: window.v2.families.PfcFamily (+ registry entry 'pfc')
 *
 * Classic <script>, no build step. Imports the v1 PFC_DB catalogue (04 §11).
 * See 04-catalogue-system.md §3.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});

  const PFC_SRC = (typeof PFC_DB !== 'undefined') ? PFC_DB : {};

  const PfcFamily = {
    id: 'pfc',
    category: 'beam',
    label: 'Parallel Flange Channel',
    sourceStandard: 'AS/NZS 3679.1-2016',
    paramSchema: {
      d:  { type: 'number', label: 'Section depth',    unit: 'mm', min: 50 },
      bf: { type: 'number', label: 'Flange width',     unit: 'mm', min: 30 },
      tf: { type: 'number', label: 'Flange thickness', unit: 'mm', min: 3 },
      tw: { type: 'number', label: 'Web thickness',    unit: 'mm', min: 3 },
      r1: { type: 'number', label: 'Root radius',      unit: 'mm', min: 0 },
    },
    types: Object.keys(PFC_SRC).map(function (k) {
      const r = PFC_SRC[k];
      return { id: k, d: r.d, bf: r.bf, tf: r.tf, tw: r.tw, r1: r.r1 };
    }),
    defaultMaterial: 'steel-s300',
    rendererKey: 'beam:pfc',
  };

  v2.families.register(PfcFamily);
  v2.families.PfcFamily = PfcFamily;
})();
