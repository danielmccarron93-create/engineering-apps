'use strict';

// Draw polygon plate
// Extracted from dev/index.html lines 8884-9073 (2026-05-02 modular split)

// DRAW PLATE
// ============================================================

function drawPlate(blk, obj, col, hidCol, clCol, cs, occRects, cutClass) {
  occRects = occRects || [];
  const pm = ppm();
  const cutLW = Math.max(1, LW.CUT * pm);
  const visLW = Math.max(0.5, LW.VIS * pm);
  const hidLW = Math.max(0.25, LW.HID * pm);

  // --- POLYGON PLATE ---
  if (obj.polyPts) {
    return drawPolyPlate(blk, obj, col, hidCol, clCol, cs, occRects, cutClass);
  }

  // --- LEGACY RECTANGULAR PLATE ---
  const hw = obj.pw/2, hh = obj.ph/2, ht = obj.pt/2;

  const rc = blk.viewKey === 'elevation' ? [obj.x, obj.y] :
             blk.viewKey === 'sectionA' ? [obj.z, obj.y] : [obj.x, obj.z];

  // Transform occlusion rects into plate's local frame (elevation rotation only).
  occRects = localizeOccRects(occRects, obj, rc[0], rc[1], blk);

  withRotation(blk, obj, rc[0], rc[1], () => {
  if (blk.viewKey === 'elevation') {
    const L = obj.x-hw, R = obj.x+hw, T = obj.y+hh, B = obj.y-hh;
    rLineOcc(blk, L, T, R, T, occRects, col, hidCol, cutLW, hidLW);
    rLineOcc(blk, L, B, R, B, occRects, col, hidCol, cutLW, hidLW);
    rLineOcc(blk, L, T, L, B, occRects, col, hidCol, cutLW, hidLW);
    rLineOcc(blk, R, T, R, B, occRects, col, hidCol, cutLW, hidLW);
    ctx.fillStyle = colorAlpha(col, memberFillAlpha(obj, 0.08));
    rFillRect(blk, L, B, obj.pw, obj.ph);
    // Parametric clearance holes for any bolts passing through this plate
    drawPlateHolesElevation(blk, obj, col, hidCol, cs);
  } else if (blk.viewKey === 'sectionA') {
    const lw = cutClass === 'cut' ? cutLW : visLW;
    const L = obj.z-ht, R = obj.z+ht, T = obj.y+hh, B = obj.y-hh;
    rLineOcc(blk, L, T, R, T, occRects, col, hidCol, lw, hidLW);
    rLineOcc(blk, L, B, R, B, occRects, col, hidCol, lw, hidLW);
    rLineOcc(blk, L, T, L, B, occRects, col, hidCol, lw, hidLW);
    rLineOcc(blk, R, T, R, B, occRects, col, hidCol, lw, hidLW);
    ctx.fillStyle = colorAlpha(col, memberFillAlpha(obj, cutClass === 'cut' ? 0.12 : 0.05));
    rFillRect(blk, L, B, obj.pt, obj.ph);
    if (cutClass === 'cut') drawCrossHatch(blk, L, B, obj.pt, obj.ph, col);
  } else {
    const lw = cutClass === 'cut' ? cutLW : visLW;
    const L = obj.x-hw, R = obj.x+hw, T = obj.z+ht, B = obj.z-ht;
    rLineOcc(blk, L, T, R, T, occRects, col, hidCol, lw, hidLW);
    rLineOcc(blk, L, B, R, B, occRects, col, hidCol, lw, hidLW);
    rLineOcc(blk, L, T, L, B, occRects, col, hidCol, lw, hidLW);
    rLineOcc(blk, R, T, R, B, occRects, col, hidCol, lw, hidLW);
    ctx.fillStyle = colorAlpha(col, memberFillAlpha(obj, cutClass === 'cut' ? 0.10 : 0.04));
    rFillRect(blk, L, B, obj.pw, obj.pt);
    if (cutClass === 'cut') drawCrossHatch(blk, L, B, obj.pw, obj.pt, col);
  }

  // Label in elevation
  if (blk.viewKey === 'elevation') {
    ctx.fillStyle = cs.getPropertyValue('--mute').trim();
    const fs = Math.max(5, 1.5 * pm);
    ctx.font = `${fs}px system-ui`; ctx.textAlign = 'center';
    const lp = real2px(blk, obj.x, obj.y);
    ctx.fillText(`${obj.pw}×${obj.ph}×${obj.pt}`, lp.x, lp.y + 3);
    ctx.textAlign = 'start';
  }
  }); // end withRotation
}

