'use strict';

// V16 connection builders (cap plate / baseplate / splice / WSP / etc.)
// Extracted from dev/index.html lines 13358-13899 (2026-05-02 modular split)

// CONNECTION BUILDERS (V16, drafter §9.x)
// ============================================================
// Parametric steel connection library. Each builder is a PURE function that
// takes an anchor object (beam / column) + parameter object and returns
// `{ objs, ents }` to be committed atomically via placeConnection().
//
// Workflow:
//   1. User picks a library item → openConnectionDialog(kind) shown
//   2. On OK, dispatcher calls build<Kind>(anchor, params) → { objs, ents }
//   3. placeConnection(result) pushes all additions into the global model and
//      records ONE undo action — so Ctrl+Z removes the whole connection in a
//      single step (not bolt-by-bolt-by-plate-by-weld).
// Dimensions and material-tag labels are emitted as 2D entities on the
// elevation view for immediate drafter-readable output.

// ---- Lookup helpers ----
function _connGetSectionDims(obj) {
  // Returns { b, d, tf, tw } in mm for a UB/UC/SHS. `b` = flange width /
  // SHS face width; `d` = total depth / SHS face depth.
  if (obj.type === 'ub') {
    const s = UB_DB[obj.section] || UC_DB[obj.section];
    return s ? { b: s.bf, d: s.d, tf: s.tf, tw: s.tw } : { b: 200, d: 300, tf: 10, tw: 6 };
  }
  if (obj.type === 'shs') {
    const s = SHS_DB[obj.section];
    const side = s ? s.B : 100;
    const t = s ? s.t : 6;
    return { b: side, d: side, tf: t, tw: t };
  }
  return { b: 200, d: 200, tf: 10, tw: 6 };
}

// Internal helper — build a rectangular polygon plate with `normal` axis.
// `normal` determines the thickness direction: 'y' horizontal plate (cap,
// base), 'z' elevation-facing plate (WSP, splice end plate), 'x' side.
function _connRectPlate(cx, cy, cz, w, h, thk, normal) {
  const hw = w / 2, hh = h / 2;
  let pts;
  if (normal === 'y') {
    // Horizontal plate — vertices in X-Z plane
    pts = [{dx:-hw,dy:0,dz:-hh},{dx:hw,dy:0,dz:-hh},{dx:hw,dy:0,dz:hh},{dx:-hw,dy:0,dz:hh}];
  } else if (normal === 'z') {
    // Elevation-facing plate — vertices in X-Y plane
    pts = [{dx:-hw,dy:-hh,dz:0},{dx:hw,dy:-hh,dz:0},{dx:hw,dy:hh,dz:0},{dx:-hw,dy:hh,dz:0}];
  } else { // 'x'
    // Section-facing plate — vertices in Y-Z plane
    pts = [{dx:0,dy:-hh,dz:-hw},{dx:0,dy:-hh,dz:hw},{dx:0,dy:hh,dz:hw},{dx:0,dy:hh,dz:-hw}];
  }
  return mkObj('plate', { x: cx, y: cy, z: cz, polyPts: pts, pt: thk, normal });
}

// Internal helper — build a horizontal dimension entity on elevation.
function _connDimH(u1, u2, v, text) {
  // Matches drawDim2D data model: horizontal dimension with baseline at v.
  return {
    view: 'elevation',
    type: 'dim', dimType: 'horizontal',
    p1u: u1, p1v: v, p2u: u2, p2v: v,
    offset: 0, text: text || null,
    lw: LW.DIM, ls: 'solid',
  };
}

function _connLabel(u, v, text, align) {
  return {
    view: 'elevation',
    type: 'text',
    u, v, text,
    sz: 3, align: align || 'center',
  };
}

