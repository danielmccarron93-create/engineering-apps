/**
 * StructDraw v2 · Catalogue Layer · rules · AS 1720.1 Cl 3.2 — timber bending
 * LAYER: catalogue/rules — design bending capacity of a timber member.
 *        Pure function; self-registers.
 * READS:  window.v2.rules, window.v2.families
 * WRITES: window.v2.rules registry entry 'AS1720.1-Cl3.2'
 *
 * Classic <script>, no build step. Md = φ · k · f'b · Z. f'b is the timber
 * material's characteristic bending strength; Z is the elastic section modulus
 * (b·d²/6), taken from context or computed from the family's section params.
 * The combined modification factor k is supplied by context (see the AS 1720.1
 * Cl 4.4 modification-factors rule). See 04-catalogue-system.md §5.
 *
 * check(element, model, context) — context: { phi, k, M_star, Z }
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});

  function sectionModulus(element) {
    const fams = v2.families;
    if (!fams || typeof fams.lookup !== 'function') return null;
    const fam = fams.lookup(element.family);
    if (!fam || !Array.isArray(fam.types)) return null;
    let typ = null;
    for (let i = 0; i < fam.types.length; i++) {
      if (fam.types[i].id === element.type) { typ = fam.types[i]; break; }
    }
    if (typ && typeof typ.b === 'number' && typeof typ.d === 'number') {
      return (typ.b * typ.d * typ.d) / 6;  // mm³
    }
    return null;
  }

  const Rule = {
    id: 'AS1720.1-Cl3.2',
    standard: 'AS 1720.1-2010',
    clause: 'Cl 3.2',
    label: 'Timber member bending capacity (Md)',

    appliesTo: function (element, model) {
      if (!element) return false;
      if (element.category !== 'beam' && element.category !== 'timber-member') return false;
      const mat = model && model.materials && model.materials.get(element.materialId);
      return !!mat && mat.class === 'timber';
    },

    check: function (element, model, context) {
      context = context || {};
      const steps = [];
      const mat = model && model.materials && model.materials.get(element.materialId);
      const fb = (mat && mat.structural && typeof mat.structural.characteristicStrength === 'number')
        ? mat.structural.characteristicStrength : 0;
      const Z = (typeof context.Z === 'number') ? context.Z : sectionModulus(element);
      const phi = (typeof context.phi === 'number') ? context.phi : 0.85;
      const k = (typeof context.k === 'number') ? context.k : 1.0;
      steps.push({ label: "f'b (characteristic bending strength)", value: fb, unit: 'MPa' });
      steps.push({ label: 'Z (section modulus)', value: Z, unit: 'mm³' });
      steps.push({ label: 'φ (capacity factor)', value: phi });
      steps.push({ label: 'k (combined modification factor)', value: k });

      // Md = φ · k · f'b · Z  (N·mm → kN·m).
      const Md = (Z != null) ? (phi * k * fb * Z) / 1e6 : NaN;
      steps.push({ label: "Md = φ · k · f'b · Z", value: Md, unit: 'kN·m' });

      const Mstar = (typeof context.M_star === 'number') ? context.M_star : 0;
      const eta = (Md > 0) ? Mstar / Md : Infinity;
      steps.push({ label: 'η = M* / Md', value: eta });

      return {
        ruleId: Rule.id,
        passed: isFinite(eta) && eta <= 1.0 + 1e-9,
        utilisation: eta,
        Md: Md,
        M_star: Mstar,
        citation: 'AS 1720.1-2010 Cl 3.2.1.1',
        verboseSteps: steps,
      };
    },
  };

  v2.rules.register(Rule);
})();
