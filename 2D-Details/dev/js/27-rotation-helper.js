'use strict';

// Canvas rotation drawing helper
// Extracted from dev/index.html lines 8172-8225 (2026-05-02 modular split)

// ROTATION DRAWING HELPER
// ============================================================
// Wraps drawing in a canvas rotation around the object's projected centre.
// Usage: withRotation(blk, obj, centreU, centreV, () => { ...draw calls... });
// If obj.rot is 0 or undefined, no transform overhead.
function withRotation(blk, obj, centreU, centreV, drawFn) {
  const rot = obj.rot || 0;
  // Apply rotation ONLY in elevation view. Section A and Plan B show true geometry.
  // rot is about the Z-axis: doesn't cause in-plane rotation in sectionA (Z,Y) or planB (X,Z).
  if (Math.abs(rot) < 0.01 || blk.viewKey === 'sectionA' || blk.viewKey === 'planB') { drawFn(); return; }
  const cp = real2px(blk, centreU, centreV);
  const angleRad = -rot * Math.PI / 180; // negative because canvas Y is down
  ctx.save();
  ctx.translate(cp.x, cp.y);
  ctx.rotate(angleRad);
  ctx.translate(-cp.x, -cp.y);
  drawFn();
  ctx.restore();
}

// Transform world-frame occlusion rects into the object's local (pre-rotation)
// frame by rotating the four corners of each rect by -obj.rot about (cu, cv)
// and taking the axis-aligned bounding box. Required because inside a
// withRotation() draw callback the line coords are in LOCAL space but the
// occRects passed in by drawBlockContent are in WORLD view space. Without
// this, the occlusion clip test compares mismatched coordinate systems and
// incorrectly marks parts of rotated members as hidden.
function localizeOccRects(occRects, obj, cu, cv, blk) {
  const rot = obj.rot || 0;
  if (Math.abs(rot) < 0.01 || blk.viewKey !== 'elevation' || !occRects || !occRects.length) {
    return occRects || [];
  }
  // Canvas rotates by -rot (Y-down); in real-world Y-up space the object's
  // local frame is related to world by rotation of +rot. To transform a
  // world-frame rect INTO local space we rotate by -rot (inverse).
  const theta = -rot * Math.PI / 180;
  const c = Math.cos(theta), s = Math.sin(theta);
  return occRects.map(r => {
    const corners = [
      [r.u1, r.v1], [r.u2, r.v1], [r.u2, r.v2], [r.u1, r.v2]
    ];
    let u1 = Infinity, u2 = -Infinity, v1 = Infinity, v2 = -Infinity;
    for (const [wu, wv] of corners) {
      const du = wu - cu, dv = wv - cv;
      const lu = du * c - dv * s + cu;
      const lv = du * s + dv * c + cv;
      if (lu < u1) u1 = lu; if (lu > u2) u2 = lu;
      if (lv < v1) v1 = lv; if (lv > v2) v2 = lv;
    }
    return { u1, v1, u2, v2 };
  });
}

// ============================================================
