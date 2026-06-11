'use strict';

// ============================================================
// TITLE BLOCK — three Bligh Tanner styles + dispatcher
// ============================================================
// title-block-styles (2026-06-05). Owns drawDrawingFrame (moved out of
// 45-dxf-export.js). Three paper-space styles, chosen per-sheet via
// sheetInfo.tbStyle and the top-bar .tb-style-switcher:
//   'sketch'   — small navy block floating bottom-right, NO page border
//   'tbBottom' — full border + full-width bottom strip
//   'tbRight'  — full border + vertical strip down the right
//
// All geometry is paper-space sheet-mm via s2px()/sheetLen(); lineweights are
// true AS-1100 ink mm via tbLW() so PDF export (both raster + vector paths,
// which re-run render()) prints to scale. Reads the active sheetInfo.* + the
// CSS font/colour tokens. No image assets — the BLIGH TANNER logo is text.
//
// LAYER: band 9 / shared paper-space chrome. Pure function set, no shared
// mutable state beyond the per-call _TB style cache.

// --- Brand constants (fixed BT identity — NOT editable sheetInfo fields) ---
const BT_NAVY = '#16357e';   // sketch block: box + all text (royal/navy)
const BT_BLUE = '#1c4fa0';   // formal blocks: the BLIGH TANNER logo blue
const BT_RED  = '#c0392b';   // status sub-line (NOT FOR CONSTRUCTION)

const BT_ADDR_SKETCH = ['LEVEL 9, 269 WICKHAM STREET, PO BOX 612',
                        'FORTITUDE VALLEY QLD 4006 AUSTRALIA',
                        'T 07 3251 8555     F 07 3251 8599'];
const BT_OFFICES_BOTTOM = 'BRISBANE | SYDNEY';
const BT_OFFICES_RIGHT  = 'BRISBANE | SYDNEY | MELBOURNE';
const BT_EMAIL = 'blightanner@blightanner.com.au';
const BT_WEB   = 'blightanner.com.au';
const BT_COPYRIGHT =
  'ALL RIGHTS RESERVED. THIS WORK IS COPYRIGHT AND CANNOT BE REPRODUCED IN ANY FORM OR BY ANY MEANS ' +
  '(GRAPHIC, ELECTRICAL, INCLUDING PHOTOCOPYING) WITHOUT THE WRITTEN PERMISSION OF BLIGH TANNER. ANY ' +
  'LICENCE, EXPRESS OR IMPLIED, TO USE THIS DOCUMENT FOR ANY PURPOSE WHATSOEVER IS RESTRICTED TO THE ' +
  'TERMS OF AGREEMENT OR IMPLIED AGREEMENT BETWEEN BLIGH TANNER AND THE INSTRUCTING PARTY.';

// Per-render style cache (colours + font families), set by the dispatcher.
let _TB = null;

// --- low-level paper-space helpers ----------------------------------------

// AS-1100 ink mm → device. In PDF (vector path, pdfExportMode) the shim maps
// lineWidth 1:1 to mm, so return raw mm; on screen / raster, use sheetLen with
// a small legibility floor so hairlines stay visible when zoomed out.
function tbLW(mm) {
  if (typeof pdfExportMode !== 'undefined' && pdfExportMode) return mm;
  return Math.max(0.6, sheetLen(mm));
}
// Font size in device px for a sheet-mm cap height, floored for screen legibility.
function _tbFpx(mm) { return Math.max(3.5, sheetLen(mm)); }

// ISO 'YYYY-MM-DD' → 'DD.MM.YYYY' (BT date format). Pass-through if not ISO.
function _tbDate(s) {
  if (!s) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? (m[3] + '.' + m[2] + '.' + m[1]) : s;
}

// Stroke a rectangle given sheet-mm corners.
function _tbRect(xMm, yMm, wMm, hMm, lwMm, color) {
  const a = s2px(xMm, yMm), b = s2px(xMm + wMm, yMm + hMm);
  ctx.strokeStyle = color; ctx.lineWidth = lwMm;
  ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
}
// Stroke a line given sheet-mm endpoints.
function _tbLine(x1, y1, x2, y2, lwMm, color) {
  const a = s2px(x1, y1), b = s2px(x2, y2);
  ctx.strokeStyle = color; ctx.lineWidth = lwMm;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
}
// Draw text at a sheet-mm anchor. opt: {fs(mm), weight, family, color, align,
// baseline, italic}. Returns the measured width in device px.
function _tbWrite(str, xMm, yMm, opt) {
  opt = opt || {};
  const fs = _tbFpx(opt.fs || 2.4);
  ctx.font = (opt.italic ? 'italic ' : '') + (opt.weight || '500') + ' ' +
             fs + 'px ' + (opt.family || _TB.sans);
  ctx.fillStyle = opt.color || _TB.ink;
  ctx.textAlign = opt.align || 'left';
  ctx.textBaseline = opt.baseline || 'alphabetic';
  const p = s2px(xMm, yMm);
  ctx.fillText(str == null ? '' : String(str), p.x, p.y);
  return ctx.measureText(str == null ? '' : String(str)).width;
}
// Greedy word-wrap `text` to lines no wider than maxWmm at the given mm size.
// Explicit '\n' in the text forces a line break (so e.g. project name and
// address each start on their own line, then wrap independently).
function _tbWrap(text, maxWmm, fsMm) {
  if (!text) return [''];
  ctx.font = '500 ' + _tbFpx(fsMm) + 'px ' + _TB.sans;
  const maxPx = sheetLen(maxWmm);
  const out = [];
  String(text).split('\n').forEach(function (para) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(''); return; }
    let cur = '';
    words.forEach(function (w) {
      const test = cur ? cur + ' ' + w : w;
      if (ctx.measureText(test).width > maxPx && cur) { out.push(cur); cur = w; }
      else cur = test;
    });
    if (cur) out.push(cur);
  });
  return out.length ? out : [''];
}

// A labelled cell: optional box, mono-caps label top-left, value below (wrapped)
// or right-aligned. opt: {box, lw, color, labelColor, valColor, labelFs, valFs,
// valWeight, valAlign, multiline, pad}.
function _tbCell(x, y, w, h, label, value, opt) {
  opt = opt || {};
  const pad = opt.pad != null ? opt.pad : 2.0;
  if (opt.box !== false) _tbRect(x, y, w, h, tbLW(opt.lw || LW.HID), opt.color || _TB.border);
  const labelFs = opt.labelFs || 1.5;
  let cursorY = y + pad + labelFs;            // baseline of label row
  if (label) {
    _tbWrite(label.toUpperCase(), x + pad, cursorY,
      { fs: labelFs, weight: '600', family: _TB.mono, color: opt.labelColor || _TB.subtle });
  }
  const valFs = opt.valFs || 2.4;
  if (opt.valAlign === 'center-hero') {
    // big centred hero value vertically centred in remaining space
    _tbWrite(value || '', x + w / 2, y + h - (h - (cursorY - y)) / 2 + valFs * 0.35,
      { fs: valFs, weight: opt.valWeight || '700', color: opt.valColor || _TB.ink, align: 'center' });
    return;
  }
  const valY0 = label ? cursorY + valFs + 1.0 : y + pad + valFs;
  if (opt.multiline) {
    const lines = _tbWrap(value, w - pad * 2, valFs);
    lines.forEach(function (ln, i) {
      _tbWrite(ln, x + pad, valY0 + i * (valFs + 0.8),
        { fs: valFs, weight: opt.valWeight || '500', color: opt.valColor || _TB.ink });
    });
  } else {
    _tbWrite(value || '', x + pad, valY0,
      { fs: valFs, weight: opt.valWeight || '500', color: opt.valColor || _TB.ink,
        align: opt.valAlign || 'left' });
  }
}

// Vertical stack of [label,value] mini-cells inside (x,y,w,h).
function _tbStack(x, y, w, h, rows, opt) {
  opt = opt || {};
  const n = Math.max(rows.length, 1);
  const rh = h / n;
  rows.forEach(function (r, i) {
    _tbCell(x, y + i * rh, w, rh, r[0], r[1],
      Object.assign({ labelFs: 1.4, valFs: 2.2, pad: 1.6 }, opt));
  });
}

