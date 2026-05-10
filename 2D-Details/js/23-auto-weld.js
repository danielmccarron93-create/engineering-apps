'use strict';

// V14 auto-weld interface detection + rendering + popup
// Extracted from dev/index.html lines 7259-7929 (2026-05-02 modular split)

// AUTO-WELD INTERFACE DETECTION & RENDERING (V14)
// ============================================================
//
// Detects face-to-face contact between 3D objects and draws AS 1101.3
// compliant weld hatching (diagonal 45° ticks) along the interface line.
// Weld properties can be overridden per interface via double-click popup.
//
// Architecture:
//   computeWeldInterfaces()  — scans all object pairs, returns interface list
//   drawAutoWelds(blk, cs)   — renders hatch marks for one view block
//   weldOverrides {}         — user overrides keyed by "idA-idB" (sorted)
//   autoWeldMinSize(t)       — AS 4100 Cl. 9.7.3.10 minimum fillet weld size

// ---- Weld override storage ----
// Key = "min(idA,idB)-max(idA,idB)", value = { enabled, weldType, weldSize, showSymbol }
let weldOverrides = {};

function weldKey(idA, idB) {
  return idA < idB ? `${idA}-${idB}` : `${idB}-${idA}`;
}

// ---- AS 4100 Cl. 9.7.3.10 minimum fillet weld size ----
function autoWeldMinSize(thinnerThickness) {
  // Returns minimum fillet weld leg size (mm) based on thinner connected part
  // Practical detailing minimums (common Australian practice):
  if (thinnerThickness <= 7)  return 4;
  if (thinnerThickness <= 10) return 5;
  if (thinnerThickness <= 20) return 6;
  return 8;
}

// ---- Get the "thickness" of an object for weld sizing ----
function getObjThickness(obj) {
  if (obj.type === 'plate') return obj.pt || 10;
  if (obj.type === 'ub') {
    const s = UB_DB[obj.section]; return s ? s.tw : 10; // web thickness governs most welds
  }
  if (obj.type === 'shs') {
    const s = SHS_DB[obj.section]; return s ? s.t : 10;
  }
  return 10;
}

