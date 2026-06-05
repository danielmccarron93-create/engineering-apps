# Snapshot tool — BUILD SPEC (implementation contract)

**This file is the single, authoritative edit-by-edit contract for the `G` Snapshot tool.** It is derived from `02-design.md`, `03-build-plan.md`, and six read-only research reports, then re-verified against the live working tree (2026-06-05). Apply it edit-by-edit. Every insertion anchor below is a **verbatim** existing line quoted from the current file — search for it, insert relative to it. Do **not** re-derive anything; do **not** touch git.

> **Tool id vs entity type.** The TOOL id is `'v25-snapshot'` (so it rides the existing `tool.startsWith('v25-')` plumbing and `v25SetTool`). The ENTITY `type` is `'snapshot'` (no `v25-` prefix — matches the data-model convention of `mat`/`blockWall`/`anchor`). Keep these distinct everywhere.

> **In-flight-edit warning.** `js/71-v25-selection.js`, `js/45-dxf-export.js`, `js/72-v25-options-bar.js`, `js/72j-v25-stud.js` have UNCOMMITTED anchor-embedment ("stud") edits in the working tree. The insertion points chosen below deliberately sit in DIFFERENT functions / line ranges from those edits. **Never rewrite an existing function; only add new additive branches at the stated anchors. Touch `72` not at all.** The working-tree line numbers in this spec already account for the in-flight edits.

> **No `node` on this machine.** Verify by browser-load + clean console + `preview_eval` draw-capture (see §9). `node --check` is unavailable.

---

## §0. Final `snapshot` entity field list (LOCKED)

Stored in `entities2D[viewKey]` like every V25 entity. Geometry uses the standard real-mm `u,v` convention so existing selection/grip/drag math works.

```js
{
  id,                      // ent2dIdN++ (via mkEnt2D)
  type: 'snapshot',
  view,                    // viewKey bucket ('elevation' in 2D mode) — set by mkEnt2D
  _v25: true,
  layer: '0',
  lw: 0.18,
  ls: 'solid',
  imgId,                   // string key into (active file).imageBlobs -> Uint8Array PNG
  u, v,                    // TOP-LEFT in real-mm (block-local, Y-up like all u,v)
  w, h,                    // displayed size in real-mm
  paperMM: { w, h },       // AUTHORITATIVE source paper size in sheet-mm. Drives exact-scale paste.
  srcW, srcH,              // native raster pixel dims (aspect lock + DPI sanity)
  rot: 0,                  // degrees, CCW, about the entity centre (mirrors `mat`)
  opacity: 1,              // 0..1 — applied via ctx.globalAlpha in drawSnapshot2D
  shape: 'rect' | 'poly',
  poly: null | [[u,v],...],// record of the trace outline in real-mm (informational; rect = null)
  lockAspect: true         // corner-resize default
}
```

**Invariant:** on-paper physical size = `w / drawingScale` must always equal `paperMM`. At paste, `w = paperMM.w * drawingScale`, `h = paperMM.h * drawingScale`. On any resize that edits `w,h`, also write `paperMM = { w: w/drawingScale, h: h/drawingScale }` so a later cross-scale paste of a copy stays honest.

---

## §1. NEW FILE — `js/86-v25-snapshot.js` (outline)

Classic `<script>`, first line `'use strict';`. Reads globals (`canvas, ctx, W, H, viewport, drawingScale, sheetMode, activeBlock, cursorSheet, entities2D, selected3D, activeGrip, rotateMode, gridOn, v25Selected, ent2dIdN`); defines bare globals + `window.*`. Loads AFTER `82-v25-dimension.js` (see §5 index.html), so the render pipeline / dispatch / selection machinery already exist.

### Tunable visual constants (top of file)
```js
// ---- Snip marquee + Polaroid-flash tunables (dialled in the browser) ----
const SNIP_COLOR_FALLBACK = '#19c3c9';   // teal/cyan; theme override via CSS var --snip-color
const SNIP_DASH = [6, 4];
const SNIP_ANTS_SPEED = 0.04;            // dash-offset px per ms (marching ants)
const SNIP_CROP_LEN = 11;                // corner crop-mark arm length, px
const SNIP_SCRIM = 'rgba(0,0,0,0.18)';   // exterior dim
const SNIP_DRAG_THRESH = 4;              // px move => rectangle drag vs polygon click
const SNIP_CLOSE_PX = 8;                 // px to first node => close polygon
const FLASH_MS = 220;                    // total flash duration
const FLASH_PEAK = 0.5;                  // peak bloom alpha (<= ~0.5)
const FLASH_BLOOM = '255,250,235';       // warm-white bulb rgb
const FLASH_TAIL = 'rgba(255,240,210,0.06)'; // developing-warmth tail
const SNAP_DPI = 300;                    // capture DPI
const MAX_SNAP_SIDE = 6000;              // px memory guard on the larger side
```

### Functions (name — one-line responsibility)

| Function | Responsibility |
|---|---|
| `snapDefaults()` | Returns the default snapshot field set for a fresh entity (rot:0, opacity:1, lockAspect:true, ls/lw, shape). |
| `_snapImgCache` (`Map<imgId, HTMLImageElement>` + `Map<imgId,string objURL>`) | Module-level runtime image-decode cache + parallel object-URL map for revoke. |
| `snapGetImage(imgId)` | Lazy decode: look up cache; on miss build `Blob([bytes])` → `URL.createObjectURL` → `Image`, store URL for revoke, `img.onload = requestRender`, return `img|null` (null until decoded). Reads bytes from `workspaceActiveFile().imageBlobs[imgId]`. |
| `snapImgCacheEvict(imgId)` | Remove from cache AND `URL.revokeObjectURL(objURL)` for that id (call when a snapshot is deleted or on file switch GC). |
| `async snapCaptureRegion(zone)` | Async compositor (see §4). `zone = {shape, rectSheet:{x,y,w,h}, polySheet:[[sx,sy]…]}` sheet-mm → renders PNG, stores in `imageBlobs`, fills `snapClip`, fires flash. Returns the PNG bytes (Uint8Array). |
| `_snapZoneMetrics(zone)` | Helper: returns `{originX, originY, sheetW, sheetH, offW, offH, ppsm}` (sheet-mm origin/size + clamped offscreen px + effective px-per-sheet-mm). Shared by capture + clip path. |
| `drawSnapshot2D(blk, ent, cs)` | Renderer (see §6): rotate about centre, `ctx.globalAlpha *= opacity`, `drawImage` into the real2px bbox; restore. Dispatched from `v25DrawEnt`. |
| `snapDown(blk, cu, cv, px, py, e)` | mousedown: record `_snip.downPx={x:px,y:py}` + `downWorld` sheet-mm; if a polygon is in progress, push/close a node instead. |
| `snapMove(blk, cu, cv, px, py)` | mousemove: update `_snip.curPx`; `requestRender()` for live marquee. |
| `snapUp(blk, cu, cv, px, py, e)` | mouseup: dual-mode — moved > `SNIP_DRAG_THRESH` ⇒ rect capture; else begin/continue polygon (push node). Mirrors the `v25-hatch` mouseup template. |
| `snapDblClick(blk, cu, cv)` | dblclick: close + capture the polygon (≥3 nodes). |
| `snapKey(e)` | Enter ⇒ close+capture polygon; Esc ⇒ `snapCancel()`. (Called from 42-keyboard while `tool==='v25-snapshot'`.) |
| `snapCancel()` | Clear `_snip` state, `requestRender()`. |
| `snapResetTransient()` | Public reset for `setTool`/`v25SetTool` to call: clears `_snip` (NOT `snapClip`). |
| `snapDrawOverlay(cs)` | Render-tail overlay pass (see §8): draws the snip marquee (rect or polygon) with scrim + crop-marks + ants + size chip, then the active Polaroid flash if `_flash` is live. Called once from `render()` (§5, 22 edit). |
| `_snapDrawMarquee(cs)` | Internal: marquee-only drawing (rect + polygon variants). |
| `_snapDrawFlash(cs)` | Internal: flash-only drawing; reads `_flash.t0`/`performance.now()`; self-`requestRender()` until elapsed ≥ `FLASH_MS`, then clears `_flash`. |
| `snapPlayFlash(zone)` | Arm `_flash = { zone, t0: performance.now() }`, `requestRender()`. |
| `snapPasteAtCursor()` | `Cmd/Ctrl+V` path (see §6/§7): build snapshot top-left so the image is **centred on cursor**; `addEnt2D`; select; render. Cross-file blob copy if needed. |
| `snapPasteInPlace()` | `Cmd/Ctrl+Shift+V` path: build snapshot top-left = `snapClip.originSheet` on the current view. Cross-file blob copy if needed. |
| `_snapEnsureBlobInActiveFile()` | If `snapClip.fileId !== workspaceActiveFile().id`, copy bytes into active file's `imageBlobs` under a fresh `imgId`; return the imgId to use (else `snapClip.imgId`). |
| `_snapDataUrlToBytes(dataUrl)` | `data:` PNG URL → `Uint8Array` (atob the base64 tail). |

