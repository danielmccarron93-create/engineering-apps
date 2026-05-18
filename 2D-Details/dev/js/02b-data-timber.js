'use strict';

// Timber catalogue — strength classes, section presets, k_mod matrix.
// Added 2026-05-18 for the Rothoblaas HBS Plate timber-screw connection feature.
// See dev/feature-timber-screws/04-catalogues.md §9, §10 for the source data.
//
// All timber rules and capacity tables in this app derive from:
//   - EN 1995-1-1 (Eurocode 5) for k_mod, γM, and the general framework
//   - EN 14080 (glulam) and EN 338 (sawn) for ρₖ values
//   - Rothoblaas HBS Plate ETA-11/0030 for the k_dens adjustment (p. 221)
//   - AS 1720.1 (informational) for the AU strength class equivalence
//
// Australian engineers commonly work in F-grades (sawn, AS 1720.1) and MGP
// grades (machine-graded pine, AS 1748). Neither maps 1:1 to EN classes;
// the equivalence below is approximate (within ±10% on ρₖ in most cases)
// and SHOULD BE VERIFIED for project-specific design by the user.
// References for the AU mapping:
//   - AS 1720.1:2010 Table H2.1 (F-grade characteristic densities)
//   - Forest & Wood Products Australia, "Span tables for hardwood" (F-grades)
//   - AS 1748:2011 (MGP grades)


// ============================================================
// TIMBER STRENGTH CLASSES
// ============================================================
//
// Each entry holds:
//   rho_k         — characteristic density [kg/m³]
//   k_dens_v      — Rothoblaas shear capacity multiplier (vs base 385 kg/m³)
//   k_dens_ax     — Rothoblaas axial capacity multiplier (vs base 385 kg/m³)
//   family        — 'glulam' | 'sawn-softwood' | 'sawn-hardwood' | 'lvl-softwood' | 'mgp'
//   standard      — source standard
//   notes         — engineering context
//   au_equivalent — if applicable, the AU class this maps from (informational only)
//
// Base ρₖ = 385 kg/m³ (= GL24h). Rothoblaas k_dens factors per p. 221:
//   ρₖ:   350  380  385   405  425  430  440
//   kdens_v:  0.90 0.98 1.00  1.02 1.05 1.05 1.07
//   kdens_ax: 0.92 0.98 1.00  1.04 1.08 1.09 1.11

