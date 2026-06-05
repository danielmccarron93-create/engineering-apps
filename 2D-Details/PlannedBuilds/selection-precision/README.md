# Selection precision — click the thing you can see

Status: ✅ Built + adversarially reviewed + browser-verified (2026-06-04) — awaiting Dan's review/commit
Last touched: 2026-06-04
Owner: Dan McCarron
Scope: 2D-mode (V25 paper-space) pick only. Replace the axis-aligned-bounding-box + paint-order pick with a precise, specificity-ranked hit-test so clicking a small entity that sits on top of a big filled member/plate selects the small entity. Fold v2 plates into the same ranked stack. 3D-mode pick is untouched.

---

## TL;DR

**The bug.** In 2D mode, when a small entity (an HBS screw) sits on top of a big filled member (a timber post `mem2`) plus a plate, clicking *directly on the screw* selects the plate or the timber instead. Two compounding causes:

1. **The v1 2D pick tests axis-aligned bounding boxes (AABBs), not real geometry, and ranks purely by paint order.** A big member's AABB contains the cursor just as much as a tiny screw's does, and the newest-painted entity wins. (`v25HitTestStack` generic push, `js/71-v25-selection.js:323-338`.)
2. **v2 plates are picked by a *separate*, earlier, capture-phase listener that suppresses v1's pick entirely.** The v2 dispatcher binds `pointerdown` in capture phase and calls `preventDefault()` when the plate edit tool claims the click (`js/v2/engine/event-dispatch.js:199-201`); `editPlate.onPointerDown` claims a plain body/edge click whenever the cursor is inside any plate polygon (`js/v2/tools/edit-plate.js:545-580`). So for any click over a plate, v1's ranked stack never even runs — the plate wins by event phase.

**The fix (three parts that must land together).**
- **(1) Precise per-entity hit returning a SCORE.** A new `v25EntHit(blk, ent, cursorPx, ctx)` helper returns `{ precise, score }` (or `null` for a miss). Linear/point entities (screw, bolt2, leader2, dim2, line/lineSet, reoBar, anchor, noteBox arrow) score by CSS-px distance to the actual drawn stroke/centreline/point (smaller wins). Area/filled entities (mem2/timber, v2 plate, mat, blockWall, frame border, mesh, noteBox body) score by polygon area in real-mm² (smaller wins).
- **(2) Rank the stack by specificity then paint-order.** `v25HitTestStack` collects one `{ent, precise, score, idx}` candidate per entity under the cursor, then **stable-sorts**: `precise` DESC (true first) → `score` ASC → original array index DESC. `stack[0]` is the tightest target. `v25HitTest` stays a thin `stack[0]` wrapper — signature unchanged.
- **(3) Fold v2 plates into the SAME ranked stack.** Enumerate `v2.appState.model.elements` directly (not the transient mirrors), add a `precise:false` area candidate per plate, and make `editPlate.onPointerDown` **stop eagerly claiming plain body/edge clicks** so v1's one ranked decision is authoritative. When a plate wins in v1, v1 calls a new `editPlate.beginBodyDragFromExternalSelect(...)` so drag still works.

Net result: click on screw → screw (precise, tiny score) wins; click bare timber → only the timber polygon contains the cursor → timber; repeat-click cycles outward screw → plate → timber via the **existing** cycle code (unchanged).

**Model.** This is the Revit / Bluebeam selection feel: hover/click resolves to the *most specific* thing under the cursor, and repeat-clicking the same spot tunnels to what's behind. The repeat-click cycle already exists and works (`js/39-events.js:272-283`); this build only changes the *order* the stack comes out in, plus adds plates as members of that stack.

**Deferred (do NOT build now):** hover pre-highlight. Once the ranking lands, `v25HoverPick` will start returning the tightest target under an idle cursor — that side-effect is acceptable and arguably desired, but building a richer hover (glow the would-be pick before click) is a separate follow-up. See `02-design.md` § Deferred.

---

## Files touched (released app)

| File | Change |
|---|---|
| `js/71-v25-selection.js` | **All net-new code lives here.** Add `v25EntHit(blk, ent, cursorPx, ctx)` precise+scored helper; add a v2-plate enumerator; rework `v25HitTestStack` to collect `{ent,precise,score,idx}` candidates (keeping the existing PASS0 arrowhead + leader2 + dim2 precise branches, now assigning them scores) and stable-sort; keep `v25HitTest` as `stack[0]`. Well under 150 net-new lines — extends an existing concept, **no new file**. |
| `js/39-events.js` | The 2D select mousedown (`:285-303`) gains a plate-vs-v1 branch: when `stack[0]` is a plate candidate, write `window.v25SelPlateIds` (+ clear `v25Selected`, set `editPlate.state.selectedId`, call `beginBodyDragFromExternalSelect`); when a v1 entity wins, clear `window.v25SelPlateIds` + `editPlate.state.selectedId`. Empty-space path (`:323-333`) clears both stores. The repeat-click cycle-resolve at mouseup (`:1439-1452`) and the cycle continuity test (`:272-281`) must resolve plate ids too. |
| `js/v2/tools/edit-plate.js` | `onPointerDown` priority-4 (plain body/edge) returns `false` (defer to v1's ranked stack) instead of claiming. Priorities 1 (rotation handle), 2 (Shift multi-select), 3 (corner/vertex resize) keep claiming. Add export `beginBodyDragFromExternalSelect(elementId, cursorWorld, dupModifier)` that arms `state.bodyDrag` + dual selection stores + group hooks exactly as the old priority-4 path did. |
| `CHANGELOG.md` | One line: 2D-mode selection now picks the most specific entity under the cursor (screw on a member/plate selects the screw); plates join the click-cycle. |

No `index.html`, no `css/styles.css`, no catalogue, no 3D file.

---

## Navigation

- `01-context.md` — the bug in detail, the dual root cause, the Revit/Bluebeam model, why AABB+paint-order fails.
- `02-design.md` — the per-type hit table, the exact scoring + stable-sort rule, the v2-plate fold, the selection-state writes, the "Files touched" list, what's deferred, and the explicit "do not touch 3D pick" note.
- `03-test-cases.md` — numbered manual test cases: screw-on-timber-under-plate, click bare timber, repeat-click cycle order, every existing entity type still selectable, plate drag still works, deselect, right-click parity.

## Status

Plan locked. No open questions (the one judgement call — filled-closed `lineSet` grabbing on its interior — is decided in `02-design.md` § Open judgement calls as "stroke-only for now"). Ready for a build chat pointed at this folder + the project root.
