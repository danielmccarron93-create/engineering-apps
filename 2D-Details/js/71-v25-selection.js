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
  if (ent.type === 'frame' || ent.type === 'blockWall' || ent.type === 'mesh') {
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
  return null;
}

// Hit-test in real-world (u, v). Tolerance is computed in CSS pixels but
// also capped by an absolute real-world maximum, so when the canvas is
// zoomed way out, picking doesn't grab everything within view.
function v25HitTest(blk, u, v) {
  const cursorPx = real2px(blk, u, v);
  const real2Px = (uu, vv) => real2px(blk, uu, vv);
  const ppmm = viewport.zoom / drawingScale; // px per real-mm
  // Cap effective tolerance to the smaller of pixel-tolerance and a real-mm cap.
  const cap = (pxTol, realMaxMm) => Math.min(pxTol, realMaxMm * ppmm);
  const TOL_PX = cap(6, 40);          // generic pickup
  const LINE_TOL_PX = cap(4, 20);
  const TXT_TOL_PX_X = cap(30, 60);   // text anchor pickup width
  const TXT_TOL_PX_Y = cap(8, 20);
  // Iterate in reverse so top-most is selected first.
  const arr = entities2D[blk.viewKey] || [];
  for (let i = arr.length - 1; i >= 0; i--) {
    const ent = arr[i];
    if (!ent._v25) continue;
    // Leader2 — strict pixel-distance checks (text-anchor or on-line).
    if (ent.type === 'leader2') {
      const tp = real2Px(ent.txtU, ent.txtV);
      if (Math.abs(cursorPx.x - tp.x) < TXT_TOL_PX_X &&
          Math.abs(cursorPx.y - tp.y) < TXT_TOL_PX_Y) return ent;
      const tipPx = real2Px(ent.tipU, ent.tipV);
      const dx = tp.x - tipPx.x, dy = tp.y - tipPx.y;
      const lenPx = Math.hypot(dx, dy);
      if (lenPx > 0) {
        const t = ((cursorPx.x - tipPx.x) * dx + (cursorPx.y - tipPx.y) * dy) / (lenPx * lenPx);
        if (t > 0.15 && t < 0.95) {
          const ppx = tipPx.x + t * dx, ppy = tipPx.y + t * dy;
          if (Math.hypot(cursorPx.x - ppx, cursorPx.y - ppy) < LINE_TOL_PX) return ent;
        }
      }
      continue;
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
      return ent;
    }
  }
  return null;
}

// Draw selection highlight for selected v25 entities
// Returns the list of visible drag-handles for an entity. Each handle
// becomes a clickable Bluebeam-style "grip square" when the entity is
// selected. The `key` matches what v25HitHandle returns / v25Move expects.
function v25EntHandles(ent) {
  const out = [];
  if (!ent) return out;
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
  } else if (ent.type === 'leader2') {
    out.push({ key: 'tip', u: ent.tipU, v: ent.tipV });
    out.push({ key: 'txt', u: ent.txtU, v: ent.txtV });
  } else if (ent.type === 'anchor' && ent.txtU != null && ent.txtV != null) {
    out.push({ key: 'txt', u: ent.txtU, v: ent.txtV });
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
        if (h.key === 'rotate' && (ent.type === 'mem2' || ent.type === 'mat')) {
          let mU, mV;
          if (ent.type === 'mem2') {
            const r2 = (ent.rot || 0) * Math.PI / 180;
            const lenR = ent.length || 0;
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
  return 'body';
}

// Move an entity by (du, dv) in real-world coords.
function v25Move(ent, du, dv, handle) {
  handle = handle || 'body';
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
    return;
  }

  // Mat (hatch) rotation handle — same Bluebeam-style perpendicular ball,
  // same snap defaults as mem2. Whole entity (outline + hatch + dots + rings
  // + grain) rotates rigidly via drawMat2D's canvas transform; we only have
  // to update ent.rot here.
  if (ent.type === 'mat' && handle === 'rotate') {
    const c = _v25MatCentroid(ent);
    const cu = (typeof v25Drag === 'object' && v25Drag) ? (v25Drag.lastU + du) : (c.u + du);
    const cv = (typeof v25Drag === 'object' && v25Drag) ? (v25Drag.lastV + dv) : (c.v + dv);
    const dx = cu - c.u, dy = cv - c.v;
    if (dx * dx + dy * dy < 1) return;
    // Handle sits perpendicular to the top edge, so subtract 90° as for mem2.
    const cursorRot = Math.atan2(dy, dx) - Math.PI / 2;
    const newRot = applySnappedRotation(cursorRot, !!(typeof shiftHeld !== 'undefined' && shiftHeld));
    ent.rot = newRot * 180 / Math.PI;
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
    sel('Aspect', 'aspect', ['elev','plan','sec']);
    num('Length (mm)', 'lengthMM'); num('Height (mm)', 'heightMM');
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
    // PFC-only: open-face side. Affects cross-section drawing only.
    if (ent.memberType === 'pfc') {
      sel('Open face', 'openSide', ['-v','+v']);
    }
    num('Length (mm)', 'length');
    num('Rotation°', 'rot', 0.5);
    // End cap kinds get an extra "mitre" option when a join is present so the
    // user can see the auto-mitre is active (and switch back to flat by
    // changing the value).
    const endKinds = ['normal','breakline','mitre'];
    sel('Start end (A)', 'endA', endKinds);
    sel('Far end (B)',   'endB', endKinds);
    col('Fill colour', 'fillColour');
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
      const lvl = (typeof ent[f.key] === 'number')
        ? Math.max(0, Math.min(AS1100_LW.length - 1, ent[f.key]))
        : AS1100_LW_DEFAULT;
      const dots = AS1100_LW.map((mm, i) =>
        `<span class="ins-stepper__dot${i === lvl ? ' on' : ''}" data-lvl="${i}" title="${AS1100_LW_LABEL[i]}${mm ? ' (' + mm + ' mm)' : ''}"></span>`
      ).join('');
      const mmLabel = AS1100_LW[lvl] === 0 ? 'none' : AS1100_LW[lvl] + ' mm';
      html += `<div class="ins-row"><label>${f.label}</label>` +
        `<div class="ins-stepper" data-key="${f.key}">` +
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
    const setLvl = (n) => {
      const lvl = Math.max(0, Math.min(AS1100_LW.length - 1, n));
      ent[k] = lvl;
      v25UpdateInspector();
      requestRender();
    };
    box.querySelectorAll('button[data-step]').forEach(b => {
      b.addEventListener('click', () => {
        const cur = (typeof ent[k] === 'number') ? ent[k] : AS1100_LW_DEFAULT;
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
function v25DuplicateSelected() {
  if (!v25Selected.length) return;
  const arr = entities2D[(activeBlock && activeBlock.viewKey) || 'elevation'];
  if (!arr) return;
  const newIds = [];
  for (const id of v25Selected) {
    const ent = arr.find(e => e.id === id);
    if (!ent) continue;
    const clone = JSON.parse(JSON.stringify(ent));
    clone.id = ent2dIdN++;
    v25Move(clone, 30 * drawingScale, -30 * drawingScale);
    arr.push(clone);
    newIds.push(clone.id);
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

