/**
 * StructDraw v2 · Render Layer · canvas2d · hit-test plate
 * LAYER: render/canvas2d — hit-test fn for plates. Consumes a RenderContext
 *        and returns `{inside, distance, vertex?}` or null.
 * READS:  window.v2.render.{projectPoint, projectGeometry2D}
 * WRITES: registers itself at `plate:*`.
 *
 * Classic <script>, no build step. The hit predicate is "the cursor lies
 * inside the projected plate polygon OR within `tolerance` view-mm of any
 * polygon edge or vertex." Mirrors the v1 plate hit-test in `js/10-bounds-
 * hittest.js`. Hit-test for a fastener-style point instance is implicit in
 * the `fastener:*` dispatch path; this file covers the plate / region case.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.render = v2.render || {};
  v2.render.canvas2d = v2.render.canvas2d || {};

  /** Standard ray-casting point-in-polygon. */
  function pointInPoly(p, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      const intersect = ((yi > p.y) !== (yj > p.y)) &&
        (p.x < (xj - xi) * (p.y - yi) / (yj - yi + 1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function distanceToSegment(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-12) {
      const ex = p.x - a.x, ey = p.y - a.y;
      return Math.sqrt(ex * ex + ey * ey);
    }
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    const cx = a.x + t * dx, cy = a.y + t * dy;
    const ex = p.x - cx, ey = p.y - cy;
    return Math.sqrt(ex * ex + ey * ey);
  }

  /** Minimum distance from p to any edge of the closed polygon. */
  function distanceToPolygon(p, poly) {
    let best = Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const d = distanceToSegment(p, poly[j], poly[i]);
      if (d < best) best = d;
    }
    return best;
  }

  function hitTestPlate(element, view, point2D, ctx) {
    void ctx;
    const g = element && element.geometry;
    if (!g) return null;
    // Project plate or region polygon into 2D.
    let poly;
    if (g.kind === 'plate') {
      poly = (g.polygon || []).map(function (p) { return v2.render.projectPoint(view, p); });
    } else if (g.kind === 'region') {
      poly = g.viewId != null
        ? (g.polygon || []).map(function (p) { return { x: +p.x, y: +p.y }; })
        : (g.polygon || []).map(function (p) { return v2.render.projectPoint(view, p); });
    } else if (g.kind === 'polyline') {
      poly = (g.points || []).map(function (p) { return { x: +p.x, y: +p.y }; });
    } else {
      return null;
    }
    if (poly.length < 3) return null;
    const inside = pointInPoly(point2D, poly);
    const dEdge  = distanceToPolygon(point2D, poly);
    const tol = 3;
    if (!inside && dEdge > tol) return null;
    return { inside: inside, distance: inside ? 0 : dEdge };
  }

  v2.render.canvas2d.registerHitTest('plate:*', hitTestPlate);
  v2.render.canvas2d.hitTestPlate = hitTestPlate;
})();
