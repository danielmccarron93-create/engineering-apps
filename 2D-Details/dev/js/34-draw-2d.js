'use strict';

// Draw 2D entities + V22.5 grid/note + V22.6 hatch/MText/rev schedule
// Extracted from dev/index.html lines 9524-10499 (2026-05-02 modular split)

// DRAW 2D ENTITIES
// ============================================================

function drawEnt2D(blk, ent, cs) {
  // V20 layer visibility gate — skip entire entity types when toggled off
  if (typeof layerVisibility === 'object' && layerVisibility[ent.type] === false) return;
  // V25 — paper-space entities only make sense in 2D mode (their coords are
  // mm in paper space at 1:1, not real-world mm at the sheet scale).
  if (ent._v25 && sheetMode !== '2d') return;
  // V25 — dispatch new 2D-studio entity types first
  if (typeof v25DrawEnt === 'function' && v25DrawEnt(blk, ent, cs)) {
    ctx.setLineDash([]);
    return;
  }
  const col = (typeof v25EntColour === 'function') ? v25EntColour(ent, cs) : cs.getPropertyValue('--entity-color').trim();
  // V25-layout-overhaul Phase 7 — opacity override on the legacy dispatcher
  // covers line/rect/circle/text + every sub-renderer that doesn't push its
  // own globalAlpha. Multiplied into the existing alpha so it composes.
  const _opacityWas = ctx.globalAlpha;
  if (typeof v25EntOpacity === 'function') {
    ctx.globalAlpha = _opacityWas * v25EntOpacity(ent);
  }
  try {
  const pm = ppm();
  const lw = Math.max(1, ent.lw * pm);
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = lw;
  ctx.setLineDash(
    ent.ls === 'dotted' ? [1, 3] :
    ent.ls === 'dashed' ? [6, 4] :
    ent.ls === 'centre' ? [10, 3, 3, 3] : []
  );

  if (ent.type === 'line') rLine(blk, ent.u1, ent.v1, ent.u2, ent.v2);
  else if (ent.type === 'rect') rRect(blk, ent.u, ent.v, ent.w, ent.h);
  // 2026-05-18 — timber-screw connection entities (Phase 2). Gated behind
  // FEATURE_TIMBER_SCREWS so a release build can mask them off. The drawers
  // live in 75-timber-conn-entities.js and 76-screw-entity.js.
  else if (ent.type === 'timber-member' && (typeof FEATURE_TIMBER_SCREWS === 'undefined' || FEATURE_TIMBER_SCREWS)) drawTimberMember(blk, ent, cs);
  else if (ent.type === 'steel-plate'  && (typeof FEATURE_TIMBER_SCREWS === 'undefined' || FEATURE_TIMBER_SCREWS)) drawSteelPlate(blk, ent, cs);
  else if (ent.type === 'screw'        && (typeof FEATURE_TIMBER_SCREWS === 'undefined' || FEATURE_TIMBER_SCREWS)) drawScrewEnt(blk, ent, cs);
  else if (ent.type === 'circle') {
    const p = real2px(blk, ent.cu, ent.cv);
    const r = ent.r * viewport.zoom / drawingScale;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI*2); ctx.stroke();
  }
  else if (ent.type === 'text') {
    const p = real2px(blk, ent.u, ent.v);
    const fs = Math.max(8, (ent.sz || 3) * pm);
    ctx.font = `${fs}px system-ui`; ctx.textBaseline = 'middle';
    ctx.fillText(ent.text || '', p.x, p.y);
  }
  else if (ent.type === 'dim') drawDim2D(blk, ent, cs);
  else if (ent.type === 'centreline') {
    // Drawable centreline — always uses CL dash + LW.CL weight regardless of
    // the entity's raw lw (V17). Gives a predictable centreline look without
    // the user having to hand-pick values.
    const cl = cs.getPropertyValue('--cl-color').trim();
    ctx.strokeStyle = cl || col;
    ctx.lineWidth = Math.max(0.25, LW.CL * pm);
    ctx.setLineDash(DASH.CL);
    rLine(blk, ent.u1, ent.v1, ent.u2, ent.v2);
    ctx.setLineDash(DASH.SOLID);
  }
  else if (ent.type === 'breakline') drawBreakLine2D(blk, ent, cs);
  else if (ent.type === 'weld') drawWeld2D(blk, ent, cs);
  else if (ent.type === 'slot') drawSlot2D(blk, ent, cs);
  else if (ent.type === 'memberTag') drawMemberTag2D(blk, ent, cs);
  else if (ent.type === 'boltCallout') drawBoltCallout2D(blk, ent, cs);
  else if (ent.type === 'sectionMark') drawSectionMark2D(blk, ent, cs);
  else if (ent.type === 'materialTag') drawMaterialTag2D(blk, ent, cs);
  else if (ent.type === 'revisionTriangle') drawRevisionTriangle2D(blk, ent, cs);
  else if (ent.type === 'revisionCloud') drawRevisionCloud2D(blk, ent, cs);
  else if (ent.type === 'detailRef') drawDetailRef2D(blk, ent, cs);
  else if (ent.type === 'detailCard') drawDetailCard2D(blk, ent, cs);
  // V22.3 — Arc, Polygon. Offset is destructive (creates new lines), no
  // separate entity type needed. V22.5/V22.6 annotation entities follow.
  else if (ent.type === 'arc') {
    const c = real2px(blk, ent.cu, ent.cv);
    const r = ent.r * viewport.zoom / drawingScale;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, ent.a0, ent.a1, ent.ccw || false);
    ctx.stroke();
  }
  else if (ent.type === 'polygon') {
    const pts = ent.pts || [];
    if (pts.length >= 3) {
      ctx.beginPath();
      const f = real2px(blk, pts[0].u, pts[0].v);
      ctx.moveTo(f.x, f.y);
      for (let i = 1; i < pts.length; i++) {
        const q = real2px(blk, pts[i].u, pts[i].v);
        ctx.lineTo(q.x, q.y);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }
  // V22.5 — Grid line: bubble + chain-dash line
  else if (ent.type === 'gridLine') drawGridLine2D(blk, ent, cs);
  // V22.5 — Note: leader + text block
  else if (ent.type === 'note') drawNote2D(blk, ent, cs);
  // V22.6 — Hatch: polygon outline with 45° AS 1100 hatching
  else if (ent.type === 'hatch') drawHatch2D(blk, ent, cs);
  // V22.6 — MText: multi-line wrapped text
  else if (ent.type === 'mtext') drawMText2D(blk, ent, cs);
  // V22.6 — Revision schedule table (auto-populated from revisionTriangles)
  else if (ent.type === 'revSchedule') drawRevSchedule2D(blk, ent, cs);
  ctx.setLineDash([]);
  } finally { ctx.globalAlpha = _opacityWas; }
}

