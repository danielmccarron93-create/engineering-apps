/**
 * StructDraw v2 · Catalogue Layer · materials · Concrete N40
 * LAYER: catalogue — the 'concrete-n40' material. Pure data; self-registers.
 * READS:  window.v2.model.makeMaterial, window.v2.materials
 * WRITES: window.v2.materials registry entry 'concrete-n40'
 *
 * Classic <script>, no build step. f'c = 40 MPa normal-weight concrete.
 * See 04-catalogue-system.md §4.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.materials.register(v2.model.makeMaterial({
    id: 'concrete-n40',
    name: 'Concrete N40',
    class: 'concrete',
    grade: 'N40',
    display: {
      hatchCut: 'concrete-cross-cross',
      hatchProj: 'none',
      color: 'var(--mat-concrete)',
      outlineCut: 'solid',
      outlineProj: 'solid',
    },
    structural: {
      sourceStandard: 'AS 3600-2018',
      characteristicStrength: 40, E: 32800, density: 2400, poissonRatio: 0.2,
    },
  }));
})();
