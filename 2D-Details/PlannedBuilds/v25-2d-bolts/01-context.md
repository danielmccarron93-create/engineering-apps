# 01 — Context: what the 3D bolt does today, why the 2D mode has none, what "same quality in 2D" requires

## What exists today

### 3D-mode bolts

A 3D bolt is an object in `objects3D` with type `'bolt'` and fields `{ x, y, z, boltSize, boltLength? }`. The renderer in `dev/js/33-draw-bolt.js` dispatches on the host detail-block's `viewKey` at line 312:

- `viewKey === 'elevation'` (lines 312–331): draws a head-on view at `(x, y)` — washer outline (dashed, light), bolt hole (solid stroke + faint fill), head crosshair. Standard AS 1100 "looking down the bolt axis."
- `viewKey === 'sectionA'` (line 332, V14 path at `_drawBoltSectionA_V14` line 158): bolt axis along u (= world z), side profile showing chamfered hex head, head-side washer, threaded shank with AS 1101 sawtooth indication, nut-side washer, chamfered hex nut, thread protrusion, centreline with `DASH.CL_BOLT`.
- `viewKey === 'planB'` (line 394, V14 path at `_drawBoltPlanB_V14` line 226): same profile, but bolt axis along v (= world z, looking down y). Almost-identical code to sectionA, mirror-imaged.

The reason the side profile clamps the right material is `computeBoltGripInfo` in `dev/js/21-bolt-grip.js` line 89. It raycasts along the world-z axis at `(boltObj.x, boltObj.y)` through every other 3D object, collects the material intervals via `rayMaterialAlongZ` (UB at line 52: returns `tw` through web, `bf` through flange; SHS at line 72: through-bolt across `B`; plate at line 26: returns `pt`), takes the outermost `zMin`/`zMax` (lines 110–116), and returns `grip = zMax - zMin` plus `zCentre = midpoint`. The bolt length then auto-snaps to the next `BOLT_LENGTHS` entry that satisfies `grip + 2·washT + nutH + 2·pitch` (line 122).

### 2D-mode "bolts"

There aren't any. The V25 2D-mode palette has a "Bolts & Anchors (B-)" group in `dev/js/69-v25-dispatch.js` line 90 with five tiles: trubolt, chemset, coach, tek, through. These are anchors — single-click stamps with an embedment depth, parameters around drilling and chemical type, and no concept of clamping a stack of plates. They're the right abstraction for cast-in / chemical anchors but the wrong abstraction for a structural through-bolt.

The renderer for anchors lives in `dev/js/68-v25-tools.js` and is short — just a circle with a centre mark and a depth callout. No hex head, no threaded shank, no nut, no grip detection.

## Why "the same quality in 2D" is harder than it looks

The 3D bolt's auto-grip works because the bolt sits inside a shared 3D solid model — `objects3D` is the model, and the bolt knows about every other object in it. The raycast along z is a pure function of that solid model.

The 2D mode has no shared 3D model. Each sheet has an `entities2D[viewKey]` map of flat 2D entities — `mem2`, `plate2`, `screw`, `anchor`, `mat`, `blockWall`, etc. — drawn in paper-space coordinates. For a 2D bolt to clamp the right material, it needs to derive the same "grip = extent of material along the bolt axis at this (u, v)" information from those 2D entities. That's a new raycast (`rayMaterialAlongAxis2D`) with a per-host-type handler that knows the 2D rendering geometry of each entity. The handler for a UB in cross-section view, for example, needs to know that the I-shape is defined by `(d, bf, tf, tw)` in the local frame, account for `ent.rot`, and return `tw` if the bolt's (u, v) is in the web zone or `bf` if it's in the flange zone.

This is conceptually identical to `rayMaterialAlongZ` in 3D, but operating in 2D and with one handler per `mem2` variant / `plate2`. The full algorithm lives in `05-auto-grip-algorithm.md`.

## What needs to be ported from 3D to 2D

Five things, in dependency order:

1. **The side-profile geometry primitives.** Chamfered hex head (`hexPointsAlongU` / `hexPointsAlongV` at lines 51 / 72 of `33-draw-bolt.js`), sawtooth thread (`drawThreadAlongU` / `drawThreadAlongV` at lines 96 / 126). These are duplicated for the two 3D axes; for 2D we need them at arbitrary rotation. The right move is to deduplicate first — refactor both pairs into single axis-agnostic functions that take `rotRad`. The 3D callers then wrap at `rotRad = 0` and `π/2` and behaviour stays identical. Cheap, halves the maintenance burden, and unblocks 2D.

2. **The grip computation.** `computeBoltGripInfo` → `computeBoltGripInfo2D` with the new `rayMaterialAlongAxis2D` plus per-host-type handlers for `plate2`, `mem2` (UB/UC/WB), `mem2` (PFC).

3. **The full side-profile renderer.** `_drawBoltSectionA_V14` → `drawBoltSideProfile(blk, cu, cv, rotRad, b, gi, col, clCol, ...)` — once the primitives are axis-agnostic, this is mostly a rename and a single rotation parameter. The 3D callers wrap and behaviour stays identical.

4. **The elevation renderer.** Lines 312–331 of `33-draw-bolt.js` — head-on circle, washer ring, crosshair. A near-copy for 2D; could extract to a shared helper if elegant, otherwise duplicate.

5. **The placement + entity scaffolding.** New tool `v25-bolt`, new entity `bolt2`, new tile in the palette, new options-bar branch, hit-test, Inspector, save/load, clipboard, DXF.

## Adjacent things that don't change

The 3D-mode bolt renderer in `dev/js/33-draw-bolt.js` keeps working exactly as it does today. The Phase 1 refactor is *additive plus deduplication*; the existing `_drawBoltSectionA_V14` and `_drawBoltPlanB_V14` are removed and replaced with thin wrappers around the new axis-agnostic renderer at `rotRad = 0` and `π/2`. Visual regression test: side-by-side screenshots of a sectionA block and a planB block before and after the refactor must be pixel-identical.

The V25 anchor tiles stay where they are. They're a different structural concept and have their own embedment-depth parameter that bolts don't have. The new Bolt tile is added *alongside* them in the "Bolts & Anchors (B-)" group, not replacing them.

The 3D bolt's auto-grip via `computeBoltGripInfo` is untouched. The 2D version is a parallel function (`computeBoltGripInfo2D`), not a replacement.

## Quality-bar reference

The screenshots in the planning conversation (3D elevation showing the bolt circle in a UB elevation; 3D section showing the bolt with hex head clamping the web of a 360UB) ARE the quality bar. The 2D mode output for the same scenario must be visually indistinguishable. Anything less and the feature isn't done.
