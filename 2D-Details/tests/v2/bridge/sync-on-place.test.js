/*
 * StructDraw v2 — Phase 0d: the v1 -> v2 shadow bridge (js/v2/engine/v1-bridge.js).
 *
 * Verifies that after every v1 state mutation the v2 shadow model
 * (v2.appState.model) equals a fresh migration of the current v1 state — the
 * Phase 0d exit criterion (09-build-plan.md): "a CI test does 100 randomised
 * v1 mutations and asserts v2.appState.model always matches the migrated state
 * of objects3D + entities2D."
 *
 * v1's state lives in bare top-level `let`s that indirect eval cannot share
 * across files, so this suite installs a FAITHFUL in-JSDOM v1 harness: the
 * objects3D / entities2D / blocks stores and the real v1 mutator contract
 * (addObj / delObj / addEnt2D / undo / redo / v25DeleteSelected, transcribed
 * 1:1 from js/05-state.js + js/71-v25-selection.js). The bridge under test is
 * the real js/v2/engine/v1-bridge.js; only the v1 functions it wraps are the
 * harness's. The real-app integration is covered by the browser smoke-test in
 * the Phase 0d build prompt.
 *
 * window.v2 is populated by tests/v2/setup.mjs; describe/it/expect are globals.
 */

function clone(x) { return JSON.parse(JSON.stringify(x)); }

/**
 * Install a faithful v1 environment on `window`: the three stores and the
 * mutator functions, each transcribed from the real v1 source. The bridge
 * reads the stores by bare global name; publishing them as window properties
 * makes that bare read resolve under JSDOM exactly as it does in a browser.
 */
function installV1Harness() {
  window.objects3D = [];
  window.entities2D = { elevation: [], sectionA: [], planB: [] };
  window.blocks = [
    { viewKey: 'elevation', sheetX: 0, sheetY: 0, boxW: 300, boxH: 300, hidden: false },
    { viewKey: 'sectionA', sheetX: 320, sheetY: 0, boxW: 300, boxH: 300, hidden: false },
    { viewKey: 'planB', sheetX: 0, sheetY: 320, boxW: 300, boxH: 300, hidden: false },
    { viewKey: 'isometric', sheetX: 320, sheetY: 320, boxW: 300, boxH: 300, hidden: false },
  ];
  window.objIdN = 1;
  window.ent2dIdN = 1;
  window.undoStack = [];
  window.redoStack = [];
  window._v1Sheets = [];
  window.requestRender = function () {};

  // --- js/05-state.js mutators (transcribed) -------------------------------
  window.mkObj = function (type, props) {
    return Object.assign({ id: window.objIdN++, type: type }, props);
  };
  window.addObj = function (obj) {
    window.objects3D.push(obj);
    window.undoStack.push({ act: 'addObj', obj: clone(obj) });
    window.redoStack = [];
  };
  window.delObj = function (id) {
    const i = window.objects3D.findIndex(function (o) { return o.id === id; });
    if (i < 0) return;
    const obj = window.objects3D.splice(i, 1)[0];
    window.undoStack.push({ act: 'delObj', obj: clone(obj), idx: i });
    window.redoStack = [];
  };
  window.mkEnt2D = function (vk, type, props) {
    return Object.assign({ id: window.ent2dIdN++, type: type, view: vk, layer: '0', lw: 0.35, ls: 'solid' }, props);
  };
  window.addEnt2D = function (ent) {
    window.entities2D[ent.view].push(ent);
    window.undoStack.push({ act: 'addEnt2D', ent: clone(ent) });
    window.redoStack = [];
  };
  window.undo = function () {
    if (!window.undoStack.length) return;
    const a = window.undoStack.pop();
    window.redoStack.push(a);
    if (a.act === 'addObj') {
      window.objects3D = window.objects3D.filter(function (o) { return o.id !== a.obj.id; });
    } else if (a.act === 'delObj') {
      window.objects3D.splice(a.idx, 0, clone(a.obj));
    } else if (a.act === 'addEnt2D') {
      window.entities2D[a.ent.view] = window.entities2D[a.ent.view].filter(function (e) { return e.id !== a.ent.id; });
    } else if (a.act === 'v25Delete') {
      const arr = window.entities2D[a.view];
      if (arr) a.removed.forEach(function (e) { arr.push(clone(e)); });
    }
  };
  window.redo = function () {
    if (!window.redoStack.length) return;
    const a = window.redoStack.pop();
    window.undoStack.push(a);
    if (a.act === 'addObj') {
      window.objects3D.push(clone(a.obj));
    } else if (a.act === 'delObj') {
      window.objects3D = window.objects3D.filter(function (o) { return o.id !== a.obj.id; });
    } else if (a.act === 'addEnt2D') {
      window.entities2D[a.ent.view].push(clone(a.ent));
    }
    // v25Delete: v1's redo() has no matching branch — faithfully a no-op.
  };
  // --- js/71-v25-selection.js mutator (transcribed) ------------------------
  window.v25DeleteSelected = function (ids, viewKey) {
    viewKey = viewKey || 'elevation';
    const arr = window.entities2D[viewKey];
    if (!arr) return;
    const removed = [];
    (ids || []).forEach(function (id) {
      const idx = arr.findIndex(function (e) { return e.id === id; });
      if (idx >= 0) removed.push(arr.splice(idx, 1)[0]);
    });
    if (removed.length) {
      window.undoStack.push({ act: 'v25Delete', removed: removed, view: viewKey });
      window.redoStack = [];
    }
  };
  // --- store-swap + save (a sheet load / save) -----------------------------
  window._projectLoadSheet = function (idx) {
    const s = (window._v1Sheets || [])[idx];
    if (!s) return;
    window.objects3D = clone(s.objects3D || []);
    window.entities2D = clone(s.entities2D || { elevation: [], sectionA: [], planB: [] });
    window.undoStack = [];
    window.redoStack = [];
  };
  window.saveProject = function () { /* v1 save serialises state — no mutation */ };
}

