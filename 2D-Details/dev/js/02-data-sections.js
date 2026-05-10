'use strict';

// Steel section catalogues — UB / UC / SHS / PFC / RHS / CHS / EA / UA
// Extracted from dev/index.html lines 2829-3035 (2026-05-02 modular split)

// SECTION DATABASES
// ============================================================

const UB_DB = {
  "610UB 125":{ d:612, bf:229, tf:19.6, tw:11.9, r1:14.0 },
  "610UB 113":{ d:607, bf:228, tf:17.3, tw:11.2, r1:14.0 },
  "610UB 101":{ d:602, bf:228, tf:14.8, tw:10.6, r1:14.0 },
  "530UB 92.4":{ d:533, bf:209, tf:15.6, tw:10.2, r1:14.0 },
  "530UB 82.0":{ d:528, bf:209, tf:13.2, tw: 9.6, r1:14.0 },
  "460UB 82.1":{ d:460, bf:191, tf:16.0, tw: 9.9, r1:11.4 },
  "460UB 74.6":{ d:457, bf:190, tf:14.5, tw: 9.1, r1:11.4 },
  "460UB 67.1":{ d:454, bf:190, tf:12.7, tw: 8.5, r1:11.4 },
  "410UB 59.7":{ d:406, bf:178, tf:12.8, tw: 7.8, r1:11.4 },
  "410UB 53.7":{ d:403, bf:178, tf:10.9, tw: 7.6, r1:11.4 },
  "360UB 56.7":{ d:359, bf:172, tf:13.0, tw: 8.0, r1:11.4 },
  "360UB 50.7":{ d:356, bf:171, tf:11.5, tw: 7.3, r1:11.4 },
  "360UB 44.7":{ d:352, bf:171, tf: 9.7, tw: 6.9, r1:11.4 },
  "310UB 46.2":{ d:307, bf:166, tf:11.8, tw: 6.7, r1:11.4 },
  "310UB 40.4":{ d:304, bf:165, tf:10.2, tw: 6.1, r1:11.4 },
  "310UB 32.0":{ d:298, bf:149, tf: 8.0, tw: 5.5, r1:13.0 },
  "250UB 37.3":{ d:256, bf:146, tf:10.9, tw: 6.4, r1: 8.9 },
  "250UB 31.4":{ d:252, bf:146, tf: 8.6, tw: 6.1, r1: 8.9 },
  "250UB 25.7":{ d:248, bf:124, tf: 8.0, tw: 5.0, r1:12.0 },
  "200UB 29.8":{ d:207, bf:134, tf: 9.6, tw: 6.3, r1: 8.9 },
  "200UB 25.4":{ d:203, bf:133, tf: 7.8, tw: 5.8, r1: 8.9 },
  "200UB 22.3":{ d:202, bf:133, tf: 7.0, tw: 5.0, r1: 8.9 },
  "200UB 18.2":{ d:198, bf: 99, tf: 7.0, tw: 4.5, r1:11.0 },
  "180UB 22.2":{ d:179, bf: 90, tf:10.0, tw: 6.0, r1: 8.9 },
  "180UB 18.1":{ d:175, bf: 90, tf: 8.0, tw: 5.0, r1: 8.9 },
  "180UB 16.1":{ d:173, bf: 90, tf: 7.0, tw: 4.5, r1: 8.9 },
  "150UB 18.0":{ d:155, bf: 75, tf: 9.5, tw: 6.0, r1: 8.0 },
  "150UB 14.0":{ d:150, bf: 75, tf: 7.0, tw: 5.0, r1: 8.0 },
};

