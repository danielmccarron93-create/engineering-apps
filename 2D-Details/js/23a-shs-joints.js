'use strict';

// V14-J — Member-to-member joint detection, trim geometry, and per-joint popup.
// Sibling to 23-auto-weld.js: that module draws AS 1101.3 hatch on face-to-face
// contact; this one trims a member's body back at the joint based on the
// detail intent (mitre by default, or butt-to-priority when the user picks
// one member as priority).
//
// 3D side: SHS-to-SHS only (legacy path, unchanged).
// V25 2D side: works on every mem2 type — SHS, RHS, UB, UC, CHS — using the
//   member's bounding-rectangle outline (length × overall depth). The
//   bounding-box treatment is sufficient for elevation cuts because the cut
//   line clips the section's horizontal lines (flange edges, outer faces) at
//   the right x for each y.
//
// V1 LIMITATION — "through" members (a chord passing across a joint mid-span)
// can't be trimmed at the cross because they have no endpoint there. So
// promoting a post above a chord doesn't visually split the chord. For typical
// truss workflows the chord is always the through-member, so this is fine.
//
// Default behaviour at an endpoint-to-endpoint node: MITRE cut on both members
// (bisector of the two centrelines). The user can override per-pair via the
// double-click menu — "Mitre joint" (default) or "Pick member priority", where
// the priority member runs through unchanged and the other member gets butt-
// cut at the priority's outer face envelope.
//
// Architecture mirror of 23-auto-weld:
//   computeShsJoints()        — clusters endpoints into nodes, detects T-junctions
//   jointTrimsForMember(obj)  — returns { ends: { plus, minus } } cut info for drawSHS
//   hitTestJoint(blk, px, py) — find joint near click point
//   showJointPopup(joint, ..) — DOM popup with priority list + mitre toggles
//   invalidateJointCache()    — called from 23-auto-weld's invalidateWeldCache
//   mitrePairs {}             — legacy per-pair mitre flag (kept for save/load
//                               back-compat; the new default makes it a no-op
//                               since equal-priority pairs already mitre)
//   priorityForPairV25 {}     — per-pair priority entity id; absent = mitre,
//                               present = priority cut where the named ent is
//                               the through member.

// ---- Tolerances (real-world mm) ----
const SHS_JOINT_END_TOL = 5;     // endpoint-to-endpoint clustering tolerance
const SHS_JOINT_THROUGH_TOL = 5; // perpendicular distance for T-junction detection

// ---- Per-pair mitre flags ----
// Legacy 3D path: Key = "min(idA,idB)-max(idA,idB)", value = true.
// V25 path:       Key = "v25-min(idA,idB)-max(idA,idB)", value = true.
// Persisted via saveProject. The V25 default is now mitre, so V25 entries
// here are effectively no-ops; kept for read-back of older save files.
let mitrePairs = {};

// ---- Per-pair priority (V25 only) ----
// Key = "v25-min(idA,idB)-max(idA,idB)", value = entity id of the member that
// stays uncut (the "through" / priority member). Absent = mitre (the default
// for any endpoint-to-endpoint joint). Persisted via saveProject.
let priorityForPairV25 = {};

function _shsPairKey(idA, idB) {
  return idA < idB ? `${idA}-${idB}` : `${idB}-${idA}`;
}

// ---- Effective priority ----
// Larger SHS B-value wins; weldPriorityBoost dominates section size; ties
// broken by id ascending (earlier-drawn wins on tie — matches "chord placed
// first is the through-member" mental model).
function effectiveShsPriority(obj) {
  const s = (typeof SHS_DB !== 'undefined') ? SHS_DB[obj.section] : null;
  const B = s ? s.B : 0;
  const boost = obj.weldPriorityBoost || 0;
  return B + boost * 100000;
}

function _comparePriorityDesc(a, b) {
  // Higher effective priority first; tiebreak: lower id first.
  const dp = effectiveShsPriority(b) - effectiveShsPriority(a);
  if (dp !== 0) return dp;
  return (a.id || 0) - (b.id || 0);
}

// ---- Joint cache ----
let _shsJointCacheDirty = true;
let _shsJointCache = null;

function invalidateJointCache() {
  _shsJointCacheDirty = true;
  // Also invalidate the V25 (2D-mode) joint cache. Both caches stay in sync
  // so existing upstream callers (addObj, undo, grip drag, etc.) keep working
  // unchanged via 23-auto-weld's invalidateWeldCache hook.
  _v25JointCacheDirty = true;
  _v25JointCache = {};
  // weld-priority-truss — the connected-component / precedence cache rides the
  // same generation as the joint cache (declared in the V25 section below).
  _v25CompCache = {};
}

// ---- Vector helpers (3D) ----
function _jvSub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function _jvAdd(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function _jvDot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function _jvLen(a) { return Math.hypot(a.x, a.y, a.z); }
function _jvNorm(a) {
  const L = _jvLen(a) || 1;
  return { x: a.x / L, y: a.y / L, z: a.z / L };
}
function _jvScale(a, k) { return { x: a.x * k, y: a.y * k, z: a.z * k }; }

// Distance from point P to infinite line through C with unit direction D.
function _distPointToLine(P, C, D) {
  const PC = _jvSub(P, C);
  const t = _jvDot(PC, D);
  const proj = _jvScale(D, t);
  const perp = _jvSub(PC, proj);
  return { dist: _jvLen(perp), t };
}

// ---- Detect joints ----
// Returns array of joints. Each joint:
//   { point: {x,y,z}, members: [{ obj, role: 'end+1'|'end-1'|'through', tParam }, ...] }
function computeShsJoints() {
  if (!_shsJointCacheDirty && _shsJointCache) return _shsJointCache;

  const shsObjs = (typeof objects3D !== 'undefined' ? objects3D : [])
    .filter(o => o.type === 'shs');

  // Step 1: collect every SHS endpoint as a candidate node seed.
  const ends = [];
  for (const obj of shsObjs) {
    if (typeof memberEndPoint !== 'function') continue;
    const pPlus = memberEndPoint(obj, +1);
    const pMinus = memberEndPoint(obj, -1);
    ends.push({ obj, sign: +1, point: pPlus });
    ends.push({ obj, sign: -1, point: pMinus });
  }

  // Step 2: cluster endpoints by proximity (O(n²), n typically <100).
  const clusters = []; // [{ point, members: [{ obj, role, tParam }] }]
  for (const e of ends) {
    let merged = false;
    for (const c of clusters) {
      const d = _jvLen(_jvSub(c.point, e.point));
      if (d <= SHS_JOINT_END_TOL) {
        c.members.push({ obj: e.obj, role: e.sign === 1 ? 'end+1' : 'end-1', tParam: null });
        // Average centroid for stability
        const n = c.members.length;
        c.point = {
          x: (c.point.x * (n - 1) + e.point.x) / n,
          y: (c.point.y * (n - 1) + e.point.y) / n,
          z: (c.point.z * (n - 1) + e.point.z) / n,
        };
        merged = true;
        break;
      }
    }
    if (!merged) {
      clusters.push({
        point: { x: e.point.x, y: e.point.y, z: e.point.z },
        members: [{ obj: e.obj, role: e.sign === 1 ? 'end+1' : 'end-1', tParam: null }],
      });
    }
  }

  // Drop singleton clusters — a lone endpoint isn't a joint.
  const joints = clusters.filter(c => c.members.length >= 2);

  // Step 3: T-junction detection. For each joint, check every SHS not already
  // a member to see if the joint sits inside that member's body envelope —
  // either near its centerline or on its outer face. Drafters draw posts and
  // diagonals so their endpoint sits on the chord's outer face (offset by
  // chord.B/2 from the centerline), so the perpendicular tolerance has to
  // allow up to half-section-width plus a small slack.
  for (const joint of joints) {
    const memberIds = new Set(joint.members.map(m => m.obj.id));
    for (const obj of shsObjs) {
      if (memberIds.has(obj.id)) continue; // already involved (as endpoint)
      const sObj = SHS_DB[obj.section];
      if (!sObj) continue;
      const f = memberFrame(obj);
      const c = { x: obj.x || 0, y: obj.y || 0, z: obj.z || 0 };
      const d = f.axis;
      const { dist, t } = _distPointToLine(joint.point, c, d);
      const perpTol = (sObj.B / 2) + SHS_JOINT_THROUGH_TOL;
      if (dist > perpTol) continue;
      const hl = (obj.length || 0) / 2;
      // Reject if the joint is essentially at one of the ends — that's an
      // endpoint case the clustering would have caught if tolerances aligned;
      // if it didn't, it's still not a "through" joint. Use a generous margin.
      if (hl < 1) continue;
      const tNorm = t / hl; // -1 = minus end, +1 = plus end
      if (tNorm < -0.95 || tNorm > 0.95) continue;
      joint.members.push({ obj, role: 'through', tParam: t });
    }
  }

  _shsJointCache = joints;
  _shsJointCacheDirty = false;
  return _shsJointCache;
}

// ---- Find which joint(s) a given member is at, and at which end ----
function _jointsForMember(memberObj) {
  const all = computeShsJoints();
  const out = []; // [{ joint, role }]
  for (const j of all) {
    for (const m of j.members) {
      if (m.obj.id === memberObj.id) {
        out.push({ joint: j, role: m.role });
      }
    }
  }
  return out;
}

// ---- Sutherland–Hodgman polygon clip against a half-plane ----
// Half-plane defined by axis ('u' or 'v') and bound type ('min' or 'max') and
// value. Keeps points where (axis op value).
function _clipPolygon(poly, axis, op, value) {
  if (!poly.length) return poly;
  const out = [];
  const inside = (p) => op === 'min' ? p[axis] >= value : p[axis] <= value;
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i];
    const prev = poly[(i + poly.length - 1) % poly.length];
    const curIn = inside(cur);
    const prevIn = inside(prev);
    if (curIn) {
      if (!prevIn) {
        // Entering — add intersection
        const tt = (value - prev[axis]) / (cur[axis] - prev[axis]);
        out.push({
          u: prev.u + tt * (cur.u - prev.u),
          v: prev.v + tt * (cur.v - prev.v),
        });
      }
      out.push(cur);
    } else if (prevIn) {
      // Leaving — add intersection
      const tt = (value - prev[axis]) / (cur[axis] - prev[axis]);
      out.push({
        u: prev.u + tt * (cur.u - prev.u),
        v: prev.v + tt * (cur.v - prev.v),
      });
    }
  }
  return out;
}

