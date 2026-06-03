'use strict';

// V20 command palette (Ctrl+K)
// Extracted from dev/index.html lines 14105-14241 (2026-05-02 modular split)

// COMMAND PALETTE (V20)
// ============================================================
// Ctrl+K → palette → fuzzy-matched list of every tool, library item, and
// export action. Typing narrows the list; Enter runs the top match; Up/Down
// navigate; Esc closes.
const _palCommands = [
  { label: 'Select tool',                cat: 'Tool',        run: () => setTool('select') },
  { label: 'Line',                       cat: 'Tool',        run: () => setTool('line') },
  { label: 'Rectangle',                  cat: 'Tool',        run: () => setTool('rect') },
  { label: 'Circle',                     cat: 'Tool',        run: () => setTool('circle') },
  { label: 'Polyline',                   cat: 'Tool',        run: () => setTool('polyline') },
  { label: 'Dimension',                  cat: 'Tool',        run: () => setTool('dimension') },
  { label: 'Text',                       cat: 'Tool',        run: () => setTool('text') },
  { label: 'Mirror selection',           cat: 'Tool',        run: () => setTool('mirror') },
  { label: 'Centreline',                 cat: 'Annotate',    run: () => setTool('draw-centreline') },
  { label: 'Break line',                 cat: 'Annotate',    run: () => setTool('draw-breakline') },
  { label: 'Weld symbol',                cat: 'Annotate',    run: () => { tool = 'draw-weld'; weldStep = 0; weldP1 = null; clickPts = []; polyPts = []; placing = null; drawMember = null; canvas.style.cursor = 'crosshair'; updateStatus(); } },
  { label: 'Slotted hole',               cat: 'Annotate',    run: () => setTool('draw-slot') },
  { label: 'Section mark (A-A, B-B)',    cat: 'Annotate',    run: () => setTool('draw-sectionmark') },
  { label: 'Member tag',                 cat: 'Annotate',    run: () => setTool('place-member-tag') },
  { label: 'Bolt callout',               cat: 'Annotate',    run: () => setTool('place-bolt-callout') },
  { label: 'Material tag',               cat: 'Annotate',    run: () => setTool('place-material-tag') },
  { label: 'Revision triangle',          cat: 'Annotate',    run: () => setTool('place-rev-triangle') },
  { label: 'Revision cloud',             cat: 'Annotate',    run: () => { polyPts = []; setTool('draw-rev-cloud'); } },
  { label: 'Detail reference callout',   cat: 'Annotate',    run: () => setTool('place-detail-ref') },
  { label: 'Detail card',                cat: 'Annotate',    run: () => setTool('draw-detail-card') },
  { label: 'Cap plate connection',       cat: 'Connection',  run: () => openConnectionDialog('capPlate') },
  { label: 'Baseplate connection',       cat: 'Connection',  run: () => openConnectionDialog('baseplate') },
  { label: 'Web side plate (WSP)',       cat: 'Connection',  run: () => openConnectionDialog('wsp') },
  { label: 'Moment splice',              cat: 'Connection',  run: () => openConnectionDialog('splice') },
  { label: 'Fit sheet to view',          cat: 'View',        run: () => fitToView() },
  // V25 — command-palette toggles also sync the visible #sbX top-bar tools.
  { label: 'Toggle grid',                cat: 'View',        run: () => { gridOn  = !gridOn;  document.getElementById('btnGrid' ).classList.toggle('active', gridOn ); document.getElementById('sbGrid' )?.classList.toggle('active', gridOn ); requestRender(); } },
  { label: 'Toggle snap',                cat: 'View',        run: () => { snapOn  = !snapOn;  document.getElementById('btnSnap' ).classList.toggle('active', snapOn ); document.getElementById('sbSnap' )?.classList.toggle('active', snapOn ); requestRender(); } },
  { label: 'Toggle ortho',               cat: 'View',        run: () => { orthoOn = !orthoOn; document.getElementById('btnOrtho').classList.toggle('active', orthoOn); document.getElementById('sbOrtho')?.classList.toggle('active', orthoOn); requestRender(); } },
  { label: 'Toggle sketch wobble',       cat: 'View',        run: () => { sketchOn = !sketchOn; requestRender(); } },
  { label: 'Toggle paper grain',         cat: 'View',        run: () => { sketchGrain = !sketchGrain; requestRender(); } },
  { label: 'Toggle layer panel',         cat: 'View',        run: () => toggleLayerPanel() },
  // V25 — explicit theme entries. Top-bar button only toggles Light/Dark;
  // these palette entries reach all 5 themes (warm pair + V21 legacy).
  // Routed via window.applyTheme since it's defined inside DOMContentLoaded.
  { label: 'Theme: Warm Light',          cat: 'Appearance',  run: () => window.applyTheme && window.applyTheme('theme-warm-light') },
  { label: 'Theme: Warm Dark',           cat: 'Appearance',  run: () => window.applyTheme && window.applyTheme('theme-warm-dark') },
  { label: 'Theme: Classic (V21)',       cat: 'Appearance',  run: () => window.applyTheme && window.applyTheme('theme-classic') },
  { label: 'Theme: Dark (V21)',          cat: 'Appearance',  run: () => window.applyTheme && window.applyTheme('theme-dark') },
  { label: 'Theme: BT Brand (V20)',      cat: 'Appearance',  run: () => window.applyTheme && window.applyTheme('theme-bt') },
  { label: 'Keyboard shortcuts (help)',  cat: 'Help',        run: () => toggleKbdHelp() },
  { label: 'Edit title block',           cat: 'Sheet',       run: () => document.getElementById('btnTitleBlock').click() },
  { label: 'Add new sheet',              cat: 'Project',     run: () => { const n = prompt('New sheet name:', `Sheet ${project.sheets.length + 1}`); if (n) projectAddSheet(n); } },
  { label: 'Export current sheet to PDF',cat: 'Export',      run: () => exportSheetToPDF() },
  { label: 'Export all sheets to PDF',   cat: 'Export',      run: () => exportProjectToPDF() },
  { label: 'Export current sheet to DXF',cat: 'Export',      run: () => exportSheetToDXF() },
  { label: 'Save project',               cat: 'Project',     run: () => exportProject() },
  { label: 'Load project',               cat: 'Project',     run: () => importProject() },
  { label: 'Undo',                       cat: 'Edit',        run: () => undo() },
  { label: 'Redo',                       cat: 'Edit',        run: () => redo() },
  { label: 'Check spelling…',            cat: 'Edit',        run: () => { if (typeof spellSweep === 'function') spellSweep(); } },
];

