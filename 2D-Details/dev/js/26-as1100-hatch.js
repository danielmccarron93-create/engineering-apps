'use strict';

// AS 1100 steel cross-hatching (45° diagonal at 2mm sheet spacing)
// Extracted from dev/index.html lines 8101-8171 (2026-05-02 modular split)

// AS 1100 STEEL CROSS-HATCHING
// ============================================================
// 45° diagonal lines at 2mm sheet spacing for cut steel sections.

// Rectangular hatch: fills a rectangle (L,B) to (L+w, B+h) with 45° lines.
function drawCrossHatch(blk, L, B, w, h, col) {
  const hatchSpacingReal = 2 * drawingScale; // 2mm on sheet × scale = real-world spacing
  ctx.strokeStyle = colorAlpha(col, 0.35);
  ctx.lineWidth = Math.max(0.15, LW.HATCH * ppm());
  ctx.setLineDash([]);
  const maxD = w + h;
  for (let d = hatchSpacingReal; d < maxD; d += hatchSpacingReal) {
    const u1 = L + Math.max(0, d - h);
    const v1 = B + Math.min(h, d);
    const u2 = L + Math.min(w, d);
    const v2 = B + Math.max(0, d - w);
    rLine(blk, u1, v1, u2, v2);
  }
}

// Polygon hatch: fills an arbitrary polygon with 45° lines using canvas clip.
// polyPts is an array of [u, v] pairs in real-world coords for this view.
function drawCrossHatchPoly(blk, polyPts, col) {
  if (polyPts.length < 3) return;
  // Find bounding box
  let L = Infinity, R = -Infinity, B = Infinity, T = -Infinity;
  polyPts.forEach(p => {
    L = Math.min(L, p[0]); R = Math.max(R, p[0]);
    B = Math.min(B, p[1]); T = Math.max(T, p[1]);
  });
  // Set up clip region
  ctx.save();
  ctx.beginPath();
  const fp = real2px(blk, polyPts[0][0], polyPts[0][1]);
  ctx.moveTo(fp.x, fp.y);
  for (let i = 1; i < polyPts.length; i++) {
    const pp = real2px(blk, polyPts[i][0], polyPts[i][1]);
    ctx.lineTo(pp.x, pp.y);
  }
  ctx.closePath();
  ctx.clip();
  // Draw hatch lines across the bounding box (clipped to polygon)
  drawCrossHatch(blk, L, B, R - L, T - B, col);
  ctx.restore();
}

// Hollow section hatch: hatches only the wall material between outer and inner rectangles.
// Uses even-odd fill rule to clip out the hollow centre.
function drawCrossHatchHollow(blk, outerL, outerB, outerW, outerH, innerL, innerB, innerW, innerH, col) {
  ctx.save();
  ctx.beginPath();
  // Outer rectangle (clockwise)
  const o1 = real2px(blk, outerL, outerB + outerH);
  const o2 = real2px(blk, outerL + outerW, outerB + outerH);
  const o3 = real2px(blk, outerL + outerW, outerB);
  const o4 = real2px(blk, outerL, outerB);
  ctx.moveTo(o1.x, o1.y); ctx.lineTo(o2.x, o2.y);
  ctx.lineTo(o3.x, o3.y); ctx.lineTo(o4.x, o4.y); ctx.closePath();
  // Inner rectangle (counter-clockwise for even-odd)
  const i1 = real2px(blk, innerL, innerB + innerH);
  const i2 = real2px(blk, innerL, innerB);
  const i3 = real2px(blk, innerL + innerW, innerB);
  const i4 = real2px(blk, innerL + innerW, innerB + innerH);
  ctx.moveTo(i1.x, i1.y); ctx.lineTo(i2.x, i2.y);
  ctx.lineTo(i3.x, i3.y); ctx.lineTo(i4.x, i4.y); ctx.closePath();
  ctx.clip('evenodd');
  drawCrossHatch(blk, outerL, outerB, outerW, outerH, col);
  ctx.restore();
}

// ============================================================
