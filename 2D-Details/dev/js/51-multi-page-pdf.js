'use strict';

// V19.5 multi-page PDF export
// Extracted from dev/index.html lines 14016-14103 (2026-05-02 modular split)

// MULTI-PAGE PDF EXPORT (V19.5)
// ============================================================
// Renders every sheet into a single PDF, one page per sheet, via the V15
// vector path. Save → hot-swap to each sheet → render vector → addPage →
// finally restore the original sheet.
function exportProjectToPDF() {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert('PDF library not loaded.'); return;
  }
  // V23.1 — uncommitted wizard previews should never leak into exports.
  if (connWizState) connWizCancel();
  _projectSnapshotActive();
  const originalIdx = project.activeSheetIdx;
  const body = document.body;
  const hadDark = body.classList.contains('theme-dark');
  const hadClassic = body.classList.contains('theme-classic');
  body.classList.remove('theme-dark');
  body.classList.add('theme-classic');

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [SHEET.W, SHEET.H], compress: true });

  try {
    for (let i = 0; i < project.sheets.length; i++) {
      if (i > 0) pdf.addPage([SHEET.W, SHEET.H], 'landscape');
      // Load the target sheet into globals (without snapshotting — we already did)
      const s = project.sheets[i];
      sheetInfo = JSON.parse(JSON.stringify(s.sheetInfo));
      objects3D = JSON.parse(JSON.stringify(s.objects3D));
      entities2D = JSON.parse(JSON.stringify(s.entities2D));
      secCutX = s.secCutX || 0; planCutY = s.planCutY || 0;
      objIdN = s.objIdN || 1; ent2dIdN = s.ent2dIdN || 1;

      // Run the V15 vector render pipeline into this page
      _renderOneVectorPage(pdf);
    }
    const fname = `${(project.sheets[0].sheetInfo.project) || 'project'}.pdf`
      .replace(/[^a-z0-9._-]/gi, '_');
    pdf.save(fname);
  } catch (e) {
    console.error('Project PDF export failed:', e);
    alert('Project PDF export failed: ' + e.message);
  } finally {
    // Restore
    _projectLoadSheet(originalIdx);
    if (hadDark) body.classList.add('theme-dark');
    if (!hadClassic) body.classList.remove('theme-classic');
    requestRender();
  }
}

// Helper — render the *current globals* into the *current page* of `pdf`
// using the same shim/state dance as exportSheetToPDFVector. Factored out
// so it can be reused per-page in exportProjectToPDF without re-creating
// a whole PDF object.
function _renderOneVectorPage(pdf) {
  const saved = {
    canvas, ctx, W, H,
    viewport: { ...viewport },
    gridOn,
    selected3DCopy: [...selected3D],
    activeBlock, activeGrip, rotateMode, cursorSheet,
    pdfExportMode,
  };
  const shim = createPdfCanvasShim(pdf);
  const fakeCanvas = { width: SHEET.W, height: SHEET.H };
  canvas = fakeCanvas; ctx = shim; W = SHEET.W; H = SHEET.H;
  viewport.zoom = 1; viewport.panX = 0; viewport.panY = 0;
  gridOn = false;
  selected3D.length = 0;
  activeBlock = null; activeGrip = null; rotateMode = false; cursorSheet = null;
  pdfExportMode = true;
  try {
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, SHEET.W, SHEET.H, 'F');
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