// AS/NZS 3679.2 Welded Beams — fabricated I-sections (typical heavy spans).
// Geometry is the same I-shape as UB/UC so they share the drawUB() renderer.
// r1 = 0 because welded sections have no rolled fillet; the flange-to-web
// transition is a fillet weld (drawn separately via the auto-weld layer).
// Source: AISC Design Capacity Tables Vol 1, Table 3.1-1(A), pp. 3-6.
const WB_DB = {
  "1200WB455": { d:1200, bf:500, tf:40.0, tw:16.0, r1:0 },
  "1200WB423": { d:1192, bf:500, tf:36.0, tw:16.0, r1:0 },
  "1200WB392": { d:1184, bf:500, tf:32.0, tw:16.0, r1:0 },
  "1200WB342": { d:1194, bf:400, tf:32.0, tw:16.0, r1:0 },
  "1200WB317": { d:1176, bf:400, tf:28.0, tw:16.0, r1:0 },
  "1200WB278": { d:1170, bf:350, tf:25.0, tw:16.0, r1:0 },
  "1200WB249": { d:1170, bf:275, tf:25.0, tw:16.0, r1:0 },
  "1000WB322": { d:1024, bf:400, tf:32.0, tw:16.0, r1:0 },
  "1000WB296": { d:1016, bf:400, tf:28.0, tw:16.0, r1:0 },
  "1000WB258": { d:1010, bf:350, tf:25.0, tw:16.0, r1:0 },
  "1000WB215": { d:1000, bf:300, tf:20.0, tw:16.0, r1:0 },
  "900WB282":  { d: 924, bf:400, tf:32.0, tw:12.0, r1:0 },
  "900WB257":  { d: 916, bf:400, tf:28.0, tw:12.0, r1:0 },
  "900WB218":  { d: 910, bf:350, tf:25.0, tw:12.0, r1:0 },
  "900WB175":  { d: 900, bf:300, tf:20.0, tw:12.0, r1:0 },
  "800WB192":  { d: 816, bf:300, tf:28.0, tw:10.0, r1:0 },
  "800WB168":  { d: 808, bf:300, tf:24.0, tw:10.0, r1:0 },
  "800WB146":  { d: 800, bf:275, tf:20.0, tw:10.0, r1:0 },
  "800WB122":  { d: 792, bf:275, tf:16.0, tw:10.0, r1:0 },
  "700WB173":  { d: 716, bf:275, tf:28.0, tw:10.0, r1:0 },
  "700WB150":  { d: 710, bf:275, tf:25.0, tw:10.0, r1:0 },
  "700WB130":  { d: 700, bf:275, tf:20.0, tw:10.0, r1:0 },
  "700WB115":  { d: 692, bf:250, tf:16.0, tw:10.0, r1:0 },
};

// AS/NZS 3679.1 Universal Columns — UC geometry identical to UB (I-section)
// so they share the drawUB() renderer. Keyed separately so the library can
// list them under "Columns" and labels can use the correct UC designation.
const UC_DB = {
  "310UC 158":{ d:327, bf:311, tf:25.0, tw:15.7, r1:16.5 },
  "310UC 137":{ d:321, bf:309, tf:21.7, tw:13.8, r1:16.5 },
  "310UC 118":{ d:315, bf:307, tf:18.7, tw:11.9, r1:16.5 },
  "310UC 96.8":{ d:308, bf:305, tf:15.4, tw: 9.9, r1:16.5 },
  "250UC 89.5":{ d:260, bf:256, tf:17.3, tw:10.5, r1:14.0 },
  "250UC 72.9":{ d:254, bf:254, tf:14.2, tw: 8.6, r1:14.0 },
  "200UC 59.5":{ d:210, bf:205, tf:14.2, tw: 9.3, r1:11.4 },
  "200UC 52.2":{ d:206, bf:204, tf:12.5, tw: 8.0, r1:11.4 },
  "200UC 46.2":{ d:203, bf:203, tf:11.0, tw: 7.3, r1:11.4 },
  "150UC 37.2":{ d:162, bf:154, tf:11.5, tw: 8.1, r1: 8.9 },
  "150UC 30.0":{ d:158, bf:153, tf: 9.4, tw: 6.6, r1: 8.9 },
  "150UC 23.4":{ d:152, bf:152, tf: 6.8, tw: 6.1, r1: 8.9 },
  "100UC 14.8":{ d:100, bf:100, tf: 7.0, tw: 5.0, r1: 6.5 },
};

