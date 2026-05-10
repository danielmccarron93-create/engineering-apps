'use strict';

// V21 inspector panel + V24.A3 orientation preview
// Extracted from dev/index.html lines 14844-15535 (2026-05-02 modular split)

// V21 INSPECTOR PANEL
// ============================================================
// Right-docked, always visible. Swaps content based on selection / tool state.
// Preserves the legacy prop* input IDs by re-creating them inside each
// dynamic render — existing updateStatus handlers keep working.

function updateInspector() {
  const body = document.getElementById('inspectorBody');
  const eye = document.getElementById('inspEyebrow');
  const h1 = document.getElementById('inspH1');
  if (!body) return;

  // V23.1 — inline connection wizard takes top priority
  if (connWizState) {
    eye.textContent = 'Connection';
    h1.textContent = connWizState.spec.title;
    body.innerHTML = _inspConnectionHtml(connWizState);
    _wireConnectionInputs();
    return;
  }

  // Tool-active state — when drawing a line / rect / etc, show tool options
  if (tool && tool !== 'select' && selected3D.length === 0) {
    eye.textContent = 'Tool';
    h1.textContent = _inspToolLabel(tool);
    body.innerHTML = _inspToolOptionsHtml();
    _wireToolOptionInputs();
    return;
  }

  // Selection state — one member
  if (selected3D.length === 1) {
    const o = selected3D[0];
    eye.textContent = (o.type || 'object').toUpperCase();
    h1.textContent = _inspMemberTitle(o);
    body.innerHTML = _inspMemberHtml(o);
    _wireMemberInputs(o);
    return;
  }
  if (selected3D.length > 1) {
    eye.textContent = 'Multiple';
    h1.textContent = `${selected3D.length} objects`;
    body.innerHTML = _inspMultiHtml();
    return;
  }

  // Empty — show sheet info
  eye.textContent = 'Sheet';
  h1.textContent = sheetInfo.drawingNo || 'Untitled';
  body.innerHTML = _inspSheetInfoHtml();
  _wireSheetInfoInputs();
}

// V23.1 — Inline connection wizard Inspector rendering.
// Renders the field list for connWizState.spec + a hint banner + Create/Cancel.
function _inspConnectionHtml(state) {
  const { spec, anchor, params } = state;
  const anchorOK = anchor && spec.requires.includes(anchor.type);

  let hintSection;
  if (!anchor) {
    hintSection = `
      <div class="insp-section">
        <div class="insp-title">Anchor</div>
        <div style="font-size:11px;color:var(--text-mute);line-height:1.4;padding:4px 0;">
          Select one ${spec.requires.map(s=>s.toUpperCase()).join(' or ')} member,
          then click the tile again.
        </div>
        <div style="font-size:10.5px;color:var(--text-subtle);font-style:italic;padding:2px 0;">
          ${spec.hint || ''}
        </div>
      </div>`;
  } else if (!anchorOK) {
    hintSection = `
      <div class="insp-section">
        <div class="insp-title">Anchor</div>
        <div style="font-size:11px;color:var(--danger,#c33);line-height:1.4;padding:4px 0;">
          ${anchor.type.toUpperCase()} selected — needs
          ${spec.requires.map(s=>s.toUpperCase()).join(' or ')}.
        </div>
      </div>`;
  } else {
    const label = `${anchor.type.toUpperCase()} ${anchor.section || ''}`.trim();
    hintSection = `
      <div class="insp-section">
        <div class="insp-title">Anchor</div>
        <div style="font-size:11.5px;color:var(--text);padding:2px 0;">${label}</div>
      </div>`;
  }

  // Field rows — two columns to stay compact
  let fieldsHtml = '';
  if (anchorOK) {
    const rows = [];
    for (let i = 0; i < spec.fields.length; i += 2) {
      const f1 = spec.fields[i], f2 = spec.fields[i + 1];
      rows.push(`<div class="insp-row">${_connFieldHtml(f1, params)}${f2 ? _connFieldHtml(f2, params) : '<div></div>'}</div>`);
    }
    fieldsHtml = `<div class="insp-section"><div class="insp-title">Parameters</div>${rows.join('')}</div>`;
  }

  const createBtnAttr = anchorOK ? '' : ' disabled style="opacity:0.5;cursor:not-allowed"';
  const btnRow = `
    <div class="insp-section">
      <div style="display:flex;gap:6px">
        <button class="insp-btn primary" id="connWizCreate"${createBtnAttr}>Create</button>
        <button class="insp-btn" id="connWizCancel">Cancel</button>
      </div>
    </div>`;

  return hintSection + fieldsHtml + btnRow;
}

