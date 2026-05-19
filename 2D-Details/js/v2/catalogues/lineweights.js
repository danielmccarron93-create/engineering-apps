/**
 * StructDraw v2 · Catalogue Layer · lineweights
 * LAYER: catalogue — the AS 1100 lineweight table. Pure data.
 * READS:  window.v2
 * WRITES: window.v2.lineweights.{LINEWEIGHTS, get, names}
 *
 * Classic <script>, no build step. Every renderer pulls weights from this
 * table — there is no `ctx.lineWidth = 0.5` literal anywhere in v2 render code.
 * Values are the intended ink width on the physical sheet, in millimetres.
 * See 04-catalogue-system.md §6.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.lineweights = v2.lineweights || {};

  /** Ink width on the physical sheet, in millimetres (AS 1100). */
  const LINEWEIGHTS = {
    thick:  0.70,  // AS 1100 cut + heavy visible outlines
    medium: 0.50,  // AS 1100 standard visible lines
    thin:   0.25,  // AS 1100 hidden / centre / dimension lines
    fine:   0.18,  // AS 1100 construction lines / hatch infill
  };

  v2.lineweights.LINEWEIGHTS = LINEWEIGHTS;

  /** @param {string} name @returns {?number} weight in mm, or null */
  v2.lineweights.get = function (name) {
    return Object.prototype.hasOwnProperty.call(LINEWEIGHTS, name) ? LINEWEIGHTS[name] : null;
  };

  /** @returns {string[]} */
  v2.lineweights.names = function () { return Object.keys(LINEWEIGHTS); };
})();
