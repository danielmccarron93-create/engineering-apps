'use strict';

// V25 — quick-options bar above canvas + 4 monkey patches (undo / setTool / Add / TryHandleClick)
// Extracted from dev/index.html lines 21566-21720 (2026-05-02 modular split)

// ---- QUICK OPTIONS BAR (above the canvas in 2D mode) ----
// Surfaces frequently-changed parameters for the active v25 tool so the user
// can set count/size/material BEFORE clicking. Compact, non-blocking.
function v25BuildOptionsBar() {
  let bar = document.getElementById('v25OptionsBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'v25OptionsBar';
    bar.style.cssText = 'position:absolute;top:8px;left:50%;transform:translateX(-50%);background:var(--surface-2);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:6px 10px;font:12px var(--font-sans, system-ui);display:flex;gap:10px;align-items:center;z-index:50;box-shadow:var(--shadow-pop, 0 2px 8px rgba(0,0,0,.1));max-width:90%;flex-wrap:wrap';
    const host = document.getElementById('canvas-container') || document.body;
    host.appendChild(bar);
  }
  return bar;
}

// member-size-from-top-bar (2026-06-04) — section-name list for a member type,
// mirroring the catalogue wiring so the placement bar and the selected-member
// size editor below never drift. curSec (optional) is prepended when it isn't in
// the catalogue so the dropdown can always show the member's actual section.
function v25MemberSectionNames(mt, curSec, chsGrade) {
  const dbS = mt === 'ub' ? UB_DB
            : mt === 'uc' ? (typeof UC_DB === 'object' ? UC_DB : UB_DB)
            : mt === 'wb' ? (typeof WB_DB === 'object' ? WB_DB : UB_DB)
            : mt === 'shs' ? SHS_DB
            : mt === 'rhs' ? (typeof RHS_DB === 'object' ? RHS_DB : {})
            : mt === 'chs' ? (typeof CHS_DB === 'object' ? CHS_DB : {})
            : mt === 'pfc' ? (typeof PFC_DB === 'object' ? PFC_DB : {})
            : mt === 'ea'  ? (typeof EA_DB  === 'object' ? EA_DB  : {})
            : mt === 'ua'  ? (typeof UA_DB  === 'object' ? UA_DB  : {})
            : mt === 'glt' ? (typeof GLT_SIZES === 'object' ? GLT_SIZES : {})
            : {};
  let names = Object.keys(dbS || {});
  if (mt === 'ub') names = names.filter(n => n.includes('UB'));
  if (mt === 'uc') names = (typeof UC_DB === 'object') ? Object.keys(UC_DB) : names.filter(n => n.includes('UC'));
  if (mt === 'wb') names = (typeof WB_DB === 'object') ? Object.keys(WB_DB) : names.filter(n => n.includes('WB'));
  // chs-availability (2026-06-12) — CHS lists only the Austube guide sizes for
  // the active grade (CHS_AVAIL in 02-data-sections.js); the full CHS_DB stays
  // for geometry, and a legacy curSec is prepended below as usual.
  if (mt === 'chs' && typeof chsAvailSizes === 'function') {
    const av = chsAvailSizes(chsGrade || 'C350');
    if (av.length) names = av;
  }
  if (curSec && !names.includes(curSec)) names = [curSec, ...names];
  return names;
}

// chs-availability — shared <option>/<select> fragments for the CHS Grade and
// Finish dropdowns (placement bar + selected-member bar use the same HTML).
function v25ChsGradeOptionsHTML(cur) {
  const gs = (typeof CHS_GRADES !== 'undefined') ? CHS_GRADES : [{ v: 'C350', l: 'C350L0' }, { v: 'C250', l: 'C250L0' }];
  return gs.map(g => `<option value="${g.v}"${g.v === cur ? ' selected' : ''}>${g.l}</option>`).join('');
}
function v25ChsFinishSelectHTML(id, grade, sizeKey, cur) {
  const opts = (typeof chsFinishOptions === 'function') ? chsFinishOptions(grade, sizeKey) : [];
  const inner = opts.length
    ? opts.map(o => `<option value="${o.v}"${o.v === cur ? ' selected' : ''}>${o.l}</option>`).join('')
    : `<option value="">—</option>`;
  return `<select id="${id}" style="width:150px">${inner}</select>`;
}
// Same-OD equivalent when switching grade (50 M → 50 L stays a DN50 pipe),
// else the grade's default 80NB pipe — so the armed size is always buildable.
function v25ChsMigrateSize(grade, curKey) {
  const sizes = (typeof chsAvailSizes === 'function') ? chsAvailSizes(grade) : [];
  if (!sizes.length || sizes.includes(curKey)) return curKey;
  const od = String(curKey || '').split('x')[0];
  return sizes.find(s => s.split('x')[0] === od) || (grade === 'C250' ? '88.9x4.0' : '88.9x3.2');
}

// member-size-from-top-bar (2026-06-04) — the single selected 2D member (mem2),
// or null. Lets the options bar surface a selected member's Section (size) for
// editing from the top bar as well as the Settings tab. Requires exactly one
// selection so editing one member's size is never ambiguous.
function v25SelectedSingleMem2() {
  if (typeof sheetMode === 'undefined' || sheetMode !== '2d') return null;
  if (typeof v25Selected === 'undefined' || !Array.isArray(v25Selected) || v25Selected.length !== 1) return null;
  const view = (typeof activeBlock !== 'undefined' && activeBlock && activeBlock.viewKey) || 'elevation';
  const arr = (typeof entities2D !== 'undefined' && entities2D[view]) || [];
  const ent = arr.find(e => e && e.id === v25Selected[0]);
  return (ent && ent.type === 'mem2') ? ent : null;
}

// selected-stud-bar — the single selected ChemSet anchor stud, or null. Mirrors
// v25SelectedSingleMem2 so the top options bar can surface a selected stud's
// Size / Orientation / Embedment (like the other fixings). Requires exactly one
// selection so editing is never ambiguous.
function v25SelectedSingleStud() {
  if (typeof sheetMode === 'undefined' || sheetMode !== '2d') return null;
  if (typeof v25Selected === 'undefined' || !Array.isArray(v25Selected) || v25Selected.length !== 1) return null;
  const view = (typeof activeBlock !== 'undefined' && activeBlock && activeBlock.viewKey) || 'elevation';
  const arr = (typeof entities2D !== 'undefined' && entities2D[view]) || [];
  const ent = arr.find(e => e && e.id === v25Selected[0]);
  return (ent && ent.type === 'stud') ? ent : null;
}

// selected-clt-bar — the single selected CLT panel, or null. Lets the options
// bar surface its Panel / Treatment / board + grain controls when one is
// selected, mirroring v25SelectedSingleMem2 / v25SelectedSingleStud.
function v25SelectedSingleClt() {
  if (typeof sheetMode === 'undefined' || sheetMode !== '2d') return null;
  if (typeof v25Selected === 'undefined' || !Array.isArray(v25Selected) || v25Selected.length !== 1) return null;
  const view = (typeof activeBlock !== 'undefined' && activeBlock && activeBlock.viewKey) || 'elevation';
  const arr = (typeof entities2D !== 'undefined' && entities2D[view]) || [];
  const ent = arr.find(e => e && e.id === v25Selected[0]);
  return (ent && ent.type === 'clt') ? ent : null;
}

// selected-wall-bar — the single selected blockwork SECTION strip (wallMode 'sec'),
// or null. Lets the top options bar surface its Block / End-break / grout + cross-
// hatch controls when one is selected (double-click or single-click select),
// mirroring v25SelectedSingleMem2 / v25SelectedSingleStud.
function v25SelectedSingleWallSec() {
  if (typeof sheetMode === 'undefined' || sheetMode !== '2d') return null;
  if (typeof v25Selected === 'undefined' || !Array.isArray(v25Selected) || v25Selected.length !== 1) return null;
  const view = (typeof activeBlock !== 'undefined' && activeBlock && activeBlock.viewKey) || 'elevation';
  const arr = (typeof entities2D !== 'undefined' && entities2D[view]) || [];
  const ent = arr.find(e => e && e.id === v25Selected[0]);
  return (ent && ent.type === 'blockWall' && ent.wallMode === 'sec') ? ent : null;
}

