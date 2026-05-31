'use strict';

// ============================================================
// 96-stroke-font.js — single-stroke ("stick" / SHX-like) vector font
// ------------------------------------------------------------
// LAYER: band-9 (2D-mode) — Premium note / text-box lettering (see CONTRACT §3).
//   READS : (cross-file, all typeof-guarded) _sketchHash, _sketchRand
//             from js/24-draw-primitives.js  — mirrored locally if absent.
//   WRITES: globals NB_GLYPHS, NB_FONT and the nb* stroke-font functions.
//
// This is the heart of the premium text-box feature. Real structural lettering
// — both modern CAD (romans.shx) and 1970s hand lettering — is SINGLE-STROKE,
// not a filled TTF. The SAME font therefore renders crisp (professional CAD)
// and wobbled (1970s hand-drafted). No fills, ever.
//
// Coordinate model (CONTRACT §0 / §3):
//   y is UP, baseline at y = 0, CAP HEIGHT = 14 units. x grows right.
//   Each glyph: { adv:Number(advance width in units), strokes:[ polyline, ... ] }
//   Each polyline is [ [x,y], [x,y], ... ] drawn pen-down.
//   Glyph point (gx,gy) → screen: scale = capPx/14; X = penX + gx*scale;
//                                 Y = baselineY - gy*scale.
// ============================================================

// ---- helper: sample a (partial) ellipse arc into a smooth polyline --------
// cx,cy centre; rx,ry radii; a0,a1 angles in radians (0 = +x, CCW positive,
// matching "y up" so +y is up). `seg` = number of segments (points = seg+1).
// Round letters use 8..14 segments so they read smooth at print size — an O
// must look like a clean oval, not a diamond.
function _nbArc(cx, cy, rx, ry, a0, a1, seg) {
  const pts = [];
  const n = Math.max(2, seg | 0);
  for (let i = 0; i <= n; i++) {
    const t = a0 + (a1 - a0) * (i / n);
    pts.push([
      +(cx + rx * Math.cos(t)).toFixed(3),
      +(cy + ry * Math.sin(t)).toFixed(3),
    ]);
  }
  return pts;
}
// Full closed oval as one continuous stroke (start at right side, go CCW, close).
function _nbOval(cx, cy, rx, ry, seg) {
  const TAU = Math.PI * 2;
  const pts = _nbArc(cx, cy, rx, ry, 0, TAU, seg);
  // ensure perfectly closed
  pts[pts.length - 1] = [pts[0][0], pts[0][1]];
  return pts;
}