// BLIGH TANNER text logo + address lines, inside (x,y,w,h).
function _tbLogo(x, y, w, h, color, offices, opt) {
  opt = opt || {};
  const big = opt.big || 4.6;          // logo cap height (mm)
  _tbWrite('BLIGH',  x + 2, y + 2 + big,            { fs: big, weight: '800', color: color });
  _tbWrite('TANNER', x + 2, y + 2 + big * 2 + 0.6,  { fs: big, weight: '800', color: color });
  let ly = y + 2 + big * 2 + 0.6 + 3.4;
  const small = 1.45;
  const addr = (opt.address || []).concat(offices ? [offices] : []);
  addr.forEach(function (ln) {
    _tbWrite(ln, x + 2, ly, { fs: small, weight: '500', color: _TB.ink });
    ly += small + 1.0;
  });
}

// Simple AS north point — filled arrow head over an 'N'. Centred at (cx,cy)mm.
function _tbNorth(cx, cy, r) {
  const tip = s2px(cx, cy - r), bl = s2px(cx - r * 0.55, cy + r * 0.5),
        br = s2px(cx + r * 0.55, cy + r * 0.5), mid = s2px(cx, cy + r * 0.12);
  ctx.fillStyle = _TB.ink;
  ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(bl.x, bl.y);
  ctx.lineTo(mid.x, mid.y); ctx.lineTo(br.x, br.y); ctx.closePath(); ctx.fill();
  _tbWrite('N', cx, cy - r - 0.6, { fs: 2.0, weight: '700', align: 'center', baseline: 'bottom' });
}

// Metric scale bar "SCALES AT A1": alternating filled/empty 1000-unit cells.
function _tbScaleBar(x, y, w, label) {
  const segs = 4, sw = w / segs, barH = 1.6;
  for (let i = 0; i < segs; i++) {
    const a = s2px(x + i * sw, y), b = s2px(x + (i + 1) * sw, y + barH);
    if (i % 2 === 0) { ctx.fillStyle = _TB.ink; ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y); }
    else { ctx.strokeStyle = _TB.ink; ctx.lineWidth = tbLW(LW.HATCH); ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y); }
  }
  if (label) _tbWrite(label, x, y - 0.8, { fs: 1.4, weight: '600', family: _TB.mono, color: _TB.subtle });
}

// Revision-history table. columns: [{key,label,frac}]. Reads sheetInfo.revisions.
function _tbRevTable(x, y, w, h, columns) {
  const total = columns.reduce(function (a, c) { return a + c.frac; }, 0);
  const headH = 3.6;
  // outer box
  _tbRect(x, y, w, h, tbLW(LW.HID), _TB.border);
  // header underline
  _tbLine(x, y + headH, x + w, y + headH, tbLW(LW.HID), _TB.border);
  // column x-edges
  const xs = []; let acc = x;
  columns.forEach(function (c) { xs.push(acc); acc += w * (c.frac / total); });
  xs.push(x + w);
  // vertical dividers + header labels
  for (let i = 0; i < columns.length; i++) {
    if (i > 0) _tbLine(xs[i], y, xs[i], y + h, tbLW(LW.HATCH), _TB.border);
    _tbWrite(columns[i].label, xs[i] + 1.0, y + headH - 0.9,
      { fs: 1.35, weight: '600', family: _TB.mono, color: _TB.subtle });
  }
  // data rows
  const revs = (typeof sheetInfo !== 'undefined' && Array.isArray(sheetInfo.revisions)) ? sheetInfo.revisions : [];
  const rowsArea = h - headH;
  const rowH = Math.max(3.0, Math.min(4.2, rowsArea / Math.max(revs.length, 4)));
  revs.forEach(function (rv, ri) {
    const ry = y + headH + ri * rowH;
    if (ry + rowH > y + h) return;        // clip overflow
    _tbLine(x, ry + rowH, x + w, ry + rowH, tbLW(LW.HATCH), _TB.border);
    columns.forEach(function (c, ci) {
      let v = rv[c.key] || '';
      if (c.key === 'date') v = _tbDate(v);
      _tbWrite(v, xs[ci] + 1.0, ry + rowH - 1.1,
        { fs: c.key === 'desc' ? 1.5 : 1.5, weight: '500',
          family: c.key === 'desc' ? _TB.sans : _TB.mono, color: _TB.ink });
    });
  });
}

// --- shared chrome --------------------------------------------------------

// Full outer page border (formal styles only).
function _tbDrawBorder() {
  const pg = (typeof activePageSize === 'function') ? activePageSize() : { w: SHEET.W, h: SHEET.H };
  _tbRect(SHEET.ML, SHEET.MT, pg.w - SHEET.MR - SHEET.ML, pg.h - SHEET.MB - SHEET.MT,
    tbLW(LW.VIS_HEAVY), _TB.ink);
}

// Resolve the per-render colour + font cache from computed styles.
function _tbSetStyle(cs) {
  const ink = cs.getPropertyValue('--ink').trim() || '#222';
  _TB = {
    ink: ink,
    mute: cs.getPropertyValue('--mute').trim() || ink,
    subtle: cs.getPropertyValue('--text-subtle').trim() || cs.getPropertyValue('--mute').trim() || ink,
    border: cs.getPropertyValue('--sheet-border').trim() || ink,
    accent: cs.getPropertyValue('--accent').trim() || ink,
    sans: cs.getPropertyValue('--font-sans').trim() || 'system-ui',
    mono: cs.getPropertyValue('--font-mono').trim() || 'monospace',
    serif: cs.getPropertyValue('--font-serif').trim() || 'serif',
  };
}

// ============================================================
// DISPATCHER — called from render() (22-render-core.js)
// ============================================================
function drawDrawingFrame(cs) {
  _tbSetStyle(cs);
  const style = (typeof sheetInfo !== 'undefined' && sheetInfo && sheetInfo.tbStyle) || 'sketch';
  const ins = (typeof titleBlockInsets === 'function') ? titleBlockInsets() : { border: true };
  if (ins.border) _tbDrawBorder();
  if (style === 'tbRight' && typeof _tbRight === 'function') _tbRight(cs);
  else if (style === 'sketch' && typeof _tbSketch === 'function') _tbSketch(cs);
  else _tbBottom(cs);
  ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
}

