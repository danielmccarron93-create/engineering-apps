# Current-state audit — what's actually drifted

This is the one-page diagnosis. Detailed per-layer findings live in `03-foundation-findings.md` through `07-dev-archive-findings.md`. Read those when you're about to touch the matching layer; this page is the headline summary.

The findings are grouped by **leverage to fix** (highest at the top — cheap fixes that unblock the most fresh-chat confusion), not by severity of the underlying problem. Phase 1 of `09-build-plan.md` fixes everything in groups A and B.

---

## Group A — Docs-vs-code drift (cheapest fixes, biggest fresh-chat impact)

### A1. `CLAUDE.md` file map omits `23a-shs-joints.js` and `76-v25-plate.js`

- **Playbook claim:** Root `js/` has 73 numbered files, ending with `74-v26-bb-rail.js`.
- **Reality:** 75 files. `23a-shs-joints.js` (1,182 lines — the **second-largest** file in the codebase) sits between `23-auto-weld.js` and `24-draw-primitives.js`. `76-v25-plate.js` (the V25 plate module) sits after `74-v26-bb-rail.js`.
- **Why it matters:** A fresh chat reading the file map will not know joint trimming or V25 plates exist as a separate concept until it reads `30-draw-shs.js` and follows the call to `jointTrimsForMember`. The largest file in the layer is invisible to the playbook.
- **Fix:** Phase 1 — add both files to the file map with one-line descriptions.

### A2. Line counts on the biggest files are stale by hundreds of lines

- **Playbook claim:** `39-events.js` is 1,415 lines; `68-v25-tools.js` is 1,149; `71-v25-selection.js` is 1,336.
- **Reality:** 1,601 / 1,403 / 1,484. `39-events.js` has grown by ~186 lines since the modular split — the file is getting bigger, not smaller, even though it's the playbook's #1 Phase-2 refactor target.
- **Fix:** Phase 1 — refresh every line count in the file map; add a "as of <date>" footnote so future drift is obvious.

### A3. The `README.md` mirror command is broken as written

- **Reality:** README at line 57 says `cp dev/index.html index.html && cp -r dev/css/ ./css/ && cp -r dev/js/ ./js/`. Without the `rm -rf css/ js/` step from `CLAUDE.md`, the second run of this command **nests directories** (creating `js/js/`) because `cp -r dev/js/ ./js/` copies onto an existing `js/` rather than replacing it.
- **Reality (other side):** `bin/release.sh` already exists and works correctly. The playbook says "A `bin/release.sh` helper is on the Phase-2 wishlist" — it's already shipped.
- **Fix:** Phase 1 — replace the inline mirror command in `README.md` and `CLAUDE.md` with "Run `./bin/release.sh` from the repo root." Remove the Phase-2 wishlist item.

### A4. `archive/v1/` files are all 0 bytes

- **Playbook claim:** "Do not delete `archive/v1/` or `archive/snapshots/`. They're the rollback path of last resort."
- **Reality:** All five files in `archive/v1/` (`CHANGELOG.md`, `DRAFTER_MAPPING.md`, `HANDOFF.md`, `STRUCTDRAW_PROJECT_BRIEF.md`, `index.html`) are 0 bytes. Same for `archive/snapshots/2026-05-01_pre-layout-overhaul.html`. They are not a rollback path of last resort; they are an empty directory.
- **Fix:** Phase 1 — restore from git history if rollback value is desired, OR update the playbook to stop framing these as a rollback path. Open Q3 in `10-open-questions.md`.

### A5. CHANGELOG claims `schemaVersion: 2` shipped; the code says otherwise

- **CHANGELOG `[Unreleased]`:** "Save-format schemaVersion: 2 field" (added with a 2026-05-12 entry).
- **Reality:** `dev/js/46-save-load.js` line 13 still has `version: '1.0'`; `dev/js/50-project.js` line 17 still has `version: 1`. No `schemaVersion` field anywhere in the released code.
- **Why it matters:** Known issue #5 in CLAUDE.md ("`.sd2.json` save format has no schema version field") is still real. The CHANGELOG entry is aspirational or got reverted.
- **Fix:** Phase 1 — either remove the CHANGELOG line, or move it to a "Planned for v25.6" section. Phase 7 actually implements `schemaVersion: 1` and a load-time migrator.

