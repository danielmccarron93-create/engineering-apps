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

function invalidateV25JointCache() { _v25JointCacheDirty = true; _v25JointCache = {}; }

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
function _computeEndCutV25(M, jointInfo, sign) {
  const len = M.length || 0;
  if (len < 1) return null;
  const jointX = sign > 0 ? len : 0;

  const allOtherMembers = jointInfo.joint.members.filter(m => m.ent.id !== M.id);

  // If THIS member is the priority winner for any pair at this joint, it
  // runs through unchanged — no cut at all (neither mitre nor butt). Bail
  // before considering anything else.
  if (jointInfo.role !== 'through') {
    for (const m of allOtherMembers) {
      const k = _v25PairKey(M.id, m.ent.id);
      if (priorityForPairV25[k] === M.id) return null;
    }
  }

  // Pick the dominant priority neighbour for THIS pair, if the user has set
  // one explicitly via the joint menu. Fall back to "no override". Equal-
  // priority endpoint-to-endpoint pairs default to mitre — see below.
  let priorityNeighbour = null;
  if (jointInfo.role !== 'through') {
    for (const m of allOtherMembers) {
      const k = _v25PairKey(M.id, m.ent.id);
      const winnerId = priorityForPairV25[k];
      if (winnerId != null && winnerId !== M.id) { priorityNeighbour = m; break; }
    }
  }

  // Through-chord neighbours (joint at mid-span of another member). The chord
  // always wins regardless of user choice, because trimming it would require
  // splitting a member that has no endpoint at this joint.
  const throughs = allOtherMembers.filter(m => m.role === 'through');

  // Endpoint-to-endpoint partner for the default mitre. If exactly one
  // non-through neighbour shares this node, mitre against it. With three or
  // more (truss apex), default to no cut so the user can pick a priority via
  // the menu — mitring three centrelines is geometrically ambiguous.
  const endpointNeighbours = allOtherMembers.filter(m => m.role !== 'through');
  let mitrePartner = null;
  if (jointInfo.role !== 'through' && !priorityNeighbour && endpointNeighbours.length === 1) {
    mitrePartner = endpointNeighbours[0];
  }
  // Legacy mitre flag still honours pair-level mitre choice in multi-member
  // nodes (so the existing 3-member apex workflow keeps working when the user
  // explicitly checked "Mitre #5 ↔ #7" in older saves).
  if (!mitrePartner && jointInfo.role !== 'through' && !priorityNeighbour) {
    for (const m of endpointNeighbours) {
      const k = _v25PairKey(M.id, m.ent.id);
      if (mitrePairs[k]) { mitrePartner = m; break; }
    }
  }

  // Combine: priority neighbour and through chords cut the body; mitre is the
  // alternative. If none apply, no cut.
  const cutters = [];
  if (priorityNeighbour) cutters.push(priorityNeighbour);
  for (const t of throughs) cutters.push(t);
  if (!mitrePartner && !cutters.length) return null;

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

  return {
    uAtV: (y) => {
      // Per-v most-restrictive across all cutters. Initialise from the
      // dominant cutter's first value so a single-cutter case returns the
      // line's uAtV(y) verbatim — including extensions past the original
      // end face (negative u for end A, u > len for end B).
      let best = lines[0].uAtV(y);
      for (let i = 1; i < lines.length; i++) {
        const u = lines[i].uAtV(y);
        if (sign > 0) { if (u < best) best = u; }
        else          { if (u > best) best = u; }
      }
      return best;
    },
    isMitre: false,
    weldSize,
  };
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
    if (ji.role === 'end-1' && !a) a = _computeEndCutV25(ent, ji, -1);
    else if (ji.role === 'end+1' && !b) b = _computeEndCutV25(ent, ji, +1);
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

// V25 popup — small floating menu at cursor with two options:
//   • Mitre joint           (default for two endpoints meeting)
//   • Pick member priority  (next click sets the through-member; the other
//                            gets butt-cut at the priority's outer face)
function showJointPopupV25(joint, clientX, clientY, viewKey) {
  closeJointPopup();
  const div = document.createElement('div');
  div.id = 'shsJointPopup';
  div.style.cssText = `
    position: fixed; left: ${clientX + 8}px; top: ${clientY + 6}px;
    background: var(--surface-2, #1e1e2e); border: 1px solid var(--border, #444);
    border-radius: 6px; padding: 4px 0; z-index: 999;
    font: 12px var(--font-sans, system-ui); color: var(--text, #ddd);
    box-shadow: var(--shadow-pop, 0 4px 16px rgba(0,0,0,0.4)); min-width: 200px;
  `;
  document.body.appendChild(div);
  _shsJointPopup = div;
  _renderJointPopupV25(div, joint, viewKey);
  document.removeEventListener('mousedown', _jointPopupOutsideClick);
  setTimeout(() => {
    document.addEventListener('mousedown', _jointPopupOutsideClick);
  }, 50);
}

function _renderJointPopupV25(div, joint, viewKey) {
  invalidateV25JointCache();
  const fresh = computeShsJointsV25(viewKey);
  let liveJoint = joint;
  let bestD = Infinity;
  for (const j of fresh) {
    const dx = j.point.u - joint.point.u, dy = j.point.v - joint.point.v;
    const d = Math.hypot(dx, dy);
    if (d < bestD) { bestD = d; liveJoint = j; }
  }
  joint = liveJoint;

  // Endpoint members at this joint (through-chords aren't choosable as
  // priority — they're already "winning" by definition).
  const endpointMembers = joint.members.filter(m => m.role !== 'through');

  // Detect current state. If any pair at this joint has an explicit priority
  // entry, treat the joint as "priority"; otherwise mitre.
  let currentPriorityId = null;
  for (let i = 0; i < endpointMembers.length && !currentPriorityId; i++) {
    for (let j = i + 1; j < endpointMembers.length && !currentPriorityId; j++) {
      const k = _v25PairKey(endpointMembers[i].ent.id, endpointMembers[j].ent.id);
      if (priorityForPairV25[k] != null) currentPriorityId = priorityForPairV25[k];
    }
  }
  const isMitre = currentPriorityId == null;

  const itemStyle = `display:flex; align-items:center; gap:8px; width:100%; padding:8px 12px; background:transparent; color:inherit; border:none; cursor:pointer; text-align:left; font:inherit; box-sizing:border-box;`;
  const tickHTML = (selected) => selected
    ? '<span style="display:inline-block; width:14px; color:var(--accent, #c0392b); text-align:center;">✓</span>'
    : '<span style="display:inline-block; width:14px;">&nbsp;</span>';
  const subLabel = currentPriorityId != null ? ` <span style="opacity:0.55; font-size:11px;">#${currentPriorityId}</span>` : '';

  div.innerHTML = `
    <button id="sjMitre"   type="button" style="${itemStyle}">${tickHTML(isMitre)}<span>Mitre joint</span></button>
    <button id="sjPickPri" type="button" style="${itemStyle}">${tickHTML(!isMitre)}<span>Pick member priority${subLabel}</span></button>
  `;

  // Hover affordance — done in JS so it picks up the live theme variable.
  for (const btn of div.querySelectorAll('button')) {
    btn.addEventListener('mouseenter', () => { btn.style.background = 'var(--surface-3, #333)'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent'; });
  }

  div.querySelector('#sjMitre').addEventListener('click', () => {
    // Clear any priority entries between any pair of endpoint members at this
    // joint — restoring the default mitre behaviour.
    for (let i = 0; i < endpointMembers.length; i++) {
      for (let j = i + 1; j < endpointMembers.length; j++) {
        delete priorityForPairV25[_v25PairKey(endpointMembers[i].ent.id, endpointMembers[j].ent.id)];
      }
    }
    closeJointPopup();
    if (typeof invalidateWeldCache === 'function') invalidateWeldCache();
    if (typeof requestRender === 'function') requestRender();
  });

  div.querySelector('#sjPickPri').addEventListener('click', () => {
    closeJointPopup();
    _v25EnterPickPriority(joint, viewKey);
  });
}

// ---- Transient "pick the priority member" mode ----
// Triggered from the joint menu. The next canvas click chooses which member
// of the joint runs through unchanged; the other member(s) get butt-cut at
// that priority's outer face. Esc cancels.
let _v25PickPriorityCleanup = null;
function _v25EnterPickPriority(joint, viewKey) {
  if (_v25PickPriorityCleanup) _v25PickPriorityCleanup();
  if (typeof toast === 'function') toast('Click the priority member (Esc to cancel)', 3000);

  const endpointMembers = joint.members.filter(m => m.role !== 'through');
  if (endpointMembers.length < 2) return;

  const onClick = (e) => {
    if (!canvas) return;
    if (e.target !== canvas) return; // ignore clicks on UI chrome
    e.preventDefault();
    e.stopPropagation();
    cleanup();
    const blk = activeBlock;
    if (!blk) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const real = (typeof px2real === 'function') ? px2real(blk, px, py) : null;
    if (!real) return;
    // Find which endpoint-member at this joint the click is closest to —
    // distance from click to the member's centreline (in real-world mm).
    let bestId = null, bestDist = Infinity;
    for (const m of endpointMembers) {
      const ent = (entities2D[viewKey] || []).find(x => x && x.id === m.ent.id);
      if (!ent) continue;
      const rot = (ent.rot || 0) * Math.PI / 180;
      const len = ent.length || 0;
      const ax = ent.u, ay = ent.v;
      const bx = ent.u + Math.cos(rot) * len, by = ent.v + Math.sin(rot) * len;
      const dx = bx - ax, dy = by - ay;
      const lenSq = dx * dx + dy * dy;
      let t = lenSq < 1e-9 ? 0 : ((real.u - ax) * dx + (real.v - ay) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
      const cu = ax + t * dx, cv = ay + t * dy;
      const d = Math.hypot(real.u - cu, real.v - cv);
      if (d < bestDist) { bestDist = d; bestId = ent.id; }
    }
    if (bestId == null) return;
    // Set this member as priority over every other endpoint member at the
    // joint (handles 2-member L-corners and N-member apexes consistently).
    for (const m of endpointMembers) {
      if (m.ent.id === bestId) continue;
      priorityForPairV25[_v25PairKey(bestId, m.ent.id)] = bestId;
    }
    if (typeof invalidateWeldCache === 'function') invalidateWeldCache();
    if (typeof requestRender === 'function') requestRender();
    if (typeof toast === 'function') toast(`Priority: #${bestId}`, 1500);
  };

  const onKey = (e) => {
    if (e.key === 'Escape') {
      cleanup();
      if (typeof toast === 'function') toast('Cancelled', 1000);
    }
  };

  const cleanup = () => {
    document.removeEventListener('mousedown', onClick, true);
    document.removeEventListener('keydown', onKey, true);
    _v25PickPriorityCleanup = null;
  };
  _v25PickPriorityCleanup = cleanup;
  // Capture phase so we beat the V25 select handler on the next click.
  document.addEventListener('mousedown', onClick, true);
  document.addEventListener('keydown', onKey, true);
}

// ============================================================
