# ChemSet anchor-stud UX edits — design spec

Follow-on to the shipped `m16-anchor-stud` feature (`js/72j-v25-stud.js`, `js/02g-data-anchor-studs.js`).
2D-mode (V25 paper-space) `stud` entity only. NOT the `anchor` callout entity. NOT 3D-mode.

## The five user requests

1. **Selection highlight is "weird and offset".** Selecting a stud should give a subtle orange
   infill that hugs the glyph, exactly like every other member/fixing.
2. **Ctrl/modifier-drag should duplicate** a stud, like other members.
3. **Top options-bar dropdown when a stud is selected** — change diameter / orientation / etc.
   from the bar at the top of the page, like other fixings/members.
4. **Drag-edit embedment:**
   - drag the **tip** (chisel end) to lengthen/shorten the embedment;
   - drag the **embedment edge** (top of the drilled/bonded zone) so it **snaps to the next host
     edge** (e.g. shift it down from top-of-grout to top-of-blockwork). The embedment depth (and
     therefore the tip) rides down with the edge.
5. **Typed embedment depth** in the inspector AND the top bar — type e.g. `300` and the rod
   extends so the bonded length is 300 mm measured from the (snapped) embedment edge.

## Root-cause analysis

- **(1) offset box.** `v25SelFootprint(ent)` (71-v25-selection.js) has no `stud` branch → falls
  through to the axis-aligned `v25EntBounds`, which builds the box around `ent.u/ent.v` (the raw
  click). But the drawn glyph, the precise hit-test (`v25FastenerHit`), and the hover halo
  (`v25FastenerCentreline`) all re-centre on `junction = v25StudBearingFace(blk,ent).face`. When
  the click was offset from the snapped face, the highlight box is offset from the glyph. `stud`
  IS already in `V25_SEL_FILL_TYPES`, so the fill is applied — to the wrong box.
- **(2) duplicate.** The copy-drag path (39-events.js:329) is generic:
  `handle === 'body' && isDupDragModifier(e)`. The stud already returns `'body'` from
  `v25HitHandle`, so **Alt-drag duplicate already works**. `isDupDragModifier` (07-globals.js:133)
  is `altKey || (ctrlKey && !IS_MAC)` → on **Mac the modifier is Alt**, not Ctrl (Ctrl+mousedown
  on Mac fires `contextmenu`, and Ctrl is reserved for wheel-zoom). No member duplicates on Ctrl on
  Mac. → **Verify** the stud duplicates on Alt-drag; do NOT globally rebind Ctrl. Communicate the
  Alt convention.
- **(3) no selected-stud bar.** `v25UpdateOptionsBar` only surfaces a *selected* entity for `mem2`
  (`v25SelectedSingleMem2`). A selected stud hides the bar.
- **(4)/(5) embedment is catalogue-fixed.** The drawer computes `embLen` and `sFace` purely from
  the catalogue; there is no per-entity override and no edit grip for them.

## Data model — two new optional `stud` fields (saved automatically via entities2D JSON)

- `embedDepth` (mm) — bonded length **below the embedment-edge datum**. The user-facing
  "embedment depth". Default (unset) = catalogue `S.embed`. Set by typing or by the tip grip.
- `faceOffset` (mm) — distance from the bearing plane (washer underside, `s=0`) down to the
  embedment-edge datum (`s = sFace`). Default (unset) = `snap ? fixtureThk : maxFixt` (today's
  behaviour). Set by the edge grip (with host-edge snapping).

