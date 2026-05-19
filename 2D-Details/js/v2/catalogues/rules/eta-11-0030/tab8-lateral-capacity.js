/**
 * StructDraw v2 · Catalogue Layer · rules · ETA-11/0030 Table 8 — lateral capacity
 * LAYER: catalogue/rules — lateral shear capacity of a Rothoblaas HBS Plate
 *        steel-to-timber screwed connection. Pure function; self-registers.
 * READS:  window.v2.rules; v1 globals ROTHOBLAAS_CAPACITY_TABLES, SCREW_SYSTEMS,
 *           ROTHOBLAAS_NEF_TABLE, TIMBER_CLASSES, K_MOD, GAMMA_M_CONNECTIONS,
 *           HBS_PLATE_SCREWS
 * WRITES: window.v2.rules registry entry 'ETA-11/0030-Tab8'
 *
 * Classic <script>, no build step. This rule re-implements the capacity chain
 * of v1's js/79-checks-timber.js `_computeCapacity()` — the v2 catalogue
 * layer's faithful replacement for the v1 monolithic rule engine (04 §5).
 *
 * Phase 0c EXIT CRITERION: this rule reproduces the timber-screws Test 1 fixture
 * (η = 0.801, PASS). See tests/v2/catalogues/rule-check.test.js and
 * PlannedBuilds/timber-screws/09-test-cases.md Test 1.
 *
 * Row detection (which screw sits in which along-grain row) is an upstream
 * geometry concern; this rule consumes pre-detected rows via context, exactly
 * as v1's `_computeCapacity` consumed the output of `_detectRows`.
 *
 * check(element, model, context) — context:
 *   { plateThickness, timberClass, serviceClass, loadCase, F_d,
 *     rows: [{ n, a1 }, ...] }
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});

  // v1 catalogue data — guarded bare-global imports (04 §11).
  const CAP_TABLES = (typeof ROTHOBLAAS_CAPACITY_TABLES !== 'undefined') ? ROTHOBLAAS_CAPACITY_TABLES : {};
  const SYSTEMS    = (typeof SCREW_SYSTEMS !== 'undefined') ? SCREW_SYSTEMS : {};
  const NEF_TABLE  = (typeof ROTHOBLAAS_NEF_TABLE !== 'undefined') ? ROTHOBLAAS_NEF_TABLE : { table: {} };
  const TCLASSES   = (typeof TIMBER_CLASSES !== 'undefined') ? TIMBER_CLASSES : {};
  const KMOD       = (typeof K_MOD !== 'undefined') ? K_MOD : {};
  const GAMMA_M    = (typeof GAMMA_M_CONNECTIONS === 'number') ? GAMMA_M_CONNECTIONS : 1.3;
  const SCREWS     = (typeof HBS_PLATE_SCREWS !== 'undefined') ? HBS_PLATE_SCREWS : {};

  /**
   * R_V,k by plate thickness — exact tabulated key, else linear interpolation
   * between the bracketing keys. Faithful to v1 getCapacity().
   */
  function capacityByPlate(row, sPlate) {
    const keys = Object.keys(row).map(Number).sort(function (a, b) { return a - b; });
    if (keys.length === 0) return NaN;
    if (sPlate <= keys[0]) return row[keys[0]];
    if (sPlate >= keys[keys.length - 1]) return row[keys[keys.length - 1]];
    let i = 0;
    while (i < keys.length - 1 && keys[i + 1] < sPlate) i++;
    const t0 = keys[i], t1 = keys[i + 1];
    if (sPlate === t0) return row[t0];
    const f = (sPlate - t0) / (t1 - t0);
    return row[t0] * (1 - f) + row[t1] * f;
  }

  /** Effective screw count for a row parallel to grain. Faithful to v1 lerpNef(). */
  function effectiveN(n, a1InD) {
    if (n <= 1) return n;
    if (n >= 2 && n <= 5) {
      const tableRow = NEF_TABLE.table[n];
      if (!tableRow) return n;
      let x = a1InD;
      if (x <= 4) return tableRow[4];
      if (x >= 14) return tableRow[14];
      const lo = Math.floor(x), hi = lo + 1, t = x - lo;
      return tableRow[lo] * (1 - t) + tableRow[hi] * t;
    }
    return Math.min(n, Math.pow(n, 0.9) * Math.pow(a1InD / 13, 0.25));
  }

  const Rule = {
    id: 'ETA-11/0030-Tab8',
    standard: 'ETA-11/0030 (2019)',
    clause: 'Table 8, p.216 (R_V,90,k)',
    label: 'Lateral shear capacity — HBS Plate steel-to-timber screw',

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
          citation: 'ETA-11/0030 (2019) Table 8', verboseSteps: steps,
        };
      }
      const d = screw.d;

      // R_V,k — p.216 (ε = 90°) characteristic capacity, by plate thickness.
      const sys = SYSTEMS['rothoblaas-hbs-plate'] || { capacity_tables: {} };
      const tableId = sys.capacity_tables['eps90_alpha90'];
      const table = CAP_TABLES[tableId] || { values: {} };
      const capRow = table.values[screwId] || {};
      const sPlate = (context.plateThickness != null) ? context.plateThickness : 10;
      const R_Vk = capacityByPlate(capRow, sPlate);
      steps.push({ label: 'R_V,k (p.216, S_plate = ' + sPlate + ' mm)', value: R_Vk, unit: 'kN' });

      // Density adjustment k_dens,v from the timber strength class (p.221).
      const tclass = TCLASSES[context.timberClass] || {};
      const kDens = (typeof tclass.k_dens_v === 'number') ? tclass.k_dens_v : 1.0;
      const R_Vk_adj = R_Vk * kDens;
      steps.push({ label: 'k_dens,v (' + (context.timberClass || '—') + ')', value: kDens });
      steps.push({ label: "R'_V,k = R_V,k · k_dens,v", value: R_Vk_adj, unit: 'kN' });

      // Design value: R_V,d = k_mod · R'_V,k / γM  (EN 1995-1-1 §2.4.1).
      const scTable = KMOD[context.serviceClass || 'SC1'] || {};
      const kMod = (typeof scTable[context.loadCase || 'medium'] === 'number')
        ? scTable[context.loadCase || 'medium'] : 0.8;
      const R_Vd_screw = (kMod * R_Vk_adj) / GAMMA_M;
      steps.push({ label: 'k_mod', value: kMod });
      steps.push({ label: 'γM', value: GAMMA_M });
      steps.push({ label: 'R_V,d per screw = k_mod · R′_V,k / γM', value: R_Vd_screw, unit: 'kN' });

      // Group capacity: Σ over rows of n_ef · R_V,d.
      const rows = Array.isArray(context.rows) ? context.rows : [];
      let R_Vd_total = 0;
      const perRow = [];
      rows.forEach(function (r, i) {
        const n = r.n;
        const a1 = r.a1;
        const a1InD = (n >= 2 && d > 0) ? a1 / d : null;
        const nEf = (n >= 2) ? effectiveN(n, a1InD) : (n || 0);
        const R_row = nEf * R_Vd_screw;
        R_Vd_total += R_row;
        perRow.push({ row: i + 1, n: n, a1: a1, a1_in_d: a1InD, n_ef: nEf, R_row: R_row });
        steps.push({
          label: 'row ' + (i + 1) + ': n = ' + n + ', a1 = ' + a1 + ' mm → n_ef',
          value: nEf,
        });
      });

      const F_d = (typeof context.F_d === 'number') ? context.F_d : 0;
      const eta = (R_Vd_total > 0) ? F_d / R_Vd_total : Infinity;
      steps.push({ label: 'R_V,d total', value: R_Vd_total, unit: 'kN' });
      steps.push({ label: 'F_d applied', value: F_d, unit: 'kN' });
      steps.push({ label: 'η = F_d / R_V,d', value: eta });

      return {
        ruleId: Rule.id,
        passed: isFinite(eta) && eta <= 1.0 + 1e-9,
        utilisation: eta,
        R_Vk: R_Vk,
        k_dens: kDens,
        k_mod: kMod,
        gamma_M: GAMMA_M,
        R_Vd_per_screw: R_Vd_screw,
        R_Vd_total: R_Vd_total,
        F_d: F_d,
        perRow: perRow,
        citation: 'ETA-11/0030 (2019) Table 8 p.216 (R_V,90,k); EN 1995-1-1 §2.4.1',
        verboseSteps: steps,
      };
    },
  };

  v2.rules.register(Rule);
})();
