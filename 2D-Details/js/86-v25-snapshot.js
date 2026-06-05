'use strict';

// ============================================================
// V25 SNAPSHOT TOOL (key 'G', 2D paper-space) — Bluebeam-style region capture.
// ------------------------------------------------------------
// Outline a region (box drag, or click node-to-node for a polygon), capture it
// as a crisp high-DPI raster (crisp PDF zone + live vector linework, at the same
// paper scale), then paste at cursor / in-place and trace/resize/fade it.
//
// TOOL id  = 'v25-snapshot'  (rides the existing tool.startsWith('v25-') plumbing)
// ENTITY type = 'snapshot'   (no v25- prefix — matches mat/blockWall/anchor)
//
// Loads AFTER 82-v25-dimension.js, so the render pipeline / dispatch / selection
// machinery already exist. Classic <script>, shared globals — no import/export.
//
// READS globals: canvas, ctx, W, H, viewport, drawingScale, sheetMode,
//   activeBlock, cursorSheet, entities2D, blocks, selected3D, activeGrip,
//   rotateMode, gridOn, pdfExportMode, ent2dIdN, snapClip, drawEnt2D,
//   drawV25AutoWelds, px2s, real2px, getCursor, mkEnt2D, addEnt2D, requestRender,
//   v25SetTool, v25Selected, workspaceActiveFile, activePage,
//   applySnappedRotation, window.renderPdfPageRegionToCanvas.
// WRITES globals: snapClip; module-local _snip / _flash; entities2D buckets via
//   addEnt2D; the active file's imageBlobs (lazily, on first paste).
// ============================================================

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
const FLASH_FRAME = '255,200,120';       // warm-amber capture-frame pulse (reads on WHITE paper, where a white bloom is invisible)
const FLASH_FRAME_PEAK = 0.72;           // frame-pulse peak alpha
const SNAP_DPI = 300;                    // capture DPI
const MAX_SNAP_SIDE = 6000;              // px memory guard on the larger side

// ---- Module-local transient state (NOT in v25State, which v25SetTool wipes) ----
// _snip survives a drag but is cleared by snapResetTransient(); _flash plays
// after capture (and must survive the auto-switch to select — see §11.5).
let _snip = null;   // { downPx:{x,y}, downWorld:{x,y}, curPx:{x,y}, poly:[[sx,sy]...] } | null  (sheet-mm poly)
let _flash = null;  // { zone, t0 } | null

// ---- Runtime image-decode cache (+ object-URL map for revoke) ----
const _snapImgCache = new Map();   // imgId -> HTMLImageElement
const _snapObjUrls = new Map();    // imgId -> object URL string

// ============================================================
// 0/1. DEFAULTS + IMAGE CACHE
// ============================================================

// Default snapshot field set for a fresh entity (geometry filled by the paster).
function snapDefaults() {
  return {
    type: 'snapshot',
    _v25: true,
    layer: '0',
    lw: 0.18,
    ls: 'solid',
    rot: 0,
    opacity: 1,
    shape: 'rect',
    poly: null,
    lockAspect: true,
  };
}