// ---- DIMENSION RENDERING (horizontal, aligned, angular) ----
function drawDim2D(blk, ent, cs) {
  const col = cs.getPropertyValue('--mute').trim();
  const pm = ppm();
  ctx.strokeStyle = col; ctx.fillStyle = col;
  ctx.lineWidth = 0.8; ctx.setLineDash([]);
  const dt = ent.dimType || 'horizontal';

  if (dt === 'aligned') {
    // Aligned: dimension line parallel to P1→P2, offset perpendicular
    const du = ent.p2u - ent.p1u, dv = ent.p2v - ent.p1v;
    const len = Math.hypot(du, dv); if (len < 0.1) return;
    const nx = -dv / len, ny = du / len; // perpendicular unit vector
    const off = ent.off || 20;
    // Offset points
    const d1u = ent.p1u + nx * off, d1v = ent.p1v + ny * off;
    const d2u = ent.p2u + nx * off, d2v = ent.p2v + ny * off;
    const pd1 = real2px(blk, d1u, d1v), pd2 = real2px(blk, d2u, d2v);
    const w1 = real2px(blk, ent.p1u, ent.p1v), w2 = real2px(blk, ent.p2u, ent.p2v);
    // Extension lines
    ctx.beginPath(); ctx.moveTo(w1.x, w1.y); ctx.lineTo(pd1.x, pd1.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w2.x, w2.y); ctx.lineTo(pd2.x, pd2.y); ctx.stroke();
    // Dimension line
    ctx.beginPath(); ctx.moveTo(pd1.x, pd1.y); ctx.lineTo(pd2.x, pd2.y); ctx.stroke();
    // Tick marks
    ctx.lineWidth = 1.2;
    [pd1, pd2].forEach(p => {
      ctx.beginPath(); ctx.moveTo(p.x-4, p.y+4); ctx.lineTo(p.x+4, p.y-4); ctx.stroke();
    });
    // Text (rotated to align with dimension line)
    const txt = len < 1 ? len.toFixed(1) : Math.round(len).toString();
    const midPx = { x: (pd1.x+pd2.x)/2, y: (pd1.y+pd2.y)/2 };
    const angle = Math.atan2(pd2.y-pd1.y, pd2.x-pd1.x);
    ctx.save(); ctx.translate(midPx.x, midPx.y); ctx.rotate(angle);
    ctx.font = `${Math.max(8, 2.5*pm)}px system-ui`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(txt, 0, -3);
    ctx.restore();
  } else if (dt === 'angular') {
    // Angular: arc between two rays from vertex
    const vx = real2px(blk, ent.p1u, ent.p1v); // vertex
    const r1 = real2px(blk, ent.p2u, ent.p2v); // ray 1 end
    const r2 = real2px(blk, ent.p3u, ent.p3v); // ray 2 end
    const a1 = Math.atan2(r1.y - vx.y, r1.x - vx.x);
    const a2 = Math.atan2(r2.y - vx.y, r2.x - vx.x);
    const arcR = Math.min(60, Math.hypot(r1.x-vx.x, r1.y-vx.y) * 0.6);
    // Draw rays
    ctx.beginPath(); ctx.moveTo(vx.x, vx.y); ctx.lineTo(r1.x, r1.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(vx.x, vx.y); ctx.lineTo(r2.x, r2.y); ctx.stroke();
    // Draw arc
    ctx.beginPath(); ctx.arc(vx.x, vx.y, arcR, a1, a2, a2 < a1); ctx.stroke();
    // Angle text
    let angleDeg = (a2 - a1) * 180 / Math.PI;
    if (angleDeg < 0) angleDeg += 360;
    if (angleDeg > 180) angleDeg = 360 - angleDeg;
    const midA = (a1 + a2) / 2;
    const tx = vx.x + (arcR + 10) * Math.cos(midA);
    const ty = vx.y + (arcR + 10) * Math.sin(midA);
    ctx.font = `${Math.max(8, 2.5*pm)}px system-ui`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`${angleDeg.toFixed(1)}°`, tx, ty);
  } else if (dt === 'vertical') {
    // Vertical dimension — measures the V (y-axis) distance. Dim line runs
    // vertically at u = min(p1u,p2u) - off (or user-specified). Extension
    // lines run horizontally from each point to the dim line.
    const leftU = Math.min(ent.p1u, ent.p2u);
    const dimU = leftU - (ent.off || 20);
    const w1 = real2px(blk, ent.p1u, ent.p1v);
    const w2 = real2px(blk, ent.p2u, ent.p2v);
    const d1 = real2px(blk, dimU, ent.p1v);
    const d2 = real2px(blk, dimU, ent.p2v);
    // Extension lines (horizontal)
    ctx.beginPath();
    ctx.moveTo(w1.x, w1.y); ctx.lineTo(d1.x, d1.y);
    ctx.moveTo(w2.x, w2.y); ctx.lineTo(d2.x, d2.y);
    ctx.stroke();
    // Dimension line (vertical)
    ctx.beginPath(); ctx.moveTo(d1.x, d1.y); ctx.lineTo(d2.x, d2.y); ctx.stroke();
    // Tick marks
    ctx.lineWidth = 1.2;
    [d1, d2].forEach(p => {
      ctx.beginPath(); ctx.moveTo(p.x-4, p.y+4); ctx.lineTo(p.x+4, p.y-4); ctx.stroke();
    });
    // Text (rotated 90° CCW to read up the page)
    const dist = Math.abs(ent.p2v - ent.p1v);
    const txt = dist < 1 ? dist.toFixed(1) : Math.round(dist).toString();
    const midPx = { x: d1.x, y: (d1.y + d2.y) / 2 };
    ctx.save(); ctx.translate(midPx.x, midPx.y); ctx.rotate(-Math.PI/2);
    ctx.font = `${Math.max(8, 2.5*pm)}px system-ui`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(txt, 0, -3);
    ctx.restore();
  } else if (dt === 'chain' || dt === 'baseline') {
    // V18 chain / baseline dimensions (drafter §3.8).
    //   chain    — a sequence of adjacent horizontal dimensions sharing a
    //              dimension-line Y. Each segment gets its own text.
    //   baseline — each dim is measured from the first point (the "datum"),
    //              so each successive dim line is offset further up so the
    //              witness-lines don't collide.
    // Data model: { dimType, stops: [u0, u1, u2, ...], v, off }. The baseline
    // is stops[0]; text reads (stops[i] - stops[i-1]) for chain, or
    // (stops[i] - stops[0]) for baseline.
    const stops = ent.stops || [];
    if (stops.length < 2) return;
    const baselineV = ent.v ?? ent.p1v ?? 0;
    const baseOff = ent.off || 20;
    const tierStep = 10; // sheet-mm between baseline tiers
    const dimLW = Math.max(0.5, LW.DIM * pm);
    ctx.lineWidth = dimLW;
    for (let i = 1; i < stops.length; i++) {
      const u1 = dt === 'baseline' ? stops[0] : stops[i - 1];
      const u2 = stops[i];
      const tier = dt === 'baseline' ? (i - 1) * tierStep : 0;
      const dimV = baselineV + baseOff + tier;
      const p1 = real2px(blk, u1, dimV);
      const p2 = real2px(blk, u2, dimV);
      const w1 = real2px(blk, u1, baselineV);
      const w2 = real2px(blk, u2, baselineV);
      // Extension lines
      ctx.beginPath();
      ctx.moveTo(w1.x, w1.y); ctx.lineTo(p1.x, p1.y);
      ctx.moveTo(w2.x, w2.y); ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      // Dim line
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      // Tick marks (AS 1100 slashes)
      ctx.lineWidth = Math.max(0.8, LW.MW * pm);
      [p1, p2].forEach(p => {
        ctx.beginPath(); ctx.moveTo(p.x-4, p.y+4); ctx.lineTo(p.x+4, p.y-4); ctx.stroke();
      });
      ctx.lineWidth = dimLW;
      // Dim text
      const dist = Math.abs(u2 - u1);
      const txt = dist < 1 ? dist.toFixed(1) : Math.round(dist).toString();
      ctx.font = `${Math.max(8, 2.5 * pm)}px system-ui`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(txt, (p1.x + p2.x) / 2, p1.y - 2);
    }
  } else {
    // Horizontal (default — original logic)
    const dimV = ent.p1v + (ent.off || 20);
    const p1 = real2px(blk, ent.p1u, dimV);
    const p2 = real2px(blk, ent.p2u, dimV);
    const w1 = real2px(blk, ent.p1u, ent.p1v);
    const w2 = real2px(blk, ent.p2u, ent.p2v);
    ctx.beginPath();
    ctx.moveTo(w1.x, w1.y); ctx.lineTo(p1.x, p1.y);
    ctx.moveTo(w2.x, w2.y); ctx.lineTo(p2.x, p1.y);
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p1.y); ctx.stroke();
    ctx.lineWidth = 1.2;
    [p1, p2].forEach(p => {
      ctx.beginPath(); ctx.moveTo(p.x-4, p1.y+4); ctx.lineTo(p.x+4, p1.y-4); ctx.stroke();
    });
    const dist = Math.abs(ent.p2u - ent.p1u);
    const txt = dist < 1 ? dist.toFixed(1) : Math.round(dist).toString();
    ctx.font = `${Math.max(8, 2.5 * pm)}px system-ui`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(txt, (p1.x + p2.x) / 2, p1.y - 2);
  }
  ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
}

