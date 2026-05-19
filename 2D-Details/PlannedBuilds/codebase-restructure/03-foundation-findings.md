# Layer 1: Foundation findings (`js/01-config.js` → `js/22-render-core.js`)

This layer is the substrate every other file depends on. It's the LEAST drifted layer in the codebase — most of the smells are minor. The two main findings: `ppm()` is misfiled into `25-parametric-holes.js` (a layer above), and the playbook's one-line descriptions for these files are accurate but skip several layer-wide helpers.

22 files, mostly small. Aggregate ~5,000 lines. All `'use strict';` (one file has it twice — see F1 below).

---

## Per-file headlines

The full file-by-file breakdown is in the agent report at `tool-results/toolu_01XedUYccYxEtNgWvXG44XDZ.json` (persisted output). What follows is the leverage-ordered shortlist.

### F1. `01-config.js`

- 32 lines. A1 sheet geometry constants (`SHEET`, `DA`).
- **Smell:** `'use strict';` appears twice (lines 1 and 6). Harmless but indicates the modular-split sloppiness. Fix in passing.
- **Smell:** Margins `ML:20`, `MR:10`, `MT:10`, `MB:10` and title-block height `TB_H: 30` are unsourced magic numbers. AS 1100 mandates a 20 mm binding edge; everything else is convention. Should be cited in comments or pulled into an office-standards config.

### F2. `02-data-sections.js`

- 252 lines. Eight section catalogues (`UB_DB`, `WB_DB`, `UC_DB`, `SHS_DB`, `PFC_DB`, `RHS_DB`, `CHS_DB`, `EA_DB`, `UA_DB`).
- **Drift:** Playbook says "UB/UC/SHS/PFC/RHS/CHS/EA/UA" — **omits `WB_DB` (welded beam)**. WB is half-wired throughout the app (mentioned in CHANGELOG, has a catalogue here, has a `memberType: 'wb'` in V25 — see `02-design.md` references in `orientation-presets/`).
- **Fix in Phase 1:** Add `WB` to the playbook descriptions.

### F3. `02b–02e` (dev-only) — timber catalogues

- 4 files in `dev/js/`, total ~1,100 lines, sourced from ETA-11/0030 and AS 1720.1 / EN 1995.
- **Drift:** Playbook file map ends at `74-v26-bb-rail.js`. These files have been in `dev/` since 2026-05-12; absent from the file map.
- **Fix in Phase 1:** Add a "Dev-only (in-flight, see `PlannedBuilds/timber-screws/`)" section to the file map.

### F4. `03-data-bolts.js`

- AS 1252 bolt catalogue + connection defaults + the `LW` lineweight constants.
- **Smell:** `LW` lives here because the original V22 monolith put it next to bolt grade defaults. It's used by every drawer. Should arguably live in `08-coords.js` or a new `04a-render-constants.js`. Not urgent — the import-via-globals convention means the placement is invisible to most readers.

### F5. `05-state.js`

- Feature flags + 3D model (`objects3D` array) + project model (`projectModel`).
- **Smell:** `objects3D` and `entities2D` (the latter declared in `07-globals.js`) are the two mode-affiliated mutable globals — they live in different files. Phase 3 lifts both into `appState.model.objects3D` and `appState.model.entities2D`.

### F6. `07-globals.js`

- Canvas, ctx, viewport, blocks, tool, drag-state. The "official" globals home.
- **Reality:** at least 6 other files declare top-level mutable state (52, 55, 56, 57, 58, 53, 48). Plus `tmbrCurrentConnectionId` is correctly placed here but `_weldDialogLast` (23) and `mitrePairs` (23a) are not.
- **Fix in Phase 3:** Lift everything into `appState`; deprecate the "07-globals.js" file as a global-state home in favour of a structured object.

### F7. `08-coords.js`

- `s2px` / `px2s` / `real2px` / `px2real` + colour utilities (`colorAlpha`).
- **Drift:** Playbook description accurate.
- **Smell:** Y-flip is implicit in `real2px` ("Y is up in world coords, down on canvas, flipped in `real2px`"). Documented in CLAUDE.md variable-conventions table — fine.

### F8. `09-snap.js` / `10-bounds-hittest.js` / `11-grip-handles.js` / `12-edge-snap.js`

- Hit-testing, snapping, grip handles. All 3D-mode-only (operate on `objects3D`).
- **Smell:** V25 2D-mode hit-testing lives in a parallel implementation in `71-v25-selection.js`. Same algorithmic problem as B1 — but in this case the V25 implementation is genuinely more sophisticated (multi-pass z-stack, click-cycling, marquee), so the right fix is to **promote the V25 implementation to the shared layer** rather than duplicate downward.

### F9. `13-projection-lines.js` / `14-section-cuts.js` / `15-occlusion.js` / `16-live-section-cut.js`

