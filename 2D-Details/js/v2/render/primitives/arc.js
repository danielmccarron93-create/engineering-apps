/**
 * StructDraw v2 · Render Layer · primitives · arc
 * LAYER: render/primitives — backend-agnostic arc / circle primitive. Pure data.
 * READS:  (nothing)
 * WRITES: window.v2.render.primitives.arc
 *
 * Classic <script>, no build step. Angles in RADIANS, measured anti-clockwise
 * from the +x axis (standard math convention). A full circle is start = 0,
 * end = 2π. The backend may render as a stroked arc, a filled disc, or both.
 * See 05-render-pipeline.md §§2, 9.
 *
 * --- JSDoc shape ----------------------------------------------------------
 * @typedef {object} ArcPrimitive
 * @property {'arc'}     kind
 * @property {Point2D}   centre        view-local 2D, sheet-mm
 * @property {number}    radius        sheet-mm
 * @property {number}    startAngle    radians
 * @property {number}    endAngle      radians
 * @property {string}    weight        lineweights key or literal mm
 * @property {string}    style         line-styles key
 * @property {string}    color
 * @property {?object}   fill          { color, alpha } — null for stroke-only
 * --------------------------------------------------------------------------
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.render = v2.render || {};
  v2.render.primitives = v2.render.primitives || {};

  /**
   * @param {Point2D} centre
   * @param {number}  radius
   * @param {object}  [opts]
   * @returns {ArcPrimitive}
   */
  function arc(centre, radius, opts) {
    opts = opts || {};
    return {
      kind: 'arc',
      centre: { x: +centre.x, y: +centre.y },
      radius: +radius,
      startAngle: typeof opts.startAngle === 'number' ? opts.startAngle : 0,
      endAngle:   typeof opts.endAngle   === 'number' ? opts.endAngle   : Math.PI * 2,
      weight: opts.weight != null ? opts.weight : 'medium',
      style:  opts.style  != null ? opts.style  : 'solid',
      color:  opts.color  != null ? opts.color  : 'currentColor',
      fill:   opts.fill   != null ? opts.fill   : null,
    };
  }

  v2.render.primitives.arc = arc;
})();