// ---- Axis-aligned face extraction for an object ----
// Returns array of { axis: 'x'|'y'|'z', value, span: {uAxis, uMin, uMax, vAxis, vMin, vMax}, objId }
// Each face is a rectangular region at a constant coordinate on one axis.
function getObjFaces(obj) {
  const faces = [];
  const rot = (obj.rot || 0) * Math.PI / 180;
  const isVert = Math.abs(Math.sin(rot)) > Math.abs(Math.cos(rot));

  if (obj.type === 'plate') {
    if (obj.polyPts) {
      // Polygon plate: use bounding box faces
      const normal = obj.normal || 'z';
      const ht = obj.pt / 2;
      let xs = [], ys = [];
      obj.polyPts.forEach(p => { xs.push(obj.x + p.dx); ys.push(obj.y + p.dy); });
      const xMin = Math.min(...xs), xMax = Math.max(...xs);
      const yMin = Math.min(...ys), yMax = Math.max(...ys);
      if (normal === 'z') {
        faces.push({ axis: 'z', value: obj.z - ht, span: { uAxis: 'x', uMin: xMin, uMax: xMax, vAxis: 'y', vMin: yMin, vMax: yMax }, objId: obj.id });
        faces.push({ axis: 'z', value: obj.z + ht, span: { uAxis: 'x', uMin: xMin, uMax: xMax, vAxis: 'y', vMin: yMin, vMax: yMax }, objId: obj.id });
        // X-aligned faces (left/right edges of the polygon plate)
        faces.push({ axis: 'x', value: xMin, span: { uAxis: 'z', uMin: obj.z - ht, uMax: obj.z + ht, vAxis: 'y', vMin: yMin, vMax: yMax }, objId: obj.id });
        faces.push({ axis: 'x', value: xMax, span: { uAxis: 'z', uMin: obj.z - ht, uMax: obj.z + ht, vAxis: 'y', vMin: yMin, vMax: yMax }, objId: obj.id });
        faces.push({ axis: 'y', value: yMin, span: { uAxis: 'x', uMin: xMin, uMax: xMax, vAxis: 'z', vMin: obj.z - ht, vMax: obj.z + ht }, objId: obj.id });
        faces.push({ axis: 'y', value: yMax, span: { uAxis: 'x', uMin: xMin, uMax: xMax, vAxis: 'z', vMin: obj.z - ht, vMax: obj.z + ht }, objId: obj.id });
      }
    } else {
      // Rectangular plate (normal=z always)
      const hw = obj.pw / 2, hh = obj.ph / 2, ht = obj.pt / 2;
      faces.push({ axis: 'x', value: obj.x - hw, span: { uAxis: 'z', uMin: obj.z - ht, uMax: obj.z + ht, vAxis: 'y', vMin: obj.y - hh, vMax: obj.y + hh }, objId: obj.id });
      faces.push({ axis: 'x', value: obj.x + hw, span: { uAxis: 'z', uMin: obj.z - ht, uMax: obj.z + ht, vAxis: 'y', vMin: obj.y - hh, vMax: obj.y + hh }, objId: obj.id });
      faces.push({ axis: 'y', value: obj.y - hh, span: { uAxis: 'x', uMin: obj.x - hw, uMax: obj.x + hw, vAxis: 'z', vMin: obj.z - ht, vMax: obj.z + ht }, objId: obj.id });
      faces.push({ axis: 'y', value: obj.y + hh, span: { uAxis: 'x', uMin: obj.x - hw, uMax: obj.x + hw, vAxis: 'z', vMin: obj.z - ht, vMax: obj.z + ht }, objId: obj.id });
      faces.push({ axis: 'z', value: obj.z - ht, span: { uAxis: 'x', uMin: obj.x - hw, uMax: obj.x + hw, vAxis: 'y', vMin: obj.y - hh, vMax: obj.y + hh }, objId: obj.id });
      faces.push({ axis: 'z', value: obj.z + ht, span: { uAxis: 'x', uMin: obj.x - hw, uMax: obj.x + hw, vAxis: 'y', vMin: obj.y - hh, vMax: obj.y + hh }, objId: obj.id });
    }
  }
  // V24.A2 — Frame-aware face generation for any beam-like member.
  // memberExtentOnAxis gives the world AABB along each axis — for orthogonal
  // frames this is exact, and for Phase C diagonals it's a conservative
  // enclosing box. Emit the 6 AABB faces with their world-axis normal so
  // the existing computeWeldInterfaces + projectWeldToView pipeline works
  // unchanged. Handles UB / UC / SHS / PFC / RHS / CHS / EA / UA.
  else if (isMemberType(obj.type)) {
    const extX = memberExtentOnAxis(obj, 'x');
    const extY = memberExtentOnAxis(obj, 'y');
    const extZ = memberExtentOnAxis(obj, 'z');
    if (!extX || !extY || !extZ) return faces;
    const xSpanYZ = { uAxis: 'z', uMin: extZ.min, uMax: extZ.max, vAxis: 'y', vMin: extY.min, vMax: extY.max };
    const ySpanXZ = { uAxis: 'x', uMin: extX.min, uMax: extX.max, vAxis: 'z', vMin: extZ.min, vMax: extZ.max };
    const zSpanXY = { uAxis: 'x', uMin: extX.min, uMax: extX.max, vAxis: 'y', vMin: extY.min, vMax: extY.max };
    faces.push({ axis: 'x', value: extX.min, span: xSpanYZ, objId: obj.id });
    faces.push({ axis: 'x', value: extX.max, span: xSpanYZ, objId: obj.id });
    faces.push({ axis: 'y', value: extY.min, span: ySpanXZ, objId: obj.id });
    faces.push({ axis: 'y', value: extY.max, span: ySpanXZ, objId: obj.id });
    faces.push({ axis: 'z', value: extZ.min, span: zSpanXY, objId: obj.id });
    faces.push({ axis: 'z', value: extZ.max, span: zSpanXY, objId: obj.id });
  }

  return faces;
}

// ---- Compute weld interfaces between all object pairs ----
// Returns array of interface descriptors for rendering.
let _weldInterfaceCache = null;
let _weldCacheDirty = true;

function invalidateWeldCache() { _weldCacheDirty = true; }

