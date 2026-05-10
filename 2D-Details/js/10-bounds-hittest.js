'use strict';

// Bounding boxes + hit testing (3D/2D) + block resize handles
// Extracted from dev/index.html lines 3852-4120 (2026-05-02 modular split)

// 3D OBJECT BOUNDING BOX (in view-local real-world coords)
// ============================================================

function getPolyPlateBounds(obj, vk) {
  if (!obj.polyPts) return null;
  const ht = obj.pt / 2;
  const normal = obj.normal || 'z';

  // Reconstruct world-space vertices
  const worldPts = obj.polyPts.map(p => ({
    x: obj.x + p.dx, y: obj.y + p.dy, z: obj.z + p.dz
  }));

  const projFn = vk === 'elevation' ? (p => [p.x, p.y]) :
                 vk === 'sectionA' ? (p => [p.z, p.y]) :
                 (p => [p.x, p.z]);

  const viewShowsFace = (vk === 'elevation' && normal === 'z') ||
                        (vk === 'sectionA' && normal === 'x') ||
                        (vk === 'planB' && normal === 'y');

  if (viewShowsFace) {
    // Polygon bounding box in the face view
    let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
    worldPts.forEach(p => {
      const [u, v] = projFn(p);
      uMin = Math.min(uMin, u); uMax = Math.max(uMax, u);
      vMin = Math.min(vMin, v); vMax = Math.max(vMax, v);
    });
    return { u1: uMin, u2: uMax, v1: vMin, v2: vMax };
  } else {
    // Edge view: collapsed polygon extent + thickness
    let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
    worldPts.forEach(p => {
      const [u, v] = projFn(p);
      uMin = Math.min(uMin, u); uMax = Math.max(uMax, u);
      vMin = Math.min(vMin, v); vMax = Math.max(vMax, v);
    });
    // Expand in the thickness direction
    if (normal === 'z') {
      if (vk === 'sectionA') { uMin = obj.z - ht; uMax = obj.z + ht; }
      else { vMin = obj.z - ht; vMax = obj.z + ht; } // planB
    } else if (normal === 'x') {
      if (vk === 'elevation') { uMin = obj.x - ht; uMax = obj.x + ht; }
      else { uMin = obj.x - ht; uMax = obj.x + ht; } // planB
    } else { // y
      if (vk === 'elevation') { vMin = obj.y - ht; vMax = obj.y + ht; }
      else { vMin = obj.y - ht; vMax = obj.y + ht; } // sectionA
    }
    return { u1: uMin, u2: uMax, v1: vMin, v2: vMax };
  }
}

// V24 Phase A — compute the projected AABB of a beam-like member's
// oriented bounding box onto a view's (u, v) plane using the member's
// 3D frame. Handles all 24 orthogonal orientations exactly.
function _memberFrame2DBounds(obj, vk) {
  if (!isMemberType(obj.type)) return null;
  if (!obj.axis || !obj.up) return null;
  const p = sectionProfile(obj);
  if (!p) return null;
  const f = memberFrame(obj);
  const hl = (obj.length || 0) / 2;
  const hd = (p.d || 0) / 2;
  const hbf = (p.bf || 0) / 2;
  const B = _viewBasis(vk);
  // Member centre in view-local (u, v)
  const cu = (obj.x || 0) * B.u.x + (obj.y || 0) * B.u.y + (obj.z || 0) * B.u.z;
  const cv = (obj.x || 0) * B.v.x + (obj.y || 0) * B.v.y + (obj.z || 0) * B.v.z;
  // Half-extent on each view axis = sum of |projection of each local half-dim|
  const ax_u = _vDot(f.axis, B.u), ax_v = _vDot(f.axis, B.v);
  const up_u = _vDot(f.up, B.u),   up_v = _vDot(f.up, B.v);
  const rt_u = _vDot(f.right, B.u), rt_v = _vDot(f.right, B.v);
  const halfU = Math.abs(hl * ax_u) + Math.abs(hd * up_u) + Math.abs(hbf * rt_u);
  const halfV = Math.abs(hl * ax_v) + Math.abs(hd * up_v) + Math.abs(hbf * rt_v);
  return { u1: cu - halfU, u2: cu + halfU, v1: cv - halfV, v2: cv + halfV };
}

