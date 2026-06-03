'use strict';

// LAYER: 80–89 reserved (future shared modules). Spell-check UI (DOM).
//   READS  (globals): spell* engine (js/80), nbEditor/_nbPositionEditor (js/98),
//                     entities2D, blocks, activeBlock, viewport, W, H, canvas,
//                     real2px, v25EntBounds, v25Selected, requestRender,
//                     v25UpdateInspector, nbClearLayoutCache — all typeof-guarded.
//   WRITES (globals): window.nbSpell (overlay state), nbSpellAttach, nbSpellSync,
//                     nbSpellInput, nbSpellDetach, spellSweep.
//
// The Bluebeam/Revit-grade UI on top of the js/80 engine:
//   • LIVE squiggle — a backdrop <div> mirrored exactly behind the noteBox
//     editor <textarea> (#nbEditorTA), drawing a red wavy underline under each
//     misspelled word as you type (debounced).
//   • RIGHT-CLICK fix — right-clicking a flagged word opens a menu of
//     suggestions + Ignore + Add-to-dictionary + Add-to-engineering-dictionary;
//     a correct word still gets the native menu (copy/paste).
//   • DOCUMENT sweep — spellSweep() walks every text entity on the sheet and
//     lists the misspellings in a results panel with Go-to / Replace / Ignore /
//     Add per hit (Revit's "Check Spelling").
//
// Everything is additive + guarded — the noteBox CONTRACT is untouched; if this
// file or js/80 is missing, the editor simply has no squiggles.
// Design: PlannedBuilds/notebox-spellcheck/02-design.md.

// 2D text-bearing entity field map (from the js/71/34/68 recon).
const _SP_FIELDS = {
  noteBox: ['text'], txtBox: ['txt'], text: ['text'], note: ['text'],
  mtext: ['text'], leader2: ['txt'], memberTag: ['text'], materialTag: ['text'],
  gridLine: ['label'], sectionMark: ['label'], detailCard: ['title'],
  reoBar: ['mark'], anchor: ['txt'],
};

const _SP_DEBOUNCE_MS = 220;