// V22.1 cleanup — the original stub PFC / EA / UA databases (short keys like
// "380PFC" and "200x200x26") were superseded by the drafter-style catalogue
// below ("380PFC 55.2" / "EA200x200x26" / "UA150x100x12"). Both copies were
// left in place by a half-finished migration and collided as duplicate `const`
// declarations, preventing the page from loading. The authoritative V22.1
// databases are now the single source — see a few screenfuls down.

const SHS_DB = {
  "89x3.5":{ B:89, t:3.5 }, "89x5":{ B:89, t:5.0 }, "89x6":{ B:89, t:6.0 },
  "100x4":{ B:100, t:4.0 }, "100x5":{ B:100, t:5.0 }, "100x6":{ B:100, t:6.0 },
  "100x8":{ B:100, t:8.0 }, "100x9":{ B:100, t:9.0 }, "100x10":{ B:100, t:10.0 },
  "125x4":{ B:125, t:4.0 }, "125x5":{ B:125, t:5.0 }, "125x6":{ B:125, t:6.0 },
  "125x8":{ B:125, t:8.0 }, "125x9":{ B:125, t:9.0 }, "125x10":{ B:125, t:10.0 },
  "150x5":{ B:150, t:5.0 }, "150x6":{ B:150, t:6.0 }, "150x8":{ B:150, t:8.0 },
  "150x9":{ B:150, t:9.0 }, "150x10":{ B:150, t:10.0 },
  "200x5":{ B:200, t:5.0 }, "200x6":{ B:200, t:6.0 }, "200x8":{ B:200, t:8.0 },
  "200x9":{ B:200, t:9.0 }, "200x10":{ B:200, t:10.0 }, "200x12.5":{ B:200, t:12.5 },
  "200x16":{ B:200, t:16.0 },
  "250x5":{ B:250, t:5.0 }, "250x6":{ B:250, t:6.0 }, "250x8":{ B:250, t:8.0 },
  "250x9":{ B:250, t:9.0 }, "250x10":{ B:250, t:10.0 }, "250x12.5":{ B:250, t:12.5 },
  "250x16":{ B:250, t:16.0 },
};

// ============================================================
// V22.1 SECTION DATABASES — PFC / RHS / CHS / EA / UA
// ============================================================
// AS/NZS 3679.1 (hot-rolled) and AS 1163 (hollow sections).
// Properties keyed by the drafter-style section name ("380PFC 55.2").
// Field conventions:
//   d       depth / long side (mm)
//   bf      flange width / short side (mm) — for symmetric sections
//   tf      flange thickness (mm)
//   tw      web thickness (mm) — PFC only
//   r1      root fillet radius (mm)
//   t       wall thickness (mm, hollow sections and angles)
//   D       outside diameter (mm) — CHS
//   a, b    leg lengths (mm) — angles (a = longer leg)

// AS/NZS 3679.1 Parallel Flange Channels (PFC)
// Source: AISC Design Capacity Tables Vol 1, Table 3.1-7(A), p. 3-18.
const PFC_DB = {
  "380PFC 55.2": { d: 380, bf: 100, tf: 17.5, tw: 10.0, r1: 14.0 },
  "300PFC 40.1": { d: 300, bf:  90, tf: 16.0, tw:  8.0, r1: 14.0 },
  "250PFC 35.5": { d: 250, bf:  90, tf: 15.0, tw:  8.0, r1: 12.0 },
  "230PFC 25.1": { d: 230, bf:  75, tf: 12.0, tw:  6.5, r1: 12.0 },
  "200PFC 22.9": { d: 200, bf:  75, tf: 12.0, tw:  6.0, r1: 12.0 },
  "180PFC 20.9": { d: 180, bf:  75, tf: 11.0, tw:  6.0, r1: 12.0 },
  "150PFC 17.7": { d: 150, bf:  75, tf:  9.5, tw:  6.0, r1: 10.0 },
  "125PFC 11.9": { d: 125, bf:  65, tf:  8.0, tw:  4.7, r1:  8.0 },
  "100PFC 8.33": { d: 100, bf:  50, tf:  6.7, tw:  4.2, r1:  8.0 },
  "75PFC 5.92":  { d:  75, bf:  40, tf:  6.1, tw:  3.8, r1:  8.0 },
};

