'use strict';

// V25 — placement tools: blockwork wall, smart anchor, reo bar, mesh, first-class leader, 2D-only steel section
// Extracted from dev/index.html lines 17887-19030 (2026-05-02 modular split)

// ---- BLOCKWORK WALL ----
// Parametric. Drag two corner points → wall length × height. Course and perp
// joints redrawn at the catalogue spacing.
//   { type:'blockWall', u, v, lengthMM, heightMM, blockKey,
//     aspect ('elev'|'plan'|'sec'), showJoints, bondOffset, lintelTop }
// (`view` would collide with the per-pane view-key on the entity record.)
function drawBlockWall2D(blk, ent, cs) {
  // Section strip (thin vertical view, width = block thickness) is a separate,
  // rotatable renderer; the rest of this function is the elevation extent.
  if (ent.wallMode === 'sec') { drawBlockWallSec2D(blk, ent, cs); return; }

  const cat = V25_BLOCK_DB[ent.blockKey || '190'] || V25_BLOCK_DB['190'];
  const col = cs.getPropertyValue('--entity-color').trim();
  const pm = ppm();
  const w = ent.lengthMM, h = ent.heightMM;
  const aspect = ent.aspect || ent.view || 'elev'; // back-compat with old field

  // Outline — each of the four edges is either a hard straight line (a true
  // wall/block edge the coursing is drawn from) or an AS 1100 section
  // break-line (per ent.breakEdges; absent/false = hard). Coursing below is
  // anchored to the hard bottom/left edges so anchors read true against it.
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(0.5, LW.VIS_HEAVY * pm);
  ctx.setLineDash([]);
  const be = ent.breakEdges || {};
  const ux0 = ent.u, ux1 = ent.u + w, vy0 = ent.v, vy1 = ent.v + h;
  const brkAmp = Math.min(w, h) * 0.06;
  const edge = (brk, ua, va, ub, vb) => {
    if (brk && typeof rZigzag === 'function') rZigzag(blk, ua, va, ub, vb, brkAmp);
    else rLine(blk, ua, va, ub, vb);
  };
  edge(be.bottom, ux0, vy0, ux1, vy0);
  edge(be.top,    ux0, vy1, ux1, vy1);
  edge(be.left,   ux0, vy0, ux0, vy1);
  edge(be.right,  ux1, vy0, ux1, vy1);

  if (aspect === 'elev') {
    const courseH = cat.h + cat.bed;   // 200 for std AU block
    const blockL = cat.l + cat.perp;   // 400 bond module
    // Coursing anchors to the wall's solid ("edge of wall") sides so full
    // blocks start from them; the partial block falls against the break-line
    // sides. breakEdges[side] === true ⇒ that side is a break-line, NOT a
    // coursing datum. Datum prefers top/left, falling back to bottom/right.
    const be = ent.breakEdges || {};
    const topSolid = !be.top, bottomSolid = !be.bottom;
    const leftSolid = !be.left, rightSolid = !be.right;
    const fromTop = topSolid || !bottomSolid;
    const fromLeft = leftSolid || !rightSolid;

    ctx.lineWidth = Math.max(0.2, LW.HATCH * pm);
    ctx.strokeStyle = colorAlpha(col, 0.85);

    // Bed joints — interior course lines stepped from the horizontal datum edge.
    if (fromTop) {
      for (let y = ent.v + h - courseH; y > ent.v + 0.5; y -= courseH) rLine(blk, ent.u, y, ent.u + w, y);
    } else {
      for (let y = ent.v + courseH; y < ent.v + h - 0.5; y += courseH) rLine(blk, ent.u, y, ent.u + w, y);
    }

    // Perp (head) joints — half-block staggered each course, anchored to the
    // vertical datum edge so the leading block of every course is full. Each
    // segment is clipped to its course band so nothing overshoots an edge.
    const perpsForBand = (yLo, yHi, courseIdx) => {
      const half = (courseIdx % 2 === 0) ? 0 : blockL / 2;
      if (fromLeft) {
        for (let x = ent.u + (half > 0 ? half : blockL); x < ent.u + w - 0.5; x += blockL) rLine(blk, x, yLo, x, yHi);
      } else {
        for (let x = ent.u + w - (half > 0 ? half : blockL); x > ent.u + 0.5; x -= blockL) rLine(blk, x, yLo, x, yHi);
      }
    };
    if (fromTop) {
      let ci = 0;
      for (let yHi = ent.v + h; yHi > ent.v + 0.5; yHi -= courseH) { perpsForBand(Math.max(yHi - courseH, ent.v), yHi, ci); ci++; }
    } else {
      let ci = 0;
      for (let yLo = ent.v; yLo < ent.v + h - 0.5; yLo += courseH) { perpsForBand(yLo, Math.min(yLo + courseH, ent.v + h), ci); ci++; }
    }

    // Optional lintel band at the top
    if (ent.lintelTop) {
      const lh = (typeof ent.lintelTop === 'number') ? ent.lintelTop : 290;
      ctx.lineWidth = Math.max(0.5, LW.VIS * pm);
      ctx.strokeStyle = col;
      rLine(blk, ent.u, ent.v + h - lh, ent.u + w, ent.v + h - lh);
    }
  } else if (aspect === 'plan' || aspect === 'sec') {
    // Plan view: hollow blocks → two parallel face shells with internal cores
    const t = cat.thk;
    const shellT = 32; // shell wall thickness ~32mm typical
    ctx.lineWidth = Math.max(0.3, LW.HATCH * pm);
    ctx.strokeStyle = colorAlpha(col, 0.85);
    rLine(blk, ent.u, ent.v + shellT, ent.u + w, ent.v + shellT);
    rLine(blk, ent.u, ent.v + h - shellT, ent.u + w, ent.v + h - shellT);
    // Cross webs — every block length
    const blockL = cat.l + cat.perp;
    for (let x = ent.u + blockL; x < ent.u + w; x += blockL) {
      rLine(blk, x, ent.v, x, ent.v + h);
    }
  }
  // No auto label — the engineer adds a leader note where wanted.
}

// ---- BLOCKWORK WALL — SECTION STRIP ----
// Thin vertical view of a wall (you see its thickness). Two-click directional:
// (u,v) = centreline start, runs at `rot` for `lengthMM`; width = block
// thickness centred on the line. Drawn in a local frame (lu along the strip,
// lv across the thickness ±half) so the coursing tilts with an angled strip.
//   { type:'blockWall', wallMode:'sec', u, v, rot, lengthMM, blockKey,
//     endBreak:'start'|'end'|'none'|'both', grouted:bool }
function drawBlockWallSec2D(blk, ent, cs) {
  const cat = V25_BLOCK_DB[ent.blockKey || '190'] || V25_BLOCK_DB['190'];
  const col = cs.getPropertyValue('--entity-color').trim();
  const pm = ppm();
  const L = ent.lengthMM || 0;
  const thk = cat.thk;
  const half = thk / 2;
  if (L < 1) return;
  const rot = (ent.rot || 0) * Math.PI / 180;
  const cosR = Math.cos(rot), sinR = Math.sin(rot);
  // Local (lu along strip 0..L, lv across thickness -half..+half) → screen px.
  const project = (lu, lv) => real2px(blk, ent.u + lu * cosR - lv * sinR, ent.v + lu * sinR + lv * cosR);
  const strokeLocal = (x1, y1, x2, y2) => {
    const a = project(x1, y1), b = project(x2, y2);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  };

  ctx.save();
  if (ent.opacity != null) ctx.globalAlpha = ent.opacity;
  ctx.setLineDash([]);

  const courseH = cat.h + cat.bed;                          // 200 for std AU block
  const shellT = Math.min(35, Math.max(25, thk * 0.18));    // face-shell thickness
  const coreW = thk - 2 * shellT;

  // Grouted cores — light 45° hatch of the central band between the face shells.
  if (ent.grouted && coreW > 4) {
    ctx.save();
    ctx.beginPath();
    [[0, -half + shellT], [L, -half + shellT], [L, half - shellT], [0, half - shellT]].forEach((p, i) => {
      const sp = project(p[0], p[1]); if (i === 0) ctx.moveTo(sp.x, sp.y); else ctx.lineTo(sp.x, sp.y);
    });
    ctx.closePath(); ctx.clip();
    ctx.strokeStyle = colorAlpha(col, 0.5);
    ctx.lineWidth = Math.max(0.3, LW.HATCH * pm);
    const step = 12;
    for (let s = -coreW; s < L + coreW; s += step) {
      strokeLocal(s, -half + shellT, s + coreW, half - shellT);
    }
    ctx.restore();
  }

  // Face-shell inner lines (so it reads as a hollow block, not solid) — medium.
  ctx.strokeStyle = colorAlpha(col, 0.9);
  ctx.lineWidth = Math.max(0.3, LW.VIS * pm);
  strokeLocal(0, -half + shellT, L, -half + shellT);
  strokeLocal(0,  half - shellT, L,  half - shellT);

  // Bed joints — across the full width every course (the cut mortar joints).
  ctx.lineWidth = Math.max(0.3, LW.VIS * pm);
  for (let lu = courseH; lu < L - 0.5; lu += courseH) {
    strokeLocal(lu, -half, lu, half);
  }

  // Wall faces — the two long cut edges, heavy.
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(0.6, LW.VIS_HEAVY * pm);
  strokeLocal(0, -half, L, -half);
  strokeLocal(0,  half, L,  half);

  // End caps — clean line (true edge, e.g. top of wall) or zigzag section
  // break (the cut continues into the structure beyond the detail).
  const eb = ent.endBreak || 'start';
  const breakStart = (eb === 'start' || eb === 'both');
  const breakEnd   = (eb === 'end'   || eb === 'both');
  const drawEnd = (lu, isBreak) => {
    if (!isBreak) { strokeLocal(lu, -half, lu, half); return; }
    const amp = thk * 0.16, n = 3;
    const pts = [[lu, -half]];
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const sign = (i % 2 === 0) ? 1 : -1;
      pts.push([lu + amp * sign, -half + thk * t]);
    }
    pts.push([lu, half]);
    ctx.beginPath();
    pts.forEach((p, i) => { const sp = project(p[0], p[1]); if (i === 0) ctx.moveTo(sp.x, sp.y); else ctx.lineTo(sp.x, sp.y); });
    ctx.stroke();
  };
  drawEnd(0, breakStart);
  drawEnd(L, breakEnd);

  // No auto label — the engineer adds a leader note where wanted.
  ctx.restore();
}

