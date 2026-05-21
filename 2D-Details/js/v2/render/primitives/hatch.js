/**
 * StructDraw v2 · Render Layer · primitives · hatch
 * LAYER: render/primitives — backend-agnostic hatch primitive. Pure data.
 * READS:  (nothing)
 * WRITES: window.v2.render.primitives.hatch
 *
 * Classic <script>, no build step. The hatch primitive names a pattern from
 * `v2.hatches.HATCH_PATTERNS` and the polygon to fill. The backend looks up the
 * pattern descriptor (lines / crosshatch / dots / SVG tile / composite) and
 * emits the appropriate calls. AS 1100 steel cross-hatching becomes one
 * primitive — `pattern: 'as1100-steel-45'`. See 05-render-pipeline.md §§2, 9
 * and 04-catalogue-system.md §7.
 *
 * --- JSDoc shape ----------------------------------------------------------
 * @typedef {object} HatchPrimitive
 * @property {'hatch'}   kind
 * @property {Point2D[]} polygon       view-local 2D vertices, >= 3 (the clip region)
 * @property {string}    pattern       v2.hatches key ('as1100-steel-45', 'none', …)
 * @property {string}    color         CSS-friendly colour ('inherit' = use the
 *                                     pattern's own colour rule)
 * @property {number}    alpha         opacity multiplier, default 1.0
 * --------------------------------------------------------------------------
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.render = v2.render || {};
  v2.render.primitives = v2.render.primitives || {};

  /**
   * @param {Point2D[]} polygon
   * @param {string}    pattern
   * @param {object}    [opts]
   * @returns {HatchPrimitive}
   */
  function hatch(polygon, pattern, opts) {
    opts = opts || {};
    const poly = (Array.isArray(polygon) ? polygon : []).map(function (p) {
      return { x: +p.x, y: +p.y };
    });
    return {
      kind: 'hatch',
      polygon: poly,
      pattern: typeof pattern === 'string' ? pattern : 'none',
      color:   opts.color != null ? opts.color : 'inherit',
      alpha:   typeof opts.alpha === 'number' ? opts.alpha : 1,
    };
  }

  v2.render.primitives.hatch = hatch;
})();
