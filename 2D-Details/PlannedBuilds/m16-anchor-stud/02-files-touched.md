# M16 anchor stud — files touched

For multi-build conflict detection (parallel build sessions are active; Dan commits
subsets himself). **Every edit is additive** (new file / new branch / new tile / new
case) so subset-commits stay clean. No shared helper was modified.

| File | Change | New / Edit |
|---|---|---|
| `js/02g-data-anchor-studs.js` | **NEW** — `CHEMSET_STUDS` catalogue (M8–M24: L/Le/dh/embed/maxFixt/Tr/ec/ac/bm/fy/fu/Z/codes), `DEFAULT_CHEMSET_SIZE`, `CHEMSET_SIZES`, `getStudSpec()` | new file |
| `js/72j-v25-stud.js` | **NEW** — `V25_STUD_ORIENT`, `STUD_NUT_FALLBACK` + `studDims()` (M8/M10 AS-1112/1237 guard for the BOLT_DB gap), `v25BuildStudOrientationRow()`, `v25PickAndSetStud()`, `v25StudBearingFace()` (one-sided + fixture thk), `drawStud2D` + `drawStud2D_End` + `drawStud2D_Section` + `drawStudThread` (local bounded thread) | new file |
| `index.html` | add `icon-stud` + 5 `icon-orient-stud-*` SVG symbols (after the screw icons); add `<script src="js/02g-…">` (after 02f) and `<script src="js/72j-…">` (after 72i, before 73-init) | edit |
| `js/69-v25-dispatch.js` | `v25DrawEnt` stud draw route; `v25TryHandleClick` `'v25-stud'` single-click branch; `v25DrawPreview` stud ghost; `v25ActiveTileId` → `'d-stud'` | edit (additive) |
| `js/74-v26-bb-rail.js` | `d-stud` CHEMSET tile in the Members section (2D-only, 3D "coming soon" hint) | edit (additive) |
| `js/72-v25-options-bar.js` | `'v25-stud'` options branch (Size select from `CHEMSET_SIZES` + orientation slot); orient-row swap; `v25o-stud-size` size wiring | edit (additive) |
| `js/09-snap.js` | add `tool === 'v25-stud'` to the per-axis face-snap tool list | edit (1 token) |
| `js/71-v25-selection.js` | `stud` cases in `v25EntBounds`, the `v25HitEnt` dispatch, `v25FastenerHit` (drawn-centreline-faithful), the body-grip block, `v25HitHandle`, and the inspector field block (Size + Orientation) | edit (additive, 6 spots) |
| `js/45-dxf-export.js` | `stud` branch in `_dxfEmit2DEntity` (hex nut + washer + rod + chisel + hole walls + centreline; circles + cross for end-on), S-BOLT layer | edit (additive) |
| `CHANGELOG.md` | one entry | edit |

**Reused unchanged:** `js/03-data-bolts.js` (`BOLT_DB` nut/washer dims for M12–M24 + the `LW` table — read at draw time, never mutated), `js/33-draw-bolt.js` (`hexPointsAlongU/V`, `rPolygon`/`rFillPolygon`), `js/26-as1100-hatch.js` (`drawCrossHatch` for the adhesive bond zone), `js/24-draw-primitives.js` (`rLine`/`rRect`/`rFillRect`).

**Deliberately NOT touched:** the existing `anchor` callout entity (`drawAnchor2D` / `V25_ANCHOR_DB.chemset`) — it is the complementary schedule-note symbol, a different kind of object. The shared `drawThreadAlongU/V` (used by the bolt) — the stud uses its own local `drawStudThread` instead.
