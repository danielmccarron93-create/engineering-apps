# Layer 2: Drawing-primitive findings (`js/23-auto-weld.js` → `js/38-crosshair.js`)

This is the highest-touch layer in the codebase — every visible pixel comes through here. 17 files, **5,328 lines total**. It's also where most of the parallel 3D/V25 implementations live. The two big surprises in this layer:

1. **`23a-shs-joints.js` is the second-largest file in the codebase at 1,182 lines, and is missing from the playbook entirely.**
2. **`23a` contains two complete implementations of the joint-trim algorithm** — once for 3D-mode SHS, once for V25 2D-mode `mem2`. The math is the same; only the frame/halfDepth lookup differs.

---

## File-by-file headlines

### D1. `23-auto-weld.js` — 682 lines (playbook says 676)

- **Real purpose:** 3D-mode auto-weld pipeline + shared weld dialog + occlusion clipping + cut-class classification. Four concerns in one file.
- **Affiliation:** **mixed**. Auto-weld is 3D-mode-only; `openWeldDialog` is shared with V25 manual placement; `isOccluded`/`clipLineAgainstOcclusion`/`rLineOcc`/`getCutClass` are layer-wide utilities used by every 3D-mode drawer.
- **Drift:** Playbook says "V14 auto-weld detection + popup (676 lines)" — accurate as a one-liner but misses the other three concerns hiding inside.
- **Top smells:**
  - `getObjThickness` / `getObjVolume` / `getObjFaces` are three 3-way `if obj.type === 'plate'/'ub'/'shs'` ladders. Every new section needs three more ifs.
  - `getObjThickness` silently falls back to `10` for unknown types — dangerous default for an AS 4100 Cl. 9.7.3.10 calculation.
  - Three inline `div.style.cssText` modal CSS blobs duplicated with `23a`.
  - `weldKey` and `_shsPairKey` in `23a` are the same function, namespaced differently.

### D2. `23a-shs-joints.js` — 1,182 lines, ⚠ **entirely missing from CLAUDE.md**

- **Real purpose:** Two parallel joint-trim pipelines (3D + V25) + two popups + a V25 "pick priority member" cursor mode.
- **Affiliation:** **mixed by design** — lines 1–608 are 3D-mode-only, lines 610–1182 are V25 2D-mode-only.
- **Top smells:**
  - `_computeEndCut` ↔ `_computeEndCutV25`, `_computeButtCut` ↔ `_computeButtCutV25`, `_faceCutLine3D` ↔ `_faceCutLineV25` — three parallel function pairs implementing the same Sutherland–Hodgman clip + face-cut math. Only the frame/halfDepth lookup differs.
  - `_clipPolygon` is a generic SH clipper hidden inside a joint file — should be a shared primitive.
  - `_jv*` 3D vector helpers — file-private duplicates of what Three.js provides.
  - `SHS_JOINT_END_TOL = 5` / `SHS_JOINT_THROUGH_TOL = 5` — user-tunable but hardcoded.
- **Fix in Phase 6:** Unify the two pipelines into one frame-agnostic `computeJointTrim(member, neighbours, frame, halfDepth, halfWidth)` function. The 3D path passes `{frame: memberFrame(obj), halfDepth: SHS_DB[s].B/2}`; the V25 path passes `{frame: _v25Frame(ent), halfDepth: v25Mem2HalfDepth(ent)}`. Same algorithm, two adapters. Immediately unlocks joints for V25 UB/UC/RHS/CHS without porting code.

### D3. `24-draw-primitives.js` — 112 lines

- **Real purpose:** `rLine`, `rRect`, `rFillRect`, `rFillPoly`, `rCircle`, `rFillCircle` + V17 sketch wobble.
- **Affiliation:** **shared** — both 3D-mode member drawers and V25 entity drawers route through these.
- **Smell:** Only `_lineW` is wobble-aware. `rRect`/`rFillRect`/`rCircle` silently skip wobble. Sketch mode produces incoherent output.
- **Smell:** `rCircle`/`rFillCircle` compute `viewport.zoom / drawingScale` inline rather than calling `ppm()`. Same expression, two formulations.

### D4. `25-parametric-holes.js` — 85 lines

- **Real purpose:** Clearance-hole computation for 3D bolts through 3D plates + `ppm()` export.
- **Drift:** Playbook says "bolt-driven hole computation" — accurate but **`ppm()` lives here**, which is invisible to readers and used by ~30 callers. Misfiled (see foundation findings CL1).
- **Smell:** Polygon plates silently get zero holes (`if (plate.polyPts) return []`). Should be a TODO sentinel or inspector warning.
- **Smell:** No `computePlate2HolesElevation` for V25 `plate2` — bolts in V25 2D mode currently can't auto-hole. The `v25-2d-bolts/` planning folder is adding this.

### D5. `26-as1100-hatch.js` — 76 lines

