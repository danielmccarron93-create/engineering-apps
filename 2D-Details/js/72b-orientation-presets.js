'use strict';

// V25 — orientation presets for 2D-mode members (orientation-presets feature).
// Replaces the Aspect dropdown + PFC Open-face dropdown in the quick-options
// bar (72-v25-options-bar.js) with a row of icon buttons, one per standard
// orientation for the active member type. Each preset is a pure transform of
// { aspect, rot, openSide? } written into v25State at placement time — the
// renderer (drawMem2D in 68-v25-tools.js) already honours all three fields via
// its project() helper, so no renderer change is needed for the geometry.
//
// Loaded after 72-v25-options-bar.js, before 73-init.js. v25State lives in
// 69-v25-dispatch.js; lastUsedOrientation lives in 60-tile-palette.js next to
// lastUsedSection. Both load before this file.

// ---- Orientation catalogue ----
// Keyed by member type. Each entry: { id, label, aspect, roll, icon }.
//   aspect 'elev' | 'sec' — elevation (long side view) vs cross-section glyph.
//   roll   0|90|180|270   — rotation of the cross-section about the member's
//          LONG axis (the single "axial orientation" DOF). In SECTION it spins
//          the glyph (web-vert vs web-horiz); in ELEVATION it picks the visible
//          face (UB web vs flange · RHS deep vs flat · PFC toes away vs toward).
//          The on-paper drag angle is a SEPARATE field (ent.rot), set during
//          placement — never written by a preset.
//   icon   sprite symbol id — the authored icon-orient-* orientation glyphs in
//          index.html's SVG sprite (single-stroke, AS 1100 hidden-line dashes).
// UC and WB share the I-section shape with UB → same four-set.
// PFC roll convention (verified against the renderer, which rotates the C-glyph
// CCW): section 0 = toes right, 90 = toes up, 180 = toes left, 270 = toes down.
// Elevation 0 = toes away (flange roots solid), 180 = toes toward (dashed).
// EA / UA deferred to v1.x (canonical orientation count to be confirmed).
const V25_ORIENT = {
  ub: [
    { id: 'elev-web',     label: 'Elevation — web face',     aspect: 'elev', roll: 0,  icon: 'icon-orient-i-elev-web' },
    { id: 'elev-flange',  label: 'Elevation — flange face',  aspect: 'elev', roll: 90, icon: 'icon-orient-i-elev-flange' },
    { id: 'sec-web-vert', label: 'Section — web vertical',   aspect: 'sec',  roll: 0,  icon: 'icon-orient-i-sec-v' },
    { id: 'sec-web-horz', label: 'Section — web horizontal', aspect: 'sec',  roll: 90, icon: 'icon-orient-i-sec-h' },
  ],
  uc: [
    { id: 'elev-web',     label: 'Elevation — web face',     aspect: 'elev', roll: 0,  icon: 'icon-orient-i-elev-web' },
    { id: 'elev-flange',  label: 'Elevation — flange face',  aspect: 'elev', roll: 90, icon: 'icon-orient-i-elev-flange' },
    { id: 'sec-web-vert', label: 'Section — web vertical',   aspect: 'sec',  roll: 0,  icon: 'icon-orient-i-sec-v' },
    { id: 'sec-web-horz', label: 'Section — web horizontal', aspect: 'sec',  roll: 90, icon: 'icon-orient-i-sec-h' },
  ],
  wb: [
    { id: 'elev-web',     label: 'Elevation — web face',     aspect: 'elev', roll: 0,  icon: 'icon-orient-i-elev-web' },
    { id: 'elev-flange',  label: 'Elevation — flange face',  aspect: 'elev', roll: 90, icon: 'icon-orient-i-elev-flange' },
    { id: 'sec-web-vert', label: 'Section — web vertical',   aspect: 'sec',  roll: 0,  icon: 'icon-orient-i-sec-v' },
    { id: 'sec-web-horz', label: 'Section — web horizontal', aspect: 'sec',  roll: 90, icon: 'icon-orient-i-sec-h' },
  ],
  pfc: [
    { id: 'elev-toes-away',   label: 'Elevation — toes away',   aspect: 'elev', roll: 0,   icon: 'icon-orient-pfc-elev-away' },
    { id: 'elev-toes-toward', label: 'Elevation — toes toward', aspect: 'elev', roll: 180, icon: 'icon-orient-pfc-elev-toward' },
    { id: 'sec-toes-right',   label: 'Section — toes right',    aspect: 'sec',  roll: 0,   icon: 'icon-orient-pfc-sec-right' },
    { id: 'sec-toes-up',      label: 'Section — toes up',       aspect: 'sec',  roll: 90,  icon: 'icon-orient-pfc-sec-up' },
    { id: 'sec-toes-left',    label: 'Section — toes left',     aspect: 'sec',  roll: 180, icon: 'icon-orient-pfc-sec-left' },
    { id: 'sec-toes-down',    label: 'Section — toes down',     aspect: 'sec',  roll: 270, icon: 'icon-orient-pfc-sec-down' },
  ],
  // SHS is biaxial-symmetric — one elevation + one section (roll is cosmetic).
  shs: [
    { id: 'elev', label: 'Elevation', aspect: 'elev', roll: 0, icon: 'icon-orient-shs-elev' },
    { id: 'sec',  label: 'Section',   aspect: 'sec',  roll: 0, icon: 'icon-orient-shs-sec' },
  ],
  // RHS aspect ratio matters: deep face vs flat face in elevation, on-edge vs
  // lay-flat in section.
  rhs: [
    { id: 'elev-deep',    label: 'Elevation — deep face', aspect: 'elev', roll: 0,  icon: 'icon-orient-rhs-elev-deep' },
    { id: 'elev-flat',    label: 'Elevation — flat face', aspect: 'elev', roll: 90, icon: 'icon-orient-rhs-elev-flat' },
    { id: 'sec-on-edge',  label: 'Section — on edge',     aspect: 'sec',  roll: 0,  icon: 'icon-orient-rhs-edge' },
    { id: 'sec-lay-flat', label: 'Section — lay flat',    aspect: 'sec',  roll: 90, icon: 'icon-orient-rhs-flat' },
  ],
  chs: [
    { id: 'elev', label: 'Elevation', aspect: 'elev', roll: 0, icon: 'icon-orient-chs-elev' },
    { id: 'sec',  label: 'Section',   aspect: 'sec',  roll: 0, icon: 'icon-orient-chs-sec' },
  ],
  // ea, ua — deferred to v1.x (confirm canonical orientation count first).
};

