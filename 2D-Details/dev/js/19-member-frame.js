'use strict';

// V24 member orientation frame (Phase A) + 24 ortho presets
// Extracted from dev/index.html lines 6666-7001 (2026-05-02 modular split)

// V24 MEMBER ORIENTATION FRAME (Phase A)
// ============================================================
// Every beam-like member has a local 3D frame: axis (length direction),
// up (web / long-leg direction), right (= axis × up). These are unit
// vectors in world coordinates. The trio fully describes the 24 orthogonal
// orientations + all non-orthogonal cases reserved for Phase C.
//
// Legacy members store only `obj.rot` (a scalar degree angle about Z in the
// elevation X-Y plane). `memberFrame()` returns a live frame computed from
// `obj.axis` + `obj.up` when present, falling back to `rot` for backwards
// compatibility. New code should read frames — writing `rot` alone is still
// safe but restricted to the legacy Z-axis rotation behaviour.

// Unit-vector helpers (3D, no THREE dep — this runs before the iso engine).
function _vLen(v) { return Math.hypot(v.x, v.y, v.z); }
function _vNorm(v) {
  const L = _vLen(v) || 1;
  return { x: v.x / L, y: v.y / L, z: v.z / L };
}
function _vCross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
function _vDot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function _vScale(v, k) { return { x: v.x * k, y: v.y * k, z: v.z * k }; }
function _vAdd(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }

// Map a view key to { uAxis, vAxis, depthAxis } as 3D unit vectors in world
// coords. Note Y flip in elevation / section — matches `real2px()`.
// elevation: u=+X, v=+Y (canvas flip handled elsewhere), depth=+Z
// sectionA:  u=+Z, v=+Y, depth=+X (we're looking from +X toward -X)
// planB:     u=+X, v=+Z, depth=-Y (looking from above)
function _viewBasis(viewKey) {
  if (viewKey === 'elevation') {
    return {
      u: { x: 1, y: 0, z: 0 },
      v: { x: 0, y: 1, z: 0 },
      d: { x: 0, y: 0, z: 1 },
    };
  }
  if (viewKey === 'sectionA') {
    return {
      u: { x: 0, y: 0, z: 1 },
      v: { x: 0, y: 1, z: 0 },
      d: { x: 1, y: 0, z: 0 },
    };
  }
  // planB
  return {
    u: { x: 1, y: 0, z: 0 },
    v: { x: 0, y: 0, z: 1 },
    d: { x: 0, y: -1, z: 0 },
  };
}

// Legacy rot (degrees, Z-axis rotation) → frame with length tilted in XY plane.
// rot=0  → axis=+X, up=+Y  (horizontal beam, web up — default)
// rot=90 → axis=+Y, up=-X  (vertical member — same visual as today's rot=90)
function legacyRotToFrame(rot) {
  const rad = (rot || 0) * Math.PI / 180;
  const cr = Math.cos(rad), sr = Math.sin(rad);
  return {
    axis: { x: cr, y: sr, z: 0 },
    up:   { x: -sr, y: cr, z: 0 },
    right:{ x: 0, y: 0, z: 1 },
  };
}

// Return { axis, up, right } as unit vectors.
// Reads obj.axis + obj.up if present; else falls back to legacy rot.
function memberFrame(obj) {
  if (!obj) return { axis:{x:1,y:0,z:0}, up:{x:0,y:1,z:0}, right:{x:0,y:0,z:1} };
  if (obj.axis && obj.up) {
    const a = _vNorm(obj.axis);
    const u = _vNorm(obj.up);
    // Re-orthogonalize `up` against `axis` in case user-supplied vectors drifted.
    const uPerp = _vNorm({
      x: u.x - a.x * _vDot(a, u),
      y: u.y - a.y * _vDot(a, u),
      z: u.z - a.z * _vDot(a, u),
    });
    return { axis: a, up: uPerp, right: _vCross(a, uPerp) };
  }
  return legacyRotToFrame(obj.rot);
}