// ============================================================
// STYLE: Titleblock Bottom — VECTOR fallback (hand-drawn). Used only while the
// baked PDF background loads or if it's unavailable. Primary path is the
// PDF-backed _tbBottom (further below).
// ============================================================
function _tbBottomVector() {
  const pg = (typeof activePageSize === 'function') ? activePageSize() : { w: SHEET.W, h: SHEET.H };
  const L = SHEET.ML, R = pg.w - SHEET.MR;
  const B = pg.h - SHEET.MB;                       // strip bottom = page border
  const copyH = 3.6;                                // thin copyright row
  const T = B - TB_BOTTOM_H;                        // strip top
  const cellsB = B - copyH;                         // cells bottom (above copyright)
  const W = R - L, Hc = cellsB - T;

  // strip outer + top edge
  _tbRect(L, T, W, TB_BOTTOM_H, tbLW(LW.VIS), _TB.border);
  _tbLine(L, cellsB, R, cellsB, tbLW(LW.HID), _TB.border);

  // proportional columns
  const fr = [1.35, 1.95, 0.7, 0.95, 0.85, 1.95, 1.25, 1.0, 1.35];
  const tot = fr.reduce(function (a, b) { return a + b; }, 0);
  const xs = []; let acc = L;
  fr.forEach(function (f) { xs.push(acc); acc += W * (f / tot); });
  xs.push(R);
  const cw = function (i) { return xs[i + 1] - xs[i]; };

  // 1 — logo + offices + contact
  _tbLogo(xs[0], T, cw(0), Hc, BT_BLUE, BT_OFFICES_BOTTOM, { address: [BT_EMAIL, BT_WEB], big: 4.4 });
  _tbLine(xs[1], T, xs[1], cellsB, tbLW(LW.HID), _TB.border);

  // 2 — revision table
  _tbRevTable(xs[1], T, cw(1), Hc, [
    { key: 'rev', label: 'REV', frac: 0.6 }, { key: 'date', label: 'DATE', frac: 1.2 },
    { key: 'desc', label: 'DESCRIPTION', frac: 3.0 }, { key: 'drawn', label: 'DRN', frac: 0.7 },
    { key: 'design', label: 'DES', frac: 0.7 }, { key: 'approved', label: 'APP', frac: 0.7 }]);

  // 3 — client
  _tbCell(xs[2], T, cw(2), Hc, 'Client', sheetInfo.client, { valFs: 2.2, multiline: true });

  // 4 — architect (blank badge placeholder + name)
  _tbCell(xs[3], T, cw(3), Hc, 'Architect', '', {});
  _tbWrite('(architect logo)', xs[3] + cw(3) / 2, T + Hc * 0.42,
    { fs: 1.5, italic: true, color: _TB.subtle, align: 'center' });
  if (sheetInfo.architectName)
    _tbWrite(sheetInfo.architectName, xs[3] + cw(3) / 2, cellsB - 1.6,
      { fs: 1.9, weight: '600', align: 'center' });

  // 5 — status
  _tbCell(xs[4], T, cw(4), Hc, 'Status', '', {});
  _tbWrite(sheetInfo.status || '', xs[4] + cw(4) / 2, T + Hc * 0.62,
    { fs: 3.0, weight: '700', align: 'center', color: _TB.ink });

  // 6 — people + north + scale bar + signed
  const c6 = xs[5], w6 = cw(5);
  _tbRect(c6, T, w6, Hc, tbLW(LW.HID), _TB.border);
  const pw = w6 * 0.42;
  _tbStack(c6, T, pw, Hc, [
    ['Drawn by', sheetInfo.drawnBy], ['Design by', sheetInfo.designBy],
    ['Checked by', sheetInfo.checker], ['Signed', sheetInfo.signed]]);
  _tbLine(c6 + pw, T, c6 + pw, cellsB, tbLW(LW.HATCH), _TB.border);
  _tbNorth(c6 + pw + (w6 - pw) * 0.22, T + Hc * 0.40, 3.4);
  _tbScaleBar(c6 + pw + 3, cellsB - 4.5, (w6 - pw) - 6, 'SCALES AT A1');

  // 7 — project (name + address)
  _tbCell(xs[6], T, cw(6), Hc, 'Project',
    [sheetInfo.project, sheetInfo.projectAddress].filter(Boolean).join('\n'),
    { valFs: 2.1, multiline: true });

  // 8 — drawing title
  _tbCell(xs[7], T, cw(7), Hc, 'Drawing Title', sheetInfo.description, { valFs: 2.3, multiline: true });

  // 9 — issue: printing req (top) + jobNo / drawingNo hero / revision (bottom)
  const c9 = xs[8], w9 = cw(8);
  _tbRect(c9, T, w9, Hc, tbLW(LW.HID), _TB.border);
  const topH = Hc * 0.34;
  _tbWrite('PRINTING', c9 + 1.6, T + 2.4, { fs: 1.3, weight: '600', family: _TB.mono, color: _TB.subtle });
  _tbWrite(sheetInfo.printingReq || '', c9 + 1.6, T + 4.8, { fs: 1.6, weight: '600', color: _TB.accent });
  _tbLine(c9, T + topH, c9 + w9, T + topH, tbLW(LW.HATCH), _TB.border);
  const bx = [0, 0.32, 0.74, 1.0].map(function (f) { return c9 + w9 * f; });
  _tbCell(bx[0], T + topH, bx[1] - bx[0], Hc - topH, 'Job No', sheetInfo.jobNo, { box: false, valFs: 1.9 });
  _tbLine(bx[1], T + topH, bx[1], cellsB, tbLW(LW.HATCH), _TB.border);
  _tbCell(bx[1], T + topH, bx[2] - bx[1], Hc - topH, 'Drawing No', '', { box: false });
  _tbWrite(sheetInfo.drawingNo || 'S-XXX', (bx[1] + bx[2]) / 2, cellsB - 2.4,
    { fs: 4.6, weight: '800', align: 'center' });
  _tbLine(bx[2], T + topH, bx[2], cellsB, tbLW(LW.HATCH), _TB.border);
  _tbCell(bx[2], T + topH, bx[3] - bx[2], Hc - topH, 'Rev', '', { box: false });
  _tbWrite(sheetInfo.revision || 'A', (bx[2] + bx[3]) / 2, cellsB - 2.4,
    { fs: 4.0, weight: '800', align: 'center', color: _TB.accent });

  // copyright strip
  _tbWrite(BT_COPYRIGHT, L + 2, B - 1.1, { fs: 1.15, weight: '500', color: _TB.subtle });
}

// ============================================================
// STYLE: Sketch — VECTOR fallback (hand-drawn). Used only while the baked PDF
// background loads or if it's unavailable. Primary path is the PDF-backed
// _tbSketch (further below). NOTE: this fallback uses the older field layout
// (incl. Rev); the PDF-backed primary matches the real BT sketch template.
// ============================================================
function _tbSketchVector() {
  const pg = (typeof activePageSize === 'function') ? activePageSize() : { w: SHEET.W, h: SHEET.H };
  const W_SK = 300, H_SK = 40;
  const x0 = pg.w - SHEET.MR - W_SK;
  const y0 = pg.h - SHEET.MB - H_SK;
  // Monochrome navy — override the style cache for the duration of this block
  // (reset every render by _tbSetStyle, so this is safe).
  _TB.ink = _TB.border = _TB.subtle = _TB.mute = _TB.accent = BT_NAVY;

  _tbRect(x0, y0, W_SK, H_SK, tbLW(LW.VIS), BT_NAVY);
  const fr = [1.25, 1.0, 1.7, 1.15];
  const tot = fr.reduce(function (a, b) { return a + b; }, 0);
  const xs = []; let acc = x0;
  fr.forEach(function (f) { xs.push(acc); acc += W_SK * (f / tot); });
  xs.push(x0 + W_SK);
  const cw = function (i) { return xs[i + 1] - xs[i]; };

  // 1 — logo + address
  _tbLogo(xs[0], y0, cw(0), H_SK, BT_NAVY, null, { address: BT_ADDR_SKETCH, big: 3.9 });
  _tbLine(xs[1], y0, xs[1], y0 + H_SK, tbLW(LW.HID), BT_NAVY);
  // 2 — project (label fixed, value editable, may be blank)
  _tbCell(xs[1], y0, cw(1), H_SK, 'Project', sheetInfo.project, { box: false, valFs: 2.2, multiline: true });
  _tbLine(xs[2], y0, xs[2], y0 + H_SK, tbLW(LW.HID), BT_NAVY);
  // 3 — item / detail description
  _tbCell(xs[2], y0, cw(2), H_SK, 'Item', sheetInfo.description, { box: false, valFs: 2.0, multiline: true });
  _tbLine(xs[3], y0, xs[3], y0 + H_SK, tbLW(LW.HID), BT_NAVY);
  // 4 — right data stack (2 cols × 3 rows)
  const c = xs[3], w = cw(3), colw = w / 2, rh = H_SK / 3;
  const data = [
    ['Project No', sheetInfo.jobNo],   ['Sheet No', sheetInfo.drawingNo],
    ['Made by',    sheetInfo.drawnBy],  ['Scale',    sheetInfo.scaleText || ('1:' + drawingScale)],
    ['Date',       _tbDate(sheetInfo.date)], ['Rev',   sheetInfo.revision],
  ];
  for (let k = 0; k < 6; k++) {
    const r = Math.floor(k / 2), col = k % 2;
    _tbCell(c + col * colw, y0 + r * rh, colw, rh, data[k][0], data[k][1],
      { labelFs: 1.3, valFs: 1.9, pad: 1.3, color: BT_NAVY });
  }
}

