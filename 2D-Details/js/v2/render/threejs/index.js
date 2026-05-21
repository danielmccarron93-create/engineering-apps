/**
 * StructDraw v2 · Render Layer · threejs · renderer
 * LAYER: render/threejs — the ThreeJSRenderer module. Holds the RENDERERS
 *        dispatch table, the per-element render loop and the dirty-bus
 *        subscription. Other threejs/ files register their mesh builders here
 *        on load (`registerRenderer('beam:ub', buildMeshBeamUB)`).
 * READS:  globalThis.THREE; window.v2.{render, model, engine, catalogues};
 *           v2.render.threejs.{makeScene, makeCamera, makeLibrary, makeEdgeMaterial,
 *           disposeObject}; v2.render.buildRenderContext / isInView.
 * WRITES: window.v2.render.threejs.{ThreeJSRenderer, RENDERERS, registerRenderer,
 *           lookupDispatch, dispatchKeyFor, renderElement, ensureThreeJSRenderer,
 *           genericMesh}
 *
 * Classic <script>, no build step (CLAUDE.md rules 3 & 8). This file is loaded
 * BEFORE the per-element mesh builders (`build-mesh-beam-ub.js`,
 * `build-mesh-plate.js`, …) because they call
 * `v2.render.threejs.registerRenderer(key, fn)` on load. The renderer is the
 * iso-side cousin of the Phase 0f `Canvas2DRenderer` — same dispatch shape
 * (family-specific → category-generic → genericMesh fallback), same dirty-bus
 * subscription, different backend (THREE.Scene instead of canvas2d primitive log).
 * See 05-render-pipeline.md §§2.3, 4 (dirty regions), 7 (register-one-entry).
 *
 * --- KEYS THE DISPATCH TABLE ACCEPTS --------------------------------------
 *   'beam:ub'      — a specific family in a specific category
 *   'beam:*'       — every family in this category (fallback)
 *   'plate:*'      — plate fallback (every plate family)
 *   'fastener:as1252-bolt'
 *   'fastener:*'   — every fastener family (anchor / screw / shear-stud /
 *                    Rothoblaas HBS) until each gains a dedicated builder.
 * Resolution order on lookup is family-specific → category-generic → null,
 * which falls through to the built-in `genericMesh` placeholder (a small
 * box at the geometry's anchor — keeps dispatch fidelity so nothing silently
 * vanishes in the scene, just like canvas2d's `genericDraw`).
 *
 * --- HIDDEN-SCENE POLICY --------------------------------------------------
 * Per the Phase 0g build plan, the v2 ThreeJSRenderer renders to a HIDDEN
 * test scene — the user-facing iso block keeps using v1's
 * `js/64-3d-engine.js` until the Phase 1 pilot makes plates v2-authoritative.
 * `ensureThreeJSRenderer(opts)` is the public way to grab a renderer; calling
 * it does NOT display anything to the user. No new <canvas> or <div> for v2
 * is added to index.html in Phase 0g.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.render = v2.render || {};
  v2.render.threejs = v2.render.threejs || {};

  if (typeof THREE === 'undefined') {
    if (window.console && console.warn) {
      console.warn('[v2.render.threejs] THREE is undefined — renderer unavailable');
    }
    return;
  }

  /** Map<'category:family' | 'category:*', BuildFn>. */
  const RENDERERS = new Map();

  /**
   * Register a mesh builder under a dispatch key. Re-registering the same key
   * overwrites — that's how a more-specific builder takes over from a
   * category-generic placeholder when its file loads.
   * @param {string} key
   * @param {(element:Element, ctx:RenderContext) => ?THREE.Object3D} fn
   */
  function registerRenderer(key, fn) {
    if (typeof key !== 'string' || typeof fn !== 'function') {
      throw new Error('threejs.registerRenderer: a string key and function fn are required');
    }
    RENDERERS.set(key, fn);
  }

  /**
   * Resolve a (category, family) pair to the best-matching dispatch fn.
   * Family-specific wins; otherwise category-generic; otherwise null.
   */
  function lookupDispatch(category, family) {
    if (!category) return null;
    if (family) {
      const exact = RENDERERS.get(category + ':' + family);
      if (exact) return exact;
    }
    return RENDERERS.get(category + ':*') || null;
  }

  function dispatchKeyFor(element) {
    if (!element) return 'unknown:*';
    const fam = element.family != null ? element.family : '*';
    return element.category + ':' + fam;
  }

  /**
   * Fallback mesh — a tiny semi-transparent box at the geometry's anchor so
   * the element appears in the scene even when no specific mesh builder is
   * registered. Mirrors canvas2d's `genericDraw`: dispatch fidelity is held;
   * nothing silently disappears. The build plan calls this out explicitly:
   * "the RENDERERS dispatch table … A miss falls back to a category-generic
   * builder, NOT to a console error."
   */
  function genericMesh(element, ctx) {
    const anchor = anchorOf(element);
    const size = 10;
    const geom = new THREE.BoxGeometry(size, size, size);
    const mat = (ctx && ctx.threeMaterials)
      ? ctx.threeMaterials.get(ctx.material || null)
      : new THREE.MeshBasicMaterial({ color: 0xff00ff });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.name = 'v2:placeholder:' + (element ? element.id : 'unknown');
    if (anchor) mesh.position.set(anchor.x, anchor.y, anchor.z);
    mesh.userData = mesh.userData || {};
    mesh.userData.v2Placeholder = true;
    return mesh;
  }

  function num(n, dflt) { return (typeof n === 'number' && isFinite(n)) ? n : (dflt === undefined ? 0 : dflt); }

  /** Best-guess anchor point of an element for placeholder positioning. */
  function anchorOf(element) {
    if (!element || !element.geometry) return { x: 0, y: 0, z: 0 };
    const g = element.geometry;
    if (g.kind === 'linear' && g.start && g.end) {
      return {
        x: (num(g.start.x) + num(g.end.x)) / 2,
        y: (num(g.start.y) + num(g.end.y)) / 2,
        z: (num(g.start.z) + num(g.end.z)) / 2,
      };
    }
    if (g.kind === 'point' && g.location) {
      return { x: num(g.location.x), y: num(g.location.y), z: num(g.location.z) };
    }
    if (g.kind === 'plate' && g.origin) {
      return { x: num(g.origin.x), y: num(g.origin.y), z: num(g.origin.z) };
    }
    if ((g.kind === 'region' || g.kind === 'polyline') && Array.isArray(g.polygon || g.points)) {
      const pts = g.polygon || g.points;
      let sx = 0, sy = 0, sz = 0;
      for (let i = 0; i < pts.length; i++) {
        sx += num(pts[i].x); sy += num(pts[i].y); sz += num(pts[i].z);
      }
      return { x: sx / pts.length, y: sy / pts.length, z: sz / pts.length };
    }
    return { x: 0, y: 0, z: 0 };
  }

  /**
   * Render a single element into the supplied scene-ops. Returns a small
   * struct describing how the dispatch resolved — used by the renderer itself
   * and by tests that want to assert "every element got dispatched somewhere".
   */
  function renderElement(element, model, view, sceneOps, materials, opts) {
    opts = opts || {};
    const ctx = v2.render.buildRenderContext(element, model, {
      view: view,
      rendererName: 'threejs',
      backend: sceneOps,
      isSelected: opts.isSelected === true,
      isHovered:  opts.isHovered === true,
      cutClass:   opts.cutClass,
    });
    // Augment the standard context with threejs-specific affordances. Mesh
    // builders read these instead of reaching into the global namespace.
    ctx.threeMaterials = materials;
    ctx.scene = sceneOps && sceneOps.scene  || null;
    ctx.group = sceneOps && sceneOps.group  || null;

    const fn = lookupDispatch(element.category, element.family);
    const used = fn || genericMesh;
    let ok = true;
    let mesh = null;
    let error = null;
    try {
      mesh = used(element, ctx);
    } catch (e) {
      ok = false;
      error = e;
      if (window.console && console.error) {
        console.error('[v2.render.threejs] mesh fn for ' +
          dispatchKeyFor(element) + ' threw:', e);
      }
    }
    if (ok && mesh && sceneOps && typeof sceneOps.upsertMesh === 'function') {
      sceneOps.upsertMesh(element.id, mesh);
    }
    return {
      elementId: element.id,
      key: dispatchKeyFor(element),
      resolved: fn ? 'specific' : 'fallback',
      ok: ok,
      error: error,
      mesh: mesh,
    };
  }

  /**
   * Bind a renderer to a fresh scene. Returns a handle exposing the scene
   * graph, the per-render loop, the dirty hook and a teardown. The handle is
   * what the Phase 1 pilot will pass to a WebGLRenderer when it wires the v2
   * scene into the user-facing iso block; the JSDOM test consumes the same
   * handle without ever instantiating WebGL.
   *
   * @param {object} [opts]
   * @param {boolean} [opts.showAxes=false]            mounts an AxesHelper
   * @param {boolean} [opts.transparent=false]         start materials transparent
   * @param {number}  [opts.opacity=1.0]
   * @param {boolean} [opts.subscribeDirty=false]      auto-subscribe to dirtyBus
   * @returns {object}
   */
  function ensureThreeJSRenderer(opts) {
    opts = opts || {};
    const sceneObj = v2.render.threejs.makeScene(opts);
    const camera   = v2.render.threejs.makeCamera(opts);
    const materials = v2.render.threejs.makeLibrary(opts);

    /** Map<ElementId, THREE.Object3D> — the renderer's scene-graph cache. */
    const meshById = new Map();

    function upsertMesh(id, obj) {
      if (!obj) return;
      if (meshById.has(id)) {
        const old = meshById.get(id);
        if (old !== obj) {
          sceneObj.group.remove(old);
          v2.render.threejs.disposeObject(old);
        }
      }
      meshById.set(id, obj);
      obj.userData = obj.userData || {};
      obj.userData.v2ElementId = id;
      // Re-adding an Object3D already in the scene is a no-op in r128 — but
      // since the old object was just removed above, this branch always adds.
      sceneObj.group.add(obj);
    }

    function removeMesh(id) {
      if (!meshById.has(id)) return;
      const obj = meshById.get(id);
      sceneObj.group.remove(obj);
      v2.render.threejs.disposeObject(obj);
      meshById.delete(id);
    }

    function clearMeshes() {
      meshById.forEach(function (obj) {
        sceneObj.group.remove(obj);
        v2.render.threejs.disposeObject(obj);
      });
      meshById.clear();
    }

    const sceneOps = {
      scene: sceneObj.scene,
      group: sceneObj.group,
      upsertMesh: upsertMesh,
      removeMesh: removeMesh,
    };

    /** Last render's dispatch records — exposed for tests. */
    let lastDispatch = [];

    /**
     * Render every element visible in `view` into the scene. When `dirtyRegion`
     * names specific elements, only those are rebuilt; otherwise every element
     * in the model is reconsidered AND any cached mesh whose element no longer
     * exists in the model is dropped (orphan GC). View-local geometry only
     * renders in its matching view; model-level geometry (linear / plate /
     * point) renders in every view — same rule as the canvas2d renderer via
     * `v2.render.isInView`.
     *
     * @param {StructuralModel} model
     * @param {View} view
     * @param {?DirtySet} dirtyRegion
     * @returns {Array<{elementId:string, key:string, resolved:string, ok:boolean}>}
     */
    function render(model, view, dirtyRegion) {
      if (!model) { lastDispatch = []; return lastDispatch; }
      const haveDirty = dirtyRegion && dirtyRegion.elements instanceof Set && dirtyRegion.elements.size > 0;
      // Determine the iteration order. Phase 0g optimisation: full rebuild on
      // every render unless an explicit dirty hint is supplied. Iteration order
      // for full rebuilds is the model's insertion order — the same order the
      // canvas2d renderer uses for painter's algorithm.
      let ids;
      if (haveDirty) {
        ids = Array.from(dirtyRegion.elements);
      } else {
        // Union of model ids + currently-cached mesh ids — covers BOTH new
        // elements AND elements deleted between renders. Without the union,
        // a deleted element's id is never visited and its mesh persists.
        const merged = new Set();
        model.elements.forEach(function (_v, k) { merged.add(k); });
        meshById.forEach(function (_o, k) { merged.add(k); });
        ids = Array.from(merged);
      }

      const dispatches = [];
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const elem = model.elements.get(id);
        if (!elem) {
          // Element absent from the model — GC its mesh if we still cache it.
          const hadMesh = meshById.has(id);
          if (hadMesh) removeMesh(id);
          dispatches.push({ elementId: id, key: null, resolved: 'deleted', ok: true, mesh: null });
          continue;
        }
        if (view && !v2.render.isInView(elem, view)) {
          removeMesh(id);
          dispatches.push({
            elementId: elem.id, key: dispatchKeyFor(elem),
            resolved: 'out-of-view', ok: true, mesh: null,
          });
          continue;
        }
        dispatches.push(renderElement(elem, model, view, sceneOps, materials));
      }
      lastDispatch = dispatches;
      return dispatches;
    }

    /**
     * Subscribe to the v2 dirty bus. The Phase 0g optimisation is "rebuild every
     * mesh on any model-change"; the dirty hint reaches the renderer but the
     * spatial-index optimisation is deferred per 05 §8. Returns an unsubscribe.
     */
    function attachDirty(handler) {
      if (!v2.engine || !v2.engine.dirtyBus || typeof v2.engine.dirtyBus.on !== 'function') {
        return function noop() {};
      }
      return v2.engine.dirtyBus.on('model-changed', function (payload) {
        try { handler(payload); } catch (e) {
          if (window.console && console.error) {
            console.error('[v2.render.threejs] dirty handler threw:', e);
          }
        }
      });
    }

    function dispose() {
      clearMeshes();
      // Drop lights + axes too so a re-creation starts from a clean scene.
      v2.render.threejs.disposeObject(sceneObj.scene);
      materials.dispose();
    }

    const handle = {
      name: 'threejs',
      scene: sceneObj.scene,
      group: sceneObj.group,
      camera: camera,
      lights: { ambient: sceneObj.ambient, key: sceneObj.key, fill: sceneObj.fill, axes: sceneObj.axes },
      materials: materials,
      meshById: meshById,
      meshFor: function (id) { return meshById.get(id) || null; },
      upsertMesh: upsertMesh,
      removeMesh: removeMesh,
      clear: clearMeshes,
      render: render,
      attachDirty: attachDirty,
      dispose: dispose,
      lastDispatch: function () { return lastDispatch; },
    };

    if (opts.subscribeDirty === true) {
      // Phase 0g scaffold: rebuild every mesh on every model-changed event.
      // The Phase 1 pilot will refine this to consume the dirty set verbatim.
      handle._dirtyOff = attachDirty(function () { /* caller renders */ });
    }

    return handle;
  }

  /** The ThreeJSRenderer module — matches 05-render-pipeline.md §2.3. */
  const ThreeJSRenderer = {
    name: 'threejs',
    RENDERERS: RENDERERS,
    registerRenderer: registerRenderer,
    lookupDispatch:   lookupDispatch,
    dispatchKeyFor:   dispatchKeyFor,
    renderElement:    renderElement,
    ensureThreeJSRenderer: ensureThreeJSRenderer,
    genericMesh:      genericMesh,
  };

  v2.render.threejs.ThreeJSRenderer       = ThreeJSRenderer;
  v2.render.threejs.RENDERERS             = RENDERERS;
  v2.render.threejs.registerRenderer      = registerRenderer;
  v2.render.threejs.lookupDispatch        = lookupDispatch;
  v2.render.threejs.dispatchKeyFor        = dispatchKeyFor;
  v2.render.threejs.renderElement         = renderElement;
  v2.render.threejs.ensureThreeJSRenderer = ensureThreeJSRenderer;
  v2.render.threejs.genericMesh           = genericMesh;

  // Bump the BUILD stamp now that Phase 0g's renderer is online.
  if (v2.BUILD) {
    v2.BUILD.phase = '0g';
    if (Array.isArray(v2.BUILD.layers) && v2.BUILD.layers.indexOf('render-threejs') === -1) {
      v2.BUILD.layers.push('render-threejs');
    }
    v2.BUILD.note = 'Model + transactions + catalogue + io + render scaffold (canvas2d + threejs) layers. v1 still authoritative for the running app.';
  }
})();
