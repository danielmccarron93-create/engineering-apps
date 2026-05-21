/**
 * StructDraw v2 · Render Layer · primitives · polyline
 * LAYER: render/primitives — backend-agnostic polyline primitive. Pure data.
 * READS:  (nothing)
 * WRITES: window.v2.render.primitives.polyline
 *
 * Classic <script>, no build step. A multi-segment continuous stroke; the
 * backend translates it into a single canvas path (or DXF POLYLINE entity).
 * See 05-render-pipeline.md §§2, 9.
 *
 * --- JSDoc shape ----------------------------------------------------------
 * @typedef {object} PolylinePrimitive
 * @property {'polyline'} kind
 * @property {Point2D[]}  points     view-local 2D vertices, sheet-mm, >= 2
 * @property {boolean}    closed     when true the backend adds a closing segment
 * @property {string}     weight     lineweights key or literal mm
 * @property {string}     style      line-styles key
 * @property {string}     color
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
   * @returns {PolylinePrimitive}
   */
  function polyline(points, opts) {
    opts = opts || {};
    const pts = (Array.isArray(points) ? points : []).map(function (p) {
      return { x: +p.x, y: +p.y };
    });
    return {
      kind: 'polyline',
      points: pts,
      closed: opts.closed === true,
      weight: opts.weight != null ? opts.weight : 'medium',
      style:  opts.style  != null ? opts.style  : 'solid',
      color:  opts.color  != null ? opts.color  : 'currentColor',
    };
  }

  v2.render.primitives.polyline = polyline;
})();