// ============================================================
// STYLE: Titleblock Right — VECTOR fallback (hand-drawn). Only used while the
// baked PDF background loads, or if it's unavailable. The primary path is the
// PDF-backed _tbRight (further below), which blits the office template image
// and overlays the editable values at the template's own field positions.
// ============================================================
function _tbRightVector() {
  const pg = (typeof activePageSize === 'function') ? activePageSize() : { w: SHEET.W, h: SHEET.H };
  const R = pg.w - SHEET.MR, L = R - TB_RIGHT_W;
  const T = SHEET.MT, B = pg.h - SHEET.MB;
  const W = TB_RIGHT_W, H = B - T;

  _tbRect(L, T, W, H, tbLW(LW.VIS), _TB.border);
  // proportional rows (top → bottom)
  const fr = [1.0, 1.7, 0.5, 0.95, 0.8, 1.15, 0.65, 0.95, 1.0, 0.95, 0.8, 1.05];
  const tot = fr.reduce(function (a, b) { return a + b; }, 0);
  const ys = []; let acc = T;
  fr.forEach(function (f) { ys.push(acc); acc += H * (f / tot); });
  ys.push(B);
  const rh = function (i) { return ys[i + 1] - ys[i]; };
  // horizontal dividers between every row
  for (let k = 1; k < fr.length; k++) _tbLine(L, ys[k], R, ys[k], tbLW(LW.HID), _TB.border);

  let i = 0;
  // 1 — copyright
  (function () {
    const lines = _tbWrap(BT_COPYRIGHT, W - 3, 1.2);
    lines.forEach(function (ln, k) {
      _tbWrite(ln, L + 1.5, ys[0] + 2.6 + k * 1.9, { fs: 1.2, color: _TB.subtle });
    });
  })(); i++;
  // 2 — revision table (REV/DATE/DESCRIPTION/ISSUED)
  _tbRevTable(L, ys[i], W, rh(i), [
    { key: 'rev', label: 'REV', frac: 0.7 }, { key: 'date', label: 'DATE', frac: 1.3 },
    { key: 'desc', label: 'DESCRIPTION', frac: 2.6 }, { key: 'issued', label: 'ISS', frac: 0.8 }]); i++;
  // 3 — printing requirements
  _tbCell(L, ys[i], W, rh(i), 'Printing', sheetInfo.printingReq, { box: false, valFs: 1.7, valColor: _TB.accent }); i++;
  // 4 — status + sub-line
  _tbWrite('STATUS', L + 1.6, ys[i] + 2.4, { fs: 1.4, weight: '600', family: _TB.mono, color: _TB.subtle });
  _tbWrite(sheetInfo.status || '', L + W / 2, ys[i] + rh(i) * 0.55, { fs: 2.8, weight: '700', align: 'center' });
  if (sheetInfo.statusSub)
    _tbWrite(sheetInfo.statusSub, L + W / 2, ys[i] + rh(i) - 1.8, { fs: 1.8, weight: '700', align: 'center', color: BT_RED });
  i++;
  // 5 — north point + scale bar
  _tbNorth(L + W * 0.18, ys[i] + rh(i) * 0.5, 3.2);
  _tbScaleBar(L + W * 0.34, ys[i] + rh(i) - 3.2, W * 0.58, 'SCALES AT A1'); i++;
  // 6 — logo + offices + contact
  _tbLogo(L, ys[i], W, rh(i), BT_BLUE, BT_OFFICES_RIGHT, { address: [BT_EMAIL, BT_WEB], big: 4.4 }); i++;
  // 7 — client
  _tbCell(L, ys[i], W, rh(i), 'Client', sheetInfo.client, { box: false, valFs: 2.0, multiline: true }); i++;
  // 8 — architect (blank badge + name)
  _tbWrite('ARCHITECT', L + 1.6, ys[i] + 2.4, { fs: 1.4, weight: '600', family: _TB.mono, color: _TB.subtle });
  _tbWrite('(architect logo)', L + W / 2, ys[i] + rh(i) * 0.5, { fs: 1.5, italic: true, align: 'center', color: _TB.subtle });
  if (sheetInfo.architectName)
    _tbWrite(sheetInfo.architectName, L + W / 2, ys[i + 1] - 1.8, { fs: 1.9, weight: '600', align: 'center' });
  i++;
  // 9 — drawn / design / checked / signed
  _tbStack(L, ys[i], W, rh(i), [
    ['Drawn by', sheetInfo.drawnBy], ['Design by', sheetInfo.designBy],
    ['Checked by', sheetInfo.checker], ['Signed', sheetInfo.signed]]); i++;
  // 10 — project (name + address)
  _tbCell(L, ys[i], W, rh(i), 'Project',
    [sheetInfo.project, sheetInfo.projectAddress].filter(Boolean).join('\n'),
    { box: false, valFs: 1.9, multiline: true }); i++;
  // 11 — drawing title
  _tbCell(L, ys[i], W, rh(i), 'Drawing Title', sheetInfo.description, { box: false, valFs: 2.1, multiline: true }); i++;
  // 12 — job no / drawing no (hero) / revision
  const hy = ys[i], hh = rh(i);
  const sub = [0, 0.34, 0.78, 1.0].map(function (f) { return L + W * f; });
  _tbCell(sub[0], hy, sub[1] - sub[0], hh, 'Job No', sheetInfo.jobNo, { box: false, valFs: 1.7 });
  _tbLine(sub[1], hy, sub[1], B, tbLW(LW.HATCH), _TB.border);
  _tbWrite('DRAWING No', sub[1] + 1.4, hy + 2.4, { fs: 1.3, weight: '600', family: _TB.mono, color: _TB.subtle });
  _tbWrite(sheetInfo.drawingNo || 'S-XXX', (sub[1] + sub[2]) / 2, B - 2.6, { fs: 4.4, weight: '800', align: 'center' });
  _tbLine(sub[2], hy, sub[2], B, tbLW(LW.HATCH), _TB.border);
  _tbWrite('REV', sub[2] + 1.4, hy + 2.4, { fs: 1.3, weight: '600', family: _TB.mono, color: _TB.subtle });
  _tbWrite(sheetInfo.revision || 'A', (sub[2] + sub[3]) / 2, B - 2.6, { fs: 3.8, weight: '800', align: 'center', color: _TB.accent });
}

// ============================================================
// Style switcher — public API + segment sync
// ============================================================

// Set the active sheet's title-block style, re-fit the layout, persist.
function setTitleBlockStyle(style) {
  if (['sketch', 'tbBottom', 'tbRight'].indexOf(style) < 0) style = 'sketch';
  if (typeof sheetInfo === 'undefined' || !sheetInfo) return;
  sheetInfo.tbStyle = style;
  tbStyleSyncSwitcher();
  // Re-fit geometry to the new insets: in 2D re-derive the pane via
  // applySheetMode (re-runs the 2D-pane inset math); in 3D re-pack the four
  // detail blocks via layoutBlocks.
  if (typeof sheetMode !== 'undefined' && sheetMode === '2d' && typeof applySheetMode === 'function') {
    applySheetMode('2d', /*silent=*/true);
  } else if (typeof layoutBlocks === 'function') {
    layoutBlocks();
  }
  if (typeof _projectSnapshotActive === 'function') _projectSnapshotActive();
  if (typeof workspaceTouchActive === 'function') workspaceTouchActive();
  if (typeof requestRender === 'function') requestRender();
}

// Reflect the active sheet's tbStyle onto the segmented control. Called on a
// sheet switch (via applySheetMode) and by setTitleBlockStyle.
function tbStyleSyncSwitcher() {
  const st = (typeof sheetInfo !== 'undefined' && sheetInfo && sheetInfo.tbStyle) || 'sketch';
  const segs = document.querySelectorAll('.tb-style-seg');
  segs.forEach(function (b) { b.classList.toggle('active', b.dataset.tbstyle === st); });
}

// ============================================================
// Edit-dialog support — one declarative field list + revision-row editor
// ============================================================
// [inputId-suffix, sheetInfo key] — drives BOTH dialog populate and writeback
// (62-toolbar.js) so the two stay in sync. Input ids are 'tb' + suffix.
const TB_DIALOG_FIELDS = [
  ['Project', 'project'], ['ProjectAddress', 'projectAddress'], ['Client', 'client'],
  ['JobNo', 'jobNo'], ['Description', 'description'], ['DrawingNo', 'drawingNo'],
  ['Revision', 'revision'], ['Date', 'date'], ['SheetOf', 'sheetOf'],
  ['ScaleText', 'scaleText'], ['PrintingReq', 'printingReq'], ['Status', 'status'],
  ['StatusSub', 'statusSub'], ['DrawnBy', 'drawnBy'], ['DesignBy', 'designBy'],
  ['Checker', 'checker'], ['Signed', 'signed'], ['ArchitectName', 'architectName'],
  ['FirmName', 'firmName'],
];

const TB_REV_COLS = ['rev', 'date', 'desc', 'drawn', 'design', 'approved', 'issued'];
const _TB_REV_GRID = 'display:grid;grid-template-columns:46px 86px 1fr 40px 40px 40px 40px 22px;gap:4px;align-items:center;margin-bottom:4px';

function _tbRevRowEl(rv) {
  rv = rv || {};
  const row = document.createElement('div');
  row.className = 'tb-rev-row'; row.style.cssText = _TB_REV_GRID;
  TB_REV_COLS.forEach(function (k) {
    const inp = document.createElement('input');
    inp.dataset.k = k; inp.value = rv[k] || '';
    inp.style.cssText = 'width:100%;min-width:0;font-size:11px;padding:2px 4px';
    row.appendChild(inp);
  });
  const del = document.createElement('button');
  del.type = 'button'; del.textContent = '×';
  del.title = 'Delete revision';
  del.style.cssText = 'cursor:pointer;border:none;background:transparent;font-size:15px;color:var(--text-mute)';
  del.addEventListener('click', function () { row.remove(); });
  row.appendChild(del);
  return row;
}

