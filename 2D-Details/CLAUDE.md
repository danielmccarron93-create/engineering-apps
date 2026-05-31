# StructDraw — Project Playbook

**Active.** Read end-to-end before changing anything. This file replaces the now-archived `HANDOFF_V2.md` (which described an abandoned Bluebeam-shell rewrite).

> **Architecture status (2026-05-30): the `architecture-v2` layered rebuild was ABANDONED.** It tried to grow a clean `js/v2/` Model/View/Render/Tool/Engine tree alongside v1 and migrate features across, but its plate pilot retired the mature v1 plate path before the v2 plate could weld/rotate/resize/edit — degrading plates badly enough that the whole rebuild wasn't worth it. **One fragment survived and is LIVE: the v2 plate path.** 2D-mode plates are v2; `js/76-v25-plate.js` is deleted; the v2 plate was rescued to working in `js/v2/tools/edit-plate.js` (+ re-injection into v1 auto-weld). **Everything else is v1** — bolts are flag-gated off (`js/v2/feature-flags.js` → `useV2For.bolts=false`); members/timber/joints/annotations were never migrated. So: do **not** resume the rebuild, do **not** revert the v2 plate, and treat the `js/v2/` tree as "live plate path + dormant scaffolding," not active work. The rebuild's planning folders are parked in `PlannedBuilds/(failed rebuild)/`. The governing lesson — never retire a working path before its replacement is at full parity — is baked into the "Adding a new member" checklist below.

---

## What this app is

**StructDraw** is a single-engineer browser tool for producing AS 1100 / AS 4100 / AS 3600 / AS 1101 / AS 1252 compliant 2D structural details. Dan McCarron builds it in his evenings to do at work what he otherwise hands to a drafter or does in Bluebeam Revu.

Long-term goal: a commercial product sold to Australian structural engineers. Today: Dan's daily tool, expanding capability with each session.

The app produces one or more A1 detail sheets. Each sheet has up to four "detail blocks" (Elevation, Section A, Plan B, Isometric) projected from a shared 3D object model. A separate per-sheet 2D mode (V25 paper-space) lets the user draw blockwork details, anchor placements, and reinforcement directly without a 3D model behind them.

Source standards (non-negotiable, all metric): **AS 1100** (drawing), **AS 4100** (steel), **AS 3600** (concrete), **AS 1101** (welds), **AS 1252** (bolts), **NCC** when relevant.

---

## Target user, quality bar, two-mode requirement (read every time)

**Target user.** The user is a senior Australian structural engineer producing connection and concrete details to AS Standards. The default reader of every output is another senior engineer who will sign-and-issue the drawing. Defaults must be defensible. Every dimension and capacity should be traceable to its clause or table source. The user is not an architect, not a renderer, not a generic CAD operator — design choices that don't serve a structural engineer's signing-the-drawing workflow are noise.

**Quality bar.** The reference is the **STP Typical Structural Details PDF page 85, details 6011.1–6011.6** — cap-plate, baseplate, splice, portal frame, web-side-plate, tilt-up. If a feature produces output that's visibly worse than STP 6011 — wrong lineweight, missing hatch, bad label placement, ugly leader, dimension on the wrong side — the feature isn't done. This bar applies from the first phase of every feature, not as a polish step at the end.

**Two-mode requirement.** The app has two parallel drawing modes and **every new structural member, fastener, or hatch type must work in both:**

- **3D mode** — model-first. Structural objects (UB, SHS, plates, bolts, …) live in `objects3D` as 3D geometries. The app projects them through four views per sheet (Elevation, Section A, Plan B, Isometric). The Model-tab palette in `60-tile-palette.js` (function `getPaletteDef()`, group `model`) is where the user picks them.
- **2D mode (V25 paper-space)** — paper-first. Entities live in `entities2D[viewKey]` and are drawn directly on the sheet without a 3D model. Used for blockwork details, anchor placements, reinforcement, timber connections. The V26 BB-rail Draw tab in `74-v26-bb-rail.js` (function `getDrawTabDef()`, "Members" section) is where the user picks them.

A new structural feature gets palette tiles in **both** of these locations and behaves like every other member in both modes. Feature-visibility shortcuts — autoload demos, floating buttons, side panels, pop-up "welcome" dialogs — are not real features and don't ship. The palette is the discoverable surface. If the tile is in the palette with the right icon and label, the feature is discoverable.

---

## Project structure (post-modular-split 2026-05-02, post-PlannedBuilds-restructure 2026-05-18)

