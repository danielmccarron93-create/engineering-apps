'use strict';

// V25 — material hatch patterns (concrete / steel / earth / timber / rendered / plasterboard / blockwork etc.)
// Extracted from dev/index.html lines 17296-17886 (2026-05-02 modular split)

// ---- MATERIAL HATCH PATTERNS ----
// V25-layout-overhaul — pattern set rebuilt to match Dan's 12-hatch sketch.
// Keys map to Draw-tab tiles: existing concrete, new concrete, blockwork,
// brick, timber end grain, timber side grain, grout, sand, backfill, soil,
// insulation, cross hatch.
// Removed: steelSolid, water, tanking (unsketched).
// Added:   grout (fine dense dots), soil (45° hatch, wider than crossHatch).
// One unified entity covers all material fills:
//   { type:'mat', shape:'rect'|'poly', material, u,v,w,h | pts:[{u,v}], rot }
const V25_MATERIALS = {
  // 1. Existing concrete — hand-drawn aggregate (outlined triangles) +
  //     scattered fines (dots). Denser triangles than "new concrete".
  reoConcrete: { label: 'Existing concrete', concretePattern: true,
                 triDensity: 0.020, dotDensity: 0.08, edge: 0.5 },
  // 2. New concrete — same hand-drawn pattern, lighter aggregate.
  concrete:    { label: 'New concrete',      concretePattern: true,
                 triDensity: 0.014, dotDensity: 0.10, edge: 0.45 },
  // 3. Blockwork — running-bond hand-drawn courses with control-joint marks.
  blockwork:   { label: 'Blockwork', blockworkPattern: true,
                 blockW: 390, blockH: 190, edge: 0.55 },
  // 4. Brick — running-bond brick courses (smaller unit than blockwork).
  brickwork:   { label: 'Brick',     blockworkPattern: true,
                 blockW: 230, blockH: 76, perpDot: false, edge: 0.5 },
  // 5. Timber end grain — concentric rings with radial cracks (hand-drawn).
  timberSec:   { label: 'Timber end grain',  timberEndPattern: true, edge: 0.5, lineAlpha: 0.35 },
  // 6. Timber side grain — wavy hand-drawn grain lines. lineAlpha 0.20 reads
  //    softly at default scale so the grain doesn't fight the cut linework;
  //    the user's preferred mid-range (calibrated against scale=90 + opacity=0.4)
  //    becomes the new default at scale=50 + opacity=1.
  timberElev:  { label: 'Timber side grain', timberSidePattern: true, edge: 0.5, lineAlpha: 0.20 },
  // 7. Grout — fine dense dots (NEW)
  grout:       { label: 'Grout',             density: 1.6, dotSize: 0.22, dotJitter: false, dots: true, edge: 0.35 },
  // 8. Sand — sparse dots
  sand:        { label: 'Sand',              dots: true, dotSize: 0.3, density: 1.4, edge: 0.35 },
  // 9. Backfill — 45° crossed hatch (X pattern)
  backfill:    { label: 'Backfill',          hatch: 45, spacing: 5, cross: true, edge: 0.4, lineAlpha: 0.5 },
  // 10. Soil — 45° hatch (single direction, wider spacing than cross-hatch).
  //     V25-layout-overhaul TODO: improve with topsoil tick marks per sketch.
  soil:        { label: 'Soil',              hatch: 45, spacing: 5, edge: 0.4, lineAlpha: 0.55 },
  // 11. Insulation — batt pattern
  insulation:  { label: 'Insulation',        batt: true, edge: 0.4 },
  // 12. Cross hatch — 45° hatch single direction (denser than soil)
  earth:       { label: 'Cross hatch',       hatch: 45, spacing: 3, edge: 0.4, lineAlpha: 0.55 },
};

