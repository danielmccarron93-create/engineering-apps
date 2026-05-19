/**
 * StructDraw v2 · Catalogue Layer · families · Glulam Timber (GLT)
 * LAYER: catalogue — the `glt` family. Pure data; self-registers on load.
 * READS:  window.v2.families; v1 global TIMBER_SECTIONS
 * WRITES: window.v2.families.GltFamily (+ registry entry 'glt')
 *
 * Classic <script>, no build step. Imports the glulam rows of the v1
 * TIMBER_SECTIONS preset catalogue (04 §11). Filed under category `beam` to
 * match the build-plan file naming (09-build-plan.md Phase 0c).
 * See 04-catalogue-system.md §3.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});

  const SECTIONS = (typeof TIMBER_SECTIONS !== 'undefined') ? TIMBER_SECTIONS : {};

  const GltFamily = {
    id: 'glt',
    category: 'beam',
    label: 'Glulam Timber',
    sourceStandard: 'AS/NZS 1328.1-1998',
    paramSchema: {
      b: { type: 'number', label: 'Breadth', unit: 'mm', min: 35 },
      d: { type: 'number', label: 'Depth',   unit: 'mm', min: 90 },
    },
    types: Object.keys(SECTIONS)
      .filter(function (k) { return SECTIONS[k].family === 'glulam'; })
      .map(function (k) {
        return { id: k, b: SECTIONS[k].b, d: SECTIONS[k].d };
      }),
    defaultMaterial: 'timber-gl18h',
    rendererKey: 'beam:glt',
  };

  v2.families.register(GltFamily);
  v2.families.GltFamily = GltFamily;
})();