// ---- SMART ANCHOR (Trubolt / Chemset / Coach / Self-tap / Through) ----
//   { type:'anchor', kind, size, embed, count, spacing, u, v, rot,
//     leaderTipU, leaderTipV, txtU, txtV, txt }
function drawAnchor2D(blk, ent, cs) {
  const def = V25_ANCHOR_DB[ent.kind] || V25_ANCHOR_DB.chemset;
  const col = cs.getPropertyValue('--entity-color').trim();
  const pm = ppm();
  const rot = (ent.rot || 0) * Math.PI / 180;
  const cosR = Math.cos(rot), sinR = Math.sin(rot);
  // Anchor symbol — head + shaft pointing in +V direction at rot=0
  const headD = def.headD || 26;
  const shaftD = def.shaftD || def.sleeveD || 16;
  const totalLen = ent.embed || (def.defaults && def.defaults.embed) || 100;

  ctx.strokeStyle = col; ctx.fillStyle = col;
  ctx.lineWidth = Math.max(0.5, LW.VIS * pm);
  ctx.setLineDash([]);

  // Local frame: anchor goes from (0,0) downward by totalLen
  // Translate via (u,v) and rotate by rot.
  const project = (lu, lv) => {
    const wu = ent.u + lu * cosR - lv * sinR;
    const wv = ent.v + lu * sinR + lv * cosR;
    return real2px(blk, wu, wv);
  };

  // Head (washer + nut combo — drawn as small rect + cone for trubolt)
  if (ent.kind === 'trubolt') {
    // Cone-shaped wedge at top + sleeve below
    const a = project(-headD/2, 0);
    const b = project(headD/2, 0);
    const c = project(shaftD/2, -8);
    const d = project(-shaftD/2, -8);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
    ctx.stroke();
    // Sleeve below
    const e = project(-shaftD/2, -8);
    const f = project(shaftD/2, -8);
    const g = project(shaftD/2, -totalLen);
    const hh = project(-shaftD/2, -totalLen);
    ctx.beginPath();
    ctx.moveTo(e.x, e.y); ctx.lineTo(f.x, f.y); ctx.lineTo(g.x, g.y); ctx.lineTo(hh.x, hh.y); ctx.closePath();
    ctx.stroke();
  } else if (ent.kind === 'chemset') {
    // Threaded rod with crosshatched epoxy zone
    const a = project(-headD/2, 4); const b = project(headD/2, 4);
    const c = project(headD/2, 0); const d = project(-headD/2, 0);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
    ctx.stroke();
    // Shaft
    const e = project(-shaftD/2, 0); const f = project(shaftD/2, 0);
    const g = project(shaftD/2, -totalLen); const hh = project(-shaftD/2, -totalLen);
    ctx.beginPath();
    ctx.moveTo(e.x, e.y); ctx.lineTo(f.x, f.y); ctx.lineTo(g.x, g.y); ctx.lineTo(hh.x, hh.y); ctx.closePath();
    ctx.stroke();
    // Thread marks (zigzag)
    ctx.lineWidth = Math.max(0.2, LW.HATCH * pm);
    for (let dy = -8; dy > -totalLen; dy -= 4) {
      const p1 = project(-shaftD/2, dy);
      const p2 = project(shaftD/2, dy - 2);
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }
  } else {
    // Generic head + shaft
    const a = project(-headD/2, 4); const b = project(headD/2, 4);
    const c = project(headD/2, 0); const d = project(-headD/2, 0);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
    ctx.stroke();
    const e = project(-shaftD/2, 0); const f = project(shaftD/2, 0);
    const g = project(shaftD/2, -totalLen); const hh = project(-shaftD/2, -totalLen);
    ctx.beginPath();
    ctx.moveTo(e.x, e.y); ctx.lineTo(f.x, f.y); ctx.lineTo(g.x, g.y); ctx.lineTo(hh.x, hh.y); ctx.closePath();
    ctx.stroke();
  }

  // Auto leader — arrow tip at the anchor head, text box at txtU/txtV
  if (ent.txtU !== undefined && ent.txtV !== undefined) {
    const tip = project(0, 4);
    const txt = real2px(blk, ent.txtU, ent.txtV);
    ctx.lineWidth = Math.max(0.35, LW.DIM * pm);
    ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(txt.x, txt.y); ctx.stroke();
    // Arrow head
    const ang = Math.atan2(tip.y - txt.y, tip.x - txt.x);
    const ah = 6;
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(tip.x - ah * Math.cos(ang - 0.3), tip.y - ah * Math.sin(ang - 0.3));
    ctx.lineTo(tip.x - ah * Math.cos(ang + 0.3), tip.y - ah * Math.sin(ang + 0.3));
    ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    // Multi-line text
    const text = ent.txt || v25AnchorRenderTemplate(ent);
    ctx.font = `${Math.max(9, 2.5 * pm)}px system-ui`;
    ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const lines = String(text).split('\n');
    const lh = Math.max(11, 3 * pm);
    lines.forEach((ln, i) => ctx.fillText(ln, txt.x + 4, txt.y + i * lh));
    ctx.textAlign = 'start';
  }
}

function v25AnchorRenderTemplate(ent) {
  const def = V25_ANCHOR_DB[ent.kind] || V25_ANCHOR_DB.chemset;
  const tpl = def.template;
  return tpl
    .replace('{count}', ent.count || (def.defaults && def.defaults.count) || 1)
    .replace('{size}', ent.size || (def.defaults && def.defaults.size) || 'M16')
    .replace('{embed}', ent.embed || (def.defaults && def.defaults.embed) || 100)
    .replace('{spacing}', ent.spacing || (def.defaults && def.defaults.spacing) || 200);
}