- **Real purpose:** Steel cross-hatching (rectangular, polygon-clipped, hollow).
- **Smell:** Only the steel pattern lives here. Concrete-dot + cross-cross patterns live in `drawHatch2D` in `34-draw-2d.js`. V25's pattern catalogue lives in `67-v25-materials.js`. **Hatching is sprayed across three files.**
- **Fix in Phase 6:** Consolidate into one hatch module with a per-pattern config table.

### D6. `27-rotation-helper.js` — 59 lines

- **Real purpose:** `withRotation` wraps a draw callback in a canvas rotation; `localizeOccRects` rotates occlusion rects into the object's local frame.
- **Affiliation:** **3D-mode-only**. V25 2D-mode rotation is handled inline in `68-v25-tools.js`.
- **Smell:** Same primitive should serve both modes — V25 rotation reimplements the same math.

### D7. `28-draw-block.js` — 108 lines

- **Real purpose:** Block-level dispatcher. Paints isometric blit, runs 3D painter's-algorithm sort, dispatches to 3D-mode drawers, then 2D entities. V25 short-circuit at the top.
- **Affiliation:** **shared / dispatcher** — branches on `sheetMode === '2d'`.
- **Drift:** Playbook says "block content dispatcher + view markers" — **view markers actually live in `37-view-labels.js`**.
- **Smell:** Type-dispatch ladder on `obj.type` (lines 84–92). Every new 3D section forces an edit here.
- **Smell:** `obj._cutClass` is stashed on the object as a render side-effect — should be a per-frame `Map<id, cutClass>`.

### D8–11. `29-draw-ub.js` (171) / `30-draw-shs.js` (185) / `31-draw-section.js` (244) / `32-draw-plate.js` (195)

- **Real purpose:** 3D-mode member renderers for I-sections / hollow sections / unified PFC-RHS-CHS-EA-UA / plates.
- **Top smells (shared across all four):**
  - View-switch ladder (elevation / sectionA / planB) reappears verbatim in each file — 4 copies of the same per-view dispatch structure.
  - `ctx.lineWidth = 0.5` for centrelines, repeated 11 times across these 4 files — should be `LW.CL * ppm()`. `31-draw-section.js` uses `Math.max(0.25, LW.CL * pm)` correctly, so **the layer is inconsistent within itself**.
  - `memberFillAlpha` is defined in `29-draw-ub.js` but used by all four. Mis-credentialed.
  - SectionA / planB branches inside each file are 60–80% byte-identical with axes swapped (the per-axis duplication smell B2).

### D12. `33-draw-bolt.js` — 455 lines

- **Real purpose:** V14 realistic-bolt drawing for 3D-mode bolts. Hex head/nut polygons, sawtooth thread, per-view branches.
- **Affiliation:** **3D-mode-only**. **No V25 2D-mode bolt path exists in this file** — that's what `v25-2d-bolts/` adds.
- **Smell:** Two parallel renderers (V14 vs legacy schematic) guarded by `V14_NEW_BOLTS` flag — the legacy ~120 lines is dead code if the flag is always true.
- **Smell:** `hexPointsAlongU` ↔ `hexPointsAlongV`, `drawThreadAlongU` ↔ `drawThreadAlongV` are axis-pair duplicates — exactly the refactor the `v25-2d-bolts/` planning folder calls for (Phase 6).
- **Smell:** Elevation (end-on view) doesn't vary by `cutClass` — STP 6011 typically blackens the cut-through bolt head; this renderer doesn't.

### D13. `34-draw-2d.js` — 981 lines in root (989 in dev/); playbook says 981 ✓ in root

