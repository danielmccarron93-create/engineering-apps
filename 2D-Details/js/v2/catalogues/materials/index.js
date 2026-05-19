/**
 * StructDraw v2 · Catalogue Layer · materials · registry finaliser
 * LAYER: catalogue — loaded LAST of the materials/ files. Validates every
 *        material that self-registered and stamps the registry ready.
 * READS:  window.v2.materials, window.v2.model, window.v2.hatches, window.v2.lineStyles
 * WRITES: window.v2.materials.ready
 *
 * Classic <script>, no build step. Each material file self-registers via
 * v2.materials.register(v2.model.makeMaterial({...})); this file is the
 * load-time fail-fast check. See 04-catalogue-system.md §4.
 */
'use strict';
(function () {
  const v2 = window.v2;
  if (!v2 || !v2.materials || typeof v2.materials.all !== 'function') {
    throw new Error('materials/index.js: v2.materials registry missing — load _catalogue-namespace.js first');
  }
  const isMaterialClass = (v2.model && v2.model.isMaterialClass) || function () { return true; };
  const HATCHES = (v2.hatches && v2.hatches.HATCH_PATTERNS) || {};
  const STYLES = (v2.lineStyles && v2.lineStyles.LINE_STYLES) || {};

  v2.materials.all().forEach(function (mat) {
    if (!isMaterialClass(mat.class)) {
      throw new Error('materials/index.js: material "' + mat.id +
        '" has unknown class "' + mat.class + '"');
    }
    if (!mat.display || !mat.structural) {
      throw new Error('materials/index.js: material "' + mat.id +
        '" is missing display or structural props');
    }
    // Display props must reference catalogue entries that actually exist.
    ['hatchCut', 'hatchProj'].forEach(function (k) {
      if (!Object.prototype.hasOwnProperty.call(HATCHES, mat.display[k])) {
        throw new Error('materials/index.js: material "' + mat.id + '" display.' + k +
          ' = "' + mat.display[k] + '" is not a hatches.js pattern');
      }
    });
    ['outlineCut', 'outlineProj'].forEach(function (k) {
      if (!Object.prototype.hasOwnProperty.call(STYLES, mat.display[k])) {
        throw new Error('materials/index.js: material "' + mat.id + '" display.' + k +
          ' = "' + mat.display[k] + '" is not a line-styles.js style');
      }
    });
  });

  v2.materials.ready = true;
})();
