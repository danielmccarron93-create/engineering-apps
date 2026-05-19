/*
 * StructDraw v2 — Geometry discriminated union, classification, AABB helpers,
 * and the View projection helpers (the model layer's pure geometric maths).
 */

describe('model/geometry', () => {
  let M;
  beforeEach(() => { M = window.v2.model; });

  it('each factory stamps the correct discriminator kind', () => {
    expect(M.linearMember({ start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 0, z: 0 } }).kind).toBe('linear');
    expect(M.plate({ polygon: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }], thickness: 10 }).kind).toBe('plate');
    expect(M.pointInstance({ location: { x: 0, y: 0, z: 0 } }).kind).toBe('point');
    expect(M.annotation({ viewId: 'v1', points: [{ x: 0, y: 0 }] }).kind).toBe('annotation');
    expect(M.region({ viewId: null, polygon: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }] }).kind).toBe('region');
    expect(M.polyline({ viewId: 'v1', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }).kind).toBe('polyline');
    expect(M.GEOMETRY_KINDS.length).toBe(6);
  });

  it('factories throw on malformed specs', () => {
    expect(() => M.linearMember({ start: { x: 0, y: 0, z: 0 } })).toThrow();
    expect(() => M.plate({ polygon: [{ x: 0, y: 0, z: 0 }] })).toThrow();
    expect(() => M.pointInstance({})).toThrow();
    expect(() => M.annotation({ points: [] })).toThrow();   // missing viewId
    expect(() => M.polyline({ viewId: 'v1', points: [{ x: 0, y: 0 }] })).toThrow();
  });

  it('pointInstance defaults normal to +Z and rotation to 0', () => {
    const g = M.pointInstance({ location: { x: 0, y: 0, z: 0 } });
    expect(g.normal).toEqual({ x: 0, y: 0, z: 1 });
    expect(g.rotation).toBe(0);
  });

  it('linearMember derives an orthonormal frame from its axis', () => {
    const g = M.linearMember({ start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 0, z: 1000 } });
    const { axisU, axisV, axisW } = g.frame;
    const len = (v) => Math.hypot(v.x, v.y, v.z);
    const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
    expect(len(axisU)).toBeCloseTo(1, 6);
    expect(len(axisV)).toBeCloseTo(1, 6);
    expect(len(axisW)).toBeCloseTo(1, 6);
    expect(dot(axisU, axisV)).toBeCloseTo(0, 6);
    expect(dot(axisU, axisW)).toBeCloseTo(0, 6);
    expect(dot(axisV, axisW)).toBeCloseTo(0, 6);
    // axisU follows start -> end
    expect(axisU.z).toBeCloseTo(1, 6);
  });

  it('frameFromAxis returns the identity frame for a degenerate (zero-length) member', () => {
    expect(M.frameFromAxis({ x: 5, y: 5, z: 5 }, { x: 5, y: 5, z: 5 })).toEqual(M.identityFrame());
  });

  it('classifies model-level vs view-local geometry', () => {
    const beam = M.linearMember({ start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 0, z: 0 } });
    const tag = M.annotation({ viewId: 'v1', points: [{ x: 0, y: 0 }] });
    const solidRegion = M.region({ viewId: null, polygon: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }] });
    const hatchRegion = M.region({ viewId: 'v1', polygon: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] });

    expect(M.isModelLevel(beam)).toBe(true);
    expect(M.geometryViewId(beam)).toBe(null);
    expect(M.isViewLocal(tag)).toBe(true);
    expect(M.geometryViewId(tag)).toBe('v1');
    expect(M.isModelLevel(solidRegion)).toBe(true);   // region with viewId null = real solid
    expect(M.isViewLocal(hatchRegion)).toBe(true);    // region with a viewId = paper hatch
    expect(M.geometryKind(beam)).toBe('linear');
  });

  it('geometryBoundingBox + bboxIntersects + bboxUnion', () => {
    const g = M.linearMember({ start: { x: 0, y: 0, z: 0 }, end: { x: 100, y: 50, z: 0 } });
    const bb = M.geometryBoundingBox(g);
    expect(bb).toEqual({ min: { x: 0, y: 0, z: 0 }, max: { x: 100, y: 50, z: 0 } });

    expect(M.bboxIntersects(bb, { min: { x: 50, y: 0, z: 0 }, max: { x: 150, y: 60, z: 0 } })).toBe(true);
    expect(M.bboxIntersects(bb, { min: { x: 200, y: 0, z: 0 }, max: { x: 300, y: 60, z: 0 } })).toBe(false);
    expect(M.bboxIntersects(bb, null)).toBe(false);

    const u = M.bboxUnion(bb, { min: { x: -10, y: -10, z: -5 }, max: { x: 10, y: 10, z: 5 } });
    expect(u).toEqual({ min: { x: -10, y: -10, z: -5 }, max: { x: 100, y: 50, z: 5 } });
    expect(M.bboxUnion(bb, null)).toEqual(bb);
    expect(M.bboxUnion(null, bb)).toEqual(bb);
  });

  describe('view projection', () => {
    it('an identity transform projects (x,y,z) -> (x,y)', () => {
      const view = M.makeView({ type: 'paper-space', name: 'Paper' });
      expect(M.projectPoint(view, { x: 3, y: 4, z: 5 })).toEqual({ x: 3, y: 4 });
    });

    it('a translation matrix offsets points but not vectors', () => {
      const t = M.identityMatrix4();
      t[12] = 100; // column-major: translation x
      t[13] = 20;  // column-major: translation y
      const view = M.makeView({ type: 'plan', modelTransform: t });
      expect(M.projectPoint(view, { x: 1, y: 2, z: 0 })).toEqual({ x: 101, y: 22 });
      expect(M.projectVector(view, { x: 1, y: 2, z: 0 })).toEqual({ x: 1, y: 2 });
    });

    it('projectPolygon maps every vertex', () => {
      const view = M.makeView({ type: 'elevation' });
      expect(M.projectPolygon(view, [{ x: 0, y: 0, z: 0 }, { x: 10, y: 5, z: 0 }]))
        .toEqual([{ x: 0, y: 0 }, { x: 10, y: 5 }]);
    });

    it('makeView throws on an unknown view type and defaults paper-space to annotations-only', () => {
      expect(() => M.makeView({ type: 'hologram' })).toThrow();
      expect(M.makeView({ type: 'paper-space' }).showAnnotationsOnly).toBe(true);
      expect(M.makeView({ type: 'plan' }).showAnnotationsOnly).toBe(false);
      expect(M.isPaperSpace(M.makeView({ type: 'paper-space' }))).toBe(true);
    });
  });
});