Module-level transient state (declare in 86, NOT in `v25State` which `v25SetTool` wipes):
```js
let _snip = null;   // { downPx:{x,y}, downWorld:{x,y}, curPx:{x,y}, poly:[[sx,sy]...] } | null  (sheet-mm)
let _flash = null;  // { zone, t0 } | null
```
> Rationale: `v25SetTool` rebuilds `v25State` from scratch each tool switch (verbatim line in 69: `v25State = { polyPts: [], dragStart: null, ... };`). Snip state must survive a drag but be cleared by `snapResetTransient()`; keep it module-local.

---

## §2. (intentionally merged into §1 — see the function table)

---

## §3. NEW HELPER — `window.renderPdfPageRegionToCanvas(file, bg, zoneMm, dpi)` in `js/83-pdf-document.js`

**Insert anchor (verbatim, end of file region) — insert AFTER this existing block:**
```js
window.renderPdfPageToCanvas = async function renderPdfPageToCanvas(file, bg, targetCssW) {
```
…(after that whole function closes). It is the export wrapper; the new helper is its zone sibling, placed immediately after.

**Signature:** `window.renderPdfPageRegionToCanvas = async function renderPdfPageRegionToCanvas(file, bg, zoneMm, dpi)` → `Promise<HTMLCanvasElement|null>`. `zoneMm = {x,y,w,h}` in sheet-mm; `dpi` e.g. 300.

