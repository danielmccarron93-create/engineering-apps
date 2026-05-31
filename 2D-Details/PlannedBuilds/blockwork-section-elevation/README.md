# Blockwork wall — Section & Elevation draw modes

Status: 👀 In review
Last touched: 2026-05-31
Owner: Dan McCarron
Scope: Give the 2D-mode `blockWall` entity the two views an engineer actually draws — a two-click vertical **section strip** and a **break-line elevation extent** — both with correct AS/NZS 4455 coursing, discoverable from the palette, fully editable, and DXF-exporting.

> Built directly in a single Claude Code session (build-first, not via a separate plan chat). This README is the build record. Move to `archive/completed-plans/2026-05-31_blockwork-section-elevation/` once Dan commits + pushes.

---

## Why

Before this, drawing blockwork in 2D mode meant either a flat hatch fill or a plain coursed rectangle (`blockWall`, always `aspect:'elev'`, axis-aligned bbox drag). That isn't how a structural engineer details a block wall. The two real cases:

1. **Section** — a thin vertical view of the wall (you see its thickness, e.g. 190), extended up to a real top edge, with a section break at the bottom where the cut continues into the structure below. Used to show anchors/bolts landing relative to the coursing.
2. **Elevation** — the wall face (running-bond blocks), showing only the zone of interest, with break-lines on the edges where the wall continues beyond the detail.

In **both**, the coursing (block + grout) must be drawn to the real module so anchor positions read true against the blocks.

## Design decisions (locked with Dan up front)

- **Section first click = wall centreline** (95 mm each side for a 190). Strict **H/V ortho by default, Shift = free angle**.
- **Section ends = one clean edge + one section break** (which end is togglable; default break at the start/first-click end).
- **Section detail = full hollow-block section** — two cut faces + inner face-shell lines + bed-joint courses + optional grout-fill hatch in the cores.
- **Elevation = top + left are wall edges, bottom + right are break-lines by default**; the coursing anchors full blocks to the wall-edge sides (datum prefers top/left, falls back to bottom/right), so partial blocks fall against the break-lines. Double-click any edge (in select mode) opens a picker — **Edge of wall** or **Break-line** — and the coursing re-anchors; also editable in the inspector.

## Data model

`blockWall` entity gained a `wallMode` discriminator (back-compat: absent → `'elev'`):

- `wallMode:'sec'` — `{ u, v (centreline start), rot, lengthMM, blockKey, endBreak:'start'|'end'|'both'|'none', grouted:bool }`. Width = `V25_BLOCK_DB[blockKey].thk`.
- `wallMode:'elev'` — `{ u, v (corner), lengthMM, heightMM, blockKey, breakEdges:{top,bottom,left,right} }`.

Block catalogue `V25_BLOCK_DB` already had 90/110/140/190/290 (block 390×190, 10 mm joints → 200 mm course, 400 mm bond module) — no new data needed.

## Tools

- `v25-wall` → elevation (existing two-click bbox; now writes `wallMode:'elev'` + default `breakEdges`).
- `v25-wall-sec` → **new** section strip (two-click directional, centreline, ortho/Shift). Excluded from `getCursor`'s 45°-step auto-ortho; applies strict H/V `v25OrthoSnap` itself.
- `v25ArmWall(mode)` arms the right tool keeping `v25Last.blockThk`; the options-bar **View** icon row (Section/Elevation) and the BB-rail tile both call it.

## Files touched (released app)

| File | Change |
|---|---|
| `65-v25-data-mode.js` | `v25Last.wallMode/wallEnd/wallGrouted` |
| `09-snap.js` | exclude `v25-wall-sec` from constrainUV auto-ortho |
| `24-draw-primitives.js` | new reusable `rZigzag` real-world break-line primitive |
| `68-v25-tools.js` | `drawBlockWallSec2D` (rotated strip: faces, shells, bed joints, grout, zigzag ends, tag) + per-edge break rendering in `drawBlockWall2D` |
| `69-v25-dispatch.js` | `v25ArmWall`, `v25SetWallBlock`→elev, `v25-wall-sec` placement, section ghost preview, active-tile mapping |
| `72-v25-options-bar.js` | combined blockwork branch (View row + block + end-break + grout) + placeholder swap + wires |
| `72b-orientation-presets.js` | `v25BuildWallModeRow` (Section/Elevation icon row) |
| `74-v26-bb-rail.js` | `d-blk-wall` tile in the Members section |
| `71-v25-selection.js` | blockWall bounds (rotated sec AABB), handles (sec end-a/end-b/rotate; elev edge grips), hit-classify, move (rotate/end/edge-resize), rotation-ball connector, inspector panel, `v25ToggleWallBreak` |
| `39-events.js` | double-click an edge/end → toggle break (select mode, 2D) |
| `45-dxf-export.js` | `blockWall` → `S-MASONRY` emission (outline + coursing + zigzag breaks + tag) — previously dropped |
| `index.html` | `icon-block-sec` + `icon-block-elev` SVG sprite symbols |

## Verification (browser, headless eval + screenshots)

- Placement both modes; ortho-by-default (rot 0/90) and Shift→free angle (33.7°) confirmed.
- Section strip renders faces + shells + 200 mm courses + grout hatch + zigzag break + clean end + tag; angled strips coursing tilts correctly.
- Elevation renders running-bond coursing; double-click toggles an edge to a zigzag break-line (centre clicks ignored).
- Palette → View-icon → options-bar flow works via real DOM clicks; tile highlights.
- Grips: sec end-a/end-b/rotate, elev e-left/right/top/bottom; resize + rotate verified.
- Inspector exposes block/length/height/rotation/end-break/grout/break-edges.
- Save/load JSON round-trips all new fields; DXF emits 72 `S-MASONRY` refs + tags + polyline breaks.
- No console errors; legacy "Walls (W-)" tiles and 3D/2D mode switching unaffected.

## Follow-ups / notes

- Section grout fill is a clipped 45° hatch (clean, reads as grouted cores). If Dan wants the dot-stipple grout pattern instead, swap to the `grout` material hatch.
- Elevation `rot` field is shown generically in the inspector but the elevation renderer is axis-aligned (rot ignored) — harmless; could be suppressed later.
- 3D-mode blockwork is out of scope (blockWall is a 2D-only paper-space entity, like anchors/reo).