// Project a world 3D vector into a view's (u, v) plane.
function _projectToView(vec3, viewKey) {
  const B = _viewBasis(viewKey);
  return {
    u: _vDot(vec3, B.u),
    v: _vDot(vec3, B.v),
    d: _vDot(vec3, B.d),
  };
}

// Returns { u, v, d, magUV } for the member's axis in a view.
// magUV = hypot(u,v); 1 = axis lies in the view plane, 0 = axis is view-depth.
function memberProjectedAxis(obj, viewKey) {
  const f = memberFrame(obj);
  const p = _projectToView(f.axis, viewKey);
  p.magUV = Math.hypot(p.u, p.v);
  return p;
}
function memberProjectedUp(obj, viewKey) {
  const f = memberFrame(obj);
  const p = _projectToView(f.up, viewKey);
  p.magUV = Math.hypot(p.u, p.v);
  return p;
}

// Classify how the viewer sees the member in a given view:
//   'side' — length and up both visible (web profile from the side; default UB)
//   'plan' — length visible but up is along view depth (flange face seen)
//   'end'  — length is along view depth (cross-section profile seen)
// Orthogonal frames always map to one of these three. Phase C adds 'diagonal'.
function memberViewMode(obj, viewKey) {
  const a = memberProjectedAxis(obj, viewKey);
  const u = memberProjectedUp(obj, viewKey);
  const axisInView = a.magUV > 0.5;
  const upInView = u.magUV > 0.5;
  if (!axisInView) return 'end';
  if (upInView) return 'side';
  return 'plan';
}

// Returns the 2D rotation angle (radians) to apply when drawing the member
// in its canonical local frame so that the local +X axis lines up with the
// view-projected direction of the member's length (for 'side'/'plan' modes)
// or so that local +Y (up) aligns with the projected up (for 'end' mode).
// NOTE: elevation / sectionA views flip Y on the canvas, so positive canvas
// rotation (CW in screen space) = negative maths rotation. We invert here.
function memberViewAngle(obj, viewKey) {
  const mode = memberViewMode(obj, viewKey);
  if (mode === 'end') {
    const up = memberProjectedUp(obj, viewKey);
    // Align local +Y (up) with projected up. atan2(-u, v) because local up
    // points in +v direction when angle=0.
    return Math.atan2(-up.u, up.v);
  }
  const a = memberProjectedAxis(obj, viewKey);
  // Align local +X (length) with projected axis.
  return Math.atan2(a.v, a.u);
}

// Returns the 3D world-space end point of a member. sign=+1 = forward end
// (length/2 along axis); sign=-1 = back end. Replaces scattered
// `obj.x + obj.length/2` style axis assumptions in connection builders.
function memberEndPoint(obj, sign) {
  const f = memberFrame(obj);
  const hl = (obj.length || 0) / 2;
  return {
    x: (obj.x || 0) + sign * hl * f.axis.x,
    y: (obj.y || 0) + sign * hl * f.axis.y,
    z: (obj.z || 0) + sign * hl * f.axis.z,
  };
}

// Return 2D half-extent of the member's AABB projected onto a world axis
// ('x'|'y'|'z'). Generalises the existing getObjAxisExtent's rotation math
// to an arbitrary 3D frame. Used by occlusion, cut-class, bounds calcs.
function memberExtentOnAxis(obj, axisName) {
  if (!isMemberType(obj.type)) return null;
  const f = memberFrame(obj);
  const p = sectionProfile(obj);
  if (!p) return null;
  const hl = (obj.length || 0) / 2;
  const hd = (p.d || 0) / 2;
  const hbf = (p.bf || 0) / 2;
  const aWorld = f.axis[axisName], uWorld = f.up[axisName], rWorld = f.right[axisName];
  // Half-extent along world axis = sum of |projection| of each local half-dim
  const half = Math.abs(hl * aWorld) + Math.abs(hd * uWorld) + Math.abs(hbf * rWorld);
  const c = obj[axisName] || 0;
  return { min: c - half, max: c + half };
}

