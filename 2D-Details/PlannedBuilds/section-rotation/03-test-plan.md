# 03 — Test plan (machine-checkable)

Run in the browser console with the app loaded in 2D mode (no node on this
machine — serve via `python3 -m http.server` from a /tmp copy per the
local-testing memory). Every case is an assertion the build chat can execute
verbatim or with the noted setup. Tolerance for floats: **±0.01 mm** unless
stated. `cos30 = 0.8660254`, `sin30 = 0.5`.

Common setup helper (paste once):

```js
const mk = (o) => Object.assign({ type:'mem2', _v25:true, id: 9000 + (mk._i=(mk._i||0)+1),
  u:0, v:0, length:0, aspect:'sec', view:'elevation' }, o);
const approx = (a, b, t=0.01) => Math.abs(a - b) <= t;
```

---

## A. Composition + legacy identity (pure helper math)

**A1. Helper table — `v25Mem2GlyphRotDeg`** (sec entities unless noted; SHS section, any valid key):

| # | roll | rot | aspect | expected |
|---|---|---|---|---|
| A1.1 | *absent* | 0 | sec | **0** |
| A1.2 | *absent* | 90 | sec | **90** (legacy spin counted ONCE) |
| A1.3 | `'90'` (string) | 0 | sec | **90** |
| A1.4 | 90 | 30 | sec | **120** |
| A1.5 | 0 | 30 | sec | **30** |
| A1.6 | `'270'` | −30 | sec | **240** |
| A1.7 | 90 | 30 | **elev** | **30** (elev glyph ignores roll) |
| A1.8 | *absent* | 30 | sec | **30** (legacy free edit works) |

```js
const sect = Object.keys(SHS_DB)[0];
console.assert(v25Mem2GlyphRotDeg(mk({memberType:'shs', section:sect, rot:90})) === 90, 'A1.2');
console.assert(v25Mem2GlyphRotDeg(mk({memberType:'shs', section:sect, roll:'90', rot:30})) === 120, 'A1.4');
// …one assert per row.
```

**A2. `v25Mem2EffRoll` unchanged** — same 8 entities; expected: 0, 90, 90, 90, 0,
270, 90, 30. Exact integer equality.

