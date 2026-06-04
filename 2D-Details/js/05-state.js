'use strict';

// Feature flags + 3D object model + project model (V19.5 multi-sheet)
// Extracted from dev/index.html lines 3149-3450 (2026-05-02 modular split)

// V14 feature flag: AS 1100 realistic bolt renderer (chamfered hex + sawtooth
// threads per drafter §7.3–7.5). Set to false at runtime to fall back to the
// legacy schematic rectangle renderer for comparison. See _drawBoltSectionA_V14
// and _drawBoltPlanB_V14 in the RENDERING section.
const V14_NEW_BOLTS = true;

// 2026-05-18 feature flag: timber-screw connection designer (Rothoblaas HBS
// Plate). Phase 2 ships entity types (TimberMember, SteelPlate, Screw); the
// Connection entity and live checks land in Phase 3+. When off, the dispatch
// cases in 34-draw-2d.js short-circuit so v1.x release builds can gate the
// feature behind a runtime toggle. See PlannedBuilds/timber-screws/.
let FEATURE_TIMBER_SCREWS = true;

// V17 feature flags: sketch-theme wobble + paper grain. Both default OFF so
// straight-out-of-the-box output stays crisp; user opts in via toolbar toggle
// (wired by populateLibrary). When `sketchOn` is true, rLine / rPath / rRect
// route through a deterministic Perlin-ish jitter so linework feels hand-drawn.
// `sketchGrain` adds a cached noise texture over the sheet fill.
let sketchOn = false;
let sketchGrain = false;

// V15 feature flag: true vector PDF export. When true, exportSheetToPDF routes
// through exportSheetToPDFVector() which emits jsPDF line/rect/circle/text
// primitives from the render pipeline via a canvas-API shim (see
// createPdfCanvasShim). Set to false to fall back to the V14 raster path
// (renders to offscreen canvas, embeds as JPEG).
let V15_VECTOR_PDF = true;

// True while exportSheetToPDFVector is active — read by ppm() and other render
// helpers to adapt to PDF-native units (sheet-mm directly, no screen scaling).
let pdfExportMode = false;

// ============================================================
// 3D OBJECT MODEL (same as V4)
// ============================================================

let objects3D = [];
let entities2D = { elevation: [], sectionA: [], planB: [] };
let selected3D = [];
let objIdN = 1;

let secCutX = 0;   // X position where Section A cuts (in real-world mm)
let planCutY = 0;   // Y position where Plan B cuts (in real-world mm)
let draggingCutLine = null; // 'secA' or 'planB' when dragging a cut line

// Editable title block metadata — saved with the project JSON. Rendered in
// the title block strip at the bottom of the A1 sheet. Defaults are sensible
// for a Bligh Tanner drawing; any field can be edited via the Title Block dialog.
let sheetInfo = {
  project:      'Project Name',
  client:       'Client',
  description:  'Structural Detail',
  drawingNo:    'S-XXX',
  revision:     'A',
  date:         new Date().toISOString().slice(0, 10),
  designer:     'DM',
  checker:      '',
  drawnBy:      '',
  sheetOf:      '1 of 1',
  firmName:     'Bligh Tanner',
  firmTagline:  'Structural Engineers — Brisbane',
};

let undoStack = [];
let redoStack = [];

// ============================================================
// PROJECT MODEL (V19.5)
// ============================================================
// A project is a sheet set. Each sheet owns its own `objects3D`, `entities2D`,
// `sheetInfo`, and cut-line positions. The globals above are always "the
// currently active sheet" — when the user switches sheets, we snapshot the
// current globals back into the active slot, then restore the target slot.
// This lets the entire existing render pipeline remain ignorant of multi-
// sheet state: it keeps reading the same globals it always has.
let project = {
  sheets: [],          // array of { id, name, sheetInfo, objects3D, entities2D, secCutX, planCutY, objIdN, ent2dIdN }
  activeSheetIdx: 0,
  _nextSheetId: 1,
};