// blockwork-section-hatch — Grout-fill + Cross-hatch controls (two toggles, each
// with Spacing / Opacity / Line-width sliders). Built as an HTML fragment so the
// SAME control set serves the placement options bar (writing v25Last) and, via
// the inspector's own range/sel fields, the selected wall. `src` is the value bag
// (v25Last at placement); idp keeps ids distinct. Mirrors the GLT grain controls
// (72k). Renderer + defaults live in 68-v25-tools.js (drawBlockWallSec2D).
function v25WallHatchControlsHTML(src, idp) {
  src = src || {};
  const gd = (typeof BLOCKWALL_GROUT_DEFAULTS === 'object') ? BLOCKWALL_GROUT_DEFAULTS : { spacing: 25, opacity: 55, width: 30 };
  const xd = (typeof BLOCKWALL_XHATCH_DEFAULTS === 'object') ? BLOCKWALL_XHATCH_DEFAULTS : { spacing: 50, opacity: 22, width: 30 };
  const gOn = (src.groutFill != null) ? !!src.groutFill : (src.grouted != null ? !!src.grouted : true);
  const xOn = (src.xHatch != null) ? !!src.xHatch : true;
  const v = (k, d) => (src[k] != null ? src[k] : d);
  const fld = (label, inner) => '<label style="display:flex;align-items:center;gap:4px">' +
    '<span style="color:var(--text-mute);font-size:11px">' + label + '</span>' + inner + '</label>';
  const sl = (id, val) => '<input id="' + id + '" type="range" min="0" max="100" step="5" value="' + val +
    '" style="width:72px;vertical-align:middle"><span id="' + id + '-val" style="color:var(--text-mute);font-size:11px;min-width:30px;display:inline-block">' + val + '%</span>';
  return fld('Grout fill',  '<input id="' + idp + '-wallgrout" type="checkbox"' + (gOn ? ' checked' : '') + '/>') +
    fld('· spacing',    sl(idp + '-grout-sp', v('groutSpacing', gd.spacing))) +
    fld('· opacity',    sl(idp + '-grout-op', v('groutOpacity', gd.opacity))) +
    fld('· line width', sl(idp + '-grout-lw', v('groutWidth',   gd.width))) +
    fld('Cross-hatch',  '<input id="' + idp + '-wallxhatch" type="checkbox"' + (xOn ? ' checked' : '') + '/>') +
    fld('· spacing',    sl(idp + '-xh-sp', v('xHatchSpacing', xd.spacing))) +
    fld('· opacity',    sl(idp + '-xh-op', v('xHatchOpacity', xd.opacity))) +
    fld('· line width', sl(idp + '-xh-lw', v('xHatchWidth',   xd.width))) +
    fld('· flip ⤢',     '<input id="' + idp + '-xh-flip" type="checkbox"' + (src.xHatchFlip ? ' checked' : '') + '/>');
}

// Wire the controls above. applyFn(partial) receives whichever field changed and
// persists it (v25Last for placement, or the selected entity). Sliders fire on
// 'input' (live drag) and DON'T rebuild the bar, so they keep focus mid-drag.
function v25WallHatchWire(bar, idp, applyFn) {
  if (!bar) return;
  const chk = (id, key) => {
    const el = bar.querySelector('#' + id);
    if (el) el.addEventListener('change', () => { const p = {}; p[key] = !!el.checked; applyFn(p); });
  };
  const sld = (id, key) => {
    const el = bar.querySelector('#' + id), out = bar.querySelector('#' + id + '-val');
    if (!el) return;
    el.addEventListener('input', () => {
      const n = parseInt(el.value, 10) || 0;
      if (out) out.textContent = n + '%';
      const p = {}; p[key] = n; applyFn(p);
    });
  };
  chk(idp + '-wallgrout',  'groutFill');
  chk(idp + '-wallxhatch', 'xHatch');
  sld(idp + '-grout-sp', 'groutSpacing');
  sld(idp + '-grout-op', 'groutOpacity');
  sld(idp + '-grout-lw', 'groutWidth');
  sld(idp + '-xh-sp', 'xHatchSpacing');
  sld(idp + '-xh-op', 'xHatchOpacity');
  sld(idp + '-xh-lw', 'xHatchWidth');
  chk(idp + '-xh-flip', 'xHatchFlip');
}

// linework-upgrade — the single selected lineSet (line/polyline), or null.
// Mirrors v25SelectedSingleMem2 so the top bar can surface a selected line's
// full style for editing.
function v25SelectedSingleLineSet() {
  if (typeof sheetMode === 'undefined' || sheetMode !== '2d') return null;
  if (typeof v25Selected === 'undefined' || !Array.isArray(v25Selected) || v25Selected.length !== 1) return null;
  const view = (typeof activeBlock !== 'undefined' && activeBlock && activeBlock.viewKey) || 'elevation';
  const arr = (typeof entities2D !== 'undefined' && entities2D[view]) || [];
  const ent = arr.find(e => e && e.id === v25Selected[0]);
  return (ent && ent.type === 'lineSet') ? ent : null;
}

// linework-upgrade — AS 1100 named line-type presets. Each sets the AS1100
// weight ramp index (lwLevel) + style + the matching raw mm so the Width
// readout stays honest. Indices map into AS1100_LW [0,.05,.10,.13,.18,.25,.35].
const V25_LINE_PRESETS = {
  visible: { label: 'Visible', lwLevel: 6, ls: 'solid' },
  hidden:  { label: 'Hidden',  lwLevel: 5, ls: 'dashed' },
  centre:  { label: 'Centre',  lwLevel: 4, ls: 'centre' },
  phantom: { label: 'Phantom', lwLevel: 5, ls: 'phantom' },
};
const V25_LINE_WIDTHS = [0.13, 0.18, 0.25, 0.35, 0.50, 0.70, 1.00];

// Build the full linework control fragment. `v` is a NORMALISED value bag
// (lw/ls/lwLevel/colour/opacity/cap/join/arrowStart/arrowEnd[/closed/fillMaterial
// /fillColour]); idp keeps element ids unique. opts.fill adds the Closed + fill
// controls (selected-line bar + inspector use them; placement does not). The
// SAME fragment serves both the placement bar (writing v25Last via the wire's
// applyFn) and the selected-line bar (writing the entity). Mirrors the wall-
// hatch HTML/wire pair so field names never drift.
function v25LineControlsHTML(v, idp, opts) {
  v = v || {}; opts = opts || {};
  const fld = (label, inner) => '<label style="display:flex;align-items:center;gap:4px">' +
    '<span style="color:var(--text-mute);font-size:11px">' + label + '</span>' + inner + '</label>';
  const opt = (val, cur, lbl) => '<option value="' + val + '"' + (val === cur ? ' selected' : '') + '>' + (lbl != null ? lbl : val) + '</option>';
  const lw = (typeof v.lw === 'number') ? v.lw : 0.35;
  const ls = v.ls || 'solid';
  const cap = v.cap || 'butt';
  const join = v.join || 'miter';
  const aS = v.arrowStart || 'none';
  const aE = v.arrowEnd || 'none';
  const op = (typeof v.opacity === 'number') ? Math.round(v.opacity * 100) : 100;
  const colShown = v.colour || '';
  let h = '';
  // Width (raw mm — picking one clears any AS1100 ramp level).
  h += fld('Width', '<select id="' + idp + '-lw" style="width:74px">' +
    V25_LINE_WIDTHS.map(w => opt(String(w), String(lw), w.toFixed(2) + ' mm')).join('') + '</select>');
  // Style.
  h += fld('Style', '<select id="' + idp + '-ls" style="width:90px">' +
    ['solid','dashed','dotted','centre','phantom'].map(s => opt(s, ls)).join('') + '</select>');
  // AS 1100 named-type quick presets.
  h += '<span style="display:flex;align-items:center;gap:3px"><span style="color:var(--text-mute);font-size:11px">AS1100</span>' +
    Object.keys(V25_LINE_PRESETS).map(k =>
      '<button type="button" data-preset="' + k + '" id="' + idp + '-pre-' + k + '" ' +
      'style="padding:2px 6px;font-size:11px;border:1px solid var(--border);background:var(--surface-3);color:var(--text);border-radius:4px;cursor:pointer">' +
      V25_LINE_PRESETS[k].label + '</button>').join('') + '</span>';
  // Colour (+ clear-to-theme).
  h += fld('Colour', '<input id="' + idp + '-col" type="color" value="' + (colShown || '#2c2c2c') + '" style="width:30px;height:22px;padding:0;cursor:pointer"/>' +
    '<button type="button" id="' + idp + '-col-x" title="Use theme colour" style="padding:1px 5px;font-size:10px;border:1px solid var(--border);background:var(--surface-3);color:var(--text-mute);border-radius:4px;cursor:pointer">×</button>');
  // Opacity.
  h += fld('Opacity', '<input id="' + idp + '-op" type="range" min="10" max="100" step="5" value="' + op +
    '" style="width:70px;vertical-align:middle"><span id="' + idp + '-op-val" style="color:var(--text-mute);font-size:11px;min-width:30px;display:inline-block">' + op + '%</span>');
  // Ends (arrowheads / caps / ticks).
  const ends = s => ['none','arrow','dot','tick'].map(x => opt(x, s)).join('');
  h += fld('Start', '<select id="' + idp + '-as" style="width:70px">' + ends(aS) + '</select>');
  h += fld('End', '<select id="' + idp + '-ae" style="width:70px">' + ends(aE) + '</select>');
  // Cap & join.
  h += fld('Cap', '<select id="' + idp + '-cap" style="width:70px">' + ['butt','round','square'].map(x => opt(x, cap)).join('') + '</select>');
  h += fld('Join', '<select id="' + idp + '-join" style="width:70px">' + ['miter','round','bevel'].map(x => opt(x, join)).join('') + '</select>');
  // Closed + fill (selected-line + inspector only).
  if (opts.fill) {
    h += fld('Closed', '<input id="' + idp + '-closed" type="checkbox"' + (v.closed ? ' checked' : '') + '/>');
    if (v.closed) {
      const mats = (typeof V25_MATERIALS === 'object') ? Object.keys(V25_MATERIALS) : [];
      h += fld('Fill hatch', '<select id="' + idp + '-fillmat" style="width:110px">' +
        opt('', v.fillMaterial || '', '(none)') + mats.map(m => opt(m, v.fillMaterial || '')).join('') + '</select>');
      h += fld('Fill colour', '<input id="' + idp + '-fillcol" type="color" value="' + (v.fillColour || '#bcd8ff') + '" style="width:30px;height:22px;padding:0;cursor:pointer"/>' +
        '<button type="button" id="' + idp + '-fillcol-x" title="No solid fill" style="padding:1px 5px;font-size:10px;border:1px solid var(--border);background:var(--surface-3);color:var(--text-mute);border-radius:4px;cursor:pointer">×</button>');
    }
  }
  return h;
}

