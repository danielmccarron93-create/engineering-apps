# Render Pipeline — many renderers, one model

This file defines how Elements become pixels (or vector PDF, or DXF lines, or WebGL meshes). The contract is uniform across all renderers, which is what makes "register one entry per renderer" the unit of work for adding a new structural primitive.

---

## 1. The Renderer interface

```javascript
/**
 * @typedef {object} Renderer
 * @property {string} name                    — 'canvas2d', 'vector-pdf', 'threejs', 'dxf', 'svg', 'ifc'
 * @property {Map<string, RenderFn>} RENDERERS — keyed by 'category:family' or 'category:*'
 * @property {(model, view, dirtyRegion, output) => void} render
 * @property {(elem, view, point) => HitResult | null} hitTest  — optional, for interactive renderers
 */

/**
 * @typedef {(element, ctx) => void} RenderFn
 *   ctx is a renderer-specific draw context:
 *   - Canvas2DRenderer:  { model, view, canvas2d, primitives, materials, ... }
 *   - ThreeJSRenderer:   { model, view, scene, materials, ... }
 *   - DXFEmitter:        { model, view, dxfWriter, materials, ... }
 *   etc.
 */
```

Each renderer is a self-contained module. The model knows nothing about renderers; renderers know only the model + their own ctx.

---

## 2. The renderers we'll have

### 2.1 Canvas2DRenderer

The workhorse — renders to a `CanvasRenderingContext2D` for screen display, raster PDF export, and JSDOM testing.

```javascript
// js/v2/render/canvas2d/index.js
window.v2.render = window.v2.render || {};

const Canvas2DRenderer = {
  name: 'canvas2d',

  RENDERERS: new Map([
    // Beams
    ['beam:ub',    drawBeamUB],
    ['beam:uc',    drawBeamUC],
    ['beam:pfc',   drawBeamPFC],
    ['beam:shs',   drawBeamSHS],
    ['beam:rhs',   drawBeamRHS],
    ['beam:chs',   drawBeamCHS],
    ['beam:ea',    drawBeamEA],
    ['beam:ua',    drawBeamUA],
    ['beam:wb',    drawBeamWB],
    ['beam:glt',   drawBeamTimber],
    ['beam:clt',   drawBeamTimber],   // CLT shares the timber renderer (with grain variant)
    
    // Columns reuse beam renderers — column-specific orientation is in the family,
    // not the renderer:
    ['column:ub',  drawBeamUB],
    ['column:uc',  drawBeamUC],
    // ...

    // Plates
    ['plate:*',                  drawPlate],         // any plate family

    // Fasteners
    ['fastener:as1252-bolt',     drawBolt],
    ['fastener:rothoblaas-hbs',  drawHBSScrew],
    ['fastener:anchor-bolt',     drawAnchor],
    ['fastener:shear-stud',      drawShearStud],

    // Reinforcement
    ['reinforcement:bar',        drawRebar],
    ['reinforcement:mesh',       drawMesh],

    // Masonry
    ['masonry:cmu',              drawMasonryCMU],

    // Concrete regions
    ['concrete-region:*',        drawConcreteRegion],

    // Annotations
    ['annotation:dimension',     drawDimension],
    ['annotation:leader',        drawLeader],
    ['annotation:tag',           drawTag],
    ['annotation:section-mark',  drawSectionMark],
    ['annotation:detail-callout',drawDetailCallout],
    ['annotation:revision',      drawRevision],

    // Sheet components
    ['sheet-component:titleblock', drawTitleblock],

    // Detail components
    ['detail-component:breakline',     drawBreakline],
    ['detail-component:slot',          drawSlot],
    ['detail-component:weld-symbol',   drawWeldSymbol],
  ]),

  render(model, view, dirtyRegion, ctx) {
    // 1. Project view's modelTransform onto the canvas
    const viewToCanvas = composeTransform(view.modelTransform, ctx.canvasTransform);

    // 2. Iterate elements, dispatch by category:family
    for (const elem of model.elements.values()) {
      if (!isInView(elem, view, dirtyRegion)) continue;

      const key1 = `${elem.category}:${elem.family}`;
      const key2 = `${elem.category}:*`;
      const fn = this.RENDERERS.get(key1) ?? this.RENDERERS.get(key2);

      if (fn) {
        const renderCtx = buildRenderContext(elem, model);
        const drawCtx = { model, view, viewToCanvas, canvas2d: ctx, ...renderCtx };
        fn(elem, drawCtx);
      } else {
        // No renderer for this category:family — skip silently or show placeholder
        if (DEBUG_MARKERS) drawMissingRendererMarker(elem, drawCtx);
      }
    }
  },

  hitTest(model, view, point2D, options) {
    // ... mirror dispatch by category:family to a per-category hit-test
  },
};

window.v2.render.Canvas2DRenderer = Canvas2DRenderer;
```