// AS 1163 Rectangular Hollow Sections (RHS). B along depth, bf along width.
// Grade C350L0 / C450L0 standard.
const RHS_DB = {
  "150x100x9":    { d: 150, bf: 100, t: 9.0 },
  "150x100x6":    { d: 150, bf: 100, t: 6.0 },
  "150x100x5":    { d: 150, bf: 100, t: 5.0 },
  "150x100x4":    { d: 150, bf: 100, t: 4.0 },
  "125x75x6":     { d: 125, bf:  75, t: 6.0 },
  "125x75x5":     { d: 125, bf:  75, t: 5.0 },
  "100x50x5":     { d: 100, bf:  50, t: 5.0 },
  "100x50x4":     { d: 100, bf:  50, t: 4.0 },
  "100x50x3":     { d: 100, bf:  50, t: 3.0 },
  "75x50x4":      { d:  75, bf:  50, t: 4.0 },
  "75x50x3":      { d:  75, bf:  50, t: 3.0 },
  "75x25x2.5":    { d:  75, bf:  25, t: 2.5 },
  "50x25x3":      { d:  50, bf:  25, t: 3.0 },
  "50x25x2":      { d:  50, bf:  25, t: 2.0 },
};

// AS 1163 Circular Hollow Sections (CHS). D = outside diameter.
const CHS_DB = {
  "219.1x12.7":   { D: 219.1, t: 12.7 },
  "219.1x8.2":    { D: 219.1, t:  8.2 },
  "168.3x11":     { D: 168.3, t: 11.0 },
  "168.3x7.1":    { D: 168.3, t:  7.1 },
  "139.7x10":     { D: 139.7, t: 10.0 },
  "139.7x5.4":    { D: 139.7, t:  5.4 },
  "114.3x9.5":    { D: 114.3, t:  9.5 },
  "114.3x6.0":    { D: 114.3, t:  6.0 },
  "101.6x6.3":    { D: 101.6, t:  6.3 },
  "101.6x4.0":    { D: 101.6, t:  4.0 },
  "88.9x5.9":     { D:  88.9, t:  5.9 },
  "76.1x5.9":     { D:  76.1, t:  5.9 },
  "76.1x3.6":     { D:  76.1, t:  3.6 },
  "60.3x5.4":     { D:  60.3, t:  5.4 },
  "60.3x3.6":     { D:  60.3, t:  3.6 },
  "48.3x5.4":     { D:  48.3, t:  5.4 },
  "48.3x4.0":     { D:  48.3, t:  4.0 },
  "42.4x4.9":     { D:  42.4, t:  4.9 },
  "33.7x4.0":     { D:  33.7, t:  4.0 },
};

