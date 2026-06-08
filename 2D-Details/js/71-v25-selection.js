'use strict';

// V25 — selection / hit-test / drag / inspector / quick options
// Extracted from dev/index.html lines 20235-21565 (2026-05-02 modular split)

// V25 — SELECTION, HIT-TEST, DRAG, INSPECTOR, QUICK OPTIONS
// ============================================================
// V25 entities are second-class citizens to the existing 3D selection
// pipeline (selected3D), so they have their own selection set and a small
// rendering pass for highlights. Hit-tests run only in 2D mode.

let v25Selected = []; // entity ids
let v25Drag = null;   // { ent, handle:'body'|'tip'|'txt'|'p1'..., dx, dy } during drag

// AABB for any v25 entity in real-world (u,v) coords. Used for hit-test +
// selection highlight box.
function v25EntBounds(ent) {
  if (ent.type === 'stiff2' && typeof v25StiffBounds === 'function') { const _sb = v25StiffBounds(ent); if (_sb) return _sb; }
  if (ent.type === 'jweld' && typeof v25JWeldBounds === 'function') { const _jb = v25JWeldBounds(ent); if (_jb) return _jb; }
  // Mat (rect) — handle rotation explicitly so the AABB encloses the rotated
  // polygon, not the unrotated one. Without this, selection highlights, snap
  // points, and hit-test all drift away from the visible geometry once you
  // turn ent.rot non-zero.
  if (ent.type === 'mat' && ent.shape !== 'poly') {
    const w = ent.w || 0, h = ent.h || 0;
    const rotDeg = ent.rot || 0;
    if (!rotDeg) return { L: ent.u, R: ent.u + w, B: ent.v, T: ent.v + h };
    const rotRad = rotDeg * Math.PI / 180;
    const cu = ent.u + w / 2, cv = ent.v + h / 2;
    const cosR = Math.cos(rotRad), sinR = Math.sin(rotRad);
    let L = Infinity, R = -Infinity, B = Infinity, T = -Infinity;
    [[-w/2, -h/2], [w/2, -h/2], [w/2, h/2], [-w/2, h/2]].forEach(([lx, ly]) => {
      const wu = cu + lx * cosR - ly * sinR;
      const wv = cv + lx * sinR + ly * cosR;
      if (wu < L) L = wu; if (wu > R) R = wu;
      if (wv < B) B = wv; if (wv > T) T = wv;
    });
    return { L, R, B, T };
  }
  if (ent.type === 'blockWall') {
    // Section strip — enclose the rotated thin strip (width = block thickness).
    if (ent.wallMode === 'sec') {
      const len = ent.lengthMM || 0;
      const cat = (typeof V25_BLOCK_DB !== 'undefined' && V25_BLOCK_DB[ent.blockKey]) || { thk: 190 };
      const half = (cat.thk || 190) / 2;
      const rot = (ent.rot || 0) * Math.PI / 180, cosR = Math.cos(rot), sinR = Math.sin(rot);
      let L = Infinity, R = -Infinity, B = Infinity, T = -Infinity;
      [[0, -half], [len, -half], [len, half], [0, half]].forEach(p => {
        const wu = ent.u + p[0] * cosR - p[1] * sinR;
        const wv = ent.v + p[0] * sinR + p[1] * cosR;
        if (wu < L) L = wu; if (wu > R) R = wu;
        if (wv < B) B = wv; if (wv > T) T = wv;
      });
      return { L, R, B, T };
    }
    // Elevation extent — axis-aligned rect.
    return { L: ent.u, R: ent.u + (ent.lengthMM || 0), B: ent.v, T: ent.v + (ent.heightMM || 0) };
  }
  if (ent.type === 'frame' || ent.type === 'mesh') {
    const w = ent.w || ent.lengthMM || 0;
    const h = ent.h || ent.heightMM || 0;
    return { L: ent.u, R: ent.u + w, B: ent.v, T: ent.v + h };
  }
  if (ent.type === 'mat' && ent.shape === 'poly') {
    // Polygon mats rotate about their centroid. Inverse-rotate each point
    // back into the unrotated frame to compute axis-aligned bounds, then
    // rotate the corners forward to build the rotated AABB.
    const rotDeg = ent.rot || 0;
    const pts = ent.pts || [];
    if (!rotDeg) {
      let L = Infinity, R = -Infinity, B = Infinity, T = -Infinity;
      pts.forEach(p => {
        if (p.u < L) L = p.u; if (p.u > R) R = p.u;
        if (p.v < B) B = p.v; if (p.v > T) T = p.v;
      });
      return { L, R, B, T };
    }
    const rotRad = rotDeg * Math.PI / 180;
    const cosR = Math.cos(rotRad), sinR = Math.sin(rotRad);
    let cu = 0, cv = 0;
    pts.forEach(p => { cu += p.u; cv += p.v; });
    cu /= pts.length; cv /= pts.length;
    let L = Infinity, R = -Infinity, B = Infinity, T = -Infinity;
    pts.forEach(p => {
      const lx = p.u - cu, ly = p.v - cv;
      const wu = cu + lx * cosR - ly * sinR;
      const wv = cv + lx * sinR + ly * cosR;
      if (wu < L) L = wu; if (wu > R) R = wu;
      if (wv < B) B = wv; if (wv > T) T = wv;
    });
    return { L, R, B, T };
  }
  if (ent.type === 'snapshot') {
    const w = ent.w || 0, h = ent.h || 0, rotDeg = ent.rot || 0;
    if (!rotDeg) return { L: ent.u, R: ent.u + w, B: ent.v, T: ent.v + h };
    const rr = rotDeg * Math.PI / 180, cc = Math.cos(rr), ss = Math.sin(rr);
    const cu = ent.u + w / 2, cv = ent.v + h / 2;
    let L = Infinity, R = -Infinity, B = Infinity, T = -Infinity;
    [[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]].forEach(([lx, ly]) => {
      const wu = cu + lx * cc - ly * ss, wv = cv + lx * ss + ly * cc;
      if (wu < L) L = wu; if (wu > R) R = wu;
      if (wv < B) B = wv; if (wv > T) T = wv;
    });
    return { L, R, B, T };
  }
  if (ent.type === 'anchor') {
    const tot = ent.embed || 100;
    return { L: ent.u - 30, R: ent.u + 30, B: ent.v - tot, T: ent.v + 10 };
  }
  if (ent.type === 'reoBar') {
    if (ent.sectionDot && ent.pts && ent.pts.length) {
      const p = ent.pts[0];
      return { L: p.u - 15, R: p.u + 15, B: p.v - 15, T: p.v + 15 };
    }
    let L = Infinity, R = -Infinity, B = Infinity, T = -Infinity;
    (ent.pts || []).forEach(p => {
      if (p.u < L) L = p.u; if (p.u > R) R = p.u;
      if (p.v < B) B = p.v; if (p.v > T) T = p.v;
    });
    return { L, R, B, T };
  }
  if (ent.type === 'leader2') {
    const L = Math.min(ent.tipU, ent.txtU), R = Math.max(ent.tipU, ent.txtU);
    const B = Math.min(ent.tipV, ent.txtV), T = Math.max(ent.tipV, ent.txtV);
    return { L: L - 5, R: R + 50, B: B - 10, T: T + 30 };
  }
  if (ent.type === 'dim2') {
    // Coarse AABB enclosing the two measured points and the dim line on EITHER
    // offset side (off is paper-mm → ×drawingScale to real-mm), plus text headroom.
    const ds = (typeof drawingScale === 'number' && drawingScale) ? drawingScale : 1;
    const offReal = (Math.abs(typeof ent.off === 'number' ? ent.off : 12) + 6) * ds;
    const du = ent.p2u - ent.p1u, dv = ent.p2v - ent.p1v, len = Math.hypot(du, dv) || 1;
    const rnx = -dv / len, rny = du / len;
    const us = [ent.p1u, ent.p2u], vs = [ent.p1v, ent.p2v];
    [1, -1].forEach(s => {
      us.push(ent.p1u + rnx * offReal * s, ent.p2u + rnx * offReal * s);
      vs.push(ent.p1v + rny * offReal * s, ent.p2v + rny * offReal * s);
    });
    return { L: Math.min(...us) - 2, R: Math.max(...us) + 2, B: Math.min(...vs) - 2, T: Math.max(...vs) + 2 };
  }
  if (ent.type === 'mem2') {
    const len = ent.length || 100;
    const rot = (ent.rot || 0) * Math.PI / 180;
    const cosR = Math.cos(rot), sinR = Math.sin(rot);
    const hd = (typeof v25Mem2HalfDepth === 'function') ? v25Mem2HalfDepth(ent) : 50;
    // For cross-section view (length=0), bbox is just hd around centre.
    const aspect = ent.aspect || 'elev';
    if (aspect === 'sec') {
      return { L: ent.u - hd, R: ent.u + hd, B: ent.v - hd, T: ent.v + hd };
    }
    let L = Infinity, R = -Infinity, B = Infinity, T = -Infinity;
    [[0, -hd], [len, -hd], [len, hd], [0, hd]].forEach(p => {
      const wu = ent.u + p[0] * cosR - p[1] * sinR;
      const wv = ent.v + p[0] * sinR + p[1] * cosR;
      if (wu < L) L = wu; if (wu > R) R = wu;
      if (wv < B) B = wv; if (wv > T) T = wv;
    });
    return { L, R, B, T };
  }
  if (ent.type === 'lineSet' && ent.pts && ent.pts.length) {
    let L = Infinity, R = -Infinity, B = Infinity, T = -Infinity;
    ent.pts.forEach(p => {
      if (p.u < L) L = p.u; if (p.u > R) R = p.u;
      if (p.v < B) B = p.v; if (p.v > T) T = p.v;
    });
    return { L, R, B, T };
  }
  if (ent.type === 'txtBox') {
    return { L: ent.u, R: ent.u + 200, B: ent.v - 30, T: ent.v + 5 };
  }
  if (ent.type === 'bolt2') {
    // 2D bolt glyph (js/72c-v25-bolt.js). BOLT_DB carries diameters / AF.
    const b = (typeof BOLT_DB === 'object' && (BOLT_DB[ent.size] || BOLT_DB.M20))
            || { washOD: 40, headAF: 30, nutAF: 30, headH: 13, nutH: 16, washT: 3, pitch: 2.5 };
    const orient = ent.boltOrient || 'end';
    if (orient === 'end') {
      // Head-on: circular footprint of the washer outer diameter.
      const r = (b.washOD || 40) / 2;
      return { L: ent.u - r, R: ent.u + r, B: ent.v - r, T: ent.v + r };
    }
    // Section orientations: clamp-rect along the bolt axis. v25EntBounds has no
    // block context, so the entities2D clamp scanner (v25BoltClampSpan) can't
    // run here — size from gripOverride if the inspector set one, else a
    // sensible default grip. The bbox is centred on ent.u/ent.v (the placed
    // on-axis point); the live glyph re-centres on detected material at draw
    // time, so this is a generous selection box, not a pixel-exact footprint.
    const grip = (ent.gripOverride != null) ? ent.gripOverride : 20;
    // Axial half-length: half grip + washer + head/nut + thread protrusion + overrun.
    const axHalf = (grip / 2)
      + (b.washT || 3)
      + Math.max(b.headH || 13, b.nutH || 16)
      + 2 * (b.pitch || 2.5)
      + 4; // centreline overrun
    const halfWO = (b.washOD || 40) / 2; // transverse half-extent (washer Ø)
    const isH = (orient === 'h-nutR' || orient === 'h-nutL');
    if (isH) {
      return { L: ent.u - axHalf, R: ent.u + axHalf, B: ent.v - halfWO, T: ent.v + halfWO };
    }
    return { L: ent.u - halfWO, R: ent.u + halfWO, B: ent.v - axHalf, T: ent.v + axHalf };
  }
  if (ent.type === 'screw') {
    // HBS timber screw (js/72i-v25-screw.js). Catalogue dia drives the footprint.
    const S = (typeof getScrewSpec === 'function' && getScrewSpec(ent.screwSpec))
            || (typeof HBS_PLATE_SCREWS === 'object' && HBS_PLATE_SCREWS[ent.screwSpec])
            || { d: 10, dK: 16.5, t1: 16.5, L: 120 };
    const halfW = (S.dK || 16.5) / 2;
    const orient = ent.screwOrient || 'end';
    if (orient === 'end') {
      return { L: ent.u - halfW, R: ent.u + halfW, B: ent.v - halfW, T: ent.v + halfW };
    }
    // Section: head at the placed u,v (the live glyph snaps the head to a face at
    // draw time); body runs ~L into the material, head/collar overhangs ~tK.
    const tK = S.tK || (S.d ? S.d * 0.56 : 5);
    const bodyLen = Math.max(0, (S.L || 120) - tK) + 4;   // shank + thread + tip side
    const headOver = tK + 6;                               // head/collar protrudes ~tK
    const headLow = (orient === 'h-headL' || orient === 'v-headB'); // body toward +axis
    const isH = (orient === 'h-headL' || orient === 'h-headR');
    const axLo = headLow ? -headOver : -bodyLen;
    const axHi = headLow ?  bodyLen  :  headOver;
    if (isH) return { L: ent.u + axLo, R: ent.u + axHi, B: ent.v - halfW, T: ent.v + halfW };
    return { L: ent.u - halfW, R: ent.u + halfW, B: ent.v + axLo, T: ent.v + axHi };
  }
  if (ent.type === 'stud') {
    // ChemSet anchor stud (js/72j-v25-stud.js). Snap-independent generous box
    // (the bolt2 pattern): centred on the placed u,v — the live glyph re-centres
    // on the detected bearing face at draw time, so this is a selection box, not
    // a pixel-exact footprint (the precise pick + the highlight footprint use the
    // snapped geometry). Sized to the embedment override so a typed/dragged-longer
    // rod still marquee-selects. No block context here → no bearing scan.
    const S = (typeof getStudSpec === 'function' && getStudSpec(ent.studSpec))
            || (typeof CHEMSET_STUDS === 'object' && CHEMSET_STUDS[ent.studSpec])
            || { size: 'M16', d: 16, L: 190, Le: 165 };
    const nd = (typeof studDims === 'function') ? studDims(S.size, S.d || 16) : { washOD: (S.d || 16) * 2.1 };
    const halfW = (nd.washOD || (S.d || 16) * 2.1) / 2;
    const orient = ent.studOrient || 'v-nutT';
    if (orient === 'end') {
      return { L: ent.u - halfW, R: ent.u + halfW, B: ent.v - halfW, T: ent.v + halfW };
    }
    const d = S.d || 16, L = S.L || 190, Le = S.Le || 165;
    const maxFixt = (S.maxFixt != null) ? S.maxFixt : Math.max(0, Le - (S.embed || Le * 0.75));
    const sFace = (ent.faceOffset != null) ? Math.max(0, ent.faceOffset) : maxFixt;
    const embedDepth = (ent.embedDepth != null && ent.embedDepth > 0)
      ? ent.embedDepth : Math.max(d + 2, Le - sFace);   // Le == today's embedded length
    const nutOver = Math.max(8, L - Le) + 6;             // projection side
    const bodyLen = sFace + embedDepth + 8;              // embedded side (override-aware)
    const nutLow = (orient === 'h-nutL' || orient === 'v-nutB');     // body toward +axis
    const isH = (orient === 'h-nutL' || orient === 'h-nutR');
    const axLo = nutLow ? -nutOver : -bodyLen;
    const axHi = nutLow ?  bodyLen  :  nutOver;
    if (isH) return { L: ent.u + axLo, R: ent.u + axHi, B: ent.v - halfW, T: ent.v + halfW };
    return { L: ent.u - halfW, R: ent.u + halfW, B: ent.v + axLo, T: ent.v + axHi };
  }
  if (ent.type === 'noteBox' && typeof nbBounds === 'function') return nbBounds(ent);
  // CLT panel — AABB of the (rotated) world outline. Drives marquee-select,
  // the hover-halo fallback, the deselect-proximity guard, and group/align.
  if (ent.type === 'clt' && typeof cltWorldOutline === 'function') {
    const oc = cltWorldOutline(ent);
    if (oc && oc.length) {
      let L = Infinity, R = -Infinity, B = Infinity, T = -Infinity;
      oc.forEach(p => { if (p.u < L) L = p.u; if (p.u > R) R = p.u; if (p.v < B) B = p.v; if (p.v > T) T = p.v; });
      return { L, R, B, T };
    }
  }
  return null;
}

// Signed-area magnitude (shoelace) of a [{u,v}] polygon, in real-mm². Used as
// the AREA-entity score: a smaller silhouette is the "tighter" (more specific)
// target, so a screw/cleat over a big timber post wins on area alone.
function _v25PolyAreaMM2(poly) {
  if (!poly || poly.length < 3) return Infinity;
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += (poly[j].u + poly[i].u) * (poly[i].v - poly[j].v);
  }
  return Math.abs(a) / 2;
}

// ----------------------------------------------------------------------------
// SELECTION-PRECISION scoring model (the heart of the precise pick).
//
// v25EntHit(blk, ent, cursorPx, ctx) tests ONE entity against the cursor and
// returns { precise:boolean, score:number } — or null on a precise MISS (drop
// the candidate even though its bbox passed the cheap pre-filter). The ranked
// stack sorts these so stack[0] is the TIGHTEST target under the cursor:
//
//   precise DESC (true first) → score ASC (smaller first) → paint-index DESC.
//
// Because `precise` is compared FIRST, a CSS-px linear score and a real-mm²
// area score are NEVER compared against each other — any precise (linear/point)
// hit sorts ahead of any area (filled) hit before scores are even looked at.
//
//   LINEAR / POINT  (screw, bolt2, line/lineSet, leader2, dim2, reoBar, anchor,
//                    jweld, noteBox arrow/leader, frame border) → precise=true,
//                    score = CSS-px distance from the cursor to the ACTUAL drawn
//                    stroke / centreline / point (smaller = better).
//   AREA / FILLED   (mem2/timber, v2 plate, mat, blockWall, mesh, noteBox body,
//                    stiff2, txtBox) → precise=false, score = silhouette polygon
//                    area in real-mm² (smaller = better).
//
// `ctx` bundles the per-call constants already computed once in v25HitTestStack
// (real2Px, ppmm, distToSegPx, FLOOR_PX, the *_TOL_PX). `blk` is required for
// the fastener centreline re-centring (v25ScrewBearingFace / v25BoltClampSpan)
// — which is exactly why the precise test lives in the stack, not v25EntBounds.
function v25EntHit(blk, ent, cursorPx, ctx) {
  if (!ent) return null;
  const real2Px = ctx.real2Px;
  const distSeg = ctx.distToSegPx;
  const ppmm = ctx.ppmm;
  const FLOOR_PX = ctx.FLOOR_PX;
  const t = ent.type;

  // Small helper: px distance from the cursor to a real-world (u,v) point.
  const ptPx = (uu, vv) => {
    const p = real2Px(uu, vv);
    return Math.hypot(cursorPx.x - p.x, cursorPx.y - p.y);
  };
  // Min px distance from the cursor to a real-world polyline (array of {u,v}).
  const polylinePx = (pts, closed) => {
    if (!pts || pts.length === 0) return Infinity;
    if (pts.length === 1) return ptPx(pts[0].u, pts[0].v);
    let best = Infinity;
    const n = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const a = real2Px(pts[i].u, pts[i].v);
      const b = real2Px(pts[(i + 1) % pts.length].u, pts[(i + 1) % pts.length].v);
      const d = distSeg(cursorPx, a, b);
      if (d < best) best = d;
    }
    return best;
  };
  // Cursor in real-world (u,v) — supplied by the stack (it already has them).
  const cu = ctx.cu, cv = ctx.cv;
  // AREA hit: cursor must be strictly inside the real polygon; score = area.
  const areaHit = (poly) => {
    if (!poly || poly.length < 3) return null;
    if (!_v25dPointInPoly(cu, cv, poly)) return null;
    return { precise: false, score: _v25PolyAreaMM2(poly) };
  };

  // ---- LINEAR / POINT entities ------------------------------------------
  if (t === 'screw') {
    return v25FastenerHit(blk, ent, cursorPx, ctx, 'screw');
  }
  if (t === 'stud') {
    return v25FastenerHit(blk, ent, cursorPx, ctx, 'stud');
  }
  if (t === 'bolt2') {
    return v25FastenerHit(blk, ent, cursorPx, ctx, 'bolt');
  }
  if (t === 'anchor') {
    // Shaft centreline: head at (u,v), tip at (u,v) projected -totalLen along
    // the +V-at-rot=0 axis (matches drawAnchor2D's local frame & rotation).
    const def = (typeof V25_ANCHOR_DB === 'object' && (V25_ANCHOR_DB[ent.kind] || V25_ANCHOR_DB.chemset)) || {};
    const totalLen = ent.embed || (def.defaults && def.defaults.embed) || 100;
    const rot = (ent.rot || 0) * Math.PI / 180, c = Math.cos(rot), s = Math.sin(rot);
    // local (0,0) → (0,-totalLen): wu = u - lv*sin, wv = v + lv*cos with lv=-totalLen.
    const tipU = ent.u - (-totalLen) * s, tipV = ent.v + (-totalLen) * c;
    const d = polylinePx([{ u: ent.u, v: ent.v }, { u: tipU, v: tipV }], false);
    const tol = Math.max(FLOOR_PX, ((def.shaftD || def.sleeveD || 16) / 2) * ppmm);
    return (d <= tol) ? { precise: true, score: d } : null;
  }
  if (t === 'reoBar') {
    if (ent.sectionDot && ent.pts && ent.pts.length) {
      const d = ptPx(ent.pts[0].u, ent.pts[0].v);
      const tol = Math.max(FLOOR_PX, 15 * ppmm);
      return (d <= tol) ? { precise: true, score: d } : null;
    }
    const d = polylinePx(ent.pts, false);
    return (d <= ctx.LINE_TOL_PX) ? { precise: true, score: d } : null;
  }
  if (t === 'lineSet' || t === 'line') {
    // Stroke-only for now (filled-closed lineSets included — decided judgement).
    const d = polylinePx(ent.pts, !!ent.closed);
    return (d <= ctx.LINE_TOL_PX) ? { precise: true, score: d } : null;
  }
  if (t === 'jweld') {
    const d = polylinePx([{ u: ent.u1, v: ent.v1 }, { u: ent.u2, v: ent.v2 }], false);
    return (d <= ctx.LINE_TOL_PX) ? { precise: true, score: d } : null;
  }
  if (t === 'leader2') {
    // Lifted from the old precise branch: text-anchor box OR a point on the
    // leader line. Score = the px distance the branch already implies.
    const tp = real2Px(ent.txtU, ent.txtV);
    const dAnchor = Math.max(Math.abs(cursorPx.x - tp.x) - ctx.TXT_TOL_PX_X,
                             Math.abs(cursorPx.y - tp.y) - ctx.TXT_TOL_PX_Y);
    if (dAnchor < 0) return { precise: true, score: Math.hypot(cursorPx.x - tp.x, cursorPx.y - tp.y) };
    const tipPx = real2Px(ent.tipU, ent.tipV);
    const dx = tp.x - tipPx.x, dy = tp.y - tipPx.y;
    const lenPx = Math.hypot(dx, dy);
    if (lenPx > 0) {
      const tt = ((cursorPx.x - tipPx.x) * dx + (cursorPx.y - tipPx.y) * dy) / (lenPx * lenPx);
      if (tt > 0.15 && tt < 0.95) {
        const ppx = tipPx.x + tt * dx, ppy = tipPx.y + tt * dy;
        const d = Math.hypot(cursorPx.x - ppx, cursorPx.y - ppy);
        if (d < ctx.LINE_TOL_PX) return { precise: true, score: d };
      }
    }
    return null;
  }
  if (t === 'dim2') {
    // Lifted from the old precise branch: nearest of dim line / two witness
    // lines / label box. Score = the min px distance.
    if (typeof dim2DimLinePx !== 'function') return null;
    const g = dim2DimLinePx(blk, ent);
    let best = Math.min(distSeg(cursorPx, g.d1, g.d2),
                        distSeg(cursorPx, g.w1, g.d1),
                        distSeg(cursorPx, g.w2, g.d2));
    if (best < ctx.LINE_TOL_PX) return { precise: true, score: best };
    // label box — mirror drawDim2_2D's outward anchor offset.
    const z = (typeof _nbZoom === 'function') ? _nbZoom() : 1;
    const sgn = (g.off >= 0) ? 1 : -1;
    const capDraw = Math.max(DIM2_TXT_MIN_PX, (ent.sz || 2.5) * z);
    const tgap = DIM2_TXT_GAP_MM * z + capDraw * 0.5;
    const lx = g.mid.x + g.nx * sgn * tgap, ly = g.mid.y + g.ny * sgn * tgap;
    if (Math.abs(cursorPx.x - lx) < ctx.TXT_TOL_PX_X && Math.abs(cursorPx.y - ly) < ctx.TXT_TOL_PX_Y) {
      return { precise: true, score: Math.hypot(cursorPx.x - lx, cursorPx.y - ly) };
    }
    return null;
  }
  if (t === 'frame') {
    // Border only: min px distance to the 4 edges; reject the interior so a
    // member drawn inside the frame is still pickable through it.
    const b = v25EntBounds(ent);
    if (!b) return null;
    const c0 = real2Px(b.L, b.B), c1 = real2Px(b.R, b.B), c2 = real2Px(b.R, b.T), c3 = real2Px(b.L, b.T);
    const d = Math.min(distSeg(cursorPx, c0, c1), distSeg(cursorPx, c1, c2),
                       distSeg(cursorPx, c2, c3), distSeg(cursorPx, c3, c0));
    return (d <= ctx.TOL_PX) ? { precise: true, score: d } : null;
  }

  // ---- AREA / FILLED entities -------------------------------------------
  if (t === 'mem2') {
    const oc = (typeof v25Mem2WorldOutline === 'function') ? v25Mem2WorldOutline(ent) : [];
    const poly = oc.map(p => ({ u: p[0], v: p[1] }));
    return areaHit(poly);
  }
  if (t === 'mat') {
    // Build the real (rotated) polygon and test point-in-poly, not the AABB —
    // so a concave-notch / rotated mat doesn't grab clicks outside its outline.
    let poly = null;
    if (ent.shape === 'poly' && Array.isArray(ent.pts) && ent.pts.length >= 3) {
      const rotDeg = ent.rot || 0;
      if (!rotDeg) poly = ent.pts.map(p => ({ u: p.u, v: p.v }));
      else {
        const rr = rotDeg * Math.PI / 180, cc = Math.cos(rr), ss = Math.sin(rr);
        let cu = 0, cv = 0; ent.pts.forEach(p => { cu += p.u; cv += p.v; }); cu /= ent.pts.length; cv /= ent.pts.length;
        poly = ent.pts.map(p => { const lx = p.u - cu, ly = p.v - cv; return { u: cu + lx * cc - ly * ss, v: cv + lx * ss + ly * cc }; });
      }
    } else {
      const w = ent.w || 0, h = ent.h || 0, rotDeg = ent.rot || 0;
      if (!rotDeg) poly = [{ u: ent.u, v: ent.v }, { u: ent.u + w, v: ent.v }, { u: ent.u + w, v: ent.v + h }, { u: ent.u, v: ent.v + h }];
      else {
        const rr = rotDeg * Math.PI / 180, cc = Math.cos(rr), ss = Math.sin(rr);
        const cu = ent.u + w / 2, cv = ent.v + h / 2;
        poly = [[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]].map(([lx,ly]) => ({ u: cu + lx * cc - ly * ss, v: cv + lx * ss + ly * cc }));
      }
    }
    return areaHit(poly);
  }
  if (t === 'blockWall') {
    let poly = null;
    if (ent.wallMode === 'sec') {
      const len = ent.lengthMM || 0;
      const cat = (typeof V25_BLOCK_DB !== 'undefined' && V25_BLOCK_DB[ent.blockKey]) || { thk: 190 };
      const half = (cat.thk || 190) / 2;
      const rr = (ent.rot || 0) * Math.PI / 180, cc = Math.cos(rr), ss = Math.sin(rr);
      poly = [[0,-half],[len,-half],[len,half],[0,half]].map(([lx,ly]) => ({ u: ent.u + lx * cc - ly * ss, v: ent.v + lx * ss + ly * cc }));
    } else {
      const w = ent.lengthMM || 0, h = ent.heightMM || 0;
      poly = [{ u: ent.u, v: ent.v }, { u: ent.u + w, v: ent.v }, { u: ent.u + w, v: ent.v + h }, { u: ent.u, v: ent.v + h }];
    }
    return areaHit(poly);
  }
  if (t === 'clt') {
    // Click hit-test = the same (rotated) world outline the highlight uses, so
    // the pickable area matches what's drawn for both edge and plan modes.
    const oc = (typeof cltWorldOutline === 'function') ? cltWorldOutline(ent) : null;
    return (oc && oc.length >= 3) ? areaHit(oc.map(p => ({ u: p.u, v: p.v }))) : null;
  }
  if (t === 'snapshot') {
    const w = ent.w || 0, h = ent.h || 0, rotDeg = ent.rot || 0;
    let poly;
    if (!rotDeg) poly = [{ u: ent.u, v: ent.v }, { u: ent.u + w, v: ent.v }, { u: ent.u + w, v: ent.v + h }, { u: ent.u, v: ent.v + h }];
    else {
      const rr = rotDeg * Math.PI / 180, cc = Math.cos(rr), ss = Math.sin(rr);
      const cu = ent.u + w / 2, cv = ent.v + h / 2;
      poly = [[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]].map(([lx,ly]) => ({ u: cu + lx * cc - ly * ss, v: cv + lx * ss + ly * cc }));
    }
    return areaHit(poly);   // precise:false, score = area → ranks LOW so trace members on top win the click
  }
  if (t === 'mesh' || t === 'txtBox') {
    const b = v25EntBounds(ent);
    if (!b) return null;
    return areaHit([{ u: b.L, v: b.B }, { u: b.R, v: b.B }, { u: b.R, v: b.T }, { u: b.L, v: b.T }]);
  }
  if (t === 'stiff2') {
    // stiffCorners (the true quad) is internal to the 72e IIFE; fall back to a
    // point-in-bbox test (precise=false) per the decided judgement call.
    const b = v25EntBounds(ent);
    if (!b) return null;
    return areaHit([{ u: b.L, v: b.B }, { u: b.R, v: b.B }, { u: b.R, v: b.T }, { u: b.L, v: b.T }]);
  }
  if (t === 'noteBox') {
    // Body only here (the leader/tip emits a SEPARATE precise candidate in the
    // stack). Area = the box bbox rect.
    const b = (typeof nbBounds === 'function') ? nbBounds(ent) : null;
    if (!b) return null;
    return areaHit([{ u: b.L, v: b.B }, { u: b.R, v: b.B }, { u: b.R, v: b.T }, { u: b.L, v: b.T }]);
  }

  // Unknown / not-yet-classified type: fall back to a bbox area test so it stays
  // selectable (precise=false) rather than disappearing from the pick.
  const b = v25EntBounds(ent);
  if (!b) return null;
  return areaHit([{ u: b.L, v: b.B }, { u: b.R, v: b.B }, { u: b.R, v: b.T }, { u: b.L, v: b.T }]);
}

