'use strict';

// V25 — 2D Studio: data catalogues + mode switching + scale per frame
// Extracted from dev/index.html lines 17037-17211 (2026-05-02 modular split)

// V25 — 2D STUDIO
// ============================================================
// Per-sheet 2D mode for paper-space structural detailing — blockwork,
// material hatches, anchors, reinforcement, leaders, multiple framed
// details on one page. Designed to make the kind of details produced
// by AS-compliant Bluebeam markup workflows (operable wall braces,
// purlin cleats, lintel sections, panel waterproofing, lift pits)
// faster to produce than Bluebeam.
//
// Coexists with the existing 3D-projection workspace: each sheet
// carries `mode: '3d' | '2d'`. New entities are stored in
// entities2D.elevation (the only visible block in 2D mode) tagged
// with `_v25:true` so existing tooling treats them as opaque
// annotation entities. All new render functions return early on
// type mismatch so they can be dispatched in one switch.
// ============================================================

// ---- DATA: canonical block, anchor, bar catalogues ----
const V25_BLOCK_DB = {
  // AS/NZS 4455 hollow concrete blocks. Course = block height + 10mm bed joint.
  // Perpend (vertical) joint = 10mm. nominal_face shows finished face dim.
  '90':  { thk:  90, h: 190, l: 390, perp: 10, bed: 10, label: '90 series' },
  '110': { thk: 110, h: 190, l: 390, perp: 10, bed: 10, label: '110 series' },
  '140': { thk: 140, h: 190, l: 390, perp: 10, bed: 10, label: '140 series' },
  '190': { thk: 190, h: 190, l: 390, perp: 10, bed: 10, label: '190 series' },
  '290': { thk: 290, h: 190, l: 390, perp: 10, bed: 10, label: '290 series' },
};
const V25_LINTEL_BLOCK_DB = {
  '190x190': { thk: 190, h: 190, label: '190 lintel' },
  '190x290': { thk: 190, h: 290, label: '290 deep lintel' },
  '140x190': { thk: 140, h: 190, label: '140 lintel' },
};
const V25_ANCHOR_DB = {
  // Common Australian masonry/concrete fasteners.
  trubolt: {
    label: 'Trubolt anchor',
    sizes: ['M10','M12','M16','M20','M24'],
    embeds: { M10:60, M12:75, M16:95, M20:115, M24:140 },
    template: '{count}-{size} RAMSET TRUBOLT ANCHORS\nAT {spacing} MIN. CRS\n{embed} EMBEDMENT',
    defaults: { count: 1, size: 'M16', spacing: 200, embed: 95 },
    headD: 30, sleeveD: 18,
  },
  chemset: {
    label: 'Chemset anchor (epoxy)',
    sizes: ['M12','M16','M20','M24'],
    embeds: { M12:110, M16:125, M20:170, M24:210 },
    template: 'RAMSET CHEMSET INJECTION 801\nWITH {count}-{size} CHEMSET ANCHOR STUD\n{embed} MIN. EMBEDMENT',
    defaults: { count: 1, size: 'M16', embed: 110 },
    headD: 24, shaftD: 16,
  },
  coach: {
    label: 'Coach screw',
    sizes: ['M10','M12','M16'],
    template: '{count}-{size} COACH SCREW\n{embed} MIN. EMBEDMENT',
    defaults: { count: 1, size: 'M12', embed: 75 },
    headD: 22, shaftD: 12,
  },
  selftap: {
    label: 'Self-tap screw',
    sizes: ['10g','12g','14g'],
    template: '{count}-{size} TEK SCREW',
    defaults: { count: 1, size: '12g', embed: 0 },
    headD: 14, shaftD: 6,
  },
  through: {
    label: 'Through-bolt',
    sizes: ['M12','M16','M20','M24','M30'],
    template: '{count}-{size} BOLT 8.8/S\nGALV. WITH WASHERS',
    defaults: { count: 1, size: 'M20', embed: 0 },
    headD: 30, shaftD: 20,
  },
};
const V25_REO_DB = {
  bars: {
    'N12': { d: 12, type: 'N' }, 'N16': { d: 16, type: 'N' },
    'N20': { d: 20, type: 'N' }, 'N24': { d: 24, type: 'N' },
    'N28': { d: 28, type: 'N' }, 'N32': { d: 32, type: 'N' },
    'N36': { d: 36, type: 'N' }, 'N40': { d: 40, type: 'N' },
    'R6':  { d: 6,  type: 'R' }, 'R10': { d: 10, type: 'R' },
  },
  meshes: {
    'SL62':  { dia: 6,   spacing: 200, label: 'SL62' },
    'SL72':  { dia: 6.75,spacing: 200, label: 'SL72' },
    'SL82':  { dia: 7.6, spacing: 200, label: 'SL82' },
    'SL92':  { dia: 8.6, spacing: 200, label: 'SL92' },
    'SL102': { dia: 9.5, spacing: 200, label: 'SL102' },
    'RL718': { dia: 7,   spacing: 100, label: 'RL718' },
    'RL818': { dia: 7.95,spacing: 100, label: 'RL818' },
    'RL918': { dia: 8.55,spacing: 100, label: 'RL918' },
    'RL1018':{ dia: 9.5, spacing: 100, label: 'RL1018' },
  },
};