// ---- REINFORCEMENT BAR ----
//   { type:'reoBar', barKey:'N16', pts:[{u,v}], cogStart, cogEnd,
//     hookStart, hookEnd, lapEnd, mark, spacing, sectionDot }
function drawReoBar2D(blk, ent, cs) {
  const bar = V25_REO_DB.bars[ent.barKey || 'N16'] || V25_REO_DB.bars.N16;
  const col = cs.getPropertyValue('--entity-color').trim();
  const pm = ppm();
  ctx.strokeStyle = col;
  ctx.fillStyle = col;
  ctx.lineWidth = Math.max(0.5, (bar.d / 12) * LW.VIS * pm);
  ctx.setLineDash([]);

  // Section-dot mode: just a filled dot
  if (ent.sectionDot && ent.pts && ent.pts.length >= 1) {
    const p = ent.pts[0];
    rFillCircle(blk, p.u, p.v, bar.d);
    return;
  }
  if (!ent.pts || ent.pts.length < 2) return;

  const pts = ent.pts;
  // Cogs and hooks: 90° / 180° bend on the end. The visible polyline already
  // includes the cog/hook segment if the user clicked a cog point — this flag
  // just adds a small return at the end perpendicular to the last segment.
  const cogLen = Math.max(75, 12 * bar.d);

  ctx.beginPath();
  let p0 = real2px(blk, pts[0].u, pts[0].v);
  ctx.moveTo(p0.x, p0.y);
  for (let i = 1; i < pts.length; i++) {
    const p = real2px(blk, pts[i].u, pts[i].v);
    ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();

  // Cog/hook at start
  const drawEndDecoration = (a, b, mode) => {
    const dx = b.u - a.u, dy = b.v - a.v, l = Math.hypot(dx, dy) || 1;
    const ux = dx / l, uy = dy / l; // unit along bar from end → next point
    const px = -uy, py = ux; // perpendicular
    const len = mode === 'hook' ? cogLen * 0.6 : cogLen;
    const angle = mode === 'hook' ? Math.PI : Math.PI / 2;
    // Bend turning 90° (cog) or 180° (hook) from the bar direction at the end
    const t1 = real2px(blk, a.u + px * len, a.v + py * len);
    const a2 = real2px(blk, a.u, a.v);
    ctx.beginPath(); ctx.moveTo(a2.x, a2.y); ctx.lineTo(t1.x, t1.y); ctx.stroke();
  };
  if (ent.cogStart) drawEndDecoration(pts[0], pts[1], 'cog');
  if (ent.cogEnd) drawEndDecoration(pts[pts.length - 1], pts[pts.length - 2], 'cog');
  if (ent.hookStart) drawEndDecoration(pts[0], pts[1], 'hook');
  if (ent.hookEnd) drawEndDecoration(pts[pts.length - 1], pts[pts.length - 2], 'hook');

  // Lap symbol at end — short parallel bar marker + dim
  if (ent.lapEnd && pts.length >= 2) {
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    const dx = b.u - a.u, dy = b.v - a.v, l = Math.hypot(dx, dy) || 1;
    const ux = dx / l, uy = dy / l;
    const off = 4 * bar.d;
    const startU = b.u - ux * ent.lapEnd;
    const startV = b.v - uy * ent.lapEnd;
    rLine(blk, startU + (-uy) * off, startV + ux * off, b.u + (-uy) * off, b.v + ux * off);
    // Lap dim text
    const midU = (startU + b.u) / 2;
    const midV = (startV + b.v) / 2;
    const tp = real2px(blk, midU + (-uy) * (off + 2), midV + ux * (off + 2));
    ctx.font = `${Math.max(8, 2.4 * pm)}px system-ui`;
    ctx.fillStyle = col; ctx.textAlign = 'center';
    ctx.fillText(`${ent.lapEnd} LAP`, tp.x, tp.y);
    ctx.textAlign = 'start';
  }

  // Bar mark callout — draws a leader to the centre of the polyline
  if (ent.mark || ent.spacing) {
    const mid = pts[Math.floor(pts.length / 2)];
    const tp = real2px(blk, mid.u + 30, mid.v + 30);
    const sp = real2px(blk, mid.u, mid.v);
    ctx.lineWidth = Math.max(0.35, LW.DIM * pm);
    ctx.beginPath(); ctx.moveTo(sp.x, sp.y); ctx.lineTo(tp.x, tp.y); ctx.stroke();
    const label = ent.mark || (`${ent.barKey || 'N16'}${ent.spacing ? '-' + ent.spacing : ''}`);
    ctx.font = `${Math.max(9, 2.6 * pm)}px system-ui`;
    ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText(label, tp.x + 2, tp.y - 2);
    ctx.textAlign = 'start';
  }
}

// ---- MESH ----
//   { type:'mesh', meshKey:'SL72', shape:'rect', u, v, w, h, position:'BTM'|'TOP' }
function drawMesh2D(blk, ent, cs) {
  const m = V25_REO_DB.meshes[ent.meshKey || 'SL72'] || V25_REO_DB.meshes.SL72;
  const col = cs.getPropertyValue('--entity-color').trim();
  const pm = ppm();
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(0.25, LW.HATCH * pm);
  ctx.setLineDash([]);
  // Outline
  rRect(blk, ent.u, ent.v, ent.w, ent.h);
  // Cross hatch grid representation (sparse)
  const sp = m.spacing;
  for (let x = ent.u + sp; x < ent.u + ent.w; x += sp) {
    rLine(blk, x, ent.v, x, ent.v + ent.h);
  }
  for (let y = ent.v + sp; y < ent.v + ent.h; y += sp) {
    rLine(blk, ent.u, y, ent.u + ent.w, y);
  }
  // Auto-callout
  const tp = real2px(blk, ent.u + ent.w / 2, ent.v + ent.h + 12);
  ctx.font = `bold ${Math.max(9, 2.8 * pm)}px system-ui`;
  ctx.fillStyle = col; ctx.textAlign = 'center';
  ctx.fillText(`${m.label} MESH ${ent.position || 'BTM'}`, tp.x, tp.y);
  ctx.textAlign = 'start';
}

// ---- FIRST-CLASS LEADER ----
//   { type:'leader2', tipU, tipV, txtU, txtV, txt, attachId, elbow:[{u,v}] }
function drawLeader2D(blk, ent, cs) {
  const col = cs.getPropertyValue('--entity-color').trim();
  const pm = ppm();
  // Resolve tip from attachment if present
  let tipU = ent.tipU, tipV = ent.tipV;
  if (ent.attachId && entities2D[blk.viewKey]) {
    const att = entities2D[blk.viewKey].find(e => e.id === ent.attachId);
    if (att && att.u !== undefined && att.v !== undefined) { tipU = att.u; tipV = att.v; }
  }
  const tip = real2px(blk, tipU, tipV);
  const txt = real2px(blk, ent.txtU, ent.txtV);
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(0.35, LW.DIM * pm);
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(txt.x, txt.y);
  if (ent.elbow && ent.elbow.length) {
    ent.elbow.forEach(p => {
      const e = real2px(blk, p.u, p.v); ctx.lineTo(e.x, e.y);
    });
  }
  ctx.lineTo(tip.x, tip.y);
  ctx.stroke();
  // Arrow head
  const fromX = ent.elbow && ent.elbow.length ? real2px(blk, ent.elbow[ent.elbow.length-1].u, ent.elbow[ent.elbow.length-1].v).x : txt.x;
  const fromY = ent.elbow && ent.elbow.length ? real2px(blk, ent.elbow[ent.elbow.length-1].u, ent.elbow[ent.elbow.length-1].v).y : txt.y;
  const ang = Math.atan2(tip.y - fromY, tip.x - fromX);
  const ah = 6;
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(tip.x - ah * Math.cos(ang - 0.3), tip.y - ah * Math.sin(ang - 0.3));
  ctx.lineTo(tip.x - ah * Math.cos(ang + 0.3), tip.y - ah * Math.sin(ang + 0.3));
  ctx.closePath(); ctx.fillStyle = col; ctx.fill();
  // Multi-line text
  const lines = String(ent.txt || '').split('\n');
  ctx.font = `${Math.max(9, 2.6 * pm)}px system-ui`;
  ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const lh = Math.max(11, 3 * pm);
  lines.forEach((ln, i) => ctx.fillText(ln, txt.x + 4, txt.y + i * lh));
  ctx.textAlign = 'start';
}

// ---- 2D-ONLY STEEL SECTION ----
// Members in 2D mode are drawn as 2D entities (not 3D objects). They support
// elevation and cross-section views via an `aspect` flag (named to avoid
// colliding with the entity's per-pane `view` key).
//   { type:'mem2', memberType:'ub'|'shs'|..., section, u,v, length, rot, aspect:'elev'|'sec' }
// Effective axial roll for a mem2 — the single "which face / how spun" DOF.
// New entities carry ent.roll (0/90/180/270). Older saved entities are mapped
// on read: legacy cross-sections stored the glyph spin in ent.rot (web-horiz
// = 90); legacy elevations and legacy PFC sections (openSide was a visual
// no-op in the old renderer) map to roll 0. Lets the renderer rely on roll
// without a destructive load-time migration.
function v25Mem2EffRoll(ent) {
  if (!ent) return 0;
  // Number() so a roll edited via the inspector <select> (stored as a string)
  // still compares equal to the numeric 90/180/270 the renderer branches on.
  if (ent.roll != null) return Number(ent.roll) || 0;
  if ((ent.aspect || 'elev') === 'sec') return ent.rot || 0;
  return 0;
}

function drawMem2D(blk, ent, cs) {
  const col = v25EntColour(ent, cs);
  const clCol = cs.getPropertyValue('--cl-color').trim() || col;
  const hidCol = cs.getPropertyValue('--hid-color').trim() || col;
  const fillCol = ent.fillColour || null;
  // V25-layout-overhaul Phase 7 — opacity override.
  const _opacityWas = ctx.globalAlpha;
  ctx.globalAlpha = _opacityWas * v25EntOpacity(ent);
  try {
  const pm = ppm();
  const visLW = Math.max(0.5, LW.VIS * pm);
  const cutLW = Math.max(1, LW.CUT * pm);
  const hidLW = Math.max(0.25, LW.HID * pm);
  const clLW = Math.max(0.25, LW.CL * pm);
  // Hidden-line dashes (RHS/SHS inner walls, UB hidden web, PFC flange roots)
  // are an AS 1100 drafting convention sized on the PRINTED sheet, so the dash
  // pattern scales with the sheet (sheet-mm × screen-px-per-sheet-mm =
  // viewport.zoom). The shared DASH.HIDDEN constant is fixed screen-px — it
  // stays ~5px regardless of zoom, so at a normal detail zoom the wall lines
  // collapse into a faint, near-solid dotted texture that's hard to see.
  // Scaling by viewport.zoom keeps them crisp and proportionate at any zoom AND
  // exports true-to-paper (the vector-PDF path runs with viewport.zoom == 1 in
  // sheet-mm space, so these px values land directly as sheet-mm). Centrelines
  // keep the shared fixed-px DASH.CL: a fixed sheet-mm chain-dot goes coarse on
  // the short centrelines of a cross-section, where fixed-px still reads well.
  // NOTE: the SHS/RHS/CHS *elevation* inner-wall WIDTH is no longer set from
  // hidLW — it comes from the per-member MEM2_HID_LW / MEM2_HID_LW_PX ramp
  // (hollowHidLW, in the hollow-section branch below). The dash PATTERN
  // (hidDashPx) is still shared across all hidden lines (UB web, PFC, hollow).
  const hidDashPx = [3, 2].map(v => v * viewport.zoom); // hidden line — 3mm dash / 2mm gap on the sheet
  ctx.strokeStyle = col; ctx.fillStyle = col;
  ctx.setLineDash([]);
  const aspect = ent.aspect || 'elev';
  // Axial roll picks the section glyph spin AND the elevation face. In SECTION
  // the glyph is rotated by roll; in ELEVATION the member runs along the paper
  // drag angle (ent.rot) and roll instead selects which face is drawn.
  const effRoll = v25Mem2EffRoll(ent);
  const rotDeg = (aspect === 'sec') ? effRoll : (ent.rot || 0);
  const rot = rotDeg * Math.PI / 180;
  const cosR = Math.cos(rot), sinR = Math.sin(rot);
  // Local-frame point → screen pixel.
  const project = (lu, lv) => {
    const wu = ent.u + lu * cosR - lv * sinR;
    const wv = ent.v + lu * sinR + lv * cosR;
    return real2px(blk, wu, wv);
  };
  // V25 depth order (72h) — silhouettes of any member pushed in FRONT of this
  // one. Empty unless the user assigned a front/back depth, so the common case
  // is byte-for-byte unchanged.
  const _occPolys = (typeof v25DepthOccludersFor === 'function' &&
                     typeof v25Mem2WorldOutline === 'function')
    ? v25DepthOccludersFor(blk.viewKey, ent.id, (typeof ent.z === 'number' ? ent.z : 0),
        v25Mem2WorldOutline(ent).map(p => ({ u: p[0], v: p[1] })))
    : null;
  // Helper to stroke a local-frame polyline. When this member sits behind one
  // or more others, SOLID (visible) edges are split into solid + AS 1100 hidden
  // (dashed) sub-segments wherever a front member covers them; hidden/centreline
  // strokes (which set a non-empty dash before calling) pass straight through.
  const strokeLine = (x1, y1, x2, y2) => {
    if (_occPolys && _occPolys.length && ctx.getLineDash().length === 0 &&
        typeof v25DepthClipWorldSeg === 'function') {
      const wu1 = ent.u + x1 * cosR - y1 * sinR, wv1 = ent.v + x1 * sinR + y1 * cosR;
      const wu2 = ent.u + x2 * cosR - y2 * sinR, wv2 = ent.v + x2 * sinR + y2 * cosR;
      const segs = v25DepthClipWorldSeg(wu1, wv1, wu2, wv2, _occPolys);
      const sStyle = ctx.strokeStyle, sLW = ctx.lineWidth, occLW = Math.max(hidLW, sLW * 0.6);
      for (let si = 0; si < segs.length; si++) {
        const s = segs[si];
        const a = real2px(blk, s.u1, s.v1), b = real2px(blk, s.u2, s.v2);
        if (s.occluded) { ctx.strokeStyle = hidCol; ctx.lineWidth = occLW; ctx.setLineDash(hidDashPx); }
        else { ctx.strokeStyle = sStyle; ctx.lineWidth = sLW; ctx.setLineDash([]); }
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      ctx.strokeStyle = sStyle; ctx.lineWidth = sLW; ctx.setLineDash([]);
      return;
    }
    const a = project(x1, y1), b = project(x2, y2);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  };
  // Build a closed local-frame polygon and fill it with `fillCol` (skipped
  // when no fill override is set so the member stays "outline only").
  const fillPoly = (pts) => {
    if (!fillCol || !pts || pts.length < 3) return;
    ctx.save();
    ctx.fillStyle = fillCol;
    ctx.beginPath();
    pts.forEach((p, i) => { const sp = project(p[0], p[1]); if (i === 0) ctx.moveTo(sp.x, sp.y); else ctx.lineTo(sp.x, sp.y); });
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  // Z-style breakline crossing the end face of the section. `outwardSign`
  // is +1 for the far end of the member (kink jogs in the broken-off
  // direction) and -1 for the near end. Replaces the straight cap line and
  // signals "member continues beyond this detail". Kept deliberately small
  // so it reads as a notation, not a feature of the geometry.
  const drawBreakCap = (xLocal, yFrom, yTo, outwardSign) => {
    const span = yTo - yFrom;
    const amp = Math.abs(span) * 0.10;
    const o = outwardSign > 0 ? 1 : -1;
    const segs = [
      [xLocal,           yFrom],
      [xLocal,           yFrom + 0.40 * span],
      [xLocal + amp * o, yFrom + 0.47 * span],
      [xLocal - amp * o, yFrom + 0.53 * span],
      [xLocal,           yFrom + 0.60 * span],
      [xLocal,           yTo],
    ];
    ctx.beginPath();
    segs.forEach((p, i) => {
      const sp = project(p[0], p[1]);
      if (i === 0) ctx.moveTo(sp.x, sp.y); else ctx.lineTo(sp.x, sp.y);
    });
    ctx.stroke();
  };
  const drawEndCap = (xLocal, yFrom, yTo, kind, outwardSign) => {
    if (kind === 'breakline') drawBreakCap(xLocal, yFrom, yTo, outwardSign);
    else strokeLine(xLocal, yFrom, xLocal, yTo);
  };

  if (ent.memberType === 'ub' || ent.memberType === 'uc' || ent.memberType === 'wb') {
    // UB_DB has UC + WB merged in at module load, so the trailing fallback
    // resolves WB sections too.
    const dbS = (ent.memberType === 'ub' ? UB_DB[ent.section] : UC_DB[ent.section]) || UB_DB[ent.section];
    if (!dbS) return;
    const d = dbS.d, bf = dbS.bf, tf = dbS.tf, tw = dbS.tw;
    const hd = d / 2, htw = tw / 2, hbf = bf / 2;
    if (aspect === 'sec') {
      // Cross-section: I-shape outline at proper bf × d, plus centrelines.
      const pts = [
        [-hbf, hd], [hbf, hd], [hbf, hd - tf], [htw, hd - tf],
        [htw, -(hd - tf)], [hbf, -(hd - tf)], [hbf, -hd], [-hbf, -hd],
        [-hbf, -(hd - tf)], [-htw, -(hd - tf)], [-htw, hd - tf], [-hbf, hd - tf],
      ];
      fillPoly(pts);
      ctx.lineWidth = cutLW;
      ctx.beginPath();
      pts.forEach((p, i) => {
        const sp = project(p[0], p[1]);
        if (i === 0) ctx.moveTo(sp.x, sp.y); else ctx.lineTo(sp.x, sp.y);
      });
      ctx.closePath(); ctx.stroke();
      // Centrelines
      ctx.strokeStyle = clCol; ctx.lineWidth = clLW; ctx.setLineDash(DASH.CL);
      strokeLine(-hbf - 8, 0, hbf + 8, 0);
      strokeLine(0, -hd - 8, 0, hd + 8);
      ctx.setLineDash([]); ctx.strokeStyle = col;
    } else if (effRoll === 90 || effRoll === 270) {
      // Flange-face elevation — looking at the beam on its flange. The outline
      // is the flange WIDTH (bf) tall; the web hides behind the flange and is
      // shown as two AS 1100 hidden lines at ±tw/2. Honours the same auto-mitre
      // / welded-cap pipeline as the web-face view.
      const len = ent.length || 600;
      const T = hbf, B = -hbf;
      const trims = (typeof jointTrimsForMem2 === 'function')
        ? jointTrimsForMem2(ent, blk.viewKey) : null;
      const capA = trims && trims.a ? null
        : ((typeof v25Mem2ResolveCap === 'function') ? v25Mem2ResolveCap(ent, 'A') : null);
      const capB = trims && trims.b ? null
        : ((typeof v25Mem2ResolveCap === 'function') ? v25Mem2ResolveCap(ent, 'B') : null);
      const capX = (y, def, cap) => {
        if (!cap) return def;
        return cap.topLocalX + (T - y) / (2 * T) * (cap.botLocalX - cap.topLocalX);
      };
      const xA = (y) => trims && trims.a ? trims.a.uAtV(y) : capX(y, 0, capA);
      const xB = (y) => trims && trims.b ? trims.b.uAtV(y) : capX(y, len, capB);
      fillPoly([[xA(T), T], [xB(T), T], [xB(B), B], [xA(B), B]]);
      ctx.lineWidth = cutLW;
      strokeLine(xA(T), T, xB(T), T);   // flange tip (top edge)
      strokeLine(xA(B), B, xB(B), B);   // flange tip (bottom edge)
      if (capA) strokeLine(capA.topLocalX, T, capA.botLocalX, B);
      else if (trims && trims.a) strokeLine(xA(T), T, xA(B), B);
      else drawEndCap(0, T, B, ent.endA || 'normal', -1);
      if (capB) strokeLine(capB.topLocalX, T, capB.botLocalX, B);
      else if (trims && trims.b) strokeLine(xB(T), T, xB(B), B);
      else drawEndCap(len, T, B, ent.endB || 'normal', +1);
      // Hidden web — two dashed lines at ±tw/2 sitting behind the flange.
      ctx.strokeStyle = hidCol; ctx.lineWidth = hidLW; ctx.setLineDash(hidDashPx);
      strokeLine(xA(htw), htw, xB(htw), htw);
      strokeLine(xA(-htw), -htw, xB(-htw), -htw);
      ctx.setLineDash([]); ctx.strokeStyle = col;
      const clMinF = Math.min(0, xA(0)) - 10, clMaxF = Math.max(len, xB(0)) + 10;
      ctx.strokeStyle = clCol; ctx.lineWidth = clLW; ctx.setLineDash(DASH.CL);
      strokeLine(clMinF, 0, clMaxF, 0);
      ctx.setLineDash([]); ctx.strokeStyle = col;
      const weldAf = capA || (trims && trims.a
        ? { topLocalX: xA(T), botLocalX: xA(B), weldSize: trims.a.weldSize || 6 } : null);
      const weldBf = capB || (trims && trims.b
        ? { topLocalX: xB(T), botLocalX: xB(B), weldSize: trims.b.weldSize || 6 } : null);
      _drawCapWeld(weldAf, T, project);
      _drawCapWeld(weldBf, T, project);
    } else {
      // Elevation — six horizontal lines (top + flange-bottom + flange-top
      // + bottom + 2 ends) + chain-dot centreline. Mirrors 3D drawUB().
      const len = ent.length || 600;
      const T = hd, B = -hd, ftBot = T - tf, fbTop = B + tf;
      // V14-J — endpoint-to-endpoint joint trim (default mitre, or priority
      // butt-cut when the user has picked one via the joint menu) takes
      // precedence over the legacy single-host cap.
      const trims = (typeof jointTrimsForMem2 === 'function')
        ? jointTrimsForMem2(ent, blk.viewKey) : null;
      const capA = trims && trims.a ? null
        : ((typeof v25Mem2ResolveCap === 'function') ? v25Mem2ResolveCap(ent, 'A') : null);
      const capB = trims && trims.b ? null
        : ((typeof v25Mem2ResolveCap === 'function') ? v25Mem2ResolveCap(ent, 'B') : null);
      const capX = (y, def, cap) => {
        if (!cap) return def;
        return cap.topLocalX + (T - y) / (2 * T) * (cap.botLocalX - cap.topLocalX);
      };
      // Trim formula uAtV(v) describes a CUT LINE through M's body. We do
      // NOT clamp to [0, len] — for an angled brace butting against a flat
      // outer face, one corner of the brace must EXTEND past the original
      // end face so both flange edges land flush on the host.
      const xA = (y) => trims && trims.a ? trims.a.uAtV(y) : capX(y, 0, capA);
      const xB = (y) => trims && trims.b ? trims.b.uAtV(y) : capX(y, len, capB);
      // Fill polygon — straight cap on each end (the cut is linear, no kink).
      const fillPts = [];
      fillPts.push([xA(T), T]);
      fillPts.push([xB(T), T]);
      fillPts.push([xB(B), B]);
      fillPts.push([xA(B), B]);
      fillPoly(fillPts);
      ctx.lineWidth = cutLW;
      strokeLine(xA(T),     T,     xB(T),     T);      // top flange (top edge)
      strokeLine(xA(ftBot), ftBot, xB(ftBot), ftBot);  // top flange (under-edge)
      strokeLine(xA(B),     B,     xB(B),     B);      // bottom flange (bottom edge)
      strokeLine(xA(fbTop), fbTop, xB(fbTop), fbTop);  // bottom flange (top-edge)
      if (capA) {
        strokeLine(capA.topLocalX, T, capA.botLocalX, B);
      } else if (trims && trims.a) {
        strokeLine(xA(T), T, xA(B), B);
      } else {
        drawEndCap(0, T, B, ent.endA || 'normal', -1);
      }
      if (capB) {
        strokeLine(capB.topLocalX, T, capB.botLocalX, B);
      } else if (trims && trims.b) {
        strokeLine(xB(T), T, xB(B), B);
      } else {
        drawEndCap(len, T, B, ent.endB || 'normal', +1);
      }
      // Centreline — extend to cover any flange overhang past the original
      // end face when the auto-joint trim extended the cut.
      const clMinUB = Math.min(0, xA(0)) - 10;
      const clMaxUB = Math.max(len, xB(0)) + 10;
      ctx.strokeStyle = clCol; ctx.lineWidth = clLW; ctx.setLineDash(DASH.CL);
      strokeLine(clMinUB, 0, clMaxUB, 0);
      ctx.setLineDash([]); ctx.strokeStyle = col;
      // Fillet weld hatching along each mitre cap. Auto-joint trims need a
      // synthesised cap so the hatch follows the cut line — see SHS branch.
      const weldA_ub = capA || (trims && trims.a
        ? { topLocalX: xA(T), botLocalX: xA(B), weldSize: trims.a.weldSize || 6 }
        : null);
      const weldB_ub = capB || (trims && trims.b
        ? { topLocalX: xB(T), botLocalX: xB(B), weldSize: trims.b.weldSize || 6 }
        : null);
      _drawCapWeld(weldA_ub, T, project);
      _drawCapWeld(weldB_ub, T, project);
    }
  } else if (ent.memberType === 'pfc') {
    // V26 — Parallel Flange Channel. Geometry per AS/NZS 3679.1 + AISC DCT
    // Vol 1 Table 3.1-7(A). The cross-section is asymmetric (C-shape); we
    // store `ent.openSide` ∈ { '+v', '-v' } so the user can flip the open face
    // independently of the entity rotation. AS 1100 §3.12 default convention:
    // open face points AWAY from the column / support — i.e. '-v' (toward the
    // bottom of the local frame). Elevation draws as a symmetric rectangle
    // with flange-tip inner lines, identical to a UB in side-view — the open
    // face only shows in cross-section.
    const dbS = (typeof PFC_DB === 'object') ? PFC_DB[ent.section] : null;
    if (!dbS) return;
    const d = dbS.d, bf = dbS.bf, tf = dbS.tf, tw = dbS.tw;
    const hd = d / 2, hbf = bf / 2;
    if (aspect === 'sec') {
      // Cross-section C-shape. Local frame:
      //   u axis = horizontal (along bf), v axis = vertical (along d).
      //   Spine wall sits on the closed-face side, flanges on the open-face side.
      // openSide '+v' means open face faces +v (looking at the page, open is up).
      // openSide '-v' (default) means open face faces -v (open is down).
      const openUp = ent.openSide === '+v';
      // Define the closed (spine) face at vSpine, open tips at vOpen.
      const vSpine = openUp ? -hd : +hd;
      const vOpen  = openUp ? +hd : -hd;
      // Step inward from each end toward the spine by tf (flange thickness).
      const vFlangeInner = openUp ? vOpen - tf : vOpen + tf;
      // Step from open tip inward toward spine by tw (web thickness) — the
      // web of a PFC sits flush with the closed face on the -u side.
      // Conventional drafting orientation: closed face on -u (left). User
      // can rotate the entity ±90°/180° to point the spine any direction.
      const uSpine = -hbf;        // outer edge of web (closed side)
      const uWebInner = -hbf + tw; // inner edge of web
      const uOpen = +hbf;         // open face (flange tips)
      // Build the C-shape polygon traced clockwise starting at the
      // open-side top flange tip.
      const pts = [
        [uOpen,     vOpen],
        [uOpen,     vFlangeInner],
        [uWebInner, vFlangeInner],
        [uWebInner, -vFlangeInner],  // mirror across the u-axis
        [uOpen,     -vFlangeInner],
        [uOpen,     -vOpen],
        [uSpine,    -vOpen],
        [uSpine,    vOpen],
      ];
      fillPoly(pts);
      ctx.lineWidth = cutLW;
      ctx.beginPath();
      pts.forEach((p, i) => {
        const sp = project(p[0], p[1]);
        if (i === 0) ctx.moveTo(sp.x, sp.y); else ctx.lineTo(sp.x, sp.y);
      });
      ctx.closePath(); ctx.stroke();
      // Centrelines
      ctx.strokeStyle = clCol; ctx.lineWidth = clLW; ctx.setLineDash(DASH.CL);
      strokeLine(-hbf - 8, 0, hbf + 8, 0);
      strokeLine(0, -hd - 8, 0, hd + 8);
      ctx.setLineDash([]); ctx.strokeStyle = col;
    } else {
      // Elevation — outer flange-tip rectangle + flange-root inner lines +
      // centreline. roll 0 = toes away (flange roots solid); roll 180 = toes
      // toward (open face faces the viewer → flange-root lines drawn AS 1100
      // hidden/dashed). Honours auto-mitre joints + welded caps so PFCs
      // participate in the same brace-meets-host pipeline as UB/SHS members.
      const len = ent.length || 600;
      const T = hd, B = -hd, ftBot = T - tf, fbTop = B + tf;
      const toesToward = (effRoll === 180);
      const trims = (typeof jointTrimsForMem2 === 'function')
        ? jointTrimsForMem2(ent, blk.viewKey) : null;
      const capA = trims && trims.a ? null
        : ((typeof v25Mem2ResolveCap === 'function') ? v25Mem2ResolveCap(ent, 'A') : null);
      const capB = trims && trims.b ? null
        : ((typeof v25Mem2ResolveCap === 'function') ? v25Mem2ResolveCap(ent, 'B') : null);
      const capX = (y, def, cap) => {
        if (!cap) return def;
        return cap.topLocalX + (T - y) / (2 * T) * (cap.botLocalX - cap.topLocalX);
      };
      const xA = (y) => trims && trims.a ? trims.a.uAtV(y) : capX(y, 0, capA);
      const xB = (y) => trims && trims.b ? trims.b.uAtV(y) : capX(y, len, capB);
      fillPoly([[xA(T), T], [xB(T), T], [xB(B), B], [xA(B), B]]);
      ctx.lineWidth = cutLW;
      strokeLine(xA(T), T, xB(T), T);   // top flange tip (outer — always solid)
      strokeLine(xA(B), B, xB(B), B);   // bottom flange tip (outer — always solid)
      // Flange-root lines: solid when the open face points away; AS 1100 hidden
      // (dashed) when the open face points toward the viewer (toes-toward).
      if (toesToward) { ctx.strokeStyle = hidCol; ctx.lineWidth = hidLW; ctx.setLineDash(hidDashPx); }
      strokeLine(xA(ftBot), ftBot, xB(ftBot), ftBot);  // top flange root
      strokeLine(xA(fbTop), fbTop, xB(fbTop), fbTop);  // bottom flange root
      if (toesToward) { ctx.setLineDash([]); ctx.lineWidth = cutLW; ctx.strokeStyle = col; }
      if (capA) {
        strokeLine(capA.topLocalX, T, capA.botLocalX, B);
      } else if (trims && trims.a) {
        strokeLine(xA(T), T, xA(B), B);
      } else {
        drawEndCap(0, T, B, ent.endA || 'normal', -1);
      }
      if (capB) {
        strokeLine(capB.topLocalX, T, capB.botLocalX, B);
      } else if (trims && trims.b) {
        strokeLine(xB(T), T, xB(B), B);
      } else {
        drawEndCap(len, T, B, ent.endB || 'normal', +1);
      }
      const clMinPfc = Math.min(0, xA(0)) - 10;
      const clMaxPfc = Math.max(len, xB(0)) + 10;
      ctx.strokeStyle = clCol; ctx.lineWidth = clLW; ctx.setLineDash(DASH.CL);
      strokeLine(clMinPfc, 0, clMaxPfc, 0);
      ctx.setLineDash([]); ctx.strokeStyle = col;
      const weldA_pfc = capA || (trims && trims.a
        ? { topLocalX: xA(T), botLocalX: xA(B), weldSize: trims.a.weldSize || 6 }
        : null);
      const weldB_pfc = capB || (trims && trims.b
        ? { topLocalX: xB(T), botLocalX: xB(B), weldSize: trims.b.weldSize || 6 }
        : null);
      _drawCapWeld(weldA_pfc, T, project);
      _drawCapWeld(weldB_pfc, T, project);
    }
  } else if (ent.memberType === 'shs' || ent.memberType === 'rhs' || ent.memberType === 'chs') {
    const dbS = (ent.memberType === 'shs' ? SHS_DB[ent.section]
              : ent.memberType === 'rhs' ? (typeof RHS_DB === 'object' ? RHS_DB[ent.section] : null)
              : (typeof CHS_DB === 'object' ? CHS_DB[ent.section] : null));
    if (!dbS) return;
    const t = dbS.t || 6;
    // RHS carries distinct depth (d) and width (bf); SHS/CHS are single-dim
    // (square / round). The old code read only one field → drew every box as a
    // d×d square, ignoring RHS bf. dep = depth (long face), wid = width.
    const dep = (ent.memberType === 'rhs') ? (dbS.d || dbS.D || dbS.B || 100)
              : (dbS.B || dbS.d || dbS.D || 100);
    const wid = (ent.memberType === 'rhs') ? (dbS.bf || dbS.B || dep) : dep;
    if (aspect === 'sec') {
      // Canonical depth(v) × width(u) box; project() spins it by roll, so
      // on-edge (roll 0) and lay-flat (roll 90) fall out of the same polygon.
      const hW = wid / 2, hH = dep / 2, hWi = hW - t, hHi = hH - t;
      fillPoly([[-hW, hH], [hW, hH], [hW, -hH], [-hW, -hH]]);
      ctx.lineWidth = cutLW;
      // Outer
      const o = [[-hW, hH], [hW, hH], [hW, -hH], [-hW, -hH]];
      ctx.beginPath();
      o.forEach((p, i) => { const sp = project(p[0], p[1]); if (i === 0) ctx.moveTo(sp.x, sp.y); else ctx.lineTo(sp.x, sp.y); });
      ctx.closePath(); ctx.stroke();
      // Inner wall (also solid in cross-section)
      const inn = [[-hWi, hHi], [hWi, hHi], [hWi, -hHi], [-hWi, -hHi]];
      ctx.beginPath();
      inn.forEach((p, i) => { const sp = project(p[0], p[1]); if (i === 0) ctx.moveTo(sp.x, sp.y); else ctx.lineTo(sp.x, sp.y); });
      ctx.closePath(); ctx.stroke();
      // Centrelines
      ctx.strokeStyle = clCol; ctx.lineWidth = clLW; ctx.setLineDash(DASH.CL);
      strokeLine(-hW - 8, 0, hW + 8, 0);
      strokeLine(0, -hH - 8, 0, hH + 8);
      ctx.setLineDash([]); ctx.strokeStyle = col;
    } else {
      // Elevation — outer rectangle (solid) + two dashed inner walls + centreline.
      // roll selects the visible face: deep (height = dep) vs flat (height = wid).
      const len = ent.length || 500;
      const hB = ((effRoll === 90 || effRoll === 270) ? wid : dep) / 2, hI = hB - t;
      // V14-J — joint trim (priority + mitre overrides) takes precedence over
      // the legacy single-host cap when both apply. Falls back to the legacy
      // cap system when no joint is detected (e.g. brace explicitly joined to
      // a host but not part of a multi-member apex).
      const trims = (typeof jointTrimsForMem2 === 'function')
        ? jointTrimsForMem2(ent, blk.viewKey) : null;
      const capA = trims && trims.a ? null
        : ((typeof v25Mem2ResolveCap === 'function') ? v25Mem2ResolveCap(ent, 'A') : null);
      const capB = trims && trims.b ? null
        : ((typeof v25Mem2ResolveCap === 'function') ? v25Mem2ResolveCap(ent, 'B') : null);
      // Helper: x at a given local-y on a cap line. cap connects (topLocalX, +hd)
      // → (botLocalX, -hd). Returns the default if no cap.
      const capX = (y, def, cap) => {
        if (!cap) return def;
        return cap.topLocalX + (hB - y) / (2 * hB) * (cap.botLocalX - cap.topLocalX);
      };
      // Trim formula uAtV(v) describes a cut LINE through M's body. We do NOT
      // clamp to [0, len] — for an angled brace butting against a flat outer
      // face, one corner of the brace must EXTEND past the original end face
      // so both edges land flush on the host. The legacy capA/capB pathway
      // already worked this way; the auto-joint pathway now matches.
      const xA = (y) => trims && trims.a ? trims.a.uAtV(y) : capX(y, 0, capA);
      const xB = (y) => trims && trims.b ? trims.b.uAtV(y) : capX(y, len, capB);
      // Fill polygon — straight cap on each end (no kink; the cut is linear,
      // so a midpoint vertex would just be collinear noise).
      const fillPts = [];
      fillPts.push([xA(hB), hB]);
      fillPts.push([xB(hB), hB]);
      fillPts.push([xB(-hB), -hB]);
      fillPts.push([xA(-hB), -hB]);
      fillPoly(fillPts);
      ctx.lineWidth = cutLW;
      strokeLine(xA(hB),  hB,  xB(hB),  hB);   // top outer
      strokeLine(xA(-hB), -hB, xB(-hB), -hB);  // bottom outer
      // End caps: straight sloped line for any joint cut, otherwise the
      // original endA/endB end-cap glyph.
      if (capA) {
        strokeLine(capA.topLocalX, hB, capA.botLocalX, -hB);
      } else if (trims && trims.a) {
        strokeLine(xA(hB), hB, xA(-hB), -hB);
      } else {
        drawEndCap(0, hB, -hB, ent.endA || 'normal', -1);
      }
      if (capB) {
        strokeLine(capB.topLocalX, hB, capB.botLocalX, -hB);
      } else if (trims && trims.b) {
        strokeLine(xB(hB), hB, xB(-hB), -hB);
      } else {
        drawEndCap(len, hB, -hB, ent.endB || 'normal', +1);
      }
      // Inner walls (hidden lines) — also slope to follow the outer cut.
      // Per-member weight via ent.hidLwLevel (inspector "Wall line" stepper),
      // defaulting to MEM2_HID_LW_DEFAULT. Screen px (MEM2_HID_LW_PX) is kept
      // decoupled from export mm (MEM2_HID_LW) — same idiom as the mat/lineSet
      // edge stepper — so the dashes stay clearly visible on screen at any zoom
      // yet print true-to-paper. The old shared hidLW (LW.HID * pm) collapsed to
      // the ~0.25 px floor at detail zoom, which is why they were near-invisible.
      const _hidLvl = (typeof ent.hidLwLevel === 'number')
        ? Math.max(0, Math.min(MEM2_HID_LW.length - 1, ent.hidLwLevel))
        : MEM2_HID_LW_DEFAULT;
      const _hidMM = MEM2_HID_LW[_hidLvl];
      const hollowHidLW = (typeof pdfExportMode !== 'undefined' && pdfExportMode)
        ? _hidMM
        : Math.max(MEM2_HID_LW_PX[_hidLvl], _hidMM * pm);
      // Drawn in the member's own colour (col), not the grey --hid-color, so the
      // hollow wall reads as a crisp black hidden line.
      ctx.strokeStyle = col; ctx.lineWidth = hollowHidLW; ctx.setLineDash(hidDashPx);
      strokeLine(xA( hI),  hI,  xB( hI),  hI);
      strokeLine(xA(-hI), -hI, xB(-hI), -hI);
      ctx.setLineDash([]); ctx.strokeStyle = col;
      // Centreline — extend to cover the (possibly extended) body so it meets
      // the host centreline cleanly on both ends.
      const clMin = Math.min(0, xA(0)) - 8;
      const clMax = Math.max(len, xB(0)) + 8;
      ctx.strokeStyle = clCol; ctx.lineWidth = clLW; ctx.setLineDash(DASH.CL);
      strokeLine(clMin, 0, clMax, 0);
      ctx.setLineDash([]); ctx.strokeStyle = col;
      // Fillet weld hatching along each mitre cap (AS 1101.3 / AS 4100 min size).
      // When the auto-joint pipeline produced a trim, the cap line lives on the
      // trim itself — synthesise a cap-shaped object so _drawCapWeld can hatch
      // along it without caring whether the cut came from the legacy explicit
      // join (capA/capB) or the auto-joint detector (trims.a/trims.b).
      const weldA = capA || (trims && trims.a
        ? { topLocalX: xA(hB), botLocalX: xA(-hB), weldSize: trims.a.weldSize || 6 }
        : null);
      const weldB = capB || (trims && trims.b
        ? { topLocalX: xB(hB), botLocalX: xB(-hB), weldSize: trims.b.weldSize || 6 }
        : null);
      _drawCapWeld(weldA, hB, project);
      _drawCapWeld(weldB, hB, project);
    }
  }
  } finally { ctx.globalAlpha = _opacityWas; }
}

// Render fillet-weld hatching (45° tick marks) along an auto-mitre cap line.
// Drawn in the BRACE's local frame; `project` maps local→pixel coords. Small
// no-op when no cap is present.
function _drawCapWeld(cap, hd, project) {
  if (!cap) return;
  const ws = Math.max(3, cap.weldSize || 6);
  const x1 = cap.topLocalX, y1 = hd;
  const x2 = cap.botLocalX, y2 = -hd;
  const capLen = Math.hypot(x2 - x1, y2 - y1);
  if (capLen < ws * 0.5) return;
  const nx = (x2 - x1) / capLen, ny = (y2 - y1) / capLen;
  // Tick direction: cap unit vector rotated -45°.
  const c45 = Math.SQRT1_2;
  const tnx = nx * c45 + ny * c45;
  const tny = ny * c45 - nx * c45;
  const tickStep = Math.max(ws * 1.4, capLen / 8);
  const tickLen = ws * 1.6;
  ctx.save();
  ctx.lineWidth = Math.max(0.5, ws * 0.18 * ppm());
  ctx.setLineDash([]);
  ctx.beginPath();
  for (let s = tickStep / 2; s < capLen; s += tickStep) {
    const cx = x1 + s * nx, cy = y1 + s * ny;
    const ax = cx - 0.5 * tickLen * tnx, ay = cy - 0.5 * tickLen * tny;
    const bx = cx + 0.5 * tickLen * tnx, by = cy + 0.5 * tickLen * tny;
    const a = project(ax, ay), b = project(bx, by);
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  ctx.restore();
}

// V25-layout-overhaul Phase 6.3 — 2D edge snap (mirrors the 3D system at
// applyEdgeSnap()). Returns the dragged member's snap edges in (u,v) space:
// centreline + ends (along length axis) + faces (along depth axis). Only
// emits edges when the member is approximately axis-aligned (within ±25°),
// matching the 3D pipeline which only snaps faces whose normal is close to
// a view axis. Diagonal members get no snap edges — by design.
function v25Mem2Edges(ent) {
  const edges = [];
  if (!ent || ent.type !== 'mem2') return edges;
  if (ent.aspect === 'sec') return edges; // cross-section view: no snap
  const len = ent.length || 0;
  if (len < 1) return edges;
  const hd = v25Mem2HalfDepth(ent);
  const rot = (ent.rot || 0) * Math.PI / 180;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const cu = ent.u + cos * len / 2;
  const cv = ent.v + sin * len / 2;
  const lbl = (ent.memberType || 'member').toUpperCase();
  if (Math.abs(cos) > 0.9) {
    // Horizontal-ish member: length runs along u, depth along v.
    edges.push({ axis: 'u', value: cu + len / 2, label: lbl + ' end' });
    edges.push({ axis: 'u', value: cu - len / 2, label: lbl + ' end' });
    edges.push({ axis: 'v', value: cv + hd,      label: lbl + ' face' });
    edges.push({ axis: 'v', value: cv - hd,      label: lbl + ' face' });
    edges.push({ axis: 'v', value: cv,           label: lbl + ' centreline' });
  } else if (Math.abs(sin) > 0.9) {
    // Vertical-ish member: length runs along v, depth along u.
    edges.push({ axis: 'v', value: cv + len / 2, label: lbl + ' end' });
    edges.push({ axis: 'v', value: cv - len / 2, label: lbl + ' end' });
    edges.push({ axis: 'u', value: cu + hd,      label: lbl + ' side' });
    edges.push({ axis: 'u', value: cu - hd,      label: lbl + ' side' });
    edges.push({ axis: 'u', value: cu,           label: lbl + ' centreline' });
  }
  return edges;
}

// Soft-snap state for the 2D pipeline (independent of the 3D snappedAxisU/V
// flags so the two systems can't fight each other).
let _v25SnappedAxisU = false, _v25SnappedAxisV = false;
function v25ResetSnapState() {
  _v25SnappedAxisU = false;
  _v25SnappedAxisV = false;
}

// Mirrors applyEdgeSnap() but for the 2D entity world. Mutates the dragged
// entity's u/v in place when a snap catches; returns descriptors that
// drawEdgeSnapLines() will paint as faint dashed guides.
function v25ApplySnap(blk, draggedEnts) {
  const snaps = [];
  if (!blk || !Array.isArray(draggedEnts) || draggedEnts.length === 0) return snaps;
  const tol = 2;       // mm — catch zone (matches 3D)
  const breakTol = 3;  // mm — release zone
  const arr = entities2D[blk.viewKey] || [];
  const draggedIds = new Set(draggedEnts.map(e => e && e.id).filter(id => id != null));

  // Edge collection — only mem2 participates after Phase 2 retired the v1
  // V25 plate path. v2 plates body-snap will land when Phase 3+ wires v2
  // grip handles into v25ApplySnap (or its v2 successor).
  const edgesFor = (ent) => {
    if (!ent) return [];
    if (ent.type === 'mem2') return v25Mem2Edges(ent);
    return [];
  };

  // Collect target edges from every other mem2 in this view.
  const targets = [];
  for (const e of arr) {
    if (!e) continue;
    if (e.type !== 'mem2') continue;
    if (draggedIds.has(e.id)) continue;
    for (const edge of edgesFor(e)) targets.push(edge);
  }
  if (targets.length === 0) {
    v25ResetSnapState();
    return snaps;
  }

  // Find the closest target on each axis across all dragged entities.
  let bestU = null, bestDistU = Infinity;
  let bestV = null, bestDistV = Infinity;
  for (const ent of draggedEnts) {
    if (!ent || ent.type !== 'mem2') continue;
    const myEdges = edgesFor(ent);
    for (const me of myEdges) {
      for (const te of targets) {
        if (me.axis !== te.axis) continue;
        const d = Math.abs(me.value - te.value);
        if (me.axis === 'u' && d < bestDistU) {
          bestDistU = d;
          bestU = { delta: te.value - me.value, target: te };
        } else if (me.axis === 'v' && d < bestDistV) {
          bestDistV = d;
          bestV = { delta: te.value - me.value, target: te };
        }
      }
    }
  }

  // Translate u/v plus any pts[] children — polygon plates store their
  // geometry in pts[] rather than the ent.u/v fields, so a snap that only
  // touched ent.u would leave the visible outline behind.
  const applyU = (delta) => draggedEnts.forEach(e => {
    if (!e) return;
    e.u = (e.u || 0) + delta;
    if (Array.isArray(e.pts)) e.pts.forEach(p => { p.u += delta; });
  });
  const applyV = (delta) => draggedEnts.forEach(e => {
    if (!e) return;
    e.v = (e.v || 0) + delta;
    if (Array.isArray(e.pts)) e.pts.forEach(p => { p.v += delta; });
  });

  // U-axis soft-snap state machine.
  if (_v25SnappedAxisU) {
    if (bestU && bestDistU < breakTol) {
      applyU(bestU.delta);
      snaps.push({ axis: 'u', value: bestU.target.value, label: bestU.target.label });
    } else {
      _v25SnappedAxisU = false;
    }
  } else if (bestU && bestDistU < tol) {
    applyU(bestU.delta);
    snaps.push({ axis: 'u', value: bestU.target.value, label: bestU.target.label });
    _v25SnappedAxisU = true;
  }
  // V-axis soft-snap state machine.
  if (_v25SnappedAxisV) {
    if (bestV && bestDistV < breakTol) {
      applyV(bestV.delta);
      snaps.push({ axis: 'v', value: bestV.target.value, label: bestV.target.label });
    } else {
      _v25SnappedAxisV = false;
    }
  } else if (bestV && bestDistV < tol) {
    applyV(bestV.delta);
    snaps.push({ axis: 'v', value: bestV.target.value, label: bestV.target.label });
    _v25SnappedAxisV = true;
  }
  return snaps;
}

// V25-layout-overhaul Phase 6.4 — 2D auto-weld pipeline. Mirrors the 3D
// system at computeWeldInterfaces() / drawAutoWelds() but works in view-local
// (u, v) coordinates over entities2D[viewKey] instead of world objects3D.
//
// Reuses (unchanged) the 3D primitives: drawWeldHatch, autoWeldMinSize,
// weldOverrides. Override keys are namespaced "v25-${a}-${b}" so the 2D and
// 3D override stores can never collide.

// Returns the four outline edges of a mem2 in (u, v) space. Each face has
// {u1,v1,u2,v2} endpoints + outward unit normal {nu,nv} + entity reference.
// Top/bottom edges run along the member's length; start/end edges run across
// its depth. Cross-section view (aspect='sec') is excluded — same scope as
// the snap pipeline.
function v25Mem2Faces(ent) {
  if (!ent || ent.type !== 'mem2' || ent.aspect === 'sec') return [];
  const len = ent.length || 0;
  if (len < 1) return [];
  const hd = v25Mem2HalfDepth(ent);
  const rot = (ent.rot || 0) * Math.PI / 180;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  // Member-local +depth direction = (-sin, +cos) (perpendicular to length, CCW)
  const ts = { u: ent.u             - sin * hd, v: ent.v             + cos * hd }; // top-start
  const te = { u: ent.u + cos * len - sin * hd, v: ent.v + sin * len + cos * hd }; // top-end
  const bs = { u: ent.u             + sin * hd, v: ent.v             - cos * hd }; // bottom-start
  const be = { u: ent.u + cos * len + sin * hd, v: ent.v + sin * len - cos * hd }; // bottom-end
  return [
    { u1: ts.u, v1: ts.v, u2: te.u, v2: te.v, nu: -sin, nv:  cos, entId: ent.id, side: 'top' },
    { u1: be.u, v1: be.v, u2: bs.u, v2: bs.v, nu:  sin, nv: -cos, entId: ent.id, side: 'bottom' },
    { u1: bs.u, v1: bs.v, u2: ts.u, v2: ts.v, nu: -cos, nv: -sin, entId: ent.id, side: 'start' },
    { u1: te.u, v1: te.v, u2: be.u, v2: be.v, nu:  cos, nv:  sin, entId: ent.id, side: 'end' },
  ];
}

// "Thinner part" thickness for AS 4100 Cl. 9.7.3.10 weld sizing. Web for I-
// sections, wall for hollow sections; defaults to 10 mm if unknown.
function v25Mem2Thickness(ent) {
  if (!ent) return 10;
  if (ent.memberType === 'ub' || ent.memberType === 'uc' || ent.memberType === 'wb') {
    const db = ent.memberType === 'ub' ? UB_DB[ent.section]
             : ent.memberType === 'wb' ? (typeof WB_DB === 'object' ? WB_DB[ent.section] : UB_DB[ent.section])
             : UC_DB[ent.section];
    return db && db.tw ? db.tw : 10;
  }
  if (ent.memberType === 'shs') { const db = SHS_DB[ent.section]; return db && db.t ? db.t : 10; }
  if (ent.memberType === 'rhs' && typeof RHS_DB === 'object') {
    const db = RHS_DB[ent.section]; return db && db.t ? db.t : 10;
  }
  if (ent.memberType === 'chs' && typeof CHS_DB === 'object') {
    const db = CHS_DB[ent.section]; return db && db.t ? db.t : 10;
  }
  if (ent.memberType === 'pfc' && typeof PFC_DB === 'object') {
    // AS 4100 Cl 9.7.3.10 "thinner part" — web is thinner than flange for PFCs.
    const db = PFC_DB[ent.section]; return db && db.tw ? db.tw : 10;
  }
  return 10;
}

// Fix F (2026-05-23) — face extraction for v2 plate mirrors (and any other
// 'plate2'-shaped entries that might exist). Restored from the deleted
// `js/76-v25-plate.js` (Phase 2 dropped this when it retired the v1 plate
// path); auto-weld needs it to see plate edges. The mirror seam in
// `js/v2/engine/v1-bridge.js mirrorV2IntoV1` injects `plate2` mirrors for
// every v2 plate so this function picks them up automatically.
//
// Returns face descriptors matching v25Mem2Faces shape: {u1,v1,u2,v2,nu,nv,
// entId, side}. Auto-detects polygon winding so the outward normal points
// AWAY from the plate body regardless of vertex order.
function v25Plate2Faces(ent) {
  if (!ent || ent.type !== 'plate2') return [];
  const out = [];
  // Elevation polygon — walk the literal pts[] edges.
  if (ent.aspect === 'elev' && ent.shape === 'poly' && Array.isArray(ent.pts) && ent.pts.length >= 3) {
    const pts = ent.pts;
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      area += (p.u * q.v - q.u * p.v);
    }
    const ccw = area > 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const du = b.u - a.u, dv = b.v - a.v;
      const len = Math.hypot(du, dv);
      if (len < 0.5) continue;
      const tu = du / len, tv = dv / len;
      const nu = ccw ?  tv : -tv;
      const nv = ccw ? -tu :  tu;
      out.push({ u1: a.u, v1: a.v, u2: b.u, v2: b.v, nu: nu, nv: nv, entId: ent.id, side: 'edge' + i });
    }
    return out;
  }
  // Elevation rect OR Section cleat — same 4-edge rectangle math.
  let w, h, originU, originV, rot;
  if (ent.aspect === 'sec') {
    w = ent.length || 0;
    h = ent.thk || 10;
    originU = ent.u; originV = ent.v;
    rot = (ent.rot || 0) * Math.PI / 180;
  } else {
    w = ent.w || 0;
    h = ent.h || 0;
    originU = ent.u; originV = ent.v;
    rot = (ent.rot || 0) * Math.PI / 180;
  }
  if (w < 1 || h < 1) return out;
  const cosR = Math.cos(rot), sinR = Math.sin(rot);
  const ly0 = (ent.aspect === 'sec') ? -h / 2 : 0;
  const ly1 = (ent.aspect === 'sec') ?  h / 2 : h;
  const project = (lx, ly) => ({
    u: originU + lx * cosR - ly * sinR,
    v: originV + lx * sinR + ly * cosR,
  });
  const bl = project(0, ly0), br = project(w, ly0), tr = project(w, ly1), tl = project(0, ly1);
  const rotN = (lx, ly) => ({ nu: lx * cosR - ly * sinR, nv: lx * sinR + ly * cosR });
  const nBot = rotN(0, -1), nRight = rotN(1, 0), nTop = rotN(0, 1), nLeft = rotN(-1, 0);
  out.push({ u1: bl.u, v1: bl.v, u2: br.u, v2: br.v, nu: nBot.nu,   nv: nBot.nv,   entId: ent.id, side: 'bottom' });
  out.push({ u1: br.u, v1: br.v, u2: tr.u, v2: tr.v, nu: nRight.nu, nv: nRight.nv, entId: ent.id, side: 'right'  });
  out.push({ u1: tr.u, v1: tr.v, u2: tl.u, v2: tl.v, nu: nTop.nu,   nv: nTop.nv,   entId: ent.id, side: 'top'    });
  out.push({ u1: tl.u, v1: tl.v, u2: bl.u, v2: bl.v, nu: nLeft.nu,  nv: nLeft.nv,  entId: ent.id, side: 'left'   });
  return out;
}

// Pair-wise face scan: two faces form an interface when their normals are
// (near) anti-parallel, their perpendicular distance is ≤ 2 mm, and their
// projected overlap along the shared direction is ≥ 1 mm.
//
// For each entity pair we keep ONLY the largest-overlap interface (matches
// the 3D pipeline's de-dup). Output is consumed by drawV25AutoWelds().
//
// plate-grouping-stiffener follow-up — true when a plate2 mirror's underlying v2
// plate has a registered flange joint to `memberEnt`. That joint owns the
// interface's connection explicitly (none/weld-via-jweld/bolt), so the always-on
// geometric auto-weld must NOT also hatch it. Member-scoped so a grouped plate's
// OTHER contacts (e.g. the plate↔column cap weld) still auto-weld normally.
function v25PlateJointSuppressesWeld(plateEnt, memberEnt) {
  if (!plateEnt || plateEnt.type !== 'plate2' || !plateEnt._v2Id) return false;
  const model = (window.v2 && v2.appState && v2.appState.model) || null;
  if (!model || !(model.elements instanceof Map)) return false;
  const el = model.elements.get(plateEnt._v2Id);
  const fj = el && el.params && el.params.flange;
  if (!fj) return false;
  if (memberEnt && memberEnt.id != null && fj.memberId != null && memberEnt.id !== fj.memberId) return false;
  return true;   // joint governs this interface — defer to its mode, no auto-hatch
}
function computeV25WeldInterfaces(viewKey) {
  const out = [];
  if (!viewKey) return out;
  const tol = 2;          // mm — face proximity (matches snap catch zone)
  const minOverlap = 1;   // mm — minimum contact length
  // Collect every weld-relevant face in this view. Fix F (2026-05-23)
  // restores plate2 participation via the v2→v1 mirror seam — v2 plates are
  // injected into entities2D as plate2-shaped mirrors by
  // `js/v2/engine/v1-bridge.js mirrorV2IntoV1`, and we collect their faces
  // alongside mem2's so plate-to-member contact generates auto-welds.
  const allFaces = [];
  {
    const arr = entities2D[viewKey] || [];
    const mems = arr.filter(e => e && e.type === 'mem2' && e.aspect !== 'sec' && (e.length || 0) >= 1);
    for (const m of mems) for (const f of v25Mem2Faces(m)) { f._ent = m; allFaces.push(f); }
    const plates = arr.filter(e => e && e.type === 'plate2');
    for (const p of plates) for (const f of v25Plate2Faces(p)) { f._ent = p; allFaces.push(f); }
  }
  if (allFaces.length < 2) return out;
  const bestPerKey = {};
  for (let i = 0; i < allFaces.length; i++) {
    for (let j = i + 1; j < allFaces.length; j++) {
      const fA = allFaces[i], fB = allFaces[j];
      if (fA._ent.id === fB._ent.id) continue;
      // Anti-parallel normal check (within ~5°).
      const dotN = fA.nu * fB.nu + fA.nv * fB.nv;
      if (dotN > -0.99) continue;
      // Perpendicular distance from fB-mid to fA's line, along fA's normal.
      const aMidU = (fA.u1 + fA.u2) / 2, aMidV = (fA.v1 + fA.v2) / 2;
      const bMidU = (fB.u1 + fB.u2) / 2, bMidV = (fB.v1 + fB.v2) / 2;
      const perp = Math.abs((bMidU - aMidU) * fA.nu + (bMidV - aMidV) * fA.nv);
      if (perp > tol) continue;
      // Project fB endpoints onto fA's parameterised direction.
      const adu = fA.u2 - fA.u1, adv = fA.v2 - fA.v1;
      const aLen = Math.hypot(adu, adv);
      if (aLen < 0.5) continue;
      const aUx = adu / aLen, aUy = adv / aLen;
      const proj = (px, py) => (px - fA.u1) * aUx + (py - fA.v1) * aUy;
      const t1 = proj(fB.u1, fB.v1), t2 = proj(fB.u2, fB.v2);
      const tMin = Math.max(0,    Math.min(t1, t2));
      const tMax = Math.min(aLen, Math.max(t1, t2));
      const overlap = tMax - tMin;
      if (overlap < minOverlap) continue;
      const idA = fA._ent.id, idB = fB._ent.id;
      const key = 'v25-' + (idA < idB ? `${idA}-${idB}` : `${idB}-${idA}`);
      // plate-grouping-stiffener follow-up — a plate↔member contact that belongs
      // to a registered flange joint is governed by that joint's explicit mode
      // (none = nothing, weld = jweld ticks, bolt = bolts), so skip the always-on
      // geometric auto-weld hatch here. Without this, snapGroupToFlange's sub-2mm
      // plate↔flange contact welded a grouped base-plate to the UB by default.
      const _pJ = fA._ent.type === 'plate2' ? fA._ent : (fB._ent.type === 'plate2' ? fB._ent : null);
      const _mJ = fA._ent.type === 'mem2'   ? fA._ent : (fB._ent.type === 'mem2'   ? fB._ent : null);
      if (_pJ && _mJ && v25PlateJointSuppressesWeld(_pJ, _mJ)) continue;
      const seg = {
        u1: fA.u1 + aUx * tMin, v1: fA.v1 + aUy * tMin,
        u2: fA.u1 + aUx * tMax, v2: fA.v1 + aUy * tMax,
        hatchSide: 1,
      };
      // Thinner-part thickness for AS 4100 Cl. 9.7.3.10 weld sizing. Fix F
      // (2026-05-23) restores plate2 awareness so a plate-to-member weld
      // sizes off the thinner of (plate thickness, member web/wall).
      const thinPart = (ent) => {
        if (ent && ent.type === 'plate2') return ent.thk || 10;
        return (typeof v25Mem2Thickness === 'function') ? v25Mem2Thickness(ent) : 10;
      };
      const tThin = Math.min(thinPart(fA._ent), thinPart(fB._ent));
      const autoSize = autoWeldMinSize(tThin);
      const override = weldOverrides[key] || {};
      // showWeldPopup() reads ifc.objA.type / .section to render the
      // "X ↔ Y" footer label. The 3D pipeline supplies real obj{type,section}
      // pairs; we mirror that shape for mem2 with memberType + section.
      const labelOf = (ent) => {
        return { type: ent.memberType || 'mem', section: ent.section };
      };
      const objA = labelOf(fA._ent);
      const objB = labelOf(fB._ent);
      const candidate = {
        key, entA: fA._ent, entB: fB._ent, objA, objB,
        seg, _overlap: overlap,
        weldType: override.weldType || 'fillet',
        weldSize: override.weldSize || autoSize,
        enabled: override.enabled !== undefined ? override.enabled : true,
        tickLen: override.tickLen,
        lineThk: override.lineThk,
        hatchSpacing: override.hatchSpacing,
      };
      if (!bestPerKey[key] || overlap > bestPerKey[key]._overlap) {
        bestPerKey[key] = candidate;
      }
    }
  }
  return Object.values(bestPerKey);
}

// Render entry point. Hooked into the 2D branch of renderBlock(). Reuses
// drawWeldHatch unchanged — the contact segment is already in (u, v) which
// rLine() projects to pixels for us.
function drawV25AutoWelds(blk, cs) {
  if (!blk || sheetMode !== '2d') return;
  const interfaces = computeV25WeldInterfaces(blk.viewKey);
  for (const ifc of interfaces) {
    if (!ifc.enabled) continue;
    drawWeldHatch(blk, ifc.seg, ifc, cs);
  }
}

// 2D mirror of hitTestWeld(). Returns the closest interface within ~8 px of
// (px, py) so the existing dblclick → showWeldPopup() flow can route through
// it. Hidden-but-overridden interfaces stay clickable so the user can re-
// enable them without re-snapping the members.
function v25HitTestWeld(blk, px, py) {
  if (!blk || sheetMode !== '2d') return null;
  const real = px2real(blk, px, py);
  const tol = 8 * drawingScale / viewport.zoom;
  const interfaces = computeV25WeldInterfaces(blk.viewKey);
  for (const ifc of interfaces) {
    if (!ifc.enabled && !weldOverrides[ifc.key]) continue;
    const seg = ifc.seg;
    const du = seg.u2 - seg.u1, dv = seg.v2 - seg.v1;
    const segLen2 = du * du + dv * dv;
    if (segLen2 < 0.01) continue;
    let t = ((real.u - seg.u1) * du + (real.v - seg.v1) * dv) / segLen2;
    t = Math.max(0, Math.min(1, t));
    const closestU = seg.u1 + t * du, closestV = seg.v1 + t * dv;
    const dist = Math.hypot(real.u - closestU, real.v - closestV);
    if (dist < tol) return ifc;
  }
  return null;
}

// Half-depth helper used by hit-test/bounds and end-handle math.
function v25Mem2HalfDepth(ent) {
  // The transverse half-height as drawn: depth/2 for the primary face (roll 0),
  // width/2 for the flange / lay-flat face (roll 90/270). Used by snap edges,
  // bounds, and mitre clipping, so it must follow the same roll the renderer
  // honours.
  const r = v25Mem2EffRoll(ent);
  const flat = (r === 90 || r === 270);
  if (ent.memberType === 'ub' || ent.memberType === 'uc' || ent.memberType === 'wb') {
    const db = ent.memberType === 'ub' ? UB_DB[ent.section]
             : ent.memberType === 'wb' ? (typeof WB_DB === 'object' ? WB_DB[ent.section] : UB_DB[ent.section])
             : UC_DB[ent.section];
    if (!db) return 50;
    return (flat ? (db.bf || db.d) : db.d) / 2;
  }
  if (ent.memberType === 'shs') {
    const db = SHS_DB[ent.section];
    return db ? (db.B || db.d || 100) / 2 : 50;
  }
  if (ent.memberType === 'rhs' && typeof RHS_DB === 'object') {
    const db = RHS_DB[ent.section];
    if (!db) return 50;
    const dep = db.d || db.D || db.B || 100, wid = db.bf || db.B || dep;
    return (flat ? wid : dep) / 2;
  }
  if (ent.memberType === 'chs' && typeof CHS_DB === 'object') {
    const db = CHS_DB[ent.section];
    return db ? (db.d || db.D || 100) / 2 : 50;
  }
  if (ent.memberType === 'pfc' && typeof PFC_DB === 'object') {
    const db = PFC_DB[ent.section];
    if (!db) return 50;
    return (flat ? (db.bf || db.d) : db.d) / 2;
  }
  return 50;
}

// Wall / governing thickness for AS 4100 minimum fillet weld sizing.
// Returns the thinner part for joined-end weld defaults.
function v25Mem2Thickness(ent) {
  if (!ent) return 6;
  if (ent.memberType === 'ub' || ent.memberType === 'uc' || ent.memberType === 'wb') {
    const db = ent.memberType === 'ub' ? UB_DB[ent.section]
             : ent.memberType === 'wb' ? (typeof WB_DB === 'object' ? WB_DB[ent.section] : UB_DB[ent.section])
             : UC_DB[ent.section];
    return db ? db.tf || db.tw || 6 : 6;
  }
  if (ent.memberType === 'shs') {
    const db = SHS_DB[ent.section];
    return db ? db.t || 6 : 6;
  }
  if (ent.memberType === 'rhs' && typeof RHS_DB === 'object') {
    const db = RHS_DB[ent.section];
    return db ? db.t || 6 : 6;
  }
  if (ent.memberType === 'chs' && typeof CHS_DB === 'object') {
    const db = CHS_DB[ent.section];
    return db ? db.t || 6 : 6;
  }
  if (ent.memberType === 'pfc' && typeof PFC_DB === 'object') {
    // PFC tw (web) is thinner than tf (flange); use the governing thinner part.
    const db = PFC_DB[ent.section];
    return db ? Math.min(db.tw || 6, db.tf || 6) : 6;
  }
  return 6;
}

// Outer envelope of a mem2 in WORLD coords as a closed rectangle polygon.
// Used for ray-vs-host clipping when computing auto-mitre caps. For elevation
// view this is the length × depth rectangle aligned to the member axis. For
// section view it's a depth × depth square centred on the entity origin.
function v25Mem2WorldOutline(ent) {
  if (!ent || ent.type !== 'mem2') return [];
  const len = ent.length || 0;
  const rot = (ent.rot || 0) * Math.PI / 180;
  const cosR = Math.cos(rot), sinR = Math.sin(rot);
  const hd = v25Mem2HalfDepth(ent);
  const aspect = ent.aspect || 'elev';
  const corners = (aspect === 'sec')
    ? [[-hd, hd], [hd, hd], [hd, -hd], [-hd, -hd]]
    : [[0, hd], [len, hd], [len, -hd], [0, -hd]];
  return corners.map(([lx, ly]) => [
    ent.u + lx * cosR - ly * sinR,
    ent.v + lx * sinR + ly * cosR,
  ]);
}

// Centreline of a mem2 in WORLD coords as [start, end] points. Section-view
// members have zero length so this returns a degenerate point pair.
function v25Mem2WorldCentreline(ent) {
  if (!ent || ent.type !== 'mem2') return null;
  const len = ent.length || 0;
  const rot = (ent.rot || 0) * Math.PI / 180;
  const cosR = Math.cos(rot), sinR = Math.sin(rot);
  return [
    [ent.u, ent.v],
    [ent.u + len * cosR, ent.v + len * sinR],
  ];
}

// Segment-segment intersection in 2D. Returns { u, v, t1, t2 } where t1 is
// the parameter along p1→p2 and t2 along p3→p4 (both in [0..1] for an
// internal hit). Returns null when parallel or out of range.
function _v25SegSegIntersect(p1, p2, p3, p4) {
  const x1 = p1[0], y1 = p1[1], x2 = p2[0], y2 = p2[1];
  const x3 = p3[0], y3 = p3[1], x4 = p4[0], y4 = p4[1];
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-9) return null;
  const t1 = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const t2 = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
  if (t1 < -1e-6 || t1 > 1 + 1e-6 || t2 < -1e-6 || t2 > 1 + 1e-6) return null;
  return { u: x1 + t1 * (x2 - x1), v: y1 + t1 * (y2 - y1), t1, t2 };
}

// First intersection of segment p1→p2 with any edge of closed polygon `poly`,
// preferring the smallest t1 > eps. Returns { u, v, t } or null.
function v25FirstSegPolyHit(p1, p2, poly) {
  let best = null;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const hit = _v25SegSegIntersect(p1, p2, a, b);
    if (!hit) continue;
    if (hit.t1 < 1e-6) continue; // ignore the start point itself
    if (!best || hit.t1 < best.t) best = { u: hit.u, v: hit.v, t: hit.t1 };
  }
  return best;
}

