'use strict';

/* ============================================================================
 * 72c-v25-bolt.js — V25 2D-mode (paper-space) bolt entity: render + tool wiring
 * ----------------------------------------------------------------------------
 * Band-9 (V25 2D-mode core). Sibling of 72b-orientation-presets.js. Loaded in
 * index.html AFTER 72b and BEFORE 73-init.js (classic <script>, per-file strict;
 * globals flow between files — no import/export).
 *
 * What this file owns:
 *   - V25_BOLT_ORIENT          — the 5 orientation presets for a 2D bolt glyph.
 *   - v25BuildBoltOrientationRow() — the live icon-button row for the options bar
 *                                  (mirror of v25BuildOrientationRow in 72b).
 *   - v25PickAndSetBolt(size)  — arm the 'v25-bolt' tool from a palette tile.
 *   - drawBolt2D(blk, ent, cs) — the AS 1100 bolt glyph renderer (end-on +
 *                                horizontal/vertical section), dispatched from
 *                                v25DrawEnt in 69-v25-dispatch.js.
 *   - v25BoltClampSpan(blk, ent) — auto-detect clamped material thickness at the
 *                                bolt location (members via v25Mem2Thickness, v2
 *                                plate mirrors via .pt/.thk), → grip + centre +
 *                                AS-1252 standard length via computeBoltLength.
 *
 * The 2D bolt mirrors the 3D gold-standard section layout
 * (_drawBoltSectionA_V14 / _drawBoltPlanB_V14 in 33-draw-bolt.js): head |
 * headWasher | grip | nutWasher | nut | threadProtrusion, grip-centred — but
 * works purely from ent.u/ent.v paper coords, never touching objects3D. This is
 * 2D-mode v1; it does NOT touch 3D-mode drawBolt nor the dormant v2 bolt path.
 *
 * Quality bar: STP Typical Structural Details p85 (6011.x). AS 1100 lineweights
 * via the LW constant only; bolt centreline dash via DASH.CL_BOLT.
 * ============================================================================ */

/* ---- Orientation presets (one per icon-bank symbol in index.html) ---------- */
const V25_BOLT_ORIENT = [
  { id: 'end',    label: 'End-on (circle)',       icon: 'icon-orient-bolt-end' },
  { id: 'h-nutR', label: 'Horizontal — nut right', icon: 'icon-orient-bolt-h-nutr' },
  { id: 'h-nutL', label: 'Horizontal — nut left',  icon: 'icon-orient-bolt-h-nutl' },
  { id: 'v-nutB', label: 'Vertical — nut bottom',  icon: 'icon-orient-bolt-v-nutb' },
  { id: 'v-nutT', label: 'Vertical — nut top',     icon: 'icon-orient-bolt-v-nutt' },
];

/* ----------------------------------------------------------------------------
 * v25BuildBoltOrientationRow() → HTMLDivElement
 * Live element (carries click handlers, so it can't be serialised into the
 * options-bar innerHTML string). Mirrors v25BuildOrientationRow in 72b:
 * reuses #v25OrientRow + .v25-orient-btn CSS (only one row shows at a time).
 * -------------------------------------------------------------------------- */
function v25BuildBoltOrientationRow() {
  const row = document.createElement('div');
  row.id = 'v25OrientRow';

  // Active id: live tool state, then last-used memory, then 'end'.
  let activeId = 'end';
  if (typeof v25State !== 'undefined' && v25State && v25State.boltOrient) {
    activeId = v25State.boltOrient;
  } else if (typeof lastUsedOrientation !== 'undefined' && lastUsedOrientation && lastUsedOrientation.bolt) {
    activeId = lastUsedOrientation.bolt;
  }

  V25_BOLT_ORIENT.forEach(preset => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'v25-orient-btn' + (preset.id === activeId ? ' active' : '');
    btn.title = preset.label;
    btn.setAttribute('aria-label', preset.label);
    btn.innerHTML = '<svg class="icon"><use href="#' + preset.icon + '"/></svg>';
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (typeof v25State !== 'undefined' && v25State) v25State.boltOrient = preset.id;
      if (typeof lastUsedOrientation !== 'undefined' && lastUsedOrientation) {
        lastUsedOrientation.bolt = preset.id;
      }
      if (typeof v25UpdateOptionsBar === 'function') v25UpdateOptionsBar();
      if (typeof requestRender === 'function') requestRender();
    });
    row.appendChild(btn);
  });

  return row;
}

