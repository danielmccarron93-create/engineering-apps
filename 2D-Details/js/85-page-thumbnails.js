'use strict';

// ============================================================
// PAGE THUMBNAILS — multi-file-workspace polish (Item 2a)
// (2026-06-05) — self-contained module, IIFE
// ============================================================
// LAYER: band 8 (80-89, future shared modules) — shared workspace UI support.
//   READS:  workspaceActiveFile, activePage, activePageSize, pageHasTitleBlock,
//           project, SHEET, DPR, render(), and the live render globals
//           (canvas/ctx/W/H/viewport/gridOn/selected3D/activeBlock/activeGrip/
//           rotateMode/cursorSheet/pdfExportMode) — ALL resolved at CALL time
//           (nothing here runs at load). window.renderPdfPageToCanvas (js/83).
//   WRITES: nothing global. A module thumbnail cache + a per-page-id version map
//           + a small throttled generation queue. Exposes window.pageThumbRequest
//           + window.pageThumbInvalidate.
//
// PURPOSE: the Pages rail (js/74-v26-bb-rail.js renderPagesTab) draws a 2-column
// grid of page-preview cards. Each card asks here for a small (~140 CSS-px wide)
// thumbnail of its page. We return a cached canvas immediately if one exists, or
// generate one asynchronously and hand it back via the callback so the card can
// fill its <canvas>/<img> WITHOUT the rail rebuilding (no flicker on page switch).
//
// PERFORMANCE POSTURE (this whole batch is a perf pass — see the build brief):
//   - Generation is THROTTLED to a tiny concurrency (MAX_CONCURRENT) so importing
//     a 20-page PDF doesn't fire 20 rasters at once and freeze the UI.
//   - Results are CACHED by (page.id + version). Thumbnails are tiny, so we keep
//     them all (a soft cap only bounds pathological workspaces); a page switch
//     reuses the cache and never regenerates.
//   - The ACTIVE page is generated first (front-of-queue) so the page the user is
//     looking at fills in immediately.
//
// ROBUSTNESS POSTURE (matches the v2-layer / session-store / pdf.js guards):
//   - Every entry point is wrapped so a failure logs + degrades to a placeholder;
//     nothing here ever throws into a caller or the render() pipeline.
//   - The NATIVE-page render hot-swaps the live render globals (the same dance as
//     js/51-multi-page-pdf.js _renderOneVectorPage) into a small real canvas, with
//     a try/finally that ALWAYS restores them even if render() throws. To stay
//     bulletproof it only does this for the ACTIVE page (whose blocks/sheetMode/
//     activeSheetIdx already match what render() expects); a NON-active native page
//     falls back to a clean labelled placeholder rather than risk corrupting the
//     shared `blocks` array / firing applySheetMode's DOM side-effects off-screen.
//     Each non-active native page becomes a real thumbnail the moment it's visited.
// ============================================================

