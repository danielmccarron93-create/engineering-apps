'use strict';

// DXF export (V19, AutoCAD R2013 ASCII)
// Extracted from dev/index.html lines 5381-6175 (2026-05-02 modular split)

// DXF EXPORT (V19, AutoCAD R2013 ASCII)
// ============================================================
// Walks entities2D and objects3D (projected per view) and emits a
// minimal-but-complete DXF file. The reader on the other end (AutoCAD,
// BricsCAD, ProSteel, DraftSight, etc.) gets:
//   - LAYERS table — S-BEAM, S-BOLT, S-DIM, S-HIDDEN, S-CL, S-TEXT, S-WELD,
//     S-DETAIL, S-REVISION, S-NOTE
//   - LTYPE table — CONTINUOUS, HIDDEN, CENTER, DASHDOT
//   - ENTITIES — LINE, LWPOLYLINE, CIRCLE, ARC, MTEXT, plus DIMENSION-like
//     composites (we emit explicit geometry rather than associative
//     DIMENSION entities because the target is universal compatibility)
//
// Coordinate system: DXF Y is UP (matches our real-world coords), mm units.
// Each of the four views is placed on the sheet at its block anchor —
// output is a 1:1 sheet-mm drawing so it drops straight into an A1 layout.
//
// This is the universal bridge: once a fabricator can open these details in
// AutoCAD, StructDraw graduates from a drawing simulator to a production tool.

const _DXF_LAYERS = [
  // name        colour(1-7)  ltype        lineweight(0.01mm)
  ['0',           7, 'CONTINUOUS', 25],
  ['S-BEAM',      7, 'CONTINUOUS', 70],  // VIS_HEAVY
  ['S-PLATE',     7, 'CONTINUOUS', 65],
  ['S-BOLT',      1, 'CONTINUOUS', 50],
  ['S-CUT',       1, 'CONTINUOUS', 120], // CUT
  ['S-HIDDEN',    8, 'HIDDEN',     30],
  ['S-CL',        6, 'CENTER',     30],
  ['S-DIM',       2, 'CONTINUOUS', 40],
  ['S-TEXT',      7, 'CONTINUOUS', 25],
  ['S-WELD',      3, 'CONTINUOUS', 50],
  ['S-DETAIL',    7, 'CONTINUOUS', 70],
  ['S-REVISION',  1, 'CONTINUOUS', 50],
  ['S-NOTE',      7, 'CONTINUOUS', 25],
];

function _dxfEscape(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\P');
}

// Fluent DXF builder. Accumulates group-code / value pairs; call .toString()
// at the end to get the file content.
function _dxfBuilder() {
  const lines = [];
  function pair(code, v) { lines.push(String(code)); lines.push(String(v)); }
  let handle = 0x100;
  function nextHandle() { return (handle++).toString(16).toUpperCase(); }

  const api = {
    pair, nextHandle,
    section(name) { pair(0, 'SECTION'); pair(2, name); return api; },
    endSection()  { pair(0, 'ENDSEC'); return api; },
    table(name, count) {
      pair(0, 'TABLE'); pair(2, name); pair(70, count); return api;
    },
    endTable() { pair(0, 'ENDTAB'); return api; },
    eof() { pair(0, 'EOF'); },
    toString() { return lines.join('\n') + '\n'; },
  };
  return api;
}

function _dxfHeader(b) {
  b.section('HEADER');
  b.pair(9, '$ACADVER'); b.pair(1, 'AC1027');   // AutoCAD 2013
  b.pair(9, '$INSUNITS'); b.pair(70, 4);        // 4 = millimetres
  b.pair(9, '$EXTMIN'); b.pair(10, 0); b.pair(20, 0); b.pair(30, 0);
  b.pair(9, '$EXTMAX'); b.pair(10, SHEET.W); b.pair(20, SHEET.H); b.pair(30, 0);
  b.endSection();
}

function _dxfTables(b) {
  b.section('TABLES');

  // Linetype table
  b.table('LTYPE', 4);
  const writeLtype = (name, pattern) => {
    b.pair(0, 'LTYPE'); b.pair(5, b.nextHandle()); b.pair(100, 'AcDbSymbolTableRecord');
    b.pair(100, 'AcDbLinetypeTableRecord');
    b.pair(2, name); b.pair(70, 0); b.pair(3, name); b.pair(72, 65);
    b.pair(73, pattern.length); b.pair(40, pattern.reduce((s, p) => s + Math.abs(p), 0));
    for (const p of pattern) b.pair(49, p);
  };
  writeLtype('CONTINUOUS', [0]);
  writeLtype('HIDDEN',   [5, -3]);
  writeLtype('CENTER',   [8, -3, 2, -3]);
  writeLtype('DASHDOT',  [12, -3, 3, -3]);
  b.endTable();

  // Layer table
  b.table('LAYER', _DXF_LAYERS.length);
  for (const [name, color, ltype, lw] of _DXF_LAYERS) {
    b.pair(0, 'LAYER'); b.pair(5, b.nextHandle());
    b.pair(100, 'AcDbSymbolTableRecord'); b.pair(100, 'AcDbLayerTableRecord');
    b.pair(2, name); b.pair(70, 0); b.pair(62, color);
    b.pair(6, ltype); b.pair(370, lw);
  }
  b.endTable();

  b.endSection();
}

// ---- Entity emitters ----
function _dxfLine(b, layer, x1, y1, x2, y2) {
  b.pair(0, 'LINE'); b.pair(5, b.nextHandle());
  b.pair(100, 'AcDbEntity'); b.pair(8, layer);
  b.pair(100, 'AcDbLine');
  b.pair(10, x1); b.pair(20, y1); b.pair(30, 0);
  b.pair(11, x2); b.pair(21, y2); b.pair(31, 0);
}

function _dxfCircle(b, layer, cx, cy, r) {
  b.pair(0, 'CIRCLE'); b.pair(5, b.nextHandle());
  b.pair(100, 'AcDbEntity'); b.pair(8, layer);
  b.pair(100, 'AcDbCircle');
  b.pair(10, cx); b.pair(20, cy); b.pair(30, 0); b.pair(40, r);
}

function _dxfText(b, layer, x, y, text, height) {
  b.pair(0, 'MTEXT'); b.pair(5, b.nextHandle());
  b.pair(100, 'AcDbEntity'); b.pair(8, layer);
  b.pair(100, 'AcDbMText');
  b.pair(10, x); b.pair(20, y); b.pair(30, 0);
  b.pair(40, height || 2.5);
  b.pair(1, _dxfEscape(text));
  b.pair(50, 0);    // rotation
  b.pair(71, 7);    // attach point: bottom-left
}

function _dxfPolyline(b, layer, pts, closed) {
  b.pair(0, 'LWPOLYLINE'); b.pair(5, b.nextHandle());
  b.pair(100, 'AcDbEntity'); b.pair(8, layer);
  b.pair(100, 'AcDbPolyline');
  b.pair(90, pts.length); b.pair(70, closed ? 1 : 0);
  for (const [x, y] of pts) { b.pair(10, x); b.pair(20, y); }
}

// Project a 3D object into (u,v) for a given view. Mirrors the render
// pipeline's view-key projection.
function _dxfProject(obj, viewKey) {
  if (viewKey === 'elevation') return { u: obj.x || 0, v: obj.y || 0 };
  if (viewKey === 'sectionA')  return { u: obj.z || 0, v: obj.y || 0 };
  if (viewKey === 'planB')     return { u: obj.x || 0, v: obj.z || 0 };
  return { u: 0, v: 0 };
}

// Transform view-local (u,v) to sheet-mm using the block anchor. Returns
// {x, y} in DXF coordinates (Y up).
function _dxfBlockPlace(blk, u, v) {
  // Block sheetX/sheetY are in sheet-mm; drawingScale divides real coords.
  // Y flip: sheet Y is down, DXF Y is up → reflect around sheet H.
  const sheetX = blk.sheetX + u / drawingScale;
  const sheetY = blk.sheetY - v / drawingScale; // sheet-mm, top-down
  // Convert to DXF (Y up, origin at bottom-left of A1)
  return { x: sheetX, y: SHEET.H - sheetY };
}