/* ----------------------------------------------------------------------------
 * v25PickAndSetBolt(size) — arm the 'v25-bolt' tool from a BB-rail / palette tile.
 * Establishes bolt placement state, restores the last-used orientation, and
 * refreshes the options bar (which renders the orientation row) + canvas.
 * -------------------------------------------------------------------------- */
function v25PickAndSetBolt(size) {
  const sz = size
    || (typeof lastUsedSection !== 'undefined' && lastUsedSection && lastUsedSection.bolt)
    || 'M20';

  if (typeof v25State !== 'undefined' && v25State) {
    v25State.boltSize  = sz;
    v25State.boltType  = 'bolt2';
    v25State.boltGrade = v25State.boltGrade || '8.8';
    v25State.boltCat   = v25State.boltCat   || 'S';
    // Restore last-used orientation (default end-on).
    v25State.boltOrient =
      (typeof lastUsedOrientation !== 'undefined' && lastUsedOrientation && lastUsedOrientation.bolt)
        ? lastUsedOrientation.bolt
        : (v25State.boltOrient || 'end');
  }

  if (typeof lastUsedSection !== 'undefined' && lastUsedSection) lastUsedSection.bolt = sz;

  // Arm the tool — prefer the shared setter, else set the global + refresh.
  if (typeof v25SetTool === 'function') {
    v25SetTool('v25-bolt');
  } else if (typeof tool !== 'undefined') {
    tool = 'v25-bolt'; // eslint-disable-line no-global-assign
  }

  if (typeof v25UpdateOptionsBar === 'function') v25UpdateOptionsBar();
  if (typeof highlightActiveTile === 'function') highlightActiveTile();
  if (typeof requestRender === 'function') requestRender();
}

/* ----------------------------------------------------------------------------
 * v25BoltMemberWeb(ent) — the WEB / WALL thickness a bolt clamps through.
 * Do NOT use v25Mem2Thickness here: it is defined twice in 68-v25-tools.js and
 * the live (2nd) definition returns the FLANGE tf for I-sections — wrong for a
 * web bolt. Read the catalogue web/wall directly (UC & WB are merged into
 * UB_DB by 03-data-bolts.js).
 * -------------------------------------------------------------------------- */
function v25BoltMemberWeb(ent) {
  if (!ent) return 10;
  const s = ent.section, mt = ent.memberType;
  if (mt === 'ub' || mt === 'uc' || mt === 'wb') {
    const db = (typeof UB_DB !== 'undefined' && UB_DB[s]) ? UB_DB[s]
             : (typeof UC_DB !== 'undefined' && UC_DB[s]) ? UC_DB[s] : null;
    return (db && db.tw) ? db.tw : 10;
  }
  if (mt === 'pfc' && typeof PFC_DB !== 'undefined' && PFC_DB[s]) return PFC_DB[s].tw || 10;
  if (mt === 'shs' && typeof SHS_DB !== 'undefined' && SHS_DB[s]) return SHS_DB[s].t || 10;
  if (mt === 'rhs' && typeof RHS_DB !== 'undefined' && RHS_DB[s]) return RHS_DB[s].t || 10;
  if (mt === 'chs' && typeof CHS_DB !== 'undefined' && CHS_DB[s]) return CHS_DB[s].t || 10;
  return (typeof v25Mem2Thickness === 'function') ? v25Mem2Thickness(ent) : 10;
}

/* ============================================================================
 * v25BoltClampSpan(blk, ent) → { grip, centre, length, threadProt } | null
 * ----------------------------------------------------------------------------
 * Auto-detect the thickness of material clamped at the bolt location so the
 * section glyph is grip-centred and the length snaps to an AS 1252 standard.
 *   - end-on view: returns null (no axial layout).
 *   - gripOverride set: used directly (inspector manual override).
 *   - otherwise: scans entities2D[viewKey] for mem2 / v2-plate that straddle the
 *     bolt's transverse position and overlap its axial position, sums their
 *     thicknesses → grip, centroid → centre.
 * ========================================================================== */