```
2D-Details/
├── index.html                      the app shell (~1,300 lines)
├── CLAUDE.md                       this file — the project playbook
├── README.md                       quick-start orientation
├── CHANGELOG.md                    version notes
│
├── PlannedBuilds/                  canonical home for in-flight planning (NEW 2026-05-18)
│   ├── README.md                   the dashboard — every idea + status + files touched
│   ├── _TEMPLATE/                  skeleton folder; copy when starting a new idea
│   ├── orientation-presets/        the only in-flight idea — V25 orientation icon-row
│   └── (failed rebuild)/           PARKED — abandoned architecture-v2 rebuild + absorbed ideas (2026-05-30)
│
├── css/
│   └── styles.css                  ~1,500 lines, 5 themes, all CSS tokens
│
├── js/                             classic <script> files (01-99) + the v2/ tree
│   ├── 01-config.js                A1 sheet config, drawing area
│   ├── 02-data-sections.js         UB/UC/SHS/PFC/RHS/CHS/EA/UA catalogues
│   ├── 03-data-bolts.js            AS 1252 bolt catalogue + connection defaults
│   ├── 05-state.js                 feature flags + 3D model + project model
│   ├── 06-detail-block.js          DetailBlock class + projection fns
│   ├── 07-globals.js               canvas/ctx/viewport/blocks/tool/drag-state
│   ├── 08-coords.js                s2px/px2s/real2px/px2real + colour utils
│   ├── 09-snap.js                  snapUV, getCursor, getObjSnapPoints
│   ├── 10-bounds-hittest.js        AABB / hit-test / blockAtPixel
│   ├── 11-grip-handles.js          grips, applyGripDrag, applyRotation
│   ├── 12-edge-snap.js             edge-snap with visual indicator lines
│   ├── 13-projection-lines.js      between-view alignment
│   ├── 14-section-cuts.js          draggable cut indicators
│   ├── 15-occlusion.js             depth-aware hidden lines
│   ├── 16-live-section-cut.js      cut classification
│   ├── 17-fillet-chamfer.js        V22.4 helpers (stub)
│   ├── 18-section-profile.js       V22.1 unified profile helper
│   ├── 19-member-frame.js          V24 frame math + 24 ortho presets
│   ├── 20-render-proxy.js          V24 per-view rendering proxy
│   ├── 21-bolt-grip.js             V14 bolt grip auto-detection
│   ├── 22-render-core.js           render() / requestRender / drawSheet
│   ├── 23-auto-weld.js             V14 auto-weld detection + popup (682 lines)
│   ├── 23a-shs-joints.js           SHS/RHS/CHS mitre + priority-joint trimming, 3D + V25 (1,182 lines)
│   ├── 24-draw-primitives.js       rLine etc. + V17 sketch wobble
│   ├── 25-parametric-holes.js      bolt-driven hole computation
│   ├── 26-as1100-hatch.js          steel cross-hatching
│   ├── 27-rotation-helper.js       canvas rotation wrapper
│   ├── 28-draw-block.js            block content dispatcher + view markers
│   ├── 29-draw-ub.js               drawUB
│   ├── 30-draw-shs.js              drawSHS
│   ├── 31-draw-section.js          unified renderer (PFC/RHS/CHS/EA/UA)
│   ├── 32-draw-plate.js            drawPlate
│   ├── 33-draw-bolt.js             drawBolt + AS 1100 realistic primitives
│   ├── 34-draw-2d.js               drawEnt2D + V22.5/V22.6 entities (981 lines)
│   ├── 35-draw-weld.js             AS 1101 weld symbol
│   ├── 36-selection-highlights.js  selection highlights
│   ├── 37-view-labels.js           view labels
│   ├── 38-crosshair.js             crosshair + click preview
│   ├── 39-events.js                initEvents (1,601 lines — Phase 2 target)
│   ├── 40-placement.js             component placement, two-click, polygon
│   ├── 41-tools.js                 tool state + setTool
│   ├── 42-keyboard.js              initKeyboard
│   ├── 43-clipboard.js             paste / paste-in-place
│   ├── 44-pdf-export.js            raster + vector + canvas shim (632 lines)
│   ├── 45-dxf-export.js            full DXF emission (800 lines)
│   ├── 46-save-load.js             single-sheet JSON save/load
│   ├── 47-status-bar.js            updateStatus
│   ├── 48-connection-builders.js   V16 cap plate / baseplate / splice / WSP
│   ├── 49-sheet-browser.js         V19.5 sheet browser sidebar
│   ├── 50-project.js               V19.5 multi-sheet save/load
│   ├── 51-multi-page-pdf.js        V19.5 multi-page PDF
│   ├── 52-cmd-palette.js           V20 Ctrl+K palette
│   ├── 53-layers-panel.js          V20 layer visibility
│   ├── 54-kbd-help.js              V20 keyboard help
│   ├── 55-mirror-tool.js           V20 mirror tool
│   ├── 56-favourites.js            V21 favourites strip
│   ├── 57-chord-layer.js           V21 chord layer (M/D/A/H/B/K/W)
│   ├── 58-size-picker.js           V21 size-picker dropdown
│   ├── 59-inspector.js             V21 inspector + V24.A3 orientation preview
│   ├── 60-tile-palette.js          V21 mode-filtered tile grid
│   ├── 61-library-shim.js          V20 legacy library shim
│   ├── 62-toolbar.js               initToolbar + dispatch
│   ├── 63-layout.js                fitToView + layoutBlocks + resize
│   ├── 64-3d-engine.js             Three.js r128 iso engine (468 lines)
│   ├── 65-v25-data-mode.js         V25 catalogues + mode switching
│   ├── 66-v25-helpers-frame.js     V25 entity helpers + detail frame
│   ├── 67-v25-materials.js         V25 hatch patterns (601 lines)
│   ├── 68-v25-tools.js             V25 placement tools (1,403 lines)
│   ├── 69-v25-dispatch.js          V25 dispatch + 2D-mode palette + chords
│   ├── 70-v25-render.js            V25 lineset + text + swatch previews
│   ├── 71-v25-selection.js         V25 selection / hit-test / drag (1,484 lines)
│   ├── 72-v25-options-bar.js       V25 quick options + 4 monkey patches
│   ├── 73-init.js                  DOMContentLoaded bootstrap
│   └── 74-v26-bb-rail.js           V26 BB-rail IIFE (registers AFTER 73-init)
│   (Number 76 was 76-v25-plate.js — V25 2D-mode plate2 entity, 422 lines.
│    Deleted on 2026-05-22 when 2D-mode plates moved to the v2 path
│    (js/v2/tools/place-plate-tool.js). The wider architecture-v2 rebuild was
│    later ABANDONED; this plate migration is the one part kept. Number reserved.)
│
├── archive/
│   ├── snapshots/                  point-in-time backups (gitignored)
│   │   ├── 2026-04-29_pre-v25-backup.html
│   │   ├── 2026-05-01_pre-layout-overhaul.html
│   │   └── 2026-05-02_pre-modular-split.html  ← rollback for the split itself
│   ├── completed-plans/            shipped-build planning docs, date-prefixed (2026-05-18)
│   │   ├── README.md               index of what each archived plan was
│   │   ├── 2026-MM-DD_<idea>.md    single-file plan archived as a flat .md
│   │   └── 2026-MM-DD_<idea>/      multi-file plan archived as a folder
│   └── handoff_v2_abandoned.md     stale, kept for context
│
├── Images/                         section thumbnails (PNG)
├── Thumbnails-SVG/                 SVG previews
├── design-handoff/                 V25 design integration tracking (kept)
└── .claude/                        Claude Code settings + git worktrees
```