// Create a fresh empty sheet with default sheetInfo. `name` shows in the
// sidebar; `drawingNo` seeds the title block field.
// V25 — `mode` is per-sheet: '3d' (current behaviour) or '2d' (paper-space
// detailing — single elevation pane fills the drawing area, no projections,
// new tool palette for hand-drawn structural details).
function _projectMakeSheet(name, drawingNo, mode) {
  const id = project._nextSheetId++;
  return {
    id,
    name: name || `Sheet ${id}`,
    mode: mode || '2d',
    sheetInfo: {
      project:      sheetInfo ? sheetInfo.project : 'Project Name',
      client:       sheetInfo ? sheetInfo.client : 'Client',
      description:  'Structural Detail',
      drawingNo:    drawingNo || `S-${400 + id - 1}`,
      revision:     'A',
      date:         new Date().toISOString().slice(0, 10),
      designer:     sheetInfo ? sheetInfo.designer : 'DM',
      checker:      sheetInfo ? sheetInfo.checker : '',
      drawnBy:      sheetInfo ? sheetInfo.drawnBy : '',
      sheetOf:      '',
      firmName:     sheetInfo ? sheetInfo.firmName : 'Bligh Tanner',
      firmTagline:  sheetInfo ? sheetInfo.firmTagline : 'Structural Engineers — Brisbane',
    },
    objects3D: [],
    entities2D: { elevation: [], sectionA: [], planB: [] },
    secCutX: 0, planCutY: 0,
    objIdN: 1, ent2dIdN: 1,
  };
}

// Snapshot the *current* globals into `project.sheets[project.activeSheetIdx]`.
// Called before switching away from an active sheet, and by save-project.
function _projectSnapshotActive() {
  const s = project.sheets[project.activeSheetIdx];
  if (!s) return;
  s.sheetInfo = JSON.parse(JSON.stringify(sheetInfo));
  s.objects3D = JSON.parse(JSON.stringify(objects3D));
  s.entities2D = JSON.parse(JSON.stringify(entities2D));
  s.secCutX = secCutX;
  s.planCutY = planCutY;
  s.objIdN = objIdN;
  s.ent2dIdN = ent2dIdN;
  s.mode = (typeof sheetMode === 'string') ? sheetMode : (s.mode || '3d');
}

// Restore sheet `idx`'s data into the globals. Clears selection and undo
// history because those are inherently per-session — a fresh sheet starts
// with its own undo stack (safer than juggling per-sheet stacks).
function _projectLoadSheet(idx) {
  const s = project.sheets[idx];
  if (!s) return;
  project.activeSheetIdx = idx;
  sheetInfo = JSON.parse(JSON.stringify(s.sheetInfo));
  objects3D = JSON.parse(JSON.stringify(s.objects3D));
  entities2D = JSON.parse(JSON.stringify(s.entities2D));
  secCutX = s.secCutX || 0;
  planCutY = s.planCutY || 0;
  objIdN = s.objIdN || 1;
  ent2dIdN = s.ent2dIdN || 1;
  selected3D = [];
  undoStack.length = 0;
  redoStack.length = 0;
  // V25 — restore per-sheet mode and re-layout viewports for that mode.
  sheetMode = s.mode || '3d';
  if (typeof applySheetMode === 'function') applySheetMode(sheetMode, /*silent=*/true);
  // V24 Phase A — upgrade any legacy-shape members to the 3D frame model.
  if (typeof migrateAllMembers === 'function') migrateAllMembers();
  if (typeof v3dMarkDirty === 'function') v3dMarkDirty();
  if (typeof invalidateWeldCache === 'function') invalidateWeldCache();
  if (typeof renderSheetBrowser === 'function') renderSheetBrowser();
  requestRender();
}

