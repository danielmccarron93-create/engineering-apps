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
 * v25BuildStudOrientRowForEnt(ent) → HTMLDivElement
 * Like v25BuildStudOrientationRow, but edits the ORIENTATION OF A SELECTED stud
 * (writes ent.studOrient) rather than the placement state — used by the
 * selected-stud options bar + inspector. Re-renders and refreshes both surfaces.
 * -------------------------------------------------------------------------- */
function v25BuildStudOrientRowForEnt(ent) {
  const row = document.createElement('div');
  row.id = 'v25OrientRow';
  const activeId = ent.studOrient || 'v-nutT';
  V25_STUD_ORIENT.forEach(preset => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'v25-orient-btn' + (preset.id === activeId ? ' active' : '');
    btn.title = preset.label;
    btn.setAttribute('aria-label', preset.label);
    btn.innerHTML = '<svg class="icon"><use href="#' + preset.icon + '"/></svg>';
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      ent.studOrient = preset.id;
      if (typeof requestRender === 'function') requestRender();
      if (typeof v25UpdateOptionsBar === 'function') v25UpdateOptionsBar();
      if (typeof v25UpdateInspector === 'function') v25UpdateInspector();
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
  // Block guard — this scans entities2D[blk.viewKey]; the no-block selection
  // helpers (v25EntBounds etc.) must never make it throw (PDF export runs
  // render() with activeBlock===null). Null block ⇒ no snap.
  if (!blk || !blk.viewKey) return null;
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
 * studSectionGeom(blk, ent) → geometry bundle | null  (SINGLE SOURCE OF TRUTH)
 * ----------------------------------------------------------------------------
 * Every consumer of a SECTION stud's drawn geometry — the drawer, the DXF
 * emitter, the precise hit-test, the hover centreline, the selection footprint
 * and the drag grips — reads from here, so the glyph, pick, highlight and export
 * can never drift. Returns null for end-on / non-stud. Tolerates a null block
 * (snap=null, geometry centred on ent.u/ent.v) so the no-block selection helpers
 * never throw.
 *
 * Embedment is user-overridable via two optional entity fields:
 *   ent.embedDepth — bonded length below the embedment-edge datum (the user's
 *                    "embedment depth"). Unset ⇒ legacyEmbLen − sFace, which
 *                    reproduces today's catalogue geometry byte-for-byte (the
 *                    tip lands on the same Le as before) for EVERY size and in
 *                    both the no-host and snapped cases — zero regression.
 *   ent.faceOffset — distance from the bearing plane (s=0) down to the embedment
 *                    edge (s=sFace). Unset ⇒ detected fixture thickness, else the
 *                    catalogue maxFixt (today's behaviour).
 * ========================================================================== */
function studSectionGeom(blk, ent) {
  const orient = (ent && ent.studOrient) || 'v-nutT';
  if (orient === 'end') return null;

  const spec = (typeof getStudSpec === 'function')
             ? getStudSpec(ent.studSpec)
             : (typeof CHEMSET_STUDS === 'object' ? CHEMSET_STUDS[ent.studSpec] : null);
  const S = spec || { size: 'M16', d: 16, L: 190, Le: 165, maxFixt: 40, dh: 18, embed: 125 };

  const d   = S.d || 16;
  const L   = S.L || d * 12;
  const Le  = S.Le || L * 0.87;
  const dh  = S.dh || d + 2;
  const maxFixt = (S.maxFixt != null) ? S.maxFixt : Math.max(0, Le - (S.embed || Le * 0.75));
  const nd  = (typeof studDims === 'function') ? studDims(S.size, d)
            : { nutAF: d * 1.7, nutH: d * 0.86, washOD: d * 2.1, washT: d * 0.2, minorD: d * 0.84, pitch: Math.max(1, 0.13 * d) };
  const nutAF = nd.nutAF || d * 1.7, nutH = nd.nutH || d * 0.86;
  const washOD = nd.washOD || d * 2.1, washT = nd.washT || d * 0.2;
  const minorD = nd.minorD || d * 0.84, pitch = nd.pitch || Math.max(1, 0.13 * d);

  const axisIsU = (orient === 'h-nutL' || orient === 'h-nutR');
  const trans   = axisIsU ? ent.v : ent.u;
  const bodyDir = (orient === 'h-nutL' || orient === 'v-nutB') ? 1 : -1;

  const snap = blk ? v25StudBearingFace(blk, ent) : null;
  const junction = snap ? snap.face : (axisIsU ? ent.u : ent.v);

  // Projection stack (above the bearing plane) — catalogue-pinned, independent
  // of the embedment override.
  const tail = Math.max(2 * pitch, (L - Le) - (washT + nutH));
  const sTailTop  = -(washT + nutH + tail);
  const sNutCrown = -(washT + nutH);
  const sNutWash  = -washT;
  // Today's embedded length (== Le for every catalogue size) — the back-compat anchor.
  const legacyEmbLen = Math.max(d + 2, L - (washT + nutH + tail));

  // Embedment edge datum + bonded depth (both user-overridable).
  let sFace = (ent.faceOffset != null) ? Math.max(0, ent.faceOffset)
            : (snap ? Math.max(0, snap.fixtureThk) : maxFixt);
  const embedDepth = (ent.embedDepth != null && ent.embedDepth > 0)
            ? ent.embedDepth
            : Math.max(d + 2, legacyEmbLen - sFace);   // unset ⇒ reproduces legacyEmbLen
  let embLen = Math.max(d + 2, sFace + embedDepth);
  sFace = Math.min(sFace, Math.max(0, embLen - 0.5));   // always keep a bond region
  const sChiselBase = embLen - d;                       // 45° bevel rises d over run d

  const axisAt = (s) => junction + bodyDir * s;
  // NB: rPolygon/rFillPolygon read points as [u,v] ARRAYS — Puv returns arrays.
  const Puv = axisIsU ? (s, t) => [axisAt(s), trans + t]
                      : (s, t) => [trans + t, axisAt(s)];

  return {
    S, d, L, Le, dh, maxFixt, nd, nutAF, nutH, washOD, washT, minorD, pitch,
    axisIsU, trans, bodyDir, snap, junction, tail,
    sTailTop, sNutCrown, sNutWash, legacyEmbLen, sFace, embedDepth, embLen, sChiselBase,
    axisAt, Puv, washHalf: washOD / 2, nutHalf: nutAF / 2, dh2: d / 2, hole2: dh / 2,
  };
}

/* ============================================================================
 * v25StudEdgeSnap(blk, ent, g, sCand) → snapped s | null
 * ----------------------------------------------------------------------------
 * When the user drags the embedment-edge grip, snap the edge datum to a nearby
 * host face crossing the stud axis — so it can land on top-of-grout, top-of-
 * blockwork, a plate underside, etc. v25StudBearingFace only sees mem2/plate2,
 * but grout/blockwork are mat/blockWall entities, so this does its OWN host
 * detection over mem2/mat/blockWall/plate2 using the snap-independent
 * v25EntBounds. Both axis-faces of each spanning host are candidates (so you can
 * drop the edge from the top of a pad to its underside). Wins over grid-snap.
 * ========================================================================== */
function v25StudEdgeSnap(blk, ent, g, sCand) {
  if (!blk || !g) return null;
  const list = (typeof entities2D !== 'undefined' && entities2D[blk.viewKey]) || [];
  const axisIsU = g.axisIsU, junction = g.junction, bodyDir = g.bodyDir, trans = g.trans;
  const ppmm = (typeof viewport === 'object' && viewport.zoom && typeof drawingScale !== 'undefined' && drawingScale)
             ? (viewport.zoom / drawingScale) : 1;
  const tol = 10 / ppmm;                                 // 10 screen-px in real mm
  let best = null, bestD = tol;
  for (const e of list) {
    if (!e || e === ent) continue;
    if (e.type !== 'mem2' && e.type !== 'mat' && e.type !== 'blockWall' && e.type !== 'plate2') continue;
    const bb = (typeof v25EntBounds === 'function') ? v25EntBounds(e) : null;
    if (!bb) continue;
    const tLo = axisIsU ? bb.B : bb.L, tHi = axisIsU ? bb.T : bb.R;     // transverse extent
    if (trans < tLo - 1 || trans > tHi + 1) continue;                  // axis must cross the host
    const faces = axisIsU ? [bb.L, bb.R] : [bb.B, bb.T];                // both axis-faces
    for (const f of faces) {
      const s = (f - junction) * bodyDir;
      if (s < -2) continue;                                            // only at/below the bearing plane
      const dd = Math.abs(s - sCand);
      if (dd < bestD) { bestD = dd; best = s; }
    }
  }
  return best;
}

/* ============================================================================
 * v25SyncStudEmbedReadouts(ent, blk) — push the LIVE embedment numbers into the
 * top options-bar input + the inspector fields WITHOUT rebuilding either (a
 * rebuild would steal focus mid-type / interrupt a drag). Reads the effective
 * geometry so the displayed numbers always match the drawn rod; skips whichever
 * input is currently focused so it never fights the user's typing.
 * ========================================================================== */
function v25SyncStudEmbedReadouts(ent, blk) {
  if (!ent || ent.type !== 'stud' || typeof document === 'undefined') return;
  const g = (typeof studSectionGeom === 'function')
    ? studSectionGeom(blk || (typeof activeBlock !== 'undefined' ? activeBlock : null), ent)
    : null;
  if (!g) return;
  const active = document.activeElement;
  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el && el !== active) el.value = Math.round(v);
  };
  set('v25o-selstud-embed', g.embedDepth);   // top options bar
  set('v25-fld-embedDepth', g.embedDepth);   // inspector
  set('v25-fld-faceOffset', g.sFace);        // inspector (edge offset)
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
  // All geometry (incl. the user embedment override + bearing snap) comes from
  // the single-source helper, so the glyph, hit-test, footprint, DXF and grips
  // never drift.
  const g = (typeof studSectionGeom === 'function') ? studSectionGeom(blk, ent) : null;
  if (!g) return;   // end-on is dispatched to drawStud2D_End by drawStud2D

  const axisIsU = g.axisIsU, trans = g.trans;
  const minorD = g.minorD, pitch = g.pitch;
  const dh2 = g.dh2, hole2 = g.hole2, washHalf = g.washHalf, nutHalf = g.nutHalf;
  const sTailTop = g.sTailTop, sNutCrown = g.sNutCrown, sNutWash = g.sNutWash;
  const sFace = g.sFace, embLen = g.embLen, sChiselBase = g.sChiselBase;
  const snap = g.snap, junction = g.junction, axisAt = g.axisAt, P = g.Puv;

  // Axis-aligned rect helper in (u,v) from an s-interval × ±half transverse.
  const rectFor = (sA, sB, half) => {
    const a = axisAt(sA), b = axisAt(sB);
    if (axisIsU) return [Math.min(a, b), trans - half, Math.abs(b - a), half * 2];
    return [trans - half, Math.min(a, b), half * 2, Math.abs(b - a)];
  };

  ctx.setLineDash([]);

  // Two-tone by the DRILLING DATUM (the embedment-edge node at sFace):
  //   STEEL  — solid dark fill ABOVE the datum: head (nut + washer) + the shaft
  //            passing through the grout / fixture (NOT drilled). Reads as steel.
  //   EPOXY  — light fill BELOW the datum: the drill hole + adhesive bond zone,
  //            i.e. the embedment depth the builder actually drills.
  const STEEL = 0.62, EPOXY = 0.13;

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

  // (C) ROD — DARK STEEL above the drilling datum (head + fixture shaft), light /
  //     outline-only through the drilled bond zone so the adhesive hatch reads.
  // (C1) Upper rod (projection tail + fixture shaft, down to the datum) — solid steel.
  const upperTop = sTailTop, upperBot = Math.max(sFace, sNutWash);
  const up = [P(upperTop, dh2), P(upperBot, dh2), P(upperBot, -dh2), P(upperTop, -dh2)];
  ctx.fillStyle = colorAlpha(col, STEEL);
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(0.4, LW.VIS * pm);
  rFillPolygon(blk, up);
  rPolygon(blk, up);

  // (C2) Lower rod (drilled embedment) — light fill so the epoxy hatch reads.
  const low = [
    P(upperBot, dh2), P(embLen, dh2), P(sChiselBase, -dh2), P(upperBot, -dh2),
  ];
  ctx.fillStyle = colorAlpha(col, EPOXY);
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
  //     The fixture shaft (datum → bearing) is drawn as SOLID steel (no thread),
  //     so the thread runs the exposed tail + the DRILLED bond zone only — which
  //     keeps the dark-steel-above / threaded-epoxy-below read crisp.
  drawStudThread(blk, P, sTailTop, sNutCrown, dh2, minorD / 2, pitch, col, pm);
  drawStudThread(blk, P, sFace, sChiselBase, dh2, minorD / 2, pitch, col, pm);

  // (E) DRILLING DATUM — the embedment-ZERO line: where the drill hole + epoxy
  //     bond begins (the draggable edge node). A crisp transverse line across the
  //     hole width + short outward ticks, so the dark steel above reads as the
  //     fixture/grout shaft and the hatched zone below as the drilled depth.
  //     Always drawn (the datum is meaningful even with no detected host).
  {
    ctx.strokeStyle = colorAlpha(col, 0.85);
    ctx.lineWidth = Math.max(0.5, LW.VIS * pm);
    const d1 = P(sFace, hole2), d2 = P(sFace, -hole2);
    rLine(blk, d1[0], d1[1], d2[0], d2[1]);
    ctx.lineWidth = Math.max(0.25, LW.HID * pm);
    const m1a = P(sFace, hole2), m1b = P(sFace, hole2 + 2.5);
    const m2a = P(sFace, -hole2), m2b = P(sFace, -(hole2 + 2.5));
    rLine(blk, m1a[0], m1a[1], m1b[0], m1b[1]);
    rLine(blk, m2a[0], m2a[1], m2b[0], m2b[1]);
  }

  // (F) WASHER (plain) — touching the bearing plane, solid steel (head).
  ctx.setLineDash([]);
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(0.5, LW.VIS * pm);
  ctx.fillStyle = colorAlpha(col, STEEL);
  const wr = rectFor(sNutWash, 0, washHalf);
  rFillRect(blk, wr[0], wr[1], wr[2], wr[3]);
  rRect(blk, wr[0], wr[1], wr[2], wr[3]);

  // (G) HEX NUT — chamfered, crown outward. Reuses the bolt hex helpers.
  const aCrown = axisAt(sNutCrown), aFlat = axisAt(sNutWash);
  const nutPts = axisIsU ? hexPointsAlongU(trans, aCrown, aFlat, nutHalf)
                         : hexPointsAlongV(trans, aCrown, aFlat, nutHalf);
  ctx.fillStyle = colorAlpha(col, STEEL);
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
