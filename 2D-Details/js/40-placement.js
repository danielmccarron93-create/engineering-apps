'use strict';

// Component placement + two-click draw + polygon plate completion
// Extracted from dev/index.html lines 12654-12823 (2026-05-02 modular split)

// COMPONENT PLACEMENT
// ============================================================

function placeComponent(blk, cu, cv) {
  if (!placing) return;
  const pos = blk.unproject(cu, cv);
  const x = pos.x !== undefined ? pos.x : 0;
  const y = pos.y !== undefined ? pos.y : 0;
  const z = pos.z !== undefined ? pos.z : 0;

  if (placing.type === 'ub') addObj(mkObj('ub', { section:placing.section, x, y, z, length:placing.length||600, rot:0 }));
  else if (placing.type === 'shs') addObj(mkObj('shs', { section:placing.section, x, y, z, length:placing.length||500, rot:90 }));
  else if (placing.type === 'plate') addObj(mkObj('plate', { x, y, z, pw:placing.pw, ph:placing.ph, pt:placing.pt }));
  else if (placing.type === 'bolt') addObj(mkObj('bolt', { boltSize:placing.boltSize, x, y, z }));
}

// ============================================================
// TWO-CLICK DRAW-MEMBER PLACEMENT
// ============================================================

function finishDrawMember(blk, startU, startV, endU, endV) {
  if (!drawMember) return;

  // Compute midpoint, length, and rotation from the two click points
  const midU = (startU + endU) / 2;
  const midV = (startV + endV) / 2;
  const du = endU - startU;
  const dv = endV - startV;
  const length = Math.hypot(du, dv);
  const rotRad = Math.atan2(dv, du);  // angle from horizontal
  const rotDeg = rotRad * 180 / Math.PI;

  // Unproject midpoint to 3D — assigns depth from section cut positions
  const pos = blk.unproject(midU, midV);
  let x = pos.x !== undefined ? pos.x : 0;
  let y = pos.y !== undefined ? pos.y : 0;
  let z = pos.z !== undefined ? pos.z : 0;

  // View-aware depth: fill in the missing axis from the cut-line positions
  if (blk.viewKey === 'elevation') {
    z = secCutX !== undefined ? 0 : 0;  // elevation shows X,Y — Z is depth
  } else if (blk.viewKey === 'sectionA') {
    x = secCutX;  // section shows Z,Y — X is depth (use section cut X)
  } else if (blk.viewKey === 'planB') {
    y = planCutY;  // plan shows X,Z — Y is depth (use plan cut Y)
  }

  // V24.A3 — pick the correct 3D axis from the view the user drew in.
  // For orthogonal draws this returns a preset → we inject axis/up directly
  // and skip the legacy rot field. For non-ortho elevation draws it returns
  // null and we fall through to the legacy rot path.
  const snap = _placementFrameForView(blk.viewKey, rotDeg);
  const frameExtras = snap
    ? (() => {
        const f = frameFromPreset(snap.axisLetter, snap.dir, snap.rollDeg);
        return { axis: f.axis, up: f.up };
      })()
    : { rot: Math.round(rotDeg * 10) / 10 };

  let newObj = null;
  if (drawMember.type === 'ub') {
    if (length < 5) return; // too short, ignore
    newObj = mkObj('ub', { section: drawMember.section, x, y, z, length: Math.round(length), ...frameExtras });
  } else if (drawMember.type === 'shs') {
    if (length < 5) return;
    newObj = mkObj('shs', { section: drawMember.section, x, y, z, length: Math.round(length), ...frameExtras });
  } else if (drawMember.type === 'pfc' || drawMember.type === 'rhs'
          || drawMember.type === 'chs' || drawMember.type === 'ea' || drawMember.type === 'ua') {
    // V22.1 — new section member types share the same draw flow as UB/SHS.
    if (length < 5) return;
    newObj = mkObj(drawMember.type, {
      section: drawMember.section,
      x, y, z,
      length: Math.round(length),
      ...frameExtras
    });
  } else if (drawMember.type === 'plate') {
    // For plates: startU/V to endU/V defines a diagonal rectangle
    // Width = distance along drawn line, height = plate height from dialog
    if (length < 2) return;
    // Place plate at midpoint with rotation
    newObj = mkObj('plate', { x, y, z, pw: Math.round(length), ph: drawMember.ph, pt: drawMember.pt, rot: Math.round(rotDeg * 10) / 10 });
  } else if (drawMember.type === 'bolt') {
    // Bolt: single click placement at start point (no length/rotation needed)
    const bPos = blk.unproject(startU, startV);
    const bx = bPos.x !== undefined ? bPos.x : 0;
    const by = bPos.y !== undefined ? bPos.y : 0;
    const bz = bPos.z !== undefined ? bPos.z : 0;
    newObj = mkObj('bolt', { boltSize: drawMember.boltSize, x: bx, y: by, z: bz });
  }

  if (newObj) {
    addObj(newObj);
    // Auto-select the newly placed member
    selected3D = [newObj];
    updatePropsPanel();
    requestRender();
  }

  // Reset draw state but keep drawMember active for chained drawing
  drawStart = null;
  drawPreviewEnd = null;
}

// ============================================================
// POLYGON PLATE COMPLETION
// ============================================================

function finishDrawPlate() {
  if (platePts.length < 3 || !plateBlock) {
    platePts = []; plateBlock = null; plateDimInput = ''; plateDimActive = false;
    requestRender(); return;
  }

  // Prompt for thickness
  const thkStr = prompt('Plate thickness (mm):', '12');
  if (!thkStr) {
    platePts = []; plateBlock = null; plateDimInput = ''; plateDimActive = false;
    requestRender(); return;
  }
  const pt = parseFloat(thkStr) || 12;

  // Determine which axis is the normal (thickness direction)
  const vk = plateBlock.viewKey;
  let normal = 'z'; // default for elevation (X,Y plane → thickness in Z)
  if (vk === 'sectionA') normal = 'x';  // Z,Y plane → thickness in X
  else if (vk === 'planB') normal = 'y'; // X,Z plane → thickness in Y

  // Determine depth position (the coordinate along the normal axis)
  let depthPos = 0;
  if (vk === 'elevation') depthPos = 0;
  else if (vk === 'sectionA') depthPos = secCutX;
  else if (vk === 'planB') depthPos = planCutY;

  // Convert view-local u,v to world coords
  const worldPts = platePts.map(p => {
    const pos = plateBlock.unproject(p.u, p.v);
    return {
      x: pos.x !== undefined ? pos.x : depthPos,
      y: pos.y !== undefined ? pos.y : depthPos,
      z: pos.z !== undefined ? pos.z : depthPos
    };
  });

  // Compute centroid
  let cx = 0, cy = 0, cz = 0;
  worldPts.forEach(p => { cx += p.x; cy += p.y; cz += p.z; });
  cx /= worldPts.length; cy /= worldPts.length; cz /= worldPts.length;

  // Store polygon as offsets from centroid (so moving works by updating x,y,z)
  const polyRel = worldPts.map(p => ({
    dx: p.x - cx, dy: p.y - cy, dz: p.z - cz
  }));

  const newObj = mkObj('plate', {
    x: cx, y: cy, z: cz,
    polyPts: polyRel,
    pt: pt,
    normal: normal
  });

  addObj(newObj);
  selected3D = [newObj];
  updatePropsPanel();

  // Reset and stay in draw-plate mode for next plate
  platePts = []; plateBlock = null; plateDimInput = ''; plateDimActive = false;
  requestRender();
}

