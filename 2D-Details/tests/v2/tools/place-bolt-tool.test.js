/*
 * StructDraw v2 — Phase 3: PlaceBoltTool full interaction test
 *
 * Asserts the v2 tool contract end-to-end, in JSDOM, without touching a real
 * canvas:
 *   - The tool is registered against the engine on load.
 *   - With the useV2For.bolts feature flag OFF, every handler short-circuits
 *     (no element is added; v1 keeps full control of the canvas).
 *   - With the flag ON, a single click commits a placeElement transaction.
 *   - The committed element carries:
 *       category 'fastener', family 'as1252-bolt', type 'M20',
 *       geometry kind 'point' with location at the cursor (z = 0),
 *       materialId 'bolt-as1252-grade-8.8',
 *       params.aspect 'sec', params.rot 0, params.grip 12, gripOverride null,
 *       params.washers 'both', params.nutStyle 'hex',
 *       params.v2Source 'place-bolt-tool', params.v2View 'elevation'.
 *   - Undo + redo round-trip the model.
 *   - The v1-bridge's "v2 survivor graft" keeps the placed bolt present after
 *     a v1 mutation triggers a fresh shadow sync — but only when the flag
 *     is on; flipping the flag off drops the bolt on the next sync (proving
 *     the graft is gated by the flag, as Phase 1 plate gating proved before).
 *
 * window.v2 is populated by tests/v2/setup.mjs; describe/it/expect are globals.
 */

