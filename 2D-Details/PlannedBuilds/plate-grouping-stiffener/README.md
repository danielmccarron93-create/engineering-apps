# Plate grouping · joint weld/bolt menu · stiffener tool

**Status:** ✅ BUILT & headless-verified (2026-06-01) — ready for Dan's browser review. See `03-progress.md`.
**Mode scope:** 2D paper-space only (confirmed with Dan — plates already live only in 2D; the iso/3D stiffener is explicitly out of scope).
**Goal:** Let Dan draw the sketched detail end-to-end — a horizontal UB, an SHS column welded to an end plate, the end-plate/column assembly grouped and dropped onto the UB top flange, two M20 bolts at 50 mm from each column face through the end plate + flange, and a full-depth web stiffener under the column.

This is one consolidated build covering three related sub-features. They share heavily-overlapping files (selection, options bar, BB-rail, dispatch, events), so the build is **sequential**, not parallel.

## The three sub-features

1. **Cross-system grouping** — select any mix of v25 entities (mem2, bolt2, weld, stiff2…) + v2 plates, `Ctrl+G` / right-click → Group; `Ctrl+Shift+G` / right-click → Ungroup. Grouped items move together. New `groupId` field on both entity kinds.
2. **Joint weld/bolt menu** — when a grouped assembly is moved so an end plate snaps onto a non-group member's flange, that interface becomes a **joint** (default = **no weld**). Double-click / right-click the joint → dropdown: **Weld together** (weld lines) or **Bolt together** (two real M20 bolt2 entities at 50 mm from each column face, through plate + flange).
3. **Stiffener tool** — new BB-rail tile (custom icon). Click to place a full-depth web stiffener (10 mm, weld both sides) that subtly snaps to the nearest column centreline (or under the column end when hovering near it). Live preview; Shift = free placement; drag an end handle to shorten (ortho by default, Shift = angle).

## Decisions locked with Dan (2026-05-31)
- **Mode scope:** 2D paper-space only.
- **"Bolt together" bolts:** real, individually-selectable `bolt2` entities tagged to the joint (move with the group; removed if the joint switches to weld/none).
- **Grouping breadth:** general — any multi-selection can be grouped.

## Files
See `02-design.md` "Files touched" for the authoritative list and per-file integration points.

## Reference quality bar
STP 6011-series details. The end-plate/column/UB/bolt/stiffener detail must read at least as cleanly: AS 1100 lineweights, correct hatch, weld ticks where welded, bolts in true section.
