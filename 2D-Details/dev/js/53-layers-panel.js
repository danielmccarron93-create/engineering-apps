'use strict';

// V20 layer visibility UI
// Extracted from dev/index.html lines 14243-14306 (2026-05-02 modular split)

// LAYER VISIBILITY UI (V20)
// ============================================================
// Per-view visibility toggles. Backed by a new `layerVisibility` object keyed
// by entity type (line, dim, centreline, weld, slot, memberTag, …). Render
// checks this object and skips hidden entity types. The panel also toggles
// the 3D object categories (UB/SHS/bolt/plate) via per-type hidden flags.
let layerVisibility = {
  // 3D object categories
  ub: true, shs: true, bolt: true, plate: true,
  // 2D entity types
  line: true, rect: true, circle: true, text: true, dim: true,
  centreline: true, breakline: true, weld: true, slot: true,
  memberTag: true, boltCallout: true, sectionMark: true, materialTag: true,
  revisionTriangle: true, revisionCloud: true, detailRef: true, detailCard: true,
};

const _layerGroups = [
  { label: 'Members',     keys: ['ub', 'shs'] },
  { label: 'Plates',      keys: ['plate'] },
  { label: 'Bolts',       keys: ['bolt'] },
  { label: 'Welds',       keys: ['weld'] },
  { label: 'Dimensions',  keys: ['dim'] },
  { label: 'Text + Tags', keys: ['text', 'memberTag', 'materialTag', 'boltCallout'] },
  { label: 'Centrelines', keys: ['centreline'] },
  { label: 'Section marks', keys: ['sectionMark'] },
  { label: 'Revisions',   keys: ['revisionTriangle', 'revisionCloud'] },
  { label: 'Construction',keys: ['line', 'rect', 'circle', 'slot', 'breakline', 'detailRef', 'detailCard'] },
];

function _layerGroupOn(grp) { return grp.keys.every(k => layerVisibility[k]); }
function _layerGroupSet(grp, v) { grp.keys.forEach(k => { layerVisibility[k] = v; }); }

function renderLayerPanel() {
  const host = document.getElementById('layerPanelList');
  if (!host) return;
  host.innerHTML = '';
  _layerGroups.forEach(grp => {
    const row = document.createElement('div');
    row.className = 'layer-row';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = _layerGroupOn(grp);
    cb.id = 'lyr_' + grp.label.replace(/\s+/g, '_');
    cb.addEventListener('change', () => {
      _layerGroupSet(grp, cb.checked);
      requestRender();
    });
    const lab = document.createElement('label');
    lab.htmlFor = cb.id;
    lab.textContent = grp.label;
    row.appendChild(cb);
    row.appendChild(lab);
    host.appendChild(row);
  });
}

function toggleLayerPanel() {
  const panel = document.getElementById('layerPanel');
  if (!panel) return;
  const open = panel.style.display !== 'none';
  if (open) panel.style.display = 'none';
  else { panel.style.display = 'block'; renderLayerPanel(); }
}

