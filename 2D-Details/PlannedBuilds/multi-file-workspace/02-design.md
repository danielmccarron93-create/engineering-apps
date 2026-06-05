# 02 — Design: data model, render pipeline, integration points

Builds on `01-context.md`. Every decision here reflects Dan's six answered forks (`04-open-questions.md`).

---

## 1. The data model

### 1.1 New top level: the workspace

```js
// js/04-workspace.js
let workspace = {
  files: [],          // [<file>, ...] — every open file
  activeFileIdx: 0,
  _nextFileId: 1,
};
```

### 1.2 A file = the existing project shape, extended

A **file** is structurally the current `project` object plus file-level metadata:

```js
file = {
  id,                 // workspace-unique
  name,               // "2024.0094 MTA Details" — shown on the top tab
  kind,               // 'native' | 'pdf' | 'mixed'  (origin hint; cosmetic)

  // --- the existing project fields (unchanged) ---
  sheets: [ <page>, ... ],   // field name stays `sheets` for back-compat
  activeSheetIdx: 0,
  _nextSheetId: 1,

  // --- new file-level fields ---
  pdfBlobs: {},       // { <pdfId>: Uint8Array }  original PDF bytes (one per imported PDF)
  dirty: false,       // changed since last .sdproj save? (drives the tab dot)
  diskName: null,     // last .sdproj filename, for re-save naming
};
```

> **Why keep `sheets` (not rename to `pages`)?** Every existing function reads `project.sheets`. Renaming would touch dozens of callsites for zero functional gain. The **UI** says "Pages"; the **field** stays `sheets`. Cheap, safe.

### 1.3 A page = the existing sheet shape, extended

```js
page = {
  // --- existing sheet fields (unchanged) ---
  id, name, mode,                 // mode: '2d' | '3d'
  sheetInfo,                      // title-block metadata
  objects3D, entities2D,
  secCutX, planCutY, objIdN, ent2dIdN,

  // --- new per-page fields ---
  size: { w: 841, h: 594 },       // mm — native default A1; PDF page = real size
  paper: 'A1',                    // 'A0'..'A4' | 'Letter' | 'custom' (label only)
  hasTitleBlock: true,            // native = true; imported PDF page = false
  bg: null,                       // null for native; PDF page → see 1.4
};
```

### 1.4 The PDF background descriptor

```js
page.bg = {
  type: 'pdf',
  pdfId: 'pdf1',     // key into file.pdfBlobs
  pageIndex: 3,      // 0-based page within that PDF
  rotation: 0,       // 0|90|180|270 (PDF page may declare its own; fold in)
};
```

The **bytes live once per file** (`file.pdfBlobs[pdfId]`), not per page — a 50-page PDF stores its bytes once and 50 pages reference it by `(pdfId, pageIndex)`.

### 1.5 Migration / back-compat

- An old single-`project` `.sdproj` (no `workspace`) loads as **one file** = that project; every page gets defaults `size:A1, paper:'A1', hasTitleBlock:true, bg:null`. A `migratePage(p)` helper stamps the new fields if absent (mirrors the existing `migrateAllMembers` pattern).
- `.sdproj` written by this build is **still a single file** (one project), now carrying the per-page fields + embedded PDF (base64). The *workspace* itself is not a file format — it lives only in the IndexedDB session (§5). (Open fork answered: per-file `.sdproj`, not a combined workspace file.)

---

## 2. The repoint trick — reuse all existing machinery

`project` stays a global, but becomes a **live reference to the active file**:

```js
// js/04-workspace.js
function workspaceActiveFile() { return workspace.files[workspace.activeFileIdx]; }

function workspaceSwitchFile(idx) {
  if (idx === workspace.activeFileIdx) return;
  if (typeof connWizState !== 'undefined' && connWizState) connWizCancel();
  _projectSnapshotActive();                 // live globals -> active page of active file (EXISTING)
  workspace.activeFileIdx = idx;
  project = workspace.files[idx];            // <-- repoint the global (project is a `let`)
  _projectLoadSheet(project.activeSheetIdx); // active page of new file -> live globals (EXISTING)
  renderFileTabs();
  if (typeof renderPagesTab === 'function') renderPagesTab();
}
```

Because `project` is a top-level `let`, a function in `04-workspace.js` can reassign it; all of `js/05-state.js`, the render loop, events, and the Pages rail keep reading `project.sheets` / `project.activeSheetIdx` and **operate on the active file with no edits**.

