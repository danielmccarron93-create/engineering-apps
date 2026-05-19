# StructDraw — Codebase Restructure & Documentation Realignment

> **♻️ STATUS NOTE (added 2026-05-19, later in same chat):**
> **Phases 2-7 of this plan are SUPERSEDED by `PlannedBuilds/architecture-v2/`.**
> After this folder was written, Dan asked the bigger question: "if Revit were
> building this from scratch for structural engineers, would the structure look
> like this?" The honest answer was no — the v1 architecture is too ad-hoc to
> deliver a Revit-class product, and incremental cleanup doesn't reach that
> ceiling. The bigger rebuild plan is in `architecture-v2/`.
>
> **What survives from this folder:**
> - The diagnosis (`02-current-state-audit.md` + per-layer findings 03-07) is
>   still authoritative for the v1 codebase's drift.
> - Phase 1 (docs realignment) is **carried over verbatim as Phase 0a of v2**.
>   Execute it the same way; just record the work against `architecture-v2/`'s
>   build plan.
>
> **What's superseded:**
> - Phases 2 (timber-screws corrective): still ships, but execute via
>   `PlannedBuilds/timber-screws/10-corrective-plan.md` directly. The v1 timber-
>   screws feature ships in v1 per Dan's decision; v2 will replace it with the
>   model-layer version eventually.
> - Phases 3-7 (lift globals, split events, kill monkey patches, dedup, schema
>   version): all superseded. The v2 architecture dissolves these problems by
>   construction (see `architecture-v2/11-relationship-with-codebase-restructure.md`).
>
> **Do not execute Phases 2-7 from this folder.** Read the diagnosis here, then
> work from `architecture-v2/`.

---

Status: ♻️ Partially superseded by `architecture-v2/`
Last touched: 2026-05-19
Owner: Dan McCarron
Scope: Repair the gap between what `CLAUDE.md` describes and what the code actually does, then propose the file-structure discipline needed for StructDraw to scale as a two-product app (2D-Studio = Bluebeam competitor, 3D-Studio = Revit competitor) without features bleeding across the boundary.

---

## TL;DR for a fresh chat

You're picking this up cold. Do this in order:

1. Read project root `/CLAUDE.md` — workflow rules, the two-mode requirement, the integration checklist. The whole reason this folder exists is that the playbook has drifted from reality; do not start trusting either source over the other until you've read both.
2. Read `/PlannedBuilds/README.md` — the dashboard. Note the four sibling ideas already in flight (timber-screws, orientation-presets, v25-2d-bolts, click-cycle-selection); this restructure does NOT touch the same files they touch, but Phase 2 of this restructure (execute the timber-screws corrective plan) absorbs that idea.
3. Read this README end-to-end.
4. Read `02-current-state-audit.md` — the single-page "what's actually wrong" diagnosis.
5. Read `08-proposed-structure.md` — the target file-organisation discipline (file-number bands, layer affiliation, shared vs 2D-only vs 3D-only).
6. Read `09-build-plan.md` — the phased work plan. Each phase is its own build chat.
7. Read `10-open-questions.md` — block list. Do not start any phase until the questions blocking it are answered.

The per-layer findings files (`03` through `07`) are deep-dive references; skim them when you're about to touch the matching layer, otherwise the headline summary in `02-current-state-audit.md` is enough.

---

## The idea in one paragraph

StructDraw is being built in evening sessions across many separate chats. The architecture is sound — a thin shell `index.html` loading ~75 numbered classic scripts that share globals — but two structural problems have accumulated. (a) The playbook (`CLAUDE.md`) has drifted from the code: the file map is stale by 2 files in root and 9 files in `dev/`, line counts are wrong by hundreds of lines, the "Mirroring" command in `README.md` is actually broken as written, the `archive/v1/` rollback files are all empty 0-byte stubs, and CHANGELOG claims features that aren't in the code. (b) The 2D-product side (Bluebeam competitor — V25 paper-space + V26 BB-rail) and the 3D-product side (Revit competitor — Three.js iso engine + model-driven projection across 4 views) share a single flat `js/` directory with no formal boundary, and several files now have **two parallel implementations** of the same algorithm (joint trimming, auto-welds, selection highlights, soon bolts) — once for each mode. As both sides grow, the gravity well of these parallel implementations gets worse: every feature has to be built twice, and the integration checklist in `CLAUDE.md` keeps growing because there's no shared spine. This folder diagnoses both problems and proposes a phased plan to fix them in order of leverage.

---

## Why this matters now

