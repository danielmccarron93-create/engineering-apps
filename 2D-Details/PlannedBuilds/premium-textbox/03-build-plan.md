# 03 — Build plan & progress tracker

Built in one session via a multi-agent `/workflows` run against `CONTRACT.md`, then polished +
browser-verified by the lead chat.

## Phases
1. **Author modules** (parallel) — `js/96` stroke font, `js/97` entity/render/DXF, `js/98` UI. Each
   against the frozen contract; `node --check` each.
2. **Wire integration** (parallel, one owner per file) — the ten thin inserts in CONTRACT §6.
3. **Verify** (parallel) — `node --check` sweep + a cross-file coherence audit against the contract.
4. **Polish + browser-verify** (lead chat) — load `index.html`, exercise the full UX, refine the
   stroke-font glyph shapes against screenshots until the lettering is genuinely premium, fix any
   integration gaps, screenshot the three styles for Dan to choose a default.

## Progress tracker
| Phase | State | Notes |
|---|---|---|
| 0 — Exploration + frozen contract | ✅ done | Mapped the legacy system + every V25 integration point; wrote `CONTRACT.md`. |
| 1 — Author modules | ✅ done | `96`/`97`/`98` authored by the workflow against the contract; all public symbols present, stroke self-check clean. |
| 2 — Wire integration | ✅ done | All 11 inserts placed (one owner per file); coherence audit passed. |
| 3 — Verify (coherence) | ✅ done | `node` absent on this machine → syntax validated via JavaScriptCore + browser console (clean). Coherence audit = pass. |
| 4 — Polish + browser-verify + screenshots | ✅ done | Browser-verified all interactions via real DOM events. Lead-chat fixes (see below). Screenshots captured for style choice. |

## Lead-chat fixes during phase 4 (post-workflow)
- **`js/96`** — rebuilt the `S` glyph (arcs didn't meet → a diagonal "lightning" artefact) and the `9` glyph (tail mirrored to the wrong side, read as "P"). Both now correct.
- **`js/97` + `js/98`** — **paper-space sizing fix** (the contract wrongly specified `pm = ppm()`): box/text/padding/lineweights/arrowheads now scale by `viewport.zoom` (px per sheet-mm) on screen, with `*drawingScale` conversions in bounds/handles/move/attach/DXF. Without this a note rendered ~1/scale (≈10×) too small at working zoom, and raster-PDF was wrong too. Editor + preview overlay multiplier (`_nbPm`) switched to `viewport.zoom` to match.
- **`js/69`** — added the `v25-notebox` case to `v25ActiveTileId()` so the BB-rail Note tile shows its active highlight (flagged by the coherence audit + the bb-rail agent).

## Post-review enhancement (2026-05-31) — orthogonal kink-node leaders
Dan asked for editable leader nodes. Implemented: leaders are now polylines `[edge anchor, …elbows, tip]`; **shift-click on a leader line inserts a kink node**, with the box-side segment forced **orthogonal** (radiating from the facing-edge midpoint at the clicked depth) and the tip held fixed → a clean dogleg you then angle. Shift-click a node removes it; nodes are draggable grips that carry on body-drag. `js/97`: `nbFacingEdge` / `nbEdgeAnchor` / `nbLeaderPoints` / `nbAddNodeAtLeader` / `nbRemoveElbowNear`, polyline drawer + DXF, elbow grips + `nbMove` case. `js/98`: `nbSelectShiftClick` now routes remove-node → remove-arrow → add-node-on-line → add-arrow. Browser-verified via real DOM events (add/drag/remove + render in both professional and draftsman styles).

## Post-review enhancement (2026-05-31) — box-first placement + auto-dogleg
Dan asked to reverse the *feel* of placement (the order was already box-first in code; the missing piece was a pre-click box preview) and to make the default leader a Bluebeam/Revit-style dogleg. Implemented: pressing `q` shows a **ghost text box (2 lines × ~4 words) following the cursor** so click 1 = box, click 2 = arrow is unmistakable. The default leader is now an **auto-dogleg** — short orthogonal shoulder (`NB.SHOULDER_MM` 6 mm) off the middle of the facing box side → node → angled leg to the tip — **computed** (not stored) so it stays centred/fixed-length as the box auto-sizes; the node grip **materialises into a real elbow** on first drag. `js/97`: `NB.SHOULDER_MM`/`PLACEHOLDER_W_MM`, empty-box placeholder layout, `nbAutoShoulderForRect`/`nbAutoShoulder`, `nbLeaderPoints` auto-dogleg, `auto:` grip in `nbHandles`/`nbMove`, materialise in `nbAddNodeAtLeader`. `js/98`: `nbToolPreview` rewritten (cursor-following box pre-click-1; box + dogleg preview after). Browser-verified end-to-end via real DOM events.

## Post-review enhancement (2026-05-31) — "Engineer" inclined lettering style
Dan asked to keep `draftsman` (rough) and add a more refined hand matching a classic inclined engineering-lettering reference. Added a 4th style `engineer`: refined forward-slanted (~18°) single-stroke hand, only a whisper of wobble/jitter. Slant implemented as a per-glyph shear in `nbStrokeText` (`x' = x + y·tan(slant)`; advances unchanged → wrapping/box sizing unaffected). Wired into the options-bar + inspector dropdowns; the inline editor leans (italic) to match. `js/96` (slant opt), `js/97` (`NB_STYLES.engineer` + drawer), `js/98` (options + editor), `js/71` (inspector). `draftsman` left untouched. Browser-verified; tunable via `NB_STYLES.engineer.slant` / `.wobble`.

## Post-review enhancement (2026-05-31) — Shift-click a node branches an arrow
Dan wanted clicking a leader node (Shift) to add an extra arrow rather than a node. New `nbAddArrowNodeBranch` (`js/97`): finds the nearest leader node (a stored elbow, or the computed auto-dogleg shoulder) within tol and pushes a new arrow that **shares that node as its first elbow**, with a tip fanned ~25° off the source leg → a shared-shoulder multileader you then drag to the 2nd target. `nbSelectShiftClick` (`js/98`) re-ordered: node → branch arrow (was: remove node), then tip → remove arrow, line → add kink node, empty → add arrow. Node-removal via Shift-click dropped (use undo). Browser-verified via real DOM events.

## Outstanding for Dan
- **Pick the default lettering style** after reviewing the screenshots (one click in the options bar; persists). Build ships `professional` as the initial default.
- Optionally tune the `draftsman` hand-feel — `NB_STYLES.draftsman.wobble` (0.28) / `.jitter` (0.55) in `js/97`.
- Suggested doc follow-up on ship: add `96`/`97`/`98` to the file map in the root `CLAUDE.md`.

## Definition of done
- All CONTRACT §8 checks pass.
- The three styles render cleanly; `draftsman` reads as authentic 70s hand lettering, `professional`
  as clean CAD lettering; arrowheads/leaders/box match STP 6011 quality.
- Place / edit / move / resize / re-point / multi-arrow / outline-toggle / style-flick / set-default
  / double-click-edit / save-reload / PDF / DXF all verified in the browser.
- `CHANGELOG.md` updated; this tracker updated; handed to Dan for review (he commits).
