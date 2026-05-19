/*
 * StructDraw v2 — Element factory + element helpers.
 * window.v2 is populated by tests/v2/setup.mjs; describe/it/expect are globals
 * (vitest.config.mjs `globals: true`).
 */

describe('model/element', () => {
  let M;
  beforeEach(() => { M = window.v2.model; });

  const linGeom = () => M.linearMember({ start: { x: 0, y: 0, z: 0 }, end: { x: 1000, y: 0, z: 0 } });

  it('makeElement builds a plain object with sensible defaults + a minted id', () => {
    const el = M.makeElement({
      category: 'beam', family: 'ub', type: '310UB40.4',
      geometry: linGeom(), materialId: 'steel-s275',
    });
    expect(M.isId(el.id)).toBe(true);
    expect(el.category).toBe('beam');
    expect(el.family).toBe('ub');
    expect(el.type).toBe('310UB40.4');
    expect(el.materialId).toBe('steel-s275');
    expect(el.params).toEqual({});
    expect(typeof el.createdAt).toBe('number');
    // Q8: a plain object, not a class instance.
    expect(Object.getPrototypeOf(el)).toBe(Object.prototype);
  });

  it('makeElement honours an explicit id and defaults family/type to null', () => {
    const el = M.makeElement({ id: 'beam-1', category: 'beam', geometry: linGeom() });
    expect(el.id).toBe('beam-1');
    expect(el.family).toBe(null);
    expect(el.type).toBe(null);
  });

  it('makeElement copies params rather than aliasing the caller object', () => {
    const params = { grade: '10.9' };
    const el = M.makeElement({ category: 'fastener', geometry: M.pointInstance({ location: { x: 0, y: 0, z: 0 } }), params });
    params.grade = 'MUTATED';
    expect(el.params.grade).toBe('10.9');
  });

  it('makeElement throws on an unknown category', () => {
    expect(() => M.makeElement({ category: 'wormhole', geometry: linGeom() })).toThrow(/category/);
  });

  it('makeElement throws when geometry is missing or has a bad kind', () => {
    expect(() => M.makeElement({ category: 'beam' })).toThrow(/geometry/);
    expect(() => M.makeElement({ category: 'beam', geometry: { kind: 'banana' } })).toThrow(/kind/);
  });

  it('isCategory recognises the closed category set', () => {
    expect(M.CATEGORIES.length).toBe(12);
    expect(M.isCategory('plate')).toBe(true);
    expect(M.isCategory('fastener')).toBe(true);
    expect(M.isCategory('nonsense')).toBe(false);
  });

  it('elementCategory / isHosted accessors', () => {
    const free = M.makeElement({ category: 'beam', geometry: linGeom() });
    const hosted = M.makeElement({ category: 'fastener', hostId: 'beam-1', geometry: M.pointInstance({ location: { x: 0, y: 0, z: 0 } }) });
    expect(M.elementCategory(free)).toBe('beam');
    expect(M.isHosted(free)).toBe(false);
    expect(M.isHosted(hosted)).toBe(true);
  });

  it('elementMaterial resolves the material from the model', () => {
    const model = M.makeModel();
    model.materials.set('steel-s275', M.makeMaterial({ id: 'steel-s275', class: 'steel', grade: 'S275' }));
    const el = M.makeElement({ category: 'beam', geometry: linGeom(), materialId: 'steel-s275' });
    expect(M.elementMaterial(el, model).grade).toBe('S275');
    const orphan = M.makeElement({ category: 'beam', geometry: linGeom() });
    expect(M.elementMaterial(orphan, model)).toBe(null);
  });

  it('elementBoundingBox covers linear, point and plate geometry', () => {
    const beam = M.makeElement({ category: 'beam', geometry: M.linearMember({ start: { x: 0, y: 0, z: 0 }, end: { x: 1000, y: 200, z: 0 } }) });
    expect(M.elementBoundingBox(beam)).toEqual({ min: { x: 0, y: 0, z: 0 }, max: { x: 1000, y: 200, z: 0 } });

    const screw = M.makeElement({ category: 'fastener', geometry: M.pointInstance({ location: { x: 5, y: 6, z: 7 } }) });
    expect(M.elementBoundingBox(screw)).toEqual({ min: { x: 5, y: 6, z: 7 }, max: { x: 5, y: 6, z: 7 } });

    const plate = M.makeElement({
      category: 'plate',
      geometry: M.plate({ polygon: [{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }, { x: 100, y: 200, z: 0 }, { x: 0, y: 200, z: 0 }], thickness: 10 }),
    });
    expect(M.elementBoundingBox(plate)).toEqual({ min: { x: 0, y: 0, z: 0 }, max: { x: 100, y: 200, z: 0 } });
  });
});