// Lazy decode: cache hit -> return; miss -> Blob([bytes]) -> object URL -> Image,
// store URL for revoke, requestRender on load, return img|null (null until decoded).
function snapGetImage(imgId) {
  if (!imgId) return null;
  if (_snapImgCache.has(imgId)) return _snapImgCache.get(imgId);
  const file = (typeof workspaceActiveFile === 'function') ? workspaceActiveFile() : null;
  const bytes = file && file.imageBlobs ? file.imageBlobs[imgId] : null;
  if (!bytes) return null;
  try {
    const blob = new Blob([bytes], { type: 'image/png' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = function () { if (typeof requestRender === 'function') requestRender(); };
    img.onerror = function () { snapImgCacheEvict(imgId); };
    img.src = url;
    _snapImgCache.set(imgId, img);
    _snapObjUrls.set(imgId, url);
    return img;
  } catch (e) {
    console.warn('[snapshot] could not decode image "' + imgId + '"', e);
    return null;
  }
}

// Drop from cache AND revoke the object URL (call on delete / file-switch GC).
function snapImgCacheEvict(imgId) {
  if (_snapObjUrls.has(imgId)) {
    try { URL.revokeObjectURL(_snapObjUrls.get(imgId)); } catch (e) { /* ignore */ }
    _snapObjUrls.delete(imgId);
  }
  _snapImgCache.delete(imgId);
}

// data: PNG URL -> Uint8Array (atob the base64 tail).
function _snapDataUrlToBytes(dataUrl) {
  const comma = dataUrl.indexOf(',');
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const bin = atob(b64);
  const len = bin.length;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ============================================================
// 4. CAPTURE COMPOSITOR — snapCaptureRegion(zone)  (§4 as amended by §11.6/§11.7)
// ------------------------------------------------------------
// Re-renders the live pipeline onto an offscreen canvas with the SAME drawEnt2D
// dispatch — zero rendering drift vs the screen. Mirrors exportSheetToPDFRaster's
// global-swap. §11.6: keeps PNG bytes in snapClip (NO write to imageBlobs here).
// ============================================================

// Helper: sheet-mm origin/size + clamped offscreen px + effective px-per-sheet-mm.
function _snapZoneMetrics(zone) {
  const PPSM = SNAP_DPI / 25.4;   // px per sheet-mm (300 DPI ≈ 11.811)
  let originX, originY, sheetW, sheetH;
  if (zone.shape === 'poly' && Array.isArray(zone.polySheet) && zone.polySheet.length) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    zone.polySheet.forEach(p => {
      const sx = p[0], sy = p[1];
      if (sx < minX) minX = sx; if (sx > maxX) maxX = sx;
      if (sy < minY) minY = sy; if (sy > maxY) maxY = sy;
    });
    originX = minX; originY = minY; sheetW = maxX - minX; sheetH = maxY - minY;
  } else {
    const r = zone.rectSheet || { x: 0, y: 0, w: 0, h: 0 };
    originX = r.x; originY = r.y; sheetW = r.w; sheetH = r.h;
  }
  let offW = Math.max(1, Math.round(sheetW * PPSM));
  let offH = Math.max(1, Math.round(sheetH * PPSM));
  const larger = Math.max(offW, offH);
  if (larger > MAX_SNAP_SIDE) {
    const k = MAX_SNAP_SIDE / larger;
    offW = Math.max(1, Math.round(offW * k));
    offH = Math.max(1, Math.round(offH * k));
  }
  const ppsm = offW / (sheetW || 1);   // effective px-per-sheet-mm after clamp
  return { originX, originY, sheetW, sheetH, offW, offH, ppsm };
}

async function snapCaptureRegion(zone) {
  const m = _snapZoneMetrics(zone);
  const { originX, originY, sheetW, sheetH, offW, offH } = m;
  const effZoom = m.ppsm;   // px per sheet-mm == viewport.zoom to use

  // --- 4b. Offscreen + clip (leave transparent — tracing-paper) ---
  const off = document.createElement('canvas');
  off.width = offW; off.height = offH;
  const offCtx = off.getContext('2d');
  offCtx.save();
  offCtx.beginPath();
  if (zone.shape === 'poly' && Array.isArray(zone.polySheet) && zone.polySheet.length) {
    zone.polySheet.forEach((p, i) => {
      const x = (p[0] - originX) * effZoom, y = (p[1] - originY) * effZoom;
      if (i === 0) offCtx.moveTo(x, y); else offCtx.lineTo(x, y);
    });
    offCtx.closePath();
  } else {
    offCtx.rect(0, 0, offW, offH);
  }
  offCtx.clip();

  // --- 4c. PDF zone FIRST (bottom layer), at the compositor's target px (§11.7) ---
  const pg = (typeof activePage === 'function') ? activePage() : null;
  if (pg && pg.bg && pg.bg.type === 'pdf') {
    const file = (typeof workspaceActiveFile === 'function') ? workspaceActiveFile() : null;
    if (file && typeof window.renderPdfPageRegionToCanvas === 'function') {
      const zoneMm = { x: originX, y: originY, w: sheetW, h: sheetH };
      try {
        const pdfCanvas = await window.renderPdfPageRegionToCanvas(file, pg.bg, zoneMm, { w: offW, h: offH });
        if (pdfCanvas) offCtx.drawImage(pdfCanvas, 0, 0, offW, offH);
      } catch (e) {
        console.warn('[snapshot] PDF zone render failed', e);
      }
    }
  }

  // --- 4d. Vector layer (top) — EXACT global-swap save/restore list ---
  const saved = {
    canvas, ctx, W, H,
    viewport: { ...viewport },
    selected3D: [...selected3D],
    activeBlock, activeGrip, rotateMode, cursorSheet,
    gridOn, pdfExportMode,
  };
  // Clear snip/flash transients so they don't paint into the capture (§11.5: we
  // restore _flash, so a freshly armed post-capture flash is unaffected).
  _snip = null;
  const _savedFlash = _flash;
  _flash = null;

  try {
    canvas = off; ctx = offCtx; W = offW; H = offH;
    viewport.zoom = effZoom;            // px per sheet-mm (= SNAP_DPI/25.4, clamped)
    viewport.panX = -originX * effZoom; // pan to zone origin
    viewport.panY = -originY * effZoom;
    selected3D.length = 0;             // no selection highlights
    activeBlock = null;               // no crosshair / click-preview
    activeGrip = null;
    rotateMode = false;
    cursorSheet = null;               // no marquee / crosshair
    gridOn = false;                   // no grid
    pdfExportMode = false;            // live drawEnt2D dispatch (true colours/hatch)

    // Reuse drawSheet's exact 2D entity loop (verbatim from drawBlockContent,
    // js/28-draw-block.js). Do NOT call render() — it would paint page-fill /
    // title-block / live drawPdfBackground, which we deliberately suppress (the
    // crisp PDF was drawn in 4c). Capture-as-seen INCLUDES other snapshots.
    const cs = getComputedStyle(document.body);
    const vk = saved.activeBlock ? saved.activeBlock.viewKey : 'elevation';
    const blk = blocks.find(b => b.viewKey === vk) || saved.activeBlock;
    if (blk) {
      if (entities2D[vk]) entities2D[vk].forEach(ent => {
        const isPrev = ent.__preview === true;
        if (isPrev) { ctx.save(); ctx.globalAlpha = (ctx.globalAlpha ?? 1) * 0.5; }
        drawEnt2D(blk, ent, cs);
        if (isPrev) ctx.restore();
      });
      if (typeof drawV25AutoWelds === 'function') drawV25AutoWelds(blk, cs);
    }
  } finally {
    // Restore all swapped globals.
    canvas = saved.canvas; ctx = saved.ctx; W = saved.W; H = saved.H;
    Object.assign(viewport, saved.viewport);
    selected3D.length = 0; for (const o of saved.selected3D) selected3D.push(o);
    activeBlock = saved.activeBlock; activeGrip = saved.activeGrip;
    rotateMode = saved.rotateMode; cursorSheet = saved.cursorSheet;
    gridOn = saved.gridOn; pdfExportMode = saved.pdfExportMode;
    _flash = _savedFlash;
    offCtx.restore();
  }

  // --- 4e. Encode + stash bytes in snapClip (§11.6 — NO imageBlobs write) ---
  const pngDataUrl = off.toDataURL('image/png');
  const bytes = _snapDataUrlToBytes(pngDataUrl);
  snapClip = {
    bytes,                                  // Uint8Array PNG (in memory until committed)
    paperMM: { w: sheetW, h: sheetH },      // sheet-mm authoritative source size
    srcW: offW, srcH: offH,                 // raster px dims
    originSheet: { x: originX, y: originY },// captured top-left, sheet-mm (paste-in-place)
    shape: zone.shape,
    polySheet: zone.shape === 'poly' ? zone.polySheet : null,
    committed: {},                          // { [fileId]: imgId } — lazy, filled on first paste
  };
  snapPlayFlash(zone);
  // Auto-switch back to select so the user can immediately paste (Bluebeam).
  if (typeof v25SetTool === 'function') v25SetTool('select');
  requestRender();
  return bytes;
}

// ============================================================
// 6. RENDERER + COORDINATE MATHS — drawSnapshot2D  (§6e)
// ------------------------------------------------------------
// Dispatched from v25DrawEnt. Rotate about centre, apply opacity via globalAlpha,
// drawImage into the real2px bbox; restore.
// ============================================================

function drawSnapshot2D(blk, ent, cs) {
  const img = snapGetImage(ent.imgId);
  // Top-left of the image in real-mm is (u, v+h) (v is Y-up; visual top = larger v).
  const rotDeg = ent.rot || 0;
  const prevA = ctx.globalAlpha;

  if (rotDeg) {
    const c = real2px(blk, ent.u + (ent.w || 0) / 2, ent.v + (ent.h || 0) / 2);
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(rotDeg * Math.PI / 180);
    ctx.translate(-c.x, -c.y);
  }

  const tl = real2px(blk, ent.u, ent.v + (ent.h || 0));        // screen top-left
  const br = real2px(blk, ent.u + (ent.w || 0), ent.v);        // screen bottom-right
  const dw = br.x - tl.x, dh = br.y - tl.y;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.globalAlpha = prevA * (ent.opacity == null ? 1 : ent.opacity);
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, tl.x, tl.y, dw, dh);
  } else {
    // Placeholder frame until the raster decodes (or if it is missing).
    const snipColor = (cs.getPropertyValue('--snip-color').trim()) || SNIP_COLOR_FALLBACK;
    ctx.globalAlpha = prevA * 0.6;
    ctx.strokeStyle = snipColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(Math.min(tl.x, br.x) + 0.5, Math.min(tl.y, br.y) + 0.5, Math.abs(dw) - 1, Math.abs(dh) - 1);
    ctx.setLineDash([]);
  }
  ctx.globalAlpha = prevA;

  if (rotDeg) ctx.restore();
}

