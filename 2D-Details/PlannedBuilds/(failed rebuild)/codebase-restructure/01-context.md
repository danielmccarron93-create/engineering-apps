# Context — the two-product framing

## Where StructDraw is heading

The first sentence of the playbook says StructDraw is "a single-engineer browser tool for producing AS 1100 / AS 4100 / AS 3600 / AS 1101 / AS 1252 compliant 2D structural details." That's still true of the daily-use product, but the long-term shape is bigger than that: this is becoming **two adjacent products sharing one codebase**.

- **2D-Studio — the Bluebeam competitor.** Paper-space drafting on an A1 sheet. The user picks tools from the V26 Bluebeam-style left rail (`74-v26-bb-rail.js`), places entities directly onto a single 2D view (`entities2D[viewKey]`), and produces a sheet that prints true-to-scale. The reference UX is Bluebeam Revu and the reference output is the STP Typical Structural Details PDF (page 85, details 6011.1–6011.6). This side is currently the more mature of the two — V25 added the entity model, V26 added the BB-rail palette, and the in-flight ideas (orientation-presets, v25-2d-bolts, click-cycle-selection) all extend this side.
- **3D-Studio — the Revit competitor.** A 3D structural model rendered through four canonical 2D views per sheet (Elevation, Section A, Plan B, Isometric). The user places 3D members (`objects3D`) that the app projects through each view. The iso block calls into the Three.js engine (`64-3d-engine.js`) for a flat-shaded structural render. This side is less mature — only `ub`, `shs`, `plate`, `bolt` are first-class today; PFC/RHS/CHS/EA/UA route through a unified `drawSectionMember`; WB is half-wired; timber has no 3D path at all. The integration checklist in the playbook is largely written for this side.

Both sides target the same user — a Senior Australian Structural Engineer producing connection and concrete details to AS Standards. The two sides solve different parts of the same daily workflow:

- 2D-Studio is for **typical-detail sheets** and **paper-only details** — blockwork details, anchor placements, reinforcement, timber connections, and the daily Bluebeam-style markup workflow. Fast to place, no 3D model maintenance.
- 3D-Studio is for **project-specific details derived from a 3D structural model** — a cap-plate that has to match the actual beam-to-column geometry, a splice that has to align with the projected member ends across four views.

The two are not equal-and-opposite. They serve different workflows and they have different correctness contracts. A 2D-Studio entity does not need to be projectable; a 3D-Studio member does. A 3D-Studio member doesn't need a paper-space rotation field; a 2D-Studio entity does.

## What "two products" means for the codebase

Today, `js/` is one flat directory with all 75 files numbered sequentially. The implicit numbering convention is "load order," not "topic" — `33-draw-bolt.js` is next to `34-draw-2d.js` because that's the order the original V22 monolith was split, not because they sit at the same layer or serve the same product.

This was fine when V25 was new and there were only ~50 files. It's now causing four observable problems:

1. **The flat list is no longer self-explanatory.** A fresh chat opening the file map has to internalise 75 file names with no grouping; the playbook tries to compensate with one-line descriptions, but those descriptions have already drifted (see `02-current-state-audit.md`).
2. **The 2D/3D boundary is ambient rather than declared.** No file states which product side it serves. The way you find out is by reading the file. Some files (`28-draw-block.js`, `34-draw-2d.js`, `23-auto-weld.js`, `23a-shs-joints.js`) genuinely straddle both; some are clearly one or the other; nobody knows which without checking.
3. **Parallel implementations are accumulating.** The drawing-primitives layer alone has four parallel 3D/V25 implementations: joint trimming (`23a-shs-joints.js` has two complete copies of the algorithm), auto-welds (`drawAutoWelds` vs `drawV25AutoWelds`), selection highlights (`drawSelHighlight` vs `v25DrawSelectionHighlight`), and member drawers (`drawUB`/`drawSHS`/etc. for 3D vs `drawMem2D` for V25). Each parallel pair is a permanent maintenance cost: every new feature has to be implemented twice. This is the single biggest structural smell the audit surfaced.
4. **Discovery via the integration checklist is getting longer.** The playbook's "Adding a new member, fastener, or hatch type" checklist already lists 9 touch points (`02-data-*.js`, `60-tile-palette.js`, `74-v26-bb-rail.js`, `69-v25-dispatch.js`, `58-size-picker.js`, `72-v25-options-bar.js`, the relevant drawer, save/load, inspector). It will grow if the structure isn't disciplined.

## What we are NOT trying to do

This planning folder is not a rewrite. It's not a Phase-3 commercial-release prep. It's not an ESM migration. It's not a TypeScript port. The codebase is good — the structural-engineering logic is correct, the AS-compliance defaults are defensible, the rendering quality (where it's wired up) matches STP 6011. The problem is **organisational, not algorithmic**.

The goal of this folder is: keep every line of working code, but draw lines around it that make the next 50 features easier to add than the last 50.

## How this folder is sequenced

The phased plan in `09-build-plan.md` runs in this order:

1. **Phase 1 — Docs realignment.** No code changes. Just make the playbook truthful. Fix the file map, the line counts, the broken mirror command, the `archive/v1/` claim, the CHANGELOG `schemaVersion` claim, the dev-only file list, the integration checklist with `screw`/`connection`/`bolt2` entries, the `tmbr` prefix convention, the sub-letter file numbering (`23a`, `02b`), the `view` field convention. This is a single build chat with a deterministic Files-touched list.
2. **Phase 2 — Execute the timber-screws corrective plan.** This is `PlannedBuilds/timber-screws/10-corrective-plan.md` Phase 5: delete the `99-tmbr-autoload.js` autoloader + floating button, delete the parallel `'timber-member'` / `'steel-plate'` entity factories in `75-timber-conn-entities.js`, reroute timber to a `mem2 + memberType:'timber'` variant and steel plate to a `plate2` variant, add TIMBER + HBS SCREW tiles to both palettes per the integration checklist. Single build chat, all already-planned.
3. **Phase 3 — Lift the scattered globals into `appState`.** Playbook's Phase-2 priority #2. Foundation for every subsequent refactor. ~25 mutable globals across 8 files become `appState.tools.<x>`, `appState.v25.<x>`, `appState.drag.<x>`, etc. Big diff but no behavioural change.
4. **Phase 4 — Split `39-events.js` into a tool-handler dispatch table.** Playbook's Phase-2 priority #1. Easier after Phase 3 because the tool handlers can declare their own state ownership.
5. **Phase 5 — Remove V25 monkey patches in `72-v25-options-bar.js`.** Replace with proper extension hooks declared on `undo`, `v25Add`, `v25SetTool`, `v25TryHandleClick`. Cleaner after Phase 3.
6. **Phase 6 — Unify the parallel 3D/V25 implementations.** The biggest leverage item. Joint trimming, auto-welds, selection highlights become single algorithms parameterised on a "render context" (3D frame vs V25 frame). Hex/thread bolt primitives become axis-agnostic and serve both the 3D `drawBolt` and the future V25 `drawBolt2D`.
7. **Phase 7 — Schema-version save format + autosave.** Playbook's Phase-2 priorities #4 and #5. Reconciles the CHANGELOG `schemaVersion` claim with reality.

Phase 1 is the smallest and most urgent — it costs almost nothing and unblocks every fresh-chat that opens the playbook. Phases 2–7 are sequenced so each builds on the previous, but **each phase is a separate build chat with its own files-touched list**. None of them require all the others to be in place first.
