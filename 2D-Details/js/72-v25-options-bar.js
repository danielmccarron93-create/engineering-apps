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
function v25UpdateOptionsBar() {
  const bar = v25BuildOptionsBar();
  // Fix G + H (2026-05-23): v2 PlacePlateTool — show Thickness + Orientation
  // chips. Thickness is greyed when Orientation is Vertical (free-draw mode
  // — the user defines the visible face dimensions, thickness is metadata).
  // Mode (rect vs poly) is now auto-detected from drag-vs-click, so no chip.
  const v2Tool = (window.v2 && v2.engine && typeof v2.engine.activeTool === 'function')
    ? v2.engine.activeTool() : null;
  if (sheetMode === '2d' && v2Tool && v2Tool.id === 'place-plate') {
    bar.style.display = 'flex';
    const ui = (v2.appState && v2.appState.ui) || {};
    const orientation = (ui.activePlateOrientation === 'horizontal') ? 'horizontal' : 'vertical';
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
    const thkDisabled = (orientation === 'vertical');
    const thkOptions = plateTypes.map(function (t) {
      return '<option value="' + t.id + '"' + (t.id === activeType ? ' selected' : '') +
             '>' + t.thickness + ' mm</option>';
    }).join('');
    const help = (orientation === 'horizontal')
      ? 'Click start · click / drag end · cursor side sets thickness direction · Esc cancels'
      : 'Drag = rectangle · click (no drag) = polygon · Shift = free-angle in poly · Esc cancels';
    bar.innerHTML =
      '<strong>Plate (v2)</strong>' +
      '<label style="display:flex;align-items:center;gap:4px"' +
        (thkDisabled ? ' title="Thickness only applies to Horizontal cleats — Vertical plates are free-drawn"' : '') +
        '>' +
        '<span style="color:var(--text-mute);font-size:11px' + (thkDisabled ? ';opacity:0.5' : '') + '">Thickness</span>' +
        '<select id="v2plate-thickness"' + (thkDisabled ? ' disabled style="opacity:0.5;cursor:not-allowed"' : '') + '>' +
          thkOptions +
        '</select>' +
      '</label>' +
      '<label style="display:flex;align-items:center;gap:4px">' +
        '<span style="color:var(--text-mute);font-size:11px">Orientation</span>' +
        '<select id="v2plate-orientation">' +
          '<option value="vertical"' + (orientation === 'vertical' ? ' selected' : '') + '>Vertical</option>' +
          '<option value="horizontal"' + (orientation === 'horizontal' ? ' selected' : '') + '>Horizontal</option>' +
        '</select>' +
      '</label>' +
      '<span style="color:var(--text-mute);font-size:11px">' + help + '</span>';
    const thkSel = bar.querySelector('#v2plate-thickness');
    if (thkSel) thkSel.addEventListener('change', function (e) {
      if (!v2.appState.ui) v2.appState.ui = {};
      v2.appState.ui.activePlateType = e.target.value;
      if (typeof requestRender === 'function') requestRender();
    });
    const orSel = bar.querySelector('#v2plate-orientation');
    if (orSel) orSel.addEventListener('change', function (e) {
      if (!v2.appState.ui) v2.appState.ui = {};
      v2.appState.ui.activePlateOrientation = e.target.value;
      // Reset the in-flight tool state (anchor / poly) so switching orientation
      // mid-placement doesn't leave half-built geometry behind.
      if (v2.appState.tools && v2.appState.tools['place-plate']) {
        const slot = v2.appState.tools['place-plate'];
        slot.mode = 'rect';
        slot.anchor = null;
        slot.anchorPx = null;
        slot.poly = [];
        slot.preview = null;
      }
      if (typeof requestRender === 'function') requestRender();
      if (typeof v25UpdateOptionsBar === 'function') v25UpdateOptionsBar();
      if (typeof updateStatus === 'function') updateStatus();
    });
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
      html += fld('Grout', `<input id="v25o-wallgrout" type="checkbox"${v25Last.wallGrouted?' checked':''}/>`);
      html += `<span style="color:var(--text-mute);font-size:11px">Click start · click end · Shift = free angle</span>`;
    } else {
      html += `<span style="color:var(--text-mute);font-size:11px">Drag two corners · edges hard (double-click an edge to break it after placing)</span>`;
    }
  } else if (tool === 'v25-bar' || tool === 'v25-bar-dot') {
    html += `<strong>Reinforcement</strong>`;
    html += fld('Bar', `<select id="v25o-bar">${Object.keys(V25_REO_DB.bars).map(k => `<option ${k === v25Last.reoBar ? 'selected' : ''}>${k}</option>`).join('')}</select>`);
  } else if (tool === 'v25-mesh') {
    html += `<strong>Mesh</strong>`;
    html += fld('Mesh', `<select id="v25o-mesh">${Object.keys(V25_REO_DB.meshes).map(k => `<option ${k === v25Last.mesh ? 'selected' : ''}>${k}</option>`).join('')}</select>`);
  } else if (tool === 'v25-mem') {
    const mt = v25State.memberType || 'ub';
    const memberLabel = mt.toUpperCase();
    const dbS = mt === 'ub' ? UB_DB
              : mt === 'uc' ? (typeof UC_DB === 'object' ? UC_DB : UB_DB)
              : mt === 'wb' ? (typeof WB_DB === 'object' ? WB_DB : UB_DB)
              : mt === 'shs' ? SHS_DB
              : mt === 'rhs' ? (typeof RHS_DB === 'object' ? RHS_DB : {})
              : mt === 'chs' ? (typeof CHS_DB === 'object' ? CHS_DB : {})
              : mt === 'pfc' ? (typeof PFC_DB === 'object' ? PFC_DB : {})
              : {};
    let sectionNames = Object.keys(dbS || {});
    if (mt === 'ub') sectionNames = sectionNames.filter(n => n.includes('UB'));
    if (mt === 'uc') sectionNames = (typeof UC_DB === 'object') ? Object.keys(UC_DB) : sectionNames.filter(n => n.includes('UC'));
    if (mt === 'wb') sectionNames = (typeof WB_DB === 'object') ? Object.keys(WB_DB) : sectionNames.filter(n => n.includes('WB'));
    const curSec = v25State.section || '';
    html += `<strong>${memberLabel}</strong>`;
    html += fld('Section',
      `<select id="v25o-sect" style="width:160px">` +
      (curSec && !sectionNames.includes(curSec) ? `<option value="${curSec}" selected>${curSec}</option>` : '') +
      sectionNames.map(s => `<option value="${s}"${s === curSec ? ' selected' : ''}>${s}</option>`).join('') +
      `</select>` +
      ` <button id="v25o-sect-pick" type="button" style="padding:2px 8px;font-size:11px;border:1px solid var(--border);background:var(--surface-3);color:var(--text);border-radius:4px;cursor:pointer">Pick…</button>`
    );
    // Orientation row replaces the old Aspect + PFC Open-face dropdowns. It is
    // built as a live DOM element (its buttons carry click handlers) so it
    // can't be serialised into this innerHTML string — emit a placeholder span
    // here and swap in the real row after bar.innerHTML is set (see below).
    html += fld('Orientation', `<span id="v25OrientSlot"></span>`);
  // v1 V25 plate options (Aspect / Thk) retired by architecture-v2 Phase 2.
  // v2 plate placement options will land on the v2 inspector + size picker
  // when Phase 11+ stands up the standalone v2 BB-rail.
  } else if (tool === 'v25-leader') {
    html += `<strong>Leader</strong>`;
    html += fld('Default text', `<input id="v25o-leadertxt" value="${(v25Last.leaderText || 'CALLOUT').replace(/"/g, '&quot;')}" style="width:200px"/>`);
  } else if (tool === 'v25-frame') {
    html += `<strong>Detail frame</strong> — drag two corners`;
  } else if (tool === 'v25-line') {
    html += `<strong>Polyline</strong>`;
    html += fld('Lineweight (mm)', `<input id="v25o-linelw" type="number" step="0.05" value="${v25Last.lineLw || 0.35}" style="width:60px"/>`);
    html += fld('Style', `<select id="v25o-linels"><option value="solid"${(v25Last.lineLs||'solid')==='solid'?' selected':''}>solid</option><option value="dotted"${v25Last.lineLs==='dotted'?' selected':''}>dotted</option><option value="dashed"${v25Last.lineLs==='dashed'?' selected':''}>dashed</option><option value="centre"${v25Last.lineLs==='centre'?' selected':''}>centre</option><option value="phantom"${v25Last.lineLs==='phantom'?' selected':''}>phantom</option></select>`);
    html += `<span style="color:var(--text-mute);font-size:11px">Click to add points · Enter / right-click to finish · Shift bypasses ortho</span>`;
  } else if (tool === 'v25-text') {
    html += `<strong>Text</strong>`;
    html += fld('Default text', `<input id="v25o-textdef" value="${(v25Last.textDefault || 'TEXT').replace(/"/g, '&quot;')}" style="width:200px"/>`);
    html += fld('Size (mm)', `<input id="v25o-textsz" type="number" step="0.5" value="${v25Last.textSize || 3}" style="width:60px"/>`);
  } else if (tool === 'v25-notebox') {
    html += (typeof nbOptionsBarHTML === 'function') ? nbOptionsBarHTML() : '<strong>Note</strong>';
  }
  bar.innerHTML = html + ` <span style="color:var(--text-mute);margin-left:8px;font-size:11px">Esc to cancel</span>`;

  if (tool === 'v25-notebox' && typeof nbBindOptionsBar === 'function') nbBindOptionsBar(bar);

  // Swap the orientation-row placeholder for the live element (built with click
  // handlers, so it can't live inside the innerHTML string). mt is out of scope
  // here, so re-read the active member type from v25State.
  if (tool === 'v25-mem') {
    const slot = bar.querySelector('#v25OrientSlot');
    if (slot && typeof v25BuildOrientationRow === 'function') {
      slot.replaceWith(v25BuildOrientationRow(v25State.memberType || 'ub'));
    }
  }
  // Swap the blockwork View placeholder for the live Section/Elevation row.
  if (tool === 'v25-wall' || tool === 'v25-wall-sec') {
    const slot = bar.querySelector('#v25WallModeSlot');
    if (slot && typeof v25BuildWallModeRow === 'function') {
      slot.replaceWith(v25BuildWallModeRow());
    }
  }

  // Wire change events
  const wire = (id, fn) => { const el = bar.querySelector('#' + id); if (el) el.addEventListener('change', fn); };
  wire('v25o-kind', e => { v25Last.anchor = e.target.value; const d = V25_ANCHOR_DB[v25Last.anchor]; v25Last.anchorSize = d.defaults.size; v25Last.anchorEmbed = d.defaults.embed; v25UpdateOptionsBar(); });
  wire('v25o-size', e => { v25Last.anchorSize = e.target.value; });
  wire('v25o-count', e => { v25Last.anchorCount = parseInt(e.target.value) || 1; });
  wire('v25o-spacing', e => { v25Last.anchorSpacing = parseInt(e.target.value) || 200; });
  wire('v25o-embed', e => { v25Last.anchorEmbed = parseInt(e.target.value) || 100; });
  wire('v25o-mat', e => { v25Last.material = e.target.value; });
  wire('v25o-block', e => { v25Last.blockThk = e.target.value; });
  wire('v25o-wallend', e => { v25Last.wallEnd = e.target.value; });
  wire('v25o-wallgrout', e => { v25Last.wallGrouted = e.target.checked; });
  wire('v25o-bar', e => { v25Last.reoBar = e.target.value; });
  wire('v25o-mesh', e => { v25Last.mesh = e.target.value; });
  wire('v25o-sect', e => {
    v25State.section = e.target.value;
    if (v25State.memberType) lastUsedSection[v25State.memberType] = v25State.section;
    if (typeof populateTilePalette === 'function') populateTilePalette();
    if (typeof highlightActiveTile === 'function') highlightActiveTile();
  });
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
  wireInput('v25o-linelw', e => { v25Last.lineLw = parseFloat(e.target.value) || 0.35; });
  wireInput('v25o-linels', e => { v25Last.lineLs = e.target.value; });
  wireInput('v25o-textdef', e => { v25Last.textDefault = e.target.value; });
  wireInput('v25o-textsz', e => { v25Last.textSize = parseFloat(e.target.value) || 3; });
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