let _palFocusIdx = 0;
let _palVisible = false;

// Simple substring-score fuzzy match — good enough for a fixed-size command set.
function _palScore(label, query) {
  if (!query) return 1;
  const a = label.toLowerCase(), q = query.toLowerCase();
  if (a.startsWith(q)) return 10;
  if (a.includes(q)) return 5;
  // Subsequence match — chars in order but not adjacent
  let qi = 0;
  for (let i = 0; i < a.length && qi < q.length; i++) if (a[i] === q[qi]) qi++;
  return qi === q.length ? 2 : 0;
}

function _palRender(query) {
  const host = document.getElementById('cmdPaletteList');
  if (!host) return [];
  const scored = _palCommands
    .map(c => ({ cmd: c, s: _palScore(c.label, query) }))
    .filter(r => r.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 40);
  host.innerHTML = '';
  _palFocusIdx = Math.min(_palFocusIdx, Math.max(0, scored.length - 1));
  scored.forEach((r, i) => {
    const row = document.createElement('div');
    row.className = 'cmd-row' + (i === _palFocusIdx ? ' focus' : '');
    row.innerHTML = `<div class="cmd-label">${r.cmd.label}</div><div class="cmd-cat">${r.cmd.cat}</div>`;
    row.addEventListener('click', () => { _palClose(); r.cmd.run(); });
    row.addEventListener('mousemove', () => {
      _palFocusIdx = i;
      host.querySelectorAll('.cmd-row').forEach((el, j) => el.classList.toggle('focus', j === i));
    });
    host.appendChild(row);
  });
  return scored;
}

function _palOpen() {
  _palVisible = true;
  _palFocusIdx = 0;
  const root = document.getElementById('cmdPalette');
  root.style.display = 'flex';
  const input = document.getElementById('cmdPaletteInput');
  input.value = '';
  _palRender('');
  input.focus();
}

function _palClose() {
  _palVisible = false;
  const root = document.getElementById('cmdPalette');
  if (root) root.style.display = 'none';
}

function initCmdPalette() {
  const input = document.getElementById('cmdPaletteInput');
  if (!input) return;
  input.addEventListener('input', () => {
    _palFocusIdx = 0;
    _palRender(input.value);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { _palClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); _palFocusIdx++; _palRender(input.value); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); _palFocusIdx = Math.max(0, _palFocusIdx - 1); _palRender(input.value); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const scored = _palRender(input.value);
      if (scored[_palFocusIdx]) { _palClose(); scored[_palFocusIdx].cmd.run(); }
    }
  });
  // Click outside the panel closes it
  document.getElementById('cmdPalette').addEventListener('click', (e) => {
    if (e.target.id === 'cmdPalette') _palClose();
  });
}

