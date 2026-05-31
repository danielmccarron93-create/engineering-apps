# StructDraw — Architecture v2

Status: ✅ Ready to build — all 18 open questions locked 2026-05-19; Phase 0a unblocked
Last touched: 2026-05-19
Owner: Dan McCarron
Scope: A real layered architecture for StructDraw — Model, View, Render, Tool, Engine — designed so a new structural element exists once and every renderer (Canvas2D, ThreeJS, PDF, DXF) projects it. Replaces the current parallel-entity-model design where a timber screw has to be wired into ~12 files across two parallel implementations.

---

## TL;DR for a fresh chat

You're picking this up cold. Do this in order:

1. Read project root `/CLAUDE.md` — workflow rules and the two-mode-requirement as it stands today. This folder rebuilds that requirement from first principles.
2. Read `/PlannedBuilds/README.md` — the dashboard.
3. Read this README end-to-end.
4. Read `01-why-rebuild.md` — the diagnosis of why the current shape can't deliver Revit-class quality.
5. Read `02-target-architecture.md` — the five-layer architecture at a glance.
6. Read `03-model-layer.md` and `04-catalogue-system.md` — the deep design. These are the most important files in the folder.
7. Read `05-render-pipeline.md` and `06-tools-and-transactions.md` — how the layers above interact.
8. Read `07-migration-strategy.md` and `08-pilot-feature.md` — how this lands without breaking the daily-use app.
9. Read `09-build-plan.md` — the phased plan with milestones.
10. Read `10-open-questions.md` — decisions awaiting Dan's input before Phase 0a starts.
11. Read `11-relationship-with-codebase-restructure.md` — what carries over from the sibling planning folder, what's superseded.

---

## The one-paragraph elevator pitch

StructDraw today is architected like a paint program with an iso viewer bolted on. There is no model layer — `objects3D` (3D-mode model objects) and `entities2D[viewKey]` (2D-mode paper entities) are two independent stores with no shared spine. The smell test is "adding one timber screw means wiring 12 files across two parallel implementations" and the current code fails it. Architecture v2 introduces a real structural model — one `StructuralModel` with `Element`s, `Material`s, `View`s, `Sheet`s, and `Transaction`s — and turns every renderer (Canvas2D for paper, Three.js for iso, jsPDF for vector PDF, DXF for drafter handoff) into a consumer of that model. **A timber screw becomes one Element, registered in one Family, rendered by every renderer that knows about its category.** Adding a new screw type is one catalogue row. Promoting a 2D-only entity to also work in 3D is registering one more renderer entry. The four in-flight ideas (timber-screws, orientation-presets, v25-2d-bolts, click-cycle-selection) ship in the current v1 architecture first; v2 starts after.

---

## Why this exists alongside `codebase-restructure/`

When Dan first asked for a planning pass on the codebase, the response was to plan an incremental cleanup of the existing structure — `PlannedBuilds/codebase-restructure/`. That plan is correct as far as it goes (it would fix the docs drift and dedup the parallel implementations) but it does not change the fundamental shape of the codebase. After Dan asked "if Revit were building this, would the folder structure look like this?" — the honest answer is no, the current shape is too ad-hoc for the long-term ambition of competing pound-for-pound with Revit in structural detailing.

Architecture v2 is that bigger rebuild. The `codebase-restructure/` folder is partially superseded: its Phase 1 (docs realignment) carries over and is absorbed as Phase 0a of this plan; Phases 2-7 are largely superseded because the new architecture renders most of them moot. See `11-relationship-with-codebase-restructure.md` for the explicit mapping.

---

## v1 (this folder) scope

**In scope:**

- A concrete five-layer architecture (Model / View / Render / Tool / Engine) with named files, named functions, named state shapes (`03-model-layer.md`, `05-render-pipeline.md`, `06-tools-and-transactions.md`).
- A category + family + type + material catalogue system that drives lineweights, hatches, colours, mechanical properties (`04-catalogue-system.md`).
- A migration strategy that lets the daily-use app keep working while the new architecture grows alongside it (strangler fig — `07-migration-strategy.md`).
- A pilot-feature decision (`08-pilot-feature.md`) so the first feature built on the new architecture is the right one.
- A phased build plan (`09-build-plan.md`) with concrete milestones.
- Open questions for Dan (`10-open-questions.md`) so a build chat doesn't start until the gating decisions are made.

**Out of scope (deferred):**

- Phase 0a (docs realignment of the current v1 codebase) — keep this in `codebase-restructure/` per `11-relationship-with-codebase-restructure.md`. Same content, different folder.
- Shipping the four in-flight ideas — they go through their own planning folders, in the v1 architecture, before any v2 work starts.
- ESM migration, TypeScript port, bundler adoption — v2 stays with classic scripts and JSDoc types. ESM is a future architectural decision after v2 ships.
- PWA manifest, service worker, offline support — Phase 3+ commercial-release territory.
- Plugin/marketplace system — v3 territory.

**v1 success criteria:**