Dan is about to start (or has just started) at least three concurrent build chats — `orientation-presets/` is ready to build, `v25-2d-bolts/` is in late planning, `click-cycle-selection/` is in review waiting for a mirror. The timber-screws feature is mid-build-reset, having tripped over exactly the anti-patterns the playbook warns against (parallel entity types, an autoload demo, a floating UI button) because **that section of the playbook was written AFTER the timber-screws Phase 4 was already shipped to `dev/`**. Without a docs-vs-code realignment now, the next set of features will trip over the same potholes — and the 2D vs 3D split will keep being decided ad-hoc inside each build chat rather than as an architectural rule.

The reference quality bar (STP Typical Structural Details PDF page 85, details 6011.1–6011.6) is unchanged. The change is procedural, not visual: keep the same defensible structural-engineering output, but stop reinventing the wheel for each new entity type.

---

## v1 scope

**In scope (this folder defines):**

- A truthful audit of where the playbook disagrees with the code (`02-current-state-audit.md` + per-layer files `03`–`07`).
- A proposed file-organisation discipline that scales to a two-product codebase: file-number bands, mandatory layer-affiliation comments in every file, and a "shared-render vs 2D-Studio vs 3D-Studio" classification (`08-proposed-structure.md`).
- A phased build plan (`09-build-plan.md`) that sequences the docs realignment first, then the corrective builds that unblock the in-flight ideas, then the bigger structural Phase-2 items from the playbook (events split, scattered globals, monkey-patch removal).
- Open questions for Dan (`10-open-questions.md`) — the decisions a build chat cannot resolve unilaterally (e.g., do we adopt file-number bands or subfolders; do we restore `archive/v1/` from git history or remove its framing; do we treat `--timber-color` as a real theme variable or drop it).

**Out of scope (deferred):**

- Phase-3 commercial-release items (ESM migration, JSDOM test harness, per-customer branding, PWA manifest, plugin system, vendoring CDN scripts) — separate planning folders when the time comes.
- The actual refactors themselves. This folder produces the plan; each phase is a separate build chat.
- Any change to AS-compliance defaults, drawing scale handling, or render output. The structural-engineering correctness of the app is not the problem this folder addresses.

**v1 success criteria:**

1. A fresh build chat opening `CLAUDE.md` + this folder can correctly answer: "where does a new 2D-mode entity type get wired?" and "where does a new 3D-mode member type get wired?" without grep-discovery.
2. Every drift listed in `02-current-state-audit.md` has either been fixed (Phase 1) or has an open question with a recommended option waiting on Dan.
3. The phased plan in `09-build-plan.md` is consumable by single-feature build chats — each phase has a Files-touched list, a test boundary, and a stop condition.
4. The four in-flight ideas (timber-screws, orientation-presets, v25-2d-bolts, click-cycle-selection) are unaffected by this folder's existence; their planning folders remain authoritative for their builds. This folder explicitly does NOT consolidate or replace any of them.

---

## Files touched (in released app)

This folder is unusual: Phase 1 only touches **documentation** (the user pain is docs drift). Code-touching phases come later and have their own Files-touched declarations inside `09-build-plan.md`.

| File | What changes (Phase 1 — docs only) |
|---|---|
| `CLAUDE.md` | Update file map (add `23a-shs-joints.js`, `76-v25-plate.js`); refresh line counts on `39-events.js`, `68-v25-tools.js`, `71-v25-selection.js`, `23a-shs-joints.js`; add file-number-band rule; document `tmbr` prefix convention, `view` field convention, sub-letter file numbering (`23a`, `02b`); update mirror command to reference `bin/release.sh`; update Phase-2 priorities to remove `bin/release.sh` (already exists); add `.claude/` description; add `screw` + `connection` entity types to integration checklist. |
| `README.md` | Replace broken inline mirror command with a pointer to `bin/release.sh`; update file-count claim. |
| `PlannedBuilds/README.md` | After each code-touching phase ships, update the dashboard table. Phase 1 itself doesn't change any dashboard row. |
| `archive/completed-plans/README.md` | Document the flat-`.md`-file convention vs folder convention (whichever Dan picks in Q1). |
| `CHANGELOG.md` | Reconcile the `schemaVersion: 2` claim with reality (either remove the line or move it to "intended for v25.6"). |

Phases 2–7 each have their own released-file declarations — see `09-build-plan.md`. Per-phase Files-touched lists are also added to the dashboard at `PlannedBuilds/README.md` when each phase becomes active.

