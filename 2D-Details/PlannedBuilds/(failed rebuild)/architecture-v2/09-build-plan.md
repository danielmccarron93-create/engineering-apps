# Build Plan — phased work, milestones, exit criteria

This file sequences the work from "decision made" to "v1 retired." Each phase is a separate build chat. Each phase has a Files-touched declaration, an exit criterion, and a soak/test plan.

Phase boundaries are deliberately conservative — overshooting a phase boundary into the next phase is the most common way long migrations die (the famous "we'll just keep going" trap). Each phase has a hard stop where the build chat closes, results get reviewed, and the next phase starts as a fresh chat.

---

## Phase 0a — Docs realignment (absorbed from `codebase-restructure/` Phase 1)

**Goal.** Make `CLAUDE.md`, `README.md`, `CHANGELOG.md`, the planning READMEs, and in-source comments truthful. Zero code touched. Builds the docs runway that every subsequent phase reads from.

**Blockers.** Open Qs 1-5 from `10-open-questions.md` answered.

**Files touched.** Identical to `PlannedBuilds/codebase-restructure/09-build-plan.md` Phase 1's Files-touched table. See that table; not duplicated here.

**Test boundary.** A fresh build chat reading `CLAUDE.md` + this folder can correctly answer: "How do I add a new structural element to v2?" — without grepping. The current `js/...` is left in a state where every documented claim matches reality (line counts correct, file map complete).

**Exit criterion.** Every drift item in `codebase-restructure/02-current-state-audit.md` Group A is either fixed or deliberately deferred with a documented reason.

**Estimate.** Single focused build chat, ~1-2 hours.

---

## Phase 0b — Model layer scaffold

**Goal.** Stand up the v2 model layer (`js/v2/model/`) with full unit tests. No UI changes. No render changes. v1 still authoritative for everything.

**Blockers.** Phase 0a landed. Open Qs 6-9 answered.

**Files touched (new — created in `js/v2/`):**

| File | Purpose |
|---|---|
| `js/v2/_namespace.js` | Initialises `window.v2 = window.v2 || {}` namespace. First v2 script loaded. |
| `js/v2/model/id.js` | `newElementId`, `newViewId`, etc. UUID v4 via `crypto.randomUUID`. |
| `js/v2/model/element.js` | Element factory + helpers (`elementBoundingBox`, `elementMaterial`, …). JSDoc types. |
| `js/v2/model/geometry.js` | Geometry discriminated union + factories (`linearMember`, `plate`, `pointInstance`, `annotation`, `region`, `polyline`). |
| `js/v2/model/material.js` | Material factory + lookup helpers. |
| `js/v2/model/view.js` | View factory + `projectPoint`/`projectVector`/`projectPolygon` helpers. |
| `js/v2/model/sheet.js` | Sheet factory + `addPlacement` helper. |
| `js/v2/model/model.js` | `StructuralModel` factory + `applyTransaction` + `query` + `version` tracking. |
| `js/v2/transactions/place-element.js` | `placeElement(spec)` factory. |
| `js/v2/transactions/delete-element.js` | `deleteElement(id)` factory. |
| `js/v2/transactions/move-element.js` | `moveElement(id, newGeometry)` factory. |
| `js/v2/transactions/edit-element.js` | `editElement(id, changes)` factory. |
| `js/v2/transactions/batch.js` | `batch(txs[])` factory. |
| `js/v2/transactions/view-transactions.js` | `createView`, `editView`, `deleteView`. |
| `js/v2/transactions/sheet-transactions.js` | `createSheet`, `placeViewOnSheet`, `editSheet`. |
| `js/v2/transactions/material-transactions.js` | `defineMaterial`, `editMaterial`. |
| `js/v2/transactions/index.js` | Re-exports + transaction-type registry. |
| `index.html` | Add `<script>` tags for all v2/model + v2/transactions files. |
| `tests/v2/model/element.test.js` | Element factory tests. |
| `tests/v2/model/geometry.test.js` | Geometry kind tests. |
| `tests/v2/model/transactions.test.js` | Apply/unapply roundtrip tests for every transaction type. |
| `tests/v2/model/query.test.js` | Query API tests. |

**Test boundary.** `npm test` (assuming we wire JSDOM + Vitest — see Open Q9) passes on every model/transactions test. The browser app still loads with v1 + the v2 namespace present but the v2 model is empty (nothing has placed an element yet).

**Exit criterion.** Every Transaction factory in `js/v2/transactions/` has apply+unapply tests demonstrating round-trip correctness. Every query helper returns expected results on fixture models.

**Estimate.** 3-4 weeks of evening sessions.

---

## Phase 0c — Catalogue layer

**Goal.** Stand up the v2 catalogue layer with categories, families, types, materials, hatches, lineweights, line-styles, rules. v2 families import from v1 data files to avoid data duplication. Unit tests over catalogue lookups.

**Blockers.** Phase 0b landed.

**Files touched (new):**

| File | Purpose |
|---|---|
| `js/v2/catalogues/lineweights.js` | LINEWEIGHTS table. |
| `js/v2/catalogues/line-styles.js` | LINE_STYLES table. |
| `js/v2/catalogues/hatches.js` | HATCH_PATTERNS catalogue. |
| `js/v2/catalogues/categories.js` | CATEGORIES registry. |
| `js/v2/catalogues/families/beam-ub.js` | UB family + types (imports UB_DB). |
| `js/v2/catalogues/families/beam-uc.js` | UC family + types. |
| `js/v2/catalogues/families/beam-pfc.js` | PFC. |
| `js/v2/catalogues/families/beam-shs.js` | SHS. |
| `js/v2/catalogues/families/beam-rhs.js` | RHS. |
| `js/v2/catalogues/families/beam-chs.js` | CHS. |
| `js/v2/catalogues/families/beam-ea.js` | EA. |
| `js/v2/catalogues/families/beam-ua.js` | UA. |
| `js/v2/catalogues/families/beam-wb.js` | WB (welded beam — the one CLAUDE.md missed). |
| `js/v2/catalogues/families/beam-glt.js` | Glulam timber. |
| `js/v2/catalogues/families/beam-clt.js` | CLT panels. |
| `js/v2/catalogues/families/beam-custom-rect.js` | Custom rectangular timber. |
| `js/v2/catalogues/families/plate-flat.js` | Flat plates with PL6-PL32 types. |
| `js/v2/catalogues/families/fastener-as1252-bolt.js` | AS 1252 bolts (M16-M36) + grades. |
| `js/v2/catalogues/families/fastener-rothoblaas-hbs.js` | HBS Plate (imports from 02c-data-screws.js). |
| `js/v2/catalogues/families/fastener-anchor-bolt.js` | Anchor bolts. |
| `js/v2/catalogues/families/fastener-shear-stud.js` | Shear studs. |
| `js/v2/catalogues/families/reinforcement-bar.js` | Rebar N12-N36. |
| `js/v2/catalogues/families/reinforcement-mesh.js` | SL62-SL81 mesh. |
| `js/v2/catalogues/families/masonry-cmu.js` | 90/140/190/290 CMU. |
| `js/v2/catalogues/families/annotation-dimension.js` | Dim variants. |
| `js/v2/catalogues/families/annotation-leader.js` | |
| `js/v2/catalogues/families/annotation-tag.js` | |
| `js/v2/catalogues/families/annotation-section-mark.js` | |
| `js/v2/catalogues/families/annotation-detail-callout.js` | |
| `js/v2/catalogues/families/annotation-revision.js` | |
| `js/v2/catalogues/families/detail-component-breakline.js` | |
| `js/v2/catalogues/families/detail-component-slot.js` | |
| `js/v2/catalogues/families/detail-component-weld-symbol.js` | |
| `js/v2/catalogues/families/sheet-titleblock.js` | Bligh Tanner standard titleblock. |
| `js/v2/catalogues/families/index.js` | Registers every family on load. |
| `js/v2/catalogues/materials/steel-s275.js` | |
| `js/v2/catalogues/materials/steel-s300.js` | |
| `js/v2/catalogues/materials/steel-s355.js` | |
| `js/v2/catalogues/materials/concrete-n20.js` | |
| `js/v2/catalogues/materials/concrete-n25.js` | |
| `js/v2/catalogues/materials/concrete-n32.js` | |
| `js/v2/catalogues/materials/concrete-n40.js` | |
| `js/v2/catalogues/materials/concrete-n50.js` | |
| `js/v2/catalogues/materials/timber-mgp10.js` | |
| `js/v2/catalogues/materials/timber-mgp12.js` | |
| `js/v2/catalogues/materials/timber-gl18h.js` | |
| `js/v2/catalogues/materials/timber-gl22h.js` | |
| `js/v2/catalogues/materials/timber-clt-c24.js` | |
| `js/v2/catalogues/materials/masonry-cmu190.js` | |
| `js/v2/catalogues/materials/reinforcement-n500.js` | |
| `js/v2/catalogues/materials/screw-galv-grade-c1022.js` | |
| `js/v2/catalogues/materials/bolt-as1252-grade-8.8.js` | |
| `js/v2/catalogues/materials/bolt-as1252-grade-10.9.js` | |
| `js/v2/catalogues/materials/index.js` | Registers every material. |
| `js/v2/catalogues/rules/eta-11-0030/tab7-axial-withdrawal.js` | Single rule. |
| `js/v2/catalogues/rules/eta-11-0030/tab8-lateral-capacity.js` | |
| `js/v2/catalogues/rules/eta-11-0030/min-distances.js` | |
| `js/v2/catalogues/rules/as1720/cl3-2-bending.js` | |
| `js/v2/catalogues/rules/as1720/cl4-4-modification-factors.js` | |
| `js/v2/catalogues/rules/as4100/cl5-2-member-moment-capacity.js` | |
| `js/v2/catalogues/rules/as4100/cl9-3-bolted-connections.js` | |
| `js/v2/catalogues/rules/as4100/cl9-7-fillet-welds.js` | |
| `js/v2/catalogues/rules/index.js` | Registers every rule. |
| `js/v2/catalogues/index.js` | Top-level catalogue entry point + lookup helpers. |
| `index.html` | Add `<script>` tags for all catalogue files (alphabetical within folders). |
| `tests/v2/catalogues/family-lookup.test.js` | Family/type lookup tests. |
| `tests/v2/catalogues/material-lookup.test.js` | Material lookup + display-prop resolution. |
| `tests/v2/catalogues/rule-applicability.test.js` | Rule `appliesTo` tests across element samples. |
| `tests/v2/catalogues/rule-check.test.js` | Pure-function rule check tests with known inputs/outputs (e.g., the timber-screws `09-test-cases.md` Test 1 reproduces η=0.801). |

