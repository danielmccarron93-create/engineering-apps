# 02 — Design: precise scored hit-test + v2-plate fold

This is the authoritative spec. The build chat follows this without re-reading every file.

---

## A. The scoring model (authoritative — every entity uses this)

Each candidate under the cursor produces `{ ent, precise:boolean, score:number }`.

- **LINEAR / POINT entities** — `precise = true`, `score =` distance in **CSS px** from the cursor to the actual drawn stroke / centreline / point (smaller = better). Types: `screw`, `bolt2`, `line` / `lineSet`, `leader2`, `dim2`, `reoBar`, `anchor`, noteBox arrow/leader.
- **AREA / FILLED entities** — `precise = false`, `score =` polygon **area in real-mm²** (smaller = better). Types: `mem2` (incl. timber), v2 **plate**, `mat`, `blockWall`, `frame` (border — special, see table), `mesh`, noteBox **body**, `stiff2`, `txtBox`.

### The sort (stable, deterministic)

```
precise DESC  (true before false)
  → score ASC (smaller first)
    → original array index DESC (topmost / newest paint order wins ties)
```

Critical: **`precise` is compared FIRST.** A px distance (~3) and a mm² area (~10000) are *never* compared against each other, because any precise hit sorts ahead of any area hit before scores are ever looked at. Only compare `score` within the same `precise` class.

Use a **stable sort** AND fold the original index into the comparator as the final tie-break (do not rely on engine stability alone for ties). The "original array index" is the entity's index in `entities2D[viewKey]` (paint order) — captured when the candidate is built, **not** the reverse-loop counter and **not** push order. This is what makes the cycle deterministic (see § F).

### AABB pre-filter (keep for perf)

`v25EntBounds(ent)` stays as a **cheap pre-filter only**: run the precise `v25EntHit` test for an entity **only when the cursor is inside its bbox + tolerance**. Do not delete `v25EntBounds` — it's also used by `v25ScrewBearingFace`/`v25BoltClampSpan` (mem2 elevation transverse extent), the highlight renderer, snap, and the marquee. For the few types whose bbox *is* their true shape (anchor, txtBox, blockWall elevation, mesh, mem2 'sec' square), the pre-filter and the precise test coincide — that's fine, the area score is still new.

---

## B. Per-type hit table

`ppmm = viewport.zoom / drawingScale` (px per real-mm). `cursorPx = real2px(blk, u, v)`. `real2Px(uu,vv) = real2px(blk, uu, vv)`. `distToSegPx` = the existing px point-to-segment closure (`js/71:239-246`), reused / lifted into `v25EntHit`. `_v25dPointInPoly(u,v,poly)` and `_v25dDistToSeg` are global (`js/72h:54,66`); `_v25dPointInPoly` takes `[{u,v}]`. A `FLOOR_PX ≈ 5` floors linear tolerances so a hairline glyph stays grabbable at low zoom (mirrors `LINE_TOL_PX = cap(4,20)`).