function _connFieldHtml(field, params) {
  const [key, label, defaultKey, kind2] = field;
  const val = params[key] ?? CONN_DEFAULTS[defaultKey];
  if (kind2 === 'boltSelect') {
    const opts = ['M16', 'M20', 'M24'].map(b =>
      `<option${b === val ? ' selected' : ''}>${b}</option>`).join('');
    return `<div class="insp-field">
      <label>${label}</label>
      <select data-connkey="${key}" data-connkind="bolt">${opts}</select>
    </div>`;
  }
  if (kind2 === 'intSmall') {
    return `<div class="insp-field">
      <label>${label}</label>
      <input type="number" data-connkey="${key}" data-connkind="int" value="${val}" min="1" max="20" step="1">
    </div>`;
  }
  return `<div class="insp-field">
    <label>${label}</label>
    <input type="number" data-connkey="${key}" data-connkind="num" value="${val}" step="1">
  </div>`;
}

function _wireConnectionInputs() {
  if (!connWizState) return;
  const body = document.getElementById('inspectorBody');
  if (!body) return;
  body.querySelectorAll('[data-connkey]').forEach(el => {
    const key = el.dataset.connkey;
    const kind2 = el.dataset.connkind;
    const readVal = () => {
      if (kind2 === 'bolt') return el.value;
      if (kind2 === 'int') return parseInt(el.value) || 0;
      return parseFloat(el.value) || 0;
    };
    const evt = (kind2 === 'bolt') ? 'change' : 'input';
    el.addEventListener(evt, () => {
      if (!connWizState) return;
      connWizState.params[key] = readVal();
      connWizScheduleRebuild();
    });
  });
  const createBtn = document.getElementById('connWizCreate');
  if (createBtn) createBtn.addEventListener('click', () => connWizCommit());
  const cancelBtn = document.getElementById('connWizCancel');
  if (cancelBtn) cancelBtn.addEventListener('click', () => connWizCancel());
}

function _inspToolLabel(t) {
  const map = {
    line: 'Line', rect: 'Rectangle', circle: 'Circle', polyline: 'Polyline',
    dimension: 'Dimension', text: 'Text',
    'draw-member': 'Place Member', 'draw-plate': 'Draw Plate',
    'draw-weld': 'Weld Symbol', 'draw-centreline': 'Centreline',
    'draw-breakline': 'Break Line', 'draw-slot': 'Slotted Hole',
    'draw-sectionmark': 'Section Mark', 'place-member-tag': 'Member Tag',
    'place-bolt-callout': 'Bolt Callout', 'place-material-tag': 'Material Tag',
    'place-rev-triangle': 'Revision Triangle', 'draw-rev-cloud': 'Revision Cloud',
    'place-detail-ref': 'Detail Reference', 'draw-detail-card': 'Detail Card',
    mirror: 'Mirror',
  };
  return map[t] || t;
}

function _inspMemberTitle(o) {
  if (o.type === 'ub' || o.type === 'uc' || o.type === 'shs') return o.section || o.type.toUpperCase();
  if (o.type === 'bolt') return o.boltSize || 'M20 Bolt';
  if (o.type === 'plate') return `PL ${o.pt || 10} THK`;
  return o.type || 'Object';
}