// ============================================================
// GLYPH SET — uppercase structural alphabet + digits + punctuation.
// Hand-tuned to the clean, slightly-condensed AS 1100 / isocp engineering hand.
// Stroke order follows how a hand naturally draws each letter so the draftsman
// jitter reads organic. Cap height 14, digits 14, advances ~10-13 for letters,
// 6-8 for I / punctuation.
// ============================================================
const NB_GLYPHS = {
  // ---- A–Z -------------------------------------------------
  'A': { adv: 12, strokes: [ [[0, 0], [6, 14], [12, 0]], [[2.4, 5.6], [9.6, 5.6]] ] },
  'B': { adv: 11, strokes: [
    [[0, 0], [0, 14]],
    [[0, 14], [7, 14], ..._nbArc(7, 10.5, 3.4, 3.5, Math.PI / 2, -Math.PI / 2, 7).slice(1), [0, 7]],
    [[0, 7], [7.5, 7], ..._nbArc(7.5, 3.5, 3.5, 3.5, Math.PI / 2, -Math.PI / 2, 7).slice(1), [0, 0]],
  ] },
  'C': { adv: 12, strokes: [
    _nbArc(6.2, 7, 6.2, 7, Math.PI * 0.30, Math.PI * 1.70, 13),
  ] },
  'D': { adv: 12, strokes: [
    [[0, 0], [0, 14]],
    [[0, 14], [5, 14], ..._nbArc(5, 7, 6.5, 7, Math.PI / 2, -Math.PI / 2, 10).slice(1), [0, 0]],
  ] },
  'E': { adv: 10, strokes: [ [[10, 14], [0, 14], [0, 0], [10, 0]], [[0, 7], [7.5, 7]] ] },
  'F': { adv: 10, strokes: [ [[10, 14], [0, 14], [0, 0]], [[0, 7], [7, 7]] ] },
  'G': { adv: 12, strokes: [
    [..._nbArc(6.2, 7, 6.2, 7, Math.PI * 0.30, Math.PI * 1.72, 13), ],
    [[12, 6.5], [12, 0.2], [6.4, 0.2]],
    [[7.0, 6.5], [12, 6.5]],
  ] },
  'H': { adv: 12, strokes: [ [[0, 0], [0, 14]], [[12, 0], [12, 14]], [[0, 7], [12, 7]] ] },
  'I': { adv: 6, strokes: [ [[3, 0], [3, 14]], [[0.5, 14], [5.5, 14]], [[0.5, 0], [5.5, 0]] ] },
  'J': { adv: 10, strokes: [
    [[8, 14], [8, 4], ..._nbArc(4, 4, 4, 4, 0, -Math.PI, 7).slice(1)],
  ] },
  'K': { adv: 11, strokes: [ [[0, 0], [0, 14]], [[11, 14], [0, 6.5]], [[4, 8.2], [11, 0]] ] },
  'L': { adv: 10, strokes: [ [[0, 14], [0, 0], [9.5, 0]] ] },
  'M': { adv: 14, strokes: [ [[0, 0], [0, 14], [7, 5], [14, 14], [14, 0]] ] },
  'N': { adv: 12, strokes: [ [[0, 0], [0, 14], [12, 0], [12, 14]] ] },
  'O': { adv: 13, strokes: [ _nbOval(6.5, 7, 6.5, 7, 14) ] },
  'P': { adv: 11, strokes: [
    [[0, 0], [0, 14], [7, 14], ..._nbArc(7, 10.7, 3.5, 3.3, Math.PI / 2, -Math.PI / 2, 8).slice(1), [0, 7.4]],
  ] },
  'Q': { adv: 13, strokes: [ _nbOval(6.5, 7, 6.5, 7, 14), [[8, 4], [13, -1]] ] },
  'R': { adv: 11, strokes: [
    [[0, 0], [0, 14], [7, 14], ..._nbArc(7, 10.7, 3.5, 3.3, Math.PI / 2, -Math.PI / 2, 8).slice(1), [0, 7.4]],
    [[5.5, 7.4], [11, 0]],
  ] },
  'S': { adv: 11, strokes: [
    // single-stroke ogee S, laid out by hand so the spine always connects:
    // top-right terminal → over the top → down to the centre → down the right
    // of the lower bowl → around the bottom → bottom-left terminal.
    [
      [9.7, 11.3], [9.0, 12.8], [7.2, 13.9], [5.2, 14.0],
      [3.1, 13.6], [1.5, 12.2], [1.3, 10.2], [2.6, 8.8],
      [4.6, 7.6], [6.5, 6.5], [8.4, 5.3], [9.6, 3.7],
      [9.4, 1.8], [7.7, 0.4], [5.0, 0.0], [2.4, 0.6], [0.8, 2.5],
    ],
  ] },
  'T': { adv: 11, strokes: [ [[0, 14], [11, 14]], [[5.5, 14], [5.5, 0]] ] },
  'U': { adv: 12, strokes: [
    [[0, 14], [0, 4.5], ..._nbArc(6, 4.5, 6, 4.5, Math.PI, Math.PI * 2, 9).slice(1), [12, 14]],
  ] },
  'V': { adv: 12, strokes: [ [[0, 14], [6, 0], [12, 14]] ] },
  'W': { adv: 16, strokes: [ [[0, 14], [4, 0], [8, 10], [12, 0], [16, 14]] ] },
  'X': { adv: 12, strokes: [ [[0, 0], [12, 14]], [[0, 14], [12, 0]] ] },
  'Y': { adv: 12, strokes: [ [[0, 14], [6, 6.5], [12, 14]], [[6, 6.5], [6, 0]] ] },
  'Z': { adv: 11, strokes: [ [[0, 14], [11, 14], [0, 0], [11, 0]], [[2.2, 7], [8.8, 7]] ] },

  // ---- 0–9 -------------------------------------------------
  '0': { adv: 12, strokes: [ _nbOval(6, 7, 5.6, 7, 14), [[2.6, 4.5], [9.4, 9.5]] ] },
  '1': { adv: 8, strokes: [ [[1.5, 11], [4.5, 14], [4.5, 0]], [[1.5, 0], [7.5, 0]] ] },
  '2': { adv: 11, strokes: [
    [
      ..._nbArc(5.2, 10.3, 5.0, 3.5, Math.PI * 1.05, -Math.PI * 0.30, 8),
      [0, 0], [10.5, 0],
    ],
  ] },
  '3': { adv: 11, strokes: [
    [
      ..._nbArc(5.0, 11.0, 4.8, 3.0, Math.PI * 1.05, Math.PI * 0.55, 7),
      ..._nbArc(4.6, 3.7, 5.2, 3.7, Math.PI * 0.50, -Math.PI * 0.95, 8).slice(1),
    ],
    [[4.7, 7.2], [6.6, 7.2]],
  ] },
  '4': { adv: 11, strokes: [ [[8, 0], [8, 14], [0, 4.5], [11, 4.5]] ] },
  '5': { adv: 11, strokes: [
    [[10, 14], [2, 14], [1.4, 7.6], [6, 8.2]],
    [..._nbArc(5.0, 4.5, 5.2, 4.5, Math.PI * 0.45, -Math.PI * 0.95, 9), [1.0, 1.6]],
  ] },
  '6': { adv: 11, strokes: [
    [
      ..._nbArc(5.6, 4.6, 5.4, 4.6, -Math.PI * 0.1, Math.PI * 1.95, 13),
      // upper tail sweeping out to the top-right
    ],
    [..._nbArc(5.6, 4.6, 5.4, 9.0, Math.PI * 0.62, Math.PI * 0.95, 5)],
  ] },
  '7': { adv: 11, strokes: [ [[0, 14], [11, 14], [4, 0]], [[2.5, 7], [8.5, 7]] ] },
  '8': { adv: 11, strokes: [
    _nbOval(5.5, 10.4, 4.0, 3.6, 12),
    _nbOval(5.5, 3.6, 5.0, 3.6, 13),
  ] },
  '9': { adv: 11, strokes: [
    // a 9 is a 6 rotated 180° about the glyph centre — loop at the TOP, tail
    // sweeping down the RIGHT to the baseline.
    [
      ..._nbArc(5.4, 9.4, 5.4, 4.6, Math.PI * 0.9, Math.PI * 2.95, 13),
    ],
    [..._nbArc(5.4, 9.4, 5.4, 9.0, Math.PI * 1.62, Math.PI * 1.95, 5)],
  ] },

  // ---- space ----------------------------------------------
  ' ': { adv: 8, strokes: [] },

  // ---- punctuation / symbols ------------------------------
  '.': { adv: 6, strokes: [ [[2.6, 0], [3.4, 0], [3.4, 0.9], [2.6, 0.9], [2.6, 0]] ] },
  ',': { adv: 6, strokes: [ [[3.6, 0.9], [2.6, 0.9], [2.6, 0], [3.6, 0], [3.6, 1.0], [2.2, -2.0]] ] },
  ':': { adv: 6, strokes: [
    [[2.6, 9.2], [3.4, 9.2], [3.4, 10.1], [2.6, 10.1], [2.6, 9.2]],
    [[2.6, 0], [3.4, 0], [3.4, 0.9], [2.6, 0.9], [2.6, 0]],
  ] },
  ';': { adv: 6, strokes: [
    [[2.6, 9.2], [3.4, 9.2], [3.4, 10.1], [2.6, 10.1], [2.6, 9.2]],
    [[3.6, 0.9], [2.6, 0.9], [2.6, 0], [3.6, 0], [3.6, 1.0], [2.2, -2.0]],
  ] },
  "'": { adv: 5, strokes: [ [[2.5, 14], [2.5, 10]] ] },
  '"': { adv: 7, strokes: [ [[2, 14], [2, 10]], [[5, 14], [5, 10]] ] },
  '-': { adv: 9, strokes: [ [[1.5, 7], [7.5, 7]] ] },
  '–': { adv: 11, strokes: [ [[1, 7], [10, 7]] ] }, // en dash –
  '/': { adv: 8, strokes: [ [[0.5, -1], [7.5, 15]] ] },
  '\\': { adv: 8, strokes: [ [[0.5, 15], [7.5, -1]] ] },
  '(': { adv: 6, strokes: [ _nbArc(6.0, 6.5, 5.0, 8.0, Math.PI * 0.72, Math.PI * 1.28, 8) ] },
  ')': { adv: 6, strokes: [ _nbArc(0.0, 6.5, 5.0, 8.0, Math.PI * 0.28, -Math.PI * 0.28, 8) ] },
  '[': { adv: 6, strokes: [ [[4.5, 15], [1.5, 15], [1.5, -1], [4.5, -1]] ] },
  ']': { adv: 6, strokes: [ [[1.5, 15], [4.5, 15], [4.5, -1], [1.5, -1]] ] },
  '&': { adv: 13, strokes: [
    [
      [12, 0], [4.6, 7.5],
      ..._nbArc(4.6, 11.2, 2.7, 2.8, -Math.PI * 0.5, Math.PI * 0.5, 6),
      ..._nbArc(5.2, 4.6, 4.8, 4.6, Math.PI * 0.5, Math.PI * 1.65, 9),
      [11.5, 5.5],
    ],
  ] },
  '%': { adv: 13, strokes: [
    [[1, -0.5], [12, 14.5]],
    _nbOval(3.0, 11.0, 2.4, 2.6, 9),
    _nbOval(10.0, 3.0, 2.4, 2.6, 9),
  ] },
  '#': { adv: 12, strokes: [
    [[3.5, -1], [2.3, 15]], [[9.5, -1], [8.3, 15]],
    [[0.6, 4.5], [11.4, 4.5]], [[1.2, 9.5], [12.0, 9.5]],
  ] },
  '@': { adv: 15, strokes: [
    _nbOval(7.0, 7.0, 6.8, 7.0, 14),
    _nbOval(7.0, 6.0, 2.8, 3.0, 10),
    [[9.8, 9.0], [9.8, 3.6], [12.2, 3.6]],
  ] },
  '!': { adv: 5, strokes: [ [[2.5, 14], [2.5, 3.5]], [[2.1, 0], [2.9, 0], [2.9, 0.9], [2.1, 0.9], [2.1, 0]] ] },
  '?': { adv: 10, strokes: [
    [
      ..._nbArc(4.7, 10.4, 4.4, 3.4, Math.PI * 1.05, -Math.PI * 0.30, 8),
      [4.7, 6.0], [4.7, 3.5],
    ],
    [[4.3, 0], [5.1, 0], [5.1, 0.9], [4.3, 0.9], [4.3, 0]],
  ] },
  '+': { adv: 12, strokes: [ [[6, 2], [6, 12]], [[1, 7], [11, 7]] ] },
  '=': { adv: 12, strokes: [ [[1.5, 9], [10.5, 9]], [[1.5, 5], [10.5, 5]] ] },
  '×': { adv: 11, strokes: [ [[2, 3.5], [9, 10.5]], [[2, 10.5], [9, 3.5]] ] }, // multiply ×
  '°': { adv: 7, strokes: [ _nbOval(3.4, 11.4, 2.4, 2.4, 10) ] },              // degree °
  '⌀': { adv: 13, strokes: [ _nbOval(6.5, 7, 6.0, 7, 14), [[1.5, 0], [11.5, 14]] ] }, // diameter ⌀
  '½': { adv: 15, strokes: [                                                   // one-half ½
    [[1, 11], [2.8, 12], [2.8, 4]],                 // numerator 1
    [[1.5, 14.5], [13.5, -0.5]],                    // solidus
    [                                               // denominator 2
      ..._nbArc(11.4, 4.0, 2.4, 1.8, Math.PI * 1.05, -Math.PI * 0.30, 7),
      [9.0, -1.0], [14.0, -1.0],
    ],
  ] },
};

