'use strict';

// AS 1252 bolt assembly catalogue + connection defaults
// Extracted from dev/index.html lines 3037-3148 (2026-05-02 modular split)

// AS 1252:2016 structural bolt assembly dimensions (heavy hex)
// d=shank dia, p=thread pitch, headAF=head across-flats, headH=head height,
// nutAF=nut across-flats, nutH=nut height, washOD=washer OD, washT=washer thickness
// V14 (drafter §7.2): canonical AS 1252 / ISO M-bolt dimensions.
// Fields:
//   d       — nominal shank diameter (mm)
//   pitch   — thread pitch (mm, ISO metric coarse)
//   headAF  — hex head across-flats (mm)
//   headH   — hex head height (mm)
//   nutAF   — hex nut across-flats (mm)
//   nutH    — hex nut height (mm)
//   washOD  — plain washer outer diameter (mm)
//   washT   — plain washer thickness (mm)
//   minorD  — thread minor (root) diameter (mm) — used for sawtooth thread profile
//   threadL — default thread length from tip (mm, for bolts ≤ 125 long = 2d + 6)
const BOLT_DB = {
  "M12": { d:12, pitch:1.75, headAF:21, headH:8.0,  nutAF:21, nutH:10.8, washOD:28, washT:3.0, minorD: 9.853, threadL:30 },
  "M16": { d:16, pitch:2.00, headAF:27, headH:10.75, nutAF:27, nutH:17.1, washOD:37, washT:3.5, minorD:13.835, threadL:38 },
  "M20": { d:20, pitch:2.50, headAF:32, headH:13.4,  nutAF:32, nutH:20.7, washOD:44, washT:4.0, minorD:16.933, threadL:46 },
  "M24": { d:24, pitch:3.00, headAF:41, headH:15.9,  nutAF:41, nutH:24.2, washOD:50, washT:4.5, minorD:20.752, threadL:54 },
  "M27": { d:27, pitch:3.00, headAF:46, headH:17.9,  nutAF:46, nutH:27.6, washOD:56, washT:4.5, minorD:23.752, threadL:60 },
  "M30": { d:30, pitch:3.50, headAF:50, headH:19.75, nutAF:50, nutH:30.7, washOD:62, washT:5.0, minorD:26.211, threadL:66 },
  "M36": { d:36, pitch:4.00, headAF:60, headH:23.55, nutAF:60, nutH:36.6, washOD:72, washT:5.0, minorD:31.670, threadL:78 },
};
// Legacy compat aliases — older code paths (3D builder, selection highlights) still use
// b.head / b.nut / b.p, so keep these in sync with the canonical fields.
Object.values(BOLT_DB).forEach(b => { b.head = b.headAF; b.nut = b.nutAF; b.p = b.pitch; });

// Merge UC + WB sections into UB_DB: both have I-section geometry identical to
// UB so all UB_DB[...] lookups and the drawUB() renderer work transparently
// for UC and WB members. The library panel keeps each as its own group via
// UC_DB / WB_DB.
Object.assign(UB_DB, UC_DB);
Object.assign(UB_DB, WB_DB);

// Standard bolt length increments (AS 1252) — mm
const BOLT_LENGTHS = [
  30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100,
  110, 120, 130, 140, 150, 160, 170, 180, 190, 200,
  220, 240, 260, 280, 300, 320, 340, 360, 380, 400
];

// AS 1100 dash patterns, per drafter §3.7. Units are screen-pixels at the
// setLineDash call site (canvas uses current transform; with default zoom the
// values are ~sheet-mm already). Centralised here so the weld code, hidden
// lines, section cuts, and thread overlays all reference a single source of
// truth — change once, cascade everywhere.
const DASH = {
  SOLID:     [],                 // Continuous line (explicit reset)
  CL:        [8, 3, 2, 3],       // Centreline — long/gap/short/gap chain
  CL_BOLT:   [6, 2, 1.5, 2],     // Bolt centreline — tighter chain
  SECTION:   [12, 3, 3, 3],      // Section cut — heavy chain
  HIDDEN:    [5, 3],             // Hidden line — short dash
  THREAD:    [2, 2],             // Thread outline overlay
  SNAP:      [4, 4],             // UI snap / grip feedback (chrome only)
  UI_CHAIN:  [6, 4, 2, 4],       // Drawing-frame overlay chain
  UI_ALT:    [6, 4],             // Secondary UI chain
  UI_ROT:    [3, 3],             // Rotation preview arc
};

// AS 1100 sheet-mm lineweight hierarchy, per Bligh Tanner drafter §3.6.
// All values are the intended ink width on the physical sheet. The render
// pipeline multiplies by ppm() to convert to screen pixels; the PDF path runs
// with ppm()=1 so these numbers land directly on jsPDF.setLineWidth(mm).
const LW = {
  CUT:       1.20,  // Section cut through solid material
  VIS_HEAVY: 0.70,  // Heavy visible — primary structural element outlines
  VIS:       0.65,  // Standard visible lines
  MW:        0.50,  // Medium-weight overlay — callout leaders, misc annotation
  DIM:       0.40,  // Dimensions, leaders, text
  HID:       0.30,  // Hidden lines (occluded content)
  CL:        0.30,  // Centrelines
  HATCH:     0.18,  // Cross-hatch infill (AS 1100 steel)
};

// Standard connection defaults, per Bligh Tanner drafter §9.x. These drive
// the parametric connection builders (V16) — change a value here and every
// cap plate / WSP / splice / baseplate the user creates next will reflect it.
// Values in mm unless noted.
const CONN_DEFAULTS = {
  // §9.2 Column cap plate — "STD_BOLT_COL_GAP + STD_CAP_AE" derives plate size
  CAP_BOLT_COL_GAP: 40,      // column face → bolt centreline
  CAP_AE:           35,      // bolt → plate edge
  CAP_PLATE_THK:    16,      // default cap plate thickness
  CAP_BOLT_SIZE:    'M20',
  CAP_BOLTS_X:      2,       // bolts across the X axis
  CAP_BOLTS_Z:      2,       // bolts across the Z axis
  CAP_WELD_SIZE:    6,       // fillet weld cap-to-column

  // §9.1 WSP — web side plate to UB web
  WSP_AE:           35,      // bolt → plate edge
  WSP_PITCH:        70,      // bolt pitch along plate
  WSP_EDGE_BEAM:    10,      // gap plate-end to beam end
  WSP_PLATE_THK:    10,
  WSP_BOLT_SIZE:    'M20',
  WSP_WELD_SIZE:    6,       // fillet weld plate-to-column

  // §9.3 UB moment splice — end-plate flange splice
  SPLICE_GAP:       10,      // mill tolerance gap between beam ends
  SPLICE_PLATE_THK: 20,      // end plate thickness
  SPLICE_BOLT_SIZE: 'M24',
  SPLICE_BOLTS:     6,       // bolt count (3 each side of web typically)
  SPLICE_EDGE:      40,      // bolt edge distance

  // §9.4 Column base plate — cast-in holding-down bolts
  BASE_OVERHANG:    50,      // plate edge beyond column face
  BASE_PLATE_THK:   25,
  BASE_BOLT_SIZE:   'M24',
  BASE_BOLTS_X:     2,
  BASE_BOLTS_Z:     2,
  BASE_WELD_SIZE:   8,
  BASE_HD_BOLT_LEN: 300,     // holding-down bolt cast-in length
};

