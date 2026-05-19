'use strict';

// Timber connection entities — TimberMember and SteelPlate
// Added 2026-05-18 for the Rothoblaas HBS Plate timber-screw connection feature.
// See PlannedBuilds/timber-screws/02-data-model.md §2 for the schemas.
//
// Both entities live in entities2D[viewKey] alongside other paper-space entities.
// They use view-local (u, v) coordinates in real-world mm — same convention as
// the V25 'rect' entity (see 34-draw-2d.js line 39). NOT flagged with _v25 so
// they render in both 3D and 2D sheet modes (they're inherently planar, but the
// user shouldn't have to flip to 2D mode just to see them).
//
// Drawing dispatch is wired in 34-draw-2d.js by editing drawEnt2D's switch.


// ============================================================
// TIMBER MEMBER
// ============================================================
//
// type: 'timber-member'
// Fields:
//   u, v          — bottom-left corner of bounding rectangle (view-local mm)
//   w, h          — width (along +u) and height (along +v)
//   grainDir      — {u, v} unit vector in view-local coords; default = +v (long axis up)
//                   Drives every spacing/edge check in the rule engine.
//   timberClass   — catalogue key from TIMBER_CLASSES (e.g. 'GL28h', 'F17', 'MGP10')
//   sectionId     — optional reference to a TIMBER_SECTIONS preset (purely informational)
//   showTag       — optional bool; draw the size + class label inside the outline
//   layer, lw, ls — standard drawing properties (mkEnt2D adds defaults)


// Construct a TimberMember entity.
function mkTimberMember(viewKey, props) {
  const w = (props && props.w) || 200;
  const h = (props && props.h) || 600;
  const defaults = {
    u: 0, v: 0,
    w: w, h: h,
    // Default grain direction: along the long axis. Most timber elements are
    // drawn with grain running parallel to the long dimension; this is the
    // sensible default the user can override via the inspector.
    grainDir: (h >= w) ? { u: 0, v: 1 } : { u: 1, v: 0 },
    timberClass: 'GL28h',
    sectionId: null,
    showTag: true,
    layer: 'timber',
    lw: 0.5,
    ls: 'solid'
  };
  const merged = Object.assign({}, defaults, props || {});
  return mkEnt2D(viewKey, 'timber-member', merged);
}


