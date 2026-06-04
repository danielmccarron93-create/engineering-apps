'use strict';

/* ============================================================================
 * 72i-v25-screw.js — V25 2D-mode (paper-space) timber-screw fixing: render + tool
 * ----------------------------------------------------------------------------
 * Band-9 (V25 2D-mode core). Sibling of 72c-v25-bolt.js. Loaded in index.html
 * AFTER 72c..72h and BEFORE 73-init.js (classic <script>, per-file strict;
 * globals flow between files — no import/export).
 *
 * A Rothoblaas HBS Plate screw (steel-to-timber), placed in 2D paper-space the
 * same way as a bolt: pick the tile in the V26 BB-rail Draw tab, choose a
 * standard orientation (plan / section each direction), single-click to drop.
 * Drawn to TRUE SCALE for every standard length from the verified catalogue in
 * 02c-data-screws.js (HBS_PLATE_SCREWS).
 *
 * What this file owns:
 *   - V25_SCREW_ORIENT             — the 5 orientation presets (head-side named).
 *   - v25BuildScrewOrientationRow()— the live icon-button row for the options bar.
 *   - v25PickAndSetScrew(spec)     — arm the 'v25-screw' tool from a palette tile.
 *   - v25ScrewBearingFace(blk,ent) — one-sided face finder: the head subtly snaps
 *                                    to the OUTSIDE face of a plate / steel member
 *                                    along the screw axis (mirror of the bolt's
 *                                    two-sided v25BoltClampSpan in 72c).
 *   - drawScrew2D(blk, ent, cs)    — orientation-aware renderer. 'end' delegates
 *                                    to drawScrewEnt (77, head-on circle); the
 *                                    section orientations draw a to-scale side
 *                                    profile: pan head + collar + smooth shank +
 *                                    threaded zone + pointed tip.
 *
 * The entity is the parked `screw` type (mkScrewEnt / 77-screw-entity.js):
 *   { type:'screw', u, v, screwSpec:'HBSPL8120', screwOrient:'v-headT', rot:0 }
 * screwSpec is the catalogue key into HBS_PLATE_SCREWS (the same field 79's rule
 * engine reads, so the deferred cleat rules bind straight on).
 *
 * Catalogue geometry (per HBS_PLATE_SCREWS entry):
 *   d   = thread MAJOR / outer dia (== nominal 8/10/12)   dS = smooth shank dia
 *   d2  = thread ROOT / minor dia                          dK = head dia
 *   t1  = head + under-head length (head-top -> shank)     tK = collar thickness
 *   L   = total length (head-top -> tip)                   b  = threaded length
 *
 * Quality bar: STP Typical Structural Details p85 (6011.x). AS 1100 lineweights
 * via the LW constant only; centreline dash via DASH.CL_BOLT. Reuses the shared
 * thread + polygon helpers in 33-draw-bolt.js (drawThreadAlongU/V, rPolygon,
 * rFillPolygon) so the screw thread reads consistently with the bolt thread.
 * 2D-mode v1 only — never touches 3D-mode drawBolt nor objects3D.
 * ============================================================================ */

/* ---- Orientation presets (one per icon-bank symbol in index.html) ----------
 * Named by HEAD side: the head bears on the outside face, the threaded shank
 * drives AWAY from the head into the timber. So 'v-headT' = head at top, screw
 * driving down; 'h-headL' = head at left, screw driving right; etc.            */
const V25_SCREW_ORIENT = [
  { id: 'end',     label: 'End-on (plan / head-on)', icon: 'icon-orient-screw-end' },
  { id: 'h-headL', label: 'Horizontal — head left',  icon: 'icon-orient-screw-h-headl' },
  { id: 'h-headR', label: 'Horizontal — head right', icon: 'icon-orient-screw-h-headr' },
  { id: 'v-headT', label: 'Vertical — head top',     icon: 'icon-orient-screw-v-headt' },
  { id: 'v-headB', label: 'Vertical — head bottom',  icon: 'icon-orient-screw-v-headb' },
];

