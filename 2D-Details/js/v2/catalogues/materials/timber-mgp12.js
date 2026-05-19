/**
 * StructDraw v2 · Catalogue Layer · materials · Timber MGP12
 * LAYER: catalogue — the 'timber-mgp12' material. Pure data; self-registers.
 * READS:  window.v2.model.makeMaterial, window.v2.materials
 * WRITES: window.v2.materials registry entry 'timber-mgp12'
 *
 * Classic <script>, no build step. Machine-graded pine MGP12 (AS 1748).
 * See 04-catalogue-system.md §4.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.materials.register(v2.model.makeMaterial({
    id: 'timber-mgp12',
    name: 'Timber MGP12',
    class: 'timber',
    grade: 'MGP12',
    display: {
      hatchCut: 'timber-grain-horizontal',
      hatchProj: 'none',
      color: 'var(--mat-timber)',
      outlineCut: 'solid',
      outlineProj: 'solid',
    },
    structural: {
      sourceStandard: 'AS 1720.1-2010 / AS 1748',
      characteristicStrength: 28, E: 12700, density: 410,
    },
  }));
})();
