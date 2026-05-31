# Tools and Transactions

This file defines how user input becomes model change. The shape is uniform across every tool, which is what kills `39-events.js` (the 1,601-line monolith) by construction — a new tool is a new file, not an extension of the existing tree.

---

## 1. The Tool interface

```javascript
/**
 * @typedef {object} Tool
 * @property {string} id                       — 'select', 'place-fastener', 'place-dimension', …
 * @property {string} label                    — human-readable
 * @property {string[]} chord                  — optional keyboard chord shortcut
 * @property {ToolStateShape} stateShape       — what app-state slot this tool owns
 *
 * @property {(event, ctx) => void} [onPointerDown]
 * @property {(event, ctx) => void} [onPointerMove]
 * @property {(event, ctx) => void} [onPointerUp]
 * @property {(event, ctx) => void} [onDblClick]
 * @property {(event, ctx) => void} [onKey]
 * @property {(event, ctx) => void} [onWheel]
 *
 * @property {(ctx) => void} [drawPreview]     — render a ghost / rubber-band during interaction
 * @property {(ctx) => void} [onActivate]      — called when setTool(toolId) is invoked
 * @property {(ctx) => void} [onDeactivate]    — called when another tool is activated
 *
 * @property {(ctx) => string} statusText      — bottom bar status line
 * @property {(ctx) => string} cursorStyle     — CSS cursor name
 */
```

Every tool exports an object with this shape. The dispatcher (which replaces the current `js/39-events.js`) routes pointer / keyboard events to whichever tool is active.

**Tools do NOT mutate the model directly.** They compose Transactions and call `ctx.model.applyTransaction(tx)`. This is the discipline that makes the architecture testable, undoable, autosavable, and replayable.

**Tools own per-tool state via `stateShape`.** The state lives in `AppState.tools[toolId]`. The tool reads its own state via `ctx.toolState`; the tool writes its state via `ctx.setToolState(updates)`. Other tools and the rest of the app don't read this state.

---

## 2. The dispatcher (the v2 replacement for `39-events.js`)

```javascript
// js/v2/engine/event-dispatch.js
window.v2.engine = window.v2.engine || {};

const TOOLS = new Map();  // populated by tool registration

function registerTool(tool) {
  TOOLS.set(tool.id, tool);
}

function activeTool() {
  return TOOLS.get(window.v2.appState.tools.active);
}

function buildToolCtx(event) {
  return {
    model:         window.v2.appState.model,
    view:          window.v2.appState.ui.currentView,
    appState:      window.v2.appState,
    toolState:     window.v2.appState.tools[window.v2.appState.tools.active] ?? {},
    setToolState(updates) {
      Object.assign(window.v2.appState.tools[window.v2.appState.tools.active], updates);
      window.v2.engine.requestRender();
    },
    viewToModel(point2D)   { /* convert canvas point to model point */ },
    modelToView(point3D)   { /* convert model point to canvas point */ },
    hitTest(modelPoint, options) {
      return window.v2.render.Canvas2DRenderer.hitTest(
        window.v2.appState.model,
        window.v2.appState.ui.currentView,
        modelPoint,
        options
      );
    },
    activeFamily: window.v2.appState.ui.activeFamily,
    activeType:   window.v2.appState.ui.activeType,
  };
}

function initEvents(canvas) {
  canvas.addEventListener('pointerdown', e => {
    const tool = activeTool();
    if (tool?.onPointerDown) tool.onPointerDown(e, buildToolCtx(e));
  });
  canvas.addEventListener('pointermove', e => {
    const tool = activeTool();
    if (tool?.onPointerMove) tool.onPointerMove(e, buildToolCtx(e));
  });
  canvas.addEventListener('pointerup', e => {
    const tool = activeTool();
    if (tool?.onPointerUp) tool.onPointerUp(e, buildToolCtx(e));
  });
  canvas.addEventListener('dblclick', e => {
    const tool = activeTool();
    if (tool?.onDblClick) tool.onDblClick(e, buildToolCtx(e));
  });
  canvas.addEventListener('wheel', e => {
    const tool = activeTool();
    if (tool?.onWheel) tool.onWheel(e, buildToolCtx(e));
  });
  document.addEventListener('keydown', e => {
    // Chord layer (replaces current js/57-chord-layer.js) checks first;
    // global shortcuts (replaces js/42-keyboard.js) next;
    // then tool-specific onKey
    const chordHandled = window.v2.engine.chordLayer?.onKey(e);
    if (chordHandled) return;
    const globalHandled = window.v2.engine.globalShortcuts?.onKey(e);
    if (globalHandled) return;
    const tool = activeTool();
    if (tool?.onKey) tool.onKey(e, buildToolCtx(e));
  });
}

window.v2.engine.registerTool   = registerTool;
window.v2.engine.initEvents     = initEvents;
window.v2.engine.activeTool     = activeTool;
```

