/**
 * StructDraw v2 · Catalogue Layer · families · Break Line
 * LAYER: catalogue — the `breakline` family. Pure data; self-registers.
 * READS:  window.v2.families
 * WRITES: window.v2.families.BreaklineFamily (+ registry entry 'breakline')
 *
 * Classic <script>, no build step. A detail-component family — the break that
 * shows a member continues beyond the drawn extent. See 04-catalogue-system.md §3.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});

  const BreaklineFamily = {
    id: 'breakline',
    category: 'detail-component',
    label: 'Break Line',
    sourceStandard: 'AS 1100.101-1992',
    paramSchema: {
      amplitude: { type: 'number', label: 'Break amplitude', unit: 'mm' },
    },
    types: [
      { id: 'straight-zigzag', label: 'Straight zigzag' },
      { id: 'curved',          label: 'Curved' },
      { id: 'cylindrical',     label: 'Cylindrical' },
    ],
    defaultMaterial: null,
    rendererKey: 'detail-component:breakline',
  };

  v2.families.register(BreaklineFamily);
  v2.families.BreaklineFamily = BreaklineFamily;
})();