function computeWeldInterfaces() {
  if (!_weldCacheDirty && _weldInterfaceCache) return _weldInterfaceCache;

  const interfaces = [];
  const tol = 2.0; // mm — face proximity tolerance
  const objs = objects3D.filter(o => o.type !== 'bolt'); // bolts don't weld

  // Collect all faces
  const allFaces = [];
  for (const obj of objs) {
    const fs = getObjFaces(obj);
    for (const f of fs) { f._obj = obj; allFaces.push(f); }
  }

  // Compare face pairs: same axis, values within tolerance, overlapping spans
  for (let i = 0; i < allFaces.length; i++) {
    for (let j = i + 1; j < allFaces.length; j++) {
      const fA = allFaces[i], fB = allFaces[j];
      if (fA._obj.id === fB._obj.id) continue; // same object
      if (fA.axis !== fB.axis) continue;         // different orientation
      if (Math.abs(fA.value - fB.value) > tol) continue; // not co-planar

      // Check span overlap (both span axes must overlap)
      const uOverlapMin = Math.max(fA.span.uMin, fB.span.uMin);
      const uOverlapMax = Math.min(fA.span.uMax, fB.span.uMax);
      const vOverlapMin = Math.max(fA.span.vMin, fB.span.vMin);
      const vOverlapMax = Math.min(fA.span.vMax, fB.span.vMax);

      if (uOverlapMax - uOverlapMin < 1 || vOverlapMax - vOverlapMin < 1) continue; // no meaningful overlap

      const key = weldKey(fA._obj.id, fB._obj.id);
      const override = weldOverrides[key] || {};

      // Determine which object is the "attached" one (smaller volume = attached part)
      const volA = getObjVolume(fA._obj), volB = getObjVolume(fB._obj);
      const attachedObj = volA <= volB ? fA._obj : fB._obj;
      const parentObj = volA <= volB ? fB._obj : fA._obj;

      // Auto-size: minimum fillet weld per AS 4100 Cl. 9.7.3.10
      const tThin = Math.min(getObjThickness(fA._obj), getObjThickness(fB._obj));
      const autoSize = autoWeldMinSize(tThin);

      interfaces.push({
        key: key,
        objA: fA._obj,
        objB: fB._obj,
        attachedObj: attachedObj,
        parentObj: parentObj,
        faceAxis: fA.axis,
        faceValue: (fA.value + fB.value) / 2,
        // The overlap rectangle in the face plane (uAxis, vAxis coords)
        uAxis: fA.span.uAxis,
        vAxis: fA.span.vAxis,
        uMin: uOverlapMin,
        uMax: uOverlapMax,
        vMin: vOverlapMin,
        vMax: vOverlapMax,
        // Weld properties (override or defaults)
        enabled: override.enabled !== undefined ? override.enabled : true,
        weldType: override.weldType || 'fillet',
        weldSize: override.weldSize || autoSize,
      });
    }
  }

  // De-duplicate: keep only the best (largest overlap) interface per object pair
  const bestByKey = {};
  for (const ifc of interfaces) {
    const area = (ifc.uMax - ifc.uMin) * (ifc.vMax - ifc.vMin);
    if (!bestByKey[ifc.key] || area > bestByKey[ifc.key]._area) {
      ifc._area = area;
      bestByKey[ifc.key] = ifc;
    }
  }

  _weldInterfaceCache = Object.values(bestByKey);
  _weldCacheDirty = false;
  return _weldInterfaceCache;
}

// Simple volume estimate for determining parent vs attached object
function getObjVolume(obj) {
  if (obj.type === 'plate') {
    if (obj.polyPts) {
      // Rough bounding-box volume
      let xs = [], ys = [];
      obj.polyPts.forEach(p => { xs.push(Math.abs(p.dx)); ys.push(Math.abs(p.dy)); });
      return (Math.max(...xs) * 2) * (Math.max(...ys) * 2) * (obj.pt || 10);
    }
    return (obj.pw || 1) * (obj.ph || 1) * (obj.pt || 1);
  }
  if (obj.type === 'ub') {
    const s = UB_DB[obj.section]; if (!s) return 1;
    return obj.length * s.d * s.bf;
  }
  if (obj.type === 'shs') {
    const s = SHS_DB[obj.section]; if (!s) return 1;
    return obj.length * s.B * s.B;
  }
  return 1;
}

