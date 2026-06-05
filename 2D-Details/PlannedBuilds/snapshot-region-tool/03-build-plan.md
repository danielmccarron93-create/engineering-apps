# Snapshot tool — build plan

Phased so each slice is coherent and verifiable. Built by an orchestrated workflow:
**Research (parallel, read-only) → sequential implementation (no concurrent edits to shared files) → parallel adversarial review → fix**, then **main-loop browser verification + visual tuning**.

No `node` on this machine → verification is browser-load (preview harness) + clean console + `preview_eval` draw-capture. Never touch git (parallel build sessions; Dan commits).

## Phase 0 — Research (read-only)
Extract verbatim, with file:line refs:
1. `drawSheet`/`render` internals (`22`): the exact per-entity loop, how `blk` + colour-scheme `cs` are built, the order of page-fill / `drawPdfBackground` / entities / title-block / overlays, and the existing global-swap save/restore list used by `exportSheetToPDFRaster` (`44`).
2. `71`: verbatim `blockWall` (edge-grip) + `mat` (rotate) + `mem2` cases across `v25EntBounds`, `v25EntHandles`, `v25Move`, `v25EntHit` — the patterns to mirror. Note the in-flight uncommitted edits; identify safe insertion points.
3. `42`: how 2D vs 3D mode is detected; the exact `G` grid-toggle block to gate; how `Cmd+V` is currently handled; safe insert points for the paste branches.
4. `39`: how a tool's mousedown/move/up/dblclick is dispatched; the closest existing rubber-band/polygon tool (measure `82`, polyline, v25 polygon plate) to mirror; where to add `tool==='snapshot'` hooks.
5. `83`: confirm `_resolveDoc`, `renderPdfPageToBitmap` scale/clamp idiom for the new region helper; `04`/`50` exact `pdfBlobs` seed + base64 walk to mirror for `imageBlobs`.
6. `74` + `index.html`: BB-rail tile registration pattern, active-tile highlight, SVG sprite + numbered-`<script>` insertion point for `86`.

## Phase 1 — PDF zone helper (`83`)
Add `window.renderPdfPageRegionToCanvas(file, bg, zoneMm, dpi)` (§3 of design).
**Test:** `preview_eval` — import a PDF, call the helper for a known sub-rect, assert the returned canvas has expected px dims and non-blank content (sample pixels).

## Phase 2 — Core (`NEW js/86`)
Entity defaults, runtime image cache, `snapCaptureRegion` compositor, `drawSnapshot2D`, snip-tool pointer logic (`snapDown/Move/Up/DblClick/Key`), snip-marquee overlay, Polaroid-flash overlay, `snapClip` paste/paste-in-place helpers, capture-flash constants. (Reads globals; defines `window.*`/bare globals; classic `'use strict'`.)
**Test:** `node --check` is unavailable → load in browser, console clean; `preview_eval` to call the compositor on a synthetic region and assert a PNG dataURL is produced.

## Phase 3 — Wiring (`index.html`, `74`, `42`, `41`, `39`, `69`, `07`)
Script tag; BB-rail tile + icon; `G` gated to 2D + paste branches; `setTool` clears snip state; `39` thin hooks; `v25DrawEnt` dispatch branch; globals.
**Test:** `G` in 2D enters Snapshot (tile highlights); `G` in 3D still toggles grid; drag draws the camera marquee; release captures (flash plays); `Cmd+V` pastes at cursor; `Cmd+Shift+V` pastes in place; switch page + `Cmd+Shift+V` lands at same coords.

## Phase 4 — Persistence (`04`, `50`)
Seed `imageBlobs`/`_nextImageId`; base64 round-trip in `.sdproj`.
**Test:** capture+paste, save `.sdproj`, reload → image restored at same place/size/opacity. IndexedDB session restore across reload (no `50` change needed) → restored.

## Phase 5 — Selection / resize / inspector (`71`)
Bounds, hit-test (area, ranks low), handles (corners+edges+rotate), move/resize (corner aspect-lock, edge free, rotate snap), inspector (opacity, W/H, lock-aspect, reset).
**Test:** select via marquee; drag moves; corner drag scales aspect-locked; edge drag stretches; rotate snaps; opacity slider fades; a small member drawn *on top* still selects on click (snapshot ranks low).

## Phase 6 — DXF skip + CHANGELOG (`45`)
Skip `snapshot` in DXF with a `console.info` note; CHANGELOG line.
**Test:** DXF export of a sheet with a snapshot emits valid DXF (no snapshot geometry, no crash).

## Phase 7 — Review + browser verification + visual tuning (main loop)
- Parallel adversarial review: correctness, integration (esp. compositor drift, paste-in-place coords, cross-file blob copy), memory/persistence, convention adherence (`'use strict'`, globals, `LW`, no floating buttons), quality bar.
- Main-loop: full browser smoke (native page + PDF page), STP-6011 quality glance, **tune the snip marquee + Polaroid flash feel**.

## End-to-end acceptance (the headline)
Import a PDF detail → `G` → outline it → crisp high-DPI capture (Polaroid flash) → new blank page → `Cmd+V` → drop opacity to ~30% → trace with a UB + plate + bolts → DXF/PDF export the traced result. Looks at least as clean as STP 6011.
