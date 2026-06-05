'use strict';

// V25 — DIMENSION / MEASURE tool (Bluebeam/Revit-style), 2D paper-space.
// ----------------------------------------------------------------------------
// Entity type 'dim2', armed by the 'v25-measure' tool (keyboard 'm', BB-rail
// "Measure" tile). Two measured points (p1u/p1v, p2u/p2v in view-local real-mm,
// v is Y-up) plus a SIGNED perpendicular offset `off` in PAPER-mm. The dimension
// line, terminators, witness gaps and text are all sized in paper-mm via
// _nbZoom() (px per sheet-mm) so the standoff stays constant across drawing
// scales — the noteBox convention (js/97-v25-notebox.js), and the central
// quality-bar fix over the legacy real-mm `dim` (js/34 drawDim2D, which shrinks
// its standoff 1/scale and can never carry a text override). Linework WIDTHS use
// LW.* * ppm() to match all other AS 1100 linework.
//
// Wiring lives in sibling files: render dispatch + click placement + tool reset
// in js/69-v25-dispatch.js; grips/drag/hit-test/inspector in js/71-v25-selection.js;
// keyboard activation + type-to-set in js/42-keyboard.js; live preview in
// js/38-crosshair.js; options bar in js/72-v25-options-bar.js; DXF in js/45.
//
// NUMBERING: 82 keeps it beside the other recent 2D-mode annotation modules
// (80/81 spellcheck). This file only DEFINES functions; its calls into
// nbStrokeText / _nbDrawArrowHead / _nbZoom (js/96, js/97) run at render time,
// after every script has loaded, so the load-order slot is not load-bearing.

// ---- paper-mm style constants (× _nbZoom() → screen px; × 1 in PDF export) ----
const DIM2_TICK_MM    = 3.0;   // oblique terminator slash full length
const DIM2_EXT_GAP_MM = 1.4;   // gap between measured point and start of witness line
const DIM2_EXT_OVER_MM= 2.0;   // witness-line overshoot past the dimension line
const DIM2_TXT_GAP_MM = 1.0;   // clear gap between dimension line and text block
const DIM2_TXT_MIN_PX = 7;     // on-screen readability floor for the label
const DIM2_DEFAULT_OFF= 12;    // default standoff (paper-mm) for a fresh dimension

// Upright reading angle: fold any line angle into [-90°, +90°] so text never
// reads upside-down or back-to-front.
function _dim2Upright(a) {
  if (a > Math.PI / 2) return a - Math.PI;
  if (a < -Math.PI / 2) return a + Math.PI;
  return a;
}

// Shared geometry — the ONE place the paper-mm offset is turned into screen px.
// Returns every point the renderer, hit-test and grips need.
//   w1/w2 : measured points (px)        d1/d2 : dimension-line ends (px)
//   mid   : dim-line midpoint (px)       nx/ny : screen-space perpendicular unit
//   offPx : signed offset in px          lenPx : measured span length (px)
//   angle : dim-line direction (rad)
function dim2DimLinePx(blk, ent) {
  const w1 = real2px(blk, ent.p1u, ent.p1v);
  const w2 = real2px(blk, ent.p2u, ent.p2v);
  const dx = w2.x - w1.x, dy = w2.y - w1.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;                 // screen perpendicular unit
  const off = (typeof ent.off === 'number') ? ent.off : DIM2_DEFAULT_OFF;
  const offPx = off * _nbZoom();
  const d1 = { x: w1.x + nx * offPx, y: w1.y + ny * offPx };
  const d2 = { x: w2.x + nx * offPx, y: w2.y + ny * offPx };
  const mid = { x: (d1.x + d2.x) / 2, y: (d1.y + d2.y) / 2 };
  const angle = Math.atan2(d2.y - d1.y, d2.x - d1.x);
  return { w1, w2, d1, d2, mid, nx, ny, offPx, off, lenPx: len, angle };
}