// ---- Project an SHS's outline (4 corners) into another SHS's local frame ----
// Returns array of {u, v} points. M is the receiving member; O is the projected
// member.
function _projectOutlineIntoLocal(O, M) {
  const sO = SHS_DB[O.section];
  if (!sO) return null;
  const fO = memberFrame(O);
  const fM = memberFrame(M);
  const Ocentre = { x: O.x || 0, y: O.y || 0, z: O.z || 0 };
  const Mcentre = { x: M.x || 0, y: M.y || 0, z: M.z || 0 };
  const hlO = (O.length || 0) / 2;
  const hBO = sO.B / 2;
  // O's local 4 corners in WORLD coords. Use O.axis (length) and O.up (cross-section
  // height in elevation). For elevation rendering the v axis is M.up (world Y when
  // unrotated), so projecting onto fM.up gives the correct cross-cut.
  const corners = [
    [+hlO, +hBO], [+hlO, -hBO], [-hlO, -hBO], [-hlO, +hBO],
  ];
  const out = [];
  for (const [a, b] of corners) {
    const wp = _jvAdd(Ocentre,
      _jvAdd(_jvScale(fO.axis, a), _jvScale(fO.up, b)));
    // Convert wp to M's local frame (relative to M's centroid).
    const rel = _jvSub(wp, Mcentre);
    out.push({
      u: _jvDot(rel, fM.axis),
      v: _jvDot(rel, fM.up),
    });
  }
  return out;
}

// ---- Build a "cut info" object for one end of M ----
// Returns { uAtV(v), isMitre: bool } or null if no cut applies.
//
// uAtV(v) returns the local-u of the cut line at a given local-v height.
// For a perpendicular butt cut, uAtV is constant.
// For a mitre cut, uAtV varies linearly with v.
function _computeEndCut(M, jointInfo, sign) {
  const sM = SHS_DB[M.section];
  if (!sM) return null;
  const hlM = (M.length || 0) / 2;
  const jointU = sign * hlM; // local-u position of the joint along M's axis

  // Higher-priority neighbours at this joint (excluding M itself).
  const allOtherMembers = jointInfo.joint.members.filter(m => m.obj.id !== M.id);
  // Cut rule: only STRICTLY higher effective priority cuts. Equal-priority
  // members (e.g. post + diagonals all at the same section size at a truss
  // apex) shouldn't cut each other — the user expects all three lower-prio
  // members to terminate at the chord's face, not be cut back further by
  // each other. The id-based tiebreak still drives the popup ordering, but
  // it does NOT promote one equal-prio member above another for trimming.
  const others = allOtherMembers.filter(m => effectiveShsPriority(m.obj) > effectiveShsPriority(M));

  // Mitre lookup considers ALL end-meeting members at this joint regardless
  // of priority — mitre is a user-driven pair override, so equal-priority
  // pairs (post↔diag, diag↔diag) can be mitred too. If a mitre flag is set,
  // it supersedes the priority butt cut.
  let mitreNeighbour = null;
  if (jointInfo.role !== 'through') {
    for (const m of allOtherMembers) {
      if (m.role === 'through') continue;
      const k = _shsPairKey(M.id, m.obj.id);
      if (mitrePairs[k]) { mitreNeighbour = m; break; }
    }
  }

  if (!mitreNeighbour && !others.length) return null; // no cut applies

  const fM = memberFrame(M);
  const Mcentre = { x: M.x || 0, y: M.y || 0, z: M.z || 0 };

  if (mitreNeighbour) {
    // Mitre cut along the bisector of the two members' INTO-joint axes. The
    // bisector direction (bnu, bnv) in M's local frame is the cut-LINE
    // direction (parallel), passing through the joint at (jointU, 0):
    //   u = jointU + (bnu/bnv) · v.
    // |bnv| ≈ 0 only when the bisector is parallel to M's axis (members
    // collinear), already covered by the bWorld zero-check below.
    const mIntoJoint = sign > 0 ? fM.axis : _jvScale(fM.axis, -1);
    const fO = memberFrame(mitreNeighbour.obj);
    const oSign = mitreNeighbour.role === 'end+1' ? +1 : -1;
    const oIntoJoint = oSign > 0 ? fO.axis : _jvScale(fO.axis, -1);
    const bSum = _jvAdd(mIntoJoint, oIntoJoint);
    if (_jvLen(bSum) < 1e-6) return _computeButtCut(M, others, jointU);
    const bWorld = _jvNorm(bSum);
    const bnu = _jvDot(bWorld, fM.axis);
    const bnv = _jvDot(bWorld, fM.up);
    if (Math.abs(bnv) < 1e-3) return _computeButtCut(M, others, jointU);
    const slopeUV = bnu / bnv;
    return {
      uAtV: (v) => jointU + slopeUV * v,
      isMitre: true,
    };
  }

  return _computeButtCut(M, others, jointU);
}

