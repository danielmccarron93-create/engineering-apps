/**
 * StructDraw v2 · Tools · edit-plate (Fix M)
 * LAYER: tools — provides the click-to-edit handlers for v2 plates that fire
 *        when NO v2 tool is active (i.e., the user is in v1's select-mode
 *        idle state). Lets the user reshape a placed plate without first
 *        having to "select" it.
 *
 *        Three operations (all on pointerdown):
 *          - Vertex hit, no Shift   → start vertex drag (commit on up)
 *          - Vertex hit, Shift held → delete the vertex (if poly stays ≥ 3)
 *          - Edge hit,   Shift held → insert a vertex at the click point
 *
 *        Hit-test is in world-mm with a tolerance derived from a screen
 *        pixel constant (HIT_TOL_PX) so the catch zone is consistent
 *        regardless of zoom or drawing scale.
 *
 * READS:  v2.appState.model (plates); window globals (sheetMode, viewport,
 *           drawingScale) — typeof-guarded.
 * WRITES: v2.tools.editPlate.{state, onPointerDown, onPointerMove,
 *           onPointerUp, hitTestVertex, hitTestEdge}. Mutations to the
 *           model go through `v2.transactions.editElement` + the undo stack
 *           so each user action is one undo entry.
 *
 * RENDER COUPLING: while a drag is in progress, v2.ui.liveRender reads
 *   `editPlate.state.dragging` to draw the modified polygon as a preview.
 *   No transactions fire during the drag — only on pointerup.
 *
 * See PlannedBuilds/architecture-v2/12-plate-fix-plan.md Fix M.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.tools = v2.tools || {};

  /** Screen pixels of slack on the vertex / edge hit-test. */
  const HIT_TOL_PX = 8;

  /** Module-level drag + selection state. Read by live-render for previews. */
  const state = {
    dragging:    null,   // Vertex drag: { elementId, vertexIndex, origVertex, currentVertex, viewKey }
    selectedId:  null,   // Fix O (2026-05-23) — currently-selected plate id
    bodyDrag:    null,   // Fix O — { elementId, origPolygon, anchorWorld:{u,v}, currentDelta:{u,v} }
    rotateDrag:  null,   // Fix O — { elementId, origPolygon, centroid:{x,y}, anchorAngle, currentAngle }
  };

  /** Fix O (2026-05-23) — handle is rendered 30 screen-pixels above the
   *  plate's bounding-box top so it stays a constant visual distance
   *  regardless of zoom. */
  const HANDLE_PIXEL_OFFSET = 30;
  const HANDLE_HIT_PX       = 8;
  const ROTATE_SNAP_DEG     = 15;

  function num(n, dflt) { return (typeof n === 'number' && isFinite(n)) ? n : (dflt === undefined ? 0 : dflt); }

  /** Read Shift state — prefer v1's global if present, fall back to event. */
  function shiftIsHeld(event) {
    if (typeof window !== 'undefined' && typeof window.shiftHeld === 'boolean' && window.shiftHeld) return true;
    if (event && event.shiftKey) return true;
    return false;
  }

  /**
   * Fix N (2026-05-23) — ortho-constrain the cursor to be axis-aligned from
   * `origin`. Used during vertex drag so the polygon edge stays horizontal
   * or vertical by default; the user holds Shift to break the constraint
   * and move at any angle. Mirrors the v1 v25 tool convention (ortho is the
   * default; Shift releases it).
   */
  function applyOrtho(cursorU, cursorV, origin) {
    if (!origin) return { u: cursorU, v: cursorV };
    const du = cursorU - origin.x;
    const dv = cursorV - origin.y;
    if (Math.abs(du) >= Math.abs(dv)) return { u: cursorU, v: origin.y };
    return { u: origin.x, v: cursorV };
  }

  /** Convert HIT_TOL_PX to world-mm at the current zoom / drawing scale. */
  function pxTolMM() {
    const zoom = (typeof viewport !== 'undefined' && viewport && typeof viewport.zoom === 'number')
      ? viewport.zoom : 1;
    const scale = (typeof drawingScale === 'number' && drawingScale) ? drawingScale : 10;
    return HIT_TOL_PX * scale / Math.max(0.001, zoom);
  }

  /** Walk every v2-authoritative plate; fn(el) for each. */
  function eachV2Plate(fn) {
    const model = v2.appState && v2.appState.model;
    if (!model || !(model.elements instanceof Map)) return;
    model.elements.forEach(function (el) {
      if (el && el.category === 'plate' &&
          el.params && el.params.v2Source === 'place-plate-tool') {
        fn(el);
      }
    });
  }

  /** The viewKey a v2 plate belongs to (strips the 'v1-view-' prefix). */
  function plateViewKey(el) {
    const vid = el && el.geometry && el.geometry.viewId;
    if (typeof vid !== 'string') return null;
    const m = /^v1-view-(.+)$/.exec(vid);
    return m ? m[1] : null;
  }

  /**
   * Hit-test plate vertices in the given block's view. Returns the closest
   * vertex within `tol` mm or null. Cursor-friendly: scans every plate's
   * every vertex; picks the closest.
   */
  function hitTestVertex(blk, u, v, tol) {
    if (!blk) return null;
    if (typeof tol !== 'number') tol = pxTolMM();
    let best = null;
    eachV2Plate(function (el) {
      if (plateViewKey(el) !== blk.viewKey) return;
      const poly = el.geometry && el.geometry.polygon;
      if (!Array.isArray(poly)) return;
      for (let i = 0; i < poly.length; i++) {
        const px = num(poly[i].x), py = num(poly[i].y);
        const d = Math.hypot(px - u, py - v);
        if (d < tol && (!best || d < best.dist)) {
          best = { elementId: el.id, vertexIndex: i, vertex: { x: px, y: py }, dist: d };
        }
      }
    });
    return best;
  }

  /**
   * Hit-test plate edges. Returns the closest edge within `tol` mm + the
   * exact point on that edge (for vertex insertion). Excludes vertex hits
   * (vertex catch zone wins — caller checks vertex first).
   */
  function hitTestEdge(blk, u, v, tol) {
    if (!blk) return null;
    if (typeof tol !== 'number') tol = pxTolMM();
    let best = null;
    eachV2Plate(function (el) {
      if (plateViewKey(el) !== blk.viewKey) return;
      const poly = el.geometry && el.geometry.polygon;
      if (!Array.isArray(poly) || poly.length < 3) return;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        const ax = num(a.x), ay = num(a.y);
        const bx = num(b.x), by = num(b.y);
        const dx = bx - ax, dy = by - ay;
        const len2 = dx * dx + dy * dy;
        if (len2 < 1) continue;
        let t = ((u - ax) * dx + (v - ay) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        const px = ax + t * dx, py = ay + t * dy;
        const d = Math.hypot(u - px, v - py);
        if (d < tol && (!best || d < best.dist)) {
          best = { elementId: el.id, edgeIndex: i, point: { x: px, y: py }, t: t, dist: d };
        }
      }
    });
    return best;
  }

  /** Fix O (2026-05-23) — point-in-polygon (ray casting). Used by body
   *  hit-test so a click anywhere inside a plate's outline selects it. */
  function pointInPolygon(u, v, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = num(polygon[i].x), yi = num(polygon[i].y);
      const xj = num(polygon[j].x), yj = num(polygon[j].y);
      const intersect = ((yi > v) !== (yj > v)) &&
                        (u < (xj - xi) * (v - yi) / ((yj - yi) || 1e-9) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  /** Fix O — simple vertex-average centroid (good enough for convex / near-
   *  convex plate polygons; the rotation pivot doesn't have to be perfect). */
  function computeCentroid(polygon) {
    if (!Array.isArray(polygon) || polygon.length === 0) return { x: 0, y: 0 };
    let cx = 0, cy = 0;
    for (const p of polygon) { cx += num(p.x); cy += num(p.y); }
    return { x: cx / polygon.length, y: cy / polygon.length };
  }

  /** Fix O — rotate every polygon vertex around `centroid` by `angleRad`. */
  function rotatePolygon(polygon, centroid, angleRad) {
    const cos = Math.cos(angleRad), sin = Math.sin(angleRad);
    return polygon.map(function (p) {
      const dx = num(p.x) - centroid.x;
      const dy = num(p.y) - centroid.y;
      return {
        x: centroid.x + dx * cos - dy * sin,
        y: centroid.y + dx * sin + dy * cos,
      };
    });
  }

  /** Fix O — translate every polygon vertex by (du, dv). */
  function translatePolygon(polygon, du, dv) {
    return polygon.map(function (p) {
      return { x: num(p.x) + du, y: num(p.y) + dv };
    });
  }

  /** Fix O — body hit-test (point-in-polygon). Returns the topmost matching
   *  plate; iteration order is insertion order so the latest-placed wins
   *  when polygons overlap. */
  function hitTestBody(blk, u, v) {
    if (!blk) return null;
    let best = null;
    eachV2Plate(function (el) {
      if (plateViewKey(el) !== blk.viewKey) return;
      const poly = el.geometry && el.geometry.polygon;
      if (!Array.isArray(poly) || poly.length < 3) return;
      if (pointInPolygon(u, v, poly)) best = { elementId: el.id };
    });
    return best;
  }

  /** Fix O — rotation handle world-coord position for a polygon: 30 screen-
   *  pixels above the bounding-box top, centred on the centroid u. */
  function rotationHandlePos(polygon) {
    if (!Array.isArray(polygon) || polygon.length === 0) return null;
    const zoom = (typeof viewport !== 'undefined' && viewport && typeof viewport.zoom === 'number')
      ? viewport.zoom : 1;
    const scale = (typeof drawingScale === 'number' && drawingScale) ? drawingScale : 10;
    const offsetWorld = HANDLE_PIXEL_OFFSET * scale / Math.max(0.001, zoom);
    let maxV = -Infinity, cx = 0;
    for (const p of polygon) {
      const py = num(p.y);
      if (py > maxV) maxV = py;
      cx += num(p.x);
    }
    cx /= polygon.length;
    return { u: cx, v: maxV + offsetWorld };
  }

  /** Fix O — hit-test the rotation handle (only present when a plate is
   *  selected). Returns the handle hit info or null. */
  function hitTestRotationHandle(blk, u, v) {
    if (!state.selectedId) return null;
    const el = v2.appState && v2.appState.model && v2.appState.model.elements.get(state.selectedId);
    if (!el || !el.geometry || !Array.isArray(el.geometry.polygon)) return null;
    if (plateViewKey(el) !== blk.viewKey) return null;
    const pos = rotationHandlePos(el.geometry.polygon);
    if (!pos) return null;
    const zoom = (typeof viewport !== 'undefined' && viewport && typeof viewport.zoom === 'number')
      ? viewport.zoom : 1;
    const scale = (typeof drawingScale === 'number' && drawingScale) ? drawingScale : 10;
    const tolWorld = HANDLE_HIT_PX * scale / Math.max(0.001, zoom);
    const d = Math.hypot(pos.u - u, pos.v - v);
    return (d <= tolWorld) ? { elementId: state.selectedId, pos: pos } : null;
  }

  /**
   * Build an editElement transaction that swaps the plate's polygon. Pure —
   * caller applies it through v2.engine.undoStack so undo / redo work.
   */
  function buildPolygonEdit(elementId, newPolygon) {
    const model = v2.appState && v2.appState.model;
    if (!model || !(model.elements instanceof Map)) return null;
    const el = model.elements.get(elementId);
    if (!el || !el.geometry) return null;
    const newGeometry = Object.assign({}, el.geometry, { polygon: newPolygon });
    if (!v2.transactions || typeof v2.transactions.editElement !== 'function') return null;
    return v2.transactions.editElement(elementId, { geometry: newGeometry });
  }

  /** Apply a transaction through the undo stack (one entry per user action). */
  function apply(tx) {
    if (!tx) return null;
    if (!v2.engine || !v2.engine.undoStack) return null;
    return v2.engine.undoStack.applyTransaction(tx);
  }

  /* ---- POINTER HANDLERS (called from event-dispatch when no v2 tool active) -------- */

  function onPointerDown(event, ctx) {
    if (event && event.button !== 0) return false;
    if (typeof sheetMode !== 'string' || sheetMode !== '2d') return false;
    const blk = ctx && ctx.blk;
    const cursor = ctx && ctx.cursor;
    if (!blk || !cursor) return false;
    const shift = !!(event && event.shiftKey);

    // Fix O (2026-05-23) — priority 1: rotation handle (only present when a
    // plate is selected). Catches the click before vertex/body checks.
    const rHit = hitTestRotationHandle(blk, cursor.u, cursor.v);
    if (rHit) {
      const el = v2.appState.model.elements.get(rHit.elementId);
      if (el && el.geometry && Array.isArray(el.geometry.polygon)) {
        const centroid = computeCentroid(el.geometry.polygon);
        const anchorAngle = Math.atan2(cursor.v - centroid.y, cursor.u - centroid.x);
        state.rotateDrag = {
          elementId:    rHit.elementId,
          origPolygon:  el.geometry.polygon.slice(),
          centroid:     centroid,
          anchorAngle:  anchorAngle,
          currentAngle: anchorAngle,
        };
        if (ctx.requestRender) ctx.requestRender();
      }
      return true;
    }

    // Priority 2: vertex hit (Fix M behaviour).
    const vHit = hitTestVertex(blk, cursor.u, cursor.v);
    if (vHit) {
      if (shift) {
        // Delete vertex — refuse if it would collapse the polygon to < 3.
        const el = v2.appState.model.elements.get(vHit.elementId);
        if (!el || !el.geometry || !Array.isArray(el.geometry.polygon)) return false;
        if (el.geometry.polygon.length <= 3) return true;   // claim the click so v1 doesn't react
        const next = el.geometry.polygon.filter(function (_, i) { return i !== vHit.vertexIndex; });
        apply(buildPolygonEdit(vHit.elementId, next));
        return true;
      }
      // Fix O — also select the plate so the user sees feedback while dragging.
      state.selectedId = vHit.elementId;
      state.dragging = {
        elementId:     vHit.elementId,
        vertexIndex:   vHit.vertexIndex,
        origVertex:    vHit.vertex,
        currentVertex: { x: vHit.vertex.x, y: vHit.vertex.y },
        viewKey:       blk.viewKey,
      };
      if (ctx.requestRender) ctx.requestRender();
      return true;
    }

    // Priority 3: Shift+edge → insert vertex (Fix M behaviour).
    if (shift) {
      const eHit = hitTestEdge(blk, cursor.u, cursor.v);
      if (eHit) {
        const el = v2.appState.model.elements.get(eHit.elementId);
        if (!el || !el.geometry || !Array.isArray(el.geometry.polygon)) return false;
        const next = el.geometry.polygon.slice();
        next.splice(eHit.edgeIndex + 1, 0, { x: eHit.point.x, y: eHit.point.y });
        apply(buildPolygonEdit(eHit.elementId, next));
        return true;
      }
    }

    // Fix O (2026-05-23) — priority 4: body hit. Click anywhere inside a
    // plate's outline → select it AND start a body drag (move). If the user
    // releases without moving, the plate stays selected; if they drag, the
    // translation commits on pointerup.
    const bHit = hitTestBody(blk, cursor.u, cursor.v);
    if (bHit) {
      const el = v2.appState.model.elements.get(bHit.elementId);
      if (!el || !el.geometry || !Array.isArray(el.geometry.polygon)) return false;
      state.selectedId = bHit.elementId;
      state.bodyDrag = {
        elementId:    bHit.elementId,
        origPolygon:  el.geometry.polygon.slice(),
        anchorWorld:  { u: cursor.u, v: cursor.v },
        currentDelta: { u: 0, v: 0 },
      };
      if (ctx.requestRender) ctx.requestRender();
      return true;
    }

    // Fix O — empty click: deselect, then fall through to v1.
    if (state.selectedId) {
      state.selectedId = null;
      if (ctx.requestRender) ctx.requestRender();
    }
    return false;
  }

  function onPointerMove(event, ctx) {
    const cursor = ctx && ctx.cursor;
    // Fix M/N (vertex drag) — existing.
    if (state.dragging) {
      if (!cursor) return true;
      let uvt = { u: cursor.u, v: cursor.v };
      if (!shiftIsHeld(event)) uvt = applyOrtho(cursor.u, cursor.v, state.dragging.origVertex);
      state.dragging.currentVertex = { x: uvt.u, y: uvt.v };
      if (ctx.requestRender) ctx.requestRender();
      return true;
    }
    // Fix O (2026-05-23) — body drag (move). Ortho-constrained delta unless
    // Shift is held.
    if (state.bodyDrag) {
      if (!cursor) return true;
      let du = cursor.u - state.bodyDrag.anchorWorld.u;
      let dv = cursor.v - state.bodyDrag.anchorWorld.v;
      if (!shiftIsHeld(event)) {
        if (Math.abs(du) >= Math.abs(dv)) dv = 0;
        else du = 0;
      }
      state.bodyDrag.currentDelta = { u: du, v: dv };
      if (ctx.requestRender) ctx.requestRender();
      return true;
    }
    // Fix O — rotate drag. Angle-snap to 15° increments unless Shift is held.
    if (state.rotateDrag) {
      if (!cursor) return true;
      let angle = Math.atan2(cursor.v - state.rotateDrag.centroid.y,
                             cursor.u - state.rotateDrag.centroid.x);
      if (!shiftIsHeld(event)) {
        const SNAP_RAD = ROTATE_SNAP_DEG * Math.PI / 180;
        const delta = angle - state.rotateDrag.anchorAngle;
        angle = state.rotateDrag.anchorAngle + Math.round(delta / SNAP_RAD) * SNAP_RAD;
      }
      state.rotateDrag.currentAngle = angle;
      if (ctx.requestRender) ctx.requestRender();
      return true;
    }
    return false;
  }

  function onPointerUp(event, ctx) {
    const cursor = ctx && ctx.cursor;
    // Fix M/N (vertex drag) commit.
    if (state.dragging) {
      const d = state.dragging;
      state.dragging = null;
      if (!cursor) { if (ctx && ctx.requestRender) ctx.requestRender(); return true; }
      const el = v2.appState && v2.appState.model && v2.appState.model.elements.get(d.elementId);
      if (!el || !el.geometry || !Array.isArray(el.geometry.polygon)) {
        if (ctx && ctx.requestRender) ctx.requestRender();
        return true;
      }
      let uvt = { u: cursor.u, v: cursor.v };
      if (!shiftIsHeld(event)) uvt = applyOrtho(cursor.u, cursor.v, d.origVertex);
      const next = el.geometry.polygon.slice();
      next[d.vertexIndex] = { x: uvt.u, y: uvt.v };
      const moved = Math.hypot(uvt.u - d.origVertex.x, uvt.v - d.origVertex.y) >= 0.5;
      if (moved) apply(buildPolygonEdit(d.elementId, next));
      if (ctx && ctx.requestRender) ctx.requestRender();
      return true;
    }
    // Fix O (2026-05-23) — body drag commit. No commit if the user clicked
    // without dragging (delta < 0.5 mm) — plate stays selected, no undo entry.
    if (state.bodyDrag) {
      const b = state.bodyDrag;
      state.bodyDrag = null;
      if (!cursor) { if (ctx && ctx.requestRender) ctx.requestRender(); return true; }
      let du = cursor.u - b.anchorWorld.u;
      let dv = cursor.v - b.anchorWorld.v;
      if (!shiftIsHeld(event)) {
        if (Math.abs(du) >= Math.abs(dv)) dv = 0;
        else du = 0;
      }
      if (Math.hypot(du, dv) >= 0.5) {
        apply(buildPolygonEdit(b.elementId, translatePolygon(b.origPolygon, du, dv)));
      }
      if (ctx && ctx.requestRender) ctx.requestRender();
      return true;
    }
    // Fix O — rotate drag commit. No commit if angle delta < ~0.1°.
    if (state.rotateDrag) {
      const r = state.rotateDrag;
      state.rotateDrag = null;
      if (!cursor) { if (ctx && ctx.requestRender) ctx.requestRender(); return true; }
      let angle = Math.atan2(cursor.v - r.centroid.y, cursor.u - r.centroid.x);
      if (!shiftIsHeld(event)) {
        const SNAP_RAD = ROTATE_SNAP_DEG * Math.PI / 180;
        const d = angle - r.anchorAngle;
        angle = r.anchorAngle + Math.round(d / SNAP_RAD) * SNAP_RAD;
      }
      const deltaRad = angle - r.anchorAngle;
      if (Math.abs(deltaRad) >= 0.002) {  // ~0.1°
        apply(buildPolygonEdit(r.elementId, rotatePolygon(r.origPolygon, r.centroid, deltaRad)));
      }
      if (ctx && ctx.requestRender) ctx.requestRender();
      return true;
    }
    return false;
  }

  /** Escape cancels an in-flight drag without committing OR deselects. */
  function onKey(event, ctx) {
    if (!event) return false;
    // Esc — cancel any drag first, then deselect.
    if (event.key === 'Escape') {
      if (state.dragging || state.bodyDrag || state.rotateDrag) {
        state.dragging = null; state.bodyDrag = null; state.rotateDrag = null;
        if (ctx && ctx.requestRender) ctx.requestRender();
        return true;
      }
      if (state.selectedId) {
        state.selectedId = null;
        if (ctx && ctx.requestRender) ctx.requestRender();
        return true;
      }
      return false;
    }
    // Fix O (2026-05-23) — Delete/Backspace removes the selected plate.
    if ((event.key === 'Delete' || event.key === 'Backspace') && state.selectedId) {
      const id = state.selectedId;
      state.selectedId = null;
      if (v2.transactions && typeof v2.transactions.deleteElement === 'function') {
        const tx = v2.transactions.deleteElement(id);
        if (tx && v2.engine && v2.engine.undoStack) v2.engine.undoStack.applyTransaction(tx);
      }
      if (ctx && ctx.requestRender) ctx.requestRender();
      return true;
    }
    return false;
  }

  v2.tools.editPlate = {
    state:                state,
    HIT_TOL_PX:           HIT_TOL_PX,
    HANDLE_PIXEL_OFFSET:  HANDLE_PIXEL_OFFSET,
    ROTATE_SNAP_DEG:      ROTATE_SNAP_DEG,
    pxTolMM:              pxTolMM,
    hitTestVertex:        hitTestVertex,
    hitTestEdge:          hitTestEdge,
    hitTestBody:          hitTestBody,                 // Fix O (2026-05-23)
    hitTestRotationHandle:hitTestRotationHandle,       // Fix O
    rotationHandlePos:    rotationHandlePos,           // Fix O
    computeCentroid:      computeCentroid,             // Fix O
    rotatePolygon:        rotatePolygon,               // Fix O
    translatePolygon:     translatePolygon,            // Fix O
    pointInPolygon:       pointInPolygon,              // Fix O
    onPointerDown:        onPointerDown,
    onPointerMove:        onPointerMove,
    onPointerUp:          onPointerUp,
    onKey:                onKey,
  };
})();
