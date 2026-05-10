'use strict';

// Toolbar (initToolbar + dispatch)
// Extracted from dev/index.html lines 16139-16500 (2026-05-02 modular split)

// TOOLBAR
// ============================================================

function initToolbar() {
  document.getElementById('toolSelect').addEventListener('click', () => setTool('select'));
  document.getElementById('toolLine').addEventListener('click', () => setTool('line'));
  document.getElementById('toolRect').addEventListener('click', () => setTool('rect'));
  document.getElementById('toolCircle').addEventListener('click', () => setTool('circle'));
  document.getElementById('toolPolyline').addEventListener('click', () => setTool('polyline'));
  document.getElementById('toolDim').addEventListener('click', () => setTool('dimension'));
  document.getElementById('toolText').addEventListener('click', () => setTool('text'));

  document.getElementById('btnSnap').addEventListener('click', () => {
    snapOn = !snapOn; document.getElementById('btnSnap').classList.toggle('active', snapOn);
  });
  document.getElementById('btnOrtho').addEventListener('click', () => {
    orthoOn = !orthoOn; document.getElementById('btnOrtho').classList.toggle('active', orthoOn);
  });
  document.getElementById('btnGrid').addEventListener('click', () => {
    gridOn = !gridOn; document.getElementById('btnGrid').classList.toggle('active', gridOn); requestRender();
  });

  document.getElementById('btnUndo').addEventListener('click', undo);
  document.getElementById('btnRedo').addEventListener('click', redo);

  document.getElementById('btnZoomFit').addEventListener('click', fitToView);

  document.getElementById('btnExportPDF').addEventListener('click', exportSheetToPDF);
  document.getElementById('btnExportDXF').addEventListener('click', exportSheetToDXF);
  const btnAll = document.getElementById('btnExportPDFAll');
  if (btnAll) btnAll.addEventListener('click', exportProjectToPDF);
  const btnSave = document.getElementById('btnSaveProject');
  if (btnSave) btnSave.addEventListener('click', exportProject);
  const btnLoad = document.getElementById('btnLoadProject');
  if (btnLoad) btnLoad.addEventListener('click', importProject);
  const btnLayers = document.getElementById('btnLayers');
  if (btnLayers) btnLayers.addEventListener('click', toggleLayerPanel);
  const btnKbd = document.getElementById('btnKbdHelp');
  if (btnKbd) btnKbd.addEventListener('click', toggleKbdHelp);

  // --- Title Block dialog wiring ---
  const tbDlg = document.getElementById('titleBlockDialog');
  document.getElementById('btnTitleBlock').addEventListener('click', () => {
    // Populate inputs from sheetInfo
    const fields = ['project','client','description','drawingNo','revision','date',
                    'sheetOf','designer','checker','firmName','firmTagline'];
    fields.forEach(f => {
      const el = document.getElementById('tb' + f.charAt(0).toUpperCase() + f.slice(1));
      if (el) el.value = sheetInfo[f] || '';
    });
    tbDlg.classList.add('visible');
  });
  document.getElementById('tbOkBtn').addEventListener('click', () => {
    const getv = id => { const el = document.getElementById(id); return el ? el.value : ''; };
    sheetInfo.project     = getv('tbProject');
    sheetInfo.client      = getv('tbClient');
    sheetInfo.description = getv('tbDescription');
    sheetInfo.drawingNo   = getv('tbDrawingNo');
    sheetInfo.revision    = getv('tbRevision');
    sheetInfo.date        = getv('tbDate');
    sheetInfo.sheetOf     = getv('tbSheetOf');
    sheetInfo.designer    = getv('tbDesigner');
    sheetInfo.checker     = getv('tbChecker');
    sheetInfo.firmName    = getv('tbFirmName');
    sheetInfo.firmTagline = getv('tbFirmTagline');
    tbDlg.classList.remove('visible');
    // V19.5 — mirror into the active sheet slot + refresh browser (drawingNo)
    if (typeof _projectSnapshotActive === 'function') _projectSnapshotActive();
    if (typeof renderSheetBrowser === 'function') renderSheetBrowser();
    requestRender();
  });

  document.getElementById('scaleSelect').addEventListener('change', (e) => {
    drawingScale = parseFloat(e.target.value);
    // Reposition blocks for new scale
    layoutBlocks();
    requestRender();
  });
  document.getElementById('gridSizeSelect').addEventListener('change', (e) => {
    gridSize = parseFloat(e.target.value); requestRender();
  });
  document.getElementById('nudgeSizeSelect').addEventListener('change', (e) => {
    nudgeSize = parseFloat(e.target.value);
  });

  // V25 — theme button toggles ONLY between warm-light and warm-dark (the
  // V25 designed pair). Legacy themes (classic / dark / bt) remain defined
  // in CSS and reachable via the command palette ("Theme: Classic" etc.)
  // but don't interrupt the simple Light/Dark toggle most users want.
  const ALL_THEMES = ['theme-warm-light', 'theme-warm-dark', 'theme-classic', 'theme-dark', 'theme-bt'];
  const TOGGLE_PAIR = ['theme-warm-light', 'theme-warm-dark'];
  function applyTheme(name) {
    const body = document.body;
    ALL_THEMES.forEach(t => body.classList.remove(t));
    body.classList.add(name);
    try { localStorage.setItem('structdraw_theme', name); } catch (e) {}
    requestRender();
  }
  // V25 — expose so the command palette (defined at module scope, before
  // this DOMContentLoaded handler runs) can call it by the time the user
  // actually fires a "Theme: …" entry.
  window.applyTheme = applyTheme;
  // Restore on load
  try {
    const stored = localStorage.getItem('structdraw_theme');
    if (stored && ALL_THEMES.includes(stored)) applyTheme(stored);
  } catch (e) {}
  document.getElementById('themeBtn').addEventListener('click', () => {
    const body = document.body;
    // If user is on a legacy theme, toggle returns them to warm-light first.
    const current = TOGGLE_PAIR.find(t => body.classList.contains(t));
    const next = current === 'theme-warm-dark' ? 'theme-warm-light' : 'theme-warm-dark';
    applyTheme(next);
  });

  // Save/Load buttons
  document.getElementById('btnSave').addEventListener('click', saveProject);
  document.getElementById('btnLoad').addEventListener('click', () => document.getElementById('fileInput').click());
  document.getElementById('fileInput').addEventListener('change', (e) => {
    if (e.target.files.length > 0) { loadProject(e.target.files[0]); e.target.value = ''; }
  });

  // Bolt group dialog OK
  document.getElementById('bgOkBtn').addEventListener('click', () => {
    boltGroupConfig = {
      boltSize: document.getElementById('bgSize').value,
      rows: parseInt(document.getElementById('bgRows').value) || 2,
      cols: parseInt(document.getElementById('bgCols').value) || 4,
      gauge: parseFloat(document.getElementById('bgGauge').value) || 70,
      pitch: parseFloat(document.getElementById('bgPitch').value) || 140,
    };
    document.getElementById('boltGroupDialog').classList.remove('visible');
    tool = 'place-bolt-group'; canvas.style.cursor = 'crosshair';
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    updateStatus();
  });

  // Weld-dialog plumbing: both-sides checkbox toggles the otherType/otherSize
  // inputs so the form can't leak a stale "other" value into a one-side weld.
  const wdBoth = document.getElementById('wdBothSides');
  if (wdBoth) {
    wdBoth.addEventListener('change', () => {
      document.getElementById('wdOtherType').disabled = !wdBoth.checked;
      document.getElementById('wdOtherSize').disabled = !wdBoth.checked;
    });
  }

  // Properties write-back
  ['propX', 'propY', 'propZ'].forEach(id => {
    document.getElementById(id).addEventListener('change', (ev) => {
      if (selected3D.length !== 1) return;
      const o = selected3D[0];
      const val = parseFloat(ev.target.value);
      if (isNaN(val)) return;
      if (id === 'propX') o.x = val;
      else if (id === 'propY') o.y = val;
      else o.z = val;
      requestRender();
    });
  });

  document.getElementById('btnSnap').classList.toggle('active', snapOn);
  document.getElementById('btnGrid').classList.toggle('active', gridOn);

  // =====================================================
  // V21 SHELL WIRING (top bar, status bar, hamburger menu)
  // =====================================================

  // Status-bar toggles mirror the legacy hidden buttons they shadow.
  const sbSnap = document.getElementById('sbSnap');
  const sbOrtho = document.getElementById('sbOrtho');
  const sbGrid = document.getElementById('sbGrid');
  if (sbSnap) {
    sbSnap.classList.toggle('active', snapOn);
    sbSnap.addEventListener('click', () => {
      snapOn = !snapOn;
      sbSnap.classList.toggle('active', snapOn);
      document.getElementById('btnSnap').classList.toggle('active', snapOn);
    });
  }
  if (sbOrtho) {
    sbOrtho.classList.toggle('active', orthoOn);
    sbOrtho.addEventListener('click', () => {
      orthoOn = !orthoOn;
      sbOrtho.classList.toggle('active', orthoOn);
      document.getElementById('btnOrtho').classList.toggle('active', orthoOn);
    });
  }
  if (sbGrid) {
    sbGrid.classList.toggle('active', gridOn);
    sbGrid.addEventListener('click', () => {
      gridOn = !gridOn;
      sbGrid.classList.toggle('active', gridOn);
      document.getElementById('btnGrid').classList.toggle('active', gridOn);
      requestRender();
    });
  }

  // V25 — Horizontal menubar wiring.
  // Each .menubar__item toggles its associated #menu* dropdown anchored
  // below it. All dropdowns use the shared dispatch table (extended to
  // cover Edit / Draw / Modify / Annotate / View actions). The previous
  // hamburger wiring is gone; the empty #mainMenu shim element survives
  // for any legacy code that still references it.
  const menubarItems = document.querySelectorAll('.menubar__item');
  // V25-layout-overhaul — menu structure: File / Edit / View / Document / Tools / Windows
  const allMenus = ['menuFile','menuEdit','menuView','menuDocument','menuTools','menuWindows']
    .map(id => document.getElementById(id))
    .filter(Boolean);
  function closeAllMenubarMenus() {
    allMenus.forEach(m => m.classList.remove('open'));
    menubarItems.forEach(b => b.classList.remove('open'));
  }
  function openMenubarMenu(btnEl, menuEl) {
    closeAllMenubarMenus();
    if (!menuEl) return;
    menuEl.classList.add('open');
    btnEl.classList.add('open');
    // Anchor under the button. Top-bar height = 44; menu sits 4 px below.
    const r = btnEl.getBoundingClientRect();
    menuEl.style.left = Math.round(r.left) + 'px';
    menuEl.style.top  = Math.round(r.bottom + 4) + 'px';
  }
  // V25 dispatch table — every menu item routes through here.
  const menubarDispatch = {
    // File
    newSheet:  () => {
      const name = prompt('New sheet name:', `Sheet ${project.sheets.length + 1}`);
      if (name) projectAddSheet(name);
    },
    saveProject: () => exportProject(),
    loadProject: () => importProject(),
    // Edit
    undo:      () => { if (typeof undo  === 'function') undo();  },
    redo:      () => { if (typeof redo  === 'function') redo();  },
    copy:      () => document.execCommand && document.execCommand('copy'),
    paste:     () => document.execCommand && document.execCommand('paste'),
    selectAll: () => {
      // Mirror Ctrl+A behaviour from the keydown handler
      if (typeof selected3D !== 'undefined' && typeof objects3D !== 'undefined') {
        selected3D = [...objects3D]; if (typeof requestRender === 'function') requestRender();
      }
    },
    // Draw / Modify / Annotate — switch mode + activate tool
    modeDraw:     () => setMode('draw'),
    modeAnnotate: () => setMode('annotate'),
    toolLine:     () => setTool('line'),
    toolRect:     () => setTool('rect'),
    toolCircle:   () => setTool('circle'),
    toolPolyline: () => setTool('polyline'),
    toolArc:      () => setTool('arc'),
    toolMirror:   () => setTool('mirror'),
    toolOffset:   () => setTool('offset'),
    toolFillet:   () => setTool('fillet'),
    toolChamfer:  () => setTool('chamfer'),
    toolDim:      () => setTool('dimension'),
    toolText:     () => setTool('text'),
    toolWeld:     () => {
      const wd = document.getElementById('weldDialog');
      if (wd) wd.classList.add('visible');
    },
    titleBlock:   () => {
      const b = document.getElementById('btnTitleBlock');
      if (b) b.click();
      else { const d = document.getElementById('titleBlockDialog'); if (d) d.classList.add('visible'); }
    },
    // View
    zoomFit:      () => { if (typeof fitToView === 'function') fitToView(); },
    toggleGrid:   () => { gridOn  = !gridOn;
      document.getElementById('btnGrid' )?.classList.toggle('active', gridOn );
      document.getElementById('sbGrid'  )?.classList.toggle('active', gridOn );
      requestRender(); },
    toggleSnap:   () => { snapOn  = !snapOn;
      document.getElementById('btnSnap' )?.classList.toggle('active', snapOn );
      document.getElementById('sbSnap'  )?.classList.toggle('active', snapOn );
      requestRender(); },
    toggleOrtho:  () => { orthoOn = !orthoOn;
      document.getElementById('btnOrtho')?.classList.toggle('active', orthoOn);
      document.getElementById('sbOrtho' )?.classList.toggle('active', orthoOn);
      requestRender(); },
    toggle3D:     () => { const b = document.getElementById('btn3DView'); if (b) b.click(); },
    cmdPalette:   () => { if (typeof _palOpen === 'function') _palOpen(); },
    kbdHelp:      () => { if (typeof toggleKbdHelp === 'function') toggleKbdHelp(); },
    // Output
    exportPDF:    () => exportSheetToPDF(),
    exportPDFAll: () => exportProjectToPDF(),
    exportDXF:    () => exportSheetToDXF(),
    // V25-layout-overhaul additions
    cycleTheme:   () => { const b = document.getElementById('themeBtn'); if (b) b.click(); },
    toggleRail:   () => {
      const m = document.getElementById('mainLayout');
      if (m) m.classList.toggle('bb-rail-collapsed');
    },
  };
  menubarItems.forEach(btn => {
    const menuId = btn.dataset.menu;
    const menuEl = document.getElementById(menuId);
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (btn.classList.contains('open')) closeAllMenubarMenus();
      else openMenubarMenu(btn, menuEl);
    });
    btn.addEventListener('mouseenter', () => {
      // If any menu is currently open, follow the cursor across the strip.
      if (allMenus.some(m => m.classList.contains('open'))) openMenubarMenu(btn, menuEl);
    });
  });
  allMenus.forEach(m => {
    m.addEventListener('click', (e) => {
      const it = e.target.closest('.menu-item');
      // V25-layout-overhaul — ignore disabled placeholders so the menu stays
      // open and nothing fires. They're visually faded via .menu-item.disabled.
      if (!it || it.classList.contains('disabled')) return;
      closeAllMenubarMenus();
      const action = it.dataset.action;
      if (menubarDispatch[action]) menubarDispatch[action]();
    });
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.menubar') && !e.target.closest('.menu')) closeAllMenubarMenus();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllMenubarMenus();
  });

  // New sheet button in top bar
  const addSheetBtn = document.getElementById('btnAddSheet');
  if (addSheetBtn) {
    addSheetBtn.addEventListener('click', () => {
      const name = prompt('New sheet name:', `Sheet ${project.sheets.length + 1}`);
      if (name) projectAddSheet(name);
    });
  }

  // Mode switcher — just sets a global and re-renders the palette. Actual
  // palette filtering lives in V21.4's populateTilePalette.
  const modeBtns = document.querySelectorAll('.mode-seg');
  modeBtns.forEach(b => {
    b.addEventListener('click', () => {
      const m = b.dataset.mode;
      setMode(m);
    });
  });

  // V25 — Sheet-mode (3D | 2D) toggle. Per-sheet drawing mode.
  document.querySelectorAll('.sheet-mode-seg').forEach(b => {
    b.addEventListener('click', () => {
      applySheetMode(b.dataset.sheetmode);
    });
  });
}

// V21 current mode — 'model' | 'draw' | 'annotate'.
let currentMode = 'model';
function setMode(m) {
  currentMode = m;
  document.querySelectorAll('.mode-seg').forEach(s => {
    s.classList.toggle('active', s.dataset.mode === m);
  });
  if (typeof populateTilePalette === 'function') populateTilePalette();
}

