'use strict';

// ============================================================
// PDF DOCUMENT — multi-file-workspace PDF import (pdf.js)
// (multi-file-workspace Phase 3, 2026-06-05) — self-contained module
// ============================================================
// LAYER: band 9-adjacent (workspace / paper-space) — shared.
//   READS:  workspaceAddFile, _projectMakeSheet, _projectLoadSheet,
//           renderFileTabs, renderPagesTab, markSessionDirty, PT_TO_MM,
//           PAGE_SIZES  (all resolved at CALL time — nothing here runs at load).
//           pdfjsLib (CDN UMD build, loaded in index.html <head>).
//   WRITES: the active workspace (a NEW file via workspaceAddFile), that file's
//           sheets[] / pdfBlobs / _nextPdfId; a module pdfDocCache of opened
//           pdf.js documents. Exposes window.pdfImportFile + window.pdfImportPick.
//
// PHASE SCOPE: this batch creates correctly-SIZED, title-block-FREE pages whose
// `bg` descriptor points at the imported PDF bytes. It does NOT render the PDF
// to the canvas yet — drawPdfBackground + the zoom-bucket bitmap cache land in a
// later batch. So an imported PDF shows up as a file of blank pages at the right
// A3/A4/portrait size, ready for that follow-on render.
//
// DEFENSIVE POSTURE (matches the v2-layer / session-store guards): every entry
// point checks window.pdfjsLib first, so a CDN miss disables PDF import only —
// native files and the rest of the app are untouched. The byte buffer is copied
// into file.pdfBlobs BEFORE pdf.js can transfer/detach the ArrayBuffer, so the
// bytes survive for save/load + the deferred background render.
// ============================================================