// Render the revision editor rows from an array into #tbRevEditor.
function tbBuildRevRows(revs) {
  const host = document.getElementById('tbRevEditor');
  if (!host) return;
  host.innerHTML = '';
  const head = document.createElement('div');
  head.style.cssText = _TB_REV_GRID + ';margin-bottom:2px';
  head.innerHTML = ['REV', 'DATE', 'DESCRIPTION', 'DRN', 'DES', 'APP', 'ISS', ''].map(function (h) {
    return '<span style="font:600 9.5px var(--font-mono,monospace);letter-spacing:.04em;color:var(--text-mute)">' + h + '</span>';
  }).join('');
  host.appendChild(head);
  (Array.isArray(revs) ? revs : []).forEach(function (rv) { host.appendChild(_tbRevRowEl(rv)); });
}

// Append one blank revision row to the editor.
function tbAddRevRow() {
  const host = document.getElementById('tbRevEditor');
  if (host) host.appendChild(_tbRevRowEl({}));
}

// Read the revision editor rows back into an array (dropping fully-empty rows).
function tbReadRevRows() {
  const host = document.getElementById('tbRevEditor');
  if (!host) return [];
  const out = [];
  host.querySelectorAll('.tb-rev-row').forEach(function (row) {
    const rv = {}; let any = false;
    row.querySelectorAll('input').forEach(function (inp) {
      rv[inp.dataset.k] = inp.value; if (inp.value) any = true;
    });
    if (any) out.push(rv);
  });
  return out;
}

// ============================================================
// STYLE: Titleblock Right — PDF-BACKED (primary)
// ============================================================
// Blits the office-standard title-block strip (baked from the CLEAN blank
// template titleblock-templates/Structural Drawing - Titleblock Right (blank).pdf
// via pdftoppm → titleblock-templates/right-bg.png) so the background is
// pixel-identical to the real BT title block, then overlays only the editable
// values at the template's own field positions (in sheet-mm; the PDF page is A1
// landscape so PDF-mm == sheet-mm 1:1). Falls back to _tbRightVector until the
// image loads.
// Prefer the embedded data-URL (87a-titleblock-bg-data.js, loaded first) —
// a file-path <img> taints the canvas under file://, which breaks both the
// white-keying below AND the vector-PDF export's toDataURL embed.
const TB_RIGHT_BG_SRC = (typeof TB_RIGHT_BG_B64 !== 'undefined')
  ? TB_RIGHT_BG_B64 : 'titleblock-templates/right-bg.png';
const TB_RIGHT_STRIP_L = 712;     // sheet-mm: left edge of the baked strip (keep TB_RIGHT_W in 01-config in sync)
const TB_OV_FONT = 'Arial, Helvetica, sans-serif';   // match the template's sans
const TB_OV_INK  = '#1a1a1a';
let _tbRightBg = null, _tbRightBgState = '';          // '', 'loading', 'ready', 'failed'

// Generic baked-template loader (used by Bottom/Sketch). Loads `src`, CLEARS the
// value-area rects (so the baked-in original values vanish; rects are inset from
// the grid lines so the linework survives), keys white→transparent, and caches a
// canvas per `key`. region=[L,T,R,B] sheet-mm the PNG covers; clears=[[x,y,w,h]…]
// sheet-mm. Returns the canvas or null while loading.
const _tbBgCache = {};
function _tbEnsureBg(key, src, region, clears) {
  const c = _tbBgCache[key];
  if (c && c.state === 'ready') return c.canvas;
  if (c && (c.state === 'loading' || c.state === 'failed')) return null;
  _tbBgCache[key] = { state: 'loading', canvas: null };
  const img = new Image();
  img.onload = function () {
    try {
      const cv = document.createElement('canvas');
      cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      const cx = cv.getContext('2d');
      cx.drawImage(img, 0, 0);
      const ppmX = cv.width / (region[2] - region[0]);
      const ppmY = cv.height / (region[3] - region[1]);
      // STEP 1 — white-OUT the value areas (paint WHITE, not clear) so they merge
      // with the surrounding white cells. Caller insets the rects from the grid
      // lines so borders + labels survive.
      cx.fillStyle = '#ffffff';
      (clears || []).forEach(function (r) {
        cx.fillRect((r[0] - region[0]) * ppmX, (r[1] - region[1]) * ppmY, r[2] * ppmX, r[3] * ppmY);
      });
      // STEP 2 — key white→transparent so the cream page shows through uniformly.
      // The < 30 floor kills the faint near-white haze so there's NO tint/block
      // behind anything — the whole title block reads as the bare page colour.
      try {
        const id = cx.getImageData(0, 0, cv.width, cv.height), d = id.data;
        for (let i = 0; i < d.length; i += 4) {
          let a = 255 - Math.min(d[i], d[i + 1], d[i + 2]);
          if (a < 30) a = 0;
          d[i + 3] = a;
        }
        cx.putImageData(id, 0, 0);
      } catch (e) { /* tainted — keep as-is */ }
      _tbBgCache[key] = { state: 'ready', canvas: cv };
    } catch (e) { _tbBgCache[key] = { state: 'failed', canvas: null }; }
    if (typeof requestRender === 'function') requestRender();
  };
  img.onerror = function () { _tbBgCache[key] = { state: 'failed', canvas: null }; console.warn('[titleblock] bg load failed: ' + src); };
  img.src = src;
  return null;
}

function _tbEnsureRightBg() {
  if (_tbRightBgState === 'ready') return _tbRightBg;
  if (_tbRightBgState === 'loading' || _tbRightBgState === 'failed') return null;
  _tbRightBgState = 'loading';
  const img = new Image();
  img.onload = function () {
    // Cache as a CANVAS (not the <img>): the vector-PDF export shim needs
    // toDataURL to embed the bitmap. Also key the WHITE background out to alpha
    // so the cream page shows through (no white box clashing with the sheet) and
    // it composites cleanly in PDF export. The template is black + cyan ink on
    // white, so per-pixel alpha = 255 − min(r,g,b) drops white, keeps the ink,
    // and softens the anti-aliased edges (no halo).
    try {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const cx = c.getContext('2d');
      cx.drawImage(img, 0, 0);
      try {
        const id = cx.getImageData(0, 0, c.width, c.height), d = id.data;
        for (let i = 0; i < d.length; i += 4) {
          let a = 255 - Math.min(d[i], d[i + 1], d[i + 2]);
          if (a < 30) a = 0;                  // kill faint near-white tint → clean cream
          d[i + 3] = a;
        }
        cx.putImageData(id, 0, 0);
      } catch (e) { /* tainted canvas — keep the opaque white bg */ }
      _tbRightBg = c;
    } catch (e) { _tbRightBg = img; }   // fallback: screen still works
    _tbRightBgState = 'ready';
    if (typeof requestRender === 'function') requestRender();
  };
  img.onerror = function () { _tbRightBgState = 'failed'; console.warn('[titleblock] right-bg.png failed to load — using vector fallback'); };
  img.src = TB_RIGHT_BG_SRC;
  return null;
}

// Overlay text writer — sheet-mm anchor, Arial, baseline at y. opt:{weight,align,color}.
function _tbOv(str, xMm, yMm, sizeMm, opt) {
  if (str == null || str === '') return;
  opt = opt || {};
  ctx.font = (opt.weight || '400') + ' ' + _tbFpx(sizeMm) + 'px ' + TB_OV_FONT;
  ctx.fillStyle = opt.color || TB_OV_INK;
  ctx.textAlign = opt.align || 'left';
  ctx.textBaseline = 'alphabetic';
  const p = s2px(xMm, yMm);
  ctx.fillText(String(str), p.x, p.y);
}

// Overlay writer that shrinks the font to fit maxWmm on one line, then draws.
function _tbOvFit(str, xMm, yMm, sizeMm, maxWmm, opt) {
  if (str == null || str === '') return;
  opt = opt || {};
  let sz = sizeMm;
  ctx.font = (opt.weight || '400') + ' ' + _tbFpx(sz) + 'px ' + TB_OV_FONT;
  const wPx = ctx.measureText(String(str)).width, maxPx = sheetLen(maxWmm);
  if (wPx > maxPx && wPx > 0) sz = sz * maxPx / wPx;
  _tbOv(str, xMm, yMm, sz, opt);
}

