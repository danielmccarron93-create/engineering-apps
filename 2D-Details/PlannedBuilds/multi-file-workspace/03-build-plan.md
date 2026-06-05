# 03 — Build plan (6 phases, each independently testable)

Builds on `02-design.md`. Every phase ends with the app **working and committable**. Run `node --check` on every touched/new JS file, then a browser smoke test, at each boundary. Per `CLAUDE.md`: edit `js/`/`index.html`/`css/` directly, no build step, classic `<script>` with `'use strict';`, leave git to Dan.

**Recommended ordering vs siblings:** land this **after** the in-review siblings are committed (it changes the top-level model; rebasing the `project`-repoint against half-finished branches is painful). See README → Overlap.

---

## Phase 0 — Per-page-size groundwork (no behaviour change)

Goal: introduce per-page sizing with native defaults so the app is **byte-identical**, before any multi-file or PDF work.

1. `js/01-config.js`: add `PAGE_SIZES`, `PT_TO_MM`, `activePage()`, `activePageSize()`. Keep `SHEET`.
2. `js/05-state.js`: `_projectMakeSheet` stamps `size:{A1}, paper:'A1', hasTitleBlock:true, bg:null`; snapshot/restore copy them; add `migratePage(p)` and call it from `_projectLoadSheet` (+ load paths).
3. Route `SHEET.W/H` reads through `activePageSize()` in `js/22-render-core.js` (`drawSheet`), `js/63-layout.js` (`fitToView`/`layoutBlocks`/`resize`), and **`js/08-coords.js`** (the Y-flip). 
4. **Test:** existing single project, 2D + 3D, looks/zooms/fits/exports exactly as before. Temporarily force a page `size` to A3 in the console and confirm the rect, fit, and Y-flip are correct (then revert). *This de-risks the geometry before anything depends on it.*

**Boundary:** app identical for native A1; per-page size proven on a forced A3.

---

## Phase 1 — Workspace + file tabs (native files only, no PDF)

Goal: multiple native files open at once.

