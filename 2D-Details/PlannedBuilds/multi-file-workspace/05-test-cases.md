# 05 — Test cases / verification fixtures

Manual browser smoke tests (no automated harness in this app yet). Run the relevant block at each phase boundary; the full matrix at the end of Phase 5. DevTools console must stay clean throughout.

Recommended PDF fixtures to keep handy: a **multi-page A1** set, a **12-page A3** set, a **mixed-orientation** PDF (portrait + landscape), an **A4 portrait** single page, and a **large (≈30-page / many-MB)** PDF for cache/memory.

---

## A. Per-page size (Phase 0)

- A0–A1. Existing single project opens, draws, zooms, fits, and exports **identically** to before (native A1). 2D and 3D modes both unchanged.
- A0–A2. Console: force `activePage().size = {w:420,h:297}` → page rect, `fitToView`, and the **Y-flip** are correct (top-left content stays top-left, nothing mirrored); revert.

## B. Multi-file core (Phase 1)

- B-1. Open file X (native), draw a beam; "+" → New file → file Y; draw a plate. Switch X↔Y via tabs → each shows only its own drawing and its own pages in the rail; neither clobbers the other.
- B-2. Per-file pages: add 3 pages to X, delete 1; Y still has its own page set.
- B-3. Rename a file (double-click tab) → tab + any name-derived UI update.
- B-4. Close file Y (no unsaved changes) → closes silently. Make Y dirty, close → confirm prompt. Close the **last** remaining file → a fresh empty file appears (never zero files).
- B-5. `exportProject` on X → `.sdproj`; "Open .sdproj…" → opens into a **new** tab (X still open). Round-trip: pages, names, per-page fields intact.

## C. IndexedDB session (Phase 2)

- C-1. Two files open, mid-edit on page 2 of file X. Hard-reload the browser tab → both files restored, file X active on page 2, drawings intact.
- C-2. Dirty dot: edit a saved file → tab shows a dot; `exportProject` → dot clears.
- C-3. Resilience: simulate IndexedDB failure (block the store) → app still draws and `.sdproj` save still works; console logs the disabled session, doesn't throw.

## D. PDF import (Phase 3)

- D-1. Import the 12-page A3 PDF → new file named after the PDF, 12 pages in the rail, each labelled/ sized A3, `hasTitleBlock:false` (blank page rect at A3 size, **no** title block / margins).
- D-2. Import the mixed-orientation PDF → portrait pages portrait, landscape pages landscape (sizes match the source).
- D-3. Save that file → `.sdproj` (PDF embedded, base64); reopen → all pages + sizes intact, still no title block.
- D-4. Session restore (hard reload) keeps the imported PDF file and its pages.

## E. PDF background render + markup (Phase 4)

- E-1. Imported page renders the real PDF beneath. Zoom 100%→400% → background re-renders **crisp** (not upscaled-blurry); pan keeps the PDF aligned with the page rect.
- E-2. Switch pages (rail click) → background swaps to the correct PDF page; switching files swaps to that file's backgrounds.
- E-3. Full toolset over the PDF: place a **dimension**, a **note + leader** ("THIS AREA NEEDS FIXING"), a **revision cloud**, a **hatch**, and a **member** — each lands where clicked and renders at STP-6011 crispness over the PDF. (Mirrors the kickoff screenshot.)
- E-4. Async: on a heavy page the first frame shows a brief "rendering…" placeholder, then the crisp bitmap — no thrown error, no permanently-blank background.
- E-5. Memory: scroll through the 30-page PDF → LRU cache caps; no unbounded growth / tab crash.

## F. Shift+scroll navigation (Phase 5)

- F-1. **Shift+scroll down** → next page; **up** → previous page; one wheel notch = one page; clamps at first/last (no wrap). Rail highlight follows.
- F-2. **Plain scroll** zooms about the cursor exactly as today; **Ctrl+scroll** still zooms faster. Shift does not zoom.
- F-3. Trackpad: a single two-finger flick advances **one** page, not many (debounce works).

## G. Export (Phase 5)

- G-1. A native A1 file exports exactly as today (per-sheet + all-sheets PDF).
- G-2. A PDF-backed file exports each page at its **own** size/orientation, with the PDF background rasterised (~300dpi) under the vector markup; markup is crisp/vector in the output.
- G-3. A **mixed** file (native A1 + imported A3 pages) exports each page at its correct size in one multi-page PDF.

## H. Regression guard (run at the end)

- H-1. A pre-existing single-project `.sdproj` from before this build opens as one file, one tab, pages intact, title blocks intact (back-compat migration).
- H-2. 3D mode unchanged: projections, joints, auto-weld, iso engine all behave as before on a native file.
- H-3. v2 plate path unchanged: place/rotate/resize/edit a plate in 2D mode; save/load round-trips it (the `schemaVersion>=2` graft still fires).
- H-4. Undo/redo unchanged within a file; switching files resets undo per the existing per-sheet-load behaviour.