// V24 Phase A — connection builders still assume legacy orientation
// (columns vertical along Y, beams horizontal along X). Phase B removes
// these gates by rewriting the builders to project onto the anchor's frame.
// For now, refuse gracefully when the anchor isn't in the expected frame.
function _connRequireLegacyColumn(col, title) {
  if (!col || !col.axis) return; // not-yet-migrated legacy member; accept
  const ay = Math.abs(col.axis.y);
  if (ay < 0.9) {
    throw new Error(
      `${title}: Phase A only supports vertical (Y-axis) columns. ` +
      `This column is on the ${col.axis.x > 0.5 ? 'X' : col.axis.z > 0.5 ? 'Z' : 'off'} ` +
      `axis. Phase B adds support for arbitrary orientations.`
    );
  }
}
function _connRequireLegacyBeam(beam, title) {
  if (!beam || !beam.axis) return;
  const ax = Math.abs(beam.axis.x);
  if (ax < 0.9) {
    throw new Error(
      `${title}: Phase A only supports horizontal (X-axis) beams. ` +
      `This beam is on the ${beam.axis.y > 0.5 ? 'Y' : beam.axis.z > 0.5 ? 'Z' : 'off'} ` +
      `axis. Phase B adds support for arbitrary orientations.`
    );
  }
}

// ---- Cap plate (drafter §9.2) ----
// Column cap: horizontal plate welded to top of column, bolts through the
// plate for a supported member (beam bearing / upper baseplate splice).
function buildCapPlate(col, params) {
  _connRequireLegacyColumn(col, 'Cap plate');
  const cs = _connGetSectionDims(col);
  const D = CONN_DEFAULTS;

  const boltColGap = params.boltColGap ?? D.CAP_BOLT_COL_GAP;
  const edge = params.edge ?? D.CAP_AE;
  const thk = params.thk ?? D.CAP_PLATE_THK;
  const boltsX = params.boltsX ?? D.CAP_BOLTS_X;
  const boltsZ = params.boltsZ ?? D.CAP_BOLTS_Z;
  const boltSize = params.boltSize ?? D.CAP_BOLT_SIZE;

  // Plate size: column face + bolt-gap + edge-distance on each side
  const plateW = cs.b + 2 * (boltColGap + edge);
  const plateD = cs.d + 2 * (boltColGap + edge);

  // Column top (assuming column length grows upward; obj.y is centre)
  const colTopY = (col.y || 0) + (col.length || 0) / 2;
  const plateCy = colTopY + thk / 2;

  const objs = [];
  const plate = _connRectPlate(col.x || 0, plateCy, col.z || 0, plateW, plateD, thk, 'y');
  objs.push(plate);

  // Bolt positions — rectangle bolt pattern, inset from plate edge by `edge`,
  // straddling column face by boltColGap
  const boltSpanX = cs.b + 2 * boltColGap;
  const boltSpanZ = cs.d + 2 * boltColGap;
  const dx = boltsX > 1 ? boltSpanX / (boltsX - 1) : 0;
  const dz = boltsZ > 1 ? boltSpanZ / (boltsZ - 1) : 0;
  for (let i = 0; i < boltsX; i++) {
    for (let j = 0; j < boltsZ; j++) {
      const bx = (col.x || 0) - boltSpanX / 2 + i * dx;
      const bz = (col.z || 0) - boltSpanZ / 2 + j * dz;
      objs.push(mkObj('bolt', {
        boltSize, x: bx, y: plateCy, z: bz,
      }));
    }
  }

  // 2D annotations on elevation
  const ents = { elevation: [], sectionA: [], planB: [] };
  ents.elevation.push(_connLabel(
    col.x || 0, plateCy + thk * 1.5,
    `CAP PL ${thk} THK`, 'center'
  ));
  // Plate width dim above the plate
  ents.elevation.push(_connDimH(
    (col.x || 0) - plateW / 2,
    (col.x || 0) + plateW / 2,
    plateCy + thk + 40,
    null
  ));

  return { objs, ents, label: `Cap plate @ ${col.section || 'column'}` };
}

