'use strict';

// HBS Plate screw entity — placed on canvas as the head-end view (typical for
// elevation drawings where the screw is driven into the page).
// Added 2026-05-18 for the timber-screw connection feature.
// See dev/feature-timber-screws/02-data-model.md §2.3 for the schema.
//
// type: 'screw'
// Fields:
//   u, v          — position of the screw head (view-local mm)
//   screwSpec     — catalogue key from HBS_PLATE_SCREWS (e.g. 'HBSPL12200')
//   connectionId  — reference to a Connection entity (null = unattached;
//                   set in Phase 3 when Connection workflow is built)
//   layer, lw, ls — standard drawing properties
//
// Rendering convention: end-on view. Outer circle = head diameter dK; inner
// circle (slightly inset) = clearance hole in the steel plate dV_steel; a
// Torx-bit "X" or "+" mark at the head centre cues the bit type (TX40/TX50).
// This mirrors the bolt-head rendering in 33-draw-bolt.js (elevation branch).


function mkScrewEnt(viewKey, props) {
  const defaults = {
    u: 0, v: 0,
    screwSpec: (typeof DEFAULT_SCREW_SPEC === 'string') ? DEFAULT_SCREW_SPEC : 'HBSPL12200',
    connectionId: null,
    layer: 'screws',
    lw: 0.35,
    ls: 'solid'
  };
  return mkEnt2D(viewKey, 'screw', Object.assign({}, defaults, props || {}));
}


function drawScrewEnt(blk, ent, cs) {
  const pm = ppm();
  const visLW = Math.max(0.5, LW.VIS * pm);
  const hidLW = Math.max(0.25, LW.HID * pm);

  // Resolve catalogue spec (defaults to HBSPL12200 if missing — defensive)
  const spec = (typeof getScrewSpec === 'function')
             ? getScrewSpec(ent.screwSpec)
             : (typeof HBS_PLATE_SCREWS === 'object' ? HBS_PLATE_SCREWS[ent.screwSpec] : null);
  // Fall back to representative Ø12 geometry if spec lookup fails (UI won't break)
  const d   = spec ? spec.d   : 12;
  const dK  = spec ? spec.dK  : 18.5;
  const dV  = spec ? spec.dV_steel : 14.0;
  const bit = spec ? spec.bit : 'TX50';

  // Pixel radii (the existing pattern in drawBolt elevation branch — uses
  // viewport.zoom / drawingScale to translate real-world mm to pixels)
  const headR = (dK / 2) * viewport.zoom / drawingScale;
  const holeR = (dV / 2) * viewport.zoom / drawingScale;
  const shankR = (d / 2)  * viewport.zoom / drawingScale;

  const col = cs.getPropertyValue('--screw-color').trim()
           || cs.getPropertyValue('--entity-color').trim();

  const p = real2px(blk, ent.u, ent.v);
  ctx.setLineDash([]);

  // 1. Outer head circle (filled lightly, stroked medium)
  ctx.strokeStyle = col;
  ctx.lineWidth = visLW;
  ctx.beginPath();
  ctx.arc(p.x, p.y, headR, 0, Math.PI * 2);
  ctx.fillStyle = colorAlpha(col, 0.18);
  ctx.fill();
  ctx.stroke();

  // 2. Steel-plate clearance hole (inner circle, dashed-thin — the hole the
  //    head sits over in the plate; visible if the plate hole is larger than dK).
  if (Math.abs(dV - dK) > 0.5) {
    ctx.lineWidth = hidLW;
    ctx.setLineDash(DASH.HIDDEN);
    ctx.beginPath();
    ctx.arc(p.x, p.y, holeR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 3. Shank diameter circle (inner ring — represents the screw shank passing
  //    through the plate, hidden behind the head in this view)
  ctx.strokeStyle = colorAlpha(col, 0.5);
  ctx.lineWidth = hidLW;
  ctx.setLineDash(DASH.HIDDEN);
  ctx.beginPath();
  ctx.arc(p.x, p.y, shankR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // 4. Bit indicator — small X for TX-style head (Torx)
  //    Drawn at half the head radius so it stays inside the head outline
  const bitR = headR * 0.45;
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(0.4, LW.VIS * pm * 0.7);
  const cos45 = Math.SQRT1_2;
  ctx.beginPath();
  ctx.moveTo(p.x - bitR * cos45, p.y - bitR * cos45);
  ctx.lineTo(p.x + bitR * cos45, p.y + bitR * cos45);
  ctx.moveTo(p.x - bitR * cos45, p.y + bitR * cos45);
  ctx.lineTo(p.x + bitR * cos45, p.y - bitR * cos45);
  ctx.stroke();
}


// Hit-test radius (in view-local mm) — used by selection / drag. For now we
// just use the head radius from the catalogue; if no spec, default to 10 mm.
function screwHitRadius(ent) {
  const spec = (typeof getScrewSpec === 'function')
             ? getScrewSpec(ent.screwSpec) : null;
  return spec ? spec.dK / 2 : 10;
}


// AABB bounds (in view-local mm). Used by marquee select.
function screwBounds(ent) {
  const r = screwHitRadius(ent);
  return { uMin: ent.u - r, uMax: ent.u + r,
           vMin: ent.v - r, vMax: ent.v + r };
}
