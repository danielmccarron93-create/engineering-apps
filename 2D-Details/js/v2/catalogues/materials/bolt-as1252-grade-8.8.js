/**
 * StructDraw v2 · Catalogue Layer · materials · Bolt AS 1252 Grade 8.8
 * LAYER: catalogue — the 'bolt-as1252-grade-8.8' material. Pure data; self-registers.
 * READS:  window.v2.model.makeMaterial, window.v2.materials
 * WRITES: window.v2.materials registry entry 'bolt-as1252-grade-8.8'
 *
 * Classic <script>, no build step. Property class 8.8 high-strength structural
 * bolt steel (AS/NZS 1252). fy / fu per the ISO 898-1 8.8 designation.
 * See 04-catalogue-system.md §4.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.materials.register(v2.model.makeMaterial({
    id: 'bolt-as1252-grade-8.8',
    name: 'Bolt AS 1252 Grade 8.8',
    class: 'fastener',
    grade: '8.8',
    display: {
      hatchCut: 'none',
      hatchProj: 'none',
      color: 'var(--mat-fastener)',
      outlineCut: 'solid',
      outlineProj: 'solid',
    },
    structural: {
      sourceStandard: 'AS/NZS 1252.1-2016',
      fy: 660, fu: 830, E: 200000, density: 7850,
    },
  }));
})();
