# StructDraw — Multi-File Workspace + PDF Import

Status: 📐 Planning (all 6 design forks answered 2026-06-04 — ready to flesh build plan into a build chat)
Last touched: 2026-06-04
Owner: Dan McCarron
Scope: Let the user keep several project files open at once (browser-style file tabs across the top, "+" to add/open), each file holding any number of pages in the left Pages rail. Add a first-class **PDF import** path: drop in a PDF and it becomes a new file whose pages are the PDF's pages, sized to the real paper, ready to mark up with the full 2D toolset. Shift+scroll moves between pages; plain scroll zooms.

---

## TL;DR for a fresh chat

You're picking this up cold. Do this in order:

1. **Read the project root `CLAUDE.md`** — workflow rules, the 83-file `js/` map, the file-number bands, the two-mode requirement, the "Adding a new member…" checklist. Non-negotiable.
2. **Read `PlannedBuilds/README.md`** — the dashboard. Several siblings are "In review" (built, not yet committed) and touch some of the same files (`39`, `45`, `71`, `72`, `74`, `index.html`) — see the *Overlap* section below.
3. **Read this README end-to-end**, then `02-design.md` (the meat: data model, the `project`-repoint trick, per-page sizing, pdf.js pipeline, IndexedDB session, file-tabs UI).
4. **Read `04-open-questions.md`** — the six big forks are answered; a handful of small defaults are noted there for confirmation.
5. **If a plan chat**: refine the design / open questions. Don't write code.
6. **If a build chat**: walk `03-build-plan.md` phase by phase, test at each boundary, update `03`'s progress tracker.

---

## The idea

Today StructDraw opens with exactly one project (`project` in `js/05-state.js`) — a set of "sheets" the user draws details on, saved/opened as a single `.sdproj`. The left rail's **Pages** tab already lists those sheets; the top bar has a (currently hidden) tab strip.

Dan wants to work on **several projects at once**, the way Bluebeam Revu or a browser holds multiple documents: a row of **file tabs across the top**, a **"+"** to start a new file or open a saved one, and the **left Pages rail showing the pages of whichever file is active**. On launch the app opens one file, named from the last save (e.g. *"2024.0094 MTA Details"*). Each file saves independently as you go.

The headline new capability is **PDF import**. A senior engineer spends a large part of their day marking up other people's drawings — architect's plans, the project's issued-for-construction set, a fabricator's shop drawings. Dan wants to **drop a PDF in and have it become a new file**, named after the PDF, with **every PDF page listed as a page** in the rail. Each page renders the real PDF crisply at any zoom, and he marks it up with the **full 2D toolset** (members, hatches, dimensions, notes, leaders, clouds) — exactly like a blank detail page, just with the consultant's drawing showing through underneath. Navigate pages by clicking in the rail or by **Shift+scrolling** the canvas (plain scroll still zooms).

This turns StructDraw from "a tool for drawing my own A1 details" into "the one place I draw details **and** mark up everyone else's drawings, across every live project, without juggling files."

---

## Why this matters (the engineer's day)

A structural engineer at Bligh Tanner rarely works one project at a time. On any given afternoon Dan might detail a connection on project A, redline an architect's RFI sketch on project B, and check a fabricator's shop drawing on project C. Right now StructDraw can only hold one of those at once, and it can't open a PDF at all — so the markup work goes to Bluebeam and never comes back. Multi-file + PDF import is what makes StructDraw a place he can *stay* all day.

The PDF-markup workflow is the same one Bluebeam Revu nails and the app's V26 "BB-rail" already imitates: open the document, the pages stack down the side, scroll/click between them, mark up on top. Matching that interaction is the bar. The drawing-quality bar for the markup itself is unchanged: **STP Typical Structural Details PDF p.85, details 6011.1–6011.6** — a dimension or note dropped on a PDF page must look as crisp and correct as one on a native detail sheet.

---

## Scope

