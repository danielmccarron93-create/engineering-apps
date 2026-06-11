'use strict';

/* ============================================================================
 * 72i-v25-screw.js — V25 2D-mode (paper-space) timber-screw fixing: render + tool
 * ----------------------------------------------------------------------------
 * Band-9 (V25 2D-mode core). Sibling of 72c-v25-bolt.js. Loaded in index.html
 * AFTER 72c..72h and BEFORE 73-init.js (classic <script>, per-file strict;
 * globals flow between files — no import/export).
 *
 * Rothoblaas timber screws (steel-to-timber), placed in 2D paper-space the
 * same way as a bolt: pick the tile in the V26 BB-rail Draw tab, choose a
 * standard orientation (plan / section each direction), single-click to drop.
 * Drawn to TRUE SCALE for every standard length from the verified catalogues.
 * TWO families share the one 'screw' entity / 'v25-screw' tool — the spec id
 * picks the family: 'HBSPL…' = HBS Plate (02c-data-screws.js), 'VGS…' = VGS
 * fully-threaded (02j-data-vgs-screws.js, added 2026-06-10). getScrewSpec (02e)
 * resolves across both.
 *
 * What this file owns:
 *   - V25_SCREW_ORIENT             — the 5 orientation presets (head-side named,
 *                                    shared by both families; per-family icons).
 *   - v25BuildScrewOrientationRow()— the live icon-button row for the options bar.
 *   - v25PickAndSetScrew(spec)     — arm the 'v25-screw' tool from a palette tile.
 *                                    Family-aware last-used: VGS → lastUsedSection
 *                                    .vgs, HBS → .screw.
 *   - v25ScrewBearingFace(blk,ent) — one-sided face finder: the head subtly snaps
 *                                    to the OUTSIDE face of a plate / steel member
 *                                    along the screw axis (mirror of the bolt's
 *                                    two-sided v25BoltClampSpan in 72c).
 *   - drawScrew2D(blk, ent, cs)    — orientation-aware renderer. 'end' delegates
 *                                    to drawScrewEnt (77, head-on view); section
 *                                    orientations route by family:
 *   - drawScrew2D_Section(...)     — HBS side profile: pan head + collar + smooth
 *                                    shank + threaded zone + pointed tip.
 *   - drawVgs2D_Section(...)       — VGS side profile: fully threaded, csk head
 *                                    with ribs (L ≤ 600) or hex head + integral
 *                                    washer flange (L > 600). IFC-exact head.
 *   - drawScrewThread(...)         — shared standing-teeth thread (optional
 *                                    pitch override for VGS catalogue pitch).
 *
 * The entity is the parked `screw` type (mkScrewEnt / 77-screw-entity.js):
 *   { type:'screw', u, v, screwSpec:'HBSPL8120', screwOrient:'v-headT', rot:0 }
 * screwSpec is the catalogue key into HBS_PLATE_SCREWS / VGS_SCREWS (the same
 * field 79's rule engine reads, so the deferred cleat rules bind straight on).
 *
 * HBS catalogue geometry (per HBS_PLATE_SCREWS entry):
 *   d   = thread MAJOR / outer dia (== nominal 8/10/12)   dS = smooth shank dia
 *   d2  = thread ROOT / minor dia                          dK = head dia
 *   t1  = head + under-head length (head-top -> shank)     tK = collar thickness
 *   L   = total length (head-top -> tip)                   b  = threaded length
 * VGS catalogue geometry: see 02j-data-vgs-screws.js header (csk: dK/t1/dIn/dU +
 * IFC profile segments hRim/hCone/hRib/hCham; hex: SW/tS/dFl/tFl/dU/hCham;
 * shared: d crest, d2 root, L, b, tip, pitch). NB hex L is UNDER-HEAD → tip.
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
 * driving down; 'h-headL' = head at left, screw driving right; etc.
 * The presets (and the live orientation STATE — v25State.screwOrient /
 * lastUsedOrientation.screw) are SHARED by both families; only the icon glyphs
 * differ (icon = HBS pan head, vgsIcon = VGS csk/hex head).                     */