// Emit a single UB (or UC — same data shape) into DXF on the given view.
function _dxfEmitUB(b, blk, obj) {
  const s = UB_DB[obj.section] || (typeof UC_DB !== 'undefined' ? UC_DB[obj.section] : null);
  if (!s) return;
  const vk = blk.viewKey;
  const half = obj.length / 2;
  if (vk === 'elevation') {
    // Side view — outline rectangle with web/flange lines
    const cx = obj.x, cy = obj.y;
    const L = cx - half, R = cx + half;
    const T = cy + s.d / 2, B = cy - s.d / 2;
    const ftBot = T - s.tf, fbTop = B + s.tf;
    // Outer rectangle
    const p1 = _dxfBlockPlace(blk, L, T);
    const p2 = _dxfBlockPlace(blk, R, T);
    const p3 = _dxfBlockPlace(blk, R, B);
    const p4 = _dxfBlockPlace(blk, L, B);
    _dxfPolyline(b, 'S-BEAM', [[p1.x, p1.y], [p2.x, p2.y], [p3.x, p3.y], [p4.x, p4.y]], true);
    // Inner flange lines
    const i1 = _dxfBlockPlace(blk, L, ftBot), i2 = _dxfBlockPlace(blk, R, ftBot);
    _dxfLine(b, 'S-BEAM', i1.x, i1.y, i2.x, i2.y);
    const i3 = _dxfBlockPlace(blk, L, fbTop), i4 = _dxfBlockPlace(blk, R, fbTop);
    _dxfLine(b, 'S-BEAM', i3.x, i3.y, i4.x, i4.y);
    // Centreline
    const c1 = _dxfBlockPlace(blk, L - 10, cy), c2 = _dxfBlockPlace(blk, R + 10, cy);
    _dxfLine(b, 'S-CL', c1.x, c1.y, c2.x, c2.y);
  } else if (vk === 'sectionA' || vk === 'planB') {
    // Cross-section / plan — I-shape outline
    const c = _dxfProject(obj, vk);
    const hbf = s.bf / 2, hd = s.d / 2;
    const cx = c.u, cy = c.v;
    // I-shape polyline (12 points for a basic I without root fillets)
    const htw = s.tw / 2, tf = s.tf;
    const pts = [
      [-hbf, -hd], [hbf, -hd], [hbf, -hd + tf],
      [htw, -hd + tf], [htw, hd - tf],
      [hbf, hd - tf], [hbf, hd], [-hbf, hd],
      [-hbf, hd - tf], [-htw, hd - tf],
      [-htw, -hd + tf], [-hbf, -hd + tf],
    ].map(([du, dv]) => {
      const p = _dxfBlockPlace(blk, cx + du, cy + dv);
      return [p.x, p.y];
    });
    _dxfPolyline(b, 'S-BEAM', pts, true);
  }
}

function _dxfEmitSHS(b, blk, obj) {
  const s = SHS_DB[obj.section] || { B: 100, t: 5 };
  const vk = blk.viewKey;
  const side = s.B;
  const hs = side / 2;
  const c = _dxfProject(obj, vk);
  if (vk === 'elevation') {
    const half = obj.length / 2;
    const L = obj.x - half, R = obj.x + half;
    const T = obj.y + hs, B = obj.y - hs;
    const p1 = _dxfBlockPlace(blk, L, T);
    const p2 = _dxfBlockPlace(blk, R, T);
    const p3 = _dxfBlockPlace(blk, R, B);
    const p4 = _dxfBlockPlace(blk, L, B);
    _dxfPolyline(b, 'S-BEAM', [[p1.x, p1.y], [p2.x, p2.y], [p3.x, p3.y], [p4.x, p4.y]], true);
  } else {
    // Cross-section — hollow box
    const pts = [[-hs, -hs], [hs, -hs], [hs, hs], [-hs, hs]].map(([du, dv]) => {
      const p = _dxfBlockPlace(blk, c.u + du, c.v + dv);
      return [p.x, p.y];
    });
    _dxfPolyline(b, 'S-BEAM', pts, true);
    const wt = s.t;
    const pts2 = [[-hs+wt, -hs+wt], [hs-wt, -hs+wt], [hs-wt, hs-wt], [-hs+wt, hs-wt]].map(([du, dv]) => {
      const p = _dxfBlockPlace(blk, c.u + du, c.v + dv);
      return [p.x, p.y];
    });
    _dxfPolyline(b, 'S-BEAM', pts2, true);
  }
}

function _dxfEmitBolt(b, blk, obj) {
  const sz = BOLT_DB[obj.boltSize] || { d: 20, head: 30 };
  const vk = blk.viewKey;
  const c = _dxfProject(obj, vk);
  // Simple: circle at the bolt diameter + a head outline circle
  const p = _dxfBlockPlace(blk, c.u, c.v);
  _dxfCircle(b, 'S-BOLT', p.x, p.y, sz.d / 2);
  // Head hex approximation — emit as an octagon
  const headR = (sz.headAF || sz.head || sz.d * 1.5) / 2;
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    const pp = _dxfBlockPlace(blk, c.u + Math.cos(a) * headR, c.v + Math.sin(a) * headR);
    pts.push([pp.x, pp.y]);
  }
  _dxfPolyline(b, 'S-BOLT', pts, true);
}

function _dxfEmitPlate(b, blk, obj) {
  if (obj.polyPts) {
    // Polygon plate — project each vertex into the view
    const vk = blk.viewKey;
    const pts = obj.polyPts.map(p => {
      let du = 0, dv = 0;
      if (vk === 'elevation') { du = p.dx; dv = p.dy; }
      else if (vk === 'sectionA') { du = p.dz; dv = p.dy; }
      else if (vk === 'planB') { du = p.dx; dv = p.dz; }
      const c = _dxfProject(obj, vk);
      const q = _dxfBlockPlace(blk, c.u + du, c.v + dv);
      return [q.x, q.y];
    });
    if (pts.length >= 2) _dxfPolyline(b, 'S-PLATE', pts, true);
  } else {
    // Rectangular plate — simple bounds
    const vk = blk.viewKey;
    const c = _dxfProject(obj, vk);
    const hw = (obj.pw || 200) / 2, hh = (obj.ph || 300) / 2;
    const pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([du, dv]) => {
      const p = _dxfBlockPlace(blk, c.u + du, c.v + dv);
      return [p.x, p.y];
    });
    _dxfPolyline(b, 'S-PLATE', pts, true);
  }
}

// V22.1 — Generic member emitter for PFC / RHS / CHS / EA / UA.
// Writes the member's per-view bounding rectangle on S-BEAM. Full
// section-specific geometry (arcs, C-profile, L-profile) is planned for
// a V22.1b follow-on; this keeps DXF export functional for new types now.
function _dxfEmitGenericMember(b, blk, obj) {
  const p = sectionProfile(obj); if (!p) return;
  const vk = blk.viewKey;
  const hl = (obj.length || 0) / 2;
  const hd = (p.d || 0) / 2, hbf = (p.bf || 0) / 2;
  let u1, v1, u2, v2;
  if (vk === 'elevation')      { u1 = obj.x - hl; u2 = obj.x + hl; v1 = obj.y - hd;  v2 = obj.y + hd; }
  else if (vk === 'sectionA')  { u1 = obj.z - hbf; u2 = obj.z + hbf; v1 = obj.y - hd;  v2 = obj.y + hd; }
  else                         { u1 = obj.x - hl; u2 = obj.x + hl; v1 = obj.z - hbf; v2 = obj.z + hbf; }
  const c1 = _dxfBlockPlace(blk, u1, v1);
  const c2 = _dxfBlockPlace(blk, u2, v1);
  const c3 = _dxfBlockPlace(blk, u2, v2);
  const c4 = _dxfBlockPlace(blk, u1, v2);
  _dxfPolyline(b, 'S-BEAM', [[c1.x, c1.y], [c2.x, c2.y], [c3.x, c3.y], [c4.x, c4.y]], true);
  // Emit a centreline on S-CL along the member length for visual legibility.
  if (vk === 'elevation' || vk === 'planB') {
    const midV = (v1 + v2) / 2;
    const clA = _dxfBlockPlace(blk, u1, midV);
    const clB = _dxfBlockPlace(blk, u2, midV);
    _dxfLine(b, 'S-CL', clA.x, clA.y, clB.x, clB.y);
  }
}