(function pdfDocument() {

  // Opened pdf.js document handles, keyed `<fileId>:<pdfId>` so a re-import or a
  // future background render can reuse the parsed doc instead of re-parsing the
  // bytes. After a session/.sdproj restore this cache starts empty and the
  // renderer (later batch) re-opens lazily from file.pdfBlobs.
  const pdfDocCache = {};

  // ---- Paper classification ----
  // Snap a measured page size {w,h} (mm) to the nearest named PAGE_SIZES entry,
  // trying BOTH orientations (the PAGE_SIZES table is stored in one orientation,
  // but a PDF page can be portrait or landscape). Returns the size key
  // ('A0'..'A4' | 'Letter') when within tolerance, else 'custom'. Label only —
  // does not change the page's true `size`.
  function classifyPaper(size) {
    if (!size || typeof size.w !== 'number' || typeof size.h !== 'number') return 'custom';
    if (typeof PAGE_SIZES === 'undefined' || !PAGE_SIZES) return 'custom';
    const TOL = 3; // mm — generous enough for pt->mm rounding, tight enough to be unambiguous.
    let best = 'custom';
    let bestErr = Infinity;
    for (const key in PAGE_SIZES) {
      if (!Object.prototype.hasOwnProperty.call(PAGE_SIZES, key)) continue;
      const ref = PAGE_SIZES[key];
      if (!ref) continue;
      // Same orientation.
      const e1 = Math.abs(size.w - ref.w) + Math.abs(size.h - ref.h);
      // Swapped orientation (portrait PDF of a landscape-stored size, or vice versa).
      const e2 = Math.abs(size.w - ref.h) + Math.abs(size.h - ref.w);
      const err = Math.min(e1, e2);
      // Accept only if BOTH dimensions are within tolerance for the better fit.
      const within = (e1 <= e2)
        ? (Math.abs(size.w - ref.w) <= TOL && Math.abs(size.h - ref.h) <= TOL)
        : (Math.abs(size.w - ref.h) <= TOL && Math.abs(size.h - ref.w) <= TOL);
      if (within && err < bestErr) { bestErr = err; best = key; }
    }
    return best;
  }

  // ---- Import a single PDF File ----
  // async. Adds a new (page-less) file, copies the PDF bytes into it, then walks
  // every PDF page and pushes a correctly-sized, title-block-free page carrying a
  // bg descriptor. Loads page 0, refreshes chrome, persists the session. Never
  // throws into the caller — surfaces failures via console + a brief alert.
  async function pdfImportFile(file) {
    if (!file) return null;
    if (!window.pdfjsLib) {
      console.warn('[pdf] pdf.js not loaded (CDN miss?); import disabled.');
      if (typeof alert === 'function') alert('PDF import is unavailable (the PDF library failed to load).');
      return null;
    }
    if (typeof workspaceAddFile !== 'function' || typeof _projectMakeSheet !== 'function') {
      console.warn('[pdf] workspace layer unavailable; cannot import.');
      return null;
    }

    let f = null;
    try {
      // Read the bytes up front. pdf.js may TRANSFER (detach) the ArrayBuffer it
      // is handed, so we keep our own copies: one stored in the file (slice() =
      // an independent copy that outlives pdf.js), one fresh copy fed to
      // getDocument (buf.slice(0)) so detaching it never touches our stored bytes.
      const buf = await file.arrayBuffer();

      // New file named from the PDF (strip the .pdf extension), no seeded page —
      // pages come from the PDF. workspaceAddFile repoints `project` at this file.
      const niceName = String(file.name || 'PDF').replace(/\.pdf$/i, '');
      f = workspaceAddFile(niceName, 'pdf', { seedPage: false });
      if (!f) {
        console.warn('[pdf] workspaceAddFile returned no file.');
        return null;
      }
      // Ensure the file-level PDF fields exist (workspaceAddFile seeds them, but
      // an older/odd workspace shape might not).
      if (!f.pdfBlobs) f.pdfBlobs = {};
      if (typeof f._nextPdfId !== 'number') f._nextPdfId = 1;

      const pdfId = 'pdf' + (f._nextPdfId++);
      // Store an INDEPENDENT copy of the bytes (survives pdf.js detaching `buf`).
      f.pdfBlobs[pdfId] = new Uint8Array(buf).slice();

      // Parse the PDF (feed a fresh copy so a detach can't corrupt pdfBlobs).
      const doc = await pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
      // Cache the opened doc for re-use (keyed by file id + pdfId).
      try { pdfDocCache[f.id + ':' + pdfId] = doc; } catch (_) {}

      const ptToMm = (typeof PT_TO_MM === 'number') ? PT_TO_MM : (25.4 / 72);
      const n = doc.numPages;
      for (let i = 0; i < n; i++) {
        const page = await doc.getPage(i + 1);
        // scale:1 viewport gives dimensions in PDF points; convert to mm.
        const vp = page.getViewport({ scale: 1 });
        const sizeMm = { w: vp.width * ptToMm, h: vp.height * ptToMm };
        // Build the page on the existing 2d-mode sheet shape, then override the
        // per-page fields: real size, classified paper label, NO title block, and
        // a bg descriptor pointing at (pdfId, pageIndex, rotation).
        const p = _projectMakeSheet('Page ' + (i + 1), '', '2d');
        p.size = sizeMm;
        p.paper = classifyPaper(sizeMm);
        p.hasTitleBlock = false;
        p.bg = {
          type: 'pdf',
          pdfId: pdfId,
          pageIndex: i,
          rotation: (vp.rotation || 0),
        };
        f.sheets.push(p);
      }

      // Load the first imported page into the live globals + refresh chrome so the
      // empty-file landing hides and the Pages rail lists the new pages.
      f.activeSheetIdx = 0;
      if (f.sheets.length && typeof _projectLoadSheet === 'function') {
        _projectLoadSheet(0);
      }
      if (typeof renderFileTabs === 'function') renderFileTabs();
      if (typeof window.renderPagesTab === 'function') window.renderPagesTab();
      // Persist the newly-imported file into the IndexedDB session (debounced).
      if (typeof markSessionDirty === 'function') markSessionDirty();
      return f;
    } catch (e) {
      console.error('[pdf] import failed.', e);
      if (typeof alert === 'function') {
        alert('Could not import PDF: ' + (e && e.message ? e.message : e));
      }
      return null;
    }
  }

  // ---- Pick a PDF from disk and import it ----
  // Builds a throwaway hidden <input type=file accept=.pdf>, fires pdfImportFile
  // on the chosen file. The pdf.js guard is also applied here so the picker is a
  // no-op (with a hint) when the library failed to load.
  function pdfImportPick() {
    if (!window.pdfjsLib) {
      console.warn('[pdf] pdf.js not loaded; import unavailable.');
      if (typeof alert === 'function') alert('PDF import is unavailable (the PDF library failed to load).');
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,application/pdf';
    input.addEventListener('change', (ev) => {
      const file = ev.target.files && ev.target.files[0];
      if (!file) return;
      // Fire-and-forget; pdfImportFile handles its own errors.
      pdfImportFile(file);
    });
    input.click();
  }

  // ============================================================
  // BACKGROUND RENDERER (multi-file-workspace Phase 4, 2026-06-05)
  // ============================================================
  // drawPdfBackground(ctx, page) is the SYNCHRONOUS hook called from drawSheet
  // (22-render-core.js) right after the white page fill, before any markup. It
  // never blocks/awaits: it paints the best cached (or scaled-from-a-neighbour)
  // bitmap immediately and kicks async raster work that calls requestRender()
  // when a sharper bitmap is ready. A PDF-less / un-decoded frame just leaves the
  // page white (drawSheet already filled it).
  //
  // CRISPNESS: we raster each page to an offscreen canvas whose internal pixel
  // width is a power-of-2 "zoom bucket" >= the current on-screen device-pixel
  // width, so drawImage only ever DOWN-samples (sharp) at the display size, and
  // we re-raster only when the zoom crosses a bucket boundary — not every frame.
  //
  // ROTATION: page.bg.rotation is passed straight into pdf.js getViewport(), so
  // the rendered bitmap already matches page.size (the visual, /Rotate-baked size
  // set at import). We therefore draw it with NO extra ctx transform.

  // LRU cache of rendered offscreen canvases, keyed
  // `<fileId>:<pdfId>:<pageIndex>:<bucket>:<rotation>`. A Map preserves insertion
  // order so the oldest key is cache.keys().next() — evicted past the cap.
  // CAP=24: the key is per (file,pdf,page,bucket,rotation), so a ~20-page document
  // viewed at a single zoom bucket fits ENTIRELY in the cache. That keeps every
  // page's bitmap warm while flipping back/forth (incl. fast SHIFT-scroll page
  // nav), so a revisited page redraws instantly instead of re-rastering. Bitmaps
  // are downsampled-at-display offscreen canvases (one zoom bucket each), so 24 is
  // still modest memory; bursts across many zoom levels still evict oldest-first.
  const bmpCache = new Map();
  const BMP_CACHE_CAP = 24;       // entries — bounds total bitmap memory.
  const MAX_RASTER_SIDE = 4096;   // px — caps any single bitmap's larger side.

  // Keys of in-flight renderPdfPageToBitmap calls, so a burst of frames at the
  // same zoom bucket only spawns ONE raster.
  const pendingRenders = new Set();

  // multi-file-workspace Phase 5 (export) — when the PDF export pipeline is
  // rastering a page it pre-renders a high-DPI (~300 DPI) bitmap with
  // renderPdfPageToCanvas and hands it here. While set, drawPdfBackground draws
  // THIS canvas into the page rect (bypassing the on-screen zoom-bucket cache and
  // the async kick) so the exported page image is crisp and lands in the correct
  // z-order — after drawSheet's page fill, under the vector markup overlay (the
  // export render runs at viewport.zoom=1, where the on-screen bucket would pick a
  // coarse ~30 DPI raster). null during normal interactive rendering.
  let _exportRaster = null;
  function setPdfExportRaster(cnv) { _exportRaster = cnv || null; }

  // Touch a cache entry to mark it most-recently-used (re-insert at the tail).
  function _bmpCacheGet(key) {
    if (!bmpCache.has(key)) return null;
    const v = bmpCache.get(key);
    bmpCache.delete(key);
    bmpCache.set(key, v);
    return v;
  }

  // Insert + evict to the cap (oldest first).
  function _bmpCacheSet(key, cnv) {
    if (bmpCache.has(key)) bmpCache.delete(key);
    bmpCache.set(key, cnv);
    while (bmpCache.size > BMP_CACHE_CAP) {
      const oldest = bmpCache.keys().next().value;
      bmpCache.delete(oldest);
    }
  }

  // Resolve the opened pdf.js doc for (fileId, pdfId). The import side may have
  // stashed a resolved doc OR (lazy re-open) a Promise<doc>; after a session
  // restore the cache is empty and only bytes survive, so we re-open from the
  // file's pdfBlobs and stash the PROMISE. Returns a Promise<doc>|null
  // synchronously (null = nothing to open from). Never throws.
  function _resolveDoc(file, pdfId) {
    if (!file) return null;
    const key = file.id + ':' + pdfId;
    const cached = pdfDocCache[key];
    if (cached) return Promise.resolve(cached);    // doc or promise — normalise.
    if (!window.pdfjsLib) return null;
    const bytes = file.pdfBlobs && file.pdfBlobs[pdfId];
    if (!bytes) return null;
    // slice() so pdf.js can transfer/detach its copy without corrupting ours.
    let p;
    try {
      p = pdfjsLib.getDocument({ data: bytes.slice() }).promise;
    } catch (e) {
      console.warn('[pdf] getDocument failed for', key, e);
      return null;
    }
    pdfDocCache[key] = p;                 // stash the promise so concurrent frames share it.
    p.then((doc) => { pdfDocCache[key] = doc; })   // upgrade to the resolved doc.
     .catch((e) => { console.warn('[pdf] doc open rejected for', key, e); delete pdfDocCache[key]; });
    return p;
  }

  // Pick the power-of-2 device-pixel raster width >= the on-screen device width,
  // capped at MAX_RASTER_SIDE. This is the cache "bucket" — re-raster only when
  // the zoom crosses a power-of-2 boundary. Floor at 256 so a tiny thumbnail
  // still gets a usable bitmap.
  function _bucketFor(displayDevW) {
    const want = Math.max(256, displayDevW);
    let b = 256;
    while (b < want && b < MAX_RASTER_SIDE) b *= 2;
    return Math.min(b, MAX_RASTER_SIDE);
  }

  // SYNCHRONOUS background paint. Steps mirror the Phase-4 contract.
  function drawPdfBackground(ctx, page) {
    try {
      if (!page || !page.bg || page.bg.type !== 'pdf') return;
      const file = (typeof workspaceActiveFile === 'function') ? workspaceActiveFile() : null;
      if (!file) return;
      const bg = page.bg;

      // --- Page rect in CSS-px, aligned EXACTLY to drawSheet's page fill. ---
      // drawSheet draws the fill from s2px(0,0) to s2px(size.w,size.h); the
      // render ctx carries the DPR transform, so these CSS-px coords land on the
      // same pixels as the white fill. We reuse activePageSize() (== page.size).
      const sz = (page.size && typeof page.size.w === 'number')
        ? page.size
        : ((typeof activePageSize === 'function') ? activePageSize() : null);
      if (!sz) return;
      const tl = s2px(0, 0);
      const br = s2px(sz.w, sz.h);
      const rectX = tl.x, rectY = tl.y;
      const rectW = br.x - tl.x, rectH = br.y - tl.y;
      if (rectW <= 0 || rectH <= 0) return;     // off-screen / degenerate — skip.

      // --- Export override: the PDF export pre-rendered a high-DPI raster for
      //     THIS page; draw it straight into the page rect and skip the live
      //     cache/async path. During export `ctx` is the jsPDF canvas-shim, whose
      //     drawImage embeds the canvas as a page image. ---
      if (_exportRaster) {
        try { ctx.drawImage(_exportRaster, rectX, rectY, rectW, rectH); } catch (_) {}
        return;
      }

      // --- Zoom bucket from the on-screen DEVICE-pixel width. ---
      const dpr = (typeof DPR === 'number' && DPR > 0) ? DPR : 1;
      const displayDevW = rectW * dpr;
      const bucket = _bucketFor(displayDevW);
      const rot = (bg.rotation || 0);
      const exactKey = file.id + ':' + bg.pdfId + ':' + bg.pageIndex + ':' + bucket + ':' + rot;

      // --- Exact-bucket bitmap: crisp draw. ---
      const exact = _bmpCacheGet(exactKey);
      if (exact) {
        ctx.drawImage(exact, rectX, rectY, rectW, rectH);
        return;
      }

      // --- No exact bitmap: draw a different-bucket bitmap (soft) if we have one
      //     for this same page, to avoid a blank frame, then kick the right one. ---
      const prefix = file.id + ':' + bg.pdfId + ':' + bg.pageIndex + ':';
      const suffix = ':' + rot;
      let neighbour = null;
      // Walk newest-first so the closest recently-used scale wins.
      const keys = Array.from(bmpCache.keys());
      for (let i = keys.length - 1; i >= 0; i--) {
        const k = keys[i];
        if (k.indexOf(prefix) === 0 && k.endsWith(suffix)) { neighbour = bmpCache.get(k); break; }
      }
      if (neighbour) ctx.drawImage(neighbour, rectX, rectY, rectW, rectH);
      else {
        // Nothing at all yet — a faint corner hint while the first raster runs.
        try {
          ctx.save();
          ctx.font = '11px system-ui, sans-serif';
          ctx.fillStyle = 'rgba(120,120,120,0.55)';
          ctx.textBaseline = 'top';
          ctx.fillText('rendering…', rectX + 6, rectY + 6);
          ctx.restore();
        } catch (_) {}
      }

      // --- Kick the correct-bucket raster (de-duped). targetCssW = bucket / dpr
      //     so the offscreen canvas is `bucket` device-px wide => crisp. ---
      if (!pendingRenders.has(exactKey)) {
        pendingRenders.add(exactKey);
        const targetCssW = bucket / dpr;
        const docP = _resolveDoc(file, bg.pdfId);
        if (!docP) { pendingRenders.delete(exactKey); return; }
        docP.then((doc) => renderPdfPageToBitmap(doc, bg, targetCssW, exactKey))
            .catch((e) => { console.warn('[pdf] bg render failed', exactKey, e); })
            .then(() => { pendingRenders.delete(exactKey); });
      }
    } catch (e) {
      // Never throw into the synchronous render() pipeline.
      console.warn('[pdf] drawPdfBackground error', e);
    }
  }

  // Raster one PDF page into an offscreen canvas at `targetCssW` CSS-px width
  // (so internal pixels = targetCssW*DPR). Stores it in the LRU cache under
  // cacheKey and calls requestRender(). Returns the canvas. `rotation` is fed to
  // pdf.js so the bitmap already matches page.size — caller draws it untransformed.
  async function renderPdfPageToBitmap(doc, bg, targetCssW, cacheKey) {
    if (!doc || !window.pdfjsLib) return null;
    const dpr = (typeof DPR === 'number' && DPR > 0) ? DPR : 1;
    const rot = (bg.rotation || 0);
    const p = await doc.getPage(bg.pageIndex + 1);
    // Base viewport at scale 1 (already includes the page's intrinsic /Rotate via
    // the rotation arg) gives the visual width to scale FROM.
    const base = p.getViewport({ scale: 1, rotation: rot });
    let scale = (targetCssW * dpr) / base.width;
    // Clamp so neither side exceeds MAX_RASTER_SIDE (bounds memory on huge pages).
    const maxSide = Math.max(base.width, base.height) * scale;
    if (maxSide > MAX_RASTER_SIDE) scale *= (MAX_RASTER_SIDE / maxSide);
    const vp = p.getViewport({ scale: scale, rotation: rot });

    const cnv = document.createElement('canvas');
    cnv.width = Math.max(1, Math.round(vp.width));
    cnv.height = Math.max(1, Math.round(vp.height));
    const cctx = cnv.getContext('2d');
    // White backing so a transparent PDF page composites like paper (and matches
    // drawSheet's --sheet-bg fill underneath).
    cctx.fillStyle = '#ffffff';
    cctx.fillRect(0, 0, cnv.width, cnv.height);
    await p.render({ canvasContext: cctx, viewport: vp }).promise;

    if (cacheKey) _bmpCacheSet(cacheKey, cnv);
    if (typeof requestRender === 'function') requestRender();
    return cnv;
  }

  // Export for the EXPORT agent: render a PDF-backed page to a fresh canvas at a
  // requested CSS-px width (used to place a high-DPI raster into the jsPDF page).
  // Resolves a doc lazily from `file` (so it works post-session-restore), then
  // delegates to renderPdfPageToBitmap WITHOUT touching the on-screen LRU cache
  // (cacheKey omitted) — export bitmaps can be large and one-shot.
  window.renderPdfPageToCanvas = async function renderPdfPageToCanvas(file, bg, targetCssW) {
    if (!file || !bg || bg.type !== 'pdf') return null;
    if (!window.pdfjsLib) { console.warn('[pdf] renderPdfPageToCanvas: pdf.js unavailable.'); return null; }
    const docP = _resolveDoc(file, bg.pdfId);
    if (!docP) return null;
    try {
      const doc = await docP;
      return await renderPdfPageToBitmap(doc, bg, targetCssW, null);
    } catch (e) {
      console.warn('[pdf] renderPdfPageToCanvas failed', e);
      return null;
    }
  };

  // Snapshot-tool ZONE renderer (snapshot-region-tool, 2026-06-05). Renders only a
  // sub-rectangle of a PDF-backed page onto a fresh offscreen canvas sized to the
  // caller's pixel target. The compositor (snapCaptureRegion, js/86) supplies the
  // already-clamped offscreen px (offW/offH) so the zone lands at TRUE capture DPI
  // and shares the exact sheet-mm -> offscreen-px mapping `(s - origin) * effZoom`
  // as the vector layer drawn on top of it (pixel-exact overlay).
  //
  //   zoneMm   = { x, y, w, h }  sub-rect in sheet-mm (page top-left origin).
  //   targetPx = { w, h }        device-px size of the returned canvas (= the zone).
  //
  // Mirrors renderPdfPageToBitmap's rotation / getViewport idiom: scale is chosen
  // so the ZONE (not the whole page) fills targetPx.w, then the full page is drawn
  // shifted by (-zoneX,-zoneY) so only the zone lands on the canvas. NO whole-page
  // MAX_RASTER_SIDE clamp here (the compositor already bounded targetPx by
  // MAX_SNAP_SIDE). White-backed (PDF composites on white) and one-shot — never
  // touches the on-screen LRU cache. Never throws (guarded like the rest of 83).
  window.renderPdfPageRegionToCanvas = async function renderPdfPageRegionToCanvas(file, bg, zoneMm, targetPx) {
    if (!file || !bg || bg.type !== 'pdf') return null;
    if (!window.pdfjsLib) { console.warn('[pdf] renderPdfPageRegionToCanvas: pdf.js unavailable.'); return null; }
    if (!zoneMm || !(zoneMm.w > 0) || !(zoneMm.h > 0)) return null;
    if (!targetPx || !(targetPx.w > 0) || !(targetPx.h > 0)) return null;
    const docP = _resolveDoc(file, bg.pdfId);
    if (!docP) return null;
    try {
      const doc = await docP;
      const rot = (bg.rotation || 0);
      const p = await doc.getPage(bg.pageIndex + 1);
      // Base visual size in pt (already /Rotate-baked via the rotation arg).
      const base = p.getViewport({ scale: 1, rotation: rot });
      // Full-page size in sheet-mm (== page.size; A1 SHEET default for native pages).
      const pageSize = (typeof activePageSize === 'function')
        ? activePageSize() : { w: SHEET.W, h: SHEET.H };
      if (!pageSize || !(pageSize.w > 0) || !(pageSize.h > 0)) return null;
      // Scale so the ZONE fills targetPx.w. No MAX_RASTER_SIDE clamp (§11.7): the
      // compositor already bounded targetPx by MAX_SNAP_SIDE.
      const scale = (targetPx.w * pageSize.w) / (zoneMm.w * base.width);
      const vp = p.getViewport({ scale: scale, rotation: rot });
      // Zone origin in vp px (proportional sheet-mm -> page-px mapping).
      const zoneX = (zoneMm.x / pageSize.w) * vp.width;
      const zoneY = (zoneMm.y / pageSize.h) * vp.height;

      const cnv = document.createElement('canvas');
      cnv.width = Math.max(1, Math.round(targetPx.w));
      cnv.height = Math.max(1, Math.round(targetPx.h));
      const cctx = cnv.getContext('2d');
      // White backing so a transparent PDF page composites like paper.
      cctx.fillStyle = '#ffffff';
      cctx.fillRect(0, 0, cnv.width, cnv.height);
      // Shift the full page so only the zone lands on the canvas.
      cctx.translate(-zoneX, -zoneY);
      await p.render({ canvasContext: cctx, viewport: vp }).promise;
      return cnv;
    } catch (e) {
      console.warn('[pdf] renderPdfPageRegionToCanvas failed', e);
      return null;
    }
  };

  // Publish the synchronous background hook (called by 22-render-core.js drawSheet).
  window.drawPdfBackground = drawPdfBackground;
  // multi-file-workspace Phase 5 — the PDF export path (44 / 51) sets a pre-rendered
  // high-DPI raster here for the page it's about to vector-overlay, then clears it.
  window.setPdfExportRaster = setPdfExportRaster;

  // Publish the cross-module hooks. The file-tabs menu / landing button and the
  // File-menu dispatch call these (guarded by typeof) to start a PDF import.
  window.pdfImportFile = pdfImportFile;
  window.pdfImportPick = pdfImportPick;
  // Expose classifyPaper too — the export/load path (50-project.js) and a future
  // background renderer may want the same paper-snap logic.
  window.classifyPaper = classifyPaper;

})();