// Public API — called by sheet browser buttons
function projectSwitchSheet(idx) {
  if (idx === project.activeSheetIdx) return;
  // V23.1 — don't carry an open wizard across sheets.
  if (connWizState) connWizCancel();
  _projectSnapshotActive();
  _projectLoadSheet(idx);
}
function projectAddSheet(name) {
  _projectSnapshotActive();
  const newSheet = _projectMakeSheet(name);
  project.sheets.push(newSheet);
  _projectLoadSheet(project.sheets.length - 1);
}
function projectDeleteSheet(idx) {
  if (project.sheets.length <= 1) {
    alert('A project must have at least one sheet.');
    return;
  }
  const label = project.sheets[idx].name || project.sheets[idx].sheetInfo?.drawingNo || `Sheet ${idx + 1}`;
  if (!confirm(`Delete "${label}"? This cannot be undone.`)) return;
  project.sheets.splice(idx, 1);
  const newIdx = Math.min(project.activeSheetIdx, project.sheets.length - 1);
  _projectLoadSheet(newIdx);
}
function projectRenameSheet(idx, newName) {
  const s = project.sheets[idx];
  if (!s) return;
  s.name = newName;
  if (idx === project.activeSheetIdx) {
    // Nothing to mirror into globals — name lives only on the sheet object
  }
  if (typeof renderSheetBrowser === 'function') renderSheetBrowser();
}

// Initialise — call once at startup AFTER the module-level globals are
// assigned their defaults. Creates the first sheet from whatever is
// currently in the globals, so the app launches identically to V19.
function projectInit() {
  if (project.sheets.length) return;
  const first = _projectMakeSheet('Sheet 1', sheetInfo.drawingNo);
  first.sheetInfo = JSON.parse(JSON.stringify(sheetInfo));
  project.sheets.push(first);
  project.activeSheetIdx = 0;
}

function mkObj(type, props) {
  const obj = { id: objIdN++, type, ...props };
  // V24 Phase A — ensure every member carries an axis/up frame from birth.
  if (typeof isMemberType === 'function' && isMemberType(type)
      && !(obj.axis && obj.up)) {
    const f = (typeof legacyRotToFrame === 'function')
      ? legacyRotToFrame(obj.rot)
      : { axis: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 } };
    obj.axis = f.axis;
    obj.up = f.up;
  }
  return obj;
}

function addObj(obj) {
  objects3D.push(obj);
  undoStack.push({ act: 'addObj', obj: JSON.parse(JSON.stringify(obj)) });
  if (undoStack.length > 100) undoStack.shift();
  redoStack = [];
  if (typeof v3dMarkDirty === 'function') v3dMarkDirty();
  if (typeof invalidateWeldCache === 'function') invalidateWeldCache();
}

function delObj(id) {
  const i = objects3D.findIndex(o => o.id === id);
  if (i < 0) return;
  const obj = objects3D.splice(i, 1)[0];
  selected3D = selected3D.filter(s => s.id !== id);
  undoStack.push({ act: 'delObj', obj: JSON.parse(JSON.stringify(obj)), idx: i });
  redoStack = [];
  if (typeof v3dMarkDirty === 'function') v3dMarkDirty();
  if (typeof invalidateWeldCache === 'function') invalidateWeldCache();
}

let ent2dIdN = 1;
function mkEnt2D(viewKey, type, props) {
  return { id: ent2dIdN++, type, view: viewKey, layer: "0", lw: 0.35, ls: "solid", ...props };
}
function addEnt2D(ent) {
  entities2D[ent.view].push(ent);
  undoStack.push({ act: 'addEnt2D', ent: JSON.parse(JSON.stringify(ent)) });
  if (undoStack.length > 100) undoStack.shift();
  redoStack = [];
}

