# 02 — Design

## Core decision — the cycle resolves on mouse-UP, not mouse-DOWN

Both a click and a drag begin with a mousedown. If the cycle advanced on every mousedown, then after cycling down to a buried entity (say the plate), the very mousedown that *starts a drag to move the plate* would advance the cycle past it first — you could only ever drag the top entity.

Resolving on **mouse-up** removes the ambiguity:
- mousedown arms a drag for the entity the cycle currently points at;
- a release with **no movement** is a clean click → advance the cycle;
- a release **after movement** is a drag → the entity moved, end the cycle.

This is how Bluebeam Revu behaves and it is the load-bearing design decision. Fresh clicks (the first click on a stack) still select on mousedown, so drag-to-move of the top entity feels instant; only the *re-click* defers its selection change to mouseup.

## Cycle state — one global, self-invalidating

`dev/js/07-globals.js`:
```js
// ---- V25 2D CLICK-CYCLING SELECTION STATE ----
let v25ClickCycle = null;  // { clientX, clientY, viewKey, ids:[...], index }
const V25_CYCLE_PX = 4;    // px tolerance for "same spot" + clean-click test
```

`v25ClickCycle` holds the anchor pixel (screen `clientX/clientY`), the view key, the ordered entity-id stack (top-most first), and the current index. `null` when no cycle is armed.

The cycle is **self-invalidating**: every mousedown recomputes the stack under the cursor, and a re-click is accepted only if *all* of these hold —
- same view;
- mousedown within `V25_CYCLE_PX` of the stored anchor pixel;
- the recomputed stack's ids deep-equal `v25ClickCycle.ids`;
- `v25Selected` is exactly the cycle's current entity, and it still resolves to a live entity.

Any mismatch — entity moved, deleted, added, selection changed by other means, different spot, different view — falls through to a fresh selection. So **no teardown hooks** are needed for undo / mode-switch / deletion: the predicate fails safe. The only explicit reset added is on marquee completion, for tidiness.

`V25_CYCLE_PX` deliberately serves two roles with one number: the "same spot" anchor tolerance and the "clean click vs drag" movement threshold. 4 px matches the existing `moved > 4` convention used by the V25 hatch / plate tools in `39-events.js`.

## The hit-test refactor — `v25HitTestAll`

`v25HitTest` was a reverse-iterating, return-first-hit function. It is split: a new `v25HitTestAll` does the same walk but **pushes every hit** to an array (top-most first, because the loop runs the entity array in reverse); `v25HitTest` becomes a thin wrapper returning `all[0] || null`. This keeps all four `v25HitTest` callers (the select mousedown — being rewritten — plus the dblclick handler and two uses in `v25HoverPick`) behaviour-identical.

```js
function v25HitTestAll(blk, u, v) {
  const hits = [];
  // ... identical tolerance setup + reverse loop as the old v25HitTest ...
  //     every `return ent` becomes `hits.push(ent)`; frame interior stays `continue`
  return hits;                       // ordered top-most -> bottom-most
}
function v25HitTest(blk, u, v) {
  const all = v25HitTestAll(blk, u, v);
  return all.length ? all[0] : null;
}
```

Because `v25HitTestAll` reuses the existing `v25EntBounds` AABB test, **every** `_v25` entity type is cyclable for free — and any future entity type (e.g. `bolt2` from the `v25-2d-bolts` idea) becomes cyclable the moment it has a `v25EntBounds` case.

`entities2D[viewKey]` array order *is* paint / z-order — `addEnt2D` pushes new entities and `28-draw-block.js` paints the array forward — so reverse iteration genuinely yields top-to-bottom. (Confirmed during planning.)

## The cycle helper — `v25ClickCycleCurrentEnt`

```js
function v25ClickCycleCurrentEnt(blk, e) {
  // returns the cycle's current entity iff: a cycle is live, same view,
  // mousedown within V25_CYCLE_PX of the anchor, and the cycled id still
  // resolves to a real entity. else null.
}
```
Shared by three call sites: the mousedown grip branch, the mousedown select branch, and the dblclick branch.

## Behaviour woven into `39-events.js`

| Branch (~line) | Change |
|---|---|
| mousedown grip branch (~183) | Before grabbing a grip handle of the selected entity, check `v25ClickCycleCurrentEnt`: if this is a same-spot re-click on the cycled entity, **fall through** to the select branch instead of starting a grip drag. Without this, once a buried entity that carries grip handles (e.g. `plate2`) is selected, a re-click near a corner would resize it instead of cycling. |
| mousedown select branch (~198) | `v25HitTest` → `v25HitTestAll`. `if (stack.length)` then: **shift+click** → additive select, no cycle, null any cycle; **re-click** (passes the predicate) → keep selection, arm a `body` drag with `cyclePending:true`; **fresh** → select `stack[0]`, build a new `v25ClickCycle`, arm a normal drag. An empty stack falls through to the existing near-miss / marquee chain unchanged. |
| mousemove `v25Drag` | Unchanged. |
| mouseup `v25Drag` branch (~1369) | Before clearing `v25Drag`: if `cyclePending` and the release is a clean click (within `V25_CYCLE_PX` of the mousedown pixel) → advance `v25ClickCycle.index` (mod length) and select that entity. If `cyclePending` and it *was* a drag → null the cycle (the entity moved). |
| dblclick select branch (~1188) | Hit source becomes `v25ClickCycleCurrentEnt(...) || v25HitTest(...)` so a double-click on a cycled-to buried entity opens *its* Settings, not the top entity's. |
| marquee mouseup (~1484) | Null `v25ClickCycle` when a 2D marquee completes (a marquee is a multi-select; it ends any cycle). |

The re-click drag is hard-coded to `handle:'body'` — never via `v25HitHandle` — so a re-click over a buried entity's corner can't accidentally turn the move into a resize.

## Status-bar hint — `47-status-bar.js`

`updateStatus()` gains a few lines: when a cycle is live over a stack of more than one, and the current selection is the cycle's entity, the tool label becomes `Select — N of M under cursor (click to cycle)`. No signature change — `updateStatus` is already called from the render path (`22-render-core.js`), so the `requestRender()` after a cycle advance refreshes it.

## Files touched (in released app)

| File | What changes |
|---|---|
| `dev/js/07-globals.js` | +`v25ClickCycle` (`let`) and `V25_CYCLE_PX` (`const`) in the selection-state block. |
| `dev/js/71-v25-selection.js` | +`v25HitTestAll`; `v25HitTest` rewritten as a wrapper; +`v25ClickCycleCurrentEnt`. |
| `dev/js/39-events.js` | Cycle-aware mousedown (grip + select), mouseup, dblclick, marquee branches. |
| `dev/js/47-status-bar.js` | +cycle depth hint in `updateStatus()`. |
| `2D-Details/CHANGELOG.md` | One `### Added` line. |

Exact before/after for every change is in `03-build-plan.md`.

## Non-changes worth noting

- 3D-mode selection, `hitTestAll3D`, and the Tab-to-cycle (`cycleHits` / `cycleIndex`) are untouched — different entity set, different globals.
- The mem2 / plate2 grip-handle drag, edge-snap, and `v25Move` are untouched.
- The marquee window / crossing logic is untouched (one line added only, to null the cycle).
- No save-format change — `v25ClickCycle` is transient UI state, never serialised. (This feature does **not** touch known issue #5 — schemaVersion — that rides with `v25-2d-bolts`.)
