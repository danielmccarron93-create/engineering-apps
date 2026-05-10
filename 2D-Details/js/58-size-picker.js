'use strict';

// V21 size-picker dropdown
// Extracted from dev/index.html lines 14640-14842 (2026-05-02 modular split)

// V21 SIZE-PICKER DROPDOWN
// ============================================================
// Opens a grouped, searchable dropdown of section sizes anchored next to a
// tile's chevron. For UB / UC, entries are grouped by depth series (610
// series, 530 series, …). For SHS / bolts, flat list.

let _pickerEl = null;
let _pickerState = null; // { kind, tileId, items, focus }

// Group a flat list of section names by their leading depth prefix.
// "610UB 125" → series "610 Series". Works across UB/UC spellings.
function _groupBySeries(names) {
  const groups = {};
  for (const n of names) {
    const m = n.match(/^(\d{2,4})/);
    const key = m ? `${m[1]} Series` : 'Other';
    if (!groups[key]) groups[key] = [];
    groups[key].push(n);
  }
  // Preserve descending depth order
  return Object.entries(groups).sort((a, b) => {
    const ax = parseInt(a[0]) || 0, bx = parseInt(b[0]) || 0;
    return bx - ax;
  });
}

function _pickerItemsFor(kind) {
  if (kind === 'ub') {
    const names = Object.keys(UB_DB).filter(n => n.includes('UB'));
    return { grouped: true, groups: _groupBySeries(names), flat: names };
  }
  if (kind === 'uc') {
    const names = Object.keys(UC_DB || {});
    return { grouped: true, groups: _groupBySeries(names), flat: names };
  }
  if (kind === 'shs') {
    return { grouped: false, flat: Object.keys(SHS_DB) };
  }
  if (kind === 'bolt') {
    return { grouped: false, flat: Object.keys(BOLT_DB) };
  }
  // V22.1 new section kinds
  if (kind === 'pfc') {
    const names = Object.keys(PFC_DB || {});
    return { grouped: true, groups: _groupBySeries(names), flat: names };
  }
  if (kind === 'rhs') {
    return { grouped: false, flat: Object.keys(RHS_DB || {}) };
  }
  if (kind === 'chs') {
    return { grouped: false, flat: Object.keys(CHS_DB || {}) };
  }
  if (kind === 'ea') {
    return { grouped: false, flat: Object.keys(EA_DB || {}) };
  }
  if (kind === 'ua') {
    return { grouped: false, flat: Object.keys(UA_DB || {}) };
  }
  return { grouped: false, flat: [] };
}

function openSizePicker(kind, tileId, anchorOrOpts) {
  closeSizePicker();
  const items = _pickerItemsFor(kind);
  const pickerEl = document.createElement('div');
  pickerEl.className = 'picker open';
  pickerEl.innerHTML = `
    <input class="picker__search" placeholder="Search ${kind.toUpperCase()} size…" autocomplete="off">
    <div class="picker__list"></div>
  `;
  document.body.appendChild(pickerEl);

  // Position: accept a DOM anchor element, or an options object
  // { centered: true } / { left, top } / { anchor: el, onChoose: fn, title }
  const opts = (anchorOrOpts && anchorOrOpts.nodeType === 1)
    ? { anchor: anchorOrOpts }
    : (anchorOrOpts || {});
  if (opts.title) {
    const hdr = document.createElement('div');
    hdr.className = 'picker__series';
    hdr.style.cssText = 'padding:8px 12px 6px;font-size:11px';
    hdr.textContent = opts.title;
    pickerEl.insertBefore(hdr, pickerEl.firstChild);
  }
  if (opts.centered) {
    pickerEl.style.left = '50%';
    pickerEl.style.top = '50%';
    pickerEl.style.transform = 'translate(-50%, -50%)';
  } else if (opts.left != null && opts.top != null) {
    pickerEl.style.left = opts.left + 'px';
    pickerEl.style.top = opts.top + 'px';
  } else {
    const anchor = opts.anchor;
    if (anchor && anchor.getBoundingClientRect) {
      const rect = anchor.getBoundingClientRect();
      pickerEl.style.left = (rect.right + 4) + 'px';
      pickerEl.style.top = rect.top + 'px';
    } else {
      pickerEl.style.left = '50%';
      pickerEl.style.top = '50%';
      pickerEl.style.transform = 'translate(-50%, -50%)';
    }
  }
  _pickerEl = pickerEl;
  _pickerState = { kind, tileId, items, focus: 0, filter: '', onChoose: opts.onChoose };
  _renderPickerList('');

  const input = pickerEl.querySelector('.picker__search');
  input.focus();
  input.addEventListener('input', () => {
    _pickerState.filter = input.value;
    _pickerState.focus = 0;
    _renderPickerList(input.value);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSizePicker();
    else if (e.key === 'ArrowDown') { e.preventDefault(); _pickerState.focus++; _renderPickerList(_pickerState.filter); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); _pickerState.focus = Math.max(0, _pickerState.focus - 1); _renderPickerList(_pickerState.filter); }
    else if (e.key === 'Enter')     { e.preventDefault(); _pickerCommitFocus(); }
  });

  // Close on outside click
  setTimeout(() => document.addEventListener('click', _pickerOutsideClick, true), 0);
}