**Algorithm (grounded in the verbatim `renderPdfPageToBitmap`):**
1. Guard: `if (!file || !bg || bg.type !== 'pdf') return null;` `if (!window.pdfjsLib) return null;`
2. `const docP = _resolveDoc(file, bg.pdfId); if (!docP) return null;` (existing private resolver — lazy-reopens from `file.pdfBlobs`).
3. `try { const doc = await docP; const rot = (bg.rotation || 0);`
4. `const p = await doc.getPage(bg.pageIndex + 1);`
5. `const base = p.getViewport({ scale: 1, rotation: rot });` — base visual size in pt (already /Rotate-baked via the rotation arg, exactly as `renderPdfPageToBitmap` does).
6. Full-page sheet-mm from `page.size`: `const pageSize = (typeof activePageSize === 'function') ? activePageSize() : { w: SHEET.W, h: SHEET.H };`
7. Target full-page px width at dpi: `const fullPageDevW = (pageSize.w / 25.4) * dpi;` then `let scale = fullPageDevW / base.width;`
8. **Clamp to MAX side (mirror the bitmap idiom):** `const maxSide = Math.max(base.width, base.height) * scale; if (maxSide > MAX_RASTER_SIDE) scale *= (MAX_RASTER_SIDE / maxSide);` (reuse the file's existing `MAX_RASTER_SIDE` constant; the zone canvas is additionally bounded by being a sub-rect).
9. `const vp = p.getViewport({ scale: scale, rotation: rot });`
10. Zone offset/size in vp px (proportional mapping): `const zoneX = (zoneMm.x / pageSize.w) * vp.width;` `const zoneY = (zoneMm.y / pageSize.h) * vp.height;` `const zoneW = (zoneMm.w / pageSize.w) * vp.width;` `const zoneH = (zoneMm.h / pageSize.h) * vp.height;`
11. Offscreen canvas sized to the zone: `cnv.width = Math.max(1, Math.round(zoneW)); cnv.height = Math.max(1, Math.round(zoneH));`
12. **White backing** (PDF composites on white, as the bitmap path does): `cctx.fillStyle = '#ffffff'; cctx.fillRect(0,0,cnv.width,cnv.height);`
13. **Zone offset/translate:** `cctx.translate(-zoneX, -zoneY);` then `await p.render({ canvasContext: cctx, viewport: vp }).promise;` (renders full page; only the zone lands on the canvas).
14. `return cnv;`
15. `} catch (e) { console.warn('[pdf] renderPdfPageRegionToCanvas failed', e); return null; }` — **never throws** (guarded like the rest of 83). Does **not** touch the on-screen LRU cache (one-shot).

---

## §4. CAPTURE COMPOSITOR — `snapCaptureRegion(zone)` algorithm

This re-renders the live pipeline onto an offscreen canvas with the SAME `v25DrawEnt` dispatch, so there is **zero rendering drift** vs the screen. Pattern mirrors `exportSheetToPDFRaster`'s global-swap.

### 4a. Metrics
- `const PPSM = SNAP_DPI / 25.4;` (px per sheet-mm; 300 DPI ≈ 11.811).
- Zone origin (sheet-mm): rect ⇒ `(rectSheet.x, rectSheet.y)`; poly ⇒ `(min sx, min sy)`.
- Zone size (sheet-mm): rect ⇒ `(rectSheet.w, rectSheet.h)`; poly ⇒ bbox `(maxX-minX, maxY-minY)`.
- `let offW = Math.round(sheetW * PPSM), offH = Math.round(sheetH * PPSM);`
- Clamp: `const larger = Math.max(offW, offH); if (larger > MAX_SNAP_SIDE) { const k = MAX_SNAP_SIDE/larger; offW = Math.round(offW*k); offH = Math.round(offH*k); }`
- `const effZoom = offW / sheetW;` (effective px-per-sheet-mm after clamp = the viewport.zoom to use).

### 4b. Offscreen + clip
- `const off = document.createElement('canvas'); off.width = offW; off.height = offH; const offCtx = off.getContext('2d');`
- **Do NOT fill white** — leave transparent (tracing-paper for native content).
- Clip to outline (offscreen px via `(s - origin) * effZoom`): rect ⇒ `offCtx.rect(0,0,offW,offH)`; poly ⇒ moveTo/lineTo each `polySheet` pt mapped to offscreen px, `closePath()`. Then `offCtx.clip();`

### 4c. PDF zone FIRST (bottom layer)
```js
const pg = (typeof activePage === 'function') ? activePage() : null;
if (pg && pg.bg && pg.bg.type === 'pdf') {
  const file = (typeof workspaceActiveFile === 'function') ? workspaceActiveFile() : null;
  if (file && typeof window.renderPdfPageRegionToCanvas === 'function') {
    const zoneMm = { x: originX, y: originY, w: sheetW, h: sheetH };
    const pdfCanvas = await window.renderPdfPageRegionToCanvas(file, pg.bg, zoneMm, SNAP_DPI);
    if (pdfCanvas) offCtx.drawImage(pdfCanvas, 0, 0, offW, offH);
  }
}
```

### 4d. Vector layer (top) — EXACT global-swap save/restore list
Save (from Report 1's `exportSheetToPDFRaster`/vector union):
```js
const saved = {
  canvas, ctx, W, H,
  viewport: { ...viewport },
  selected3D: [...selected3D],
  activeBlock, activeGrip, rotateMode, cursorSheet,
  gridOn, pdfExportMode,
};
```
Swap:
```js
canvas = off; ctx = offCtx; W = offW; H = offH;
viewport.zoom = effZoom;            // px per sheet-mm  (= SNAP_DPI/25.4, clamped)
viewport.panX = -originX * effZoom; // pan to zone origin
viewport.panY = -originY * effZoom;
selected3D.length = 0;             // no selection highlights
activeBlock = null;               // no crosshair / click-preview
activeGrip = null;
rotateMode = false;
cursorSheet = null;               // no marquee / crosshair
gridOn = false;                   // no grid
pdfExportMode = false;            // live drawEnt2D dispatch (we want true colours/hatch)
```
Also clear the snip/flash transients so they don't paint into the capture: `_snip = null; const _savedFlash = _flash; _flash = null;`

**Entity-loop reuse — quote the live loop.** Do NOT call `render()` (it would also paint page-fill/title-block/`drawPdfBackground` which we are deliberately suppressing — we drew the crisp PDF in 4c). Instead reuse `drawSheet`'s exact 2D entity loop from `drawBlockContent` (verbatim, `js/28-draw-block.js`):
```js
if (entities2D[vk]) entities2D[vk].forEach(ent => {
  const isPrev = ent.__preview === true;
  if (isPrev) { ctx.save(); ctx.globalAlpha = (ctx.globalAlpha ?? 1) * 0.5; }
  drawEnt2D(blk, ent, cs);
  if (isPrev) ctx.restore();
});
```
Concretely, in the compositor:
```js
const cs = getComputedStyle(document.body);
const vk = saved.activeBlock ? saved.activeBlock.viewKey : 'elevation';
const blk = blocks.find(b => b.viewKey === vk) || saved.activeBlock;
// (re-run the verbatim loop above with vk + blk; skip __preview ghosts already handled)
if (typeof drawV25AutoWelds === 'function') drawV25AutoWelds(blk, cs);
```
> The `blk`/`cs` construction matches the live `drawBlockContent`. We deliberately omit `v25DrawSelectionHighlight` / `v25DrawPreview` / `v25DrawSnapIndicator` (transient UI, not content). We DO include `drawV25AutoWelds` (it is content). **Capture-as-seen includes other snapshots** — do not skip the snapshot type in the loop.

**Suppress (must NOT appear in the capture):** workspace bg, page fill/shadow/border/grain, `drawPdfBackground` (live down-sampled), grid, drawing frame/title block, projection lines, section-cut lines, block frames/grips, 3D selection highlights, edge-snap lines, marquee rubber-band, click-preview, crosshair, rotation readouts, grip-dim feedback, view labels, status bar, snip marquee, Polaroid flash. (All are naturally excluded because we run the entity loop directly rather than `render()`, and we cleared `gridOn/selected3D/activeBlock/cursorSheet`.)

Restore (in a `finally`):
```js
canvas = saved.canvas; ctx = saved.ctx; W = saved.W; H = saved.H;
Object.assign(viewport, saved.viewport);
selected3D.length = 0; for (const o of saved.selected3D) selected3D.push(o);
activeBlock = saved.activeBlock; activeGrip = saved.activeGrip;
rotateMode = saved.rotateMode; cursorSheet = saved.cursorSheet;
gridOn = saved.gridOn; pdfExportMode = saved.pdfExportMode;
_flash = _savedFlash;
requestRender();
```

### 4e. Encode + store + clipboard + flash
- `const pngDataUrl = off.toDataURL('image/png'); const bytes = _snapDataUrlToBytes(pngDataUrl);`
- `const file = workspaceActiveFile(); const imgId = 'img' + (file._nextImageId++); file.imageBlobs[imgId] = bytes;`
- Fill clipboard:
```js
snapClip = {
  fileId: file.id, imgId,
  paperMM: { w: sheetW, h: sheetH },
  srcW: offW, srcH: offH,
  originSheet: { x: originX, y: originY },
  shape: zone.shape,
  polySheet: zone.shape === 'poly' ? zone.polySheet : null,
};
```
- `snapPlayFlash(zone);` then auto-switch back to select so the user can immediately paste: `v25SetTool('select')` (Bluebeam behaviour). Return `bytes`.

---

## §5. PER-FILE EDIT LIST

For each file: the verbatim anchor (an existing unique line) and the code/description to insert. Insertion points are chosen to avoid the in-flight stud edits.

### 5.1 `index.html` — script tag + BB-rail icon

**(a) Script tag.** Anchor (verbatim, line 1649):
```html
<script src="js/82-v25-dimension.js"></script>
```
Insert IMMEDIATELY AFTER it:
```html
<!-- V25 Snapshot tool (key 'G'), 2D paper-space. Bluebeam-style region capture,
     high-DPI raster composite, paste at cursor / in-place. Loads after dimension (82)
     so render pipeline + dispatch + selection are in place. -->
<script src="js/86-v25-snapshot.js"></script>
```

**(b) SVG icon symbol.** Anchor (verbatim) — the existing measure icon symbol opener:
```html
    <symbol id="icon-dim-h" viewBox="0 0 20 20">
```
Insert a new symbol just BEFORE it (or anywhere inside `<defs>`…`</defs>`, which spans lines 34–862):
```html
    <!-- Snapshot / region capture (key 'G'). Viewfinder frame + corner crop-marks. -->
    <symbol id="icon-snapshot" viewBox="0 0 20 20">
      <path d="M3 5 L17 5 L17 17 L3 17 Z" stroke-width="0.9"/>
      <path d="M4 6 L6 6 M6 4 L6 6" stroke-width="0.85" opacity="0.85"/>
      <path d="M14 6 L16 6 M14 4 L14 6" stroke-width="0.85" opacity="0.85"/>
      <path d="M4 14 L6 14 M4 14 L4 16" stroke-width="0.85" opacity="0.85"/>
      <path d="M14 14 L16 14 M16 14 L16 16" stroke-width="0.85" opacity="0.85"/>
      <circle cx="10" cy="11" r="1" opacity="0.7"/>
    </symbol>
```

### 5.2 `js/74-v26-bb-rail.js` — Snapshot tile in the Measure group

Anchor (verbatim, the Measure-group `Dim (old)` tile that follows the primary Measure tile):
```js
        { id: 'a-dimH',    kind: 'tool', label: 'Dim (old)',
```
Insert a Snapshot tile IMMEDIATELY BEFORE that `a-dimH` tile (so it sits right after the primary `v25-measure` tile, inside the same `Measure` group `tiles:` array):
```js
        { id: 'v25-snapshot', kind: 'tool', label: 'Snapshot',
          icon: 'icon-snapshot',
          onClick: () => { if (typeof v25SetTool === 'function') v25SetTool('v25-snapshot'); } },
```
No other 74 change: `renderDrawTab` already calls `highlightActiveTile()` (verbatim `if (typeof highlightActiveTile === 'function') highlightActiveTile();`).

### 5.3 `js/69-v25-dispatch.js` — dispatch branch + active-tile id

**(a) `v25DrawEnt` branch.** Anchor (verbatim, the final dispatch line before the closing return):
```js
  if (ent.type === 'dim2' && typeof drawDim2_2D === 'function') { drawDim2_2D(blk, ent, cs); return true; }
```
Insert IMMEDIATELY AFTER it (still before `return false;`):
```js
  if (ent.type === 'snapshot' && typeof drawSnapshot2D === 'function') { drawSnapshot2D(blk, ent, cs); return true; }
```

**(b) `v25ActiveTileId` case.** Anchor (verbatim):
```js
  if (tool === 'v25-measure') return 'v25-measure';
```
Insert IMMEDIATELY AFTER it:
```js
  if (tool === 'v25-snapshot') return 'v25-snapshot';
```

### 5.4 `js/42-keyboard.js` — `G` gating + paste branches

**(a) Gate bare `G` to the Snapshot tool in 2D, grid in 3D.** Anchor (verbatim — the existing bare-g grid toggle):
```js
    if (e.key === 'g' || e.key === 'G') { gridOn = !gridOn;
```
**Replace** that opening line so the 2D case routes to the tool (the Ctrl/Meta+G group block at lines 211–218 already runs first and `return`s, so this only fires for bare g/G):
```js
    if (e.key === 'g' || e.key === 'G') {
      if (sheetMode === '2d') {
        if (typeof v25SetTool === 'function') v25SetTool('v25-snapshot');
        e.preventDefault(); return;
      }
      gridOn = !gridOn;
```
(The remaining two lines of the original block — `document.getElementById('btnGrid')…` and `…sbGrid?…; requestRender(); }` — stay unchanged and now form the 3D branch body.)

**(b) `Cmd/Ctrl+V` snapshot-first, fall through to 3D.** Anchor (verbatim):
```js
    if ((e.ctrlKey || e.metaKey) && e.key === 'v' && !e.shiftKey) {
      if (clipboardObjs && clipboardObjs.length > 0) { pasteObjects(); e.preventDefault(); }
    }
```
**Replace** with (snapshot path first in 2D; otherwise existing 3D path untouched):
```js
    if ((e.ctrlKey || e.metaKey) && e.key === 'v' && !e.shiftKey) {
      if (sheetMode === '2d' && typeof snapClip !== 'undefined' && snapClip
          && typeof snapPasteAtCursor === 'function') {
        snapPasteAtCursor(); e.preventDefault();
      } else if (clipboardObjs && clipboardObjs.length > 0) { pasteObjects(); e.preventDefault(); }
    }
```

**(c) NEW `Cmd/Ctrl+Shift+V` paste-in-place.** Insert IMMEDIATELY AFTER the block edited in (b):
```js
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'v' || e.key === 'V')) {
      if (sheetMode === '2d' && typeof snapClip !== 'undefined' && snapClip
          && typeof snapPasteInPlace === 'function') {
        snapPasteInPlace(); e.preventDefault();
      }
      // else: no 3D paste-in-place exists today — fall through (no-op).
    }
```

**(d) Esc / Enter for the snip tool.** Find the existing keydown handler's Escape branch and Enter handling; add, near the top of the keydown body (before generic Escape handling), guarded by the tool:
```js
    if (tool === 'v25-snapshot' && typeof snapKey === 'function'
        && (e.key === 'Escape' || e.key === 'Enter')) {
      snapKey(e); e.preventDefault(); return;
    }
```
> Place this AFTER the input-focus guard that the file already has at the top of keydown (so typing in inspector fields is unaffected), and BEFORE the bare-key shortcuts. If unsure of the exact guard line, the safe anchor is the first `if (e.key === 'Escape'` occurrence — insert this block just before it.

### 5.5 `js/41-tools.js` — clear snip transients in `setTool`

Anchor (verbatim):
```js
  v25CycleIds = []; v25CycleIndex = 0; v25CycleLastPx = null;
```
Insert IMMEDIATELY AFTER it:
```js
  if (typeof snapResetTransient === 'function') snapResetTransient();
```
> `v25SetTool` (69) rebuilds `v25State` but does not know about `_snip`; add the same one-liner there too. Anchor in 69 (verbatim): `  v25CycleIds = []; v25CycleIndex = 0; v25CycleLastPx = null;` → insert the same `if (typeof snapResetTransient === 'function') snapResetTransient();` after it.

### 5.6 `js/39-events.js` — thin `tool==='v25-snapshot'` pointer hooks

All four are thin; the real logic is in 86. The snapshot tool id starts with `v25-`, so the existing right-click block (`if (tool && tool.startsWith('v25-')) { … }`, verbatim at line 125) already cancels on right-click via its `setTool('select')` else-branch — acceptable; no extra right-click code needed.

**(a) mousedown.** Anchor (verbatim — the cursor read right after the activeBlock guard):
```js
    const [cu, cv] = getCursor(activeBlock);
```
Insert IMMEDIATELY AFTER it (left-button only; this line sits after `if (e.button !== 0) return;` so button is already 0):
```js
    if (tool === 'v25-snapshot' && typeof snapDown === 'function') {
      const { px, py } = getPixelXY(e);
      snapDown(activeBlock, cu, cv, px, py, e); return;
    }
```

**(b) mousemove.** Anchor (verbatim — first line of the mousemove handler):
```js
    cursorSheet = { px, py };
```
Insert IMMEDIATELY AFTER it:
```js
    if (tool === 'v25-snapshot' && activeBlock && typeof snapMove === 'function') {
      const [scu, scv] = getCursor(activeBlock);
      snapMove(activeBlock, scu, scv, px, py); return;
    }
```

**(c) mouseup.** Anchor (verbatim — the first line inside the mouseup handler, the hatch comment):
```js
    // V25-layout-overhaul — Phase 4 hatch tool decides drag vs click on release.
```
Insert IMMEDIATELY BEFORE it (so the snapshot release runs first, like the hatch branch pattern it mirrors):
```js
    if (tool === 'v25-snapshot' && activeBlock && typeof snapUp === 'function') {
      const { px, py } = getPixelXY(e);
      const [scu, scv] = getCursor(activeBlock);
      snapUp(activeBlock, scu, scv, px, py, e); return;
    }
```

**(d) dblclick.** Anchor (verbatim — the v25-line dblclick branch opener in the FIRST dblclick listener):
```js
    if (tool === 'v25-line' && v25State.polyPts && v25State.polyPts.length >= 2) {
```
Insert IMMEDIATELY BEFORE it:
```js
    if (tool === 'v25-snapshot' && activeBlock && typeof snapDblClick === 'function') {
      const [scu, scv] = getCursor(activeBlock);
      snapDblClick(activeBlock, scu, scv); return;
    }
```

### 5.7 `js/69-v25-dispatch.js` — (already covered in 5.3 + 5.5 note)

### 5.8 `js/22-render-core.js` — render-tail overlay hook (NOT in original files-touched — see §10)

Anchor (verbatim — the View-labels block near the end of `render()`):
```js
  // View labels
  blocks.forEach(blk => drawViewLabel(blk, cs));
```
Insert IMMEDIATELY BEFORE that comment:
```js
  // Snapshot snip-marquee + Polaroid-flash transient overlays (2D paper-space).
  if (typeof snapDrawOverlay === 'function') snapDrawOverlay(cs);
```
> This is a single additive guarded line. It is the only edit to 22. Flagged in §10 because 22 was absent from the README files-touched list.

### 5.9 `js/07-globals.js` — `snapClip` global

Anchor (verbatim):
```js
let clipboardObjs = null;
```
Insert IMMEDIATELY AFTER it:
```js
// Snapshot-tool clipboard (2D paper-space region capture). Null until a capture.
// { fileId, imgId, paperMM:{w,h}, srcW, srcH, originSheet:{x,y}, shape, polySheet } | null
let snapClip = null;
```
> The `_snip` / `_flash` transient state lives in 86 (module-local), NOT here.

### 5.10 `js/04-workspace.js` — seed `imageBlobs`

**(a) `_workspaceMakeFile`.** Anchor (verbatim):
```js
    pdfBlobs: {},
    _nextPdfId: 1,
```
Insert IMMEDIATELY AFTER it (still inside the returned object literal):
```js
    imageBlobs: {},
    _nextImageId: 1,
```

**(b) `workspaceOpenFile` backfill.** Anchor (verbatim):
```js
  if (projectObj.pdfBlobs == null) projectObj.pdfBlobs = {};
  if (projectObj._nextPdfId == null) projectObj._nextPdfId = 1;
```
Insert IMMEDIATELY AFTER it:
```js
  if (projectObj.imageBlobs == null) projectObj.imageBlobs = {};
  if (projectObj._nextImageId == null) projectObj._nextImageId = 1;
```

### 5.11 `js/50-project.js` — base64 round-trip `imageBlobs`

**(a) Encoder.** Anchor (verbatim — the closing of `_encodePdfBlobs`):
```js
function _encodePdfBlobs(pdfBlobs) {
```
After the WHOLE `_encodePdfBlobs` function closes (its final `}` followed by the blank line + the `// Walk a just-loaded project…` comment), add a sibling encoder — simplest is a generic reuse. **Insert IMMEDIATELY BEFORE** the verbatim comment line:
```js
// Walk a just-loaded project object and decode any { "_b64": ... } pdfBlob entry
```
the following:
```js
// imageBlobs share the pdfBlobs byte-map shape; reuse the same base64 walk.
function _encodeImageBlobs(imageBlobs) { return _encodePdfBlobs(imageBlobs); }
function _decodeImageBlobsInProject(projObj) {
  if (!projObj || !projObj.imageBlobs || typeof projObj.imageBlobs !== 'object') return;
  const map = projObj.imageBlobs;
  for (const k of Object.keys(map)) {
    const v = map[k];
    if (v instanceof Uint8Array) continue;
    if (v && typeof v === 'object' && typeof v._b64 === 'string') {
      try { map[k] = _bytesFromB64(v._b64); }
      catch (e) { console.warn('[project] could not decode embedded image blob "' + k + '"', e); delete map[k]; }
    }
  }
}
```
> `_encodeImageBlobs` delegates to `_encodePdfBlobs` (identical Uint8Array→`{_b64}` logic). `_decodeImageBlobsInProject` mirrors `_decodePdfBlobsInProject`. Both `_b64FromBytes`/`_bytesFromB64` already exist.

**(b) `exportProject` — include imageBlobs.** Anchor (verbatim):
```js
  const projOut = Object.assign({}, project, { pdfBlobs: _encodePdfBlobs(project && project.pdfBlobs) });
```
**Replace** with:
```js
  const projOut = Object.assign({}, project, {
    pdfBlobs: _encodePdfBlobs(project && project.pdfBlobs),
    imageBlobs: _encodeImageBlobs(project && project.imageBlobs),
  });
```

**(c) `importProject` — decode imageBlobs.** Anchor (verbatim):
```js
        _decodePdfBlobsInProject(data.project);
```
Insert IMMEDIATELY AFTER it:
```js
        _decodeImageBlobsInProject(data.project);
```
> `js/84-session-store.js` needs NO change — `imageBlobs` Uint8Arrays ride structured clone natively, exactly as `pdfBlobs` do (verbatim comment in 84: "pdfBlobs (Uint8Array) ride along inside workspace.files and survive structured clone natively").

### 5.12 `js/45-dxf-export.js` — skip `snapshot` with a logged note

Anchor (verbatim — the first branch of `_dxfEmit2DEntity`, which is well clear of the in-flight stud edit at ~lines 673–690):
```js
function _dxfEmit2DEntity(b, blk, ent) {
  if (ent.type === 'line') {
```
Insert a guard BETWEEN the function-open line and the `if (ent.type === 'line') {` line:
```js
function _dxfEmit2DEntity(b, blk, ent) {
  if (ent.type === 'snapshot') {
    // Snapshots are rasters — they can't be vectorised; the user traces them
    // with entities that DO export. Skip with a one-time-ish note.
    console.info('[dxf] snapshot entity #' + ent.id + ' skipped (raster; trace it to export).');
    return;
  }
  if (ent.type === 'line') {
```

### 5.13 `js/71-v25-selection.js` — bounds / hit / handles / move / inspector

All five are NEW additive branches at anchors in DIFFERENT line ranges from the in-flight stud edits (stud edits at ~208–235, ~532, ~876–895, ~1977–2009, ~2453–2664). **Mirror the verbatim `blockWall` (edge grips) + `mat` (rotate, area-hit, rotation-aware AABB) patterns.**

**(a) `v25EntBounds` — rotation-aware AABB (mirror `mat`).** Anchor (verbatim — the anchor block that begins right after the stud block):
```js
  if (ent.type === 'anchor') {
    const tot = ent.embed || 100;
```
Insert a snapshot branch IMMEDIATELY BEFORE `if (ent.type === 'anchor') {`:
```js
  if (ent.type === 'snapshot') {
    const w = ent.w || 0, h = ent.h || 0, rotDeg = ent.rot || 0;
    if (!rotDeg) return { L: ent.u, R: ent.u + w, B: ent.v, T: ent.v + h };
    const rr = rotDeg * Math.PI / 180, cc = Math.cos(rr), ss = Math.sin(rr);
    const cu = ent.u + w / 2, cv = ent.v + h / 2;
    let L = Infinity, R = -Infinity, B = Infinity, T = -Infinity;
    [[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]].forEach(([lx, ly]) => {
      const wu = cu + lx * cc - ly * ss, wv = cv + lx * ss + ly * cc;
      if (wu < L) L = wu; if (wu > R) R = wu;
      if (wv < B) B = wv; if (wv > T) T = wv;
    });
    return { L, R, B, T };
  }
```
> NOTE the corrected centre-rotation maths (the repo's `mat` AABB at lines 24–39 of the original monolith has a `cv` typo using `cu` for the y term; use `cv` here as written above).

**(b) `v25EntHit` — area entity, ranks low (mirror `mat`/`blockWall` `areaHit`).** Anchor (verbatim — the block right after the `blockWall` area-hit branch):
```js
  if (t === 'mesh' || t === 'txtBox') {
    const b = v25EntBounds(ent);
```
Insert IMMEDIATELY BEFORE `if (t === 'mesh' || t === 'txtBox') {`:
```js
  if (t === 'snapshot') {
    const w = ent.w || 0, h = ent.h || 0, rotDeg = ent.rot || 0;
    let poly;
    if (!rotDeg) poly = [{ u: ent.u, v: ent.v }, { u: ent.u + w, v: ent.v }, { u: ent.u + w, v: ent.v + h }, { u: ent.u, v: ent.v + h }];
    else {
      const rr = rotDeg * Math.PI / 180, cc = Math.cos(rr), ss = Math.sin(rr);
      const cu = ent.u + w / 2, cv = ent.v + h / 2;
      poly = [[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]].map(([lx,ly]) => ({ u: cu + lx * cc - ly * ss, v: cv + lx * ss + ly * cc }));
    }
    return areaHit(poly);   // precise:false, score = area → ranks LOW so trace members on top win the click
  }
```
> `areaHit` is the in-scope helper (verbatim: `const areaHit = (poly) => { … return { precise: false, score: _v25PolyAreaMM2(poly) }; };`). Large area ⇒ low rank ⇒ clicks fall through to members drawn on top — the trace-underlay behaviour we want.

**(c) `v25EntHandles` — 4 corners + 4 edges + rotate ball.** Anchor (verbatim — the mat rotate block opener that ends the function body before `return out;`):
```js
  if (ent.type === 'mat') {
    const rotRad = (ent.rot || 0) * Math.PI / 180;
```
Insert a snapshot branch IMMEDIATELY BEFORE `if (ent.type === 'mat') {` (so it shares the same pre-`return out;` region; handle the rotated case by transforming the 9 points about the centre):
```js
  if (ent.type === 'snapshot') {
    const w = ent.w || 0, h = ent.h || 0;
    const rr = (ent.rot || 0) * Math.PI / 180, cc = Math.cos(rr), ss = Math.sin(rr);
    const cu = ent.u + w / 2, cv = ent.v + h / 2;
    const X = (lx, ly) => cu + lx * cc - ly * ss;
    const Y = (lx, ly) => cv + lx * ss + ly * cc;
    // local frame: u right, v UP. corners + edge-midpoints (pre-rotation), rotated about centre.
    out.push({ key: 'c-bl', u: X(-w/2,-h/2), v: Y(-w/2,-h/2) });
    out.push({ key: 'c-br', u: X( w/2,-h/2), v: Y( w/2,-h/2) });
    out.push({ key: 'c-tr', u: X( w/2, h/2), v: Y( w/2, h/2) });
    out.push({ key: 'c-tl', u: X(-w/2, h/2), v: Y(-w/2, h/2) });
    out.push({ key: 'e-left',   u: X(-w/2, 0), v: Y(-w/2, 0) });
    out.push({ key: 'e-right',  u: X( w/2, 0), v: Y( w/2, 0) });
    out.push({ key: 'e-bottom', u: X(0, -h/2), v: Y(0, -h/2) });
    out.push({ key: 'e-top',    u: X(0,  h/2), v: Y(0,  h/2) });
    const halfH = h / 2, offsetMm = halfH + Math.max(40, halfH * 0.15);
    out.push({ key: 'rotate', shape: 'circle', u: cu + (-ss) * offsetMm, v: cv + (cc) * offsetMm });
    return out;
  }
```
> The rotate-ball offset mirrors the verbatim `mat` rotate handle: `offsetMm = halfH + Math.max(40, halfH * 0.15)` and `u: cu + (-sinR)*offsetMm, v: cv + (cosR)*offsetMm`.

**(d) `v25Move` — body / corners / edges / rotate.** Anchor (verbatim — the blockWall edge-resize block's closing, immediately before the Member end-handles comment):
```js
  // Member end-handles: drag one end to extend / re-angle while the other end stays put.
  if (ent.type === 'mem2' && (handle === 'end-a' || handle === 'end-b')) {
```
Insert the snapshot move branches IMMEDIATELY BEFORE that `// Member end-handles:` comment. Body-move (`handle==='body'` or undefined) falls through to the existing generic tail (`if (ent.u !== undefined) ent.u += du; …`) — so only corners/edges/rotate need explicit branches:
```js
  // Snapshot resize/rotate. Edges: free 1-axis (mirror blockWall e-*). Corners:
  // aspect-locked by default (lockAspect); Shift toggles free. Rotate: mat-style.
  if (ent.type === 'snapshot' && typeof handle === 'string'
      && (handle === 'rotate' || handle[0] === 'c' || handle.startsWith('e-'))) {
    const MIN = 20;
    const ds = (typeof drawingScale === 'number' && drawingScale) ? drawingScale : 1;
    const sync = () => { ent.paperMM = { w: (ent.w || 0) / ds, h: (ent.h || 0) / ds }; };
    if (handle === 'rotate') {
      const cu = ent.u + (ent.w || 0) / 2, cv = ent.v + (ent.h || 0) / 2;
      const ccu = (typeof v25Drag === 'object' && v25Drag) ? (v25Drag.lastU + du) : (cu + du);
      const ccv = (typeof v25Drag === 'object' && v25Drag) ? (v25Drag.lastV + dv) : (cv + dv);
      const dx = ccu - cu, dy = ccv - cv;
      if (dx * dx + dy * dy < 1) return;
      const cursorRot = Math.atan2(dy, dx) - Math.PI / 2;
      const newRot = applySnappedRotation(cursorRot, !!(typeof shiftHeld !== 'undefined' && shiftHeld));
      ent.rot = newRot * 180 / Math.PI;
      return;
    }
    // Edge grips — free single-axis stretch (blockWall e-* math; MIN real-mm).
    if (handle === 'e-left')   { const nw = (ent.w || 0) - du; if (nw >= MIN) { ent.u += du; ent.w = nw; } sync(); return; }
    if (handle === 'e-right')  { const nw = (ent.w || 0) + du; if (nw >= MIN) ent.w = nw; sync(); return; }
    if (handle === 'e-bottom') { const nh = (ent.h || 0) - dv; if (nh >= MIN) { ent.v += dv; ent.h = nh; } sync(); return; }
    if (handle === 'e-top')    { const nh = (ent.h || 0) + dv; if (nh >= MIN) ent.h = nh; sync(); return; }
    // Corner grips — anchor opposite corner; aspect-locked unless Shift.
    const free = !!(typeof shiftHeld !== 'undefined' && shiftHeld) ? !ent.lockAspect : ent.lockAspect; // Shift inverts lockAspect
    const aspect = (ent.h || 1) / (ent.w || 1);
    // anchor corner stays fixed; the dragged corner moves by (du,dv) in axis-aligned terms.
    // For the unrotated common case (rot 0): adjust w/h and shift u/v for left/bottom anchors.
    let nu = ent.u, nv = ent.v, nw = ent.w || 0, nh = ent.h || 0;
    if (handle === 'c-br') { nw += du;       nh -= dv; nv += dv; }
    if (handle === 'c-bl') { nw -= du; nu += du; nh -= dv; nv += dv; }
    if (handle === 'c-tr') { nw += du;       nh += dv; }
    if (handle === 'c-tl') { nw -= du; nu += du; nh += dv; }
    if (free) {            // aspect-locked: drive h from w (use the dominant axis = w)
      nh = nw * aspect;
      // keep bottom-left/top-left anchors' origin consistent for the locked height
      if (handle === 'c-bl' || handle === 'c-br') nv = (ent.v + (ent.h || 0)) - nh;
    }
    if (nw >= MIN && nh >= MIN) { ent.u = nu; ent.v = nv; ent.w = nw; ent.h = nh; }
    sync();
    return;
  }
```
> The variable named `free` is the aspect-LOCK boolean (true ⇒ locked) — `lockAspect` default true, Shift inverts. (Naming kept terse to match the surrounding style; the logic: locked ⇒ derive `nh` from `nw*aspect`.) The rotate branch mirrors the verbatim `mat` rotate handler (`v25Drag.lastU/lastV` cursor reconstruction, `applySnappedRotation`). Rotated-corner resize beyond rot≠0 uses the same axis-aligned deltas — acceptable for v1 (matches how mat/blockWall keep resize axis-aligned); the main loop can refine in tuning.

**(e) `v25UpdateInspector` — snapshot panel.** Anchor (verbatim — the mat inspector branch opener):
```js
  } else if (ent.type === 'mat') {
    sel('Material', 'material', Object.keys(V25_MATERIALS));
```
Insert a snapshot `else if` branch IMMEDIATELY BEFORE `} else if (ent.type === 'mat') {`:
```js
  } else if (ent.type === 'snapshot') {
    num('Width (mm, paper)', 'paperMM.w', 1);
    num('Height (mm, paper)', 'paperMM.h', 1);
    sel('Lock aspect', 'lockAspect', ['true', '']);
```
> **Inspector field-kind constraint (verified):** the renderer supports only `h`, `num`, `stepper`, `sel`, `col`. There is **no** `cb` (checkbox) or `btn` (button) kind. So "Lock aspect" is a `sel(['true',''])` (same idiom as blockWall's `breakEdges.*` selects), NOT a checkbox; and there is **no "Reset to captured size" button** in v1 (no `btn` kind exists). **Opacity and Rotation are auto-added** by the shared Display block (verbatim `num('Opacity (0..1)', 'opacity', 0.05);` and the `if (!fields.some(f => f.key === 'rot')) num('Rotation°', 'rot', 1);`), so the snapshot branch must NOT push its own opacity/rot. The dotted key `paperMM.w` rides the existing dotted-key walker in the input listener (same as `breakEdges.top`). When `paperMM.w` changes, the entity's displayed `w` must follow — see §10 ambiguity (the generic listener sets `ent['paperMM']['w']` but does not recompute `ent.w`); simplest in-scope fix: expose `num('Width (mm, paper)', 'w', 1)` editing `w` directly and let `paperMM` stay as the captured source — **decide in §10**.

---

## §6. COORDINATE MATHS (exact conversion calls)

All transforms are verbatim from `js/08-coords.js`. `drawingScale` and `activeBlock` are globals; in 2D mode `activeBlock.viewKey === 'elevation'`.

### 6a. Capture zone: screen-px → sheet-mm (rect drag)
```js
const a = px2s(downPx.x, downPx.y);   // {x,y} sheet-mm
const b = px2s(curPx.x,  curPx.y);
const rectSheet = { x: Math.min(a.x,b.x), y: Math.min(a.y,b.y), w: Math.abs(b.x-a.x), h: Math.abs(b.y-a.y) };
```
Polygon nodes are stored directly in sheet-mm via `px2s(px,py)` at each click. `paperMM = { w: rectSheet.w, h: rectSheet.h }` (or poly bbox).

### 6b. Store entity (paste): sheet-mm top-left → real-mm `u,v`; size in real-mm
Given a target top-left in sheet-mm `(tlx, tly)`:
```js
const u = (tlx - activeBlock.sheetX) * drawingScale;
const v = -(tly - activeBlock.sheetY) * drawingScale;   // Y flip (sheet Y-down → real Y-up)
const w = snapClip.paperMM.w * drawingScale;
const h = snapClip.paperMM.h * drawingScale;
```
This is the inverse of `real2px`'s `sx = sheetX + u/drawingScale`, `sy = sheetY - v/drawingScale`. On-paper size = `w/drawingScale = paperMM` exactly, any scale.

### 6c. Paste-at-cursor (centre on cursor)
```js
const cur = px2s(cursorSheet.px, cursorSheet.py);          // sheet-mm cursor
const tlx = cur.x - snapClip.paperMM.w / 2;                // centre the image
const tly = cur.y - snapClip.paperMM.h / 2;
// then 6b to get u,v,w,h
```
(`cursorSheet` is screen-px despite its name — verbatim global comment: "current cursor in sheet-mm" is misleading; it holds `{px,py}` event coords.)

### 6d. Paste-in-place
```js
const tlx = snapClip.originSheet.x;   // captured top-left sheet-mm
const tly = snapClip.originSheet.y;
// then 6b. Works after switching pages: every sheet shares the 0..w,0..h sheet-mm paper space.
```

### 6e. Draw via real2px (in `drawSnapshot2D`)
Top-left of the image in real-mm is `(ent.u, ent.v + ent.h)` (because v is Y-up; the visual top is the larger v). For the **unrotated** path:
```js
const tl = real2px(blk, ent.u, ent.v + ent.h);            // screen top-left
const br = real2px(blk, ent.u + ent.w, ent.v);            // screen bottom-right
const dw = br.x - tl.x, dh = br.y - tl.y;
ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
const prevA = ctx.globalAlpha; ctx.globalAlpha = prevA * (ent.opacity == null ? 1 : ent.opacity);
const img = snapGetImage(ent.imgId);
if (img) ctx.drawImage(img, tl.x, tl.y, dw, dh);
ctx.globalAlpha = prevA;
```
For the **rotated** path, wrap in centre rotation (mirror the rotate pattern): compute centre `real2px(blk, ent.u+ent.w/2, ent.v+ent.h/2)`, `ctx.save(); ctx.translate(c.x,c.y); ctx.rotate((ent.rot||0)*Math.PI/180); ctx.translate(-c.x,-c.y);` … draw … `ctx.restore();`.

---

## §7. KEYBOARD GATING (summary; edits in §5.4)

- **`G` / `g` (bare):** 2D mode ⇒ `v25SetTool('v25-snapshot')` + `preventDefault` + `return`; 3D mode ⇒ existing grid toggle. The existing `Ctrl/Meta+G` group/ungroup block runs first and returns, so it is unaffected.
- **`Cmd/Ctrl+V` (no Shift):** 2D + `snapClip` set ⇒ `snapPasteAtCursor()`; else existing `pasteObjects()` 3D fall-through.
- **`Cmd/Ctrl+Shift+V`:** 2D + `snapClip` set ⇒ `snapPasteInPlace()`; else no-op fall-through (no 3D paste-in-place exists).
- **Esc / Enter while `tool==='v25-snapshot'`:** route to `snapKey(e)` (Enter closes+captures polygon; Esc cancels), guarded so inspector typing is unaffected.

---

## §8. VISUAL SPEC (constants in §1)

### 8a. Snip marquee (`_snapDrawMarquee`, called from `snapDrawOverlay`)
Drawn in screen-px (axis-aligned to canvas), only while `_snip` is active. Colour: `getComputedStyle(document.body).getPropertyValue('--snip-color').trim() || SNIP_COLOR_FALLBACK`.

**Rect mode** (`_snip.downPx` + `_snip.curPx`, no `poly`):
1. Compute screen rect from `downPx`/`curPx`.
2. **Exterior scrim:** fill the whole canvas with `SNIP_SCRIM` using an even-odd path = full-canvas rect + the zone rect (so only the outside dims). `ctx.fill('evenodd')`.
3. **Dashed marquee:** `ctx.strokeStyle = snipColor; ctx.lineWidth = 1; ctx.setLineDash(SNIP_DASH); ctx.lineDashOffset = -(performance.now()*SNIP_ANTS_SPEED) % (SNIP_DASH[0]+SNIP_DASH[1]);` stroke the rect (`+0.5` for crisp 1px). Reset dash.
4. **Corner crop-marks:** at each corner draw two `SNIP_CROP_LEN`-px right-angle arms just OUTSIDE the rect, solid, slightly heavier (`lineWidth 1.2`).
5. **Size chip:** near `curPx`, a small rounded rect (match the measure HUD style) showing `${(zoneW_mm).toFixed(0)} × ${(zoneH_mm).toFixed(0)} mm  1:${drawingScale}` where `zoneW_mm = abs(b.x-a.x)` from `px2s`.
6. **Marching ants:** the animated `lineDashOffset` above; `requestRender()` each frame while `_snip` active.

**Polygon mode** (`_snip.poly` has nodes): same stroke + scrim (scrim uses the polygon path even-odd); draw placed segments + a rubber-band from the last node to `curPx`; node dots (small filled circles in snipColor); when cursor is within `SNIP_CLOSE_PX` of node 0, highlight node 0 (larger ring) as the close hint.

### 8b. Polaroid capture flash (`_snapDrawFlash`)
Armed by `snapPlayFlash(zone)` → `_flash = { zone, t0: performance.now() }`. Each frame while live:
```js
const t = (performance.now() - _flash.t0) / FLASH_MS;   // 0..1
if (t >= 1) { _flash = null; requestRender(); return; }
const ease = 1 - Math.pow(1 - t, 3);                     // ease-out
// bloom alpha: ramp up fast (first ~18% of duration) then ease down
const up = Math.min(1, t / 0.18);
const bloomA = FLASH_PEAK * up * (1 - ease);
```
Clip to the zone screen rect/polygon (same path build as the marquee), then:
1. **Warm bloom:** `ctx.fillStyle = 'rgba(' + FLASH_BLOOM + ',' + bloomA.toFixed(3) + ')'; ctx.fillRect(zone bbox);`
2. **Border pulse:** stroke the zone outline in `rgba(255,255,255, bloomA*1.2)` (clamped ≤ ~0.6), `lineWidth 1.5`, fading with the bloom.
3. **Developing-warmth tail:** for `t > 0.6`, overlay `FLASH_TAIL` at low alpha.
Always `requestRender()` until `t >= 1`. Peak alpha ≤ `FLASH_PEAK` (0.5); total ≤ `FLASH_MS` (220 ms). `performance.now()` is fine in app runtime (only workflow *scripts* forbid it).

> The main loop will tune `FLASH_*` and the marquee feel in-browser; expose all constants at the top of 86.

---

## §9. VERIFICATION PLAN (no `node`)

`node --check` is unavailable. Verify each phase by:

1. **Browser load + clean console.** Open `index.html` via the local http.server (iCloud path won't serve `file://` for modules; this app is classic scripts so `file://` may work, but prefer the preview harness). DevTools console must stay clean after load and after switching to 2D mode.
2. **`preview_eval` draw-capture** (per the v25 testing memory):
   - `renderPdfPageRegionToCanvas`: import a PDF page, call the helper for a known sub-rect, assert the returned canvas px dims ≈ `zoneMm.w/25.4*300` and sample a few pixels for non-blank content.
   - `snapCaptureRegion`: arm a synthetic `zone` and assert it returns a PNG `Uint8Array` (length > 0) and that `workspaceActiveFile().imageBlobs[imgId]` is populated; assert `snapClip` fields.
   - `drawSnapshot2D` numeric check: place a snapshot at known `u,v,w,h`, render, and read back `real2px(blk, u, v+h)` to confirm the screen bbox — **do not rely on screenshots for geometry**; use numeric draw-capture.
3. **v25 testing gotchas to honour** (from memory):
   - `rPolygon` (if used for crop-marks/scrim) takes `[u,v]` **ARRAYS**, not `{u,v}` objects — passing objects silently yields `NaN`. (The marquee here is screen-px raw `ctx` paths, so this mainly matters if any helper reuse creeps in.)
   - **Prime `cursorSheet`** before simulating a click — `getCursor` reads the `cursorSheet` global, not the event. Set `cursorSheet = {px,py}` first.
   - **px-per-mm = `viewport.zoom / drawingScale`** (real-mm); **px-per-sheet-mm = `viewport.zoom`**. Use these when asserting sizes.
   - Hand-built entities can be rejected by the precise fastener hit-test — for drag tests, arm `v25Drag` directly rather than relying on a synthetic mousedown.
4. **Phase gates** (from `03-build-plan.md`): Phase 1 helper dims/content; Phase 2 compositor PNG; Phase 3 `G` gating (2D enters tool + tile highlights; 3D still toggles grid), marquee draws, capture flash, `Cmd+V` / `Cmd+Shift+V`, cross-page in-place; Phase 4 `.sdproj` save→reload restores image + IndexedDB restore; Phase 5 select/move/corner-aspect/edge/rotate/opacity + low-rank click-through; Phase 6 DXF emits valid output with no snapshot geometry, no crash.
5. **End-to-end acceptance:** import a PDF detail → `G` → outline → crisp capture (flash) → new blank page → `Cmd+V` → opacity ~30% → trace a UB + plate + bolts → DXF/PDF export the traced result; quality glance vs STP 6011.

---

## §10. UNRESOLVED AMBIGUITIES (decide before implementation)

1. **Inspector "Reset to captured size" + "Lock aspect" widget kinds.** Reports assumed `kind:'cb'` (checkbox) and `kind:'btn'` (button), but the live inspector renderer (`v25UpdateInspector`) supports ONLY `h / num / stepper / sel / col` — there is no checkbox or button kind. This spec downgrades "Lock aspect" to a `sel(['true',''])` and **drops the Reset button** for v1. **Decision needed:** (a) accept (sel + no reset button — recommended, zero new renderer code), or (b) add a `btn`/`cb` field kind to the inspector renderer (more code, touches the shared renderer + listener).
2. **`paperMM.w/h` inspector field vs displayed `w`.** Editing `paperMM.w` via the dotted-key listener writes `ent.paperMM.w` but does NOT recompute `ent.w` (= `paperMM.w*drawingScale`), so the on-screen size wouldn't change until a re-paste. **Decision needed:** (a) expose the editable size as `num('Width (mm, paper)', 'w', 1)` editing real-mm `w` directly and treat `paperMM` as the immutable capture record (simplest, recommended), or (b) add a special-case in the input listener to recompute `w` from `paperMM.w` (touches the shared listener). This spec leaves the field as `paperMM.w` pending the decision; if (a) is chosen, swap the two `num('… paper')` lines to edit `'w'` / `'h'`.
3. **Rotated-corner resize fidelity.** The corner-resize math in §5.13(d) uses axis-aligned `du,dv` even when `rot≠0` (matching how `mat`/`blockWall` keep resize axis-aligned). For a rotated snapshot this resizes in screen-aligned axes, not the entity's local frame. **Decision needed:** accept for v1 (recommended — rotation of snapshots is rare and the main loop can refine in tuning), or implement local-frame corner resize now (more vector math).
4. **`js/22-render-core.js` is NOT in the README "files touched" list**, but the snip-marquee/Polaroid overlay needs a per-frame render-tail hook and there is no existing post-render hook mechanism (confirmed: no `afterRender`/overlay-hook in the codebase, and `82-dimension` has no live rubber-band to copy). This spec adds ONE additive guarded line to `render()` (§5.8). **Decision needed:** (a) accept the one-line 22 edit (recommended), or (b) have 86 monkey-patch `render`/`requestRender` (fragile, discouraged), or (c) add a generic render-hook array to 22 (slightly more code, cleaner long-term). Add `js/22` + the new CSS token `--snip-color` to the files-touched list either way (the token is optional — falls back to `SNIP_COLOR_FALLBACK`).
5. **Capture flash arming when auto-switching to select.** §4e fires `snapPlayFlash(zone)` then `v25SetTool('select')`. `v25SetTool` calls `snapResetTransient()` (per §5.5 note) which clears `_snip` but must NOT clear `_flash`. Confirm `snapResetTransient()` only nulls `_snip` (it does, per §1). No code change — flagged so the implementer doesn't accidentally null `_flash` in the reset.
6. **GC of orphaned `imageBlobs`.** A capture-but-never-paste leaves an unreferenced `imageBlobs[imgId]` (+ a clipboard ref). Harmless but accumulates in the session/`.sdproj`. The design says "GC unreferenced blobs on save — acceptable, or…". This spec does NOT implement GC (out of scope v1). **Decision needed:** accept (recommended — small line-art PNGs), or add a sweep in `exportProject`/`sessionSave` that drops `imageBlobs` keys not referenced by any `snapshot` entity (more code, touches 50/84).
7. **`MAX_RASTER_SIDE` reuse in §3.** The new `renderPdfPageRegionToCanvas` reuses the file's existing `MAX_RASTER_SIDE` constant (4096 per Report 1). Capture's own `MAX_SNAP_SIDE` is 6000. These differ by design (PDF page raster vs final snapshot), but the PDF zone canvas is then up/down-scaled into the snapshot offscreen — confirm the 4096 PDF clamp doesn't visibly soften a large zone at 300 DPI. **Decision needed:** accept, or pass a higher clamp into the region helper for the snapshot path.

---

## §11. AUTHORITATIVE DECISIONS (resolve §10; OVERRIDE §3 / §4e / §5.13(e) where they conflict)

These are final. Where this section conflicts with an earlier section, **§11 wins.**

### 11.1 Lock-aspect — DROP the inspector widget (resolves §10.1)
No `sel`/`cb`/`btn` for lock-aspect. Keep `lockAspect:true` as the entity default; corner-resize is aspect-locked, **Shift inverts to free**. (No new renderer code.)

### 11.2 Inspector snapshot branch — read-only size only (resolves §10.2)
Replace the §5.13(e) insert with a single read-only heading, then let the shared Display block auto-add Opacity + Rotation. Do **NOT** push opacity/rot yourself, and do **NOT** add editable size fields in v1:
```js
  } else if (ent.type === 'snapshot') {
    const ds = (typeof drawingScale === 'number' && drawingScale) ? drawingScale : 1;
    h('Image  ' + Math.round((ent.w || 0) / ds) + ' x ' + Math.round((ent.h || 0) / ds) + ' mm (paper)');
```
(`h` is a supported heading kind. Precise resize is via grips + the live size chip.) If a status-bar hint API exists, optionally set "Snapshot: corner = scale (Shift = free aspect), edge = stretch, opacity in inspector." — skip if no such API.

### 11.3 Rotated-corner resize — accept axis-aligned for v1 (resolves §10.3). No change to §5.13(d).

### 11.4 Render-tail hook — accept the one-line `js/22` edit (§5.8) (resolves §10.4)
No `css/styles.css` change: the `--snip-color` read in §8a already falls back to `SNIP_COLOR_FALLBACK` when the token is absent. Add `js/22-render-core.js` to files-touched.

### 11.5 Flash vs reset (resolves §10.5)
`snapResetTransient()` nulls **only** `_snip`, never `_flash`. The auto-switch to select after capture must not kill the flash. (No code change — implementer awareness.)

### 11.6 Blob lifecycle — commit lazily on first paste; dedup per file (OVERRIDES §4e store-at-capture; resolves §10.6)
Do **NOT** write to `imageBlobs` during capture. The capture keeps the PNG **bytes in `snapClip`**; commit to the active file's `imageBlobs` **lazily on first paste**, reusing the `imgId` for subsequent pastes into the same file (dedup), and copying a fresh blob into a different file on cross-file paste. This eliminates orphaned blobs and dedupes repeat pastes.

**Final `snapClip` shape** (the §0 entity is unchanged):
```js
snapClip = {
  bytes,                 // Uint8Array PNG (in memory until committed)
  paperMM: { w, h },     // sheet-mm authoritative source size
  srcW, srcH,            // raster px dims
  originSheet: { x, y }, // captured top-left, sheet-mm (paste-in-place)
  shape, polySheet,      // 'rect'|'poly' + nodes (poly only)
  committed: {}          // { [fileId]: imgId } — lazy, filled on first paste into that file
} | null
```

**§4e replacement** (capture tail): build `bytes` from the PNG dataURL, fill `snapClip` (with `committed:{}`), then `snapPlayFlash(zone); v25SetTool('select'); return bytes;`. Do NOT touch `imageBlobs` or `_nextImageId` here.

**Commit helper (in 86), used by both paste paths:**
```js
function _snapCommit(file) {
  if (!file) return null;
  if (!file.imageBlobs) file.imageBlobs = {};
  if (typeof file._nextImageId !== 'number') file._nextImageId = 1;
  const existing = snapClip.committed[file.id];
  if (existing && file.imageBlobs[existing]) return existing;   // dedup within a file
  const imgId = 'img' + (file._nextImageId++);
  file.imageBlobs[imgId] = snapClip.bytes;                      // shared byte ref; fine (read-only)
  snapClip.committed[file.id] = imgId;
  return imgId;
}
```
`snapPasteAtCursor()` / `snapPasteInPlace()`: `const file = workspaceActiveFile(); const imgId = _snapCommit(file); if (!imgId) return;` then build the entity with that `imgId` (geometry per §6c / §6d). `snapGetImage(imgId)` reads `workspaceActiveFile().imageBlobs[imgId]` as before — populated by the time any entity exists.
> The §5.4(b) paste guard becomes `snapClip && snapClip.bytes`. The §5.10 (`04`) `imageBlobs` seeding and §5.11 (`50`) persistence walk are **still required** (pasted entities' blobs must persist).

### 11.7 PDF-zone helper — render the ZONE at the compositor's target pixels (OVERRIDES §3 signature/clamp; resolves §10.7)
Change the signature to take an explicit pixel target (the compositor's already-clamped `offW,offH`), so the zone is rendered at true ~300 DPI and is pixel-exact with the vector layer — NOT clamped to the whole-page `MAX_RASTER_SIDE`.

**New signature:** `window.renderPdfPageRegionToCanvas = async function (file, bg, zoneMm, targetPx)` where `targetPx = { w, h }` (device px). Algorithm changes vs §3:
- Step 7–8 (scale + clamp): replace with — scale so the **zone** fills `targetPx.w`:
  ```js
  const scale = (targetPx.w * pageSize.w) / (zoneMm.w * base.width);
  ```
  (No whole-page `MAX_RASTER_SIDE` clamp here; the compositor already bounded `targetPx` by `MAX_SNAP_SIDE`.)
- Step 10–11: `vp = p.getViewport({scale, rotation:rot})`; `zoneX=(zoneMm.x/pageSize.w)*vp.width; zoneY=(zoneMm.y/pageSize.h)*vp.height;` canvas = `targetPx.w x targetPx.h`.
- Step 13: `cctx.translate(-zoneX, -zoneY); await p.render({canvasContext:cctx, viewport:vp}).promise;`

**§4c call becomes:** `await window.renderPdfPageRegionToCanvas(file, pg.bg, zoneMm, { w: offW, h: offH });`

> Net: PDF zone and vector layer share identical sheet-mm→offscreen-px mapping `(s - origin) * effZoom`, so they overlay exactly; the zone keeps true capture DPI regardless of page size.
