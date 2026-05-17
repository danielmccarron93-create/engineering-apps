'use strict';

// V25 — 2D paper-space plate entity (plate2)
// ============================================================
// Two-aspect plate primitive for V25 2D-Studio mode. Mirrors the mem2
// "Aspect" pattern (Elevation vs Cross-section) so the user has one mental
// model for "is this thing shown face-on or edge-on?".
//
//   Elevation  — the broad face of the plate. Free 2D outline (rectangle or
//                polygon). Thickness is metadata (used for weld sizing,
//                "PL X THK" labels) and does NOT appear in the view.
//   Section    — the plate edge-on. Drawn as a thin bar whose THICKNESS in
//                the view IS ent.thk (the actual plate gauge), and whose
//                LENGTH is how far the cleat projects out from its host
//                (set by the drag distance at placement).
//
// Entity shape — { type:'plate2', _v25:true, id, ...
//   aspect:    'elev' | 'sec'
//   shape:     'rect' | 'poly'                (sec is always 'rect')
//   u, v:      origin (mm, view-local)        (elev rect: bottom-left;
//                                              elev poly: first vertex for
//                                              translation reference;
//                                              sec: attachment point on host)
//   w, h:      rect dimensions (elev rect only)
//   pts:       [{u,v}, ...] world coords      (elev poly only)
//   length:    cleat projection out (mm)      (sec only)
//   thk:       plate thickness (mm)           (sec: thickness in view;
//                                              elev: metadata for welds/label)
//   rot:       rotation in degrees            (default 0)
//   hostId:    snapped mem2 id (sec only, optional)
//   showLabel: bool — auto-stamp "PL X THK" leader (default false)
// }
//
// Lives in entities2D[viewKey] alongside mem2 / mat / anchor / etc. Uses the
// V25 selection, marquee, snap, and auto-weld pipelines. Legacy 3D plate
// (objects3D, draw-plate tool) is untouched.

// ---- CATALOGUE ----
// AS 3678 plate stock (subset used for typical Bligh Tanner connection work).
// 10 mm is the minimum — anything thinner doesn't appear in our standard
// details.
const V25_PLATE_THICKNESSES = [10, 12, 16, 20, 25];
const V25_PLATE_DEFAULT_THK = 10;

// Bluebeam-style soft snap radius (CSS pixels) for first-click anchor on a
// host face. Capped to an absolute real-world maximum so picking doesn't go
// wild when the canvas is zoomed way out.
const V25_PLATE_SNAP_PX = 8;
const V25_PLATE_SNAP_MAX_MM = 30;

// Persistent (cross-session) plate state. Patched onto v25Last so it survives
// tool switches — same pattern as anchorSize / blockThk / material.
(function _v25LastPlateInit() {
  if (typeof v25Last !== 'object') return;
  if (v25Last.plateThk == null)   v25Last.plateThk   = V25_PLATE_DEFAULT_THK;
  if (v25Last.plateAspect == null) v25Last.plateAspect = 'elev';
})();

// ---- TOOL ENTRY POINT ----
// Routed from the BB-rail Plate tile (74-v26-bb-rail.js). Aspect is preserved
// across tile clicks via v25Last so the user doesn't have to re-select it
// every time they pick the tool.
function v25SetPlate(aspect) {
  if (typeof v25Last === 'object') {
    if (aspect === 'elev' || aspect === 'sec') v25Last.plateAspect = aspect;
    if (v25Last.plateThk == null) v25Last.plateThk = V25_PLATE_DEFAULT_THK;
  }
  if (typeof v25SetTool === 'function') v25SetTool('v25-plate');
  // v25SetTool resets v25State; re-seed the click-vs-drag fields below.
  if (typeof v25State === 'object') {
    v25State.polyPts     = [];
    v25State.plateDownPx    = null;
    v25State.plateDownWorld = null;
  }
  if (typeof requestRender === 'function') requestRender();
}

// ============================================================
// GEOMETRY HELPERS
// ============================================================

