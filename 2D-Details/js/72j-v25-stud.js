'use strict';

/* ============================================================================
 * 72j-v25-stud.js — V25 2D-mode (paper-space) chemical anchor-stud fixing
 * ----------------------------------------------------------------------------
 * Band-9 (V25 2D-mode core). Sibling of 72c-v25-bolt.js / 72i-v25-screw.js.
 * Loaded in index.html AFTER 72i-v25-screw.js and BEFORE 73-init.js (classic
 * <script>, per-file strict; globals flow between files — no import/export).
 *
 * A Ramset ChemSet anchor stud (pre-cut, fully-threaded chemical/bonded rod),
 * placed in 2D paper-space the same way as a bolt/screw: pick the tile in the
 * V26 BB-rail Draw tab, choose a standard orientation (plan / section each
 * direction), single-click to drop. Drawn to TRUE SCALE for every catalogued
 * length from CHEMSET_STUDS (02g-data-anchor-studs.js).
 *
 * Geometry (what makes a stud != a bolt):
 *   - FULLY THREADED rod (thread runs the whole length; no smooth shank).
 *   - A plain washer + hex NUT at the PROJECTING end only (reuses the AS 1252
 *     hex/washer dims from BOLT_DB; a small AS-1112/1237 fallback covers M8/M10
 *     which BOLT_DB lacks).
 *   - The embedded end is a ~45° single-bevel CHISEL cut (no head, no far nut).
 *   - Bonded into concrete: below the concrete-face datum the drill hole + the
 *     adhesive BOND ZONE is hatched (Dan's "hatch the bond zone" choice).
 *   - Bearing is ONE-SIDED (washer underside snaps onto the nearest outside
 *     face on the nut side), via v25StudBearingFace — the screw's pattern, not
 *     the bolt's two-sided clamp.
 *
 * The entity:
 *   { type:'stud', u, v, studSpec:'M16', studOrient:'v-nutT', rot:0 }
 * studSpec is the SIZE key into CHEMSET_STUDS.
 *
 * Quality bar: STP Typical Structural Details p85 (6011.x). AS 1100 lineweights
 * via the LW constant only; centreline dash via DASH.CL_BOLT. Reuses the shared
 * thread/hex/polygon helpers in 33-draw-bolt.js and the hatch helpers in
 * 26-as1100-hatch.js. 2D-mode v1 only — never touches 3D-mode drawBolt nor
 * objects3D. Scope: 2D-only first; 3D-mode tile + iso geometry deferred.
 * ============================================================================ */

/* ---- Orientation presets (one per icon-bank symbol in index.html) ----------
 * Named by the NUT / projecting side: the washer+nut bear on the outside face,
 * the threaded rod drives AWAY from the nut into the concrete. So 'v-nutT' =
 * nut at top, stud embeds downward (the classic cast-in / hold-down view).   */
const V25_STUD_ORIENT = [
  { id: 'end',    label: 'End-on (plan / nut-on)',  icon: 'icon-orient-stud-end' },
  { id: 'h-nutL', label: 'Horizontal — nut left',   icon: 'icon-orient-stud-h-nutl' },
  { id: 'h-nutR', label: 'Horizontal — nut right',  icon: 'icon-orient-stud-h-nutr' },
  { id: 'v-nutT', label: 'Vertical — nut top',      icon: 'icon-orient-stud-v-nutt' },
  { id: 'v-nutB', label: 'Vertical — nut bottom',   icon: 'icon-orient-stud-v-nutb' },
];

const V25_STUD_DEFAULT_SPEC =
  (typeof DEFAULT_CHEMSET_SIZE !== 'undefined' && DEFAULT_CHEMSET_SIZE) || 'M16';

/* ---- Nut / washer / thread dims source -------------------------------------
 * BOLT_DB (03-data-bolts.js) is authoritative for M12..M36 but has NO M8/M10,
 * so studDims() falls back to AS-1112 hex-nut + AS-1237 plain-washer dims for
 * the two smallest studs, then to a from-diameter synthesis as a last resort —
 * never NaN on a missing lookup. Fields used: nutAF, nutH, washOD, washT,
 * minorD, pitch. (d comes from the stud catalogue.)                          */
