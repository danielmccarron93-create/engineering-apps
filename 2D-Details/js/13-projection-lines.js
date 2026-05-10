'use strict';

// Projection lines between views
// Extracted from dev/index.html lines 6176-6274 (2026-05-02 modular split)

// PROJECTION LINES between views
// ============================================================

function drawProjectionLines(cs) {
  if (sheetMode === '2d') return; // V25 — no projection grid in 2D mode
  if (blocks.length < 2) return;
  const projCol = cs.getPropertyValue('--proj-line').trim();
  ctx.strokeStyle = projCol;
  ctx.lineWidth = 0.5;
  ctx.setLineDash(DASH.UI_CHAIN);

  const elev = blocks.find(b => b.viewKey === 'elevation');
  const secA = blocks.find(b => b.viewKey === 'sectionA');
  const planB = blocks.find(b => b.viewKey === 'planB');

  if (elev && secA) {
    // Horizontal projection lines: key Y-coordinates from elevation → section
    // Top flange of first UB found
    objects3D.forEach(obj => {
      if (obj.type === 'ub') {
        const s = UB_DB[obj.section]; if (!s) return;
        const topY = obj.y + s.d / 2;
        const botY = obj.y - s.d / 2;
        [topY, botY].forEach(yVal => {
          const p1 = real2px(elev, 0, yVal);  // just need the Y
          const p2 = real2px(secA, 0, yVal);
          // Draw from right side of elevation bounds to left side of section
          const eBounds = getBlockSheetBounds(elev);
          const sBounds = getBlockSheetBounds(secA);
          const pxLeft = s2px(eBounds.right, 0);
          const pxRight = s2px(sBounds.left, 0);
          ctx.beginPath();
          ctx.moveTo(pxLeft.x, p1.y);
          ctx.lineTo(pxRight.x, p2.y);
          ctx.stroke();
        });
      }
      if (obj.type === 'shs') {
        const s = SHS_DB[obj.section]; if (!s) return;
        // Horizontal default: Y-extent is the section depth (B), not length
        const topY = obj.y + s.B / 2;
        const botY = obj.y - s.B / 2;
        [topY, botY].forEach(yVal => {
          const p1 = real2px(elev, 0, yVal);
          const eBounds = getBlockSheetBounds(elev);
          const sBounds = getBlockSheetBounds(secA);
          const pxLeft = s2px(eBounds.right, 0);
          const pxRight = s2px(sBounds.left, 0);
          ctx.beginPath();
          ctx.moveTo(pxLeft.x, p1.y);
          ctx.lineTo(pxRight.x, p1.y);
          ctx.stroke();
        });
      }
    });
  }

  if (elev && planB) {
    // Vertical projection lines: key X-coordinates from elevation → plan
    objects3D.forEach(obj => {
      if (obj.type === 'shs') {
        const s = SHS_DB[obj.section]; if (!s) return;
        // Horizontal default: X-extent is the member length, not section depth
        const leftX = obj.x - obj.length / 2;
        const rightX = obj.x + obj.length / 2;
        [leftX, rightX].forEach(xVal => {
          const p1 = real2px(elev, xVal, 0);
          const eBounds = getBlockSheetBounds(elev);
          const pBounds = getBlockSheetBounds(planB);
          const pxTop = s2px(0, eBounds.bottom);
          const pxBot = s2px(0, pBounds.top);
          ctx.beginPath();
          ctx.moveTo(p1.x, pxTop.y);
          ctx.lineTo(p1.x, pxBot.y);
          ctx.stroke();
        });
      }
      if (obj.type === 'ub') {
        const cx = obj.x;
        const hl = obj.length / 2;
        [cx - hl, cx + hl].forEach(xVal => {
          const p1 = real2px(elev, xVal, 0);
          const eBounds = getBlockSheetBounds(elev);
          const pBounds = getBlockSheetBounds(planB);
          const pxTop = s2px(0, eBounds.bottom);
          const pxBot = s2px(0, pBounds.top);
          ctx.beginPath();
          ctx.moveTo(p1.x, pxTop.y);
          ctx.lineTo(p1.x, pxBot.y);
          ctx.stroke();
        });
      }
    });
  }

  ctx.setLineDash([]);
}

// ============================================================
