# StructDraw — V25 2D-Mode Click-Cycling Selection

Status: 👀 In review — code complete + verified in worktree `stupefied-kowalevski-2b02d9`; pending Dan's browser visual test + dev→root mirror
Last touched: 2026-05-19
Owner: Dan McCarron
Scope: Bluebeam Revu-style click-through selection for the V25 2D-mode Select tool. Repeated clicks at the same screen point step down the z-stack of overlapping entities (beam → plate → column → wrap back to the top), so a member buried under a later-drawn one becomes reachable without deleting or moving anything.

---

## ⚠️ State note — read this first

This idea is **already implemented and verified** — but mind where the code is:

- **Code:** git worktree `2D-Details/.claude/worktrees/stupefied-kowalevski-2b02d9/`, branch `claude/stupefied-kowalevski-2b02d9`. 5 files modified (`123 insertions, 20 deletions`), **uncommitted**.
- **This planning folder:** lives in the main checkout (`main` branch). The main checkout's `dev/` does **not** have the changes yet.

To finish the idea: bring the worktree branch into `main` (Dan's call on the git mechanics — commit on `claude/stupefied-kowalevski-2b02d9`, then merge), test `dev/index.html` in a browser, then mirror `dev/` → root per `CLAUDE.md`. **Do not re-build from scratch.** `03-build-plan.md` records every change already made and doubles as an exact re-apply guide if the worktree is ever discarded.

---

## TL;DR for a fresh chat

You're picking this up cold. Do this in order:

1. Read project root `CLAUDE.md` — workflow rules, the V25 module map, the dev→root mirror.
2. Read `PlannedBuilds/README.md` — the dashboard. Note `v25-2d-bolts/` also touches `71-v25-selection.js` (see "Overlap" below).
3. Read this README, then the state note above.
4. Read `01-context.md` → `05-verification.md` in order.
5. There is **no build work left** unless the worktree was lost. The remaining work is integration + Dan's manual browser test. If the worktree is gone, `03-build-plan.md` is a complete re-apply spec.

---

## The feature in one paragraph

In V25 2D-Studio mode the Select tool's hit-test (`v25HitTest`) only ever returns the top-most (last-drawn) entity under the cursor, so anything overlapped by a later-drawn entity is unreachable by clicking. This feature adds Bluebeam Revu-style click-cycling: the first click selects the top entity and arms a "cycle" anchored at that pixel; clicking the same spot again selects the next entity down the z-stack; repeated clicks wrap top→bottom→top; clicking elsewhere resets. The cycle resolves on **mouse-up**, so once you've cycled down to a buried entity you can still click-drag it to move it — only a clean click (no movement) advances the cycle. State lives in one new global, `v25ClickCycle`, which self-invalidates by re-checking the stack on every click.

## v1 scope

**In scope (delivered):**
- `v25HitTestAll(blk, u, v)` — returns the full z-stack under a point, top-most first. `v25HitTest` becomes a thin wrapper (top-most only) so existing callers are unchanged.
- `v25ClickCycle` state + `V25_CYCLE_PX` tolerance, and a `v25ClickCycleCurrentEnt` helper.
- Cycle-aware mousedown (grip branch + select branch), mouseup, dblclick, and marquee branches in `39-events.js`.
- Status-bar hint "Select — N of M under cursor (click to cycle)" while a cycle is live.
- Works for every `_v25` entity type (mat, plate2, mem2, lineSet, leader2, anchor, reoBar, frame, …) because it reuses the existing `v25EntBounds` AABB.

**Out of scope (deferred):**
- Reverse cycle (Shift to step back up the stack) — forward-only + wrap, matching the 3D Tab-cycle.
- Precise per-shape hit-testing — the cycle uses the existing AABB; for rotated / poly members the box is loose (pre-existing imprecision, see `04-open-questions.md`).
- A cycle affordance in the hover state (the dashed hover box still reflects the top-most entity only).

**v1 success criteria (all met — see `05-verification.md`):**
1. Click a stack of overlapping members → top selected; click again same spot → next down; again → next; again → wraps to top.
2. Cycle down to a buried entity, then click-drag it → it moves; the cycle ends (no spurious advance).
3. Click away → cycle resets; returning to the stack starts fresh from the top.
4. Shift+click stays additive (no cycling); double-click targets the cycled entity, not the top one.
5. Cycling still works for entities that carry grip handles (e.g. `plate2`) — the grip branch defers to the cycle on a re-click.

## Why this matters

Overlapping members are the norm in connection detailing — column + cleat + beam, baseplate + column + grout, splice plates over a beam joint. Until now a click in that region could only ever grab the last-drawn entity; everything underneath needed destructive workarounds (delete the top entity, select, redraw). Click-cycling is the single gesture that makes a dense 2D detail editable, and it is behaviour Dan already has muscle memory for from Bluebeam Revu. It removes one of the last "...just do it in Bluebeam" reasons for small details.

## Files touched (in released app)

| File | What changes |
|---|---|
| `dev/js/07-globals.js` | +`v25ClickCycle` state global and `V25_CYCLE_PX` constant. |
| `dev/js/71-v25-selection.js` | +`v25HitTestAll` (z-stack hit-test, a mechanical refactor of `v25HitTest`); `v25HitTest` becomes a thin top-most wrapper; +`v25ClickCycleCurrentEnt` helper. |
| `dev/js/39-events.js` | Mousedown grip + select branches, mouseup release branch, dblclick branch, and marquee-mouseup branch all made cycle-aware. |
| `dev/js/47-status-bar.js` | +cycle depth hint in `updateStatus()`. |
| `2D-Details/CHANGELOG.md` | One `### Added` line. |

No new files (per `CLAUDE.md` "what goes in a new file" — < 150 lines, woven into existing modules). One non-app change: a `structdraw-worktree-dev` config was added to the worktree's `.claude/launch.json` for preview testing (gitignored tooling, not part of the build).

## Overlap with other in-flight ideas

- **`v25-2d-bolts/`** also modifies `71-v25-selection.js` (adds a `bolt2` hit-test + grips). The two changes are additive and in different parts of the file — no conflict — but a multi-build consolidator should note it. Beneficial interaction: once `bolt2` exists with a `v25EntBounds` case, it is automatically click-cyclable through `v25HitTestAll` with zero extra work.
- No overlap with `orientation-presets/` or `timber-screws/`.

## Folder navigation

| File | Purpose |
|---|---|
| `README.md` | this file — start here + the state note |
| `01-context.md` | why buried entities can't be selected today; the 3D Tab-cycle precedent |
| `02-design.md` | cycle-on-mouseup rationale, `v25ClickCycle` schema, the hit-test refactor, files touched |
| `03-build-plan.md` | the (completed) phased changes — exact before/after per file; doubles as a re-apply guide |
| `04-open-questions.md` | design decisions made (all resolved) + known limitations |
| `05-verification.md` | what was tested and the results; what is left for Dan's browser test |

## How to start (copy-paste prompt for a fresh chat)

```
You're picking up the click-cycle-selection build idea for StructDraw.
It is ALREADY built — the code is in git worktree branch
claude/stupefied-kowalevski-2b02d9, uncommitted. This folder is the record.

1. Read /CLAUDE.md (the project playbook).
2. Read /PlannedBuilds/README.md (the dashboard).
3. Read /PlannedBuilds/click-cycle-selection/README.md — especially the state note.
4. Then either:
   - INTEGRATE: help bring the worktree branch into main, then walk the
     dev/index.html browser test in 05-verification.md, then the dev→root mirror.
   - RE-APPLY (only if the worktree is lost): walk 03-build-plan.md — it contains
     the exact changes for all 5 files.
Do not re-design — the design is locked and verified.
```
