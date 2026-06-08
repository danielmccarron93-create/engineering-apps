/**
 * StructDraw v2 · UI · live render shim (Phase 1 + Phase 3 extensions)
 * LAYER: ui — the bridge that paints v2-authoritative elements onto the
 *        user-facing v1 canvas AND inserts THREE.Mesh objects into v1's iso
 *        scene. The full v2 renderer (a viewport-aware View + Canvas2DBackend
 *        bound to v1's canvas) lands in Phase 5+ — this file is the smallest
 *        shim that makes the pilot + each family migration observable.
 * READS:  v2.appState.model; v2.featureFlags.get('bolts');
 *           v2.render.threejs.{buildMeshPlate,buildMeshBoltAS1252};
 *           v1 globals (ctx, LW, DASH, BOLT_DB, real2px, ppm, colorAlpha,
 *           viewport.zoom, drawingScale, v3dGroup, v3dMatPlate, v3dMatBolt,
 *           sheetMode) — `typeof`-guarded.
 * WRITES: v2.ui.liveRender (install, uninstall, draw…, build…)
 *
 * Classic <script>, no build step (CLAUDE.md rules 3 & 8). Loading this file
 * only defines the namespace; the wrapping side-effects happen in install(),
 * which `js/v2/engine/init.js` calls on DOMContentLoaded (after v1 has bound
 * its render pipeline and after the 3D engine has initialised).
 *
 * --- WRAP STRATEGY --------------------------------------------------------
 * - `requestRender` / `render` are NOT wrapped. Instead, we add a hook
 *   inside the per-block draw path by wrapping `drawBlockContent`: after the
 *   v1 implementation runs we paint v2 elements on top using direct ctx calls
 *   in v1-coordinate space (real2px). This mirrors v1's `drawPlate2D` /
 *   `drawBolt` visually so the v2 element is indistinguishable from its v1
 *   analogue at pixel-similarity-test resolution.
 * - `v3dRebuildScene` is wrapped: after v1 walks objects3D, we add a Mesh
 *   per v2 element via `v2.render.threejs.buildMesh*`. That uses the v1
 *   material (`v3dMatPlate` / `v3dMatBolt`) so the iso block looks visually
 *   consistent with v1's rendering.
 *
 * Plates: Phase 2 retired the feature flag — the plate wraps run every render
 * frame. Bolts: Phase 3 builds alongside v1 — the bolt wraps are GATED on the
 * `useV2For.bolts` feature flag so the running app is byte-identical to today
 * until Dan flips the flag for the one-week soak. When no v2 bolts exist
 * (flag off OR none placed), `eachV2Bolt` short-circuits naturally.
 *
 * NOTE — this file is the only module that depends on v1's drawing conventions
 * (real2px, LW, ppm). Promoting plates/bolts to the proper Canvas2DRenderer +
 * viewport-aware View is Phase 5+ work.
 * See PlannedBuilds/architecture-v2/08-pilot-feature.md §4.3 + §4.7 and
 *     PlannedBuilds/architecture-v2/09-build-plan.md "Phase 2" + "Phase 3".
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.ui = v2.ui || {};

  const state = {
    installed: false,
    drawBlockOriginal: null,
    v3dRebuildOriginal: null,
    autoRedraw: null,        // dirty-bus unsubscribe
  };

  function num(n, dflt) { return (typeof n === 'number' && isFinite(n)) ? n : (dflt === undefined ? 0 : dflt); }

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

  /** Phase 3 — feature-flag gate for v2 bolts. */
  function boltsAuthoritative() {
    return !!(v2.featureFlags && typeof v2.featureFlags.get === 'function' &&
              v2.featureFlags.get('bolts'));
  }

  function eachV2Bolt(fn) {
    if (!boltsAuthoritative()) return;
    const model = v2.appState && v2.appState.model;
    if (!model || !(model.elements instanceof Map)) return;
    model.elements.forEach(function (el) {
      if (el && el.category === 'fastener' &&
          el.params && el.params.v2Source === 'place-bolt-tool') {
        fn(el);
      }
    });
  }

  /** A v2 bolt's (u, v) anchor in real-world mm — derived from its location. */
  function boltUV(el) {
    const g = el && el.geometry;
    if (!g || g.kind !== 'point' || !g.location) return null;
    return { u: num(g.location.x), v: num(g.location.y) };
  }

  /** The viewKey a v2 bolt "belongs" to — params.v2View from the place tool. */
  function boltViewKey(el) {
    return (el && el.params && typeof el.params.v2View === 'string')
      ? el.params.v2View : null;
  }

  /** A v2 plate's polygon in (u, v) real-world mm — works for region or polyline. */
  function plateUV(el) {
    if (!el || !el.geometry) return null;
    const g = el.geometry;
    if (g.kind === 'region' && Array.isArray(g.polygon)) {
      return g.polygon.map(function (p) { return { u: num(p.x), v: num(p.y) }; });
    }
    if (g.kind === 'polyline' && Array.isArray(g.points)) {
      return g.points.map(function (p) { return { u: num(p.x), v: num(p.y) }; });
    }
    return null;
  }

  /** The viewKey a v2 plate "belongs" to — derived from its geometry.viewId. */
  function plateViewKey(el) {
    const vid = el && el.geometry && el.geometry.viewId;
    if (typeof vid !== 'string') return null;
    const m = /^v1-view-(.+)$/.exec(vid);
    return m ? m[1] : null;
  }

  /**
   * Draw every v2 plate that belongs to `blk` onto the v1 canvas using the
   * v1 drawing conventions (real2px + LW). Mirrors v1's drawPlate2D so the
   * v2 plate looks pixel-identical to a v1 plate2.
   * @param {object} blk      v1 active block
   * @param {CSSStyleDeclaration} cs   getComputedStyle(document.body)
   */
  function drawV2PlatesOnCanvas(blk, cs) {
    if (!blk) return;
    if (typeof ctx === 'undefined' || typeof real2px !== 'function') return;
    const ppm_ = (typeof ppm === 'function') ? ppm() : 1;
    const cutLW = (typeof LW === 'object' && LW && typeof LW.CUT === 'number')
      ? LW.CUT * ppm_
      : Math.max(0.7, ppm_);
    const col = cs.getPropertyValue('--entity-color').trim() || '#000000';
    // Fix M / N / O (2026-05-23) — if any drag is in progress on this plate,
    // paint the preview polygon instead of the committed one. No transactions
    // fire during drag; this is purely the visual preview.
    const ep = v2.tools && v2.tools.editPlate && v2.tools.editPlate.state ? v2.tools.editPlate : null;
    const drag       = ep ? ep.state.dragging   : null;
    const bodyDrag   = ep ? ep.state.bodyDrag   : null;
    const rotateDrag = ep ? ep.state.rotateDrag : null;
    const edgeDrag   = ep ? ep.state.edgeDrag   : null;
    eachV2Plate(function (el) {
      if (plateViewKey(el) !== blk.viewKey) return;
      let pts = plateUV(el);
      if (!pts || pts.length < 2) return;
      // Vertex drag preview (single vertex moved).
      if (drag && drag.elementId === el.id && typeof drag.vertexIndex === 'number' &&
          drag.currentVertex && drag.vertexIndex >= 0 && drag.vertexIndex < pts.length) {
        pts = pts.slice();
        pts[drag.vertexIndex] = { u: num(drag.currentVertex.x), v: num(drag.currentVertex.y) };
      }
      // Fix O — body drag (translation) preview.
      if (bodyDrag && bodyDrag.elementId === el.id && bodyDrag.currentDelta) {
        const du = num(bodyDrag.currentDelta.u);
        const dv = num(bodyDrag.currentDelta.v);
        pts = pts.map(function (p) { return { u: p.u + du, v: p.v + dv }; });
      }
      // plate corner-resize — preview the recomputed corner(s) (edgeDrag.cur is
      // the list of {i,x,y} vertices to set, written each pointer-move).
      if (edgeDrag && edgeDrag.elementId === el.id && Array.isArray(edgeDrag.cur)) {
        pts = pts.slice();
        edgeDrag.cur.forEach(function (vtx) { if (vtx.i >= 0 && vtx.i < pts.length) pts[vtx.i] = { u: vtx.x, v: vtx.y }; });
      }
      // Fix O — rotation preview (rotate origPolygon around centroid by delta).
      if (rotateDrag && rotateDrag.elementId === el.id) {
        const r = rotateDrag;
        const dRad = r.currentAngle - r.anchorAngle;
        const cos = Math.cos(dRad), sin = Math.sin(dRad);
        pts = r.origPolygon.map(function (p) {
          const dx = num(p.x) - r.centroid.x;
          const dy = num(p.y) - r.centroid.y;
          return {
            u: r.centroid.x + dx * cos - dy * sin,
            v: r.centroid.y + dx * sin + dy * cos,
          };
        });
      }
      ctx.save();
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(1, cutLW);
      ctx.setLineDash([]);
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const sp = real2px(blk, pts[i].u, pts[i].v);
        if (i === 0) ctx.moveTo(sp.x, sp.y);
        else         ctx.lineTo(sp.x, sp.y);
      }
      ctx.closePath();
      // plate multi-select — light accent fill on each CO-selected (secondary)
      // plate so the user sees the whole set that will be grouped. The PRIMARY
      // selected plate's fill + grips come from drawV2PlateSelection.
      const _selIds = Array.isArray(window.v25SelPlateIds) ? window.v25SelPlateIds : [];
      if (_selIds.indexOf(el.id) >= 0 && !(ep && ep.state && ep.state.selectedId === el.id)) {
        const selCol = cs.getPropertyValue('--selected-color').trim() || '#4a90e2';
        ctx.fillStyle = (typeof colorAlpha === 'function') ? colorAlpha(selCol, 0.14) : selCol;
        ctx.fill();
      }
      // Fix B + C (2026-05-23): outline only — no grey fill, no centroid
      // label. AS 1100 default for a plate is outline-only at the right
      // lineweight. Labels are user-added annotations (a separate phase).
      // V25 depth order (72h) — if this plate sits BEHIND a member pushed in
      // front of it, dash the covered span of each outline edge (AS 1100
      // hidden line). Empty occluder set ⇒ plain stroke, unchanged.
      var _pz = (el.params && typeof el.params.z === 'number') ? el.params.z : 0;
      var _occ = (typeof v25DepthOccludersFor === 'function')
        ? v25DepthOccludersFor(blk.viewKey, el.id, _pz, pts) : null;
      if (_occ && _occ.length && typeof v25DepthClipWorldSeg === 'function') {
        var hidCol = cs.getPropertyValue('--hid-color').trim() || col;
        var zoom = (typeof viewport !== 'undefined' && viewport && typeof viewport.zoom === 'number') ? viewport.zoom : 1;
        var hidDashPx = [3 * zoom, 2 * zoom];
        var occLW = Math.max(1, cutLW * 0.6), solidLW = Math.max(1, cutLW);
        for (var ei = 0; ei < pts.length; ei++) {
          var pA = pts[ei], pB = pts[(ei + 1) % pts.length];
          var segs = v25DepthClipWorldSeg(pA.u, pA.v, pB.u, pB.v, _occ);
          for (var sj = 0; sj < segs.length; sj++) {
            var sg = segs[sj];
            var qa = real2px(blk, sg.u1, sg.v1), qb = real2px(blk, sg.u2, sg.v2);
            if (sg.occluded) { ctx.strokeStyle = hidCol; ctx.lineWidth = occLW; ctx.setLineDash(hidDashPx); }
            else { ctx.strokeStyle = col; ctx.lineWidth = solidLW; ctx.setLineDash([]); }
            ctx.beginPath(); ctx.moveTo(qa.x, qa.y); ctx.lineTo(qb.x, qb.y); ctx.stroke();
          }
        }
        ctx.setLineDash([]);
      } else {
        ctx.stroke();
      }
      ctx.restore();
    });
  }

  /**
   * Fix M (2026-05-23): draw small dots at every v2 plate vertex so the user
   * can see where to click for vertex-drag / Shift+click-to-delete. The dot
   * for a currently-dragging vertex paints at the drag cursor position (so
   * the user can see the live ghost) and uses a slightly bolder fill.
   * Edge dots are deliberately NOT drawn — Shift+click on an empty edge
   * inserts a vertex; over-decorating edges would clutter the drawing.
   * @param {object} blk      v1 active block
   * @param {CSSStyleDeclaration} cs   getComputedStyle(document.body)
   */
  function drawV2PlateVertexDots(blk, cs) {
    if (!blk) return;
    if (typeof ctx === 'undefined' || typeof real2px !== 'function') return;
    const ep = (v2.tools && v2.tools.editPlate && v2.tools.editPlate.state)
      ? v2.tools.editPlate : null;
    if (!ep) return;
    const drag       = ep.state.dragging;
    const bodyDrag   = ep.state.bodyDrag;
    const rotateDrag = ep.state.rotateDrag;
    const selectedId = ep.state.selectedId;
    // Fix N / O (2026-05-23) — paint vertex dots when EITHER (a) a drag is
    // in progress on this plate (so the user sees what they're grabbing),
    // OR (b) the plate is selected (so the user can grab a vertex to edit).
    // Idle non-selected plates render outline-only.
    if (!drag && !bodyDrag && !rotateDrag && !selectedId) return;
    const col = cs.getPropertyValue('--entity-color').trim() || '#000000';
    const selCol = cs.getPropertyValue('--selected-color').trim() || col;
    const dotFill = (typeof colorAlpha === 'function') ? colorAlpha(col, 0.55) : col;
    const dragFill = col;
    ctx.save();
    eachV2Plate(function (el) {
      if (plateViewKey(el) !== blk.viewKey) return;
      const isSelected = (selectedId === el.id);
      const isDragging = (drag && drag.elementId === el.id);
      const isBodyDrag = (bodyDrag && bodyDrag.elementId === el.id);
      const isRotDrag  = (rotateDrag && rotateDrag.elementId === el.id);
      if (!isSelected && !isDragging && !isBodyDrag && !isRotDrag) return;
      let pts = plateUV(el);
      if (!pts || pts.length === 0) return;
      // Vertex drag preview
      if (isDragging && typeof drag.vertexIndex === 'number' && drag.currentVertex &&
          drag.vertexIndex >= 0 && drag.vertexIndex < pts.length) {
        pts = pts.slice();
        pts[drag.vertexIndex] = { u: num(drag.currentVertex.x), v: num(drag.currentVertex.y) };
      }
      // Body drag translation preview
      if (isBodyDrag && bodyDrag.currentDelta) {
        const du = num(bodyDrag.currentDelta.u);
        const dv = num(bodyDrag.currentDelta.v);
        pts = pts.map(function (p) { return { u: p.u + du, v: p.v + dv }; });
      }
      // Rotation preview
      if (isRotDrag) {
        const r = rotateDrag;
        const dRad = r.currentAngle - r.anchorAngle;
        const cos = Math.cos(dRad), sin = Math.sin(dRad);
        pts = r.origPolygon.map(function (p) {
          const dx = num(p.x) - r.centroid.x;
          const dy = num(p.y) - r.centroid.y;
          return {
            u: r.centroid.x + dx * cos - dy * sin,
            v: r.centroid.y + dx * sin + dy * cos,
          };
        });
      }
      for (let i = 0; i < pts.length; i++) {
        const sp = real2px(blk, pts[i].u, pts[i].v);
        const isDraggedVertex = (isDragging && drag.vertexIndex === i);
        ctx.fillStyle = isDraggedVertex ? dragFill : (isSelected ? selCol : dotFill);
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, isDraggedVertex ? 3.5 : 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.restore();
  }

  /**
   * Fix O (2026-05-23) — draw the selection outline (dashed) and rotation
   * handle (circle above the plate) for the currently-selected v2 plate in
   * this block. Mirrors the same drag-preview transforms as the main
   * plate-outline pass so the selection markings track moves and rotations.
   * @param {object} blk      v1 active block
   * @param {CSSStyleDeclaration} cs   getComputedStyle(document.body)
   */
  function drawV2PlateSelection(blk, cs) {
    if (!blk) return;
    if (typeof ctx === 'undefined' || typeof real2px !== 'function') return;
    const ep = v2.tools && v2.tools.editPlate;
    if (!ep || !ep.state.selectedId) return;
    const el = v2.appState && v2.appState.model && v2.appState.model.elements.get(ep.state.selectedId);
    if (!el || el.category !== 'plate') return;
    if (plateViewKey(el) !== blk.viewKey) return;
    let pts = plateUV(el);
    if (!pts || pts.length === 0) return;
    // Apply the same drag-preview transforms drawV2PlatesOnCanvas uses so
    // the selection outline tracks the live move / rotation preview.
    const drag       = ep.state.dragging;
    const bodyDrag   = ep.state.bodyDrag;
    const rotateDrag = ep.state.rotateDrag;
    const edgeDrag   = ep.state.edgeDrag;
    if (drag && drag.elementId === el.id && typeof drag.vertexIndex === 'number' &&
        drag.currentVertex && drag.vertexIndex >= 0 && drag.vertexIndex < pts.length) {
      pts = pts.slice();
      pts[drag.vertexIndex] = { u: num(drag.currentVertex.x), v: num(drag.currentVertex.y) };
    }
    if (bodyDrag && bodyDrag.elementId === el.id && bodyDrag.currentDelta) {
      const du = num(bodyDrag.currentDelta.u);
      const dv = num(bodyDrag.currentDelta.v);
      pts = pts.map(function (p) { return { u: p.u + du, v: p.v + dv }; });
    }
    if (edgeDrag && edgeDrag.elementId === el.id && Array.isArray(edgeDrag.cur)) {
      pts = pts.slice();
      edgeDrag.cur.forEach(function (vtx) { if (vtx.i >= 0 && vtx.i < pts.length) pts[vtx.i] = { u: vtx.x, v: vtx.y }; });
    }
    if (rotateDrag && rotateDrag.elementId === el.id) {
      const r = rotateDrag;
      const dRad = r.currentAngle - r.anchorAngle;
      const cos = Math.cos(dRad), sin = Math.sin(dRad);
      pts = r.origPolygon.map(function (p) {
        const dx = num(p.x) - r.centroid.x;
        const dy = num(p.y) - r.centroid.y;
        return {
          u: r.centroid.x + dx * cos - dy * sin,
          v: r.centroid.y + dx * sin + dy * cos,
        };
      });
    }
    const selCol = cs.getPropertyValue('--selected-color').trim() || '#3b82f6';
    ctx.save();
    // selection-highlight-consistency (2026-06-04) — match the V25 member /
    // fixing highlight (v25DrawSelectionHighlight): a subtle translucent accent
    // fill + a clean solid accent outline + small accent corner grips. The
    // 2026-06-01 "bold, unmistakable" pass (heavy 2.25px outline + big white
    // 12px grips) over-corrected and read far heavier than a selected member;
    // dialled back here so plate / member / fixing all look the same. Collect
    // the screen-space vertices once for reuse.
    const selPx = pts.map(function (p) { return real2px(blk, p.u, p.v); });
    // Subtle translucent fill across the plate body.
    if (selPx.length >= 3) {
      ctx.beginPath();
      for (let i = 0; i < selPx.length; i++) {
        if (i === 0) ctx.moveTo(selPx[i].x, selPx[i].y);
        else         ctx.lineTo(selPx[i].x, selPx[i].y);
      }
      ctx.closePath();
      ctx.fillStyle = (typeof colorAlpha === 'function') ? colorAlpha(selCol, 0.12) : selCol;
      ctx.fill();
    }
    // Clean solid selection outline (on top of the plate's own outline).
    ctx.strokeStyle = selCol;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.setLineDash([]);
    ctx.beginPath();
    for (let i = 0; i < selPx.length; i++) {
      if (i === 0) ctx.moveTo(selPx[i].x, selPx[i].y);
      else         ctx.lineTo(selPx[i].x, selPx[i].y);
    }
    ctx.closePath();
    ctx.stroke();
    // Small accent corner grips (solid fill + accent border) — same look and
    // size as the V25 member / fixing handles (~7px square).
    const GS = 3.5;   // grip half-size in screen px
    for (let i = 0; i < selPx.length; i++) {
      ctx.fillStyle = selCol;
      ctx.fillRect(selPx[i].x - GS, selPx[i].y - GS, GS * 2, GS * 2);
      ctx.strokeStyle = selCol;
      ctx.lineWidth = 1.4;
      ctx.strokeRect(selPx[i].x - GS, selPx[i].y - GS, GS * 2, GS * 2);
    }
    // Rotation handle — small accent circle floated above the plate, connected
    // by a dashed stem (matches the V25 member rotate handle). Position in the
    // SAME polygon-space as `pts` so it tracks the preview during body / rotation
    // drag.
    const polyAsXY = pts.map(function (p) { return { x: p.u, y: p.v }; });
    const handlePos = ep.rotationHandlePos(polyAsXY);
    if (handlePos) {
      let maxV = -Infinity, cx = 0;
      for (const p of polyAsXY) { if (p.y > maxV) maxV = p.y; cx += p.x; }
      cx /= polyAsXY.length;
      const topPx = real2px(blk, cx, maxV);
      const hPx   = real2px(blk, handlePos.u, handlePos.v);
      // Dashed stem from plate top to handle.
      ctx.strokeStyle = selCol;
      ctx.lineWidth = 0.8;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(topPx.x, topPx.y);
      ctx.lineTo(hPx.x, hPx.y);
      ctx.stroke();
      ctx.setLineDash([]);
      // Handle: solid accent circle with accent border.
      ctx.fillStyle = selCol;
      ctx.beginPath();
      ctx.arc(hPx.x, hPx.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = selCol;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(hPx.x, hPx.y, 4.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Drag guides for a v2 plate body-move (Workstream A). Painted only while a
   * `bodyDrag` is live, so idle frames are untouched. Two overlays:
   *   - ORTHO GUIDE — when Shift-ortho locks one axis (`bodyDrag.orthoAxis`),
   *     a long dotted line through the anchor on the free axis (Revit look).
   *   - SNAP INDICATORS — for each soft face-snap in `bodyDrag.snapLines`, a
   *     dashed line spanning the view at axis=value + a small label, reusing
   *     drawEdgeSnapLines' visual treatment (--selected-color, DASH.SNAP).
   * Shared contract (set by js/v2/tools/edit-plate.js):
   *   bodyDrag.orthoAxis   : 'u' | 'v' | null
   *   bodyDrag.anchorWorld : { u, v }
   *   bodyDrag.currentDelta: { u, v }
   *   bodyDrag.snapLines   : [ { axis:'u'|'v', value:Number, label:String } ] | null
   * @param {object} blk      v1 active block
   * @param {CSSStyleDeclaration} cs   getComputedStyle(document.body)
   */
  function drawV2PlateDragGuides(blk, cs) {
    if (!blk) return;
    if (typeof ctx === 'undefined' || typeof real2px !== 'function') return;
    if (typeof activeBlock === 'undefined' || !activeBlock) return;
    const ep = v2.tools && v2.tools.editPlate && v2.tools.editPlate.state;
    const bd = ep && ep.bodyDrag;
    if (!bd) return;
    // Only draw on the block that holds the selected / dragged plate.
    if (!ep.selectedId) return;
    const el = v2.appState && v2.appState.model && v2.appState.model.elements.get(ep.selectedId);
    if (!el || el.category !== 'plate') return;
    if (plateViewKey(el) !== blk.viewKey) return;

    const hasOrtho = (bd.orthoAxis === 'u' || bd.orthoAxis === 'v') && bd.anchorWorld;
    const hasSnaps = Array.isArray(bd.snapLines) && bd.snapLines.length > 0;
    if (!hasOrtho && !hasSnaps) return;

    ctx.save();

    // ORTHO GUIDE — subtle dotted line through the anchor on the free axis.
    if (hasOrtho) {
      let guideCol = cs.getPropertyValue('--accent').trim() ||
                     cs.getPropertyValue('--text-mute').trim() || '#888888';
      ctx.strokeStyle = (typeof colorAlpha === 'function') ? colorAlpha(guideCol, 0.6) : guideCol;
      ctx.lineWidth = 0.6;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      if (bd.orthoAxis === 'u') {
        // Horizontal move locked → horizontal guide through anchor.v.
        const p1 = real2px(blk, -1000, bd.anchorWorld.v);
        const p2 = real2px(blk,  1000, bd.anchorWorld.v);
        ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
      } else {
        // Vertical move locked → vertical guide through anchor.u.
        const p1 = real2px(blk, bd.anchorWorld.u,  500);
        const p2 = real2px(blk, bd.anchorWorld.u, -500);
        ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // SNAP INDICATORS — dashed view-spanning lines + label, like drawEdgeSnapLines.
    if (hasSnaps) {
      const selCol = cs.getPropertyValue('--selected-color').trim() || '#3b82f6';
      ctx.lineWidth = 0.5;
      ctx.setLineDash(DASH.SNAP);
      ctx.strokeStyle = (typeof colorAlpha === 'function') ? colorAlpha(selCol, 0.25) : selCol;
      for (let i = 0; i < bd.snapLines.length; i++) {
        const s = bd.snapLines[i];
        if (!s) continue;
        ctx.beginPath();
        if (s.axis === 'u') {
          const p1 = real2px(blk, s.value,  500);
          const p2 = real2px(blk, s.value, -500);
          ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
        } else {
          const p1 = real2px(blk, -1000, s.value);
          const p2 = real2px(blk,  1000, s.value);
          ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
        }
        ctx.stroke();
      }
      // Label the first snap (mirrors drawEdgeSnapLines).
      const first = bd.snapLines[0];
      if (first && first.label) {
        const fs = (typeof sheetLen === 'function') ? Math.max(7, sheetLen(2)) : 9;
        ctx.font = fs + 'px system-ui';
        ctx.fillStyle = (typeof colorAlpha === 'function') ? colorAlpha(selCol, 0.7) : selCol;
        ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        const p = first.axis === 'u'
          ? real2px(blk, first.value, 0)
          : real2px(blk, 0, first.value);
        ctx.fillText(first.label, p.x + 6, p.y - 4);
        ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
      }
      ctx.setLineDash([]);
    }

    ctx.restore();
  }

  /**
   * Fix E (2026-05-23): draw the active v2 tool's in-progress preview onto
   * the user-facing canvas — the ghost shape the user sees BEFORE committing.
   * Covers the plate tool's two modes:
   *   - rect: anchor → cursor rectangle (after first click; closes the loop)
   *   - poly: committed vertices + cursor as last vertex (open polyline)
   * Renders as a dashed outline only, no fill, no label. Each block only
   * draws the preview when its viewKey matches the cursor's block.
   * @param {object} blk      v1 active block
   * @param {CSSStyleDeclaration} cs   getComputedStyle(document.body)
   */
  function drawV2ActiveToolPreview(blk, cs) {
    if (!blk) return;
    if (typeof ctx === 'undefined' || typeof real2px !== 'function') return;
    if (!window.v2 || !v2.engine || typeof v2.engine.activeTool !== 'function') return;
    const tool = v2.engine.activeTool();
    if (!tool || tool.id !== 'place-plate') return;
    const ts = (v2.appState && v2.appState.tools && v2.appState.tools['place-plate']) || null;
    if (!ts) return;
    // Only paint into the block the cursor is currently hovering — avoids
    // ghosting across every detail block on the sheet.
    const cursorBlk = ts.cursor && ts.cursor.blk;
    if (cursorBlk && cursorBlk.viewKey && cursorBlk.viewKey !== blk.viewKey) return;
    const preview = ts.preview;
    const polyMode = ts.mode === 'poly';
    const hasPreview = Array.isArray(preview) && preview.length >= 2;
    const hasPolyDots = polyMode && Array.isArray(ts.poly) && ts.poly.length > 0;
    if (!hasPreview && !hasPolyDots) return;
    const col = cs.getPropertyValue('--entity-color').trim() || '#000000';
    const previewCol = (typeof colorAlpha === 'function') ? colorAlpha(col, 0.6) : col;
    ctx.save();
    if (hasPreview) {
      ctx.strokeStyle = previewCol;
      ctx.lineWidth = 0.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      for (let i = 0; i < preview.length; i++) {
        const p = preview[i];
        const u = (typeof p.x === 'number') ? p.x : p.u;
        const v = (typeof p.y === 'number') ? p.y : p.v;
        const sp = real2px(blk, u, v);
        if (i === 0) ctx.moveTo(sp.x, sp.y);
        else         ctx.lineTo(sp.x, sp.y);
      }
      if (ts.mode === 'rect') ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (hasPolyDots) {
      // Small dots at each committed polygon vertex so the user sees what's
      // already locked in.
      ctx.fillStyle = col;
      for (let i = 0; i < ts.poly.length; i++) {
        const p = ts.poly[i];
        const u = (typeof p.x === 'number') ? p.x : p.u;
        const v = (typeof p.y === 'number') ? p.y : p.v;
        const sp = real2px(blk, u, v);
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Fix I (2026-05-23): subtle live dimension text below the preview so the
    // engineer keeps track of size while drawing. Rect mode → "W × H mm".
    // Poly mode → length of the current segment (cursor to previous vertex).
    if (hasPreview) {
      let dimText = null;
      if (ts.mode === 'poly' && preview.length >= 2) {
        const last = preview[preview.length - 1];
        const prev = preview[preview.length - 2];
        const lu = (typeof last.x === 'number') ? last.x : last.u;
        const lv = (typeof last.y === 'number') ? last.y : last.v;
        const pu = (typeof prev.x === 'number') ? prev.x : prev.u;
        const pv = (typeof prev.y === 'number') ? prev.y : prev.v;
        const dist = Math.round(Math.hypot(lu - pu, lv - pv));
        dimText = dist + ' mm';
      } else if (preview.length >= 3) {
        // Rect (any closed polygon): width × height of the bounding box.
        let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
        for (let i = 0; i < preview.length; i++) {
          const p = preview[i];
          const u = (typeof p.x === 'number') ? p.x : p.u;
          const v = (typeof p.y === 'number') ? p.y : p.v;
          if (u < uMin) uMin = u; if (u > uMax) uMax = u;
          if (v < vMin) vMin = v; if (v > vMax) vMax = v;
        }
        const w = Math.round(uMax - uMin);
        const h = Math.round(vMax - vMin);
        if (w >= 1 && h >= 1) dimText = w + ' × ' + h + ' mm';
      }
      if (dimText) {
        // Position: just below the centre-bottom of the preview, in SCREEN
        // pixels so the offset is stable across zoom + drawing scale.
        let pxMinX = Infinity, pxMaxX = -Infinity, pxMaxY = -Infinity;
        for (let i = 0; i < preview.length; i++) {
          const p = preview[i];
          const u = (typeof p.x === 'number') ? p.x : p.u;
          const v = (typeof p.y === 'number') ? p.y : p.v;
          const sp = real2px(blk, u, v);
          if (sp.x < pxMinX) pxMinX = sp.x;
          if (sp.x > pxMaxX) pxMaxX = sp.x;
          if (sp.y > pxMaxY) pxMaxY = sp.y;
        }
        const cx = (pxMinX + pxMaxX) / 2;
        const cy = pxMaxY + 14;
        ctx.fillStyle = (typeof colorAlpha === 'function') ? colorAlpha(col, 0.75) : col;
        ctx.font = '11px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(dimText, cx, cy);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
      }
    }
    ctx.restore();
  }

  /**
   * Draw every v2 bolt that belongs to `blk` onto the v1 canvas. Mirrors v1's
   * `drawBolt` end-on path for the `'elev'` aspect (washer ring + hole +
   * crosshair) and a simplified side-profile rect for the `'sec'` aspect
   * (head + washers + shank + nut at rot, with a centreline). The full AS 1101
   * chamfered-hex side profile lands when the proper Canvas2DRenderer +
   * viewport-aware View is wired in (Phase 5+).
   * @param {object} blk      v1 active block
   * @param {CSSStyleDeclaration} cs   getComputedStyle(document.body)
   */
  function drawV2BoltsOnCanvas(blk, cs) {
    if (!blk) return;
    if (typeof ctx === 'undefined' || typeof real2px !== 'function') return;
    if (typeof BOLT_DB === 'undefined') return;
    const ppm_ = (typeof ppm === 'function') ? ppm() : 1;
    const zoom = (typeof viewport !== 'undefined' && viewport && typeof viewport.zoom === 'number')
      ? viewport.zoom : 1;
    const dscale = (typeof drawingScale === 'number' && drawingScale) ? drawingScale : 10;
    const col = cs.getPropertyValue('--entity-color').trim() || '#000000';
    const clCol = cs.getPropertyValue('--cl-color').trim() || col;
    const visLW = (typeof LW === 'object' && LW && typeof LW.VIS === 'number')
      ? Math.max(0.5, LW.VIS * ppm_) : 0.5;
    const hidLW = (typeof LW === 'object' && LW && typeof LW.HID === 'number')
      ? Math.max(0.3, LW.HID * ppm_) : 0.3;
    const alpha = (typeof colorAlpha === 'function') ? colorAlpha : null;

    eachV2Bolt(function (el) {
      if (boltViewKey(el) !== blk.viewKey) return;
      const uv = boltUV(el);
      if (!uv) return;
      const b = BOLT_DB[el.type] || BOLT_DB.M20;
      if (!b) return;
      const aspect = (el.params && el.params.aspect === 'elev') ? 'elev' : 'sec';

      ctx.save();
      ctx.setLineDash([]);

      if (aspect === 'elev') {
        // Head-on view: washer outline + bolt hole + head crosshair.
        const p = real2px(blk, uv.u, uv.v);
        const r  = (b.d      / 2) * zoom / dscale;
        const wr = (b.washOD / 2) * zoom / dscale;
        const hr = (b.headAF / 2) * zoom / dscale;
        // Washer (dashed lighter)
        ctx.strokeStyle = alpha ? alpha(col, 0.4) : col;
        ctx.lineWidth = hidLW;
        ctx.beginPath(); ctx.arc(p.x, p.y, wr, 0, Math.PI * 2); ctx.stroke();
        // Bolt hole
        ctx.strokeStyle = col; ctx.lineWidth = visLW;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
        if (alpha) { ctx.fillStyle = alpha(col, 0.20); ctx.fill(); }
        // Head crosshair
        ctx.beginPath();
        ctx.moveTo(p.x - hr, p.y); ctx.lineTo(p.x + hr, p.y);
        ctx.moveTo(p.x, p.y - hr); ctx.lineTo(p.x, p.y + hr);
        ctx.stroke();
      } else {
        // Side profile: head + washer + shank + washer + nut, rotated by rot.
        // Drawn in screen space after projecting the centre with real2px and
        // applying a screen-space rotation about that centre — keeps lineweight
        // canvas-pixel-stable independent of viewport zoom.
        const params = el.params || {};
        const rotDeg = num(params.rot, 0);
        const rotRad = rotDeg * Math.PI / 180;
        const grip = num(params.gripOverride, num(params.grip, 12));
        const p = real2px(blk, uv.u, uv.v);
        const s = zoom / dscale;       // mm → canvas px scale
        const shaftLen = grip * s;
        const halfShank = shaftLen / 2;
        const shaftR = (b.d / 2) * s;
        const headR = (b.headAF / 2) * s;
        const nutR  = (b.nutAF  / 2) * s;
        const washR = (b.washOD / 2) * s;
        const headH = b.headH * s;
        const nutH  = b.nutH  * s;
        const washT = b.washT * s;
        // Coordinates along the bolt axis from the centre.
        const zShankL = -halfShank;
        const zShankR =  halfShank;
        const zWashH  = zShankL - washT;
        const zHead   = zWashH  - headH;
        const zWashN  = zShankR;
        const zNut    = zWashN  + washT;
        const zEnd    = zNut    + nutH;
        const threadProt = 2 * b.pitch * s;

        ctx.translate(p.x, p.y);
        ctx.rotate(rotRad);

        // Shank
        ctx.strokeStyle = col; ctx.lineWidth = visLW;
        ctx.beginPath();
        ctx.rect(zShankL, -shaftR, shaftLen, shaftR * 2);
        ctx.stroke();
        if (alpha) {
          ctx.fillStyle = alpha(col, 0.10);
          ctx.fillRect(zShankL, -shaftR, shaftLen, shaftR * 2);
        }
        // Head + head-side washer
        ctx.beginPath();
        ctx.rect(zHead, -headR, headH, headR * 2);
        ctx.rect(zWashH, -washR, washT, washR * 2);
        ctx.stroke();
        if (alpha) {
          ctx.fillStyle = alpha(col, 0.25);
          ctx.fillRect(zHead,  -headR, headH, headR * 2);
          ctx.fillRect(zWashH, -washR, washT, washR * 2);
        }
        // Nut-side washer + nut + thread protrusion
        ctx.beginPath();
        ctx.rect(zWashN, -washR, washT, washR * 2);
        ctx.rect(zNut,   -nutR,  nutH, nutR  * 2);
        ctx.rect(zEnd,   -shaftR, threadProt, shaftR * 2);
        ctx.stroke();
        if (alpha) {
          ctx.fillStyle = alpha(col, 0.25);
          ctx.fillRect(zWashN, -washR, washT, washR * 2);
          ctx.fillRect(zNut,   -nutR,  nutH, nutR  * 2);
        }
        // Centreline along the bolt axis (in local rotated frame)
        ctx.strokeStyle = clCol; ctx.lineWidth = 0.5;
        const DASH_CL = (typeof DASH === 'object' && DASH && Array.isArray(DASH.CL_BOLT))
          ? DASH.CL_BOLT : [6, 2, 1, 2];
        ctx.setLineDash(DASH_CL);
        ctx.beginPath();
        ctx.moveTo(zHead - 4, 0);
        ctx.lineTo(zEnd + threadProt + 4, 0);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.restore();
    });
  }

  /**
   * Build a THREE.Mesh for every v2 plate and add it to `group`. Re-uses the
   * v2 mesh builder (`v2.render.threejs.buildMeshPlate`) so the geometry +
   * orientation logic is shared with the JSDOM scaffold test; passes the v1
   * plate material so the visual is consistent with v1's iso block.
   * @param {THREE.Group} group  v1's v3dGroup
   */
  function buildV2PlatesInScene(group) {
    if (typeof THREE === 'undefined' || !group) return;
    const builder = v2.render && v2.render.threejs && v2.render.threejs.buildMeshPlate;
    if (typeof builder !== 'function') return;
    const v1Plate = (typeof v3dMatPlate !== 'undefined') ? v3dMatPlate : null;
    const materialsShim = { get: function () { return v1Plate; } };
    eachV2Plate(function (el) {
      const thk = num(el.params && el.params.thickness, 10);
      const ctxShim = {
        view: null, rendererName: 'threejs', backend: null,
        threeMaterials: materialsShim,
        material: el.materialId || null,
        type: { thickness: thk },
      };
      let mesh = null;
      try { mesh = builder(el, ctxShim); } catch (e) {
        if (window.console && console.error) {
          console.error('[v2.ui.liveRender] buildMeshPlate threw for ' + el.id + ':', e);
        }
        return;
      }
      if (mesh) {
        mesh.userData = mesh.userData || {};
        mesh.userData.v2ElementId = el.id;
        mesh.userData.v2Source = 'live-render';
        group.add(mesh);
      }
    });
  }

  /**
   * Build a THREE.Group for every v2 bolt and add it to `group`. Re-uses the
   * v2 mesh builder (`v2.render.threejs.buildMeshBoltAS1252`) — the same
   * scaffold the JSDOM Phase 0g test exercises. Passes the v1 bolt material
   * (`v3dMatBolt`) so the iso visual matches v1's bolt rendering.
   * @param {THREE.Group} group  v1's v3dGroup
   */
  function buildV2BoltsInScene(group) {
    if (typeof THREE === 'undefined' || !group) return;
    const builder = v2.render && v2.render.threejs && v2.render.threejs.buildMeshBoltAS1252;
    if (typeof builder !== 'function') return;
    const v1Bolt = (typeof v3dMatBolt !== 'undefined') ? v3dMatBolt : null;
    const materialsShim = { get: function () { return v1Bolt; } };
    eachV2Bolt(function (el) {
      const ctxShim = {
        view: null, rendererName: 'threejs', backend: null,
        threeMaterials: materialsShim,
        material: el.materialId || null,
        // The mesh builder reads ctx.type for shank dimensions — resolve from
        // the v2 catalogue if available, else fall through to BOLT_DB-style
        // fields the builder's `dimsFor` understands.
        type: (function () {
          if (v2.catalogues && typeof v2.catalogues.lookupType === 'function') {
            const t = v2.catalogues.lookupType(el.family || 'as1252-bolt', el.type || 'M20');
            if (t) return t;
          }
          if (typeof BOLT_DB !== 'undefined') {
            return BOLT_DB[el.type] || BOLT_DB.M20 || null;
          }
          return null;
        })(),
      };
      let mesh = null;
      try { mesh = builder(el, ctxShim); } catch (e) {
        if (window.console && console.error) {
          console.error('[v2.ui.liveRender] buildMeshBoltAS1252 threw for ' + el.id + ':', e);
        }
        return;
      }
      if (mesh) {
        mesh.userData = mesh.userData || {};
        mesh.userData.v2ElementId = el.id;
        mesh.userData.v2Source = 'live-render';
        group.add(mesh);
      }
    });
  }

  /** Wrap v1's drawBlockContent so v2 plates + bolts layer on top of v1. */
  function wrapDrawBlockContent() {
    if (typeof window === 'undefined') return false;
    const orig = window.drawBlockContent;
    if (typeof orig !== 'function' || orig._v2LiveRenderWrapped) return false;
    state.drawBlockOriginal = orig;
    function drawBlockContentWithV2(blk, cs) {
      const result = orig.call(this, blk, cs);
      try { drawV2PlatesOnCanvas(blk, cs); }
      catch (e) { if (window.console && console.error) console.error('[v2.ui.liveRender] drawV2Plates threw:', e); }
      try { drawV2BoltsOnCanvas(blk, cs); }
      catch (e) { if (window.console && console.error) console.error('[v2.ui.liveRender] drawV2Bolts threw:', e); }
      // plate-grouping-stiffener — group-flash wash, painted AFTER the plate +
      // bolt bodies so it sits on top of both the v25 members and the plates.
      try { if (typeof window.v25DrawGroupFlash === 'function') window.v25DrawGroupFlash(blk, cs); }
      catch (e) { if (window.console && console.error) console.error('[v2.ui.liveRender] v25DrawGroupFlash threw:', e); }
      // ungroup farewell glow — single quick fade, same slot as the group flash.
      try { if (typeof window.v25DrawUngroupFlash === 'function') window.v25DrawUngroupFlash(blk, cs); }
      catch (e) { if (window.console && console.error) console.error('[v2.ui.liveRender] v25DrawUngroupFlash threw:', e); }
      // Fix M (2026-05-23): vertex dots on every v2 plate (so users see
      // where to click for vertex-drag / Shift+click-delete). Painted AFTER
      // the plate outline so the dots sit on top.
      try { drawV2PlateVertexDots(blk, cs); }
      catch (e) { if (window.console && console.error) console.error('[v2.ui.liveRender] drawV2PlateVertexDots threw:', e); }
      // Fix O (2026-05-23): selection outline + rotation handle for the
      // selected plate. Painted after the dots so the handle sits on top.
      try { drawV2PlateSelection(blk, cs); }
      catch (e) { if (window.console && console.error) console.error('[v2.ui.liveRender] drawV2PlateSelection threw:', e); }
      // Workstream A: dotted ortho guide + soft face-snap indicators during a
      // plate body-move. Painted after the selection outline so the guides sit
      // on top; only does work while a bodyDrag is live.
      try { drawV2PlateDragGuides(blk, cs); }
      catch (e) { if (window.console && console.error) console.error('[v2.ui.liveRender] drawV2PlateDragGuides threw:', e); }
      // Fix E (2026-05-23): in-progress preview for the active v2 tool
      // (currently the plate tool's rect / poly ghost). Drawn last so the
      // preview is always on top of committed entities.
      try { drawV2ActiveToolPreview(blk, cs); }
      catch (e) { if (window.console && console.error) console.error('[v2.ui.liveRender] drawV2ActiveToolPreview threw:', e); }
      return result;
    }
    drawBlockContentWithV2._v2LiveRenderWrapped = true;
    drawBlockContentWithV2._v2LiveRenderOriginal = orig;
    window.drawBlockContent = drawBlockContentWithV2;
    return true;
  }

  /** Wrap v1's v3dRebuildScene so v2 plates + bolts appear in the iso block. */
  function wrapV3dRebuild() {
    if (typeof window === 'undefined') return false;
    const orig = window.v3dRebuildScene;
    if (typeof orig !== 'function' || orig._v2LiveRenderWrapped) return false;
    state.v3dRebuildOriginal = orig;
    function v3dRebuildSceneWithV2() {
      const result = orig.apply(this, arguments);
      if (typeof v3dGroup !== 'undefined') {
        try { buildV2PlatesInScene(v3dGroup); }
        catch (e) { if (window.console && console.error) console.error('[v2.ui.liveRender] buildV2Plates threw:', e); }
        try { buildV2BoltsInScene(v3dGroup); }
        catch (e) { if (window.console && console.error) console.error('[v2.ui.liveRender] buildV2Bolts threw:', e); }
      }
      return result;
    }
    v3dRebuildSceneWithV2._v2LiveRenderWrapped = true;
    v3dRebuildSceneWithV2._v2LiveRenderOriginal = orig;
    window.v3dRebuildScene = v3dRebuildSceneWithV2;
    return true;
  }

  /**
   * Subscribe to 'model-changed' so any v2 mutation triggers a v1 redraw.
   * v1's render path is the source of truth for both canvases — we just pump
   * its existing requestRender + v3dMarkDirty so the wraps above run again.
   */
  function subscribeRedraw() {
    if (state.autoRedraw) return;
    if (!v2.engine || !v2.engine.dirtyBus || typeof v2.engine.dirtyBus.on !== 'function') return;
    state.autoRedraw = v2.engine.dirtyBus.on('model-changed', function () {
      if (typeof requestRender === 'function') requestRender();
      if (typeof v3dMarkDirty === 'function') v3dMarkDirty();
    });
  }

  /** Mount the live-render shim. Idempotent. */
  function install() {
    if (state.installed) return;
    wrapDrawBlockContent();
    wrapV3dRebuild();
    subscribeRedraw();
    state.installed = true;
  }

  /** Tear down the live-render shim. Idempotent. */
  function uninstall() {
    if (typeof window !== 'undefined') {
      if (typeof state.drawBlockOriginal === 'function' &&
          window.drawBlockContent && window.drawBlockContent._v2LiveRenderWrapped) {
        window.drawBlockContent = state.drawBlockOriginal;
      }
      if (typeof state.v3dRebuildOriginal === 'function' &&
          window.v3dRebuildScene && window.v3dRebuildScene._v2LiveRenderWrapped) {
        window.v3dRebuildScene = state.v3dRebuildOriginal;
      }
    }
    state.drawBlockOriginal = null;
    state.v3dRebuildOriginal = null;
    if (typeof state.autoRedraw === 'function') {
      state.autoRedraw();
      state.autoRedraw = null;
    }
    state.installed = false;
  }

  v2.ui.liveRender = {
    install:   install,
    uninstall: uninstall,
    drawV2PlatesOnCanvas: drawV2PlatesOnCanvas,
    buildV2PlatesInScene: buildV2PlatesInScene,
    drawV2BoltsOnCanvas:  drawV2BoltsOnCanvas,
    buildV2BoltsInScene:  buildV2BoltsInScene,
    drawV2ActiveToolPreview: drawV2ActiveToolPreview,   // Fix E (2026-05-23)
    drawV2PlateVertexDots:   drawV2PlateVertexDots,     // Fix M (2026-05-23)
    drawV2PlateSelection:    drawV2PlateSelection,      // Fix O (2026-05-23)
    drawV2PlateDragGuides:   drawV2PlateDragGuides,     // Workstream A (plate-orientation-presets)
    eachV2Plate: eachV2Plate,
    eachV2Bolt:  eachV2Bolt,
    plateUV: plateUV,
    plateViewKey: plateViewKey,
    boltUV:  boltUV,
    boltViewKey:  boltViewKey,
    boltsAuthoritative: boltsAuthoritative,
    state: state,
  };
})();