// Closed-form face-cut line on M along neighbour O's near outer-face plane —
// 3D analogue of _faceCutLineV25. M and O are 3D SHS objects.
function _faceCutLine3D(M, O, jointU, sign) {
  const sO = SHS_DB[O.section];
  if (!sO) return null;
  const hBO = sO.B / 2;
  const fM = memberFrame(M);
  const fO = memberFrame(O);
  const Mc = { x: M.x || 0, y: M.y || 0, z: M.z || 0 };
  const Oc = { x: O.x || 0, y: O.y || 0, z: O.z || 0 };
  // M.centroid sits at M's centreline midpoint (no offset along axis — M.x/y/z
  // is already the centroid in the 3D model). Same for O.
  const vCentre = _jvDot(_jvSub(Mc, Oc), fO.up);
  let sideSign = vCentre >= 0 ? +1 : -1;
  if (Math.abs(vCentre) < 1e-3) {
    // Centroids align in fO.up — fall back to the joint position for the side.
    // jointU is in M's local frame; map to world via Mc + jointU*fM.axis.
    const jW = _jvAdd(Mc, _jvScale(fM.axis, jointU));
    const vJ = _jvDot(_jvSub(jW, Oc), fO.up);
    sideSign = vJ >= 0 ? +1 : -1;
  }
  const A = _jvDot(fM.axis, fO.up);
  const B = _jvDot(fM.up,   fO.up);
  const C = sideSign * hBO - _jvDot(_jvSub(Mc, Oc), fO.up);
  if (Math.abs(A) < 1e-3) {
    // M parallel to O.up — fall back to perpendicular trim.
    const poly = _projectOutlineIntoLocal(O, M);
    if (!poly || !poly.length) return null;
    const sM = SHS_DB[M.section];
    if (!sM) return null;
    const hBM = sM.B / 2;
    let clipped = _clipPolygon(poly, 'v', 'min', -hBM);
    clipped = _clipPolygon(clipped, 'v', 'max', +hBM);
    if (!clipped.length) return null;
    const cutU = sign > 0
      ? Math.min(...clipped.map(p => p.u))
      : Math.max(...clipped.map(p => p.u));
    return { uAtV: (_v) => cutU };
  }
  return { uAtV: (v) => (C - B * v) / A };
}

function _computeButtCut(M, neighbours, jointU) {
  const sM = SHS_DB[M.section];
  if (!sM) return null;
  const hBM = sM.B / 2;
  const sign = jointU > 0 ? +1 : -1;

  // Sloped cut line per cutter; compose by per-v most-restrictive value.
  const lines = [];
  for (const n of neighbours) {
    const ln = _faceCutLine3D(M, n.obj, jointU, sign);
    if (!ln) continue;
    const u1 = ln.uAtV(+hBM), u2 = ln.uAtV(-hBM);
    const trims = sign > 0
      ? (u1 < jointU - 1e-6 || u2 < jointU - 1e-6)
      : (u1 > jointU + 1e-6 || u2 > jointU + 1e-6);
    if (!trims) continue;
    lines.push(ln);
  }
  if (!lines.length) return null;

  let weldSize = 6;
  if (typeof getObjThickness === 'function' && typeof autoWeldMinSize === 'function') {
    let tThin = getObjThickness(M);
    for (const n of neighbours) {
      const tN = getObjThickness(n.obj);
      if (tN < tThin) tThin = tN;
    }
    weldSize = autoWeldMinSize(tThin);
  }

  return {
    uAtV: (v) => {
      let best = lines[0].uAtV(v);
      for (let i = 1; i < lines.length; i++) {
        const u = lines[i].uAtV(v);
        if (sign > 0) { if (u < best) best = u; }
        else          { if (u > best) best = u; }
      }
      return best;
    },
    isMitre: false,
    weldSize,
  };
}

// ---- Public API: per-member trim info for drawSHS ----
function jointTrimsForMember(obj) {
  if (!obj || obj.type !== 'shs') return null;
  const myJoints = _jointsForMember(obj);
  if (!myJoints.length) return null;

  let plus = null, minus = null;
  for (const ji of myJoints) {
    if (ji.role === 'end+1' && !plus) {
      plus = _computeEndCut(obj, ji, +1);
    } else if (ji.role === 'end-1' && !minus) {
      minus = _computeEndCut(obj, ji, -1);
    }
    // 'through' role: no trim possible (V1 limitation — see file header).
  }
  if (!plus && !minus) return null;
  return { ends: { plus, minus } };
}

// ---- Hit-test: find joint near a click point in the active block's view ----
function hitTestJoint(blk, px, py) {
  if (!blk) return null;
  const joints = computeShsJoints();
  if (!joints.length) return null;
  const tolPx = 12;
  let best = null, bestDist = Infinity;
  for (const j of joints) {
    let u, v;
    if (blk.viewKey === 'elevation')      { u = j.point.x; v = j.point.y; }
    else if (blk.viewKey === 'sectionA')  { u = j.point.z; v = j.point.y; }
    else                                   { u = j.point.x; v = j.point.z; }
    const sp = real2px(blk, u, v);
    const d = Math.hypot(sp.x - px, sp.y - py);
    if (d < tolPx && d < bestDist) { best = j; bestDist = d; }
  }
  return best;
}

// ---- Joint popup ----
let _shsJointPopup = null;

function showJointPopup(joint, clientX, clientY) {
  closeJointPopup();
  const div = document.createElement('div');
  div.id = 'shsJointPopup';
  div.style.cssText = `
    position: fixed; left: ${clientX + 12}px; top: ${clientY - 10}px;
    background: var(--bg, #1e1e2e); border: 1px solid var(--brd, #444);
    border-radius: 6px; padding: 10px 14px; z-index: 999;
    font: 12px system-ui; color: var(--entity-color, #ccc);
    box-shadow: 0 4px 16px rgba(0,0,0,0.4); min-width: 240px;
  `;
  document.body.appendChild(div);
  _shsJointPopup = div;
  _renderJointPopup(div, joint);

  // Close on click outside
  document.removeEventListener('mousedown', _jointPopupOutsideClick);
  setTimeout(() => {
    document.addEventListener('mousedown', _jointPopupOutsideClick);
  }, 50);
}

function _renderJointPopup(div, joint) {
  // Refresh the live members list each render (priority order may change as
  // the user hits ↑/↓). Re-resolve from the cache so role flags are current.
  invalidateJointCache();
  const fresh = computeShsJoints();
  // Find the same joint (best match by point distance).
  let liveJoint = joint;
  let bestD = Infinity;
  for (const j of fresh) {
    const d = _jvLen(_jvSub(j.point, joint.point));
    if (d < bestD) { bestD = d; liveJoint = j; }
  }
  joint = liveJoint;

  const sortedMembers = [...joint.members].sort((a, b) =>
    _comparePriorityDesc(a.obj, b.obj));

  const memberRows = sortedMembers.map((m, idx) => {
    const sec = m.obj.section || '?';
    const through = m.role === 'through';
    const prefix = through ? '<span title="through-member" style="color:var(--accent);">▲</span>' : '&nbsp;&nbsp;';
    const boost = m.obj.weldPriorityBoost || 0;
    return `
      <div style="display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid var(--brd,#333);">
        <span style="width:14px;text-align:center;">${prefix}</span>
        <span style="flex:1;font-family:monospace;font-size:11px;">
          #${m.obj.id} ${sec} SHS${boost ? ` <span style="opacity:0.6;">(+${boost})</span>` : ''}
        </span>
        <button data-act="up" data-id="${m.obj.id}" style="padding:2px 6px;background:var(--brd,#444);color:inherit;border:none;border-radius:3px;cursor:pointer;font-size:11px;" ${idx === 0 ? 'disabled' : ''}>↑</button>
        <button data-act="dn" data-id="${m.obj.id}" style="padding:2px 6px;background:var(--brd,#444);color:inherit;border:none;border-radius:3px;cursor:pointer;font-size:11px;" ${idx === sortedMembers.length - 1 ? 'disabled' : ''}>↓</button>
      </div>
    `;
  }).join('');

  // Pair list — only endpoint-endpoint pairs are eligible for mitre.
  const pairs = [];
  for (let i = 0; i < sortedMembers.length; i++) {
    for (let j = i + 1; j < sortedMembers.length; j++) {
      const a = sortedMembers[i], b = sortedMembers[j];
      pairs.push({ a, b, eligible: a.role !== 'through' && b.role !== 'through' });
    }
  }
  const pairRows = pairs.map(p => {
    const k = _shsPairKey(p.a.obj.id, p.b.obj.id);
    const checked = !!mitrePairs[k];
    const disabled = !p.eligible;
    return `
      <label style="display:flex;align-items:center;gap:6px;padding:2px 0;font-size:11px;${disabled ? 'opacity:0.4;' : 'cursor:pointer;'}">
        <input type="checkbox" data-mitrekey="${k}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
        <span>Mitre #${p.a.obj.id} ↔ #${p.b.obj.id}${disabled ? ' <span style="font-size:10px;">(through)</span>' : ''}</span>
      </label>
    `;
  }).join('');

  div.innerHTML = `
    <div style="font-weight:600;margin-bottom:6px;font-size:13px;">SHS Joint</div>
    <div style="font-size:10px;opacity:0.55;margin-bottom:6px;">
      ${joint.members.length} members at (${Math.round(joint.point.x)}, ${Math.round(joint.point.y)}, ${Math.round(joint.point.z)})
    </div>
    <div style="margin-bottom:8px;">${memberRows}</div>
    ${pairs.length ? `<div style="font-size:10px;opacity:0.7;margin-bottom:4px;">Mitre overrides</div><div style="margin-bottom:8px;">${pairRows}</div>` : ''}
    <button id="sjReset" style="width:100%;padding:4px;margin-bottom:4px;background:var(--brd,#444);color:inherit;border:none;border-radius:3px;cursor:pointer;font-size:11px;">Reset to auto</button>
    <button id="sjClose" style="width:100%;padding:3px;background:var(--brd,#444);color:inherit;border:none;border-radius:3px;cursor:pointer;font-size:11px;">Close</button>
  `;

  // ↑ / ↓ handlers — adjust weldPriorityBoost ±1 per click.
  div.querySelectorAll('button[data-act]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.id);
      const obj = objects3D.find(o => o.id === id);
      if (!obj) return;
      obj.weldPriorityBoost = (obj.weldPriorityBoost || 0) + (btn.dataset.act === 'up' ? 1 : -1);
      invalidateWeldCache();
      requestRender();
      _renderJointPopup(div, joint); // re-render with new order
    });
  });

  // Mitre checkbox handlers.
  div.querySelectorAll('input[data-mitrekey]').forEach(cb => {
    cb.addEventListener('change', () => {
      const k = cb.dataset.mitrekey;
      if (cb.checked) mitrePairs[k] = true;
      else delete mitrePairs[k];
      invalidateWeldCache();
      requestRender();
    });
  });

  // Reset to auto: clear boosts and mitres for THIS joint's members only.
  div.querySelector('#sjReset').addEventListener('click', () => {
    const ids = joint.members.map(m => m.obj.id);
    for (const id of ids) {
      const obj = objects3D.find(o => o.id === id);
      if (obj) delete obj.weldPriorityBoost;
    }
    // Remove every mitrePair where both ids are in this joint.
    for (const k of Object.keys(mitrePairs)) {
      const [a, b] = k.split('-').map(s => parseInt(s));
      if (ids.includes(a) && ids.includes(b)) delete mitrePairs[k];
    }
    invalidateWeldCache();
    requestRender();
    _renderJointPopup(div, joint);
  });

  div.querySelector('#sjClose').addEventListener('click', closeJointPopup);
}