// ---- POLYGON PLATE RENDERER ----
function drawPolyPlate(blk, obj, col, hidCol, clCol, cs, occRects, cutClass) {
  const pm = ppm();
  const cutLW = Math.max(1, LW.CUT * pm);
  const visLW = Math.max(0.5, LW.VIS * pm);
  const hidLW = Math.max(0.25, LW.HID * pm);
  const ht = obj.pt / 2;

  // Reconstruct world-space vertices
  const worldPts = obj.polyPts.map(p => ({
    x: obj.x + p.dx, y: obj.y + p.dy, z: obj.z + p.dz
  }));

  // Project to view coordinates
  const projFn = blk.viewKey === 'elevation' ? (p => [p.x, p.y]) :
                 blk.viewKey === 'sectionA' ? (p => [p.z, p.y]) :
                 (p => [p.x, p.z]);

  const viewPts = worldPts.map(p => projFn(p));
  const normal = obj.normal || 'z';

  // Determine if this view shows the polygon face or the edge (thickness)
  const viewShowsFace = (blk.viewKey === 'elevation' && normal === 'z') ||
                        (blk.viewKey === 'sectionA' && normal === 'x') ||
                        (blk.viewKey === 'planB' && normal === 'y');

  if (viewShowsFace) {
    // FACE VIEW: draw the full polygon outline
    ctx.strokeStyle = col;
    ctx.lineWidth = cutLW;
    ctx.setLineDash([]);

    // Draw polygon edges
    for (let i = 0; i < viewPts.length; i++) {
      const j = (i + 1) % viewPts.length;
      rLine(blk, viewPts[i][0], viewPts[i][1], viewPts[j][0], viewPts[j][1]);
    }

    // Fill
    ctx.fillStyle = colorAlpha(col, memberFillAlpha(obj, 0.08));
    ctx.beginPath();
    const fp = real2px(blk, viewPts[0][0], viewPts[0][1]);
    ctx.moveTo(fp.x, fp.y);
    for (let i = 1; i < viewPts.length; i++) {
      const pp = real2px(blk, viewPts[i][0], viewPts[i][1]);
      ctx.lineTo(pp.x, pp.y);
    }
    ctx.closePath(); ctx.fill();

    // Label: thickness at centroid
    ctx.fillStyle = cs.getPropertyValue('--mute').trim();
    const fs = Math.max(5, 1.5 * pm);
    ctx.font = `${fs}px system-ui`; ctx.textAlign = 'center';
    const centreProj = projFn(obj);
    const lp = real2px(blk, centreProj[0], centreProj[1]);
    ctx.fillText(`PL ${obj.pt}`, lp.x, lp.y + 3);
    ctx.textAlign = 'start';

  } else {
    // EDGE VIEW: the polygon is seen edge-on as a line with thickness
    // Find the bounding extent of the polygon projected into this view
    // The face plane projects to a line; the thickness is the visible dimension
    let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
    viewPts.forEach(p => {
      uMin = Math.min(uMin, p[0]); uMax = Math.max(uMax, p[0]);
      vMin = Math.min(vMin, p[1]); vMax = Math.max(vMax, p[1]);
    });

    // Determine which axis gets the thickness
    // The thickness replaces the collapsed dimension
    let L, R, T, B;
    if (normal === 'z') {
      // Face is X,Y plane; seen edge-on in sectionA (Z,Y) or planB (X,Z)
      if (blk.viewKey === 'sectionA') {
        // u=Z, v=Y → Z-extent is thickness, Y-extent is polygon height
        const cz = obj.z;
        L = cz - ht; R = cz + ht; T = vMax; B = vMin;
      } else { // planB
        // u=X, v=Z → Z-extent is thickness, X-extent is polygon width
        const cz = obj.z;
        L = uMin; R = uMax; T = cz + ht; B = cz - ht;
      }
    } else if (normal === 'x') {
      // Face is Z,Y plane; seen edge-on in elevation (X,Y) or planB (X,Z)
      if (blk.viewKey === 'elevation') {
        const cx = obj.x;
        L = cx - ht; R = cx + ht; T = vMax; B = vMin;
      } else { // planB
        const cx = obj.x;
        L = cx - ht; R = cx + ht; T = vMax; B = vMin;
      }
    } else { // normal === 'y'
      // Face is X,Z plane; seen edge-on in elevation (X,Y) or sectionA (Z,Y)
      if (blk.viewKey === 'elevation') {
        const cy = obj.y;
        L = uMin; R = uMax; T = cy + ht; B = cy - ht;
      } else { // sectionA
        const cy = obj.y;
        L = uMin; R = uMax; T = cy + ht; B = cy - ht;
      }
    }

    // Draw as rectangle with cross-hatch fill (cut plate — AS 1100 steel convention)
    ctx.strokeStyle = col;
    ctx.lineWidth = cutLW;
    ctx.setLineDash([]);
    rLine(blk, L, T, R, T);
    rLine(blk, L, B, R, B);
    rLine(blk, L, T, L, B);
    rLine(blk, R, T, R, B);

    // Solid fill behind hatching
    ctx.fillStyle = colorAlpha(col, memberFillAlpha(obj, 0.10));
    rFillRect(blk, L, B, R - L, T - B);

    // AS 1100 steel cross-hatching (use shared utility)
    drawCrossHatch(blk, L, B, R - L, T - B, col);
  }
}

// ============================================================