// Wire the linework controls. applyFn(partial) receives NORMALISED keys and
// persists them onto the right target (v25Last mirrors for placement, or the
// entity for a selection). rebuildFn (optional) re-renders the bar after a
// change that adds/removes controls (the Closed toggle reveals the fill row).
function v25LineControlsWire(bar, idp, applyFn, rebuildFn) {
  if (!bar) return;
  const q = id => bar.querySelector('#' + id);
  const onSel = (id, key, num) => { const el = q(id); if (el) el.addEventListener('change', () => { const p = {}; p[key] = num ? parseFloat(el.value) : el.value; applyFn(p); }); };
  onSel(idp + '-lw', 'lw', true);   // picking a raw width clears the AS1100 ramp level
  { const el = q(idp + '-lw'); if (el) el.addEventListener('change', () => applyFn({ lwLevel: null })); }
  onSel(idp + '-ls', 'ls');
  onSel(idp + '-as', 'arrowStart');
  onSel(idp + '-ae', 'arrowEnd');
  onSel(idp + '-cap', 'cap');
  onSel(idp + '-join', 'join');
  Object.keys(V25_LINE_PRESETS).forEach(k => {
    const b = q(idp + '-pre-' + k);
    if (b) b.addEventListener('click', () => {
      const p = V25_LINE_PRESETS[k];
      const mm = (typeof AS1100_LW !== 'undefined' && AS1100_LW[p.lwLevel] != null) ? AS1100_LW[p.lwLevel] : 0.35;
      // Raw lw is the single width source; clear any legacy AS1100 ramp level
      // so the named-type weight is exactly the lw we set here.
      applyFn({ lw: mm, ls: p.ls, lwLevel: null });
      if (rebuildFn) rebuildFn();
    });
  });
  const colEl = q(idp + '-col');
  if (colEl) colEl.addEventListener('input', () => applyFn({ colour: colEl.value }));
  const colX = q(idp + '-col-x');
  if (colX) colX.addEventListener('click', () => { applyFn({ colour: null }); if (rebuildFn) rebuildFn(); });
  const opEl = q(idp + '-op'), opOut = q(idp + '-op-val');
  if (opEl) opEl.addEventListener('input', () => { const n = parseInt(opEl.value, 10) || 100; if (opOut) opOut.textContent = n + '%'; applyFn({ opacity: n / 100 }); });
  const closedEl = q(idp + '-closed');
  if (closedEl) closedEl.addEventListener('change', () => { applyFn({ closed: !!closedEl.checked }); if (rebuildFn) rebuildFn(); });
  onSel(idp + '-fillmat', 'fillMaterial');
  const fcEl = q(idp + '-fillcol');
  if (fcEl) fcEl.addEventListener('input', () => applyFn({ fillColour: fcEl.value }));
  const fcX = q(idp + '-fillcol-x');
  if (fcX) fcX.addEventListener('click', () => { applyFn({ fillColour: null }); if (rebuildFn) rebuildFn(); });
}