**Each `draw<Thing>` function is the v2 equivalent of one of the current `js/29-…/34-…/35-…/68-…` files.** They're imperative draw code — `ctx.beginPath`, `ctx.moveTo`, `ctx.stroke` — but they receive a clean `drawCtx` with the resolved material, lineweights, hatch patterns, view transform. No more `obj.x` / `ent.p1` / global state.

```javascript
// js/v2/render/canvas2d/draw-fastener-rothoblaas-hbs.js
function drawHBSScrew(element, ctx) {
  const { type, material, lineweight, color, viewToCanvas } = ctx;
  
  // Geometry: point instance — head location + normal vector
  const { location, normal, rotation } = element.geometry;
  
  // Project location and normal into view-local 2D
  const head2D = projectPoint(location, viewToCanvas);
  const normal2D = projectVector(normal, viewToCanvas);
  
  // Is this end-on (head facing viewer) or side-profile (axis in view plane)?
  const isEndOn = Math.abs(normal2D.length()) < END_ON_TOLERANCE;
  
  if (isEndOn) {
    drawHBSHeadOn(head2D, type, color, lineweight, ctx.canvas2d);
  } else {
    drawHBSSideProfile(head2D, normal2D, type, color, lineweight, ctx.canvas2d);
  }
}

// Helper for AS 1100 head-on view: circle + crosshair
function drawHBSHeadOn(centre2D, type, color, lineweight, canvas2d) {
  const r = type.d / 2;  // shaft radius — head visualised as shaft circle
  canvas2d.beginPath();
  canvas2d.arc(centre2D.x, centre2D.y, r, 0, 2 * Math.PI);
  canvas2d.strokeStyle = color;
  canvas2d.lineWidth = lineweight.proj * ppm();
  canvas2d.stroke();
  // crosshair
  canvas2d.beginPath();
  canvas2d.moveTo(centre2D.x - r, centre2D.y);
  canvas2d.lineTo(centre2D.x + r, centre2D.y);
  canvas2d.moveTo(centre2D.x, centre2D.y - r);
  canvas2d.lineTo(centre2D.x, centre2D.y + r);
  canvas2d.lineWidth = LINEWEIGHTS.thin * ppm();
  canvas2d.stroke();
}

// Helper for side profile: head + threaded shaft + tip
function drawHBSSideProfile(head2D, axis2D, type, color, lineweight, canvas2d) {
  // ... AS 1100 conforming side profile, matching the quality of drawBolt
}
```

The renderer function is ~50 lines. Everything it needs comes through `ctx`. It doesn't know about timber, doesn't know about V25, doesn't know about objects3D. It draws a fastener.

### 2.2 VectorRenderer (jsPDF vector PDF)

Same dispatch table, different `draw<Thing>` functions that emit jsPDF primitives instead of canvas2d primitives. Some primitives are shared (a polyline is a polyline) so many `draw<Thing>` functions can be promoted to a common renderer with a backend abstraction:

```javascript
// js/v2/render/primitives/line.js
function rLine(ctx, p1, p2, lineweight, color, style) {
  ctx.backend.line(p1, p2, lineweight, color, style);
}

// ctx.backend is one of:
//   Canvas2DBackend  — ctx.canvas2d.beginPath / moveTo / lineTo / stroke
//   JsPDFBackend     — ctx.pdf.line(p1.x, p1.y, p2.x, p2.y)
//   DXFBackend       — emit DXF LINE entity
//   SVGBackend       — append <line> element
```