function getObj2DBounds(obj, block) {
  const vk = block.viewKey;
  // V24 frame fast path — any member with axis/up uses the generalised calc.
  if (isMemberType(obj.type) && obj.axis && obj.up) {
    const b = _memberFrame2DBounds(obj, vk);
    if (b) return b;
  }
  if (obj.type === 'ub') {
    const s = UB_DB[obj.section]; if (!s) return null;
    if (vk === 'elevation') { const hl=obj.length/2, hd=s.d/2; return {u1:obj.x-hl, u2:obj.x+hl, v1:obj.y-hd, v2:obj.y+hd}; }
    if (vk === 'sectionA') { const hbf=s.bf/2, hd=s.d/2; return {u1:obj.z-hbf, u2:obj.z+hbf, v1:obj.y-hd, v2:obj.y+hd}; }
    const hl=obj.length/2, hbf=s.bf/2; return {u1:obj.x-hl, u2:obj.x+hl, v1:obj.z-hbf, v2:obj.z+hbf};
  }
  if (obj.type === 'shs') {
    const s = SHS_DB[obj.section]; if (!s) return null;
    const hB=s.B/2, hl=obj.length/2;
    if (vk === 'elevation') return {u1:obj.x-hl, u2:obj.x+hl, v1:obj.y-hB, v2:obj.y+hB};
    // sectionA & planB: rotation-aware projected bounds (matches drawing code)
    const rotR = (obj.rot || 0) * Math.PI / 180;
    const cr = Math.abs(Math.cos(rotR)), sr = Math.abs(Math.sin(rotR));
    if (vk === 'sectionA') {
      const outerHalfY = hB * cr + hl * sr;
      return {u1:obj.z-hB, u2:obj.z+hB, v1:obj.y-outerHalfY, v2:obj.y+outerHalfY};
    }
    // planB
    const outerHalfX = hl * cr + hB * sr;
    return {u1:obj.x-outerHalfX, u2:obj.x+outerHalfX, v1:obj.z-hB, v2:obj.z+hB};
  }
  if (obj.type === 'plate') {
    if (obj.polyPts) return getPolyPlateBounds(obj, vk);
    if (vk === 'elevation') return {u1:obj.x-obj.pw/2, u2:obj.x+obj.pw/2, v1:obj.y-obj.ph/2, v2:obj.y+obj.ph/2};
    if (vk === 'sectionA') return {u1:obj.z-obj.pt/2, u2:obj.z+obj.pt/2, v1:obj.y-obj.ph/2, v2:obj.y+obj.ph/2};
    return {u1:obj.x-obj.pw/2, u2:obj.x+obj.pw/2, v1:obj.z-obj.pt/2, v2:obj.z+obj.pt/2};
  }
  if (obj.type === 'bolt') {
    const b = BOLT_DB[obj.boltSize] || BOLT_DB.M20;
    const r = b.headAF / 2 + 3;   // radial half-extent for end-on view
    if (vk === 'elevation') return {u1:obj.x-r, u2:obj.x+r, v1:obj.y-r, v2:obj.y+r};
    // sectionA / planB: bolt axis spans full assembly along z
    const gi = computeBoltGripInfo(obj);
    const hG = gi.grip / 2;
    const zMin = gi.zCentre - hG - b.washT - b.headH;
    const zMax = gi.zCentre + hG + b.washT + b.nutH + gi.threadProt;
    if (vk === 'sectionA') return {u1:zMin, u2:zMax, v1:obj.y-r, v2:obj.y+r};
    return {u1:obj.x-r, u2:obj.x+r, v1:zMin, v2:zMax};
  }
  // V22.1 — new section member types share the UB/SHS bounds formula via
  // sectionProfile (unified d/bf dims).
  if (isMemberType(obj.type)) {
    const p = sectionProfile(obj); if (!p) return null;
    const hl = (obj.length || 0) / 2;
    const hd = (p.d || 0) / 2;
    const hbf = (p.bf || 0) / 2;
    if (vk === 'elevation') return {u1:obj.x-hl, u2:obj.x+hl, v1:obj.y-hd, v2:obj.y+hd};
    if (vk === 'sectionA') return {u1:obj.z-hbf, u2:obj.z+hbf, v1:obj.y-hd, v2:obj.y+hd};
    return {u1:obj.x-hl, u2:obj.x+hl, v1:obj.z-hbf, v2:obj.z+hbf};
  }
  return null;
}

function hitTest3D(block, px, py) {
  const real = px2real(block, px, py);
  const tol = 6 * drawingScale / viewport.zoom;
  for (let i = objects3D.length - 1; i >= 0; i--) {
    const obj = objects3D[i];
    if (obj.__preview) continue; // V23.1 — ghost preview is not selectable
    const b = getObj2DBounds(obj, block);
    if (!b) continue;
    // For rotated objects in elevation, un-rotate the test point around the object centre
    let tu = real.u, tv = real.v;
    const rot = obj.rot || 0;
    if (Math.abs(rot) > 0.01 && block.viewKey === 'elevation') {
      const cu = obj.x, cv = obj.y;
      const rad = rot * Math.PI / 180;
      const dx = real.u - cu, dy = real.v - cv;
      tu = cu + dx * Math.cos(rad) + dy * Math.sin(rad);
      tv = cv - dx * Math.sin(rad) + dy * Math.cos(rad);
    }
    if (tu >= b.u1-tol && tu <= b.u2+tol && tv >= b.v1-tol && tv <= b.v2+tol) {
      return obj;
    }
  }
  return null;
}

