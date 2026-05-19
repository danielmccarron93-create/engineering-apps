/**
 * StructDraw v2 · Catalogue Layer · rules · AS 4100 Cl 5.2 — member moment capacity
 * LAYER: catalogue/rules — design moment capacity of a steel member.
 *        Pure function; self-registers.
 * READS:  window.v2.rules, window.v2.families
 * WRITES: window.v2.rules registry entry 'AS4100-Cl5.2'
 *
 * Classic <script>, no build step. The worked rule of 04-catalogue-system.md §5.
 * Ms = fy · Z (section moment capacity); Mb = φ · αs · Ms (member capacity, the
 * slenderness reduction αs supplied by the caller). Z is taken from context or
 * computed from the I-section family params (Ix of the outer rectangle minus
 * the web-side voids; root radii are conservatively ignored).
 *
 * check(element, model, context) — context: { M_star, alpha_s, Zx }
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});

  const I_SECTION_FAMILIES = { ub: 1, uc: 1, wb: 1 };

  /** Elastic section modulus Zx (mm³) for an I-section family/type. */
  function iSectionZx(element) {
    if (!I_SECTION_FAMILIES[element.family]) return null;
    const fams = v2.families;
    if (!fams || typeof fams.lookup !== 'function') return null;
    const fam = fams.lookup(element.family);
    if (!fam || !Array.isArray(fam.types)) return null;
    let t = null;
    for (let i = 0; i < fam.types.length; i++) {
      if (fam.types[i].id === element.type) { t = fam.types[i]; break; }
    }
    if (!t || !(t.d > 0)) return null;
    const Ix = (t.bf * Math.pow(t.d, 3)) / 12 -
               ((t.bf - t.tw) * Math.pow(t.d - 2 * t.tf, 3)) / 12;
    return (2 * Ix) / t.d;
  }

  const Rule = {
    id: 'AS4100-Cl5.2',
    standard: 'AS 4100-2020',
    clause: 'Cl 5.2',
    label: 'Steel member moment capacity (Mb)',

    appliesTo: function (element, model) {
      if (!element || element.category !== 'beam') return false;
      const mat = model && model.materials && model.materials.get(element.materialId);
      return !!mat && mat.class === 'steel';
    },

    check: function (element, model, context) {
      context = context || {};
      const steps = [];
      const mat = model && model.materials && model.materials.get(element.materialId);
      const fy = (mat && mat.structural && typeof mat.structural.fy === 'number')
        ? mat.structural.fy : 0;
      const Zx = (typeof context.Zx === 'number') ? context.Zx : iSectionZx(element);
      const phi = 0.9;
      const alphaS = (typeof context.alpha_s === 'number') ? context.alpha_s : 1.0;
      steps.push({ label: 'fy', value: fy, unit: 'MPa' });
      steps.push({ label: 'Zx (section modulus)', value: Zx, unit: 'mm³' });
      steps.push({ label: 'αs (slenderness reduction)', value: alphaS });

      // Ms = fy · Zx ; Mb = φ · αs · Ms   (N·mm → kN·m).
      const Ms = (Zx != null) ? (fy * Zx) / 1e6 : NaN;
      const Mb = (Zx != null) ? phi * alphaS * Ms : NaN;
      steps.push({ label: 'Ms = fy · Zx', value: Ms, unit: 'kN·m' });
      steps.push({ label: 'Mb = φ · αs · Ms', value: Mb, unit: 'kN·m' });

      const Mstar = (typeof context.M_star === 'number') ? context.M_star : 0;
      const eta = (Mb > 0) ? Mstar / Mb : Infinity;
      steps.push({ label: 'η = M* / Mb', value: eta });

      return {
        ruleId: Rule.id,
        passed: isFinite(eta) && eta <= 1.0 + 1e-9,
        utilisation: eta,
        Ms: Ms,
        Mb: Mb,
        M_star: Mstar,
        citation: 'AS 4100-2020 Cl 5.2.1',
        verboseSteps: steps,
      };
    },
  };

  v2.rules.register(Rule);
})();
