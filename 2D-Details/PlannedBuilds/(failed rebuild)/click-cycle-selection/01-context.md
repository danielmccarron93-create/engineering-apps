# 01 — Context: why buried entities can't be selected today

## What exists today

V25 2D-Studio mode lets the user draw paper-space entities — members (`mem2`), plates (`plate2`), hatch mats (`mat`), line sets, leaders, anchors, reo bars, frames — straight onto a detail sheet. They are stored per view in `entities2D[viewKey]` and painted in array order (`28-draw-block.js` iterates the array forward), so the **last-drawn entity is painted on top**.

The Select tool's hit-test, `v25HitTest(blk, u, v)` in `dev/js/71-v25-selection.js` (~line 135), walks `entities2D[blk.viewKey]` **in reverse** and **returns the first entity** whose bounds (an AABB via `v25EntBounds`, plus a pixel/real tolerance) contain the cursor. Reverse iteration means "first hit" = last-drawn = top-most. `leader2` gets a stricter line/text-anchor test; `frame` is border-only. The mousedown handler in `dev/js/39-events.js` (~line 190) takes that single entity, sets `v25Selected = [hit.id]`, and arms a drag.

## What's wrong with that

`v25HitTest` can only ever return the **top-most** entity. When entities overlap — which is constant in connection detailing: a steel column, a cleat plate welded to it, a beam landing on the plate, all stacked in the same region — only the last-drawn one is selectable. Everything underneath is unreachable by clicking.

Dan hit this drawing exactly that: a steel column, then a plate, then a beam, overlapping. The beam (drawn last) is the only thing a click can select. To touch the plate sandwiched underneath he would have to delete the beam, select the plate, then redraw the beam — or shuffle things apart, select, shuffle back. Both are unacceptable friction on a tool whose entire purpose is faster-than-Bluebeam detailing.

## The precedent already in the codebase

3D-model mode already solves this for `objects3D`: `hitTestAll3D` in `dev/js/10-bounds-hittest.js` (~line 170) is a copy of `hitTest3D` that returns *every* object under the cursor, and `42-keyboard.js` (~line 34) lets **Tab** cycle through them, holding state in the `cycleHits` / `cycleIndex` globals (`07-globals.js` ~line 55). V25 2D mode had no equivalent — this feature is the 2D, mouse-driven counterpart of that existing pattern.

## How click-cycling fixes it

Bluebeam Revu's behaviour: the first click selects the top markup; clicking the **same spot again** selects the next one down the z-stack; again → the next; wrapping back to the top. Clicking elsewhere resets. It is the universal "reach the thing underneath" gesture, and Dan already has the muscle memory for it from Revu.

This feature brings that to the V25 2D Select tool — mouse-driven, not Tab-driven, because in 2D paper-space the user is already clicking with the Select tool; a modifier or keypress would be extra friction. The first click selects the top entity and arms a "cycle" anchored at that screen pixel; each further click at the same spot advances down the stack; clicking elsewhere drops the cycle.

## Adjacent things that don't change

- 3D-mode selection and the Tab-to-cycle (`cycleHits` / `cycleIndex`) are untouched — different entity set (`objects3D`), different globals.
- The marquee (window / crossing box) select is unchanged (one line added only to drop the cycle when a marquee completes).
- Shift+click additive selection is unchanged.
- Grip-handle dragging is unchanged, with one deferral rule so a re-click cycles instead of being swallowed by a grip grab — see `02-design.md`.
- `v25HitTest`'s callers outside the Select mousedown (the dblclick handler and two uses inside `v25HoverPick`) keep identical behaviour, because `v25HitTest` stays a function returning the single top-most entity.
- The save format is unchanged — `v25ClickCycle` is transient UI state, never serialised.

## Quality-bar reference

The motivating workflow is connection detailing to the **STP Typical Structural Details PDF page 85, details 6011.1–6011.6** — cap plates, baseplates, splices, web side plates. Every one of those details is a stack of overlapping members and plates; click-cycling is what makes such a stack editable on a V25 paper-space sheet.
