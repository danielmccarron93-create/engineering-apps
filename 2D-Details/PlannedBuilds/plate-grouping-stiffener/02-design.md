# Design — grouping · joint menu · stiffener

> Captured from a 6-agent exploration of the live code on 2026-05-31. All file:line refs are from that pass; **re-verify before editing** (the tree is dirty/in-flux). CLAUDE.md is partly stale — the v2 tree is more developed than it claims, but for THIS feature the live paths are as recorded below.

## Architecture facts that govern this build

### Two coexisting systems (the central constraint)
- **v25 entities** live in `entities2D[viewKey]`, selected via global `v25Selected = []` (array of **int** ids) in `js/71-v25-selection.js:12`. Multi-select + Shift-add already work (`js/39-events.js:197`). Hit-test `v25HitTest(blk,u,v)` (`71:179`) only scans `entities2D`. Drag-move via `v25Drag` + `v25Move()` (`71:1042`) mutates `ent.u/ent.v` live, **no undo entry**.
- **v2 plates** live in `v2.appState.model.elements` (a Map), selected via `v2.tools.editPlate.state.selectedId` (single UUID string) in `js/v2/tools/edit-plate.js:44`. Body-move via `state.bodyDrag`, committed on pointerup as a `v2.transactions.editElement` (has undo). Plate polygon vertices are `{x,y}` (NOT `{u,v}`).
- **They cannot co-select today.** v2 claims plate clicks in a capture-phase `pointer*` listener (`js/v2/engine/event-dispatch.js:170-217`) and calls `stopImmediatePropagation()`; v1 uses bubble-phase `mouse*` in `js/39-events.js`. They "coexist" only because they read different stores.
- A v2 plate is **mirrored** into `entities2D` as a synthetic `plate2` (`js/v2/engine/v1-bridge.js:174-206`, `mirrorV2IntoV1`) on every `model-changed`. Mirrors are stripped before save. The mirror is what other v1 code (bolt grip scan, weld) "sees".

### Member geometry (`js/68-v25-tools.js`) — all LIVE
- `mem2` shape: `{type:'mem2', id(int), view, memberType, section, u, v, length, rot(deg), aspect, roll, endA, endB}`. `(u,v)` is the **start point**; far end `= (u+length·cosrot, v+length·sinrot)`.
- UB horizontal (rot 0), section `dbS = UB_DB[ent.section]` → `{d,bf,tf,tw,r1}`:
  - top-flange outer V = `v + d/2`; top-flange inner = `v + d/2 - tf`
  - bottom-flange outer V = `v - d/2`; bottom-flange inner = `v - d/2 + tf`
  - web centreline V = `v`; full-depth stiffener spans inner faces `[v - d/2 + tf , v + d/2 - tf]`
- SHS vertical (rot 90), `dbS = SHS_DB[ent.section]` → `{B,t}`: centreline X = `u`; faces `u ± B/2`; ends `(u,v)` and `(u,v+length)`.
- Helpers: `v25Mem2Faces(ent)` (`68:1126`) → 4 faces `{u1,v1,u2,v2,nu,nv,entId,side}` world coords, side ∈ top/bottom/start/end. `v25Mem2WorldOutline` (`68:1431`) 4-pt poly. `v25Mem2WorldCentreline` (`68:1449`) `[[u0,v0],[u1,v1]]`. `v25Mem2HostUnderCursor(blk,cu,cv,excludeId)` (`68:1503`). `getV25EntSnapEdges(ent,viewKey)` exists (used by plate snap).
- Section lookup by memberType: `ub→UB_DB`, `shs→SHS_DB`, `uc→UC_DB` (falls back to UB_DB).
- ⚠ `v25Mem2Thickness` defined twice (`68:1148` and `68:1399`); 2nd wins. For stiffener depth use `dbS.d` directly.

