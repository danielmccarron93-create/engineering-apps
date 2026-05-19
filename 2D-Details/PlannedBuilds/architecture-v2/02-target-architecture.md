# Target architecture — the five layers at a glance

This file is the diagram + paragraph summary of the v2 architecture. The deep design for each layer lives in `03-model-layer.md`, `04-catalogue-system.md`, `05-render-pipeline.md`, and `06-tools-and-transactions.md`.

---

## The diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  UI LAYER                                                                  │
│  Palettes (V26 BB-rail, ribbon, model-tab), Inspector, Sheet Browser,     │
│  Keyboard, Status Bar, Cmd Palette, Theme switcher                        │
│                                                                            │
│  Reads: AppState (UI), Model (current selection), Catalogues              │
│  Writes: dispatches Transactions to the Model                             │
└──────────────────────────────────────────────────────────────────────────────┘
                              │ Transaction
                              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  TOOL LAYER                                                                │
│  Per-tool modules implementing { onPointerDown, onPointerMove,            │
│    onPointerUp, onKey, onDblClick, drawPreview, statusText }              │
│                                                                            │
│  Tools translate user input into Transactions. They do NOT mutate the     │
│  model directly. They produce intent; the model decides whether to apply. │
│                                                                            │
│  Examples: PlaceMemberTool, PlaceFastenerTool, PlaceDimensionTool,        │
│  SelectTool, MoveTool, MirrorTool, BoxSelectTool, RotateTool, …            │
└──────────────────────────────────────────────────────────────────────────────┘
                              │ Transaction
                              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  MODEL LAYER                          ◄── single source of truth          │
│                                                                            │
│  StructuralModel {                                                        │
│    elements: Map<ElementId, Element>                                      │
│    materials: Map<MaterialId, Material>                                   │
│    views:     Map<ViewId,    View>                                        │
│    sheets:    Map<SheetId,   Sheet>                                       │
│    project:   ProjectMetadata                                             │
│  }                                                                        │
│                                                                            │
│  Element { id, category, family, type, geometry, hostId?, materialId,    │
│            params, viewOverrides? }                                       │
│                                                                            │
│  applyTransaction(model, tx) → { newModel, dirty: DirtySet }              │
│  query(model, predicate) → Element[]                                      │
│                                                                            │
│  Pure data + pure functions. No DOM. No canvas. Unit-testable.           │
└──────────────────────────────────────────────────────────────────────────────┘
        │ dirty events                       │ queries
        ▼                                    ▲
┌──────────────────────────────────────────────────────────────────────────────┐
│  CATALOGUE + GEOMETRY LAYERS          ◄── pure libraries                  │
│                                                                            │
│  Catalogues:                                                               │
│    CategoryRegistry  (Beam, Column, Plate, Fastener, Annotation, …)       │
│    FamilyCatalogue   (UB, UC, PFC, SHS, RHS, CHS, EA, UA, WB, GLT, CLT,   │
│                       AS1252-bolt, Rothoblaas-HBS, anchor, …)             │
│    TypeCatalogue     (every concrete instance — 310UB40.4, HBS-10x100,   │
│                       M20-8.8-S, …)                                       │
│    MaterialCatalogue (steel grades, concrete N20/N32/N40, timber MGP10,   │
│                       GL18, masonry, soil, …)                             │
│    RuleCatalogue     (AS 4100, AS 3600, AS 1720, ETA-11/0030, …)         │
│                                                                            │
│  Geometry:                                                                 │
│    Frame, Polygon, BoundingBox, projectPolygon, jointTrim,                 │
│    occlusionClip, sectionProfile, axisFromTwoPoints, rotateAboutAxis      │
│                                                                            │
│  Pure functions. No model awareness. No DOM.                              │
└──────────────────────────────────────────────────────────────────────────────┘
                              │ consumed by
                              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  RENDER LAYER                           ◄── many renderers, one model    │