function _tbRight() {
  _tbEnsureFieldEvents();                       // bind click-to-edit (once)
  const bg = _tbEnsureRightBg();
  if (!bg) { _tbRightVector(); return; }       // fallback while loading / if missing
  const pg = (typeof activePageSize === 'function') ? activePageSize() : { w: SHEET.W, h: SHEET.H };
  // Blit the whole baked strip (PDF-mm == sheet-mm) into the right strip.
  const a = s2px(TB_RIGHT_STRIP_L, 0), b = s2px(pg.w, pg.h);
  ctx.drawImage(bg, a.x, a.y, b.x - a.x, b.y - a.y);
  // Re-draw the outer page frame on top so the drawing-area border stays crisp.
  _tbDrawBorder();
  _tbRightOverlay();
  if (_tbEditingKey && _tbEditField) _tbPositionEditor(_tbEditField);   // track pan/zoom
}

// dd.mm.yy for the narrow revision-table date column.
function _tbDateShort(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? (m[3] + '.' + m[2] + '.' + m[1].slice(2)) : (s || '');
}

// All editable values, positioned at the template's own field coordinates
// (extracted from the source PDF text layer; sheet-mm, baseline y).
function _tbRightOverlay() {
  const si = sheetInfo, ed = _tbEditingKey;
  // ov(key,...) draws sheetInfo[key] unless that field is currently being edited.
  function ov(key, x, y, size, opt) { if (ed === key) return; _tbOv(si[key], x, y, size, opt); }
  // Revision table (header at y≈51.8; rows step ≈4.85mm; ~9 rows available).
  const revCols = [['rev', 724.3], ['date', 733.0], ['desc', 746.8], ['issued', 809.3]];
  (Array.isArray(si.revisions) ? si.revisions : []).slice(0, 9).forEach(function (rv, i) {
    const y = 56.8 + i * 4.85;
    revCols.forEach(function (c) {
      if (ed === 'rev:' + i + ':' + c[0]) return;
      const v = c[0] === 'date' ? _tbDateShort(rv[c[0]]) : (rv[c[0]] || '');
      _tbOv(v, c[1], y, 3.3);
    });
  });
  ov('printingReq', 723.5, 280.6, 2.6);
  // Status — centred + auto-fit to the strip width; red sub-line below.
  const cx = (TB_RIGHT_STRIP_L + 841) / 2;
  if (ed !== 'status' && si.status) {
    let sz = 8.0;
    ctx.font = '600 ' + _tbFpx(sz) + 'px ' + TB_OV_FONT;
    const wPx = ctx.measureText(si.status).width, maxPx = sheetLen(116);
    if (wPx > maxPx) sz = sz * maxPx / wPx;
    _tbOv(si.status, cx, 297, sz, { align: 'center', weight: '600' });
  }
  if (ed !== 'statusSub') _tbOv(si.statusSub, cx, 308, 5.0, { align: 'center', weight: '700', color: BT_RED });
  ov('client', 723.5, 394.3, 5.2);
  ov('architectName', 723.5, 476, 4.0);
  ov('drawnBy', 763.6, 484.5, 4.0);
  ov('designBy', 763.4, 494.5, 4.0);
  ov('checker', 764.2, 504.5, 4.0);
  ov('signed', 773.0, 489.5, 3.6);
  ov('project', 723.5, 518.4, 5.6);
  ov('projectAddress', 723.5, 526.6, 4.8);
  // Drawing title — wrap to at most 2 lines within the cell.
  if (ed !== 'description') _tbRightWrap(si.description, 723.5, 544.3, 841 - 6 - 723.5, 5.4, 6.3, 2);
  // Hero number row: JOB NO / DRAWING NUMBER / REVISION.
  ov('jobNo', 724.0, 570.1, 8.4, { weight: '500' });
  ov('drawingNo', 780.7, 570.1, 8.4, { weight: '600' });
  ov('revision', 807.7, 570.1, 8.4, { weight: '600' });
}

// Word-wrap an overlay value to ≤maxLines lines at xMm, starting baseline yMm.
function _tbRightWrap(text, xMm, yMm, maxWmm, sizeMm, lineMm, maxLines) {
  if (!text) return;
  ctx.font = '400 ' + _tbFpx(sizeMm) + 'px ' + TB_OV_FONT;
  const maxPx = sheetLen(maxWmm);
  const words = String(text).split(/\s+/), lines = []; let cur = '';
  words.forEach(function (w) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > maxPx && cur) { lines.push(cur); cur = w; } else cur = t;
  });
  if (cur) lines.push(cur);
  lines.slice(0, maxLines || 2).forEach(function (ln, i) { _tbOv(ln, xMm, yMm + i * lineMm, sizeMm); });
}

// ============================================================
// Inline click-to-edit (PDF-backed Right)
// ============================================================
// Click any title-block cell → a text box sized to that cell appears; type and
// press Enter/Tab (or click away) to commit, Esc to cancel. Values write
// straight to sheetInfo, so the canvas + PDF export stay the source of truth.
// Each field is an input top-left (x,y) + box size (w,h) + font (size), sheet-mm.
const TB_RIGHT_FIELDS = [
  { key: 'printingReq',   x: 716, y: 276, w: 122, h: 5,  size: 2.6, align: 'left' },
  { key: 'status',        x: 716, y: 289, w: 122, h: 11, size: 7.0, align: 'center' },
  { key: 'statusSub',     x: 716, y: 302, w: 122, h: 7,  size: 5.0, align: 'center' },
  { key: 'client',        x: 720, y: 389, w: 118, h: 8,  size: 5.2, align: 'left' },
  { key: 'architectName', x: 720, y: 469, w: 118, h: 7,  size: 4.0, align: 'left' },
  { key: 'drawnBy',       x: 744, y: 480, w: 25,  h: 6,  size: 4.0, align: 'left' },
  { key: 'designBy',      x: 744, y: 490, w: 25,  h: 6,  size: 4.0, align: 'left' },
  { key: 'checker',       x: 744, y: 500, w: 25,  h: 6,  size: 4.0, align: 'left' },
  { key: 'signed',        x: 771, y: 483, w: 66,  h: 7,  size: 3.6, align: 'left' },
  { key: 'project',       x: 720, y: 512, w: 118, h: 8,  size: 5.6, align: 'left' },
  { key: 'projectAddress',x: 720, y: 521, w: 118, h: 7,  size: 4.8, align: 'left' },
  { key: 'description',   x: 720, y: 539, w: 118, h: 8,  size: 5.4, align: 'left' },
  { key: 'jobNo',         x: 716, y: 561, w: 50,  h: 11, size: 8.4, align: 'left' },
  { key: 'drawingNo',     x: 770, y: 561, w: 36,  h: 11, size: 8.4, align: 'left' },
  { key: 'revision',      x: 806, y: 561, w: 32,  h: 11, size: 8.4, align: 'left' },
];
const TB_RIGHT_REV_COLS = [
  { col: 'rev', x: 721, w: 9 }, { col: 'date', x: 731, w: 14 },
  { col: 'desc', x: 746, w: 60 }, { col: 'issued', x: 807, w: 28 },
];
const TB_RIGHT_REV_Y0 = 53.6, TB_RIGHT_REV_DY = 4.85, TB_RIGHT_REV_ROWS = 9;

let _tbEditingKey = null, _tbEditField = null, _tbEditInput = null, _tbFieldEventsBound = false;

// Which field (or revision-table cell) sits under a sheet-mm point, or null.
function _tbRightFieldAt(u, v) {
  for (let i = 0; i < TB_RIGHT_FIELDS.length; i++) {
    const f = TB_RIGHT_FIELDS[i];
    if (u >= f.x && u <= f.x + f.w && v >= f.y && v <= f.y + f.h) return f;
  }
  for (let r = 0; r < TB_RIGHT_REV_ROWS; r++) {
    const y = TB_RIGHT_REV_Y0 + r * TB_RIGHT_REV_DY;
    if (v < y || v > y + TB_RIGHT_REV_DY) continue;
    for (let c = 0; c < TB_RIGHT_REV_COLS.length; c++) {
      const col = TB_RIGHT_REV_COLS[c];
      if (u >= col.x && u <= col.x + col.w)
        return { key: 'rev:' + r + ':' + col.col, x: col.x, y: y, w: col.w, h: TB_RIGHT_REV_DY, size: 3.3, align: 'left' };
    }
  }
  return null;
}

