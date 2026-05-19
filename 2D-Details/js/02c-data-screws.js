'use strict';

// Rothoblaas HBS Plate screw catalogue — 18 entries (Ø8/10/12 × 6 lengths each)
// Added 2026-05-18 for the timber-screw connection feature.
// See PlannedBuilds/timber-screws/04-catalogues.md §1 for the source data.
//
// Source: Rothoblaas HBS Plate technical data sheet (ETA-11/0030), pp. 212–214.
//
// Naming convention matches Rothoblaas product codes: HBSPL<d><L>
//   e.g. HBSPL12200 = HBS Plate, Ø12 mm × 200 mm long.
//
// Fields (all geometry in mm; mechanical in kN or Nm; densities in kg/m³):
//   id              — Rothoblaas product code (catalogue key)
//   system          — fastener system identifier (for multi-system future)
//   d               — nominal screw diameter (== d₁ in EN 1995 / Rothoblaas notation)
//   L               — total screw length
//   b               — thread length
//   AP_min, AP_max  — useful pre-drill depth range (per Rothoblaas geometry diagram)
//   dK              — head outer diameter
//   d2              — thread (root) diameter
//   dS              — shank (smooth) diameter
//   t1              — head thickness
//   tK              — washer thickness (under-head shoulder)
//   dUK             — underhead diameter (interlocks with plate hole)
//   dV_steel        — diameter of steel-plate hole (clearance hole)
//   dV_S            — pre-drill diameter in softwood
//   dV_H            — pre-drill diameter in hardwood / beech LVL
//   bit             — installation bit (Torx TX)
//   torque_rec      — recommended installation torque (M_ins,rec)
//   ftens_k         — characteristic tensile strength of screw (steel side)
//   My_k            — characteristic yield moment (Johansen mode analysis)
//   fax_k           — withdrawal-resistance parameter by substrate [N/mm²]
//   fhead_k         — head pull-through parameter by substrate [N/mm²]
//   pcs_per_box     — quantity per Rothoblaas pack (for procurement notes)


// ============================================================
// COMMON MECHANICAL PARAMETERS (shared per diameter — p. 214)
// ============================================================

// Withdrawal-resistance parameters (fax,k) by substrate. Same for all lengths within a d.
const _FAX_K = {
  // [softwood, lvl_softwood, beech_lvl_predrilled]   — values in N/mm²
  // Note: applies to ALL HBS Plate sizes (Rothoblaas tabulates by substrate, not by d).
  softwood:              11.7,
  lvl_softwood:          15.0,
  beech_lvl_predrilled:  29.0
};
const _FHEAD_K = {
  softwood:              10.5,
  lvl_softwood:          20.0
};


// ============================================================
// HBS PLATE CATALOGUE
// ============================================================

