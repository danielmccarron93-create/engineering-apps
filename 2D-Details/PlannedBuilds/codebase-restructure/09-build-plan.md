# Build plan — 7 phases, each a separate build chat

This is the phased work plan. **Each phase is its own build chat.** None of them is so large that it can't fit in a single focused session. Each has a deterministic Files-touched list, a test boundary, and a stop condition.

Phase ordering is by dependency, not by size. Phase 1 is small and unblocks everything else (it's docs-only). Phase 2 absorbs an existing planning folder's late-stage build (timber-screws Phase 5). Phases 3–7 are the playbook's Phase-2 priorities reordered by what makes each easier.

> **Before starting any phase:** confirm every open question in `10-open-questions.md` that is tagged "blocks Phase N" has been answered by Dan. If not — stop and ask.

---

## Phase 1 — Docs realignment (no code changes)

**Goal:** Make `CLAUDE.md`, `README.md`, `CHANGELOG.md`, the planning READMEs, and the in-source comments truthful. Zero code touched.

**Blockers:** Open Qs 1, 2, 3, 4, 5, 7 must be answered (see `10-open-questions.md`).

**Files touched:**

| File | Change |
|---|---|
| `CLAUDE.md` | (1) Add `23a-shs-joints.js` and `76-v25-plate.js` to file map with one-line descriptions. (2) Refresh line counts in file map (39: 1601, 68: 1403, 71: 1484, 23a: 1182, 34: 981 in root / 989 in dev, 76: 422, 23: 682). (3) Add band-rule section after the file map (see `08-proposed-structure.md`). (4) Expand integration checklist into 3D-Studio + 2D-Studio variants. (5) Document the `tmbr`-style feature-prefix, `view`-field, sub-letter-numbering, IIFE-after-init, `--timber-color`, `ROTHOBLAAS_RULESET_VERSION` conventions. (6) Replace inline mirror command with pointer to `./bin/release.sh`. (7) Remove `bin/release.sh` from Phase-2 wishlist. (8) Update Known Issue #1 line numbers (734/880 → 946/1127). (9) Update Known Issue #2 line count (1415 → 1601). (10) Add `.claude/` paragraph. (11) Document the dev-only files section (`02b-02e`, `75`, `77-79`, `99`) with a "see PlannedBuilds/timber-screws/" cross-reference. (12) Add `screw` and `connection` to the established V25 entity types list. |
| `README.md` | Replace broken mirror command with `./bin/release.sh` pointer. Update file-count claim ("75 in root, 84 in dev"). |
| `CHANGELOG.md` | Reconcile the `schemaVersion: 2` claim — either remove the line OR move it to a "Planned for v25.6" section per Q5. Fix the 10+ in-source comments referencing `dev/feature-timber-screws/` (find/replace to `PlannedBuilds/timber-screws/`). Same find/replace in the 4 CHANGELOG entries. |
| `PlannedBuilds/timber-screws/README.md` | Update opening paragraph to reflect current state (Phases 1–4 shipped to `dev/`, Phase 5 corrective pending = Phase 2 of this restructure). |
| `PlannedBuilds/README.md` | Add a row for `codebase-restructure/` (this folder) to the dashboard table. Update file-count claim if needed. |
| `archive/completed-plans/README.md` | Document the "single-file `.md` vs folder" convention per Q4. |
| `archive/v1/` | Per Q3 (restore from git OR delete OR leave with documentation). No code change either way. |
| `dev/js/02b-data-timber.js:5`, `02c:5`, `02d:5`, `02e:8,292`, `05-state.js:16`, `07-globals.js:38`, `75:5`, `77:6`, `79:5`, `dev/index.html:1235,1314` | Find/replace `dev/feature-timber-screws/` → `PlannedBuilds/timber-screws/`. ⚠ Comments only — no behavioural change. |

**Test boundary:**
- `dev/index.html` opens in a browser; DevTools console clean. (Phase 1 touches comments and docs only, so this should trivially pass.)
- A fresh reader given just `CLAUDE.md` + `PlannedBuilds/README.md` can correctly answer: "Where is joint trimming implemented?", "Where do I add a 2D-mode bolt entity?", "How do I mirror dev to root?". Test this by asking it as a question in the build chat itself.

**Stop condition:** Every drift item in `02-current-state-audit.md` Group A is either fixed or has a documented "deliberately deferred" note. No items hanging.

**Estimated effort:** Single focused build chat, ~1–2 hours of edits.

---

## Phase 2 — Execute timber-screws corrective plan

**Goal:** Eliminate the live anti-patterns in `dev/` per `PlannedBuilds/timber-screws/10-corrective-plan.md` Phase 5. Wire timber properly through `mem2 + memberType:'timber'`, `plate2`, and `screw`. Delete the autoloader and the floating button.

**Blockers:** Phase 1 should ideally land first so the playbook reflects the correct integration checklist that this phase follows. Not strictly required — Phase 2 can be done in parallel if needed.

**Authority:** `PlannedBuilds/timber-screws/10-corrective-plan.md` is the authoritative spec for this phase. This restructure does NOT re-litigate it.

**Files touched (per timber-screws/10-corrective-plan.md):**

| File | Change |
|---|---|
| `dev/js/99-tmbr-autoload.js` | **DELETE.** |
| `dev/js/75-timber-conn-entities.js` | Delete the parallel `'timber-member'` and `'steel-plate'` entity factories. Keep `drawTimberGrainHatch` (relocate or keep). |
| `dev/js/68-v25-tools.js` | Add `'timber'` to `memberType` switch in `drawMem2D`. Use grain hatch pattern when `memberType === 'timber'`. |
| `dev/js/74-v26-bb-rail.js` | Add TIMBER tile to V26 BB-rail "Members" section (per timber-screws/06-ux.md). |
| `dev/js/60-tile-palette.js` | Add TIMBER tile to 3D-mode Model palette (deferred to v1.1 if no 3D timber renderer — confirm in timber-screws/07-build-plan.md). |
| `dev/js/58-size-picker.js` | Wire the timber catalogue (`02b-data-timber.js`). |
| `dev/js/77-screw-entity.js` | Keep — `screw` is a legitimate new entity type. Add HBS SCREW tile to V26 BB-rail (per the corrective plan). |
| `dev/js/69-v25-dispatch.js` | Add `v25-screw` branch to `v25TryHandleClick`. |
| `dev/js/72-v25-options-bar.js` | Add `v25-screw` branch to the options bar. Add `v25-mem` branch handling for `memberType === 'timber'` (timber catalogue, grain hatch toggle, etc.). |
| `dev/index.html` | Restore `76-v25-plate.js` to natural position in load order. Remove the load-order quirk comment. |
| `CHANGELOG.md` | Add "[Unreleased] — 2026-MM-DD" entry for the corrective. |

**Test boundary:** Browser smoke-test the existing acceptance criterion — Test 1 reproduces η=0.801 PASS (the regression case from `timber-screws/09-test-cases.md`). Plus visual smoke-test:
1. Click TIMBER tile in V26 BB-rail; place a timber member; verify grain hatching renders.
2. Click HBS SCREW tile; place a screw on the timber member; verify the connection auto-binds.
3. Verify no red floating button appears anywhere on page load.
4. Verify console is clean.

**Stop condition:** Test 1 still passes; no floating button; no autoload demo.

**Estimated effort:** Single focused build chat, ~3–4 hours.

---

## Phase 3 — Lift scattered globals into `appState`

**Goal:** Replace the ~25 scattered top-level `let` declarations with a single `appState` object owned by a new `04a-app-state.js` (or similar). No behavioural change.

**Blockers:** Phase 1 should land first to document the convention. Phase 2 should land first to remove the timber globals that would otherwise need migration.

**Files touched:** ~12 files modified, 1 new file.

| File | Change |
|---|---|
| `dev/js/04a-app-state.js` (NEW) | Single `appState` object with sub-namespaces (`appState.model`, `appState.tools`, `appState.ui`, `appState.drag`, `appState.dialogs`, `appState.wizards`). |
| `dev/js/05-state.js` | `objects3D`, `projectModel` → `appState.model.objects3D`, `appState.model.projectModel`. |
| `dev/js/07-globals.js` | All globals → `appState.<namespace>.<name>`. File becomes a thin "back-compat shim" exposing getters for the few names that 3rd-party-style scripts (like `74` IIFE) read. |
| `dev/js/41-tools.js` | `tool` → `appState.tools.active`. `setTool` mutates `appState.tools.active`. |
| `dev/js/48-connection-builders.js` | Wizard state → `appState.wizards.connection`. |
| `dev/js/52-cmd-palette.js` | UI state → `appState.ui.cmdPalette`. |
| `dev/js/53-layers-panel.js` | `layerVisibility` → `appState.ui.layers`. |
| `dev/js/55-mirror-tool.js` | Mirror state → `appState.tools.mirror`. |
| `dev/js/56-favourites.js` | Favourites → `appState.ui.favourites`. |
| `dev/js/57-chord-layer.js` | Chord state → `appState.ui.chord`. |
| `dev/js/58-size-picker.js` | `lastUsedSection` → `appState.ui.sizePicker.lastUsed`. |
| `dev/js/59-inspector.js` | Inspector state → `appState.ui.inspector`. |
| `dev/js/72-v25-options-bar.js` | Monkey-patch state → `appState.dialogs.optionsBar` (cleaned up in Phase 5). |
| `dev/js/23-auto-weld.js` | `_weldDialogLast` → `appState.dialogs.weld`. |
| `dev/js/23a-shs-joints.js` | `mitrePairs`, `_shsJointPopup`, `_v25JointCache` → `appState.dialogs.joints`. |
| All ~30 files that read these globals | Update reads to `appState.<namespace>.<name>`. |

**Test boundary:** Every existing visual workflow still works. Critical: undo/redo (touches many state buckets), V25 placement of every entity type, 3D-mode placement of every member type, layer visibility toggle, cmd-palette open/close, favourites strip, chord layer.

**Stop condition:** Zero top-level `let` declarations outside `04a-app-state.js` that aren't explicit feature-prefix module state (e.g., `tmbr*` is fine; `_weldDialogLast` is not).

**Estimated effort:** Single focused build chat, ~4–6 hours. Largest diff in the restructure but no behavioural change.

---

## Phase 4 — Split `39-events.js` into tool-handler dispatch table

**Goal:** Replace the monolithic `initEvents()` function with a dispatch table routing canvas events to per-tool handler modules.

**Blockers:** Phase 3 must land first — tool handlers need a structured `appState` to declare ownership against.

**Files touched:** ~25 new files (one per tool) + 1 modified.

| File | Change |
|---|---|
| `dev/js/39-events.js` | Shrink to ~150 lines of dispatch + global event setup. |
| `dev/js/events/` (NEW directory) | One file per tool — `events/tool-select.js`, `events/tool-v25-mem.js`, etc. Each exports `{ onMouseDown, onMouseMove, onMouseUp, onKey, onDblClick, onWheel }`. |
| `dev/index.html` | Add `<script>` tags for the new event/* files. |
| `CLAUDE.md` | Document the tool-handler contract in the integration checklist. |

**Test boundary:** Every tool path still works identically. Test by manually exercising the 5 most-used tools: V25 select, V25 mem placement, V25 plate placement, V25 marquee, 3D-mode bolt placement. Plus the keyboard shortcuts via `42-keyboard.js` and the chord layer via `57-chord-layer.js`.

**Stop condition:** `39-events.js` is < 200 lines. No `if (tool === '…')` branches remain in `39-events.js`. Every tool is its own file under `events/`.

**Estimated effort:** Single large build chat, ~5–7 hours. Largest cognitive load in the restructure.

---

## Phase 5 — Replace V25 monkey patches with extension hooks

**Goal:** Eliminate the 4 monkey patches in `72-v25-options-bar.js`. Replace with proper extension hooks declared on the patched functions.

**Blockers:** Phase 3 must land first — the hooks need a clean state model.

**Files touched:**

| File | Change |
|---|---|
| `dev/js/04b-hooks.js` (NEW) | Tiny hook framework: `defineHook(name)` returns `{ before(fn), after(fn), invoke(args) }`. |
| `dev/js/42-keyboard.js` | Declare `undo` as a hookable function. |
| `dev/js/69-v25-dispatch.js` | Declare `v25Add`, `v25SetTool`, `v25TryHandleClick` as hookable functions. |
| `dev/js/72-v25-options-bar.js` | Replace `_origUndo = undo; undo = function(){…}` with `undo.after(refreshOptionsBar)`. Same pattern for the other three. File shrinks. |
| `CLAUDE.md` | Document the hook pattern. Remove the V25 monkey-patch entry from Known Issues. |

**Test boundary:** Every action that previously triggered options-bar refresh still triggers it. Specifically: undo, V25 entity add, tool change, click handling.

**Stop condition:** No `_orig*` assignments anywhere in `dev/js/`.

**Estimated effort:** Single focused build chat, ~2–3 hours.

---

## Phase 6 — Unify parallel 3D/V25 implementations + dedup smells

**Goal:** Eliminate the four parallel implementations + the per-axis duplications + the type-dispatch ladders. Apply consistent lineweights across all renderers.

**Blockers:** Phase 1 (band rule documented), Phase 3 (state structured).

**Files touched:** Many, but each sub-task is independent. The phase can be split into sub-phases if a single chat can't absorb it all.

### Sub-phase 6a — Move misplaced primitives

| File | Change |
|---|---|
| `dev/js/08-coords.js` | Move `ppm()` in from `25-parametric-holes.js`. ~30 callers untouched. |
| `dev/js/24-draw-primitives.js` | Move `memberFillAlpha` in from `29-draw-ub.js`. Unify polygon primitives (pick `{u,v}` object form; migrate `33-draw-bolt.js` callers). Add `rPolygon` (stroke-only variant). |
| `dev/js/15a-occlusion-clip.js` (NEW) | Extract `isOccluded`, `clipLineAgainstOcclusion`, `rLineOcc` from `23-auto-weld.js`. |
| `dev/js/40-placement.js` | Move `createPlacingGhost` in from `38-crosshair.js`. |

### Sub-phase 6b — Unify joint trim algorithm

| File | Change |
|---|---|
| `dev/js/23a-shs-joints.js` | Extract the duplicate `_computeEndCut`/`_computeButtCut`/`_faceCutLine` pairs into one frame-agnostic `computeJointTrim(member, neighbours, frame, halfDepth, halfWidth)` function. Two thin adapters call into it (3D path, V25 path). `_clipPolygon` moves to `24-draw-primitives.js`. `_jv*` vector helpers retired in favour of inline arithmetic. File shrinks from 1,182 lines to ~700. |

### Sub-phase 6c — Bolt axis-agnostic refactor

| File | Change |
|---|---|
| `dev/js/33-draw-bolt.js` | Extract axis-agnostic hex/thread primitives. Delete the dead legacy renderer guarded by `V14_NEW_BOLTS`. **Co-ordinates with `v25-2d-bolts/` planning folder — that folder's Phase 4 already plans this refactor.** |

### Sub-phase 6d — `34-draw-2d.js` split

| File | Change |
|---|---|
| `dev/js/34a-dispatch.js` (NEW) | The `drawEnt2D` dispatch table + simple types (line, rect, circle, text, arc, polygon). |
| `dev/js/34b-dim.js` (NEW) | `drawDim2D` + 6 dimension variants extracted into named functions. |
| `dev/js/34c-annotations.js` (NEW) | `drawMemberTag2D`, `drawBoltCallout2D`, `drawMaterialTag2D`, `drawNote2D`, `drawMText2D`. |
| `dev/js/34d-sheet.js` (NEW) | `drawSectionMark2D`, `drawDetailRef2D`, `drawDetailCard2D`, `drawGridLine2D`, `drawRevisionTriangle2D`, `drawRevisionCloud2D`, `drawRevSchedule2D`. |
| `dev/js/34e-shapes.js` (NEW) | `drawBreakLine2D`, `drawSlot2D`, `drawHatch2D` (now delegating fully to `26-as1100-hatch.js`). |
| `dev/js/34-draw-2d.js` | DELETE (replaced by 34a-34e). |
| `dev/index.html` | Replace 34 with 34a-34e in script tags. |

### Sub-phase 6e — Lineweight discipline

| File | Change |
|---|---|
| `dev/js/29-draw-ub.js`, `30-draw-shs.js`, `33-draw-bolt.js`, `34b-dim.js`, `36-selection-highlights.js` | Replace every hand-rolled `ctx.lineWidth = 0.5` / `0.8` / `1.2` / `1.5` with `ctx.lineWidth = LW.* * ppm()`. ~20 sites total. |

### Sub-phase 6f — Type dispatch table for 3D-mode

| File | Change |
|---|---|
| `dev/js/28a-render-3d-dispatch.js` (NEW) | `RENDERERS_3D = { ub: drawUB, shs: drawSHS, plate: drawPlate, bolt: drawBolt, pfc/rhs/chs/ea/ua: drawSectionMember }`. |
| `dev/js/28-draw-block.js` | Remove the type ladder; consume the table. |

### Sub-phase 6g — Selection highlight unification

| File | Change |
|---|---|
| `dev/js/36-selection-highlights.js` | Extract a shared `drawHighlight(bounds, grips, options)` function that both `drawSelHighlight` (3D) and `v25DrawSelectionHighlight` (V25) call. The mode-specific bounds + grip computation stays in each file. |
| `dev/js/71-v25-selection.js` | Promote `v25HitTestAll` extension pattern to a documented hook. |

### Sub-phase 6h — `v25Mem2Thickness` duplicate

| File | Change |
|---|---|
| `dev/js/68-v25-tools.js` | Delete the duplicate definition at line 1127 (keep the one at line 946). |

**Test boundary:** Same visual output as before (this is the key test of every sub-phase). The integration checklist's "Quality bar check" against STP 6011 still passes. Lineweight changes are visible at low zoom — spot-check that centrelines are correctly thinner now.

**Stop condition:** No parallel `*V25` / `*` function pairs. No `ctx.lineWidth =` numeric literals in any drawer. `34-draw-2d.js` is gone. `RENDERERS_3D` table consumed by dispatcher.

**Estimated effort:** Several build chats — each sub-phase is independently shippable. Total ~8–12 hours across the chats.

---

## Phase 7 — Schema-versioned save format + autosave

**Goal:** Close Known Issue #5 and #6 from the playbook. Add `schemaVersion` field to save format with a load-time migration scaffold. Add throttled localStorage autosave with a dirty-indicator title.

**Blockers:** None — independent of Phases 3–6.

**Files touched:**

| File | Change |
|---|---|
| `dev/js/46-save-load.js` | Add `schemaVersion: 1` field to saved JSON. Add `loadWithMigration(json)` that detects version and runs migrators. |
| `dev/js/50-project.js` | Same — `schemaVersion: 1`, migration on load. |
| `dev/js/46a-save-migrators.js` (NEW) | Migration registry `{ from: 1, to: 2, run(json) {…} }`. Empty in v1 (no migrations needed yet) but the scaffold is there. |
| `dev/js/46b-autosave.js` (NEW) | Throttled localStorage autosave (e.g. 5-second debounce). Dirty flag in `appState.ui.saveStatus`. Title bar update. |
| `dev/index.html` | Add the new script tags. |
| `CLAUDE.md` | Remove Known Issues #5 and #6. Document the schema-version + migration pattern. |
| `CHANGELOG.md` | Reconcile the previously-aspirational entry (or remove it per Phase 1) with the actual implementation. |

**Test boundary:**
1. Save an existing `.sd2.json` file; verify the new file has `schemaVersion: 1`.
2. Load an old `.sd2.json` file (pre-schemaVersion) and verify the migration to v1 sets the field correctly.
3. Edit a sheet; verify the title bar shows the dirty indicator within 5 seconds.
4. Refresh the browser; verify "Restore unsaved changes?" prompt appears.

**Stop condition:** Every saved file has `schemaVersion`. Autosave works on every edit. Browser crash recovery prompt works.

**Estimated effort:** Single focused build chat, ~3–4 hours.

---

## Progress tracker

> Build chats update this table after each phase.

| Phase | Status | Started | Completed | Notes |
|---|---|---|---|---|
| 1 — Docs realignment | ⏳ Pending Q1–Q7 | – | – | – |
| 2 — Timber-screws corrective | ⏳ Pending | – | – | Absorbs `PlannedBuilds/timber-screws/10-corrective-plan.md` Phase 5. |
| 3 — Lift globals into appState | ⏳ Pending | – | – | – |
| 4 — Events dispatch table | ⏳ Pending | – | – | – |
| 5 — Remove monkey patches | ⏳ Pending | – | – | – |
| 6 — Dedup smells | ⏳ Pending | – | – | Split into sub-phases 6a–6h. |
| 7 — Schema version + autosave | ⏳ Pending | – | – | – |