| Entity type | Geometry kind | precise | Score basis | World-geometry recipe / helper |
|---|---|:--:|---|---|
| **mem2** (timber post / steel member, elevation) | area | **false** | polygon **area mm²** (smaller wins) | `v25Mem2WorldOutline(ent)` (`js/68:1516`) → 4 world pts `[[u,v]…]`; `_v25dPointInPoly` for contains; area = shoelace. The big filled offender — this is what the screw must beat. |
| **mem2** (cross-section, `aspect:'sec'`) | area | **false** | area mm² = `(2·v25Mem2HalfDepth)²` | Same `v25Mem2WorldOutline` returns the depth×depth square; contains + area. |
| **v2 plate** (`category:'plate'`, `params.v2Source==='place-plate-tool'`) | area | **false** | polygon **area mm²** via shoelace on `geometry.polygon` | Enumerate `v2.appState.model.elements` (see § C). Build `[{u,v}]` = `polygon.map(p=>({u:+p.x||0, v:+p.y||0}))`; `_v25dPointInPoly`. Synthetic `ent.id = 'v2plate-'+el.id`, `_v2Plate:true`, `_v2Id:el.id`, `type:'plate2'`. |
| **screw** (section: `h-headL`/`h-headR`/`v-headT`/`v-headB`) | stroke | **true** | px dist to drawn **centreline** segment | Recompute the draw-time offset EXACTLY (recipe § D.1). Needs `blk` → `v25ScrewBearingFace(blk,ent)`. `distToSegPx(cursorPx, P0px, P1px)`. Transverse tol = `max(FLOOR_PX, (S.dK/2)*ppmm)`. |
| **screw** (end-on, `orient:'end'`) | point | **true** | px dist to head centre `real2px(blk,ent.u,ent.v)` | Radial: `score = hypot(cursorPx − cpx)`; accept `< (S.dK/2)*ppmm + tol`. NOT a segment. |
| **bolt2** (section: `h-nutR`/`h-nutL`/`v-nutB`/`v-nutT`) | stroke | **true** | px dist to drawn **centreline** segment | Recompute via `v25BoltClampSpan(blk,ent)` (recipe § D.2). Transverse tol = `max(FLOOR_PX, (b.washOD/2)*ppmm)`. |
| **bolt2** (end-on, `orient:'end'`) | point | **true** | px dist to centre `real2px(blk,ent.u,ent.v)` | Radial: accept `< (b.washOD/2)*ppmm + tol`. |
| **leader2** | stroke | **true** | px: dist to text-anchor box OR perpendicular dist to leader line | **ALREADY PRECISE** (`js/71:267-282`). Keep the exact accept geometry; emit the computed distance as `score`. |
| **dim2** | stroke | **true** | px: min of {dim line, 2 witness lines} or label-box anchor dist | **ALREADY PRECISE** (`js/71:285-303`) via `dim2DimLinePx`. Emit the min distance as `score`. |
| **lineSet** / **line** | stroke | **true** | min px dist to any polyline segment (honour `ent.closed` for the closing edge) | `distToSegPx` over consecutive `real2px(pts[i])`. (Filled-closed: stroke-only — see § Open judgement calls.) |
| **reoBar** (polyline run) | stroke | **true** | min px dist to any bar segment | `distToSegPx` over `ent.pts`. Single-point → hypot. |
| **reoBar** (`sectionDot`) | point | **true** | px dist to dot `pts[0]` | Radial; accept `< 15*ppmm` (matches the ±15 bbox). |
| **anchor** | point/stroke | **true** | px dist to the shaft centreline `[(u,v)…(u,v−embed)]` | `distToSegPx` to the vertical shaft segment. (Scout 1 offered area-of-bbox as a fallback; the linear shaft is cleaner and matches the glyph — use it.) |
| **noteBox** — arrow/leader | stroke | **true** | px ≈ tip distance (PASS0) / min dist to leader segment (PASS1) | **ALREADY PRECISE** (`js/71:248-260, 309-320`) via `nbLeaderPoints`. Emit `score`. This is the candidate that keeps arrow-tip priority. |
| **noteBox** — body | area | **false** | area mm² of `nbBounds(ent)` rect | Second candidate for the same ent; dedup keeps the **better-ranked** one (§ E). |
| **mat** (rect) | area | **false** | area mm² = `w·h` | Build the rotated 4-corner polygon (reuse the corner loop at `v25EntBounds:29-37`) but keep it a polygon; `_v25dPointInPoly`. |
| **mat** (poly) | area | **false** | area mm² via shoelace | Rotate `ent.pts` about `_v25MatCentroid(ent)` if `ent.rot`; `_v25dPointInPoly` on the real polygon. |
| **blockWall** (elevation) | area | **false** | area mm² = `lengthMM·heightMM` | No rotation → bbox IS the shape; rect contains; area score is the only new bit. |
| **blockWall** (section strip) | area | **false** | area mm² = `lengthMM·thk` | Build the rotated thin strip (reuse `v25EntBounds:48-53`) as a polygon; `_v25dPointInPoly`. |
| **frame** (detail frame — BORDER only) | special (linear) | **true** | px dist to nearest of the 4 border edges | **PRESERVE border-only semantics** (`js/71:331-336`): reject the interior. Express the border as a linear candidate (min `distToSegPx` to the 4 edge segments) so a click ON the border ranks against everything, but the interior falls through to members drawn inside the frame. |
| **mesh** | area | **false** | area mm² = `w·h` | No rotation; rect contains. |
| **stiff2** (web stiffener) | area | **false** | area mm² of the stiffener quad (shoelace) | True quad via `stiffCorners` if exported (`js/72e`); else `_v25dPointInPoly` on `v25StiffBounds` bbox as fallback (precise=false). |
| **jweld** (weld run) | stroke | **true** | px dist to the weld segment `(u1,v1)→(u2,v2)` | `distToSegPx`; pre-filter with `v25JWeldBounds`. |
| **txtBox** | area | **false** | area mm² = `200·35` (hardcoded placeholder box) | No glyph metrics; bbox IS the shape; `_v25dPointInPoly` on the box. |

