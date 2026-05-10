'use strict';

// Parametric holes — computed from bolts (AS 4100 Cl. 14.3.5)
// Extracted from dev/index.html lines 8021-8100 (2026-05-02 modular split)

// PARAMETRIC HOLES — computed from bolts that pass through a plate.
// Holes are NOT stored on plates; they are derived at draw time so the
// geometry is always in sync with bolt positions. AS 4100 Cl. 14.3.5:
// standard clearance hole diameter = nominal bolt diameter + 2mm.
// ============================================================
// Given a plate, return an array of { cx, cy, d } clearance holes where
// world coords lie on the plate's face (elevation X-Y plane) — used for
// face-view rendering. Only applies to rectangular Z-normal plates for now.
function computePlateHoles(plate) {
  if (plate.polyPts) return []; // poly plates: manual holes only (future)
  const holes = [];
  const hw = plate.pw / 2, hh = plate.ph / 2, ht = plate.pt / 2;
  const zMin = plate.z - ht, zMax = plate.z + ht;
  // Rotation: plate face is in X-Y plane; rot rotates about Z.
  const rotR = (plate.rot || 0) * Math.PI / 180;
  const c = Math.cos(rotR), s = Math.sin(rotR);
  for (const o of objects3D) {
    if (o.type !== 'bolt') continue;
    // V23.1 — keep preview and committed holes independent
    if (!!o.__preview !== !!plate.__preview) continue;
    const b = BOLT_DB[o.boltSize]; if (!b) continue;
    // Bolt axis is along Z — check if it passes through the plate Z range.
    // Use grip info if available so we account for actual bolt extents.
    let bzMin = o.z - 30, bzMax = o.z + 30;
    if (typeof computeBoltGripInfo === 'function') {
      try {
        const gi = computeBoltGripInfo(o);
        if (gi) { bzMin = gi.zCentre - gi.grip; bzMax = gi.zCentre + gi.grip; }
      } catch (e) { /* ignore */ }
    }
    if (bzMax < zMin || bzMin > zMax) continue; // bolt doesn't reach plate
    // Transform bolt position into plate local frame (so rotated plates work)
    const dx = o.x - plate.x, dy = o.y - plate.y;
    const lu = dx * c + dy * s;
    const lv = -dx * s + dy * c;
    if (Math.abs(lu) > hw || Math.abs(lv) > hh) continue; // bolt outside plate footprint
    holes.push({ cx: o.x, cy: o.y, lu, lv, d: b.d + 2, boltId: o.id });
  }
  return holes;
}

// Draw clearance holes on a plate in the face view (elevation, rectangular
// Z-normal plates only). Called inside withRotation so holes rotate with
// the plate — we use local (lu, lv) offsets from plate centre.
function drawPlateHolesElevation(blk, plate, col, hidCol, cs) {
  if (plate.polyPts) return;
  const pm = ppm();
  const lw = Math.max(0.5, LW.VIS * pm);
  ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.setLineDash([]);
  const clCol = cs.getPropertyValue('--cl-color').trim();
  const holes = computePlateHoles(plate);
  for (const h of holes) {
    // Hole outline (solid circle, VIS weight) in plate local frame centred at
    // (plate.x + lu, plate.y + lv) — these are already world coords when the
    // canvas is NOT rotated. Inside withRotation the canvas IS rotated, so we
    // must use local (plate.x + lu, plate.y + lv) where lu,lv are the
    // plate-local offset. But canvas rotation rotates about (plate.x, plate.y),
    // so drawing at (plate.x + lu, plate.y + lv) in LOCAL coords (pre-rotation)
    // places the circle correctly. lu/lv are already local, so add to plate.x/y.
    rCircle(blk, plate.x + h.lu, plate.y + h.lv, h.d);
    // Centre cross marks (small plus) in centreline colour — AS 1100 hole convention
    ctx.strokeStyle = clCol; ctx.lineWidth = Math.max(0.3, LW.CL * pm);
    const cr = h.d / 2 + 2; // cross arm length (mm)
    rLine(blk, plate.x + h.lu - cr, plate.y + h.lv, plate.x + h.lu + cr, plate.y + h.lv);
    rLine(blk, plate.x + h.lu, plate.y + h.lv - cr, plate.x + h.lu, plate.y + h.lv + cr);
    ctx.strokeStyle = col; ctx.lineWidth = lw;
  }
}

// pixels-per-mm for the current zoom/scale (for lineweights)
function ppm() {
  // During vector PDF export the render pipeline runs with viewport.zoom = 1
  // in sheet-mm coordinates. Returning 1 here makes `LW.* * ppm()` evaluate as
  // AS 1100 sheet-mm lineweights directly — which is what the V15 shim maps
  // straight through to jsPDF setLineWidth(mm). See exportSheetToPDFVector.
  if (pdfExportMode) return 1;
  return viewport.zoom / drawingScale;
}

// ============================================================