(function pageThumbnails() {

  // Thumbnail target width in CSS-px. Cards in the rail are ~125px wide; 140 gives
  // a touch of headroom so the downscale-to-fit is crisp. Internal pixels are
  // THUMB_W*DPR (set per-canvas below) so the bitmap is sharp on hi-dpi screens.
  const THUMB_W = 140;

  // Soft upper bound on cached thumbnails. They're tiny, so this is just a guard
  // against a pathological workspace (hundreds of pages across many files); a
  // 30-page document fits comfortably and never evicts. Oldest-first eviction.
  const CACHE_CAP = 256;

  // How many thumbnails to generate at once. PDF rasters are the heavy case; 2 in
  // flight keeps the UI responsive while still draining a burst quickly.
  const MAX_CONCURRENT = 2;

  // Rendered thumbnails, keyed `<pageId>:<version>`. Value = an HTMLCanvasElement.
  // A Map preserves insertion order so the oldest key is cache.keys().next()
  // (evicted past CACHE_CAP).
  const cache = new Map();

  // Per-page content version, keyed `<fileId>/<pageId>`. pageThumbInvalidate bumps
  // it so the next request regenerates; PDF pages never invalidate (static), so
  // their version stays at the default. Kept module-side (keyed by the STABLE
  // file.id + page.id) instead of on the page object, so the snapshot/restore
  // deep-copies in 05-state.js never strip or duplicate a version field.
  //
  // NOTE the file scope: page.id is only unique WITHIN a file (every file's
  // _nextSheetId starts at 1 — js/04 _workspaceMakeFile), so file A's page-1 and
  // file B's page-1 both have id===1. Keying the version AND the cache by
  // fileId/pageId is what stops file B's card showing file A's bitmap.
  const verById = Object.create(null);

  // Resolve the owning file's id for a request. Prefers the explicitly-passed
  // file (the rail passes the active file it's rendering); falls back to the live
  // active file, then to a sentinel so a file-less call still gets a stable key.
  function _fileIdFor(file) {
    let f = file;
    if (!f && typeof workspaceActiveFile === 'function') {
      try { f = workspaceActiveFile(); } catch (_) { f = null; }
    }
    if (!f && typeof project !== 'undefined') f = project;
    return (f && f.id != null) ? f.id : '?';
  }

  // Pending callbacks per cache-key, so N cards requesting the SAME page spawn
  // ONE generation and all get notified. key -> [cb, cb, ...].
  const waiters = new Map();

  // The generation queue: array of { key, file, page, prioritize }. De-duped by
  // key (the waiters map holds the extra callbacks).
  const queue = [];
  let inFlight = 0;

  // ---- version helpers ----
  // `fid` is the owning file's id (from _fileIdFor). The version map is keyed by
  // the file-scoped `<fid>/<pageId>` composite so two files' same-id pages don't
  // share a version bump.
  function _versionFor(page, fid) {
    if (!page) return 'x';
    // PDF pages are static: a constant tag keeps their cache entry forever.
    if (page.bg && page.bg.type === 'pdf') return 'pdf';
    const v = verById[fid + '/' + (page.id != null ? page.id : '?')];
    return 'v' + (typeof v === 'number' ? v : 0);
  }

  // Cache key = `<fileId>/<pageId>:<version>`. The fileId prefix is the fix for
  // the cross-file collision (page.id is only file-local).
  function _keyFor(page, fid) {
    return fid + '/' + (page && page.id != null ? page.id : '?') + ':' + _versionFor(page, fid);
  }

  // ---- cache helpers (insertion-order LRU-ish, oldest-first eviction) ----
  function _cacheGet(key) {
    return cache.has(key) ? cache.get(key) : null;
  }
  function _cacheSet(key, cnv) {
    if (cache.has(key)) cache.delete(key);
    cache.set(key, cnv);
    while (cache.size > CACHE_CAP) {
      const oldest = cache.keys().next().value;
      cache.delete(oldest);
    }
  }

  // ---- thumbnail dimensions from a page size, preserving aspect ----
  // Returns { cssW, cssH } at THUMB_W width, aspect from page.size (portrait vs
  // landscape). Falls back to the A1 SHEET aspect for a size-less page.
  function _thumbDims(page) {
    let w = SHEET.W, h = SHEET.H;
    if (page && page.size && typeof page.size.w === 'number' && page.size.w > 0
        && typeof page.size.h === 'number' && page.size.h > 0) {
      w = page.size.w; h = page.size.h;
    }
    const cssW = THUMB_W;
    const cssH = Math.max(1, Math.round(THUMB_W * (h / w)));
    return { cssW, cssH };
  }

  // ---- placeholder thumbnail (clean labelled box) ----
  // Best-effort fallback when a page can't be rendered (non-active native page,
  // or a render/raster failure). A faint paper rect with the paper tag + page
  // number, sized to the page aspect. Never throws.
  function _placeholder(page, file) {
    const { cssW, cssH } = _thumbDims(page);
    const dpr = (typeof DPR === 'number' && DPR > 0) ? DPR : 1;
    const cnv = document.createElement('canvas');
    cnv.width = Math.max(1, Math.round(cssW * dpr));
    cnv.height = Math.max(1, Math.round(cssH * dpr));
    try {
      const c = cnv.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Paper fill + thin frame.
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, cssW, cssH);
      c.strokeStyle = 'rgba(0,0,0,0.18)';
      c.lineWidth = 1;
      c.strokeRect(0.5, 0.5, cssW - 1, cssH - 1);
      // Labels — paper tag (top) + page number (centred).
      const pageNum = _pageNumber(page, file);
      c.fillStyle = 'rgba(60,60,60,0.62)';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = '600 11px system-ui, sans-serif';
      c.fillText('Page ' + (pageNum != null ? pageNum : '?'), cssW / 2, cssH / 2);
      const tag = (page && page.paper && page.paper !== 'custom') ? String(page.paper) : '';
      if (tag) {
        c.font = '9px system-ui, sans-serif';
        c.fillStyle = 'rgba(120,120,120,0.7)';
        c.fillText(tag, cssW / 2, 10);
      }
    } catch (_) { /* a blank canvas is an acceptable last resort */ }
    return cnv;
  }

  // 1-based index of `page` within its owning file's sheets (for the label).
  function _pageNumber(page, file) {
    try {
      const f = file || ((typeof workspaceActiveFile === 'function') ? workspaceActiveFile() : null)
        || (typeof project !== 'undefined' ? project : null);
      if (f && Array.isArray(f.sheets)) {
        const idx = f.sheets.indexOf(page);
        if (idx >= 0) return idx + 1;
      }
    } catch (_) {}
    return null;
  }

  // ---- NATIVE page render (active page only) ----
  // Renders the CURRENT live globals (= the active page's content) into a small
  // real 2D canvas using the same global hot-swap dance as
  // js/51-multi-page-pdf.js _renderOneVectorPage, but targeting a px-scaled canvas
  // instead of the jsPDF shim. SYNCHRONOUS (render() is sync). try/finally ALWAYS
  // restores the live globals, even if render() throws. Returns the canvas, or
  // null if anything is missing (caller then uses a placeholder).
  //
  // Only valid for the ACTIVE page: render() reads the shared `blocks` array,
  // `sheetMode`, and project.activeSheetIdx, all of which already match the active
  // page. We deliberately do NOT reconfigure them for an off-screen page (that
  // would mean applySheetMode's DOM side-effects + clobbering the live `blocks`),
  // so non-active native pages use the placeholder.
  function _renderNativeActive(page) {
    // Required render globals must exist (post-boot). If not, bail to placeholder.
    if (typeof render !== 'function') return null;
    if (typeof ctx === 'undefined' || typeof canvas === 'undefined') return null;
    if (typeof viewport === 'undefined' || !viewport) return null;

    const pg = (typeof activePageSize === 'function')
      ? activePageSize()
      : (page && page.size) || { w: SHEET.W, h: SHEET.H };
    const pgW = (pg && pg.w > 0) ? pg.w : SHEET.W;
    const pgH = (pg && pg.h > 0) ? pg.h : SHEET.H;

    const { cssW, cssH } = _thumbDims(page);
    const dpr = (typeof DPR === 'number' && DPR > 0) ? DPR : 1;

    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(cssW * dpr));
    out.height = Math.max(1, Math.round(cssH * dpr));
    const octx = out.getContext('2d');
    if (!octx) return null;

    // Snapshot every live global render() mutates / reads from the viewport &
    // UI-interaction state. (Page CONTENT globals — objects3D/entities2D/etc —
    // are NOT swapped: we're rendering the page already loaded into them.)
    const saved = {
      canvas: canvas, ctx: ctx, W: W, H: H,
      viewport: { panX: viewport.panX, panY: viewport.panY, zoom: viewport.zoom },
      gridOn: (typeof gridOn !== 'undefined') ? gridOn : undefined,
      selected3DCopy: (typeof selected3D !== 'undefined' && Array.isArray(selected3D)) ? selected3D.slice() : null,
      activeBlock: (typeof activeBlock !== 'undefined') ? activeBlock : undefined,
      activeGrip: (typeof activeGrip !== 'undefined') ? activeGrip : undefined,
      rotateMode: (typeof rotateMode !== 'undefined') ? rotateMode : undefined,
      cursorSheet: (typeof cursorSheet !== 'undefined') ? cursorSheet : undefined,
      pdfExportMode: (typeof pdfExportMode !== 'undefined') ? pdfExportMode : undefined,
      selBoxStart: (typeof selBoxStart !== 'undefined') ? selBoxStart : undefined,
    };

    try {
      // Point the live render at the small canvas. zoom = px-per-sheet-mm so the
      // page rect s2px(0,0)..s2px(pgW,pgH) exactly fills the thumbnail; pan 0 so
      // the page's top-left sits at the canvas origin. render() applies the DPR
      // transform itself (ctx.setTransform(DPR,...)) keyed off the global DPR, so
      // we feed it CSS-px W/H and a DPR-backed canvas.
      canvas = out;
      ctx = octx;
      W = cssW;
      H = cssH;
      viewport.zoom = cssW / pgW;
      viewport.panX = 0;
      viewport.panY = 0;
      if (typeof gridOn !== 'undefined') gridOn = false;
      if (typeof selected3D !== 'undefined' && Array.isArray(selected3D)) selected3D.length = 0;
      if (typeof activeBlock !== 'undefined') activeBlock = null;
      if (typeof activeGrip !== 'undefined') activeGrip = null;
      if (typeof rotateMode !== 'undefined') rotateMode = false;
      if (typeof cursorSheet !== 'undefined') cursorSheet = null;
      if (typeof selBoxStart !== 'undefined') selBoxStart = null;
      // Keep pdfExportMode false (interactive raster path), matching on-screen.
      if (typeof pdfExportMode !== 'undefined') pdfExportMode = false;

      render();
    } catch (e) {
      console.warn('[thumb] native render failed; using placeholder.', e);
      out._thumbFailed = true;   // signal caller to fall back
    } finally {
      // ALWAYS restore — even if render() threw — so the live app is untouched.
      canvas = saved.canvas; ctx = saved.ctx; W = saved.W; H = saved.H;
      viewport.panX = saved.viewport.panX;
      viewport.panY = saved.viewport.panY;
      viewport.zoom = saved.viewport.zoom;
      if (saved.gridOn !== undefined) gridOn = saved.gridOn;
      if (saved.selected3DCopy && typeof selected3D !== 'undefined' && Array.isArray(selected3D)) {
        selected3D.length = 0;
        for (let i = 0; i < saved.selected3DCopy.length; i++) selected3D.push(saved.selected3DCopy[i]);
      }
      if (saved.activeBlock !== undefined) activeBlock = saved.activeBlock;
      if (saved.activeGrip !== undefined) activeGrip = saved.activeGrip;
      if (saved.rotateMode !== undefined) rotateMode = saved.rotateMode;
      if (saved.cursorSheet !== undefined) cursorSheet = saved.cursorSheet;
      if (saved.pdfExportMode !== undefined) pdfExportMode = saved.pdfExportMode;
      if (saved.selBoxStart !== undefined) selBoxStart = saved.selBoxStart;
      // We borrowed render()'s globals for an off-screen draw, which also ran
      // updateStatus() against the (temporarily emptied) selection/cursor. Request
      // a coalesced on-screen re-render so the live canvas + status bar reconcile
      // to the restored truth — mirrors the trailing requestRender() that
      // js/51-multi-page-pdf.js exportProjectToPDF uses after its hot-swap loop.
      if (typeof requestRender === 'function') requestRender();
    }
    if (out._thumbFailed) return null;
    return out;
  }

  // ---- generation dispatch for one queue item ----
  // Resolves a thumbnail for `page` (PDF raster, active-native render, or
  // placeholder), caches it, and notifies every waiter on `key`. Async because
  // the PDF path awaits pdf.js; native + placeholder are synchronous but folded
  // into the same promise for a uniform drain. Never rejects.
  function _generate(key, file, page) {
    // PDF page — the primary case. Small, fast, reuses the open pdf.js doc.
    if (page && page.bg && page.bg.type === 'pdf'
        && typeof window.renderPdfPageToCanvas === 'function') {
      const owner = file
        || ((typeof workspaceActiveFile === 'function') ? workspaceActiveFile() : null);
      return Promise.resolve()
        .then(function () { return window.renderPdfPageToCanvas(owner, page.bg, THUMB_W); })
        .then(function (cnv) {
          const result = cnv || _placeholder(page, file);
          // Only cache a genuine raster — a placeholder for a transient PDF miss
          // should be retried on the next request (doc may have opened by then).
          if (cnv) _cacheSet(key, result);
          _notify(key, result, !!cnv);
        })
        .catch(function (e) {
          console.warn('[thumb] pdf raster failed; placeholder.', e);
          _notify(key, _placeholder(page, file), false);
        });
    }

    // Native page. Render it ONLY if it is the active page (see _renderNativeActive).
    // Otherwise (and on any failure) hand back a placeholder.
    let result = null;
    let real = false;
    try {
      const activeP = (typeof activePage === 'function') ? activePage() : null;
      const isActive = activeP && page && activeP === page;
      if (isActive) {
        const cnv = _renderNativeActive(page);
        if (cnv) { result = cnv; real = true; }
      }
    } catch (e) {
      console.warn('[thumb] native generate failed; placeholder.', e);
    }
    if (!result) result = _placeholder(page, file);
    // Cache only a REAL native render; a placeholder (non-active page) stays
    // uncached so the page upgrades to a real thumbnail once it's visited.
    if (real) _cacheSet(key, result);
    _notify(key, result, real);
    return Promise.resolve();
  }

  // Fire every queued callback for `key`, then clear them.
  function _notify(key, result, cached) {
    const cbs = waiters.get(key);
    waiters.delete(key);
    if (!cbs) return;
    for (let i = 0; i < cbs.length; i++) {
      try { cbs[i](result, { cached: !!cached }); } catch (e) { console.warn('[thumb] cb error', e); }
    }
  }

  // ---- queue pump (throttled) ----
  function _pump() {
    while (inFlight < MAX_CONCURRENT && queue.length) {
      const item = queue.shift();
      // Re-check the cache: a concurrent request may have just produced it.
      const hit = _cacheGet(item.key);
      if (hit) { _notify(item.key, hit, true); continue; }
      inFlight++;
      _generate(item.key, item.file, item.page)
        .catch(function (e) { console.warn('[thumb] generate rejected', e); })
        .then(function () {
          inFlight--;
          _pump();
        });
    }
  }

  // Enqueue (or coalesce onto an in-flight) a generation for `key`. `prioritize`
  // puts it at the FRONT (used for the active page so it fills in first).
  function _enqueue(key, file, page, cb, prioritize) {
    // Attach this callback to the waiter list for the key.
    let cbs = waiters.get(key);
    if (!cbs) { cbs = []; waiters.set(key, cbs); }
    if (typeof cb === 'function') cbs.push(cb);
    // If a job for this key is already queued, don't add a duplicate (the waiter
    // list now carries the extra callback). Otherwise enqueue.
    const already = queue.some(function (q) { return q.key === key; });
    if (!already) {
      const job = { key: key, file: file, page: page };
      if (prioritize) queue.unshift(job); else queue.push(job);
    } else if (prioritize) {
      // Promote an existing job to the front.
      const i = queue.findIndex(function (q) { return q.key === key; });
      if (i > 0) { const j = queue.splice(i, 1)[0]; queue.unshift(j); }
    }
    _pump();
  }

  // ============================================================
  // PUBLIC API
  // ============================================================

  // pageThumbRequest(file, page, cb)
  //   Returns a cached HTMLCanvasElement immediately if one is ready (AND still
  //   calls cb on a microtask so callers have one consistent path). Otherwise
  //   returns null and asynchronously generates one, then calls
  //   cb(thumbCanvas, {cached}). `file` is the owning workspace file (used to
  //   resolve the PDF doc + the page-number label); pass null to default to the
  //   active file. Never throws.
  function pageThumbRequest(file, page, cb) {
    try {
      if (!page) { if (typeof cb === 'function') cb(null, { cached: false }); return null; }
      // File-scope the key so two files' same-id pages can't collide. Resolve the
      // owner once here and thread it into the job so the key's file id and the
      // PDF-doc owner _generate resolves stay consistent.
      const fid = _fileIdFor(file);
      const key = _keyFor(page, fid);
      const hit = _cacheGet(key);
      if (hit) {
        if (typeof cb === 'function') {
          // Microtask so the rail's synchronous card-build loop finishes before a
          // callback mutates the DOM (uniform with the async path; avoids re-entrancy).
          Promise.resolve().then(function () {
            try { cb(hit, { cached: true }); } catch (e) { console.warn('[thumb] cb error', e); }
          });
        }
        return hit;
      }
      // Prioritise the active page so the page on screen fills in first.
      let prioritize = false;
      try {
        const activeP = (typeof activePage === 'function') ? activePage() : null;
        prioritize = !!(activeP && activeP === page);
      } catch (_) {}
      // Resolve the owner object once and store it on the job so _generate's
      // PDF-doc lookup uses the SAME file the key was built from (else a null
      // `file` would let _generate fall back to the active file while the key
      // already baked in a specific fid — re-introducing a mismatch).
      let owner = file || null;
      if (!owner && typeof workspaceActiveFile === 'function') {
        try { owner = workspaceActiveFile(); } catch (_) { owner = null; }
      }
      _enqueue(key, owner, page, cb, prioritize);
      return null;
    } catch (e) {
      console.warn('[thumb] pageThumbRequest failed.', e);
      if (typeof cb === 'function') { try { cb(null, { cached: false }); } catch (_) {} }
      return null;
    }
  }

  // Does cache-key `k` belong to (fileId, pageId)? Keys are `<fid>/<pid>:<ver>`.
  // With a fileId we match the exact `<fid>/<pid>:` prefix (one file's page).
  // Without one (back-compat caller) we match ANY file's page with that pid by
  // checking the `/<pid>:` segment after the first slash.
  function _keyMatchesPage(k, pageId, fileId) {
    if (typeof k !== 'string') return false;
    if (fileId != null && fileId !== '?') {
      return k.indexOf(fileId + '/' + pageId + ':') === 0;
    }
    const slash = k.indexOf('/');
    if (slash < 0) return false;
    const colon = k.indexOf(':', slash + 1);
    if (colon < 0) return false;
    return k.slice(slash + 1, colon) === String(pageId);
  }

  // pageThumbInvalidate(pageId, fileId)
  //   Drop a page's cached thumbnail so its next request regenerates. Call when a
  //   page is edited (wired into workspaceTouchActive, which passes the owning
  //   file's id). Bumps the (file-scoped) page version so the OLD cache key is
  //   orphaned, and removes any matching cache entries / pending waiters / queued
  //   jobs. When `fileId` is given the drop is scoped to that ONE file's page (so
  //   editing file B's page 1 no longer churns file A's page-1 cache); when it's
  //   omitted, it falls back to dropping that page id across ALL files. PDF pages
  //   use a constant version, so this is a no-op for them — harmless to call.
  //   Never throws.
  function pageThumbInvalidate(pageId, fileId) {
    try {
      if (pageId == null) return;
      // Bump the version BEFORE dropping entries, so concurrent regenerations key
      // off the new version. Scoped to the file when we know it; otherwise bump
      // every file's entry for this page id.
      if (fileId != null && fileId !== '?') {
        const vk = fileId + '/' + pageId;
        const prev = (typeof verById[vk] === 'number') ? verById[vk] : 0;
        verById[vk] = prev + 1;
      } else {
        const suffix = '/' + pageId;
        Object.keys(verById).forEach(function (vk) {
          if (vk.slice(-suffix.length) === suffix) verById[vk] = (verById[vk] || 0) + 1;
        });
        // Ensure at least one bump exists even if no version entry was present yet
        // (a never-invalidated native page has no verById row): seed via the active
        // file so the next _keyFor sees a changed version.
        if (typeof project !== 'undefined' && project && project.id != null) {
          const vk = project.id + '/' + pageId;
          verById[vk] = (verById[vk] || 0) + 1;
        }
      }
      // Drop any cached entry / waiter for this page (cheap; the cache is small).
      const dropC = [];
      cache.forEach(function (_v, k) { if (_keyMatchesPage(k, pageId, fileId)) dropC.push(k); });
      for (let i = 0; i < dropC.length; i++) cache.delete(dropC[i]);
      const dropW = [];
      waiters.forEach(function (_v, k) { if (_keyMatchesPage(k, pageId, fileId)) dropW.push(k); });
      for (let i = 0; i < dropW.length; i++) waiters.delete(dropW[i]);
      // Prune any queued jobs for this page (they'd render stale content under an
      // orphaned key). The fresh request that follows the edit re-enqueues.
      for (let i = queue.length - 1; i >= 0; i--) {
        if (queue[i] && _keyMatchesPage(queue[i].key, pageId, fileId)) queue.splice(i, 1);
      }
    } catch (e) {
      console.warn('[thumb] pageThumbInvalidate failed.', e);
    }
  }

  // Publish the cross-module hooks (renderPagesTab in js/74 + workspaceTouchActive
  // in js/04 call these, guarded by typeof).
  window.pageThumbRequest = pageThumbRequest;
  window.pageThumbInvalidate = pageThumbInvalidate;

})();