│                                                                            │
│  Renderer interface:                                                       │
│    name, RENDERERS (Map<CategoryKey, RenderFn>),                          │
│    render(model, view, dirtyRegion?, ctx) → void                          │
│                                                                            │
│    Canvas2DRenderer  — screen + raster PDF + JSDOM tests                  │
│    VectorRenderer    — jsPDF vector PDF (no shim — direct emission)      │
│    ThreeJSRenderer   — iso block + perspective + 3D-mode interaction      │
│    DXFEmitter        — drafter handoff (.dxf)                             │
│    SVGEmitter        — web sharing                                        │
│    IFCEmitter        — future BIM interop                                 │
│                                                                            │
│  Each renderer dispatches by (category, family). Adding a new            │
│  Family registers one entry per renderer. A "coming soon"                │
│  category has the entry return null / a placeholder marker.              │
└──────────────────────────────────────────────────────────────────────────────┘
                              │ outputs
                              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  ENGINE LAYER                          ◄── glue and scheduling           │
│                                                                            │
│    DirtyScheduler    — debounced re-render on model dirty events          │
│    UndoStack         — push/pop transactions                              │
│    Autosave          — debounced model serialise → localStorage          │
│    FileIO            — load/save with schema-version migration            │
│    Persistence       — schema versioned .sd2.json                         │
│    EventDispatch     — global pointer/keyboard event routing              │
│                                                                            │
│  This layer is the boundary between the architecture and the browser.    │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## The five-layer pitch

### 1. UI Layer (tool palettes, inspector, sheet browser, keyboard, status bar)