1. `js/04-workspace.js` (new): `workspace`, `workspaceActiveFile/SwitchFile/AddFile/OpenFile/CloseFile/RenameFile`, `workspaceInit` (seed `files[0]` from current globals — session restore comes in Phase 2). Repoint `project`. Register script in `index.html` **before** `05-state.js`.
2. `js/73-init.js`: call `workspaceInit()` instead of `projectInit()`.
3. `js/49a-file-tabs.js` (new) + `index.html` markup: `renderFileTabs`, `#btnAddFile` menu (New file / Open .sdproj…; PDF disabled-soon for now), empty-file landing overlay (New blank A1 page / Open saved file; PDF soon). CSS reuse `.sheet-tab*`.
4. `js/50-project.js`: `importProject` → `workspaceOpenFile` (new tab, no clobber); `exportProject` saves the **active** file + per-page fields.
5. `js/62-toolbar.js`: wire `newFile`/`openFile`; `#btnAddFile`.
6. `js/74-v26-bb-rail.js`: confirm `renderPagesTab` follows the active file (it does, via repoint); toggle the empty-state overlay on page-count change.
7. **Test:** open 2 native files; switch tabs (drawing + rail swap correctly, neither clobbers the other); add/delete pages per file; rename a file; close a file (confirm-if-dirty; last file can't be closed); save each to `.sdproj` and reopen into a new tab.

**Boundary:** full multi-file with native pages; PDF still "soon".

---

## Phase 2 — IndexedDB session (auto-restore)

Goal: relaunch restores all open files/pages.

1. `js/84-session-store.js` (new): open DB; `serializeWorkspace`/`deserializeWorkspace`; `markSessionDirty()` (debounced `sessionSave`); `sessionRestore()`. Guard all IndexedDB in try/catch.
2. Fan-in `markSessionDirty()` from mutation points (`addObj/delObj/addEnt2D/undo/redo`, `_projectLoadSheet`, workspace add/close/rename).
3. `js/04-workspace.js`: `workspaceInit` calls `sessionRestore()` first; falls back to seed.
4. Per-file `dirty` flag: set on mutate, clear on `exportProject`; tab dot in `renderFileTabs`.
5. **Test:** draw across 2 files, hard-reload the tab → both files + active pages restored. Quota/try-catch: simulate failure → app still draws, manual save works.

**Boundary:** crash-safe multi-file; PDF still "soon".

---

## Phase 3 — PDF import (pages appear; background not yet rendered)

Goal: a PDF becomes a file of correctly-sized, title-block-free pages.

1. `index.html`: pdf.js CDN script + worker config; add the Import-PDF entry points (un-"soon" the menu + landing button).
2. `js/83-pdf-document.js` (new): `pdfImportFile(File)` per `02-design.md` §4.2 — new file, one page per PDF page, real `size`, `paper` classified, `hasTitleBlock:false`, `bg:{...}`; store bytes in `file.pdfBlobs`. Keep `pdfDocCache`.
3. Session: `pdfBlobs` serialize/restore (ArrayBuffer) in `js/84`.
4. `js/50-project.js`: `exportProject` embeds `pdfBlobs` as base64; `importProject` decodes them.
5. **Test:** import a multi-page **A3** PDF and a mixed-orientation PDF → file named from the PDF, N pages in the rail at correct A3/portrait sizes, no title block, blank page rect drawn at the right size. Save `.sdproj` (PDF embedded) → reopen → pages + sizes intact. Session restore keeps the PDF.

**Boundary:** PDF pages exist & persist; they render as blank correctly-sized pages (background next).

---

## Phase 4 — Crisp PDF background render + full-toolset markup

Goal: the PDF shows through, crisp, and you can mark up on it.

1. `js/83-pdf-document.js`: `drawPdfBackground(ctx, page)` + async `renderPdfToBitmap` + zoom-bucket LRU cache (`02-design.md` §4.3). Re-`requestRender()` when a bitmap lands.
2. `js/22-render-core.js`: call `drawPdfBackground` first inside `drawSheet` (under all entities).
3. **Test:** the consultant PDF renders; zoom to 400% → re-renders crisp (not blurry); pan stays aligned; switching pages swaps backgrounds. Place a dimension, a note+leader, a cloud, a hatch, and a member on a PDF page → all land at the right spot and look STP-6011 crisp over the PDF. Confirm async fallback (brief "rendering…", no janky blank frame).

**Boundary:** the screenshot workflow (mark up a PDF) works end-to-end on screen.

---

## Phase 5 — Shift+scroll nav, export, polish

Goal: navigation + output + quality bar.

1. `js/39-events.js` + `js/07-globals.js`: Shift+scroll page-nav with `pageNavAccum` debounce (`02-design.md` §7).
2. `js/44-pdf-export.js` / `js/51-multi-page-pdf.js`: per-page jsPDF format/orientation; raster PDF bg (~300dpi) under the vector overlay; verify a mixed file (native A1 + PDF A3 pages) exports each page at its own size.
3. Polish: file-tab overflow (many files) — scroll/elide; landing visuals; rail per-page size/kind label; pdf.js CDN-miss degradation; LRU cache cap under a big PDF.
4. **Quality-bar pass:** compare a marked-up PDF page's dimensions/notes/leaders against STP-6011 lineweights/placement; fix before "done".
5. **Test:** the `05-test-cases.md` matrix end-to-end. DevTools console clean throughout.

**Boundary:** v1 complete; hand to Dan for review.

---

## Progress tracker

| Phase | Status | Notes / deviations |
|---|---|---|
| 0 — page-size groundwork | ✅ done + browser-verified (2026-06-05) | `activePageSize()`/`PAGE_SIZES` in 01; per-page `size/paper/hasTitleBlock/bg` in 05; 22/63 route through it. **08-coords needed NO change** (Y-flip pivots on `block.sheetY`, not sheet height). Native A1 byte-identical; A3 fit verified (747×528 fits). |
| 1 — workspace + file tabs | ✅ done + browser-verified (2026-06-05) | `js/04-workspace.js` (repoint trick), `js/49a-file-tabs.js` (tabs + landing), `.file-*` CSS, 73 `workspaceInit`, 74 `window.renderPagesTab`. Gaps fixed post-review-miss: `.file-tab` CSS, `importProject`→`workspaceOpenFile` (new tab), 62 File-menu dispatch. Verified: multi-file isolation, switch snapshot/restore, close (never zero), landing button, save/load round-trip. |
| 2 — IndexedDB session | ✅ done + browser-verified (2026-06-05) | `js/84-session-store.js` (IDB, structured-clone, suspend-during-restore, debounced); `workspaceInit` async-restores without blocking boot; `workspaceTouchActive` on 7 mutation points; dirty flag clear on save. **Verified: draw→reload restores; a 2-page imported PDF + its 3634-byte blob survive structured clone byte-exact.** |
| 3 — PDF import | ✅ done + browser-verified (2026-06-05) | `js/83-pdf-document.js` (pdf.js import, `classifyPaper`, `pdfImportPick`, `pdfDocCache`); pdf.js 3.11.174 CDN + worker; un-soon entry points; base64 `.sdproj` round-trip (`_encodePdfBlobs`/`_decodePdfBlobsInProject`). **Verified: 2-page A3-landscape+A4-portrait test PDF imports as a new file with correct per-page sizes/orientation/`hasTitleBlock:false`/`bg`; tabs+rail update; base64 round-trips byte-exact.** Review fixed page-add/delete persistence + non-A1 restore re-fit. |
| 4 — PDF background + markup | ✅ code done + reviewed; raster un-runnable in THIS preview (env, not code) | `js/83` `drawPdfBackground` (sync, zoom-bucket LRU cache, lazy doc re-open post-restore, `bg.rotation` no double-transform, never throws into render); hook in `drawSheet` (22). **Verified:** parse path works; the rect aligns exactly to the page fill (the "rendering…" hint sits at the page's top-left); native pages no-op cleanly; code reviewed correct. **Could NOT see the rasterised bitmap** — the preview tab runs `visibilityState:hidden` → `requestAnimationFrame` paused → pdf.js `page.render()` stalls (every PDF hangs at render; worker + main-thread + onContinue-bypass all confirmed). **Environmental, not a bug** — needs Dan's **visible** Chrome to eyeball the bitmap once. |
| 5 — shift-scroll + export + polish | ✅ done; nav+rail browser-verified, export code-reviewed (raster needs visible browser) | **Shift-scroll nav VERIFIED** (`07` `pageNavAccum` + `39` wheel branch): down→next, up→prev, clamps at both ends (no wrap), plain & ctrl wheel still zoom. **Rail labels VERIFIED** ("Page 1 · A3 · 2D mode"). Export: per-page jsPDF format/orientation (`_pdfPageFormat`, 44); PDF-bg pages pre-rastered ~300 DPI (`renderPdfPageToCanvas`) stamped under the vector overlay via `window.setPdfExportRaster` (83); `exportProjectToPDF` sets `activeSheetIdx` per page (fixes latent "all pages at active page's size"); exporters now `async`; native A1 byte-identical. Review fixed missing `migratePage` in project export + a silent-blank-export → now alerts. **Export raster shares the Phase-4 render → same hidden-tab limitation; native vector export is fine; verify PDF-page export in a visible browser.** |

**Carry-forward for Batch 3 (from Batch-2 review):**
- Render PDF with `page.getViewport({scale, rotation: bg.rotation})` and **NO extra transform** — `getViewport({scale:1})` at import already baked `/Rotate` into the stored `size`, so the bitmap must be generated at the same rotation to match.
- `pdfDocCache` + the new bitmap cache must be **LRU-capped** (memory) — deferred from Batch 2.
**Known limitation (pre-existing, OUT OF SCOPE — flag, do not fix in the delicate v2 path):** 2D-mode **v2 plates live in one global `v2.appState.model`**, so they are NOT isolated per-file/session yet, and the `.sdproj` path never embedded them. Needs a dedicated follow-up routing the v2 model into the per-file structure.

**Verification harness:** no-cache python server `/tmp/sd-mfw-serve.py` (launch.json `sd-mfw`, port 8922) serving `/tmp/sd-mfw-verify`; re-sync from live repo via `/tmp/sd-mfw-sync.sh`. (macOS TCC blocks serving from `~/Documents`; node/npm unavailable, so the browser is the gate. Stale-cache bit us once — hence no-cache headers.)
**Review note:** Batch-1's schema-based review agents failed to emit StructuredOutput (3/3). Compensated with thorough manual browser verification. Batch 2 uses prose reviews + a fix agent instead.

Update after each phase: status, what landed, any deviation from this plan, and the test result.