// Hit-test returning ALL objects at a point (for Tab-to-cycle selection)
function hitTestAll3D(block, px, py) {
  const real = px2real(block, px, py);
  const tol = 6 * drawingScale / viewport.zoom;
  const hits = [];
  for (let i = objects3D.length - 1; i >= 0; i--) {
    const obj = objects3D[i];
    if (obj.__preview) continue; // V23.1 — ghost preview is not selectable
    const b = getObj2DBounds(obj, block);
    if (!b) continue;
    let tu = real.u, tv = real.v;
    const rot = obj.rot || 0;
    if (Math.abs(rot) > 0.01 && block.viewKey === 'elevation') {
      const cu = obj.x, cv = obj.y;
      const rad = rot * Math.PI / 180;
      const dx = real.u - cu, dy = real.v - cv;
      tu = cu + dx * Math.cos(rad) + dy * Math.sin(rad);
      tv = cv - dx * Math.sin(rad) + dy * Math.cos(rad);
    }
    if (tu >= b.u1-tol && tu <= b.u2+tol && tv >= b.v1-tol && tv <= b.v2+tol) {
      hits.push(obj);
    }
  }
  return hits;
}

// Determine which detail block the screen cursor is inside
function blockAtPixel(px, py) {
  const sh = px2s(px, py);
  // Check each visible block's bounding box on the sheet
  for (const blk of blocks) {
    if (blk.hidden) continue;
    const bbox = getBlockSheetBounds(blk);
    if (sh.x >= bbox.left && sh.x <= bbox.right && sh.y >= bbox.top && sh.y <= bbox.bottom) {
      return blk;
    }
  }
  return null;
}

// Get the sheet-mm bounding box of a block — uses explicit boxW/boxH
function getBlockSheetBounds(blk) {
  const hw = blk.boxW / 2, hh = blk.boxH / 2;
  return {
    left: blk.sheetX - hw,
    top: blk.sheetY - hh,
    right: blk.sheetX + hw,
    bottom: blk.sheetY + hh
  };
}

// Minimum view box size in sheet-mm
const MIN_BOX_W = 40, MIN_BOX_H = 40;

// Hit-test the 8 resize handles (corners + edges) of a block.
// Returns handle name string or null. Tolerance in screen px.
function hitTestResizeHandle(blk, px, py) {
  const bbox = getBlockSheetBounds(blk);
  const tl = s2px(bbox.left, bbox.top);
  const br = s2px(bbox.right, bbox.bottom);
  const tol = 6; // px tolerance
  const onL = Math.abs(px - tl.x) < tol;
  const onR = Math.abs(px - br.x) < tol;
  const onT = Math.abs(py - tl.y) < tol;
  const onB = Math.abs(py - br.y) < tol;
  const inX = px > tl.x - tol && px < br.x + tol;
  const inY = py > tl.y - tol && py < br.y + tol;
  if (onT && onL) return 'nw';
  if (onT && onR) return 'ne';
  if (onB && onL) return 'sw';
  if (onB && onR) return 'se';
  if (onT && inX) return 'n';
  if (onB && inX) return 's';
  if (onL && inY) return 'w';
  if (onR && inY) return 'e';
  return null;
}

// Hit-test the border zone of a block (for drag-to-move). Returns true if on border but not on resize handle.
function hitTestBlockBorder(blk, px, py) {
  const bbox = getBlockSheetBounds(blk);
  const tl = s2px(bbox.left, bbox.top);
  const br = s2px(bbox.right, bbox.bottom);
  const outer = 6, inner = 6; // px tolerance
  const inOuter = px >= tl.x - outer && px <= br.x + outer && py >= tl.y - outer && py <= br.y + outer;
  const inInner = px >= tl.x + inner && px <= br.x - inner && py >= tl.y + inner && py <= br.y - inner;
  return inOuter && !inInner;
}

// Cursor style for resize handle
function resizeHandleCursor(handle) {
  const map = { nw:'nw-resize', ne:'ne-resize', sw:'sw-resize', se:'se-resize',
                n:'n-resize', s:'s-resize', w:'w-resize', e:'e-resize' };
  return map[handle] || 'default';
}

// Helper: get max extent of all 3D objects (in real-world mm)
function v3dGetExtent() {
  if (!v3dGroup || !v3dGroup.children.length) return 400;
  const box = new THREE.Box3().setFromObject(v3dGroup);
  const size = new THREE.Vector3();
  box.getSize(size);
  return Math.max(size.x, size.y, size.z) + 80; // pad
}

// ============================================================