function _tbFieldValue(key) {
  if (key.indexOf('rev:') === 0) {
    const p = key.split(':'), r = (sheetInfo.revisions || [])[+p[1]];
    return (r && r[p[2]]) || '';
  }
  return sheetInfo[key] || '';
}
function _tbSetFieldValue(key, val) {
  if (key.indexOf('rev:') === 0) {
    const p = key.split(':'), i = +p[1];
    if (!Array.isArray(sheetInfo.revisions)) sheetInfo.revisions = [];
    while (sheetInfo.revisions.length <= i) sheetInfo.revisions.push({});
    sheetInfo.revisions[i][p[2]] = val;
  } else { sheetInfo[key] = val; }
}

function _tbEditInputEl() {
  if (_tbEditInput) return _tbEditInput;
  const inp = document.createElement('input');
  inp.type = 'text'; inp.autocomplete = 'off'; inp.spellcheck = false;
  inp.style.cssText = 'position:fixed;z-index:1000;margin:0;padding:0 1px;box-sizing:border-box;' +
    'border:1px solid var(--accent,#c0392b);background:transparent;color:#1a1a1a;' +
    'font-family:' + TB_OV_FONT + ';line-height:1;outline:none;display:none';
  inp.addEventListener('keydown', function (e) {
    e.stopPropagation();
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); _tbCommitFieldEditor(e.key === 'Tab'); }
    else if (e.key === 'Escape') { e.preventDefault(); _tbCancelFieldEditor(); }
  });
  inp.addEventListener('blur', function () { _tbCommitFieldEditor(false); });
  document.body.appendChild(inp);
  _tbEditInput = inp;
  return inp;
}

function _tbPositionEditor(f) {
  const inp = _tbEditInputEl(), rect = canvas.getBoundingClientRect(), a = s2px(f.x, f.y);
  inp.style.left = (rect.left + a.x) + 'px';
  inp.style.top = (rect.top + a.y) + 'px';
  inp.style.width = Math.max(24, sheetLen(f.w)) + 'px';
  inp.style.height = Math.max(15, sheetLen(f.h)) + 'px';
  inp.style.fontSize = Math.max(11, Math.min(sheetLen(f.size), sheetLen(f.h) * 0.92)) + 'px';
  inp.style.textAlign = f.align || 'left';
}

function _tbOpenFieldEditor(f) {
  if (_tbEditingKey) _tbCommitFieldEditor(false);
  _tbEditingKey = f.key; _tbEditField = f;
  const inp = _tbEditInputEl();
  _tbPositionEditor(f);
  inp.value = _tbFieldValue(f.key);
  inp.style.display = 'block';
  inp.focus(); inp.select();
  requestRender();   // canvas now skips this field
}

function _tbCommitFieldEditor(advance) {
  if (!_tbEditingKey) return;
  const key = _tbEditingKey, f = _tbEditField;
  _tbEditingKey = null; _tbEditField = null;
  if (_tbEditInput) { _tbSetFieldValue(key, _tbEditInput.value); _tbEditInput.style.display = 'none'; }
  if (typeof _projectSnapshotActive === 'function') _projectSnapshotActive();
  requestRender();
  if (advance && f) {
    const reg = sheetInfo && _TB_EDIT[sheetInfo.tbStyle];
    const fields = (reg && reg.fields) || [];
    const idx = fields.indexOf(f);
    if (idx >= 0 && idx + 1 < fields.length) _tbOpenFieldEditor(fields[idx + 1]);
  }
}
function _tbCancelFieldEditor() {
  _tbEditingKey = null; _tbEditField = null;
  if (_tbEditInput) _tbEditInput.style.display = 'none';
  requestRender();
}

// Bind the click-to-edit handler to the canvas once (capture phase, so a click
// inside the title block opens the editor instead of starting a draw).
function _tbEnsureFieldEvents() {
  if (_tbFieldEventsBound) return;
  _tbFieldEventsBound = true;
  // Bind on document (a STABLE node), not the canvas: the canvas element can be
  // recreated (e.g. on resize), which silently orphans a canvas-bound handler and
  // breaks click-to-edit. The e.target===canvas guard keeps the scope to the sheet.
  document.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;
    if (typeof canvas === 'undefined' || !canvas || e.target !== canvas) return;
    if (typeof sheetMode !== 'undefined' && sheetMode !== '2d') return;
    const reg = sheetInfo && _TB_EDIT[sheetInfo.tbStyle];
    if (!reg) return;
    const rect = canvas.getBoundingClientRect();
    const sh = px2s(e.clientX - rect.left, e.clientY - rect.top);
    if (!reg.inStrip(sh.x, sh.y)) return;
    e.stopPropagation(); e.preventDefault();
    const f = reg.fieldAt(sh.x, sh.y);
    if (f) _tbOpenFieldEditor(f); else _tbCommitFieldEditor(false);
  }, true);
}

// ============================================================
// STYLE: Titleblock Bottom — PDF-BACKED (primary)
// ============================================================
const TB_BOTTOM_BG_SRC = (typeof TB_BOTTOM_BG_B64 !== 'undefined')
  ? TB_BOTTOM_BG_B64 : 'titleblock-templates/bottom-bg.png';   // data-URL: see TB_RIGHT_BG_SRC note
const TB_BOTTOM_REGION = [0, 516, 841, 590];      // sheet-mm the baked PNG covers
const TB_BOTTOM_STRIP_T = 516;
// bottom-bg.png is now baked from the truly-blank office template
// (titleblock-templates/Structural Drawing - Titleblock Bottom (blank).pdf), so
// there are NO baked-in values to cover — the load-time white→alpha key alone
// keeps the cells clean. Empty by design; restore rects only if a future bake
// reintroduces baked-in content.
const TB_BOTTOM_CLEARS = [];
// Editable fields: {key, x(left), y(baseline), w, h, size, align}.
const TB_BOTTOM_FIELDS = [
  { key: 'client',        x: 298, y: 528,   w: 84,  h: 6,  size: 4.4, align: 'left' },
  { key: 'architectName', x: 388, y: 545,   w: 80,  h: 5,  size: 3.6, align: 'center' },
  { key: 'status',        x: 478, y: 536,   w: 86,  h: 12, size: 5.6, align: 'center' },
  { key: 'drawnBy',       x: 590, y: 525.5, w: 30,  h: 5,  size: 4.2, align: 'left' },
  { key: 'designBy',      x: 583, y: 535.5, w: 37,  h: 5,  size: 4.2, align: 'left' },
  { key: 'checker',       x: 589, y: 545.5, w: 31,  h: 5,  size: 4.2, align: 'left' },
  { key: 'signed',        x: 575, y: 555.5, w: 45,  h: 5,  size: 3.6, align: 'left' },
  { key: 'project',       x: 625, y: 527.4, w: 214, h: 6,  size: 5.4, align: 'left' },
  { key: 'projectAddress',x: 625, y: 535.4, w: 214, h: 5,  size: 4.3, align: 'left' },
  { key: 'description',   x: 625, y: 547,   w: 214, h: 6,  size: 5.2, align: 'left' },
  // NOTE: no 'printingReq' field — the Bottom (blank) template bakes the fixed
  // note "PRINT THIS DRAWING IN COLOUR" into the printing cell, so overlaying an
  // editable value here would double up. (The Right template leaves it blank, so
  // tbRight DOES keep an editable printingReq.)
  { key: 'jobNo',         x: 704, y: 570.5, w: 47,  h: 9,  size: 7.2, align: 'left' },
  { key: 'drawingNo',     x: 755, y: 570.5, w: 41,  h: 9,  size: 7.2, align: 'left' },
  { key: 'revision',      x: 800, y: 570.5, w: 38,  h: 9,  size: 7.2, align: 'left' },
];
const TB_BOTTOM_REV_COLS = [
  { col: 'rev', x: 92, w: 14 }, { col: 'date', x: 106, w: 14 }, { col: 'desc', x: 120, w: 104 },
  { col: 'drawn', x: 225, w: 12 }, { col: 'design', x: 238, w: 12 }, { col: 'approved', x: 251, w: 33 },
];
const TB_BOTTOM_REV_Y0 = 525.4, TB_BOTTOM_REV_DY = 4.85, TB_BOTTOM_REV_ROWS = 4;

