'use strict';

// PDF export — raster + vector + canvas shim
// Extracted from dev/index.html lines 4754-5380 (2026-05-02 modular split)

// PDF EXPORT
// ============================================================
// Two paths:
//   - exportSheetToPDFVector (V15, default when V15_VECTOR_PDF=true): emits
//     true vector primitives via jsPDF by swapping `ctx` for a canvas-API shim
//     that translates draw ops into pdf.line/rect/circle/lines/text calls.
//     Output is razor-sharp at any zoom, scalable for issue drawings.
//   - exportSheetToPDFRaster (V14 fallback): renders to an off-screen canvas
//     at ~110 DPI and embeds as a JPEG. Retained because Three.js 3D isometric
//     is fundamentally raster; also as a safety net if the shim has an edge
//     case we haven't handled.
// Router: exportSheetToPDF() picks the path based on the feature flag.
// File name is derived from sheetInfo.drawingNo + revision.

// ---- PER-PAGE EXPORT HELPERS (multi-file-workspace Phase 5) ----
// A page can now carry its own size (native A1, or an imported PDF page's real
// A3/A4/portrait size). These helpers let the single-sheet + project exporters
// size each jsPDF page to the page's own dimensions and stamp a high-DPI raster
// of a PDF-background page under the vector overlay. Native A1 pages resolve to
// {[841,594],'landscape'} and no raster, so they export byte-identical to before.

// jsPDF page format + orientation for a page. Defaults to A1 landscape when the
// page (or its size) is missing, matching the historical hardcoded export.
function _pdfPageFormat(page) {
  const sz = (page && page.size && typeof page.size.w === 'number' && typeof page.size.h === 'number')
    ? page.size
    : { w: SHEET.W, h: SHEET.H };
  return {
    format: [sz.w, sz.h],
    orientation: (sz.w >= sz.h) ? 'landscape' : 'portrait',
    w: sz.w,
    h: sz.h,
  };
}

// If `page` has a PDF background, pre-render it to a ~300 DPI canvas and hand it
// to the background hook (window.setPdfExportRaster) so the export render pass
// draws it under the markup. Returns true when a raster was staged, false for a
// native page or when the PDF renderer/library is unavailable. Callers always
// clear the override (setPdfExportRaster(null)) after the page render regardless,
// so a staged raster can never leak into the next page.
async function _pdfStageBgRaster(file, page) {
  try {
    if (!page || !page.bg || page.bg.type !== 'pdf') return false;
    if (typeof window.renderPdfPageToCanvas !== 'function'
        || typeof window.setPdfExportRaster !== 'function') return false;
    const fmt = _pdfPageFormat(page);
    // ~300 DPI: device-px width = mm / 25.4 * 300. renderPdfPageToCanvas takes a
    // CSS-px width and multiplies by DPR internally, so divide by DPR to land on a
    // DPR-independent device-pixel target. (renderPdfPageToBitmap also clamps the
    // larger side to its MAX_RASTER_SIDE, bounding memory on big pages.)
    const dpr = (typeof DPR === 'number' && DPR > 0) ? DPR : 1;
    const targetDevPx = (fmt.w / 25.4) * 300;
    const targetCssW = targetDevPx / dpr;
    const cnv = await window.renderPdfPageToCanvas(file, page.bg, targetCssW);
    if (!cnv) return false;
    window.setPdfExportRaster(cnv);
    return true;
  } catch (e) {
    console.warn('[pdf] export bg raster staging failed:', e);
    try { window.setPdfExportRaster && window.setPdfExportRaster(null); } catch (_) {}
    return false;
  }
}

// async — staging a PDF-background page's high-DPI raster is async (pdf.js render
// returns a promise). All callers are fire-and-forget UI handlers, so returning a
// promise is harmless; awaiting here keeps the theme save/restore correctly
// bracketing the (possibly async) render pass.
async function exportSheetToPDF() {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert('PDF library not loaded. Check your internet connection and try again.');
    return;
  }
  // V23.1 — uncommitted wizard previews should never leak into exports.
  if (connWizState) connWizCancel();
  // Print output always looks better on a white sheet with black ink, so
  // temporarily force the classic theme for the duration of the export.
  // The raster and vector paths both read theme colours via getComputedStyle
  // during render(), so the switch must happen before the render pass.
  const body = document.body;
  const hadDark = body.classList.contains('theme-dark');
  const hadClassic = body.classList.contains('theme-classic');
  body.classList.remove('theme-dark');
  body.classList.add('theme-classic');
  try {
    if (V15_VECTOR_PDF) {
      try {
        await exportSheetToPDFVector();
        return;
      } catch (e) {
        // Fall through to raster so the user always gets *some* output.
        console.warn('Vector PDF export failed, falling back to raster:', e);
      }
    }
    await exportSheetToPDFRaster();
  } finally {
    if (hadDark) { body.classList.add('theme-dark'); }
    if (!hadClassic) { body.classList.remove('theme-classic'); }
  }
}

