'use strict';

// Snap & cursor for a block — snapUV, getCursor, getObjSnapPoints
// Extracted from dev/index.html lines 3684-3851 (2026-05-02 modular split)

// SNAP & CURSOR for a block
// ============================================================

function snapUV(block, u, v) {
  if (!snapOn) return [u, v];
  const tol = 8 * drawingScale / viewport.zoom; // tolerance in real-mm

  // Per-axis edge/face snap (used during draw-plate and draw-member)
  // This lets clicks land exactly on member faces (SHS face, UB flange, etc.)
  // Fix 2 (2026-05-23): v2's PlacePlateTool needs the same per-axis edge
  // snap branch v1's draw-plate gets. v2 doesn't set v1's `tool` global, so
  // we recognise it here. See PlannedBuilds/architecture-v2/12-plate-fix-plan.md.
  const v2PlateActive = !!(window.v2 && v2.engine &&
    typeof v2.engine.activeTool === 'function' &&
    v2.engine.activeTool() && v2.engine.activeTool().id === 'place-plate');
  if (tool === 'draw-plate' || tool === 'draw-member' || v2PlateActive) {
    let bestU = null, bestUDist = tol;
    let bestV = null, bestVDist = tol;
    for (const obj of objects3D) {
      const edges = getSnapEdges(obj, block.viewKey);
      for (const e of edges) {
        if (e.axis === 'u') {
          const d = Math.abs(u - e.value);
          if (d < bestUDist) { bestUDist = d; bestU = e.value; }
        } else {
          const d = Math.abs(v - e.value);
          if (d < bestVDist) { bestVDist = d; bestV = e.value; }
        }
      }
    }
    // Fix J (2026-05-23): in 2D mode, also scan v25 entities (mem2 members
    // drawn in 2D mode, plus v2 plate mirrors injected by the v1-bridge) for
    // axis-aligned snap edges. Without this, v2 plate placement couldn't
    // snap to v25 SHS/UB faces — getSnapEdges only handled objects3D.
    // See PlannedBuilds/architecture-v2/12-plate-fix-plan.md Fix J.
    if (typeof sheetMode === 'string' && sheetMode === '2d' &&
        typeof getV25EntSnapEdges === 'function' &&
        typeof entities2D === 'object' && entities2D) {
      const v25arr = entities2D[block.viewKey] || [];
      for (const ent of v25arr) {
        const edges = getV25EntSnapEdges(ent, block.viewKey);
        for (const e of edges) {
          if (e.axis === 'u') {
            const d = Math.abs(u - e.value);
            if (d < bestUDist) { bestUDist = d; bestU = e.value; }
          } else {
            const d = Math.abs(v - e.value);
            if (d < bestVDist) { bestVDist = d; bestV = e.value; }
          }
        }
      }
    }
    if (bestU !== null) u = bestU;
    if (bestV !== null) v = bestV;
    // If we snapped to at least one axis, return without further snapping
    if (bestU !== null || bestV !== null) {
      // Grid-snap the non-edge-snapped axis
      if (bestU === null) u = Math.round(u / gridSize) * gridSize;
      if (bestV === null) v = Math.round(v / gridSize) * gridSize;
      return [u, v];
    }
  }

  // Snap to 3D object projected positions (point snap)
  for (const obj of objects3D) {
    const snaps = getObjSnapPoints(obj, block);
    for (const s of snaps) {
      if (Math.hypot(u - s[0], v - s[1]) < tol) return [s[0], s[1]];
    }
  }
  // Snap to 2D entities
  for (const ent of entities2D[block.viewKey]) {
    const pts = getEnt2DSnapPoints(ent);
    for (const p of pts) {
      if (Math.hypot(u - p[0], v - p[1]) < tol) return [p[0], p[1]];
    }
  }
  // Grid snap
  return [Math.round(u / gridSize) * gridSize, Math.round(v / gridSize) * gridSize];
}

function getCursor(block) {
  if (!cursorSheet) return [0, 0];
  const real = px2real(block, cursorSheet.px, cursorSheet.py);
  let [u, v] = [real.u, real.v];
  // Ortho constraint. V25 — also accept v25State.dragStart and the last
  // v25State.polyPts vertex as an "origin" so v25 tools (members, lines,
  // anchors, leaders) get the same constraint.
  const v25Origin = (typeof v25State === 'object' && v25State)
    ? (v25State.dragStart ? { u: v25State.dragStart.u, v: v25State.dragStart.v }
      : (v25State.polyPts && v25State.polyPts.length > 0 ? v25State.polyPts[v25State.polyPts.length - 1] : null))
    : null;
  const origin = drawStart ? { u: drawStart.cu, v: drawStart.cv } :
                 platePts.length > 0 ? platePts[platePts.length - 1] :
                 clickPts.length > 0 ? clickPts[clickPts.length - 1] :
                 polyPts.length > 0 ? polyPts[polyPts.length - 1] :
                 v25Origin;
  // For draw-plate: ortho ON by default (hold Shift to break free)
  const plateOrthoForce = (tool === 'draw-plate' && platePts.length > 0);
  // V25 — in 2D mode, ortho/45° is the DEFAULT for v25 draw tools; Shift
  // releases the constraint so the user can free-draw any angle.
  const v25OrthoForce = sheetMode === '2d' && tool && tool.startsWith('v25-')
    && tool !== 'v25-frame' && tool !== 'v25-mat' && tool !== 'v25-wall' && tool !== 'v25-mesh'
    && tool !== 'v25-hatch' && tool !== 'v25-mem'
    && origin === v25Origin && origin;
  if (origin && (orthoOn || shiftHeld || plateOrthoForce || v25OrthoForce)) {
    // For plates: Shift DISABLES ortho (opposite of normal)
    if (plateOrthoForce && shiftHeld) {
      // Free-draw: don't constrain
    } else if (v25OrthoForce && shiftHeld) {
      // V25: Shift bypasses default ortho
    } else {
      [u, v] = constrainUV(u, v, origin.u, origin.v);
    }
  }
  // Polygon-trace tools — once the first vertex has been dropped, the user
  // is typically tracing a curve with rapid clicks, so 10 mm grid snap and
  // endpoint pull both fight the input. Free pointer is the right default.
  // Shift (handled above) gives ortho/45°; Alt restores the snap layer so
  // the user can still grab existing endpoints when they need to.
  const inPolyTrace =
    (tool === 'v25-hatch' && v25State && v25State.polyPts && v25State.polyPts.length > 0) ||
    ((tool === 'draw-hatch' || tool === 'draw-rev-cloud' || tool === 'polyline')
      && polyPts && polyPts.length > 0);
  const altDown = (typeof altHeld !== 'undefined' && altHeld);
  if (inPolyTrace && !altDown) {
    v25SnapInfo = null;
    return [u, v];
  }
  // V25 — endpoint + alignment snap (for v25 draw tools, 2D mode). Runs
  // BEFORE the generic snapUV so it gets first dibs; sets v25SnapInfo for
  // the render loop to draw a marker / alignment guide.
  const v25Snap = (typeof v25TrySnap === 'function')
    ? v25TrySnap(block, u, v, v25Origin && v25Origin.u, v25Origin && v25Origin.v)
    : null;
  if (v25Snap) {
    v25SnapInfo = v25Snap;
    return [v25Snap.u, v25Snap.v];
  } else {
    v25SnapInfo = null;
  }
  [u, v] = snapUV(block, u, v);
  return [u, v];
}

