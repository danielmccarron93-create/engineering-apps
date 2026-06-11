'use strict';

// V25 — GLT timber NOTCH / VOID cutting tool (chalk-marking edition).
// ============================================================================
// Carve a placed GLT (ASH MASSLAM) member like a traditional Japanese carpenter:
// right-click a single GLT member -> "Notch…" arms a transient mode. The cursor
// becomes a piece of black chalk; you MARK the shape to be removed first — click
// each node of a free polygon (angled corners, bespoke joinery), the marks read
// as hand-drawn black chalk, the timber gets a warm transparent tint and the
// area being cut is knocked out so it's obvious what will go. Then double-click
// or Enter and the marked shape flashes and is "sawn off" with a short
// animation. A double-click on an empty point still opens a Square/Rectangle/
// Circle sized-void dialog.
//
// Marking aids:
//   • Shift snaps the new segment to ortho / 45° relative to the last node.
//   • Nodes snap subtly to the member's edges and to existing nodes
//     (snap onto the first node to close the shape).
//   • Type a number mid-mark for CAD direct-distance-entry — the next node locks
//     to that length along the current direction; Enter (or click) places it.
//
// All cuts are stored on the entity in its LOCAL frame (ent.notches) so they
// ride through move / rotate / flip and save-load with no extra code — exactly
// like the timber grain. Rendering uses explicit segments/polygons/arcs (never
// ctx.clip, which the vector-PDF shim ignores) so PDF + DXF export stay true.
//
// Loaded after 72k-v25-glt.js, before 73-init.js. Depends on: GLT_SIZES
// (02h); v25Mem2HalfDepth / v25Mem2EffRoll / v25Mem2WorldOutline (68);
// real2px / px2real / ppm / colorAlpha (08); entities2D / activeBlock /
// viewport / drawingScale / tool / v25State / v25Selected / shiftHeld / ctx /
// canvas (globals); v25SetTool (69); requestRender (22); workspaceTouchActive
// (04); undoStack/redoStack (05).
//
// Data model (all LOCAL-frame coords, same frame as drawMem2D's project(lu,lv)):
//   ent.notches = [
//     { shape:'poly',   kind:'edge'|'void', pts:[[lu,lv],…] },  // freehand mark
//     { shape:'rect',   kind:'edge'|'void', lu, lv, w, h },      // sized-void dialog
//     { shape:'circle', kind:'void',        lu, lv, r },         // sized-void dialog
//   ]
// kind:'edge' removes material that opens onto the boundary (reshapes the member
// edge, reveals what's behind); kind:'void' is an interior hole painted to the
// sheet background (clean white space, no grain).

// ---- Tunables ---------------------------------------------------------------
const NOTCH_EDGE_SNAP_PX = 11;   // node-to-edge / node-to-node snap distance
const NOTCH_CLOSE_PX     = 14;   // snap-to-first-node (close shape) distance
const NOTCH_GLOW_FALLBACK = '#d9852a';
const NOTCH_CHALK_COL = '#1a1714';   // near-black warm charcoal — "black chalk"

// A short stick of black chalk held at an angle (dark body, worn light tip).
// Hotspot at the chalk tip so the mark lands where the user points.
const NOTCH_CHALK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26">' +
  '<polygon points="20,3 23.5,6.5 9.5,20.5 6,17" fill="#2a2723" stroke="#000" stroke-width="0.8" stroke-linejoin="round"/>' +
  '<polygon points="9.5,20.5 6,17 4,22 8.2,23.6" fill="#efe7d4" stroke="#000" stroke-width="0.6" stroke-linejoin="round"/>' +
  '<line x1="18.5" y1="5.2" x2="8" y2="15.5" stroke="#fff" stroke-width="0.7" opacity="0.18"/>' +
  '</svg>';
const NOTCH_CHALK_CURSOR =
  'url("data:image/svg+xml,' + encodeURIComponent(NOTCH_CHALK_SVG) + '") 5 22, crosshair';

// ---- Module state: saw-off commit animation --------------------------------
let _notchFlash = null;   // { id, rec, t0, dur }
function _notchNow() { return (typeof performance === 'object' && performance.now) ? performance.now() : Date.now(); }

// ---- Entity lookup ----------------------------------------------------------
function v25NotchViewOf(id) {
  if (typeof entities2D !== 'object') return null;
  if (typeof activeBlock === 'object' && activeBlock && Array.isArray(entities2D[activeBlock.viewKey])
      && entities2D[activeBlock.viewKey].some(function (e) { return e && e.id === id; })) {
    return activeBlock.viewKey;
  }
  for (const vk in entities2D) {
    if (Array.isArray(entities2D[vk]) && entities2D[vk].some(function (e) { return e && e.id === id; })) return vk;
  }
  return null;
}
function v25NotchFindEnt(id) {
  const vk = v25NotchViewOf(id);
  if (!vk) return null;
  return entities2D[vk].find(function (e) { return e && e.id === id; }) || null;
}
function v25NotchActiveEnt() {
  if (tool !== 'v25-notch' || typeof v25State !== 'object' || !v25State.notch) return null;
  return v25NotchFindEnt(v25State.notch.id);
}

// ---- Local frame ------------------------------------------------------------
// Effective in-plane rotation of the member's local frame (elevation uses rot;
// section uses effRoll — matching drawMem2D's project() closure exactly).
function v25NotchRot(ent) {
  const deg = ((ent.aspect || 'elev') === 'sec')
    ? ((typeof v25Mem2SecRotDeg === 'function') ? v25Mem2SecRotDeg(ent)
       : (typeof v25Mem2EffRoll === 'function') ? v25Mem2EffRoll(ent) : 0)
    : (ent.rot || 0);
  return deg * Math.PI / 180;
}
function v25NotchWorldToLocal(ent, wu, wv) {
  const r = v25NotchRot(ent), c = Math.cos(r), s = Math.sin(r);
  const du = wu - ent.u, dv = wv - ent.v;
  return { lu: du * c + dv * s, lv: -du * s + dv * c };
}
function v25NotchLocalToWorld(ent, lu, lv) {
  const r = v25NotchRot(ent), c = Math.cos(r), s = Math.sin(r);
  return { u: ent.u + lu * c - lv * s, v: ent.v + lu * s + lv * c };
}
// The member's solid body box in LOCAL coords {u0,u1,v0,v1}, by aspect/roll.
function v25NotchBodyRect(ent) {
  if ((ent.aspect || 'elev') === 'sec') {
    const db = (typeof GLT_SIZES === 'object') ? GLT_SIZES[ent.section] : null;
    const hW = (db && db.b ? db.b : 100) / 2, hH = (db && db.d ? db.d : 100) / 2;
    return { u0: -hW, u1: hW, v0: -hH, v1: hH };
  }
  const len = ent.length || 0;
  const hB = (typeof v25Mem2HalfDepth === 'function') ? v25Mem2HalfDepth(ent) : 50;
  return { u0: 0, u1: len, v0: -hB, v1: hB };
}

