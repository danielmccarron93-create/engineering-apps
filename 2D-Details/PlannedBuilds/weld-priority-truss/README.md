# weld-priority-truss

**Status:** 👀 In review (built + browser-verified 2026-06-05)
**Mode:** 2D (V25 paper-space) only — extends the existing member-to-member joint engine.
**Target user:** A senior structural engineer detailing welded SHS/RHS/CHS (and UB/UC/PFC) trusses to AS 1100 / AS 4100 / AS 1101, where **more than two members meet at a node** and the engineer needs to control which member runs solid and which are cut-and-welded to it.

---

## The ask (Dan, 2026-06-05)

> Make the auto-weld feature handle welded truss connections where more than two members intersect. Double-click a welded member → a dropdown listing its priority (1, 2, 3 …). Priority **1** = the **solid** member; every other member is cut and welded to it. Priority **2** is cut/welded to 1, but where a priority **3** member meets the priority **2** member, the 2 member is solid at that intersection and 3 is cut to it (a cascade). Default priority follows **draw order** (1 = drawn first, 2 = second, 3 = third).

Two clarifications from Dan:
1. **Keep mitre as the default** for a plain 2-member corner — and the dropdown reads **"Mitre, 1, 2 …"**; picking `1` makes that member solid and the other is cut/welded to it.
2. Re-ranking uses **insert-and-shift** (set a member to 2 → it becomes 2, the rest shift down).

---

## What shipped

A per-member integer **`weldPriority`** rank layered over the existing V25 joint engine (`js/23a-shs-joints.js`). Lower number = higher priority = more solid (runs through). At any joint a member is cut by **every neighbour that strictly out-ranks it**; a **through-chord is always a cutter** (a member can never run solid *through* a chord — it physically can't be split). The user's cascade falls straight out of this rule.

- **Default = draw order, free.** `rankKey = weldPriority ?? (1e6 + id)`, and `id` is `ent2dIdN++` (draw order), so "first-drawn = priority 1" needs zero config.
- **Plain 2-member corner** with no ranks = **mitre** (byte-identical to before).
- **Old saves** carrying `priorityForPairV25` / `mitrePairs` render **byte-identical** (legacy precedence mode); the new draw-order cascade only applies to legacy-clean nodes.
- **UI:** double-click a welded member's body **or** its joint node → a floating popup with **"Run through (make solid)"**, a **`[Mitre, 1..N]`** dropdown, and a live list of every member in the connected weld group badged **SOLID / MITRE / CUT**. The same Rank dropdown is in the inspector. Re-rank = insert-and-shift across the connected component, materialising `1..N`, as **one atomic undo**.
- **Quality:** a multi-cutter cut face (e.g. priority-3 cut by both the chord *and* priority-2) renders as a **kinked poly-cap** that follows both faces, with the fillet-weld hatch tracking each segment — instead of a straight chord that would mis-draw the member by ~20 mm at the notch.

See [`02-design.md`](02-design.md) for the data model, cut-logic, UI, and risk register; [`03-progress.md`](03-progress.md) for the phase-by-phase build + verification log.

---

## Deferred (documented, not silently dropped)

- **DXF export of the trimmed outline.** `js/45-dxf-export.js` emits the *untrimmed* member rectangle today (it predates this feature and already ignores `priorityForPairV25`). Out of scope here (CLAUDE.md rule 9: bug fixes don't bundle with features). PDF is fine — it re-uses the canvas `drawMem2D` path.
- **Full AS 1101 weld symbol** at cut interfaces. The weld is shown as the existing AS 1101.3 fillet **hatch** (consistent with how the app shows every other auto-weld), now correctly following the kinked cap. A leadered weld-symbol-with-leg-size is a separate enhancement.
- **3D mode.** The 3D joint-priority path (`effectiveShsPriority`, `showJointPopup`, `_computeEndCut`) is untouched and still uses its own size-based priority + ↑/↓ boost popup. This feature is 2D-only (where trusses are drawn in this app).
