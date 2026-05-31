# 04 — Decisions made & known limitations

All planning questions for this idea were resolved before/while building. The
build chat ran a Plan-agent design review before writing any code, and Dan
approved the plan. Nothing here blocks shipping. This file records the
judgement calls that were made — so Dan can revisit any of them — plus the
limitations carried into v1.

## Decisions made

### D1 — Cycle resolves on mouse-UP, not mouse-DOWN ✅
A click and a drag both start with a mousedown. Advancing the cycle on every
mousedown would make a buried entity undraggable — the mousedown that starts
the drag would cycle past it first. Resolving on mouse-up (clean click = advance,
drag = move + end cycle) is the only design that lets you cycle down to a plate
*and then drag it*. This is also exactly how Bluebeam Revu behaves. Locked.

### D2 — No `e.detail` double-click guard ✅
An earlier sketch gated the mouseup cycle-advance on `e.detail < 2` to exclude
the second click of a double-click. Dropped: it only half-works (the *first*
mouseup of a double-click still has `detail:1` and would advance), and it
blocks fast repeated clicking from cycling (every other mouseup has
`detail >= 2`). Instead the dblclick handler was made cycle-aware (D5). Net:
fast-clicking cycles correctly; a double-click cleanly opens the cycled
entity's Settings. Revisit only if double-click feels off in practice.

### D3 — Forward-only cycle, wraps top→bottom→top ✅
Matches the existing 3D Tab-cycle (`cycleIndex = (cycleIndex + 1) % n`). No
reverse step. Shift+click is already taken (additive select); if Dan wants a
reverse step later, Alt+click is the natural key — deferred to v1.x. See Q-A.

### D4 — No new file ✅
Per `CLAUDE.md` "what goes in a new file" (≥150 lines AND topically distinct,
OR a self-contained module). The change is ~123 lines woven into existing
modules, extending existing concepts — so it went into existing files.

### D5 — The grip branch defers to the cycle on a re-click ✅
Surfaced by the Plan-agent review; would have been a real bug otherwise. Once
a buried entity that carries grip handles is selected (e.g. a `plate2` with
corner handles), a same-spot re-click could land within ~14 px of a grip, and
the grip branch would start a *resize* instead of cycling. Fix: the grip branch
checks `v25ClickCycleCurrentEnt`; on a same-spot re-click it falls through to
the cycle. Trade-off: you can't *start* a grip-resize at the exact pixel you
cycled at — nudge the cursor a few px off the anchor and the grip is grabbable
again. Acceptable and Bluebeam-consistent. Verified with `plate2` — see
`05-verification.md`.

### D6 — Status-bar hint wording ✅ (tentative)
While a cycle is live the tool label reads `Select — N of M under cursor
(click to cycle)`. Chosen for discoverability — without it a user may not
realise re-clicking cycles. Trivial to reword or remove (one block in
`47-status-bar.js`). See Q-B.

## Known limitations (carried into v1)

### L1 — AABB hit-test looseness
The cycle stack is built from `v25EntBounds` axis-aligned bounding boxes (+
tolerance), not true outlines — the same imprecision `v25HitTest` always had.
For a rotated or L-shaped poly member the box is larger than the shape, so the
stack can include an entity whose box (but not its actual outline) covers the
point. Not introduced by this feature; precise per-shape hit-testing would be
a separate idea.

### L2 — Hover feedback shows the top entity only
`v25HoverPick` (the dashed hover box) still reflects the top-most entity. Hover
does not preview "click again to reach N more." Intentional — matches Bluebeam,
where hover shows the top and clicking is what cycles.

### L3 — Double-click advances the cycle once as a side effect
A double-click is mousedown-up-down-up-dblclick; the first mouseup advances the
cycle by one before `dblclick` fires. Because the dblclick handler is
cycle-aware and re-pins selection to the cycled entity, this is invisible to
the user — and the cycle index self-heals on the next click via the
re-click predicate. Cosmetic; no fix needed.

## Questions genuinely still open for Dan

Neither blocks shipping — both are worth a glance during review:

- **Q-A** — Forward-only cycling enough, or do you want Alt+click to step back
  up the stack? (See D3.)
- **Q-B** — Keep the status-bar hint `Select — N of M under cursor (click to
  cycle)`, reword it, or drop it? (See D6.)