// FROZEN font descriptor (CONTRACT §3): cap 14, space advance 8.
const NB_FONT = { cap: 14, space: 8, glyphs: NB_GLYPHS };

// ============================================================
// Deterministic hashing — mirror js/24-draw-primitives.js (_sketchHash /
// _sketchRand) so the SAME text always wobbles identically (no frame-to-frame
// shimmer). Use the global versions when present; otherwise mirror them so the
// font is self-contained and load-order independent.
// ============================================================
function _nbHash(x) {
  if (typeof _sketchHash === 'function') return _sketchHash(x);
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
}
function _nbRand(seed, i) {
  if (typeof _sketchRand === 'function') return _sketchRand(seed, i);
  return _nbHash(seed * 1315423911 + i * 2654435761) - 0.5;
}

// ============================================================
// Public API (CONTRACT §3 — FROZEN signatures)
// ============================================================

// → glyph object or null; maps a–z to A–Z (structural lettering is all-caps).
function nbGlyph(ch) {
  if (ch == null) return null;
  let g = NB_GLYPHS[ch];
  if (g) return g;
  // lowercase a–z → uppercase glyph
  if (ch >= 'a' && ch <= 'z') {
    g = NB_GLYPHS[ch.toUpperCase()];
    if (g) return g;
  }
  return null;
}