const V25_SCREW_ORIENT = [
  { id: 'end',     label: 'End-on (plan / head-on)', icon: 'icon-orient-screw-end',     vgsIcon: 'icon-orient-vgs-end' },
  { id: 'h-headL', label: 'Horizontal — head left',  icon: 'icon-orient-screw-h-headl', vgsIcon: 'icon-orient-vgs-h-headl' },
  { id: 'h-headR', label: 'Horizontal — head right', icon: 'icon-orient-screw-h-headr', vgsIcon: 'icon-orient-vgs-h-headr' },
  { id: 'v-headT', label: 'Vertical — head top',     icon: 'icon-orient-screw-v-headt', vgsIcon: 'icon-orient-vgs-v-headt' },
  { id: 'v-headB', label: 'Vertical — head bottom',  icon: 'icon-orient-screw-v-headb', vgsIcon: 'icon-orient-vgs-v-headb' },
];

const V25_SCREW_DEFAULT_SPEC = 'HBSPL8120';   // friendly first pick: Ø8 × 120

/* ---- DXF-derived section-profile constants --------------------------------
 * Traced from HBS-PLATE_wd04-rothoblaas.dxf (the manufacturer geometry). Shape
 * proportions are normalised to nominal d1; the load-bearing diameters (crest d1,
 * root d2, neck dUK, shank dS, head dK) are pinned to the catalogue at draw time
 * so every size is exact. See PlannedBuilds/hbs-plate-screw/. ----------------- */
const SCREW_GEOM = {
  headLenNorm: 1.80,   // head-top → smooth-shank start (≈1.80·d1). REPLACES t1
                       //   (t1 is the TX-recess depth, not a side-profile length).
  neckEndNorm: 0.95,   // under-head neck (dUK) ends here, then cones down to dS.
  tipLenNorm:  1.48,   // tip-cone length from thread-end to apex (≈1.48·d1; 28° point).
};
// Catalogue thread pitch (mm) per nominal d1. Exaggerated to a min-legible value
// at coarse drawing scales so the teeth read (see drawScrewThread).
const HBS_THREAD_PITCH = { 8: 4.0, 10: 4.2, 12: 4.5 };

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

  // Icon family: the armed spec decides; with no armed spec fall back to the
  // last-used memory (HBS preferred when both families have history — back-
  // compat with the original single-family row). Orientation state itself
  // stays SHARED — only the button glyphs change.
  let famSpec = null;
  if (typeof v25State !== 'undefined' && v25State && v25State.screwSpec) {
    famSpec = v25State.screwSpec;
  } else if (typeof lastUsedSection !== 'undefined' && lastUsedSection) {
    famSpec = lastUsedSection.screw || lastUsedSection.vgs || null;
  }
  const vgsFam = (typeof isVgsSpec === 'function') && isVgsSpec(famSpec);

  V25_SCREW_ORIENT.forEach(preset => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'v25-orient-btn' + (preset.id === activeId ? ' active' : '');
    btn.title = preset.label;
    btn.setAttribute('aria-label', preset.label);
    const iconId = (vgsFam && preset.vgsIcon) ? preset.vgsIcon : preset.icon;
    btn.innerHTML = '<svg class="icon"><use href="#' + iconId + '"/></svg>';
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
 * shared lastUsedSection / lastUsedOrientation globals. Last-used SIZE memory
 * is per-family (VGS ids → lastUsedSection.vgs, HBS ids → .screw) so switching
 * family doesn't clobber the other family's pick; the null-arg default stays
 * HBS-family for back-compat. Orientation memory stays shared (.screw).
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

  if (typeof lastUsedSection !== 'undefined' && lastUsedSection) {
    if (typeof isVgsSpec === 'function' && isVgsSpec(sz)) lastUsedSection.vgs = sz;
    else lastUsedSection.screw = sz;
  }

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
 * material-detection loop mirrors it (mem2 + v2 plate, transverse-ray test,
 * 400 mm window) but instead of unioning both faces it returns the single face
 * on the HEAD side, nearest the click. One divergence from 72c: TIMBER mem2
 * ('glt'/'clt'/'timber') in elevation bears on the member's OUTLINE face (bare
 * timber — screws drive into the solid), not a click-centred web band; steel
 * keeps the web semantics. null = nothing found (head sits at the click
 * point). end-on never snaps.
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
      const mt = e.memberType;
      const timber = (mt === 'glt' || mt === 'clt' || mt === 'timber');
      const tw = (typeof v25BoltMemberWeb === 'function') ? v25BoltMemberWeb(e) : 10;
      if (!timber && !(tw > 0)) continue;
      const hd = (typeof v25Mem2HalfDepth === 'function') ? v25Mem2HalfDepth(e) : 50;
      if ((e.aspect || 'elev') === 'sec') {
        const c  = axisIsU ? e.u : e.v;
        const tc = axisIsU ? e.v : e.u;
        lo = c - tw / 2; hi = c + tw / 2;
        tLo = tc - hd;   tHi = tc + hd;
      } else {
        const bb = (typeof v25EntBounds === 'function') ? v25EntBounds(e) : null;
        if (!bb) continue;
        if (timber) {
          // Solid timber has no web — v25BoltMemberWeb returns the full
          // breadth, so a click-centred band put the bearing plane ~half the
          // member away from the face. The head bears on the member's real
          // OUTLINE face: use the drawn extent along the screw axis.
          lo = axisIsU ? bb.L : bb.B; hi = axisIsU ? bb.R : bb.T;
        } else {
          lo = axisPos - tw / 2; hi = axisPos + tw / 2;
        }
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
  // Family routing: the resolved spec decides; an unresolvable VGS-shaped id
  // still routes VGS (with a representative fallback) so the glyph never flips
  // family on a catalogue miss.
  const vgs = (spec && spec.system === 'rothoblaas-vgs')
           || (!spec && typeof isVgsSpec === 'function' && isVgsSpec(ent.screwSpec));
  // Representative fallbacks so the UI never breaks on a bad/missing spec:
  // HBS → Ø10 × 120; VGS → Ø11 × 300 csk (the family default, V25_VGS_DEFAULT_SPEC).
  const S = spec || (vgs
    ? { system: 'rothoblaas-vgs', headType: 'csk', d: 11, L: 300, b: 290,
        dK: 19.3, t1: 8.2, dIn: 10.58, dU: 7.7,
        hRim: 1, hCone: 3.49, hRib: 3.71, hCham: 1,
        d2: 6.6, tip: 9.92, pitch: 4.8 }
    : { d: 10, d2: 6.6, dS: 7.2, dK: 16.5, t1: 16.5, tK: 5.0, L: 120, b: 95 });

  const col = (cs && typeof cs.getPropertyValue === 'function')
    ? ((cs.getPropertyValue('--screw-color').trim() || cs.getPropertyValue('--entity-color').trim()) || '#222')
    : '#222';
  const pm = (typeof ppm === 'function') ? ppm() : 1;

  const prevAlpha = ctx.globalAlpha;
  if (ent.opacity != null) ctx.globalAlpha = ent.opacity;
  ctx.save();
  if (vgs) drawVgs2D_Section(blk, ent, S, col, pm, orient);
  else     drawScrew2D_Section(blk, ent, S, col, pm, orient);
  ctx.restore();
  ctx.setLineDash([]);
  ctx.globalAlpha = prevAlpha;
  return true;
}

