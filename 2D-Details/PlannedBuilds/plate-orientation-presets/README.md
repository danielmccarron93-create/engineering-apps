# StructDraw — 2D-Mode Plate: Smooth Drag + Cleat Orientation Presets

Status: 🔨 Building
Last touched: 2026-05-31
Owner: Dan McCarron
Scope: Make the 2D-mode (v2) plate drag smoothly and freely (Shift = ortho with a Revit-style dotted guide), soft-snap a dragged plate to a member face, and add an icon-row of three placement orientations — **Elevation (face-on)**, **Flat horizontal cleat**, **Vertical cleat** — mirroring the UB/bolt orientation rows, with the 12 mm thickness selector kept.

---

## TL;DR for a fresh chat

1. Read project root `CLAUDE.md` — workflow rules, the two-mode requirement, and **especially** the Architecture-status note: **plates are the one live piece of the abandoned architecture-v2 rebuild. Do NOT revert plates to v1; do NOT add a `plate2` v1 entity.** All of this work is on the **v2 plate path** (`js/v2/…`).
2. Read `PlannedBuilds/README.md` — the dashboard. `premium-textbox/` and `bolt-orientation-presets/` share `index.html` + `72` but in different functions/branches — rebase the thin inserts if they land first; no logical conflict.
3. Read this README, then `01-context.md` (how the v2 plate works + the drag-bug diagnosis), `02-design.md` (the full change contract + Files-touched), `04-open-questions.md` (both answered).
4. Build: walk `03-build-plan.md` phase by phase, browser-smoke-testing at each boundary (copy repo to `/tmp` + `python3 -m http.server` — the iCloud path can't be served by the preview sandbox; no `node` on this machine).

---

## The idea in one paragraph

Plates are the highest-friction thing to manipulate in 2D mode today. Dragging a placed plate is **locked to one axis by default**, **jumps in 10 mm grid steps**, and is **laggy** — because the v2 edit-plate move path inherited an ortho-by-default constraint, and the shared cursor pipeline runs the full `snapUV` (grid + scan of every 3D object and 2D entity) plus a **3D-engine re-render** on every mouse-move while you're just nudging a plate in 2D. This build flips the move to **free by default** (Shift = ortho, with a dotted guide line like Revit), makes it **smooth** (raw cursor during the drag — no grid snap, no per-move scan, no 3D dirty), and adds a **soft snap to member faces** so a cleat slides up to a UB web and clicks onto the outer face. On top of that, the Plate tool gains the same **orientation icon row** the members and bolts just got: **Elevation** (free-draw face), **Flat horizontal cleat** (thin strip, thickness = depth), and **Vertical cleat** (thin upright strip, thickness = width) — the three figures in Dan's sketch — with the **12 mm** thickness selector retained. After you draw a plate it **auto-selects** so you can immediately drag it into place.

## Why this matters

Cleat plates — web side plates, fin plates, stiffeners, gusset tabs — are drawn constantly, and the canonical move is "drop a 12 mm cleat, then slide it against the beam web until it lands on the face." Today that move fights the user (ortho-locked, jumpy, laggy, no face snap), which is exactly the kind of friction that sends Dan back to Bluebeam for a small detail. Free smooth dragging with a subtle face snap, plus one-click orientation, makes the cleat workflow a few seconds instead of a fight. Quality bar: **STP Typical Structural Details PDF p85, details 6011.1–6011.6** (cap-plate / baseplate / splice / WSP / tilt-up).

## Confirmed scope (locked 2026-05-31)

**In scope:**
- **Drag overhaul (v2 edit-plate):** whole-plate move is **free by default, Shift = ortho** with a dotted guide line; **smooth** (raw cursor during drag — snapping/grid/3D-dirty suppressed mid-drag); **soft edge-snap** of the dragged plate's bounding edges to nearby member faces (and other plate edges); easier selection (grab a thin cleat anywhere on or near its edge).
- **Corner resize unchanged in spirit:** dragging a vertex stays **ortho by default, Shift = free angle** (the inverse of move — confirmed acceptable, resizing-bigger is the common case).
- **Auto-select after placement:** committing a plate releases the Plate tool and selects the new plate, so it can be dragged immediately.
- **Three orientation presets** as an icon row in the quick-options bar: `elevation` (free-draw face), `h-cleat` (flat horizontal strip), `v-cleat` (vertical strip). Thickness selector kept (default **PL12 / 12 mm**), always enabled.

**Out of scope (defer):**
- 3D-mode plate changes (still the legacy `draw-plate` / `objects3D` path; this is 2D-mode v2 only).
- Hard snap / dimension-driven placement, snap to bolt holes, multi-plate arrays.
- New plate families (chamfered, stiffened) — `plate-flat` only.

**Success criteria:**
1. Arm **Plate** in 2D → three-icon orientation row appears (Elevation / H-cleat / V-cleat); thickness shows 12 mm; console clean.
2. Place each orientation: elevation = free rectangle/polygon; h-cleat = thin horizontal strip of the chosen thickness; v-cleat = thin vertical strip.
3. After placing, the plate is selected; dragging it moves **freely and smoothly** in any direction (no grid hop, no lag).
4. Holding **Shift** while moving locks to horizontal/vertical and shows a **dotted guide line**.
5. Dragging a vertical cleat near a UB web **softly snaps** its near edge to the web face (snap indicator line shows); dragging away releases.
6. Dragging a **corner** still snaps orthogonal by default; Shift frees the angle. Rotate handle still works.
7. Save → reload round-trips; DXF/PDF unaffected.

## Files touched (in released app)

See `02-design.md` for the full table + the exact change contract. Headline: **NEW `js/72d-v25-plate.js`** (orientation catalogue + row, sibling of `72c`), plus surgical edits to `js/v2/tools/edit-plate.js`, `js/v2/engine/event-dispatch.js`, `js/v2/ui/live-render.js`, `js/v2/tools/place-plate-tool.js`, `js/v2/ui/palette-bb-rail.js`, `js/72-v25-options-bar.js`, `index.html`, `CHANGELOG.md`.

## Folder navigation

| File | Purpose |
|---|---|
| `README.md` | this file — start here |
| `01-context.md` | how the v2 plate works today; the precise drag-bug diagnosis; the orientation gap |
| `02-design.md` | the full change contract (drag fix + orientation model), integration points, Files-touched, reused helpers |
| `03-build-plan.md` | phases + progress tracker |
| `04-open-questions.md` | the two decisions (both answered) + minor defaults |

## Decisions (answered 2026-05-31)

- **After placing a plate → auto-select for moving.** The Plate tool releases and the just-placed plate is selected so it can be dragged straight away. Re-click the Plate tile to draw another.
- **Free-vs-Shift scope → whole-plate move only.** Moving is free by default (Shift = ortho + guide). Dragging a corner to resize stays orthogonal by default (Shift = free angle) — the inverse, accepted because "make it bigger" is the common corner action.
