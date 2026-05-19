/**
 * StructDraw v2 · Catalogue Layer · materials · Steel S355
 * LAYER: catalogue — the 'steel-s355' material. Pure data; self-registers.
 * READS:  window.v2.model.makeMaterial, window.v2.materials
 * WRITES: window.v2.materials registry entry 'steel-s355'
 *
 * Classic <script>, no build step. High-strength structural steel — the
 * default for AS/NZS 1163 hollow sections (SHS / RHS / CHS, grade C350/C450).
 * See 04-catalogue-system.md §4.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.materials.register(v2.model.makeMaterial({
    id: 'steel-s355',
    name: 'Steel S355',
    class: 'steel',
    grade: 'S355',
    display: {
      hatchCut: 'as1100-steel-45',
      hatchProj: 'none',
      color: 'var(--mat-steel)',
      outlineCut: 'solid',
      outlineProj: 'solid',
    },
    structural: {
      sourceStandard: 'AS/NZS 3678-2016',
      fy: 355, fu: 490, E: 200000, G: 80000, density: 7850, poissonRatio: 0.3,
    },
  }));
})();
