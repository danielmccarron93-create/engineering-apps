/*
 * StructDraw v2 — Phase 0d: the v1 -> v2 migrator (js/v2/io/migrations/v1-to-v2.js).
 *
 * Drives v2.io.migrations.v1ToV2 with inline v1 .sd2.json-shaped fixtures and
 * asserts the resulting StructuralModel: element COUNT fidelity (one v2 Element
 * per v1 item, always), TAXONOMY fidelity (category / family / type), geometry
 * kinds, the View + Sheet derivation, and — critically — DETERMINISM (two
 * migrations of one input are structurally identical), which is what lets the
 * v1-bridge compare its shadow against a fresh migration.
 *
 * Phase 0e replaces these inline fixtures with real saved .sd2.json files and
 * adds heavy coordinate-fidelity assertions; Phase 0d proves the shape.
 *
 * window.v2 is populated by tests/v2/setup.mjs; describe/it/expect are globals.
 */

describe('Phase 0d — v1 -> v2 migrator', () => {
  let mig;
  beforeEach(() => { mig = window.v2.io.migrations; });

  // A representative v1 save: 4 objects3D + 4 entities2D across two views,
  // plus the four standard detail blocks.
  function sampleV1() {
    return {
      version: '1.0',
      objects3D: [
        { id: 1, type: 'ub', section: '310UB 40.4', x: 0, y: 0, z: 0,
          length: 6000, axis: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, rot: 0 },
        { id: 2, type: 'shs', section: '89x5', x: 100, y: 0, z: 0,
          length: 3000, axis: { x: 0, y: 1, z: 0 }, up: { x: 1, y: 0, z: 0 } },
        { id: 3, type: 'plate', x: 50, y: 50, z: 0, pt: 12, normal: { x: 0, y: 0, z: 1 },
          polyPts: [{ x: 0, y: 0, z: 0 }, { x: 200, y: 0, z: 0 },
                    { x: 200, y: 300, z: 0 }, { x: 0, y: 300, z: 0 }] },
        { id: 4, type: 'bolt', boltSize: 'M20', x: 75, y: 120, z: 0 },
      ],
      entities2D: {
        elevation: [
          { id: 1, type: 'plate2', view: 'elevation', _v25: true, aspect: 'elev',
            shape: 'rect', u: 0, v: 0, w: 300, h: 150, thk: 10 },
          { id: 2, type: 'mem2', view: 'elevation', _v25: true, memberType: 'ub',
            section: '310UB 40.4', u: 0, v: 0, length: 2000, rot: 0, aspect: 'elev' },
          { id: 3, type: 'dim', view: 'elevation', p1u: 0, p1v: 0, p2u: 500, p2v: 0,
            off: 40, dimType: 'horizontal' },
        ],
        sectionA: [
          { id: 4, type: 'dim', view: 'sectionA', p1u: 0, p1v: 0, p2u: 0, p2v: 300,
            off: 30, dimType: 'vertical' },
        ],
        planB: [],
      },
      blocks: [
        { viewKey: 'elevation', sheetX: 50, sheetY: 400, boxW: 300, boxH: 300, hidden: false },
        { viewKey: 'sectionA', sheetX: 400, sheetY: 400, boxW: 300, boxH: 300, hidden: false },
        { viewKey: 'planB', sheetX: 50, sheetY: 50, boxW: 300, boxH: 300, hidden: false },
        { viewKey: 'isometric', sheetX: 400, sheetY: 50, boxW: 300, boxH: 300, hidden: false },
      ],
    };
  }

  // --- model shape ---------------------------------------------------------

  it('produces a v2 StructuralModel at schemaVersion 2', () => {
    const m = mig.v1ToV2(sampleV1());
    expect(m.schemaVersion).toBe(2);
    expect(m.version).toBe(0);
    expect(m.elements).toBeInstanceOf(Map);
    expect(m.views).toBeInstanceOf(Map);
    expect(m.sheets).toBeInstanceOf(Map);
    expect(m.materials).toBeInstanceOf(Map);
  });

  it('count fidelity: one v2 Element per v1 objects3D + entities2D item', () => {
    const m = mig.v1ToV2(sampleV1());
    // 4 objects + (3 elevation + 1 sectionA + 0 planB) entities = 8.
    expect(m.elements.size).toBe(8);
  });

  it('empty v1 input migrates to an empty model (no throw)', () => {
    const m = mig.v1ToV2({});
    expect(m.elements.size).toBe(0);
    expect(m.sheets.size).toBe(1);
    expect(mig.v1ToV2()).toBeTruthy();      // undefined input is tolerated too
  });

  // --- objects3D taxonomy + geometry --------------------------------------

  it('maps a 3D UB to category beam / family ub with linear geometry', () => {
    const m = mig.v1ToV2(sampleV1());
    const ub = m.elements.get('v1o:1');
    expect(ub.category).toBe('beam');
    expect(ub.family).toBe('ub');
    expect(ub.type).toBe('310UB 40.4');
    expect(ub.geometry.kind).toBe('linear');
    expect(ub.geometry.start).toEqual({ x: 0, y: 0, z: 0 });
    // end = start + axis * length  ->  (1,0,0) * 6000
    expect(ub.geometry.end).toEqual({ x: 6000, y: 0, z: 0 });
    expect(ub.params.v1Type).toBe('ub');
    expect(ub.params.v1Source).toBe('objects3D');
  });

  it('maps a 3D plate to category plate / family plate-flat with plate geometry', () => {
    const m = mig.v1ToV2(sampleV1());
    const pl = m.elements.get('v1o:3');
    expect(pl.category).toBe('plate');
    expect(pl.family).toBe('plate-flat');
    expect(pl.geometry.kind).toBe('plate');
    expect(pl.geometry.polygon.length).toBe(4);
    expect(pl.geometry.thickness).toBe(12);
  });

  it('maps a 3D bolt to category fastener / family as1252-bolt with point geometry', () => {
    const m = mig.v1ToV2(sampleV1());
    const bolt = m.elements.get('v1o:4');
    expect(bolt.category).toBe('fastener');
    expect(bolt.family).toBe('as1252-bolt');
    expect(bolt.type).toBe('M20');
    expect(bolt.geometry.kind).toBe('point');
    expect(bolt.geometry.location).toEqual({ x: 75, y: 120, z: 0 });
  });

  it('every objects3D element is model-level (geometry has no viewId)', () => {
    const m = mig.v1ToV2(sampleV1());
    ['v1o:1', 'v1o:2', 'v1o:3', 'v1o:4'].forEach((id) => {
      expect(window.v2.model.geometryViewId(m.elements.get(id).geometry)).toBe(null);
    });
  });

  // --- entities2D taxonomy + geometry -------------------------------------

  it('maps a V25 plate2 to category plate / plate-flat, view-local region', () => {
    const m = mig.v1ToV2(sampleV1());
    const p2 = m.elements.get('v1e:1');
    expect(p2.category).toBe('plate');
    expect(p2.family).toBe('plate-flat');
    expect(p2.geometry.kind).toBe('region');
    expect(p2.geometry.viewId).toBe('v1-view-elevation');
    expect(p2.geometry.polygon.length).toBe(4);
    expect(p2.params.v1Source).toBe('entities2D');
  });

  it('maps a V25 mem2 to category beam with the family from memberType', () => {
    const m = mig.v1ToV2(sampleV1());
    const mem = m.elements.get('v1e:2');
    expect(mem.category).toBe('beam');
    expect(mem.family).toBe('ub');               // resolved from ent.memberType
    expect(mem.type).toBe('310UB 40.4');
    expect(mem.geometry.kind).toBe('polyline');
    expect(mem.geometry.viewId).toBe('v1-view-elevation');
  });

  it('maps V25 dimensions to category annotation / family dimension', () => {
    const m = mig.v1ToV2(sampleV1());
    const d1 = m.elements.get('v1e:3');
    const d2 = m.elements.get('v1e:4');
    expect(d1.category).toBe('annotation');
    expect(d1.family).toBe('dimension');
    expect(d1.geometry.kind).toBe('annotation');
    expect(d1.geometry.viewId).toBe('v1-view-elevation');
    expect(d1.geometry.points.length).toBe(2);   // p1, p2
    expect(d2.geometry.viewId).toBe('v1-view-sectionA');
  });

  it('every entities2D element is view-local (geometry carries its viewId)', () => {
    const m = mig.v1ToV2(sampleV1());
    ['v1e:1', 'v1e:2', 'v1e:3', 'v1e:4'].forEach((id) => {
      const vid = window.v2.model.geometryViewId(m.elements.get(id).geometry);
      expect(typeof vid).toBe('string');
      expect(vid.indexOf('v1-view-')).toBe(0);
    });
  });

  it('counts elements by category for the sample (3 beam, 2 plate, 1 fastener, 2 annotation)', () => {
    const m = mig.v1ToV2(sampleV1());
    const M = window.v2.model;
    expect(M.elementsByCategory(m, 'beam').length).toBe(3);       // ub, shs, mem2
    expect(M.elementsByCategory(m, 'plate').length).toBe(2);      // plate, plate2
    expect(M.elementsByCategory(m, 'fastener').length).toBe(1);   // bolt
    expect(M.elementsByCategory(m, 'annotation').length).toBe(2); // 2 dims
  });

  // --- views + sheet -------------------------------------------------------

  it('derives one View per view key and one auto-generated Sheet', () => {
    const m = mig.v1ToV2(sampleV1());
    expect(m.views.size).toBe(4);
    expect(m.views.get('v1-view-elevation').type).toBe('elevation');
    expect(m.views.get('v1-view-sectionA').type).toBe('section');
    expect(m.views.get('v1-view-planB').type).toBe('plan');
    expect(m.views.get('v1-view-isometric').type).toBe('iso');
    expect(m.sheets.size).toBe(1);
    const sheet = m.sheets.get('v1-sheet');
    expect(sheet.placements.length).toBe(4);     // one per block
    expect(sheet.placements[0].viewId).toBe('v1-view-elevation');
    expect(sheet.placements[0].originOnSheet).toEqual({ x: 50, y: 400 });
  });

  // --- robustness: unknown types still count -------------------------------

  it('an unrecognised v1 type still becomes exactly one Element', () => {
    const m = mig.v1ToV2({
      objects3D: [{ id: 9, type: 'mystery-widget', x: 1, y: 2, z: 3 }],
      entities2D: { elevation: [{ id: 9, type: 'weird-doodad', view: 'elevation', u: 5, v: 6 }] },
      blocks: [],
    });
    expect(m.elements.size).toBe(2);
    expect(m.elements.get('v1o:9').category).toBe('detail-component');
    expect(m.elements.get('v1e:9').category).toBe('annotation');
  });

  it('skips array holes / non-object items without losing the count of real items', () => {
    const m = mig.v1ToV2({
      objects3D: [null, { id: 1, type: 'ub', section: '310UB 40.4', x: 0, y: 0, z: 0, length: 100 }, undefined],
      entities2D: { elevation: [{ id: 1, type: 'dim', p1u: 0, p1v: 0, p2u: 1, p2v: 0 }, null] },
    });
    expect(m.elements.size).toBe(2);             // the two real items only
  });

  // --- determinism ---------------------------------------------------------

  it('is deterministic: two migrations of one input are structurally identical', () => {
    const v1 = sampleV1();
    expect(mig.v1ToV2(v1)).toEqual(mig.v1ToV2(v1));
  });

  it('mints stable, namespaced element ids derived from the v1 ids', () => {
    const m = mig.v1ToV2(sampleV1());
    // objects3D -> v1o:<id>, entities2D -> v1e:<id> — the v1o/v1e prefixes keep
    // the two independent v1 id counters from colliding.
    expect(m.elements.has('v1o:1')).toBe(true);
    expect(m.elements.has('v1e:1')).toBe(true);
    expect(m.elements.get('v1o:1').id).toBe('v1o:1');
  });

  // --- type-map coverage ---------------------------------------------------

  it('the type maps cover the core v1 entity vocabulary', () => {
    // Spot-check that the migrator knows the v1 types Phase 0d must handle.
    ['ub', 'uc', 'shs', 'rhs', 'chs', 'pfc', 'ea', 'ua', 'wb', 'plate', 'bolt']
      .forEach((t) => expect(mig.OBJ_TYPE_MAP[t]).toBeTruthy());
    ['mem2', 'plate2', 'dim', 'screw', 'weld', 'breakline', 'blockWall', 'reoBar']
      .forEach((t) => expect(mig.ENT_TYPE_MAP[t]).toBeTruthy());
  });
});