function v25BoltClampSpan(blk, ent) {
  if (!ent || ent.boltOrient === 'end') return null;

  const b = (typeof BOLT_DB !== 'undefined' && BOLT_DB[ent.size]) ||
            (typeof BOLT_DB !== 'undefined' && BOLT_DB.M20) ||
            { d: 20, pitch: 2.5, washT: 4, nutH: 16 };

  const horiz = (ent.boltOrient === 'h-nutR' || ent.boltOrient === 'h-nutL');
  // axis = the direction the bolt shank runs; transverse = perpendicular.
  const axisIsU = horiz;
  const axisPos = axisIsU ? ent.u : ent.v;          // bolt centre along its axis
  const transPos = axisIsU ? ent.v : ent.u;         // perpendicular position

  const finish = (grip, centre) => {
    const length = (typeof computeBoltLength === 'function')
      ? computeBoltLength(grip, ent.size)
      : grip + 2 * (b.washT || 4) + (b.nutH || 16) + 2 * (b.pitch || 2.5);
    const stack = grip + 2 * (b.washT || 4) + (b.nutH || 16);
    const threadProt = Math.max(2 * (b.pitch || 2.5), length - stack);
    return { grip, centre, length, threadProt };
  };

  // Manual override bypass.
  if (ent.gripOverride != null && !isNaN(ent.gripOverride)) {
    return finish(ent.gripOverride, axisPos);
  }

  // --- Collect the material the bolt passes through as FACE INTERVALS along
  // the bolt axis (mirrors the 3D computeBoltGripInfo zMin/zMax method in
  // js/21). grip then spans the outermost head-side face to the outermost
  // nut-side face, so the washers land on the real plate face AND the member's
  // outer web face — even across an adjacent plate + web stack. ---
  const WINDOW = 400;                                 // mm — localise to the connection at the click
  const list = (typeof entities2D !== 'undefined' && entities2D[blk.viewKey]) || [];
  const intervals = [];

  const bboxFromPts = (pts) => {
    let L = Infinity, R = -Infinity, B = Infinity, T = -Infinity;
    for (const p of pts) {
      const pu = (p.u != null) ? p.u : p.x, pv = (p.v != null) ? p.v : p.y;
      if (pu < L) L = pu; if (pu > R) R = pu;
      if (pv < B) B = pv; if (pv > T) T = pv;
    }
    return { L, R, B, T };
  };

  for (const e of list) {
    if (!e || e === ent) continue;
    let lo, hi, tLo, tHi;                               // axial interval + transverse extent

    if (e.type === 'plate2' && Array.isArray(e.pts) && e.pts.length >= 3) {
      // v2 plate mirror (cleat / gusset / endplate). Edge-on (a cleat) → the
      // drawn footprint along the axis IS the material thickness, so the washer
      // lands exactly on the plate face. Flat (large face) → clamp the nominal
      // thickness at the bolt location instead of the whole face width.
      const bb = bboxFromPts(e.pts);
      const thk = e.thk || e.pt || 10;
      const axLo = axisIsU ? bb.L : bb.B, axHi = axisIsU ? bb.R : bb.T;
      tLo = axisIsU ? bb.B : bb.L; tHi = axisIsU ? bb.T : bb.R;
      if ((axHi - axLo) <= Math.max(thk * 2.5, thk + 6)) { lo = axLo; hi = axHi; }   // edge-on cleat
      else { lo = axisPos - thk / 2; hi = axisPos + thk / 2; }                        // flat plate
    } else if (e.type === 'mem2') {
      const tw = v25BoltMemberWeb(e);
      if (!(tw > 0)) continue;
      const hd = (typeof v25Mem2HalfDepth === 'function') ? v25Mem2HalfDepth(e) : 50;
      if ((e.aspect || 'elev') === 'sec') {
        // Section glyph centred on (e.u, e.v): the web is a band of tw at the
        // member centre; transverse extent is the section half-depth.
        const c  = axisIsU ? e.u : e.v;
        const tc = axisIsU ? e.v : e.u;
        lo = c - tw / 2; hi = c + tw / 2;
        tLo = tc - hd;   tHi = tc + hd;
      } else {
        // Elevation member: the web runs into the page uniformly along the
        // member, so clamp tw AT the bolt location; transverse extent = bbox.
        const bb = (typeof v25EntBounds === 'function') ? v25EntBounds(e) : null;
        if (!bb) continue;
        lo = axisPos - tw / 2; hi = axisPos + tw / 2;
        tLo = axisIsU ? bb.B : bb.L; tHi = axisIsU ? bb.T : bb.R;
      }
    } else {
      continue;
    }

    // The bolt ray (at transPos) must pass through the entity transversely, and
    // the material must sit near the click along the axis (one connection).
    if (transPos < tLo || transPos > tHi) continue;
    const mid = (lo + hi) / 2;
    if (Math.abs(mid - axisPos) > WINDOW) continue;
    intervals.push([Math.min(lo, hi), Math.max(lo, hi)]);
  }

  if (!intervals.length) {
    return finish(20, axisPos);                         // nothing found → default grip
  }
  let lo = Infinity, hi = -Infinity;
  for (const iv of intervals) { if (iv[0] < lo) lo = iv[0]; if (iv[1] > hi) hi = iv[1]; }
  return finish(hi - lo, (lo + hi) / 2);
}

