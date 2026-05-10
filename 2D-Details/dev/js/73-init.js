'use strict';

// INIT — DOMContentLoaded bootstrap + window.resize handler
// Extracted from dev/index.html lines 21722-21805 (2026-05-02 modular split)

// INIT
// ============================================================

window.addEventListener('DOMContentLoaded', () => {
  container = document.getElementById('canvas-container');
  canvas = document.getElementById('mainCanvas');
  ctx = canvas.getContext('2d');

  // Create detail blocks (4 views) — positions/sizes set by layoutBlocks()
  const elevBlock = new DetailBlock('elevation', projElev, 0, 0);
  const secABlock = new DetailBlock('sectionA', projSecA, 0, 0);
  const planBBlock = new DetailBlock('planB', projPlanB, 0, 0);
  const isoBlock = new DetailBlock('isometric', null, 0, 0);
  blocks = [elevBlock, secABlock, planBBlock, isoBlock];
  activeBlock = elevBlock;

  // Set default positions and generous box sizes
  layoutBlocks();

  resize();
  initEvents();
  initKeyboard();
  populateLibrary();     // V20 legacy library (populates hidden shim DOM only)
  populateTilePalette(); // V21 tile palette — the real user-visible UI
  initToolbar();
  setTool('select');

  // Demo objects — UB beam landing on a vertical SHS column with a 60mm
  // gap between the column face and the beam end (typical end-plate space).
  addObj(mkObj('ub', { section: '360UB 50.7', x: 0, y: 0, z: 0, length: 600 }));
  addObj(mkObj('shs', {
    section: '150x6',
    x: -435, y: 0, z: 0,
    length: 500,
    axis: { x: 0, y: 1, z: 0 },
    up: { x: -1, y: 0, z: 0 },
  }));
  undoStack = []; redoStack = [];

  // V19.5 initialise the multi-sheet project model with the current state
  // as the first sheet, then render the sheet-browser sidebar.
  projectInit();
  renderSheetBrowser();
  wireSheetBrowser();

  // V25 — install new chord prefixes (H/B/K/W) and apply the active sheet's
  // mode (default '3d' for fresh installs, restored from saved projects).
  if (typeof v25InstallChords === 'function') v25InstallChords();
  if (typeof applySheetMode === 'function') {
    const startMode = (project.sheets[project.activeSheetIdx] && project.sheets[project.activeSheetIdx].mode) || '3d';
    applySheetMode(startMode, /*silent=*/true);
  }

  // V20 — command palette, keyboard help close, layer panel close
  initCmdPalette();
  const kbdClose = document.getElementById('kbdHelpClose');
  if (kbdClose) kbdClose.addEventListener('click', toggleKbdHelp);
  const lyrClose = document.getElementById('layerPanelClose');
  if (lyrClose) lyrClose.addEventListener('click', toggleLayerPanel);

  fitToView();

  // Init 3D isometric viewer (offscreen renderer)
  v3dInit();
  v3dDirty = true;

  // 3D toolbar toggle button
  const toggleBtn3D = document.getElementById('btn3DView');
  if (toggleBtn3D) {
    toggleBtn3D.classList.add('active');
    toggleBtn3D.addEventListener('click', () => {
      const isoBlk = blocks.find(b => b.viewKey === 'isometric');
      if (isoBlk) {
        isoBlk.hidden = !isoBlk.hidden;
        toggleBtn3D.classList.toggle('active', !isoBlk.hidden);
        requestRender();
      }
    });
  }

  // Enter/Escape to stop orbiting
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === 'Escape') && v3dOrbiting) {
      v3dStopOrbit();
      e.preventDefault();
    }
  });
});

window.addEventListener('resize', () => { resize(); fitToView(); });

