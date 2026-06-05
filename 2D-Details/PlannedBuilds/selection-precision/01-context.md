# 01 — Context: why clicking a screw selects the timber underneath

## The bug, concretely

The sketched end-plate / fixing detail Dan builds in 2D mode routinely stacks small fasteners on top of big filled members:

- a **timber post** (`mem2`, `memberType:'timber'`) — a large filled rectangle;
- a **plate** (v2-authoritative cleat) — a filled polygon on top of it;
- an **HBS screw** (`screw`) — a tiny glyph fixing the plate to the post, drawn *on top* of both.

The user clicks **directly on the screw**. They get the **plate** or the **timber** selected instead. The thing they can see and aimed at is the hardest thing to select.

This is the single most common "fighting the tool" moment in 2D detailing, and it's exactly the friction Revit and Bluebeam don't have.

## Root cause — there are TWO, and both must be fixed

### Cause 1 — v1 pick is AABB containment ranked by paint order

The v1 2D hit-test, `v25HitTestStack(blk, u, v)` (`js/71-v25-selection.js:225-341`), works like this:

- A handful of types are **already precise**: `leader2` (`:267-282`, on-line / text-anchor pixel distance), `dim2` (`:285-303`, distance to dim line / witness lines / label box), and the noteBox arrowhead pre-pass `PASS0` (`:248-260`) + noteBox leader test (`:309-320`).
- **Every other type** falls into the **generic AABB push** (`:323-338`): it converts `v25EntBounds(ent)` (an axis-aligned box) to screen px and pushes the entity if the cursor is inside the box (± a tolerance). The only ordering is **paint order, newest-first** (the loop runs `for (i = arr.length-1; i >= 0; i--)`), with a frame border-only carve-out (`:331-336`).

So for the screw-on-timber-under-plate case:
- The **timber's** AABB contains the cursor. ✔ pushed.
- The **screw's** AABB contains the cursor. ✔ pushed — but the screw was painted *before* whatever's newest, so it's not necessarily first.
- There is no notion that the screw is a *tighter, more specific* target than the post. The post is a 300×300 filled square; the screw is a 16 mm glyph; the pick treats both as "cursor is in the box."

Worse, two of the AABB boxes are **offset from the drawn pixels**: the screw's section glyph and the bolt's section glyph **re-centre on a detected bearing/clamp face at draw time** (`v25ScrewBearingFace`, `js/72i-v25-screw.js:162`; `v25BoltClampSpan`, `js/72c-v25-bolt.js`). `v25EntBounds` has **no `blk`** so it cannot run those scanners — it boxes the glyph around the *placed* `ent.u/ent.v`, which can sit tens of mm off the painted glyph. So the AABB is doubly wrong for fasteners: too coarse *and* in the wrong place.

### Cause 2 — v2 plates are picked by a separate listener that suppresses v1 entirely

This is the part that makes "the plate steals the click" un-fixable by re-ranking v1 alone.

- v1 binds `mousedown` on the canvas (bubble phase).
- v2 binds `pointerdown` (and pointermove/up) on the canvas in **capture phase** with `{capture:true, passive:false}` (`js/v2/engine/event-dispatch.js:254-260`), installed **after** v1.
- These are **different DOM event types**, so for one physical click **both fire**. The browser fires `pointerdown` before the compatibility `mousedown`.
- On `pointerdown`, `event-dispatch.route()` (`:171-209`) — when no v2 *tool* is active and the v1 tool is `'select'` — calls `v2.tools.editPlate.onPointerDown`. If that returns truthy (a plate hit), the dispatcher calls `stopImmediatePropagation()` **and `preventDefault()`** (`:199-200`).
- `editPlate.onPointerDown` (`js/v2/tools/edit-plate.js:445-586`) has four priorities. Priority 4 (`:542-580`) claims a **plain (no-modifier) click whenever the cursor is inside ANY plate polygon** (`hitTestBody`) **or near an edge** (`hitTestEdge`), sets `window.v25SelPlateIds=[id]`, arms `state.bodyDrag`, and returns `true`.

