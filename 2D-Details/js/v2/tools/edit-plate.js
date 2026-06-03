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
    edgeDrag:    null,   // plate corner→END-edge reshape — { elementId, iA, iB, origVA:{x,y}, origVB:{x,y}, anchorWorld:{u,v}, currentDelta:{u,v}(projected), normal:{x,y} }. Moves BOTH corners of the short edge, constrained to the long axis (normal) → widen/narrow.
  };

  /** Fix O (2026-05-23) — handle is rendered 30 screen-pixels above the
   *  plate's bounding-box top so it stays a constant visual distance
   *  regardless of zoom. */
  const HANDLE_PIXEL_OFFSET = 30;
  const HANDLE_HIT_PX       = 12;
  const ROTATE_SNAP_DEG     = 15;

  function num(n, dflt) { return (typeof n === 'number' && isFinite(n)) ? n : (dflt === undefined ? 0 : dflt); }

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
        if (ctx.requestRender) ctx.requestRender();
      }
      return true;
    }

    // Priority 2: CORNER (vertex) hit. plate-edge-drag (2026-06-02, reworked):
    //   plain drag  → move the END (short) edge this corner belongs to, so the
    //                 plate gets wider / narrower. BOTH corners of that short
    //                 edge move together, constrained to the plate's long axis
    //                 (perpendicular to the end edge) so it stays rectangular.
    //   Shift+click → delete the vertex (refuse below 3).
    const vHit = hitTestVertex(blk, cursor.u, cursor.v);
    if (vHit) {
      const el = v2.appState.model.elements.get(vHit.elementId);
      if (!el || !el.geometry || !Array.isArray(el.geometry.polygon)) return false;
      const poly = el.geometry.polygon;
      if (shift) {
        if (poly.length <= 3) return true;   // claim the click so v1 doesn't react
        const next = poly.filter(function (_, i) { return i !== vHit.vertexIndex; });
        apply(buildPolygonEdit(vHit.elementId, next));
        return true;
      }
      if (poly.length < 2) return false;
      const n = poly.length;
      const vi = vHit.vertexIndex;
      const prev = (vi - 1 + n) % n, nxt = (vi + 1) % n;
      const dPrev = Math.hypot(num(poly[vi].x) - num(poly[prev].x), num(poly[vi].y) - num(poly[prev].y));
      const dNext = Math.hypot(num(poly[vi].x) - num(poly[nxt].x), num(poly[vi].y) - num(poly[nxt].y));
      const partner = (dPrev <= dNext) ? prev : nxt;   // the shorter (END) edge
      const ex = num(poly[partner].x) - num(poly[vi].x), ey = num(poly[partner].y) - num(poly[vi].y);
      const elen = Math.hypot(ex, ey) || 1;
      // unit normal to the end edge = the plate's long axis = the width direction
      const nx = -ey / elen, ny = ex / elen;
      state.selectedId = vHit.elementId;
      state.edgeDrag = {
        elementId:    vHit.elementId,
        iA:           vi,
        iB:           partner,
        origVA:       { x: num(poly[vi].x), y: num(poly[vi].y) },
        origVB:       { x: num(poly[partner].x), y: num(poly[partner].y) },
        anchorWorld:  { u: cursor.u, v: cursor.v },
        currentDelta: { u: 0, v: 0 },
        normal:       { x: nx, y: ny },     // drag is projected onto this (long axis)
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

    // Priority 4: body OR a (non-corner) edge → MOVE the whole plate. A click on
    // a long top/bottom edge, or anywhere inside the outline, just selects and
    // moves the plate as one. (Corner grabs were already claimed at priority 2.)
    let bHit = hitTestBody(blk, cursor.u, cursor.v);
    if (!bHit) {
      const eHit = hitTestEdge(blk, cursor.u, cursor.v);
      if (eHit) bHit = { elementId: eHit.elementId };
    }
    if (bHit) {
      const el = v2.appState.model.elements.get(bHit.elementId);
      if (!el || !el.geometry || !Array.isArray(el.geometry.polygon)) return false;
      state.selectedId = bHit.elementId;
      // plate multi-select — Shift accumulates the co-selection set so several
      // plates can be grouped at once; a plain click resets it to just this one.
      if (!Array.isArray(window.v25SelPlateIds)) window.v25SelPlateIds = [];
      if (shift) { if (window.v25SelPlateIds.indexOf(bHit.elementId) < 0) window.v25SelPlateIds.push(bHit.elementId); }
      else { window.v25SelPlateIds = [bHit.elementId]; }
      state.bodyDrag = {
        elementId:    bHit.elementId,
        origPolygon:  el.geometry.polygon.slice(),
        anchorWorld:  { u: cursor.u, v: cursor.v },
        currentDelta: { u: 0, v: 0 },
        orthoAxis:    null,
        snapLines:    null,
      };
      // plate-grouping-stiffener — selecting a grouped plate selects the whole
      // group; snapshot the v25 mates so they translate with this plate's drag.
      if (typeof window.v25GroupOnPlateSelected === 'function') window.v25GroupOnPlateSelected(bHit.elementId);
      if (typeof window.v25GroupOnPlateDragBegin === 'function') window.v25GroupOnPlateDragBegin(bHit.elementId);
      if (ctx.requestRender) ctx.requestRender();
      return true;
    }

    // Fix O — empty click: deselect, then fall through to v1.
    // plate-grouping-stiffener — but NOT while Shift is held: the user is
    // Shift-adding a v25 member (e.g. the column) to a cross-system selection,
    // so the plate(s) must stay selected for the subsequent Group.
    if (!shift) {
      if (state.selectedId) { state.selectedId = null; if (ctx.requestRender) ctx.requestRender(); }
      window.v25SelPlateIds = [];   // a plain click clears the plate co-selection
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
      render2D();   // plate-orientation-presets — 2D-only render mid-drag
      return true;
    }
    // plate corner→END-edge reshape — move both corners of the short edge by the
    // cursor delta PROJECTED onto the long axis (normal), so the plate widens /
    // narrows without skewing. 2D-only render mid-drag.
    if (state.edgeDrag) {
      if (!cursor) return true;
      const ed = state.edgeDrag;
      let du = cursor.u - ed.anchorWorld.u, dv = cursor.v - ed.anchorWorld.v;
      if (ed.normal) { const pr = du * ed.normal.x + dv * ed.normal.y; du = pr * ed.normal.x; dv = pr * ed.normal.y; }
      ed.currentDelta = { u: du, v: dv };
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
    // plate corner→END-edge reshape commit. Dragged ≥0.5 mm (along the long
    // axis) → translate BOTH corners of the short edge; a sub-threshold release
    // → just select (no undo entry), mirroring the vertex/body convention.
    if (state.edgeDrag) {
      const ed = state.edgeDrag;
      state.edgeDrag = null;
      if (!cursor) { if (ctx && ctx.requestRender) ctx.requestRender(); return true; }
      const el = v2.appState && v2.appState.model && v2.appState.model.elements.get(ed.elementId);
      if (!el || !el.geometry || !Array.isArray(el.geometry.polygon)) {
        if (ctx && ctx.requestRender) ctx.requestRender();
        return true;
      }
      let du = cursor.u - ed.anchorWorld.u, dv = cursor.v - ed.anchorWorld.v;
      if (ed.normal) { const pr = du * ed.normal.x + dv * ed.normal.y; du = pr * ed.normal.x; dv = pr * ed.normal.y; }
      if (Math.hypot(du, dv) >= 0.5) {
        const next = el.geometry.polygon.slice();
        if (ed.iA >= 0 && ed.iA < next.length) next[ed.iA] = { x: ed.origVA.x + du, y: ed.origVA.y + dv };
        if (ed.iB >= 0 && ed.iB < next.length) next[ed.iB] = { x: ed.origVB.x + du, y: ed.origVB.y + dv };
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
      if (Math.hypot(du, dv) >= 0.5) {
        apply(buildPolygonEdit(b.elementId, translatePolygon(b.origPolygon, du, dv)));
      }
      // plate-grouping-stiffener — commit the grouped v25 mates to the same
      // final delta (they were moved directly during the drag preview).
      if (typeof window.v25GroupOnPlateDragEnd === 'function') window.v25GroupOnPlateDragEnd(b.elementId, du, dv);
      // plate-grouping-stiffener — if the dropped plate is in a group, snap the
      // assembly flush to a beam flange and register the (default-bare) joint.
      var _pel = v2.appState && v2.appState.model && v2.appState.model.elements.get(b.elementId);
      var _gid = _pel && _pel.params && _pel.params.groupId;
      if (_gid && typeof window.v25JointSnapGroupToFlange === 'function') window.v25JointSnapGroupToFlange(_gid);
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
      // plate-grouping-stiffener — settle the grouped mates at the same final
      // rotation (they were rotated live during the preview).
      if (typeof window.v25GroupOnPlateRotateEnd === 'function') window.v25GroupOnPlateRotateEnd(r.elementId, deltaRad);
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
    let hitId = null;
    eachV2Plate(function (el) {
      if (plateViewKey(el) !== blk.viewKey) return;
      const bb = polyBBox(el.geometry && el.geometry.polygon);
      if (!bb) return;
      const inside = crossing
        ? (bb.L <= rect.R && bb.R >= rect.L && bb.B <= rect.T && bb.T >= rect.B)
        : (bb.L >= rect.L && bb.R <= rect.R && bb.B >= rect.B && bb.T <= rect.T);
      if (inside) hitId = el.id;   // keep last (topmost) on overlap
    });
    if (hitId) state.selectedId = hitId;
    else if (!additive) state.selectedId = null;
    return hitId;
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
  };
})();