// ---- Project an interface to view-local (u, v) line segment ----
// Returns { u1, v1, u2, v2, hatchSide } or null if not visible in this view.
// hatchSide: +1 or -1 indicating which side of the line gets hatching
// (toward the attached/smaller member).
function projectWeldToView(ifc, viewKey) {
  // The interface is a rectangle on a plane at faceAxis=faceValue.
  // In each 2D view, two of the three world axes map to (u, v).
  // The interface line is the intersection of the interface plane with the view plane.

  // View axis mappings:
  //   elevation: u=x, v=y  (shows x-y plane)
  //   sectionA:  u=z, v=y  (shows z-y plane)
  //   planB:     u=x, v=z  (shows x-z plane)

  let viewU, viewV; // which world axes map to this view's u and v
  if (viewKey === 'elevation')  { viewU = 'x'; viewV = 'y'; }
  else if (viewKey === 'sectionA') { viewU = 'z'; viewV = 'y'; }
  else { viewU = 'x'; viewV = 'z'; } // planB

  // The face plane is at faceAxis = faceValue.
  // If faceAxis is the "depth" axis (not shown in this view), the interface appears as
  // a line segment spanning the overlap of the other two axes.
  // If faceAxis is one of the two visible axes, the interface appears as a constant-coordinate line.

  const fa = ifc.faceAxis;

  // Determine which axes of the overlap rectangle map to view u and v
  let u1, u2, v1, v2;

  if (fa !== viewU && fa !== viewV) {
    // Interface plane is perpendicular to the depth axis — always visible.
    // The line segment spans the overlap projected into view (u, v).
    // Need to map ifc.uAxis/vAxis → viewU/viewV
    if (ifc.uAxis === viewU && ifc.vAxis === viewV) {
      u1 = ifc.uMin; u2 = ifc.uMax; v1 = ifc.vMin; v2 = ifc.vMax;
    } else if (ifc.vAxis === viewU && ifc.uAxis === viewV) {
      u1 = ifc.vMin; u2 = ifc.vMax; v1 = ifc.uMin; v2 = ifc.uMax;
    } else {
      return null; // axes don't match this view
    }

    // This is a FILLED REGION (both u and v spans). For hatching, we want the
    // boundary edges visible in this view. Return the edge of the attached object.
    // For now, emit the line segment along the interface at the attached object's edge.
    // Determine which edge is the interface: it's the full u-span at constant v, or full v-span at constant u.
    // For a plate snapped to a column face, the interface is typically a line (one axis narrow).
    // Use the longer span as the weld line.
    const uLen = u2 - u1, vLen = v2 - v1;
    if (uLen >= vLen) {
      // Horizontal weld line (along u at the interface v)
      const vMid = (v1 + v2) / 2;
      return { u1, v1: vMid, u2, v2: vMid, hatchSide: 1 };
    } else {
      // Vertical weld line (along v at the interface u)
      const uMid = (u1 + u2) / 2;
      return { u1: uMid, v1, u2: uMid, v2, hatchSide: 1 };
    }
  }

  // faceAxis IS one of the visible axes: the interface appears as a line at constant u or v.
  if (fa === viewU) {
    // Interface at constant u = faceValue; line spans the v-axis overlap
    // Need to find the v-range from the overlap
    let lineV1, lineV2;
    if (ifc.uAxis === viewV)      { lineV1 = ifc.uMin; lineV2 = ifc.uMax; }
    else if (ifc.vAxis === viewV) { lineV1 = ifc.vMin; lineV2 = ifc.vMax; }
    else return null;
    if (lineV2 - lineV1 < 1) return null;

    // Hatch side: toward the attached object centre in the u direction
    const attachU = ifc.attachedObj.x !== undefined ? (viewU === 'x' ? ifc.attachedObj.x : ifc.attachedObj.z) : 0;
    const side = attachU > ifc.faceValue ? 1 : -1;
    return { u1: ifc.faceValue, v1: lineV1, u2: ifc.faceValue, v2: lineV2, hatchSide: side };
  }

  if (fa === viewV) {
    // Interface at constant v = faceValue; line spans the u-axis overlap
    let lineU1, lineU2;
    if (ifc.uAxis === viewU)      { lineU1 = ifc.uMin; lineU2 = ifc.uMax; }
    else if (ifc.vAxis === viewU) { lineU1 = ifc.vMin; lineU2 = ifc.vMax; }
    else return null;
    if (lineU2 - lineU1 < 1) return null;

    const attachV = ifc.attachedObj.y !== undefined ? (viewV === 'y' ? ifc.attachedObj.y : ifc.attachedObj.z) : 0;
    const side = attachV > ifc.faceValue ? 1 : -1;
    return { u1: lineU1, v1: ifc.faceValue, u2: lineU2, v2: ifc.faceValue, hatchSide: side };
  }

  return null;
}

