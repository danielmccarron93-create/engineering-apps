/**
 * StructDraw v2 · Render Layer · canvas2d · draw fastener AS 1252 bolt
 * LAYER: render/canvas2d — AS 1252 bolt draw function. Consumes a RenderContext
 *        and emits primitives via ctx.backend.
 * READS:  window.v2.render.primitives.{arc, line}
 * WRITES: registers itself at `fastener:as1252-bolt` and provides the category
 *           generic `fastener:*` fallback so every fastener family (anchor,
 *           shear-stud, screw, …) routes through here until it gains its own
 *           draw function in a later phase.
 *
 * Classic <script>, no build step. AS 1252 bolts are normally placed point-on
 * to the viewer (head facing out — circle + crosshair) or in side profile
 * (along the bolt axis). Phase 0f scaffold renders the END-ON view: a stroked
 * circle at the head diameter and a crosshair through the centre. Side
 * profile (hex head + threaded shaft + tip) is a later expansion; for now the
 * end-on view is what STP 6011 baseplate / endplate / WSP details show 90% of
 * the time and what the existing fixtures exercise.
 *
 * Geometry:
 *   - PointInstance (model-level): location + normal vector. The Phase 0f
 *     renderer treats every fastener as end-on regardless of normal.
 *   - view-local annotation point (the migrator's fallback for V25 single-point
 *     fasteners): a one-point annotation with `points: [{x,y}]`.
 * Mirrors v1's `js/33-draw-bolt.js` end-on path.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.render = v2.render || {};
  v2.render.canvas2d = v2.render.canvas2d || {};

  function num(n, dflt) {
    return (typeof n === 'number' && isFinite(n)) ? n : (dflt === undefined ? 0 : dflt);
  }

  /** Where is this fastener on the view? Returns null when un-locatable. */
  function fastenerAnchor(element, view) {
    const g = element.geometry;
    if (!g) return null;
    if (g.kind === 'point') {
      return view ? v2.render.projectPoint(view, g.location)
                  : { x: num(g.location && g.location.x), y: num(g.location && g.location.y) };
    }
    if (g.kind === 'annotation' && Array.isArray(g.points) && g.points.length) {
      return { x: num(g.points[0].x), y: num(g.points[0].y) };
    }
    if (g.kind === 'region' && Array.isArray(g.polygon) && g.polygon.length) {
      // Some entity types migrated as a region — use the centroid.
      let sx = 0, sy = 0;
      for (let i = 0; i < g.polygon.length; i++) {
        sx += num(g.polygon[i].x); sy += num(g.polygon[i].y);
      }
      return { x: sx / g.polygon.length, y: sy / g.polygon.length };
    }
    return null;
  }

  /** Bolt outer / shaft diameters from the catalogue Type (M16 / M20 / …). */
  function bolt(ctx) {
    const t = ctx.type || {};
    // AS 1252 catalogue rows expose `d_shank` / `df` / `d` depending on history;
    // the Phase 0c family file uses `d` (nominal shank diameter in mm).
    const d = num(t.d, 0);
    return d > 0 ? { d: d, dHead: d * 1.6 } : null;
  }

  function drawAS1252Bolt(element, ctx) {
    if (!element || !ctx || !ctx.backend) return;
    const view = ctx.view;
    const anchor = fastenerAnchor(element, view);
    if (!anchor) return;
    const b = bolt(ctx);
    // Default head radius for an unsized fastener (e.g., a v1 `screw` migrated
    // before the v2 type id is set) — keeps dispatch fidelity for the test.
    const r = b ? (b.dHead / 2) : 3;

    // End-on circle (head outline)
    ctx.backend.draw(v2.render.primitives.arc(anchor, r, {
      weight: 'medium', style: 'solid', color: ctx.color,
    }));
    // Crosshair through the centre (AS 1100 fastener centreline pair)
    ctx.backend.draw(v2.render.primitives.line(
      { x: anchor.x - r, y: anchor.y },
      { x: anchor.x + r, y: anchor.y },
      { weight: 'thin', style: 'thin-dash', color: ctx.color }
    ));
    ctx.backend.draw(v2.render.primitives.line(
      { x: anchor.x, y: anchor.y - r },
      { x: anchor.x, y: anchor.y + r },
      { weight: 'thin', style: 'thin-dash', color: ctx.color }
    ));

    // Inner shaft circle (visible projected outline of the shaft below the head)
    if (b) {
      ctx.backend.draw(v2.render.primitives.arc(anchor, b.d / 2, {
        weight: 'thin', style: 'thin-dash', color: ctx.color,
      }));
    }
  }

  v2.render.canvas2d.registerRenderer('fastener:as1252-bolt', drawAS1252Bolt);
  // category-generic fallback — every other fastener family routes here until
  // it gains its own draw function (anchor, screw, shear-stud, …). Per the
  // RENDERERS lookup rules, a family-specific registration overrides this.
  v2.render.canvas2d.registerRenderer('fastener:*', drawAS1252Bolt);
  v2.render.canvas2d.drawAS1252Bolt = drawAS1252Bolt;
})();
