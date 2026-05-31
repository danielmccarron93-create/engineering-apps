# 05 — Auto-grip algorithm

The engineering core of this feature. The 2D bolt's side profile only looks right if the grip — the distance from the head's inside face to the nut's inside face — matches the actual material the bolt passes through. This file specifies the raycast that derives grip from the visible 2D entity outlines.

The 3D-mode reference is `computeBoltGripInfo` in `dev/js/21-bolt-grip.js` line 89 and the per-host-type body tests in `rayMaterialAlongZ` line 24. The 2D version is conceptually identical, operating along the bolt's local axis (a 2D direction set by `ent.rot`) instead of the world z axis.

## Algorithm overview

```
computeBoltGripInfo2D(boltEnt):
  if boltEnt.gripOverride is set:
    return { grip: gripOverride, axisCentre: (u,v), boltLen: snap(gripOverride), threadProt: ... }

  intervals = []
  rotRad = boltEnt.rot * π/180
  for ent in entities2D[boltEnt.viewKey]:
    if ent.id == boltEnt.id: continue
    if ent.type not in {'plate2', 'mem2'}: continue        // v1 hosts only
    if ent.memberType in {'shs','rhs','chs'}: continue     // v1 defers HSS
    ivs = rayMaterialAlongAxis2D(ent, boltEnt, rotRad)
    if ivs is not None:
      intervals.extend(ivs)

  if intervals is empty:
    return free-space-fallback({ grip: 12, axisCentre: (u,v), ... })

  intervals = mergeIntervals(intervals, GAP_TOLERANCE_MM)
  sLo = min(iv.sLo for iv in intervals)
  sHi = max(iv.sHi for iv in intervals)
  grip = sHi - sLo
  axisCentre = (boltEnt.u, boltEnt.v) + (sLo + sHi)/2 * (cos rotRad, sin rotRad)
  boltLen = snapToBoltLength(grip + 2*washT + nutH + 2*pitch)
  threadProt = max(2*pitch, boltLen - (grip + 2*washT + nutH))
  return { grip, axisCentre, boltLen, threadProt }
```

`GAP_TOLERANCE_MM` is the fabrication-gap tolerance from Q1 in `04-open-questions.md` (suggested 5 mm).

`snapToBoltLength` is identical to the 3D version at `dev/js/21-bolt-grip.js` lines 122–123 — walks `BOLT_LENGTHS` for the first entry ≥ the required length.

## Local-frame transform

Every per-host-type handler runs in the bolt's axis-local frame. The bolt's axis is at angle `rotRad` from +u in canvas coordinates. To test whether a point on the host entity is on the bolt axis:

```
sLocal = (px - boltEnt.u) * cos(rotRad) + (py - boltEnt.v) * sin(rotRad)
nLocal = -(px - boltEnt.u) * sin(rotRad) + (py - boltEnt.v) * cos(rotRad)
```

`sLocal` is the signed distance along the bolt axis. `nLocal` is the perpendicular offset (should be near zero for points on the axis). Each handler returns intervals of `sLocal` where the bolt passes through material.

## Per-host-type handlers

### `plate2`

A `plate2` entity in the V25 system has fields `(u, v, w, h, rot, thk, aspect)`. The visible 2D shape depends on `aspect`:

- `aspect === 'elev'` (face-on): plate is a `w × h` rectangle centred at `(u, v)`, rotated by `ent.rot`. The bolt passes through the plate's face — grip = `ent.thk`. Need to test whether `(boltEnt.u, boltEnt.v)` is inside the rectangle; if so, return `[{ sLo: -thk/2, sHi: +thk/2 }]` *but* note: the plate's thickness extends perpendicular to the page in this aspect, so the bolt axis (which lies in the page plane) doesn't intersect the plate's thickness — the bolt is seen *through* the plate's face. **In this case the handler returns `[{ sLo: 0, sHi: 0 }]` with a special flag indicating "skin contact" rather than through-grip.** Or simpler: skip elev-aspect plates entirely — the bolt should be drawn either head-on (in which case the plate is the host but the rendering is the head-on circle, no grip needed) or in section aspect through a plate that's also in section aspect.

  → **Decision for v1:** elev-aspect plates contribute no grip. Bolts placed over an elev-aspect plate either render as head-on circles (correct) or as side profiles in free space (wrong — but visually obvious so the user can fix). Document this in `04-open-questions.md` as a follow-up.