The dispatcher is **under 100 lines**. The complexity that lives in the current `39-events.js` (1,601 lines) moves into individual tool files, each with full ownership of one interaction pattern.

---

## 3. Worked example — the `PlaceFastenerTool`

```javascript
// js/v2/tools/place-fastener-tool.js
const PlaceFastenerTool = {
  id: 'place-fastener',
  label: 'Place Fastener',
  chord: ['B', 'F'],   // press B then F to activate (V21 chord layer pattern)

  stateShape: {
    cursorLocation: null,   // current cursor in model coords
    hoveredHost: null,      // element we'd attach to if user clicked
    snapPoint: null,        // resolved snap point under cursor
  },

  onActivate(ctx) {
    ctx.setToolState({ cursorLocation: null, hoveredHost: null, snapPoint: null });
    window.v2.engine.setStatusText(this.statusText(ctx));
  },

  onPointerMove(event, ctx) {
    const modelPoint = ctx.viewToModel(event);
    
    // Find a host element under cursor (a member the fastener attaches to)
    const hosts = ctx.hitTest(modelPoint, {
      categories: ['beam', 'column', 'plate', 'timber-member'],
      includeStack: true,
    });
    
    // Snap to host's centreline / face / corner (snap mode in ctx.appState.ui.snapMode)
    const snapped = window.v2.geometry.snapToHost(modelPoint, hosts, ctx.appState.ui.snapMode);
    
    ctx.setToolState({
      cursorLocation: modelPoint,
      hoveredHost: hosts[0] ?? null,
      snapPoint: snapped,
    });
  },

  onPointerDown(event, ctx) {
    if (event.button !== 0) return;  // left click only
    const { snapPoint, hoveredHost } = ctx.toolState;
    if (!snapPoint || !hoveredHost) return;  // no valid target
    
    // Compute fastener orientation — default normal to host's primary face
    const normal = window.v2.geometry.hostFaceNormal(hoveredHost, snapPoint, ctx.view);
    
    // Build the transaction
    const tx = window.v2.transactions.placeElement({
      category: 'fastener',
      family:   ctx.activeFamily,    // e.g., 'rothoblaas-hbs'
      type:     ctx.activeType,      // e.g., 'HBS-10x100'
      geometry: {
        kind: 'point',
        location: snapPoint,
        normal,
        rotation: 0,
      },
      hostId: hoveredHost.id,
      materialId: lookupDefaultMaterial(ctx.activeFamily, ctx.activeType),
      params: {},
    });
    
    // Apply
    ctx.model.applyTransaction(tx);
  },

  onKey(event, ctx) {
    if (event.key === 'Escape') {
      window.v2.engine.setActiveTool('select');
    }
  },

  drawPreview(ctx) {
    const { snapPoint } = ctx.toolState;
    if (!snapPoint) return;
    
    // Render a ghost fastener at the snap point
    const ghostElem = {
      id: '__ghost__',
      category: 'fastener',
      family: ctx.activeFamily,
      type: ctx.activeType,
      geometry: { kind: 'point', location: snapPoint, normal: defaultNormal, rotation: 0 },
      materialId: lookupDefaultMaterial(ctx.activeFamily, ctx.activeType),
    };
    const renderCtx = window.v2.render.buildRenderContext(ghostElem, ctx.model);
    renderCtx.canvas2d = ctx.appState.ui.previewCanvas2D;
    renderCtx.color = 'rgba(0, 170, 255, 0.6)';  // ghost colour
    window.v2.render.Canvas2DRenderer.RENDERERS.get('fastener:' + ctx.activeFamily)?.(ghostElem, renderCtx);
  },

  statusText(ctx) {
    if (ctx.toolState.hoveredHost) {
      return `Click to place ${ctx.activeType} on ${ctx.toolState.hoveredHost.family}`;
    }
    return `Hover a host element to place ${ctx.activeType ?? 'fastener'}`;
  },

  cursorStyle(ctx) {
    return ctx.toolState.hoveredHost ? 'crosshair' : 'not-allowed';
  },
};

window.v2.tools = window.v2.tools || {};
window.v2.tools.PlaceFastenerTool = PlaceFastenerTool;
window.v2.engine.registerTool(PlaceFastenerTool);
```