### A6. The `dev/` working copy has 9 timber-feature files invisible to the playbook

- **Reality:** `dev/js/02b-data-timber.js`, `02c-data-screws.js`, `02d-data-rothoblaas-rules.js`, `02e-catalogue-lookups.js`, `75-timber-conn-entities.js`, `77-screw-entity.js`, `78-connection.js`, `79-checks-timber.js`, `99-tmbr-autoload.js` — all live, all wired in `dev/index.html`, none in the playbook file map.
- **Plus:** `99-tmbr-autoload.js` is **exactly the autoloader the playbook explicitly says shouldn't exist** ("autoload demos, floating buttons … are not real features and don't ship"). It injects a red floating "🔩 Timber-screw example" button on every load and is gated by `let TMBR_AUTOLOAD_EXAMPLE = true`.
- **Fix:** Phase 1 documents the dev-only files in the playbook (with a clear "in flight, see `PlannedBuilds/timber-screws/`" caveat). Phase 2 executes `timber-screws/10-corrective-plan.md` Phase 5 — deletes the autoloader, the floating button, and the parallel `'timber-member'` / `'steel-plate'` entity types.

### A7. The "completed-plans" archive format contradicts the playbook example

- **Playbook example:** "Move the idea folder to `archive/completed-plans/<YYYY-MM-DD>_<idea>/` (date = ship date)" — folder-per-idea.
- **Reality:** `archive/completed-plans/` contains 8 flat `<YYYY-MM-DD>_<idea>.md` files plus a `README.md`. The README inside that folder is consistent with the file-format reality but contradicts the playbook.
- **Fix:** Phase 1 — pick one convention and document it in both places. Recommended: "single-file plans → `.md`, multi-file plans → `/` folder." Open Q4.

### A8. CHANGELOG references and in-source comments point at the old path

- **Reality:** 18 occurrences across 12 files reference `dev/feature-timber-screws/`. Verified locations: `dev/js/02b-data-timber.js:5`, `02c-data-screws.js:5`, `02d-data-rothoblaas-rules.js:5`, `02e-catalogue-lookups.js:8,292`, `05-state.js:16`, `07-globals.js:38`, `75-timber-conn-entities.js:5`, `77-screw-entity.js:6`, `78-connection.js` (2 refs), `79-checks-timber.js:5`, `dev/index.html` (2 refs), plus 4 entries in `CHANGELOG.md`. That folder no longer exists — content moved to `PlannedBuilds/timber-screws/` on 2026-05-18.
- **Fix:** Phase 1 — find/replace across `dev/js/*.js`, `dev/index.html`, `CHANGELOG.md`.

### A9. Several conventions are in the code but not the playbook

These are real conventions a fresh chat has to learn by grepping:

- **Sub-letter file numbering** (`02b`, `02c`, `02d`, `02e`, `23a`) for sibling modules at the same topical layer. Playbook says "Use a number that fits the load order" but doesn't mention the letter-suffix idiom.
- **The `tmbr` prefix** for the timber-screws feature is mentioned briefly in the playbook's "How to add a feature" step 7 — fine — but no other feature-prefix convention is documented.
- **The `view` field on every 2D entity** (`view: 'elevation'` etc.) — set by `mkEnt2D`, used by every renderer to find the right bucket — but missing from the variable-conventions table.
- **`drawingScale` and `viewport.zoom`** are layer-wide globals used by every drawer, but only `viewport.zoom` is in the conventions table.
- **`--timber-color` CSS variable** is referenced by `dev/js/75-timber-conn-entities.js:64` but never defined in `styles.css` (silent fallback to `--entity-color`).
- **`ROTHOBLAAS_RULESET_VERSION` stamp** on every Connection entity (`'rothoblaas-hbs-plate-eta-11-0030-2019'`) for forward-compat migrations — undocumented.
- **Demo objects identified by exact `section + length` match** in `99-tmbr-autoload.js:61-62` — fragile coupling to whatever `73-init.js` happens to seed.
- **Fix:** Phase 1 — add all of these to the playbook's "Variable conventions" or "How to add a feature" sections. The autoload demo-coupling is removed in Phase 2.

---

## Group B — Structural smells (medium leverage, fixed by Phases 3–6)

### B1. Parallel 3D/V25 implementations of the same algorithm

The single largest structural smell in the codebase. Each pair is a permanent maintenance liability — every new feature has to be implemented twice.

