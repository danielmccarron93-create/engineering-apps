'use strict';

// LAYER: band-9 (2D-mode / V25 paper-space). Premium note / text-box entity.
//   READS  (globals): real2px, px2real, ppm, ctx, v25EntColour, v25EntOpacity,
//                      rFillPoly, LW, viewport, drawingScale, nbStyle's font deps
//                      from js/96 (nbStrokeText, nbStrokeTextWidthMm, nbWobbleStroke,
//                      NB_FONT) — all typeof-guarded.
//   WRITES (globals): NB, NB_FONT_CAP, NB_STYLES, nbStyle, nbLayout, nbBoxRectReal,
//                      nbAttachPoint, drawNoteBox2D, nbBounds, nbHandles, nbMove,
//                      nbAddArrow, nbRemoveArrowNear, nbDxfEmit.
//
// The `noteBox` entity is the premium replacement for the legacy prompt()-based
// text/note/mtext flow. It is a V25 (`_v25:true`) paper-space entity: an
// auto-wrapping text box (optional outline), zero or more leader arrows, and
// three switchable lettering styles (professional / draftsman / plex). The
// single-stroke vector font lives in js/96 and is shared by the two showpiece
// styles. See PlannedBuilds/premium-textbox/CONTRACT.md (FROZEN).
//
// This file owns: geometry (layout / bounds / attach points / grips / moves),
// the canvas drawer registered in v25DrawEnt, and DXF emission. Placement, the
// inline editor, the options bar and defaults persistence live in js/98.

// ============================================================
// §2 — Named constants + style registry (FROZEN)
// ============================================================

const NB = {
  CAP_MM: 2.5,            // default cap height if neither ent.sz nor style.sizeMm
  LINEH: 1.30,            // line height = cap * LINEH
  PAD_FACTOR: 0.45, PAD_MIN_MM: 1.0,   // inner padding = max(PAD_MIN, cap*PAD_FACTOR)
  AUTO_MAXLINE_MM: 55,    // auto-size: don't make lines longer than this before wrapping
  AUTO_MINW_MM: 26,       // auto-size: minimum content width
  AUTO_ASPECT: 6.0,       // auto-size target width:height ratio for multi-line blocks
  MINW_MM: 12,            // hard minimum content width when manually resized
  SHOULDER_MM: 6,         // default auto-dogleg orthogonal shoulder length (paper-mm)
  PLACEHOLDER_W_MM: 36,   // empty/preview box content width (~4 words; box is 2 lines tall)
  ARROW_LEN_MM: 3.0, ARROW_HW_MM: 0.7,  // slender filled arrowhead
  ARROW_DOT_MM: 0.9, ARROW_OPEN_DEG: 20,
  WOBBLE_MM: 0.28, WOBBLE_MAX_PX: 2.0,  // hand-ink amplitude for draftsman
  BOX_LW_MM: 0.18,        // default box outline weight (thin)
  LEADER_LW_MM: 0.38,     // leader weight (slightly thicker than the box outline)
  MIN_PX: 0.75,           // floor for any rendered line width in px
  HIT_TOL_PX: 8,          // pixel tolerance for "near an arrow tip"
};

// cap = stroke-font cap height in font units; ALL glyph y-coords live in [0..14], baseline y=0, y UP.
const NB_FONT_CAP = 14;

const NB_STYLES = {
  professional: { font:'stroke', wobble:0,    jitter:0,   sizeMm:2.5, textWeightMm:0.18,
                  boxLwMm:0.18, leaderLwMm:0.38, letterSpacingMm:0.25, upperDefault:true,
                  label:'Professional' },
  draftsman:    { font:'stroke', wobble:0.28, jitter:0.55, sizeMm:2.8, textWeightMm:0.24,
                  boxLwMm:0.22, leaderLwMm:0.40, letterSpacingMm:0.40, upperDefault:true,
                  label:'Draftsman (70s hand)' },
  // Refined inclined single-stroke hand — the classic engineering/bridge drafting
  // lettering (forward slant, even weight, only a whisper of hand variation).
  engineer:     { font:'stroke', slant:18, wobble:0.10, jitter:0.20, sizeMm:2.6, textWeightMm:0.20,
                  boxLwMm:0.18, leaderLwMm:0.38, letterSpacingMm:0.34, upperDefault:true,
                  label:'Engineer (inclined)' },
  plex:         { font:'web', family:"'IBM Plex Sans', system-ui, sans-serif", weight:500,
                  wobble:0, jitter:0, sizeMm:2.5, textWeightMm:0, boxLwMm:0.18, leaderLwMm:0.38,
                  letterSpacingMm:0, upperDefault:false, label:'Plex (modern)' },
  // Routed Gothic (Darren Embry, SIL OFL v1.1) — an outline TTF traced from a
  // Leroy lettering stencil: the genuine drafting-template lineage. Bundled in
  // /fonts, declared via @font-face (css/styles.css) and explicitly loaded by
  // nbPreloadWebFonts (js/98). Rendered as a FILLED web face (the `web` path,
  // like plex), NOT the single-stroke font. letterSpacingMm:0 because the web
  // draw path uses native glyph spacing — keeping it 0 makes the measured box
  // hug the drawn text. Three cuts map to the three families declared in CSS:
  routed:     { font:'web', family:"'Routed Gothic', monospace", weight:400,
                wobble:0, jitter:0, sizeMm:2.5, textWeightMm:0, boxLwMm:0.18, leaderLwMm:0.38,
                letterSpacingMm:0, upperDefault:true, label:'Routed Gothic' },
  routedWide: { font:'web', family:"'Routed Gothic Wide', monospace", weight:400,
                wobble:0, jitter:0, sizeMm:2.5, textWeightMm:0, boxLwMm:0.18, leaderLwMm:0.38,
                letterSpacingMm:0, upperDefault:true, label:'Routed Gothic Wide' },
  routedHalf: { font:'web', family:"'Routed Gothic Half Italic', monospace", weight:400,
                wobble:0, jitter:0, sizeMm:2.5, textWeightMm:0, boxLwMm:0.18, leaderLwMm:0.38,
                letterSpacingMm:0, upperDefault:true, label:'Routed Gothic Lean' },
};
function nbStyle(name){ return NB_STYLES[name] || NB_STYLES.professional; }

