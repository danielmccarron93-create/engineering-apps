/**
 * StructDraw v2 · Catalogue Layer · families · Weld Symbol
 * LAYER: catalogue — the `weld-symbol` family. Pure data; self-registers.
 * READS:  window.v2.families
 * WRITES: window.v2.families.WeldSymbolFamily (+ registry entry 'weld-symbol')
 *
 * Classic <script>, no build step. A detail-component family — the AS 1101.3
 * welding symbol placed on a connection. See 04-catalogue-system.md §3.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});

  const WeldSymbolFamily = {
    id: 'weld-symbol',
    category: 'detail-component',
    label: 'Weld Symbol',
    sourceStandard: 'AS 1101.3-2005',
    paramSchema: {
      size:   { type: 'number', label: 'Weld size',   unit: 'mm' },
      length: { type: 'number', label: 'Weld length', unit: 'mm' },
    },
    types: [
      { id: 'fillet',     label: 'Fillet weld' },
      { id: 'butt-bevel', label: 'Bevel butt weld' },
      { id: 'butt-vee',   label: 'Vee butt weld' },
      { id: 'plug',       label: 'Plug weld' },
      { id: 'seam',       label: 'Seam weld' },
      { id: 'field-weld', label: 'Field weld' },
    ],
    defaultMaterial: null,
    rendererKey: 'detail-component:weld-symbol',
  };

  v2.families.register(WeldSymbolFamily);
  v2.families.WeldSymbolFamily = WeldSymbolFamily;
})();
