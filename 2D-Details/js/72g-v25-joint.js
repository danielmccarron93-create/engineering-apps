'use strict';
/* ============================================================
   72g-v25-joint.js — end-plate ↔ member-flange joint (weld / bolt / none)
   plate-grouping-stiffener build.

   When a grouped {column + end-plate} assembly is dropped onto a beam, the
   end-plate snaps flush to the beam's flange outer face and the contact
   becomes a JOINT. By default the joint is bare (no weld) — you would not
   shop-weld an end plate onto a beam it is about to be bolted to. The user
   then double-clicks / right-clicks the joint to choose:

       None  ·  Weld together  ·  Bolt together

   - Weld  → a 'jweld' v25 entity: fillet ticks along the plate↔flange line.
   - Bolt  → two real bolt2 entities, one each side of the column, 50 mm from
             the column face to the bolt centre, vertical (v-nutB), gripped
             through plate + flange.

   Joint state lives on the v2 plate's params (round-trips via v2 serialise):
       plate.params.flange = {
         memberId,   // the beam (v25 mem2) the plate sits on
         columnId,   // the in-group column (v25 mem2) — bolt datum
         mode,       // 'none' | 'weld' | 'bolt'
         jweldId,    // id of the 'jweld' entity in 'weld' mode
         boltIds,    // [id,id] of the bolt2 entities in 'bolt' mode
         edgeV,      // world V of the contact line (flange outer face)
       }
   The weld / bolt entities also carry jointPlateId + groupId so they move
   with the assembly and are removed when the mode changes.

   All cross-file globals are typeof-guarded — a missing global never throws.
   ============================================================ */
