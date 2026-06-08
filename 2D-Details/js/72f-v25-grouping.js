'use strict';
/* ============================================================
   72f-v25-grouping.js — cross-system grouping for 2D mode
   plate-grouping-stiffener build.

   Lets the user select any mix of v25 entities (mem2, bolt2, weld,
   stiff2, …) AND v2 plates, then GROUP them so they move as one unit.

     - Ctrl+G  / right-click → Group       (≥2 selected items)
     - Ctrl+Shift+G / right-click → Ungroup

   A group is just a shared id stamped on every member:
     - v25 entity : ent.groupId           (survives save/load — plain JSON)
     - v2 plate   : el.params.groupId      (survives via v2 serialise)

   MOVE-TOGETHER keys off the groupId of the DRAGGED item, not the
   selection, so grabbing the column moves the welded end-plate even if
   only the column was clicked:
     - v25 body-drag → v25Move() calls window.v25GroupOnV25Move() (this file)
       which translates every other member by the same (du,dv).
     - v2 plate body-drag → edit-plate calls the v25GroupOnPlate* hooks
       (begin/move/end) which translate the v25 mates to match.

   Selecting any grouped member expands the selection to the whole group
   (visual feedback + group delete).

   Everything is typeof-guarded; a missing global never throws.
   ============================================================ */