// ---- RASTER PATH (V14) ----
// async so it can stage a PDF-background page's high-DPI raster (see
// _pdfStageBgRaster). Native pages stage nothing and run exactly as before.
async function exportSheetToPDFRaster() {
  const { jsPDF } = window.jspdf;

  // multi-file-workspace Phase 5 — size the offscreen render + the jsPDF page to
  // the ACTIVE page's own dimensions. Native A1 pages resolve to 841×594, so the
  // px targets and format are byte-identical to the historical hardcoded values.
  const _pg = (typeof activePage === 'function') ? activePage() : null;
  const fmt = _pdfPageFormat(_pg);

  // Target resolution: ~110 DPI keeps filesize reasonable while producing sharp
  // output (A1 → 3600 × 2544 px). Scales with the page size for non-A1 pages.
  const PX_PER_MM = 4.3;
  const targetW = Math.round(fmt.w * PX_PER_MM);
  const targetH = Math.round(fmt.h * PX_PER_MM);

  const saved = { canvas, ctx, W, H, viewport: { ...viewport } };

  // Stage a crisp PDF-background raster (no-op for native pages). The override is
  // drawn by drawPdfBackground during render() into the page rect, then cleared.
  // Warn if a PDF-background page can't be staged (it would export blank-white).
  if (_pg) {
    const _staged = await _pdfStageBgRaster((typeof workspaceActiveFile === 'function') ? workspaceActiveFile() : null, _pg);
    if (!_staged && _pg.bg && _pg.bg.type === 'pdf' && typeof alert === 'function') {
      alert('PDF export warning: the PDF background could not be rendered for this page. It was exported blank (markup only).');
    }
  }

  const off = document.createElement('canvas');
  off.width = targetW;
  off.height = targetH;
  const offCtx = off.getContext('2d');
  offCtx.fillStyle = '#ffffff';
  offCtx.fillRect(0, 0, targetW, targetH);

  canvas = off;
  ctx = offCtx;
  W = targetW;
  H = targetH;
  viewport.zoom = PX_PER_MM;
  viewport.panX = 0;
  viewport.panY = 0;

  try {
    render();
    const pdf = new jsPDF({
      orientation: fmt.orientation,
      unit: 'mm',
      format: fmt.format,
      compress: true,
    });
    const imgData = off.toDataURL('image/jpeg', 0.92);
    pdf.addImage(imgData, 'JPEG', 0, 0, fmt.w, fmt.h);

    const fname = `${sheetInfo.drawingNo || 'detail'}_Rev${sheetInfo.revision || 'A'}.pdf`
      .replace(/[^a-z0-9._-]/gi, '_');
    pdf.save(fname);
  } catch (e) {
    console.error('Raster PDF export failed:', e);
    alert('PDF export failed: ' + e.message);
  } finally {
    if (typeof window.setPdfExportRaster === 'function') window.setPdfExportRaster(null);
    canvas = saved.canvas;
    ctx = saved.ctx;
    W = saved.W;
    H = saved.H;
    Object.assign(viewport, saved.viewport);
    requestRender();
  }
}

