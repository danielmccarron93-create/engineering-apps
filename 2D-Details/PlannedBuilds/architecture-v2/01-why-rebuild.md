# Why rebuild — first-principles diagnosis

This file argues, from first principles, that the current StructDraw architecture cannot deliver a Revit-class structural detailing product. The argument has three parts: what's structurally wrong with the current shape, what every Revit-class app has that StructDraw doesn't, and why the incremental cleanup planned in `codebase-restructure/` doesn't fix it.

The diagnosis matters because the answer to "should we rebuild?" is "only if the current shape genuinely cannot reach the goal." If the goal is "Bluebeam-plus-3D-iso for daily use at Bligh Tanner," the current shape is fine and `codebase-restructure/` is enough. If the goal is "Revit competitor for structural detailing," the current shape is the wrong substrate and incremental fixes will run out of leverage.

---

## Part 1 — what is structurally wrong with the current shape

### 1.1 There is no model layer

The single most important architectural fact about StructDraw today is that there are **two parallel entity stores with no shared spine**:

- `objects3D` (declared in `js/05-state.js`) — an array of 3D-mode model objects with type-discriminated shapes (`{ type: 'ub', x, y, z, section, length, rot }`, `{ type: 'bolt', x, y, z, size }`, etc.).
- `entities2D[viewKey]` (declared in `js/07-globals.js`) — a per-view bucket of 2D-mode paper-space entities with a different discriminated shape (`{ type: 'mem2', view, p1, p2, memberType, section, … }`, `{ type: 'plate2', view, polygon, thk, aspect, … }`, etc.).

These are not two views onto a model. They are two independent models. A 3D UB and a V25 `mem2` with `memberType:'ub'` are unrelated objects. The 3D bolt and the (in-flight) V25 `bolt2` will be unrelated objects. The 3D plate and the V25 `plate2` ARE unrelated objects today and the V1→V2 regression list in the playbook implicitly tolerates this.

Every Revit-class application has one canonical model. Plan, section, elevation, 3D — they are projections of it. Edit the beam's section size in the section view and the plan updates because they're looking at the same `BeamElement`. The current StructDraw has nothing that plays this role.

### 1.2 Renderers own the model interpretation

Because there's no model layer, each renderer reaches directly into the entity stores and interprets the shape itself. `drawUB` in `js/29-draw-ub.js` knows that a 3D UB has `obj.x/y/z/section/length/rot`. `drawMem2D` in `js/68-v25-tools.js` knows that a V25 mem2 has `ent.p1/p2/memberType/section`. Each renderer is its own little type system.

The consequence is that a "structural concept" (e.g., "a UB beam") is not a thing the codebase knows about — it's an implicit pattern that every renderer reimplements. When you want to add a new section type, you don't add it to the model; you teach every renderer to recognise it.

### 1.3 Materials, lineweights, hatches are scattered

AS 1100 lineweights live in `js/03-data-bolts.js` as a `LW` constant (incidentally — the file is named for bolts, the constants are there for historical reasons). Steel hatch pattern lives in `js/26-as1100-hatch.js`. Concrete-dot and cross-cross hatch patterns live inline inside `drawHatch2D` in `js/34-draw-2d.js`. V25 materials live in `js/67-v25-materials.js`. Timber grain hatching lives in `js/75-timber-conn-entities.js`. The `--timber-color` CSS variable is referenced but never defined.

There is no `Material` object. A "steel S275 beam" doesn't know it's made of steel; the renderer assumes it. Every drawer hand-rolls the hatch. Changing the steel hatch density across the app requires editing five files.

### 1.4 Categories don't exist as a concept

Revit calls them Categories. Tekla calls them Part Classes. Allplan calls them Component Types. They are the top-level taxonomy that drives visibility (turn off all "Fasteners" in this view), lineweight (all "Beams" use cut/visible/hidden weights according to view classification), and rendering policy (all "Annotations" never get hidden by occlusion).

StructDraw has no equivalent. The closest is the `obj.type` discriminator (`'ub'`, `'plate'`, `'bolt'`) and the V25 `ent.type` discriminator (`'mem2'`, `'plate2'`, `'mat'`, `'leader2'`). These are not categories — they are concrete renderer dispatch keys. You can't ask "is this element a fastener?" without enumerating every fastener type.

### 1.5 Tools mutate state directly

Every tool in `js/39-events.js` (the 1,601-line monolith) mutates the entity stores directly. `objects3D.push({…})`, `entities2D[viewKey].push({…})`, occasionally `requestRender()` to schedule a redraw. There's no transaction. There's no centralised dirty-tracking. Undo/redo (`js/42-keyboard.js`) works by snapshotting the entity stores before each tool action — a coarse-grained "save the whole world" snapshot that gets slow as the model grows.