function _jointPopupOutsideClick(e) {
  if (_shsJointPopup && !_shsJointPopup.contains(e.target)) closeJointPopup();
}

function closeJointPopup() {
  if (_shsJointPopup) { _shsJointPopup.remove(); _shsJointPopup = null; }
  document.removeEventListener('mousedown', _jointPopupOutsideClick);
}

// ============================================================
// V25 2D-MODE JOINT DETECTION + TRIM (parallel to the 3D path above)
// ============================================================
// V25 mem2 entities are 2D paper-space SHS members in `entities2D[viewKey]`.
// Their local frame has end A at the local origin (x=0) and end B at x=length;
// y goes from -hB to +hB perpendicular to the axis. ent.rot is degrees,
// ent.u/ent.v is the world (paper-space) position of end A.
//
// `mitrePairs` is shared with the 3D system but V25 keys are namespaced
// "v25-min-max" so 3D obj IDs and V25 ent IDs can't collide.

function _v25PairKey(idA, idB) {
  return idA < idB ? `v25-${idA}-${idB}` : `v25-${idB}-${idA}`;
}

function _v25EndPoint(ent, sign) {
  const rot = (ent.rot || 0) * Math.PI / 180;
  const len = ent.length || 0;
  if (sign < 0) return { u: ent.u, v: ent.v };
  return {
    u: ent.u + len * Math.cos(rot),
    v: ent.v + len * Math.sin(rot),
  };
}

function _v25Frame(ent) {
  const rot = (ent.rot || 0) * Math.PI / 180;
  const c = Math.cos(rot), s = Math.sin(rot);
  return { axis: { u: c, v: s }, up: { u: -s, v: c } };
}

// Generic depth lookup — falls back to the global v25Mem2HalfDepth helper in
// 68-v25-tools.js so every member type (UB, UC, SHS, RHS, CHS) is supported
// by the same code path.
function _v25HalfDepth(ent) {
  if (typeof v25Mem2HalfDepth === 'function') return v25Mem2HalfDepth(ent);
  if (ent.memberType === 'shs' && typeof SHS_DB === 'object') {
    const s = SHS_DB[ent.section]; return s ? s.B / 2 : 50;
  }
  return 50;
}

function effectiveV25Priority(ent) {
  // Effective priority is the bounding-rectangle depth (i.e. 2 × half-depth)
  // plus the user's manual boost. Larger sections out-rank smaller — but the
  // V25 default is mitre, so this only matters when a third member (a
  // through-chord) is in the picture; ordinary endpoint-to-endpoint pairs
  // mitre regardless of size.
  const depth = _v25HalfDepth(ent) * 2;
  const boost = ent.weldPriorityBoost || 0;
  return depth + boost * 100000;
}

function _comparePriorityDescV25(a, b) {
  const dp = effectiveV25Priority(b) - effectiveV25Priority(a);
  if (dp !== 0) return dp;
  return (a.id || 0) - (b.id || 0);
}

let _v25JointCacheDirty = true;
let _v25JointCache = {};
// weld-priority-truss — per-(viewKey) cache of connected weld components plus a
// per-component precedence mode ('rank' | 'legacy' | 'default'). Rebuilt lazily
// by _v25BuildComponents and cleared alongside the joint cache so any rank or
// legacy edit recomputes.
let _v25CompCache = {};

function invalidateV25JointCache() { _v25JointCacheDirty = true; _v25JointCache = {}; _v25CompCache = {}; }

// ============================================================
// WELD PRIORITY (per-member rank) — truss N-member cascade
// ============================================================
// Each mem2 entity may carry an integer `weldPriority` (1 = highest priority =
// solid / runs through; lower number wins). Absent = an implicit draw-order rank
// (lower id == drawn earlier == higher priority — matches "the chord drawn first
// is the through-member"). At any joint a member is cut by every neighbour that
// STRICTLY out-ranks it; a through-chord (a member crossing the node mid-span)
// is ALWAYS a cutter because it has no endpoint here and cannot be split. This
// drives _computeEndCutV25's cutter selection. The legacy per-pair maps
// (priorityForPairV25 / mitrePairs) stay readable for old saves but are IGNORED
// for any component that has an explicit weldPriority — see _v25NodePriorityMode.

// rankKey — the single source of truth for cut decisions. LOWER = more solid.
function v25WeldRankKey(ent) {
  const wp = ent && ent.weldPriority;
  if (typeof wp === 'number' && isFinite(wp) && wp >= 1) return Math.floor(wp);
  return 1e6 + ((ent && ent.id) || 0);   // implicit draw-order fallback
}

