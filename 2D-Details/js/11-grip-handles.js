'use strict';

// Grip handles — resize plates, extend members, rotate
// Extracted from dev/index.html lines 4121-4351 (2026-05-02 modular split)

// GRIP HANDLES — resize plates, extend members, rotate
// ============================================================

// Returns array of grip descriptors for an object in a view.
// Each grip: { type, u, v, cursor } where u,v are real-world view coords.
function getGrips(obj, block) {
  const vk = block.viewKey;
  const b = getObj2DBounds(obj, block);
  if (!b) return [];
  const grips = [];
  const mu = (b.u1 + b.u2) / 2, mv = (b.v1 + b.v2) / 2;

  if (obj.type === 'plate') {
    if (obj.polyPts) {
      // Polygon plate: vertex grips (only in the face view)
      const normal = obj.normal || 'z';
      const viewShowsFace = (vk === 'elevation' && normal === 'z') ||
                            (vk === 'sectionA' && normal === 'x') ||
                            (vk === 'planB' && normal === 'y');
      if (viewShowsFace) {
        const projFn = vk === 'elevation' ? (p => [obj.x+p.dx, obj.y+p.dy]) :
                       vk === 'sectionA' ? (p => [obj.z+p.dz, obj.y+p.dy]) :
                       (p => [obj.x+p.dx, obj.z+p.dz]);
        obj.polyPts.forEach((p, i) => {
          const [gu, gv] = projFn(p);
          grips.push({ type: 'poly-vertex', index: i, u: gu, v: gv, cursor: 'move' });
        });
      } else {
        // Edge view: thickness grips
        grips.push({ type: 'edge-l', u: b.u1, v: mv, cursor: 'ew-resize' });
        grips.push({ type: 'edge-r', u: b.u2, v: mv, cursor: 'ew-resize' });
      }
    } else {
      // Legacy rectangular plate: edge midpoint grips
      grips.push({ type: 'edge-l', u: b.u1, v: mv, cursor: 'ew-resize' });
      grips.push({ type: 'edge-r', u: b.u2, v: mv, cursor: 'ew-resize' });
      grips.push({ type: 'edge-t', u: mu, v: b.v2, cursor: 'ns-resize' });
      grips.push({ type: 'edge-b', u: mu, v: b.v1, cursor: 'ns-resize' });
    }
  }

  // V24.A2 — Frame-aware end grips for any beam-like member (UB/UC/SHS/PFC
  // /RHS/CHS/EA/UA). Reads the 3D frame to find the real endpoints, projects
  // them into the view. If the axis is visible in the view, show both end
  // grips; if the member is seen end-on, show a single centre move-grip.
  if (isMemberType(obj.type)) {
    const f = memberFrame(obj);
    const B = _viewBasis(vk);
    const a = memberProjectedAxis(obj, vk);
    const ep = memberEndPoint(obj, +1);
    const en = memberEndPoint(obj, -1);
    const toUV = (p) => ({
      u: p.x * B.u.x + p.y * B.u.y + p.z * B.u.z,
      v: p.x * B.v.x + p.y * B.v.y + p.z * B.v.z,
    });
    const epUV = toUV(ep);
    const enUV = toUV(en);
    if (a.magUV > 0.3) {
      // Axis projects visibly into this view — drag either end to extend.
      grips.push({ type: 'end-plus',  u: epUV.u, v: epUV.v, cursor: 'crosshair', sign: +1 });
      grips.push({ type: 'end-minus', u: enUV.u, v: enUV.v, cursor: 'crosshair', sign: -1 });

      // V24.A5 — Rotation ball, mirroring the V25 mem2 pitch handle. Sits
      // perpendicular to the projected member axis at its midpoint. Drag
      // pitches the member in the view plane (about world depth axis); snaps
      // to 0/45/90/... unless Shift is held for free angle. Frame-aware: the
      // rotation is applied to the 3D frame via _applyMemberTilt so all four
      // views stay consistent.
      const muP = (epUV.u + enUV.u) / 2;
      const mvP = (epUV.v + enUV.v) / 2;
      const projLen = a.magUV;
      const perpU = -a.v / projLen;
      const perpV =  a.u / projLen;
      const p = (typeof sectionProfile === 'function') ? sectionProfile(obj) : null;
      const hd = (p && p.d) ? p.d / 2 : 50;
      const offsetMm = hd + Math.max(40, hd * 0.6);
      grips.push({
        type: 'rotate',
        u: muP + perpU * offsetMm,
        v: mvP + perpV * offsetMm,
        cursor: 'crosshair',
        midU: muP, midV: mvP,
      });
    }
  }

  return grips;
}

// Hit-test grips: returns the grip descriptor if cursor is near one, else null
// V24.A2 — grips are now stored in view-local (u, v) coords that already
// account for the member's 3D frame (see getGrips). No rotational un-transform
// of the cursor is needed.
function hitTestGrip(block, px, py) {
  const real = px2real(block, px, py);
  const gripRadiusPx = 8; // pixel tolerance for grip hit
  const gripRadiusReal = gripRadiusPx * drawingScale / viewport.zoom;

  for (const obj of selected3D) {
    const grips = getGrips(obj, block);
    for (const g of grips) {
      if (Math.hypot(real.u - g.u, real.v - g.v) < gripRadiusReal) {
        return { ...g, obj, block };
      }
    }
  }
  return null;
}

