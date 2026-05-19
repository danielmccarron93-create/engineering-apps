/**
 * StructDraw v2 · Catalogue Layer · families · Concrete Masonry Unit (CMU)
 * LAYER: catalogue — the `cmu` family. Pure data; self-registers on load.
 * READS:  window.v2.families
 * WRITES: window.v2.families.MasonryCmuFamily (+ registry entry 'cmu')
 *
 * Classic <script>, no build step. Concrete blockwork units. v1 has no CMU
 * catalogue; the rows below are v2-native data (AS/NZS 4455 work sizes — the
 * nominal coordinating size is 10 mm larger to allow for the mortar joint).
 * See 04-catalogue-system.md §3.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});

  const MasonryCmuFamily = {
    id: 'cmu',
    category: 'masonry',
    label: 'Concrete Masonry Unit',
    sourceStandard: 'AS/NZS 4455.1-2008 / AS 3700-2018',
    paramSchema: {
      width:  { type: 'number', label: 'Unit width',  unit: 'mm' },
      height: { type: 'number', label: 'Unit height', unit: 'mm' },
      length: { type: 'number', label: 'Unit length', unit: 'mm' },
    },
    types: [
      { id: 'CMU90',  width: 90,  height: 190, length: 390 },
      { id: 'CMU110', width: 110, height: 190, length: 390 },
      { id: 'CMU140', width: 140, height: 190, length: 390 },
      { id: 'CMU190', width: 190, height: 190, length: 390 },
      { id: 'CMU290', width: 290, height: 190, length: 390 },
    ],
    defaultMaterial: 'masonry-cmu190',
    rendererKey: 'masonry:cmu',
  };

  v2.families.register(MasonryCmuFamily);
  v2.families.MasonryCmuFamily = MasonryCmuFamily;
})();