// Distance from point P to segment AB, in real-world units.
function _v25PointSegDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

// Find a host mem2 candidate near the cursor (real-world coords). Picks the
// member whose centreline OR outline is closest to (cu, cv), within either
// CL_TOL_MM (centreline) or OUTLINE_TOL_MM (outline). Returns { ent, distMm,
// kind: 'centreline'|'outline' } or null. `excludeId` skips a specific entity
// (e.g. the brace currently being dragged).
function v25Mem2HostUnderCursor(blk, cu, cv, excludeId) {
  if (!blk) return null;
  const arr = entities2D[blk.viewKey] || [];
  const ppmm = (typeof viewport === 'object' && viewport.zoom)
    ? viewport.zoom / drawingScale : 1;
  // Pixel tolerances → real-world mm. Centreline gets a wider band so the
  // truss workflow ("click anywhere on the chord centreline") feels natural.
  const CL_TOL_MM = 14 / Math.max(ppmm, 0.01);
  const OUT_TOL_MM = 10 / Math.max(ppmm, 0.01);
  let best = null;
  for (const ent of arr) {
    if (!ent || ent.type !== 'mem2') continue;
    if (excludeId != null && ent.id === excludeId) continue;
    if ((ent.aspect || 'elev') === 'sec') continue;
    if (!(ent.length > 0)) continue;
    const cl = v25Mem2WorldCentreline(ent);
    if (!cl) continue;
    const dCL = _v25PointSegDist([cu, cv], cl[0], cl[1]);
    if (dCL < CL_TOL_MM) {
      if (!best || dCL < best.dist) best = { ent, dist: dCL, kind: 'centreline' };
      continue;
    }
    // Outline: distance to closest edge of the world-rectangle.
    const outline = v25Mem2WorldOutline(ent);
    let dOut = Infinity;
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i], b = outline[(i + 1) % outline.length];
      const d = _v25PointSegDist([cu, cv], a, b);
      if (d < dOut) dOut = d;
    }
    if (dOut < OUT_TOL_MM) {
      if (!best || dOut < best.dist) best = { ent, dist: dOut, kind: 'outline' };
    }
  }
  return best;
}

