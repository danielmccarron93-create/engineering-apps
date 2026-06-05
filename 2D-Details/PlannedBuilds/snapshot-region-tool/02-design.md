# Snapshot tool — design

## 1. Entity model — `snapshot`

2D paper-space entity, stored in `entities2D[viewKey]` like every other V25 entity. **Geometry uses the standard real-mm `u,v` convention** so the existing selection/grip/drag/resize machinery works with minimal new code.

```js
{
  id, type:'snapshot', view, _v25:true, layer:'0',
  lw:0.18, ls:'solid',
  imgId,                 // key into (active file).imageBlobs  -> Uint8Array PNG
  u, v,                  // TOP-LEFT in real-mm (block-local), Y-up like all u,v
  w, h,                  // displayed size in real-mm
  paperMM:{ w, h },      // AUTHORITATIVE source paper size (sheet-mm). Drives exact-scale paste.
  srcW, srcH,            // native raster pixels (aspect lock + DPI sanity)
  rot:0,                 // degrees, CCW, about the entity centre (mirrors `mat`)
  opacity:1,             // 0..1 — reuses v25EntOpacity() -> ctx.globalAlpha
  shape:'rect'|'poly',
  poly:null|[[u,v],...], // record of the trace outline (real-mm), informational
  lockAspect:true        // corner-resize default
}
```

Why real-mm storage + `paperMM`:
- `real2px(blk,u,v)` does `sx = blk.sheetX + u/drawingScale`. So screen/paper maths, hit-test, grips, drag all "just work" via the existing helpers — no bespoke sheet-mm selection code.
- But "same scale" must mean **same physical paper size**, which is `drawingScale`-independent. So we store `paperMM` (sheet-mm) as the source of truth and, **at paste time**, set `w = paperMM.w * drawingScale`, `h = paperMM.h * drawingScale`. Then on-paper size = `w/drawingScale = paperMM` exactly, for any page's `drawingScale`. Subsequent resize just edits `w,h` (and we keep `paperMM` in sync = `w/drawingScale` so a later cross-scale paste of a *copy* stays honest).

