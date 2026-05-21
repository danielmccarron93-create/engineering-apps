/**
 * StructDraw v2 · Render Layer · canvas2d · hit-test linear member
 * LAYER: render/canvas2d — hit-test fn for linear members (beam / column /
 *        brace / timber member). Consumes a RenderContext and returns either
 *        a hit object `{distance, t, segment}` or null.
 * READS:  window.v2.render.projectPoint
 * WRITES: registers itself at `beam:*`, `column:*`, `brace:*`, `timber-member:*`.
 *
 * Classic <script>, no build step. The hit predicate is "the cursor lies
 * within `tolerance` view-mm of the projected centreline." Mirrors the v1
 * member hit-test in `js/10-bounds-hittest.js` for selection equivalence.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.render = v2.render || {};
  v2.render.canvas2d = v2.render.canvas2d || {};

  /** Distance from `p` to the segment (a, b). Returns { distance, t }. */
  function distanceToSegment(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-12) {
      const ex = p.x - a.x, ey = p.y - a.y;
      return { distance: Math.sqrt(ex * ex + ey * ey), t: 0 };
    }
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    const cx = a.x + t * dx, cy = a.y + t * dy;
    const ex = p.x - cx, ey = p.y - cy;
    return { distance: Math.sqrt(ex * ex + ey * ey), t: t };
  }

  function hitTestLinear(element, view, point2D, ctx) {
    const g = element && element.geometry;
    if (!g || g.kind !== 'linear') return null;
    const a = view ? v2.render.projectPoint(view, g.start) : { x: g.start.x, y: g.start.y };
    const b = view ? v2.render.projectPoint(view, g.end)   : { x: g.end.x,   y: g.end.y   };
    // Tolerance: half the projected section depth if known, else 3 view-mm.
    let tol = 3;
    if (ctx && ctx.type) {
      if (typeof ctx.type.d === 'number')      tol = Math.max(tol, ctx.type.d / 2);
      else if (typeof ctx.type.B === 'number') tol = Math.max(tol, ctx.type.B / 2);
    }
    const r = distanceToSegment(point2D, a, b);
    if (r.distance > tol) return null;
    return { distance: r.distance, t: r.t, segment: { from: a, to: b } };
  }

  v2.render.canvas2d.registerHitTest('beam:*',          hitTestLinear);
  v2.render.canvas2d.registerHitTest('column:*',        hitTestLinear);
  v2.render.canvas2d.registerHitTest('brace:*',         hitTestLinear);
  v2.render.canvas2d.registerHitTest('timber-member:*', hitTestLinear);
  v2.render.canvas2d.hitTestLinear = hitTestLinear;
})();