Most renderers share the dispatch table and the draw functions — they differ only in the backend that the primitives target. This is much cleaner than the current `js/44-pdf-export.js` canvas-shim approach (which monkey-patches canvas2d methods to redirect to jsPDF during export).

### 2.3 ThreeJSRenderer

Builds Three.js scene objects from Elements. Used for the iso block + any future 3D-perspective views.

```javascript
// js/v2/render/threejs/index.js
const ThreeJSRenderer = {
  name: 'threejs',

  RENDERERS: new Map([
    ['beam:ub',  buildMeshUB],
    ['beam:uc',  buildMeshUC],
    ['beam:shs', buildMeshSHS],
    ['plate:*',  buildMeshPlate],
    ['fastener:as1252-bolt', buildMeshBolt],
    // Note: 'fastener:rothoblaas-hbs' has no entry initially —
    // "2D first, 3D coming soon" UX
  ]),

  render(model, view, dirtyRegion, ctx) {
    // ctx.scene is a THREE.Scene
    const dirtyIds = dirtyRegion?.elements ?? new Set(model.elements.keys());

    for (const id of dirtyIds) {
      const elem = model.elements.get(id);
      if (!elem) {
        // Element deleted — remove mesh
        ctx.removeMesh(id);
        continue;
      }
      const key1 = `${elem.category}:${elem.family}`;
      const key2 = `${elem.category}:*`;
      const fn = this.RENDERERS.get(key1) ?? this.RENDERERS.get(key2);
      if (fn) {
        const mesh = fn(elem, ctx);
        ctx.upsertMesh(id, mesh);
      } else {
        // No 3D renderer — placeholder marker or skip
        if (ctx.showPlaceholders) {
          ctx.upsertMesh(id, ctx.buildPlaceholderMarker(elem));
        }
      }
    }
  },
};
```

**The "3D coming soon" UX** is governed by which entries are in `ThreeJSRenderer.RENDERERS`. A category with no entry → element doesn't appear in 3D, with optional placeholder. The UI layer can read `ThreeJSRenderer.RENDERERS.has(key)` to know whether to grey out the 3D-mode tile for a given family.

### 2.4 DXFEmitter

Iterates the model, emits DXF entities. Used for drafter handoff. Same dispatch shape.

### 2.5 SVGEmitter

Future — for web sharing of detail extracts. Same shape.

### 2.6 IFCEmitter (future)

For interop with other BIM tools (Tekla, Revit-via-IFC). Future. Shape established now means we can add it later without restructure.

---

## 3. The "Render Context" (the per-element draw context)

Every `draw<Thing>` function receives a `RenderContext` (the `ctx` arg in the examples above). The Render Context is built once per element per render pass.

```javascript
/**
 * @typedef {object} RenderContext
 * @property {Renderer} renderer            — the renderer name + backend
 * @property {StructuralModel} model
 * @property {View} view
 * @property {Matrix4} viewToCanvas         — final composed transform
 * @property {Category} category            — looked up from catalogue
 * @property {Family}   family
 * @property {Type}     type
 * @property {Material} material
 * @property {Lineweight} lineweight        — { cut, proj, hidden } in mm
 * @property {HatchPattern} hatchCut
 * @property {HatchPattern} hatchProj
 * @property {string} color                 — resolved CSS string
 * @property {ViewCutClass} cutClass        — 'cut' | 'projected' | 'hidden' | 'beyond'
 *                                            — computed from view.cutPlane + element bbox
 * @property {boolean} isSelected
 * @property {boolean} isHovered
 * @property {Backend} backend              — the renderer-specific output target
 *                                            (canvas2d / pdf / dxf / threejs scene)
 */
```

The Render Context is the v2 unification of:
- Today's `LW` constant
- Today's scattered `materialFillAlpha` calls
- Today's `withRotation` helper
- Today's `getCutClass` from auto-weld.js
- Today's hatch dispatch
- Today's hand-rolled colour fetches
- Today's `viewport.zoom / drawingScale` calculations

It's the single object a renderer function looks at to decide every visual property.

---

