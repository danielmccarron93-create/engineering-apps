'use strict';

// Timber-screw entity — placed on canvas as the head-end view (typical for
// elevation drawings where the screw is driven into the page).
// Added 2026-05-18 for the timber-screw connection feature (HBS Plate);
// extended 2026-06-10 with the Rothoblaas VGS fully-threaded family — same
// 'screw' entity type, the spec id picks the family ('HBSPL…' = HBS,
// 'VGS…' = VGS; getScrewSpec in 02e resolves across both catalogues).
// See PlannedBuilds/timber-screws/02-data-model.md §2.3 for the schema.
//
// type: 'screw'
// Fields:
//   u, v          — position of the screw head (view-local mm)
//   screwSpec     — catalogue key from HBS_PLATE_SCREWS / VGS_SCREWS
//                   (e.g. 'HBSPL12200', 'VGS11300')
//   connectionId  — reference to a Connection entity (null = unattached;
//                   set in Phase 3 when Connection workflow is built)
//   layer, lw, ls — standard drawing properties
//
// Rendering convention: end-on view, exact catalogue diameters.
//   HBS:     outer circle = head dK; inner dashed circle = steel clearance hole
//            dV_steel; dashed shank circle d; TX bit "X" at centre.
//   VGS csk: outer circle = head dK (filled); inner SOLID-thin circle = dIn,
//            where the 90° countersink cone ends; TX bit "X".
//   VGS hex: washer-flange circle dFl (filled) + hexagon at SW across-flats on
//            top (flat-up); TX bit "X".
// This mirrors the bolt-head rendering in 33-draw-bolt.js (elevation branch).
// Section/side views live in 72i-v25-screw.js (drawScrew2D_Section / VGS).


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

  // Resolve catalogue spec across both families (HBS 02c / VGS 02j via 02e)
  const spec = (typeof getScrewSpec === 'function')
             ? getScrewSpec(ent.screwSpec)
             : (typeof HBS_PLATE_SCREWS === 'object' ? HBS_PLATE_SCREWS[ent.screwSpec] : null);

  const col = cs.getPropertyValue('--screw-color').trim()
           || cs.getPropertyValue('--entity-color').trim();

  const p = real2px(blk, ent.u, ent.v);
  ctx.setLineDash([]);

  // VGS routes to its own head-on drawer (csk ribs head / hex + flange). An
  // unresolvable VGS-shaped id still routes VGS so the glyph never flips family.
  const isVgs = (spec && spec.system === 'rothoblaas-vgs')
             || (!spec && typeof isVgsSpec === 'function' && isVgsSpec(ent.screwSpec));
  if (isVgs) {
    drawVgsEntEnd(p, spec, col, pm, visLW, hidLW);
    return;
  }

  // ---- HBS path (unchanged) ----
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


// VGS head-on view (called from drawScrewEnt when the spec is VGS-family).
// Exact catalogue diameters; representative Ø11 csk fallback if the spec is
// missing so the UI never breaks.
//   csk: outer head circle dK (filled, like HBS) + inner circle dIn (solid
//        thin — the edge where the 90° countersink cone ends) + TX bit mark.
//   hex: integral washer-flange circle dFl (filled) + hexagon at SW
//        across-flats on top (flat-up) + TX bit mark.
function drawVgsEntEnd(p, spec, col, pm, visLW, hidLW) {
  const mmpx = viewport.zoom / drawingScale;
  const hex = !!(spec && spec.headType === 'hex');

  ctx.strokeStyle = col;
  ctx.lineWidth = visLW;
  ctx.fillStyle = colorAlpha(col, 0.18);

  let bitR;  // px — radius the TX "X" is drawn at
  if (hex) {
    const dFl = spec.dFl || 15.1;
    const SW  = spec.SW  || 17;
    // 1. Integral washer flange (filled circle, stroked medium)
    ctx.beginPath();
    ctx.arc(p.x, p.y, (dFl / 2) * mmpx, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // 2. Hex head on top — SW across-flats, flat-up (vertices at k·60° put the
    //    flats top and bottom). Circumradius from across-flats: R = SW/√3.
    const R = (SW / Math.sqrt(3)) * mmpx;
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3;
      const x = p.x + R * Math.cos(a), y = p.y + R * Math.sin(a);
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();   // double 0.18 fill over the flange — the hex reads on top
    ctx.stroke();
    bitR = (SW / 2) * mmpx * 0.45;
  } else {
    const dK  = spec ? spec.dK  : 19.3;   // representative Ø11 csk fallback
    const dIn = spec ? spec.dIn : 10.58;
    // 1. Outer head circle (filled lightly, stroked medium — mirrors HBS)
    const headR = (dK / 2) * mmpx;
    ctx.beginPath();
    ctx.arc(p.x, p.y, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // 2. Inner-head circle dIn — where the 90° countersink cone ends (solid thin)
    ctx.lineWidth = hidLW;
    ctx.beginPath();
    ctx.arc(p.x, p.y, (dIn / 2) * mmpx, 0, Math.PI * 2);
    ctx.stroke();
    bitR = headR * 0.45;
  }

  // 3. Bit indicator — small X for the TX drive (same mark as the HBS head)
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


// Hit-test radius (in view-local mm) — used by selection / drag. Widest end-on
// feature: csk/HBS head dK; VGS hex = max(across-flats SW, flange dFl) — hex
// specs carry no dK. If no spec, default to 10 mm.
function screwHitRadius(ent) {
  const spec = (typeof getScrewSpec === 'function')
             ? getScrewSpec(ent.screwSpec) : null;
  if (!spec) return 10;
  const dia = spec.dK || Math.max(spec.SW || 0, spec.dFl || 0) || 20;
  return dia / 2;
}


// AABB bounds (in view-local mm). Used by marquee select.
function screwBounds(ent) {
  const r = screwHitRadius(ent);
  return { uMin: ent.u - r, uMax: ent.u + r,
           vMin: ent.v - r, vMax: ent.v + r };
}