const HBS_PLATE_SCREWS = {

  // ---------- Ø8 mm — TX 40 bit, M_ins,rec = 25 Nm ----------
  "HBSPL860":  { id: "HBSPL860",  system: "rothoblaas-hbs-plate",
                 d:  8, L:  60, b:  52, AP_min: 1, AP_max: 10,
                 dK: 13.5, d2: 5.9, dS: 6.3, t1: 13.5, tK: 4.5, dUK: 10.0,
                 dV_steel: 11.0, dV_S: 5.0, dV_H: 6.0,
                 bit: "TX40", torque_rec: 25,
                 ftens_k: 32.0, My_k: 33.4,
                 fax_k: _FAX_K, fhead_k: _FHEAD_K, pcs_per_box: 100 },
  "HBSPL880":  { id: "HBSPL880",  system: "rothoblaas-hbs-plate",
                 d:  8, L:  80, b:  55, AP_min: 1, AP_max: 15,
                 dK: 13.5, d2: 5.9, dS: 6.3, t1: 13.5, tK: 4.5, dUK: 10.0,
                 dV_steel: 11.0, dV_S: 5.0, dV_H: 6.0,
                 bit: "TX40", torque_rec: 25,
                 ftens_k: 32.0, My_k: 33.4,
                 fax_k: _FAX_K, fhead_k: _FHEAD_K, pcs_per_box: 100 },
  "HBSPL8100": { id: "HBSPL8100", system: "rothoblaas-hbs-plate",
                 d:  8, L: 100, b:  75, AP_min: 1, AP_max: 15,
                 dK: 13.5, d2: 5.9, dS: 6.3, t1: 13.5, tK: 4.5, dUK: 10.0,
                 dV_steel: 11.0, dV_S: 5.0, dV_H: 6.0,
                 bit: "TX40", torque_rec: 25,
                 ftens_k: 32.0, My_k: 33.4,
                 fax_k: _FAX_K, fhead_k: _FHEAD_K, pcs_per_box: 100 },
  "HBSPL8120": { id: "HBSPL8120", system: "rothoblaas-hbs-plate",
                 d:  8, L: 120, b:  95, AP_min: 1, AP_max: 15,
                 dK: 13.5, d2: 5.9, dS: 6.3, t1: 13.5, tK: 4.5, dUK: 10.0,
                 dV_steel: 11.0, dV_S: 5.0, dV_H: 6.0,
                 bit: "TX40", torque_rec: 25,
                 ftens_k: 32.0, My_k: 33.4,
                 fax_k: _FAX_K, fhead_k: _FHEAD_K, pcs_per_box: 100 },
  "HBSPL8140": { id: "HBSPL8140", system: "rothoblaas-hbs-plate",
                 d:  8, L: 140, b: 110, AP_min: 1, AP_max: 20,
                 dK: 13.5, d2: 5.9, dS: 6.3, t1: 13.5, tK: 4.5, dUK: 10.0,
                 dV_steel: 11.0, dV_S: 5.0, dV_H: 6.0,
                 bit: "TX40", torque_rec: 25,
                 ftens_k: 32.0, My_k: 33.4,
                 fax_k: _FAX_K, fhead_k: _FHEAD_K, pcs_per_box: 100 },
  "HBSPL8160": { id: "HBSPL8160", system: "rothoblaas-hbs-plate",
                 d:  8, L: 160, b: 130, AP_min: 1, AP_max: 20,
                 dK: 13.5, d2: 5.9, dS: 6.3, t1: 13.5, tK: 4.5, dUK: 10.0,
                 dV_steel: 11.0, dV_S: 5.0, dV_H: 6.0,
                 bit: "TX40", torque_rec: 25,
                 ftens_k: 32.0, My_k: 33.4,
                 fax_k: _FAX_K, fhead_k: _FHEAD_K, pcs_per_box: 100 },

  // ---------- Ø10 mm — TX 40 bit, M_ins,rec = 35 Nm ----------
  "HBSPL1080":  { id: "HBSPL1080",  system: "rothoblaas-hbs-plate",
                  d: 10, L:  80, b:  60, AP_min: 1, AP_max: 10,
                  dK: 16.5, d2: 6.6, dS: 7.2, t1: 16.5, tK: 5.0, dUK: 12.0,
                  dV_steel: 13.0, dV_S: 6.0, dV_H: 7.0,
                  bit: "TX40", torque_rec: 35,
                  ftens_k: 40.0, My_k: 45.0,
                  fax_k: _FAX_K, fhead_k: _FHEAD_K, pcs_per_box: 50 },
  "HBSPL10100": { id: "HBSPL10100", system: "rothoblaas-hbs-plate",
                  d: 10, L: 100, b:  75, AP_min: 1, AP_max: 15,
                  dK: 16.5, d2: 6.6, dS: 7.2, t1: 16.5, tK: 5.0, dUK: 12.0,
                  dV_steel: 13.0, dV_S: 6.0, dV_H: 7.0,
                  bit: "TX40", torque_rec: 35,
                  ftens_k: 40.0, My_k: 45.0,
                  fax_k: _FAX_K, fhead_k: _FHEAD_K, pcs_per_box: 50 },
  "HBSPL10120": { id: "HBSPL10120", system: "rothoblaas-hbs-plate",
                  d: 10, L: 120, b:  95, AP_min: 1, AP_max: 15,
                  dK: 16.5, d2: 6.6, dS: 7.2, t1: 16.5, tK: 5.0, dUK: 12.0,
                  dV_steel: 13.0, dV_S: 6.0, dV_H: 7.0,
                  bit: "TX40", torque_rec: 35,
                  ftens_k: 40.0, My_k: 45.0,
                  fax_k: _FAX_K, fhead_k: _FHEAD_K, pcs_per_box: 50 },
  "HBSPL10140": { id: "HBSPL10140", system: "rothoblaas-hbs-plate",
                  d: 10, L: 140, b: 110, AP_min: 1, AP_max: 20,
                  dK: 16.5, d2: 6.6, dS: 7.2, t1: 16.5, tK: 5.0, dUK: 12.0,
                  dV_steel: 13.0, dV_S: 6.0, dV_H: 7.0,
                  bit: "TX40", torque_rec: 35,
                  ftens_k: 40.0, My_k: 45.0,
                  fax_k: _FAX_K, fhead_k: _FHEAD_K, pcs_per_box: 50 },
  "HBSPL10160": { id: "HBSPL10160", system: "rothoblaas-hbs-plate",
                  d: 10, L: 160, b: 130, AP_min: 1, AP_max: 20,
                  dK: 16.5, d2: 6.6, dS: 7.2, t1: 16.5, tK: 5.0, dUK: 12.0,
                  dV_steel: 13.0, dV_S: 6.0, dV_H: 7.0,
                  bit: "TX40", torque_rec: 35,
                  ftens_k: 40.0, My_k: 45.0,
                  fax_k: _FAX_K, fhead_k: _FHEAD_K, pcs_per_box: 50 },
  "HBSPL10180": { id: "HBSPL10180", system: "rothoblaas-hbs-plate",
                  d: 10, L: 180, b: 150, AP_min: 1, AP_max: 20,
                  dK: 16.5, d2: 6.6, dS: 7.2, t1: 16.5, tK: 5.0, dUK: 12.0,
                  dV_steel: 13.0, dV_S: 6.0, dV_H: 7.0,
                  bit: "TX40", torque_rec: 35,
                  ftens_k: 40.0, My_k: 45.0,
                  fax_k: _FAX_K, fhead_k: _FHEAD_K, pcs_per_box: 50 },

  // ---------- Ø12 mm — TX 50 bit, M_ins,rec = 50 Nm ----------
  "HBSPL12100": { id: "HBSPL12100", system: "rothoblaas-hbs-plate",
                  d: 12, L: 100, b:  75, AP_min: 1, AP_max: 15,
                  dK: 18.5, d2: 7.3, dS: 8.55, t1: 19.5, tK: 5.5, dUK: 13.0,
                  dV_steel: 14.0, dV_S: 7.0, dV_H: 8.0,
                  bit: "TX50", torque_rec: 50,
                  ftens_k: 50.0, My_k: 65.0,
                  fax_k: _FAX_K, fhead_k: _FHEAD_K, pcs_per_box: 25 },
  "HBSPL12120": { id: "HBSPL12120", system: "rothoblaas-hbs-plate",
                  d: 12, L: 120, b:  90, AP_min: 1, AP_max: 20,
                  dK: 18.5, d2: 7.3, dS: 8.55, t1: 19.5, tK: 5.5, dUK: 13.0,
                  dV_steel: 14.0, dV_S: 7.0, dV_H: 8.0,
                  bit: "TX50", torque_rec: 50,
                  ftens_k: 50.0, My_k: 65.0,
                  fax_k: _FAX_K, fhead_k: _FHEAD_K, pcs_per_box: 25 },
  "HBSPL12140": { id: "HBSPL12140", system: "rothoblaas-hbs-plate",
                  d: 12, L: 140, b: 110, AP_min: 1, AP_max: 20,
                  dK: 18.5, d2: 7.3, dS: 8.55, t1: 19.5, tK: 5.5, dUK: 13.0,
                  dV_steel: 14.0, dV_S: 7.0, dV_H: 8.0,
                  bit: "TX50", torque_rec: 50,
                  ftens_k: 50.0, My_k: 65.0,
                  fax_k: _FAX_K, fhead_k: _FHEAD_K, pcs_per_box: 25 },
  "HBSPL12160": { id: "HBSPL12160", system: "rothoblaas-hbs-plate",
                  d: 12, L: 160, b: 120, AP_min: 1, AP_max: 30,
                  dK: 18.5, d2: 7.3, dS: 8.55, t1: 19.5, tK: 5.5, dUK: 13.0,
                  dV_steel: 14.0, dV_S: 7.0, dV_H: 8.0,
                  bit: "TX50", torque_rec: 50,
                  ftens_k: 50.0, My_k: 65.0,
                  fax_k: _FAX_K, fhead_k: _FHEAD_K, pcs_per_box: 25 },
  "HBSPL12180": { id: "HBSPL12180", system: "rothoblaas-hbs-plate",
                  d: 12, L: 180, b: 140, AP_min: 1, AP_max: 30,
                  dK: 18.5, d2: 7.3, dS: 8.55, t1: 19.5, tK: 5.5, dUK: 13.0,
                  dV_steel: 14.0, dV_S: 7.0, dV_H: 8.0,
                  bit: "TX50", torque_rec: 50,
                  ftens_k: 50.0, My_k: 65.0,
                  fax_k: _FAX_K, fhead_k: _FHEAD_K, pcs_per_box: 25 },
  "HBSPL12200": { id: "HBSPL12200", system: "rothoblaas-hbs-plate",
                  d: 12, L: 200, b: 160, AP_min: 1, AP_max: 30,
                  dK: 18.5, d2: 7.3, dS: 8.55, t1: 19.5, tK: 5.5, dUK: 13.0,
                  dV_steel: 14.0, dV_S: 7.0, dV_H: 8.0,
                  bit: "TX50", torque_rec: 50,
                  ftens_k: 50.0, My_k: 65.0,
                  fax_k: _FAX_K, fhead_k: _FHEAD_K, pcs_per_box: 25 },
};


