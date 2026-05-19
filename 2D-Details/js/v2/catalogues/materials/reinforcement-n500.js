/**
 * StructDraw v2 · Catalogue Layer · materials · Reinforcement N500
 * LAYER: catalogue — the 'reinforcement-n500' material. Pure data; self-registers.
 * READS:  window.v2.model.makeMaterial, window.v2.materials
 * WRITES: window.v2.materials registry entry 'reinforcement-n500'
 *
 * Classic <script>, no build step. Grade N (500 MPa) deformed reinforcing
 * steel. Class is 'steel' — model/material.js's frozen MATERIAL_CLASSES has no
 * separate 'reinforcement' class (rebar is a steel material).
 * See 04-catalogue-system.md §4.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.materials.register(v2.model.makeMaterial({
    id: 'reinforcement-n500',
    name: 'Reinforcement N500',
    class: 'steel',
    grade: 'N500',
    display: {
      hatchCut: 'as1100-steel-45',
      hatchProj: 'none',
      color: 'var(--mat-steel)',
      outlineCut: 'solid',
      outlineProj: 'solid',
    },
    structural: {
      sourceStandard: 'AS/NZS 4671:2019',
      fy: 500, fu: 540, E: 200000, density: 7850, poissonRatio: 0.3,
    },
  }));
})();
