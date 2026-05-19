# Planned Builds — the dashboard

This folder is the canonical home for every in-flight or upcoming build idea. Each idea gets its own subfolder (kebab-case, brief, specific) containing the full planning context — domain knowledge, data model, build plan, open questions, test cases — so any chat (Cowork or Claude Code) can be pointed at one folder and have everything it needs to either continue planning or start building.

The two-chat workflow in the project root `CLAUDE.md` operates against folders here:
- **Plan chat** writes / updates files in `PlannedBuilds/<idea>/`.
- **Build chat** reads `PlannedBuilds/<idea>/` and executes the build plan inside, writing code into `js/` etc.

Multi-build chats can read multiple folders here at once and produce a consolidated plan that avoids double-touching the same files or building conflicting changes.

---

## In-flight ideas

The table below is the index every fresh chat reads first. Update the status / last-touched columns whenever you make a meaningful change to an idea's folder.

| Idea | Status | Last touched | Files touched (in released app) | Summary |
|---|---|---|---|---|
| [`timber-screws/`](timber-screws/README.md) | 🔶 Phase 5 reset — ready to build | 2026-05-18 | 02b/02c/02d/02e (data, ✅), 75 (helpers, partially ✅), 77 (screw, ✅), 78 (connection, ✅), 79 (rule engine, ✅); pending Phase 5 edits: 34, 58, 60, 69, 72, 74 (palette + dispatch + size picker) | Rothoblaas HBS Plate screw-to-timber connection designer. v1 acceptance gate (Test 1 reproduces η=0.801 PASS) already met; needs proper palette integration (TIMBER + HBS SCREW tiles in V26 BB-rail Members section) per the locked architectural decisions in `10-corrective-plan.md`. |
| [`orientation-presets/`](orientation-presets/README.md) | ✅ Ready to build (icons + EA/UA to confirm) | 2026-05-19 | index.html (SVG sprite), 60 (lastUsedOrientation), 69 (v25SetMember + placement rot), 72 (remove Aspect / Open-face dropdowns, inject row), styles.css; NEW 72b (catalogue + row component + setter) | Replace the Aspect dropdown + PFC Open-face dropdown in the V25 2D-mode quick-options bar with a row of icon buttons showing every standard orientation per member type (UB 3, PFC 6, SHS/RHS/CHS 3 each). Ships the orientation-row primitive that `v25-2d-bolts/` then consumes for bolt orientations. |
| [`v25-2d-bolts/`](v25-2d-bolts/README.md) | 📐 Planning — scope locked, open questions pending | 2026-05-19 | 03 (BOLT_GRADES), 05 (v25State fields), 21 (rayMaterialAlongAxis2D + computeBoltGripInfo2D), 33 (axis-agnostic refactor — pure dedup, no behaviour change), 34 (drawEnt2D case), 43 (clipboard), 45 (DXF), 46 (save-load + schemaVersion:1), 59 (Inspector), 68 (drawBolt2D), 69 (v25SetBolt + tile + preview), 71 (hit-test + grips), 72 (options bar branch), 72b (V25_ORIENT.bolt2), index.html (5 icons), styles.css | First-class V25 2D-mode through-bolt entity with auto-grip across plates and UB/UC/WB/PFC webs/flanges. AS 1101 side profile matching the 3D-mode bolt's render quality. Default M20 8.8/S; sizes M12+; grades 4.6/S and 8.8/S. T-cleat (2-plate-stack) clamping handled automatically. SHS/RHS/CHS hosts deferred to v1.1. Closes known issue #5 (save schemaVersion). |
| [`click-cycle-selection/`](click-cycle-selection/README.md) | 👀 In review — built + verified in worktree, pending Dan's browser test + mirror | 2026-05-19 | 07 (v25ClickCycle state + V25_CYCLE_PX), 39 (mousedown grip + select, mouseup, dblclick, marquee — all cycle-aware), 47 (status-bar depth hint), 71 (v25HitTestAll + v25HitTest wrapper + v25ClickCycleCurrentEnt) | Bluebeam-style click-cycling for the V25 2D-mode Select tool — repeated clicks at the same point step down the z-stack of overlapping entities (beam→plate→column→wrap to top). Cycle resolves on mouse-up so a click-drag of a cycled entity still moves it; self-invalidating `v25ClickCycle` state. ⚠️ Code is COMPLETE + verified but lives in worktree `claude/stupefied-kowalevski-2b02d9` (uncommitted), not the main checkout — needs branch→main integration + Dan's browser test. Overlaps `v25-2d-bolts` on file 71 (additive, no conflict). |
| [`codebase-restructure/`](codebase-restructure/README.md) | ♻️ Partially superseded — diagnosis still authoritative, prescription (Phases 2-7) superseded by `architecture-v2/`. Phase 1 carries over as `architecture-v2/` Phase 0a. | 2026-05-19 | Phase 1 (docs only): CLAUDE.md, README.md, CHANGELOG.md, js/02b/02c/02d/02e/05/07/75/77/79 (comment-only path-string replacements), index.html (comments), PlannedBuilds/timber-screws/README.md, archive/completed-plans/README.md. (Phases 2-7 superseded — see `architecture-v2/11-relationship-with-codebase-restructure.md`.) | The original diagnosis of the v1 codebase drift. Five-agent deep audit producing `02-current-state-audit.md` + four per-layer findings docs. Diagnosis remains authoritative for v1 state. Prescription (Phases 2-7) is superseded by the deeper `architecture-v2/` rebuild; Phase 1 (docs realignment) is carried over verbatim as Phase 0a of v2. |
| [`architecture-v2/`](architecture-v2/README.md) | 🔨 Building — Phase 0a docs realignment done 2026-05-19; Phase 0b (model-layer scaffold) next | 2026-05-19 | Phase 0a (docs only, identical to codebase-restructure Phase 1): CLAUDE.md, README.md, CHANGELOG.md, index.html + js/ comments, planning READMEs. Phases 0b-∞ build out `js/v2/` as a separate layered tree (~150 files over 12-18 months) alongside the existing v1 code; v1 retires opportunistically as each feature migrates. Pilot is plates. Then bolts (incorporates `v25-2d-bolts/`), then members, then timber, then timber fasteners (replaces `timber-screws/` v1 feature), then joints, annotations, selection (incorporates `click-cycle-selection/`), and so on. Each phase has its own Files-touched table inside 09-build-plan.md. | Real layered architecture (Model / View / Render / Tool / Engine) so a new structural element exists once and every renderer (Canvas2D, ThreeJS, PDF, DXF) projects it. Strangler-fig migration: ship the four in-flight ideas in v1 first, then build v2 alongside, then migrate features one at a time. End state: pound-for-pound Revit competitor in structural detailing. |

