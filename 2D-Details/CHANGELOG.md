# Changelog

All notable changes to StructDraw from V25.modular onwards. Pre-V25 history is in [archive/v1/CHANGELOG.md](archive/v1/CHANGELOG.md).

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/), but pragmatic — entries are by phase / dev session, not by semver.

---

## [Unreleased]

(work-in-progress sits here until parity-merged dev → root)

### Added

- Welded Beam (WB) section catalogue — 23 sizes from AISC Design Capacity Tables Vol 1, Table 3.1-1(A): 1200, 1000, 900, 800, 700 series. Stored in new `WB_DB` and merged into `UB_DB` at module load so the existing `drawUB()` renderer handles WB members transparently. Wired through the model-mode tile palette (new "WB" tile, chord `M-W`), the V25 2D-mode steel-members rail (replaces the old "soon" placeholder), the size-picker (`kind: 'wb'`), the V25 options-bar member-type list, the inspector member-type dropdown, and the legacy `#wbList` library shim.
- Equal Angle (EA) sizes 200x200x16, 50x50x8, 45x45x6, 40x40x6/5/3 added per AISC Design Capacity Tables Vol 1, Table 3.1-9(A).

### Changed

- PFC catalogue values reconciled with AISC Vol 1, Table 3.1-7(A): 150 PFC tf 10.0 → 9.5; 125 PFC tw 5.0 → 4.7; 100 PFC tf 8.0 → 6.7 / tw 5.0 → 4.2; the 75 PFC entry was renamed `"75PFC"` → `"75PFC 5.92"` (matching the kg/m suffix convention) with tf 7.5 → 6.1 / tw 4.0 → 3.8.
- Polygon-trace tools (`v25-hatch`, `draw-hatch`, `draw-rev-cloud`, `polyline`) now use a free pointer mid-trace so rapid clicks can approximate a curve. Shift still gives ortho/45°. Hold Alt while clicking to restore endpoint snap (e.g. to land precisely on an existing vertex). Duplicate vertices < 0.1 mm apart are silently dropped to prevent zero-length segments from fast double-clicks.
- V25 endpoint-to-endpoint joints between any two members (UB, UC, SHS, RHS, CHS) now default to a mitre cut on both members. Previously equal-priority pairs rendered as raw overlap. Double-click the joint node to open a 2-option menu — "Mitre joint" (default) or "Pick member priority". Picking priority enters a one-shot mode: the next click on either of the two joined members sets it as the through-member, and the other member's end is butt-cut at the priority's outer face. Esc cancels. Per-pair choice persists in the project save file (`priorityForPairV25`).
- UB / UC elevation render now applies the joint trim path the SHS/RHS/CHS branch already had, so flange edges clip correctly at the cut.

### Fixed

- V25 elevation render: the slant cut-face line at a joint trim is now drawn correctly. The cut formula extrapolates past the original end face for "Case-2" mitres (cut chord crosses the end face plus one side edge); the renderer now clamps `xA`/`xB` to `[0, len]` and draws the end face as a 2-segment polyline kinked at `(uAtV(0), 0)` so the chord follows the actual cut. Butt cuts still collapse to a single straight line.

---

## [V25.modular] — 2026-05-02

The structural refactor. Pure file split, **zero behaviour change**, verified by browser smoke test.

### Changed

- The single 22,241-line `index.html` is now a 1,308-line thin shell + `css/styles.css` (~1,500 lines) + 73 numbered `js/NN-name.js` files (~19,800 lines total, average ~270 per file).
- Each `js/*.js` file starts with `'use strict';` to preserve the original strict-mode semantics across now-separate scripts.
- All scripts loaded as classic `<script>` tags (NOT `type="module"`) — globals continue to flow between files exactly as in the monolithic original.
- New developer playbook (`CLAUDE.md`) + project README + this changelog.
- `HANDOFF_V2.md` (which described an abandoned Bluebeam-shell rewrite) moved to `archive/handoff_v2_abandoned.md`.
- Pre-existing backup files (`index.html.pre-v25-backup`, `dev/index.html.pre-layout-overhaul-backup`) moved to `archive/snapshots/` with date-prefixed names.

### Verification

- All 73 JS files pass `node --check`.
- All 20 critical globals (canvas, ctx, viewport, blocks, tool, project, V25 / V14 / V22 fns) defined exactly once and reachable from the global scope.
- Browser smoke test: app loads, renders A1 sheet, places objects, switches 2D ↔ 3D mode, places V25 anchor entity, runs `render()`, runs `updateStatus()`, runs `v3dRebuildScene()`, multi-sheet add/switch, save/load JSON round-trip — **all clean, no console errors, no warnings**.

### Known carryovers (NOT fixed in this PR)

These are pre-existing in the source. The refactor preserved behaviour exactly; fixes belong to their own PRs. See `CLAUDE.md → Known issues`.

1. Duplicate `function v25Mem2Thickness(ent)` in `68-v25-tools.js`.
2. `initEvents` in `39-events.js` is 1,415 lines — a god function that needs decomposition.
3. V25 monkey patches in `72-v25-options-bar.js` wrap originals in earlier files.
4. All mutable globals are top-level — no `appState` namespace.
5. `.sd2.json` save format has no schema-version field.
6. No autosave.
7. CDN scripts (three.js / jspdf) — works online only.

### Structural impact (why this matters for product longevity)

- A change in any one tool now touches one file (typically 100–700 lines), not a 22k-line monolith.
- Permission prompts in chat-driven dev are fewer because target ranges are unique.
- Adding a feature has a clear home rather than appending to the bottom of a giant file as another `// V<n>` section.
- The next round of work (Phase 2 in CLAUDE.md) — break up `initEvents`, lift globals into `appState`, replace monkey patches with extension hooks — becomes safe and reviewable in isolation.

---

## Pre-V25.modular history

See [archive/v1/CHANGELOG.md](archive/v1/CHANGELOG.md) for V1 history (V0 → V24.A3).

The active V25 layout-overhaul work between 2026-04-29 and 2026-05-01 is documented in `dev/design-handoff/INTEGRATION_BASELINE.md` (Phases 0–9). The PHASE_8_QA report passed clean static QA on 2026-05-01.
