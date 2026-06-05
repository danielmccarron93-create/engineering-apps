# 01 — Context: how files, sheets & pages work today

This is the orientation a build chat needs before touching anything. The headline: **the app already models "a file with pages" — it just calls it "a project with sheets" and only allows one open at a time.** This feature lifts that one level and adds PDFs.

---

## 1. The current data model (one project, N sheets)

In `js/05-state.js`:

```js
let project = {
  sheets: [],          // [{ id, name, mode, sheetInfo, objects3D, entities2D, secCutX, planCutY, objIdN, ent2dIdN }]
  activeSheetIdx: 0,
  _nextSheetId: 1,
};
```

- A **project** = a set of **sheets**. (In the new vocabulary: a project is a *file*, a sheet is a *page*.)
- Each **sheet** owns its full drawing: `objects3D`, `entities2D`, its title-block `sheetInfo`, its 2D/3D `mode`, cut-line positions, and id counters.
- **The live globals are always "the active sheet."** `objects3D`, `entities2D`, `sheetInfo`, `sheetMode`, `secCutX`, `planCutY`, `objIdN`, `ent2dIdN` are top-level `let`s that mirror `project.sheets[project.activeSheetIdx]`.

Switching sheets is a **snapshot/restore dance** (`js/05-state.js`):

- `_projectSnapshotActive()` — deep-copies the live globals back into the active sheet slot.
- `_projectLoadSheet(idx)` — deep-copies sheet `idx` into the live globals, resets selection + undo, re-applies `mode`, re-migrates members, re-renders.
- `projectSwitchSheet / projectAddSheet / projectDeleteSheet / projectRenameSheet` — the public API the UI calls.
- `projectInit()` — at boot, seeds `sheets[0]` from the default globals so the app launches identically to the pre-multi-sheet era.

**Why this matters for the build:** the entire render/event/export pipeline is *ignorant of multi-sheet state* — it only ever reads the live globals. That ignorance is the lever. If we make `project` **point at the active file**, every existing function keeps working on "the active page of the active file" with zero changes. (See `02-design.md` §2, the repoint trick.)

---

## 2. The Pages rail (left) — already per-project

`js/74-v26-bb-rail.js`, `renderPagesTab()`:

- Reads `project.sheets`, renders a card per sheet (drawing-no, name, `MODE · 1:scale`), highlights the active one.
- Click = `projectSwitchSheet(i)`; double-click = rename; × = `projectDeleteSheet(i)`.
- `bindPagesActions()` wires **+Add** (`projectAddSheet`) and **Duplicate** (add-with-copied-name).
- `installHooks()` monkey-patches `renderSheetBrowser` so the rail re-renders after any project mutation.

Because this reads `project.sheets`, the moment `project` repoints to the active file, **the Pages rail automatically shows the active file's pages** — no change needed beyond cosmetics (per-page size/kind label).

---

## 3. The top bar — a hidden tab strip already exists

`index.html` `.top-bar` (≈ line 857):

- Left: brand + the `.menubar` (File / Edit / View / Document / Tools / Windows).
- **`#sheetList`** + **`#btnAddSheet`** — the old V21 top-bar *sheet* tabs, now `display:none` (pages moved to the rail). `renderSheetBrowser()` (`js/49-sheet-browser.js`) still writes to `#sheetList` (harmless while hidden).
- Right: the 2D/3D switcher, undo/redo, kbd-help, theme.

Dan's red marks in the screenshot sit exactly in this strip's region. The plan adds a **new** `#fileTabs` + `#btnAddFile` here (rather than overloading the still-live-but-hidden `#sheetList`), so file tabs and the dead sheet strip never collide.

**The clean mental split this produces:** top-bar tabs = **files**; left rail = **pages** of the active file.

---

## 4. Save / load today

- **`exportProject()` / `importProject()`** (`js/50-project.js`) — the whole `project` ↔ a `.sdproj` JSON (`format:'structdraw-project'`). This is exactly "save/open a file." The File-menu *Save project… / Open project…* items dispatch to these (`js/62-toolbar.js`).
- **`saveProject()` / `loadProject()`** (`js/46-save-load.js`) — a single-sheet `.json` (older path; also where the v2-plate slice is grafted via `schemaVersion>=2`).
- **`exportProjectToPDF()`** (`js/51-multi-page-pdf.js`) — every sheet → one PDF page, via the V15 vector path; hot-swaps each sheet into the globals, renders, `addPage`. **Hardcodes `[SHEET.W, SHEET.H]`** (A1) per page — this is one of the spots per-page sizing must reach.
- **No autosave** (a known Phase-2 gap). Browser crash = lost work. The IndexedDB session in this build closes that gap for the multi-file world.

---

## 5. Page size is hardcoded A1

`js/01-config.js`:

```js
const SHEET = { W: 841, H: 594, ML, MR, MT, MB, TB_H, /* getters: left/top/right/bottom */ };
```

Everything — `drawSheet`, `fitToView`, `layoutBlocks`, PDF export page format, the title-block strip — reads `SHEET.W/H` directly. Imported PDFs are routinely A3/A4/Letter, portrait or landscape. So per-page sizing means introducing `activePageSize()` and routing those reads through it (native pages return A1, so native behaviour is byte-identical).

---

## 6. No PDF rendering anywhere

- Libraries loaded (`index.html` head): **three.js r128** + **jsPDF 2.5.1**, both CDN. jsPDF is *export-only* — it can't render an existing PDF.
- There is **no pdf.js**, and **no raster/background/image entity** of any kind (confirmed by grep — the only `drawImage` hits are incidental canvas plumbing).
- So "show a PDF page and mark it up" is genuinely net-new: a new library (pdf.js) + a new per-page `bg` descriptor + an async offscreen-render-and-cache step in the draw loop.

---

## 7. The wheel handler

`js/39-events.js` (≈ line 1889): `wheel` → zoom about the cursor (`ctrl` = faster). It ignores `shiftKey` today, so adding **Shift = page nav** is a safe, additive branch. (Trackpads fire many small `deltaY` events, so page-stepping needs a small accumulator/threshold so one "flick" = one page.)

---

## 8. What the engineer actually does with this (the workflow lens)

- **Morning:** opens StructDraw; the IndexedDB session restores yesterday's three open files (project A details, project B architect markup, project C shop-drawing check) exactly where he left them.
- **Detailing (project A):** native A1 pages, full 3D/2D toolset, Bligh Tanner title block — unchanged from today.
- **Markup (project B):** "+" → Import PDF → the architect's 8-page A1 set lands as a new file; he Shift+scrolls to sheet 4, clouds an area, drops a "THIS AREA NEEDS FIXING" note + leader (exactly the screenshot), dimensions a setback — all at STP-6011 crispness over the real PDF.
- **Check (project C):** opens the fabricator's A3 shop drawing PDF; zooms to 400% on a bolt group to read it; the PDF stays sharp (live re-render); marks a query.
- **Save as he goes:** each file → its own `.sdproj` (PDF embedded, so he can email project B's marked-up set to the architect as one self-contained file). The session keeps everything safe between saves.

Every one of those touchpoints maps onto an existing surface (Pages rail, 2D toolset, `.sdproj` save) plus the four new pieces this build adds (file tabs, per-page size, PDF background, IndexedDB session).