// Build (and cache) the connected weld components for a view, plus each
// component's precedence mode. Components are the connected components of the
// joint graph (members sharing a joint are adjacent; through-members included so
// a chord links all its panels into one component). Union-find, O(joints·members).
function _v25BuildComponents(viewKey) {
  if (_v25CompCache[viewKey]) return _v25CompCache[viewKey];
  const joints = computeShsJointsV25(viewKey);
  const arr = (typeof entities2D !== 'undefined' && entities2D[viewKey]) ? entities2D[viewKey] : [];
  const byId = new Map();
  for (const e of arr) if (e && e.type === 'mem2' && (e.aspect || 'elev') === 'elev') byId.set(e.id, e);

  const parent = new Map();
  for (const id of byId.keys()) parent.set(id, id);
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  for (const j of joints) {
    const ids = j.members.map(m => m.ent.id).filter(id => byId.has(id));
    for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);
  }

  const compArrays = new Map();   // root id -> [ent, ...]
  for (const id of byId.keys()) {
    const r = find(id);
    if (!compArrays.has(r)) compArrays.set(r, []);
    compArrays.get(r).push(byId.get(id));
  }

  const compOf = new Map();   // member id -> component array
  const modeOf = new Map();   // member id -> 'rank' | 'legacy' | 'default'
  for (const members of compArrays.values()) {
    let mode = 'default';
    const hasRank = members.some(m => typeof m.weldPriority === 'number' && isFinite(m.weldPriority) && m.weldPriority >= 1);
    if (hasRank) {
      mode = 'rank';
    } else {
      // Legacy if any joint pair within this component carries a legacy entry.
      const idSet = new Set(members.map(m => m.id));
      let legacy = false;
      for (const j of joints) {
        const jids = j.members.map(m => m.ent.id).filter(id => idSet.has(id));
        for (let i = 0; i < jids.length && !legacy; i++) {
          for (let k = i + 1; k < jids.length && !legacy; k++) {
            const key = _v25PairKey(jids[i], jids[k]);
            if (priorityForPairV25[key] != null || mitrePairs[key]) legacy = true;
          }
        }
        if (legacy) break;
      }
      if (legacy) mode = 'legacy';
    }
    for (const m of members) { compOf.set(m.id, members); modeOf.set(m.id, mode); }
  }

  const out = { compOf, modeOf };
  _v25CompCache[viewKey] = out;
  return out;
}

// All members transitively welded to `ent`, returned in stable priority order
// (rankKey asc, then id). A member with no joints is its own component of one.
function v25WeldComponent(ent, viewKey) {
  if (!ent) return [];
  const c = _v25BuildComponents(viewKey).compOf.get(ent.id);
  const list = c ? [...c] : [ent];
  return list.sort((a, b) => (v25WeldRankKey(a) - v25WeldRankKey(b)) || ((a.id || 0) - (b.id || 0)));
}

// Precedence mode for the component a joint belongs to. All members at a joint
// share one component, so any member resolves it.
function _v25NodePriorityMode(joint, viewKey) {
  if (!joint || !joint.members || !joint.members.length) return 'default';
  const modeOf = _v25BuildComponents(viewKey).modeOf;
  for (const m of joint.members) { const md = modeOf.get(m.ent.id); if (md) return md; }
  return 'default';
}

// Does this member participate in >=1 joint? (A solid/through member has no trim
// but IS welded — so test joints, never jointTrimsForMem2 which is null for it.)
function v25IsMemberWelded(ent, viewKey) {
  if (!ent || ent.type !== 'mem2') return false;
  return _jointsForMem2(ent, viewKey).length > 0;
}

// True iff at SOME joint this member meets exactly one other ENDPOINT member and
// no through-chord — i.e. a plain corner where "Mitre" is a meaningful option.
function v25IsPlain2MemberCorner(ent, viewKey) {
  if (!ent) return false;
  for (const ji of _jointsForMem2(ent, viewKey)) {
    if (ji.role === 'through') continue;
    const others = ji.joint.members.filter(m => m.ent.id !== ent.id);
    const endpts = others.filter(m => m.role !== 'through');
    const throughs = others.filter(m => m.role === 'through');
    if (endpts.length === 1 && throughs.length === 0) return true;
  }
  return false;
}

// Dry-run the cut at each of this member's ends to report its rendered state.
// 'SOLID' = runs through (no end trimmed); 'MITRE' = a mitred end; 'CUT' = a
// butt cut welded to a higher-priority member. butt > mitre > solid in priority.
function v25MemberCutState(ent, viewKey) {
  if (!ent || ent.type !== 'mem2') return 'SOLID';
  let mitre = false;
  for (const ji of _jointsForMem2(ent, viewKey)) {
    if (ji.role === 'through') continue;
    const cut = _computeEndCutV25(ent, ji, ji.role === 'end+1' ? +1 : -1, viewKey);
    if (cut) { if (cut.isMitre) mitre = true; else return 'CUT'; }
  }
  return mitre ? 'MITRE' : 'SOLID';
}

// Is this member's corner currently rendering as a mitre? (Used for the UI tick.)
function v25CornerIsMitre(ent, viewKey) {
  if (!v25IsPlain2MemberCorner(ent, viewKey)) return false;
  return v25MemberCutState(ent, viewKey) === 'MITRE';
}

// The value the weld-priority dropdown should show as currently selected:
// 'mitre' for a mitred corner, else the member's (explicit or implicit) rank.
function v25WeldPriorityCurrentValue(ent, viewKey) {
  if (v25CornerIsMitre(ent, viewKey)) return 'mitre';
  // Always report the member's POSITION in the rank-sorted component (1..N) so
  // the value is guaranteed to match one of the dropdown's options even if raw
  // weldPriority values have gaps (e.g. after a member delete). The insert-shift
  // writer re-materialises 1..N, so position == explicit rank in the common case.
  const comp = v25WeldComponent(ent, viewKey);   // sorted by rankKey asc
  const idx = comp.findIndex(e => e.id === ent.id);
  return String((idx < 0 ? 0 : idx) + 1);
}

// ---- WRITE helpers (mutate weldPriority; atomic component-wide undo) ----
// Push one undo record per call covering EVERY touched member so a single Ctrl+Z
// reverts the whole re-rank. weldPriority snapshots only — legacy maps are left
// inert (precedence in _v25NodePriorityMode ignores them once any rank is set),
// so undoing a rank edit on an old save restores its exact legacy rendering.
function _v25PushWeldUndo(viewKey, before, after, mitreBefore, mitreAfter) {
  if (typeof undoStack === 'undefined' || !undoStack) return;
  undoStack.push({ act: 'v25EntFields', view: viewKey, before, after,
    mitreBefore: mitreBefore || null, mitreAfter: mitreAfter || null });
  if (undoStack.length > 100) undoStack.shift();
  if (typeof redoStack !== 'undefined' && redoStack) redoStack.length = 0;
}

function _v25SnapWeld(members) {
  return members.map(e => ({ id: e.id, wp: (typeof e.weldPriority === 'number' ? e.weldPriority : null) }));
}

// Plain 2-member corners within `comp` that currently render as a MITRE (dry-run,
// BEFORE any mutation). Returned as [{pk, a, b}] so the rank writer can preserve
// the mitre on corners it materialises ranks across but did not target.
function _v25ComponentMitrePairs(comp, viewKey) {
  const ids = new Set(comp.map(e => e.id));
  const seen = new Set(); const out = [];
  for (const m of comp) {
    for (const ji of _jointsForMem2(m, viewKey)) {
      if (ji.role === 'through') continue;
      const others = ji.joint.members.filter(x => x.ent.id !== m.id);
      const endpts = others.filter(x => x.role !== 'through');
      const throughs = others.filter(x => x.role === 'through');
      if (endpts.length !== 1 || throughs.length) continue;
      const partner = endpts[0].ent;
      if (!ids.has(partner.id)) continue;
      const pk = _v25PairKey(m.id, partner.id);
      if (seen.has(pk)) continue; seen.add(pk);
      const cut = _computeEndCutV25(m, ji, ji.role === 'end+1' ? +1 : -1, viewKey);
      if (cut && cut.isMitre) out.push({ pk, a: m.id, b: partner.id });
    }
  }
  return out;
}