// Default SIGNED offset for a freshly placed dimension: lands the dim line on
// the drafting-convention side — ABOVE a horizontal span, LEFT of a vertical
// span — regardless of which way the user dragged. They can drag it across after.
function dim2DefaultOff(blk, p1u, p1v, p2u, p2v, magMm) {
  // Use the MAGNITUDE of the seed (the sign is decided below), so a negative
  // options-bar Offset still contributes its distance instead of being discarded.
  const m = Math.abs(magMm);
  const mag = (typeof magMm === 'number' && m > 0) ? m : DIM2_DEFAULT_OFF;
  const a = real2px(blk, p1u, p1v), b = real2px(blk, p2u, p2v);
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;            // screen perpendicular unit
  let sign;
  if (Math.abs(ny) > 1e-3) sign = (ny < 0) ? 1 : -1;   // horizontal-ish → up
  else sign = (nx < 0) ? 1 : -1;                        // vertical-ish → left
  return sign * mag;
}

// Measured length in real-world mm (for the label + typed-length rescale).
function dim2Length(ent) {
  return Math.hypot((ent.p2u - ent.p1u) || 0, (ent.p2v - ent.p1v) || 0);
}

// Format a length for the label. mm → bare number (AS 1100 sheets declare mm in
// the title block, so structural dimensions are unitless by convention); m →
// metres at the chosen precision.
function dim2FormatLen(lenMm, prec, units) {
  prec = (prec == null) ? 0 : (prec | 0);
  if (units === 'm') return (lenMm / 1000).toFixed(Math.max(prec, 0));
  return lenMm.toFixed(prec);
}

// The label shown on the dimension: an explicit letters-override wins, else the
// live measured length.
function dim2Label(ent) {
  if (ent.textOverride != null && String(ent.textOverride).length) return String(ent.textOverride);
  return dim2FormatLen(dim2Length(ent), ent.prec, ent.units);
}

// Set the dimension to an exact length, anchored at P1 (P2 slides along the
// current p1→p2 direction). Clears any text override (typing a number means the
// label is the measured value again). Shared by the keyboard handler and the
// double-click editor.
function dim2SetLength(ent, lenMm) {
  if (!(lenMm > 0)) return;
  let du = ent.p2u - ent.p1u, dv = ent.p2v - ent.p1v;
  let ang = Math.atan2(dv, du);
  if (!isFinite(ang) || (du === 0 && dv === 0)) ang = 0;  // degenerate → keep horizontal
  ent.p2u = ent.p1u + Math.cos(ang) * lenMm;
  ent.p2v = ent.p1v + Math.sin(ang) * lenMm;
  ent.textOverride = null;
}

// Dash pattern (screen px) for a line style, scaled to paper-mm via _nbZoom so it
// stays constant on the sheet. 'solid' (or unknown) → continuous.
function dim2DashPx(ls, z) {
  if (ls === 'dashed') return [2.5 * z, 1.5 * z];
  if (ls === 'dotted') return [0.4 * z, 1.6 * z];
  return [];
}

// Font styles offered for the dimension label (mirror the noteBox / text box).
const DIM2_FONT_OPTS = [
  { v: 'plex', l: 'Plex (modern)' },
  { v: 'professional', l: 'Professional' },
  { v: 'engineer', l: 'Engineer (inclined)' },
  { v: 'draftsman', l: 'Draftsman (hand)' },
  { v: 'routed', l: 'Routed Gothic' },
  { v: 'routedWide', l: 'Routed Gothic Wide' },
  { v: 'routedHalf', l: 'Routed Gothic Lean' },
];