// ------------------------------------------------------------------
// Small helpers
// ------------------------------------------------------------------
function _spEsc(s) {
  return ('' + (s == null ? '' : s))
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Engine availability guard — true only when js/80 + the toggle say go.
function _spActive() {
  return typeof spellScan === 'function' &&
         typeof spellIsEnabled === 'function' && spellIsEnabled();
}

// The display form of a field (upper-cased when the note is upper-case), used
// for both the skip rules and so squiggle indices line up under the glyphs. The
// upper-case is applied only when it preserves length, so the returned indices
// stay valid against the raw string the backdrop spans + replace use; the rare
// length-changing case (ß, ligatures — absent from AS notes) keeps the raw form.
function _spDisplay(raw, ent) {
  raw = '' + (raw == null ? '' : raw);
  if (ent && ent.textCase && ent.textCase !== 'normal') {
    const up = raw.toUpperCase();
    if (up.length === raw.length) return { display: up };
  }
  return { display: raw };
}

// ==================================================================
// LIVE EDITOR OVERLAY (Bluebeam-style squiggle)
// ==================================================================
// window.nbSpell holds the live overlay state, mirroring window.nbEditor.

function nbSpellAttach(el, ent) {
  if (!el || !ent) return;
  if (!_spActive()) return;                       // disabled → no overlay at all
  nbSpellDetach();                                // clear any prior

  const host = el.parentNode || document.body;
  const backdrop = document.createElement('div');
  backdrop.className = 'sp-backdrop';
  backdrop.setAttribute('aria-hidden', 'true');
  // Insert BEHIND the textarea so the red wave shows through its (transparent)
  // background, beneath the live text the textarea itself paints.
  host.insertBefore(backdrop, el);

  // Make the textarea see-through so the backdrop squiggle is visible; keep a
  // record so detach restores the editor exactly.
  const prevBg = el.style.background;
  el.style.background = 'transparent';

  window.nbSpell = { el: el, ent: ent, backdrop: backdrop, prevBg: prevBg, timer: 0 };

  el.addEventListener('contextmenu', _spOnContextMenu, false);

  _spMirrorAll();
  _spMirrorGeom();
  _spRebuild();

  // Load the dictionary lazily; re-check the moment it arrives (until then
  // nothing is flagged, so the editor is never blocked).
  if (typeof spellEnsureLoaded === 'function') {
    spellEnsureLoaded().then(function () { _spRebuild(); }).catch(function () { /* */ });
  }
}

// Cheap per-frame geometry mirror (called from _nbPositionEditor's rAF tick).
function nbSpellSync() {
  const st = window.nbSpell;
  if (!st || !st.backdrop || !st.el) return;
  _spMirrorGeom();
}

// Debounced re-check on input (called from the editor's oninput).
function nbSpellInput() {
  const st = window.nbSpell;
  if (!st) return;
  _spMirrorGeom();
  if (st.timer) clearTimeout(st.timer);
  st.timer = setTimeout(function () { st.timer = 0; _spMirrorAll(); _spRebuild(); }, _SP_DEBOUNCE_MS);
}

function nbSpellDetach() {
  _spCloseMenu();
  const st = window.nbSpell;
  if (!st) return;
  if (st.timer) { clearTimeout(st.timer); st.timer = 0; }
  if (st.el) {
    st.el.removeEventListener('contextmenu', _spOnContextMenu, false);
    st.el.style.background = st.prevBg || '';
  }
  if (st.backdrop && st.backdrop.parentNode) st.backdrop.parentNode.removeChild(st.backdrop);
  window.nbSpell = null;
}

// Copy the wrap-affecting + font styles from the textarea (computed) so the
// backdrop lays text out identically. Called on attach + each debounced input.
function _spMirrorAll() {
  const st = window.nbSpell;
  if (!st || !st.el || !st.backdrop) return;
  let cs = null;
  try { cs = getComputedStyle(st.el); } catch (_e) { cs = null; }
  if (!cs) return;
  const b = st.backdrop.style;
  b.fontFamily = cs.fontFamily;
  b.fontWeight = cs.fontWeight;
  b.fontStyle = cs.fontStyle;
  b.letterSpacing = cs.letterSpacing;
  b.textTransform = cs.textTransform;     // mirror upper-casing so glyphs align
  b.whiteSpace = cs.whiteSpace || 'pre-wrap';
  b.wordBreak = cs.wordBreak || 'normal';
  b.overflowWrap = cs.overflowWrap || 'break-word';
  b.boxSizing = cs.boxSizing || 'border-box';
  b.borderTopWidth = cs.borderTopWidth;
  b.borderRightWidth = cs.borderRightWidth;
  b.borderBottomWidth = cs.borderBottomWidth;
  b.borderLeftWidth = cs.borderLeftWidth;
  b.borderStyle = 'solid';
  b.borderColor = 'transparent';
}

// Cheap geometry mirror — these are set explicitly on el.style by
// _nbPositionEditor every frame, so read them straight back (no reflow).
function _spMirrorGeom() {
  const st = window.nbSpell;
  if (!st || !st.el || !st.backdrop) return;
  const s = st.el.style, b = st.backdrop.style;
  b.left = s.left; b.top = s.top;
  b.width = s.width; b.height = s.height;
  b.padding = s.padding;
  b.fontSize = s.fontSize;
  b.lineHeight = s.lineHeight;
  // Font face + transform are also set per-frame by _nbPositionEditor on
  // el.style, so copy them here too — otherwise the squiggle is laid out in the
  // wrong face/case until the first keystroke (e.g. double-click an UPPER-case
  // note and right-click-fix without typing). Reading el.style is reflow-free.
  b.fontFamily = s.fontFamily;
  b.fontWeight = s.fontWeight;
  b.fontStyle = s.fontStyle;
  b.textTransform = s.textTransform;
  st.backdrop.scrollTop = st.el.scrollTop;
  st.backdrop.scrollLeft = st.el.scrollLeft;
}

// Re-scan the current text and rebuild the flagged-word spans.
function _spRebuild() {
  const st = window.nbSpell;
  if (!st || !st.backdrop || !st.el) return;
  if (!_spActive()) { st.backdrop.innerHTML = ''; return; }
  const raw = st.el.value || '';
  const disp = _spDisplay(raw, st.ent);
  let bad = [];
  try { bad = (spellScan(disp.display).bad) || []; } catch (_e) { bad = []; }
  st.backdrop.innerHTML = _spSpansHTML(raw, bad);
}

// Build the backdrop innerHTML: transparent text + <span class="sp-bad"> around
// each flagged word (so only the red wavy underline shows).
function _spSpansHTML(raw, bad) {
  let html = '', idx = 0;
  for (let i = 0; i < bad.length; i++) {
    const t = bad[i];
    if (t.start < idx || t.end > raw.length) continue;   // safety
    html += _spEsc(raw.slice(idx, t.start));
    html += '<span class="sp-bad" data-s="' + t.start + '" data-e="' + t.end + '">' +
            _spEsc(raw.slice(t.start, t.end)) + '</span>';
    idx = t.end;
  }
  html += _spEsc(raw.slice(idx));
  // A trailing newline needs a filler so pre-wrap keeps the final empty line.
  if (raw.charAt(raw.length - 1) === '\n') html += '​';
  return html;
}

// ==================================================================
// RIGHT-CLICK FIX MENU
// ==================================================================
let _spMenuEl = null;

function _spOnContextMenu(e) {
  const st = window.nbSpell;
  if (!st || !st.backdrop || !_spActive()) return;   // native menu
  const spans = st.backdrop.querySelectorAll('span.sp-bad');
  for (let i = 0; i < spans.length; i++) {
    const rects = spans[i].getClientRects();
    for (let r = 0; r < rects.length; r++) {
      const rc = rects[r];
      if (e.clientX >= rc.left && e.clientX <= rc.right && e.clientY >= rc.top && e.clientY <= rc.bottom) {
        const s = +spans[i].getAttribute('data-s');
        const en = +spans[i].getAttribute('data-e');
        e.preventDefault();
        _spOpenMenu(st, s, en, e.clientX, e.clientY);
        return;
      }
    }
  }
  // Not on a flagged word → let the browser's native menu through.
}

function _spOpenMenu(st, start, end, x, y) {
  _spCloseMenu();
  const raw = st.el.value || '';
  const rawWord = raw.slice(start, end);
  const disp = _spDisplay(rawWord, st.ent);
  const word = disp.display;
  const suggestions = (typeof spellSuggest === 'function') ? spellSuggest(word, 6) : [];

  const menu = document.createElement('div');
  menu.className = 'sp-menu';
  const rows = [];
  if (suggestions.length) {
    for (let i = 0; i < suggestions.length; i++) {
      rows.push({ label: suggestions[i], strong: true, act: function (sug) { return function () { _spReplaceToken(st, start, end, sug); }; }(suggestions[i]) });
    }
    rows.push({ sep: true });
  } else {
    rows.push({ label: '(no suggestions)', disabled: true });
    rows.push({ sep: true });
  }
  rows.push({ label: 'Ignore (this session)', act: function () { if (typeof spellIgnoreWord === 'function') spellIgnoreWord(word); _spAfterDictChange(st); } });
  rows.push({ label: 'Add to dictionary', act: function () { if (typeof spellAddUserWord === 'function') spellAddUserWord(word); _spAfterDictChange(st); } });
  rows.push({ label: 'Add to engineering dictionary', act: function () { if (typeof spellAddEngWord === 'function') spellAddEngWord(word); _spAfterDictChange(st); } });

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.sep) { const d = document.createElement('div'); d.className = 'sp-menu-sep'; menu.appendChild(d); continue; }
    const it = document.createElement('div');
    it.className = 'sp-menu-item' + (row.strong ? ' sp-strong' : '') + (row.disabled ? ' sp-disabled' : '');
    it.textContent = row.label;
    if (!row.disabled && row.act) {
      it.addEventListener('mousedown', function (ev) { ev.preventDefault(); ev.stopPropagation(); row.act(); _spCloseMenu(); });
    }
    menu.appendChild(it);
  }

  document.body.appendChild(menu);
  // Clamp to viewport.
  const mw = menu.offsetWidth || 200, mh = menu.offsetHeight || 120;
  const vw = window.innerWidth, vh = window.innerHeight;
  menu.style.left = Math.max(4, Math.min(x, vw - mw - 4)) + 'px';
  menu.style.top = Math.max(4, Math.min(y, vh - mh - 4)) + 'px';
  _spMenuEl = menu;

  setTimeout(function () {
    document.addEventListener('mousedown', _spMenuOutside, true);
    document.addEventListener('keydown', _spMenuKey, true);
  }, 0);
}

