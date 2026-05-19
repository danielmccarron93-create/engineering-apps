/**
 * StructDraw v2 · Catalogue Layer · materials · Bolt AS 1252 Grade 10.9
 * LAYER: catalogue — the 'bolt-as1252-grade-10.9' material. Pure data; self-registers.
 * READS:  window.v2.model.makeMaterial, window.v2.materials
 * WRITES: window.v2.materials registry entry 'bolt-as1252-grade-10.9'
 *
 * Classic <script>, no build step. Property class 10.9 high-strength
 * structural bolt steel (AS/NZS 1252). See 04-catalogue-system.md §4.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.materials.register(v2.model.makeMaterial({
    id: 'bolt-as1252-grade-10.9',
    name: 'Bolt AS 1252 Grade 10.9',
    class: 'fastener',
    grade: '10.9',
    display: {
      hatchCut: 'none',
      hatchProj: 'none',
      color: 'var(--mat-fastener)',
      outlineCut: 'solid',
      outlineProj: 'solid',
    },
    structural: {
      sourceStandard: 'AS/NZS 1252.1-2016',
      fy: 940, fu: 1040, E: 200000, density: 7850,
    },
  }));
})();