Notes on the round glyphs (screw/bolt **end-on**): use a **radial** point-distance test, not bbox containment, so a click on a bbox corner *outside* the visible circle does not win. The accept radius is the outer drawn ring (`dK/2` screw, `washOD/2` bolt).

---

## C. Folding v2 plates into the stack

### C.1 Enumerate the model directly (NOT the mirrors)

There are transient `_v2Mirror` `type:'plate2'` entries in `entities2D` (`js/v2/engine/v1-bridge.js:189-202`), but **do not hit-test them**: they're stripped + rebuilt on every `syncFromV1` (`:230, 244`) so their identity is unstable, `v25EntBounds` has no `plate2` branch, and the PASS1 loop's `if (!ent._v25) continue` guard skips them anyway. Enumerate the **source of truth** exactly as `_v25DepthMembersInView` does (`js/72h:136-150`):

```
const model = (v2 && v2.appState && v2.appState.model) ? v2.appState.model : null;
if (model && model.elements && model.elements.forEach) {
  model.elements.forEach(el => {
    if (!el || el.category !== 'plate') return;
    if (!el.params || el.params.v2Source !== 'place-plate-tool') return;   // matches eachV2Plate + the mirror guard
    const g = el.geometry;
    if (!g || g.kind !== 'region' || !Array.isArray(g.polygon) || g.polygon.length < 3) return;
    const m = /^v1-view-(.+)$/.exec(typeof g.viewId === 'string' ? g.viewId : '');
    if (!m || m[1] !== blk.viewKey) return;
    const poly = g.polygon.map(p => ({ u: (+p.x || 0), v: (+p.y || 0) }));   // x→u, y→v (same axes)
    // bbox pre-filter, then _v25dPointInPoly(u, v, poly); if inside, push candidate:
    //   { ent: { id:'v2plate-'+el.id, _v2Plate:true, _v2Id:el.id, type:'plate2' },
    //     precise:false, score: shoelaceArea(poly), idx: <large, so plates tie-break after v1 ents OR by area> }
  });
}
```

**Field-name trap:** v2 polygons are `[{x,y}]`; the v1 stack works in `[{u,v}]`. Build `[{u,v}]` and feed `_v25dPointInPoly` (the `[{u,v}]` flavour). Do NOT mix `editPlate.pointInPolygon` (`[{x,y}]`) with a `[{u,v}]` array — the inside test silently always-returns-false.

**Idx for plates:** plates have no `entities2D` index. Give them a deterministic synthetic idx so the final tie-break is stable — e.g. `idx = arr.length + (plate enumeration order)`, or simply rely on area-ASC then a stable secondary (plate insertion order from the Map, which is stable per session). The score (area) already separates a plate from a member of different size; idx only matters for *exact* area ties, which are vanishingly rare. Just make it reproducible.

### C.2 Stop editPlate eagerly claiming the plain body/edge click

In `js/v2/tools/edit-plate.js onPointerDown`, the **priority-4** block (`:542-580`, body OR non-corner edge → move) currently sets the stores, arms `state.bodyDrag`, and `return true`. Change it to **`return false`** for the plain (no-modifier) body/edge case — do NOT arm `bodyDrag`, do NOT set `v25SelPlateIds` there. Keep:

- **Priority 1** rotation handle (`:453-475`) → `return true` (precise edit affordance, must beat everything).
- **Priority 2** Shift multi-select (`:483-499`) → `return true`.
- **Priority 3** corner/vertex resize (`:509-540`) → `return true`.
- The **empty-click** tail (`:582-585`) — once priority-4 defers, this no longer runs for the plain-body-hit case; v1 now owns clearing on empty space (§ E). Leave the empty tail as-is for the no-hit-at-all path it still handles, but v1 must independently clear `v25SelPlateIds` on its empty path (it's authoritative now).
- `onPointerMove` / `onPointerUp` during an **in-flight drag** (`state.bodyDrag`/`dragging`/`edgeDrag`/`rotateDrag`) MUST keep claiming + stopping propagation, or a live plate drag leaks into v1 mousemove.

### C.3 New export: `beginBodyDragFromExternalSelect(elementId, cursorWorld, dupModifier)`

When v1's ranked stack picks a plate, v1 has consumed the click but `editPlate` never armed the drag. Provide this export (mirror the old priority-4 body path, `:558-577`):

```
beginBodyDragFromExternalSelect(elementId, cursorWorld, dupModifier) {
  const el = v2.appState.model.elements.get(elementId);
  if (!el || !el.geometry || !Array.isArray(el.geometry.polygon)) return false;
  state.selectedId = elementId;
  window.v25SelPlateIds = [elementId];
  state.bodyDrag = {
    elementId, origPolygon: el.geometry.polygon.slice(),
    anchorWorld: { u: cursorWorld.u, v: cursorWorld.v },
    currentDelta: { u: 0, v: 0 }, orthoAxis: null, snapLines: null,
    dupPending: !!dupModifier,
  };
  if (!dupModifier) {
    if (window.v25GroupOnPlateSelected) window.v25GroupOnPlateSelected(elementId);
    if (window.v25GroupOnPlateDragBegin) window.v25GroupOnPlateDragBegin(elementId);
    if (window.v25GroupOnPlateMoveUndoBegin) window.v25GroupOnPlateMoveUndoBegin(elementId);
  }
  return true;
}
```

The **subsequent** capture-phase `pointermove`/`pointerup` already see `state.bodyDrag` and drive the move + commit + group/undo logic unchanged. So: **selection decision moves to v1; drag execution stays 100 % in editPlate.** Group/joint side-effects and the Alt/Ctrl copy-drag (`dupPending`) are preserved because the hooks + dup flag are re-run here. Pass `dupModifier = window.isDupDragModifier(event)` from the v1 call site.

---

## D. Fastener centreline recipes (the offset detail)

The whole reason the precise test must live in `v25HitTestStack` (which has `blk`) and not `v25EntBounds` (which doesn't): the drawn centreline is anchored at the **detected bearing/clamp face**, not at `ent.u/ent.v`.

### D.1 Screw section centreline (mirror `drawScrew2D_Section`, `js/72i:275-329`)

```
axisIsU = (orient === 'h-headL' || orient === 'h-headR');
bodyDir = (orient === 'h-headL' || orient === 'v-headB') ? 1 : -1;
trans   = axisIsU ? ent.v : ent.u;                         // transverse coord — NOT offset
S = getScrewSpec(ent.screwSpec) || HBS_PLATE_SCREWS[ent.screwSpec] || {d:10,dK:16.5,tK:5.0,L:120};
d = S.d||10; tK = S.tK || d*0.56; L = S.L || d*12;
headLen = 1.80*d;                                          // SCREW_GEOM.headLenNorm*d
sBear   = Math.min(tK, headLen*0.45);
bearing  = v25ScrewBearingFace(blk, ent);                  // <-- needs blk; null for 'end'
junction = (bearing != null) ? bearing : (axisIsU ? ent.u : ent.v);
axisAt = (s) => junction + bodyDir*(s - sBear);
a0 = axisAt(-2); aL = axisAt(L+2);                         // exact drawn centreline endpoints
P0 = axisIsU ? {u:Math.min(a0,aL), v:trans} : {u:trans, v:Math.min(a0,aL)};
P1 = axisIsU ? {u:Math.max(a0,aL), v:trans} : {u:trans, v:Math.max(a0,aL)};
score = distToSegPx(cursorPx, real2px(blk,P0.u,P0.v), real2px(blk,P1.u,P1.v));
// accept when score <= max(FLOOR_PX, (S.dK/2)*ppmm)
```

### D.2 Bolt2 section centreline (mirror `drawBolt2D_*Section`, `js/72c:323-484`)

```
b = BOLT_DB[ent.size] || BOLT_DB.M20;
span = v25BoltClampSpan(blk, ent);                         // <-- needs blk; null for 'end'
// If null, replicate the drawer's fallback {grip:20, centre:(horiz?ent.u:ent.v), length:computeBoltLength(20,ent.size)}.
```
Horizontal (`h-nutR`/`h-nutL`), axis along u, `cy = ent.v`:
```
hG = span.grip/2; dir = (orient==='h-nutR') ? 1 : -1;
zGripL = (orient==='h-nutR') ? span.centre - hG : span.centre + hG;   // head side
zGripR = (orient==='h-nutR') ? span.centre + hG : span.centre - hG;   // nut side
zWashHeadL = zGripL - dir*b.washT; zHeadOuter = zWashHeadL - dir*b.headH;
zWashNutR  = zGripR + dir*b.washT; zNutOuter  = zWashNutR + dir*b.nutH;
threadProt = (span.threadProt!=null) ? span.threadProt
           : Math.max(2*b.pitch, (span.length||0)-(span.grip+2*b.washT+b.nutH));
zThreadTip = zNutOuter + dir*threadProt;
uA = Math.min(zHeadOuter, zThreadTip) - 4; uB = Math.max(zHeadOuter, zThreadTip) + 4;
P0 = {u:uA, v:cy}; P1 = {u:uB, v:cy};
```
Vertical (`v-nutB`/`v-nutT`), axis along v, `cu = ent.u`: same shape with the v-axis signs from `js/72c:482` (`vGripL/vGripR/vWashHeadL/vHeadOuter/...`, `vThreadTip`, endpoints `vA/vB`). `score = distToSegPx(cursorPx, real2px(blk,P0), real2px(blk,P1))`; accept `<= max(FLOOR_PX, (b.washOD/2)*ppmm)`.

Both helpers are pure read-only scans of `entities2D[blk.viewKey]`; safe to call per candidate. They early-return `null` for `'end'` orient — so call them only on the section branches.

---

## E. Selection-state writes in `js/39-events.js`

Two separate stores, **mutually exclusive after any single click**: `v25Selected` (v1 entity ids) and `window.v25SelPlateIds` (v2 plate ids). `editPlate.state.selectedId` is the v2 "primary" and must mirror `v25SelPlateIds[last]`. Three sites enforce the invariant in lockstep:

**1. Plate wins** (`stack[0]._v2Plate === true`) — insert a branch BEFORE the existing `v25Selected=[hit.id]` (`:285`):
```
if (hit && hit._v2Plate) {
  window.v25SelPlateIds = [hit._v2Id];
  v25Selected = [];
  if (v2.tools.editPlate.state) v2.tools.editPlate.state.selectedId = hit._v2Id;
  if (typeof v2.tools.editPlate.beginBodyDragFromExternalSelect === 'function')
    v2.tools.editPlate.beginBodyDragFromExternalSelect(hit._v2Id, { u: cu, v: cv },
      (typeof isDupDragModifier === 'function' && isDupDragModifier(e)));
  if (typeof v25UpdateInspector === 'function') v25UpdateInspector();
  requestRender();
  return;
}
```
(The cycle bookkeeping at `:267-284` runs FIRST and is unchanged — `hit` may already be the plate after cycling. The plate branch then consumes it.)

**2. v1 entity wins** — the existing path (`:285-303`) runs, but ALSO clear the plate store where `v25Selected=[hit.id]` is set:
```
window.v25SelPlateIds = [];
if (window.v2 && v2.tools && v2.tools.editPlate && v2.tools.editPlate.state)
  v2.tools.editPlate.state.selectedId = null;
```

**3. Empty space** — the deselect path (`:323-333`) clears both:
```
v25Selected = [];
window.v25SelPlateIds = [];
if (window.v2 && v2.tools && v2.tools.editPlate && v2.tools.editPlate.state)
  v2.tools.editPlate.state.selectedId = null;
```
(`nearSel` near-miss guard at `:308-322` is unchanged; only the actual-clear block adds the plate clears.)

**Reference:** the contextmenu path (`:1842-1852`) already encodes exactly this mutual exclusion (plate hit → set `v25SelPlateIds` + clear `v25Selected`; v1 hit → set `v25Selected` + clear `v25SelPlateIds`). The new left-click path mirrors it. After this build, **right-click and left-click agree** (today right-click hard-codes plate-first via `hitTestBody` before `v25HitTest`; left-click now ranks specificity — both should resolve the same target). Optionally update the contextmenu to consult the ranked stack too, so a right-click on a screw-over-plate also targets the screw; **recommended but lower priority** — flag in build, do it if cheap.

### Cycle-resolve plate lookup (`:1439-1452`)

The mouseup cycle-advance looks the next id up in `entities2D[viewKey]` only (`:1443`). A plate synthetic id (`'v2plate-'+id`) won't be found there → cycling INTO a plate via the *armed-handle* path would no-op. Two options:
- **(a)** In the cycle-resolve, if `_nextId` starts with `'v2plate-'`, route to the plate store + `beginBodyDragFromExternalSelect` instead of the `entities2D` find.
- **(b)** Accept that the *handle-grab* cycle-arm (a niche path that only fires when grabbing a handle of the already-cycled entity) doesn't tunnel into plates; the *primary* repeat-click cycle (`:272-283`) already advances `hit = _stack[v25CycleIndex]` and hits the plate branch in § E.1 fine.

**Decision:** do **(a)** — it's a few lines and keeps both cycle paths consistent. The continuity test (`:272-281`) compares id strings, so the `'v2plate-'+id` synthetic must be byte-stable across repeated same-spot clicks (it is — `el.id` is a stable Map key).

---

## F. The new helper + reworked stack (shape)

### `v25EntHit(blk, ent, cursorPx, ctx)` → `{ precise, score } | null`

A single function holding the per-type precise logic. `ctx` bundles the per-call constants so they're computed once: `{ real2Px, ppmm, distToSegPx, FLOOR_PX, TOL_PX, LINE_TOL_PX, TXT_TOL_PX_X, TXT_TOL_PX_Y }` (the same values `v25HitTestStack` already computes at `:229-246`). Returns `null` when the cursor misses the precise geometry (so the candidate is dropped even though the bbox pre-filter passed). Branch on `ent.type` exactly per the § B table.

For `leader2`/`dim2`/noteBox, **lift the existing accept geometry** out of `v25HitTestStack`'s inline branches into `v25EntHit` and have them return the distance they already compute as `score` (precise=true). This keeps one code path per type.

### `v25HitTestStack(blk, u, v)` rework

```
1. Build ctx (real2Px, ppmm, distToSegPx, tolerances) — reuse the existing lines.
2. candidates = []   // each { ent, precise, score, idx }
3. PASS0 (noteBox arrowhead) — unchanged detection; but instead of push(ent),
   add { ent, precise:true, score: tipDistPx, idx } so it still floats to stack[0].
4. PASS1 — for i = arr.length-1 .. 0:  ent = arr[i]; if (!ent._v25) continue;
     - bbox pre-filter: b = v25EntBounds(ent); if (!b) and type has no bbox → still test;
       else only test when cursorPx within bbox px + TOL.
     - r = v25EntHit(blk, ent, cursorPx, ctx); if (r) candidates.push({ent, precise:r.precise, score:r.score, idx:i});
       (leader2/dim2/noteBox-leader handled inside v25EntHit; frame border via v25EntHit.)
5. v2 plates — enumerate v2.appState.model (§ C.1); push area candidates with synthetic idx.
6. Dedup by ent.id keeping the BEST-RANKED candidate (sort-or-min BEFORE dedup; § E noteBox).
7. Stable-sort: precise DESC → score ASC → idx DESC.
8. return candidates.map(c => c.ent);   // bare ents, deduped, in priority order
```

**Return contract unchanged:** an array of bare entity objects, deduped by `ent.id`, in priority order. The cycle (`js/39-events.js:261-303`) maps this to an id-array and compares across clicks — so the bare-ent shape and determinism are mandatory.

### `v25HitTest(blk, u, v)` — unchanged

```
const s = v25HitTestStack(blk, u, v);
return s.length ? s[0] : null;
```
Signature `(blk,u,v)→entity|null` MUST NOT CHANGE. ~6 callers depend on it. Note: it may now return a `type:'plate2'` synthetic to callers that historically saw only v1 ents (dblclick `:1298, 1306`, wall-edge `:1719-1722`, hover `:980, 984`). Those branch on `hit.type` (`==='dim2'`, `==='blockWall'`, `==='mem2'`) so a `'plate2'` synthetic falls through harmlessly. **Build chat must re-verify** none does `entities2D[...].find(e=>e.id===hit.id)` on the result (a `'v2plate-'` synthetic would get `undefined`). The eyedropper path (`:1839-1852`) already special-cases plates via `hitTestBody` BEFORE `v25HitTest`, so it's safe.

---

## G. What is DEFERRED

**Hover pre-highlight.** `v25HoverPick` (`js/71:972-986`) calls `v25HitTest` at `:980` (confirm cursor still over a selected body) and `:984` (find any other entity). Once the ranking lands, `stack[0]` flips from paint-order to specificity, so the idle-cursor highlight will start highlighting the *tightest* target (e.g. the screw) instead of the top-painted member. **This side-effect lands immediately with the ranking and is acceptable / desirable** — no crash risk, purely which entity glows. Do **NOT** build a richer hover (glow the would-be pick, route `_v2Plate` hits to the v2 plate highlight) in this build. When hover IS built later, it must map `_v2Plate` hits to the v2 plate highlight path (live-render hover), and must not set `v25Selected` for a plate. Note it as a follow-up.

---

## H. Do NOT touch 3D-mode pick

This build is **2D-mode (V25 paper-space) only**. The 3D-projected-mode pick — `blockAtPixel` / `cycleHits` (`js/10-bounds-hittest.js`) and the `selected3D` marquee path (`js/39-events.js:1635-1643`) — is a completely separate pipeline with its own depth model. **Do not change it.** The new scoring lives entirely inside `v25HitTestStack` (2D), the plate fold is 2D-only, and the selection-state writes touch only `v25Selected` / `v25SelPlateIds` (2D stores). No 3D file is in the Files-touched list.

---

## Open judgement calls (decided)

- **Filled-closed `lineSet` interior.** A `closed` + `fillMaterial` lineSet is treated as **stroke-only** (grab on the drawn outline, not the filled interior) — matches `drawLineSet2D` intent and is the safe default. If Dan later wants the filled interior to grab, add an optional area fallback (`precise:false`, shoelace area) when `ent.closed && ent.fillMaterial`. **Not built now.**
- **`anchor` as linear vs area.** Decided **linear** (px distance to the shaft centreline) — matches the drawn glyph and naturally beats a big member. (Scout 1's area-of-bbox fallback is the lesser option.)
- **`stiff2` true quad.** Use `stiffCorners` if it's exported on the global; otherwise `_v25dPointInPoly` on the `v25StiffBounds` bbox as a precise=false fallback. Do not assume `stiffCorners` is reachable; if it isn't, the bbox fallback is acceptable (stiffeners rarely stack under fasteners).

## Files touched (canonical — mirrors the README table)

- `js/71-v25-selection.js` — new `v25EntHit`, v2-plate enumerator, reworked `v25HitTestStack`, unchanged `v25HitTest`.
- `js/39-events.js` — plate-vs-v1 select branch + mutual-exclusion clears (3 sites) + cycle-resolve plate lookup.
- `js/v2/tools/edit-plate.js` — priority-4 returns `false`; new `beginBodyDragFromExternalSelect` export.
- `CHANGELOG.md` — one line.