// ============================================================
// 6. POINTER LOGIC — snip tool (dual-mode rect drag / polygon click)
// ============================================================

function snapDown(blk, cu, cv, px, py, e) {
  if (_snip && Array.isArray(_snip.poly)) {
    // Polygon in progress: defer the node push to mouseup (matches dual-mode
    // release decision); just track the live cursor here.
    _snip.curPx = { x: px, y: py };
    requestRender();
    return;
  }
  const w = px2s(px, py);   // sheet-mm
  _snip = { downPx: { x: px, y: py }, downWorld: { x: w.x, y: w.y }, curPx: { x: px, y: py }, poly: null };
  requestRender();
}

function snapMove(blk, cu, cv, px, py) {
  if (!_snip) return;
  _snip.curPx = { x: px, y: py };
  requestRender();   // live marquee (marching ants self-loop also requests)
}

function snapUp(blk, cu, cv, px, py, e) {
  if (!_snip) return;
  // Polygon already in progress -> each release drops a node.
  if (Array.isArray(_snip.poly)) {
    const w = px2s(px, py);
    // Close if the release lands near the first node.
    if (_snip.poly.length >= 3) {
      const first = real2pxSheet(_snip.poly[0]);
      if (first && Math.hypot(px - first.x, py - first.y) <= SNIP_CLOSE_PX) {
        _snapCommitPolygon();
        return;
      }
    }
    _snip.poly.push([w.x, w.y]);
    _snip.curPx = { x: px, y: py };
    requestRender();
    return;
  }
  // First release: moved beyond threshold => rectangle capture; else begin polygon.
  const moved = Math.hypot(px - _snip.downPx.x, py - _snip.downPx.y);
  if (moved > SNIP_DRAG_THRESH) {
    const a = px2s(_snip.downPx.x, _snip.downPx.y);
    const b = px2s(px, py);
    const rectSheet = {
      x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
      w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y),
    };
    if (rectSheet.w < 0.01 || rectSheet.h < 0.01) { snapCancel(); return; }
    const zone = { shape: 'rect', rectSheet, polySheet: null };
    _snip = null;
    snapCaptureRegion(zone);   // async; fire-and-forget (runs once on release)
    return;
  }
  // Begin a polygon: seed it with the down point as the first node.
  _snip.poly = [[_snip.downWorld.x, _snip.downWorld.y]];
  _snip.curPx = { x: px, y: py };
  requestRender();
}