// ============================================================
// §4 — Layout caching (module-level WeakMap, NEVER on the entity)
// ============================================================
// Keyed by the entity object so saved JSON stays clean. The cached value is
// invalidated by comparing a cheap signature of the inputs that affect layout.
let _nbLayoutCache = new WeakMap();

// nbClearLayoutCache() — drop every cached layout. Called when a web font
// (Routed Gothic) finishes loading async: notes measured/wrapped against the
// fallback face must re-flow against the real glyph metrics. Cheap — layouts
// recompute lazily on next nbLayout(ent).
function nbClearLayoutCache() { _nbLayoutCache = new WeakMap(); }

// Measure a string's width in mm for the active style. Stroke styles defer to
// js/96; the web (plex) style measures via the canvas at a 100px scale.
function _nbMeasureMm(s, capMm, style) {
  if (style.font === 'stroke') {
    if (typeof nbStrokeTextWidthMm === 'function') {
      return nbStrokeTextWidthMm(s, capMm, style.letterSpacingMm);
    }
    // js/96 not loaded yet — approximate so layout still produces a sane box.
    return (s ? s.length : 0) * capMm * 0.62 +
           Math.max(0, (s ? s.length : 0) - 1) * (style.letterSpacingMm || 0);
  }
  return _nbWebWidthMm(s, capMm, style);
}

// webWidthMm(s,cap,style): canvas measureText @100px scaled to cap, plus the
// style's per-gap letter spacing in mm (matches the canvas drawer, which sets
// letterSpacing via fillText spacing implicitly through the same spec).
function _nbWebWidthMm(s, capMm, style) {
  const str = s || '';
  let w = 0;
  if (typeof ctx !== 'undefined' && ctx && typeof ctx.measureText === 'function') {
    const fam = style.family || "'IBM Plex Sans', system-ui, sans-serif";
    ctx.save();
    ctx.font = '100px ' + fam;
    w = ctx.measureText(str).width;
    ctx.restore();
  } else {
    w = str.length * 55; // crude fallback if no canvas context
  }
  return w * capMm / 100 + Math.max(0, str.length - 1) * (style.letterSpacingMm || 0);
}

// Greedy word-wrap a single paragraph to a content width `Wc` (mm). A word wider
// than Wc overflows on its own line (no mid-word break). Returns [{text,wMm}].
function _nbWrapParagraph(para, Wc, capMm, style) {
  const out = [];
  const words = para.split(' ');
  let cur = '';
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const trial = cur === '' ? word : cur + ' ' + word;
    const trialW = _nbMeasureMm(trial, capMm, style);
    if (cur !== '' && trialW > Wc) {
      out.push({ text: cur, wMm: _nbMeasureMm(cur, capMm, style) });
      cur = word;
    } else {
      cur = trial;
    }
  }
  out.push({ text: cur, wMm: _nbMeasureMm(cur, capMm, style) });
  return out;
}