// 2D entity → DXF
function _dxfEmit2DEntity(b, blk, ent) {
  if (ent.type === 'line') {
    const p1 = _dxfBlockPlace(blk, ent.u1, ent.v1);
    const p2 = _dxfBlockPlace(blk, ent.u2, ent.v2);
    _dxfLine(b, '0', p1.x, p1.y, p2.x, p2.y);
  } else if (ent.type === 'rect') {
    const p1 = _dxfBlockPlace(blk, ent.u, ent.v);
    const p2 = _dxfBlockPlace(blk, ent.u + ent.w, ent.v);
    const p3 = _dxfBlockPlace(blk, ent.u + ent.w, ent.v + ent.h);
    const p4 = _dxfBlockPlace(blk, ent.u, ent.v + ent.h);
    _dxfPolyline(b, '0', [[p1.x, p1.y], [p2.x, p2.y], [p3.x, p3.y], [p4.x, p4.y]], true);
  } else if (ent.type === 'circle') {
    const p = _dxfBlockPlace(blk, ent.cu, ent.cv);
    _dxfCircle(b, '0', p.x, p.y, ent.r);
  } else if (ent.type === 'text' || ent.type === 'materialTag' || ent.type === 'memberTag') {
    const p = _dxfBlockPlace(blk, ent.u, ent.v);
    let txt = ent.text || '';
    if (ent.type === 'memberTag' && ent.memberId !== undefined) {
      const m = objects3D.find(o => o.id === ent.memberId);
      if (m && m.section) txt = m.section;
    }
    _dxfText(b, ent.type === 'text' ? 'S-TEXT' : 'S-NOTE', p.x, p.y, txt, (ent.sz || 2.5));
  } else if (ent.type === 'centreline') {
    const p1 = _dxfBlockPlace(blk, ent.u1, ent.v1);
    const p2 = _dxfBlockPlace(blk, ent.u2, ent.v2);
    _dxfLine(b, 'S-CL', p1.x, p1.y, p2.x, p2.y);
  } else if (ent.type === 'slot') {
    // Approximate: two arcs + two tangent lines → emit as a polyline
    // with 16-point stadium approximation
    const r = ent.dia / 2;
    const cap = (ent.length - ent.dia) / 2;
    const a = ent.angle || 0;
    const cos = Math.cos(a), sin = Math.sin(a);
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const th = Math.PI / 2 + i * Math.PI / 8;
      pts.push([Math.cos(th) * r - cap, Math.sin(th) * r]);
    }
    for (let i = 0; i <= 8; i++) {
      const th = -Math.PI / 2 + i * Math.PI / 8;
      pts.push([Math.cos(th) * r + cap, Math.sin(th) * r]);
    }
    const world = pts.map(([du, dv]) => {
      const ru = ent.u + du * cos - dv * sin;
      const rv = ent.v + du * sin + dv * cos;
      const p = _dxfBlockPlace(blk, ru, rv);
      return [p.x, p.y];
    });
    _dxfPolyline(b, 'S-PLATE', world, true);
  } else if (ent.type === 'dim') {
    // Simplified dim → emit as line + text
    if (ent.dimType === 'chain' || ent.dimType === 'baseline') {
      const stops = ent.stops || [];
      const baselineV = ent.v || 0;
      for (let i = 1; i < stops.length; i++) {
        const u1 = ent.dimType === 'baseline' ? stops[0] : stops[i - 1];
        const u2 = stops[i];
        const dimV = baselineV + (ent.off || 20) + (ent.dimType === 'baseline' ? (i - 1) * 10 : 0);
        const a = _dxfBlockPlace(blk, u1, dimV);
        const c = _dxfBlockPlace(blk, u2, dimV);
        _dxfLine(b, 'S-DIM', a.x, a.y, c.x, c.y);
        const mid = _dxfBlockPlace(blk, (u1 + u2) / 2, dimV);
        _dxfText(b, 'S-DIM', mid.x, mid.y + 2, Math.round(Math.abs(u2 - u1)).toString(), 2.5);
      }
    } else {
      // Horizontal / aligned / vertical — emit the baseline dim line + text
      const p1 = _dxfBlockPlace(blk, ent.p1u || 0, ent.p1v || 0);
      const p2 = _dxfBlockPlace(blk, ent.p2u || 0, ent.p2v || 0);
      _dxfLine(b, 'S-DIM', p1.x, p1.y, p2.x, p2.y);
      const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      const dist = Math.abs((ent.p2u || 0) - (ent.p1u || 0));
      _dxfText(b, 'S-DIM', mid.x, mid.y + 2, Math.round(dist).toString(), 2.5);
    }
  } else if (ent.type === 'weld') {
    // Emit as a leader line with text describing the weld
    const p = _dxfBlockPlace(blk, ent.u, ent.v);
    const elbowU = ent.u + Math.cos(ent.angle || 0) * 12;
    const elbowV = ent.v + Math.sin(ent.angle || 0) * 12;
    const el = _dxfBlockPlace(blk, elbowU, elbowV);
    _dxfLine(b, 'S-WELD', p.x, p.y, el.x, el.y);
    const end = _dxfBlockPlace(blk, elbowU + 20, elbowV);
    _dxfLine(b, 'S-WELD', el.x, el.y, end.x, end.y);
    let txt = `${ent.size || 6} ${ent.weldType || 'fillet'}`;
    if (ent.siteWeld) txt += ' SITE';
    if (ent.allAround) txt += ' AR';
    if (ent.tail) txt += ` (${ent.tail})`;
    _dxfText(b, 'S-WELD', el.x + 10, el.y + 1, txt, 2);
  } else if (ent.type === 'sectionMark') {
    const p1 = _dxfBlockPlace(blk, ent.u1, ent.v1);
    const p2 = _dxfBlockPlace(blk, ent.u2, ent.v2);
    _dxfLine(b, 'S-CUT', p1.x, p1.y, p2.x, p2.y);
    if (ent.label) _dxfText(b, 'S-CUT', p1.x, p1.y + 4, ent.label, 4);
  } else if (ent.type === 'detailRef') {
    // Circle + sheet/detail text
    const p = _dxfBlockPlace(blk, ent.u, ent.v);
    _dxfCircle(b, 'S-NOTE', p.x, p.y, 10);
    _dxfText(b, 'S-NOTE', p.x - 6, p.y - 1, `${ent.detail || '?'}/${ent.sheet || ''}`, 2.5);
  } else if (ent.type === 'revisionTriangle') {
    // Triangle with rev number
    const p = _dxfBlockPlace(blk, ent.u, ent.v);
    const r = 6;
    const tri = [];
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + i * 2 * Math.PI / 3;
      tri.push([p.x + Math.cos(a) * r, p.y + Math.sin(a) * r]);
    }
    _dxfPolyline(b, 'S-REVISION', tri, true);
    _dxfText(b, 'S-REVISION', p.x - 1.5, p.y - 1.5, String(ent.rev || 1), 3);
  } else if (ent.type === 'revisionCloud') {
    // Emit each arc segment as a polyline approximation
    const pts = ent.pts || [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b2 = pts[(i + 1) % pts.length];
      const pa = _dxfBlockPlace(blk, a.u, a.v);
      const pb = _dxfBlockPlace(blk, b2.u, b2.v);
      _dxfLine(b, 'S-REVISION', pa.x, pa.y, pb.x, pb.y);
    }
  } else if (ent.type === 'breakline') {
    // Simple fallback — straight line; V20 can enrich
    const p1 = _dxfBlockPlace(blk, ent.u1, ent.v1);
    const p2 = _dxfBlockPlace(blk, ent.u2, ent.v2);
    _dxfLine(b, '0', p1.x, p1.y, p2.x, p2.y);
  } else if (ent.type === 'bolt2') {
    // 2D-mode bolt (V25). Mirrors drawBolt2D's grip-centred layout so the DXF
    // matches the canvas. boltOrient: 'end' → washer ring + hole circle + hex
    // head; section orientations → shank rect, chamfered hex head/nut, washers,
    // thread sawtooth, dashed centreline. All on the S-BOLT layer.
    const bd = (typeof BOLT_DB !== 'undefined' && BOLT_DB[ent.size]) ||
               (typeof BOLT_DB !== 'undefined' && BOLT_DB.M20) ||
               { d: 20, headAF: 30, headH: 13, nutAF: 30, nutH: 16, washOD: 37, washT: 3, minorD: 17.29, threadL: 46, pitch: 2.5 };
    const place = (u, v) => { const p = _dxfBlockPlace(blk, u, v); return [p.x, p.y]; };
    const polyDxf = (pts, closed) => _dxfPolyline(b, 'S-BOLT', pts, closed);
    const lineDxf = (u1, v1, u2, v2) => { const a = place(u1, v1), c = place(u2, v2); _dxfLine(b, 'S-BOLT', a[0], a[1], c[0], c[1]); };
    // Chamfered hex side profile along a given axis (mirrors hexPointsAlongU/V
    // in js/33). 'outer' edge chamfered, 'inner' (washer-side) flat.
    const hexAlongU = (cv, outerU, innerU, halfAF) => {
      const span = outerU - innerU, dir = Math.sign(span) || 1, abs = Math.abs(span);
      const ch = Math.min(abs * 0.25, halfAF * 0.3), chS = ch * dir;
      return [
        [innerU, cv - halfAF], [outerU - chS, cv - halfAF], [outerU, cv - halfAF + ch],
        [outerU, cv + halfAF - ch], [outerU - chS, cv + halfAF], [innerU, cv + halfAF],
      ].map(([u, v]) => place(u, v));
    };
    const hexAlongV = (cu, outerV, innerV, halfAF) => {
      const span = outerV - innerV, dir = Math.sign(span) || 1, abs = Math.abs(span);
      const ch = Math.min(abs * 0.25, halfAF * 0.3), chS = ch * dir;
      return [
        [cu - halfAF, innerV], [cu - halfAF, outerV - chS], [cu - halfAF + ch, outerV],
        [cu + halfAF - ch, outerV], [cu + halfAF, outerV - chS], [cu + halfAF, innerV],
      ].map(([u, v]) => place(u, v));
    };

    if (ent.boltOrient === 'end') {
      // End-on: washer ring + bolt hole circle + hex head outline.
      const ctr = _dxfBlockPlace(blk, ent.u, ent.v);
      _dxfCircle(b, 'S-BOLT', ctr.x, ctr.y, bd.d / 2);
      if (bd.washOD) _dxfCircle(b, 'S-BOLT', ctr.x, ctr.y, bd.washOD / 2);
      const headR = (bd.headAF || bd.d * 1.5) / 2, headPts = [];
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        headPts.push(place(ent.u + Math.cos(a) * headR, ent.v + Math.sin(a) * headR));
      }
      polyDxf(headPts, true);
    } else {
      const span = (typeof v25BoltClampSpan === 'function') ? v25BoltClampSpan(blk, ent) : null;
      const orient = ent.boltOrient || 'h-nutR';
      const isV = (orient === 'v-nutB' || orient === 'v-nutT');
      const grip = (span && span.grip) || 20;
      const centre = (span && span.centre != null) ? span.centre : (isV ? ent.v : ent.u);
      const length = (span && span.length) || (typeof computeBoltLength === 'function' ? computeBoltLength(grip, ent.size) : grip + 50);
      const hG = grip / 2;
      const halfD = bd.d / 2, halfMin = (bd.minorD || bd.d * 0.85) / 2;
      const halfAFh = bd.headAF / 2, halfAFn = bd.nutAF / 2, halfWO = (bd.washOD || bd.d * 1.8) / 2;
      const washT = bd.washT || 3, headH = bd.headH || bd.d * 0.65, nutH = bd.nutH || bd.d * 0.8;
      const threadProt = Math.max(2 * (bd.pitch || 2.5), length - (grip + 2 * washT + nutH));

      if (!isV) {
        // Horizontal section — bolt axis along u, transverse v = ent.v.
        const cy = ent.v;
        const gripL = (orient === 'h-nutR') ? centre - hG : centre + hG; // head side
        const gripR = (orient === 'h-nutR') ? centre + hG : centre - hG; // nut side
        const dirHead = (orient === 'h-nutR') ? -1 : 1; // head extends this way
        const washHeadL = gripL + dirHead * washT;
        const headOuter = washHeadL + dirHead * headH;
        const washNutR = gripR - dirHead * washT;
        const nutOuter = washNutR - dirHead * nutH;
        const threadTip = nutOuter - dirHead * threadProt;
        const shankA = washHeadL, shankB = threadTip;
        // Shank rectangle
        polyDxf([place(shankA, cy - halfD), place(shankB, cy - halfD), place(shankB, cy + halfD), place(shankA, cy + halfD)], true);
        // Thread sawtooth at the nut/protrusion end (minor-diameter zigzag)
        {
          const tStart = nutOuter, tEnd = threadTip, p = bd.pitch || 2.5;
          const lo = Math.min(tStart, tEnd), hi = Math.max(tStart, tEnd), spanT = hi - lo;
          if (spanT > 0.1) {
            const n = Math.max(1, Math.floor(spanT / p));
            for (let i = 0; i <= n; i++) {
              const u = lo + (spanT * i / n), hv = (i % 2 === 0) ? halfMin : halfD;
              lineDxf(u, cy - hv, u, cy + hv);
            }
          }
        }
        // Washers (thin rects spanning washOD)
        polyDxf([place(gripL, cy - halfWO), place(washHeadL, cy - halfWO), place(washHeadL, cy + halfWO), place(gripL, cy + halfWO)], true);
        polyDxf([place(gripR, cy - halfWO), place(washNutR, cy - halfWO), place(washNutR, cy + halfWO), place(gripR, cy + halfWO)], true);
        // Chamfered hex head + nut
        polyDxf(hexAlongU(cy, headOuter, washHeadL, halfAFh), true);
        polyDxf(hexAlongU(cy, nutOuter, washNutR, halfAFn), true);
        // Dashed centreline (DASHDOT proxy via S-CL layer linetype)
        lineDxf(headOuter - dirHead * 4, cy, threadTip + dirHead * 4, cy);
      } else {
        // Vertical section — bolt axis along v, transverse u = ent.u.
        const cx = ent.u;
        const gripL = (orient === 'v-nutB') ? centre + hG : centre - hG; // head side
        const gripR = (orient === 'v-nutB') ? centre - hG : centre + hG; // nut side
        const dirHead = (orient === 'v-nutB') ? 1 : -1; // head extends this way (v up = +)
        const washHeadL = gripL + dirHead * washT;
        const headOuter = washHeadL + dirHead * headH;
        const washNutR = gripR - dirHead * washT;
        const nutOuter = washNutR - dirHead * nutH;
        const threadTip = nutOuter - dirHead * threadProt;
        const shankA = washHeadL, shankB = threadTip;
        // Shank rectangle
        polyDxf([place(cx - halfD, shankA), place(cx + halfD, shankA), place(cx + halfD, shankB), place(cx - halfD, shankB)], true);
        // Thread sawtooth
        {
          const tStart = nutOuter, tEnd = threadTip, p = bd.pitch || 2.5;
          const lo = Math.min(tStart, tEnd), hi = Math.max(tStart, tEnd), spanT = hi - lo;
          if (spanT > 0.1) {
            const n = Math.max(1, Math.floor(spanT / p));
            for (let i = 0; i <= n; i++) {
              const v = lo + (spanT * i / n), hu = (i % 2 === 0) ? halfMin : halfD;
              lineDxf(cx - hu, v, cx + hu, v);
            }
          }
        }
        // Washers
        polyDxf([place(cx - halfWO, gripL), place(cx - halfWO, washHeadL), place(cx + halfWO, washHeadL), place(cx + halfWO, gripL)], true);
        polyDxf([place(cx - halfWO, gripR), place(cx - halfWO, washNutR), place(cx + halfWO, washNutR), place(cx + halfWO, gripR)], true);
        // Chamfered hex head + nut
        polyDxf(hexAlongV(cx, headOuter, washHeadL, halfAFh), true);
        polyDxf(hexAlongV(cx, nutOuter, washNutR, halfAFn), true);
        // Dashed centreline
        lineDxf(cx, headOuter + dirHead * 4, cx, threadTip - dirHead * 4);
      }
    }
  } else if (ent.type === 'screw') {
    // 2D-mode HBS timber screw (V25). Mirrors drawScrew2D's to-scale side profile
    // so the DXF matches the canvas: head (pan + collar + taper), shank, threaded
    // sawtooth, pointed tip, dashed centreline. End-on → head + clearance + shank
    // circles + Torx cross. All on the S-BOLT (fasteners) layer.
    const S = (typeof getScrewSpec === 'function' && getScrewSpec(ent.screwSpec))
            || (typeof HBS_PLATE_SCREWS === 'object' && HBS_PLATE_SCREWS[ent.screwSpec])
            || { d: 10, d2: 6.6, dS: 7.2, dK: 16.5, t1: 16.5, tK: 5.0, L: 120, b: 95, dV_steel: 13 };
    const place = (u, v) => { const p = _dxfBlockPlace(blk, u, v); return [p.x, p.y]; };
    const polyDxf = (pts, closed) => _dxfPolyline(b, 'S-BOLT', pts, closed);
    const lineDxf = (u1, v1, u2, v2) => { const a = place(u1, v1), c = place(u2, v2); _dxfLine(b, 'S-BOLT', a[0], a[1], c[0], c[1]); };
    const orient = ent.screwOrient || 'end';

    if (orient === 'end') {
      const ctr = _dxfBlockPlace(blk, ent.u, ent.v);
      _dxfCircle(b, 'S-BOLT', ctr.x, ctr.y, (S.dK || 16.5) / 2);
      if (S.dV_steel && Math.abs(S.dV_steel - (S.dK || 16.5)) > 0.5) _dxfCircle(b, 'S-BOLT', ctr.x, ctr.y, S.dV_steel / 2);
      _dxfCircle(b, 'S-BOLT', ctr.x, ctr.y, (S.d || 10) / 2);
      const r = (S.dK || 16.5) / 2 * 0.45, c45 = Math.SQRT1_2;
      lineDxf(ent.u - r * c45, ent.v - r * c45, ent.u + r * c45, ent.v + r * c45);
      lineDxf(ent.u - r * c45, ent.v + r * c45, ent.u + r * c45, ent.v - r * c45);
    } else {
      const horiz = (orient === 'h-headL' || orient === 'h-headR');
      const axisIsU = horiz;
      const trans = axisIsU ? ent.v : ent.u;
      const bodyDir = (orient === 'h-headL' || orient === 'v-headB') ? 1 : -1;
      const bearing = (typeof v25ScrewBearingFace === 'function') ? v25ScrewBearingFace(blk, ent) : null;
      const junction = (bearing != null) ? bearing : (axisIsU ? ent.u : ent.v);
      const d = S.d || 10, d2 = S.d2 || d * 0.74, dS = S.dS || d * 0.79, dK = S.dK || d * 1.85;
      const t1 = S.t1 || d * 1.6, tK = S.tK || d * 0.55, L = S.L || d * 12, bThr = S.b || L * 0.78;
      const dKh = dK / 2, dSh = dS / 2, d2h = d2 / 2, dh = d / 2;
      const capLen = Math.min(t1 * 0.5, Math.max(tK, dK * 0.30));
      const sThread = Math.max(t1, L - bThr);
      const tipLen = Math.min((L - sThread) * 0.6 + 0.001, Math.max(d * 1.2, 4));
      const sTipStart = Math.max(sThread, L - tipLen);
      const axisAt = (s) => junction + bodyDir * (s - t1);
      const P = axisIsU ? (s, t) => place(axisAt(s), trans + t)
                        : (s, t) => place(trans + t, axisAt(s));
      // Body (shank + thread core + pointed tip)
      polyDxf([P(t1, dSh), P(sThread, dSh), P(sTipStart, d2h), P(L, 0), P(sTipStart, -d2h), P(sThread, -dSh), P(t1, -dSh)], true);
      // Head (pan + collar + under-head taper)
      polyDxf([P(0, dKh), P(capLen, dKh), P(t1, dSh), P(t1, -dSh), P(capLen, -dKh), P(0, -dKh)], true);
      // Thread sawtooth (alternating crest/root transverse lines)
      {
        const p = Math.max(1.2, d * 0.42), spanT = sTipStart - sThread;
        if (spanT > 0.5) {
          const n = Math.max(1, Math.floor(spanT / p));
          for (let i = 0; i <= n; i++) {
            const s = sThread + spanT * i / n, hv = (i % 2 === 0) ? d2h : dh, a = axisAt(s);
            if (axisIsU) lineDxf(a, trans - hv, a, trans + hv);
            else lineDxf(trans - hv, a, trans + hv, a);
          }
        }
      }
      // Centreline
      const a0 = axisAt(0), aL = axisAt(L);
      if (axisIsU) lineDxf(Math.min(a0, aL) - 4, trans, Math.max(a0, aL) + 4, trans);
      else lineDxf(trans, Math.min(a0, aL) - 4, trans, Math.max(a0, aL) + 4);
    }
  } else if (ent.type === 'stiff2') {
    // plate-grouping-stiffener — web stiffener plate: outline rectangle (two
    // endpoints + thickness) + weld ticks per long edge on S-WELD.
    const thk = (typeof ent.thk === 'number' && ent.thk) ? ent.thk : 10;
    const ax = (ent.uTop || 0) - (ent.uBot || 0), av = (ent.vTop || 0) - (ent.vBot || 0);
    const len = Math.hypot(ax, av) || 1;
    const ppx = -av / len, ppy = ax / len, hh = thk / 2;
    const corners = [
      [ent.uBot - ppx * hh, ent.vBot - ppy * hh],
      [ent.uBot + ppx * hh, ent.vBot + ppy * hh],
      [ent.uTop + ppx * hh, ent.vTop + ppy * hh],
      [ent.uTop - ppx * hh, ent.vTop - ppy * hh],
    ].map(([u, v]) => { const p = _dxfBlockPlace(blk, u, v); return [p.x, p.y]; });
    _dxfPolyline(b, 'S-STEEL', corners, true);
    if (ent.weld !== 'none') {
      const tickN = Math.max(3, Math.floor(len / 30));
      for (const pair of [[0, 3], [1, 2]]) {
        for (let k = 0; k <= tickN; k++) {
          const t = k / tickN;
          const ex = corners[pair[0]][0] + (corners[pair[1]][0] - corners[pair[0]][0]) * t;
          const ey = corners[pair[0]][1] + (corners[pair[1]][1] - corners[pair[0]][1]) * t;
          _dxfLine(b, 'S-WELD', ex, ey, ex + (pair[0] === 0 ? -2 : 2), ey + 1);
        }
      }
    }
  } else if (ent.type === 'jweld') {
    // plate-grouping-stiffener — plate to flange joint weld: fillet ticks
    // along the contact line on S-WELD.
    const a = _dxfBlockPlace(blk, ent.u1, ent.v1);
    const c = _dxfBlockPlace(blk, ent.u2, ent.v2);
    _dxfLine(b, 'S-WELD', a.x, a.y, c.x, c.y);
    const segs = Math.max(3, Math.floor(Math.hypot(c.x - a.x, c.y - a.y) / 6));
    for (let k = 0; k <= segs; k++) {
      const t = k / segs;
      const ex = a.x + (c.x - a.x) * t, ey = a.y + (c.y - a.y) * t;
      _dxfLine(b, 'S-WELD', ex, ey, ex - 1.5, ey + 3);
    }
  } else if (ent.type === 'blockWall') {
    // Blockwork wall — outline + coursing, mirroring drawBlockWall2D so the
    // DXF coursing matches the canvas. Section strip emits a rotated strip;
    // elevation emits the running-bond rectangle. Break edges/ends → zigzag.
    const cat = (typeof V25_BLOCK_DB !== 'undefined' && V25_BLOCK_DB[ent.blockKey])
              || { thk: 190, h: 190, l: 390, perp: 10, bed: 10 };
    const LAY = 'S-MASONRY';
    const place = (u, v) => { const p = _dxfBlockPlace(blk, u, v); return [p.x, p.y]; };
    const courseH = (cat.h || 190) + (cat.bed || 10);
    const blockL = (cat.l || 390) + (cat.perp || 10);
    const lineDxf = (p1, p2) => _dxfLine(b, LAY, p1[0], p1[1], p2[0], p2[1]);
    const zigDxf = (p1, p2) => {
      const dx = p2[0] - p1[0], dy = p2[1] - p1[1], len = Math.hypot(dx, dy);
      if (len < 1) { lineDxf(p1, p2); return; }
      const nx = -dy / len, ny = dx / len, amp = len * 0.08, s1 = 0.35, s2 = 0.65, n = 3;
      const pts = [[p1[0], p1[1]], [p1[0] + dx * s1, p1[1] + dy * s1]];
      for (let i = 0; i < n; i++) {
        const t = s1 + (s2 - s1) * (i + 0.5) / n, sg = (i % 2 === 0) ? 1 : -1;
        pts.push([p1[0] + dx * t + nx * amp * sg, p1[1] + dy * t + ny * amp * sg]);
      }
      pts.push([p1[0] + dx * s2, p1[1] + dy * s2], [p2[0], p2[1]]);
      _dxfPolyline(b, LAY, pts, false);
    };
    if (ent.wallMode === 'sec') {
      const L = ent.lengthMM || 0, thk = cat.thk || 190, half = thk / 2;
      const shellT = Math.min(35, Math.max(25, thk * 0.18));
      const rot = (ent.rot || 0) * Math.PI / 180, cosR = Math.cos(rot), sinR = Math.sin(rot);
      const W = (lu, lv) => place(ent.u + lu * cosR - lv * sinR, ent.v + lu * sinR + lv * cosR);
      lineDxf(W(0, -half), W(L, -half));
      lineDxf(W(0, half), W(L, half));
      lineDxf(W(0, -half + shellT), W(L, -half + shellT));
      lineDxf(W(0, half - shellT), W(L, half - shellT));
      for (let lu = courseH; lu < L - 0.5; lu += courseH) lineDxf(W(lu, -half), W(lu, half));
      const eb = ent.endBreak || 'start';
      const capAt = (lu, brk) => { if (brk) zigDxf(W(lu, -half), W(lu, half)); else lineDxf(W(lu, -half), W(lu, half)); };
      capAt(0, eb === 'start' || eb === 'both');
      capAt(L, eb === 'end' || eb === 'both');
    } else {
      const w = ent.lengthMM || 0, h = ent.heightMM || 0;
      const be = ent.breakEdges || {};
      const edge = (brk, ua, va, ub, vb) => { const p = place(ua, va), q = place(ub, vb); if (brk) zigDxf(p, q); else lineDxf(p, q); };
      edge(be.bottom, ent.u, ent.v, ent.u + w, ent.v);
      edge(be.top, ent.u, ent.v + h, ent.u + w, ent.v + h);
      edge(be.left, ent.u, ent.v, ent.u, ent.v + h);
      edge(be.right, ent.u + w, ent.v, ent.u + w, ent.v + h);
      const fromTop = (!be.top) || be.bottom;     // datum prefers top, else bottom
      const fromLeft = (!be.left) || be.right;    // datum prefers left, else right
      if (fromTop) {
        for (let y = ent.v + h - courseH; y > ent.v + 0.5; y -= courseH) lineDxf(place(ent.u, y), place(ent.u + w, y));
      } else {
        for (let y = ent.v + courseH; y < ent.v + h - 0.5; y += courseH) lineDxf(place(ent.u, y), place(ent.u + w, y));
      }
      const perpsForBand = (yLo, yHi, ci) => {
        const half = (ci % 2 === 0) ? 0 : blockL / 2;
        if (fromLeft) {
          for (let x = ent.u + (half > 0 ? half : blockL); x < ent.u + w - 0.5; x += blockL) lineDxf(place(x, yLo), place(x, yHi));
        } else {
          for (let x = ent.u + w - (half > 0 ? half : blockL); x > ent.u + 0.5; x -= blockL) lineDxf(place(x, yLo), place(x, yHi));
        }
      };
      if (fromTop) {
        let ci = 0;
        for (let yHi = ent.v + h; yHi > ent.v + 0.5; yHi -= courseH) { perpsForBand(Math.max(yHi - courseH, ent.v), yHi, ci); ci++; }
      } else {
        let ci = 0;
        for (let yLo = ent.v; yLo < ent.v + h - 0.5; yLo += courseH) { perpsForBand(yLo, Math.min(yLo + courseH, ent.v + h), ci); ci++; }
      }
    }
  } else if (ent.type === 'noteBox') {
    if (typeof nbDxfEmit === 'function') nbDxfEmit(b, blk, ent);
  } else if (ent.type === 'mem2') {
    // member-depth-order (72h) — 2D members were previously absent from DXF.
    // Emit the outer outline on S-BEAM; the span behind any member pushed in
    // front of it goes on S-HIDDEN (HIDDEN linetype).
    if (typeof v25Mem2WorldOutline === 'function') {
      const oc = v25Mem2WorldOutline(ent);
      if (oc && oc.length >= 2) {
        const selfPoly = oc.map(p => ({ u: p[0], v: p[1] }));
        const occ = (typeof v25DepthOccludersFor === 'function')
          ? v25DepthOccludersFor(blk.viewKey, ent.id, (typeof ent.z === 'number' ? ent.z : 0), selfPoly) : [];
        for (let i = 0; i < oc.length; i++) {
          const a = oc[i], c = oc[(i + 1) % oc.length];
          _dxfEmitOccludedEdge(b, blk, a[0], a[1], c[0], c[1], occ, 'S-BEAM');
        }
      }
    }
  }
}

