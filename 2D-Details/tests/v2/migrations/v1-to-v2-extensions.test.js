/*
 * StructDraw v2 — Phase 0e extensions to the v1 -> v2 migrator.
 *
 * Targets the four 0e-specific changes in js/v2/io/migrations/v1-to-v2.js:
 *   1. ENT_TYPE_MAP gains `lineSet` and `txtBox` (the two v25 dispatch types
 *      Phase 0d did not name).
 *   2. `frame` upgrades from kind:'annotation' to kind:'region' so its (u,v,w,h)
 *      area survives migration.
 *   3. `geometryPointsFor` harvests (u,v,w,h) rectangles for frame / mat /
 *      rect / slot / txtBox / hatch, and (cu,cv,r) circles for arc / circle.
 *   4. `model.materials` is POPULATED from the v2 catalogue (Phase 0c) — every
 *      material an Element references is now present in the saved map.
 *
 * window.v2 is populated by tests/v2/setup.mjs; describe/it/expect are globals.
 */

describe('Phase 0e — v1 -> v2 migrator extensions', () => {
  let mig;
  beforeEach(() => { mig = window.v2.io.migrations; });

  // --- ENT_TYPE_MAP additions (lineSet, txtBox) ----------------------------

  it('ENT_TYPE_MAP knows the v25 dispatch types Phase 0e added', () => {
    expect(mig.ENT_TYPE_MAP.lineSet).toBeTruthy();
    expect(mig.ENT_TYPE_MAP.lineSet.category).toBe('annotation');
    expect(mig.ENT_TYPE_MAP.lineSet.kind).toBe('polyline');
    expect(mig.ENT_TYPE_MAP.txtBox).toBeTruthy();
    expect(mig.ENT_TYPE_MAP.txtBox.category).toBe('annotation');
    expect(mig.ENT_TYPE_MAP.txtBox.family).toBe('tag');
    expect(mig.ENT_TYPE_MAP.txtBox.kind).toBe('annotation');
  });

  it('migrates a lineSet entity to an annotation polyline (not detail-component)', () => {
    const m = mig.v1ToV2({
      objects3D: [],
      entities2D: { elevation: [
        { id: 1, type: 'lineSet', view: 'elevation',
          pts: [{ u: 0, v: 0 }, { u: 100, v: 100 }, { u: 200, v: 50 }] },
      ]},
      blocks: [],
    });
    const el = m.elements.get('v1e:1');
    expect(el.category).toBe('annotation');
    expect(el.geometry.kind).toBe('polyline');
    expect(el.geometry.points.length).toBe(3);
  });

  it('migrates a txtBox entity to an annotation tag with collected points', () => {
    const m = mig.v1ToV2({
      objects3D: [],
      entities2D: { elevation: [
        { id: 1, type: 'txtBox', view: 'elevation',
          u: 100, v: 50, w: 60, h: 30, text: 'NOTE' },
      ]},
      blocks: [],
    });
    const el = m.elements.get('v1e:1');
    expect(el.category).toBe('annotation');
    expect(el.family).toBe('tag');
    expect(el.geometry.kind).toBe('annotation');
    // txtBox falls through to collectEntPoints THEN uvwhRectPoints (annotation
    // kind keeps whichever shape the helpers found, so a 4-corner outline is
    // OK and a single anchor point is also OK).
    expect(el.geometry.points.length).toBeGreaterThan(0);
  });

  // --- frame upgrade to region with 4 corners ------------------------------

  it('migrates a `frame` entity to a region with 4 corners (Phase 0e upgrade)', () => {
    const m = mig.v1ToV2({
      objects3D: [],
      entities2D: { elevation: [
        { id: 1, type: 'frame', view: 'elevation',
          u: 10, v: 20, w: 300, h: 200, title: 'DETAIL', scale: 10 },
      ]},
      blocks: [],
    });
    const fr = m.elements.get('v1e:1');
    expect(fr.category).toBe('detail-component');
    expect(fr.geometry.kind).toBe('region');
    expect(fr.geometry.polygon.length).toBe(4);
    expect(fr.geometry.polygon[0]).toEqual({ x: 10,  y: 20  });
    expect(fr.geometry.polygon[1]).toEqual({ x: 310, y: 20  });
    expect(fr.geometry.polygon[2]).toEqual({ x: 310, y: 220 });
    expect(fr.geometry.polygon[3]).toEqual({ x: 10,  y: 220 });
  });

  // --- (u,v,w,h) rectangle harvesting for mat / rect / slot / hatch --------

  it('harvests (u,v,w,h) rectangles for `mat` region entities', () => {
    const m = mig.v1ToV2({
      objects3D: [],
      entities2D: { elevation: [
        { id: 1, type: 'mat', view: 'elevation', shape: 'rect',
          material: 'concrete-n32', u: 0, v: 0, w: 500, h: 300 },
      ]},
      blocks: [],
    });
    const mat = m.elements.get('v1e:1');
    expect(mat.geometry.kind).toBe('region');
    expect(mat.geometry.polygon.length).toBe(4);
    expect(mat.geometry.polygon[2]).toEqual({ x: 500, y: 300 });
  });

  it('harvests (u,v,w,h) for `slot` region entities', () => {
    const m = mig.v1ToV2({
      objects3D: [],
      entities2D: { elevation: [
        { id: 1, type: 'slot', view: 'elevation', u: 0, v: 0, w: 50, h: 22 },
      ]},
      blocks: [],
    });
    const slot = m.elements.get('v1e:1');
    expect(slot.geometry.kind).toBe('region');
    expect(slot.geometry.polygon[1]).toEqual({ x: 50, y: 0 });
  });

  it('harvests (u,v,w,h) for `rect` and `hatch` entities', () => {
    const m = mig.v1ToV2({
      objects3D: [],
      entities2D: { elevation: [
        { id: 1, type: 'rect',  view: 'elevation', u: 0, v: 0, w: 100, h: 60 },
        { id: 2, type: 'hatch', view: 'elevation', u: 50, v: 50, w: 200, h: 200, material: 'concrete' },
      ]},
      blocks: [],
    });
    expect(m.elements.get('v1e:1').geometry.polygon.length).toBe(4);
    expect(m.elements.get('v1e:2').geometry.polygon.length).toBe(4);
  });

  // --- (cu,cv,r) circle harvesting for arc / circle ------------------------

  it('harvests (cu,cv,r) circle endpoints for `circle` entities', () => {
    const m = mig.v1ToV2({
      objects3D: [],
      entities2D: { elevation: [
        { id: 1, type: 'circle', view: 'elevation', cu: 100, cv: 50, r: 25, lw: 0.35 },
      ]},
      blocks: [],
    });
    const c = m.elements.get('v1e:1');
    expect(c.category).toBe('annotation');
    expect(c.geometry.kind).toBe('annotation');
    expect(c.geometry.points.length).toBe(4);            // 4 cardinal points
    expect(c.geometry.points[0]).toEqual({ x: 125, y: 50 });
    expect(c.geometry.points[2]).toEqual({ x: 75,  y: 50 });
  });

  it('harvests (cu,cv,r) for `arc` entities', () => {
    const m = mig.v1ToV2({
      objects3D: [],
      entities2D: { elevation: [
        { id: 1, type: 'arc', view: 'elevation', cu: 0, cv: 0, r: 10, a1: 0, a2: 90 },
      ]},
      blocks: [],
    });
    const a = m.elements.get('v1e:1');
    expect(a.geometry.points.length).toBe(4);
  });

  // --- explicit polylines still win over rect/circle fallback --------------

  it('an explicit `pts` array wins over a u/v/w/h fallback', () => {
    const m = mig.v1ToV2({
      objects3D: [],
      entities2D: { elevation: [
        { id: 1, type: 'polygon', view: 'elevation',
          // Both explicit pts AND a u/v/w/h rect — pts wins.
          pts: [{ u: 0, v: 0 }, { u: 50, v: 0 }, { u: 25, v: 50 }],
          u: 0, v: 0, w: 99, h: 99 },
      ]},
      blocks: [],
    });
    const poly = m.elements.get('v1e:1');
    expect(poly.geometry.kind).toBe('region');
    expect(poly.geometry.polygon.length).toBe(3);
    expect(poly.geometry.polygon[1]).toEqual({ x: 50, y: 0 });
  });

  // --- materials population from the catalogue -----------------------------

  it('model.materials is populated from the catalogue for referenced materials', () => {
    // A UB + a V25 plate2 — both reference steel materials in v2 defaults.
    const m = mig.v1ToV2({
      objects3D: [
        { id: 1, type: 'ub', section: '310UB 40.4',
          x: 0, y: 0, z: 0, length: 6000, axis: { x: 1, y: 0, z: 0 } },
      ],
      entities2D: { elevation: [
        { id: 1, type: 'plate2', view: 'elevation', _v25: true,
          aspect: 'elev', shape: 'rect', u: 0, v: 0, w: 200, h: 100, thk: 10 },
      ]},
      blocks: [],
    });
    expect(m.materials.size).toBeGreaterThan(0);
    // Every materialId referenced by an element should be present in the map.
    const referenced = new Set();
    m.elements.forEach((el) => {
      if (typeof el.materialId === 'string') referenced.add(el.materialId);
    });
    referenced.forEach((id) => {
      expect(m.materials.has(id)).toBe(true);
    });
    // The material object itself is from the catalogue — it carries display / structural.
    const ub = m.elements.get('v1o:1');
    const mat = m.materials.get(ub.materialId);
    expect(mat.class).toBe('steel');
    expect(mat.display).toBeTruthy();
    expect(mat.structural).toBeTruthy();
  });

  it('materials map contains ONLY referenced materials (smallest sufficient set)', () => {
    // A single annotation references no materials -> map empty (annotation
    // category's default material is null).
    const m = mig.v1ToV2({
      objects3D: [],
      entities2D: { elevation: [
        { id: 1, type: 'dim', view: 'elevation', p1u: 0, p1v: 0, p2u: 10, p2v: 0 },
      ]},
      blocks: [],
    });
    expect(m.elements.size).toBe(1);
    expect(m.materials.size).toBe(0);
  });

  // --- determinism preserved after the extensions --------------------------

  it('extended migrator is still deterministic across two calls', () => {
    const v1 = {
      objects3D: [
        { id: 1, type: 'ub', section: '310UB 40.4',
          x: 0, y: 0, z: 0, length: 6000, axis: { x: 1, y: 0, z: 0 } },
      ],
      entities2D: { elevation: [
        { id: 1, type: 'frame', view: 'elevation', u: 0, v: 0, w: 300, h: 200, title: 'D', scale: 10 },
        { id: 2, type: 'circle', view: 'elevation', cu: 50, cv: 50, r: 10 },
        { id: 3, type: 'lineSet', view: 'elevation', pts: [{ u: 0, v: 0 }, { u: 10, v: 10 }] },
      ]},
      blocks: [{ viewKey: 'elevation', sheetX: 0, sheetY: 0, boxW: 300, boxH: 300 }],
    };
    expect(mig.v1ToV2(v1)).toEqual(mig.v1ToV2(v1));
  });
});
