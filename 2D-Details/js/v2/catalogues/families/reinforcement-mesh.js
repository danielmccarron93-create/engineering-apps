/**
 * StructDraw v2 · Catalogue Layer · families · Reinforcement Mesh
 * LAYER: catalogue — the `mesh` family. Pure data; self-registers on load.
 * READS:  window.v2.families
 * WRITES: window.v2.families.ReinforcementMeshFamily (+ registry entry 'mesh')
 *
 * Classic <script>, no build step. Welded square reinforcing mesh (SL series).
 * v1 has no mesh catalogue; the rows below are v2-native data (AS/NZS 4671).
 * `area` is the main-direction cross-sectional area per metre.
 * See 04-catalogue-system.md §3.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});

  const ReinforcementMeshFamily = {
    id: 'mesh',
    category: 'reinforcement',
    label: 'Reinforcement Mesh',
    sourceStandard: 'AS/NZS 4671:2019',
    paramSchema: {
      wireD: { type: 'number', label: 'Wire diameter',  unit: 'mm' },
      pitch: { type: 'number', label: 'Wire pitch',     unit: 'mm' },
      area:  { type: 'number', label: 'Area per metre', unit: 'mm²/m' },
    },
    types: [
      { id: 'SL62',  wireD: 6.0,  pitch: 200, area: 141 },
      { id: 'SL72',  wireD: 6.75, pitch: 200, area: 179 },
      { id: 'SL81',  wireD: 7.6,  pitch: 200, area: 227 },
      { id: 'SL82',  wireD: 7.6,  pitch: 200, area: 227 },
      { id: 'SL92',  wireD: 8.6,  pitch: 200, area: 290 },
      { id: 'SL102', wireD: 9.5,  pitch: 200, area: 354 },
    ],
    defaultMaterial: 'reinforcement-n500',
    rendererKey: 'reinforcement:mesh',
  };

  v2.families.register(ReinforcementMeshFamily);
  v2.families.ReinforcementMeshFamily = ReinforcementMeshFamily;
})();