function _spMenuOutside(e) {
  if (_spMenuEl && (e.target === _spMenuEl || _spMenuEl.contains(e.target))) return;
  _spCloseMenu();
}
function _spMenuKey(e) { if (e.key === 'Escape') { e.preventDefault(); _spCloseMenu(); } }

function _spCloseMenu() {
  document.removeEventListener('mousedown', _spMenuOutside, true);
  document.removeEventListener('keydown', _spMenuKey, true);
  if (_spMenuEl && _spMenuEl.parentNode) _spMenuEl.parentNode.removeChild(_spMenuEl);
  _spMenuEl = null;
}

// Replace [start,end] in the editor textarea + entity, re-using the editor's own
// input path so layout/render stay correct.
function _spReplaceToken(st, start, end, replacement) {
  const el = st.el;
  if (!el) return;
  const raw = el.value || '';
  const before = raw.slice(0, start), after = raw.slice(end);
  el.value = before + replacement + after;
  if (typeof el.oninput === 'function') { try { el.oninput(); } catch (_e) { /* */ } }
  else if (st.ent) { st.ent.text = el.value; if (typeof requestRender === 'function') requestRender(); }
  const caret = (before + replacement).length;
  try { el.focus(); el.setSelectionRange(caret, caret); } catch (_e) { /* */ }
  nbSpellInput();
}

