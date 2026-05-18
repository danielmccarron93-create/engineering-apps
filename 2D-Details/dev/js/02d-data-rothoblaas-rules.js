'use strict';

// Rothoblaas HBS Plate rule tables — minimum spacings, n_ef, and characteristic
// capacities. Added 2026-05-18 for the timber-screw connection feature.
// See dev/feature-timber-screws/04-catalogues.md §2, §4, §5 for the source data.
//
// Source: Rothoblaas HBS Plate technical data sheet (ETA-11/0030), pp. 215–217.
//
// THREE rule sources live in this file:
//
//   1. ROTHOBLAAS_RULESETS — minimum distance formulas (a₁, a₂, a₃,t/c, a₄,t/c).
//      Two rule sets for steel-to-timber: WITH and WITHOUT pre-drilling. Each
//      stores endpoint values at α=0° and α=90°; the engine linearly interpolates
//      for intermediate α (per Rothoblaas / EN 1995-1-1 §8.5/§8.3 convention).
//
//   2. ROTHOBLAAS_NEF_TABLE — group reduction factor for n screws in a row along
//      grain at spacing a₁. Discrete table for n = 2..5, a₁/d = 4..14.
//
//   3. ROTHOBLAAS_CAPACITY_TABLES — characteristic shear capacity R_V,k.
//      v1 transcribes the STEEL-TO-TIMBER tables only (p. 216 + p. 217).
//      Timber-to-timber (p. 218) and CLT (p. 219) deferred to v1.1 / v1.2.
//
// NOTES ON ε vs α (see Q1 in open-questions.md):
//   Rothoblaas uses ε for the SCREW-AXIS-to-grain angle and α for the
//   LOAD-direction-to-grain angle. The capacity tables on p. 216 and p. 217 are
//   labelled by ε in the page header. Each table gives one R_V value per (screw,
//   plate-thickness) combination — Rothoblaas does NOT explicitly tabulate the
//   load angle α within these tables. The engine's current interpretation: use
//   p. 216 (ε=90°) for any lateral connection (Dan's case), with a conservative
//   note in the inspector pending verification against Rothoblaas MyProject.


// ============================================================
// 1. MINIMUM-DISTANCE RULE SETS — steel-to-timber, p. 215
// ============================================================
//
// Each rule set defines six required distances as functions of (d, α):
//   a₁   — pair-wise spacing PARALLEL to grain
//   a₂   — pair-wise spacing PERPENDICULAR to grain
//   a₃,t — distance to STRESSED end (parallel to grain, end the load points toward)
//   a₃,c — distance to UNLOADED end (parallel to grain, opposite)
//   a₄,t — distance to STRESSED edge (perpendicular to grain, edge the load points toward)
//   a₄,c — distance to UNLOADED edge (perpendicular to grain, opposite)
//
// Each distance stores TWO endpoint functions:
//   atZero(d)   — required value at α = 0°  (load parallel to grain)
//   atNinety(d) — required value at α = 90° (load perpendicular to grain)
//   formulaStr  — human-readable formula string for the inspector
//
// The engine computes the lookup as:
//   required(d, α) = lerp(atZero(d), atNinety(d), α/90°)