/* ============================================================================
 * drawBolt2D(blk, ent, cs) — paper-space bolt glyph renderer.
 * Dispatched from v25DrawEnt (69-v25-dispatch.js) for ent.type === 'bolt2'.
 * ========================================================================== */
function drawBolt2D(blk, ent, cs) {
  const b = (typeof BOLT_DB !== 'undefined' && (BOLT_DB[ent.size] || BOLT_DB.M20)) ||
            { d: 20, pitch: 2.5, headAF: 30, headH: 13, nutAF: 30, nutH: 16,
              washOD: 37, washT: 4, minorD: 17.29, threadL: 46 };
  const col = (cs && typeof cs.getPropertyValue === 'function')
    ? (cs.getPropertyValue('--entity-color').trim() || '#222')
    : '#222';
  const pm = (typeof ppm === 'function') ? ppm() : 1;

  const prevAlpha = ctx.globalAlpha;
  if (ent.opacity != null) ctx.globalAlpha = ent.opacity;
  ctx.save();

  if (ent.boltOrient === 'end' || !ent.boltOrient) {
    drawBolt2D_End(blk, ent, b, col, pm);
  } else if (ent.boltOrient === 'h-nutR' || ent.boltOrient === 'h-nutL') {
    let span = v25BoltClampSpan(blk, ent);
    if (!span) span = { grip: 20, centre: ent.u,
      length: (typeof computeBoltLength === 'function') ? computeBoltLength(20, ent.size) : 60 };
    drawBolt2D_HorizontalSection(blk, ent, b, col, pm, span, ent.boltOrient);
  } else if (ent.boltOrient === 'v-nutB' || ent.boltOrient === 'v-nutT') {
    let span = v25BoltClampSpan(blk, ent);
    if (!span) span = { grip: 20, centre: ent.v,
      length: (typeof computeBoltLength === 'function') ? computeBoltLength(20, ent.size) : 60 };
    drawBolt2D_VerticalSection(blk, ent, b, col, pm, span, ent.boltOrient);
  }

  ctx.restore();
  ctx.setLineDash([]);
  ctx.globalAlpha = prevAlpha;
  return true;
}

/* ---- End-on view ('end'): washer ring + bolt-hole circle + AF crosshair ---- */
function drawBolt2D_End(blk, ent, b, col, pm) {
  const p = real2px(blk, ent.u, ent.v);
  const r  = (b.d / 2) * pm;                 // bolt-hole radius
  const wr = ((b.washOD || b.d * 1.85) / 2) * pm; // washer OD radius
  const hr = ((b.headAF || b.d * 1.5) / 2) * pm;  // head AF radius (crosshair)

  // Washer ring — dashed, light (hidden lineweight).
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = colorAlpha(col, 0.4);
  ctx.lineWidth = Math.max(0.3, LW.HID * pm);
  ctx.beginPath();
  ctx.arc(p.x, p.y, wr, 0, Math.PI * 2);
  ctx.stroke();

  // Bolt-hole circle — visible stroke + light fill.
  ctx.setLineDash([]);
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(0.5, LW.VIS * pm);
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = colorAlpha(col, 0.20);
  ctx.fill();
  ctx.stroke();

  // Head AF crosshair.
  ctx.beginPath();
  ctx.moveTo(p.x - hr, p.y);
  ctx.lineTo(p.x + hr, p.y);
  ctx.moveTo(p.x, p.y - hr);
  ctx.lineTo(p.x, p.y + hr);
  ctx.stroke();
}