/* ---- Section profile (h-headL / h-headR / v-headT / v-headB) ----------------
 * Faithful to the Rothoblaas geometry diagram (DXF-traced): pan head + integral
 * washer collar (full dK — the widest feature) → bearing underside → under-head
 * neck (dUK) → cone to the smooth shank (dS) → threaded zone with DISTINCT teeth
 * (crest d1, root d2, two rows offset half a pitch = the helix) → 28° point.
 * Local axis s runs head-top (s=0) → tip apex (s=L); the COLLAR UNDERSIDE
 * (s=tK, the bearing plane) lands on the detected plate/member face, so the head
 * protrudes ~tK outside and the body embeds into the timber. Everything is built
 * in local (s,t) and mapped through P(s,t), so all four orientations share one
 * code path and the bearing-face snap keeps working.
 * -------------------------------------------------------------------------- */
function drawScrew2D_Section(blk, ent, S, col, pm, orient) {
  const axisIsU = (orient === 'h-headL' || orient === 'h-headR');
  const trans   = axisIsU ? ent.v : ent.u;            // transverse (centreline) coord
  const bodyDir = (orient === 'h-headL' || orient === 'v-headB') ? 1 : -1;

  // Catalogue geometry (mm). Crest pinned to nominal d; root/shank/neck/head/collar
  // come straight from the catalogue so each size is exact.
  const d   = S.d   || 10;
  const d2  = S.d2  || d * 0.74;
  const dS  = S.dS  || d * 0.79;
  const dK  = S.dK  || d * 1.69;
  const dUK = S.dUK || d * 1.25;
  const tK  = S.tK  || d * 0.56;
  const L   = S.L   || d * 12;
  const b   = S.b   || L * 0.78;
  const dKh = dK / 2, dUKh = dUK / 2, dSh = dS / 2, d2h = d2 / 2, dh = d / 2;

  const headLen = SCREW_GEOM.headLenNorm * d;                 // head-top → shank start
  const neckEnd = Math.min(SCREW_GEOM.neckEndNorm * d, headLen - 0.5);
  const tipLen  = SCREW_GEOM.tipLenNorm * d;
  const sBear   = Math.min(tK, headLen * 0.45);               // collar underside = bearing plane

  // s-stations (head-top origin).
  const sThread  = Math.max(headLen, L - b);                  // thread start (catalogue b)
  const sTipBase = Math.max(sThread + 0.5, L - tipLen);       // tip-cone base

  // The collar underside (s=tK) lands on the detected bearing face (or the click).
  const bearing  = v25ScrewBearingFace(blk, ent);
  const junction = (bearing != null) ? bearing : (axisIsU ? ent.u : ent.v);
  const axisAt = (s) => junction + bodyDir * (s - sBear);
  // NB: rPolygon/rFillPolygon (js/33) read points as [u,v] ARRAYS (pts[i][0/1]),
  // so P must return arrays — not {u,v} objects (which silently NaN out).
  const P = axisIsU ? (s, t) => [axisAt(s), trans + t]
                    : (s, t) => [trans + t, axisAt(s)];

  // HEAD half-profile (top edge), catalogue-pinned: pan/collar (full dK) → bearing
  // underside step → under-head neck (dUK) → cone to the shank (dS).
  const headTop = [
    { s: 0,       t: dKh },
    { s: tK,      t: dKh },
    { s: tK,      t: dUKh },     // bearing underside — the "head bears here" line
    { s: neckEnd, t: dUKh },
    { s: headLen, t: dSh },
  ];

  ctx.setLineDash([]);

  // (A) CENTRELINE first (under everything).
  {
    const a0 = axisAt(-2), aL = axisAt(L + 2);
    ctx.strokeStyle = colorAlpha(col, 0.5);
    ctx.lineWidth = Math.max(0.3, LW.CL * pm);
    ctx.setLineDash((typeof DASH !== 'undefined' && DASH.CL_BOLT) ? DASH.CL_BOLT : [8, 3, 2, 3]);
    if (axisIsU) rLine(blk, Math.min(a0, aL), trans, Math.max(a0, aL), trans);
    else         rLine(blk, trans, Math.min(a0, aL), trans, Math.max(a0, aL));
    ctx.setLineDash([]);
  }

  // (B) SOLID BODY ENVELOPE: head + smooth shank (dS) + thread core (d2) + tip cone.
  const bodyTop = headTop.concat([
    { s: sThread,  t: dSh },     // smooth shank at dS
    { s: sThread,  t: d2h },     // step in to the thread root core
    { s: sTipBase, t: d2h },     // root core to the tip base
    { s: L,        t: 0 },       // sharp apex
  ]);
  const bodyPts = bodyTop.map(p => P(p.s, p.t))
    .concat(bodyTop.slice().reverse().map(p => P(p.s, -p.t)));
  ctx.fillStyle = colorAlpha(col, 0.55);
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(0.4, LW.VIS * pm);
  rFillPolygon(blk, bodyPts);
  rPolygon(blk, bodyPts);

  // (C) THREAD TEETH — the structurally-critical embedment cue.
  drawScrewThread(blk, P, sThread, sTipBase, L, dh, d2h, d, col, pm);

  // (D) HEAD overlay — heavier outline (the dominant feature) + the collar
  //     bearing-underside line (the crispest line: where the head bears on steel).
  const headPts = headTop.map(p => P(p.s, p.t))
    .concat(headTop.slice().reverse().map(p => P(p.s, -p.t)));
  ctx.fillStyle = colorAlpha(col, 0.55);
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(0.5, LW.VIS_HEAVY * pm);
  rFillPolygon(blk, headPts);
  rPolygon(blk, headPts);
  const ba = P(tK, dUKh), bb = P(tK, -dUKh);
  ctx.lineWidth = Math.max(0.5, LW.VIS_HEAVY * pm);
  rLine(blk, ba[0], ba[1], bb[0], bb[1]);
}