- `workspaceAddFile(name, kind)` — push a fresh file (one default native page, or zero pages for the landing — see §6), repoint, load.
- `workspaceOpenFile(parsedProject, name)` — wrap a loaded `.sdproj` as a new file, push, repoint, load. **Does not clobber** the current file.
- `workspaceCloseFile(idx)` — confirm if `dirty`; splice; never allow zero files (closing the last opens a fresh empty one); repoint to a neighbour.
- `workspaceRenameFile(idx, name)`.
- `workspaceInit()` — **replaces the `projectInit()` call in `73-init.js`**: restore the IndexedDB session if present (§5), else seed `files[0]` from the current default globals so a clean launch is identical to today.

> **Load-order note:** `js/04-workspace.js` loads *before* `js/05-state.js`. It only *declares* `let workspace` at load; every function that reads `project` / calls `_projectLoadSheet` runs later (boot + events), by which time `05-state.js` has defined them. `let project` stays declared in `05-state.js`; `workspaceInit()` reassigns it. Verify with `node --check` + a boot smoke test.

---

## 3. Per-page size

### 3.1 The helper (`js/01-config.js`)

```js
const SHEET = { W: 841, H: 594, ML, MR, MT, MB, TB_H, ... };   // unchanged — the A1 native default

const PAGE_SIZES = {                 // mm, portrait w<h convention; rotate for landscape
  A0:{w:1189,h:841}, A1:{w:841,h:594}, A2:{w:594,h:420},
  A3:{w:420,h:297},  A4:{w:297,h:210}, Letter:{w:279.4,h:215.9},
};
const PT_TO_MM = 25.4 / 72;          // PDF points -> mm

function activePage() {              // the active page object, or null
  return (typeof project !== 'undefined' && project.sheets)
    ? project.sheets[project.activeSheetIdx] : null;
}
function activePageSize() {
  const p = activePage();
  return (p && p.size) ? p.size : { w: SHEET.W, h: SHEET.H };
}
```

### 3.2 Where `SHEET.W/H` reads must route through `activePageSize()`

- **`js/22-render-core.js` `drawSheet`** — the sheet rectangle, the page fill, and the title-block strip. When `page.hasTitleBlock === false`: draw **no** title block and **no** margins (just the page rect + PDF bg + entities). Per Dan: imported pages = PDF + markup only.
- **`js/63-layout.js`** — `fitToView` (centre + zoom-to-fit uses page w/h), `layoutBlocks` (3D-mode block packing references sheet extents), `resize`.
- **`js/44-pdf-export.js` / `js/51-multi-page-pdf.js`** — jsPDF page format becomes per-page `[page.size.w, page.size.h]` with per-page orientation, instead of the hardcoded `[SHEET.W, SHEET.H]`.
- **Coordinate helpers (`js/08-coords.js`)** — audit `s2px/px2s/real2px` for any bare `SHEET.H` (the Y-flip). Route the flip through the active page height. *(This is the highest-risk single edit — test the Y-flip on an A3 page early.)*

Native pages return A1 from `activePageSize()`, so **3D mode and existing details are byte-identical**.

---

## 4. PDF pipeline (pdf.js) — `js/83-pdf-document.js`

### 4.1 Library

- Add pdf.js via CDN in `index.html` head (matches three.js/jspdf):
  `pdfjs-dist` UMD build + set `pdfjsLib.GlobalWorkerOptions.workerSrc` to the CDN worker. Pin a version (e.g. 3.x) for reproducibility.
- Guard everything (`if (!window.pdfjsLib) …`) so a CDN miss degrades gracefully (import disabled, native files unaffected) — same defensive posture as the v2-layer guards.

### 4.2 Import

```
pdfImportFile(File) →
  bytes = await file.arrayBuffer()
  doc   = await pdfjsLib.getDocument({data: bytes}).promise
  f     = workspaceAddFile(file.name without ".pdf", 'pdf')   // empty file, no default page
  pdfId = f._nextPdfId++  ; f.pdfBlobs[pdfId] = new Uint8Array(bytes)
  for i in 0..doc.numPages-1:
     page = await doc.getPage(i+1); vp = page.getViewport({scale:1})
     sizeMm = { w: vp.width*PT_TO_MM, h: vp.height*PT_TO_MM }
     f.sheets.push(_projectMakeSheet(`Page ${i+1}`, '', '2d') extended with
        { size: sizeMm, paper: classify(sizeMm), hasTitleBlock:false,
          bg:{type:'pdf', pdfId, pageIndex:i, rotation: vp.rotation||0} })
  _projectLoadSheet(0); renderFileTabs(); renderPagesTab(); sessionSave()
```