const STUD_NUT_FALLBACK = {
  M8:  { nutAF: 13, nutH: 6.8, washOD: 16, washT: 1.6, minorD: 6.466, pitch: 1.25 },
  M10: { nutAF: 17, nutH: 8.4, washOD: 20, washT: 2.0, minorD: 8.160, pitch: 1.50 },
};
function studDims(sizeKey, d) {
  const b = (typeof BOLT_DB !== 'undefined' && BOLT_DB && BOLT_DB[sizeKey]) || null;
  if (b) return b;
  const f = STUD_NUT_FALLBACK[sizeKey];
  if (f) return f;
  // From-diameter synthesis (generic metric proportions) — safety net only.
  return { nutAF: 1.7 * d, nutH: 0.86 * d, washOD: 2.3 * d, washT: 0.2 * d,
           minorD: 0.84 * d, pitch: Math.max(1, 0.13 * d) };
}

/* ----------------------------------------------------------------------------
 * v25BuildStudOrientationRow() → HTMLDivElement
 * Live element (carries click handlers). Mirror of v25BuildScrewOrientationRow
 * in 72i: reuses #v25OrientRow + .v25-orient-btn CSS (only one row at a time).
 * -------------------------------------------------------------------------- */
function v25BuildStudOrientationRow() {
  const row = document.createElement('div');
  row.id = 'v25OrientRow';

  let activeId = 'v-nutT';
  if (typeof v25State !== 'undefined' && v25State && v25State.studOrient) {
    activeId = v25State.studOrient;
  } else if (typeof lastUsedOrientation !== 'undefined' && lastUsedOrientation && lastUsedOrientation.stud) {
    activeId = lastUsedOrientation.stud;
  }

  V25_STUD_ORIENT.forEach(preset => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'v25-orient-btn' + (preset.id === activeId ? ' active' : '');
    btn.title = preset.label;
    btn.setAttribute('aria-label', preset.label);
    btn.innerHTML = '<svg class="icon"><use href="#' + preset.icon + '"/></svg>';
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (typeof v25State !== 'undefined' && v25State) v25State.studOrient = preset.id;
      if (typeof lastUsedOrientation !== 'undefined' && lastUsedOrientation) {
        lastUsedOrientation.stud = preset.id;
      }
      if (typeof v25UpdateOptionsBar === 'function') v25UpdateOptionsBar();
      if (typeof requestRender === 'function') requestRender();
    });
    row.appendChild(btn);
  });

  return row;
}

/* ----------------------------------------------------------------------------
 * v25PickAndSetStud(spec) — arm the 'v25-stud' tool from a BB-rail / palette
 * tile. v25SetTool rebuilds v25State, so we set the stud state on the FRESH
 * v25State afterwards; persistence lives on lastUsedSection.stud /
 * lastUsedOrientation.stud (shared globals in 60-tile-palette.js).
 * -------------------------------------------------------------------------- */
function v25PickAndSetStud(spec) {
  const sz = spec
    || (typeof lastUsedSection !== 'undefined' && lastUsedSection && lastUsedSection.stud)
    || V25_STUD_DEFAULT_SPEC;

  if (typeof v25SetTool === 'function') {
    v25SetTool('v25-stud');
  } else if (typeof tool !== 'undefined') {
    tool = 'v25-stud'; // eslint-disable-line no-global-assign
  }

  if (typeof v25State !== 'undefined' && v25State) {
    v25State.studSpec = sz;
    v25State.studOrient =
      (typeof lastUsedOrientation !== 'undefined' && lastUsedOrientation && lastUsedOrientation.stud)
        ? lastUsedOrientation.stud
        : (v25State.studOrient || 'v-nutT');
  }

  if (typeof lastUsedSection !== 'undefined' && lastUsedSection) lastUsedSection.stud = sz;

  if (typeof v25UpdateOptionsBar === 'function') v25UpdateOptionsBar();
  if (typeof highlightActiveTile === 'function') highlightActiveTile();
  if (typeof requestRender === 'function') requestRender();
}

