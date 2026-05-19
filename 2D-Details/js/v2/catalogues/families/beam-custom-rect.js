/**
 * StructDraw v2 · Catalogue Layer · families · Custom Rectangular Timber
 * LAYER: catalogue — the `custom-rect` family. Pure data; self-registers.
 * READS:  window.v2.families; v1 global TIMBER_SECTIONS
 * WRITES: window.v2.families.CustomRectFamily (+ registry entry 'custom-rect')
 *
 * Classic <script>, no build step. A free rectangular timber member — breadth
 * × depth. The preset `types` are the sawn / MGP rows of the v1 TIMBER_SECTIONS
 * catalogue (04 §11); breadth and depth are otherwise user-set.
 * See 04-catalogue-system.md §3.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});

  const SECTIONS = (typeof TIMBER_SECTIONS !== 'undefined') ? TIMBER_SECTIONS : {};

  const CustomRectFamily = {
    id: 'custom-rect',
    category: 'beam',
    label: 'Custom Rectangular Timber',
    sourceStandard: 'AS 1720.1-2010',
    paramSchema: {
      b: { type: 'number', label: 'Breadth', unit: 'mm', min: 19 },
      d: { type: 'number', label: 'Depth',   unit: 'mm', min: 35 },
    },
    types: Object.keys(SECTIONS)
      .filter(function (k) { return SECTIONS[k].family !== 'glulam'; })
      .map(function (k) {
        return { id: k, b: SECTIONS[k].b, d: SECTIONS[k].d };
      }),
    defaultMaterial: 'timber-mgp10',
    rendererKey: 'beam:custom-rect',
  };

  v2.families.register(CustomRectFamily);
  v2.families.CustomRectFamily = CustomRectFamily;
})();
