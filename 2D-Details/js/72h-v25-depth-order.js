'use strict';
// ============================================================
// 72h-v25-depth-order.js — V25 2D-mode member depth ordering +
// automatic AS 1100 hidden-line dashing.
//
// Sits in the 72x band of V25 select-mode member operations, alongside
// 72e-stiffener / 72f-grouping / 72g-joint — another right-click member
// action.
//   READS:  entities2D, v2.appState.model.elements, v25Selected,
//           window.v25SelPlateIds, activeBlock, requestRender,
//           v25Mem2WorldOutline (68), v2.engine.autosave (v2).
//   WRITES: ent.z (v1 mem2), el.params.z (v2 plate).
//
// A member can be pushed in front of / behind another overlapping member.
// The span of a BEHIND member's outline that a FRONT member covers is
// rendered as an AS 1100 hidden (dashed) line; the rest stays solid — the
// slow "manually dash the bit that's behind" chore, automated.
//
// Depth is OPT-IN: every member defaults to z = 0 (coplanar), so nothing
// dashes until the user assigns front/back through the right-click menu.
// Two members occlude only when their z DIFFERS (strict >), so members that
// merely abut at a joint (same depth) stay solid.
//
// Three consumers share the two pure-geometry functions here so screen, PDF
// and DXF agree:
//   - v1 mem2 path .......... 68-v25-tools.js  drawMem2D (strokeLine hook)
//   - v2 plate path ......... v2/ui/live-render.js  drawV2PlatesOnCanvas
//   - DXF exporter .......... 45-dxf-export.js  (mem2 + v2-plate emission)
//
// Mirrors the existing 3D-mode occlusion helpers (clipLineAgainstOcclusion /
// isOccluded, 23-auto-weld.js) but for arbitrary polygons; 3D mode already
// produces depth-correct hidden lines from real geometry (15-occlusion.js),
// so this is purely the 2D paper-space counterpart.
// ============================================================

// ---- tunables ----
var V25_DEPTH_SAMPLE_MM = 3;    // segment sampling step (matches the 3D path)
var V25_DEPTH_EPS_MM    = 0.5;  // flush-face tolerance: a behind edge sitting on
                                // a front face is NOT dashed (mirrors isOccluded)

// ---- low-level geometry ----
function _v25dBBox(poly) {
  var minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity;
  for (var i = 0; i < poly.length; i++) {
    var p = poly[i];
    if (p.u < minU) minU = p.u; if (p.u > maxU) maxU = p.u;
    if (p.v < minV) minV = p.v; if (p.v > maxV) maxV = p.v;
  }
  return { minU: minU, minV: minV, maxU: maxU, maxV: maxV };
}
function _v25dBBoxOverlap(a, b) {
  return !(a.maxU < b.minU || b.maxU < a.minU || a.maxV < b.minV || b.maxV < a.minV);
}
function _v25dPointInPoly(u, v, poly) {
  // even-odd ray cast
  var inside = false, n = poly.length;
  for (var i = 0, j = n - 1; i < n; j = i++) {
    var pi = poly[i], pj = poly[j];
    var denom = (pj.v - pi.v) || 1e-12;
    if (((pi.v > v) !== (pj.v > v)) && (u < (pj.u - pi.u) * (v - pi.v) / denom + pi.u)) {
      inside = !inside;
    }
  }
  return inside;
}
function _v25dDistToSeg(u, v, au, av, bu, bv) {
  var dU = bu - au, dV = bv - av, L2 = dU * dU + dV * dV;
  var t = L2 > 0 ? ((u - au) * dU + (v - av) * dV) / L2 : 0;
  t = t < 0 ? 0 : (t > 1 ? 1 : t);
  return Math.hypot(u - (au + t * dU), v - (av + t * dV));
}
function _v25dNearEdge(u, v, poly, eps) {
  for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if (_v25dDistToSeg(u, v, poly[j].u, poly[j].v, poly[i].u, poly[i].v) < eps) return true;
  }
  return false;
}
// A point is occluded when it lies strictly inside any occluder polygon — but
// NOT when it sits on (within eps of) that polygon's boundary, so a behind
// edge that is flush against a front face stays solid (the joint case).
function _v25dPointOccluded(u, v, polys) {
  for (var k = 0; k < polys.length; k++) {
    if (_v25dPointInPoly(u, v, polys[k]) && !_v25dNearEdge(u, v, polys[k], V25_DEPTH_EPS_MM)) return true;
  }
  return false;
}

