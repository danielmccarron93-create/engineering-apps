'use strict';

// Catalogue lookup helpers for the timber-screw connection feature.
// Added 2026-05-18. Pure functions — no DOM, no canvas, no globals (except
// reading the const catalogues defined in 02b/02c/02d). Consumed by the rule
// engine in Phase 4 (78-checks-timber.js) and the UI layer (size-picker, inspector).
//
// See PlannedBuilds/timber-screws/03-rule-engine.md for how these are used.


// ============================================================
// CATALOGUE ACCESSORS
// ============================================================

/**
 * Retrieve a ScrewSpec by its catalogue ID (e.g. "HBSPL12200" or "VGS11300").
 * Resolves across every screw-family catalogue: HBS plate screws (02c) and
 * VGS fully-threaded screws (02j). Returns the spec object, or null.
 */
function getScrewSpec(screwId) {
  if (typeof VGS_SCREWS === 'object' && VGS_SCREWS[screwId]) return VGS_SCREWS[screwId];
  return HBS_PLATE_SCREWS[screwId] || null;
}

/**
 * Retrieve a TimberClass by its catalogue ID (e.g. "GL28h", "F17", "MGP10").
 * Returns the class object, or null if not found.
 */
function getTimberClass(classId) {
  return TIMBER_CLASSES[classId] || null;
}

/**
 * Retrieve a TimberSection preset by ID (e.g. "GL 600×600").
 * Returns the section object, or null if not found.
 */
function getTimberSection(sectionId) {
  return TIMBER_SECTIONS[sectionId] || null;
}

/**
 * Get the right RuleSet for a connection configuration.
 *
 * @param {string}  connectionType   — 'steel-to-timber' (v1) | 'timber-to-timber' (v1.1) | 'steel-to-clt' (v1.2)
 * @param {string}  substrateFamily  — TimberClass.family value (e.g. 'glulam')
 * @param {boolean} preDrilled       — whether holes are pre-drilled
 * @returns {object|null}            — matching RuleSet, or null with reason logged
 */
function getRuleSet(connectionType, substrateFamily, preDrilled) {
  for (const id in ROTHOBLAAS_RULESETS) {
    const rs = ROTHOBLAAS_RULESETS[id];
    const a = rs.applies_to;
    if (a.connection_type === connectionType
        && a.substrate_families.indexOf(substrateFamily) !== -1
        && a.pre_drilled === preDrilled) {
      return rs;
    }
  }
  console.warn("getRuleSet: no rule set matches",
               { connectionType, substrateFamily, preDrilled });
  return null;
}


// ============================================================
// RULE EVALUATION
// ============================================================

/**
 * Compute a required minimum-distance value at a given α by interpolating
 * linearly between the α=0° and α=90° endpoints stored in the rule set.
 *
 * @param {object} ruleSet      — from getRuleSet()
 * @param {string} ruleType     — 'a1' | 'a2' | 'a3t' | 'a3c' | 'a4t' | 'a4c'
 * @param {number} d            — screw diameter [mm]
 * @param {number} alphaDeg     — load-to-grain angle [degrees], 0..90
 * @returns {number}            — required distance [mm]
 */
function interpRuleAtAlpha(ruleSet, ruleType, d, alphaDeg) {
  if (!ruleSet || !ruleSet.spacings[ruleType]) {
    console.error("interpRuleAtAlpha: invalid ruleSet or ruleType", { ruleType });
    return NaN;
  }
  // Clamp alpha to [0, 90] — values outside reflect a programming error
  let a = alphaDeg;
  if (a < 0)  a = 0;
  if (a > 90) a = 90;
  const rule = ruleSet.spacings[ruleType];
  const v0  = rule.atZero(d);
  const v90 = rule.atNinety(d);
  return v0 + (v90 - v0) * (a / 90);
}

/**
 * Return the formula string for a rule at a given α (for the inspector display).
 * Picks the closer endpoint formula; for intermediate α annotates as interpolated.
 */
function ruleFormulaString(ruleSet, ruleType, alphaDeg) {
  const rule = ruleSet && ruleSet.spacings[ruleType];
  if (!rule) return "?";
  if (alphaDeg <= 1)    return rule.formulaStr.atZero   + " at α=0°";
  if (alphaDeg >= 89)   return rule.formulaStr.atNinety + " at α=90°";
  return "interp(" + rule.formulaStr.atZero + ", " + rule.formulaStr.atNinety + ")";
}


// ============================================================
// n_ef LOOKUP
// ============================================================

/**
 * Look up the effective number of screws for a row arranged parallel to grain.
 * Linear interpolation in a1/d. n is snapped to discrete (2..5); for n > 5
 * we use EN 1995-1-1 §8.3.1.1 formula extension; for n < 2 we return n directly
 * (no group reduction for a single screw).
 *
 * @param {number} n         — number of screws in the row (n ≥ 1)
 * @param {number} a1_in_d   — spacing along grain expressed as multiple of d
 * @returns {number}         — n_ef (always ≤ n)
 */