// ---- Draw weld hatching for a single interface line ----
// Draws 45° diagonal tick marks along the interface, on the hatchSide.
function drawWeldHatch(blk, seg, weldSize, cs) {
  const pm = ppm();
  const col = cs.getPropertyValue('--entity-color').trim();
  ctx.strokeStyle = colorAlpha(col, 0.85);
  // Medium-weight overlay (LW.MW = 0.50mm) — reads clearly as weld annotation
  // without competing with visible-edge linework.
  ctx.lineWidth = Math.max(0.3, LW.MW * pm);
  ctx.setLineDash(DASH.SOLID);
  ctx.lineCap = 'round';

  // Segment direction and length
  const du = seg.u2 - seg.u1, dv = seg.v2 - seg.v1;
  const segLen = Math.hypot(du, dv);
  if (segLen < 0.5) return;

  // Normalised direction along segment; perpendicular points INTO hatch side.
  const ux = du / segLen, uy = dv / segLen;
  const nx = -uy * seg.hatchSide, ny = ux * seg.hatchSide;

  // Tighter spacing and a tick that extends BOTH sides of the interface so the
  // hatching reads as a continuous "zig-zag" chevron pattern across the joint
  // (drafter convention — fillet weld symbols rendered on both connected faces).
  const spacing = 0.9 * drawingScale; // ~0.9mm on sheet (was 1.2)
  const tickHalf = 1.1 * drawingScale; // ~1.1mm half-length → 2.2mm total tick
  const nTicks = Math.max(2, Math.floor(segLen / spacing));
  const actualSpacing = segLen / nTicks;

  for (let i = 0; i <= nTicks; i++) {
    const t = i * actualSpacing;
    const baseU = seg.u1 + ux * t;
    const baseV = seg.v1 + uy * t;
    // 45° chevron: extend from hatch-side deep, across the interface line,
    // and a short way into the opposite side so the marks visibly straddle
    // the joint (≈2.2mm tick total at 45°).
    const aU = baseU - (ux * 0.5 + nx * 0.5) * tickHalf;
    const aV = baseV - (uy * 0.5 + ny * 0.5) * tickHalf;
    const bU = baseU + (ux * 0.5 + nx * 0.5) * tickHalf;
    const bV = baseV + (uy * 0.5 + ny * 0.5) * tickHalf;

    rLine(blk, aU, aV, bU, bV);
  }

  ctx.lineCap = 'butt';
}

// ---- Draw all auto-welds for one view block ----
function drawAutoWelds(blk, cs) {
  const interfaces = computeWeldInterfaces();
  for (const ifc of interfaces) {
    if (!ifc.enabled) continue;
    const seg = projectWeldToView(ifc, blk.viewKey);
    if (!seg) continue;
    drawWeldHatch(blk, seg, ifc.weldSize, cs);
  }
}

// ---- Weld hit-test: find interface near a click point ----
function hitTestWeld(blk, px, py) {
  const real = px2real(blk, px, py);
  const tol = 8 * drawingScale / viewport.zoom;
  const interfaces = computeWeldInterfaces();
  for (const ifc of interfaces) {
    if (!ifc.enabled && !weldOverrides[ifc.key]) continue; // skip hidden unless overridden
    const seg = projectWeldToView(ifc, blk.viewKey);
    if (!seg) continue;
    // Distance from point to line segment
    const du = seg.u2 - seg.u1, dv = seg.v2 - seg.v1;
    const segLen2 = du * du + dv * dv;
    if (segLen2 < 0.01) continue;
    let t = ((real.u - seg.u1) * du + (real.v - seg.v1) * dv) / segLen2;
    t = Math.max(0, Math.min(1, t));
    const closestU = seg.u1 + t * du, closestV = seg.v1 + t * dv;
    const dist = Math.hypot(real.u - closestU, real.v - closestV);
    if (dist < tol) return ifc;
  }
  return null;
}

// ---- Inline weld properties popup ----
let weldPopup = null;