// ---- the shared clip ----
// Split a world (u,v) segment into solid (visible) / dashed (hidden) sub-
// segments against the occluder polygons. Returns [{u1,v1,u2,v2,occluded}].
// Sampling-based, mirroring clipLineAgainstOcclusion (23-auto-weld.js) but for
// arbitrary polygons rather than axis-aligned rects.
function v25DepthClipWorldSeg(u1, v1, u2, v2, polys) {
  if (!polys || !polys.length) return [{ u1: u1, v1: v1, u2: u2, v2: v2, occluded: false }];
  var du = u2 - u1, dv = v2 - v1, len = Math.hypot(du, dv);
  if (len < 0.01) {
    return [{ u1: u1, v1: v1, u2: u2, v2: v2, occluded: _v25dPointOccluded((u1 + u2) / 2, (v1 + v2) / 2, polys) }];
  }
  var steps = Math.max(2, Math.ceil(len / V25_DEPTH_SAMPLE_MM));
  var segs = [], prev = _v25dPointOccluded(u1, v1, polys), segStart = 0;
  for (var i = 1; i <= steps; i++) {
    var t = i / steps, su = u1 + du * t, sv = v1 + dv * t;
    var occ = _v25dPointOccluded(su, sv, polys);
    if (occ !== prev) {
      var tB = (i - 0.5) / steps;
      segs.push({ u1: u1 + du * segStart, v1: v1 + dv * segStart, u2: u1 + du * tB, v2: v1 + dv * tB, occluded: prev });
      segStart = tB; prev = occ;
    }
    if (i === steps) {
      segs.push({ u1: u1 + du * segStart, v1: v1 + dv * segStart, u2: u2, v2: v2, occluded: prev });
    }
  }
  return segs.length ? segs : [{ u1: u1, v1: v1, u2: u2, v2: v2, occluded: false }];
}

// ---- member enumeration (both systems) ----
// Every depth-participating member in `viewKey`: v1 mem2 entities + v2 plates.
// Returns [{ id, z, poly:[{u,v}…], kind:'v1'|'v2', ref }]. `poly` is the
// occluding silhouette (outer envelope for a mem2, the polygon for a plate).
function _v25DepthMembersInView(viewKey) {
  var out = [];
  if (typeof entities2D === 'object' && entities2D && Array.isArray(entities2D[viewKey]) &&
      typeof v25Mem2WorldOutline === 'function') {
    var arr = entities2D[viewKey];
    for (var i = 0; i < arr.length; i++) {
      var e = arr[i];
      if (!e || e.type !== 'mem2') continue;
      var oc = v25Mem2WorldOutline(e);
      if (!oc || oc.length < 3) continue;
      out.push({
        id: e.id, z: (typeof e.z === 'number' ? e.z : 0), kind: 'v1', ref: e,
        poly: oc.map(function (p) { return { u: p[0], v: p[1] }; }),
      });
    }
  }
  var model = (typeof v2 === 'object' && v2 && v2.appState && v2.appState.model) ? v2.appState.model : null;
  if (model && model.elements && typeof model.elements.forEach === 'function') {
    model.elements.forEach(function (el) {
      if (!el || el.category !== 'plate') return;
      var g = el.geometry;
      if (!g || !Array.isArray(g.polygon) || g.polygon.length < 3) return;
      var m = /^v1-view-(.+)$/.exec(typeof g.viewId === 'string' ? g.viewId : '');
      if (!m || m[1] !== viewKey) return;
      var z = (el.params && typeof el.params.z === 'number') ? el.params.z : 0;
      out.push({
        id: el.id, z: z, kind: 'v2', ref: el,
        poly: g.polygon.map(function (p) { return { u: (+p.x || 0), v: (+p.y || 0) }; }),
      });
    });
  }
  return out;
}

// ---- occluders for one member ----
// Silhouettes of every member in `viewKey` that sits in FRONT (z strictly
// greater) of the caller AND whose bbox overlaps the caller's. Empty when the
// caller is coplanar with / in front of everything → no dashing at all.
function v25DepthOccludersFor(viewKey, selfId, selfZ, selfPoly) {
  if (!selfPoly || selfPoly.length < 2) return [];
  var sBB = _v25dBBox(selfPoly);
  var members = _v25DepthMembersInView(viewKey);
  var polys = [];
  for (var i = 0; i < members.length; i++) {
    var m = members[i];
    if (m.id === selfId) continue;
    if (!(m.z > selfZ)) continue;
    if (!_v25dBBoxOverlap(sBB, _v25dBBox(m.poly))) continue;
    polys.push(m.poly);
  }
  return polys;
}

