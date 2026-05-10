'use strict';

// V24 per-view rendering proxy (Phase A)
// Extracted from dev/index.html lines 7002-7123 (2026-05-02 modular split)

// V24 PER-VIEW RENDERING PROXY (Phase A)
// ============================================================
// For orthogonal frames, every member in every view reduces to ONE of the
// three existing renderer branches — 'elevation' (side view: length in u,
// depth in v), 'sectionA' (end-on: cross-section profile), or 'planB'
// (plan: length in u, width in v).
//
// drawMemberProxied(drawFn, blk, obj, ...rest) figures out which branch to
// call and how to remap obj's (x,y,z) so the branch draws the correct
// geometry in the correct place. For legacy-frame members (axis=+X, up=+Y
// with roll via `rot`) this is a zero-cost passthrough — existing code
// behaviour is unchanged.
//
// Strategy per target-view T and member with frame F:
//   1. Compute mode = memberViewMode(obj, T)  → 'side' | 'end' | 'plan'
//   2. Pick branch: 'elevation' | 'sectionA' | 'planB' to match mode.
//   3. Find target-view (u, v) of the member's centre using T's basis.
//   4. Remap proxy.{x,y,z} so the branch reads the correct centre:
//         branch elevation reads obj.x, obj.y   → set proxy.x = targetU
//         branch sectionA  reads obj.z, obj.y   → set proxy.z = targetU
//         branch planB     reads obj.x, obj.z   → set proxy.x = targetU
//   5. Compute inPlaneRot: the 2D angle to rotate the canvas so the branch's
//      local +u (or local +v for 'end') aligns with the projected axis or
//      projected up.
//   6. Apply 2D rotation with ctx.save / translate / rotate / translate back,
//      then call drawFn with a blk proxy reporting branchView.
//
// The renderer's own `withRotation` call is a no-op because we set proxy.rot=0.

function _isLegacyFrame(obj) {
  // Legacy = axis is exactly +X (roll encoded in `rot` via up). We detect
  // via obj-level absence of the new fields rather than re-deriving the frame,
  // to keep the fast path cheap.
  return !obj.axis || !obj.up;
}

function drawMemberProxied(drawFn, blk, obj, ...rest) {
  if (_isLegacyFrame(obj)) {
    drawFn(blk, obj, ...rest);
    return;
  }

  const f = memberFrame(obj);
  // Additional fast path: axis is still +X and up is in the X-Y plane → new
  // fields are present but describe legacy geometry. Pass through.
  if (Math.abs(f.axis.x - 1) < 1e-6
   && Math.abs(f.axis.y) < 1e-6
   && Math.abs(f.axis.z) < 1e-6
   && Math.abs(f.up.z) < 1e-6) {
    drawFn(blk, obj, ...rest);
    return;
  }

  const viewKey = blk.viewKey;
  const mode = memberViewMode(obj, viewKey);
  const a = memberProjectedAxis(obj, viewKey);
  const u = memberProjectedUp(obj, viewKey);

  let branchView, angleDeg;
  if (mode === 'end') {
    branchView = 'sectionA';
    // Align projected up with branch local +v (screen-down since canvas Y-down;
    // rotation sign will be inverted when applied to the canvas).
    angleDeg = Math.atan2(u.u, u.v) * 180 / Math.PI;
  } else if (mode === 'plan') {
    branchView = 'planB';
    angleDeg = Math.atan2(a.v, a.u) * 180 / Math.PI;
  } else {
    branchView = 'elevation';
    angleDeg = Math.atan2(a.v, a.u) * 180 / Math.PI;
  }

  // Compute target-view (u, v) of member centre using target-view basis.
  const B = _viewBasis(viewKey);
  const cx = obj.x || 0, cy = obj.y || 0, cz = obj.z || 0;
  const targetU = cx * B.u.x + cy * B.u.y + cz * B.u.z;
  const targetV = cx * B.v.x + cy * B.v.y + cz * B.v.z;

  // Remap proxy coords to put member centre at target (u, v) in the branch's
  // own coordinate system.
  const proxy = Object.assign({}, obj);
  proxy.rot = 0; // suppress the renderer's built-in withRotation
  if (branchView === 'elevation') {
    proxy.x = targetU; proxy.y = targetV;
  } else if (branchView === 'sectionA') {
    proxy.z = targetU; proxy.y = targetV;
  } else { // planB
    proxy.x = targetU; proxy.z = targetV;
  }

  // Block proxy reports the branch view so renderer branches dispatch right.
  const blkProxy = Object.assign({}, blk);
  blkProxy.viewKey = branchView;

  // rest indices for draw* signature (blk, obj, col, hidCol, clCol, cs, occRects, cc):
  //   rest[0]=col, [1]=hidCol, [2]=clCol, [3]=cs, [4]=occRects, [5]=cc
  // Phase A1 — blank occRects (occlusion on rotated members is deferred) and
  // clear cutClass (cut-hatching on rotated members is deferred — the section
  // plane's cut of a reoriented member is geometrically non-trivial; Phase B
  // revisits this once connection builders are frame-aware).
  const restClean = rest.slice();
  if (restClean.length > 4) restClean[4] = [];
  if (restClean.length > 5) restClean[5] = null;

  // Apply the 2D rotation externally, centred on the real-world (targetU,
  // targetV) position in the target view. real2px uses blk.sheetX/sheetY
  // which we inherit unchanged, so the screen pixel anchor is correct.
  if (Math.abs(angleDeg) > 0.01) {
    const cp = real2px(blk, targetU, targetV);
    const angleRad = -angleDeg * Math.PI / 180; // canvas Y is down
    ctx.save();
    ctx.translate(cp.x, cp.y);
    ctx.rotate(angleRad);
    ctx.translate(-cp.x, -cp.y);
    drawFn(blkProxy, proxy, ...restClean);
    ctx.restore();
  } else {
    drawFn(blkProxy, proxy, ...restClean);
  }
}

// ============================================================