// ---- Orthogonal presets (24 orientations) ----
// axisLetter: 'X'|'Y'|'Z', dir: +1|-1, rollDeg: 0|90|180|270
// Returns { axis, up, right } unit vectors.
function frameFromPreset(axisLetter, dir, rollDeg) {
  const axisMap = {
    X: { x: 1, y: 0, z: 0 }, Y: { x: 0, y: 1, z: 0 }, Z: { x: 0, y: 0, z: 1 },
  };
  const axis = _vScale(axisMap[axisLetter] || axisMap.X, dir || 1);
  // Reference "up" before roll — pick the canonical perpendicular:
  // axis along X → up=+Y; along Y → up=-X; along Z → up=+Y.
  let refUp;
  if (axisLetter === 'X') refUp = { x: 0, y: 1, z: 0 };
  else if (axisLetter === 'Y') refUp = { x: -1, y: 0, z: 0 };
  else refUp = { x: 0, y: 1, z: 0 };
  // Rotate refUp by rollDeg about axis (Rodrigues formula).
  const rad = ((rollDeg || 0) % 360) * Math.PI / 180;
  const cr = Math.cos(rad), sr = Math.sin(rad);
  const k = axis; // already unit
  const term1 = _vScale(refUp, cr);
  const term2 = _vScale(_vCross(k, refUp), sr);
  const term3 = _vScale(k, _vDot(k, refUp) * (1 - cr));
  const up = _vNorm(_vAdd(_vAdd(term1, term2), term3));
  return { axis, up, right: _vCross(axis, up) };
}

// Find the closest 24-preset match for a frame. Used by the Inspector to
// display a preset-style dropdown value for any frame. Returns:
//   { axisLetter, dir, rollDeg, exact } where exact=true if within 1°.
function presetFromFrame(frame) {
  const axes = [
    ['X', 1, { x: 1, y: 0, z: 0 }], ['X', -1, { x: -1, y: 0, z: 0 }],
    ['Y', 1, { x: 0, y: 1, z: 0 }], ['Y', -1, { x: 0, y: -1, z: 0 }],
    ['Z', 1, { x: 0, y: 0, z: 1 }], ['Z', -1, { x: 0, y: 0, z: -1 }],
  ];
  let best = { axisLetter: 'X', dir: 1, rollDeg: 0, score: -Infinity, exact: false };
  for (const [letter, dir, vec] of axes) {
    const axisScore = _vDot(frame.axis, vec);
    if (axisScore < 0.5) continue;
    for (const roll of [0, 90, 180, 270]) {
      const candidate = frameFromPreset(letter, dir, roll);
      const upScore = _vDot(frame.up, candidate.up);
      const total = axisScore + upScore;
      if (total > best.score) {
        best = { axisLetter: letter, dir, rollDeg: roll, score: total,
                 exact: axisScore > 0.999 && upScore > 0.999 };
      }
    }
  }
  return best;
}

// Set obj.axis / obj.up from a preset. Also clears obj.rot to the nearest
// legacy-compatible value (for round-trip with older StructDraw loads).
function setMemberFrameFromPreset(obj, axisLetter, dir, rollDeg) {
  const f = frameFromPreset(axisLetter, dir, rollDeg);
  obj.axis = f.axis;
  obj.up = f.up;
  // Best-effort legacy rot: only meaningful for X-axis with Z-plane roll.
  if (axisLetter === 'X' && dir === 1 && rollDeg === 0) obj.rot = 0;
  else if (axisLetter === 'Y' && dir === 1 && rollDeg === 0) obj.rot = 90;
  else if (axisLetter === 'X' && dir === -1 && rollDeg === 0) obj.rot = 180;
  else if (axisLetter === 'Y' && dir === -1 && rollDeg === 0) obj.rot = 270;
  else delete obj.rot; // no faithful legacy representation
}

// Migrate a legacy member in place: if axis/up are missing but rot exists,
// compute them from rot so subsequent code reads the new fields.
// Safe to call on already-migrated members (no-op).
function migrateLegacyMember(obj) {
  if (!obj || !isMemberType(obj.type)) return obj;
  if (obj.axis && obj.up) return obj;
  const f = legacyRotToFrame(obj.rot);
  obj.axis = f.axis;
  obj.up = f.up;
  return obj;
}