// ---- Geometry primitives ----------------------------------------------------
// Even-odd point-in-polygon. pts = [[x,y],…].
function v25NotchPtInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
// Parameter t along A→B where it crosses segment C→D (both in [0,1]); else null.
function _v25NotchSegT(ax, ay, bx, by, cx, cy, dx, dy) {
  const den = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
  if (Math.abs(den) < 1e-12) return null;
  const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / den;
  const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / den;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return t;
}
// Liang–Barsky clip of segment A→B to an axis-aligned rect. Returns [[x,y],[x,y]] or null.
function _v25ClipSegRect(ax, ay, bx, by, r) {
  let t0 = 0, t1 = 1; const dx = bx - ax, dy = by - ay;
  const p = [-dx, dx, -dy, dy], q = [ax - r.u0, r.u1 - ax, ay - r.v0, r.v1 - ay];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-12) { if (q[i] < 0) return null; }
    else { const t = q[i] / p[i]; if (p[i] < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; } }
  }
  if (t1 - t0 < 1e-9) return null;
  return [[ax + t0 * dx, ay + t0 * dy], [ax + t1 * dx, ay + t1 * dy]];
}
// Sutherland–Hodgman clip of a polygon to an axis-aligned rect. Returns pts or null.
function _v25ClipPolyRect(poly, r) {
  const clip = function (pts, inside, isect) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const cur = pts[i], prev = pts[(i + pts.length - 1) % pts.length];
      const ci = inside(cur), pi = inside(prev);
      if (ci) { if (!pi) out.push(isect(prev, cur)); out.push(cur); }
      else if (pi) { out.push(isect(prev, cur)); }
    }
    return out;
  };
  let p = poly.map(function (q) { return [q[0], q[1]]; });
  p = clip(p, function (c) { return c[0] >= r.u0; }, function (a, b) { const t = (r.u0 - a[0]) / (b[0] - a[0]); return [r.u0, a[1] + (b[1] - a[1]) * t]; }); if (!p.length) return null;
  p = clip(p, function (c) { return c[0] <= r.u1; }, function (a, b) { const t = (r.u1 - a[0]) / (b[0] - a[0]); return [r.u1, a[1] + (b[1] - a[1]) * t]; }); if (!p.length) return null;
  p = clip(p, function (c) { return c[1] >= r.v0; }, function (a, b) { const t = (r.v0 - a[1]) / (b[1] - a[1]); return [a[0] + (b[0] - a[0]) * t, r.v0]; }); if (!p.length) return null;
  p = clip(p, function (c) { return c[1] <= r.v1; }, function (a, b) { const t = (r.v1 - a[1]) / (b[1] - a[1]); return [a[0] + (b[0] - a[0]) * t, r.v1]; }); if (!p.length) return null;
  return p;
}
// Snap a vector last→cur to the nearest 45° direction, preserving its length.
function v25NotchOrtho(lu0, lv0, lu, lv) {
  const dx = lu - lu0, dy = lv - lv0, len = Math.hypot(dx, dy);
  if (len < 1e-6) return { lu: lu, lv: lv };
  const step = Math.PI / 4;
  const ang = Math.round(Math.atan2(dy, dx) / step) * step;
  return { lu: lu0 + Math.cos(ang) * len, lv: lv0 + Math.sin(ang) * len };
}

// ---- Cut derivation ---------------------------------------------------------
// Normalise one stored notch into a working shape:
//   {k:'p', kind, pts, poly}  | {k:'r', kind, u0..,pts,poly} | {k:'c', kind, cx,cy,r}
function _v25NotchShape(n) {
  if (!n) return null;
  // A circle is always an interior void (no polygon outline to fold into an
  // edge cut), so force kind:'void' — guards against a hand-edited save carrying
  // an unrenderable {shape:'circle',kind:'edge'}.
  if (n.shape === 'circle') return { k: 'c', kind: 'void', cx: n.lu, cy: n.lv, r: Math.abs(n.r || 0) };
  if (n.shape === 'poly') {
    const pts = (n.pts || []).map(function (p) { return [p[0], p[1]]; });
    if (pts.length < 3) return null;
    return { k: 'p', kind: n.kind || 'void', pts: pts, poly: pts };
  }
  const u0 = Math.min(n.lu, n.lu + n.w), u1 = Math.max(n.lu, n.lu + n.w);
  const v0 = Math.min(n.lv, n.lv + n.h), v1 = Math.max(n.lv, n.lv + n.h);
  const poly = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
  return { k: 'r', kind: n.kind || 'void', u0: u0, v0: v0, u1: u1, v1: v1, pts: poly, poly: poly };
}
// Visible outline for EDGE cuts via segment clipping (robust for any polygon,
// including nodes snapped exactly onto the boundary):
//   bodySegs = body-rect edges clipped to the parts OUTSIDE every cut polygon
//   cutSegs  = cut-polygon edges clipped to the parts INSIDE the body rect
function v25NotchEdgeOutline(body, polys) {
  const bodyEdges = [
    [[body.u0, body.v0], [body.u1, body.v0]], [[body.u1, body.v0], [body.u1, body.v1]],
    [[body.u1, body.v1], [body.u0, body.v1]], [[body.u0, body.v1], [body.u0, body.v0]],
  ];
  // Boundary-robustness: notch nodes routinely snap EXACTLY onto a body edge, so
  // a cut edge can run collinear with the body boundary. A raw point-in-polygon
  // test on such a boundary midpoint is unreliable (returns false), which would
  // leave the notch "mouth" drawn closed. Two guards fix it: (a) nudge the test
  // point a hair toward the body centre before the PIP, so a midpoint sitting on
  // a collinear cut edge counts as inside the cut (→ that body span is removed);
  // (b) drop cut edges that lie along a body boundary line (the open mouth, which
  // must read as removed, not a drawn face).
  const cux = (body.u0 + body.u1) / 2, cvy = (body.v0 + body.v1) / 2;
  const NUD = 0.3;   // mm toward centre
  const bodySegs = [];
  for (const ed of bodyEdges) {
    const ax = ed[0][0], ay = ed[0][1], bx = ed[1][0], by = ed[1][1];
    const ts = [0, 1];
    for (const poly of polys) {
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const t = _v25NotchSegT(ax, ay, bx, by, poly[j][0], poly[j][1], poly[i][0], poly[i][1]);
        if (t != null && t > 1e-9 && t < 1 - 1e-9) ts.push(t);
      }
    }
    ts.sort(function (a, b) { return a - b; });
    for (let i = 0; i < ts.length - 1; i++) {
      const t0 = ts[i], t1 = ts[i + 1]; if (t1 - t0 < 1e-7) continue;
      const mt = (t0 + t1) / 2, mx = ax + (bx - ax) * mt, my = ay + (by - ay) * mt;
      const dxC = cux - mx, dyC = cvy - my, dL = Math.hypot(dxC, dyC) || 1;
      const tx = mx + dxC / dL * NUD, ty = my + dyC / dL * NUD;
      let inside = false;
      for (const poly of polys) { if (v25NotchPtInPoly(tx, ty, poly)) { inside = true; break; } }
      if (!inside) bodySegs.push([[ax + (bx - ax) * t0, ay + (by - ay) * t0], [ax + (bx - ax) * t1, ay + (by - ay) * t1]]);
    }
  }
  const onBoundary = function (a, c) {
    const t = 0.5;
    return (Math.abs(a[0] - body.u0) < t && Math.abs(c[0] - body.u0) < t) ||
           (Math.abs(a[0] - body.u1) < t && Math.abs(c[0] - body.u1) < t) ||
           (Math.abs(a[1] - body.v0) < t && Math.abs(c[1] - body.v0) < t) ||
           (Math.abs(a[1] - body.v1) < t && Math.abs(c[1] - body.v1) < t);
  };
  const cutSegs = [];
  for (const poly of polys) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const clip = _v25ClipSegRect(poly[j][0], poly[j][1], poly[i][0], poly[i][1], body);
      if (clip && !onBoundary(clip[0], clip[1])) cutSegs.push(clip);
    }
  }
  return { bodySegs: bodySegs, cutSegs: cutSegs };
}
// Everything the GLT renderer needs for one entity, in its current local frame.
function v25NotchCutsFor(ent) {
  if (!ent || ent.type !== 'mem2' || ent.memberType !== 'glt'
      || !Array.isArray(ent.notches) || !ent.notches.length) return null;
  const body = v25NotchBodyRect(ent);
  const exclude = [], voids = [], edgePolys = [];
  for (const n of ent.notches) {
    const s = _v25NotchShape(n); if (!s) continue;
    exclude.push(s);
    if (s.kind === 'edge') { if (s.poly) edgePolys.push(s.poly); }
    else voids.push(s);
  }
  if (!exclude.length) return null;
  let outline = null;
  if (edgePolys.length) outline = v25NotchEdgeOutline(body, edgePolys);
  return {
    exclude: exclude, voids: voids, edgePolys: edgePolys, hasEdge: edgePolys.length > 0,
    bodySegs: outline ? outline.bodySegs : null, cutSegs: outline ? outline.cutSegs : null, body: body,
  };
}
function v25NotchHasEdge(ent) {
  if (!ent || !Array.isArray(ent.notches)) return false;
  return ent.notches.some(function (n) { return n && n.kind === 'edge'; });
}

