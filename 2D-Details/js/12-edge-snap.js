'use strict';

// Edge snap system — snap dragged edges to member faces with visual indicators
// Extracted from dev/index.html lines 4352-4601 (2026-05-02 modular split)

// EDGE SNAP SYSTEM — snap dragged object edges to member faces
// ============================================================

let activeEdgeSnaps = []; // [{axis:'u'|'v', value: number, label: string}] for visual feedback

// Collect snap edges from a single object for a given view
// Returns arrays of { axis, value, label } where axis is 'u' or 'v'
function getSnapEdges(obj, viewKey) {
  const edges = [];
  // V24.A2 — Frame-aware snap edges for any beam-like member (UB/UC/SHS/
  // PFC/RHS/CHS/EA/UA). For each of the 3 frame directions × ±half-dim, emit
  // a snap line if the face normal projects primarily to one of the view's
  // axes. Handles all 24 orthogonal orientations; any face that points into
  // view depth is skipped (it's not a snap line, it's a surface).
  if (isMemberType(obj.type)) {
    const p = sectionProfile(obj);
    if (!p) return edges;
    const f = memberFrame(obj);
    const hl = (obj.length || 0) / 2;
    const hd = (p.d || 0) / 2;
    const hbf = (p.bf || 0) / 2;
    const B = _viewBasis(viewKey);
    // Member centre projected into view (u, v)
    const cu = (obj.x || 0) * B.u.x + (obj.y || 0) * B.u.y + (obj.z || 0) * B.u.z;
    const cv = (obj.x || 0) * B.v.x + (obj.y || 0) * B.v.y + (obj.z || 0) * B.v.z;
    const typeUpper = obj.type.toUpperCase();
    edges.push({ axis: 'u', value: cu, label: typeUpper + ' centreline' });
    edges.push({ axis: 'v', value: cv, label: typeUpper + ' centreline' });
    // The member's 3 frame directions × their half-extents:
    const dirs = [
      { dir: f.axis,  half: hl,  name: 'end' },
      { dir: f.up,    half: hd,  name: 'face' },
      { dir: f.right, half: hbf, name: 'side' },
    ];
    for (const d of dirs) {
      const nu = d.dir.x * B.u.x + d.dir.y * B.u.y + d.dir.z * B.u.z;
      const nv = d.dir.x * B.v.x + d.dir.y * B.v.y + d.dir.z * B.v.z;
      if (Math.abs(nu) > 0.9) {
        const off = d.half * nu;
        edges.push({ axis: 'u', value: cu + off, label: typeUpper + ' ' + d.name });
        edges.push({ axis: 'u', value: cu - off, label: typeUpper + ' ' + d.name });
      } else if (Math.abs(nv) > 0.9) {
        const off = d.half * nv;
        edges.push({ axis: 'v', value: cv + off, label: typeUpper + ' ' + d.name });
        edges.push({ axis: 'v', value: cv - off, label: typeUpper + ' ' + d.name });
      }
      // Normal along view depth → face is camera-facing; no snap line in this view.
    }
    // UB-specific flange inner faces: still useful for bolt-to-web-face snapping.
    // Only emit when the web is visible in-plane (flange face normal in view).
    if (obj.type === 'ub' && p.tf) {
      const flangeDir = f.up;
      const fu = flangeDir.x * B.u.x + flangeDir.y * B.u.y + flangeDir.z * B.u.z;
      const fv = flangeDir.x * B.v.x + flangeDir.y * B.v.y + flangeDir.z * B.v.z;
      const inner = hd - p.tf;
      if (Math.abs(fu) > 0.9) {
        edges.push({ axis: 'u', value: cu + inner * fu, label: 'UB flange inner' });
        edges.push({ axis: 'u', value: cu - inner * fu, label: 'UB flange inner' });
      } else if (Math.abs(fv) > 0.9) {
        edges.push({ axis: 'v', value: cv + inner * fv, label: 'UB flange inner' });
        edges.push({ axis: 'v', value: cv - inner * fv, label: 'UB flange inner' });
      }
    }
  }
  else if (obj.type === 'plate') {
    if (obj.polyPts) {
      // Polygon plate: snap to bounding box edges + centroid centrelines
      const b = getPolyPlateBounds(obj, viewKey);
      if (b) {
        const cu = (b.u1 + b.u2) / 2, cv = (b.v1 + b.v2) / 2;
        edges.push({ axis: 'u', value: cu, label: 'Plate centreline' });
        edges.push({ axis: 'v', value: cv, label: 'Plate centreline' });
        edges.push({ axis: 'u', value: b.u1, label: 'Plate left' });
        edges.push({ axis: 'u', value: b.u2, label: 'Plate right' });
        edges.push({ axis: 'v', value: b.v1, label: 'Plate bottom' });
        edges.push({ axis: 'v', value: b.v2, label: 'Plate top' });
      }
    } else if (viewKey === 'elevation') {
      edges.push({ axis: 'u', value: obj.x, label: 'Plate centreline' });
      edges.push({ axis: 'v', value: obj.y, label: 'Plate centreline' });
      edges.push({ axis: 'u', value: obj.x - obj.pw/2, label: 'Plate left' });
      edges.push({ axis: 'u', value: obj.x + obj.pw/2, label: 'Plate right' });
      edges.push({ axis: 'v', value: obj.y - obj.ph/2, label: 'Plate bottom' });
      edges.push({ axis: 'v', value: obj.y + obj.ph/2, label: 'Plate top' });
    } else if (viewKey === 'sectionA') {
      edges.push({ axis: 'u', value: obj.z, label: 'Plate centreline' });
      edges.push({ axis: 'v', value: obj.y, label: 'Plate centreline' });
      edges.push({ axis: 'u', value: obj.z - obj.pt/2, label: 'Plate near' });
      edges.push({ axis: 'u', value: obj.z + obj.pt/2, label: 'Plate far' });
      edges.push({ axis: 'v', value: obj.y - obj.ph/2, label: 'Plate bottom' });
      edges.push({ axis: 'v', value: obj.y + obj.ph/2, label: 'Plate top' });
    } else { // planB
      edges.push({ axis: 'u', value: obj.x, label: 'Plate centreline' });
      edges.push({ axis: 'v', value: obj.z, label: 'Plate centreline' });
      edges.push({ axis: 'u', value: obj.x - obj.pw/2, label: 'Plate left' });
      edges.push({ axis: 'u', value: obj.x + obj.pw/2, label: 'Plate right' });
      edges.push({ axis: 'v', value: obj.z - obj.pt/2, label: 'Plate near' });
      edges.push({ axis: 'v', value: obj.z + obj.pt/2, label: 'Plate far' });
    }
  }
  return edges;
}

