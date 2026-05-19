/*
 * StructDraw v2 — catalogue layer: rule check() against known fixtures.
 *
 * The Phase 0c EXIT CRITERION lives here: the ETA-11/0030 Table 8 rule must
 * reproduce the timber-screws Test 1 fixture (η = 0.801, PASS) — proving the
 * v2 rule layer is faithful to v1's js/79-checks-timber.js.
 * See PlannedBuilds/timber-screws/09-test-cases.md.
 *
 * window.v2 is populated by tests/v2/setup.mjs.
 */

describe('catalogues/rules — check()', () => {
  let V, model;

  beforeEach(() => {
    V = window.v2;
    model = V.model.makeModel();
    V.materials.all().forEach((m) => model.materials.set(m.id, m));
  });

  function hbsScrew() {
    return V.model.makeElement({
      category: 'fastener', family: 'rothoblaas-hbs', type: 'HBSPL12200',
      geometry: V.model.pointInstance({ location: { x: 0, y: 0, z: 0 } }),
      materialId: 'screw-galv-grade-c1022',
    });
  }

  // ── EXIT CRITERION ───────────────────────────────────────────────────────
  describe('ETA-11/0030-Tab8 — timber-screws Test 1 (the Phase 0c gate)', () => {
    // Test 1: HBSPL12200, 10 mm plate, GL28h, SC1 / medium-term, F_d = 25 kN,
    // two along-grain rows of three screws at a1 = 60 mm.
    const TEST1_CONTEXT = {
      plateThickness: 10,
      timberClass: 'GL28h',
      serviceClass: 'SC1',
      loadCase: 'medium',
      F_d: 25,
      rows: [{ n: 3, a1: 60 }, { n: 3, a1: 60 }],
    };

    it('reproduces η = 0.801 and overall PASS', () => {
      const tab8 = V.rules.lookup('ETA-11/0030-Tab8');
      const r = tab8.check(hbsScrew(), model, TEST1_CONTEXT);

      // Capacity chain — each step matches v1 79-checks-timber.js.
      expect(r.R_Vk).toBe(12.99);          // p.216 lookup, HBSPL12200 @ 10 mm
      expect(r.k_dens).toBe(1.05);         // GL28h density adjustment
      expect(r.k_mod).toBe(0.8);           // SC1 / medium-term
      expect(r.gamma_M).toBe(1.3);
      expect(r.R_Vd_per_screw).toBeCloseTo(8.3935, 3);
      expect(r.R_Vd_total).toBeCloseTo(31.224, 2);

      // The gate: η rounds to 0.801 and the connection passes.
      expect(r.utilisation).toBeCloseTo(0.8007, 3);
      expect(r.utilisation.toFixed(3)).toBe('0.801');
      expect(Math.abs(r.utilisation - 0.801)).toBeLessThan(0.01);
      expect(r.passed).toBe(true);

      // n_ef per row — three screws at a1 = 5·d → 1.86 (Rothoblaas p.215).
      expect(r.perRow.length).toBe(2);
      expect(r.perRow[0].n_ef).toBeCloseTo(1.86, 5);
      expect(r.verboseSteps.length).toBeGreaterThan(0);
    });

    it('Test 7 — F_d = 100 kN overloads the connection (η ≈ 3.2, FAIL)', () => {
      const tab8 = V.rules.lookup('ETA-11/0030-Tab8');
      const ctx = Object.assign({}, TEST1_CONTEXT, { F_d: 100 });
      const r = tab8.check(hbsScrew(), model, ctx);
      expect(r.utilisation).toBeCloseTo(3.20, 1);
      expect(r.passed).toBe(false);
    });

    it('Test 9 — a single screw has no group action (n_ef = 1, η ≈ 2.98, FAIL)', () => {
      const tab8 = V.rules.lookup('ETA-11/0030-Tab8');
      const ctx = Object.assign({}, TEST1_CONTEXT, { rows: [{ n: 1, a1: 0 }] });
      const r = tab8.check(hbsScrew(), model, ctx);
      expect(r.perRow[0].n_ef).toBe(1);
      expect(r.utilisation).toBeCloseTo(2.98, 1);
      expect(r.passed).toBe(false);
    });
  });

  // ── ETA-11/0030 minimum distances ────────────────────────────────────────
  describe('ETA-11/0030-MinDist', () => {
    it('reproduces the Test 1 required distances at α = 0°', () => {
      const md = V.rules.lookup('ETA-11/0030-MinDist');
      const r = md.check(hbsScrew(), model, {
        ruleSetId: 'rothoblaas-hbs-steel-to-timber-predrilled', d: 12, alpha: 0,
      });
      expect(r.required.a1).toBeCloseTo(42, 5);     // 5·d·0.7
      expect(r.required.a2).toBeCloseTo(25.2, 5);   // 3·d·0.7
      expect(r.required.a3t).toBeCloseTo(144, 5);   // 12·d
      expect(r.required.a3c).toBeCloseTo(84, 5);    // 7·d
      expect(r.required.a4t).toBeCloseTo(36, 5);    // 3·d
      expect(r.required.a4c).toBeCloseTo(36, 5);    // 3·d
    });

    it('interpolates linearly to α = 90°', () => {
      const md = V.rules.lookup('ETA-11/0030-MinDist');
      const r = md.check(hbsScrew(), model, {
        ruleSetId: 'rothoblaas-hbs-steel-to-timber-predrilled', d: 12, alpha: 90,
      });
      expect(r.required.a1).toBeCloseTo(33.6, 5);   // 4·d·0.7
      expect(r.required.a3t).toBeCloseTo(84, 5);    // 7·d
    });

    it('flags an applied distance below the requirement', () => {
      const md = V.rules.lookup('ETA-11/0030-MinDist');
      const r = md.check(hbsScrew(), model, {
        ruleSetId: 'rothoblaas-hbs-steel-to-timber-predrilled', d: 12, alpha: 0,
        checks: [
          { ruleType: 'a3t', applied: 200 },  // 200 ≥ 144 → ok
          { ruleType: 'a3t', applied: 100 },  // 100 < 144 → fail
        ],
      });
      expect(r.checks[0].pass).toBe(true);
      expect(r.checks[1].pass).toBe(false);
      expect(r.passed).toBe(false);
    });
  });

  // ── ETA-11/0030 axial withdrawal ─────────────────────────────────────────
  it('ETA-11/0030-Tab7 computes a withdrawal capacity', () => {
    const tab7 = V.rules.lookup('ETA-11/0030-Tab7');
    const r = tab7.check(hbsScrew(), model, {
      substrate: 'softwood', l_ef: 120, serviceClass: 'SC1', loadCase: 'medium',
      F_ax_d: 5, n: 1,
    });
    expect(r.R_ax_k).toBeCloseTo(16.848, 3);        // 11.7 · 12 · 120 / 1000
    expect(r.R_ax_d_total).toBeCloseTo(10.368, 3);  // 0.8 · 1 · 16.848 / 1.3
    expect(r.passed).toBe(true);
  });

  // ── AS 4100 / AS 1720.1 ──────────────────────────────────────────────────
  it('AS4100-Cl5.2 computes Mb for a steel UB from its catalogue section', () => {
    const beam = V.model.makeElement({
      category: 'beam', family: 'ub', type: '310UB 40.4',
      geometry: V.model.linearMember({ start: { x: 0, y: 0, z: 0 }, end: { x: 6000, y: 0, z: 0 } }),
      materialId: 'steel-s300',
    });
    const r = V.rules.lookup('AS4100-Cl5.2').check(beam, model, { M_star: 100 });
    // Zx of 310UB40.4 ≈ 554 350 mm³ → Ms = 300·Zx → Mb = 0.9·Ms.
    expect(r.Mb).toBeCloseTo(149.67, 1);
    expect(r.utilisation).toBeCloseTo(100 / r.Mb, 6);
    expect(r.passed).toBe(true);
  });

  it('AS1720.1-Cl3.2 computes Md for a glulam beam', () => {
    const beam = V.model.makeElement({
      category: 'beam', family: 'glt', type: 'GL 85×600',
      geometry: V.model.linearMember({ start: { x: 0, y: 0, z: 0 }, end: { x: 6000, y: 0, z: 0 } }),
      materialId: 'timber-gl18h',
    });
    const r = V.rules.lookup('AS1720.1-Cl3.2').check(beam, model, { M_star: 50 });
    // Z = 85·600²/6 = 5.1e6 mm³; Md = 0.85·1·18·Z = 78.03 kN·m.
    expect(r.Md).toBeCloseTo(78.03, 2);
    expect(r.passed).toBe(true);
  });

  it('AS1720.1-Cl4.4 multiplies the supplied modification factors', () => {
    const beam = V.model.makeElement({
      category: 'beam', family: 'glt', type: 'GL 85×600',
      geometry: V.model.linearMember({ start: { x: 0, y: 0, z: 0 }, end: { x: 6000, y: 0, z: 0 } }),
      materialId: 'timber-gl18h',
    });
    const r = V.rules.lookup('AS1720.1-Cl4.4').check(beam, model,
      { k1: 0.8, k9: 1.0, phi: 0.85, characteristicStrength: 18 });
    expect(r.combinedFactor).toBeCloseTo(0.8, 6);
    expect(r.designStrength).toBeCloseTo(0.85 * 0.8 * 18, 4);  // 12.24 MPa
  });

  it('AS4100-Cl9.3 computes the shear capacity of an M20 bolt', () => {
    const bolt = V.model.makeElement({
      category: 'fastener', family: 'as1252-bolt', type: 'M20',
      geometry: V.model.pointInstance({ location: { x: 0, y: 0, z: 0 } }),
      materialId: 'bolt-as1252-grade-8.8',
    });
    const r = V.rules.lookup('AS4100-Cl9.3').check(bolt, model,
      { n_thread: 1, n_shank: 0, V_star: 50 });
    expect(r.Vf).toBeCloseTo(92.71, 1);    // φ·0.62·830·Ac, threads in shear plane
    expect(r.passed).toBe(true);
  });

  it('AS4100-Cl9.7 computes a fillet weld capacity per unit length', () => {
    const weld = V.model.makeElement({
      category: 'detail-component', family: 'weld-symbol', type: 'fillet',
      geometry: V.model.annotation({ viewId: 'v1', points: [{ x: 0, y: 0 }] }),
    });
    const r = V.rules.lookup('AS4100-Cl9.7').check(weld, model,
      { weldSize: 6, fuw: 480, length: 100, v_star: 0.5 });
    expect(r.vw).toBeCloseTo(0.9775, 3);            // φ·0.6·480·(6/√2)/1000
    expect(r.capacityTotal).toBeCloseTo(97.75, 1);  // φvw · 100 mm
    expect(r.passed).toBe(true);
  });
});
