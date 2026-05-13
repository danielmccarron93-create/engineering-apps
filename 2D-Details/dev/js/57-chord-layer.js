'use strict';

// V21 keyboard chord layer (M / D / A / H / B / K / W)
// Extracted from dev/index.html lines 14515-14638 (2026-05-02 modular split)

// V21 KEYBOARD CHORD LAYER
// ============================================================
// Two-step shortcuts: press M (or D / A) to enter a chord; 350ms later the
// overlay appears; press the second key to jump to a tool. Esc cancels.

const CHORD_BINDINGS = {
  M: {
    label: 'Model',
    items: [
      { key: 'U', label: 'Universal beam (UB)',    run: () => selectMemberBySection('ub', lastUsedSection.ub || '360UB 50.7') },
      { key: 'C', label: 'Universal column (UC)',  run: () => selectMemberBySection('uc', lastUsedSection.uc || '250UC 72.9') },
      { key: 'S', label: 'SHS',                    run: () => selectMemberBySection('shs', lastUsedSection.shs || '150x6') },
      { key: 'B', label: 'Bolt',                   run: () => selectMemberByBolt(lastUsedSection.bolt || 'M20') },
      { key: 'G', label: 'Bolt group',             run: () => document.getElementById('boltGroupDialog').classList.add('visible') },
      { key: 'P', label: 'PFC',                    run: () => selectMemberBySection('pfc', lastUsedSection.pfc || '200PFC 22.9') },
      { key: 'L', label: 'Plate (polygon)',        run: () => { setTool('draw-plate'); populateTilePalette(); } },
      { key: 'K', label: 'Cap plate connection',   run: () => openConnectionDialog('capPlate') },
    ],
  },
  D: {
    label: 'Draw',
    items: [
      { key: 'L', label: 'Line',       run: () => setTool('line') },
      { key: 'R', label: 'Rectangle',  run: () => setTool('rect') },
      { key: 'C', label: 'Circle',     run: () => setTool('circle') },
      { key: 'P', label: 'Polyline',   run: () => setTool('polyline') },
      { key: 'T', label: 'Text',       run: () => setTool('text') },
      { key: 'B', label: 'Break line', run: () => setTool('draw-breakline') },
    ],
  },
  A: {
    label: 'Annotate',
    items: [
      { key: 'H', label: 'Dim horizontal',    run: () => setTool('dimension') },
      { key: 'V', label: 'Dim vertical',      run: () => setTool('dimension') },
      { key: 'C', label: 'Dim chain',         run: () => setTool('dimension') },
      { key: 'S', label: 'Section mark',      run: () => setTool('draw-sectionmark') },
      { key: 'W', label: 'Weld symbol',       run: () => { tool = 'draw-weld'; weldStep = 0; weldP1 = null; clickPts = []; polyPts = []; placing = null; drawMember = null; if (canvas) canvas.style.cursor = 'crosshair'; updateStatus(); highlightActiveTile(); } },
      { key: 'T', label: 'Member tag',        run: () => setTool('place-member-tag') },
      { key: 'R', label: 'Revision triangle', run: () => setTool('place-rev-triangle') },
    ],
  },
};

let _chordActive = null;     // current chord key ('M' / 'D' / 'A')
let _chordOverlayEl = null;
let _chordTimer = null;

function _chordOpen(key) {
  const cfg = CHORD_BINDINGS[key];
  if (!cfg) return;
  _chordClose();
  _chordActive = key;
  const el = document.createElement('div');
  el.className = 'chord-overlay open';
  el.innerHTML = `<h3>${key} — ${cfg.label}</h3>` +
    cfg.items.map(i => `
      <div class="chord-row${i.soon ? ' soon' : ''}">
        <kbd>${i.key}</kbd>
        <span>${i.label}</span>
      </div>`).join('') +
    `<div class="chord-hint">Press a key, or <kbd>Esc</kbd> to cancel.</div>`;
  document.body.appendChild(el);
  _chordOverlayEl = el;
}

function _chordClose() {
  _chordActive = null;
  if (_chordOverlayEl) { _chordOverlayEl.remove(); _chordOverlayEl = null; }
  if (_chordTimer) { clearTimeout(_chordTimer); _chordTimer = null; }
}

function _chordHandleSecondKey(key) {
  if (!_chordActive) return;
  const cfg = CHORD_BINDINGS[_chordActive];
  const item = cfg.items.find(i => i.key.toUpperCase() === key.toUpperCase());
  _chordClose();
  if (item && item.run) item.run();
}

// Hook into the global keydown handler. The handler runs BEFORE the normal
// single-key shortcut path — pressing M triggers a chord, but if the user
// releases / cancels, single-key M (mirror tool) still works via the chord
// fallback logic.
function _chordOnKeydown(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toUpperCase();
  if (_chordActive) {
    if (k === 'ESCAPE' || e.key === 'Escape') { _chordClose(); e.preventDefault(); return; }
    _chordHandleSecondKey(k);
    e.preventDefault();
    return;
  }
  if (CHORD_BINDINGS[k]) {
    // Schedule overlay open after 350ms — a quick single-key tap cancels.
    const key = k;
    if (_chordTimer) clearTimeout(_chordTimer);
    _chordTimer = setTimeout(() => _chordOpen(key), 350);
    // Capture next key immediately too — allows flying through the chord.
    const once = (ev2) => {
      if (ev2.target.tagName === 'INPUT' || ev2.target.tagName === 'SELECT' || ev2.target.tagName === 'TEXTAREA') {
        document.removeEventListener('keydown', once, true);
        return;
      }
      if (_chordTimer) { clearTimeout(_chordTimer); _chordTimer = null; }
      document.removeEventListener('keydown', once, true);
      if (ev2.key === 'Escape') { _chordClose(); ev2.preventDefault(); return; }
      const ck = ev2.key.toUpperCase();
      if (CHORD_BINDINGS[key].items.some(i => i.key === ck)) {
        _chordActive = key;
        _chordHandleSecondKey(ck);
        ev2.preventDefault();
        ev2.stopPropagation();
      }
    };
    document.addEventListener('keydown', once, true);
  }
}

// Install the chord handler — runs at capture so it gets keys before the
// regular V20 initKeyboard handler.
document.addEventListener('keydown', _chordOnKeydown, true);