function _inspSheetInfoHtml() {
  const fv = f => (sheetInfo[f] || '').replace(/"/g, '&quot;');
  return `
    <div class="insp-section">
      <div class="insp-title">Project</div>
      <div class="insp-field"><label>Project</label><input id="tbProject" value="${fv('project')}"></div>
      <div class="insp-field"><label>Client</label><input id="tbClient" value="${fv('client')}"></div>
      <div class="insp-field"><label>Description</label><input id="tbDescription" value="${fv('description')}"></div>
    </div>
    <div class="insp-section">
      <div class="insp-title">Drawing</div>
      <div class="insp-row triple">
        <div class="insp-field"><label>Drawing No</label><input id="tbDrawingNo" value="${fv('drawingNo')}"></div>
        <div class="insp-field"><label>Rev</label><input id="tbRevision" value="${fv('revision')}"></div>
        <div class="insp-field"><label>Sheet</label><input id="tbSheetOf" value="${fv('sheetOf')}" placeholder="1 of 1"></div>
      </div>
      <div class="insp-field"><label>Date</label><input id="tbDate" type="date" value="${fv('date')}"></div>
    </div>
    <div class="insp-section">
      <div class="insp-title">People</div>
      <div class="insp-row triple">
        <div class="insp-field"><label>Designer</label><input id="tbDesigner" value="${fv('designer')}"></div>
        <div class="insp-field"><label>Drawn</label><input id="tbDrawnBy" value="${fv('drawnBy')}"></div>
        <div class="insp-field"><label>Checker</label><input id="tbChecker" value="${fv('checker')}"></div>
      </div>
    </div>
    <div class="insp-section">
      <div class="insp-title">Firm</div>
      <div class="insp-field"><label>Name</label><input id="tbFirmName" value="${fv('firmName')}"></div>
      <div class="insp-field"><label>Tagline</label><input id="tbFirmTagline" value="${fv('firmTagline')}"></div>
    </div>
  `;
}

function _wireSheetInfoInputs() {
  const fields = [
    ['tbProject', 'project'], ['tbClient', 'client'], ['tbDescription', 'description'],
    ['tbDrawingNo', 'drawingNo'], ['tbRevision', 'revision'], ['tbDate', 'date'],
    ['tbSheetOf', 'sheetOf'], ['tbDesigner', 'designer'], ['tbDrawnBy', 'drawnBy'],
    ['tbChecker', 'checker'], ['tbFirmName', 'firmName'], ['tbFirmTagline', 'firmTagline'],
  ];
  for (const [id, key] of fields) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.addEventListener('change', () => {
      sheetInfo[key] = el.value;
      if (typeof _projectSnapshotActive === 'function') _projectSnapshotActive();
      if (typeof renderSheetBrowser === 'function') renderSheetBrowser();
      // Update inspector header too
      const h1 = document.getElementById('inspH1');
      if (h1) h1.textContent = sheetInfo.drawingNo || 'Untitled';
      requestRender();
    });
  }
}

