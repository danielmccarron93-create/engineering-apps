/**
 * StructDraw v2 · Render Layer · canvas2d · draw plate
 * LAYER: render/canvas2d — Plate draw function. Consumes a RenderContext and
 *        emits primitives via ctx.backend. The Phase 0f plate is the pilot
 *        feature for v2 (per 08-pilot-feature.md), so this draw fn gets
 *        treated as the model — it dispatches via `plate:*` (the wildcard
 *        fallback) so every plate family routes through here.
 * READS:  window.v2.render.primitives.{polygon, hatch}
 * WRITES: registers itself at `plate:*` (the category-generic fallback the
 *           dispatch table consults when no plate-family-specific draw fn is
 *           registered).
 *
 * Classic <script>, no build step. The migrator can produce either:
 *   - a model-level Plate geometry (3D polygon vertices), from objects3D.plate
 *   - a view-local Region geometry (2D polygon vertices), from entities2D.plate2
 * Both shapes carry a polygon; this draw fn projects through the view, then
 * emits a closed polygon primitive with AS 1100 cut hatching when the cut
 * class is 'cut'. Mirrors v1's `js/32-draw-plate.js`.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.render = v2.render || {};
  v2.render.canvas2d = v2.render.canvas2d || {};

  function projectPlatePoints(geom, view) {
    if (!geom) return [];
    if (geom.kind === 'plate') {
      // model-level: project the 3D polygon through the view.
      return (geom.polygon || []).map(function (p) { return v2.render.projectPoint(view, p); });
    }
    if (geom.kind === 'region') {
      // view-local: 2D points already in view space.
      if (geom.viewId != null) {
        return (geom.polygon || []).map(function (p) {
          return { x: +p.x, y: +p.y };
        });
      }
      return (geom.polygon || []).map(function (p) { return v2.render.projectPoint(view, p); });
    }
    if (geom.kind === 'polyline') {
      // Some v1 plate variants migrated as polyline — treat as a closed outline.
      return (geom.points || []).map(function (p) { return { x: +p.x, y: +p.y }; });
    }
    return v2.render.projectGeometry2D(geom, view);
  }

  function drawPlate(element, ctx) {
    if (!element || !ctx || !ctx.backend) return;
    const view = ctx.view;
    const pts = projectPlatePoints(element.geometry, view);
    if (pts.length < 2) return;
    if (pts.length === 2) {
      // Degenerate plate — render as the outline line so dispatch fidelity holds.
      ctx.backend.draw(v2.render.primitives.line(pts[0], pts[1], {
        weight: 'medium', style: 'solid', color: ctx.color,
      }));
      return;
    }

    const isCut = ctx.cutClass === 'cut';
    const outlineWeight = isCut ? 'thick' : 'medium';
    const fillAlpha = isCut ? 0.10 : 0.06;
    ctx.backend.draw(v2.render.primitives.polygon(pts, {
      outline: { weight: outlineWeight, style: 'solid', color: ctx.color },
      fill:    { color: ctx.color, alpha: fillAlpha },
    }));
    if (isCut && ctx.hatchCut) {
      ctx.backend.draw(v2.render.primitives.hatch(pts, 'as1100-steel-45', {
        color: ctx.color, alpha: 0.4,
      }));
    }
  }

  v2.render.canvas2d.registerRenderer('plate:*', drawPlate);
  v2.render.canvas2d.drawPlate = drawPlate;
})();