// Assign `ent` the given 1-based rank within its connected weld component using
// insert-and-shift: the member is spliced into position `rank`, every member is
// then re-materialised 1..N in the resulting order (so ranks stay contiguous and
// any mixed explicit/implicit state collapses to a clean total order).
function v25AssignRankInsertShift(ent, viewKey, rank) {
  if (!ent) return;
  const comp = v25WeldComponent(ent, viewKey);   // sorted by current rankKey asc
  const N = comp.length;
  if (!N) return;
  // Capture which plain corners are mitred RIGHT NOW (before we materialise ranks
  // component-wide). Materialising 1..N flips the whole component to rank mode, so
  // without this an untouched mitred corner elsewhere (e.g. a portal apex) would
  // silently become a butt cut. We re-assert mitre via mitrePairs for every such
  // corner EXCEPT the one the user is targeting (whose corner becomes a priority cut).
  const mitreNow = _v25ComponentMitrePairs(comp, viewKey);
  const before = _v25SnapWeld(comp);
  const order = comp.filter(e => e.id !== ent.id);
  const pos = Math.max(1, Math.min(N, Math.floor(rank))) - 1;
  order.splice(pos, 0, ent);
  order.forEach((e, i) => { e.weldPriority = i + 1; });
  // Preserve / clear mitre flags (with an undo snapshot of each touched key).
  const mitreBefore = {}, mitreAfter = {};
  const setMitre = (pk, val) => {
    if (!(pk in mitreBefore)) mitreBefore[pk] = (pk in mitrePairs) ? mitrePairs[pk] : undefined;
    if (val) { mitrePairs[pk] = true; mitreAfter[pk] = true; }
    else { delete mitrePairs[pk]; mitreAfter[pk] = undefined; }
  };
  for (const { pk, a, b } of mitreNow) {
    setMitre(pk, !(a === ent.id || b === ent.id));   // keep mitre unless it's the target's corner
  }
  // Also clear any stale mitre flag on the TARGET's own plain corners so the new rank takes effect.
  for (const ji of _jointsForMem2(ent, viewKey)) {
    if (ji.role === 'through') continue;
    const others = ji.joint.members.filter(x => x.ent.id !== ent.id);
    const endpts = others.filter(x => x.role !== 'through');
    if (endpts.length === 1 && !others.some(x => x.role === 'through')) {
      const pk = _v25PairKey(ent.id, endpts[0].ent.id);
      if (mitrePairs[pk]) setMitre(pk, false);
    }
  }
  _v25PushWeldUndo(viewKey, before, _v25SnapWeld(order), mitreBefore, mitreAfter);
  if (typeof invalidateWeldCache === 'function') invalidateWeldCache();
  if (typeof requestRender === 'function') requestRender();
  if (typeof workspaceTouchActive === 'function') workspaceTouchActive();
}

// Make `ent` the highest-priority (rank 1) member of its component. (A member
// whose end lands on a through-chord is still trimmed to that chord — it "runs
// through" only relative to the other end-meeting members. The UI badge shows
// the resolved SOLID/CUT state so this is never misleading.)
function v25MakeMemberThrough(ent, viewKey) {
  v25AssignRankInsertShift(ent, viewKey, 1);
}

// Restore a plain 2-member corner to the mitre default by clearing the explicit
// weldPriority on the corner pair (mode falls back to 'default' → bisector mitre).
function v25SetCornerMitre(ent, viewKey) {
  if (!ent || !v25IsPlain2MemberCorner(ent, viewKey)) return;
  const partners = new Set([ent]);
  const pks = [];
  for (const ji of _jointsForMem2(ent, viewKey)) {
    if (ji.role === 'through') continue;
    const others = ji.joint.members.filter(m => m.ent.id !== ent.id);
    const endpts = others.filter(m => m.role !== 'through');
    const throughs = others.filter(m => m.role === 'through');
    if (endpts.length === 1 && throughs.length === 0) { partners.add(endpts[0].ent); pks.push(_v25PairKey(ent.id, endpts[0].ent.id)); }
  }
  const affected = [...partners];
  const before = _v25SnapWeld(affected);
  affected.forEach(e => { delete e.weldPriority; });
  // Set an explicit mitre flag on the corner pair so the mitre holds even when a
  // SIBLING elsewhere in the component is ranked (which would otherwise keep the
  // component in rank mode and let the cascade override this corner).
  const mitreBefore = {}, mitreAfter = {};
  for (const pk of pks) {
    mitreBefore[pk] = (pk in mitrePairs) ? mitrePairs[pk] : undefined;
    mitrePairs[pk] = true; mitreAfter[pk] = true;
  }
  _v25PushWeldUndo(viewKey, before, _v25SnapWeld(affected), mitreBefore, mitreAfter);
  if (typeof invalidateWeldCache === 'function') invalidateWeldCache();
  if (typeof requestRender === 'function') requestRender();
  if (typeof workspaceTouchActive === 'function') workspaceTouchActive();
}

function computeShsJointsV25(viewKey) {
  if (!_v25JointCacheDirty && _v25JointCache[viewKey]) return _v25JointCache[viewKey];
  const arr = (typeof entities2D !== 'undefined' && entities2D[viewKey]) ? entities2D[viewKey] : [];
  // All elevation-view mem2 entities participate (UB / UC / SHS / RHS / CHS).
  // Cross-section view (aspect='sec') is excluded — joints don't apply there.
  const shs = arr.filter(e =>
    e && e.type === 'mem2' && (e.aspect || 'elev') === 'elev'
  );

  const ends = [];
  for (const e of shs) {
    ends.push({ ent: e, sign: -1, point: _v25EndPoint(e, -1) });
    ends.push({ ent: e, sign: +1, point: _v25EndPoint(e, +1) });
  }

  const clusters = [];
  for (const e of ends) {
    let merged = false;
    for (const c of clusters) {
      const dx = c.point.u - e.point.u, dy = c.point.v - e.point.v;
      if (Math.hypot(dx, dy) <= SHS_JOINT_END_TOL) {
        c.members.push({ ent: e.ent, role: e.sign === 1 ? 'end+1' : 'end-1' });
        const n = c.members.length;
        c.point = {
          u: (c.point.u * (n - 1) + e.point.u) / n,
          v: (c.point.v * (n - 1) + e.point.v) / n,
        };
        merged = true;
        break;
      }
    }
    if (!merged) {
      clusters.push({
        point: { u: e.point.u, v: e.point.v },
        members: [{ ent: e.ent, role: e.sign === 1 ? 'end+1' : 'end-1' }],
      });
    }
  }

  const joints = clusters.filter(c => c.members.length >= 2);

  // T-junction detection: joint inside another member's body envelope.
  for (const j of joints) {
    const memberIds = new Set(j.members.map(m => m.ent.id));
    for (const e of shs) {
      if (memberIds.has(e.id)) continue;
      const len = e.length || 0;
      if (len < 1) continue;
      const f = _v25Frame(e);
      const relU = j.point.u - e.u, relV = j.point.v - e.v;
      const t = relU * f.axis.u + relV * f.axis.v; // signed distance along axis
      const perpDist = Math.abs(relU * f.up.u + relV * f.up.v);
      const perpTol = _v25HalfDepth(e) + SHS_JOINT_THROUGH_TOL;
      if (perpDist > perpTol) continue;
      // Reject if joint is at one of the ends (would have been clustered).
      if (t < len * 0.05 || t > len * 0.95) continue;
      j.members.push({ ent: e, role: 'through', tParam: t });
    }
  }

  _v25JointCache[viewKey] = joints;
  // weld-priority-truss — mark the joint cache clean so repeated calls within one
  // render frame reuse it (every mutation routes through invalidateWeldCache →
  // invalidateJointCache, which re-dirties + clears, so this can't go stale).
  _v25JointCacheDirty = false;
  return joints;
}

function _jointsForMem2(ent, viewKey) {
  const all = computeShsJointsV25(viewKey);
  const out = [];
  for (const j of all) {
    for (const m of j.members) {
      if (m.ent.id === ent.id) out.push({ joint: j, role: m.role });
    }
  }
  return out;
}

// Project another mem2's outline polygon into M's local frame. The "outline"
// is the bounding rectangle of length × overall depth. For SHS / RHS this is
// the actual outer face. For UB / UC it's the bounding box (depth = d), which
// gives the correct cut x for elevation horizontal lines (top/bottom flange
// edges land on the bounding-rectangle's top/bottom). For CHS the bounding
// box circumscribes the circle.
function _projectV25OutlineIntoLocal(O, M) {
  const fO = _v25Frame(O);
  const fM = _v25Frame(M);
  const lenO = O.length || 0, hBO = _v25HalfDepth(O);
  if (lenO < 1) return null;
  // Corners of O in O's local frame (local origin at end A, x ∈ [0, len], y ∈ [-hB, +hB]):
  const corners = [
    [lenO, +hBO], [lenO, -hBO], [0, -hBO], [0, +hBO],
  ];
  const out = [];
  for (const [a, b] of corners) {
    // O local → world
    const wu = O.u + a * fO.axis.u + b * fO.up.u;
    const wv = O.v + a * fO.axis.v + b * fO.up.v;
    // World → M local
    const relU = wu - M.u, relV = wv - M.v;
    out.push({
      u: relU * fM.axis.u + relV * fM.axis.v,
      v: relU * fM.up.u + relV * fM.up.v,
    });
  }
  return out;
}

