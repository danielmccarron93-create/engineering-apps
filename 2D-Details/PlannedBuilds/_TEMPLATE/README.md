# <idea name> — <one-line summary>

Status: 💭 Idea
Last touched: YYYY-MM-DD
Owner: Dan McCarron
Scope: <one or two sentences — what does this feature do, who's it for>

---

## TL;DR for a fresh chat

You're picking this up cold. Do this in order:

1. **Read the project root `CLAUDE.md`** — workflow rules, file conventions, the 73-file structure of `js/`, the "Target user / quality bar / two-mode requirement" callout, the "Two-chat workflow" section, and especially the "Adding a new member, fastener, or hatch type — integration checklist". Non-negotiable.
2. **Read `PlannedBuilds/README.md`** — the dashboard. See what other ideas are in flight that this might overlap with.
3. **Read this README end-to-end.**
4. **Read `04-open-questions.md`** — if any blocking questions are unanswered, ask Dan before going further.
5. **If a plan chat**: help flesh out the planning files (01–05 below) according to the scope. Ask clarifying questions. Don't write code.
6. **If a build chat**: open `03-build-plan.md` and walk it phase by phase. Confirm every open question is answered first.

---

## The idea

<2–4 paragraphs. What is this feature? What user pain does it solve? Why now? Who's the future user — what does their daily workflow look like once this exists?>

---

## Scope

**In scope (v1):**
- <bullet — single concrete thing>
- <bullet>

**Out of scope (defer to v1.x):**
- <bullet>
- <bullet>

**Success criteria for v1:**
1. <concrete, testable thing — e.g. "Dan can place a TIMBER member from the V26 BB-rail Members tile">
2. <concrete, testable thing>

---

## Files touched (in released app)

List every file the build will modify. This populates the dashboard's conflict-detection column in `PlannedBuilds/README.md`. Keep in sync as scope evolves.

| File | What changes |
|---|---|
| `dev/js/NN-*.js` | <one-line description> |
| `dev/js/NN-*.js` | <one-line description> |

New files (proposed):
- `dev/js/NN-*.js` — <purpose>

---

## Folder navigation

| File | Purpose |
|---|---|
| `README.md` | this file — start here |
| `01-context.md` | (optional, larger ideas) deeper context, user research, source documents |
| `02-design.md` | data model, architecture, integration points |
| `03-build-plan.md` | phased work plan with concrete tickets |
| `04-open-questions.md` | decisions still to land; ask Dan before coding |
| `05-test-cases.md` | (optional, ideas with logic) verification fixtures |

Larger ideas may split further (see `timber-screws/` for an example with 10 files). Smaller ideas may collapse some files. Use judgement.

---

## How to start (copy-paste prompt for a fresh chat)

```
You're picking up the <idea name> build idea for StructDraw.

1. Read /CLAUDE.md end-to-end (the project root playbook).
2. Read /PlannedBuilds/README.md (the dashboard).
3. Read /PlannedBuilds/<idea>/README.md and any other files in that folder.
4. Check /PlannedBuilds/<idea>/04-open-questions.md.
5. <PLAN or BUILD>:
   - PLAN: help me think through this idea from a senior Australian structural
     engineer's perspective. Don't write any code. Ask clarifying questions.
     Update the planning files as we go.
   - BUILD: walk /PlannedBuilds/<idea>/03-build-plan.md phase by phase.
     Test at each boundary. Update the progress tracker after each phase.
```