function lerpNef(n, a1_in_d) {
  if (n <= 1) return n;  // no group action for a single screw

  // For n in [2, 5]: use Rothoblaas table with linear interp in a1_in_d
  if (n >= 2 && n <= 5) {
    const row = ROTHOBLAAS_NEF_TABLE.table[n];
    if (!row) return n;
    // Clamp a1/d to table range [4, 14]
    let x = a1_in_d;
    if (x <= 4)  return row[4];
    if (x >= 14) return row[14];
    // Find the bracketing integer keys (table is at integer a1/d)
    const lo = Math.floor(x);
    const hi = lo + 1;
    const t  = x - lo;
    return row[lo] * (1 - t) + row[hi] * t;
  }

  // For n > 5: EN 1995-1-1 §8.3.1.1 continuous formula
  //   n_ef = min(n, n^0.9 · (a1 / (13·d))^0.25)
  // a1 / (13·d) = a1_in_d / 13
  const formula = Math.pow(n, 0.9) * Math.pow(a1_in_d / 13, 0.25);
  return Math.min(n, formula);
}


// ============================================================
// k_mod LOOKUP
// ============================================================

/**
 * Get k_mod from the EN 1995-1-1 Table 3.1 matrix.
 *
 * @param {string} serviceClass   — 'SC1' | 'SC2' | 'SC3'
 * @param {string} loadDuration   — 'permanent' | 'long' | 'medium' | 'short' | 'instantaneous'
 * @returns {number}              — k_mod, or NaN if invalid keys
 */
function getKmod(serviceClass, loadDuration) {
  const sc = K_MOD[serviceClass];
  if (!sc) { console.error("getKmod: unknown service class", serviceClass); return NaN; }
  const v = sc[loadDuration];
  if (v === undefined) { console.error("getKmod: unknown load duration", loadDuration); return NaN; }
  return v;
}


// ============================================================
// CAPACITY LOOKUP
// ============================================================

/**
 * Get characteristic shear capacity R_V,k for a screw, plate thickness, and
 * orientation. v1 uses the p. 216 (ε=90°) table for typical lateral connections.
 *
 * Plate thickness interpolation: if the requested S_PLATE isn't a tabulated
 * value, linearly interpolate between the two nearest tabulated values.
 * Outside the tabulated range, clamp to the nearest endpoint and flag with a
 * warning.
 *
 * @param {string} screwId        — catalogue ID (e.g. "HBSPL12200")
 * @param {number} S_plate_mm     — steel plate thickness [mm]
 * @param {string} epsilonKey     — 'eps90_alpha90' (p. 216, v1) | 'eps0_alpha0' (p. 217, v1.x)
 * @returns {{R_Vk: number, warnings: string[]}}
 */
function getCapacity(screwId, S_plate_mm, epsilonKey) {
  const warnings = [];
  const system   = SCREW_SYSTEMS["rothoblaas-hbs-plate"];
  const tableId  = system.capacity_tables[epsilonKey];
  if (!tableId) {
    warnings.push("Unknown capacity table key: " + epsilonKey);
    return { R_Vk: NaN, warnings: warnings };
  }
  const table = ROTHOBLAAS_CAPACITY_TABLES[tableId];
  if (!table) {
    warnings.push("Capacity table missing: " + tableId);
    return { R_Vk: NaN, warnings: warnings };
  }
  const row = table.values[screwId];
  if (!row) {
    warnings.push("Screw " + screwId + " not in capacity table " + tableId);
    return { R_Vk: NaN, warnings: warnings };
  }

  // Tabulated plate thicknesses (sorted ascending)
  const keys = Object.keys(row).map(Number).sort(function (a, b) { return a - b; });
  const tMin = keys[0];
  const tMax = keys[keys.length - 1];

  // Clamp outside range
  if (S_plate_mm <= tMin) {
    if (S_plate_mm < tMin) {
      warnings.push("Plate thickness " + S_plate_mm + " mm below tabulated min "
                    + tMin + " mm — clamped (conservative).");
    }
    return { R_Vk: row[tMin], warnings: warnings };
  }
  if (S_plate_mm >= tMax) {
    if (S_plate_mm > tMax) {
      warnings.push("Plate thickness " + S_plate_mm + " mm above tabulated max "
                    + tMax + " mm — clamped to max (no extrapolation).");
    }
    return { R_Vk: row[tMax], warnings: warnings };
  }

  // Linear interp between bracketing keys
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1] < S_plate_mm) i++;
  const t0 = keys[i], t1 = keys[i + 1];
  if (S_plate_mm === t0) return { R_Vk: row[t0], warnings: warnings };
  const f = (S_plate_mm - t0) / (t1 - t0);
  const R_Vk = row[t0] * (1 - f) + row[t1] * f;
  if (t0 !== t1) {
    warnings.push("Plate thickness " + S_plate_mm + " mm interpolated between "
                  + t0 + " mm (" + row[t0].toFixed(2) + " kN) and "
                  + t1 + " mm (" + row[t1].toFixed(2) + " kN).");
  }
  return { R_Vk: R_Vk, warnings: warnings };
}


// ============================================================
// GEOMETRIC HELPERS — grain frame, edge classification
// ============================================================

