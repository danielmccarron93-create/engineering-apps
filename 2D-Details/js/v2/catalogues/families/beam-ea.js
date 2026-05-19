/**
 * StructDraw v2 · Catalogue Layer · families · Equal Angle (EA)
 * LAYER: catalogue — the `ea` family. Pure data; self-registers on load.
 * READS:  window.v2.families; v1 global EA_DB
 * WRITES: window.v2.families.EaFamily (+ registry entry 'ea')
 *
 * Classic <script>, no build step. Imports the v1 EA_DB catalogue (04 §11).
 * See 04-catalogue-system.md §3.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});

  const EA_SRC = (typeof EA_DB !== 'undefined') ? EA_DB : {};

  const EaFamily = {
    id: 'ea',
    category: 'beam',
    label: 'Equal Angle',
    sourceStandard: 'AS/NZS 3679.1-2016',
    paramSchema: {
      a:  { type: 'number', label: 'Leg length',  unit: 'mm', min: 20 },
      t:  { type: 'number', label: 'Thickness',   unit: 'mm', min: 2 },
      r1: { type: 'number', label: 'Root radius', unit: 'mm', min: 0 },
    },
    types: Object.keys(EA_SRC).map(function (k) {
      const r = EA_SRC[k];
      return { id: k, a: r.a, t: r.t, r1: r.r1 };
    }),
    defaultMaterial: 'steel-s300',
    rendererKey: 'beam:ea',
  };

  v2.families.register(EaFamily);
  v2.families.EaFamily = EaFamily;
})();