/* ---- VGS section profile (h-headL / h-headR / v-headT / v-headB) ------------
 * Faithful to the manufacturer IFC head profile + catalogue p.166/168 (ETA-11/
 * 0030). VGS is FULLY THREADED — no smooth shank: head → short under-head neck
 * → chamfer into the thread-root core (d2) with standing teeth (crest d) all
 * the way to the tip cone. Two head families on the one code path:
 *
 *   csk (L ≤ 600) — countersunk head with ribs, TX drive. Catalogue L runs
 *     head-top → tip apex; the head seats FLUSH with the outer face, so the
 *     bearing plane is the HEAD TOP: sBear = 0. Half-profile: rim cylinder at
 *     dK (hRim) → 90° countersink cone dK→dIn (hCone) → ribbed cone dIn→dU
 *     (hRib; ends ≈ t1) → neck at dU → chamfer (hCham) to the thread root at
 *     sThread = L − b (ALWAYS catalogue L−b: 10 mm typ, 20 mm for Ø13 L ≥ 300).
 *
 *   hex (L > 600) — hex head + integral washer flange. Catalogue L runs from
 *     the UNDER-HEAD plane (flange top) → tip, so with s = 0 at the hex-head
 *     TOP the glyph is tS + L long and the bearing plane is the FLANGE
 *     UNDERSIDE: sBear = tS + tFl. Half-profile: hex rect (SW across-flats
 *     side view × tS, plus the two standard facet lines) → flange rect
 *     (dFl × tFl) → neck at dU → chamfer (hCham) to the thread root at
 *     sThread = tS + (L − b) (L−b = 20 for all hex).
 *
 * Same skeleton as drawScrew2D_Section: build in local (s,t), map through the
 * [u,v]-array P(s,t), share the centreline / body-envelope / thread / head-
 * overlay layering and lineweights, land the bearing plane on
 * v25ScrewBearingFace (unchanged). The crisp heavy bearing line runs across dK
 * at s = 0 (csk, the flush face) / across dFl at s = tS + tFl (hex).
 * -------------------------------------------------------------------------- */