// → total advance in font units for `str` at the given letter spacing (units).
// Unknown printable chars advance by the font's space width so the web-font
// fallback in nbStrokeText has room. \n / \r contribute nothing.
function nbStrokeAdvanceUnits(str, letterSpacingUnits) {
  str = (str == null) ? '' : String(str);
  const ls = (typeof letterSpacingUnits === 'number') ? letterSpacingUnits : 0;
  let w = 0, n = 0;
  for (const ch of str) {
    if (ch === '\n' || ch === '\r') continue;
    const g = nbGlyph(ch);
    w += g ? g.adv : NB_FONT.space;
    n++;
  }
  if (n > 1) w += ls * (n - 1);
  return w;
}

// → width in mm. cap height in mm scales the 14-unit grid; spacing added in mm.
function nbStrokeTextWidthMm(str, capMm, letterSpacingMm) {
  const cap = (typeof capMm === 'number' && capMm > 0) ? capMm : 1;
  const lsMm = (typeof letterSpacingMm === 'number') ? letterSpacingMm : 0;
  // advance the glyph runs in units (no spacing), then add spacing in mm so the
  // mm spacing matches what nbStrokeText applies at the pixel level.
  str = (str == null) ? '' : String(str);
  let units = 0, n = 0;
  for (const ch of str) {
    if (ch === '\n' || ch === '\r') continue;
    const g = nbGlyph(ch);
    units += g ? g.adv : NB_FONT.space;
    n++;
  }
  let mm = units * (cap / NB_FONT.cap);
  if (n > 1) mm += lsMm * (n - 1);
  return mm;
}

