/**
 * StructDraw v2 · Catalogue Layer · families · Dimension
 * LAYER: catalogue — the `dimension` family. Pure data; self-registers.
 * READS:  window.v2.families
 * WRITES: window.v2.families.DimensionFamily (+ registry entry 'dimension')
 *
 * Classic <script>, no build step. An annotation family — `types` are the
 * dimension-style variants, `paramSchema` the per-instance style fields.
 * See 04-catalogue-system.md §3.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});

  const DimensionFamily = {
    id: 'dimension',
    category: 'annotation',
    label: 'Dimension',
    sourceStandard: 'AS 1100.101-1992',
    paramSchema: {
      textHeight: { type: 'number', label: 'Text height',   unit: 'mm' },
      arrowStyle: { type: 'enum',   label: 'Arrow style',
                    values: ['closed', 'open', 'tick', 'dot'] },
      precision:  { type: 'number', label: 'Decimal places', unit: '' },
      units:      { type: 'enum',   label: 'Units', values: ['mm', 'm'] },
    },
    types: [
      { id: 'linear',     label: 'Linear' },
      { id: 'aligned',    label: 'Aligned' },
      { id: 'angular',    label: 'Angular' },
      { id: 'radial',     label: 'Radial' },
      { id: 'diameter',   label: 'Diameter' },
      { id: 'ordinate',   label: 'Ordinate' },
      { id: 'arc-length', label: 'Arc length' },
    ],
    defaultMaterial: null,
    rendererKey: 'annotation:dimension',
  };

  v2.families.register(DimensionFamily);
  v2.families.DimensionFamily = DimensionFamily;
})();
