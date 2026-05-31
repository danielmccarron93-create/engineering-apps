# Model Layer — deep design

This file defines the substance of v2. Get the shapes here right and the rest of the architecture follows. Get them wrong and we ship "two paint programs sharing a model class."

The Model Layer is **pure data + pure functions**. No DOM. No canvas. No `window.*`. Every function in this layer is unit-testable in isolation. JSDoc types throughout so the IDE can help without a build step.

---

## 1. Identity — `ElementId`, `MaterialId`, `ViewId`, `SheetId`

Stable, opaque, unique-within-a-document identifiers. Used for cross-references (an Element's `hostId`, a View's child elements, a Sheet's view placements).

```javascript
/**
 * @typedef {string} ElementId  — UUID v4 or 12-char crockford-base32
 * @typedef {string} MaterialId — short stable string ('steel-s275', 'timber-gl18-h', …)
 * @typedef {string} ViewId
 * @typedef {string} SheetId
 */

// Helper to mint a new ElementId:
function newElementId() { /* crypto.randomUUID() in modern browsers */ }
```

**Why opaque strings, not numbers:** numbers force a counter and break under merge/import. Opaque strings are stable under refactor, save-load, and future multi-document work.

**Why MaterialId is short and stable but ElementId is UUID:** Materials are referenced by name in saved files (`materialId: 'steel-s275'` is readable in a `.sd2.json`) and there are a small fixed number of them. Elements are anonymous instances and there are thousands — UUID-as-string is fine.

---

## 2. `StructuralModel` — the root

```javascript
/**
 * @typedef {object} StructuralModel
 * @property {number} schemaVersion       — bumped per breaking change to this shape
 * @property {Map<ElementId, Element>} elements
 * @property {Map<MaterialId, Material>} materials
 * @property {Map<ViewId,     View>}    views
 * @property {Map<SheetId,    Sheet>}   sheets
 * @property {ProjectMetadata} project
 * @property {number} version             — incremented on every applyTransaction
 *                                          (used for cache invalidation)
 */
```

The Model is a **plain JavaScript object**, not a class. Functions operate on it. Reasons:

- **Serialisation is trivial.** `JSON.stringify(model)` works directly (with `Map` → array-of-pairs serialisation). No `toJSON` methods. No reviver gymnastics.
- **Time-travel is cheap.** Transactions can keep the old model around for undo without complex cloning logic.
- **No `this`-confusion.** Every function takes the model as its first argument; intent is clear.
- **Testable.** Unit tests construct a model with `{ elements: new Map([…]), materials: new Map([…]), … }` and call functions on it. No constructor, no factory, no DI.

The model is **immutable by convention** at the top level — `applyTransaction` returns a new model with the changed slices replaced and the version incremented. Internal Maps are mutated (we don't deep-clone every Element on every change) but the consumer treats `model` as a snapshot.

```javascript
// pseudocode for applyTransaction's shape
function applyTransaction(model, tx) {
  const newModel = { ...model, version: model.version + 1 };
  newModel.elements = new Map(model.elements);
  // tx.apply mutates newModel.elements (or any of the other Maps) in place
  const dirty = tx.apply(newModel);
  return { newModel, dirty };
}
```

---

## 3. `Element` — the universal currency

Every structural and annotation primitive in v2 is an Element. There is no "3D object" type and no "2D entity" type. There is one Element type with category-discriminated geometry.

```javascript
/**
 * @typedef {object} Element
 * @property {ElementId} id
 * @property {Category} category        — top-level taxonomy
 * @property {FamilyId} family          — parametric family within the category
 * @property {TypeId}   type            — concrete instance within the family
 * @property {Geometry} geometry        — discriminated by category
 * @property {ElementId} [hostId]       — for hosted elements (a screw IN a beam)
 * @property {MaterialId} materialId
 * @property {Record<string, any>} params  — instance-level free-form parameters
 *                                            (e.g., user-overridden bolt grade)
 * @property {Map<ViewId, ViewOverride>} [viewOverrides]
 *                                          — view-specific visibility / appearance
 * @property {ElementId[]} [annotationIds]  — for elements that own annotations
 * @property {number} createdAt         — epoch ms, for tooling like "newest first"
 */
```

**Field-by-field rationale:**

- **`category`** — the top-level rendering and visibility key. `'beam' | 'column' | 'brace' | 'plate' | 'fastener' | 'reinforcement' | 'masonry' | 'concrete-region' | 'timber-member' | 'annotation' | 'detail-component' | 'sheet-component'`. Categories drive default lineweights, visibility, and rendering dispatch fallback.
- **`family`** — within a category, the parametric family. For beams: `'ub' | 'uc' | 'pfc' | 'shs' | 'rhs' | 'chs' | 'ea' | 'ua' | 'wb' | 'glt' | 'clt' | 'custom-rect'`. For fasteners: `'as1252-bolt' | 'rothoblaas-hbs' | 'anchor-bolt' | 'shear-stud' | …`. For annotations: `'dimension' | 'leader' | 'tag' | 'note' | 'section-mark' | 'detail-callout' | 'revision-cloud' | …`.
- **`type`** — concrete catalogue row. `'310UB40.4'` (in family `ub`), `'HBS-10x100'` (in family `rothoblaas-hbs`), `'M20-8.8-S'` (in family `as1252-bolt`), `'aligned'` (in family `dimension`). The pairing `(category, family, type)` uniquely identifies a catalogue entry.
- **`geometry`** — the where + how-big + how-oriented data. Discriminated by category, see §4 below.
- **`hostId`** — only present for hosted elements. A screw is hosted by its parent timber member; a bolt is hosted by the assembly it bolts together (the host is one of the plates, chosen by tool heuristic). Hosted elements move with their host.
- **`materialId`** — reference into `model.materials`. Drives hatch, colour, and structural properties.
- **`params`** — per-instance overrides. For most elements this is empty (the catalogue Type covers everything). For dimension elements: `{ precision: 1, units: 'mm', dimStyle: 'iso' }`. For annotation elements: `{ text: 'TYP', leaderArrow: 'closed' }`. For occasional element-level overrides: `{ overrideBoltGrade: '10.9' }`.
- **`viewOverrides`** — per-view visibility, lineweight, hatch override. Most elements have none. When a user does "hide this in this view only," it's an entry here.
- **`annotationIds`** — for elements that own a child annotation (a beam tag, a connection callout). Annotations are themselves Elements; the relationship is `parent.annotationIds.push(annotationElementId)` and `annotationElement.hostId = parentId`. The bidirectional reference is intentional — queries from either side are common.

**Element is NOT a class.** It's a plain object. Functions like `elementBoundingBox(elem, model)`, `elementMaterial(elem, model)`, `elementCategory(elem)` operate on it. Test helpers construct elements directly: `const e = { id, category: 'fastener', family: 'rothoblaas-hbs', type: 'HBS-10x100', geometry: { kind: 'point', location: {…}, rotation: …}, materialId: 'screw-galv-grade-c1022' };`.

---

## 4. `Geometry` — discriminated union by category

Each category has a canonical geometry shape. The discriminator is `geometry.kind` (not the element's category — geometry kinds can be reused across categories; e.g., a brace and a beam share `LinearMember` geometry).

```javascript
/**
 * @typedef {LinearMember | Plate | PointInstance | Annotation | Region | Polyline} Geometry
 */

/**
 * @typedef {object} LinearMember        — beam, column, brace, timber member
 * @property {'linear'} kind
 * @property {Point3D} start
 * @property {Point3D} end
 * @property {Frame3D} frame              — { axisU, axisV, axisW } orthonormal triad
 *                                          axisU = start→end (long axis)
 *                                          axisV = "up" in the section plane
 *                                          axisW = axisU × axisV
 * @property {number} rotation            — rotation about axisU (radians)
 */

/**
 * @typedef {object} Plate
 * @property {'plate'} kind
 * @property {Point3D} origin             — corner or centroid of the plate's plane
 * @property {Polygon3D} polygon          — vertices in the plate's local 2D, projected onto the plate plane
 * @property {Frame3D} frame              — plate's local frame (normal = axisW)
 * @property {number} thickness
 */

/**
 * @typedef {object} PointInstance       — bolt, screw, anchor
 * @property {'point'} kind
 * @property {Point3D} location           — head centre (or anchor point per family convention)
 * @property {Vector3D} normal            — direction the fastener points (head → tip)
 * @property {number} rotation            — rotation about normal (radians) — usually 0
 *                                          for bolts but matters for asymmetric heads
 * @property {number} [embedmentDepth]    — for hosted fasteners (overrides catalogue default)
 */

/**
 * @typedef {object} Annotation         — dimension, leader, tag, callout
 * @property {'annotation'} kind
 * @property {ViewId} viewId              — annotations are always view-local
 * @property {Point2D[]} points           — view-space (paper-space-mm)
 * @property {ElementId[]} [refs]         — referenced model elements (for tags / dims)
 * @property {Record<string, any>} data   — type-specific fields (text, precision, style)
 */

/**
 * @typedef {object} Region            — hatch region, blockwork, masonry, concrete poly
 * @property {'region'} kind
 * @property {ViewId|null} viewId         — null = model-level (i.e., a real solid),
 *                                          otherwise view-local (a paper hatch)
 * @property {Polygon3D|Polygon2D} polygon
 * @property {Frame3D} [frame]            — for model-level regions
 */

/**
 * @typedef {object} Polyline          — break line, leader path, free polyline
 * @property {'polyline'} kind
 * @property {ViewId|null} viewId
 * @property {(Point3D|Point2D)[]} points
 * @property {boolean} closed
 */
```

**Key design choice — view-local vs model-level geometry.** Some elements are inherently 3D (a beam has a real X-Y-Z position). Some are inherently view-local (a dimension is drawn ON a view; it doesn't have a 3D position). The geometry kind tells you which.

- `LinearMember`, `Plate`, `PointInstance` — **model-level**. Defined in world 3D coordinates. Visible in all 3D projections, plus in view-local paper-space drawing once projected.
- `Annotation`, view-local `Region`, view-local `Polyline` — **view-local**. Defined on a specific view. The `viewId` field tells you which view they belong to.
- `Region` and `Polyline` can be either model-level (a concrete slab outline in 3D) or view-local (a paper hatch on an elevation). The discriminator is `viewId === null`.

**This is the v2 answer to the current "objects3D vs entities2D" split.** Both shapes exist (some elements are model-level, some are view-local) but they're both Elements in the same StructuralModel, distinguished by geometry kind, not by which array they live in. The renderer dispatches on geometry kind + category + family.

---

## 5. `View` — projection definition, not a slot

```javascript
/**
 * @typedef {object} View
 * @property {ViewId} id
 * @property {'plan' | 'section' | 'elevation' | 'iso' | '3d-perspective' | 'paper-space'} type
 * @property {string} name                — human-readable ("Plan B", "Section A-A", "Detail 3")
 * @property {Matrix4} modelTransform     — model coords → view-local coords
 * @property {Plane3D} [cutPlane]         — for sections / plans (cut + look direction)
 * @property {number} [cutDepth]          — how far past the cut plane the view extends
 * @property {Camera3D} [camera]          — for iso / 3D-perspective
 * @property {number} scale               — e.g. 50 for "1:50"
 * @property {Map<Category, boolean>} [categoryVisibility]
 * @property {Set<ElementId>}  [hideOverrides]   — explicit element-level hide list
 * @property {Set<ElementId>}  [showOverrides]   — explicit element-level show list
 *                                                 (overrides category hide)
 * @property {LineweightTable} [lineweightOverride]
 * @property {boolean} [showAnnotationsOnly]     — for paper-space tool: only draw
 *                                                 view-local annotations, no model
 */
```

**A View is independent of any Sheet placement.** The same View can be placed on multiple Sheets at different scales/positions. The View defines "what slice of the model and how do I project it"; the Sheet defines "where on the paper does this view sit."

**`paper-space` View type** is the v2 equivalent of V25 2D-Studio mode. Its `modelTransform` is the identity (or null) and `showAnnotationsOnly` is true — the renderer only iterates Elements with `geometry.kind === 'annotation' | 'region' | 'polyline'` AND `geometry.viewId === thisViewId`. This is how Bluebeam-style paper-space drafting integrates into the unified model: paper entities are still Elements, they just live in a View whose projection is "the paper."

---

## 6. `Sheet` — composition of Views

```javascript
/**
 * @typedef {object} Sheet
 * @property {SheetId} id
 * @property {string} name                — "S-101", "Connection Details 6011"
 * @property {SheetSize} size             — A1, A2, A3, A4, custom
 * @property {SheetPlacement[]} placements
 * @property {TitleBlock} titleBlock
 * @property {RevisionData[]} revisions
 */

/**
 * @typedef {object} SheetPlacement
 * @property {ViewId} viewId
 * @property {Point2D} originOnSheet       — paper-mm
 * @property {number} rotation             — usually 0
 * @property {Polygon2D} [clipBoundary]   — for non-rectangular detail callouts
 */
```

Sheets are layouts. Each sheet has up to N view placements + a title block. The title block is itself a series of view-local annotation Elements bound to the sheet's title-block view (which is internally just a paper-space view with `name === 'titleblock-of-<sheetId>'`).

A typical structural detail sheet (matching STP 6011) has 4-8 view placements on an A1: a cap-plate detail has elevation + plan + section + iso, all of the same connection, each a separate View placed on the same Sheet. The Views all share a `cutPlane` derived from the same model — so editing the model in any view updates them all.

---

## 7. `Material` — structural + display

```javascript
/**
 * @typedef {object} Material
 * @property {MaterialId} id
 * @property {string} name                — "Steel S275", "Concrete N32", "Timber MGP10"
 * @property {MaterialClass} class        — 'steel' | 'concrete' | 'timber' | 'masonry' | 'soil' | 'fastener' | 'other'
 * @property {string} grade               — "S275", "N32", "MGP10", "GL18h", "C50/60"
 * @property {DisplayProps} display       — hatch, colour, line style
 * @property {StructuralProps} structural — E, fy, fu, density, source standard…
 */

/**
 * @typedef {object} DisplayProps
 * @property {HatchPattern} hatchCut      — when the element is cut by a section
 * @property {HatchPattern} hatchProj     — when the element is projected (elevation/plan)
 * @property {string} color               — CSS colour (theme-aware)
 * @property {LineStyle} outlineCut       — line style of the cut outline
 * @property {LineStyle} outlineProj
 */

/**
 * @typedef {object} StructuralProps
 * @property {string} sourceStandard      — "AS 3678", "AS 3600", "AS 1720.1", …
 * @property {number} [fy]                — yield strength MPa (steel)
 * @property {number} [fu]                — ultimate MPa
 * @property {number} [E]                 — Young's modulus MPa
 * @property {number} [G]                 — shear modulus
 * @property {number} [density]           — kg/m³
 * @property {number} [characteristicStrength]  — for concrete, timber
 * // ... etc. shape varies by class
 */
```

Materials are the centre of AS-compliance defaults. **Every drawing-style property of every Element is derived from its Material.** A renderer never hardcodes a hatch or a colour. The renderer asks the material for its hatchCut/hatchProj and renders it.

**This is the unification point for the current scattered hatch implementations.** AS 1100 steel hatch lives in `materials/steel.js` as the steel materials' `hatchCut`. Concrete-dot pattern lives in `materials/concrete.js`. Timber grain lives in `materials/timber.js`. There is no `26-as1100-hatch.js` / `67-v25-materials.js` / inline-in-`34-draw-2d.js` split — there's one materials catalogue and the renderers look up patterns by material.

---

## 8. `Transaction` — the only way the model changes

Every model mutation is a Transaction. There is no `model.elements.push(…)` anywhere in the codebase outside of transaction implementations.

```javascript
/**
 * @typedef {object} Transaction
 * @property {string} type                — discriminator
 * @property {string} description         — human-readable for the undo stack
 * @property {(model: StructuralModel) => DirtySet} apply
 * @property {(model: StructuralModel) => DirtySet} unapply
 * @property {Record<string, any>} data   — type-specific payload
 */

/**
 * @typedef {object} DirtySet
 * @property {Set<ElementId>} elements   — which elements changed
 * @property {Set<ViewId>}    views      — which views are dirty as a result
 * @property {Set<SheetId>}   sheets     — which sheets need re-render
 * @property {BoundingBox3D}  [bbox]     — optional spatial hint for dirty region
 */
```

**The full transaction taxonomy** (initial set; grows organically):

- `PlaceElementTransaction(category, family, type, geometry, hostId?, materialId, params?)` — create a new Element. Reverse: delete.
- `DeleteElementTransaction(elementId)` — remove. Reverse: re-insert with original data.
- `MoveElementTransaction(elementId, newGeometry)` — change geometry. Reverse: revert.
- `EditElementTransaction(elementId, paramChanges)` — change params or material. Reverse: revert.
- `SetMaterialTransaction(elementId, newMaterialId)` — convenience.
- `BatchTransaction(txs[])` — atomic group. Reverse: reverse each tx in reverse order.
- `CreateViewTransaction(viewSpec)` — new View. Reverse: delete.
- `EditViewTransaction(viewId, changes)` — change view properties.
- `CreateSheetTransaction(sheetSpec)`.
- `PlaceViewOnSheetTransaction(sheetId, viewId, transform)`.
- `CreateAnnotationTransaction(viewId, annotationSpec)` — same shape as PlaceElement but always view-local.
- `DefineMaterialTransaction(material)` — add/edit a material.

**Why transactions, not direct mutation:**

1. Undo/redo is constant time. `UndoStack.pop().unapply(model)` — that's it.
2. Autosave is dirty-flag driven, not snapshot-driven.
3. Co-editing (future feature for office collaboration) only needs serialisable transactions over the wire.
4. Plugins can subscribe to specific transaction types (`onPlaceElement(elem => rule.check(elem))`).
5. Tests can construct transactions and assert their effect on the model, no rendering needed.
6. The dirty set tells the renderer what to re-render — no full-scene redraws.

---

## 9. Query API

```javascript
/**
 * Find elements matching a predicate. Optimised with a spatial index.
 * @param {StructuralModel} model
 * @param {(elem: Element, model: StructuralModel) => boolean} predicate
 * @returns {Element[]}
 */
function query(model, predicate) { … }

// Convenience helpers:
function elementsByCategory(model, category) { … }
function elementsByFamily(model, category, family) { … }
function elementsInBox(model, box) { … }
function elementsInView(model, view) { … }
function hostedBy(model, hostId) { … }
function annotationsOf(model, elementId) { … }
function hitTest(model, view, point2D, options) { … }
```

Queries are the only way to read from the model in code outside the model layer. Renderers query. Rule engines query. Schedules query. The Inspector queries. Tools query.

Spatial indexing (R-tree or grid) is added when performance demands it. Initial implementation is linear scan over `model.elements.values()`. For a model under ~1,000 elements, this is fine.

---

## 10. Schema versioning

```javascript
model.schemaVersion = 2;  // current

// Migrations registered in /js/v2/io/migrations/
const MIGRATIONS = [
  { from: 1, to: 2, run: migrateV1ToV2 },  // v1 = current .sd2.json shape (objects3D + entities2D)
  { from: 2, to: 3, run: migrateV2ToV3 },  // future
];
```

**The v1 → v2 migration is the critical piece.** A current `.sd2.json` has `objects3D` (array of 3D-mode objects) and `entities2D` (per-view bucket of V25 entities) plus `blocks` (view placements). The migrator walks both arrays and produces:

- Each `objects3D` item → one Element with category determined by `obj.type` (mapping `'ub' → 'beam' + family 'ub'`, etc.), geometry kind `'linear'` or `'plate'` or `'point'` as appropriate, materialId derived from a default ("Steel S275" for steel members, etc.).
- Each `entities2D[viewKey]` item → one Element with view-local geometry (annotation / region / polyline / point depending on entity type), with `geometry.viewId = newViewIdForViewKey(viewKey)`.
- Each `blocks` item → a View (with the `viewKey` mapped to a real View `type` and `modelTransform`) plus a SheetPlacement on a single auto-generated Sheet.

The migration is one-way (v1 → v2; no reverse). It runs once per file on first open in v2. After migration, the file saves in v2 shape forever.

The migration code is the v1↔v2 bridge — it's a 200-300 line file that fully understands both shapes. It's also the test fixture: every v1 sample file in the test suite is loaded, migrated, and compared against a known-good v2 fixture.

---

## 11. Where this lives in the file system

```
js/v2/
├── model/
│   ├── element.js                — Element type + factories
│   ├── geometry.js               — Geometry discriminated union + factories
│   ├── material.js               — Material type + defaults
│   ├── view.js                   — View type + projection helpers
│   ├── sheet.js                  — Sheet type + placement helpers
│   ├── model.js                  — StructuralModel + applyTransaction + query
│   └── id.js                     — newElementId / newViewId / etc.
├── transactions/
│   ├── place-element.js
│   ├── delete-element.js
│   ├── move-element.js
│   ├── edit-element.js
│   ├── batch.js
│   ├── view-transactions.js
│   ├── sheet-transactions.js
│   └── index.js                  — exports + registry
├── catalogues/                   — see 04-catalogue-system.md
├── geometry/                     — pure math (Frame, Polygon, projection, jointTrim, occlusion)
├── render/                       — see 05-render-pipeline.md
├── tools/                        — see 06-tools-and-transactions.md
├── engine/                       — DirtyScheduler, UndoStack, Autosave, FileIO
└── io/
    ├── serialise.js              — model → JSON
    ├── deserialise.js            — JSON → model + migration
    └── migrations/
        ├── v1-to-v2.js           — the critical v1 .sd2.json migrator
        └── (future migrations)
```

**Co-existence with v1 code:** the existing flat `js/01-…/74-…/76-…/99-…` files stay where they are. v2 lives in `js/v2/`. The `index.html` script tags load both during the migration period — see `07-migration-strategy.md`.

**Classic scripts, not modules.** Even though the v2 file tree has subdirectories, every `.js` file under `js/v2/` is loaded as a classic `<script>` tag and exposes its definitions on `window.v2.<namespace>` (e.g., `window.v2.model.applyTransaction`). This keeps the no-build-step constraint intact. When ESM migration eventually happens, the namespace structure already mirrors what ESM would do.

---

## 12. What this layer does NOT do

- **No rendering.** Anything that touches `ctx.lineTo`, `Path2D`, WebGL, jsPDF, or DXF emission is in the Render Layer.
- **No DOM.** Anything that touches `document.*`, `addEventListener`, or browser globals is in the UI / Engine layers.
- **No tool dispatch.** The tool layer composes transactions and hands them to `applyTransaction`. The model never knows there's a tool.
- **No persistence.** Save/load is in the Engine Layer's I/O module.
- **No undo/redo state.** The model doesn't keep its own history. The UndoStack in the Engine Layer holds the transactions; the model is replayed forward/backward through them.
- **No async.** Every model operation is synchronous. (Persistence is async at the I/O boundary — but `applyTransaction` itself is sync.)

This containment is what makes the layer unit-testable. A JSDOM test that loads the v1 → v2 migration code and asserts that a known v1 fixture produces a known v2 model doesn't need a canvas, doesn't need event listeners, doesn't need Three.js. It needs the model layer and the catalogues. That's it.