// nbLayout(ent) — pure (apart from writing ent.boxW back when autoSize, which is
// the contract's intended derived-width behaviour). Cached by signature.
function nbLayout(ent) {
  const style = nbStyle(ent.style);
  const cap = ent.sz || style.sizeMm || NB.CAP_MM;
  const sig = [
    (ent.text || ''), ent.style || '', cap,
    (ent.autoSize ? 'A' : 'M'), (ent.autoSize ? '' : (ent.boxW || '')),
    ent.textCase || '',
  ].join('|');
  const cached = _nbLayoutCache.get(ent);
  if (cached && cached._sig === sig) return cached;

  const lineH = cap * NB.LINEH;
  const pad = Math.max(NB.PAD_MIN_MM, cap * NB.PAD_FACTOR);
  const raw = (ent.text || '');
  const text = (ent.textCase !== 'normal') ? raw.toUpperCase() : raw;
  const paras = text.split('\n');

  // Empty (un-typed) auto-size note → a placeholder sized for ~2 lines of 4 words,
  // so the placement preview and the just-created box start at a sensible size.
  // Once any text is typed the normal fit-to-text layout below takes over.
  if (ent.autoSize && text.trim() === '') {
    const ph = {
      _sig: sig, boxW: NB.PLACEHOLDER_W_MM + 2 * pad, boxH: 2 * lineH + 2 * pad,
      lines: [{ text: '', wMm: 0 }, { text: '', wMm: 0 }],
      capMm: cap, lineHMm: lineH, padMm: pad, Wc: NB.PLACEHOLDER_W_MM,
    };
    ent.boxW = ph.boxW;
    _nbLayoutCache.set(ent, ph);
    return ph;
  }

  let Wc, lines;
  if (ent.autoSize) {
    let natural = 0;
    for (let i = 0; i < paras.length; i++) {
      const w = _nbMeasureMm(paras[i], cap, style);
      if (w > natural) natural = w;
    }
    if (natural <= NB.AUTO_MAXLINE_MM) {
      // Short enough — no extra wrapping. Hug the natural width but keep a
      // sensible minimum so an empty/tiny note isn't a sliver.
      Wc = Math.max(natural, NB.MINW_MM);
    } else {
      // Long single run — wrap toward a pleasing width:height aspect.
      let sumWidth = 0;
      for (let i = 0; i < paras.length; i++) sumWidth += _nbMeasureMm(paras[i], cap, style);
      Wc = Math.sqrt(Math.max(0, sumWidth * lineH * NB.AUTO_ASPECT));
      Wc = Math.max(NB.AUTO_MINW_MM, Math.min(NB.AUTO_MAXLINE_MM, Wc));
    }
    lines = [];
    for (let i = 0; i < paras.length; i++) {
      const wrapped = _nbWrapParagraph(paras[i], Wc, cap, style);
      for (let j = 0; j < wrapped.length; j++) lines.push(wrapped[j]);
    }
    // Hug the text: final content width = widest measured line.
    let maxW = 0;
    for (let i = 0; i < lines.length; i++) if (lines[i].wMm > maxW) maxW = lines[i].wMm;
    Wc = Math.max(maxW, 0);
    ent.boxW = Wc + 2 * pad;   // write derived width back (autoSize only)
  } else {
    const natural0 = (function () {
      let n = 0;
      for (let i = 0; i < paras.length; i++) {
        const w = _nbMeasureMm(paras[i], cap, style);
        if (w > n) n = w;
      }
      return n;
    })();
    Wc = Math.max(NB.MINW_MM, (ent.boxW || (natural0 + 2 * pad)) - 2 * pad);
    lines = [];
    for (let i = 0; i < paras.length; i++) {
      const wrapped = _nbWrapParagraph(paras[i], Wc, cap, style);
      for (let j = 0; j < wrapped.length; j++) lines.push(wrapped[j]);
    }
  }

  const boxH = lines.length * lineH + 2 * pad;
  const boxW = ent.autoSize ? (Wc + 2 * pad) : (ent.boxW || (Wc + 2 * pad));

  const result = {
    _sig: sig,
    boxW: boxW,
    boxH: boxH,
    lines: lines,
    capMm: cap,
    lineHMm: lineH,
    padMm: pad,
    Wc: Wc,
  };
  _nbLayoutCache.set(ent, result);
  return result;
}

// nbBoxRectReal(ent) → { uL, uR, vT, vB } using nbLayout. Top-left anchored:
// top edge = ent.v, left edge = ent.u; box spans v ∈ [v-boxH, v].
function nbBoxRectReal(ent) {
  const lay = nbLayout(ent);
  const ds = _nbDs();   // paper-mm box dims → real-world (u,v) extent
  return {
    uL: ent.u,
    uR: ent.u + lay.boxW * ds,
    vT: ent.v,
    vB: ent.v - lay.boxH * ds,
  };
}

// nbAttachPoint(ent, tip) → {u,v} where a leader meets the box edge facing `tip`.
// Ray from box centre C toward tip; intersect with the box rectangle. If the tip
// coincides with the centre, return top-centre.
function nbAttachPoint(ent, tip) {
  const r = nbBoxRectReal(ent);
  const cu = (r.uL + r.uR) / 2;
  const cv = (r.vB + r.vT) / 2;
  const hw = (r.uR - r.uL) / 2;
  const hh = (r.vT - r.vB) / 2;
  const du = tip.u - cu;
  const dv = tip.v - cv;
  if ((du === 0 && dv === 0) || (hw <= 0 && hh <= 0)) {
    return { u: cu, v: r.vT };   // degenerate → top-centre
  }
  // Scale the ray so it just touches the nearest rectangle edge.
  let t = Infinity;
  if (du !== 0 && hw > 0) t = Math.min(t, hw / Math.abs(du));
  if (dv !== 0 && hh > 0) t = Math.min(t, hh / Math.abs(dv));
  if (!isFinite(t)) return { u: cu, v: r.vT };
  return { u: cu + du * t, v: cv + dv * t };
}

// nbFacingEdge(ent, target) → 'top'|'bottom'|'left'|'right': the box edge the
// target lies most beyond (v is up). Used to anchor leaders orthogonally.
function nbFacingEdge(ent, target) {
  const r = nbBoxRectReal(ent);
  const cu = (r.uL + r.uR) / 2, cv = (r.vT + r.vB) / 2;
  const hw = (r.uR - r.uL) / 2, hh = (r.vT - r.vB) / 2;
  const du = target.u - cu, dv = target.v - cv;
  if (hw <= 0 && hh <= 0) return 'bottom';
  // Bigger normalised reach wins. (v up: below centre → bottom.)
  if (Math.abs(dv) * hw >= Math.abs(du) * hh) return dv < 0 ? 'bottom' : 'top';
  return du < 0 ? 'left' : 'right';
}

