# 02 — Design

## Shared behaviour spec (all three pipelines)

1. **Trigger = modifier + body-drag only.** Duplicate fires only on a *body* grab
   (`handle === 'body'` in v25; `hitTestBody` in plates; object body in 3D). Grip /
   vertex / rotation / end handles keep their normal resize/edit behaviour and never
   duplicate. This rule is what stops the feature hijacking node-editing.
2. **Clone created on the FIRST drag movement, not on the press.** A modifier-click that
   doesn't move just selects normally and makes no copy (no junk stacked duplicates).
   Implementation: at mousedown, if modifier+body, set a `dupPending` flag on the drag
   state and keep the *original* as the provisional target. On the first mousemove with
   `dupPending`, clone in place (zero offset), retarget the drag to the clone, clear the
   flag — the original never moves (clone happens *before* the delta is applied).
3. **Zero offset.** The clone is created exactly on top of the original so it tracks the
   cursor 1:1 from the grab point. Reuse the existing helpers' clone mechanics, not their
   +30 mm offset.
4. **Selection follows the copy** after release (matches existing duplicate + Bluebeam).
5. **One Ctrl+Z removes the copy.** Record the gesture as a single "add"-style undo entry
   at mouseup (clone at final position) and suppress the normal *move* undo for a
   duplicate drag — so undo deletes the copy and returns to the pre-drag state.
6. **Grouped selections duplicate as a unit with a fresh `groupId`.** When the grabbed
   entity is part of a v25 group (selection already expanded by `v25ExpandGroupSelection()`),
   clone every member and give the clones a *new* `groupId` so the copy is independent.

## The shared modifier rule (single source of truth)

Add one helper so v1 events and the v2 plate tool can never drift on what "the duplicate
modifier" means:

```js
// js/07-globals.js  — shared util + state
const IS_MAC = /Mac|iPhone|iPad/.test((navigator && navigator.platform) || '');
function isDupDragModifier(e){ return !!(e && (e.altKey || (e.ctrlKey && !IS_MAC))); }
window.isDupDragModifier = isDupDragModifier;   // v2 IIFE reads it off window
let dragDupPending = false;                       // Pipeline C cross-event flag
```

- **Mac:** Alt/Option duplicates. Ctrl untouched → Ctrl-click stays the Mac right-click →
  the Group/Joint context menu keeps working. **No contextmenu change needed.**
- **Windows/Linux:** Alt **or** Ctrl duplicates. Conflict-free; Bluebeam-exact.
- **One-line Mac-Ctrl opt-in (NOT default):** change the helper to `e.altKey || e.ctrlKey`
  and add, at the top of the contextmenu handler (`js/39-events.js:1646`),
  `if (e.ctrlKey) { e.preventDefault(); return; }`. Trade-off: loses Ctrl-click-as-right-
  click on Mac.

If `js/42-keyboard.js` already exposes a Mac flag (it branches on `metaKey`), reuse it
instead of re-deriving `IS_MAC`.

## The three seams

### Pipeline A — v25 2D entities · `js/39-events.js`

