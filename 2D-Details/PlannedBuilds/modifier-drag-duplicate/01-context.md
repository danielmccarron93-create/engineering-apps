# 01 — Context

## The gesture

Bluebeam Revu: select nothing in particular, hold **Ctrl**, click on any markup, drag —
a copy is created at the grab point and follows the cursor; release to drop it. The
original never moves. It's the fastest "give me another one of these, here" in the app,
and it's deeply wired into the muscle memory of anyone who details in Bluebeam.

We want the identical feel in StructDraw, for **any** item, in **both** modes.

## How a drag works today (the three pipelines)

StructDraw routes a body-drag through three mutually-exclusive code paths depending on
what's under the cursor. Understanding this split is the whole feature.

### Pipeline A — v25 2D entities (v1 `mousedown`/`mousemove`/`mouseup`)

`js/39-events.js` holds the big `initEvents` tree. In 2D select mode it:

1. **mousedown** (`~248–259`): runs `v25HitTest(activeBlock, cu, cv)`; on a hit, sets
   the selection and starts a drag —
   ```js
   const handle = v25HitHandle(activeBlock, hit, cu, cv);   // 'body' | 'end-a' | 'rotate' | 'pt:N' …
   v25Drag = { ent: hit, handle, lastU: cu, lastV: cv };
   v25Drag.undoBefore = v25SnapshotMoveTargets(hit);
   ```
   A grip-handle grab on an already-selected entity is caught just above (`~238–247`).
2. **mousemove** (`~1075`): computes `du/dv` and calls `v25Move(v25Drag.ent, du, dv, v25Drag.handle)`.
3. **mouseup** (`~1305`): pushes a single `{act:'v25Move', before, after}` undo entry.

Grouped entities: `v25ExpandGroupSelection()` (`~253`) selects the whole group on a hit,
and `v25Move` + `v25SnapshotMoveTargets` already move/snapshot every group member.

### Pipeline B — v2 plates (capture-phase `pointerdown`/`move`/`up`)

Plates are the one element on the v2 path (the rest of the architecture-v2 rebuild was
abandoned — see root `CLAUDE.md`). `js/v2/engine/event-dispatch.js` installs
**capture-phase** pointer listeners that run *before* v1's bubble-phase mouse listeners;
when `editPlate` claims an event it calls `stopImmediatePropagation()` so v1 never sees it.

`js/v2/tools/edit-plate.js` `onPointerDown` checks, in priority order: rotation handle →
vertex → edge → **body** (`~498–517`). The body branch starts a move:
```js
state.bodyDrag = { elementId, origPolygon: el.geometry.polygon.slice(),
                   anchorWorld:{u,v}, currentDelta:{u:0,v:0}, orthoAxis:null, snapLines:null };
```
`onPointerMove`/`onPointerUp` preview + commit the translation via a `placeholder`-free
polygon edit transaction.

### Pipeline C — 3D-mode objects (v1 `mousedown`/`move`/`up`)

Same `js/39-events.js`, the non-2D branch. **mousedown** (`~969–980`): `hitTest3D` →
`dragMoving = true; dragStart = {u,v}; dragSnapshots = selected3D.map(deep-clone)`.
**mousemove** (`~1132`) applies `du/dv` to each `selected3D` object per the view axis.
**mouseup** (`~1400`) pushes `{act:'moveObj', before, after}`.

## What already duplicates (the machinery we reuse)

- **v25:** `v25DuplicateSelected()` — `js/71-v25-selection.js:1626`. Deep-clones each
  selected entity (`JSON.parse(JSON.stringify)`), mints `ent2dIdN++`, offsets by 30 mm
  with `v25Move`, pushes to `entities2D[viewKey]`, retargets `v25Selected`.
- **3D:** `pasteObjects()` — `js/43-clipboard.js:9`; and the Ctrl+D path —
  `js/42-keyboard.js:73`. Deep-clone, `objIdN++`, +30 offset, `addObj`, retarget `selected3D`.
- **v2 plate:** `v2.transactions.placeElement(spec)` — `js/v2/transactions/place-element.js:35`
  mints a fresh element (`v2.model.newElementId()`) from `{category, family, type, geometry,
  materialId, params}`. The place-plate-tool resolves the new id from the returned tx
  (`tx.data.element`).

The feature reuses the **clone mechanics** of each, but with **zero offset** (the copy is
born exactly on the original and tracks the cursor from the grab point).

## The macOS modifier conflict (why not just "Ctrl")

Dan's daily machine is macOS (per project memory). On macOS, **Ctrl+click is a system
right-click**: the browser raises a `contextmenu` event, and StructDraw's contextmenu
handler (`js/39-events.js:1646`) opens the **Group/Joint context menu**. v1's mousedown
also bails on non-left buttons (`if (e.button !== 0) return;`, `~165`), and some Mac
browsers report Ctrl+click as button 2. So **Ctrl-drag on a Mac fights the right-click**,
unreliably.

Resolution (locked): **Alt/Option** is the primary modifier — clean and identical on Mac
and Windows, no contextmenu conflict anywhere, and it matches the Figma/Illustrator/Sketch
duplicate-drag convention. **Ctrl** is additionally enabled **on Windows/Linux only**,
where Ctrl+click raises no contextmenu and Dan gets his exact Bluebeam muscle-memory at the
office. This honours "both Alt and Ctrl" while leaving the Mac right-click menu untouched.
A one-line opt-in (drop the platform guard + early-return the contextmenu on `e.ctrlKey`)
enables Ctrl-drag on Mac too if Dan ever wants it — see `02-design.md`.
