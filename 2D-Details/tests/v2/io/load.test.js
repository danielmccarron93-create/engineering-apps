/*
 * StructDraw v2 — Phase 0e: the file-load orchestrator (js/v2/io/load.js).
 *
 * Covers: schemaVersion detection across v1-single / v1-project / v2 / unknown;
 * fromParsed end-to-end migration for each schema; applyToShadow side-effects;
 * the v1 file-load integration point `afterV1Load(trigger)` resolving through
 * each of its three paths (installed bridge -> bridge.readV1State -> bare
 * globals). Fixture-driven tests live in load-v1-fixture.test.js — they take
 * real saved .sd2.json files and assert structural identity to a recorded v2
 * expectation.
 *
 * window.v2 is populated by tests/v2/setup.mjs; describe/it/expect are globals.
 */

function clone(x) { return JSON.parse(JSON.stringify(x)); }

/** A representative v1 single-sheet .sd2.json shape (`46-save-load.js`). */
function v1SingleSheetPayload() {
  return {
    version: '1.0',
    timestamp: '2026-05-20T00:00:00.000Z',
    drawingScale: 10, gridSize: 5, nudgeSize: 1, secCutX: 0, planCutY: 0,
    objects3D: [
      { id: 1, type: 'ub', section: '310UB 40.4',
        x: 0, y: 0, z: 0, length: 6000, axis: { x: 1, y: 0, z: 0 } },
      { id: 2, type: 'plate', x: 0, y: 0, z: 0, pt: 12,
        polyPts: [{ x: 0, y: 0, z: 0 }, { x: 200, y: 0, z: 0 },
                  { x: 200, y: 100, z: 0 }, { x: 0, y: 100, z: 0 }] },
    ],
    entities2D: {
      elevation: [
        { id: 1, type: 'plate2', view: 'elevation', _v25: true,
          aspect: 'elev', shape: 'rect', u: 0, v: 0, w: 300, h: 150, thk: 10 },
        { id: 2, type: 'dim', view: 'elevation',
          p1u: 0, p1v: 0, p2u: 500, p2v: 0, off: 40, dimType: 'horizontal' },
      ],
      sectionA: [],
      planB: [],
    },
    sheetInfo: { project: 'Test', drawingNo: 'S-101' },
    blocks: [
      { viewKey: 'elevation', sheetX: 50, sheetY: 400, boxW: 300, boxH: 300, hidden: false },
      { viewKey: 'sectionA',  sheetX: 400, sheetY: 400, boxW: 300, boxH: 300, hidden: false },
      { viewKey: 'planB',     sheetX: 50, sheetY: 50,  boxW: 300, boxH: 300, hidden: false },
      { viewKey: 'isometric', sheetX: 400, sheetY: 50, boxW: 300, boxH: 300, hidden: false },
    ],
  };
}

/** A v1 multi-sheet .sdproj shape (`50-project.js`). */
function v1ProjectPayload() {
  const sheet1 = {
    id: 1, name: 'Sheet 1', mode: '2d',
    sheetInfo: { project: 'P', drawingNo: 'S-400' },
    objects3D: [{ id: 10, type: 'shs', section: '89x5',
                  x: 0, y: 0, z: 0, length: 3000, axis: { x: 0, y: 1, z: 0 } }],
    entities2D: { elevation: [], sectionA: [], planB: [] },
    secCutX: 0, planCutY: 0, objIdN: 11, ent2dIdN: 1,
  };
  const sheet2 = {
    id: 2, name: 'Sheet 2', mode: '2d',
    sheetInfo: { project: 'P', drawingNo: 'S-401' },
    objects3D: [],
    entities2D: { elevation: [
      { id: 1, type: 'plate2', view: 'elevation', _v25: true,
        aspect: 'elev', shape: 'rect', u: 0, v: 0, w: 200, h: 200, thk: 10 },
    ], sectionA: [], planB: [] },
    secCutX: 0, planCutY: 0, objIdN: 1, ent2dIdN: 2,
  };
  return {
    format: 'structdraw-project', version: 1, savedAt: '2026-05-20T00:00:00.000Z',
    project: { sheets: [sheet1, sheet2], activeSheetIdx: 1, _nextSheetId: 3 },
  };
}

