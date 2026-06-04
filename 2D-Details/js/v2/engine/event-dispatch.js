/**
 * StructDraw v2 · Engine Layer · event dispatch
 * LAYER: engine — the pointer / key router. The v2 cousin of v1's
 *        `js/39-events.js` (1,601 lines). For Phase 1 it only intercepts
 *        events when a v2 tool is active AND the relevant feature flag is on;
 *        every other event is left for v1 to handle, exactly as today.
 * READS:  window.v2.engine.{getActiveTool, activeTool}; window.v2.appState;
 *           window.v2.featureFlags; v1 globals (canvas, activeBlock, px2real)
 *           — guarded by `typeof` checks.
 * WRITES: window.v2.engine.eventDispatch.{install, uninstall, buildCtx,
 *           handlerNames, handlersFor}
 *
 * Classic <script>, no build step (CLAUDE.md rules 3 & 8). Loading this file
 * only defines the namespace. install() is called by `js/v2/engine/init.js`
 * on DOMContentLoaded, AFTER v1 has bound its own canvas listeners (so v2's
 * capture-phase listeners run BEFORE v1's bubble-phase ones — and can
 * `stopImmediatePropagation()` selectively when a v2 tool wants to claim
 * the event).
 *
 * NON-INTERFERENCE GUARANTEE: when `v2.engine.activeTool() === null`, every
 * listener here is a no-op and passes through to v1 — the flag-off browser
 * behaviour is byte-identical to today.
 * See PlannedBuilds/architecture-v2/06-tools-and-transactions.md §2.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.engine = v2.engine || {};

  /** Which DOM event names route through this dispatcher. */
  const POINTER_EVENTS = ['pointerdown', 'pointermove', 'pointerup'];
  const KEY_EVENTS     = ['keydown'];

  /** Bookkeeping for install/uninstall. */
  const handle = {
    installed: false,
    canvas: null,
    listeners: [],     // [{target, event, fn, opts}]
  };

  function num(n) { return typeof n === 'number' && isFinite(n) ? n : 0; }

  /**
   * Read a v1 global by bare name with a `typeof` guard. The bare reference
   * is reached only when the guard has already proven the binding exists.
   * Mirrors the same pattern used in v1-bridge.readV1State.
   */
  function readBare(name) {
    switch (name) {
      case 'activeBlock':  return (typeof activeBlock  !== 'undefined') ? activeBlock  : null;
      case 'sheetMode':    return (typeof sheetMode    !== 'undefined') ? sheetMode    : null;
      case 'canvas':       return (typeof canvas       !== 'undefined') ? canvas       : null;
      case 'viewport':     return (typeof viewport     !== 'undefined') ? viewport     : null;
      case 'drawingScale': return (typeof drawingScale !== 'undefined') ? drawingScale : 1;
      case 'tool':         return (typeof tool         !== 'undefined') ? tool         : null;
      default: return null;
    }
  }

  /**
   * Convert a pointer event's clientX/clientY to real-world (u, v) mm for the
   * currently active v1 detail block. Mirrors v1's `px2real(blk, px, py)`
   * pipeline but is `typeof`-guarded so JSDOM tests don't fault.
   * @param {PointerEvent} event
   * @returns {?{u:number, v:number, blk:object}}
   */
  function viewToModel(event) {
    const blk = readBare('activeBlock');
    if (!blk) return null;
    if (typeof px2real !== 'function') return null;
    const target = handle.canvas || event.target;
    if (!target || typeof target.getBoundingClientRect !== 'function') return null;
    const rect = target.getBoundingClientRect();
    const px = num(event.clientX) - rect.left;
    const py = num(event.clientY) - rect.top;
    // px2real returns { u, v } already in real-world mm.
    const uv = px2real(blk, px, py);
    let u = uv.u, v = uv.v;
    // plate-orientation-presets: RAW cursor while an edit-plate drag is live.
    // Skips per-move snapUV grid-snap + scan lag and lets edit-plate do its own
    // ortho / soft-snap. Placement is unaffected — no edit-plate drag is live
    // when the place-plate tool is the one running.
    const _ep = window.v2 && v2.tools && v2.tools.editPlate && v2.tools.editPlate.state;
    if (_ep && (_ep.bodyDrag || _ep.dragging || _ep.rotateDrag)) {
      return { u: u, v: v, blk: blk };
    }
    // Fix A (2026-05-23): v25 endpoint snap FIRST — catches vertex points
    // precisely with smaller tolerance + visual marker priority. Mirrors v1
    // getCursor()'s pipeline so v2 tools feel identical to v1 v25 tools.
    if (typeof v25TrySnap === 'function') {
      try {
        const v25Snap = v25TrySnap(blk, u, v, null, null);
        if (v25Snap && typeof v25Snap.u === 'number' && typeof v25Snap.v === 'number') {
          return { u: v25Snap.u, v: v25Snap.v, blk: blk };
        }
      } catch (e) {
        if (window.console && console.error) {
          console.error('[v2.engine.eventDispatch] v25TrySnap threw:', e);
        }
      }
    }
    // Fix 2 (2026-05-23): snapUV pass — grid + edge-snap + entity-snap.
    // The snapUV edge-snap gate recognises v2's place-plate (see js/09-snap.js).
    if (typeof snapUV === 'function') {
      try {
        const snapped = snapUV(blk, u, v);
        if (Array.isArray(snapped) && snapped.length >= 2 &&
            typeof snapped[0] === 'number' && typeof snapped[1] === 'number') {
          u = snapped[0]; v = snapped[1];
        }
      } catch (e) {
        if (window.console && console.error) {
          console.error('[v2.engine.eventDispatch] snapUV threw (using raw coords):', e);
        }
      }
    }
    return { u: u, v: v, blk: blk };
  }

  /**
   * Build the per-event tool context. The tool consults this for the model,
   * the active view (v1 block), the cursor location in model coords, and the
   * helpers it needs to apply transactions.
   * @param {?Event} event
   * @returns {object}
   */
  function buildCtx(event) {
    const appState = v2.appState || {};
    const toolId = v2.engine.activeTool() ? v2.engine.activeTool().id : null;
    if (toolId && (!appState.tools || !appState.tools[toolId])) {
      if (!appState.tools) appState.tools = {};
      appState.tools[toolId] = {};
    }
    const ctx = {
      event:    event || null,
      model:    appState.model || null,
      appState: appState,
      blk:      readBare('activeBlock'),
      sheetMode: readBare('sheetMode'),
      activeFamily: (appState.ui && appState.ui.activeFamily) || null,
      activeType:   (appState.ui && appState.ui.activeType)   || null,
      cursor:   event ? viewToModel(event) : null,
      toolState: toolId ? appState.tools[toolId] : {},
      setToolState(updates) {
        if (!toolId) return;
        Object.assign(appState.tools[toolId], updates || {});
      },
      requestRender() {
        if (typeof requestRender === 'function') requestRender();
        if (typeof v3dMarkDirty === 'function') v3dMarkDirty();
      },
      applyTransaction(tx) {
        if (!v2.engine.undoStack || typeof v2.engine.undoStack.applyTransaction !== 'function') {
          throw new Error('buildCtx: v2.engine.undoStack is not loaded');
        }
        return v2.engine.undoStack.applyTransaction(tx);
      },
    };
    return ctx;
  }

  /**
   * Route one DOM event to the active tool's matching handler. Returns true
   * when the tool consumed it (which means we should also stop v1's listeners
   * via `stopImmediatePropagation` + `preventDefault`); false when no v2 tool
   * is active or the tool didn't claim the event.
   * @param {string} handlerName  e.g. 'onPointerDown'
   * @param {Event}  event
   * @returns {boolean}
   */
  function route(handlerName, event) {
    const tool = v2.engine.activeTool();
    if (!tool) {
      // noteBox fix (2026-06-02) — the edit-plate fallback below only gets
      // "first dibs" when the v1 tool is SELECT. When a v1 drawing / placement
      // tool is active (e.g. 'v25-notebox', 'v25-note'), v2.engine.activeTool()
      // is null but the click belongs to v1: claiming it for plate selection
      // would stopImmediatePropagation() and swallow v1's placement click.
      // Bail to v1 (return false = pass-through) for any non-select v1 tool.
      // `tool` here is shadowed by the local v2 const above, so read the v1
      // global via readBare('tool'). Scope this to POINTER events only — onKey
      // (Delete/Escape on a selected plate), dblclick and wheel must still
      // reach the edit-plate fallback even while a v1 drawing tool is active.
      const isPointer = (handlerName === 'onPointerDown'
                      || handlerName === 'onPointerMove'
                      || handlerName === 'onPointerUp');
      const v1tool = (typeof readBare('tool') === 'string') ? readBare('tool') : null;
      if (isPointer && v1tool && v1tool !== 'select') return false;
      // Fix M (2026-05-23) — no active v2 tool, but the edit-plate fallback
      // wants first dibs on vertex / edge clicks (and pointermove / up during
      // a drag it started). Dispatch to editPlate; if it doesn't claim, fall
      // through to v1 as before.
      const editPlate = v2.tools && v2.tools.editPlate;
      if (editPlate && typeof editPlate[handlerName] === 'function') {
        const ctx = buildCtx(event);
        try {
          const r = editPlate[handlerName](event, ctx);
          if (r) {
            if (event && typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
            if (event && typeof event.preventDefault === 'function') event.preventDefault();
            return true;
          }
        } catch (e) {
          if (window.console && console.error) {
            console.error('[v2.engine.eventDispatch] editPlate ' + handlerName + ' threw:', e);
          }
        }
      }
      return false;
    }
    const fn = tool[handlerName];
    if (typeof fn !== 'function') return false;
    const ctx = buildCtx(event);
    let claimed = false;
    try {
      const r = fn(event, ctx);
      // A tool can explicitly return `false` to pass through to v1; otherwise
      // it claims the event. This matches the v2 contract: "tools that bind a
      // handler at all do so to ACT on the event."
      claimed = (r !== false);
    } catch (e) {
      if (window.console && console.error) {
        console.error('[v2.engine.eventDispatch] tool "' + tool.id +
          '" handler ' + handlerName + ' threw:', e);
      }
      // A throwing handler does NOT claim the event — let v1 still run.
      claimed = false;
    }
    if (claimed && event) {
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      if (typeof event.preventDefault === 'function')           event.preventDefault();
    }
    return claimed;
  }

  function bindOne(target, eventName, fn, opts) {
    if (!target || typeof target.addEventListener !== 'function') return;
    target.addEventListener(eventName, fn, opts);
    handle.listeners.push({ target: target, event: eventName, fn: fn, opts: opts });
  }

  /**
   * Mount the v2 event dispatcher onto a canvas (and the document for key
   * events). Idempotent — a second call while installed is a no-op.
   * @param {?HTMLCanvasElement} canvas
   * @param {object} [opts]
   * @returns {object} the handle
   */
  function install(canvas, opts) {
    if (handle.installed) return handle;
    canvas = canvas || readBare('canvas');
    if (!canvas) return handle;     // pre-DOM call (JSDOM tests): silent no-op
    handle.canvas = canvas;
    const cap = { capture: true, passive: false };
    POINTER_EVENTS.forEach(function (ev) {
      const handlerName = 'on' + ev.charAt(0).toUpperCase() + ev.slice(1).replace(/down|move|up/, function (m) {
        return m.charAt(0).toUpperCase() + m.slice(1);
      });
      bindOne(canvas, ev, function (event) { route(handlerName, event); }, cap);
    });
    bindOne(canvas, 'dblclick', function (event) { route('onDblClick', event); }, cap);
    bindOne(canvas, 'wheel',    function (event) { route('onWheel',    event); }, cap);
    const doc = (opts && opts.documentRef) || (typeof document !== 'undefined' ? document : null);
    if (doc) {
      KEY_EVENTS.forEach(function (ev) {
        bindOne(doc, ev, function (event) { route('onKey', event); }, cap);
      });
    }
    handle.installed = true;
    return handle;
  }

  /** Tear down every listener mounted by install(). Idempotent. */
  function uninstall() {
    if (!handle.installed) return;
    for (let i = 0; i < handle.listeners.length; i++) {
      const l = handle.listeners[i];
      if (l.target && typeof l.target.removeEventListener === 'function') {
        l.target.removeEventListener(l.event, l.fn, l.opts);
      }
    }
    handle.listeners.length = 0;
    handle.canvas = null;
    handle.installed = false;
  }

  v2.engine.eventDispatch = {
    install:   install,
    uninstall: uninstall,
    buildCtx:  buildCtx,
    viewToModel: viewToModel,
    route:     route,
    handle:    handle,
  };
})();