const ROTHOBLAAS_RULESETS = {

  // --------------------------------------------------------
  // Steel-to-timber, WITH pre-drilled hole (p. 215 lower table)
  // --------------------------------------------------------
  "rothoblaas-hbs-steel-to-timber-predrilled": {
    id: "rothoblaas-hbs-steel-to-timber-predrilled",
    source: "Rothoblaas HBS Plate ETA-11/0030 p. 215 (lower table — with pre-drilled hole)",
    applies_to: {
      fastener_system:    "rothoblaas-hbs-plate",
      connection_type:    "steel-to-timber",
      substrate_families: ["sawn-softwood", "sawn-hardwood", "glulam", "lvl-softwood", "mgp"],
      pre_drilled:        true,
      rho_k_limit:        420  // base table valid for ρₖ ≤ 420 kg/m³; higher ρₖ uses k_dens on capacity, spacings unchanged
    },
    spacings: {
      a1:  {
        atZero:     function (d) { return 5 * d * 0.7; },
        atNinety:   function (d) { return 4 * d * 0.7; },
        formulaStr: { atZero: "5·d·0.7", atNinety: "4·d·0.7" }
      },
      a2:  {
        atZero:     function (d) { return 3 * d * 0.7; },
        atNinety:   function (d) { return 4 * d * 0.7; },
        formulaStr: { atZero: "3·d·0.7", atNinety: "4·d·0.7" }
      },
      a3t: {
        atZero:     function (d) { return 12 * d; },
        atNinety:   function (d) { return  7 * d; },
        formulaStr: { atZero: "12·d", atNinety: "7·d" }
      },
      a3c: {
        atZero:     function (d) { return 7 * d; },
        atNinety:   function (d) { return 7 * d; },
        formulaStr: { atZero: "7·d", atNinety: "7·d" }
      },
      a4t: {
        atZero:     function (d) { return 3 * d; },
        atNinety:   function (d) { return 7 * d; },
        formulaStr: { atZero: "3·d", atNinety: "7·d" }
      },
      a4c: {
        atZero:     function (d) { return 3 * d; },
        atNinety:   function (d) { return 3 * d; },
        formulaStr: { atZero: "3·d", atNinety: "3·d" }
      }
    }
  },

  // --------------------------------------------------------
  // Steel-to-timber, WITHOUT pre-drilled hole (p. 215 upper table)
  // --------------------------------------------------------
  // Rothoblaas's "3 THORNS" tip permits slightly tighter spacings than the
  // generic EN 1995 §8.3 nail rules at α=0° (the 0.7 factor on a1, a2).
  "rothoblaas-hbs-steel-to-timber-no-predrill": {
    id: "rothoblaas-hbs-steel-to-timber-no-predrill",
    source: "Rothoblaas HBS Plate ETA-11/0030 p. 215 (upper table — without pre-drilled hole)",
    applies_to: {
      fastener_system:    "rothoblaas-hbs-plate",
      connection_type:    "steel-to-timber",
      substrate_families: ["sawn-softwood", "sawn-hardwood", "glulam", "lvl-softwood", "mgp"],
      pre_drilled:        false,
      rho_k_limit:        420
    },
    spacings: {
      a1:  {
        atZero:     function (d) { return 12 * d * 0.7; },
        atNinety:   function (d) { return  5 * d * 0.7; },
        formulaStr: { atZero: "12·d·0.7", atNinety: "5·d·0.7" }
      },
      a2:  {
        atZero:     function (d) { return 5 * d * 0.7; },
        atNinety:   function (d) { return 5 * d * 0.7; },
        formulaStr: { atZero: "5·d·0.7", atNinety: "5·d·0.7" }
      },
      a3t: {
        atZero:     function (d) { return 15 * d; },
        atNinety:   function (d) { return 10 * d; },
        formulaStr: { atZero: "15·d", atNinety: "10·d" }
      },
      a3c: {
        atZero:     function (d) { return 10 * d; },
        atNinety:   function (d) { return 10 * d; },
        formulaStr: { atZero: "10·d", atNinety: "10·d" }
      },
      a4t: {
        atZero:     function (d) { return  5 * d; },
        atNinety:   function (d) { return 10 * d; },
        formulaStr: { atZero: "5·d", atNinety: "10·d" }
      },
      a4c: {
        atZero:     function (d) { return 5 * d; },
        atNinety:   function (d) { return 5 * d; },
        formulaStr: { atZero: "5·d", atNinety: "5·d" }
      }
    }
  }

  // v1.1 will add:
  //   "rothoblaas-hbs-timber-to-timber-predrilled"   — multiply a1, a2 by 1.5 (p. 221 note)
  //   "rothoblaas-hbs-timber-to-timber-no-predrill"  — same
  // v1.2 will add CLT lateral-face rule set (p. 219).
};


// ============================================================
// 2. EFFECTIVE NUMBER FOR SHEAR (n_ef) — p. 215
// ============================================================
//
// Group reduction for n screws arranged parallel to grain at spacing a₁.
// Rothoblaas tabulates discretely; engine interpolates linearly in a₁/d.
//
// Indexed [n][a1_in_d] → n_ef. n = 2..5 only. For n > 5, EN 1995-1-1 §8.3.1.1
// formula extends: n_ef = min(n, n^0.9 · (a1/(13·d))^0.25) — applied in engine helper.