- **Real purpose:** Single mega-dispatcher (`drawEnt2D`) for V22-era 2D entities. **22-way `else if` ladder** + 18 dedicated draw functions.
- **Drift:** Playbook says "drawEnt2D + V22.5/V22.6 entities (981 lines)" — accurate count but the name "draw-2d" is misleading. **This file mostly draws V22-era annotation entities, not "2D mode."** V25 paper-space entities delegate out to `v25DrawEnt`.
- **Top smells:**
  - 22-way dispatch ladder — classic dispatch-table candidate.
  - Six dimension variants packed into a single 160-line `drawDim2D` — should be 6 small functions sharing a witness-line/tick helper.
  - `drawBoltCallout2D` and `drawMaterialTag2D` are both wrappers calling `drawMemberTag2D` with `memberId: undefined`. Three entity types share one renderer — fragile.
  - `drawHatch2D` re-implements cross-hatch instead of fully delegating to `26-as1100-hatch.js`.
  - Hardcoded `ctx.lineWidth = 0.8` / `1.2` in `drawDim2D` — should be `LW.DIM * pm` / `LW.MW * pm`. The chain/baseline branch *does* use those correctly. Inconsistent within the file.
  - `drawRevSchedule2D` scans every entity across every view every frame — should cache.
  - `drawSlot2D` centreline drawing is buggy (lines 356–358 emit a `moveTo` that's overwritten before the stroke).
- **Fix in Phase 6:** Split along entity-family lines (dispatch / dim / annotations / sheet / shapes).

### D14. `35-draw-weld.js` — 186 lines

- **Real purpose:** AS 1101.3 weld symbol — arrow, reference line, glyphs.
- **Affiliation:** **2D-mode-only** (operates on weld entities in `entities2D`).
- **Quality:** Matches STP 6011 well — fillet, square, single-V, double-V, partial-pen, bevel all correct. Tail-fork, all-around circle, site-weld pennant all correct.
- **Smell:** 6-way `if` ladder in `drawWeldGlyph` — minor; could be a table but fine as-is.

### D15. `36-selection-highlights.js` — 157 lines

- **Real purpose:** Selection bounding box + grip handles for 3D-mode objects.
- **Affiliation:** **3D-mode-only** — V25 2D selection is parallel-implemented in V25 layer (`v25DrawSelectionHighlight`).
- **Smell:** `drawSelHighlight` ↔ `v25DrawSelectionHighlight` — yet another parallel pair.
- **Smell:** `drawActiveBlockHighlight` is a no-op stub (line 153) — back-compat artefact, should remove.
- **Smell:** Live rotation-angle pop reaches into `obj._liveRotAngleDeg` and `_viewBasis` (leading-underscore "private" function) — render-side mutation of model state.

### D16. `37-view-labels.js` — 91 lines

- **Real purpose:** Per-view labels ("ELEVATION 1:50", "SECTION A 1:20", …). V25 2D mode suppresses labels.
- **Drift:** Accurate.
- **Smell:** Label-vertical-stacking math duplicated between draw and hit-test.

### D17. `38-crosshair.js` — 359 lines

- **Real purpose:** Crosshair + cursor coord readout + rubber-band preview for legacy 3D-mode tools + `createPlacingGhost`.
- **Affiliation:** **3D-mode-only** — V25 placement previews live in V25 layer.
- **Smell:** 7-way tool ladder for preview dispatch.
- **Smell:** Hardcoded pill colours bypass the theme system entirely.
- **Smell:** `'Segoe UI'` font hardcoded — Mac users see fallback.
- **Smell:** `createPlacingGhost` should arguably live in `40-placement.js`.

---

## Layer-level summary

### The 5 worst structural problems in this layer

1. **Parallel 3D/V25 implementations of the same algorithm**, repeated four times (joints, auto-welds, selection highlights, soon bolts). Phase 6 unifies all four.
2. **Per-axis duplication inside files** (`U` vs `V` orientation pairs in `33-draw-bolt.js`; sectionA/planB branches in `29/30/31/32`). Phase 6.
3. **Type-dispatch ladders**: 5-way obj.type in `28`, 22-way entity-type in `34`, 7-way tool in `38`. Phase 6.
4. **Hand-rolled lineweights ignoring `LW`**: 11 sites across `29/30/33`, 4 sites in `34-draw-2d.js`. Phase 6.
5. **`23a-shs-joints.js` is entirely missing from the playbook** despite being the second-largest file. Phase 1.

### Files where the 2D/3D split is clearly violated and which way it leaks

- **`23-auto-weld.js`** (3D → 2D): The popup's "Add AS 1101.3 Symbol" handler creates V25 entities directly inside a 3D-mode file. The dialog is shared but lives in the 3D file.
- **`34-draw-2d.js`** (2D → 3D): `drawMemberTag2D` reaches back into `objects3D` to resolve member labels. The "2D" file isn't really 2D.
- **`23a-shs-joints.js`** (intentional mixed, but with duplication): Honest about housing both modes but uses two complete implementations instead of one shared algorithm.
- **`33-draw-bolt.js`** (3D-only, missing 2D path): The V25 2D-mode bolt has no renderer yet. The `v25-2d-bolts/` planning folder adds it — Phase 6 generalises the dedup approach.

### Suggested file-boundary changes (consolidated into Phase 6 of `09-build-plan.md`)

1. Move `ppm()` from `25-parametric-holes.js` to `08-coords.js`.
2. Move `memberFillAlpha` from `29-draw-ub.js` to `24-draw-primitives.js`.
3. Move occlusion-clip helpers from `23-auto-weld.js` to a new `15a-occlusion-clip.js`.
4. Move `_clipPolygon` (Sutherland–Hodgman) from `23a-shs-joints.js` to `24-draw-primitives.js`.
5. Move `createPlacingGhost` from `38-crosshair.js` to `40-placement.js`.
6. Unify `23a-shs-joints.js` 3D and V25 paths into a single frame-agnostic engine.
7. Split `33-draw-bolt.js` into `33-bolt-primitives.js` (axis-agnostic hex/thread) + `33-bolt-3d.js` (3D dispatcher) + new `33b-bolt-2d.js` (V25 dispatcher — what `v25-2d-bolts/` adds).
8. Split `34-draw-2d.js` along entity-family lines: `34a-dispatch`, `34b-dim`, `34c-annotations`, `34d-sheet`, `34e-shapes`.
9. Add `28a-render-3d-dispatch.js` with `RENDERERS_3D = { ub: drawUB, … }` to remove the type ladder.
10. Consolidate hatching into one module (move concrete-dot + cross-cross + V25 patterns out of `34`/`67` into `26`).