Keep a module-level **`pdfDocCache: { <pdfId>: pdfjsDocument }`** of opened `getDocument` handles (re-opened lazily from `pdfBlobs` after a session restore) so rendering doesn't re-parse the bytes each frame.

### 4.3 Crisp render + cache (the "live re-render" Dan chose)

The canvas `render()` is synchronous; pdf.js render is async. Pattern:

- **`drawPdfBackground(ctx, page)`** (called first inside `drawSheet`, before entities):
  1. Compute the on-screen page rect (page origin → px via `s2px`, page `size` × `viewport.zoom`).
  2. Bucket the zoom (e.g. `bucket = 2 ** Math.ceil(log2(zoom*DPR))`, clamped) so we re-raster only on meaningful zoom changes, not every pixel.
  3. Cache key = `${pdfId}:${pageIndex}:${bucket}:${rotation}`. If a bitmap exists, `ctx.drawImage` it into the page rect (scaled) — **crisp**.
  4. If not cached: draw the nearest cached bucket (scaled, slightly soft) or a light "rendering…" placeholder, and kick an **async** `renderPdfToBitmap(pdfId, pageIndex, bucket)` that renders the pdf.js page to an offscreen canvas at `size_mm/PT_TO_MM × (bucket/baseScale)`, stores it, and calls `requestRender()`.
- LRU-cap the bitmap cache (e.g. last ~8 page×bucket bitmaps) so memory stays bounded with big PDFs.
- Only the **active** page renders live; rail cards stay text (thumbnails deferred).

### 4.4 Export of a PDF-backed page (v1 = raster + overlay)