// Precise hit for a fastener (screw / bolt) SECTION centreline. The drawn
// centreline is re-centred on the detected bearing/clamp FACE — NOT ent.u/v —
// so we recompute the exact endpoints the drawer uses. End-on glyphs are a
// POINT (radial accept inside the head/washer circle), never a bbox corner.
// Returns { precise:true, score:pxDistance } or null on a miss.
function v25FastenerHit(blk, ent, cursorPx, ctx, kind) {
  const real2Px = ctx.real2Px;
  const distSeg = ctx.distToSegPx;
  const ppmm = ctx.ppmm;
  const FLOOR_PX = ctx.FLOOR_PX;

  if (kind === 'screw') {
    const S = (typeof getScrewSpec === 'function' && getScrewSpec(ent.screwSpec))
            || (typeof HBS_PLATE_SCREWS === 'object' && HBS_PLATE_SCREWS[ent.screwSpec])
            || { d: 10, dK: 16.5, t1: 16.5, tK: 5, L: 120 };
    const orient = ent.screwOrient || 'end';
    if (orient === 'end') {
      const p = real2Px(ent.u, ent.v);
      const d = Math.hypot(cursorPx.x - p.x, cursorPx.y - p.y);
      const tol = ((S.dK || 16.5) / 2) * ppmm + FLOOR_PX;
      return (d <= tol) ? { precise: true, score: d } : null;
    }
    // SECTION: replicate drawScrew2D_Section's axis mapping exactly so the pick
    // sits on the DRAWN centreline (which lands on the bearing face).
    const axisIsU = (orient === 'h-headL' || orient === 'h-headR');
    const trans = axisIsU ? ent.v : ent.u;
    const bodyDir = (orient === 'h-headL' || orient === 'v-headB') ? 1 : -1;
    const d = S.d || 10;
    const tK = S.tK || d * 0.56;
    const L = S.L || d * 12;
    const headLen = 1.80 * d;                    // SCREW_GEOM.headLenNorm * d
    const sBear = Math.min(tK, headLen * 0.45);  // collar underside = bearing plane
    const bearing = (typeof v25ScrewBearingFace === 'function') ? v25ScrewBearingFace(blk, ent) : null;
    const junction = (bearing != null) ? bearing : (axisIsU ? ent.u : ent.v);
    const axisAt = (s) => junction + bodyDir * (s - sBear);
    const a0 = axisAt(-2), aL = axisAt(L + 2);
    const A = axisIsU ? real2Px(a0, trans) : real2Px(trans, a0);
    const B = axisIsU ? real2Px(aL, trans) : real2Px(trans, aL);
    const dist = distSeg(cursorPx, A, B);
    const tol = Math.max(FLOOR_PX, ((S.dK || 16.5) / 2) * ppmm);
    return (dist <= tol) ? { precise: true, score: dist } : null;
  }

  if (kind === 'stud') {
    const S = (typeof getStudSpec === 'function' && getStudSpec(ent.studSpec))
            || (typeof CHEMSET_STUDS === 'object' && CHEMSET_STUDS[ent.studSpec])
            || { size: 'M16', d: 16, L: 190, Le: 165 };
    const nd = (typeof studDims === 'function') ? studDims(S.size, S.d || 16) : { washOD: (S.d || 16) * 2.1 };
    const halfWO = (nd.washOD || (S.d || 16) * 2.1) / 2;
    const orient = ent.studOrient || 'v-nutT';
    if (orient === 'end') {
      const p = real2Px(ent.u, ent.v);
      const d = Math.hypot(cursorPx.x - p.x, cursorPx.y - p.y);
      const tol = halfWO * ppmm + FLOOR_PX;
      return (d <= tol) ? { precise: true, score: d } : null;
    }
    // SECTION — span the DRAWN extents (tail-top → embedded tip, +3 overrun)
    // from the single-source geometry, so the pick sits on the drawn centreline
    // (which lands on the detected bearing face and honours the embedment override).
    const g = (typeof studSectionGeom === 'function') ? studSectionGeom(blk, ent) : null;
    if (!g) return null;
    const a0 = g.axisAt(g.sTailTop - 3), aL = g.axisAt(g.embLen + 3);
    const A = g.axisIsU ? real2Px(a0, g.trans) : real2Px(g.trans, a0);
    const B = g.axisIsU ? real2Px(aL, g.trans) : real2Px(g.trans, aL);
    const dist = distSeg(cursorPx, A, B);
    const tol = Math.max(FLOOR_PX, halfWO * ppmm);
    return (dist <= tol) ? { precise: true, score: dist } : null;
  }

  // bolt
  const b = (typeof BOLT_DB === 'object' && (BOLT_DB[ent.size] || BOLT_DB.M20))
          || { d: 20, pitch: 2.5, headAF: 30, headH: 13, nutAF: 30, nutH: 16, washOD: 44, washT: 4, threadL: 46 };
  const orient = ent.boltOrient || 'end';
  if (orient === 'end' || !ent.boltOrient) {
    const p = real2Px(ent.u, ent.v);
    const d = Math.hypot(cursorPx.x - p.x, cursorPx.y - p.y);
    const tol = ((b.washOD || b.d * 1.85) / 2) * ppmm + FLOOR_PX;
    return (d <= tol) ? { precise: true, score: d } : null;
  }
  // SECTION: replicate drawBolt2D_*Section's centreline extents (head-outer to
  // thread-tip, +4 overrun each end), grip-centred on the detected clamp span.
  // The head/nut grip-face sign differs between the H and V drawers, so mirror
  // each exactly (drawBolt2D_HorizontalSection: zGripL = head; VerticalSection:
  // vGripL = head). Endpoints feed a min/max span, so even if head/nut swap ends
  // the perpendicular pick distance is unaffected; matching keeps the along-axis
  // extent pixel-faithful to the drawn glyph.
  let span = (typeof v25BoltClampSpan === 'function') ? v25BoltClampSpan(blk, ent) : null;
  const horiz = (orient === 'h-nutR' || orient === 'h-nutL');
  if (!span) span = { grip: 20, centre: (horiz ? ent.u : ent.v),
    length: (typeof computeBoltLength === 'function') ? computeBoltLength(20, ent.size) : 60 };
  const hG = span.grip / 2;
  // dir +1 = H: nut to the right / V: head at top (matches both drawers).
  const dir = (orient === 'h-nutR' || orient === 'v-nutB') ? 1 : -1;
  // Head-side grip face: H drawer → centre - dir*hG ; V drawer → centre + dir*hG.
  const gripHead = horiz ? (span.centre - dir * hG) : (span.centre + dir * hG);
  const gripNut  = horiz ? (span.centre + dir * hG) : (span.centre - dir * hG);
  // Outward direction from the grip toward the head vs the nut (per drawer):
  // H head grows toward -dir, nut toward +dir; V head grows toward +dir, nut -dir.
  const headOut = horiz ? -dir : dir;
  const nutOut  = -headOut;
  const headOuter = gripHead + headOut * ((b.washT || 4) + (b.headH || 13));
  const nutOuter  = gripNut  + nutOut  * ((b.washT || 4) + (b.nutH || 16));
  const threadProt = (span.threadProt != null)
    ? span.threadProt
    : Math.max(2 * (b.pitch || 2.5), (span.length || 0) - (span.grip + 2 * (b.washT || 4) + (b.nutH || 16)));
  const threadTip = nutOuter + nutOut * threadProt;
  const lo = Math.min(headOuter, threadTip) - 4, hi = Math.max(headOuter, threadTip) + 4;
  const trans = horiz ? ent.v : ent.u;          // cy / cu in the drawer
  const A = horiz ? real2Px(lo, trans) : real2Px(trans, lo);
  const B = horiz ? real2Px(hi, trans) : real2Px(trans, hi);
  const dist = distSeg(cursorPx, A, B);
  const tol = Math.max(FLOOR_PX, ((b.washOD || b.d * 1.85) / 2) * ppmm);
  return (dist <= tol) ? { precise: true, score: dist } : null;
}

// Enumerate v2 plates in `viewKey` as ranked-stack candidates. Walks
// v2.appState.model directly (NOT the v1 plate2 MIRRORS — those carry
// _v2Mirror, lack _v25, and have no v25EntBounds branch, so PASS1 skips them).
// Each plate is an AREA candidate scored by its silhouette area; a synthetic
// ent { id:'v2plate-'+el.id, _v2Plate, _v2Id, type:'plate2' } carries it back
// through the same stack the v1 entities use. idx is a deterministic synthetic
// paint index so the repeat-click cycle stays byte-stable.
function _v25PlateCandidates(viewKey, ctx, baseIdx) {
  const res = [];
  const model = (typeof v2 === 'object' && v2 && v2.appState && v2.appState.model) ? v2.appState.model : null;
  if (!model || !model.elements || typeof model.elements.forEach !== 'function') return res;
  let n = 0;
  model.elements.forEach(function (el) {
    if (!el || el.category !== 'plate') return;
    if (!el.params || el.params.v2Source !== 'place-plate-tool') return;
    const g = el.geometry;
    if (!g || g.kind !== 'region' || !Array.isArray(g.polygon) || g.polygon.length < 3) return;
    const m = /^v1-view-(.+)$/.exec(typeof g.viewId === 'string' ? g.viewId : '');
    if (!m || m[1] !== viewKey) return;
    // Build a [{u,v}] polygon (x→u, y→v). NEVER feed editPlate.pointInPolygon
    // ([{x,y}]) a [{u,v}] array — the field-name trap noted in the spec.
    const poly = g.polygon.map(p => ({ u: (+p.x || 0), v: (+p.y || 0) }));
    // Cheap bbox pre-filter, then precise point-in-poly (cursor in real coords).
    const bb = _v25dBBox(poly);
    if (ctx.cu < bb.minU || ctx.cu > bb.maxU || ctx.cv < bb.minV || ctx.cv > bb.maxV) { n++; return; }
    if (!_v25dPointInPoly(ctx.cu, ctx.cv, poly)) { n++; return; }
    res.push({
      ent: { id: 'v2plate-' + el.id, _v2Plate: true, _v2Id: el.id, type: 'plate2' },
      precise: false,
      score: _v25PolyAreaMM2(poly),
      idx: baseIdx + n,
    });
    n++;
  });
  return res;
}

// Hit-test in real-world (u, v). Tolerance is computed in CSS pixels but
// also capped by an absolute real-world maximum, so when the canvas is
// zoomed way out, picking doesn't grab everything within view.
//
// v25HitTestStack returns ALL entities under the cursor in SPECIFICITY order
// (SELECTION-PRECISION, 2026-06): each candidate is scored by v25EntHit, then
// the stack is stable-sorted precise-first → smaller-score-first → topmost
// paint order, so stack[0] is the TIGHTEST target — a screw on top of a plate
// on top of a timber post returns the SCREW, not the big filled member behind
// it. PASS 0 (noteBox arrowhead tips) and the leader2 / dim2 / noteBox-leader
// precise branches are folded into the same scored collection (not deleted), so
// an arrow tip still floats to the top. v2 plates are folded in too, so one
// repeat-click cycle spans screw → plate → timber → text.
// v25HitTest (below) returns stack[0] — the single top-most pick — preserving
// the entity-or-null contract every existing caller expects.
function v25HitTestStack(blk, u, v) {
  const cursorPx = real2px(blk, u, v);
  const real2Px = (uu, vv) => real2px(blk, uu, vv);
  const ppmm = viewport.zoom / drawingScale; // px per real-mm
  // Cap effective tolerance to the smaller of pixel-tolerance and a real-mm cap.
  const cap = (pxTol, realMaxMm) => Math.min(pxTol, realMaxMm * ppmm);
  const TOL_PX = cap(6, 40);          // generic pickup
  const LINE_TOL_PX = cap(4, 20);
  const TXT_TOL_PX_X = cap(30, 60);   // text anchor pickup width
  const TXT_TOL_PX_Y = cap(8, 20);
  const FLOOR_PX = 5;                  // tolerance floor so tiny glyphs stay pickable when zoomed out
  // Point-to-segment distance in px (for picking up leader / centre lines).
  const distToSegPx = (p, a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  };
  // Per-call constants bundle handed to v25EntHit / the plate enumerator.
  const ctx = {
    real2Px, ppmm, distToSegPx, FLOOR_PX,
    TOL_PX, LINE_TOL_PX, TXT_TOL_PX_X, TXT_TOL_PX_Y,
    cu: u, cv: v,
  };
  const arr = entities2D[blk.viewKey] || [];

  // ---- collect scored candidates --------------------------------------------
  // Each candidate is { ent, precise, score, idx }. idx = the entity's index in
  // entities2D[viewKey] (PAINT order — the tie-break that lets the topmost win),
  // or a deterministic synthetic index for the v2 plates appended after.
  const cands = [];

  // PASS 0 — noteBox arrowhead priority, modelled as a PRECISE candidate whose
  // score is the tip distance, so it still floats to stack[0] over the member
  // behind it (an arrow points AT a member, so its tip sits inside the member).
  if (typeof nbLeaderPoints === 'function') {
    for (let i = arr.length - 1; i >= 0; i--) {
      const ent = arr[i];
      if (!ent || !ent._v25 || ent.type !== 'noteBox' || !Array.isArray(ent.arrows)) continue;
      let bestTip = Infinity;
      for (const a of ent.arrows) {
        const pts = nbLeaderPoints(ent, a).map(p => real2Px(p.u, p.v));
        const tip = pts[pts.length - 1];
        if (tip) {
          const d = Math.hypot(cursorPx.x - tip.x, cursorPx.y - tip.y);
          if (d < bestTip) bestTip = d;
        }
      }
      if (bestTip < 8) cands.push({ ent, precise: true, score: bestTip, idx: i });
    }
  }

  // PASS 1 — every v25 entity, top-most paint order first. AABB pre-filter
  // (cheap) gates the precise per-entity test (v25EntHit). NoteBox leaders are
  // a separate precise candidate here; the box BODY comes from v25EntHit.
  for (let i = arr.length - 1; i >= 0; i--) {
    const ent = arr[i];
    if (!ent || !ent._v25) continue;
    // snapshot-tools (js/88) — a flattened (locked) image is invisible to normal
    // picks (click / hover / cycle / marquee / right-click-select) so a stray
    // click can't grab it while tracing. Double-click + the right-click menu
    // reach it through v25SnapshotAt instead.
    if (ent.type === 'snapshot' && ent.flattened) continue;

    // NoteBox leader segments — a precise candidate (mirrors the old leader
    // pickup; the arrow TIP already emitted a PASS-0 candidate above).
    if (ent.type === 'noteBox' && typeof nbLeaderPoints === 'function' && Array.isArray(ent.arrows)) {
      let onLeader = Infinity;
      for (const a of ent.arrows) {
        const pts = nbLeaderPoints(ent, a).map(p => real2Px(p.u, p.v));
        for (let k = 0; k < pts.length - 1; k++) {
          const d = distToSegPx(cursorPx, pts[k], pts[k + 1]);
          if (d < onLeader) onLeader = d;
        }
      }
      if (onLeader < LINE_TOL_PX) cands.push({ ent, precise: true, score: onLeader, idx: i });
      // fall through so the box body is still scored by v25EntHit below
    }

    // AABB pre-filter: only run the precise test when the (expanded) bbox
    // contains the cursor. Types with no bbox run the precise test directly so
    // nothing is silently dropped.
    const b = v25EntBounds(ent);
    // Fasteners (screw, bolt2) re-centre on a detected bearing/clamp face at
    // DRAW time, so their ent.u/v-anchored bbox can sit off the drawn glyph. A
    // far-offset bearing would let this gate `continue` past a click that lands
    // squarely on the screw. Skip the gate for them and always run the (cheap,
    // self-limiting) precise centreline test — it returns null for far clicks.
    const _bboxGate = b && ent.type !== 'screw' && ent.type !== 'bolt2';
    if (_bboxGate) {
      const blPx = real2Px(b.L, b.B), trPx = real2Px(b.R, b.T);
      const minX = Math.min(blPx.x, trPx.x), maxX = Math.max(blPx.x, trPx.x);
      const minY = Math.min(blPx.y, trPx.y), maxY = Math.max(blPx.y, trPx.y);
      if (cursorPx.x < minX - TOL_PX || cursorPx.x > maxX + TOL_PX ||
          cursorPx.y < minY - TOL_PX || cursorPx.y > maxY + TOL_PX) continue;
    }
    const r = v25EntHit(blk, ent, cursorPx, ctx);
    if (r) cands.push({ ent, precise: r.precise, score: r.score, idx: i });
  }

  // v2 plates — same scored stack, enumerated from v2.appState.model (NOT the
  // mirrors). Synthetic idx after the v1 entities so it never collides and the
  // cycle id-array is byte-stable.
  const plateCands = _v25PlateCandidates(blk.viewKey, ctx, arr.length);
  for (const c of plateCands) cands.push(c);

  // ---- dedup (best-ranked per id) BEFORE the final sort ---------------------
  // noteBox emits both a precise tip/leader candidate AND an area body candidate
  // for one id; keep the better-ranked so the arrow tip is never re-buried under
  // the body. "Better" = the same total order used for the final sort.
  const better = (a, b) => {
    if (a.precise !== b.precise) return a.precise ? a : b;     // precise wins
    if (a.score !== b.score) return a.score < b.score ? a : b; // smaller score wins
    return a.idx >= b.idx ? a : b;                             // topmost paint wins
  };
  const byId = new Map();
  for (const c of cands) {
    const prev = byId.get(c.ent.id);
    byId.set(c.ent.id, prev ? better(prev, c) : c);
  }
  const deduped = Array.from(byId.values());

  // ---- stable, deterministic sort -------------------------------------------
  // precise DESC → score ASC → idx DESC. precise is compared FIRST so a px score
  // and an mm² score are never compared to each other. idx folded into the
  // comparator (not relying on engine stability) so the SAME click always yields
  // a byte-identical ordered id-array — the repeat-click cycle depends on it.
  deduped.sort((a, b) => {
    if (a.precise !== b.precise) return a.precise ? -1 : 1;
    if (a.score !== b.score) return a.score - b.score;
    return b.idx - a.idx;
  });

  return deduped.map(c => c.ent);
}