// ---- BREAK LINE RENDERING (AS 1100 zigzag) ----
function drawBreakLine2D(blk, ent, cs) {
  const col = cs.getPropertyValue('--entity-color').trim();
  const pm = ppm();
  ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, 0.35 * pm); ctx.setLineDash([]);

  const p1 = real2px(blk, ent.u1, ent.v1);
  const p2 = real2px(blk, ent.u2, ent.v2);
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy); if (len < 2) return;
  const ux = dx / len, uy = dy / len;       // unit along line
  const px = -uy, py = ux;                   // perpendicular
  const amp = Math.max(4, 5 * pm);           // zigzag amplitude in pixels

  ctx.beginPath(); ctx.moveTo(p1.x, p1.y);
  // Straight to 35%
  const s1 = 0.35, s2 = 0.65;
  ctx.lineTo(p1.x + dx*s1, p1.y + dy*s1);
  // 3 zigzag peaks
  const zigN = 3;
  for (let i = 0; i < zigN; i++) {
    const t = s1 + (s2 - s1) * (i + 0.5) / zigN;
    const sign = (i % 2 === 0) ? 1 : -1;
    ctx.lineTo(p1.x + dx*t + px*amp*sign, p1.y + dy*t + py*amp*sign);
  }
  // Straight to end
  ctx.lineTo(p1.x + dx*s2, p1.y + dy*s2);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();
}