const ROTHOBLAAS_NEF_TABLE = {
  id: "rothoblaas-hbs-nef",
  source: "Rothoblaas HBS Plate ETA-11/0030 p. 215 (n_ef table)",
  // Discrete entries — engine helper lerpNef(n, a1_in_d) interpolates in a1
  table: {
    2: {  4: 1.41,  5: 1.48,  6: 1.55,  7: 1.62,  8: 1.68,  9: 1.74,
         10: 1.80, 11: 1.85, 12: 1.90, 13: 1.95, 14: 2.00 },
    3: {  4: 1.73,  5: 1.86,  6: 2.01,  7: 2.16,  8: 2.28,  9: 2.41,
         10: 2.54, 11: 2.65, 12: 2.76, 13: 2.88, 14: 3.00 },
    4: {  4: 2.00,  5: 2.19,  6: 2.41,  7: 2.64,  8: 2.83,  9: 3.03,
         10: 3.25, 11: 3.42, 12: 3.61, 13: 3.80, 14: 4.00 },
    5: {  4: 2.24,  5: 2.49,  6: 2.77,  7: 3.09,  8: 3.34,  9: 3.62,
         10: 3.93, 11: 4.17, 12: 4.43, 13: 4.71, 14: 5.00 }
  },
  // For values of a1/d above 14, Rothoblaas table caps at 14·d ("≥14·d" column).
  // At a1 ≥ 14·d, n_ef = n (no group reduction).
  max_a1_in_d: 14,
  // Bounds — anything outside this range gets clamped + warning
  n_range:      [2, 5],
  a1_in_d_range: [4, 14]
};


// ============================================================
// 3. CHARACTERISTIC CAPACITY TABLES — steel-to-timber (pp. 216, 217)
// ============================================================
//
// Each table indexed by [screw_id][plate_thickness_mm] → R_V,k [kN].
//
// Page 216: ε = 90° (screw axis perpendicular to grain — typical lateral
//                    connection through side of column / beam).
//                    Table value labelled R_V,90,k.
// Page 217: ε = 0°  (screw axis parallel to grain — end-grain insertion,
//                    not Dan's case but useful for v1.x).
//                    Table value labelled R_V,0,k.
//
// IMPORTANT (Q1 in open-questions.md): the load-to-grain angle α is NOT a
// dimension of these tables. Each (ε, plate-thickness) gives one R_V value.
// The engine's interpretation pending verification: at ε=90° (Dan's case),
// p. 216 R_V is the lateral capacity regardless of load direction. This is
// CONSERVATIVE at α=0° because the capacity is typically higher when load
// is parallel to grain (Johansen mode analysis). Revisit after MyProject
// comparison.

