'use strict';

// A1 sheet config + drawing area
// Extracted from dev/index.html lines 2802-2828 (2026-05-02 modular split)

'use strict';

// ============================================================
// A1 SHEET CONFIGURATION
// ============================================================

const SHEET = {
  W: 841,       // A1 width in mm
  H: 594,       // A1 height in mm
  ML: 20,       // margin left
  MR: 10,       // margin right
  MT: 10,       // margin top
  MB: 10,       // margin bottom
  TB_H: 30,     // title block height
};

// Drawing area (inside margins, above title block)
const DA = {
  get left() { return SHEET.ML; },
  get top() { return SHEET.MT; },
  get right() { return SHEET.W - SHEET.MR; },
  get bottom() { return SHEET.H - SHEET.MB - SHEET.TB_H; },
  get width() { return this.right - this.left; },
  get height() { return this.bottom - this.top; },
};

// ============================================================
// PER-PAGE SIZE (multi-file-workspace, 2026-06-04)
// ============================================================
// SHEET above stays the A1 native default — DA and every native A1 page keep
// reading it unchanged. These additions let a page carry its own size (native
// pages default to A1; imported PDF pages take the PDF page's real size in mm).
// Renderers/layout/export route SHEET.W/H reads through activePageSize() so a
// native A1 page is byte-identical to today.

// Paper sizes in mm, portrait convention (w < h). Rotate for landscape.
const PAGE_SIZES = {
  A0: { w: 1189, h: 841 },
  A1: { w: 841,  h: 594 },
  A2: { w: 594,  h: 420 },
  A3: { w: 420,  h: 297 },
  A4: { w: 297,  h: 210 },
  Letter: { w: 279.4, h: 215.9 },
};

// PDF points -> mm (1pt = 1/72 in, 1 in = 25.4 mm).
const PT_TO_MM = 25.4 / 72;

// The active page object, or null. `project` is declared in 05-state.js and is
// resolved at call time (after load order), so referencing it here is safe.
function activePage() {
  return (typeof project !== 'undefined' && project && project.sheets)
    ? project.sheets[project.activeSheetIdx] : null;
}

// The active page's size {w,h} in mm. Native pages (no per-page size) fall back
// to the A1 SHEET default — keeping native pages and 3D mode byte-identical.
function activePageSize() {
  const p = activePage();
  return (p && p.size) ? p.size : { w: SHEET.W, h: SHEET.H };
}

// Does this page carry a StructDraw title block + margins? Native pages do;
// imported PDF pages set hasTitleBlock:false (PDF + markup only). Defaults true
// for a null page so callers stay safe.
function pageHasTitleBlock(p) {
  return p ? (p.hasTitleBlock !== false) : true;
}

// ============================================================
