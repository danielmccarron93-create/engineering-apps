# 01 — Context

## What the user asked for

> "There is something pretty significantly wrong with the plates when I draw in 2D. They are really laggy after I draw them and try to move, they are hard to select — basically I should be able to click a plate easily, or drag and select the plate like any other member and then easily move the plate by dragging it where I want. At the moment when I try to move the plate it only goes orthogonal and it's really jumpy and I cannot get it to smoothly go next to a member and then snap to the outside face of a member (draw a vertical 12 thick cleat plate, drag it easily in any direction until it gets close to the face of the web of the UB, then it should subtly snap to that face — very common for a cleat plate). Update it so when I'm dragging a plate it drags smoothly and freely, and only moves orthogonal if I'm holding Shift, and show a dotted preview line on that plate when I'm dragging it orthogonally like Revit. Also add an icon to the plates (like UBs now) that shows a preview of a horizontal cleat plate, a vertical cleat plate, and a cleat plate from the side view per the sketch. Leave the plate thickness tab at 12mm by default."

The sketch shows three figures under **PLATES**: **ELEVATION** (a square plate seen face-on, with weld ticks down the left edge), **FLAT HORIZONTAL CLEAT** (a thin horizontal strip — the plate seen on edge, lying flat), and **VERTICAL CLEAT** (a thin vertical strip — the plate seen on edge, standing up).

## Two goals

1. **Fix the drag** — smooth, free movement (Shift = ortho with a dotted guide), no lag/jumpiness, and a soft snap of the dragged plate to a nearby member face.
2. **Orientation presets** — the plate analogue of the member/bolt orientation rows: a row of icon buttons (Elevation / Flat-horizontal-cleat / Vertical-cleat), thickness kept at 12 mm.

## How the 2D plate works today (the v2 path — do not revert to v1)

Per `CLAUDE.md`, plates are the **one surviving live piece of the abandoned architecture-v2 rebuild**. A placed 2D plate is a **v2 Element** (`category:'plate'`, `family:'plate-flat'`, `type:'PL12'`, `params.thickness`, `geometry:region{viewId:'v1-view-<key>', polygon:[{x,y}…]}`), held in `v2.appState.model.elements`. The relevant files:

- **Placement** — `js/v2/tools/place-plate-tool.js` (`PlacePlateTool`). Reads `appState.ui.activePlateOrientation` (`'vertical'` free-draw rectangle/polygon, or `'horizontal'` flat cleat) + `activePlateType` (thickness). Commits via `v2.transactions.placeElement` → undo stack.
- **Edit (select / move / resize / rotate)** — `js/v2/tools/edit-plate.js`. Fires only when **no v2 tool is active** (select-mode idle). Hit-test priority: rotation handle → vertex → Shift+edge (insert vertex) → body (point-in-polygon). Drag state lives on `v2.tools.editPlate.state.{dragging, bodyDrag, rotateDrag, selectedId}`. Commits a polygon edit on pointer-up.
- **Cursor / events** — `js/v2/engine/event-dispatch.js` routes pointer events; `viewToModel()` converts the event to model `(u,v)` and **applies `v25TrySnap` + `snapUV`** before handing the cursor to the tool/edit handler.
- **Render preview** — `js/v2/ui/live-render.js` (`drawV2PlatesOnCanvas`, `drawV2PlateVertexDots`, `drawV2PlateSelection`) paints the plate + a live preview of the in-progress drag by transforming the polygon by `bodyDrag.currentDelta` / `rotateDrag` / `dragging`.
- **Options bar** — `js/72-v25-options-bar.js` has a dedicated branch (`v2Tool.id === 'place-plate'`) showing **Thickness** + **Orientation** `<select>`s.
- **BB-rail tile** — `js/74-v26-bb-rail.js` Plate tile → `v2.ui.paletteBBRail.activatePlate()` (`js/v2/ui/palette-bb-rail.js`), which seeds `activePlateFamily/Type/Orientation` defaults and arms `place-plate`.

## The drag-bug diagnosis (root causes, by symptom)

| Symptom | Root cause | Location |
|---|---|---|
| **"Only goes orthogonal"** | Body drag is ortho-by-default; free needs Shift — the **inverse** of what's wanted. `if (!shiftIsHeld) { lock one axis }` | `edit-plate.js` `onPointerMove` ~L390-393 + `onPointerUp` ~L444-447 |
| **"Jumpy"** | Every mouse-move, `snapUV` **grid-snaps the cursor to `gridSize` (10 mm)** — the plate hops square-to-square; the axis-lock flipping H/V adds to it | `09-snap.js` `snapUV` L84 (grid) called from `event-dispatch.js` `viewToModel` L97 |
| **"Laggy after I draw them and try to move"** | `viewToModel` runs `v25TrySnap` + `snapUV` on **every** move (snapUV scans every `objects3D` + every `entities2D` for snap points); and the edit handler's `ctx.requestRender()` also fires **`v3dMarkDirty()`** → a full **Three.js re-render** on every move while nudging a 2D plate | `event-dispatch.js` `viewToModel` L81-107; `buildCtx.requestRender` L139-142 |
| **No snap to a member face** | Edge-snap to member faces (`12-edge-snap.js` / `getV25EntSnapEdges`) only runs while **drawing** a plate (the `snapUV` `v2PlateActive` branch), never while **moving** an existing one | `09-snap.js` L18-67 |
| **"Hard to select"** + must Esc first | Body hit-test is point-in-polygon on a thin (12 mm) strip; and `editPlate` only runs when **no v2 tool is active**, so after drawing (Plate tool still armed) a click tries to place another plate | `edit-plate.js` `hitTestBody` L210-220; `event-dispatch.js` `route` L164-186 |

## The orientation gap

The Plate tool exposes orientation as a two-value `<select>` (`vertical` free-draw / `horizontal` cleat). There is **no vertical cleat**, no icon affordance, and it doesn't match the one-click icon-row UX the members (`72b`) and bolts (`72c`) now have. Orientation is a **UI-only** concept (`appState.ui.activePlateOrientation`) — it is **not** persisted on the element — so the value set can change freely with no save/load migration. The fix extends it to three clearly-named values and surfaces them as an icon row.