**In scope (v1):**
- A **workspace** holding multiple open files; each file is the existing `project` shape (pages, active-page index, title-block metadata). The live `project` global becomes a pointer at the active file — all existing per-page machinery is reused unchanged.
- **File tabs** in the top bar (name · dirty-dot · close ×), a **"+"** that opens *New file / Open .sdproj… / Import PDF…*, click-to-switch, double-click-to-rename.
- **Per-page size & orientation** — pages carry their own `size {w,h}` (native pages default to A1; imported pages take the PDF page's real size). Render, fit, and export become page-size-aware.
- **PDF import** via **pdf.js** — a PDF becomes a new file (named from the PDF), one page per PDF page, `mode:'2d'`, **no StructDraw title block/margins**, original PDF bytes stored on the file.
- **Crisp PDF background render** — the active page's PDF renders to a cached offscreen bitmap at the current zoom and is drawn beneath the markup; re-rendered sharply when the zoom changes. Async with a graceful "rendering…" fallback.
- **Full 2D toolset on PDF pages** — members/plates/bolts/hatches/dimensions/notes/leaders all work on top (this is the *lower-effort* option — a PDF page is just a 2D sheet with a background).
- **New-empty-file landing** — a brand-new file shows a clean empty state in the drawing area: **Import PDF · New blank A1 detail page · Open saved file**.
- **Shift+scroll = page navigation** (next/prev page in the active file); plain scroll = zoom (unchanged); trackpad-debounced.
- **Per-file `.sdproj` save/open** (PDF bytes embedded base64 so the file is self-contained & portable) **+ an IndexedDB session** that auto-restores every open file/page on relaunch (IndexedDB because PDFs dwarf the localStorage cap).

**Out of scope (defer to v1.x):**
- **PDF-scale calibration** (Bluebeam-style click-two-points-type-distance so measures read real lengths on an imported PDF). Measures on PDF pages read paper-mm for now. *Explicitly deferred per Dan, 2026-06-04.*
- **Vector passthrough on export** — exporting a PDF-backed page rasters the background at high DPI and overlays the vector markup (jsPDF can't re-embed source PDF pages). True vector passthrough (pdf-lib stamp) is a follow-on.
- **Page reordering by drag** in the rail (add/delete exist; reorder later).
- **Cross-file copy/paste** of entities between open files.
- **Thumbnails** of page contents in the rail (text cards for now).
- Offline pdf.js (vendored to `lib/`) — v1 uses CDN to match today's three.js/jspdf; vendoring rides the Phase-2 "vendor CDN" task.

**v1 success criteria:**
1. Two or more files open at once as top-bar tabs; clicking a tab switches the whole drawing + the Pages rail to that file; the other file's work is untouched.
2. "+" → *New file* opens an empty file with the landing; *Open .sdproj…* opens a saved file into a **new** tab (doesn't clobber the current one); *Import PDF…* creates a PDF-backed file.
3. Importing a 12-page A3 PDF yields a file named after the PDF with 12 pages in the rail, each at A3 size, no title block, the PDF crisp at 400% zoom.
4. The full 2D toolset places correctly on a PDF page; a dimension/note over the PDF matches STP-6011 crispness.
5. Shift+scroll steps one page per notch; plain scroll zooms.
6. Each file saves to its own `.sdproj` (PDF embedded); quitting and reopening the app restores every open file + active page from the IndexedDB session.

---

## Files touched (summary — full table in `02-design.md`)

| File | What changes |
|---|---|
| `index.html` | pdf.js CDN script + worker; `#fileTabs` + `#btnAddFile` markup in `.top-bar`; *New file / Open file / Import PDF…* in the File menu; 4 new `<script>` tags; a few SVG icons (file, pdf, plus). |
| `js/01-config.js` | Keep `SHEET` as the A1 native default; add `PAGE_SIZES` (A-series mm) + `activePageSize()`. |
| `js/05-state.js` | `_projectMakeSheet` gains `size` / `bg` / `hasTitleBlock`; snapshot/restore carry them; `projectInit` is superseded by `workspaceInit`. |
| `js/22-render-core.js` | `drawSheet` uses `activePageSize()`, draws the PDF background first, skips title-block/margins when `!page.hasTitleBlock`. |
| `js/63-layout.js` | `fitToView` / `layoutBlocks` / resize use `activePageSize()` not raw `SHEET`. |
| `js/39-events.js` | Wheel handler: `shiftKey` → page nav (debounced); plain → zoom (unchanged). |
| `js/74-v26-bb-rail.js` | `renderPagesTab` shows per-page size/kind, drives the active file (works via the `project` repoint). |
| `js/62-toolbar.js` | File-menu dispatch for `newFile` / `openFile` / `importPDF`; wire `#btnAddFile`. |
| `js/50-project.js` | `importProject` loads into a **new** file; `exportProject` saves the active file and embeds PDF bytes (base64). |
| `js/44-pdf-export.js`, `js/51-multi-page-pdf.js` | Per-page jsPDF page format; raster PDF backgrounds into the output. |
| `js/73-init.js` | Bootstrap calls `workspaceInit()` (restore IndexedDB session or seed file[0]); init pdf.js + session store + file tabs. |
| `CHANGELOG.md` | On ship. |

New files (proposed):
- `js/04-workspace.js` — workspace model: `files[]`, `activeFileIdx`, add/open/close/rename/switch; repoints the `project` global at the active file. (band 1)
- `js/49a-file-tabs.js` — top-bar file-tabs UI (`renderFileTabs`) + the new-empty-file landing overlay. (band 7)
- `js/83-pdf-document.js` — pdf.js loader, import → pages, offscreen render + zoom-bucket cache, `drawPdfBackground()` hook. (band 80–89 shared)
- `js/84-session-store.js` — IndexedDB workspace autosave (debounced) + restore-on-boot, incl. PDF blobs. (shared)

---

## Folder navigation

| File | Purpose |
|---|---|
| `README.md` | this file — start here |
| `01-context.md` | how files/sheets/pages work today; the Bluebeam markup workflow; why the bones already fit |
| `02-design.md` | data model, the `project`-repoint trick, per-page sizing, pdf.js render pipeline, IndexedDB session, file-tabs UI, shift-scroll, full Files-touched table |
| `03-build-plan.md` | 6-phase build plan, each phase independently testable |
| `04-open-questions.md` | the 6 answered forks + small defaults to confirm |
| `05-test-cases.md` | verification fixtures (multi-file switch, PDF import, per-page size, session restore) |

---

## Dependency / overlap with other in-flight ideas

Several siblings are **built-but-in-review** (uncommitted working-tree changes — see git status). This idea is mostly **new files + new functions**, so overlap is low and in different functions:

- **`index.html`** — everyone appends to the SVG sprite / script list; additive, rebase by appending.
- **`js/39-events.js`** — siblings touch mousedown/select branches; this idea touches only the **wheel** handler (`shiftKey` branch). No collision.
- **`js/74-v26-bb-rail.js`** — siblings touch `getDrawTabDef` (Draw tab tiles); this idea touches `renderPagesTab` + adds the top-bar file tabs (separate file). No collision.
- **`js/45-dxf-export.js` / `44` / `51`** — siblings add per-entity DXF branches; this idea changes **page-size** handling in export. Different concern; verify on rebase.
- **`js/22-render-core.js`, `63-layout.js`, `01-config.js`, `50-project.js`, `05-state.js`** — largely untouched by siblings; this idea owns the page-size ripple there.

**Sequencing:** this build is large and foundational (it changes the top-level data model). Recommend landing it **after** the small in-review siblings are committed, so its `project`-repoint doesn't have to be re-merged against half-finished branches. Build it in its own chat against a clean(ish) tree.

---

## How to start (copy-paste prompt for a fresh chat)

```
You're picking up the multi-file-workspace build idea for StructDraw.

1. Read /CLAUDE.md end-to-end (the project root playbook).
2. Read /PlannedBuilds/README.md (the dashboard) — note the in-review siblings.
3. Read /PlannedBuilds/multi-file-workspace/README.md and every other file in that folder.
4. Check /PlannedBuilds/multi-file-workspace/04-open-questions.md (6 forks answered; confirm the small defaults).
5. <PLAN or BUILD>:
   - PLAN: refine the data model / pdf.js pipeline / session design. Don't write code.
   - BUILD: walk /PlannedBuilds/multi-file-workspace/03-build-plan.md phase by phase.
     Test at each boundary (node --check + browser smoke). Update the progress tracker.
```