// ---- Column baseplate (drafter §9.4) ----
// Cast-in baseplate: horizontal plate welded to column base with holding-down
// bolts protruding downward into the concrete footing.
function buildBaseplate(col, params) {
  _connRequireLegacyColumn(col, 'Baseplate');
  const cs = _connGetSectionDims(col);
  const D = CONN_DEFAULTS;

  const overhang = params.overhang ?? D.BASE_OVERHANG;
  const thk = params.thk ?? D.BASE_PLATE_THK;
  const boltsX = params.boltsX ?? D.BASE_BOLTS_X;
  const boltsZ = params.boltsZ ?? D.BASE_BOLTS_Z;
  const boltSize = params.boltSize ?? D.BASE_BOLT_SIZE;
  const hdLen = params.hdLen ?? D.BASE_HD_BOLT_LEN;

  const plateW = cs.b + 2 * overhang;
  const plateD = cs.d + 2 * overhang;

  const colBotY = (col.y || 0) - (col.length || 0) / 2;
  const plateCy = colBotY - thk / 2;

  const objs = [];
  objs.push(_connRectPlate(col.x || 0, plateCy, col.z || 0, plateW, plateD, thk, 'y'));

  // Holding-down bolts — positioned at plate corners inset by overhang/2
  const boltSpanX = cs.b + overhang;
  const boltSpanZ = cs.d + overhang;
  const dx = boltsX > 1 ? boltSpanX / (boltsX - 1) : 0;
  const dz = boltsZ > 1 ? boltSpanZ / (boltsZ - 1) : 0;
  for (let i = 0; i < boltsX; i++) {
    for (let j = 0; j < boltsZ; j++) {
      const bx = (col.x || 0) - boltSpanX / 2 + i * dx;
      const bz = (col.z || 0) - boltSpanZ / 2 + j * dz;
      // Place bolt at plate level; the hdLen would be used by a future 3D
      // bolt renderer to extend the shank downward into the concrete.
      objs.push(mkObj('bolt', {
        boltSize, x: bx, y: plateCy - hdLen / 2, z: bz,
      }));
    }
  }

  const ents = { elevation: [], sectionA: [], planB: [] };
  ents.elevation.push(_connLabel(
    col.x || 0, plateCy - thk * 1.5,
    `BASE PL ${thk} THK`, 'center'
  ));
  ents.elevation.push(_connDimH(
    (col.x || 0) - plateW / 2,
    (col.x || 0) + plateW / 2,
    plateCy - thk - 40,
    null
  ));

  return { objs, ents, label: `Baseplate @ ${col.section || 'column'}` };
}

// ---- WSP — Web Side Plate (drafter §9.1) ----
// Plate welded to column flange/face, bolted to UB web. Simple shear conn.
function buildWSP(beam, params) {
  _connRequireLegacyBeam(beam, 'WSP');
  const bs = _connGetSectionDims(beam);
  const D = CONN_DEFAULTS;

  const edge = params.edge ?? D.WSP_AE;
  const pitch = params.pitch ?? D.WSP_PITCH;
  const edgeBeam = params.edgeBeam ?? D.WSP_EDGE_BEAM;
  const thk = params.thk ?? D.WSP_PLATE_THK;
  const boltSize = params.boltSize ?? D.WSP_BOLT_SIZE;

  // Bolt count derived from UB depth: bolts fit within (d - 2 * edge - some margin)
  const clearD = bs.d - 2 * edge - 40;
  const nBolts = Math.max(2, Math.min(8, Math.floor(clearD / pitch) + 1));
  const plateH = (nBolts - 1) * pitch + 2 * edge;
  const plateW = 2 * edge + 20; // narrow — single bolt line
  const plateThk = thk;

  // Anchor: beam end (at +x side of beam, assuming beam extends in +X)
  const beamEndX = (beam.x || 0) + (beam.length || 0) / 2 - edgeBeam - plateW / 2;
  const beamMidY = beam.y || 0;
  const beamZ = beam.z || 0;

  const objs = [];
  // Plate — elevation-facing (normal: z) so it shows as rectangle in elevation
  objs.push(_connRectPlate(beamEndX, beamMidY, beamZ, plateW, plateH, plateThk, 'z'));

  // Bolts through web, centred on plate
  const firstBoltY = beamMidY - (nBolts - 1) * pitch / 2;
  for (let i = 0; i < nBolts; i++) {
    objs.push(mkObj('bolt', {
      boltSize, x: beamEndX, y: firstBoltY + i * pitch, z: beamZ,
    }));
  }

  const ents = { elevation: [], sectionA: [], planB: [] };
  ents.elevation.push(_connLabel(
    beamEndX, beamMidY + plateH / 2 + 20,
    `WSP ${plateThk} THK (${nBolts}/${boltSize})`, 'center'
  ));

  return { objs, ents, label: `WSP ${nBolts}/${boltSize}` };
}

