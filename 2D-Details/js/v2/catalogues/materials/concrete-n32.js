/**
 * StructDraw v2 · Catalogue Layer · materials · Concrete N32
 * LAYER: catalogue — the 'concrete-n32' material. Pure data; self-registers.
 * READS:  window.v2.model.makeMaterial, window.v2.materials
 * WRITES: window.v2.materials registry entry 'concrete-n32'
 *
 * Classic <script>, no build step. f'c = 32 MPa normal-weight concrete —
 * the most common structural grade. See 04-catalogue-system.md §4.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.materials.register(v2.model.makeMaterial({
    id: 'concrete-n32',
    name: 'Concrete N32',
    class: 'concrete',
    grade: 'N32',
    display: {
      hatchCut: 'concrete-cross-cross',
      hatchProj: 'none',
      color: 'var(--mat-concrete)',
      outlineCut: 'solid',
      outlineProj: 'solid',
    },
    structural: {
      sourceStandard: 'AS 3600-2018',
      characteristicStrength: 32, E: 30100, density: 2400, poissonRatio: 0.2,
    },
  }));
})();