// Returns the four outer edges of a plate2 in (u, v) world coords. Same shape
// as v25Mem2Faces so the auto-weld pipeline can treat them interchangeably.
//   { u1, v1, u2, v2, nu, nv, entId, side }
// `nu, nv` is the outward unit normal. `side` is just a label for debugging.
// For polygon plates we walk the literal polygon edges (N edges, not 4).
function v25Plate2Faces(ent) {
  if (!ent || ent.type !== 'plate2') return [];
  const out = [];
  // Elevation polygon — walk the literal pts[] edges.
  if (ent.aspect === 'elev' && ent.shape === 'poly' && Array.isArray(ent.pts) && ent.pts.length >= 3) {
    const pts = ent.pts;
    // Use signed area to determine winding; outward normal is +90° from the
    // CCW edge direction, -90° from CW. AS-1100-friendly: weld goes on the
    // OUTSIDE of the polygon regardless of click order.
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      area += (p.u * q.v - q.u * p.v);
    }
    const ccw = area > 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const du = b.u - a.u, dv = b.v - a.v;
      const len = Math.hypot(du, dv);
      if (len < 0.5) continue;
      const tu = du / len, tv = dv / len;
      const nu = ccw ?  tv : -tv;
      const nv = ccw ? -tu :  tu;
      out.push({ u1: a.u, v1: a.v, u2: b.u, v2: b.v, nu, nv, entId: ent.id, side: 'edge' + i });
    }
    return out;
  }
  // Elevation rect OR Section cleat — same 4-edge rectangle math, just
  // sized differently.
  let w, h, originU, originV, rot;
  if (ent.aspect === 'sec') {
    // Section cleat: u/v = attachment point on host face; local x = +length
    // direction (projecting out from host); local y = ±thk/2 (perpendicular).
    // Origin is at the centre of the inner (attached) edge — i.e. the rect's
    // local-x range is [0, length] and local-y range is [-thk/2, +thk/2].
    w = ent.length || 0;
    h = ent.thk || V25_PLATE_DEFAULT_THK;
    originU = ent.u;
    originV = ent.v;
    rot = (ent.rot || 0) * Math.PI / 180;
  } else {
    // Elevation rect: u/v = bottom-left corner; local x in [0,w], local y in [0,h].
    w = ent.w || 0;
    h = ent.h || 0;
    originU = ent.u;
    originV = ent.v;
    rot = (ent.rot || 0) * Math.PI / 180;
  }
  if (w < 1 || h < 1) return out;
  const cosR = Math.cos(rot), sinR = Math.sin(rot);
  // Build the 4 local-frame corners — sec uses y-centred span [-h/2, h/2],
  // elev uses y-positive span [0, h]. Resulting world-coord pairs feed face
  // construction in CCW order.
  let ly0, ly1;
  if (ent.aspect === 'sec') { ly0 = -h / 2; ly1 = h / 2; }
  else                      { ly0 = 0;      ly1 = h;     }
  const project = (lx, ly) => ({
    u: originU + lx * cosR - ly * sinR,
    v: originV + lx * sinR + ly * cosR,
  });
  const bl = project(0, ly0);     // bottom-left (inner end for sec)
  const br = project(w, ly0);     // bottom-right (outer end for sec)
  const tr = project(w, ly1);     // top-right
  const tl = project(0, ly1);     // top-left
  // Outward normals — pre-rot they are (0,-1), (1,0), (0,1), (-1,0). Rotate
  // through (cosR, sinR) to land in world frame.
  const rotN = (lx, ly) => ({ nu: lx * cosR - ly * sinR, nv: lx * sinR + ly * cosR });
  const nBot   = rotN(0, -1);
  const nRight = rotN(1, 0);
  const nTop   = rotN(0, 1);
  const nLeft  = rotN(-1, 0);
  out.push({ u1: bl.u, v1: bl.v, u2: br.u, v2: br.v, nu: nBot.nu,   nv: nBot.nv,   entId: ent.id, side: 'bottom' });
  out.push({ u1: br.u, v1: br.v, u2: tr.u, v2: tr.v, nu: nRight.nu, nv: nRight.nv, entId: ent.id, side: 'right'  });
  out.push({ u1: tr.u, v1: tr.v, u2: tl.u, v2: tl.v, nu: nTop.nu,   nv: nTop.nv,   entId: ent.id, side: 'top'    });
  out.push({ u1: tl.u, v1: tl.v, u2: bl.u, v2: bl.v, nu: nLeft.nu,  nv: nLeft.nv,  entId: ent.id, side: 'left'   });
  return out;
}