function _tbBottomFieldAt(u, v) {
  for (let i = 0; i < TB_BOTTOM_FIELDS.length; i++) {
    const f = TB_BOTTOM_FIELDS[i];
    if (u >= f.x && u <= f.x + f.w && v >= f.y - f.h && v <= f.y + 1.5) return f;
  }
  for (let r = 0; r < TB_BOTTOM_REV_ROWS; r++) {
    const y = TB_BOTTOM_REV_Y0 + r * TB_BOTTOM_REV_DY;
    if (v < y || v > y + TB_BOTTOM_REV_DY) continue;
    for (let c = 0; c < TB_BOTTOM_REV_COLS.length; c++) {
      const col = TB_BOTTOM_REV_COLS[c];
      if (u >= col.x && u <= col.x + col.w)
        return { key: 'rev:' + r + ':' + col.col, x: col.x + 1, y: y + TB_BOTTOM_REV_DY - 1.3, w: col.w - 1, h: TB_BOTTOM_REV_DY - 1, size: 3.0, align: 'left' };
    }
  }
  return null;
}

function _tbBottom() {
  _tbEnsureFieldEvents();
  const bg = _tbEnsureBg('tbBottom', TB_BOTTOM_BG_SRC, TB_BOTTOM_REGION, TB_BOTTOM_CLEARS);
  if (!bg) { _tbBottomVector(); return; }
  const pg = (typeof activePageSize === 'function') ? activePageSize() : { w: SHEET.W, h: SHEET.H };
  const a = s2px(0, TB_BOTTOM_REGION[1]), b = s2px(pg.w, TB_BOTTOM_REGION[3]);
  ctx.drawImage(bg, a.x, a.y, b.x - a.x, b.y - a.y);
  _tbDrawBorder();
  _tbBottomOverlay();
  if (_tbEditingKey && _tbEditField) _tbPositionEditor(_tbEditField);
}

function _tbBottomOverlay() {
  const si = sheetInfo, ed = _tbEditingKey;
  function ov(key, x, y, size, opt) { if (ed === key) return; _tbOv(si[key], x, y, size, opt); }
  // revision table rows
  (Array.isArray(si.revisions) ? si.revisions : []).slice(0, TB_BOTTOM_REV_ROWS).forEach(function (rv, r) {
    const y = TB_BOTTOM_REV_Y0 + r * TB_BOTTOM_REV_DY + TB_BOTTOM_REV_DY - 1.3;
    TB_BOTTOM_REV_COLS.forEach(function (c) {
      if (ed === 'rev:' + r + ':' + c.col) return;
      const val = c.col === 'date' ? _tbDateShort(rv[c.col]) : (rv[c.col] || '');
      _tbOv(val, c.x + 1, y, 3.0);
    });
  });
  TB_BOTTOM_FIELDS.forEach(function (f) {
    if (ed === f.key) return;
    if (f.key === 'status') {                       // centred + auto-fit
      if (!si.status) return;
      let sz = f.size; ctx.font = '600 ' + _tbFpx(sz) + 'px ' + TB_OV_FONT;
      const wPx = ctx.measureText(si.status).width, maxPx = sheetLen(f.w);
      if (wPx > maxPx) sz = sz * maxPx / wPx;
      _tbOv(si.status, f.x + f.w / 2, f.y, sz, { align: 'center', weight: '600' });
      return;
    }
    _tbOv(si[f.key], f.key === 'architectName' ? f.x + f.w / 2 : f.x, f.y, f.size,
      { align: f.align, weight: (f.key === 'drawingNo' || f.key === 'revision') ? '600' : '400' });
  });
}

// ============================================================
// STYLE: Sketch — PDF-BACKED (primary)
// ============================================================
// Blits the small office "Structural Sketch" title block (baked from the clean
// titleblock-templates/Structural Sketch (blank).pdf → sketch-bg.png) into its
// true position in the bottom-right of the A1 sheet, then overlays the editable
// values at the template's own field positions. The sketch PDF is A1 LANDSCAPE
// (no /Rotate) so PDF-mm == sheet-mm 1:1. Falls back to _tbSketchVector until
// the image loads. No page border (the sketch style has none).
const TB_SKETCH_BG_SRC = (typeof TB_SKETCH_BG_B64 !== 'undefined')
  ? TB_SKETCH_BG_B64 : 'titleblock-templates/sketch-bg.png';   // data-URL: see TB_RIGHT_BG_SRC note
const TB_SKETCH_REGION = [460, 519, 836, 577];    // sheet-mm the baked PNG covers (right border ~833mm)
const TB_SKETCH_BLK = [463, 521, 834, 575];       // sheet-mm block bbox (inline-edit hit region)
// Editable fields: {key, x(left), y(top), w, h, size, align}. y is the cell-top
// (Right-style convention); overlay baselines live in _tbSketchOverlay.
const TB_SKETCH_FIELDS = [
  { key: 'project',     x: 553, y: 527, w: 152, h: 10, size: 5.4, align: 'left' },
  { key: 'jobNo',       x: 711, y: 527, w: 58,  h: 10, size: 5.0, align: 'left' },
  { key: 'drawingNo',   x: 774, y: 527, w: 58,  h: 10, size: 5.0, align: 'left' },
  { key: 'description', x: 553, y: 543, w: 152, h: 30, size: 5.4, align: 'left' },
  { key: 'drawnBy',     x: 711, y: 543, w: 58,  h: 9,  size: 5.0, align: 'left' },
  { key: 'scaleText',   x: 774, y: 543, w: 58,  h: 9,  size: 5.0, align: 'left' },
  { key: 'date',        x: 711, y: 554, w: 58,  h: 18, size: 5.0, align: 'left' },
];

function _tbSketchFieldAt(u, v) {
  for (let i = 0; i < TB_SKETCH_FIELDS.length; i++) {
    const f = TB_SKETCH_FIELDS[i];
    if (u >= f.x && u <= f.x + f.w && v >= f.y && v <= f.y + f.h) return f;
  }
  return null;
}

function _tbSketch() {
  _tbEnsureFieldEvents();
  const bg = _tbEnsureBg('sketch', TB_SKETCH_BG_SRC, TB_SKETCH_REGION, []);
  if (!bg) { _tbSketchVector(); return; }          // fallback while loading / if missing
  const a = s2px(TB_SKETCH_REGION[0], TB_SKETCH_REGION[1]);
  const b = s2px(TB_SKETCH_REGION[2], TB_SKETCH_REGION[3]);
  ctx.drawImage(bg, a.x, a.y, b.x - a.x, b.y - a.y);
  _tbSketchOverlay();
  if (_tbEditingKey && _tbEditField) _tbPositionEditor(_tbEditField);   // track pan/zoom
}

function _tbSketchOverlay() {
  const si = sheetInfo, ed = _tbEditingKey;
  function ovFit(key, x, y, size, maxW) { if (ed === key) return; _tbOvFit(si[key], x, y, size, maxW); }
  ovFit('project',   556, 535, 5.4, 148);
  ovFit('jobNo',     715, 535, 5.0, 53);
  ovFit('drawingNo', 778, 535, 5.0, 50);
  ovFit('drawnBy',   715, 550, 5.0, 53);
  // Scale — value, or default to the active drawing scale.
  if (ed !== 'scaleText')
    _tbOvFit(si.scaleText || ('1:' + (typeof drawingScale !== 'undefined' ? drawingScale : '')), 778, 550, 5.0, 50);
  if (ed !== 'date') _tbOvFit(_tbDate(si.date), 715, 568, 5.0, 53);
  // ITEM — wrap up to 3 lines within the wide cell.
  if (ed !== 'description') _tbRightWrap(si.description, 556, 550, 148, 5.4, 6.2, 3);
}

// ============================================================
// Inline-edit registry (all PDF-backed styles)
// ============================================================
const _TB_EDIT = {
  // inStrip half-planes are flush with each strip's edge (TB_RIGHT_STRIP_L /
  // TB_BOTTOM_STRIP_T == the drawing-area boundary) so the click-to-edit handler
  // never claims a click that's actually in the drawing area. All editable fields
  // sit well inside the strip, so no grab-slop is needed.
  tbRight:  { inStrip: function (u, v) { return u >= TB_RIGHT_STRIP_L; }, fieldAt: _tbRightFieldAt,  fields: TB_RIGHT_FIELDS },
  tbBottom: { inStrip: function (u, v) { return v >= TB_BOTTOM_STRIP_T; }, fieldAt: _tbBottomFieldAt, fields: TB_BOTTOM_FIELDS },
  sketch:   { inStrip: function (u, v) { return u >= TB_SKETCH_BLK[0] && u <= TB_SKETCH_BLK[2] && v >= TB_SKETCH_BLK[1] && v <= TB_SKETCH_BLK[3]; },
              fieldAt: _tbSketchFieldAt, fields: TB_SKETCH_FIELDS },
};
