/**
 * StructDraw v2 · Catalogue Layer · families · registry finaliser
 * LAYER: catalogue — loaded LAST of the families/ files. Validates every
 *        family that self-registered and stamps the registry ready.
 * READS:  window.v2.families, window.v2.categories
 * WRITES: window.v2.families.ready
 *
 * Classic <script>, no build step. Each family file self-registers via
 * v2.families.register(); this file is the load-time fail-fast check that
 * every registered family is structurally sound. See 04-catalogue-system.md §3.
 */
'use strict';
(function () {
  const v2 = window.v2;
  if (!v2 || !v2.families || typeof v2.families.all !== 'function') {
    throw new Error('families/index.js: v2.families registry missing — load _catalogue-namespace.js first');
  }
  const CATS = (v2.categories && v2.categories.CATEGORIES) || {};

  v2.families.all().forEach(function (fam) {
    if (typeof fam.id !== 'string' || fam.id.length === 0) {
      throw new Error('families/index.js: a family is missing its string id');
    }
    if (!Object.prototype.hasOwnProperty.call(CATS, fam.category)) {
      throw new Error('families/index.js: family "' + fam.id +
        '" has unknown category "' + fam.category + '"');
    }
    if (!Array.isArray(fam.types)) {
      throw new Error('families/index.js: family "' + fam.id + '" has no types array');
    }
    if (typeof fam.rendererKey !== 'string' || fam.rendererKey.length === 0) {
      throw new Error('families/index.js: family "' + fam.id + '" has no rendererKey');
    }
    if (fam.defaultMaterial != null && typeof fam.defaultMaterial !== 'string') {
      throw new Error('families/index.js: family "' + fam.id +
        '" defaultMaterial must be a string or null');
    }
  });

  v2.families.ready = true;
})();
