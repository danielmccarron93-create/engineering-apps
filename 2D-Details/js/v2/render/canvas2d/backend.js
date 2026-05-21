/**
 * StructDraw v2 · Render Layer · canvas2d · backend
 * LAYER: render/canvas2d — translates backend-agnostic primitives into
 *        CanvasRenderingContext2D calls. Pure rendering — no model awareness,
 *        no catalogue lookup, no DOM beyond the canvas it was given.
 * READS:  window.v2.{lineweights, lineStyles, hatches, render.primitives}
 * WRITES: window.v2.render.canvas2d.{makeBackend}
 *
 * Classic <script>, no build step (CLAUDE.md rules 3 & 8). The backend is the
 * one v2 file that "knows" canvas2d; everything else is backend-agnostic. A
 * Phase 0g three.js backend slots in alongside this file as
 * `js/v2/render/threejs/backend.js` and consumes the same primitive contract.
 * See 05-render-pipeline.md §§2, 9.
 *
 * --- HOW THE BACKEND IS USED ----------------------------------------------
 * Draw functions never call `ctx.lineTo` directly — they push primitives
 * through this backend:
 *
 *   const backend = v2.render.canvas2d.makeBackend(canvas2dCtx, { ppm: 2 });
 *   backend.draw(v2.render.primitives.line({x:0,y:0}, {x:100,y:0}, {weight:'thick'}));
 *
 * The backend resolves the primitive's `weight` / `style` / `color` through the
 * catalogues (v2.lineweights × v2.lineStyles × theme CSS vars), multiplies
 * the lineweight by `ppm` (pixels-per-sheet-mm — `viewport.zoom / drawingScale`
 * in v1 terms; 1.0 for the JSDOM test where coordinates ARE pixels), and
 * stamps the result on the canvas context.
 *
 * The backend also exposes a `record` array — every primitive that flows
 * through `draw()` is appended. Tests inspect that array directly instead of
 * pixel-sampling a canvas (which JSDOM does not implement). In the browser the
 * recording is on by default with a small cap so a long-running session does
 * not leak memory; production deployments can pass `{ record: false }` to
 * disable it entirely.
 *
 * --- WHAT A NULL CANVAS DOES ----------------------------------------------
 * In a JSDOM test there is no real CanvasRenderingContext2D
 * (`getContext('2d')` returns null). `makeBackend(null, …)` produces a backend
 * that still RECORDS every primitive but issues no canvas calls. The
 * RENDERERS dispatch table runs end-to-end, the test reads the record, and
 * the browser path is unchanged.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.render = v2.render || {};
  v2.render.canvas2d = v2.render.canvas2d || {};

  const DEFAULT_RECORD_CAP = 10000;

  /** Resolve a lineweight key OR a literal mm number into mm. */
  function resolveLineweight(weight) {
    if (typeof weight === 'number' && isFinite(weight)) return weight;
    if (v2.lineweights && typeof v2.lineweights.get === 'function') {
      const w = v2.lineweights.get(weight);
      if (typeof w === 'number') return w;
    }
    return 0.5;
  }

  /** Resolve a line-style key into a canvas2d `setLineDash` array (mm scale). */
  function resolveDashPattern(style) {
    if (!style || style === 'solid') return [];
    if (v2.lineStyles && typeof v2.lineStyles.get === 'function') {
      const s = v2.lineStyles.get(style);
      if (s && Array.isArray(s.dash)) return s.dash.slice();
    }
    return [];
  }

  /**
   * Resolve a CSS-friendly colour string. Theme variables are expanded against
   * `document.body`'s computed style; JSDOM doesn't compute CSS variables so
   * `currentColor` and unresolved `var(...)` strings fall back to the
   * `colorOverride` map (or `'#000000'`). Returned value is always something
   * the canvas accepts as `strokeStyle` / `fillStyle`.
   */
  function resolveColor(input, colorOverride) {
    if (typeof input !== 'string' || input.length === 0) return '#000000';
    if (input === 'currentColor' || input === 'inherit') {
      return (colorOverride && colorOverride.entity) || '#000000';
    }
    if (input.charAt(0) === 'v' && input.indexOf('var(') === 0) {
      // `var(--name, fallback)` — pull the name out and try a CSS lookup.
      const inside = input.slice(4, input.length - 1);
      const comma = inside.indexOf(',');
      const name = (comma === -1 ? inside : inside.slice(0, comma)).trim();
      const fallback = comma === -1 ? '' : inside.slice(comma + 1).trim();
      if (typeof document !== 'undefined' && document.body && typeof getComputedStyle === 'function') {
        try {
          const cs = getComputedStyle(document.body);
          const v = cs.getPropertyValue(name).trim();
          if (v) return v;
        } catch (e) { /* fall through */ }
      }
      if (colorOverride && Object.prototype.hasOwnProperty.call(colorOverride, name)) {
        return colorOverride[name];
      }
      if (fallback) return fallback;
      return '#000000';
    }
    return input;
  }

  /**
   * Apply opacity to a colour string. Used by the polygon / hatch primitives
   * where the same colour is rendered at a fractional fill alpha.
   */
  function withAlpha(color, alpha) {
    if (typeof alpha !== 'number' || alpha === 1) return color;
    // Quick path for #rrggbb hex. Anything more exotic — rgba(), hsl() — is
    // left unchanged; the backend sets globalAlpha around the fill instead.
    if (typeof color === 'string' && color.length === 7 && color.charAt(0) === '#') {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      if (isFinite(r) && isFinite(g) && isFinite(b)) {
        return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
      }
    }
    return color;
  }

  /**
   * Build a backend bound to a canvas context. `ctx2d` may be null — in that
   * case the backend records primitives but issues no canvas calls.
   *
   * @param {?CanvasRenderingContext2D} ctx2d
   * @param {object} [opts]
   * @param {number} [opts.ppm=1]           pixels per sheet-mm (lineweights × ppm = canvas px)
   * @param {boolean} [opts.record=true]    capture primitives into backend.record
   * @param {number} [opts.recordCap]
   * @param {?object} [opts.colorOverride]  { entity, '--mat-steel': ..., ... }
   * @returns {Backend}
   */
  function makeBackend(ctx2d, opts) {
    opts = opts || {};
    const ppm = typeof opts.ppm === 'number' && opts.ppm > 0 ? opts.ppm : 1;
    const recording = opts.record !== false;
    const recordCap = typeof opts.recordCap === 'number' ? opts.recordCap : DEFAULT_RECORD_CAP;
    const colorOverride = opts.colorOverride || null;
    const record = [];
    const dispatchCounts = { line: 0, polyline: 0, polygon: 0, arc: 0, text: 0, hatch: 0, unknown: 0 };

    function note(primitive) {
      if (!recording) return;
      if (record.length >= recordCap) return;
      record.push(primitive);
    }

    function applyLineStyle(canvasCtx, weight, style, color) {
      canvasCtx.lineWidth = Math.max(0.1, resolveLineweight(weight) * ppm);
      canvasCtx.strokeStyle = resolveColor(color, colorOverride);
      canvasCtx.setLineDash(resolveDashPattern(style));
    }

    function drawLine(p) {
      note(p); dispatchCounts.line++;
      if (!ctx2d) return;
      ctx2d.save();
      applyLineStyle(ctx2d, p.weight, p.style, p.color);
      ctx2d.beginPath();
      ctx2d.moveTo(p.from.x * ppm, p.from.y * ppm);
      ctx2d.lineTo(p.to.x   * ppm, p.to.y   * ppm);
      ctx2d.stroke();
      ctx2d.restore();
    }

    function drawPolyline(p) {
      note(p); dispatchCounts.polyline++;
      if (!ctx2d || !p.points.length) return;
      ctx2d.save();
      applyLineStyle(ctx2d, p.weight, p.style, p.color);
      ctx2d.beginPath();
      ctx2d.moveTo(p.points[0].x * ppm, p.points[0].y * ppm);
      for (let i = 1; i < p.points.length; i++) {
        ctx2d.lineTo(p.points[i].x * ppm, p.points[i].y * ppm);
      }
      if (p.closed) ctx2d.closePath();
      ctx2d.stroke();
      ctx2d.restore();
    }

    function drawPolygon(p) {
      note(p); dispatchCounts.polygon++;
      if (!ctx2d || !p.points.length) return;
      ctx2d.save();
      ctx2d.beginPath();
      ctx2d.moveTo(p.points[0].x * ppm, p.points[0].y * ppm);
      for (let i = 1; i < p.points.length; i++) {
        ctx2d.lineTo(p.points[i].x * ppm, p.points[i].y * ppm);
      }
      ctx2d.closePath();
      if (p.fill && typeof p.fill.alpha === 'number' && p.fill.alpha > 0) {
        ctx2d.fillStyle = withAlpha(resolveColor(p.fill.color, colorOverride), p.fill.alpha);
        ctx2d.fill();
      }
      if (p.outline) {
        applyLineStyle(ctx2d, p.outline.weight, p.outline.style, p.outline.color);
        ctx2d.stroke();
      }
      ctx2d.restore();
    }

    function drawArc(p) {
      note(p); dispatchCounts.arc++;
      if (!ctx2d || !(p.radius > 0)) return;
      ctx2d.save();
      ctx2d.beginPath();
      ctx2d.arc(p.centre.x * ppm, p.centre.y * ppm, p.radius * ppm,
                p.startAngle, p.endAngle);
      if (p.fill && typeof p.fill.alpha === 'number' && p.fill.alpha > 0) {
        ctx2d.fillStyle = withAlpha(resolveColor(p.fill.color, colorOverride), p.fill.alpha);
        ctx2d.fill();
      }
      applyLineStyle(ctx2d, p.weight, p.style, p.color);
      ctx2d.stroke();
      ctx2d.restore();
    }

    function drawText(p) {
      note(p); dispatchCounts.text++;
      if (!ctx2d || !p.text) return;
      ctx2d.save();
      ctx2d.fillStyle = resolveColor(p.color, colorOverride);
      const pxSize = Math.max(1, p.fontSize * ppm);
      ctx2d.font = pxSize + 'px system-ui, sans-serif';
      ctx2d.textAlign = (p.align === 'centre' || p.align === 'center') ? 'center'
                      : (p.align === 'right' ? 'right' : 'left');
      ctx2d.textBaseline = p.baseline === 'top'    ? 'top'
                         : p.baseline === 'middle' ? 'middle'
                         : p.baseline === 'bottom' ? 'bottom' : 'alphabetic';
      if (p.rotation) {
        ctx2d.translate(p.anchor.x * ppm, p.anchor.y * ppm);
        ctx2d.rotate(p.rotation);
        ctx2d.fillText(p.text, 0, 0);
      } else {
        ctx2d.fillText(p.text, p.anchor.x * ppm, p.anchor.y * ppm);
      }
      ctx2d.restore();
    }

    /** Crosshatch the polygon clip region with parallel lines at `angle`. */
    function drawCrosshatchLayer(p, layer, color) {
      if (!ctx2d) return;
      const spacing = (layer.spacing > 0 ? layer.spacing : 2) * ppm;
      const weightMm = resolveLineweight(layer.weight || 'fine');
      // Bbox of the polygon in canvas pixels.
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let i = 0; i < p.polygon.length; i++) {
        const x = p.polygon[i].x * ppm, y = p.polygon[i].y * ppm;
        if (x < minX) minX = x; if (y < minY) minY = y;
        if (x > maxX) maxX = x; if (y > maxY) maxY = y;
      }
      if (!isFinite(minX) || !isFinite(maxX)) return;
      ctx2d.save();
      ctx2d.beginPath();
      ctx2d.moveTo(p.polygon[0].x * ppm, p.polygon[0].y * ppm);
      for (let i = 1; i < p.polygon.length; i++) {
        ctx2d.lineTo(p.polygon[i].x * ppm, p.polygon[i].y * ppm);
      }
      ctx2d.closePath();
      ctx2d.clip();
      ctx2d.strokeStyle = withAlpha(resolveColor(color, colorOverride), p.alpha != null ? p.alpha : 0.5);
      ctx2d.lineWidth = Math.max(0.1, weightMm * ppm);
      ctx2d.setLineDash([]);
      // Parametric scan in direction perpendicular to `angle`.
      const ang = (layer.angle || 45) * Math.PI / 180;
      const cosA = Math.cos(ang), sinA = Math.sin(ang);
      // Project the bbox onto the perpendicular axis to find the d-range.
      const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      const halfDiag = Math.hypot(maxX - minX, maxY - minY) / 2 + spacing;
      for (let d = -halfDiag; d <= halfDiag; d += spacing) {
        // Line through (cx + d*-sinA, cy + d*cosA) along (cosA, sinA).
        const px = cx + d * -sinA, py = cy + d * cosA;
        const x1 = px - cosA * halfDiag * 2, y1 = py - sinA * halfDiag * 2;
        const x2 = px + cosA * halfDiag * 2, y2 = py + sinA * halfDiag * 2;
        ctx2d.beginPath();
        ctx2d.moveTo(x1, y1);
        ctx2d.lineTo(x2, y2);
        ctx2d.stroke();
      }
      ctx2d.restore();
    }

    function drawHatch(p) {
      note(p); dispatchCounts.hatch++;
      if (!ctx2d || !p.polygon || p.polygon.length < 3) return;
      const pattern = (v2.hatches && typeof v2.hatches.get === 'function')
        ? v2.hatches.get(p.pattern) : null;
      if (!pattern || pattern.type === 'none') return;
      const color = p.color === 'inherit'
        ? (pattern.color === 'inherit' ? 'currentColor' : pattern.color)
        : p.color;
      if (pattern.type === 'crosshatch' || pattern.type === 'lines') {
        drawCrosshatchLayer(p, pattern, color);
      } else if (pattern.type === 'composite' && Array.isArray(pattern.layers)) {
        for (let i = 0; i < pattern.layers.length; i++) {
          drawCrosshatchLayer(p, pattern.layers[i], color);
        }
      }
      // 'dot' / 'pattern' types — render as a no-op for Phase 0f scaffold;
      // they record into the primitive log so determinism still asserts.
    }

    function draw(primitive) {
      if (!primitive || typeof primitive.kind !== 'string') {
        dispatchCounts.unknown++;
        return;
      }
      switch (primitive.kind) {
        case 'line':     return drawLine(primitive);
        case 'polyline': return drawPolyline(primitive);
        case 'polygon':  return drawPolygon(primitive);
        case 'arc':      return drawArc(primitive);
        case 'text':     return drawText(primitive);
        case 'hatch':    return drawHatch(primitive);
        default:
          dispatchCounts.unknown++;
          return;
      }
    }

    /** Erase the record + dispatch counts (used between render passes). */
    function reset() {
      record.length = 0;
      dispatchCounts.line = dispatchCounts.polyline = dispatchCounts.polygon = 0;
      dispatchCounts.arc = dispatchCounts.text = dispatchCounts.hatch = 0;
      dispatchCounts.unknown = 0;
    }

    /** Clear the underlying canvas if one was supplied. */
    function clearCanvas(width, height) {
      if (!ctx2d) return;
      ctx2d.save();
      ctx2d.setTransform(1, 0, 0, 1, 0, 0);
      ctx2d.clearRect(0, 0, width || 0, height || 0);
      ctx2d.restore();
    }

    return {
      name: 'canvas2d',
      ctx2d: ctx2d,
      ppm: ppm,
      record: record,
      dispatchCounts: dispatchCounts,
      draw: draw,
      reset: reset,
      clearCanvas: clearCanvas,
      // Surface the resolvers so draw functions or tests can sanity-check.
      resolveLineweight: resolveLineweight,
      resolveDashPattern: resolveDashPattern,
      resolveColor: function (c) { return resolveColor(c, colorOverride); },
    };
  }

  v2.render.canvas2d.makeBackend = makeBackend;
})();