// Called by project load + import — upgrades every member in the scene.
function migrateAllMembers() {
  if (!Array.isArray(objects3D)) return;
  for (const o of objects3D) migrateLegacyMember(o);
}

// V24.A4 — Free tilt: rotate a member's frame about an arbitrary world-space
// axis by angleDeg. Returns a new {axis, up, right} frame; does not mutate.
// Uses Rodrigues' rotation formula applied to both axis and up vectors.
function _rotateFrameAboutAxis(frame, worldAxisUnit, angleDeg) {
  const rad = angleDeg * Math.PI / 180;
  const cr = Math.cos(rad), sr = Math.sin(rad);
  const k = _vNorm(worldAxisUnit);
  const rot = (v) => {
    const t1 = _vScale(v, cr);
    const t2 = _vScale(_vCross(k, v), sr);
    const t3 = _vScale(k, _vDot(k, v) * (1 - cr));
    return _vNorm(_vAdd(_vAdd(t1, t2), t3));
  };
  const axis = rot(frame.axis);
  const up = rot(frame.up);
  return { axis, up, right: _vCross(axis, up) };
}

// Apply a free-tilt rotation to a single member about a world axis letter.
// worldAxisLetter: 'X' | 'Y' | 'Z' (not to be confused with the member's own
// axis — this is a WORLD direction). Mutates obj.axis and obj.up.
function _applyMemberTilt(obj, worldAxisLetter, angleDeg) {
  if (!obj || !isMemberType(obj.type)) return;
  const map = {
    X: { x: 1, y: 0, z: 0 },
    Y: { x: 0, y: 1, z: 0 },
    Z: { x: 0, y: 0, z: 1 },
  };
  const k = map[worldAxisLetter];
  if (!k || !angleDeg) return;
  const f = _rotateFrameAboutAxis(memberFrame(obj), k, angleDeg);
  obj.axis = f.axis;
  obj.up = f.up;
  // Drop the legacy scalar rot — it's no longer a faithful representation
  // of the frame once a non-orthogonal tilt has been applied.
  if ('rot' in obj) delete obj.rot;
}

// V24.A3 — Placement axis-from-view (§A.6).
// Given the view a member was drawn in and its 2D angle relative to that
// view's u-axis, return the orthogonal preset the member should be born with.
//
//   elevation view: u=+X, v=+Y  →  horizontal draw = X-axis, vertical = Y-axis
//   sectionA view:  u=+Z, v=+Y  →  horizontal draw = Z-axis, vertical = Y-axis
//   planB view:     u=+X, v=+Z  →  horizontal draw = X-axis, vertical = Z-axis
//
// For elevation, non-orthogonal angles (more than 5° off cardinal) return null
// so the legacy scalar-rot path can still represent the tilted member. For
// sectionA and planB the legacy path is wrong (it rotates in the X-Y plane,
// not the view plane), so we always snap to the nearest cardinal.
function _placementFrameForView(viewKey, rotDeg) {
  // Collapse to [0, 180) — direction doesn't matter for symmetric members;
  // we always pick dir=+1 so grip plus/minus ends stay predictable.
  const abs = ((rotDeg % 180) + 180) % 180;
  const uAligned = abs < 45 || abs >= 135;

  if (viewKey === 'elevation') {
    const TOL = 5;
    const nearU = abs < TOL || abs > 180 - TOL;
    const nearV = Math.abs(abs - 90) < TOL;
    if (!nearU && !nearV) return null;   // tilted beam — keep legacy rot
  }

  const table = {
    elevation: { u: ['X', 1], v: ['Y', 1] },
    sectionA:  { u: ['Z', 1], v: ['Y', 1] },
    planB:     { u: ['X', 1], v: ['Z', 1] },
  };
  const entry = table[viewKey] && table[viewKey][uAligned ? 'u' : 'v'];
  if (!entry) return null;
  return { axisLetter: entry[0], dir: entry[1], rollDeg: 0 };
}

// ============================================================
