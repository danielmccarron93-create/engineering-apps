# 04 — Open questions

## Answered — the six design forks (Dan, 2026-06-04)

These were the architecture-defining decisions. All answered; the design reflects them.

| # | Question | Decision |
|---|---|---|
| Q1 | How are imported PDF pages rendered & stored? | **Live crisp re-render** — pdf.js; original PDF bytes stored on the file; each page re-rendered sharply at any zoom (zoom-bucket bitmap cache). Bigger saves, sharpest result. |
| Q2 | PDFs aren't A1 — how to size pages? | **Per-page true size** — each page carries its own `size`/orientation; native pages default A1; render/fit/export become page-size-aware. |
| Q3 | Draw the StructDraw title block on a marked-up PDF page? | **No** — imported pages show PDF + markup only (`hasTitleBlock:false`, no margins). Native detail pages keep the Bligh Tanner title block. |
| Q4 | What persists across sessions with several files open? | **Per-file `.sdproj` save (as today) + an IndexedDB session** that auto-restores every open file/page on relaunch (IndexedDB because PDFs exceed the localStorage cap). Not a combined workspace file. |
| Q5 | What can you draw on a PDF-backed page? | **Full 2D toolset** — members/plates/bolts/hatches/dimensions/notes/leaders, same as a blank page. (Also the lower-effort option — a PDF page is just a 2D sheet with a background.) |
| Q6 | Scale calibration for measuring on an imported PDF? | **Deferred to a follow-on.** v1 measures in paper-mm on PDF pages; add Bluebeam-style click-two-points-type-distance calibration later. |

---

## Small defaults taken — confirm, but not blocking

The build proceeds on these unless Dan says otherwise:

1. **New file = empty + landing**, not a pre-made blank page. A brand-new file shows the empty-state (Import PDF / New blank A1 page / Open saved file). *Default: empty + landing.*
2. **Closing the last file** isn't allowed — closing it opens a fresh empty file instead (the app always has ≥1 file). *Default: yes.*
3. **Mixed pages in one file** are allowed — you can add a native A1 detail page into a PDF-imported file, or import a PDF into a native file (`kind` becomes `'mixed'`). *Default: allowed.*
4. **File tabs live in the top bar** where `#sheetList` sits, as a **new** `#fileTabs` element (the dead hidden `#sheetList` is left alone). *Default: yes — top-bar file tabs, left-rail pages.*
5. **Terminology:** top tabs = "Files", rail = "Pages"; rename File-menu "New sheet…" → "New page…", default page names "Page N". Field name stays `sheets`. *Default: yes.*
6. **pdf.js delivery:** CDN in v1 (matches today's three.js/jspdf); vendor to `lib/` later under the Phase-2 "vendor CDN" task. *Default: CDN now.*
7. **Export fidelity of PDF pages:** v1 rasters the PDF background at ~300dpi and overlays vector markup in the exported PDF (jsPDF can't re-embed source PDF pages). True vector passthrough (pdf-lib) is a follow-on. **Worth a nod from Dan** — is 300dpi raster acceptable for issuing a marked-up set, or is vector passthrough needed sooner? *Default: raster + overlay in v1.*
8. **Default file name on launch / new file:** seeded from the title-block project field (as `exportProject` already does) or "Untitled". Renamed via double-click on the tab. *Default: title-block project name, else "Untitled".*

---

## Genuinely deferred (named so they're not silently dropped)

- PDF-scale calibration (Q6).
- Vector passthrough on PDF export (small-default #7).
- Page reorder by drag in the rail.
- Cross-file copy/paste of entities.
- Content thumbnails in the Pages rail.
- Offline (vendored) pdf.js.

---

## Notes for the build chat

- **Rebase first.** Confirm the in-review siblings (`39`/`45`/`71`/`72`/`74`/`index.html`/`edit-plate.js`) are committed before starting, so the `project`-repoint and per-page-size edits don't fight half-finished work.
- **De-risk geometry in Phase 0.** The `08-coords.js` Y-flip on a non-A1 page is the single highest-risk edit — prove it on a forced-A3 page before anything depends on it.
- **Async render discipline.** Never block `render()` on pdf.js; always draw a cached/placeholder frame and `requestRender()` when the bitmap lands.