// Compute end cut info for a V25 mem2 ent. sign=-1 = end A (local x=0),
// sign=+1 = end B (local x=length). Returns { uAtV(y) → x, isMitre } or null.
function _computeEndCutV25(M, jointInfo, sign, viewKey) {
  const len = M.length || 0;
  if (len < 1) return null;
  const jointX = sign > 0 ? len : 0;

  const allOtherMembers = jointInfo.joint.members.filter(m => m.ent.id !== M.id);
  // weld-priority-truss — precedence for THIS node's component:
  //   'rank'    → any member has an explicit weldPriority; cut purely by rank.
  //   'legacy'  → an old save's priorityForPairV25 / mitrePairs entry exists
  //               and no explicit rank → run the original per-pair logic so the
  //               file renders byte-identically.
  //   'default' → no rank, no legacy data → the new draw-order cascade.
  const mode = _v25NodePriorityMode(jointInfo.joint, viewKey || M.view);

  // Through-chord neighbours (joint at this member's mid-span). A chord has no
  // endpoint here so it can NEVER be split — it is an unconditional cutter for
  // every endpoint member, regardless of mode or rank. Endpoint neighbours are
  // the members that share an actual end at this node.
  const throughs = allOtherMembers.filter(m => m.role === 'through');
  const endpointNeighbours = allOtherMembers.filter(m => m.role !== 'through');

  let mitrePartner = null;
  let cutters = [];

  if (mode === 'legacy') {
    // ===== LEGACY per-pair behaviour (old saves), byte-identical to before. =====
    if (jointInfo.role !== 'through') {
      for (const m of allOtherMembers) {
        if (priorityForPairV25[_v25PairKey(M.id, m.ent.id)] === M.id) return null;  // M wins → runs through
      }
    }
    let priorityNeighbour = null;
    if (jointInfo.role !== 'through') {
      for (const m of allOtherMembers) {
        const winnerId = priorityForPairV25[_v25PairKey(M.id, m.ent.id)];
        if (winnerId != null && winnerId !== M.id) { priorityNeighbour = m; break; }
      }
    }
    if (jointInfo.role !== 'through' && !priorityNeighbour && endpointNeighbours.length === 1) {
      mitrePartner = endpointNeighbours[0];
    }
    if (!mitrePartner && jointInfo.role !== 'through' && !priorityNeighbour) {
      for (const m of endpointNeighbours) {
        if (mitrePairs[_v25PairKey(M.id, m.ent.id)]) { mitrePartner = m; break; }
      }
    }
    if (priorityNeighbour) cutters.push(priorityNeighbour);
    for (const t of throughs) cutters.push(t);
    if (!mitrePartner && !cutters.length) return null;
  } else {
    // ===== RANK / DEFAULT cascade. 'rank' and 'default' share one rule —
    //       v25WeldRankKey internally reads an explicit weldPriority or the
    //       draw-order fallback, so the only behavioural difference is whether
    //       the plain-corner mitre default is allowed (default mode only). =====

    // (a) Plain 2-member corner → mitre. CORNER-LOCAL (NOT gated on component
    //     mode): a corner mitres when an explicit mitre flag is set for its pair,
    //     OR neither of its two members carries an explicit weldPriority. So
    //     ranking a member at one corner of a multi-corner component (e.g. a
    //     portal frame) never silently un-mitres an untouched corner elsewhere —
    //     v25AssignRankInsertShift sets mitrePairs for the corners it materialises
    //     but did not target, so they survive the component-wide rank materialise.
    if (jointInfo.role !== 'through' && endpointNeighbours.length === 1 && throughs.length === 0) {
      const _mp = endpointNeighbours[0];
      const _pk = _v25PairKey(M.id, _mp.ent.id);
      const _ranked = (e) => (typeof e.weldPriority === 'number' && isFinite(e.weldPriority) && e.weldPriority >= 1);
      if (mitrePairs[_pk] || (!_ranked(M) && !_ranked(_mp.ent))) mitrePartner = _mp;
    }

    // (b) Rank cutters: every endpoint neighbour that STRICTLY out-ranks M
    //     (lower rankKey = higher priority), plus every through-chord
    //     unconditionally. A member can never run solid through a chord.
    if (!mitrePartner) {
      const myRank = v25WeldRankKey(M);
      for (const n of endpointNeighbours) {
        if (v25WeldRankKey(n.ent) < myRank) cutters.push(n);
      }
      for (const t of throughs) cutters.push(t);
    }

    // (c) M is the strict-min rank at this node (and not mitring) → runs through.
    if (!mitrePartner && !cutters.length) return null;
  }

  const fM = _v25Frame(M);
  if (mitrePartner && !cutters.length) {
    const mitreNeighbour = mitrePartner;
    const oSign = mitreNeighbour.role === 'end+1' ? +1 : -1;
    const fO = _v25Frame(mitreNeighbour.ent);
    // Direction from M's centre toward joint: sign * fM.axis (M centre to joint).
    const mInto = { u: sign * fM.axis.u, v: sign * fM.axis.v };
    const oInto = { u: oSign * fO.axis.u, v: oSign * fO.axis.v };
    let bu = mInto.u + oInto.u, bv = mInto.v + oInto.v;
    const bLen = Math.hypot(bu, bv);
    if (bLen < 1e-6) return _computeButtCutV25(M, cutters, jointX, sign);
    bu /= bLen; bv /= bLen;
    // Bisector in M's local frame. (bnu, bnv) is the bisector DIRECTION VECTOR
    // — the cut LINE on M runs PARALLEL to this direction through the joint
    // point (jointX, 0). Parametrically: (u, v) = (jointX + t·bnu, t·bnv).
    // Solving for u as a function of v:  u = jointX + (bnu/bnv) · v.
    // The previous formula treated (bnu, bnv) as the cut-line NORMAL, which
    // gave the perpendicular line — visually correct as a 45° cut but on the
    // WRONG diagonal of the corner, so the two members would overlap on the
    // inside of the L instead of mating along their outer/inner corners.
    // |bnv| → 0 only when the bisector is parallel to M's axis (i.e. M is
    // collinear with O), already caught by the bLen check above. Belt & braces.
    const bnu = bu * fM.axis.u + bv * fM.axis.v;
    const bnv = bu * fM.up.u + bv * fM.up.v;
    if (Math.abs(bnv) < 1e-3) return _computeButtCutV25(M, cutters, jointX, sign);
    const slopeUV = bnu / bnv;
    let weldSize = 6;
    if (typeof v25Mem2Thickness === 'function' && typeof autoWeldMinSize === 'function') {
      const tThin = Math.min(v25Mem2Thickness(M), v25Mem2Thickness(mitreNeighbour.ent));
      weldSize = autoWeldMinSize(tThin);
    }
    return {
      uAtV: (y) => jointX + slopeUV * y,
      isMitre: true,
      weldSize,
    };
  }

  return _computeButtCutV25(M, cutters, jointX, sign);
}