**Back-compat (critical):** with both unset, the defaults must reproduce today's geometry.
For M16 with no host: `sFace = maxFixt = 40`, `embedDepth = embed = 125` → `embLen = 165 = Le` ✓
(identical to today's `embLen = L − (washT+nutH+tail)`). When snapped to a thin fixture the new
tip sits at `fixtureThk + embed` (spec-faithful: embed below concrete is always honoured) vs
today's fixed `Le`; this is the intended new behaviour and only differs in the snapped case.

## Single source of truth — `studSectionGeom(blk, ent)` (NEW in 72j)

The drawer (72j), DXF (45), hit-test + centreline + bounds + grips (71) each **re-derive** the stud
axis geometry inline today, with "KEEP IN SYNC" comments. Introducing the override fields in 6
places invites drift. Add ONE helper that returns the full section geometry and route every
consumer through it.

```js
// 72j — returns null for end-on / non-section. blk needed for the bearing snap.
function studSectionGeom(blk, ent) {
  const orient = ent.studOrient || 'v-nutT';
  if (orient === 'end') return null;
  const S   = getStudSpec(ent.studSpec) || CHEMSET_STUDS[ent.studSpec]
            || { size:'M16', d:16, L:190, Le:165, dh:18, maxFixt:40, embed:125 };
  const d=S.d||16, L=S.L||190, Le=S.Le||165, dh=S.dh||d+2;
  const maxFixt = (S.maxFixt!=null) ? S.maxFixt : Math.max(0, Le-(S.embed||Le*0.75));
  const nd=studDims(S.size,d);
  const nutAF=nd.nutAF||d*1.7, nutH=nd.nutH||d*0.86, washOD=nd.washOD||d*2.1,
        washT=nd.washT||d*0.2, minorD=nd.minorD||d*0.84, pitch=nd.pitch||Math.max(1,0.13*d);
  const axisIsU = (orient==='h-nutL'||orient==='h-nutR');
  const trans   = axisIsU ? ent.v : ent.u;
  const bodyDir = (orient==='h-nutL'||orient==='v-nutB') ? 1 : -1;
  const snap = v25StudBearingFace(blk, ent);
  const junction = snap ? snap.face : (axisIsU ? ent.u : ent.v);
  const tail = Math.max(2*pitch, (L-Le)-(washT+nutH));
  const sTailTop=-(washT+nutH+tail), sNutCrown=-(washT+nutH), sNutWash=-washT;
  // embedment-edge datum + bonded depth (user-overridable)
  let sFace = (ent.faceOffset!=null) ? Math.max(0, ent.faceOffset)
            : (snap ? Math.max(0, snap.fixtureThk) : maxFixt);
  const embedDepth = (ent.embedDepth!=null && ent.embedDepth>0) ? ent.embedDepth
                   : ((S.embed!=null) ? S.embed : Math.max(d+2, Le-maxFixt));
  let embLen = Math.max(d+2, sFace + embedDepth);
  sFace = Math.min(sFace, Math.max(0, embLen-0.5));
  const sChiselBase = embLen - d;
  const axisAt = (s)=> junction + bodyDir*s;
  const Puv = axisIsU ? (s,t)=>[axisAt(s), trans+t] : (s,t)=>[trans+t, axisAt(s)];
  return { S,d,L,Le,dh,nd,nutAF,nutH,washOD,washT,minorD,pitch,
           axisIsU,trans,bodyDir,snap,junction,tail,
           sTailTop,sNutCrown,sNutWash,sFace,embedDepth,embLen,sChiselBase,
           axisAt,Puv, washHalf:washOD/2, nutHalf:nutAF/2, dh2:d/2, hole2:dh/2 };
}
```

Consumers refactor to read from it (no behaviour change when fields unset):
- `drawStud2D_Section` (72j) — build `P` from `g.Puv`; use `g.sFace/g.embLen/g.sChiselBase/...`.
- DXF stud branch (45:675-720) — same, mapping `g.Puv(...)` through `place()`.
- `v25FastenerHit` 'stud' (71:514) & `v25FastenerCentreline` 'stud' (71:1505) — span
  `a0=axisAt(sTailTop-3)`, `aL=axisAt(embLen+3)` (exactly the drawn extents).
- `v25EntBounds` 'stud' (71:210) — AABB around `g.junction` from `sTailTop` to `embLen`, ±`washHalf`
  (use the global `activeBlock` for the snap; the file already reads `activeBlock`). Keep the
  end-on square branch.

## Edits per requirement

### (1) Oriented selection footprint — `v25SelFootprint` 'stud' branch (71, ~1267)
Return the axis-aligned rod rectangle hugging the *snapped* glyph: along axis `sTailTop → embLen`,
transverse ±`washHalf`, centred on `g.junction`. End-on → square ±`washHalf` at `ent.u,ent.v`.
This puts the existing 0.12-alpha accent fill exactly over the fixing — the members' treatment.
Apply the same oriented-footprint fix to `screw`/`bolt2` for parity (their boxes are offset by the
same root cause). [Confirm scope in design review — primary ask is the stud.]

### (2) Duplicate — verify only
Browser-verify Alt-drag clones a selected stud (generic path). No code change expected.

### (3) Selected-stud top options bar — `72-v25-options-bar.js`
- Add `v25SelectedSingleStud()` (mirror of `v25SelectedSingleMem2`).
- New branch in `v25UpdateOptionsBar`, after the `selMem` branch, before the
  `tool!=='v25-'` hide: when `sheetMode==='2d' && tool==='select'` and exactly one stud selected,
  render: **Size** `<select>` (CHEMSET_SIZES → `ent.studSpec`), **Orientation** live icon row
  (new `v25BuildStudOrientRowForEnt(ent)` in 72j — mirrors `v25BuildStudOrientationRow` but writes
  `ent.studOrient`), and (section orientations only) **Embedment depth** number input
  (`ent.embedDepth`, default-shown = effective depth). Each change → `requestRender()` +
  `v25UpdateInspector()`.
- Keep the bar in sync on select/deselect: it already refreshes via `v25UpdateInspector` /
  `setTool` / delete hooks (same as the mem2 selected bar).

### (4) Embedment grips + edge snap — `71` + `72j`
- `v25EntHandles` 'stud' (71:876): section orientations push **body** at `g.Puv(0,0)`, **stud-face**
  (circle) at `g.Puv(g.sFace,0)`, **stud-tip** (square) at `g.Puv(g.embLen,0)`; end-on keeps the
  single body grip. (Uses `activeBlock` for the snap.)
- `v25HitHandle` 'stud' (71:1720): test `stud-tip` then `stud-face` (px<11) before `return 'body'`.
- `v25Move` 'stud' (71, before the generic tail): project the cursor onto the axis →
  `s = (cursorAxis − junction) * bodyDir`.
  - `stud-tip` → `ent.embedDepth = round(max(d+2, s − g.sFace))` (edge fixed, tip moves).
  - `stud-face` → `newFace = v25StudEdgeSnap(activeBlock, ent, g, s) ?? s`;
    `ent.faceOffset = round(max(0, newFace))` (edge moves; embedDepth fixed → tip rides down).
- `v25StudEdgeSnap(blk, ent, g, sCand)` (NEW in 72j): collect host axis-faces (mem2 / blockWall /
  mat / v2-plate / plate2 whose transverse extent spans the stud) as `s` values
  `(facePos − junction)*bodyDir`; return the nearest to `sCand` within ~10 screen-px (converted to
  mm via `ppm()`), else null. Reuses the `v25StudBearingFace` host-detection pattern.
  Grid-snap (`snapOn`) applies when no edge is in range.

### (5) Typed embedment depth — inspector (71) + top bar (3)
- Inspector stud branch (71:2350), section orientations only: push
  `{kind:'num', label:'Embedment depth (mm)', key:'embedDepth', step:5, min:10, value: effDepth}`
  and `{kind:'num', label:'Edge offset (mm)', key:'faceOffset', step:5, min:0, value: effFace}`
  where `effDepth/effFace` are the resolved current values (catalogue/ detected when unset, so the
  field shows e.g. 125 not blank). The generic `input` handler already writes `ent[key]` +
  `requestRender()`.
- Top bar input wired in the (3) branch.

## Files touched
- `js/72j-v25-stud.js` — `studSectionGeom`, `v25StudEdgeSnap`, `v25BuildStudOrientRowForEnt`;
  refactor `drawStud2D_Section`.
- `js/71-v25-selection.js` — `v25SelFootprint`, `v25EntBounds`, `v25FastenerHit`,
  `v25FastenerCentreline`, `v25EntHandles`, `v25HitHandle`, `v25Move`, inspector stud branch.
- `js/72-v25-options-bar.js` — `v25SelectedSingleStud` + selected-stud branch.
- `js/45-dxf-export.js` — stud branch reads `studSectionGeom`.
- `CHANGELOG.md`, planning progress, memory.

## Test plan
- `jsc` parse-check each edited file (wrapped-fn trick — no node on PATH).
- Numeric draw-capture (per `v25-fixing-drawing` memory): default stud unchanged (M16 v-nutT:
  proj +25, tip −165, washer 37); set `embedDepth=300` → tip at `sFace+300`; set `faceOffset` →
  edge + tip shift; all four section orientations symmetric.
- Browser (serve /tmp copy on a fresh port per `local-testing-setup`): selection fill hugs glyph;
  Alt-drag duplicates; selected-stud bar shows Size/Orient/Embed; tip & edge grips drag; edge
  grip snaps to host edges; typed depth grows the rod; console clean; DXF still emits.
- Regression: existing saved studs (no override fields) render identically.