/* ============================================================================
 * v25StudBearingFace(blk, ent) → { face, fixtureThk } | null
 * ----------------------------------------------------------------------------
 * The washer underside bears on the OUTSIDE face of the material the stud fixes
 * down (baseplate top / plate face). One-sided cousin of the bolt's two-sided
 * v25BoltClampSpan (72c) and a sibling of v25ScrewBearingFace (72i): identical
 * material-detection loop (mem2 + v2 plate, transverse-ray test, 400 mm window)
 * but returns the SINGLE face on the nut side nearest the click, PLUS the
 * thickness of that fixture (its far face − near face) so the drawer can place
 * the concrete-face datum at the fixture underside. null = nothing found (the
 * washer sits at the click; concrete datum falls back to catalogue maxFixt).
 * end-on never snaps.
 * ========================================================================== */
function v25StudBearingFace(blk, ent) {
  if (!ent || !ent.studOrient || ent.studOrient === 'end') return null;

  const horiz = (ent.studOrient === 'h-nutL' || ent.studOrient === 'h-nutR');
  const axisIsU = horiz;
  const axisPos = axisIsU ? ent.u : ent.v;
  const transPos = axisIsU ? ent.v : ent.u;
  // bodyDir: +1 = embedded body toward increasing axis (nut at the low side),
  //          -1 = body toward decreasing axis (nut at the high side).
  const bodyDir = (ent.studOrient === 'h-nutL' || ent.studOrient === 'v-nutB') ? 1 : -1;

  const WINDOW = 400;
  const list = (typeof entities2D !== 'undefined' && entities2D[blk.viewKey]) || [];

  const bboxFromPts = (pts) => {
    let L = Infinity, R = -Infinity, B = Infinity, T = -Infinity;
    for (const p of pts) {
      const pu = (p.u != null) ? p.u : p.x, pv = (p.v != null) ? p.v : p.y;
      if (pu < L) L = pu; if (pu > R) R = pu;
      if (pv < B) B = pv; if (pv > T) T = pv;
    }
    return { L, R, B, T };
  };

  let best = null, bestThk = 0, bestDist = Infinity;

  for (const e of list) {
    if (!e || e === ent) continue;
    let lo, hi, tLo, tHi;

    if (e.type === 'plate2' && Array.isArray(e.pts) && e.pts.length >= 3) {
      const bb = bboxFromPts(e.pts);
      const thk = e.thk || e.pt || 10;
      const axLo = axisIsU ? bb.L : bb.B, axHi = axisIsU ? bb.R : bb.T;
      tLo = axisIsU ? bb.B : bb.L; tHi = axisIsU ? bb.T : bb.R;
      if ((axHi - axLo) <= Math.max(thk * 2.5, thk + 6)) { lo = axLo; hi = axHi; }   // edge-on cleat
      else { lo = axisPos - thk / 2; hi = axisPos + thk / 2; }                        // flat plate
    } else if (e.type === 'mem2') {
      const tw = (typeof v25BoltMemberWeb === 'function') ? v25BoltMemberWeb(e) : 10;
      if (!(tw > 0)) continue;
      const hd = (typeof v25Mem2HalfDepth === 'function') ? v25Mem2HalfDepth(e) : 50;
      if ((e.aspect || 'elev') === 'sec') {
        const c  = axisIsU ? e.u : e.v;
        const tc = axisIsU ? e.v : e.u;
        lo = c - tw / 2; hi = c + tw / 2;
        tLo = tc - hd;   tHi = tc + hd;
      } else {
        const bb = (typeof v25EntBounds === 'function') ? v25EntBounds(e) : null;
        if (!bb) continue;
        lo = axisPos - tw / 2; hi = axisPos + tw / 2;
        tLo = axisIsU ? bb.B : bb.L; tHi = axisIsU ? bb.T : bb.R;
      }
    } else {
      continue;
    }

    if (transPos < tLo || transPos > tHi) continue;
    // Bearing face = the boundary the stud enters from (the nut side).
    const face = (bodyDir === 1) ? Math.min(lo, hi) : Math.max(lo, hi);
    const dist = Math.abs(face - axisPos);
    if (dist > WINDOW) continue;
    if (dist < bestDist) { bestDist = dist; best = face; bestThk = Math.abs(hi - lo); }
  }

  return (best != null) ? { face: best, fixtureThk: bestThk } : null;
}

