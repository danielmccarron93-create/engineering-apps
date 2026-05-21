/**
 * StructDraw v2 · Render Layer · canvas2d · renderer
 * LAYER: render/canvas2d — the Canvas2DRenderer module. Holds the RENDERERS
 *        dispatch table, the HIT_TESTS table, the per-view render loop and
 *        the dirty-bus subscription. Other canvas2d/ files register their
 *        draw / hit functions here on load.
 * READS:  window.v2.{render, model, engine}; v2.render.canvas2d.makeBackend;
 *           v2.render.{buildRenderContext, elementsForView, classifyCut};
 *           v2.engine.dirtyBus (optional — subscribes if available).
 * WRITES: window.v2.render.canvas2d.{Canvas2DRenderer, RENDERERS, HIT_TESTS,
 *           registerRenderer, registerHitTest, ensureCanvasRenderer}
 *
 * Classic <script>, no build step (CLAUDE.md rules 3 & 8). This file is loaded
 * BEFORE the per-element draw files (`draw-beam-ub.js`, `draw-plate.js`, …)
 * because they call `v2.render.canvas2d.registerRenderer(key, fn)` on load.
 * The renderer iterates elements with PROJECTED z-order (the model's Map keeps
 * insertion order — that's the v1 painter's-algorithm equivalent).
 * See 05-render-pipeline.md §§1-4, 6, 9.
 *
 * --- KEYS THE DISPATCH TABLE ACCEPTS --------------------------------------
 *   'beam:ub'      — a specific family in a specific category
 *   'beam:*'       — every family in this category (fallback)
 *   'plate:*'      — plate fallback (every plate family)
 *   'fastener:as1252-bolt'
 *   ...
 * Resolution order on lookup is family-specific → category-generic → null
 * (which falls through to a built-in `genericDraw` that emits an outline
 * polyline for the element's projected geometry; no element is ever lost,
 * the test asserts dispatch fidelity).
 *
 * --- HIDDEN-CANVAS POLICY -------------------------------------------------
 * Per the Phase 0f build plan, the v2 renderer renders to a HIDDEN test
 * canvas — the user-facing canvas keeps using v1 until the Phase 1 pilot
 * makes plates v2-authoritative. `ensureCanvasRenderer(canvasEl, opts)` is the
 * public way to grab a renderer bound to a particular canvas; calling it does
 * not display anything to the user. No <canvas> tag is added to index.html
 * for v2 in this phase.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.render = v2.render || {};
  v2.render.canvas2d = v2.render.canvas2d || {};

  /** Map<'category:family' | 'category:*', RenderFn>. */
  const RENDERERS = new Map();
  /** Map<'category:family' | 'category:*', HitFn>. */
  const HIT_TESTS = new Map();

  /**
   * Register a draw function under a dispatch key. Re-registering the same
   * key overwrites — that's how a more-specific draw function takes over from
   * a category-generic placeholder when its file loads.
   * @param {string} key
   * @param {(element:Element, ctx:RenderContext) => void} fn
   */
  function registerRenderer(key, fn) {
    if (typeof key !== 'string' || typeof fn !== 'function') {
      throw new Error('canvas2d.registerRenderer: a string key and function fn are required');
    }
    RENDERERS.set(key, fn);
  }

  /**
   * Register a hit-test function.
   * @param {string} key
   * @param {(element:Element, view:View, point2D:Point2D, ctx:RenderContext) => ?object} fn
   */
  function registerHitTest(key, fn) {
    if (typeof key !== 'string' || typeof fn !== 'function') {
      throw new Error('canvas2d.registerHitTest: a string key and function fn are required');
    }
    HIT_TESTS.set(key, fn);
  }

  /**
   * Resolve a (category, family) pair to the best-matching dispatch fn.
   * Family-specific wins; otherwise category-generic; otherwise null.
   */
  function lookupDispatch(table, category, family) {
    if (!category) return null;
    if (family) {
      const exact = table.get(category + ':' + family);
      if (exact) return exact;
    }
    return table.get(category + ':*') || null;
  }

  /**
   * Fallback draw — emits the element's projected outline so it appears on
   * the canvas even when no specific draw function is registered. The test
   * asserts dispatch fidelity via `lastDispatch` (below), so a fallback hit
   * is observable; nothing silently disappears.
   */
  function genericDraw(element, ctx) {
    const view = ctx.view;
    if (!view || !ctx.backend) return;
    const pts = v2.render.projectGeometry2D(element.geometry, view);
    if (!pts.length) return;
    const weightKey =
      ctx.cutClass === 'cut' ? 'thick'
      : (ctx.category && ctx.category.key === 'annotation') ? 'thin'
      : 'medium';
    if (pts.length === 1) {
      ctx.backend.draw(v2.render.primitives.arc(pts[0], 1.0, {
        weight: weightKey, style: 'solid', color: ctx.color,
      }));
      return;
    }
    if (pts.length === 2) {
      ctx.backend.draw(v2.render.primitives.line(pts[0], pts[1], {
        weight: weightKey, style: 'solid', color: ctx.color,
      }));
      return;
    }
    // 3+ points: emit a closed polyline (no fill) so hit-test and visual
    // both work for unknown geometry shapes.
    ctx.backend.draw(v2.render.primitives.polyline(pts, {
      closed: true, weight: weightKey, style: 'solid', color: ctx.color,
    }));
  }

  function dispatchKeyFor(element) {
    if (!element) return 'unknown:*';
    const fam = element.family != null ? element.family : '*';
    return element.category + ':' + fam;
  }

  /**
   * Render a single element into the supplied backend. Returns a small struct
   * describing how the dispatch resolved — used by the renderer itself and by
   * tests that want to assert "every element got dispatched somewhere".
   */
  function renderElement(element, model, view, backend, opts) {
    opts = opts || {};
    const ctx = v2.render.buildRenderContext(element, model, {
      view: view,
      backend: backend,
      rendererName: 'canvas2d',
      cutClass: opts.cutClass,
      isSelected: opts.isSelected === true,
      isHovered:  opts.isHovered === true,
    });
    const fn = lookupDispatch(RENDERERS, element.category, element.family);
    const used = fn || genericDraw;
    let ok = true;
    let error = null;
    try {
      used(element, ctx);
    } catch (e) {
      ok = false;
      error = e;
      if (window.console && console.error) {
        console.error('[v2.render.canvas2d] draw fn for ' +
          dispatchKeyFor(element) + ' threw:', e);
      }
    }
    return {
      elementId: element.id,
      key: dispatchKeyFor(element),
      resolved: fn ? 'specific' : 'fallback',
      ok: ok,
      error: error,
    };
  }

  /**
   * Render every element visible in `view` into the backend. Returns an array
   * of dispatch records (one per visible element) so callers can assert
   * coverage. Does not clear the canvas — callers do that via
   * `backend.clearCanvas(w, h)` ahead of the render pass.
   * @param {StructuralModel} model
   * @param {View} view
   * @param {?DirtySet} dirtyRegion
   * @param {Backend} backend
   * @param {object} [opts]   { selection: Set<ElementId>, hover: ElementId }
   * @returns {Array<{elementId:string, key:string, resolved:string, ok:boolean}>}
   */
  function renderView(model, view, dirtyRegion, backend, opts) {
    opts = opts || {};
    const selection = opts.selection instanceof Set ? opts.selection : null;
    const hover     = typeof opts.hover === 'string' ? opts.hover : null;
    const elements  = v2.render.elementsForView(model, view, dirtyRegion);
    const dispatches = [];
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      dispatches.push(renderElement(el, model, view, backend, {
        isSelected: selection ? selection.has(el.id) : false,
        isHovered:  hover === el.id,
      }));
    }
    return dispatches;
  }

  /**
   * Hit-test every element in `view`, top-most first (insertion order is
   * back-to-front, so we walk the reverse). Returns the first match.
   * @returns {?{element:Element, key:string, ...}}
   */
  function hitTestView(model, view, point2D, opts) {
    opts = opts || {};
    const candidates = v2.render.elementsForView(model, view).reverse();
    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i];
      if (opts.categories && opts.categories.indexOf(el.category) === -1) continue;
      const fn = lookupDispatch(HIT_TESTS, el.category, el.family);
      if (!fn) continue;
      const ctx = v2.render.buildRenderContext(el, model, { view: view });
      const res = fn(el, view, point2D, ctx);
      if (res) return Object.assign({ element: el, key: dispatchKeyFor(el) }, res);
    }
    return null;
  }

  /**
   * Return every element under the point, top-most first (the v2 cousin of
   * v1's `v25HitTestAll` — feeds click-cycle-selection's eventual port).
   */
  function hitTestAllView(model, view, point2D, opts) {
    opts = opts || {};
    const candidates = v2.render.elementsForView(model, view).reverse();
    const out = [];
    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i];
      if (opts.categories && opts.categories.indexOf(el.category) === -1) continue;
      const fn = lookupDispatch(HIT_TESTS, el.category, el.family);
      if (!fn) continue;
      const ctx = v2.render.buildRenderContext(el, model, { view: view });
      const res = fn(el, view, point2D, ctx);
      if (res) out.push(Object.assign({ element: el, key: dispatchKeyFor(el) }, res));
    }
    return out;
  }

  /**
   * Bind a renderer to a canvas element. Returns a small handle exposing the
   * backend, the dirty hook, the per-view render loop and a teardown.
   *
   * `canvasEl` may be:
   *   - an HTMLCanvasElement (browser) — getContext('2d') yields the sink
   *   - null (JSDOM test) — the backend records primitives but draws nothing
   *
   * @param {?HTMLCanvasElement} canvasEl
   * @param {object} [opts]
   * @param {number} [opts.ppm=1]
   * @returns {object}
   */
  function ensureCanvasRenderer(canvasEl, opts) {
    opts = opts || {};
    const ctx2d = (canvasEl && typeof canvasEl.getContext === 'function')
      ? canvasEl.getContext('2d') : null;
    const backend = v2.render.canvas2d.makeBackend(ctx2d, {
      ppm: typeof opts.ppm === 'number' ? opts.ppm : 1,
      record: opts.record !== false,
      recordCap: opts.recordCap,
      colorOverride: opts.colorOverride || null,
    });

    /** Last render's dispatch records — exposed for tests. */
    let lastDispatch = [];

    function render(model, view, dirtyRegion) {
      // Phase 0f scaffold: redraw whole canvas. Tile cache + dirty rect
      // optimisation lands in a later phase per 05 §§4, 8.
      if (canvasEl) backend.clearCanvas(canvasEl.width, canvasEl.height);
      backend.reset();
      lastDispatch = renderView(model, view, dirtyRegion, backend, opts);
      return lastDispatch;
    }

    /**
     * Subscribe to the v2 dirty bus. The Phase 0f optimisation is "redraw
     * everything on any model-change"; the dirty hint reaches the renderer
     * but the spatial-index optimisation is deferred. Returns an unsubscribe.
     */
    function attachDirty(handler) {
      if (!v2.engine || !v2.engine.dirtyBus || typeof v2.engine.dirtyBus.on !== 'function') {
        return function noop() {};
      }
      return v2.engine.dirtyBus.on('model-changed', function (payload) {
        try { handler(payload); } catch (e) {
          if (window.console && console.error) {
            console.error('[v2.render.canvas2d] dirty handler threw:', e);
          }
        }
      });
    }

    return {
      backend: backend,
      canvas: canvasEl || null,
      render: render,
      attachDirty: attachDirty,
      hitTest: function (model, view, point2D, hitOpts) {
        return hitTestView(model, view, point2D, hitOpts);
      },
      hitTestAll: function (model, view, point2D, hitOpts) {
        return hitTestAllView(model, view, point2D, hitOpts);
      },
      lastDispatch: function () { return lastDispatch; },
    };
  }

  /** The Canvas2DRenderer module — matches 05-render-pipeline.md §2.1. */
  const Canvas2DRenderer = {
    name: 'canvas2d',
    RENDERERS: RENDERERS,
    HIT_TESTS: HIT_TESTS,
    registerRenderer: registerRenderer,
    registerHitTest: registerHitTest,
    lookupDispatch: lookupDispatch,
    dispatchKeyFor: dispatchKeyFor,
    renderElement: renderElement,
    renderView: renderView,
    hitTestView: hitTestView,
    hitTestAllView: hitTestAllView,
    ensureCanvasRenderer: ensureCanvasRenderer,
    genericDraw: genericDraw,
  };

  v2.render.canvas2d.Canvas2DRenderer  = Canvas2DRenderer;
  v2.render.canvas2d.RENDERERS         = RENDERERS;
  v2.render.canvas2d.HIT_TESTS         = HIT_TESTS;
  v2.render.canvas2d.registerRenderer  = registerRenderer;
  v2.render.canvas2d.registerHitTest   = registerHitTest;
  v2.render.canvas2d.ensureCanvasRenderer = ensureCanvasRenderer;
})();