- `aspect === 'sec'` (edge-on, plate seen as its thickness): plate is a `thk × h` rectangle (thk is the visible width along the perpendicular to the plate face, h is the length along the plate face). The bolt-axis raycast intersects the rectangle and returns `[{ sLo, sHi }]` where the intersection enters and leaves. Standard rectangle-ray intersection in the bolt-local frame after subtracting the plate's centre and rotating into the plate's local frame.

### `mem2` UB / UC / WB in cross-section view (`aspect === 'sec'`)

The cross-section profile is an I-shape with parameters `(d, bf, tf, tw)` from `UB_DB[ent.section]`. The renderer at `dev/js/68-v25-tools.js` line 428 draws the shape in the member's local frame after rotation by `ent.rot`.

Algorithm: transform the bolt-axis ray into the member's local frame (translate by `-ent.u, -ent.v`, rotate by `-ent.rot`). In that frame the I-shape is centred at origin with depth `d` (along the local v-axis, web-vertical) and flange width `bf` (along the local u-axis).

Now classify by where the bolt-axis ray sits in the member-local frame:

- **Bolt centre is in the web zone** (`|local_u| < tw/2` and `|local_v| < d/2 - tf` after accounting for the member's local frame): the ray enters and exits the web. Compute the intersection of the bolt's axis (a line through the local origin offset, at angle `rotRad - ent.rot`) with the web rectangle (`-tw/2 ≤ u ≤ tw/2`, `-(d/2-tf) ≤ v ≤ (d/2-tf)`). Return the entry/exit `sLocal` values.

- **Bolt centre is in the flange zone** (`d/2 - tf < |local_v| < d/2`): ray enters and exits the flange. Compute intersection with the flange rectangle (`-bf/2 ≤ u ≤ bf/2`, `d/2-tf ≤ v ≤ d/2` for the top flange, mirrored for the bottom). Return entry/exit `sLocal`.

- **Bolt centre is outside the I-shape**: return null.

For typical use the bolt is approximately perpendicular to the web (horizontal bolt through vertical web) so the intersection length is close to `tw` for a web bolt or `bf` for a flange bolt. A skew bolt would return a longer intersection — that's geometrically correct.

### `mem2` UB / UC / WB in elevation view (`aspect === 'elev'`)

The elevation outline is a flat rectangle of `length × d` (length along the long axis, d as the visible depth). The bolt-axis ray intersected with this rectangle returns the visible material extents. **But the bolt isn't really passing through the I-shape geometry — it's just sitting over the flat outline**. Typical interpretation: the bolt is connecting an attached element (e.g. a cleat plate on the other side of the page) and the grip is dominated by other entities, not the elevation outline itself.

→ **Decision for v1:** elevation-aspect `mem2` contributes no grip (returns null). The user places the bolt in elevation aspect only when the bolt's head is meant to be drawn head-on (the elevation view of the bolt), in which case the renderer dispatches to the head-on circle code and grip isn't needed.

If the user has a bolt through a plate stack on top of an elevation-view member, the other entities (`plate2` in section aspect, or another `mem2` in section aspect) provide the grip, and the elevation `mem2` is correctly ignored. Document this in the open-questions follow-up.

### `mem2` PFC in cross-section view (`aspect === 'sec'`)

PFC parameters are `(d, bf, tf, tw)` plus `ent.openSide`. The cross-section is a C-shape: a back-web of thickness `tw` running full depth, with two flanges of length `bf` projecting from the back-web toward the open side. The renderer at `dev/js/68-v25-tools.js` line 535 uses `openUp = ent.openSide === '+v'` to flip the flange direction in the local frame.

Three zones to classify:

- **Bolt centre is in the back-web zone**: intersection with the back-web rectangle. Return entry/exit `sLocal` — typically near `tw`.
- **Bolt centre is in one of the flanges**: intersection with the flange rectangle. Return entry/exit — typically near `tf` (the flange thickness, which the bolt passes through perpendicularly) or `bf` (if the bolt is axial through the flange length, unusual).
- **Bolt centre is in the open volume between the flanges**: ray passes through air — return null.

Same rotation handling as the I-family.

### `mem2` PFC in elevation view

Same logic as I-family elevation — returns null for v1. The user places elevation-aspect bolts as head-on circles only.

## Interval merging with fabrication-gap tolerance

```
mergeIntervals(intervals, gapTol):
  if intervals is empty: return []
  sort intervals by sLo
  merged = [intervals[0]]
  for iv in intervals[1:]:
    last = merged[-1]
    if iv.sLo - last.sHi <= gapTol:
      last.sHi = max(last.sHi, iv.sHi)
    else:
      merged.append(iv)
  return merged
```

After merging, the outermost-extents step at the end of `computeBoltGripInfo2D` takes the minimum `sLo` and maximum `sHi` across all merged intervals to get the overall grip. For the T-cleat case (two plates butted face-to-face) this collapses to a single merged interval = single grip block. For genuinely separated plates (e.g. one plate 30 mm from another, packer-style) the intervals stay separate and the outermost extents give grip = full span including the gap, which is the correct AS 4100 connection length.

## Free-space fallback

If `intervals` is empty after the per-entity scan, the bolt is being placed in free space — no host material detected. Return:

```
{ grip: 12, axisCentre: (u, v), boltLen: snapToBoltLength(12 + 2*washT + nutH + 2*pitch), threadProt: ... }
```

The renderer adds the orange-dot indicator (see `04-open-questions.md` Q2). The user can override grip in the Inspector to set the correct value, or drag the bolt onto host material and the raycast resolves automatically.

## Edge cases worth flagging in the implementation

- **Bolt placed exactly on a member edge**: the raycast might return a zero-length interval (entry and exit at the same point). Treat zero-length intervals as null in the per-handler return.
- **Bolt placed inside two overlapping `mem2` entities that visually overlap on the page**: the merge step handles this — overlapping intervals collapse to one.
- **Bolt at `rot = 0` over a horizontal plate**: the raycast is along +u, the plate's thickness is along +v in the plate-local frame. Pure axis-aligned case, no rotation algebra needed.
- **Bolt at `rot = 45°` over a horizontal plate**: skew through the plate. The intersection length is `thk / cos(45°)` ≈ 1.41 × `thk`. This is geometrically correct and the bolt should auto-length accordingly.
- **Numerical precision near edges**: tolerate intersections that fall within ±0.1 mm of the entity edge as on-edge.

## Test fixtures (suggested for `verification/` folder during build)

1. **Single plate, bolt through:** 10 mm plate at origin, bolt at `(0, 0)` with `rot = 0`. Expected: `grip = 10`, `axisCentre = (0, 0)`.
2. **UB web through-bolt:** 360UB 50.7 in cross-section at origin, `rot = 0`. Bolt at `(0, 0)` with `rot = 0`. Expected: `grip = tw ≈ 8 mm`, `axisCentre = (0, 0)`.
3. **UB flange bolt:** same UB. Bolt at `(0, d/2 - tf/2)` (in flange centre) with `rot = 0`. Expected: `grip = bf` (full flange width along the bolt axis).
4. **T-cleat plate stack:** two 10 mm plates, one at `u = -5` (centre at -5, extending u = -10 to u = 0), the other at `u = +5` (centre at +5, extending u = 0 to u = +10). Bolt at `(0, 0)` with `rot = 0`. Expected: intervals merged → single block `[{ sLo: -10, sHi: 10 }]`, `grip = 20`, `axisCentre = (0, 0)`.
5. **T-cleat with 3 mm gap:** same two plates but separated by 3 mm. Expected: intervals merge (3 mm < 5 mm tolerance), `grip = 23`.
6. **T-cleat with 10 mm gap:** same two plates but separated by 10 mm. Expected: intervals stay separate, outermost extents → `grip = 30` (10 + 10 + 10 = packer gap included).
7. **Skew bolt through plate:** 10 mm plate, bolt at `(0, 0)` with `rot = 30°`. Expected: `grip = 10 / cos(30°) ≈ 11.55`.
8. **Free-space bolt:** no entities. Expected: `grip = 12`, fallback flag set.
9. **PFC web bolt:** 200PFC 22.9 in cross-section. Bolt at `(0, 0)` with `rot = 0`. Expected: `grip = tw` of the PFC.
10. **Bolt outside any entity:** entities exist but the bolt's (u, v) is outside all of them. Expected: `grip = 12`, fallback flag set.

Each test runs `computeBoltGripInfo2D` headlessly and asserts on the returned values to within 0.01 mm. Encoded as a small `verification/grip-tests.html` page that loads the script set and runs the assertions, mirroring the pattern in `PlannedBuilds/timber-screws/verification/`.
