'use strict';

// View labels (Elevation, Section A, Plan B, Iso)
// Extracted from dev/index.html lines 10804-10889 (2026-05-02 modular split)

// VIEW LABELS
// ============================================================

function drawViewLabel(blk, cs) {
  // V25 — in 2D mode we suppress labels for hidden views (no "double-click
  // to show" hints) and the elevation label too, since it's the only pane.
  if (sheetMode === '2d') {
    if (blk.viewKey !== 'elevation') return;
    if (blk.hidden) return;
    return; // Don't show "ELEVATION 1:1" — confusing in paper-space mode.
  }
  const bbox = getBlockSheetBounds(blk);
  const labelSheetY = bbox.bottom + 5;
  const labelSheetX = (bbox.left + bbox.right) / 2;
  const p = s2px(labelSheetX, labelSheetY);

  const fs = Math.max(6, sheetLen(3.5));
  ctx.font = `bold ${fs}px system-ui`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';

  const labels = { elevation: 'ELEVATION', sectionA: 'SECTION A', planB: 'PLAN B', isometric: 'ISOMETRIC' };
  const labelText = labels[blk.viewKey] || blk.viewKey;

  if (blk.hidden) {
    // Greyed-out label for hidden views
    ctx.fillStyle = cs.getPropertyValue('--mute').trim();
    ctx.globalAlpha = 0.4;
    ctx.fillText(labelText + '  [Hidden]', p.x, p.y);
    const fs2 = Math.max(5, sheetLen(2));
    ctx.font = `${fs2}px system-ui`;
    ctx.fillText('Double-click to show', p.x, p.y + fs + 2);
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = cs.getPropertyValue('--ink').trim();
    ctx.fillText(labelText, p.x, p.y);

    // Scale text below
    const fs2 = Math.max(5, sheetLen(2.5));
    ctx.font = `${fs2}px system-ui`;
    ctx.fillStyle = cs.getPropertyValue('--mute').trim();
    const p2y = p.y + fs + 2;
    ctx.fillText(`Scale 1:${drawingScale}`, p.x, p2y);

    // Orbiting indicator for isometric view
    if (blk.viewKey === 'isometric' && v3dOrbiting) {
      ctx.fillStyle = cs.getPropertyValue('--selected-color').trim();
      const fs3 = Math.max(4, sheetLen(1.8));
      ctx.font = `${fs3}px system-ui`;
      ctx.fillText('Orbiting — Enter to lock', p.x, p2y + fs2 + 3);
    }
  }

  // Underline when block is being dragged
  if (blockDragging === blk) {
    const selCol = cs.getPropertyValue('--selected-color').trim();
    ctx.strokeStyle = selCol; ctx.lineWidth = 1.5;
    const tw = ctx.measureText(labelText).width;
    ctx.beginPath();
    ctx.moveTo(p.x - tw / 2, p.y + fs + 1);
    ctx.lineTo(p.x + tw / 2, p.y + fs + 1);
    ctx.stroke();
  }

  ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
}

// Hit-test: is the cursor over a view label? Returns the block or null.
function hitTestViewLabel(px, py) {
  const fs = Math.max(6, sheetLen(3.5));
  const labelH = fs + Math.max(5, sheetLen(2.5)) + 6; // total label height
  const labelW = 80; // approximate half-width in px

  for (const blk of blocks) {
    const bbox = getBlockSheetBounds(blk);
    const labelSheetY = bbox.bottom + 5;
    const labelSheetX = (bbox.left + bbox.right) / 2;
    const p = s2px(labelSheetX, labelSheetY);

    if (px >= p.x - labelW && px <= p.x + labelW && py >= p.y - 4 && py <= p.y + labelH) {
      return blk;
    }
  }
  return null;
}

// ============================================================
