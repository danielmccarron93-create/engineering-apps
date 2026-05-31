# StructDraw — V25 2D-Mode Bolt Entity (with auto-grip)

Status: 📐 Planning — scope locked, defaults locked, ready to build after open questions land
Last touched: 2026-05-19
Owner: Dan McCarron
Scope: Introduce a first-class 2D-mode bolt entity (`bolt2`) that renders to the same AS 1101 quality as the 3D-mode bolt — head-on circle in elevation view, full chamfered-hex side profile with washers / threaded shank / nut / thread protrusion in section view — and auto-detects grip from the visible 2D entity stack it passes through (plates, UB / UC / WB / PFC webs and flanges).

---

## TL;DR for a fresh chat

You're picking this up cold. Do this in order:

1. Read project root `CLAUDE.md` — workflow rules, the two-mode requirement, the "Adding a new member, fastener, or hatch type — integration checklist". Non-negotiable.
2. Read `PlannedBuilds/README.md` — the dashboard. Note that `orientation-presets/` is a sibling idea whose orientation-row component this feature consumes for the bolt's five orientations.
3. Read this README end-to-end.
4. Read `01-context.md` — why the 2D bolt doesn't exist today and what the 3D bolt does that we need to match.
5. Read `02-design.md` — entity schema, file-by-file change list, dependency on the 3D-bolt refactor.
6. Read `05-auto-grip-algorithm.md` — the engineering core of the feature. This is the raycast that makes the side profile clamp the right material automatically.
7. Read `04-open-questions.md` — confirm Dan has answered the fabrication-gap tolerance, free-space fallback, and callout-integration scope before starting Phase 2.
8. If plan chat: help refine the auto-grip handlers or the entity schema. Don't touch code.
9. If build chat: open `03-build-plan.md` and walk it phase by phase. The first phase is a pure refactor of the existing 3D bolt code — verify behaviour is bit-identical before moving on.

---

## The feature in one paragraph

Today's 3D-mode bolts in `dev/js/33-draw-bolt.js` look excellent — a single bolt object renders as a head-on circle in an elevation block and as a chamfered-hex side profile with washers, threaded shank, nut, and thread protrusion in a section block, with the head and nut auto-clamping the actual material stack the bolt passes through. The 2D mode has no bolt entity at all — only V25 anchors (trubolt / chemset / coach / tek / through), which are single-click stamps with embedment depth, not structural through-bolts. This feature introduces a `bolt2` entity that matches the 3D bolt's render quality for the 2D paper-space mode, with an auto-grip raycast operating on the visible 2D entity outlines instead of the 3D solid model. Default placement is M20 grade 8.8/S; the user can pick any standard size from M12 upward and either 4.6/S or 8.8/S grade. The five placement orientations (head-on circle plus four side-profile rotations) are surfaced via the orientation row from the sibling `orientation-presets` build.

---

## v1 scope