// → width in px. cap height in px; spacing added in px.
function nbStrokeTextWidthPx(str, capPx, letterSpacingPx) {
  const cap = (typeof capPx === 'number' && capPx > 0) ? capPx : 1;
  const lsPx = (typeof letterSpacingPx === 'number') ? letterSpacingPx : 0;
  str = (str == null) ? '' : String(str);
  let units = 0, n = 0;
  for (const ch of str) {
    if (ch === '\n' || ch === '\r') continue;
    const g = nbGlyph(ch);
    units += g ? g.adv : NB_FONT.space;
    n++;
  }
  let px = units * (cap / NB_FONT.cap);
  if (n > 1) px += lsPx * (n - 1);
  return px;
}

// ------------------------------------------------------------
// Low-level wobble: stroke a polyline of screen-px points, optionally wobbled.
// Reused by §4 (notebox drawer) for the box outline + leaders in draftsman
// style. Deterministic given seed (no shimmer between frames). Subdivides each
// segment ~ every 6px and fades the perpendicular jitter to 0 at the polyline
// endpoints so joints stay crisp.
// ------------------------------------------------------------
function nbWobbleStroke(ctx, ptsPx, ampPx, seed) {
  if (!ctx || !ptsPx || ptsPx.length < 2) return;
  const amp = (typeof ampPx === 'number') ? ampPx : 0;
  const sd = Math.round((typeof seed === 'number') ? seed : 0);
  ctx.beginPath();
  if (amp <= 0) {
    // crisp polyline
    ctx.moveTo(ptsPx[0].x, ptsPx[0].y);
    for (let i = 1; i < ptsPx.length; i++) ctx.lineTo(ptsPx[i].x, ptsPx[i].y);
    ctx.stroke();
    return;
  }
  // total length so endpoint-fade is measured over the whole polyline
  let total = 0;
  const segLens = [];
  for (let i = 1; i < ptsPx.length; i++) {
    const L = Math.hypot(ptsPx[i].x - ptsPx[i - 1].x, ptsPx[i].y - ptsPx[i - 1].y);
    segLens.push(L); total += L;
  }
  if (total < 1) {
    ctx.moveTo(ptsPx[0].x, ptsPx[0].y);
    for (let i = 1; i < ptsPx.length; i++) ctx.lineTo(ptsPx[i].x, ptsPx[i].y);
    ctx.stroke();
    return;
  }
  const FADE = Math.min(total / 2, 6); // fade jitter to 0 within 6px of each end
  let run = 0, k = 0; // run = cumulative distance along polyline, k = hash index
  ctx.moveTo(ptsPx[0].x, ptsPx[0].y);
  for (let i = 1; i < ptsPx.length; i++) {
    const a = ptsPx[i - 1], b = ptsPx[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const L = segLens[i - 1];
    if (L < 1e-6) { ctx.lineTo(b.x, b.y); continue; }
    const ux = dx / L, uy = dy / L;     // along
    const nx = -uy, ny = ux;            // perpendicular (left)
    const sub = Math.max(1, Math.ceil(L / 6)); // subdivide ~ every 6px
    for (let s = 1; s <= sub; s++) {
      const t = s / sub;
      const px0 = a.x + dx * t, py0 = a.y + dy * t;
      const distAlong = run + L * t;
      // fade near BOTH polyline ends
      const fade = Math.min(1, distAlong / FADE, (total - distAlong) / FADE);
      const j = _nbRand(sd, ++k) * amp * Math.max(0, fade);
      ctx.lineTo(px0 + nx * j, py0 + ny * j);
    }
    run += L;
  }
  ctx.stroke();
}

// ------------------------------------------------------------
// Draw `str` with baseline-LEFT origin at (xPx, yPx), cap height = capPx.
// opts: { weightPx, color, letterSpacingPx, wobbleAmpPx, jitter, seed, align }
//   align 'left'|'center'|'right' positions the string horizontally rel. xPx.
//   wobbleAmpPx>0 → hand-ink wobble; jitter 0..1 → per-glyph baseline/rotation/
//   scale jitter (subtle — a steady hand, not a shaky one).
// Returns the total advance width in px. Never throws; unknown printable chars
// fall back to the canvas web font at the same cap height.
// ------------------------------------------------------------
function nbStrokeText(ctx, str, xPx, yPx, capPx, opts) {
  str = (str == null) ? '' : String(str);
  opts = opts || {};
  const cap = (typeof capPx === 'number' && capPx > 0) ? capPx : 1;
  const scale = cap / NB_FONT.cap;
  const weightPx = (typeof opts.weightPx === 'number') ? opts.weightPx : 1;
  const color = opts.color || '#000';
  const lsPx = (typeof opts.letterSpacingPx === 'number') ? opts.letterSpacingPx : 0;
  const amp = (typeof opts.wobbleAmpPx === 'number') ? opts.wobbleAmpPx : 0;
  const jit = (typeof opts.jitter === 'number') ? Math.max(0, opts.jitter) : 0;
  const seed0 = Math.round((typeof opts.seed === 'number') ? opts.seed : 0);
  const align = opts.align || 'left';
  // Forward slant (inclined lettering): shear x by y*tan(slant) — the taller a
  // glyph point, the further right it leans. Advance widths are unaffected.
  const tanS = (typeof opts.slant === 'number' && opts.slant) ? Math.tan(opts.slant * Math.PI / 180) : 0;

  const totalPx = nbStrokeTextWidthPx(str, cap, lsPx);
  let originX = xPx;
  if (align === 'center') originX = xPx - totalPx / 2;
  else if (align === 'right') originX = xPx - totalPx;

  if (!ctx) return totalPx;

  const prevCap = ctx.lineCap, prevJoin = ctx.lineJoin, prevW = ctx.lineWidth;
  const prevStroke = ctx.strokeStyle, prevFill = ctx.fillStyle;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max((typeof NB !== 'undefined' && NB && NB.MIN_PX) || 0.75, weightPx);
  ctx.strokeStyle = color;

  let penX = originX;
  let gi = 0; // glyph index across the whole string — feeds deterministic jitter
  for (const ch of str) {
    if (ch === '\n' || ch === '\r') continue;
    const g = nbGlyph(ch);
    if (!g) {
      // ---- web-font fallback for any printable char with no stroke glyph ----
      // (never throw). Draw at the same cap height; advance by a space width.
      if (ch !== ' ') {
        const prevFont = ctx.font, prevAlign = ctx.textAlign, prevBase = ctx.textBaseline;
        ctx.font = cap + "px IBM Plex Sans";
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = color;
        try { ctx.fillText(ch, penX, yPx); } catch (e) { /* never throw */ }
        ctx.font = prevFont; ctx.textAlign = prevAlign; ctx.textBaseline = prevBase;
      }
      penX += NB_FONT.space * scale + lsPx;
      gi++;
      continue;
    }

    // ---- per-glyph jitter (deterministic from glyph index) ----------------
    let dyJ = 0, rot = 0, sc = 1, cosR = 1, sinR = 0;
    if (jit > 0) {
      dyJ = _nbRand(seed0 + 11, gi * 3 + 1) * 2 * (jit * 0.10 * cap); // ±jit*0.10*cap
      rot = _nbRand(seed0 + 23, gi * 3 + 2) * 2 * (jit * 1.5 * Math.PI / 180); // ±jit*1.5°
      sc = 1 + _nbRand(seed0 + 37, gi * 3 + 3) * 2 * (jit * 0.04); // 1 ± jit*0.04
      cosR = Math.cos(rot); sinR = Math.sin(rot);
    }
    // glyph centre (in px, pre-jitter) for rotation pivot
    const cx = penX + (g.adv * 0.5) * scale;
    const cy = yPx - (NB_FONT.cap * 0.5) * scale;

    // map a glyph point (gx,gy) → screen px, applying scale/rotate/jitter
    const mapPt = (gx, gy) => {
      let X = penX + (gx + gy * tanS) * scale * sc;
      let Y = yPx - gy * scale * sc + dyJ;
      if (jit > 0) {
        const rx = X - cx, ry = Y - cy;
        X = cx + rx * cosR - ry * sinR;
        Y = cy + rx * sinR + ry * cosR;
      }
      return { x: X, y: Y };
    };

    const glyphSeed = seed0 + (ch.codePointAt(0) || 0) * 131 + gi * 977;
    for (let si = 0; si < g.strokes.length; si++) {
      const poly = g.strokes[si];
      if (!poly || poly.length < 1) continue;
      if (poly.length === 1) {
        // single point → tiny dot (period etc. are closed polylines, but guard)
        const p = mapPt(poly[0][0], poly[0][1]);
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.4, weightPx / 2), 0, Math.PI * 2); ctx.fill();
        continue;
      }
      const ptsPx = poly.map(pt => mapPt(pt[0], pt[1]));
      if (amp > 0) {
        nbWobbleStroke(ctx, ptsPx, amp, glyphSeed + si * 17);
      } else {
        ctx.beginPath();
        ctx.moveTo(ptsPx[0].x, ptsPx[0].y);
        for (let i = 1; i < ptsPx.length; i++) ctx.lineTo(ptsPx[i].x, ptsPx[i].y);
        ctx.stroke();
      }
    }

    penX += g.adv * scale + lsPx;
    gi++;
  }

  ctx.lineCap = prevCap; ctx.lineJoin = prevJoin; ctx.lineWidth = prevW;
  ctx.strokeStyle = prevStroke; ctx.fillStyle = prevFill;
  return totalPx;
}

// ------------------------------------------------------------
// Self-check: confirm the alphabet is complete and no glyph is empty.
// → { glyphCount, missing:[chars expected but absent], empty:[chars with 0 strokes] }
// space is legitimately empty, so it is excluded from `empty`.
// ------------------------------------------------------------
function nbStrokeFontSelfCheck() {
  const expected = (
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
    '0123456789' +
    ' ' +
    '.,:;\'"-–/\\()[]&%#@!?+=×°⌀½'
  ).split('');
  const missing = [];
  const empty = [];
  for (const ch of expected) {
    const g = NB_GLYPHS[ch];
    if (!g) { missing.push(ch); continue; }
    if (ch === ' ') continue; // space is meant to be empty
    if (!g.strokes || g.strokes.length === 0) empty.push(ch);
  }
  return { glyphCount: Object.keys(NB_GLYPHS).length, missing, empty };
}