function showWeldPopup(ifc, px, py) {
  closeWeldPopup();
  const key = ifc.key;
  const override = weldOverrides[key] || {};
  const enabled = override.enabled !== undefined ? override.enabled : true;
  const wType = override.weldType || 'fillet';
  const wSize = override.weldSize || ifc.weldSize;

  const div = document.createElement('div');
  div.id = 'weldPopup';
  div.style.cssText = `
    position: fixed; left: ${px + 12}px; top: ${py - 10}px;
    background: var(--bg, #1e1e2e); border: 1px solid var(--brd, #444);
    border-radius: 6px; padding: 10px 14px; z-index: 999;
    font: 12px system-ui; color: var(--entity-color, #ccc);
    box-shadow: 0 4px 16px rgba(0,0,0,0.4); min-width: 160px;
  `;
  div.innerHTML = `
    <div style="font-weight:600; margin-bottom:6px; font-size:13px;">Weld Properties</div>
    <label style="display:flex;align-items:center;gap:6px;margin-bottom:6px;cursor:pointer;">
      <input type="checkbox" id="wpEnabled" ${enabled ? 'checked' : ''}> Enabled
    </label>
    <div style="margin-bottom:4px;">
      <label style="font-size:11px;opacity:0.7;">Type</label>
      <select id="wpType" style="width:100%;background:var(--bg,#1e1e2e);color:inherit;border:1px solid var(--brd,#444);border-radius:3px;padding:2px;">
        <option value="fillet" ${wType === 'fillet' ? 'selected' : ''}>Fillet (FW)</option>
        <option value="square" ${wType === 'square' ? 'selected' : ''}>Square butt</option>
        <option value="single-v" ${(wType === 'single-v' || wType === 'butt') ? 'selected' : ''}>Single-V butt</option>
        <option value="double-v" ${wType === 'double-v' ? 'selected' : ''}>Double-V butt</option>
        <option value="partial-pen" ${wType === 'partial-pen' ? 'selected' : ''}>Partial-penetration</option>
        <option value="bevel" ${wType === 'bevel' ? 'selected' : ''}>Bevel butt</option>
      </select>
    </div>
    <div style="margin-bottom:6px;">
      <label style="font-size:11px;opacity:0.7;">Size (mm)</label>
      <select id="wpSize" style="width:100%;background:var(--bg,#1e1e2e);color:inherit;border:1px solid var(--brd,#444);border-radius:3px;padding:2px;">
        ${[4,5,6,8,10,12].map(s => `<option value="${s}" ${s === wSize ? 'selected' : ''}>${s} mm</option>`).join('')}
      </select>
    </div>
    <div style="font-size:10px;opacity:0.5;margin-bottom:4px;">
      ${ifc.objA.type.toUpperCase()}${ifc.objA.section ? ' ' + ifc.objA.section : ''} ↔
      ${ifc.objB.type.toUpperCase()}${ifc.objB.section ? ' ' + ifc.objB.section : ''}
    </div>
    <button id="wpAddSym" style="width:100%;padding:4px;margin-bottom:4px;background:var(--accent);color:var(--accent-ink,#fff);border:none;border-radius:3px;cursor:pointer;font-size:11px;font-weight:600;">+ Add AS 1101.3 Symbol</button>
    <button id="wpClose" style="width:100%;padding:3px;background:var(--brd,#444);color:inherit;border:none;border-radius:3px;cursor:pointer;font-size:11px;">Close</button>
  `;
  document.body.appendChild(div);
  weldPopup = div;

  // Event handlers
  const apply = () => {
    weldOverrides[key] = {
      enabled: document.getElementById('wpEnabled').checked,
      weldType: document.getElementById('wpType').value,
      weldSize: parseInt(document.getElementById('wpSize').value),
    };
    invalidateWeldCache();
    requestRender();
  };
  div.querySelector('#wpEnabled').addEventListener('change', apply);
  div.querySelector('#wpType').addEventListener('change', apply);
  div.querySelector('#wpSize').addEventListener('change', apply);
  div.querySelector('#wpClose').addEventListener('click', closeWeldPopup);

  // --- Add AS 1101.3 symbol handler ---
  // Creates a 'weld' 2D entity anchored to the midpoint of the weld interface
  // in the CURRENT view, pre-populated with weldType and size from the
  // auto-detected interface. User can then drag the tail to reposition.
  div.querySelector('#wpAddSym').addEventListener('click', () => {
    // Work out which view this interface lives in — prefer the active block's view
    const viewKey = activeBlock ? activeBlock.viewKey : 'elevation';
    const seg = projectWeldToView(ifc, viewKey);
    if (!seg) {
      alert('Weld symbol: interface is not visible in the current view.');
      return;
    }
    const mu = (seg.u1 + seg.u2) / 2;
    const mv = (seg.v1 + seg.v2) / 2;
    // Default leader angle: 30° up-right — conventional AS 1101.3 arrow orientation.
    // User can rotate via the entity handles later.
    const angle = -Math.PI * 0.25; // -45° (pointing up-right; canvas Y-down)
    const ent = mkEnt2D(viewKey, 'weld', {
      u: mu, v: mv,
      angle: angle,
      weldType: document.getElementById('wpType').value,
      size: parseInt(document.getElementById('wpSize').value),
      allAround: false,
    });
    addEnt2D(ent);
    requestRender();
    closeWeldPopup();
  });

  // Close on click outside (remove any stale listener first)
  document.removeEventListener('mousedown', _weldPopupOutsideClick);
  setTimeout(() => {
    document.addEventListener('mousedown', _weldPopupOutsideClick);
  }, 50);
}

