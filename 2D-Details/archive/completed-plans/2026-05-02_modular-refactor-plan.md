# StructDraw — Modular Refactor Plan

**Status:** Awaiting approval
**Date:** 2026-05-02
**Author:** Claude (architect mode)
**Scope:** Break the 22,241-line `dev/index.html` into a maintainable multi-file structure ready for long-term development and eventual commercial release.

---

## 1 · Why now

The current `dev/index.html` is **22,241 lines / 918 KB** in a single file. It's grown 7× the size the V2 reset target (HANDOFF_V2.md anticipated ~3,000 lines) and is now actively resisting clean additions. Concrete symptoms:

- The single largest function, `initEvents`, is **1,410 lines** — every mouse/touch/keyboard handler inline.
- Late-arriving features layer on via monkey-patching at the file end (`_v25_origUndo`, `_v25_origAdd`, `_v25_origSetTool`, `_v25_origTryHandleClick`) — the patches at line 21,554–21,720 wrap originals scattered between line 3,389 and line 21,173. Hard to follow.
- Version-tagged sections (V14, V15, V17, V19.5, V20, V21, V22.1–22.6, V24.A2–A4, V25, V26) accumulate without consolidation. A "PDF export" change touches V15, V17, V19.5 sections.
- `Edit` operations on the file regularly hit "old_string is not unique" because similar UI patterns repeat across versions. This is a real productivity tax in chat sessions.

The codebase is **structurally healthy** — disciplined comments, low TODO debt, clean console output, AS-standards references throughout. The problem is purely organisational: too much code for one file.

This refactor is a **pure file split** with **zero behaviour change**. No API changes, no new features, no rewrites. Same globals, same load semantics, same DOM, same render output. Verify by static QA + browser smoke test.

---

## 2 · Convention chosen — match `structural-sketch/`

This monorepo has two precedents:

| App | Pattern | Loader | Files |
|---|---|---|---|
| `structural-sketch/` | Numbered classic scripts | `<script src="js/01-core.js">` ... | `01-core.js` … `38-joist-zone-3d.js` |
| `Structural-Inspections/` | ESM modules | `<script type="module" src="js/app.js">` | `js/app.js`, `js/router.js`, `js/components/`, `js/views/` |

**Decision: match `structural-sketch/` (classic numbered scripts).**

Reasons:

1. **Zero migration risk.** All 1,373 top-level `const`/`let` declarations and 392 functions stay global. Browsers concatenate `<script>` tags at parse time — semantically identical to the current giant file.
2. **Top-15 globals have 364–1,440 references each** (`ctx: 1440`, `tool: 364`, `canvas: 160`, `activeBlock: 156`, `v25State: 137`, `project: 109`). Converting these to ESM exports is a multi-week refactor that risks subtle breakage.
3. **Consistency across Dan's apps.** Switching context-files between `structural-sketch/js/01-core.js` and `2D-Details/js/01-config.js` should feel identical.
4. **No build pipeline.** Open `index.html` and it runs — preserve that property. ESM requires a real HTTP server (file:// breaks `import`).
5. **Reversible later.** Once boundaries are clean, migrating to ESM is a much smaller hop. Today's split makes that hop possible; doing it today is premature.

---

## 3 · Target folder structure

```
2D-Details/
├── index.html                      # RELEASED — thin shell (HTML body only) loading css/ + js/
├── CLAUDE.md                       # NEW — active project playbook (replaces stale HANDOFF_V2.md)
├── README.md                       # NEW — what this app is, how to run it, how to ship a release
├── CHANGELOG.md                    # NEW — proper version notes from this point forward
├── MODULAR_REFACTOR_PLAN.md        # this file (will be archived after merge)
│
├── css/
│   └── styles.css                  # extracted from <style> block (~1,500 lines)
│
├── js/                             # numbered for explicit load order (gaps allow inserts)
│   ├── 01-config.js                # SHEET, DA, DASH, LW, CONN_DEFAULTS + feature flags (V14_NEW_BOLTS, V15_VECTOR_PDF, sketch flags)
│   ├── 02-data-sections.js         # UB_DB, UC_DB, SHS_DB, PFC_DB, RHS_DB, CHS_DB, EA_DB, UA_DB
│   ├── 03-data-bolts.js            # BOLT_DB, BOLT_LENGTHS
│   ├── 04-data-v25.js              # V25_BLOCK_DB, V25_LINTEL_BLOCK_DB, V25_ANCHOR_DB, V25_REO_DB, V25_SCALES, V25_MATERIALS, v25Last
│   ├── 05-state.js                 # objects3D, entities2D, sheetInfo, undoStack, redoStack, project model
│   ├── 06-detail-block.js          # DetailBlock class + projElev / projSecA / projPlanB
│   ├── 07-globals.js               # canvas, ctx, viewport, blocks, activeBlock, tool, drag/grip/rotate/cycle/clip state
│   ├── 08-coords.js                # s2px, px2s, real2px, px2real, sheetLen + colour utilities + constrainUV
│   ├── 09-snap.js                  # snapUV, getCursor, getObjSnapPoints, getEnt2DSnapPoints
│   ├── 10-bounds-hittest.js        # getObj2DBounds, hitTest3D, hitTestAll3D, blockAtPixel, getBlockSheetBounds, _memberFrame2DBounds, hitTestResizeHandle
│   ├── 11-grip-handles.js          # getGrips, hitTestGrip, applyGripDrag, applyRotation
│   ├── 12-edge-snap.js             # getSnapEdges, getDraggedEdges, applyEdgeSnap, drawEdgeSnapLines
│   ├── 13-projection-lines.js      # between-view alignment lines
│   ├── 14-section-cuts.js          # draggable cut indicators + cut classification + live section cut
│   ├── 15-occlusion.js             # depth-aware hidden lines
│   ├── 16-section-profile.js       # V22.1 unified profile helper
│   ├── 17-fillet-chamfer.js        # V22.4 helpers
│   ├── 18-member-frame.js          # V24 Phase A frame math + 24 ortho presets
│   ├── 19-render-proxy.js          # V24 per-view rendering proxy
│   ├── 20-bolt-grip.js             # V14 bolt grip auto-detection
│   ├── 21-auto-weld.js             # V14 auto-weld interface detection + popup
│   ├── 22-render-core.js           # render() / requestRender() / drawSheet
│   ├── 23-draw-primitives.js       # rLine etc. + V17 sketch wobble + AS 1100 hatching + parametric holes + rotation helper
│   ├── 24-draw-block.js            # drawBlockContent + view markers
│   ├── 25-draw-ub.js               # drawUB
│   ├── 26-draw-shs.js              # drawSHS
│   ├── 27-draw-section.js          # V22.1 unified renderer (PFC/RHS/CHS/EA/UA)
│   ├── 28-draw-plate.js            # drawPlate
│   ├── 29-draw-bolt.js             # drawBolt + AS 1100 realistic bolt primitives
│   ├── 30-draw-2d.js               # drawEnt2D + V22.5 grid/note + V22.6 hatch/MText/rev-schedule
│   ├── 31-draw-weld.js             # AS 1101 weld symbol renderer
│   ├── 32-selection.js             # selection highlights + view labels
│   ├── 33-crosshair.js             # crosshair + click preview overlay
│   ├── 34-events.js                # initEvents (the 1,410-line beast — kept as one file for now, broken up in Phase 2)
│   ├── 35-placement.js             # component placement + two-click draw + polygon plate completion
│   ├── 36-tools.js                 # tool state machine + setTool
│   ├── 37-keyboard.js              # initKeyboard + V21 chord layer
│   ├── 38-clipboard.js             # paste / paste-in-place
│   ├── 39-save-load.js             # JSON save/load (single sheet)
│   ├── 40-status-bar.js            # status bar updater
│   ├── 41-connection-builders.js   # V16 builders (cap plate, baseplate, splice, web-side-plate, etc.)
│   ├── 42-sheet-browser.js         # V19.5 sheet browser
│   ├── 43-project.js               # V19.5 multi-sheet project save/load
│   ├── 44-pdf-export.js            # raster + vector + canvas shim + multi-page
│   ├── 45-dxf-export.js            # full DXF emission + per-entity emitters
│   ├── 46-cmd-palette.js           # V20 command palette
│   ├── 47-layers-panel.js          # V20 layer visibility UI
│   ├── 48-kbd-help.js              # V20 keyboard help
│   ├── 49-mirror-tool.js           # V20 mirror tool
│   ├── 50-favourites.js            # V21 favourites strip
│   ├── 51-size-picker.js           # V21 size-picker dropdown
│   ├── 52-inspector.js             # V21 inspector panel + V24.A3 orientation preview
│   ├── 53-tile-palette.js          # V21 tile palette
│   ├── 54-library-shim.js          # V20 legacy library shim
│   ├── 55-toolbar.js               # initToolbar + toolbar dispatch
│   ├── 56-layout.js                # fitToView + layoutBlocks + resize
│   ├── 57-3d-engine.js             # Three.js iso engine — v3dInit, materials, scene rebuild, orbit
│   ├── 60-v25-mode.js              # applySheetMode + scale per frame + entity helpers + detail frame
│   ├── 61-v25-materials.js         # material hatch patterns + V25-layout-overhaul pattern set
│   ├── 62-v25-tools.js             # blockwork wall + smart anchor + reo bar + mesh + first-class leader + 2D-only steel section
│   ├── 63-v25-edge-weld.js         # V25 2D edge snap + V25 2D auto-weld pipeline (Phase 6.3 / 6.4)
│   ├── 64-v25-hatch.js             # V25 Phase 4 hatch placement tool + Phase 7 colour/opacity overrides
│   ├── 65-v25-render.js            # V25 lineset rendering + text box + swatch previews
│   ├── 66-v25-selection.js         # V25 selection / hit-test / drag / inspector / quick options
│   ├── 67-v25-options-bar.js       # V25 quick options bar + the four monkey patches (loaded AFTER everything it wraps)
│   ├── 68-v26-bb-rail.js           # V26 BB-rail IIFE (self-contained)
│   └── 99-init.js                  # DOMContentLoaded bootstrap (MUST be last)
│
├── lib/                            # NEW — local vendor libs (Phase 2; CDN stays for now)
│   └── (empty — Phase 2 will add three.min.js, jspdf.umd.min.js)
│
├── archive/                        # historical snapshots
│   ├── v1/                         # existing — pre-V25 archive
│   ├── snapshots/                  # NEW — date-prefixed full-file backups
│   │   ├── 2026-04-29_pre-v25-backup.html       # was index.html.pre-v25-backup
│   │   ├── 2026-05-01_pre-layout-overhaul.html  # was dev/index.html.pre-layout-overhaul-backup
│   │   └── 2026-05-02_pre-modular-split.html    # NEW — snapshot before this refactor
│   └── handoff_v2_abandoned.md     # was HANDOFF_V2.md (mark as abandoned, kept for context)
│
├── Images/                         # existing — section thumbnails (unchanged, lots of code references)
├── Thumbnails-SVG/                 # existing — SVG previews (unchanged)
│
└── dev/                            # gitignored — experimentation scratchpad
    ├── index.html                  # mirrors root after each "release" merge
    ├── css/                        # mirrors root
    ├── js/                         # mirrors root
    ├── design-handoff/             # existing — design integration tracking (keep)
    └── (work-in-progress files only)
```

**62 JS files**, **1 CSS file**. Average JS file: 200–400 lines. Largest (events.js): 1,410 lines (acceptable as a single file, but flagged for Phase 2 break-up). Most under 600 lines — the size where you can hold the whole file in your head.

### Numbering

Numbers cluster by domain:
- **01–07** Config & state
- **08–17** Geometry (coords, snap, hit-test, edge snap, projection, occlusion, profile)
- **18–21** Member-specific intelligence (frame, render proxy, bolt grip, auto-weld)
- **22–31** Rendering (render core, primitives, per-shape draw, weld symbol)
- **32–33** Selection visuals
- **34–40** Interaction (events, placement, tools, keyboard, clipboard, save, status)
- **41–45** Application services (connections, sheets, project, exports)
- **46–57** UI (palettes, panels, toolbar, layout, 3D engine)
- **60–67** V25 cluster (kept together — it's a coherent later addition)
- **68** V26 BB-rail
- **99** Init (always last)

Gaps left for inserts (e.g. `58`, `59` between 3D engine and V25; `90s` between V26 and init).

---

## 4 · What stays in `index.html`

The thin shell after the split:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>StructDraw V24.A3 — A1 Sheet Detail Editor</title>

  <!-- Vendor libs (CDN for now; Phase 2 vendors locally) -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>

  <link rel="stylesheet" href="css/styles.css">
</head>
<body class="theme-warm-light">
  <!-- ~1,200 lines of DOM scaffolding (unchanged) -->
  ...

  <!-- App scripts in numbered load order -->
  <script src="js/01-config.js"></script>
  <script src="js/02-data-sections.js"></script>
  ...
  <script src="js/99-init.js"></script>
</body>
</html>
```

Estimated thin-shell size: **~1,250 lines** (vs. 22,241 today). The CSS link replaces 1,500 lines, the script tags replace ~17,200 lines.

---

## 5 · Migration plan — 8 phases

Each phase is verifiable in isolation. I commit to a clean browser smoke test after every phase.

### Phase 0 — Snapshot & safety net (5 min)
- Copy current `dev/index.html` → `archive/snapshots/2026-05-02_pre-modular-split.html`
- Copy current `index.html` → same file (they're identical SHA — one snapshot covers both)
- Move `index.html.pre-v25-backup` → `archive/snapshots/2026-04-29_pre-v25-backup.html`
- Move `dev/index.html.pre-layout-overhaul-backup` → `archive/snapshots/2026-05-01_pre-layout-overhaul.html`
- Confirm rollback path: `cp archive/snapshots/2026-05-02_pre-modular-split.html dev/index.html` restores the world.

### Phase 1 — Carve CSS to `dev/css/styles.css` (15 min)
- Extract lines 9–1,583 (everything between `<style>` and `</style>`) to `dev/css/styles.css`.
- Replace in `dev/index.html` with `<link rel="stylesheet" href="css/styles.css">`.
- **Verify:** open `dev/index.html` in browser. Theme cycles, all panels render correctly. Take screenshots of Warm Light + Warm Dark + BT themes for diff against snapshot.

### Phase 2 — Carve JS by section banners (90 min)
- For each of the 62 target files, extract its line range from the existing JS block to a numbered file in `dev/js/`.
- Replace the entire `<script>...</script>` block in `dev/index.html` with 62 `<script src="js/NN-name.js">` tags in order.
- **Verify:** open in browser. Console clean. Click every menu item, every tool, every panel. Run a full pre-existing demo project end-to-end.

### Phase 3 — Static QA pass (15 min)
- Confirm every DOM ID from baseline still in DOM (compare to `dev/design-handoff/INTEGRATION_BASELINE.md`).
- Confirm `node --check` on each `dev/js/*.js` (each file is syntactically valid in isolation).
- Confirm no function/var name collisions between files (`grep -h "^function " dev/js/*.js | sort | uniq -d` should be empty).

### Phase 4 — Add doc files (20 min)
- Write `CLAUDE.md` (active playbook — replaces stale HANDOFF_V2.md). Captures workflow rules, file structure, AS standards reference, V1/V25 entity model conventions, and the new "edit individual JS files" rule.
- Write `README.md` (orient a new contributor or future commercial user).
- Write `CHANGELOG.md` (start tracking from V25.modular).
- Move `HANDOFF_V2.md` → `archive/handoff_v2_abandoned.md` with a header noting it describes the abandoned V2 reset.

### Phase 5 — Browser smoke test (30 min)
- Use Claude Preview MCP (already permitted in `.claude/settings.local.json`).
- Walk the verification checklist from `dev/design-handoff/INTEGRATION_BASELINE.md`:
  - All 5 themes cycle
  - 96+ interactive IDs present and responsive
  - Snap, ortho, polar, grid toggle correctly
  - Place a UB, place a SHS, place a plate, place a bolt → renders in all 3 views
  - Toggle 2D/3D mode → blocks reconfigure
  - V25 anchor / wall / bar / mesh tools place entities
  - PDF export produces a non-empty file
  - DXF export produces a non-empty file
  - Multi-sheet add/duplicate/delete works
  - Save/load round-trips
- Compare a key drawing's screenshot against the same drawing in the snapshot. Diff should be pixel-identical (we changed zero behaviour).

### Phase 6 — Mirror dev/ → root (5 min)
- `cp dev/index.html index.html`
- `cp -r dev/css/ ./css/`
- `cp -r dev/js/ ./js/`
- Browser smoke test the root version.
- This is the "release" step Dan controls.

### Phase 7 — Update `.gitignore` (2 min)
- Current `.gitignore` excludes `**/dev/` (correct, keeps experimental work out of git).
- Add `**/archive/snapshots/*.html` to the gitignore — large historical snapshots don't belong in the repo. They live on disk for rollback only. (Discuss with Dan; he may prefer to keep them tracked.)

### Phase 8 — Commit prep (5 min — Dan executes)
- Per workflow rules: **Claude does not commit or push.** I leave the working tree clean and Dan reviews + commits.
- I provide a draft commit message: *"Refactor: split 22,241-line index.html into modular css/ + js/ structure (62 numbered files). No behaviour change. Verified by browser smoke test. Closes pre-modular era."*

**Total clock time:** ~3 hours of focused execution. A real day of work given verification overhead.

---

## 6 · Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| A function moves to a file loaded **after** its first call site | Medium | Numbered ordering matches current top-to-bottom scan. Verify with browser console (any ReferenceError surfaces immediately). |
| Monkey-patch wrappers (`_v25_origUndo` etc.) load before originals | Low | All 4 wrappers go in `67-v25-options-bar.js`. Originals are in earlier-numbered files. Numbered ordering enforces correctness. |
| `DOMContentLoaded` listener fires before all script tags loaded | None | Classic `<script>` tags in `<body>` end execute synchronously top-to-bottom; `DOMContentLoaded` only fires after parsing finishes — i.e. after every script tag has run. Identical to current single-file behaviour. |
| Dan's existing chats reference line numbers that change | Certain | This is a one-time disruption. Future chats benefit from much better targeting. Document the new file map in CLAUDE.md so chats know where to look. |
| Browser caching serves stale `js/NN-*.js` after edits during dev | Low | Add `?v=` cache-buster to script tags during dev (matches Structural-Inspections pattern). Optional — a hard refresh works. |
| A subtle name collision between files (e.g. two `init` functions) | Low | Phase 3 static check (`grep -h "^function " dev/js/*.js | sort | uniq -d`) catches duplicates explicitly. |
| `archive/snapshots/` snapshots accidentally get committed and bloat the repo | Medium | Phase 7 gitignores them (or `.html` files in `archive/snapshots/`). |
| Future feature additions land in the wrong file | Medium | CLAUDE.md will list each file's purpose. The numbered convention makes "where does this go?" answerable. Re-review after 4 weeks of real use to see if any boundaries need shifting. |

---

## 7 · What this refactor does NOT change

To set expectations crisply, here's what is **out of scope**:

- ❌ No global state lifted into namespaces. `tool`, `blocks`, `viewport`, `ctx` etc. stay top-level globals. (Phase 2 future work.)
- ❌ No ESM modules. No `import`/`export`. No build step. (Phase 3 future work.)
- ❌ `initEvents` (1,410 lines) stays as one file. Refactoring it into a tool-handler dispatch table is meaningful work that deserves its own focused PR with browser tests for every tool. (Phase 2 future work.)
- ❌ The V25 monkey patches stay as wrappers. Replacing them with a proper extension hook on `undo`/`v25SetTool`/etc. is a behaviour-equivalent refactor, but a separate one. (Phase 2 future work.)
- ❌ No tests added. The codebase has no test suite today. Adding one is significant work, and the safest moment to add tests is *after* the file boundaries exist (so a unit test can `require` a single file). (Phase 2 future work.)
- ❌ No vendor-locking of three.js / jspdf. CDN stays. (Phase 2 future work — preserve offline-capability before commercial release.)
- ❌ No CSS split into multiple files. One `styles.css` for now. (Phase 3 future work — split into theme tokens / chrome / drawing engine when it grows past ~3,000 lines.)
- ❌ HANDOFF_V2.md is stale (describes the abandoned V2 reset; current code is V1 lineage extended through V25/V26). Will be archived, not updated.

The principle: **separate the "where does this code live?" change from every other improvement**. Each change should be reviewable in isolation. This is the structural change. The rest follows.

---

## 8 · After the split — recommended Phase 2 priorities

Once the structure is in place, these become **smaller, safer, reviewable** PRs:

1. **Break up `34-events.js`** — replace the 1,410-line if-tree with a tool-handler table. Each tool's `down/move/up` handler in its own file (`events/tool-select.js`, `events/tool-line.js`, etc.).
2. **Replace V25 monkey patches** with a proper extension registry. `undo` becomes `undo()` that consults a stack of pluggable handlers.
3. **Lift mutable globals into a single `appState` object** in `05-state.js`. Mechanical change; massive reduction in cognitive load.
4. **Add a JSDOM smoke test** that loads each `js/NN-*.js`, exercises every menu/tool/panel, and asserts no `console.error`. The test file becomes the regression canary.
5. **Vendor `three.min.js` + `jspdf.umd.min.js` to `lib/`** — works offline, pin versions before commercial users see different behaviour from CDN updates.
6. **Versioned save format.** `.s2d.json` files have no schema version. Add `schemaVersion: 1` and a load-time migrator scaffold.
7. **Autosave to `localStorage`.** Single-engineer no-cloud workflow shouldn't lose a day's work to a browser crash.
8. **Title bar shows project name + dirty indicator.** Currently always `Untitled.sd2`.

These are roughly in priority order. Each is days, not weeks. None require touching the structure we set up today.

---

## 9 · Long-term direction (the commercial product lens)

Once Phase 2 is done, the codebase is in a position to support real product moves:

- **Licensing model.** Either obfuscated single-deliverable HTML (`build/structdraw-pro.html` from `js/*.js` concat) or self-hosted via CDN (offer per-seat).
- **Per-customer branding.** The 5-theme system already supports it — adding a "client BT" / "client Acor" / "client X" theme is one CSS block + one `--accent` change.
- **Drawing standards configurability.** AS 1100 / AS 4100 / AS 3600 are baked in. To sell internationally, the standards reference layer (lineweight tables, hatch patterns, bolt catalogues) needs to be data-only — already most of the way there.
- **Drafter handoff via DXF** is a real differentiator. Polish that path. Add per-layer DWG export options.
- **Cloud library / template sharing** could ship as a future SaaS layer without rewriting the editor.
- **Training mode / sample projects** ship as bundled `.sd2.json` files. Perfect for trial/demo accounts.
- **Plugin system** for custom details. The numbered-file convention is a foothold — third-party "addons" load as additional `js/` files.

The single-file → modular split is **necessary infrastructure for any of those moves**. Without it, every commercial path forks the code. With it, the code stays one canonical source.

---

## 10 · What I need from Dan to proceed

A simple yes or no.

If **yes**:
1. I execute Phase 0–6 in `dev/` only (matching established workflow).
2. Browser-tested in real Chrome via Preview MCP, screenshots captured.
3. Once you approve dev/, I do the dev → root mirror in Phase 7.
4. You commit and push.

If **no** or **modify**:
- Tell me which sections to merge or split differently.
- Suggest different file naming or numbering.
- Defer any phase you want to handle separately.

I won't touch a single file until you respond.

---

*End of plan.*