/** A v2-shape payload — what Phase 1+ saves will eventually emit. */
function v2Payload() {
  const m = window.v2.model;
  const elevView = m.makeView({ id: 'v-elev', type: 'elevation', name: 'E', scale: 10 });
  const el = m.makeElement({
    id: 'beam-x', category: 'beam', family: 'ub', type: '310UB40.4',
    geometry: m.linearMember({ start: { x: 0, y: 0, z: 0 }, end: { x: 6000, y: 0, z: 0 } }),
    materialId: null, createdAt: 1,
  });
  const sheet = m.makeSheet({ id: 'v2-sheet', name: 'S', size: 'A1',
    placements: [{ viewId: 'v-elev', originOnSheet: { x: 0, y: 0 } }] });
  const model = m.makeModel({
    elements: new Map([[el.id, el]]),
    views: new Map([[elevView.id, elevView]]),
    sheets: new Map([[sheet.id, sheet]]),
    materials: new Map(),
    project: m.makeProject({ id: 'p', name: 'P', createdAt: 0 }),
    version: 1,
  });
  return { schemaVersion: 2, v2: window.v2.io.modelToJSON(model) };
}

describe('Phase 0e — v2.io.load', () => {
  let load;

  beforeEach(() => {
    load = window.v2.io.load;
    window.v2.appState.reset();
    window.v2.engine.dirtyBus.clear();
  });

  // --- schema detection ----------------------------------------------------

  it('detectSchemaVersion recognises a v1 single-sheet payload', () => {
    expect(load.detectSchemaVersion(v1SingleSheetPayload())).toBe('v1-single');
  });

  it('detectSchemaVersion recognises a v1 multi-sheet (.sdproj) payload', () => {
    expect(load.detectSchemaVersion(v1ProjectPayload())).toBe('v1-project');
  });

  it('detectSchemaVersion recognises a v2 payload', () => {
    expect(load.detectSchemaVersion(v2Payload())).toBe('v2');
    expect(load.detectSchemaVersion({ schemaVersion: 2 })).toBe('v2');
    expect(load.detectSchemaVersion({ schemaVersion: 3 })).toBe('v2');  // future
  });

  it('detectSchemaVersion returns unknown for empty / garbage input', () => {
    expect(load.detectSchemaVersion(null)).toBe('unknown');
    expect(load.detectSchemaVersion({})).toBe('unknown');
    expect(load.detectSchemaVersion({ foo: 'bar' })).toBe('unknown');
    expect(load.detectSchemaVersion('not an object')).toBe('unknown');
  });

  // --- fromParsed end-to-end -----------------------------------------------

  it('fromParsed migrates a v1 single-sheet payload to a v2 model', () => {
    const m = load.fromParsed(v1SingleSheetPayload());
    expect(m.schemaVersion).toBe(2);
    expect(m.elements.size).toBe(4);                  // 2 obj + 2 ents
    expect(m.views.size).toBe(4);                     // 4 blocks
    expect(m.sheets.size).toBe(1);
    expect(m.sheets.get('v1-sheet').placements.length).toBe(4);
    expect(window.v2.model.elementsByCategory(m, 'beam').length).toBe(1);
    expect(window.v2.model.elementsByCategory(m, 'plate').length).toBe(2);
    expect(window.v2.model.elementsByCategory(m, 'annotation').length).toBe(1);
  });

  it('fromParsed migrates a v1 multi-sheet payload (active sheet only)', () => {
    // Active sheet is sheet 2 — one plate2 entity.
    const m = load.fromParsed(v1ProjectPayload());
    expect(m.elements.size).toBe(1);
    const plates = window.v2.model.elementsByCategory(m, 'plate');
    expect(plates.length).toBe(1);
  });

  it('fromParsed honours activeSheetIdx (sheet 0 has the SHS beam)', () => {
    const payload = v1ProjectPayload();
    payload.project.activeSheetIdx = 0;
    const m = load.fromParsed(payload);
    const beams = window.v2.model.elementsByCategory(m, 'beam');
    expect(beams.length).toBe(1);
    expect(beams[0].family).toBe('shs');
  });

  it('fromParsed clamps out-of-range activeSheetIdx to sheet 0', () => {
    const payload = v1ProjectPayload();
    payload.project.activeSheetIdx = 99;
    const m = load.fromParsed(payload);
    expect(m.elements.size).toBe(1);                  // sheet 0 = 1 SHS
  });

  it('fromParsed round-trips a v2 payload through deserialise', () => {
    const m = load.fromParsed(v2Payload());
    expect(m.elements.size).toBe(1);
    expect(m.elements.get('beam-x').family).toBe('ub');
    expect(m.views.size).toBe(1);
    expect(m.sheets.size).toBe(1);
  });

  it('fromParsed on unknown input yields an empty model (no throw)', () => {
    const m = load.fromParsed({});
    expect(m).toBeTruthy();
    expect(m.elements.size).toBe(0);
  });

  // --- applyToShadow publishes to appState + dirtyBus ----------------------

  it('applyToShadow assigns the new model to v2.appState.model', () => {
    expect(window.v2.appState.model.elements.size).toBe(0);
    const m = load.applyToShadow(v1SingleSheetPayload());
    expect(window.v2.appState.model).toBe(m);
    expect(window.v2.appState.model.elements.size).toBe(4);
  });

  it('applyToShadow emits model-changed on dirtyBus', () => {
    const calls = [];
    const off = window.v2.engine.dirtyBus.on('model-changed', (p) => calls.push(p));
    load.applyToShadow(v1SingleSheetPayload(), { trigger: 'fixture-load' });
    expect(calls.length).toBe(1);
    expect(calls[0].source).toBe('v2.io.load');
    expect(calls[0].trigger).toBe('fixture-load');
    expect(calls[0].model).toBe(window.v2.appState.model);
    off();
  });

  // --- afterV1Load — the v1 integration point ------------------------------

  /**
   * Install a faithful tiny v1 harness on window so the bare-globals path is
   * reachable. The bridge reads stores by bare name; publishing them as window
   * properties makes that bare read resolve in JSDOM exactly as in a browser.
   */
  function installV1Stores(state) {
    window.objects3D  = state.objects3D  || [];
    window.entities2D = state.entities2D || { elevation: [], sectionA: [], planB: [] };
    window.blocks     = state.blocks     || [
      { viewKey: 'elevation', sheetX: 0, sheetY: 0, boxW: 300, boxH: 300, hidden: false },
    ];
  }

  it('afterV1Load (bare globals path) migrates the live v1 state into the shadow', () => {
    // Bridge un-installed; afterV1Load falls back to the bare-globals read.
    window.v2.engine.v1Bridge.uninstall();
    installV1Stores({
      objects3D: [{ id: 1, type: 'ub', section: '310UB 40.4',
                    x: 0, y: 0, z: 0, length: 6000, axis: { x: 1, y: 0, z: 0 } }],
      entities2D: { elevation: [], sectionA: [], planB: [] },
      blocks: [],
    });
    const m = load.afterV1Load('test-loadProject');
    expect(m).toBeTruthy();
    expect(window.v2.appState.model).toBe(m);
    expect(m.elements.size).toBe(1);
    expect(m.elements.get('v1o:1').family).toBe('ub');
  });

  it('afterV1Load (installed-bridge path) delegates to bridge.syncFromV1', () => {
    // Install the bridge with stubbed v1 mutators. afterV1Load's path 1 routes
    // through the bridge — verify by listening for the dirtyBus event that
    // carries the bridge's own source string ('v1-bridge'), not v2.io.load's.
    installV1Stores({
      objects3D: [{ id: 7, type: 'plate', x: 0, y: 0, z: 0, pt: 12,
        polyPts: [{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 },
                  { x: 100, y: 100, z: 0 }, { x: 0, y: 100, z: 0 }] }],
      entities2D: { elevation: [], sectionA: [], planB: [] },
      blocks: [],
    });
    // The bridge only wraps functions that exist — give it a minimal addObj.
    window.addObj = function () {};
    window.v2.engine.v1Bridge.uninstall();
    window.v2.engine.v1Bridge.install();
    const calls = [];
    const off = window.v2.engine.dirtyBus.on('model-changed', (p) => calls.push(p));
    load.afterV1Load('test-via-bridge');
    expect(calls.length).toBe(1);
    expect(calls[0].source).toBe('v1-bridge');         // bridge handled it
    expect(calls[0].trigger).toBe('test-via-bridge');
    expect(window.v2.appState.model.elements.get('v1o:7').category).toBe('plate');
    off();
    window.v2.engine.v1Bridge.uninstall();
    delete window.addObj;
  });

  it('afterV1Load is idempotent — repeated calls produce equivalent models', () => {
    window.v2.engine.v1Bridge.uninstall();
    installV1Stores({
      objects3D: [{ id: 1, type: 'ub', section: '310UB 40.4',
                    x: 0, y: 0, z: 0, length: 1000, axis: { x: 1, y: 0, z: 0 } }],
      entities2D: { elevation: [], sectionA: [], planB: [] },
      blocks: [],
    });
    const a = load.afterV1Load();
    const b = load.afterV1Load();
    expect(a).toEqual(b);
    expect(b).toBe(window.v2.appState.model);
  });
});