*File-map as of 2026-05-30. `js/` has 83 numbered classic-script files (`01`–`99`, including the sub-letter `23a`) plus the `v2/` tree. The `v2/` tree is the residue of the **abandoned** architecture-v2 rebuild (see the Architecture-status note at the top, and `PlannedBuilds/(failed rebuild)/architecture-v2/`): it is now just the LIVE 2D-mode plate path plus dormant flag-gated scaffolding — not active migration work. Nine of the numbered files are the **parked** timber-screws feature — see "Parked feature files" below. Number 76 (`76-v25-plate.js`, the old V25 2D plate entity) was deleted on 2026-05-22 — 2D-mode plates are v2.*

**Parked feature files (timber-screws).** `js/` carries nine files for the unfinished Rothoblaas HBS timber-screw connection feature: timber catalogues `02b-data-timber.js` / `02c-data-screws.js` / `02d-data-rothoblaas-rules.js` / `02e-catalogue-lookups.js`; entity modules `75-timber-conn-entities.js` / `77-screw-entity.js` / `78-connection.js`; rule engine `79-checks-timber.js`; and `99-tmbr-autoload.js`. The feature is **parked** — its planning folder moved to `PlannedBuilds/(failed rebuild)/timber-screws/` when the rebuild was abandoned (it had been re-scoped as a rebuild phase). The code files remain in the tree but are not active work; if revived, the feature would be re-planned as a standalone v1 feature. ⚠ `99-tmbr-autoload.js` is an autoload demo + floating button of exactly the kind this playbook says doesn't ship — a safe deletion candidate on any cleanup pass.

---

## File-number bands

The flat `01`–`79` numbering encodes topical bands. The bands below are policy on top of the existing layout — **no file moves** — so a fresh chat can place a new file by number and know its product affiliation.

