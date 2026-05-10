'use strict';

// Section cut lines — draggable cut indicators on elevation
// Extracted from dev/index.html lines 6275-6398 (2026-05-02 modular split)

// SECTION CUT LINES — draggable cut indicators on elevation
// ============================================================

function drawSectionCutLines(cs) {
  if (sheetMode === '2d') return; // V25 — no section cut lines in 2D mode
  const elev = blocks.find(b => b.viewKey === 'elevation');
  if (!elev) return;
  const eBounds = getBlockSheetBounds(elev);
  const pm = ppm();
  const selCol = cs.getPropertyValue('--selected-color').trim();
  const inkCol = cs.getPropertyValue('--ink').trim();

  // Section A cut: vertical line at secCutX in elevation
  {
    const p = real2px(elev, secCutX, 0);
    const yTop = s2px(0, eBounds.top).y - 15;
    const yBot = s2px(0, eBounds.bottom).y + 15;
    const isHover = draggingCutLine === 'secA';

    ctx.strokeStyle = isHover ? selCol : inkCol;
    ctx.lineWidth = isHover ? 1.5 : 1;
    ctx.setLineDash(DASH.SECTION); // AS 1100 long-dash-dot
    ctx.beginPath(); ctx.moveTo(p.x, yTop); ctx.lineTo(p.x, yBot); ctx.stroke();
    ctx.setLineDash([]);

    // Arrow heads (pointing right = viewing direction for section A)
    const arrowSize = 6;
    ctx.fillStyle = isHover ? selCol : inkCol;
    // Top arrow
    ctx.beginPath();
    ctx.moveTo(p.x + arrowSize, yTop + 5);
    ctx.lineTo(p.x + arrowSize + 6, yTop + 5 - 4);
    ctx.lineTo(p.x + arrowSize + 6, yTop + 5 + 4);
    ctx.closePath(); ctx.fill();
    // Bottom arrow
    ctx.beginPath();
    ctx.moveTo(p.x + arrowSize, yBot - 5);
    ctx.lineTo(p.x + arrowSize + 6, yBot - 5 - 4);
    ctx.lineTo(p.x + arrowSize + 6, yBot - 5 + 4);
    ctx.closePath(); ctx.fill();

    // Label "A"
    const fs = Math.max(9, 2.5 * pm);
    ctx.font = `bold ${fs}px system-ui`; ctx.textAlign = 'center';
    ctx.fillText('A', p.x, yTop - 4);
    ctx.fillText('A', p.x, yBot + fs + 2);
    ctx.textAlign = 'start';
  }

  // Plan B cut: horizontal line at planCutY in elevation
  {
    const p = real2px(elev, 0, planCutY);
    const xLeft = s2px(eBounds.left, 0).x - 15;
    const xRight = s2px(eBounds.right, 0).x + 15;
    const isHover = draggingCutLine === 'planB';

    ctx.strokeStyle = isHover ? selCol : inkCol;
    ctx.lineWidth = isHover ? 1.5 : 1;
    ctx.setLineDash(DASH.SECTION);
    ctx.beginPath(); ctx.moveTo(xLeft, p.y); ctx.lineTo(xRight, p.y); ctx.stroke();
    ctx.setLineDash([]);

    // Arrow heads (pointing down = viewing direction for plan B)
    const arrowSize = 6;
    ctx.fillStyle = isHover ? selCol : inkCol;
    // Left arrow
    ctx.beginPath();
    ctx.moveTo(xLeft + 5, p.y + arrowSize);
    ctx.lineTo(xLeft + 5 - 4, p.y + arrowSize + 6);
    ctx.lineTo(xLeft + 5 + 4, p.y + arrowSize + 6);
    ctx.closePath(); ctx.fill();
    // Right arrow
    ctx.beginPath();
    ctx.moveTo(xRight - 5, p.y + arrowSize);
    ctx.lineTo(xRight - 5 - 4, p.y + arrowSize + 6);
    ctx.lineTo(xRight - 5 + 4, p.y + arrowSize + 6);
    ctx.closePath(); ctx.fill();

    // Label "B"
    const fs = Math.max(9, 2.5 * pm);
    ctx.font = `bold ${fs}px system-ui`; ctx.textAlign = 'center';
    ctx.fillText('B', xLeft - fs / 2 - 2, p.y + 4);
    ctx.fillText('B', xRight + fs / 2 + 2, p.y + 4);
    ctx.textAlign = 'start';
  }

  // ---- AUTO SECTION LABELS on section/plan views ----
  const secABlk = blocks.find(b => b.viewKey === 'sectionA');
  if (secABlk && !secABlk.hidden) {
    const sb = getBlockSheetBounds(secABlk);
    const lp = s2px((sb.left + sb.right) / 2, sb.top - 3);
    const lfs = Math.max(7, sheetLen(2.5));
    ctx.font = `bold ${lfs}px system-ui`; ctx.textAlign = 'center';
    ctx.fillStyle = cs.getPropertyValue('--section-a-accent').trim();
    ctx.fillText('SECTION A-A', lp.x, lp.y);
    ctx.textAlign = 'start';
  }
  const planBBlk = blocks.find(b => b.viewKey === 'planB');
  if (planBBlk && !planBBlk.hidden) {
    const pb = getBlockSheetBounds(planBBlk);
    const lp = s2px((pb.left + pb.right) / 2, pb.top - 3);
    const lfs = Math.max(7, sheetLen(2.5));
    ctx.font = `bold ${lfs}px system-ui`; ctx.textAlign = 'center';
    ctx.fillStyle = cs.getPropertyValue('--plan-b-accent').trim();
    ctx.fillText('PLAN B-B', lp.x, lp.y);
    ctx.textAlign = 'start';
  }
}

// Hit-test section cut lines — returns 'secA', 'planB', or null
function hitTestCutLine(block, px, py) {
  if (!block || block.viewKey !== 'elevation') return null;
  const real = px2real(block, px, py);
  const tolPx = 8; // pixel tolerance
  const tolReal = tolPx * drawingScale / viewport.zoom;

  // Section A: vertical line at secCutX
  if (Math.abs(real.u - secCutX) < tolReal) return 'secA';
  // Plan B: horizontal line at planCutY
  if (Math.abs(real.v - planCutY) < tolReal) return 'planB';
  return null;
}

// ============================================================