- All 3D-mode-only. View-to-view alignment, draggable cut indicators, depth-aware hidden lines, cut classification.
- **Smell:** `15-occlusion.js` exports `getOcclusionRects` but `isOccluded` / `clipLineAgainstOcclusion` / `rLineOcc` are stranded in `23-auto-weld.js` (see F12 below). The occlusion layer is split across two files.
- **Fix in Phase 6:** Promote the 23-resident occlusion helpers into a new `15a-occlusion-clip.js`.

### F10. `17-fillet-chamfer.js`

- Marked as "V22.4 stub" in playbook. Confirm — this file is intentionally minimal; the real fillet/chamfer implementation is missing (it's on the V1→V2 regression list).
- **Fix in Phase 1:** Reflect "stub — feature not implemented" clearly in the file map.

### F11. `18-section-profile.js` / `19-member-frame.js`

- V22.1 unified section profile + V24 member frame math.
- **Drift:** Playbook accurate.
- **Smell:** `_jvSub/_jvDot/_jvLen` in `23a-shs-joints.js` duplicate vector helpers that arguably belong here (or are available via Three.js). Phase 6 cleanup.

### F12. `22-render-core.js`

- `render()` / `requestRender()` / `drawSheet()`.
- **Smell:** `requestRender` is called from 30+ files. It's the right place for it. No fix needed.

---

## Cross-layer findings

### CL1. `ppm()` is misfiled

`ppm()` (pixels per millimetre) is exported from **`25-parametric-holes.js`** (one layer up) but is used by every drawer in this foundation layer (`24-draw-primitives.js`, `26-as1100-hatch.js`) and every member drawer above. The placement is invisible to readers of the file map.

**Fix in Phase 6:** Move `ppm()` to `08-coords.js` next to `real2px`/`px2real`. One-line move, ~30 callers (no API change).

### CL2. Two array conventions for polygon primitives

`rFillPoly` in `24-draw-primitives.js` takes `[{u, v}, …]`. `rPolygon`/`rFillPolygon` in `33-draw-bolt.js` take `[[u, v], …]`. Same concept, two shapes.

**Fix in Phase 6:** Pick the object form (`{u,v}`) — it's the more idiomatic for this codebase — and migrate `33-draw-bolt.js`.

### CL3. `memberFillAlpha` is mis-credentialed

Defined in `29-draw-ub.js` (above this layer), used by `drawSHS`, `drawSectionMember`, `drawPlate`. Should be in `24-draw-primitives.js`.

**Fix in Phase 6:** Move. Trivial.

---

## Dependency graph (this layer)

```
01-config ────────► [used by] every layout file
02-data-sections ─► consumed by every section drawer (29, 30, 31, 64)
02b-02e (dev) ────► consumed by 75/77/78/79 (timber) — Phase 2 removes these
03-data-bolts ────► defines LW, consumed by every drawer
05-state ─────────► objects3D, projectModel — read everywhere
06-detail-block ──► DetailBlock class + projection — consumed by 13, 28, 64
07-globals ───────► canvas/ctx/viewport/blocks/tool/drag-state — read everywhere
08-coords ────────► s2px/px2s/real2px/px2real — consumed by every drawer
09-snap ──────────► snapUV, getCursor — consumed by 39
10-bounds-hittest ─► AABB / hit-test — consumed by 39
11-grip-handles ──► grips, applyGripDrag — consumed by 39
12-edge-snap ─────► edge-snap with indicators — consumed by 39, 40
13-projection-lines ► view alignment — consumed by 22, 28
14-section-cuts ──► draggable cuts — consumed by 22, 39
15-occlusion ─────► getOcclusionRects — consumed by 22, 28
16-live-section-cut ► cut classification — consumed by 28
17-fillet-chamfer ─► V22.4 stub
18-section-profile ► unified profile helper — consumed by 31
19-member-frame ──► frame math + 24 ortho presets — consumed by 28, 29, 30, 31, 32, 33, 64
20-render-proxy ──► per-view rendering proxy — consumed by 28
21-bolt-grip ─────► bolt grip auto-detection — consumed by 25, 33, 64
22-render-core ───► render() / requestRender — called from everywhere
```

The shape is mostly clean — foundation → primitive → drawer. The leaks are: `ppm()` lives above the layer, `memberFillAlpha` lives above the layer, occlusion clipping lives in the auto-weld file. All three are addressed by Phase 6 with one-line moves.

---

## What changes in this layer per phase

- **Phase 1 (docs only):** Add `WB` to data-sections description; add `02b-02e` and the timber files to a "dev-only" file-map section; fix the stub-status flag on `17-fillet-chamfer.js`; document `LW` lives in `03-data-bolts.js`.
- **Phase 3 (lift globals):** `objects3D`, `projectModel`, `entities2D` (declared in 07) all move to `appState.model.*`. `tool`, `drawStart`, `placing`, etc. move to `appState.tools.*`. `cursorSheet`, `viewport`, `blocks`, `activeBlock` move to `appState.ui.*`. Tickets in `09-build-plan.md`.
- **Phase 6 (deduplication):** `ppm()` moves to 08; `memberFillAlpha` moves to 24; occlusion-clip helpers move to a new `15a-occlusion-clip.js`; polygon primitive conventions unified.
