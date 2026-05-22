/**
 * StructDraw v2 · Engine Layer · active tool registry
 * LAYER: engine — the tool registry + active-tool state. Tools self-register
 *        here on load; the event-dispatch layer asks for the current active
 *        tool on every pointer / key event.
 * READS:  window.v2.engine.dirtyBus (optional — emits 'tool-changed' on set)
 * WRITES: window.v2.engine.activeTool, window.v2.engine.registerTool,
 *           window.v2.engine.setActiveTool, window.v2.engine.getActiveTool,
 *           window.v2.engine.getTool, window.v2.engine.TOOLS
 *
 * Classic <script>, no build step (CLAUDE.md rules 3 & 8). Loading this file
 * only creates the registry; tools are registered when their own scripts load.
 * The v2 tool shape matches PlannedBuilds/architecture-v2/06-tools-and-transactions.md §1
 * — `{ id, label, chord?, stateShape, onActivate?, onDeactivate?, onPointer*,
 *      onKey?, drawPreview?, statusText?, cursorStyle? }`.
 *
 * Phase 1 ships a single tool — `place-plate` — and the chord layer is a stub
 * because the BB-rail tile activates the tool directly. Phase 11+ (the full
 * tool migration sweep) wires chord activation here.
 * See PlannedBuilds/architecture-v2/06-tools-and-transactions.md §§1-2 and
 *     PlannedBuilds/architecture-v2/09-build-plan.md "Phase 1".
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.engine = v2.engine || {};

  /** id -> Tool. Insertion order preserved so the chord-search is stable. */
  const TOOLS = new Map();

  /** The currently-active tool id, or null when no v2 tool is active. */
  let activeId = null;

  function emit(event, payload) {
    if (v2.engine && v2.engine.dirtyBus &&
        typeof v2.engine.dirtyBus.emit === 'function') {
      v2.engine.dirtyBus.emit(event, payload);
    }
  }

  /**
   * Register a tool. Re-registering an existing id replaces the prior tool
   * (so tests can swap a tool's shape without reloading the registry).
   * @param {Tool} tool
   */
  function registerTool(tool) {
    if (!tool || typeof tool.id !== 'string') {
      throw new Error('registerTool: a Tool with a string id is required');
    }
    TOOLS.set(tool.id, tool);
    // If we're swapping the currently-active tool, hand the new shape its
    // onActivate hook so it gets a clean state slot. The prior tool's state
    // stays in appState.tools[id] — the new tool either reuses it or resets it
    // in onActivate.
    if (activeId === tool.id && typeof tool.onActivate === 'function') {
      try { tool.onActivate(buildLightCtx(tool.id)); } catch (e) {
        if (window.console && console.error) {
          console.error('[v2.engine] onActivate threw for ' + tool.id + ':', e);
        }
      }
    }
  }

  /** @param {string} id @returns {?Tool} */
  function getTool(id) { return TOOLS.get(id) || null; }

  /** @returns {?Tool} the currently-active tool */
  function getActiveTool() {
    return activeId ? (TOOLS.get(activeId) || null) : null;
  }

  /**
   * Switch to a different tool. Fires the prior tool's onDeactivate and the
   * new tool's onActivate. Accepts null to clear (no v2 tool active —
   * pointer events fall through to v1).
   * @param {?string} id
   * @returns {?Tool}
   */
  function setActiveTool(id) {
    const prior = getActiveTool();
    if (prior && typeof prior.onDeactivate === 'function') {
      try { prior.onDeactivate(buildLightCtx(prior.id)); } catch (e) {
        if (window.console && console.error) {
          console.error('[v2.engine] onDeactivate threw for ' + prior.id + ':', e);
        }
      }
    }
    activeId = (id == null) ? null : String(id);
    // Ensure a per-tool state slot exists. The Tool consults `ctx.toolState`;
    // a fresh tool starts with an empty {} unless the previous activation
    // left state behind that the tool wants to reuse.
    if (activeId) {
      const appState = v2.appState;
      if (appState && appState.tools && !appState.tools[activeId]) {
        appState.tools[activeId] = {};
      }
    }
    const next = getActiveTool();
    if (next && typeof next.onActivate === 'function') {
      try { next.onActivate(buildLightCtx(next.id)); } catch (e) {
        if (window.console && console.error) {
          console.error('[v2.engine] onActivate threw for ' + next.id + ':', e);
        }
      }
    }
    emit('tool-changed', { prior: prior ? prior.id : null, next: activeId });
    return next;
  }

  /**
   * A minimal context for onActivate / onDeactivate. The full
   * tool-context (with model + view + helpers) is built per pointer event by
   * event-dispatch.js; activation only needs setToolState + appState + the
   * dirty-bus emitter so the tool can reset its slot.
   */
  function buildLightCtx(toolId) {
    const appState = v2.appState || {};
    if (!appState.tools) appState.tools = {};
    if (!appState.tools[toolId]) appState.tools[toolId] = {};
    return {
      appState: appState,
      model: appState.model || null,
      toolState: appState.tools[toolId],
      setToolState(updates) {
        Object.assign(appState.tools[toolId], updates || {});
      },
      requestRender() {
        // v1 owns the canvas; the live-render hook subscribes to dirtyBus and
        // pumps requestRender on every emit. We emit here for parity with the
        // pointer-event path so the user sees the cursor / status update.
        emit('model-changed', { source: 'tool-' + toolId });
      },
    };
  }

  v2.engine.TOOLS           = TOOLS;
  v2.engine.registerTool    = registerTool;
  v2.engine.getTool         = getTool;
  v2.engine.getActiveTool   = getActiveTool;
  v2.engine.activeTool      = getActiveTool;   // matches 06-tools-and-transactions.md §2
  v2.engine.setActiveTool   = setActiveTool;
  v2.engine.buildLightToolContext = buildLightCtx;
})();