// Single-pick (top-most) hit-test — thin wrapper over the ordered stack so every
// existing caller keeps its entity-or-null contract. The PASS-0 arrowhead pre-
// pass means a click/hover on a noteBox arrow tip now returns the noteBox even
// when a member is drawn on top of it.
function v25HitTest(blk, u, v) {
  const s = v25HitTestStack(blk, u, v);
  return s.length ? s[0] : null;
}

// Draw selection highlight for selected v25 entities
// Returns the list of visible drag-handles for an entity. Each handle
// becomes a clickable Bluebeam-style "grip square" when the entity is
// selected. The `key` matches what v25HitHandle returns / v25Move expects.
function v25EntHandles(ent, blk) {
  if (ent.type === 'stiff2' && typeof v25StiffGrips === 'function') return v25StiffGrips(ent);
  const out = [];
  if (!ent) return out;
  if (ent.type === 'noteBox' && typeof nbHandles === 'function') return nbHandles(ent);
  if (ent.type === 'lineSet' && ent.pts) {
    ent.pts.forEach((p, i) => out.push({ key: 'pt:' + i, u: p.u, v: p.v }));
  } else if (ent.type === 'mat' && ent.shape === 'poly' && ent.pts) {
    ent.pts.forEach((p, i) => out.push({ key: 'pt:' + i, u: p.u, v: p.v }));
  } else if (ent.type === 'mem2') {
    const rot = (ent.rot || 0) * Math.PI / 180;
    const len = ent.length || 0;
    // Cross-section members (aspect:'sec', length:0) have no meaningful
    // "ends" — both endpoints collapse to the entity origin, so emitting
    // end-a / end-b would trap every body-drag click in the end-handle
    // pipeline (which then re-stretches the section into a length-having
    // elevation member). Skip the end handles for cross-sections; body drag
    // and rotate (via the inspector for now) are the only valid edits.
    const isSec = (ent.aspect || 'elev') === 'sec' || len < 1;
    if (!isSec) {
      out.push({ key: 'end-a', u: ent.u, v: ent.v });
      out.push({ key: 'end-b', u: ent.u + Math.cos(rot) * len, v: ent.v + Math.sin(rot) * len });
    }
    // Midpoint rotation handle — perpendicular ball offset above the member,
    // mirroring Bluebeam's pitch handle. Drag rotates around the midpoint.
    if (len > 0) {
      const hd = (typeof v25Mem2HalfDepth === 'function') ? v25Mem2HalfDepth(ent) : 50;
      const offsetMm = hd + Math.max(40, hd * 0.6);
      const cosR = Math.cos(rot), sinR = Math.sin(rot);
      const midU = ent.u + cosR * (len / 2);
      const midV = ent.v + sinR * (len / 2);
      out.push({
        key: 'rotate', shape: 'circle',
        u: midU + (-sinR) * offsetMm,
        v: midV + ( cosR) * offsetMm,
      });
    }
  } else if (ent.type === 'blockWall') {
    if (ent.wallMode === 'sec') {
      // Section strip — end-a / end-b length-angle grips + perpendicular
      // rotation ball at the midpoint (mirrors mem2).
      const rot = (ent.rot || 0) * Math.PI / 180;
      const len = ent.lengthMM || 0;
      const cosR = Math.cos(rot), sinR = Math.sin(rot);
      out.push({ key: 'end-a', u: ent.u, v: ent.v });
      out.push({ key: 'end-b', u: ent.u + cosR * len, v: ent.v + sinR * len });
      if (len > 0) {
        const cat = (typeof V25_BLOCK_DB !== 'undefined' && V25_BLOCK_DB[ent.blockKey]) || { thk: 190 };
        const half = (cat.thk || 190) / 2;
        const offsetMm = half + Math.max(80, half * 0.8);
        const midU = ent.u + cosR * (len / 2), midV = ent.v + sinR * (len / 2);
        out.push({ key: 'rotate', shape: 'circle', u: midU + (-sinR) * offsetMm, v: midV + cosR * offsetMm });
      }
    } else {
      // Elevation extent — one mid-edge handle per side. Drag an edge to
      // resize / reposition it (e.g. to set where a break-line sits).
      const w = ent.lengthMM || 0, h = ent.heightMM || 0;
      out.push({ key: 'e-left',   u: ent.u,         v: ent.v + h / 2 });
      out.push({ key: 'e-right',  u: ent.u + w,     v: ent.v + h / 2 });
      out.push({ key: 'e-bottom', u: ent.u + w / 2, v: ent.v });
      out.push({ key: 'e-top',    u: ent.u + w / 2, v: ent.v + h });
    }
  } else if (ent.type === 'clt') {
    const rot = (ent.rot || 0) * Math.PI / 180;
    const cosR = Math.cos(rot), sinR = Math.sin(rot);
    const len = ent.lengthMM || 0;
    if (ent.mode === 'plan') {
      // Face rect — four mid-edge grips (resize) + perpendicular rotation ball.
      const w = len, h = ent.widthMM || 0;
      const X = (lu, lv) => ent.u + lu * cosR - lv * sinR;
      const Y = (lu, lv) => ent.v + lu * sinR + lv * cosR;
      out.push({ key: 'e-left',   u: X(0, h / 2),   v: Y(0, h / 2) });
      out.push({ key: 'e-right',  u: X(w, h / 2),   v: Y(w, h / 2) });
      out.push({ key: 'e-bottom', u: X(w / 2, 0),   v: Y(w / 2, 0) });
      out.push({ key: 'e-top',    u: X(w / 2, h),   v: Y(w / 2, h) });
      if (w > 0 && h > 0) {
        const offsetMm = h + Math.max(60, h * 0.4);
        out.push({ key: 'rotate', shape: 'circle', u: X(w / 2, offsetMm), v: Y(w / 2, offsetMm) });
      }
    } else {
      // Edge strip — end-a / end-b length-angle grips + rotation ball.
      out.push({ key: 'end-a', u: ent.u, v: ent.v });
      out.push({ key: 'end-b', u: ent.u + cosR * len, v: ent.v + sinR * len });
      if (len > 0) {
        const half = ((typeof cltPanelThickness === 'function') ? cltPanelThickness(ent.panel) : 0) / 2 || 60;
        const offsetMm = half + Math.max(80, half * 0.8);
        const midU = ent.u + cosR * (len / 2), midV = ent.v + sinR * (len / 2);
        out.push({ key: 'rotate', shape: 'circle', u: midU + (-sinR) * offsetMm, v: midV + cosR * offsetMm });
      }
    }
  } else if (ent.type === 'leader2') {
    out.push({ key: 'tip', u: ent.tipU, v: ent.tipV });
    out.push({ key: 'txt', u: ent.txtU, v: ent.txtV });
  } else if (ent.type === 'dim2') {
    // p1/p2 endpoint grips + an 'off' grip on the dim-line midpoint. The off
    // grip's real-world position is the px midpoint mapped back through px2real
    // so it lands exactly on the rendered (paper-mm-offset) dim line.
    out.push({ key: 'p1', u: ent.p1u, v: ent.p1v });
    out.push({ key: 'p2', u: ent.p2u, v: ent.p2v });
    const _blk = (typeof activeBlock !== 'undefined') ? activeBlock : null;
    if (_blk && typeof dim2DimLinePx === 'function') {
      const g = dim2DimLinePx(_blk, ent);
      const m = px2real(_blk, g.mid.x, g.mid.y);
      out.push({ key: 'off', shape: 'circle', u: m.u, v: m.v });
    }
  } else if (ent.type === 'anchor' && ent.txtU != null && ent.txtV != null) {
    out.push({ key: 'txt', u: ent.txtU, v: ent.txtV });
  } else if (ent.type === 'bolt2') {
    // Single body grip at the bolt centre — drag to reposition (mirrors the
    // anchor's simple point-move; v25Move's generic body-move translates u,v).
    out.push({ key: 'body', u: ent.u, v: ent.v });
  } else if (ent.type === 'screw') {
    // Single body grip at the screw head — drag to reposition (mirrors bolt2).
    out.push({ key: 'body', u: ent.u, v: ent.v });
  } else if (ent.type === 'stud') {
    // Section: body grip at the bearing plane + an embedment-EDGE grip (drag to
    // re-datum, snaps to host edges) + a TIP grip (drag to set embedment depth),
    // all on the bearing-snapped glyph via the single-source geometry. End-on (or
    // no block): a single body grip at the placed point.
    const g = (typeof studSectionGeom === 'function') ? studSectionGeom(blk, ent) : null;
    if (!g) {
      out.push({ key: 'body', u: ent.u, v: ent.v });
    } else {
      const body = g.Puv(0, 0), face = g.Puv(g.sFace, 0), tip = g.Puv(g.embLen, 0);
      out.push({ key: 'body', u: body[0], v: body[1] });
      out.push({ key: 'stud-face', shape: 'circle', u: face[0], v: face[1] });
      out.push({ key: 'stud-tip', u: tip[0], v: tip[1] });
    }
  }
  // Mat — rotation handle (Bluebeam-style perpendicular ball above the top
  // edge). Same affordance as mem2 so the user has one mental model for
  // "spin this thing". Polygon mats use centroid + furthest-point radius
  // to push the handle outside the visible polygon.
  if (ent.type === 'snapshot') {
    if (ent.flattened) return out;   // snapshot-tools (js/88): locked image shows no grips
    const w = ent.w || 0, h = ent.h || 0;
    const rr = (ent.rot || 0) * Math.PI / 180, cc = Math.cos(rr), ss = Math.sin(rr);
    const cu = ent.u + w / 2, cv = ent.v + h / 2;
    const X = (lx, ly) => cu + lx * cc - ly * ss;
    const Y = (lx, ly) => cv + lx * ss + ly * cc;
    // local frame: u right, v UP. corners + edge-midpoints (pre-rotation), rotated about centre.
    out.push({ key: 'c-bl', u: X(-w/2,-h/2), v: Y(-w/2,-h/2) });
    out.push({ key: 'c-br', u: X( w/2,-h/2), v: Y( w/2,-h/2) });
    out.push({ key: 'c-tr', u: X( w/2, h/2), v: Y( w/2, h/2) });
    out.push({ key: 'c-tl', u: X(-w/2, h/2), v: Y(-w/2, h/2) });
    out.push({ key: 'e-left',   u: X(-w/2, 0), v: Y(-w/2, 0) });
    out.push({ key: 'e-right',  u: X( w/2, 0), v: Y( w/2, 0) });
    out.push({ key: 'e-bottom', u: X(0, -h/2), v: Y(0, -h/2) });
    out.push({ key: 'e-top',    u: X(0,  h/2), v: Y(0,  h/2) });
    const halfH = h / 2, offsetMm = halfH + Math.max(40, halfH * 0.15);
    out.push({ key: 'rotate', shape: 'circle', u: cu + (-ss) * offsetMm, v: cv + (cc) * offsetMm });
    return out;
  }
  if (ent.type === 'mat') {
    const rotRad = (ent.rot || 0) * Math.PI / 180;
    const cosR = Math.cos(rotRad), sinR = Math.sin(rotRad);
    let cu, cv, halfH;
    if (ent.shape === 'poly' && ent.pts && ent.pts.length) {
      const c = _v25MatCentroid(ent);
      cu = c.u; cv = c.v;
      let maxR = 0;
      for (const p of ent.pts) {
        const dx = p.u - cu, dy = p.v - cv;
        const r = Math.hypot(dx, dy);
        if (r > maxR) maxR = r;
      }
      halfH = maxR;
    } else {
      const w = ent.w || 0, h = ent.h || 0;
      cu = ent.u + w / 2; cv = ent.v + h / 2;
      halfH = h / 2;
    }
    const offsetMm = halfH + Math.max(40, halfH * 0.15);
    out.push({
      key: 'rotate', shape: 'circle',
      u: cu + (-sinR) * offsetMm,
      v: cv + ( cosR) * offsetMm,
    });
  }
  return out;
}

// Hover state: which (ent, handle) is the cursor over right now? Used to
// give visual feedback (large/white grip square) and the right cursor.
let v25Hover = null;

// Snap state for the active draw tool. Set by v25TrySnap() in getCursor and
// read by the render loop to draw snap markers / alignment guides.
let v25SnapInfo = null;

// Collect candidate snap points from every v25 entity in the active view —
// vertex / endpoint / corner positions. Used for both endpoint snap and
// alignment snap (Revit-style).
function v25CollectSnapPoints(blk, originU, originV) {
  const arr = (entities2D[blk.viewKey] || []);
  const pts = [];
  for (const ent of arr) {
    if (!ent._v25) continue;
    if (ent.type === 'lineSet' && ent.pts) {
      ent.pts.forEach(p => pts.push({ u: p.u, v: p.v, src: ent.id }));
    } else if (ent.type === 'mem2') {
      const rot = (ent.rot || 0) * Math.PI / 180;
      const len = ent.length || 0;
      pts.push({ u: ent.u, v: ent.v, src: ent.id });
      pts.push({ u: ent.u + Math.cos(rot) * len, v: ent.v + Math.sin(rot) * len, src: ent.id });
      // Also snap to the long edges of the member (top/bottom faces) so the
      // user can connect to flange / wall edges.
      const hd = (typeof v25Mem2HalfDepth === 'function') ? v25Mem2HalfDepth(ent) : 50;
      const cosR = Math.cos(rot), sinR = Math.sin(rot);
      // Far-end-top/bot and near-end-top/bot
      [[0, hd], [0, -hd], [len, hd], [len, -hd]].forEach(p => {
        pts.push({
          u: ent.u + p[0] * cosR - p[1] * sinR,
          v: ent.v + p[0] * sinR + p[1] * cosR,
          src: ent.id,
        });
      });
    } else if (ent.type === 'leader2') {
      pts.push({ u: ent.tipU, v: ent.tipV, src: ent.id });
      pts.push({ u: ent.txtU, v: ent.txtV, src: ent.id });
    } else if (ent.type === 'dim2') {
      pts.push({ u: ent.p1u, v: ent.p1v, src: ent.id });
      pts.push({ u: ent.p2u, v: ent.p2v, src: ent.id });
    } else if (ent.type === 'anchor') {
      pts.push({ u: ent.u, v: ent.v, src: ent.id });
      if (ent.txtU != null && ent.txtV != null) pts.push({ u: ent.txtU, v: ent.txtV, src: ent.id });
    } else if (ent.type === 'stud' || ent.type === 'bolt2' || ent.type === 'screw') {
      // To-scale fixings (ChemSet stud 72j / bolt2 72c / HBS screw 72i): emit
      // the shaft centre so placing a new fixing alignment-snaps onto another
      // fixing's vertical/horizontal line — the "same vertical plane" gauge
      // line. Mirrors the legacy `anchor` branch; the subtle 5px align-v/-h
      // guide + easy break-out come for free from v25TrySnap downstream.
      pts.push({ u: ent.u, v: ent.v, src: ent.id });
    } else if (ent.type === 'mat' && ent.shape === 'poly' && ent.pts) {
      // Polygon mats rotate about centroid — emit rotated-into-world snap
      // points so the user can grab the visible vertices of a tilted poly.
      const rotRad = ent.rot ? (ent.rot * Math.PI / 180) : 0;
      if (!rotRad) {
        ent.pts.forEach(p => pts.push({ u: p.u, v: p.v, src: ent.id }));
      } else {
        const c = _v25MatCentroid(ent);
        const cosR = Math.cos(rotRad), sinR = Math.sin(rotRad);
        ent.pts.forEach(p => {
          const lx = p.u - c.u, ly = p.v - c.v;
          pts.push({
            u: c.u + lx * cosR - ly * sinR,
            v: c.v + lx * sinR + ly * cosR,
            src: ent.id,
          });
        });
      }
    } else if (ent.type === 'mat' || ent.type === 'frame' || ent.type === 'mesh') {
      const w = ent.w || 0, h = ent.h || 0;
      // Mats can be rotated (frames/meshes can't). Transform the 9 axis-aligned
      // snap points (4 corners + 4 edge midpoints + centroid) through the
      // mat's rotation about centroid so the snap targets follow the visible
      // geometry once the user turns ent.rot non-zero.
      const rotRad = (ent.type === 'mat' && ent.rot)
        ? (ent.rot * Math.PI / 180) : 0;
      const cosR = Math.cos(rotRad), sinR = Math.sin(rotRad);
      const cu = ent.u + w / 2, cv = ent.v + h / 2;
      const emit = (lx, ly) => {
        if (!rotRad) {
          pts.push({ u: cu + lx, v: cv + ly, src: ent.id });
        } else {
          pts.push({
            u: cu + lx * cosR - ly * sinR,
            v: cv + lx * sinR + ly * cosR,
            src: ent.id,
          });
        }
      };
      // Corners
      emit(-w/2, -h/2); emit(w/2, -h/2); emit(-w/2, h/2); emit(w/2, h/2);
      // Edge midpoints
      emit(0, -h/2); emit(0, h/2); emit(-w/2, 0); emit(w/2, 0);
      // Centroid
      emit(0, 0);
    } else if (ent.type === 'blockWall') {
      const w = ent.lengthMM || 0, h = ent.heightMM || 0;
      pts.push({ u: ent.u, v: ent.v, src: ent.id });
      pts.push({ u: ent.u + w, v: ent.v, src: ent.id });
      pts.push({ u: ent.u, v: ent.v + h, src: ent.id });
      pts.push({ u: ent.u + w, v: ent.v + h, src: ent.id });
    } else if (ent.type === 'reoBar' && ent.pts) {
      ent.pts.forEach(p => pts.push({ u: p.u, v: p.v, src: ent.id }));
    }
  }
  // Also snap to the polyline-being-drawn's previous vertices (so the user
  // can close a polygon back to its start, for example).
  if (typeof v25State === 'object' && v25State && v25State.polyPts) {
    v25State.polyPts.forEach(p => pts.push({ u: p.u, v: p.v, src: 'self' }));
  }
  // Always include the active "origin" (last placed vertex) so alignment
  // works relative to it even when no other entity exists.
  if (originU != null && originV != null) {
    pts.push({ u: originU, v: originV, src: 'origin' });
  }
  return pts;
}

// Constrain (cu, cv) to be orthogonal (horizontal OR vertical) relative to
// (lastU, lastV). The dominant axis wins — whichever delta is bigger keeps
// its value; the other collapses to the previous vertex's coordinate.
function v25OrthoSnap(lastU, lastV, cu, cv) {
  const du = cu - lastU, dv = cv - lastV;
  if (Math.abs(du) >= Math.abs(dv)) return { u: cu, v: lastV };
  return { u: lastU, v: cv };
}