// Get edges of dragged objects (the edges that should snap TO targets)
function getDraggedEdges(obj, viewKey) {
  // Reuse same function — dragged object's edges are what we check proximity for
  return getSnapEdges(obj, viewKey);
}

// Perform edge snapping on selected objects after raw drag delta is applied.
// Modifies object positions in-place if a snap is found.
// Returns active snap lines for rendering.
// Soft-snap state: tracks the offset between raw mouse position and snapped display position.
// When the user drags past the tolerance, the snap releases smoothly.
let snapOffsetU = 0, snapOffsetV = 0; // accumulated snap correction in real-mm
let snappedAxisU = false, snappedAxisV = false;

function applyEdgeSnap(selectedObjs, viewKey) {
  const tol = 2; // real-world mm — very subtle catch zone
  const breakTol = 3; // mm — barely any resistance to break free
  const snaps = [];

  // Collect all target edges from non-selected objects
  const targetEdges = [];
  objects3D.forEach(obj => {
    if (selectedObjs.includes(obj)) return;
    targetEdges.push(...getSnapEdges(obj, viewKey));
  });
  if (targetEdges.length === 0) {
    snapOffsetU = 0; snapOffsetV = 0;
    snappedAxisU = false; snappedAxisV = false;
    return snaps;
  }

  // For each selected object, get its edges and find closest target
  let bestSnapU = null, bestDistU = Infinity;
  let bestSnapV = null, bestDistV = Infinity;

  selectedObjs.forEach(obj => {
    const myEdges = getDraggedEdges(obj, viewKey);
    myEdges.forEach(me => {
      targetEdges.forEach(te => {
        if (me.axis !== te.axis) return;
        const dist = Math.abs(me.value - te.value);
        if (me.axis === 'u' && dist < bestDistU) {
          bestDistU = dist;
          bestSnapU = { delta: te.value - me.value, target: te, source: me };
        }
        if (me.axis === 'v' && dist < bestDistV) {
          bestDistV = dist;
          bestSnapV = { delta: te.value - me.value, target: te, source: me };
        }
      });
    });
  });

  // V24.A2 — Apply a snap delta in view-local (u or v) back to world (x,y,z).
  // The view basis maps view axes to world vectors. A u-axis snap of magnitude
  // D adds D * B.u to each selected object's world position. Generalises cleanly
  // to all three views and avoids the per-view if/else chain.
  const VB = _viewBasis(viewKey);
  const applyU = (delta) => selectedObjs.forEach(obj => {
    obj.x = (obj.x || 0) + delta * VB.u.x;
    obj.y = (obj.y || 0) + delta * VB.u.y;
    obj.z = (obj.z || 0) + delta * VB.u.z;
  });
  const applyV = (delta) => selectedObjs.forEach(obj => {
    obj.x = (obj.x || 0) + delta * VB.v.x;
    obj.y = (obj.y || 0) + delta * VB.v.y;
    obj.z = (obj.z || 0) + delta * VB.v.z;
  });

  // --- U axis ---
  if (snappedAxisU) {
    snapOffsetU += (bestSnapU ? -bestSnapU.delta : 0);
    if (bestSnapU && bestDistU < breakTol) {
      applyU(bestSnapU.delta);
      snaps.push({ axis: 'u', value: bestSnapU.target.value, label: bestSnapU.target.label });
    } else {
      snappedAxisU = false; snapOffsetU = 0;
    }
  } else {
    if (bestSnapU && bestDistU < tol) {
      applyU(bestSnapU.delta);
      snaps.push({ axis: 'u', value: bestSnapU.target.value, label: bestSnapU.target.label });
      snappedAxisU = true; snapOffsetU = 0;
    }
  }

  // --- V axis ---
  if (snappedAxisV) {
    snapOffsetV += (bestSnapV ? -bestSnapV.delta : 0);
    if (bestSnapV && bestDistV < breakTol) {
      applyV(bestSnapV.delta);
      snaps.push({ axis: 'v', value: bestSnapV.target.value, label: bestSnapV.target.label });
    } else {
      snappedAxisV = false; snapOffsetV = 0;
    }
  } else {
    if (bestSnapV && bestDistV < tol) {
      applyV(bestSnapV.delta);
      snaps.push({ axis: 'v', value: bestSnapV.target.value, label: bestSnapV.target.label });
      snappedAxisV = true; snapOffsetV = 0;
    }
  }

  return snaps;
}

