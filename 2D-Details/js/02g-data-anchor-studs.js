'use strict';

// RAMSET ChemSet(TM) Anchor Studs — pre-cut fully-threaded chemical/bonded anchor.
// Grade 5.8 carbon steel (also HDG to AS/NZS 4680/1214, and AISI 316 SS).
// Set with ChemSet adhesive into a drilled hole in solid concrete; chisel-cut
// embedded end, external hex (standard nut) + washer + depth-set mark at top.
// Added 2026-06-04 for the M16 anchor-stud feature. Source data ONLY from the
// Ramset ChemSet data sheet supplied in PlannedBuilds/m16-anchor-stud/.
//
// Sources:
//   - Catalogue + Typical Properties, p.12 (L, Le, maxFixt t, fy/fu CS & SS, Z, codes).
//   - Installation Details, Reo 502 TDS Table 2 (dh, embed, maxClr, Tr, ec, ac, bm).
//
// Naming convention: keyed by SIZE ("M16") so it parallels BOLT_DB and reads
//   cleanly in the V25 size-picker; the per-finish order codes live in `codes`.
//
// UNITS: all lengths/diameters in mm; fy/fu in MPa (N/mm^2); torque Tr in Nm;
//        section modulus Z in mm^3.
//
// NUT / WASHER / THREAD-PITCH DIMS ARE NOT DUPLICATED HERE.
//   The drawer (72j-v25-stud.js) reuses BOLT_DB[size] for the projecting hex nut
//   + plain washer + thread, reading these BOLT_DB fields:
//     d, pitch, minorD, nutAF, nutH, washOD, washT.
//   BOLT_DB covers M12/M16/M20/M24 (and M27-M36) but has NO M8/M10 entry, so the
//   drawer carries a small AS-1112/AS-1237 fallback for the two smallest studs
//   (STUD_NUT_FALLBACK in 72j) — never NaN on an undefined BOLT_DB lookup.
//
// FIELD MEANINGS (per size entry):
//   size     — catalogue key + display label ("M16")
//   d        — nominal thread/rod diameter (mm)
//   L        — overall stud length (mm)               [p.12 L]
//   Le       — effective (bonded/anchorage) length (mm) = embed + maxFixt  [p.12 Le]
//   maxFixt  — max fixture thickness clamped (mm)      [p.12 maxFixt t / Table2 maxFixt]
//   dh       — drill hole diameter in concrete (mm)    [Table2 dh]
//   embed    — embedment = drill hole depth in substrate (mm) [Table2 embed, primary]
//   embedDeep— deeper alt embedment for M20/M24 dual rows (mm) or null [Table2 "(or ..)"]
//   embedShallow — shallow/baseline embedment (mm); == embed for single-row sizes
//   maxClr   — max fixture clearance hole (mm)         [Table2 maxClr]
//   Tr       — installation tightening torque (Nm)     [Table2 Tr]
//   ec       — min edge distance (mm)                  [Table2 ec]  (deferred rule)
//   ac       — min anchor spacing (mm)                 [Table2 ac]  (deferred rule)
//   bm       — min structural/member thickness (mm)    [Table2 bm, primary]
//   bmDeep   — min member thickness for the deep-embed alt (mm) or null [Table2 "(or ..)"]
//   fy_cs/fu_cs — carbon-steel yield / ultimate (MPa)  [p.12 CS fy/fu]
//   fy_ss/fu_ss — AISI 316 SS yield / ultimate (MPa)   [p.12 SS fy/fu]
//   Z        — section modulus (mm^3)                  [p.12 Z]
//   codes    — order codes { zinc, gal, ss } (gal/ss null where not catalogued)
//   altL     — array of extra catalogued overall lengths (special), or null
//
// CROSS-CHECK (do not edit without re-deriving):
//   * `embed` matches the live V25_ANCHOR_DB.chemset.embeds exactly:
//       M12:110  M16:125  M20:170  M24:210.
//     For M20/M24 the live DB uses the DEEPER Table-2 value, so here embed holds
//     the deep value (170/210) and embedShallow records the shallow alt.
//   * Le = embed + maxFixt holds for the SHALLOW embedment on the dual rows:
//       M8 80+15=95, M10 90+25=115, M12 110+30=140, M16 125+40=165,
//       M20 145+80=225 (Le=225 -> implies a 145 baseline, NOT 150/170),
//       M24 160+105=265 (Le=265 -> uses the SHALLOW 160, NOT 210).
//     => Le on M20/M24 is NOT embed(deep)+maxFixt. Treat p.12 Le as authoritative
//        for the anchorage length and Table-2 embed as the drill depth; do not
//        recompute Le from the deep embed.