Status legend:
- 💭 **Idea** — folder exists, README sketches the concept, lots of open questions
- 📐 **Planning** — actively being worked in plan chats; build plan + open questions in flight
- ✅ **Ready to build** — all open questions answered, build plan locked, awaiting a build chat
- 🔨 **Building** — a build chat is actively changing files; planning folder's progress tracker is live
- 🔶 **Mid-build reset** — something diverged; corrective plan in place, ready to resume
- 👀 **In review** — build chat finished; Dan reviewing the diff
- ♻️ **Partially superseded** — diagnosis still useful, prescription replaced by a newer planning folder. Cross-reference the superseding folder.
- 🎉 **Shipped** — committed and pushed to GitHub. Idea folder gets moved to `archive/completed-plans/` and a one-line summary lands in CHANGELOG.

---

## Starting a new idea

1. Copy `_TEMPLATE/` to a new folder named after the idea (e.g. `cp -r _TEMPLATE timber-shear-tabs`).
2. Fill in the new folder's `README.md` header — at minimum the goal, scope, status, and target user perspective.
3. Add the idea to the table above (status = 💭 Idea or 📐 Planning).
4. Open a fresh plan chat in Cowork or Claude Code, point it at the project root + the new folder. The chat reads `CLAUDE.md` first, then your folder's `README.md`, then asks clarifying questions, then helps you build out the rest of the planning files.

The template is deliberately spare — only the README is required up front. Other files (domain knowledge, data model, build plan, open questions, test cases, architecture, UX) get added as the plan develops, in whatever order makes sense for the scope of the idea. See `timber-screws/` for the canonical example of a fully fleshed-out folder.

---

## Building one or more ideas

**Single-idea build.** Open a fresh Claude Code chat, point it at the project root + `PlannedBuilds/<idea>/`. It reads `CLAUDE.md` for app conventions, then the idea's README for context, then `08-open-questions.md` (or wherever the open questions live) to confirm nothing's still pending, then walks the build plan phase by phase.

**Multi-idea build (consolidation).** Open a fresh Claude Code chat, point it at the project root + every idea folder you want to build together. Ask for a *consolidation plan first* — the chat reads each idea's "Files touched" list, identifies overlaps, and proposes a unified phase plan that avoids touching the same file twice with conflicting intent. Common multi-build patterns:

- **Same entity family** (e.g. timber-screws + timber-shear-tabs): probably share catalogue files and the rule engine; benefit from being built in one pass.
- **Same UI surface** (e.g. two new BB-rail tiles): benefit from being added in one edit to `74-v26-bb-rail.js`.
- **Independent** (e.g. autosave + new dimension type): can be built independently, parallel sessions, but the consolidator should still cross-check for hidden coupling.

When a multi-build session lands, each idea's progress tracker gets updated independently so the state of each idea is still legible after the fact.

---

## Idea-folder conventions

Each idea folder should follow this minimum shape:

```
<idea>/
├── README.md                       always — TL;DR + scope + status + navigation
├── 01-context.md                   what is this idea, who's it for, why now
├── 02-design.md                    data model / architecture / integration points
├── 03-build-plan.md                phased work plan
├── 04-open-questions.md            decisions still pending Dan's input
└── 05-test-cases.md                verification fixtures (for ideas with logic)
```

Larger ideas can split files further (the `timber-screws/` folder has 10 files because it covers an engineering rule set, a data layer, a rule engine, and a UX overhaul). Smaller ideas might collapse `01–02` into a single `01-overview.md`. Use judgement; the goal is "a fresh chat can read this folder and understand the idea without re-deriving anything."

**File-touch declaration.** Each idea's `02-design.md` (or equivalent) MUST include a "Files touched" section listing every released file (`js/NN-*.js`, `index.html`, `css/styles.css`) the idea will modify. The dashboard table above is populated from these declarations — keep them in sync so the multi-build consolidator can do its job.

**Status header in the README.** Every idea folder's README starts with a status block:

```
Status: <emoji-status>
Last touched: YYYY-MM-DD
Owner: Dan McCarron
Scope: <one-line summary>
```

Update this block in the same commit that updates the idea's content. The dashboard table above mirrors these values.

---

## When an idea ships

After the feature is committed and pushed to GitHub:

1. Move the idea's planning docs to `archive/completed-plans/` (date is when it shipped, not when planning started) — a single-document plan as a flat `<YYYY-MM-DD>_<idea>.md` file, a multi-file folder as `<YYYY-MM-DD>_<idea>/`.
2. Add a one-line summary to the table in `archive/completed-plans/README.md`.
3. Remove the row from the in-flight table above.
4. The CHANGELOG.md entry is the user-visible record of what shipped; the archived folder is the planning-side trail.
