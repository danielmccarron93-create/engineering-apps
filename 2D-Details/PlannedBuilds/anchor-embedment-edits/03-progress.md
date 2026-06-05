# ChemSet anchor-stud UX edits — progress

**Status: COMPLETE** (2026-06-05). Built + browser-verified (numeric draw-capture + interactive
drag tests + screenshots + DXF smoke test; console clean; all four edited files parse-check OK).

Workflow: plan spec → **adversarial design-review workflow** (4 diverse-lens critics + synthesiser)
→ revise → implement → verify. The design review caught two real blocking issues before any code
(see below).

| # | Request | Status |
|---|---|---|
| 1 | Selection box weird/offset → subtle orange infill hugging the glyph | ✅ |
| 2 | Modifier-drag duplicates a stud (like other members) | ✅ (Alt; verified) |
| 3 | Top options-bar dropdown when a stud is selected (Size/Orient/Embed) | ✅ |
| 4 | Drag the tip → embedment depth; drag the edge → snap to host face (tip rides) | ✅ |
| 5 | Type the embedment depth (inspector + top bar) | ✅ |

## What shipped
- **`studSectionGeom(blk, ent)`** (NEW, `72j`) — single source of truth for a section stud's drawn
  geometry (bearing snap + embedment override). Read by the drawer, DXF, hit-test, hover centreline,
  selection footprint and grips, so they never drift.
- **Two optional entity fields:** `embedDepth` (bonded length below the embedment edge) and
  `faceOffset` (edge datum below the bearing plane). Saved/cloned automatically.
- **`v25StudEdgeSnap`** (NEW, `72j`) — own host-face detection over mem2/mat/blockWall/plate2 (the
  bearing finder only sees mem2/plate2; grout/blockwork are mat/blockWall).
- **`v25BuildStudOrientRowForEnt`** (NEW, `72j`) — orientation icon-row that edits a selected stud.
- **`_v25FastenerFootprintPoly`** (NEW, `71`) — oriented rod-rectangle footprint from the recentred
  centreline; fixes the offset highlight for stud **+ screw + bolt2** (same root cause).
- Grips (`stud-tip` / `stud-face` / `body`), `v25Move` embedment branch, inspector + top-bar fields,
  DXF cutover — all additive `else if (ent.type==='stud')` branches beside the existing screw branch.

## Two blocking issues the design review caught (both fixed)
- **B1 — back-compat default.** Naively defaulting `embedDepth` to the catalogue `embed` lengthened
  every existing **M20/M24** stud by 25/50 mm (their `embed` is the *deep* drill value; `Le ≠
  embed+maxFixt`). Fix went further than the review's `Le−maxFixt`: default
  `embedDepth = legacyEmbLen − sFace`, giving **zero regression for all sizes AND the snapped case**
  (verified: M8–M24 no-host and snapped all reproduce today's `Le` byte-for-byte).
- **B2 — null/cross-view crash.** Routing the no-block selection helpers through
  `studSectionGeom(activeBlock, …)` would deref `null.viewKey` during PDF export (activeBlock=null)
  and snap to the wrong view elsewhere. Fix: guard `v25StudBearingFace` against a null block; thread
  `blk` into `v25SelFootprint`/`v25EntHandles` (callers already have it); keep `v25EntBounds`
  snap-independent like bolt2.

## Verification highlights
- Back-compat: `studSectionGeom.embLen == legacy L−(washT+nutH+tail)` for **all six sizes**, no-host
  AND snapped-to-20mm-plate (all == Le). DXF tip moves 155 mm for `embedDepth=300`.
- Interactive: tip-drag sets `embedDepth` (placement u/v untouched); edge-drag snaps to the grout
  underside (= top of blockwork), pins the bond, tip rides; clone carries both fields.
- UI: selected-stud bar (Size/Orient/Embed) + inspector fields appear; end-on hides embedment.
- Screenshots: offset box → hugging infill; default vs 300 mm embedment side-by-side.

## Decisions (resolved without blocking Dan)
- **Default embedment** = zero-regression (reproduce existing drawings); the user gets explicit
  control via the new fields. (Not the catalogue deep-embed, which would silently change drawings.)
- **Duplicate modifier = Alt** on macOS (Ctrl unavailable — right-click + zoom). Communicated.
- **Screw + bolt2** got the footprint parity fix too (same root cause; a few lines).
- **Edge-snap** offers both faces of each host (top + underside).

## Follow-up (2026-06-05, same session) — drilling-datum two-tone shading
Dan's review: the embedment-edge node is the **drilling datum** (embedment = 0). Reworked
`drawStud2D_Section` so the rod reads in two zones split at that node — `STEEL` (0.62) solid dark
fill ABOVE (head + nut + washer + the shaft through the grout/fixture, no thread = solid steel) and
`EPOXY` (0.13) light fill + adhesive hatch + thread BELOW (the drilled bond zone). The body thread
now starts at `sFace` (not `s=0`) so the fixture shaft is clean steel; a crisp datum line is drawn
at `sFace`. Embedment depth is measured **datum → tip** (so re-datuming to the top of blockwork
excludes the grout — what the builder drills). Verified: drag the node from top-of-grout → snaps to
top-of-blockwork (v=60), dark steel extends through the grout, drilled zone starts at the blockwork;
typed 600 → 600 mm below the datum. Console clean.

## Deferred / notes
- v2-plate faces as edge-snap targets (mats/blockWall/mem2 cover the headline scenario).
- 3D-mode + capacity checker remain deferred from the original m16 build.
