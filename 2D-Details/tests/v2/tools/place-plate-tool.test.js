/*
 * StructDraw v2 — Phase 2: PlacePlateTool full interaction test
 * (originally written for Phase 1; Phase 2 retired the useV2For.plates flag
 *  so the flag-flip lines and the two flag-only tests were removed).
 *
 * Asserts the v2 tool contract end-to-end, in JSDOM, without touching a real
 * canvas:
 *   - The tool is registered against the engine on load.
 *   - A click + drag-release in RECT mode commits a placeElement transaction.
 *   - A 4-vertex click sequence in POLY mode commits via dblclick.
 *   - The committed element carries:
 *       category 'plate', family 'plate-flat', type 'PL10',
 *       geometry kind 'region' with the expected polygon (in view-local mm),
 *       materialId 'steel-s300', params.thickness 10, params.v2Source.
 *   - Undo + redo round-trip the model.
 *   - The v1-bridge's "v2 survivor graft" keeps the placed plate present after
 *     a v1 mutation triggers a fresh shadow sync (unconditional after Phase 2).
 *
 * window.v2 is populated by tests/v2/setup.mjs; describe/it/expect are globals.
 */

describe('Phase 2 — PlacePlateTool interaction + transaction + bridge survival', () => {
  let v2, Tool;

  beforeEach(() => {
    v2 = window.v2;
    Tool = v2.tools.PlacePlateTool;
    // Reset app state to a clean model so each test starts fresh.
    if (v2.appState && typeof v2.appState.reset === 'function') v2.appState.reset();
    // Clear the undo / redo stacks left over from a prior test.
    if (v2.engine.undoStack && typeof v2.engine.undoStack.clear === 'function') {
      v2.engine.undoStack.clear();
    }
    v2.engine.setActiveTool(null);
  });

  /** Build a minimal ctx that mirrors what event-dispatch.buildCtx produces. */
  function makeCtx(opts) {
    opts = opts || {};
    const blk = opts.blk || { viewKey: 'elevation' };
    const appState = v2.appState;
    if (!appState.tools) appState.tools = {};
    if (!appState.tools['place-plate']) appState.tools['place-plate'] = {};
    return {
      event: opts.event || null,
      model: appState.model,
      appState: appState,
      blk: blk,
      sheetMode: '2d',
      activeFamily: opts.activeFamily || null,
      activeType:   opts.activeType   || null,
      cursor: opts.cursor || null,
      toolState: appState.tools['place-plate'],
      setToolState(updates) { Object.assign(appState.tools['place-plate'], updates || {}); },
      requestRender() { /* no-op for tests */ },
      applyTransaction(tx) { return v2.engine.undoStack.applyTransaction(tx); },
    };
  }

  it('registers PlacePlateTool with the engine on script load', () => {
    expect(Tool).toBeTruthy();
    expect(Tool.id).toBe('place-plate');
    expect(typeof Tool.onPointerDown).toBe('function');
    expect(typeof Tool.onPointerUp).toBe('function');
    expect(v2.engine.TOOLS.get('place-plate')).toBe(Tool);
  });

  it('rect-mode: first click sets anchor, drag-release commits a placeElement', () => {
    v2.engine.setActiveTool('place-plate');
    const ctx = makeCtx({});
    expect(v2.appState.tools['place-plate'].anchor).toBeNull();

    // First click at (100, 200) world coords.
    Tool.onPointerDown(
      { clientX: 50, clientY: 50, button: 0 },
      Object.assign(makeCtx({}), { cursor: { u: 100, v: 200, blk: { viewKey: 'elevation' } } })
    );
    expect(v2.appState.tools['place-plate'].anchor).toEqual({ u: 100, v: 200 });
    expect(v2.appState.model.elements.size).toBe(0); // not yet committed

    // Drag pointer to (300, 350) — > DRAG_THRESHOLD_PX so release commits.
    Tool.onPointerMove(
      { clientX: 200, clientY: 200 },
      Object.assign(makeCtx({}), { cursor: { u: 300, v: 350, blk: { viewKey: 'elevation' } } })
    );

    Tool.onPointerUp(
      { clientX: 200, clientY: 200, button: 0 },
      Object.assign(makeCtx({}), { cursor: { u: 300, v: 350, blk: { viewKey: 'elevation' } } })
    );

    expect(v2.appState.model.elements.size).toBe(1);
    const el = [...v2.appState.model.elements.values()][0];
    expect(el.category).toBe('plate');
    expect(el.family).toBe('plate-flat');
    expect(el.type).toBe('PL10');
    expect(el.geometry.kind).toBe('region');
    expect(el.geometry.viewId).toBe('v1-view-elevation');
    // polygon is the rectangle from (100,200) → (300,350), CCW starting bl
    expect(el.geometry.polygon.map((p) => [p.x, p.y])).toEqual([
      [100, 200], [300, 200], [300, 350], [100, 350],
    ]);
    expect(el.materialId).toBe('steel-s300');
    expect(el.params.thickness).toBe(10);
    expect(el.params.v2Source).toBe('place-plate-tool');
    expect(el.params.v2View).toBe('elevation');

    // After commit the per-tool state is reset so the next placement starts clean.
    expect(v2.appState.tools['place-plate'].anchor).toBeNull();
  });

  it('rect-mode: two-click commit (no drag) also produces a plate', () => {
    v2.engine.setActiveTool('place-plate');

    // First click at (0, 0).
    Tool.onPointerDown(
      { clientX: 100, clientY: 100, button: 0 },
      Object.assign(makeCtx({}), { cursor: { u: 0, v: 0, blk: { viewKey: 'elevation' } } })
    );
    // Pointer up at the same place — distance < DRAG_THRESHOLD_PX, NOT a drag.
    Tool.onPointerUp(
      { clientX: 101, clientY: 101, button: 0 },
      Object.assign(makeCtx({}), { cursor: { u: 0, v: 0, blk: { viewKey: 'elevation' } } })
    );
    expect(v2.appState.model.elements.size).toBe(0);
    expect(v2.appState.tools['place-plate'].anchor).toEqual({ u: 0, v: 0 });

    // Second click at (500, 250) — commits a rect from (0,0) to (500,250).
    Tool.onPointerDown(
      { clientX: 500, clientY: 500, button: 0 },
      Object.assign(makeCtx({}), { cursor: { u: 500, v: 250, blk: { viewKey: 'elevation' } } })
    );
    expect(v2.appState.model.elements.size).toBe(1);
    const el = [...v2.appState.model.elements.values()][0];
    expect(el.geometry.polygon.map((p) => [p.x, p.y])).toEqual([
      [0, 0], [500, 0], [500, 250], [0, 250],
    ]);
  });

  it('poly-mode: P key toggles, click sequence + dblclick commits the polygon', () => {
    v2.engine.setActiveTool('place-plate');

    // P → polygon mode.
    Tool.onKey({ key: 'p' }, makeCtx({}));
    expect(v2.appState.tools['place-plate'].mode).toBe('poly');

    function clickAt(u, v) {
      Tool.onPointerDown(
        { clientX: u, clientY: v, button: 0 },
        Object.assign(makeCtx({}), { cursor: { u: u, v: v, blk: { viewKey: 'elevation' } } })
      );
    }
    clickAt(0, 0);
    clickAt(200, 0);
    clickAt(200, 100);
    clickAt(0, 100);
    expect(v2.appState.tools['place-plate'].poly.length).toBe(4);
    expect(v2.appState.model.elements.size).toBe(0);

    // dblclick to close.
    Tool.onDblClick({}, makeCtx({}));
    expect(v2.appState.model.elements.size).toBe(1);
    const el = [...v2.appState.model.elements.values()][0];
    expect(el.geometry.kind).toBe('region');
    expect(el.geometry.polygon.length).toBe(4);
    expect(el.geometry.polygon.map((p) => [p.x, p.y])).toEqual([
      [0, 0], [200, 0], [200, 100], [0, 100],
    ]);
    expect(v2.appState.tools['place-plate'].poly).toEqual([]);
  });

  it('Escape clears the in-progress placement state', () => {
    v2.engine.setActiveTool('place-plate');

    Tool.onPointerDown(
      { clientX: 0, clientY: 0, button: 0 },
      Object.assign(makeCtx({}), { cursor: { u: 100, v: 100, blk: { viewKey: 'elevation' } } })
    );
    expect(v2.appState.tools['place-plate'].anchor).toBeTruthy();

    Tool.onKey({ key: 'Escape' }, makeCtx({}));
    expect(v2.appState.tools['place-plate'].anchor).toBeNull();
    expect(v2.appState.tools['place-plate'].poly).toEqual([]);
    expect(v2.appState.model.elements.size).toBe(0);
  });

  it('undo removes the placed plate; redo restores it (transactional)', () => {
    v2.engine.setActiveTool('place-plate');

    Tool.onPointerDown(
      { clientX: 0, clientY: 0, button: 0 },
      Object.assign(makeCtx({}), { cursor: { u: 0, v: 0, blk: { viewKey: 'elevation' } } })
    );
    Tool.onPointerMove(
      { clientX: 200, clientY: 200 },
      Object.assign(makeCtx({}), { cursor: { u: 200, v: 100, blk: { viewKey: 'elevation' } } })
    );
    Tool.onPointerUp(
      { clientX: 200, clientY: 200, button: 0 },
      Object.assign(makeCtx({}), { cursor: { u: 200, v: 100, blk: { viewKey: 'elevation' } } })
    );
    expect(v2.appState.model.elements.size).toBe(1);
    expect(v2.engine.undoStack.canUndo()).toBe(true);

    const ur = v2.engine.undoStack.undo();
    expect(ur).toBeTruthy();
    expect(v2.appState.model.elements.size).toBe(0);
    expect(v2.engine.undoStack.canRedo()).toBe(true);

    const rr = v2.engine.undoStack.redo();
    expect(rr).toBeTruthy();
    expect(v2.appState.model.elements.size).toBe(1);
    const el = [...v2.appState.model.elements.values()][0];
    expect(el.category).toBe('plate');
    expect(el.params.v2Source).toBe('place-plate-tool');
  });

  it('v1-bridge re-sync preserves v2-authoritative plates (no clobber)', () => {
    v2.engine.setActiveTool('place-plate');
    // Place a v2 plate.
    Tool.onPointerDown(
      { clientX: 0, clientY: 0, button: 0 },
      Object.assign(makeCtx({}), { cursor: { u: 0, v: 0, blk: { viewKey: 'elevation' } } })
    );
    Tool.onPointerMove(
      { clientX: 50, clientY: 50 },
      Object.assign(makeCtx({}), { cursor: { u: 100, v: 100, blk: { viewKey: 'elevation' } } })
    );
    Tool.onPointerUp(
      { clientX: 50, clientY: 50, button: 0 },
      Object.assign(makeCtx({}), { cursor: { u: 100, v: 100, blk: { viewKey: 'elevation' } } })
    );
    expect(v2.appState.model.elements.size).toBe(1);
    const v2PlateId = [...v2.appState.model.elements.values()][0].id;

    // Stub the v1 stores so the bridge has something to migrate. The JSDOM
    // harness has no v1 boot — we publish the three globals the bridge reads.
    globalThis.objects3D  = [{ id: 7, type: 'ub', section: '310UB40.4',
      x: 0, y: 0, z: 0, length: 6000, axis: { x: 1, y: 0, z: 0 } }];
    globalThis.entities2D = { elevation: [] };
    globalThis.blocks     = [{ viewKey: 'elevation', sheetX: 0, sheetY: 0 }];

    // Force a bridge re-sync (simulates a v1 mutation that triggered the wrapper).
    const synced = v2.engine.v1Bridge.syncFromV1('test-stub');
    expect(synced).toBeTruthy();

    // The v2 plate must STILL be present after the migrator overwrote elements.
    const survivor = synced.elements.get(v2PlateId);
    expect(survivor).toBeTruthy();
    expect(survivor.category).toBe('plate');
    expect(survivor.params.v2Source).toBe('place-plate-tool');

    // The v1 UB beam must ALSO be present — both layers coexist.
    const hasV1Beam = [...synced.elements.values()].some(
      (e) => e.category === 'beam' && e.params && e.params.v1Type === 'ub'
    );
    expect(hasV1Beam).toBe(true);

    // Cleanup the stubbed globals so other tests don't see them.
    delete globalThis.objects3D;
    delete globalThis.entities2D;
    delete globalThis.blocks;
  });

  // The "flag-off drops the v2 plate" test that used to live here was retired
  // alongside the useV2For.plates feature flag in architecture-v2 Phase 2.
  // The graft is now unconditional — the v1-bridge re-sync preserve test
  // above is the surviving exit-criterion check.
});