| Concept | 3D-mode implementation | V25 2D-mode implementation |
|---|---|---|
| Joint trim algorithm | `23a-shs-joints.js` `computeShsJoints` / `jointTrimsForMember` / `_computeEndCut` / `_computeButtCut` / `_faceCutLine3D` | `23a-shs-joints.js` `computeShsJointsV25` / `jointTrimsForMem2` / `_computeEndCutV25` / `_computeButtCutV25` / `_faceCutLineV25` |
| Auto-weld | `23-auto-weld.js` `drawAutoWelds` + `computeWeldInterfaces` | `23-auto-weld.js`'s call out to `drawV25AutoWelds` (separate impl) |
| Selection highlight | `36-selection-highlights.js` `drawSelHighlight` | `28-draw-block.js` calls `v25DrawSelectionHighlight` (separate impl in V25 layer) |
| Bolt rendering | `33-draw-bolt.js` `drawBolt` (full V14 hex/thread realism) | None yet — `v25-2d-bolts/` planning folder is adding it |
| Member rendering | `29-draw-ub.js`, `30-draw-shs.js`, `31-draw-section.js` (3D-mode only) | `68-v25-tools.js` `drawMem2D` (V25 only) |

**Fix:** Phase 6 unifies these by extracting a shared "render context" interface (frame, halfDepth, halfWidth, endpoints) that the 3D and V25 paths both produce, with one algorithm consuming the interface.

### B2. Per-axis duplication inside files (`U` vs `V` orientation pairs)

Same algorithm written twice with axes swapped. The signature pattern:

- `hexPointsAlongU` / `hexPointsAlongV` in `33-draw-bolt.js`
- `drawThreadAlongU` / `drawThreadAlongV` in `33-draw-bolt.js`
- `sectionA` / `planB` branches in `29-draw-ub.js`, `30-draw-shs.js`, `31-draw-section.js`, `32-draw-plate.js` — 60–80% byte-identical with axes swapped

**Fix:** Phase 6 — extract axis-vector + perp-vector helpers; the `v25-2d-bolts/` folder already plans this for bolt primitives.

### B3. Type-dispatch ladders that should be tables

Every new structural type forces edits across multiple files because the dispatch is `if obj.type === 'ub' / 'shs' / 'plate' / …`:

- `28-draw-block.js` lines 84–92 — 5-way obj.type ladder
- `23-auto-weld.js` `getObjThickness` / `getObjVolume` / `getObjFaces` — three 3-way ladders
- `34-draw-2d.js` — 22-way entity-type ladder in `drawEnt2D`
- `38-crosshair.js` — 7-way tool ladder
- `31-draw-section.js` — `p.shape` ladder × 3 views = 12 branches

**Fix:** Phase 6 — `RENDERERS_3D = { ub: drawUB, shs: drawSHS, … }` table mirrors a similar pattern at V25 in `69-v25-dispatch.js`.

### B4. Hand-rolled lineweights ignoring `LW`

The playbook is unambiguous: lineweights are `LW.thick/medium/thin/fine` × `ppm()`. Reality:

- `ctx.lineWidth = 0.5` for centrelines in `29-draw-ub.js` ×3, `30-draw-shs.js` ×4, `33-draw-bolt.js` ×4
- `ctx.lineWidth = 0.8` / `1.2` in `drawDim2D` (`34-draw-2d.js` ×4)
- `ctx.lineWidth = 1.5` in `36-selection-highlights.js` ×2
- `31-draw-section.js` uses `Math.max(0.25, LW.CL * pm)` correctly — *inconsistent with the others in the same layer*

**Fix:** Phase 6 — pass through every drawer and replace literals with `LW.* * ppm()`. Roughly one afternoon of focused work; ~20 sites; visual diff testable.

### B5. Scattered globals (Phase-2 priority #4 in the playbook)

The playbook says globals are scattered across `07-globals.js` and `05-state.js` "and others." The "and others" is significant — at least **6 more files** declare top-level mutable state:

- `52-cmd-palette.js` — cmd-palette UI state
- `55-mirror-tool.js` — mirror-tool live state
- `56-favourites.js` — favourites strip selection
- `57-chord-layer.js` — active chord-key
- `58-size-picker.js` — `lastUsedSection[type]` (referenced from many other files)
- `53-layers-panel.js` — layer panel UI state
- `48-connection-builders.js` — connection-wizard state

