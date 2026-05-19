/*
 * StructDraw v2 — catalogue layer: category + family + type lookups.
 * window.v2 is populated by tests/v2/setup.mjs (v1 data + v2 model + v2
 * catalogues); describe/it/expect are globals (vitest.config.mjs globals:true).
 */

describe('catalogues/categories', () => {
  it('registers all 12 model-layer categories', () => {
    const C = window.v2.categories;
    expect(C.keys().length).toBe(12);
    // Every category an Element can hold (model/element.js CATEGORIES) is here.
    window.v2.model.CATEGORIES.forEach((cat) => {
      expect(C.lookupCategory(cat)).toBeTruthy();
    });
  });

  it('each category carries a lineweight policy + geometry kinds', () => {
    window.v2.categories.all().forEach((cat) => {
      expect(typeof cat.label).toBe('string');
      expect(Array.isArray(cat.geometryKinds)).toBe(true);
      expect(cat.defaultLineweight).toHaveProperty('cut');
      expect(cat.defaultLineweight).toHaveProperty('proj');
    });
  });
});

describe('catalogues/lineweights + line-styles + hatches', () => {
  it('AS 1100 lineweight table resolves by name', () => {
    expect(window.v2.lineweights.get('thick')).toBe(0.70);
    expect(window.v2.lineweights.get('fine')).toBe(0.18);
    expect(window.v2.lineweights.get('nonsense')).toBe(null);
  });

  it('line styles and hatch patterns resolve by name', () => {
    expect(window.v2.lineStyles.get('solid').dash).toEqual([]);
    expect(window.v2.lineStyles.get('centre').dash.length).toBeGreaterThan(0);
    expect(window.v2.hatches.get('as1100-steel-45').type).toBe('crosshatch');
    expect(window.v2.hatches.get('none').type).toBe('none');
  });
});

describe('catalogues/families', () => {
  let F;
  beforeEach(() => { F = window.v2.families; });

  it('registers 30 families and is marked ready', () => {
    expect(F.count()).toBe(30);
    expect(F.ready).toBe(true);
  });

  it('every family has a valid category, types array, rendererKey', () => {
    F.all().forEach((fam) => {
      expect(window.v2.categories.lookupCategory(fam.category)).toBeTruthy();
      expect(Array.isArray(fam.types)).toBe(true);
      expect(typeof fam.rendererKey).toBe('string');
      expect(fam.paramSchema && typeof fam.paramSchema).toBe('object');
    });
  });

  it('beam-ub imports the v1 UB_DB — 28 UB-only rows, no UC/WB bleed', () => {
    const ub = F.lookup('ub');
    // 03-data-bolts.js merges UC + WB into UB_DB at load; beam-ub recovers the
    // UB-only set. There are 28 AS 3679.1 UB sections.
    expect(ub.types.length).toBe(28);
    ub.types.forEach((t) => {
      expect(t.id).toContain('UB');
      expect(t.id).not.toContain('UC');
      expect(t.id).not.toContain('WB');
      expect(typeof t.d).toBe('number');
    });
    // v1 type keys are kept verbatim (spaces and all) for migration fidelity.
    expect(ub.types.some((t) => t.id === '310UB 40.4')).toBe(true);
  });

  it('the v1 steel section catalogues each map to a family', () => {
    expect(F.lookup('uc').types.length).toBe(13);
    expect(F.lookup('wb').types.length).toBe(23);
    ['pfc', 'shs', 'rhs', 'chs', 'ea', 'ua'].forEach((id) => {
      expect(F.lookup(id).types.length).toBeGreaterThan(0);
    });
  });

  it('fastener-rothoblaas-hbs imports the 18 v1 HBS Plate screws', () => {
    const hbs = F.lookup('rothoblaas-hbs');
    expect(hbs.types.length).toBe(18);
    expect(hbs.types.some((t) => t.id === 'HBSPL12200')).toBe(true);
    expect(F.lookup('as1252-bolt').types.length).toBeGreaterThan(0);
  });

  it('byCategory groups families correctly', () => {
    expect(F.byCategory('beam').length).toBe(12);   // 9 steel + glt/clt/custom-rect
    expect(F.byCategory('fastener').length).toBe(4);
    expect(F.byCategory('reinforcement').length).toBe(2);
    expect(F.byCategory('annotation').length).toBe(6);
    expect(F.byCategory('detail-component').length).toBe(3);
    expect(F.byCategory('plate').length).toBe(1);
    expect(F.byCategory('masonry').length).toBe(1);
    expect(F.byCategory('sheet-component').length).toBe(1);
  });

  it('covers every v1 entity type with a family', () => {
    // v1 members, plates, screws, bolts, anchors, rebar, mesh, masonry,
    // annotations — each v1 concept resolves to a v2 family.
    ['ub', 'uc', 'pfc', 'shs', 'rhs', 'chs', 'ea', 'ua', 'wb',  // members
      'glt', 'clt', 'custom-rect',                              // timber members
      'plate-flat',                                             // plates
      'rothoblaas-hbs', 'as1252-bolt', 'anchor-bolt',           // fasteners
      'bar', 'mesh', 'cmu',                                     // reo + masonry
      'dimension', 'leader', 'tag'                              // annotations
    ].forEach((id) => {
      expect(F.lookup(id)).toBeTruthy();
    });
  });
});

describe('catalogues/index — cross-catalogue lookups', () => {
  it('lookupType resolves a Type row within a family', () => {
    const t = window.v2.catalogues.lookupType('ub', '310UB 40.4');
    expect(t).toBeTruthy();
    expect(t.d).toBe(304);
  });

  it('resolveTypeRef resolves a (category, family, type) triple', () => {
    const ref = window.v2.catalogues.resolveTypeRef('beam', 'ub', '310UB 40.4');
    expect(ref).toBeTruthy();
    expect(ref.family.id).toBe('ub');
    expect(ref.type.id).toBe('310UB 40.4');
    // A category that does not own the family resolves to null.
    expect(window.v2.catalogues.resolveTypeRef('plate', 'ub', '310UB 40.4')).toBe(null);
  });

  it('summary reports the catalogue census', () => {
    const s = window.v2.catalogues.summary();
    expect(s.categories).toBe(12);
    expect(s.families).toBe(30);
    expect(s.materials).toBe(18);
    expect(s.rules).toBe(8);
  });
});
