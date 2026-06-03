# 04 — Open questions

Both decisions answered in the planning chat (2026-05-31). **Nothing blocking.**

## Answered

- **Q1. After placing a plate — stay armed, or auto-select for moving?**
  → **Auto-select for moving.** Committing a plate releases the Plate tool and selects the new plate, so it can be dragged into place immediately. Re-click the Plate tile to draw another. (Directly addresses "laggy/hard to select after I draw them and try to move" — no Esc needed.)

- **Q2. Does "free unless Shift = ortho" apply to resizing a corner too, or just moving the whole plate?**
  → **Whole-plate move only.** Moving is free by default (Shift = ortho + dotted guide). Dragging a **corner** to resize stays **orthogonal by default, Shift = free angle** — the inverse of move, accepted because resizing-bigger is the common corner action and angled node-drags are rare.

## Carries a recommended default (no input needed; revisit only if it bites)

- **Snap targets while moving.** Member faces (`mem2` via `getV25EntSnapEdges`) **and** other v2 plate edges, plus projected 3D members if any `objects3D` exist. Grid snap is intentionally **off** during a move (the user wants smooth free motion); the soft face-snap is the only catch. Tolerance ≈ 10 screen-px (zoom-independent).
- **Snap is soft / one-shot per axis.** Closest face within tolerance wins per axis; moving away releases. (The `12-edge-snap.js` hysteresis model is available if a future pass wants stickier snapping, but one-shot reads as "subtle" per the brief.)
- **Elevation icon styling.** A face-on square with short weld ticks down the left edge, echoing the sketch — single-stroke, AS 1100 weight, consistent with the other `icon-orient-*` glyphs.
- **Default orientation when arming Plate.** `elevation` (face-on) — the most common and equivalent to today's free-draw default.
- **Thickness selector for `elevation`.** Kept visible and **enabled** (the user wants to always be able to set it); it's simply inert for a face-on plate (into-page metadata) and drives the strip dimension for the two cleats.