function drawVgs2D_Section(blk, ent, S, col, pm, orient) {
  const axisIsU = (orient === 'h-headL' || orient === 'h-headR');
  const trans   = axisIsU ? ent.v : ent.u;            // transverse (centreline) coord
  const bodyDir = (orient === 'h-headL' || orient === 'v-headB') ? 1 : -1;

  const hex = (S.headType === 'hex');
  // Shared catalogue geometry (mm). Fallbacks are Ø11-representative only —
  // every real spec carries the exact values.
  const d   = S.d   || 11;
  const d2  = S.d2  || d * 0.6;
  const L   = S.L   || 300;
  const b   = S.b   || L - (hex ? 20 : 10);
  const tip = S.tip || d * 0.92;
  const dh = d / 2, d2h = d2 / 2;

  let sBear, sTot, sThread, sCham0, sTipBase, neckT, headTop;
  let SW = 0, tS = 0;                                  // hex facet-line geometry

  if (hex) {
    SW = S.SW || 17; tS = S.tS || 6.4;
    const dFl = S.dFl || 15.1, tFl = S.tFl || 2.0;
    const dU  = S.dU  || 13.3, hCham = S.hCham || 2.5;
    sBear    = tS + tFl;                               // flange underside bears on steel
    sTot     = tS + L;                                 // catalogue L is under-head → tip
    sThread  = Math.max(sBear, tS + (L - b));          // L−b = 20 for all hex
    sCham0   = Math.max(sBear, sThread - hCham);
    sTipBase = Math.max(sThread + 0.5, sTot - tip);
    neckT    = dU / 2;
    headTop = [
      { s: 0,     t: SW / 2 },                         // hex head, across-flats side view
      { s: tS,    t: SW / 2 },
      { s: tS,    t: dFl / 2 },                        // step to the washer flange
      { s: sBear, t: dFl / 2 },                        // flange underside = bearing plane
    ];
  } else {
    const dK = S.dK || 19.3, dIn = S.dIn || 10.58, dU = S.dU || 7.7;
    const hRim = S.hRim || 1, hCone = S.hCone || 3.49, hRib = S.hRib || 3.71;
    const hCham = S.hCham || 1;
    const headEnd = hRim + hCone + hRib;               // ≈ catalogue t1
    sBear    = 0;                                      // csk head seats FLUSH: head top
    sTot     = L;
    sThread  = Math.max(headEnd, L - b);               // ALWAYS catalogue L−b
    sCham0   = Math.max(headEnd, sThread - hCham);
    sTipBase = Math.max(sThread + 0.5, L - tip);
    neckT    = dU / 2;
    headTop = [
      { s: 0,            t: dK / 2 },
      { s: hRim,         t: dK / 2 },                  // rim cylinder
      { s: hRim + hCone, t: dIn / 2 },                 // 90° countersink cone
      { s: headEnd,      t: dU / 2 },                  // ribbed cone → under-head neck
    ];
  }

  // The bearing plane (s = sBear) lands on the detected face (or the click).
  const bearing  = v25ScrewBearingFace(blk, ent);
  const junction = (bearing != null) ? bearing : (axisIsU ? ent.u : ent.v);
  const axisAt = (s) => junction + bodyDir * (s - sBear);
  // NB: rPolygon/rFillPolygon (js/33) read points as [u,v] ARRAYS (pts[i][0/1]),
  // so P must return arrays — not {u,v} objects (which silently NaN out).
  const P = axisIsU ? (s, t) => [axisAt(s), trans + t]
                    : (s, t) => [trans + t, axisAt(s)];

  ctx.setLineDash([]);

  // (A) CENTRELINE first (under everything).
  {
    const a0 = axisAt(-2), aL = axisAt(sTot + 2);
    ctx.strokeStyle = colorAlpha(col, 0.5);
    ctx.lineWidth = Math.max(0.3, LW.CL * pm);
    ctx.setLineDash((typeof DASH !== 'undefined' && DASH.CL_BOLT) ? DASH.CL_BOLT : [8, 3, 2, 3]);
    if (axisIsU) rLine(blk, Math.min(a0, aL), trans, Math.max(a0, aL), trans);
    else         rLine(blk, trans, Math.min(a0, aL), trans, Math.max(a0, aL));
    ctx.setLineDash([]);
  }

  // (B) SOLID BODY ENVELOPE: head + neck + thread-root core (d2) + tip cone.
  // hex needs the vertical step from the flange underside (dFl/2) into the
  // neck (dU/2); the csk headTop already ends at the neck diameter.
  const neckStations = hex
    ? [ { s: sBear,  t: neckT },
        { s: sCham0, t: neckT } ]
    : [ { s: sCham0, t: neckT } ];
  const bodyTop = headTop.concat(neckStations, [
    { s: sThread,  t: d2h },     // chamfer into the thread-root core
    { s: sTipBase, t: d2h },     // fully threaded — root core straight to the tip base
    { s: sTot,     t: 0 },       // tip apex
  ]);
  const bodyPts = bodyTop.map(p => P(p.s, p.t))
    .concat(bodyTop.slice().reverse().map(p => P(p.s, -p.t)));
  ctx.fillStyle = colorAlpha(col, 0.55);
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(0.4, LW.VIS * pm);
  rFillPolygon(blk, bodyPts);
  rPolygon(blk, bodyPts);

  // (C) THREAD TEETH — the structurally-critical embedment cue. Catalogue pitch
  //     (exaggerated to ≥1.6 mm-on-paper inside drawScrewThread).
  drawScrewThread(blk, P, sThread, sTipBase, sTot, dh, d2h, d, col, pm, S.pitch);

  // (D) HEAD overlay — heavier outline (the dominant feature) + the crisp heavy
  //     bearing line across the bearing plane (dK at the flush csk face; dFl at
  //     the hex flange underside).
  const headPts = headTop.map(p => P(p.s, p.t))
    .concat(headTop.slice().reverse().map(p => P(p.s, -p.t)));
  ctx.fillStyle = colorAlpha(col, 0.55);
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(0.5, LW.VIS_HEAVY * pm);
  rFillPolygon(blk, headPts);
  rPolygon(blk, headPts);
  if (hex) {
    // The two standard hex facet lines (verticals at ±SW/4, head top → bottom)
    // so the across-flats rectangle reads as a hex.
    ctx.lineWidth = Math.max(0.4, LW.VIS * pm);
    const f1a = P(0, SW / 4), f1b = P(tS, SW / 4);
    const f2a = P(0, -SW / 4), f2b = P(tS, -SW / 4);
    rLine(blk, f1a[0], f1a[1], f1b[0], f1b[1]);
    rLine(blk, f2a[0], f2a[1], f2b[0], f2b[1]);
  }
  const bearHalf = hex ? ((S.dFl || 15.1) / 2) : ((S.dK || 19.3) / 2);
  const ba = P(sBear, bearHalf), bb = P(sBear, -bearHalf);
  ctx.lineWidth = Math.max(0.5, LW.VIS_HEAVY * pm);
  rLine(blk, ba[0], ba[1], bb[0], bb[1]);
}

