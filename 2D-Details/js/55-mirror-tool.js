'use strict';

// V20 mirror tool
// Extracted from dev/index.html lines 14318-14383 (2026-05-02 modular split)

// MIRROR TOOL (V20)
// ============================================================
// Two clicks define a mirror axis in the active view. All selected 3D
// objects + selected-view 2D entities are mirrored about that axis. 3D
// objects mirror through the view's "u" coordinate (for elevation the X
// axis, for sectionA Z, for planB X) — the unused depth-axis coord is
// preserved. Creates NEW objects rather than mutating in place so the
// originals remain and can be deleted manually if desired.
let mirrorStep = 0;
let mirrorP1 = null;

function _mirrorPoint(u, v, a1, a2) {
  // Mirror (u,v) about the line through (a1.u,a1.v)→(a2.u,a2.v).
  const dx = a2.u - a1.u, dy = a2.v - a1.v;
  const len2 = dx * dx + dy * dy;
  if (len2 < 0.0001) return { u, v };
  const t = ((u - a1.u) * dx + (v - a1.v) * dy) / len2;
  const fx = a1.u + t * dx, fy = a1.v + t * dy;  // foot of perpendicular
  return { u: 2 * fx - u, v: 2 * fy - v };
}

function performMirror(a1, a2, viewKey) {
  const created3D = [];
  for (const obj of selected3D) {
    const p = _dxfProject(obj, viewKey);
    const m = _mirrorPoint(p.u, p.v, a1, a2);
    const newObj = JSON.parse(JSON.stringify(obj));
    delete newObj.id;
    // Map the mirrored (u,v) back to world coords for this view
    if (viewKey === 'elevation') { newObj.x = m.u; newObj.y = m.v; }
    else if (viewKey === 'sectionA') { newObj.z = m.u; newObj.y = m.v; }
    else if (viewKey === 'planB') { newObj.x = m.u; newObj.z = m.v; }
    // Flip length orientation by mirroring rotation (for members the length
    // runs along X by default — mirroring about a vertical axis inverts that)
    if (newObj.rot !== undefined) newObj.rot = 180 - newObj.rot;
    created3D.push(mkObj(newObj.type, { ...newObj }));
  }
  for (const o of created3D) addObj(o);

  // Mirror 2D entities that live in this view
  const list = entities2D[viewKey] || [];
  const selIds = new Set(selected3D.map(s => s.id)); // not strictly needed, but useful for filter
  const toMirror = list.filter(e => !e._ephemeral);  // simple: mirror all 2D ents in view
  // Narrower approach: only mirror entities geometrically close to the selected
  // objects. Skipped for V20 — mirroring all view entities is usually what the
  // user wants when they've already isolated a detail.
  for (const e of toMirror) {
    const copy = JSON.parse(JSON.stringify(e));
    delete copy.id;
    const mirrorUV = ([uKey, vKey]) => {
      if (copy[uKey] === undefined || copy[vKey] === undefined) return;
      const m = _mirrorPoint(copy[uKey], copy[vKey], a1, a2);
      copy[uKey] = m.u; copy[vKey] = m.v;
    };
    ['u1 v1', 'u2 v2', 'u v', 'cu cv', 'anchorU anchorV', 'p1u p1v', 'p2u p2v', 'p3u p3v']
      .forEach(pair => { mirrorUV(pair.split(' ')); });
    if (copy.angle !== undefined) copy.angle = -copy.angle;
    if (copy.polyPts) copy.polyPts.forEach(p => { /* delta-based; no mirror applied */ });
    if (copy.stops) copy.stops = copy.stops.slice().reverse(); // mirror stops order too
    if (copy.pts) copy.pts = copy.pts.map(p => _mirrorPoint(p.u, p.v, a1, a2));
    addEnt2D(mkEnt2D(viewKey, copy.type, copy));
  }
  requestRender();
}

// ============================================================