A Revit-class architecture has transactions: every model change goes through a `Transaction { ops[], description, undo(), redo() }`. The model emits dirty events. Renderers re-render the dirty region only. Undo/redo is constant time regardless of model size. Autosave is a free side-effect of the dirty flag.

### 1.6 Views are layout positions, not projection definitions

A "view" in StructDraw today is a slot on a sheet (`blocks` array) with a `viewKey` (`'elevation'`, `'sectionA'`, `'planB'`, `'isometric'`). The renderer hardcodes how each viewKey projects: elevation looks at X-Z, sectionA looks at Y-Z, planB looks at X-Y. There is no `View` object with a `modelTransform` matrix. Adding a new view orientation means editing every drawer.

Revit's View is a real object. A 3D ViewPlan has a cut plane, a view depth, a view direction, an underlay, a phase filter, a worksets filter, a visibility/graphics override per category, and a category-level visibility list. StructDraw has none of these — the per-block state is a few floats.

### 1.7 Save format is JSON-dumped state, not a model

`.sd2.json` is the result of `JSON.stringify({ objects3D, entities2D, blocks, … })`. There is no schema version (Known Issue #5). The CHANGELOG claims a `schemaVersion: 2` field but the code says `version: '1.0'`. When the entity shape changes in code (e.g., a new field is added to mem2), old saves silently break. There is no migration path because there is no canonical schema to migrate from or to.

### 1.8 Two parallel algorithm implementations have already accumulated

Even within the current architecture, the lack of a shared model has caused **four parallel implementations**:

- Joint trim (`js/23a-shs-joints.js` has 3D-mode and V25 versions — same algorithm, different frame extraction)
- Auto-weld detection (`drawAutoWelds` 3D-only + `drawV25AutoWelds` V25-only)
- Selection highlights (`drawSelHighlight` 3D-only + `v25DrawSelectionHighlight` V25-only)
- Member rendering (`drawUB/drawSHS/drawSectionMember/drawPlate` 3D-mode + `drawMem2D` V25)

These are not bugs — they are the predictable consequence of having two parallel entity stores. The codebase will keep producing parallel pairs for every new feature category (next up: bolt rendering, when v25-2d-bolts lands; after that, joint trim for V25 UBs as soon as anyone asks for it).

---

## Part 2 — what every Revit-class app has that StructDraw doesn't

The pattern below is shared by Revit, Tekla Structures, Allplan, Bentley OpenBuildings, Vectorworks Architect. It's not a single product's design — it's the shape of every BIM application that supports multi-view structural detailing.

### 2.1 One canonical model

`Document` (or `Model`, or `Project`) holds the master collection of all elements. Every element has a stable ID. Every property of every element is reachable via the model — there is no "render-only state" that lives outside it.

### 2.2 Views are projections

A `ViewPlan`, `ViewSection`, `ViewElevation`, `View3D` is an object whose `modelTransform` defines how the model maps into the view's local coordinate space. Plan = top-down with a cut plane. Section = a vertical cut plane with a view direction. Elevation = a vertical view direction without a cut. 3D = a camera (orbit-able).

Adding a new view orientation is adding a new `View` instance with a new `modelTransform`. The renderer doesn't change.

### 2.3 Categories and Families are first-class

Every element belongs to a Category (`Structural Framing`, `Structural Columns`, `Structural Connections`, `Structural Fasteners`, `Annotations`, …). Each category has visibility settings, lineweight defaults, projection rules. Within each category, Families define parametric geometry templates (`UB 310 series`, `UC 250 series`, `Rothoblaas HBS Plate`). Within each family, Types are concrete instances (`310UB40.4`, `HBS-10x100`).

Adding a new screw size = one Type row in the HBS Family. Adding a new screw family = one Family file in the Fastener Category. The renderer dispatches by Category at the top level, by Family within the Category. New types are free.

### 2.4 Materials carry rendering and structural properties

A `Material` is a real object. It owns: name, grade, hatch pattern (surface + cut), display colour, surface finish, and the mechanical properties used by structural calculation engines (E, fy, fu, density, …).

Every Element references a Material. Change "Steel S275" to use a heavier hatch pattern → every steel element re-renders with the new pattern, automatically. AS 1100 compliance becomes a property of the Material catalogue, not the renderer.

### 2.5 Transactions

Every model change is a Transaction. `PlaceElementTransaction(category, family, type, geometry)`. `MoveElementTransaction(elementId, newGeometry)`. `EditElementParameterTransaction(elementId, paramName, newValue)`. The model has `applyTransaction(tx) → { dirty }` and the renderer subscribes to the dirty events. Undo/redo is `tx.undo()` / `tx.redo()` — constant time. Autosave is debounced subscription to the dirty stream.

### 2.6 Renderers are pluggable consumers

A `Renderer` is a function from `(model, view) → output`. Canvas2DRenderer renders to a canvas for screen + raster PDF. VectorRenderer renders to jsPDF primitives for vector PDF. ThreeJSRenderer renders to WebGL for the iso/3D view. DXFEmitter renders to DXF for drafter handoff. Each renderer has a dispatch table indexed by category + family — adding a new entity family means registering one entry per renderer.

A renderer can have a "not yet supported" entry for a category. The model still has the element; the renderer just shows a placeholder marker or nothing. This is the mechanism that makes "ship in 2D first, 3D coming soon" a one-line code change rather than a feature rebuild.

### 2.7 Schedules and rules query the model

A schedule (quantity takeoff, fastener count, bar bending schedule) is a query against the model. `model.elements.where(e => e.category === 'fastener' && e.family === 'rothoblaas-hbs')` returns the count and metadata.

A rule engine (AS 4100 capacity check, AS 1720 timber check, ETA-11/0030 screw check) does the same — it iterates the model finding elements that match its criteria and applies the rule. The rule engine doesn't reach into a separate `connection` entity store; it asks the model for elements that match.

The current StructDraw rule engine in `js/79-checks-timber.js` reaches into a `connection` entity directly, which only exists as a parallel grouping object. A Revit-class rule engine queries `model.elements.where(e => e.category === 'connection' && e.family === 'timber-screw')` and finds connections regardless of how they were created.

---

## Part 3 — why incremental cleanup won't get us there

`codebase-restructure/` proposes seven phases of incremental work: docs realignment, timber-screws corrective, lift globals, split events, remove monkey patches, dedup parallel implementations, schema-version save. Every phase is valuable. None of them adds a model layer.

After all seven phases ship, the codebase is:
- Better documented.
- Lighter on globals.
- Cleaner in event handling.
- Free of monkey patches.
- Free of the worst parallel implementations.
- Versioned in save format.

It is still architected like two independent stores rendered by two independent dispatch tables. A timber screw is still one entity in one store, with a separate timber screw in the other store, with a separate connection grouping. Adding "GLT timber column" still means editing the section catalogue, the V25 mem2 renderer's `memberType` switch, the V26 BB-rail palette, the 3D-mode palette, the Three.js builder (which currently doesn't exist for timber), the inspector's mem2 branch, the size picker. The dedup phase reduces this from 12 files to maybe 9, but it doesn't change the shape.

