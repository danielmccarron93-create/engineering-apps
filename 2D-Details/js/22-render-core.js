'use strict';

// Rendering core — render() + requestRender + drawSheet header
// Extracted from dev/index.html lines 4602-4753 (2026-05-02 modular split)

// RENDERING
// ============================================================

let renderRequested = false;
function requestRender() {
  if (renderRequested) return;
  renderRequested = true;
  requestAnimationFrame(() => { renderRequested = false; render(); });
}

function render() {
  const cs = getComputedStyle(document.body);

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);

  // Workspace background
  ctx.fillStyle = cs.getPropertyValue('--workspace-bg').trim();
  ctx.fillRect(0, 0, W, H);

  // Draw A1 sheet
  drawSheet(cs);

  // Draw grid on sheet (if enabled)
  if (gridOn) drawSheetGrid(cs);

  // Draw drawing frame and title block
  drawDrawingFrame(cs);

  // Draw projection lines between views
  drawProjectionLines(cs);

  // Draw section cut lines (before content so they're behind objects)
  drawSectionCutLines(cs);

  // Draw detail blocks (each view's content) — skip hidden
  blocks.forEach(blk => {
    if (!blk.hidden) drawBlockContent(blk, cs);
  });

  // Draw view box frames (all visible blocks) with resize grips on active
  drawBlockFrames(cs);

  // Selection highlights
  blocks.forEach(blk => {
    if (!blk.hidden) selected3D.forEach(obj => drawSelHighlight(blk, obj, cs));
  });

  // Edge snap feedback lines
  drawEdgeSnapLines(cs);

  // Marquee selection rubber-band (Bluebeam/AutoCAD convention).
  // Drawn in screen-px so it's always axis-aligned to the canvas regardless
  // of view-plane orientation. Window (L→R): solid blue + faint blue fill,
  // only fully-enclosed objects selected. Crossing (R→L): dashed green +
  // faint green fill, anything touching the box selected. Mouseup branch in
  // 39-events.js does the actual filtering with the same crossing rule.
  if (selBoxStart && cursorSheet && activeBlock) {
    const sp = real2px(activeBlock, selBoxStart[0], selBoxStart[1]);
    const x0 = sp.x, y0 = sp.y;
    const x1 = cursorSheet.px, y1 = cursorSheet.py;
    const dx = x1 - x0, dy = y1 - y0;
    // Avoid drawing for a click that hasn't actually moved yet — 2 px matches
    // the mouseup "noise" threshold so we never render a box that won't act.
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      const crossing = dx < 0;
      const stroke = crossing ? '#3aa84a' : '#1e6ec8';
      const fill   = crossing ? 'rgba(58, 168, 74, 0.10)'
                              : 'rgba(30, 110, 200, 0.10)';
      const bx = Math.min(x0, x1), by = Math.min(y0, y1);
      const bw = Math.abs(dx),     bh = Math.abs(dy);
      ctx.save();
      ctx.fillStyle = fill;
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.setLineDash(crossing ? [6, 4] : []);
      // +0.5 / -1 for crisp 1px stroke on integer pixel grid
      ctx.strokeRect(bx + 0.5, by + 0.5, Math.max(0, bw - 1), Math.max(0, bh - 1));
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  // Click preview and crosshair
  if (activeBlock && cursorSheet) {
    drawClickPreview(activeBlock, cs);
    drawCrosshair(activeBlock, cs);
  }

  // Rotation preview arc during rotation drag (legacy 3D path)
  if (rotateMode && rotatePivot && activeGrip && activeBlock) {
    const cp = real2px(activeBlock, rotatePivot.u, rotatePivot.v);
    const selCol = cs.getPropertyValue('--selected-color').trim();
    ctx.strokeStyle = colorAlpha(selCol, 0.5);
    ctx.lineWidth = 1;
    ctx.setLineDash(DASH.UI_ROT);
    ctx.beginPath(); ctx.arc(cp.x, cp.y, 30, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    // Show angle text
    const rot = activeGrip.obj.rot || 0;
    ctx.fillStyle = selCol; ctx.font = 'bold 11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(`${rot.toFixed(1)}°`, cp.x, cp.y - 38);
    ctx.textAlign = 'start';
  }

  // Live rotation angle readout for 2D mem2 / mat drag. Mirrors the legacy
  // arc + numeric text above. Pivot is the member midpoint or the mat
  // centroid; a faint dashed pivot circle plus snap-stop ticks at
  // 0/45/90/... give the user a visual reference for where the snaps are.
  // Hold Shift to bypass the snap (free rotation) — readout label shows
  // ' · free' so the user knows the modifier is taking effect.
  if (sheetMode === '2d' && v25Drag && v25Drag.handle === 'rotate' && activeBlock) {
    const ent = v25Drag.ent;
    let pivotU, pivotV;
    if (ent && ent.type === 'mem2') {
      const r = (ent.rot || 0) * Math.PI / 180;
      const len = ent.length || 0;
      pivotU = ent.u + Math.cos(r) * (len / 2);
      pivotV = ent.v + Math.sin(r) * (len / 2);
    } else if (ent && ent.type === 'mat') {
      const c = _v25MatCentroid(ent);
      pivotU = c.u; pivotV = c.v;
    }
    if (pivotU != null) {
      const cp = real2px(activeBlock, pivotU, pivotV);
      const selCol = cs.getPropertyValue('--selected-color').trim();
      // Pivot circle
      ctx.strokeStyle = colorAlpha(selCol, 0.5);
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(cp.x, cp.y, 30, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      // Snap-stop tick marks at 0/45/90/...
      const tickInner = 26, tickOuter = 34;
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = colorAlpha(selCol, 0.55);
      ROT_SNAP_DEFAULT_DEG.forEach(deg => {
        // Member orientation = (cos a, sin a) in real-world; canvas y is
        // flipped from real-world y so screen direction is (cos a, -sin a).
        const a = deg * Math.PI / 180;
        const dxs = Math.cos(a), dys = -Math.sin(a);
        ctx.beginPath();
        ctx.moveTo(cp.x + dxs * tickInner, cp.y + dys * tickInner);
        ctx.lineTo(cp.x + dxs * tickOuter, cp.y + dys * tickOuter);
        ctx.stroke();
      });
      // Numeric readout
      const rotDeg = ent.rot || 0;
      ctx.fillStyle = selCol; ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'center';
      const shiftLabel = (typeof shiftHeld !== 'undefined' && shiftHeld) ? '  · free' : '';
      ctx.fillText(`${rotDeg.toFixed(1)}°${shiftLabel}`, cp.x, cp.y - 42);
      ctx.textAlign = 'start';
    }
  }

  // Grip drag dimension feedback
  if (activeGrip && gripStart && !rotateMode && activeBlock) {
    const obj = activeGrip.obj;
    const selCol = cs.getPropertyValue('--selected-color').trim();
    ctx.fillStyle = selCol; ctx.font = '10px system-ui'; ctx.textAlign = 'left';
    let label = '';
    if (obj.type === 'plate') {
      if (obj.polyPts) label = `PL ${obj.pt} thk (${obj.polyPts.length} vertices)`;
      else label = `${obj.pw.toFixed(0)} × ${obj.ph.toFixed(0)} × ${obj.pt.toFixed(0)}`;
    }
    else if (obj.type === 'ub' || obj.type === 'shs') label = `L=${obj.length.toFixed(0)}`;
    if (label && cursorSheet) {
      ctx.fillText(label, cursorSheet.px + 15, cursorSheet.py - 10);
    }
  }

  // View labels
  blocks.forEach(blk => drawViewLabel(blk, cs));

  updateStatus();
}

// ============================================================
// DRAW SHEET
// ============================================================

// ============================================================
