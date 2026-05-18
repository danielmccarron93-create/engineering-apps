# Modular Refactor — COMPLETE

**Source of truth:** [MODULAR_REFACTOR_PLAN.md](MODULAR_REFACTOR_PLAN.md)
**Started:** 2026-05-02 ~10:15
**Finished (dev/ side):** 2026-05-02 ~13:55
**Status:** dev/ verified working in browser. **Awaiting Dan's review + dev → root mirror.**

This file is the recovery handle. It captures the full final state.

---

## What landed

- **dev/index.html** is now a 1,308-line thin shell (down from 22,241 lines).
- **dev/css/styles.css** holds 1,573 lines of CSS extracted from the old `<style>` block.
- **dev/js/** holds **73 numbered classic-script files** averaging ~270 lines each, totalling ~19,800 lines.
- **archive/snapshots/** holds 3 snapshots:
  - `2026-04-29_pre-v25-backup.html` (was `index.html.pre-v25-backup` at root)
  - `2026-05-01_pre-layout-overhaul.html` (was `dev/index.html.pre-layout-overhaul-backup`)
  - `2026-05-02_pre-modular-split.html` (the snapshot taken at the start of this refactor)
- **archive/handoff_v2_abandoned.md** — was `HANDOFF_V2.md`; prepended with a stale-marker.
- **CLAUDE.md** — new active project playbook.
- **README.md** — new orientation doc.
- **CHANGELOG.md** — new version-notes file.
- **bin/release.sh** — one-liner script to mirror dev/ → root.

## What did NOT change

- **Root `index.html` is untouched** — still the 957KB / 22,241-line monolith you had before.
- **Root has no `css/` or `js/` directories yet** — those will be created by `bin/release.sh` when Dan runs it.
- **No git commits or pushes.** Working tree is clean of staging/commits.

## Verification ledger

### Phase 0 — Snapshots & rollback ✅
- 3 snapshots created in `archive/snapshots/`.
- Tested rollback path: `cp archive/snapshots/2026-05-02_pre-modular-split.html dev/index.html` restores the original 22,241-line file.

### Phase 1 — CSS extraction ✅
- Lines 10–1582 of the original extracted to `dev/css/styles.css` (1,573 lines).

### Phase 2 — JS module extraction ✅
- 73 files extracted with `sed`. Each file:
  - Starts with `'use strict';` (preserves classic-script per-file strict mode).
  - Has a top comment declaring its source line range.
- One mid-extraction issue (file 14 had wrong range — included occlusion + live-section-cut content) was caught and fixed.
- One docstring-boundary issue (line 3039 of original was at the file 02/03 boundary) was caught and fixed.

### Phase 2b — Thin-shell rewrite ✅
- New `dev/index.html` composed of:
  - Lines 1–8 of original (DOCTYPE + head + meta + CDN scripts)
  - `<link rel="stylesheet" href="css/styles.css">` (replaces 1,573 lines of `<style>`)
  - `</head>` (manually emitted)
  - Lines 1585–2800 of original (HTML body — preserved verbatim)
  - 73 `<script src="js/NN-...js"></script>` tags in numeric order
  - `</body></html>`

### Phase 3 — Static QA ✅
- All 73 JS files pass `node --check`.
- 395 top-level function declarations across 73 files.
- One pre-existing duplicate in source (`v25Mem2Thickness` in `68-v25-tools.js`) — preserved as-is per "no bug fixes during structural refactor" rule.
- No duplicate top-level `const`/`let` names.
- All 20 sampled critical globals defined exactly once and reachable.

### Phase 4 — Documentation ✅
- `CLAUDE.md` written (active playbook — file map, workflow rules, conventions, known issues, Phase-2/3 priorities).
- `README.md` written (project overview, run instructions, AS standards reference).
- `CHANGELOG.md` written (V25.modular entry).
- `HANDOFF_V2.md` archived to `archive/handoff_v2_abandoned.md` with stale-marker.

### Phase 5 — Browser smoke test ✅
- Local HTTP server started via Claude Preview MCP.
- App loads at `http://localhost:8765/index.html`.
- DevTools console: **clean** (zero errors, zero warnings, zero info messages — exactly the original behaviour).
- All 20 critical globals (canvas, ctx, viewport, blocks, tool, project, V14/V22/V25 functions, THREE, jspdf) defined and reachable.
- `mkObj()` + `addObj()` round-trip — 4 objects placed and tracked.
- `setTool('plate')` — tool state updates correctly.
- `snapUV(blocks[0], 100.3, 200.7)` returns `[100, 200]` (default 10mm grid).
- `real2px(blocks[0], 0, 0)` returns valid sheet coords.
- `render()` runs cleanly.
- `updateStatus()` runs cleanly.
- `v3dRebuildScene()` runs cleanly.
- `applySheetMode('3d')` and `applySheetMode('2d')` toggle cleanly; body class updates correctly.
- `v25Add('anchor', ...)` adds a V25 anchor entity to `entities2D.elevation`.
- `projectAddSheet('Sheet 2')` increments `project.sheets.length`.
- `projectSwitchSheet(0)` restores active sheet's objects (4 objects re-loaded into `objects3D`).
- JSON save payload (795 bytes) parses cleanly and round-trips through the project structure.
- Final `render()` after all the above: **no errors**.
- Screenshot taken at 1600×1000 viewport — visual confirms tile palette, A1 sheet with title block, status bar, all themes.

### Phase 6 — Mirror dev → root ⏸ DAN
- **Not run automatically.** Per workflow rules ("After Dan approves, copy dev → root"), the mirror is Dan's call.
- Helper script ready: `bin/release.sh` (executable, validated content).
- Steps for Dan:
  ```bash
  cd /Users/danielmccarron/Documents/GitHub/bt-struct-tools/2D-Details
  open dev/index.html               # or http://localhost:8765 if a server is running
  # Click around, verify it works
  ./bin/release.sh                  # mirrors dev/ → root
  open index.html                   # verify root works
  git status                        # review before commit
  ```

### Phase 7 — Finalise ✅
- This file (PROGRESS.md) updated with the final state.

---

## Outstanding decisions for Dan

When you sit down to review:

1. **Is the file split granularity right?** 73 files, average 270 lines, biggest 1,415 lines (`39-events.js`). If you want fewer/larger files, say so — easy to consolidate. If you want even finer (e.g. split `39-events.js` into per-tool handlers), that's the natural Phase 2 work.

2. **Does any file feel mis-named?** Names are documented in `CLAUDE.md`. Renames are mechanical — happy to do them.

3. **Should the mirror script also commit?** I deliberately left `bin/release.sh` to NOT commit, per "Dan handles all git commits". If you want the script to also `git add ... && git commit`, I can add that.

4. **Should `archive/snapshots/` be gitignored?** They're 2.4 MB total. Currently NOT gitignored — they'd be tracked when you commit. Pros: rollback via `git`, can roll forward to specific version on any machine. Cons: repo grows by 2.4MB every refactor pass. Recommendation: keep tracked for now; revisit when the repo gets big.

5. **`MODULAR_REFACTOR_PLAN.md` and `PROGRESS.md`** are useful for this round but stale once V25.modular is in. After Dan commits, recommendation: move both to `archive/` as `2026-05-02_modular-refactor-plan.md` and `2026-05-02_modular-refactor-progress.md` — they're a record of what was done and why.

6. **`bin/release.sh`** could grow into a real release tool with a few small additions (Phase 2):
   - Auto-generate the script-tag list in dev/index.html from `dev/js/*.js`
   - Bump version in CHANGELOG.md
   - Optionally minify CSS / JS for a `release/` build artefact (if commercial release ever wants that)

---

## What this refactor enables

- **Editing is faster.** A change to selection rendering touches `dev/js/36-selection-highlights.js` (128 lines), not line 10,681 of a 22k-line monolith.
- **Permission prompts are fewer.** `Edit` operations on small files reliably target unique strings.
- **Adding a feature has a clear home.** "This belongs in `events.js`" or "this needs a new `js/65-something.js`" replaces "this gets appended to the bottom of the giant file."
- **Phase 2 work** (break up `39-events.js`, lift globals into `appState`, replace V25 monkey patches with proper extension hooks) becomes safe and reviewable in isolation.
- **A future ESM migration** has a foothold: when boundaries are clean, switching to `import`/`export` is mechanical per file.
- **Vendor-locking three.js / jspdf to `lib/`** for offline + commercial-release-stable use is now a one-step change.

---

## Files I touched (audit)

### Created
- `dev/css/styles.css` (1,573 lines)
- `dev/js/01-config.js` through `dev/js/74-v26-bb-rail.js` (73 files)
- `dev/index.html` (rewrite — 1,308 lines, vs 22,241 before)
- `archive/snapshots/2026-04-29_pre-v25-backup.html` (moved, was `./index.html.pre-v25-backup`)
- `archive/snapshots/2026-05-01_pre-layout-overhaul.html` (moved, was `./dev/index.html.pre-layout-overhaul-backup`)
- `archive/snapshots/2026-05-02_pre-modular-split.html` (snapshot of dev/ at start)
- `archive/handoff_v2_abandoned.md` (moved, was `./HANDOFF_V2.md` + stale-marker prefix)
- `CLAUDE.md` (new active playbook)
- `README.md` (new orientation)
- `CHANGELOG.md` (new version-notes file)
- `MODULAR_REFACTOR_PLAN.md` (the plan itself)
- `PROGRESS.md` (this file)
- `bin/release.sh` (mirror helper)
- `.claude/launch.json` (recreated for the preview server)

### Removed (from working tree)
- `index.html.pre-v25-backup` (root) — moved to `archive/snapshots/`
- `dev/index.html.pre-layout-overhaul-backup` — moved to `archive/snapshots/`
- `HANDOFF_V2.md` (root) — moved to `archive/handoff_v2_abandoned.md`

### Untouched (deliberately)
- `index.html` (root) — still the 22,241-line monolith
- `archive/v1/` — kept exactly as-is
- `Images/`, `Thumbnails-SVG/` — unchanged
- `dev/design-handoff/` — V25 design integration tracking, kept as-is

---

## If you need to roll back the entire refactor

```bash
cd /Users/danielmccarron/Documents/GitHub/bt-struct-tools/2D-Details
cp archive/snapshots/2026-05-02_pre-modular-split.html dev/index.html
rm -rf dev/css dev/js
# Optionally also restore root state:
mv archive/snapshots/2026-04-29_pre-v25-backup.html ./index.html.pre-v25-backup
mv archive/snapshots/2026-05-01_pre-layout-overhaul.html ./dev/index.html.pre-layout-overhaul-backup
# But the root index.html itself was never touched — no restore needed there.
```

The new doc files (CLAUDE.md, README.md, CHANGELOG.md, bin/release.sh) can stay or be deleted depending on whether you want to retry the split later.

---

*End of progress tracker.*