// Restore a v25 entity-move snapshot (the {ents, plates} shape captured in
// js/39-events.js). Used by both the undo() (before) and redo() (after)
// 'v25Move' branches. v25 entities are restored by Object.assign onto the SAME
// live object so identity is preserved (selection / group hooks keep working);
// the stored snapshot is never mutated. v2 plate polygons are restored on the
// v2 model element so the plate mirror / bolt-grip stays correct. Reach the v2
// namespace via window.v2.
//
// `other` is the OPPOSITE snapshot of the same v25Move action (after when
// restoring before, and vice-versa). It is needed because a grouped move can
// CHANGE the entity SET, not just entity fields: when a flange joint is
// re-welded/-bolted at the drop point (js/72g-v25-joint.js applyJoint), the old
// weld/bolt entities are spliced out and fresh ones created with NEW ids. So
// before/after hold the joint child entities under DIFFERENT ids. To make the
// move reversible we reconcile the set:
//   - any id present in `other` but not in `target` was created by the move →
//     remove it from the view;
//   - any id present in `target` but missing from the live view was deleted by
//     the move → re-create it (full clone);
//   - ids in both get Object.assign'd (the common position-only case).
// Without `other` (single-entity / no-joint moves) this collapses to the plain
// field-restore behaviour.
function v25RestoreMoveSnapshot(view, target, other) {
  if (!target) return;
  if (view && typeof entities2D !== 'undefined' && entities2D && Array.isArray(entities2D[view])) {
    const arr = entities2D[view];
    const targetIds = new Set((target.ents || []).map(e => e.id));
    // Remove entities the move ADDED (in `other`, not in `target`).
    if (other && Array.isArray(other.ents)) {
      const stale = other.ents.filter(e => !targetIds.has(e.id)).map(e => e.id);
      if (stale.length) {
        const drop = new Set(stale);
        entities2D[view] = arr.filter(e => !(e && drop.has(e.id)));
      }
    }
    const live = entities2D[view];
    (target.ents || []).forEach(stored => {
      const cur = live.find(e => e && e.id === stored.id);
      if (cur) Object.assign(cur, JSON.parse(JSON.stringify(stored)));
      else live.push(JSON.parse(JSON.stringify(stored)));   // re-create one the move deleted
    });
  }
  const model = window.v2 && v2.appState && v2.appState.model;
  if (model && model.elements && typeof model.elements.get === 'function') {
    (target.plates || []).forEach(p => {
      const el = model.elements.get(p.id);
      if (el && el.geometry) {
        el.geometry = Object.assign({}, el.geometry, { polygon: JSON.parse(JSON.stringify(p.polygon)) });
        // Restore the flange-joint metadata captured alongside the polygon (key
        // added in js/39-events.js v25SnapshotMoveTargets) so undo doesn't leave
        // a stale joint pointing at a beam the plate no longer meets. Only act
        // when the snapshot carries the key (older snapshots won't).
        if (Object.prototype.hasOwnProperty.call(p, 'flange')) {
          if (!el.params) el.params = {};
          if (p.flange) el.params.flange = JSON.parse(JSON.stringify(p.flange));
          else delete el.params.flange;
        }
      }
    });
  }
}

function undo() {
  if (!undoStack.length) return;
  const a = undoStack.pop();
  redoStack.push(a);
  if (a.act === 'addObj') objects3D = objects3D.filter(o => o.id !== a.obj.id);
  else if (a.act === 'delObj') objects3D.splice(a.idx, 0, JSON.parse(JSON.stringify(a.obj)));
  else if (a.act === 'moveObj') {
    a.before.forEach(snap => {
      const o = objects3D.find(obj => obj.id === snap.id);
      if (o) Object.assign(o, JSON.parse(JSON.stringify(snap)));
    });
  }
  else if (a.act === 'addEnt2D') {
    const v = a.ent.view;
    entities2D[v] = entities2D[v].filter(e => e.id !== a.ent.id);
  }
  else if (a.act === 'v25Add') {
    // Bluebeam copy-drag (and the inspector Duplicate button): undo removes
    // every clone the gesture added, in one step. redo() re-adds them.
    const ids = new Set((a.ents || []).map(e => e && e.id));
    if (Array.isArray(entities2D[a.view])) entities2D[a.view] = entities2D[a.view].filter(e => !(e && ids.has(e.id)));
    if (Array.isArray(v25Selected)) v25Selected = v25Selected.filter(id => !ids.has(id));
  }
  else if (a.act === 'objAddMany') {
    // 3D-mode copy-drag: undo removes every duplicated object in one step.
    const ids = new Set((a.objs || []).map(o => o && o.id));
    objects3D = objects3D.filter(o => !(o && ids.has(o.id)));
  }
  else if (a.act === 'v25Move') {
    // 2D-mode v25 entity move (member/hatch/blockwork/leader/noteBox, plus any
    // grouped mates incl. v2 plates). moveObj only restores objects3D, so a
    // 2D-entity move needs its own act. undo() restores the BEFORE snapshot;
    // a.after lets it drop any joint weld/bolt the move created. Captured in
    // js/39-events.js at v25Drag release.
    v25RestoreMoveSnapshot(a.view, a.before, a.after);
  }
  else if (a.act === 'connection') {
    // Atomic connection undo: remove every object + 2D entity created by the
    // connection builder in one step.
    const objIds = new Set((a.objSnaps || []).map(o => o.id));
    if (objIds.size) objects3D = objects3D.filter(o => !objIds.has(o.id));
    const entIds = new Set((a.entSnaps || []).map(e => e.id));
    if (entIds.size) {
      for (const vk of Object.keys(entities2D)) {
        entities2D[vk] = entities2D[vk].filter(e => !entIds.has(e.id));
      }
    }
  }
  else if (a.act === 'v2tx') {
    // 2D-mode plates are v2-authoritative — their place/edit/delete live on the
    // v2 transactional undo stack. The {act:'v2tx'} marker (pushed by
    // js/v2/engine/v1-bridge.js whenever a v2 transaction is applied) keeps v1
    // and v2 edits on one chronological timeline, so Ctrl+Z unwinds them
    // together in LIFO order. Route this pop to the v2 stack's undo.
    if (window.v2 && v2.engine && v2.engine.undoStack &&
        typeof v2.engine.undoStack.undo === 'function') {
      v2.engine.undoStack.undo();
    }
  }
  selected3D = [];
  if (typeof v3dMarkDirty === 'function') v3dMarkDirty();
  if (typeof invalidateWeldCache === 'function') invalidateWeldCache();
  requestRender();
}

