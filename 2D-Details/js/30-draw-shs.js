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

    // V14-J — joint trim. If this SHS shares a node with higher-priority
    // SHS members, the relevant end-cap u positions get pulled inward to
    // match the priority/mitre cut line. cutInfo.uAtV(v) returns the local
    // cut u for a given local v (constant for butt cut, slanted for mitre).
    // Defaults (no joint) = ±hl, giving the original full rectangle.
    const trims = (typeof jointTrimsForMember === 'function')
      ? jointTrimsForMember(obj) : null;
    const cutPlus = trims && trims.ends ? trims.ends.plus : null;
    const cutMinus = trims && trims.ends ? trims.ends.minus : null;

    // Outer-wall corner u's at v = +hB (top) and v = -hB (bottom) for each end.
    const uPT = cutPlus  ? cutPlus.uAtV(+hB)  : +hl; // plus end, top
    const uPB = cutPlus  ? cutPlus.uAtV(-hB)  : +hl; // plus end, bottom
    const uMT = cutMinus ? cutMinus.uAtV(+hB) : -hl; // minus end, top
    const uMB = cutMinus ? cutMinus.uAtV(-hB) : -hl; // minus end, bottom
    // Inner-wall corner u's at v = +hI / -hI.
    const uPTi = cutPlus  ? cutPlus.uAtV(+hI)  : +hl;
    const uPBi = cutPlus  ? cutPlus.uAtV(-hI)  : +hl;
    const uMTi = cutMinus ? cutMinus.uAtV(+hI) : -hl;
    const uMBi = cutMinus ? cutMinus.uAtV(-hI) : -hl;

    // Outer walls (top + bottom = cut weight; end caps = visible weight)
    rLineOcc(blk, cx + uMT, cy + hB, cx + uPT, cy + hB, occRects, col, hidCol, cutLW, hidLW);  // top
    rLineOcc(blk, cx + uMB, cy - hB, cx + uPB, cy - hB, occRects, col, hidCol, cutLW, hidLW);  // bottom
    rLineOcc(blk, cx + uMT, cy + hB, cx + uMB, cy - hB, occRects, col, hidCol, visLW, hidLW);  // minus end
    rLineOcc(blk, cx + uPT, cy + hB, cx + uPB, cy - hB, occRects, col, hidCol, visLW, hidLW);  // plus end

    // Inner walls (hidden lines)
    ctx.strokeStyle = hidCol; ctx.lineWidth = hidLW;
    ctx.setLineDash(DASH.HIDDEN);
    rLine(blk, cx + uMTi, cy + hI, cx + uPTi, cy + hI);                                       // top inner
    rLine(blk, cx + uMBi, cy - hI, cx + uPBi, cy - hI);                                       // bottom inner
    rLine(blk, cx + uMTi, cy + hI, cx + uMBi, cy - hI);                                       // minus end inner
    rLine(blk, cx + uPTi, cy + hI, cx + uPBi, cy - hI);                                       // plus end inner
    ctx.setLineDash([]);

    // Fill — 4-corner polygon (degenerates to rectangle when no trim)
    ctx.fillStyle = colorAlpha(col, memberFillAlpha(obj, 0.04));
    rFillPoly(blk, [
      { u: cx + uMT, v: cy + hB },
      { u: cx + uPT, v: cy + hB },
      { u: cx + uPB, v: cy - hB },
      { u: cx + uMB, v: cy - hB },
    ]);

    // Centreline (horizontal, along member length) — extend past the
    // shorter of the two trimmed ends so it still pokes out clearly.
    ctx.strokeStyle = clCol; ctx.lineWidth = 0.5;
    ctx.setLineDash(DASH.CL);
    const clMinus = Math.min(uMT, uMB) - 8;
    const clPlus  = Math.max(uPT, uPB) + 8;
    rLine(blk, cx + clMinus, cy, cx + clPlus, cy);
    ctx.setLineDash([]);

    // Label
    ctx.fillStyle = cs.getPropertyValue('--mute').trim();
    const fs = Math.max(6, 1.8 * pm);
    ctx.font = `${fs}px system-ui`; ctx.textAlign = 'center';
    const lp = real2px(blk, cx, cy + hB + 6);
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