const ROTHOBLAAS_CAPACITY_TABLES = {

  // --------------------------------------------------------
  // Page 216 — steel-to-timber, ε = 90° (R_V,90,k)
  // --------------------------------------------------------
  "rothoblaas-hbs-steel-to-timber-Rv90": {
    id:           "rothoblaas-hbs-steel-to-timber-Rv90",
    source:       "Rothoblaas HBS Plate ETA-11/0030 p. 216",
    epsilon_deg:  90,            // screw axis perpendicular to grain
    alpha_deg:    90,            // load direction perpendicular to grain (per Rothoblaas labelling)
    units:        "kN",
    // Indexed [screw_id][S_PLATE in mm]
    values: {
      // ----- Ø8 (S_PLATE columns: 2, 3, 4, 5, 6, 8, 10, 12 mm) -----
      "HBSPL860":  { 2: 3.14, 3: 3.09, 4: 3.03, 5: 3.64, 6: 4.13, 8: 5.12, 10: 5.12, 12: 5.12 },
      "HBSPL880":  { 2: 4.22, 3: 4.17, 4: 4.11, 5: 4.72, 6: 5.22, 8: 6.21, 10: 6.21, 12: 6.21 },
      "HBSPL8100": { 2: 5.31, 3: 5.25, 4: 5.20, 5: 5.68, 6: 6.04, 8: 6.78, 10: 6.78, 12: 6.78 },
      "HBSPL8120": { 2: 5.86, 3: 5.86, 4: 5.86, 5: 6.22, 6: 6.57, 8: 7.29, 10: 7.29, 12: 7.29 },
      "HBSPL8140": { 2: 6.24, 3: 6.24, 4: 6.24, 5: 6.59, 6: 6.95, 8: 7.67, 10: 7.67, 12: 7.67 },
      "HBSPL8160": { 2: 6.74, 3: 6.74, 4: 6.74, 5: 7.10, 6: 7.46, 8: 8.17, 10: 8.17, 12: 8.17 },

      // ----- Ø10 (S_PLATE columns: 3, 4, 5, 6, 8, 10, 12, 16 mm) -----
      "HBSPL1080":  { 3: 4.87, 4: 4.81, 5: 4.75, 6: 5.42, 8: 6.50, 10: 7.58, 12: 7.58, 16: 7.58 },
      "HBSPL10100": { 3: 6.14, 4: 6.08, 5: 6.01, 6: 6.61, 8: 7.56, 10: 8.50, 12: 8.50, 16: 8.50 },
      "HBSPL10120": { 3: 7.34, 4: 7.34, 5: 7.28, 6: 7.70, 8: 8.42, 10: 9.14, 12: 9.14, 16: 9.14 },
      "HBSPL10140": { 3: 7.81, 4: 7.81, 5: 7.81, 6: 8.17, 8: 8.89, 10: 9.61, 12: 9.61, 16: 9.61 },
      "HBSPL10160": { 3: 8.44, 4: 8.44, 5: 8.44, 6: 8.80, 8: 9.52, 10: 10.24, 12: 10.24, 16: 10.24 },
      "HBSPL10180": { 3: 8.68, 4: 8.68, 5: 8.68, 6: 9.12, 8: 10.00, 10: 10.87, 12: 10.87, 16: 10.87 },

      // ----- Ø12 (S_PLATE columns: 4, 5, 6, 8, 10, 12, 16, 20 mm) -----
      "HBSPL12100": { 4:  6.90, 5:  6.83, 6:  6.76, 8:  8.16, 10:  9.41, 12: 10.67, 16: 10.67, 20: 10.67 },
      "HBSPL12120": { 4:  8.34, 5:  8.27, 6:  8.20, 8:  9.32, 10: 10.29, 12: 11.27, 16: 11.27, 20: 11.27 },
      "HBSPL12140": { 4:  9.73, 5:  9.71, 6:  9.64, 8: 10.49, 10: 11.26, 12: 12.03, 16: 12.03, 20: 12.03 },
      "HBSPL12160": { 4: 10.11, 5: 10.11, 6: 10.11, 8: 10.87, 10: 11.64, 12: 12.41, 16: 12.41, 20: 12.41 },
      "HBSPL12180": { 4: 10.86, 5: 10.86, 6: 10.86, 8: 11.63, 10: 12.40, 12: 13.17, 16: 13.17, 20: 13.17 },
      "HBSPL12200": { 4: 11.12, 5: 11.12, 6: 11.12, 8: 12.05, 10: 12.99, 12: 13.92, 16: 13.92, 20: 13.92 }
    }
  },

  // --------------------------------------------------------
  // Page 217 — steel-to-timber, ε = 0° (R_V,0,k)
  // --------------------------------------------------------
  // Screw axis parallel to grain (end-grain insertion). NOT Dan's case but
  // transcribed for v1.x extension.
  "rothoblaas-hbs-steel-to-timber-Rv0": {
    id:           "rothoblaas-hbs-steel-to-timber-Rv0",
    source:       "Rothoblaas HBS Plate ETA-11/0030 p. 217",
    epsilon_deg:  0,
    alpha_deg:    0,
    units:        "kN",
    values: {
      // ----- Ø8 -----
      "HBSPL860":  { 2: 1.26, 3: 1.23, 4: 1.21, 5: 1.54, 6: 1.82, 8: 2.38, 10: 2.38, 12: 2.38 },
      "HBSPL880":  { 2: 1.69, 3: 1.67, 4: 1.65, 5: 1.94, 6: 2.19, 8: 2.70, 10: 2.70, 12: 2.70 },
      "HBSPL8100": { 2: 2.12, 3: 2.10, 4: 2.08, 5: 2.39, 6: 2.65, 8: 3.18, 10: 3.18, 12: 3.18 },
      "HBSPL8120": { 2: 2.56, 3: 2.53, 4: 2.51, 5: 2.84, 6: 3.13, 8: 3.70, 10: 3.70, 12: 3.70 },
      "HBSPL8140": { 2: 2.99, 3: 2.97, 4: 2.95, 5: 3.22, 6: 3.46, 8: 3.93, 10: 3.93, 12: 3.93 },
      "HBSPL8160": { 2: 3.17, 3: 3.17, 4: 3.17, 5: 3.40, 6: 3.62, 8: 4.08, 10: 4.08, 12: 4.08 },

      // ----- Ø10 -----
      "HBSPL1080":  { 3: 1.95, 4: 1.92, 5: 1.90, 6: 2.22, 8: 2.77, 10: 3.32, 12: 3.32, 16: 3.32 },
      "HBSPL10100": { 3: 2.46, 4: 2.43, 5: 2.41, 6: 2.73, 8: 3.28, 10: 3.83, 12: 3.83, 16: 3.83 },
      "HBSPL10120": { 3: 2.96, 4: 2.94, 5: 2.91, 6: 3.26, 8: 3.84, 10: 4.43, 12: 4.43, 16: 4.43 },
      "HBSPL10140": { 3: 3.47, 4: 3.44, 5: 3.42, 6: 3.76, 8: 4.34, 10: 4.92, 12: 4.92, 16: 4.92 },
      "HBSPL10160": { 3: 3.97, 4: 3.95, 5: 3.92, 6: 4.20, 8: 4.66, 10: 5.11, 12: 5.11, 16: 5.11 },
      "HBSPL10180": { 3: 4.17, 4: 4.17, 5: 4.17, 6: 4.39, 8: 4.85, 10: 5.30, 12: 5.30, 16: 5.30 },

      // ----- Ø12 -----
      "HBSPL12100": { 4: 2.76, 5: 2.73, 6: 2.70, 8: 3.36, 10: 3.95, 12: 4.54, 16: 4.54, 20: 4.54 },
      "HBSPL12120": { 4: 3.34, 5: 3.31, 6: 3.28, 8: 3.94, 10: 4.55, 12: 5.15, 16: 5.15, 20: 5.15 },
      "HBSPL12140": { 4: 3.91, 5: 3.88, 6: 3.85, 8: 4.56, 10: 5.21, 12: 5.86, 16: 5.86, 20: 5.86 },
      "HBSPL12160": { 4: 4.49, 5: 4.46, 6: 4.43, 8: 5.10, 10: 5.72, 12: 6.34, 16: 6.34, 20: 6.34 },
      "HBSPL12180": { 4: 5.06, 5: 5.03, 6: 5.00, 8: 5.56, 10: 6.06, 12: 6.56, 16: 6.56, 20: 6.56 },
      "HBSPL12200": { 4: 5.33, 5: 5.33, 6: 5.33, 8: 5.82, 10: 6.31, 12: 6.79, 16: 6.79, 20: 6.79 }
    }
  }
};


// ============================================================
// PLATE THICKNESS CATEGORISATION (p. 221)
// ============================================================
//
// Informational — the engine just looks up by raw S_PLATE in mm. These
// thresholds drive the diagram labels (thin / intermediate / thick) and
// could be surfaced in the inspector to give context.

const PLATE_THICKNESS_CATEGORY = function (s_plate_mm, d_mm) {
  if (s_plate_mm <= 0.5 * d_mm) return "thin";
  if (s_plate_mm <  1.0 * d_mm) return "intermediate";
  return "thick";  // s_plate >= d
};


// ============================================================
// VERSION STAMP
// ============================================================
//
// The version that gets baked into saved connection files so a future ETA
// revision doesn't silently re-evaluate old designs. See known issue #5 in
// project root CLAUDE.md.

const ROTHOBLAAS_RULESET_VERSION = "rothoblaas-hbs-plate-eta-11-0030-2019";
