/**
 * StructDraw v2 · Catalogue Layer · materials · HBS Screw Steel (galv. C1022)
 * LAYER: catalogue — the 'screw-galv-grade-c1022' material. Pure data; self-registers.
 * READS:  window.v2.model.makeMaterial, window.v2.materials
 * WRITES: window.v2.materials registry entry 'screw-galv-grade-c1022'
 *
 * Classic <script>, no build step. Case-hardened galvanised carbon steel —
 * the Rothoblaas HBS Plate screw material (ETA-11/0030). Fasteners draw solid,
 * so hatchCut is 'none'. See 04-catalogue-system.md §4.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.materials.register(v2.model.makeMaterial({
    id: 'screw-galv-grade-c1022',
    name: 'HBS Screw Steel (galv. C1022)',
    class: 'fastener',
    grade: 'C1022',
    display: {
      hatchCut: 'none',
      hatchProj: 'none',
      color: 'var(--mat-fastener)',
      outlineCut: 'solid',
      outlineProj: 'solid',
    },
    structural: {
      sourceStandard: 'ETA-11/0030 (2019-09-24)',
      fu: 800, E: 210000, density: 7850,
    },
  }));
})();
