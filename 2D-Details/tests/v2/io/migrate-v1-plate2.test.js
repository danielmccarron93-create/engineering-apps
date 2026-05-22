/*
 * StructDraw v2 — Phase 2: v1 plate2 -> v2 plate Element migration.
 *
 * Asserts that the v1->v2 migrator faithfully converts the v1 V25 plate
 * (`type: 'plate2'`) — now retired from the running app — into the v2 plate
 * Element shape:
 *   - category: 'plate'
 *   - family:   'plate-flat'
 *   - geometry.kind: 'region'
 *   - geometry.polygon: faithful 4-vertex outline from elev rect / elev poly /
 *     sec cleat shapes
 *   - geometry.viewId: 'v1-view-<key>' (the view-local convention shared with
 *     the v2 PlacePlateTool)
 *
 * This is the safety net for existing user .sd2.json files: anyone who saved
 * a plate via the v1 V25 plate tool before Phase 2 retired it can still open
 * the file in the post-Phase-2 app and see their plate as a v2 Element.
 *
 * window.v2 is populated by tests/v2/setup.mjs; describe/it/expect are globals.
 */

describe('Phase 2 — v1 plate2 -> v2 plate Element migration', () => {
  let v2;
  beforeEach(() => { v2 = window.v2; });

  /** Build a synthetic v1 single-sheet state containing plate2 entities. */
  function v1WithPlates(plate2Ents) {
    return {
      objects3D: [],
      entities2D: { elevation: plate2Ents, sectionA: [], planB: [] },
      blocks: [],
    };
  }

  it('migrates an elev-rect plate2 to a v2 plate Element with a 4-vertex polygon', () => {
    const v1 = v1WithPlates([{
      id: 11, type: 'plate2', _v25: true,
      aspect: 'elev', shape: 'rect',
      u: 100, v: 200, w: 300, h: 150, thk: 12, rot: 0,
    }]);
    const model = v2.io.migrations.v1ToV2(v1);
    const elements = [...model.elements.values()];
    const plates = elements.filter((e) => e.category === 'plate');
    expect(plates.length).toBe(1);
    const p = plates[0];
    expect(p.family).toBe('plate-flat');
    expect(p.geometry.kind).toBe('region');
    expect(p.geometry.viewId).toBe('v1-view-elevation');
    // Migrator harvests the 4 corners of (u, v, w, h) — exact polygon shape
    // depends on the migrator's `geometryPointsFor` implementation. Assert
    // structural fidelity rather than vertex order:
    const xs = p.geometry.polygon.map((pt) => pt.x).sort((a, b) => a - b);
    const ys = p.geometry.polygon.map((pt) => pt.y).sort((a, b) => a - b);
    expect(xs[0]).toBe(100);
    expect(xs[xs.length - 1]).toBe(400);   // u + w
    expect(ys[0]).toBe(200);
    expect(ys[ys.length - 1]).toBe(350);   // v + h
  });

  it('migrates an elev-poly plate2 to a v2 plate Element preserving every vertex', () => {
    const v1 = v1WithPlates([{
      id: 12, type: 'plate2', _v25: true,
      aspect: 'elev', shape: 'poly',
      u: 0, v: 0, thk: 16,
      pts: [
        { u: 0, v: 0 }, { u: 100, v: 0 },
        { u: 150, v: 50 }, { u: 100, v: 100 },
        { u: 0, v: 100 },
      ],
    }]);
    const model = v2.io.migrations.v1ToV2(v1);
    const plates = [...model.elements.values()].filter((e) => e.category === 'plate');
    expect(plates.length).toBe(1);
    const p = plates[0];
    expect(p.family).toBe('plate-flat');
    expect(p.geometry.kind).toBe('region');
    // Pentagon must round-trip through the migrator — 5 vertices preserved.
    expect(p.geometry.polygon.length).toBe(5);
    const xs = p.geometry.polygon.map((pt) => pt.x).sort((a, b) => a - b);
    expect(xs[0]).toBe(0);
    expect(xs[xs.length - 1]).toBe(150);
  });

  it('migrates a sec-cleat plate2 to a v2 plate Element', () => {
    const v1 = v1WithPlates([{
      id: 13, type: 'plate2', _v25: true,
      aspect: 'sec', shape: 'rect',
      u: 500, v: 500, length: 80, thk: 10, rot: 0,
    }]);
    const model = v2.io.migrations.v1ToV2(v1);
    const plates = [...model.elements.values()].filter((e) => e.category === 'plate');
    expect(plates.length).toBe(1);
    const p = plates[0];
    expect(p.family).toBe('plate-flat');
    expect(p.geometry.kind).toBe('region');
    // 4 vertices from the (u, v, length, thk) rectangle (after rotation).
    expect(p.geometry.polygon.length).toBe(4);
  });

  it('migrates multiple plate2 entities in one sheet preserving id stability', () => {
    const v1 = v1WithPlates([
      { id: 21, type: 'plate2', _v25: true, aspect: 'elev', shape: 'rect', u: 0,   v: 0,   w: 100, h: 50, thk: 10 },
      { id: 22, type: 'plate2', _v25: true, aspect: 'elev', shape: 'rect', u: 200, v: 0,   w: 100, h: 50, thk: 12 },
      { id: 23, type: 'plate2', _v25: true, aspect: 'elev', shape: 'rect', u: 400, v: 0,   w: 100, h: 50, thk: 16 },
    ]);
    const model = v2.io.migrations.v1ToV2(v1);
    const plates = [...model.elements.values()].filter((e) => e.category === 'plate');
    expect(plates.length).toBe(3);
    // The migrator is deterministic — re-running on the same input must yield
    // the same element ids in the same order.
    const ids1 = plates.map((p) => p.id);
    const model2 = v2.io.migrations.v1ToV2(v1);
    const ids2 = [...model2.elements.values()].filter((e) => e.category === 'plate').map((p) => p.id);
    expect(ids2).toEqual(ids1);
  });

  it('the migrated plate has no v2Source marker (the bridge graft fires only for v2-native plates)', () => {
    const v1 = v1WithPlates([{
      id: 31, type: 'plate2', _v25: true,
      aspect: 'elev', shape: 'rect',
      u: 0, v: 0, w: 100, h: 50, thk: 10,
    }]);
    const model = v2.io.migrations.v1ToV2(v1);
    const p = [...model.elements.values()].filter((e) => e.category === 'plate')[0];
    // A migrated plate originates from a v1 entity, NOT the v2 PlacePlateTool,
    // so its params.v2Source must NOT equal 'place-plate-tool' — that's the
    // sentinel the v1-bridge graft uses to preserve user-placed v2 plates
    // across re-syncs. Migrated plates can carry a different marker (e.g.
    // params.v1Source) but never the place-plate-tool sentinel.
    expect(p.params && p.params.v2Source).not.toBe('place-plate-tool');
  });
});