## 4. Dirty regions and incremental rendering

The model fires dirty events when transactions apply. The dirty set tells renderers what to re-render.

```javascript
/**
 * @typedef {object} DirtySet
 * @property {Set<ElementId>} elements      — element ids that changed
 * @property {Set<ViewId>}    views         — views that need re-render
 * @property {Set<SheetId>}   sheets        — sheets that need re-render
 * @property {BoundingBox3D}  [bbox]        — model-space bbox for spatial culling
 */
```

**Canvas2DRenderer** uses dirty regions for incremental redraw:

- Clear the dirty rect on the canvas.
- Re-render every element whose bbox intersects the dirty rect (any change inside requires every element ON TOP also re-rendering — the painter's algorithm requires layered re-render of the affected stack).
- For most edits, this is a small fraction of the canvas. For 99% of structural details with <500 elements, this is plenty fast.

**ThreeJSRenderer** uses dirty IDs:

- For each dirty ElementId, rebuild the mesh and upsert it.
- The scene is cumulative — meshes that weren't dirty stay.

**A full re-render** is dirty = all elements, triggered on: load, view change (different modelTransform), category-visibility toggle, theme switch.

---

## 5. Geometry primitives (the math layer)

These are the pure-function geometry helpers every renderer + every joint algorithm uses. They live in `js/v2/geometry/` and depend on nothing in the model or render layers.

```javascript
// js/v2/geometry/frame.js
function makeFrame(origin, axisU, axisV) { /* returns Frame3D with orthonormal axisW */ }
function projectFrame(frame, modelTransform) { /* project to view-local 2D */ }

// js/v2/geometry/polygon.js
function polygonArea(poly) { … }
function polygonCentroid(poly) { … }
function polygonBoundingBox(poly) { … }
function polygonClip(poly, clipPlane) { /* Sutherland–Hodgman */ }
function polygonProject(poly, modelTransform) { … }

// js/v2/geometry/joint-trim.js
function computeJointTrim(member, neighbours, frame, halfDepth, halfWidth) {
  // The unified joint algorithm — replaces the parallel 3D/V25 pair in
  // current js/23a-shs-joints.js.
}

// js/v2/geometry/occlusion.js
function isOccluded(p1, p2, occluders) { … }
function clipLineAgainstOcclusion(p1, p2, occluders) { … }

// js/v2/geometry/section-profile.js
function iSection(d, bf, tf, tw, r1)       { /* polygon for I-shape */ }
function cSection(d, bf, tf, tw, r1)       { /* PFC polygon */ }
function hollowRectangle(d, bf, t)         { /* SHS/RHS — outer + inner polys */ }
function hollowCircle(D, t)                { /* CHS */ }
function ellSection(a, b, t, r1)           { /* angle */ }
function customRectangle(d, b)             { /* timber, custom-rect */ }
```

**Unit-testable.** A Vitest/JSDOM test for `computeJointTrim` constructs Frame objects, calls the function, asserts the resulting clip polygons. No browser, no canvas, no model.

**Shared by all renderers.** Canvas2DRenderer uses `iSection` to draw the polygon, ThreeJSRenderer uses it to build the extrusion shape, DXFEmitter uses it to emit DXF polyline entities. One source of geometric truth.

---

## 6. Hit-testing

The Canvas2DRenderer (and any interactive renderer) implements `hitTest(model, view, point2D, options) → HitResult | null`. The dispatch shape mirrors render:

```javascript
const Canvas2DRenderer = {
  // ...

  HIT_TESTS: new Map([
    ['beam:ub',    hitTestLinearMember],
    ['beam:uc',    hitTestLinearMember],
    ['beam:shs',   hitTestLinearMember],
    // ...
    ['plate:*',    hitTestPlate],
    ['fastener:*', hitTestPointInstance],
    ['annotation:dimension', hitTestDimension],
    // ...
  ]),

  hitTest(model, view, point2D, options = {}) {
    // Reverse iteration (top-most first); spatially index if model is large
    const candidates = [...model.elements.values()].reverse();
    for (const elem of candidates) {
      if (options.categories && !options.categories.includes(elem.category)) continue;
      if (!isInView(elem, view)) continue;
      
      const key = `${elem.category}:${elem.family}`;
      const fn = this.HIT_TESTS.get(key) ?? this.HIT_TESTS.get(`${elem.category}:*`);
      if (!fn) continue;
      
      const result = fn(elem, view, point2D);
      if (result) return { element: elem, ...result };
    }
    return null;
  },
};

function hitTestAll(...) { /* returns the whole stack — like click-cycle-selection's v25HitTestAll */ }
```

The `hitTestAll` shape is the v2 generalisation of the pattern `click-cycle-selection/` introduced — every interactive renderer has it. Click-cycling, marquee, tab-cycle in 3D, all consume `hitTestAll`.

---

## 7. The "register one entry per renderer" workflow

Walking through the timber-screw renderer example to show what "ship 2D first, 3D coming soon" looks like in practice:

**Day 1 — ship the screw on the new architecture, 2D only.**

1. `catalogues/families/fastener-rothoblaas-hbs.js` — declared (already exists from the v2 catalogue work).
2. `render/canvas2d/draw-fastener-rothoblaas-hbs.js` — write `drawHBSScrew`. Register at `Canvas2DRenderer.RENDERERS.set('fastener:rothoblaas-hbs', drawHBSScrew)`.
3. `render/canvas2d/hit-test-fastener.js` — register a hit-test if not already covered by `fastener:*`.
4. `render/pdf/draw-fastener-rothoblaas-hbs.js` — write the jsPDF version (or share the primitive-based version).
5. `render/dxf/emit-fastener-rothoblaas-hbs.js` — DXF emission.

The user can now place HBS screws in any 2D paper view, in any model-level view (plan/section/elevation), with full AS 1100 rendering, full PDF export, full DXF export. The 3D iso view shows nothing for these screws because `ThreeJSRenderer.RENDERERS` has no entry.

**Day 2 (or month 3) — add 3D support.**

1. `render/threejs/build-mesh-fastener-rothoblaas-hbs.js` — write `buildMeshHBSScrew` (probably a small cylinder for the shaft + a polygon for the head). Register at `ThreeJSRenderer.RENDERERS.set('fastener:rothoblaas-hbs', buildMeshHBSScrew)`.

That's it. The screws now appear in the 3D iso view. No model changes. No tool changes. No catalogue changes. The UI grey-out in the 3D-mode tile (governed by `ThreeJSRenderer.RENDERERS.has('fastener:rothoblaas-hbs')`) becomes a non-grey clickable tile.

This is what you asked for at the start of this conversation: **add the screw once, and it works in both 2D and 3D — with 3D being optionally deferred.**

---

## 8. Performance considerations

This section is "what does the architecture do when the model has 5,000 elements?" — not a Phase 0 concern but worth tracking.

- **Spatial index** on the model. R-tree or grid keyed by BoundingBox3D. `query(model, predicate)` consults the index for spatial predicates. Linear scan otherwise. Build the index lazily on first spatial query; invalidate on writes.
- **Render cache per element per view.** For elements whose geometry hasn't changed and whose view hasn't changed, cache the rendered output (Path2D for Canvas2D; a `THREE.Mesh` for Three.js). Invalidation key is `(elementId, viewId, element.version, view.version)`.
- **Dirty-region rendering.** As described above — only re-render the affected rect.
- **Tile-based canvas2d rendering.** Future — split the canvas into tiles, render only dirty tiles.
- **Web Worker for export pipelines.** Future — PDF/DXF emission off the main thread.

None of this is required for a 200-element detail sheet. The architecture supports it; we add it when performance demands it.

---

## 9. File layout

```
js/v2/render/
├── render-context.js               — buildRenderContext(elem, model) → ctx
├── view-helpers.js                 — isInView, projectPoint, projectVector, projectPolygon
├── primitives/                     — backend-agnostic primitives
│   ├── line.js
│   ├── polyline.js
│   ├── polygon.js
│   ├── arc.js
│   ├── text.js
│   ├── hatch.js
│   └── index.js
│
├── canvas2d/
│   ├── index.js                    — Canvas2DRenderer module
│   ├── backend.js                  — Canvas2DBackend (line→ctx.lineTo etc.)
│   ├── draw-beam-ub.js
│   ├── draw-beam-uc.js
│   ├── draw-beam-pfc.js
│   ├── draw-beam-shs.js
│   ├── draw-beam-rhs.js
│   ├── draw-beam-chs.js
│   ├── draw-beam-ea.js
│   ├── draw-beam-ua.js
│   ├── draw-beam-wb.js
│   ├── draw-beam-timber.js
│   ├── draw-plate.js
│   ├── draw-fastener-as1252-bolt.js
│   ├── draw-fastener-rothoblaas-hbs.js
│   ├── draw-fastener-anchor.js
│   ├── draw-fastener-shear-stud.js
│   ├── draw-reinforcement-bar.js
│   ├── draw-reinforcement-mesh.js
│   ├── draw-masonry.js
│   ├── draw-concrete-region.js
│   ├── draw-annotation-dimension.js
│   ├── draw-annotation-leader.js
│   ├── draw-annotation-tag.js
│   ├── draw-annotation-section-mark.js
│   ├── draw-annotation-detail-callout.js
│   ├── draw-annotation-revision.js
│   ├── draw-sheet-titleblock.js
│   ├── draw-detail-breakline.js
│   ├── draw-detail-slot.js
│   ├── draw-detail-weld-symbol.js
│   ├── hit-test-linear.js
│   ├── hit-test-plate.js
│   ├── hit-test-point.js
│   ├── hit-test-annotation.js
│   └── selection-highlight.js
│
├── pdf/
│   ├── index.js                    — VectorRenderer module
│   ├── backend.js                  — JsPDFBackend
│   └── (selectively shared with canvas2d or specialised)
│
├── threejs/
│   ├── index.js                    — ThreeJSRenderer module
│   ├── engine.js                   — scene/camera/lights/orbit
│   ├── materials.js                — Three.js material library keyed by material id
│   ├── build-mesh-beam-ub.js
│   ├── build-mesh-beam-shs.js
│   ├── build-mesh-plate.js
│   ├── build-mesh-fastener-as1252-bolt.js
│   └── ...
│
├── dxf/
│   ├── index.js                    — DXFEmitter module
│   ├── backend.js                  — DXFBackend (LINE/POLYLINE/TEXT/CIRCLE emitters)
│   └── emit-*.js                   — per-category emitters
│
└── svg/                            — future
    └── ...
```

Several hundred files when fully populated — but each file is small, single-purpose, and changes infrequently. The dispatch tables in `canvas2d/index.js`, `threejs/index.js`, etc. are the single source of "what does this renderer know about?"

---

## 10. The relationship to v1 draw code

Most of the existing v1 draw functions translate to v2 with these mechanical changes:

| v1 pattern | v2 pattern |
|---|---|
| `function drawUB(obj, blk, cutClass) { obj.x ... obj.section ... }` | `function drawBeamUB(elem, ctx) { elem.geometry.start ... ctx.type.d ... }` |
| `ctx.lineWidth = 0.5` (hardcoded centreline) | `ctx.canvas2d.lineWidth = LINEWEIGHTS.thin * ppm()` |
| `LW.thick` from `03-data-bolts.js` global | `LINEWEIGHTS.thick` from catalogue, accessed via `ctx.lineweight.cut` |
| `withRotation(obj, blk, () => ...)` | `withRotation(elem.geometry.rotation, ctx, () => ...)` |
| `objects3D` reads | `model.elements.values()` with category filter |
| `entities2D[viewKey]` reads | `query(model, e => e.geometry.viewId === view.id)` |
| `requestRender()` calls | gone — model emits dirty events automatically |
| `obj.type === 'ub'` dispatch | `RENDERERS.get('beam:ub')` table dispatch |
| `getCutClass(obj, blk)` | `ctx.cutClass` (computed once in render-context.js) |

The translation is mechanical. Each v1 draw function gets a wrapper or rewrite as part of its migration phase. The drawing geometry stays — the I-section profile math is the same, the hexagonal bolt head math is the same, the AS 1101 weld symbol shapes are the same.
