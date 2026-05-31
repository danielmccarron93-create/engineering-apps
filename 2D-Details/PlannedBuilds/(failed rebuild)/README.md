# (failed rebuild) — parked, NOT pending work

**Read this before treating anything in this folder as a live workstream.**

Everything in here belongs to the **architecture-v2 layered rebuild**, which Dan **abandoned on 2026-05-30**. These folders are parked together so a fresh chat doesn't mistake their `🔨 Building` / `📐 Planning` status headers for active work. Do **not** resume any of these without Dan explicitly re-opening the idea.

## Why the rebuild was abandoned

The rebuild's *only* goal was a cleaner codebase — one place to define a structural element so members/fixings are added consistently across 2D and 3D, with less effort per new member. Sound goal. But the migration was strangler-fig (grow v2 alongside v1, retire v1 per feature), and **Phase 2 retired the mature v1 plate path (`js/76-v25-plate.js`) before the v2 plate had reached parity.**

v1 plates got auto-weld, grip-rotate, grip-resize, edit, and edge-snap "for free" by being `entities2D` entries wired into the shared V25 systems. The v2 plate was a placement-only tool plus a paint-over live-render shim — those capabilities were deferred to v2 Phases 7 (joints) and 10 (selection) that were never reached. Plates were the **worst possible pilot**: their entire value lives in interactions (welds, snaps, grips), which depend on the most complex, last-scheduled v2 systems.

The result: Dan "could not use the plates even close to as well as before." He judged the rebuild "too damaging to the overall quality of the app" and stopped. The project's own post-mortem is [`architecture-v2/12-plate-fix-plan.md`](architecture-v2/12-plate-fix-plan.md) (11 bugs → 7 fundamentals).

## What's parked here

| Folder | What it was |
|---|---|
| `architecture-v2/` | The rebuild itself — layered Model/View/Render/Tool/Engine in a parallel `js/v2/` tree, ~150 files over 12–18 months. The thing that was abandoned. |
| `codebase-restructure/` | The precursor diagnosis of v1 drift. Its *diagnosis* of the v1 codebase is still accurate; its *prescription* was superseded by architecture-v2 and is parked with it. |
| `timber-screws/` | Rothoblaas HBS screw-to-timber connection designer. Absorbed into the rebuild as a v2 phase. (Its v1 code files — `js/02b–02e`, `75`, `77`, `78`, `79`, `99` — still exist in the tree; this is the *planning* parked, not the code removed.) |
| `v25-2d-bolts/` | First-class V25 2D-mode through-bolt entity. Absorbed into the rebuild as the bolts phase. |
| `click-cycle-selection/` | Bluebeam-style click-cycling for the V25 select tool. Absorbed into the rebuild as part of the selection phase. (Built in an uncommitted worktree; never merged.) |

`timber-screws/`, `v25-2d-bolts/`, and `click-cycle-selection/` were independent v1 ideas that the rebuild *re-scoped into its own phases*. With the rebuild dead, those re-scoped plans are stale and parked here. If Dan wants any of them, they'd be re-planned as a standalone v1 feature, not resumed from these folders.

## What survived into the live app (important — do NOT revert)

The rebuild is dead, but one fragment shipped and was rescued:

- **The v2 plate path is LIVE and (per Dan) working.** `76-v25-plate.js` is gone; the 2D-mode Plate tile routes to `v2.ui.paletteBBRail.activatePlate()`; the v2 plate's rotate/vertex/body editing was completed in `js/v2/tools/edit-plate.js` (Fix M/O) and re-injected into v1's auto-weld via Fixes G/H. **Leave this as-is** — reverting to v1 plates would re-break what Dan spent several chats fixing.
- **Bolts** are flag-gated **off** (`js/v2/feature-flags.js` → `useV2For.bolts = false`) — the app uses the v1 bolt path.
- **Members, timber, joints, annotations** were never migrated — all v1.

So the `js/v2/` tree is not dead code: it is the live plate path plus dormant, flag-gated scaffolding. Don't delete it wholesale.

## The one idea that is NOT parked

[`../orientation-presets/`](../orientation-presets/README.md) predates the rebuild and is independent of it — a self-contained V25 2D-mode quick-options improvement (icon-button orientation row replacing the Aspect / Open-face dropdowns). It stays in the live `PlannedBuilds/` as the only in-flight idea.