const TIMBER_CLASSES = {

  // ---------- EU SAWN (EN 338) ----------
  "C16":   { rho_k: 310, k_dens_v: 0.85, k_dens_ax: 0.85, family: "sawn-softwood",
             standard: "EN 338", notes: "low-grade softwood; extrapolated k_dens." },
  "C24":   { rho_k: 350, k_dens_v: 0.90, k_dens_ax: 0.92, family: "sawn-softwood",
             standard: "EN 338", notes: "common European softwood." },
  "C30":   { rho_k: 380, k_dens_v: 0.98, k_dens_ax: 0.98, family: "sawn-softwood",
             standard: "EN 338", notes: "high-strength European softwood." },

  // ---------- EU GLULAM (EN 14080) ----------
  "GL24h": { rho_k: 385, k_dens_v: 1.00, k_dens_ax: 1.00, family: "glulam",
             standard: "EN 14080", notes: "Rothoblaas BASE class — all capacity tables calibrated here." },
  "GL26h": { rho_k: 405, k_dens_v: 1.02, k_dens_ax: 1.04, family: "glulam",
             standard: "EN 14080" },
  "GL28h": { rho_k: 425, k_dens_v: 1.05, k_dens_ax: 1.08, family: "glulam",
             standard: "EN 14080", notes: "common AU glulam (≈ Hyne Beam17C)." },
  "GL30h": { rho_k: 430, k_dens_v: 1.05, k_dens_ax: 1.09, family: "glulam",
             standard: "EN 14080" },
  "GL32h": { rho_k: 440, k_dens_v: 1.07, k_dens_ax: 1.11, family: "glulam",
             standard: "EN 14080" },

  // ---------- AU F-GRADES (AS 1720.1 Table H2.1, approximate) ----------
  // VERIFY: ρₖ values are approximate equivalence to EN class for k_dens lookup.
  // AS 1720.1 design uses different framework (k1 modifier system, φ capacity factor)
  // — when designing to AS 1720.1 directly, ignore Rothoblaas tables.
  // These mappings exist so an AU engineer can pick "F17" and get sensible Rothoblaas results.
  "F17":   { rho_k: 385, k_dens_v: 1.00, k_dens_ax: 1.00, family: "sawn-hardwood",
             standard: "AS 1720.1", au_equivalent: "F17",
             notes: "Approx GL24h equivalent. Common AU hardwood (Brushbox, Spotted Gum)." },
  "F22":   { rho_k: 410, k_dens_v: 1.03, k_dens_ax: 1.06, family: "sawn-hardwood",
             standard: "AS 1720.1", au_equivalent: "F22",
             notes: "Approx GL26h equivalent. Stronger AU hardwoods." },
  "F27":   { rho_k: 430, k_dens_v: 1.05, k_dens_ax: 1.09, family: "sawn-hardwood",
             standard: "AS 1720.1", au_equivalent: "F27",
             notes: "Approx GL30h equivalent. Ironbark, Tallowwood." },
  "F34":   { rho_k: 460, k_dens_v: 1.09, k_dens_ax: 1.13, family: "sawn-hardwood",
             standard: "AS 1720.1", au_equivalent: "F34",
             notes: "Dense AU hardwoods. k_dens extrapolated beyond Rothoblaas table." },

  // ---------- AU MGP (AS 1748) ----------
  // Machine-graded pine. ρₖ values from AS 1720.1 Supp 1 / Hyne data.
  "MGP10": { rho_k: 400, k_dens_v: 1.01, k_dens_ax: 1.03, family: "mgp",
             standard: "AS 1748", au_equivalent: "MGP10",
             notes: "Radiata pine F5-equivalent." },
  "MGP12": { rho_k: 410, k_dens_v: 1.03, k_dens_ax: 1.06, family: "mgp",
             standard: "AS 1748", au_equivalent: "MGP12",
             notes: "Radiata pine F8-equivalent." },
  "MGP15": { rho_k: 420, k_dens_v: 1.05, k_dens_ax: 1.07, family: "mgp",
             standard: "AS 1748", au_equivalent: "MGP15",
             notes: "Radiata pine F11-equivalent." },

  // ---------- LVL (per Rothoblaas tables) ----------
  "LVL_softwood": { rho_k: 500, k_dens_v: 1.10, k_dens_ax: 1.20, family: "lvl-softwood",
                    standard: "Rothoblaas p. 214",
                    notes: "fax,k and fhead,k differ — see ScrewSpec.fax_k['lvl_softwood']." },
};


// ============================================================
// TIMBER SECTION PRESETS
// ============================================================
//
// Common Australian rectangular timber sizes. Width × depth in mm.
// Defaults set to glulam (most common engineered AU use). User can change class.
// AU glulam sizes from Hyne / Wesbeam / Tilling product catalogues.

const TIMBER_SECTIONS = {

  // Glulam beams
  "GL 65×195":   { b: 65,  d: 195, family: "glulam", default_class: "GL28h", notes: "Hyne Beam17C 195 deep" },
  "GL 65×240":   { b: 65,  d: 240, family: "glulam", default_class: "GL28h" },
  "GL 65×295":   { b: 65,  d: 295, family: "glulam", default_class: "GL28h" },
  "GL 65×360":   { b: 65,  d: 360, family: "glulam", default_class: "GL28h" },
  "GL 65×450":   { b: 65,  d: 450, family: "glulam", default_class: "GL28h" },
  "GL 85×240":   { b: 85,  d: 240, family: "glulam", default_class: "GL28h" },
  "GL 85×295":   { b: 85,  d: 295, family: "glulam", default_class: "GL28h" },
  "GL 85×360":   { b: 85,  d: 360, family: "glulam", default_class: "GL28h" },
  "GL 85×450":   { b: 85,  d: 450, family: "glulam", default_class: "GL28h" },
  "GL 85×600":   { b: 85,  d: 600, family: "glulam", default_class: "GL28h" },
  "GL 135×295":  { b: 135, d: 295, family: "glulam", default_class: "GL28h" },
  "GL 135×360":  { b: 135, d: 360, family: "glulam", default_class: "GL28h" },
  "GL 135×450":  { b: 135, d: 450, family: "glulam", default_class: "GL28h" },
  "GL 135×600":  { b: 135, d: 600, family: "glulam", default_class: "GL28h" },

  // Glulam columns (square / near-square)
  "GL 135×135":  { b: 135, d: 135, family: "glulam", default_class: "GL28h" },
  "GL 195×195":  { b: 195, d: 195, family: "glulam", default_class: "GL28h" },
  "GL 240×240":  { b: 240, d: 240, family: "glulam", default_class: "GL28h" },
  "GL 295×295":  { b: 295, d: 295, family: "glulam", default_class: "GL28h" },
  "GL 360×360":  { b: 360, d: 360, family: "glulam", default_class: "GL28h" },
  "GL 600×600":  { b: 600, d: 600, family: "glulam", default_class: "GL28h",
                  notes: "Dan's worked example uses this." },

  // MGP / sawn pine
  "MGP 35×90":   { b: 35,  d: 90,  family: "mgp", default_class: "MGP10" },
  "MGP 45×90":   { b: 45,  d: 90,  family: "mgp", default_class: "MGP10" },
  "MGP 45×140":  { b: 45,  d: 140, family: "mgp", default_class: "MGP10" },
  "MGP 45×190":  { b: 45,  d: 190, family: "mgp", default_class: "MGP10" },
  "MGP 45×240":  { b: 45,  d: 240, family: "mgp", default_class: "MGP10" },
  "MGP 45×290":  { b: 45,  d: 290, family: "mgp", default_class: "MGP10" },

  // Hardwood (F-grade) — typical AU sawn sizes
  "F17 100×100": { b: 100, d: 100, family: "sawn-hardwood", default_class: "F17" },
  "F17 200×200": { b: 200, d: 200, family: "sawn-hardwood", default_class: "F17" },
  "F17 100×200": { b: 100, d: 200, family: "sawn-hardwood", default_class: "F17" },
};


