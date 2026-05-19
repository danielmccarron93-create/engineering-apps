/**
 * StructDraw v2 · Catalogue Layer · rules · ETA-11/0030 — axial withdrawal
 * LAYER: catalogue/rules — axial withdrawal capacity of a Rothoblaas HBS Plate
 *        screw. Pure function; self-registers.
 * READS:  window.v2.rules; v1 globals HBS_PLATE_SCREWS, K_MOD, GAMMA_M_CONNECTIONS
 * WRITES: window.v2.rules registry entry 'ETA-11/0030-Tab7'
 *
 * Classic <script>, no build step. v1 never implemented an axial-withdrawal
 * check (79-checks-timber.js does lateral shear only), so this rule is
 * v2-native: the simplified EN 1995-1-1 §8.7.2 withdrawal model, fed by the
 * f_ax,k values the v1 screw catalogue already carries. A faithful transcription
 * of the ETA-11/0030 axial table is a later refinement.
 *
 * check(element, model, context) — context:
 *   { substrate, l_ef, serviceClass, loadCase, F_ax_d, n }
 *   substrate: key into the screw's fax_k object ('softwood' | 'lvl_softwood' | ...)
 *   l_ef: effective threaded penetration into the timber (mm)
 *   n: number of screws sharing the axial load (group)
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});

  const SCREWS  = (typeof HBS_PLATE_SCREWS !== 'undefined') ? HBS_PLATE_SCREWS : {};
  const KMOD    = (typeof K_MOD !== 'undefined') ? K_MOD : {};
  const GAMMA_M = (typeof GAMMA_M_CONNECTIONS === 'number') ? GAMMA_M_CONNECTIONS : 1.3;

  const Rule = {
    id: 'ETA-11/0030-Tab7',
    standard: 'ETA-11/0030 (2019)',
    clause: 'EN 1995-1-1 §8.7.2',
    label: 'Axial withdrawal capacity — HBS Plate screw',

    appliesTo: function (element) {
      return !!element && element.category === 'fastener' &&
             element.family === 'rothoblaas-hbs';
    },

    check: function (element, model, context) {
      context = context || {};
      const steps = [];
      const screwId = element && element.type;
      const screw = SCREWS[screwId];
      if (!screw) {
        return {
          ruleId: Rule.id, passed: false, utilisation: Infinity,
          error: 'Screw "' + screwId + '" is not in the HBS Plate catalogue.',
          citation: 'ETA-11/0030 (2019) §3.2', verboseSteps: steps,
        };
      }
      const d = screw.d;

      // f_ax,k for the substrate (the screw's fax_k object is keyed by substrate).
      const substrate = context.substrate || 'softwood';
      const faxObj = screw.fax_k || {};
      const fAxK = (typeof faxObj[substrate] === 'number') ? faxObj[substrate] : 0;
      const lEf = (typeof context.l_ef === 'number') ? context.l_ef : screw.b;
      steps.push({ label: 'f_ax,k (' + substrate + ')', value: fAxK, unit: 'N/mm²' });
      steps.push({ label: 'l_ef (threaded penetration)', value: lEf, unit: 'mm' });
      steps.push({ label: 'd', value: d, unit: 'mm' });

      // R_ax,k = f_ax,k · d · l_ef  (N → kN). Single-screw characteristic value.
      const R_axk = (fAxK * d * lEf) / 1000;
      steps.push({ label: 'R_ax,k = f_ax,k · d · l_ef', value: R_axk, unit: 'kN' });

      // Group reduction: n_ef = n^0.9 (EN 1995-1-1 §8.3.1.1, axial).
      const n = (typeof context.n === 'number' && context.n >= 1) ? context.n : 1;
      const nEf = Math.pow(n, 0.9);
      steps.push({ label: 'n_ef = n^0.9', value: nEf });

      // Design value: R_ax,d = k_mod · n_ef · R_ax,k / γM.
      const scTable = KMOD[context.serviceClass || 'SC1'] || {};
      const kMod = (typeof scTable[context.loadCase || 'medium'] === 'number')
        ? scTable[context.loadCase || 'medium'] : 0.8;
      const R_axd_total = (kMod * nEf * R_axk) / GAMMA_M;
      steps.push({ label: 'k_mod', value: kMod });
      steps.push({ label: 'γM', value: GAMMA_M });
      steps.push({ label: 'R_ax,d total = k_mod · n_ef · R_ax,k / γM', value: R_axd_total, unit: 'kN' });

      const F_ax_d = (typeof context.F_ax_d === 'number') ? context.F_ax_d : 0;
      const eta = (R_axd_total > 0) ? F_ax_d / R_axd_total : Infinity;
      steps.push({ label: 'η = F_ax,d / R_ax,d', value: eta });

      return {
        ruleId: Rule.id,
        passed: isFinite(eta) && eta <= 1.0 + 1e-9,
        utilisation: eta,
        R_ax_k: R_axk,
        n_ef: nEf,
        k_mod: kMod,
        gamma_M: GAMMA_M,
        R_ax_d_total: R_axd_total,
        F_ax_d: F_ax_d,
        citation: 'ETA-11/0030 (2019) §3.2; EN 1995-1-1 §8.7.2 (simplified)',
        verboseSteps: steps,
      };
    },
  };

  v2.rules.register(Rule);
})();
