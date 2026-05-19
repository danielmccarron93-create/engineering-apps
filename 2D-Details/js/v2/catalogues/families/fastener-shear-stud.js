/**
 * StructDraw v2 · Catalogue Layer · families · Headed Shear Stud
 * LAYER: catalogue — the `shear-stud` family. Pure data; self-registers.
 * READS:  window.v2.families
 * WRITES: window.v2.families.ShearStudFamily (+ registry entry 'shear-stud')
 *
 * Classic <script>, no build step. Headed studs for composite steel-concrete
 * construction. v1 has no shear-stud catalogue; the rows below are v2-native
 * data covering the common 13–25 mm headed-stud range.
 * See 04-catalogue-system.md §3.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});

  const ShearStudFamily = {
    id: 'shear-stud',
    category: 'fastener',
    label: 'Headed Shear Stud',
    sourceStandard: 'AS/NZS 1554.2-2003',
    paramSchema: {
      d:     { type: 'number', label: 'Shank diameter', unit: 'mm' },
      L:     { type: 'number', label: 'As-welded length', unit: 'mm' },
      headD: { type: 'number', label: 'Head diameter',  unit: 'mm' },
      headT: { type: 'number', label: 'Head thickness', unit: 'mm' },
    },
    types: [
      { id: 'SC-13x65',  d: 13, L: 65,  headD: 25, headT: 8 },
      { id: 'SC-16x75',  d: 16, L: 75,  headD: 32, headT: 8 },
      { id: 'SC-19x100', d: 19, L: 100, headD: 32, headT: 10 },
      { id: 'SC-19x150', d: 19, L: 150, headD: 32, headT: 10 },
      { id: 'SC-22x150', d: 22, L: 150, headD: 35, headT: 10 },
      { id: 'SC-25x175', d: 25, L: 175, headD: 40, headT: 12 },
    ],
    defaultMaterial: 'steel-s355',
    rendererKey: 'fastener:shear-stud',
  };

  v2.families.register(ShearStudFamily);
  v2.families.ShearStudFamily = ShearStudFamily;
})();