// --- placement helpers (mirror real v1 call sites) -------------------------
function placeUB() {
  window.addObj(window.mkObj('ub', {
    section: '310UB 40.4', x: 0, y: 0, z: 0, length: 6000, axis: { x: 1, y: 0, z: 0 },
  }));
}
function placeShs() {
  window.addObj(window.mkObj('shs', {
    section: '89x5', x: 0, y: 0, z: 0, length: 3000, axis: { x: 0, y: 1, z: 0 },
  }));
}
function placePlate2(viewKey) {
  window.addEnt2D(window.mkEnt2D(viewKey || 'elevation', 'plate2', {
    _v25: true, aspect: 'elev', shape: 'rect', u: 0, v: 0, w: 200, h: 100, thk: 10,
  }));
}
function placeDim(viewKey) {
  window.addEnt2D(window.mkEnt2D(viewKey || 'elevation', 'dim', {
    p1u: 0, p1v: 0, p2u: 300, p2v: 0, off: 30, dimType: 'horizontal',
  }));
}

/** The count of real v1 items currently in the stores. */
function v1ItemCount() {
  let n = window.objects3D.length;
  Object.keys(window.entities2D).forEach(function (k) {
    if (Array.isArray(window.entities2D[k])) n += window.entities2D[k].length;
  });
  return n;
}