// Apply a grip drag delta to resize or extend an object.
// gripInfo: { obj, type, block }, du/dv: delta in real-world mm from grip start.
function applyGripDrag(gripInfo, currentU, currentV) {
  const obj = gripInfo.obj;
  const type = gripInfo.type;
  const vk = gripInfo.block.viewKey;

  if (obj.type === 'plate' && obj.polyPts && type === 'poly-vertex') {
    // Move a polygon vertex
    const idx = gripInfo.index;
    if (idx >= 0 && idx < obj.polyPts.length) {
      const p = obj.polyPts[idx];
      if (vk === 'elevation') { p.dx = currentU - obj.x; p.dy = currentV - obj.y; }
      else if (vk === 'sectionA') { p.dz = currentU - obj.z; p.dy = currentV - obj.y; }
      else { p.dx = currentU - obj.x; p.dz = currentV - obj.z; }
    }
    if (typeof v3dMarkDirty === 'function') v3dMarkDirty();
    requestRender(); return;
  }

  if (obj.type === 'plate' && !obj.polyPts) {
    if (vk === 'elevation') {
      if (type === 'edge-r') {
        const newRight = currentU;
        const left = obj.x - obj.pw / 2;
        const newW = Math.max(5, newRight - left);
        obj.x = left + newW / 2;
        obj.pw = newW;
      } else if (type === 'edge-l') {
        const right = obj.x + obj.pw / 2;
        const newW = Math.max(5, right - currentU);
        obj.x = right - newW / 2;
        obj.pw = newW;
      } else if (type === 'edge-t') {
        const bot = obj.y - obj.ph / 2;
        const newH = Math.max(5, currentV - bot);
        obj.y = bot + newH / 2;
        obj.ph = newH;
      } else if (type === 'edge-b') {
        const top = obj.y + obj.ph / 2;
        const newH = Math.max(5, top - currentV);
        obj.y = top - newH / 2;
        obj.ph = newH;
      }
    } else if (vk === 'sectionA') {
      // Section A: u=z, v=y, shows pt (thickness) × ph (height)
      if (type === 'edge-r') {
        const left = obj.z - obj.pt / 2;
        const newT = Math.max(2, currentU - left);
        obj.z = left + newT / 2;
        obj.pt = newT;
      } else if (type === 'edge-l') {
        const right = obj.z + obj.pt / 2;
        const newT = Math.max(2, right - currentU);
        obj.z = right - newT / 2;
        obj.pt = newT;
      } else if (type === 'edge-t') {
        const bot = obj.y - obj.ph / 2;
        const newH = Math.max(5, currentV - bot);
        obj.y = bot + newH / 2;
        obj.ph = newH;
      } else if (type === 'edge-b') {
        const top = obj.y + obj.ph / 2;
        const newH = Math.max(5, top - currentV);
        obj.y = top - newH / 2;
        obj.ph = newH;
      }
    } else { // planB: u=x, v=z, shows pw × pt
      if (type === 'edge-r') {
        const left = obj.x - obj.pw / 2;
        const newW = Math.max(5, currentU - left);
        obj.x = left + newW / 2;
        obj.pw = newW;
      } else if (type === 'edge-l') {
        const right = obj.x + obj.pw / 2;
        const newW = Math.max(5, right - currentU);
        obj.x = right - newW / 2;
        obj.pw = newW;
      } else if (type === 'edge-t') {
        const bot = obj.z - obj.pt / 2;
        const newT = Math.max(2, currentV - bot);
        obj.z = bot + newT / 2;
        obj.pt = newT;
      } else if (type === 'edge-b') {
        const top = obj.z + obj.pt / 2;
        const newT = Math.max(2, top - currentV);
        obj.z = top - newT / 2;
        obj.pt = newT;
      }
    }
  }

  // V24.A5 — Rotate handle for beam-like members. Pitch in the view plane,
  // backed by a tilt of the 3D frame about the view's depth axis. Default
  // snaps to 0/45/90/... ; Shift bypasses the snap for free angle. The
  // snapshot frame (gripSnapshot.axis/up) anchors the rotation so the total
  // delta is always re-derived from the drag start, never accumulated.
  if (isMemberType(obj.type) && type === 'rotate' && gripSnapshot) {
    const B = _viewBasis(vk);
    // Snapshot's projected axis angle in this view's u-v plane.
    const snapFrame = (typeof memberFrame === 'function') ? memberFrame(gripSnapshot) : null;
    if (!snapFrame) return;
    const aSnap = {
      u: snapFrame.axis.x * B.u.x + snapFrame.axis.y * B.u.y + snapFrame.axis.z * B.u.z,
      v: snapFrame.axis.x * B.v.x + snapFrame.axis.y * B.v.y + snapFrame.axis.z * B.v.z,
    };
    const startAngle = Math.atan2(aSnap.v, aSnap.u);
    // Snapshot's projected centre (member centre projects onto u-v).
    const muSnap = (gripSnapshot.x || 0) * B.u.x + (gripSnapshot.y || 0) * B.u.y + (gripSnapshot.z || 0) * B.u.z;
    const mvSnap = (gripSnapshot.x || 0) * B.v.x + (gripSnapshot.y || 0) * B.v.y + (gripSnapshot.z || 0) * B.v.z;
    // Cursor angle relative to centre, minus 90° because the handle sits
    // perpendicular to the member.
    const dx = currentU - muSnap, dy = currentV - mvSnap;
    if (dx * dx + dy * dy < 1) return;
    const cursorAngle = Math.atan2(dy, dx) - Math.PI / 2;
    const useShift = (typeof shiftHeld !== 'undefined' && shiftHeld);
    const targetAngle = (typeof applySnappedRotation === 'function')
      ? applySnappedRotation(cursorAngle, useShift)
      : cursorAngle;
    let deltaRad = targetAngle - startAngle;
    // Wrap to (-π, π] so we tilt the short way around.
    while (deltaRad >  Math.PI) deltaRad -= 2 * Math.PI;
    while (deltaRad < -Math.PI) deltaRad += 2 * Math.PI;
    // Restore frame to snapshot, then tilt the absolute delta about the
    // view's outward normal. Sign per-view (verified by hand for all three
    // views; see HEAD comment in file 19-member-frame.js for view bases).
    obj.axis = { x: snapFrame.axis.x, y: snapFrame.axis.y, z: snapFrame.axis.z };
    obj.up   = { x: snapFrame.up.x,   y: snapFrame.up.y,   z: snapFrame.up.z   };
    if ('rot' in obj) delete obj.rot;
    let tiltAxis = 'Z', sign = 1;
    if (vk === 'sectionA') { tiltAxis = 'X'; sign = -1; }
    else if (vk === 'planB') { tiltAxis = 'Y'; sign = -1; }
    const tiltDeg = sign * deltaRad * 180 / Math.PI;
    if (typeof _applyMemberTilt === 'function' && Math.abs(tiltDeg) > 1e-6) {
      _applyMemberTilt(obj, tiltAxis, tiltDeg);
    }
    // Stash the latest live angle for the render overlay.
    obj._liveRotAngleDeg = ((targetAngle * 180 / Math.PI) % 360 + 360) % 360;
    if (typeof v3dMarkDirty === 'function') v3dMarkDirty();
    if (typeof invalidateWeldCache === 'function') invalidateWeldCache();
    return;
  }

  // V24.A2 — Frame-aware length drag for any beam-like member. The grip's
  // `sign` (+1/-1) identifies which end of the 3D frame axis is being dragged;
  // the opposite end stays anchored in world space. The cursor's (currentU,
  // currentV) in view coords is lifted back into 3D using the view basis
  // (preserving the anchor's depth component — a valid assumption for all 24
  // orthogonal orientations because the axis is perpendicular to view depth
  // in those cases). New length = projection of (cursor3D − anchor) onto
  // sign · axis. Centre recomputed so the anchored end stays put.
  if (isMemberType(obj.type) && (type === 'end-plus' || type === 'end-minus')) {
    const f = memberFrame(obj);
    const sign = (type === 'end-plus') ? 1 : -1;
    const anchor = memberEndPoint(obj, -sign);
    const B = _viewBasis(vk);
    const anchorDepth = anchor.x * B.d.x + anchor.y * B.d.y + anchor.z * B.d.z;
    const cursor3D = {
      x: currentU * B.u.x + currentV * B.v.x + anchorDepth * B.d.x,
      y: currentU * B.u.y + currentV * B.v.y + anchorDepth * B.d.y,
      z: currentU * B.u.z + currentV * B.v.z + anchorDepth * B.d.z,
    };
    const dx = cursor3D.x - anchor.x;
    const dy = cursor3D.y - anchor.y;
    const dz = cursor3D.z - anchor.z;
    const projectedLen = sign * (dx * f.axis.x + dy * f.axis.y + dz * f.axis.z);
    const newLen = Math.max(20, projectedLen);
    obj.length = newLen;
    obj.x = anchor.x + sign * (newLen / 2) * f.axis.x;
    obj.y = anchor.y + sign * (newLen / 2) * f.axis.y;
    obj.z = anchor.z + sign * (newLen / 2) * f.axis.z;
    if (typeof v3dMarkDirty === 'function') v3dMarkDirty();
    if (typeof invalidateWeldCache === 'function') invalidateWeldCache();
  }
}

// Apply rotation to an object. Angle in degrees, stored as obj.rot.
function applyRotation(obj, angleDeg) {
  // Snap to common angles: 0, 15, 30, 45, 60, 90 and their multiples
  const snapAngles = [];
  for (let a = 0; a < 360; a += 15) snapAngles.push(a);
  const snapTol = 3; // degrees
  let snapped = angleDeg % 360;
  if (snapped < 0) snapped += 360;
  for (const sa of snapAngles) {
    if (Math.abs(snapped - sa) < snapTol) { snapped = sa; break; }
  }
  obj.rot = snapped;
}

// ============================================================
