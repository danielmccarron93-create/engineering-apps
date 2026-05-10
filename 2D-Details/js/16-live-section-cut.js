'use strict';

// Live section cut — axis extent + cut classification
// Extracted from dev/index.html lines 6496-6589 (2026-05-02 modular split)

// LIVE SECTION CUT — axis extent & cut classification
// ============================================================

// Get the 3D extent of an object along a single world axis ('x', 'y', or 'z').
// Accounts for rotation (obj.rot about Z-axis) when computing X and Y extents.
// Returns { min, max }.
function getObjAxisExtent(obj, axis) {
  // V24 Phase A — for beam-like members with a 3D frame, delegate to the
  // frame-aware helper which handles all 24 orthogonal orientations (and is
  // ready for arbitrary angles in Phase C).
  if (isMemberType(obj.type) && obj.axis && obj.up) {
    const ext = memberExtentOnAxis(obj, axis);
    if (ext) return ext;
  }

  // Legacy path — kept for members that haven't been migrated yet AND for
  // the unit tests implicit in unchanged fixture files. Same math as V23.1.
  const rot = (obj.rot || 0) * Math.PI / 180;
  const cr = Math.cos(rot), sr = Math.sin(rot);

  if (obj.type === 'ub') {
    const s = UB_DB[obj.section]; if (!s) return { min: obj[axis], max: obj[axis] };
    const hl = obj.length / 2, hd = s.d / 2, hbf = s.bf / 2;
    if (axis === 'z') return { min: obj.z - hbf, max: obj.z + hbf };
    const halfX = Math.abs(hl * cr) + Math.abs(hd * sr);
    const halfY = Math.abs(hl * sr) + Math.abs(hd * cr);
    if (axis === 'x') return { min: obj.x - halfX, max: obj.x + halfX };
    return { min: obj.y - halfY, max: obj.y + halfY };
  }

  if (obj.type === 'shs') {
    const s = SHS_DB[obj.section]; if (!s) return { min: obj[axis], max: obj[axis] };
    const hB = s.B / 2, hl = obj.length / 2;
    if (axis === 'z') return { min: obj.z - hB, max: obj.z + hB };
    const halfX = Math.abs(hl * cr) + Math.abs(hB * sr);
    const halfY = Math.abs(hl * sr) + Math.abs(hB * cr);
    if (axis === 'x') return { min: obj.x - halfX, max: obj.x + halfX };
    return { min: obj.y - halfY, max: obj.y + halfY };
  }

  if (isMemberType(obj.type) && obj.type !== 'ub' && obj.type !== 'shs') {
    const p = sectionProfile(obj);
    if (!p) return { min: obj[axis], max: obj[axis] };
    const hd = (p.d || 0) / 2, hbf = (p.bf || 0) / 2, hl = (obj.length || 0) / 2;
    if (axis === 'z') return { min: obj.z - hbf, max: obj.z + hbf };
    const halfX = Math.abs(hl * cr) + Math.abs(hd * sr);
    const halfY = Math.abs(hl * sr) + Math.abs(hd * cr);
    if (axis === 'x') return { min: obj.x - halfX, max: obj.x + halfX };
    return { min: obj.y - halfY, max: obj.y + halfY };
  }

  if (obj.type === 'plate') {
    if (obj.polyPts) {
      // Polygon plate: compute from world-space vertices + thickness
      const ht = obj.pt / 2;
      const normal = obj.normal || 'z';
      let mins = { x: Infinity, y: Infinity, z: Infinity };
      let maxs = { x: -Infinity, y: -Infinity, z: -Infinity };
      obj.polyPts.forEach(p => {
        const wx = obj.x + p.dx, wy = obj.y + p.dy, wz = obj.z + p.dz;
        mins.x = Math.min(mins.x, wx); maxs.x = Math.max(maxs.x, wx);
        mins.y = Math.min(mins.y, wy); maxs.y = Math.max(maxs.y, wy);
        mins.z = Math.min(mins.z, wz); maxs.z = Math.max(maxs.z, wz);
      });
      // Expand along normal axis by half-thickness
      if (normal === 'x') { mins.x = obj.x - ht; maxs.x = obj.x + ht; }
      else if (normal === 'y') { mins.y = obj.y - ht; maxs.y = obj.y + ht; }
      else { mins.z = obj.z - ht; maxs.z = obj.z + ht; }
      return { min: mins[axis], max: maxs[axis] };
    }
    // Rectangular plate
    const hw = obj.pw / 2, hh = obj.ph / 2, ht = obj.pt / 2;
    if (axis === 'x') return { min: obj.x - hw, max: obj.x + hw };
    if (axis === 'y') return { min: obj.y - hh, max: obj.y + hh };
    return { min: obj.z - ht, max: obj.z + ht };
  }

  if (obj.type === 'bolt') {
    const b = BOLT_DB[obj.boltSize] || BOLT_DB.M20;
    const r = b.headAF / 2 + 3;
    if (axis === 'x') return { min: obj.x - r, max: obj.x + r };
    if (axis === 'y') return { min: obj.y - r, max: obj.y + r };
    // Z extent: use gripInfo for accurate grip-centred positioning
    const gi = computeBoltGripInfo(obj);
    const hG = gi.grip / 2;
    const zHeadOuter = gi.zCentre - hG - b.washT - b.headH;
    const zThreadTip = gi.zCentre + hG + b.washT + b.nutH + gi.threadProt;
    return { min: zHeadOuter, max: zThreadTip };
  }

  return { min: (obj[axis] || 0) - 10, max: (obj[axis] || 0) + 10 };
}

// ============================================================
