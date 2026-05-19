/**
 * StructDraw v2 · Catalogue Layer · rules · AS 1720.1 Cl 4.4 — modification factors
 * LAYER: catalogue/rules — combines the AS 1720.1 strength modification factors
 *        into a single multiplier. Pure function; self-registers.
 * READS:  window.v2.rules
 * WRITES: window.v2.rules registry entry 'AS1720.1-Cl4.4'
 *
 * Classic <script>, no build step. AS 1720.1 §2.4.1 multiplies a chain of
 * modification factors (k1 duration-of-load, k4 moisture, k6 temperature,
 * k9 strength-sharing, k11 size, k12 stability). This rule takes whichever
 * factors the caller supplies and returns their product plus the resulting
 * design strength — it does NOT hardcode the individual k values (those depend
 * on the member, the load case and the project, and belong to the caller).
 * See 04-catalogue-system.md §5.
 *
 * check(element, model, context) — context:
 *   { k1, k4, k6, k9, k11, k12, phi, characteristicStrength }
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});

  const FACTOR_KEYS = ['k1', 'k4', 'k6', 'k9', 'k11', 'k12'];

  const Rule = {
    id: 'AS1720.1-Cl4.4',
    standard: 'AS 1720.1-2010',
    clause: 'Cl 4.4 (§2.4.1)',
    label: 'Combined strength modification factor',

    appliesTo: function (element, model) {
      if (!element) return false;
      const mat = model && model.materials && model.materials.get(element.materialId);
      return !!mat && mat.class === 'timber';
    },

    check: function (element, model, context) {
      context = context || {};
      const steps = [];
      let combined = 1.0;
      FACTOR_KEYS.forEach(function (k) {
        const v = (typeof context[k] === 'number') ? context[k] : 1.0;
        combined *= v;
        steps.push({ label: k, value: v });
      });
      steps.push({ label: 'combined factor = Π k', value: combined });

      const phi = (typeof context.phi === 'number') ? context.phi : 0.85;
      const fk = (typeof context.characteristicStrength === 'number')
        ? context.characteristicStrength : null;
      const fDesign = (fk != null) ? phi * combined * fk : null;
      if (fk != null) {
        steps.push({ label: 'φ', value: phi });
        steps.push({ label: "design strength = φ · k · f'", value: fDesign, unit: 'MPa' });
      }

      return {
        ruleId: Rule.id,
        passed: true,                  // a factor-combination helper, not a gate
        utilisation: null,
        combinedFactor: combined,
        capacityFactor: phi,
        designStrength: fDesign,
        citation: 'AS 1720.1-2010 §2.4.1 / Cl 4.4',
        verboseSteps: steps,
      };
    },
  };

  v2.rules.register(Rule);
})();