function getObjSnapPoints(obj, block) {
  const pts = [];
  const vk = block.viewKey;

  if (obj.type === 'ub') {
    const s = UB_DB[obj.section]; if (!s) return pts;
    if (vk === 'elevation') {
      const cx = obj.x, cy = obj.y, hl = obj.length / 2, hd = s.d / 2;
      pts.push([cx, cy], [cx-hl, cy+hd], [cx+hl, cy+hd], [cx-hl, cy-hd], [cx+hl, cy-hd], [cx-hl, cy], [cx+hl, cy]);
    } else if (vk === 'sectionA') {
      const cz = obj.z, cy = obj.y, hd = s.d/2, hbf = s.bf/2;
      pts.push([cz, cy], [cz-hbf, cy+hd], [cz+hbf, cy+hd], [cz-hbf, cy-hd], [cz+hbf, cy-hd]);
    } else {
      const cx = obj.x, cz = obj.z, hl = obj.length/2, hbf = s.bf/2;
      pts.push([cx, cz], [cx-hl, cz-hbf], [cx+hl, cz+hbf]);
    }
  } else if (obj.type === 'shs') {
    const s = SHS_DB[obj.section]; if (!s) return pts;
    const hB = s.B/2;
    if (vk === 'elevation') {
      const hl = obj.length/2;
      pts.push([obj.x, obj.y], [obj.x-hl, obj.y+hB], [obj.x+hl, obj.y+hB], [obj.x-hl, obj.y-hB], [obj.x+hl, obj.y-hB]);
    } else if (vk === 'sectionA') {
      pts.push([obj.z, obj.y], [obj.z-hB, obj.y+hB], [obj.z+hB, obj.y+hB], [obj.z-hB, obj.y-hB], [obj.z+hB, obj.y-hB]);
    } else {
      const hl = obj.length/2;
      pts.push([obj.x, obj.z], [obj.x-hl, obj.z-hB], [obj.x+hl, obj.z+hB]);
    }
  } else if (obj.type === 'plate') {
    if (obj.polyPts) {
      // Polygon plate: snap to all vertices + centroid
      const normal = obj.normal || 'z';
      const viewShowsFace = (vk === 'elevation' && normal === 'z') ||
                            (vk === 'sectionA' && normal === 'x') ||
                            (vk === 'planB' && normal === 'y');
      if (viewShowsFace) {
        const projFn = vk === 'elevation' ? (p => [obj.x+p.dx, obj.y+p.dy]) :
                       vk === 'sectionA' ? (p => [obj.z+p.dz, obj.y+p.dy]) :
                       (p => [obj.x+p.dx, obj.z+p.dz]);
        obj.polyPts.forEach(p => pts.push(projFn(p)));
        const cp = vk === 'elevation' ? [obj.x, obj.y] :
                   vk === 'sectionA' ? [obj.z, obj.y] : [obj.x, obj.z];
        pts.push(cp);
      } else {
        const cp = vk === 'elevation' ? [obj.x, obj.y] :
                   vk === 'sectionA' ? [obj.z, obj.y] : [obj.x, obj.z];
        pts.push(cp);
      }
    } else if (vk === 'elevation') {
      pts.push([obj.x, obj.y], [obj.x-obj.pw/2, obj.y+obj.ph/2], [obj.x+obj.pw/2, obj.y+obj.ph/2],
               [obj.x-obj.pw/2, obj.y-obj.ph/2], [obj.x+obj.pw/2, obj.y-obj.ph/2]);
    } else if (vk === 'sectionA') {
      pts.push([obj.z, obj.y]);
    } else {
      pts.push([obj.x, obj.z]);
    }
  } else if (obj.type === 'bolt') {
    if (vk === 'elevation') pts.push([obj.x, obj.y]);
    else if (vk === 'sectionA') pts.push([obj.z, obj.y]);
    else pts.push([obj.x, obj.z]);
  }
  return pts;
}

// ============================================================