// Draw active edge snap feedback lines
function drawEdgeSnapLines(cs) {
  if (activeEdgeSnaps.length === 0 || !activeBlock) return;
  const selCol = cs.getPropertyValue('--selected-color').trim();
  ctx.strokeStyle = colorAlpha(selCol, 0.25);
  ctx.lineWidth = 0.5;
  ctx.setLineDash(DASH.SNAP);

  activeEdgeSnaps.forEach(snap => {
    if (snap.axis === 'u') {
      // Vertical line at this U coordinate across the block area
      const bbox = getBlockSheetBounds(activeBlock);
      const p1 = real2px(activeBlock, snap.value, 500);
      const p2 = real2px(activeBlock, snap.value, -500);
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    } else {
      // Horizontal line at this V coordinate
      const p1 = real2px(activeBlock, -1000, snap.value);
      const p2 = real2px(activeBlock, 1000, snap.value);
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }
  });

  // Label
  if (activeEdgeSnaps.length > 0) {
    const fs = Math.max(7, sheetLen(2));
    ctx.font = `${fs}px system-ui`;
    ctx.fillStyle = colorAlpha(selCol, 0.7);
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    const snap = activeEdgeSnaps[0];
    const p = snap.axis === 'u'
      ? real2px(activeBlock, snap.value, 0)
      : real2px(activeBlock, 0, snap.value);
    ctx.fillText(snap.label, p.x + 6, p.y - 4);
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
  }

  ctx.setLineDash([]);
}