// member-depth-order (72h) — emit one outline edge split into solid (on
// `solidLayer`) and AS 1100 hidden (on S-HIDDEN, HIDDEN linetype) sub-segments
// wherever a member pushed in front covers it. Shares v25DepthClipWorldSeg with
// the canvas so DXF and screen agree.
function _dxfEmitOccludedEdge(b, blk, u1, v1, u2, v2, occ, solidLayer) {
  const segs = (occ && occ.length && typeof v25DepthClipWorldSeg === 'function')
    ? v25DepthClipWorldSeg(u1, v1, u2, v2, occ)
    : [{ u1: u1, v1: v1, u2: u2, v2: v2, occluded: false }];
  for (const s of segs) {
    const p1 = _dxfBlockPlace(blk, s.u1, s.v1);
    const p2 = _dxfBlockPlace(blk, s.u2, s.v2);
    _dxfLine(b, s.occluded ? 'S-HIDDEN' : solidLayer, p1.x, p1.y, p2.x, p2.y);
  }
}

// member-depth-order (72h) — v2 plates live in v2.appState.model (not
// entities2D) and were previously absent from DXF. Emit each plate belonging to
// this view: outline on S-PLATE, covered spans on S-HIDDEN.
function _dxfEmitV2Plates(b, blk) {
  const model = (typeof v2 === 'object' && v2 && v2.appState && v2.appState.model) ? v2.appState.model : null;
  if (!model || !model.elements || typeof model.elements.forEach !== 'function') return;
  model.elements.forEach(function (el) {
    if (!el || el.category !== 'plate') return;
    const g = el.geometry;
    if (!g || !Array.isArray(g.polygon) || g.polygon.length < 3) return;
    const m = /^v1-view-(.+)$/.exec(typeof g.viewId === 'string' ? g.viewId : '');
    if (!m || m[1] !== blk.viewKey) return;
    const pts = g.polygon.map(function (p) { return { u: (+p.x || 0), v: (+p.y || 0) }; });
    const z = (el.params && typeof el.params.z === 'number') ? el.params.z : 0;
    const occ = (typeof v25DepthOccludersFor === 'function')
      ? v25DepthOccludersFor(blk.viewKey, el.id, z, pts) : [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], c = pts[(i + 1) % pts.length];
      _dxfEmitOccludedEdge(b, blk, a.u, a.v, c.u, c.v, occ, 'S-PLATE');
    }
  });
}