**~80 lines, one file, one tool, one clear contract.** The current equivalent (placement of a screw entity via the V25 dispatch in `js/69-v25-dispatch.js`, the click handling in `js/39-events.js`, the options bar wiring in `js/72-v25-options-bar.js`, the ghost preview in `js/68-v25-tools.js`) is hundreds of lines split across four files with shared global state.

---

## 4. Transaction factories

Every transaction type has a factory function that returns a Transaction object. Factories live in `js/v2/transactions/`:

```javascript
// js/v2/transactions/place-element.js
function placeElement({ category, family, type, geometry, hostId, materialId, params }) {
  const id = window.v2.model.newElementId();
  const element = {
    id, category, family, type, geometry, hostId, materialId,
    params: params ?? {},
    createdAt: Date.now(),
  };

  return {
    type: 'place-element',
    description: `Place ${family} ${type}`,
    data: { element },

    apply(model) {
      model.elements.set(element.id, element);
      
      // If this is an annotation hosted by another element, update parent's annotationIds
      if (hostId) {
        const host = model.elements.get(hostId);
        if (host) {
          host.annotationIds = host.annotationIds ?? [];
          host.annotationIds.push(element.id);
        }
      }
      
      return {
        elements: new Set([element.id]),
        views: new Set([/* every view that shows this element's category */]),
        sheets: new Set([/* every sheet placing those views */]),
        bbox: window.v2.geometry.elementBoundingBox(element),
      };
    },

    unapply(model) {
      model.elements.delete(element.id);
      if (hostId) {
        const host = model.elements.get(hostId);
        if (host?.annotationIds) {
          host.annotationIds = host.annotationIds.filter(id => id !== element.id);
        }
      }
      return {
        elements: new Set([element.id]),
        views: new Set([...]),
        sheets: new Set([...]),
        bbox: window.v2.geometry.elementBoundingBox(element),
      };
    },
  };
}

window.v2.transactions = window.v2.transactions || {};
window.v2.transactions.placeElement = placeElement;
```

The factory:
1. Mints an ElementId.
2. Constructs the Element object.
3. Returns a Transaction with `apply` + `unapply` closures over that element.

Note: both `apply` and `unapply` return a `DirtySet`. The undo stack feeds this back to the renderer so unapply triggers re-render of the same regions.

---

## 5. Undo/Redo via the UndoStack

```javascript
// js/v2/engine/undo-stack.js
const UNDO_STACK = [];
const REDO_STACK = [];

function applyTransaction(tx) {
  const dirty = tx.apply(window.v2.appState.model);
  UNDO_STACK.push(tx);
  REDO_STACK.length = 0;  // any new edit clears the redo stack
  window.v2.engine.notifyDirty(dirty);
  window.v2.engine.markModelDirty();   // for autosave
}

function undo() {
  const tx = UNDO_STACK.pop();
  if (!tx) return;
  const dirty = tx.unapply(window.v2.appState.model);
  REDO_STACK.push(tx);
  window.v2.engine.notifyDirty(dirty);
  window.v2.engine.markModelDirty();
}

function redo() {
  const tx = REDO_STACK.pop();
  if (!tx) return;
  const dirty = tx.apply(window.v2.appState.model);
  UNDO_STACK.push(tx);
  window.v2.engine.notifyDirty(dirty);
  window.v2.engine.markModelDirty();
}

window.v2.engine.applyTransaction = applyTransaction;
window.v2.engine.undo = undo;
window.v2.engine.redo = redo;
```

Constant-time undo regardless of model size. The current v1 implementation snapshots the entire entity store before each tool action — this gets slow as the model grows. v2's transactional undo never gets slower.

---

## 6. The autosave loop

```javascript
// js/v2/engine/autosave.js
let dirty = false;
let lastSavedAt = Date.now();

function markModelDirty() {
  dirty = true;
  updateTitleBarIndicator();
}

function updateTitleBarIndicator() {
  document.title = (dirty ? '● ' : '') + window.v2.appState.project.name + ' — StructDraw';
}

// Debounced save
function autosaveLoop() {
  if (dirty && Date.now() - lastSavedAt > AUTOSAVE_DEBOUNCE_MS) {
    const json = window.v2.io.serialise(window.v2.appState.model);
    localStorage.setItem('structdraw_autosave_' + window.v2.appState.project.id, json);
    lastSavedAt = Date.now();
    dirty = false;
    updateTitleBarIndicator();
  }
}
setInterval(autosaveLoop, AUTOSAVE_POLL_MS);

window.v2.engine.markModelDirty = markModelDirty;
```