The ceiling on quality is what the model layer allows. With two parallel stores, the ceiling is "Bluebeam-plus-iso." With a real model layer, the ceiling is "Revit-class structural detailing application." The incremental plan doesn't move the ceiling — it makes the room under the existing ceiling cleaner.

---

## Part 4 — what we actually want

Articulated as design principles that everything else in this folder is in service of:

1. **One Element, many renderers.** Adding a new structural element (column, screw, anchor, dimension type) means defining it once in the model and registering renderers for each output format we care about. A "2D-only-for-now" element is an Element with only the Canvas2DRenderer registered — the model knows about it, the 3D renderer just doesn't draw it.

2. **Visibility, lineweight, hatch, colour are all properties of categories + materials.** Never hardcoded inside renderers. Changing the AS 1100 lineweight for a "cut" line across the whole app is one constant change. Changing the steel hatch density is one catalogue edit.

3. **Tools dispatch transactions; transactions mutate the model; renderers consume the model.** No tool writes to a renderer-specific data structure. No renderer reads from a tool-specific data structure. The model is the only thing they share.

4. **Views are projections of the model, not slots on a sheet.** A sheet is a layout that places views. A view defines a projection. The model is the source.

5. **The catalogue layer carries the AS-compliance defaults.** Section catalogue knows AS 3679 section properties. Fastener catalogue knows AS 1252 / ETA capacities. Material catalogue knows AS 4100 yield strengths. Rule catalogue knows AS 4100 / AS 1720 / AS 3600 rules. The renderer is dumb data-driven dispatch on top.

6. **Save format is a serialisation of the model, with explicit schema version and migrations.** Old saves load correctly forever because every schema version has a migration to the next.

7. **The architecture is testable.** The model layer is pure data + pure functions; the renderer layer is data → output. Both are unit-testable without a browser DOM. The current codebase has zero unit tests partly because there's nothing in it that ISN'T entangled with the DOM.

---

## What this folder defines

`02-target-architecture.md` lays out the five-layer design at a glance. `03-model-layer.md` and `04-catalogue-system.md` define the model and catalogue layers in depth. `05-render-pipeline.md` and `06-tools-and-transactions.md` define the render and tool layers. `07-migration-strategy.md` and `08-pilot-feature.md` answer "how do we get from here to there without breaking Dan's daily-use app?" `09-build-plan.md` sequences the work.

The destination is a structural BIM application that competes pound-for-pound with Revit in the narrow field of structural detailing for Australian Standards. The starting point is a paint program with an iso viewer. The path between them is the rest of this folder.
