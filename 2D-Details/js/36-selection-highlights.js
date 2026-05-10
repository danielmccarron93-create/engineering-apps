'use strict';

// Selection highlights
// Extracted from dev/index.html lines 10681-10803 (2026-05-02 modular split)

// SELECTION HIGHLIGHTS
// ============================================================

function drawSelHighlight(blk, obj, cs) {
  const b = getObj2DBounds(obj, blk);
  if (!b) return;
  const selCol = cs.getPropertyValue('--selected-color').trim();

  // Compute rotation centre (same as drawing functions use)
  const rc = blk.viewKey === 'elevation' ? [obj.x, obj.y] :
             blk.viewKey === 'sectionA' ? [obj.z, obj.y] : [obj.x, obj.z];

  // Wrap entire selection highlight in withRotation so outline matches drawn member
  withRotation(blk, obj, rc[0], rc[1], () => {
  const p1 = real2px(blk, b.u1, b.v2);
  const p2 = real2px(blk, b.u2, b.v1);

  // Bounding box dashes
  ctx.strokeStyle = selCol; ctx.lineWidth = 1.5; ctx.setLineDash(DASH.HIDDEN);
  ctx.strokeRect(p1.x, p1.y, p2.x-p1.x, p2.y-p1.y);
  ctx.setLineDash([]);

  // Corner grips (small filled squares)
  ctx.fillStyle = selCol;
  const gs = 3;
  const corners = [[b.u1,b.v1],[b.u2,b.v1],[b.u1,b.v2],[b.u2,b.v2]];
  corners.forEach(g => {
    const gp = real2px(blk, g[0], g[1]);
    ctx.fillRect(gp.x-gs, gp.y-gs, gs*2, gs*2);
  });

  // Functional grips (resize, extend, rotate) — draw as diamonds or circles
  const grips = getGrips(obj, blk);
  grips.forEach(g => {
    const gp = real2px(blk, g.u, g.v);
    if (g.type === 'rotate') {
      // Rotation handle: circle with arc arrow
      ctx.strokeStyle = selCol; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(gp.x, gp.y, 5, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = colorAlpha(selCol, 0.3); ctx.fill();
      // Line connecting to bbox top
      const topMid = real2px(blk, g.u, b.v2);
      ctx.strokeStyle = colorAlpha(selCol, 0.4); ctx.lineWidth = 0.8;
      ctx.setLineDash(DASH.THREAD);
      ctx.beginPath(); ctx.moveTo(topMid.x, topMid.y); ctx.lineTo(gp.x, gp.y); ctx.stroke();
      ctx.setLineDash([]);
    } else {
      // Resize/extend handle: filled diamond (5px for visibility on small sections)
      const gs = 5;
      ctx.fillStyle = selCol;
      ctx.beginPath();
      ctx.moveTo(gp.x, gp.y - gs);
      ctx.lineTo(gp.x + gs, gp.y);
      ctx.lineTo(gp.x, gp.y + gs);
      ctx.lineTo(gp.x - gs, gp.y);
      ctx.closePath();
      ctx.fill();
      // White outline for contrast
      ctx.strokeStyle = colorAlpha('#ffffff', 0.7); ctx.lineWidth = 1.0;
      ctx.stroke();
    }
  });

  // Show rotation angle if non-zero
  if (obj.rot && obj.rot !== 0) {
    const cp = real2px(blk, (b.u1+b.u2)/2, b.v1 - 8);
    ctx.fillStyle = selCol;
    ctx.font = '9px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(`${obj.rot.toFixed(1)}°`, cp.x, cp.y);
    ctx.textAlign = 'start';
  }
  }); // end withRotation
}

function drawBlockFrames(cs) {
  // V25 — in 2D mode the elevation block fills the entire drawing area
  // and is fixed; drawing its frame + grips would create visual noise and
  // mislead users into trying to drag it.
  if (sheetMode === '2d') return;
  const selCol = cs.getPropertyValue('--selected-color').trim();
  const muteCol = cs.getPropertyValue('--mute').trim();
  blocks.forEach(blk => {
    if (blk.hidden) return;
    const bbox = getBlockSheetBounds(blk);
    const tl = s2px(bbox.left, bbox.top);
    const br = s2px(bbox.right, bbox.bottom);
    const w = br.x - tl.x, h = br.y - tl.y;
    const isActive = blk === activeBlock;
    // Frame border
    // V25-c — quieter active-view highlight: 1px hairline at 0.22 alpha
    // (was 1.5px / 0.35). Still reads as "selected" but no longer competes
    // with the drawing content for visual attention. Inactive frames stay
    // hairline at 0.10.
    ctx.strokeStyle = isActive ? selCol : muteCol;
    ctx.globalAlpha = isActive ? 0.22 : 0.10;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.strokeRect(tl.x, tl.y, w, h);
    ctx.globalAlpha = 1;

    // Resize grip triangles on active block corners
    if (isActive) {
      const gs = 7; // grip triangle size in px
      ctx.fillStyle = selCol; ctx.globalAlpha = 0.5;
      // NW
      ctx.beginPath(); ctx.moveTo(tl.x, tl.y); ctx.lineTo(tl.x + gs, tl.y); ctx.lineTo(tl.x, tl.y + gs); ctx.fill();
      // NE
      ctx.beginPath(); ctx.moveTo(br.x, tl.y); ctx.lineTo(br.x - gs, tl.y); ctx.lineTo(br.x, tl.y + gs); ctx.fill();
      // SW
      ctx.beginPath(); ctx.moveTo(tl.x, br.y); ctx.lineTo(tl.x + gs, br.y); ctx.lineTo(tl.x, br.y - gs); ctx.fill();
      // SE
      ctx.beginPath(); ctx.moveTo(br.x, br.y); ctx.lineTo(br.x - gs, br.y); ctx.lineTo(br.x, br.y - gs); ctx.fill();
      ctx.globalAlpha = 1;
    }
  });
}

// Keep legacy name for any callers
function drawActiveBlockHighlight(blk, cs) {
  // Now handled by drawBlockFrames — no-op
}

// ============================================================