Per the Pointer Events spec, `preventDefault()` on `pointerdown` suppresses the subsequent compatibility `mousedown`. So **whenever a plate is under the cursor, v1's `mousedown` select branch never runs** — the plate wins by event phase, before specificity is ever considered. (Even if it weren't suppressed, the v1 PASS1 loop guards `if (!ent._v25) continue` and the plate *mirror* entities in `entities2D` carry `_v2Mirror:true` but **not** `_v25` — so they'd be skipped anyway.)

**Therefore:** re-ranking `v25HitTestStack` alone fixes *screw-vs-timber* but **not** *screw-vs-plate*. To fix screw-vs-plate, `editPlate.onPointerDown` must **stop claiming the plain body/edge click** (return `false`, defer to v1), and the plate must be **added to v1's ranked stack** so the single ranked decision lives in exactly one place (v1 `mousedown`). v1 then re-arms the plate drag through a new `editPlate.beginBodyDragFromExternalSelect` export.

## What ALREADY works (and must keep working)

- **Repeat-click cycling.** A non-Shift click within 4 px of the previous click, on the *same stack*, advances `v25CycleIndex` and selects the entity underneath, wrapping (`js/39-events.js:272-283`). The continuity test compares the stack's id-array element-by-element against `v25CycleIds` (`:275-276`); if the arrays differ, the cycle resets to index 0. There's also a handle-grab cycle-arm path resolved at mouseup (`:1439-1452`). **Both rely on the stack being deterministic and stable** — the same click must always yield the identical ordered id-array, or the cycle silently resets every click.
- **PASS0 arrowhead priority.** A noteBox whose arrow *tip* is within 8 px wins over an overlapping member regardless of z-order (`:248-260`). Must survive — modelled as `precise:true` with `score ≈ tip-distance` so it still floats to `stack[0]`.
- **Frame border-only selection.** A `frame` is hit only on its border band, never its interior, so members drawn inside a detail frame stay selectable (`:331-336`). Must survive.
- **leader2 / dim2 precise branches.** Already precise; fold into the scored list (emit their existing distances as `score`) rather than route through the generic path.
- **Right-click select, marquee select.** The contextmenu path (`js/39-events.js:1838-1856`) and the marquee mouseup (`:1607-1634`) already arbitrate plate-vs-v1 and set the two selection stores. They are the **reference pattern** for the mutual-exclusion the new single-click path must mirror.

## The mental model: Revit / Bluebeam specificity pick

The target user is a senior structural engineer who uses Revit and Bluebeam daily. In both:

- A click resolves to the **most specific element under the cursor** — the bolt on the plate, not the plate; the dimension line, not the wall behind it.
- **Repeat-clicking the same point tunnels through** the stack to what's behind (Revit's Tab-cycle / Bluebeam's repeat-click).
- Filled regions lose to the linear/point elements drawn on them.

This build makes 2D-mode StructDraw behave that way. "Specificity" is encoded concretely:

- **Precise (linear/point) entities always beat area (filled) entities.** The screw's centreline, the dimension line, the leader — these are what the user is aiming at when they click on them, even if a filled member's box also contains the cursor.
- **Among precise entities, the closest stroke/point wins** (smallest CSS-px distance).
- **Among area entities, the smallest polygon wins** (smallest real-mm² — the cleat beats the post beats the frame).
- **Ties break by paint order** (topmost / newest first), which keeps the result deterministic for the cycle.

## Why this is the right scope

- It's **2D-mode only**. 3D-mode pick (`blockAtPixel` / `cycleHits`) is a completely separate pipeline with its own depth model and is explicitly **out of scope** — do not touch it.
- It **reuses the existing cycle** rather than inventing a new one. The cycle already tunnels through the stack; we only re-order the stack and add plates to it.
- It **keeps `v25HitTest`'s entity-or-null signature** so the ~6 other callers (`js/39-events.js:172, 1298, 1719-1722, 1839-1852`; `js/71:980, 984`) don't break.
- It **keeps `v25EntBounds`** as a cheap pre-filter (run the precise test only when the cursor is inside the bbox) — `v25EntBounds` is also consumed by `v25ScrewBearingFace`, `v25BoltClampSpan`, the highlight renderer, snap, and the marquee, so it must not be deleted, only demoted in *how the stack uses it*.
