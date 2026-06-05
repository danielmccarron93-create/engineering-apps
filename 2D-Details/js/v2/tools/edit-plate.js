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

  /** Screen pixels of slack on the vertex / edge hit-test. Generous so a plate
   *  corner is easy to grab for resize and an edge easy to hit for select —
   *  the body interior is point-in-polygon (whole plate), so this only governs
   *  the vertex/edge catch zones. (plate-usability pass) */
  const HIT_TOL_PX = 13;

  /** Module-level drag + selection state. Read by live-render for previews. */
  const state = {
    dragging:    null,   // Vertex drag: { elementId, vertexIndex, origVertex, currentVertex, viewKey }
    selectedId:  null,   // Fix O (2026-05-23) — currently-selected plate id
    bodyDrag:    null,   // Fix O / plate-orientation-presets — { elementId, origPolygon, anchorWorld:{u,v}, currentDelta:{u,v}, orthoAxis:'u'|'v'|null, snapLines:[{axis,value,label}]|null }
    rotateDrag:  null,   // Fix O — { elementId, origPolygon, centroid:{x,y}, anchorAngle, currentAngle }
    edgeDrag:    null,   // plate corner-resize — corner mode {elementId,mode:'corner',viI,nAI,nBI,O,eu,ev,origVi,anchorWorld,cur} or vertex fallback {…,mode:'vertex',viI,origVi,…}. Grabbed corner follows the cursor, opposite fixed, stays rectangular (resizes both dims). cur = [{i,x,y}] vertices to set (written each move).
  };

  /** Fix O (2026-05-23) — handle is rendered 30 screen-pixels above the
   *  plate's bounding-box top so it stays a constant visual distance
   *  regardless of zoom. */
  const HANDLE_PIXEL_OFFSET = 30;
  const HANDLE_HIT_PX       = 12;
  const ROTATE_SNAP_DEG     = 15;

  function num(n, dflt) { return (typeof n === 'number' && isFinite(n)) ? n : (dflt === undefined ? 0 : dflt); }

  /** Corner-resize math (plate corner drag). Given the edgeDrag state `ed` and a
   *  drag delta (du,dv), return the polygon vertices to set: for a 'corner' drag
   *  the grabbed corner follows the cursor while the opposite corner (O) stays
   *  fixed and the two neighbours track along the plate's edge axes (eu,ev) — so
   *  the plate resizes in BOTH width and height yet stays rectangular. For the
   *  'vertex' fallback (non-quad) it just moves the grabbed vertex. */
  function plateResizeCorners(ed, du, dv) {
    const cx = ed.origVi.x + du, cy = ed.origVi.y + dv;
    if (ed.mode !== 'corner') return [{ i: ed.viI, x: cx, y: cy }];
    const ocx = cx - ed.O.x, ocy = cy - ed.O.y;
    const a = ocx * ed.eu.x + ocy * ed.eu.y;   // extent along edge axis eu
    const b = ocx * ed.ev.x + ocy * ed.ev.y;   // extent along edge axis ev
    return [
      { i: ed.viI, x: ed.O.x + a * ed.eu.x + b * ed.ev.x, y: ed.O.y + a * ed.eu.y + b * ed.ev.y },
      { i: ed.nAI, x: ed.O.x + a * ed.eu.x,                y: ed.O.y + a * ed.eu.y },
      { i: ed.nBI, x: ed.O.x + b * ed.ev.x,                y: ed.O.y + b * ed.ev.y },
    ];
  }

  /** Read Shift state — prefer v1's global if present, fall back to event. */
  function shiftIsHeld(event) {
    if (typeof window !== 'undefined' && typeof window.shiftHeld === 'boolean' && window.shiftHeld) return true;
    if (event && event.shiftKey) return true;
    return false;
  }

  /** plate-orientation-presets — 2D-only render during a live drag. Calls v1's
   *  requestRender (canvas only) WITHOUT v3dMarkDirty, so the Three.js engine
   *  is not re-rendered on every mouse-move while nudging a 2D plate. The full
   *  ctx.requestRender() (which marks 3D dirty once) still fires on the
   *  pointerup commit and on selection changes in onPointerDown. */
  function render2D() {
    if (typeof requestRender === 'function') requestRender();
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

  /** Axis-aligned bounding box of a polygon → {L,R,B,T} or null. */
  function polyBBox(polygon) {
    if (!Array.isArray(polygon) || polygon.length === 0) return null;
    let L = Infinity, R = -Infinity, B = Infinity, T = -Infinity;
    for (const p of polygon) {
      const px = num(p.x), py = num(p.y);
      if (px < L) L = px;
      if (px > R) R = px;
      if (py < B) B = py;
      if (py > T) T = py;
    }
    return { L: L, R: R, B: B, T: T };
  }

  /**
   * plate-orientation-presets — soft snap of the dragged plate to nearby
   * member faces / other plate edges / projected 3D members. Pure helper used
   * by the free-move path (Shift disables it). Returns { du, dv, lines } where
   * lines is an array of {axis:'u'|'v', value:Number, label:String} for the
   * snap guides. Every global it reaches for (entities2D, getV25EntSnapEdges,
   * getSnapEdges, objects3D, viewport, drawingScale) is typeof-guarded so a
   * missing global never throws — same convention as the rest of this file.
   */
  function computeBodySnap(origPolygon, du, dv, blk) {
    const lines = [];
    if (!blk || !Array.isArray(origPolygon)) return { du: du, dv: dv, lines: lines };
    // Source edges = bbox of the polygon at the raw (du,dv) position.
    const bb = polyBBox(translatePolygon(origPolygon, du, dv));
    if (!bb) return { du: du, dv: dv, lines: lines };
    const srcU = [bb.L, (bb.L + bb.R) / 2, bb.R];
    const srcV = [bb.B, (bb.B + bb.T) / 2, bb.T];

    // Collect target edges {axis,value,label} from everything in this view.
    const targets = [];
    const viewKey = blk.viewKey;
    // (a) v25 members drawn in 2D (UB web/flange faces + centrelines).
    if (typeof entities2D !== 'undefined' && entities2D &&
        typeof getV25EntSnapEdges === 'function') {
      const ents = entities2D[viewKey];
      if (Array.isArray(ents)) {
        for (const e of ents) {
          if (e && e.type === 'mem2') {
            const es = getV25EntSnapEdges(e, viewKey);
            if (Array.isArray(es)) for (const s of es) targets.push(s);
          }
        }
      }
    }
    // (b) other v2 plates → their bbox edges.
    const selfId = state.bodyDrag && state.bodyDrag.elementId;
    eachV2Plate(function (el) {
      if (el.id === selfId) return;
      if (plateViewKey(el) !== viewKey) return;
      const ob = polyBBox(el.geometry && el.geometry.polygon);
      if (!ob) return;
      targets.push({ axis: 'u', value: ob.L,             label: 'Plate edge' });
      targets.push({ axis: 'u', value: (ob.L + ob.R) / 2, label: 'Plate edge' });
      targets.push({ axis: 'u', value: ob.R,             label: 'Plate edge' });
      targets.push({ axis: 'v', value: ob.B,             label: 'Plate edge' });
      targets.push({ axis: 'v', value: (ob.B + ob.T) / 2, label: 'Plate edge' });
      targets.push({ axis: 'v', value: ob.T,             label: 'Plate edge' });
    });
    // (c) defensive — projected 3D members.
    if (typeof objects3D !== 'undefined' && objects3D && objects3D.length &&
        typeof getSnapEdges === 'function') {
      for (const obj of objects3D) {
        const es = getSnapEdges(obj, viewKey);
        if (Array.isArray(es)) for (const s of es) targets.push(s);
      }
    }
    if (targets.length === 0) return { du: du, dv: dv, lines: lines };

    // Tolerance: ~10 screen-px → world-mm, zoom-independent (mirrors pxTolMM
    // with a 10-px constant so the soft-snap catch zone is the same on screen
    // at any zoom / drawing scale).
    const zoom = (typeof viewport !== 'undefined' && viewport && typeof viewport.zoom === 'number')
      ? viewport.zoom : 1;
    const scale = (typeof drawingScale === 'number' && drawingScale) ? drawingScale : 10;
    const tolMM = 10 * scale / Math.max(0.001, zoom);

    // Per axis: closest source-target pair; if within tol, nudge that axis.
    let bestU = null, bestUd = Infinity;
    let bestV = null, bestVd = Infinity;
    for (const t of targets) {
      if (t.axis === 'u') {
        for (const s of srcU) {
          const d = Math.abs(s - t.value);
          if (d < bestUd) { bestUd = d; bestU = { src: s, target: t }; }
        }
      } else if (t.axis === 'v') {
        for (const s of srcV) {
          const d = Math.abs(s - t.value);
          if (d < bestVd) { bestVd = d; bestV = { src: s, target: t }; }
        }
      }
    }
    if (bestU && bestUd < tolMM) {
      du += (bestU.target.value - bestU.src);
      lines.push({ axis: 'u', value: bestU.target.value, label: bestU.target.label });
    }
    if (bestV && bestVd < tolMM) {
      dv += (bestV.target.value - bestV.src);
      lines.push({ axis: 'v', value: bestV.target.value, label: bestV.target.label });
    }
    return { du: du, dv: dv, lines: lines };
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

  /** Bluebeam copy-drag: place an independent copy of a plate element at the
   *  same polygon and return the new id (or null). The copy carries no group
   *  (it is a fresh standalone plate). The placeElement transaction records its
   *  own undo entry; the subsequent body-move commit is a second entry, so a
   *  copy-drag is two Ctrl+Z to fully undo (noted in the planning folder). */
  function duplicatePlateElement(srcId) {
    const model = v2.appState && v2.appState.model;
    if (!model || !model.elements || typeof model.elements.get !== 'function') return null;
    const src = model.elements.get(srcId);
    if (!src || !src.geometry || !Array.isArray(src.geometry.polygon)) return null;
    if (!v2.transactions || typeof v2.transactions.placeElement !== 'function') return null;
    const params = Object.assign({}, src.params || {});
    delete params.groupId;   // a copy is an independent plate, not part of the source's group
    const polygon = src.geometry.polygon.map(function (p) { return { x: num(p.x), y: num(p.y) }; });
    const geometry = (v2.model && typeof v2.model.region === 'function')
      ? v2.model.region({ viewId: src.geometry.viewId, polygon: polygon })
      : { kind: 'region', viewId: src.geometry.viewId, polygon: polygon };
    const tx = v2.transactions.placeElement({
      category:   src.category,
      family:     src.family,
      type:       src.type,
      geometry:   geometry,
      materialId: src.materialId,
      params:     params,
    });
    apply(tx);
    return (tx && tx.data && tx.data.element && tx.data.element.id) || null;
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
        // plate-grouping-stiffener — if this plate is grouped, snapshot the
        // mates so they rotate rigidly about the plate centroid with it.
        if (typeof window.v25GroupOnPlateRotateBegin === 'function') window.v25GroupOnPlateRotateBegin(rHit.elementId, centroid);
        if (typeof window.v25GroupOnPlateMoveUndoBegin === 'function') window.v25GroupOnPlateMoveUndoBegin(rHit.elementId);
        if (ctx.requestRender) ctx.requestRender();
      }
      return true;
    }

    // Priority 2: Shift+click → MULTI-SELECT toggle (for grouping several plates,
    // matching how v25 members Shift-add). A Shift click anywhere ON a plate
    // (corner / edge / body) adds it to — or removes it from — the co-selection
    // set; it never drags. This replaces the old Shift+corner=delete /
    // Shift+edge=insert vertex edits, which collided with multi-select on thin
    // plates (a Shift click on a thin plate always lands within edge tolerance).
    if (shift) {
      const sHit = hitTestVertex(blk, cursor.u, cursor.v) ||
                   hitTestEdge(blk, cursor.u, cursor.v) ||
                   hitTestBody(blk, cursor.u, cursor.v);
      if (sHit && sHit.elementId != null) {
        if (!Array.isArray(window.v25SelPlateIds)) window.v25SelPlateIds = [];
        const _i = window.v25SelPlateIds.indexOf(sHit.elementId);
        if (_i >= 0) window.v25SelPlateIds.splice(_i, 1);   // toggle off
        else window.v25SelPlateIds.push(sHit.elementId);    // toggle on
        state.selectedId = sHit.elementId;
        if (ctx.requestRender) ctx.requestRender();
        return true;
      }
      // Shift but no plate hit → let v1 handle it (Shift-adding a v25 member);
      // do NOT clear the plate co-selection.
      return false;
    }

    // ---- from here everything is a PLAIN (no-Shift) grab ----

    // Priority 3: CORNER (vertex) grab → RESIZE the rectangle from this corner,
    // so the plate gets taller AND/OR wider. The grabbed corner follows the
    // cursor, the diagonally-opposite corner stays fixed, and the two adjacent
    // corners track so the plate stays rectangular in its own edge axes (works
    // for rotated plates too). Non-quad polygons fall back to moving the single
    // grabbed vertex.
    const vHit = hitTestVertex(blk, cursor.u, cursor.v);
    if (vHit) {
      const el = v2.appState.model.elements.get(vHit.elementId);
      if (!el || !el.geometry || !Array.isArray(el.geometry.polygon) || el.geometry.polygon.length < 3) return false;
      const poly = el.geometry.polygon;
      const n = poly.length;
      const vi = vHit.vertexIndex;
      state.selectedId = vHit.elementId;
      window.v25SelPlateIds = [vHit.elementId];
      if (n === 4) {
        const oppI = (vi + 2) % 4, nAI = (vi + 1) % 4, nBI = (vi + 3) % 4;
        const O = { x: num(poly[oppI].x), y: num(poly[oppI].y) };
        const eux = num(poly[nAI].x) - O.x, euy = num(poly[nAI].y) - O.y;
        const evx = num(poly[nBI].x) - O.x, evy = num(poly[nBI].y) - O.y;
        const eul = Math.hypot(eux, euy) || 1, evl = Math.hypot(evx, evy) || 1;
        state.edgeDrag = {
          elementId:   vHit.elementId, mode: 'corner',
          viI: vi, nAI: nAI, nBI: nBI,
          O: O, eu: { x: eux / eul, y: euy / eul }, ev: { x: evx / evl, y: evy / evl },
          origVi: { x: num(poly[vi].x), y: num(poly[vi].y) },
          anchorWorld: { u: cursor.u, v: cursor.v }, cur: null,
        };
      } else {
        state.edgeDrag = {
          elementId: vHit.elementId, mode: 'vertex', viI: vi,
          origVi: { x: num(poly[vi].x), y: num(poly[vi].y) },
          anchorWorld: { u: cursor.u, v: cursor.v }, cur: null,
        };
      }
      if (ctx.requestRender) ctx.requestRender();
      return true;
    }

    // Priority 4 (SELECTION-PRECISION, 2026-06): a plain body / non-corner-edge
    // click is NO LONGER claimed here. It used to select+arm a body drag, which
    // made the plate always win over a screw / small entity drawn on top of it
    // (the v2 capture-phase pointerdown suppressed v1 entirely). Now we DEFER to
    // v1's ranked hit-stack (js/71 v25HitTestStack): v1 decides plate-vs-screw-
    // vs-timber by specificity, and when the PLATE wins it calls back into
    // beginBodyDragFromExternalSelect (below) to arm the very same body drag.
    // Returning false here lets the compatibility mousedown reach v1 (the v2
    // dispatcher only stops propagation when a handler CLAIMS). Priorities 1-3
    // (rotation handle, Shift multi-select, corner resize) still claim above.
    //
    // We DO NOT select, DO NOT arm state.bodyDrag, DO NOT set v25SelPlateIds, and
    // DO NOT clear them here — clearing is now v1's job (empty-space + v1-entity-
    // wins both clear the plate co-selection in js/39). Just fall through.
    return false;
  }

  /* ---- external body-drag arm (SELECTION-PRECISION) -----------------------------
   * Called by v1 (js/39-events.js mousedown) AFTER its ranked hit-stack decided a
   * v2 plate is the tightest target under the cursor. Selects the plate and arms
   * the SAME state.bodyDrag the old priority-4 path armed, so the subsequent
   * capture-phase pointermove / pointerup (still routed to editPlate while a v1
   * 'select' tool is active) drive the move + commit + group/undo unchanged.
   *   elementId    — the v2 plate element id (NOT the 'v2plate-' synthetic).
   *   cursorWorld  — { u, v } the click landed at (the drag anchor).
   *   dupModifier  — true to start an Alt/Ctrl copy-drag (clone on first move).
   * Mirrors the body of the retired priority-4 block. */
  function beginBodyDragFromExternalSelect(elementId, cursorWorld, dupModifier) {
    const model = v2.appState && v2.appState.model;
    if (!model || !model.elements || typeof model.elements.get !== 'function') return false;
    const el = model.elements.get(elementId);
    if (!el || !el.geometry || !Array.isArray(el.geometry.polygon)) return false;
    const cw = cursorWorld || { u: 0, v: 0 };
    state.selectedId = elementId;
    window.v25SelPlateIds = [elementId];
    state.bodyDrag = {
      elementId:    elementId,
      origPolygon:  el.geometry.polygon.slice(),
      anchorWorld:  { u: cw.u, v: cw.v },
      currentDelta: { u: 0, v: 0 },
      orthoAxis:    null,
      snapLines:    null,
      dupPending:   !!dupModifier,
    };
    // plate-grouping-stiffener — a grouped plate drags its v25 mates. Skipped
    // while duplicating (the copy is a fresh independent plate).
    if (!dupModifier) {
      if (typeof window.v25GroupOnPlateSelected === 'function') window.v25GroupOnPlateSelected(elementId);
      if (typeof window.v25GroupOnPlateDragBegin === 'function') window.v25GroupOnPlateDragBegin(elementId);
      if (typeof window.v25GroupOnPlateMoveUndoBegin === 'function') window.v25GroupOnPlateMoveUndoBegin(elementId);
    }
    if (typeof requestRender === 'function') requestRender();
    return true;
  }

  function onPointerMove(event, ctx) {
    const cursor = ctx && ctx.cursor;
    // Fix M/N (vertex drag) — existing.
    if (state.dragging) {
      if (!cursor) return true;
      let uvt = { u: cursor.u, v: cursor.v };
      if (!shiftIsHeld(event)) uvt = applyOrtho(cursor.u, cursor.v, state.dragging.origVertex);
      state.dragging.currentVertex = { x: uvt.u, y: uvt.v };
      render2D();   // plate-orientation-presets — 2D-only render mid-drag
      return true;
    }
    // plate corner-resize — recompute the moving corners from the cursor delta
    // (grabbed corner follows cursor, opposite fixed, stays rectangular).
    if (state.edgeDrag) {
      if (!cursor) return true;
      const ed = state.edgeDrag;
      ed.cur = plateResizeCorners(ed, cursor.u - ed.anchorWorld.u, cursor.v - ed.anchorWorld.v);
      render2D();
      return true;
    }
    // plate-orientation-presets — body drag (move). FREE by default; Shift
    // locks to one axis (the inverse of the old behaviour). Free moves run a
    // soft snap to nearby member faces / plate edges; Shift moves show a
    // dotted ortho guide instead. 2D-only render (render2D) so the 3D engine
    // isn't re-rendered every mouse-move.
    if (state.bodyDrag) {
      if (!cursor) return true;
      // Bluebeam copy-drag: the first real movement clones the plate and drags
      // the COPY (the original stays put). placeElement mints a fresh standalone
      // element; we re-point bodyDrag at it so live-render previews the copy.
      if (state.bodyDrag.dupPending) {
        const movedEnough = Math.hypot(cursor.u - state.bodyDrag.anchorWorld.u,
                                       cursor.v - state.bodyDrag.anchorWorld.v) >= 0.5;
        if (!movedEnough) return true;   // wait for real movement; don't preview-move the original
        state.bodyDrag.dupPending = false;
        const cloneId = duplicatePlateElement(state.bodyDrag.elementId);
        if (cloneId) {
          state.bodyDrag.elementId = cloneId;
          state.selectedId = cloneId;
          window.v25SelPlateIds = [cloneId];
        }
      }
      let du = cursor.u - state.bodyDrag.anchorWorld.u;
      let dv = cursor.v - state.bodyDrag.anchorWorld.v;
      if (shiftIsHeld(event)) {
        if (Math.abs(du) >= Math.abs(dv)) { dv = 0; state.bodyDrag.orthoAxis = 'u'; }
        else                              { du = 0; state.bodyDrag.orthoAxis = 'v'; }
        state.bodyDrag.snapLines = null;
      } else {
        const snap = computeBodySnap(state.bodyDrag.origPolygon, du, dv, ctx && ctx.blk);
        du = snap.du; dv = snap.dv;
        state.bodyDrag.snapLines = snap.lines;
        state.bodyDrag.orthoAxis = null;
      }
      state.bodyDrag.currentDelta = { u: du, v: dv };
      // plate-grouping-stiffener — translate the grouped v25 mates live so the
      // whole assembly previews together while the plate is dragged.
      if (typeof window.v25GroupOnPlateDragMove === 'function') window.v25GroupOnPlateDragMove(state.bodyDrag.elementId, du, dv);
      render2D();
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
      // plate-grouping-stiffener — rotate grouped mates live so the whole
      // assembly previews turning together.
      if (typeof window.v25GroupOnPlateRotateMove === 'function') window.v25GroupOnPlateRotateMove(state.rotateDrag.elementId, angle - state.rotateDrag.anchorAngle);
      render2D();   // plate-orientation-presets — 2D-only render mid-drag
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
    // plate corner-resize commit. Dragged ≥0.5 mm → set the recomputed corner(s);
    // a sub-threshold release → just select (no undo entry).
    if (state.edgeDrag) {
      const ed = state.edgeDrag;
      state.edgeDrag = null;
      if (!cursor) { if (ctx && ctx.requestRender) ctx.requestRender(); return true; }
      const el = v2.appState && v2.appState.model && v2.appState.model.elements.get(ed.elementId);
      if (!el || !el.geometry || !Array.isArray(el.geometry.polygon)) {
        if (ctx && ctx.requestRender) ctx.requestRender();
        return true;
      }
      const du = cursor.u - ed.anchorWorld.u, dv = cursor.v - ed.anchorWorld.v;
      if (Math.hypot(du, dv) >= 0.5) {
        const next = el.geometry.polygon.slice();
        plateResizeCorners(ed, du, dv).forEach(function (vtx) {
          if (vtx.i >= 0 && vtx.i < next.length) next[vtx.i] = { x: vtx.x, y: vtx.y };
        });
        apply(buildPolygonEdit(ed.elementId, next));
      }
      if (ctx && ctx.requestRender) ctx.requestRender();
      return true;
    }
    // plate-orientation-presets — body drag commit. Applies the SAME
    // free+snap (no Shift) OR Shift+ortho logic as onPointerMove so the
    // committed translation equals the preview. No commit if the user clicked
    // without dragging (delta < 0.5 mm) — plate stays selected, no undo entry.
    if (state.bodyDrag) {
      const b = state.bodyDrag;
      if (!cursor) { state.bodyDrag = null; if (ctx && ctx.requestRender) ctx.requestRender(); return true; }
      let du = cursor.u - b.anchorWorld.u;
      let dv = cursor.v - b.anchorWorld.v;
      if (shiftIsHeld(event)) {
        if (Math.abs(du) >= Math.abs(dv)) dv = 0;
        else du = 0;
      } else {
        // computeBodySnap reads state.bodyDrag.elementId for the self-exclude,
        // so run it BEFORE clearing state.bodyDrag below.
        const snap = computeBodySnap(b.origPolygon, du, dv, ctx && ctx.blk);
        du = snap.du; dv = snap.dv;
      }
      state.bodyDrag = null;
      // plate-grouping-stiffener — a GROUPED plate's move joins the v25Move group
      // undo (js/72f): direct-mutate the dragged plate (NO v2 transaction) so the
      // whole assembly reverts on one Ctrl+Z. A non-grouped plate keeps the
      // v2-authoritative transaction path, byte-identical to before.
      var _pel = v2.appState && v2.appState.model && v2.appState.model.elements.get(b.elementId);
      var _gid = _pel && _pel.params && _pel.params.groupId;
      if (Math.hypot(du, dv) >= 0.5) {
        if (_gid) {
          if (_pel && _pel.geometry) _pel.geometry = Object.assign({}, _pel.geometry, { polygon: translatePolygon(b.origPolygon, du, dv) });
        } else {
          apply(buildPolygonEdit(b.elementId, translatePolygon(b.origPolygon, du, dv)));
        }
      }
      // plate-grouping-stiffener — commit the grouped v25 mates to the same
      // final delta (they were moved directly during the drag preview).
      if (typeof window.v25GroupOnPlateDragEnd === 'function') window.v25GroupOnPlateDragEnd(b.elementId, du, dv);
      // plate-grouping-stiffener — if the dropped plate is in a group, snap the
      // assembly flush to a beam flange and register the (default-bare) joint.
      // Capture the v1 undo depth FIRST so the single v25Move can strip the
      // {act:'addEnt2D'} markers the joint-snap pushes.
      var _undoDepth = (typeof undoStack !== 'undefined' && Array.isArray(undoStack)) ? undoStack.length : 0;
      if (_gid && typeof window.v25JointSnapGroupToFlange === 'function') window.v25JointSnapGroupToFlange(_gid);
      // Record the whole grouped move as ONE v25Move undo (no-op if not grouped).
      if (typeof window.v25GroupOnPlateMoveUndoCommit === 'function') window.v25GroupOnPlateMoveUndoCommit(b.elementId, _undoDepth);
      // The grouped dragged plate was direct-mutated (no transaction emit), so
      // refresh the mirror/render explicitly (matches translateMates in js/72f).
      if (_gid && window.v2 && v2.engine && v2.engine.dirtyBus && typeof v2.engine.dirtyBus.emit === 'function') v2.engine.dirtyBus.emit('model-changed');
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
      // plate-grouping-stiffener — a GROUPED plate's rotate joins the v25Move
      // group undo: direct-mutate the dragged plate (NO v2 transaction) so the
      // whole assembly reverts on one Ctrl+Z. Non-grouped keeps the v2 path.
      var _rel = v2.appState && v2.appState.model && v2.appState.model.elements.get(r.elementId);
      var _rgid = _rel && _rel.params && _rel.params.groupId;
      if (Math.abs(deltaRad) >= 0.002) {  // ~0.1°
        if (_rgid) {
          if (_rel && _rel.geometry) _rel.geometry = Object.assign({}, _rel.geometry, { polygon: rotatePolygon(r.origPolygon, r.centroid, deltaRad) });
        } else {
          apply(buildPolygonEdit(r.elementId, rotatePolygon(r.origPolygon, r.centroid, deltaRad)));
        }
      }
      // plate-grouping-stiffener — settle the grouped mates at the same final
      // rotation (they were rotated live during the preview).
      if (typeof window.v25GroupOnPlateRotateEnd === 'function') window.v25GroupOnPlateRotateEnd(r.elementId, deltaRad);
      // Record the whole grouped rotate as ONE v25Move undo. No joint-snap on the
      // rotate path → pass the current depth so the addEnt2D strip is a no-op.
      if (typeof window.v25GroupOnPlateMoveUndoCommit === 'function') {
        var _rd = (typeof undoStack !== 'undefined' && Array.isArray(undoStack)) ? undoStack.length : 0;
        window.v25GroupOnPlateMoveUndoCommit(r.elementId, _rd);
      }
      // Grouped dragged plate was direct-mutated (no transaction emit) — refresh.
      if (_rgid && window.v2 && v2.engine && v2.engine.dirtyBus && typeof v2.engine.dirtyBus.emit === 'function') v2.engine.dirtyBus.emit('model-changed');
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
      if (state.dragging || state.bodyDrag || state.rotateDrag || state.edgeDrag) {
        // plate-grouping-stiffener — restore grouped mates to their pre-drag
        // pose so a cancelled rotate / move doesn't desync the group.
        if (state.rotateDrag && typeof window.v25GroupOnPlateRotateCancel === 'function') window.v25GroupOnPlateRotateCancel();
        if (state.bodyDrag && typeof window.v25GroupOnPlateDragCancel === 'function') window.v25GroupOnPlateDragCancel();
        // Drop any stashed grouped-move undo snapshot (cancelled → no undo entry).
        if (typeof window.v25GroupOnPlateMoveUndoBegin === 'function') window.v25GroupOnPlateMoveUndoBegin(null);
        state.dragging = null; state.bodyDrag = null; state.rotateDrag = null; state.edgeDrag = null;
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

  /**
   * plate-marquee-fix (2026-06-01) — select a v2 plate enclosed by (window) or
   * touched by (crossing) the v1 marquee box. v1's marquee in js/39-events.js
   * iterates entities2D only, so it cannot see v2 plates (they live in
   * v2.appState.model); it calls this AFTER its own pass. The edit-plate tool
   * holds a single selection, so when several plates fall in the box we keep
   * the topmost (last in insertion order — the same tie-break hitTestBody uses).
   * Sets state.selectedId exactly like a single-click select. Returns the
   * selected plate id, or null when none matched.
   * @param {object} blk       v1 active block
   * @param {{L:number,R:number,B:number,T:number}} rect  marquee bounds (L<R, B<T)
   * @param {boolean} crossing true = touch (R→L drag); false = full-enclose (L→R)
   * @param {boolean} additive true = keep the current selection when nothing new is hit
   */
  function selectInRect(blk, rect, crossing, additive) {
    if (!blk || !rect) return null;
    const ids = [];
    eachV2Plate(function (el) {
      if (plateViewKey(el) !== blk.viewKey) return;
      const bb = polyBBox(el.geometry && el.geometry.polygon);
      if (!bb) return;
      const inside = crossing
        ? (bb.L <= rect.R && bb.R >= rect.L && bb.B <= rect.T && bb.T >= rect.B)
        : (bb.L >= rect.L && bb.R <= rect.R && bb.B >= rect.B && bb.T <= rect.T);
      if (inside) ids.push(el.id);
    });
    // plate multi-select — a marquee selects EVERY plate it covers (not just the
    // topmost), so several plates can be boxed and grouped in one go. Mirrors the
    // v25 member marquee: Shift (additive) adds to the set, plain replaces it.
    if (!Array.isArray(window.v25SelPlateIds)) window.v25SelPlateIds = [];
    if (ids.length) {
      if (additive) ids.forEach(function (id) { if (window.v25SelPlateIds.indexOf(id) < 0) window.v25SelPlateIds.push(id); });
      else window.v25SelPlateIds = ids.slice();
      state.selectedId = ids[ids.length - 1];   // primary = topmost
    } else if (!additive) {
      state.selectedId = null;
      window.v25SelPlateIds = [];
    }
    return ids.length ? ids[ids.length - 1] : null;
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
    computeBodySnap:      computeBodySnap,             // plate-orientation-presets
    render2D:             render2D,                    // plate-orientation-presets
    onPointerDown:        onPointerDown,
    onPointerMove:        onPointerMove,
    onPointerUp:          onPointerUp,
    onKey:                onKey,
    selectInRect:         selectInRect,                // plate-marquee-fix (2026-06-01)
    beginBodyDragFromExternalSelect: beginBodyDragFromExternalSelect, // SELECTION-PRECISION
  };
})();
