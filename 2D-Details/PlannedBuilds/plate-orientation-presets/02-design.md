# 02 — Design (the change contract)

Everything here is on the **v2 plate path**. No `plate2` v1 entity. No revert of plates to v1. Orientation stays a UI-only concept (`appState.ui.activePlateOrientation`) — never serialised onto the element.

The two workstreams are **file-disjoint** (drag triad vs orientation set) and share only two small contracts, fixed below so every edit is consistent.

---

## Shared contracts (every edit codes to these exact names)

**Drag-state additions** — `v2.tools.editPlate.state.bodyDrag` gains two fields (written by `edit-plate.js`, read by `live-render.js`):

```
bodyDrag = {
  elementId, origPolygon, anchorWorld:{u,v}, currentDelta:{u,v},   // existing
  orthoAxis: 'u' | 'v' | null,   // NEW — set when Shift-ortho is active this move
  snapLines: [ {axis:'u'|'v', value:Number, label:String} ] | null // NEW — active soft-snap guides
}
```

**Orientation id set** — exactly these three strings everywhere (`place-plate-tool.js`, `72d`, `72-options-bar.js`, `palette-bb-rail.js`):

| id | meaning | geometry | thickness role |
|---|---|---|---|
| `elevation` | plate seen face-on (the sketch's ELEVATION square) | free-draw rectangle (drag) or polygon (click) — both dimensions user-defined | metadata only (into-page) |
| `h-cleat` | flat horizontal cleat (thin horizontal strip) | two clicks set the horizontal **length**; thickness = vertical extent; cursor side picks up/down | sets the strip depth |
| `v-cleat` | vertical cleat (thin upright strip) | two clicks set the vertical **length**; thickness = horizontal extent; cursor side picks left/right | sets the strip width |

Legacy mapping (for any stale in-memory value): `'vertical'`→`elevation`, `'horizontal'`→`h-cleat`. Row builder fn name: `v25BuildPlateOrientationRow()`. Icon symbol ids: `icon-orient-plate-elev`, `icon-orient-plate-hcleat`, `icon-orient-plate-vcleat`.

---

## Part A — Drag overhaul

### A1 · `js/v2/engine/event-dispatch.js` — raw cursor during a plate drag (kills lag + grid-jump)
In `viewToModel(event)`, immediately after the raw `u,v` are computed (after `px2real`, ~L77) and **before** the `v25TrySnap` block, short-circuit when an edit-plate drag is live:
```js
const _ep = window.v2 && v2.tools && v2.tools.editPlate && v2.tools.editPlate.state;
if (_ep && (_ep.bodyDrag || _ep.dragging || _ep.rotateDrag)) {
  return { u: u, v: v, blk: blk };   // raw cursor mid-drag — edit-plate does its own ortho/snap
}
```
Placement (place-plate tool active) is unaffected — no edit-plate drag is live then, so plate-draw snapping still works.

### A2 · `js/v2/tools/edit-plate.js` — free move + Shift ortho + soft face-snap + 2D-only render
- **Body move free-by-default (invert the lock).** In `onPointerMove`'s `state.bodyDrag` block and `onPointerUp`'s `state.bodyDrag` block, change `if (!shiftIsHeld(event))` → `if (shiftIsHeld(event))` for the axis lock, and when locking set `orthoAxis` (`'u'` when `dv` is zeroed → horizontal move; `'v'` when `du` is zeroed → vertical move). When **not** Shift, run the soft face-snap (A3) and store `snapLines`; when Shift, set `snapLines = null`.
- **Vertex drag unchanged** — keep `if (!shiftIsHeld) applyOrtho(...)` for `state.dragging` in both move and up (ortho-by-default resize; Shift = free). This is the inverse of move, by design.
- **2D-only render during the move.** Add `function render2D(){ if (typeof requestRender === 'function') requestRender(); }`. In `onPointerMove` (all three drag branches) call `render2D()` instead of `ctx.requestRender()` so the **3D engine is not re-rendered every mouse-move**. Keep `ctx.requestRender()` (full, marks 3D dirty once) on `onPointerUp` commit and on selection changes in `onPointerDown`.
- **Easier selection of thin cleats.** In `onPointerDown` priority-4 (body), if `hitTestBody` misses, fall back to a non-Shift `hitTestEdge` hit → select + start a `bodyDrag` on that plate (so a thin strip is grabbable anywhere on/near its outline). Shift+edge (priority 3, insert-vertex) still wins when Shift is held.

### A3 · `js/v2/tools/edit-plate.js` — `computeBodySnap(origPolygon, du, dv, blk)` (soft snap to member faces)
Pure helper used by the free-move path. Returns `{ du, dv, lines }`.
1. Translate `origPolygon` by the raw `(du,dv)`; take its bbox → **source edges** = `{u:[L,(L+R)/2,R], v:[B,(B+T)/2,T]}`.
2. **Target edges** (axis-aligned `{axis,value,label}`):
   - For each `e` in `entities2D[blk.viewKey]` with `e.type==='mem2'` → `getV25EntSnapEdges(e, blk.viewKey)` (member web/flange faces + centrelines). *(This is the UB-web-face snap.)*
   - For each **other** v2 plate (`eachV2Plate`, `el.id !== bodyDrag.elementId`, same viewKey) → its bbox edges (`u:left/centre/right`, `v:bottom/centre/top`, label `'Plate edge'`).
   - Defensive: if `objects3D.length`, also `getSnapEdges(obj, blk.viewKey)` for each (projected 3D members).
3. Tolerance `tolMM` = ~10 screen-px → mm via `viewport.zoom`/`drawingScale` (reuse the `pxTolMM()` math with a 10-px constant). Per axis, take the closest `|source−target|`; if `< tolMM`, add `(target − source)` to that axis's delta and push the target `{axis,value,label}` into `lines`.
4. Return adjusted `du,dv` + `lines`. On `onPointerUp`, run the **same** snap so the committed position matches the preview.

### A4 · `js/v2/ui/live-render.js` — dotted ortho guide + snap indicator
Add `drawV2PlateDragGuides(blk, cs)`, exported on the same object as the other plate passes and **called immediately after `drawV2PlateSelection(blk, cs)`** wherever that is invoked (grep its call site in the v1 render loop). It reads `v2.tools.editPlate.state.bodyDrag`:
- **Ortho guide** — if `bodyDrag.orthoAxis === 'u'` (horizontal move) draw a long **dotted** horizontal line through `anchorWorld.v` across the block; if `'v'`, a vertical dotted line through `anchorWorld.u`. Subtle: `--text-mute`/`--accent`, ~0.6 px, dash `[2,3]` (Revit guide look).
- **Snap indicators** — if `bodyDrag.snapLines`, for each draw a dashed line at `axis=value` spanning the view + a small label, reusing the visual treatment of `drawEdgeSnapLines` (`--selected-color`, `DASH.SNAP`). Use the *translated* plate position so the guide sits on the snapped edge.

Render-cost note: these passes only run while `bodyDrag` is active, so idle frames are untouched.

---

## Part B — Orientation presets

### B1 · `js/v2/tools/place-plate-tool.js` — three orientations + vertical cleat + auto-select
- `DEFAULT_ORIENTATION = 'elevation'`. `activeOrientation(ctx)` returns one of `elevation|h-cleat|v-cleat`, mapping legacy `'vertical'`→`elevation`, `'horizontal'`→`h-cleat`.
- Add `verticalCleatPolygon(anchor, cursor, thk)` mirroring `horizontalCleatPolygon` but with **length along v** and **thickness along u** (`dir = cursor.u>=anchor.u ? 1 : -1`).
- Generalise the existing `orient==='horizontal'` branches in `onPointerMove`/`onPointerDown`/`onPointerUp`/`statusText` to a **cleat mode** (`h-cleat||v-cleat`) that picks the polygon fn by orientation. `elevation` keeps the current `'vertical'` (rect-drag / click-to-poly) flow verbatim. Add a `commitVerticalCleat` (or parametrise `commitHorizontalCleat` → `commitCleat(ctx,a,b,orient)`).
- **Auto-select after place** (Q1 answer): add `selectAfterPlace(ctx, tx)` called at the end of each successful commit (`commitRect`, `commitPoly`, `commitCleat`). It resolves the just-placed element id (read it off the `placeElement` tx — confirm the field by reading `js/v2/transactions/place-element.js`; fall back to the newest `category:'plate'` element by `createdAt`), then: `v2.tools.editPlate.state.selectedId = id`, `v2.engine.setActiveTool(null)` (releases the tool; fires `tool-changed` → options bar refresh), `ctx.requestRender()`. Degenerate commits (the existing `< 1 mm` guards) do **not** auto-select.

### B2 · NEW `js/72d-v25-plate.js` — orientation catalogue + row (sibling of 72c)
Band-9, classic `<script>` (`'use strict'`, no IIFE needed; globals flow). ~70 lines.
```js
const V25_PLATE_ORIENT = [
  { id:'elevation', label:'Elevation — face on',     icon:'icon-orient-plate-elev'   },
  { id:'h-cleat',   label:'Flat horizontal cleat',   icon:'icon-orient-plate-hcleat' },
  { id:'v-cleat',   label:'Vertical cleat',          icon:'icon-orient-plate-vcleat' },
];
function v25BuildPlateOrientationRow() { /* mirror v25BuildBoltOrientationRow */ }
```
`v25BuildPlateOrientationRow()` returns a `<div id="v25OrientRow">` of `.v25-orient-btn` icon buttons (`<svg class="icon"><use href="#…"/></svg>`). Active id from `v2.appState.ui.activePlateOrientation` (mapped legacy), default `elevation`. Click → set `v2.appState.ui.activePlateOrientation = id`, **reset in-flight tool state** (`appState.tools['place-plate']`: `mode:'rect', anchor:null, anchorPx:null, poly:[], preview:null`) so switching orientation mid-placement can't leave half-built geometry, then `v25UpdateOptionsBar()` + `requestRender()`. (`activePlateOrientation` is itself the persisted memory — `palette-bb-rail` preserves it across re-arms — so no separate `lastUsedOrientation.plate` is needed.)

### B3 · `index.html` — three icons + the script tag
Add three single-stroke `<symbol>`s with the orientation-icon block (~after `icon-orient-i-sec-h`, near L202), matching the existing weight/`viewBox="0 0 20 20"`:
- `icon-orient-plate-elev` — square (plate face) + short weld ticks down the left edge (echoes the sketch).
- `icon-orient-plate-hcleat` — thin horizontal rectangle (strip) centred.
- `icon-orient-plate-vcleat` — thin vertical rectangle (strip) centred.
Add `<script src="js/72d-v25-plate.js"></script>` **after** the `72c-v25-bolt.js` tag (L1464) and **before** `73-init.js` (L1465).

### B4 · `js/72-v25-options-bar.js` — icon row replaces the dropdown; thickness kept + always on
In the `v2Tool.id === 'place-plate'` branch (L28-97): keep the **Thickness** `<select>` (default `activePlateType || 'PL12'`) but **remove the `thkDisabled` gating** (always enabled — the user wants it selectable; it's simply inert for `elevation`). Replace the **Orientation `<select>`** with a `<span id="v25OrientSlot"></span>` placeholder, and **before the early `return`** swap it for the live row: `const slot = bar.querySelector('#v25OrientSlot'); if (slot && typeof v25BuildPlateOrientationRow === 'function') slot.replaceWith(v25BuildPlateOrientationRow());`. Drop the old orientation-`<select>` change handler; keep the thickness handler. Refresh the help text for the three modes + Shift behaviour.

### B5 · `js/v2/ui/palette-bb-rail.js` — default orientation `elevation`
In `activatePlate`, replace the `activePlateOrientation` defaulting (L59-60) with: keep it if it's one of `elevation|h-cleat|v-cleat`, map legacy `'vertical'`→`elevation`/`'horizontal'`→`h-cleat`, else default `elevation`.

---

## Files touched (in released app)

| File | What changes | Workstream |
|---|---|---|
| **NEW `js/72d-v25-plate.js`** | `V25_PLATE_ORIENT` + `v25BuildPlateOrientationRow()`. Band 9, sibling of `72c`. | B |
| `index.html` | 3 `icon-orient-plate-*` symbols in the SVG sprite + `<script src="js/72d-v25-plate.js">` after `72c`. | B |
| `js/72-v25-options-bar.js` | place-plate branch: orientation `<select>` → `#v25OrientSlot` row; thickness always enabled; slot swap before the early return. | B |
| `js/v2/tools/place-plate-tool.js` | 3 orientations + `verticalCleatPolygon` + cleat-mode generalisation + `selectAfterPlace`. | B |
| `js/v2/ui/palette-bb-rail.js` | default `activePlateOrientation = 'elevation'` (+ legacy map). | B |
| `js/v2/tools/edit-plate.js` | invert body-move ortho (free default, Shift lock) + `orthoAxis`/`snapLines` state + `computeBodySnap` + `render2D` per-move + edge-fallback selection. Vertex drag unchanged. | A |
| `js/v2/engine/event-dispatch.js` | raw cursor in `viewToModel` while an edit-plate drag is live. | A |
| `js/v2/ui/live-render.js` | `drawV2PlateDragGuides` (dotted ortho guide + snap indicators) called after `drawV2PlateSelection`. | A |
| `CHANGELOG.md` | one line. | — |

Save/load (`46`, `js/v2/io`), DXF (`45`), PDF (`44`) are unaffected — orientation isn't serialised and the committed plate polygon is identical in shape to today's. Verify save→reload + a DXF/PDF as a smoke check only.

## Reused (do not reinvent)
- `getV25EntSnapEdges(ent, viewKey)` / `getSnapEdges(obj, viewKey)` — `js/12-edge-snap.js` (member-face snap edges).
- `drawEdgeSnapLines` visual treatment, `DASH.SNAP`, `colorAlpha`, `real2px`, `LW` — `js/12`, `js/03`, `js/08`.
- `.v25-orient-btn` CSS + `#v25OrientRow` + `<svg class="icon"><use>` sprite pattern — `css/styles.css`, `js/72b`/`72c`.
- `horizontalCleatPolygon`, `rectPolygon`, `buildPlateTx`, `thicknessFor` — `js/v2/tools/place-plate-tool.js`.
- `v2.transactions.placeElement` / `editElement`, `v2.engine.undoStack`, `v2.engine.setActiveTool` — v2 engine/transactions.