describe('Phase 3 — PlaceBoltTool interaction + transaction + bridge survival', () => {
  let v2, Tool;

  beforeEach(() => {
    v2 = window.v2;
    Tool = v2.tools.PlaceBoltTool;
    // Reset app state to a clean model so each test starts fresh.
    if (v2.appState && typeof v2.appState.reset === 'function') v2.appState.reset();
    if (v2.engine.undoStack && typeof v2.engine.undoStack.clear === 'function') {
      v2.engine.undoStack.clear();
    }
    v2.engine.setActiveTool(null);
    // Every test starts with the flag OFF so the byte-identical-to-today guarantee
    // is exercised explicitly in test 1.
    v2.featureFlags.set('bolts', false);
  });

  afterEach(() => {
    // Don't leak the flag into other test files.
    v2.featureFlags.set('bolts', false);
  });

  /** Build a minimal ctx that mirrors what event-dispatch.buildCtx produces. */
  function makeCtx(opts) {
    opts = opts || {};
    const blk = opts.blk || { viewKey: 'elevation' };
    const appState = v2.appState;
    if (!appState.tools) appState.tools = {};
    if (!appState.tools['place-bolt']) appState.tools['place-bolt'] = {};
    return {
      event: opts.event || null,
      model: appState.model,
      appState: appState,
      blk: blk,
      sheetMode: '2d',
      activeFamily: opts.activeFamily || null,
      activeType:   opts.activeType   || null,
      cursor: opts.cursor || null,
      toolState: appState.tools['place-bolt'],
      setToolState(updates) { Object.assign(appState.tools['place-bolt'], updates || {}); },
      requestRender() { /* no-op for tests */ },
      applyTransaction(tx) { return v2.engine.undoStack.applyTransaction(tx); },
    };
  }

  it('registers PlaceBoltTool with the engine on script load', () => {
    expect(Tool).toBeTruthy();
    expect(Tool.id).toBe('place-bolt');
    expect(typeof Tool.onPointerDown).toBe('function');
    expect(typeof Tool.onPointerMove).toBe('function');
    expect(typeof Tool.onKey).toBe('function');
    expect(v2.engine.TOOLS.get('place-bolt')).toBe(Tool);
  });

  it('flag OFF: every pointer handler short-circuits — no element added', () => {
    v2.engine.setActiveTool('place-bolt');
    // Flag default is OFF (set in beforeEach).
    const cursor = { u: 100, v: 200, blk: { viewKey: 'elevation' } };

    expect(Tool.onPointerMove({ clientX: 10, clientY: 10 }, Object.assign(makeCtx({}), { cursor: cursor }))).toBe(false);
    expect(Tool.onPointerDown({ clientX: 10, clientY: 10, button: 0 }, Object.assign(makeCtx({}), { cursor: cursor }))).toBe(false);
    expect(Tool.onKey({ key: 'Escape' }, makeCtx({}))).toBe(false);

    expect(v2.appState.model.elements.size).toBe(0);
    expect(v2.engine.undoStack.canUndo()).toBe(false);
  });

  it('flag ON: single click commits a placeElement with the expected shape', () => {
    v2.featureFlags.set('bolts', true);
    v2.engine.setActiveTool('place-bolt');

    expect(v2.appState.model.elements.size).toBe(0);

    const cursor = { u: 250, v: 400, blk: { viewKey: 'elevation' } };
    const result = Tool.onPointerDown(
      { clientX: 100, clientY: 100, button: 0 },
      Object.assign(makeCtx({}), { cursor: cursor })
    );
    expect(result).toBe(true);
    expect(v2.appState.model.elements.size).toBe(1);

    const el = [...v2.appState.model.elements.values()][0];
    expect(el.category).toBe('fastener');
    expect(el.family).toBe('as1252-bolt');
    expect(el.type).toBe('M20');
    expect(el.materialId).toBe('bolt-as1252-grade-8.8');
    expect(el.geometry.kind).toBe('point');
    expect(el.geometry.location).toEqual({ x: 250, y: 400, z: 0 });
    expect(el.geometry.normal).toEqual({ x: 0, y: 0, z: 1 });
    expect(el.params.aspect).toBe('sec');
    expect(el.params.rot).toBe(0);
    expect(el.params.grip).toBe(12);
    expect(el.params.gripOverride).toBe(null);
    expect(el.params.washers).toBe('both');
    expect(el.params.nutStyle).toBe('hex');
    expect(el.params.grade).toBe('8.8');
    expect(el.params.v2Source).toBe('place-bolt-tool');
    expect(el.params.v2View).toBe('elevation');
  });

  it('flag ON: second click on a different cursor adds a second bolt (no anchor state)', () => {
    v2.featureFlags.set('bolts', true);
    v2.engine.setActiveTool('place-bolt');

    Tool.onPointerDown({ clientX: 10, clientY: 10, button: 0 },
      Object.assign(makeCtx({}), { cursor: { u: 0,   v: 0,   blk: { viewKey: 'elevation' } } }));
    Tool.onPointerDown({ clientX: 20, clientY: 20, button: 0 },
      Object.assign(makeCtx({}), { cursor: { u: 200, v: 0,   blk: { viewKey: 'elevation' } } }));
    Tool.onPointerDown({ clientX: 30, clientY: 30, button: 0 },
      Object.assign(makeCtx({}), { cursor: { u: 400, v: 0,   blk: { viewKey: 'elevation' } } }));

    expect(v2.appState.model.elements.size).toBe(3);
    const locs = [...v2.appState.model.elements.values()].map((e) => e.geometry.location.x);
    expect(locs).toEqual([0, 200, 400]);
  });

  it('flag ON: pointerUp is a no-op (bolts commit on pointerDown, no double commit)', () => {
    v2.featureFlags.set('bolts', true);
    v2.engine.setActiveTool('place-bolt');

    const cursor = { u: 100, v: 100, blk: { viewKey: 'elevation' } };
    Tool.onPointerDown({ clientX: 1, clientY: 1, button: 0 },
      Object.assign(makeCtx({}), { cursor: cursor }));
    expect(v2.appState.model.elements.size).toBe(1);

    // pointerUp at the same cursor — must NOT commit a second bolt.
    const up = Tool.onPointerUp({ clientX: 1, clientY: 1, button: 0 },
      Object.assign(makeCtx({}), { cursor: cursor }));
    expect(up).toBe(false);
    expect(v2.appState.model.elements.size).toBe(1);
  });

  it('flag ON: right-click pointerDown does not commit (left-click only)', () => {
    v2.featureFlags.set('bolts', true);
    v2.engine.setActiveTool('place-bolt');

    const cursor = { u: 5, v: 5, blk: { viewKey: 'elevation' } };
    const result = Tool.onPointerDown({ clientX: 1, clientY: 1, button: 2 },
      Object.assign(makeCtx({}), { cursor: cursor }));
    expect(result).toBe(false);
    expect(v2.appState.model.elements.size).toBe(0);
  });

  it('flag ON: Escape clears the preview, leaves no element behind', () => {
    v2.featureFlags.set('bolts', true);
    v2.engine.setActiveTool('place-bolt');

    Tool.onPointerMove({ clientX: 1, clientY: 1 },
      Object.assign(makeCtx({}), { cursor: { u: 50, v: 50, blk: { viewKey: 'elevation' } } }));
    expect(v2.appState.tools['place-bolt'].preview).toBeTruthy();

    const handled = Tool.onKey({ key: 'Escape' }, makeCtx({}));
    expect(handled).toBe(true);
    expect(v2.appState.tools['place-bolt'].preview).toBe(null);
    expect(v2.appState.tools['place-bolt'].cursor).toBe(null);
    expect(v2.appState.model.elements.size).toBe(0);
  });

  it('flag ON: ui.activeBolt* slots flow through to the placed element', () => {
    v2.featureFlags.set('bolts', true);
    v2.engine.setActiveTool('place-bolt');
    // Activate with a different size + grade + aspect via the BB-rail activator.
    v2.ui.paletteBBRail.activateBolt({ size: 'M24', grade: '10.9', aspect: 'elev', rot: 90 });

    // Pass blk via makeCtx so the tool's activeViewKey resolves to sectionA;
    // (the tool reads ctx.blk.viewKey, not cursor.blk.viewKey).
    Tool.onPointerDown({ clientX: 1, clientY: 1, button: 0 },
      Object.assign(
        makeCtx({ blk: { viewKey: 'sectionA' } }),
        { cursor: { u: 10, v: 20, blk: { viewKey: 'sectionA' } } }
      ));

    const el = [...v2.appState.model.elements.values()][0];
    expect(el.type).toBe('M24');
    expect(el.materialId).toBe('bolt-as1252-grade-10.9');
    expect(el.params.grade).toBe('10.9');
    expect(el.params.aspect).toBe('elev');
    expect(el.params.rot).toBe(90);
    expect(el.params.v2View).toBe('sectionA');
  });

  it('flag ON: undo removes the placed bolt; redo restores it (transactional)', () => {
    v2.featureFlags.set('bolts', true);
    v2.engine.setActiveTool('place-bolt');

    Tool.onPointerDown({ clientX: 1, clientY: 1, button: 0 },
      Object.assign(makeCtx({}), { cursor: { u: 30, v: 40, blk: { viewKey: 'elevation' } } }));
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
    expect(el.category).toBe('fastener');
    expect(el.params.v2Source).toBe('place-bolt-tool');
  });

  it('flag ON: v1-bridge re-sync preserves v2-authoritative bolts (the exit-criterion graft)', () => {
    v2.featureFlags.set('bolts', true);
    v2.engine.setActiveTool('place-bolt');

    Tool.onPointerDown({ clientX: 1, clientY: 1, button: 0 },
      Object.assign(makeCtx({}), { cursor: { u: 100, v: 100, blk: { viewKey: 'elevation' } } }));
    expect(v2.appState.model.elements.size).toBe(1);
    const v2BoltId = [...v2.appState.model.elements.values()][0].id;

    // Stub the v1 stores so the bridge has something to migrate.
    globalThis.objects3D  = [{ id: 7, type: 'ub', section: '310UB40.4',
      x: 0, y: 0, z: 0, length: 6000, axis: { x: 1, y: 0, z: 0 } }];
    globalThis.entities2D = { elevation: [] };
    globalThis.blocks     = [{ viewKey: 'elevation', sheetX: 0, sheetY: 0 }];

    const synced = v2.engine.v1Bridge.syncFromV1('test-stub');
    expect(synced).toBeTruthy();

    // The v2 bolt MUST survive the migrator overwriting elements.
    const survivor = synced.elements.get(v2BoltId);
    expect(survivor).toBeTruthy();
    expect(survivor.category).toBe('fastener');
    expect(survivor.params.v2Source).toBe('place-bolt-tool');

    // The v1 UB beam must ALSO be present — both layers coexist.
    const hasV1Beam = [...synced.elements.values()].some(
      (e) => e.category === 'beam' && e.params && e.params.v1Type === 'ub'
    );
    expect(hasV1Beam).toBe(true);

    delete globalThis.objects3D;
    delete globalThis.entities2D;
    delete globalThis.blocks;
  });

  it('flag OFF: v1-bridge re-sync DROPS v2-authoritative bolts (proves graft is flag-gated)', () => {
    // Place a bolt with the flag on …
    v2.featureFlags.set('bolts', true);
    v2.engine.setActiveTool('place-bolt');
    Tool.onPointerDown({ clientX: 1, clientY: 1, button: 0 },
      Object.assign(makeCtx({}), { cursor: { u: 100, v: 100, blk: { viewKey: 'elevation' } } }));
    expect(v2.appState.model.elements.size).toBe(1);
    const v2BoltId = [...v2.appState.model.elements.values()][0].id;

    // … then flip the flag OFF and trigger a bridge re-sync. Without the flag
    // gate the graft skips fasteners, so the bolt vanishes.
    v2.featureFlags.set('bolts', false);
    globalThis.objects3D  = [];
    globalThis.entities2D = {};
    globalThis.blocks     = [];

    const synced = v2.engine.v1Bridge.syncFromV1('test-flag-off');
    expect(synced).toBeTruthy();
    // The bolt is GONE — the graft was flag-gated.
    expect(synced.elements.get(v2BoltId)).toBeFalsy();

    delete globalThis.objects3D;
    delete globalThis.entities2D;
    delete globalThis.blocks;
  });
});