**In scope:**
- New `bolt2` 2D entity type with fields `{ type:'bolt2', boltSize, grade, u, v, aspect:'elev'|'sec', rot, gripOverride? }`.
- Renderer with two aspects: `elev` (head-on circle + washer ring + crosshair, AS 1100) and `sec` (full chamfered-hex side profile, AS 1101).
- Auto-grip raycast operating on these host entity types: **`plate2`** (any thickness), **`mem2` UB / UC / WB** (web or flange depending on bolt position), **`mem2` PFC** (web or flange).
- Two-plate-stack case (T-cleat, window-head cleat) handled automatically by the interval-merge logic in the raycast.
- Bolt length auto-snaps to the next standard length in `BOLT_LENGTHS` that satisfies grip + 2·washer + nut + thread protrusion (same logic as 3D).
- Live preview during placement showing the actual material being clamped, updating as the cursor moves.
- Free-space placement allowed with default 12 mm grip and a faint orange centre dot indicating "grip unknown — set in Inspector."
- New Bolt tile in the 2D-mode palette (V26 BB-rail), alongside the existing anchor tiles.
- Quick-options bar: Size dropdown (M12 floor), Grade dropdown (4.6/S, 8.8/S), orientation row (5 presets from `orientation-presets`).
- Inspector exposes size, grade, aspect, rot, grip auto/override, grip value, washer count.
- Save/load round-trip via the existing `entities2D[viewKey]` JSON serialisation path. This is the right moment to add `schemaVersion: 1` to the save format (closes known issue #5 in `CLAUDE.md`).
- DXF export of the bolt as native LINE / POLYLINE / ARC entities so drafters pick it up cleanly in DWG.

**Out of scope (defer to v1.x):**
- Hosts: SHS / RHS / CHS — added in v1.1 once the through-bolt vs one-wall-fixing UX is decided.
- Blockwork wall (`v25-wall`) as a host — typically uses chem-set anchors not through-bolts, but worth adding as the natural extension after HSS hosts.
- Bolt groups (multi-bolt placement in one action) — the existing `boltGroup` tool in the 3D-mode palette handles groups for 3D; 2D groups are v1.1.
- Tension friction (/TF) and tension bearing (/TB) grade variants — v1.1 if Dan needs them; AS 4100 §9.3.2.
- Integration with `place-bolt-callout` so a click on a placed bolt drops the "M20 8.8/S" callout text via leader — Phase 4 polish, see `03-build-plan.md`.
- Connection-builder integration (the cap-plate / baseplate / WSP / splice macros in `dev/js/48-connection-builders.js`) — they currently emit 3D bolts; making them emit `bolt2` for a 2D sheet is a separate planning conversation.

**v1 success criteria:**
1. Dan can click the Bolt tile on a 2D sheet, see the M20 8.8/S preview attached to the cursor, hover it over the web of a 360UB cross-section, watch the grip snap to `tw = 8 mm`, click, and place a bolt whose head and nut sit exactly against the web faces — visually indistinguishable from the 3D-mode equivalent in screenshot 3 of the planning conversation.
2. Same flow over a single 10 mm cleat plate gives grip = 10, with the head and nut clamping the plate. Over a stack of two 10 mm plates (T-cleat case) gives grip = 20, with both plates clamped.
3. Switching orientation via the row (head-up / down / left / right) rotates the side profile correctly and the grip raycast still resolves the right material.
4. Free-space placement leaves a bolt at 12 mm default grip with the orange-dot indicator, which can be overridden in the Inspector.
5. Save → reload → bolt2 entities round-trip identically.
6. The pre-existing 3D-mode bolt renders bit-identically before and after the Phase 1 refactor (regression-tested with side-by-side screenshots).

---

## Why this matters

Cleat-plate connections are the most common detail in Dan's daily work — web-side-plates on UB-to-UB, baseplates with anchor bolts, splices, T-cleats at lintel-to-column connections, cap plates. Every one of those details needs at least one bolt drawn in section view with the head and nut clamping the right material at the right grip. Today the only way to produce that in StructDraw is to switch to 3D-model mode, set up a 3D model of the joint, and project it through a section block. That overhead is the friction that pushes Dan back to Bluebeam for many small details. With a 2D bolt that auto-grips the visible geometry, he can produce a defensible AS 1101-quality detail directly on the V25 paper-space sheet in two clicks.

The reference quality bar is the **STP Typical Structural Details PDF page 85, details 6011.1–6011.6** — every cap-plate, baseplate, splice, WSP, and tilt-up detail on that page shows bolts drawn the way this feature will draw them.

---

## Files touched (in released app)

| File | What changes |
|---|---|
| `dev/js/33-draw-bolt.js` | Phase 1 refactor: collapse `_drawBoltSectionA_V14` (line 158) and `_drawBoltPlanB_V14` (line 226) into one axis-agnostic `drawBoltSideProfile(blk, cu, cv, rotRad, b, gi, col, clCol, ...)`. Collapse `drawThreadAlongU` (line 96) and `drawThreadAlongV` (line 126) into one `drawThreadAlongAxis(blk, cu, cv, startS, endS, rotRad, halfD, halfMin, realP)`. The existing 3D callers wrap them at `rotRad = 0` and `π/2`; behaviour must stay bit-identical. |
| `dev/js/21-bolt-grip.js` | Extract `rayMaterialAlongZ` logic into a more general `rayMaterialAlongAxis(obj, ox, oy, axisRot)` so the 2D version can re-use the per-host-type test bodies. May leave the 3D-specific wrapper in place. |
| `dev/js/03-data-bolts.js` | Add a small `BOLT_GRADES` constant listing the supported grades for the v1 grade dropdown (`['4.6/S', '8.8/S']`). |
| `dev/js/68-v25-tools.js` | Add `drawBolt2D(blk, ent, cs)` renderer next to `drawMem2D`. Handles aspect dispatch (elev vs sec) and calls into the new axis-agnostic primitives in `33-draw-bolt.js`. |
| `dev/js/69-v25-dispatch.js` | Add `v25SetBolt(size)` near `v25SetMember` (line 156). Add a tool branch for `tool === 'v25-bolt'` in the preview/placement path (around lines 806–826). Add the new Bolt tile to `getPaletteDef2D()` in the "Bolts & Anchors (B-)" group (around line 90). |
| `dev/js/72-v25-options-bar.js` | Add a new branch `tool === 'v25-bolt'` rendering Size dropdown, Grade dropdown, and the orientation row from `orientation-presets`. |
| `dev/js/71-v25-selection.js` | Add `bolt2` hit-test (elev = washer-OD circle; sec = head AF × overall length rectangle aligned to bolt axis) and grip handles (centre move; rotate-90 grip on the head end). |
| `dev/js/59-inspector.js` | Add `bolt2` panel: size, grade, aspect, rot, grip auto/override toggle, grip value, washer count, nut style. |
| `dev/js/46-save-load.js` | Add `bolt2` to the entity-type allow-list. **Also add `schemaVersion: 1` to the save format** and a load-time migration scaffold (closes known issue #5). |
| `dev/js/43-clipboard.js` | Add `bolt2` to the entity-types copied / pasted-in-place. |
| `dev/js/45-dxf-export.js` | Add `bolt2` emission: hex polygons + sawtooth thread lines + centreline as DXF LINE / POLYLINE entities. |
| `dev/js/05-state.js` | Add `v25State.boltSize`, `v25State.boltGrade`, `v25State.boltRot`, `v25State.gripOverride` declarations alongside the existing v25State fields. |
| `dev/css/styles.css` | Possibly a new style for the free-space-bolt orange centre-dot indicator. |

New files (proposed):
- *None required.* The `drawBolt2D` renderer fits naturally in `68-v25-tools.js` alongside `drawMem2D`. If `drawBolt2D` grows past ~250 lines as the renderer matures, consider extracting to `dev/js/68b-v25-bolt2d.js`.

## Dependency / overlap with other in-flight ideas

- **`orientation-presets/`** — this feature consumes `v25BuildOrientationRow('bolt2')`. The orientation catalogue needs a `bolt2` entry with five presets (head-on circle + four side orientations). Sequence: ship `orientation-presets` first, then `v25-2d-bolts` extends `V25_ORIENT` with the bolt set. If both ship in the same build session, the consolidator should add the `bolt2` catalogue entry as part of the `orientation-presets` Phase 1.
- **Shared file touches with `orientation-presets`**: `dev/js/72-v25-options-bar.js` (both add new branches), `dev/js/60-tile-palette.js` (this adds a tile, that touches `lastUsedOrientation`). No conflict, but a multi-build chat should sequence the orientation work first.

---

## Folder navigation

| File | Purpose |
|---|---|
| `README.md` | this file — start here |
| `01-context.md` | what the 3D bolt does today, why the 2D mode has none, what "same quality in 2D" requires |
| `02-design.md` | entity schema, the refactor of `33-draw-bolt.js`, renderer dispatch, file-by-file change list |
| `03-build-plan.md` | four phased sessions (refactor → core auto-grip → orientations + grade → polish) |
| `04-open-questions.md` | decisions pending Dan's input |
| `05-auto-grip-algorithm.md` | the raycast per host type, fabrication-gap tolerance, free-space fallback, length-snap formula |

---

## How to start (copy-paste prompt for a fresh chat)

```
You're picking up the v25-2d-bolts build idea for StructDraw.

1. Read /CLAUDE.md end-to-end (the project root playbook).
2. Read /PlannedBuilds/README.md (the dashboard).
3. Read /PlannedBuilds/v25-2d-bolts/README.md and every other file in that folder.
4. Check /PlannedBuilds/v25-2d-bolts/04-open-questions.md.
5. <PLAN or BUILD>:
   - PLAN: help me refine the auto-grip algorithm or the entity schema. Don't write code.
   - BUILD: walk /PlannedBuilds/v25-2d-bolts/03-build-plan.md phase by phase.
     The first phase is a pure refactor of dev/js/33-draw-bolt.js — verify the 3D
     bolt still renders identically before moving on. Test at each boundary.
     Update the progress tracker after each phase.
```