// Resolve the visual mitre cap for a joined end. Walks the brace centreline
// outward from the joined end (i.e. from the OTHER end's side) and finds the
// first intersection of the brace's TOP and BOTTOM edges with the host outline.
// Returns { topLocalX, botLocalX, hostFaceAngleDeg, weldSize } or null when the
// brace doesn't actually meet the host (degenerate join).
//   endKey = 'A' (left/start) or 'B' (right/far)
function v25Mem2ResolveCap(braceEnt, endKey) {
  if (!braceEnt || braceEnt.type !== 'mem2') return null;
  const join = endKey === 'A' ? braceEnt.endAJoin : braceEnt.endBJoin;
  if (!join || !join.hostId) return null;
  const view = (activeBlock && activeBlock.viewKey) || 'elevation';
  const arr = entities2D[view] || [];
  const host = arr.find(e => e && e.id === join.hostId);
  if (!host || host.type !== 'mem2') return null;
  if ((host.aspect || 'elev') === 'sec') return null;
  if ((braceEnt.aspect || 'elev') === 'sec') return null;
  const len = braceEnt.length || 0;
  if (len < 1) return null;
  const rot = (braceEnt.rot || 0) * Math.PI / 180;
  const cosR = Math.cos(rot), sinR = Math.sin(rot);
  const hd = v25Mem2HalfDepth(braceEnt);
  const local2world = (lx, ly) => [
    braceEnt.u + lx * cosR - ly * sinR,
    braceEnt.v + lx * sinR + ly * cosR,
  ];
  const world2local = (wu, wv) => {
    const dx = wu - braceEnt.u, dy = wv - braceEnt.v;
    return { x: dx * cosR + dy * sinR, y: -dx * sinR + dy * cosR };
  };
  // Brace edges in world. Walk FROM the far end TOWARD the joined end so the
  // first host-outline intersection is the cap.
  const farX = endKey === 'A' ? len : 0;
  const nearX = endKey === 'A' ? 0 : len;
  // Extend the near point a section-depth past the joined end so the ray will
  // still hit the host even if the user joined "just on the boundary".
  const overshoot = hd * 4;
  const dirSign = endKey === 'A' ? -1 : 1; // direction from far → near
  const overshootX = nearX + dirSign * overshoot;
  const topFar = local2world(farX, hd);
  const topNear = local2world(overshootX, hd);
  const botFar = local2world(farX, -hd);
  const botNear = local2world(overshootX, -hd);
  const hostPoly = v25Mem2WorldOutline(host);
  const topHit = v25FirstSegPolyHit(topFar, topNear, hostPoly);
  const botHit = v25FirstSegPolyHit(botFar, botNear, hostPoly);
  if (!topHit || !botHit) return null;
  const topL = world2local(topHit.u, topHit.v);
  const botL = world2local(botHit.u, botHit.v);
  // Sanity: the cap must lie between far and (overshoot beyond near). If the
  // brace doesn't reach the host at all, both hits would be near `overshootX`
  // — bail so we fall back to a flat end.
  const capX = (topL.x + botL.x) / 2;
  if (endKey === 'A' && capX > len * 0.95) return null;
  if (endKey === 'B' && capX < len * 0.05) return null;
  // Default weld size from AS 4100 Cl. 9.7.3.10 (existing helper).
  const tThin = Math.min(v25Mem2Thickness(braceEnt), v25Mem2Thickness(host));
  const weldSize = (join.weld && join.weld.size) ||
    (typeof autoWeldMinSize === 'function' ? autoWeldMinSize(tThin) : 6);
  return {
    topLocalX: topL.x,
    botLocalX: botL.x,
    weldSize,
  };
}