// ============================================================
// SCREW SYSTEM REGISTRY
// ============================================================
//
// Defines the available fastener systems. v1 only has Rothoblaas HBS Plate.
// v1.x can add SPAX, Würth, SFS Intec, etc. without restructuring the engine.

const SCREW_SYSTEMS = {
  "rothoblaas-hbs-plate": {
    id:             "rothoblaas-hbs-plate",
    label:          "Rothoblaas HBS Plate",
    standard:       "ETA-11/0030",
    use_case:       "steel-to-timber (plate sandwich)",
    catalogue:      HBS_PLATE_SCREWS,
    rule_set_ids:   [
      "rothoblaas-hbs-steel-to-timber-predrilled",
      "rothoblaas-hbs-steel-to-timber-no-predrill"
    ],
    nef_table_id:   "rothoblaas-hbs-nef",
    capacity_tables: {
      // ε = screw-axis-to-grain angle (per Rothoblaas convention — see Q1 in open-questions.md)
      "eps90_alpha90": "rothoblaas-hbs-steel-to-timber-Rv90",   // p. 216
      "eps0_alpha0":   "rothoblaas-hbs-steel-to-timber-Rv0"     // p. 217
    }
  }
};


// Default screw spec for the screw tool (Q5 from open-questions.md)
const DEFAULT_SCREW_SPEC = "HBSPL12200";

// Convenience: array of just the d=12 entries, in length order, for the UI size-picker.
const HBS_LENGTHS_BY_D = {
  8:  ["HBSPL860",  "HBSPL880",  "HBSPL8100",  "HBSPL8120",  "HBSPL8140",  "HBSPL8160"],
  10: ["HBSPL1080", "HBSPL10100","HBSPL10120", "HBSPL10140", "HBSPL10160", "HBSPL10180"],
  12: ["HBSPL12100","HBSPL12120","HBSPL12140", "HBSPL12160", "HBSPL12180", "HBSPL12200"]
};