const V25_SCREW_DEFAULT_SPEC = 'HBSPL8120';   // friendly first pick: Ø8 × 120

/* ----------------------------------------------------------------------------
 * v25BuildScrewOrientationRow() → HTMLDivElement
 * Live element (carries click handlers, so it can't be serialised into the
 * options-bar innerHTML string). Mirror of v25BuildBoltOrientationRow in 72c:
 * reuses #v25OrientRow + .v25-orient-btn CSS (only one row shows at a time).
 * -------------------------------------------------------------------------- */
function v25BuildScrewOrientationRow() {
  const row = document.createElement('div');
  row.id = 'v25OrientRow';

  // Active id: live tool state, then last-used memory, then 'v-headT'.
  let activeId = 'v-headT';
  if (typeof v25State !== 'undefined' && v25State && v25State.screwOrient) {
    activeId = v25State.screwOrient;
  } else if (typeof lastUsedOrientation !== 'undefined' && lastUsedOrientation && lastUsedOrientation.screw) {
    activeId = lastUsedOrientation.screw;
  }

  V25_SCREW_ORIENT.forEach(preset => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'v25-orient-btn' + (preset.id === activeId ? ' active' : '');
    btn.title = preset.label;
    btn.setAttribute('aria-label', preset.label);
    btn.innerHTML = '<svg class="icon"><use href="#' + preset.icon + '"/></svg>';
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (typeof v25State !== 'undefined' && v25State) v25State.screwOrient = preset.id;
      if (typeof lastUsedOrientation !== 'undefined' && lastUsedOrientation) {
        lastUsedOrientation.screw = preset.id;
      }
      if (typeof v25UpdateOptionsBar === 'function') v25UpdateOptionsBar();
      if (typeof requestRender === 'function') requestRender();
    });
    row.appendChild(btn);
  });

  return row;
}

/* ----------------------------------------------------------------------------
 * v25PickAndSetScrew(spec) — arm the 'v25-screw' tool from a BB-rail / palette
 * tile. v25SetTool rebuilds v25State from scratch, so we set the screw state on
 * the FRESH v25State afterwards; persistence across tool switches lives on the
 * shared lastUsedSection.screw / lastUsedOrientation.screw globals.
 * -------------------------------------------------------------------------- */
function v25PickAndSetScrew(spec) {
  const sz = spec
    || (typeof lastUsedSection !== 'undefined' && lastUsedSection && lastUsedSection.screw)
    || V25_SCREW_DEFAULT_SPEC;

  // Arm the tool first (this rebuilds v25State).
  if (typeof v25SetTool === 'function') {
    v25SetTool('v25-screw');
  } else if (typeof tool !== 'undefined') {
    tool = 'v25-screw'; // eslint-disable-line no-global-assign
  }

  if (typeof v25State !== 'undefined' && v25State) {
    v25State.screwSpec = sz;
    v25State.screwOrient =
      (typeof lastUsedOrientation !== 'undefined' && lastUsedOrientation && lastUsedOrientation.screw)
        ? lastUsedOrientation.screw
        : (v25State.screwOrient || 'v-headT');
  }

  if (typeof lastUsedSection !== 'undefined' && lastUsedSection) lastUsedSection.screw = sz;

  if (typeof v25UpdateOptionsBar === 'function') v25UpdateOptionsBar();
  if (typeof highlightActiveTile === 'function') highlightActiveTile();
  if (typeof requestRender === 'function') requestRender();
}

/* ============================================================================
 * v25ScrewBearingFace(blk, ent) → bearing axis-coord (mm) | null
 * ----------------------------------------------------------------------------
 * The head bears on the OUTSIDE face of the material it fixes through. This
 * finds that face along the screw axis so the head auto-lands on a real plate /
 * member outer face at draw time — the "subtle snap" the user asked for. It is
 * the one-sided cousin of the bolt's two-sided v25BoltClampSpan (72c): the
 * material-detection loop is identical (mem2 + v2 plate, transverse-ray test,
 * 400 mm window) but instead of unioning both faces it returns the single face
 * on the HEAD side, nearest the click. null = nothing found (head sits at the
 * click point). end-on never snaps.
 * ========================================================================== */
