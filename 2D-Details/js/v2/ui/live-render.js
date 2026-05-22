/**
 * StructDraw v2 · UI · live render shim (Phase 1)
 * LAYER: ui — the Phase 1 bridge that paints v2-authoritative plates onto the
 *        user-facing v1 canvas AND inserts THREE.Mesh objects into v1's iso
 *        scene. The full v2 renderer (a viewport-aware View + Canvas2DBackend
 *        bound to v1's canvas) lands in Phase 2+ — this file is the smallest
 *        shim that makes the pilot observable to the user.
 * READS:  v2.appState.model; v2.featureFlags.useV2For.plates;
 *           v2.render.threejs.buildMeshPlate; v1 globals (ctx, LW, real2px,
 *           ppm, colorAlpha, v3dGroup, v3dMatPlate, sheetMode) — `typeof`-guarded.
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
 *   v1 implementation runs we paint v2 plates on top using direct ctx calls
 *   in v1-coordinate space (real2px). This mirrors v1's `drawPlate2D`
 *   visually so the v2 plate is indistinguishable from a v1 plate2 at
 *   pixel-similarity-test resolution.
 * - `v3dRebuildScene` is wrapped: after v1 walks objects3D, we add a Mesh
 *   per v2 plate via `v2.render.threejs.buildMeshPlate`. That uses the v1
 *   plate material (`v3dMatPlate`) so the iso block looks visually consistent
 *   with v1's plate rendering.
 *
 * Both wraps short-circuit when the flag is OFF — the wrapped function calls
 * straight through to the original. That preserves the "byte-identical
 * flag-off browser behaviour" non-interference guarantee.
 *
 * NOTE — this file is the only Phase 1 module that depends on v1's drawing
 * conventions (real2px, LW, ppm). Phase 2's "retire v1 plate path" replaces
 * this with the real Canvas2DRenderer wiring.
 * See PlannedBuilds/architecture-v2/08-pilot-feature.md §4.3 + §4.7 (render
 *     + soak) and 09-build-plan.md "Phase 1" exit criterion.
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

  function flagOn() {
    return v2.featureFlags && typeof v2.featureFlags.get === 'function' && v2.featureFlags.get('plates');
  }

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
    if (!flagOn() || !blk) return;
    if (typeof ctx === 'undefined' || typeof real2px !== 'function') return;
    const ppm_ = (typeof ppm === 'function') ? ppm() : 1;
    const cutLW = (typeof LW === 'object' && LW && typeof LW.CUT === 'number')
      ? LW.CUT * ppm_
      : Math.max(0.7, ppm_);
    const col = cs.getPropertyValue('--entity-color').trim() || '#000000';
    eachV2Plate(function (el) {
      if (plateViewKey(el) !== blk.viewKey) return;
      const pts = plateUV(el);
      if (!pts || pts.length < 2) return;
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
      // Faint fill so v2 plates read as "filled outline" the way v1 plate2 does
      // when fillColour is set — but keep the AS 1100 default of outline-only
      // visual weight by using a very light alpha.
      if (typeof colorAlpha === 'function') {
        ctx.fillStyle = colorAlpha(col, 0.06);
        ctx.fill();
      }
      ctx.stroke();
      // "PL X THK" label at the centroid, matching v1's section-cleat label
      // pattern — uses the plate's `params.thickness` from the place-tool.
      const thk = num(el.params && el.params.thickness, 10);
      let cx = 0, cy = 0;
      for (let j = 0; j < pts.length; j++) { cx += pts[j].u; cy += pts[j].v; }
      cx /= pts.length; cy /= pts.length;
      const cp = real2px(blk, cx, cy);
      ctx.fillStyle = col;
      ctx.font = (Math.max(8, 3 * ppm_)).toFixed(0) + 'px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('PL ' + thk + ' THK', cp.x, cp.y);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
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
    if (!flagOn()) return;
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

  /** Wrap v1's drawBlockContent so v2 plates layer on top of v1 entities. */
  function wrapDrawBlockContent() {
    if (typeof window === 'undefined') return false;
    const orig = window.drawBlockContent;
    if (typeof orig !== 'function' || orig._v2LiveRenderWrapped) return false;
    state.drawBlockOriginal = orig;
    function drawBlockContentWithV2(blk, cs) {
      const result = orig.call(this, blk, cs);
      if (flagOn()) {
        try { drawV2PlatesOnCanvas(blk, cs); }
        catch (e) { if (window.console && console.error) console.error('[v2.ui.liveRender] drawV2Plates threw:', e); }
      }
      return result;
    }
    drawBlockContentWithV2._v2LiveRenderWrapped = true;
    drawBlockContentWithV2._v2LiveRenderOriginal = orig;
    window.drawBlockContent = drawBlockContentWithV2;
    return true;
  }

  /** Wrap v1's v3dRebuildScene so v2 plates appear in the iso block. */
  function wrapV3dRebuild() {
    if (typeof window === 'undefined') return false;
    const orig = window.v3dRebuildScene;
    if (typeof orig !== 'function' || orig._v2LiveRenderWrapped) return false;
    state.v3dRebuildOriginal = orig;
    function v3dRebuildSceneWithV2() {
      const result = orig.apply(this, arguments);
      if (flagOn() && typeof v3dGroup !== 'undefined') {
        try { buildV2PlatesInScene(v3dGroup); }
        catch (e) { if (window.console && console.error) console.error('[v2.ui.liveRender] buildV2Plates threw:', e); }
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
    eachV2Plate: eachV2Plate,
    plateUV: plateUV,
    plateViewKey: plateViewKey,
    state: state,
  };
})();