// V24.A3 — Inspector orientation preview. Two small SVGs side-by-side:
//   Side view — horizontal bar / vertical bar / into-page glyph per axis
//   End view  — the member's section icon, rotated by roll°
// Purpose: give the user immediate visual confirmation of the current frame
// without having to mentally translate "Y-axis, roll 90°" into a picture.
function _inspOrientationPreviewSVG(o) {
  const preset = (o.axis && o.up)
    ? presetFromFrame(memberFrame(o))
    : { axisLetter: 'X', dir: 1, rollDeg: Math.round((o.rot || 0) / 90) * 90 % 360 };

  const axisColor = preset.axisLetter === 'X' ? '#e74c3c'
                  : preset.axisLetter === 'Y' ? '#27ae60'
                  : '#3498db';

  // --- Side view ----------------------------------------------------------
  // Shows whether the member is horizontal (X), vertical (Y) or pointing
  // into/out of the page (Z).
  let sideView;
  if (preset.axisLetter === 'X') {
    // Horizontal beam — long rectangle
    sideView = `
      <rect x="3" y="12" width="24" height="6" fill="${axisColor}" fill-opacity="0.25" stroke="${axisColor}" stroke-width="1.2"/>
      <line x1="15" y1="15" x2="26" y2="15" stroke="${axisColor}" stroke-width="1" marker-end="url(#op_arrow_${preset.axisLetter})"/>
    `;
  } else if (preset.axisLetter === 'Y') {
    // Vertical column
    sideView = `
      <rect x="12" y="3" width="6" height="24" fill="${axisColor}" fill-opacity="0.25" stroke="${axisColor}" stroke-width="1.2"/>
      <line x1="15" y1="15" x2="15" y2="4" stroke="${axisColor}" stroke-width="1" marker-end="url(#op_arrow_${preset.axisLetter})"/>
    `;
  } else {
    // Z-axis — show as circle with × (into page, dir=-1) or dot (out of page, dir=+1)
    const glyph = preset.dir > 0
      ? `<circle cx="15" cy="15" r="3" fill="${axisColor}"/>`
      : `<line x1="10" y1="10" x2="20" y2="20" stroke="${axisColor}" stroke-width="1.5"/>
         <line x1="20" y1="10" x2="10" y2="20" stroke="${axisColor}" stroke-width="1.5"/>`;
    sideView = `
      <circle cx="15" cy="15" r="8" fill="${axisColor}" fill-opacity="0.15" stroke="${axisColor}" stroke-width="1.2"/>
      ${glyph}
    `;
  }

  // --- End view -----------------------------------------------------------
  // The section icon rotated by roll. For symmetric sections (SHS, CHS)
  // the rotation is invisible — that's fine, there's nothing to indicate.
  const iconId = 'icon-' + o.type;
  const endView = `
    <g transform="rotate(${preset.rollDeg} 15 15)">
      <use href="#${iconId}" x="5" y="5" width="20" height="20"/>
    </g>
  `;

  // Arrowhead marker (axis-coloured) — scoped per axis so colour is right.
  const arrowDefs = `
    <defs>
      <marker id="op_arrow_X" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
        <path d="M0,0 L10,5 L0,10 Z" fill="#e74c3c"/>
      </marker>
      <marker id="op_arrow_Y" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
        <path d="M0,0 L10,5 L0,10 Z" fill="#27ae60"/>
      </marker>
    </defs>
  `;

  const axisLabel = (preset.dir > 0 ? '+' : '−') + preset.axisLetter;

  return `
    <div id="orientPreview" class="orient-preview"
         style="display:flex;gap:8px;margin-top:6px;padding:8px 6px;background:var(--surface-3);border:1px solid var(--border);border-radius:4px;justify-content:center;align-items:center;">
      <div style="display:flex;flex-direction:column;align-items:center;gap:3px;">
        <svg width="36" height="36" viewBox="0 0 30 30" style="color:var(--text);">
          ${arrowDefs}
          ${sideView}
        </svg>
        <span style="font-size:9.5px;color:var(--text-mute);letter-spacing:0.3px;">Side · ${axisLabel}</span>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:3px;">
        <svg width="36" height="36" viewBox="0 0 30 30" style="color:var(--text);">
          ${endView}
        </svg>
        <span style="font-size:9.5px;color:var(--text-mute);letter-spacing:0.3px;">End · ${preset.rollDeg}°</span>
      </div>
    </div>
  `;
}

