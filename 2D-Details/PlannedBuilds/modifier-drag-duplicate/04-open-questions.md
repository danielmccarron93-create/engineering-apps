# 04 — Open questions

All resolved in the plan chat (2026-06-02). Nothing blocking the build.

---

### Q1 — Modifier key? ✅ RESOLVED
**Decision:** Both Alt and Ctrl, implemented as **Alt on all platforms + Ctrl on
Windows/Linux only**. Avoids the macOS Ctrl-click = right-click conflict (which would
fight the Group/Joint context menu at `js/39-events.js:1646`) while giving Dan exact
Bluebeam Ctrl-drag at the office on Windows. One-line opt-in to also enable Ctrl-drag on
Mac is documented in `02-design.md` (not default).

### Q2 — Coverage? ✅ RESOLVED
**Decision:** All three pipelines — v25 2D entities, v2 plates, 3D-mode objects.

### Q3 — Copy on press or on drag? ✅ RESOLVED (recommended default)
**Decision:** On **first movement**. A modifier-click without dragging selects normally
and makes no copy. Cleaner than cloning on press (no stacked junk, no undo-stack churn).

### Q4 — Undo granularity? ✅ RESOLVED (recommended default)
**Decision:** One Ctrl+Z removes the copy and restores the pre-drag state. For v25 and 3D,
record a single add-style undo at mouseup and suppress the move-undo for a dup drag. For
v2 plates, the `placeElement` + body-move produce **two** undo steps in v1 — acceptable;
coalescing into one is a noted nicety, not required for ship.

---

## Noted limitations / decisions deferred to a follow-up (not blocking)

- **Cross-system grouped assemblies.** A group mixing a v25 member **and** a v2 plate
  duplicating as one re-linked unit is genuinely hard (two stores, two id systems, re-link
  the clone group across both). v1 duplicates within each store; the mixed case is a
  documented follow-up. If Dan hits this in practice, it becomes its own small idea.
- **Plate dup = two undo steps** (see Q4) — coalesce later if it annoys.
- **Continuous duplicate** (Bluebeam keeps copying the just-dropped copy) should work for
  free since the copy is selected on release — verify the feel in Phase 4; no code planned.
