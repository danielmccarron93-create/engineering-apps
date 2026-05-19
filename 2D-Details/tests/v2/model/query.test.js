/*
 * StructDraw v2 — the query API: query() plus the convenience helpers
 * (elementsByCategory / elementsByFamily / elementsInBox / elementsInView /
 * hostedBy / annotationsOf).
 */

describe('query API', () => {
  let M, model;

  beforeEach(() => {
    M = window.v2.model;
    model = M.makeModel();

    // Fixture: 2 beams, 1 plate, 1 fastener + 1 annotation both hosted by beam-1.
    const beam1 = M.makeElement({ id: 'beam-1', category: 'beam', family: 'ub', type: '310UB40.4', geometry: M.linearMember({ start: { x: 0, y: 0, z: 0 }, end: { x: 5000, y: 0, z: 0 } }) });
    const beam2 = M.makeElement({ id: 'beam-2', category: 'beam', family: 'uc', type: '200UC59.5', geometry: M.linearMember({ start: { x: 0, y: 3000, z: 0 }, end: { x: 5000, y: 3000, z: 0 } }) });
    const plate1 = M.makeElement({ id: 'plate-1', category: 'plate', family: 'plate-flat', type: 'PL10', geometry: M.plate({ polygon: [{ x: 0, y: 0, z: 0 }, { x: 200, y: 0, z: 0 }, { x: 200, y: 200, z: 0 }, { x: 0, y: 200, z: 0 }], thickness: 10 }) });
    const screw1 = M.makeElement({ id: 'screw-1', category: 'fastener', family: 'rothoblaas-hbs', type: 'HBS-10x100', hostId: 'beam-1', geometry: M.pointInstance({ location: { x: 100, y: 0, z: 0 } }) });
    const tag1 = M.makeElement({ id: 'tag-1', category: 'annotation', family: 'tag', type: 'beam-tag', hostId: 'beam-1', geometry: M.annotation({ viewId: 'view-A', points: [{ x: 0, y: 0 }] }) });

    for (const e of [beam1, beam2, plate1, screw1, tag1]) model.elements.set(e.id, e);
    model.elements.get('beam-1').annotationIds = ['tag-1'];
    model.views.set('view-A', M.makeView({ id: 'view-A', type: 'elevation', name: 'Elevation' }));
  });

  it('query() returns every element matching a predicate', () => {
    expect(M.query(model, (e) => e.category === 'beam').length).toBe(2);
    expect(M.query(model, () => true).length).toBe(5);
    expect(M.query(model, () => false).length).toBe(0);
  });

  it('elementsByCategory', () => {
    expect(M.elementsByCategory(model, 'beam').map((e) => e.id).sort()).toEqual(['beam-1', 'beam-2']);
    expect(M.elementsByCategory(model, 'plate').map((e) => e.id)).toEqual(['plate-1']);
    expect(M.elementsByCategory(model, 'masonry')).toEqual([]);
  });

  it('elementsByFamily', () => {
    expect(M.elementsByFamily(model, 'beam', 'ub').map((e) => e.id)).toEqual(['beam-1']);
    expect(M.elementsByFamily(model, 'beam', 'uc').map((e) => e.id)).toEqual(['beam-2']);
    expect(M.elementsByFamily(model, 'beam', 'pfc')).toEqual([]);
  });

  it('hostedBy returns every element hosted by an id', () => {
    expect(M.hostedBy(model, 'beam-1').map((e) => e.id).sort()).toEqual(['screw-1', 'tag-1']);
    expect(M.hostedBy(model, 'beam-2')).toEqual([]);
  });

  it('annotationsOf returns the host\'s child annotation elements', () => {
    expect(M.annotationsOf(model, 'beam-1').map((e) => e.id)).toEqual(['tag-1']);
    expect(M.annotationsOf(model, 'beam-2')).toEqual([]);
    expect(M.annotationsOf(model, 'no-such-element')).toEqual([]);
  });

  it('elementsInView: model-level elements show in any view; view-local only in their own', () => {
    const viewA = model.views.get('view-A');
    expect(M.elementsInView(model, viewA).map((e) => e.id).sort())
      .toEqual(['beam-1', 'beam-2', 'plate-1', 'screw-1', 'tag-1']);

    // A different view excludes the view-local annotation bound to view-A.
    const viewB = M.makeView({ id: 'view-B', type: 'plan' });
    const inB = M.elementsInView(model, viewB).map((e) => e.id).sort();
    expect(inB).toEqual(['beam-1', 'beam-2', 'plate-1', 'screw-1']);
    expect(inB).not.toContain('tag-1');
  });

  it('elementsInBox returns elements whose bounding box intersects the query box', () => {
    const hits = M.elementsInBox(model, { min: { x: -10, y: -10, z: -10 }, max: { x: 300, y: 300, z: 10 } })
      .map((e) => e.id).sort();
    // beam-2 sits at y=3000, well outside the box.
    expect(hits).toEqual(['beam-1', 'plate-1', 'screw-1', 'tag-1']);
    expect(hits).not.toContain('beam-2');
  });
});
