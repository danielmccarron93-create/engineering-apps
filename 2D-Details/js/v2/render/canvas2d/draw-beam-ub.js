/**
 * StructDraw v2 · Render Layer · canvas2d · draw beam UB
 * LAYER: render/canvas2d — Universal Beam draw function. Consumes a RenderContext
 *        and emits primitives via ctx.backend; never touches the catalogue
 *        directly (the context already carries the resolved type / material /
 *        lineweights / hatch / colour).
 * READS:  window.v2.render.primitives.{line, polyline, polygon, hatch, text}
 * WRITES: registers itself at `beam:ub` (and as the canvas-level renderer for
 *           the `column:ub` re-use key — a UB used as a column is the same
 *           profile / lineweights / hatch, only the orientation differs).
 *
 * Classic <script>, no build step (CLAUDE.md rules 3 & 8). For Phase 0f scaffold
 * the UB draws as:
 *   - PROJECTED (default in v1-migrated views): a side-on rectangle bf × length,
 *     centred on the projected centreline, plus a dashed CL.
 *   - CUT: the full AS 1100 I-section polygon (top/bottom flanges, web,
 *     re-entrant inner faces) with AS 1100 steel hatch over the cut area.
 * The migrator stores LinearMember geometry (start / end in real-world mm); the
 * view projects to 2D. The Phase 0f cut classifier returns 'projected' for
 * every element (see view-helpers.classifyCut) so the cut path is reachable
 * only by callers that override cutClass — the test exercises both.
 * Mirrors v1's `js/29-draw-ub.js` shape for browser pixel-similarity.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.render = v2.render || {};
  v2.render.canvas2d = v2.render.canvas2d || {};

  function num(n, dflt) {
    return (typeof n === 'number' && isFinite(n)) ? n : (dflt === undefined ? 0 : dflt);
  }

  /** UB section dims from the catalogue Type — { d, bf, tf, tw, r1 }. */
  function sectionFor(ctx) {
    const t = ctx.type;
    if (!t) return null;
    if (!(t.d > 0) || !(t.bf > 0) || !(t.tf > 0) || !(t.tw > 0)) return null;
    return { d: t.d, bf: t.bf, tf: t.tf, tw: t.tw, r1: num(t.r1) };
  }

  /** Return the 12-vertex polygon for a UB section centred at (cx, cy). */
  function iSectionPolygon(cx, cy, s) {
    const hd = s.d / 2, hbf = s.bf / 2, htw = s.tw / 2, tf = s.tf;
    const T = cy + hd, B = cy - hd, ftBot = T - tf, fbTop = B + tf;
    return [
      { x: cx - hbf, y: T },     { x: cx + hbf, y: T },
      { x: cx + hbf, y: ftBot }, { x: cx + htw, y: ftBot },
      { x: cx + htw, y: fbTop }, { x: cx + hbf, y: fbTop },
      { x: cx + hbf, y: B },     { x: cx - hbf, y: B },
      { x: cx - hbf, y: fbTop }, { x: cx - htw, y: fbTop },
      { x: cx - htw, y: ftBot }, { x: cx - hbf, y: ftBot },
    ];
  }

  /**
   * Draw a UB element. The migrator stores LinearMember geometry — start/end
   * in real-world mm. We project both endpoints to view-local 2D and treat the
   * line as the member axis. Without a per-view section orientation in Phase
   * 0f (the migrator does not yet attach a section frame), the depth axis is
   * perpendicular to the projected centreline in 2D.
   * @param {Element} element
   * @param {RenderContext} ctx
   */
  function drawBeamUB(element, ctx) {
    if (!element || !ctx || !ctx.backend) return;
    const g = element.geometry;
    if (!g || g.kind !== 'linear') return;

    const view = ctx.view;
    const p1 = view ? v2.render.projectPoint(view, g.start) : { x: num(g.start && g.start.x), y: num(g.start && g.start.y) };
    const p2 = view ? v2.render.projectPoint(view, g.end)   : { x: num(g.end   && g.end.x),   y: num(g.end   && g.end.y)   };
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    const s = sectionFor(ctx);

    if (!s) {
      // Catalogue lookup missing — draw the centreline at proj weight so the
      // element appears (dispatch fidelity) and a fixture without UB_DB doesn't
      // silently lose the element. This is the same posture as drawUB returning
      // early in v1 but emits a visible line instead.
      ctx.backend.draw(v2.render.primitives.line(p1, p2, {
        weight: 'medium', style: 'solid', color: ctx.color,
      }));
      return;
    }

    if (len < 1e-6) {
      // Degenerate member — render the cut section centred on the start.
      const poly = iSectionPolygon(p1.x, p1.y, s);
      ctx.backend.draw(v2.render.primitives.polygon(poly, {
        outline: { weight: 'thick', style: 'solid', color: ctx.color },
        fill:    { color: ctx.color, alpha: 0.06 },
      }));
      if (ctx.hatchCut) {
        ctx.backend.draw(v2.render.primitives.hatch(poly, 'as1100-steel-45', {
          color: ctx.color, alpha: 0.4,
        }));
      }
      return;
    }

    // Per-element 2D frame: axisU = along projected centreline, axisV = ⟂.
    const ux = dx / len, uy = dy / len;
    const vx = -uy, vy = ux;
    const hd = s.d / 2;

    if (ctx.cutClass === 'cut') {
      // CUT: AS 1100 I-section polygon, rotated and translated onto the member.
      const polyLocal = iSectionPolygon(0, 0, s);
      const poly = polyLocal.map(function (p) {
        return {
          x: (p1.x + p2.x) / 2 + p.x * ux + p.y * vx,
          y: (p1.y + p2.y) / 2 + p.x * uy + p.y * vy,
        };
      });
      ctx.backend.draw(v2.render.primitives.polygon(poly, {
        outline: { weight: 'thick', style: 'solid', color: ctx.color },
        fill:    { color: ctx.color, alpha: 0.06 },
      }));
      if (ctx.hatchCut) {
        ctx.backend.draw(v2.render.primitives.hatch(poly, 'as1100-steel-45', {
          color: ctx.color, alpha: 0.4,
        }));
      }
    } else {
      // PROJECTED: a side-view rectangle bf × length, centred on the axis.
      const c1 = { x: p1.x + vx * hd, y: p1.y + vy * hd };
      const c2 = { x: p2.x + vx * hd, y: p2.y + vy * hd };
      const c3 = { x: p2.x - vx * hd, y: p2.y - vy * hd };
      const c4 = { x: p1.x - vx * hd, y: p1.y - vy * hd };
      ctx.backend.draw(v2.render.primitives.polygon([c1, c2, c3, c4], {
        outline: { weight: 'medium', style: 'solid', color: ctx.color },
        fill:    { color: ctx.color, alpha: 0.03 },
      }));
      // Hidden web edges (dashed) — symmetric pair of thin-dashed lines.
      const htw = s.tw / 2;
      const w1a = { x: p1.x + vx * htw, y: p1.y + vy * htw };
      const w1b = { x: p2.x + vx * htw, y: p2.y + vy * htw };
      const w2a = { x: p1.x - vx * htw, y: p1.y - vy * htw };
      const w2b = { x: p2.x - vx * htw, y: p2.y - vy * htw };
      ctx.backend.draw(v2.render.primitives.line(w1a, w1b, {
        weight: 'thin', style: 'thin-dash', color: ctx.color,
      }));
      ctx.backend.draw(v2.render.primitives.line(w2a, w2b, {
        weight: 'thin', style: 'thin-dash', color: ctx.color,
      }));
    }

    // Centreline — solid thin (Phase 0f scaffold; a proper centreline-style
    // dash lands when the line-style catalogue's 'centre' pattern is consumed
    // by the backend's `setLineDash` path).
    ctx.backend.draw(v2.render.primitives.line(p1, p2, {
      weight: 'thin', style: 'thin-dash', color: ctx.color,
    }));

    // Label (the section id) — placed at the midpoint, projected sideways by
    // half-depth + 6 mm. v1's drawUB labels the top flange; v2 mirrors that.
    if (ctx.type && typeof ctx.type.id === 'string' && view) {
      const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      const lp = { x: mid.x + vx * (hd + 6), y: mid.y + vy * (hd + 6) };
      ctx.backend.draw(v2.render.primitives.text(lp, ctx.type.id, {
        fontSize: 2.5, align: 'centre', baseline: 'baseline', color: ctx.color,
      }));
    }
  }

  v2.render.canvas2d.registerRenderer('beam:ub', drawBeamUB);
  v2.render.canvas2d.registerRenderer('column:ub', drawBeamUB);
  v2.render.canvas2d.drawBeamUB = drawBeamUB;
})();