// AABB bounds in (u, v) for selection / hit-test / marquee. Returns
// {L, R, B, T} with L<R and B<T to match v25EntBounds convention.
function v25Plate2Bounds(ent) {
  if (!ent || ent.type !== 'plate2') return null;
  const faces = v25Plate2Faces(ent);
  if (!faces.length) {
    // Degenerate — return a point bbox at origin so hit-test doesn't blow up.
    return { L: ent.u || 0, R: ent.u || 0, B: ent.v || 0, T: ent.v || 0 };
  }
  let L = Infinity, R = -Infinity, B = Infinity, T = -Infinity;
  for (const f of faces) {
    [[f.u1, f.v1], [f.u2, f.v2]].forEach(([u, v]) => {
      if (u < L) L = u; if (u > R) R = u;
      if (v < B) B = v; if (v > T) T = v;
    });
  }
  return { L, R, B, T };
}

// Centroid of the visible polygon — used as rotation pivot and as the
// "anchor" for body-translate undo. Polygon: averages vertices. Rect: centre.
function v25Plate2Centroid(ent) {
  if (!ent || ent.type !== 'plate2') return { u: 0, v: 0 };
  if (ent.aspect === 'elev' && ent.shape === 'poly' && Array.isArray(ent.pts) && ent.pts.length) {
    let su = 0, sv = 0;
    for (const p of ent.pts) { su += p.u; sv += p.v; }
    return { u: su / ent.pts.length, v: sv / ent.pts.length };
  }
  const b = v25Plate2Bounds(ent);
  if (!b) return { u: ent.u || 0, v: ent.v || 0 };
  return { u: (b.L + b.R) / 2, v: (b.B + b.T) / 2 };
}

// Axis-aligned snap edges in the v25Mem2Edges-compatible shape
// ({axis, value, label}) so v25ApplySnap can soft-snap a moving plate to
// nearby mem2 outer faces during body drag. Only fires for plates whose
// orientation is within ±5° of an axis — rotated plates emit nothing, same
// rule v25Mem2Edges uses for diagonal members.
function v25Plate2EdgesForSnap(ent) {
  const edges = [];
  if (!ent || ent.type !== 'plate2') return edges;
  const b = v25Plate2Bounds(ent);
  if (!b) return edges;
  // Only emit axis-aligned snap edges when the entity is on-axis. Rect/poly
  // elevation plates with rot ≈ 0 always pass; sec cleats pass when their
  // rot is near 0 / 90 / 180 / 270 (so their length+thickness edges align
  // with u and v).
  const rotDeg = ((ent.rot || 0) % 360 + 360) % 360;
  const nearAxis = (Math.abs(rotDeg % 90) < 5) || (Math.abs((rotDeg % 90) - 90) < 5);
  if (!nearAxis) return edges;
  const lbl = 'PLATE edge';
  // Use bbox edges — works for rect, polygon (bbox approximation), and sec.
  // For axis-aligned plates these are the actual visible edges; we already
  // gated on nearAxis above so bbox == real edges.
  edges.push({ axis: 'u', value: b.L, label: lbl });
  edges.push({ axis: 'u', value: b.R, label: lbl });
  edges.push({ axis: 'v', value: b.B, label: lbl });
  edges.push({ axis: 'v', value: b.T, label: lbl });
  return edges;
}

// ============================================================
// HOST-FACE SNAP (first click)
// ============================================================