// ---- RENDERER ---------------------------------------------------------------
// Colours, widths and line styles are independently editable for the solid
// dimension line (dimColour/dimLw/dimLs — also drives terminators + label) and
// the witness/extension lines (extColour/extLw/extLs). Each falls back to the
// generic ent.colour, then the muted theme colour. All sizes are paper-mm.
function drawDim2_2D(blk, ent, cs) {
  if (ent.p1u == null || ent.p2u == null) return;
  const muteCol = cs.getPropertyValue('--mute').trim() || '#888';
  const baseCol = ent.colour || muteCol;
  const dimCol = ent.dimColour || baseCol;
  const extCol = ent.extColour || baseCol;
  const prevA = ctx.globalAlpha;
  ctx.globalAlpha = prevA * v25EntOpacity(ent);
  try {
    const z = _nbZoom();                       // px per sheet-mm — paper-constant
    const g = dim2DimLinePx(blk, ent);
    const dimW = Math.max(0.5, (ent.dimLw != null ? ent.dimLw : 0.18) * z);
    const extW = Math.max(0.4, (ent.extLw != null ? ent.extLw : 0.13) * z);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // ---- witness (extension) lines ----
    const extGap = DIM2_EXT_GAP_MM * z, extOver = DIM2_EXT_OVER_MM * z;
    ctx.save();
    ctx.strokeStyle = extCol; ctx.lineWidth = extW;
    ctx.setLineDash(dim2DashPx(ent.extLs || 'dashed', z));
    [[g.w1, g.d1], [g.w2, g.d2]].forEach(([w, d]) => {
      const ex = d.x - w.x, ey = d.y - w.y, el = Math.hypot(ex, ey);
      if (el < 0.5) return;
      const ux = ex / el, uy = ey / el;
      ctx.beginPath();
      ctx.moveTo(w.x + ux * extGap, w.y + uy * extGap);     // gap at the feature
      ctx.lineTo(d.x + ux * extOver, d.y + uy * extOver);   // overshoot past dim line
      ctx.stroke();
    });
    ctx.restore();

    // ---- dimension line ----
    ctx.strokeStyle = dimCol; ctx.fillStyle = dimCol; ctx.lineWidth = dimW;
    ctx.setLineDash(dim2DashPx(ent.dimLs || 'solid', z));
    ctx.beginPath(); ctx.moveTo(g.d1.x, g.d1.y); ctx.lineTo(g.d2.x, g.d2.y); ctx.stroke();
    ctx.setLineDash([]);

    // ---- terminators (always solid, dim-line colour/width) ----
    const term = ent.term || 'tick';
    if (term === 'arrow' || term === 'dot') {
      _nbDrawArrowHead(blk, g.d2, g.d1, term, dimCol, z);   // tip at d1, pointing outward
      _nbDrawArrowHead(blk, g.d1, g.d2, term, dimCol, z);   // tip at d2, pointing outward
    } else {
      // oblique 45° slash (AS 1100 / architectural tick), symmetric through each end
      const ux = Math.cos(g.angle), uy = Math.sin(g.angle);
      const tx = ux * Math.SQRT1_2 - uy * Math.SQRT1_2, ty = ux * Math.SQRT1_2 + uy * Math.SQRT1_2;
      const half = (DIM2_TICK_MM * z) / 2;
      ctx.lineWidth = dimW;
      [g.d1, g.d2].forEach(p => {
        ctx.beginPath();
        ctx.moveTo(p.x - tx * half, p.y - ty * half);
        ctx.lineTo(p.x + tx * half, p.y + ty * half);
        ctx.stroke();
      });
    }

    // ---- label: style-aware (web font like plex, or the stroke font), centred,
    //      always upright, on the outward side of the dim line ----
    if (!ent._editing) {
      const label = dim2Label(ent);
      const st = (typeof nbStyle === 'function') ? nbStyle(ent.style || 'plex') : null;
      const capPx = (ent.sz ? ent.sz : 2.5) * z;
      const capDraw = pdfExportMode ? capPx : Math.max(DIM2_TXT_MIN_PX, capPx);
      const ta = _dim2Upright(g.angle);
      const sgn = (g.off >= 0) ? 1 : -1;                  // outward = away from the feature
      const tgap = DIM2_TXT_GAP_MM * z + capDraw * 0.5;
      const ax = g.mid.x + g.nx * sgn * tgap, ay = g.mid.y + g.ny * sgn * tgap;
      ctx.save();
      ctx.translate(ax, ay); ctx.rotate(ta); ctx.setLineDash([]);
      if (st && st.font === 'web') {
        ctx.font = (st.weight || 500) + ' ' + capDraw + 'px ' + st.family;
        ctx.fillStyle = dimCol;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(label, 0, 0);
        ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
      } else if (typeof nbStrokeText === 'function') {
        // baseline at +cap/2 vertically centres the glyph block on the anchor.
        nbStrokeText(ctx, label, 0, capDraw * 0.5, capDraw, {
          color: dimCol, align: 'center',
          weightPx: Math.max(0.75, ((st && st.textWeightMm) || 0.18) * z),
          slant: (st && st.slant) || 0,
          letterSpacingPx: ((st && st.letterSpacingMm) || 0) * z,
          jitter: (st && st.jitter) || 0,
          wobbleAmpPx: (st && st.wobble) ? st.wobble * capDraw * 0.1 : 0,
          seed: (ent.id || 1) * 131,
        });
      } else {
        ctx.font = capDraw + 'px system-ui'; ctx.fillStyle = dimCol;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(label, 0, 0);
        ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
      }
      ctx.restore();
    }
  } finally {
    ctx.globalAlpha = prevA;
    ctx.setLineDash([]);
  }
}

