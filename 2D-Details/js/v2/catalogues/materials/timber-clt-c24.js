/**
 * StructDraw v2 · Catalogue Layer · materials · CLT C24
 * LAYER: catalogue — the 'timber-clt-c24' material. Pure data; self-registers.
 * READS:  window.v2.model.makeMaterial, window.v2.materials
 * WRITES: window.v2.materials registry entry 'timber-clt-c24'
 *
 * Classic <script>, no build step. Cross-laminated timber built from C24
 * lamellas (EN 16351 / EN 338). See 04-catalogue-system.md §4.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.materials.register(v2.model.makeMaterial({
    id: 'timber-clt-c24',
    name: 'CLT C24',
    class: 'timber',
    grade: 'C24',
    display: {
      hatchCut: 'timber-grain-horizontal',
      hatchProj: 'none',
      color: 'var(--mat-timber)',
      outlineCut: 'solid',
      outlineProj: 'solid',
    },
    structural: {
      sourceStandard: 'EN 16351 / EN 338',
      characteristicStrength: 24, E: 11000, density: 420,
    },
  }));
})();
