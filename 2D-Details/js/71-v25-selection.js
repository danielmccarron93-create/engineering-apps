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
    // draw time); body runs ~L into the material, head overhangs ~t1 the other way.
    const t1 = S.t1 || S.dK || 16.5;
    const bodyLen = Math.max(0, (S.L || 120) - t1) + 4;
    const headOver = t1 + 4;
    const headLow = (orient === 'h-headL' || orient === 'v-headB'); // body toward +axis
    const isH = (orient === 'h-headL' || orient === 'h-headR');
    const axLo = headLow ? -headOver : -bodyLen;
    const axHi = headLow ?  bodyLen  :  headOver;
    if (isH) return { L: ent.u + axLo, R: ent.u + axHi, B: ent.v - halfW, T: ent.v + halfW };
    return { L: ent.u - halfW, R: ent.u + halfW, B: ent.v + axLo, T: ent.v + axHi };
  }
  if (ent.type === 'noteBox' && typeof nbBounds === 'function') return nbBounds(ent);
  return null;
}

// Hit-test in real-world (u, v). Tolerance is computed in CSS pixels but
// also capped by an absolute real-world maximum, so when the canvas is
// zoomed way out, picking doesn't grab everything within view.
//
// v25HitTestStack returns ALL entities under the cursor in priority order:
//   PASS 0 — noteBox arrowhead tips (within 8px) FIRST, so an arrow head wins
//            over an overlapping (possibly newer) member behind it; then
//   PASS 1 — the normal z-order (newest-first) tests, accumulated (deduped).
// v25HitTest (below) returns stack[0] — the single top-most pick — preserving
// the entity-or-null contract every existing caller expects. The 2D select
// click uses the full stack so repeat-clicking the same spot walks underneath.
function v25HitTestStack(blk, u, v) {
  const out = [];
  const seen = new Set();
  const push = (ent) => { if (ent && !seen.has(ent.id)) { seen.add(ent.id); out.push(ent); } };
  const cursorPx = real2px(blk, u, v);
  const real2Px = (uu, vv) => real2px(blk, uu, vv);
  const ppmm = viewport.zoom / drawingScale; // px per real-mm
  // Cap effective tolerance to the smaller of pixel-tolerance and a real-mm cap.
  const cap = (pxTol, realMaxMm) => Math.min(pxTol, realMaxMm * ppmm);
  const TOL_PX = cap(6, 40);          // generic pickup
  const LINE_TOL_PX = cap(4, 20);
  const TXT_TOL_PX_X = cap(30, 60);   // text anchor pickup width
  const TXT_TOL_PX_Y = cap(8, 20);
  // Point-to-segment distance in px (for picking up leader lines).
  const distToSeg = (p, a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  };
  const arr = entities2D[blk.viewKey] || [];
  // PASS 0 — arrowhead priority. A noteBox whose arrow TIP is within 8px wins
  // over an overlapping member regardless of z-order (an arrow naturally points
  // AT a member, so the tip almost always sits inside the member's bounds).
  for (let i = arr.length - 1; i >= 0; i--) {
    const ent = arr[i];
    if (!ent || !ent._v25 || ent.type !== 'noteBox') continue;
    if (typeof nbLeaderPoints !== 'function' || !Array.isArray(ent.arrows)) continue;
    for (const a of ent.arrows) {
      const pts = nbLeaderPoints(ent, a).map(p => real2Px(p.u, p.v));
      const tip = pts[pts.length - 1];
      if (tip && Math.hypot(cursorPx.x - tip.x, cursorPx.y - tip.y) < 8) { push(ent); break; }
    }
  }
  // PASS 1 — normal z-order (top-most first). Same per-entity tests as before,
  // but accumulate (push+continue) instead of returning the first match.
  for (let i = arr.length - 1; i >= 0; i--) {
    const ent = arr[i];
    if (!ent._v25) continue;
    // Leader2 — strict pixel-distance checks (text-anchor or on-line).
    if (ent.type === 'leader2') {
      const tp = real2Px(ent.txtU, ent.txtV);
      if (Math.abs(cursorPx.x - tp.x) < TXT_TOL_PX_X &&
          Math.abs(cursorPx.y - tp.y) < TXT_TOL_PX_Y) { push(ent); continue; }
      const tipPx = real2Px(ent.tipU, ent.tipV);
      const dx = tp.x - tipPx.x, dy = tp.y - tipPx.y;
      const lenPx = Math.hypot(dx, dy);
      if (lenPx > 0) {
        const t = ((cursorPx.x - tipPx.x) * dx + (cursorPx.y - tipPx.y) * dy) / (lenPx * lenPx);
        if (t > 0.15 && t < 0.95) {
          const ppx = tipPx.x + t * dx, ppy = tipPx.y + t * dy;
          if (Math.hypot(cursorPx.x - ppx, cursorPx.y - ppy) < LINE_TOL_PX) push(ent);
        }
      }
      continue;
    }
    // NoteBox — pick up when the cursor is on a leader segment or near a tip.
    // Falls through (no continue) so the box body is still hit by the generic
    // bounds test below.
    if (ent.type === 'noteBox' && typeof nbLeaderPoints === 'function' && Array.isArray(ent.arrows)) {
      let onLeader = false;
      for (const a of ent.arrows) {
        const pts = nbLeaderPoints(ent, a).map(p => real2Px(p.u, p.v));
        const tip = pts[pts.length - 1];
        if (tip && Math.hypot(cursorPx.x - tip.x, cursorPx.y - tip.y) < 8) { onLeader = true; break; }
        for (let k = 0; k < pts.length - 1; k++) {
          if (distToSeg(cursorPx, pts[k], pts[k + 1]) < LINE_TOL_PX) { onLeader = true; break; }
        }
        if (onLeader) break;
      }
      if (onLeader) push(ent);   // dedups with PASS 0; box body still tested below
    }
    // Other entities: convert bounds to screen px and test.
    const b = v25EntBounds(ent);
    if (!b) continue;
    const blPx = real2Px(b.L, b.B);
    const trPx = real2Px(b.R, b.T);
    const minX = Math.min(blPx.x, trPx.x), maxX = Math.max(blPx.x, trPx.x);
    const minY = Math.min(blPx.y, trPx.y), maxY = Math.max(blPx.y, trPx.y);
    if (cursorPx.x >= minX - TOL_PX && cursorPx.x <= maxX + TOL_PX &&
        cursorPx.y >= minY - TOL_PX && cursorPx.y <= maxY + TOL_PX) {
      // Frame — border only.
      if (ent.type === 'frame') {
        const inset = TOL_PX;
        if (cursorPx.x > minX + inset && cursorPx.x < maxX - inset &&
            cursorPx.y > minY + inset && cursorPx.y < maxY - inset) continue;
      }
      push(ent);
    }
  }
  return out;
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
function v25EntHandles(ent) {
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
  } else if (ent.type === 'leader2') {
    out.push({ key: 'tip', u: ent.tipU, v: ent.tipV });
    out.push({ key: 'txt', u: ent.txtU, v: ent.txtV });
  } else if (ent.type === 'anchor' && ent.txtU != null && ent.txtV != null) {
    out.push({ key: 'txt', u: ent.txtU, v: ent.txtV });
  } else if (ent.type === 'bolt2') {
    // Single body grip at the bolt centre — drag to reposition (mirrors the
    // anchor's simple point-move; v25Move's generic body-move translates u,v).
    out.push({ key: 'body', u: ent.u, v: ent.v });
  } else if (ent.type === 'screw') {
    // Single body grip at the screw head — drag to reposition (mirrors bolt2).
    out.push({ key: 'body', u: ent.u, v: ent.v });
  }
  // Mat — rotation handle (Bluebeam-style perpendicular ball above the top
  // edge). Same affordance as mem2 so the user has one mental model for
  // "spin this thing". Polygon mats use centroid + furthest-point radius
  // to push the handle outside the visible polygon.
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
    } else if (ent.type === 'anchor') {
      pts.push({ u: ent.u, v: ent.v, src: ent.id });
      if (ent.txtU != null && ent.txtV != null) pts.push({ u: ent.txtU, v: ent.txtV, src: ent.id });
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

function v25DrawSelectionHighlight(blk, cs) {
  if (sheetMode !== '2d') return;
  const col = cs.getPropertyValue('--selected-color').trim() || '#4a90e2';
  // Faint dashed outline around each selected entity. Mat entities draw a
  // tight rotated outline (matching the visible polygon) when ent.rot is
  // non-zero; everything else falls back to an axis-aligned bbox.
  if (v25Selected.length) {
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.0;
    ctx.setLineDash([5, 4]);
    ctx.globalAlpha = 0.5;
    for (const id of v25Selected) {
      const ent = (entities2D[blk.viewKey] || []).find(e => e.id === id);
      if (!ent) continue;
      // Rotated mat — draw the actual rotated rect/poly outline so the
      // selection highlight tracks the visible geometry instead of an
      // overly-large AABB envelope.
      if (ent.type === 'mat' && ent.rot) {
        const rotRad = ent.rot * Math.PI / 180;
        const cosR = Math.cos(rotRad), sinR = Math.sin(rotRad);
        let pts;
        if (ent.shape === 'poly' && ent.pts && ent.pts.length) {
          const c = _v25MatCentroid(ent);
          pts = ent.pts.map(p => {
            const lx = p.u - c.u, ly = p.v - c.v;
            return { u: c.u + lx * cosR - ly * sinR, v: c.v + lx * sinR + ly * cosR };
          });
        } else {
          const w = ent.w || 0, h = ent.h || 0;
          const cu = ent.u + w/2, cv = ent.v + h/2;
          pts = [[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]].map(([lx,ly]) => ({
            u: cu + lx * cosR - ly * sinR,
            v: cv + lx * sinR + ly * cosR,
          }));
        }
        ctx.beginPath();
        pts.forEach((p, i) => {
          const sp = real2px(blk, p.u, p.v);
          if (i === 0) ctx.moveTo(sp.x, sp.y); else ctx.lineTo(sp.x, sp.y);
        });
        ctx.closePath();
        ctx.stroke();
        continue;
      }
      const b = v25EntBounds(ent);
      if (!b) continue;
      const tl = real2px(blk, b.L, b.T);
      const br = real2px(blk, b.R, b.B);
      ctx.strokeRect(Math.min(tl.x, br.x) - 3, Math.min(tl.y, br.y) - 3,
                     Math.abs(br.x - tl.x) + 6, Math.abs(br.y - tl.y) + 6);
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
  // Filled grip squares at every editable handle on each selected entity.
  // Bluebeam-style — pop on hover.
  for (const id of v25Selected) {
    const ent = (entities2D[blk.viewKey] || []).find(e => e.id === id);
    if (!ent) continue;
    const handles = v25EntHandles(ent);
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
        if (h.key === 'rotate' && (ent.type === 'mem2' || ent.type === 'mat' || ent.type === 'blockWall')) {
          let mU, mV;
          if (ent.type === 'mem2' || ent.type === 'blockWall') {
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
  // Body-hover affordance — light dashed box around an unselected entity
  // the cursor is over.
  if (v25Hover && v25Hover.handle === null && !v25Selected.includes(v25Hover.entId)) {
    const ent = (entities2D[blk.viewKey] || []).find(e => e.id === v25Hover.entId);
    if (ent) {
      const b = v25EntBounds(ent);
      if (b) {
        const tl = real2px(blk, b.L, b.T);
        const br = real2px(blk, b.R, b.B);
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.0;
        ctx.setLineDash([3, 3]);
        ctx.globalAlpha = 0.45;
        ctx.strokeRect(Math.min(tl.x, br.x) - 3, Math.min(tl.y, br.y) - 3,
                       Math.abs(br.x - tl.x) + 6, Math.abs(br.y - tl.y) + 6);
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
    }
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
    const handles = v25EntHandles(ent);
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

  // Member end-handles: drag one end to extend / re-angle while the other end stays put.
  if (ent.type === 'mem2' && (handle === 'end-a' || handle === 'end-b')) {
    const rot = (ent.rot || 0) * Math.PI / 180;
    const len = ent.length || 0;
    const ax = ent.u, ay = ent.v;
    const bx = ent.u + Math.cos(rot) * len, by = ent.v + Math.sin(rot) * len;
    let newAx = ax, newAy = ay, newBx = bx, newBy = by;
    if (handle === 'end-a') { newAx = ax + du; newAy = ay + dv; }
    else                    { newBx = bx + du; newBy = by + dv; }
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
      sel('Grout cores', 'grouted', ['','true']);
    } else {
      num('Length (mm)', 'lengthMM'); num('Height (mm)', 'heightMM');
      fields.push({ kind:'h', label: 'Break-line edges' });
      sel('Top', 'breakEdges.top', ['','true']);
      sel('Bottom', 'breakEdges.bottom', ['','true']);
      sel('Left', 'breakEdges.left', ['','true']);
      sel('Right', 'breakEdges.right', ['','true']);
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
  } else if (ent.type === 'mem2') {
    sel('Type', 'memberType', ['ub','uc','wb','pfc','shs','rhs']);
    let secNames = ent.memberType === 'ub' ? Object.keys(UB_DB).filter(n => n.includes('UB'))
                 : ent.memberType === 'uc' ? Object.keys(UC_DB || {})
                 : ent.memberType === 'wb' ? Object.keys((typeof WB_DB === 'object') ? WB_DB : {})
                 : ent.memberType === 'pfc' ? Object.keys((typeof PFC_DB === 'object') ? PFC_DB : {})
                 : ent.memberType === 'shs' ? Object.keys(SHS_DB)
                 : ent.memberType === 'rhs' ? Object.keys((typeof RHS_DB === 'object' ? RHS_DB : {}))
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
    // Hollow sections (SHS/RHS/CHS) draw two dashed inner-wall hidden lines in
    // elevation — expose a per-member weight stepper so they can be made
    // heavier/lighter. Renderer reads ent.hidLwLevel (drawMem2D, 68-v25-tools.js).
    if (ent.memberType === 'shs' || ent.memberType === 'rhs' || ent.memberType === 'chs') {
      fields.push({ kind:'stepper', label:'Wall line', key:'hidLwLevel',
        ramp: MEM2_HID_LW, labels: MEM2_HID_LW_LABEL, defaultLvl: MEM2_HID_LW_DEFAULT });
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
    fields.push({ kind:'h', label: 'Edge' });
    fields.push({ kind:'stepper', label:'Thickness', key:'lwLevel' });
    sel('Style', 'ls', ['solid','dashed','centre','phantom']);
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
    const _val = _resolveKey(ent, f.key);
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
        f.opts.map(o => `<option value="${o}"${o === val ? ' selected' : ''}>${o || '(default)'}</option>`).join('') +
        `</select></div>`;
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
      if (inp.type === 'number') {
        // V25-layout-overhaul Phase 7 — for opacity, an empty / NaN value
        // clears the override (rather than setting it to 0 which would hide
        // the entity). All other num fields keep the legacy "|| 0" coercion.
        if (k === 'opacity' && (val === '' || !isFinite(parseFloat(val)))) {
          delete ent[k];
          requestRender();
          return;
        }
        val = parseFloat(val) || 0;
      }
      if (inp.tagName === 'TEXTAREA') val = val.replace(/\|/g, '\n');
      if (val === 'true') val = true; else if (val === '' && k && (k === 'cogStart' || k === 'cogEnd' || k === 'hookEnd' || k === 'hookStart')) val = false;
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
      // Special: for anchor changing kind, refresh size dropdown
      if (k === 'kind' && ent.type === 'anchor') {
        const def = V25_ANCHOR_DB[val];
        if (def && def.defaults) { ent.size = def.defaults.size; ent.embed = def.defaults.embed; }
        v25UpdateInspector();
      }
      // Member type change → reset section to a valid one for the new type.
      if (k === 'memberType' && ent.type === 'mem2') {
        const newDb = val === 'ub' ? UB_DB
                    : val === 'uc' ? (typeof UC_DB === 'object' ? UC_DB : UB_DB)
                    : val === 'wb' ? (typeof WB_DB === 'object' ? WB_DB : UB_DB)
                    : val === 'shs' ? SHS_DB
                    : val === 'rhs' ? (typeof RHS_DB === 'object' ? RHS_DB : {})
                    : {};
        let names = Object.keys(newDb || {});
        if (val === 'ub') names = names.filter(n => n.includes('UB'));
        if (val === 'uc' && typeof UC_DB === 'object') names = Object.keys(UC_DB);
        if (val === 'wb' && typeof WB_DB === 'object') names = Object.keys(WB_DB);
        if (!names.includes(ent.section)) ent.section = (typeof lastUsedSection !== 'undefined' && lastUsedSection[val]) || names[0] || '';
        v25UpdateInspector();
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
  if (removed.length) {
    undoStack.push({ act: 'v25Delete', removed, view: activeBlock.viewKey });
    if (undoStack.length > 100) undoStack.shift();
    redoStack = [];
  }
  v25Selected = [];
  const root = document.getElementById('inspectorRoot');
  if (root) root.innerHTML = '';
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