// ---- INLINE DOUBLE-CLICK EDITOR -------------------------------------------
// A single-line <input> over the dim-line midpoint. Typing a number rescales the
// dimension (anchored at P1); any other text becomes the label; blank reverts to
// the measured value. Lifecycle copied from the noteBox editor (js/98); the
// commit is recorded as a v25Move undo so Ctrl+Z reverts the value (Decision 5).
function _dimEditorHost() { return document.getElementById('canvas-container') || document.body; }

function _dimEnsureInput() {
  let el = document.getElementById('dimEditorTA');
  if (el) return el;
  el = document.createElement('input');
  el.id = 'dimEditorTA';
  el.type = 'text';
  el.setAttribute('spellcheck', 'false');
  el.setAttribute('autocomplete', 'off');
  el.style.cssText = [
    'position:absolute', 'box-sizing:border-box', 'margin:0', 'z-index:60',
    'text-align:center', 'border:1px dashed var(--accent,#4a90d9)', 'outline:none',
    'background:var(--surface,rgba(255,255,255,0.92))', 'color:var(--entity-color,#111)',
    "font-family:'IBM Plex Mono', ui-monospace, monospace", 'padding:1px 4px',
  ].join(';');
  _dimEditorHost().appendChild(el);
  return el;
}

function _dimPositionEditor() {
  const ed = dimEditor;
  if (!ed || !ed.el || !ed.ent || !ed.blk || typeof real2px !== 'function') return;
  if (typeof dim2DimLinePx !== 'function') return;
  const g = dim2DimLinePx(ed.blk, ed.ent);
  let offL = 0, offT = 0;
  try {
    const host = _dimEditorHost();
    if (typeof canvas !== 'undefined' && canvas && canvas.getBoundingClientRect && host.getBoundingClientRect) {
      const cr = canvas.getBoundingClientRect(), hr = host.getBoundingClientRect();
      offL = cr.left - hr.left; offT = cr.top - hr.top;
    }
  } catch (_e) { offL = 0; offT = 0; }
  const z = (typeof _nbZoom === 'function') ? _nbZoom() : 1;
  const capPx = Math.max(10, (ed.ent.sz || 2.5) * z);
  const hPx = capPx + 8;
  const wPx = Math.max(54, (ed.el.value ? ed.el.value.length : 3) * capPx * 0.7 + 16);
  ed.el.style.left = (offL + g.mid.x - wPx / 2) + 'px';
  ed.el.style.top = (offT + g.mid.y - hPx / 2) + 'px';
  ed.el.style.width = wPx + 'px';
  ed.el.style.height = hPx + 'px';
  ed.el.style.fontSize = Math.max(11, capPx * 0.9) + 'px';
}