// ---- VECTOR PATH (V15) ----
// Walks the existing render() pipeline but sends draw calls through a shim
// that emits jsPDF primitives instead of canvas ops. Key tricks:
//   - viewport.zoom = 1 and pan = 0, so canvas pixel coords == sheet-mm.
//     This makes every (x,y) the render code computes land directly as
//     PDF mm coords — no DPI rounding.
//   - pdfExportMode = true makes ppm() return 1, so AS 1100 lineweights
//     (LW.CUT, LW.VIS, …) evaluate to sheet-mm and map 1:1 to jsPDF
//     setLineWidth(mm).
//   - Workspace background, grid, sheet shadow, selection highlights, and
//     interaction overlays are suppressed — they're UI chrome, not drawing
//     content.
//   - The isometric view (Three.js) is still raster by nature. The shim's
//     drawImage path converts the offscreen Three.js canvas to PNG and
//     embeds it via pdf.addImage — a single raster block inside an
//     otherwise fully-vector document.
// async — see exportSheetToPDF. A PDF-background active page stages a high-DPI
// raster (awaited) that drawPdfBackground draws under the vector overlay.
async function exportSheetToPDFVector() {
  const { jsPDF } = window.jspdf;

  // multi-file-workspace Phase 5 — size the jsPDF page to the ACTIVE page's own
  // dimensions/orientation. Native A1 pages resolve to [841,594]/'landscape', so
  // this is byte-identical to the historical hardcoded A1 export.
  const _pg = (typeof activePage === 'function') ? activePage() : null;
  const fmt = _pdfPageFormat(_pg);

  // Create PDF doc — page-sized, mm units so 1 pdf-unit == 1 sheet-mm.
  const pdf = new jsPDF({
    orientation: fmt.orientation,
    unit: 'mm',
    format: fmt.format,
    compress: true,
  });

  // Capture state we're about to mutate so we can restore it on error/exit.
  const saved = {
    canvas, ctx, W, H,
    viewport: { ...viewport },
    gridOn,
    selected3DLen: selected3D.length,
    selected3DCopy: [...selected3D],
    activeBlock, activeGrip, rotateMode, cursorSheet,
    pdfExportMode,
  };

  // Stage a crisp ~300 DPI raster of the PDF background (no-op for native pages).
  // drawPdfBackground (called inside render() under the markup) draws it into the
  // page rect via the shim's addImage; cleared in finally. If a PDF-background
  // page can't be staged, warn — it would otherwise export blank-white (markup
  // only) with no signal but a console line.
  if (_pg) {
    const _staged = await _pdfStageBgRaster((typeof workspaceActiveFile === 'function') ? workspaceActiveFile() : null, _pg);
    if (!_staged && _pg.bg && _pg.bg.type === 'pdf' && typeof alert === 'function') {
      alert('PDF export warning: the PDF background could not be rendered for this page. It was exported blank (markup only).');
    }
  }

  // Build the shim and swap globals. We set a fake "canvas" so code that
  // reads canvas.width / canvas.height during export gets the sheet size.
  const shim = createPdfCanvasShim(pdf);
  const fakeCanvas = { width: fmt.w, height: fmt.h };

  canvas = fakeCanvas;
  ctx = shim;
  W = fmt.w;
  H = fmt.h;
  viewport.zoom = 1;        // 1 screen-px == 1 sheet-mm
  viewport.panX = 0;
  viewport.panY = 0;
  gridOn = false;           // grid is screen chrome, not drawing content
  selected3D.length = 0;    // selection highlights don't belong in PDF
  activeBlock = null;       // suppress crosshair / click preview overlays
  activeGrip = null;
  rotateMode = false;
  cursorSheet = null;
  pdfExportMode = true;

  try {
    // Paint a white sheet background first — jsPDF pages are transparent.
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, fmt.w, fmt.h, 'F');

    // Invoke the normal render pipeline. Every ctx.* call lands on the shim
    // and is translated into a jsPDF primitive.
    render();

    const fname = `${sheetInfo.drawingNo || 'detail'}_Rev${sheetInfo.revision || 'A'}.pdf`
      .replace(/[^a-z0-9._-]/gi, '_');
    pdf.save(fname);
  } finally {
    if (typeof window.setPdfExportRaster === 'function') window.setPdfExportRaster(null);
    // Restore globals regardless of success / failure so the app keeps working.
    canvas = saved.canvas;
    ctx = saved.ctx;
    W = saved.W;
    H = saved.H;
    Object.assign(viewport, saved.viewport);
    gridOn = saved.gridOn;
    selected3D.length = 0;
    for (const o of saved.selected3DCopy) selected3D.push(o);
    activeBlock = saved.activeBlock;
    activeGrip = saved.activeGrip;
    rotateMode = saved.rotateMode;
    cursorSheet = saved.cursorSheet;
    pdfExportMode = saved.pdfExportMode;
    requestRender();
  }
}