// nbEdgeAnchor(ent, edge, target) → {u,v}: the orthogonal foot of `target` on the
// given box edge, clamped to the edge extent — so the box-side leader segment
// leaves the edge perpendicular.
function nbEdgeAnchor(ent, edge, target) {
  const r = nbBoxRectReal(ent);
  const clampU = (u) => Math.max(r.uL, Math.min(r.uR, u));
  const clampV = (v) => Math.max(r.vB, Math.min(r.vT, v));
  if (edge === 'top')   return { u: clampU(target.u), v: r.vT };
  if (edge === 'left')  return { u: r.uL, v: clampV(target.v) };
  if (edge === 'right') return { u: r.uR, v: clampV(target.v) };
  return { u: clampU(target.u), v: r.vB };   // bottom (default)
}

// nbLeaderPoints(ent, arrow) → ordered real-world points [anchor, ...elbows, tip].
// The anchor is the orthogonal foot of the first elbow (or the tip, when there are
// no elbows) on the facing box edge, so the box-side segment leaves perpendicular.
// nbAutoShoulderForRect(rect, tip, ds) → { edge, mid, node }: the default
// auto-dogleg shoulder for a box rectangle. `mid` is the midpoint of the box edge
// facing the tip; `node` is a SHORT orthogonal stub out from that midpoint (length
// NB.SHOULDER_MM paper-mm, shortened for very close tips). The leg then angles
// node→tip. This is the Bluebeam/Revit-style leader. Recomputed each render, so it
// stays centred + fixed-length as the box auto-sizes while you type.
function nbAutoShoulderForRect(rect, tip, ds) {
  const cu = (rect.uL + rect.uR) / 2, cv = (rect.vT + rect.vB) / 2;
  const hw = (rect.uR - rect.uL) / 2, hh = (rect.vT - rect.vB) / 2;
  const du = tip.u - cu, dv = tip.v - cv;
  let edge, mid, nu, nv;
  if (hw <= 0 && hh <= 0) edge = 'bottom';
  else if (Math.abs(dv) * hw >= Math.abs(du) * hh) edge = (dv < 0) ? 'bottom' : 'top';
  else edge = (du < 0) ? 'left' : 'right';
  if (edge === 'bottom')      { mid = { u: cu, v: rect.vB }; nu = 0;  nv = -1; }
  else if (edge === 'top')    { mid = { u: cu, v: rect.vT }; nu = 0;  nv = 1;  }
  else if (edge === 'left')   { mid = { u: rect.uL, v: cv }; nu = -1; nv = 0;  }
  else                        { mid = { u: rect.uR, v: cv }; nu = 1;  nv = 0;  }
  const distReal = Math.hypot(tip.u - mid.u, tip.v - mid.v);
  const len = Math.min((NB.SHOULDER_MM || 6) * ds, 0.45 * distReal);
  return { edge: edge, mid: mid, node: { u: mid.u + nu * len, v: mid.v + nv * len } };
}
function nbAutoShoulder(ent, tip) { return nbAutoShoulderForRect(nbBoxRectReal(ent), tip, _nbDs()); }

// nbLeaderPoints(ent, arrow) → ordered real-world points [anchor, ...elbows, tip].
// Default (no manual elbows): an auto-dogleg [edge-midpoint, short shoulder, tip].
// With manual elbows: anchor is the orthogonal foot of the first elbow on the
// facing box edge, then the stored elbow nodes, then the tip.
function nbLeaderPoints(ent, arrow) {
  const tip = { u: arrow.u, v: arrow.v };
  const elbows = (arrow.elbows && arrow.elbows.length) ? arrow.elbows : null;
  if (!elbows) {
    const sh = nbAutoShoulder(ent, tip);
    return [sh.mid, sh.node, tip];
  }
  const edge = nbFacingEdge(ent, elbows[0]);
  const anchor = nbEdgeAnchor(ent, edge, elbows[0]);
  const pts = [anchor];
  for (let i = 0; i < elbows.length; i++) pts.push({ u: elbows[i].u, v: elbows[i].v });
  pts.push(tip);
  return pts;
}

// ============================================================
// §4 — drawNoteBox2D — the drawer registered in v25DrawEnt
// ============================================================

// seedFrom(n) — deterministic integer seed for wobble (no shimmer between frames).
function _nbSeedFrom(n) { return Math.round(n); }

// Paper-space scale helpers. A noteBox is sized in PAPER (sheet) mm: text height,
// box, padding, lineweights and arrowheads are fixed paper sizes, independent of
// the 1:N drawing scale — only its model anchor (u,v) lives in real-world mm.
//   _nbZoom() = px per sheet-mm. This matches s2px / real2px positioning in every
//               context (screen, raster PDF, vector PDF), so box sizes stay
//               consistent with the model-anchored positions. (ppm() = zoom/scale
//               is wrong here — it would render the note 1/scale too small.)
//   _nbDs()   = drawingScale → converts paper-mm box dimensions into the
//               real-world (u,v) extent used by bounds / grips / attach / DXF.
function _nbZoom() { return (typeof viewport !== 'undefined' && viewport && typeof viewport.zoom === 'number') ? viewport.zoom : 1; }
function _nbDs() { return (typeof drawingScale !== 'undefined' && drawingScale) ? drawingScale : 1; }

