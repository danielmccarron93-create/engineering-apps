/*
 * StructDraw v2 — apply/unapply round-trip tests for EVERY transaction factory
 * (the Phase 0b test boundary), plus the model-layer applyTransaction wrapper
 * and the transaction-type registry.
 *
 * Round-trip pattern: snapshot the model with structuredClone, apply the
 * transaction, unapply it, then assert the model deep-equals the snapshot.
 */

describe('transactions', () => {
  let M, T;
  beforeEach(() => { M = window.v2.model; T = window.v2.transactions; });

  const linGeom = () => M.linearMember({ start: { x: 0, y: 0, z: 0 }, end: { x: 1000, y: 0, z: 0 } });
  const plateGeom = () => M.plate({
    polygon: [{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }, { x: 100, y: 200, z: 0 }, { x: 0, y: 200, z: 0 }],
    thickness: 10,
  });

  function expectDirtySet(d) {
    expect(d.elements).toBeInstanceOf(Set);
    expect(d.views).toBeInstanceOf(Set);
    expect(d.sheets).toBeInstanceOf(Set);
  }

  // --- placeElement --------------------------------------------------------

  it('placeElement: applies an element, unapply removes it (round-trip)', () => {
    const model = M.makeModel();
    const before = structuredClone(model);
    const tx = T.placeElement({ category: 'plate', family: 'plate-flat', type: 'PL10', geometry: plateGeom(), materialId: 'steel-s275' });
    const d = tx.apply(model);
    expect(model.elements.size).toBe(1);
    expect(model.elements.has(tx.data.element.id)).toBe(true);
    expectDirtySet(d);
    expect(d.elements.has(tx.data.element.id)).toBe(true);
    tx.unapply(model);
    expect(model).toEqual(before);
  });

  it('placeElement: an annotation with a host updates host.annotationIds (round-trip)', () => {
    const model = M.makeModel();
    model.elements.set('beam-1', M.makeElement({ id: 'beam-1', category: 'beam', geometry: linGeom() }));
    const before = structuredClone(model);
    const tx = T.placeElement({ category: 'annotation', family: 'tag', type: 'beam-tag', hostId: 'beam-1', geometry: M.annotation({ viewId: 'v1', points: [{ x: 0, y: 0 }] }) });
    tx.apply(model);
    expect(model.elements.get('beam-1').annotationIds).toContain(tx.data.element.id);
    tx.unapply(model);
    expect(model).toEqual(before);
  });

  it('placeElement: a non-annotation hosted element does NOT touch host.annotationIds', () => {
    const model = M.makeModel();
    model.elements.set('beam-1', M.makeElement({ id: 'beam-1', category: 'timber-member', geometry: linGeom() }));
    const tx = T.placeElement({ category: 'fastener', family: 'rothoblaas-hbs', type: 'HBS-10x100', hostId: 'beam-1', geometry: M.pointInstance({ location: { x: 0, y: 0, z: 0 } }) });
    tx.apply(model);
    expect(model.elements.get('beam-1').annotationIds).toBeUndefined();
  });

  // --- deleteElement -------------------------------------------------------

  it('deleteElement: removes an element, unapply restores it (round-trip)', () => {
    const model = M.makeModel();
    model.elements.set('p1', M.makeElement({ id: 'p1', category: 'plate', geometry: plateGeom() }));
    const before = structuredClone(model);
    const tx = T.deleteElement('p1');
    tx.apply(model);
    expect(model.elements.has('p1')).toBe(false);
    tx.unapply(model);
    expect(model).toEqual(before);
  });

  it('deleteElement: an annotation unlinks from its host and the link round-trips', () => {
    const model = M.makeModel();
    const beam = M.makeElement({ id: 'beam-1', category: 'beam', geometry: linGeom() });
    beam.annotationIds = ['tag-1'];
    model.elements.set('beam-1', beam);
    model.elements.set('tag-1', M.makeElement({ id: 'tag-1', category: 'annotation', hostId: 'beam-1', geometry: M.annotation({ viewId: 'v1', points: [{ x: 0, y: 0 }] }) }));
    const before = structuredClone(model);
    const tx = T.deleteElement('tag-1');
    tx.apply(model);
    expect(model.elements.has('tag-1')).toBe(false);
    expect(model.elements.get('beam-1').annotationIds).toEqual([]);
    tx.unapply(model);
    expect(model).toEqual(before);
  });

  it('deleteElement: deleting an absent id is a no-op (round-trip)', () => {
    const model = M.makeModel();
    const before = structuredClone(model);
    const tx = T.deleteElement('does-not-exist');
    tx.apply(model);
    tx.unapply(model);
    expect(model).toEqual(before);
  });

  // --- moveElement ---------------------------------------------------------

  it('moveElement: replaces geometry, unapply restores the prior geometry (round-trip)', () => {
    const model = M.makeModel();
    model.elements.set('p1', M.makeElement({ id: 'p1', category: 'plate', geometry: plateGeom() }));
    const before = structuredClone(model);
    const moved = M.plate({ polygon: [{ x: 500, y: 500, z: 0 }, { x: 600, y: 500, z: 0 }, { x: 600, y: 700, z: 0 }], thickness: 12 });
    const tx = T.moveElement('p1', moved);
    tx.apply(model);
    expect(model.elements.get('p1').geometry.thickness).toBe(12);
    tx.unapply(model);
    expect(model.elements.get('p1').geometry.thickness).toBe(10);
    expect(model).toEqual(before);
  });

  // --- editElement ---------------------------------------------------------

  it('editElement: patches fields, unapply restores them (round-trip)', () => {
    const model = M.makeModel();
    model.elements.set('p1', M.makeElement({ id: 'p1', category: 'plate', type: 'PL10', geometry: plateGeom() }));
    const before = structuredClone(model);
    const tx = T.editElement('p1', { type: 'PL12', materialId: 'steel-s355' });
    tx.apply(model);
    expect(model.elements.get('p1').type).toBe('PL12');
    expect(model.elements.get('p1').materialId).toBe('steel-s355');
    tx.unapply(model);
    expect(model).toEqual(before);
  });

  it('editElement: refuses to change the id', () => {
    expect(() => T.editElement('p1', { id: 'evil' })).toThrow(/id/);
  });

  // --- batch ---------------------------------------------------------------

  it('batch: applies several transactions atomically (round-trip)', () => {
    const model = M.makeModel();
    const before = structuredClone(model);
    const tx = T.batch([
      T.placeElement({ category: 'beam', geometry: linGeom() }),
      T.placeElement({ category: 'plate', geometry: plateGeom() }),
    ]);
    tx.apply(model);
    expect(model.elements.size).toBe(2);
    tx.unapply(model);
    expect(model).toEqual(before);
  });

  it('batch: unapply runs children in REVERSE order (two edits to one field)', () => {
    const model = M.makeModel();
    model.elements.set('e1', M.makeElement({ id: 'e1', category: 'plate', type: 'orig', geometry: plateGeom() }));
    const before = structuredClone(model);
    const tx = T.batch([
      T.editElement('e1', { type: 'A' }),
      T.editElement('e1', { type: 'B' }),
    ]);
    tx.apply(model);
    expect(model.elements.get('e1').type).toBe('B');
    tx.unapply(model);
    // forward-order unapply would leave 'A'; reverse-order restores 'orig'
    expect(model.elements.get('e1').type).toBe('orig');
    expect(model).toEqual(before);
  });

  // --- view transactions ---------------------------------------------------

  it('createView: adds a view, unapply removes it (round-trip)', () => {
    const model = M.makeModel();
    const before = structuredClone(model);
    const tx = T.createView({ id: 'v1', type: 'elevation', name: 'Elevation' });
    tx.apply(model);
    expect(model.views.has('v1')).toBe(true);
    tx.unapply(model);
    expect(model).toEqual(before);
  });

  it('editView: patches a view, unapply restores it (round-trip)', () => {
    const model = M.makeModel();
    model.views.set('v1', M.makeView({ id: 'v1', type: 'plan', name: 'Plan', scale: 1 }));
    const before = structuredClone(model);
    const tx = T.editView('v1', { name: 'Plan B', scale: 50 });
    tx.apply(model);
    expect(model.views.get('v1').scale).toBe(50);
    expect(model.views.get('v1').name).toBe('Plan B');
    tx.unapply(model);
    expect(model).toEqual(before);
  });

  it('deleteView: removes a view, unapply restores it (round-trip)', () => {
    const model = M.makeModel();
    model.views.set('v1', M.makeView({ id: 'v1', type: 'section', name: 'Section A' }));
    const before = structuredClone(model);
    const tx = T.deleteView('v1');
    tx.apply(model);
    expect(model.views.has('v1')).toBe(false);
    tx.unapply(model);
    expect(model).toEqual(before);
  });

  // --- sheet transactions --------------------------------------------------

  it('createSheet: adds a sheet, unapply removes it (round-trip)', () => {
    const model = M.makeModel();
    const before = structuredClone(model);
    const tx = T.createSheet({ id: 's1', name: 'S-101', size: 'A1' });
    tx.apply(model);
    expect(model.sheets.has('s1')).toBe(true);
    tx.unapply(model);
    expect(model).toEqual(before);
  });

  it('placeViewOnSheet: appends a placement, unapply removes that exact placement (round-trip)', () => {
    const model = M.makeModel();
    model.sheets.set('s1', M.makeSheet({ id: 's1', name: 'S-101' }));
    const before = structuredClone(model);
    const tx = T.placeViewOnSheet('s1', 'v1', { originOnSheet: { x: 100, y: 50 } });
    tx.apply(model);
    expect(model.sheets.get('s1').placements.length).toBe(1);
    expect(model.sheets.get('s1').placements[0].viewId).toBe('v1');
    tx.unapply(model);
    expect(model).toEqual(before);
  });

  it('editSheet: patches a sheet, unapply restores it (round-trip)', () => {
    const model = M.makeModel();
    model.sheets.set('s1', M.makeSheet({ id: 's1', name: 'S-101' }));
    const before = structuredClone(model);
    const tx = T.editSheet('s1', { name: 'S-102' });
    tx.apply(model);
    expect(model.sheets.get('s1').name).toBe('S-102');
    tx.unapply(model);
    expect(model).toEqual(before);
  });

  // --- material transactions ----------------------------------------------

  it('defineMaterial: adds a new material, unapply removes it (round-trip)', () => {
    const model = M.makeModel();
    const before = structuredClone(model);
    const tx = T.defineMaterial({ id: 'steel-s275', class: 'steel', grade: 'S275', name: 'Steel S275' });
    tx.apply(model);
    expect(model.materials.has('steel-s275')).toBe(true);
    tx.unapply(model);
    expect(model).toEqual(before);
  });

  it('defineMaterial: replacing an existing material restores the prior one on unapply', () => {
    const model = M.makeModel();
    model.materials.set('steel-s275', M.makeMaterial({ id: 'steel-s275', class: 'steel', grade: 'S275' }));
    const before = structuredClone(model);
    const tx = T.defineMaterial({ id: 'steel-s275', class: 'steel', grade: 'S275-REV', name: 'Steel S275 (rev)' });
    tx.apply(model);
    expect(model.materials.get('steel-s275').grade).toBe('S275-REV');
    tx.unapply(model);
    expect(model).toEqual(before);
  });

  it('editMaterial: patches a material and dirties elements that use it (round-trip)', () => {
    const model = M.makeModel();
    model.materials.set('steel-s275', M.makeMaterial({ id: 'steel-s275', class: 'steel', grade: 'S275' }));
    model.elements.set('p1', M.makeElement({ id: 'p1', category: 'plate', geometry: plateGeom(), materialId: 'steel-s275' }));
    const before = structuredClone(model);
    const tx = T.editMaterial('steel-s275', { grade: 'S275-X' });
    const d = tx.apply(model);
    expect(model.materials.get('steel-s275').grade).toBe('S275-X');
    expect(d.elements.has('p1')).toBe(true);   // the element using it is dirty
    tx.unapply(model);
    expect(model).toEqual(before);
  });

  // --- applyTransaction wrapper -------------------------------------------

  it('model.applyTransaction bumps version and isolates the prior model', () => {
    const model = M.makeModel();
    expect(model.version).toBe(0);
    const tx = T.placeElement({ category: 'plate', geometry: plateGeom() });
    const result = M.applyTransaction(model, tx);
    expect(result.newModel.version).toBe(1);
    expect(result.newModel.elements.size).toBe(1);
    // the prior model's Maps are untouched (Map copy isolation)
    expect(model.elements.size).toBe(0);
    expect(model.version).toBe(0);
    expectDirtySet(result.dirty);
    expect(result.dirty.elements.has(tx.data.element.id)).toBe(true);
  });

  it('model.applyTransaction rejects a non-transaction', () => {
    expect(() => M.applyTransaction(M.makeModel(), {})).toThrow();
  });

  // --- registry ------------------------------------------------------------

  it('the transaction registry maps every type discriminator to its factory', () => {
    expect(T.types.length).toBe(13);
    expect(T.registry.size).toBe(13);
    for (const type of T.types) {
      expect(typeof T.registry.get(type)).toBe('function');
    }
    expect(T.registry.get('place-element')).toBe(T.placeElement);
    expect(T.registry.get('batch')).toBe(T.batch);
    expect(T.registry.get('define-material')).toBe(T.defineMaterial);
  });

  it('isTransaction recognises a built transaction', () => {
    expect(T.isTransaction(T.placeElement({ category: 'plate', geometry: plateGeom() }))).toBe(true);
    expect(T.isTransaction({})).toBe(false);
    expect(T.isTransaction(null)).toBe(false);
  });
});
