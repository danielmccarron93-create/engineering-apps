/**
 * StructDraw v2 · Render Layer · canvas2d · draw beam SHS
 * LAYER: render/canvas2d — Square Hollow Section draw function. Consumes a
 *        RenderContext and emits primitives via ctx.backend.
 * READS:  window.v2.render.primitives.{line, polygon, hatch, text}
 * WRITES: registers itself at `beam:shs` and `column:shs`.
 *
 * Classic <script>, no build step. SHS section dimensions come from the v2
 * catalogue's `beam-shs` Type rows (B = outer breadth, t = wall thickness).
 * Phase 0f scaffold draws:
 *   - PROJECTED: side-on outer rectangle (B × length) with hidden inner wall
 *     edges as thin-dash lines.
 *   - CUT: hollow square outline + AS 1100 steel hatch on the wall material.
 * The migrator stores LinearMember geometry (start / end in real-world mm);
 * the projection axis is start->end. Mirrors v1's `js/30-draw-shs.js` shape.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.render = v2.render || {};
  v2.render.canvas2d = v2.render.canvas2d || {};

  function num(n, dflt) {
    return (typeof n === 'number' && isFinite(n)) ? n : (dflt === undefined ? 0 : dflt);
  }

  /** SHS section dims from the catalogue Type — { B, t }. */
  function sectionFor(ctx) {
    const t = ctx.type;
    if (!t) return null;
    if (!(t.B > 0) || !(t.t > 0)) return null;
    return { B: t.B, t: t.t };
  }

  function drawBeamSHS(element, ctx) {
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
      ctx.backend.draw(v2.render.primitives.line(p1, p2, {
        weight: 'medium', style: 'solid', color: ctx.color,
      }));
      return;
    }

    if (len < 1e-6) {
      // Degenerate member — render the cut hollow square at the start.
      const hB = s.B / 2;
      const outer = [
        { x: p1.x - hB, y: p1.y - hB }, { x: p1.x + hB, y: p1.y - hB },
        { x: p1.x + hB, y: p1.y + hB }, { x: p1.x - hB, y: p1.y + hB },
      ];
      ctx.backend.draw(v2.render.primitives.polygon(outer, {
        outline: { weight: 'thick', style: 'solid', color: ctx.color },
        fill:    { color: ctx.color, alpha: 0.04 },
      }));
      return;
    }

    const ux = dx / len, uy = dy / len;
    const vx = -uy, vy = ux;
    const hB = s.B / 2;
    const hI = s.B / 2 - s.t;

    if (ctx.cutClass === 'cut') {
      // CUT: outer rectangle + inner rectangle, AS 1100 steel hatch on the wall.
      const c = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      const outer = [
        { x: c.x + (-hB) * ux + (-hB) * vx, y: c.y + (-hB) * uy + (-hB) * vy },
        { x: c.x + (+hB) * ux + (-hB) * vx, y: c.y + (+hB) * uy + (-hB) * vy },
        { x: c.x + (+hB) * ux + (+hB) * vx, y: c.y + (+hB) * uy + (+hB) * vy },
        { x: c.x + (-hB) * ux + (+hB) * vx, y: c.y + (-hB) * uy + (+hB) * vy },
      ];
      ctx.backend.draw(v2.render.primitives.polygon(outer, {
        outline: { weight: 'thick', style: 'solid', color: ctx.color },
        fill:    { color: ctx.color, alpha: 0.06 },
      }));
      if (hI > 0) {
        const inner = [
          { x: c.x + (-hI) * ux + (-hI) * vx, y: c.y + (-hI) * uy + (-hI) * vy },
          { x: c.x + (+hI) * ux + (-hI) * vx, y: c.y + (+hI) * uy + (-hI) * vy },
          { x: c.x + (+hI) * ux + (+hI) * vx, y: c.y + (+hI) * uy + (+hI) * vy },
          { x: c.x + (-hI) * ux + (+hI) * vx, y: c.y + (-hI) * uy + (+hI) * vy },
        ];
        ctx.backend.draw(v2.render.primitives.polygon(inner, {
          outline: { weight: 'thin', style: 'thin-dash', color: ctx.color },
          fill:    { color: ctx.color, alpha: 0 },
        }));
      }
      if (ctx.hatchCut) {
        // Hatch the WALL only by clipping over the outer polygon — the
        // pattern is dense enough that the inner edges still read.
        ctx.backend.draw(v2.render.primitives.hatch(outer, 'as1100-steel-45', {
          color: ctx.color, alpha: 0.35,
        }));
      }
    } else {
      // PROJECTED: side-on rectangle B × length, hidden inner edges.
      const o1 = { x: p1.x + vx * hB, y: p1.y + vy * hB };
      const o2 = { x: p2.x + vx * hB, y: p2.y + vy * hB };
      const o3 = { x: p2.x - vx * hB, y: p2.y - vy * hB };
      const o4 = { x: p1.x - vx * hB, y: p1.y - vy * hB };
      ctx.backend.draw(v2.render.primitives.polygon([o1, o2, o3, o4], {
        outline: { weight: 'medium', style: 'solid', color: ctx.color },
        fill:    { color: ctx.color, alpha: 0.04 },
      }));
      if (hI > 0) {
        const i1 = { x: p1.x + vx * hI, y: p1.y + vy * hI };
        const i2 = { x: p2.x + vx * hI, y: p2.y + vy * hI };
        const i3 = { x: p2.x - vx * hI, y: p2.y - vy * hI };
        const i4 = { x: p1.x - vx * hI, y: p1.y - vy * hI };
        ctx.backend.draw(v2.render.primitives.line(i1, i2, {
          weight: 'thin', style: 'thin-dash', color: ctx.color,
        }));
        ctx.backend.draw(v2.render.primitives.line(i3, i4, {
          weight: 'thin', style: 'thin-dash', color: ctx.color,
        }));
      }
    }

    // Centreline + label
    ctx.backend.draw(v2.render.primitives.line(p1, p2, {
      weight: 'thin', style: 'thin-dash', color: ctx.color,
    }));
    if (ctx.type && typeof ctx.type.id === 'string' && view) {
      const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      const lp = { x: mid.x + vx * (hB + 6), y: mid.y + vy * (hB + 6) };
      ctx.backend.draw(v2.render.primitives.text(lp, ctx.type.id, {
        fontSize: 2.5, align: 'centre', baseline: 'baseline', color: ctx.color,
      }));
    }
  }

  v2.render.canvas2d.registerRenderer('beam:shs', drawBeamSHS);
  v2.render.canvas2d.registerRenderer('column:shs', drawBeamSHS);
  v2.render.canvas2d.drawBeamSHS = drawBeamSHS;
})();