function _dimEditorTick() {
  if (!dimEditor) return;
  _dimPositionEditor();
  dimEditor.raf = window.requestAnimationFrame(_dimEditorTick);
}

function dimOpenEditor(ent, blk) {
  if (!ent) return;
  if (dimEditor && dimEditor.ent && dimEditor.ent !== ent) dimCloseEditor(true);
  blk = blk || ((typeof activeBlock === 'object' && activeBlock) ? activeBlock : null);
  if (!blk) return;
  const el = _dimEnsureInput();
  el.value = dim2Label(ent);
  // Snapshot the undo baseline BEFORE flagging _editing — otherwise the transient
  // _editing flag (deleted before the 'after' snapshot on commit) makes a no-op
  // commit look like a change, pushing a phantom undo + wiping the redo stack.
  const before = (typeof v25SnapshotMoveTargets === 'function') ? v25SnapshotMoveTargets(ent) : null;
  ent._editing = true;
  dimEditor = { ent: ent, el: el, blk: blk, raf: 0, before: before };
  el.oninput = function () { _dimPositionEditor(); };
  el.onkeydown = function (e) {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); dimCloseEditor(true); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); dimCloseEditor(false); }
    else { e.stopPropagation(); }   // keep typing out of the global keyboard handler
  };
  _dimPositionEditor();
  window.setTimeout(function () { try { el.focus(); el.select(); } catch (_e) { /* */ } }, 0);
  window.setTimeout(function () { document.addEventListener('mousedown', _dimOutsideClick, true); }, 0);
  dimEditor.raf = window.requestAnimationFrame(_dimEditorTick);
  if (typeof requestRender === 'function') requestRender();
}

function _dimOutsideClick(e) {
  const ed = dimEditor;
  if (!ed || !ed.el) return;
  if (e.target === ed.el || ed.el.contains(e.target)) return;
  if (e.preventDefault) e.preventDefault();
  if (e.stopImmediatePropagation) e.stopImmediatePropagation();
  dimCloseEditor(true);
}

function dimCloseEditor(commit) {
  const ed = dimEditor;
  if (!ed) return;
  const ent = ed.ent, el = ed.el;
  if (commit && ent && el) {
    const raw = String(el.value).trim();
    const num = parseFloat(raw);
    const isNumeric = raw.length > 0 && /^[-+]?[0-9]*\.?[0-9]+$/.test(raw) && isFinite(num);
    if (isNumeric && num > 0) dim2SetLength(ent, num);          // number → rescale, clears override
    else if (raw.length === 0) ent.textOverride = null;          // blank → measured value
    else ent.textOverride = raw;                                 // text → label override
  }
  if (ent) delete ent._editing;
  if (ed.raf) { try { window.cancelAnimationFrame(ed.raf); } catch (_e) { /* */ } }
  document.removeEventListener('mousedown', _dimOutsideClick, true);
  if (el) { el.oninput = null; el.onkeydown = null; if (el.parentNode) el.parentNode.removeChild(el); }
  // Record an undoable snapshot of the value change (Decision 5).
  if (commit && ent && ed.before && typeof v25SnapshotMoveTargets === 'function' && typeof undoStack !== 'undefined') {
    const after = v25SnapshotMoveTargets(ent);
    const differ = (typeof v25MoveSnapshotsDiffer === 'function') ? v25MoveSnapshotsDiffer(ed.before, after) : true;
    if (differ) {
      undoStack.push({ act: 'v25Move', view: ent.view, before: ed.before, after: after });
      if (undoStack.length > 100) undoStack.shift();
      if (typeof redoStack !== 'undefined') redoStack = [];
    }
  }
  dimEditor = null;
  if (typeof requestRender === 'function') requestRender();
  if (typeof v25UpdateInspector === 'function') v25UpdateInspector();
}
