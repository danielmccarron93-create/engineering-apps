/**
 * StructDraw v2 · Catalogue Layer · materials · Timber MGP10
 * LAYER: catalogue — the 'timber-mgp10' material. Pure data; self-registers.
 * READS:  window.v2.model.makeMaterial, window.v2.materials
 * WRITES: window.v2.materials registry entry 'timber-mgp10'
 *
 * Classic <script>, no build step. Machine-graded pine MGP10 (AS 1748).
 * characteristicStrength is the AS 1720.1 bending strength f'b.
 * See 04-catalogue-system.md §4.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.materials.register(v2.model.makeMaterial({
    id: 'timber-mgp10',
    name: 'Timber MGP10',
    class: 'timber',
    grade: 'MGP10',
    display: {
      hatchCut: 'timber-grain-horizontal',
      hatchProj: 'none',
      color: 'var(--mat-timber)',
      outlineCut: 'solid',
      outlineProj: 'solid',
    },
    structural: {
      sourceStandard: 'AS 1720.1-2010 / AS 1748',
      characteristicStrength: 17, E: 10000, density: 400,
    },
  }));
})();