// Try to snap the cursor in 2D mode for v25 draw tools.
//   1) Endpoint snap — within 8 px of any vertex/end.
//   2) Alignment snap — within 5 px of the H- or V-line through any anchor
//      (Revit-style "stretchy" alignment guide).
// Returns null or an object: { u, v, type:'endpoint'|'align-h'|'align-v', anchor:{u,v} }.
function v25TrySnap(blk, u, v, originU, originV) {
  if (sheetMode !== '2d') return null;
  if (!tool || !tool.startsWith('v25-')) return null;
  if (!snapOn) return null;

  const cursorPx = real2px(blk, u, v);
  const pts = v25CollectSnapPoints(blk, originU, originV);
  if (!pts.length) return null;

  // Endpoint snap — only when Shift is NOT held. Shift means user wants to
  // place freely (or, for v25-hatch, on an ortho line) without being yanked
  // exactly onto an existing vertex.
  if (!shiftHeld) {
    const ENDPOINT_TOL_PX = 8;
    let bestEnd = null, bestEndDist = Infinity;
    for (const p of pts) {
      const pp = real2px(blk, p.u, p.v);
      const d = Math.hypot(pp.x - cursorPx.x, pp.y - cursorPx.y);
      if (d < ENDPOINT_TOL_PX && d < bestEndDist) { bestEnd = p; bestEndDist = d; }
    }
    if (bestEnd) return { u: bestEnd.u, v: bestEnd.v, type: 'endpoint', anchor: bestEnd };

    // V25 truss helpers — collect all elevation-mem2 centrelines in the view,
    // then look for two high-value snap kinds:
    //   1. centreline-intersection — where two member centrelines cross →
    //      snap to that intersection (so multiple braces share a truss node).
    //   2. centreline-projection — perpendicular projection of cursor onto
    //      any centreline → snap onto the chord centreline anywhere along
    //      its length (the engineering-model truss workflow).
    const arr = (entities2D[blk.viewKey] || []);
    const cls = [];
    for (const ent of arr) {
      if (!ent || ent.type !== 'mem2') continue;
      if ((ent.aspect || 'elev') === 'sec') continue;
      if (!(ent.length > 0)) continue;
      const cl = (typeof v25Mem2WorldCentreline === 'function')
        ? v25Mem2WorldCentreline(ent) : null;
      if (cl) cls.push({ ent, a: cl[0], b: cl[1] });
    }
    // 1) centreline ∩ centreline
    const INT_TOL_PX = 12;
    let bestInt = null, bestIntDist = Infinity;
    for (let i = 0; i < cls.length; i++) {
      for (let j = i + 1; j < cls.length; j++) {
        const hit = (typeof _v25SegSegIntersect === 'function')
          ? _v25SegSegIntersect(cls[i].a, cls[i].b, cls[j].a, cls[j].b) : null;
        if (!hit) continue;
        const pp = real2px(blk, hit.u, hit.v);
        const d = Math.hypot(pp.x - cursorPx.x, pp.y - cursorPx.y);
        if (d < INT_TOL_PX && d < bestIntDist) {
          bestIntDist = d;
          bestInt = { u: hit.u, v: hit.v };
        }
      }
    }
    if (bestInt) return { u: bestInt.u, v: bestInt.v, type: 'centreline-int', anchor: bestInt };

    // 2) cursor → perpendicular projection onto a centreline
    const PROJ_TOL_PX = 10;
    let bestProj = null, bestProjDist = Infinity;
    for (const c of cls) {
      const ax = c.a[0], ay = c.a[1], bx = c.b[0], by = c.b[1];
      const dx = bx - ax, dy = by - ay;
      const lenSq = dx * dx + dy * dy;
      if (lenSq < 1e-6) continue;
      let t = ((u - ax) * dx + (v - ay) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
      const px = ax + t * dx, py = ay + t * dy;
      const ppPx = real2px(blk, px, py);
      const d = Math.hypot(ppPx.x - cursorPx.x, ppPx.y - cursorPx.y);
      if (d < PROJ_TOL_PX && d < bestProjDist) {
        bestProjDist = d;
        bestProj = { u: px, v: py, hostId: c.ent.id };
      }
    }
    if (bestProj) return {
      u: bestProj.u, v: bestProj.v,
      type: 'centreline-proj',
      anchor: bestProj,
    };
  }

  // Alignment snap — orthogonal projection onto H or V axis through any anchor.
  // For v25-hatch we keep it active while Shift is held so rectangles close
  // cleanly to the existing corners. Other v25 tools fall back to the legacy
  // "Shift bypasses snap" behaviour.
  if (shiftHeld && tool !== 'v25-hatch') return null;

  const ALIGN_TOL_PX = 5;
  let bestH = null, bestV = null, bestHDist = Infinity, bestVDist = Infinity;
  for (const p of pts) {
    const pp = real2px(blk, p.u, p.v);
    const dyH = Math.abs(pp.y - cursorPx.y);
    if (dyH < ALIGN_TOL_PX && dyH < bestHDist) { bestH = p; bestHDist = dyH; }
    const dxV = Math.abs(pp.x - cursorPx.x);
    if (dxV < ALIGN_TOL_PX && dxV < bestVDist) { bestV = p; bestVDist = dxV; }
  }
  // Corner snap: cursor is simultaneously near the H-line through one vertex
  // AND the V-line through another → snap to the perpendicular intersection.
  // This is what makes "close the rectangle" feel automatic.
  if (bestH && bestV) {
    return {
      u: bestV.u, v: bestH.v, type: 'align-corner',
      anchorH: bestH, anchorV: bestV,
      anchor: { u: bestV.u, v: bestH.v },
    };
  }
  // Single-axis alignment.
  if (bestH && (!bestV || bestHDist <= bestVDist)) {
    return { u, v: bestH.v, type: 'align-h', anchor: bestH };
  }
  if (bestV) {
    return { u: bestV.u, v, type: 'align-v', anchor: bestV };
  }
  return null;
}

// Render snap indicator + alignment guide line. Called from the render loop
// after entities draw, while a v25 draw tool is active.
function v25DrawSnapIndicator(blk, cs) {
  if (!v25SnapInfo) return;
  const col = '#f29f1d'; // orange — distinct from selection blue
  const cursorPx = real2px(blk, v25SnapInfo.u, v25SnapInfo.v);
  ctx.save();
  if (v25SnapInfo.type === 'endpoint') {
    // Filled square at the snap point
    ctx.fillStyle = col;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.rect(cursorPx.x - 5, cursorPx.y - 5, 10, 10);
    ctx.stroke();
    ctx.fillStyle = 'rgba(242,159,29,0.3)';
    ctx.fill();
  } else if (v25SnapInfo.type === 'centreline-int') {
    // Centreline-intersection (truss node): chain-dot ring with crosshair.
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(cursorPx.x, cursorPx.y, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cursorPx.x - 9, cursorPx.y); ctx.lineTo(cursorPx.x + 9, cursorPx.y);
    ctx.moveTo(cursorPx.x, cursorPx.y - 9); ctx.lineTo(cursorPx.x, cursorPx.y + 9);
    ctx.stroke();
  } else if (v25SnapInfo.type === 'centreline-proj') {
    // Cursor projected onto a member centreline: small "perpendicular" tick.
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(cursorPx.x, cursorPx.y, 4.5, 0, Math.PI * 2);
    ctx.stroke();
    // Tiny tick across showing it's on a line, not a point.
    ctx.beginPath();
    ctx.moveTo(cursorPx.x - 8, cursorPx.y); ctx.lineTo(cursorPx.x + 8, cursorPx.y);
    ctx.stroke();
  } else if (v25SnapInfo.type === 'align-h' || v25SnapInfo.type === 'align-v') {
    // Dashed alignment line from anchor to cursor + small marker on anchor
    const anchorPx = real2px(blk, v25SnapInfo.anchor.u, v25SnapInfo.anchor.v);
    ctx.strokeStyle = col;
    ctx.lineWidth = 0.8;
    ctx.setLineDash([4, 4]);
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    if (v25SnapInfo.type === 'align-h') {
      // Horizontal line through anchor.y
      ctx.moveTo(anchorPx.x, cursorPx.y);
      ctx.lineTo(cursorPx.x, cursorPx.y);
    } else {
      ctx.moveTo(cursorPx.x, anchorPx.y);
      ctx.lineTo(cursorPx.x, cursorPx.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    // Small cross at the anchor
    ctx.beginPath();
    ctx.moveTo(anchorPx.x - 4, anchorPx.y); ctx.lineTo(anchorPx.x + 4, anchorPx.y);
    ctx.moveTo(anchorPx.x, anchorPx.y - 4); ctx.lineTo(anchorPx.x, anchorPx.y + 4);
    ctx.stroke();
    // Crosshair at cursor
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(cursorPx.x, cursorPx.y, 4, 0, Math.PI * 2);
    ctx.stroke();
  } else if (v25SnapInfo.type === 'align-corner') {
    // Perpendicular corner: dashed lines from BOTH anchors meeting at the
    // snap point, with a small filled square marker — reads as "you're at
    // the rectangle corner".
    const anchorVPx = real2px(blk, v25SnapInfo.anchorV.u, v25SnapInfo.anchorV.v);
    const anchorHPx = real2px(blk, v25SnapInfo.anchorH.u, v25SnapInfo.anchorH.v);
    ctx.strokeStyle = col;
    ctx.lineWidth = 0.8;
    ctx.setLineDash([4, 4]);
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    // Vertical guide from anchorV's V-line through cursor
    ctx.moveTo(anchorVPx.x, anchorVPx.y);
    ctx.lineTo(cursorPx.x, cursorPx.y);
    // Horizontal guide from anchorH's H-line through cursor
    ctx.moveTo(anchorHPx.x, anchorHPx.y);
    ctx.lineTo(cursorPx.x, cursorPx.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    // Filled square at the corner snap point
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.rect(cursorPx.x - 5, cursorPx.y - 5, 10, 10);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

// selection-highlight-consistency (2026-06-04) — entity types whose selection
// gets the subtle translucent accent fill (the "shading"), matching the v2
// plate. Members, fixings and filled regions read as "picked" at a glance; pure
// annotations / borders (dims, leaders, reo lines, viewport frames) stay
// outline-only so the wash stays signal, not noise.
const V25_SEL_FILL_TYPES = new Set(['mem2', 'mat', 'mesh', 'blockWall', 'stiff2', 'anchor', 'screw', 'stud', 'bolt2', 'clt']);

// Oriented rod rectangle hugging a fastener's DRAWN glyph (stud / screw / bolt2).
// Built from the bearing/clamp-recentred centreline (v25FastenerCentreline) ±
// the widest transverse half (washer / head), so the highlight hugs the snapped
// glyph instead of the raw-click bbox — the fix for the "offset selection box".
function _v25FastenerFootprintPoly(ent, blk) {
  const cl = (typeof v25FastenerCentreline === 'function') ? v25FastenerCentreline(blk, ent) : null;
  if (!cl) return null;
  if (cl.kind === 'pt') {                       // end-on glyph → square at the head/washer Ø
    const r = cl.radMm || 10;
    return [{ u: cl.u - r, v: cl.v - r }, { u: cl.u + r, v: cl.v - r },
            { u: cl.u + r, v: cl.v + r }, { u: cl.u - r, v: cl.v + r }];
  }
  if (cl.kind !== 'seg') return null;
  let halfW = 10;
  if (ent.type === 'stud') {
    const S = (typeof getStudSpec === 'function' && getStudSpec(ent.studSpec))
            || (typeof CHEMSET_STUDS === 'object' && CHEMSET_STUDS[ent.studSpec]) || { size: 'M16', d: 16 };
    const nd = (typeof studDims === 'function') ? studDims(S.size, S.d || 16) : { washOD: (S.d || 16) * 2.1 };
    halfW = (nd.washOD || (S.d || 16) * 2.1) / 2;
  } else if (ent.type === 'screw') {
    const S = (typeof getScrewSpec === 'function' && getScrewSpec(ent.screwSpec))
            || (typeof HBS_PLATE_SCREWS === 'object' && HBS_PLATE_SCREWS[ent.screwSpec]) || { dK: 16.5 };
    halfW = (S.dK || 16.5) / 2;
  } else if (ent.type === 'bolt2') {
    const b = (typeof BOLT_DB === 'object' && (BOLT_DB[ent.size] || BOLT_DB.M20)) || { washOD: 44, d: 20 };
    halfW = (b.washOD || (b.d || 20) * 1.85) / 2;
  }
  const dx = cl.b.u - cl.a.u, dy = cl.b.v - cl.a.v, len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len * halfW, ny = dx / len * halfW;
  return [{ u: cl.a.u + nx, v: cl.a.v + ny }, { u: cl.b.u + nx, v: cl.b.v + ny },
          { u: cl.b.u - nx, v: cl.b.v - ny }, { u: cl.a.u - nx, v: cl.a.v - ny }];
}

// Footprint polygon (world u,v) for a selected entity's highlight: oriented for
// members / rotated mats / section walls + fasteners so the outline + fill hug
// the visible geometry; axis-aligned bbox for everything else. dim2 is handled by
// its own halo before this is called; returns null when there's no sensible
// footprint. `blk` (optional) lets the fastener branch recentre on the snapped
// glyph — callers in the selection-highlight pass already have it.
function v25SelFootprint(ent, blk) {
  if (!ent) return null;
  const t = ent.type;
  // Oriented member rectangle (elevation / plan), or a square for a pure
  // cross-section glyph (length 0 / aspect 'sec').
  if (t === 'mem2') {
    const len = ent.length || 0;
    const hd = (typeof v25Mem2HalfDepth === 'function') ? v25Mem2HalfDepth(ent) : 50;
    if ((ent.aspect || 'elev') === 'sec' || len === 0) {
      // GLT sections are strongly non-square (e.g. 165×480) — hug the true
      // breadth×depth glyph (spun by roll) via the tight WorldOutline rather than
      // the depth² square the other section types fall back to, so the selection
      // halo matches the drawn member (and the precise hit-test / hover).
      if (ent.memberType === 'glt' && typeof v25Mem2WorldOutline === 'function') {
        const oc = v25Mem2WorldOutline(ent);
        if (oc && oc.length >= 3) return oc.map(p => ({ u: p[0], v: p[1] }));
      }
      return [{ u: ent.u - hd, v: ent.v - hd }, { u: ent.u + hd, v: ent.v - hd },
              { u: ent.u + hd, v: ent.v + hd }, { u: ent.u - hd, v: ent.v + hd }];
    }
    const r = (ent.rot || 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    return [[0, -hd], [len, -hd], [len, hd], [0, hd]].map(([lx, ly]) => ({
      u: ent.u + lx * c - ly * s, v: ent.v + lx * s + ly * c }));
  }
  // Mat — rotated rect or (rotated) polygon, hugging the visible shape.
  if (t === 'mat') {
    const r = (ent.rot || 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    if (ent.shape === 'poly' && ent.pts && ent.pts.length) {
      if (!r) return ent.pts.map(p => ({ u: p.u, v: p.v }));
      const ce = (typeof _v25MatCentroid === 'function') ? _v25MatCentroid(ent) : { u: 0, v: 0 };
      return ent.pts.map(p => {
        const lx = p.u - ce.u, ly = p.v - ce.v;
        return { u: ce.u + lx * c - ly * s, v: ce.v + lx * s + ly * c };
      });
    }
    const w = ent.w || 0, h = ent.h || 0, cu = ent.u + w / 2, cv = ent.v + h / 2;
    return [[-w/2, -h/2], [w/2, -h/2], [w/2, h/2], [-w/2, h/2]].map(([lx, ly]) => ({
      u: cu + lx * c - ly * s, v: cv + lx * s + ly * c }));
  }
  // CLT panel — oriented strip (edge: length × layup thickness) or rect
  // (plan: length × width), via the shared world-outline helper.
  if (t === 'clt' && typeof cltWorldOutline === 'function') {
    const oc = cltWorldOutline(ent);
    if (oc && oc.length >= 3) return oc.map(p => ({ u: p.u, v: p.v }));
  }
  // Section block wall — oriented thin strip (width = block thickness).
  if (t === 'blockWall' && ent.wallMode === 'sec') {
    const len = ent.lengthMM || 0;
    const cat = (typeof V25_BLOCK_DB !== 'undefined' && V25_BLOCK_DB[ent.blockKey]) || { thk: 190 };
    const half = (cat.thk || 190) / 2, r = (ent.rot || 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    return [[0, -half], [len, -half], [len, half], [0, half]].map(([lx, ly]) => ({
      u: ent.u + lx * c - ly * s, v: ent.v + lx * s + ly * c }));
  }
  // Fasteners (stud / screw / bolt2) — oriented rod rectangle hugging the
  // bearing/clamp-recentred glyph (NOT the raw-click bbox, which is offset once
  // the glyph snaps to a face). The fix for the "offset selection box".
  if (t === 'stud' || t === 'screw' || t === 'bolt2') {
    const fp = (typeof _v25FastenerFootprintPoly === 'function') ? _v25FastenerFootprintPoly(ent, blk) : null;
    if (fp) return fp;
  }
  // Everything else — axis-aligned bbox corners.
  const b = (typeof v25EntBounds === 'function') ? v25EntBounds(ent) : null;
  if (!b) return null;
  return [{ u: b.L, v: b.T }, { u: b.R, v: b.T }, { u: b.R, v: b.B }, { u: b.L, v: b.B }];
}

function v25DrawSelectionHighlight(blk, cs) {
  if (sheetMode !== '2d') return;
  // GLT-notch (72m) — while a member is armed for cutting, the amber notch glow
  // (drawClickPreview → v25NotchPreview) stands in for the selection highlight,
  // so suppress the dashed terracotta box to keep the gesture clean.
  if (tool === 'v25-notch') return;
  const col = cs.getPropertyValue('--selected-color').trim() || '#4a90e2';
  // Faint dashed outline around each selected entity. Mat entities draw a
  // tight rotated outline (matching the visible polygon) when ent.rot is
  // non-zero; everything else falls back to an axis-aligned bbox.
  if (v25Selected.length) {
    // selection-highlight-consistency (2026-06-04) — unified treatment matching
    // the v2 plate (drawV2PlateSelection): a subtle translucent accent fill over
    // the entity footprint + a clean solid accent outline. Replaces the old
    // faint dashed-only box so a selected member / fixing reads as clearly as a
    // selected plate (and the plate, dialled back to match, no longer looks
    // heavier than everything else). Annotation / linear types (dims, leaders,
    // reo lines, viewport frames) stay outline-only — a wash over a leader or a
    // border would be noise, not signal.
    const fillCol = (typeof colorAlpha === 'function') ? colorAlpha(col, 0.12) : col;
    for (const id of v25Selected) {
      const ent = (entities2D[blk.viewKey] || []).find(e => e.id === id);
      if (!ent) continue;
      // Dimension — NO bounding box (it would cover the members being
      // dimensioned). Instead trace a soft halo along the dim + witness lines so
      // it reads as a selected "line with nodes"; the grips draw on top below.
      if (ent.type === 'dim2') {
        if (typeof dim2DimLinePx === 'function') {
          const g = dim2DimLinePx(blk, ent);
          ctx.save();
          ctx.setLineDash([]); ctx.globalAlpha = 0.30; ctx.lineWidth = 3.5;
          ctx.lineCap = 'round'; ctx.strokeStyle = col;
          ctx.beginPath();
          ctx.moveTo(g.d1.x, g.d1.y); ctx.lineTo(g.d2.x, g.d2.y);
          ctx.moveTo(g.w1.x, g.w1.y); ctx.lineTo(g.d1.x, g.d1.y);
          ctx.moveTo(g.w2.x, g.w2.y); ctx.lineTo(g.d2.x, g.d2.y);
          ctx.stroke();
          ctx.restore();
        }
        continue;
      }
      // Footprint polygon (oriented for members / rotated mats / section walls,
      // axis-aligned bbox otherwise). Shade solid-object types with the subtle
      // fill; everything draws the same solid outline.
      const fp = v25SelFootprint(ent, blk);
      if (!fp || fp.length < 2) continue;
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
      ctx.beginPath();
      fp.forEach((p, i) => {
        const sp = real2px(blk, p.u, p.v);
        if (i === 0) ctx.moveTo(sp.x, sp.y); else ctx.lineTo(sp.x, sp.y);
      });
      ctx.closePath();
      if (fp.length >= 3 && V25_SEL_FILL_TYPES.has(ent.type)) {
        ctx.fillStyle = fillCol;
        ctx.fill();
      }
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
  // Filled grip squares at every editable handle on each selected entity.
  // Bluebeam-style — pop on hover.
  for (const id of v25Selected) {
    const ent = (entities2D[blk.viewKey] || []).find(e => e.id === id);
    if (!ent) continue;
    const handles = v25EntHandles(ent, blk);
    handles.forEach(h => {
      const p = real2px(blk, h.u, h.v);
      const isHover = (v25Hover && v25Hover.entId === ent.id && v25Hover.handle === h.key);
      const sz = isHover ? 9 : 7;
      ctx.fillStyle = isHover ? '#ffffff' : col;
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.4;
      if (h.shape === 'circle') {
        // Dashed connector from anchor (member midpoint or mat centroid) to
        // the rotation ball so the user can see what the handle is anchored
        // to and what the rotation pivot is.
        if (h.key === 'rotate' && (ent.type === 'mem2' || ent.type === 'mat' || ent.type === 'blockWall' || ent.type === 'clt')) {
          let mU, mV;
          if (ent.type === 'clt') {
            // edge strip → midpoint of the draw line; plan rect → its centre.
            const r2 = (ent.rot || 0) * Math.PI / 180, c2 = Math.cos(r2), s2 = Math.sin(r2);
            const lenR = ent.lengthMM || 0;
            if (ent.mode === 'plan') {
              const w2 = lenR, h2 = ent.widthMM || 0;
              mU = ent.u + c2 * (w2 / 2) - s2 * (h2 / 2);
              mV = ent.v + s2 * (w2 / 2) + c2 * (h2 / 2);
            } else {
              mU = ent.u + c2 * (lenR / 2);
              mV = ent.v + s2 * (lenR / 2);
            }
          } else if (ent.type === 'mem2' || ent.type === 'blockWall') {
            const r2 = (ent.rot || 0) * Math.PI / 180;
            const lenR = (ent.type === 'blockWall') ? (ent.lengthMM || 0) : (ent.length || 0);
            mU = ent.u + Math.cos(r2) * (lenR / 2);
            mV = ent.v + Math.sin(r2) * (lenR / 2);
          } else {
            const c = _v25MatCentroid(ent);
            mU = c.u; mV = c.v;
          }
          const mP = real2px(blk, mU, mV);
          ctx.save();
          ctx.strokeStyle = col; ctx.lineWidth = 0.8;
          ctx.setLineDash([2, 2]);
          ctx.beginPath();
          ctx.moveTo(mP.x, mP.y); ctx.lineTo(p.x, p.y);
          ctx.stroke();
          ctx.restore();
        }
        const r = sz / 2 + 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.rect(p.x - sz/2, p.y - sz/2, sz, sz);
        ctx.fill();
        ctx.stroke();
      }
    });
  }
  // Hover pre-highlight (Revit-style) — trace the REAL outline of the entity a
  // click would select (incl. a v2 plate, whose synthetic ent rides on
  // v25Hover.ent) so the user sees the EXACT target before committing — the
  // visual counterpart of the precise, specificity-ranked pick. Skip if it's
  // already selected. handle===null ⇒ the cursor is over an UNSELECTED entity.
  // Wrapped defensively: hover is non-critical, so a geometry edge case must
  // never throw out of the render loop.
  if (v25Hover && v25Hover.handle === null && v25Hover.ent) {
    const he = v25Hover.ent;
    const selV1 = !he._v2Plate && v25Selected.includes(he.id);
    const selV2 = he._v2Plate && Array.isArray(window.v25SelPlateIds) && window.v25SelPlateIds.includes(he._v2Id);
    if (!selV1 && !selV2 && typeof v25DrawHoverPrehighlight === 'function') {
      try { v25DrawHoverPrehighlight(blk, cs, he); } catch (_e) { /* non-critical */ }
    }
  }
}

// ============================================================
// Hover pre-highlight (Revit-style "show what a click will select").
// v25HoverOutline returns the entity's REAL silhouette / stroke in WORLD
// coords; v25DrawHoverPrehighlight strokes it as a soft glow. Mirrors the
// precise pick (v25EntHit) so the highlight always matches what gets selected.
// ============================================================

// World silhouette polygon for a mat (rect or rotated poly). Same geometry
// v25EntHit's 'mat' branch tests, so the highlight tracks the pickable area.
function v25MatPolyWorld(ent) {
  const rotDeg = ent.rot || 0;
  if (ent.shape === 'poly' && Array.isArray(ent.pts) && ent.pts.length >= 3) {
    if (!rotDeg) return ent.pts.map(p => ({ u: p.u, v: p.v }));
    const rr = rotDeg * Math.PI / 180, cc = Math.cos(rr), ss = Math.sin(rr);
    const c = (typeof _v25MatCentroid === 'function')
      ? _v25MatCentroid(ent)
      : (function () { let u = 0, v = 0; ent.pts.forEach(p => { u += p.u; v += p.v; }); return { u: u / ent.pts.length, v: v / ent.pts.length }; })();
    return ent.pts.map(p => { const lx = p.u - c.u, ly = p.v - c.v; return { u: c.u + lx * cc - ly * ss, v: c.v + lx * ss + ly * cc }; });
  }
  const w = ent.w || 0, h = ent.h || 0;
  if (!rotDeg) return [{ u: ent.u, v: ent.v }, { u: ent.u + w, v: ent.v }, { u: ent.u + w, v: ent.v + h }, { u: ent.u, v: ent.v + h }];
  const rr = rotDeg * Math.PI / 180, cc = Math.cos(rr), ss = Math.sin(rr);
  const cu = ent.u + w / 2, cv = ent.v + h / 2;
  return [[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]].map(([lx, ly]) => ({ u: cu + lx * cc - ly * ss, v: cv + lx * ss + ly * cc }));
}

// World silhouette polygon for a blockWall (section strip or elevation rect).
function v25BlockWallPolyWorld(ent) {
  if (ent.wallMode === 'sec') {
    const len = ent.lengthMM || 0;
    const cat = (typeof V25_BLOCK_DB !== 'undefined' && V25_BLOCK_DB[ent.blockKey]) || { thk: 190 };
    const half = (cat.thk || 190) / 2;
    const rr = (ent.rot || 0) * Math.PI / 180, cc = Math.cos(rr), ss = Math.sin(rr);
    return [[0,-half],[len,-half],[len,half],[0,half]].map(([lx, ly]) => ({ u: ent.u + lx * cc - ly * ss, v: ent.v + lx * ss + ly * cc }));
  }
  const w = ent.lengthMM || 0, h = ent.heightMM || 0;
  return [{ u: ent.u, v: ent.v }, { u: ent.u + w, v: ent.v }, { u: ent.u + w, v: ent.v + h }, { u: ent.u, v: ent.v + h }];
}

// World centreline of a fastener (screw / bolt2 / stud) in a SECTION orientation,
// or the head/washer circle for an end-on glyph. GEOMETRY MIRROR of
// v25FastenerHit's section axis math (same file) — KEEP IN SYNC so the hover
// halo lands on the exact drawn (bearing/clamp-re-centred) axis the pick uses.
// Returns { kind:'seg', a:{u,v}, b:{u,v} } | { kind:'pt', u, v, radMm } | null.
function v25FastenerCentreline(blk, ent) {
  const t = ent.type;
  if (t === 'screw') {
    const S = (typeof getScrewSpec === 'function' && getScrewSpec(ent.screwSpec))
            || (typeof HBS_PLATE_SCREWS === 'object' && HBS_PLATE_SCREWS[ent.screwSpec])
            || { d: 10, dK: 16.5, tK: 5, L: 120 };
    const orient = ent.screwOrient || 'end';
    if (orient === 'end') return { kind: 'pt', u: ent.u, v: ent.v, radMm: (S.dK || 16.5) / 2 };
    const axisIsU = (orient === 'h-headL' || orient === 'h-headR');
    const trans = axisIsU ? ent.v : ent.u;
    const bodyDir = (orient === 'h-headL' || orient === 'v-headB') ? 1 : -1;
    const d = S.d || 10, tK = S.tK || d * 0.56, L = S.L || d * 12;
    const headLen = 1.80 * d, sBear = Math.min(tK, headLen * 0.45);
    const bearing = (typeof v25ScrewBearingFace === 'function') ? v25ScrewBearingFace(blk, ent) : null;
    const junction = (bearing != null) ? bearing : (axisIsU ? ent.u : ent.v);
    const axisAt = (s) => junction + bodyDir * (s - sBear);
    const a0 = axisAt(-2), aL = axisAt(L + 2);
    return axisIsU ? { kind: 'seg', a: { u: a0, v: trans }, b: { u: aL, v: trans } }
                   : { kind: 'seg', a: { u: trans, v: a0 }, b: { u: trans, v: aL } };
  }
  if (t === 'stud') {
    const S = (typeof getStudSpec === 'function' && getStudSpec(ent.studSpec))
            || (typeof CHEMSET_STUDS === 'object' && CHEMSET_STUDS[ent.studSpec])
            || { size: 'M16', d: 16, L: 190, Le: 165 };
    const nd = (typeof studDims === 'function') ? studDims(S.size, S.d || 16) : { washOD: (S.d || 16) * 2.1 };
    const halfWO = (nd.washOD || (S.d || 16) * 2.1) / 2;
    const orient = ent.studOrient || 'v-nutT';
    if (orient === 'end') return { kind: 'pt', u: ent.u, v: ent.v, radMm: halfWO };
    const g = (typeof studSectionGeom === 'function') ? studSectionGeom(blk, ent) : null;
    if (!g) return { kind: 'pt', u: ent.u, v: ent.v, radMm: halfWO };
    const a0 = g.axisAt(g.sTailTop - 3), aL = g.axisAt(g.embLen + 3);
    return g.axisIsU ? { kind: 'seg', a: { u: a0, v: g.trans }, b: { u: aL, v: g.trans } }
                     : { kind: 'seg', a: { u: g.trans, v: a0 }, b: { u: g.trans, v: aL } };
  }
  // bolt2
  const b = (typeof BOLT_DB === 'object' && (BOLT_DB[ent.size] || BOLT_DB.M20))
          || { d: 20, pitch: 2.5, headH: 13, nutH: 16, washOD: 44, washT: 4 };
  const orient = ent.boltOrient || 'end';
  if (orient === 'end' || !ent.boltOrient) return { kind: 'pt', u: ent.u, v: ent.v, radMm: (b.washOD || b.d * 1.85) / 2 };
  let span = (typeof v25BoltClampSpan === 'function') ? v25BoltClampSpan(blk, ent) : null;
  const horiz = (orient === 'h-nutR' || orient === 'h-nutL');
  if (!span) span = { grip: 20, centre: (horiz ? ent.u : ent.v),
    length: (typeof computeBoltLength === 'function') ? computeBoltLength(20, ent.size) : 60 };
  const hG = span.grip / 2;
  const dir = (orient === 'h-nutR' || orient === 'v-nutB') ? 1 : -1;
  const gripHead = horiz ? (span.centre - dir * hG) : (span.centre + dir * hG);
  const gripNut  = horiz ? (span.centre + dir * hG) : (span.centre - dir * hG);
  const headOut = horiz ? -dir : dir, nutOut = -headOut;
  const headOuter = gripHead + headOut * ((b.washT || 4) + (b.headH || 13));
  const nutOuter  = gripNut  + nutOut  * ((b.washT || 4) + (b.nutH || 16));
  const threadProt = (span.threadProt != null) ? span.threadProt
    : Math.max(2 * (b.pitch || 2.5), (span.length || 0) - (span.grip + 2 * (b.washT || 4) + (b.nutH || 16)));
  const threadTip = nutOuter + nutOut * threadProt;
  const lo = Math.min(headOuter, threadTip) - 4, hi = Math.max(headOuter, threadTip) + 4;
  const trans = horiz ? ent.v : ent.u;
  return horiz ? { kind: 'seg', a: { u: lo, v: trans }, b: { u: hi, v: trans } }
               : { kind: 'seg', a: { u: trans, v: lo }, b: { u: trans, v: hi } };
}

// World outline of any entity for the hover pre-highlight.
// Returns { closed:[poly...], open:[polyline...], circles:[{u,v,rMm}...] }.
function v25HoverOutline(blk, ent) {
  const out = { closed: [], open: [], circles: [] };
  if (!ent) return out;
  const t = ent.type;
  const bboxClosed = () => { const b = v25EntBounds(ent); if (b) out.closed.push([{ u: b.L, v: b.B }, { u: b.R, v: b.B }, { u: b.R, v: b.T }, { u: b.L, v: b.T }]); };
  // v2 plate (synthetic ent) — real polygon from the v2 model.
  if (ent._v2Plate) {
    const model = (window.v2 && v2.appState && v2.appState.model) ? v2.appState.model : null;
    const el = (model && model.elements && typeof model.elements.get === 'function') ? model.elements.get(ent._v2Id) : null;
    const g = el && el.geometry;
    if (g && Array.isArray(g.polygon) && g.polygon.length >= 3) out.closed.push(g.polygon.map(p => ({ u: (+p.x || 0), v: (+p.y || 0) })));
    return out;
  }
  if (t === 'mem2') {
    const oc = (typeof v25Mem2WorldOutline === 'function') ? v25Mem2WorldOutline(ent) : null;
    if (oc && oc.length >= 3) out.closed.push(oc.map(p => ({ u: p[0], v: p[1] }))); else bboxClosed();
    return out;
  }
  if (t === 'mat') { out.closed.push(v25MatPolyWorld(ent)); return out; }
  if (t === 'blockWall') { out.closed.push(v25BlockWallPolyWorld(ent)); return out; }
  if (t === 'clt') {
    const oc = (typeof cltWorldOutline === 'function') ? cltWorldOutline(ent) : null;
    if (oc && oc.length >= 3) out.closed.push(oc.map(p => ({ u: p.u, v: p.v }))); else bboxClosed();
    return out;
  }
  if (t === 'lineSet' || t === 'line' || t === 'reoBar') {
    if (ent.pts && ent.pts.length) { const poly = ent.pts.map(p => ({ u: p.u, v: p.v })); (ent.closed ? out.closed : out.open).push(poly); }
    return out;
  }
  if (t === 'leader2') { out.open.push([{ u: ent.tipU, v: ent.tipV }, { u: ent.txtU, v: ent.txtV }]); return out; }
  if (t === 'anchor') {
    const def = (typeof V25_ANCHOR_DB === 'object' && (V25_ANCHOR_DB[ent.kind] || V25_ANCHOR_DB.chemset)) || {};
    const totalLen = ent.embed || (def.defaults && def.defaults.embed) || 100;
    const rot = (ent.rot || 0) * Math.PI / 180, s = Math.sin(rot), c = Math.cos(rot);
    out.open.push([{ u: ent.u, v: ent.v }, { u: ent.u + totalLen * s, v: ent.v - totalLen * c }]);
    return out;
  }
  if (t === 'screw' || t === 'bolt2' || t === 'stud') {
    const cl = (typeof v25FastenerCentreline === 'function') ? v25FastenerCentreline(blk, ent) : null;
    if (cl && cl.kind === 'seg') out.open.push([cl.a, cl.b]);
    else if (cl && cl.kind === 'pt') out.circles.push({ u: cl.u, v: cl.v, rMm: cl.radMm });
    else bboxClosed();
    return out;
  }
  // mesh / txtBox / stiff2 / noteBox / frame / unknown → bbox rect.
  bboxClosed();
  return out;
}

// Stroke a px polyline/polygon as a soft glow under a crisp line. SOLID (vs the
// DASHED selection outline) so hover and selection read as different states.
function _v25HoverStrokePx(col, ptsPx, closed) {
  if (!ptsPx || ptsPx.length < 2) return;
  ctx.save();
  ctx.setLineDash([]); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = col;
  for (const pass of [{ w: 4.5, a: 0.16 }, { w: 1.4, a: 0.8 }]) {
    ctx.globalAlpha = pass.a; ctx.lineWidth = pass.w;
    ctx.beginPath();
    ptsPx.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    if (closed) ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}
function _v25HoverStrokeCircle(col, x, y, r) {
  ctx.save();
  ctx.setLineDash([]); ctx.strokeStyle = col;
  for (const pass of [{ w: 4.5, a: 0.16 }, { w: 1.4, a: 0.8 }]) {
    ctx.globalAlpha = pass.a; ctx.lineWidth = pass.w;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.stroke();
  }
  ctx.restore();
}

// Draw the hover pre-highlight for one entity (real ent or synthetic v2 plate).
function v25DrawHoverPrehighlight(blk, cs, ent) {
  if (!ent) return;
  const col = cs.getPropertyValue('--selected-color').trim() || '#4a90e2';
  // dim2 — px-space halo along the dim + witness lines (mirrors the selection
  // halo; dim geometry is paper-mm and resolved straight to px by dim2DimLinePx).
  if (ent.type === 'dim2' && typeof dim2DimLinePx === 'function') {
    const g = dim2DimLinePx(blk, ent);
    _v25HoverStrokePx(col, [g.d1, g.d2], false);
    _v25HoverStrokePx(col, [g.w1, g.d1], false);
    _v25HoverStrokePx(col, [g.w2, g.d2], false);
    return;
  }
  const o = v25HoverOutline(blk, ent);
  const toPx = (poly) => poly.map(p => real2px(blk, p.u, p.v));
  o.closed.forEach(poly => _v25HoverStrokePx(col, toPx(poly), true));
  o.open.forEach(poly => _v25HoverStrokePx(col, toPx(poly), false));
  if (o.circles.length) {
    const ppmm = viewport.zoom / drawingScale;
    o.circles.forEach(cc => { const p = real2px(blk, cc.u, cc.v); _v25HoverStrokeCircle(col, p.x, p.y, Math.max(4, cc.rMm * ppmm)); });
  }
}

// Bluebeam-style pickup — when an entity is already selected, prefer to grab
// one of its handles even if the cursor is up to ~14 px away. This makes node
// editing feel forgiving instead of pixel-precise. Returns either a handle
// key or null.
function v25NearestHandleOnSelected(blk, u, v) {
  if (!v25Selected.length) return null;
  const cursorPx = real2px(blk, u, v);
  let best = null;
  for (const id of v25Selected) {
    const ent = (entities2D[blk.viewKey] || []).find(e => e.id === id);
    if (!ent) continue;
    const handles = v25EntHandles(ent, blk);
    for (const h of handles) {
      const hp = real2px(blk, h.u, h.v);
      const d = Math.hypot(hp.x - cursorPx.x, hp.y - cursorPx.y);
      if (d < 14 && (!best || d < best.d)) best = { ent, handle: h.key, d };
    }
  }
  return best;
}

// What's under the cursor right now? Returns:
//   { ent, handle }                       — cursor over a handle of a SELECTED entity
//   { ent, handle: 'body' }               — cursor over the body of a SELECTED entity
//   { ent, handle: null }                 — cursor over an UNSELECTED v25 entity
//   null                                  — cursor over empty space
// Uses generous tolerance for selected-entity handles (Bluebeam-feel).
function v25HoverPick(blk, u, v) {
  // 1) Selected entity handle
  const selHandle = v25NearestHandleOnSelected(blk, u, v);
  if (selHandle) return { ent: selHandle.ent, handle: selHandle.handle };
  // 2) Selected entity body (still inside its hit area)
  for (const id of v25Selected) {
    const ent = (entities2D[blk.viewKey] || []).find(e => e.id === id);
    if (!ent) continue;
    const hit = v25HitTest(blk, u, v);
    if (hit && hit.id === ent.id) return { ent, handle: 'body' };
  }
  // 3) Other v25 entity under cursor
  const hit = v25HitTest(blk, u, v);
  if (hit) return { ent: hit, handle: null };
  return null;
}

// Hit-test specific drag handles for the selected entity (text-box, tip,
// member ends, line vertices, etc.). All distances in CSS PIXELS so the
// result doesn't blow up at low zoom (Bluebeam-style precise picking).
function v25HitHandle(blk, ent, u, v) {
  const cursorPx = real2px(blk, u, v);
  const distPx = (uu, vv) => {
    const p = real2px(blk, uu, vv);
    return Math.hypot(p.x - cursorPx.x, p.y - cursorPx.y);
  };
  if (ent.type === 'leader2') {
    if (distPx(ent.tipU, ent.tipV) < 10) return 'tip';
    if (distPx(ent.txtU, ent.txtV) < 16) return 'txt';
  }
  if (ent.type === 'dim2') {
    if (distPx(ent.p1u, ent.p1v) < 10) return 'p1';
    if (distPx(ent.p2u, ent.p2v) < 10) return 'p2';
    if (typeof dim2DimLinePx === 'function') {
      const g = dim2DimLinePx(blk, ent);
      if (Math.hypot(g.mid.x - cursorPx.x, g.mid.y - cursorPx.y) < 12) return 'off';
    }
  }
  if (ent.type === 'anchor' && ent.txtU != null && ent.txtV != null) {
    if (distPx(ent.txtU, ent.txtV) < 16) return 'txt';
  }
  if (ent.type === 'bolt2') {
    // Single body grip at the bolt centre (mirrors anchor — simple point move).
    // Always falls through to 'body' so a click anywhere on the glyph drags it.
    return 'body';
  }
  if (ent.type === 'screw') {
    // Click anywhere on the glyph drags it (mirrors bolt2 — simple point move).
    return 'body';
  }
  if (ent.type === 'stud') {
    // First-click grip pick — the embedment TIP / EDGE grips before the body
    // fallback. (For an already-selected stud the grab actually routes through
    // v25NearestHandleOnSelected → v25EntHandles; this covers the select+grab in
    // one gesture.)
    const g = (typeof studSectionGeom === 'function') ? studSectionGeom(blk, ent) : null;
    if (g) {
      const tip = g.Puv(g.embLen, 0), face = g.Puv(g.sFace, 0);
      if (distPx(tip[0], tip[1]) < 11) return 'stud-tip';
      if (distPx(face[0], face[1]) < 11) return 'stud-face';
    }
    return 'body';
  }
  if (ent.type === 'mem2') {
    // End-A is the entity origin (u,v); End-B is the other end after rot+length.
    // Tolerance is the smaller of (a) Bluebeam-like 12 px, (b) 1/3 the member's
    // on-screen length — so middle clicks fall through to body even when the
    // member is short on screen at very low zoom.
    const rot = (ent.rot || 0) * Math.PI / 180;
    const len = ent.length || 0;
    // Skip end-handle classification for cross-sections — both "ends"
    // collapse to the entity origin, so any body click would be
    // misclassified as end-a and trigger the stretch-into-elevation bug.
    const isSec = (ent.aspect || 'elev') === 'sec' || len < 1;
    if (!isSec) {
      const ebu = ent.u + Math.cos(rot) * len;
      const ebv = ent.v + Math.sin(rot) * len;
      const dA = distPx(ent.u, ent.v);
      const dB = distPx(ebu, ebv);
      const aPx = real2px(blk, ent.u, ent.v);
      const bPx = real2px(blk, ebu, ebv);
      const memberSpanPx = Math.hypot(bPx.x - aPx.x, bPx.y - aPx.y);
      const TOL = Math.max(3, Math.min(12, memberSpanPx / 3));
      if (dA < TOL || dB < TOL) {
        return dA <= dB ? 'end-a' : 'end-b';
      }
    }
  }
  if (ent.type === 'lineSet' && ent.pts && ent.pts.length) {
    // Tolerance scales with shortest segment length so middle clicks fall
    // through to body when zoomed-out short polylines would otherwise grab
    // every vertex.
    let minSegPx = Infinity;
    for (let i = 0; i < ent.pts.length - 1; i++) {
      const a = real2px(blk, ent.pts[i].u, ent.pts[i].v);
      const b = real2px(blk, ent.pts[i+1].u, ent.pts[i+1].v);
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d < minSegPx) minSegPx = d;
    }
    const TOL = Math.max(2, Math.min(8, (isFinite(minSegPx) ? minSegPx : 8) / 3));
    let bestI = -1, bestD = Infinity;
    for (let i = 0; i < ent.pts.length; i++) {
      const d = distPx(ent.pts[i].u, ent.pts[i].v);
      if (d < TOL && d < bestD) { bestD = d; bestI = i; }
    }
    if (bestI >= 0) return 'pt:' + bestI;
  }
  if (ent.type === 'mat' && ent.shape === 'poly' && ent.pts && ent.pts.length) {
    let bestI = -1, bestD = Infinity;
    for (let i = 0; i < ent.pts.length; i++) {
      const d = distPx(ent.pts[i].u, ent.pts[i].v);
      if (d < 8 && d < bestD) { bestD = d; bestI = i; }
    }
    if (bestI >= 0) return 'pt:' + bestI;
  }
  if (ent.type === 'clt') {
    const rot = (ent.rot || 0) * Math.PI / 180, c = Math.cos(rot), s = Math.sin(rot);
    const len = ent.lengthMM || 0;
    if (ent.mode === 'plan') {
      const w = len, h = ent.widthMM || 0;
      const X = (lu, lv) => ent.u + lu * c - lv * s, Y = (lu, lv) => ent.v + lu * s + lv * c;
      const tests = [
        ['e-left', X(0, h / 2), Y(0, h / 2)], ['e-right', X(w, h / 2), Y(w, h / 2)],
        ['e-bottom', X(w / 2, 0), Y(w / 2, 0)], ['e-top', X(w / 2, h), Y(w / 2, h)],
      ];
      let bk = null, bd = Infinity;
      for (const t of tests) { const d = distPx(t[1], t[2]); if (d < 10 && d < bd) { bd = d; bk = t[0]; } }
      if (bk) return bk;
    } else {
      const ebu = ent.u + c * len, ebv = ent.v + s * len;
      const dA = distPx(ent.u, ent.v), dB = distPx(ebu, ebv);
      const aPx = real2px(blk, ent.u, ent.v), bPx = real2px(blk, ebu, ebv);
      const spanPx = Math.hypot(bPx.x - aPx.x, bPx.y - aPx.y);
      const TOL = Math.max(3, Math.min(12, spanPx / 3));
      if (dA < TOL || dB < TOL) return dA <= dB ? 'end-a' : 'end-b';
    }
  }
  if (ent.type === 'blockWall') {
    if (ent.wallMode === 'sec') {
      const rot = (ent.rot || 0) * Math.PI / 180;
      const len = ent.lengthMM || 0;
      const ebu = ent.u + Math.cos(rot) * len, ebv = ent.v + Math.sin(rot) * len;
      const dA = distPx(ent.u, ent.v), dB = distPx(ebu, ebv);
      const aPx = real2px(blk, ent.u, ent.v), bPx = real2px(blk, ebu, ebv);
      const spanPx = Math.hypot(bPx.x - aPx.x, bPx.y - aPx.y);
      const TOL = Math.max(3, Math.min(12, spanPx / 3));
      if (dA < TOL || dB < TOL) return dA <= dB ? 'end-a' : 'end-b';
    } else {
      const w = ent.lengthMM || 0, h = ent.heightMM || 0;
      const tests = [
        ['e-left', ent.u, ent.v + h / 2], ['e-right', ent.u + w, ent.v + h / 2],
        ['e-bottom', ent.u + w / 2, ent.v], ['e-top', ent.u + w / 2, ent.v + h],
      ];
      let bk = null, bd = Infinity;
      for (const t of tests) { const d = distPx(t[1], t[2]); if (d < 10 && d < bd) { bd = d; bk = t[0]; } }
      if (bk) return bk;
    }
  }
  if (ent.type === 'noteBox' && typeof nbHandles === 'function') {
    // Grab a leader tip / manual knee / auto-dogleg shoulder directly without
    // pre-selecting. Width/move grips keep coming through v25NearestHandleOnSelected.
    const hs = nbHandles(ent);
    let bestK = null, bestD = Infinity;
    for (const h of hs) {
      if (!(h.key && (h.key.indexOf('arrow:') === 0 || h.key.indexOf('elbow:') === 0 || h.key.indexOf('auto:') === 0))) continue;
      const d = distPx(h.u, h.v);
      if (d < 10 && d < bestD) { bestD = d; bestK = h.key; }
    }
    if (bestK) return bestK;
  }
  return 'body';
}

// Which blockwork edge/end is the cursor near? Returns a target descriptor for
// the edge picker, or null if the cursor is too central. (u,v) real-world.
//   elevation → { kind:'elev', side:'top'|'bottom'|'left'|'right' }
//   section   → { kind:'sec',  end:'start'|'end' }
function v25NearestWallEdge(blk, ent, u, v) {
  if (!ent || ent.type !== 'blockWall') return null;
  if (ent.wallMode === 'sec') {
    const rot = (ent.rot || 0) * Math.PI / 180, len = ent.lengthMM || 0;
    if (len < 1) return null;
    const bx = ent.u + Math.cos(rot) * len, by = ent.v + Math.sin(rot) * len;
    const dA = Math.hypot(u - ent.u, v - ent.v), dB = Math.hypot(u - bx, v - by);
    if (Math.min(dA, dB) > len * 0.45) return null;
    return { kind: 'sec', end: (dA <= dB) ? 'start' : 'end' };
  }
  const w = ent.lengthMM || 0, h = ent.heightMM || 0;
  if (w < 1 || h < 1) return null;
  const dl = Math.abs(u - ent.u), dr = Math.abs(u - (ent.u + w));
  const db = Math.abs(v - ent.v), dt = Math.abs(v - (ent.v + h));
  const m = Math.min(dl, dr, db, dt);
  if (m > Math.min(w, h) * 0.4) return null;
  return { kind: 'elev', side: (m === dl) ? 'left' : (m === dr) ? 'right' : (m === db) ? 'bottom' : 'top' };
}

// Small popup at the cursor letting the user set a blockwork edge/end to be an
// "Edge of wall" (solid datum — coursing starts full from it) or a break-line.
// Applying it re-renders, so the coursing re-anchors immediately.
function v25ShowWallEdgeMenu(ent, target, x, y) {
  const ex = document.getElementById('v25WallEdgeMenu');
  if (ex) ex.remove();
  const isSec = target.kind === 'sec';
  let curBreak;
  if (isSec) { const eb = ent.endBreak || 'none'; curBreak = (eb === 'both') || (eb === target.end); }
  else { curBreak = !!(ent.breakEdges && ent.breakEdges[target.side]); }

  const menu = document.createElement('div');
  menu.id = 'v25WallEdgeMenu';
  menu.style.cssText = 'position:fixed;z-index:99999;left:' + x + 'px;top:' + y + 'px;min-width:160px;'
    + 'background:var(--surface-2,#fff);color:var(--text,#222);border:1px solid var(--border,#ccc);'
    + 'border-radius:6px;box-shadow:0 6px 22px rgba(0,0,0,.22);overflow:hidden;font:12px system-ui';
  const headEl = document.createElement('div');
  headEl.textContent = isSec
    ? (target.end === 'start' ? 'Start end' : 'Finish end')
    : (target.side.charAt(0).toUpperCase() + target.side.slice(1) + ' edge');
  headEl.style.cssText = 'padding:6px 12px;font-weight:700;font-size:10.5px;color:var(--text-mute,#888);'
    + 'text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid var(--border,#eee)';
  menu.appendChild(headEl);

  const setVal = (makeBreak) => {
    if (isSec) {
      let s = (ent.endBreak === 'both' || ent.endBreak === 'start');
      let en = (ent.endBreak === 'both' || ent.endBreak === 'end');
      if (target.end === 'start') s = makeBreak; else en = makeBreak;
      ent.endBreak = (s && en) ? 'both' : s ? 'start' : en ? 'end' : 'none';
    } else {
      ent.breakEdges = ent.breakEdges || { top: false, bottom: false, left: false, right: false };
      ent.breakEdges[target.side] = makeBreak;
    }
    menu.remove();
    if (typeof v25UpdateInspector === 'function') v25UpdateInspector();
    if (typeof requestRender === 'function') requestRender();
  };
  const mk = (label, makeBreak, active) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = (active ? '✓  ' : ' ') + label;
    btn.style.cssText = 'display:block;width:100%;text-align:left;padding:8px 12px;border:0;'
      + 'background:transparent;color:var(--text,#222);cursor:pointer;font:12px system-ui;white-space:nowrap';
    btn.onmouseenter = () => { btn.style.background = 'var(--surface-3,#eee)'; };
    btn.onmouseleave = () => { btn.style.background = 'transparent'; };
    btn.onclick = () => setVal(makeBreak);
    return btn;
  };
  menu.appendChild(mk('Edge of wall', false, !curBreak));
  menu.appendChild(mk(isSec ? 'Section break' : 'Break-line', true, curBreak));
  document.body.appendChild(menu);

  // Keep on-screen.
  const r = menu.getBoundingClientRect();
  if (r.right > window.innerWidth) menu.style.left = Math.max(4, x - r.width) + 'px';
  if (r.bottom > window.innerHeight) menu.style.top = Math.max(4, y - r.height) + 'px';
  // Dismiss on any outside interaction.
  const close = (ev) => {
    if (!menu.contains(ev.target)) {
      menu.remove();
      document.removeEventListener('mousedown', close, true);
      document.removeEventListener('wheel', close, true);
    }
  };
  setTimeout(() => {
    document.addEventListener('mousedown', close, true);
    document.addEventListener('wheel', close, true);
  }, 0);
}

// Move an entity by (du, dv) in real-world coords.
function v25Move(ent, du, dv, handle) {
  handle = handle || 'body';
  // plate-grouping-stiffener — body-moving a grouped item drags the whole
  // group. Runs before the per-type branches so mates translate by the same
  // (du,dv); end-grip / rotate edits stay local (handle !== 'body').
  if (handle === 'body' && ent && ent.groupId && typeof window.v25GroupOnV25Move === 'function') {
    window.v25GroupOnV25Move(ent, du, dv, handle);
  }
  if (ent.type === 'stiff2') { if (typeof v25StiffApplyGrip === 'function') v25StiffApplyGrip(ent, du, dv, handle, (typeof window!=='undefined' && window.shiftHeld===true)); return; }
  if (ent.type === 'noteBox') { if (typeof nbMove==='function') nbMove(ent, handle, du, dv); return; }
  if (handle === 'tip' && ent.type === 'leader2') { ent.tipU += du; ent.tipV += dv; return; }
  if (handle === 'txt' && ent.type === 'leader2') { ent.txtU += du; ent.txtV += dv; return; }
  if (handle === 'txt' && ent.type === 'anchor') { ent.txtU += du; ent.txtV += dv; return; }

  // Stud embedment grips — edit the bonded length / edge datum, NEVER ent.u/ent.v.
  // Must run before the generic body-translate tail. Cursor is reconstructed from
  // v25Drag.lastU+du (v25Move receives deltas), like the rotate handles.
  if (ent.type === 'stud' && (handle === 'stud-tip' || handle === 'stud-face')) {
    const _blk = (typeof activeBlock !== 'undefined') ? activeBlock : null;
    const g = (typeof studSectionGeom === 'function') ? studSectionGeom(_blk, ent) : null;
    if (!g) return;
    const cu = (typeof v25Drag === 'object' && v25Drag) ? (v25Drag.lastU + du) : (ent.u + du);
    const cv = (typeof v25Drag === 'object' && v25Drag) ? (v25Drag.lastV + dv) : (ent.v + dv);
    const cursorAxis = g.axisIsU ? cu : cv;
    const s = (cursorAxis - g.junction) * g.bodyDir;     // project cursor onto the stud axis
    if (handle === 'stud-tip') {
      // Edge fixed, tip moves → bonded embedment depth, in clean 5 mm steps so the
      // drag reads as round numbers as it grows/shrinks.
      ent.embedDepth = Math.max(5, Math.round((s - g.sFace) / 5) * 5);
    } else {
      // Edge moves, tip rides down (bond fixed): pin the current bond first, then
      // re-datum the edge — snapping to a host face (grout/blockwork/plate) in
      // range, else clean 5 mm steps.
      if (ent.embedDepth == null) ent.embedDepth = Math.round(g.embedDepth);
      const snapped = (typeof v25StudEdgeSnap === 'function') ? v25StudEdgeSnap(_blk, ent, g, s) : null;
      const newFace = (snapped != null) ? snapped : Math.round(s / 5) * 5;
      ent.faceOffset = Math.max(0, newFace);
    }
    // Live-update the embedment readouts (top bar + inspector) as the drag moves,
    // so the number ticks up/down to the value the user is chasing.
    if (typeof v25SyncStudEmbedReadouts === 'function') v25SyncStudEmbedReadouts(ent, _blk);
    if (typeof requestRender === 'function') requestRender();
    return;
  }

  // Dimension grips: p1/p2 move endpoints; 'off' re-offsets the dim line (paper-mm);
  // body translates both endpoints (the generic tail below never touches p1u..p2v).
  if (ent.type === 'dim2') {
    if (handle === 'p1') { ent.p1u += du; ent.p1v += dv; return; }
    if (handle === 'p2') { ent.p2u += du; ent.p2v += dv; return; }
    if (handle === 'off') {
      const _blk = (typeof activeBlock !== 'undefined') ? activeBlock : null;
      if (!_blk) return;
      const cu = (typeof v25Drag === 'object' && v25Drag) ? (v25Drag.lastU + du) : null;
      const cv = (typeof v25Drag === 'object' && v25Drag) ? (v25Drag.lastV + dv) : null;
      if (cu == null) return;
      const w1 = real2px(_blk, ent.p1u, ent.p1v), w2 = real2px(_blk, ent.p2u, ent.p2v);
      const sx = (w1.x + w2.x) / 2, sy = (w1.y + w2.y) / 2;
      const dx = w2.x - w1.x, dy = w2.y - w1.y, len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;             // screen-space perpendicular unit
      const cp = real2px(_blk, cu, cv);
      const offPx = (cp.x - sx) * nx + (cp.y - sy) * ny;   // signed projection
      ent.off = offPx / ((typeof _nbZoom === 'function') ? _nbZoom() : 1);
      return;
    }
    ent.p1u += du; ent.p1v += dv; ent.p2u += du; ent.p2v += dv; return;
  }

  // Member rotation handle — pitch around the midpoint, length preserved.
  // Default snaps to 0/45/90/135/180/225/270/315° (the AutoCAD/Revit muscle
  // memory). Hold Shift to bypass the snap and rotate freely; the live
  // angle readout in the render loop shows the exact angle while dragging.
  if (ent.type === 'mem2' && handle === 'rotate') {
    const len = ent.length || 0;
    if (len < 1) return;
    const oldRot = (ent.rot || 0) * Math.PI / 180;
    const midU = ent.u + Math.cos(oldRot) * (len / 2);
    const midV = ent.v + Math.sin(oldRot) * (len / 2);
    // Reconstruct the current cursor position from the drag deltas. v25Drag
    // stores the previous cursor in lastU/lastV; v25Move runs before lastU
    // is bumped, so cursor = lastU + du.
    const cu = (typeof v25Drag === 'object' && v25Drag) ? (v25Drag.lastU + du) : (midU + du);
    const cv = (typeof v25Drag === 'object' && v25Drag) ? (v25Drag.lastV + dv) : (midV + dv);
    const dx = cu - midU, dy = cv - midV;
    if (dx * dx + dy * dy < 1) return;
    // Handle sits perpendicular to the member, so the member's angle is the
    // cursor angle minus 90°.
    const cursorRot = Math.atan2(dy, dx) - Math.PI / 2;
    const newRot = applySnappedRotation(cursorRot, !!(typeof shiftHeld !== 'undefined' && shiftHeld));
    ent.u = midU - Math.cos(newRot) * (len / 2);
    ent.v = midV - Math.sin(newRot) * (len / 2);
    ent.rot = newRot * 180 / Math.PI;
    // plate-grouping-stiffener — a grouped member rotates the whole assembly
    // rigidly about this member's own pivot (its midpoint).
    if (ent.groupId && typeof window.v25GroupOnV25Rotate === 'function') {
      window.v25GroupOnV25Rotate(ent, midU, midV, newRot - oldRot);
    }
    return;
  }

  // Mat (hatch) rotation handle — same Bluebeam-style perpendicular ball,
  // same snap defaults as mem2. Whole entity (outline + hatch + dots + rings
  // + grain) rotates rigidly via drawMat2D's canvas transform; we only have
  // to update ent.rot here.
  if (ent.type === 'mat' && handle === 'rotate') {
    const c = _v25MatCentroid(ent);
    const matOldRot = (ent.rot || 0) * Math.PI / 180;
    const cu = (typeof v25Drag === 'object' && v25Drag) ? (v25Drag.lastU + du) : (c.u + du);
    const cv = (typeof v25Drag === 'object' && v25Drag) ? (v25Drag.lastV + dv) : (c.v + dv);
    const dx = cu - c.u, dy = cv - c.v;
    if (dx * dx + dy * dy < 1) return;
    // Handle sits perpendicular to the top edge, so subtract 90° as for mem2.
    const cursorRot = Math.atan2(dy, dx) - Math.PI / 2;
    const newRot = applySnappedRotation(cursorRot, !!(typeof shiftHeld !== 'undefined' && shiftHeld));
    ent.rot = newRot * 180 / Math.PI;
    // plate-grouping-stiffener — grouped mates rotate rigidly about the mat
    // centroid by the same delta.
    if (ent.groupId && typeof window.v25GroupOnV25Rotate === 'function') {
      window.v25GroupOnV25Rotate(ent, c.u, c.v, newRot - matOldRot);
    }
    return;
  }

  // CLT panel grips — edge strip (end-a/end-b + rotate) and plan rect
  // (e-* edge resize + rotate). Rotates about the strip midpoint (edge) or the
  // rect centre (plan); both keep the opposite reference fixed.
  if (ent.type === 'clt') {
    const rot = (ent.rot || 0) * Math.PI / 180;
    const cosR = Math.cos(rot), sinR = Math.sin(rot);
    const len = ent.lengthMM || 0;
    const shift = !!(typeof shiftHeld !== 'undefined' && shiftHeld);
    // Body drag — translate the panel origin. (Without this the per-handle
    // branches below fall through to a bare `return`, so the panel can be
    // selected and grip-edited but never moved.)
    if (handle === 'body') { ent.u += du; ent.v += dv; return; }
    if (ent.mode === 'plan') {
      const w = len, h = ent.widthMM || 0;
      if (handle === 'rotate') {
        if (w < 1 || h < 1) return;
        const cx = ent.u + cosR * (w / 2) - sinR * (h / 2);
        const cy = ent.v + sinR * (w / 2) + cosR * (h / 2);
        const cu = (typeof v25Drag === 'object' && v25Drag) ? (v25Drag.lastU + du) : (cx + du);
        const cv = (typeof v25Drag === 'object' && v25Drag) ? (v25Drag.lastV + dv) : (cy + dv);
        const dx = cu - cx, dy = cv - cy;
        if (dx * dx + dy * dy < 1) return;
        const cursorRot = Math.atan2(dy, dx) - Math.PI / 2;
        const nr = applySnappedRotation(cursorRot, shift);
        const cN = Math.cos(nr), sN = Math.sin(nr);
        ent.u = cx - (cN * (w / 2) - sN * (h / 2));
        ent.v = cy - (sN * (w / 2) + cN * (h / 2));
        ent.rot = nr * 180 / Math.PI;
        return;
      }
      // Edge resize — project the world delta onto the local axes.
      const MIN = 50;
      const pu = du * cosR + dv * sinR;          // along length
      const pv = du * (-sinR) + dv * cosR;       // along width
      if (handle === 'e-right')  { const nl = w + pu; if (nl >= MIN) ent.lengthMM = nl; return; }
      if (handle === 'e-left')   { const nl = w - pu; if (nl >= MIN) { ent.u += pu * cosR; ent.v += pu * sinR; ent.lengthMM = nl; } return; }
      if (handle === 'e-top')    { const nh = h + pv; if (nh >= MIN) ent.widthMM = nh; return; }
      if (handle === 'e-bottom') { const nh = h - pv; if (nh >= MIN) { ent.u += pv * (-sinR); ent.v += pv * cosR; ent.widthMM = nh; } return; }
      return;
    }
    // Edge strip.
    if (handle === 'rotate') {
      if (len < 1) return;
      const midU = ent.u + cosR * (len / 2), midV = ent.v + sinR * (len / 2);
      const cu = (typeof v25Drag === 'object' && v25Drag) ? (v25Drag.lastU + du) : (midU + du);
      const cv = (typeof v25Drag === 'object' && v25Drag) ? (v25Drag.lastV + dv) : (midV + dv);
      const dx = cu - midU, dy = cv - midV;
      if (dx * dx + dy * dy < 1) return;
      const nr = applySnappedRotation(Math.atan2(dy, dx) - Math.PI / 2, shift);
      ent.u = midU - Math.cos(nr) * (len / 2);
      ent.v = midV - Math.sin(nr) * (len / 2);
      ent.rot = nr * 180 / Math.PI;
      return;
    }
    if (handle === 'end-a' || handle === 'end-b') {
      const ax = ent.u, ay = ent.v;
      const bx = ent.u + cosR * len, by = ent.v + sinR * len;
      let nax = ax, nay = ay, nbx = bx, nby = by;
      if (handle === 'end-a') { nax = ax + du; nay = ay + dv; } else { nbx = bx + du; nby = by + dv; }
      if (shift) {
        const STEP = Math.PI / 4;
        const fx = (handle === 'end-a') ? nbx : nax, fy = (handle === 'end-a') ? nby : nay;
        const px = (handle === 'end-a') ? nax : nbx, py = (handle === 'end-a') ? nay : nby;
        const wu = px - fx, wv = py - fy;
        if (wu !== 0 || wv !== 0) {
          const a = Math.round(Math.atan2(wv, wu) / STEP) * STEP;
          const t = wu * Math.cos(a) + wv * Math.sin(a);
          const sx = fx + t * Math.cos(a), sy = fy + t * Math.sin(a);
          if (handle === 'end-a') { nax = sx; nay = sy; } else { nbx = sx; nby = sy; }
        }
      }
      const dx = nbx - nax, dy = nby - nay, nl = Math.hypot(dx, dy);
      if (nl < 1) return;
      ent.u = nax; ent.v = nay; ent.lengthMM = nl; ent.rot = Math.atan2(dy, dx) * 180 / Math.PI;
      return;
    }
    return;
  }

  // Blockwork section strip — rotation ball (snap to 0/45/90… unless Shift).
  if (ent.type === 'blockWall' && ent.wallMode === 'sec' && handle === 'rotate') {
    const len = ent.lengthMM || 0;
    if (len < 1) return;
    const oldRot = (ent.rot || 0) * Math.PI / 180;
    const midU = ent.u + Math.cos(oldRot) * (len / 2);
    const midV = ent.v + Math.sin(oldRot) * (len / 2);
    const cu = (typeof v25Drag === 'object' && v25Drag) ? (v25Drag.lastU + du) : (midU + du);
    const cv = (typeof v25Drag === 'object' && v25Drag) ? (v25Drag.lastV + dv) : (midV + dv);
    const dx = cu - midU, dy = cv - midV;
    if (dx * dx + dy * dy < 1) return;
    const cursorRot = Math.atan2(dy, dx) - Math.PI / 2;
    const newRot = applySnappedRotation(cursorRot, !!(typeof shiftHeld !== 'undefined' && shiftHeld));
    ent.u = midU - Math.cos(newRot) * (len / 2);
    ent.v = midV - Math.sin(newRot) * (len / 2);
    ent.rot = newRot * 180 / Math.PI;
    // plate-grouping-stiffener — grouped mates rotate rigidly about this
    // strip's midpoint by the same delta.
    if (ent.groupId && typeof window.v25GroupOnV25Rotate === 'function') {
      window.v25GroupOnV25Rotate(ent, midU, midV, newRot - oldRot);
    }
    return;
  }

  // Blockwork section strip — end grips re-length / re-angle (other end fixed).
  if (ent.type === 'blockWall' && ent.wallMode === 'sec' && (handle === 'end-a' || handle === 'end-b')) {
    const rot = (ent.rot || 0) * Math.PI / 180;
    const len = ent.lengthMM || 0;
    const ax = ent.u, ay = ent.v;
    const bx = ent.u + Math.cos(rot) * len, by = ent.v + Math.sin(rot) * len;
    let nax = ax, nay = ay, nbx = bx, nby = by;
    if (handle === 'end-a') { nax = ax + du; nay = ay + dv; }
    else                    { nbx = bx + du; nby = by + dv; }
    // Shift → 45° angle-lock: snap the strip onto the nearest eighth-angle by
    // projecting the dragged end onto the closest 45° line through the FIXED
    // end (0/45/90/...). Same path as the mem2 end-handle above so every
    // straight member re-angles identically under Shift. Bare `shiftHeld` is
    // the live modifier global.
    if (typeof shiftHeld !== 'undefined' && shiftHeld) {
      const STEP = Math.PI / 4;
      const fx = (handle === 'end-a') ? nbx : nax;   // fixed end
      const fy = (handle === 'end-a') ? nby : nay;
      const px = (handle === 'end-a') ? nax : nbx;   // raw dragged end
      const py = (handle === 'end-a') ? nay : nby;
      const wu = px - fx, wv = py - fy;
      if (wu !== 0 || wv !== 0) {
        const a = Math.round(Math.atan2(wv, wu) / STEP) * STEP;
        const t = wu * Math.cos(a) + wv * Math.sin(a);   // project onto snapped dir
        const sx = fx + t * Math.cos(a), sy = fy + t * Math.sin(a);
        if (handle === 'end-a') { nax = sx; nay = sy; }
        else                    { nbx = sx; nby = sy; }
      }
    }
    const dx = nbx - nax, dy = nby - nay, nl = Math.hypot(dx, dy);
    if (nl < 1) return;
    ent.u = nax; ent.v = nay;
    ent.lengthMM = nl;
    ent.rot = Math.atan2(dy, dx) * 180 / Math.PI;
    return;
  }

  // Blockwork elevation extent — mid-edge grips resize / reposition one edge.
  if (ent.type === 'blockWall' && ent.wallMode !== 'sec' &&
      (handle === 'e-left' || handle === 'e-right' || handle === 'e-bottom' || handle === 'e-top')) {
    const MIN = 50;
    if (handle === 'e-left')   { const nl = (ent.lengthMM || 0) - du; if (nl >= MIN) { ent.u += du; ent.lengthMM = nl; } }
    if (handle === 'e-right')  { const nl = (ent.lengthMM || 0) + du; if (nl >= MIN) ent.lengthMM = nl; }
    if (handle === 'e-bottom') { const nh = (ent.heightMM || 0) - dv; if (nh >= MIN) { ent.v += dv; ent.heightMM = nh; } }
    if (handle === 'e-top')    { const nh = (ent.heightMM || 0) + dv; if (nh >= MIN) ent.heightMM = nh; }
    return;
  }

  // Snapshot resize/rotate. Edges: free 1-axis (mirror blockWall e-*). Corners:
  // aspect-locked by default (lockAspect); Shift toggles free. Rotate: mat-style.
  if (ent.type === 'snapshot' && typeof handle === 'string'
      && (handle === 'rotate' || handle[0] === 'c' || handle.startsWith('e-'))) {
    const MIN = 20;
    const ds = (typeof drawingScale === 'number' && drawingScale) ? drawingScale : 1;
    const sync = () => { ent.paperMM = { w: (ent.w || 0) / ds, h: (ent.h || 0) / ds }; };
    if (handle === 'rotate') {
      const cu = ent.u + (ent.w || 0) / 2, cv = ent.v + (ent.h || 0) / 2;
      const ccu = (typeof v25Drag === 'object' && v25Drag) ? (v25Drag.lastU + du) : (cu + du);
      const ccv = (typeof v25Drag === 'object' && v25Drag) ? (v25Drag.lastV + dv) : (cv + dv);
      const dx = ccu - cu, dy = ccv - cv;
      if (dx * dx + dy * dy < 1) return;
      const cursorRot = Math.atan2(dy, dx) - Math.PI / 2;
      const newRot = applySnappedRotation(cursorRot, !!(typeof shiftHeld !== 'undefined' && shiftHeld));
      ent.rot = newRot * 180 / Math.PI;
      return;
    }
    // Edge grips — free single-axis stretch (blockWall e-* math; MIN real-mm).
    if (handle === 'e-left')   { const nw = (ent.w || 0) - du; if (nw >= MIN) { ent.u += du; ent.w = nw; } sync(); return; }
    if (handle === 'e-right')  { const nw = (ent.w || 0) + du; if (nw >= MIN) ent.w = nw; sync(); return; }
    if (handle === 'e-bottom') { const nh = (ent.h || 0) - dv; if (nh >= MIN) { ent.v += dv; ent.h = nh; } sync(); return; }
    if (handle === 'e-top')    { const nh = (ent.h || 0) + dv; if (nh >= MIN) ent.h = nh; sync(); return; }
    // Corner grips — anchor opposite corner; aspect-locked unless Shift.
    const free = !!(typeof shiftHeld !== 'undefined' && shiftHeld) ? !ent.lockAspect : ent.lockAspect; // Shift inverts lockAspect
    const aspect = (ent.h || 1) / (ent.w || 1);
    // anchor corner stays fixed; the dragged corner moves by (du,dv) in axis-aligned terms.
    // For the unrotated common case (rot 0): adjust w/h and shift u/v for left/bottom anchors.
    let nu = ent.u, nv = ent.v, nw = ent.w || 0, nh = ent.h || 0;
    if (handle === 'c-br') { nw += du;       nh -= dv; nv += dv; }
    if (handle === 'c-bl') { nw -= du; nu += du; nh -= dv; nv += dv; }
    if (handle === 'c-tr') { nw += du;       nh += dv; }
    if (handle === 'c-tl') { nw -= du; nu += du; nh += dv; }
    if (free) {            // aspect-locked: drive h from w (use the dominant axis = w)
      nh = nw * aspect;
      // keep bottom-left/top-left anchors' origin consistent for the locked height
      if (handle === 'c-bl' || handle === 'c-br') nv = (ent.v + (ent.h || 0)) - nh;
    }
    if (nw >= MIN && nh >= MIN) { ent.u = nu; ent.v = nv; ent.w = nw; ent.h = nh; }
    sync();
    return;
  }
  // Member end-handles: drag one end to extend / re-angle while the other end stays put.
  if (ent.type === 'mem2' && (handle === 'end-a' || handle === 'end-b')) {
    const rot = (ent.rot || 0) * Math.PI / 180;
    const len = ent.length || 0;
    const ax = ent.u, ay = ent.v;
    const bx = ent.u + Math.cos(rot) * len, by = ent.v + Math.sin(rot) * len;
    let newAx = ax, newAy = ay, newBx = bx, newBy = by;
    if (handle === 'end-a') { newAx = ax + du; newAy = ay + dv; }
    else                    { newBx = bx + du; newBy = by + dv; }
    // Shift → 45° angle-lock: snap the member onto the nearest eighth-angle
    // (0/45/90/135/180/225/270/315) by projecting the dragged end onto the
    // closest 45° line through the FIXED end. Generalises the old H/V-only
    // lock — at 0/90/180/270 it reduces to the same horizontal/vertical
    // projection, and diagonals now snap too (e.g. clean 1:1 braces). This is
    // the shared mem2 end-handle path, so it applies to every member type
    // (UB/UC/SHS/RHS/PFC/CHS/EA/UA/timber). Mirrors the 45° default of
    // constrainUV (08-coords.js). Bare `shiftHeld` is the live modifier global
    // (07-globals.js).
    if (typeof shiftHeld !== 'undefined' && shiftHeld) {
      const STEP = Math.PI / 4;
      const fx = (handle === 'end-a') ? newBx : newAx;   // fixed end
      const fy = (handle === 'end-a') ? newBy : newAy;
      const px = (handle === 'end-a') ? newAx : newBx;   // raw dragged end
      const py = (handle === 'end-a') ? newAy : newBy;
      const wu = px - fx, wv = py - fy;
      if (wu !== 0 || wv !== 0) {
        const a = Math.round(Math.atan2(wv, wu) / STEP) * STEP;
        const t = wu * Math.cos(a) + wv * Math.sin(a);   // project onto snapped dir
        const sx = fx + t * Math.cos(a), sy = fy + t * Math.sin(a);
        if (handle === 'end-a') { newAx = sx; newAy = sy; }
        else                    { newBx = sx; newBy = sy; }
      }
    }
    const dx = newBx - newAx, dy = newBy - newAy;
    const newLen = Math.hypot(dx, dy);
    if (newLen < 1) return; // ignore zero-length collapses
    ent.u = newAx; ent.v = newAy;
    ent.length = newLen;
    ent.rot = Math.atan2(dy, dx) * 180 / Math.PI;
    // Live host probe: latch / unlatch the dragged end's auto-mitre join.
    if ((ent.aspect || 'elev') === 'elev' && activeBlock
        && typeof v25Mem2HostUnderCursor === 'function') {
      const probeU = handle === 'end-a' ? newAx : newBx;
      const probeV = handle === 'end-a' ? newAy : newBy;
      const hit = v25Mem2HostUnderCursor(activeBlock, probeU, probeV, ent.id);
      const key = handle === 'end-a' ? 'endAJoin' : 'endBJoin';
      const capKey = handle === 'end-a' ? 'endA' : 'endB';
      if (hit) {
        ent[key] = Object.assign({}, ent[key] || {}, { hostId: hit.ent.id });
        ent[capKey] = 'mitre';
      } else if (ent[key]) {
        // Dragged away from any host — break the join.
        delete ent[key];
        if (ent[capKey] === 'mitre') ent[capKey] = 'normal';
      }
    }
    return;
  }

  // lineSet single-vertex drag (handle is "pt:N").
  if (ent.type === 'lineSet' && typeof handle === 'string' && handle.startsWith('pt:')) {
    const idx = parseInt(handle.slice(3));
    if (ent.pts && ent.pts[idx]) {
      ent.pts[idx].u += du;
      ent.pts[idx].v += dv;
      // Shift → snap the dragged vertex onto the nearest 0/45/90° line through
      // its REFERENCE neighbour (the previous vertex, or the next vertex for
      // pt:0), preserving the dragged segment's length. Same eighth-angle
      // projection the mem2 end-handles use. Whole-line body drags get H/V-only
      // ortho upstream (39-events); vertex drags get the finer 45° steps here.
      if (typeof shiftHeld !== 'undefined' && shiftHeld && ent.pts.length >= 2) {
        const refIdx = (idx > 0) ? idx - 1 : 1;
        const ref = ent.pts[refIdx];
        const wu = ent.pts[idx].u - ref.u, wv = ent.pts[idx].v - ref.v;
        if (wu !== 0 || wv !== 0) {
          const STEP = Math.PI / 4;
          const a = Math.round(Math.atan2(wv, wu) / STEP) * STEP;
          const t = wu * Math.cos(a) + wv * Math.sin(a);   // project onto snapped dir
          ent.pts[idx].u = ref.u + t * Math.cos(a);
          ent.pts[idx].v = ref.v + t * Math.sin(a);
        }
      }
    }
    return;
  }

  // Poly-mat single-vertex drag (handle is "pt:N").
  if (ent.type === 'mat' && ent.shape === 'poly' && typeof handle === 'string' && handle.startsWith('pt:')) {
    const idx = parseInt(handle.slice(3));
    if (ent.pts && ent.pts[idx]) {
      ent.pts[idx].u += du;
      ent.pts[idx].v += dv;
    }
    return;
  }

  // v1 V25 plate grip drag branches (poly vertex / rect corner / sec outer-
  // end) retired by architecture-v2 Phase 2. v2 plate grip handles will land
  // when Phase 10 ("Selection / grip handles") migrates onto the v2 layer.

  // Body move — translate primary u,v plus any related coords.
  if (ent.u !== undefined) ent.u += du;
  if (ent.v !== undefined) ent.v += dv;
  if (ent.tipU !== undefined) ent.tipU += du;
  if (ent.tipV !== undefined) ent.tipV += dv;
  if (ent.txtU !== undefined) ent.txtU += du;
  if (ent.txtV !== undefined) ent.txtV += dv;
  if (ent.pts) ent.pts.forEach(p => { p.u += du; p.v += dv; });
}

// ---- INSPECTOR ----
// Builds an inline editor in #inspectorRoot for the selected v25 entity.
function v25UpdateInspector() {
  const root = document.getElementById('inspectorRoot');
  if (!root) return;
  // member-size-from-top-bar (2026-06-04) — keep the top options bar in sync with
  // selection (it surfaces a selected member's Section for editing). Safe in any
  // mode: the bar self-hides outside 2D / when no editable selection applies.
  if (typeof v25UpdateOptionsBar === 'function') v25UpdateOptionsBar();
  // v2-plate-inspector — plate selection lives in v2.tools.editPlate.state /
  // window.v25SelPlateIds (mutual-exclusion with v25Selected, see js/39-events.js),
  // never in v25Selected, so the entities2D-driven inspector body below can
  // never render it. When a v2 plate is the active selection, hand the panel to
  // the purpose-built v2 inspector (js/v2/ui/inspector-plate.js); it owns the
  // host (clears + rebuilds it) and commits thickness/type edits through
  // v2.transactions.editElement + the undo stack, so undo/redo/autosave and the
  // v1<->v2 mirror bridge all keep working.
  if (sheetMode === '2d'
      && (!Array.isArray(v25Selected) || !v25Selected.length)
      && window.v2 && v2.tools && v2.tools.editPlate && v2.tools.editPlate.state
      && v2.tools.editPlate.state.selectedId
      && v2.ui && v2.ui.inspectorPlate
      && typeof v2.ui.inspectorPlate.renderForElement === 'function') {
    v2.ui.inspectorPlate.renderForElement(v2.tools.editPlate.state.selectedId, root);
    return;
  }
  if (sheetMode !== '2d' || !v25Selected.length) return; // leave existing inspector
  const id = v25Selected[v25Selected.length - 1];
  const arr = entities2D[(activeBlock && activeBlock.viewKey) || 'elevation'] || [];
  const ent = arr.find(e => e.id === id);
  if (!ent) return;

  const fields = [];
  const num = (label, key, step) => fields.push({ kind:'num', label, key, step: step || 1 });
  const txt = (label, key, area) => fields.push({ kind: area ? 'area' : 'txt', label, key });
  const sel = (label, key, opts) => fields.push({ kind:'sel', label, key, opts });
  // V25-layout-overhaul Phase 7 — colour picker (HTML5 type=color, hex string).
  const col = (label, key) => fields.push({ kind:'col', label, key });

  fields.push({ kind:'h', label: ent.type.toUpperCase() + ' #' + ent.id });
  if (ent.type === 'frame') {
    txt('Title', 'title');
    num('Scale 1:', 'scale');
    txt('Reference', 'ref');
  } else if (ent.type === 'snapshot') {
    const ds = (typeof drawingScale === 'number' && drawingScale) ? drawingScale : 1;
    // Read-only size heading only. Opacity + Rotation are auto-added by the
    // shared Display block below; precise resize is via grips + the live size
    // chip. No editable size / lock-aspect widget in v1 (per §11.1/§11.2).
    fields.push({ kind: 'h', label: 'Image  ' + Math.round((ent.w || 0) / ds) + ' x ' + Math.round((ent.h || 0) / ds) + ' mm (paper)' });
  } else if (ent.type === 'mat') {
    sel('Material', 'material', Object.keys(V25_MATERIALS));
    num('Width (mm)', 'w'); num('Height (mm)', 'h');
    fields.push({ kind:'num', label:'Hatch scale (0-100)', key:'hatchScale', step:5, min:0, max:100 });
    fields.push({ kind:'h', label: 'Edge' });
    fields.push({ kind:'stepper', label:'Thickness', key:'edgeLevel' });
    sel('Style', 'edgeStyle', ['solid','dashed','centre','phantom']);
  } else if (ent.type === 'blockWall') {
    sel('Block', 'blockKey', Object.keys(V25_BLOCK_DB));
    if (ent.wallMode === 'sec') {
      num('Length (mm)', 'lengthMM');
      num('Rotation°', 'rot', 0.5);
      sel('End break', 'endBreak', ['start','end','both','none']);
      // blockwork-section-hatch — grout stipple (default ON) + 45° cross-hatch
      // overlay (default OFF), each with Spacing / Opacity / Line-width sliders.
      // Lazily migrate a legacy `grouted` flag onto groutFill so the toggle and
      // the renderer agree for old saves.
      if (ent.groutFill == null) ent.groutFill = !!ent.grouted;
      if (ent.xHatch == null) ent.xHatch = true;   // cross-hatch defaults ON
      const _gd = (typeof BLOCKWALL_GROUT_DEFAULTS === 'object') ? BLOCKWALL_GROUT_DEFAULTS : { spacing: 25, opacity: 55, width: 30 };
      const _xd = (typeof BLOCKWALL_XHATCH_DEFAULTS === 'object') ? BLOCKWALL_XHATCH_DEFAULTS : { spacing: 50, opacity: 22, width: 30 };
      fields.push({ kind: 'sel', label: 'Grout fill', key: 'groutFill', opts: [{ v: 'true', l: 'On' }, { v: '', l: 'Off' }] });
      fields.push({ kind: 'range', label: '· spacing',    key: 'groutSpacing', min: 0, max: 100, step: 5, defaultVal: _gd.spacing, suffix: '%' });
      fields.push({ kind: 'range', label: '· opacity',    key: 'groutOpacity', min: 0, max: 100, step: 5, defaultVal: _gd.opacity, suffix: '%' });
      fields.push({ kind: 'range', label: '· line width', key: 'groutWidth',   min: 0, max: 100, step: 5, defaultVal: _gd.width,   suffix: '%' });
      fields.push({ kind: 'sel', label: 'Cross-hatch', key: 'xHatch', opts: [{ v: 'true', l: 'On' }, { v: '', l: 'Off' }] });
      fields.push({ kind: 'range', label: '· spacing',    key: 'xHatchSpacing', min: 0, max: 100, step: 5, defaultVal: _xd.spacing, suffix: '%' });
      fields.push({ kind: 'range', label: '· opacity',    key: 'xHatchOpacity', min: 0, max: 100, step: 5, defaultVal: _xd.opacity, suffix: '%' });
      fields.push({ kind: 'range', label: '· line width', key: 'xHatchWidth',   min: 0, max: 100, step: 5, defaultVal: _xd.width,   suffix: '%' });
      fields.push({ kind: 'sel', label: '· flip dir', key: 'xHatchFlip', opts: [{ v: 'true', l: 'On' }, { v: '', l: 'Off' }] });
    } else {
      num('Length (mm)', 'lengthMM'); num('Height (mm)', 'heightMM');
      fields.push({ kind:'h', label: 'Break-line edges' });
      sel('Top', 'breakEdges.top', ['','true']);
      sel('Bottom', 'breakEdges.bottom', ['','true']);
      sel('Left', 'breakEdges.left', ['','true']);
      sel('Right', 'breakEdges.right', ['','true']);
    }
  } else if (ent.type === 'clt') {
    // NeXTimber CLT panel. Panel designation fixes the to-scale layup; treatment
    // + grain/board knobs are cosmetic. Mode (edge/plan) is set by the tool.
    const _panelKeys = (typeof CLT_PANELS === 'object') ? Object.keys(CLT_PANELS) : [ent.panel];
    fields.push({ kind: 'sel', label: 'Panel', key: 'panel',
      opts: _panelKeys.map(function (k) { return { v: k, l: (CLT_PANELS[k] && CLT_PANELS[k].label) || k }; }) });
    const _treats = (typeof CLT_PRODUCT === 'object' && CLT_PRODUCT.treatments) ? CLT_PRODUCT.treatments : ['Untreated', 'H3'];
    sel('Treatment', 'treatment', _treats);
    fields.push({ kind: 'ro', label: 'View', value: (ent.mode === 'plan') ? 'Plan / face' : 'Edge / section' });
    num('Length (mm)', 'lengthMM');
    if (ent.mode === 'plan') {
      num('Width (mm)', 'widthMM');
      sel('Board axis', 'boardAxis', ['length', 'width']);
    } else {
      sel('Section axis', 'sectionAxis', ['across', 'along']);
      sel('End break', 'endBreak', ['start', 'end', 'both', 'none']);
    }
    num('Rotation°', 'rot', 0.5);
    fields.push({ kind: 'h', label: 'Appearance' });
    fields.push({ kind: 'num', label: 'Board width (mm)', key: 'boardWidth', step: 5, min: 40, max: 400 });
    sel('Show boards', 'showBoards', [{ v: 'true', l: 'On' }, { v: '', l: 'Off' }]);
    const _cg = (typeof CLT_GRAIN_DEFAULTS === 'object') ? CLT_GRAIN_DEFAULTS : { size: 45, spacing: 50, opacity: 30 };
    fields.push({ kind: 'range', label: 'Grain size', key: 'grainSize', min: 0, max: 100, step: 5, defaultVal: _cg.size, suffix: '%' });
    fields.push({ kind: 'range', label: 'Grain spacing', key: 'grainSpacing', min: 0, max: 100, step: 5, defaultVal: _cg.spacing, suffix: '%' });
    fields.push({ kind: 'range', label: 'Grain opacity', key: 'grainOpacity', min: 0, max: 100, step: 5, defaultVal: _cg.opacity, suffix: '%' });
    fields.push({ kind: 'range', label: 'Edge weight', key: 'edgeWeight', min: 0, max: 100, step: 5, defaultVal: (typeof CLT_EDGE_DEFAULT === 'number' ? CLT_EDGE_DEFAULT : 50), suffix: '%' });
    if (typeof cltPropertyRows === 'function') {
      fields.push({ kind: 'h', label: 'Properties' });
      cltPropertyRows(ent.panel, ent.treatment).forEach(function (r) { fields.push({ kind: 'ro', label: r.label, value: r.value }); });
    }
  } else if (ent.type === 'anchor') {
    sel('Kind', 'kind', Object.keys(V25_ANCHOR_DB));
    const def = V25_ANCHOR_DB[ent.kind] || V25_ANCHOR_DB.chemset;
    sel('Size', 'size', def.sizes);
    num('Count', 'count');
    num('Spacing (mm)', 'spacing');
    num('Embed (mm)', 'embed');
    num('Rotation°', 'rot');
    txt('Override text (blank → template)', 'txt', true);
  } else if (ent.type === 'reoBar') {
    sel('Bar', 'barKey', Object.keys(V25_REO_DB.bars));
    txt('Mark', 'mark');
    txt('Spacing label', 'spacing');
    sel('Cog start', 'cogStart', ['','true']);
    sel('Cog end', 'cogEnd', ['','true']);
    sel('Hook end', 'hookEnd', ['','true']);
    num('Lap end (mm)', 'lapEnd');
  } else if (ent.type === 'mesh') {
    sel('Mesh', 'meshKey', Object.keys(V25_REO_DB.meshes));
    sel('Position', 'position', ['BTM','TOP','EW','NS']);
    num('Width (mm)', 'w'); num('Height (mm)', 'h');
  } else if (ent.type === 'leader2') {
    txt('Text (use | for new line)', 'txt', true);
  } else if (ent.type === 'dim2') {
    sel('Font', 'style', (typeof DIM2_FONT_OPTS !== 'undefined') ? DIM2_FONT_OPTS
      : ['plex', 'professional', 'engineer', 'draftsman', 'routed', 'routedWide', 'routedHalf']);
    num('Text height (mm)', 'sz', 0.5);
    sel('Terminator', 'term', ['tick', 'arrow', 'dot']);
    sel('Precision', 'prec', ['0', '1', '2', '3']);
    sel('Units', 'units', ['mm', 'm']);
    num('Offset (mm, paper)', 'off');
    // dim-text-offset — label sits beside / just past the arrows (AS 1100 small-
    // gap convention, e.g. the "5 GAP" callout) instead of centred on the span.
    fields.push({ kind: 'sel', label: 'Text offset', key: 'txtOffset', opts: [{ v: 'true', l: 'On' }, { v: '', l: 'Off' }] });
    txt('Override label (blank → measured)', 'textOverride');
    fields.push({ kind: 'h', label: 'Dimension line' });
    num('Width (mm)', 'dimLw', 0.05);
    col('Line colour', 'dimColour');
    sel('Line style', 'dimLs', ['solid', 'dashed', 'dotted']);
    fields.push({ kind: 'h', label: 'Extension lines' });
    num('Width (mm)', 'extLw', 0.05);
    col('Line colour', 'extColour');
    sel('Line style', 'extLs', ['solid', 'dashed', 'dotted']);
  } else if (ent.type === 'mem2') {
    sel('Type', 'memberType', ['ub','uc','wb','pfc','shs','rhs','glt']);
    let secNames = ent.memberType === 'ub' ? Object.keys(UB_DB).filter(n => n.includes('UB'))
                 : ent.memberType === 'uc' ? Object.keys(UC_DB || {})
                 : ent.memberType === 'wb' ? Object.keys((typeof WB_DB === 'object') ? WB_DB : {})
                 : ent.memberType === 'pfc' ? Object.keys((typeof PFC_DB === 'object') ? PFC_DB : {})
                 : ent.memberType === 'shs' ? Object.keys(SHS_DB)
                 : ent.memberType === 'rhs' ? Object.keys((typeof RHS_DB === 'object' ? RHS_DB : {}))
                 : ent.memberType === 'glt' ? Object.keys((typeof GLT_SIZES === 'object') ? GLT_SIZES : {})
                 : [];
    if (ent.section && !secNames.includes(ent.section)) secNames = [ent.section, ...secNames];
    sel('Section', 'section', secNames);
    sel('Aspect', 'aspect', ['elev','sec']);
    // Axial roll about the member's long axis (0/90/180/270). In section it
    // spins the glyph (web-vert vs web-horiz); in elevation it picks the face
    // (UB web vs flange · RHS deep vs flat · PFC toes away vs toward). Replaces
    // the old PFC open-face select, which the renderer no longer reads.
    sel('Roll° (axis)', 'roll', ['0','90','180','270']);
    num('Length (mm)', 'length');
    num('Rotation°', 'rot', 0.5);
    // End cap kinds get an extra "mitre" option when a join is present so the
    // user can see the auto-mitre is active (and switch back to flat by
    // changing the value).
    const endKinds = ['normal','breakline','mitre'];
    sel('Start end (A)', 'endA', endKinds);
    sel('Far end (B)',   'endB', endKinds);
    col('Fill colour', 'fillColour');
    // GLT timber — grade selector, grain (size / spacing / opacity) sliders, and
    // the full ASH MASSLAM design-property readout for the selected grade + size.
    if (ent.memberType === 'glt') {
      // Seed the grade default if unset so the Grade dropdown and the property
      // table below always agree (placement / type-switch seed it too; this
      // covers any hand-built or legacy GLT entity).
      if (!ent.grade) ent.grade = (typeof GLT_DEFAULT_GRADE !== 'undefined' ? GLT_DEFAULT_GRADE : 'M45');
      const _grades = (typeof GLT_GRADES === 'object') ? Object.keys(GLT_GRADES) : ['M38', 'M45'];
      fields.push({ kind: 'sel', label: 'Grade', key: 'grade',
        opts: _grades.map(function (k) { return { v: k, l: (typeof GLT_GRADES === 'object' && GLT_GRADES[k]) ? GLT_GRADES[k].label : k }; }) });
      const _gd = (typeof GLT_GRAIN_DEFAULTS === 'object') ? GLT_GRAIN_DEFAULTS : { size: 50, spacing: 50, opacity: 35 };
      fields.push({ kind: 'range', label: 'Grain size',    key: 'grainSize',    min: 0, max: 100, step: 5, defaultVal: _gd.size,    suffix: '%' });
      fields.push({ kind: 'range', label: 'Grain spacing', key: 'grainSpacing', min: 0, max: 100, step: 5, defaultVal: _gd.spacing, suffix: '%' });
      fields.push({ kind: 'range', label: 'Grain opacity', key: 'grainOpacity', min: 0, max: 100, step: 5, defaultVal: _gd.opacity, suffix: '%' });
      fields.push({ kind: 'h', label: 'Design properties — ASH MASSLAM' });
      if (typeof gltPropertyRows === 'function') {
        const _g = ent.grade || (typeof GLT_DEFAULT_GRADE !== 'undefined' ? GLT_DEFAULT_GRADE : 'M45');
        const _sz = (typeof GLT_SIZES === 'object') ? GLT_SIZES[ent.section] : null;
        gltPropertyRows(_g, _sz).forEach(function (r) { fields.push({ kind: 'ro', label: r.label, value: r.value }); });
      }
    }
    // Hollow sections (SHS/RHS/CHS) draw two dashed inner-wall hidden lines in
    // elevation — expose a per-member weight stepper so they can be made
    // heavier/lighter. Renderer reads ent.hidLwLevel (drawMem2D, 68-v25-tools.js).
    if (ent.memberType === 'shs' || ent.memberType === 'rhs' || ent.memberType === 'chs') {
      fields.push({ kind:'stepper', label:'Wall line', key:'hidLwLevel',
        ramp: MEM2_HID_LW, labels: MEM2_HID_LW_LABEL, defaultLvl: MEM2_HID_LW_DEFAULT });
    }
    // weld-priority-truss — N-member truss joint priority. Shown only when this
    // member is welded into >=1 joint. "Rank" maps to its connected weld group
    // (Mitre for a plain corner, else Priority 1..N) and is applied via the
    // insert-shift writer in the input listener below; "Resolved" shows the
    // rendered state (SOLID / MITRE / CUT).
    {
      const _wvk = (activeBlock && activeBlock.viewKey) || 'elevation';
      if (typeof v25IsMemberWelded === 'function' && v25IsMemberWelded(ent, _wvk)) {
        fields.push({ kind:'h', label: 'Weld priority' });
        const _comp = (typeof v25WeldComponent === 'function') ? v25WeldComponent(ent, _wvk) : [ent];
        const _opts = [];
        if (typeof v25IsPlain2MemberCorner === 'function' && v25IsPlain2MemberCorner(ent, _wvk)) {
          _opts.push({ v: 'mitre', l: 'Mitre (corner)' });
        }
        for (let _i = 1; _i <= _comp.length; _i++) {
          _opts.push({ v: String(_i), l: 'Priority ' + _i + (_i === 1 ? ' (solid / through)' : '') });
        }
        const _curVal = (typeof v25WeldPriorityCurrentValue === 'function')
          ? v25WeldPriorityCurrentValue(ent, _wvk) : '';
        fields.push({ kind:'sel', label: 'Rank', key: 'weldPriority', opts: _opts, value: _curVal });
        if (typeof v25MemberCutState === 'function') {
          fields.push({ kind:'ro', label: 'Resolved', value: v25MemberCutState(ent, _wvk) });
        }
      }
    }
    // Auto-mitre / weld read-outs and controls when a join exists.
    if (ent.endAJoin || ent.endBJoin) {
      fields.push({ kind:'h', label: 'Auto-mitre joins' });
      const summarise = (endKey) => {
        const join = endKey === 'A' ? ent.endAJoin : ent.endBJoin;
        if (!join) return null;
        const view = (activeBlock && activeBlock.viewKey) || 'elevation';
        const host = (entities2D[view] || []).find(e => e && e.id === join.hostId);
        if (!host) return { join, label: 'host #' + join.hostId + ' (missing)' };
        const cap = (typeof v25Mem2ResolveCap === 'function') ? v25Mem2ResolveCap(ent, endKey) : null;
        const setback = cap
          ? (endKey === 'A'
              ? (cap.topLocalX + cap.botLocalX) / 2
              : (ent.length - (cap.topLocalX + cap.botLocalX) / 2))
          : 0;
        const weldSize = (join.weld && join.weld.size) || (cap && cap.weldSize) || 6;
        return {
          join, host, cap, setback, weldSize,
          label: (host.memberType ? host.memberType.toUpperCase() + ' ' + (host.section || '') : '#' + host.id),
        };
      };
      const sumA = summarise('A');
      const sumB = summarise('B');
      if (sumA) {
        fields.push({ kind:'ro', label: 'End A → host', value: sumA.label });
        fields.push({ kind:'ro', label: 'Setback A (mm)', value: sumA.cap ? sumA.setback.toFixed(0) : '—' });
        fields.push({ kind:'num', label: 'Weld A (mm)', key: 'endAJoin.weld.size', step: 1, min: 3, max: 16 });
      }
      if (sumB) {
        fields.push({ kind:'ro', label: 'End B → host', value: sumB.label });
        fields.push({ kind:'ro', label: 'Setback B (mm)', value: sumB.cap ? sumB.setback.toFixed(0) : '—' });
        fields.push({ kind:'num', label: 'Weld B (mm)', key: 'endBJoin.weld.size', step: 1, min: 3, max: 16 });
      }
      const setbackTotal = (sumA && sumA.cap ? sumA.setback : 0)
                        + (sumB && sumB.cap ? sumB.setback : 0);
      const visualLen = Math.max(0, (ent.length || 0) - setbackTotal);
      fields.push({ kind:'ro', label: 'Visual length (mm)', value: visualLen.toFixed(0) });
    }
  } else if (ent.type === 'lineSet') {
    // linework-upgrade — full line/polyline property set. Raw `lw` (mm) is the
    // single width source; editing it clears any legacy AS1100 ramp level (see
    // the lineSet special-case in the input listener). Colour + Opacity come
    // from the common Display block below.
    fields.push({ kind:'h', label: 'Line' });
    num('Width (mm)', 'lw', 0.05);
    sel('Style', 'ls', ['solid','dashed','dotted','centre','phantom']);
    sel('Cap', 'cap', ['butt','round','square']);
    sel('Join', 'join', ['miter','round','bevel']);
    fields.push({ kind:'ro', label: 'Vertices', value: String((ent.pts && ent.pts.length) || 0) });
    fields.push({ kind:'h', label: 'Ends' });
    sel('Start', 'arrowStart', ['none','arrow','dot','tick']);
    sel('End', 'arrowEnd', ['none','arrow','dot','tick']);
    fields.push({ kind:'h', label: 'Polyline' });
    sel('Closed', 'closed', ['','true']);
    if (ent.closed) {
      sel('Fill material', 'fillMaterial', [''].concat(Object.keys(V25_MATERIALS)));
      col('Fill colour', 'fillColour');
    }
  } else if (ent.type === 'txtBox') {
    txt('Text (multiline ok)', 'txt', true);
    num('Size (mm)', 'sz', 0.5);
    sel('Align', 'align', ['left','center','right']);
  } else if (ent.type === 'noteBox') {
    txt('Text', 'text', true);
    sel('Style', 'style', ['professional','draftsman','engineer','plex','routed','routedWide','routedHalf']);
    sel('Outline box', 'boxed', ['true','']);
    num('Text size (mm)', 'sz', 0.5);
    sel('Arrow', 'arrowStyle', ['arrow','dot','open']);
    num('Arrow line (mm)', 'leaderLwMm', 0.05);
    sel('Case', 'textCase', ['upper','normal']);
  } else if (ent.type === 'screw') {
    // HBS timber screw (js/72i-v25-screw.js). screwSpec is the 02c catalogue key;
    // changing it / the orientation just re-renders via the generic apply handler.
    let screwIds = (typeof HBS_PLATE_SCREWS === 'object') ? Object.keys(HBS_PLATE_SCREWS) : [];
    if (ent.screwSpec && !screwIds.includes(ent.screwSpec)) screwIds = [ent.screwSpec, ...screwIds];
    sel('Size (HBS code)', 'screwSpec', screwIds);
    sel('Orientation', 'screwOrient',
      (typeof V25_SCREW_ORIENT === 'object' && V25_SCREW_ORIENT)
        ? V25_SCREW_ORIENT.map(o => o.id) : ['end','h-headL','h-headR','v-headT','v-headB']);
  } else if (ent.type === 'stud') {
    // ChemSet anchor stud (js/72j-v25-stud.js). studSpec is the 02g catalogue
    // size key; changing it / the orientation re-renders via the generic apply.
    let studIds = (typeof CHEMSET_SIZES !== 'undefined' && CHEMSET_SIZES)
      ? CHEMSET_SIZES.slice()
      : ((typeof CHEMSET_STUDS === 'object') ? Object.keys(CHEMSET_STUDS) : []);
    if (ent.studSpec && !studIds.includes(ent.studSpec)) studIds = [ent.studSpec, ...studIds];
    sel('Size', 'studSpec', studIds);
    sel('Orientation', 'studOrient',
      (typeof V25_STUD_ORIENT === 'object' && V25_STUD_ORIENT)
        ? V25_STUD_ORIENT.map(o => o.id) : ['end','h-nutL','h-nutR','v-nutT','v-nutB']);
    // Embedment controls — SECTION orientations only. The shown defaults are the
    // values actually drawn (from the single-source geometry), so typing over
    // them is WYSIWYG; clearing a field reverts to the catalogue default.
    if ((ent.studOrient || 'v-nutT') !== 'end') {
      const _blk = (typeof activeBlock !== 'undefined') ? activeBlock : null;
      const g = (typeof studSectionGeom === 'function') ? studSectionGeom(_blk, ent) : null;
      const effDepth = g ? Math.round(g.embedDepth) : (ent.embedDepth || 125);
      const effFace  = g ? Math.round(g.sFace) : (ent.faceOffset || 0);
      fields.push({ kind: 'num', label: 'Embedment depth (mm)', key: 'embedDepth', step: 5, min: 10, value: effDepth });
      fields.push({ kind: 'num', label: 'Edge offset (mm)', key: 'faceOffset', step: 5, min: 0, value: effFace });
    }
  }

  // V25-layout-overhaul Phase 7 — common per-entity display overrides.
  // Renderers fall back to the theme defaults when ent.colour / ent.opacity
  // are unset, so adding these fields to every entity is non-destructive.
  fields.push({ kind:'h', label: 'Display' });
  col('Colour', 'colour');
  num('Opacity (0..1)', 'opacity', 0.05);
  // Text-bearing types get a text-size override if the type-specific block
  // didn't already push one (txtBox already has 'sz' from above).
  const _textKinds = ['leader2','memberTag','note','mtext','materialTag','detailRef'];
  if (_textKinds.includes(ent.type) && !fields.some(f => f.key === 'sz')) {
    num('Text size (mm)', 'sz', 0.5);
  }
  // Rotation if not already provided (mem2 / anchor already push it).
  if (!fields.some(f => f.key === 'rot')) {
    num('Rotation°', 'rot', 1);
  }

  let html = `<div class="ins-section"><div class="ins-h">${ent.type.toUpperCase()} #${ent.id}</div>`;
  // First 'h' field is the redundant type-heading (already rendered above);
  // any subsequent 'h' fields are sub-section dividers (e.g. "Display").
  let _hSeen = 0;
  for (const f of fields) {
    if (f.kind === 'h') {
      _hSeen++;
      if (_hSeen === 1) continue;
      html += `<div class="ins-h" style="margin-top:10px;border-top:1px solid var(--border);padding-top:8px">${f.label}</div>`;
      continue;
    }
    // Resolve the field's current value, walking dotted keys so nested join
    // descriptors like "endAJoin.weld.size" round-trip through the inspector.
    const _resolveKey = (root, key) => {
      if (!key) return undefined;
      if (key.indexOf('.') < 0) return root[key];
      const parts = key.split('.');
      let o = root;
      for (const p of parts) {
        if (o == null) return undefined;
        o = o[p];
      }
      return o;
    };
    // weld-priority-truss — a field may carry an explicit `value` override so a
    // select can show a computed current value (e.g. the resolved 1..N rank)
    // rather than the raw stored field.
    const _val = (f.value !== undefined) ? f.value : _resolveKey(ent, f.key);
    const val = (_val !== undefined && _val !== null) ? String(_val) : '';
    const id = `v25-fld-${(f.key || 'ro').replace(/\./g, '_')}`;
    if (f.kind === 'ro') {
      html += `<div class="ins-row"><label>${f.label}</label><span style="flex:1;font-size:11px;color:var(--text-mute);font-family:var(--font-mono)">${(f.value != null) ? String(f.value) : '—'}</span></div>`;
    } else if (f.kind === 'num') {
      const minAttr = f.min != null ? ` min="${f.min}"` : '';
      const maxAttr = f.max != null ? ` max="${f.max}"` : '';
      html += `<div class="ins-row"><label for="${id}">${f.label}</label><input id="${id}" type="number" step="${f.step}"${minAttr}${maxAttr} data-key="${f.key}" value="${val}"/></div>`;
    } else if (f.kind === 'stepper') {
      // AS-1100 line-weight stepper. Stored as an integer level (0..6) so we
      // can later offset for print-mode without changing on-screen ink.
      // Level 0 = no edge stroke at all; default level = 3 (0.13 mm export,
      // rendered at AS1100_LW_PX[3] = 2 px on screen).
      // Per-field ramp/labels/default let other entities reuse this stepper
      // with their own weight table (e.g. the SHS/RHS/CHS "Wall line" stepper
      // uses MEM2_HID_LW); they default to the AS1100_LW table for back-compat.
      const ramp   = f.ramp     || AS1100_LW;
      const labels = f.labels   || AS1100_LW_LABEL;
      const defLvl = (f.defaultLvl != null) ? f.defaultLvl : AS1100_LW_DEFAULT;
      const lvl = (typeof ent[f.key] === 'number')
        ? Math.max(0, Math.min(ramp.length - 1, ent[f.key]))
        : defLvl;
      const dots = ramp.map((mm, i) =>
        `<span class="ins-stepper__dot${i === lvl ? ' on' : ''}" data-lvl="${i}" title="${(labels[i] || '')}${mm ? ' (' + mm + ' mm)' : ''}"></span>`
      ).join('');
      const mmLabel = ramp[lvl] === 0 ? 'none' : ramp[lvl] + ' mm';
      html += `<div class="ins-row"><label>${f.label}</label>` +
        `<div class="ins-stepper" data-key="${f.key}" data-rlen="${ramp.length}" data-rdef="${defLvl}">` +
          `<button type="button" data-step="-1" aria-label="Lighter">−</button>` +
          `<div class="ins-stepper__dots">${dots}</div>` +
          `<button type="button" data-step="+1" aria-label="Heavier">+</button>` +
          `<span class="ins-stepper__readout">${mmLabel}</span>` +
        `</div></div>`;
    } else if (f.kind === 'sel') {
      html += `<div class="ins-row"><label for="${id}">${f.label}</label><select id="${id}" data-key="${f.key}">` +
        f.opts.map(o => {
          const ov = (o && typeof o === 'object') ? o.v : o;
          const ol = (o && typeof o === 'object') ? o.l : (o || '(default)');
          return `<option value="${ov}"${ov === val ? ' selected' : ''}>${ol}</option>`;
        }).join('') +
        `</select></div>`;
    } else if (f.kind === 'range') {
      // Slider field (0–100 grain knobs). Live value badge updated in the input
      // listener below without an inspector rebuild, so dragging stays smooth.
      const rmin = (f.min != null) ? f.min : 0;
      const rmax = (f.max != null) ? f.max : 100;
      const rstep = (f.step != null) ? f.step : 1;
      const rcur = (typeof ent[f.key] === 'number') ? ent[f.key] : ((f.defaultVal != null) ? f.defaultVal : rmin);
      const rsuf = f.suffix || '';
      html += `<div class="ins-row"><label for="${id}">${f.label}</label>` +
        `<input id="${id}" type="range" data-key="${f.key}" data-suffix="${rsuf}" min="${rmin}" max="${rmax}" step="${rstep}" value="${rcur}" style="flex:1"/>` +
        `<span class="ins-range-val" style="flex:0 0 40px;text-align:right;font:11px var(--font-mono,ui-monospace,monospace);color:var(--text-mute)">${rcur}${rsuf}</span>` +
        `</div>`;
    } else if (f.kind === 'area') {
      const v2 = val.replace(/\n/g, '|');
      html += `<div class="ins-row ins-row-col"><label for="${id}">${f.label}</label><textarea id="${id}" data-key="${f.key}" rows="3">${v2}</textarea></div>`;
    } else if (f.kind === 'col') {
      // V25-layout-overhaul Phase 7 — HTML5 colour picker. Empty value falls
      // back to the theme default at render time; the small ↺ button next to
      // it deletes the override so the theme colour kicks back in.
      const themeCol = (typeof getComputedStyle === 'function')
        ? getComputedStyle(document.documentElement).getPropertyValue('--entity-color').trim()
        : '#2c2c2c';
      const shown = val || themeCol || '#2c2c2c';
      const isOverridden = !!val;
      html += `<div class="ins-row"><label for="${id}">${f.label}</label>` +
        `<input id="${id}" type="color" data-key="${f.key}" data-coltype="col" value="${shown}"` +
        ` style="flex:0 0 36px;height:24px;padding:0;cursor:pointer"/>` +
        `<span style="font-size:11px;color:var(--text-mute);flex:1">${isOverridden ? 'override' : '(theme default)'}</span>` +
        `<button type="button" data-resetkey="${f.key}" class="ins-btn" title="Reset to theme default" style="padding:2px 8px;font-size:11px">Reset</button>` +
        `</div>`;
    } else {
      html += `<div class="ins-row"><label for="${id}">${f.label}</label><input id="${id}" type="text" data-key="${f.key}" value="${val.replace(/\"/g, '&quot;')}"/></div>`;
    }
  }
  html += `<div class="ins-row" style="justify-content:space-between"><button id="v25-del" class="ins-btn">Delete</button><button id="v25-dup" class="ins-btn">Duplicate</button></div></div>`;
  root.innerHTML = `<style>
    .ins-section { padding: 10px 12px; font: 12px system-ui; color: var(--text); }
    .ins-h { font-weight: 700; font-size: 11px; letter-spacing: .04em; color: var(--text-mute); margin-bottom: 8px; text-transform: uppercase; }
    .ins-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
    .ins-row-col { flex-direction: column; align-items: stretch; }
    .ins-row label { flex: 0 0 110px; font-size: 11px; color: var(--text-mute); }
    .ins-row input, .ins-row select, .ins-row textarea { flex: 1; padding: 4px 6px; border: 1px solid var(--border); border-radius: 4px; background: var(--surface-2); color: var(--text); font: 12px system-ui; }
    .ins-row textarea { font-family: var(--font-mono); resize: vertical; }
    .ins-btn { padding: 4px 10px; border: 1px solid var(--border); background: var(--surface-3); color: var(--text); border-radius: 4px; cursor: pointer; font-size: 11px; }
    .ins-btn:hover { background: var(--accent, #c0392b); color: var(--accent-ink, #fff); border-color: transparent; }
    /* AS-1100 line-weight stepper */
    .ins-stepper { display:flex; align-items:center; gap:6px; flex:1; }
    .ins-stepper button { padding:0 8px; min-width:22px; height:22px; border:1px solid var(--border);
                          background:var(--surface-3); color:var(--text); border-radius:4px;
                          cursor:pointer; font-size:14px; line-height:1; }
    .ins-stepper button:hover { background:var(--surface-4, var(--surface-3)); }
    .ins-stepper__dots { display:flex; gap:4px; align-items:center; padding:0 2px; }
    .ins-stepper__dot { width:9px; height:9px; border-radius:50%;
                        border:1px solid var(--border-2, var(--border)); background:transparent;
                        cursor:pointer; transition: background var(--t-fast, 100ms); }
    .ins-stepper__dot:hover { background: var(--surface-4, var(--surface-3)); }
    .ins-stepper__dot.on { background:var(--accent, #c0392b); border-color:var(--accent, #c0392b); }
    .ins-stepper__readout { font:11px var(--font-mono, ui-monospace, monospace);
                            color:var(--text-mute); margin-left:auto; min-width:48px;
                            text-align:right; }
  </style>` + html;

  root.querySelectorAll('input, select, textarea').forEach(inp => {
    const k = inp.dataset.key;
    inp.addEventListener('input', () => {
      let val = inp.value;
      if (inp.type === 'number' || inp.type === 'range') {
        // V25-layout-overhaul Phase 7 — for opacity, an empty / NaN value
        // clears the override (rather than setting it to 0 which would hide
        // the entity). All other num fields keep the legacy "|| 0" coercion.
        if ((k === 'opacity' || k === 'embedDepth' || k === 'faceOffset') && (val === '' || !isFinite(parseFloat(val)))) {
          // Empty / NaN clears the override → revert to the catalogue default
          // (rather than writing 0, which would collapse the field).
          delete ent[k];
          requestRender();
          return;
        }
        val = parseFloat(val) || 0;
      }
      if (inp.tagName === 'TEXTAREA') val = val.replace(/\|/g, '\n');
      if (val === 'true') val = true; else if (val === '' && k && (k === 'cogStart' || k === 'cogEnd' || k === 'hookEnd' || k === 'hookStart')) val = false;
      // weld-priority-truss — the "Rank" dropdown maps a 1..N position (or
      // 'mitre') to the insert-shift / mitre writers. Never write the raw select
      // string onto weldPriority (that would corrupt rankKey). Handle + return
      // BEFORE the generic ent[k] = val below.
      if (k === 'weldPriority' && ent.type === 'mem2') {
        const vk = (activeBlock && activeBlock.viewKey) || 'elevation';
        if (val === 'mitre') { if (typeof v25SetCornerMitre === 'function') v25SetCornerMitre(ent, vk); }
        else { const r = parseInt(val, 10); if (r >= 1 && typeof v25AssignRankInsertShift === 'function') v25AssignRankInsertShift(ent, vk, r); }
        if (typeof v25UpdateInspector === 'function') v25UpdateInspector();
        return;
      }
      // Dotted keys (e.g. "endAJoin.weld.size") walk into nested objects,
      // creating missing intermediates so the user can edit a nested value
      // even when the parent didn't exist yet.
      if (k && k.indexOf('.') >= 0) {
        const parts = k.split('.');
        let o = ent;
        for (let i = 0; i < parts.length - 1; i++) {
          if (o[parts[i]] == null || typeof o[parts[i]] !== 'object') o[parts[i]] = {};
          o = o[parts[i]];
        }
        o[parts[parts.length - 1]] = val;
      } else {
        ent[k] = val;
      }
      // linework-upgrade — editing a line's raw Width clears any legacy AS1100
      // ramp level so the renderer honours the mm value the user just typed.
      if (k === 'lw' && ent.type === 'lineSet') delete ent.lwLevel;
      // Toggling Closed rebuilds the inspector so the fill controls show/hide.
      if (k === 'closed' && ent.type === 'lineSet') { v25UpdateInspector(); }
      // Special: for anchor changing kind, refresh size dropdown
      if (k === 'kind' && ent.type === 'anchor') {
        const def = V25_ANCHOR_DB[val];
        if (def && def.defaults) { ent.size = def.defaults.size; ent.embed = def.defaults.embed; }
        v25UpdateInspector();
      }
      // Stud size change → drop the embedment overrides (size/host-dependent) so
      // the entity reverts to the new size's catalogue defaults.
      if (k === 'studSpec' && ent.type === 'stud') {
        delete ent.embedDepth; delete ent.faceOffset;
        // anchor-callout-note: re-stamp the new size's design embedment (M16=150
        // etc.) so drawing + a linked callout note re-default to it, then sync.
        if (typeof V25_STUD_DESIGN_EMBED !== 'undefined' && V25_STUD_DESIGN_EMBED[ent.studSpec] != null) ent.embedDepth = V25_STUD_DESIGN_EMBED[ent.studSpec];
        if (typeof v25SyncStudEmbedReadouts === 'function') v25SyncStudEmbedReadouts(ent);
        v25UpdateInspector();
      }
      // Member type change → reset section to a valid one for the new type.
      if (k === 'memberType' && ent.type === 'mem2') {
        const newDb = val === 'ub' ? UB_DB
                    : val === 'uc' ? (typeof UC_DB === 'object' ? UC_DB : UB_DB)
                    : val === 'wb' ? (typeof WB_DB === 'object' ? WB_DB : UB_DB)
                    : val === 'shs' ? SHS_DB
                    : val === 'rhs' ? (typeof RHS_DB === 'object' ? RHS_DB : {})
                    : val === 'glt' ? (typeof GLT_SIZES === 'object' ? GLT_SIZES : {})
                    : {};
        let names = Object.keys(newDb || {});
        if (val === 'ub') names = names.filter(n => n.includes('UB'));
        if (val === 'uc' && typeof UC_DB === 'object') names = Object.keys(UC_DB);
        if (val === 'wb' && typeof WB_DB === 'object') names = Object.keys(WB_DB);
        if (!names.includes(ent.section)) ent.section = (typeof lastUsedSection !== 'undefined' && lastUsedSection[val]) || names[0] || '';
        // Switching a member to GLT seeds a default grade so the property rows render.
        if (val === 'glt' && !ent.grade) ent.grade = (typeof lastGltGrade !== 'undefined' ? lastGltGrade : (typeof GLT_DEFAULT_GRADE !== 'undefined' ? GLT_DEFAULT_GRADE : 'M45'));
        v25UpdateInspector();
      }
      // Live-sync the top-bar embedment readout when a stud's embedment is edited
      // from the inspector (skips the focused inspector field; no rebuild).
      if (ent.type === 'stud' && (k === 'embedDepth' || k === 'faceOffset')
          && typeof v25SyncStudEmbedReadouts === 'function') {
        v25SyncStudEmbedReadouts(ent);
      }
      // GLT grade change → rebuild so the ASH design-property rows reflect it.
      if (k === 'grade' && ent.type === 'mem2' && typeof v25UpdateInspector === 'function') {
        v25UpdateInspector();
        requestRender();
        return;
      }
      // Live-update a range slider's value badge (grain sliders) without rebuild.
      if (inp.type === 'range') {
        const _vspan = inp.parentElement && inp.parentElement.querySelector('.ins-range-val');
        if (_vspan) _vspan.textContent = inp.value + (inp.dataset.suffix || '');
      }
      requestRender();
    });
  });
  // V25-layout-overhaul Phase 7 — Reset buttons clear an override so the
  // renderer falls back to the theme default (e.g. ent.colour, ent.opacity).
  root.querySelectorAll('button[data-resetkey]').forEach(btn => {
    btn.addEventListener('click', () => {
      const k = btn.dataset.resetkey;
      if (k && ent[k] !== undefined) {
        delete ent[k];
        v25UpdateInspector();
        requestRender();
      }
    });
  });
  // AS-1100 line-weight stepper — −/+ buttons step the level; clicking a dot
  // jumps directly. Re-render the inspector so the highlighted dot and the
  // mm readout track the new level.
  root.querySelectorAll('.ins-stepper').forEach(box => {
    const k = box.dataset.key;
    const rlen = parseInt(box.dataset.rlen) || AS1100_LW.length;
    const rdef = (box.dataset.rdef != null && box.dataset.rdef !== '') ? parseInt(box.dataset.rdef) : AS1100_LW_DEFAULT;
    const setLvl = (n) => {
      const lvl = Math.max(0, Math.min(rlen - 1, n));
      ent[k] = lvl;
      v25UpdateInspector();
      requestRender();
    };
    box.querySelectorAll('button[data-step]').forEach(b => {
      b.addEventListener('click', () => {
        const cur = (typeof ent[k] === 'number') ? ent[k] : rdef;
        setLvl(cur + parseInt(b.dataset.step));
      });
    });
    box.querySelectorAll('.ins-stepper__dot').forEach(d => {
      d.addEventListener('click', () => setLvl(parseInt(d.dataset.lvl)));
    });
  });
  const del = root.querySelector('#v25-del');
  if (del) del.addEventListener('click', () => v25DeleteSelected());
  const dup = root.querySelector('#v25-dup');
  if (dup) dup.addEventListener('click', () => v25DuplicateSelected());
}

function v25DeleteSelected() {
  if (!v25Selected.length) return;
  const arr = entities2D[(activeBlock && activeBlock.viewKey) || 'elevation'];
  if (!arr) return;
  const removed = [];
  for (const id of v25Selected) {
    const idx = arr.findIndex(e => e.id === id);
    if (idx >= 0) removed.push(arr.splice(idx, 1)[0]);
  }
  // anchor-callout-note: reconcile links for removed studs / callout notes
  // (freeze, no cascade). Same view bucket the entities were spliced from.
  const view = (activeBlock && activeBlock.viewKey) || 'elevation';
  if (removed.length && typeof v25AnchorNoteOnDelete === 'function') v25AnchorNoteOnDelete(removed, view);
  if (removed.length) {
    undoStack.push({ act: 'v25Delete', removed, view: activeBlock.viewKey });
    if (undoStack.length > 100) undoStack.shift();
    redoStack = [];
  }
  v25Selected = [];
  const root = document.getElementById('inspectorRoot');
  if (root) root.innerHTML = '';
  // member-size-from-top-bar (2026-06-04) — drop the selected-member size editor
  // from the top bar now that nothing is selected.
  if (typeof v25UpdateOptionsBar === 'function') v25UpdateOptionsBar();
  requestRender();
}
// Clone a set of v25 entity ids IN PLACE (zero offset) into the active view's
// entity bucket. Mints fresh entity ids; any grouped source entities get fresh
// SHARED group ids so the copy is an independent group (never merges back into
// the original). Skips v2 plate mirrors — plates duplicate via the v2 path.
// Returns [{ oldId, newId }, ...] in input order. Shared by the inspector
// "Duplicate" button (v25DuplicateSelected, which then offsets the copies) and
// the Alt/Ctrl drag-duplicate (js/39-events.js, which clones with zero offset).
function v25CloneEntsInPlace(ids) {
  const vk = (activeBlock && activeBlock.viewKey) || 'elevation';
  const arr = entities2D[vk];
  if (!arr || !Array.isArray(ids) || !ids.length) return [];
  const mintGid = (typeof window.v25NewGroupId === 'function')
    ? window.v25NewGroupId
    : function () {
        window.v25GroupSeq = (typeof window.v25GroupSeq === 'number' ? window.v25GroupSeq : 0) + 1;
        return 'g' + window.v25GroupSeq + '_' + Date.now().toString(36);
      };
  const groupRemap = {};   // old groupId -> fresh shared groupId
  const pairs = [];
  for (const id of ids) {
    const ent = arr.find(e => e && e.id === id);
    if (!ent || ent._v2Mirror) continue;   // plate mirrors duplicate via the v2 path
    const clone = JSON.parse(JSON.stringify(ent));
    clone.id = ent2dIdN++;
    // anchor-callout-note: a clone must NOT inherit cross-links to the original's
    // partner (they'd point at the original stud/note by id). Start unlinked so a
    // duplicated callout never drives the original anchor; re-binding is manual.
    if (clone.linkedStudId != null) clone.linkedStudId = null;
    if (clone.linkedNoteId != null) clone.linkedNoteId = null;
    if (clone.groupId) {
      if (!groupRemap[clone.groupId]) groupRemap[clone.groupId] = mintGid();
      clone.groupId = groupRemap[clone.groupId];
    }
    arr.push(clone);
    pairs.push({ oldId: id, newId: clone.id });
  }
  return pairs;
}

function v25DuplicateSelected() {
  if (!v25Selected.length) return;
  const vk = (activeBlock && activeBlock.viewKey) || 'elevation';
  const arr = entities2D[vk];
  if (!arr) return;
  const pairs = v25CloneEntsInPlace(v25Selected);
  const newIds = pairs.map(p => p.newId);
  // The inspector Duplicate is a static copy (not a drag), so nudge the copies
  // off the originals. The drag-duplicate path clones with zero offset instead.
  for (const id of newIds) {
    const clone = arr.find(e => e && e.id === id);
    if (clone) v25Move(clone, 30 * drawingScale, -30 * drawingScale);
  }
  if (newIds.length) {
    undoStack.push({ act: 'v25Add', view: vk,
      ents: newIds.map(id => arr.find(e => e && e.id === id)).filter(Boolean).map(e => JSON.parse(JSON.stringify(e))) });
    if (undoStack.length > 100) undoStack.shift();
    redoStack = [];
  }
  v25Selected = newIds;
  v25UpdateInspector();
  requestRender();
}

// Patch undo to handle v25Delete
const _v25_origUndo = typeof undo === 'function' ? undo : null;
if (_v25_origUndo) {
  window.undo = function() {
    if (undoStack.length && undoStack[undoStack.length - 1].act === 'v25Delete') {
      const a = undoStack.pop(); redoStack.push(a);
      const arr = entities2D[a.view]; if (arr) a.removed.forEach(e => arr.push(JSON.parse(JSON.stringify(e))));
      requestRender(); return;
    }
    return _v25_origUndo.apply(this, arguments);
  };
}

