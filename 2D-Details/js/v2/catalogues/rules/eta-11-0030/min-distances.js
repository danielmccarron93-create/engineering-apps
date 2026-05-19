/**
 * StructDraw v2 · Catalogue Layer · rules · ETA-11/0030 — minimum distances
 * LAYER: catalogue/rules — minimum screw spacings and edge distances for a
 *        Rothoblaas HBS Plate connection. Pure function; self-registers.
 * READS:  window.v2.rules; v1 globals ROTHOBLAAS_RULESETS, HBS_PLATE_SCREWS
 * WRITES: window.v2.rules registry entry 'ETA-11/0030-MinDist'
 *
 * Classic <script>, no build step. Re-implements the required-distance side of
 * v1's js/79-checks-timber.js — the linear α-interpolation between the
 * α = 0° and α = 90° endpoints stored in ROTHOBLAAS_RULESETS (faithful to v1
 * interpRuleAtAlpha in 02e-catalogue-lookups.js).
 *
 * check(element, model, context) — context:
 *   { ruleSetId, screwType | d, alpha, checks?: [{ ruleType, applied }] }
 *   ruleType ∈ a1 | a2 | a3t | a3c | a4t | a4c
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});

  const RULESETS = (typeof ROTHOBLAAS_RULESETS !== 'undefined') ? ROTHOBLAAS_RULESETS : {};
  const SCREWS   = (typeof HBS_PLATE_SCREWS !== 'undefined') ? HBS_PLATE_SCREWS : {};

  const RULE_TYPES = ['a1', 'a2', 'a3t', 'a3c', 'a4t', 'a4c'];

  /** Required distance at angle α — linear interp of the stored endpoints. */
  function interpAtAlpha(ruleSet, ruleType, d, alphaDeg) {
    const rule = ruleSet && ruleSet.spacings && ruleSet.spacings[ruleType];
    if (!rule) return NaN;
    let a = alphaDeg;
    if (a < 0) a = 0;
    if (a > 90) a = 90;
    const v0 = rule.atZero(d);
    const v90 = rule.atNinety(d);
    return v0 + (v90 - v0) * (a / 90);
  }

  const Rule = {
    id: 'ETA-11/0030-MinDist',
    standard: 'ETA-11/0030 (2019)',
    clause: 'p.215 (minimum distances)',
    label: 'Minimum screw spacings & edge distances — HBS Plate',

    appliesTo: function (element) {
      return !!element && element.category === 'fastener' &&
             element.family === 'rothoblaas-hbs';
    },

    check: function (element, model, context) {
      context = context || {};
      const ruleSet = RULESETS[context.ruleSetId];
      if (!ruleSet) {
        return {
          ruleId: Rule.id, passed: false, utilisation: Infinity,
          error: 'Rule set "' + context.ruleSetId + '" not found.',
          citation: 'ETA-11/0030 (2019) p.215', verboseSteps: [],
        };
      }
      // Diameter — directly, or from the screw catalogue row.
      let d = context.d;
      if (d == null && context.screwType && SCREWS[context.screwType]) {
        d = SCREWS[context.screwType].d;
      }
      if (d == null && element && element.type && SCREWS[element.type]) {
        d = SCREWS[element.type].d;
      }
      const alpha = (typeof context.alpha === 'number') ? context.alpha : 0;

      const required = {};
      const steps = [];
      RULE_TYPES.forEach(function (rt) {
        required[rt] = interpAtAlpha(ruleSet, rt, d, alpha);
        steps.push({ label: rt + ' required (α = ' + alpha + '°)', value: required[rt], unit: 'mm' });
      });

      // Optional pass/fail checks of applied vs required distances.
      const checks = [];
      let allPass = true;
      if (Array.isArray(context.checks)) {
        context.checks.forEach(function (c) {
          const req = required[c.ruleType];
          const pass = (typeof c.applied === 'number') && (c.applied + 1e-6 >= req);
          if (!pass) allPass = false;
          checks.push({
            ruleType: c.ruleType, applied: c.applied, required: req, pass: pass,
          });
        });
      }

      return {
        ruleId: Rule.id,
        passed: allPass,
        utilisation: null,             // a geometric gate, not a load ratio
        d: d,
        alpha: alpha,
        ruleSetId: context.ruleSetId,
        required: required,
        checks: checks,
        citation: 'ETA-11/0030 (2019) p.215; EN 1995-1-1 §8.3 / §8.5',
        verboseSteps: steps,
      };
    },
  };

  v2.rules.register(Rule);
})();