function snapDblClick(blk, cu, cv) {
  if (_snip && Array.isArray(_snip.poly)) { _snapCommitPolygon(); }
}

function snapKey(e) {
  if (!e) return;
  if (e.key === 'Escape') { snapCancel(); return; }
  if (e.key === 'Enter') { if (_snip && Array.isArray(_snip.poly)) _snapCommitPolygon(); return; }
}

function snapCancel() {
  _snip = null;
  requestRender();
}

// Public reset for setTool / v25SetTool: clears _snip ONLY (never _flash — §11.5).
function snapResetTransient() {
  _snip = null;
}

// Close + capture the in-progress polygon (>= 3 nodes).
function _snapCommitPolygon() {
  if (!_snip || !Array.isArray(_snip.poly) || _snip.poly.length < 3) { return; }
  const polySheet = _snip.poly.map(p => [p[0], p[1]]);
  const zone = { shape: 'poly', rectSheet: null, polySheet };
  _snip = null;
  snapCaptureRegion(zone);
}

// sheet-mm node [sx,sy] -> screen px (for close-hint hit-test in the overlay/up).
function real2pxSheet(node) {
  if (!node) return null;
  return s2px(node[0], node[1]);
}

// ============================================================
// 8. VISUAL OVERLAYS — snip marquee + Polaroid flash  (§8)
// ------------------------------------------------------------
// Drawn on top from the render tail (one guarded call in js/22-render-core.js).
// ============================================================