// ---- State mutation ----
// Pure mutator: writes the preset's aspect/rot/openSide into v25State and
// records it as the last-used orientation for this type. No side effects (no
// render, no bar rebuild) so callers that already rebuild/render — e.g.
// v25SetMember — can apply a remembered orientation without double work.
// Returns true if the preset was found and applied.
function v25ApplyOrientation(memberType, presetId) {
  const presets = V25_ORIENT[memberType] || [];
  const p = presets.find(function (x) { return x.id === presetId; });
  if (!p) return false;
  if (typeof v25State === 'undefined') return false;
  v25State.aspect = p.aspect;
  v25State.roll = p.roll || 0;
  // ent.rot is the on-paper drag angle, set by the placement path — never by a
  // preset. openSide is derived from roll by the renderer, so it isn't written
  // here either. roll is the single source of truth for axial orientation.
  if (typeof lastUsedOrientation !== 'undefined') lastUsedOrientation[memberType] = presetId;
  return true;
}

// Interactive setter — used by the orientation-row buttons. Applies the preset
// then refreshes the options bar (so the active-button highlight moves) and
// kicks a render (so the cross-section cursor ghost updates immediately).
function v25SetOrientation(memberType, presetId) {
  if (!v25ApplyOrientation(memberType, presetId)) return;
  if (typeof v25UpdateOptionsBar === 'function') v25UpdateOptionsBar();
  if (typeof requestRender === 'function') requestRender();
}

// Rotate the placement orientation by one 90° step — advance to the next
// preset of the CURRENT aspect (ascending roll, wrapping). For a section this
// spins the glyph (web-vert → web-horz; PFC toes right → up → left → down);
// for an elevation it steps the face / open side. Rolls without a preset are
// skipped so the active highlight always lands on a real button. Placement-
// state only (goes through v25SetOrientation → v25State) — it never mutates a
// placed entity, so the undo stack is untouched.
function v25RotateOrientation90(memberType) {
  if (typeof v25State === 'undefined') return;
  const mt = memberType || v25State.memberType;
  if (!mt) return;
  const asp = v25State.aspect || 'elev';
  const same = (V25_ORIENT[mt] || []).filter(function (p) { return p.aspect === asp; });
  if (same.length < 2) return; // symmetric aspect (e.g. SHS/CHS) — nothing to rotate
  const sorted = same.slice().sort(function (a, b) { return (a.roll || 0) - (b.roll || 0); });
  const cur = v25State.roll || 0;
  const next = sorted.find(function (p) { return (p.roll || 0) > cur; }) || sorted[0];
  v25SetOrientation(mt, next.id);
}

