/**
 * StructDraw v2 · Catalogue Layer · rules · AS 4100 Cl 9.3 — bolted connections
 * LAYER: catalogue/rules — design shear capacity of an AS 1252 bolt.
 *        Pure function; self-registers.
 * READS:  window.v2.rules, window.v2.families
 * WRITES: window.v2.rules registry entry 'AS4100-Cl9.3'
 *
 * Classic <script>, no build step. Vf = φ · 0.62 · fuf · kr · (nn·Ac + nx·Ao):
 * shear through threads uses the core area Ac, shear through the shank uses the
 * shank area Ao. fuf is the bolt material's tensile strength; the bolt
 * diameters come from the as1252-bolt family catalogue.
 *
 * check(element, model, context) — context: { n_thread, n_shank, k_r, V_star }
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});

  /** Bolt catalogue row for the element's type. */
  function boltType(element) {
    const fams = v2.families;
    if (!fams || typeof fams.lookup !== 'function') return null;
    const fam = fams.lookup('as1252-bolt');
    if (!fam || !Array.isArray(fam.types)) return null;
    for (let i = 0; i < fam.types.length; i++) {
      if (fam.types[i].id === element.type) return fam.types[i];
    }
    return null;
  }

  const Rule = {
    id: 'AS4100-Cl9.3',
    standard: 'AS 4100-2020',
    clause: 'Cl 9.3',
    label: 'Bolt shear capacity (Vf)',

    appliesTo: function (element) {
      return !!element && element.category === 'fastener' &&
             element.family === 'as1252-bolt';
    },

    check: function (element, model, context) {
      context = context || {};
      const steps = [];
      const t = boltType(element);
      if (!t) {
        return {
          ruleId: Rule.id, passed: false, utilisation: Infinity,
          error: 'Bolt "' + (element && element.type) + '" not in the AS 1252 catalogue.',
          citation: 'AS 4100-2020 Cl 9.3.2.1', verboseSteps: steps,
        };
      }
      const mat = model && model.materials && model.materials.get(element.materialId);
      const fuf = (mat && mat.structural && typeof mat.structural.fu === 'number')
        ? mat.structural.fu : 830;  // grade 8.8 default

      const Ac = (Math.PI / 4) * t.minorD * t.minorD;  // core (threaded) area
      const Ao = (Math.PI / 4) * t.d * t.d;            // shank area
      const nn = (typeof context.n_thread === 'number') ? context.n_thread : 1;
      const nx = (typeof context.n_shank === 'number') ? context.n_shank : 0;
      const kr = (typeof context.k_r === 'number') ? context.k_r : 1.0;
      const phi = 0.8;
      steps.push({ label: 'fuf', value: fuf, unit: 'MPa' });
      steps.push({ label: 'Ac (core area)', value: Ac, unit: 'mm²' });
      steps.push({ label: 'Ao (shank area)', value: Ao, unit: 'mm²' });
      steps.push({ label: 'shear planes — thread / shank', value: nn + ' / ' + nx });

      // Vf = φ · 0.62 · fuf · kr · (nn·Ac + nx·Ao)   (N → kN).
      const Vf = (phi * 0.62 * fuf * kr * (nn * Ac + nx * Ao)) / 1000;
      steps.push({ label: 'φVf = φ · 0.62 · fuf · kr · (nn·Ac + nx·Ao)', value: Vf, unit: 'kN' });

      const Vstar = (typeof context.V_star === 'number') ? context.V_star : 0;
      const eta = (Vf > 0) ? Vstar / Vf : Infinity;
      steps.push({ label: 'η = V* / φVf', value: eta });

      return {
        ruleId: Rule.id,
        passed: isFinite(eta) && eta <= 1.0 + 1e-9,
        utilisation: eta,
        Vf: Vf,
        V_star: Vstar,
        citation: 'AS 4100-2020 Cl 9.3.2.1',
        verboseSteps: steps,
      };
    },
  };

  v2.rules.register(Rule);
})();
