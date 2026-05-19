/**
 * StructDraw v2 · Catalogue Layer · materials · Concrete N25
 * LAYER: catalogue — the 'concrete-n25' material. Pure data; self-registers.
 * READS:  window.v2.model.makeMaterial, window.v2.materials
 * WRITES: window.v2.materials registry entry 'concrete-n25'
 *
 * Classic <script>, no build step. f'c = 25 MPa normal-weight concrete.
 * See 04-catalogue-system.md §4.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.materials.register(v2.model.makeMaterial({
    id: 'concrete-n25',
    name: 'Concrete N25',
    class: 'concrete',
    grade: 'N25',
    display: {
      hatchCut: 'concrete-cross-cross',
      hatchProj: 'none',
      color: 'var(--mat-concrete)',
      outlineCut: 'solid',
      outlineProj: 'solid',
    },
    structural: {
      sourceStandard: 'AS 3600-2018',
      characteristicStrength: 25, E: 26700, density: 2400, poissonRatio: 0.2,
    },
  }));
})();
