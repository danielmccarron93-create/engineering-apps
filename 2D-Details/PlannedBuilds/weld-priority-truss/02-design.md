# weld-priority-truss — design

## 1. Data model

- **`ent.weldPriority`** — optional positive integer on a `mem2` entity. `1` = highest = solid/through; lower wins. Absent = implicit draw-order rank. Round-trips automatically inside `entities2D` JSON (no save/load change needed).
- **rankKey** (the single source of truth for cut decisions, in `js/23a-shs-joints.js`):
  ```js
  v25WeldRankKey(ent) = (typeof ent.weldPriority==='number' && isFinite && >=1)
                        ? Math.floor(ent.weldPriority)
                        : 1e6 + (ent.id||0);   // implicit draw-order (lower id = earlier = higher priority)
  ```
  `wp` must be `>= 1` to count — `0`/negative/NaN/string fall through to the draw-order default (hardening against a bad save inverting the cascade).
- **Connected weld component** — the connected component of the V25 joint graph (members transitively sharing a joint; through-members included so a chord links all its panels). Built by union-find in `_v25BuildComponents(viewKey)` and cached in `_v25CompCache` (cleared alongside the joint cache).
- **Precedence mode** per component (`_v25NodePriorityMode(joint, viewKey)` → `'rank' | 'legacy' | 'default'`):
  1. any member has explicit `weldPriority>=1` → **rank** (cut purely from rankKey; legacy maps ignored).
  2. else any pair in the component has a `priorityForPairV25`/`mitrePairs` entry → **legacy** (original per-pair logic, byte-identical to old saves).
  3. else → **default** (the new draw-order cascade; the *only* case where a previously-untrimmed 3+ node starts auto-cutting).

**Deviation from the original plan (intentional, cleaner):** the write helpers do **not** delete legacy `priorityForPairV25`/`mitrePairs` on migration. Precedence (`rank` mode ignores them) makes them inert, which (a) keeps undo trivially clean — only `weldPriority` is snapshotted — and (b) means *undoing* a rank edit on an old save restores its exact legacy rendering for free.

## 2. Cut logic — `_computeEndCutV25` (rewritten cutter-selection block only)

The geometry primitives (`_computeButtCutV25`, `_faceCutLineV25`, `_projectV25OutlineIntoLocal`, the mitre bisector tail) are **unchanged**. Only *which neighbours are cutters* changed:

```
mode = _v25NodePriorityMode(joint, M.view)
throughs            = neighbours with role 'through'
endpointNeighbours  = neighbours with role != 'through'

if mode === 'legacy':   <original priorityForPairV25 / mitrePairs / single-endpoint-mitre logic, verbatim>
else:  // 'rank' or 'default' (one path — rankKey internally reads explicit-or-draw-order)
    mitrePartner = (mode==='default' && exactly 1 endpoint neighbour && no through)  ? that neighbour : null
    if !mitrePartner:
        cutters = endpointNeighbours where rankKey(n) < rankKey(M)      // strictly higher priority cuts M
                + ALL throughs                                          // a chord always cuts (can't be split)
    if !mitrePartner && !cutters: return null                          // M is strict-min rank → runs through
```

Then the kept tail: `mitrePartner && !cutters` → bisector mitre; else `_computeButtCutV25(M, cutters, …)`.

The **cascade** is emergent: chord(rank 1) runs through; diag-2 cut to chord; diag-3 (rank 3) is cut by *both* the chord and diag-2 (strictly-higher), and `_computeButtCutV25` already composes N cutters by taking the most-restrictive `uAtV` per depth.

**Multi-cutter poly-cap:** `_computeButtCutV25` now also returns `kinks[]` — the interior depth-values where the dominant cutter line switches (crossings that lie on the min/max envelope). `drawMem2D` samples the cut at `+hd, …kinks…, -hd` (`_v25CapPts`) to draw a kinked fill + cap stroke, and `_drawCapWeld` hatches each segment. Single-cutter / mitre caps yield 2 points (identical to the old straight cap).

## 3. UI