// After Ignore / Add — recheck the live overlay so the squiggle clears.
function _spAfterDictChange(st) {
  if (st && st.el) { try { st.el.focus(); } catch (_e) { /* */ } }
  _spMirrorAll(); _spRebuild();
}

// ==================================================================
// DOCUMENT SWEEP (Revit-style "Check Spelling")
// ==================================================================
let _spSweepPanel = null;

function spellSweep(scope) {
  if (typeof spellIsEnabled === 'function' && !spellIsEnabled()) {
    _spOpenPanel([], { disabled: true });
    return;
  }
  _spOpenPanel(null, { loading: true });          // "Checking…" while the dict loads
  const run = function () { _spOpenPanel(_spCollectHits(scope || 'sheet'), {}); };
  if (typeof spellEnsureLoaded === 'function') spellEnsureLoaded().then(run).catch(run);
  else run();
}

function _spCollectHits(scope) {
  const hits = [];
  if (typeof entities2D !== 'object' || !entities2D) return hits;
  const views = Object.keys(entities2D);
  for (let vi = 0; vi < views.length; vi++) {
    const vk = views[vi];
    const arr = entities2D[vk];
    if (!Array.isArray(arr)) continue;
    for (let ei = 0; ei < arr.length; ei++) {
      const ent = arr[ei];
      if (!ent || !ent.type) continue;
      const fields = _SP_FIELDS[ent.type];
      if (!fields) continue;
      for (let fi = 0; fi < fields.length; fi++) {
        const field = fields[fi];
        const txt = ent[field];
        if (typeof txt !== 'string' || !txt.trim()) continue;
        const disp = _spDisplay(txt, ent);
        let bad = [];
        try { bad = (spellScan(disp.display).bad) || []; } catch (_e) { bad = []; }
        for (let bi = 0; bi < bad.length; bi++) {
          const t = bad[bi];
          hits.push({
            entId: ent.id, view: vk, type: ent.type, field: field,
            word: txt.slice(t.start, t.end), dword: disp.display.slice(t.start, t.end),
            start: t.start, end: t.end,
            context: _spContext(txt, t.start, t.end),
          });
        }
      }
    }
  }
  return hits;
}