// ---- SLOTTED HOLE (AS 1100 §7.7 / drafter) ----
// Data model: { type:'slot', u, v, dia, length, angle }.
// dia = nominal hole diameter (mm); length = overall slot length (mm);
// angle = rotation (radians) from horizontal. For an M20 standard slot
// dia=22, length=40 per drafter §7.7.
function drawSlot2D(blk, ent, cs) {
  const col = cs.getPropertyValue('--entity-color').trim();
  const pm = ppm();
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(0.5, LW.VIS * pm);
  ctx.setLineDash(DASH.SOLID);

  const dia = ent.dia || 22;
  const length = ent.length || 40;
  const angle = ent.angle || 0;
  const r = dia / 2;
  const capOffset = (length - dia) / 2;
  if (capOffset < 0) {
    // Length shorter than dia — draw as a circle fallback
    rCircle(blk, ent.u, ent.v, dia);
    return;
  }

  const cos = Math.cos(angle), sin = Math.sin(angle);
  // Four key points in real-world coords (u along length, v across)
  const c1u = ent.u - cos * capOffset;
  const c1v = ent.v - sin * capOffset;
  const c2u = ent.u + cos * capOffset;
  const c2v = ent.v + sin * capOffset;

  // Use screen-space path so we can arc — convert centres to screen
  const p1 = real2px(blk, c1u, c1v);
  const p2 = real2px(blk, c2u, c2v);
  const rPx = r * viewport.zoom / drawingScale;

  ctx.beginPath();
  ctx.arc(p1.x, p1.y, rPx, angle + Math.PI / 2, angle + 3 * Math.PI / 2);
  ctx.arc(p2.x, p2.y, rPx, angle - Math.PI / 2, angle + Math.PI / 2);
  ctx.closePath();
  ctx.stroke();

  // Centreline along slot long axis (chain dash)
  ctx.save();
  const clCol = cs.getPropertyValue('--cl-color').trim();
  ctx.strokeStyle = clCol || col;
  ctx.lineWidth = Math.max(0.25, LW.CL * pm);
  ctx.setLineDash(DASH.CL);
  const extension = rPx * 0.5;
  const ex = cos * (capOffset + extension);
  const ey = sin * (capOffset + extension);
  ctx.beginPath();
  ctx.moveTo(p1.x - (ex - (p1.x - p2.x) / 2), p1.y - (ey - (p1.y - p2.y) / 2));
  // Simpler: draw centreline from slightly past end1 to slightly past end2
  const pCentre = real2px(blk, ent.u, ent.v);
  ctx.moveTo(pCentre.x - cos * (capOffset + extension) * viewport.zoom / drawingScale,
             pCentre.y + sin * (capOffset + extension) * viewport.zoom / drawingScale);
  ctx.lineTo(pCentre.x + cos * (capOffset + extension) * viewport.zoom / drawingScale,
             pCentre.y - sin * (capOffset + extension) * viewport.zoom / drawingScale);
  ctx.stroke();
  ctx.restore();
}

// ---- V18 MEMBER TAG ----
// Parametric member label: leader + section name. If linked to a member by
// `memberId`, the text auto-resolves to the current `section` property so
// renaming / re-sectioning a beam updates every tag that points at it.
// Data: { type:'memberTag', u, v, memberId, anchorU, anchorV, text? }
function drawMemberTag2D(blk, ent, cs) {
  const col = cs.getPropertyValue('--entity-color').trim();
  const pm = ppm();

  let label = ent.text || '';
  if (ent.memberId !== undefined) {
    const m = objects3D.find(o => o.id === ent.memberId);
    if (m) {
      if (m.section) label = m.section;
      else if (m.boltSize) label = m.boltSize + ' bolt';
      else if (m.type === 'plate') label = `PL ${m.pt || 10} THK`;
      else label = (m.type || 'member').toUpperCase();
    }
  }
  if (!label) return;

  const anchorU = ent.anchorU ?? ent.u;
  const anchorV = ent.anchorV ?? ent.v;

  // Leader: anchor → text origin
  ctx.strokeStyle = col; ctx.fillStyle = col;
  ctx.lineWidth = Math.max(0.5, LW.DIM * pm);
  ctx.setLineDash(DASH.SOLID);
  const pA = real2px(blk, anchorU, anchorV);
  const pT = real2px(blk, ent.u, ent.v);
  _lineW(pA.x, pA.y, pT.x, pT.y);

  // Small filled arrow at anchor
  const dx = pT.x - pA.x, dy = pT.y - pA.y;
  const len = Math.hypot(dx, dy);
  if (len > 3) {
    const ux = dx / len, uy = dy / len;
    const aLen = 5, aWid = 2;
    ctx.beginPath();
    ctx.moveTo(pA.x, pA.y);
    ctx.lineTo(pA.x + ux * aLen + uy * aWid, pA.y + uy * aLen - ux * aWid);
    ctx.lineTo(pA.x + ux * aLen - uy * aWid, pA.y + uy * aLen + ux * aWid);
    ctx.closePath(); ctx.fill();
  }

  // Underline the text per drafter convention
  ctx.font = `${Math.max(8, 2.8 * pm)}px system-ui`;
  const textMetric = ctx.measureText(label);
  const textW = textMetric.width;
  ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  const textPad = 4;
  const tx0 = pT.x + (dx >= 0 ? textPad : -textPad - textW);
  ctx.fillText(label, tx0, pT.y - 3);
  ctx.beginPath();
  ctx.moveTo(tx0, pT.y);
  ctx.lineTo(tx0 + textW, pT.y);
  ctx.stroke();
  ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
}