/* ============================================================================
 * drawStud2D(blk, ent, cs) — paper-space stud glyph renderer.
 * Dispatched from v25DrawEnt (69-v25-dispatch.js) for ent.type === 'stud'.
 * ========================================================================== */
function drawStud2D(blk, ent, cs) {
  const orient = ent.studOrient || 'v-nutT';

  const spec = (typeof getStudSpec === 'function')
             ? getStudSpec(ent.studSpec)
             : (typeof CHEMSET_STUDS === 'object' ? CHEMSET_STUDS[ent.studSpec] : null);
  // Representative M16 fallback so the UI never breaks on a bad/missing spec.
  const S = spec || { size: 'M16', d: 16, L: 190, Le: 165, maxFixt: 40, dh: 18, embed: 125 };

  const col = (cs && typeof cs.getPropertyValue === 'function')
    ? (cs.getPropertyValue('--entity-color').trim() || '#222')
    : '#222';
  const pm = (typeof ppm === 'function') ? ppm() : 1;

  const prevAlpha = ctx.globalAlpha;
  if (ent.opacity != null) ctx.globalAlpha = ent.opacity;
  ctx.save();
  if (orient === 'end') {
    drawStud2D_End(blk, ent, S, col, pm);
  } else {
    drawStud2D_Section(blk, ent, S, col, pm, orient);
  }
  ctx.restore();
  ctx.setLineDash([]);
  ctx.globalAlpha = prevAlpha;
  return true;
}