// ---- Row component ----
// Returns an HTMLDivElement of icon buttons for the active member type's
// orientations. Empty <div> for a type with no presets (e.g. deferred EA/UA),
// so callers can append unconditionally.
function v25BuildOrientationRow(memberType) {
  const presets = V25_ORIENT[memberType] || [];
  const row = document.createElement('div');
  row.id = 'v25OrientRow';
  row.style.cssText = 'display:flex;gap:4px;align-items:center;flex-wrap:wrap';
  if (!presets.length) return row;

  // Which button reads as active: the remembered choice if still valid, else
  // the preset matching the current v25State (exact aspect+roll, then
  // aspect-only), else the first preset.
  let activeId = (typeof lastUsedOrientation !== 'undefined') ? lastUsedOrientation[memberType] : null;
  const valid = presets.some(function (p) { return p.id === activeId; });
  if (!valid) {
    const asp  = (typeof v25State !== 'undefined' && v25State.aspect) || 'elev';
    const roll = (typeof v25State !== 'undefined' && v25State.roll) || 0;
    const match = presets.find(function (p) { return p.aspect === asp && (p.roll || 0) === roll; })
               || presets.find(function (p) { return p.aspect === asp; })
               || presets[0];
    activeId = match.id;
  }

  presets.forEach(function (p) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'v25-orient-btn' + (p.id === activeId ? ' active' : '');
    btn.title = p.label;
    btn.setAttribute('aria-label', p.label);
    btn.innerHTML = '<svg class="icon"><use href="#' + p.icon + '"/></svg>';
    btn.addEventListener('click', function () { v25SetOrientation(memberType, p.id); });
    row.appendChild(btn);
  });

  // "Rotate 90°" affordance — cycles to the next orientation of the current
  // aspect. Only shown when an aspect is actually rotatable (≥2 presets), so
  // the symmetric SHS/CHS sections don't get a dead button.
  const rotatable = ['elev', 'sec'].some(function (a) {
    return presets.filter(function (p) { return p.aspect === a; }).length >= 2;
  });
  if (rotatable) {
    const sep = document.createElement('span');
    sep.style.cssText = 'width:1px;align-self:stretch;background:var(--border);margin:1px 2px';
    row.appendChild(sep);
    const rot = document.createElement('button');
    rot.type = 'button';
    rot.className = 'v25-orient-btn v25-orient-rotate';
    rot.title = 'Rotate 90° — cycle to the next orientation';
    rot.setAttribute('aria-label', 'Rotate orientation 90 degrees');
    rot.innerHTML = '<span style="font-size:15px;line-height:1">↻</span>';
    rot.addEventListener('click', function () { v25RotateOrientation90(memberType); });
    row.appendChild(rot);
  }
  return row;
}

// ---- Blockwork draw-mode row ----
// The blockwork analogue of the member orientation row: two icon buttons that
// switch the wall draw mode between SECTION (thin vertical strip) and ELEVATION
// (wall-face extent). Mirrors "picking a UB offers elevation vs section icons".
// Each button calls v25ArmWall, which re-arms the matching tool while keeping
// the chosen block thickness. Reuses the .v25-orient-btn styling for parity.
function v25BuildWallModeRow() {
  const modes = [
    { id: 'sec',  label: 'Section — thin vertical strip', icon: 'icon-block-sec' },
    { id: 'elev', label: 'Elevation — wall face',         icon: 'icon-block-elev' },
  ];
  const row = document.createElement('div');
  row.id = 'v25WallModeRow';
  row.style.cssText = 'display:flex;gap:4px;align-items:center';
  const active = (typeof v25Last !== 'undefined' && v25Last.wallMode) || 'sec';
  modes.forEach(function (m) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'v25-orient-btn' + (m.id === active ? ' active' : '');
    btn.title = m.label;
    btn.setAttribute('aria-label', m.label);
    btn.innerHTML = '<svg class="icon"><use href="#' + m.icon + '"/></svg>';
    btn.addEventListener('click', function () { if (typeof v25ArmWall === 'function') v25ArmWall(m.id); });
    row.appendChild(btn);
  });
  return row;
}