// ============================================================
// k_mod MATRIX (EN 1995-1-1 Table 3.1)
// ============================================================
//
// k_mod converts characteristic resistance (R_k) to design resistance:
//   R_d = (k_mod × R_k) / γM
// where γM = 1.3 for timber connections (EN 1995-1-1 §2.4.1).
//
// Values below are for solid timber and glulam (EN 338, EN 14080).
// LVL and panel products have slightly different values — defer to v1.x.
// AU engineers: this is the EUROCODE framework, not the AS 1720.1 k1 system.
// AS 1720.1 uses k1 with similar but not identical values. For AS-compliant
// design, divide capacities by φ (capacity factor) instead of γM and multiply
// by k1 (load-duration) instead of k_mod. The Rothoblaas tables are
// fundamentally Eurocode-based; this app implements the Eurocode route.

const K_MOD = {
  // service-class: SC1 (dry interior, RH≤65%), SC2 (covered exterior, RH≤85%), SC3 (outdoor)
  "SC1": {
    "permanent":     0.60,  // > 10 years      (self-weight)
    "long":          0.70,  //   6 mo – 10 yrs (storage)
    "medium":        0.80,  //   1 wk – 6 mo   (imposed live load)
    "short":         0.90,  // < 1 week        (snow / some wind)
    "instantaneous": 1.10   // seconds         (impact / accidental)
  },
  "SC2": {
    "permanent":     0.60,
    "long":          0.70,
    "medium":        0.80,
    "short":         0.90,
    "instantaneous": 1.10
  },
  "SC3": {
    "permanent":     0.50,
    "long":          0.55,
    "medium":        0.65,
    "short":         0.70,
    "instantaneous": 0.90
  }
};


// ============================================================
// CONSTANTS
// ============================================================

// Partial factor for material (timber connections), EN 1995-1-1 §2.4.1
const GAMMA_M_CONNECTIONS = 1.3;

// Service class descriptions (for UI dropdowns)
const SERVICE_CLASSES = [
  { id: "SC1", label: "SC1 — dry interior (RH ≤ 65%)" },
  { id: "SC2", label: "SC2 — covered exterior (RH ≤ 85%)" },
  { id: "SC3", label: "SC3 — outdoor / very humid" }
];

// Load duration classes (for UI dropdowns), EN 1995-1-1 §2.3.1.2
const LOAD_DURATIONS = [
  { id: "permanent",     label: "Permanent (> 10 years)" },
  { id: "long",          label: "Long-term (6 mo – 10 yr)" },
  { id: "medium",        label: "Medium-term (1 wk – 6 mo)" },
  { id: "short",         label: "Short-term (< 1 week)" },
  { id: "instantaneous", label: "Instantaneous (seconds)" }
];

// Default selections when a Connection is first created (Q3 from open-questions.md)
const TIMBER_DEFAULTS = {
  service_class:  "SC1",
  load_duration:  "medium",
  timber_class:   "GL28h",
  k_mod:          0.80  // = K_MOD.SC1.medium — kept as a constant for fast access
};
