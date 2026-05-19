/**
 * StructDraw v2 · Catalogue Layer · families · Unequal Angle (UA)
 * LAYER: catalogue — the `ua` family. Pure data; self-registers on load.
 * READS:  window.v2.families; v1 global UA_DB
 * WRITES: window.v2.families.UaFamily (+ registry entry 'ua')
 *
 * Classic <script>, no build step. Imports the v1 UA_DB catalogue (04 §11).
 * See 04-catalogue-system.md §3.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});

  const UA_SRC = (typeof UA_DB !== 'undefined') ? UA_DB : {};

  const UaFamily = {
    id: 'ua',
    category: 'beam',
    label: 'Unequal Angle',
    sourceStandard: 'AS/NZS 3679.1-2016',
    paramSchema: {
      a:  { type: 'number', label: 'Long leg',    unit: 'mm', min: 20 },
      b:  { type: 'number', label: 'Short leg',   unit: 'mm', min: 20 },
      t:  { type: 'number', label: 'Thickness',   unit: 'mm', min: 2 },
      r1: { type: 'number', label: 'Root radius', unit: 'mm', min: 0 },
    },
    types: Object.keys(UA_SRC).map(function (k) {
      const r = UA_SRC[k];
      return { id: k, a: r.a, b: r.b, t: r.t, r1: r.r1 };
    }),
    defaultMaterial: 'steel-s300',
    rendererKey: 'beam:ua',
  };

  v2.families.register(UaFamily);
  v2.families.UaFamily = UaFamily;
})();