// ============================================================
// Depth ops + right-click menu — act on the current 2D selection
// (v1 v25Selected ids + v2 window.v25SelPlateIds).
// ============================================================

function _v25DepthSelectedMembers() {
  var res = [];
  var vk = (typeof activeBlock === 'object' && activeBlock) ? activeBlock.viewKey : null;
  if (!vk) return res;
  if (typeof v25Selected !== 'undefined' && Array.isArray(v25Selected) &&
      typeof entities2D === 'object' && Array.isArray(entities2D[vk])) {
    entities2D[vk].forEach(function (e) {
      if (e && e.type === 'mem2' && v25Selected.indexOf(e.id) >= 0) res.push({ kind: 'v1', ref: e, view: vk });
    });
  }
  var sel = (typeof window !== 'undefined' && Array.isArray(window.v25SelPlateIds)) ? window.v25SelPlateIds : [];
  var model = (typeof v2 === 'object' && v2 && v2.appState && v2.appState.model) ? v2.appState.model : null;
  if (sel.length && model && model.elements) {
    sel.forEach(function (id) {
      var el = model.elements.get(id);
      if (el && el.category === 'plate') res.push({ kind: 'v2', ref: el, view: vk });
    });
  }
  return res;
}
function _v25DepthGetZ(m) {
  if (m.kind === 'v1') return (typeof m.ref.z === 'number') ? m.ref.z : 0;
  return (m.ref.params && typeof m.ref.params.z === 'number') ? m.ref.params.z : 0;
}
function _v25DepthSetZ(m, z) {
  if (m.kind === 'v1') { m.ref.z = z; }
  else { if (!m.ref.params) m.ref.params = {}; m.ref.params.z = z; }
}
function _v25DepthAfterChange() {
  if (typeof requestRender === 'function') requestRender();
  // Persist v2 plate depth — the plate model is mutated outside a transaction,
  // so nudge the autosave/dirty flag so the change is captured on save.
  try {
    if (typeof v2 === 'object' && v2 && v2.engine && v2.engine.autosave &&
        typeof v2.engine.autosave.markDirty === 'function') v2.engine.autosave.markDirty();
  } catch (_e) { /* best-effort */ }
}

// op ∈ 'front' | 'back' | 'forward' | 'backward' | 'reset'
function v25DepthApply(op) {
  var sel = _v25DepthSelectedMembers();
  if (!sel.length) return false;
  var all = _v25DepthMembersInView(sel[0].view);
  var zs = all.map(function (m) { return m.z; });
  var gMax = zs.length ? Math.max.apply(null, zs) : 0;
  var gMin = zs.length ? Math.min.apply(null, zs) : 0;
  var changed = false;
  sel.forEach(function (m) {
    var z = _v25DepthGetZ(m);
    if (op === 'front') { _v25DepthSetZ(m, gMax + 1); changed = true; }
    else if (op === 'back') { _v25DepthSetZ(m, gMin - 1); changed = true; }
    else if (op === 'reset') { _v25DepthSetZ(m, 0); changed = true; }
    else if (op === 'forward') {
      var up = all.filter(function (o) { return o.id !== m.ref.id && o.z > z; }).map(function (o) { return o.z; });
      _v25DepthSetZ(m, up.length ? Math.min.apply(null, up) + 1 : gMax + 1); changed = true;
    } else if (op === 'backward') {
      var dn = all.filter(function (o) { return o.id !== m.ref.id && o.z < z; }).map(function (o) { return o.z; });
      _v25DepthSetZ(m, dn.length ? Math.max.apply(null, dn) - 1 : gMin - 1); changed = true;
    }
  });
  if (changed) _v25DepthAfterChange();
  return changed;
}

// Items appended to the right-click context menu (72f-v25-grouping.js). Empty
// when no member/plate is selected.
function v25DepthMenuItems() {
  if (!_v25DepthSelectedMembers().length) return [];
  return [
    { label: 'Bring to Front', fn: function () { v25DepthApply('front'); } },
    { label: 'Bring Forward', fn: function () { v25DepthApply('forward'); } },
    { label: 'Send Backward', fn: function () { v25DepthApply('backward'); } },
    { label: 'Send to Back', fn: function () { v25DepthApply('back'); } },
    { label: 'Reset depth (coplanar)', fn: function () { v25DepthApply('reset'); } },
  ];
}