function _v25MatPath(blk, ent) {
  ctx.beginPath();
  if (ent.shape === 'poly' && ent.pts && ent.pts.length >= 3) {
    const f = real2px(blk, ent.pts[0].u, ent.pts[0].v);
    ctx.moveTo(f.x, f.y);
    for (let i = 1; i < ent.pts.length; i++) {
      const q = real2px(blk, ent.pts[i].u, ent.pts[i].v);
      ctx.lineTo(q.x, q.y);
    }
    ctx.closePath();
  } else {
    const w = ent.w, h = ent.h;
    const a = real2px(blk, ent.u, ent.v + h);
    const b = real2px(blk, ent.u + w, ent.v + h);
    const c = real2px(blk, ent.u + w, ent.v);
    const d = real2px(blk, ent.u, ent.v);
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
    ctx.closePath();
  }
}
function _v25MatBounds(ent) {
  if (ent.shape === 'poly' && ent.pts) {
    let L = Infinity, R = -Infinity, B = Infinity, T = -Infinity;
    ent.pts.forEach(p => { if (p.u < L) L = p.u; if (p.u > R) R = p.u;
                           if (p.v < B) B = p.v; if (p.v > T) T = p.v; });
    return { L, R, B, T };
  }
  return { L: ent.u, R: ent.u + ent.w, B: ent.v, T: ent.v + ent.h };
}
// V25-layout-overhaul Phase 7 — per-entity colour & opacity overrides.
// Renderers fall back to the theme's --entity-color when the entity has no
// explicit colour set. Opacity is stored as 0..1 and applied via ctx.globalAlpha
// (multiplied into existing alpha so wrap/restore is the caller's responsibility).
function v25EntColour(ent, cs) {
  if (ent && ent.colour) return ent.colour;
  return cs.getPropertyValue('--entity-color').trim();
}
function v25EntFillColour(ent, cs) {
  if (ent && ent.fillColour) return ent.fillColour;
  return v25EntColour(ent, cs);
}
function v25EntOpacity(ent) {
  if (!ent) return 1;
  const o = ent.opacity;
  if (o == null || isNaN(o)) return 1;
  return Math.max(0, Math.min(1, +o));
}

// AS 1100 line-weight ramp tuned for HATCH boundaries — even the max is a
// "thin" drafting line (≤ 0.35 mm). Hatch borders never want structural-cut
// weights (0.5/0.7 mm). For body/cut linework the ramp can be reused at a
// higher offset later. Index 0 = no edge stroke at all. Default = level 3.
const AS1100_LW = [0, 0.05, 0.10, 0.13, 0.18, 0.25, 0.35];   // mm — used for export
// Screen-pixel widths matched to the ramp. Used by canvas rendering so the
// levels are visibly differentiated even at low zoom (where mm × pm collapses
// every level to a sub-pixel value). At export time we use AS1100_LW (mm).
const AS1100_LW_PX = [0, 0.5, 0.75, 1.0, 1.5, 2.0, 2.5];
const AS1100_LW_DEFAULT = 3;
const AS1100_LW_LABEL = ['none','very faint','faint','thin','medium','heavy','heaviest'];

// Map ent.edgeStyle ('solid'|'dashed'|'centre'|'phantom') to a CanvasRenderingContext2D
// dash pattern. Empty array = solid line.
function _v25EdgeDash(style) {
  if (style === 'dashed')  return [4, 3];
  if (style === 'centre')  return [10, 3, 2, 3];
  if (style === 'phantom') return [12, 3, 2, 3, 2, 3];
  return [];
}

// Centroid of a mat entity in real-world (u,v) coords. Used as the rotation
// pivot when ent.rot is non-zero, so the whole hatch (outline + pattern + dots
// + grain lines + rings) rotates rigidly about the polygon's centre.
function _v25MatCentroid(ent) {
  if (ent.shape === 'poly' && ent.pts && ent.pts.length) {
    let su = 0, sv = 0;
    for (const p of ent.pts) { su += p.u; sv += p.v; }
    return { u: su / ent.pts.length, v: sv / ent.pts.length };
  }
  return { u: ent.u + (ent.w || 0) / 2, v: ent.v + (ent.h || 0) / 2 };
}