// ---- V18 BOLT GROUP CALLOUT ----
// Callout for a named group of bolts (drafter §3.3): "4/M20 8.8/S".
// Data: { type:'boltCallout', u, v, anchorU, anchorV, count, size, grade, cat }
// grade defaults to '8.8', cat to 'S' (snug-tight). Leader identical to
// member tag.
function drawBoltCallout2D(blk, ent, cs) {
  const text = `${ent.count || 2}/${ent.size || 'M20'} ${ent.grade || '8.8'}/${ent.cat || 'S'}`;
  // Reuse the member tag renderer by feeding a synthetic entity
  drawMemberTag2D(blk, {
    ...ent, text,
    memberId: undefined, // don't let memberTag's auto-lookup override
  }, cs);
}

// ---- V18 SECTION MARK (A-A, B-B) ----
// Two-click drawable section mark with direction arrow and auto-assigned
// letter. Data: { type:'sectionMark', u1, v1, u2, v2, label }. If label
// is undefined, the renderer assigns the next unused letter on first draw
// (see finishSectionMark for the wiring).
function drawSectionMark2D(blk, ent, cs) {
  const col = cs.getPropertyValue('--entity-color').trim();
  const accent = cs.getPropertyValue('--cut-color').trim() || col;
  const pm = ppm();
  const p1 = real2px(blk, ent.u1, ent.v1);
  const p2 = real2px(blk, ent.u2, ent.v2);
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);
  if (len < 4) return;
  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux;

  // Heavy chain-dash cut line
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(1, LW.CUT * pm);
  ctx.setLineDash(DASH.SECTION);
  _lineW(p1.x, p1.y, p2.x, p2.y);
  ctx.setLineDash(DASH.SOLID);

  // Arrowheads at each end pointing along `nx,ny` (direction of sight)
  const arrLen = Math.max(10, 4 * pm);
  const arrW = Math.max(4, 2 * pm);
  ctx.fillStyle = accent;
  [p1, p2].forEach(p => {
    const tip = { x: p.x + nx * arrLen, y: p.y + ny * arrLen };
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(p.x + ux * arrW, p.y + uy * arrW);
    ctx.lineTo(p.x - ux * arrW, p.y - uy * arrW);
    ctx.closePath(); ctx.fill();
    // Label next to the arrow tip
    ctx.fillStyle = col;
    ctx.font = `bold ${Math.max(10, 3.5 * pm)}px system-ui`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(ent.label || '?', tip.x + nx * 6, tip.y + ny * 6);
    ctx.fillStyle = accent;
  });
  ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
}

// Assign the next unused section-mark label across the whole project.
function nextSectionMarkLabel() {
  const used = new Set();
  for (const vk of Object.keys(entities2D)) {
    for (const e of entities2D[vk]) {
      if (e.type === 'sectionMark' && e.label) used.add(e.label);
    }
  }
  for (let i = 0; i < 26; i++) {
    const c = String.fromCharCode(65 + i);
    if (!used.has(c)) return c;
  }
  return '?';
}

// ---- V18 MATERIAL TAG ----
// "PL 12 THK" style label with a leader, same render geometry as memberTag
// but with manual text field and no memberId lookup. Exists as its own
// type so V19 exports can treat it differently (e.g. put on its own layer).
function drawMaterialTag2D(blk, ent, cs) {
  drawMemberTag2D(blk, { ...ent, memberId: undefined }, cs);
}

// ---- V19 REVISION TRIANGLE ----
// Numbered equilateral triangle anchored at (u,v). Conventionally placed
// next to a cloud-circled area of revised work and tied to the revision
// schedule in the title block. Data: { u, v, rev }.
function drawRevisionTriangle2D(blk, ent, cs) {
  const col = cs.getPropertyValue('--cut-color').trim() ||
              cs.getPropertyValue('--entity-color').trim();
  const pm = ppm();
  const p = real2px(blk, ent.u, ent.v);
  const r = Math.max(10, 4 * pm); // sheet ~4mm radius
  ctx.strokeStyle = col; ctx.fillStyle = col;
  ctx.lineWidth = Math.max(0.5, LW.MW * pm);
  ctx.setLineDash(DASH.SOLID);
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + i * 2 * Math.PI / 3;
    const x = p.x + Math.cos(a) * r;
    const y = p.y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
  // Rev number
  ctx.fillStyle = col;
  ctx.font = `bold ${Math.max(9, 3 * pm)}px system-ui`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(ent.rev || 1), p.x, p.y + r * 0.15);
  ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
}

