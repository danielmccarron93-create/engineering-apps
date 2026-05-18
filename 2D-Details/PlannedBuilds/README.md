# Planned Builds — the dashboard

This folder is the canonical home for every in-flight or upcoming build idea. Each idea gets its own subfolder (kebab-case, brief, specific) containing the full planning context — domain knowledge, data model, build plan, open questions, test cases — so any chat (Cowork or Claude Code) can be pointed at one folder and have everything it needs to either continue planning or start building.

The two-chat workflow in the project root `CLAUDE.md` operates against folders here:
- **Plan chat** writes / updates files in `PlannedBuilds/<idea>/`.
- **Build chat** reads `PlannedBuilds/<idea>/` and executes the build plan inside, writing code into `dev/js/` etc.

Multi-build chats can read multiple folders here at once and produce a consolidated plan that avoids double-touching the same files or building conflicting changes.

---

## In-flight ideas

The table below is the index every fresh chat reads first. Update the status / last-touched columns whenever you make a meaningful change to an idea's folder.

| Idea | Status | Last touched | Files touched (in released app) | Summary |
|---|---|---|---|---|
| [`timber-screws/`](timber-screws/README.md) | 🔶 Phase 5 reset — ready to build | 2026-05-18 | 02b/02c/02d/02e (data, ✅ in dev), 75 (helpers, partially ✅), 77 (screw, ✅), 78 (connection, ✅), 79 (rule engine, ✅); pending Phase 5 edits: 34, 58, 60, 69, 72, 74 (palette + dispatch + size picker) | Rothoblaas HBS Plate screw-to-timber connection designer. v1 acceptance gate (Test 1 reproduces η=0.801 PASS) already met in `dev/`; needs proper palette integration (TIMBER + HBS SCREW tiles in V26 BB-rail Members section) per the locked architectural decisions in `10-corrective-plan.md`. |

Status legend:
- 💭 **Idea** — folder exists, README sketches the concept, lots of open questions
- 📐 **Planning** — actively being worked in plan chats; build plan + open questions in flight
- ✅ **Ready to build** — all open questions answered, build plan locked, awaiting a build chat
- 🔨 **Building** — a build chat is making changes in `dev/`; planning folder's progress tracker is live
- 🔶 **Mid-build reset** — something diverged; corrective plan in place, ready to resume
- 👀 **In review** — build chat finished; Dan reviewing diff in `dev/`
- 🎉 **Shipped** — mirrored `dev/` → root, pushed to GitHub. Idea folder gets moved to `archive/completed-plans/` and a one-line summary lands in CHANGELOG.

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

**File-touch declaration.** Each idea's `02-design.md` (or equivalent) MUST include a "Files touched" section listing every released file (`dev/js/NN-*.js`, `dev/index.html`, `dev/css/styles.css`) the idea will modify. The dashboard table above is populated from these declarations — keep them in sync so the multi-build consolidator can do its job.

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

After the dev/ → root mirror and the GitHub push:

1. Move the idea folder to `archive/completed-plans/<YYYY-MM-DD>_<idea>/` (date is when it shipped, not when planning started).
2. Add a one-line summary to the table in `archive/completed-plans/README.md`.
3. Remove the row from the in-flight table above.
4. The CHANGELOG.md entry is the user-visible record of what shipped; the archived folder is the planning-side trail.