// Main entry
function exportSheetToDXF() {
  // V23.1 — uncommitted wizard previews should never leak into DXF exports.
  if (connWizState) connWizCancel();
  try {
    const b = _dxfBuilder();
    _dxfHeader(b);
    _dxfTables(b);
    b.section('BLOCKS'); b.endSection();
    b.section('ENTITIES');

    // Sheet frame (on layer 0)
    const ml = SHEET.ML, mr = SHEET.MR, mt = SHEET.MT, mb = SHEET.MB;
    const L = ml, R = SHEET.W - mr, B = mb + SHEET.TB_H, T = SHEET.H - mt;
    // Outer sheet border
    _dxfPolyline(b, '0', [
      [0, 0], [SHEET.W, 0], [SHEET.W, SHEET.H], [0, SHEET.H],
    ], true);
    // Drawing area frame
    _dxfPolyline(b, '0', [
      [L, B - SHEET.TB_H], [R, B - SHEET.TB_H], [R, T], [L, T],
    ], true);
    // Title block separator
    _dxfLine(b, '0', L, B, R, B);

    // 3D objects projected into each view
    for (const blk of blocks) {
      if (blk.hidden) continue;
      if (blk.viewKey === 'isometric') continue; // raster-only view, skip
      for (const obj of objects3D) {
        if (obj.type === 'ub') _dxfEmitUB(b, blk, obj);
        else if (obj.type === 'shs') _dxfEmitSHS(b, blk, obj);
        else if (obj.type === 'bolt') _dxfEmitBolt(b, blk, obj);
        else if (obj.type === 'plate') _dxfEmitPlate(b, blk, obj);
        // V22.1 — emit new member types as bounding-box polylines on S-BEAM.
        // Full section-specific DXF entities (arcs for CHS, C-profile for PFC)
        // are planned for V22.1b.
        else if (isMemberType(obj.type)) _dxfEmitGenericMember(b, blk, obj);
      }
    }

    // 2D entities per view
    for (const blk of blocks) {
      if (blk.hidden) continue;
      if (blk.viewKey === 'isometric') continue;
      const list = entities2D[blk.viewKey] || [];
      for (const ent of list) _dxfEmit2DEntity(b, blk, ent);
      _dxfEmitV2Plates(b, blk);   // member-depth-order (72h) — v2 plates to DXF
    }

    b.endSection();
    b.eof();

    const blob = new Blob([b.toString()], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const fname = `${sheetInfo.drawingNo || 'detail'}_Rev${sheetInfo.revision || 'A'}.dxf`
      .replace(/[^a-z0-9._-]/gi, '_');
    a.href = url; a.download = fname;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error('DXF export failed:', e);
    alert('DXF export failed: ' + e.message);
  }
}

// V17 paper-grain texture — one-time offscreen canvas, alpha-multiplied over
// the sheet when sketchGrain is on. 200×200 px tile wraps.
let _paperGrainTile = null;
function _paperGrain() {
  if (_paperGrainTile) return _paperGrainTile;
  const size = 200;
  const off = document.createElement('canvas');
  off.width = size; off.height = size;
  const g = off.getContext('2d');
  const img = g.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    // Light neutral noise — subtle warm paper tone
    const n = 230 + Math.floor(Math.random() * 25);
    img.data[i] = n;
    img.data[i + 1] = n - 4;
    img.data[i + 2] = n - 12;
    img.data[i + 3] = Math.floor(Math.random() * 40); // low alpha
  }
  g.putImageData(img, 0, 0);
  _paperGrainTile = off;
  return off;
}