// Build a closed-form cut line on M along neighbour O's near outer-face plane.
// Returns a function uAtV(y) → x in M's local frame, plus a "trims" flag that
// says whether this cut actually shortens M. The math:
//   Plane in world: (p - O.endA) · fO.up = sideSign · hBO
//   p = M.endA + uM·fM.axis + vM·fM.up
//   ⇒ A·uM + B·vM = C   where
//       A = fM.axis · fO.up
//       B = fM.up   · fO.up
//       C = sideSign·hBO − (M.endA − O.endA)·fO.up
//   ⇒ uM(vM) = (C − B·vM) / A           (when |A| > ε)
// |A| → 0 means M is parallel to O.axis — no clean face cut, fall back to
// the deepest-point perpendicular trim (same as the legacy behaviour).
function _faceCutLineV25(M, O, jointX, sign) {
  const fM = _v25Frame(M);
  const fO = _v25Frame(O);
  const hBO = _v25HalfDepth(O);
  if (hBO <= 0) return null;
  // M's centroid relative to O's centroid — picks which of O's two outer faces
  // M is approaching from. Tie-break with joint-relative if the centroids
  // happen to project to the same line.
  const lenM = M.length || 0, lenO = O.length || 0;
  const Mcu = M.u + 0.5 * lenM * fM.axis.u, Mcv = M.v + 0.5 * lenM * fM.axis.v;
  const Ocu = O.u + 0.5 * lenO * fO.axis.u, Ocv = O.v + 0.5 * lenO * fO.axis.v;
  const vCentre = (Mcu - Ocu) * fO.up.u + (Mcv - Ocv) * fO.up.v;
  let sideSign = vCentre > 0 ? +1 : -1;
  if (Math.abs(vCentre) < 1e-3) {
    // Centroids align — use the joint position relative to O.endA instead.
    // _v25EndPoint treats sign=−1 as end A and sign=+1 as end B; jointX is in
    // M's local frame, so map back to world via M.endA + jointX·fM.axis.
    const jWu = M.u + jointX * fM.axis.u;
    const jWv = M.v + jointX * fM.axis.v;
    const vJ = (jWu - O.u) * fO.up.u + (jWv - O.v) * fO.up.v;
    sideSign = vJ >= 0 ? +1 : -1;
  }
  const A = fM.axis.u * fO.up.u + fM.axis.v * fO.up.v;
  const B = fM.up.u   * fO.up.u + fM.up.v   * fO.up.v;
  const C = sideSign * hBO - ((M.u - O.u) * fO.up.u + (M.v - O.v) * fO.up.v);
  if (Math.abs(A) < 1e-3) {
    // M parallel to O.axis — no face-cut. Fall back to perpendicular trim
    // (deepest u of clipped projection), same as the legacy logic.
    const poly = _projectV25OutlineIntoLocal(O, M);
    if (!poly || !poly.length) return null;
    const hBM = _v25HalfDepth(M);
    let clipped = _clipPolygon(poly, 'v', 'min', -hBM);
    clipped = _clipPolygon(clipped, 'v', 'max', +hBM);
    if (!clipped.length) return null;
    const cutX = sign > 0
      ? Math.min(...clipped.map(p => p.u))
      : Math.max(...clipped.map(p => p.u));
    return { uAtV: (_y) => cutX };
  }
  return { uAtV: (y) => (C - B * y) / A };
}

function _computeButtCutV25(M, neighbours, jointX, sign) {
  const hBM = _v25HalfDepth(M);
  if (hBM <= 0) return null;

  // One sloped cut line per neighbour. We compose them by taking the most
  // restrictive uAtV at every v — typically only one cutter is active so this
  // collapses to a single line.
  const lines = [];
  for (const n of neighbours) {
    const ln = _faceCutLineV25(M, n.ent, jointX, sign);
    if (!ln) continue;
    // Skip neighbours that don't actually trim M (cut line lies fully past
    // the original end face on the joint side).
    const u1 = ln.uAtV(+hBM), u2 = ln.uAtV(-hBM);
    const trims = sign > 0
      ? (u1 < jointX - 1e-6 || u2 < jointX - 1e-6)
      : (u1 > jointX + 1e-6 || u2 > jointX + 1e-6);
    if (!trims) continue;
    lines.push(ln);
  }
  if (!lines.length) return null;

  // Weld size — AS 4100 Cl. 9.7.3.10 minimum based on the thinner of M and
  // its dominant cutter. v25Mem2Thickness lives in 68-v25-tools.js.
  let weldSize = 6;
  if (typeof v25Mem2Thickness === 'function' && typeof autoWeldMinSize === 'function') {
    let tThin = v25Mem2Thickness(M);
    for (const n of neighbours) {
      const tN = v25Mem2Thickness(n.ent);
      if (tN < tThin) tThin = tN;
    }
    weldSize = autoWeldMinSize(tThin);
  }

  const uAtV = (y) => {
    // Per-v most-restrictive across all cutters. Initialise from the dominant
    // cutter's first value so a single-cutter case returns the line's uAtV(y)
    // verbatim — including extensions past the original end face (negative u for
    // end A, u > len for end B).
    let best = lines[0].uAtV(y);
    for (let i = 1; i < lines.length; i++) {
      const u = lines[i].uAtV(y);
      if (sign > 0) { if (u < best) best = u; }
      else          { if (u > best) best = u; }
    }
    return best;
  };

  // weld-priority-truss — interior kink heights. With 2+ active cutters the cut
  // face is piecewise-linear (the winning line changes where two faces cross).
  // Expose those crossover v's so drawMem2D can draw a poly-cap that follows the
  // true kinked face (a brace nestling into a corner), instead of a straight
  // chord between the two corner samples. Empty for the single-cutter case.
  const kinks = [];
  if (lines.length > 1) {
    const co = lines.map(ln => { const a0 = ln.uAtV(0); return { a: a0, b: ln.uAtV(1) - a0 }; });
    for (let i = 0; i < co.length; i++) {
      for (let j = i + 1; j < co.length; j++) {
        const db = co[i].b - co[j].b;
        if (Math.abs(db) < 1e-9) continue;            // parallel faces — no crossing
        const vc = (co[j].a - co[i].a) / db;
        if (vc <= -hBM + 1e-4 || vc >= hBM - 1e-4) continue;   // outside the section depth
        // Keep only crossings that lie ON the envelope (where the winner flips).
        if (Math.abs(uAtV(vc) - (co[i].a + co[i].b * vc)) < 1e-3) kinks.push(vc);
      }
    }
    kinks.sort((p, q) => p - q);
  }
  const kinksDedup = [];
  for (const k of kinks) if (!kinksDedup.length || Math.abs(kinksDedup[kinksDedup.length - 1] - k) > 1e-3) kinksDedup.push(k);

  return { uAtV, isMitre: false, weldSize, kinks: kinksDedup };
}

// Public API consumed by drawMem2D in 68-v25-tools.js. Works for every mem2
// memberType (UB / UC / SHS / RHS / CHS) — the bounding-rectangle outline is
// computed via _v25HalfDepth, which delegates to v25Mem2HalfDepth for
// type-specific dimensions.
function jointTrimsForMem2(ent, viewKey) {
  if (!ent || ent.type !== 'mem2') return null;
  if ((ent.aspect || 'elev') !== 'elev') return null;
  const myJoints = _jointsForMem2(ent, viewKey);
  if (!myJoints.length) return null;
  let a = null, b = null;
  for (const ji of myJoints) {
    if (ji.role === 'end-1' && !a) a = _computeEndCutV25(ent, ji, -1, viewKey);
    else if (ji.role === 'end+1' && !b) b = _computeEndCutV25(ent, ji, +1, viewKey);
  }
  if (!a && !b) return null;
  return { a, b };
}

// V25 hit-test: find a joint near a click in the given block.
function hitTestJointV25(blk, px, py) {
  if (!blk) return null;
  const joints = computeShsJointsV25(blk.viewKey);
  if (!joints.length) return null;
  const tolPx = 14;
  let best = null, bestD = Infinity;
  for (const j of joints) {
    const sp = real2px(blk, j.point.u, j.point.v);
    const d = Math.hypot(sp.x - px, sp.y - py);
    if (d < tolPx && d < bestD) { best = j; bestD = d; }
  }
  return best;
}

// V25 node popup — the joint-NODE double-click now shares ONE editing surface
// with the member-body double-click: it delegates to the per-member weld-priority
// popup (js/68 v25OpenWeldPriorityPopup). Focus the first endpoint member at the
// node — its connected weld component covers every member of the joint, so the
// popup lists them all with live SOLID/MITRE/CUT badges and the [Mitre,1..N]
// dropdown. (Replaces the old two-button "Mitre / Pick member priority" menu and
// the transient click-to-pick mode, which wrote the legacy priorityForPairV25.)
function showJointPopupV25(joint, clientX, clientY, viewKey) {
  if (!joint || !joint.members || !joint.members.length) return;
  const ep = joint.members.find(m => m.role !== 'through') || joint.members[0];
  if (!ep || !ep.ent) return;
  if (typeof v25OpenWeldPriorityPopup === 'function') {
    v25OpenWeldPriorityPopup(ep.ent, viewKey, clientX, clientY);
  }
}

// ============================================================