function _weldPopupOutsideClick(e) {
  if (weldPopup && !weldPopup.contains(e.target)) closeWeldPopup();
}

function closeWeldPopup() {
  if (weldPopup) { weldPopup.remove(); weldPopup = null; }
  document.removeEventListener('mousedown', _weldPopupOutsideClick);
}

// Show the AS 1101.3 weld dialog and invoke `onConfirm` with the collected
// parameters (ready to spread onto a weld 2D entity) when the user clicks OK.
// Cancel simply hides the dialog. The dialog state is sticky — defaults on
// re-open reflect whatever was last committed, which matches how real drafters
// work (set it once, place many).
let _weldDialogLast = {
  weldType: 'fillet', size: 6, length: '',
  bothSides: false, otherType: 'fillet', otherSize: 6,
  allAround: false, siteWeld: false, tail: '',
};
function openWeldDialog(onConfirm) {
  const dlg = document.getElementById('weldDialog');
  if (!dlg) { onConfirm({ weldType: 'fillet', size: 6 }); return; }

  // Restore last-used values
  document.getElementById('wdType').value = _weldDialogLast.weldType;
  document.getElementById('wdSize').value = _weldDialogLast.size;
  document.getElementById('wdLength').value = _weldDialogLast.length || '';
  document.getElementById('wdBothSides').checked = _weldDialogLast.bothSides;
  document.getElementById('wdOtherType').value = _weldDialogLast.otherType;
  document.getElementById('wdOtherSize').value = _weldDialogLast.otherSize;
  document.getElementById('wdOtherType').disabled = !_weldDialogLast.bothSides;
  document.getElementById('wdOtherSize').disabled = !_weldDialogLast.bothSides;
  document.getElementById('wdAllAround').checked = _weldDialogLast.allAround;
  document.getElementById('wdSiteWeld').checked = _weldDialogLast.siteWeld;
  document.getElementById('wdTail').value = _weldDialogLast.tail || '';

  dlg.classList.add('visible');

  // Replace the OK handler each open so the callback closure captures the
  // correct onConfirm. Also remove any stale listener first.
  const okBtn = document.getElementById('wdOkBtn');
  const newBtn = okBtn.cloneNode(true);
  okBtn.parentNode.replaceChild(newBtn, okBtn);
  newBtn.addEventListener('click', () => {
    const both = document.getElementById('wdBothSides').checked;
    const params = {
      weldType: document.getElementById('wdType').value,
      size: parseFloat(document.getElementById('wdSize').value) || 6,
      length: document.getElementById('wdLength').value.trim() || undefined,
      allAround: document.getElementById('wdAllAround').checked,
      siteWeld: document.getElementById('wdSiteWeld').checked,
      tail: document.getElementById('wdTail').value.trim() || undefined,
    };
    if (both) {
      params.otherType = document.getElementById('wdOtherType').value;
      params.otherSize = parseFloat(document.getElementById('wdOtherSize').value) || 6;
    }
    // Stash as new defaults
    _weldDialogLast = {
      weldType: params.weldType,
      size: params.size,
      length: params.length || '',
      bothSides: both,
      otherType: params.otherType || _weldDialogLast.otherType,
      otherSize: params.otherSize || _weldDialogLast.otherSize,
      allAround: params.allAround,
      siteWeld: params.siteWeld,
      tail: params.tail || '',
    };
    dlg.classList.remove('visible');
    onConfirm(params);
  });
}