function v25UpdateOptionsBar() {
  const bar = v25BuildOptionsBar();
  // plate-orientation-presets (2026-05-31): v2 PlacePlateTool — Thickness select
  // + a live Orientation icon row (Elevation / flat-horizontal-cleat / vertical-
  // cleat), mirroring the member (72b) and bolt (72c) orientation rows.
  // Thickness is ALWAYS enabled — it is inert for the 'elevation' face-on mode
  // (into-page metadata) but the user wants it selectable regardless. Mode
  // (rect vs poly) is auto-detected from drag-vs-click, so no chip.
  const v2Tool = (window.v2 && v2.engine && typeof v2.engine.activeTool === 'function')
    ? v2.engine.activeTool() : null;
  if (sheetMode === '2d' && v2Tool && v2Tool.id === 'place-plate') {
    bar.style.display = 'flex';
    const ui = (v2.appState && v2.appState.ui) || {};
    const activeType  = ui.activePlateType || 'PL12';
    // Plate-flat type catalogue — single source of truth in
    // `js/v2/catalogues/families/plate-flat.js`. Read it through the v2
    // catalogue API so adding new thicknesses is a one-file change.
    let plateTypes = [];
    if (v2.catalogues && typeof v2.catalogues.lookupFamily === 'function') {
      const fam = v2.catalogues.lookupFamily('plate-flat');
      if (fam && Array.isArray(fam.types)) plateTypes = fam.types;
    }
    if (plateTypes.length === 0) {
      // Fallback if the catalogue isn't loaded — keeps the chip functional.
      plateTypes = [6, 8, 10, 12, 16, 20, 25, 32].map(function (t) {
        return { id: 'PL' + t, thickness: t };
      });
    }
    const thkOptions = plateTypes.map(function (t) {
      return '<option value="' + t.id + '"' + (t.id === activeType ? ' selected' : '') +
             '>' + t.thickness + ' mm</option>';
    }).join('');
    const help = 'Elevation = drag rect / click poly · cleats = click start · click / drag end ' +
                 '(cursor side sets thickness direction) · Shift = ortho while moving; ' +
                 'corner-drag is ortho by default · Esc cancels';
    bar.innerHTML =
      '<strong>Plate (v2)</strong>' +
      '<label style="display:flex;align-items:center;gap:4px">' +
        '<span style="color:var(--text-mute);font-size:11px">Thickness</span>' +
        '<select id="v2plate-thickness">' +
          thkOptions +
        '</select>' +
      '</label>' +
      '<label style="display:flex;align-items:center;gap:4px">' +
        '<span style="color:var(--text-mute);font-size:11px">Orientation</span>' +
        '<span id="v25OrientSlot"></span>' +
      '</label>' +
      '<span style="color:var(--text-mute);font-size:11px">' + help + '</span>';
    const thkSel = bar.querySelector('#v2plate-thickness');
    if (thkSel) thkSel.addEventListener('change', function (e) {
      if (!v2.appState.ui) v2.appState.ui = {};
      v2.appState.ui.activePlateType = e.target.value;
      if (typeof requestRender === 'function') requestRender();
    });
    // Swap the orientation-row placeholder for the live icon-button element
    // (built with click handlers, so it can't live inside the innerHTML string).
    const slot = bar.querySelector('#v25OrientSlot');
    if (slot && typeof v25BuildPlateOrientationRow === 'function') {
      slot.replaceWith(v25BuildPlateOrientationRow());
    }
    return;
  }

  // member-size-from-top-bar (2026-06-04) — when the Select tool is active and a
  // single 2D member is selected, surface its Section (size) in the top options
  // bar so the size can be changed from here as well as from the Settings tab
  // (mirrors the inspector Section dropdown in 71-v25-selection.js). Scoped to the
  // Select tool so arming a placement tool always shows placement options. The
  // bar is kept in sync on select / deselect / tool-switch via v25UpdateInspector,
  // setTool, and the v25Delete / empty-click hooks.
  const selMem = (typeof v25SelectedSingleMem2 === 'function') ? v25SelectedSingleMem2() : null;
  if (sheetMode === '2d' && tool === 'select' && selMem) {
    bar.style.display = 'flex';
    const mt = selMem.memberType || 'ub';
    const curSec = selMem.section || '';
    // chs-availability — selected CHS gets the same Grade / Finish selects as
    // the placement bar; the size list filters to the active grade.
    const selChsGrade = (mt === 'chs')
      ? (selMem.grade || (typeof chsGradeOfSize === 'function' && chsGradeOfSize(curSec)) || 'C350')
      : null;
    const secNames = v25MemberSectionNames(mt, curSec, selChsGrade);
    const secLabel = (s) => (mt === 'chs' && typeof chsSizeLabel === 'function') ? chsSizeLabel(selChsGrade, s) : s;
    bar.innerHTML =
      `<strong>${mt.toUpperCase()}</strong>` +
      `<span style="color:var(--text-mute);font-size:11px">selected</span>` +
      (mt === 'chs' ?
        `<label style="display:flex;align-items:center;gap:4px">` +
          `<span style="color:var(--text-mute);font-size:11px">Grade</span>` +
          `<select id="v25o-selchs-grade" style="width:90px">${v25ChsGradeOptionsHTML(selChsGrade)}</select>` +
        `</label>` : '') +
      `<label style="display:flex;align-items:center;gap:4px">` +
        `<span style="color:var(--text-mute);font-size:11px">Section</span>` +
        `<select id="v25o-selsect" style="width:${mt === 'chs' ? 180 : 160}px">` +
          secNames.map(s => `<option value="${s}"${s === curSec ? ' selected' : ''}>${secLabel(s)}</option>`).join('') +
        `</select>` +
        ` <button id="v25o-selsect-pick" type="button" style="padding:2px 8px;font-size:11px;border:1px solid var(--border);background:var(--surface-3);color:var(--text);border-radius:4px;cursor:pointer">Pick…</button>` +
      `</label>` +
      (mt === 'chs' ?
        `<label style="display:flex;align-items:center;gap:4px">` +
          `<span style="color:var(--text-mute);font-size:11px">Finish</span>` +
          v25ChsFinishSelectHTML('v25o-selchs-finish', selChsGrade, curSec, selMem.finish) +
        `</label>` : '') +
      `<span style="color:var(--text-mute);margin-left:4px;font-size:11px">Changes the selected member · also editable in the Settings tab</span>`;
    const applySel = (name) => {
      if (!name) return;
      selMem.section = name;
      if (typeof lastUsedSection !== 'undefined' && selMem.memberType) lastUsedSection[selMem.memberType] = name;
      // chs-availability — a size picked from the other grade's list (via the
      // grade-grouped Pick… dialog) drags the grade with it; the finish is
      // revalidated against the new size's availability.
      if (selMem.memberType === 'chs') {
        const g2 = (typeof chsGradeOfSize === 'function' && chsGradeOfSize(name)) || selMem.grade || 'C350';
        selMem.grade = g2;
        if (typeof chsValidFinish === 'function') selMem.finish = chsValidFinish(g2, name, selMem.finish);
        if (typeof v25UpdateOptionsBar === 'function') setTimeout(v25UpdateOptionsBar, 0);
      }
      if (typeof v3dMarkDirty === 'function') v3dMarkDirty();
      if (typeof invalidateWeldCache === 'function') invalidateWeldCache();
      if (typeof v25UpdateInspector === 'function') v25UpdateInspector();
      if (typeof requestRender === 'function') requestRender();
    };
    const selSel = bar.querySelector('#v25o-selsect');
    if (selSel) selSel.addEventListener('change', (e) => applySel(e.target.value));
    const selChsGradeSel = bar.querySelector('#v25o-selchs-grade');
    if (selChsGradeSel) selChsGradeSel.addEventListener('change', (e) => {
      const g = e.target.value;
      selMem.grade = g;
      if (typeof lastChsGrade !== 'undefined') lastChsGrade = g;
      // Migrate to the same-OD size in the new grade (applySel revalidates the
      // finish and rebuilds the bar so the Section list re-filters).
      applySel(v25ChsMigrateSize(g, selMem.section));
    });
    const selChsFinSel = bar.querySelector('#v25o-selchs-finish');
    if (selChsFinSel) selChsFinSel.addEventListener('change', (e) => {
      selMem.finish = e.target.value;
      if (typeof lastChsFinish !== 'undefined') lastChsFinish = selMem.finish;
      if (typeof v25UpdateInspector === 'function') v25UpdateInspector();
    });
    const selPick = bar.querySelector('#v25o-selsect-pick');
    if (selPick) selPick.addEventListener('click', (ev) => {
      ev.stopPropagation();
      // UB picker lists only UB; a UC member opens the UC picker (mirrors the
      // inspector Pick… mapping in 71-v25-selection.js).
      let kind = mt;
      if (kind === 'ub' && /UC/.test(curSec)) kind = 'uc';
      if (typeof openSizePicker === 'function') openSizePicker(kind, 'v25-selmem-' + kind, {
        centered: true,
        title: 'Pick ' + kind.toUpperCase() + ' size',
        onChoose: (name) => applySel(name),
      });
    });
    // GLT timber: append grade + grain (size / spacing / opacity) sliders after
    // the Section row, writing straight onto the selected member.
    if (selMem.memberType === 'glt' && typeof v25GltBuildControls === 'function') {
      const gltHost = document.createElement('span');
      gltHost.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap';
      gltHost.innerHTML = v25GltBuildControls({
        grade: selMem.grade, grainSize: selMem.grainSize,
        grainSpacing: selMem.grainSpacing, grainOpacity: selMem.grainOpacity,
      }, 'v25o-selglt');
      bar.appendChild(gltHost);
      if (typeof v25GltWireControls === 'function') {
        v25GltWireControls(bar, 'v25o-selglt', function (partial) { v25GltApplyToEnt(selMem, partial); });
      }
    }
    return;
  }

  // selected-stud-bar (2026-06-05) — when the Select tool is active and a single
  // stud is selected, surface its Size / Orientation / Embedment in the top bar
  // (mirrors the selected-member bar above and the inspector). Built + wired
  // INLINE before the early return — the shared orientation-swap + wire() block
  // further down is unreachable for an early-returning branch. Placed after
  // selMem and before the placement-tool hide; refreshed via the same
  // v25UpdateInspector → v25UpdateOptionsBar path as the member bar.
  const selStud = (typeof v25SelectedSingleStud === 'function') ? v25SelectedSingleStud() : null;
  if (sheetMode === '2d' && tool === 'select' && selStud) {
    bar.style.display = 'flex';
    const SDB = (typeof CHEMSET_STUDS === 'object' && CHEMSET_STUDS) ? CHEMSET_STUDS : {};
    const ssizes = (typeof CHEMSET_SIZES !== 'undefined' && CHEMSET_SIZES) ? CHEMSET_SIZES : Object.keys(SDB);
    const curStud = selStud.studSpec || 'M16';
    const studOpts = ssizes.map(id => {
      const s = SDB[id];
      const lab = s ? (s.size + ' × ' + s.L) : id;
      return `<option value="${id}"${id === curStud ? ' selected' : ''}>${lab}</option>`;
    }).join('');
    const isSection = (selStud.studOrient || 'v-nutT') !== 'end';
    let embG = null;
    if (isSection && typeof studSectionGeom === 'function') {
      embG = studSectionGeom((typeof activeBlock !== 'undefined') ? activeBlock : null, selStud);
    }
    const effDepth = embG ? Math.round(embG.embedDepth) : (selStud.embedDepth || 125);
    bar.innerHTML =
      `<strong>Stud</strong>` +
      `<span style="color:var(--text-mute);font-size:11px">selected</span>` +
      `<label style="display:flex;align-items:center;gap:4px">` +
        `<span style="color:var(--text-mute);font-size:11px">Size</span>` +
        `<select id="v25o-selstud-size" style="width:120px">${studOpts}</select>` +
      `</label>` +
      `<label style="display:flex;align-items:center;gap:4px">` +
        `<span style="color:var(--text-mute);font-size:11px">Orientation</span>` +
        `<span id="v25OrientSlot"></span>` +
      `</label>` +
      (isSection ?
        `<label style="display:flex;align-items:center;gap:4px">` +
          `<span style="color:var(--text-mute);font-size:11px">Embedment (mm)</span>` +
          `<input id="v25o-selstud-embed" type="number" min="5" step="5" value="${effDepth}" style="width:64px"/>` +
        `</label>` : '') +
      `<span style="color:var(--text-mute);margin-left:4px;font-size:11px">Drag the tip to set depth · drag the edge to snap to a face · also in the Settings tab</span>`;
    // Live orientation icon-row (handlers can't be serialised into innerHTML).
    const slot = bar.querySelector('#v25OrientSlot');
    if (slot && typeof v25BuildStudOrientRowForEnt === 'function') {
      slot.replaceWith(v25BuildStudOrientRowForEnt(selStud));
    }
    const sizeSel = bar.querySelector('#v25o-selstud-size');
    if (sizeSel) sizeSel.addEventListener('change', (e) => {
      selStud.studSpec = e.target.value;
      delete selStud.embedDepth; delete selStud.faceOffset;   // size change → catalogue defaults
      if (typeof lastUsedSection !== 'undefined') lastUsedSection.stud = selStud.studSpec;
      if (typeof requestRender === 'function') requestRender();
      if (typeof v25UpdateInspector === 'function') v25UpdateInspector();
      if (typeof v25UpdateOptionsBar === 'function') v25UpdateOptionsBar();
    });
    const embInp = bar.querySelector('#v25o-selstud-embed');
    if (embInp) embInp.addEventListener('input', (e) => {
      const val = e.target.value;
      if (val === '' || !isFinite(parseFloat(val))) delete selStud.embedDepth;
      else selStud.embedDepth = Math.max(5, parseFloat(val));
      // Live update + sync the inspector field WITHOUT rebuilding the bar — a
      // rebuild would destroy this input and steal focus mid-type. The sync skips
      // whichever input is focused, so it never fights the typing.
      if (typeof v25SyncStudEmbedReadouts === 'function') v25SyncStudEmbedReadouts(selStud);
      if (typeof requestRender === 'function') requestRender();
    });
    return;
  }

  // selected-wall-bar (blockwork-section-hatch) — a single selected section-strip
  // wall surfaces its Block / End-break + the grout & cross-hatch controls in the
  // top bar (the same controls also sit in the left inspector). Mirrors the
  // selected-member / selected-stud bars; refreshed via v25UpdateInspector ->
  // v25UpdateOptionsBar on select / deselect.
  const selWall = (typeof v25SelectedSingleWallSec === 'function') ? v25SelectedSingleWallSec() : null;
  if (sheetMode === '2d' && tool === 'select' && selWall) {
    bar.style.display = 'flex';
    const we = selWall.endBreak || 'start';
    const blkOpts = (typeof V25_BLOCK_DB === 'object')
      ? Object.keys(V25_BLOCK_DB).map(k => `<option${k === selWall.blockKey ? ' selected' : ''}>${k}</option>`).join('') : '';
    bar.innerHTML =
      `<strong>Blockwork</strong>` +
      `<span style="color:var(--text-mute);font-size:11px">selected</span>` +
      `<label style="display:flex;align-items:center;gap:4px"><span style="color:var(--text-mute);font-size:11px">Block</span>` +
        `<select id="v25o-selwall-block">${blkOpts}</select></label>` +
      `<label style="display:flex;align-items:center;gap:4px"><span style="color:var(--text-mute);font-size:11px">End break</span>` +
        `<select id="v25o-selwall-end">` +
          `<option value="start"${we==='start'?' selected':''}>start</option>` +
          `<option value="end"${we==='end'?' selected':''}>finish</option>` +
          `<option value="both"${we==='both'?' selected':''}>both</option>` +
          `<option value="none"${we==='none'?' selected':''}>none</option></select></label>` +
      ((typeof v25WallHatchControlsHTML === 'function') ? v25WallHatchControlsHTML(selWall, 'v25o-sel') : '') +
      `<span style="color:var(--text-mute);margin-left:4px;font-size:11px">Edits the selected wall · also in the Settings tab</span>`;
    const blkSel = bar.querySelector('#v25o-selwall-block');
    if (blkSel) blkSel.addEventListener('change', e => {
      selWall.blockKey = e.target.value;
      if (typeof requestRender === 'function') requestRender();
      if (typeof v25UpdateInspector === 'function') v25UpdateInspector();
    });
    const endSel = bar.querySelector('#v25o-selwall-end');
    if (endSel) endSel.addEventListener('change', e => {
      selWall.endBreak = e.target.value;
      if (typeof requestRender === 'function') requestRender();
      if (typeof v25UpdateInspector === 'function') v25UpdateInspector();
    });
    // Hatch toggles + sliders write straight onto the selected wall (no bar rebuild
    // mid-drag, so sliders keep focus — same idiom as the selected-stud embed input).
    if (typeof v25WallHatchWire === 'function') {
      v25WallHatchWire(bar, 'v25o-sel', (p) => { Object.assign(selWall, p); if (typeof requestRender === 'function') requestRender(); });
    }
    return;
  }

  // selected-clt-bar — a single selected CLT panel surfaces its Panel /
  // Treatment / board + grain controls in the top bar (mirrors the selected
  // member / wall bars). Built + wired via the shared 72n control helpers.
  const selClt = (typeof v25SelectedSingleClt === 'function') ? v25SelectedSingleClt() : null;
  if (sheetMode === '2d' && tool === 'select' && selClt && typeof v25CltBuildControls === 'function') {
    bar.innerHTML = '';   // clear prior bar content (mirrors every sibling branch)
    bar.style.display = 'flex';
    const host = document.createElement('span');
    host.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap';
    const strong = document.createElement('strong'); strong.textContent = 'CLT';
    bar.appendChild(strong);
    host.innerHTML = v25CltBuildControls({
      panel: selClt.panel, treatment: selClt.treatment, boardWidth: selClt.boardWidth,
      grainSize: selClt.grainSize, grainSpacing: selClt.grainSpacing,
      grainOpacity: selClt.grainOpacity, edgeWeight: selClt.edgeWeight,
    }, 'v25o-selclt');
    bar.appendChild(host);
    if (typeof v25CltWireControls === 'function') {
      v25CltWireControls(bar, 'v25o-selclt', function (partial) { v25CltApplyToEnt(selClt, partial); });
    }
    return;
  }

  // snapshot-tools (js/88) — a single selected image surfaces its Opacity dial,
  // Multiply / Flatten toggles and Layer assignment in the top bar (mirrors the
  // selected-member / selected-stud bars above). Scoped to the Select tool so
  // arming a placement tool always shows placement options instead.
  const selSnap = (typeof v25SelectedSingleSnapshot === 'function') ? v25SelectedSingleSnapshot() : null;
  if (sheetMode === '2d' && tool === 'select' && selSnap && typeof v25BuildSnapshotOptionsBar === 'function') {
    bar.style.display = 'flex';
    v25BuildSnapshotOptionsBar(bar, selSnap);
    return;
  }

  // linework-upgrade — a single selected line/polyline: surface its full style
  // (width / colour / style / opacity / AS1100 preset / arrowheads / cap / join
  // / closed + fill) in the top bar, bound straight to the entity. Mirrors the
  // selected-member branch; the SAME control fragment serves placement below.
  const selLine = (typeof v25SelectedSingleLineSet === 'function') ? v25SelectedSingleLineSet() : null;
  if (sheetMode === '2d' && tool === 'select' && selLine) {
    bar.style.display = 'flex';
    const label = selLine.closed ? 'POLYGON' : (selLine.pts && selLine.pts.length > 2 ? 'POLYLINE' : 'LINE');
    const v = {
      lw: selLine.lw, ls: selLine.ls, lwLevel: selLine.lwLevel, colour: selLine.colour,
      opacity: selLine.opacity, cap: selLine.cap, join: selLine.join,
      arrowStart: selLine.arrowStart, arrowEnd: selLine.arrowEnd, closed: !!selLine.closed,
      fillMaterial: selLine.fillMaterial, fillColour: selLine.fillColour,
    };
    bar.innerHTML = '<strong>' + label + '</strong>' +
      '<span style="color:var(--text-mute);font-size:11px">selected</span>' +
      v25LineControlsHTML(v, 'v25o-sline', { fill: true });
    const apply = (partial) => {
      Object.keys(partial).forEach(k => {
        if (partial[k] === null) delete selLine[k]; else selLine[k] = partial[k];
      });
      if (typeof requestRender === 'function') requestRender();
      if (typeof v25UpdateInspector === 'function') v25UpdateInspector();
    };
    v25LineControlsWire(bar, 'v25o-sline', apply, () => v25UpdateOptionsBar());
    return;
  }

  if (sheetMode !== '2d' || !tool || !tool.startsWith('v25-')) {
    bar.style.display = 'none'; return;
  }
  bar.style.display = 'flex';
  let html = '';
  const fld = (label, html2) => `<label style="display:flex;align-items:center;gap:4px"><span style="color:var(--text-mute);font-size:11px">${label}</span>${html2}</label>`;
  if (tool === 'v25-anchor') {
    const def = V25_ANCHOR_DB[v25Last.anchor];
    html += `<strong>${def.label}</strong>`;
    html += fld('Kind', `<select id="v25o-kind">${Object.keys(V25_ANCHOR_DB).map(k => `<option ${k === v25Last.anchor ? 'selected' : ''}>${k}</option>`).join('')}</select>`);
    html += fld('Size', `<select id="v25o-size">${(def.sizes || []).map(s => `<option ${s === v25Last.anchorSize ? 'selected' : ''}>${s}</option>`).join('')}</select>`);
    html += fld('Count', `<input id="v25o-count" type="number" min="1" value="${v25Last.anchorCount || 1}" style="width:50px"/>`);
    html += fld('Spacing', `<input id="v25o-spacing" type="number" value="${v25Last.anchorSpacing || 200}" style="width:60px"/>`);
    html += fld('Embed', `<input id="v25o-embed" type="number" value="${v25Last.anchorEmbed || (def.defaults && def.defaults.embed) || 100}" style="width:60px"/>`);
  } else if (tool === 'v25-mat') {
    html += `<strong>Material</strong>`;
    html += fld('Type', `<select id="v25o-mat">${Object.keys(V25_MATERIALS).map(k => `<option value="${k}" ${k === v25Last.material ? 'selected' : ''}>${V25_MATERIALS[k].label}</option>`).join('')}</select>`);
  } else if (tool === 'v25-wall' || tool === 'v25-wall-sec') {
    const secMode = (tool === 'v25-wall-sec');
    html += `<strong>Blockwork wall</strong>`;
    // View row (Section vs Elevation) is a live DOM icon row — emit a
    // placeholder and swap it in after innerHTML, like the member Orientation.
    html += fld('View', `<span id="v25WallModeSlot"></span>`);
    html += fld('Block', `<select id="v25o-block">${Object.keys(V25_BLOCK_DB).map(k => `<option ${k === v25Last.blockThk ? 'selected' : ''}>${k}</option>`).join('')}</select>`);
    if (secMode) {
      const we = v25Last.wallEnd || 'start';
      html += fld('End break', `<select id="v25o-wallend">` +
        `<option value="start"${we==='start'?' selected':''}>start</option>` +
        `<option value="end"${we==='end'?' selected':''}>finish</option>` +
        `<option value="both"${we==='both'?' selected':''}>both</option>` +
        `<option value="none"${we==='none'?' selected':''}>none</option></select>`);
      html += v25WallHatchControlsHTML(v25Last, 'v25o');
      html += `<span style="color:var(--text-mute);font-size:11px">Click start · click end · Shift = free angle</span>`;
    } else {
      html += `<span style="color:var(--text-mute);font-size:11px">Drag two corners · edges hard (double-click an edge to break it after placing)</span>`;
    }
  } else if (tool === 'v25-clt-edge' || tool === 'v25-clt-plan') {
    const planMode = (tool === 'v25-clt-plan');
    const g = (v25Last && v25Last.cltGrain) || {};
    html += `<strong>CLT</strong>`;
    // Orientation row (Floor / Wall / Plan → / Plan ↑) — a live DOM element, so
    // emit a placeholder and swap it in after innerHTML (like the member row).
    html += fld('Orientation', `<span id="v25CltOrientSlot"></span>`);
    if (typeof v25CltBuildControls === 'function') {
      html += v25CltBuildControls({
        panel: v25Last.cltPanel, treatment: v25Last.cltTreatment, boardWidth: v25Last.cltBoardWidth,
        grainSize: g.size, grainSpacing: g.spacing, grainOpacity: g.opacity, edgeWeight: v25Last.cltEdge,
      }, 'v25o-clt');
    }
    html += planMode
      ? `<span style="color:var(--text-mute);font-size:11px">Drag two corners</span>`
      : `<span style="color:var(--text-mute);font-size:11px">Click start · click end · thickness to scale · Shift = free angle</span>`;
  } else if (tool === 'v25-bar' || tool === 'v25-bar-dot') {
    html += `<strong>Reinforcement</strong>`;
    html += fld('Bar', `<select id="v25o-bar">${Object.keys(V25_REO_DB.bars).map(k => `<option ${k === v25Last.reoBar ? 'selected' : ''}>${k}</option>`).join('')}</select>`);
  } else if (tool === 'v25-mesh') {
    html += `<strong>Mesh</strong>`;
    html += fld('Mesh', `<select id="v25o-mesh">${Object.keys(V25_REO_DB.meshes).map(k => `<option ${k === v25Last.mesh ? 'selected' : ''}>${k}</option>`).join('')}</select>`);
  } else if (tool === 'v25-mem') {
    const mt = v25State.memberType || 'ub';
    const memberLabel = mt.toUpperCase();
    // chs-availability — CHS gets a Grade select before Section (sizes filter
    // to the grade) and a Finish select after it (per-size availability).
    const chsGrade = (mt === 'chs')
      ? (v25State.chsGrade || (typeof chsGradeOfSize === 'function' && chsGradeOfSize(v25State.section)) || 'C350')
      : null;
    // member-size-from-top-bar (2026-06-04) — section list via the shared helper
    // so the placement bar and the selected-member editor never drift.
    const sectionNames = v25MemberSectionNames(mt, null, chsGrade);
    const curSec = v25State.section || '';
    html += `<strong>${memberLabel}</strong>`;
    if (mt === 'chs') {
      html += fld('Grade', `<select id="v25o-chs-grade" style="width:90px">${v25ChsGradeOptionsHTML(chsGrade)}</select>`);
    }
    const secLabel = (s) => (mt === 'chs' && typeof chsSizeLabel === 'function') ? chsSizeLabel(chsGrade, s) : s;
    html += fld('Section',
      `<select id="v25o-sect" style="width:${mt === 'chs' ? 180 : 160}px">` +
      (curSec && !sectionNames.includes(curSec) ? `<option value="${curSec}" selected>${curSec}</option>` : '') +
      sectionNames.map(s => `<option value="${s}"${s === curSec ? ' selected' : ''}>${secLabel(s)}</option>`).join('') +
      `</select>` +
      ` <button id="v25o-sect-pick" type="button" style="padding:2px 8px;font-size:11px;border:1px solid var(--border);background:var(--surface-3);color:var(--text);border-radius:4px;cursor:pointer">Pick…</button>`
    );
    if (mt === 'chs') {
      html += fld('Finish', v25ChsFinishSelectHTML('v25o-chs-finish', chsGrade, curSec, v25State.chsFinish));
    }
    // Orientation row replaces the old Aspect + PFC Open-face dropdowns. It is
    // built as a live DOM element (its buttons carry click handlers) so it
    // can't be serialised into this innerHTML string — emit a placeholder span
    // here and swap in the real row after bar.innerHTML is set (see below).
    html += fld('Orientation', `<span id="v25OrientSlot"></span>`);
    // GLT timber: grade selector + grain (size / spacing / opacity) sliders.
    if (mt === 'glt' && typeof v25GltBuildControls === 'function') {
      html += v25GltBuildControls({
        grade: v25State.grade,
        grainSize: v25State.grainSize,
        grainSpacing: v25State.grainSpacing,
        grainOpacity: v25State.grainOpacity,
      }, 'v25o-glt');
    }
  // v1 V25 plate options (Aspect / Thk) retired by architecture-v2 Phase 2.
  // v2 plate placement options will land on the v2 inspector + size picker
  // when Phase 11+ stands up the standalone v2 BB-rail.
  } else if (tool === 'v25-bolt') {
    const curSize = v25State.boltSize || (typeof lastUsedSection !== 'undefined' && lastUsedSection.bolt) || 'M20';
    const curGrade = v25State.boltGrade || '8.8';
    html += `<strong>Bolt</strong>`;
    html += fld('Size',
      `<select id="v25o-bolt-size" style="width:80px">` +
      Object.keys(BOLT_DB).map(s => `<option value="${s}"${s === curSize ? ' selected' : ''}>${s}</option>`).join('') +
      `</select>`);
    html += fld('Grade',
      `<select id="v25o-bolt-grade" style="width:90px">` +
      ['4.6', '8.8'].map(g => `<option value="${g}"${g === curGrade ? ' selected' : ''}>${g}/S</option>`).join('') +
      `</select>`);
    // Orientation row is a live DOM icon row (buttons carry click handlers) so
    // it can't live in the innerHTML string — emit a placeholder and swap in the
    // real row after bar.innerHTML is set, exactly like the member Orientation.
    html += fld('Orientation', `<span id="v25OrientSlot"></span>`);
  } else if (tool === 'v25-screw') {
    // Rothoblaas timber screw — family-aware: the active spec id selects HBS
    // ('HBSPL…', partial thread, 02c catalogue) or VGS ('VGS…', fully threaded,
    // 02j catalogue). Size select (grouped by Ø / head family) + the live
    // orientation row (swapped in below, like the bolt). (72i-v25-screw.js)
    const curSpec = v25State.screwSpec
      || (typeof lastUsedSection !== 'undefined' && lastUsedSection.screw) || 'HBSPL8120';
    const isVgs = (typeof isVgsSpec === 'function') && isVgsSpec(curSpec);
    let sizeOpts = '';
    if (isVgs) {
      // VGS — optgroups straight from VGS_SIZE_GROUPS (csk ≤600 / hex >600).
      const VGS = (typeof VGS_SCREWS === 'object' && VGS_SCREWS) ? VGS_SCREWS : {};
      const vgrps = (typeof VGS_SIZE_GROUPS !== 'undefined' && VGS_SIZE_GROUPS) ? VGS_SIZE_GROUPS : [];
      const vopt = (id) => {
        const s = VGS[id];
        const lab = s ? ('Ø' + s.d + ' × ' + s.L) : id;
        return `<option value="${id}"${id === curSpec ? ' selected' : ''}>${lab}</option>`;
      };
      vgrps.forEach(g => {
        if (!g.ids || !g.ids.length) return;
        sizeOpts += `<optgroup label="${g.label}">` + g.ids.map(vopt).join('') + `</optgroup>`;
      });
      if (!sizeOpts) sizeOpts = Object.keys(VGS).map(vopt).join('');
    } else {
      // HBS — grouped by Ø, from the verified 02c catalogue (unchanged path).
      const HBS = (typeof HBS_PLATE_SCREWS === 'object' && HBS_PLATE_SCREWS) ? HBS_PLATE_SCREWS : {};
      const grp = (typeof HBS_LENGTHS_BY_D === 'object' && HBS_LENGTHS_BY_D) ? HBS_LENGTHS_BY_D : {};
      const opt = (id) => {
        const s = HBS[id];
        const lab = s ? ('Ø' + s.d + ' × ' + s.L) : id;
        return `<option value="${id}"${id === curSpec ? ' selected' : ''}>${lab}</option>`;
      };
      [8, 10, 12].forEach(dia => {
        const ids = grp[dia] || [];
        if (!ids.length) return;
        sizeOpts += `<optgroup label="Ø${dia} (${(HBS[ids[0]] || {}).bit || 'TX'})">` +
          ids.map(opt).join('') + `</optgroup>`;
      });
      if (!sizeOpts) sizeOpts = Object.keys(HBS).map(opt).join('');
    }
    html += `<strong>Screw</strong>`;
    html += `<span style="color:var(--text-mute);font-size:11px;margin-left:4px">${isVgs ? 'VGS' : 'HBS'}</span>`;
    html += fld('Size', `<select id="v25o-screw-size" style="width:120px">${sizeOpts}</select>`);
    html += fld('Orientation', `<span id="v25OrientSlot"></span>`);
  } else if (tool === 'v25-stud') {
    // ChemSet anchor stud — Size (from the 02g catalogue) + the live orientation
    // row (swapped in below, like the bolt/screw). (72j-v25-stud.js)
    const SDB = (typeof CHEMSET_STUDS === 'object' && CHEMSET_STUDS) ? CHEMSET_STUDS : {};
    const ssizes = (typeof CHEMSET_SIZES !== 'undefined' && CHEMSET_SIZES) ? CHEMSET_SIZES : Object.keys(SDB);
    const curStud = v25State.studSpec
      || (typeof lastUsedSection !== 'undefined' && lastUsedSection.stud)
      || (typeof V25_STUD_DEFAULT_SPEC !== 'undefined' ? V25_STUD_DEFAULT_SPEC : 'M16');
    const studOpts = ssizes.map(id => {
      const s = SDB[id];
      const lab = s ? (s.size + ' × ' + s.L) : id;
      return `<option value="${id}"${id === curStud ? ' selected' : ''}>${lab}</option>`;
    }).join('');
    html += `<strong>Stud</strong>`;
    html += fld('Size', `<select id="v25o-stud-size" style="width:120px">${studOpts}</select>`);
    html += fld('Orientation', `<span id="v25OrientSlot"></span>`);
    // Auto-note: on first stud in a view, auto-drop the linked chemical-anchor
    // callout note (js/89). Default ON; toggling writes window.v25AutoAnchorNote.
    html += fld('Auto-note', `<input id="v25o-stud-autonote" type="checkbox"${(window.v25AutoAnchorNote !== false) ? ' checked' : ''}/>`);
  } else if (tool === 'v25-leader') {
    html += `<strong>Leader</strong>`;
    html += fld('Default text', `<input id="v25o-leadertxt" value="${(v25Last.leaderText || 'CALLOUT').replace(/"/g, '&quot;')}" style="width:200px"/>`);
  } else if (tool === 'v25-measure') {
    html += `<strong>Dimension</strong>`;
    const _dimFonts = (typeof DIM2_FONT_OPTS !== 'undefined') ? DIM2_FONT_OPTS : [{ v: 'plex', l: 'Plex' }];
    html += fld('Font', `<select id="v25o-dimstyle">${_dimFonts.map(o => `<option value="${o.v}"${(v25Last.dimStyle || 'plex') === o.v ? ' selected' : ''}>${o.l}</option>`).join('')}</select>`);
    html += fld('Text height (mm)', `<input id="v25o-dimtexth" type="number" step="0.5" value="${(typeof v25Last.dimTextH === 'number' ? v25Last.dimTextH : 2.5)}" style="width:60px"/>`);
    html += fld('Terminator', `<select id="v25o-dimterm">${['tick','arrow','dot'].map(t => `<option value="${t}"${(v25Last.dimTerm||'tick')===t?' selected':''}>${t}</option>`).join('')}</select>`);
    html += fld('Precision', `<select id="v25o-dimprec">${['0','1','2','3'].map(p => `<option value="${p}"${String(v25Last.dimPrec!=null?v25Last.dimPrec:0)===p?' selected':''}>${p}</option>`).join('')}</select>`);
    html += fld('Units', `<select id="v25o-dimunits">${['mm','m'].map(u => `<option value="${u}"${(v25Last.dimUnits||'mm')===u?' selected':''}>${u}</option>`).join('')}</select>`);
    html += fld('Offset (mm)', `<input id="v25o-dimoffset" type="number" step="1" value="${(typeof v25Last.dimOffset === 'number' ? v25Last.dimOffset : 12)}" style="width:60px"/>`);
    html += fld('Text offset', `<input id="v25o-dimtxtoff" type="checkbox"${v25Last.dimTextOffset ? ' checked' : ''}/>`);
    html += `<span style="color:var(--text-mute);font-size:11px">Click two points · type a length or label · drag to re-offset · Text offset = label beside the arrows · Shift = free angle</span>`;
  } else if (tool === 'v25-frame') {
    html += `<strong>Detail frame</strong> — drag two corners`;
  } else if (tool === 'v25-line') {
    const single = (v25State && v25State.lineMode === 'single');
    html += `<strong>${single ? 'Line' : 'Polyline'}</strong>`;
    // linework-upgrade — full style controls (shared with the selected-line bar
    // + inspector), reading the v25Last.line* mirrors so the NEXT line drawn
    // inherits them. No Closed/fill here (a polyline closes by clicking its
    // first vertex; fill is set on the selected polygon afterwards).
    html += v25LineControlsHTML({
      lw: v25Last.lineLw, ls: v25Last.lineLs, lwLevel: v25Last.lineLwLevel,
      colour: v25Last.lineColour, opacity: v25Last.lineOpacity,
      cap: v25Last.lineCap, join: v25Last.lineJoin,
      arrowStart: v25Last.lineArrowStart, arrowEnd: v25Last.lineArrowEnd,
    }, 'v25o-pline', { fill: false });
    html += `<span style="color:var(--text-mute);font-size:11px">${single ? 'Click start · click end · Shift = ortho/45°' : 'Click to add points · Enter / right-click / click first point to finish · Shift = ortho/45°'}</span>`;
  } else if (tool === 'v25-notch') {
    html += `<strong>Notch</strong>`;
    html += `<span style="color:var(--text-mute);font-size:11px">Mark the cut: click each corner · Shift = ortho/45° · type a length to lock a segment · click the first dot to close · double-click / Enter = saw off · double-click empty space = sized void</span>`;
  } else if (tool === 'v25-text') {
    html += `<strong>Text</strong>`;
    html += fld('Default text', `<input id="v25o-textdef" value="${(v25Last.textDefault || 'TEXT').replace(/"/g, '&quot;')}" style="width:200px"/>`);
    html += fld('Size (mm)', `<input id="v25o-textsz" type="number" step="0.5" value="${v25Last.textSize || 3}" style="width:60px"/>`);
  } else if (tool === 'v25-stiffener') {
    // plate-grouping-stiffener — full-depth web stiffener. Thickness + weld
    // toggle; geometry (between flange inner faces, centred on a column) is
    // resolved at click time. Defaults persist on v25Last.
    const _stThk = (typeof v25Last !== 'undefined' && v25Last.stiffThk) || 10;
    const _stWeld = (typeof v25Last !== 'undefined' && v25Last.stiffWeld === true);
    const _stHatch = (typeof v25Last !== 'undefined' && v25Last.stiffHatch === true);
    html += `<strong>Stiffener</strong>`;
    html += fld('Thickness (mm)', `<select id="v25o-stiff-thk" style="width:80px">` +
      [6,8,10,12,16,20].map(t => `<option value="${t}"${t === _stThk ? ' selected' : ''}>${t} mm</option>`).join('') +
      `</select>`);
    html += fld('Weld both sides', `<input id="v25o-stiff-weld" type="checkbox"${_stWeld ? ' checked' : ''}/>`);
    html += fld('Steel hatch', `<input id="v25o-stiff-hatch" type="checkbox"${_stHatch ? ' checked' : ''}/>`);
    html += `<span style="color:var(--text-mute);font-size:11px">Hover a beam under a column · click to place · Shift = free X · drag an end to shorten</span>`;
  } else if (tool === 'v25-notebox' || tool === 'v25-note' || tool === 'v25-textplain') {
    html += (typeof nbOptionsBarHTML === 'function') ? nbOptionsBarHTML() : '<strong>Note</strong>';
  }
  bar.innerHTML = html + ` <span style="color:var(--text-mute);margin-left:8px;font-size:11px">Esc to cancel</span>`;

  if ((tool === 'v25-notebox' || tool === 'v25-note' || tool === 'v25-textplain') && typeof nbBindOptionsBar === 'function') nbBindOptionsBar(bar);

  // Swap the orientation-row placeholder for the live element (built with click
  // handlers, so it can't live inside the innerHTML string). mt is out of scope
  // here, so re-read the active member type from v25State.
  if (tool === 'v25-mem') {
    const slot = bar.querySelector('#v25OrientSlot');
    if (slot && typeof v25BuildOrientationRow === 'function') {
      slot.replaceWith(v25BuildOrientationRow(v25State.memberType || 'ub'));
    }
    // GLT grade + grain sliders → v25State + module latches (placement preview).
    if (v25State.memberType === 'glt' && typeof v25GltWireControls === 'function') {
      v25GltWireControls(bar, 'v25o-glt', function (partial) { v25GltApplyToState(partial); });
    }
  }
  // CLT placement controls → v25Last latches (so the next placed panel + the
  // ghost reflect the choice). Swap the orientation-row placeholder for the live
  // icon row (Floor / Wall / Plan → / Plan ↑), mirroring the member row.
  if (tool === 'v25-clt-edge' || tool === 'v25-clt-plan') {
    const slot = bar.querySelector('#v25CltOrientSlot');
    if (slot && typeof v25BuildCltOrientRow === 'function') slot.replaceWith(v25BuildCltOrientRow());
    if (typeof v25CltWireControls === 'function') {
      v25CltWireControls(bar, 'v25o-clt', function (partial) { if (typeof v25CltApplyToState === 'function') v25CltApplyToState(partial); });
    }
  }
  // Swap the bolt orientation-row placeholder for the live element (mirrors the
  // member Orientation slot above — the bolt row builder takes no params and
  // reads/writes v25State.boltOrient itself).
  if (tool === 'v25-bolt') {
    const slot = bar.querySelector('#v25OrientSlot');
    if (slot && typeof v25BuildBoltOrientationRow === 'function') {
      slot.replaceWith(v25BuildBoltOrientationRow());
    }
  }
  // Swap the screw orientation-row placeholder for the live element (the row
  // builder reads/writes v25State.screwOrient itself). (72i-v25-screw.js)
  if (tool === 'v25-screw') {
    const slot = bar.querySelector('#v25OrientSlot');
    if (slot && typeof v25BuildScrewOrientationRow === 'function') {
      slot.replaceWith(v25BuildScrewOrientationRow());
    }
  }
  // Swap the stud orientation-row placeholder for the live element (the row
  // builder reads/writes v25State.studOrient itself). (72j-v25-stud.js)
  if (tool === 'v25-stud') {
    const slot = bar.querySelector('#v25OrientSlot');
    if (slot && typeof v25BuildStudOrientationRow === 'function') {
      slot.replaceWith(v25BuildStudOrientationRow());
    }
  }
  // Swap the blockwork View placeholder for the live Section/Elevation row.
  if (tool === 'v25-wall' || tool === 'v25-wall-sec') {
    const slot = bar.querySelector('#v25WallModeSlot');
    if (slot && typeof v25BuildWallModeRow === 'function') {
      slot.replaceWith(v25BuildWallModeRow());
    }
  }
  // blockwork-section-hatch — live grout/cross-hatch toggles + sliders write
  // v25Last (the placement defaults) and re-render so the drag-preview tracks them.
  if (tool === 'v25-wall-sec' && typeof v25WallHatchWire === 'function') {
    v25WallHatchWire(bar, 'v25o', (p) => {
      Object.assign(v25Last, p);
      if (typeof requestRender === 'function') requestRender();
    });
  }

  // Wire change events
  const wire = (id, fn) => { const el = bar.querySelector('#' + id); if (el) el.addEventListener('change', fn); };
  wire('v25o-kind', e => { v25Last.anchor = e.target.value; const d = V25_ANCHOR_DB[v25Last.anchor]; v25Last.anchorSize = d.defaults.size; v25Last.anchorEmbed = d.defaults.embed; v25UpdateOptionsBar(); });
  wire('v25o-size', e => { v25Last.anchorSize = e.target.value; });
  wire('v25o-count', e => { v25Last.anchorCount = parseInt(e.target.value) || 1; });
  wire('v25o-spacing', e => { v25Last.anchorSpacing = parseInt(e.target.value) || 200; });
  wire('v25o-embed', e => { v25Last.anchorEmbed = parseInt(e.target.value) || 100; });
  wire('v25o-mat', e => { v25Last.material = e.target.value; });
  wire('v25o-stiff-thk', e => { v25Last.stiffThk = parseInt(e.target.value) || 10; });
  wire('v25o-stiff-weld', e => { v25Last.stiffWeld = !!e.target.checked; });
  wire('v25o-stiff-hatch', e => { v25Last.stiffHatch = !!e.target.checked; });
  wire('v25o-block', e => { v25Last.blockThk = e.target.value; });
  wire('v25o-wallend', e => { v25Last.wallEnd = e.target.value; });
  // (Grout / cross-hatch controls are wired above via v25WallHatchWire.)
  wire('v25o-bar', e => { v25Last.reoBar = e.target.value; });
  wire('v25o-mesh', e => { v25Last.mesh = e.target.value; });
  wire('v25o-sect', e => {
    v25State.section = e.target.value;
    if (v25State.memberType) lastUsedSection[v25State.memberType] = v25State.section;
    if (typeof populateTilePalette === 'function') populateTilePalette();
    if (typeof highlightActiveTile === 'function') highlightActiveTile();
    // chs-availability — keep the finish legal for the new size and rebuild the
    // bar so the Finish dropdown lists that size's availability.
    if (v25State.memberType === 'chs' && typeof chsValidFinish === 'function') {
      v25State.chsFinish = chsValidFinish(v25State.chsGrade || 'C350', v25State.section, v25State.chsFinish);
      if (typeof lastChsFinish !== 'undefined') lastChsFinish = v25State.chsFinish;
      v25UpdateOptionsBar();
    }
  });
  // chs-availability — Grade re-filters the size list (same-OD migration) and
  // revalidates the finish; Finish just latches for the next placement.
  wire('v25o-chs-grade', e => {
    const g = e.target.value;
    v25State.chsGrade = g;
    if (typeof lastChsGrade !== 'undefined') lastChsGrade = g;
    v25State.section = v25ChsMigrateSize(g, v25State.section);
    lastUsedSection.chs = v25State.section;
    if (typeof chsValidFinish === 'function') {
      v25State.chsFinish = chsValidFinish(g, v25State.section, v25State.chsFinish);
      if (typeof lastChsFinish !== 'undefined') lastChsFinish = v25State.chsFinish;
    }
    if (typeof populateTilePalette === 'function') populateTilePalette();
    v25UpdateOptionsBar();
  });
  wire('v25o-chs-finish', e => {
    v25State.chsFinish = e.target.value;
    if (typeof lastChsFinish !== 'undefined') lastChsFinish = v25State.chsFinish;
  });
  wire('v25o-bolt-size', e => {
    v25State.boltSize = e.target.value;
    if (typeof lastUsedSection !== 'undefined') lastUsedSection.bolt = v25State.boltSize;
    if (typeof highlightActiveTile === 'function') highlightActiveTile();
    if (typeof requestRender === 'function') requestRender();
  });
  wire('v25o-bolt-grade', e => {
    v25State.boltGrade = e.target.value;
    if (typeof requestRender === 'function') requestRender();
  });
  wire('v25o-screw-size', e => {
    v25State.screwSpec = e.target.value;
    // Family-aware persistence: VGS sizes latch onto lastUsedSection.vgs so the
    // HBS tile's last-used size survives a VGS session (and vice versa).
    if (typeof lastUsedSection !== 'undefined') {
      if (typeof isVgsSpec === 'function' && isVgsSpec(v25State.screwSpec)) {
        lastUsedSection.vgs = v25State.screwSpec;
      } else {
        lastUsedSection.screw = v25State.screwSpec;
      }
    }
    if (typeof highlightActiveTile === 'function') highlightActiveTile();
    if (typeof requestRender === 'function') requestRender();
  });
  wire('v25o-stud-size', e => {
    v25State.studSpec = e.target.value;
    if (typeof lastUsedSection !== 'undefined') lastUsedSection.stud = v25State.studSpec;
    if (typeof highlightActiveTile === 'function') highlightActiveTile();
    if (typeof requestRender === 'function') requestRender();
  });
  wire('v25o-stud-autonote', e => { window.v25AutoAnchorNote = !!e.target.checked; });
  // v25o-aspect / v25o-openside wires retired — orientation is now set through
  // the orientation row (v25BuildOrientationRow → v25SetOrientation), which
  // writes v25State.aspect / rot / openSide and refreshes the bar itself.
  // v25o-plate-aspect / v25o-plate-thk wires retired with the v1 plate options
  // branch above (architecture-v2 Phase 2).
  const pickBtn = bar.querySelector('#v25o-sect-pick');
  if (pickBtn) pickBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const mt = v25State.memberType || 'ub';
    openSizePicker(mt, 'v25-' + mt + '-2d', {
      centered: true,
      title: 'Pick ' + mt.toUpperCase() + ' size',
      onChoose: (name) => v25SetMember(mt, name, v25State.aspect),
    });
  });
  wire('v25o-leadertxt', e => { v25Last.leaderText = e.target.value; });
  const wireInput = (id, fn) => { const el = bar.querySelector('#' + id); if (el) el.addEventListener('input', fn); };
  // linework-upgrade — placement line controls write the v25Last.line* mirrors
  // so the next drawn line inherits them (v25StampLineStyle maps them onto the
  // new entity at commit). Map normalised control keys → line*-prefixed latches.
  if (tool === 'v25-line') {
    const _lk = { lw: 'lineLw', ls: 'lineLs', lwLevel: 'lineLwLevel', colour: 'lineColour',
      opacity: 'lineOpacity', cap: 'lineCap', join: 'lineJoin',
      arrowStart: 'lineArrowStart', arrowEnd: 'lineArrowEnd' };
    v25LineControlsWire(bar, 'v25o-pline', (partial) => {
      Object.keys(partial).forEach(k => { if (_lk[k]) v25Last[_lk[k]] = partial[k]; });
      if (typeof requestRender === 'function') requestRender();
    }, () => v25UpdateOptionsBar());
  }
  wireInput('v25o-textdef', e => { v25Last.textDefault = e.target.value; });
  wireInput('v25o-textsz', e => { v25Last.textSize = parseFloat(e.target.value) || 3; });
  // Dimension / Measure tool defaults (js/82).
  wire('v25o-dimstyle', e => { v25Last.dimStyle = e.target.value; });
  wireInput('v25o-dimtexth', e => { v25Last.dimTextH = parseFloat(e.target.value) || 2.5; });
  wire('v25o-dimterm', e => { v25Last.dimTerm = e.target.value; });
  wire('v25o-dimprec', e => { v25Last.dimPrec = parseInt(e.target.value) || 0; });
  wire('v25o-dimunits', e => { v25Last.dimUnits = e.target.value; });
  wireInput('v25o-dimoffset', e => { v25Last.dimOffset = parseFloat(e.target.value) || 12; });
  wire('v25o-dimtxtoff', e => { v25Last.dimTextOffset = !!e.target.checked; if (typeof requestRender === 'function') requestRender(); });
}

// Update v25TryHandleClick to use the latest options-bar values for anchors
const _v25_origTryHandleClick = v25TryHandleClick;
v25TryHandleClick = function(blk, cu, cv, e) {
  // Inject latest count/size/embed for anchor before delegating
  if (tool === 'v25-anchor' && v25State.dragStart) {
    // Will be handled by the main path
  }
  return _v25_origTryHandleClick(blk, cu, cv, e);
};

// Patch v25Add for anchor to use the quick-options values
const _v25_origAdd = v25Add;
v25Add = function(type, props) {
  if (type === 'anchor') {
    props = Object.assign({}, props, {
      kind: v25Last.anchor || props.kind,
      size: v25Last.anchorSize || props.size,
      count: v25Last.anchorCount || props.count || 1,
      spacing: v25Last.anchorSpacing || props.spacing || 200,
      embed: v25Last.anchorEmbed || props.embed,
    });
  }
  return _v25_origAdd(type, props);
};

// Hook: refresh quick options bar when tool changes
const _v25_origSetTool = v25SetTool;
v25SetTool = function(t) {
  _v25_origSetTool(t);
  if (typeof v25UpdateOptionsBar === 'function') v25UpdateOptionsBar();
};