function _spContext(txt, s, e) {
  const a = Math.max(0, s - 16), b = Math.min(txt.length, e + 16);
  return (a > 0 ? '…' : '') + txt.slice(a, s) + ' ' + txt.slice(s, e) + ' ' + txt.slice(e, b) + (b < txt.length ? '…' : '');
}

function _spFindEnt(view, entId) {
  const arr = (typeof entities2D === 'object' && entities2D && entities2D[view]) ? entities2D[view] : null;
  if (!arr) return null;
  for (let i = 0; i < arr.length; i++) if (arr[i] && arr[i].id === entId) return arr[i];
  return null;
}

function _spSweepGoto(hit) {
  const ent = _spFindEnt(hit.view, hit.entId);
  if (!ent) return;
  // Stale-hit guard (see _spSweepReplace): if the word is no longer at the
  // recorded offsets, the sheet/entity changed — re-scan instead of jumping.
  const _gt = '' + (ent[hit.field] || '');
  if (hit.end > _gt.length || _gt.slice(hit.start, hit.end) !== hit.word) { _spRerunSweep(); return; }
  if (typeof blocks !== 'undefined' && Array.isArray(blocks)) {
    const blk = blocks.find(function (b) { return b && b.viewKey === hit.view; });
    if (blk && typeof activeBlock !== 'undefined') activeBlock = blk;
    if (blk && typeof real2px === 'function' && typeof v25EntBounds === 'function') {
      const bn = v25EntBounds(ent);
      if (bn) {
        const cu = (bn.L + bn.R) / 2, cv = (bn.T + bn.B) / 2;
        const p = real2px(blk, cu, cv);
        const cw = (typeof W === 'number' && W) ? W : (canvas && canvas.clientWidth) || 800;
        const ch = (typeof H === 'number' && H) ? H : (canvas && canvas.clientHeight) || 600;
        if (p && typeof viewport === 'object' && viewport) {
          viewport.panX += (cw / 2 - p.x);
          viewport.panY += (ch / 2 - p.y);
        }
      }
    }
  }
  if (typeof v25Selected !== 'undefined') { try { v25Selected = [ent.id]; } catch (_e) { /* */ } }
  if (typeof v25UpdateInspector === 'function') v25UpdateInspector();
  if (typeof requestRender === 'function') requestRender();
}

function _spSweepReplace(hit, replacement) {
  const ent = _spFindEnt(hit.view, hit.entId);
  if (!ent) return;
  const txt = '' + (ent[hit.field] || '');
  // Stale-hit guard: 2D entity ids restart per sheet, so a panel left open
  // across a sheet switch could resolve a row onto a DIFFERENT entity. Only
  // splice if the recorded word is still exactly at the recorded offsets;
  // otherwise re-scan against the current sheet (never corrupt a foreign entity).
  if (hit.end > txt.length || txt.slice(hit.start, hit.end) !== hit.word) { _spRerunSweep(); return; }
  const next = txt.slice(0, hit.start) + replacement + txt.slice(hit.end);
  // If this entity is open in the live editor, route through the textarea so the
  // editor's commit-on-close can't silently revert the fix.
  if (window.nbEditor && window.nbEditor.ent === ent && window.nbEditor.el && hit.field === 'text') {
    window.nbEditor.el.value = next;
    if (typeof window.nbEditor.el.oninput === 'function') window.nbEditor.el.oninput();
  } else {
    ent[hit.field] = next;
    if (ent.type === 'noteBox' && typeof nbClearLayoutCache === 'function') nbClearLayoutCache();
  }
  if (typeof requestRender === 'function') requestRender();
  _spRerunSweep();          // indices shifted — re-scan for a fresh, correct list
}

function _spRerunSweep() { _spOpenPanel(_spCollectHits('sheet'), {}); }

// ------------------------------------------------------------------
// Sweep results panel
// ------------------------------------------------------------------
function _spCloseSweepPanel() {
  if (_spSweepPanel && _spSweepPanel.parentNode) _spSweepPanel.parentNode.removeChild(_spSweepPanel);
  _spSweepPanel = null;
}

