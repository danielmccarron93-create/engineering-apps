/**
 * StructDraw v2 · Catalogue Layer · materials · Steel S275
 * LAYER: catalogue — the 'steel-s275' material. Pure data; self-registers.
 * READS:  window.v2.model.makeMaterial, window.v2.materials
 * WRITES: window.v2.materials registry entry 'steel-s275'
 *
 * Classic <script>, no build step. Display props reference catalogue entries
 * by string (hatchCut/hatchProj -> hatches.js, outline* -> line-styles.js),
 * consistent with model/material.js's frozen string defaults.
 * See 04-catalogue-system.md §4.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.materials.register(v2.model.makeMaterial({
    id: 'steel-s275',
    name: 'Steel S275',
    class: 'steel',
    grade: 'S275',
    display: {
      hatchCut: 'as1100-steel-45',
      hatchProj: 'none',
      color: 'var(--mat-steel)',
      outlineCut: 'solid',
      outlineProj: 'solid',
    },
    structural: {
      sourceStandard: 'AS/NZS 3678-2016',
      fy: 275, fu: 430, E: 200000, G: 80000, density: 7850, poissonRatio: 0.3,
    },
  }));
})();
