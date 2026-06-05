## Implementation Brief — Bluebeam/Revit-style DIMENSION (Measure) tool, 2D mode

### 0. Verified against source (contradictions resolved)

I read the live code at the cited lines before writing this. Findings that override or reconcile the maps:

- **`v25TryHandleClick` two-click template (`v25-leader`) is at `js/69-v25-dispatch.js:581`** (the function header/guard is ~line 270; maps cited 270/562/581 — 581 is the leader branch). `v25-mesh` two-click-with-rect is at line 566.
- **`drawDim2D` is at `js/34-draw-2d.js:120`.** Confirmed it hardcodes `ctx.lineWidth = 0.8` (line 124) and tick width `1.2` (line 144) in **raw px**, colours from **`--mute`** (line 121), and the label is **always recomputed**: `len < 1 ? len.toFixed(1) : Math.round(len)` (line 149). **`ent.text` and any text-override are never read.** This confirms the "legacy dim label is structurally read-only" gotcha.
- **`v25Move` generic body tail (`js/71-v25-selection.js:1296-1303)`** translates `ent.u/v`, `ent.tipU/tipV`, `ent.txtU/txtV`, and `ent.pts[]` — it does **NOT** translate `p1u/p1v/p2u/p2v`. Decisive for field naming (see Decision 2).
- **`leader2` uses flat suffixed fields** (`tipU/tipV/txtU/txtV`), confirmed at `v25Move:1126-1127`. Flat is the house convention.
- **Keyboard 'm'**: `Shift+M` (line 25) toggles sheet mode; plain `m`/`M` (lines 29-31) → `setTool('mirror')`. The 2D-mode v25 binding pattern is `js/42-keyboard.js:99` (`t` → `v25SetTool('v25-note')` guarded `sheetMode==='2d'` with an early `return`).
- **BB-rail "Measure" section is at `js/74-v26-bb-rail.js:323`** (maps cited 311/312 — the section title object is 323, tiles `a-aligned`/`a-dimH` at 324/327), both routing to legacy `setTool('dimension')`.
- **DXF `dim` branch is at `js/45-dxf-export.js:363`**; layer `S-DIM`; uses `_dxfBlockPlace` + `_dxfLine` + `_dxfText`.

---

### 1. ARCHITECTURE — build a NEW V25 entity type `dim2` (do NOT extend legacy `dim`)

**Recommendation: a new `_v25:true` entity of `type:'dim2'`, armed by a new `v25-measure` tool.** All 8 maps converge on this; the live code confirms why:

1. **The legacy label is unfixable in place.** `drawDim2D:149` always recomputes the number from geometry and never reads any text field. The required "type letters → text label" feature has *no field to live in*; honouring it means rewriting the renderer regardless — so we write a fresh renderer.
2. **Legacy `dim` is not `_v25`.** Every V25 selection/grip/drag/dblclick/snap loop gates on `if (!ent._v25) continue;` (e.g. `v25HitTestStack`, `v25CollectSnapPoints`). To give legacy `dim` drag-to-offset + grips + inline-edit you'd either flag it `_v25` (which then re-routes it through `v25DrawEnt`, breaking the legacy `drawDim2D` dispatch at `drawEnt2D:59` *and* the 3D-mode dimension tool that shares the type) or duplicate the whole v25 selection stack for a non-`_v25` type. Both fork the entity.
3. **Legacy `dim` is shared and load-bearing elsewhere.** It is created by the 3D-mode `tool==='dimension'` flow (`js/39-events.js` ~405) **and** by `_connDimH` in `js/48-connection-builders.js:58` (cap-plate/baseplate builders), is layer-keyed under "Dimensions" (`js/53-layers-panel.js`), and has a DXF branch (`js/45:363`). Changing its shape risks all three. The new tool is explicitly 2D-paper-space only.
4. **Idiomatic fit.** `leader2` (two free points + text) is a near-identical precedent already wired through the full V25 pipeline. A clean new v25 type follows the same pattern that retired the v1 `plate2` into the v2 path.

We **reuse legacy `drawDim2D`'s aligned-branch *geometry math* (lines 127-156) as the blueprint**, but write a separate `drawDim2_2D` for the `dim2` type with: LW-scaled thin lines, dashed extension lines, paper-constant offset/text sizing, upside-down text flip, and honouring `ent.textOverride`.

**Tool name:** `v25-measure`. **Entity type:** `dim2`. (Both names appear across the maps; I'm fixing `v25-measure` for the tool and `dim2` for the entity — see Decision 1.)

---

### 2. DATA MODEL — the `dim2` entity (every field)

Created via `v25Add('dim2', {...})` (`js/66-v25-helpers-frame.js:18`), which stamps `_v25:true` and the `mkEnt2D` base fields. **Use flat suffixed coordinate fields** (matches `leader2` + legacy `dim`; see Decision 2).

```
{
  // --- base fields, auto-set by mkEnt2D / v25Add ---
  id,                    // int, ent2dIdN++
  type: 'dim2',
  view,                  // activeBlock.viewKey ('elevation' in 2D mode)
  layer: '0',
  ls: 'solid',
  _v25: true,

  // --- geometry (real-world mm, view-local u/v; v is Y-up) ---
  p1u, p1v,              // measured point 1 (the ANCHOR for typed-length rescale)
  p2u, p2v,              // measured point 2
  off,                   // signed perpendicular offset of the dim line from the
                         //   p1→p2 span, in PAPER-mm (see Decision 3). Default 20.

  // --- value / label ---
  textOverride: null,    // null  => label = formatted measured length (auto)
                         // string of letters => that text is the label (geometry unchanged)
                         //   (digits typed during placement set length, NOT this field)

  // --- styling (defaults seeded from v25Last; see options bar) ---
  lw: 0.18,              // AS1100 thin (LW.DIM); override mkEnt2D's 0.35 default
  sz: 2.5,              // text cap height, paper-mm (v25Last.dimTextH)
  term: 'tick',          // terminator: 'tick' | 'arrow' | 'dot' (v25Last.dimTerm)
  prec: 0,               // decimal places 0..3 (v25Last.dimPrec)
  units: 'mm',           // 'mm' | 'm' (v25Last.dimUnits)

  // --- common display overrides auto-appended by v25UpdateInspector ---
  colour, opacity, rot   // (rot unused by dim2 geometry; ignore on render)
}
```

**Derived label:** `textOverride ?? formatLen(hypot(p2-p1), prec, units)`.
**Typed-length rescale (anchored at P1):** keep `p1u/p1v`; `ang = atan2(p2v-p1v, p2u-p1u)`; `p2u = p1u + cos(ang)*len`, `p2v = p1v + sin(ang)*len`.

**Global state to add (`js/07-globals.js`, feature-prefixed per Known-issue #4):**
```
let measureP1 = null;        // {u,v} mirror of v25State.dragStart for the keyboard typing block
let measureDimInput = '';    // typed-digit buffer
let measureDimActive = false;// true while a typed length is being entered
let measureAwaitId = null;   // id of the just-placed dim2 awaiting digit/letter typing
let dimEditor = null;        // {ent, el, blk, raf} — inline double-click editor state
```
Reset all five in `v25SetTool` (`js/69:143`) and in the Escape branch (`js/42-keyboard.js` ~235). The first-click anchor itself lives on **`v25State.dragStart`** (so `getCursor`'s ortho origin picks it up automatically — see Interaction §3); `measureP1` is kept in sync only so the keyboard typing block can read it.

Save/load is automatic (entities2D JSON). No save-format change.

---

### 3. INTERACTION STATE MACHINE

States are driven by `tool`, `v25State.dragStart`, `measureAwaitId`, `measureDimActive`, and `dimEditor`.

```
[idle: tool !== 'v25-measure']
   │  'm' key (sheetMode==='2d')  OR  BB-rail "Measure" tile
   ▼
[ARMED]  tool='v25-measure', v25State.dragStart=null, measureP1=null
   │  drawClickPreview shows a crosshair + "Measure" marker at getCursor()
   │
   │  1st canvas click  →  v25TryHandleClick (js/69, new v25-measure branch)
   │     v25State.dragStart = {u:cu, v:cv, blk};  measureP1 = {u:cu, v:cv};  requestRender()
   ▼
[RUBBER-BAND]  dragStart set, no entity yet
   │  mousemove: cursor comes through getCursor() already ortho-snapped
   │     (45° default; orthoOn → 90°; Shift → free — getCursor's v25OrthoForce
   │      includes 'v25-measure', and dragStart is the ortho origin).
   │  drawClickPreview renders the GHOST: dashed extension lines + offset dim
   │     line + live "NNN mm" pill (flips to typed buffer if measureDimActive).
   │
   │  2nd canvas click  →  v25TryHandleClick second branch
   │     u,v = cursor (already snapped). off = default paper-mm (v25Last.dimOffset||20).
   │     ent = v25Add('dim2', {p1u,p1v,p2u:u,p2v:v, off, textOverride:null, lw:0.18, ...seeded styling})
   │     v25Selected = [ent.id]; v25UpdateInspector();
   │     v25State.dragStart = null;  measureAwaitId = ent.id;  measureDimInput=''; measureDimActive=false;
   ▼
[AWAITING-INPUT]  entity placed + selected, measureAwaitId set
   │  (keyboard handler, js/42, new block gated on tool==='v25-measure' && measureAwaitId)
   │   - digit / '.'  → measureDimInput += key; measureDimActive=true; requestRender()
   │   - Backspace    → pop measureDimInput (clear measureDimActive when empty)
   │   - Enter        → if measureDimActive && measureDimInput parses > 0:
   │                       RESCALE ent (anchor p1, move p2 along p1→p2 dir by len);
   │                     clear buffer; measureAwaitId=null  → [PLACED]
   │   - a letter key  → switch to text-label mode: set ent.textOverride to the letter,
   │                       keep capturing into textOverride until Enter;  → label committed
   │   - Esc          → clear buffer + measureAwaitId; entity stays as placed  → [PLACED]
   │   - (clicking again to start a new dim also exits AWAITING-INPUT)
   ▼
[PLACED]  normal selectable v25 entity
```

**POST-PLACEMENT behaviours (inherited / wired):**

- **Drag to change offset.** Once `dim2` has `v25EntBounds`/`v25EntHandles`/`v25HitHandle`/`v25Move` branches, the *entire existing drag pipeline works for free*: `v25NearestHandleOnSelected` (14px generous pickup, `js/71:872`) → mousedown sets `v25Drag` + `undoBefore` (`js/39` ~291) → mousemove computes `du/dv` and calls `v25Move` (`js/39` ~1159) → mouseup pushes `{act:'v25Move', before, after}` (`js/39` ~1498). The `'off'` grip's `v25Move` branch projects the dragged cursor onto the span-perpendicular and writes `ent.off` (paper-mm). `'p1'`/`'p2'` grips move endpoints (label auto-recomputes). `'body'` translates both endpoints (explicit branch required — generic tail won't touch `p1u..p2v`).
- **Double-click to edit value/text.** In the **first** dblclick listener (`js/39-events.js:1281`), after `nbOpenEditorAt` (~1301) and **before** the generic `if (hit){…Settings tab}` fallback (~1336), add: if the hit entity is `dim2`, call `dimOpenEditor(ent, blk)`. This spawns a small single-line `<input>` overlay centred on the dim-line midpoint (copy the noteBox editor lifecycle, §6 below). On commit: numeric → rescale (anchor P1, move P2), `textOverride=null`; letters → `ent.textOverride = value`. **Push a manual undo entry** around the commit (inline edits are NOT auto-undone — see Decision 5).

---

### 4. FILE-BY-FILE PLAN

Order = build sequence. Each step names the function, the line, and the pattern to copy.

#### Phase 1 — entity + renderer (placeable & visible)

**`js/07-globals.js`** (after the `platePts`/`plateDim*` block ~line 52-55)
Add the five `measure*`/`dimEditor` globals from the Data Model section. Feature-prefixed; no `window.*`.

**`js/96-v25-dimension.js`** *(NEW — band 9, 2D-mode only; >150 lines, topically distinct → its own file per CLAUDE.md)*
Write `function drawDim2_2D(blk, ent, cs)`. Copy the **scaffolding** from `drawLeader2D` (`js/68-v25-tools.js:429`): resolve colour (`--mute` to match dims, not `--entity-color`), wrap body in `const a=ctx.globalAlpha; ctx.globalAlpha = a * v25EntOpacity(ent); try{…}finally{ctx.globalAlpha=a;}`. Copy the **geometry** from `drawDim2D` aligned branch (`js/34:127-156`): perpendicular unit `nx=-dv/len, ny=du/len`. **Differences from legacy (the quality-bar fixes):**
   - Offset is **paper-mm**: compute the perpendicular *in px* from the two measured screen points and step `off * _nbZoom()` px along it (`_nbZoom` = `js/97-v25-notebox.js:403`), NOT `nx*off` in real-mm. This keeps the standoff constant across drawing scales.
   - Extension lines **dashed + thin**: `ctx.setLineDash(DASH.HIDDEN)` ([5,3], `js/03-data-bolts.js:53`); width `Math.max(0.25, LW.DIM * ppm())`; leave a ~1.2*_nbZoom px gap at the measured point and a small overshoot past the dim line (AS1100 witness-line style); `ctx.setLineDash([])` after.
   - Dim line **thin solid**, `Math.max(0.25, LW.DIM*ppm())`.
   - **Terminators** by `ent.term`: `'tick'` = 45° slashes scaled by `_nbZoom` (not fixed 4px); `'arrow'`/`'dot'` = reuse `_nbDrawArrowHead` (`js/97:407`).
   - **Label**: `ent.textOverride ?? formatLen(...)`; render with `nbStrokeText` (`js/96-stroke-font.js:385`) at `align:'center'`, cap height `ent.sz * _nbZoom()`; **flip text 180° when `|angle| > PI/2`** so it never reads upside-down (legacy does NOT do this). Optionally punch a gap in the dim line behind the text using `nbStrokeTextWidthPx` (`js/96-stroke-font.js:303`).
   - Skip the label draw when `ent._editing` is set (so it doesn't double under the inline editor — copy the `if (!ent._editing)` guard idiom from `drawNoteBox2D:521`).
   Add `'use strict';` header. Register the file in `index.html` after `js/95`/before `js/97` (band-9 slot).

**`index.html`**
Add `<script src="js/96-v25-dimension.js"></script>` in the band-9 group (after the other 2D-mode scripts, before `73-init.js`).

**`js/69-v25-dispatch.js`** — render dispatch, `v25DrawEnt` (line 8)
Add: `if (ent.type === 'dim2' && typeof drawDim2_2D === 'function') { drawDim2_2D(blk, ent, cs); return true; }` (use the `typeof` guard like the noteBox line so load-order is forgiving).

**`js/69-v25-dispatch.js`** — click placement, `v25TryHandleClick`, insert near the `v25-leader` branch (line 581)
```js
if (tool === 'v25-measure') {
  if (!v25State.dragStart) {
    v25State.dragStart = { u: cu, v: cv, blk };
    measureP1 = { u: cu, v: cv };
  } else {
    const a = v25State.dragStart;
    const ent = v25Add('dim2', {
      p1u: a.u, p1v: a.v, p2u: cu, p2v: cv,
      off: (v25Last.dimOffset || 20), textOverride: null, lw: 0.18,
    });
    v25Selected = [ent.id];
    if (typeof v25UpdateInspector === 'function') v25UpdateInspector();
    v25State.dragStart = null;
    measureAwaitId = ent.id; measureDimInput = ''; measureDimActive = false;
  }
  return true;
}
```
(cu/cv arrive already snapped/ortho-constrained from `getCursor`.)

**`js/69-v25-dispatch.js`** — `v25SetTool` (line 143)
Add `measureP1 = null; measureDimInput = ''; measureDimActive = false; measureAwaitId = null;` to the reset block (alongside the existing `dimStep`/`platePts` resets).

#### Phase 2 — live preview

**`js/38-crosshair.js`** — `drawClickPreview`, add branch near the existing v25 previews (~line 347)
```js
else if (tool === 'v25-measure' && blk) {
  const [cu, cv] = getCursor(blk);
  if (!v25State.dragStart) { /* draw crosshair + "Measure" marker at cursor */ }
  else {
    const a = v25State.dragStart;
    const previewEnt = { type:'dim2', p1u:a.u, p1v:a.v, p2u:cu, p2v:cv,
      off:(v25Last.dimOffset||20), textOverride:null, _v25:true, _preview:true, opacity:0.5 };
    ctx.save();
    // optional: show typed buffer in the pill when measureDimActive
    if (typeof drawDim2_2D === 'function') drawDim2_2D(blk, previewEnt, cs);
    ctx.restore();
  }
}
```
Reusing the real drawer gives a pixel-identical ghost (the `v25-wall-sec` preview does the same). Live readout pill copies the `dimText` switch from the draw-plate preview (`js/38` ~270): `measureDimActive && measureDimInput ? measureDimInput+'_ mm' : Math.round(rubberLen)+' mm'`.

#### Phase 3 — selection / grips / drag (post-placement offset edit)

**`js/71-v25-selection.js`** — `v25EntBounds` (line ~17/109), add near the `leader2` branch
```js
if (ent.type === 'dim2') {
  const du=ent.p2u-ent.p1u, dv=ent.p2v-ent.p1v, len=Math.hypot(du,dv)||1;
  const nx=-dv/len, ny=du/len; // NOTE: bounds use real-mm off here for a generous box
  const d1u=ent.p1u+nx*ent.off, d1v=ent.p1v+ny*ent.off;
  const d2u=ent.p2u+nx*ent.off, d2v=ent.p2v+ny*ent.off;
  const us=[ent.p1u,ent.p2u,d1u,d2u], vs=[ent.p1v,ent.p2v,d1v,d2v];
  return { L:Math.min(...us)-8, R:Math.max(...us)+8, B:Math.min(...vs)-10, T:Math.max(...vs)+10 };
}
```
*(bounds is a coarse AABB only; precise hit can stay generic for v1.)*

**`js/71-v25-selection.js`** — `v25EntHandles` (line ~297/359), add `} else if (ent.type === 'dim2') {`
Emit `{key:'p1',u:ent.p1u,v:ent.p1v}`, `{key:'p2',u:ent.p2u,v:ent.p2v}`, and the offset grip at the dim-line midpoint: compute `nx,ny` and push `{key:'off', shape:'circle', u:midU+nx*ent.off, v:midV+ny*ent.off}` (mirror the mem2 `'rotate'` ball math at lines 322-333).

**`js/71-v25-selection.js`** — `v25HitHandle` (line ~915/921), add near the `leader2` block
`if (ent.type==='dim2'){ if (distPx(ent.p1u,ent.p1v)<10) return 'p1'; if (distPx(ent.p2u,ent.p2v)<10) return 'p2'; if (distPx(offMidU,offMidV)<12) return 'off'; }`

**`js/71-v25-selection.js`** — `v25Move` (line 1116), add **before** the generic body tail (line 1296)
```js
if (ent.type === 'dim2') {
  if (handle === 'p1') { ent.p1u += du; ent.p1v += dv; return; }
  if (handle === 'p2') { ent.p2u += du; ent.p2v += dv; return; }
  if (handle === 'off') {
    const cu = (v25Drag) ? (v25Drag.lastU + du) : du;   // reconstruct cursor (rotate-branch trick @1143)
    const cv = (v25Drag) ? (v25Drag.lastV + dv) : dv;
    const d2u=ent.p2u-ent.p1u, d2v=ent.p2v-ent.p1v, len=Math.hypot(d2u,d2v)||1;
    const nx=-d2v/len, ny=d2u/len;
    const midU=(ent.p1u+ent.p2u)/2, midV=(ent.p1v+ent.p2v)/2;
    // signed perpendicular projection; convert real-mm delta to paper-mm offset
    ent.off = ((cu-midU)*nx + (cv-midV)*ny) / (typeof drawingScale==='number'?drawingScale:1);
    return;
  }
  // body: generic tail won't move p1..p2, so translate explicitly
  ent.p1u += du; ent.p1v += dv; ent.p2u += du; ent.p2v += dv; return;
}
```
*(`off` is paper-mm but the drag delta is real-mm — divide by `drawingScale`. Keep the same normal convention `nx=-dv/len, ny=du/len` end-to-end across renderer, handles, and this branch.)*

**`js/71-v25-selection.js`** — `v25HitTestStack` (line ~189/231), *optional precise hit*
For tight clickability on the thin lines, add a `if (ent.type==='dim2'){…distToSeg on dim line + label box…; push(ent); continue;}` branch before the generic bounds fallback (copy the `leader2` on-line test + the local `distToSeg` at line 203). Not strictly required for v1 — the generic bounds path already makes it selectable.

#### Phase 4 — keyboard

**`js/42-keyboard.js`** — activation, insert **above** the mirror line (line 29), after the `Shift+M` toggle (line 25)
```js
if ((e.key === 'm' || e.key === 'M') && !e.shiftKey && !(e.ctrlKey || e.metaKey)
    && sheetMode === '2d' && typeof v25SetTool === 'function') {
  v25SetTool('v25-measure'); return;
}
```
(Leave the existing mirror binding for 3D mode untouched; the `return` prevents fall-through.)

**`js/42-keyboard.js`** — digit/letter capture, add a block modelled on the draw-plate dynamic-dimension block (lines 166-202)
Gate on `tool === 'v25-measure' && measureAwaitId`. Look up the ent (`entities2D[activeBlock.viewKey].find(x=>x.id===measureAwaitId)`):
   - `/^[0-9.]$/` → `measureDimInput += e.key; measureDimActive=true;` `preventDefault()`.
   - `Backspace` (when `measureDimActive`) → pop; clear active when empty.
   - `Enter` (when `measureDimActive` && `measureDimInput`) → `const len=parseFloat(measureDimInput);` if `>0`, rescale: `ang=atan2(ent.p2v-ent.p1v, ent.p2u-ent.p1u); ent.p2u=ent.p1u+cos(ang)*len; ent.p2v=ent.p1v+sin(ang)*len; ent.textOverride=null;` then clear buffer + `measureAwaitId=null`. `preventDefault()`.
   - a `/^[a-zA-Z]$/` key → switch to label mode: `ent.textOverride = (ent.textOverride||'') + e.key;` `preventDefault()` (so 'd' doesn't fire the dimension-tool shortcut at line 98); Enter commits + clears `measureAwaitId`.
   - `requestRender()` on every branch. **Push a manual undo entry** if you want the typed rescale/label undoable (see Decision 5).
   The line-19 INPUT/SELECT/TEXTAREA guard already protects the inline editor.

Add `measureP1=null; measureDimInput=''; measureDimActive=false; measureAwaitId=null;` to the Escape clearing branch (~line 235).

#### Phase 5 — double-click inline editor

**`js/96-v25-dimension.js`** (same new file) — add `dimOpenEditor(ent, blk)`, `_dimEnsureInput()`, `_dimPositionEditor()`, `_dimEditorTick()`, `_dimCloseEditor(commit)`, `_dimOutsideClick(e)`.
Copy the noteBox editor lifecycle **verbatim, renamed** (`nbOpenEditor` `js/98:519`, `_nbEnsureTextarea` `js/98:408`, `_nbPositionEditor` `js/98:440`, `_nbEditorTick` `js/98:512`, `nbCloseEditor` `js/98:599`, `_nbOutsideClick` `js/98:588`). Three deltas:
   1. Element is a single-line `<input type="text">` (id `dimEditorTA`), not a textarea; same dashed-accent cssText, `z-index:60`, appended to `#canvas-container`.
   2. Position **centred on the dim-line midpoint** (real2px of midpoint, minus half editor w/h) — not the entity top-left. Keep the mandatory `offL/offT` canvas-offset correction.
   3. On commit (`_dimCloseEditor(true)`): parse `el.value.trim()`; if numeric (`/^[0-9.+\-eE\s]+$/` && finite) → rescale (anchor P1), `textOverride=null`; else → `ent.textOverride = value`. Wrap in a manual undo snapshot (Decision 5). Set/clear `ent._editing`; tear down rAF + outside-click listener + DOM node; `requestRender()` + `v25UpdateInspector()`.
   Keep `e.stopPropagation()` on plain keys and the capture-phase + `stopImmediatePropagation` outside-click guard (so the closing click doesn't drop a stray dim).

**`js/39-events.js`** — first dblclick listener (line 1281), insert after `nbOpenEditorAt` (~1301), before the generic `if (hit)` Settings fallback (~1336)
```js
if (hit && hit.type === 'dim2' && typeof dimOpenEditor === 'function') {
  dimOpenEditor(hit, activeBlock); e.preventDefault(); return;
}
```

#### Phase 6 — discoverability + options + inspector + export

**`js/74-v26-bb-rail.js`** — `getDrawTabDef`, "Measure" section (line 323), add a tile
```js
{ id: 'v25-measure', kind: 'tool', label: 'Measure', icon: 'icon-dim-aligned',
  onClick: () => { if (sheetMode === '2d' && typeof v25SetTool === 'function') v25SetTool('v25-measure'); } },
```
Gate on `sheetMode==='2d'` like the Plate/Stiffener tiles. Leave the legacy `a-aligned`/`a-dimH` tiles as-is (Decision 4). Add `if (tool === 'v25-measure') return 'v25-measure';` to `v25ActiveTileId` (`js/69` ~825) for active-tile highlight.

**`js/72-v25-options-bar.js`** — `v25UpdateOptionsBar` (line 20), add `else if (tool === 'v25-measure')`
Mirror the `v25-leader` branch structure: `html += '<strong>Dimension</strong>'` + `fld()` controls for Text height (number→`v25Last.dimTextH`), Terminator (select tick/arrow/dot→`v25Last.dimTerm`), Precision (select 0..3→`v25Last.dimPrec`), Units (mm/m→`v25Last.dimUnits`), and Offset (number→`v25Last.dimOffset`). Wire with `wire`/`wireInput` writing onto `v25Last` (which survives `v25SetTool`; `v25State` does not). Defaults live on `v25Last` (`js/65:103`). **Optionally** extend the `v25Add` monkey-patch (`js/72:299`) with `if (type==='dim2'){ props = Object.assign({}, props, { sz:v25Last.dimTextH, term:v25Last.dimTerm, prec:v25Last.dimPrec, units:v25Last.dimUnits }); }` so every new dim is seeded from the bar.

**`js/71-v25-selection.js`** — `v25UpdateInspector` (line 1308), add `else if (ent.type === 'dim2')` near the leader2 case (~1372)
`num('Offset (mm)','off'); num('Text height (mm)','sz',0.5); sel('Terminator','term',['tick','arrow','dot']); sel('Precision','prec',['0','1','2','3']); sel('Units','units',['mm','m']); txt('Override label (blank → measured)','textOverride');` The generic input listener (line 1598) round-trips them (note: inspector edits don't push undo — consistent with every other v25 type).

**`js/45-dxf-export.js`** — `_dxfEmit2DEntity` (line 314), add `else if (ent.type === 'dim2')` mirroring the `dim` branch (line 363/378-385)
Compute the offset dim-line endpoints (perpendicular `nx,ny`, real-mm offset), `_dxfLine(b,'S-DIM', d1.x,d1.y,d2.x,d2.y)`, optionally the two extension lines (plain LINEs — DXF has no per-entity dash in this codebase; the existing `dim` branch omits them, matching is fine), and `_dxfText(b,'S-DIM', mid.x, mid.y+2, ent.textOverride ?? Math.round(hypot(...)).toString(), 2.5)`. Use `_dxfBlockPlace` (line 154) for all points.

**Save/load + PDF:** automatic. Save round-trips `entities2D` JSON; PDF picks up `drawDim2_2D` via the shared canvas path (`ppm()`=1 and `_nbZoom`→`viewport.zoom`=1 in `pdfExportMode`, so paper-mm sizes map straight to mm on jsPDF).

---

### 5. Quality-bar checklist (STP 6011) before "done"
- Thin **dashed** extension lines with a small gap at the feature + small overshoot past the dim line.
- Thin **solid** dim line at `LW.DIM`.
- Value centred, **reads right-way-up** at all angles (180° flip in lower half).
- Offset, text, terminators **paper-constant** (via `_nbZoom`), not shrinking at 1:N scales.
- Colour `--mute`. No hardcoded px widths.