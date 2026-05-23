/*
 * StructDraw v2 — Phase 3: save-load round-trip for v2 bolts.
 *
 * Mirrors tests/v2/io/save-load-plate.test.js + save-load-v2-shape.test.js for
 * the new v2 bolt path. Asserts:
 *
 *   1. A model holding a v2-authoritative bolt serialises to a v2 save payload
 *      via `previewSavePayload(model)` and `saveModelToString(model)`.
 *   2. The payload survives JSON.stringify + JSON.parse unchanged.
 *   3. `v2.io.load.fromParsed(parsed)` rebuilds a model whose bolt matches the
 *      original — same id, family, type, location, materialId, params.
 *   4. `previewSavePayload(model, v1data)` emits the combined Phase 2 file
 *      shape with both slices populated.
 *   5. A bare v1 file (no schemaVersion, no v2 fastener slice) still loads via
 *      the v1-single path — backwards-compat smoke for pre-Phase-3 archives.
 *   6. Multiple bolts preserve insertion order through the round-trip.
 *
 * window.v2 is populated by tests/v2/setup.mjs; describe/it/expect are globals.
 */

describe('Phase 3 — v2 bolt save/load round-trip', () => {
  let v2, Tool;

  beforeEach(() => {
    v2 = window.v2;
    Tool = v2.tools.PlaceBoltTool;
    if (v2.appState && typeof v2.appState.reset === 'function') v2.appState.reset();
    if (v2.engine.undoStack && typeof v2.engine.undoStack.clear === 'function') {
      v2.engine.undoStack.clear();
    }
    v2.appState.tools = {};
    // The bolt save/load tests run with the flag ON — once the bolt is in the
    // model the save path is identical regardless of the flag, but the placement
    // helper short-circuits when the flag is off.
    v2.featureFlags.set('bolts', true);
    v2.engine.setActiveTool('place-bolt');
  });

  afterEach(() => {
    v2.featureFlags.set('bolts', false);
  });

  /** Build a minimal tool ctx matching event-dispatch.buildCtx's shape. */
  function makeCtx(cursor) {
    if (!v2.appState.tools['place-bolt']) v2.appState.tools['place-bolt'] = {};
    return {
      event: null, model: v2.appState.model, appState: v2.appState,
      blk: { viewKey: 'elevation' }, sheetMode: '2d',
      cursor: cursor,
      toolState: v2.appState.tools['place-bolt'],
      setToolState(updates) { Object.assign(v2.appState.tools['place-bolt'], updates || {}); },
      requestRender() {},
      applyTransaction(tx) { return v2.engine.undoStack.applyTransaction(tx); },
    };
  }

  function placeOneBolt(opts) {
    opts = opts || {};
    // Use explicit-null checks — `||` would coerce a legitimate `u: 0` to 100.
    const u = (opts.u !== undefined && opts.u !== null) ? opts.u : 100;
    const v = (opts.v !== undefined && opts.v !== null) ? opts.v : 200;
    const cursor = { u: u, v: v, blk: { viewKey: 'elevation' } };
    Tool.onPointerDown({ clientX: 1, clientY: 1, button: 0 }, makeCtx(cursor));
  }

  /** A v1 slice shaped like js/46-save-load.js's saveProject `data` object. */
  function buildV1Data() {
    return {
      version: '1.0',
      timestamp: '2026-05-23T00:00:00.000Z',
      drawingScale: 10,
      gridSize: 50,
      nudgeSize: 10,
      secCutX: 0,
      planCutY: 0,
      objects3D: [{ id: 1, type: 'ub', section: '310UB40.4', x: 0, y: 0, z: 0,
                    length: 6000, axis: { x: 1, y: 0, z: 0 } }],
      entities2D: { elevation: [], sectionA: [], planB: [] },
      weldOverrides: {},
      mitrePairs: {},
      priorityForPairV25: {},
      sheetInfo: { project: 'Test Project', client: 'Test Client', description: '' },
      blocks: [{ viewKey: 'elevation', sheetX: 0, sheetY: 0, boxW: 400, boxH: 300, hidden: false }],
    };
  }

  it('previewSavePayload emits schemaVersion 2 + v2 slice including the bolt', () => {
    placeOneBolt();
    expect(v2.appState.model.elements.size).toBe(1);

    const payload = v2.io.save.previewSavePayload(v2.appState.model);
    expect(payload.schemaVersion).toBe(2);
    expect(payload.v2).toBeTruthy();
    expect(Array.isArray(payload.v2.elements)).toBe(true);
    expect(payload.v2.elements.length).toBe(1);

    const persisted = payload.v2.elements[0];
    expect(persisted.category).toBe('fastener');
    expect(persisted.family).toBe('as1252-bolt');
    expect(persisted.type).toBe('M20');
    expect(persisted.materialId).toBe('bolt-as1252-grade-8.8');
    expect(persisted.geometry.kind).toBe('point');
    expect(persisted.geometry.location).toEqual({ x: 100, y: 200, z: 0 });
    expect(persisted.params.aspect).toBe('sec');
    expect(persisted.params.grip).toBe(12);
    expect(persisted.params.v2Source).toBe('place-bolt-tool');
    expect(persisted.params.v2View).toBe('elevation');
  });

  it('saveModelToString → JSON.parse → fromParsed round-trips the bolt', () => {
    placeOneBolt({ u: 250, v: 400 });
    const original = [...v2.appState.model.elements.values()][0];

    const text = v2.io.save.saveModelToString(v2.appState.model);
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(20);
    const parsed = JSON.parse(text);
    expect(parsed.schemaVersion).toBe(2);
    expect(v2.io.load.detectSchemaVersion(parsed)).toBe('v2');

    const reloaded = v2.io.load.fromParsed(parsed);
    expect(reloaded).toBeTruthy();
    expect(reloaded.elements.size).toBe(1);
    const restored = [...reloaded.elements.values()][0];
    expect(restored.id).toBe(original.id);
    expect(restored.category).toBe(original.category);
    expect(restored.family).toBe(original.family);
    expect(restored.type).toBe(original.type);
    expect(restored.materialId).toBe(original.materialId);
    expect(restored.geometry.kind).toBe(original.geometry.kind);
    expect(restored.geometry.location).toEqual(original.geometry.location);
    expect(restored.params).toEqual(original.params);
  });

  it('previewSavePayload(model, v1data) emits {schemaVersion:2, v2:{bolt}, v1:{...}} combined shape', () => {
    placeOneBolt();
    const v1 = buildV1Data();
    const payload = v2.io.save.previewSavePayload(v2.appState.model, v1);
    expect(payload.schemaVersion).toBe(2);
    expect(payload.v2).toBeTruthy();
    expect(payload.v2.elements.length).toBe(1);
    expect(payload.v2.elements[0].category).toBe('fastener');
    expect(payload.v1).toBeTruthy();
    expect(payload.v1.objects3D.length).toBe(1);
    expect(payload.v1.entities2D).toEqual(v1.entities2D);
    expect(payload.v1.blocks.length).toBe(1);

    const parsed = JSON.parse(JSON.stringify(payload));
    expect(v2.io.load.detectSchemaVersion(parsed)).toBe('v2');
    const reloaded = v2.io.load.fromParsed(parsed);
    const fasteners = [...reloaded.elements.values()].filter((e) => e.category === 'fastener');
    expect(fasteners.length).toBe(1);
    expect(fasteners[0].params.v2Source).toBe('place-bolt-tool');
  });

  it('a bare v1 file (no schemaVersion, no fasteners) still loads via the v1-single path', () => {
    // Pre-Phase-3 archives have no v2 slice. Verify the migrator + load router
    // still produce a sensible model for them — the backwards-compat smoke.
    const v1Only = buildV1Data();
    expect(v2.io.load.detectSchemaVersion(v1Only)).toBe('v1-single');
    const migrated = v2.io.load.fromParsed(v1Only);
    expect(migrated).toBeTruthy();
    const beams = [...migrated.elements.values()].filter((e) => e.category === 'beam');
    expect(beams.length).toBe(1);
    const fasteners = [...migrated.elements.values()].filter((e) => e.category === 'fastener');
    // No v2 bolt was in the file, so none appears in the migrated model.
    expect(fasteners.length).toBe(0);
  });

  it('multiple bolts preserve insertion order through save → reload', () => {
    placeOneBolt({ u: 0,   v: 0   });
    placeOneBolt({ u: 100, v: 0   });
    placeOneBolt({ u: 200, v: 0   });
    expect(v2.appState.model.elements.size).toBe(3);

    const ids = [...v2.appState.model.elements.keys()];
    const payload = v2.io.save.previewSavePayload(v2.appState.model);
    expect(payload.v2.elements.map((e) => e.id)).toEqual(ids);

    const reloaded = v2.io.load.fromParsed(JSON.parse(JSON.stringify(payload)));
    expect([...reloaded.elements.keys()]).toEqual(ids);
    const xs = [...reloaded.elements.values()].map((e) => e.geometry.location.x);
    expect(xs).toEqual([0, 100, 200]);
  });

  it('autosave: markDirty + flush writes localStorage; restore reads the bolt back', () => {
    placeOneBolt({ u: 50, v: 75 });
    const originalId = [...v2.appState.model.elements.values()][0].id;

    const memStore = (function () {
      const data = {};
      return {
        getItem(k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
        setItem(k, v) { data[k] = String(v); },
        removeItem(k) { delete data[k]; },
        _data: data,
      };
    })();
    const fakeDoc = { title: 'StructDraw' };

    v2.engine.autosave.uninstall();
    v2.engine.autosave.install({ storage: memStore, documentRef: fakeDoc,
      pollMs: 50, debounceMs: 0, storagePrefix: 'sd_v2_autosave_test_' });
    v2.engine.autosave.markDirty();
    const text = v2.engine.autosave.flush();
    expect(typeof text).toBe('string');
    expect(memStore._data['sd_v2_autosave_test_' + v2.appState.model.project.id]).toBe(text);

    v2.appState.reset();
    expect(v2.appState.model.elements.size).toBe(0);
    const savedKey = Object.keys(memStore._data)[0];
    const priorProjectId = savedKey.replace('sd_v2_autosave_test_', '');
    v2.appState.model.project.id = priorProjectId;

    const restored = v2.engine.autosave.restore();
    expect(restored).toBeTruthy();
    expect(restored.elements.size).toBe(1);
    const bolt = [...restored.elements.values()][0];
    expect(bolt.id).toBe(originalId);
    expect(bolt.category).toBe('fastener');
    expect(bolt.params.v2Source).toBe('place-bolt-tool');

    v2.engine.autosave.uninstall();
  });
});