function v25ScrewBearingFace(blk, ent) {
  if (!ent || !ent.screwOrient || ent.screwOrient === 'end') return null;

  const horiz = (ent.screwOrient === 'h-headL' || ent.screwOrient === 'h-headR');
  const axisIsU = horiz;                              // axis = direction the screw runs
  const axisPos = axisIsU ? ent.u : ent.v;            // click position along the axis
  const transPos = axisIsU ? ent.v : ent.u;           // perpendicular position
  // bodyDir: +1 = tip toward increasing axis coord (head at the low side),
  //          -1 = tip toward decreasing axis coord (head at the high side).
  const bodyDir = (ent.screwOrient === 'h-headL' || ent.screwOrient === 'v-headB') ? 1 : -1;

  const WINDOW = 400;                                 // mm — localise to the connection at the click
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

  let best = null, bestDist = Infinity;

  for (const e of list) {
    if (!e || e === ent) continue;
    let lo, hi, tLo, tHi;                               // axial interval + transverse extent

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

    // The screw axis (at transPos) must pass through the material transversely.
    if (transPos < tLo || transPos > tHi) continue;
    // Bearing face = the boundary the screw enters from (the head side).
    const face = (bodyDir === 1) ? Math.min(lo, hi) : Math.max(lo, hi);
    const dist = Math.abs(face - axisPos);
    if (dist > WINDOW) continue;
    if (dist < bestDist) { bestDist = dist; best = face; }
  }

  return (best != null) ? best : null;
}

/* ============================================================================
 * drawScrew2D(blk, ent, cs) — paper-space screw glyph renderer.
 * Dispatched from v25DrawEnt (69-v25-dispatch.js) for ent.type === 'screw'.
 * ========================================================================== */
function drawScrew2D(blk, ent, cs) {
  const orient = ent.screwOrient || 'end';

  // End-on (plan / head-on) reuses the existing head circle drawer in 77.
  if (orient === 'end') {
    if (typeof drawScrewEnt === 'function') drawScrewEnt(blk, ent, cs);
    return true;
  }

  const spec = (typeof getScrewSpec === 'function')
             ? getScrewSpec(ent.screwSpec)
             : (typeof HBS_PLATE_SCREWS === 'object' ? HBS_PLATE_SCREWS[ent.screwSpec] : null);
  // Representative Ø10 fallback so the UI never breaks on a bad/missing spec.
  const S = spec || { d: 10, d2: 6.6, dS: 7.2, dK: 16.5, t1: 16.5, tK: 5.0, L: 120, b: 95 };

  const col = (cs && typeof cs.getPropertyValue === 'function')
    ? ((cs.getPropertyValue('--screw-color').trim() || cs.getPropertyValue('--entity-color').trim()) || '#222')
    : '#222';
  const pm = (typeof ppm === 'function') ? ppm() : 1;

  const prevAlpha = ctx.globalAlpha;
  if (ent.opacity != null) ctx.globalAlpha = ent.opacity;
  ctx.save();
  drawScrew2D_Section(blk, ent, S, col, pm, orient);
  ctx.restore();
  ctx.setLineDash([]);
  ctx.globalAlpha = prevAlpha;
  return true;
}

/* ---- Section profile (h-headL / h-headR / v-headT / v-headB) ---------------
 * Local axis s runs head-top (s=0) -> tip (s=L). The head-to-shank junction
 * (s=t1) lands on the detected bearing face (or the click point), so the head
 * sits proud on the outside face and the shank+thread drive into the material.
 * -------------------------------------------------------------------------- */