const CHEMSET_STUDS = {

  // ---------- M8  (CS08110) — box 10 ----------
  "M8":  { size: "M8",  d:  8, L: 110, Le:  95, maxFixt: 15,
           dh: 10, embed:  80, embedDeep: null, embedShallow:  80,
           maxClr: 10, Tr:  10, ec: 35, ac:  50, bm: 100, bmDeep: null,
           fy_cs: 430, fu_cs: 540, fy_ss: 450, fu_ss: 650, Z:  31.2,
           codes: { zinc: "CS08110", gal: "CS08110GH", ss: "CS08110SS" },
           altL: null },

  // ---------- M10 (CS10130) — box 10 ----------
  "M10": { size: "M10", d: 10, L: 130, Le: 115, maxFixt: 25,
           dh: 12, embed:  90, embedDeep: null, embedShallow:  90,
           maxClr: 12, Tr:  20, ec: 40, ac:  60, bm: 120, bmDeep: null,
           fy_cs: 430, fu_cs: 540, fy_ss: 450, fu_ss: 650, Z:  62.3,
           codes: { zinc: "CS10130", gal: "CS10130GH", ss: "CS10130SS" },
           altL: null },

  // ---------- M12 (CS12160; CS12180 special) — box 10 ----------
  "M12": { size: "M12", d: 12, L: 160, Le: 140, maxFixt: 30,
           dh: 14, embed: 110, embedDeep: null, embedShallow: 110,
           maxClr: 15, Tr:  40, ec: 50, ac:  75, bm: 140, bmDeep: null,
           fy_cs: 430, fu_cs: 540, fy_ss: 450, fu_ss: 650, Z: 109.2,
           codes: { zinc: "CS12160", gal: "CS12160GH", ss: "CS12160SS" },
           altL: [ { L: 180, codes: { zinc: "CS12180", gal: null, ss: null } } ] },

  // ---------- M16 (CS16190) — box 10 — DEFAULT ARMED SIZE ----------
  "M16": { size: "M16", d: 16, L: 190, Le: 165, maxFixt: 40,
           dh: 18, embed: 125, embedDeep: null, embedShallow: 125,
           maxClr: 20, Tr:  95, ec: 65, ac: 100, bm: 160, bmDeep: null,
           fy_cs: 420, fu_cs: 520, fy_ss: 450, fu_ss: 650, Z: 277.5,
           codes: { zinc: "CS16190", gal: "CS16190GH", ss: "CS16190SS" },
           altL: null },

  // ---------- M20 (CS20260) — box 6 — dual embed/min-thk row ----------
  // embed=170 (deep) matches live V25_ANCHOR_DB; embedShallow=150 is the other
  // Table-2 value. Le=225 reconciles with the 145 baseline, NOT 150/170.
  "M20": { size: "M20", d: 20, L: 260, Le: 225, maxFixt: 80,
           dh: 24, embed: 170, embedDeep: 170, embedShallow: 150,
           maxClr: 24, Tr: 180, ec: 80, ac: 120, bm: 190, bmDeep: 220,
           fy_cs: 420, fu_cs: 520, fy_ss: 450, fu_ss: 650, Z: 540.9,
           codes: { zinc: "CS20260", gal: "CS20260GH", ss: "CS20260SS" },
           altL: null },

  // ---------- M24 (CS24300) — box 6 — dual embed/min-thk row ----------
  // embed=210 (deep) matches live V25_ANCHOR_DB; embedShallow=160. Le=265
  // reconciles with the SHALLOW 160 (160+105), NOT the deep 210.
  "M24": { size: "M24", d: 24, L: 300, Le: 265, maxFixt: 105,
           dh: 26, embed: 210, embedDeep: 210, embedShallow: 160,
           maxClr: 28, Tr: 315, ec: 100, ac: 145, bm: 200, bmDeep: 270,
           fy_cs: 420, fu_cs: 520, fy_ss: 450, fu_ss: 650, Z: 935.5,
           codes: { zinc: "CS24300", gal: "CS24300GH", ss: "CS24300SS" },
           altL: null },
};

// Default armed size for the anchor-stud tool (the feature is named M16 anchor studs).
const DEFAULT_CHEMSET_SIZE = "M16";

// Catalogued stud sizes in order, for the V25 size-picker column.
const CHEMSET_SIZES = ["M8", "M10", "M12", "M16", "M20", "M24"];

// Retrieve a stud spec by its size key (e.g. "M16"). Mirrors getScrewSpec (02e).
// Returns the spec object, or null if not found.
function getStudSpec(sizeKey) {
  return (typeof CHEMSET_STUDS === 'object' && CHEMSET_STUDS[sizeKey]) || null;
}
