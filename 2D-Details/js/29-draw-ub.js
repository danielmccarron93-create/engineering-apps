'use strict';

// Draw UB (universal beam) per-view
// Extracted from dev/index.html lines 8329-8494 (2026-05-02 modular split)

// DRAW UB
// ============================================================

// V25-layout-overhaul Phase 6.1 — per-member shading multiplier on fill alpha.
// Returns the base alpha unchanged when obj.shading is unset, so legacy members
// render identically. 0 = no fill, 1 = default density.
function memberFillAlpha(obj, base) {
  if (!obj || obj.shading == null || isNaN(obj.shading)) return base;
  const s = Math.max(0, Math.min(1, +obj.shading));
  return base * s;
}

function drawUB(blk, obj, col, hidCol, clCol, cs, occRects, cutClass) {
  const s = UB_DB[obj.section]; if (!s) return;
  occRects = occRects || [];
  const pm = ppm();
  const hd = s.d/2, hbf = s.bf/2, htw = s.tw/2, tf = s.tf;
  const hidLW = Math.max(0.25, LW.HID * pm);
  const cutLW = Math.max(1, LW.CUT * pm);
  const visLW = Math.max(0.5, LW.VIS * pm);

  // Rotation centre in view coords
  const rc = blk.viewKey === 'elevation' ? [obj.x, obj.y] :
             blk.viewKey === 'sectionA' ? [obj.z, obj.y] : [obj.x, obj.z];

  // Transform occlusion rects into UB local frame (elevation rotation only).
  occRects = localizeOccRects(occRects, obj, rc[0], rc[1], blk);

  withRotation(blk, obj, rc[0], rc[1], () => {
  if (blk.viewKey === 'elevation') {
    const cx = obj.x, cy = obj.y, hl = obj.length/2;
    const L = cx-hl, R = cx+hl, T = cy+hd, B = cy-hd;
    const ftBot = T-tf, fbTop = B+tf;

    // Flange & end lines with occlusion
    rLineOcc(blk, L, T, R, T, occRects, col, hidCol, cutLW, hidLW);
    rLineOcc(blk, L, ftBot, R, ftBot, occRects, col, hidCol, cutLW, hidLW);
    rLineOcc(blk, L, B, R, B, occRects, col, hidCol, cutLW, hidLW);
    rLineOcc(blk, L, fbTop, R, fbTop, occRects, col, hidCol, cutLW, hidLW);
    rLineOcc(blk, L, T, L, B, occRects, col, hidCol, cutLW, hidLW);
    rLineOcc(blk, R, T, R, B, occRects, col, hidCol, cutLW, hidLW);

    // Web lines
    rLineOcc(blk, L, ftBot, L, fbTop, occRects, col, hidCol, visLW, hidLW);
    rLineOcc(blk, R, ftBot, R, fbTop, occRects, col, hidCol, visLW, hidLW);

    ctx.fillStyle = colorAlpha(col, memberFillAlpha(obj, 0.05));
    rFillRect(blk, L, B, obj.length, s.d);

    ctx.strokeStyle = clCol; ctx.lineWidth = 0.5;
    ctx.setLineDash(DASH.CL);
    rLine(blk, L-10, cy, R+10, cy);
    ctx.setLineDash([]);

    // Label
    ctx.fillStyle = cs.getPropertyValue('--mute').trim();
    const fs = Math.max(6, 1.8 * pm);
    ctx.font = `${fs}px system-ui`; ctx.textAlign = 'center';
    const lp = real2px(blk, cx, T + 6);
    ctx.fillText(obj.section, lp.x, lp.y);
    ctx.textAlign = 'start';
  }
  else if (blk.viewKey === 'sectionA') {
    const cz = obj.z, cy = obj.y, T = cy+hd, B = cy-hd;
    const ftBot = T-tf, fbTop = B+tf;

    if (cutClass === 'cut') {
      // CUT: I-section cross-section with CUT lineweight + steel hatching
      ctx.strokeStyle = col; ctx.lineWidth = cutLW; ctx.setLineDash([]);
      const pts = [
        [cz-hbf,T],[cz+hbf,T],[cz+hbf,ftBot],[cz+htw,ftBot],
        [cz+htw,fbTop],[cz+hbf,fbTop],[cz+hbf,B],[cz-hbf,B],
        [cz-hbf,fbTop],[cz-htw,fbTop],[cz-htw,ftBot],[cz-hbf,ftBot],
      ];
      ctx.beginPath();
      pts.forEach((p, i) => { const sp = real2px(blk, p[0], p[1]); i === 0 ? ctx.moveTo(sp.x, sp.y) : ctx.lineTo(sp.x, sp.y); });
      ctx.closePath(); ctx.stroke();
      ctx.fillStyle = colorAlpha(col, memberFillAlpha(obj, 0.06)); ctx.fill();

      // AS 1100 steel cross-hatching on the I-profile
      drawCrossHatchPoly(blk, pts, col);

      // Centreline
      ctx.strokeStyle = clCol; ctx.lineWidth = 0.5;
      ctx.setLineDash(DASH.CL);
      rLine(blk, cz-hbf-8, cy, cz+hbf+8, cy);
      ctx.setLineDash([]);

      // Label
      ctx.fillStyle = cs.getPropertyValue('--mute').trim();
      const fs = Math.max(6, 1.8 * pm);
      ctx.font = `${fs}px system-ui`; ctx.textAlign = 'center';
      const lp = real2px(blk, cz, T + 6);
      ctx.fillText(obj.section, lp.x, lp.y);
      ctx.textAlign = 'start';
    } else {
      // PROJECTED: side-view rectangle with VIS lineweight
      const hl = obj.length / 2;
      ctx.strokeStyle = col; ctx.lineWidth = visLW; ctx.setLineDash([]);
      // Outer rectangle: bf wide × d tall
      rLine(blk, cz-hbf, T, cz+hbf, T);
      rLine(blk, cz-hbf, B, cz+hbf, B);
      rLine(blk, cz-hbf, T, cz-hbf, B);
      rLine(blk, cz+hbf, T, cz+hbf, B);
      // Hidden web edges (dashed)
      ctx.strokeStyle = hidCol; ctx.lineWidth = hidLW;
      ctx.setLineDash(DASH.HIDDEN);
      rLine(blk, cz-htw, T, cz-htw, B);
      rLine(blk, cz+htw, T, cz+htw, B);
      // Flange inner faces (dashed)
      rLine(blk, cz-hbf, ftBot, cz+hbf, ftBot);
      rLine(blk, cz-hbf, fbTop, cz+hbf, fbTop);
      ctx.setLineDash([]);
      // Light fill
      ctx.fillStyle = colorAlpha(col, memberFillAlpha(obj, 0.03));
      rFillRect(blk, cz-hbf, B, s.bf, s.d);
    }
  }
  else { // planB
    const cx = obj.x, cz = obj.z, hl = obj.length/2;

    if (cutClass === 'cut') {
      // CUT: plan rectangle with CUT lineweight + steel hatching
      // The horizontal cut through a UB shows flanges as cut material + web as cut
      ctx.strokeStyle = col; ctx.lineWidth = cutLW; ctx.setLineDash([]);
      rRect(blk, cx-hl, cz-hbf, obj.length, s.bf);

      // Web cut lines (solid CUT weight — the web IS being cut)
      rLine(blk, cx-hl, cz-htw, cx+hl, cz-htw);
      rLine(blk, cx-hl, cz+htw, cx+hl, cz+htw);

      // Cross-hatch the flange areas (two rectangles: top and bottom flange strips)
      // Top flange: from z=htw to z=hbf (just the overhanging part)
      drawCrossHatch(blk, cx-hl, cz+htw, obj.length, hbf-htw, col);
      drawCrossHatch(blk, cx-hl, cz-hbf, obj.length, hbf-htw, col);
      // Web strip
      drawCrossHatch(blk, cx-hl, cz-htw, obj.length, s.tw, col);

      ctx.fillStyle = colorAlpha(col, memberFillAlpha(obj, 0.06));
      rFillRect(blk, cx-hl, cz-hbf, obj.length, s.bf);
    } else {
      // PROJECTED: plan rectangle with VIS lineweight
      ctx.strokeStyle = col; ctx.lineWidth = visLW; ctx.setLineDash([]);
      rRect(blk, cx-hl, cz-hbf, obj.length, s.bf);

      // Hidden web lines (dashed)
      ctx.strokeStyle = hidCol; ctx.lineWidth = hidLW;
      ctx.setLineDash(DASH.HIDDEN);
      rLine(blk, cx-hl, cz-htw, cx+hl, cz-htw);
      rLine(blk, cx-hl, cz+htw, cx+hl, cz+htw);
      ctx.setLineDash([]);

      ctx.fillStyle = colorAlpha(col, memberFillAlpha(obj, 0.03));
      rFillRect(blk, cx-hl, cz-hbf, obj.length, s.bf);
    }

    // Centreline (always)
    ctx.strokeStyle = clCol; ctx.lineWidth = 0.5;
    ctx.setLineDash(DASH.CL);
    rLine(blk, cx-hl-8, cz, cx+hl+8, cz);
    ctx.setLineDash([]);
  }
  }); // end withRotation
}

// ============================================================
