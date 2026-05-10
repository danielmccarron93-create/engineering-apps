'use strict';

// Draw SHS (square hollow section) per-view
// Extracted from dev/index.html lines 8495-8644 (2026-05-02 modular split)

// DRAW SHS
// ============================================================

function drawSHS(blk, obj, col, hidCol, clCol, cs, occRects, cutClass) {
  const s = SHS_DB[obj.section]; if (!s) return;
  occRects = occRects || [];
  const pm = ppm();
  const hB = s.B/2, t = s.t, hI = hB-t, hl = obj.length/2;
  const hidLW = Math.max(0.25, LW.HID * pm);
  const cutLW = Math.max(1, LW.CUT * pm);
  const visLW = Math.max(0.5, LW.VIS * pm);

  const rc = blk.viewKey === 'elevation' ? [obj.x, obj.y] :
             blk.viewKey === 'sectionA' ? [obj.z, obj.y] : [obj.x, obj.z];

  // Transform occlusion rects into SHS local frame (elevation only — rotation
  // doesn't affect sectionA/planB). Without this, a vertical column's faces
  // get incorrectly flagged as occluded by unrelated geometry.
  occRects = localizeOccRects(occRects, obj, rc[0], rc[1], blk);

  withRotation(blk, obj, rc[0], rc[1], () => {
  if (blk.viewKey === 'elevation') {
    // Draw SHS horizontally by default (length along X, depth along Y)
    // — matches UB convention so withRotation() handles all orientations correctly.
    const cx = obj.x, cy = obj.y;
    const L = cx-hl, R = cx+hl, T = cy+hB, B = cy-hB;

    // Outer walls
    rLineOcc(blk, L, T, R, T, occRects, col, hidCol, cutLW, hidLW);  // top
    rLineOcc(blk, L, B, R, B, occRects, col, hidCol, cutLW, hidLW);  // bottom
    rLineOcc(blk, L, T, L, B, occRects, col, hidCol, visLW, hidLW);  // left end
    rLineOcc(blk, R, T, R, B, occRects, col, hidCol, visLW, hidLW);  // right end

    // Inner walls (hidden lines)
    ctx.strokeStyle = hidCol; ctx.lineWidth = hidLW;
    ctx.setLineDash(DASH.HIDDEN);
    rLine(blk, L, cy+hI, R, cy+hI); rLine(blk, L, cy-hI, R, cy-hI);  // top/bottom inner
    rLine(blk, L, cy+hI, L, cy-hI); rLine(blk, R, cy+hI, R, cy-hI);  // left/right inner
    ctx.setLineDash([]);

    // Fill
    ctx.fillStyle = colorAlpha(col, memberFillAlpha(obj, 0.04));
    rFillRect(blk, L, B, obj.length, s.B);

    // Centreline (horizontal, along member length)
    ctx.strokeStyle = clCol; ctx.lineWidth = 0.5;
    ctx.setLineDash(DASH.CL);
    rLine(blk, L-8, cy, R+8, cy);
    ctx.setLineDash([]);

    // Label
    ctx.fillStyle = cs.getPropertyValue('--mute').trim();
    const fs = Math.max(6, 1.8 * pm);
    ctx.font = `${fs}px system-ui`; ctx.textAlign = 'center';
    const lp = real2px(blk, cx, T + 6);
    ctx.fillText(obj.section + ' SHS', lp.x, lp.y);
    ctx.textAlign = 'start';
  }
  else if (blk.viewKey === 'sectionA') {
    const cz = obj.z, cy = obj.y;
    // Rotation-aware projected dimensions in Z-Y plane.
    // rot is about Z-axis → Z extent always B, Y extent depends on rotation.
    // Horizontal member (rot=0): Y = B (cross-section). Vertical column (rot=90): Y = length (side view).
    const rotR = (obj.rot || 0) * Math.PI / 180;
    const cr = Math.abs(Math.cos(rotR)), sr = Math.abs(Math.sin(rotR));
    const outerHalfY = hB * cr + hl * sr;
    const innerHalfY = hI * cr + hl * sr;
    const outerH = outerHalfY * 2, innerH = innerHalfY * 2;

    if (cutClass === 'cut') {
      // CUT: rotation-aware section with CUT lineweight + wall hatching
      const T = cy + outerHalfY, Bt = cy - outerHalfY;
      const TI = cy + innerHalfY, BI = cy - innerHalfY;
      ctx.strokeStyle = col; ctx.lineWidth = cutLW; ctx.setLineDash([]);
      rLine(blk, cz-hB, T, cz+hB, T); rLine(blk, cz+hB, T, cz+hB, Bt);
      rLine(blk, cz+hB, Bt, cz-hB, Bt); rLine(blk, cz-hB, Bt, cz-hB, T);
      rLine(blk, cz-hI, TI, cz+hI, TI); rLine(blk, cz+hI, TI, cz+hI, BI);
      rLine(blk, cz+hI, BI, cz-hI, BI); rLine(blk, cz-hI, BI, cz-hI, TI);
      // Steel hatching on walls only (hollow centre excluded)
      drawCrossHatchHollow(blk, cz-hB, Bt, s.B, outerH, cz-hI, BI, s.B-2*t, innerH, col);
      // Centrelines
      ctx.strokeStyle = clCol; ctx.lineWidth = 0.5;
      ctx.setLineDash(DASH.CL);
      rLine(blk, cz-hB-6, cy, cz+hB+6, cy);
      rLine(blk, cz, cy-outerHalfY-6, cz, cy+outerHalfY+6);
      ctx.setLineDash([]);
    } else {
      // PROJECTED: rotation-aware rectangle with VIS lineweight
      const T = cy + outerHalfY, Bt = cy - outerHalfY;
      const TI = cy + innerHalfY, BI = cy - innerHalfY;
      ctx.strokeStyle = col; ctx.lineWidth = visLW; ctx.setLineDash([]);
      rLine(blk, cz-hB, T, cz-hB, Bt); rLine(blk, cz+hB, T, cz+hB, Bt);
      rLine(blk, cz-hB, T, cz+hB, T); rLine(blk, cz-hB, Bt, cz+hB, Bt);
      // Inner wall hidden lines (dashed)
      ctx.strokeStyle = hidCol; ctx.lineWidth = hidLW;
      ctx.setLineDash(DASH.HIDDEN);
      rLine(blk, cz-hI, TI, cz-hI, BI); rLine(blk, cz+hI, TI, cz+hI, BI);
      rLine(blk, cz-hI, TI, cz+hI, TI); rLine(blk, cz-hI, BI, cz+hI, BI);
      ctx.setLineDash([]);
      ctx.fillStyle = colorAlpha(col, memberFillAlpha(obj, 0.03));
      rFillRect(blk, cz-hB, Bt, s.B, outerH);
      // Centreline
      ctx.strokeStyle = clCol; ctx.lineWidth = 0.5;
      ctx.setLineDash(DASH.CL);
      rLine(blk, cz, cy-outerHalfY-8, cz, cy+outerHalfY+8);
      ctx.setLineDash([]);
    }
  }
  else { // planB
    const cx = obj.x, cz = obj.z;
    // Rotation-aware projected dimensions in X-Z plane.
    // rot is about Z-axis → Z extent always B, X extent depends on rotation.
    // Horizontal member (rot=0): X = length (side view). Vertical column (rot=90): X = B (cross-section).
    const rotR = (obj.rot || 0) * Math.PI / 180;
    const cr = Math.abs(Math.cos(rotR)), sr = Math.abs(Math.sin(rotR));
    const outerHalfX = hl * cr + hB * sr;
    const innerHalfX = hl * cr + hI * sr;
    const outerW = outerHalfX * 2, innerW = innerHalfX * 2;

    if (cutClass === 'cut') {
      // CUT: rotation-aware section with CUT lineweight + wall hatching
      ctx.strokeStyle = col; ctx.lineWidth = cutLW; ctx.setLineDash([]);
      rRect(blk, cx-outerHalfX, cz-hB, outerW, s.B);
      rRect(blk, cx-innerHalfX, cz-hI, innerW, s.B-2*t);
      drawCrossHatchHollow(blk, cx-outerHalfX, cz-hB, outerW, s.B, cx-innerHalfX, cz-hI, innerW, s.B-2*t, col);
      ctx.fillStyle = colorAlpha(col, memberFillAlpha(obj, 0.06));
      rFillRect(blk, cx-outerHalfX, cz-hB, outerW, s.B);
    } else {
      // PROJECTED: rotation-aware rectangle with VIS lineweight
      ctx.strokeStyle = col; ctx.lineWidth = visLW; ctx.setLineDash([]);
      rRect(blk, cx-outerHalfX, cz-hB, outerW, s.B);
      ctx.lineWidth = hidLW;
      ctx.setLineDash(DASH.HIDDEN);
      rRect(blk, cx-innerHalfX, cz-hI, innerW, s.B-2*t);
      ctx.setLineDash([]);
      ctx.fillStyle = colorAlpha(col, memberFillAlpha(obj, 0.03));
      rFillRect(blk, cx-outerHalfX, cz-hB, outerW, s.B);
    }

    // Centrelines (always)
    ctx.strokeStyle = clCol; ctx.lineWidth = 0.5;
    ctx.setLineDash(DASH.CL);
    rLine(blk, cx-hB-6, cz, cx+hB+6, cz);
    rLine(blk, cx, cz-hB-6, cx, cz+hB+6);
    ctx.setLineDash([]);
  }
  }); // end withRotation
}

// ============================================================