Free side effect of the transactional architecture.

---

## 7. The initial tool set

```
js/v2/tools/
├── select-tool.js                 — primary tool; click to select, marquee, drag to move
├── place-member-tool.js           — beams, columns, braces, timber members (all linear)
├── place-plate-tool.js
├── place-fastener-tool.js         — bolts, screws, anchors, shear studs (point instances)
├── place-reinforcement-tool.js    — rebar
├── place-mesh-tool.js
├── place-masonry-tool.js
├── place-concrete-region-tool.js
├── place-dimension-tool.js        — aligned, horizontal, vertical, angular, chain, baseline
├── place-leader-tool.js
├── place-tag-tool.js
├── place-section-mark-tool.js
├── place-detail-callout-tool.js
├── place-revision-tool.js
├── place-weld-symbol-tool.js
├── place-breakline-tool.js
├── place-slot-tool.js
├── move-tool.js
├── rotate-tool.js
├── scale-tool.js
├── mirror-tool.js
├── copy-tool.js
├── trim-tool.js                   — currently V1 regression; v2 first-class
├── extend-tool.js                 — currently V1 regression; v2 first-class
├── fillet-tool.js                 — currently V1 regression; v2 first-class
├── offset-tool.js                 — currently V1 regression; v2 first-class
├── orbit-tool.js                  — 3D iso view orbit
├── pan-tool.js
├── zoom-tool.js
└── tool-registry.js               — registers all of the above on app start
```

~25-30 tools. Each one a small focused file. Each one registered in `tool-registry.js` which imports all of them. Adding a new tool = adding a new file + one line in the registry.

---

## 8. The chord layer

The V21 chord layer in `js/57-chord-layer.js` (M/D/A/H/B/K/W as the chord prefix) translates to v2 as a tool-discovery shortcut. The `chord` field on each Tool declares its activation sequence. The chord layer is one module that watches keystrokes and dispatches to `setActiveTool(chordMatch)`.

```javascript
// js/v2/engine/chord-layer.js
const CHORD_TIMEOUT_MS = 700;
let chordBuffer = [];
let chordTimer = null;

function onKey(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  
  chordBuffer.push(event.key.toUpperCase());
  clearTimeout(chordTimer);
  chordTimer = setTimeout(() => { chordBuffer.length = 0; }, CHORD_TIMEOUT_MS);

  // Find a tool whose chord matches the current buffer
  for (const [_, tool] of window.v2.engine.TOOLS) {
    if (tool.chord && arrayEquals(tool.chord, chordBuffer)) {
      chordBuffer.length = 0;
      clearTimeout(chordTimer);
      window.v2.engine.setActiveTool(tool.id);
      return true;
    }
  }
  return false;
}

window.v2.engine.chordLayer = { onKey };
```

The chord layer no longer has its own dispatch ladder. It looks up matches in the tool registry.

---

## 9. The global shortcuts layer

Ctrl+Z, Ctrl+Y, Ctrl+S, Ctrl+C, Ctrl+V, etc. The current `js/42-keyboard.js` becomes:

```javascript
// js/v2/engine/global-shortcuts.js
const SHORTCUTS = new Map([
  ['Ctrl+Z',           () => window.v2.engine.undo()],
  ['Ctrl+Shift+Z',     () => window.v2.engine.redo()],
  ['Ctrl+Y',           () => window.v2.engine.redo()],
  ['Ctrl+S',           () => window.v2.io.save(window.v2.appState.model)],
  ['Ctrl+C',           () => window.v2.engine.clipboard.copy()],
  ['Ctrl+V',           () => window.v2.engine.clipboard.paste()],
  ['Ctrl+X',           () => window.v2.engine.clipboard.cut()],
  ['Delete',           () => window.v2.engine.deleteSelection()],
  ['Backspace',        () => window.v2.engine.deleteSelection()],
  ['Escape',           () => window.v2.engine.setActiveTool('select')],
  ['Ctrl+A',           () => window.v2.engine.selectAll()],
  // ...
]);

function onKey(event) {
  const key = formatShortcut(event);  // 'Ctrl+Z' style
  const fn = SHORTCUTS.get(key);
  if (fn) {
    event.preventDefault();
    fn();
    return true;
  }
  return false;
}

window.v2.engine.globalShortcuts = { onKey };
```

