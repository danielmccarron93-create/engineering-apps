/**
 * StructDraw v2 · Catalogue Layer · materials · Concrete Masonry 190
 * LAYER: catalogue — the 'masonry-cmu190' material. Pure data; self-registers.
 * READS:  window.v2.model.makeMaterial, window.v2.materials
 * WRITES: window.v2.materials registry entry 'masonry-cmu190'
 *
 * Classic <script>, no build step. Hollow concrete blockwork. characteristic-
 * Strength is the unconfined block compressive strength f'uc (AS 3700).
 * See 04-catalogue-system.md §4.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.materials.register(v2.model.makeMaterial({
    id: 'masonry-cmu190',
    name: 'Concrete Masonry 190',
    class: 'masonry',
    grade: 'CMU190',
    display: {
      hatchCut: 'masonry-running-bond',
      hatchProj: 'none',
      color: 'var(--mat-masonry)',
      outlineCut: 'solid',
      outlineProj: 'solid',
    },
    structural: {
      sourceStandard: 'AS 3700-2018',
      characteristicStrength: 15, E: 14000, density: 1800,
    },
  }));
})();
