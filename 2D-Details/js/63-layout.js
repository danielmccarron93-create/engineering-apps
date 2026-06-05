'use strict';

// Fit-to-view + layoutBlocks + resize
// Extracted from dev/index.html lines 16502-16571 (2026-05-02 modular split)

// FIT VIEW & LAYOUT
// ============================================================

function fitToView() {
  const padding = 60;
  // Multi-file-workspace: fit/centre the ACTIVE page (native A1 returns the
  // SHEET default, so A1 pages stay byte-identical).
  const pg = (typeof activePageSize === 'function') ? activePageSize() : { w: SHEET.W, h: SHEET.H };
  const pgW = pg.w, pgH = pg.h;
  const zoomX = (W - padding * 2) / pgW;
  const zoomY = (H - padding * 2) / pgH;
  // V25 — clamp to a sane positive minimum to avoid negative zoom when the
  // canvas is briefly sized to 0 width (e.g. inspector panel pushes it).
  let z = Math.min(zoomX, zoomY);
  if (!isFinite(z) || z < 0.05) z = 0.05;
  viewport.zoom = z;
  viewport.panX = (W - pgW * viewport.zoom) / 2;
  viewport.panY = (H - pgH * viewport.zoom) / 2;
  requestRender();
}

function layoutBlocks() {
  // Position the four detail blocks on the active page with generous spacing.
  // Elevation gets the largest area (top-left ~55%), Section A top-right,
  // Plan B bottom-left, Isometric bottom-right.
  const gap = 8; // sheet-mm gap between blocks

  // Multi-file-workspace: derive the drawing area from the ACTIVE page size
  // (using the shared SHEET margins / title-block band). Native A1 returns the
  // SHEET default, so DA-equivalent extents and 3D block packing are
  // byte-identical to today.
  const pg = (typeof activePageSize === 'function') ? activePageSize() : { w: SHEET.W, h: SHEET.H };
  const daLeft = SHEET.ML;
  const daTop = SHEET.MT;
  const daRight = pg.w - SHEET.MR;
  const daBottom = pg.h - SHEET.MB - SHEET.TB_H;
  const daWidth = daRight - daLeft;
  const daHeight = daBottom - daTop;

  // Elevation: large box, top-left
  const elevW = daWidth * 0.55;
  const elevH = daHeight * 0.55;
  blocks[0].boxW = elevW;
  blocks[0].boxH = elevH;
  blocks[0].sheetX = daLeft + elevW / 2 + gap;
  blocks[0].sheetY = daTop + elevH / 2 + gap;

  // Section A: top-right, same height as elevation, narrower
  const secW = daWidth - elevW - gap * 3;
  const secH = elevH;
  blocks[1].boxW = secW;
  blocks[1].boxH = secH;
  blocks[1].sheetX = daLeft + elevW + gap * 2 + secW / 2;
  blocks[1].sheetY = daTop + secH / 2 + gap;

  // Plan B: bottom-left, same width as elevation, shorter
  const planH = daHeight - elevH - gap * 3;
  blocks[2].boxW = elevW;
  blocks[2].boxH = planH;
  blocks[2].sheetX = daLeft + elevW / 2 + gap;
  blocks[2].sheetY = daTop + elevH + gap * 2 + planH / 2;

  // Isometric: bottom-right
  if (blocks.length > 3) {
    blocks[3].boxW = secW;
    blocks[3].boxH = planH;
    blocks[3].sheetX = daLeft + elevW + gap * 2 + secW / 2;
    blocks[3].sheetY = daTop + elevH + gap * 2 + planH / 2;
  }
}

// ============================================================
// RESIZE
// ============================================================

function resize() {
  const rect = container.getBoundingClientRect();
  W = rect.width;
  H = rect.height;
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  requestRender();
}