1. A fresh build chat opening this folder can correctly answer: "what is an Element?", "what is a View?", "what is a Material?", "how does a tool change the model?", "how does a renderer find an element to draw?" — without reading any current `js/` file.
2. The five layered files (Model, View, Render, Tool, Engine) each have a complete API surface defined — functions, parameters, return types (JSDoc style), and example usage.
3. The pilot-feature plan (`08-pilot-feature.md`) identifies a feature small enough to ship in 4-6 evening sessions but representative enough that the patterns it establishes generalise to every later feature.
4. The migration plan in `07-migration-strategy.md` has a concrete answer to "what does the codebase look like after each year of evening work?"
5. `10-open-questions.md` has Dan's answers on the gating decisions, OR the planning folder is explicit that those decisions are unresolved.

---

## Files touched (in released app)

This folder is design-only. Phase 0a (docs realignment) touches the same files as `codebase-restructure/`'s Phase 1 — see that folder's Files-touched table.

Phases 0b+ (the actual rebuild) are described in `09-build-plan.md` with their own Files-touched tables. Each phase is a separate build chat with its own declared scope. None of the in-flight features (timber-screws, orientation-presets, v25-2d-bolts, click-cycle-selection) is touched by any phase of this plan — they all ship in the v1 architecture first.

---

## Folder navigation

| File | Purpose |
|---|---|
| `README.md` | this file — start here |
| `01-why-rebuild.md` | first-principles diagnosis: why incremental cleanup can't deliver Revit-class quality |
| `02-target-architecture.md` | the five-layer architecture overview with diagram |
| `03-model-layer.md` | Element, ElementId, StructuralModel, Transaction, View, Sheet, Material — the deep design |
| `04-catalogue-system.md` | Categories, Families, Types, Materials — how the catalogue drives rendering and rules |
| `05-render-pipeline.md` | Renderer dispatch, Canvas2DRenderer, ThreeJSRenderer, PDF/DXF emitters, dirty regions |
| `06-tools-and-transactions.md` | Tools dispatch transactions; transactions mutate the model; undo/redo for free |
| `07-migration-strategy.md` | strangler fig — new architecture grows alongside old; what migrates when |
| `08-pilot-feature.md` | which feature pioneers v2 — the most-leverage proof point |
| `09-build-plan.md` | phased plan with milestones from Phase 0a through Phase ∞ |
| `10-open-questions.md` | decisions awaiting Dan's input before Phase 0a starts |
| `11-relationship-with-codebase-restructure.md` | what carries over from `codebase-restructure/`, what's superseded |

---

## How to start (copy-paste prompt for a fresh chat)

For a planning chat refining this folder:

```
You're picking up the architecture-v2 planning idea for StructDraw.

1. Read /CLAUDE.md end-to-end (the v1 project root playbook).
2. Read /PlannedBuilds/README.md (the dashboard).
3. Read /PlannedBuilds/architecture-v2/README.md and every file in that folder.
4. Check /PlannedBuilds/architecture-v2/10-open-questions.md.
5. PLAN: help me refine the architecture, the catalogue system, the migration
   strategy, or the pilot-feature choice. Don't write code in this chat — even
   Phase 0a is a separate build chat per CLAUDE.md's two-chat workflow.
```

For a build chat executing Phase 0a (the docs realignment carried over from codebase-restructure/):

```
You're executing Phase 0a of /PlannedBuilds/architecture-v2/09-build-plan.md.
That phase is identical to Phase 1 of /PlannedBuilds/codebase-restructure/.

1. Read /CLAUDE.md end-to-end.
2. Read /PlannedBuilds/architecture-v2/README.md and 09-build-plan.md.
3. Read /PlannedBuilds/codebase-restructure/02-current-state-audit.md
   (the diagnosis is still the authority for which docs are broken).
4. Confirm Dan has answered Q1–Q5 in 10-open-questions.md.
5. Execute Phase 0a per the Files-touched table in 09-build-plan.md.
```

For build chats on later phases — each phase has its own copy-paste prompt inside `09-build-plan.md`.

---

## Dependency / relationship with the four in-flight ideas

Per Dan's decision (2026-05-19): **ship all four in-flight ideas in the v1 architecture first.** They are not affected by this folder's existence.

| In-flight idea | Status before v2 starts | Relationship to v2 |
|---|---|---|
| `click-cycle-selection/` | Commit and push, ship | None. v2's tool layer adopts the same pattern. |
| `timber-screws/` | Execute Phase 5 corrective per its `10-corrective-plan.md`. Ship. | v2 will re-implement timber-screws on the new architecture eventually — but only after the rest of the model layer is in place. The shipped v1 version stays working in the meantime. |
| `orientation-presets/` | Ship per its build plan. | v2's catalogue system absorbs the orientation catalogue. The shipped v1 row component is a UX template for v2's equivalent. |
| `v25-2d-bolts/` | Ship per its build plan. The axis-agnostic bolt-primitive refactor it does is good preparation for v2's render layer. | v2's first bolt renderer is informed by the dedup pattern v25-2d-bolts establishes. |
| `codebase-restructure/` | Phase 1 carries over as Phase 0a of v2. Phases 2-7 superseded. | See `11-relationship-with-codebase-restructure.md`. |