No more dispatch ladder. New shortcut = new map entry.

---

## 10. The Inspector — read-only model viewer + edit-via-transaction

The Inspector reads the selected Element from the model and renders a property panel. Edits dispatch `EditElementTransaction`s.

```javascript
// js/v2/ui/inspector.js
function renderInspector() {
  const selectedId = window.v2.appState.ui.selectionId;
  const elem = window.v2.appState.model.elements.get(selectedId);
  if (!elem) { return showEmptyInspector(); }

  const family = window.v2.catalogues.lookupFamily(elem.family);
  const type   = family.types.find(t => t.id === elem.type);
  const mat    = window.v2.appState.model.materials.get(elem.materialId);

  // Family-specific property panel
  const panel = INSPECTOR_PANELS.get(`${elem.category}:${elem.family}`)
              ?? INSPECTOR_PANELS.get(`${elem.category}:*`)
              ?? defaultPanel;
  
  panel.render(elem, family, type, mat, {
    onChange(field, newValue) {
      window.v2.engine.applyTransaction(
        window.v2.transactions.editElement({
          elementId: elem.id,
          changes: { [field]: newValue },
        })
      );
    },
  });
}
```

The Inspector becomes a UI surface that reads model + catalogue and writes transactions. Same dispatch shape as the renderer. Adding an inspector panel for a new family = registering an `INSPECTOR_PANELS` entry.

---

## 11. The relationship to v1 tools

Most of the v1 tool logic translates to v2 with these changes:

| v1 pattern | v2 pattern |
|---|---|
| `if (tool === 'v25-mem') { /* 100 lines */ }` in `39-events.js` | `PlaceMemberTool` module file |
| Tool reaches into `objects3D.push({...})` | Tool composes `PlaceElementTransaction` and calls `applyTransaction` |
| Tool reaches into `entities2D[viewKey].push({...})` | Same — every Element is a model element |
| `tool` global mutable string | `appState.tools.active`, mutated by `setActiveTool(id)` |
| Ghost preview drawn inline in event handler | Tool exports `drawPreview(ctx)`; engine calls it |
| Tool-specific state in `07-globals.js` (`drawStart`, `clickPts`, etc.) | `appState.tools[toolId]`, isolated per tool |
| V25 monkey-patches `setTool` to refresh options bar | Tool has `onActivate` / `onDeactivate` hooks |
| Chord layer dispatch ladder | Tool registers its chord; chord layer looks up tools |

The translation is mostly mechanical. Every v1 tool becomes one file + one transaction factory + (optionally) one Inspector panel registration.

---

## 12. Testing tools without a browser

A tool can be unit-tested by constructing a mock event, a mock ctx, and asserting the resulting transactions:

```javascript
// tests/tools/place-fastener-tool.test.js (JSDOM)
import { PlaceFastenerTool } from '../../js/v2/tools/place-fastener-tool.js';
import { makeMockModel, makeMockCtx } from './helpers.js';

test('placing a screw on a host beam creates a fastener element with hostId set', () => {
  const model = makeMockModel({
    elements: [
      { id: 'beam-1', category: 'beam', family: 'glt', type: 'GL-120x300', /*...*/ },
    ],
  });
  const ctx = makeMockCtx(model, {
    activeFamily: 'rothoblaas-hbs',
    activeType: 'HBS-10x100',
    cursorAt: { x: 500, y: 100, z: 0 },
    hostHit: { id: 'beam-1', /*...*/ },
  });

  PlaceFastenerTool.onPointerMove({ ...mockMoveEvent }, ctx);
  PlaceFastenerTool.onPointerDown({ ...mockClickEvent }, ctx);

  const elements = [...model.elements.values()];
  const screw = elements.find(e => e.category === 'fastener');
  expect(screw).toBeDefined();
  expect(screw.family).toBe('rothoblaas-hbs');
  expect(screw.type).toBe('HBS-10x100');
  expect(screw.hostId).toBe('beam-1');
});
```

Zero DOM. Zero canvas. Pure data transformation. The current architecture cannot do this — tools are entangled with `addEventListener`, with canvas state, with global mutable state, with renderer side effects. v2 isolates the tool's intent from its rendering and event side effects.