Plus `tmbrCurrentConnectionId` in `07-globals.js` (correctly placed), `_weldDialogLast` in `23-auto-weld.js` (incorrectly placed), `mitrePairs` in `23a-shs-joints.js` (incorrectly placed), V25 monkey-patch state in `72-v25-options-bar.js` (incorrectly placed by definition).

**Fix:** Phase 3 lifts all of these into a single `appState` object with documented sub-namespaces (`appState.tools`, `appState.v25`, `appState.drag`, `appState.ui`, etc.). Foundation for every later phase.

### B6. `39-events.js` is 1,601 lines (Phase-2 priority #1)

One function `initEvents` registers all canvas listeners. The mousedown/move/up/keydown trees dispatch all tools. This is the playbook's #1 refactor target and has grown ~186 lines since the modular split.

**Fix:** Phase 4 — split into a tool-handler dispatch table. Tool handlers live in `events/tool-*.js` (e.g. `events/tool-select.js`, `events/tool-line.js`, `events/tool-v25-mem.js`). Each handler exports `{ onMouseDown, onMouseMove, onMouseUp, onKey, … }`. `39-events.js` becomes ~150 lines of routing.

### B7. V25 monkey patches (Phase-2 priority #3)

`72-v25-options-bar.js` wraps `undo`, `v25Add`, `v25SetTool`, `v25TryHandleClick` by saving the original and assigning a new function. The wrapped function is in `72`, the original is in `42` / `69` / `69` / `69`. Fragile because order of execution matters and the wrapper is invisible to readers of the original.

**Fix:** Phase 5 — declare extension hooks (`v25TryHandleClick.before`, `v25Add.after`, etc.) and have `72` register handlers instead of wrapping.

---

## Group C — Smaller smells (low leverage, opportunistic fixes inside Phase 6)

- `_weldDialogLast`, `_weldInterfaceCache`, `_shsJointPopup` are module-private state inside `23-auto-weld.js` and `23a-shs-joints.js` — fine functionally but leaks into the global scope (classic scripts).
- Three identical inline modal CSS blobs across `23-auto-weld.js` (`showWeldPopup`), `23a-shs-joints.js` (`showJointPopup`, `showJointPopupV25`). Bypasses the theme system.
- `'system-ui'` and `'Segoe UI'` fonts hardcoded across the draw layer instead of a theme variable.
- Hardcoded pill colours (`'rgba(30,30,30,0.85)'`, `'#ffffff'`, …) in `38-crosshair.js` bypass the theme.
- `_clipPolygon` (Sutherland–Hodgman) is buried in `23a-shs-joints.js` instead of being a shared primitive.
- `ppm()` lives in `25-parametric-holes.js` but is used by every drawer. Wrong home.
- `memberFillAlpha` is defined in `29-draw-ub.js` but used by `drawSHS`, `drawSectionMember`, `drawPlate`. Wrong home.
- `rPolygon`/`rFillPolygon` (`33-draw-bolt.js`) use `[u,v]`-array convention; `rFillPoly` (`24-draw-primitives.js`) uses `{u,v}`-object convention. Two array shapes for the same primitive.
- `'use strict';` appears **twice** in `01-config.js` (lines 1 and 6) — harmless but indicative of sloppy modular-split.

---

## Headline summary (what an exec would see)

1. **The playbook is out of date by ~6 months of code growth.** Two files invisible to the file map, line counts wrong by hundreds of lines, the mirror command in README is broken, the rollback archive is empty, the CHANGELOG claims features that aren't in the code. Phase 1 of `09-build-plan.md` fixes all of this in one build chat with no code changes.
2. **The autoload anti-pattern is currently live in `dev/`.** Phase 2 executes the already-planned `timber-screws/10-corrective-plan.md` Phase 5 to remove it.
3. **The 2D-product side and 3D-product side share one flat `js/` directory with no formal boundary.** Phase 6 unifies the parallel implementations that have accumulated and `08-proposed-structure.md` formalises the boundary.
4. **The Phase-2 wishlist items from the playbook are all still needed** — events split (Phase 4), scattered globals (Phase 3), monkey patches (Phase 5), schema-version save format (Phase 7). The phasing order in `09-build-plan.md` sequences them by dependency.