(function () {

  var BOLT_EDGE_MM = 50;     // bolt centre 50 mm outside the column face
  var SNAP_TOL_PX  = 16;     // flange-snap catch (screen px) on drop
  var HIT_TOL_PX   = 12;     // joint pick tolerance (screen px)

  /* ---- helpers ------------------------------------------------------ */
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

  function deg(r) { return r * Math.PI / 180; }
  function isHorizontalMem(e) { return e && e.type === 'mem2' && Math.abs(Math.cos(deg(num(e.rot)))) > 0.92 && num(e.length) > 0; }
  function isVerticalMem(e)   { return e && e.type === 'mem2' && Math.abs(Math.sin(deg(num(e.rot)))) > 0.92 && num(e.length) > 0; }

  function beamDims(e) {
    if (!e || !e.section) return null;
    var d = null;
    if (typeof UB_DB !== 'undefined' && UB_DB && UB_DB[e.section]) d = UB_DB[e.section];
    else if (typeof UC_DB !== 'undefined' && UC_DB && UC_DB[e.section]) d = UC_DB[e.section];
    else if (typeof WB_DB !== 'undefined' && WB_DB && WB_DB[e.section]) d = WB_DB[e.section];
    if (!d) return null;
    return { d: num(d.d), tf: num(d.tf), bf: num(d.bf), tw: num(d.tw) };
  }
  function shsHalf(e) {
    if (!e || !e.section) return 50;
    var d = (typeof SHS_DB !== 'undefined' && SHS_DB && SHS_DB[e.section]) ? SHS_DB[e.section]
          : (typeof RHS_DB !== 'undefined' && RHS_DB && RHS_DB[e.section]) ? RHS_DB[e.section] : null;
    if (d && d.B) return d.B / 2;
    if (d && d.D) return d.D / 2;
    return 50;
  }

  function eachV2Plate(fn) {
    var model = window.v2 && v2.appState && v2.appState.model;
    if (!model || !(model.elements instanceof Map)) return;
    model.elements.forEach(function (el) {
      if (el && el.category === 'plate' && el.params && el.params.v2Source === 'place-plate-tool') fn(el);
    });
  }

  function plateBBoxWorld(el) {
    var poly = el && el.geometry && el.geometry.polygon;
    if (!Array.isArray(poly) || !poly.length) return null;
    var L = Infinity, R = -Infinity, B = Infinity, T = -Infinity;
    for (var i = 0; i < poly.length; i++) {
      var x = num(poly[i].x), y = num(poly[i].y);
      if (x < L) L = x; if (x > R) R = x; if (y < B) B = y; if (y > T) T = y;
    }
    return { L: L, R: R, B: B, T: T };
  }
  function plateViewKey(el) {
    var vid = el && el.geometry && el.geometry.viewId;
    var m = (typeof vid === 'string') ? /^v1-view-(.+)$/.exec(vid) : null;
    return m ? m[1] : null;
  }

  /* ---- flange faces of a horizontal beam (world V) ------------------ */
  function beamFlangeFaces(beam) {
    var dims = beamDims(beam);
    if (!dims) return null;
    return {
      topOuter: num(beam.v) + dims.d / 2,
      botOuter: num(beam.v) - dims.d / 2,
      tf: dims.tf,
      spanU: [Math.min(num(beam.u), num(beam.u) + num(beam.length) * Math.cos(deg(num(beam.rot)))),
              Math.max(num(beam.u), num(beam.u) + num(beam.length) * Math.cos(deg(num(beam.rot))))],
    };
  }

  /* ============================================================
     PHASE 3 — snap a dropped group's end-plate flush to a beam flange
     ============================================================ */
  // Called on group-move release. For each plate in the group, find the
  // nearest NON-group horizontal beam flange face that the plate's near edge
  // is close to; compute ONE correction delta and apply it to EVERY group
  // member (so the assembly stays rigid). Records the joint on the plate.
  function snapGroupToFlange(gid) {
    if (!gid) return false;
    // group members
    var groupEnts = [], groupPlates = [], colMember = null;
    entsAll().forEach(function (e) { if (e.groupId === gid) { groupEnts.push(e); if (isVerticalMem(e)) colMember = e; } });
    eachV2Plate(function (el) { if (el.params && el.params.groupId === gid) groupPlates.push(el); });
    if (!groupPlates.length) return false;

    var tolMM = pxToMM(SNAP_TOL_PX);
    var best = null;   // { dvSnap, beam, plate, edgeV }
    var vk = activeViewKey();

    groupPlates.forEach(function (pl) {
      if (plateViewKey(pl) !== vk) return;
      var bb = plateBBoxWorld(pl); if (!bb) return;
      entsOf(vk).forEach(function (beam) {
        if (!isHorizontalMem(beam) || beam.groupId === gid) return;   // skip group's own members
        var f = beamFlangeFaces(beam); if (!f) return;
        // plate horizontal extent must overlap the beam span
        if (bb.R < f.spanU[0] || bb.L > f.spanU[1]) return;
        // plate dropped from ABOVE → its bottom edge meets the top-flange outer face
        var dTop = f.topOuter - bb.B;                 // +ve = plate above face
        if (Math.abs(dTop) <= tolMM && (!best || Math.abs(dTop) < Math.abs(best.dvSnap))) {
          best = { dvSnap: dTop, beam: beam, plate: pl, edgeV: f.topOuter };
        }
        // plate dropped from BELOW → its top edge meets the bottom-flange outer face
        var dBot = f.botOuter - bb.T;
        if (Math.abs(dBot) <= tolMM && (!best || Math.abs(dBot) < Math.abs(best.dvSnap))) {
          best = { dvSnap: dBot, beam: beam, plate: pl, edgeV: f.botOuter };
        }
      });
    });

    if (!best) return false;

    // Apply the single correction to every group member so it stays rigid.
    if (best.dvSnap && typeof window.v25TranslateGroupMates === 'function') {
      window.v25TranslateGroupMates(gid, 0, best.dvSnap, null, null);
    }
    // Record / preserve the joint on the plate (default mode 'none').
    var pl = best.plate;
    if (!pl.params) pl.params = {};
    var prev = pl.params.flange || {};
    pl.params.flange = {
      memberId: best.beam.id,
      columnId: colMember ? colMember.id : (prev.columnId || null),
      mode: prev.mode || 'none',
      jweldId: prev.jweldId || null,
      boltIds: prev.boltIds || [],
      edgeV: best.edgeV,
    };
    // Re-apply the joint's weld/bolt at the new position if it had one.
    if (pl.params.flange.mode === 'weld') applyJoint(pl, 'weld');
    else if (pl.params.flange.mode === 'bolt') applyJoint(pl, 'bolt');
    if (window.v2 && v2.engine && v2.engine.dirtyBus) v2.engine.dirtyBus.emit('model-changed');
    if (typeof requestRender === 'function') requestRender();
    if (typeof setStatus === 'function') setStatus('End plate snapped to flange — choose weld, bolt or none');
    // plate-grouping-stiffener follow-up — on FIRST registration of this joint
    // (default mode 'none', no weld), auto-open the connection menu at the
    // contact line so the user immediately picks weld / bolt / none.
    if (!prev.mode) openMenuForPlate(pl);
    return true;
  }

  function entsAll() {
    var out = [];
    if (typeof entities2D === 'undefined' || !entities2D) return out;
    for (var vk in entities2D) if (Object.prototype.hasOwnProperty.call(entities2D, vk)) {
      var a = entities2D[vk]; if (Array.isArray(a)) for (var i = 0; i < a.length; i++) if (a[i] && !a[i]._v2Mirror) out.push(a[i]);
    }
    return out;
  }
  function activeViewKey() { return (typeof activeBlock !== 'undefined' && activeBlock) ? activeBlock.viewKey : 'elevation'; }

  /* ============================================================
     PHASE 4 — joint pick + menu + apply (none / weld / bolt)
     ============================================================ */

  // Find a plate whose recorded flange joint line is near (cu,cv).
  function jointAt(blk, cu, cv) {
    if (!blk) return null;
    var tolMM = pxToMM(HIT_TOL_PX);
    var hit = null;
    eachV2Plate(function (pl) {
      if (plateViewKey(pl) !== blk.viewKey) return;
      var fj = pl.params && pl.params.flange;
      if (!fj) return;
      var bb = plateBBoxWorld(pl); if (!bb) return;
      var edgeV = num(fj.edgeV, bb.B);
      // near the contact line, within the plate's horizontal extent
      if (cu >= bb.L - tolMM && cu <= bb.R + tolMM && Math.abs(cv - edgeV) <= Math.max(tolMM, (bb.T - bb.B))) {
        var member = memberById(fj.memberId);
        hit = { plate: pl, member: member, fj: fj, edgeV: edgeV, bb: bb };
      }
    });
    return hit;
  }

  function memberById(id) {
    if (id == null) return null;
    var found = null;
    entsAll().forEach(function (e) { if (e.id === id) found = e; });
    return found;
  }

  /* ---- weld + bolt entity lifecycle -------------------------------- */
  function removeJointEntities(pl) {
    var fj = pl.params && pl.params.flange; if (!fj) return;
    var vk = plateViewKey(pl);
    var arr = entsOf(vk);
    if (fj.jweldId != null) {
      for (var i = arr.length - 1; i >= 0; i--) if (arr[i].id === fj.jweldId) arr.splice(i, 1);
      fj.jweldId = null;
    }
    if (Array.isArray(fj.boltIds) && fj.boltIds.length) {
      var del = {}; fj.boltIds.forEach(function (id) { del[id] = true; });
      for (var j = arr.length - 1; j >= 0; j--) if (del[arr[j].id]) arr.splice(j, 1);
      fj.boltIds = [];
    }
  }

  function applyJoint(pl, mode) {
    if (!pl || !pl.params || !pl.params.flange) return;
    var fj = pl.params.flange;
    removeJointEntities(pl);
    fj.mode = mode;
    var vk = plateViewKey(pl);
    var bb = plateBBoxWorld(pl);
    var edgeV = num(fj.edgeV, bb ? bb.B : 0);
    var gid = pl.params.groupId || null;

    if (mode === 'weld' && bb) {
      var w = mkEntInView(vk, 'jweld', {
        u1: bb.L, v1: edgeV, u2: bb.R, v2: edgeV,
        size: 6, jointPlateId: pl.id, groupId: gid,
      });
      fj.jweldId = w.id;
    } else if (mode === 'bolt') {
      var col = memberById(fj.columnId);
      var beam = memberById(fj.memberId);
      var colU = col ? num(col.u) : (bb ? (bb.L + bb.R) / 2 : 0);
      var half = col ? shsHalf(col) : 0;
      var plateThk = num(pl.params.thickness, 12);
      var tf = beam ? num((beamDims(beam) || {}).tf, 12) : 12;
      // bolt vertical, head up / nut bottom; grip through plate + flange.
      var grip = plateThk + tf;
      // bolt centre V = mid of the plate+flange stack about the contact line.
      var midV = edgeV + (plateThk - tf) / 2;
      var ids = [];
      [-1, +1].forEach(function (sgn) {
        var bu = colU + sgn * (half + BOLT_EDGE_MM);
        var b = mkEntInView(vk, 'bolt2', {
          u: bu, v: midV,
          size: (typeof lastBoltSize !== 'undefined' && lastBoltSize) || 'M20',
          grade: (typeof lastBoltGrade !== 'undefined' && lastBoltGrade) || '8.8',
          cat: (typeof lastBoltCat !== 'undefined' && lastBoltCat) || 'S',
          boltOrient: 'v-nutB', rot: 0,
          gripOverride: grip,
          jointPlateId: pl.id, groupId: gid,
        });
        if (typeof computeBoltLength === 'function') b.length = computeBoltLength(grip, b.size);
        ids.push(b.id);
      });
      fj.boltIds = ids;
    }
    if (typeof requestRender === 'function') requestRender();
  }

  // Create a v25 entity in a specific view (not necessarily activeBlock).
  function mkEntInView(vk, type, props) {
    var ent;
    if (typeof mkEnt2D === 'function') ent = mkEnt2D(vk, type, Object.assign({ _v25: true }, props));
    else ent = Object.assign({ id: Date.now() + Math.floor(Math.random() * 1e6), type: type, view: vk, _v25: true }, props);
    if (typeof addEnt2D === 'function') addEnt2D(ent);
    else if (entities2D[vk]) entities2D[vk].push(ent);
    return ent;
  }

  /* ---- the joint menu ---------------------------------------------- */
  var menuEl = null;
  function closeMenu() { if (menuEl && menuEl.parentNode) menuEl.parentNode.removeChild(menuEl); menuEl = null; }

  function showMenu(hit, clientX, clientY) {
    closeMenu();
    var pl = hit.plate, member = hit.member;
    var fj = hit.fj;
    var items = [
      { label: (fj.mode === 'weld' ? '✓ ' : '') + 'Weld together', fn: function () { applyJoint(pl, 'weld'); } },
      { label: (fj.mode === 'bolt' ? '✓ ' : '') + 'Bolt together (2/' + ((typeof lastBoltSize !== 'undefined' && lastBoltSize) || 'M20') + ')', fn: function () { applyJoint(pl, 'bolt'); } },
      { label: (fj.mode === 'none' ? '✓ ' : '') + 'No connection', fn: function () { applyJoint(pl, 'none'); } },
    ];
    var m = document.createElement('div');
    m.className = 'v25-ctx-menu';
    m.style.cssText = 'position:fixed;z-index:9999;background:var(--surface-2,#f5f0e6);' +
      'color:var(--text,#2a241f);border:1px solid var(--sheet-border,#b8ac8e);border-radius:6px;' +
      'box-shadow:0 4px 16px rgba(0,0,0,.35);padding:4px;min-width:200px;font:13px system-ui;' +
      'left:' + clientX + 'px;top:' + clientY + 'px;';
    var hdr = document.createElement('div');
    hdr.textContent = 'Plate ↔ ' + ((member && member.section) || 'flange') + ' joint';
    hdr.style.cssText = 'padding:6px 12px;opacity:.6;font-size:11px;text-transform:uppercase;letter-spacing:.04em;';
    m.appendChild(hdr);
    items.forEach(function (it) {
      var b = document.createElement('div');
      b.textContent = it.label;
      b.style.cssText = 'padding:7px 12px;border-radius:4px;cursor:pointer;white-space:nowrap;';
      b.addEventListener('mouseenter', function () { b.style.background = 'var(--accent,#3a6ea5)'; b.style.color = 'var(--accent-ink,#fff)'; });
      b.addEventListener('mouseleave', function () { b.style.background = 'transparent'; b.style.color = ''; });
      b.addEventListener('mousedown', function (ev) { ev.preventDefault(); ev.stopPropagation(); it.fn(); closeMenu(); });
      m.appendChild(b);
    });
    document.body.appendChild(m);
    menuEl = m;
    // plate-grouping-stiffener follow-up — close on an OUTSIDE click only.
    // Was a capture-phase pointerdown that fired before the item's mousedown
    // and detached the menu, so Weld/Bolt/None never ran. Now a guarded
    // capture mousedown: clicks inside the menu are ignored (the item's own
    // mousedown runs the action + closes), clicks outside close it.
    setTimeout(function () {
      window.addEventListener('mousedown', function _jClose(ev) {
        if (menuEl && menuEl.contains(ev.target)) return;
        closeMenu();
      }, { once: true, capture: true });
    }, 0);
  }

  // Entry point for right-click / double-click. Returns true if a joint menu
  // was shown (so the caller can stop the group menu / default behaviour).
  function tryMenu(blk, cu, cv, clientX, clientY) {
    var hit = jointAt(blk, cu, cv);
    if (!hit) return false;
    showMenu(hit, clientX, clientY);
    return true;
  }

  // plate-grouping-stiffener follow-up — programmatically open the joint menu
  // for a plate right after a grouped flange drop. Converts the contact-line
  // midpoint (world u,v) to client px so showMenu positions the popup there.
  function openMenuForPlate(pl) {
    if (!pl) return;
    var vk = plateViewKey(pl);
    var blk = null;
    if (typeof activeBlock !== 'undefined' && activeBlock && activeBlock.viewKey === vk) blk = activeBlock;
    else if (typeof blocks !== 'undefined' && Array.isArray(blocks)) {
      for (var i = 0; i < blocks.length; i++) if (blocks[i] && blocks[i].viewKey === vk) { blk = blocks[i]; break; }
    }
    if (!blk) return;
    var fj = pl.params && pl.params.flange; if (!fj) return;
    var bb = plateBBoxWorld(pl); if (!bb) return;
    var midU = (bb.L + bb.R) / 2;
    var midV = num(fj.edgeV, bb.B);
    var hit = jointAt(blk, midU, midV);
    if (!hit) hit = { plate: pl, member: memberById(fj.memberId), fj: fj, edgeV: midV, bb: bb };
    var clientX = 0, clientY = 0;
    if (typeof real2px === 'function') {
      var p = real2px(blk, midU, midV);
      var rect = (typeof canvas !== 'undefined' && canvas && canvas.getBoundingClientRect)
        ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
      clientX = rect.left + p.x;
      clientY = rect.top + p.y + 10;   // just below the contact line
    }
    // Defer a tick so the drop's own pointerup doesn't immediately close the menu.
    setTimeout(function () { showMenu(hit, clientX, clientY); }, 0);
  }

  /* ---- rendering: 'jweld' fillet ticks ------------------------------ */
  function drawJWeld2D(blk, ent, cs) {
    if (!ent || ent.view !== blk.viewKey) return;
    var context = (typeof window.ctx !== 'undefined' && window.ctx) ? window.ctx : null;
    if (!context) return;
    var ppm = (typeof window.ppm === 'function') ? window.ppm() : ppmm();
    var color = (cs && typeof cs.getPropertyValue === 'function')
      ? (cs.getPropertyValue('--entity-color').trim() || '#222') : '#222';
    var p0 = real2px(blk, num(ent.u1), num(ent.v1));
    var p1 = real2px(blk, num(ent.u2), num(ent.v2));
    var dx = p1.x - p0.x, dy = p1.y - p0.y;
    var len = Math.hypot(dx, dy); if (!isFinite(len) || len <= 0) return;
    var ux = dx / len, uy = dy / len;
    var perpX = -uy, perpY = ux;        // both fillet welds drawn on the column side (+perp = up here)
    var legPx = 4 * ppm;
    var tickPx = 3 * ppm; if (!isFinite(tickPx) || tickPx < 4) tickPx = 4;
    context.save();
    context.strokeStyle = color;
    context.lineWidth = Math.max(1, (typeof LW !== 'undefined' ? LW.thin : 0.18) * ppm);
    var d = 0, guard = 0;
    while (d <= len && guard < 2000) {
      var bx = p0.x + ux * d, by = p0.y + uy * d;
      // small fillet triangle: out along +perp (toward plate) and back along edge
      context.beginPath();
      context.moveTo(bx, by);
      context.lineTo(bx + perpX * legPx, by + perpY * legPx);
      context.lineTo(bx + ux * legPx, by + uy * legPx);
      context.stroke();
      d += tickPx; guard++;
    }
    context.restore();
  }

  function v25JWeldBounds(ent) {
    if (!ent || ent.type !== 'jweld') return null;
    return { L: Math.min(num(ent.u1), num(ent.u2)) - 6, R: Math.max(num(ent.u1), num(ent.u2)) + 6,
             B: Math.min(num(ent.v1), num(ent.v2)) - 6, T: Math.max(num(ent.v1), num(ent.v2)) + 6 };
  }

  /* ---- exports ------------------------------------------------------ */
  window.drawJWeld2D            = drawJWeld2D;
  window.v25JWeldBounds         = v25JWeldBounds;
  window.v25JointSnapGroupToFlange = snapGroupToFlange;
  window.v25JointTryMenu        = tryMenu;
  window.v25JointApply          = applyJoint;
  window.v25JointAt             = jointAt;

})();