| Band | Numbers | Layer | Affiliation |
|---|---|---|---|
| 1 | `01–08` | Config, data, state, coords | shared |
| 2 | `09–22` | Snap, projection, occlusion, frames, render-core | shared |
| 3 | `23–28` | Joints, primitives, hatch, rotation, block dispatch | shared |
| 4 | `29–33` | 3D-mode section renderers (UB, SHS, PFC/RHS/CHS/EA/UA, plate, bolt) | 3D-mode only |
| 5 | `34–38` | V22-era 2D entities, weld symbol, selection, view labels, crosshair | mixed |
| 6 | `39–47` | Events, tools, placement, clipboard, export, save/load, status | shared |
| 7 | `48–63` | Connection wizard, sheet browser, project, UI palette, inspector, toolbar, layout | shared UI |
| 8 | `64` | Three.js iso engine | 3D-mode only |
| 9 | `65–72, 74` | V25 2D-mode core + V26 BB-rail (number 76 retired by architecture-v2 Phase 2 on 2026-05-22 — plates are v2-authoritative via `js/v2/tools/place-plate-tool.js`) | 2D-mode only |
| 10 | `73` | DOMContentLoaded bootstrap | shared |
| 11 | `02b–02e, 75, 77–79, 99` | Parked timber-screws feature | parked — see `PlannedBuilds/(failed rebuild)/timber-screws/` |

**Sub-letter numbers** (`02b`, `23a`, …) are sibling modules at the same band — they let a file slot in without renumbering everything after it. Reserved ranges: `80–89` future shared modules, `90–95` future 3D-mode, `96–98` future 2D-mode, `99` bootstrap/init only.

