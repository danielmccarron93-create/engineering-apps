/*
 * StructDraw v2 — Phase 0e: serialise / deserialise round-trip.
 *
 * Asserts the contract `modelFromJSON(modelToJSON(m))` is structurally equal
 * to `m`, across the full Element / Material / View / Sheet / Project mix. The
 * round-trip is what makes the v2 save format trustworthy: a saved file loaded
 * back should produce a model the renderer treats identically to the original.
 *
 * window.v2 is populated by tests/v2/setup.mjs; describe/it/expect are globals.
 */

describe('Phase 0e — v2 serialise <-> deserialise round-trip', () => {
  let model, materials, views, sheets;

  function buildSampleModel() {
    const M = window.v2.model;

    // Two materials — one steel (typical beam), one bolt-grade-8.8 (fastener).
    const steel = M.makeMaterial({
      id: 'steel-s300', name: 'Steel S300', class: 'steel', grade: 'S300',
      display: { hatchCut: 'as1100-steel-45', hatchProj: 'none',
                 color: '#444', outlineCut: 'solid', outlineProj: 'solid' },
      structural: { fy: 300, fu: 440, E: 200000, density: 7850 },
    });
    const bolt = M.makeMaterial({
      id: 'bolt-as1252-8.8', name: 'Bolt AS1252 8.8', class: 'fastener', grade: '8.8',
      display: { hatchCut: 'none', hatchProj: 'none',
                 color: '#888', outlineCut: 'solid', outlineProj: 'solid' },
      structural: { fy: 640, fu: 800 },
    });

    // One model-level UB beam, one view-local plate region, one view-local dim.
    const ubElem = M.makeElement({
      id: 'beam-1',
      category: 'beam', family: 'ub', type: '310UB40.4',
      geometry: M.linearMember({
        start: { x: 0, y: 0, z: 0 }, end: { x: 6000, y: 0, z: 0 },
      }),
      materialId: 'steel-s300',
      params: { source: 'roundtrip-test' },
      createdAt: 100,
    });
    const elevView = M.makeView({
      id: 'view-elev', type: 'elevation', name: 'Elevation', scale: 10,
    });
    const plateElem = M.makeElement({
      id: 'plate-1',
      category: 'plate', family: 'plate-flat', type: null,
      geometry: M.region({
        viewId: 'view-elev',
        polygon: [
          { x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 0, y: 100 },
        ],
      }),
      materialId: 'steel-s300',
      params: {},
      createdAt: 200,
    });
    const dimElem = M.makeElement({
      id: 'dim-1',
      category: 'annotation', family: 'dimension', type: 'aligned',
      geometry: M.annotation({
        viewId: 'view-elev',
        points: [{ x: 0, y: 0 }, { x: 200, y: 0 }],
        data: { off: 40, dimType: 'horizontal' },
      }),
      materialId: null,
      params: {},
      createdAt: 300,
    });

    // One sheet placing the elevation view.
    const sheet = M.makeSheet({
      id: 'sheet-1', name: 'S-101', size: 'A1',
      placements: [{ viewId: 'view-elev', originOnSheet: { x: 50, y: 400 } }],
    });

    materials = new Map([[steel.id, steel], [bolt.id, bolt]]);
    views = new Map([[elevView.id, elevView]]);
    sheets = new Map([[sheet.id, sheet]]);
    return M.makeModel({
      elements: new Map([[ubElem.id, ubElem], [plateElem.id, plateElem], [dimElem.id, dimElem]]),
      materials: materials, views: views, sheets: sheets,
      project: M.makeProject({ id: 'proj-test', name: 'Roundtrip', createdAt: 42 }),
      version: 7,
    });
  }

  beforeEach(() => { model = buildSampleModel(); });

  // --- serialise produces JSON-friendly output -----------------------------

  it('modelToJSON emits arrays for the four maps + schema metadata', () => {
    const json = window.v2.io.modelToJSON(model);
    expect(json.schemaVersion).toBe(2);
    expect(json.version).toBe(7);
    expect(json.project).toEqual(model.project);
    expect(Array.isArray(json.elements)).toBe(true);
    expect(Array.isArray(json.materials)).toBe(true);
    expect(Array.isArray(json.views)).toBe(true);
    expect(Array.isArray(json.sheets)).toBe(true);
    expect(json.elements.length).toBe(3);
    expect(json.materials.length).toBe(2);
    expect(json.views.length).toBe(1);
    expect(json.sheets.length).toBe(1);
  });

  it('serialised output survives JSON.parse(JSON.stringify(...))', () => {
    const text = window.v2.io.modelToString(model);
    expect(typeof text).toBe('string');
    const reparsed = JSON.parse(text);
    expect(reparsed.schemaVersion).toBe(2);
    expect(reparsed.elements.length).toBe(3);
    expect(reparsed.elements[0].id).toBe('beam-1');
  });

  // --- deserialise rebuilds the runtime contract ---------------------------

  it('modelFromJSON rebuilds Maps keyed by id', () => {
    const json = window.v2.io.modelToJSON(model);
    const reb = window.v2.io.modelFromJSON(json);
    expect(reb.elements).toBeInstanceOf(Map);
    expect(reb.materials).toBeInstanceOf(Map);
    expect(reb.views).toBeInstanceOf(Map);
    expect(reb.sheets).toBeInstanceOf(Map);
    expect(reb.elements.get('beam-1').category).toBe('beam');
    expect(reb.materials.get('steel-s300').class).toBe('steel');
    expect(reb.views.get('view-elev').type).toBe('elevation');
    expect(reb.sheets.get('sheet-1').placements.length).toBe(1);
  });

  it('round-trip preserves element identity, version, project metadata', () => {
    const reb = window.v2.io.modelFromJSON(window.v2.io.modelToJSON(model));
    expect(reb.version).toBe(7);
    expect(reb.project.id).toBe('proj-test');
    expect(reb.project.createdAt).toBe(42);
    expect(reb.elements.size).toBe(3);
    // The element geometry survives — start/end coords preserved on UB.
    expect(reb.elements.get('beam-1').geometry.start).toEqual({ x: 0, y: 0, z: 0 });
    expect(reb.elements.get('beam-1').geometry.end).toEqual({ x: 6000, y: 0, z: 0 });
    // The plate region's polygon is preserved (4 vertices, view-local 2D).
    expect(reb.elements.get('plate-1').geometry.polygon.length).toBe(4);
    expect(reb.elements.get('plate-1').geometry.viewId).toBe('view-elev');
    // Dimension data block survives.
    expect(reb.elements.get('dim-1').geometry.data).toEqual({ off: 40, dimType: 'horizontal' });
  });

  it('round-trip preserves Map insertion order', () => {
    const reb = window.v2.io.modelFromJSON(window.v2.io.modelToJSON(model));
    expect(Array.from(reb.elements.keys())).toEqual(['beam-1', 'plate-1', 'dim-1']);
    expect(Array.from(reb.materials.keys())).toEqual(['steel-s300', 'bolt-as1252-8.8']);
  });

  // --- robustness ----------------------------------------------------------

  it('modelFromString returns null on invalid JSON', () => {
    expect(window.v2.io.modelFromString('{this is not json')).toBeNull();
  });

  it('modelFromJSON({}) builds an empty but valid model', () => {
    const m = window.v2.io.modelFromJSON({});
    expect(m.elements.size).toBe(0);
    expect(m.materials.size).toBe(0);
    expect(m.views.size).toBe(0);
    expect(m.sheets.size).toBe(0);
    expect(m.project).toBeTruthy();
  });

  // --- the save-payload preview (Phase 0e save.js stub) --------------------

  it('save.previewSavePayload wraps the model under v2 with schemaVersion 2', () => {
    const payload = window.v2.io.save.previewSavePayload(model, null);
    expect(payload.schemaVersion).toBe(2);
    expect(payload.v2).toBeTruthy();
    expect(payload.v2.elements.length).toBe(3);
    expect(payload.v1).toBeUndefined();
  });

  it('save.previewSavePayload carries a v1 legacy slice when provided', () => {
    const v1Slice = {
      objects3D: [{ id: 1, type: 'ub' }],
      entities2D: { elevation: [] },
      blocks: [{ viewKey: 'elevation' }],
      drawingScale: 10,
      gridSize: 5,
    };
    const payload = window.v2.io.save.previewSavePayload(model, v1Slice);
    expect(payload.v1.objects3D.length).toBe(1);
    expect(payload.v1.drawingScale).toBe(10);
    expect(payload.v1.gridSize).toBe(5);
  });
});
