/**
 * StructDraw v2 · Render Layer · primitives · line
 * LAYER: render/primitives — backend-agnostic line primitive. Pure data.
 * READS:  (nothing)
 * WRITES: window.v2.render.primitives.line
 *
 * Classic <script>, no build step. A primitive is a plain JSON-friendly object
 * describing "what to draw" — a backend (canvas2d / pdf / dxf / threejs)
 * translates it into the target API. The same primitive shape is the contract
 * the Phase 0g three.js renderer will receive. See 05-render-pipeline.md §§2,9.
 *
 * --- JSDoc shape ----------------------------------------------------------
 * @typedef {object} LinePrimitive
 * @property {'line'}  kind
 * @property {Point2D} from         view-local 2D, in sheet-mm
 * @property {Point2D} to
 * @property {string}  weight       lineweights catalogue key ('thick'|'medium'|'thin'|'fine')
 *                                  OR a literal mm number when the renderer
 *                                  needs a non-AS weight (e.g. construction).
 * @property {string}  style        line-styles catalogue key ('solid'|'thin-dash'|'centre'|'phantom')
 * @property {string}  color        CSS-friendly colour string ('#xxxxxx', 'var(--mat-steel)')
 * --------------------------------------------------------------------------
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.render = v2.render || {};
  v2.render.primitives = v2.render.primitives || {};

  /**
   * @param {Point2D} from
   * @param {Point2D} to
   * @param {object} [opts]
   * @returns {LinePrimitive}
   */
  function line(from, to, opts) {
    opts = opts || {};
    return {
      kind: 'line',
      from: { x: +from.x, y: +from.y },
      to:   { x: +to.x,   y: +to.y },
      weight: opts.weight != null ? opts.weight : 'medium',
      style:  opts.style  != null ? opts.style  : 'solid',
      color:  opts.color  != null ? opts.color  : 'currentColor',
    };
  }

  v2.render.primitives.line = line;
})();
