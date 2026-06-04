# Planned Builds — the dashboard

This folder is the canonical home for every in-flight or upcoming build idea. Each idea gets its own subfolder (kebab-case, brief, specific) containing the full planning context — domain knowledge, data model, build plan, open questions, test cases — so any chat (Cowork or Claude Code) can be pointed at one folder and have everything it needs to either continue planning or start building.

The two-chat workflow in the project root `CLAUDE.md` operates against folders here:
- **Plan chat** writes / updates files in `PlannedBuilds/<idea>/`.
- **Build chat** reads `PlannedBuilds/<idea>/` and executes the build plan inside, writing code into `js/` etc.

Multi-build chats can read multiple folders here at once and produce a consolidated plan that avoids double-touching the same files or building conflicting changes.

---

## Status — the architecture-v2 rebuild was abandoned (2026-05-30)

A full layered rebuild (`architecture-v2/`) was attempted and **abandoned** because the strangler-fig migration retired the mature v1 plate path before the v2 plate reached parity — badly degrading plates (lost auto-weld, rotate, resize, redraw). The rebuild's only goal was a cleaner codebase; that was not worth a quality regression in the daily app.

That rebuild folder — plus the three v1 ideas it had absorbed into its phases (`timber-screws/`, `v25-2d-bolts/`, `click-cycle-selection/`) and its precursor diagnosis (`codebase-restructure/`) — now live in **[`(failed rebuild)/`](<(failed rebuild)/README.md>)**, parked so they're not mistaken for pending work. Read that folder's README for the full story and, importantly, for what survived into the live app: the **v2 plate path is live and working** (rescued in `js/v2/tools/edit-plate.js`) — do **not** revert it.

**In-flight ideas:** `orientation-presets/` (predates and is independent of the rebuild), `premium-textbox/` (a ground-up rebuild of the 2D-mode annotation/text-box tool — being built 2026-05-30), and `bolt-orientation-presets/` (2D-mode bolt entity: orientation icon row + section clamping — planned 2026-05-31, ready to build).

## In-flight ideas

The table below is the index every fresh chat reads first. Update the status / last-touched columns whenever you make a meaningful change to an idea's folder.