function _inspMemberHtml(o) {
  const rot = (o.rot || 0).toFixed(1);
  const len = o.length ? o.length.toFixed(0) : '';
  const x = (o.x || 0).toFixed(1), y = (o.y || 0).toFixed(1), z = (o.z || 0).toFixed(1);
  let sizeRow = '';
  if (isMemberType(o.type)) {
    // Section dropdown + floating-picker button (mirrors the v25-mem options bar UX).
    const sectionNames = _memberSectionNames(o.type);
    const cur = o.section || '';
    const opts = (cur && !sectionNames.includes(cur))
      ? `<option value="${cur}" selected>${cur}</option>`
      : '';
    const optsList = sectionNames
      .map(s => `<option value="${s}"${s === cur ? ' selected' : ''}>${s}</option>`)
      .join('');
    sizeRow = `<div class="insp-field">
      <label>Section</label>
      <div style="display:flex;gap:4px;align-items:center;">
        <select id="propSectionSelect" style="flex:1;min-width:0">${opts}${optsList}</select>
        <button type="button" id="propSectionPick" class="insp-btn" style="flex:0 0 auto;height:24px;padding:0 8px;font-size:11px;">Pick…</button>
      </div>
    </div>`;
  } else if (o.type === 'bolt') {
    sizeRow = `<div class="insp-field"><label>Size</label><select id="propBoltSize">${
      Object.keys(BOLT_DB).map(b => `<option ${b === o.boltSize ? 'selected' : ''}>${b}</option>`).join('')
    }</select></div>`;
  } else if (o.type === 'plate') {
    sizeRow = `<div class="insp-field"><label>Thickness (mm)</label><input type="number" id="propPt" value="${o.pt || 10}"></div>`;
  }
  const isMember = isMemberType(o.type);
  const lengthRow = isMember
    ? `<div class="insp-field"><label>Length (mm)</label><input type="number" id="propLen" value="${len}" step="10"></div>`
    : '';

  // V24 Phase A — 3D orientation fields. For non-member objects (plates /
  // bolts) keep the legacy single rotation input.
  let orientRow;
  if (isMember) {
    const preset = (o.axis && o.up)
      ? presetFromFrame(memberFrame(o))
      : { axisLetter: 'X', dir: 1, rollDeg: Math.round((o.rot || 0) / 90) * 90 % 360, exact: true };
    const opt = (val, cur, label) =>
      `<option value="${val}"${val == cur ? ' selected' : ''}>${label || val}</option>`;
    orientRow = `
      <div class="insp-row triple">
        <div class="insp-field">
          <label>Axis</label>
          <select id="propAxisLetter">
            ${opt('X', preset.axisLetter)}${opt('Y', preset.axisLetter)}${opt('Z', preset.axisLetter)}
          </select>
        </div>
        <div class="insp-field">
          <label>Dir</label>
          <select id="propAxisDir">
            ${opt(1, preset.dir, '+')}${opt(-1, preset.dir, '−')}
          </select>
        </div>
        <div class="insp-field">
          <label>Roll (°)</label>
          <select id="propRoll">
            ${opt(0, preset.rollDeg)}${opt(90, preset.rollDeg)}${opt(180, preset.rollDeg)}${opt(270, preset.rollDeg)}
          </select>
        </div>
      </div>
      ${_inspOrientationPreviewSVG(o)}
      ${preset.exact === false
        ? `<div id="offPresetWarn" style="font-size:10px;color:var(--warn,#c77a00);margin-top:4px;text-align:center;letter-spacing:0.2px;">
             ⚠ Custom rotation — dropdowns show nearest preset
           </div>`
        : ''}
      <div style="font-size:10px;color:var(--text-mute);margin-top:4px;text-align:center;letter-spacing:0.2px;">
        <kbd style="font-size:9.5px;padding:0 3px;border:1px solid var(--border);border-radius:2px;">R</kbd> roll +90°
        &nbsp; <kbd style="font-size:9.5px;padding:0 3px;border:1px solid var(--border);border-radius:2px;">⇧R</kbd> −90°
        &nbsp; <kbd style="font-size:9.5px;padding:0 3px;border:1px solid var(--border);border-radius:2px;">⌥R</kbd> flip
      </div>
      <div class="insp-section" style="margin-top:10px;padding-top:8px;border-top:1px dashed var(--border);">
        <div class="insp-title" style="font-size:10.5px;">Free tilt</div>
        <div style="display:flex;gap:6px;align-items:flex-end;margin-bottom:5px;">
          <div class="insp-field" style="flex:1;margin-bottom:0;">
            <label>Elev (° about Z)</label>
            <input type="number" id="propTiltZ" value="0" step="5">
          </div>
          <button class="insp-btn" id="btnTiltZ" style="flex:0 0 auto;height:24px;padding:0 8px;">Apply</button>
        </div>
        <div style="display:flex;gap:6px;align-items:flex-end;">
          <div class="insp-field" style="flex:1;margin-bottom:0;">
            <label>Plan (° about Y)</label>
            <input type="number" id="propTiltY" value="0" step="5">
          </div>
          <button class="insp-btn" id="btnTiltY" style="flex:0 0 auto;height:24px;padding:0 8px;">Apply</button>
        </div>
        <div style="font-size:10px;color:var(--text-mute);margin-top:5px;text-align:center;letter-spacing:0.2px;">
          <kbd style="font-size:9.5px;padding:0 3px;border:1px solid var(--border);border-radius:2px;">T</kbd> elev tilt
          &nbsp; <kbd style="font-size:9.5px;padding:0 3px;border:1px solid var(--border);border-radius:2px;">⇧T</kbd> plan tilt
        </div>
      </div>
      <input type="hidden" id="propRot" value="${rot}">`;
  } else {
    orientRow = `<div class="insp-field"><label>Rotation (°)</label><input type="number" id="propRot" value="${rot}" step="1"></div>`;
  }

  // Appearance — opacity & shading sliders. Defaults: opacity 1, shading 1
  // (i.e. unchanged behaviour). Members read both from o.opacity / o.shading.
  const op  = (o.opacity  == null) ? 1 : Math.max(0, Math.min(1, +o.opacity));
  const sh  = (o.shading  == null) ? 1 : Math.max(0, Math.min(1, +o.shading));
  const opPct = Math.round(op * 100);
  const shPct = Math.round(sh * 100);
  const appearanceRow = `
    <div class="insp-section">
      <div class="insp-title">Appearance</div>
      <div class="insp-field">
        <label>Opacity <span id="propOpacityVal" style="float:right;color:var(--text-mute);">${opPct}%</span></label>
        <input type="range" id="propOpacity" min="0" max="100" step="1" value="${opPct}" style="width:100%;">
      </div>
      <div class="insp-field">
        <label>Shading <span id="propShadingVal" style="float:right;color:var(--text-mute);">${shPct}%</span></label>
        <input type="range" id="propShading" min="0" max="100" step="1" value="${shPct}" style="width:100%;">
      </div>
    </div>`;

  return `
    <div class="insp-section">
      <div class="insp-title">Geometry</div>
      ${sizeRow}
      ${lengthRow}
      ${orientRow}
    </div>
    <div class="insp-section">
      <div class="insp-title">Position</div>
      <div class="insp-row">
        <div class="insp-field"><label>X</label><input type="number" id="propX" value="${x}" step="1"></div>
        <div class="insp-field"><label>Y</label><input type="number" id="propY" value="${y}" step="1"></div>
        <div class="insp-field"><label>Z</label><input type="number" id="propZ" value="${z}" step="1"></div>
      </div>
    </div>
    ${appearanceRow}
    <div class="insp-section">
      <div style="display:flex;gap:6px">
        <button class="insp-btn" id="inspDup">Duplicate</button>
        <button class="insp-btn danger" id="inspDel">Delete</button>
      </div>
    </div>
  `;
}