### Bolt entity (`js/72c-v25-bolt.js`) — LIVE (v2 bolt is dormant, flag off)
- `bolt2` shape: `{id(int), type:'bolt2', view, u, v, size:'M20', grade:'8.8', cat:'S', boltOrient:'end'|'h-nutR'|'h-nutL'|'v-nutB'|'v-nutT', rot:0, gripOverride?:num, length?}`.
- Create programmatically: `v25Add('bolt2', {...})` (`js/66-v25-helpers-frame.js:18`) — stamps `view` from `activeBlock`, pushes to `entities2D`, pushes undo, `requestRender()`. Or `mkEnt2D(viewKey,'bolt2',{...})` + `addEnt2D(ent)` to target a view.
- For a bolt **through end-plate + UB top flange**, pointing DOWN: `boltOrient:'v-nutB'` (head up, nut at bottom), set `gripOverride = plateThk + tf` so the section glyph is deterministic, then `length = computeBoltLength(gripOverride, size)`.
- Default M20 / 8.8 / S. `drawBolt2D` (`72c:255`) renders head/shank/thread/nut for section orientations; auto-grip via `v25BoltClampSpan` scans `mem2` + `plate2`.

### Weld — the existing column weld mechanism (MUST READ FIRST during build)
- Dan recently added (file is dirty) **`v25AutoWeldForPlate(plateEnt)`** and **`computeV25PlateWeld(plateEnt, blk)`** in `js/69-v25-dispatch.js` (~line 181). Comment: "v25AutoWeldForPlate is called when a plate is placed or moved." This is what produced the column→end-plate weld Dan saw.
- **OPEN for the builder:** read these two functions to learn (a) how the weld is stored — `weld` entity? segments on the plate? recomputed each render? — and (b) which members it welds to and on what trigger. The default-no-weld behaviour for the UB joint hangs on this.
- User-placed weld symbols are v1 `weld` entities (`js/35-draw-weld.js`, created via `mkEnt2D(view,'weld',{u,v,angle,weldType,size,allAround})` — see `js/23-auto-weld.js:481`). This is a fallback representation for "Weld together" if reusing `computeV25PlateWeld`'s drawing is awkward.
- 3D auto-weld (`js/23-auto-weld.js`, `computeWeldInterfaces`) is **objects3D-only** — irrelevant in 2D.

### UI surfaces
- **BB-rail tiles** (`js/74-v26-bb-rail.js`, `getDrawTabDef()`). Tile shape `{id, kind:'tool', label, sub, icon:'icon-XYZ', onClick}`. Plate tile at ~`74:242-256` routes 2D → `v2.ui.paletteBBRail.activatePlate()`. **Stiffener tile** goes right after it in the Members group; `onClick` → `v25SetTool('v25-stiffener')`.
- **Icons** are inline `<symbol id="icon-*" viewBox="0 0 20 20">` in `index.html`'s SVG sprite (~line 15+). Add `icon-stiffener` (I-beam outline + central hatched vertical bar, per the sketch). `makeTile()` (`js/60-tile-palette.js:265`) renders `<use href="#icon-…"/>`.
- **Options bar** (`js/72-v25-options-bar.js` controller; `js/72d-v25-plate.js` is the plate sub-bar template — Thickness select + 3 orientation buttons via a `#v25OrientSlot` placeholder swapped after `bar.innerHTML`). Add a `v25-stiffener` branch (Thickness + weld-both toggle).
- **Keyboard** (`js/42-keyboard.js`): `Ctrl+G` and `Ctrl+Shift+G` are **FREE**. ⚠ bare `g/G` toggles grid at `42:147` with no `!ctrlKey` guard — add the Ctrl+G handler BEFORE line 147 with `e.preventDefault(); return;`.
- **Right-click**: `js/39-events.js:1531` is just `contextmenu → preventDefault()`. No menu exists — greenfield. **Double-click**: handled in `js/39-events.js` (~1130 / ~1357 listeners); existing patterns: `v25HitTestWeld`, `hitTestJointV25`, wall-edge menu — good models for the joint menu.
- **Save/load**: `entities2D` round-trips verbatim in the v1 slice (`js/46-save-load.js`); v2 plate params round-trip via `v2.io.serialise`. So `groupId` on v25 ents, `params.groupId` on v2 plates, and a `joint2`/`stiff2` v25 entity all persist for free.
- **DXF** (`js/45-dxf-export.js`): bolt2 already exports (`45:437`); add branches for `stiff2` and joint welds.

---

## Data model additions