// Hit-test which end of a steel member (mem2) the cursor is over.
// Returns 'A' for the near end (start), 'B' for the far end, or null
// when the click lands somewhere mid-span. Works in member-local frame.
function v25HitMemberEnd(ent, cu, cv) {
  if (!ent || ent.type !== 'mem2') return null;
  const len = ent.length || 0;
  if (len < 1) return null;
  const rot = (ent.rot || 0) * Math.PI / 180;
  const cosR = Math.cos(rot), sinR = Math.sin(rot);
  // World-delta from member origin → member-local frame.
  const dx = cu - ent.u, dy = cv - ent.v;
  const localX = dx * cosR + dy * sinR;
  const localY = -dx * sinR + dy * cosR;
  const halfD = v25Mem2HalfDepth(ent);
  // Click must be within the section depth perpendicular to the member.
  if (Math.abs(localY) > halfD * 1.4) return null;
  // End-zone is the smaller of (a) ~half a section depth and (b) 25% of len.
  const endZone = Math.max(20, Math.min(halfD * 1.0, len * 0.25));
  if (localX < endZone) return 'A';
  if (localX > len - endZone) return 'B';
  return null;
}

// Small floating popup that lets the user toggle a member's end cap
// between a normal solid edge and a stylised breakline. Anchored at the
// double-click location and dismissed on outside-click / Esc.
let _v25EndCapPopup = null;
function _v25EndCapPopupOutside(e) {
  if (_v25EndCapPopup && !_v25EndCapPopup.contains(e.target)) v25CloseEndCapPopup();
}
function v25CloseEndCapPopup() {
  if (_v25EndCapPopup) { _v25EndCapPopup.remove(); _v25EndCapPopup = null; }
  document.removeEventListener('mousedown', _v25EndCapPopupOutside, true);
  document.removeEventListener('keydown', _v25EndCapPopupKey, true);
}
function _v25EndCapPopupKey(e) {
  if (e.key === 'Escape') { v25CloseEndCapPopup(); e.preventDefault(); }
}
function v25OpenEndCapPopup(ent, which, clientX, clientY) {
  v25CloseEndCapPopup();
  const key = which === 'A' ? 'endA' : 'endB';
  const current = ent[key] || 'normal';
  const pop = document.createElement('div');
  pop.style.cssText = 'position:fixed;z-index:1700;min-width:170px;padding:8px 10px;display:flex;flex-direction:column;gap:6px;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;box-shadow:var(--shadow-md, 0 4px 16px rgba(0,0,0,.18));font:12px var(--font-sans, system-ui);color:var(--text)';
  document.body.appendChild(pop);
  const W = 200, H = 100;
  pop.style.left = Math.min(clientX + 12, window.innerWidth  - W - 8) + 'px';
  pop.style.top  = Math.min(clientY + 12, window.innerHeight - H - 8) + 'px';
  _v25EndCapPopup = pop;
  pop.innerHTML = `
    <div style="font-weight:700;font-size:10px;letter-spacing:.06em;color:var(--text-mute);text-transform:uppercase">
      ${which === 'A' ? 'Start end' : 'Far end'} cap
    </div>
    <select id="v25ec-sel" style="padding:4px 6px;border:1px solid var(--border);border-radius:4px;background:var(--surface-2);color:var(--text);font:12px system-ui">
      <option value="normal"${current === 'normal' ? ' selected' : ''}>Normal end</option>
      <option value="breakline"${current === 'breakline' ? ' selected' : ''}>Breakline</option>
    </select>`;
  const sel = pop.querySelector('#v25ec-sel');
  sel.focus();
  sel.addEventListener('change', () => {
    ent[key] = sel.value;
    if (typeof v25UpdateInspector === 'function') v25UpdateInspector();
    if (typeof requestRender === 'function') requestRender();
    v25CloseEndCapPopup();
  });
  setTimeout(() => {
    document.addEventListener('mousedown', _v25EndCapPopupOutside, true);
    document.addEventListener('keydown', _v25EndCapPopupKey, true);
  }, 0);
}

