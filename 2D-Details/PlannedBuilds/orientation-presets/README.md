# StructDraw — Orientation Presets for 2D Members & Bolts

Status: ✅ Ready to build (icons + EA/UA orientation sets to confirm with Dan before Phase 2)
Last touched: 2026-05-19
Owner: Dan McCarron
Scope: Replace the Aspect/Open-face dropdowns in the V25 2D-mode quick-options bar with a row of icon buttons that show every standard orientation for the active member type, so placement is one click instead of two dropdown navigations.

---

## TL;DR for a fresh chat

You're picking this up cold. Do this in order:

1. Read project root `CLAUDE.md` — workflow rules, the two-mode requirement, the "Adding a new member, fastener, or hatch type — integration checklist". Non-negotiable.
2. Read `PlannedBuilds/README.md` — the dashboard. Note that `v25-2d-bolts/` is a sibling idea that consumes the orientation-row primitive this folder builds.
3. Read this README end-to-end.
4. Read `02-design.md` — the orientation catalogue per member type, the row component, and the integration points.
5. Read `04-open-questions.md` — confirm Dan has answered the icon-set scope and the EA/UA orientation count before starting Phase 2.
6. If plan chat: help refine the orientation catalogue or icon design. Don't touch code.
7. If build chat: open `03-build-plan.md` and walk it phase by phase.

---

## The idea in one paragraph

Today, placing a 2D-mode member involves clicking a tile in the V26 BB-rail Members section, then changing the Aspect dropdown (Elevation/Cross-section) in the top quick-options bar, and for PFC also picking an Open-face value (−v/+v) from a second dropdown that only appears in cross-section view. A senior engineer doesn't think in "Aspect = Cross-section, Open-face = −v" — they think "PFC, toes pointing down." This feature replaces those dropdowns with a row of small icon buttons in the quick-options bar, one button per standard orientation for the active member type. Click the icon, the member is armed at that orientation, start drawing. The orientation icons live in a per-type catalogue (UB has three orientations, PFC has six, UA has eight, etc.). The last-used orientation per type is remembered the same way `lastUsedSection[type]` already remembers the last-used size.

---

## Why this matters

Members and bolts are the two highest-frequency primitives in any structural detail — Dan places dozens per sheet, hundreds per project. Saving one click and one mental translation per placement compounds. The orientation row also makes the available orientations *discoverable* instead of hidden behind a dropdown the user has to open to see what's in it. A drafter who's spent fifteen years drawing PFCs has all six orientations memorised; an engineer in their first three years probably hasn't, and the row teaches them by being visible. The pattern matches how Bluebeam Revu's stamp toolbox surfaces all variants at once — Dan's reference UX for this kind of palette interaction.

The reference quality bar is still **STP Typical Structural Details PDF page 85, details 6011.1–6011.6** — these typical-detail sheets show exactly the orientation set this feature surfaces, and the row gives the user one-click access to each.

---

## v1 scope

**In scope:**
- A reusable orientation-row component (`v25BuildOrientationRow(memberType)`) that renders a row of icon buttons styled to match the existing options-bar chips.
- An orientation catalogue keyed by member type (`V25_ORIENT[memberType] = [{ id, label, icon, aspect, rot, openSide? }, ...]`).
- Integration into the existing v25-mem branch of the quick-options bar in `dev/js/72-v25-options-bar.js` — the orientation row sits below the Section/Pick row and replaces the Aspect dropdown and the PFC Open-face dropdown.
- `lastUsedOrientation[memberType]` persisted in the same module as `lastUsedSection[memberType]`.
- Initial catalogue for the high-frequency types: **UB (3), UC (3), WB (3), PFC (6), SHS (3), CHS (3), RHS (3)**.
- Icons authored as inline SVG entries in the sprite at the top of `dev/index.html`, matching the visual weight of the existing `#icon-ub` / `#icon-pfc` symbols.

**Out of scope (defer to v1.x):**
- EA / UA orientation sets — needs Dan to confirm the canonical set (4 vs 8 for UA, see `04-open-questions.md` Q2).
- Bolt orientation row — depends on the bolt entity existing, which is the parallel `v25-2d-bolts` idea. Once that ships, this catalogue extends with `bolt2` orientations.
- Chord-key shortcuts to flip orientation from the keyboard (e.g. `O` then `1..6`) — V22 polish.
- Per-orientation thumbnails in the Inspector — V22 polish.

**v1 success criteria:**
1. Selecting any 2D Member tile (UB/UC/WB/PFC/SHS/RHS/CHS) shows the orientation row in the quick-options bar with the correct number of icons for that type.
2. Clicking an orientation icon arms the member at that aspect+rot+openSide combination; the cursor preview shows the chosen orientation immediately.
3. The previous Aspect dropdown and PFC Open-face dropdown are gone from placement flow (still available in the Inspector for post-placement editing).
4. The last-used orientation per type is remembered across tile re-clicks within a session.
5. The PFC six-orientation set reproduces every combination the old Aspect+Open-face dropdowns could reach.

---

## Files touched (in released app)

| File | What changes |
|---|---|
| `dev/index.html` | Add ~25 inline SVG icon symbols to the sprite at the top of the file (3 UB-family × 1 set, 6 PFC, 3 SHS, 3 RHS, 3 CHS — plus the deferred EA/UA sets when Dan confirms). |
| `dev/js/60-tile-palette.js` | Declare `let lastUsedOrientation = {}` alongside `lastUsedSection` (~line 25). |
| `dev/js/72-v25-options-bar.js` | In the `tool === 'v25-mem'` branch (~line 48), call `v25BuildOrientationRow(mt)` after the Section/Pick row; remove the Aspect dropdown (~lines 73–78) and the PFC Open-face dropdown (~lines 83–91) from the placement bar. |

New files:
- `dev/js/72b-orientation-presets.js` — orientation catalogue (`V25_ORIENT`), row component (`v25BuildOrientationRow`), setter (`v25SetOrientation`). Loaded after `72-v25-options-bar.js`, before `73-init.js`.

---

## Folder navigation

| File | Purpose |
|---|---|
| `README.md` | this file — start here |
| `01-context.md` | how the existing Aspect/Open-face dropdowns work today, what's wrong with that UX, how the orientation row improves it |
| `02-design.md` | orientation catalogue per type, row component shape, integration points, file-by-file change list |
| `03-build-plan.md` | phased work plan |
| `04-open-questions.md` | decisions pending Dan's input |

---

## Dependency / overlap with other in-flight ideas

- **`v25-2d-bolts/`** — that idea introduces a new `bolt2` entity and adds a bolt-specific orientation set to this same catalogue (head-on circle + four side orientations). Both ideas touch `dev/js/72-v25-options-bar.js`. The multi-build consolidator should sequence orientation-presets first (it ships the row primitive and the member catalogue), then `v25-2d-bolts` extends the catalogue with bolt orientations and registers a `v25-bolt` branch in the options bar that uses the same row.

## How to start (copy-paste prompt for a fresh chat)

```
You're picking up the orientation-presets build idea for StructDraw.

1. Read /CLAUDE.md end-to-end (the project root playbook).
2. Read /PlannedBuilds/README.md (the dashboard).
3. Read /PlannedBuilds/orientation-presets/README.md and every other file in that folder.
4. Check /PlannedBuilds/orientation-presets/04-open-questions.md.
5. <PLAN or BUILD>:
   - PLAN: help me refine the orientation catalogue and icon set. Don't write code.
   - BUILD: walk /PlannedBuilds/orientation-presets/03-build-plan.md phase by phase.
     Test at each boundary. Update the progress tracker after each phase.
```