| Idea | Status | Last touched | Files touched (in released app) | Summary |
|---|---|---|---|---|
| [`orientation-presets/`](orientation-presets/README.md) | ✅ Ready to build (icons + EA/UA to confirm) | 2026-05-19 | index.html (SVG sprite), 60 (lastUsedOrientation), 69 (v25SetMember + placement rot), 72 (remove Aspect / Open-face dropdowns, inject row), styles.css; NEW 72b (catalogue + row component + setter) | Replace the Aspect dropdown + PFC Open-face dropdown in the V25 2D-mode quick-options bar with a row of icon buttons showing every standard orientation per member type (UB 3, PFC 6, SHS/RHS/CHS 3 each). Self-contained; predates and is independent of the abandoned rebuild. |
| [`premium-textbox/`](premium-textbox/README.md) | 🔨 Building | 2026-05-30 | index.html (3 script tags); 07, 38, 39, 42, 45, 69, 71, 72, 74 (thin `noteBox` inserts); NEW 96 (single-stroke font), 97 (noteBox entity), 98 (noteBox UI) | Ground-up rebuild of the 2D-mode text box: `noteBox` entity — two-click placement, inline WYSIWYG editing, auto-wrap box (outline optional), multi-arrow leaders (shift-click to branch), grip move/resize/re-point, and switchable lettering (single-stroke `professional` CAD + `draftsman` 70s hand + modern `plex`) with per-detail defaults. Overlaps `orientation-presets` only on `index.html`/`69`/`72` but in different functions. |
| [`blockwork-section-elevation/`](blockwork-section-elevation/README.md) | 👀 In review | 2026-05-31 | 65, 09, 24, 68, 69, 72, 72b, 74, 71, 39, 45, index.html | `blockWall` gains two parametric draw modes — a two-click vertical **section strip** (centreline, ortho/Shift, hollow-block coursing + grout + zigzag break) and a **break-line elevation extent** — picked from a View icon row, with a BB-rail Members tile, full grips/inspector/edit, save-load, and new `S-MASONRY` DXF emission. Built directly in one session; browser-verified end-to-end. Overlaps `premium-textbox` on `39`/`45`/`69`/`71`/`72`/`74`/`index.html` but in different functions/branches. |
| [`bolt-orientation-presets/`](bolt-orientation-presets/README.md) | ✅ Ready to build | 2026-05-31 | index.html (SVG sprite + script tag), 69 (v25State + v25DrawEnt + v25-bolt placement), 72 (v25-bolt options branch), 74 (d-bolt tile rewire), 71 (bolt2 hit-test/bounds), 59 (bolt2 inspector), 45 (bolt2 DXF), CHANGELOG; NEW 72c (bolt2 entity + orientation row + drawBolt2D + clamp detection) | New `bolt2` 2D paper-space bolt entity: a five-icon orientation row (end-on circle + horizontal/vertical with nut on either side) mirroring the member orientation presets, plus auto-clamping in section views — head/washers/nut clamp the combined thickness of the already-drawn plate(s)/member webs via `v25Mem2Thickness`, length-snapped to `BOLT_LENGTHS`. 2D-mode only; 3D bolts untouched. Supersedes the parked `(failed rebuild)/v25-2d-bolts/`. Overlaps `premium-textbox` on `45`/`69`/`71`/`72`/`74`/`index.html` but in different functions/branches. |
| [`plate-orientation-presets/`](plate-orientation-presets/README.md) | 🔨 Building | 2026-05-31 | js/v2/tools/edit-plate.js, js/v2/engine/event-dispatch.js, js/v2/ui/live-render.js, js/v2/tools/place-plate-tool.js, js/v2/ui/palette-bb-rail.js, 72 (place-plate options branch), index.html (SVG sprite + script tag), CHANGELOG; NEW 72d (plate orientation row) | **v2 plate path.** Smooth/free plate dragging (Shift = ortho + dotted Revit-style guide), soft snap of a dragged plate to a member face, kills the per-move grid-snap/scan/3D-dirty lag, auto-select after placing. Plus a three-icon orientation row — Elevation (face-on) / Flat horizontal cleat / Vertical cleat — with the 12 mm thickness selector kept. Corner-resize stays ortho-by-default (inverse of move). Overlaps `bolt-orientation-presets`/`premium-textbox` only on `72`/`index.html` but in different branches. Do NOT revert plates to v1. |
| [`notebox-spellcheck/`](notebox-spellcheck/README.md) | 👀 In review (built + browser-verified 2026-06-01) | 2026-06-01 | NEW `lib/typo.js`, `dict/en_AU.*`, **`js/02f-data-spell-terms.js`** (term DB), 80 (engine), 81 (overlay + menu + sweep); index.html (4 script tags), css/styles.css (`.sp-*`), 98 (guarded editor hooks), 07 (`spellEnabled`), **59 (Settings toggle)**, 52 (sweep command), 42 (F7), CHANGELOG | Jargon-aware spell-check for note text "like Revit/Bluebeam": bundled en-AU Hunspell dictionary + a 337-token engineering allow-list/database (so `M20`/`SHS`/`U.N.O.`/`Bondek`/`Reidbar` never flag), **live red squiggles + right-click fix** in the `noteBox` editor, and a **Revit-style sweep** over every text entity on the sheet. On by default; vendored locally (no CDN), like the Routed Gothic font. **Deviations from plan:** dictionary lives in a dedicated editable data file `js/02f` (not inline in `80`); Settings toggle wired through `js/59` (the tab's content builder) to a global `spellEnabled`, not `js/74`. Establishes `lib/` and `dict/`. Pending Dan's review + commit. |
| [`modifier-drag-duplicate/`](modifier-drag-duplicate/README.md) | 👀 In review (built + browser-verified 2026-06-02) | 2026-06-02 | 07 (`isDupDragModifier` + `dragDupPending`), 39 (v25 + 3D drag-start hooks), 71 (`v25CloneEntsInPlace`), `js/v2/tools/edit-plate.js` (plate dup hook), CHANGELOG; NEW: none | Bluebeam-style copy-drag: hold **Alt** (or **Ctrl** on Windows) and drag any item — line, bolt, member, text box, plate, group, or 3D object — to create an exact copy and drop it where you release, original unmoved. Reuses the existing duplicate routines (`v25DuplicateSelected` / `placeElement` / `pasteObjects`) wired into the drag-start with **zero offset**; copy created on first move, selected on release, one Ctrl+Z removes it. Three pipelines (v25 entities / v2 plates / 3D objects). Overlaps `plate-orientation-presets` on `edit-plate.js` `onPointerDown` (different branch — rebase carefully); touches `39`/`71` in different functions from `premium-textbox`/`notebox-spellcheck`. |
| [`plate-grouping-stiffener/`](plate-grouping-stiffener/README.md) | 👀 In review (built + browser-verified, 5 phases + 6 follow-ups) | 2026-06-03 | index.html, 07, 08, 38, 39, 42, 45, 68, 69, 71, 72, 74, `js/v2/tools/edit-plate.js`, `js/v2/ui/live-render.js`, CHANGELOG; NEW 72e (`stiff2` stiffener), 72f (grouping), 72g (joint) | One consolidated build of three sub-features for the sketched end-plate detail, **2D-mode only**: (1) **cross-system grouping** — `Ctrl+G` any mix of v25 entities + v2 plates; move/rotate together, group-flash, marquee + Shift multi-select; (2) **joint weld/bolt menu** — a grouped end-plate dropped on a beam flange registers a joint (default *No connection*), auto-opens a Weld / Bolt (2×M20 @ 50 mm) / None menu, and suppresses the geometric auto-weld it owns; (3) **web stiffener** (`stiff2`) — STIFF tile, snaps between a beam's inner flange faces under a column centreline, end-grips, opt-in AS 1100 steel hatch + double-click popup. Plus a plate-drag rework (body/edge = move, corner = resize) and a root `colorAlpha` oklch fix. Overlaps `premium-textbox` / `bolt-`/`plate-orientation-presets` / `modifier-drag-duplicate` on shared files (`39`/`45`/`71`/`72`/`edit-plate.js`) but in different functions/branches. Pending Dan's review + commit. |

Status legend:
- 💭 **Idea** — folder exists, README sketches the concept, lots of open questions
- 📐 **Planning** — actively being worked in plan chats; build plan + open questions in flight
- ✅ **Ready to build** — all open questions answered, build plan locked, awaiting a build chat
- ⏸ **Deferred** — plan complete and build-ready, parked by Dan to do other work first; resume any time (proceed on the planning folder's recommended defaults; no outstanding decisions beyond noted fact-checks)
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

The template is deliberately spare — only the README is required up front. Other files (domain knowledge, data model, build plan, open questions, test cases, architecture, UX) get added as the plan develops, in whatever order makes sense for the scope of the idea. See `(failed rebuild)/timber-screws/` for a canonical example of a fully fleshed-out folder (parked, but still a good structural template).

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

Larger ideas can split files further (the parked `(failed rebuild)/timber-screws/` folder has 10 files because it covers an engineering rule set, a data layer, a rule engine, and a UX overhaul). Smaller ideas might collapse `01–02` into a single `01-overview.md`. Use judgement; the goal is "a fresh chat can read this folder and understand the idea without re-deriving anything."

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
