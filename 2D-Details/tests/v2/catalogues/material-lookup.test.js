/*
 * StructDraw v2 — catalogue layer: material lookup + display-prop resolution.
 * window.v2 is populated by tests/v2/setup.mjs.
 */

describe('catalogues/materials', () => {
  let M;
  beforeEach(() => { M = window.v2.materials; });

  it('registers 18 materials and is marked ready', () => {
    expect(M.count()).toBe(18);
    expect(M.ready).toBe(true);
  });

  it('lookup returns a model-layer Material shape', () => {
    const s300 = M.lookup('steel-s300');
    expect(s300.class).toBe('steel');
    expect(s300.grade).toBe('300');
    expect(s300.structural.fy).toBe(300);
    expect(s300.structural.E).toBe(200000);
    // Q8: plain object, built by v2.model.makeMaterial.
    expect(Object.getPrototypeOf(s300)).toBe(Object.prototype);
    expect(M.lookup('no-such-material')).toBe(null);
  });

  it('every material has a valid class', () => {
    M.all().forEach((mat) => {
      expect(window.v2.model.isMaterialClass(mat.class)).toBe(true);
    });
  });

  it('byClass groups materials correctly', () => {
    expect(M.byClass('steel').length).toBe(4);     // s275/s300/s355 + reinforcement
    expect(M.byClass('concrete').length).toBe(5);
    expect(M.byClass('timber').length).toBe(5);
    expect(M.byClass('masonry').length).toBe(1);
    expect(M.byClass('fastener').length).toBe(3);
  });

  it('display props resolve to real hatch + line-style catalogue entries', () => {
    M.all().forEach((mat) => {
      expect(mat.display).toBeTruthy();
      // hatchCut / hatchProj name hatches.js patterns.
      expect(window.v2.hatches.get(mat.display.hatchCut)).toBeTruthy();
      expect(window.v2.hatches.get(mat.display.hatchProj)).toBeTruthy();
      // outlineCut / outlineProj name line-styles.js styles.
      expect(window.v2.lineStyles.get(mat.display.outlineCut)).toBeTruthy();
      expect(window.v2.lineStyles.get(mat.display.outlineProj)).toBeTruthy();
      // color is a theme-aware CSS token.
      expect(typeof mat.display.color).toBe('string');
    });
  });

  it('structural properties are populated and category-appropriate', () => {
    expect(M.lookup('concrete-n32').structural.characteristicStrength).toBe(32);
    expect(M.lookup('timber-gl18h').structural.characteristicStrength).toBe(18);
    expect(M.lookup('bolt-as1252-grade-8.8').structural.fu).toBe(830);
    M.all().forEach((mat) => {
      expect(typeof mat.structural.sourceStandard).toBe('string');
    });
  });

  it('every family defaultMaterial resolves to a registered material', () => {
    window.v2.families.all().forEach((fam) => {
      if (fam.defaultMaterial != null) {
        expect(window.v2.catalogues.lookupMaterial(fam.defaultMaterial)).toBeTruthy();
      }
    });
  });
});
