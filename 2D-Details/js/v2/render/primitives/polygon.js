/**
 * StructDraw v2 · Render Layer · primitives · polygon
 * LAYER: render/primitives — backend-agnostic polygon primitive. Pure data.
 * READS:  (nothing)
 * WRITES: window.v2.render.primitives.polygon
 *
 * Classic <script>, no build step. A closed polygon with separate stroke +
 * fill controls. The backend strokes the outline at `outline.weight` and fills
 * the interior at `fill.color` × `fill.alpha`. See 05-render-pipeline.md §§2, 9.
 *
 * --- JSDoc shape ----------------------------------------------------------
 * @typedef {object} PolygonPrimitive
 * @property {'polygon'} kind
 * @property {Point2D[]} points       view-local 2D vertices, sheet-mm, >= 3
 * @property {object}    outline      { weight, style, color } — stroke
 * @property {object}    fill         { color, alpha } — fill (alpha 0 = skip)
 * --------------------------------------------------------------------------
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.render = v2.render || {};
  v2.render.primitives = v2.render.primitives || {};

  /**
   * @param {Point2D[]} points
   * @param {object} [opts]
   * @returns {PolygonPrimitive}
   */
  function polygon(points, opts) {
    opts = opts || {};
    const pts = (Array.isArray(points) ? points : []).map(function (p) {
      return { x: +p.x, y: +p.y };
    });
    return {
      kind: 'polygon',
      points: pts,
      outline: {
        weight: (opts.outline && opts.outline.weight != null) ? opts.outline.weight : 'medium',
        style:  (opts.outline && opts.outline.style  != null) ? opts.outline.style  : 'solid',
        color:  (opts.outline && opts.outline.color  != null) ? opts.outline.color  : 'currentColor',
      },
      fill: {
        color: (opts.fill && opts.fill.color != null) ? opts.fill.color : 'currentColor',
        alpha: (opts.fill && typeof opts.fill.alpha === 'number') ? opts.fill.alpha : 0,
      },
    };
  }

  v2.render.primitives.polygon = polygon;
})();