// ---- UB moment splice (drafter §9.3) ----
// End-plate flange splice — two beams meeting with flush end plates
// bolted through. Anchor = the beam selected.
function buildSplice(beam, params) {
  _connRequireLegacyBeam(beam, 'Splice');
  const bs = _connGetSectionDims(beam);
  const D = CONN_DEFAULTS;

  const gap = params.gap ?? D.SPLICE_GAP;
  const thk = params.thk ?? D.SPLICE_PLATE_THK;
  const boltSize = params.boltSize ?? D.SPLICE_BOLT_SIZE;
  const nBolts = params.nBolts ?? D.SPLICE_BOLTS;
  const spliceEdge = params.edge ?? D.SPLICE_EDGE;

  // End-plate sized to extend past flanges for top/bottom bolt rows
  const plateW = bs.b + 2 * spliceEdge;
  const plateH = bs.d + 2 * spliceEdge;

  // Anchor: one plate at +X end of beam, one mirrored at -X end of partner
  // (we only have the selected beam — draw both plates with the gap between)
  const endX = (beam.x || 0) + (beam.length || 0) / 2;
  const p1x = endX - gap / 2 - thk / 2;
  const p2x = endX + gap / 2 + thk / 2;
  const cy = beam.y || 0;
  const cz = beam.z || 0;

  const objs = [];
  // Two elevation-facing plates... but for splice they're section-facing
  // (normal: x) since we see them edge-on in elevation
  objs.push(_connRectPlate(p1x, cy, cz, plateW, plateH, thk, 'x'));
  objs.push(_connRectPlate(p2x, cy, cz, plateW, plateH, thk, 'x'));

  // Bolts — split evenly, top row + bottom row on each flange, and web
  // Simple layout: nBolts distributed over plateH at spliceEdge inset
  const bPerSide = Math.max(2, nBolts);
  const firstY = cy - (plateH / 2 - spliceEdge);
  const lastY = cy + (plateH / 2 - spliceEdge);
  const dy = bPerSide > 1 ? (lastY - firstY) / (bPerSide - 1) : 0;
  // Two columns of bolts straddling the web
  const boltColOffset = bs.b / 2 - spliceEdge;
  for (let i = 0; i < bPerSide; i++) {
    const by = firstY + i * dy;
    // Bolt goes through both plates — place centred on joint
    objs.push(mkObj('bolt', { boltSize, x: endX, y: by, z: cz - boltColOffset }));
    objs.push(mkObj('bolt', { boltSize, x: endX, y: by, z: cz + boltColOffset }));
  }

  const ents = { elevation: [], sectionA: [], planB: [] };
  ents.elevation.push(_connLabel(
    endX, cy + plateH / 2 + 25,
    `END PL 2/${thk} THK`, 'center'
  ));

  return { objs, ents, label: `Moment splice ${bPerSide * 2}/${boltSize}` };
}

// ---- Dispatcher / atomic placement ----
function placeConnection(result) {
  if (!result || (!result.objs?.length && !result.ents)) return;
  const objSnaps = [];
  const entSnaps = [];
  for (const o of (result.objs || [])) {
    objects3D.push(o);
    objSnaps.push(JSON.parse(JSON.stringify(o)));
  }
  for (const vk of ['elevation', 'sectionA', 'planB']) {
    const list = result.ents?.[vk] || [];
    for (const e of list) {
      // Ensure id + defaults present
      if (!e.id) e.id = ent2dIdN++;
      if (!e.view) e.view = vk;
      if (!e.layer) e.layer = '0';
      if (!e.lw) e.lw = 0.35;
      if (!e.ls) e.ls = 'solid';
      entities2D[vk].push(e);
      entSnaps.push(JSON.parse(JSON.stringify(e)));
    }
  }
  undoStack.push({ act: 'connection', name: result.label || 'connection', objSnaps, entSnaps });
  if (undoStack.length > 100) undoStack.shift();
  redoStack = [];
  if (typeof v3dMarkDirty === 'function') v3dMarkDirty();
  if (typeof invalidateWeldCache === 'function') invalidateWeldCache();
  requestRender();
}