// Find the closest mem2 outer face (and existing plate2 outer edge) within
// the snap catch zone, return the perpendicular-projected snap point on that
// edge plus enough metadata for Section-mode placement to align the cleat
// frame to the host face.
//
// Returns { u, v, edge, outward, faceAngleRad, hostId } or null. `outward`
// is the unit normal pointing AWAY from the host (the direction a sec-mode
// cleat should project). `faceAngleRad` is the cleat's rot so its inner edge
// lies flat on the host face and its length axis matches `outward`.
function v25Plate2SnapHost(blk, cu, cv) {
  if (!blk) return null;
  const arr = (typeof entities2D === 'object' && entities2D[blk.viewKey]) || [];
  // Convert the pixel-tolerance to real-mm so the catch zone scales with zoom.
  const ppmm = (typeof viewport === 'object' && drawingScale)
    ? (viewport.zoom / drawingScale) : 1;
  const tolMm = Math.min(V25_PLATE_SNAP_MAX_MM, V25_PLATE_SNAP_PX / Math.max(0.0001, ppmm));
  let best = null;
  const consider = (face) => {
    // Perpendicular distance from cursor to the (infinite) line through face.
    const du = face.u2 - face.u1, dv = face.v2 - face.v1;
    const len = Math.hypot(du, dv);
    if (len < 0.5) return;
    const tu = du / len, tv = dv / len;
    // Project cursor onto the line, clamped to the segment.
    let s = ((cu - face.u1) * tu + (cv - face.v1) * tv);
    s = Math.max(0, Math.min(len, s));
    const pu = face.u1 + s * tu, pv = face.v1 + s * tv;
    const d = Math.hypot(cu - pu, cv - pv);
    if (d > tolMm) return;
    if (best && d >= best._dist) return;
    // Outward normal from the face — points AWAY from the host body.
    const nu = face.nu, nv = face.nv;
    // Cleat rotation: length axis = outward normal. atan2(nv, nu) in real-
    // world coords (Y-up); v25 mem2's rot uses the same convention.
    const faceAngleRad = Math.atan2(nv, nu);
    best = {
      u: pu, v: pv,
      outward: { u: nu, v: nv },
      faceAngleRad,
      hostId: face.entId,
      edge: { u1: face.u1, v1: face.v1, u2: face.u2, v2: face.v2 },
      _dist: d,
    };
  };
  // Collect mem2 outer faces (existing helper from 68-v25-tools.js).
  if (typeof v25Mem2Faces === 'function') {
    for (const ent of arr) {
      if (ent && ent.type === 'mem2') {
        v25Mem2Faces(ent).forEach(consider);
      }
    }
  }
  // Collect existing plate2 outer faces so plates can snap to plate edges too.
  for (const ent of arr) {
    if (ent && ent.type === 'plate2') {
      v25Plate2Faces(ent).forEach(consider);
    }
  }
  return best;
}

// ============================================================
// RENDERER
// ============================================================
// Single entry point — dispatch in v25DrawEnt routes here. Handles all three
// flavours (elev rect, elev poly, sec cleat) by collapsing them onto the
// same 4-edge face list from v25Plate2Faces. For elevation, also draws a
// faint diagonal hatch when the entity carries a fillColour so plates read
// distinctly from open polygons.
function drawPlate2D(blk, ent, cs) {
  if (!ent || ent.type !== 'plate2') return;
  const col = (typeof v25EntColour === 'function') ? v25EntColour(ent, cs)
    : cs.getPropertyValue('--entity-color').trim();
  const _opacityWas = ctx.globalAlpha;
  if (typeof v25EntOpacity === 'function') {
    ctx.globalAlpha = _opacityWas * v25EntOpacity(ent);
  }
  try {
    const pm = (typeof ppm === 'function') ? ppm() : 1;
    const cutLW = Math.max(1, LW.CUT * pm);
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.setLineDash([]);
    ctx.lineWidth = cutLW;

    // Build the closed polygon from face endpoints (each face's u1,v1 chains
    // into the next face's u1,v1, giving the loop boundary).
    const faces = v25Plate2Faces(ent);
    if (!faces.length) return;
    ctx.beginPath();
    for (let i = 0; i < faces.length; i++) {
      const f = faces[i];
      const sp = real2px(blk, f.u1, f.v1);
      if (i === 0) ctx.moveTo(sp.x, sp.y);
      else         ctx.lineTo(sp.x, sp.y);
    }
    ctx.closePath();

    // Optional fill (only when fillColour is explicitly set on the entity —
    // standard plates render outline-only per AS 1100 conventions for
    // structural details).
    if (ent.fillColour) {
      ctx.save();
      ctx.fillStyle = ent.fillColour;
      ctx.fill();
      ctx.restore();
    }
    ctx.stroke();

    // Section cleat — stamp the "PL X THK" leader-style label when requested.
    // Anchor at the outer-edge midpoint, leader runs further out along the
    // outward normal of the right-hand (outer) face.
    if (ent.aspect === 'sec' && ent.showLabel) {
      const outer = faces[1] || faces[0]; // 'right' face = outer end of cleat
      if (outer) {
        const midU = (outer.u1 + outer.u2) / 2;
        const midV = (outer.v1 + outer.v2) / 2;
        const labelMm = 40;
        const tipU = midU + outer.nu * labelMm;
        const tipV = midV + outer.nv * labelMm;
        const tipPx = real2px(blk, tipU, tipV);
        const midPx = real2px(blk, midU, midV);
        ctx.save();
        ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.4, LW.DIM * pm);
        ctx.beginPath();
        ctx.moveTo(midPx.x, midPx.y); ctx.lineTo(tipPx.x, tipPx.y);
        ctx.stroke();
        ctx.fillStyle = col;
        ctx.font = `${Math.max(8, 3 * pm)}px system-ui`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = outer.nu >= 0 ? 'left' : 'right';
        ctx.fillText(`PL ${ent.thk || V25_PLATE_DEFAULT_THK} THK`,
          tipPx.x + (outer.nu >= 0 ? 4 : -4), tipPx.y);
        ctx.textAlign = 'start';
        ctx.restore();
      }
    }
  } finally {
    ctx.globalAlpha = _opacityWas;
  }
}

