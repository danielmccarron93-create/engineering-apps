/**
 * StructDraw v2 · Tools · PlacePlateTool
 * LAYER: tools — places a v2 plate Element via `placeElementTransaction`.
 *        Two interaction modes mirror v1's `js/76-v25-plate.js`:
 *          - Rectangle (default) — first click sets the anchor, second click
 *            commits the opposite corner. Drag-and-release also commits.
 *          - Polygon (P key)     — click to add vertices, double-click /
 *            Enter / click-near-first to close. Esc cancels.
 *
 *        The tool is the Phase 1 PILOT for the v2 architecture (08-pilot-feature.md):
 *        every other layer (catalogue, model, transaction, undo, autosave,
 *        canvas2d render, threejs render, save/load) gets exercised through it.
 *
 * READS:  v2.featureFlags.useV2For.plates; v2.appState.{ui,tools};
 *           v2.catalogues.lookupFamily / lookupType; v2.transactions.placeElement
 * WRITES: v2.tools.PlacePlateTool + (on load) registers itself with the engine.
 *
 * Classic <script>, no build step (CLAUDE.md rules 3 & 8). The tool exports a
 * plain object — no canvas access, no DOM access. The event dispatcher is the
 * sole caller. drawPreview lives on the tool but consumers (the live render
 * shim or future Canvas2DRenderer) call it; the tool itself doesn't paint.
 *
 * COORDINATE SPACE: the placed plate is a view-local `region` geometry whose
 * polygon vertices are in real-world (u, v) mm — the same convention as v1's
 * V25 plate2 entity. This keeps the v2 plate visually compatible with v1's
 * canvas without a coordinate-space remap, and matches the migrator's existing
 * shape for V25 plate2 (`region` kind, view-local viewId). The plate's
 * thickness lives on `params.thickness` so the iso renderer can extrude it.
 *
 * See PlannedBuilds/architecture-v2/06-tools-and-transactions.md §3 (the
 * worked PlaceFastenerTool — same shape applied to a plate),
 *     PlannedBuilds/architecture-v2/08-pilot-feature.md §4.4-§4.5.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.tools = v2.tools || {};

  /** Pixels of pointer movement that distinguish "drag" from "click". */
  const DRAG_THRESHOLD_PX = 4;

  /** Default family + type when the UI hasn't picked one yet. */
  const DEFAULT_FAMILY      = 'plate-flat';
  const DEFAULT_TYPE        = 'PL12';        // Fix G (2026-05-23): 12 mm by default
  const DEFAULT_ORIENTATION = 'elevation';   // plate-orientation-presets (2026-05-31)

  /** Resolve the current placement orientation from appState.ui.
   *  Three presets (plate-orientation-presets, 2026-05-31):
   *  - 'elevation' (default): free-form rectangle or polygon — the user draws
   *    the visible face of the plate at any size; thickness is "into the page".
   *  - 'h-cleat': a flat horizontal cleat seen in elevation as a thin strip; the
   *    user defines the LENGTH along u by clicking start + end, and the thickness
   *    from the size picker fixes the vertical (perpendicular) extent; cursor
   *    side picks up/down.
   *  - 'v-cleat': a vertical cleat — the LENGTH runs along v, thickness along u;
   *    cursor side picks left/right.
   *  Legacy in-memory values are mapped: 'vertical'->'elevation',
   *  'horizontal'->'h-cleat'. See PlannedBuilds/plate-orientation-presets/02-design.md. */
  function activeOrientation(ctx) {
    const ui = (ctx && ctx.appState && ctx.appState.ui) || {};
    const raw = ui.activePlateOrientation;
    if (raw === 'h-cleat' || raw === 'v-cleat' || raw === 'elevation') return raw;
    if (raw === 'horizontal') return 'h-cleat';     // legacy map
    if (raw === 'vertical')   return 'elevation';   // legacy map
    return DEFAULT_ORIENTATION;
  }

  /** True for either cleat mode (h-cleat or v-cleat) — both share the
   *  two-click "set the length, thickness is perpendicular" flow. */
  function isCleat(orient) {
    return orient === 'h-cleat' || orient === 'v-cleat';
  }

  /** Build a horizontal cleat polygon — the v=anchor.v line is the cleat's
   *  TOP (if user dragged downward) or BOTTOM (if upward) edge; the cleat
   *  extends `thk` perpendicular in the direction of cursor.v. */
  function horizontalCleatPolygon(anchor, cursor, thk) {
    const dir = (cursor.v >= anchor.v) ? 1 : -1;
    const u0 = Math.min(anchor.u, cursor.u);
    const u1 = Math.max(anchor.u, cursor.u);
    const v0 = anchor.v;
    const v1 = anchor.v + dir * thk;
    return [
      { x: u0, y: Math.min(v0, v1) },
      { x: u1, y: Math.min(v0, v1) },
      { x: u1, y: Math.max(v0, v1) },
      { x: u0, y: Math.max(v0, v1) },
    ];
  }

  /** Build a vertical cleat polygon — the mirror of horizontalCleatPolygon with
   *  the LENGTH running along v and the THICKNESS along u. The u=anchor.u line
   *  is the cleat's LEFT (if user dragged rightward) or RIGHT (if leftward)
   *  edge; the cleat extends `thk` perpendicular in the direction of cursor.u. */
  function verticalCleatPolygon(anchor, cursor, thk) {
    const dir = (cursor.u >= anchor.u) ? 1 : -1;
    const v0 = Math.min(anchor.v, cursor.v);
    const v1 = Math.max(anchor.v, cursor.v);
    const u0 = anchor.u;
    const u1 = anchor.u + dir * thk;
    return [
      { x: Math.min(u0, u1), y: v0 },
      { x: Math.max(u0, u1), y: v0 },
      { x: Math.max(u0, u1), y: v1 },
      { x: Math.min(u0, u1), y: v1 },
    ];
  }

  /** Pick the cleat polygon builder for the active orientation. */
  function cleatPolygon(orient, anchor, cursor, thk) {
    return (orient === 'v-cleat')
      ? verticalCleatPolygon(anchor, cursor, thk)
      : horizontalCleatPolygon(anchor, cursor, thk);
  }

  /** Constrain `cursor` to be ortho (horizontal or vertical) from `origin`.
   *  Used in poly mode (Vertical orientation) unless Shift is held — mirrors
   *  v1 v25 tool default behaviour. */
  function applyOrtho(cursor, origin) {
    if (!origin || !cursor) return cursor;
    const du = cursor.u - origin.u;
    const dv = cursor.v - origin.v;
    if (Math.abs(du) >= Math.abs(dv)) return { u: cursor.u, v: origin.v };
    return { u: origin.u, v: cursor.v };
  }

  /** Read Shift state — prefer v1's global if present, fall back to event. */
  function shiftIsHeld(event) {
    if (typeof window !== 'undefined' && typeof window.shiftHeld === 'boolean' && window.shiftHeld) return true;
    if (event && event.shiftKey) return true;
    return false;
  }

  /** Pull the last vertex of the poly stack as a {u,v} pair. */
  function lastPolyVertex(poly) {
    if (!Array.isArray(poly) || poly.length === 0) return null;
    const p = poly[poly.length - 1];
    return { u: (typeof p.x === 'number') ? p.x : p.u, v: (typeof p.y === 'number') ? p.y : p.v };
  }

  function num(n, dflt) { return (typeof n === 'number' && isFinite(n)) ? n : (dflt === undefined ? 0 : dflt); }

  /** The viewKey for the v1 active block — used both to label the geometry's
   *  viewId AND to pick which `entities2D[…]` bucket the analog v1 plate would
   *  have lived in. The migrator and the canvas2d draw-plate consume the same
   *  viewId-string convention (`v1-view-<key>`). */
  function activeViewId(ctx) {
    const blk = ctx && ctx.blk;
    const key = (blk && blk.viewKey) || 'elevation';
    return 'v1-view-' + key;
  }

  /** Resolve the family / type the user has chosen; fall back to PL10 flat. */
  function activeSelection(ctx) {
    const ui = (ctx && ctx.appState && ctx.appState.ui) || {};
    const family = (typeof ui.activePlateFamily === 'string' && ui.activePlateFamily) ||
                   (typeof ctx.activeFamily === 'string' && ctx.activeFamily) ||
                   DEFAULT_FAMILY;
    const type = (typeof ui.activePlateType === 'string' && ui.activePlateType) ||
                 (typeof ctx.activeType === 'string' && ctx.activeType) ||
                 DEFAULT_TYPE;
    return { family: family, type: type };
  }

  /**
   * Look up the chosen type's thickness from the catalogue. Falls back to the
   * PL10 default when the catalogue isn't loaded (unit tests that only load
   * the model layer).
   */
  function thicknessFor(family, type) {
    if (v2.catalogues && typeof v2.catalogues.lookupType === 'function') {
      const row = v2.catalogues.lookupType(family, type);
      if (row && typeof row.thickness === 'number') return row.thickness;
    }
    return 10;
  }

  /**
   * Resolve the default material id for a plate family. Catalogue is authority;
   * fallback is `steel-s300` (the v2 default for plates per Phase 0c).
   */
  function defaultMaterialFor(family) {
    if (v2.catalogues && typeof v2.catalogues.lookupFamily === 'function') {
      const fam = v2.catalogues.lookupFamily(family);
      if (fam && typeof fam.defaultMaterial === 'string') return fam.defaultMaterial;
    }
    return 'steel-s300';
  }

  /** Build the rectangle polygon from two opposite corners (u, v) world coords. */
  function rectPolygon(a, b) {
    const u0 = Math.min(a.u, b.u), v0 = Math.min(a.v, b.v);
    const u1 = Math.max(a.u, b.u), v1 = Math.max(a.v, b.v);
    return [
      { x: u0, y: v0 }, { x: u1, y: v0 },
      { x: u1, y: v1 }, { x: u0, y: v1 },
    ];
  }

  /**
   * Compose the v2 placeElement transaction for a plate with the given polygon.
   * @param {Array<{x:number,y:number}>} polygon (view-local mm)
   * @param {object} ctx  the tool context
   * @returns {?Transaction} null when the polygon is degenerate
   */
  function buildPlateTx(polygon, ctx) {
    if (!Array.isArray(polygon) || polygon.length < 3) return null;
    const sel = activeSelection(ctx);
    const thk = thicknessFor(sel.family, sel.type);
    const material = defaultMaterialFor(sel.family);
    const viewId = activeViewId(ctx);
    const geometry = v2.model.region({
      viewId: viewId,
      polygon: polygon.map(function (p) { return { x: num(p.x), y: num(p.y) }; }),
    });
    return v2.transactions.placeElement({
      category: 'plate',
      family: sel.family,
      type: sel.type,
      geometry: geometry,
      materialId: material,
      params: {
        thickness: thk,
        v2Source: 'place-plate-tool',
        v2View: ctx && ctx.blk ? ctx.blk.viewKey : null,
      },
    });
  }

  const PlacePlateTool = {
    id: 'place-plate',
    label: 'Place plate (v2)',
    chord: ['B', 'P'],   // B then P — reserved for Phase 11 chord wiring

    stateShape: {
      mode: 'rect',         // 'rect' | 'poly'
      anchor: null,         // first-click world coord (rect mode)
      anchorPx: null,       // first-click screen coord (drag detection)
      poly: [],             // committed polygon vertices (poly mode)
      cursor: null,         // current world coord (for ghost preview)
      preview: null,        // ghost polygon to render this frame
    },

    onActivate(ctx) {
      ctx.setToolState({
        mode: 'rect', anchor: null, anchorPx: null,
        poly: [], cursor: null, preview: null,
      });
      ctx.requestRender();
    },

    onDeactivate(ctx) {
      ctx.setToolState({
        mode: 'rect', anchor: null, anchorPx: null,
        poly: [], cursor: null, preview: null,
      });
      ctx.requestRender();
    },

    onPointerMove(event, ctx) {
      const cursor = ctx.cursor;
      if (!cursor) return false;
      const s = ctx.toolState;
      const orient = activeOrientation(ctx);
      let preview = null;
      if (isCleat(orient)) {
        if (s.anchor) {
          const sel = activeSelection(ctx);
          const thk = thicknessFor(sel.family, sel.type);
          preview = cleatPolygon(orient, s.anchor, cursor, thk);
        }
      } else {
        // Elevation orientation: rect drag preview OR poly rubber-band.
        if (s.mode === 'poly' && s.poly.length) {
          const last = lastPolyVertex(s.poly);
          const useCursor = shiftIsHeld(event) ? cursor : applyOrtho(cursor, last);
          preview = s.poly.concat([{ x: useCursor.u, y: useCursor.v }]).map(function (p) {
            return (typeof p.x === 'number') ? p : { x: p.u, y: p.v };
          });
        } else if (s.anchor) {
          preview = rectPolygon(s.anchor, cursor);
        }
      }
      ctx.setToolState({ cursor: cursor, preview: preview });
      ctx.requestRender();
      return true;
    },

    onPointerDown(event, ctx) {
      if (event && event.button !== 0) return false;   // left click only
      const cursor = ctx.cursor;
      if (!cursor) return false;
      const s = ctx.toolState;
      const orient = activeOrientation(ctx);

      if (isCleat(orient)) {
        // Cleat (h-cleat / v-cleat): two-click line OR drag-release. First
        // click sets anchor; second click commits.
        if (!s.anchor) {
          ctx.setToolState({
            anchor:   { u: cursor.u, v: cursor.v },
            anchorPx: { x: event.clientX, y: event.clientY },
          });
          ctx.requestRender();
          return true;
        }
        commitCleat(ctx, s.anchor, cursor, orient);
        return true;
      }

      // Elevation orientation
      if (s.mode === 'poly') {
        // Append a vertex (with ortho snap unless Shift held), or close near
        // the first vertex.
        const first = s.poly[0];
        const last  = lastPolyVertex(s.poly);
        let newPt = { u: cursor.u, v: cursor.v };
        if (last && !shiftIsHeld(event)) newPt = applyOrtho(cursor, last);
        if (first && s.poly.length >= 3) {
          const fx = (typeof first.x === 'number') ? first.x : first.u;
          const fy = (typeof first.y === 'number') ? first.y : first.v;
          if (Math.hypot(newPt.u - fx, newPt.v - fy) < 14) {
            commitPoly(ctx, s.poly);
            return true;
          }
        }
        const next = s.poly.concat([{ x: newPt.u, y: newPt.v }]);
        ctx.setToolState({ poly: next });
        ctx.requestRender();
        return true;
      }

      // Rect mode (or unset) — record anchor; pointerUp decides drag-vs-click.
      ctx.setToolState({
        mode:     'rect',
        anchor:   { u: cursor.u, v: cursor.v },
        anchorPx: { x: event.clientX, y: event.clientY },
      });
      ctx.requestRender();
      return true;
    },

    onPointerUp(event, ctx) {
      const s = ctx.toolState;
      if (!s.anchor || !s.anchorPx || !event) return false;
      const orient = activeOrientation(ctx);
      const dx = num(event.clientX) - num(s.anchorPx.x);
      const dy = num(event.clientY) - num(s.anchorPx.y);
      const dragged = Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX;

      if (isCleat(orient)) {
        if (dragged) {
          const cursor = ctx.cursor;
          if (!cursor) return false;
          commitCleat(ctx, s.anchor, cursor, orient);
        }
        // else: leave anchor in place for the second click to commit.
        return true;
      }

      // Elevation orientation
      if (dragged) {
        const cursor = ctx.cursor;
        if (!cursor) return false;
        commitRect(ctx, s.anchor, cursor);
        return true;
      }
      // Fix H (2026-05-23): click without drag → enter polygon mode with
      // the anchor as the first vertex. Drag-vs-click is the SOLE mode
      // selector now — the chip-mode toggle was retired.
      ctx.setToolState({
        mode:     'poly',
        poly:     [{ x: s.anchor.u, y: s.anchor.v }],
        anchor:   null,
        anchorPx: null,
        preview:  null,
      });
      ctx.requestRender();
      return true;
    },

    onDblClick(event, ctx) {
      const s = ctx.toolState;
      if (s.mode === 'poly' && s.poly.length >= 3) {
        commitPoly(ctx, s.poly);
        return true;
      }
      return false;
    },

    onKey(event, ctx) {
      if (!event) return false;
      const key = event.key;
      if (key === 'Escape') {
        ctx.setToolState({ anchor: null, anchorPx: null, poly: [], preview: null });
        ctx.requestRender();
        // Fix 1 (2026-05-23): Esc must also release the tool, otherwise the
        // user is stuck in plate mode and every canvas click keeps trying to
        // place a plate. See PlannedBuilds/architecture-v2/12-plate-fix-plan.md.
        if (v2.engine && typeof v2.engine.setActiveTool === 'function') {
          v2.engine.setActiveTool(null);
        }
        return true;
      }
      if (key === 'p' || key === 'P') {
        // Toggle into polygon mode (matches v1's polygon flow on the Plate tool).
        ctx.setToolState({ mode: 'poly', anchor: null, anchorPx: null, poly: [], preview: null });
        ctx.requestRender();
        return true;
      }
      if (key === 'r' || key === 'R') {
        ctx.setToolState({ mode: 'rect', anchor: null, anchorPx: null, poly: [], preview: null });
        ctx.requestRender();
        return true;
      }
      if ((key === 'Enter' || key === 'Return') && ctx.toolState.mode === 'poly' &&
          ctx.toolState.poly.length >= 3) {
        commitPoly(ctx, ctx.toolState.poly);
        return true;
      }
      return false;
    },

    statusText(ctx) {
      const s = ctx.toolState;
      const orient = activeOrientation(ctx);
      if (orient === 'h-cleat') {
        return s && s.anchor
          ? 'Plate (horizontal cleat) — click / drag end · cursor side sets thickness direction'
          : 'Plate (horizontal cleat) — click start point';
      }
      if (orient === 'v-cleat') {
        return s && s.anchor
          ? 'Plate (vertical cleat) — click / drag end · cursor side sets thickness direction'
          : 'Plate (vertical cleat) — click start point';
      }
      if (s && s.mode === 'poly') {
        return s.poly.length === 0
          ? 'Plate (poly) — click vertices · dbl-click / Enter to close · Shift = free angle'
          : ('Plate (poly) — ' + s.poly.length + ' vertices · close near first · Shift = free angle');
      }
      return s && s.anchor
        ? 'Plate — drag to size a rectangle, or release without dragging to start a polygon'
        : 'Plate — drag = rectangle · click = polygon · Esc to cancel';
    },

    cursorStyle(ctx) {
      void ctx;
      return 'crosshair';
    },
  };

  /** Resolve the just-placed element id from the placeElement transaction and
   *  auto-select it: hand it to edit-plate's selection state and release the
   *  Plate tool (firing tool-changed → options-bar refresh). Called by every
   *  successful commit AFTER ctx.applyTransaction(tx). Degenerate commits (the
   *  < 1 mm guards) never reach here, so they don't auto-select.
   *  plate-orientation-presets (2026-05-31). */
  function selectAfterPlace(ctx, tx) {
    if (!tx) return;
    // The placeElement tx carries the freshly-minted element on tx.data.element
    // (see js/v2/transactions/place-element.js + js/v2/model/element.js
    // makeElement, which mints el.id). Read the id straight off it; fall back
    // to the newest plate element by createdAt if the shape ever changes.
    let id = (tx.data && tx.data.element && tx.data.element.id) || null;
    if (!id) {
      const model = v2.appState && v2.appState.model;
      const elements = model && model.elements;
      if (elements && typeof elements.forEach === 'function') {
        let newest = null;
        elements.forEach(function (el) {
          if (el && el.category === 'plate' &&
              (!newest || (el.createdAt || 0) >= (newest.createdAt || 0))) {
            newest = el;
          }
        });
        if (newest) id = newest.id;
      }
    }
    if (id && v2.tools && v2.tools.editPlate && v2.tools.editPlate.state) {
      v2.tools.editPlate.state.selectedId = id;
    }
    if (v2.engine && typeof v2.engine.setActiveTool === 'function') {
      v2.engine.setActiveTool(null);   // release the Plate tool → tool-changed
    }
    ctx.requestRender();
  }

  /** Commit a rectangle plate, reset the rect-mode state. */
  function commitRect(ctx, a, b) {
    const w = Math.abs(a.u - b.u), h = Math.abs(a.v - b.v);
    if (w < 1 || h < 1) {
      // Degenerate rectangle — discard the anchor, treat as a fresh click.
      ctx.setToolState({ anchor: null, anchorPx: null, preview: null });
      ctx.requestRender();
      return null;
    }
    const polygon = rectPolygon(a, b);
    const tx = buildPlateTx(polygon, ctx);
    if (!tx) return null;
    ctx.applyTransaction(tx);
    ctx.setToolState({ anchor: null, anchorPx: null, preview: null });
    selectAfterPlace(ctx, tx);
    return tx;
  }

  /** Commit a polygon plate, reset the poly-mode state. */
  function commitPoly(ctx, poly) {
    if (!Array.isArray(poly) || poly.length < 3) return null;
    const polygon = poly.map(function (p) {
      return (typeof p.x === 'number') ? { x: p.x, y: p.y } : { x: p.u, y: p.v };
    });
    const tx = buildPlateTx(polygon, ctx);
    if (!tx) return null;
    ctx.applyTransaction(tx);
    // Fix H (2026-05-23) — return to rect mode after a polygon commit so the
    // next placement starts from the default drag-vs-click flow.
    ctx.setToolState({ mode: 'rect', poly: [], preview: null });
    selectAfterPlace(ctx, tx);
    return tx;
  }

  /** Commit a cleat plate (h-cleat / v-cleat) from two clicks (or drag-release).
   *  The polygon is a thin rectangle along the click line with `thickness`
   *  perpendicular — horizontal (length along u) or vertical (length along v)
   *  per `orient`. Degenerate (length < 1 mm along the relevant axis) drops the
   *  anchor without committing — same UX as commitRect's degeneracy guard.
   *  plate-orientation-presets (2026-05-31), formerly commitHorizontalCleat. */
  function commitCleat(ctx, a, b, orient) {
    const len = (orient === 'v-cleat') ? Math.abs(b.v - a.v) : Math.abs(b.u - a.u);
    if (len < 1) {
      ctx.setToolState({ anchor: null, anchorPx: null, preview: null });
      ctx.requestRender();
      return null;
    }
    const sel = activeSelection(ctx);
    const thk = thicknessFor(sel.family, sel.type);
    const polygon = cleatPolygon(orient, a, b, thk);
    const tx = buildPlateTx(polygon, ctx);
    if (!tx) return null;
    ctx.applyTransaction(tx);
    ctx.setToolState({ anchor: null, anchorPx: null, preview: null });
    selectAfterPlace(ctx, tx);
    return tx;
  }

  v2.tools.PlacePlateTool = PlacePlateTool;
  // helper functions exported for tests + the inspector
  v2.tools.placePlate = {
    Tool: PlacePlateTool,
    rectPolygon: rectPolygon,
    buildPlateTx: buildPlateTx,
    thicknessFor: thicknessFor,
    defaultMaterialFor: defaultMaterialFor,
    DEFAULT_FAMILY: DEFAULT_FAMILY,
    DEFAULT_TYPE: DEFAULT_TYPE,
  };

  if (v2.engine && typeof v2.engine.registerTool === 'function') {
    v2.engine.registerTool(PlacePlateTool);
  }
})();
