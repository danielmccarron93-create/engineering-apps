'use strict';

// Depth-aware occlusion — hidden lines for objects behind others
// Extracted from dev/index.html lines 6399-6495 (2026-05-02 modular split)

// DEPTH-AWARE OCCLUSION — hidden lines for objects behind others
// ============================================================

// Get depth value for an object on the perpendicular axis for this view.
// Returns the NEAR FACE position (closest to viewer) so that thin objects
// like plates correctly occlude objects behind them.
function getDepthValue(obj, viewKey) {
  // For plates: use the near face (centroid + half-thickness toward viewer)
  if (obj.type === 'plate') {
    const ht = (obj.pt || 10) / 2;
    const normal = obj.polyPts ? (obj.normal || 'z') : 'z';
    if (viewKey === 'elevation') {
      // Viewer at +Z; near face = z + ht (for normal='z' plates)
      if (normal === 'z') return (obj.z || 0) + ht;
      return obj.z || 0;
    }
    if (viewKey === 'sectionA') {
      if (normal === 'x') return -((obj.x || 0) - ht); // near face toward viewer
      return -(obj.x || 0);
    }
    if (viewKey === 'planB') {
      if (normal === 'y') return (obj.y || 0) + ht;
      return obj.y || 0;
    }
  }
  // Elevation (X,Y plane): depth = Z, viewer at +Z looking toward -Z → larger Z = closer
  if (viewKey === 'elevation') return obj.z || 0;
  // Section A (Z,Y plane): depth = X, viewer at -X looking toward +X → smaller X = closer
  if (viewKey === 'sectionA') return -(obj.x || 0);
  // Plan B (X,Z plane): depth = Y, viewer above looking down → larger Y = closer
  if (viewKey === 'planB') return obj.y || 0;
  return 0;
}

// Get 2D footprint rectangle [u1,v1, u2,v2] for an object in a given view.
// This is the region that this object "covers" in the view plane.
function get2DFootprint(obj, viewKey) {
  // V24 Phase A — frame-aware path for beam-like members.
  if (isMemberType(obj.type) && obj.axis && obj.up) {
    const b = _memberFrame2DBounds(obj, viewKey);
    if (b) return b;
  }
  if (obj.type === 'ub') {
    const s = UB_DB[obj.section]; if (!s) return null;
    const hd = s.d/2, hbf = s.bf/2, hl = obj.length/2;
    if (viewKey === 'elevation') return { u1: obj.x - hl, u2: obj.x + hl, v1: obj.y - hd, v2: obj.y + hd };
    if (viewKey === 'sectionA') return { u1: obj.z - hbf, u2: obj.z + hbf, v1: obj.y - hd, v2: obj.y + hd };
    return { u1: obj.x - hl, u2: obj.x + hl, v1: obj.z - hbf, v2: obj.z + hbf };
  }
  if (obj.type === 'shs') {
    const s = SHS_DB[obj.section]; if (!s) return null;
    const hB = s.B/2, hl = obj.length/2;
    if (viewKey === 'elevation') return { u1: obj.x - hl, u2: obj.x + hl, v1: obj.y - hB, v2: obj.y + hB };
    if (viewKey === 'sectionA') return { u1: obj.z - hB, u2: obj.z + hB, v1: obj.y - hB, v2: obj.y + hB };
    return { u1: obj.x - hl, u2: obj.x + hl, v1: obj.z - hB, v2: obj.z + hB };
  }
  // V22.1 new member types — use sectionProfile unified dims
  if (isMemberType(obj.type) && obj.type !== 'ub' && obj.type !== 'shs') {
    const p = sectionProfile(obj); if (!p) return null;
    const hd = (p.d || 0) / 2, hbf = (p.bf || 0) / 2, hl = (obj.length || 0) / 2;
    if (viewKey === 'elevation') return { u1: obj.x - hl, u2: obj.x + hl, v1: obj.y - hd, v2: obj.y + hd };
    if (viewKey === 'sectionA') return { u1: obj.z - hbf, u2: obj.z + hbf, v1: obj.y - hd, v2: obj.y + hd };
    return { u1: obj.x - hl, u2: obj.x + hl, v1: obj.z - hbf, v2: obj.z + hbf };
  }
  if (obj.type === 'plate') {
    if (obj.polyPts) return getPolyPlateBounds(obj, viewKey);
    const hw = obj.pw/2, hh = obj.ph/2, ht = obj.pt/2;
    if (viewKey === 'elevation') return { u1: obj.x - hw, u2: obj.x + hw, v1: obj.y - hh, v2: obj.y + hh };
    if (viewKey === 'sectionA') return { u1: obj.z - ht, u2: obj.z + ht, v1: obj.y - hh, v2: obj.y + hh };
    return { u1: obj.x - hw, u2: obj.x + hw, v1: obj.z - ht, v2: obj.z + ht };
  }
  if (obj.type === 'bolt') {
    const b = BOLT_DB[obj.boltSize] || BOLT_DB.M20;
    const r = b.head / 2 + 2;
    if (viewKey === 'elevation') return { u1: obj.x - r, u2: obj.x + r, v1: obj.y - r, v2: obj.y + r };
    if (viewKey === 'sectionA') return { u1: obj.z - r, u2: obj.z + r, v1: obj.y - r, v2: obj.y + r };
    return { u1: obj.x - r, u2: obj.x + r, v1: obj.z - r, v2: obj.z + r };
  }
  return null;
}

// Collect occlusion rectangles for a given object — footprints of all objects
// that are IN FRONT of it (closer to the viewer) in this view.
function getOcclusionRects(obj, viewKey) {
  const myDepth = getDepthValue(obj, viewKey);
  const rects = [];
  objects3D.forEach(other => {
    if (other.id === obj.id) return;
    const otherDepth = getDepthValue(other, viewKey);
    if (otherDepth <= myDepth) return; // not in front
    const fp = get2DFootprint(other, viewKey);
    if (fp) rects.push(fp);
  });
  return rects;
}

// ============================================================