### groupId (grouping)
- v25 entity: `ent.groupId = '<gid>'` (string) — survives save/load.
- v2 plate: `el.params.groupId = '<gid>'`.
- New global counter in `js/07-globals.js`: `let v25GroupSeq = 0;` → gid = `'g' + (++v25GroupSeq) + '_' + Date.now().toString(36)`.
- Selection bridge globals (in 07 or 71): `let v25SelPlateIds = [];` (array of v2 plate UUIDs selected, parallel to `v25Selected`).

### joint2 (weld/bolt interface) — new v25 entity
```
{ id, type:'joint2', view,
  plateId:  <v2 plate UUID>,      // the plate at the interface
  memberId: <mem2 int id>,        // the member the plate landed on (the UB)
  columnId: <mem2 int id|null>,   // the column welded to the plate (for bolt placement origin)
  mode:     'none'|'weld'|'bolt', // default 'none'
  weldSize: 6, boltSize:'M20', boltGrade:'8.8', boltEdge:50,
  boltIds:  [<int>,...],          // bolt2 ids created in 'bolt' mode (for removal on toggle)
  groupId:  <gid|null> }
```
- mode 'weld' → draw weld ticks along the plate↔member interface edge (reuse `computeV25PlateWeld` drawing if practical, else a `weld` entity).
- mode 'bolt' → create two real `bolt2` entities (per Dan's choice) at column-centre ± (colHalf + boltEdge), `boltOrient:'v-nutB'`, `gripOverride = plateThk + tf`; store their ids in `boltIds`; tag each bolt `b.groupId = joint.groupId` so they move with the group; delete them when leaving 'bolt'.
- Interface geometry derived on demand from plateId + memberId so it stays correct after moves.

### stiff2 (web stiffener) — new v25 entity
```
{ id, type:'stiff2', view,
  u:    <centreline X, world mm>,
  vTop: <top end V>, vBot: <bottom end V>,   // default = beam inner flange faces (full depth)
  thk:  10, weld:'both', hostId:<beam mem2 int id|null> }
```
- Render: thk-wide rectangle centred on `u` from `vBot`→`vTop`, AS 1100 steel hatch, weld ticks on both vertical edges. Cut lineweight `LW.CUT`.
- Top/bottom **grip handles** for drag-shorten: vertical by default, Shift = free (angle). Lives in `js/72e-v25-stiffener.js`.

---

## Feature designs

### 1. Cross-system grouping
- **Co-selection bridge:** add `v25SelPlateIds`. On plate click in `event-dispatch`/`edit-plate`: plain → `v25SelPlateIds=[id]`, clear `v25Selected`; Shift → push id, keep `v25Selected`. On v25 click in `39-events`: plain → clear `v25SelPlateIds`; Shift → keep it. Plate selection rendering iterates `v25SelPlateIds` (not just `state.selectedId`) so multiple plates highlight.
- **Group op** (`v25Group()`): collect `v25Selected` (ents) + `v25SelPlateIds` (plates); if ≥2 total, mint gid, write `groupId` to every v25 ent and `params.groupId` to every plate (plate via `editElement` tx). `v25Ungroup()` clears them.
- **Move-together** (`v25TranslateGroup(gid, du, dv, exceptId)`): translate all v25 ents (`u/v` + related) and all v2 plates (polygon) sharing gid. Hook it into BOTH drag paths: in `v25Move` when `ent.groupId`; in edit-plate bodyDrag commit when `plate.params.groupId`. Selecting any grouped member selects the whole group (expand selection on click when `groupId` present).
- **Group-move snap to UB flange:** during a group drag, after raw (du,dv), for each plate in the group compute bbox; for each **non-group** `mem2` flange face (`v25Mem2Faces`), if the plate's outward edge is within tol, adjust (du,dv) so it lands exactly + show a snap guide. On commit, create a `joint2(mode:'none')` for the new plate↔member contact (and **suppress** `v25AutoWeldForPlate` for group moves so the UB interface is not auto-welded).

### 2. Joint menu
- **Hit-test:** on right-click / double-click in 2D select mode, test for a plate outward-edge coincident (within tol) with a member flange near the click → find/create `joint2`.
- **Menu** (reuse the small DOM-popup pattern from `v25ShowWallEdgeMenu`): "Weld together" / "Bolt together" (and "No connection"). Apply sets `joint.mode` and adds/removes welds or the two bolt2 entities. Wrap each apply in a single undo entry (v1 `connection`-style atomic undo, see `js/48-connection-builders.js:345`).
- **Right-click on a grouped selection (not on a joint):** show Group/Ungroup.

### 3. Stiffener tool — new file `js/72e-v25-stiffener.js`
- `v25SetTool('v25-stiffener')` arms it; crosshair + live ghost.
- **Preview/placement** (`v25StiffenerPreview`, `v25PlaceStiffener`): find beam under cursor (`v25Mem2HostUnderCursor` or scan horizontal mem2); centreline X snaps to nearest column's centreline (nearest vertical mem2 `.u`), or under that column's nearest **end** if cursor is near an end; Shift = free X at cursor. vTop/vBot = beam inner flange faces. Click commits a `stiff2`.
- **Edit:** select → top/bottom grip handles (in `71` hit-test + `v25Move` handles `'stiff-top'`/`'stiff-bot'`), vertical by default, Shift = angle.
- **Render** `drawStiff2D(blk, ent, cs)` dispatched from `js/69-v25-dispatch.js` router (alongside the `mem2`/`bolt2` branches).
- **Options bar** branch in `72`: Thickness (default 10), weld-both toggle.
- **DXF** branch in `45`.

---

## Files touched (authoritative)
| File | Change |
|---|---|
| `index.html` | new `<symbol id="icon-stiffener">`; load `js/72e-v25-stiffener.js` before `73-init.js` |
| `js/07-globals.js` | `v25GroupSeq`, `v25SelPlateIds` (group state globals) |
| `js/42-keyboard.js` | `Ctrl+G` group / `Ctrl+Shift+G` ungroup (before bare-`g` at :147) |
| `js/45-dxf-export.js` | `stiff2` + joint-weld DXF branches |
| `js/69-v25-dispatch.js` | render-router branch for `stiff2`; **read+adjust `v25AutoWeldForPlate`** to suppress auto-weld on group moves; joint helpers |
| `js/71-v25-selection.js` | group-aware selection expand; `v25TranslateGroup`; `joint2`/`stiff2` hit-test + grips; `v25Group`/`v25Ungroup`; plate co-selection bridge |
| `js/72-v25-options-bar.js` | `v25-stiffener` options branch |
| `js/72c-v25-bolt.js` | (reuse only — bolt creation for "Bolt together") |
| `js/72e-v25-stiffener.js` | **NEW** — stiff2 entity: geometry, preview, placement, render, options row, grips |
| `js/39-events.js` | contextmenu → group/joint menu; dblclick → joint menu; route stiffener tool clicks |
| `js/46-save-load.js` | (verify groupId/joint2/stiff2 round-trip — likely automatic) |
| `js/v2/tools/edit-plate.js` | co-selection bridge (multi-plate highlight); group-move hook on bodyDrag commit; write `params.groupId` |
| `js/v2/engine/event-dispatch.js` | Shift-click plate = additive co-selection (don't clear v25Selected) |
| `js/v2/ui/live-render.js` | highlight all `v25SelPlateIds` plates, not just `selectedId` |
| `CHANGELOG.md` | one line per visible change |

## Build phases (sequential; browser-test each boundary)
0. **Read `v25AutoWeldForPlate`/`computeV25PlateWeld`** (`69`) — confirm weld storage + trigger. This gates Phase 2 design.
1. **Stiffener** (most self-contained): icon, tile, `72e`, dispatch render, options, keyboard not needed, hit-test/grips, DXF. Test: place full-depth + drag-shorten.
2. **Grouping**: globals, co-selection bridge, `v25Group/Ungroup`, Ctrl+G/Shift+G, `v25TranslateGroup`, move-together. Test: select plate+column, group, move together.
3. **Group-move snap + joint(none)**: snap end-plate to UB flange on group move; suppress auto-weld; create joint2(none). Test: drop assembly on UB, no weld appears.
4. **Joint menu**: contextmenu/dblclick hit-test, popup, Weld/Bolt apply (+2 bolts at 50 mm), undo. Test: bolt-together → 2 bolts; weld-together → ticks; toggle.
5. **Reproduce the sketch end-to-end** + screenshot. Update CHANGELOG + this tracker.

## Verify (no node on this machine)
Per Dan's setup: copy app to `/tmp` and serve there; use the preview sandbox. Watch the console for syntax errors (no `node --check` available).