// Shared rotation-snap helper. Used by member rotation, hatch rotation, and
// any future entity that has a `rot` field. Default behaviour mirrors what
// engineers expect from AutoCAD/Revit: snap to the cardinal/diagonal stops
// on a free drag, and hold Shift to bypass the snap for fine-grained angles.
//   currentRad: cursor-derived angle in radians (any range; we wrap)
//   shiftHeld:  true to bypass snap (free rotation)
//   snapStops:  optional array of degrees; defaults to 0/45/90/135/...
const ROT_SNAP_DEFAULT_DEG = [0, 45, 90, 135, 180, 225, 270, 315];
function applySnappedRotation(currentRad, shiftHeld, snapStops) {
  if (shiftHeld) return currentRad;
  const stops = (snapStops && snapStops.length) ? snapStops : ROT_SNAP_DEFAULT_DEG;
  let deg = (currentRad * 180 / Math.PI) % 360;
  if (deg < 0) deg += 360;
  let bestStop = stops[0], bestDelta = Infinity;
  for (const s of stops) {
    const sNorm = ((s % 360) + 360) % 360;
    let d = Math.abs(deg - sNorm);
    if (d > 180) d = 360 - d;
    if (d < bestDelta) { bestDelta = d; bestStop = sNorm; }
  }
  return bestStop * Math.PI / 180;
}

