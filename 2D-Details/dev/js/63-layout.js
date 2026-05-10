'use strict';

// Fit-to-view + layoutBlocks + resize
// Extracted from dev/index.html lines 16502-16571 (2026-05-02 modular split)

// FIT VIEW & LAYOUT
// ============================================================

function fitToView() {
  const padding = 60;
  const zoomX = (W - padding * 2) / SHEET.W;
  const zoomY = (H - padding * 2) / SHEET.H;
  // V25 — clamp to a sane positive minimum to avoid negative zoom when the
  // canvas is briefly sized to 0 width (e.g. inspector panel pushes it).
  let z = Math.min(zoomX, zoomY);
  if (!isFinite(z) || z < 0.05) z = 0.05;
  viewport.zoom = z;
  viewport.panX = (W - SHEET.W * viewport.zoom) / 2;
  viewport.panY = (H - SHEET.H * viewport.zoom) / 2;
  requestRender();
}

function layoutBlocks() {
  // Position the four detail blocks on the A1 sheet with generous spacing.
  // Elevation gets the largest area (top-left ~55%), Section A top-right,
  // Plan B bottom-left, Isometric bottom-right.
  const gap = 8; // sheet-mm gap between blocks

  // Elevation: large box, top-left
  const elevW = DA.width * 0.55;
  const elevH = DA.height * 0.55;
  blocks[0].boxW = elevW;
  blocks[0].boxH = elevH;
  blocks[0].sheetX = DA.left + elevW / 2 + gap;
  blocks[0].sheetY = DA.top + elevH / 2 + gap;

  // Section A: top-right, same height as elevation, narrower
  const secW = DA.width - elevW - gap * 3;
  const secH = elevH;
  blocks[1].boxW = secW;
  blocks[1].boxH = secH;
  blocks[1].sheetX = DA.left + elevW + gap * 2 + secW / 2;
  blocks[1].sheetY = DA.top + secH / 2 + gap;

  // Plan B: bottom-left, same width as elevation, shorter
  const planH = DA.height - elevH - gap * 3;
  blocks[2].boxW = elevW;
  blocks[2].boxH = planH;
  blocks[2].sheetX = DA.left + elevW / 2 + gap;
  blocks[2].sheetY = DA.top + elevH + gap * 2 + planH / 2;

  // Isometric: bottom-right
  if (blocks.length > 3) {
    blocks[3].boxW = secW;
    blocks[3].boxH = planH;
    blocks[3].sheetX = DA.left + elevW + gap * 2 + secW / 2;
    blocks[3].sheetY = DA.top + elevH + gap * 2 + planH / 2;
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

