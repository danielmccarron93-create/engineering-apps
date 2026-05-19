/**
 * StructDraw v2 · Catalogue Layer · line styles
 * LAYER: catalogue — the AS 1100 dash-pattern table. Pure data.
 * READS:  window.v2
 * WRITES: window.v2.lineStyles.{LINE_STYLES, get, names}
 *
 * Classic <script>, no build step. A line style pairs a dash array with the
 * lineweight name it is normally drawn at (see lineweights.js). `solid` carries
 * no weight — solid outlines take their weight from the category's lineweight
 * policy (cut / proj). See 04-catalogue-system.md §6.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.lineStyles = v2.lineStyles || {};

  /** dash: on/off run lengths (mm). weight: lineweights.js key (omitted for solid). */
  const LINE_STYLES = {
    solid:       { dash: [],                 offset: 0 },
    dashed:      { dash: [6, 3],              offset: 0, weight: 'thin' },
    hidden:      { dash: [5, 3],              offset: 0, weight: 'thin' },
    'thin-dash': { dash: [3, 2],              offset: 0, weight: 'thin' },
    centre:      { dash: [10, 2, 2, 2],       offset: 0, weight: 'thin' },  // long-short-long
    phantom:     { dash: [10, 2, 2, 2, 2, 2], offset: 0, weight: 'thin' },
  };

  v2.lineStyles.LINE_STYLES = LINE_STYLES;

  /** @param {string} name @returns {?object} */
  v2.lineStyles.get = function (name) {
    return Object.prototype.hasOwnProperty.call(LINE_STYLES, name) ? LINE_STYLES[name] : null;
  };

  /** @returns {string[]} */
  v2.lineStyles.names = function () { return Object.keys(LINE_STYLES); };
})();