/** A small deterministic PRNG so the randomised test is reproducible. */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('Phase 0d — v1 -> v2 shadow bridge', () => {
  let v2, bridge;

  /** Assert the shadow model equals a fresh migration of the live v1 state. */
  function expectShadowMatchesMigration() {
    const fresh = v2.io.migrations.v1ToV2(bridge.readV1State());
    expect(v2.appState.model).toEqual(fresh);
    expect(v2.appState.model.elements.size).toBe(v1ItemCount());
  }

  beforeEach(() => {
    v2 = window.v2;
    bridge = v2.engine.v1Bridge;
    bridge.uninstall();              // idempotent — detach any prior wrap
    installV1Harness();              // fresh stores + fresh v1 mutators
    v2.appState.reset();
    v2.engine.dirtyBus.clear();
    bridge.install();                // wrap the fresh mutators + initial sync
  });

  // --- install -------------------------------------------------------------

  it('install() wraps the present v1 mutators and skips absent ones', () => {
    expect(bridge.installed).toBe(true);
    ['addObj', 'delObj', 'addEnt2D', 'undo', 'redo',
      'v25DeleteSelected', '_projectLoadSheet', 'saveProject'
    ].forEach((name) => {
      expect(bridge.installedNames).toContain(name);
      expect(window[name]._v1BridgeWrapped).toBe(true);
    });
    // Absent in this harness — the bridge skips them rather than throwing.
    ['loadProject', 'exportProject', 'importProject'].forEach((name) => {
      expect(bridge.installedNames).not.toContain(name);
    });
  });

  it('takes an initial shadow snapshot on install (empty state -> empty model)', () => {
    expect(bridge.syncCount).toBeGreaterThan(0);
    expect(v2.appState.model.elements.size).toBe(0);
    expectShadowMatchesMigration();
  });

  // --- placements (the browser smoke-test, headless) -----------------------

  it('placing 3 UB beams: the shadow gains 3 beam/ub elements', () => {
    placeUB(); placeUB(); placeUB();
    expect(v2.appState.model.elements.size).toBe(3);
    const beams = v2.model.elementsByCategory(v2.appState.model, 'beam');
    expect(beams.length).toBe(3);
    beams.forEach((b) => expect(b.family).toBe('ub'));
    expectShadowMatchesMigration();
  });

  it('placing 5 V25 plates: the shadow gains 5 plate elements', () => {
    for (let i = 0; i < 5; i++) placePlate2('elevation');
    expect(v2.model.elementsByCategory(v2.appState.model, 'plate').length).toBe(5);
    expectShadowMatchesMigration();
  });

  it('placing 2 V25 dimensions: the shadow gains 2 annotation/dimension elements', () => {
    placeDim('elevation'); placeDim('sectionA');
    const dims = v2.model.elementsByCategory(v2.appState.model, 'annotation');
    expect(dims.length).toBe(2);
    dims.forEach((d) => expect(d.family).toBe('dimension'));
    expectShadowMatchesMigration();
  });

  it('the Phase 0d smoke sequence — 5 plates + 3 UBs + 2 dims = 10 shadow elements', () => {
    for (let i = 0; i < 5; i++) placePlate2('elevation');
    for (let i = 0; i < 3; i++) placeUB();
    placeDim('elevation'); placeDim('sectionA');
    const model = v2.appState.model;
    expect(model.elements.size).toBe(10);
    expect(v2.model.elementsByCategory(model, 'plate').length).toBe(5);
    expect(v2.model.elementsByCategory(model, 'beam').length).toBe(3);
    expect(v2.model.elementsByCategory(model, 'annotation').length).toBe(2);
    expectShadowMatchesMigration();
  });

  // --- deletes / undo / redo / sheet swap re-sync --------------------------

  it('delObj re-syncs the shadow', () => {
    placeUB(); placeShs();
    expect(v2.appState.model.elements.size).toBe(2);
    window.delObj(window.objects3D[0].id);
    expect(v2.appState.model.elements.size).toBe(1);
    expectShadowMatchesMigration();
  });

  it('undo and redo re-sync the shadow', () => {
    placeUB();
    expect(v2.appState.model.elements.size).toBe(1);
    window.undo();
    expect(v2.appState.model.elements.size).toBe(0);
    expectShadowMatchesMigration();
    window.redo();
    expect(v2.appState.model.elements.size).toBe(1);
    expectShadowMatchesMigration();
  });

  it('v25DeleteSelected re-syncs the shadow', () => {
    placePlate2('elevation'); placeDim('elevation');
    expect(v2.appState.model.elements.size).toBe(2);
    const victimId = window.entities2D.elevation[0].id;
    window.v25DeleteSelected([victimId], 'elevation');
    expect(v2.appState.model.elements.size).toBe(1);
    expectShadowMatchesMigration();
  });

  it('_projectLoadSheet (a sheet swap) re-syncs the shadow', () => {
    placeUB(); placeUB();
    expect(v2.appState.model.elements.size).toBe(2);
    window._v1Sheets = [
      null,
      { objects3D: [], entities2D: {
        elevation: [{ id: 99, type: 'dim', view: 'elevation', p1u: 0, p1v: 0, p2u: 1, p2v: 0 }],
        sectionA: [], planB: [],
      } },
    ];
    window._projectLoadSheet(1);
    expect(v2.appState.model.elements.size).toBe(1);   // sheet 1 holds one entity
    expectShadowMatchesMigration();
  });

  // --- the shadow never disturbs v1 ----------------------------------------

  it('a wrapped v1 mutation still succeeds and the v1 undo log stays intact', () => {
    placeUB();
    expect(window.objects3D.length).toBe(1);
    expect(window.objects3D[0].type).toBe('ub');
    expect(window.undoStack.length).toBe(1);
  });

  // --- dirty bus -----------------------------------------------------------

  it('dirtyBus emits model-changed (with the trigger) on every sync', () => {
    const calls = [];
    const off = v2.engine.dirtyBus.on('model-changed', (p) => calls.push(p));
    placeUB();
    placeDim('elevation');
    window.undo();
    expect(calls.length).toBe(3);
    expect(calls[0]).toMatchObject({ source: 'v1-bridge', trigger: 'addObj' });
    expect(calls[1].trigger).toBe('addEnt2D');
    expect(calls[2].trigger).toBe('undo');
    expect(calls[2].model).toBe(v2.appState.model);
    off();
  });

  // --- install / uninstall lifecycle ---------------------------------------

  it('install() is idempotent — no double-wrap', () => {
    const n = bridge.installedNames.length;
    bridge.install();
    expect(bridge.installedNames.length).toBe(n);
    expect(window.addObj._v1BridgeName).toBe('addObj');   // wrapped exactly once
  });

  it('uninstall() restores the original v1 mutators and detaches the shadow', () => {
    bridge.uninstall();
    expect(bridge.installed).toBe(false);
    expect(window.addObj._v1BridgeWrapped).toBeFalsy();
    const detachedModel = v2.appState.model;
    placeUB();                                       // mutate v1 with no bridge
    expect(window.objects3D.length).toBe(1);         // v1 still works
    expect(v2.appState.model).toBe(detachedModel);   // shadow did NOT update
  });

  // --- EXIT CRITERION ------------------------------------------------------

  it('100 randomised v1 mutations: the shadow always equals a fresh migration', () => {
    const rnd = mulberry32(0x57524144);
    const ops = [
      function () { placeUB(); },
      function () { placeShs(); },
      function () { placePlate2('elevation'); },
      function () { placeDim('elevation'); },
      function () { placeDim('sectionA'); },
      function () {                                  // delete a random 3D object
        if (!window.objects3D.length) { placeUB(); return; }
        const i = Math.floor(rnd() * window.objects3D.length);
        window.delObj(window.objects3D[i].id);
      },
      function () { window.undo(); },
      function () { window.redo(); },
      function () {                                  // V25-delete a random entity
        const arr = window.entities2D.elevation;
        if (!arr.length) { placePlate2('elevation'); return; }
        const i = Math.floor(rnd() * arr.length);
        window.v25DeleteSelected([arr[i].id], 'elevation');
      },
    ];

    for (let step = 0; step < 100; step++) {
      ops[Math.floor(rnd() * ops.length)]();
      // After EVERY mutation the shadow must equal a fresh migration of the
      // current v1 state — any divergence is a missed wrapper or a
      // non-deterministic migrator.
      const fresh = v2.io.migrations.v1ToV2(bridge.readV1State());
      expect(v2.appState.model).toEqual(fresh);
      expect(v2.appState.model.elements.size).toBe(v1ItemCount());
    }
    expect(bridge.syncCount).toBeGreaterThan(100);
  });
});
