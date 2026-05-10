'use strict';

// V22.1 unified section profile helper
// Extracted from dev/index.html lines 6606-6665 (2026-05-02 modular split)

// V22.1 UNIFIED SECTION PROFILE HELPER
// ============================================================
// Returns an object { d, bf, tf, tw, r1, shape } for any structural member,
// regardless of type. Used by renderers / bounds / occlusion / hit-test so
// the new V22 types (pfc, rhs, chs, ea, ua) can share most infrastructure
// with UB / SHS.
//
// shape is one of:
//   'i'       — I-section (UB, UC, but also PFC rendered as narrow I in side
//                views; PFC's C profile only shows in true section views)
//   'c'       — C-section (PFC end view)
//   'box'     — hollow rectangle (SHS if d==bf, RHS otherwise)
//   'circle'  — CHS circular
//   'l'       — L-angle (EA, UA)
function sectionProfile(obj) {
  if (obj.type === 'ub') {
    const s = UB_DB[obj.section] || UC_DB[obj.section];
    if (!s) return null;
    return { d: s.d, bf: s.bf, tf: s.tf, tw: s.tw, r1: s.r1, shape: 'i' };
  }
  if (obj.type === 'shs') {
    const s = SHS_DB[obj.section];
    if (!s) return null;
    return { d: s.B, bf: s.B, t: s.t, shape: 'box' };
  }
  if (obj.type === 'pfc') {
    const s = PFC_DB[obj.section];
    if (!s) return null;
    return { d: s.d, bf: s.bf, tf: s.tf, tw: s.tw, r1: s.r1, shape: 'c' };
  }
  if (obj.type === 'rhs') {
    const s = RHS_DB[obj.section];
    if (!s) return null;
    return { d: s.d, bf: s.bf, t: s.t, shape: 'box' };
  }
  if (obj.type === 'chs') {
    const s = CHS_DB[obj.section];
    if (!s) return null;
    return { d: s.D, bf: s.D, t: s.t, D: s.D, shape: 'circle' };
  }
  if (obj.type === 'ea') {
    const s = EA_DB[obj.section];
    if (!s) return null;
    return { d: s.a, bf: s.a, t: s.t, r1: s.r1, a: s.a, b: s.a, shape: 'l' };
  }
  if (obj.type === 'ua') {
    const s = UA_DB[obj.section];
    if (!s) return null;
    return { d: s.a, bf: s.b, t: s.t, r1: s.r1, a: s.a, b: s.b, shape: 'l' };
  }
  return null;
}

// Check if a type is one of the "member" (3D beam-like) types.
function isMemberType(type) {
  return type === 'ub' || type === 'shs' || type === 'pfc'
      || type === 'rhs' || type === 'chs' || type === 'ea' || type === 'ua';
}

// ============================================================