function _spOpenPanel(hits, opts) {
  opts = opts || {};
  // Preserve the scroll position across the rebuild-on-fix (Word/Revit keep place).
  const _prevScroll = (_spSweepPanel && _spSweepPanel.querySelector('.sp-panel-body')) ? _spSweepPanel.querySelector('.sp-panel-body').scrollTop : 0;
  _spCloseSweepPanel();
  const panel = document.createElement('div');
  panel.className = 'sp-panel';

  const head = document.createElement('div');
  head.className = 'sp-panel-head';
  const title = document.createElement('div');
  title.className = 'sp-panel-title';
  if (opts.loading) title.textContent = 'Checking spelling…';
  else if (opts.disabled) title.textContent = 'Spell-check is off';
  else title.textContent = hits && hits.length ? ('Spell check — ' + hits.length + ' issue' + (hits.length === 1 ? '' : 's')) : 'Spell check';
  head.appendChild(title);
  const close = document.createElement('button');
  close.className = 'sp-panel-x'; close.textContent = '×'; close.title = 'Close';
  close.addEventListener('click', _spCloseSweepPanel);
  head.appendChild(close);
  panel.appendChild(head);

  const body = document.createElement('div');
  body.className = 'sp-panel-body';

  if (opts.loading) {
    body.innerHTML = '<div class="sp-panel-empty">Loading the en-AU dictionary…</div>';
  } else if (opts.disabled) {
    body.innerHTML = '<div class="sp-panel-empty">Turn on “Spell-check notes” in Settings to run a check.</div>';
  } else if (!hits || !hits.length) {
    body.innerHTML = '<div class="sp-panel-empty">No spelling issues found ✓</div>';
  } else {
    for (let i = 0; i < hits.length; i++) body.appendChild(_spHitRow(hits[i]));
  }
  panel.appendChild(body);

  document.body.appendChild(panel);
  _spSweepPanel = panel;
  if (_prevScroll) { const _nb = panel.querySelector('.sp-panel-body'); if (_nb) _nb.scrollTop = _prevScroll; }
}

function _spHitRow(hit) {
  const row = document.createElement('div');
  row.className = 'sp-hit';

  const top = document.createElement('div');
  top.className = 'sp-hit-top';
  const word = document.createElement('span');
  word.className = 'sp-hit-word'; word.textContent = hit.word;
  top.appendChild(word);
  const meta = document.createElement('span');
  meta.className = 'sp-hit-meta'; meta.textContent = hit.type + ' · ' + hit.view;
  top.appendChild(meta);
  row.appendChild(top);

  const ctx = document.createElement('div');
  ctx.className = 'sp-hit-ctx'; ctx.textContent = hit.context;
  row.appendChild(ctx);

  const acts = document.createElement('div');
  acts.className = 'sp-hit-acts';

  const goto = document.createElement('button');
  goto.className = 'sp-btn'; goto.textContent = 'Go to';
  goto.addEventListener('click', function () { _spSweepGoto(hit); });
  acts.appendChild(goto);

  const suggestions = (typeof spellSuggest === 'function') ? spellSuggest(hit.dword, 3) : [];
  for (let i = 0; i < suggestions.length; i++) {
    const sug = suggestions[i];
    const b = document.createElement('button');
    b.className = 'sp-btn sp-btn-fix'; b.textContent = sug;
    b.addEventListener('click', function () { _spSweepReplace(hit, sug); });
    acts.appendChild(b);
  }

  const ign = document.createElement('button');
  ign.className = 'sp-btn sp-btn-mute'; ign.textContent = 'Ignore';
  ign.addEventListener('click', function () { if (typeof spellIgnoreWord === 'function') spellIgnoreWord(hit.dword); _spRerunSweep(); });
  acts.appendChild(ign);

  const add = document.createElement('button');
  add.className = 'sp-btn sp-btn-mute'; add.textContent = 'Add';
  add.title = 'Add to engineering dictionary';
  add.addEventListener('click', function () { if (typeof spellAddEngWord === 'function') spellAddEngWord(hit.dword); _spRerunSweep(); });
  acts.appendChild(add);

  row.appendChild(acts);
  return row;
}