// Draw a TimberMember.
// blk = active detail block (carries the view-to-screen transform)
// ent = the entity object (from entities2D[viewKey])
// cs  = computed style for CSS-var lookups
function drawTimberMember(blk, ent, cs) {
  const pm = ppm();
  const visLW = Math.max(0.5, LW.VIS_HEAVY * pm);

  // Colour: timber gets a warm tone if defined, otherwise fall back to entity colour
  const col   = cs.getPropertyValue('--timber-color').trim()
             || cs.getPropertyValue('--entity-color').trim();
  const muteCol = cs.getPropertyValue('--mute').trim();

  // 1. Outline rectangle (heavy visible)
  ctx.strokeStyle = col;
  ctx.lineWidth = visLW;
  ctx.setLineDash([]);
  rRect(blk, ent.u, ent.v, ent.w, ent.h);

  // 2. Light translucent fill so the outline reads as solid timber
  ctx.fillStyle = colorAlpha(col, 0.04);
  rFillRect(blk, ent.u, ent.v, ent.w, ent.h);

  // 3. Grain hatch — parallel lines along grainDir, inside the outline.
  //    Sheet spacing scales with drawingScale; ~6mm sheet spacing reads well at
  //    1:10 and stays visible at 1:5/1:20.
  drawTimberGrainHatch(blk, ent, col);

  // 4. Tag (size + class) at the centre of the member
  if (ent.showTag !== false) {
    const cx = ent.u + ent.w / 2;
    const cy = ent.v + ent.h / 2;
    const p  = real2px(blk, cx, cy);
    const fs = Math.max(7, 2.2 * pm);
    ctx.fillStyle = colorAlpha(col, 0.85);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${fs}px system-ui`;
    const sizeLabel  = `${Math.round(ent.w)}×${Math.round(ent.h)}`;
    const classLabel = ent.timberClass || '';
    ctx.fillText(sizeLabel, p.x, p.y - fs * 0.55);
    if (classLabel) {
      ctx.font = `${fs * 0.85}px system-ui`;
      ctx.fillStyle = muteCol;
      ctx.fillText(classLabel, p.x, p.y + fs * 0.55);
    }
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }
}


// Grain hatch — straight parallel lines inside the timber outline, oriented
// along the grain direction. Lines clipped to the outline rectangle.
//
// Implementation: rotate the line sweep so it's along grainDir. Spacing is in
// sheet-mm to keep the visual density consistent across zoom and scale levels.
// Uses canvas clipping to stay inside the outline.
function drawTimberGrainHatch(blk, ent, col) {
  const pm = ppm();
  const sheetSpacingMm = 6;                            // visual line density on the page
  const spacingReal = sheetSpacingMm * drawingScale;   // real-world spacing
  ctx.save();
  // Clip to outline
  ctx.beginPath();
  const bl = real2px(blk, ent.u,             ent.v);
  const br = real2px(blk, ent.u + ent.w,     ent.v);
  const tr = real2px(blk, ent.u + ent.w, ent.v + ent.h);
  const tl = real2px(blk, ent.u,         ent.v + ent.h);
  ctx.moveTo(bl.x, bl.y); ctx.lineTo(br.x, br.y);
  ctx.lineTo(tr.x, tr.y); ctx.lineTo(tl.x, tl.y); ctx.closePath();
  ctx.clip();

  ctx.strokeStyle = colorAlpha(col, 0.30);
  ctx.lineWidth   = Math.max(0.12, LW.HATCH * pm);
  ctx.setLineDash([]);

  // Grain direction (unit vector in view-local coords). Fall back to +v if absent.
  const g = ent.grainDir || { u: 0, v: 1 };
  const mag = Math.sqrt(g.u * g.u + g.v * g.v) || 1;
  const gu = g.u / mag, gv = g.v / mag;
  // Perpendicular vector (90° CCW); the sweep direction across the outline
  const pu = -gv, pv = gu;

  // Sweep a family of lines parallel to (gu, gv), offset along (pu, pv) at
  // spacingReal intervals. Cover the rectangle's diagonal to guarantee
  // we reach every part of the clipped region.
  const cx = ent.u + ent.w / 2;
  const cy = ent.v + ent.h / 2;
  const span = Math.sqrt(ent.w * ent.w + ent.h * ent.h);
  const halfSpan = span;

  for (let off = -halfSpan; off <= halfSpan; off += spacingReal) {
    const u0 = cx + pu * off - gu * span;
    const v0 = cy + pv * off - gv * span;
    const u1 = cx + pu * off + gu * span;
    const v1 = cy + pv * off + gv * span;
    rLine(blk, u0, v0, u1, v1);
  }
  ctx.restore();
}


// AABB bounds in view-local coords. Used by hit-test / marquee select.
function timberMemberBounds(ent) {
  return { uMin: ent.u, uMax: ent.u + ent.w,
           vMin: ent.v, vMax: ent.v + ent.h };
}


// Edge classifications relative to grain — useful for the Phase 4 rule engine.
// Returns an array of {id, type, normal} for the four edges:
//   'end+' / 'end-'   — perpendicular to grain (normals along ±grainDir)
//   'side+' / 'side-' — parallel to grain (normals along ±perp(grainDir))
function timberMemberEdges(ent) {
  const g = ent.grainDir || { u: 0, v: 1 };
  const mag = Math.sqrt(g.u * g.u + g.v * g.v) || 1;
  const gu = g.u / mag, gv = g.v / mag;
  const pu = -gv, pv = gu;            // perpendicular CCW

  // The four edges of the AABB, with their geometric (axis-aligned) outward
  // normals — and a classification of each as 'end' (perpendicular to grain)
  // or 'side' (parallel to grain), based on the dot product with grainDir.
  // For a non-axis-aligned grainDir, the rectangle outline still has axis-
  // aligned edges; we project to determine which face is most-end-like.
  const axEdges = [
    { id: 'bottom', normal: { u:  0, v: -1 } },
    { id: 'top',    normal: { u:  0, v:  1 } },
    { id: 'left',   normal: { u: -1, v:  0 } },
    { id: 'right',  normal: { u:  1, v:  0 } }
  ];
  return axEdges.map(function (e) {
    const dotG = e.normal.u * gu + e.normal.v * gv;
    const dotP = e.normal.u * pu + e.normal.v * pv;
    // If |dot with grain| > |dot with perp|, this is an "end" edge.
    return Object.assign({}, e,
      { type: (Math.abs(dotG) > Math.abs(dotP)) ? 'end' : 'side' });
  });
}


// ============================================================
// STEEL PLATE (purely 2D — distinct from existing 3D 'plate')
// ============================================================
//
// type: 'steel-plate'
// Fields:
//   u, v          — bottom-left corner (view-local mm)
//   w, h          — width / height
//   thickness     — S_PLATE in mm (drives Rothoblaas capacity-table lookup)
//   grade         — optional steel grade string ('350MPa', 'AS 3678-350', etc.)
//   layer, lw, ls — standard drawing properties


function mkSteelPlate(viewKey, props) {
  const defaults = {
    u: 0, v: 0,
    w: 120, h: 240,
    thickness: 10,
    grade: '350MPa',
    showTag: true,
    layer: 'steel',
    lw: 0.5,
    ls: 'solid'
  };
  return mkEnt2D(viewKey, 'steel-plate', Object.assign({}, defaults, props || {}));
}


function drawSteelPlate(blk, ent, cs) {
  const pm = ppm();
  const cutLW = Math.max(0.8, LW.CUT * pm * 0.7);

  // Colour: steel gets a cool tone if defined, otherwise the entity colour
  const col = cs.getPropertyValue('--steel-color').trim()
           || cs.getPropertyValue('--entity-color').trim();
  const muteCol = cs.getPropertyValue('--mute').trim();

  // 1. Outline (slightly heavier than timber so the plate visually pops over it)
  ctx.strokeStyle = col;
  ctx.lineWidth = cutLW;
  ctx.setLineDash([]);
  rRect(blk, ent.u, ent.v, ent.w, ent.h);

  // 2. Light fill
  ctx.fillStyle = colorAlpha(col, 0.06);
  rFillRect(blk, ent.u, ent.v, ent.w, ent.h);

  // 3. AS 1100 steel cross-hatch (cut steel convention)
  //    Reuses the existing drawCrossHatch helper from 26-as1100-hatch.js
  drawCrossHatch(blk, ent.u, ent.v, ent.w, ent.h, col);

  // 4. Tag — "PL 10" (plate thickness label)
  if (ent.showTag !== false) {
    const cx = ent.u + ent.w / 2;
    const cy = ent.v + ent.h / 2;
    const p  = real2px(blk, cx, cy);
    const fs = Math.max(7, 2.2 * pm);
    ctx.fillStyle = muteCol;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${fs}px system-ui`;
    ctx.fillText(`PL ${Math.round(ent.thickness)}`, p.x, p.y);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }
}


function steelPlateBounds(ent) {
  return { uMin: ent.u, uMax: ent.u + ent.w,
           vMin: ent.v, vMax: ent.v + ent.h };
}