/* ---- drawScrewThread — distinct standing thread teeth -----------------------
 * Crest at d1/2, root at d2/2. Two rows of FILLED triangular teeth, the bottom
 * row offset half a pitch (the true-helix signature that reads as a screw, not a
 * knurl), plus one subordinate helix diagonal per pitch leaning toward the tip.
 * Teeth fade into the tip cone. Pitch is exaggerated to a min-legible value at
 * coarse scales (mirrors the bolt-thread exaggeration) so the teeth never collapse
 * to grey fuzz. Built in local (s,t) and mapped through P for every orientation.
 * pitchMm (optional): catalogue pitch override — the VGS path passes S.pitch;
 * omitted, the HBS_THREAD_PITCH lookup applies (original behaviour).
 * -------------------------------------------------------------------------- */
function drawScrewThread(blk, P, sThread, sTipBase, sTip, crest, root, d, col, pm, pitchMm) {
  if (sTipBase - sThread <= 0.5) return;
  const cat = (pitchMm != null && pitchMm > 0) ? pitchMm
    : ((typeof HBS_THREAD_PITCH === 'object' && HBS_THREAD_PITCH[Math.round(d)]) || 0.5 * d);
  const ds = (typeof drawingScale !== 'undefined' && drawingScale) ? drawingScale : 1;
  const pitch = Math.max(cat, 1.6 * ds);              // ≥1.6 mm on paper at any scale
  const half = pitch / 2;
  const nMax = Math.ceil((sTip - sThread) / pitch) + 4;
  // crest/root taper linearly to 0 over the tip cone so teeth shrink into the point.
  const hAt = (s, base) => (s <= sTipBase) ? base
    : base * Math.max(0, (sTip - s) / Math.max(0.5, sTip - sTipBase));

  ctx.setLineDash([]);

  // Two rows of filled triangular teeth (adjacent teeth share the root point →
  // continuous sawtooth); bottom row offset half a pitch for the helix read.
  const row = (sign, off) => {
    ctx.fillStyle = colorAlpha(col, 0.55);
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(0.4, LW.VIS * pm);
    for (let n = 0; n <= nMax; n++) {
      const sPk = sThread + off + n * pitch;
      if (sPk >= sTip - 0.3) break;
      const cr = hAt(sPk, crest), ro = hAt(sPk, root);
      if (cr - ro < 0.2) continue;
      // Asymmetric tooth leaning toward the tip (long head-side flank, short
      // tip-side flank) — the coarse timber-screw look in the geometry diagram.
      const f1 = Math.max(sThread, sPk - pitch * 0.6), f2 = Math.min(sTip, sPk + pitch * 0.4);
      const tri = [P(f1, sign * ro), P(sPk, sign * cr), P(f2, sign * ro)];
      rFillPolygon(blk, tri);
      rPolygon(blk, tri);
    }
  };
  row(1, 0);
  row(-1, half);

  // Helix diagonals — one per pitch, leaning toward the tip (subtle: the back of
  // the helix seen through, subordinate to the teeth so it doesn't clutter).
  ctx.strokeStyle = colorAlpha(col, 0.28);
  ctx.lineWidth = Math.max(0.25, LW.HID * pm * 0.8);
  for (let n = 0; n <= nMax; n++) {
    const sd = sThread + half * 0.5 + n * pitch;
    if (sd >= sTipBase - 0.3) break;
    const p1 = P(sd, root), p2 = P(sd + half * 0.7, -root);
    rLine(blk, p1[0], p1[1], p2[0], p2[1]);
  }
}