What the user sees and clicks. It reads from `AppState.ui` (which palette is open, which entity is selected, which tool is active, which view is current) and from the model (current selection's properties). It writes by **dispatching transactions** — never by mutating model state directly.

The integration checklist for "adding a new structural type" becomes ~3 lines of UI work: add a tile to the BB-rail palette, add a property panel to the inspector, add a size-picker entry. All three are data-driven from the catalogue layer, so most additions are zero UI work.

### 2. Tool Layer (per-tool modules)

Each tool is a small module with a uniform interface:

```javascript
// tools/place-fastener-tool.js (pseudocode for shape)
const PlaceFastenerTool = {
  name: 'place-fastener',
  
  onPointerDown(event, ctx) {
    // Resolve cursor to a model location
    const loc = ctx.viewToModel(event.point);
    // Find host element (the timber member the screw goes into)
    const host = ctx.hitTest(loc, { categories: ['beam', 'column', 'plate'] });
    // Compose a transaction
    const tx = new PlaceElementTransaction({
      category: 'fastener',
      family: ctx.activeFamily,   // 'rothoblaas-hbs'
      type: ctx.activeType,        // 'HBS-10x100'
      geometry: { location: loc, rotation: defaultRotation, normal: host.normal },
      hostId: host.id,
      materialId: 'screw-steel-galv',
    });
    // Apply
    ctx.model.applyTransaction(tx);
  },
  
  drawPreview(ctx) { /* ghost-render the fastener at cursor */ },
  
  statusText: 'Click a host element to place a fastener.',
};
```

The tool layer is thin. Most tools are < 100 lines. There's a tool registry; `39-events.js` becomes the dispatcher that routes pointer events to `TOOLS[activeTool]`.

### 3. Model Layer (StructuralModel, Element, Transaction, View, Sheet, Material)

The substance of the architecture. Detailed in `03-model-layer.md`. Key points:

- One `StructuralModel` per open document.
- Every Element has a stable `ElementId` (UUID v4 or a short stable string).
- Every Element belongs to a Category + Family + Type, with a Material reference.
- Every Element has a `Geometry` (a discriminated union: `LinearMember`, `Plate`, `PointInstance`, `Annotation`, `Region`).
- Views are not slots on sheets — they're objects with a `modelTransform` matrix that defines the projection.
- Sheets are layouts that place views.
- Every model change is a Transaction. `applyTransaction(model, tx)` returns the new model and the dirty set. Transactions are reversible.

### 4. Catalogue + Geometry Layers (Categories, Families, Types, Materials, Rules, math primitives)

The pure-data and pure-function layer. Detailed in `04-catalogue-system.md` (catalogues) and the geometry primitives are described in `05-render-pipeline.md` (where they're consumed).

This layer is the substrate of AS-compliance. AS 1100 lineweights live in the category settings. AS 3679 section properties live in the section catalogue. AS 1252 bolt properties live in the fastener catalogue. AS 4100, AS 3600, AS 1720, AS 1101, ETA-11/0030 rule sets live in the rule catalogue. Changing a standard = editing one catalogue file. Renderers and rule engines are dumb consumers.

### 5. Render Layer (Canvas2D, VectorPDF, ThreeJS, DXF, SVG, IFC)

Multiple renderers, all consuming the same model + view. Detailed in `05-render-pipeline.md`. Key shape:

```javascript
// render/canvas2d-renderer.js (pseudocode)
const Canvas2DRenderer = {
  name: 'canvas2d',
  
  // Dispatch table indexed by (category, family). Falls back to category-only
  // if no family-specific renderer exists.
  RENDERERS: new Map([
    ['beam:ub',       drawUB],
    ['beam:uc',       drawUC],
    ['beam:pfc',      drawPFC],
    ['beam:shs',      drawSHS],
    ['beam:rhs',      drawRHS],
    ['beam:chs',      drawCHS],
    ['beam:ea',       drawEA],
    ['beam:ua',       drawUA],
    ['beam:wb',       drawWB],
    ['beam:glt',      drawTimberMember],   // timber treated as a beam family
    ['plate:*',       drawPlate],
    ['fastener:rothoblaas-hbs', drawHBSScrew],
    ['fastener:as1252-bolt',    drawBolt],
    ['fastener:anchor',         drawAnchor],
    ['annotation:dimension',    drawDimension],
    ['annotation:leader',       drawLeader],
    // …
  ]),
  
  render(model, view, dirtyRegion, ctx) {
    for (const elem of model.elements.values()) {
      if (!isInView(elem, view, dirtyRegion)) continue;
      const key = `${elem.category}:${elem.family}`;
      const fn = this.RENDERERS.get(key) || this.RENDERERS.get(`${elem.category}:*`);
      if (fn) fn(elem, model, view, ctx);
      // else: element is in the model but this renderer has no entry — skip.
    }
  },
};
```

The "2D first, 3D coming soon" UX is one line of dispatch table entry difference between Canvas2DRenderer (full renderer for `fastener:rothoblaas-hbs`) and ThreeJSRenderer (no entry, or a placeholder marker). The model has the screw. The Canvas2D paper view draws it. The Three.js iso view skips it (or shows a "not yet" badge). The schedule counts it. The inspector edits it. The rule engine checks it. Everything works except the iso render — and the iso render starts working the day a build chat registers a renderer for that category.

---

## How the layers interact — a worked walkthrough

User clicks the "HBS 10x100" tile in the V26 BB-rail.

1. **UI layer** updates `AppState.ui.activeTool = 'place-fastener'`, `AppState.ui.activeFamily = 'rothoblaas-hbs'`, `AppState.ui.activeType = 'HBS-10x100'`.
2. User clicks on a timber beam in the canvas. **Engine layer** routes the pointer event to the tool dispatcher.
3. **Tool layer** `PlaceFastenerTool.onPointerDown` resolves the cursor location, hit-tests for a host element, composes a `PlaceElementTransaction`.
4. The transaction is dispatched to the **Model layer**. `applyTransaction(model, tx)` mutates the model (adds the new Element to `model.elements`), returns the new model and a dirty set (the bounding box of the new element, plus the affected views).
5. **Engine layer**'s DirtyScheduler debounces the re-render. UndoStack.push(tx).
6. **Render layer** is woken up by the dirty event. For each active view (`view.modelTransform`), the renderer iterates the model, finds elements in the dirty region, dispatches each by category+family. The Canvas2DRenderer has an entry for `fastener:rothoblaas-hbs` → drawHBSScrew(elem, model, view, ctx). The ThreeJSRenderer (if the iso block is visible) has no entry → element is skipped in the iso view. The user sees the screw appear in the 2D view, no change in the 3D view (or a "coming soon" overlay if the renderer is configured to show one).
7. **Engine layer**'s Autosave fires after a 5-second debounce — `model.serialise()` produces a JSON with schemaVersion 2 → localStorage.
8. User hits Ctrl+Z. **UI layer** dispatches `undo()`. **Engine layer**'s UndoStack pops the transaction. `tx.undo()` mutates the model back. Dirty event fires. Renderers re-render. Screw disappears.

Compare this to the current architecture, where step 4 is "the tool pushes a new `'screw'` entity into `entities2D['elevation']`, the connection grouping is updated, the rule engine reaches into the grouping to find the screw, the renderer dispatches on `ent.type === 'screw'`, undo snapshots the entire entity store, save/load JSON-dumps the entity stores without a schema version." The v2 architecture is more code lines but vastly less coupling, and it scales.

---

## What this enables (that the current architecture cannot)

- **One Element, many renderers.** A new screw type ships in 2D first; 3D renderer registers later; nothing else changes. The user sees the same Element in both views once both renderers are wired.
- **Materials drive everything.** Changing the steel hatch density: one edit. Adding a new timber grade with custom hatch: one catalogue row.
- **Categories drive visibility.** Turn off all fasteners in this view: one view-property toggle. Show only annotations: one toggle.
- **Schedules are free.** Quantity takeoff is `model.elements.where(category === 'fastener').count()`. Connection schedule, fastener tally, member list — all queries.
- **Rules are testable.** An AS 4100 capacity check is a pure function of `(model, element) → CheckResult`. Run on every save. Surface in the inspector. Export as a check report.
- **Save format has schema migrations.** Old `.sd2.json` files load forever. Adding fields, renaming families, changing geometry shapes — all migrations.
- **Undo/redo is constant time.** Transactions, not snapshots.
- **Autosave is free.** Subscribe to dirty.
- **Renderer ↔ model is one direction.** Renderers don't mutate model state. Tools don't mutate renderer state. There is no V25-monkey-patches situation possible by construction.
- **Testing is real.** Model layer is JSDOM-testable. Catalogue layer is browser-free. Tool layer with a mock model is unit-testable. The current architecture has zero tests partly because there's nothing isolable in it.
- **Plugin surface.** The architecture has a natural plugin shape (register a Category, register a Family, register a Renderer entry, register a Rule). Plugins for office-specific details, customer-specific title blocks, third-party fastener catalogues — all become registrations.
- **Performance.** Dirty-region rendering. Spatial indexing on the model (R-tree or grid). Renderer-level caching (a `mem2`'s computed projection cached by `(elementId, viewId)` with model.version as cache key). The current full-redraw-every-frame approach hits its ceiling fast as model size grows.

---

## What this is NOT

- Not a TypeScript migration. JSDoc types throughout. ES2020+ classic scripts.
- Not an ESM migration. The architecture is amenable to ESM (every layer is a logical module) but the file structure stays classic-script with `<script>` tags. ESM migration is a separate decision after v2 ships.
- Not a bundler adoption. No build step.
- Not a framework adoption. No React, no Vue, no Svelte. The UI layer is direct DOM, the same as today.
- Not a from-scratch rewrite. The existing draw functions (`drawUB`, `drawSHS`, `drawPlate`, `drawWeld2D`, `drawDim2D`, etc.) get adapted to consume Elements instead of `obj`/`ent` shapes and become entries in the Canvas2DRenderer dispatch table. Most of the imperative drawing code survives. The new layer is the Model.
- Not "everything must be migrated before anything ships." See `07-migration-strategy.md` — strangler fig.
