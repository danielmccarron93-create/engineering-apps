# 02 — Design (BUILD CONTRACT)

Free paper-rotation for 2D-mode section glyphs (`mem2`, every memberType) and the
four 2D fixings (`bolt2` / `screw` / `stud` / `anchor`), driven by the existing
SETTINGS-panel **Rotation°** field, plus a sec rotate drag-handle. Minimal-diff:
two tiny shared helpers + call-site swaps. No new files (every edit is well under
the 150-line/new-topic bar and extends existing concepts).

---

## 1. Data model rule (the one load-bearing decision)

No new fields. No load-time migration. `ent.rot` (degrees, numeric via the
inspector's `parseFloat` at js/71-v25-selection.js:3056) becomes the **free tilt**
for sec-aspect members; `ent.roll` (may be a STRING from the inspector `<select>`,
hence `Number()` coercion — js/68-v25-tools.js:595-597) stays the **discrete base
spin/face preset** (0/90/180/270).

**Composed sec glyph angle (degrees):**

```
glyphRotDeg(sec)  = v25Mem2EffRoll(ent) + freeTilt
freeTilt          = (ent.roll != null) ? (Number(ent.rot) || 0) : 0
glyphRotDeg(elev) = ent.rot || 0          (unchanged — the drag angle)
```

Why the `ent.roll != null` guard — **the legacy mapping**: `v25Mem2EffRoll`
(js/68-v25-tools.js:593-600) returns `Number(ent.roll)||0` when roll is set, else
for sec aspect returns `ent.rot||0` (old saved sections stored their spin in
`ent.rot`). For a legacy entity (`roll == null`), effRoll *already is* `ent.rot`,
so `freeTilt` must be 0 or the spin double-counts (legacy rot=90 would render 180).
Under this rule:

| Entity state | effRoll | freeTilt | glyph | vs today |
|---|---|---|---|---|
| legacy sec, roll absent, rot=90 | 90 | 0 | 90 | **byte-identical** |
| legacy sec, roll absent, user types Rotation°=30 | 30 | 0 | 30 | free tilt works (rot IS the spin) |
| new sec (placement always stamps roll — js/69-v25-dispatch.js:553-561), roll=90, rot=0 | 90 | 0 | 90 | byte-identical |
| new sec, roll=90, rot=30 | 90 | 30 | **120** | the feature |
| new sec, roll='270' (string), rot=−30 | 270 | −30 | 240 | string roll coerced |
| elev, any roll, rot=30 | (face pick only) | — | 30 | unchanged |

**Legacy roll-write migration (one special case):** when the inspector writes
`roll` onto a sec `mem2` whose `roll` was previously `null`, zero `ent.rot` in the
same apply (§3.3) — otherwise the legacy spin stored in `ent.rot` silently changes
meaning to free tilt and ADDS to the new roll.

**Discrete consumers stay on `v25Mem2EffRoll` and must never see the composed
angle:** the elevation face/toe selectors (`effRoll === 90 || 270` at
js/68-v25-tools.js:883, `effRoll === 180` at 68:1069, face-height picks at 68:1164
and 68:1333) and the `flat = (r === 90 || r === 270)` test in `v25Mem2HalfDepth`
(js/68-v25-tools.js:1919-1920). Free rotation is sec-only; `v25Mem2EffRoll` itself
is **unchanged**.

**Fixings:** `ent.rot` (already documented in the entity specs — js/72i:31,
js/72j:29 — and already seeded `rot:0` at placement, js/69:636/656/674/694) becomes
a free spin of the whole glyph **about the placed point (ent.u, ent.v)**, composed
on top of the discrete `boltOrient`/`screwOrient`/`studOrient` enum. At rot=0 every
code path is byte-identical to today. When `rot % 360 !== 0`, the axis-aligned
host-detection scans are **bypassed** (return null / default grip) so the glyph
anchors cleanly at the placed point — a wrong-but-confident snap onto phantom faces
is worse than no snap (rotated-ray scanning is an explicit non-goal, §6).
`anchor` already implements exactly this pattern (js/68-v25-tools.js:315-336) and
needs only a bounds fix.

**Persistence:** pure passthrough — `entities2D` is serialised/loaded wholesale
(js/46-save-load.js:17, 46:73; sheet-switch deep-copies at js/05-state.js:202/233;
IndexedDB session structured-clones at js/84-session-store.js:160-184). `rot`/`roll`
round-trip untouched; old saves lacking fixing rot default to 0. Backward (new save
→ old app): the tilt in `ent.rot` is simply ignored by the old renderer.

---

## 2. Shared helpers (names, file, exact semantics)

All three go in **js/68-v25-tools.js immediately after `v25Mem2EffRoll`** (after
line 600) — band-9 V25 core, already read cross-file as classic-script globals
(js/72m already guards with `typeof v25Mem2EffRoll === 'function'`, 72m:92).
Cross-file callers guard with `typeof … === 'function'` per house style.

```js
// Composed in-plane glyph rotation of a mem2, in DEGREES. Elevation: the paper
// drag angle (ent.rot). Section: discrete roll preset + free tilt — with the
// legacy mapping (roll==null ⇒ spin lives in ent.rot ⇒ effRoll already returns
// it) counted exactly once. THE single source for every in-plane sec frame:
// drawMem2D, v25Mem2WorldOutline, v25NotchRot, snap corners, sec rotate ball.
function v25Mem2GlyphRotDeg(ent) {
  if (!ent) return 0;
  if ((ent.aspect || 'elev') !== 'sec') return ent.rot || 0;
  const free = (ent.roll != null) ? (Number(ent.rot) || 0) : 0;
  return v25Mem2EffRoll(ent) + free;
}

// Free paper-rotation of a 2D fixing (bolt2/screw/stud/anchor) in RADIANS.
// 0 ⇒ the axis-aligned fast path (byte-identical legacy behaviour).
function v25FixingRotRad(ent) {
  const d = Number(ent && ent.rot) || 0;
  return (d % 360 === 0) ? 0 : d * Math.PI / 180;
}

// Rotate world point (u,v) about (cu,cv) by rad. Returns [u,v]. Pure point
// math — the drawAnchor2D pattern (68:332-336) — NEVER ctx.rotate, because
// rRect/rFillRect resolve to ctx.strokeRect/fillRect (js/24:97/111) which the
// vector-PDF shim emits axis-aligned-only (js/44:623-631), and ctx.clip is a
// shim no-op (js/44:720).
function v25RotPtAbout(u, v, cu, cv, rad) {
  if (!rad) return [u, v];
  const c = Math.cos(rad), s = Math.sin(rad);
  const du = u - cu, dv = v - cv;
  return [cu + du * c - dv * s, cv + du * s + dv * c];
}
```

**Local sec half-dims rule** (used by the WorldOutline generalisation): every sec
glyph is drawn centred on the entity origin with **width along local u, depth
along local v**, spun by `project()` (UB I-shape ±bf/2 × ±d/2 at 68:865-869;
SHS/RHS/CHS box "Canonical depth(v) × width(u)" at 68:1140-1143; GLT likewise).
`v25Mem2HalfDepth` (68:1914-1954) returns width/2 when its effRoll is 90/270 and
depth/2 otherwise, so the local half-dims are obtainable without duplicating the
per-type DB lookups:

```js
const hW = v25Mem2HalfDepth(Object.assign({}, ent, { roll: 90 }));  // local half-WIDTH  (u)
const hH = v25Mem2HalfDepth(Object.assign({}, ent, { roll: 0  })); // local half-DEPTH  (v)
```

(The clone overrides `roll`, which also bypasses the legacy mapping — correct for
legacy entities too. PFC verified: its sec C-shape is drawn centred ±bf/2 × ±d/2
— `uSpine = -hbf` / `uOpen = +hbf`, `vSpine/vOpen = ∓hd` (js/68-v25-tools.js:
1017-1047) — so the clone trick holds for every memberType with no special case.)

---

## 3. File-by-file edit plan

> **Line-ref caveat.** All line numbers are a 2026-06-10 snapshot. Several
> in-review builds (anchor-callout-note, vgs-screw, glt-notch …) are landing in
> the same working tree and js/71 / js/72j line numbers were observed to shift
> *during* the planning session (e.g. the `v25Move` mem2-rotate branch moved
> from ~2195 to ~2234). **Anchor every edit by the named function + quoted
> code, not the line number.**

### 3.1 js/68-v25-tools.js

**(a) Add the three helpers after line 600** (§2).

**(b) `drawMem2D` line 774** — the core fix. Replace

```js
const rotDeg = (aspect === 'sec') ? effRoll : (ent.rot || 0);
```

with

```js
const rotDeg = v25Mem2GlyphRotDeg(ent);
```

Keep line 773's `const effRoll = v25Mem2EffRoll(ent);` — the elevation face
branches (883, 1069, 1164, 1333) still read it. Everything in the function rides
the one `project()` closure built from `rotDeg` (778-782) and the `strokeLine`
occlusion converter (798-799): all per-type sec glyph branches, fills, centrelines,
end caps, GLT grain (1312/1353), notch voids/outlines, cap welds. One line tilts
every memberType coherently.

**(c) `v25Mem2WorldOutline` (1993-2023)** — make the sec envelope a true
width×depth rectangle spun by the composed glyph angle, for ALL member types
(generalising the GLT special case at 2003-2011, which then folds away):

```js
if (aspect === 'sec') {
  const g = v25Mem2GlyphRotDeg(ent) * Math.PI / 180;
  const c = Math.cos(g), s = Math.sin(g);
  const hW = v25Mem2HalfDepth(Object.assign({}, ent, { roll: 90 }));
  const hH = v25Mem2HalfDepth(Object.assign({}, ent, { roll: 0 }));
  return [[-hW, hH], [hW, hH], [hW, -hH], [-hW, -hH]].map(p =>
    [ent.u + p[0] * c - p[1] * s, ent.v + p[0] * s + p[1] * c]);
}
```

Elevation branch (2016-2022 len-rect by `ent.rot`) unchanged. Keep the notch
comment (2012-2015) — notches stay un-folded. This one change propagates to:
hit-test (js/71:433-437), hover outline (71:1744-1747), depth-order occluders
(js/72h:123-128, 221-222 — clip itself is rotation-agnostic), grouping silhouettes
(js/72f:843-844), auto-mitre host clipping, and the mem2 DXF envelope
(js/45:903-913). **Known intentional change:** non-GLT sec envelopes were
hd×hd squares — RHS/UB/PFC envelopes get tighter even at rot=0 (a correctness fix:
envelope now hugs the drawn glyph; flagged in the test plan so it isn't reported
as a regression).

**(d) Verify-only (no edits):** `v25Mem2EffRoll` (593-600), `v25Mem2HalfDepth`
(1914-1954, stays discrete), the elevation-only pipelines that exclude sec —
`v25Mem2Edges` (1447), `v25Mem2Faces` (1645), `v25Mem2ResolveCap` (2132-2133),
`v25Mem2HostUnderCursor` (2094), `v25HitMemberEnd` (2189) — and `drawAnchor2D`
(315-336, the reference fixing pattern; unchanged).

### 3.2 js/72m-v25-notch.js

**`v25NotchRot` (88-95)** — HARD LOCKSTEP CONTRACT with drawMem2D's frame
("matching drawMem2D's project() closure exactly"). Replace the duplicated formula
with the shared helper:

```js
function v25NotchRot(ent) {
  const deg = (typeof v25Mem2GlyphRotDeg === 'function')
    ? v25Mem2GlyphRotDeg(ent)
    : (ent.rot || 0);
  return deg * Math.PI / 180;
}
```

`v25NotchWorldToLocal`/`LocalToWorld` (96-104), `v25NotchBodyRect` (106-115,
local-frame, frame-independent), marking/preview/flash and the notch DXF emitters
(consumed at js/45:896-934) all inherit the tilt automatically. Update the comment
at 88-89 to name the shared helper.

### 3.3 js/71-v25-selection.js

**(a) `v25EntBounds` mem2 sec branch (148-150)** — currently the unrotated
`{u±hd, v±hd}` square; tilted corners protrude past it and the PASS-1 bbox gate
(770-783) culls corner clicks. Replace with the AABB of the shared outline:

```js
if (aspect === 'sec') {
  const oc = (typeof v25Mem2WorldOutline === 'function') ? v25Mem2WorldOutline(ent) : null;
  if (oc && oc.length) {
    let L = Infinity, R = -Infinity, B = Infinity, T = -Infinity;
    oc.forEach(p => { if (p[0] < L) L = p[0]; if (p[0] > R) R = p[0];
                      if (p[1] < B) B = p[1]; if (p[1] > T) T = p[1]; });
    return { L, R, B, T };
  }
  return { L: ent.u - hd, R: ent.u + hd, B: ent.v - hd, T: ent.v + hd };
}
```

Fixes the hit gate, marquee (js/39-events.js:1885-1899) and the deselect-proximity
guard (39:429-439) in one move.

**(b) `v25EntBounds` fixing branches — rotate the box corners.** Add a small
file-local tail helper and apply it to the four fixing branches' returns:

```js
function _v25RotBounds(box, ent) {
  const r = (typeof v25FixingRotRad === 'function') ? v25FixingRotRad(ent) : 0;
  if (!r || !box) return box;
  let L = Infinity, R = -Infinity, B = Infinity, T = -Infinity;
  [[box.L, box.B], [box.R, box.B], [box.R, box.T], [box.L, box.T]].forEach(p => {
    const q = v25RotPtAbout(p[0], p[1], ent.u, ent.v, r);
    if (q[0] < L) L = q[0]; if (q[0] > R) R = q[0];
    if (q[1] < B) B = q[1]; if (q[1] > T) T = q[1];
  });
  return { L, R, B, T };
}
```

Wrap the returns of: `anchor` (106-109 — pre-existing rotation-blind box; the
precise hit at 351-362 already rotates), `bolt2` (171-199), `screw` (201-221),
`stud` (223-251). End-on ('end') orients are centred circles — invariant, but the
wrapper is a no-op there anyway.

**(c) bbox-gate skip list (line 776)** — add `stud`:

```js
const _bboxGate = b && ent.type !== 'screw' && ent.type !== 'bolt2' && ent.type !== 'stud';
```

(screw/bolt2 already skip; stud is currently gated by its axis-aligned box and a
rotated stud could be unclickable even with a correct precise test. Anchor keeps
its gate — its bounds are now rotation-aware via (b).)

**(d) `v25FastenerHit` (524-631)** — keep each branch a byte-faithful GEOMETRY
MIRROR of its drawer, now including the spin:

- *screw* (541-559): after computing the axis-aligned world endpoints
  `(a0,trans)/(aL,trans)` (553-556), rotate both via
  `v25RotPtAbout(u, v, ent.u, ent.v, v25FixingRotRad(ent))` before `real2Px`.
  (`v25ScrewBearingFace` returns null under rot per §3.5, matching the drawer.)
- *stud* (578-585): replace the `axisIsU` ternary endpoint mapping (581-582) with
  the single-source mapper: `A = real2Px(...g.Puv(g.sTailTop - 3, 0))`,
  `B = real2Px(...g.Puv(g.embLen + 3, 0))` — inherits the rotation §3.6 puts
  inside `studSectionGeom`.
- *bolt* (605-631): after computing `lo/hi/trans` (625-626), rotate the two world
  endpoints about (ent.u, ent.v) before `real2Px` (628). (`v25BoltClampSpan`
  returns the click-anchored default span under rot per §3.4, so the pivot is
  exact.)

**(e) `v25FastenerCentreline` (~1710-1766)** — same three changes as (d): screw
seg endpoints (~1725-1727, built from `_v25ScrewGlyphParams` so HBS **and VGS**
share one mirror) rotated about (ent.u, ent.v); stud `axisIsU` ternary
(~1740-1741) → `g.Puv(s,0)`; bolt seg endpoints (~1762-1765) rotated.
`_v25FastenerFootprintPoly` (1380-1407) derives its oriented quad from this
segment (1403-1406) and follows automatically; hover halo likewise.

**(f) `v25EntHandles` mem2 (846-873) — sec rotate ball.** Keep the no-end-grips
rule (855-859). After the existing `if (len > 0)` elevation ball (862-873), add:

```js
else if ((ent.aspect || 'elev') === 'sec') {
  const hd = (typeof v25Mem2HalfDepth === 'function') ? v25Mem2HalfDepth(ent) : 50;
  const g = ((typeof v25Mem2GlyphRotDeg === 'function') ? v25Mem2GlyphRotDeg(ent) : 0) * Math.PI / 180;
  const offsetMm = hd + Math.max(40, hd * 0.6);
  out.push({ key: 'rotate', shape: 'circle',
             u: ent.u + (-Math.sin(g)) * offsetMm,
             v: ent.v + ( Math.cos(g)) * offsetMm });
}
```

The ball rides the tilted glyph (CLT precedent at 899-926). It's grabbed via
`v25NearestHandleOnSelected` (1832-1847), so `v25HitHandle`'s sec skip (1928)
needs no change. Update the stale comment at 853-854 ("via the inspector for
now").

**(g) `v25Move` mem2 rotate branch (~2234-2260) — sec path.** The existing
branch early-returns for `len < 1` (~2235-2236). Insert the sec case before that
return:

```js
if (ent.type === 'mem2' && handle === 'rotate') {
  const len = ent.length || 0;
  if (len < 1) {
    if ((ent.aspect || 'elev') !== 'sec') return;
    // SEC: pivot on the entity origin; ball angle = the COMPOSED glyph angle.
    const cu = (typeof v25Drag === 'object' && v25Drag) ? (v25Drag.lastU + du) : (ent.u + du);
    const cv = (typeof v25Drag === 'object' && v25Drag) ? (v25Drag.lastV + dv) : (ent.v + dv);
    const dx = cu - ent.u, dy = cv - ent.v;
    if (dx * dx + dy * dy < 1) return;
    const oldGlyph = v25Mem2GlyphRotDeg(ent) * Math.PI / 180;
    const newGlyph = applySnappedRotation(Math.atan2(dy, dx) - Math.PI / 2,
      !!(typeof shiftHeld !== 'undefined' && shiftHeld));
    const eff = (ent.roll != null) ? v25Mem2EffRoll(ent) : 0;   // legacy: rot IS the spin
    ent.rot = newGlyph * 180 / Math.PI - eff;
    if (ent.groupId && typeof window.v25GroupOnV25Rotate === 'function') {
      window.v25GroupOnV25Rotate(ent, ent.u, ent.v, newGlyph - oldGlyph);
    }
    return;
  }
  … existing elevation body unchanged …
}
```

No `ent.u/v` re-derivation (pivot = origin). Snapping applies to the composed
angle so the 45° stops are absolute on paper. Drag-undo comes free from the
existing arm/commit pipeline (js/39-events.js:328-333, 410-412, 1786-1793).

**(h) `v25Move` stud-tip/stud-face drag (~2179-2205)** — replace the
single-coordinate projection (`cursorAxis = g.axisIsU ? cu : cv; s =
(cursorAxis - g.junction) * g.bodyDir`, ~2185-2186) with the rotation-proof
vector form (exactly equivalent at rot=0):

```js
const o = g.Puv(0, 0), a1 = g.Puv(1, 0);
const axU = a1[0] - o[0], axV = a1[1] - o[1];        // unit axis (1 mm step)
const s = (cu - o[0]) * axU + (cv - o[1]) * axV;     // replaces (cursorAxis - junction) * bodyDir
```

(`v25StudEdgeSnap` is gated off under rot in §3.6, so the snap branch only runs
axis-aligned.)

**(i) `v25SelFootprint` mem2 sec branch (1423-1433)** — route ALL sec types
through the (now generalised) outline; the GLT special case folds away:

```js
if ((ent.aspect || 'elev') === 'sec' || len === 0) {
  if (typeof v25Mem2WorldOutline === 'function') {
    const oc = v25Mem2WorldOutline(ent);
    if (oc && oc.length >= 3) return oc.map(p => ({ u: p[0], v: p[1] }));
  }
  return [{ u: ent.u - hd, v: ent.v - hd }, …existing square fallback… ];
}
```

**(j) `v25CollectSnapPoints` mem2 (1037-1053)** — sec corners must land on the
tilted glyph so dims/leaders/fixings snap to the visible corners. Branch on
aspect: sec emits origin + the 4 corners of `v25Mem2WorldOutline(ent)`; elevation
path (rot-spun ±hd at the two ends) unchanged. Fixings (1063-1069) emit the centre
point only — rotation-invariant, no change.

**(k) Inspector — legacy roll-write migration.** In the `input` listener, before
the generic `ent[k] = val` (3083), add an early-return special case (mirrors the
`weldPriority` pattern at 3064-3070):

```js
if (k === 'roll' && ent.type === 'mem2' && (ent.aspect || 'elev') === 'sec'
    && ent.roll == null) {
  ent.rot = 0;                 // legacy spin lived in ent.rot — absorb it now
  ent.roll = val;
  if (typeof v25UpdateInspector === 'function') v25UpdateInspector(); // refresh Rotation° to 0
  requestRender();
  return;
}
```

No other panel changes: the mem2 `num('Rotation°','rot',0.5)` row (2729), anchor's
own row (2674) and the generic fallback row for bolt2/screw/stud (2906-2908) all
already bind through the live listener (3041-3143) and `requestRender()` (3141).

### 3.4 js/72c-v25-bolt.js (bolt2)

**(a) `v25BoltClampSpan` (151-249)** — after the end-on and `gripOverride`
bypasses (152, 174-176), gate the scan:

```js
if (typeof v25FixingRotRad === 'function' && v25FixingRotRad(ent)) {
  return finish(20, axisPos);          // tilted: default grip, centred on the placed point
}
```

This makes `span.centre === ent.u/v` under rot, so the glyph pivots exactly about
the placed point — and it propagates automatically to the DXF branch (js/45:512)
and the hit/centreline mirrors (js/71:605, 71:1709), which call the same function.
Also in the mem2-host branch (216-222): `if ((e.aspect||'elev')==='sec' &&
typeof v25Mem2GlyphRotDeg === 'function' && (((v25Mem2GlyphRotDeg(e) % 90) + 90) % 90) !== 0) continue;`
— never clamp on the phantom axis-aligned web band of a *tilted host*.

**(b) `drawBolt2D_HorizontalSection` (323-402) and `drawBolt2D_VerticalSection`
(405-484)** — at the top of each, build the rotation context and four local
wrappers; convert the 7 numbered feature blocks to use them (byte-identical when
`W` is null):

```js
const _rr = (typeof v25FixingRotRad === 'function') ? v25FixingRotRad(ent) : 0;
const W = _rr ? (u, v) => v25RotPtAbout(u, v, ent.u, ent.v, _rr) : null;
const _ln   = (u1,v1,u2,v2) => { if (!W) return rLine(blk,u1,v1,u2,v2);
                                 const a=W(u1,v1), c=W(u2,v2); rLine(blk,a[0],a[1],c[0],c[1]); };
const _rect = (u,v,w,h) => { if (!W) return rRect(blk,u,v,w,h);
                             rPolygon(blk,[W(u,v),W(u+w,v),W(u+w,v+h),W(u,v+h)]); };
const _frect= (u,v,w,h) => { if (!W) return rFillRect(blk,u,v,w,h);
                             rFillPolygon(blk,[W(u,v),W(u+w,v),W(u+w,v+h),W(u,v+h)]); };
const _poly = (pts, fill) => (fill?rFillPolygon:rPolygon)(blk, W ? pts.map(p=>W(p[0],p[1])) : pts);
```

Call-site swaps: shank rect (356-357 / 438-439), washers (374-375, 386-387 /
456-457, 468-469) → `_frect`/`_rect`; hex head/nut polys (378-394 / 460-476) →
`_poly`; centreline (400 / 482) → `_ln`; thread (365-366 / 447-448) → pass `W` as
the new optional `mapW` arg (§3.7). `drawBolt2D_End` (289-320): circles are
invariant; optionally rotate the AF crosshair endpoints (314-318) through `W` —
include it (2 lines) so an end-on bolt visibly responds to Rotation°.

### 3.5 js/72i-v25-screw.js (screw — BOTH families: HBS and VGS)

**(a) `v25ScrewBearingFace` (198-264)** — gate at top:
`if (typeof v25FixingRotRad === 'function' && v25FixingRotRad(ent)) return null;`
(head sits at the click point — both drawers, the hit mirror (js/71 screw branch),
and DXF (js/45:623) all call this, so they bypass together). Add the same
tilted-sec-host `continue` as §3.4(a) in its mem2 branch (235-249).

**(b) `drawScrew2D_Section` (HBS, ~323-430)** — wrap the single point-mapper
(currently `const P = axisIsU ? (s, t) => [axisAt(s), trans + t] : (s, t) =>
[trans + t, axisAt(s)];` at ~355-356):

```js
const _rr = (typeof v25FixingRotRad === 'function') ? v25FixingRotRad(ent) : 0;
const P0 = axisIsU ? (s, t) => [axisAt(s), trans + t]
                   : (s, t) => [trans + t, axisAt(s)];
const P = _rr ? (s, t) => { const p = P0(s, t);
                            return v25RotPtAbout(p[0], p[1], ent.u, ent.v, _rr); } : P0;
```

Body, head, thread (`drawScrewThread` maps through P) and the bearing line
(~408-410) follow for free. Centreline (~370-377, axis-aligned `rLine` min/max):
keep as-is when `_rr === 0`; when rotated, draw
`rLine(blk, ...P(-2, 0), ...P(L + 2, 0))`.

**(c) `drawVgs2D_Section` (VGS, ~440-615)** — the vgs-screw build (in review,
2026-06-10) added a second section drawer with the SAME skeleton: its own
identical `P` closure at ~499-500 and the same axis-aligned centreline at
~504-513. Apply the exact §3.5(b) recipe to it (P-wrap + rotated centreline
endpoints `P(-2, 0)`/`P(sTot + 2, 0)`); the hex facet lines and bearing line
already map through `P` and follow. Without this, VGS screws would show a live
Rotation° row that only rotates the hit-test — the drawer/mirror pair must move
together.

`drawScrewEnt` (js/77:35-104, end-on circles + X) — rotation-invariant, no
change for either family.

### 3.6 js/72j-v25-stud.js (stud)

**(a) `v25StudBearingFace` (186-255)** — gate at top (same one-liner as §3.5(a));
add the tilted-sec-host `continue` in its mem2 branch (231-235).
**`v25StudEdgeSnap` (347-371)** — gate at top: tilted studs fall back to plain
5 mm steps (the caller at js/71:2157-2158 already handles null).

**(b) `studSectionGeom` (277-334) — the single source.** Add to the bundle:

```js
const rotRad = (typeof v25FixingRotRad === 'function') ? v25FixingRotRad(ent) : 0;
const Puv0 = axisIsU ? (s, t) => [axisAt(s), trans + t]
                     : (s, t) => [trans + t, axisAt(s)];
const Puv = rotRad ? (s, t) => { const p = Puv0(s, t);
                                 return v25RotPtAbout(p[0], p[1], ent.u, ent.v, rotRad); } : Puv0;
```

and return `rotRad` alongside the existing fields. Because the bearing snap is
null under rot, `Puv(0,0)` is exactly `(ent.u, ent.v)` — the bearing-plane point
is the pivot. Grips (js/71:951-964), grip-pick (71:1905-1917), the hit/centreline
mirrors (after §3.3(d)/(e)), the selection footprint and the DXF emitter all read
`Puv`/the bundle and follow.

**(c) `drawStud2D_Section` (496-630)** — the stragglers that don't go through
`Puv` today, each gated on `g.rotRad` (rot=0 path byte-identical):

- centreline (526-535): rotated → `rLine(blk, ...P(sTailTop - 3, 0), ...P(embLen + 3, 0))`.
- washer `rectFor` + `rFillRect`/`rRect` (511-515, 613-615): rotated → 4-point
  `rFillPolygon`/`rPolygon` of `P(sNutWash,±washHalf)/P(0,±washHalf)`.
- bond-zone hatch (540-546): rotated → replace `drawCrossHatch` with a small local
  45°-in-local-frame hatch generator clipped analytically to the local rect
  `[sFace, sHoleBot] × ±hole2` and emitted as `rLine`s through `P` (the GLT-grain
  pattern, js/68:602-610 — NOT `drawCrossHatchPoly`, whose `ctx.clip` is a
  vector-PDF no-op, js/26:46 + js/44:720).
- hex nut (618-624): rotated → `nutPts.map(p => v25RotPtAbout(p[0], p[1], ent.u, ent.v, g.rotRad))`
  (the shared `hexPointsAlongU/V` in js/33:51/72 stay axis-aligned by contract —
  callers rotate the returned points).

`drawStud2D_End` (434-480) — invariant circles/hex; no change.
`v25SyncStudEmbedReadouts` (380-399) — scalar embed numbers; rotation-independent;
verify only.

### 3.7 js/33-draw-bolt.js (shared thread helpers)

`drawThreadAlongU` (96-123) and `drawThreadAlongV` (126-150): add an optional
trailing param `mapW` (a `(u,v) → [u,v]` mapper, default null). Wrap each internal
`rLine` endpoint pair through `mapW` when present. Existing callers (3D bolts,
unchanged call sites) pass nothing — zero behaviour change. Only the rotated bolt2
drawers (§3.4(b)) pass `W`.

### 3.8 js/45-dxf-export.js

Every fixing branch funnels EVERY coordinate through its branch-local `place()`
closure (bolt 478, screw 602, stud 676 — incl. the hex builders, polylines, lines
and centrelines). Inject the rotation there, once per branch:

```js
const _rr = (typeof v25FixingRotRad === 'function') ? v25FixingRotRad(ent) : 0;
const place = (u, v) => {
  if (_rr) { const q = v25RotPtAbout(u, v, ent.u, ent.v, _rr); u = q[0]; v = q[1]; }
  const p = _dxfBlockPlace(blk, u, v); return [p.x, p.y];
};
```

End-on `_dxfCircle` centres (502-504, 608-611, 683-685) are at the pivot —
invariant. The stud branch's `g.Puv` is already rotated (§3.6(b)) — its local
`P = (s,t) => place(axisAt(s), trans + t)` (701-702) must be switched to
`P = (s, t) => { const q = g.Puv(s, t); const p = _dxfBlockPlace(blk, q[0], q[1]); return [p.x, p.y]; }`
so it doesn't double-rotate via `place()`; its `nutPts`/centreline keep funnelling
through the (rotated) `place()`. **mem2 branch (887-935): no edit** — it emits the
`v25Mem2WorldOutline` envelope (903-913) + notch segments via `v25NotchRot`
(896-902), both already on the shared composed angle. **Anchor still has no DXF
branch at all** (verified 314-936) — pre-existing gap, explicitly out of scope
(§6), flagged for its own ticket.

### 3.9 js/12-edge-snap.js

`getV25EntSnapEdges` sec branch (305-319) — a tilted glyph must not advertise
phantom axis-aligned faces. Gate per the documented near-ortho convention
(289-292, 327-337):

```js
} else if (ent.type === 'mem2' && ent.aspect === 'sec') {
  const _gd = (typeof v25Mem2GlyphRotDeg === 'function') ? v25Mem2GlyphRotDeg(ent) : 0;
  if ((((_gd % 90) + 90) % 90) !== 0) return [];   // non-ortho tilt → no axis-aligned snap
  … existing four edges unchanged …
```

(The pre-existing roll-90 imprecision — web edges still emitted on the u axis —
is NOT fixed here; bug fixes don't bundle.)

### 3.10 js/22-render-core.js

Rotate readout (133-176): line 169 prints `ent.rot`, but for a sec mem2 with a
roll preset the ball drags the COMPOSED angle. One-line fix so the readout matches
the ticks:

```js
const rotDeg = (ent.type === 'mem2' && (ent.aspect || 'elev') === 'sec'
                && typeof v25Mem2GlyphRotDeg === 'function')
  ? v25Mem2GlyphRotDeg(ent) : (ent.rot || 0);
```

The pivot math (136-140) already degenerates to (ent.u, ent.v) at len=0 — correct
for sec; no other change.

### 3.11 CHANGELOG.md

One line per user-visible change: sec free rotation (panel + rotate ball), fixing
free rotation (bolt2/screw/stud + anchor marquee fix), DXF follows, snap gating.

### Verify-only (no edits — regression checklist for the build chat)

- js/69-v25-dispatch.js — placements keep `rot:0` (553-561 sec member incl.
  comment at 547 to be updated to mention the new composition; 636/656/674/694
  fixings); ghost previews mirror them (1077-1094, 926-962). `V25_MEM_DEFAULTS`
  (224-235) untouched.
- js/23a-shs-joints.js — joints are provably elevation-only (711, 960-964,
  1326-1327); a tilted sec glyph can never be trimmed.
- js/72e / js/72g — stiffener and plate-flange joints host only on `length > 0`
  members (72e:77-81, 72g:54-55); sec excluded.
- js/72b-orientation-presets.js — placement-side roll presets (98) unaffected.
- js/42-keyboard.js — R key is 3D-only (206-238); no 2D rotate hotkey conflict.
- js/72-v25-options-bar.js monkey patches — `v25Add` wrapper (945-957) doesn't
  touch rot; `v25TryHandleClick`/`v25SetTool` wrappers pass through. The undo
  patch lives at js/71:3274-3285 (intercepts `v25Delete` only) and cannot swallow
  anything here.
- js/44-pdf-export.js + js/51 — vector PDF replays the canvas drawers through the
  shim; our pure point-math approach uses no `ctx.rotate`-dependent rects and no
  new `ctx.clip` (the two shim constraints, 44:623-631 / 44:720).
- js/46 / js/05 / js/84 — persistence passthrough (no schema work).

---

## 4. Decision: sec rotate DRAG handle — YES

Included (§3.3 f/g). Justification: it is nearly free — ~30 lines reusing
`applySnappedRotation` (js/67:155-169, Shift = free) and the established CLT /
blockWall-sec rotate-ball pattern (js/71:899-926, 2249-2323, 2326-2340); the live
pivot/ticks/readout already exist (js/22:133-176, pivot degenerates correctly at
len=0); and — decisive — the drag pipeline pushes an atomic `v25Move` undo record
(js/39:1786-1793), making the ball the ONLY undoable rotation surface, since
inspector edits push no undo (js/71:3041-3143, pre-existing for every field, not
fixed here). The panel field remains the precise numeric surface the feature
requires; the ball is the coarse visual one.

---

## 5. Files touched

| File | Edits |
|---|---|
| `js/68-v25-tools.js` | +3 shared helpers (after 600); drawMem2D:774; v25Mem2WorldOutline sec branch (1993-2023) |
| `js/72m-v25-notch.js` | v25NotchRot (88-95) → shared helper (lockstep contract) |
| `js/71-v25-selection.js` | v25EntBounds (mem2 sec 148-150; anchor 106-109; bolt2 171-199; screw 201-221; stud 223-251 + `_v25RotBounds`); bbox-gate 776; v25FastenerHit 530-631; v25FastenerCentreline ~1710-1766; v25EntHandles 846-873; v25Move sec-rotate ~2234-2260 + stud drag ~2179-2205; v25SelFootprint 1423-1433; v25CollectSnapPoints 1037-1053; inspector roll-migration before the generic `ent[k]=val` write |
| `js/72c-v25-bolt.js` | v25BoltClampSpan gate + tilted-host skip (151-249); both section drawers' wrappers (323-484); end-on crosshair (314-318) |
| `js/72i-v25-screw.js` | v25ScrewBearingFace gate + tilted-host skip (198-264); drawScrew2D_Section P-wrap + centreline (~323-430); drawVgs2D_Section P-wrap + centreline (~440-615, BOTH screw families) |
| `js/72j-v25-stud.js` | v25StudBearingFace gate + tilted-host skip (186-255); v25StudEdgeSnap gate (347-371); studSectionGeom rot-aware Puv + rotRad (277-334); drawStud2D_Section stragglers (496-630) |
| `js/33-draw-bolt.js` | optional `mapW` param on drawThreadAlongU/V (96-150), default = today |
| `js/45-dxf-export.js` | rotation injected into the branch-local `place()` of bolt2 (478) / screw (602) / stud (676); stud `P` reads `g.Puv` |
| `js/12-edge-snap.js` | sec-branch non-ortho gate (305-319) |
| `js/22-render-core.js` | rotate readout composed angle (169) |
| `CHANGELOG.md` | user-visible lines |

No `index.html`, no `css/styles.css`, no new files, no 3D-mode files.

---

## 6. Non-goals (explicit)

1. **No options-bar rotation field.** The placement bars expose orientation as
   icon-row presets only and the selected-member bar shows Section only
   (js/72-v25-options-bar.js:345-401, 636-831); the SETTINGS panel + rotate ball
   satisfy the feature. (Reader survey confirmed nothing there is trivially
   reusable — a bar field would be new UI, not a wire-up.)
2. **No 3D-mode changes.** `objects3D`, the R-key path (js/42:206-238), js/29-33
   drawers and js/64 untouched.
3. **No new entity types, no new fields.** `rot`/`roll` only.
4. **No rotated-ray host scanning.** Under `rot ≠ 0` the bolt clamp / screw + stud
   bearing / stud edge-snap scans are bypassed, and tilted sec mem2 hosts are
   skipped by the scans — a tilted stud anchors at the click point with
   catalogue/override embedment. Rotated-ray scan vs `v25Mem2WorldOutline` is a
   documented later enhancement.
5. **No anchor DXF branch.** Anchors don't export to DXF today (verified
   js/45:314-936) — pre-existing gap, own ticket.
6. **No CHS circular sec glyph fix.** CHS sections draw as a box (shares the
   SHS/RHS branch, js/68:1127-1159) and the mem2 inspector type select omits
   'chs' (js/71:2711) — both pre-existing; rotation composes on the box as-is.
7. **No inspector-edit undo.** Panel edits push no undo record (js/71:3041-3143)
   for ANY field — pre-existing, listed in Known Issues territory; the rotate
   ball provides the undoable path.
8. **No fix for the roll-90 sec snap-edge imprecision** (js/12:305-319 emits web
   edges on the u axis even when the web is horizontal) — pre-existing; this
   build only gates non-ortho tilts to zero edges.
9. **Dimensions stay dumb.** `dim2` stores free world points (js/82:6); rotating
   an already-dimensioned glyph leaves the dim where it was — same as moving a
   member today.
