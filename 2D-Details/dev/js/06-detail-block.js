'use strict';

// DetailBlock class + projection functions (projElev/projSecA/projPlanB)
// Extracted from dev/index.html lines 3451-3499 (2026-05-02 modular split)

// DETAIL BLOCKS — positioned views on the A1 sheet
// ============================================================
// Each detail block represents one orthographic view placed on the sheet.
// It has a position (in sheet-mm), a viewKey, and a projection function.
// At drawingScale 10 (1:10), 1mm real = 0.1mm on sheet.

class DetailBlock {
  constructor(viewKey, projFn, sheetX, sheetY, boxW, boxH) {
    this.viewKey = viewKey;   // 'elevation', 'sectionA', 'planB'
    this.projFn = projFn;
    this.sheetX = sheetX;    // origin position on sheet (mm)
    this.sheetY = sheetY;
    this.boxW = boxW || 200;  // explicit view box width in sheet-mm
    this.boxH = boxH || 150;  // explicit view box height in sheet-mm
    this.hidden = false;      // toggle visibility
  }

  // Project 3D object to 2D view-local coords (u, v in real-world mm)
  project(obj) { return this.projFn(obj); }

  // Convert real-world mm in this view → sheet-mm
  realToSheet(u, v) {
    return {
      sx: this.sheetX + u / drawingScale,
      sy: this.sheetY + v / drawingScale  // Y-down on sheet; v is Y-up in real
    };
  }

  // Convert sheet-mm → real-world view coords
  sheetToReal(sx, sy) {
    return {
      u: (sx - this.sheetX) * drawingScale,
      v: (sy - this.sheetY) * drawingScale
    };
  }

  // Unproject: view-local 2D → partial 3D (same as V4)
  unproject(u, v) {
    if (this.viewKey === 'elevation') return { x: u, y: v };
    if (this.viewKey === 'sectionA') return { z: u, y: v };
    if (this.viewKey === 'planB') return { x: u, z: v };
  }
}

function projElev(obj) { return { u: obj.x, v: obj.y }; }
function projSecA(obj) { return { u: obj.z, v: obj.y }; }
function projPlanB(obj) { return { u: obj.x, v: obj.z }; }

// ============================================================