In the export path, when `page.bg`: render that page to a **high-DPI** (≈300dpi) bitmap, place it as the page image in jsPDF, then run the normal vector overlay (markup entities) on top via the existing shim. Note in code + CHANGELOG: **vector passthrough deferred** (jsPDF can't re-embed source PDF pages; a pdf-lib stamp path is the follow-on).

---

## 5. IndexedDB session — `js/84-session-store.js`

Per Dan: per-file `.sdproj` save **plus** auto-restore of all open files/pages.

- DB `structdraw`, store `workspace` (single record, key `'current'`). IndexedDB (not localStorage) because PDF blobs are MBs.
- **Serialize** the whole `workspace` (files → pages → entities, + `pdfBlobs` as ArrayBuffers — IndexedDB stores binary natively, no base64 needed here).
- **`sessionSave()`** — debounced (~1–2 s) after any mutation: hook the existing dirty points (`addObj/delObj/addEnt2D/undo/redo`, `_projectLoadSheet`, file add/close/rename, PDF import). Cheap fan-in: a single `markSessionDirty()` called from those, with a trailing-edge timer.
- **`sessionRestore()`** — on boot in `workspaceInit()`: if a record exists, rebuild `workspace` (reattach `pdfBlobs`, lazily reopen pdf.js docs on first render of each PDF page), repoint `project`, `_projectLoadSheet(active)`. Else seed `files[0]`.
- **Dirty vs session**: the IndexedDB session is *always current* (crash-safety). The per-file `dirty` flag is about **disk** (`.sdproj`) — set on mutate, cleared on `exportProject`. The tab shows a dot while `dirty`.
- **Quota / failure**: wrap in try/catch; if IndexedDB is unavailable or quota-exceeded, log + continue (session disabled, manual `.sdproj` still works). Never block drawing on a session write.

---

## 6. File-tabs UI + empty-file landing — `js/49a-file-tabs.js`

### 6.1 Top-bar tabs

- New markup in `.top-bar` (`index.html`), where `#sheetList` sits: `<div id="fileTabs" class="file-tabs"></div><button id="btnAddFile" class="file-tab__add">+</button>`.
- **`renderFileTabs()`** — a tab per `workspace.files[i]`: name + dirty-dot + close ×. Active tab highlighted. Click = `workspaceSwitchFile(i)`; dblclick = rename; × = `workspaceCloseFile(i)`.
- **`#btnAddFile`** opens a small menu: **New file** (`workspaceAddFile`, empty → landing) · **Open .sdproj…** (file input → `importProject` into a new file) · **Import PDF…** (file input `accept=".pdf"` → `pdfImportFile`).
- Hook `renderFileTabs()` into the same auto-refresh as the rail (extend `installHooks` in `74` or call from workspace ops).
- CSS: reuse `.sheet-tab*` token styling from `css/styles.css` so file tabs match the existing visual language across all five themes.

### 6.2 Empty-file landing

- A file with **zero pages** shows a centred empty-state overlay in the drawing area (a positioned `<div>` over the canvas, hidden whenever `project.sheets.length > 0`):
  - **Import PDF** (primary) → `pdfImportFile`
  - **New blank detail page (A1)** → `projectAddSheet('Page 1')` with native A1 defaults
  - **Open saved file…** → `importProject` (into this file)
- Toggle visibility from `_projectLoadSheet` / `renderPagesTab` (whenever the active file's page count changes).

### 6.3 Terminology

UI strings: top tabs = **Files**, rail = **Pages**. Rename the File-menu **New sheet…** → **New page…** and "Sheet N" defaults → "Page N" for consistency (field names unchanged). Minor; confirm in `04`.

---

## 7. Shift+scroll page navigation — `js/39-events.js`

In the existing `wheel` handler, branch at the top:

```js
if (e.shiftKey && !e.ctrlKey) {
  e.preventDefault();
  pageNavAccum += e.deltaY;                 // module-level; trackpad debounce
  const STEP = 60;                          // tune for trackpad vs wheel
  if (Math.abs(pageNavAccum) >= STEP) {
    const dir = pageNavAccum > 0 ? 1 : -1;  // down = next page
    pageNavAccum = 0;
    const n = project.sheets.length;
    const next = Math.min(n - 1, Math.max(0, project.activeSheetIdx + dir));
    if (next !== project.activeSheetIdx) { projectSwitchSheet(next); renderPagesTab(); }
  }
  return;                                    // do NOT zoom
}
// ...existing zoom path unchanged (plain scroll, and ctrl=faster)...
```

`pageNavAccum` declared in `js/07-globals.js`. Plain and ctrl scroll behave exactly as today.

---

## 8. Full "Files touched" table

| File | Change | Risk |
|---|---|---|
| `index.html` | pdf.js CDN `<script>` + worker config; `#fileTabs`/`#btnAddFile` markup; File-menu items (New file / Open file / Import PDF…); 4 new `<script>` tags (`04`, `49a`, `83`, `84`); SVG icons (file/pdf/plus). | Low (additive) |
| `js/01-config.js` | Add `PAGE_SIZES`, `PT_TO_MM`, `activePage()`, `activePageSize()`. `SHEET` unchanged. | Low |
| `js/04-workspace.js` *(new)* | Workspace model + file ops + `workspaceInit` (session restore / seed) + repoint `project`. | Med |
| `js/05-state.js` | `_projectMakeSheet` adds `size/paper/hasTitleBlock/bg`; snapshot/restore carry them; `migratePage`; `projectInit` superseded. | Med |
| `js/07-globals.js` | `pageNavAccum` (+ any small session/dirty flags). | Low |
| `js/08-coords.js` | Route the Y-flip / sheet-extent reads through `activePageSize()`. | **High** (geometry) |
| `js/22-render-core.js` | `drawSheet`: page-size rect, `drawPdfBackground` first, suppress title-block/margins when `!hasTitleBlock`. | Med |
| `js/39-events.js` | Wheel handler `shiftKey` page-nav branch. | Low |
| `js/49a-file-tabs.js` *(new)* | `renderFileTabs` + add-file menu + empty-file landing overlay. | Med |
| `js/50-project.js` | `importProject` → new file (no clobber); `exportProject` saves active file + embeds PDF base64 + per-page fields. | Med |
| `js/62-toolbar.js` | File-menu dispatch `newFile`/`openFile`/`importPDF`; wire `#btnAddFile`. | Low |
| `js/63-layout.js` | `fitToView`/`layoutBlocks`/`resize` via `activePageSize()`. | Med |
| `js/73-init.js` | Boot: `workspaceInit()` (was `projectInit()`); init pdf.js, session store, file tabs. | Med |
| `js/74-v26-bb-rail.js` | `renderPagesTab`: per-page size/kind label; empty-state toggle; ensure it tracks the active file (works via repoint). | Low |
| `js/83-pdf-document.js` *(new)* | pdf.js loader, import, offscreen render + zoom-bucket cache, `drawPdfBackground`, export raster. | **High** |
| `js/84-session-store.js` *(new)* | IndexedDB workspace autosave (debounced) + restore + pdf-blob (re)attach. | Med |
| `js/44-pdf-export.js` | Per-page jsPDF format + raster PDF bg into single-sheet export. | Med |
| `js/51-multi-page-pdf.js` | Per-page format/orientation; raster PDF bg per page. | Med |
| `CHANGELOG.md` | On ship. | — |

**Highest-risk edits to test first:** the `08-coords.js` Y-flip on a non-A1 page (§3.2), and the async PDF render/cache (§4.3). Both get an early dedicated smoke test in the build plan.
