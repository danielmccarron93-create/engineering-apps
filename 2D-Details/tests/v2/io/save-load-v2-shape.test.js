/*
 * StructDraw v2 — Phase 2: combined v1+v2 file-shape round-trip.
 *
 * Phase 1 verified `v2.io.save.previewSavePayload(model)` alone (a bare v2
 * model, no v1 slice — Phase 1's save path didn't ship). Phase 2 wires v1's
 * `saveProject` in `js/46-save-load.js` so it always passes its v1 `data` to
 * `previewSavePayload(model, data)`, producing the combined shape:
 *
 *   { schemaVersion: 2, v2: <v2 model>, v1: <v1 slice> }
 *
 * Asserts:
 *   1. previewSavePayload(model, v1data) emits both slices intact.
 *   2. JSON.stringify + parse round-trip preserves both slices.
 *   3. detectSchemaVersion picks 'v2' on the combined shape.
 *   4. The v2 slice unpacks into a v2 model whose v2-authoritative plates
 *      round-trip with the same id / polygon / thickness / material.
 *   5. The v1 slice retains every v1 field the in-app `saveProject` writes
 *      (objects3D, entities2D, blocks, weldOverrides, mitrePairs,
 *      priorityForPairV25, sheetInfo, drawingScale / gridSize / nudgeSize /
 *      secCutX / planCutY).
 *
 * window.v2 is populated by tests/v2/setup.mjs; describe/it/expect are globals.
 */

describe('Phase 2 — combined v1+v2 .sd2.json file-shape round-trip', () => {
  let v2, Tool;

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

  /** Build a minimal tool ctx matching event-dispatch.buildCtx's shape. */
  function makeCtx(cursor) {
    if (!v2.appState.tools['place-plate']) v2.appState.tools['place-plate'] = {};
    return {
      event: null, model: v2.appState.model, appState: v2.appState,
      blk: { viewKey: 'elevation' }, sheetMode: '2d',
      cursor: cursor,
      toolState: v2.appState.tools['place-plate'],
      setToolState(updates) { Object.assign(v2.appState.tools['place-plate'], updates || {}); },
      requestRender() {},
      applyTransaction(tx) { return v2.engine.undoStack.applyTransaction(tx); },
    };
  }

  function placeOnePlate() {
    Tool.onPointerDown({ clientX: 0, clientY: 0, button: 0 },
      makeCtx({ u: 100, v: 200, blk: { viewKey: 'elevation' } }));
    Tool.onPointerMove({ clientX: 50, clientY: 50 },
      makeCtx({ u: 350, v: 400, blk: { viewKey: 'elevation' } }));
    Tool.onPointerUp({ clientX: 50, clientY: 50, button: 0 },
      makeCtx({ u: 350, v: 400, blk: { viewKey: 'elevation' } }));
  }

  /** A v1 slice shaped like js/46-save-load.js's saveProject `data` object. */
  function buildV1Data() {
    return {
      version: '1.0',
      timestamp: '2026-05-22T00:00:00.000Z',
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

  it('previewSavePayload(model, v1data) emits {schemaVersion:2, v2, v1} with both slices populated', () => {
    placeOnePlate();
    expect(v2.appState.model.elements.size).toBe(1);
    const v1 = buildV1Data();
    const payload = v2.io.save.previewSavePayload(v2.appState.model, v1);
    expect(payload.schemaVersion).toBe(2);
    expect(payload.v2).toBeTruthy();
    expect(Array.isArray(payload.v2.elements)).toBe(true);
    expect(payload.v2.elements.length).toBe(1);
    expect(payload.v1).toBeTruthy();
    // Every documented v1 field on the saveProject `data` object surfaces in
    // payload.v1 (per js/v2/io/save.js previewSavePayload's allow-list).
    expect(payload.v1.objects3D.length).toBe(1);
    expect(payload.v1.entities2D).toEqual(v1.entities2D);
    expect(payload.v1.blocks.length).toBe(1);
    expect(payload.v1.drawingScale).toBe(10);
    expect(payload.v1.gridSize).toBe(50);
    expect(payload.v1.nudgeSize).toBe(10);
    expect(payload.v1.secCutX).toBe(0);
    expect(payload.v1.planCutY).toBe(0);
    expect(payload.v1.weldOverrides).toEqual({});
    expect(payload.v1.mitrePairs).toEqual({});
    expect(payload.v1.priorityForPairV25).toEqual({});
    expect(payload.v1.sheetInfo).toEqual(v1.sheetInfo);
  });

  it('JSON.stringify + parse preserves the combined shape exactly', () => {
    placeOnePlate();
    const v1 = buildV1Data();
    const payload = v2.io.save.previewSavePayload(v2.appState.model, v1);
    const text = JSON.stringify(payload);
    const parsed = JSON.parse(text);
    expect(parsed).toEqual(payload);
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.v2.elements.length).toBe(1);
    expect(parsed.v1.objects3D.length).toBe(1);
  });

  it('detectSchemaVersion picks "v2" on the combined shape', () => {
    placeOnePlate();
    const v1 = buildV1Data();
    const payload = v2.io.save.previewSavePayload(v2.appState.model, v1);
    const parsed = JSON.parse(JSON.stringify(payload));
    expect(v2.io.load.detectSchemaVersion(parsed)).toBe('v2');
  });

  it('v2 slice round-trips into a fresh model with the same plate', () => {
    placeOnePlate();
    const original = [...v2.appState.model.elements.values()][0];
    const v1 = buildV1Data();
    const payload = v2.io.save.previewSavePayload(v2.appState.model, v1);
    const parsed = JSON.parse(JSON.stringify(payload));
    // fromParsed routes the v2 shape to modelFromJSON, ignoring the v1 slice
    // (that path goes through v1 globals + afterV1Load in the real loadProject).
    const reloaded = v2.io.load.fromParsed(parsed);
    expect(reloaded).toBeTruthy();
    const plates = [...reloaded.elements.values()].filter((e) => e.category === 'plate');
    expect(plates.length).toBe(1);
    const restored = plates[0];
    expect(restored.id).toBe(original.id);
    expect(restored.family).toBe(original.family);
    expect(restored.type).toBe(original.type);
    expect(restored.materialId).toBe(original.materialId);
    expect(restored.params.thickness).toBe(original.params.thickness);
    expect(restored.params.v2Source).toBe('place-plate-tool');
    expect(restored.geometry.polygon.map((p) => [p.x, p.y]))
      .toEqual(original.geometry.polygon.map((p) => [p.x, p.y]));
  });

  it('a bare v1 file (no schemaVersion) still loads via the v1-single path', () => {
    // Backwards-compat smoke: a saved file from BEFORE Phase 2 (no v2 wrapper)
    // is still detected as v1-single and migrates through the same path the
    // load-v1-fixture.test.js exercises. This guarantees Dan's pre-Phase-2
    // .sd2.json archives keep loading after Phase 2 ships.
    const v1Only = buildV1Data();
    expect(v2.io.load.detectSchemaVersion(v1Only)).toBe('v1-single');
    const migrated = v2.io.load.fromParsed(v1Only);
    expect(migrated).toBeTruthy();
    // Migrator produces v2 Elements for the v1 UB beam.
    const beams = [...migrated.elements.values()].filter((e) => e.category === 'beam');
    expect(beams.length).toBe(1);
  });
});