// AS/NZS 3679.1 Equal Angles (EA). a = leg, t = thickness, r1 = root radius.
// Source: AISC Design Capacity Tables Vol 1, Tables 3.1-9(A)-1 and 3.1-9(A)-2.
const EA_DB = {
  "EA200x200x26": { a: 200, t: 26, r1: 18 },
  "EA200x200x20": { a: 200, t: 20, r1: 18 },
  "EA200x200x18": { a: 200, t: 18, r1: 18 },
  "EA200x200x16": { a: 200, t: 16, r1: 18 },
  "EA200x200x13": { a: 200, t: 13, r1: 18 },
  "EA150x150x19": { a: 150, t: 19, r1: 13 },
  "EA150x150x16": { a: 150, t: 16, r1: 13 },
  "EA150x150x12": { a: 150, t: 12, r1: 13 },
  "EA150x150x10": { a: 150, t: 10, r1: 13 },
  "EA125x125x16": { a: 125, t: 16, r1: 11 },
  "EA125x125x12": { a: 125, t: 12, r1: 11 },
  "EA125x125x10": { a: 125, t: 10, r1: 11 },
  "EA125x125x8":  { a: 125, t:  8, r1: 11 },
  "EA100x100x12": { a: 100, t: 12, r1: 10 },
  "EA100x100x10": { a: 100, t: 10, r1: 10 },
  "EA100x100x8":  { a: 100, t:  8, r1: 10 },
  "EA100x100x6":  { a: 100, t:  6, r1: 10 },
  "EA90x90x10":   { a:  90, t: 10, r1:  9 },
  "EA90x90x8":    { a:  90, t:  8, r1:  9 },
  "EA90x90x6":    { a:  90, t:  6, r1:  9 },
  "EA75x75x10":   { a:  75, t: 10, r1:  7 },
  "EA75x75x8":    { a:  75, t:  8, r1:  7 },
  "EA75x75x6":    { a:  75, t:  6, r1:  7 },
  "EA75x75x5":    { a:  75, t:  5, r1:  7 },
  "EA65x65x10":   { a:  65, t: 10, r1:  6 },
  "EA65x65x8":    { a:  65, t:  8, r1:  6 },
  "EA65x65x6":    { a:  65, t:  6, r1:  6 },
  "EA65x65x5":    { a:  65, t:  5, r1:  6 },
  "EA55x55x6":    { a:  55, t:  6, r1:  6 },
  "EA55x55x5":    { a:  55, t:  5, r1:  6 },
  "EA50x50x8":    { a:  50, t:  8, r1:  5 },
  "EA50x50x6":    { a:  50, t:  6, r1:  5 },
  "EA50x50x5":    { a:  50, t:  5, r1:  5 },
  "EA50x50x3":    { a:  50, t:  3, r1:  5 },
  "EA45x45x6":    { a:  45, t:  6, r1:  5 },
  "EA45x45x5":    { a:  45, t:  5, r1:  5 },
  "EA45x45x3":    { a:  45, t:  3, r1:  5 },
  "EA40x40x6":    { a:  40, t:  6, r1:  5 },
  "EA40x40x5":    { a:  40, t:  5, r1:  5 },
  "EA40x40x3":    { a:  40, t:  3, r1:  5 },
};

// AS/NZS 3679.1 Unequal Angles (UA). a = long leg, b = short leg.
// Source: AISC Design Capacity Tables Vol 1, Table 3.1-10(A).
const UA_DB = {
  "UA150x100x12": { a: 150, b: 100, t: 12, r1: 13 },
  "UA150x100x10": { a: 150, b: 100, t: 10, r1: 13 },
  "UA150x90x16":  { a: 150, b:  90, t: 16, r1: 13 },
  "UA150x90x12":  { a: 150, b:  90, t: 12, r1: 13 },
  "UA150x90x10":  { a: 150, b:  90, t: 10, r1: 13 },
  "UA150x90x8":   { a: 150, b:  90, t:  8, r1: 13 },
  "UA125x75x12":  { a: 125, b:  75, t: 12, r1: 11 },
  "UA125x75x10":  { a: 125, b:  75, t: 10, r1: 11 },
  "UA125x75x8":   { a: 125, b:  75, t:  8, r1: 11 },
  "UA125x75x6":   { a: 125, b:  75, t:  6, r1: 11 },
  "UA100x75x10":  { a: 100, b:  75, t: 10, r1: 10 },
  "UA100x75x8":   { a: 100, b:  75, t:  8, r1: 10 },
  "UA100x75x6":   { a: 100, b:  75, t:  6, r1: 10 },
  "UA75x50x8":    { a:  75, b:  50, t:  8, r1:  7 },
  "UA75x50x6":    { a:  75, b:  50, t:  6, r1:  7 },
  "UA75x50x5":    { a:  75, b:  50, t:  5, r1:  7 },
  "UA65x50x8":    { a:  65, b:  50, t:  8, r1:  6 },
  "UA65x50x6":    { a:  65, b:  50, t:  6, r1:  6 },
  "UA65x50x5":    { a:  65, b:  50, t:  5, r1:  6 },
};