// ---- V23.1 Inline Wizard State ----
// When non-null, the Inspector panel shows the wizard form and the canvas
// renders live ghost previews (50% opacity) of the builder output.
// Shape: { kind, spec, anchor, params, previewObjIds:Set, previewEntIds:Set }
let connWizState = null;
let _connWizRebuildPending = false;

// Splice any __preview:true items out of objects3D + entities2D.
function connWizClearPreview() {
  if (!connWizState) return;
  objects3D = objects3D.filter(o => !o.__preview);
  for (const vk of ['elevation', 'sectionA', 'planB']) {
    if (entities2D[vk]) entities2D[vk] = entities2D[vk].filter(e => !e.__preview);
  }
  connWizState.previewObjIds = new Set();
  connWizState.previewEntIds = new Set();
}

// Run the builder with current params and inject tagged preview items.
function connWizRebuildPreview() {
  _connWizRebuildPending = false;
  if (!connWizState) return;
  connWizClearPreview();
  const { spec, anchor, params } = connWizState;
  if (!anchor || !spec.requires.includes(anchor.type)) return;
  let result;
  try {
    result = spec.builder(anchor, params);
  } catch (e) {
    console.error('Preview builder failed:', e);
    return;
  }
  if (!result) return;
  for (const o of (result.objs || [])) {
    o.__preview = true;
    objects3D.push(o);
    if (o.id != null) connWizState.previewObjIds.add(o.id);
  }
  for (const vk of ['elevation', 'sectionA', 'planB']) {
    const list = result.ents?.[vk] || [];
    for (const e of list) {
      if (e.id == null) e.id = ent2dIdN++;
      if (!e.view) e.view = vk;
      if (!e.layer) e.layer = '0';
      if (!e.lw) e.lw = 0.35;
      if (!e.ls) e.ls = 'solid';
      e.__preview = true;
      entities2D[vk].push(e);
      connWizState.previewEntIds.add(e.id);
    }
  }
  connWizState._lastLabel = result.label || spec.title;
  requestRender();
}

function connWizScheduleRebuild() {
  if (_connWizRebuildPending) return;
  _connWizRebuildPending = true;
  requestAnimationFrame(connWizRebuildPreview);
}

// Strip preview flags + push ONE atomic undo entry — matches placeConnection.
function connWizCommit() {
  if (!connWizState) return;
  const objSnaps = [];
  const entSnaps = [];
  for (const o of objects3D) {
    if (o.__preview) {
      delete o.__preview;
      objSnaps.push(JSON.parse(JSON.stringify(o)));
    }
  }
  for (const vk of ['elevation', 'sectionA', 'planB']) {
    if (!entities2D[vk]) continue;
    for (const e of entities2D[vk]) {
      if (e.__preview) {
        delete e.__preview;
        entSnaps.push(JSON.parse(JSON.stringify(e)));
      }
    }
  }
  if (objSnaps.length || entSnaps.length) {
    undoStack.push({
      act: 'connection',
      name: connWizState._lastLabel || connWizState.spec.title,
      objSnaps, entSnaps,
    });
    if (undoStack.length > 100) undoStack.shift();
    redoStack = [];
  }
  connWizState = null;
  if (typeof v3dMarkDirty === 'function') v3dMarkDirty();
  if (typeof invalidateWeldCache === 'function') invalidateWeldCache();
  if (typeof _projectSnapshotActive === 'function') _projectSnapshotActive();
  updateInspector();
  requestRender();
}

function connWizCancel() {
  if (!connWizState) return;
  connWizClearPreview();
  connWizState = null;
  updateInspector();
  requestRender();
}