function redo() {
  if (!redoStack.length) return;
  const a = redoStack.pop();
  undoStack.push(a);
  if (a.act === 'addObj') objects3D.push(JSON.parse(JSON.stringify(a.obj)));
  else if (a.act === 'delObj') objects3D = objects3D.filter(o => o.id !== a.obj.id);
  else if (a.act === 'moveObj') {
    a.after.forEach(snap => {
      const o = objects3D.find(obj => obj.id === snap.id);
      if (o) Object.assign(o, JSON.parse(JSON.stringify(snap)));
    });
  }
  else if (a.act === 'addEnt2D') entities2D[a.ent.view].push(JSON.parse(JSON.stringify(a.ent)));
  else if (a.act === 'v25Add') {
    if (Array.isArray(entities2D[a.view])) (a.ents || []).forEach(e => entities2D[a.view].push(JSON.parse(JSON.stringify(e))));
  }
  else if (a.act === 'objAddMany') {
    (a.objs || []).forEach(o => objects3D.push(JSON.parse(JSON.stringify(o))));
  }
  else if (a.act === 'v25Move') {
    // Mirror of undo()'s v25Move branch — redo() re-applies the AFTER snapshot;
    // a.before lets it drop any pre-move joint weld/bolt the redo supersedes.
    v25RestoreMoveSnapshot(a.view, a.after, a.before);
  }
  else if (a.act === 'connection') {
    // Atomic connection redo: re-insert every object + entity the builder made.
    for (const snap of (a.objSnaps || [])) objects3D.push(JSON.parse(JSON.stringify(snap)));
    for (const snap of (a.entSnaps || [])) {
      const v = snap.view;
      if (entities2D[v]) entities2D[v].push(JSON.parse(JSON.stringify(snap)));
    }
  }
  else if (a.act === 'v2tx') {
    // Mirror of undo()'s v2tx branch — replay the v2 transaction via the v2
    // stack's redo so Ctrl+Y re-applies a plate place / edit / delete.
    if (window.v2 && v2.engine && v2.engine.undoStack &&
        typeof v2.engine.undoStack.redo === 'function') {
      v2.engine.undoStack.redo();
    }
  }
  selected3D = [];
  if (typeof v3dMarkDirty === 'function') v3dMarkDirty();
  if (typeof invalidateWeldCache === 'function') invalidateWeldCache();
  requestRender();
}

// ============================================================