// ============================================================
// HELPERS FOR AUTO-WELD PIPELINE (consumed by 68-v25-tools.js)
// ============================================================

// "Thinner part" thickness for AS 4100 Cl. 9.7.3.10 weld sizing, plate-aware.
// Wraps v25Mem2Thickness — falls through to plate2's ent.thk for plate
// entities, or the standard member lookup for everything else.
function v25EntWeldThickness(ent) {
  if (!ent) return V25_PLATE_DEFAULT_THK;
  if (ent.type === 'plate2') return ent.thk || V25_PLATE_DEFAULT_THK;
  if (typeof v25Mem2Thickness === 'function') return v25Mem2Thickness(ent);
  return V25_PLATE_DEFAULT_THK;
}

// Commit an in-progress elevation polygon plate from v25State.polyPts.
// Called by the dblclick / Enter close handlers and the "near-first-vertex"
// click-close branch in v25TryHandleClick.
function v25PlateCommitPoly() {
  if (typeof v25State !== 'object' || !v25State.polyPts || v25State.polyPts.length < 3) return null;
  const thk = (typeof v25Last === 'object' && v25Last.plateThk)
    ? v25Last.plateThk : V25_PLATE_DEFAULT_THK;
  const first = v25State.polyPts[0];
  const ent = v25Add('plate2', {
    aspect: 'elev', shape: 'poly',
    u: first.u, v: first.v,
    pts: v25State.polyPts.map(p => ({ u: p.u, v: p.v })),
    thk,
  });
  v25State.polyPts = [];
  return ent;
}

// Collect every face the auto-weld pipeline should consider in a given view.
// Returns the same {u1,v1,u2,v2,nu,nv,entId,side,_ent} shape that the
// existing computeV25WeldInterfaces puts together for mem2 — so the pair-
// scan logic doesn't need to know about types, just edges.
function v25CollectWeldFaces(viewKey) {
  const out = [];
  if (!viewKey || typeof entities2D !== 'object') return out;
  const arr = entities2D[viewKey] || [];
  for (const ent of arr) {
    if (!ent) continue;
    if (ent.type === 'mem2' && ent.aspect !== 'sec' && (ent.length || 0) >= 1
        && typeof v25Mem2Faces === 'function') {
      for (const f of v25Mem2Faces(ent)) { f._ent = ent; out.push(f); }
    } else if (ent.type === 'plate2') {
      for (const f of v25Plate2Faces(ent)) { f._ent = ent; out.push(f); }
    }
  }
  return out;
}