- **mousedown body-hit** (`~248–259`): after the existing `v25Drag = {…}` is built, if
  `isDupDragModifier(e)` **and** `handle === 'body'`, set `v25Drag.dupPending = true`
  (leave `undoBefore` unset — we won't push a move undo for a dup).
- **mousemove** (`~1075`): at the top of the `v25Drag` block, if `v25Drag.dupPending` and
  the cursor has actually moved, call the new shared clone helper (below) to clone the
  current selection in place, set `v25Selected` + `v25Drag.ent` to the clone matching the
  grabbed entity, record `v25Drag.dupAdded = [newIds]`, clear `dupPending`. Then fall
  through to the normal `v25Move` so the clone tracks the cursor.
- **mouseup** (`~1305`): if `v25Drag.dupAdded`, push one undo entry that removes those ids
  (e.g. reuse the `addEnt2D` undo shape, or a small `{act:'v25AddMany', view, ids}` entry)
  instead of the `v25Move` entry.

New shared helper in `js/71-v25-selection.js`, factored out of `v25DuplicateSelected()`:
```js
// Clone a set of entity ids in place (zero offset), remap to fresh ids, give any
// grouped clones a new shared groupId. Returns the new ids. v25DuplicateSelected()
// becomes: const ids = v25CloneEntsInPlace(v25Selected); ids.forEach(offset 30);
function v25CloneEntsInPlace(ids) { /* JSON deep-clone, ent2dIdN++, regroup, push */ }
```

### Pipeline B — v2 plates · `js/v2/tools/edit-plate.js`

In `onPointerDown`, the **body branch** (`~498–517`), before building `state.bodyDrag`:
if `window.isDupDragModifier(event)`, clone the hit element first and drag the clone:
```js
const src = v2.appState.model.elements.get(bHit.elementId);
const tx  = v2.transactions.placeElement({
  category: src.category, family: src.family, type: src.type,
  geometry: v2.model.region({ viewId: src.geometry.viewId,
                              polygon: src.geometry.polygon.map(p => ({x:p.x, y:p.y})) }),
  materialId: src.materialId,
  params: Object.assign({}, src.params),      // drop any groupId so the copy is independent
});
apply(tx);
const newId = tx && tx.data && tx.data.element ? tx.data.element.id : null;  // place-plate-tool pattern
// then point bodyDrag at newId instead of bHit.elementId
```
`placeElement` already records its own undo entry, and the subsequent body-move records
another (the polygon edit) — two undo steps is acceptable for v1 (note in open-questions
if Dan wants them coalesced). The clone is born at the same polygon, so it tracks 1:1.
`hitTestBody` returning the topmost plate means an Alt-drag on a plate that sits over
another still copies the right one.

### Pipeline C — 3D objects · `js/39-events.js`

- **mousedown 3D-hit** (`~969–980`): if `isDupDragModifier(e)` and we're starting a body
  move (not a grip), set `dragDupPending = true` (keep `dragSnapshots` of the originals
  as today).
- **mousemove** (`~1132`): if `dragDupPending` and moved, deep-clone each `selected3D`
  (`JSON.parse(JSON.stringify)`, `objIdN++`, `addObj`) in place, set `selected3D` to the
  clones, record their ids for undo, clear the flag; then apply the delta as usual.
- **mouseup** (`~1400`): if a dup happened, push an "add" undo for the clone ids instead
  of `moveObj`. (Reuse whatever undo shape `addObj`/paste uses so redo behaves.)

## Files touched (in released app)

| File | What changes |
|---|---|
| `js/07-globals.js` | `IS_MAC`, `isDupDragModifier()` (on `window`), `dragDupPending` flag |
| `js/39-events.js` | Pipeline A hook (mousedown ~248, first-move clone ~1075, add-undo ~1305) + Pipeline C hook (mousedown ~969, first-move clone ~1132, add-undo ~1400). **No contextmenu change** (default Mac=Alt-only). |
| `js/71-v25-selection.js` | new `v25CloneEntsInPlace(ids)` helper (zero-offset clone + id remap + fresh groupId), factored out of `v25DuplicateSelected()` so both share one routine |
| `js/v2/tools/edit-plate.js` | Pipeline B hook in `onPointerDown` body branch: modifier → `placeElement` clone, retarget `state.bodyDrag` to the new element |
| `CHANGELOG.md` | one line |

**New files:** none. Every change is small and extends an existing concept, so per the
root `CLAUDE.md` "what goes in a new file" rule it belongs in the files above.

## Reused functions (do not reinvent)

- `JSON.parse(JSON.stringify(x))` clone; `ent2dIdN++` (`js/05-state.js:242`),
  `objIdN++` (`js/05-state.js:45`).
- `v25Move(ent, du, dv, 'body')` (`js/71-v25-selection.js:1045`) — already translates
  every entity type correctly (endpoints, `pts[]`, tip/txt, arrows…).
- `v25ExpandGroupSelection()`, `v25SnapshotMoveTargets()` (`js/39-events.js:23`, `:253`).
- `addObj` (+ its undo) for 3D; `addEnt2D` undo shape (`js/05-state.js:246`) as a model
  for the v25 add-undo.
- `v2.transactions.placeElement` + `v2.model.region` + `apply(tx)` (`edit-plate.js:389`).
