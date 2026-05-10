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
