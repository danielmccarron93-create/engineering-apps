/**
 * StructDraw v2 · Catalogue Layer · families · Detail Callout
 * LAYER: catalogue — the `detail-callout` family. Pure data; self-registers.
 * READS:  window.v2.families
 * WRITES: window.v2.families.DetailCalloutFamily (+ registry entry 'detail-callout')
 *
 * Classic <script>, no build step. An annotation family — the boundary that
 * marks a region promoted to its own detail view. See 04-catalogue-system.md §3.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});

  const DetailCalloutFamily = {
    id: 'detail-callout',
    category: 'annotation',
    label: 'Detail Callout',
    sourceStandard: 'AS 1100.101-1992',
    paramSchema: {
      lineStyle: { type: 'enum', label: 'Boundary line style',
                   values: ['solid', 'dashed', 'phantom'] },
    },
    types: [
      { id: 'rectangular', label: 'Rectangular' },
      { id: 'circular',    label: 'Circular' },
      { id: 'polygonal',   label: 'Polygonal' },
    ],
    defaultMaterial: null,
    rendererKey: 'annotation:detail-callout',
  };

  v2.families.register(DetailCalloutFamily);
  v2.families.DetailCalloutFamily = DetailCalloutFamily;
})();
