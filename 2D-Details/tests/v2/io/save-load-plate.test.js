/*
 * StructDraw v2 — Phase 2: save-load round-trip for v2 plates
 * (originally written for Phase 1; Phase 2 retired the useV2For.plates flag
 *  so the flag-flip in the beforeEach was removed).
 *
 * Asserts the contract:
 *   1. A model holding a v2-authoritative plate serialises to a v2 save
 *      payload (`previewSavePayload` / `saveModelToString`).
 *   2. The payload survives `JSON.stringify` + `JSON.parse` unchanged.
 *   3. `v2.io.load.fromParsed(parsed)` rebuilds a model whose plate matches
 *      the original — same id, family, type, polygon, materialId, params.
 *   4. Autosave: `markDirty` -> `flush` writes localStorage; `restore` reads
 *      it back and replaces appState.model with the round-tripped model.
 *
 * window.v2 is populated by tests/v2/setup.mjs; describe/it/expect are globals.
 */

describe('Phase 2 — v2 plate save/load round-trip', () => {
  let v2, Tool;

  function placeOnePlate() {
    Tool.onPointerDown(
      { clientX: 0, clientY: 0, button: 0 },
      {
        event: null, model: v2.appState.model, appState: v2.appState,
        blk: { viewKey: 'elevation' }, sheetMode: '2d',
        activeFamily: null, activeType: null,
        cursor: { u: 50, v: 75, blk: { viewKey: 'elevation' } },
        toolState: v2.appState.tools['place-plate'] || (v2.appState.tools['place-plate'] = {}),
        setToolState(updates) { Object.assign(v2.appState.tools['place-plate'], updates || {}); },
        requestRender() {},
        applyTransaction(tx) { return v2.engine.undoStack.applyTransaction(tx); },
      }
    );
    Tool.onPointerMove(
      { clientX: 100, clientY: 100 },
      {
        event: null, model: v2.appState.model, appState: v2.appState,
        blk: { viewKey: 'elevation' }, sheetMode: '2d',
        cursor: { u: 250, v: 175, blk: { viewKey: 'elevation' } },
        toolState: v2.appState.tools['place-plate'],
        setToolState(updates) { Object.assign(v2.appState.tools['place-plate'], updates || {}); },
        requestRender() {},
        applyTransaction(tx) { return v2.engine.undoStack.applyTransaction(tx); },
      }
    );
    Tool.onPointerUp(
      { clientX: 100, clientY: 100, button: 0 },
      {
        event: null, model: v2.appState.model, appState: v2.appState,
        blk: { viewKey: 'elevation' }, sheetMode: '2d',
        cursor: { u: 250, v: 175, blk: { viewKey: 'elevation' } },
        toolState: v2.appState.tools['place-plate'],
        setToolState(updates) { Object.assign(v2.appState.tools['place-plate'], updates || {}); },
        requestRender() {},
        applyTransaction(tx) { return v2.engine.undoStack.applyTransaction(tx); },
      }
    );
  }

  beforeEach(() => {
    v2 = window.v2;
    Tool = v2.tools.PlacePlateTool;
    if (v2.appState && typeof v2.appState.reset === 'function') v2.appState.reset();
    if (v2.engine.undoStack && typeof v2.engine.undoStack.clear === 'function') {
      v2.engine.undoStack.clear();
    }
    v2.appState.tools = {};
    v2.engine.setActiveTool('place-plate');
  });

  it('previewSavePayload emits schemaVersion 2 + v2 slice including the plate', () => {
    placeOnePlate();
    expect(v2.appState.model.elements.size).toBe(1);

    const payload = v2.io.save.previewSavePayload(v2.appState.model);
    expect(payload.schemaVersion).toBe(2);
    expect(payload.v2).toBeTruthy();
    expect(Array.isArray(payload.v2.elements)).toBe(true);
    expect(payload.v2.elements.length).toBe(1);
    const persistedPlate = payload.v2.elements[0];
    expect(persistedPlate.category).toBe('plate');
    expect(persistedPlate.family).toBe('plate-flat');
    expect(persistedPlate.type).toBe('PL10');
    expect(persistedPlate.geometry.kind).toBe('region');
    expect(persistedPlate.geometry.viewId).toBe('v1-view-elevation');
    expect(persistedPlate.params.thickness).toBe(10);
    expect(persistedPlate.params.v2Source).toBe('place-plate-tool');
  });

  it('saveModelToString -> JSON.parse -> fromParsed round-trips the plate', () => {
    placeOnePlate();
    const original = [...v2.appState.model.elements.values()][0];

    const text = v2.io.save.saveModelToString(v2.appState.model);
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(20);
    const parsed = JSON.parse(text);
    expect(parsed.schemaVersion).toBe(2);

    // Detected as v2 by the load router.
    expect(v2.io.load.detectSchemaVersion(parsed)).toBe('v2');

    // Reload into a fresh model and compare element-by-element.
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
    expect(restored.geometry.viewId).toBe(original.geometry.viewId);
    expect(restored.geometry.polygon.map((p) => [p.x, p.y])).toEqual(
      original.geometry.polygon.map((p) => [p.x, p.y])
    );
    expect(restored.params).toEqual(original.params);
  });

  it('autosave: markDirty + flush writes localStorage; restore reads it back', () => {
    placeOnePlate();
    const originalId = [...v2.appState.model.elements.values()][0].id;

    // Use an in-memory storage shim so the test is hermetic.
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

    // Re-install the autosave with the in-memory storage.
    v2.engine.autosave.uninstall();
    v2.engine.autosave.install({ storage: memStore, documentRef: fakeDoc,
      pollMs: 50, debounceMs: 0, storagePrefix: 'sd_v2_autosave_test_' });
    v2.engine.autosave.markDirty();
    const text = v2.engine.autosave.flush();
    expect(typeof text).toBe('string');
    expect(memStore._data['sd_v2_autosave_test_' + v2.appState.model.project.id]).toBe(text);
    // Title indicator clears after flush.
    expect(fakeDoc.title).toBe('StructDraw');

    // Wipe the in-memory model, then restore from the autosave.
    v2.appState.reset();
    expect(v2.appState.model.elements.size).toBe(0);
    // restore() reads via the project id of the CURRENT (fresh) model, which
    // matches the prior session only when the prior session also wrote under
    // the same id. The test resets to a fresh project id; explicitly seed the
    // project id on the new model so the lookup hits the same key.
    v2.appState.model.project = v2.appState.model.project; // (no-op, but clarity)
    // Force the new model's project id to the one that was saved by parsing
    // the stored JSON: that key is `sd_v2_autosave_test_<prior project id>`.
    const savedKey = Object.keys(memStore._data)[0];
    const priorProjectId = savedKey.replace('sd_v2_autosave_test_', '');
    v2.appState.model.project.id = priorProjectId;

    const restored = v2.engine.autosave.restore();
    expect(restored).toBeTruthy();
    expect(restored.elements.size).toBe(1);
    const plate = [...restored.elements.values()][0];
    expect(plate.id).toBe(originalId);
    expect(plate.category).toBe('plate');

    v2.engine.autosave.uninstall();
  });

  it('save preserves multiple plates in insertion order', () => {
    // Place three plates with distinct cursors so each commits separately.
    function place(u0, v0, u1, v1) {
      Tool.onPointerDown(
        { clientX: 0, clientY: 0, button: 0 },
        Object.assign(buildCtx(), { cursor: { u: u0, v: v0, blk: { viewKey: 'elevation' } } })
      );
      Tool.onPointerMove(
        { clientX: 100, clientY: 100 },
        Object.assign(buildCtx(), { cursor: { u: u1, v: v1, blk: { viewKey: 'elevation' } } })
      );
      Tool.onPointerUp(
        { clientX: 100, clientY: 100, button: 0 },
        Object.assign(buildCtx(), { cursor: { u: u1, v: v1, blk: { viewKey: 'elevation' } } })
      );
    }
    function buildCtx() {
      if (!v2.appState.tools['place-plate']) v2.appState.tools['place-plate'] = {};
      return {
        event: null, model: v2.appState.model, appState: v2.appState,
        blk: { viewKey: 'elevation' }, sheetMode: '2d',
        toolState: v2.appState.tools['place-plate'],
        setToolState(updates) { Object.assign(v2.appState.tools['place-plate'], updates || {}); },
        requestRender() {},
        applyTransaction(tx) { return v2.engine.undoStack.applyTransaction(tx); },
      };
    }
    place(0, 0, 100, 100);
    place(200, 0, 300, 100);
    place(400, 0, 500, 100);
    expect(v2.appState.model.elements.size).toBe(3);

    const ids = [...v2.appState.model.elements.keys()];
    const payload = v2.io.save.previewSavePayload(v2.appState.model);
    expect(payload.v2.elements.map((e) => e.id)).toEqual(ids);

    const reloaded = v2.io.load.fromParsed(JSON.parse(JSON.stringify(payload)));
    expect([...reloaded.elements.keys()]).toEqual(ids);
  });
});
