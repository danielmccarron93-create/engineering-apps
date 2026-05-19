/**
 * StructDraw v2 · Catalogue Layer · category registry
 * LAYER: catalogue — the top-level taxonomy. Pure data + pure lookup.
 * READS:  window.v2
 * WRITES: window.v2.categories.{CATEGORIES, lookupCategory, all, keys}
 *
 * Classic <script>, no build step. Categories are small and stable — they
 * drive renderer-dispatch fallback, visibility and default lineweight policy.
 * `defaultLineweight.cut|proj` name lineweights.js entries; `.hidden` names a
 * line-styles.js dashed style. See 04-catalogue-system.md §2.
 *
 * Reconciliations with the FROZEN Phase 0b model layer (`model/element.js`):
 *  - `element.js` froze 12 categories INCLUDING `timber-member`; 04 §2 listed
 *    only 11. This registry carries all 12 so it covers every category an
 *    Element can legally hold.
 *  - 04 §2 gave the `reinforcement` category `defaultMaterialClass:'reinforcement'`,
 *    but `model/material.js` froze MATERIAL_CLASSES without it (rebar IS steel).
 *    This registry uses `'steel'` so the default class is always a real class.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.categories = v2.categories || {};

  const CATEGORIES = {
    beam: {
      label: 'Beam',
      geometryKinds: ['linear'],
      defaultLineweight: { cut: 'thick', proj: 'medium', hidden: 'thin-dash' },
      defaultMaterialClass: 'steel',
      visibility: { default: true },
    },
    column: {
      label: 'Column',
      geometryKinds: ['linear'],
      defaultLineweight: { cut: 'thick', proj: 'medium', hidden: 'thin-dash' },
      defaultMaterialClass: 'steel',
      visibility: { default: true },
    },
    brace: {
      label: 'Brace',
      geometryKinds: ['linear'],
      defaultLineweight: { cut: 'medium', proj: 'thin', hidden: 'thin-dash' },
      defaultMaterialClass: 'steel',
      visibility: { default: true },
    },
    plate: {
      label: 'Plate',
      geometryKinds: ['plate'],
      defaultLineweight: { cut: 'thick', proj: 'medium', hidden: 'thin-dash' },
      defaultMaterialClass: 'steel',
      visibility: { default: true },
    },
    fastener: {
      label: 'Fastener',
      geometryKinds: ['point'],
      defaultLineweight: { cut: 'thin', proj: 'thin', hidden: 'thin-dash' },
      defaultMaterialClass: 'fastener',
      visibility: { default: true },
    },
    reinforcement: {
      label: 'Reinforcement',
      geometryKinds: ['linear', 'polyline'],
      defaultLineweight: { cut: 'medium', proj: 'medium', hidden: 'thin-dash' },
      defaultMaterialClass: 'steel',  // 04 §2 said 'reinforcement'; rebar is a steel material
      visibility: { default: true },
    },
    masonry: {
      label: 'Masonry',
      geometryKinds: ['region'],
      defaultLineweight: { cut: 'medium', proj: 'thin', hidden: 'thin-dash' },
      defaultMaterialClass: 'masonry',
      visibility: { default: true },
    },
    'concrete-region': {
      label: 'Concrete',
      geometryKinds: ['region'],
      defaultLineweight: { cut: 'thick', proj: 'medium', hidden: 'thin-dash' },
      defaultMaterialClass: 'concrete',
      visibility: { default: true },
    },
    'timber-member': {
      label: 'Timber Member',
      geometryKinds: ['linear'],
      defaultLineweight: { cut: 'thick', proj: 'medium', hidden: 'thin-dash' },
      defaultMaterialClass: 'timber',
      visibility: { default: true },
    },
    annotation: {
      label: 'Annotation',
      geometryKinds: ['annotation', 'polyline'],
      defaultLineweight: { cut: 'thin', proj: 'thin', hidden: 'thin' },
      defaultMaterialClass: null,  // annotations do not reference a structural material
      visibility: { default: true },
    },
    'detail-component': {
      label: 'Detail Component',
      geometryKinds: ['region', 'polyline', 'annotation'],
      defaultLineweight: { cut: 'medium', proj: 'thin', hidden: 'thin-dash' },
      defaultMaterialClass: null,
      visibility: { default: true },
    },
    'sheet-component': {
      label: 'Sheet Component',
      geometryKinds: ['annotation'],
      defaultLineweight: { cut: 'medium', proj: 'medium', hidden: 'medium' },
      defaultMaterialClass: null,
      visibility: { default: true },
    },
  };

  v2.categories.CATEGORIES = CATEGORIES;

  /** @param {string} key @returns {?object} */
  v2.categories.lookupCategory = function (key) {
    return Object.prototype.hasOwnProperty.call(CATEGORIES, key) ? CATEGORIES[key] : null;
  };

  /** @returns {string[]} the category keys */
  v2.categories.keys = function () { return Object.keys(CATEGORIES); };

  /** @returns {object[]} every category descriptor, each stamped with its key */
  v2.categories.all = function () {
    return Object.keys(CATEGORIES).map(function (k) {
      return Object.assign({ key: k }, CATEGORIES[k]);
    });
  };
})();