/* ---- Horizontal section ('h-nutR' / 'h-nutL'): bolt axis along u ----------- */
function drawBolt2D_HorizontalSection(blk, ent, b, col, pm, span, orient) {
  const cy = ent.v;
  const hG = span.grip / 2;

  // Grip faces: zGripL = head side, zGripR = nut side.
  const zGripL = (orient === 'h-nutR') ? span.centre - hG : span.centre + hG;
  const zGripR = (orient === 'h-nutR') ? span.centre + hG : span.centre - hG;

  const dir = (orient === 'h-nutR') ? 1 : -1; // +1: nut to the right
  const zWashHeadL = zGripL - dir * b.washT;          // head-washer outer face
  const zHeadOuter = zWashHeadL - dir * b.headH;       // chamfered head outer
  const zWashNutR  = zGripR + dir * b.washT;           // nut-washer outer face
  const zNutOuter  = zWashNutR + dir * b.nutH;          // chamfered nut outer
  const threadProt = (span.threadProt != null)
    ? span.threadProt
    : Math.max(2 * b.pitch, (span.length || 0) - (span.grip + 2 * b.washT + b.nutH));
  const zThreadTip = zNutOuter + dir * threadProt;

  const halfD   = b.d / 2;
  const halfMin = (b.minorD || b.d * 0.84) / 2;
  const halfAFh = (b.headAF || b.d * 1.5) / 2;
  const halfAFn = (b.nutAF  || b.d * 1.5) / 2;
  const halfWO  = (b.washOD || b.d * 1.85) / 2;

  // Shank spans from under the head-washer to the thread tip.
  const shankL = Math.min(zWashHeadL, zThreadTip);
  const shankW = Math.abs(zThreadTip - zWashHeadL);

  // 1) Shank rectangle.
  ctx.setLineDash([]);
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(0.3, LW.VIS * pm);
  ctx.fillStyle = colorAlpha(col, 0.4);
  rFillRect(blk, shankL, cy - halfD, shankW, halfD * 2);
  rRect(blk, shankL, cy - halfD, shankW, halfD * 2);

  // 2) Sawtooth thread (minor diameter) over the protruding zone near the nut.
  const threadLen = Math.min(b.threadL || b.d * 2.3, Math.abs(zThreadTip - zNutOuter) + b.nutH);
  if (threadLen > 0.1) {
    ctx.strokeStyle = colorAlpha(col, 0.85);
    ctx.lineWidth = Math.max(0.3, LW.VIS * pm * 0.7);
    const tStart = zThreadTip - dir * threadLen;
    drawThreadAlongU(blk, cy, Math.min(tStart, zThreadTip), Math.max(tStart, zThreadTip),
                     halfD, halfMin, b.pitch);
  }

  // 3) Head washer (touching grip head face).
  ctx.setLineDash([]);
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(0.5, LW.VIS * pm);
  ctx.fillStyle = colorAlpha(col, 0.10);
  rFillRect(blk, Math.min(zGripL, zWashHeadL), cy - halfWO, b.washT, halfWO * 2);
  rRect(blk, Math.min(zGripL, zWashHeadL), cy - halfWO, b.washT, halfWO * 2);

  // 4) Chamfered hex head.
  const headPts = hexPointsAlongU(cy, zHeadOuter, zWashHeadL, halfAFh);
  ctx.fillStyle = colorAlpha(col, 0.10);
  rFillPolygon(blk, headPts);
  ctx.lineWidth = Math.max(0.5, LW.VIS * pm);
  rPolygon(blk, headPts);

  // 5) Nut washer (touching grip nut face).
  ctx.fillStyle = colorAlpha(col, 0.10);
  rFillRect(blk, Math.min(zGripR, zWashNutR), cy - halfWO, b.washT, halfWO * 2);
  rRect(blk, Math.min(zGripR, zWashNutR), cy - halfWO, b.washT, halfWO * 2);

  // 6) Chamfered hex nut.
  const nutPts = hexPointsAlongU(cy, zNutOuter, zWashNutR, halfAFn);
  ctx.fillStyle = colorAlpha(col, 0.10);
  rFillPolygon(blk, nutPts);
  ctx.lineWidth = Math.max(0.5, LW.VIS * pm);
  rPolygon(blk, nutPts);

  // 7) Bolt centreline — dashed, light.
  ctx.strokeStyle = colorAlpha(col, 0.5);
  ctx.lineWidth = Math.max(0.2, LW.CL * pm);
  ctx.setLineDash(DASH.CL_BOLT);
  rLine(blk, Math.min(zHeadOuter, zThreadTip) - 4, cy, Math.max(zHeadOuter, zThreadTip) + 4, cy);
  ctx.setLineDash([]);
}