// ---- PDF CANVAS SHIM (V15) ----
// Canvas-2D-like surface that emits jsPDF primitives. Covers the subset of
// the HTMLCanvasElement 2D API actually used by render() — path building,
// rect/circle/text drawing, transform stack, stroke/fill styling, dashes,
// and drawImage (used only for the 3D isometric block, rasterised inline).
// Clipping is a no-op: the main clip use is `drawCrossHatchPoly` which
// falls back acceptably without clipping because the hatch lines are
// drawn to the polygon bounding-box extent.
function createPdfCanvasShim(pdf) {
  // Mutable graphics state. save()/restore() push/pop a deep copy.
  const st = {
    strokeColor: [0, 0, 0],
    fillColor: [0, 0, 0],
    strokeAlpha: 1,
    fillAlpha: 1,
    lineWidth: 0.25,
    lineCap: 'butt',
    lineDash: [],
    globalAlpha: 1,
    fontSizePx: 10,         // canvas font size (interpreted as mm at zoom=1)
    fontStyle: 'normal',    // 'normal' | 'bold' | 'italic' | 'bold italic'
    textAlign: 'left',
    textBaseline: 'alphabetic',
    transform: [1, 0, 0, 1, 0, 0],  // canvas 2D matrix (a,b,c,d,e,f)
  };
  const stack = [];
  const subpaths = [];  // array of subpath arrays; each subpath is pt objs
  let cur = null;       // ref to the current subpath (top of `subpaths`)

  // --- Transform helpers ---
  function tp(x, y) {
    const m = st.transform;
    return { x: m[0]*x + m[2]*y + m[4], y: m[1]*x + m[3]*y + m[5] };
  }

  // --- Colour parsing: accepts #RGB, #RRGGBB, rgb(), rgba() ---
  function parseColor(v) {
    if (!v) return { r: 0, g: 0, b: 0, a: 1 };
    if (typeof v !== 'string') return { r: 0, g: 0, b: 0, a: 1 };
    const s = v.trim();
    if (s[0] === '#') {
      if (s.length === 4) {
        return {
          r: parseInt(s[1] + s[1], 16),
          g: parseInt(s[2] + s[2], 16),
          b: parseInt(s[3] + s[3], 16),
          a: 1
        };
      }
      if (s.length === 7) {
        return {
          r: parseInt(s.slice(1, 3), 16),
          g: parseInt(s.slice(3, 5), 16),
          b: parseInt(s.slice(5, 7), 16),
          a: 1
        };
      }
      if (s.length === 9) {
        return {
          r: parseInt(s.slice(1, 3), 16),
          g: parseInt(s.slice(3, 5), 16),
          b: parseInt(s.slice(5, 7), 16),
          a: parseInt(s.slice(7, 9), 16) / 255
        };
      }
    }
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const parts = m[1].split(',').map(x => parseFloat(x));
      return {
        r: Math.round(parts[0]) | 0,
        g: Math.round(parts[1]) | 0,
        b: Math.round(parts[2]) | 0,
        a: parts[3] === undefined ? 1 : parts[3]
      };
    }
    return { r: 0, g: 0, b: 0, a: 1 };
  }

  // --- Apply current draw state to jsPDF before a stroke/fill ---
  function applyStroke() {
    pdf.setDrawColor(st.strokeColor[0], st.strokeColor[1], st.strokeColor[2]);
    // Map canvas-px lineWidth → mm (1:1 at zoom=1), clamped so zero/negative
    // or absurd values don't break jsPDF.
    const lwMm = Math.max(0.05, Math.min(3, st.lineWidth));
    pdf.setLineWidth(lwMm);
    try { pdf.setLineCap(st.lineCap === 'round' ? 'round' : st.lineCap === 'square' ? 'butt' : 'butt'); } catch (e) {}
    try {
      if (st.lineDash && st.lineDash.length) {
        pdf.setLineDashPattern(st.lineDash, 0);
      } else {
        pdf.setLineDashPattern([], 0);
      }
    } catch (e) {}
    applyGState('stroke');
  }
  function applyFill() {
    pdf.setFillColor(st.fillColor[0], st.fillColor[1], st.fillColor[2]);
    applyGState('fill');
  }
  function applyGState(kind) {
    // Effective alpha = globalAlpha × stroke/fill alpha from CSS colour
    const extra = kind === 'stroke' ? st.strokeAlpha : st.fillAlpha;
    const a = Math.max(0, Math.min(1, st.globalAlpha * extra));
    if (a < 1) {
      try {
        const gs = new pdf.GState({ opacity: a, 'stroke-opacity': a });
        pdf.setGState(gs);
      } catch (e) {}
    } else {
      try {
        const gs = new pdf.GState({ opacity: 1, 'stroke-opacity': 1 });
        pdf.setGState(gs);
      } catch (e) {}
    }
  }

  // --- Path emission ---
  // Converts a subpath's point sequence into jsPDF draw calls. `style` is
  // jsPDF's style code: 'S' stroke, 'F' fill, 'FD' fill+stroke.
  function emitSubpath(sp, style) {
    if (!sp || sp.length === 0) return;
    if (sp[0].cmd === 'CIRCLE') {
      pdf.circle(sp[0].x, sp[0].y, sp[0].r, style);
      return;
    }
    // Collect straight-line deltas for pdf.lines()
    const first = sp[0];
    if (first.cmd !== 'M') return;
    const deltas = [];
    let px = first.x, py = first.y;
    let closed = false;
    for (let i = 1; i < sp.length; i++) {
      const seg = sp[i];
      if (seg.cmd === 'L') {
        deltas.push([seg.x - px, seg.y - py]);
        px = seg.x; py = seg.y;
      } else if (seg.cmd === 'Z') {
        closed = true;
        break;
      }
    }
    if (deltas.length === 0) return;
    if (deltas.length === 1 && !closed && style === 'S') {
      // Cheap path for the majority case: one straight segment.
      pdf.line(first.x, first.y, first.x + deltas[0][0], first.y + deltas[0][1]);
      return;
    }
    try {
      pdf.lines(deltas, first.x, first.y, [1, 1], style, closed);
    } catch (e) {
      // Fall back to per-segment lines (loses fill, but keeps stroke).
      let x0 = first.x, y0 = first.y;
      for (const d of deltas) {
        pdf.line(x0, y0, x0 + d[0], y0 + d[1]);
        x0 += d[0]; y0 += d[1];
      }
      if (closed) pdf.line(x0, y0, first.x, first.y);
    }
  }

  // --- The shim object itself ---
  const shim = {
    // ----- State stack -----
    save() {
      stack.push({
        strokeColor: [...st.strokeColor],
        fillColor: [...st.fillColor],
        strokeAlpha: st.strokeAlpha,
        fillAlpha: st.fillAlpha,
        lineWidth: st.lineWidth,
        lineCap: st.lineCap,
        lineDash: [...st.lineDash],
        globalAlpha: st.globalAlpha,
        fontSizePx: st.fontSizePx,
        fontStyle: st.fontStyle,
        textAlign: st.textAlign,
        textBaseline: st.textBaseline,
        transform: [...st.transform],
      });
    },
    restore() {
      const s = stack.pop();
      if (s) {
        st.strokeColor = s.strokeColor;
        st.fillColor = s.fillColor;
        st.strokeAlpha = s.strokeAlpha;
        st.fillAlpha = s.fillAlpha;
        st.lineWidth = s.lineWidth;
        st.lineCap = s.lineCap;
        st.lineDash = s.lineDash;
        st.globalAlpha = s.globalAlpha;
        st.fontSizePx = s.fontSizePx;
        st.fontStyle = s.fontStyle;
        st.textAlign = s.textAlign;
        st.textBaseline = s.textBaseline;
        st.transform = s.transform;
      }
    },

    // ----- Transform -----
    // setTransform(a,b,c,d,e,f) replaces the matrix. The render pipeline calls
    // ctx.setTransform(DPR, 0, 0, DPR, 0, 0) at the top of render(); we ignore
    // DPR and force identity — positions already arrive in sheet-mm.
    setTransform(a, b, c, d, e, f) {
      st.transform = [1, 0, 0, 1, 0, 0];
    },
    translate(tx, ty) {
      const t = st.transform;
      st.transform = [t[0], t[1], t[2], t[3], t[0]*tx + t[2]*ty + t[4], t[1]*tx + t[3]*ty + t[5]];
    },
    rotate(angle) {
      const cA = Math.cos(angle), sA = Math.sin(angle);
      const t = st.transform;
      st.transform = [
        t[0]*cA + t[2]*sA, t[1]*cA + t[3]*sA,
        -t[0]*sA + t[2]*cA, -t[1]*sA + t[3]*cA,
        t[4], t[5]
      ];
    },

    // ----- Styling (getters/setters) -----
    set strokeStyle(v) {
      const c = parseColor(v);
      st.strokeColor = [c.r, c.g, c.b];
      st.strokeAlpha = c.a;
    },
    get strokeStyle() { return `rgb(${st.strokeColor.join(',')})`; },
    set fillStyle(v) {
      const c = parseColor(v);
      st.fillColor = [c.r, c.g, c.b];
      st.fillAlpha = c.a;
    },
    get fillStyle() { return `rgb(${st.fillColor.join(',')})`; },
    set lineWidth(v) { st.lineWidth = v; },
    get lineWidth() { return st.lineWidth; },
    set lineCap(v) { st.lineCap = v; },
    get lineCap() { return st.lineCap; },
    set globalAlpha(v) { st.globalAlpha = (v === undefined || v === null) ? 1 : v; },
    get globalAlpha() { return st.globalAlpha; },
    setLineDash(arr) { st.lineDash = (arr && arr.length) ? [...arr] : []; },

    // Canvas font syntax: "[style] [weight] <size>px <family>". We extract
    // size (mm at zoom=1) and bold/italic; family always maps to Helvetica.
    set font(v) {
      if (typeof v !== 'string') return;
      let style = 'normal';
      const lc = v.toLowerCase();
      const bold = /\bbold\b/.test(lc);
      const italic = /\bitalic\b/.test(lc);
      if (bold && italic) style = 'bolditalic';
      else if (bold) style = 'bold';
      else if (italic) style = 'italic';
      st.fontStyle = style;
      const m = v.match(/(\d+(?:\.\d+)?)\s*px/);
      if (m) st.fontSizePx = parseFloat(m[1]);
    },
    get font() { return `${st.fontSizePx}px helvetica`; },
    set textAlign(v) { st.textAlign = v; },
    get textAlign() { return st.textAlign; },
    set textBaseline(v) { st.textBaseline = v; },
    get textBaseline() { return st.textBaseline; },

    // Shadow setters — swallow silently (PDF output doesn't need soft shadows;
    // the sheet "shadow" in drawSheet is screen chrome only).
    set shadowColor(v) {}, get shadowColor() { return ''; },
    set shadowBlur(v) {}, get shadowBlur() { return 0; },
    set shadowOffsetX(v) {}, get shadowOffsetX() { return 0; },
    set shadowOffsetY(v) {}, get shadowOffsetY() { return 0; },

    // ----- Path building -----
    beginPath() {
      subpaths.length = 0;
      cur = null;
    },
    moveTo(x, y) {
      const p = tp(x, y);
      cur = [{ cmd: 'M', x: p.x, y: p.y }];
      subpaths.push(cur);
    },
    lineTo(x, y) {
      const p = tp(x, y);
      if (!cur) {
        cur = [{ cmd: 'M', x: p.x, y: p.y }];
        subpaths.push(cur);
      } else {
        cur.push({ cmd: 'L', x: p.x, y: p.y });
      }
    },
    arc(cx, cy, r, a0, a1, ccw) {
      const c = tp(cx, cy);
      // Account for scale in transform: use average of x/y scale magnitudes.
      const t = st.transform;
      const sx = Math.hypot(t[0], t[1]);
      const sy = Math.hypot(t[2], t[3]);
      const rr = r * (sx + sy) * 0.5;
      // Full circle → emit a CIRCLE primitive for crispness.
      const sweep = Math.abs(a1 - a0);
      const full = sweep >= Math.PI * 2 - 1e-6 || (a0 === 0 && Math.abs(a1 - Math.PI * 2) < 1e-6);
      if (full && !cur) {
        subpaths.push([{ cmd: 'CIRCLE', x: c.x, y: c.y, r: rr }]);
        cur = null;
        return;
      }
      // Partial arc → subdivide into line segments.
      const steps = Math.max(8, Math.ceil(sweep * 12));
      const da = (ccw ? -1 : 1) * sweep / steps * Math.sign(a1 - a0 || 1);
      let first = !cur;
      for (let i = 0; i <= steps; i++) {
        const a = a0 + da * i;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (first) { this.moveTo(x, y); first = false; }
        else this.lineTo(x, y);
      }
    },
    closePath() {
      if (cur && cur.length) cur.push({ cmd: 'Z' });
    },

    // ----- Path drawing -----
    stroke() {
      if (subpaths.length === 0) return;
      applyStroke();
      for (const sp of subpaths) emitSubpath(sp, 'S');
    },
    fill() {
      if (subpaths.length === 0) return;
      applyFill();
      for (const sp of subpaths) emitSubpath(sp, 'F');
    },

    // ----- Rect shortcuts (transform-aware, axis-aligned only) -----
    fillRect(x, y, w, h) {
      const p = tp(x, y);
      applyFill();
      pdf.rect(p.x, p.y, w, h, 'F');
    },
    strokeRect(x, y, w, h) {
      const p = tp(x, y);
      applyStroke();
      pdf.rect(p.x, p.y, w, h, 'S');
    },
    roundRect(x, y, w, h, r) {
      const p = tp(x, y);
      const rr = typeof r === 'number' ? r : (Array.isArray(r) ? r[0] : 0);
      try { pdf.roundedRect(p.x, p.y, w, h, rr, rr, 'S'); }
      catch (e) { pdf.rect(p.x, p.y, w, h, 'S'); }
    },
    clearRect(x, y, w, h) {
      // Treat clearRect as "paint white" — used by render() to reset the
      // workspace background, which we don't draw in PDF output anyway.
      // Suppress it entirely so the white sheet background we painted up
      // front stays intact.
    },

    // ----- Text -----
    fillText(text, x, y, maxWidth) {
      if (text === undefined || text === null) return;
      const p = tp(x, y);
      applyFill();
      try {
        pdf.setFont('helvetica', st.fontStyle === 'bolditalic' ? 'bolditalic'
                    : st.fontStyle === 'bold' ? 'bold'
                    : st.fontStyle === 'italic' ? 'italic' : 'normal');
        // fontSizePx is in mm (zoom=1). jsPDF wants pt. 1 mm ≈ 2.8346 pt.
        pdf.setFontSize(st.fontSizePx * 2.8346);
        const opts = {
          align: st.textAlign === 'center' ? 'center'
               : st.textAlign === 'right' || st.textAlign === 'end' ? 'right'
               : 'left',
          baseline: st.textBaseline === 'middle' ? 'middle'
                  : st.textBaseline === 'top' ? 'top'
                  : st.textBaseline === 'hanging' ? 'hanging'
                  : st.textBaseline === 'bottom' ? 'bottom'
                  : 'alphabetic',
        };
        pdf.text(String(text), p.x, p.y, opts);
      } catch (e) {
        // Best-effort: swallow so a single bad glyph doesn't abort export.
      }
    },
    measureText(text) {
      try {
        pdf.setFont('helvetica', st.fontStyle === 'bold' ? 'bold' : 'normal');
        pdf.setFontSize(st.fontSizePx * 2.8346);
        // jsPDF returns width in current units (mm); canvas returns px.
        // With our zoom=1 mapping, 1 unit == 1 mm == 1 "canvas px", so
        // the value is comparable.
        return { width: pdf.getTextWidth(String(text)) };
      } catch (e) {
        return { width: String(text).length * st.fontSizePx * 0.5 };
      }
    },

    // ----- Image -----
    // Used exclusively by drawBlockContent() to blit the Three.js isometric
    // canvas. We convert to PNG (better than JPEG for edge lines) and embed.
    drawImage(img, a, b, c, d, e, f, g, h) {
      try {
        let dx, dy, dw, dh;
        if (arguments.length === 9) {
          // drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh) — source clip ignored
          dx = e; dy = f; dw = g; dh = h;
        } else if (arguments.length === 5) {
          dx = a; dy = b; dw = c; dh = d;
        } else {
          dx = a; dy = b; dw = img.width || 0; dh = img.height || 0;
        }
        const p = tp(dx, dy);
        let data = null;
        if (typeof img.toDataURL === 'function') {
          data = img.toDataURL('image/png');
        } else if (img.src) {
          data = img.src;
        }
        if (!data) return;
        pdf.addImage(data, 'PNG', p.x, p.y, dw, dh);
      } catch (e) {
        console.warn('PDF drawImage failed:', e);
      }
    },

    // ----- Clipping (no-op) -----
    // drawCrossHatchPoly uses clip+stroke to fill a polygon with 45° hatch
    // lines. Without clip the hatch extends to the bounding box, which for
    // rectangular plates (the overwhelmingly common case) looks identical.
    // For irregular polygons the hatch will slightly overrun; acceptable
    // for V15, revisit in V17 alongside polygon-plate rendering polish.
    clip() {},
  };

  return shim;
}

// ============================================================