// ============================================================

// Fix J (2026-05-23) — v25 entity edge-snap helper.
//
// Converts v25Mem2Faces / v25Plate2Faces output (which gives line segments
// with normals) into axis-aligned snap edges with the same {axis, value,
// label} shape getSnapEdges returns. Only emits when the face normal is
// orthogonal to a view axis (|nu|>0.9 or |nv|>0.9) — matches the convention
// getSnapEdges uses for rotated 3D members. Non-ortho rotations get no snap
// from this path (same as v1's getSnapEdges).
//
// Used by snapUV's edge-snap branch when the user is placing a v25 member
// OR a v2 plate. Lets the cursor catch on v25 mem2 faces (SHS/UB flange
// edges drawn in 2D mode) and on v2 plate edges (mirrored into entities2D
// as plate2 by js/v2/engine/v1-bridge.js mirrorV2IntoV1).
function getV25EntSnapEdges(ent, viewKey) {
  if (!ent) return [];
  let faces = [];
  if (ent.type === 'mem2' && ent.aspect !== 'sec' && typeof v25Mem2Faces === 'function') {
    faces = v25Mem2Faces(ent);
  } else if (ent.type === 'plate2' && typeof v25Plate2Faces === 'function') {
    faces = v25Plate2Faces(ent);
  } else if (ent.type === 'mem2' && ent.aspect === 'sec') {
    // Section glyph: emit the web faces (u = centre ± tw/2) and the section
    // depth faces (v = centre ± half-depth) so a cleat / WSP edge snaps to the
    // web face or the top/bottom of a member drawn in section. v25Mem2Faces
    // only handles elevation members, so section members were un-snappable.
    const _tw = (typeof v25BoltMemberWeb === 'function') ? v25BoltMemberWeb(ent)
              : (typeof v25Mem2Thickness === 'function' ? v25Mem2Thickness(ent) : 10);
    const _hd = (typeof v25Mem2HalfDepth === 'function') ? v25Mem2HalfDepth(ent) : 50;
    const _lbl = ent.memberType ? ent.memberType.toUpperCase() : 'MEM';
    return [
      { axis: 'u', value: ent.u - _tw / 2, label: _lbl + ' web' },
      { axis: 'u', value: ent.u + _tw / 2, label: _lbl + ' web' },
      { axis: 'v', value: ent.v - _hd,     label: _lbl + ' face' },
      { axis: 'v', value: ent.v + _hd,     label: _lbl + ' face' },
    ];
  } else {
    return [];
  }
  const edges = [];
  const typeLabel = ent.memberType
    ? ent.memberType.toUpperCase()
    : (ent.type === 'plate2' ? 'PLATE' : 'MEM');
  for (const f of faces) {
    if (Math.abs(f.nu) > 0.9) {
      // u-aligned face (normal points along view-u axis) — snap to its u value.
      edges.push({ axis: 'u', value: f.u1, label: typeLabel + ' ' + f.side });
    } else if (Math.abs(f.nv) > 0.9) {
      // v-aligned face — snap to its v value.
      edges.push({ axis: 'v', value: f.v1, label: typeLabel + ' ' + f.side });
    }
    // Non-ortho faces (skewed members) are skipped — the axis-aligned snap
    // model doesn't apply. Same scope as v1's getSnapEdges.
  }
  return edges;
}

// ============================================================
