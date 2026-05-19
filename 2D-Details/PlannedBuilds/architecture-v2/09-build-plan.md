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
| 0d — v2→v1 bridge | ⏳ Pending | – | – | – | – |
| 0e — v1→v2 file migration | ⏳ Pending | – | – | – | – |
| 0f — Canvas2D renderer scaffold | ⏳ Pending | – | – | – | – |
| 0g — Three.js renderer scaffold | ⏳ Pending | – | – | – | – |
| 1 — Pilot (plates) | ⏳ Pending | – | – | – | – |
| 2 — Retire v1 plate path | ⏳ Pending | – | – | – | – |
| 3 — Bolts migration | ⏳ Pending | – | – | – | Incorporates `v25-2d-bolts/`. |
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
