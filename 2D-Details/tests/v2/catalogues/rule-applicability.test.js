/*
 * StructDraw v2 — catalogue layer: rule appliesTo() across element samples.
 * window.v2 is populated by tests/v2/setup.mjs.
 */

describe('catalogues/rules — applicability', () => {
  let V, model, steelBeam, timberBeam, hbsScrew, bolt, weld;

  beforeEach(() => {
    V = window.v2;
    model = V.model.makeModel();
    // The catalogue materials must be in the model so material-aware rules
    // (cl5.2 / cl3.2 / cl4.4) can resolve element.materialId.
    V.materials.all().forEach((m) => model.materials.set(m.id, m));

    const lin = () => V.model.linearMember({ start: { x: 0, y: 0, z: 0 }, end: { x: 3000, y: 0, z: 0 } });
    const pt = () => V.model.pointInstance({ location: { x: 0, y: 0, z: 0 } });
    const ann = () => V.model.annotation({ viewId: 'v1', points: [{ x: 0, y: 0 }] });

    steelBeam = V.model.makeElement({ category: 'beam', family: 'ub', type: '310UB 40.4', geometry: lin(), materialId: 'steel-s300' });
    timberBeam = V.model.makeElement({ category: 'beam', family: 'glt', type: 'GL 85×600', geometry: lin(), materialId: 'timber-gl18h' });
    hbsScrew = V.model.makeElement({ category: 'fastener', family: 'rothoblaas-hbs', type: 'HBSPL12200', geometry: pt(), materialId: 'screw-galv-grade-c1022' });
    bolt = V.model.makeElement({ category: 'fastener', family: 'as1252-bolt', type: 'M20', geometry: pt(), materialId: 'bolt-as1252-grade-8.8' });
    weld = V.model.makeElement({ category: 'detail-component', family: 'weld-symbol', type: 'fillet', geometry: ann() });
  });

  it('registers 8 rules and is marked ready', () => {
    expect(V.rules.count()).toBe(8);
    expect(V.rules.ready).toBe(true);
  });

  it('every rule has the (id, standard, clause, label, appliesTo, check) shape', () => {
    V.rules.all().forEach((r) => {
      expect(typeof r.id).toBe('string');
      expect(typeof r.standard).toBe('string');
      expect(typeof r.clause).toBe('string');
      expect(typeof r.label).toBe('string');
      expect(typeof r.appliesTo).toBe('function');
      expect(typeof r.check).toBe('function');
    });
  });

  it('AS4100-Cl5.2 applies only to steel beams', () => {
    const r = V.rules.lookup('AS4100-Cl5.2');
    expect(r.appliesTo(steelBeam, model)).toBe(true);
    expect(r.appliesTo(timberBeam, model)).toBe(false);
    expect(r.appliesTo(hbsScrew, model)).toBe(false);
  });

  it('AS1720.1-Cl3.2 applies only to timber beams', () => {
    const r = V.rules.lookup('AS1720.1-Cl3.2');
    expect(r.appliesTo(timberBeam, model)).toBe(true);
    expect(r.appliesTo(steelBeam, model)).toBe(false);
  });

  it('AS1720.1-Cl4.4 applies to any element with a timber material', () => {
    const r = V.rules.lookup('AS1720.1-Cl4.4');
    expect(r.appliesTo(timberBeam, model)).toBe(true);
    expect(r.appliesTo(steelBeam, model)).toBe(false);
  });

  it('the ETA-11/0030 rules apply only to HBS Plate screws', () => {
    ['ETA-11/0030-Tab8', 'ETA-11/0030-Tab7', 'ETA-11/0030-MinDist'].forEach((id) => {
      const r = V.rules.lookup(id);
      expect(r.appliesTo(hbsScrew, model)).toBe(true);
      expect(r.appliesTo(bolt, model)).toBe(false);
      expect(r.appliesTo(steelBeam, model)).toBe(false);
    });
  });

  it('AS4100-Cl9.3 applies only to AS 1252 bolts', () => {
    const r = V.rules.lookup('AS4100-Cl9.3');
    expect(r.appliesTo(bolt, model)).toBe(true);
    expect(r.appliesTo(hbsScrew, model)).toBe(false);
  });

  it('AS4100-Cl9.7 applies only to weld symbols', () => {
    const r = V.rules.lookup('AS4100-Cl9.7');
    expect(r.appliesTo(weld, model)).toBe(true);
    expect(r.appliesTo(steelBeam, model)).toBe(false);
  });

  it('rules.applicableTo collects every applicable rule for an element', () => {
    expect(V.rules.applicableTo(hbsScrew, model).map((r) => r.id).sort())
      .toEqual(['ETA-11/0030-MinDist', 'ETA-11/0030-Tab7', 'ETA-11/0030-Tab8']);
    expect(V.rules.applicableTo(steelBeam, model).map((r) => r.id)).toEqual(['AS4100-Cl5.2']);
    expect(V.rules.applicableTo(timberBeam, model).map((r) => r.id).sort())
      .toEqual(['AS1720.1-Cl3.2', 'AS1720.1-Cl4.4']);
    expect(V.rules.applicableTo(bolt, model).map((r) => r.id)).toEqual(['AS4100-Cl9.3']);
    expect(V.rules.applicableTo(weld, model).map((r) => r.id)).toEqual(['AS4100-Cl9.7']);
  });

  it('byStandard groups rules by source standard', () => {
    expect(V.rules.byStandard('AS 4100-2020').length).toBe(3);
    expect(V.rules.byStandard('AS 1720.1-2010').length).toBe(2);
    expect(V.rules.byStandard('ETA-11/0030 (2019)').length).toBe(3);
  });
});