function drawSheet(cs) {
  const tl = s2px(0, 0);
  const br = s2px(SHEET.W, SHEET.H);
  const sw = br.x - tl.x, sh = br.y - tl.y;

  // V25 — Shadow tuned to design's quieter "borders-first" aesthetic:
  // softer blur (24), no horizontal offset, smaller vertical drop. Color
  // read from the per-theme --sheet-shadow token so warm themes get a
  // warm graphite shadow and dark themes a deeper one. Falls back to the
  // pre-V25 hardcoded value if the token isn't defined.
  const shadowColor =
    (cs.getPropertyValue('--sheet-shadow').trim()) || 'rgba(0,0,0,0.15)';
  ctx.save();
  ctx.shadowColor   = shadowColor;
  ctx.shadowBlur    = 24;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = cs.getPropertyValue('--sheet-bg').trim();
  ctx.fillRect(tl.x, tl.y, sw, sh);
  ctx.restore();

  // V17 paper grain — subtle noise overlay (opt-in via command palette).
  // V25 — extended to warm-light/warm-dark since both have a paper sheet.
  const body = document.body;
  const isPaperTheme = body.classList.contains('theme-classic')
                    || body.classList.contains('theme-warm-light')
                    || body.classList.contains('theme-warm-dark');
  if (sketchGrain && isPaperTheme && !pdfExportMode) {
    const tile = _paperGrain();
    const tileSize = 200;
    ctx.save();
    ctx.globalAlpha = 0.45;
    // Tile across the sheet
    for (let y = tl.y; y < tl.y + sh; y += tileSize) {
      for (let x = tl.x; x < tl.x + sw; x += tileSize) {
        ctx.drawImage(tile, x, y);
      }
    }
    ctx.restore();
  }

  // Border
  ctx.strokeStyle = cs.getPropertyValue('--sheet-border').trim();
  ctx.lineWidth = 1;
  ctx.strokeRect(tl.x, tl.y, sw, sh);
}