// V25-layout-overhaul Phase 6.1 — section list for the Inspector dropdown.
// UB type covers both UB and UC sections (UC_DB merged into UB_DB at module
// load); other types come from their dedicated DBs.
function _memberSectionNames(type) {
  if (type === 'ub')  return Object.keys(UB_DB || {});
  if (type === 'shs') return Object.keys(SHS_DB || {});
  if (type === 'pfc') return Object.keys((typeof PFC_DB === 'object') ? PFC_DB : {});
  if (type === 'rhs') return Object.keys((typeof RHS_DB === 'object') ? RHS_DB : {});
  if (type === 'chs') return Object.keys((typeof CHS_DB === 'object') ? CHS_DB : {});
  if (type === 'ea')  return Object.keys((typeof EA_DB  === 'object') ? EA_DB  : {});
  if (type === 'ua')  return Object.keys((typeof UA_DB  === 'object') ? UA_DB  : {});
  return [];
}

function _wireMemberInputs(o) {
  const bind = (id, cb) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => { cb(el); requestRender(); });
  };
  bind('propX', el => { o.x = parseFloat(el.value) || 0; });
  bind('propY', el => { o.y = parseFloat(el.value) || 0; });
  bind('propZ', el => { o.z = parseFloat(el.value) || 0; });
  bind('propRot', el => { o.rot = parseFloat(el.value) || 0; });
  bind('propLen', el => { o.length = parseFloat(el.value) || o.length; });
  bind('propBoltSize', el => { o.boltSize = el.value; });
  bind('propPt', el => { o.pt = parseFloat(el.value) || o.pt; });

  // V25-layout-overhaul Phase 6.1 — section dropdown + Pick… launcher.
  // Both update the selected member's section property and trigger a re-render.
  const setSection = (name) => {
    if (!name) return;
    o.section = name;
    if (typeof v3dMarkDirty === 'function') v3dMarkDirty();
    if (typeof invalidateWeldCache === 'function') invalidateWeldCache();
    requestRender();
  };
  const secSel = document.getElementById('propSectionSelect');
  if (secSel) secSel.addEventListener('change', () => setSection(secSel.value));
  const secPick = document.getElementById('propSectionPick');
  if (secPick && typeof openSizePicker === 'function') {
    secPick.addEventListener('click', (ev) => {
      ev.stopPropagation();
      // Map member type → picker kind. UB picker only lists UB; UC sections
      // live in their own list. We pick whichever matches the *current*
      // section name so a UC member opens the UC picker.
      let kind = o.type;
      if (kind === 'ub' && /UC/.test(o.section || '')) kind = 'uc';
      openSizePicker(kind, 'inspector-' + kind, {
        anchor: secPick,
        title: 'Pick ' + kind.toUpperCase() + ' size',
        onChoose: (name) => {
          setSection(name);
          if (typeof updateInspector === 'function') updateInspector();
        },
      });
    });
  }

  // V25-layout-overhaul Phase 6.1 — Appearance sliders.
  // Opacity multiplies the member's globalAlpha at draw time (0 = invisible,
  // 1 = fully opaque). Shading scales the per-renderer fill alpha.
  const opSlider = document.getElementById('propOpacity');
  const opLabel  = document.getElementById('propOpacityVal');
  if (opSlider) opSlider.addEventListener('input', () => {
    const v = Math.max(0, Math.min(100, parseInt(opSlider.value, 10) || 0));
    o.opacity = v / 100;
    if (opLabel) opLabel.textContent = v + '%';
    if (typeof v3dMarkDirty === 'function') v3dMarkDirty();
    requestRender();
  });
  const shSlider = document.getElementById('propShading');
  const shLabel  = document.getElementById('propShadingVal');
  if (shSlider) shSlider.addEventListener('input', () => {
    const v = Math.max(0, Math.min(100, parseInt(shSlider.value, 10) || 0));
    o.shading = v / 100;
    if (shLabel) shLabel.textContent = v + '%';
    if (typeof v3dMarkDirty === 'function') v3dMarkDirty();
    requestRender();
  });

  // V24 Phase A — orientation dropdowns (members only). Any of the three
  // changes rebuilds the 3D frame from the current preset.
  // V24.A3 — also does a targeted refresh of the orientation preview SVG so
  // the user sees their change reflected visually without losing dropdown focus.
  const rebuildFrame = () => {
    const axisEl = document.getElementById('propAxisLetter');
    const dirEl  = document.getElementById('propAxisDir');
    const rollEl = document.getElementById('propRoll');
    if (!axisEl || !dirEl || !rollEl) return;
    const axisLetter = axisEl.value;
    const dir = parseInt(dirEl.value) || 1;
    const rollDeg = parseInt(rollEl.value) || 0;
    setMemberFrameFromPreset(o, axisLetter, dir, rollDeg);
    if (typeof v3dMarkDirty === 'function') v3dMarkDirty();
    if (typeof invalidateWeldCache === 'function') invalidateWeldCache();
    // Targeted refresh of the preview — avoids rebuilding whole Inspector
    // which would reset dropdown focus.
    const oldPrev = document.getElementById('orientPreview');
    if (oldPrev) {
      const tmp = document.createElement('div');
      tmp.innerHTML = _inspOrientationPreviewSVG(o);
      const fresh = tmp.firstElementChild;
      if (fresh) oldPrev.replaceWith(fresh);
    }
    requestRender();
  };
  ['propAxisLetter', 'propAxisDir', 'propRoll'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', rebuildFrame);
  });

  // V24.A4 — Free tilt Apply buttons. Rotates every selected member (or just
  // `o` if nothing else is selected) about world Z / world Y by the entered
  // angle, then resets the input to 0 so subsequent applies compose.
  const applyTilt = (worldAxisLetter, inputId) => {
    const el = document.getElementById(inputId);
    if (!el) return;
    const angle = parseFloat(el.value);
    if (!angle || isNaN(angle)) return;
    const targets = (Array.isArray(selected3D) && selected3D.length > 0) ? selected3D : [o];
    const members = targets.filter(t => isMemberType(t.type));
    if (members.length === 0) return;
    const before = members.map(t => JSON.parse(JSON.stringify(t)));
    members.forEach(t => _applyMemberTilt(t, worldAxisLetter, angle));
    const after = members.map(t => JSON.parse(JSON.stringify(t)));
    undoStack.push({ act: 'moveObj', before, after });
    if (undoStack.length > 100) undoStack.shift();
    redoStack = [];
    if (typeof v3dMarkDirty === 'function') v3dMarkDirty();
    if (typeof invalidateWeldCache === 'function') invalidateWeldCache();
    el.value = 0;
    // Full Inspector rebuild — preset dropdowns may change (nearest preset
    // recomputed) and the off-preset warning needs to appear/disappear.
    if (typeof updateInspector === 'function') updateInspector();
    requestRender();
  };
  const btnZ = document.getElementById('btnTiltZ');
  if (btnZ) btnZ.addEventListener('click', () => applyTilt('Z', 'propTiltZ'));
  const btnY = document.getElementById('btnTiltY');
  if (btnY) btnY.addEventListener('click', () => applyTilt('Y', 'propTiltY'));

  const dup = document.getElementById('inspDup');
  if (dup) dup.addEventListener('click', () => {
    const copy = JSON.parse(JSON.stringify(o));
    delete copy.id;
    copy.x = (copy.x || 0) + 50;
    addObj(mkObj(copy.type, copy));
    requestRender();
  });
  const del = document.getElementById('inspDel');
  if (del) del.addEventListener('click', () => {
    delObj(o.id);
    selected3D = [];
    requestRender();
  });
}