// Frame default scales (1:N). Each scale shows world-space at frame-relative size.
const V25_SCALES = [5, 10, 20, 25, 50, 100, 200];

// Last-used picker state for V25 tools (mirrors lastUsedSection)
const v25Last = {
  anchor: 'chemset',
  anchorSize: 'M16',
  anchorEmbed: 110,
  reoBar: 'N16',
  mesh: 'SL72',
  blockThk: '190',
  // Blockwork draw mode — 'sec' = thin vertical section strip (two-click
  // directional, width = block thickness), 'elev' = elevation extent (rect
  // with running-bond coursing). Chosen via the blockwork options-bar icon
  // row; persists across tool re-arms (v25SetTool wipes v25State, not v25Last).
  wallMode: 'sec',
  // Which end of a section strip carries the AS 1100 break-line: 'start'
  // (first click), 'end' (second click), 'both', or 'none'.
  wallEnd: 'start',
  // Show grout fill in the section-strip cores (reinforced/grouted cells).
  wallGrouted: false,
  material: 'concrete',
};

// ---- MODE SWITCHING ----
// Reconfigures the viewport for the chosen sheet mode. In 2D mode we hide
// section/plan/iso blocks, expand the elevation block to fill DA, and tag
// the body so CSS can hide the Model/Draw/Annotate switcher.
function applySheetMode(mode, silent) {
  sheetMode = (mode === '2d') ? '2d' : '3d';
  // Mirror onto the active sheet record
  const s = project.sheets && project.sheets[project.activeSheetIdx];
  if (s) s.mode = sheetMode;

  // Top-bar segmented control
  document.querySelectorAll('.sheet-mode-seg').forEach(b => {
    b.classList.toggle('active', b.dataset.sheetmode === sheetMode);
  });
  document.body.classList.toggle('sheet-2d', sheetMode === '2d');

  // Reconfigure the detail blocks for the chosen mode.
  const elev = blocks.find(b => b.viewKey === 'elevation');
  const secA = blocks.find(b => b.viewKey === 'sectionA');
  const planB = blocks.find(b => b.viewKey === 'planB');
  const iso = blocks.find(b => b.viewKey === 'isometric');
  if (sheetMode === '2d') {
    if (secA) secA.hidden = true;
    if (planB) planB.hidden = true;
    if (iso) iso.hidden = true;
    if (elev) {
      elev.hidden = false;
      // Fill the drawing area edge-to-edge.
      elev.boxW = DA.width - 4;
      elev.boxH = DA.height - 4;
      elev.sheetX = DA.left + (DA.width) / 2;
      elev.sheetY = DA.top + (DA.height) / 2;
    }
    activeBlock = elev;
    // Use the same 1:10 paper scale as 3D mode so members and parametric
    // content (UB sections, blockwork, anchors, reo bars) render at the
    // correct engineering scale on the page. Per-frame scale overrides come
    // later via v25WithFrameScale().
    drawingScale = 10;
  } else {
    // Restore the standard 4-pane layout.
    if (secA) secA.hidden = false;
    if (planB) planB.hidden = false;
    if (iso) iso.hidden = false;
    if (typeof layoutBlocks === 'function') layoutBlocks();
    drawingScale = 10;
  }

  // Switch the palette to the appropriate set for this mode.
  if (typeof populateTilePalette === 'function') populateTilePalette();
  if (typeof renderSheetBrowser === 'function') renderSheetBrowser();
  if (typeof updateStatus === 'function') updateStatus();
  if (typeof v25UpdateOptionsBar === 'function') v25UpdateOptionsBar();
  // When leaving 2D mode, clear v25 selection so the inspector reverts.
  if (sheetMode !== '2d') {
    v25Selected = [];
    const root = document.getElementById('inspectorRoot');
    if (root && root.querySelector('.ins-section')) root.innerHTML = '';
  }
  requestRender();
  if (!silent && sheetMode === '2d' && typeof toast === 'function') toast('2D detailing mode');
}

// Public toggle — flips the active sheet between 3D and 2D modes.
function toggleSheetMode() {
  applySheetMode(sheetMode === '3d' ? '2d' : '3d');
}

