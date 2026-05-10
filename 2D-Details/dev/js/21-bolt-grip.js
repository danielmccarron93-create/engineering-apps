'use strict';

// V14 bolt grip auto-detection + length calculation
// Extracted from dev/index.html lines 7124-7258 (2026-05-02 modular split)

// BOLT GRIP AUTO-DETECTION & LENGTH CALCULATION (V14)
// ============================================================

// Point-in-polygon test (ray-casting, X-Y plane).
// pts = [{dx,dy}, ...] offsets from (ox, oy); test world point (px, py).
function pointInPolyXY(ox, oy, pts, px, py) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = ox + pts[i].dx, yi = oy + pts[i].dy;
    const xj = ox + pts[j].dx, yj = oy + pts[j].dy;
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi))
      inside = !inside;
  }
  return inside;
}

// Raycast through a SINGLE object along the Z axis at world (x, y).
// Returns array of intervals [{ zLo, zHi }] where material exists, or null if none.
function rayMaterialAlongZ(obj, x, y) {
  // ---- Plate (rectangular, always normal-z) ----
  if (obj.type === 'plate' && !obj.polyPts) {
    const hw = obj.pw / 2, hh = obj.ph / 2, ht = obj.pt / 2;
    if (x < obj.x - hw || x > obj.x + hw) return null;
    if (y < obj.y - hh || y > obj.y + hh) return null;
    return [{ zLo: obj.z - ht, zHi: obj.z + ht }];
  }

  // ---- Polygon plate ----
  if (obj.type === 'plate' && obj.polyPts) {
    const normal = obj.normal || 'z';
    const ht = obj.pt / 2;
    if (normal === 'z') {
      // Polygon in X-Y plane, thickness along Z
      // Build world-space pts for in-polygon test
      if (!pointInPolyXY(obj.x, obj.y, obj.polyPts, x, y)) return null;
      return [{ zLo: obj.z - ht, zHi: obj.z + ht }];
    }
    // Non-z normal plates: fall back to bounding-box approach
    const extX = getObjAxisExtent(obj, 'x');
    const extY = getObjAxisExtent(obj, 'y');
    if (x < extX.min || x > extX.max || y < extY.min || y > extY.max) return null;
    const extZ = getObjAxisExtent(obj, 'z');
    return [{ zLo: extZ.min, zHi: extZ.max }];
  }

  // ---- UB (I-section) ----
  if (obj.type === 'ub') {
    const s = UB_DB[obj.section]; if (!s) return null;
    const rot = (obj.rot || 0) * Math.PI / 180;
    const hl = obj.length / 2, hd = s.d / 2, hbf = s.bf / 2, htw = s.tw / 2;

    // Rotation-aware: transform (x,y) into member-local frame
    const dx = x - obj.x, dy = y - obj.y;
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const lx = dx * cr + dy * sr;   // local along-member axis
    const ly = -dx * sr + dy * cr;  // local cross-member axis (depth)

    if (Math.abs(lx) > hl + 0.5) return null; // outside member length
    if (Math.abs(ly) > hd) return null;        // above/below beam

    // In flange zones (|ly| > hd - tf): bolt passes through full flange width (bf)
    if (Math.abs(ly) > hd - s.tf) return [{ zLo: obj.z - hbf, zHi: obj.z + hbf }];
    // In web zone: bolt passes through web thickness only (tw)
    return [{ zLo: obj.z - htw, zHi: obj.z + htw }];
  }

  // ---- SHS (hollow section — grip = full B, bolt spans the whole section) ----
  if (obj.type === 'shs') {
    const s = SHS_DB[obj.section]; if (!s) return null;
    const hB = s.B / 2;
    // Use rotation-aware bounding from getObjAxisExtent
    const extX = getObjAxisExtent(obj, 'x');
    const extY = getObjAxisExtent(obj, 'y');
    if (x < extX.min || x > extX.max || y < extY.min || y > extY.max) return null;
    return [{ zLo: obj.z - hB, zHi: obj.z + hB }];
  }

  return null;
}

// Compute full grip info for a bolt: scans all objects at (bolt.x, bolt.y),
// finds the material stack along Z, and returns positioning data.
// Returns { grip, zCentre, boltLen, threadProt }
function computeBoltGripInfo(boltObj) {
  const bx = boltObj.x || 0, by = boltObj.y || 0;
  const b = BOLT_DB[boltObj.boltSize || 'M20'];

  // Gather all material intervals along Z
  const intervals = [];
  for (const obj of objects3D) {
    if (obj.id === boltObj.id || obj.type === 'bolt') continue;
    // V23.1 — keep grip calc symmetric between preview and committed items:
    // committed bolts don't see preview plates, preview bolts don't see them.
    if (!!obj.__preview !== !!boltObj.__preview) continue;
    const ivs = rayMaterialAlongZ(obj, bx, by);
    if (ivs) intervals.push(...ivs);
  }

  let grip, zCentre;
  if (intervals.length === 0) {
    // No material detected — fall back
    grip = 20;
    zCentre = boltObj.z || 0;
  } else {
    // Grip = distance from outermost head-side face to outermost nut-side face
    let zMin = Infinity, zMax = -Infinity;
    for (const iv of intervals) {
      if (iv.zLo < zMin) zMin = iv.zLo;
      if (iv.zHi > zMax) zMax = iv.zHi;
    }
    grip = Math.max(zMax - zMin, 1);
    zCentre = (zMin + zMax) / 2;
  }

  // Nominal bolt length: must reach through grip + head washer + nut washer + nut + protrusion
  const minLen = grip + 2 * b.washT + b.nutH + 2 * b.pitch;
  let boltLen = BOLT_LENGTHS[BOLT_LENGTHS.length - 1];
  for (const L of BOLT_LENGTHS) { if (L >= minLen) { boltLen = L; break; } }
  const threadProt = Math.max(2 * b.pitch, boltLen - (grip + 2 * b.washT + b.nutH));

  return { grip, zCentre, boltLen, threadProt };
}

// Legacy wrappers (used by older code paths)
function computeBoltGrip(boltObj) {
  return computeBoltGripInfo(boltObj).grip;
}
function computeBoltLength(grip, boltSize) {
  const b = BOLT_DB[boltSize] || BOLT_DB.M20;
  const minLen = grip + b.washT + b.washT + b.nutH + 2 * b.p;
  for (const L of BOLT_LENGTHS) { if (L >= minLen) return L; }
  return BOLT_LENGTHS[BOLT_LENGTHS.length - 1];
}

// ============================================================