A per-file `LAYER:` header comment (naming the band plus the file's global READS/WRITES surface) was introduced by the now-abandoned architecture-v2 rebuild and survives only on the existing `js/v2/` files. v1 files are not retrofitted with it, and since the rebuild is parked there is no plan to roll it out further.

---

## Workflow rules (non-negotiable)

1. **One source tree — edit `index.html`, `js/`, `css/` directly.** There is no `dev/` copy and no mirror step. Git is the staging and the backup: the uncommitted working tree is "in progress", a commit is a checkpoint, and `git push` is the off-machine backup. Test in a browser before committing.
2. **Dan handles all git commits and pushes himself.** Don't stage, commit, push, or branch. Leave the working tree clean.
3. **No build step.** Open `index.html` in a browser and it runs. No bundler, no npm, no transpiler. Three.js r128 + jsPDF 2.5.1 via CDN.
4. **Metric only.** Y is up in world coordinates, down on canvas (flipped in `real2px`).
5. **Australian Standards only:** AS 1100, AS 4100, AS 3600, AS 1101, AS 1252, NCC.
6. **Three.js r128 only** — do not use APIs introduced after r128 (e.g. `CapsuleGeometry`).
7. **Each `js/NN-name.js` file starts with `'use strict';`** — classic scripts are per-file strict, so missing this changes behaviour.
8. **All scripts are classic `<script>`, NOT `<script type="module">`.** Globals flow between files. Don't add `export`/`import`.
9. **Bug fixes do not bundle with structural refactors.** A bug fix touches one module; it doesn't get rolled into reorganisation work.
10. **Do not delete `archive/snapshots/`.** The dated HTML backups there are the rollback path of last resort.

## Variable conventions

| Prefix / suffix | Meaning |
|---|---|
| `u, v` | view-local 2D coordinates (real-world mm) |
| `x, y, z` | world 3D coordinates (real-world mm) |
| `px, py` | screen pixels |
| `sx, sy` | sheet-mm (paper space, A1 = 841×594) |
| `r` prefix on draw fns (e.g. `rLine`) | draws in real-world coords |
| `v3d` prefix | Three.js 3D engine member |
| `v25` prefix | V25 2D-Studio module member |
| `bb` prefix | V26 Bluebeam-style left rail |
| `tmbr` prefix | in-flight timber-screws feature member |
| `view` field | on every 2D entity (`view: 'elevation' \| 'sectionA' \| …`) — set by `mkEnt2D`; names the `entities2D[viewKey]` bucket the entity renders into |
| `drawingScale` | layer-wide global — the active sheet's drawing scale; read by every drawer alongside `viewport.zoom` |

**Other conventions a fresh chat should know:**

- **Sub-letter file numbers** (`02b`, `23a`) — sibling modules at the same band; see "File-number bands" above.
- **Load-order IIFEs.** `74-v26-bb-rail.js` is an IIFE that registers its UI *after* `73-init.js`'s `DOMContentLoaded` bootstrap has finished — a deliberate "register after init" pattern, not a numbering accident.
- **`--timber-color` theme variable.** The timber-screws feature reads a `--timber-color` CSS custom property for timber grain/fill. It is **not yet defined** in `css/styles.css`, so the lookup currently falls back to `--entity-color`; the decided value is warm tan `#d2a76a` per theme, to be added to all five themes when the timber-screws feature is finished.
- **`ROTHOBLAAS_RULESET_VERSION` stamp.** Every timber `connection` entity carries a ruleset-version string (`'rothoblaas-hbs-plate-eta-11-0030-2019'`) so future rule changes can migrate older saved connections forward.

## AS 1100 lineweights (constant `LW`)

`{ thick: 0.70, medium: 0.35, thin: 0.18, fine: 0.13 }` (mm). Cuts are thick, visible edges medium, hidden / centre / dimensions thin, construction fine.

---

## Testing & shipping

No build step, no staging copy. Open `index.html` in a browser to test (or
`python3 -m http.server` if `file://` causes issues). When it works, Dan commits
and pushes — git history is the backup and the record of what shipped.

---

## Two-chat workflow for new features

Feature work is done across **two separate chat sessions** so the planning thinking doesn't drift into half-thought-through code. The split is deliberate — plan chats reward depth, scepticism, and considering the idea from the future user's perspective; build chats reward focused execution, testing, and not introducing scope creep. The two operating modes shouldn't share a chat.

**1. Plan chat.** Dan opens a chat (in Cowork or Claude Code), describes the idea, and asks for a plan in plan mode. The chat's job is to:

- Read the existing code thoroughly — every integration point in the V25 / V26 BB-rail palette, every existing entity type that might fit, every catalogue / picker / options-bar wiring.
- Think hard about the idea from the perspective of an Australian structural engineer who will use this daily — not as an abstract product feature, but as a tool in a real-day workflow.
- Identify every UI surface the feature touches: 3D-mode palette (`60-tile-palette.js`), 2D-mode V26 BB-rail (`74-v26-bb-rail.js`), size picker (`58-size-picker.js`), options bar (`72-v25-options-bar.js`), inspector (`59-inspector.js`), save/load (`46-save-load.js`), export (`44-pdf-export.js`, `45-dxf-export.js`).
- Produce or update a planning folder at `PlannedBuilds/<idea>/` containing: README, context, design (data model + architecture + integration points), build plan, open questions, test cases (for ideas with logic). Larger ideas can split further; smaller ones can collapse files. See `PlannedBuilds/(failed rebuild)/timber-screws/` for a canonical example of a fully fleshed-out folder (parked now, but still a good structural template) — ten markdown files covering everything from EN/ETA rule research through to numbered test fixtures with exact expected outputs.
- Declare the "Files touched" list in the idea's `02-design.md` (or equivalent) — every `js/NN-*.js`, `index.html`, `css/styles.css` the build will modify. Updates the dashboard table in `PlannedBuilds/README.md` for multi-build conflict detection.
- Surface every open question for Dan to answer before any code is written. Recommend one option per question. Don't proceed if a blocking question is unanswered.

**No code is written in the plan chat.** Even if the plan is fully locked, the build happens in the next chat. Documentation files (`CLAUDE.md`, `PlannedBuilds/<idea>/*.md`, `CHANGELOG.md`) can be edited in a plan chat — they're planning artefacts, not code.

**2. Build chat.** Dan opens a fresh chat and points it at the planning folder(s). The build chat:

- Reads `CLAUDE.md` (this file) + `PlannedBuilds/README.md` + `PlannedBuilds/<idea>/README.md` end-to-end on first load.
- Confirms every open question is answered before starting Phase 1.
- Walks the build plan phase by phase, testing at each boundary (`node --check` on every new JS file, headless verification via the existing test patterns, browser smoke-tests through `index.html`).
- Updates the planning folder's progress tracker after each phase.
- Stops at planned phase boundaries — does not silently extend scope.

**Multi-idea build chats.** A single build chat can be pointed at multiple `PlannedBuilds/<idea>/` folders at once. The first task in that case is to produce a *consolidation plan* — cross-check the "Files touched" lists, identify overlaps, propose a unified phase ordering that avoids touching the same file twice with conflicting intent. The chat then executes the consolidated plan, updating each idea's progress tracker independently so the state of each remains legible.

**3. Review.** Dan reads the diff, smoke-tests `index.html` in the browser, comes back with comments.

**4. Iterate.** A short follow-on chat (or the same build chat) addresses the comments.

**5. Commit & push.** Once Dan has reviewed the diff and browser-tested, he commits and pushes — git history is the record of what shipped. Update the dashboard table in `PlannedBuilds/README.md` to reflect the new status.

**6. Archive on ship.** Once the feature has shipped, move the idea's planning docs to `archive/completed-plans/` (date = ship date) — a single-document plan as a flat `<YYYY-MM-DD>_<idea>.md` file, a multi-file folder as `<YYYY-MM-DD>_<idea>/`. Remove its row from the in-flight dashboard, and add a one-line summary to `archive/completed-plans/README.md`.

---

## How to add a feature (build-chat micro-process)

This is the per-step micro-process for a build chat. The plan chat's deliverable is the `PlannedBuilds/<idea>/` folder per the Two-chat workflow above — by the time these steps run, that folder exists and is authoritative.

1. **Read this file end-to-end.** Especially the variable conventions, the file map, the "Target user / quality bar / two-mode requirement" section, and the "Adding a new member, fastener, or hatch type" integration checklist below.
2. **Read the feature's planning folder** (`PlannedBuilds/<idea>/README.md` + the supporting markdown files) and confirm every open question is answered. Cross-check the dashboard at `PlannedBuilds/README.md` for any other in-flight ideas that touch the same files.
3. **Identify which `js/NN-*.js` file the change belongs in.** If it doesn't fit, that's a signal the file boundaries need a tweak — flag it before adding a new file.
4. **Make the change in `js/NN-*.js`.** Run `node --check` on the file.
5. **Open `index.html` in a browser.** DevTools console must stay clean.
6. **Test the feature manually.** Click everything that touches it — in both 2D and 3D modes if it's a structural member or fastener.
7. **If you change global state** (e.g. add a new top-level `let`), it goes in `js/07-globals.js` — NOT scattered. Use a feature-specific prefix (e.g. `tmbr` for the timber-screw feature).
8. **Update `CHANGELOG.md`** with one line per user-visible change.
9. **Update the planning folder's progress tracker** with what was completed and any deviations.
10. **Hand off to Dan for review — he commits and pushes.**

## How to fix a bug

Same as above, but skip step 7 unless the bug fix changes user-visible behaviour.

## What goes in a new file

Create a new `js/NN-*.js` only when:

- The change is ≥150 lines AND topically distinct from any existing file.
- The change is a self-contained module (IIFE-wrapped or pure function set with no shared state).

If the change is < 150 lines or extends an existing concept, add it to the existing file.

Use a number that fits the load order. Gaps allow inserts without renumbering. Don't reuse a retired number.

---

## Adding a new member, fastener, or hatch type — integration checklist

This is the checklist that would have prevented the timber-screw Phase-4 misstep (a parallel `SteelPlate` entity was invented when V25 `plate2` was the right tool, a `TimberMember` entity was invented when V25 `mem2` with `memberType: 'timber'` was the right shape, and an autoloader + floating button were added to make the feature "visible" instead of wiring tiles into the existing palette).

**Before writing any code, in the plan chat:**

1. **Read the V25 entity types.** They cover most structural concepts already:
   - `mem2` (V25 member, `68-v25-tools.js`) — any rectangular structural member with a section catalogue and a long axis. UB, UC, SHS, PFC, RHS today; timber GLT slots in as `memberType: 'timber'`.
   - Plates — **v2-authoritative**, and the ONE element the abandoned rebuild migrated and that was rescued to working. 2D-mode plates live in the `js/v2/` tree: families register in `js/v2/catalogues/families/` (e.g. `plate-flat.js`); placement is `js/v2/tools/place-plate-tool.js`; rotate/vertex/body editing is `js/v2/tools/edit-plate.js`; the v26 BB-rail Plate tile routes to `v2.ui.paletteBBRail.activatePlate()`. Do NOT add a `plate2` v1 entity (deleted) AND do NOT revert plates to v1 (Dan spent several chats rescuing this path). This v2 plate path is the only live piece of the rebuild — it is NOT a template for migrating other element types; everything else stays v1. Background: `PlannedBuilds/(failed rebuild)/architecture-v2/12-plate-fix-plan.md`.
   - `screw`, `connection` — the (parked) timber-screws fastener + connection-grouping types; the entity code exists in the tree but the feature is parked (see `PlannedBuilds/(failed rebuild)/timber-screws/`).
   - `anchor`, `mat` (hatch material), `blockWall`, `reoBar`, `mesh`, `leader2`, `frame` — the other established 2D entity types.
2. **Decide: variant of an existing type, or a new type?** Default to extending an existing type if the structural concept fits. A new structural member is almost always a `mem2` variant. A new plate family is almost always a new entry in `js/v2/catalogues/families/` reusing the v2 `plate-flat` patterns. A new fastener gets its own type only if it has a distinct interaction model (e.g., the existing `screw` type — single-click placement, fastener catalogue rather than section catalogue, parallels `anchor`). Don't invent a parallel type for something that fits `mem2` or the v2 plate family. If a new type is genuinely needed, justify it in the planning folder's `02-data-model.md`.
3. **Both modes are mandatory.** Place a tile in the 3D-mode Model palette (`60-tile-palette.js` `getPaletteDef().model`) AND the 2D-mode V26 BB-rail Members section (`74-v26-bb-rail.js` `getDrawTabDef()`). Test placement and rendering in both. A feature that only works in one mode is incomplete and doesn't ship.
4. **Map every integration point in the planning folder before coding.** The wiring differs by mode. A genuinely-shared structural concept (member, plate, fastener) is wired through *both* lists below; a 2D-only entity (dimension, leader, hatch, callout) needs only the 2D-mode list.

   **3D-mode (model-first) wiring:**
   - `js/02-data-*.js` — its catalogue (section sizes, mechanical params).
   - `js/64-3d-engine.js` — its `v3dBuild<Type>` so the iso block renders it.
   - `js/29`–`33` — its per-view drawer, or a branch in the unified `31-draw-section.js`.
   - `js/28-draw-block.js` — its branch in the block-content dispatcher.
   - `js/60-tile-palette.js` — its tile in the 3D-mode Model palette (`getPaletteDef().model`).
   - `js/58-size-picker.js` — its size-picker column, if it has a section catalogue.
   - `js/59-inspector.js` — its properties panel.
   - Export — PDF (`44`) and DXF (`45`) usually pick it up automatically via the shared draw fns; verify with a test sheet.

   **2D-mode (V25 paper-space) wiring:**
   - `js/02-data-*.js` or `65-v25-data-mode.js` — its catalogue.
   - The renderer — a `memberType` branch in `drawMem2D` (`68-v25-tools.js`) for a `mem2` variant, or a `drawX2D` function in its own band-9 file for a new type.
   - `js/69-v25-dispatch.js` — its `V25_MEM_DEFAULTS` entry (`mem2` variant), or its `v25TryHandleClick` branch (new tool path, e.g. `v25-screw`).
   - `js/74-v26-bb-rail.js` — its tile in the V26 BB-rail "Members" section (`getDrawTabDef()`).
   - `js/58-size-picker.js` — its size-picker column, if it has a section catalogue.
   - `js/72-v25-options-bar.js` — its branch in the top quick-options bar (Section / Aspect / Thk / Spec).
   - `js/71-v25-selection.js` — its hit-test and grip handles.
   - `js/59-inspector.js` — its properties panel.
   - `js/45-dxf-export.js` — its DXF branch. Save/load is automatic via `entities2D[viewKey]` JSON; PDF picks up the shared draw fns.

   **2D-mode plates (v2-authoritative — different wiring):** plates are the one element that lives on the v2 path. For a new PLATE family, wire through the v2 layer instead of the V25 paper-space:
   - `js/v2/catalogues/families/<plate-family>.js` — new family in the v2 catalogue (e.g. mirror `plate-flat.js`).
   - `js/v2/tools/place-plate-tool.js` — already supports any plate-flat family/type via `appState.ui.activePlateFamily` / `activeType`; usually no edit needed.
   - `js/74-v26-bb-rail.js` — the existing Plate tile already routes to `v2.ui.paletteBBRail.activatePlate()`; extend with new tiles only if the new family needs its own button.
   - `js/v2/ui/inspector-plate.js` — extend if the new family carries family-specific fields.
   - Save/load is automatic via `v2.io.save.previewSavePayload` + `v2.io.load`.
5. **AS 1100 lineweights, always.** Use the `LW` constants in `03-data-bolts.js`. Cuts heavy (`LW.CUT`), visible medium (`LW.VIS_HEAVY` / `LW.VIS`), hidden / centre / dimensions thin (`LW.HID` / `LW.CL` / `LW.DIM`), construction fine. No hand-rolled line widths.
6. **Quality bar check before "done".** Render a test detail using the new entity and compare side-by-side with an STP 6011 detail of the same type. Adjustments to hatching, lineweight, label placement, leader styling happen before the feature is called done — not as a follow-on polish PR.

**What "making it visible" means and what it does NOT mean.** The phrase means: a tile in the palette, a picker that lists the catalogue, an options bar that exposes the entity's editable properties, an inspector panel that shows live results when the entity is selected. The palette is the discoverable surface. It does NOT mean: autoloading a demo on page load; floating buttons in the corner; pop-up dialogs explaining the feature; side-panel walkthroughs. If those feel necessary, the answer is to surface the feature in the palette properly, not to graft on a workaround.

---

## Known issues (NOT to fix in passing — these are real-work tickets)

These survived the modular split unchanged. They are pre-existing and need their own focused PRs.

1. **`function v25Mem2Thickness(ent)` is defined twice in `68-v25-tools.js`** (lines ~946 and ~1127). Both come from the original monolith (lines 18615 and 18761). The second definition wins at runtime — same behaviour as the original. Fix: deduplicate, verify no caller depends on the second one's specific implementation.
2. **`initEvents` in `39-events.js` is 1,601 lines** — one mousedown/move/up/keydown tree handling all tools. Phase 2 target: replace with a tool-handler dispatch table.
3. **V25 monkey patches in `72-v25-options-bar.js`** wrap `undo`, `v25Add`, `v25SetTool`, `v25TryHandleClick`. Wrappers + originals in different files. Phase 2 target: replace with a proper extension hook on each function.
4. **All mutable globals are top-level**, scattered across `07-globals.js` and `05-state.js` and others. Phase 2 target: lift into a single `appState` object.
5. **`.sd2.json` save format has no schema version field.** Phase 2 target: add `schemaVersion: 1` and a load-time migration scaffold.
6. **No autosave.** Browser crash = lost work. Phase 2 target: throttled localStorage autosave with a "dirty" indicator in title bar.
7. **CDN scripts (three.js / jspdf)** — works online only. Phase 2 target: vendor to `lib/` for offline + immune-to-CDN-changes use before commercial release.

---

## Phase-2 priorities (in rough order)

These are the next round of meaningful improvements once the modular structure has bedded in. Each is a focused PR, not a single-session task.

1. Break up `39-events.js` into a tool-handler dispatch table (`events/tool-select.js`, `events/tool-line.js`, etc.). Biggest readability win.
2. Lift mutable globals into `appState`. Massive cognitive load reduction.
3. Replace V25 monkey patches with proper extension hooks. Removes a structural smell.
4. Schema-versioned save format + `.sd2.json` load-time migrator.
5. Autosave + dirty-indicator title.
6. Vendor `three.min.js` + `jspdf.umd.min.js` to `lib/`.
7. Fix `v25Mem2Thickness` duplicate.
8. Fix V1→V2 regression list (still applicable from `archive/handoff_v2_abandoned.md` Section "V1 → V2 REGRESSION LIST"): grip-handle resize, trim/extend/fillet/offset implementations, group behaviour, layer drag-reorder, full dimension family, hatching renderer wired to inspector, MText with wrap.

## Phase-3 priorities (toward commercial release)

- ESM module migration (cleanest after globals are lifted into `appState`).
- A JSDOM-based test harness exercising every tool.
- Per-customer branding via theme file (Bligh Tanner / Acor / generic).
- Drawing-standards configurability (lineweight tables, hatch patterns, bolt catalogues as data files).
- DXF export polish for drafter handoff.
- Plugin system for custom details (`js/addons/*.js` auto-loaded if present).
- Manifest.json + service-worker.js for installable PWA on iPad.

---

## What an Australian structural engineer needs from this tool

This is the lens for refinement. Dan is a Senior Structural Engineer at Bligh Tanner producing details to AS 1100 / 4100 / 3600 / 1101 / 1252. The user is **not** an architect, not a renderer, not a generic CAD operator. The tool is **ruthlessly focused** on producing connection details and concrete details that look at least as clean as the STP Typical Structural Details PDF (page 85, details 6011.1–6011.6).

### Core daily activities (must be excellent)

1. **Detail steel connections** — cap plates, baseplates, splices, web side plates, moment connections, brace gussets, tilt-up connections. Parametric UB/UC/PFC/SHS/RHS/CHS/EA/UA, plates of arbitrary polygon, AS 1252 bolts in plan and elevation, AS 1101 weld symbols.
2. **Detail concrete** — slab edges, beam stirrups, reinforcement callouts, cover, lap lengths, starter bars, lift core penetrations.
3. **Annotate properly** — full dimension family, leaders with arrow styles, MText with wrap, callout balloons, section marks, view labels.
4. **Hatch correctly** — concrete (45°-stipple or solid), steel (solid black for sections), timber (grain), earth (zigzag), hidden (no hatch but with hidden lines).
5. **Linework matters.** Visible / hidden / centre / phantom — strict AS 1100 lineweight hierarchy.
6. **Multi-page detail sets.** A typical detail sheet has 4–8 details on one A1; a project might have 5–20 sheets.
7. **Title block compliant with the office standard.** Bligh Tanner format.
8. **PDF export that prints true to scale.** Print on A1 paper, dimensions match.
9. **DXF export** for drafter handoff into the project's main DWG.
10. **Cross-sheet detail re-use** (V2's snip-paste workflow — partial in V25).

### High-value differentiators (vs Bluebeam, vs AutoCAD)

- **3D isometric view** alongside the 2D — draw in 2D, sanity-check the geometry in 3D.
- **Parametric members that auto-render** in elevation, section, and plan.
- **AS-aware defaults** — drop in a UB beam, get the right depth/flange/web/root radius.
- **Snap-to-edge + depth-aware occlusion** — plates meet beam flanges cleanly; material in front hides material behind.

### What to cut or de-prioritise (this is not generic CAD)

- Spline tool (engineers don't draw splines in steel detailing)
- Architectural-style annotations
- Heavy 3D rendering / lighting / textures (the iso view should be flat shaded with line edges, like a structural model)
- Live collaboration (single-user is fine)
- Cloud sync (file-based works)
- Stamps (engineers sign drawings via title block revision)

---

## Quality bar

The reference for "is this detail good enough?" is the **STP Typical Structural Details PDF, page 85, details 6011.1–6011.6**. Any cap-plate, baseplate, splice, portal frame, web side plate, or tilt-up detail produced in StructDraw should look at least as clean.

---

*End of playbook. Last updated: 2026-05-30 — recorded the abandonment of the architecture-v2 rebuild (plates were its casualty; the v2 plate path was rescued and remains live) and parked its planning folders in `PlannedBuilds/(failed rebuild)/`. Prior update 2026-05-18 after the timber-screw feature taught us about palette integration, the two-mode requirement, and the two-chat workflow.*