function drawSheetGrid(cs) {
  const minor = gridSize / drawingScale; // grid in sheet-mm
  const major = minor * 10;

  // Only draw if grid cells are visible enough
  if (sheetLen(minor) < 4) return;

  const sh_tl = px2s(0, 0);
  const sh_br = px2s(W, H);
  const left = Math.max(DA.left, sh_tl.x), right = Math.min(DA.right, sh_br.x);
  const top = Math.max(DA.top, sh_tl.y), bot = Math.min(DA.bottom, sh_br.y);

  // Minor grid
  ctx.strokeStyle = cs.getPropertyValue('--grid-minor').trim();
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  for (let sx = Math.ceil(left / minor) * minor; sx <= right; sx += minor) {
    const p1 = s2px(sx, top), p2 = s2px(sx, bot);
    ctx.moveTo(Math.round(p1.x) + 0.5, p1.y);
    ctx.lineTo(Math.round(p2.x) + 0.5, p2.y);
  }
  for (let sy = Math.ceil(top / minor) * minor; sy <= bot; sy += minor) {
    const p1 = s2px(left, sy), p2 = s2px(right, sy);
    ctx.moveTo(p1.x, Math.round(p1.y) + 0.5);
    ctx.lineTo(p2.x, Math.round(p2.y) + 0.5);
  }
  ctx.stroke();

  // Major grid
  if (sheetLen(major) >= 20) {
    ctx.strokeStyle = cs.getPropertyValue('--grid-major').trim();
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let sx = Math.ceil(left / major) * major; sx <= right; sx += major) {
      const p1 = s2px(sx, top), p2 = s2px(sx, bot);
      ctx.moveTo(Math.round(p1.x) + 0.5, p1.y);
      ctx.lineTo(Math.round(p2.x) + 0.5, p2.y);
    }
    for (let sy = Math.ceil(top / major) * major; sy <= bot; sy += major) {
      const p1 = s2px(left, sy), p2 = s2px(right, sy);
      ctx.moveTo(p1.x, Math.round(p1.y) + 0.5);
      ctx.lineTo(p2.x, Math.round(p2.y) + 0.5);
    }
    ctx.stroke();
  }
}