/**
 * Compute the angle between two 2D unit vectors, normalised to [0°, 90°].
 * Useful for α (load-to-grain) and ε (screw-to-grain) calculations where the
 * physics is symmetric — direction along grain doesn't matter, just the angle.
 *
 * @param {{u:number,v:number}} a
 * @param {{u:number,v:number}} b
 * @returns {number} angle in degrees, 0..90
 */
function angleBetweenSymmetric(a, b) {
  const dot = a.u * b.u + a.v * b.v;
  // dot of unit vectors: in [-1, 1]. acos gives [0, π].
  let rad = Math.acos(Math.max(-1, Math.min(1, dot)));
  let deg = rad * 180 / Math.PI;
  if (deg > 90) deg = 180 - deg;
  return deg;
}

/**
 * Normalise a 2D vector. Returns {u: 0, v: 0} for zero-vector input.
 */
function unit2D(v) {
  const m = Math.sqrt(v.u * v.u + v.v * v.v);
  if (m < 1e-9) return { u: 0, v: 0 };
  return { u: v.u / m, v: v.v / m };
}

/**
 * Perpendicular of a 2D vector — 90° CCW rotation. So (1,0) → (0,1).
 * Used to derive the cross-grain axis v̂ from the grain axis û.
 */
function perp2D(v) {
  return { u: -v.v, v: v.u };
}

/**
 * Classify an edge as 'stressed' or 'unloaded' given the load direction and
 * the edge's outward normal.  See domain-knowledge.md §5 for the derivation
 * (dot-product rule equivalent to Rothoblaas's α-range definition).
 *
 * @param {{u,v}} loadDirUnit       — unit vector of applied load
 * @param {{u,v}} edgeNormalUnit    — outward unit normal of the edge
 * @returns {'stressed'|'unloaded'} — classification
 */
function classifyEdgeByLoad(loadDirUnit, edgeNormalUnit) {
  const dot = loadDirUnit.u * edgeNormalUnit.u
            + loadDirUnit.v * edgeNormalUnit.v;
  // Strict per Rothoblaas figure on p. 215. At boundary (dot = 0) the edge
  // isn't being loaded into → treat as unloaded (matches Dan's hand calc).
  // See Q6 in PlannedBuilds/timber-screws/08-open-questions.md.
  return (dot > 1e-9) ? 'stressed' : 'unloaded';
}


// ============================================================
// DEBUG / VERIFICATION HELPERS — for the browser console (Phase 1 DoD)
// ============================================================

/**
 * Quick sanity dump of catalogue state. Call from console:
 *   tmbrCatalogueSummary()
 */
function tmbrCatalogueSummary() {
  const summary = {
    timberClasses:   Object.keys(TIMBER_CLASSES).length,
    timberSections:  Object.keys(TIMBER_SECTIONS).length,
    screws:          Object.keys(HBS_PLATE_SCREWS).length,
    ruleSets:        Object.keys(ROTHOBLAAS_RULESETS).length,
    capacityTables:  Object.keys(ROTHOBLAAS_CAPACITY_TABLES).length,
    rulesetVersion:  ROTHOBLAAS_RULESET_VERSION
  };
  console.table(summary);
  return summary;
}

/**
 * Reproduce Dan's worked example values (per 09-test-cases.md Test 1).
 * Call from console:  tmbrVerifyDanExample()
 */
function tmbrVerifyDanExample() {
  const rs    = getRuleSet('steel-to-timber', 'glulam', true);
  const d     = 12;
  const alpha = 0;
  const out = {
    "a1  (req at α=0° for d=12)":  interpRuleAtAlpha(rs, 'a1',  d, alpha).toFixed(2) + "  (expect 42.0 — was 5·d·0.7)",
    "a2  (req at α=0°)":           interpRuleAtAlpha(rs, 'a2',  d, alpha).toFixed(2) + "  (expect 25.2 — was 3·d·0.7)",
    "a3t (req at α=0°)":           interpRuleAtAlpha(rs, 'a3t', d, alpha).toFixed(2) + "  (expect 144.0 — was 12·d)",
    "a3c (req at α=0°)":           interpRuleAtAlpha(rs, 'a3c', d, alpha).toFixed(2) + "  (expect 84.0 — was 7·d)",
    "a4t (req at α=0°)":           interpRuleAtAlpha(rs, 'a4t', d, alpha).toFixed(2) + "  (expect 36.0 — was 3·d)",
    "a4c (req at α=0°)":           interpRuleAtAlpha(rs, 'a4c', d, alpha).toFixed(2) + "  (expect 36.0 — was 3·d)",
    "n_ef (n=3, a1=5·d)":          lerpNef(3, 5).toFixed(3) + "  (expect 1.860)",
    "k_mod (SC1, medium)":         getKmod('SC1', 'medium').toFixed(2) + "  (expect 0.80)",
    "k_dens,v (GL28h)":            getTimberClass('GL28h').k_dens_v.toFixed(2) + "  (expect 1.05)",
    "R_V,k (HBSPL12200, S=10mm)":  getCapacity('HBSPL12200', 10, 'eps90_alpha90').R_Vk.toFixed(2) + "  (expect 12.99 kN)"
  };
  console.table(out);
  return out;
}