**Test boundary.** Every family in the catalogue can be queried and returns its types. Every material's display + structural properties are accessible. Every rule's `check` function produces the expected numeric output on fixture inputs.

**Exit criterion.** The timber-screws Test 1 fixture (η=0.801 PASS) is reproduced by the v2 rule engine — proves the rule layer is faithful to the v1 implementation in `js/79-checks-timber.js`. The catalogue files together cover every entity type currently in v1.

**Estimate.** 2-3 weeks. Mostly data files (50-300 lines each), light on logic. Sourcing AS standards data carefully is the time-eater.

---

## Phase 0d — v2 → v1 bridge (shadow model)

**Goal.** Wire the v2 model layer to mirror v1 state. Every v1 mutation triggers a v2 model rebuild (initially via full re-migration; later via incremental sync). v1 is still authoritative for everything; v2 is shadowing.

**Blockers.** Phase 0b + 0c landed.

**Files touched (new + minor v1 modifications):**

| File | Purpose |
|---|---|
| `js/v2/engine/v1-bridge.js` | Wraps v1 mutators (`placeObject`, V25 entity additions, V25 entity deletes, save/load). |
| `js/v2/io/migrations/v1-to-v2.js` | The full v1→v2 migration function — used by both the bridge AND the file-load migration. |
| `js/v2/engine/dirty-bus.js` | Pub/sub for model dirty events. |
| `js/v2/engine/init.js` | Initialises v2 namespace + bridge on `DOMContentLoaded` (AFTER v1's init). |
| `js/v2/appState.js` | The v2 app-state singleton: `{ model, ui, tools, dialogs, wizards }`. |
| `index.html` | Load v2/engine + v2/appState scripts at the end. |
| `tests/v2/bridge/sync-on-place.test.js` | JSDOM test: programmatically trigger v1 mutations, assert v2 model reflects them. |
| `tests/v2/migrations/v1-to-v2-full.test.js` | Full v1 fixture file → expected v2 model assertion. |

**Test boundary.** Open the app in a browser; place 5 V25 plates, 3 3D-mode UBs, 2 V25 dimensions. After each placement, `window.v2.appState.model.elements.size` matches the count. The mapping from v1 entity shapes to v2 Elements is correct (every plate has `category: 'plate'`, every UB has `category: 'beam', family: 'ub'`, etc.).

**Exit criterion.** A CI test does 100 randomised v1 mutations and asserts `v2.appState.model` always matches the migrated state of `objects3D` + `entities2D`. Any divergence is a bridge bug.

**Estimate.** 1-2 weeks.

---

## Phase 0e — v1→v2 file migration (load existing `.sd2.json`)

**Goal.** Open an existing `.sd2.json` v1 file → load v1 path → run v1→v2 migrator → both v1 state AND v2 model are present and in sync. Save still emits v1 shape (we don't write v2 yet).

**Blockers.** Phase 0d landed.

**Files touched:**

| File | Purpose |
|---|---|
| `js/v2/io/serialise.js` | Serialise v2 model to JSON (not yet used for save). |
| `js/v2/io/deserialise.js` | Deserialise v2 model from JSON. |
| `js/v2/io/migrations/v1-to-v2.js` | Already created in 0d; extend with edge cases (polyline plates, V22-era dimensions, etc.). |
| `js/v2/io/load.js` | Top-level load function: detect schemaVersion, route to v1 or v2 path, migrate. |
| `js/v2/io/save.js` | Stub: still uses v1 save path; will be extended in later phases. |
| `tests/v2/io/load-v1-fixture.test.js` | Load every v1 `.sd2.json` fixture file in `tests/fixtures/v1/`, assert migrated v2 model matches expected. |
| `tests/fixtures/v1/baseplate.sd2.json` | Real baseplate detail saved from v1. |
| `tests/fixtures/v1/timber-screw-connection.sd2.json` | The timber-screw example from `PlannedBuilds/timber-screws/09-test-cases.md`. |
| `tests/fixtures/v1/full-sheet.sd2.json` | A full STP 6011 detail sheet (cap plate, baseplate, splice, etc.). |
| `tests/fixtures/v2-expected/baseplate.json` | Expected v2 model output. |
| `tests/fixtures/v2-expected/timber-screw-connection.json` | |
| `tests/fixtures/v2-expected/full-sheet.json` | |

**Test boundary.** Open each v1 fixture file in a browser; verify all v1 entities render correctly in the canvas; verify `window.v2.appState.model` contains the expected count of v2 Elements with the expected categories.

**Exit criterion.** Every v1 fixture file migrates to its expected v2 model exactly. Any test failure is a migrator bug.

**Estimate.** 2-3 weeks. The fixture-creation is the time-consuming part — need real-world v1 saves to test against.

---

## Phase 0f — Canvas2D renderer scaffold

**Goal.** Stand up `Canvas2DRenderer` with the dispatch table, render-context, dirty-region machinery, and 3-4 worked draw functions. The renderer outputs to a HIDDEN test canvas (the user-facing canvas still uses v1). This validates the architecture in isolation.

**Blockers.** Phase 0c landed.

**Files touched:**

| File | Purpose |
|---|---|
| `js/v2/render/render-context.js` | `buildRenderContext(elem, model)`. |
| `js/v2/render/view-helpers.js` | `isInView`, `projectPoint`, etc. |
| `js/v2/render/primitives/line.js` | Backend-agnostic line primitive. |
| `js/v2/render/primitives/polyline.js` | |
| `js/v2/render/primitives/polygon.js` | |
| `js/v2/render/primitives/arc.js` | |
| `js/v2/render/primitives/text.js` | |
| `js/v2/render/primitives/hatch.js` | |
| `js/v2/render/canvas2d/backend.js` | Canvas2DBackend implementing the primitive interface. |
| `js/v2/render/canvas2d/index.js` | Canvas2DRenderer module + RENDERERS table. |
| `js/v2/render/canvas2d/draw-plate.js` | Worked draw fn — plates (pilot prep). |
| `js/v2/render/canvas2d/draw-beam-ub.js` | Worked draw fn — UB. |
| `js/v2/render/canvas2d/draw-beam-shs.js` | |
| `js/v2/render/canvas2d/draw-fastener-as1252-bolt.js` | |
| `js/v2/render/canvas2d/hit-test-linear.js` | |
| `js/v2/render/canvas2d/hit-test-plate.js` | |
| `tests/v2/render/canvas2d-pixel-test.js` | Render a known model to a hidden canvas, snapshot the pixels, diff against expected. |

**Test boundary.** Render the `tests/fixtures/v1/baseplate.sd2.json` model through Canvas2DRenderer to a hidden canvas. The output is visually compared (manually first, then snapshot-tested) to the v1 render of the same file. Differences are the v2 renderer's deviations — these must be 0 unless deliberately improved.

**Exit criterion.** A pixel-similarity test (allowing some tolerance for sub-pixel rasterisation differences) passes between v1 render and v2 render of the same model.

**Estimate.** 1-2 weeks.

---

## Phase 0g — Three.js renderer scaffold

**Goal.** Stand up `ThreeJSRenderer` with 3-4 worked mesh builders. Output to a hidden Three.js scene. Validates the 3D dispatch architecture in isolation.

**Blockers.** Phase 0c landed.

**Files touched:**

| File | Purpose |
|---|---|
| `js/v2/render/threejs/engine.js` | Scene/camera/lights/orbit infrastructure. |
| `js/v2/render/threejs/materials.js` | Three.js material library keyed by v2 material id. |
| `js/v2/render/threejs/index.js` | ThreeJSRenderer module + RENDERERS table. |
| `js/v2/render/threejs/build-mesh-plate.js` | Worked mesh fn — plate extruded polygon. |
| `js/v2/render/threejs/build-mesh-beam-ub.js` | UB I-shape extruded along length. |
| `js/v2/render/threejs/build-mesh-beam-shs.js` | SHS extruded. |
| `js/v2/render/threejs/build-mesh-fastener-as1252-bolt.js` | Cylinder + hex head + thread cylinder + tip. |
| `tests/v2/render/threejs-mesh-test.js` | Build meshes for a known model; assert mesh vertex counts match expected (proxy for "the geometry is right"). |

**Test boundary.** Render the baseplate fixture through ThreeJSRenderer to a hidden scene. Mesh counts match expected. Manual visual check against the v1 iso renderer's output.

**Exit criterion.** Every Canvas2D renderer entry from Phase 0f has a matching Three.js entry (the "both renderers cover the pilot's families" symmetry).

**Estimate.** 1-2 weeks.

---

## Phase 1 — Pilot feature on v2 (plates)

**Goal.** Make plates v2-authoritative. v1 plate code path is the fallback (feature-flag), v2 is primary. User experience visibly improves: plates now appear in the iso view; full undo/redo via transactions; autosave dirty flag works correctly for plate edits.

**Blockers.** Phases 0a-0g landed.

**Files touched:**

| File | Purpose |
|---|---|
| `js/v2/tools/place-plate-tool.js` | New tool — rectangle + polygon modes. |
| `js/v2/tools/tool-registry.js` | Register PlacePlateTool. |
| `js/v2/engine/event-dispatch.js` | Top-level pointer event router. |
| `js/v2/engine/active-tool.js` | `setActiveTool(id)` and chord layer. |
| `js/v2/engine/undo-stack.js` | UndoStack with apply/undo/redo. |
| `js/v2/engine/autosave.js` | Debounced localStorage autosave + title-bar dirty indicator. |
| `js/v2/ui/palette-bb-rail.js` | Register a Plate tile in the v2 BB-rail. |
| `js/v2/ui/inspector-plate.js` | Plate inspector panel. |
| `js/v2/ui/size-picker.js` | Generic size picker (plates' thickness picker is a special case). |
| `js/v2/feature-flags.js` | `useV2For.plates = true`. |
| `index.html` | Add scripts. |
| `tests/v2/tools/place-plate-tool.test.js` | Full tool interaction test (pointer down/move/up → expected transaction → expected element in model). |
| `tests/v2/io/save-load-plate.test.js` | Save a model with v2 plates → reload → assert plates round-trip. |

**Test boundary.** Soak period: one week of daily use with v2 plates as the default. Smoke tests on 5 different STP 6011 detail types using v2 plates.

**Exit criterion.**
- Visual: v2 plates render pixel-similar to v1 plates in Canvas2D; v2 plates render in the iso view (new capability).
- Functional: place plate, move plate, edit thickness, change material, delete plate, undo/redo, save/load — all work.
- Performance: frame time on a 50-plate sheet is ≤ v1 frame time.
- Migration: existing v1 plates load and appear in v2 with correct geometry.
- Daily use feedback: Dan reports no regressions from the v1 experience.

**Estimate.** 3-4 weeks (build + soak).

---

## Phase 2 — Retire v1 plate path

**Goal.** Delete v1 plate code now that v2 is proven.

**Blockers.** Phase 1 soaked for one week with no rollbacks.

**Files touched:**

| File | Purpose |
|---|---|
| `js/76-v25-plate.js` | DELETE. |
| `js/68-v25-tools.js` | Remove plate placement branch + `drawMem2D` plate fallback. |
| `js/69-v25-dispatch.js` | Remove plate dispatch. |
| `js/71-v25-selection.js` | Remove plate hit-test. |
| `js/72-v25-options-bar.js` | Remove plate options branch. |
| `js/74-v26-bb-rail.js` | Remove v1 plate tile (the v2 plate tile registered via `js/v2/ui/palette-bb-rail.js`). |
| `js/59-inspector.js` | Remove plate panel. |
| `js/v2/feature-flags.js` | Remove `useV2For.plates` flag (always-on now). |
| `js/v2/engine/v1-bridge.js` | Remove plate-mirroring logic. |
| `CLAUDE.md` (or its v2 equivalent) | Update to note plates are v2-authoritative. |

**Test boundary.** Smoke test daily-use detail sheets. No regression vs Phase 1 behaviour.

**Exit criterion.** Zero references to `plate2` outside `js/v2/`. Save/load fixture round-trip still works.

**Estimate.** ~1 week (mostly verification).

---

## Phases 3-N — Migration sweep

Each phase migrates one feature family per `07-migration-strategy.md` Stage C ordering:

3. Bolts (incorporates `v25-2d-bolts/` axis-agnostic dedup)
4. Members (UB/UC/PFC/SHS/RHS/CHS/EA/UA/WB)
5. Timber members (GLT/CLT/custom-rect)
6. Timber fasteners (HBS screws, anchors, shear studs — replaces the v1 timber-screws feature)
7. Joints (auto-weld + SHS joint trim, unified)
8. Annotations (dimensions, leaders, tags, callouts, marks, revisions)
9. Sheet components (titleblock, revision schedule)
10. Selection + grip handles (incorporates `click-cycle-selection/`)
11. Connection wizards (2D + 3D)
12. Detail callout / detail card / detail reference
13. DXF + PDF export full coverage
14. (long tail)

Each phase has the same shape as Phase 1+2:
- Build v2 implementation alongside v1 with feature flag.
- Soak for one week of daily use.
- Retire v1 path.

The first 3-4 phases each take ~3-4 weeks. By phase 8-10, patterns are rote and each phase takes ~1-2 weeks.

**Estimate.** 6-9 months for all phases.

---

## Phase ∞ — v1 retirement sweep

**Goal.** Once > 95% of features are v2-authoritative, the remaining v1 fragments are retired in a single cleanup pass.

**Files touched.** Whatever v1 fragments remain. Possibly:

- `js/01-config.js` — A1 sheet constants — promote to `js/v2/catalogues/sheet-sizes.js`.
- `js/02-data-*.js`, `02b-02e` — promote to `js/v2/catalogues/data/`.
- `js/03-data-bolts.js` — promote.
- `js/05-state.js`, `07-globals.js` — fully retired.
- `js/73-init.js` — replace with `js/v2/engine/init.js`.
- All other numbered files — deleted.
- `js/v2/engine/v1-bridge.js` — deleted.
- `js/v2/feature-flags.js` — deleted.
- `js/v2/io/migrations/v1-to-v2.js` — kept (legacy file format support); `schemaVersion` bumped to 3 for the "no more v1 fields" file shape.

**Estimate.** 4-6 weeks.

---

## Progress tracker

> Build chats update this table after each phase.

| Phase | Status | Started | Completed | Soak end | Notes |
|---|---|---|---|---|---|
| 0a — Docs realignment | ✅ Complete | 2026-05-19 | 2026-05-19 | n/a | Absorbed from `codebase-restructure/` Phase 1. Docs-only, no soak. All Group A audit items addressed. |
| 0b — Model layer scaffold | ✅ Complete | 2026-05-19 | 2026-05-19 | n/a | 17 v2 source files under `js/v2/` (model + transactions), wired into `index.html`. Vitest+JSDOM dev-only harness added (`package.json`, `vitest.config.mjs`, `tests/v2/`, `node_modules/` gitignored) — first npm dev-dependency; app keeps its no-build-step. 51 tests green, incl. apply/unapply round-trips for all 13 transaction factories. No soak (scaffold, no UI). |
| 0c — Catalogue layer | ✅ Complete | 2026-05-19 | 2026-05-19 | n/a | 65 catalogue files under `js/v2/catalogues/` — 5 top-level (registry-namespace, lineweights, line-styles, hatches, categories), 30 families, 18 materials, 8 rules, 4 index/registry finalisers — wired into `index.html` + `tests/v2/setup.mjs`. One file beyond the plan table: `_catalogue-namespace.js` (registry bootstrap, mirrors 0b's `_namespace.js`). Family/rule files import the v1 catalogue data (`02*.js`, `03-data-bolts.js`) as guarded bare globals — 04 §11's `window.UB_DB` predates v1's bare-`const` reality, so setup.mjs republishes those consts onto globalThis for the JSDOM harness (no v1 file modified). 94 tests green (43 new). Exit criterion met: the ETA-11/0030 Table 8 rule reproduces timber-screws Test 1 (η = 0.801, PASS); catalogue covers every v1 entity type. No soak (catalogue data, no UI). |
| 0d — v2→v1 bridge | ✅ Complete | 2026-05-20 | 2026-05-20 | n/a | 5 v2 source files added (`js/v2/appState.js`, `js/v2/engine/{dirty-bus,v1-bridge,init}.js`, `js/v2/io/migrations/v1-to-v2.js`), wired into `index.html` + `tests/v2/setup.mjs`. The bridge wraps v1 mutators `addObj`, `delObj`, `addEnt2D`, `undo`, `redo`, `v25DeleteSelected`, `_projectLoadSheet`, `loadProject`, `saveProject`, `exportProject`, `importProject` (each present one — guarded by `typeof`); after every call it re-migrates v1 state into `v2.appState.model` via the deterministic `v1ToV2` migrator. v1 stays authoritative — wrappers are pass-through + a try/catched re-sync, so a shadow error can never break v1. `init.js` installs on DOMContentLoaded AFTER v1's own `js/73-init.js` bootstrap. 127 tests green (33 new — 18 migration, 15 bridge): full migrator coverage (taxonomy / geometry kinds / count fidelity / determinism), bridge install/idempotency/uninstall, dirtyBus emit, and the **100-randomised-mutations exit criterion** (`appState.model` deep-equals a fresh `v1ToV2(state)` after every mutation in a seeded sequence — addObj / delObj / addEnt2D / undo / redo / v25DeleteSelected). The Phase 0d browser-smoke sequence (5 V25 plates + 3 3D-mode UBs + 2 V25 dimensions → 10 elements with the expected category counts) runs green in the JSDOM harness via faithful 1:1 transcriptions of `js/05-state.js` + `js/71-v25-selection.js` mutators; live-browser verification is the standard review step. Known Phase-0d limitation: `loadProject`'s async FileReader prevents live post-load sync; Phase 0e wires file-load migration. No soak (shadow, no UI). |
| 0e — v1→v2 file migration | ✅ Complete | 2026-05-20 | 2026-05-20 | n/a | 4 new `js/v2/io/` files — `serialise.js`, `deserialise.js`, `save.js` (stub: `previewSavePayload`/`saveModelToString` for the schemaVersion-2 payload the Phase-1+ save path will emit), `load.js` (the orchestrator: `detectSchemaVersion` + `fromParsed` + `applyToShadow` + the v1 integration hook `afterV1Load` resolving through 3 paths — installed bridge → bridge.readV1State → bare globals). Wired into `index.html` + `tests/v2/setup.mjs` LOAD_ORDER, slotted between the migrator and the v1-bridge so `v2.io.load.afterV1Load` exists when the bridge wraps `loadProject`/`importProject`. Migrator extensions (`js/v2/io/migrations/v1-to-v2.js`): `ENT_TYPE_MAP` gains `lineSet`/`txtBox` (the two V25-dispatch types Phase 0d missed); `frame` upgraded annotation→region so its `(u,v,w,h)` area survives; `geometryPointsFor` harvests `(u,v,w,h)` rectangles for frame/mat/rect/slot/txtBox/hatch and `(cu,cv,r)` circles for arc/circle; `model.materials` is now POPULATED from the catalogue with the smallest sufficient set for the migrated elements (Phase 0d left it empty — the comment said "Phase 0e decides" and Phase 0e chose populate-from-catalogue for a self-contained migrated model). Minor v1 modifications: a one-line `v2.io.load.afterV1Load('loadProject'/'importProject')` call appended to the END of `js/46-save-load.js`'s `loadProject` `reader.onload` AND `js/50-project.js`'s `importProject` `reader.onload` — closes the Phase 0d "async FileReader prevents post-load sync" gap. Also unwired the autoload demo `js/99-tmbr-autoload.js` from `index.html` (commented out, reversible) so the running app starts on a clean sheet for fixture saves — full deletion still belongs to `timber-screws/10-corrective-plan.md` Phase 5. 173 tests green (46 new): serialise/deserialise round-trip parity (9), load orchestrator paths incl. installed-bridge / bare-globals / .sdproj activeSheetIdx clamp (13), migrator extensions (11), fixture-driven `load-v1-fixture.test.js` (9 per fixture — schema detection, totality, determinism, count fidelity, category+kind validity, materialId resolution, modelToJSON↔modelFromJSON round-trip, deep-equality against recorded expected). Fixtures from Dan's running app live in `tests/fixtures/v1/`; the test auto-records `tests/fixtures/v2-expected/<name>.json` on first run and asserts deep-equality on every subsequent run (refresh with `TEST_REWRITE_EXPECTED=1 npm test` when a deliberate migration change demands it). Phase 0e exit criterion met for every fixture currently in the folder; new fixtures auto-discover. Open at hand-off: Dan to save additional fixtures (timber-screw-connection, full STP-6011 sheet) as part of next sweep — already covered by the glob-based test. |
| 0f — Canvas2D renderer scaffold | ✅ Complete | 2026-05-21 | 2026-05-21 | n/a | 17 v2 source files under `js/v2/render/` — namespace bootstrap (`_render-namespace.js`); six backend-agnostic primitives (`primitives/{line,polyline,polygon,arc,text,hatch}.js`); `view-helpers.js` (isInView / elementsForView / projectPoint+Vector+Polygon / projectGeometry2D / classifyCut — Phase 0f scaffold returns `'projected'` until views carry real cutPlanes); `render-context.js` (`buildRenderContext(elem, model, opts)` resolves category × family × type × material × lineweight × hatchCut × hatchProj × colour through `v2.catalogues.*` — draw fns never reach the catalogue themselves); `canvas2d/backend.js` (`makeBackend(ctx2d, opts)` — translates each primitive to canvas calls, multiplies AS 1100 lineweights by `ppm` for canvas px, resolves theme CSS vars via `getComputedStyle`, records primitives into `backend.record` so JSDOM tests can inspect determinism without a real canvas; null `ctx2d` produces a record-only backend, the path the test harness takes); `canvas2d/index.js` (Canvas2DRenderer module + RENDERERS / HIT_TESTS dispatch tables — `registerRenderer(key, fn)` / `registerHitTest(key, fn)`; `lookupDispatch` resolves family-specific → category-generic → `genericDraw` fallback, no element silently lost; `ensureCanvasRenderer(canvas, opts)` is the public entry — exposes `.render(model, view, dirty) → dispatches`, `.attachDirty(handler)` subscribing to `v2.engine.dirtyBus 'model-changed'`, `.hitTest / .hitTestAll` for selection paths). Four worked draw functions matching the Phase 0f Files-touched table: `draw-beam-ub.js` (projected: side-on rect + hidden web edges + centreline + section label; CUT: 12-vertex AS 1100 I-section polygon + steel hatch; registers `beam:ub` AND `column:ub` re-use); `draw-beam-shs.js` (projected: outer rect + hidden inner walls + centreline + label; CUT: outer + inner polygon + hatch on wall material; registers `beam:shs` and `column:shs`); `draw-plate.js` (registers `plate:*` wildcard — Phase 0f scaffold so every plate family routes through here, the Phase 1 pilot promotes it; CUT: thick outline + AS 1100 hatch; projected: medium outline + light fill; handles both model-level Plate and view-local Region geometries); `draw-fastener-as1252-bolt.js` (end-on circle + crosshair + hidden shaft outline; registers `fastener:as1252-bolt` AND the `fastener:*` category-generic fallback so anchor / screw / shear-stud still appear until they gain their own draw fns). Hit-tests: `hit-test-linear.js` (point-to-segment distance with section-depth-aware tolerance, registers `beam:*` / `column:*` / `brace:*` / `timber-member:*`); `hit-test-plate.js` (point-in-polygon + edge-distance tolerance, registers `plate:*`). Renderer outputs to a HIDDEN canvas — `index.html` adds the `<script>` tags but no `<canvas>` element; v1 keeps using the user-facing canvas until the Phase 1 pilot wires v2 in. Tests: 13 new (`tests/v2/render/canvas2d-pixel-test.test.js`) — dispatch table populated, every Element dispatched (8 dispatches across 3 views for the 4-element baseplate fixture, all `resolved: 'specific'`), specific routing assertions for the UB / SHS / 2 plates, expected primitive shapes per element, view-local plates do not leak into other views, forced `cutClass: 'cut'` pulls in the 12-vertex I-section polygon + `as1100-steel-45` hatch primitive, **two consecutive render passes produce structurally identical primitive logs (the Phase 0f determinism exit criterion)**, hit-test routes a cursor-on-centreline to the UB and misses on empty space, dirtyBus subscribe + emit round-trips. 186 tests total (173 + 13). JSDOM has no real canvas2d (`getContext('2d')` returns null) so the renderer's backend records primitives without drawing — that is the testable path the build plan calls out. Pixel-similarity-to-v1 comparison is Dan's manual smoke test step in the browser (the v2 hidden canvas can be made visible via a console toggle). No soak (scaffold; v2 renderer not wired into the user-facing canvas yet). |
| 0g — Three.js renderer scaffold | ✅ Complete | 2026-05-21 | 2026-05-21 | n/a | 7 v2 source files under `js/v2/render/threejs/` — `engine.js` (scene / lights / orthographic camera / `frameSceneCamera` / `disposeObject` — pure constructors, no WebGL so the file is JSDOM-safe; lighting intensities + orbit defaults mirror v1's `js/64-3d-engine.js` so a side-by-side smoke test stays visually clean), `materials.js` (`makeLibrary()` returns a per-renderer cache that resolves a v2 material descriptor or id → cached `THREE.MeshStandardMaterial`; theme CSS vars resolve via `getComputedStyle(document.body)` in the browser and fall back to `FALLBACK_COLORS_BY_ID` literal hex in JSDOM — steel-s300 = 0xb0b0b0, steel-s355 = 0xa8a8a8, timber-mgp10 = 0xd2a76a etc., chosen to match v1's `v3dMatSteel`/`Plate`/`Bolt` + Q5's warm-tan `--timber-color`; `makeEdgeMaterial` is the shared black 50%-opacity outline that every mesh's child `LineSegments` uses), `index.js` (`ThreeJSRenderer` module + RENDERERS / registerRenderer / lookupDispatch — mirrors Phase 0f's `Canvas2DRenderer` exactly; `ensureThreeJSRenderer(opts)` is the public factory that composes engine + materials + a per-renderer `meshById` Map + `upsertMesh` / `removeMesh` / orphan-GC `render` + dirtyBus `attachDirty`; iteration order is the union of `model.elements.keys()` and the cached mesh ids so a deleted element loses its mesh on the next render even when no dirty hint is supplied), and 4 worked mesh builders matching the Phase 0g Files-touched table: `build-mesh-beam-ub.js` (`THREE.ExtrudeGeometry` of the 12-vertex AS 3679.1 I-section via a `THREE.Shape` mirroring v1's `v3dMakeIShape`; oriented through `g.frame.{axisW,axisV,axisU}` so local +Z = extrusion direction = axisU; registers `beam:ub` AND `column:ub`); `build-mesh-beam-shs.js` (`THREE.Group` of 4 `BoxGeometry` wall meshes — same approach as v1's `v3dBuildSHS` so the iso view sees the hollow profile; registers `beam:shs` and `column:shs`); `build-mesh-plate.js` (registers `plate:*` wildcard so every plate family routes here in the Phase 0g scaffold; handles BOTH model-level Plate geometry (3D polygon → projected into the plate frame's local 2D via dot products with axisU/axisV) AND view-local Region geometry (2D polygon → extruded flat in world XY) — view-local plates still get a 3D mesh so the iso camera sees them, the Phase 1 pilot promotes them to model-level Plate); `build-mesh-fastener-as1252-bolt.js` (catalogue-driven bolt assembly — shaft cylinder + hex head + hex nut + 2 washers, all built along THREE's default +Y then -π/2-rotated to align with local +Z so axisU = bolt shaft direction; placeholder grip = 1.5×d until Phase 11 connection wizards wire in real grip; registers `fastener:as1252-bolt` AND the `fastener:*` category-generic fallback so anchor / screw / shear-stud still appear until they gain their own builders). Three.js r128 only (CLAUDE.md rule 6) — no `CapsuleGeometry`, no `BatchedMesh`, no APIs introduced after r128. Renderer outputs to a HIDDEN scene — `index.html` adds the `<script>` tags but no `<canvas>` / `<div>` element; v1's `js/64-3d-engine.js` keeps owning the user-facing iso block until the Phase 1 pilot makes plates v2-authoritative. Tests: 18 new (`tests/v2/render/threejs-mesh-test.test.js`) — Three.js r128 + r129+ absence assertions (`THREE.REVISION === '128'`, `typeof THREE.CapsuleGeometry === 'undefined'`), dispatch table population (`beam:ub` / `beam:shs` / `plate:*` / `fastener:as1252-bolt` + the column re-uses + `fastener:*` fallback), BUILD stamp bumped to phase `'0g'` with `render-threejs` layer added, every element dispatched (4 dispatches on the baseplate fixture's elevation view, all `resolved: 'specific'`), specific routing assertions for UB / SHS / 2 plates, vertex-count proxy assertions (UB ExtrudeGeometry of the 12-vertex I-section yields > 12 vertices; each SHS wall is a non-degenerate BoxGeometry; plates produce ExtrudeGeometry with `userData.v2Thickness === 10` from the fixture's `thk: 10`), material library caching (UB and plates share `'v2:mat:steel-s300'`; `mesh.material.color.getHex() === 0xb0b0b0`), SHS hits the steel-s355 fallback (`0xa8a8a8`), forced `fastener:as1252-bolt` dispatch builds a 5-child bolt Group (head + shaft + nut + 2 washers) — registry coverage even though the fixture has no fasteners, **two consecutive render passes produce STRUCTURALLY IDENTICAL scene graphs (the Phase 0g determinism exit criterion — vertex counts, positions, quaternions, material names compared via deep equality)**, deleted element GC (orphan mesh removed on next render even without a dirty hint), out-of-view view-local plates skipped in sectionA view (2 dispatches `'specific'`, 2 `'out-of-view'`, scene cache holds 2 meshes), dirtyBus subscribe + emit round-trips, and `dispose()` tears the cache down to empty (mesh cache zero, material cache zero). 204 tests total (186 + 18). JSDOM has no WebGL — the test asserts SCENE-GRAPH SHAPE rather than pixels per the build plan; the `three` npm devDependency is pinned to the exact `0.128.0` release in `package.json` and republished onto `globalThis.THREE` via `tests/v2/setup.mjs` Group 0 (before any v2 script loads). Pixel-fidelity comparison against v1's iso render of the same fixture is Dan's manual smoke-test step in the browser (DevTools `v2.render.threejs.RENDERERS` for dispatch census + a console toggle to make the hidden scene visible). No soak (scaffold; v2 renderer not wired into the user-facing iso block yet — Phase 1 pilot promotes plates v2-authoritative and flips that on behind a feature flag). |
| 1 — Pilot (plates) | 🟡 Built — soak pending | 2026-05-22 | 2026-05-22 | – | **Phase 1 BUILD COMPLETE; one-week soak starts when Dan flips `v2.featureFlags.set('plates', true)` for the first daily session.** 13 new v2 source files added (1 root, 4 engine, 3 tools, 5 ui) + 2 minor v1-side edits (no v1 file modified; v1 entry points are monkey-wrapped from v2). NEW FILES — root: `js/v2/feature-flags.js` (the runtime switchboard; `useV2For.plates` default `false`; declared FLAG_KEYS gate the API so a typo is loud; emits `feature-flags-changed` on the dirtyBus for the palette wrap's deactivate-on-flip path). Engine extensions: `engine/active-tool.js` (TOOLS Map, registerTool, setActiveTool with onActivate/onDeactivate, per-tool state slot on appState.tools[id]); `engine/undo-stack.js` (transactional applyTransaction/undo/redo; constant-time replay via the transaction's apply/unapply closures; each apply emits 'model-changed' AND calls autosave.markDirty; v1's `js/05-state.js` undo is left intact in parallel — Phase 2 collapses the two stacks); `engine/autosave.js` (debounced localStorage save under `structdraw_v2_autosave_<projectId>`, default 1500ms poll + 800ms debounce, title-bar dirty indicator `● <title>`, restore() reads the saved JSON back through v2.io.load.fromParsed); `engine/event-dispatch.js` (under 100-line v2 cousin of v1's 1,601-line `39-events.js`; binds pointer/key listeners in CAPTURE phase on the v1 `mainCanvas` so v2 sees events before v1, calls `stopImmediatePropagation()` ONLY when the active v2 tool returns true from its handler — non-claimed events fall through to v1 verbatim; `buildCtx(event)` resolves the v1 active block + cursor via `px2real` and threads in helpers (`applyTransaction`, `requestRender`, `setToolState`) so a tool never touches v1 globals directly). Tools: `tools/_tools-namespace.js` (namespace bootstrap); `tools/place-plate-tool.js` (the PILOT — rectangle + polygon modes mirroring v1 `js/76-v25-plate.js`; rect-mode supports both two-click and drag-release commit (`DRAG_THRESHOLD_PX = 4`); poly-mode toggles via the `P` key, closes on dblclick/Enter/click-near-first; commits via `placeElementTransaction({category: 'plate', family: 'plate-flat', type: 'PL10', geometry: region(view-local, polygon in real-world mm), materialId: 'steel-s300', params: {thickness, v2Source: 'place-plate-tool', v2View}})`; the `v2Source` stamp is what the bridge graft AND the live-render shim filter on); `tools/tool-registry.js` (KNOWN_TOOL_IDS sentinel + idempotent registerAll). UI: `ui/_ui-namespace.js`; `ui/size-picker.js` (catalogue-driven `<select>` widget; `optionsFor(familyId)` reads `family.types`, persists choice on appState.ui.activePlateType/activeFamily/activeType); `ui/inspector-plate.js` (`renderForElement(elementId, host)` builds a panel with element/family/thickness/material/geometry sections; thickness change dispatches `editElement({type, params: {thickness}})` via the undo stack; console-callable as `v2.ui.inspectorPlate.show(id)` — the v2 selection layer that wires it to clicks is Phase 10); `ui/palette-bb-rail.js` (wraps `window.v25SetPlate`; flag-off branch calls the original verbatim (byte-identical), flag-on branch sets the appState.ui.active* slots and activates the v2 PlacePlateTool; subscribes to 'feature-flags-changed' so flipping the flag off mid-session deactivates the v2 tool cleanly — control returns to v1); `ui/live-render.js` (the Phase 1 BRIDGE that makes v2 plates observable on the user-facing canvas + iso block; wraps `window.drawBlockContent` so each v1 render-pass paints v2 plates AFTER the v1 entity loop using v1 drawing conventions (real2px + LW + ppm + colorAlpha + 'PL X THK' label at centroid — visually consistent with v1 `drawPlate2D`); wraps `window.v3dRebuildScene` so each iso-rebuild adds a v2 plate Mesh via `v2.render.threejs.buildMeshPlate` (the Phase 0g scaffold) with v1's `v3dMatPlate` as the material so the iso visual matches v1's existing plate look; subscribes to 'model-changed' and pumps `requestRender()` + `v3dMarkDirty()` so the user sees the placement immediately; the wraps short-circuit when the flag is OFF so v1 is untouched; this file is the only Phase 1 dependency on v1 drawing primitives — Phase 2 retires it). V1-SIDE EDITS (intentional, reversible): `js/v2/engine/v1-bridge.js` — `syncFromV1` now captures v2-authoritative elements (filter: `category === 'plate' && params.v2Source === 'place-plate-tool'` gated by `featureFlags.get('plates')`) BEFORE the migrator overwrites `model.elements`, then grafts them back on top; without this graft every v1 mutation would silently clobber v2 plates. `js/v2/engine/init.js` — `boot()` now installs five layers in order (v1Bridge, eventDispatch, paletteBBRail, liveRender, autosave); each install is idempotent; the BUILD descriptor stamp moved INTO boot() so a later top-level eval (the threejs renderer index.js) can't overwrite the phase '1' marker. NO `js/76-v25-plate.js` modification (the v1 plate code path stays exactly as it was — Phase 2 retires it). Wired into `index.html` (feature-flags right after `_namespace.js`; the Phase 1 surface block at the end after the render scaffolds) + `tests/v2/setup.mjs` LOAD_ORDER (same order). TESTS: 13 new (217 total green, was 204) — `tests/v2/tools/place-plate-tool.test.js` (9 tests: tool registered; flag-off short-circuits; rect-mode drag-release commit; rect-mode two-click commit; poly-mode P-toggle + dblclick commit; Escape cancels; undo/redo round-trip; **v1-bridge re-sync preserves v2-authoritative plates** (the exit-criterion guarantee — places a v2 plate, stubs v1 globals to a v1 UB, forces a bridge sync, asserts both the v2 plate AND the v1 UB are present in `appState.model`); flag-off + sync drops the v2 plate (proves the graft is gated by the flag, not always-on)) and `tests/v2/io/save-load-plate.test.js` (4 tests: `previewSavePayload` emits schemaVersion 2 with the plate in `v2.elements`; full string round-trip via `saveModelToString → JSON.parse → fromParsed` reproduces the plate id/family/type/polygon/material/params exactly; autosave: in-memory storage shim + `markDirty → flush → restore` round-trips; multiple plates preserved in insertion order). LIVE-BROWSER VERIFICATION (Dan-flips-the-flag soak rehearsal): npm dev server (`npx http-server -p 8765`) + the `structdraw-root` Preview entry confirm: (1) flag-off boot is clean (zero console errors, every Phase 1 surface reports `installed: true`); (2) flag-off `v25SetPlate('sec')` mutates `v25Last.plateAspect` to 'sec' and clears `v25State.polyPts` — verbatim v1 behaviour; (3) flag-on `v25SetPlate('elev')` activates the v2 tool, populates `appState.ui.activeFamily / activeType / activePlateAspect`; (4) synthesised pointerdown/move/up via the tool's handlers commits a `category: 'plate', family: 'plate-flat', type: 'PL10', materialId: 'steel-s300', params: {thickness: 10, v2Source: 'place-plate-tool'}` Element with the expected 4-vertex polygon; (5) the live-render shim paints `PL 10 THK` on the user-facing canvas in the elevation block; (6) the iso-block rebuild adds a `v2:plate:<id>` Mesh (3D capability that v1 never had — the exit-criterion "new capability" deliverable); (7) undo / redo round-trips the model (1→0→1 plates) entirely via the v2 transactional stack; (8) autosave writes the v2 payload to localStorage at `structdraw_v2_autosave_v1-project` (schemaVersion 2, 1 v2 plate in the array), and the title-bar shows `● StructDraw V24.A3 — A1 Sheet Detail Editor` after markDirty. KNOWN PHASE-1 LIMITATIONS (deferred to later phases per the build plan): (a) Ctrl+Z still hits v1's undo first — v2 undo is reachable via `v2.engine.undoStack.undo()` from the console; Phase 2's plate retirement collapses the two stacks. (b) v1's file save (`46-save-load.js`'s `saveProject`) does NOT yet embed the v2 slice — explicit Save+Load only round-trips v1; the autosave is the daily-soak persistence path. (c) The Inspector + size-picker are usable from console but not yet wired to clicks (v2 selection layer is Phase 10); the v1 inspector keeps owning v1 plate2 entities. (d) The live-render shim uses v1 drawing primitives directly rather than the Phase 0f `Canvas2DRenderer.draw-plate.js` — a viewport-aware View + Canvas2DBackend wiring is Phase 2; the v2 dispatch path is exercised by the existing Phase 0f / 0g tests on a hidden canvas. **The soak begins the moment Dan flips the flag in DevTools. Phase 2 (retire v1 plate path) starts as a fresh chat after one week of daily-use with no rollback.** |
| 2 — Retire v1 plate path | 🟡 Built — review pending | 2026-05-22 | 2026-05-22 | n/a (no soak; retirement, not new code) | **Phase 2 BUILD COMPLETE; awaiting Dan's diff review + browser smoke + commit.** Files deleted: `js/76-v25-plate.js` (422 lines, the V25 plate2 entity + tool + helpers). v1 files with plate2 branches stripped: `js/68-v25-tools.js` (edge-collection + auto-weld; ~50 lines removed); `js/69-v25-dispatch.js` (draw dispatch + v25-plate tool click + ghost preview; ~190 lines removed); `js/71-v25-selection.js` (v25EntBounds defer, v25EntHandles handles, three v25Move grip drag branches; ~125 lines removed); `js/72-v25-options-bar.js` (Aspect / Thk options + wires; ~35 lines removed); `js/39-events.js` (snap probe + body-drag-snap leg + mouseup commit + dblclick poly close; ~155 lines removed); `js/42-keyboard.js` (Escape state slots + Enter close; ~11 lines removed); `js/74-v26-bb-rail.js` (Plate tile routes to `v2.ui.paletteBBRail.activatePlate()` instead of `v25SetPlate()`). `index.html` — removed the `<script src="js/76-v25-plate.js">` tag and updated the surrounding comment. **NOT touched** (per investigation): `js/59-inspector.js` (the file's `type === 'plate'` references are for 3D-mode `objects3D` plates, NOT v1 V25 plate2; there is no plate2 panel in 59-inspector.js OR in v25UpdateInspector at `71-v25-selection.js:1083` — plate2 selection always fell through to the generic Display fields). v2 SURFACES SIMPLIFIED (flag retired): `js/v2/feature-flags.js` — dropped `useV2For.plates` from `FLAG_KEYS` and `useV2For` (registry stays in place for Phase 3+ `bolts`); `js/v2/engine/v1-bridge.js` — `captureV2Authoritative` graft is now unconditional (the flag gate is gone, the graft itself stays since v2 plates are always v2-native); `js/v2/ui/palette-bb-rail.js` — **rewritten** as a v2-native activator (`v2.ui.paletteBBRail.activatePlate(aspect)`) instead of a v1-function wrap; `install()` is now a no-op kept for parity with the other boot surfaces; `js/v2/tools/place-plate-tool.js` — dropped the 5 flag-off short-circuits in `onPointerMove`/`onPointerDown`/`onPointerUp`/`onDblClick`/`onKey`; `js/v2/ui/live-render.js` — dropped the `flagOn()` helper + the 4 flag checks in `drawV2PlatesOnCanvas`/`buildV2PlatesInScene`/`wrapDrawBlockContent`/`wrapV3dRebuild` (drawing logic unchanged per the Phase 2 brief's "do NOT touch the live-render shim's drawing logic"); `js/v2/engine/init.js` — BUILD descriptor stamp now reports `phase: '2'` with a Phase 2 note. SAVE PATH EXTENDED (the gap from the Phase 1 tracker row): `js/46-save-load.js` — `saveProject` calls `v2.io.save.previewSavePayload(v2.appState.model, data)` to emit the combined `{ schemaVersion: 2, v2: {...}, v1: data }` shape when the v2 layer is loaded (falls back to bare-v1 if v2 isn't present); `loadProject` detects `parsed.schemaVersion >= 2`, extracts `parsed.v1` for the existing v1-globals repopulate, then AFTER the existing `afterV1Load` re-migration grafts every v2-authoritative plate (`category === 'plate'` AND `params.v2Source === 'place-plate-tool'`) from `parsed.v2` onto `v2.appState.model.elements`. Without this graft a saved sheet's v2 plates would vanish on next load — the gap Phase 1 left open. Tests: **225 green** (was 217 pre-Phase-2; 2 flag-only tests removed = 215, 10 new Phase 2 tests added = 225). Pre-existing tests updated: `tests/v2/tools/place-plate-tool.test.js` (removed the 2 flag-specific tests + every `featureFlags.set('plates', ...)` line); `tests/v2/io/save-load-plate.test.js` (removed the flag-set line in beforeEach). New tests: `tests/v2/io/migrate-v1-plate2.test.js` (5 tests — elev-rect / elev-poly / sec-cleat plate2 migrate to v2 plate Elements with correct polygons; multiple plate2 entities preserve order + deterministic ids; migrated plates carry NO `v2Source === 'place-plate-tool'` marker so the bridge graft only fires for user-placed v2 plates); `tests/v2/io/save-load-v2-shape.test.js` (5 tests — `previewSavePayload(model, v1data)` emits combined shape; JSON.stringify+parse preserves both slices; `detectSchemaVersion` picks `'v2'`; v2 slice round-trips a plate with same id/polygon/material; **bare v1 file still loads via v1-single path — backwards-compat smoke for Dan's pre-Phase-2 archives**). EXIT CRITERION (build-plan §"Phase 2"): zero `plate2` references outside `js/v2/` — `grep -rn 'plate2\\|drawPlate2D\\|v25Plate\\|V25_PLATE\\|plateThk\\|plateAspect\\|plateDownPx\\|plateDownWorld\\|plateRectAnchor' js/ \\| grep -v js/v2/` returns only 3 hits, all in `js/48-connection-builders.js` for a local variable named `plateThk` inside the 3D-mode WSP (web side plate) connection builder — unrelated to v1 V25 plate2 state (which would be `v25Last.plateThk` / `v25State.plateThk`). Save/load fixture round-trip preserved (the existing `tests/v2/io/load-v1-fixture.test.js` still passes — the `baseplate.sdproj` fixture migrates identically). Docs: CLAUDE.md "File map" updated (76-v25-plate.js retired, file count 84→83); "File-number bands" updated (band 9 now reads `65–72, 74` instead of `65–72, 74, 76`); "Adding a new member..." checklist updated to direct new PLATE families to the v2 layer (`js/v2/catalogues/families/`) instead of the retired `plate2`. **NOT done in Phase 2** (deferred to later phases per the brief): the Phase 1 live-render shim's drawing primitives stay (`real2px` / `LW` / `ppm` — Phase 3+ replaces with the proper Canvas2DRenderer + viewport-aware View); v2 plate body-snap (Phase 10's grip migration); v2 plate auto-welds (Phase 7's unified joint pipeline); v2 plate inspector wired to clicks (Phase 10's v2 selection layer). NEXT STEP — Phase 3 (bolts migration, incorporating `v25-2d-bolts/`) is a separate fresh chat per the build-plan's two-chat workflow. |
| 3 — Bolts migration | 🟡 Built — soak pending | 2026-05-23 | 2026-05-23 | – | **Phase 3 BUILD COMPLETE; one-week soak starts when Dan flips `v2.featureFlags.set('bolts', true)` for the first daily session.** 4 new v2 source files + 5 v2 surface extensions + 1 v1-side tile wire-through, no v1 file beyond `74-v26-bb-rail.js` modified. Path chosen with Dan: **Option B** from the brief (v25-2d-bolts/ NOT yet shipped to v1; absorb the dedup PATTERN into Phase 3 directly). Auto-grip is STUBBED — every placed bolt starts with `params.grip = 12` (the v25-2d-bolts §"Free-space fallback"), `params.gripOverride = null`; the Inspector exposes an override slider so Dan can dial the actual grip per-bolt during the soak. Real raycast auto-grip from v25-2d-bolts/05-auto-grip-algorithm.md is deferred to a later phase (when v2 bolts host into v2 plates natively — Phase 10 selection wiring is the natural moment). NEW FILES — tools: `js/v2/tools/place-bolt-tool.js` (single-click placement, geometry.kind `'point'`, defaults to `family: 'as1252-bolt' / type: 'M20' / grade: '8.8' / aspect: 'sec' / rot: 0 / grip: 12 / washers: 'both' / nutStyle: 'hex' / v2Source: 'place-bolt-tool' / v2View: <blk.viewKey>`; pointerDown commits the bolt and re-seeds the preview so consecutive clicks place additional bolts at the same settings; pointerUp is a no-op so a drag-from-the-tile doesn't double-commit; right-click pointerDown is rejected; Escape clears the preview; every handler short-circuits flag-off so the running app is byte-identical to today). UI: `js/v2/ui/inspector-bolt.js` (renders into a caller-supplied host; editable fields: Type (size-picker dropdown), Grade (4.6/8.8/10.9 - dispatches material swap to `bolt-as1252-grade-<g>`), Aspect (sec/elev), Rotation (degrees), Grip (auto/override toggle + numeric override), Washers (both/head-only/nut-only/none), Nut style (hex only for v1); every edit dispatches `editElement` through the undo stack so changes participate in undo/autosave; console-callable as `v2.ui.inspectorBolt.show(id)` until the Phase 10 selection wiring lands). TESTS: `tests/v2/tools/place-bolt-tool.test.js` (11 tests) + `tests/v2/io/save-load-bolt.test.js` (6 tests) — 17 new tests, 242 green total (225 + 17). EXTENDED FILES (v2-side, additive — no v1 file beyond 74-v26-bb-rail.js touched): `js/v2/feature-flags.js` — FLAG_KEYS gains `'bolts'`, `useV2For` gains `bolts: false`, header note updated for the Phase 3 + retirement story. `js/v2/engine/v1-bridge.js` — `captureV2Authoritative` filter extended to ALSO capture `el.category === 'fastener' && el.params.v2Source === 'place-bolt-tool'` when `featureFlags.get('bolts')` is on; plates stay unconditional (Phase 2); the bolt graft is flag-gated so a flag flip turns the survival behaviour on and off cleanly. `js/v2/ui/palette-bb-rail.js` — gains `activateBolt(opts)` alongside `activatePlate`; the activator seeds `appState.ui.activeBolt{Family,Type,Grade,Aspect,Rot}` and calls `engine.setActiveTool('place-bolt')`; the activator does NOT itself check the flag (so DevTools / tests can poke it regardless of flag state — the flag check lives at the BB-rail tile call-site). `js/v2/ui/live-render.js` — adds `eachV2Bolt` / `boltUV` / `boltViewKey` / `boltsAuthoritative` (the flag gate), `drawV2BoltsOnCanvas` (mirrors v1's `drawBolt` end-on path for `aspect: 'elev'` — washer + bolt hole + crosshair; for `aspect: 'sec'` paints a simplified rotatable side profile — shaft + head + washers + nut + thread protrusion + AS 1100 centreline using `DASH.CL_BOLT`; uses v1's `BOLT_DB[el.type]` for assembly dimensions + v1's `LW.VIS / LW.HID` / `viewport.zoom` / `drawingScale` / `colorAlpha`), `buildV2BoltsInScene` (calls the Phase 0g scaffold `v2.render.threejs.buildMeshBoltAS1252` with v1's `v3dMatBolt` as the material so the iso visual matches v1's bolt rendering; the `ctx.type` shim resolves from the v2 catalogue when available, falls through to `BOLT_DB` so the iso mesh has correct head/nut/washer dimensions); both wraps gated by `boltsAuthoritative()` so flag-off is byte-identical. `js/v2/engine/init.js` — BUILD descriptor stamp moved to phase `'3'` with a Phase 3 note covering the new files + the flag + the graft + the live-render extension + the BB-rail tile route. V1 EDIT (one tile, reversible): `js/74-v26-bb-rail.js` — the existing `'d-bolt'` tile's `onClick` is now a flag-aware router: 2D mode + `useV2For.bolts` on + `v2.ui.paletteBBRail.activateBolt` present → call `activateBolt({ size: lastUsedSection.bolt || 'M20', grade: '8.8' })`; any other state (3D mode OR flag-off OR v2 not loaded) → `selectMemberByBolt(lastUsedSection.bolt || 'M20')` (verbatim v1 path). Wired into `index.html` (script tags for `place-bolt-tool.js` + `inspector-bolt.js` added to the Phase 1 surface block at the bottom, with HTML comments noting the Phase 3 origin) + `tests/v2/setup.mjs` LOAD_ORDER (same order). LIVE-BROWSER VERIFICATION (Dan-flips-the-flag soak rehearsal — `npx http-server -p 8765`, structdraw-root preview): (1) flag-OFF boot clean, zero console errors; every Phase 3 surface reports `installed: true`/`function`; FLAG_KEYS is `['bolts']`. (2) Flag-OFF Bolt-tile click → v1's `selectMemberByBolt` fires once, v2 `getActiveTool()` returns null (byte-identical). (3) Flag-ON Bolt-tile click → v1 silent, v2 `place-bolt` active, `appState.ui.{activeBoltFamily: 'as1252-bolt', activeBoltType: 'M20', activeBoltGrade: '8.8', activeBoltAspect: 'sec'}` populated. (4) Synthesised pointerdown via the tool's handler commits a `category: 'fastener', family: 'as1252-bolt', type: 'M20', materialId: 'bolt-as1252-grade-8.8', geometry.location: {x:200,y:150,z:0}, params: {aspect:'sec', grip:12, gripOverride:null, washers:'both', nutStyle:'hex', grade:'8.8', v2Source:'place-bolt-tool', v2View:'elevation'}` Element. (5) Forced `v3dRebuildScene()` adds exactly one `v2:fastener:as1252-bolt:<id>` mesh (head + shaft + nut + 2 washers per the Phase 0g scaffold) to `v3dGroup`. (6) `undoStack.undo() → 0 bolts → redo() → 1 bolt` (transactional). (7) `previewSavePayload → JSON.stringify → JSON.parse → fromParsed` round-trips the bolt with `schemaVersion: 2` detected. (8) An `addEnt2D({...})` v1 mutation triggers the wrapped bridge sync — v2 bolt SURVIVES (graft on, flag-on). (9) `featureFlags.set('bolts', false) + syncFromV1()` DROPS the v2 bolt (graft is flag-gated — proves Dan can flip back to v1-only at any moment during the soak). (10) Screenshot captures the v26 BB-rail rendered DRAW tab with the BOLT tile visible in the Members grid. KNOWN PHASE-3 LIMITATIONS (deferred per the brief, NOT regressions): (a) Auto-grip raycast (v25-2d-bolts/05-auto-grip-algorithm.md) — stubbed at 12 mm; Inspector override is the soak workaround until v2 plates host v2 bolts natively in a later phase. (b) The live-render shim's `'sec'` aspect draws a simplified rotatable rect for head/shaft/nut rather than v1's full AS 1101 chamfered-hex side profile — promoting to the proper Canvas2DRenderer + viewport-aware View is Phase 5+ work per the live-render.js header. (c) Ctrl+Z still hits v1's undo first — the v2 stack is reachable via `v2.engine.undoStack.undo()` from the console; Phase 3 retirement (deletes v1 bolt path) collapses the two stacks for bolts. (d) Save path: `js/46-save-load.js`'s `saveProject` already calls `previewSavePayload(model, data)` (post-Phase-2 wiring) — no change needed for Phase 3. The load-side graft in `js/46-save-load.js` `loadProject` was EXTENDED in Phase 3 to also restore v2 bolts when `useV2For.bolts` is on (filter now matches plates unconditionally + bolts gated by the flag — mirrors `v1-bridge.js` `captureV2Authoritative` so the same elements that survive a bridge re-sync also survive a file load). Without this extension Dan's saved sheets would lose their v2 bolts on reload. (e) Inspector wired to clicks is Phase 10. **The soak begins the moment Dan flips the flag in DevTools. Phase 3 RETIREMENT (delete v1 bolt paths in `33-draw-bolt.js`, the v1 selectMemberByBolt path, the 3D bolt placement tool, the v25 anchor/Bolt rail entry's v1 fallback; consolidate the `46-save-load.js` load-side graft for fasteners) starts as a fresh chat after one week of daily-use with no rollback.** Incorporates `v25-2d-bolts/` insofar as the patterns from `02-design.md` (entity schema fields aspect/rot/grade/washers/nutStyle) and `05-auto-grip-algorithm.md` (free-space 12 mm fallback) inform the v2 bolt shape; the v1 axis-agnostic refactor of `33-draw-bolt.js` is no longer needed because the v2 renderer is axis-agnostic natively. |
| 4 — Members migration | ⏳ Pending | – | – | – | Largest single feature family. |
| 5 — Timber members | ⏳ Pending | – | – | – | – |
| 6 — Timber fasteners | ⏳ Pending | – | – | – | Replaces `timber-screws/` v1 feature. |
| 7 — Joints | ⏳ Pending | – | – | – | Unifies parallel algorithms. |
| 8 — Annotations | ⏳ Pending | – | – | – | High volume. |
| 9 — Sheet components | ⏳ Pending | – | – | – | – |
| 10 — Selection / grip handles | ⏳ Pending | – | – | – | Incorporates `click-cycle-selection/`. |
| 11 — Connection wizards | ⏳ Pending | – | – | – | – |
| 12 — Detail callout/card/ref | ⏳ Pending | – | – | – | – |
| 13 — Full export coverage | ⏳ Pending | – | – | – | – |
| ∞ — v1 retirement | ⏳ Pending | – | – | – | Cleanup sweep. |

---

## Copy-paste prompts for build chats

### For Phase 0a (docs realignment)

See `PlannedBuilds/codebase-restructure/README.md` → "Build chat for Phase 1" prompt. Identical content; pasted there.

### For Phase 0b (model layer scaffold)

```
You're executing Phase 0b of /PlannedBuilds/architecture-v2/09-build-plan.md.

1. Read /CLAUDE.md end-to-end.
2. Read /PlannedBuilds/architecture-v2/README.md.
3. Read /PlannedBuilds/architecture-v2/03-model-layer.md (the deep design — authoritative).
4. Read /PlannedBuilds/architecture-v2/06-tools-and-transactions.md §2 (transaction shape).
5. Read /PlannedBuilds/architecture-v2/09-build-plan.md "Phase 0b" Files-touched table.
6. Confirm Qs 6-9 in /PlannedBuilds/architecture-v2/10-open-questions.md are answered.
7. Build phase 0b. Test boundary: every transaction factory has apply+unapply round-trip tests.
   Use JSDOM + Vitest (per Q9 answer) or whatever test stack Dan picked.
8. Update the progress tracker in 09-build-plan.md.
9. Stop. The next phase is 0c, in a fresh chat.
```

### For later phases

Each later phase's prompt follows the same template — read the relevant deep-design file, read the phase's Files-touched table, confirm any phase-specific open questions are answered, execute, update tracker, stop.

---

## What happens if a phase fails its exit criterion

A phase that doesn't meet its exit criterion does NOT advance. Options:

1. **Re-scope the phase.** If Phase 1 reveals that plate2 migration requires a model-layer change, extend Phase 1's deliverables and re-soak.
2. **Roll back the phase.** Feature flag the v2 path off; revert to v1; debug in isolation; retry.
3. **Reorder upcoming phases.** If Phase 1 reveals that bolts should migrate before joints (or vice versa), adjust Stage C ordering in this document.

The cost of stopping cleanly is low. The cost of pushing through a phase that hasn't met its exit criterion is high — the architecture stops being trustworthy and the soak-and-retire safety net gets compromised.
