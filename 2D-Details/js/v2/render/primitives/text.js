/**
 * StructDraw v2 · Render Layer · primitives · text
 * LAYER: render/primitives — backend-agnostic text primitive. Pure data.
 * READS:  (nothing)
 * WRITES: window.v2.render.primitives.text
 *
 * Classic <script>, no build step. Text is the one primitive whose rendering
 * differs the most between backends (canvas2d rasterises, jsPDF embeds, DXF
 * emits an MTEXT entity, Three.js builds a sprite or a mesh). The primitive
 * stays text-shaped — backends handle the rest. See 05-render-pipeline.md §§2, 9.
 *
 * --- JSDoc shape ----------------------------------------------------------
 * @typedef {object} TextPrimitive
 * @property {'text'}    kind
 * @property {Point2D}   anchor        view-local 2D, sheet-mm
 * @property {string}    text
 * @property {number}    fontSize      sheet-mm height (AS 1100 uses 2.5/3.5/5)
 * @property {'left'|'centre'|'right'} align     horizontal alignment
 * @property {'top'|'middle'|'baseline'|'bottom'} baseline  vertical baseline
 * @property {string}    color
 * @property {?number}   rotation      radians (anti-clockwise), 0 default
 * --------------------------------------------------------------------------
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.render = v2.render || {};
  v2.render.primitives = v2.render.primitives || {};

  /**
   * @param {Point2D} anchor
   * @param {string}  text
   * @param {object}  [opts]
   * @returns {TextPrimitive}
   */
  function text(anchor, str, opts) {
    opts = opts || {};
    return {
      kind: 'text',
      anchor: { x: +anchor.x, y: +anchor.y },
      text: String(str),
      fontSize: typeof opts.fontSize === 'number' ? opts.fontSize : 2.5,
      align:    opts.align    != null ? opts.align    : 'left',
      baseline: opts.baseline != null ? opts.baseline : 'baseline',
      color:    opts.color    != null ? opts.color    : 'currentColor',
      rotation: typeof opts.rotation === 'number' ? opts.rotation : 0,
    };
  }

  v2.render.primitives.text = text;
})();
