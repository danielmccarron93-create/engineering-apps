# StructDraw — Modifier-drag Duplicate (Bluebeam-style copy-drag)

Status: 👀 In review (built + browser-verified 2026-06-02)
Last touched: 2026-06-02
Owner: Dan McCarron
Scope: Hold a modifier (Alt anywhere, Ctrl on Windows) and click-drag any item — line, bolt, member, text box, plate, group, or 3D object — to create an exact copy and drag it to where you want, leaving the original in place. The Bluebeam "Ctrl-drag to copy" gesture, native to StructDraw in both modes.

---

## TL;DR for a fresh chat

You're picking this up cold. Do this in order:

1. **Read project root `CLAUDE.md`** — workflow rules, file conventions, the two-mode requirement, variable conventions. Non-negotiable.
2. **Read `PlannedBuilds/README.md`** — the dashboard. Note the overlap warnings below.
3. **Read this README end-to-end.**
4. **Read `01-context.md`** (the gesture + how drag works today across the three pipelines) and `02-design.md` (the exact seams, reused functions, Files-touched).
5. **Read `04-open-questions.md`** — all resolved/recommended; nothing blocking.
6. **If a build chat:** open `03-build-plan.md` and walk it phase by phase, browser-smoke-testing at each boundary.

---

## The idea in one paragraph

In Bluebeam Revu, holding a modifier and dragging any markup drops an instant copy where you release — the fastest way to lay down repeated identical items (a row of bolts, a run of members, a stack of notes). This feature brings the same muscle-memory gesture to StructDraw: **hold Alt (or Ctrl on Windows), grab the body of any item, drag, and a copy is created and follows the cursor while the original stays put.** The crucial finding from the plan chat is that StructDraw *already has* duplicate routines in every relevant code path — `v25DuplicateSelected()` for 2D entities, `placeElement()` transactions for v2 plates, and `pasteObjects()`/Ctrl+D for 3D objects. So this is not "build duplication"; it's "wire the existing duplicate into the drag-start with zero offset, then drag the copy." The work is three small, well-contained injections at known seams plus one shared modifier rule.

---

## Why this matters

Repetition is the bulk of detailing: bolt rows along a cleat, evenly-spaced studs, a column of identical call-outs, parallel members. Today the only quick path is the Ctrl+D / paste-in-place duplicate, which drops the copy at a fixed 30 mm offset that the user must then drag into position — two actions for one intent. The Bluebeam copy-drag collapses that to a single gesture: the copy is born under the cursor and placed in the same motion. It's the single biggest "feels like the tool I already use" win for someone who lives in Bluebeam at work, and it costs almost nothing because the duplication logic already exists.

---

## Confirmed scope (locked in the plan chat, 2026-06-02)

**In scope (all three interaction pipelines):**
- **Pipeline A — v25 2D entities:** lines/lineSet, bolts, members (`mem2`), text/`noteBox`, hatch (`mat`), leaders, reo, mesh, anchors, frames. Multi-selection and grouped assemblies duplicate as a unit (fresh `groupId`).
- **Pipeline B — v2 plates:** the 2D-mode plate path (separate v2 model + capture-phase pointer pipeline).
- **Pipeline C — 3D-mode objects:** members, bolts, plates etc. in the model-first mode.
- **Trigger:** Alt on all platforms; Ctrl additionally on Windows/Linux (see modifier rule in `02-design.md`).
- Copy created on **first drag movement** (a modifier-click without dragging makes no copy); **zero offset** (tracks cursor 1:1); copy **selected on release**; **one Ctrl+Z removes it**.

**Out of scope (defer):**
- **Cross-system grouped assemblies** — a group that mixes a v25 member *and* a v2 plate duplicating as one re-linked unit (two stores, two id systems). Documented limitation; each store duplicates its own members.
- **Ctrl-drag on macOS** — deliberately not enabled by default (Ctrl-click is the Mac right-click → Group/Joint menu). One-line opt-in noted in `02-design.md` if Dan wants it later.
- A "copy N times / array" repeat tool (this is single-copy-per-drag, like Bluebeam).

**v1 success criteria:**
1. Alt-drag a bolt / member / noteBox / leader / hatch in 2D → one copy under the cursor, original unmoved, copy selected on release. Console clean.
2. Alt-drag a multi-selection and an existing group → all members copied; the copy is an independent group.
3. Alt-drag a v2 plate → independent plate copy via a `placeElement` transaction; vertex/edge/rotate editing still works afterwards.
4. Alt-drag a UB/bolt in 3D mode → copy + correct placement; existing Ctrl+D untouched.
5. **Non-trigger:** plain drag still *moves*; grip/vertex/rotation drag still *resizes/edits*; modifier-click without drag makes no copy.
6. **Undo:** one Ctrl+Z deletes the copy and restores the pre-drag state in all three pipelines.
7. **Mac context menu:** Ctrl-click (no Alt) still opens the Group/Joint menu unchanged.

---

## Files touched (in released app)

See `02-design.md` for the full table. Headline: **no new JS file** — thin, well-contained inserts in `js/07-globals.js` (shared modifier helper + flag), `js/39-events.js` (Pipelines A + C hooks), `js/71-v25-selection.js` (factor a shared in-place clone helper out of `v25DuplicateSelected()`), `js/v2/tools/edit-plate.js` (Pipeline B hook), and `CHANGELOG.md`.

---

## Folder navigation

| File | Purpose |
|---|---|
| `README.md` | this file — start here |
| `01-context.md` | the gesture; how dragging + duplication work today across the three pipelines; the macOS modifier conflict |
| `02-design.md` | the three seams, the shared modifier rule, behaviour spec, reused functions, Files-touched |
| `03-build-plan.md` | four phases + progress tracker |
| `04-open-questions.md` | decisions (all resolved/recommended; nothing blocking) |

---

## Dependency / overlap with other in-flight ideas

- **`plate-orientation-presets/`** (🔨 building) — also edits `js/v2/tools/edit-plate.js` `onPointerDown`. This feature adds a *modifier branch* at the body-hit; that feature reworks plate *drag/snap/ortho*. Different branches, but **rebase carefully** and re-test plate drag if that lands first. Also both touch `index.html`/`72` for other features — this idea touches neither.
- **`premium-textbox/`** (🔨 building) and **`notebox-spellcheck/`** (👀 review) — touch `js/39-events.js` and `js/71-v25-selection.js` in different functions. No logical conflict; rebase the thin inserts if they land first.

## How to start (copy-paste prompt for a fresh chat)

```
You're picking up the modifier-drag-duplicate build idea for StructDraw.

1. Read /CLAUDE.md end-to-end (the project root playbook).
2. Read /PlannedBuilds/README.md (the dashboard).
3. Read /PlannedBuilds/modifier-drag-duplicate/README.md and every other file in that folder.
4. Check /PlannedBuilds/modifier-drag-duplicate/04-open-questions.md (nothing should be blocking).
5. BUILD: walk /PlannedBuilds/modifier-drag-duplicate/03-build-plan.md phase by phase.
   Test in the browser at each boundary (copy repo to /tmp + python3 -m http.server —
   the iCloud path can't be served directly). Update the progress tracker after each phase.
```