**A3. Legacy render identity (byte-level).** Legacy sec entity
`mk({memberType:'shs', section:sect, u:1000, v:1000, rot:90})` (roll ABSENT):
`drawMem2D`'s `rotDeg` must equal 90 — i.e. `v25Mem2GlyphRotDeg(ent) ===
v25Mem2EffRoll(ent)` exactly. Numeric draw-capture check: stub
`ctx.moveTo/lineTo` to record pixel points, call `v25DrawEnt(activeBlock, ent)`,
then repeat with the pre-build formula angle (`effRoll`) hand-fed — the two
capture arrays must be identical to the last digit. Repeat for a legacy GLT
(`roll` absent, `rot: 90`, valid `GLT_SIZES` key).

**A4. New-placement identity.** Place a sec member through the real tool path
(`v25SetTool('v25-mem')`, sec aspect, click): the created entity has `rot === 0`
and `roll === v25State.roll` (js/69:553-561), and `v25Mem2GlyphRotDeg(ent) ===
Number(ent.roll)`. Glyph identical to pre-build.

---

## B. World outline / bounds / hit-test at a tilted corner

Use SHS with `B = 100` (pick `sect100 = Object.keys(SHS_DB).find(k =>
SHS_DB[k].B === 100)`; if none, scale all expected values by `hd/50` where
`hd = v25Mem2HalfDepth(ent)`). Entity: `e = mk({memberType:'shs',
section:sect100, u:1000, v:1000, roll:0, rot:30})` → glyph 30°, hW = hH = 50.

**B1. Outline corners** — `v25Mem2WorldOutline(e)` returns 4 points; as a SET
(order may differ by starting corner):

```
(1000−68.301, 1000+18.301)  (1000+18.301, 1000+68.301)
(1000+68.301, 1000−18.301)  (1000−18.301, 1000−68.301)
```

**B2. Bounds enclose the tilt** — `v25EntBounds(e)` ≈
`{L: 931.699, R: 1068.301, B: 931.699, T: 1068.301}` (half-diagonal
50·(cos30+sin30) = 68.301 — NOT the old ±50 square).

**B3. Hit at the tilted corner** — insert `e` into
`entities2D[activeBlock.viewKey]`; `v25HitTest(activeBlock, 1016.47, 1061.47)`
(local (45,45) rotated 30°) returns `e`'s id. This point lies OUTSIDE the old
unrotated ±50 bbox in v-direction at that u — it proves both the gate (§3.3a)
and the outline fix.

**B4. Miss at the old (unrotated) corner** — `v25HitTest(activeBlock, 1045,
1045)` does NOT return `e` (inverse-rotated local point is (61.47, 16.47), lu >
50). Clean up the inserted entity after B3/B4.

**B5. RHS true rect (intentional change at rot=0)** — for an RHS sec entity
(`roll:0, rot:0`), `v25Mem2WorldOutline` half-extents must equal
`(bf/2, d/2)` from `RHS_DB[section]` — no longer the d×d square. Assert
`approx(maxU−minU, db.bf || db.B)` and `approx(maxV−minV, db.d || db.D)`.

**B6. Composition outline** — `roll:'90', rot:30` (glyph 120°): outline equals
the B1 rect rotated by 120°: corner local (50,50) → world
`(1000 − 68.301, 1000 − 18.301)`… assert all four via
`v25RotPtAbout(1050, 1050, 1000, 1000, 120*Math.PI/180)` as the oracle.

**B7. GLT non-square** — GLT sec (`b×d` from `GLT_SIZES`), `roll:90, rot:30`:
outline = ±b/2 × ±d/2 rect rotated 120°; assert one corner against the
`v25RotPtAbout` oracle. Footprint `v25SelFootprint(e)` returns the same 4 points
(as {u,v}); `v25HoverOutline(activeBlock, e).closed[0]` likewise.

---

## C. Lockstep + snap + dispatch

**C1. Notch frame lockstep** — GLT sec `roll:'90', rot:30`:
`approx(v25NotchRot(e), 120 * Math.PI / 180, 1e-9)`. Round-trip:
`v25NotchLocalToWorld(e, 10, 20)` then `v25NotchWorldToLocal(e, …)` returns
(10, 20) within 1e-6.

**C2. Snap corners ride the glyph** — with `e` (B-series, glyph 30°) in
`entities2D`: `v25CollectSnapPoints(activeBlock, 0, 0)` contains the origin
(1000,1000) and all four B1 outline corners (each within 0.01). No snap point
remains at the old unrotated corners (e.g. (1050,1050) absent).

**C3. Edge-snap gating** — `getV25EntSnapEdges(e30, viewKey)` with glyph 30° →
`[]` (length 0). With `roll:0, rot:0` → 4 edges (2 axis-'u' web, 2 axis-'v'
face) — unchanged from today. With `roll:90, rot:0` (glyph 90, ortho) → still 4
edges (pre-existing behaviour preserved).

**C4. Sec placement + ghost unchanged** — place via tool: entity `rot===0`;
ghost preview draws without console errors (manual smoke: move cursor over the
canvas with the sec member tool armed).

**C5. Legacy roll-write migration** — legacy ent (`roll` absent, `rot:90`) in
`entities2D`, selected; simulate the inspector: set the Roll° select to '90' and
dispatch `input` (or call the listener path directly). Afterwards:
`ent.roll === '90'`, `ent.rot === 0`, `v25Mem2GlyphRotDeg(ent) === 90` — glyph
did NOT jump to 180.

---

## D. Sec rotate drag handle (+ undo)

**D1. Ball exists and rides the glyph** — sec SHS `roll:0, rot:0` at
(1000,1000), hd=50: `v25EntHandles(e)` (sec) contains exactly one handle, key
`'rotate'`, shape `'circle'`, at `(1000, 1000 + 50 + max(40, 30)) = (1000,
1090)`. With `rot:30`: at `(1000 − 90·sin30, 1000 + 90·cos30) = (955, 1077.94)`.
Still NO `end-a`/`end-b`.

**D2. Drag writes composed-minus-roll** — arm the drag directly (per the
v25-drag-testing memory: prime `v25Drag = { ent: e, handle: 'rotate', lastU:
1000, lastV: 1090, startU: 1000, startV: 1090 }`), then
`v25Move(e, du, dv, 'rotate')` with `(du, dv)` placing the cursor at angle
135° from the pivot (e.g. cursor (929.29, 1070.71) ⇒ du = −70.71, dv = −19.29):
ball angle 135° ⇒ glyph snaps to **45°** (default 45° stops,
`ROT_SNAP_DEFAULT_DEG`). With `roll:0` ⇒ `e.rot === 45`. Repeat with
`roll:'90'` ⇒ `e.rot === −45` and `v25Mem2GlyphRotDeg(e) === 45`. `e.u/e.v`
unchanged (pivot fixed).

**D3. Elevation rotate unchanged** — elev member `length:1000, rot:0`: the
existing branch still rotates about the midpoint and re-derives u/v (regression
guard: same numeric result as today for a 45° drag).

**D4. Undo round-trip (drag path)** — full pipeline: `before =
v25SnapshotMoveTargets(e)`; mutate via D2; push `{act:'v25Move', before, after}`
the way js/39:1786-1793 does (or perform a real synthetic mousedown/move/up);
`undo()` restores `e.rot` to its pre-drag value; `redo()` re-applies. (Panel
edits intentionally remain non-undoable — do NOT assert undo after a synthetic
inspector input; that's the documented pre-existing gap.)

---

## E. Fixing rotation — per type

Pivot rule for all: rotation about `(ent.u, ent.v)`; at `rot:0` everything
byte-identical (E0).

**E0. rot=0 identity (all four types, both screw families)** — draw-capture
(stubbed moveTo/lineTo/arc) of a `bolt2` (`h-nutR`), HBS `screw` (`v-headT`),
VGS `screw` (`v-headT`, a `VGS…` spec id), `stud` (`v-nutT`), `anchor` at rot 0
before vs after the build: identical arrays.

**E1. Stud geometry (the single source)** — `s = { type:'stud', _v25:true,
u:500, v:500, studSpec:'M16', studOrient:'v-nutT', rot:30 }` with NO host
entities: `g = studSectionGeom(activeBlock, s)`:
- `g.snap === null` (bearing scan gated), `g.rotRad ≈ 30·π/180`.
- `g.Puv(0,0)` → `[500, 500]` (pivot exact).
- `g.Puv(100,0)` → `[550, 413.397]` (v-nutT ⇒ bodyDir −1 ⇒ axis point (500,400);
  rotated 30° about (500,500): du=0, dv=−100 → (du·c−dv·s, du·s+dv·c) =
  (50, −86.603)).
- `v25StudBearingFace(activeBlock, s) === null` even with a `plate2`-shaped host
  present; with `rot:0` and the same host it returns non-null (gate, not
  breakage).
- `v25StudEdgeSnap(activeBlock, s, g, 50) === null`.

**E2. Stud hit + centreline** — `v25FastenerCentreline(activeBlock, s)` is a
seg with `a ≈ {u,v} of g.Puv(g.sTailTop − 3, 0)` and
`b ≈ g.Puv(g.embLen + 3, 0)`. `v25HitTest` at the world point `g.Puv((g.sTailTop
+ g.embLen)/2, 0)` returns the stud. `v25EntBounds(s)` AABB contains BOTH
centreline endpoints (rotated-bounds fix + gate-skip).

**E3. Stud embed-grip drag under rot** — with `s` selected, simulate a
`stud-tip` drag whose cursor lands at `g.Puv(g.sFace + 80, 0)`:
`s.embedDepth === 80` (5 mm-rounded vector projection — the cosine error of the
old single-coordinate math would give 80·cos30 ≈ 69.3; assert it is 80, not 70).

**E4. Screw** — `w = { type:'screw', _v25:true, u:500, v:500,
screwSpec: V25_SCREW_DEFAULT_SPEC, screwOrient:'v-headT', rot:30 }`:
- `v25ScrewBearingFace(activeBlock, w) === null`.
- `v25FastenerCentreline(activeBlock, w)`: compute the spec's `d, tK, L, headLen
  = 1.80·d, sBear = min(tK, headLen·0.45)`; unrotated endpoints are
  `(500, 500 − (−2 − sBear)·(−1)) …` — use the in-test oracle: build the
  axis-aligned endpoints exactly as js/71:1678-1688 does with `junction = 500`,
  then `v25RotPtAbout(...,500,500,30°)`; assert seg a/b match within 0.01.
- `v25HitTest` at the rotated midpoint hits the screw.

**E4b. VGS screw (second family, second drawer)** — repeat E4 with a VGS spec
(`isVgsSpec(id) === true`, e.g. the `V25_VGS_DEFAULT_SPEC`), `v-headT, rot:30`:
- `v25FastenerCentreline` seg endpoints match the
  `_v25ScrewGlyphParams`-derived axis-aligned endpoints rotated 30° about
  (500,500) (shared mirror — one oracle covers both families).
- Draw-capture at rot:30: the centreline stroke endpoints from
  `drawVgs2D_Section` map back (px2real) onto `P(-2,0)` / `P(sTot+2,0)` oracles
  — proves the VGS drawer (js/72i:~440-615) got the same P-wrap as HBS, not just
  the hit mirror. — `bb = { type:'bolt2', _v25:true, u:500, v:500, size:'M20',
boltOrient:'h-nutR', rot:30 }`:
- `v25BoltClampSpan(activeBlock, bb)` returns `{grip:20, centre:500, …}` even
  with a plate host present (gate). With `rot:0` + host → detected span
  (unchanged behaviour).
- `v25FastenerCentreline(activeBlock, bb)`: build the axis-aligned lo/hi from
  BOLT_DB.M20 exactly as js/71:1713-1726 with the gated span, rotate both ends
  30° about (500,500); assert match. Hit-test at rotated midpoint hits.
- Draw-capture at rot:30: every captured pixel point, mapped back through
  `px2real`, must satisfy `v25RotPtAbout(inverse)` membership of the rot:0
  capture set (spot-check 3 points: shank corner, washer corner, a hex vertex).

**E6. Anchor** — `a = { type:'anchor', _v25:true, u:500, v:500, kind:'chemset',
size:'M16', embed:120, rot:90 }`:
- (Pre-existing pass) precise hit at the rotated shaft tip
  `(500 + 120·sin90, 500 − 120·cos90) = (620, 500)` hits.
- (New) `v25EntBounds(a)` contains (620, 500) — old box was
  `{L:470, R:530, B:380, T:510}` and did NOT.

**E7. Footprint orientation** — for `s` (stud, rot 30):
`_v25FastenerFootprintPoly(s, activeBlock)` is a quad whose long axis direction
`(b − a)` has `|dot| > 0.999` with the rotated axis unit
`(sin30, −cos30) = (0.5, −0.866)`.

**E8. Generic Rotation° row live** — select the stud; the SETTINGS panel
contains an input with `dataset.key === 'rot'` (generic fallback, js/71:2906-2908);
dispatching `input` with value 30 sets `s.rot === 30` and the next render
captures a rotated glyph (compare one stroke endpoint against E1's oracle).

---

## F. DXF geometry

Setup: one-page project containing (1) SHS sec `roll:0, rot:30` at (1000,1000)
(B-series), (2) stud `v-nutT, rot:30` at (500,500). Generate the DXF text via
the export entry point in js/45 and parse `(10,20)`-code vertex pairs per layer.

**F1. mem2 envelope rotated** — the S-BEAM polyline for the SHS contains the
four B1 corner coordinates (after `_dxfBlockPlace` scaling — recover the
transform by also exporting a known reference line, or compute
`_dxfBlockPlace(blk, u, v)` directly in-console and compare placed values).

**F2. Stud rod rotated** — the S-BOLT rod-outline polyline's first vertex equals
`place(g.Puv(g.sTailTop, g.dh2))` computed in-console. Centreline endpoints
equal `place(g.Puv(g.embLen + 3, 0))`-style oracles. (E0-style identity: with
rot:0 the emitted DXF string for the stud is byte-identical to pre-build.)

**F3. Bolt DXF gated span** — bolt2 `h-nutR, rot:30` with a host plate: emitted
shank vertices derive from grip 20 centred at ent.u (not the host span), each
vertex = `v25RotPtAbout(axis-aligned value, ent.u, ent.v, 30°)` then placed.

**F4. No anchor regression** — an anchor entity still emits nothing to DXF
(documented gap, must not throw).

---

## G. Save / load / session round-trip

**G1.** Build: sec GLT `roll:'90', rot:30`, legacy SHS (`roll` absent,
`rot:90`), stud `rot:30`. `saveProject()` → capture the JSON → clear → load via
`loadProject` path (or parse + assign as 46:73 does). After load:
- GLT: `v25Mem2GlyphRotDeg === 120`; roll survives as `'90'` (string) and still
  composes (A1.3 logic).
- legacy SHS: `roll` still absent, `rot === 90`, glyph 90.
- stud: `rot === 30`, `studSectionGeom(...).rotRad ≈ 0.5236`.

**G2.** Sheet-switch round-trip (`_projectSnapshotActive` → `_projectLoadSheet`):
same three assertions.

---

## H. Occlusion / depth-order (tilted occluder)

**H1.** Two sec SHS (B=100): front `f` at (1000,1000) `rot:30, z:1`; back `b`
elevation member `length:400, rot:0` at (800,1000) `z:0`. `polys =
v25DepthOccludersFor(viewKey, b.id, 0, …b outline…)` includes `f`'s ROTATED
outline (B1 corners). `v25DepthClipWorldSeg(800, 1000, 1200, 1000, polys)`
splits the segment with an occluded span whose entry/exit u-coordinates equal
the analytic intersections of the line v=1000 with the tilted square's edges:
compute the oracle in-test as the min/max u of `poly` edge intersections with
v=1000; assert the clip's occluded interval matches within 0.01. (The point:
the occluded half-span is 50·(cos30°+sin30°·tan30°) ≈ **57.74 mm**, not the old
square's 50 — the dashes start where the *tilted* edge actually is.)

---

## I. Manual browser smoke (not machine-checked, required before "done")

- I1. Double-click each: tilted UB / PFC / SHS / RHS / CHS / GLT sec; type 30 —
  glyph tilts live, centrelines + (GLT) grain + notches ride along; DevTools
  console clean.
- I2. Sec rotate ball: drag — 45° snaps, Shift frees, readout shows the COMPOSED
  angle, Ctrl+Z restores.
- I3. Selection halo hugs the diamond; hover outline matches; marquee catches a
  tilted corner.
- I4. Bolt2 / HBS screw / VGS screw / stud at 30°: glyph rotates as one rigid
  body (no axis-aligned fragments — washers, hatch band, hex nut/head, thread,
  centreline all tilt); end-on bolt crosshair tilts.
- I5. Vector PDF export of a sheet with all of the above: rotated glyphs correct
  (no axis-aligned rectangles bleeding through — the rFillRect paths must be on
  the polygon code path when rotated).
- I6. STP 6011 quality-bar check: a 30° raking SHS brace section detail with a
  rotated stud reads at least as clean as the reference page.