- **`v25OpenWeldPriorityPopup(ent, viewKey, x, y)`** (`js/68`, mirrors `v25OpenEndCapPopup`): "Run through (make solid)" button → rank 1; `[Mitre?, 1..N]` `<select>`; live component list badged SOLID/MITRE/CUT (computed by dry-running the cut — read-only). Stays open on change; closes on outside-click / Esc.
- **Double-click** (`js/39`, handler #1): a welded member's **mid-body** (gated `v25HitMemberEnd===null && v25IsMemberWelded`) opens the popup. End clicks still open the end-cap popup; the **joint-node** double-click (handler #2 → `showJointPopupV25`, now a thin delegate to the popup) opens the same surface.
- **Inspector** (`js/71` `v25UpdateInspector`): a "Weld priority" section (Rank `<select>` + "Resolved" read-out) when the member is welded. The field renderer honours an explicit `f.value` (so the select shows the resolved 1..N position even for an implicit member); the input listener special-cases `weldPriority` **before** the generic `ent[k]=val` (maps `'mitre'`→`v25SetCornerMitre`, `N`→`v25AssignRankInsertShift`, then returns).
- **Re-rank = insert-and-shift** over the component (`v25AssignRankInsertShift`): materialises `1..N`, pushes **one** `v25EntFields` undo record covering every touched member, then `invalidateWeldCache()` + `requestRender()`.

## 4. Files touched (released app)

| File | Change |
|---|---|
| `js/23a-shs-joints.js` | rankKey + component cache + 9 read helpers; 3 write helpers + undo push; `_computeEndCutV25` cutter block rewrite; `_computeButtCutV25` kinks; `showJointPopupV25` → delegate; deleted `_renderJointPopupV25` / `_v25EnterPickPriority` / `_v25PickPriorityCleanup`. |
| `js/68-v25-tools.js` | `v25OpenWeldPriorityPopup` + singleton/handlers; `_v25CapPts`; `_drawCapWeld` poly-cap; 4 `drawMem2D` elevation branches use poly-cap fill/stroke/weld. |
| `js/39-events.js` | dblclick handler #1 — welded-member mid-body branch. |
| `js/71-v25-selection.js` | inspector "Weld priority" section + `f.value` renderer override + `weldPriority` apply special-case. |
| `js/05-state.js` | `undo()` + `redo()` `v25EntFields` branches (atomic per-component weldPriority restore). |
| `CHANGELOG.md` | one entry. |
| **No change:** | `js/46-save-load.js`, `js/50-project.js`, `js/44-pdf-export.js` (all automatic); `js/45-dxf-export.js` (untrimmed — documented deferral); `js/59-inspector.js` (that's the 3D inspector). |

## 5. Risk register (resolved)

| Risk | Resolution |
|---|---|
| Multi-cutter straight cap mis-draws (~20 mm at the notch) | `kinks[]` + `_v25CapPts` poly-cap on all 4 branches; verified diag-3 cap = `[(86.6,50),(55,-5),(71.4,-50)]`. |
| Through-chord with a *worse* rank than a diagonal → two overlapping solids | Through-chords are **unconditional cutters**; verified a rank-1 diagonal landing on a chord is still `CUT`. |
| `weldPriority` vs legacy `priorityForPairV25` dual authority | One-directional precedence via `_v25NodePriorityMode`; legacy honoured byte-identical until any explicit rank exists. |
| Insert-shift renumbers far-away members | Component-scoped; verified disjoint components stay isolated; one-click "Run through" + badges make the result legible; atomic single-undo. |
| New default silently re-cuts old saves | Gated to legacy-clean nodes; legacy nodes byte-identical (test T7). The one intended change: previously-untrimmed 3+ nodes now auto-cascade by draw order. |
| Cache coherence (stale trims after a rank edit) | every write helper calls `invalidateWeldCache()` (cascades to V25 joint + component caches) + `requestRender()`. |
| `ent2dIdN` not rehydrated on load → draw-order unsound | Already handled (`js/46:loadProject` + per-sheet `js/05`). No change. |
| Inspector edited in wrong file | Row is in `js/71` `v25UpdateInspector` (the mem2 inspector), not `js/59` (3D). |