function drawScrew2D_Section(blk, ent, S, col, pm, orient) {
  const horiz = (orient === 'h-headL' || orient === 'h-headR');
  const axisIsU = horiz;
  const trans = axisIsU ? ent.v : ent.u;              // transverse (centreline) coord
  const bodyDir = (orient === 'h-headL' || orient === 'v-headB') ? 1 : -1;

  const bearing = v25ScrewBearingFace(blk, ent);
  const junction = (bearing != null) ? bearing : (axisIsU ? ent.u : ent.v);

  // Catalogue geometry → half-widths (mm).
  const d   = S.d  || 10;
  const d2  = S.d2 || d * 0.74;
  const dS  = S.dS || d * 0.79;
  const dK  = S.dK || d * 1.85;
  const t1  = S.t1 || d * 1.6;
  const tK  = S.tK || d * 0.55;
  const L   = S.L  || d * 12;
  const b   = S.b  || L * 0.78;

  const dKh = dK / 2, dSh = dS / 2, d2h = d2 / 2, dh = d / 2;

  // s-positions along the screw axis.
  const capLen    = Math.min(t1 * 0.5, Math.max(tK, dK * 0.30));   // thick collar / pan cap
  const sThread   = Math.max(t1, L - b);                            // thread starts here
  const tipLen    = Math.min((L - sThread) * 0.6 + 0.001, Math.max(d * 1.2, 4));
  const sTipStart = Math.max(sThread, L - tipLen);

  // Local (s,t) → real {u,v}. junction at s=t1; head (s<t1) sits on the -bodyDir side.
  const axisAt = (s) => junction + bodyDir * (s - t1);
  const P = axisIsU
    ? (s, t) => ({ u: axisAt(s), v: trans + t })
    : (s, t) => ({ u: trans + t, v: axisAt(s) });

  ctx.setLineDash([]);

  // 1) BODY (smooth shank + thread core + pointed tip) — one filled outline.
  const bodyPts = [
    P(t1,        dSh), P(sThread,    dSh), P(sTipStart,  d2h),
    P(L,         0),
    P(sTipStart,-d2h), P(sThread,   -dSh), P(t1,        -dSh),
  ];
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(0.3, LW.VIS * pm);
  ctx.fillStyle = colorAlpha(col, 0.40);
  rFillPolygon(blk, bodyPts);
  rPolygon(blk, bodyPts);

  // 2) THREAD sawtooth (crest d/2, root d2/2) over the straight threaded zone —
  //    crests stand proud of the smooth shank, exactly like the real screw.
  if (sTipStart - sThread > 0.5) {
    const pitch = Math.max(1.2, d * 0.42);
    ctx.strokeStyle = colorAlpha(col, 0.85);
    ctx.lineWidth = Math.max(0.3, LW.VIS * pm * 0.7);
    if (axisIsU) drawThreadAlongU(blk, trans, axisAt(sThread), axisAt(sTipStart), dh, d2h, pitch);
    else         drawThreadAlongV(blk, trans, axisAt(sThread), axisAt(sTipStart), dh, d2h, pitch);
  }

  // 3) HEAD — flat-top pan + collar then a truncated-cone under-head down to the
  //    shank. Drawn after the body so the head cleanly overlaps the shank start.
  const headPts = [
    P(0,       dKh), P(capLen,  dKh), P(t1,  dSh),
    P(t1,     -dSh), P(capLen, -dKh), P(0,  -dKh),
  ];
  ctx.setLineDash([]);
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(0.5, LW.VIS * pm);
  ctx.fillStyle = colorAlpha(col, 0.14);
  rFillPolygon(blk, headPts);
  rPolygon(blk, headPts);

  // 4) Centreline — dashed, light, running the full length.
  const a0 = axisAt(0), aL = axisAt(L);
  ctx.strokeStyle = colorAlpha(col, 0.5);
  ctx.lineWidth = Math.max(0.2, LW.CL * pm);
  ctx.setLineDash((typeof DASH !== 'undefined' && DASH.CL_BOLT) ? DASH.CL_BOLT : [8, 2, 2, 2]);
  if (axisIsU) rLine(blk, Math.min(a0, aL) - 4, trans, Math.max(a0, aL) + 4, trans);
  else         rLine(blk, trans, Math.min(a0, aL) - 4, trans, Math.max(a0, aL) + 4);
  ctx.setLineDash([]);
}