// Classify an object relative to a section cut plane.
// Returns 'hidden' (in front of cut, not shown), 'cut' (intersects cut plane),
// or 'projected' (behind cut, shown as projection).
function getCutClass(obj, viewKey) {
  if (viewKey === 'elevation') return null; // no cut filtering in elevation

  const tol = 1; // 1mm tolerance

  if (viewKey === 'sectionA') {
    // Cut plane at X = secCutX. Arrows point right = third-angle projection:
    // viewer at +X, looking LEFT toward -X. Objects LEFT of cut are beyond (visible).
    const ext = getObjAxisExtent(obj, 'x');
    if (ext.min > secCutX + tol) return 'hidden';       // entirely RIGHT of cut → behind viewer
    if (ext.min <= secCutX + tol && ext.max >= secCutX - tol) return 'cut';
    return 'projected';                                   // entirely LEFT of cut → beyond, visible
  }

  if (viewKey === 'planB') {
    // Cut plane at Y = planCutY, viewing direction -Y (arrows point down)
    const ext = getObjAxisExtent(obj, 'y');
    if (ext.min > planCutY + tol) return 'hidden';      // entirely above cut (in front of viewer)
    if (ext.min <= planCutY + tol && ext.max >= planCutY - tol) return 'cut';
    return 'projected';                                  // entirely below cut (beyond)
  }

  return null;
}

// Test if a point (u,v) is inside any of the occlusion rectangles
function isOccluded(u, v, occRects) {
  // Small inset so lines that sit exactly on another object's face boundary
  // (e.g. plate snapped flush to SHS column face) are NOT flagged as occluded.
  // Without this the shared edge of the rear member gets drawn dashed/hidden
  // even though the two faces are physically coincident. 0.5mm in real-world
  // is well below a drafter's line thickness and invisible in output.
  const EPS = 0.5;
  for (const r of occRects) {
    if (u > r.u1 + EPS && u < r.u2 - EPS && v > r.v1 + EPS && v < r.v2 - EPS) return true;
  }
  return false;
}

// Clip a line segment (u1,v1)→(u2,v2) against occlusion rects.
// Returns array of segments: [{ u1,v1, u2,v2, occluded: bool }]
// Uses parametric clipping: walks along the segment and splits at rect boundaries.
function clipLineAgainstOcclusion(u1, v1, u2, v2, occRects) {
  if (occRects.length === 0) return [{ u1, v1, u2, v2, occluded: false }];

  // Collect all parametric t values where occlusion state changes
  const du = u2 - u1, dv = v2 - v1;
  const len = Math.hypot(du, dv);
  if (len < 0.01) return [{ u1, v1, u2, v2, occluded: isOccluded((u1+u2)/2, (v1+v2)/2, occRects) }];

  // Sample along the line at regular intervals and detect transitions
  const steps = Math.max(2, Math.ceil(len / 3)); // sample every ~3mm
  const segments = [];
  let prevOcc = isOccluded(u1, v1, occRects);
  let segStart = 0;

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const su = u1 + du * t, sv = v1 + dv * t;
    const occ = isOccluded(su, sv, occRects);
    if (occ !== prevOcc) {
      // State transition — end current segment just before boundary
      const tBoundary = (i - 0.5) / steps;
      segments.push({
        u1: u1 + du * segStart, v1: v1 + dv * segStart,
        u2: u1 + du * tBoundary, v2: v1 + dv * tBoundary,
        occluded: prevOcc
      });
      segStart = tBoundary;
      prevOcc = occ;
    }
    if (i === steps) {
      // Final segment to the end
      segments.push({
        u1: u1 + du * segStart, v1: v1 + dv * segStart,
        u2: u2, v2: v2,
        occluded: prevOcc
      });
    }
  }
  return segments.length > 0 ? segments : [{ u1, v1, u2, v2, occluded: false }];
}

// Draw a line with occlusion awareness: solid where visible, dashed where hidden
function rLineOcc(blk, u1, v1, u2, v2, occRects, solidStyle, hiddenStyle, solidLW, hiddenLW) {
  if (occRects.length === 0) {
    // No occlusion — draw solid
    ctx.strokeStyle = solidStyle; ctx.lineWidth = solidLW; ctx.setLineDash([]);
    rLine(blk, u1, v1, u2, v2);
    return;
  }
  const segs = clipLineAgainstOcclusion(u1, v1, u2, v2, occRects);
  segs.forEach(seg => {
    if (seg.occluded) {
      ctx.strokeStyle = hiddenStyle; ctx.lineWidth = hiddenLW;
      ctx.setLineDash(DASH.HIDDEN);
    } else {
      ctx.strokeStyle = solidStyle; ctx.lineWidth = solidLW;
      ctx.setLineDash([]);
    }
    rLine(blk, seg.u1, seg.v1, seg.u2, seg.v2);
  });
  ctx.setLineDash([]);
}

// ============================================================
