/**
 * StructDraw v2 · Catalogue Layer · materials · Steel Grade 300
 * LAYER: catalogue — the 'steel-s300' material. Pure data; self-registers.
 * READS:  window.v2.model.makeMaterial, window.v2.materials
 * WRITES: window.v2.materials registry entry 'steel-s300'
 *
 * Classic <script>, no build step. AS/NZS 3679.1 grade 300 — the default
 * material for hot-rolled UB / UC / PFC / EA / UA / WB sections.
 * See 04-catalogue-system.md §4.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.materials.register(v2.model.makeMaterial({
    id: 'steel-s300',
    name: 'Steel Grade 300',
    class: 'steel',
    grade: '300',
    display: {
      hatchCut: 'as1100-steel-45',
      hatchProj: 'none',
      color: 'var(--mat-steel)',
      outlineCut: 'solid',
      outlineProj: 'solid',
    },
    structural: {
      sourceStandard: 'AS/NZS 3679.1-2016',
      fy: 300, fu: 440, E: 200000, G: 80000, density: 7850, poissonRatio: 0.3,
    },
  }));
})();
