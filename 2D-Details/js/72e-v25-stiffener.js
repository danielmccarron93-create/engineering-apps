'use strict';
/* ============================================================
   72e-v25-stiffener.js — V25 2D web stiffener (stiff2 entity)
   plate-grouping-stiffener build.

   A `stiff2` is a full-depth (by default) web stiffener plate drawn
   between the inner flange faces of a horizontal beam, centred on a
   column's centreline. 10 mm thick by default, fillet-welded both
   long edges. Modelled as two endpoints so a Shift-drag of an end can
   slant it (ortho/vertical is the default).

     stiff2 = { id, type:'stiff2', view,
                uTop, vTop,   top end point (world mm)    — beam top-flange inner face by default,
                uBot, vBot,   bottom end point (world mm)  — beam bottom-flange inner face by default,
                thk:  10, weld:'both'|'none',
                hostId: <beam mem2 id|null>, groupId:<gid|null> }

   Tool id: 'v25-stiffener'. Wired in 69-v25-dispatch.js:
     - v25DrawEnt         → drawStiff2D
     - v25TryHandleClick  → v25-stiffener → v25PlaceStiffener
   Preview wired in 38-crosshair.js (drawClickPreview) → v25PreviewStiffener.
   Live select + end-drag wired via 71-v25-selection.js delegating to the
   v25Stiff* helpers exported here (v25StiffBounds / v25StiffGrips /
   v25StiffApplyGrip).

   Every external global it reaches for is typeof-guarded so a missing
   global never throws — same convention as the rest of the v25 tree.
   `cs` (when passed) is a CSSStyleDeclaration; the canvas ctx is the
   global `ctx`, px-per-mm is the global ppm() — same contract as
   drawBolt2D / drawMem2D.
   ============================================================ */