### Raster storage — mirror `pdfBlobs` exactly
- Bytes live at `file.imageBlobs[imgId] = Uint8Array(PNG)` (file-level, like `file.pdfBlobs[pdfId]`). `imgId = 'img' + file._nextImageId++`.
- Persistence: `50-project.js` already base64-walks `pdfBlobs` as `{_b64:...}` on `.sdproj` save and decodes on load — extend the **same** walk to `imageBlobs`. IndexedDB session (`84`) carries `Uint8Array` via structured clone with **no change**.
- Runtime decode cache (in `86`): `Map<imgId, HTMLImageElement>`. Lazy: on first draw, build a `Blob`→`URL.createObjectURL`→`Image`, `requestRender()` on load (mirrors 83's async-then-redraw, but single-resolution — the PNG is already high-DPI; the browser down-samples at draw with `imageSmoothingEnabled=true`/`quality='high'`). Revoke object URLs on cache evict.
- **Cross-file paste**: if the snapshot clipboard's source file ≠ the active file at paste, copy the bytes into the active file's `imageBlobs` under a fresh `imgId`. Within one file, all pastes of the same capture share one `imgId`.

## 2. Capture pipeline

`async snapCaptureRegion(zone)` where `zone = { shape, rectSheet:{x,y,w,h}, polySheet:[[sx,sy]…] }` in **sheet-mm**.

Capture renders at **paper DPI** (default 300). Let `PPSM = DPI/25.4` (px per sheet-mm; 300 DPI ≈ 11.81). Offscreen px = `zoneSheetMM * PPSM`, **clamped** so the larger side ≤ `MAX_SNAP_SIDE = 6000` px (memory guard; scale `PPSM` down if exceeded).

Steps:
1. Offscreen canvas at the clamped px size; **leave transparent** (no page-white fill).
2. **Clip** to the outline: build the rect/polygon path in offscreen-px (sheet-mm → px via `(s - zoneOrigin)*PPSM`), `ctx.clip()`. (The *real* canvas honours `clip()`; only the PDF-export shim no-ops it — irrelevant here.)
3. **PDF zone (bottom layer)**: if `activePage().bg?.type==='pdf'`, await `renderPdfPageRegionToCanvas(file, bg, {x,y,w,h in sheet-mm}, DPI)` and `drawImage` it to fill the offscreen. (New helper — §3.)
4. **Vector layer (top)**: global-swap the render globals (mirrors `exportSheetToPDFRaster`):
   - save `canvas, ctx, W, H, viewport{...}, selected3D, activeBlock, activeGrip, rotateMode, cursorSheet`, plus toggles (`gridOn`, snip/flash transient state).
   - set `canvas=off; ctx=offCtx; W,H=off px; viewport.zoom = PPSM; viewport.panX = -zoneOrigin.x*PPSM; viewport.panY = -zoneOrigin.y*PPSM;` clear selection/active/grid/snip/flash.
   - Replay **only entity content** for the active view: iterate `entities2D[view]` (skip the snapshot being captured? no — capture-as-seen includes other snapshots) and call `v25DrawEnt(blk, ent, cs)` (+ any v2 plate render the normal frame draws). **Do not** draw page fill, title block, grid, view labels, selection, crosshair, or the live `drawPdfBackground` (we drew the crisp PDF in step 3).
   - restore all saved globals.
5. `off.toDataURL('image/png')` → bytes → `imageBlobs[imgId]`.
6. Fill the snapshot clipboard `snapClip` (§4) with `imgId, paperMM = {w:zoneSheetW, h:zoneSheetH}, srcW, srcH, originSheet:{x,y}, shape, polySheet`.
7. Fire the **Polaroid capture flash** on the zone (§7).

Notes:
- The vector replay must reuse `drawSheet`'s exact per-entity loop + `blk`/`cs` construction (research extracts it verbatim) so there is **zero rendering drift** vs the live canvas.
- Capture is async (pdf.js render is async) — fine, it runs once on pointer-up / double-click.

## 3. Crisp PDF zone render — new helper in `js/83-pdf-document.js`

`window.renderPdfPageRegionToCanvas(file, bg, zoneMm, dpi)` → `Promise<HTMLCanvasElement|null>`:
- Resolve the pdf.js doc via the existing private `_resolveDoc(file, bg.pdfId)` (lazy re-open from `file.pdfBlobs` post-restore — already implemented).
- `scale = dpi/25.4 / ptToMm_per_px`… concretely: page `base = getViewport({scale:1, rotation})` gives full-page pt size; full page sheet-mm = `page.size`. Target full-page px width at `dpi` = `page.size.w/25.4*dpi`. `scale = targetFullW / base.width`. Build `vp = getViewport({scale, rotation})`.
- Offscreen canvas sized to the **zone** px (`zoneMm.w/25.4*dpi × zoneMm.h/25.4*dpi`, clamped to `MAX_SNAP_SIDE`). Translate the render context by `-zoneOriginPx` (`= -zoneMm.{x,y}/page.size.{w,h} * vp.{width,height}`) so only the zone rasterises. White backing (PDF pages composite on white, as the existing bitmap path does).
- `await page.render({canvasContext, viewport:vp}).promise;` return the canvas. Never throws (guarded like the rest of 83). Does **not** touch the on-screen LRU cache (one-shot, like `renderPdfPageToCanvas`).

This is a ~25-line sibling of `renderPdfPageToBitmap`; reuses its scale/clamp idiom.

## 4. Clipboard + paste

`snapClip` global (in `07`):
```js
snapClip = { fileId, imgId, paperMM:{w,h}, srcW, srcH, originSheet:{x,y}, shape, polySheet } | null
```

- **`Cmd/Ctrl+V`** (2D mode, `snapClip` set): create a `snapshot` entity whose **top-left sheet-mm** = the current cursor sheet position (or centre-on-cursor — pick centre for nicer feel), convert to `u,v` for the active block, set `w = paperMM.w*drawingScale`, `h = paperMM.h*drawingScale`, fresh `id`, `addEnt2D`, select it, `requestRender()`. If `snapClip.fileId !== activeFileId`, copy the bytes into the active file's `imageBlobs` first and use the new `imgId`.
- **`Cmd/Ctrl+Shift+V`** (paste-in-place): same, but top-left sheet-mm = `snapClip.originSheet` on the **current** page/view (works after switching pages — coords are consistent across sheets).
- Routing lives in `42-keyboard.js`: the new branches run only in 2D mode with `snapClip` present; otherwise fall through to the existing 3D `pasteObjects()` path so nothing regresses.
- Undo: `addEnt2D` already records undo. Capture itself does not mutate the doc (only the clipboard + `imageBlobs`), so no undo entry for capture — except we must ensure an orphaned `imageBlobs` entry from a capture-but-never-paste is harmless (it is; cleaned on next session save only if referenced — acceptable, or GC unreferenced blobs on save).

## 5. Selection / move / resize / inspector (`71`)

Mirror `blockWall` (rect with edge grips) + `mat` (rotate ball). All in real-mm via existing helpers.
- `v25EntBounds(snapshot)` → AABB from `u,v,w,h` (rotation-aware AABB like `mat`).
- `v25EntHit` → **area** entity: point-in-(rotated)rect; `precise=false`, `score = w*h` (area). Large area ⇒ ranks low ⇒ clicks fall through to members drawn on top (correct for a trace underlay), while a marquee/explicit click still selects it.
- `v25EntHandles(snapshot)` → 4 corners (`c-tl,c-tr,c-bl,c-br`), 4 edges (`e-l,e-r,e-t,e-b`), 1 `rotate` ball (mat-style). 
- `v25Move(snapshot, du, dv, handle)`:
  - `body` → `u+=du; v+=dv`.
  - corners → resize anchored to the opposite corner; **aspect-locked** when `lockAspect` (default) — Shift toggles free (inverse of the move-ortho convention used elsewhere); keep `paperMM = {w/drawingScale, h/drawingScale}` in sync.
  - edges → free 1-axis stretch (mirror blockWall e-left/right/top/bottom math, with `MIN = 20` real-mm).
  - `rotate` → about centre, snap 0/45/90… unless Shift (mirror `mat`).
- Inspector panel: thumbnail, **Opacity** slider (reuse the existing `propOpacity` pattern → `o.opacity`), W/H (mm, paper), **Lock aspect** toggle, **Reset to captured size** button (`w=paperMM.w*drawingScale` …), **Replace…**? (out of scope v1).

## 6. Tool + capture UX

- Tool id `snapshot`. `setTool('snapshot')` clears its transients (`41`). Cursor = crosshair; status hint "Snapshot: drag a box or click points; double-click/Enter to capture, Esc to cancel."
- Pointer logic lives in `86` (`snapDown/snapMove/snapUp/snapDblClick/snapKey`), called from thin `tool==='snapshot'` hooks in `39-events.js`. Dual mode (Bluebeam-style):
  - **mousedown → move beyond ~4px → up** = **rectangle** drag (rubber-band).
  - **click without drag** = begin/continue **polygon**; each click drops a node; rubber-band to cursor; **double-click / Enter / click-near-first** closes & captures; **Esc** cancels.
- Live preview drawn each frame via a render hook (snip marquee — §7). On capture, run `snapCaptureRegion`, then auto-switch back to the select tool (so the user can immediately `Cmd+V`), matching Bluebeam.

## 7. Visual overlays — the "feel"

Both are transient overlays drawn **on top** in the render pipeline (a small hook at the end of `render()`/`drawSheet`, or a dedicated overlay pass in `86` invoked from the render tail). State in `07`. Use `requestRender()` loops while animating; **no** `Date.now()` issues — use `performance.now()` (allowed in app runtime; only workflow *scripts* forbid it).

### 7a. Snip marquee (during outline) — reads as "camera", not "selection"
- Stroke: **dashed teal/cyan** (`#19c3c9`-ish, theme-aware via a new CSS token `--snip-color`, falling back to a cyan) at `LW.THIN`-equivalent screen width, dash ~`[6,4]`, subtle **marching-ants** (dash offset animates slowly).
- **Corner crop-marks**: short right-angle ticks at each corner (camera framing), drawn just outside the rect.
- **Exterior scrim**: fill the area *outside* the outline with a soft dark scrim (`rgba(0,0,0,0.18)`) so the captured zone "pops" — a viewfinder feel. (Even-odd fill: full canvas minus the region path.)
- **Size readout**: small chip near the cursor showing the zone size in mm (paper) + scale, styled like the existing measure HUD.
- Polygon mode: same stroke along placed segments + rubber-band to cursor; node dots; close-hint highlight when near the first node.

### 7b. Polaroid capture flash (on capture) — subtle
Confined to the captured region's screen rect/polygon (clipped to the outline). A single ~**220 ms** ease-out animation, layered:
1. **Warm bloom**: a fill that ramps `alpha` 0→~0.5 in the first ~40 ms then eases to 0 by ~220 ms, colour a warm white (`rgba(255, 250, 235, a)`) — the Polaroid bulb. Use `ease-out` (e.g. `1-(1-t)^3`).
2. **Border pulse**: the snip outline briefly brightens/whitens and fades with the bloom.
3. Optional **slight warm tint** tail (very low alpha, `rgba(255,240,210,0.06)`) for the last ~80 ms — the "developing" warmth. 
Keep peak alpha ≤ ~0.5 and total ≤ ~240 ms — it must feel like a gentle shutter, not a strobe. Tunable constants at the top of `86` (`FLASH_MS`, `FLASH_PEAK`, colours) so the feel can be dialled in. **I (main loop) will tune this in the browser.**

## 8. Integration checklist (per CLAUDE.md "adding a … type")

2D-mode wiring only (snapshot is paper-space, like dims/leaders/text):
- Catalogue: none (no section catalogue).
- Renderer: `drawSnapshot2D` (new, in `86`) + dispatch branch in `69`.
- Defaults/tool: tool `snapshot`; no `V25_MEM_DEFAULTS` entry (not a member). Pointer hooks in `39`.
- BB-rail tile: `74` (+ `index.html` markup/icon).
- Size picker: n/a.
- Options bar (`72`): optional quick **opacity** when a snapshot is selected — **deferred** to keep `72` (which has pending anchor edits) untouched; inspector covers it.
- Selection/grips: `71`.
- Inspector: `71`/`59` panel.
- DXF (`45`): skip + note. Save/load: automatic via `entities2D` + `imageBlobs` walk (`50`). PDF: automatic.

## 9. Risks & mitigations
- **In-flight edits to `45`/`71`/`72`/`72j`** (anchor-embedment work, uncommitted). → snapshot edits to `45`/`71` are **new additive branches in different functions**; never rewrite; never touch git. Skip `72` entirely (use inspector for opacity).
- **`drawSheet` entity-loop reuse** for the capture compositor — must match exactly. → research extracts the loop + `blk`/`cs` construction verbatim; compositor calls the same `v25DrawEnt`.
- **Memory** (many large PNGs). → blob store keyed + shared across pastes; `MAX_SNAP_SIDE` cap; PNG (line art compresses well); GC unreferenced `imageBlobs` on save.
- **No `node`** here → verify by browser-load (preview harness) + console-clean + `preview_eval` headless draw-capture; not `node --check`.
- **Cross-page paste-in-place coordinate consistency** — confirmed: all sheets share the sheet-mm paper space.