/* ---- Vertical section ('v-nutB' / 'v-nutT'): bolt axis along v ------------- */
function drawBolt2D_VerticalSection(blk, ent, b, col, pm, span, orient) {
  const cu = ent.u;
  const hG = span.grip / 2;

  // Grip faces: vGripL = head side, vGripR = nut side.
  const vGripL = (orient === 'v-nutB') ? span.centre + hG : span.centre - hG;
  const vGripR = (orient === 'v-nutB') ? span.centre - hG : span.centre + hG;

  const dir = (orient === 'v-nutB') ? 1 : -1; // +1: head at top (+v), nut at bottom (-v)
  const vWashHeadL = vGripL + dir * b.washT;          // head-washer outer face
  const vHeadOuter = vWashHeadL + dir * b.headH;       // chamfered head outer
  const vWashNutR  = vGripR - dir * b.washT;           // nut-washer outer face
  const vNutOuter  = vWashNutR - dir * b.nutH;          // chamfered nut outer
  const threadProt = (span.threadProt != null)
    ? span.threadProt
    : Math.max(2 * b.pitch, (span.length || 0) - (span.grip + 2 * b.washT + b.nutH));
  const vThreadTip = vNutOuter - dir * threadProt;

  const halfD   = b.d / 2;
  const halfMin = (b.minorD || b.d * 0.84) / 2;
  const halfAFh = (b.headAF || b.d * 1.5) / 2;
  const halfAFn = (b.nutAF  || b.d * 1.5) / 2;
  const halfWO  = (b.washOD || b.d * 1.85) / 2;

  // Shank spans from under the head-washer to the thread tip.
  const shankB = Math.min(vWashHeadL, vThreadTip);
  const shankH = Math.abs(vThreadTip - vWashHeadL);

  // 1) Shank rectangle.
  ctx.setLineDash([]);
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(0.3, LW.VIS * pm);
  ctx.fillStyle = colorAlpha(col, 0.4);
  rFillRect(blk, cu - halfD, shankB, halfD * 2, shankH);
  rRect(blk, cu - halfD, shankB, halfD * 2, shankH);

  // 2) Sawtooth thread (minor diameter) over the protruding zone near the nut.
  const threadLen = Math.min(b.threadL || b.d * 2.3, Math.abs(vThreadTip - vNutOuter) + b.nutH);
  if (threadLen > 0.1) {
    ctx.strokeStyle = colorAlpha(col, 0.85);
    ctx.lineWidth = Math.max(0.3, LW.VIS * pm * 0.7);
    const tStart = vThreadTip + dir * threadLen;
    drawThreadAlongV(blk, cu, Math.min(tStart, vThreadTip), Math.max(tStart, vThreadTip),
                     halfD, halfMin, b.pitch);
  }

  // 3) Head washer (touching grip head face).
  ctx.setLineDash([]);
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(0.5, LW.VIS * pm);
  ctx.fillStyle = colorAlpha(col, 0.10);
  rFillRect(blk, cu - halfWO, Math.min(vGripL, vWashHeadL), halfWO * 2, b.washT);
  rRect(blk, cu - halfWO, Math.min(vGripL, vWashHeadL), halfWO * 2, b.washT);

  // 4) Chamfered hex head.
  const headPts = hexPointsAlongV(cu, vHeadOuter, vWashHeadL, halfAFh);
  ctx.fillStyle = colorAlpha(col, 0.10);
  rFillPolygon(blk, headPts);
  ctx.lineWidth = Math.max(0.5, LW.VIS * pm);
  rPolygon(blk, headPts);

  // 5) Nut washer (touching grip nut face).
  ctx.fillStyle = colorAlpha(col, 0.10);
  rFillRect(blk, cu - halfWO, Math.min(vGripR, vWashNutR), halfWO * 2, b.washT);
  rRect(blk, cu - halfWO, Math.min(vGripR, vWashNutR), halfWO * 2, b.washT);

  // 6) Chamfered hex nut.
  const nutPts = hexPointsAlongV(cu, vNutOuter, vWashNutR, halfAFn);
  ctx.fillStyle = colorAlpha(col, 0.10);
  rFillPolygon(blk, nutPts);
  ctx.lineWidth = Math.max(0.5, LW.VIS * pm);
  rPolygon(blk, nutPts);

  // 7) Bolt centreline — dashed, light.
  ctx.strokeStyle = colorAlpha(col, 0.5);
  ctx.lineWidth = Math.max(0.2, LW.CL * pm);
  ctx.setLineDash(DASH.CL_BOLT);
  rLine(blk, cu, Math.min(vHeadOuter, vThreadTip) - 4, cu, Math.max(vHeadOuter, vThreadTip) + 4);
  ctx.setLineDash([]);
}