function snapDrawOverlay(cs) {
  if (_snip) _snapDrawMarquee(cs);
  if (_flash) _snapDrawFlash(cs);
}

function _snipColor(cs) {
  const c = cs && cs.getPropertyValue ? cs.getPropertyValue('--snip-color').trim() : '';
  return c || SNIP_COLOR_FALLBACK;
}

// Build the screen-px outline path of the current snip (rect or polygon) on ctx.
// Returns the screen bbox {minX,minY,maxX,maxY} or null.
function _snipPath(useRect) {
  if (!_snip) return null;
  if (Array.isArray(_snip.poly)) {
    if (!_snip.poly.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    ctx.beginPath();
    _snip.poly.forEach((p, i) => {
      const s = s2px(p[0], p[1]);
      if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
      if (s.x < minX) minX = s.x; if (s.x > maxX) maxX = s.x;
      if (s.y < minY) minY = s.y; if (s.y > maxY) maxY = s.y;
    });
    // include the rubber-band cursor so the scrim bbox tracks live
    if (_snip.curPx) {
      ctx.lineTo(_snip.curPx.x, _snip.curPx.y);
      if (_snip.curPx.x < minX) minX = _snip.curPx.x; if (_snip.curPx.x > maxX) maxX = _snip.curPx.x;
      if (_snip.curPx.y < minY) minY = _snip.curPx.y; if (_snip.curPx.y > maxY) maxY = _snip.curPx.y;
    }
    ctx.closePath();
    return { minX, minY, maxX, maxY };
  }
  // Rectangle drag.
  if (!_snip.downPx || !_snip.curPx) return null;
  const x0 = Math.min(_snip.downPx.x, _snip.curPx.x), y0 = Math.min(_snip.downPx.y, _snip.curPx.y);
  const x1 = Math.max(_snip.downPx.x, _snip.curPx.x), y1 = Math.max(_snip.downPx.y, _snip.curPx.y);
  if (useRect !== false) { ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); }
  return { minX: x0, minY: y0, maxX: x1, maxY: y1 };
}