// Filled / open / dotted arrowhead at the leader tip T, pointing from A→T.
function _nbDrawArrowHead(blk, A, T, kind, col, pm) {
  const dx = T.x - A.x, dy = T.y - A.y;
  const len = Math.hypot(dx, dy);
  if (kind === 'dot') {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(T.x, T.y, Math.max(NB.MIN_PX, NB.ARROW_DOT_MM * pm), 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (len < 1e-6) return;   // no direction → nothing to draw for arrow/open
  const ux = dx / len, uy = dy / len;   // unit A→T
  const nx = -uy, ny = ux;              // perpendicular
  if (kind === 'open') {
    // Two short strokes from T back along ±ARROW_OPEN_DEG.
    const L = NB.ARROW_LEN_MM * pm;
    const a = NB.ARROW_OPEN_DEG * Math.PI / 180;
    const cosA = Math.cos(a), sinA = Math.sin(a);
    // Rotate the reverse unit vector (-u) by ±a.
    const rx = -ux, ry = -uy;
    const p1x = T.x + (rx * cosA - ry * sinA) * L;
    const p1y = T.y + (rx * sinA + ry * cosA) * L;
    const p2x = T.x + (rx * cosA + ry * sinA) * L;
    const p2y = T.y + (-rx * sinA + ry * cosA) * L;
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(NB.MIN_PX, NB.LEADER_LW_MM * pm);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(T.x, T.y); ctx.lineTo(p1x, p1y);
    ctx.moveTo(T.x, T.y); ctx.lineTo(p2x, p2y);
    ctx.stroke();
    return;
  }
  // 'arrow' (default): slender filled triangle, tip at T, base back along -u.
  const L = NB.ARROW_LEN_MM * pm;
  const HW = NB.ARROW_HW_MM * pm;
  const bx = T.x - ux * L, by = T.y - uy * L;   // base centre
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(T.x, T.y);
  ctx.lineTo(bx + nx * HW, by + ny * HW);
  ctx.lineTo(bx - nx * HW, by - ny * HW);
  ctx.closePath();
  ctx.fill();
}

// drawNoteBox2D(blk, ent, cs) — outline + leaders + text. Mirrors the v25 drawer
// idiom (drawTxtBox2D): resolve colour, wrap globalAlpha with the entity opacity,
// restore in finally. Skips the text while ent._editing (the inline editor owns it).
function drawNoteBox2D(blk, ent, cs) {
  const col = v25EntColour(ent, cs);
  const prevA = ctx.globalAlpha;
  ctx.globalAlpha = prevA * v25EntOpacity(ent);
  try {
    // px per sheet-mm — the noteBox is paper-space sized (NOT ppm(), which would
    // shrink it by 1/drawingScale). Positions still come from real2px (model space).
    const pm = _nbZoom();
    const st = nbStyle(ent.style);
    const lay = nbLayout(ent);
    const TL = real2px(blk, ent.u, ent.v);
    const wPx = lay.boxW * pm;
    const hPx = lay.boxH * pm;
    const lwPx = (mm) => Math.max(NB.MIN_PX, mm * pm);
    const ampPx = st.wobble ? Math.min(NB.WOBBLE_MAX_PX, st.wobble * pm) : 0;
    const canWobble = ampPx > 0 && typeof nbWobbleStroke === 'function';

    // 1) outline (optional)
    if (ent.boxed) {
      ctx.strokeStyle = col;
      ctx.lineWidth = lwPx(st.boxLwMm);
      ctx.lineJoin = 'round';
      const corners = [
        { x: TL.x,       y: TL.y },
        { x: TL.x + wPx, y: TL.y },
        { x: TL.x + wPx, y: TL.y + hPx },
        { x: TL.x,       y: TL.y + hPx },
        { x: TL.x,       y: TL.y },   // closed
      ];
      if (canWobble) {
        nbWobbleStroke(ctx, corners, ampPx, _nbSeedFrom(ent.id));
      } else {
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
        ctx.stroke();
      }
    }

    // 2) leaders + arrowheads (draw BEFORE text so text sits on top). Each arrow
    //    is an orthogonal-shouldered polyline: [edge anchor, ...elbow nodes, tip].
    const arrows = ent.arrows || [];
    for (let i = 0; i < arrows.length; i++) {
      const a = arrows[i];
      const pts = nbLeaderPoints(ent, a);
      const px = pts.map(p => real2px(blk, p.u, p.v));
      ctx.strokeStyle = col;
      ctx.lineWidth = lwPx((ent.leaderLwMm != null) ? ent.leaderLwMm : st.leaderLwMm);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (canWobble) {
        nbWobbleStroke(ctx, px, ampPx, _nbSeedFrom(ent.id * 97 + i));
      } else {
        ctx.beginPath();
        ctx.moveTo(px[0].x, px[0].y);
        for (let k = 1; k < px.length; k++) ctx.lineTo(px[k].x, px[k].y);
        ctx.stroke();
      }
      // arrowhead on the final segment (second-last point → tip)
      const Ah = px[px.length - 2] || px[0];
      const Th = px[px.length - 1];
      _nbDrawArrowHead(blk, Ah, Th, ent.arrowStyle, col, pm);
    }

    // 3) text (skip while editing — the textarea is the source of truth)
    if (!ent._editing) {
      for (let li = 0; li < lay.lines.length; li++) {
        const line = lay.lines[li];
        const lineTopPx = TL.y + lay.padMm * pm + li * lay.lineHMm * pm;
        const baseY = lineTopPx + lay.capMm * pm;   // cap sits from baseline up
        const x = TL.x + lay.padMm * pm;
        if (st.font === 'stroke') {
          if (typeof nbStrokeText === 'function') {
            nbStrokeText(ctx, line.text, x, baseY, lay.capMm * pm, {
              weightPx: lwPx(st.textWeightMm),
              color: col,
              letterSpacingPx: st.letterSpacingMm * pm,
              wobbleAmpPx: ampPx,
              jitter: st.jitter,
              slant: st.slant || 0,
              seed: _nbSeedFrom(ent.id * 131 + li),
              align: 'left',
            });
          } else {
            // js/96 not loaded — degrade gracefully to a system font so text
            // is never silently lost.
            ctx.font = (lay.capMm * pm) + 'px system-ui';
            ctx.fillStyle = col;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText(line.text, x, baseY);
          }
        } else {
          // plex web font
          ctx.font = st.weight + ' ' + (lay.capMm * pm) + 'px ' + st.family;
          ctx.fillStyle = col;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'alphabetic';
          ctx.fillText(line.text, x, baseY);
        }
      }
    }
  } finally {
    ctx.globalAlpha = prevA;
    ctx.textAlign = 'start';
  }
}

// ============================================================
// §4 — hit-test bounds, grips, moves, arrow editing
// ============================================================

// nbBounds(ent) → {L,R,B,T} tight to the box (+1mm pad) for hit-test.
function nbBounds(ent) {
  const lay = nbLayout(ent);
  const ds = _nbDs();   // paper-mm box dims → real-world extent (+1 paper-mm pad)
  return {
    L: ent.u - ds,
    R: ent.u + lay.boxW * ds + ds,
    B: ent.v - lay.boxH * ds - ds,
    T: ent.v + ds,
  };
}

// nbHandles(ent) → [ {key,u,v,shape?} ] grips. Move handle at the top-left, two
// mid-edge width grips, and one circular grip per arrow tip.
function nbHandles(ent) {
  const lay = nbLayout(ent);
  const ds = _nbDs();   // paper-mm box dims → real-world grip positions
  const uL = ent.u;
  const uR = ent.u + lay.boxW * ds;
  const vT = ent.v;
  const vB = ent.v - lay.boxH * ds;
  const vMid = (vT + vB) / 2;
  const out = [
    { key: 'move', u: uL, v: vT },
    { key: 'w-w',  u: uL, v: vMid },
    { key: 'w-e',  u: uR, v: vMid },
  ];
  const arrows = ent.arrows || [];
  for (let i = 0; i < arrows.length; i++) {
    out.push({ key: 'arrow:' + i, u: arrows[i].u, v: arrows[i].v, shape: 'circle' });
    const els = arrows[i].elbows || [];
    if (els.length) {
      for (let j = 0; j < els.length; j++) {
        out.push({ key: 'elbow:' + i + ':' + j, u: els[j].u, v: els[j].v, shape: 'circle' });
      }
    } else {
      // default auto-dogleg: expose its shoulder node as a draggable grip.
      const sh = nbAutoShoulder(ent, { u: arrows[i].u, v: arrows[i].v });
      out.push({ key: 'auto:' + i, u: sh.node.u, v: sh.node.v, shape: 'circle' });
    }
  }
  return out;
}

// nbMove(ent, handle, du, dv) — applies a grip/body drag. Width grips drop
// autoSize and re-flow text; the left grip keeps the right edge fixed.
function nbMove(ent, handle, du, dv) {
  if (handle === 'body' || handle === 'move') {
    // Move ONLY the box origin. Arrow tips + manual elbows stay fixed so the
    // arrowhead keeps pointing at its target while the box is dragged away; the
    // auto-dogleg leader re-routes from the box edge to the fixed tip on render.
    ent.u += du; ent.v += dv;
  } else if (handle === 'w-e') {
    // du is a real-world delta; box width is paper-mm → divide by drawingScale.
    ent.autoSize = false;
    const ds = _nbDs();
    const w0 = (ent.boxW || nbLayout(ent).boxW);
    ent.boxW = Math.max(NB.MINW_MM, w0 + du / ds);
  } else if (handle === 'w-w') {
    ent.autoSize = false;
    const ds = _nbDs();
    const w0 = (ent.boxW || nbLayout(ent).boxW);
    const rightReal = ent.u + w0 * ds;        // keep the right edge fixed
    const nw = Math.max(NB.MINW_MM, w0 - du / ds);
    ent.boxW = nw;
    ent.u = rightReal - nw * ds;              // left edge follows the cursor
  } else if (handle && handle.indexOf('auto:') === 0) {
    // dragging the default auto-dogleg node materialises it into a real elbow.
    const i = +handle.split(':')[1];
    const a = ent.arrows && ent.arrows[i];
    if (a) {
      if (!a.elbows || !a.elbows.length) {
        const sh = nbAutoShoulder(ent, { u: a.u, v: a.v });
        a.elbows = [{ u: sh.node.u, v: sh.node.v }];
      }
      a.elbows[0].u += du; a.elbows[0].v += dv;
    }
  } else if (handle && handle.indexOf('elbow:') === 0) {
    const p = handle.split(':');
    const i = +p[1], j = +p[2];
    if (ent.arrows && ent.arrows[i] && ent.arrows[i].elbows && ent.arrows[i].elbows[j]) {
      ent.arrows[i].elbows[j].u += du;
      ent.arrows[i].elbows[j].v += dv;
    }
  } else if (handle && handle.indexOf('arrow:') === 0) {
    const i = +handle.split(':')[1];
    if (ent.arrows && ent.arrows[i]) {
      ent.arrows[i].u += du;
      ent.arrows[i].v += dv;
    }
  }
}

// nbAddArrow(ent, u, v) — push a new arrow tip.
function nbAddArrow(ent, u, v) {
  if (!ent.arrows) ent.arrows = [];
  ent.arrows.push({ u: u, v: v });
}

// nbRemoveArrowNear(ent, u, v, tolMm) → true if one was removed. Removes the
// nearest arrow tip within tolMm of (u,v).
function nbRemoveArrowNear(ent, u, v, tolMm) {
  if (!ent.arrows || ent.arrows.length === 0) return false;
  let bestI = -1, bestD = Infinity;
  for (let i = 0; i < ent.arrows.length; i++) {
    const d = Math.hypot(ent.arrows[i].u - u, ent.arrows[i].v - v);
    if (d < bestD) { bestD = d; bestI = i; }
  }
  if (bestI >= 0 && bestD <= tolMm) {
    ent.arrows.splice(bestI, 1);
    return true;
  }
  return false;
}

// Point→segment distance in real-world (u,v).
function _nbDistPtSeg(pu, pv, a, b) {
  const dx = b.u - a.u, dy = b.v - a.v;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return Math.hypot(pu - a.u, pv - a.v);
  let t = ((pu - a.u) * dx + (pv - a.v) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(pu - (a.u + t * dx), pv - (a.v + t * dy));
}

// nbRemoveElbowNear(ent, u, v, tolMm) → true if a kink node within tol was removed.
function nbRemoveElbowNear(ent, u, v, tolMm) {
  const arrows = ent.arrows || [];
  let best = { d: Infinity, i: -1, j: -1 };
  for (let i = 0; i < arrows.length; i++) {
    const els = arrows[i].elbows || [];
    for (let j = 0; j < els.length; j++) {
      const d = Math.hypot(els[j].u - u, els[j].v - v);
      if (d < best.d) best = { d: d, i: i, j: j };
    }
  }
  if (best.i >= 0 && best.d <= tolMm) {
    arrows[best.i].elbows.splice(best.j, 1);
    return true;
  }
  return false;
}

// nbAddNodeAtLeader(ent, u, v, tolMm) → true if a kink node was inserted on a
// leader segment within tol of (u,v). The first node off the box snaps to the
// orthogonal axis radiating from the facing-edge midpoint at the clicked depth;
// further nodes drop exactly where clicked. The arrowhead/tip is untouched.
function nbAddNodeAtLeader(ent, u, v, tolMm) {
  const arrows = ent.arrows || [];
  let best = { d: Infinity, i: -1, k: -1 };
  for (let i = 0; i < arrows.length; i++) {
    const pts = nbLeaderPoints(ent, arrows[i]);
    for (let k = 0; k < pts.length - 1; k++) {
      const d = _nbDistPtSeg(u, v, pts[k], pts[k + 1]);
      if (d < best.d) best = { d: d, i: i, k: k };
    }
  }
  if (best.i < 0 || best.d > tolMm) return false;
  const arrow = arrows[best.i];
  if (!arrow.elbows || !arrow.elbows.length) {
    // materialise the default auto-dogleg shoulder first, so the path the user
    // clicked (which already shows the shoulder) keeps the same segment indices.
    const sh = nbAutoShoulder(ent, { u: arrow.u, v: arrow.v });
    arrow.elbows = [{ u: sh.node.u, v: sh.node.v }];
  }
  let node = { u: u, v: v };
  if (best.k === 0) {
    // First segment off the box → orthogonal shoulder from the facing-edge
    // midpoint, at the clicked depth. The tip's facing edge sets the axis.
    const edge = nbFacingEdge(ent, { u: arrow.u, v: arrow.v });
    const r = nbBoxRectReal(ent);
    const cu = (r.uL + r.uR) / 2, cv = (r.vT + r.vB) / 2;
    node = (edge === 'left' || edge === 'right') ? { u: u, v: cv } : { u: cu, v: v };
  }
  arrow.elbows.splice(best.k, 0, node);
  return true;
}

// nbAddArrowNodeBranch(ent, u, v, tolMm) → true if (u,v) is near a leader node
// (a stored elbow, or the default auto-dogleg shoulder) and a NEW arrow was branched
// from it. The new arrow shares that node as its first elbow and gets a tip fanned
// ~25° off the source leg, so it reads as a branch you then drag to the 2nd target.
function nbAddArrowNodeBranch(ent, u, v, tolMm) {
  const arrows = ent.arrows || [];
  let best = { d: Infinity, node: null, srcTip: null };
  for (let i = 0; i < arrows.length; i++) {
    const a = arrows[i];
    const nodes = (a.elbows && a.elbows.length)
      ? a.elbows
      : [nbAutoShoulder(ent, { u: a.u, v: a.v }).node];   // the default auto-dogleg node
    for (let j = 0; j < nodes.length; j++) {
      const d = Math.hypot(nodes[j].u - u, nodes[j].v - v);
      if (d < best.d) best = { d: d, node: { u: nodes[j].u, v: nodes[j].v }, srcTip: { u: a.u, v: a.v } };
    }
  }
  if (!best.node || best.d > tolMm) return false;
  const ds = _nbDs();
  const lx = best.srcTip.u - best.node.u, ly = best.srcTip.v - best.node.v;
  const len = Math.hypot(lx, ly);
  let nx, ny;
  if (len < 1e-3) {
    nx = 60 * ds; ny = -40 * ds;          // no source leg → default down-right offset
  } else {
    const ang = 25 * Math.PI / 180, cs = Math.cos(ang), sn = Math.sin(ang);
    nx = lx * cs - ly * sn; ny = lx * sn + ly * cs;   // fan ~25° off the source leg
  }
  ent.arrows.push({
    u: best.node.u + nx, v: best.node.v + ny,
    elbows: [{ u: best.node.u, v: best.node.v }],
  });
  return true;
}

// ============================================================
// §4 — nbDxfEmit — box lines + MTEXT per line + leaders + heads
// ============================================================

function nbDxfEmit(b, blk, ent) {
  if (typeof _dxfBlockPlace !== 'function') return;
  const lay = nbLayout(ent);
  const ds = _nbDs();   // paper-mm box dims → real-world (u,v) so _dxfBlockPlace maps to paper-mm
  const uL = ent.u;
  const uR = ent.u + lay.boxW * ds;
  const vT = ent.v;
  const vB = ent.v - lay.boxH * ds;
  const LAYER = 'S-NOTE';

  // 1) box outline — 4 lines (only when boxed)
  if (ent.boxed && typeof _dxfLine === 'function') {
    const tl = _dxfBlockPlace(blk, uL, vT);
    const tr = _dxfBlockPlace(blk, uR, vT);
    const br = _dxfBlockPlace(blk, uR, vB);
    const bl = _dxfBlockPlace(blk, uL, vB);
    _dxfLine(b, LAYER, tl.x, tl.y, tr.x, tr.y);
    _dxfLine(b, LAYER, tr.x, tr.y, br.x, br.y);
    _dxfLine(b, LAYER, br.x, br.y, bl.x, bl.y);
    _dxfLine(b, LAYER, bl.x, bl.y, tl.x, tl.y);
  }

  // 2) text — one MTEXT per wrapped line. DXF y is up; the _dxfText attach point
  //    is bottom-left (group 71 = 7), so place each line's baseline. The first
  //    line's baseline sits one cap height below the box top inner edge; each
  //    subsequent line steps down by lineHMm.
  if (typeof _dxfText === 'function') {
    for (let li = 0; li < lay.lines.length; li++) {
      // Real-world v of this line's baseline (v is up): start below the top pad
      // by one cap, then step down per line.
      const lineV = vT - (lay.padMm + li * lay.lineHMm + lay.capMm) * ds;
      const p = _dxfBlockPlace(blk, uL + lay.padMm * ds, lineV);
      _dxfText(b, LAYER, p.x, p.y, lay.lines[li].text, lay.capMm);
    }
  }

  // 3) leaders + arrowheads
  const arrows = ent.arrows || [];
  for (let i = 0; i < arrows.length; i++) {
    const a = arrows[i];
    const lpts = nbLeaderPoints(ent, a).map(function (p) { return _dxfBlockPlace(blk, p.u, p.v); });
    if (typeof _dxfLine === 'function') {
      for (let k = 0; k < lpts.length - 1; k++) _dxfLine(b, LAYER, lpts[k].x, lpts[k].y, lpts[k + 1].x, lpts[k + 1].y);
    }
    const A = lpts[lpts.length - 2] || lpts[0];
    const T = lpts[lpts.length - 1];

    if (ent.arrowStyle === 'dot') {
      if (typeof _dxfCircle === 'function') _dxfCircle(b, LAYER, T.x, T.y, NB.ARROW_DOT_MM);
      continue;
    }
    // Filled-look arrowhead approximated as a tiny triangle of 3 short lines,
    // computed in DXF space (Y up). Direction A→T in DXF coords.
    const dx = T.x - A.x, dy = T.y - A.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6 || typeof _dxfLine !== 'function') continue;
    const ux = dx / len, uy = dy / len;
    const nx = -uy, ny = ux;
    if (ent.arrowStyle === 'open') {
      const L = NB.ARROW_LEN_MM;
      const ang = NB.ARROW_OPEN_DEG * Math.PI / 180;
      const cosA = Math.cos(ang), sinA = Math.sin(ang);
      const rx = -ux, ry = -uy;
      const p1x = T.x + (rx * cosA - ry * sinA) * L;
      const p1y = T.y + (rx * sinA + ry * cosA) * L;
      const p2x = T.x + (rx * cosA + ry * sinA) * L;
      const p2y = T.y + (-rx * sinA + ry * cosA) * L;
      _dxfLine(b, LAYER, T.x, T.y, p1x, p1y);
      _dxfLine(b, LAYER, T.x, T.y, p2x, p2y);
    } else {
      // 'arrow' — small filled-look triangle as 3 short lines.
      const L = NB.ARROW_LEN_MM;
      const HW = NB.ARROW_HW_MM;
      const bx = T.x - ux * L, by = T.y - uy * L;
      const lx = bx + nx * HW, ly = by + ny * HW;
      const rx2 = bx - nx * HW, ry2 = by - ny * HW;
      _dxfLine(b, LAYER, T.x, T.y, lx, ly);
      _dxfLine(b, LAYER, lx, ly, rx2, ry2);
      _dxfLine(b, LAYER, rx2, ry2, T.x, T.y);
    }
  }
}

// ============================================================
