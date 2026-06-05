# Resolved design (post adversarial design-review) — BUILD THIS

Supersedes 01-spec.md where they differ. Every edit is a self-contained additive
`else if (ent.type==='stud')` branch beside the existing screw branch — re-derive line
numbers from the LIVE file (parallel builds have shifted them). Don't touch
v25EntHit/v25HitTestStack structure (owned by selection-precision); only extend the existing
'stud' arms.

## Data model — `studSectionGeom(blk, ent)` (NEW in 72j) — ZERO-REGRESSION default
Two new optional `stud` fields: `embedDepth` (bonded length below the embedment edge) and
`faceOffset` (edge datum distance below the bearing plane). Saved automatically.

```
legacyEmbLen = max(d+2, L-(washT+nutH+tail))         // == today's embedded length (= Le all sizes)
snap   = blk ? v25StudBearingFace(blk,ent) : null    // + GUARD v25StudBearingFace: if(!blk||!blk.viewKey) return null
junction = snap ? snap.face : (axisIsU?ent.u:ent.v)
sFace  = (ent.faceOffset!=null) ? max(0,ent.faceOffset) : (snap ? max(0,snap.fixtureThk) : maxFixt)
embedDepth = (ent.embedDepth!=null && ent.embedDepth>0) ? ent.embedDepth : max(d+2, legacyEmbLen - sFace)
embLen = max(d+2, sFace + embedDepth);  sFace = min(sFace, max(0, embLen-0.5))
sChiselBase = embLen - d
```
UNSET both ⇒ embLen = legacyEmbLen exactly, in BOTH no-host and snapped cases → **no existing
drawing changes** (verified analytically; M16/M20/M24 all collapse to Le). Helper returns the
scalars + axisAt + Puv (→[u,v]) + washHalf/nutHalf/dh2/hole2 + sTailTop/sNutCrown/sNutWash +
legacyEmbLen. Returns null for orient==='end'. Tolerates null blk (snap=null, junction=ent.u/v).

## Consumers — cut over ALL in one change (else drawer/DXF/hit drift)
1. `drawStud2D_Section` (72j) — read from g.
2. DXF stud branch (45:~675) — `const g = studSectionGeom(blk, ent)` (LOCAL blk, never activeBlock); map g.Puv→place().
3. `v25FastenerHit` 'stud' (71:~514) — a0=axisAt(sTailTop-3), aL=axisAt(embLen+3).
4. `v25FastenerCentreline` 'stud' (71:~1505) — same extents.
5. `v25EntBounds` 'stud' (71:~210) — **SNAP-INDEPENDENT, inline** (NO studSectionGeom, NO activeBlock):
   junction=ent.u/v, sFace=ent.faceOffset??maxFixt, embedDepth=ent.embedDepth??(legacyEmbLen-sFace),
   AABB sTailTop..embLen ±washHalf. Mirrors the bolt2 "generous box" pattern (71:168-173).

## req1 selection fill — `v25SelFootprint(ent, blk)` gets optional blk (71:~1267)
Callers already have blk: v25DrawSelectionHighlight (1352) → pass blk. One helper fixes all three
fixings via the already-recentred centreline:
```
_v25FastenerFootprintPoly(ent, blk): cl=v25FastenerCentreline(blk,ent);
  pt → square ±radMm ; seg → rect a→b expanded ±halfW perpendicular
  halfW: stud washHalf, screw dK/2, bolt2 washOD/2
```
v25SelFootprint: `if (t==='stud'||t==='screw'||t==='bolt2'){ const fp=_v25FastenerFootprintPoly(ent,blk); if(fp) return fp; }`
(stud/screw/bolt2 already in V25_SEL_FILL_TYPES → 0.12 accent fill now lands on the right box.)

## req2 duplicate — VERIFY ONLY. Alt-drag already clones a stud (generic path; deep-JSON clone
carries the new fields). Mac modifier is Alt (Ctrl = right-click + zoom). Note Alt in CHANGELOG.

## req3 selected-stud options bar (72) — after selMem branch, before the `!tool.startsWith('v25-')` hide
`v25SelectedSingleStud()` mirrors v25SelectedSingleMem2. Branch (tool==='select' & one stud):
build innerHTML (Size <select> + #v25OrientSlot + section-only Embedment# ) → swap row inline
`slot.replaceWith(v25BuildStudOrientRowForEnt(ent))` → wire change/input inline → `return`.
Size change ⇒ delete ent.embedDepth+faceOffset. Each change → requestRender()+v25UpdateInspector().
`v25BuildStudOrientRowForEnt(ent)` NEW in 72j (writes ent.studOrient, re-renders, refreshes bar+inspector).

## req4 drag-edit grips (71 threads blk + 72j edge-snap)
- `v25EntHandles(ent, blk)` (71:~790/876): g=studSectionGeom(blk,ent); !g → body@ent.u/v;
  else body@Puv(0,0)[square], stud-face@Puv(sFace,0)[circle], stud-tip@Puv(embLen,0)[square].
  Thread blk at both callers: grip render 1379, v25NearestHandleOnSelected 1654.
- `v25HitHandle` 'stud' (71:~1720): tip/face px<11 then 'body' (first-click only; main grab is
  v25NearestHandleOnSelected→v25EntHandles 14px nearest-wins — tip/face separation >14px at usable zoom).
- `v25Move` 'stud' (71, dedicated branch BEFORE generic tail, RETURN): cu=v25Drag.lastU+du etc;
  s=(axisIsU?cu:cv - junction)*bodyDir;
  stud-tip → ent.embedDepth=round(max(d+2, s - sFace));
  stud-face → if(ent.embedDepth==null) ent.embedDepth=round(g.embedDepth);  // pin bond → tip rides
              newFace=v25StudEdgeSnap(activeBlock,ent,g,s) ?? s; ent.faceOffset=round(max(0,newFace));
  (never touches ent.u/ent.v.)
- `v25StudEdgeSnap(blk,ent,g,sCand)` NEW in 72j: iterate entities2D[blk.viewKey]; for
  e of mem2/mat/blockWall/plate2 (e!==ent) take v25EntBounds(e); if transverse spans the stud,
  both axis-faces → s=(facePos-junction)*bodyDir; nearest to sCand within tol mm = 10/(viewport.zoom/drawingScale);
  wins over grid even when snapOn. (v2-plate edge-snap deferred — mats/blockWall cover the scenario.)

## req5 typed embedment — inspector (71:~2350) + bar (section orientations only / g!=null)
Inspector: push `{kind:'num',label:'Embedment depth (mm)',key:'embedDepth',step:5,min:10,value:effDepth}`
and `{label:'Edge offset (mm)',key:'faceOffset',step:5,min:0,value:effFace}` where eff* come from
studSectionGeom(resolvedBlk,ent).embedDepth/.sFace (one resolver, shows what's drawn).
Apply handler: empty embedDepth/faceOffset → delete ent[k] (clean reset, like opacity);
key==='studSpec' on a stud → delete ent.embedDepth+faceOffset.

## Test
parse-check each file (osascript JXA new Function, or jsc wrapped-fn). Numeric draw-capture:
default M16/M20/M24 unchanged (tip == legacy Le); embedDepth=300 → tip at sFace+300; faceOffset move →
edge+tip shift, bond fixed; 4 section orientations symmetric. Browser (port 8930): fill hugs glyph
(stud+screw+bolt2); Alt-drag dup; selected-stud bar Size/Orient/Embed; tip+edge grips; edge snaps to
grout/blockwork edges; typed depth grows rod; console clean; DXF emits. Regression: pre-existing studs
(no override) identical; multi-view DXF.