// ---- Wizard specs ----
// V23.1 — renders inline in the Inspector panel with a live ghost preview.
// `fields` is a list of [key, label, CONN_DEFAULTS key, input-kind?] tuples
// used by `_inspConnectionHtml` + `_wireConnectionInputs`. `builder` is the
// pure function invoked every time a parameter changes (for preview) and
// once more on commit.
const _connSpecs = {
  capPlate: {
    title: 'Cap Plate (§9.2)',
    requires: ['ub', 'shs'],
    builder: buildCapPlate,
    fields: [
      ['thk',         'Plate thickness (mm)',    'CAP_PLATE_THK'],
      ['boltSize',    'Bolt size',               'CAP_BOLT_SIZE',      'boltSelect'],
      ['boltColGap',  'Col face → bolt (mm)',    'CAP_BOLT_COL_GAP'],
      ['edge',        'Bolt edge dist (mm)',     'CAP_AE'],
      ['boltsX',      'Bolts across X',          'CAP_BOLTS_X',        'intSmall'],
      ['boltsZ',      'Bolts across Z',          'CAP_BOLTS_Z',        'intSmall'],
    ],
    hint: 'Pick a UB, UC, or SHS column in the elevation view, then Create.',
  },
  baseplate: {
    title: 'Column Baseplate (§9.4)',
    requires: ['ub', 'shs'],
    builder: buildBaseplate,
    fields: [
      ['thk',         'Plate thickness (mm)',    'BASE_PLATE_THK'],
      ['boltSize',    'HD bolt size',            'BASE_BOLT_SIZE',     'boltSelect'],
      ['overhang',    'Overhang past column (mm)','BASE_OVERHANG'],
      ['boltsX',      'Bolts across X',          'BASE_BOLTS_X',       'intSmall'],
      ['boltsZ',      'Bolts across Z',          'BASE_BOLTS_Z',       'intSmall'],
      ['hdLen',       'HD bolt length (mm)',     'BASE_HD_BOLT_LEN'],
    ],
    hint: 'Pick the column first; baseplate attaches at the bottom end.',
  },
  wsp: {
    title: 'Web Side Plate / Shear Connection (§9.1)',
    requires: ['ub'],
    builder: buildWSP,
    fields: [
      ['thk',         'Plate thickness (mm)',    'WSP_PLATE_THK'],
      ['boltSize',    'Bolt size',               'WSP_BOLT_SIZE',      'boltSelect'],
      ['pitch',       'Bolt pitch (mm)',         'WSP_PITCH'],
      ['edge',        'Plate edge dist (mm)',    'WSP_AE'],
      ['edgeBeam',    'Gap from beam end (mm)',  'WSP_EDGE_BEAM'],
    ],
    hint: 'Pick the supported UB. Bolt count is derived from beam depth.',
  },
  splice: {
    title: 'UB Moment Splice (§9.3)',
    requires: ['ub'],
    builder: buildSplice,
    fields: [
      ['thk',         'End-plate thickness (mm)','SPLICE_PLATE_THK'],
      ['boltSize',    'Bolt size',               'SPLICE_BOLT_SIZE',   'boltSelect'],
      ['nBolts',      'Bolts per side',          'SPLICE_BOLTS',       'intSmall'],
      ['gap',         'Mill gap (mm)',           'SPLICE_GAP'],
      ['edge',        'Bolt edge dist (mm)',     'SPLICE_EDGE'],
    ],
    hint: 'Pick one UB; splice draws two end plates with a gap at the beam end.',
  },
};

// V23.1 — drives the inline Inspector wizard. Same name so existing call
// sites (tile clicks, command palette, hamburger menu, keyboard chords) work.
function openConnectionDialog(kind) {
  const spec = _connSpecs[kind];
  if (!spec) return;

  // If a wizard is already open, cancel it first (avoid stacking previews)
  if (connWizState) connWizCancel();

  const anchor = selected3D.length === 1 ? selected3D[0] : null;
  const params = {};
  for (const [key, , defaultKey] of spec.fields) {
    params[key] = CONN_DEFAULTS[defaultKey];
  }
  connWizState = {
    kind, spec, anchor, params,
    previewObjIds: new Set(), previewEntIds: new Set(),
    _lastLabel: spec.title,
  };
  if (anchor && spec.requires.includes(anchor.type)) {
    connWizRebuildPreview();
  }
  updateInspector();
  requestRender();
}

