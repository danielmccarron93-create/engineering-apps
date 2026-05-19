# Proposed structure — file-number bands + layer-affiliation discipline

The aspiration is the subdirectory layout sketched at the bottom of `06-v25-v26-findings.md` (`shared/`, `three-d-studio/`, `two-d-studio/`). The reality is that moving files breaks every Files-touched declaration in every planning folder, every git-blame trail, and every IDE bookmark. The proposed structure below achieves 90% of the same clarity with **zero file moves**.

The discipline has three rules:

1. **File-number bands** that encode product affiliation in the file number itself.
2. **A mandatory layer comment** at the top of every file that names the affiliation explicitly.
3. **A single integration checklist** that's authoritative for both 2D-Studio and 3D-Studio additions, so build chats don't have to derive the wiring map from scratch each time.

---

## Rule 1 — File-number bands

The current flat `01-…74` numbering is treated as load order with implicit topical bands. Phase 1 formalises the bands and reserves number ranges for each. The bands match the actual current layout — this is recognising what's already there, not moving files.

| Band | Numbers | Layer | Affiliation |
|---|---|---|---|
| 1 | `01–08` | Config + data + state + coords | **shared** |
| 2 | `09–22` | Snap, projection, occlusion, frames, render-core | **shared** (mostly 3D today, but the V25 selection layer at 71 will eventually be promoted here) |
| 3 | `23–28` | Joints, primitives, hatch, rotation, dispatch | **shared** dispatchers + primitives |
| 4 | `29–33` | 3D-mode section renderers (UB, SHS, PFC/RHS/CHS/EA/UA, plate, bolt) | **3D-Studio only** |
| 5 | `34–38` | V22-era 2D entities + weld symbol + selection + view labels + crosshair | **mixed** (legacy mix; Phase 6 splits 34 along entity-family lines) |
| 6 | `39–47` | Events + tools + placement + clipboard + export + save/load + status | **shared** |
| 7 | `48–63` | Connection-wizard + sheet browser + project + UI palette + favourites + chord-layer + size-picker + inspector + tile-palette + library-shim + toolbar + layout | **shared UI** (mostly 3D-mode placement; V25-mode palette in 60 mirrors V26 BB-rail in 74) |
| 8 | `64` | Three.js iso engine | **3D-Studio only** |
| 9 | `65–72, 74, 76` | V25 2D-Studio core + V26 BB-rail + V25 plate | **2D-Studio only** |
| 10 | `73` | DOMContentLoaded bootstrap | **shared** |
| 11 | `02b-02e, 75, 77-79, 99` (dev-only) | Timber-screws feature in flight | **dev-only — see PlannedBuilds/timber-screws/** |

**Reserved ranges for future bands:**

- `15a–15z`, `28a–28z`, `33b–33z`, `34a–34z`: sub-letter file numbers for sibling modules at the same band/layer.
- `80–89`: reserved for future shared modules (autosave, schema migrator, undo-stack rework).
- `90–95`: reserved for future 3D-Studio expansion (timber 3D, slab 3D, brace 3D).
- `96–98`: reserved for future 2D-Studio expansion.
- `99`: reserved for bootstrap/init only (currently misused by autoloader; Phase 2 reclaims).

The bands are documented in `CLAUDE.md` immediately after the file map.

---

## Rule 2 — Mandatory layer comment in every file

Every `js/NN-*.js` file gets a 2-line comment after the `'use strict';`:

```javascript
'use strict';

// LAYER: 3D-Studio renderer (band 4) — see /CLAUDE.md "File-number bands"
// READS: objects3D, UB_DB, LW, ppm, withRotation, rLine, real2px, ctx
// WRITES: ctx (canvas state only)
//
// drawUB — render a 3D UB (I-section) in elevation/sectionA/planB
```

The mandatory fields are **LAYER** (which band + product affiliation) and **READS**/**WRITES** (the global-dependency surface). The free-text description follows.

The point of the READS/WRITES lines is to make the global-dependency surface visible inline so a fresh chat can answer "what does this file touch?" without grepping every name. They also feed Phase 3 (when globals get lifted into `appState`, the READS/WRITES lines describe the conversion contract).

Phase 1 adds the comment block to the **5 most-edited files** as a worked example:
- `28-draw-block.js`
- `34-draw-2d.js`
- `39-events.js`
- `68-v25-tools.js`
- `74-v26-bb-rail.js`

Subsequent feature builds add the block to any file they touch. The full sweep can happen incrementally — there's no rush.

---

## Rule 3 — Single integration checklist

The playbook currently has one integration checklist ("Adding a new member, fastener, or hatch type") written largely from the 3D-mode perspective. Phase 1 expands it into **two parallel checklists** sharing one structure:

### Adding a new 3D-Studio member

1. **Catalogue.** Add `<TYPE>_DB` to `02-data-sections.js` (or a sub-letter file for big catalogues).
2. **3D builder.** Add `v3dBuild<Type>` to `64-3d-engine.js` so the iso block renders the type. (Currently missing for PFC/RHS/CHS/EA/UA/WB — silent gap.)
3. **3D renderer.** Add a per-view drawer (`29/30/31/32`) or a branch in the unified `31-draw-section.js`.
4. **Type dispatch.** Add the type to the `RENDERERS_3D` table in `28a-render-3d-dispatch.js` (Phase 6 lands this table; until then, add a branch to the ladder in `28-draw-block.js`).
5. **Palette tile.** Add a tile to the 3D-mode Model palette in `60-tile-palette.js` `getPaletteDef().model`.
6. **Size picker.** Add a column config to `58-size-picker.js`.
7. **Inspector.** Add a property panel branch to `59-inspector.js`.
8. **Save/load.** Automatic via `objects3D` JSON.
9. **Export.** PDF (44) and DXF (45) usually pick up automatically; verify by exporting a test sheet.
10. **Quality check.** Render a test detail and compare side-by-side with the matching STP 6011 detail.