// ---- Render: voids (white-space holes) — called from drawMem2D --------------
function v25NotchDrawVoids(ent, project, cs, pm, outlineCol, voidShapes) {
  if (!voidShapes || !voidShapes.length) return;
  const paper = (cs && cs.getPropertyValue('--sheet-bg').trim())
    || (cs && cs.getPropertyValue('--paper').trim()) || '#ffffff';
  const lw = Math.max(0.5, (typeof LW === 'object' ? LW.VIS : 0.35) * pm);
  for (const s of voidShapes) {
    ctx.save(); ctx.setLineDash([]);
    if (s.k === 'c') {
      const cpt = project(s.cx, s.cy), rad = Math.max(0.5, s.r * pm);
      ctx.beginPath(); ctx.arc(cpt.x, cpt.y, rad, 0, Math.PI * 2);
      ctx.fillStyle = paper; ctx.fill();
      ctx.strokeStyle = outlineCol; ctx.lineWidth = lw; ctx.stroke();
    } else {
      const poly = s.poly || s.pts;
      ctx.beginPath();
      poly.forEach(function (p, i) { const q = project(p[0], p[1]); if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y); });
      ctx.closePath();
      ctx.fillStyle = paper; ctx.fill();
      ctx.strokeStyle = outlineCol; ctx.lineWidth = lw; ctx.stroke();
    }
    ctx.restore();
  }
}
// Stroke the segment-clipped edge-notch outline (bodySegs + cutSegs), in local.
function v25NotchDrawEdgeOutline(cuts, project, lwPx, col) {
  if (!cuts || !cuts.hasEdge) return;
  ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = lwPx; ctx.setLineDash([]);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const stroke = function (segs) {
    if (!segs) return;
    for (const sg of segs) { const a = project(sg[0][0], sg[0][1]), b = project(sg[1][0], sg[1][1]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  };
  stroke(cuts.bodySegs); stroke(cuts.cutSegs);
  ctx.restore();
}

// ---- Chalk linework ---------------------------------------------------------
function _v25ChalkRnd(seed) { let s = (seed >>> 0) || 1; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
// Hand-drawn black-chalk segment between screen points. Seeded so committed
// marks don't shimmer between frames. Overlay-only (never exported), so liberal.
function _v25ChalkStroke(x1, y1, x2, y2, seed, opts) {
  opts = opts || {};
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
  if (len < 0.5) return;
  const nx = -dy / len, ny = dx / len;          // unit perpendicular
  const seg = Math.max(2, Math.floor(len / 7));
  const amp = (opts.amp != null) ? opts.amp : 1.4;
  const passes = opts.passes || 2;
  const col = opts.color || NOTCH_CHALK_COL;
  const baseA = (opts.alpha != null) ? opts.alpha : 0.85;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.setLineDash([]);
  for (let pass = 0; pass < passes; pass++) {
    const rnd = _v25ChalkRnd(seed + pass * 911);
    ctx.beginPath();
    ctx.strokeStyle = col;
    ctx.globalAlpha = baseA * (pass === 0 ? 1 : 0.45);
    ctx.lineWidth = (opts.lw || 2.2) * (pass === 0 ? 1 : 0.7);
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      const j = (rnd() - 0.5) * 2 * amp * Math.sin(Math.PI * t) + (pass ? (rnd() - 0.5) * amp : 0);
      const px = x1 + dx * t + nx * j, py = y1 + dy * t + ny * j;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  if (opts.speckle !== false) {
    const rnd = _v25ChalkRnd(seed + 555);
    ctx.globalAlpha = baseA * 0.5; ctx.fillStyle = col;
    const sp = Math.max(2, Math.floor(len / 20));
    for (let i = 0; i < sp; i++) { const t = rnd(), j = (rnd() - 0.5) * 2 * amp * 1.4; const px = x1 + dx * t + nx * j, py = y1 + dy * t + ny * j; ctx.beginPath(); ctx.arc(px, py, rnd() * 0.8 + 0.3, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
}

// ---- Context menu item (concatenated by 72f showContextMenu) ----------------
function v25NotchMenuItems() {
  if (typeof sheetMode !== 'undefined' && sheetMode !== '2d') return [];
  if (typeof v25Selected === 'undefined' || !Array.isArray(v25Selected) || v25Selected.length !== 1) return [];
  if (Array.isArray(window.v25SelPlateIds) && window.v25SelPlateIds.length) return [];
  const ent = v25NotchFindEnt(v25Selected[0]);
  if (!ent || ent.type !== 'mem2' || ent.memberType !== 'glt') return [];
  const id = ent.id;
  const items = [{ label: 'Notch…  (mark & cut)', fn: function () { v25EnterNotchMode(id); } }];
  if (Array.isArray(ent.notches) && ent.notches.length) {
    items.push({ label: 'Clear notches (' + ent.notches.length + ')', fn: function () { v25NotchClearAll(id); } });
  }
  return items;
}

// ---- Mode enter / exit ------------------------------------------------------
function v25EnterNotchMode(id) {
  const ent = v25NotchFindEnt(id);
  if (!ent) return;
  if (typeof v25SetTool === 'function') v25SetTool('v25-notch'); // resets v25State
  v25Selected = [id];
  v25State.notch = { id: id, view: v25NotchViewOf(id), aspect: ent.aspect || 'elev',
    stage: 'idle', pts: [], cur: null, dimInput: '', dialog: null };
  v25NotchSetCursor();
  if (typeof setStatus === 'function') {
    setStatus('Notch — mark the shape to cut: click each corner (Shift = 45° · type a length · click the first dot to close).  ' +
      'Double-click / Enter = saw it off · double-click empty = sized void · Esc = done');
  }
  if (typeof requestRender === 'function') requestRender();
}
function v25NotchExit() {
  v25NotchCloseDialog();
  if (typeof v25State === 'object' && v25State) v25State.notch = null;
  if (typeof v25SetTool === 'function') v25SetTool('select');
  if (typeof requestRender === 'function') requestRender();
}
function v25NotchSetCursor() {
  if (typeof canvas === 'object' && canvas) canvas.style.cursor = NOTCH_CHALK_CURSOR;
}
function v25NotchClearAll(id) {
  const ent = v25NotchFindEnt(id);
  if (!ent || !Array.isArray(ent.notches) || !ent.notches.length) return;
  v25NotchPushUndo(ent, function () { ent.notches = []; });
  if (typeof requestRender === 'function') requestRender();
  if (typeof setStatus === 'function') setStatus('Notches cleared');
}

// ---- Cursor snapping + node projection --------------------------------------
// Snap the raw cursor to: ortho/45° from the last node (Shift), else node-snap +
// edge-snap. Nodes are NOT clamped to the body, so a cut can extend past an edge
// for a clean angled corner. Returns LOCAL {lu,lv}.
function v25NotchSnapCursor(blk, px, py, ns) {
  const ent = v25NotchActiveEnt(); if (!ent) return { lu: 0, lv: 0 };
  const w = px2real(blk, px, py); const loc = v25NotchWorldToLocal(ent, w.u, w.v);
  let lu = loc.lu, lv = loc.lv;
  const body = v25NotchBodyRect(ent);
  const pm = (typeof ppm === 'function') ? ppm() : 1;
  const tol = NOTCH_EDGE_SNAP_PX / Math.max(pm, 1e-4);
  const last = (ns.pts && ns.pts.length) ? ns.pts[ns.pts.length - 1] : null;
  if ((typeof shiftHeld !== 'undefined' && shiftHeld) && last) {
    const o = v25NotchOrtho(last[0], last[1], lu, lv); lu = o.lu; lv = o.lv;
  } else {
    // Node snap — but NOT to the most-recently-placed node (the segment's own
    // start), so the rubber-band never glues to its origin reading length 0.
    if (ns.pts) { for (let pi = 0; pi < ns.pts.length - 1; pi++) { const p = ns.pts[pi]; if (Math.abs(lu - p[0]) < tol && Math.abs(lv - p[1]) < tol) { lu = p[0]; lv = p[1]; break; } } }
    if (Math.abs(lu - body.u0) < tol) lu = body.u0; else if (Math.abs(lu - body.u1) < tol) lu = body.u1;
    if (Math.abs(lv - body.v0) < tol) lv = body.v0; else if (Math.abs(lv - body.v1) < tol) lv = body.v1;
  }
  return { lu: lu, lv: lv };
}
// Where the next node lands: cursor, or (with dim-input) the typed distance along
// the last→cursor direction.
function v25NotchNextNode(ns) {
  const cur = ns.cur; if (!cur) return null;
  if (ns.dimInput && ns.pts && ns.pts.length >= 1) {
    const last = ns.pts[ns.pts.length - 1];
    const dx = cur.lu - last[0], dy = cur.lv - last[1], L = Math.hypot(dx, dy), d = parseFloat(ns.dimInput);
    if (L > 1e-6 && d > 0) return { lu: last[0] + dx / L * d, lv: last[1] + dy / L * d };
  }
  return { lu: cur.lu, lv: cur.lv };
}

// ---- Mouse / keyboard handlers (called from 39-events.js / 42-keyboard.js) --
function v25NotchDown(blk, px, py, e) {
  const ns = v25State && v25State.notch; if (!ns || !blk) return;
  // Ignore the 2nd+ mousedown of a double-click (commit gesture) so it never
  // injects a phantom node — the dblclick handler does the commit/close.
  if (e && e.detail >= 2) return;
  const ent = v25NotchActiveEnt(); if (!ent) return;
  ns.cur = v25NotchSnapCursor(blk, px, py, ns);
  const next = v25NotchNextNode(ns);
  ns.dimInput = '';
  if (ns.stage !== 'trace') { ns.stage = 'trace'; ns.pts = []; }
  if (ns.pts.length >= 3) {
    const f = ns.pts[0], pm = (typeof ppm === 'function') ? ppm() : 1, tol = NOTCH_CLOSE_PX / Math.max(pm, 1e-4);
    if (Math.hypot(next.lu - f[0], next.lv - f[1]) < tol) {
      v25NotchCommitPoly(ent, ns.pts); ns.stage = 'idle'; ns.pts = []; ns.cur = null;
      ns.lastClose = _notchNow();      // suppress the dblclick that follows this close
      if (typeof requestRender === 'function') requestRender(); return;
    }
  }
  ns.pts.push([next.lu, next.lv]); ns.cur = { lu: next.lu, lv: next.lv };
  if (typeof requestRender === 'function') requestRender();
}
function v25NotchMove(blk, px, py, e) {
  const ns = v25State && v25State.notch; if (!ns || !blk) return;
  v25NotchSetCursor();
  ns.cur = v25NotchSnapCursor(blk, px, py, ns);
  if (typeof requestRender === 'function') requestRender();
}
function v25NotchDblClick(blk, px, py, e) {
  const ns = v25State && v25State.notch; if (!ns || !blk) return;
  const ent = v25NotchActiveEnt(); if (!ent) return;
  // If this dblclick is the same gesture that just CLOSED a polygon on the first
  // node, swallow it (don't pop the sized-void dialog right after the saw-off).
  if (ns.lastClose && (_notchNow() - ns.lastClose) < 400) {
    ns.lastClose = 0; ns.stage = 'idle'; ns.pts = []; ns.dimInput = '';
    if (typeof requestRender === 'function') requestRender(); return;
  }
  // Commit the mark: an edge-to-edge cut auto-closes along the member boundary
  // (no need to trace back); 2 nodes are enough for a straight end cut.
  if (ns.pts && ns.pts.length >= 2 && v25NotchCommitOpen(ent, ns.pts)) {
    ns.stage = 'idle'; ns.pts = []; ns.cur = null; ns.dimInput = '';
    if (typeof requestRender === 'function') requestRender(); return;
  }
  // double-click on (near) empty → sized-void dialog at the point.
  ns.stage = 'idle'; ns.pts = []; ns.dimInput = '';
  const w = px2real(blk, px, py); const loc = v25NotchWorldToLocal(ent, w.u, w.v);
  v25NotchOpenDialog(blk, ent, { lu: loc.lu, lv: loc.lv }, px, py);
}
function v25NotchFinish() {           // Enter
  const ns = v25State && v25State.notch; if (!ns) return;
  const ent = v25NotchActiveEnt(); if (!ent) return;
  if (ns.dimInput && ns.pts && ns.pts.length >= 1 && ns.cur) {
    const next = v25NotchNextNode(ns);
    if (next) { ns.pts.push([next.lu, next.lv]); ns.cur = { lu: next.lu, lv: next.lv }; }
    ns.dimInput = ''; if (typeof requestRender === 'function') requestRender(); return;
  }
  if (ns.pts && ns.pts.length >= 2 && v25NotchCommitOpen(ent, ns.pts)) {
    ns.stage = 'idle'; ns.pts = []; ns.cur = null;
  }
  ns.dimInput = '';   // Enter on an empty/short trace is a clean no-op
  if (typeof requestRender === 'function') requestRender();
}
// Digit / decimal / Backspace while marking (direct-distance-entry).
function v25NotchType(key) {
  const ns = v25State && v25State.notch; if (!ns) return;
  if (ns.dimInput == null) ns.dimInput = '';
  if (key === 'Backspace') ns.dimInput = ns.dimInput.slice(0, -1);
  else if (key === '.') { if (!ns.dimInput.includes('.')) ns.dimInput += '.'; }
  else if (/^[0-9]$/.test(key)) ns.dimInput += key;
  if (typeof requestRender === 'function') requestRender();
}
// Cancel just the in-progress mark / dialog / dim-input, staying armed.
function v25NotchCancelTrace() {
  const ns = v25State && v25State.notch; if (!ns) return false;
  if (ns.dialog) { v25NotchCloseDialog(); return true; }
  if (ns.dimInput) { ns.dimInput = ''; if (typeof requestRender === 'function') requestRender(); return true; }
  if (ns.stage === 'trace') { ns.stage = 'idle'; ns.pts = []; ns.cur = null; if (typeof requestRender === 'function') requestRender(); return true; }
  return false;
}
function v25NotchCancel() {           // Esc — cancel the mark, or exit if idle
  if (v25NotchCancelTrace()) return;
  v25NotchExit();
}

// ---- Commit cuts ------------------------------------------------------------
function v25NotchPushUndo(ent, mutate) {
  const view = v25NotchViewOf(ent.id);
  const beforeEnt = JSON.parse(JSON.stringify(ent));
  if (!Array.isArray(beforeEnt.notches)) beforeEnt.notches = [];
  mutate();
  if (!Array.isArray(ent.notches)) ent.notches = [];
  const afterEnt = JSON.parse(JSON.stringify(ent));
  if (typeof undoStack !== 'undefined' && Array.isArray(undoStack)) {
    undoStack.push({ act: 'v25Move', view: view,
      before: { ents: [beforeEnt], plates: [] }, after: { ents: [afterEnt], plates: [] } });
    if (undoStack.length > 100) undoStack.shift();
    if (typeof redoStack !== 'undefined' && Array.isArray(redoStack)) redoStack.length = 0;
  }
  if (typeof workspaceTouchActive === 'function') workspaceTouchActive();
}
// A cut is an EDGE notch only if it actually OPENS onto the boundary — i.e. a
// vertex pokes outside the body, OR two consecutive vertices lie on the same
// body edge (a real mouth of non-zero length). A polygon that merely grazes the
// boundary at a single tangent vertex stays an interior VOID (so it keeps its
// clean paper fill and the member keeps its mitre/break end caps).
function v25NotchClassifyPoly(pts, body) {
  const e = 0.5;
  for (const p of pts) {
    if (p[0] < body.u0 - e || p[0] > body.u1 + e || p[1] < body.v0 - e || p[1] > body.v1 + e) return 'edge';
  }
  const onU0 = function (p) { return Math.abs(p[0] - body.u0) <= e; };
  const onU1 = function (p) { return Math.abs(p[0] - body.u1) <= e; };
  const onV0 = function (p) { return Math.abs(p[1] - body.v0) <= e; };
  const onV1 = function (p) { return Math.abs(p[1] - body.v1) <= e; };
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[j], b = pts[i];
    if ((onU0(a) && onU0(b)) || (onU1(a) && onU1(b)) || (onV0(a) && onV0(b)) || (onV1(a) && onV1(b))) return 'edge';
  }
  return 'void';
}
function v25NotchCommitPoly(ent, ptsIn) {
  // Drop consecutive duplicates + a closing duplicate.
  const pts = [];
  for (const p of ptsIn) { const q = pts[pts.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-3) pts.push([p[0], p[1]]); }
  if (pts.length >= 2) { const f = pts[0], l = pts[pts.length - 1]; if (Math.hypot(f[0] - l[0], f[1] - l[1]) <= 1e-3) pts.pop(); }
  if (pts.length < 3) return;
  const body = v25NotchBodyRect(ent);
  const kind = v25NotchClassifyPoly(pts, body);
  const rec = { shape: 'poly', kind: kind, pts: pts.map(function (p) { return [p[0], p[1]]; }) };
  v25NotchPushUndo(ent, function () { if (!Array.isArray(ent.notches)) ent.notches = []; ent.notches.push(rec); });
  if (typeof invalidateWeldCache === 'function') invalidateWeldCache();
  if (typeof requestRender === 'function') requestRender();
  v25NotchStartFlash(ent, rec);
  if (typeof setStatus === 'function') setStatus(kind === 'edge' ? 'Sawn off — keep marking, or Esc to finish' : 'Void cut');
}

// ---- Open edge-to-edge cut: auto-close along the member boundary -------------
// Perimeter parameter (0..P, CCW from the bottom-left corner) of a LOCAL point
// lying on the body boundary; null if it isn't on the boundary.
function _v25PerimParam(p, body) {
  const e = 1.0, w = body.u1 - body.u0, h = body.v1 - body.v0;
  if (Math.abs(p[1] - body.v0) < e && p[0] >= body.u0 - e && p[0] <= body.u1 + e) return Math.max(0, p[0] - body.u0);                 // bottom →
  if (Math.abs(p[0] - body.u1) < e && p[1] >= body.v0 - e && p[1] <= body.v1 + e) return w + Math.max(0, p[1] - body.v0);             // right ↑
  if (Math.abs(p[1] - body.v1) < e && p[0] >= body.u0 - e && p[0] <= body.u1 + e) return w + h + Math.max(0, body.u1 - p[0]);         // top ←
  if (Math.abs(p[0] - body.u0) < e && p[1] >= body.v0 - e && p[1] <= body.v1 + e) return 2 * w + h + Math.max(0, body.v1 - p[1]);     // left ↓
  return null;
}
// Corner points strictly between perimeter params pL→pF, walking CCW (ccw=true)
// or CW. corners = [{p,pt}], P = total perimeter.
function _v25ArcCorners(pL, pF, corners, P, ccw) {
  const span = ccw ? ((pF - pL + P) % P) : ((pL - pF + P) % P);
  const items = [];
  for (const c of corners) {
    const d = ccw ? ((c.p - pL + P) % P) : ((pL - c.p + P) % P);
    if (d > 1e-6 && d < span - 1e-6) items.push({ d: d, pt: c.pt });
  }
  items.sort(function (a, b) { return a.d - b.d; });
  return items.map(function (it) { return it.pt; });
}
function _v25PolyArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  return Math.abs(a / 2);
}
// If the open mark's first AND last node both sit on the member boundary, close
// it along the boundary (around the corner / end being removed) — the user never
// has to trace back along the edge. Picks the smaller-area side (the off-cut, not
// the bulk). Returns the closed LOCAL polygon, or null if not boundary-to-boundary.
function v25NotchBoundaryClose(pts, body) {
  if (!pts || pts.length < 2) return null;
  const fp = _v25PerimParam(pts[0], body);
  const lp = _v25PerimParam(pts[pts.length - 1], body);
  if (fp == null || lp == null) return null;
  const w = body.u1 - body.u0, h = body.v1 - body.v0, P = 2 * (w + h);
  const corners = [
    { p: 0, pt: [body.u0, body.v0] }, { p: w, pt: [body.u1, body.v0] },
    { p: w + h, pt: [body.u1, body.v1] }, { p: 2 * w + h, pt: [body.u0, body.v1] },
  ];
  const polyCCW = pts.concat(_v25ArcCorners(lp, fp, corners, P, true));
  const polyCW = pts.concat(_v25ArcCorners(lp, fp, corners, P, false));
  const closed = _v25PolyArea(polyCCW) <= _v25PolyArea(polyCW) ? polyCCW : polyCW;
  return closed.length >= 3 ? closed : null;
}

// Commit an OPEN mark (Enter / double-click). If it runs edge-to-edge, auto-close
// along the boundary and saw off that piece; otherwise fall back to a straight
// closed polygon (≥3 nodes). Returns true if it committed.
function v25NotchCommitOpen(ent, ptsIn) {
  const pts = [];
  for (const p of ptsIn) { const q = pts[pts.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-3) pts.push([p[0], p[1]]); }
  if (pts.length >= 2) { const f = pts[0], l = pts[pts.length - 1]; if (Math.hypot(f[0] - l[0], f[1] - l[1]) <= 1e-3) pts.pop(); }
  if (pts.length < 2) return false;
  const body = v25NotchBodyRect(ent);
  const closed = v25NotchBoundaryClose(pts, body);
  if (closed) {
    const rec = { shape: 'poly', kind: 'edge', pts: closed.map(function (p) { return [p[0], p[1]]; }) };
    v25NotchPushUndo(ent, function () { if (!Array.isArray(ent.notches)) ent.notches = []; ent.notches.push(rec); });
    if (typeof invalidateWeldCache === 'function') invalidateWeldCache();
    if (typeof requestRender === 'function') requestRender();
    v25NotchStartFlash(ent, rec);
    if (typeof setStatus === 'function') setStatus('Sawn off — keep marking, or Esc to finish');
    return true;
  }
  if (pts.length >= 3) { v25NotchCommitPoly(ent, pts); return true; }
  return false;
}
function v25NotchCommitVoid(ent, centre, shape, w, h) {
  const body = v25NotchBodyRect(ent);
  let rec;
  if (shape === 'circle') {
    rec = { shape: 'circle', kind: 'void', lu: centre.lu, lv: centre.lv, r: Math.abs(w) / 2 };
  } else {
    const ww = Math.abs(w), hh = Math.abs(shape === 'square' ? w : h);
    let u0 = centre.lu - ww / 2, v0 = centre.lv - hh / 2, u1 = u0 + ww, v1 = v0 + hh;
    const touches = (u0 < body.u0 - 1e-6) || (u1 > body.u1 + 1e-6) || (v0 < body.v0 - 1e-6) || (v1 > body.v1 + 1e-6);
    if (touches) {
      u0 = Math.max(body.u0, u0); u1 = Math.min(body.u1, u1); v0 = Math.max(body.v0, v0); v1 = Math.min(body.v1, v1);
      rec = { shape: 'rect', kind: 'edge', lu: u0, lv: v0, w: u1 - u0, h: v1 - v0 };
    } else {
      rec = { shape: 'rect', kind: 'void', lu: u0, lv: v0, w: ww, h: hh };
    }
  }
  if ((rec.shape === 'circle' && !(rec.r > 1e-3)) || (rec.shape === 'rect' && !(rec.w > 1e-3 && rec.h > 1e-3))) return;
  v25NotchPushUndo(ent, function () { if (!Array.isArray(ent.notches)) ent.notches = []; ent.notches.push(rec); });
  if (typeof invalidateWeldCache === 'function') invalidateWeldCache();
  if (typeof requestRender === 'function') requestRender();
  v25NotchStartFlash(ent, rec);
  if (typeof setStatus === 'function') setStatus(rec.shape === 'circle' ? ('Ø' + Math.round(rec.r * 2) + ' void') : (Math.round(rec.w) + ' × ' + Math.round(rec.h) + ' void'));
}

// ---- Saw-off commit animation (rAF pump, mirrors group/snapshot flash) ------
function v25NotchStartFlash(ent, rec) {
  _notchFlash = { id: ent.id, rec: rec, t0: _notchNow(), dur: 480 };
  if (typeof requestRender === 'function') requestRender();
}
function v25NotchDrawFlash(blk, cs) {
  if (!_notchFlash) return;
  const ent = v25NotchFindEnt(_notchFlash.id); if (!ent) { _notchFlash = null; return; }
  const t = (_notchNow() - _notchFlash.t0) / _notchFlash.dur;
  if (t >= 1) { _notchFlash = null; if (typeof requestRender === 'function') requestRender(); return; }
  const ease = 1 - Math.pow(1 - t, 3);
  const drop = 30 * ease;                 // the piece falls
  const fade = 1 - ease;
  const pm = (typeof ppm === 'function') ? ppm() : 1;
  const r = v25NotchRot(ent), c = Math.cos(r), s = Math.sin(r);
  const proj = function (lu, lv) { const wu = ent.u + lu * c - lv * s, wv = ent.v + lu * s + lv * c; const p = real2px(blk, wu, wv); return { x: p.x, y: p.y + drop }; };
  const body = v25NotchBodyRect(ent);
  const sh = _v25NotchShape(_notchFlash.rec);
  const polys = [], circles = [];
  if (sh) {
    if (sh.k === 'c') circles.push({ cx: sh.cx, cy: sh.cy, r: sh.r });
    else { let poly = sh.poly || sh.pts; if (sh.kind === 'edge') { const cl = _v25ClipPolyRect(poly, body); if (cl && cl.length >= 3) poly = cl; } polys.push(poly); }
  }
  const ca = function (col, a) { return (typeof colorAlpha === 'function') ? colorAlpha(col, a) : col; };
  const paint = function (fillStyle, alpha, strokeStyle) {
    ctx.globalAlpha = alpha;
    polys.forEach(function (poly) {
      ctx.beginPath(); poly.forEach(function (p, i) { const q = proj(p[0], p[1]); if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y); }); ctx.closePath();
      if (fillStyle) { ctx.fillStyle = fillStyle; ctx.fill(); }
      if (strokeStyle) { ctx.strokeStyle = strokeStyle; ctx.lineWidth = 1.6; ctx.stroke(); }
    });
    circles.forEach(function (cc) {
      const q = proj(cc.cx, cc.cy), rad = Math.max(1, cc.r * pm);
      ctx.beginPath(); ctx.arc(q.x, q.y, rad, 0, Math.PI * 2);
      if (fillStyle) { ctx.fillStyle = fillStyle; ctx.fill(); }
      if (strokeStyle) { ctx.strokeStyle = strokeStyle; ctx.lineWidth = 1.6; ctx.stroke(); }
    });
  };
  ctx.save(); ctx.setLineDash([]);
  paint(ca('#c9a36a', 0.55 * fade), 0.55 * fade, ca(NOTCH_CHALK_COL, 0.7 * fade));   // the falling timber piece
  const flashA = t < 0.35 ? (1 - t / 0.35) : 0;                                       // bright saw flash
  if (flashA > 0) paint(ca('#ffffff', 0.72 * flashA), 0.72 * flashA, null);
  ctx.restore();
  if (typeof requestRender === 'function') requestRender();
}

// ---- Sized-void dialog (Square / Rectangle / Circle) ------------------------
function v25NotchCloseDialog() {
  const ns = v25State && v25State.notch;
  if (ns && ns.dialog && ns.dialog.parentNode) ns.dialog.parentNode.removeChild(ns.dialog);
  if (ns) ns.dialog = null;
}
function v25NotchOpenDialog(blk, ent, localPt, px, py) {
  v25NotchCloseDialog();
  const ns = v25State && v25State.notch; if (!ns) return;
  const rect = canvas.getBoundingClientRect();
  const wrap = document.createElement('div');
  wrap.className = 'v25-ctx-menu v25-notch-dialog';
  wrap.style.cssText = 'position:fixed;z-index:10000;background:var(--surface-2,#f5f0e6);' +
    'color:var(--text,#2a241f);border:1px solid var(--sheet-border,#b8ac8e);border-radius:8px;' +
    'box-shadow:0 6px 22px rgba(0,0,0,.38);padding:10px;min-width:208px;font:13px system-ui;' +
    'left:' + (rect.left + px + 8) + 'px;top:' + (rect.top + py + 8) + 'px;';
  wrap.addEventListener('mousedown', function (ev) { ev.stopPropagation(); });

  const title = document.createElement('div');
  title.textContent = 'Cut a void';
  title.style.cssText = 'font-weight:600;margin:0 2px 8px;color:var(--text,#2a241f);';
  wrap.appendChild(title);

  const seg = document.createElement('div');
  seg.style.cssText = 'display:flex;gap:4px;margin-bottom:8px;';
  const fieldRow = document.createElement('div');
  fieldRow.style.cssText = 'display:flex;gap:6px;align-items:center;';
  wrap.appendChild(seg); wrap.appendChild(fieldRow);

  let mode = 'square';
  const mkBtn = function (key, label) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = label;
    b.style.cssText = 'flex:1;padding:6px 4px;border-radius:5px;border:1px solid var(--sheet-border,#b8ac8e);' +
      'background:var(--surface,#efe7d5);color:var(--text,#2a241f);cursor:pointer;font:12px system-ui;';
    b.addEventListener('click', function () { mode = key; paint(); });
    b._key = key;
    return b;
  };
  const bSq = mkBtn('square', 'Square'), bRe = mkBtn('rect', 'Rectangle'), bCi = mkBtn('circle', 'Circle');
  seg.appendChild(bSq); seg.appendChild(bRe); seg.appendChild(bCi);

  const inA = document.createElement('input'), inB = document.createElement('input');
  [inA, inB].forEach(function (el) {
    el.type = 'number'; el.min = '1'; el.step = '5';
    el.style.cssText = 'width:64px;padding:5px 6px;border-radius:5px;border:1px solid var(--sheet-border,#b8ac8e);' +
      'background:var(--inputBg,#fff);color:var(--text,#2a241f);font:13px system-ui;';
  });
  inA.placeholder = '200';
  const lblA = document.createElement('span'), lblB = document.createElement('span');
  [lblA, lblB].forEach(function (s) { s.style.cssText = 'color:var(--text-mute,#6e665a);font-size:12px;'; });
  const okHint = document.createElement('span');
  okHint.textContent = '↵';
  okHint.style.cssText = 'margin-left:auto;color:var(--text-mute,#6e665a);font-size:12px;';

  function paint() {
    [bSq, bRe, bCi].forEach(function (b) {
      const on = b._key === mode;
      b.style.background = on ? 'var(--accent,#3a6ea5)' : 'var(--surface,#efe7d5)';
      b.style.color = on ? 'var(--accent-ink,#fff)' : 'var(--text,#2a241f)';
      b.style.fontWeight = on ? '600' : '400';
    });
    fieldRow.innerHTML = '';
    if (mode === 'rect') {
      lblA.textContent = 'W'; lblB.textContent = '× H';
      fieldRow.appendChild(lblA); fieldRow.appendChild(inA);
      fieldRow.appendChild(lblB); fieldRow.appendChild(inB);
    } else {
      lblA.textContent = (mode === 'circle') ? 'Ø' : 'size';
      fieldRow.appendChild(lblA); fieldRow.appendChild(inA);
    }
    fieldRow.appendChild(okHint);
    inA.focus(); inA.select();
  }
  function commit() {
    const a = parseFloat(inA.value), b = parseFloat(inB.value);
    if (!(a > 0)) { inA.focus(); return; }
    if (mode === 'rect') {
      if (!(b > 0)) { inB.focus(); return; }
      v25NotchCommitVoid(ent, localPt, 'rect', a, b);
    } else if (mode === 'circle') {
      v25NotchCommitVoid(ent, localPt, 'circle', a, 0);
    } else {
      v25NotchCommitVoid(ent, localPt, 'square', a, a);
    }
    v25NotchCloseDialog();
  }
  const onKey = function (ev) {
    if (ev.key === 'Enter') { ev.preventDefault(); if (mode === 'rect' && document.activeElement === inA && !(parseFloat(inB.value) > 0)) { inB.focus(); return; } commit(); }
    else if (ev.key === 'Escape') { ev.preventDefault(); v25NotchCloseDialog(); }
  };
  inA.addEventListener('keydown', onKey);
  inB.addEventListener('keydown', onKey);
  // Also handle keys when a shape button holds focus (Tab lands there).
  [bSq, bRe, bCi].forEach(function (b) { b.addEventListener('keydown', onKey); });

  document.body.appendChild(wrap);
  ns.dialog = wrap;
  paint();

  setTimeout(function () {
    window.addEventListener('mousedown', function _close(ev) {
      if (ns.dialog && ns.dialog.contains(ev.target)) return;
      // Swallow the dismiss click so it can't fall through to the canvas and
      // seed a stray first node of a new mark.
      ev.stopPropagation(); ev.preventDefault();
      v25NotchCloseDialog();
    }, { once: true, capture: true });
  }, 0);
}

// ---- Live overlay (called from drawClickPreview in 38-crosshair.js) ---------
function v25NotchPreview(blk, cs) {
  const ent = v25NotchActiveEnt(); if (!ent || !blk) return;
  const ns = v25State.notch;
  const pm = (typeof ppm === 'function') ? ppm() : 1;
  const zoom = (typeof viewport === 'object' && viewport.zoom) ? viewport.zoom : 1;
  const r = v25NotchRot(ent), c = Math.cos(r), s = Math.sin(r);
  const project = function (lu, lv) { const wu = ent.u + lu * c - lv * s, wv = ent.v + lu * s + lv * c; return real2px(blk, wu, wv); };
  const glow = (cs && cs.getPropertyValue('--notch-glow').trim()) || NOTCH_GLOW_FALLBACK;
  const ca = function (col, a) { return (typeof colorAlpha === 'function') ? colorAlpha(col, a) : col; };
  const body = v25NotchBodyRect(ent);
  const boxPts = [[body.u0, body.v0], [body.u1, body.v0], [body.u1, body.v1], [body.u0, body.v1]];
  const tracing = ns.stage === 'trace' && ns.pts && ns.pts.length >= 1;

  if (tracing) {
    const next = v25NotchNextNode(ns);
    // 1) warm transparent tint over the whole member.
    ctx.save(); ctx.setLineDash([]); ctx.beginPath();
    boxPts.forEach(function (p, i) { const q = project(p[0], p[1]); if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y); }); ctx.closePath();
    ctx.fillStyle = ca('#c0792e', 0.10); ctx.fill();
    ctx.restore();
    // 2) knock the marked region out to paper (reads "this part goes"). When the
    // mark runs edge-to-edge, close it along the member boundary so the preview
    // shows the exact off-cut piece that Enter/double-click will saw away.
    const openPts = ns.pts.slice(); if (next) openPts.push([next.lu, next.lv]);
    const bClose = (typeof v25NotchBoundaryClose === 'function') ? v25NotchBoundaryClose(openPts, body) : null;
    const poly = bClose || openPts;
    if (poly.length >= 3) {
      const paper = (cs && cs.getPropertyValue('--sheet-bg').trim()) || '#ffffff';
      ctx.save(); ctx.beginPath();
      poly.forEach(function (p, i) { const q = project(p[0], p[1]); if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y); }); ctx.closePath();
      ctx.globalAlpha = 0.55; ctx.fillStyle = paper; ctx.fill(); ctx.restore();
    }
    // 3) committed chalk marks (stable seed) + live rubber-band to the next node.
    for (let i = 0; i < ns.pts.length - 1; i++) {
      const a = project(ns.pts[i][0], ns.pts[i][1]), b = project(ns.pts[i + 1][0], ns.pts[i + 1][1]);
      _v25ChalkStroke(a.x, a.y, b.x, b.y, 1000 + i * 37);
    }
    if (next) {
      const a = project(ns.pts[ns.pts.length - 1][0], ns.pts[ns.pts.length - 1][1]), b = project(next.lu, next.lv);
      _v25ChalkStroke(a.x, a.y, b.x, b.y, 7);
      // segment length / typed-distance label.
      const last = ns.pts[ns.pts.length - 1];
      const segLen = Math.hypot(next.lu - last[0], next.lv - last[1]);
      const mid = project((last[0] + next.lu) / 2, (last[1] + next.lv) / 2);
      const lbl = ns.dimInput ? (ns.dimInput + ' ▌') : String(Math.round(segLen));
      _v25NotchLabel(mid.x, mid.y - 11, lbl, zoom, NOTCH_CHALK_COL);
      // closing ring when hovering the first node.
      if (ns.pts.length >= 3) {
        const f = ns.pts[0], fp = project(f[0], f[1]);
        const dpx = Math.hypot(b.x - fp.x, b.y - fp.y);
        if (dpx < NOTCH_CLOSE_PX + 2) { ctx.save(); ctx.strokeStyle = glow; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(fp.x, fp.y, 7, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
      }
    }
    // 4) node dots.
    ctx.save(); ctx.fillStyle = NOTCH_CHALK_COL;
    ns.pts.forEach(function (p) { const q = project(p[0], p[1]); ctx.beginPath(); ctx.arc(q.x, q.y, 2.2, 0, Math.PI * 2); ctx.fill(); });
    ctx.restore();
  } else {
    // Idle — amber glow on the member + perpendicular distance to all four edges
    // (centring aid for placing a void), plus the chalk dot at the cursor.
    const outline = (typeof v25Mem2WorldOutline === 'function') ? v25Mem2WorldOutline(ent) : null;
    if (outline && outline.length >= 3) {
      ctx.save(); ctx.setLineDash([]); ctx.lineJoin = 'round';
      ctx.beginPath();
      outline.forEach(function (p, i) { const q = real2px(blk, p[0], p[1]); if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y); }); ctx.closePath();
      ctx.strokeStyle = ca(glow, 0.16); ctx.lineWidth = 7; ctx.stroke();
      ctx.strokeStyle = ca(glow, 0.9); ctx.lineWidth = 1.6; ctx.stroke();
      ctx.restore();
    }
    const cur = ns.cur;
    if (cur && cur.lu >= body.u0 - 1e-6 && cur.lu <= body.u1 + 1e-6 && cur.lv >= body.v0 - 1e-6 && cur.lv <= body.v1 + 1e-6) {
      const edges = [
        { to: { lu: body.u0, lv: cur.lv }, d: cur.lu - body.u0 },
        { to: { lu: body.u1, lv: cur.lv }, d: body.u1 - cur.lu },
        { to: { lu: cur.lu, lv: body.v0 }, d: cur.lv - body.v0 },
        { to: { lu: cur.lu, lv: body.v1 }, d: body.v1 - cur.lv },
      ];
      const cp = project(cur.lu, cur.lv);
      ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = ca(glow, 0.7); ctx.lineWidth = 0.9;
      edges.forEach(function (ed) {
        if (ed.d < 0.5) return;
        const tp = project(ed.to.lu, ed.to.lv);
        ctx.beginPath(); ctx.moveTo(cp.x, cp.y); ctx.lineTo(tp.x, tp.y); ctx.stroke();
        _v25NotchLabel((cp.x + tp.x) / 2, (cp.y + tp.y) / 2, String(Math.round(ed.d)), zoom, glow);
      });
      ctx.setLineDash([]); ctx.fillStyle = NOTCH_CHALK_COL;
      ctx.beginPath(); ctx.arc(cp.x, cp.y, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
}
// Small paper-constant dimension pill.
function _v25NotchLabel(x, y, txt, zoom, col) {
  const fs = Math.max(9, 2.4 * zoom);
  ctx.save();
  ctx.font = fs + 'px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(txt).width + 8, h = fs + 5;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.strokeStyle = (typeof colorAlpha === 'function') ? colorAlpha(col, 0.85) : col;
  ctx.lineWidth = 0.8;
  if (typeof ctx.roundRect === 'function') { ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, 3); ctx.fill(); ctx.stroke(); }
  else { ctx.fillRect(x - w / 2, y - h / 2, w, h); ctx.strokeRect(x - w / 2, y - h / 2, w, h); }
  ctx.fillStyle = '#2a241f';
  ctx.fillText(txt, x, y + 0.5);
  ctx.restore();
}

// ---- DXF helpers (45-dxf-export.js) -----------------------------------------
// Edge-cut visible outline as WORLD-coord segments [[ [u,v],[u,v] ],…].
function v25NotchDxfSegments(ent) {
  const cuts = v25NotchCutsFor(ent);
  if (!cuts || !cuts.hasEdge) return null;
  const out = [];
  const push = function (segs) { if (!segs) return; for (const sg of segs) { const a = v25NotchLocalToWorld(ent, sg[0][0], sg[0][1]), b = v25NotchLocalToWorld(ent, sg[1][0], sg[1][1]); out.push([[a.u, a.v], [b.u, b.v]]); } };
  push(cuts.bodySegs); push(cuts.cutSegs);
  return out.length ? out : null;
}
// Interior voids as WORLD-coord shapes for DXF.
function v25NotchDxfShapes(ent) {
  const cuts = v25NotchCutsFor(ent);
  if (!cuts || !cuts.voids.length) return null;
  const out = [];
  for (const s of cuts.voids) {
    if (s.k === 'c') { const w = v25NotchLocalToWorld(ent, s.cx, s.cy); out.push({ type: 'circle', cu: w.u, cv: w.v, r: s.r }); }
    else { const poly = s.poly || s.pts; out.push({ type: 'poly', pts: poly.map(function (p) { const w = v25NotchLocalToWorld(ent, p[0], p[1]); return [w.u, w.v]; }) }); }
  }
  return out.length ? out : null;
}
