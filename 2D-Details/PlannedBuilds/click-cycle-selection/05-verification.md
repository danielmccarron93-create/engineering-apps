# 05 — Verification

The build chat verified the feature in two layers. Layer 3 — the hands-on
visual click-test in a real browser — is **Dan's to do**; see "Left for Dan".

## Layer 1 — static

- `node --check` on all four edited JS files (`07-globals.js`,
  `39-events.js`, `47-status-bar.js`, `71-v25-selection.js`) — **all pass**.
- App loaded via a local static server (`structdraw-worktree-dev`, port 8767,
  serving the worktree's `dev/`). DevTools console **clean** on load and after
  all interaction — no errors, no warnings.
- All new symbols present at runtime: `v25HitTestAll`, `v25HitTest`,
  `v25ClickCycleCurrentEnt` (functions), `v25ClickCycle` (null),
  `V25_CYCLE_PX` (4).

## Layer 2 — functional (synthetic events)

The preview environment renders the canvas at 0×0 (no real layout viewport),
so the coordinate mapping is degenerate and a *visual* click-test is not
possible there. The cycle logic, however, is pure entity-id bookkeeping and
does not depend on canvas size — so it was driven directly: test entities
created via `v25Add`, real `MouseEvent`s dispatched on the canvas,
`v25Selected` / `v25ClickCycle` inspected after each event.

| Test | Result |
|---|---|
| `v25HitTestAll` over 3 overlapping mats | Returns the stack ordered top-most-first `[3,2,1]`; `v25HitTest` returns the top; empty array outside any entity. ✅ |
| 5 clicks at the same spot | `[top] → [mid] → [bottom] → [top]` (wrap) `→ [mid]` — cycles and wraps. ✅ |
| Drag a cycled-to entity | The entity stays selected and moves; `v25ClickCycle` is nulled (no spurious advance). ✅ |
| Shift+click | Stays additive; `v25ClickCycle` nulled; a second shift+click does not cycle. ✅ |
| Double-click a cycled entity | Targets the **cycled** entity, not the top-most. ✅ |
| Grip-branch fix — `plate2` (which has corner handles) | `v25NearestHandleOnSelected` confirmed it *would* grab a handle (`gripWouldTrigger: true`); the cycle still steps `[top]→[mid]→[bottom]→[top]` because the grip branch defers on a re-click. ✅ |
| Click empty space, then return to the stack | The empty click clears selection and nulls `v25ClickCycle`; returning to the stack starts a fresh cycle from the top (index 0). ✅ |

One sub-test ("different screen spot, same real point") first looked wrong — it
was a **harness artifact**: the test held `cursorSheet` (the real cursor) fixed
while moving only `clientX`, which can't happen in a real browser (the two move
together). With the cursor genuinely relocated the reset works correctly (last
row above). The reset *mechanism* — `v25ClickCycleCurrentEnt` returning `null`
when the click is more than `V25_CYCLE_PX` from the anchor — was confirmed
directly.

## Left for Dan — the real visual test

The preview can't render the canvas, so the hands-on visual check is yours. In
a normal browser, open the worktree's `dev/index.html`, switch to 2D mode,
Select tool, and:

1. Draw a column, then a plate, then a beam, overlapping (the original
   screenshot scenario).
2. Click the overlap → beam (top). Click the same spot again → plate. Again →
   column. Again → wraps back to beam. The status bar should read
   `Select — N of M under cursor`.
3. Click empty space → selection clears. Click the stack again → starts fresh
   from the top.
4. Cycle down to the plate, then click-drag it → it moves; the cycle ends (the
   next same-spot click is a fresh selection).
5. Cycle to the plate, double-click → the plate's Settings open (not the beam's).
6. Shift+click two members → both selected, no cycling.
7. Marquee-select, then click the stack → starts fresh, no console errors.
8. Confirm 3D-mode Tab-to-cycle still works — it shares `07-globals.js` but uses
   its own separate globals (`cycleHits` / `cycleIndex`), so it should be
   unaffected.

DevTools console must stay clean throughout.

## After the visual test passes

Per `CLAUDE.md`: mirror `dev/` → root, then commit. The `CHANGELOG.md` entry is
already written (in the `### Added` block of the `[Unreleased]` section). See
the README state note for the worktree → `main` integration step that must
happen first.