New files (proposed, all in this folder, never in `dev/`):
- `01-context.md` — the two-product framing in more depth
- `02-current-state-audit.md` — the headline drift report
- `03-foundation-findings.md` through `07-dev-archive-findings.md` — per-layer deep dives
- `08-proposed-structure.md` — the target organisation
- `09-build-plan.md` — phased plan, each phase its own build chat
- `10-open-questions.md` — blockers awaiting Dan

---

## Folder navigation

| File | Purpose |
|---|---|
| `README.md` | this file — start here |
| `01-context.md` | the two-product framing (2D-Studio + 3D-Studio); why a flat `js/` doesn't scale as both sides grow |
| `02-current-state-audit.md` | one-page diagnosis: every place docs and code disagree, ranked by leverage |
| `03-foundation-findings.md` | findings on `js/01-config.js` through `js/22-render-core.js` |
| `04-drawing-findings.md` | findings on `js/23-auto-weld.js` through `js/38-crosshair.js` (incl. the undocumented `23a-shs-joints.js`) |
| `05-events-tools-findings.md` | findings on `js/39-events.js` through `js/63-layout.js` |
| `06-v25-v26-findings.md` | findings on `js/64-3d-engine.js` through `js/76-v25-plate.js` |
| `07-dev-archive-findings.md` | repo-level drift: dev/ vs root, archive/ rot, CHANGELOG vs code, `.claude/` |
| `08-proposed-structure.md` | the target organisation: file-number bands, layer-affiliation comments, 2D-Studio vs 3D-Studio vs shared |
| `09-build-plan.md` | seven phases — Phase 1 is docs-only and unblocks the others |
| `10-open-questions.md` | decisions pending Dan's input before Phase 1 starts |

---

## Dependency / overlap with other in-flight ideas

This folder is deliberately decoupled from the four active build ideas. **No phase of this restructure touches a file currently named in another idea's "Files touched" list.** Phase 1 is documentation-only. Phase 2 absorbs the timber-screws corrective plan (Phase 5 of that folder), at which point the timber-screws folder gets retired to `archive/completed-plans/`.

| In-flight idea | Relationship to this restructure |
|---|---|
| `timber-screws/` | Phase 2 of this restructure executes `timber-screws/10-corrective-plan.md`. The timber-screws planning folder is the authoritative spec for that phase; this folder just orders it correctly. |
| `orientation-presets/` | No overlap. Can ship before or after Phase 1. Phase 1 documents the orientation-presets approach in the playbook's integration checklist as a worked example. |
| `v25-2d-bolts/` | No overlap on file edits. Phase 1 documents the V25 entity model (including the in-flight `bolt2` type) as a worked example in `08-proposed-structure.md`. The plan-locked refactor in v25-2d-bolts (`33-draw-bolt.js` axis-agnostic dedup) is a one-file-scoped change; this restructure's Phase 6 generalises that dedup discipline across all members. |
| `click-cycle-selection/` | Already built in a worktree, pending Dan's browser test + mirror. Independent — should ship through normal review, not blocked by this restructure. Phase 1 documents click-cycling as a worked example of "a feature wired through the `v25HitTestAll` extension point rather than monkey-patched." |

---

## How to start (copy-paste prompt for a fresh chat)

For a planning chat refining this folder:

```
You're picking up the codebase-restructure planning idea for StructDraw.

1. Read /CLAUDE.md end-to-end (the project root playbook).
2. Read /PlannedBuilds/README.md (the dashboard).
3. Read /PlannedBuilds/codebase-restructure/README.md and every file in that folder.
4. Check /PlannedBuilds/codebase-restructure/10-open-questions.md.
5. PLAN: help me refine the proposed structure, the build plan, or the open questions.
   Don't write code in this chat — even the doc-only Phase 1 is a separate build chat
   per CLAUDE.md's two-chat workflow.
```

For a build chat executing Phase 1 (the docs-only realignment):

```
You're executing Phase 1 of /PlannedBuilds/codebase-restructure/09-build-plan.md.

1. Read /CLAUDE.md end-to-end.
2. Read /PlannedBuilds/README.md.
3. Read /PlannedBuilds/codebase-restructure/README.md.
4. Read /PlannedBuilds/codebase-restructure/02-current-state-audit.md and
   /PlannedBuilds/codebase-restructure/09-build-plan.md (Phase 1 only).
5. Confirm every open question marked "blocks Phase 1" in 10-open-questions.md
   has been answered. If not, ask Dan.
6. Execute Phase 1 ticket by ticket. Test boundary: `dev/index.html` opens with
   the DevTools console clean — no code is touched in this phase so it should
   trivially pass.
7. Update the progress tracker in 09-build-plan.md after each ticket.
```

Build chats for later phases get their copy-paste prompts inside `09-build-plan.md`.
