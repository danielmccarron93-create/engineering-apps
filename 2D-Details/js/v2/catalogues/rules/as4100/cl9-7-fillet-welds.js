/**
 * StructDraw v2 · Catalogue Layer · rules · AS 4100 Cl 9.7 — fillet welds
 * LAYER: catalogue/rules — design capacity per unit length of a fillet weld.
 *        Pure function; self-registers.
 * READS:  window.v2.rules
 * WRITES: window.v2.rules registry entry 'AS4100-Cl9.7'
 *
 * Classic <script>, no build step. φvw = φ · 0.6 · fuw · tt · kr, where the
 * design throat thickness tt = weld size / √2. fuw is the weld-metal tensile
 * strength (E48XX electrode → 480 MPa default). Capacity is per millimetre of
 * weld; the total is φvw · length. See 04-catalogue-system.md §5.
 *
 * check(element, model, context) — context:
 *   { weldSize, fuw, k_r, length, v_star }
 *   v_star: design action per unit length (kN/mm)
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});

  const Rule = {
    id: 'AS4100-Cl9.7',
    standard: 'AS 4100-2020',
    clause: 'Cl 9.7',
    label: 'Fillet weld capacity (φvw)',

    appliesTo: function (element) {
      return !!element && element.category === 'detail-component' &&
             element.family === 'weld-symbol';
    },

    check: function (element, model, context) {
      context = context || {};
      const steps = [];
      const tw = (typeof context.weldSize === 'number') ? context.weldSize : 6;
      const fuw = (typeof context.fuw === 'number') ? context.fuw : 480;  // E48XX
      const kr = (typeof context.k_r === 'number') ? context.k_r : 1.0;
      const phi = 0.8;
      const tt = tw / Math.SQRT2;  // design throat thickness
      steps.push({ label: 'weld size (leg)', value: tw, unit: 'mm' });
      steps.push({ label: 'tt = size / √2 (throat)', value: tt, unit: 'mm' });
      steps.push({ label: 'fuw (weld metal)', value: fuw, unit: 'MPa' });

      // φvw = φ · 0.6 · fuw · tt · kr   (N/mm → kN/mm).
      const vw = (phi * 0.6 * fuw * tt * kr) / 1000;
      steps.push({ label: 'φvw = φ · 0.6 · fuw · tt · kr', value: vw, unit: 'kN/mm' });

      const length = (typeof context.length === 'number') ? context.length : null;
      const capacityTotal = (length != null) ? vw * length : null;
      if (length != null) {
        steps.push({ label: 'weld length', value: length, unit: 'mm' });
        steps.push({ label: 'total capacity = φvw · length', value: capacityTotal, unit: 'kN' });
      }

      const vStar = (typeof context.v_star === 'number') ? context.v_star : 0;
      const eta = (vw > 0) ? vStar / vw : Infinity;
      steps.push({ label: 'η = v* / φvw', value: eta });

      return {
        ruleId: Rule.id,
        passed: isFinite(eta) && eta <= 1.0 + 1e-9,
        utilisation: eta,
        vw: vw,
        capacityTotal: capacityTotal,
        v_star: vStar,
        citation: 'AS 4100-2020 Cl 9.7.3.10',
        verboseSteps: steps,
      };
    },
  };

  v2.rules.register(Rule);
})();