function drawMat2D(blk, ent, cs) {
  const def = V25_MATERIALS[ent.material] || V25_MATERIALS.concrete;
  const col = v25EntColour(ent, cs);
  const _opacityWas = ctx.globalAlpha;
  ctx.globalAlpha = _opacityWas * v25EntOpacity(ent);
  // Rigid-body rotation. Wraps the entire renderer in a canvas transform
  // around the centroid in pixel space so outline + every internal pattern
  // (concrete triangles, blockwork courses, timber grain, end-grain rings,
  // batts, hatch lines) rotates as one. Internal pattern maths stays in
  // unrotated real-world coords; the canvas handles rotation.
  const _matAngleRad = (ent.rot || 0) * Math.PI / 180;
  const _matCentroid = _v25MatCentroid(ent);
  const _matCp = real2px(blk, _matCentroid.u, _matCentroid.v);
  ctx.save();
  if (_matAngleRad !== 0) {
    ctx.translate(_matCp.x, _matCp.y);
    ctx.rotate(_matAngleRad);
    ctx.translate(-_matCp.x, -_matCp.y);
  }
  try {
  const pm = ppm();
  const scaleMul = Math.max(0.1, (ent.hatchScale != null ? +ent.hatchScale : 50) / 50);
  const scaleMulSq = scaleMul * scaleMul;
  // Outline — AS 1100 line-weight ramp via ent.edgeLevel. Skip stroke when
  // level === 0 ("no edge"). Uses the screen-px ramp directly so the levels
  // are visibly distinct on screen regardless of zoom; for entities created
  // before this field existed, fall back to def.edge × pm with the legacy
  // 0.35 px floor.
  const _edgeLvl = (typeof ent.edgeLevel === 'number')
    ? Math.max(0, Math.min(AS1100_LW.length - 1, ent.edgeLevel))
    : null;
  let _edgePx;
  if (_edgeLvl == null) {
    _edgePx = Math.max(0.35, (def.edge || 0.5) * pm);
  } else if (_edgeLvl === 0) {
    _edgePx = 0;
  } else {
    _edgePx = AS1100_LW_PX[_edgeLvl];
  }
  if (_edgePx > 0) {
    ctx.strokeStyle = col;
    ctx.lineWidth = _edgePx;
    ctx.setLineDash(_v25EdgeDash(ent.edgeStyle));
    _v25MatPath(blk, ent);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // Clip + fill
  ctx.save();
  _v25MatPath(blk, ent);
  ctx.clip();
  const { L, R, B, T } = _v25MatBounds(ent);
  const w = R - L, h = T - B;
  const sp = (def.spacing || 3) * drawingScale * scaleMul;
  // Per-material line-alpha lets each pattern read at its own intensity.
  // Defaults to 0.7 for back-compat with materials that don't set the field.
  const _lineAlpha = (typeof def.lineAlpha === 'number') ? def.lineAlpha : 0.7;
  ctx.lineWidth = Math.max(0.15, LW.HATCH * pm);
  ctx.strokeStyle = colorAlpha(col, _lineAlpha);
  ctx.fillStyle = colorAlpha(col, Math.min(1, _lineAlpha + 0.1));

  if (def.solid) {
    ctx.fillStyle = colorAlpha(col, 0.85);
    _v25MatPath(blk, ent); ctx.fill();
  }
  if (def.concretePattern) {
    // Hand-drawn concrete: scattered outlined triangles (aggregate) of varied
    // size and rotation, plus tiny dots (fines). Pattern is seeded from the
    // entity geometry so it stays stable across renders without storing extra
    // state on the entity.
    const seedKey = (ent.id || 0) * 9301
                  + Math.round(L * 13.7) + Math.round(B * 17.3)
                  + Math.round(w * 7.1) + Math.round(h * 11.9);
    let s = (seedKey | 0) >>> 0; if (!s) s = 1;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

    // Densities are "items per mm² of real space" so a wide rect gets more
    // items than a narrow one without going on a fixed grid (matches the
    // reference image's natural look).
    const areaMm2 = Math.max(1, w * h);
    const triCount = Math.max(6, Math.min(800, Math.round(areaMm2 * (def.triDensity || 0.015) / scaleMulSq)));
    const dotCount = Math.max(20, Math.min(2400, Math.round(areaMm2 * (def.dotDensity || 0.09) / scaleMulSq)));

    // Aggregate triangles — outlined (paper interior), slight wobble + rotation.
    ctx.lineWidth = Math.max(0.45, 0.30 * pm);
    ctx.strokeStyle = colorAlpha(col, 0.85);
    ctx.lineJoin = 'round';
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < triCount; i++) {
      const u = L + rnd() * w;
      const v = B + rnd() * h;
      // Real-world size: 1.0 – 3.0 mm. Most are small; a few are larger.
      const sizeBias = rnd();
      const baseMm = (1.0 + sizeBias * sizeBias * 2.0) * scaleMul;   // ~1.0..3.0 mm × scaleMul
      const baseRot = rnd() * Math.PI * 2;
      const pts = [];
      for (let k = 0; k < 3; k++) {
        const ang = baseRot + (k / 3) * Math.PI * 2 + (rnd() - 0.5) * 0.5;
        const r = baseMm * (0.85 + rnd() * 0.35);
        pts.push({ u: u + Math.cos(ang) * r, v: v + Math.sin(ang) * r });
      }
      ctx.beginPath();
      pts.forEach((p, k) => {
        const pp = real2px(blk, p.u, p.v);
        if (k === 0) ctx.moveTo(pp.x, pp.y); else ctx.lineTo(pp.x, pp.y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    // Fines — tiny solid dots filling between the aggregate.
    ctx.fillStyle = colorAlpha(col, 0.9);
    for (let i = 0; i < dotCount; i++) {
      const u = L + rnd() * w;
      const v = B + rnd() * h;
      const r = Math.max(0.35, (0.18 + rnd() * 0.18) * pm * scaleMul);
      const pp = real2px(blk, u, v);
      ctx.beginPath();
      ctx.arc(pp.x, pp.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (def.dots || def.dotSize) {
    // Regular dots, optionally jittered
    const gap = (3) * drawingScale * scaleMul;
    let seed = 17;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (let y = B + gap / 2; y < T; y += gap) {
      for (let x = L + gap / 2; x < R; x += gap) {
        const jx = def.dotJitter ? (rnd() - 0.5) * gap * 0.5 : 0;
        const jy = def.dotJitter ? (rnd() - 0.5) * gap * 0.5 : 0;
        const pp = real2px(blk, x + jx, y + jy);
        ctx.beginPath();
        ctx.arc(pp.x, pp.y, Math.max(0.4, (def.dotSize || 0.3) * pm * scaleMul), 0, Math.PI * 2);
        ctx.fillStyle = colorAlpha(col, 0.55);
        ctx.fill();
      }
    }
    if (def.triangle) {
      // Sprinkle small triangles too — reinforced concrete signature
      let s2 = 91;
      const rnd2 = () => { s2 = (s2 * 9301 + 49297) % 233280; return s2 / 233280; };
      const tgap = gap * 1.4;
      for (let y = B + tgap; y < T; y += tgap) {
        for (let x = L + tgap; x < R; x += tgap) {
          if (rnd2() < 0.55) continue;
          const pp = real2px(blk, x, y);
          const sz = Math.max(2, 1.0 * pm * scaleMul);
          ctx.beginPath();
          ctx.moveTo(pp.x, pp.y - sz);
          ctx.lineTo(pp.x + sz * 0.9, pp.y + sz * 0.7);
          ctx.lineTo(pp.x - sz * 0.9, pp.y + sz * 0.7);
          ctx.closePath();
          ctx.fillStyle = colorAlpha(col, 0.7);
          ctx.fill();
        }
      }
    }
  }
  if (def.hatch) {
    // 45° (or specified) parallel lines
    const ang = (def.hatch || 45) * Math.PI / 180;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const diag = Math.hypot(w, h);
    const step = sp;
    for (let d = -diag; d < diag; d += step) {
      // Line at distance d perpendicular to direction (dx,dy)
      const u1 = L + d * (-dy) - dx * diag;
      const v1 = B + d * dx    - dy * diag;
      const u2 = L + d * (-dy) + dx * diag;
      const v2 = B + d * dx    + dy * diag;
      rLine(blk, u1, v1, u2, v2);
    }
    if (def.cross) {
      const ang2 = -ang; const dx2 = Math.cos(ang2), dy2 = Math.sin(ang2);
      for (let d = -diag; d < diag; d += step) {
        const u1 = L + d * (-dy2) - dx2 * diag;
        const v1 = B + d * dx2    - dy2 * diag;
        const u2 = L + d * (-dy2) + dx2 * diag;
        const v2 = B + d * dx2    + dy2 * diag;
        rLine(blk, u1, v1, u2, v2);
      }
    }
  }
  if (def.blockworkPattern) {
    // Running-bond block / brick courses with hand-drawn wobble. Block size
    // in real-world mm comes from the def (390×190 for AU concrete blocks,
    // 230×76 for brickwork). Each course is offset by half a block.
    const blockW = (def.blockW || 390) * scaleMul;
    const blockH = (def.blockH || 190) * scaleMul;
    // Stable seed from entity geometry so wobble doesn't dance on redraw.
    let s = ((ent.id || 0) * 9301
          + Math.round(L * 13.7) + Math.round(B * 17.3)
          + Math.round(w * 7.1) + Math.round(h * 11.9)) >>> 0;
    if (!s) s = 1;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const wob = (mag) => (rnd() - 0.5) * mag;
    ctx.lineWidth = Math.max(0.4, (def.edge || 0.45) * pm);
    ctx.strokeStyle = colorAlpha(col, 0.85);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // Bed joints — full-width horizontal lines every blockH.
    const wMag = Math.min(blockH, blockW) * 0.04; // wobble magnitude in mm
    const seg = Math.max(2, Math.round(w / (blockW * 0.5)));
    for (let v = B; v <= T + 0.001; v += blockH) {
      ctx.beginPath();
      for (let k = 0; k <= seg; k++) {
        const u = L + (k / seg) * w;
        const vy = v + (k === 0 || k === seg ? 0 : wob(wMag));
        const pp = real2px(blk, u, vy);
        if (k === 0) ctx.moveTo(pp.x, pp.y); else ctx.lineTo(pp.x, pp.y);
      }
      ctx.stroke();
    }
    // Perp joints — alternating courses offset by half a block (running bond).
    let course = 0;
    for (let v = B; v < T - 0.001; v += blockH) {
      const offset = (course % 2) ? blockW * 0.5 : 0;
      for (let u = L + offset; u < R + 0.001; u += blockW) {
        if (u <= L + 0.001 || u >= R - 0.001) continue; // skip on the edge
        ctx.beginPath();
        const segs = 4;
        for (let k = 0; k <= segs; k++) {
          const t = k / segs;
          const vy = v + t * blockH;
          const ux = u + (k === 0 || k === segs ? 0 : wob(wMag));
          const pp = real2px(blk, ux, vy);
          if (k === 0) ctx.moveTo(pp.x, pp.y); else ctx.lineTo(pp.x, pp.y);
        }
        ctx.stroke();
      }
      // Optional small control-joint dot at the centre of each block face.
      if (def.perpDot !== false) {
        const fillBefore = ctx.fillStyle;
        ctx.fillStyle = colorAlpha(col, 0.7);
        for (let u = L + offset + blockW / 2; u < R; u += blockW) {
          const pp = real2px(blk, u, v + blockH / 2);
          ctx.beginPath();
          ctx.arc(pp.x, pp.y, Math.max(0.4, 0.25 * pm), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = fillBefore;
      }
      course++;
    }
  }
  if (def.timberSidePattern) {
    // Long wavy grain lines along the longest extent. Each line gets a
    // slightly different period/phase so they read as natural growth, not
    // a perfectly-spaced ruler.
    const horizontal = w >= h;
    const longSpan = horizontal ? w : h;
    const shortSpan = horizontal ? h : w;
    let s = ((ent.id || 0) * 9301
          + Math.round(L * 13.7) + Math.round(B * 17.3)
          + Math.round(w * 7.1) + Math.round(h * 11.9)) >>> 0;
    if (!s) s = 1;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    // Default density tuned so the grain reads softly on screen — engineers
    // can tighten via ent.hatchScale (lower = denser). 30mm baseline keeps
    // the grain well clear of cut linework at default scale; ent.hatchScale
    // is the user's mid-range knob to thicken or thin from this baseline.
    const lineSpacingMm = 30 * scaleMul;
    const lines = Math.max(3, Math.floor(shortSpan / lineSpacingMm));
    ctx.lineWidth = Math.max(0.4, (def.edge || 0.5) * pm);
    // Honour the per-material lineAlpha so the user's mid-range default
    // matches scale=90 + opacity=0.4 from the previous baseline (effective
    // alpha ~0.34). The `+0.15` keeps the timber grain a touch crisper than
    // the generic 0.7-default fallback (otherwise it disappears).
    ctx.strokeStyle = colorAlpha(col, Math.min(1, _lineAlpha + 0.15));
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const N = Math.max(20, Math.floor(longSpan / 6));
    for (let i = 0; i < lines; i++) {
      const baseT = (i + 0.5) / lines;       // 0..1 across short axis
      const ampMm = 1.0 + rnd() * 2.5;       // wobble amplitude per line
      const periodMm = 60 + rnd() * 120;     // long, gentle waves
      const phase = rnd() * Math.PI * 2;
      const drift = (rnd() - 0.5) * lineSpacingMm * 0.4; // base offset jitter
      ctx.beginPath();
      for (let k = 0; k <= N; k++) {
        const tk = k / N;
        const longPos = (horizontal ? L : B) + tk * longSpan;
        const wave = Math.sin(longPos / periodMm * Math.PI * 2 + phase) * ampMm;
        const shortBase = (horizontal ? B : L) + (baseT * shortSpan) + drift + wave;
        const u = horizontal ? longPos : shortBase;
        const v = horizontal ? shortBase : longPos;
        const pp = real2px(blk, u, v);
        if (k === 0) ctx.moveTo(pp.x, pp.y); else ctx.lineTo(pp.x, pp.y);
      }
      ctx.stroke();
    }
  }
  if (def.timberEndPattern) {
    // End-grain "tree rings" centred near the bottom-third with a few
    // radial cracks. Rings have slight wobble to read as natural rather
    // than perfect circles.
    let s = ((ent.id || 0) * 9301
          + Math.round(L * 13.7) + Math.round(B * 17.3)
          + Math.round(w * 7.1) + Math.round(h * 11.9)) >>> 0;
    if (!s) s = 1;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const cu = L + w * (0.45 + (rnd() - 0.5) * 0.1);
    const cv = B + h * (0.30 + (rnd() - 0.5) * 0.1);
    const cP = real2px(blk, cu, cv);
    ctx.lineWidth = Math.max(0.4, (def.edge || 0.5) * pm);
    // Honour per-material lineAlpha (with a small bump so end-grain rings
    // remain a touch crisper than the generic-hatch fallback).
    ctx.strokeStyle = colorAlpha(col, Math.min(1, _lineAlpha + 0.15));
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // Pith — small filled circle at the very centre.
    ctx.fillStyle = colorAlpha(col, Math.min(1, _lineAlpha + 0.15));
    ctx.beginPath();
    ctx.arc(cP.x, cP.y, Math.max(0.6, 0.5 * pm), 0, Math.PI * 2);
    ctx.fill();
    // Rings — wobbled circles at increasing radii. Stop once a ring is
    // entirely outside the rect (so we don't pay for a million points).
    const maxR = Math.hypot(
      Math.max(R - cu, cu - L),
      Math.max(T - cv, cv - B)
    );
    const ringStep = Math.max(8, Math.min(w, h) * 0.08) * scaleMul;
    const N = 80;
    for (let r = ringStep; r < maxR; r += ringStep * (0.85 + rnd() * 0.4)) {
      const ampMm = r * 0.04 + rnd() * 1.2;
      const phase = rnd() * Math.PI * 2;
      const periodMul = 3 + Math.floor(rnd() * 3); // 3..5 lobes per ring
      ctx.beginPath();
      for (let k = 0; k <= N; k++) {
        const ang = (k / N) * Math.PI * 2;
        const rr = r + Math.sin(ang * periodMul + phase) * ampMm;
        const u = cu + Math.cos(ang) * rr;
        const v = cv + Math.sin(ang) * rr;
        const pp = real2px(blk, u, v);
        if (k === 0) ctx.moveTo(pp.x, pp.y); else ctx.lineTo(pp.x, pp.y);
      }
      ctx.closePath();
      ctx.stroke();
    }
    // Radial checks — 3..5 cracks emanating from near the centre.
    const cracks = 3 + Math.floor(rnd() * 3);
    for (let i = 0; i < cracks; i++) {
      const ang = (i / cracks) * Math.PI * 2 + rnd() * 0.5;
      const segs = 6;
      const startR = ringStep * 0.6;
      const endR = maxR * (0.55 + rnd() * 0.5);
      ctx.beginPath();
      for (let k = 0; k <= segs; k++) {
        const t = k / segs;
        const rr = startR + t * (endR - startR);
        const a = ang + (rnd() - 0.5) * 0.2;
        const u = cu + Math.cos(a) * rr;
        const v = cv + Math.sin(a) * rr;
        const pp = real2px(blk, u, v);
        if (k === 0) ctx.moveTo(pp.x, pp.y); else ctx.lineTo(pp.x, pp.y);
      }
      ctx.stroke();
    }
  }
  // Legacy flags kept for back-compat with any saved sheets that still
  // reference the older `timberLines` / `timberRings` pattern keys.
  if (def.timberLines) {
    // Long parallel grain lines along the longest extent.
    const horizontal = w >= h;
    const lines = Math.max(3, Math.floor((horizontal ? h : w) / (8 * drawingScale)));
    for (let i = 1; i < lines; i++) {
      const off = i / lines;
      if (horizontal) {
        const v = B + off * h;
        rLine(blk, L, v, R, v);
      } else {
        const u = L + off * w;
        rLine(blk, u, B, u, T);
      }
    }
  }
  if (def.timberRings) {
    // End grain rings — a few concentric arcs offset from one corner.
    const cu = L + w * 0.15, cv = B + h * 0.15;
    for (let r = w * 0.25; r < w * 1.4; r += w * 0.18) {
      const c = real2px(blk, cu, cv);
      const rr = r / drawingScale * viewport.zoom;
      ctx.beginPath();
      ctx.arc(c.x, c.y, rr, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  if (def.batt) {
    // Insulation batt — sinusoidal through the rect
    const horizontal = w >= h;
    const amp = (horizontal ? h : w) * 0.4;
    const cx = (horizontal ? B + h / 2 : L + w / 2);
    const N = 40;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const u = horizontal ? L + t * w : cx + Math.sin(t * Math.PI * 6) * amp;
      const v = horizontal ? cx + Math.sin(t * Math.PI * 6) * amp : B + t * h;
      const p = real2px(blk, u, v);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
  if (def.waves) {
    // Wavy water lines
    const N = 30;
    const amp = 1.5 * drawingScale;
    const lines = Math.max(2, Math.floor(h / (5 * drawingScale)));
    for (let li = 1; li < lines; li++) {
      const yBase = B + (li / lines) * h;
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const u = L + t * w;
        const v = yBase + Math.sin(t * Math.PI * 4 + li) * amp;
        const p = real2px(blk, u, v);
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
  }
  if (def.tanking) {
    // Heavy edge band along inside of polygon — represents the membrane.
    ctx.lineWidth = Math.max(1.0, 1.0 * pm);
    ctx.strokeStyle = colorAlpha(col, 0.85);
    _v25MatPath(blk, ent);
    ctx.stroke();
    // Diagonal hatch sparser than earth
    const step = 6 * drawingScale;
    const diag = Math.hypot(w, h);
    for (let d = -diag; d < diag; d += step) {
      rLine(blk, L + d, B, L + d + h, T);
    }
  }
  ctx.restore();   // clip
  } finally { ctx.globalAlpha = _opacityWas; }
  ctx.restore();   // outer rotation save (paired with the `ctx.save()` near
                   // the top of drawMat2D — kept outside try/finally so we
                   // don't hide a thrown error inside the rotated transform).
}