function _inspMultiHtml() {
  const types = {};
  for (const o of selected3D) types[o.type] = (types[o.type] || 0) + 1;
  const rows = Object.entries(types).map(([k, v]) => `<div style="font-size:11px;color:var(--text-mute);padding:2px 0">${v}× ${k}</div>`).join('');
  return `
    <div class="insp-section">
      <div class="insp-title">Composition</div>
      ${rows}
    </div>
    <div class="insp-section">
      <div style="display:flex;gap:6px">
        <button class="insp-btn danger" id="inspDelAll">Delete all</button>
      </div>
    </div>
  `;
}

function _inspToolOptionsHtml() {
  return `
    <div class="insp-section">
      <div class="insp-title">Tool options</div>
      <div class="insp-field">
        <label>Layer</label>
        <select id="propLayer">
          <option value="0">Default</option>
          <option value="OUTLINE">Outline</option>
          <option value="HIDDEN">Hidden</option>
          <option value="CENTRE">Centre</option>
          <option value="DIMENSION">Dimension</option>
        </select>
      </div>
      <div class="insp-field">
        <label>Lineweight</label>
        <select id="propLineweight">
          <option value="0.18">0.18 mm</option>
          <option value="0.30">0.30 mm</option>
          <option value="0.40">0.40 mm</option>
          <option value="0.50">0.50 mm</option>
          <option value="0.65" selected>0.65 mm</option>
          <option value="0.70">0.70 mm</option>
          <option value="1.20">1.20 mm</option>
        </select>
      </div>
      <div class="insp-field">
        <label>Line style</label>
        <select id="propLinestyle">
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
          <option value="centre">Centre</option>
        </select>
      </div>
    </div>
    <div class="insp-section">
      <div style="font-size:11px;color:var(--text-mute);line-height:1.5">
        Press <kbd style="padding:1px 5px;border:1px solid var(--border);border-radius:3px;font-size:10px;background:var(--surface-3)">Esc</kbd> to cancel the current tool.
      </div>
    </div>
  `;
}

function _wireToolOptionInputs() {
  // Options store — not hooked into entity creation yet; planned V22.
}

