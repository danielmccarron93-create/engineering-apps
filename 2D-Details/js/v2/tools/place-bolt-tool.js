/**
 * StructDraw v2 · Tools · PlaceBoltTool
 * LAYER: tools — places a v2 AS 1252 bolt Element via `placeElementTransaction`.
 *        Single-click placement (no rect or polygon mode — bolts are point-
 *        instance fasteners, not regions). The first qualifying click commits
 *        a bolt at the cursor; subsequent clicks place additional bolts at the
 *        same settings until the user picks a different tool.
 *
 *        The tool is the Phase 3 v2 path for bolts (08-pilot-feature.md
 *        Candidate D, deferred from the Phase 1 plate pilot). Built alongside
 *        the v1 3D bolt (`js/33-draw-bolt.js`) — gated by `useV2For.bolts`
 *        so the running app stays byte-identical to today until Dan flips
 *        the flag in DevTools for the one-week soak.
 *
 * READS:  v2.featureFlags.useV2For.bolts; v2.appState.{ui,tools};
 *           v2.catalogues.lookupFamily / lookupType; v2.transactions.placeElement
 * WRITES: v2.tools.PlaceBoltTool + (on load) registers itself with the engine.
 *
 * Classic <script>, no build step (CLAUDE.md rules 3 & 8). The tool exports a
 * plain object — no canvas access, no DOM access. The event dispatcher is the
 * sole caller.
 *
 * COORDINATE SPACE: the placed bolt is a model-level `point` geometry whose
 * location is in the active block's view-local (u, v) world-mm coordinates
 * lifted to (x=u, y=v, z=0). The block's viewKey is stamped on `params.v2View`
 * so the live-render shim can route the canvas paint to the right block — the
 * same convention the v2 plate uses (with its viewId-string sentinel). The
 * v25-2d-bolts design is "axis-agnostic 2D rendering rotated by ent.rot" — the
 * tool keeps `params.aspect` and `params.rot` so the renderer + inspector
 * can dispatch between head-on circle ('elev') and side profile ('sec').
 *
 * HOSTING / AUTO-GRIP — STUBBED for Phase 3. The v25-2d-bolts auto-grip raycast
 * (05-auto-grip-algorithm.md) requires the v1 host stack (plate2 / mem2 UB /
 * mem2 PFC) to be walked from the v2 model — that wiring belongs to a later
 * phase (when bolts host v2 plates natively). For now: every placed bolt
 * starts with `params.gripOverride = null` and `params.grip = 12` (the
 * free-space fallback). The Inspector exposes the override slider so Dan can
 * dial in the actual grip per-bolt during the soak.
 *
 * See PlannedBuilds/architecture-v2/09-build-plan.md "Phase 3",
 *     PlannedBuilds/v25-2d-bolts/02-design.md (entity schema reference),
 *     PlannedBuilds/v25-2d-bolts/05-auto-grip-algorithm.md (deferred raycast).
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.tools = v2.tools || {};

  /** Default family + type when the UI hasn't picked one yet. */
  const DEFAULT_FAMILY  = 'as1252-bolt';
  const DEFAULT_TYPE    = 'M20';
  const DEFAULT_GRADE   = '8.8';
  const DEFAULT_ASPECT  = 'sec';   // 'elev' (head-on circle) | 'sec' (side profile)
  const DEFAULT_GRIP_MM = 12;      // v25-2d-bolts free-space fallback

  function num(n, dflt) { return (typeof n === 'number' && isFinite(n)) ? n : (dflt === undefined ? 0 : dflt); }

  /** Are v2 bolts authoritative right now? Phase 3 gates everything on this. */
  function flagOn() {
    return !!(v2.featureFlags && typeof v2.featureFlags.get === 'function' &&
              v2.featureFlags.get('bolts'));
  }

  /** Resolve family / type / grade / aspect / rot the user has chosen, with
   *  fallbacks to the defaults. Mirrors the plate tool's activeSelection. */
  function activeSelection(ctx) {
    const ui = (ctx && ctx.appState && ctx.appState.ui) || {};
    const family = (typeof ui.activeBoltFamily === 'string' && ui.activeBoltFamily) ||
                   (typeof ctx.activeFamily === 'string' && ctx.activeFamily) ||
                   DEFAULT_FAMILY;
    const type   = (typeof ui.activeBoltType === 'string' && ui.activeBoltType) ||
                   (typeof ctx.activeType === 'string' && ctx.activeType) ||
                   DEFAULT_TYPE;
    const grade  = (typeof ui.activeBoltGrade === 'string' && ui.activeBoltGrade) ||
                   DEFAULT_GRADE;
    const aspect = (ui.activeBoltAspect === 'elev' || ui.activeBoltAspect === 'sec')
                   ? ui.activeBoltAspect : DEFAULT_ASPECT;
    const rot    = num(ui.activeBoltRot, 0);
    return { family: family, type: type, grade: grade, aspect: aspect, rot: rot };
  }

  /** Resolve the default material id for a bolt grade. The catalogue layer
   *  carries materials per grade (`bolt-as1252-grade-8.8`, `…-10.9`); the
   *  fallback is the family's defaultMaterial when neither catalogue is loaded
   *  (unit tests that only load the model layer). */
  function materialForGrade(family, grade) {
    const candidate = 'bolt-as1252-grade-' + grade;
    if (v2.catalogues && typeof v2.catalogues.lookupMaterial === 'function') {
      const mat = v2.catalogues.lookupMaterial(candidate);
      if (mat) return candidate;
    }
    if (v2.catalogues && typeof v2.catalogues.lookupFamily === 'function') {
      const fam = v2.catalogues.lookupFamily(family);
      if (fam && typeof fam.defaultMaterial === 'string') return fam.defaultMaterial;
    }
    return 'bolt-as1252-grade-8.8';
  }

  /** The viewKey of the v1 active block. Used both to stamp `params.v2View`
   *  AND to derive the block this bolt belongs to in the live-render shim. */
  function activeViewKey(ctx) {
    const blk = ctx && ctx.blk;
    return (blk && blk.viewKey) || 'elevation';
  }

  /**
   * Compose the v2 placeElement transaction for a bolt at (cursor.u, cursor.v).
   * @param {{u:number, v:number}} cursor  view-local mm
   * @param {object} ctx                    the tool context
   * @returns {?Transaction} null when the cursor is missing
   */
  function buildBoltTx(cursor, ctx) {
    if (!cursor || typeof cursor.u !== 'number' || typeof cursor.v !== 'number') return null;
    const sel = activeSelection(ctx);
    const material = materialForGrade(sel.family, sel.grade);
    const viewKey = activeViewKey(ctx);
    // The bolt's normal points along +z by default — the v1 V25 2D paper-space
    // convention is "bolt seen as the head facing the viewer for elev aspect,
    // or its side profile for sec aspect" — both rendered onto the (u, v) plane.
    // Z = 0 keeps the bolt on the view's local plane; the 3D iso scene reads
    // params.aspect + rot to orient the mesh.
    const geometry = v2.model.pointInstance({
      location: { x: cursor.u, y: cursor.v, z: 0 },
      normal: { x: 0, y: 0, z: 1 },
      rotation: sel.rot * Math.PI / 180,
    });
    return v2.transactions.placeElement({
      category: 'fastener',
      family: sel.family,
      type: sel.type,
      geometry: geometry,
      materialId: material,
      params: {
        grade:        sel.grade,
        aspect:       sel.aspect,
        rot:          sel.rot,
        grip:         DEFAULT_GRIP_MM,
        gripOverride: null,
        washers:      'both',
        nutStyle:     'hex',
        v2Source:     'place-bolt-tool',
        v2View:       viewKey,
      },
    });
  }

  const PlaceBoltTool = {
    id: 'place-bolt',
    label: 'Place bolt (v2)',
    chord: ['B', 'B'],   // B then B — reserved for Phase 11 chord wiring

    stateShape: {
      cursor:  null,   // current world coord (for ghost preview)
      preview: null,   // ghost geometry to render this frame (Phase 3 stub)
    },

    onActivate(ctx) {
      ctx.setToolState({ cursor: null, preview: null });
      ctx.requestRender();
    },

    onDeactivate(ctx) {
      ctx.setToolState({ cursor: null, preview: null });
      ctx.requestRender();
    },

    onPointerMove(event, ctx) {
      if (!flagOn()) return false;
      const cursor = ctx.cursor;
      if (!cursor) return false;
      ctx.setToolState({
        cursor: cursor,
        preview: { kind: 'point', u: cursor.u, v: cursor.v },
      });
      ctx.requestRender();
      return true;
    },

    onPointerDown(event, ctx) {
      if (!flagOn()) return false;
      if (event && event.button !== 0) return false;   // left click only
      const cursor = ctx.cursor;
      if (!cursor) return false;
      const tx = buildBoltTx(cursor, ctx);
      if (!tx) return false;
      ctx.applyTransaction(tx);
      // Leave the preview at the cursor so the next click drops another bolt.
      ctx.setToolState({
        cursor: cursor,
        preview: { kind: 'point', u: cursor.u, v: cursor.v },
      });
      ctx.requestRender();
      return true;
    },

    onPointerUp(event, ctx) {
      // Bolts commit on pointer-down (single-click placement); pointer-up
      // is a no-op so a drag-from-the-tile doesn't double-commit.
      void event; void ctx;
      return false;
    },

    onKey(event, ctx) {
      if (!flagOn()) return false;
      if (!event) return false;
      const key = event.key;
      if (key === 'Escape') {
        ctx.setToolState({ cursor: null, preview: null });
        ctx.requestRender();
        return true;
      }
      return false;
    },

    statusText(ctx) {
      void ctx;
      if (!flagOn()) return null;
      return 'Bolt — click to place (single-click)';
    },

    cursorStyle(ctx) {
      void ctx;
      return 'crosshair';
    },
  };

  v2.tools.PlaceBoltTool = PlaceBoltTool;
  // Helper functions exported for tests + the inspector.
  v2.tools.placeBolt = {
    Tool: PlaceBoltTool,
    buildBoltTx: buildBoltTx,
    materialForGrade: materialForGrade,
    activeSelection: activeSelection,
    DEFAULT_FAMILY:  DEFAULT_FAMILY,
    DEFAULT_TYPE:    DEFAULT_TYPE,
    DEFAULT_GRADE:   DEFAULT_GRADE,
    DEFAULT_ASPECT:  DEFAULT_ASPECT,
    DEFAULT_GRIP_MM: DEFAULT_GRIP_MM,
    flagOn:          flagOn,
  };

  if (v2.engine && typeof v2.engine.registerTool === 'function') {
    v2.engine.registerTool(PlaceBoltTool);
  }
})();