// ---- V19 REVISION CLOUD ----
// Perimeter of connected arcs ("bumps") around a revised area. Data:
// { type:'revisionCloud', pts:[{u,v}, …] }. The cloud is closed — the last
// segment arcs back to the first point.
function drawRevisionCloud2D(blk, ent, cs) {
  const col = cs.getPropertyValue('--cut-color').trim() ||
              cs.getPropertyValue('--entity-color').trim();
  const pm = ppm();
  const pts = ent.pts || [];
  if (pts.length < 2) return;

  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(0.5, LW.MW * pm);
  ctx.setLineDash(DASH.SOLID);

  const screenPts = pts.map(p => real2px(blk, p.u, p.v));
  // Bump radius ~5mm sheet — but auto-scale if segments are shorter
  const bumpR = Math.max(6, 5 * pm);

  ctx.beginPath();
  for (let i = 0; i < screenPts.length; i++) {
    const a = screenPts[i];
    const b = screenPts[(i + 1) % screenPts.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const segLen = Math.hypot(dx, dy);
    if (segLen < 4) continue;
    // Number of bumps that fit along this segment (minimum 1)
    const n = Math.max(1, Math.floor(segLen / (bumpR * 2)));
    const step = segLen / n;
    const ux = dx / segLen, uy = dy / segLen;
    const px = -uy, py = ux;  // perpendicular (outward left)
    for (let k = 0; k < n; k++) {
      const cx = a.x + ux * (step * k + step / 2);
      const cy = a.y + uy * (step * k + step / 2);
      // Arc on the left side of the travel direction — "outward" for a
      // clockwise-drawn cloud, which is the convention for revision clouds.
      const startA = Math.atan2(uy, ux) + Math.PI / 2;
      ctx.arc(cx, cy, step / 2 * 0.9, startA, startA + Math.PI, false);
    }
  }
  ctx.stroke();
}

// ---- V19 DETAIL REFERENCE CALLOUT ----
// "See 3/S-400" bubble: circle divided by a horizontal diameter with the
// detail number above and sheet number below. Standard drafter convention.
// Data: { u, v, detail, sheet }. The reference is dead-text for now; a
// future project model (V19.5) will link it to live detail ID + sheet.
function drawDetailRef2D(blk, ent, cs) {
  const col = cs.getPropertyValue('--entity-color').trim();
  const pm = ppm();
  const p = real2px(blk, ent.u, ent.v);
  const r = Math.max(12, 5 * pm); // ~5mm sheet radius

  ctx.strokeStyle = col; ctx.fillStyle = col;
  ctx.lineWidth = Math.max(0.5, LW.MW * pm);
  ctx.setLineDash(DASH.SOLID);

  // Circle
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.stroke();

  // Horizontal divider
  ctx.beginPath();
  ctx.moveTo(p.x - r, p.y);
  ctx.lineTo(p.x + r, p.y);
  ctx.stroke();

  // Top — detail number; Bottom — sheet number
  ctx.font = `bold ${Math.max(8, 2.8 * pm)}px system-ui`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(String(ent.detail || '?'), p.x, p.y - 2);
  ctx.font = `${Math.max(7, 2.4 * pm)}px system-ui`;
  ctx.textBaseline = 'top';
  ctx.fillText(String(ent.sheet || ''), p.x, p.y + 2);
  ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
}

// ---- V19 DETAIL CARD ----
// Card frame drawn on the A1 sheet that wraps a detail region with a
// heavy border, a detail-number bubble, and a scale annotation. This is
// the precursor to full multi-detail-per-sheet layout (V19.5) — for now
// it's a decorative wrapper around content the user draws manually, so
// a single A1 can already carry multiple labelled details ready for
// export. Data: { u, v, w, h, detailNo, scale }.
// NB: This entity type *only* makes sense on an individual DetailBlock's
// canvas, but since our blocks already fill the sheet, we draw in the
// entity's own view-local coords so it sits with its contents.
function drawDetailCard2D(blk, ent, cs) {
  const col = cs.getPropertyValue('--entity-color').trim();
  const pm = ppm();
  const p1 = real2px(blk, ent.u, ent.v);
  const p2 = real2px(blk, ent.u + (ent.w || 300), ent.v + (ent.h || 200));
  const x = Math.min(p1.x, p2.x), y = Math.min(p1.y, p2.y);
  const w = Math.abs(p2.x - p1.x), h = Math.abs(p2.y - p1.y);

  // Heavy border per drafter convention
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(1, LW.VIS_HEAVY * pm);
  ctx.setLineDash(DASH.SOLID);
  ctx.strokeRect(x, y, w, h);

  // Detail number bubble — bottom-left, hanging below the frame
  const bubbleR = Math.max(14, 6 * pm);
  const bx = x + bubbleR + 8;
  const by = y + h + bubbleR + 2;
  ctx.beginPath();
  ctx.arc(bx, by, bubbleR, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(1, LW.CUT * pm);
  ctx.stroke();
  ctx.fillStyle = col;
  ctx.font = `bold ${Math.max(11, 4 * pm)}px system-ui`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(ent.detailNo || '1'), bx, by);

  // Detail title next to bubble
  if (ent.title) {
    ctx.font = `${Math.max(9, 3.2 * pm)}px system-ui`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(ent.title, bx + bubbleR + 6, by - bubbleR * 0.3);
  }
  // Scale annotation next to bubble, below title
  if (ent.scale) {
    ctx.font = `${Math.max(8, 2.5 * pm)}px system-ui`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(`SCALE ${ent.scale}`, bx + bubbleR + 6, by + bubbleR * 0.4);
  }
  ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
  ctx.lineWidth = Math.max(0.5, LW.DIM * pm);
}

// ============================================================
// V22.5 GRID LINE — bubble + chain-dash line
// ============================================================
// Data: { type:'gridLine', u1,v1,u2,v2, label, bubbleEnd }
// bubbleEnd = 'start' | 'end' | 'both' (default 'start')
function drawGridLine2D(blk, ent, cs) {
  const col = cs.getPropertyValue('--entity-color').trim();
  const pm = ppm();
  const p1 = real2px(blk, ent.u1, ent.v1);
  const p2 = real2px(blk, ent.u2, ent.v2);
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);
  if (len < 4) return;

  // Chain-dash line
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(0.35, LW.CL * pm);
  ctx.setLineDash(DASH.CL);
  ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
  ctx.setLineDash(DASH.SOLID);

  // Bubble(s)
  const bubbleR = Math.max(12, 5 * pm);
  const ux = dx / len, uy = dy / len;
  const drawBubble = (px, py, outward) => {
    const cx = px + ux * bubbleR * outward;
    const cy = py + uy * bubbleR * outward;
    ctx.lineWidth = Math.max(0.5, LW.VIS * pm);
    ctx.beginPath(); ctx.arc(cx, cy, bubbleR, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = col;
    ctx.font = `bold ${Math.max(9, 3 * pm)}px system-ui`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(ent.label || 'A', cx, cy);
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
  };
  const which = ent.bubbleEnd || 'start';
  if (which === 'start' || which === 'both') drawBubble(p1.x, p1.y, -1);
  if (which === 'end'   || which === 'both') drawBubble(p2.x, p2.y, +1);
}

// ============================================================
// V22.5 NOTE — leader + text block
// ============================================================
// Data: { type:'note', u, v, anchorU, anchorV, text }
function drawNote2D(blk, ent, cs) {
  const col = cs.getPropertyValue('--entity-color').trim();
  const pm = ppm();
  const pT = real2px(blk, ent.u, ent.v);
  const pA = real2px(blk, ent.anchorU ?? ent.u, ent.anchorV ?? ent.v);

  ctx.strokeStyle = col; ctx.fillStyle = col;
  ctx.lineWidth = Math.max(0.5, LW.DIM * pm);
  ctx.setLineDash(DASH.SOLID);
  ctx.beginPath(); ctx.moveTo(pA.x, pA.y); ctx.lineTo(pT.x, pT.y); ctx.stroke();

  // Arrow at anchor
  const dx = pT.x - pA.x, dy = pT.y - pA.y;
  const len = Math.hypot(dx, dy);
  if (len > 3) {
    const ux = dx / len, uy = dy / len;
    const aLen = 6, aWid = 2.5;
    ctx.beginPath();
    ctx.moveTo(pA.x, pA.y);
    ctx.lineTo(pA.x + ux * aLen + uy * aWid, pA.y + uy * aLen - ux * aWid);
    ctx.lineTo(pA.x + ux * aLen - uy * aWid, pA.y + uy * aLen + ux * aWid);
    ctx.closePath(); ctx.fill();
  }

  // Text — support multi-line via "\n"
  const fs = Math.max(9, 2.6 * pm);
  ctx.font = `${fs}px system-ui`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  const lines = String(ent.text || '').split('\n');
  const tx = pT.x + (dx >= 0 ? 6 : -6);
  const align = dx >= 0 ? 'left' : 'right';
  ctx.textAlign = align;
  lines.forEach((line, i) => {
    ctx.fillText(line, tx, pT.y + 2 + i * (fs + 2));
  });
  ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
}

// ============================================================
// V22.6 HATCH — polygon region with AS 1100 45° steel hatch
// ============================================================
// Data: { type:'hatch', pts: [{u,v}, …], spacing, pattern }
// pattern: 'steel' (45°), 'concrete' (dots), 'cross' (90°+0°)
function drawHatch2D(blk, ent, cs) {
  const col = cs.getPropertyValue('--entity-color').trim();
  const pm = ppm();
  const pts = ent.pts || [];
  if (pts.length < 3) return;

  // Outline
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(0.35, LW.VIS * pm);
  ctx.setLineDash(DASH.SOLID);
  ctx.beginPath();
  const f = real2px(blk, pts[0].u, pts[0].v);
  ctx.moveTo(f.x, f.y);
  for (let i = 1; i < pts.length; i++) {
    const q = real2px(blk, pts[i].u, pts[i].v);
    ctx.lineTo(q.x, q.y);
  }
  ctx.closePath();
  ctx.stroke();

  // Hatch fill — clip to polygon
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(f.x, f.y);
  for (let i = 1; i < pts.length; i++) {
    const q = real2px(blk, pts[i].u, pts[i].v);
    ctx.lineTo(q.x, q.y);
  }
  ctx.closePath();
  ctx.clip();

  // Compute bounding box
  let L = Infinity, R = -Infinity, B = Infinity, T = -Infinity;
  pts.forEach(p => {
    if (p.u < L) L = p.u; if (p.u > R) R = p.u;
    if (p.v < B) B = p.v; if (p.v > T) T = p.v;
  });
  const w = R - L, h = T - B;
  const pattern = ent.pattern || 'steel';
  const spacing = ent.spacing || 3;  // mm on sheet
  ctx.lineWidth = Math.max(0.15, LW.HATCH * pm);
  ctx.strokeStyle = colorAlpha(col, 0.7);

  if (pattern === 'steel') {
    drawCrossHatch(blk, L, B, w, h, col);
  } else if (pattern === 'cross') {
    drawCrossHatch(blk, L, B, w, h, col);
    // Second direction (−45°)
    const hatchSpacing = spacing * drawingScale;
    for (let d = -h; d < w + h; d += hatchSpacing) {
      rLine(blk, L + d, B, L + d + h, T);
    }
  } else if (pattern === 'concrete') {
    // Small dots at regular intervals
    const gap = spacing * drawingScale;
    for (let y = B + gap / 2; y < T; y += gap) {
      for (let x = L + gap / 2; x < R; x += gap) {
        const pp = real2px(blk, x, y);
        ctx.beginPath();
        ctx.arc(pp.x, pp.y, Math.max(0.4, 0.3 * pm), 0, Math.PI * 2);
        ctx.fillStyle = colorAlpha(col, 0.5);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

// ============================================================
// V22.6 MTEXT — multi-line wrapped text block
// ============================================================
// Data: { type:'mtext', u, v, text, sz, width }
// width = max line width in mm; lines wrap at word boundary.
function drawMText2D(blk, ent, cs) {
  const col = cs.getPropertyValue('--entity-color').trim();
  const pm = ppm();
  const p = real2px(blk, ent.u, ent.v);
  const fs = Math.max(9, (ent.sz || 3) * pm);
  ctx.font = `${fs}px system-ui`;
  ctx.fillStyle = col;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';

  const maxWidthPx = (ent.width || 100) * pm;  // convert mm to px
  const words = String(ent.text || '').split(/\s+/);
  const lines = [];
  let current = '';
  for (const w of words) {
    const test = current ? current + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidthPx && current) {
      lines.push(current);
      current = w;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);

  const lineH = fs * 1.2;
  lines.forEach((line, i) => {
    ctx.fillText(line, p.x, p.y + i * lineH);
  });
  ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
}

// ============================================================
// V22.6 REV SCHEDULE — auto-populated revision table
// ============================================================
// Renders a table at the entity's (u, v) origin (top-left). Scans ALL
// revisionTriangle entities across every view in the current sheet and
// aggregates them by rev number. Columns: REV | DESCRIPTION | DATE.
function drawRevSchedule2D(blk, ent, cs) {
  const col = cs.getPropertyValue('--entity-color').trim();
  const mute = cs.getPropertyValue('--mute').trim();
  const pm = ppm();

  // Aggregate all revision triangles across all views in the sheet, keyed
  // by rev number. Later entries of the same rev overwrite — so the user
  // can update a description by placing a new triangle with the same rev.
  const revs = {};
  for (const vk of Object.keys(entities2D)) {
    for (const e of entities2D[vk]) {
      if (e.type === 'revisionTriangle' && e.rev !== undefined && e.rev !== null) {
        const key = String(e.rev);
        revs[key] = {
          rev: key,
          description: e.description || revs[key]?.description || '',
          date: e.date || revs[key]?.date || '',
        };
      }
    }
  }
  const rows = Object.values(revs).sort((a, b) =>
    String(a.rev).localeCompare(String(b.rev), undefined, { numeric: true, sensitivity: 'base' })
  );

  // Table geometry — sizes in real-world mm so the table scales with zoom.
  const colW = [15, 55, 25];                    // widths in real-mm
  const rowH = 8;                               // row height in real-mm
  const totalW = colW.reduce((a, b) => a + b, 0);
  const headerH = 9;
  const nRows = Math.max(rows.length, 1);
  const totalH = headerH + nRows * rowH;

  const origin = real2px(blk, ent.u, ent.v);

  // Outline box
  ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.5, LW.VIS * pm);
  ctx.setLineDash(DASH.SOLID);
  ctx.strokeRect(
    origin.x,
    origin.y,
    totalW * viewport.zoom / drawingScale,
    totalH * viewport.zoom / drawingScale
  );

  // Column dividers + row dividers
  ctx.lineWidth = Math.max(0.25, LW.DIM * pm);
  let xOff = 0;
  for (let i = 0; i < colW.length - 1; i++) {
    xOff += colW[i];
    const xP = origin.x + xOff * viewport.zoom / drawingScale;
    ctx.beginPath();
    ctx.moveTo(xP, origin.y);
    ctx.lineTo(xP, origin.y + totalH * viewport.zoom / drawingScale);
    ctx.stroke();
  }
  // Header separator (slightly heavier)
  ctx.lineWidth = Math.max(0.5, LW.MW * pm);
  const headerY = origin.y + headerH * viewport.zoom / drawingScale;
  ctx.beginPath();
  ctx.moveTo(origin.x, headerY);
  ctx.lineTo(origin.x + totalW * viewport.zoom / drawingScale, headerY);
  ctx.stroke();
  // Inter-row dividers
  ctx.lineWidth = Math.max(0.2, LW.DIM * pm * 0.8);
  for (let i = 1; i < nRows; i++) {
    const yP = origin.y + (headerH + i * rowH) * viewport.zoom / drawingScale;
    ctx.beginPath();
    ctx.moveTo(origin.x, yP);
    ctx.lineTo(origin.x + totalW * viewport.zoom / drawingScale, yP);
    ctx.stroke();
  }

  // Header labels
  const fs = Math.max(8, 2.2 * pm);
  const fsHead = Math.max(8, 2.4 * pm);
  ctx.fillStyle = col;
  ctx.font = `bold ${fsHead}px system-ui`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const pad = 2;
  const cellCx = (i) => {
    let off = 0; for (let k = 0; k < i; k++) off += colW[k];
    return origin.x + (off + colW[i] / 2) * viewport.zoom / drawingScale;
  };
  const headerCy = origin.y + (headerH / 2) * viewport.zoom / drawingScale;
  ctx.fillText('REV', cellCx(0), headerCy);
  ctx.fillText('DESCRIPTION', cellCx(1), headerCy);
  ctx.fillText('DATE', cellCx(2), headerCy);

  // Data rows
  ctx.font = `${fs}px system-ui`;
  ctx.fillStyle = col;
  if (rows.length === 0) {
    ctx.textAlign = 'center';
    ctx.fillStyle = mute;
    ctx.fillText('(no revisions)', origin.x + totalW * viewport.zoom / drawingScale / 2,
                 origin.y + (headerH + rowH / 2) * viewport.zoom / drawingScale);
  } else {
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const cy = origin.y + (headerH + i * rowH + rowH / 2) * viewport.zoom / drawingScale;
      ctx.textAlign = 'center';
      ctx.fillText(r.rev, cellCx(0), cy);
      ctx.textAlign = 'left';
      const descX = origin.x + (colW[0] + pad) * viewport.zoom / drawingScale;
      ctx.fillText(r.description || '—', descX, cy);
      ctx.textAlign = 'center';
      ctx.fillText(r.date || '—', cellCx(2), cy);
    }
  }
  ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
}

// ---- WELD SYMBOL RENDERING (AS 1100) ----