function _snapDrawMarquee(cs) {
  const snipColor = _snipColor(cs);
  const isPoly = Array.isArray(_snip.poly);

  // --- Exterior scrim: full canvas minus the zone (even-odd) ---
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  if (isPoly) {
    if (_snip.poly.length) {
      _snip.poly.forEach((p, i) => {
        const s = s2px(p[0], p[1]);
        if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
      });
      if (_snip.curPx) ctx.lineTo(_snip.curPx.x, _snip.curPx.y);
      ctx.closePath();
    }
  } else if (_snip.downPx && _snip.curPx) {
    const x0 = Math.min(_snip.downPx.x, _snip.curPx.x), y0 = Math.min(_snip.downPx.y, _snip.curPx.y);
    const x1 = Math.max(_snip.downPx.x, _snip.curPx.x), y1 = Math.max(_snip.downPx.y, _snip.curPx.y);
    ctx.rect(x0, y0, x1 - x0, y1 - y0);
  }
  ctx.fillStyle = SNIP_SCRIM;
  ctx.fill('evenodd');
  ctx.restore();

  // --- Dashed marquee with marching ants ---
  const bbox = _snipPath(true);
  ctx.save();
  ctx.strokeStyle = snipColor;
  ctx.lineWidth = 1;
  ctx.setLineDash(SNIP_DASH);
  ctx.lineDashOffset = -(performance.now() * SNIP_ANTS_SPEED) % (SNIP_DASH[0] + SNIP_DASH[1]);
  if (isPoly) {
    // stroke placed segments + rubber-band to cursor (not auto-closed visually)
    if (_snip.poly.length) {
      ctx.beginPath();
      _snip.poly.forEach((p, i) => {
        const s = s2px(p[0], p[1]);
        if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
      });
      if (_snip.curPx) ctx.lineTo(_snip.curPx.x, _snip.curPx.y);
      ctx.stroke();
    }
  } else if (_snip.downPx && _snip.curPx) {
    const x0 = Math.min(_snip.downPx.x, _snip.curPx.x) + 0.5, y0 = Math.min(_snip.downPx.y, _snip.curPx.y) + 0.5;
    const x1 = Math.max(_snip.downPx.x, _snip.curPx.x) + 0.5, y1 = Math.max(_snip.downPx.y, _snip.curPx.y) + 0.5;
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  }
  ctx.setLineDash([]);
  ctx.restore();

  // --- Polygon node dots + close hint ---
  if (isPoly && _snip.poly.length) {
    ctx.save();
    ctx.fillStyle = snipColor;
    _snip.poly.forEach((p) => {
      const s = s2px(p[0], p[1]);
      ctx.beginPath(); ctx.arc(s.x, s.y, 2.5, 0, Math.PI * 2); ctx.fill();
    });
    // Close-hint ring on node 0 when cursor is near it.
    if (_snip.poly.length >= 3 && _snip.curPx) {
      const first = s2px(_snip.poly[0][0], _snip.poly[0][1]);
      if (Math.hypot(_snip.curPx.x - first.x, _snip.curPx.y - first.y) <= SNIP_CLOSE_PX) {
        ctx.strokeStyle = snipColor; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(first.x, first.y, 6, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.restore();
  }

  // --- Corner crop-marks (rect mode only) ---
  if (!isPoly && bbox) {
    ctx.save();
    ctx.strokeStyle = snipColor;
    ctx.lineWidth = 1.2;
    const L = SNIP_CROP_LEN;
    const { minX, minY, maxX, maxY } = bbox;
    // Each corner: two right-angle arms drawn just OUTSIDE the rect.
    const corners = [
      { x: minX, y: minY, dx: -1, dy: -1 },   // top-left
      { x: maxX, y: minY, dx: 1, dy: -1 },    // top-right
      { x: minX, y: maxY, dx: -1, dy: 1 },    // bottom-left
      { x: maxX, y: maxY, dx: 1, dy: 1 },     // bottom-right
    ];
    corners.forEach(c => {
      ctx.beginPath();
      ctx.moveTo(c.x, c.y); ctx.lineTo(c.x + c.dx * L, c.y);          // horizontal arm
      ctx.moveTo(c.x, c.y); ctx.lineTo(c.x, c.y + c.dy * L);          // vertical arm
      ctx.stroke();
    });
    ctx.restore();
  }

  // --- Size chip near the cursor ---
  if (_snip.curPx) {
    let zoneW_mm = 0, zoneH_mm = 0;
    if (isPoly && _snip.poly.length) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      _snip.poly.forEach(p => {
        if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
        if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
      });
      const cw = px2s(_snip.curPx.x, _snip.curPx.y);
      if (cw.x < minX) minX = cw.x; if (cw.x > maxX) maxX = cw.x;
      if (cw.y < minY) minY = cw.y; if (cw.y > maxY) maxY = cw.y;
      zoneW_mm = maxX - minX; zoneH_mm = maxY - minY;
    } else if (_snip.downPx) {
      const a = px2s(_snip.downPx.x, _snip.downPx.y), b = px2s(_snip.curPx.x, _snip.curPx.y);
      zoneW_mm = Math.abs(b.x - a.x); zoneH_mm = Math.abs(b.y - a.y);
    }
    const label = zoneW_mm.toFixed(0) + ' × ' + zoneH_mm.toFixed(0) + ' mm  1:' + drawingScale;
    ctx.save();
    ctx.font = '11px system-ui';
    const padX = 6, padY = 4;
    const tw = ctx.measureText(label).width;
    const chipW = tw + padX * 2, chipH = 18;
    let cx = _snip.curPx.x + 14, cy = _snip.curPx.y + 14;
    if (cx + chipW > W) cx = _snip.curPx.x - chipW - 14;
    if (cy + chipH > H) cy = _snip.curPx.y - chipH - 14;
    ctx.fillStyle = 'rgba(20,20,24,0.85)';
    _snapRoundRect(cx, cy, chipW, chipH, 4); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText(label, cx + padX, cy + chipH / 2 + 0.5);
    ctx.restore();
  }

  // Marching ants: keep animating while the snip is active.
  requestRender();
}

function _snapDrawFlash(cs) {
  if (!_flash) return;
  const t = (performance.now() - _flash.t0) / FLASH_MS;   // 0..1
  if (t >= 1) { _flash = null; requestRender(); return; }
  const ease = 1 - Math.pow(1 - t, 3);                     // ease-out
  const up = Math.min(1, t / 0.18);                        // ramp up fast
  const bloomA = FLASH_PEAK * up * (1 - ease);
  const zone = _flash.zone;

  // Build the zone screen path + bbox (same mapping as capture / marquee).
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  ctx.save();
  ctx.beginPath();
  if (zone.shape === 'poly' && Array.isArray(zone.polySheet) && zone.polySheet.length) {
    zone.polySheet.forEach((p, i) => {
      const s = s2px(p[0], p[1]);
      if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
      if (s.x < minX) minX = s.x; if (s.x > maxX) maxX = s.x;
      if (s.y < minY) minY = s.y; if (s.y > maxY) maxY = s.y;
    });
    ctx.closePath();
  } else if (zone.rectSheet) {
    const tl = s2px(zone.rectSheet.x, zone.rectSheet.y);
    const br = s2px(zone.rectSheet.x + zone.rectSheet.w, zone.rectSheet.y + zone.rectSheet.h);
    minX = Math.min(tl.x, br.x); minY = Math.min(tl.y, br.y);
    maxX = Math.max(tl.x, br.x); maxY = Math.max(tl.y, br.y);
    ctx.rect(minX, minY, maxX - minX, maxY - minY);
  } else {
    ctx.restore();
    requestRender();
    return;
  }
  // Clip to the zone, then layer the flash.
  ctx.clip();

  // 1. Warm bloom fill.
  ctx.fillStyle = 'rgba(' + FLASH_BLOOM + ',' + bloomA.toFixed(3) + ')';
  ctx.fillRect(minX, minY, maxX - minX, maxY - minY);

  // 3. Developing-warmth tail (last ~40%).
  if (t > 0.6) {
    ctx.fillStyle = FLASH_TAIL;
    ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
  }
  ctx.restore();

  // 2. Warm capture-frame pulse — the recognisable "shutter" cue. Warm-amber so it
  //    reads on WHITE paper (a white bloom is invisible there) AND on dark content;
  //    inset a touch so it reads as a frame. Drawn unclipped (full stroke shows).
  const frameA = FLASH_FRAME_PEAK * up * (1 - ease);
  ctx.save();
  ctx.strokeStyle = 'rgba(' + FLASH_FRAME + ',' + frameA.toFixed(3) + ')';
  ctx.lineWidth = 2.5;
  const ins = 2.5;
  if (zone.shape === 'poly' && Array.isArray(zone.polySheet) && zone.polySheet.length) {
    ctx.beginPath();
    zone.polySheet.forEach((p, i) => {
      const s = s2px(p[0], p[1]);
      if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
    });
    ctx.closePath();
    ctx.stroke();
  } else {
    ctx.strokeRect(minX + ins, minY + ins, (maxX - minX) - 2 * ins, (maxY - minY) - 2 * ins);
  }
  ctx.restore();

  requestRender();   // self-loop until t >= 1
}

// Arm the Polaroid flash.
function snapPlayFlash(zone) {
  _flash = { zone, t0: performance.now() };
  requestRender();
}

// Rounded-rect path helper for the size chip.
function _snapRoundRect(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// ============================================================
// 4/6/11.6. CLIPBOARD COMMIT + PASTE
// ============================================================

// Commit snapClip.bytes to a file's imageBlobs lazily; dedup per file (§11.6).
function _snapCommit(file) {
  if (!file) return null;
  if (!snapClip || !snapClip.bytes) return null;
  if (!file.imageBlobs) file.imageBlobs = {};
  if (typeof file._nextImageId !== 'number') file._nextImageId = 1;
  if (!snapClip.committed) snapClip.committed = {};
  const existing = snapClip.committed[file.id];
  if (existing && file.imageBlobs[existing]) return existing;   // dedup within a file
  const imgId = 'img' + (file._nextImageId++);
  file.imageBlobs[imgId] = snapClip.bytes;                      // shared byte ref; read-only
  snapClip.committed[file.id] = imgId;
  return imgId;
}

// Build a snapshot entity from snapClip at a given sheet-mm top-left, on the
// active block. Returns the new entity (already added + selected) or null.
function _snapBuildEntityAt(tlx, tly) {
  if (typeof snapClip === 'undefined' || !snapClip || !snapClip.bytes) return null;
  if (sheetMode !== '2d') return null;
  // Active block, with a fallback to the 2D paper block when the cursor isn't over
  // one (so Cmd+V always lands somewhere sensible).
  const blk = activeBlock
    || (typeof blocks !== 'undefined' && blocks.find(b => b.viewKey === 'elevation'))
    || (typeof blocks !== 'undefined' && blocks[0]) || null;
  if (!blk) return null;
  const file = (typeof workspaceActiveFile === 'function') ? workspaceActiveFile() : null;
  const imgId = _snapCommit(file);
  if (!imgId) return null;

  const ds = (typeof drawingScale === 'number' && drawingScale) ? drawingScale : 1;
  // sheet-mm top-left (tlx,tly) -> real-mm u,v (inverse of real2px). v is the BOTTOM
  // edge in real-mm (Y-up: draw uses v+h for the top, bounds return B:v / T:v+h), so
  // it comes from the BOTTOM sheet-y = tly + paper height — NOT from tly itself.
  const u = (tlx - blk.sheetX) * ds;
  const v = -((tly + snapClip.paperMM.h) - blk.sheetY) * ds;
  const w = snapClip.paperMM.w * ds;
  const h = snapClip.paperMM.h * ds;

  const ent = mkEnt2D(blk.viewKey, 'snapshot', Object.assign(snapDefaults(), {
    imgId,
    u, v, w, h,
    paperMM: { w: snapClip.paperMM.w, h: snapClip.paperMM.h },
    srcW: snapClip.srcW, srcH: snapClip.srcH,
    shape: snapClip.shape || 'rect',
    poly: null,
  }));
  addEnt2D(ent);
  if (typeof v25Selected !== 'undefined' && Array.isArray(v25Selected)) v25Selected = [ent.id];
  if (typeof v25UpdateInspector === 'function') v25UpdateInspector();
  requestRender();
  return ent;
}

// Cmd/Ctrl+V — paste centred on the cursor (§6c).
function snapPasteAtCursor() {
  if (typeof snapClip === 'undefined' || !snapClip || !snapClip.bytes) return;
  if (sheetMode !== '2d') return;   // block resolved (with fallback) in _snapBuildEntityAt
  // cursorSheet holds {px,py} despite its name; convert to sheet-mm.
  const cur0 = (typeof cursorSheet === 'object' && cursorSheet) ? cursorSheet : null;
  let cur;
  if (cur0) cur = px2s(cur0.px, cur0.py);
  else cur = { x: snapClip.originSheet.x, y: snapClip.originSheet.y };   // fallback: in-place origin
  const tlx = cur.x - snapClip.paperMM.w / 2;   // centre the image on the cursor
  const tly = cur.y - snapClip.paperMM.h / 2;
  _snapBuildEntityAt(tlx, tly);
}

// Cmd/Ctrl+Shift+V — paste in place (same paper coords, cross-page) (§6d).
function snapPasteInPlace() {
  if (typeof snapClip === 'undefined' || !snapClip || !snapClip.bytes) return;
  if (sheetMode !== '2d') return;   // block resolved (with fallback) in _snapBuildEntityAt
  _snapBuildEntityAt(snapClip.originSheet.x, snapClip.originSheet.y);
}

// ============================================================