(function () {

  /* ---- helpers ------------------------------------------------------ */

  function genGroupId() {
    if (typeof window.v25GroupSeq !== 'number') window.v25GroupSeq = 0;
    window.v25GroupSeq += 1;
    // Date.now keeps ids unique across save/load merges; seq keeps them
    // unique within a session even at the same ms.
    return 'g' + window.v25GroupSeq + '_' + Date.now().toString(36);
  }

  function allViewEnts() {
    var out = [];
    if (typeof entities2D === 'undefined' || !entities2D) return out;
    for (var vk in entities2D) {
      if (!Object.prototype.hasOwnProperty.call(entities2D, vk)) continue;
      var arr = entities2D[vk];
      if (Array.isArray(arr)) for (var i = 0; i < arr.length; i++) {
        if (arr[i] && !arr[i]._v2Mirror) out.push(arr[i]);   // skip plate mirrors
      }
    }
    return out;
  }

  function eachV2Plate(fn) {
    var model = window.v2 && v2.appState && v2.appState.model;
    if (!model || !(model.elements instanceof Map)) return;
    model.elements.forEach(function (el) {
      if (el && el.category === 'plate' && el.params &&
          el.params.v2Source === 'place-plate-tool') fn(el);
    });
  }

  function plateGroupId(el) { return el && el.params ? el.params.groupId : null; }

  /* ---- current selection (union across both systems) ---------------- */

  function selectedV25Ents() {
    if (typeof v25Selected === 'undefined' || !Array.isArray(v25Selected)) return [];
    var byId = {};
    allViewEnts().forEach(function (e) { byId[e.id] = e; });
    return v25Selected.map(function (id) { return byId[id]; }).filter(Boolean);
  }

  // Multi-plate co-selection set (v2 plate UUIDs), parallel to v25Selected for
  // v25 entities. Shift-clicking plates accumulates here so a group can contain
  // ANY number of plates (e.g. a column with both a cap and a base plate), not
  // just the single v2 editPlate.selectedId. Maintained by edit-plate.js.
  if (typeof window.v25SelPlateIds === 'undefined') window.v25SelPlateIds = [];

  // Every plate currently selected for grouping: the multi-select set UNION the
  // v2 tool's single "primary" selection. Returns an array of v2 plate elements.
  function selectedPlates() {
    var model = window.v2 && v2.appState && v2.appState.model;
    if (!model || !(model.elements instanceof Map)) return [];
    var ids = {};
    if (Array.isArray(window.v25SelPlateIds)) window.v25SelPlateIds.forEach(function (id) { ids[id] = true; });
    var ep = window.v2 && v2.tools && v2.tools.editPlate && v2.tools.editPlate.state;
    if (ep && ep.selectedId) ids[ep.selectedId] = true;
    var out = [];
    Object.keys(ids).forEach(function (id) { var el = model.elements.get(id); if (el) out.push(el); });
    return out;
  }

  /* ---- group membership lookups ------------------------------------- */

  function membersOf(gid) {
    var ents = [], plates = [];
    if (!gid) return { ents: ents, plates: plates };
    allViewEnts().forEach(function (e) { if (e.groupId === gid) ents.push(e); });
    eachV2Plate(function (el) { if (plateGroupId(el) === gid) plates.push(el); });
    return { ents: ents, plates: plates };
  }

  /* ---- translate a single v25 entity by (du,dv) --------------------- */
  // Mirrors v25Move's generic body-move PLUS the stiff2 endpoint case, but
  // never calls v25Move (so the group hook can't recurse). Covers u/v, leader
  // tip/txt, polyline pts, and stiff2 uTop/vTop/uBot/vBot.
  function translateEntity(e, du, dv) {
    if (!e) return;
    if (e.type === 'stiff2') {
      if (e.uTop != null) { e.uTop += du; e.vTop += dv; e.uBot += du; e.vBot += dv; }
      return;
    }
    if (e.u != null) e.u += du;
    if (e.v != null) e.v += dv;
    if (e.tipU != null) e.tipU += du;
    if (e.tipV != null) e.tipV += dv;
    if (e.txtU != null) e.txtU += du;
    if (e.txtV != null) e.txtV += dv;
    if (Array.isArray(e.pts)) e.pts.forEach(function (p) { p.u += du; p.v += dv; });
  }

  /* ---- translate every member of a group by (du,dv) ----------------- */
  // exceptKind/exceptId let the caller skip the item it is already moving
  // itself (the dragged entity). Plates get their polygon translated in place.
  // A model-changed emit keeps the plate2 mirror (hit-test / bolt-grip) fresh.
  function translateMates(gid, du, dv, exceptKind, exceptId) {
    if (!gid || (!du && !dv)) return;
    var touchedPlate = false;
    allViewEnts().forEach(function (e) {
      if (e.groupId !== gid) return;
      if (exceptKind === 'v25' && e.id === exceptId) return;
      translateEntity(e, du, dv);
    });
    eachV2Plate(function (el) {
      if (plateGroupId(el) !== gid) return;
      if (exceptKind === 'plate' && el.id === exceptId) return;
      var poly = el.geometry && el.geometry.polygon;
      if (Array.isArray(poly)) {
        for (var i = 0; i < poly.length; i++) { poly[i].x += du; poly[i].y += dv; }
        touchedPlate = true;
      }
    });
    if (touchedPlate && window.v2 && v2.engine && v2.engine.dirtyBus &&
        typeof v2.engine.dirtyBus.emit === 'function') {
      v2.engine.dirtyBus.emit('model-changed');   // refresh plate2 mirror
    }
  }

  /* ---- GROUP / UNGROUP --------------------------------------------- */

  function group() {
    var ents = selectedV25Ents();
    var plates = selectedPlates();
    if (ents.length + plates.length < 2) {
      if (typeof setStatus === 'function') setStatus('Group: select at least two items first (Shift-click to add)');
      return false;
    }
    var gid = genGroupId();
    // Merge: if any selected item already belongs to a group, pull that whole
    // prior group in too — so re-grouping grows one group instead of fragmenting.
    var priorGids = {};
    ents.forEach(function (e) { if (e.groupId) priorGids[e.groupId] = true; });
    plates.forEach(function (el) { var g = plateGroupId(el); if (g) priorGids[g] = true; });
    Object.keys(priorGids).forEach(function (pg) {
      var m = membersOf(pg);
      m.ents.forEach(function (e) { if (ents.indexOf(e) < 0) ents.push(e); });
      m.plates.forEach(function (el) { if (plates.indexOf(el) < 0) plates.push(el); });
    });
    // Stamp the shared id on every member (any number of v25 ents + plates;
    // they need not be touching).
    ents.forEach(function (e) { e.groupId = gid; });
    plates.forEach(function (el) { if (!el.params) el.params = {}; el.params.groupId = gid; });
    var total = ents.length + plates.length;
    if (plates.length && window.v2 && v2.engine && v2.engine.dirtyBus) v2.engine.dirtyBus.emit('model-changed');
    startGroupFlash(gid);   // brief accent wash so the group reads as one unit
    if (typeof requestRender === 'function') requestRender();
    if (typeof setStatus === 'function') setStatus('Grouped ' + total + ' items — they now move & rotate together');
    return true;
  }

  function ungroup() {
    var ents = selectedV25Ents();
    var plates = selectedPlates();
    var gids = {};
    ents.forEach(function (e) { if (e.groupId) gids[e.groupId] = true; });
    plates.forEach(function (el) { if (plateGroupId(el)) gids[plateGroupId(el)] = true; });
    var any = false;
    // Collect the whole membership (direct refs) BEFORE stripping groupId, so the
    // farewell glow can find the items by reference — membersOf() keys off groupId
    // and would return nothing once the ids are gone.
    var flashEnts = [], flashPlates = [];
    Object.keys(gids).forEach(function (gid) {
      var m = membersOf(gid);
      m.ents.forEach(function (e) { delete e.groupId; flashEnts.push(e); any = true; });
      m.plates.forEach(function (el) { if (el.params) { delete el.params.groupId; flashPlates.push(el); any = true; } });
    });
    if (any && window.v2 && v2.engine && v2.engine.dirtyBus) v2.engine.dirtyBus.emit('model-changed');
    if (any) startUngroupFlash(flashEnts, flashPlates);   // single quick orange glow on release
    if (typeof requestRender === 'function') requestRender();
    if (typeof setStatus === 'function') setStatus(any ? 'Ungrouped' : 'Nothing grouped in the selection');
    return any;
  }

  /* ---- selection expansion (click one member → select whole group) -- */

  function expandV25Selection() {
    if (typeof v25Selected === 'undefined' || !Array.isArray(v25Selected) || !v25Selected.length) return;
    var ents = selectedV25Ents();
    var gid = null;
    for (var i = 0; i < ents.length; i++) { if (ents[i].groupId) { gid = ents[i].groupId; break; } }
    if (!gid) return;
    var m = membersOf(gid);
    var ids = {};
    v25Selected.forEach(function (id) { ids[id] = true; });
    m.ents.forEach(function (e) { ids[e.id] = true; });
    v25Selected = Object.keys(ids).map(function (k) { var n = Number(k); return isNaN(n) ? k : n; });
    // Reflect the group's plate in the v2 selection too.
    if (m.plates.length && window.v2 && v2.tools && v2.tools.editPlate && v2.tools.editPlate.state) {
      v2.tools.editPlate.state.selectedId = m.plates[0].id;
    }
  }

  // Called from edit-plate when a plate is selected by click.
  function onPlateSelected(plateId) {
    var model = window.v2 && v2.appState && v2.appState.model;
    if (!model || !(model.elements instanceof Map)) return;
    var el = model.elements.get(plateId);
    var gid = plateGroupId(el);
    if (!gid) return;
    var m = membersOf(gid);
    if (typeof v25Selected !== 'undefined' && Array.isArray(v25Selected)) {
      v25Selected = m.ents.map(function (e) { return e.id; });
      if (typeof v25UpdateInspector === 'function') v25UpdateInspector();
    }
    // Clicking one grouped plate selects the whole group's plates too, so the
    // multi-select highlight shows the entire group (and Ungroup acts on it).
    window.v25SelPlateIds = m.plates.map(function (pl) { return pl.id; });
    if (typeof requestRender === 'function') requestRender();
  }

  /* ---- v25 drag → move group --------------------------------------- */
  // Called at the TOP of v25Move (handle==='body'). Translates the OTHER
  // members; v25Move then translates the dragged entity itself.
  function onV25Move(ent, du, dv, handle) {
    if (handle !== 'body' || !ent || !ent.groupId) return;
    translateMates(ent.groupId, du, dv, 'v25', ent.id);
  }

  /* ---- v2 plate drag → move group (snapshot based) ------------------ */
  // edit-plate recomputes its polygon from origPolygon+delta each move, so we
  // mirror that: snapshot the mates at drag start, then set them to
  // snapshot+delta each move. Direct mutation (matches v25's no-undo move).
  var plateDragSnap = null;   // { gid, ents:[{ent, u,v, pts:[{u,v}], tip, txt}], plates:[{el, poly:[{x,y}]}] }

  function plateDragBegin(plateId) {
    plateDragSnap = null;
    var model = window.v2 && v2.appState && v2.appState.model;
    if (!model || !(model.elements instanceof Map)) return;
    var el = model.elements.get(plateId);
    var gid = plateGroupId(el);
    if (!gid) return;
    var m = membersOf(gid);
    var snap = { gid: gid, ents: [], plates: [] };
    m.ents.forEach(function (e) {
      snap.ents.push({
        ent: e,
        u: e.u, v: e.v,
        pts: Array.isArray(e.pts) ? e.pts.map(function (p) { return { u: p.u, v: p.v }; }) : null,
        tipU: e.tipU, tipV: e.tipV, txtU: e.txtU, txtV: e.txtV,
        // stiff2 endpoints
        uTop: e.uTop, vTop: e.vTop, uBot: e.uBot, vBot: e.vBot,
      });
    });
    m.plates.forEach(function (other) {
      if (other.id === plateId) return;   // the dragged plate moves itself
      var poly = other.geometry && other.geometry.polygon;
      snap.plates.push({ el: other, poly: Array.isArray(poly) ? poly.map(function (p) { return { x: p.x, y: p.y }; }) : null });
    });
    plateDragSnap = snap;
  }

  function plateDragMove(plateId, du, dv) {
    if (!plateDragSnap) return;
    plateDragSnap.ents.forEach(function (s) {
      var e = s.ent;
      if (s.u != null) e.u = s.u + du;
      if (s.v != null) e.v = s.v + dv;
      if (s.pts && Array.isArray(e.pts)) for (var i = 0; i < e.pts.length && i < s.pts.length; i++) {
        e.pts[i].u = s.pts[i].u + du; e.pts[i].v = s.pts[i].v + dv;
      }
      if (s.tipU != null) { e.tipU = s.tipU + du; e.tipV = s.tipV + dv; }
      if (s.txtU != null) { e.txtU = s.txtU + du; e.txtV = s.txtV + dv; }
      if (s.uTop != null) { e.uTop = s.uTop + du; e.vTop = s.vTop + dv; e.uBot = s.uBot + du; e.vBot = s.vBot + dv; }
    });
    plateDragSnap.plates.forEach(function (s) {
      var poly = s.el.geometry && s.el.geometry.polygon;
      if (s.poly && Array.isArray(poly)) for (var i = 0; i < poly.length && i < s.poly.length; i++) {
        poly[i].x = s.poly[i].x + du; poly[i].y = s.poly[i].y + dv;
      }
    });
  }

  function plateDragEnd(plateId, du, dv) {
    if (!plateDragSnap) return;
    plateDragMove(plateId, du, dv);   // final position
    // The dragged plate committed its own transaction in edit-plate; the
    // other plates were mutated directly — emit once so the mirror refreshes.
    if (plateDragSnap.plates.length && window.v2 && v2.engine && v2.engine.dirtyBus) {
      v2.engine.dirtyBus.emit('model-changed');
    }
    plateDragSnap = null;
    if (typeof requestRender === 'function') requestRender();
  }

  /* ---- grouped-plate-drag UNDO (plate-driven group move / rotate) ---- */
  // The MEMBER-driven group move records ONE {act:'v25Move'} undo covering the
  // whole group (js/39-events.js at v25Drag release). The PLATE-driven path used
  // to commit only the dragged plate's v2 transaction, leaving the v25 mates +
  // sibling plates with no undo record — so Ctrl+Z reverted just the grabbed
  // plate. These helpers give the plate-driven path the SAME single-entry group
  // undo: snapshot the whole group at drag-begin, then at commit push one
  // v25Move. The dragged plate is direct-mutated by edit-plate (no v2 tx when
  // grouped), so it rides in the snapshot exactly like its mates — and
  // v25RestoreMoveSnapshot (js/05-state.js) already restores grouped plate
  // polygons by that same direct mutation.

  // Whole-group snapshot in the shape v25RestoreMoveSnapshot consumes. Keyed by
  // gid (the plate path has no v25 entity whose .groupId we could read).
  function snapshotGroup(gid) {
    var out = { ents: [], plates: [] };
    if (!gid) return out;
    var m = membersOf(gid);
    m.ents.forEach(function (e) { if (e) out.ents.push(JSON.parse(JSON.stringify(e))); });
    m.plates.forEach(function (el) {
      if (el && el.geometry && Array.isArray(el.geometry.polygon)) {
        out.plates.push({
          id: el.id,
          polygon: JSON.parse(JSON.stringify(el.geometry.polygon)),
          flange: (el.params && el.params.flange) ? JSON.parse(JSON.stringify(el.params.flange)) : null,
        });
      }
    });
    return out;
  }

  var groupMoveUndoBefore = null, groupMoveUndoGid = null;

  // Plate drag / rotate BEGIN. Stash the before-snapshot if the dragged plate is
  // grouped; clear state otherwise. Call with a null plateId to abort a stash
  // (Escape, or a sub-threshold release).
  function plateGroupMoveUndoBegin(plateId) {
    groupMoveUndoBefore = null; groupMoveUndoGid = null;
    if (!plateId) return;
    var model = window.v2 && v2.appState && v2.appState.model;
    if (!model || !(model.elements instanceof Map)) return;
    var el = model.elements.get(plateId);
    var gid = plateGroupId(el);
    if (!gid) return;
    groupMoveUndoGid = gid;
    groupMoveUndoBefore = snapshotGroup(gid);
  }

  // Plate drag / rotate COMMIT — call AFTER the dragged plate is direct-mutated
  // and AFTER any flange joint-snap. Pushes ONE {act:'v25Move'} covering the
  // whole group. undoDepthBeforeJointSnap = undoStack.length captured just
  // before v25JointSnapGroupToFlange, so we can strip the {act:'addEnt2D'}
  // markers the joint-snap pushed (mirrors js/39-events.js:1419-1425).
  function plateGroupMoveUndoCommit(plateId, undoDepthBeforeJointSnap) {
    if (!groupMoveUndoBefore || !groupMoveUndoGid) { groupMoveUndoBefore = null; groupMoveUndoGid = null; return false; }
    // Copy-drag safety: if the committed element's group differs from what we
    // stashed (the drag became a fresh standalone clone), abandon the stash.
    var model = window.v2 && v2.appState && v2.appState.model;
    var liveEl = (model && model.elements && typeof model.elements.get === 'function') ? model.elements.get(plateId) : null;
    var liveGid = (liveEl && liveEl.params) ? liveEl.params.groupId : null;
    if (liveGid !== groupMoveUndoGid) { groupMoveUndoBefore = null; groupMoveUndoGid = null; return false; }
    var gid = groupMoveUndoGid;
    var before = groupMoveUndoBefore;
    groupMoveUndoBefore = null; groupMoveUndoGid = null;
    // Strip {act:'addEnt2D'} the joint-snap pushed so the joint delta is owned
    // solely by the single v25Move (matches the member path).
    if (typeof undoStack !== 'undefined' && Array.isArray(undoStack) &&
        typeof undoDepthBeforeJointSnap === 'number' && undoStack.length > undoDepthBeforeJointSnap) {
      for (var i = undoStack.length - 1; i >= undoDepthBeforeJointSnap; i--) {
        if (undoStack[i] && undoStack[i].act === 'addEnt2D') undoStack.splice(i, 1);
      }
    }
    var after = snapshotGroup(gid);
    var view = (typeof activeBlock !== 'undefined' && activeBlock && activeBlock.viewKey) || null;
    if (view && typeof v25MoveSnapshotsDiffer === 'function' && v25MoveSnapshotsDiffer(before, after) &&
        typeof undoStack !== 'undefined' && Array.isArray(undoStack)) {
      undoStack.push({ act: 'v25Move', view: view, before: before, after: after });
      if (undoStack.length > 100) undoStack.shift();
      if (typeof redoStack !== 'undefined' && Array.isArray(redoStack)) redoStack.length = 0;
    }
    return true;
  }

  /* ================================================================
     ALIGN & DISTRIBUTE  (Bluebeam-style)
     With ≥2 items selected, right-click → Align left/right/top/bottom
     snaps every item's edge to the extreme item in that direction.
     With ≥3, Space Evenly (vertical/horizontal) keeps the two outermost
     items fixed and redistributes the rest to equal centre-to-centre
     pitch (what an engineer means by "even bolt spacing").

     Coordinates: (u,v) real-world mm. real2px flips Y, so larger v is
     higher on screen — T = top edge (max v), B = bottom edge (min v),
     L = left (min u), R = right (max u). Mirrors v25EntBounds.

     Works across both systems the grouping code already spans: v25
     entities (bolts, members, hatch, leaders, …) move via translateEntity;
     v2 plates move by translating their polygon. The move is recorded as
     ONE {act:'v25Move'} undo over the whole selection — same shape the
     group-move path uses, so Ctrl+Z reverts it in a single step.
     ================================================================ */

  // Build a uniform list of movable items from the current selection. Each is
  // { bounds:{L,R,B,T}, cu, cv, move(du,dv) } so the math below is type-blind.
  function alignableItems() {
    var out = [];
    selectedV25Ents().forEach(function (e) {
      var b = (typeof v25EntBounds === 'function') ? v25EntBounds(e) : null;
      if (!b || !isFinite(b.L) || !isFinite(b.R) || !isFinite(b.B) || !isFinite(b.T)) return;
      out.push({
        bounds: b,
        cu: (b.L + b.R) / 2, cv: (b.B + b.T) / 2,
        move: function (du, dv) { translateEntity(e, du, dv); }
      });
    });
    selectedPlates().forEach(function (el) {
      var poly = el.geometry && el.geometry.polygon;
      if (!Array.isArray(poly) || !poly.length) return;
      var L = Infinity, R = -Infinity, B = Infinity, T = -Infinity;
      for (var i = 0; i < poly.length; i++) {
        if (poly[i].x < L) L = poly[i].x; if (poly[i].x > R) R = poly[i].x;
        if (poly[i].y < B) B = poly[i].y; if (poly[i].y > T) T = poly[i].y;
      }
      out.push({
        bounds: { L: L, R: R, B: B, T: T },
        cu: (L + R) / 2, cv: (B + T) / 2,
        move: function (du, dv) {
          var pg = el.geometry && el.geometry.polygon;
          if (Array.isArray(pg)) for (var j = 0; j < pg.length; j++) { pg[j].x += du; pg[j].y += dv; }
        }
      });
    });
    return out;
  }

  // Deep-copy snapshot of the selection in the shape v25RestoreMoveSnapshot
  // (js/05-state.js) consumes — full ent JSON + {id,polygon,flange} per plate.
  function snapshotSelection(ents, plates) {
    var out = { ents: [], plates: [] };
    ents.forEach(function (e) { if (e) out.ents.push(JSON.parse(JSON.stringify(e))); });
    plates.forEach(function (el) {
      if (el && el.geometry && Array.isArray(el.geometry.polygon)) {
        out.plates.push({
          id: el.id,
          polygon: JSON.parse(JSON.stringify(el.geometry.polygon)),
          flange: (el.params && el.params.flange) ? JSON.parse(JSON.stringify(el.params.flange)) : null,
        });
      }
    });
    return out;
  }

  function applyAlign(mode, items) {
    var i, t;
    if (mode === 'left') {
      t = Infinity; items.forEach(function (it) { if (it.bounds.L < t) t = it.bounds.L; });
      items.forEach(function (it) { it.move(t - it.bounds.L, 0); });
    } else if (mode === 'right') {
      t = -Infinity; items.forEach(function (it) { if (it.bounds.R > t) t = it.bounds.R; });
      items.forEach(function (it) { it.move(t - it.bounds.R, 0); });
    } else if (mode === 'top') {
      t = -Infinity; items.forEach(function (it) { if (it.bounds.T > t) t = it.bounds.T; });
      items.forEach(function (it) { it.move(0, t - it.bounds.T); });
    } else if (mode === 'bottom') {
      t = Infinity; items.forEach(function (it) { if (it.bounds.B < t) t = it.bounds.B; });
      items.forEach(function (it) { it.move(0, t - it.bounds.B); });
    } else if (mode === 'distV' || mode === 'distH') {
      var horiz = (mode === 'distH');
      var sorted = items.slice().sort(function (a, b) { return (horiz ? a.cu - b.cu : a.cv - b.cv); });
      if (sorted.length < 3) return;
      var lo = horiz ? sorted[0].cu : sorted[0].cv;
      var hi = horiz ? sorted[sorted.length - 1].cu : sorted[sorted.length - 1].cv;
      var step = (hi - lo) / (sorted.length - 1);
      for (i = 1; i < sorted.length - 1; i++) {
        var cur = horiz ? sorted[i].cu : sorted[i].cv;
        var tgt = lo + i * step;
        if (horiz) sorted[i].move(tgt - cur, 0); else sorted[i].move(0, tgt - cur);
      }
    }
  }

  // Driver: snapshot → apply → record undo → refresh.
  function alignDistribute(mode) {
    var ents = selectedV25Ents();
    var plates = selectedPlates();
    var need = (mode === 'distV' || mode === 'distH') ? 3 : 2;
    if (ents.length + plates.length < need) {
      if (typeof setStatus === 'function') setStatus('Select at least ' + need + ' items first (Shift-click to add)');
      return false;
    }
    var items = alignableItems();
    if (items.length < need) return false;

    var view = (typeof activeBlock !== 'undefined' && activeBlock && activeBlock.viewKey) || null;
    var before = snapshotSelection(ents, plates);

    applyAlign(mode, items);

    var after = snapshotSelection(ents, plates);
    if (view && typeof v25MoveSnapshotsDiffer === 'function' && v25MoveSnapshotsDiffer(before, after) &&
        typeof undoStack !== 'undefined' && Array.isArray(undoStack)) {
      undoStack.push({ act: 'v25Move', view: view, before: before, after: after });
      if (undoStack.length > 100) undoStack.shift();
      if (typeof redoStack !== 'undefined' && Array.isArray(redoStack)) redoStack.length = 0;
    }
    if (plates.length && window.v2 && v2.engine && v2.engine.dirtyBus &&
        typeof v2.engine.dirtyBus.emit === 'function') {
      v2.engine.dirtyBus.emit('model-changed');   // refresh plate2 mirror / hit-test
    }
    if (typeof requestRender === 'function') requestRender();
    var labels = { left: 'Aligned left', right: 'Aligned right', top: 'Aligned top',
      bottom: 'Aligned bottom', distV: 'Spaced evenly (vertical)', distH: 'Spaced evenly (horizontal)' };
    if (typeof setStatus === 'function') setStatus(labels[mode] || 'Aligned');
    return true;
  }

  /* ---- right-click context menu ------------------------------------- */

  var menuEl = null;
  function closeMenu() { if (menuEl && menuEl.parentNode) menuEl.parentNode.removeChild(menuEl); menuEl = null; }

  function showContextMenu(clientX, clientY) {
    closeMenu();
    var ents = selectedV25Ents();
    var plates = selectedPlates();
    var count = ents.length + plates.length;
    var anyGrouped = ents.some(function (e) { return !!e.groupId; }) || plates.some(function (el) { return !!plateGroupId(el); });
    var items = [];
    // member-depth-order (72h) — Bring to Front / Send to Back etc. for the
    // selected member(s)/plate(s). Empty when nothing depth-capable is selected.
    if (typeof v25DepthMenuItems === 'function') items = items.concat(v25DepthMenuItems());
    // GLT-notch (72m) — "Notch…" when exactly one GLT member is selected.
    if (typeof v25NotchMenuItems === 'function') {
      var notchItems = v25NotchMenuItems();
      if (notchItems && notchItems.length) {
        if (items.length) items.push({ sep: true });
        items = items.concat(notchItems);
      }
    }
    if (count >= 2 && !anyGrouped) items.push({ label: 'Group  (Ctrl+G)', fn: group });
    if (anyGrouped) items.push({ label: 'Ungroup  (Ctrl+Shift+G)', fn: ungroup });
    // Align & Distribute (Bluebeam-style) — needs ≥2 selected items.
    if (count >= 2) {
      if (items.length) items.push({ sep: true });
      items.push({ label: 'Align left',   fn: function () { alignDistribute('left'); } });
      items.push({ label: 'Align right',  fn: function () { alignDistribute('right'); } });
      items.push({ label: 'Align top',    fn: function () { alignDistribute('top'); } });
      items.push({ label: 'Align bottom', fn: function () { alignDistribute('bottom'); } });
      if (count >= 3) {
        items.push({ sep: true });
        items.push({ label: 'Space evenly (vertical)',   fn: function () { alignDistribute('distV'); } });
        items.push({ label: 'Space evenly (horizontal)', fn: function () { alignDistribute('distH'); } });
      }
    }
    if (!items.length) return false;   // nothing useful → let browser do nothing

    var m = document.createElement('div');
    m.className = 'v25-ctx-menu';
    m.style.cssText = 'position:fixed;z-index:9999;background:var(--surface-2,#f5f0e6);' +
      'color:var(--text,#2a241f);border:1px solid var(--sheet-border,#b8ac8e);border-radius:6px;' +
      'box-shadow:0 4px 16px rgba(0,0,0,.35);padding:4px;min-width:170px;font:13px system-ui;' +
      'left:' + clientX + 'px;top:' + clientY + 'px;';
    items.forEach(function (it) {
      if (it.sep) {
        var hr = document.createElement('div');
        hr.style.cssText = 'height:1px;margin:4px 6px;background:var(--sheet-border,#b8ac8e);opacity:.5;';
        m.appendChild(hr);
        return;
      }
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
    // close on any next pointerdown elsewhere / escape
    // close on an OUTSIDE click only — guarded capture mousedown (a capture
    // pointerdown used to fire before the item's mousedown and detach the menu,
    // which would break the item actions, mirroring the joint-menu fix).
    setTimeout(function () {
      window.addEventListener('mousedown', function _gClose(ev) {
        if (menuEl && menuEl.contains(ev.target)) return;
        closeMenu();
      }, { once: true, capture: true });
    }, 0);
    return true;
  }

  /* ================================================================
     ROTATE-TOGETHER  (plate-grouping-stiffener follow-up)
     A grouped assembly rotates as one rigid body about a single pivot.
     Two entry points, mirroring the move-together design:
       - a v25 member's rotate ball (column / blockwork / hatch) →
         v25Move() calls window.v25GroupOnV25Rotate() with an
         INCREMENTAL delta about that member's own pivot.
       - a v2 plate's rotate handle → edit-plate calls the snapshot
         hooks (begin/move/end/cancel) with an ABSOLUTE angle about the
         plate centroid.
     Rotating a member's start point about the pivot AND advancing its
     `rot` by the same delta is a rigid rotation of the whole member
     (the far end follows automatically). Plates rotate every polygon
     vertex; stiffeners rotate both endpoints.
     ================================================================ */

  function _rot(u, v, pu, pv, ct, st) {
    var dx = u - pu, dy = v - pv;
    return { u: pu + dx * ct - dy * st, v: pv + dx * st + dy * ct };
  }

  // Rotate ONE v25 entity rigidly about (pu,pv). ct/st = cos/sin(theta);
  // deg = theta in degrees, added to any orientation field.
  function rotateEntity(e, pu, pv, ct, st, deg) {
    if (!e) return;
    if (e.type === 'stiff2') {
      if (e.uTop != null) {
        var a = _rot(e.uTop, e.vTop, pu, pv, ct, st); e.uTop = a.u; e.vTop = a.v;
        var b = _rot(e.uBot, e.vBot, pu, pv, ct, st); e.uBot = b.u; e.vBot = b.v;
      }
      return;
    }
    if (e.u != null) { var p = _rot(e.u, e.v, pu, pv, ct, st); e.u = p.u; e.v = p.v; }
    if (e.tipU != null) { var t = _rot(e.tipU, e.tipV, pu, pv, ct, st); e.tipU = t.u; e.tipV = t.v; }
    if (e.txtU != null) { var x = _rot(e.txtU, e.txtV, pu, pv, ct, st); e.txtU = x.u; e.txtV = x.v; }
    if (Array.isArray(e.pts)) e.pts.forEach(function (q) { var r = _rot(q.u, q.v, pu, pv, ct, st); q.u = r.u; q.v = r.v; });
    if (typeof e.rot === 'number') e.rot += deg;
  }

  // INCREMENTAL group rotation (v25 rotate-ball path). Rotates every OTHER
  // member of gid about (pu,pv) by dTheta (radians); the dragged item rotates
  // itself in v25Move.
  function rotateMates(gid, pu, pv, dTheta, exceptKind, exceptId) {
    if (!gid || !dTheta) return;
    var ct = Math.cos(dTheta), st = Math.sin(dTheta), deg = dTheta * 180 / Math.PI;
    var touchedPlate = false;
    allViewEnts().forEach(function (e) {
      if (e.groupId !== gid) return;
      if (exceptKind === 'v25' && e.id === exceptId) return;
      rotateEntity(e, pu, pv, ct, st, deg);
    });
    eachV2Plate(function (el) {
      if (plateGroupId(el) !== gid) return;
      if (exceptKind === 'plate' && el.id === exceptId) return;
      var poly = el.geometry && el.geometry.polygon;
      if (Array.isArray(poly)) {
        for (var i = 0; i < poly.length; i++) {
          var dx = poly[i].x - pu, dy = poly[i].y - pv;
          poly[i].x = pu + dx * ct - dy * st;
          poly[i].y = pv + dx * st + dy * ct;
        }
        touchedPlate = true;
      }
    });
    if (touchedPlate && window.v2 && v2.engine && v2.engine.dirtyBus &&
        typeof v2.engine.dirtyBus.emit === 'function') {
      v2.engine.dirtyBus.emit('model-changed');   // refresh plate2 mirror
    }
  }

  function onV25Rotate(ent, pu, pv, dTheta) {
    if (!ent || !ent.groupId || !dTheta) return;
    rotateMates(ent.groupId, pu, pv, dTheta, 'v25', ent.id);
  }

  /* ---- v2 plate rotate → rotate group (snapshot based) -------------- */
  // edit-plate recomputes the dragged plate's polygon from origPolygon rotated
  // by an ABSOLUTE angle each move, so we mirror that for the mates: snapshot
  // their pose at rotate-start, then set them to snapshot-rotated-by-angle each
  // move. Direct mutation (matches the v25 no-undo move convention).
  var plateRotSnap = null;   // { gid, plateId, pu, pv, ents:[…], plates:[…] }

  function plateRotateBegin(plateId, centroid) {
    plateRotSnap = null;
    var model = window.v2 && v2.appState && v2.appState.model;
    if (!model || !(model.elements instanceof Map) || !centroid) return;
    var el = model.elements.get(plateId);
    var gid = plateGroupId(el);
    if (!gid) return;
    var m = membersOf(gid);
    var snap = { gid: gid, plateId: plateId, pu: centroid.x, pv: centroid.y, ents: [], plates: [] };
    m.ents.forEach(function (e) {
      snap.ents.push({
        ent: e,
        u: e.u, v: e.v,
        rot: (typeof e.rot === 'number') ? e.rot : null,
        pts: Array.isArray(e.pts) ? e.pts.map(function (p) { return { u: p.u, v: p.v }; }) : null,
        tipU: e.tipU, tipV: e.tipV, txtU: e.txtU, txtV: e.txtV,
        uTop: e.uTop, vTop: e.vTop, uBot: e.uBot, vBot: e.vBot,
      });
    });
    m.plates.forEach(function (other) {
      if (other.id === plateId) return;   // the dragged plate rotates itself
      var poly = other.geometry && other.geometry.polygon;
      snap.plates.push({ el: other, poly: Array.isArray(poly) ? poly.map(function (p) { return { x: p.x, y: p.y }; }) : null });
    });
    plateRotSnap = snap;
  }

  function plateRotateMove(plateId, angle) {
    if (!plateRotSnap) return;
    var ct = Math.cos(angle), st = Math.sin(angle), deg = angle * 180 / Math.PI;
    var pu = plateRotSnap.pu, pv = plateRotSnap.pv;
    plateRotSnap.ents.forEach(function (s) {
      var e = s.ent;
      if (s.uTop != null) {
        var a = _rot(s.uTop, s.vTop, pu, pv, ct, st); e.uTop = a.u; e.vTop = a.v;
        var b = _rot(s.uBot, s.vBot, pu, pv, ct, st); e.uBot = b.u; e.vBot = b.v;
      }
      if (s.u != null) { var p = _rot(s.u, s.v, pu, pv, ct, st); e.u = p.u; e.v = p.v; }
      if (s.pts && Array.isArray(e.pts)) for (var i = 0; i < e.pts.length && i < s.pts.length; i++) {
        var r = _rot(s.pts[i].u, s.pts[i].v, pu, pv, ct, st); e.pts[i].u = r.u; e.pts[i].v = r.v;
      }
      if (s.tipU != null) { var t = _rot(s.tipU, s.tipV, pu, pv, ct, st); e.tipU = t.u; e.tipV = t.v; }
      if (s.txtU != null) { var x = _rot(s.txtU, s.txtV, pu, pv, ct, st); e.txtU = x.u; e.txtV = x.v; }
      if (s.rot != null) e.rot = s.rot + deg;
    });
    plateRotSnap.plates.forEach(function (s) {
      var poly = s.el.geometry && s.el.geometry.polygon;
      if (s.poly && Array.isArray(poly)) for (var i = 0; i < poly.length && i < s.poly.length; i++) {
        var dx = s.poly[i].x - pu, dy = s.poly[i].y - pv;
        poly[i].x = pu + dx * ct - dy * st;
        poly[i].y = pv + dx * st + dy * ct;
      }
    });
  }

  function plateRotateEnd(plateId, angle) {
    if (!plateRotSnap) return;
    plateRotateMove(plateId, angle);   // settle mates at the committed angle
    if (plateRotSnap.plates.length && window.v2 && v2.engine && v2.engine.dirtyBus) {
      v2.engine.dirtyBus.emit('model-changed');
    }
    plateRotSnap = null;
    if (typeof requestRender === 'function') requestRender();
  }

  // Escape during a grouped plate ROTATE — restore mates to their pre-rotate
  // pose (angle 0) so a cancelled rotate doesn't desync the group.
  function plateRotateCancel() {
    if (!plateRotSnap) return;
    plateRotateMove(plateRotSnap.plateId, 0);
    if (plateRotSnap.plates.length && window.v2 && v2.engine && v2.engine.dirtyBus) {
      v2.engine.dirtyBus.emit('model-changed');
    }
    plateRotSnap = null;
    if (typeof requestRender === 'function') requestRender();
  }

  // Escape during a grouped plate MOVE — same restore for the translate path
  // (plateDragSnap / plateDragMove are defined above).
  function plateDragCancel() {
    if (!plateDragSnap) return;
    plateDragMove(null, 0, 0);   // du=dv=0 restores the snapshot pose
    if (plateDragSnap.plates.length && window.v2 && v2.engine && v2.engine.dirtyBus) {
      v2.engine.dirtyBus.emit('model-changed');
    }
    plateDragSnap = null;
    if (typeof requestRender === 'function') requestRender();
  }

  /* ================================================================
     GROUP FLASH  (plate-grouping-stiffener follow-up)
     On a successful Group, wash every member of the new group in the
     accent colour, fading to nothing over 3 s, so the grouping reads as
     a deliberate event even though the items were already selected.
     Self-driven via rAF; keyed off the group id (not the live
     selection) so it persists even if the user clicks away.
     ================================================================ */

  var groupFlash = null;   // { gid, t0, dur }
  // Ungroup farewell glow: holds DIRECT refs (the groupId is already stripped, so
  // there's nothing to look up by). One quick orange swell that eases out to
  // nothing — the mirror image of the group flash's deliberate 3 s wash.
  var ungroupFlash = null; // { ents:[…], plates:[…], t0, dur }
  function _now() { return (window.performance && typeof performance.now === 'function') ? performance.now() : Date.now(); }

  function pumpFlash() {
    if (!groupFlash) return;
    if (_now() - groupFlash.t0 >= groupFlash.dur) {
      groupFlash = null;
      if (typeof requestRender === 'function') requestRender();   // final clear
      return;
    }
    if (typeof requestRender === 'function') requestRender();
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(pumpFlash);
  }

  function startGroupFlash(gid) {
    if (!gid) return;
    groupFlash = { gid: gid, t0: _now(), dur: 3000 };
    pumpFlash();
  }

  function pumpUngroupFlash() {
    if (!ungroupFlash) return;
    if (_now() - ungroupFlash.t0 >= ungroupFlash.dur) {
      ungroupFlash = null;
      if (typeof requestRender === 'function') requestRender();   // final clear
      return;
    }
    if (typeof requestRender === 'function') requestRender();
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(pumpUngroupFlash);
  }

  function startUngroupFlash(ents, plates) {
    ents = (ents || []).slice();
    plates = (plates || []).slice();
    if (!ents.length && !plates.length) return;
    ungroupFlash = { ents: ents, plates: plates, t0: _now(), dur: 650 };
    pumpUngroupFlash();
  }

  // viewId → viewKey, matching live-render's plateViewKey (kept local here).
  function flashPlateViewKey(el) {
    var vid = el && el.geometry && el.geometry.viewId;
    if (typeof vid !== 'string') return null;
    var mm = /^v1-view-(.+)$/.exec(vid);
    return mm ? mm[1] : null;
  }

  // A v25 entity's silhouette in (u,v): the true member outline for mem2, else
  // the entity AABB. Returns [{u,v},…] or null.
  function flashOutline(e) {
    if (!e) return null;
    if (e.type === 'mem2' && typeof v25Mem2WorldOutline === 'function') {
      var o = v25Mem2WorldOutline(e);
      if (o && o.length) return o.map(function (p) { return { u: p[0], v: p[1] }; });
    }
    var b = (typeof v25EntBounds === 'function') ? v25EntBounds(e) : null;
    if (!b) return null;
    return [{ u: b.L, v: b.T }, { u: b.R, v: b.T }, { u: b.R, v: b.B }, { u: b.L, v: b.B }];
  }

  function platePoly(el) {
    var poly = el && el.geometry && el.geometry.polygon;
    if (!Array.isArray(poly)) return null;
    return poly.map(function (p) { return { u: p.x, v: p.y }; });
  }

  // Painted by live-render's 2D wrapper AFTER the plate + bolt bodies so the
  // wash sits on top of both the v25 members and the v2 plates.
  function drawGroupFlash(blk, cs) {
    if (!groupFlash || typeof sheetMode !== 'string' || sheetMode !== '2d') return;
    if (typeof ctx === 'undefined' || typeof real2px !== 'function' || !blk) return;
    var t = (_now() - groupFlash.t0) / groupFlash.dur;
    if (t < 0) t = 0;
    if (t >= 1) return;                          // pumpFlash clears on its tick
    var m = membersOf(groupFlash.gid);
    if (!m.ents.length && !m.plates.length) return;
    var s = Math.sin(3 * Math.PI * t);           // 3 humps across the 3 s window
    var a = 0.30 * s * s;                         // raised-sine pulses: peak 0.30, =0 at t=0 and t=1
    var col = (cs && cs.getPropertyValue ? (cs.getPropertyValue('--selected-color') || '').trim() : '') || '#4a90e2';
    // The theme accent is an oklch() colour and colorAlpha() can't bake alpha
    // into oklch — so apply the wash opacity via ctx.globalAlpha (format-proof).
    // Fill peaks at a (0.30); the outline reads a touch firmer.
    var lineA = Math.min(1, a + 0.20);
    ctx.save();
    ctx.fillStyle = col;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    function paint(pts) {
      if (!pts || pts.length < 2) return;
      ctx.beginPath();
      for (var i = 0; i < pts.length; i++) {
        var sp = real2px(blk, pts[i].u, pts[i].v);
        if (i === 0) ctx.moveTo(sp.x, sp.y); else ctx.lineTo(sp.x, sp.y);
      }
      ctx.closePath();
      ctx.globalAlpha = a;
      ctx.fill();
      ctx.globalAlpha = lineA;
      ctx.stroke();
    }
    m.ents.forEach(function (e) {
      if (e.view && blk.viewKey && e.view !== blk.viewKey) return;
      paint(flashOutline(e));
    });
    m.plates.forEach(function (el) {
      var pvk = flashPlateViewKey(el);
      if (blk.viewKey && pvk && pvk !== blk.viewKey) return;
      paint(platePoly(el));
    });
    ctx.restore();
  }

  // The ungroup farewell glow — a single quick swell that eases out. Same accent
  // colour and outline machinery as drawGroupFlash, but one ease-out ramp (no
  // pulsing humps) over a short window, and it works off direct entity refs since
  // the groupId is already gone. Painted in the same live-render slot.
  function drawUngroupFlash(blk, cs) {
    if (!ungroupFlash || typeof sheetMode !== 'string' || sheetMode !== '2d') return;
    if (typeof ctx === 'undefined' || typeof real2px !== 'function' || !blk) return;
    var t = (_now() - ungroupFlash.t0) / ungroupFlash.dur;
    if (t < 0) t = 0;
    if (t >= 1) return;                          // pumpUngroupFlash clears on its tick
    // Fast attack, ease-out decay: a brief rise then a smooth fade to zero.
    var env = (t < 0.18) ? (t / 0.18) : (1 - (t - 0.18) / (1 - 0.18));
    if (env < 0) env = 0; if (env > 1) env = 1;
    var a = 0.38 * env;                          // fill peak ~0.38
    var lineA = Math.min(1, a + 0.20);
    var col = (cs && cs.getPropertyValue ? (cs.getPropertyValue('--selected-color') || '').trim() : '') || '#4a90e2';
    ctx.save();
    ctx.fillStyle = col;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    function paint(pts) {
      if (!pts || pts.length < 2) return;
      ctx.beginPath();
      for (var i = 0; i < pts.length; i++) {
        var sp = real2px(blk, pts[i].u, pts[i].v);
        if (i === 0) ctx.moveTo(sp.x, sp.y); else ctx.lineTo(sp.x, sp.y);
      }
      ctx.closePath();
      ctx.globalAlpha = a;
      ctx.fill();
      ctx.globalAlpha = lineA;
      ctx.stroke();
    }
    ungroupFlash.ents.forEach(function (e) {
      if (e.view && blk.viewKey && e.view !== blk.viewKey) return;
      paint(flashOutline(e));
    });
    ungroupFlash.plates.forEach(function (el) {
      var pvk = flashPlateViewKey(el);
      if (blk.viewKey && pvk && pvk !== blk.viewKey) return;
      paint(platePoly(el));
    });
    ctx.restore();
  }

  /* ---- exports ------------------------------------------------------ */
  window.v25Group               = group;
  window.v25NewGroupId          = genGroupId;   // canonical fresh group-id mint (drag-duplicate reuses it)
  window.v25Ungroup             = ungroup;
  window.v25ExpandGroupSelection = expandV25Selection;
  window.v25GroupOnV25Move      = onV25Move;
  window.v25GroupOnPlateSelected = onPlateSelected;
  window.v25GroupOnPlateDragBegin = plateDragBegin;
  window.v25GroupOnPlateDragMove  = plateDragMove;
  window.v25GroupOnPlateDragEnd   = plateDragEnd;
  window.v25GroupOnPlateMoveUndoBegin  = plateGroupMoveUndoBegin;
  window.v25GroupOnPlateMoveUndoCommit = plateGroupMoveUndoCommit;
  window.v25GroupMembersOf      = membersOf;
  window.v25ShowGroupContextMenu = showContextMenu;
  window.v25TranslateGroupMates = translateMates;
  // rotate-together
  window.v25GroupOnV25Rotate        = onV25Rotate;
  window.v25GroupOnPlateRotateBegin = plateRotateBegin;
  window.v25GroupOnPlateRotateMove  = plateRotateMove;
  window.v25GroupOnPlateRotateEnd   = plateRotateEnd;
  window.v25GroupOnPlateRotateCancel = plateRotateCancel;
  window.v25GroupOnPlateDragCancel  = plateDragCancel;
  // group flash
  window.v25DrawGroupFlash          = drawGroupFlash;
  window.v25DrawUngroupFlash        = drawUngroupFlash;

})();