function _pickerOutsideClick(e) {
  if (_pickerEl && !_pickerEl.contains(e.target)) closeSizePicker();
}
function closeSizePicker() {
  if (_pickerEl) { _pickerEl.remove(); _pickerEl = null; }
  _pickerState = null;
  document.removeEventListener('click', _pickerOutsideClick, true);
}

function _pickerMatches(names, filter) {
  if (!filter) return names;
  const q = filter.toLowerCase();
  return names.filter(n => n.toLowerCase().includes(q));
}

function _renderPickerList(filter) {
  const list = _pickerEl.querySelector('.picker__list');
  list.innerHTML = '';
  const s = _pickerState;
  const last = lastUsedSection[s.kind];
  const rows = [];

  const addRow = (name) => {
    const r = document.createElement('div');
    r.className = 'picker__item';
    r.dataset.name = name;
    r.innerHTML = `<span>${name}</span>` + (name === last ? '<span class="star">★</span>' : '');
    r.addEventListener('click', () => _pickerChoose(name));
    rows.push(r);
    return r;
  };

  if (s.items.grouped) {
    for (const [seriesLabel, names] of s.items.groups) {
      const filtered = _pickerMatches(names, filter);
      if (!filtered.length) continue;
      const h = document.createElement('div');
      h.className = 'picker__series';
      h.textContent = seriesLabel;
      list.appendChild(h);
      for (const n of filtered) list.appendChild(addRow(n));
    }
  } else {
    for (const n of _pickerMatches(s.items.flat, filter)) list.appendChild(addRow(n));
  }

  s.focus = Math.min(s.focus, Math.max(0, rows.length - 1));
  rows.forEach((r, i) => r.classList.toggle('focus', i === s.focus));
  // Ensure focused row is visible
  const focused = rows[s.focus];
  if (focused) focused.scrollIntoView({ block: 'nearest' });
  s._rows = rows;
}

function _pickerCommitFocus() {
  if (!_pickerState) return;
  const rows = _pickerState._rows || [];
  const r = rows[_pickerState.focus];
  if (r) _pickerChoose(r.dataset.name);
}

function _pickerChoose(name) {
  if (!_pickerState) return;
  const kind = _pickerState.kind;
  const onChoose = _pickerState.onChoose;
  lastUsedSection[kind] = name;
  closeSizePicker();
  if (typeof onChoose === 'function') {
    onChoose(name, kind);
  } else if (kind === 'bolt') {
    selectMemberByBolt(name);
  } else {
    selectMemberBySection(kind, name);
  }
  // Re-render so the tile label updates to the newly-selected size
  if (typeof populateTilePalette === 'function') populateTilePalette();
}