function drawDrawingFrame(cs) {
  const tl = s2px(SHEET.ML, SHEET.MT);
  const br = s2px(SHEET.W - SHEET.MR, SHEET.H - SHEET.MB);
  const col = cs.getPropertyValue('--ink').trim();

  // Outer frame
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);

  // --- V25 Title block: "Workshop ledger" pattern (4-column grid) ---
  // Project | Drawing | Issue | Sheet
  // Each column has a serif-italic head, mono-caps labels, sans values.
  // The Sheet column is special: the drawing-number is the hero (28 px serif),
  // with a mono "Rev X · N of M" line below.
  const inkCol     = cs.getPropertyValue('--ink').trim();
  const muteCol    = cs.getPropertyValue('--mute').trim();
  const subtleCol  = cs.getPropertyValue('--text-subtle').trim() || muteCol;
  const accentCol  = cs.getPropertyValue('--accent').trim();
  const borderCol  = cs.getPropertyValue('--sheet-border').trim() || col;
  const fontSans   = cs.getPropertyValue('--font-sans').trim()  || 'system-ui';
  const fontMono   = cs.getPropertyValue('--font-mono').trim()  || 'monospace';
  const fontSerif  = cs.getPropertyValue('--font-serif').trim() || 'serif';

  const tbY  = SHEET.H - SHEET.MB - SHEET.TB_H;     // top of title block (sheet mm)
  const tbL  = SHEET.ML, tbR = SHEET.W - SHEET.MR;
  const tbB  = SHEET.H - SHEET.MB;
  const tlTB = s2px(tbL, tbY);
  const brTB = s2px(tbR, tbB);
  const tbWmm = tbR - tbL;

  // Top separator line — hairline using the sheet border colour
  ctx.strokeStyle = borderCol;
  ctx.lineWidth = 1.0;
  ctx.beginPath();
  ctx.moveTo(tlTB.x, tlTB.y);
  ctx.lineTo(brTB.x, tlTB.y);
  ctx.stroke();

  // 4-column proportional split — matches design's grid 1.1fr 1.3fr 1fr 0.8fr
  const fr = [1.1, 1.3, 1.0, 0.8];
  const frTotal = fr.reduce((a,b)=>a+b, 0);
  const colXs = [];   // sheet-mm x of each column-left edge
  let acc = tbL;
  fr.forEach(f => { colXs.push(acc); acc += tbWmm * (f / frTotal); });
  colXs.push(tbR);    // sentinel right-edge for boundary math

  // Vertical column dividers
  ctx.strokeStyle = borderCol;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  for (let i = 1; i < 4; i++) {
    const dp = s2px(colXs[i], tbY);
    ctx.moveTo(dp.x, tlTB.y);
    ctx.lineTo(dp.x, brTB.y);
  }
  ctx.stroke();

  // Per-column drawing helper. Renders a serif-italic head, then a list of
  // [label, value] rows with mono-caps labels (left ~22mm) + sans values.
  const drawCol = (colX, colW, head, rows) => {
    const padL = 4, padT = 2.6;       // sheet-mm padding
    const headFs = Math.max(7,  sheetLen(3.0));
    const lblFs  = Math.max(5,  sheetLen(1.8));
    const valFs  = Math.max(6,  sheetLen(2.4));

    // Column head — serif italic, subtle
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = muteCol;
    ctx.font = `italic 500 ${headFs}px ${fontSerif}`;
    const hp = s2px(colX + padL, tbY + padT);
    ctx.fillText(head, hp.x, hp.y);

    // Hairline under the head
    const hlY = tbY + padT + 4.5;
    ctx.strokeStyle = borderCol;
    ctx.lineWidth = 0.4;
    const hl1 = s2px(colX + padL, hlY);
    const hl2 = s2px(colX + colW - 2, hlY);
    ctx.beginPath(); ctx.moveTo(hl1.x, hl1.y); ctx.lineTo(hl2.x, hl2.y); ctx.stroke();

    // Rows
    const rowStartY = hlY + 2.5;
    const rowH      = (SHEET.TB_H - (rowStartY - tbY) - 2) / Math.max(rows.length, 1);
    const lblColW   = Math.min(13, colW * 0.32);   // sheet-mm

    rows.forEach(([lbl, val], i) => {
      const ry = rowStartY + i * rowH;
      // Label (mono caps, subtle)
      ctx.font = `500 ${lblFs}px ${fontMono}`;
      ctx.fillStyle = subtleCol;
      const lp = s2px(colX + padL, ry);
      ctx.fillText((lbl || '').toUpperCase(), lp.x, lp.y);
      // Value (sans, ink)
      ctx.font = `500 ${valFs}px ${fontSans}`;
      ctx.fillStyle = inkCol;
      const vp = s2px(colX + padL + lblColW, ry);
      ctx.fillText(val || '—', vp.x, vp.y);
    });
  };

  // Column 1 — Project
  drawCol(colXs[0], colXs[1] - colXs[0], 'Project', [
    ['No.',    sheetInfo.project],
    ['Client', sheetInfo.client],
    ['Firm',   sheetInfo.firmName],
  ]);
  // Column 2 — Drawing
  drawCol(colXs[1], colXs[2] - colXs[1], 'Drawing', [
    ['Title',      sheetInfo.description],
    ['Discipline', 'Structural'],
    ['Scale',      '1:' + drawingScale + '  @ A1'],
  ]);
  // Column 3 — Issue
  drawCol(colXs[2], colXs[3] - colXs[2], 'Issue', [
    ['Drawn',   sheetInfo.designer || sheetInfo.drawnBy],
    ['Checked', sheetInfo.checker],
    ['Date',    sheetInfo.date],
  ]);

  // Column 4 — Sheet (special: serif-hero number + rev/sheetOf caption)
  {
    const colX = colXs[3], colW = colXs[4] - colXs[3];
    const padL = 5, padT = 2.6;
    const headFs    = Math.max(7,  sheetLen(3.0));
    const numberFs  = Math.max(14, sheetLen(8.5));   // serif hero
    const captionFs = Math.max(5,  sheetLen(2.0));

    // "Sheet" head
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = muteCol;
    ctx.font = `italic 500 ${headFs}px ${fontSerif}`;
    const hp = s2px(colX + padL, tbY + padT);
    ctx.fillText('Sheet', hp.x, hp.y);
    // Hairline under head
    const hlY = tbY + padT + 4.5;
    ctx.strokeStyle = borderCol;
    ctx.lineWidth = 0.4;
    const hl1 = s2px(colX + padL, hlY);
    const hl2 = s2px(colX + colW - 2, hlY);
    ctx.beginPath(); ctx.moveTo(hl1.x, hl1.y); ctx.lineTo(hl2.x, hl2.y); ctx.stroke();

    // Hero serif sheet number — roughly 8.5mm tall in sheet-mm
    ctx.fillStyle = inkCol;
    ctx.font = `500 ${numberFs}px ${fontSerif}`;
    const numberY = hlY + 3;        // sheet-mm
    const np = s2px(colX + padL, numberY);
    ctx.fillText(sheetInfo.drawingNo || 'S-XXX', np.x, np.y);

    // Rev / sheetOf caption — mono caps, with the rev letter coral.
    // Sit ~10mm below the hero baseline (numberFs is ~8.5mm tall).
    const capY = numberY + 9;
    const capP = s2px(colX + padL, capY);
    ctx.font = `500 ${captionFs}px ${fontMono}`;
    ctx.fillStyle = muteCol;
    const rev = sheetInfo.revision || 'A';
    const sof = sheetInfo.sheetOf || '';
    const prefix = 'REV ';
    ctx.fillText(prefix, capP.x, capP.y);
    // Coral revision letter
    const prefixW = ctx.measureText(prefix).width;
    ctx.fillStyle = accentCol;
    ctx.font = `600 ${captionFs}px ${fontMono}`;
    ctx.fillText(rev.toUpperCase(), capP.x + prefixW, capP.y);
    // Sheet-of suffix
    if (sof) {
      const revW = ctx.measureText(rev.toUpperCase()).width;
      ctx.fillStyle = muteCol;
      ctx.font = `500 ${captionFs}px ${fontMono}`;
      ctx.fillText(' · ' + sof.toUpperCase(), capP.x + prefixW + revW, capP.y);
    }
  }

  ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
}

// ============================================================
