/**
 * StructDraw v2 · Catalogue Layer · families · Cross-Laminated Timber (CLT)
 * LAYER: catalogue — the `clt` family. Pure data; self-registers on load.
 * READS:  window.v2.families
 * WRITES: window.v2.families.CltFamily (+ registry entry 'clt')
 *
 * Classic <script>, no build step. v1 has no CLT catalogue, so the panel
 * build-ups below are v2-native data (common 3/5/7-ply layups). Filed under
 * category `beam` to match the build-plan file naming (09-build-plan.md).
 * See 04-catalogue-system.md §3.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});

  const CltFamily = {
    id: 'clt',
    category: 'beam',
    label: 'Cross-Laminated Timber',
    sourceStandard: 'EN 16351 (CLT)',
    paramSchema: {
      thickness: { type: 'number', label: 'Panel thickness', unit: 'mm', min: 60 },
      layers:    { type: 'number', label: 'Number of layers', unit: '',   min: 3 },
    },
    types: [
      { id: 'CLT-3s-60',  thickness: 60,  layers: 3 },
      { id: 'CLT-3s-105', thickness: 105, layers: 3 },
      { id: 'CLT-5s-125', thickness: 125, layers: 5 },
      { id: 'CLT-5s-175', thickness: 175, layers: 5 },
      { id: 'CLT-5s-200', thickness: 200, layers: 5 },
      { id: 'CLT-7s-245', thickness: 245, layers: 7 },
      { id: 'CLT-7s-280', thickness: 280, layers: 7 },
    ],
    defaultMaterial: 'timber-clt-c24',
    rendererKey: 'beam:clt',
  };

  v2.families.register(CltFamily);
  v2.families.CltFamily = CltFamily;
})();