### Adding a new 2D-Studio entity (V25 paper-space)

1. **Catalogue (if applicable).** Add the catalogue to `02-data-*.js` or `65-v25-data-mode.js` for V25-specific catalogues.
2. **Decide: variant of existing entity type, or new type?** Default to extending `mem2` (any rectangular member) or `plate2` (any plate) or `anchor`/`screw` (fasteners). Only invent a new type if the structural concept genuinely doesn't fit.
3. **Renderer.** If `mem2` variant → add a `memberType` branch to `drawMem2D` in `68-v25-tools.js`. If new type → new file at band 9 (sub-letter numbering OK) with a `drawX2D` function.
4. **Type dispatch.** Add the type to `v25DrawEnt` in `69-v25-dispatch.js`.
5. **Defaults.** Add an entry to `V25_MEM_DEFAULTS` (for `mem2` variants) in `69-v25-dispatch.js`. New types get their own defaults registry.
6. **Palette tile.** Add a tile to the V26 BB-rail Members section in `74-v26-bb-rail.js` `getDrawTabDef()`.
7. **Size picker.** Add a column config to `58-size-picker.js` if the entity has a section catalogue.
8. **Options bar.** Add a branch to the top quick-options bar in `72-v25-options-bar.js`. (Post-Phase-5: register a hook instead of monkey-patching.)
9. **Inspector.** Add a property panel branch to `59-inspector.js`.
10. **Hit-test.** Extend `v25HitTestAll` in `71-v25-selection.js` (a single extension point introduced by the `click-cycle-selection/` build — Phase 4 generalises this pattern).
11. **Save/load.** Automatic via `entities2D[viewKey]` JSON. (Post-Phase-7: ensure the type is in the migration scaffold.)
12. **Export.** Add a branch to `45-dxf-export.js`. PDF usually picks up automatically because it uses the same draw fns.
13. **Quality check.** Render a test detail and compare side-by-side with the matching STP 6011 detail.

### Adding a new 2D-Studio entity that ALSO needs a 3D-mode equivalent

Run BOTH checklists. This is the case for genuinely-shared structural concepts (members, plates, bolts). Most architectural-detail entities (dimensions, leaders, hatches, callouts) are 2D-only and only need the second checklist.

---

## What "shared" means in the proposed structure

A file in a "shared" band must:

1. Have a **LAYER** comment that says `shared (band N)`.
2. Not name `objects3D`, `entities2D`, `tool`, `sheetMode`, or any specific entity type in its READS/WRITES list as a hard requirement. (Reading them via passed arguments is fine; depending on them as globals is the violation.)
3. Have at least one caller from each of the 3D-Studio and 2D-Studio bands (the empirical test of "is this shared?").

Files currently in shared bands that fail rule 3 (i.e., are misclassified):

- **`23-auto-weld.js`** — 3D-only detection in a shared band. Phase 6 splits it: detection moves to band 4, dialog stays in band 3.
- **`25-parametric-holes.js`** — 3D-only currently. Will become shared when `v25-2d-bolts/` adds plate2 holes.
- **`27-rotation-helper.js`** — 3D-only currently. Phase 6 generalises for V25 rotation.
- **`28-draw-block.js`** — actually shared (dispatcher). OK.

Files currently NOT in shared bands that probably should be (i.e., dual-affiliated):

- **`35-draw-weld.js`** — used by both modes via `entities2D` weld entities; technically band 5 but functionally shared.
- **`23a-shs-joints.js`** — explicitly mixed. Should be promoted to band 3 once Phase 6 unifies the algorithm.

These reclassifications are documentation only — file numbers stay the same.

---

## What this is NOT

- **NOT a TypeScript migration.** Classic scripts stay classic scripts. The READS/WRITES comments stand in for type signatures.
- **NOT an ESM migration.** No `import`/`export`. The global-flow-between-files pattern is preserved.
- **NOT a subdirectory move.** Files stay at `js/NN-name.js`. The band rule is policy on top of the existing flat structure.
- **NOT a rename.** Existing file numbers don't change. Future numbers fit the reserved bands.
- **NOT a build-system change.** No bundler, no compiler.

The bigger structural change to subdirectories is a deliberate Phase-8-or-beyond decision. It's a much larger break, and it's only worth doing once Phases 1–7 have settled the conventions. This restructure proposes the policy that, when subdirectory adoption happens, the moves are mechanical because the bands already declare where each file goes.

---

## Adoption sequence (cross-references `09-build-plan.md`)

- **Phase 1 (this restructure):** Adds the band rule to `CLAUDE.md`. Adds the LAYER comment to 5 worked-example files. Expands the integration checklist into 3D-Studio + 2D-Studio variants.
- **Phase 2 (timber-screws corrective):** Deletes the dev-only anti-pattern files; the band 11 (dev-only) row in the file map shrinks to just the legitimate catalogues (`02b-02e`) until those mirror to root too.
- **Phase 6 (deduplication):** Sub-letter file creation (`28a-render-3d-dispatch.js`, `15a-occlusion-clip.js`, `33b-draw-bolt-2d.js`, `34a-…34e-…`) all follow the band rule.
- **Future Phase 8 (subdirectories — out of scope):** Files move to `js/shared/`, `js/three-d-studio/`, `js/two-d-studio/`. The band rule means every file already knows where it goes.
