'use strict';

// V19.5 multi-page PDF export
// Extracted from dev/index.html lines 14016-14103 (2026-05-02 modular split)

// MULTI-PAGE PDF EXPORT (V19.5)
// ============================================================
// Renders every page into a single PDF, one page per sheet, via the V15
// vector path. Save → hot-swap to each sheet → render vector → addPage →
// finally restore the original sheet.
//
// multi-file-workspace Phase 5 — each jsPDF page now takes the SHEET's own size
// and orientation (native A1, or an imported PDF page's real A3/A4/portrait
// size), and a PDF-background page gets a ~300 DPI raster stamped under the
// vector overlay. To make activePage()/activePageSize() (read by drawSheet's
// page rect, the title-block suppression, and drawPdfBackground) follow the page
// being rendered, we set project.activeSheetIdx = i for each page (it isn't a
// user navigation — the live globals are hot-swapped in the loop — but the
// page-aware render helpers key off it). The original index is restored in
// finally via _projectLoadSheet. async because raster staging is async.
async function exportProjectToPDF() {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert('PDF library not loaded.'); return;
  }
  // V23.1 — uncommitted wizard previews should never leak into exports.
  if (connWizState) connWizCancel();
  _projectSnapshotActive();
  const originalIdx = project.activeSheetIdx;
  const exportFile = (typeof workspaceActiveFile === 'function') ? workspaceActiveFile() : null;
  const body = document.body;
  const hadDark = body.classList.contains('theme-dark');
  const hadClassic = body.classList.contains('theme-classic');
  body.classList.remove('theme-dark');
  body.classList.add('theme-classic');

  const { jsPDF } = window.jspdf;
  const fmt0 = _pdfPageFormat(project.sheets[0]);
  const pdf = new jsPDF({ orientation: fmt0.orientation, unit: 'mm', format: fmt0.format, compress: true });

  // multi-file-workspace — 1-based page numbers whose PDF background failed to
  // raster (pdf.js unavailable, doc re-open failed post-restore, render rejected).
  // Such a page exports blank-white (title block already suppressed), so we warn
  // the user once at the end rather than silently emitting a blank page for a PDF
  // they can see on screen.
  const bgFailedPages = [];

  try {
    for (let i = 0; i < project.sheets.length; i++) {
      const s = project.sheets[i];
      // multi-file-workspace — backfill per-page fields (size/paper/hasTitleBlock/
      // bg) on an OLD .sdproj page before any export helper reads them. The
      // interactive load path (_projectLoadSheet) always migrates; this loop
      // hot-swaps globals manually, so it must migrate here too. Idempotent.
      if (typeof migratePage === 'function') migratePage(s);
      const fmt = _pdfPageFormat(s);
      if (i > 0) pdf.addPage(fmt.format, fmt.orientation);
      // Load the target sheet into globals (without snapshotting — we already did)
      sheetInfo = JSON.parse(JSON.stringify(s.sheetInfo));
      objects3D = JSON.parse(JSON.stringify(s.objects3D));
      entities2D = JSON.parse(JSON.stringify(s.entities2D));
      secCutX = s.secCutX || 0; planCutY = s.planCutY || 0;
      objIdN = s.objIdN || 1; ent2dIdN = s.ent2dIdN || 1;
      // Point the page-aware render helpers at this page (drawSheet rect,
      // title-block suppression, drawPdfBackground all read activePage()).
      project.activeSheetIdx = i;

      // Stage a crisp ~300 DPI raster for a PDF-background page (no-op otherwise).
      // A PDF-background page whose raster could NOT be staged is recorded so we
      // can warn once after the save (it would otherwise be a blank page).
      if (typeof _pdfStageBgRaster === 'function') {
        const staged = await _pdfStageBgRaster(exportFile, s);
        if (!staged && s && s.bg && s.bg.type === 'pdf') bgFailedPages.push(i + 1);
      }

      try {
        // Run the V15 vector render pipeline into this page
        _renderOneVectorPage(pdf, fmt);
      } finally {
        // Always clear so a staged raster never leaks into the next page (a
        // native page in a mixed file stages nothing and must not inherit one).
        if (typeof window.setPdfExportRaster === 'function') window.setPdfExportRaster(null);
      }
    }
    const fname = `${(project.sheets[0].sheetInfo.project) || 'project'}.pdf`
      .replace(/[^a-z0-9._-]/gi, '_');
    pdf.save(fname);
    if (bgFailedPages.length && typeof alert === 'function') {
      alert('PDF export warning: the PDF background could not be rendered for page'
        + (bgFailedPages.length > 1 ? 's ' : ' ') + bgFailedPages.join(', ')
        + '. ' + (bgFailedPages.length > 1 ? 'These pages were' : 'This page was')
        + ' exported blank (markup only).');
    }
  } catch (e) {
    console.error('Project PDF export failed:', e);
    alert('Project PDF export failed: ' + e.message);
  } finally {
    // Restore the original active page (also resets project.activeSheetIdx).
    _projectLoadSheet(originalIdx);
    if (hadDark) body.classList.add('theme-dark');
    if (!hadClassic) body.classList.remove('theme-classic');
    requestRender();
  }
}

// Helper — render the *current globals* into the *current page* of `pdf`
// using the same shim/state dance as exportSheetToPDFVector. Factored out
// so it can be reused per-page in exportProjectToPDF without re-creating
// a whole PDF object. `fmt` (from _pdfPageFormat) sizes the shim canvas + the
// white pre-fill to the page being rendered; defaults to A1 for safety.
function _renderOneVectorPage(pdf, fmt) {
  fmt = fmt || (typeof _pdfPageFormat === 'function'
    ? _pdfPageFormat(typeof activePage === 'function' ? activePage() : null)
    : { w: SHEET.W, h: SHEET.H });
  const saved = {
    canvas, ctx, W, H,
    viewport: { ...viewport },
    gridOn,
    selected3DCopy: [...selected3D],
    activeBlock, activeGrip, rotateMode, cursorSheet,
    pdfExportMode,
  };
  const shim = createPdfCanvasShim(pdf);
  const fakeCanvas = { width: fmt.w, height: fmt.h };
  canvas = fakeCanvas; ctx = shim; W = fmt.w; H = fmt.h;
  viewport.zoom = 1; viewport.panX = 0; viewport.panY = 0;
  gridOn = false;
  selected3D.length = 0;
  activeBlock = null; activeGrip = null; rotateMode = false; cursorSheet = null;
  pdfExportMode = true;
  try {
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, fmt.w, fmt.h, 'F');
    render();
  } finally {
    canvas = saved.canvas; ctx = saved.ctx; W = saved.W; H = saved.H;
    Object.assign(viewport, saved.viewport);
    gridOn = saved.gridOn;
    selected3D.length = 0;
    for (const o of saved.selected3DCopy) selected3D.push(o);
    activeBlock = saved.activeBlock; activeGrip = saved.activeGrip;
    rotateMode = saved.rotateMode; cursorSheet = saved.cursorSheet;
    pdfExportMode = saved.pdfExportMode;
  }
}