/* ---- End-on view ('end'): washer ring + hex nut outline + rod circle ------- */
function drawStud2D_End(blk, ent, S, col, pm) {
  const d = S.d || 16;
  const nd = studDims(S.size, d);
  const p = real2px(blk, ent.u, ent.v);
  const rRod = (d / 2) * pm;
  const wr   = ((nd.washOD || d * 2.1) / 2) * pm;     // washer OD radius
  const af   = (nd.nutAF || d * 1.7) / 2;             // nut half across-flats (mm)

  // Washer ring — dashed, light.
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = colorAlpha(col, 0.4);
  ctx.lineWidth = Math.max(0.3, LW.HID * pm);
  ctx.beginPath();
  ctx.arc(p.x, p.y, wr, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Hex nut outline (across-flats = nutAF) — a hexagon around the rod.
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(0.5, LW.VIS * pm);
  ctx.fillStyle = colorAlpha(col, 0.10);
  const rHex = (af / Math.cos(Math.PI / 6)) * pm;     // circumradius from half-AF
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + i * Math.PI / 3;           // flat-top hexagon
    const x = p.x + rHex * Math.cos(a), y = p.y + rHex * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Rod (thread major) circle.
  ctx.beginPath();
  ctx.arc(p.x, p.y, rRod, 0, Math.PI * 2);
  ctx.fillStyle = colorAlpha(col, 0.18);
  ctx.fill();
  ctx.stroke();

  // Centre cross.
  ctx.lineWidth = Math.max(0.3, LW.CL * pm);
  ctx.strokeStyle = colorAlpha(col, 0.6);
  ctx.beginPath();
  ctx.moveTo(p.x - rRod, p.y); ctx.lineTo(p.x + rRod, p.y);
  ctx.moveTo(p.x, p.y - rRod); ctx.lineTo(p.x, p.y + rRod);
  ctx.stroke();
}

/* ---- Section profile (h-nutL / h-nutR / v-nutT / v-nutB) --------------------
 * Local axis s measured from the WASHER UNDERSIDE (bearing plane), POSITIVE
 * into the material (embed direction), NEGATIVE projecting out. axisAt(s) =
 * junction + bodyDir·s; P(s,t) maps to [u,v] ARRAYS (NOT {u,v} objects, which
 * silently NaN through rPolygon/rFillPolygon). All four orientations share this
 * one code path, so the bearing snap + bond zone work identically.
 *
 *   s < 0 (projecting):  washer [0,-washT] · nut [-washT,-(washT+nutH)] ·
 *                        thread tail [-(washT+nutH), -(washT+nutH+tail)]
 *   s = 0:               bearing plane (washer underside) → snapped face
 *   s = sFace:           concrete-face datum (detected fixture thk, else maxFixt)
 *   s ∈ [sFace, embLen]: BOND ZONE — drill hole (±dh/2) + adhesive hatch
 *   s = embLen:          chisel tip (true catalogue L below the projection)
 * -------------------------------------------------------------------------- */
function drawStud2D_Section(blk, ent, S, col, pm, orient) {
  const axisIsU = (orient === 'h-nutL' || orient === 'h-nutR');
  const trans   = axisIsU ? ent.v : ent.u;
  const bodyDir = (orient === 'h-nutL' || orient === 'v-nutB') ? 1 : -1;

  // Catalogue + nut/washer geometry (mm), all catalogue/standard-pinned.
  const d   = S.d || 16;
  const L   = S.L || d * 12;
  const Le  = S.Le || L * 0.87;
  const dh  = S.dh || d + 2;
  const maxFixt = (S.maxFixt != null) ? S.maxFixt : Math.max(0, Le - (S.embed || Le * 0.75));
  const nd  = studDims(S.size, d);
  const nutAF = nd.nutAF || d * 1.7;
  const nutH  = nd.nutH  || d * 0.86;
  const washOD= nd.washOD|| d * 2.1;
  const washT = nd.washT || d * 0.2;
  const minorD= nd.minorD|| d * 0.84;
  const pitch = nd.pitch || Math.max(1, 0.13 * d);

  const dh2 = d / 2, hole2 = dh / 2, washHalf = washOD / 2, nutHalf = nutAF / 2;

  // Projection stack (above the bearing plane). tail = the exposed thread above
  // the nut; sized so the whole projection ≈ catalogue (L − Le).
  const tail = Math.max(2 * pitch, (L - Le) - (washT + nutH));
  const sTailTop = -(washT + nutH + tail);              // most-negative s (tail apex, flat cap)
  const sNutCrown = -(washT + nutH);                    // nut outer (crown) face
  const sNutWash  = -washT;                             // nut underside / washer top
  // Embedded length below the bearing plane → tip at true catalogue L.
  const embLen   = Math.max(d + 2, L - (washT + nutH + tail));
  const sChiselBase = embLen - d;                       // 45° bevel rises d over run d

  // Bearing snap (one-sided) + fixture thickness for the concrete datum.
  const snap = v25StudBearingFace(blk, ent);
  const junction = snap ? snap.face : (axisIsU ? ent.u : ent.v);
  let sFace = snap ? Math.max(0, snap.fixtureThk) : maxFixt;   // concrete-face datum
  sFace = Math.min(sFace, Math.max(0, embLen - 0.5));          // keep a bond region

  const axisAt = (s) => junction + bodyDir * s;
  const P = axisIsU ? (s, t) => [axisAt(s), trans + t]
                    : (s, t) => [trans + t, axisAt(s)];
  // Axis-aligned rect helper in (u,v) from an s-interval × ±half transverse.
  const rectFor = (sA, sB, half) => {
    const a = axisAt(sA), b = axisAt(sB);
    if (axisIsU) return [Math.min(a, b), trans - half, Math.abs(b - a), half * 2];
    return [trans - half, Math.min(a, b), half * 2, Math.abs(b - a)];
  };

  ctx.setLineDash([]);

  // (A) CENTRELINE first (under everything).
  {
    const a0 = axisAt(sTailTop - 3), aL = axisAt(embLen + 3);
    ctx.strokeStyle = colorAlpha(col, 0.5);
    ctx.lineWidth = Math.max(0.3, LW.CL * pm);
    ctx.setLineDash((typeof DASH !== 'undefined' && DASH.CL_BOLT) ? DASH.CL_BOLT : [8, 3, 2, 3]);
    if (axisIsU) rLine(blk, Math.min(a0, aL), trans, Math.max(a0, aL), trans);
    else         rLine(blk, trans, Math.min(a0, aL), trans, Math.max(a0, aL));
    ctx.setLineDash([]);
  }

  // (B) BOND ZONE (behind the rod): drill hole (±dh/2) + adhesive 45° hatch +
  //     hole walls + bottom cap. Drawn from the concrete face to a touch below
  //     the chisel tip so the bonded length reads as a hatched adhesive pocket.
  const sHoleBot = embLen + Math.max(3, 0.06 * embLen);
  if (sHoleBot - sFace > 1) {
    const hr = rectFor(sFace, sHoleBot, hole2);          // [L,B,w,h]
    // Adhesive hatch (45°) over the hole band, behind the rod.
    if (typeof drawCrossHatch === 'function') {
      drawCrossHatch(blk, hr[0], hr[1], hr[2], hr[3], col);
    }
    // Hole walls + bottom cap (thin).
    ctx.strokeStyle = colorAlpha(col, 0.7);
    ctx.lineWidth = Math.max(0.25, LW.HID * pm);
    ctx.setLineDash([]);
    const w1a = P(sFace, hole2),  w1b = P(sHoleBot, hole2);
    const w2a = P(sFace, -hole2), w2b = P(sHoleBot, -hole2);
    rLine(blk, w1a[0], w1a[1], w1b[0], w1b[1]);
    rLine(blk, w2a[0], w2a[1], w2b[0], w2b[1]);
    rLine(blk, w1b[0], w1b[1], w2b[0], w2b[1]);          // bottom cap
  }

  // (C) ROD — solid above the concrete face (free / grip), OUTLINE-ONLY through
  //     the bond zone so the adhesive hatch reads. Full-length thread overlay.
  // (C1) Upper rod (projection tail + grip) solid.
  const upperTop = sTailTop, upperBot = Math.max(sFace, sNutWash);
  const up = [P(upperTop, dh2), P(upperBot, dh2), P(upperBot, -dh2), P(upperTop, -dh2)];
  ctx.fillStyle = colorAlpha(col, 0.5);
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(0.4, LW.VIS * pm);
  rFillPolygon(blk, up);
  rPolygon(blk, up);

  // (C2) Lower rod (bond zone) outline + chisel — light fill so hatch shows.
  const low = [
    P(upperBot, dh2), P(embLen, dh2), P(sChiselBase, -dh2), P(upperBot, -dh2),
  ];
  ctx.fillStyle = colorAlpha(col, 0.14);
  rFillPolygon(blk, low);
  ctx.lineWidth = Math.max(0.4, LW.VIS * pm);
  rPolygon(blk, low);

  // (D) THREAD — full length, AS 1100 sawtooth (machine thread). Drawn over the
  //     visible rod only (tail above the nut + the body below the washer), so
  //     it never bleeds through the nut/washer fills. crest d/2, root minorD/2.
  //     Uses the LOCAL bounded drawStudThread (below) rather than the shared
  //     drawThreadAlong* — the latter's overshoot guard is tuned for short bolt
  //     thread zones and marches spurious teeth past the chisel over the long
  //     full-rod span.
  drawStudThread(blk, P, sTailTop, sNutCrown, dh2, minorD / 2, pitch, col, pm);
  drawStudThread(blk, P, 0, sChiselBase, dh2, minorD / 2, pitch, col, pm);

  // (E) DEPTH-SET MARK — a short transverse tick pair on the thread at the
  //     concrete-face datum (only when a host fixture was detected, so it never
  //     floats with no concrete behind it).
  if (snap) {
    ctx.strokeStyle = colorAlpha(col, 0.6);
    ctx.lineWidth = Math.max(0.25, LW.HID * pm);
    const m1a = P(sFace, dh2), m1b = P(sFace, dh2 + 2.0);
    const m2a = P(sFace, -dh2), m2b = P(sFace, -(dh2 + 2.0));
    rLine(blk, m1a[0], m1a[1], m1b[0], m1b[1]);
    rLine(blk, m2a[0], m2a[1], m2b[0], m2b[1]);
  }

  // (F) WASHER (plain) — touching the bearing plane, light fill.
  ctx.setLineDash([]);
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(0.5, LW.VIS * pm);
  ctx.fillStyle = colorAlpha(col, 0.10);
  const wr = rectFor(sNutWash, 0, washHalf);
  rFillRect(blk, wr[0], wr[1], wr[2], wr[3]);
  rRect(blk, wr[0], wr[1], wr[2], wr[3]);

  // (G) HEX NUT — chamfered, crown outward. Reuses the bolt hex helpers.
  const aCrown = axisAt(sNutCrown), aFlat = axisAt(sNutWash);
  const nutPts = axisIsU ? hexPointsAlongU(trans, aCrown, aFlat, nutHalf)
                         : hexPointsAlongV(trans, aCrown, aFlat, nutHalf);
  ctx.fillStyle = colorAlpha(col, 0.10);
  rFillPolygon(blk, nutPts);
  ctx.lineWidth = Math.max(0.5, LW.VIS * pm);
  rPolygon(blk, nutPts);

  // (H) BEARING LINE — the crispest line: where the washer bears on the face.
  const ba = P(0, washHalf), bb = P(0, -washHalf);
  ctx.lineWidth = Math.max(0.5, LW.VIS_HEAVY * pm);
  rLine(blk, ba[0], ba[1], bb[0], bb[1]);
}

/* ---- drawStudThread — AS 1100 sawtooth thread over a local-axis span ---------
 * Bounded sawtooth between crest (±crest) and root (±root) along the local axis
 * from sStart to sEnd, mapped through P(s,t) → [u,v] (so it works in every
 * orientation). Unlike the shared drawThreadAlongU/V, the tooth loop is a fixed
 * `for k < n` (n = floor(span/pitch)) so it NEVER overshoots the span end — the
 * stud's thread runs the full rod length, where the shared helper's distance-
 * based stop condition would march teeth past the chisel. Pitch is exaggerated
 * to a min-legible value on paper at coarse scale (the documented thread-fuzz
 * defence). Root lines (±root) bracket the teeth like the bolt thread.
 * -------------------------------------------------------------------------- */
function drawStudThread(blk, P, sStart, sEnd, crest, root, pitch, col, pm) {
  const span = sEnd - sStart;
  if (Math.abs(span) < 0.6) return;
  const dir = span >= 0 ? 1 : -1;
  const ds = (typeof drawingScale !== 'undefined' && drawingScale) ? drawingScale : 1;
  const p = Math.max(pitch || 1, 0.9 * ds);          // ≥0.9 mm on paper at any scale
  const n = Math.max(1, Math.floor(Math.abs(span) / p));

  ctx.setLineDash([]);
  // Minor-diameter (root) lines along the zone — thin, like drawThreadAlong*.
  ctx.strokeStyle = colorAlpha(col, 0.85);
  ctx.lineWidth = Math.max(0.15, LW.HATCH * pm);
  { const a = P(sStart, root), b = P(sEnd, root); rLine(blk, a[0], a[1], b[0], b[1]); }
  { const a = P(sStart, -root), b = P(sEnd, -root); rLine(blk, a[0], a[1], b[0], b[1]); }

  // Sawtooth teeth: one pitch = crest → root → crest on each edge. Bounded loop.
  ctx.lineWidth = Math.max(0.3, LW.VIS * pm * 0.7);
  for (let k = 0; k < n; k++) {
    const s0 = sStart + dir * p * k;
    const s1 = sStart + dir * p * (k + 0.5);
    const s2 = sStart + dir * p * (k + 1);
    const tp0 = P(s0, crest), tp1 = P(s1, root), tp2 = P(s2, crest);
    rLine(blk, tp0[0], tp0[1], tp1[0], tp1[1]);
    rLine(blk, tp1[0], tp1[1], tp2[0], tp2[1]);
    const bt0 = P(s0, -crest), bt1 = P(s1, -root), bt2 = P(s2, -crest);
    rLine(blk, bt0[0], bt0[1], bt1[0], bt1[1]);
    rLine(blk, bt1[0], bt1[1], bt2[0], bt2[1]);
  }
}
