/**
 * StructDraw v2 · Catalogue Layer · materials · Glulam GL18
 * LAYER: catalogue — the 'timber-gl18h' material. Pure data; self-registers.
 * READS:  window.v2.model.makeMaterial, window.v2.materials
 * WRITES: window.v2.materials registry entry 'timber-gl18h'
 *
 * Classic <script>, no build step. Glued-laminated timber GL18 (AS/NZS 1328).
 * See 04-catalogue-system.md §4.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.materials.register(v2.model.makeMaterial({
    id: 'timber-gl18h',
    name: 'Glulam GL18',
    class: 'timber',
    grade: 'GL18',
    display: {
      hatchCut: 'timber-grain-horizontal',
      hatchProj: 'none',
      color: 'var(--mat-timber)',
      outlineCut: 'solid',
      outlineProj: 'solid',
    },
    structural: {
      sourceStandard: 'AS/NZS 1328.1-1998',
      characteristicStrength: 18, E: 11500, density: 385,
    },
  }));
})();