(function () {

  var STIFF_DEFAULT_THK = 10;          // mm
  var SNAP_TOL_PX       = 14;          // column-centreline snap catch (screen px)

  /* ---- small geometry / scale helpers ------------------------------- */

  function num(n, d) { return (typeof n === 'number' && isFinite(n)) ? n : (d === undefined ? 0 : d); }

  function ppmm() {
    var zoom = (typeof viewport !== 'undefined' && viewport && typeof viewport.zoom === 'number') ? viewport.zoom : 1;
    var scale = (typeof drawingScale === 'number' && drawingScale) ? drawingScale : 10;
    return zoom / scale;
  }
  function pxToMM(px) { return px / Math.max(1e-6, ppmm()); }

  function entsOf(vk) {
    return (typeof entities2D !== 'undefined' && entities2D && Array.isArray(entities2D[vk])) ? entities2D[vk] : [];
  }

  // {d, tf} for an I-section or channel mem2 (UB / UC / WB / PFC) from the steel
  // catalogue, else null. These are the members with a clear top + bottom flange
  // to stiffen between; hollow / angle sections (SHS/RHS/CHS/EA/UA) return null so
  // the tool won't place on them. Keyed by memberType, with a section-name
  // fallback so a member whose memberType is unset still resolves. (PFC is
  // symmetric about its depth centreline like an I-section — see drawMem2D's
  // pfc branch, T=hd / B=-hd — so the inner-flange-face span carries over.)
  function beamDims(ent) {
    if (!ent || ent.type !== 'mem2') return null;
    var mt = ent.memberType, sec = ent.section, dbs = null;
    if      (mt === 'ub'  && typeof UB_DB  === 'object' && UB_DB)  dbs = UB_DB[sec];
    else if (mt === 'uc'  && typeof UC_DB  === 'object' && UC_DB)  dbs = UC_DB[sec];
    else if (mt === 'wb'  && typeof WB_DB  === 'object' && WB_DB)  dbs = WB_DB[sec];
    else if (mt === 'pfc' && typeof PFC_DB === 'object' && PFC_DB) dbs = PFC_DB[sec];
    if (!dbs && sec) {
      dbs = (typeof UB_DB  === 'object' && UB_DB  && UB_DB[sec])
         || (typeof UC_DB  === 'object' && UC_DB  && UC_DB[sec])
         || (typeof WB_DB  === 'object' && WB_DB  && WB_DB[sec])
         || (typeof PFC_DB === 'object' && PFC_DB && PFC_DB[sec]) || null;
    }
    if (!dbs) return null;
    return { d: num(dbs.d, 0), tf: num(dbs.tf, 0) };
  }

  function deg(r) { return r * Math.PI / 180; }
  function isHorizontalMem(ent) {
    if (!ent || ent.type !== 'mem2') return false;
    var c = Math.abs(Math.cos(deg(num(ent.rot, 0))));
    return c > 0.92 && num(ent.length, 0) > 0;
  }
  function isVerticalMem(ent) {
    if (!ent || ent.type !== 'mem2') return false;
    var s = Math.abs(Math.sin(deg(num(ent.rot, 0))));
    return s > 0.92 && num(ent.length, 0) > 0;
  }
  function horizSpanU(ent) {
    var u0 = num(ent.u), u1 = u0 + num(ent.length) * Math.cos(deg(num(ent.rot)));
    return [Math.min(u0, u1), Math.max(u0, u1)];
  }
  function vertCentreU(ent) { return num(ent.u); }

  /* ---- placement resolver ------------------------------------------- */
  /**
   * Resolve where a stiffener should go for a cursor at (cu,cv) in block blk.
   * Returns { u, vTop, vBot, hostId, snapX } or null if no beam is under/near
   * the cursor. When shiftHeld, X is free (cursor); otherwise X snaps to the
   * nearest column (vertical member) centreline within tolerance, else the
   * nearest such column's end if the cursor is up near a column end, else the
   * cursor X.
   */
  function resolvePlacement(blk, cu, cv, shiftHeld) {
    if (!blk) return null;
    var ents = entsOf(blk.viewKey);

    // 1) Host beam: nearest horizontal member whose depth band straddles cv
    //    and whose length span contains cu.
    var beam = null, beamScore = Infinity;
    for (var i = 0; i < ents.length; i++) {
      var e = ents[i];
      if (!isHorizontalMem(e)) continue;
      var dims = beamDims(e);
      if (!dims || dims.d <= 0) continue;
      var clV = num(e.v);
      var halfD = dims.d / 2;
      var band = halfD + pxToMM(40);
      if (Math.abs(cv - clV) > band) continue;
      var sp = horizSpanU(e);
      if (cu < sp[0] - pxToMM(40) || cu > sp[1] + pxToMM(40)) continue;
      var score = Math.abs(cv - clV);
      if (score < beamScore) { beamScore = score; beam = { ent: e, dims: dims, clV: clV, halfD: halfD }; }
    }
    if (!beam) return null;

    var tf = beam.dims.tf;
    var vTop = beam.clV + beam.halfD - tf;
    var vBot = beam.clV - beam.halfD + tf;

    // 2) X position. Default = cursor; snap to nearest column centreline.
    var x = cu, snapX = false;
    if (!shiftHeld) {
      var tolMM = pxToMM(SNAP_TOL_PX), bestU = null, bestD = tolMM;
      for (var j = 0; j < ents.length; j++) {
        var c = ents[j];
        if (!isVerticalMem(c)) continue;
        var d = Math.abs(cu - vertCentreU(c));
        if (d < bestD) { bestD = d; bestU = vertCentreU(c); }
      }
      if (bestU != null) { x = bestU; snapX = true; }
    }
    var sp2 = horizSpanU(beam.ent);
    if (x < sp2[0]) x = sp2[0];
    if (x > sp2[1]) x = sp2[1];

    return { u: x, vTop: vTop, vBot: vBot, hostId: beam.ent.id, snapX: snapX };
  }

  /* ---- geometry: the 4 corners of the (possibly slanted) plate ------- */
  function stiffCorners(ent) {
    var uT = num(ent.uTop), vT = num(ent.vTop), uB = num(ent.uBot), vB = num(ent.vBot);
    var thk = num(ent.thk, STIFF_DEFAULT_THK);
    var ax = uT - uB, av = vT - vB;
    var len = Math.hypot(ax, av);
    var px = 0, py = 0;
    if (len > 1e-6) { px = -av / len; py = ax / len; }     // unit perpendicular
    var h = thk / 2;
    return {
      bl: { u: uB - px * h, v: vB - py * h },
      br: { u: uB + px * h, v: vB + py * h },
      tr: { u: uT + px * h, v: vT + py * h },
      tl: { u: uT - px * h, v: vT - py * h },
    };
  }

  // RENDER-ONLY corners: identical to stiffCorners but with the half-thickness
  // inflated so the on-screen strip is never thinner than MIN_PLATE_PX. Used by
  // the draw + preview paths only — hit-test/bounds/grips keep the true ent.
  var MIN_PLATE_PX = 2.0;          // never collapse the drawn strip below this
  function buildRenderCorners(ent, ppm) {
    var thkMM = num(ent.thk, STIFF_DEFAULT_THK);
    var thkEffMM = Math.max(thkMM, MIN_PLATE_PX / Math.max(1e-6, ppm));
    return stiffCorners({ uTop: num(ent.uTop), vTop: num(ent.vTop),
                          uBot: num(ent.uBot), vBot: num(ent.vBot), thk: thkEffMM });
  }

  /* ---- rendering ----------------------------------------------------- */
  function entColor() {
    try {
      return getComputedStyle(document.documentElement).getPropertyValue('--entity-color').trim() || '#222';
    } catch (e) { return '#222'; }
  }

  function pathQuad(context, blk, c) {
    var bl = real2px(blk, c.bl.u, c.bl.v), br = real2px(blk, c.br.u, c.br.v);
    var tr = real2px(blk, c.tr.u, c.tr.v), tl = real2px(blk, c.tl.u, c.tl.v);
    context.beginPath();
    context.moveTo(bl.x, bl.y); context.lineTo(br.x, br.y);
    context.lineTo(tr.x, tr.y); context.lineTo(tl.x, tl.y); context.closePath();
    return { bl: bl, br: br, tr: tr, tl: tl };
  }

  // AS 1100 steel hatch: 45° lines clipped to the plate quad.
  function hatchQuad(context, pxc, ppm, color, wPx) {
    context.save();
    context.beginPath();
    context.moveTo(pxc.bl.x, pxc.bl.y); context.lineTo(pxc.br.x, pxc.br.y);
    context.lineTo(pxc.tr.x, pxc.tr.y); context.lineTo(pxc.tl.x, pxc.tl.y);
    context.closePath();
    context.clip();
    var minX = Math.min(pxc.bl.x, pxc.tl.x, pxc.br.x, pxc.tr.x);
    var maxX = Math.max(pxc.bl.x, pxc.tl.x, pxc.br.x, pxc.tr.x);
    var minY = Math.min(pxc.bl.y, pxc.tl.y, pxc.br.y, pxc.tr.y);
    var maxY = Math.max(pxc.bl.y, pxc.tl.y, pxc.br.y, pxc.tr.y);
    // AS 1100 steel hatch spacing — screen-anchored (≥ 11 px, growing when zoomed
    // in) so the 45° lines read as distinct strokes, not a dense black fill. A
    // stiffener is a thin plate, so deliberately open hatching: close lines just
    // smear to solid. (wPx accepted for signature stability; not used here.)
    var step = Math.max(11, 7.0 * ppm);
    if (!isFinite(step) || step <= 0) step = 11;
    context.strokeStyle = color;
    context.lineWidth = Math.max(0.4, (typeof LW !== 'undefined' ? LW.HATCH : 0.18) * ppm);
    var span = (maxX - minX) + (maxY - minY);
    if (!isFinite(span) || span <= 0) { context.restore(); return; }
    var guard = 0;
    for (var o = 0; o <= span && guard < 2000; o += step, guard++) {
      context.beginPath();
      context.moveTo(minX + o, minY);
      context.lineTo(minX + o - (maxY - minY), maxY);
      context.stroke();
    }
    context.restore();
  }

  // Fillet weld ticks along one long edge p0→p1, offset toward dirSign·perp.
  function weldAlong(context, p0, p1, perpX, perpY, dirSign, ppm, color, wPx) {
    var dx = p1.x - p0.x, dy = p1.y - p0.y;
    var len = Math.hypot(dx, dy);
    if (!isFinite(len) || len <= 0) return;
    var w = (typeof wPx === 'number' && isFinite(wPx) && wPx > 0) ? wPx : 2;
    // Too small for ticks to read — draw none rather than a dotted line.
    if (len < 12 || w < 1.2) return;
    var ux = dx / len, uy = dy / len;
    // Tick leg clamped so it never swamps a ~2px plate, never explodes when zoomed in.
    var legPx = Math.max(2.5, Math.min(5, 0.9 * w + 2.5));
    context.strokeStyle = color;
    context.lineWidth = Math.max(0.8, (typeof LW !== 'undefined' ? LW.DIM : 0.40) * ppm);
    // Evenly spaced, count-capped ticks: ≥2 on a short edge, ≤8 on a long one.
    var n = Math.max(2, Math.min(8, Math.round(len / Math.max(8, 5 * ppm))));
    var gap = len / n;
    for (var k = 0; k <= n; k++) {
      var d = k * gap;
      var bx = p0.x + ux * d, by = p0.y + uy * d;
      context.beginPath();
      context.moveTo(bx, by);
      // short fillet tick: out along perp + a little along the edge
      context.lineTo(bx + dirSign * perpX * legPx + ux * legPx * 0.4,
                     by + dirSign * perpY * legPx + uy * legPx * 0.4);
      context.stroke();
    }
  }

  function drawStiff2D(blk, ent, cs) {
    if (!ent || ent.view !== blk.viewKey) return;
    var context = (typeof ctx !== 'undefined' && ctx) ? ctx : null;
    if (!context) return;
    var ppm = ppmm();
    var color = (cs && typeof cs.getPropertyValue === 'function')
      ? (cs.getPropertyValue('--entity-color').trim() || entColor())
      : entColor();

    // On-screen plate width drives the min-width guard + weld-tick sizing.
    var thkMM = num(ent.thk, STIFF_DEFAULT_THK);
    var wPx = thkMM * ppm;                 // true on-screen plate width in px
    // Render quad uses the min-width-inflated thickness (geometry/grips keep true ent).
    var c = buildRenderCorners(ent, ppm);
    var wDrawPx = Math.max(wPx, MIN_PLATE_PX);   // px width actually drawn

    context.save();
    var pxc = pathQuad(context, blk, c);
    // Infill: AS 1100 steel cross-hatch, OFF by default. Opt in per stiffener
    // (double-click → Steel hatch) or via the tool options bar. No solid fill —
    // the min-width outline keeps a thin plate readable without a black bar.
    if (ent.hatch === true) {
      hatchQuad(context, pxc, ppm, color, wDrawPx);
    }
    // outline (visible edge — LW.VIS) stroked over the infill so edges stay crisp.
    // Re-path the quad first: the hatch branch leaves the last hatch line as the
    // current path (hatchQuad's restore() doesn't reset it), so stroking without
    // this would stroke a stray hatch segment instead of the plate outline.
    pathQuad(context, blk, c);
    context.strokeStyle = color;
    context.lineWidth = Math.max(0.8, (typeof LW !== 'undefined' ? LW.VIS : 0.65) * ppm);
    context.stroke();
    // welds along both long edges (bl→tl on the −perp side, br→tr on the +perp side)
    if (ent.weld !== 'none') {
      // perpendicular direction in screen px (top edge minus bottom edge → axis; perp from quad)
      var axx = pxc.tl.x - pxc.bl.x, axy = pxc.tl.y - pxc.bl.y;
      var al = Math.hypot(axx, axy) || 1;
      var perpX = -axy / al, perpY = axx / al;
      weldAlong(context, pxc.bl, pxc.tl, perpX, perpY, -1, ppm, color, wDrawPx);
      weldAlong(context, pxc.br, pxc.tr, perpX, perpY, +1, ppm, color, wDrawPx);
    }
    context.restore();
  }

  /* ---- live preview (cursor ghost) ---------------------------------- */
  function v25PreviewStiffener(blk, cu, cv) {
    var context = (typeof ctx !== 'undefined' && ctx) ? ctx : null;
    if (!context) return;
    var shiftHeld = (typeof window !== 'undefined' && window.shiftHeld === true);
    var pl = resolvePlacement(blk, cu, cv, shiftHeld);
    if (!pl) return;
    var ppm = ppmm(), color = entColor();
    var ghost = { uTop: pl.u, vTop: pl.vTop, uBot: pl.u, vBot: pl.vBot, thk: STIFF_DEFAULT_THK };
    // Same min-width-guarded render quad as the committed entity, so the ghost has real proportions.
    var c = buildRenderCorners(ghost, ppm);
    context.save();
    context.globalAlpha = 0.55;
    pathQuad(context, blk, c);
    context.setLineDash([6, 4]);
    context.strokeStyle = color;
    context.lineWidth = Math.max(0.8, (typeof LW !== 'undefined' ? LW.VIS : 0.65) * ppm);
    context.stroke();
    context.setLineDash([]);
    if (pl.snapX) {
      var pT = real2px(blk, pl.u, pl.vTop), pB = real2px(blk, pl.u, pl.vBot);
      context.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--selected-color').trim() || '#3a7';
      context.lineWidth = 1;
      context.beginPath(); context.moveTo(pT.x, pT.y - 8); context.lineTo(pB.x, pB.y + 8); context.stroke();
    }
    context.restore();
  }

  /* ---- placement (click) -------------------------------------------- */
  function v25PlaceStiffener(blk, cu, cv, e) {
    var shiftHeld = !!(e && e.shiftKey) || (typeof window !== 'undefined' && window.shiftHeld === true);
    var pl = resolvePlacement(blk, cu, cv, shiftHeld);
    if (!pl) { if (typeof setStatus === 'function') setStatus('Stiffener: hover over a beam to place'); return true; }
    if (typeof v25Add !== 'function') return true;
    // Honour the quick-options-bar defaults (Thickness / Weld both sides), else
    // fall back to 10 mm / welded — see js/72-v25-options-bar.js v25-stiffener.
    var thk = (typeof v25Last !== 'undefined' && v25Last && v25Last.stiffThk) ? v25Last.stiffThk : STIFF_DEFAULT_THK;
    // Weld ticks AND hatch are both OFF by default — a stiffener reads as a clean
    // plate. The weld-tick representation is non-standard (a real stiffener weld
    // is a weld symbol, not ticks along the edge), so it's opt-in like the hatch:
    // tick "Weld both sides" / "Steel hatch" in the options bar or the double-click
    // properties popup (persisted on v25Last.stiffWeld / stiffHatch).
    var weld = (typeof v25Last !== 'undefined' && v25Last && v25Last.stiffWeld === true) ? 'both' : 'none';
    var hatch = (typeof v25Last !== 'undefined' && v25Last && v25Last.stiffHatch === true);
    var ent = v25Add('stiff2', {
      uTop: pl.u, vTop: pl.vTop, uBot: pl.u, vBot: pl.vBot,
      thk: thk, weld: weld, hatch: hatch, hostId: pl.hostId,
    });
    if (typeof v25State !== 'undefined' && v25State) v25State.tool = null;
    if (typeof setTool === 'function') setTool('select');
    if (typeof v25Selected !== 'undefined') v25Selected = [ent.id];
    if (typeof v25UpdateInspector === 'function') v25UpdateInspector();
    if (typeof v25UpdateOptionsBar === 'function') v25UpdateOptionsBar();
    if (typeof setStatus === 'function') setStatus('Stiffener placed — drag an end to shorten (Shift = angle)');
    if (typeof requestRender === 'function') requestRender();
    return true;
  }

  /* ---- selection-pipeline helpers (called from 71-v25-selection.js) -- */

  // AABB in world-mm (for hit-test + highlight box).
  function v25StiffBounds(ent) {
    if (!ent || ent.type !== 'stiff2') return null;
    var c = stiffCorners(ent);
    var us = [c.bl.u, c.br.u, c.tr.u, c.tl.u], vs = [c.bl.v, c.br.v, c.tr.v, c.tl.v];
    return { L: Math.min.apply(null, us), R: Math.max.apply(null, us),
             B: Math.min.apply(null, vs), T: Math.max.apply(null, vs) };
  }

  // Drag handles: the two end points (+ a body handle at the mid-point).
  function v25StiffGrips(ent) {
    if (!ent || ent.type !== 'stiff2') return [];
    return [
      { handle: 'stiff-top', u: num(ent.uTop), v: num(ent.vTop) },
      { handle: 'stiff-bot', u: num(ent.uBot), v: num(ent.vBot) },
      { handle: 'body', u: (num(ent.uTop) + num(ent.uBot)) / 2, v: (num(ent.vTop) + num(ent.vBot)) / 2 },
    ];
  }

  // Apply a drag (du,dv) for the given handle. End handles move orthogonally
  // (vertical only) by default; Shift lets the end move in X too (slant).
  function v25StiffApplyGrip(ent, du, dv, handle, shiftHeld) {
    if (!ent) return;
    if (handle === 'body') {
      ent.uTop = num(ent.uTop) + du; ent.vTop = num(ent.vTop) + dv;
      ent.uBot = num(ent.uBot) + du; ent.vBot = num(ent.vBot) + dv;
      return;
    }
    if (handle === 'stiff-top') {
      ent.vTop = num(ent.vTop) + dv; if (shiftHeld) ent.uTop = num(ent.uTop) + du;
      return;
    }
    if (handle === 'stiff-bot') {
      ent.vBot = num(ent.vBot) + dv; if (shiftHeld) ent.uBot = num(ent.uBot) + du;
      return;
    }
  }

  /* ---- double-click properties popup -------------------------------- */
  // Mirrors v25OpenEndCapPopup (68-v25-tools.js): a small fixed-position panel
  // with the per-stiffener settings — Thickness, Weld both sides, and the
  // Steel-hatch toggle. Edits mutate the entity live (no undo entry, same as the
  // end-cap popup) and persist the choice to v25Last so the next placement
  // inherits it. Opened from the 2D-mode dblclick handler in 39-events.js.
  var _stiffPopup = null;
  function closeStiffPopup() {
    if (_stiffPopup && _stiffPopup.parentNode) _stiffPopup.parentNode.removeChild(_stiffPopup);
    _stiffPopup = null;
    document.removeEventListener('mousedown', stiffPopupOutside, true);
    document.removeEventListener('keydown', stiffPopupKey, true);
  }
  function stiffPopupOutside(e) { if (_stiffPopup && !_stiffPopup.contains(e.target)) closeStiffPopup(); }
  function stiffPopupKey(e) { if (e.key === 'Escape') closeStiffPopup(); }

  function v25OpenStiffPopup(ent, clientX, clientY) {
    if (!ent || ent.type !== 'stiff2') return false;
    closeStiffPopup();
    var pop = document.createElement('div');
    pop.style.cssText = 'position:fixed;z-index:1700;min-width:200px;padding:9px 11px;display:flex;flex-direction:column;gap:8px;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;box-shadow:var(--shadow-md, 0 4px 16px rgba(0,0,0,.18));font:12px var(--font-sans, system-ui);color:var(--text)';
    document.body.appendChild(pop);
    var W = 220, H = 150;
    pop.style.left = Math.min(clientX + 12, window.innerWidth  - W - 8) + 'px';
    pop.style.top  = Math.min(clientY + 12, window.innerHeight - H - 8) + 'px';
    _stiffPopup = pop;
    var curThk = num(ent.thk, STIFF_DEFAULT_THK);
    var opts = [6, 8, 10, 12, 16, 20].map(function (t) {
      return '<option value="' + t + '"' + (t === curThk ? ' selected' : '') + '>' + t + ' mm</option>';
    }).join('');
    var rowCss = 'display:flex;align-items:center;justify-content:space-between;gap:10px';
    pop.innerHTML =
      '<div style="font-weight:700;font-size:10px;letter-spacing:.06em;color:var(--text-mute);text-transform:uppercase">Stiffener</div>'
      + '<label style="' + rowCss + '">Thickness'
      + '<select id="v25st-thk" style="padding:3px 6px;border:1px solid var(--border);border-radius:4px;background:var(--surface-2);color:var(--text);font:12px system-ui">' + opts + '</select></label>'
      + '<label style="' + rowCss + '">Weld both sides'
      + '<input id="v25st-weld" type="checkbox"' + (ent.weld !== 'none' ? ' checked' : '') + '></label>'
      + '<label style="' + rowCss + '">Steel hatch'
      + '<input id="v25st-hatch" type="checkbox"' + (ent.hatch === true ? ' checked' : '') + '></label>';
    var selThk  = pop.querySelector('#v25st-thk');
    var cbWeld  = pop.querySelector('#v25st-weld');
    var cbHatch = pop.querySelector('#v25st-hatch');
    selThk.addEventListener('change', function () {
      ent.thk = parseInt(selThk.value) || STIFF_DEFAULT_THK;
      if (typeof v25Last !== 'undefined' && v25Last) v25Last.stiffThk = ent.thk;
      if (typeof requestRender === 'function') requestRender();
    });
    cbWeld.addEventListener('change', function () {
      ent.weld = cbWeld.checked ? 'both' : 'none';
      if (typeof v25Last !== 'undefined' && v25Last) v25Last.stiffWeld = cbWeld.checked;
      if (typeof requestRender === 'function') requestRender();
    });
    cbHatch.addEventListener('change', function () {
      ent.hatch = !!cbHatch.checked;
      if (typeof v25Last !== 'undefined' && v25Last) v25Last.stiffHatch = ent.hatch;
      if (typeof requestRender === 'function') requestRender();
    });
    setTimeout(function () {
      document.addEventListener('mousedown', stiffPopupOutside, true);
      document.addEventListener('keydown', stiffPopupKey, true);
    }, 0);
    return true;
  }

  /* ---- exports ------------------------------------------------------- */
  window.drawStiff2D          = drawStiff2D;
  window.v25PreviewStiffener  = v25PreviewStiffener;
  window.v25PlaceStiffener    = v25PlaceStiffener;
  window.v25StiffBounds       = v25StiffBounds;
  window.v25StiffGrips        = v25StiffGrips;
  window.v25StiffApplyGrip    = v25StiffApplyGrip;
  window.v25OpenStiffPopup    = v25OpenStiffPopup;

})();
