'use strict';

// initEvents — mouse, touch, keyboard event handling (1,410 lines)
// Extracted from dev/index.html lines 11244-12653 (2026-05-02 modular split)

// EVENT HANDLING
// ============================================================

function getPixelXY(e) {
  const r = canvas.getBoundingClientRect();
  return { px: e.clientX - r.left, py: e.clientY - r.top };
}

// V25 entity-move undo support. Snapshots a v25 entity for undo, and — if the
// entity is grouped — every group mate too (other v25 entities + any v2 plates),
// so a grouped-assembly move records as ONE atomic action. Returns
//   { ents: [ <deep clone of each affected v25 entity> ],
//     plates: [ { id, polygon: <clone of el.geometry.polygon>,
//                 flange: <clone of el.params.flange | null> } ] }
// A deep clone of each entity captures every mutable field (u,v,rot,length,pts,
// tipU/V,txtU/V,uTop/vTop/uBot/vBot,lengthMM,heightMM,…) regardless of type.
// Reach the v2 namespace via window.v2 (bare `v2` is shadowed locally below).
function v25SnapshotMoveTargets(ent) {
  const out = { ents: [], plates: [] };
  if (!ent) return out;
  const gid = ent.groupId;
  if (gid && typeof window.v25GroupMembersOf === 'function') {
    const m = window.v25GroupMembersOf(gid) || {};
    (m.ents || []).forEach(function (e) {
      if (e) out.ents.push(JSON.parse(JSON.stringify(e)));
    });
    (m.plates || []).forEach(function (el) {
      if (el && el.geometry && Array.isArray(el.geometry.polygon)) {
        out.plates.push({
          id: el.id,
          polygon: JSON.parse(JSON.stringify(el.geometry.polygon)),
          // Capture the flange-joint metadata too: a grouped drop runs
          // v25JointSnapGroupToFlange, which writes el.params.flange. Without
          // this, undo reverts the polygon but leaves a phantom joint record
          // pointing at a beam the plate no longer touches. Shape-agnostic deep
          // clone (or null when there is no joint) so it survives joint-feature
          // changes owned by the grouping/joint modules.
          flange: (el.params && el.params.flange) ? JSON.parse(JSON.stringify(el.params.flange)) : null,
        });
      }
    });
    // Defensive: if membership lookup somehow missed the dragged entity, still
    // snapshot it so an ungrouped-feeling move is never recorded empty.
    if (!out.ents.some(function (e) { return e.id === ent.id; })) {
      out.ents.push(JSON.parse(JSON.stringify(ent)));
    }
  } else {
    out.ents.push(JSON.parse(JSON.stringify(ent)));
  }
  return out;
}

// True when a before/after pair of v25-move snapshots differ in any recorded
// field (any entity property or any plate-polygon coordinate). Used to skip
// pushing a no-op undo entry for a click that didn't actually move anything.
function v25MoveSnapshotsDiffer(before, after) {
  if (!before || !after) return false;
  return JSON.stringify(before) !== JSON.stringify(after);
}

function initEvents() {
  canvas.addEventListener('mousedown', (e) => {
    const { px, py } = getPixelXY(e);

    // If orbiting: mousedown starts a new orbit drag, or click outside stops orbit
    if (v3dOrbiting) {
      v3dHandleOrbitDown(px, py);
      canvas.style.cursor = 'grabbing';
      return;
    }

    // Detect which block the click is in
    const clickedBlock = blockAtPixel(px, py);
    if (clickedBlock) activeBlock = clickedBlock;

    // Check for section cut line drag (in elevation view, select tool, left button)
    // V25 — section cut lines are 3D-only; skip in 2D mode.
    if (sheetMode !== '2d' && e.button === 0 && !spaceHeld && tool === 'select' && activeBlock && activeBlock.viewKey === 'elevation') {
      const cutHit = hitTestCutLine(activeBlock, px, py);
      if (cutHit) {
        draggingCutLine = cutHit;
        e.preventDefault(); requestRender(); return;
      }
    }

    // Check for view box resize handle (on active block) — disabled in 2D
    // mode because the elevation block fills the entire drawing area and
    // its border overlaps the user's content placement areas.
    if (e.button === 0 && !spaceHeld && tool === 'select' && activeBlock && sheetMode !== '2d') {
      const handle = hitTestResizeHandle(activeBlock, px, py);
      if (handle) {
        blockResizing = { block: activeBlock, handle };
        const sh = px2s(px, py);
        blockResizeStart = { sx: sh.x, sy: sh.y, boxW: activeBlock.boxW, boxH: activeBlock.boxH,
                             sheetX: activeBlock.sheetX, sheetY: activeBlock.sheetY };
        canvas.style.cursor = resizeHandleCursor(handle);
        e.preventDefault(); return;
      }
      // Check for view box border drag (single-click drag to reposition)
      if (hitTestBlockBorder(activeBlock, px, py)) {
        blockDragging = activeBlock;
        const sh = px2s(px, py);
        blockDragOffset = { dx: sh.x - activeBlock.sheetX, dy: sh.y - activeBlock.sheetY };
        canvas.style.cursor = 'move';
        e.preventDefault(); requestRender(); return;
      }
    }

    // Pan: middle button or space+left
    if (e.button === 1 || (e.button === 0 && spaceHeld)) {
      isPanning = true; panLast = { px, py };
      container.classList.add('grabbing');
      e.preventDefault(); return;
    }

    // Right click: cancel
    if (e.button === 2) {
      // V25 — right-click on a v25 tool either finishes a poly bar, finishes
      // a free polyline, undoes the last vertex, or cancels the in-progress drag.
      if (tool && tool.startsWith('v25-')) {
        if (tool === 'v25-bar' && v25State.polyPts.length >= 2) {
          v25FinishBarPoly();
        } else if (tool === 'v25-line' && v25State.polyPts.length >= 2) {
          v25FinishLineSet();
        } else if ((tool === 'v25-bar' || tool === 'v25-line') && v25State.polyPts.length > 0) {
          v25State.polyPts.pop();
          if (v25State.polyPts.length === 0) v25State.polyPts = [];
          requestRender();
        } else if (v25State.dragStart) {
          v25State.dragStart = null; requestRender();
        } else {
          setTool('select'); canvas.style.cursor = 'default';
        }
        return;
      }
      if (tool === 'draw-plate' && platePts.length > 0) {
        // Undo last vertex
        platePts.pop();
        plateDimInput = ''; plateDimActive = false;
        if (platePts.length === 0) plateBlock = null;
        requestRender();
      } else if (tool === 'draw-plate') {
        cancelDraw(); tool = 'select'; canvas.style.cursor = 'default';
      } else if (clickPts.length > 0 || polyPts.length > 0 || dimStep > 0 || placing || drawStart) {
        if (drawStart && drawMember) {
          drawStart = null; drawPreviewEnd = null;
          requestRender();
        } else {
          cancelDraw();
        }
      } else if (drawMember) {
        cancelDraw();
        tool = 'select'; canvas.style.cursor = 'default';
      } else {
        selected3D = []; requestRender();
      }
      return;
    }
    if (window._v25_dbg) console.log('[v25-dbg] mousedown reached pre-button. button=' + e.button + ' activeBlock=' + (activeBlock?activeBlock.viewKey:'NULL'));
    if (e.button !== 0) return;
    if (!activeBlock) { if (window._v25_dbg) console.log('[v25-dbg] no activeBlock; bailing'); return; }

    const [cu, cv] = getCursor(activeBlock);

    if (window._v25_dbg) console.log('[v25-dbg] reached v25 select branch. mode=' + sheetMode + ' tool=' + tool + ' cu=' + cu + ' cv=' + cv);
    // V25 — Select / drag v25 entities when in select tool & 2D mode.
    if (sheetMode === '2d' && tool === 'select' && typeof v25HitTest === 'function') {
      // Premium note (noteBox): Shift+click while a note is selected adds or
      // removes a leader arrow on it. Consumes the click only when a noteBox is
      // selected (returns false otherwise), before any selection mutation.
      if (e.shiftKey && typeof nbSelectShiftClick === 'function'
          && nbSelectShiftClick(activeBlock, cu, cv)) return;
      // Shift + click on a SELECTED poly-mat: delete a node (if cursor lands on
      // one) or insert a node mid-edge (if cursor lands on a segment). Only
      // fires when at least one selected entity is a poly mat — additive-select
      // (Shift+click on something else) keeps working.
      if (e.shiftKey && v25Selected.length) {
        const polyMats = v25Selected
          .map(id => (entities2D[activeBlock.viewKey] || []).find(en => en.id === id))
          .filter(en => en && en.type === 'mat' && en.shape === 'poly' && Array.isArray(en.pts) && en.pts.length >= 3);
        const cursorPx = real2px(activeBlock, cu, cv);
        let consumed = false;
        for (const ent of polyMats) {
          // 1) Hit a node? → delete (require ≥4 nodes so result still has ≥3).
          let nodeI = -1, nodeD = Infinity;
          for (let i = 0; i < ent.pts.length; i++) {
            const pp = real2px(activeBlock, ent.pts[i].u, ent.pts[i].v);
            const d = Math.hypot(pp.x - cursorPx.x, pp.y - cursorPx.y);
            if (d < 12 && d < nodeD) { nodeD = d; nodeI = i; }
          }
          if (nodeI >= 0) {
            if (ent.pts.length > 3) {
              ent.pts.splice(nodeI, 1);
              if (typeof v3dMarkDirty === 'function') v3dMarkDirty();
              if (typeof v25UpdateInspector === 'function') v25UpdateInspector();
              requestRender();
            }
            consumed = true; break;
          }
          // 2) Hit an edge? → insert a new node at the projected point.
          let segI = -1, segD = Infinity, segPt = null;
          for (let i = 0; i < ent.pts.length; i++) {
            const a = ent.pts[i];
            const b = ent.pts[(i + 1) % ent.pts.length];
            const aPx = real2px(activeBlock, a.u, a.v);
            const bPx = real2px(activeBlock, b.u, b.v);
            const dx = bPx.x - aPx.x, dy = bPx.y - aPx.y;
            const lenSq = dx * dx + dy * dy;
            if (lenSq < 1e-3) continue;
            const t = Math.max(0, Math.min(1, ((cursorPx.x - aPx.x) * dx + (cursorPx.y - aPx.y) * dy) / lenSq));
            const projX = aPx.x + t * dx, projY = aPx.y + t * dy;
            const d = Math.hypot(cursorPx.x - projX, cursorPx.y - projY);
            if (d < 14 && d < segD) {
              segD = d; segI = i;
              const real = px2real(activeBlock, projX, projY);
              segPt = { u: real.u, v: real.v };
            }
          }
          if (segI >= 0 && segPt) {
            ent.pts.splice(segI + 1, 0, segPt);
            if (typeof v3dMarkDirty === 'function') v3dMarkDirty();
            if (typeof v25UpdateInspector === 'function') v25UpdateInspector();
            requestRender();
            consumed = true; break;
          }
        }
        if (consumed) return;
      }
      // Bluebeam-style: if a v25 entity is already selected and the cursor
      // is near one of its visible grip handles (within ~14 px), grab THAT
      // handle even if the click would otherwise hit a different entity or
      // empty space. Makes node-editing forgiving instead of pixel-precise.
      const nearestSel = (typeof v25NearestHandleOnSelected === 'function')
        ? v25NearestHandleOnSelected(activeBlock, cu, cv) : null;
      if (nearestSel) {
        if (!v25Selected.includes(nearestSel.ent.id)) v25Selected = [nearestSel.ent.id];
        v25Drag = { ent: nearestSel.ent, handle: nearestSel.handle, lastU: cu, lastV: cv };
        v25Drag.undoBefore = v25SnapshotMoveTargets(nearestSel.ent);
        if (typeof v25UpdateInspector === 'function') v25UpdateInspector();
        requestRender();
        return;
      }
      const hit = v25HitTest(activeBlock, cu, cv);
      if (hit) {
        v25Selected = e.shiftKey ? Array.from(new Set([...(v25Selected||[]), hit.id])) : [hit.id];
        // plate-grouping-stiffener — clicking any grouped member selects the
        // whole group so it highlights + moves as one (skip while Shift-adding).
        if (!e.shiftKey && typeof v25ExpandGroupSelection === 'function') v25ExpandGroupSelection();
        const handle = (typeof v25HitHandle === 'function') ? v25HitHandle(activeBlock, hit, cu, cv) : 'body';
        v25Drag = { ent: hit, handle, lastU: cu, lastV: cv };
        v25Drag.undoBefore = v25SnapshotMoveTargets(hit);
        if (typeof v25UpdateInspector === 'function') v25UpdateInspector();
        requestRender();
        return;
      } else if (!e.shiftKey) {
        // Don't deselect if the cursor is "kind of close" to any selected
        // entity — the user probably missed a handle and is about to try
        // again. Only clear when truly clicking empty space.
        const cursorPx = real2px(activeBlock, cu, cv);
        let nearSel = false;
        for (const id of v25Selected) {
          const ent = (entities2D[activeBlock.viewKey] || []).find(en => en.id === id);
          if (!ent) continue;
          const b = (typeof v25EntBounds === 'function') ? v25EntBounds(ent) : null;
          if (!b) continue;
          const tl = real2px(activeBlock, b.L, b.T);
          const br = real2px(activeBlock, b.R, b.B);
          const minX = Math.min(tl.x, br.x), maxX = Math.max(tl.x, br.x);
          const minY = Math.min(tl.y, br.y), maxY = Math.max(tl.y, br.y);
          const PAD = 24;
          if (cursorPx.x >= minX - PAD && cursorPx.x <= maxX + PAD &&
              cursorPx.y >= minY - PAD && cursorPx.y <= maxY + PAD) { nearSel = true; break; }
        }
        if (!nearSel) {
          v25Selected = [];
          const root = document.getElementById('inspectorRoot');
          if (root && sheetMode === '2d') root.innerHTML = '';
          // Start V25 marquee (Bluebeam/AutoCAD-style). Mouseup branch in this
          // file finalises window-vs-crossing against entities2D + v25EntBounds.
          selBoxStart = [cu, cv];
          selBoxMode = '2d';
          requestRender();
          return;
        }
      } else if (e.shiftKey) {
        // Shift + click on empty V25 canvas — start an additive marquee.
        // Without this branch Shift on empty space is a silent no-op in V25
        // mode, which breaks the user's "Shift = add to selection" muscle
        // memory from Bluebeam/AutoCAD.
        selBoxStart = [cu, cv];
        selBoxMode = '2d';
        requestRender();
        return;
      }
    }

    // V25 — 2D Studio click dispatch (frame, mat, wall, anchor, bar, mesh,
    // leader, mem2). Returns true when the click was consumed.
    if (typeof v25TryHandleClick === 'function' && v25TryHandleClick(activeBlock, cu, cv, e)) {
      return;
    }

    // Place component (legacy — kept for compatibility)
    if (tool === 'place-component' && placing) {
      placeComponent(activeBlock, cu, cv);
      requestRender(); return;
    }

    // Two-click draw-member
    if (tool === 'draw-member' && drawMember) {
      if (drawMember.type === 'bolt') {
        // Bolts: single click placement (no line drawing needed)
        finishDrawMember(activeBlock, cu, cv, cu, cv);
        requestRender(); return;
      }
      if (!drawStart) {
        // First click: set start point
        drawStart = { blk: activeBlock, cu, cv };
        drawPreviewEnd = { cu, cv };
        requestRender(); return;
      } else {
        // Second click: finish the member
        finishDrawMember(drawStart.blk, drawStart.cu, drawStart.cv, cu, cv);
        requestRender(); return;
      }
    }

    // Draw plate polygon
    if (tool === 'draw-plate') {
      // If typed dimension is active, apply it first
      if (plateDimActive && plateDimInput && platePts.length > 0) {
        const len = parseFloat(plateDimInput);
        if (len > 0) {
          const last = platePts[platePts.length - 1];
          const du = cu - last.u, dv = cv - last.v;
          const angle = Math.atan2(dv, du);
          // Lock the point at exact typed length in the direction of cursor
          const nu = last.u + Math.cos(angle) * len;
          const nv = last.v + Math.sin(angle) * len;
          platePts.push({ u: nu, v: nv });
          plateDimInput = ''; plateDimActive = false;
          requestRender(); return;
        }
      }
      // Set the block on first click
      if (platePts.length === 0) plateBlock = activeBlock;
      // Only allow drawing within the same block
      if (activeBlock !== plateBlock) { requestRender(); return; }
      platePts.push({ u: cu, v: cv });
      plateDimInput = ''; plateDimActive = false;
      requestRender(); return;
    }

    // Dimension
    if (tool === 'dimension') {
      if (dimType === 'angular') {
        // Angular: 3 clicks — vertex, ray1 end, ray2 end
        if (dimStep === 0) { dimP1 = [cu, cv]; dimStep = 1; }
        else if (dimStep === 1) { dimP2 = [cu, cv]; dimStep = 2; }
        else if (dimStep === 2) {
          addEnt2D(mkEnt2D(activeBlock.viewKey, 'dim', {
            p1u:dimP1[0], p1v:dimP1[1], p2u:dimP2[0], p2v:dimP2[1],
            p3u:cu, p3v:cv, dimType:'angular', lw:0.18
          }));
          dimStep = 0; dimP1 = null; dimP2 = null;
        }
      } else {
        // Horizontal / vertical / aligned: 3 clicks — P1, P2, offset
        if (dimStep === 0) { dimP1 = [cu, cv]; dimStep = 1; }
        else if (dimStep === 1) { dimP2 = [cu, cv]; dimStep = 2; }
        else if (dimStep === 2) {
          let off;
          if (dimType === 'aligned') {
            const du=dimP2[0]-dimP1[0], dv=dimP2[1]-dimP1[1], len=Math.hypot(du,dv);
            if (len<0.1) off = 20;
            else { const nx=-dv/len, ny=du/len; off = (cu-dimP1[0])*nx + (cv-dimP1[1])*ny || 20; }
          } else if (dimType === 'vertical') {
            // Vertical dim: offset = distance from dim line (vertical line at min u) to
            // the cursor along U. User places dim line to the LEFT of points.
            const leftU = Math.min(dimP1[0], dimP2[0]);
            off = Math.max(5, leftU - cu) || 20;
          } else {
            off = (cv - dimP1[1]) || 20;
          }
          addEnt2D(mkEnt2D(activeBlock.viewKey, 'dim', {
            p1u:dimP1[0], p1v:dimP1[1], p2u:dimP2[0], p2v:dimP2[1],
            off:off, dimType:dimType, lw:0.18
          }));
          dimStep = 0; dimP1 = null; dimP2 = null;
        }
      }
      requestRender(); return;
    }

    // Bolt group placement
    if (tool === 'place-bolt-group' && boltGroupConfig) {
      const cfg = boltGroupConfig;
      const hg = (cfg.cols - 1) * cfg.gauge / 2;
      const hp = (cfg.rows - 1) * cfg.pitch / 2;
      const before = objects3D.length;
      for (let r = 0; r < cfg.rows; r++) {
        for (let c = 0; c < cfg.cols; c++) {
          const bu = cu - hg + c * cfg.gauge;
          const bv = cv - hp + r * cfg.pitch;
          const pos = activeBlock.unproject(bu, bv);
          const bx = pos.x !== undefined ? pos.x : 0;
          const by = pos.y !== undefined ? pos.y : 0;
          const bz = pos.z !== undefined ? pos.z : 0;
          addObj(mkObj('bolt', { boltSize: cfg.boltSize, x: bx, y: by, z: bz }));
        }
      }
      requestRender(); return;
    }

    // Weld symbol placement (AS 1101.3). Two-click: first click anchors the
    // joint point, second click picks the arrow direction. The weld dialog
    // then captures type / size / modifiers / tail.
    if (tool === 'draw-weld') {
      if (weldStep === 0) { weldP1 = { u: cu, v: cv }; weldStep = 1; }
      else {
        const angle = Math.atan2(cv - weldP1.v, cu - weldP1.u);
        const p1 = weldP1;
        const viewKey = activeBlock.viewKey;
        openWeldDialog((params) => {
          addEnt2D(mkEnt2D(viewKey, 'weld', Object.assign({
            u: p1.u, v: p1.v, angle,
          }, params)));
          requestRender();
        });
        weldStep = 0; weldP1 = null;
      }
      requestRender(); return;
    }

    // Break line placement (two-click like line)
    if (tool === 'draw-breakline') {
      if (clickPts.length === 0) { clickPts.push({ u:cu, v:cv }); }
      else {
        const p = clickPts[0];
        addEnt2D(mkEnt2D(activeBlock.viewKey, 'breakline', { u1:p.u, v1:p.v, u2:cu, v2:cv, lw:0.35 }));
        clickPts = [];
      }
      requestRender(); return;
    }

    // Centreline placement (two-click like line)
    if (tool === 'draw-centreline') {
      if (clickPts.length === 0) { clickPts.push({ u:cu, v:cv }); }
      else {
        const p = clickPts[0];
        addEnt2D(mkEnt2D(activeBlock.viewKey, 'centreline', { u1:p.u, v1:p.v, u2:cu, v2:cv, lw:0.18, ls:'centre' }));
        clickPts = [];
      }
      requestRender(); return;
    }

    // V17 slotted hole — one click to place a standard M20 slot (22×40)
    if (tool === 'draw-slot') {
      addEnt2D(mkEnt2D(activeBlock.viewKey, 'slot', {
        u: cu, v: cv, dia: 22, length: 40, angle: 0, lw: LW.VIS,
      }));
      requestRender(); return;
    }

    // V18 section mark — two-click with auto-assigned letter
    if (tool === 'draw-sectionmark') {
      if (clickPts.length === 0) { clickPts.push({ u: cu, v: cv }); }
      else {
        const p = clickPts[0];
        addEnt2D(mkEnt2D(activeBlock.viewKey, 'sectionMark', {
          u1: p.u, v1: p.v, u2: cu, v2: cv,
          label: nextSectionMarkLabel(), lw: LW.CUT,
        }));
        clickPts = [];
      }
      requestRender(); return;
    }

    // V18 member tag — click 1 = anchor member (must have one selected),
    // click 2 = label position. If nothing selected, prompts.
    if (tool === 'place-member-tag') {
      if (clickPts.length === 0) {
        const m = selected3D.length === 1 ? selected3D[0] : null;
        if (!m) { alert('Select one member first, then click near it to anchor, then click again where the label should sit.'); return; }
        clickPts.push({ u: cu, v: cv, memberId: m.id });
      } else {
        const anchor = clickPts[0];
        addEnt2D(mkEnt2D(activeBlock.viewKey, 'memberTag', {
          memberId: anchor.memberId,
          anchorU: anchor.u, anchorV: anchor.v,
          u: cu, v: cv, lw: LW.DIM,
        }));
        clickPts = [];
      }
      requestRender(); return;
    }

    // V18 bolt callout — requires N bolts selected; click = text location
    if (tool === 'place-bolt-callout') {
      const bolts = selected3D.filter(o => o.type === 'bolt');
      if (bolts.length < 1) {
        alert('Select bolts first (drag a box around them), then click this tool and pick the text location.');
        return;
      }
      // Use first selected bolt's location as the anchor, and dominant bolt
      // size as the callout text.
      const counts = {};
      for (const b of bolts) counts[b.boltSize || 'M20'] = (counts[b.boltSize || 'M20'] || 0) + 1;
      const [size, count] = Object.entries(counts).sort((a,b) => b[1]-a[1])[0];
      const anchor = bolts[0];
      // Project the 3D bolt position into this view's (u,v) coords
      let au = anchor.x, av = anchor.y;
      if (activeBlock.viewKey === 'sectionA') { au = anchor.z; av = anchor.y; }
      else if (activeBlock.viewKey === 'planB') { au = anchor.x; av = anchor.z; }
      addEnt2D(mkEnt2D(activeBlock.viewKey, 'boltCallout', {
        anchorU: au, anchorV: av,
        u: cu, v: cv,
        count, size, grade: '8.8', cat: 'S', lw: LW.DIM,
      }));
      requestRender(); return;
    }

    // V18 material tag — click 1 = anchor, click 2 = text location, prompt
    if (tool === 'place-material-tag') {
      if (clickPts.length === 0) {
        clickPts.push({ u: cu, v: cv });
      } else {
        const anchor = clickPts[0];
        const txt = prompt('Material tag text (e.g. "PL 12 THK"):', 'PL 12 THK');
        if (txt) {
          addEnt2D(mkEnt2D(activeBlock.viewKey, 'materialTag', {
            anchorU: anchor.u, anchorV: anchor.v,
            u: cu, v: cv, text: txt, lw: LW.DIM,
          }));
        }
        clickPts = [];
      }
      requestRender(); return;
    }

    // V19 revision triangle — one click, prompt for rev number
    if (tool === 'place-rev-triangle') {
      const revStr = prompt('Revision number:', String(sheetInfo.revision || '1'));
      if (revStr !== null) {
        // V22.6 — also capture description so the rev schedule can use it
        const desc = prompt('Revision description (optional, for schedule):', '') || '';
        const date = prompt('Revision date (optional):',
          new Date().toISOString().slice(0, 10)) || '';
        addEnt2D(mkEnt2D(activeBlock.viewKey, 'revisionTriangle', {
          u: cu, v: cv, rev: revStr, description: desc, date, lw: LW.MW,
        }));
      }
      requestRender(); return;
    }

    // V22.6 — Rev Schedule: click to place a table anchored at its top-left.
    // The table auto-fills from all revisionTriangle entities on this sheet.
    if (tool === 'place-rev-schedule') {
      addEnt2D(mkEnt2D(activeBlock.viewKey, 'revSchedule', {
        u: cu, v: cv, lw: 0.30,
      }));
      requestRender(); return;
    }

    // V19 revision cloud — multi-click polygon, dbl-click / Enter to close
    if (tool === 'draw-rev-cloud') {
      const lastPP = polyPts.length > 0 ? polyPts[polyPts.length - 1] : null;
      if (!lastPP || Math.hypot(cu - lastPP.u, cv - lastPP.v) > 0.1) {
        polyPts.push({ u: cu, v: cv });
      }
      requestRender(); return;
    }

    // V19 detail reference callout — one click, prompt for detail + sheet
    if (tool === 'place-detail-ref') {
      const det = prompt('Detail number:', '3');
      if (det === null) return;
      const sht = prompt('Sheet reference:', 'S-400');
      if (sht === null) return;
      addEnt2D(mkEnt2D(activeBlock.viewKey, 'detailRef', {
        u: cu, v: cv, detail: det, sheet: sht, lw: LW.MW,
      }));
      requestRender(); return;
    }

    // V20 mirror — two clicks define the mirror axis in the active view,
    // all currently-selected objects + that view's 2D entities are mirrored.
    if (tool === 'mirror') {
      if (mirrorStep === 0) { mirrorP1 = { u: cu, v: cv }; mirrorStep = 1; requestRender(); return; }
      else {
        const a1 = mirrorP1, a2 = { u: cu, v: cv };
        performMirror(a1, a2, activeBlock.viewKey);
        mirrorStep = 0; mirrorP1 = null;
        requestRender();
        return;
      }
    }

    // V19 detail card — two-click rectangle, then prompt for number/title/scale
    if (tool === 'draw-detail-card') {
      if (clickPts.length === 0) { clickPts.push({ u: cu, v: cv }); }
      else {
        const p = clickPts[0];
        const detailNo = prompt('Detail number:', '1') || '1';
        const title = prompt('Detail title (optional):', '') || '';
        const scale = prompt('Scale:', '1:10') || '1:10';
        addEnt2D(mkEnt2D(activeBlock.viewKey, 'detailCard', {
          u: Math.min(p.u, cu), v: Math.min(p.v, cv),
          w: Math.abs(cu - p.u), h: Math.abs(cv - p.v),
          detailNo, title, scale, lw: LW.VIS_HEAVY,
        }));
        clickPts = [];
      }
      requestRender(); return;
    }

    // Text
    if (tool === 'text') {
      const txt = prompt('Enter text:');
      if (txt) addEnt2D(mkEnt2D(activeBlock.viewKey, 'text', { u:cu, v:cv, text:txt, sz:3 }));
      requestRender(); return;
    }

    // Polyline
    if (tool === 'polyline') {
      const lastPP = polyPts.length > 0 ? polyPts[polyPts.length - 1] : null;
      if (!lastPP || Math.hypot(cu - lastPP.u, cv - lastPP.v) > 0.1) {
        polyPts.push({ u: cu, v: cv });
      }
      requestRender(); return;
    }

    // Line
    if (tool === 'line') {
      if (clickPts.length === 0) { clickPts.push({ u:cu, v:cv }); }
      else {
        const p = clickPts[0];
        if (Math.hypot(cu-p.u, cv-p.v) > 0.5) {
          addEnt2D(mkEnt2D(activeBlock.viewKey, 'line', { u1:p.u, v1:p.v, u2:cu, v2:cv, lw:0.35 }));
        }
        clickPts = [{ u:cu, v:cv }];
      }
      requestRender(); return;
    }

    // V22.3 — Arc (3-point): start, midpoint, end
    if (tool === 'arc') {
      clickPts.push({ u: cu, v: cv });
      if (clickPts.length === 3) {
        // Compute arc from 3 points: circle through p1, p2, p3
        const [p1, p2, p3] = clickPts;
        // Derive circumscribed circle centre via determinant formula
        const ax = p1.u, ay = p1.v, bx = p2.u, by = p2.v, cx2 = p3.u, cy = p3.v;
        const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx2 * (ay - by));
        if (Math.abs(d) > 0.0001) {
          const ux = ((ax*ax + ay*ay) * (by - cy) + (bx*bx + by*by) * (cy - ay) + (cx2*cx2 + cy*cy) * (ay - by)) / d;
          const uy = ((ax*ax + ay*ay) * (cx2 - bx) + (bx*bx + by*by) * (ax - cx2) + (cx2*cx2 + cy*cy) * (bx - ax)) / d;
          const r = Math.hypot(ax - ux, ay - uy);
          const a0 = Math.atan2(ay - uy, ax - ux);
          const a1 = Math.atan2(cy - uy, cx2 - ux);
          // Determine arc direction from midpoint
          const aMid = Math.atan2(by - uy, bx - ux);
          // If midpoint angle is between a0 and a1 (counter-clockwise), ccw=false
          // Otherwise we need to sweep the other way
          const normalise = (a) => { while (a < 0) a += Math.PI * 2; while (a >= Math.PI * 2) a -= Math.PI * 2; return a; };
          const a0n = normalise(a0), a1n = normalise(a1), aMn = normalise(aMid);
          let ccw = false;
          if (a0n < a1n) ccw = !(aMn > a0n && aMn < a1n);
          else ccw = !(aMn > a0n || aMn < a1n);
          addEnt2D(mkEnt2D(activeBlock.viewKey, 'arc', {
            cu: ux, cv: uy, r, a0, a1, ccw, lw: 0.35
          }));
        }
        clickPts = [];
      }
      requestRender(); return;
    }

    // V22.3 — Regular polygon (2 clicks: centre, then vertex).
    // Default 6 sides; user can re-run to change. (Sides input via prompt for simplicity.)
    if (tool === 'polygon') {
      if (clickPts.length === 0) {
        clickPts.push({ u: cu, v: cv });
      } else {
        const c = clickPts[0];
        const r = Math.hypot(cu - c.u, cv - c.v);
        if (r > 0.5) {
          const sidesStr = prompt('Number of sides:', '6');
          const sides = Math.max(3, Math.min(24, parseInt(sidesStr) || 6));
          const startAngle = Math.atan2(cv - c.v, cu - c.u);
          const pts = [];
          for (let i = 0; i < sides; i++) {
            const a = startAngle + i * 2 * Math.PI / sides;
            pts.push({ u: c.u + r * Math.cos(a), v: c.v + r * Math.sin(a) });
          }
          addEnt2D(mkEnt2D(activeBlock.viewKey, 'polygon', { pts, lw: 0.35 }));
        }
        clickPts = [];
      }
      requestRender(); return;
    }

    // V22.5 — Grid line: 2 clicks define the line endpoints, then prompt for label.
    if (tool === 'draw-gridline') {
      if (clickPts.length === 0) { clickPts.push({ u: cu, v: cv }); }
      else {
        const p = clickPts[0];
        const label = prompt('Grid label (A, B, 1, 2, …):', 'A') || 'A';
        addEnt2D(mkEnt2D(activeBlock.viewKey, 'gridLine', {
          u1: p.u, v1: p.v, u2: cu, v2: cv, label, bubbleEnd: 'start', lw: 0.30
        }));
        clickPts = [];
      }
      requestRender(); return;
    }

    // V22.5 — Note: click 1 = anchor (what the note points at), click 2 = text position.
    if (tool === 'place-note') {
      if (clickPts.length === 0) {
        clickPts.push({ u: cu, v: cv });
      } else {
        const anchor = clickPts[0];
        const txt = prompt('Note text (use \\n for newline):', '');
        if (txt) {
          addEnt2D(mkEnt2D(activeBlock.viewKey, 'note', {
            anchorU: anchor.u, anchorV: anchor.v,
            u: cu, v: cv,
            text: txt.replace(/\\n/g, '\n'),
            lw: 0.30
          }));
        }
        clickPts = [];
      }
      requestRender(); return;
    }

    // V22.6 — Hatch: multi-click polygon, Enter/dblclick to close + prompt for pattern.
    if (tool === 'draw-hatch') {
      const lastPP = polyPts.length > 0 ? polyPts[polyPts.length - 1] : null;
      if (!lastPP || Math.hypot(cu - lastPP.u, cv - lastPP.v) > 0.1) {
        polyPts.push({ u: cu, v: cv });
      }
      requestRender(); return;
    }

    // V22.6 — MText: click to place, prompt for text + width.
    if (tool === 'place-mtext') {
      const txt = prompt('Text (use \\n for explicit line breaks):', '');
      if (txt) {
        const widthStr = prompt('Max width (mm):', '100');
        const width = parseFloat(widthStr) || 100;
        addEnt2D(mkEnt2D(activeBlock.viewKey, 'mtext', {
          u: cu, v: cv, text: txt.replace(/\\n/g, '\n'), sz: 3, width, lw: 0.30
        }));
      }
      requestRender(); return;
    }

    // V22.4 — Fillet: click near a polygon-plate vertex to round it with a
    // user-specified radius. Inserts extra polygon vertices approximating
    // the arc. Currently supports elevation-view face (polyPts direction).
    if (tool === 'fillet' || tool === 'chamfer') {
      const isFillet = tool === 'fillet';
      // Find polygon-plate under cursor
      const hit = objects3D.find(o =>
        o.type === 'plate' && o.polyPts &&
        (o.normal === (activeBlock.viewKey === 'elevation' ? 'z'
                     : activeBlock.viewKey === 'sectionA' ? 'x' : 'y'))
      );
      if (!hit) {
        alert((isFillet ? 'Fillet' : 'Chamfer') + ': click on a polygon plate vertex — no plate found in this view.');
        return;
      }
      // Find nearest vertex (in view-local coords)
      const vk = activeBlock.viewKey;
      const projPt = (p) => {
        if (vk === 'elevation') return { u: hit.x + p.dx, v: hit.y + p.dy };
        if (vk === 'sectionA')  return { u: hit.z + p.dz, v: hit.y + p.dy };
        return { u: hit.x + p.dx, v: hit.z + p.dz };
      };
      let nearestIdx = -1, bestD = Infinity;
      for (let i = 0; i < hit.polyPts.length; i++) {
        const pw = projPt(hit.polyPts[i]);
        const d = Math.hypot(cu - pw.u, cv - pw.v);
        if (d < bestD) { bestD = d; nearestIdx = i; }
      }
      const tol = 15 * drawingScale / viewport.zoom;
      if (nearestIdx < 0 || bestD > tol) {
        alert((isFillet ? 'Fillet' : 'Chamfer') + ': click closer to a vertex of a polygon plate.');
        return;
      }
      const sizeStr = prompt(isFillet ? 'Fillet radius (mm):' : 'Chamfer distance (mm):', isFillet ? '10' : '10');
      const size = parseFloat(sizeStr);
      if (!size || size <= 0) return;

      const n = hit.polyPts.length;
      const prev = hit.polyPts[(nearestIdx - 1 + n) % n];
      const curr = hit.polyPts[nearestIdx];
      const next = hit.polyPts[(nearestIdx + 1) % n];

      // Vectors from corner toward adjacent vertices (view-local u/v)
      const uvOf = (p) => vk === 'elevation' ? [p.dx, p.dy]
                        : vk === 'sectionA'  ? [p.dz, p.dy]
                        :                      [p.dx, p.dz];
      const [cU, cV] = uvOf(curr);
      const [pU, pV] = uvOf(prev);
      const [nU, nV] = uvOf(next);
      const v1 = [pU - cU, pV - cV]; const v1len = Math.hypot(v1[0], v1[1]);
      const v2 = [nU - cU, nV - cV]; const v2len = Math.hypot(v2[0], v2[1]);
      if (v1len < 0.01 || v2len < 0.01) return;
      const u1x = v1[0]/v1len, u1y = v1[1]/v1len;
      const u2x = v2[0]/v2len, u2y = v2[1]/v2len;
      const d = Math.min(size, v1len * 0.49, v2len * 0.49);

      // Points at distance d from corner along each edge
      const pA = [cU + u1x * d, cV + u1y * d];
      const pB = [cU + u2x * d, cV + u2y * d];

      const delta = { pA: _uvToDelta(vk, pA, curr), pB: _uvToDelta(vk, pB, curr) };

      let insertion;
      if (!isFillet) {
        // Chamfer: replace corner with two vertices pA, pB
        insertion = [delta.pA, delta.pB];
      } else {
        // Fillet: approximate arc from pA to pB using 8 intermediate points.
        // Approximate arc centre by offsetting from the corner bisector.
        // For 90° corners this gives an accurate fillet; for skewed corners
        // the visual result is still a smooth rounded transition.
        const bisX = u1x + u2x, bisY = u1y + u2y;
        const bisLen = Math.hypot(bisX, bisY);
        if (bisLen < 0.01) { insertion = [delta.pA, delta.pB]; }
        else {
          const sinHalf = Math.abs(u1x * u2y - u1y * u2x) * 0.5;
          const centreDist = d / Math.max(0.05, sinHalf);
          const cx = cU + (bisX / bisLen) * centreDist;
          const cy = cV + (bisY / bisLen) * centreDist;
          const rr = Math.hypot(pA[0] - cx, pA[1] - cy);
          const a0 = Math.atan2(pA[1] - cy, pA[0] - cx);
          const a1 = Math.atan2(pB[1] - cy, pB[0] - cx);
          let delta2 = a1 - a0;
          while (delta2 >  Math.PI) delta2 -= Math.PI * 2;
          while (delta2 < -Math.PI) delta2 += Math.PI * 2;
          const steps = 8;
          const arcPts = [];
          for (let i = 0; i <= steps; i++) {
            const a = a0 + delta2 * (i / steps);
            arcPts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
          }
          insertion = arcPts.map(p => _uvToDelta(vk, p, curr));
        }
      }

      // Replace the corner vertex with the inserted points (snapshot for undo)
      const before = JSON.parse(JSON.stringify(hit));
      hit.polyPts.splice(nearestIdx, 1, ...insertion);
      undoStack.push({ act: 'moveObj', before: [before], after: [JSON.parse(JSON.stringify(hit))] });
      if (typeof v3dMarkDirty === 'function') v3dMarkDirty();
      if (typeof invalidateWeldCache === 'function') invalidateWeldCache();
      requestRender();
      return;
    }

    // V22.3 — Offset: pick an existing line, then click which side + distance
    // via the click position. Creates a new line parallel to the source.
    if (tool === 'offset') {
      // Step 1: find the line under the cursor (from the entities in this view)
      if (!clickPts.length) {
        const viewEnts = entities2D[activeBlock.viewKey] || [];
        let bestLine = null;
        let bestD = Infinity;
        const tol = 10 * drawingScale / viewport.zoom;
        for (const e of viewEnts) {
          if (e.type !== 'line') continue;
          // Distance from (cu,cv) to the line segment
          const dx = e.u2 - e.u1, dy = e.v2 - e.v1;
          const lenSq = dx * dx + dy * dy;
          if (lenSq < 0.0001) continue;
          const t = Math.max(0, Math.min(1, ((cu - e.u1) * dx + (cv - e.v1) * dy) / lenSq));
          const px = e.u1 + t * dx, py = e.v1 + t * dy;
          const d = Math.hypot(cu - px, cv - py);
          if (d < bestD && d < tol) { bestD = d; bestLine = e; }
        }
        if (bestLine) {
          clickPts.push({ u: cu, v: cv, source: bestLine });
        } else {
          alert('Offset: click on a line first to select it, then click to set the offset side + distance.');
        }
      } else {
        // Step 2: compute perpendicular offset from source line to cursor
        const source = clickPts[0].source;
        const dx = source.u2 - source.u1, dy = source.v2 - source.v1;
        const len = Math.hypot(dx, dy);
        if (len > 0.0001) {
          const nx = -dy / len, ny = dx / len;   // perpendicular unit vector
          // Signed distance from source line to cursor (positive = nx,ny side)
          const off = (cu - source.u1) * nx + (cv - source.v1) * ny;
          addEnt2D(mkEnt2D(activeBlock.viewKey, 'line', {
            u1: source.u1 + nx * off, v1: source.v1 + ny * off,
            u2: source.u2 + nx * off, v2: source.v2 + ny * off,
            lw: source.lw || 0.35
          }));
        }
        clickPts = [];
      }
      requestRender(); return;
    }

    // Rect
    if (tool === 'rect') {
      if (clickPts.length === 0) { clickPts.push({ u:cu, v:cv }); }
      else {
        const p = clickPts[0];
        const w = Math.abs(cu-p.u), h = Math.abs(cv-p.v);
        if (w > 0.5 && h > 0.5) {
          addEnt2D(mkEnt2D(activeBlock.viewKey, 'rect', { u:Math.min(p.u,cu), v:Math.min(p.v,cv), w, h, lw:0.35 }));
        }
        clickPts = [];
      }
      requestRender(); return;
    }

    // Circle
    if (tool === 'circle') {
      if (clickPts.length === 0) { clickPts.push({ u:cu, v:cv }); }
      else {
        const p = clickPts[0];
        const r = Math.hypot(cu-p.u, cv-p.v);
        if (r > 0.5) addEnt2D(mkEnt2D(activeBlock.viewKey, 'circle', { cu:p.u, cv:p.v, r, lw:0.35 }));
        clickPts = [];
      }
      requestRender(); return;
    }

    // Select
    if (tool === 'select') {
      // Check grip handles first (only when something is selected)
      if (selected3D.length > 0) {
        const grip = hitTestGrip(activeBlock, px, py);
        if (grip) {
          // Legacy scalar-rot rotateMode is for non-member objects (plates).
          // Members use the V24.A5 frame-tilt grip via the standard
          // grip-drag path below.
          if (grip.type === 'rotate' && !isMemberType(grip.obj.type)) {
            rotateMode = true;
            const b = getObj2DBounds(grip.obj, activeBlock);
            const mu = (b.u1 + b.u2) / 2, mv = (b.v1 + b.v2) / 2;
            rotatePivot = { u: mu, v: mv };
            const real = px2real(activeBlock, px, py);
            rotateStartAngle = Math.atan2(real.v - rotatePivot.v, real.u - rotatePivot.u);
            gripSnapshot = JSON.parse(JSON.stringify(grip.obj));
            activeGrip = grip;
            requestRender(); return;
          }
          // Start grip drag (resize/extend)
          activeGrip = grip;
          const real = px2real(activeBlock, px, py);
          gripStart = { u: real.u, v: real.v };
          gripSnapshot = JSON.parse(JSON.stringify(grip.obj));
          requestRender(); return;
        }
      }

      const hit = hitTest3D(activeBlock, px, py);
      if (hit) {
        if (e.shiftKey) {
          if (selected3D.includes(hit)) selected3D = selected3D.filter(s => s !== hit);
          else selected3D.push(hit);
        } else {
          if (!selected3D.includes(hit)) selected3D = [hit];
          const real = px2real(activeBlock, px, py);
          dragMoving = true;
          dragStart = { u: real.u, v: real.v };
          dragSnapshots = selected3D.map(o => JSON.parse(JSON.stringify(o)));
          snapOffsetU = 0; snapOffsetV = 0; snappedAxisU = false; snappedAxisV = false;
        }
      } else {
        if (!e.shiftKey) selected3D = [];
        const real = px2real(activeBlock, px, py);
        selBoxStart = [real.u, real.v];
        selBoxMode = '3d';
      }
      requestRender(); return;
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    const { px, py } = getPixelXY(e);
    cursorSheet = { px, py };

    // 3D orbit handling
    if (v3dOrbiting) {
      v3dHandleOrbitMove(px, py);
      return;
    }

    // Cut line dragging
    if (draggingCutLine && activeBlock) {
      const real = px2real(activeBlock, px, py);
      if (draggingCutLine === 'secA') {
        secCutX = Math.round(real.u / gridSize) * gridSize; // snap to grid
      } else if (draggingCutLine === 'planB') {
        planCutY = Math.round(real.v / gridSize) * gridSize;
      }
      canvas.style.cursor = draggingCutLine === 'secA' ? 'ew-resize' : 'ns-resize';
      requestRender(); return;
    }

    // View box resize dragging
    if (blockResizing && blockResizeStart) {
      const sh = px2s(px, py);
      const dx = sh.x - blockResizeStart.sx;
      const dy = sh.y - blockResizeStart.sy;
      const h = blockResizing.handle;
      const blk = blockResizing.block;
      const oW = blockResizeStart.boxW, oH = blockResizeStart.boxH;
      const oX = blockResizeStart.sheetX, oY = blockResizeStart.sheetY;
      let newW = oW, newH = oH, newX = oX, newY = oY;
      // East edge: right side moves by dx, left side fixed → W grows, centre shifts right by dx/2
      if (h.includes('e')) { newW = Math.max(MIN_BOX_W, oW + dx); newX = oX + dx / 2; }
      // West edge: left side moves by dx, right side fixed → W shrinks, centre shifts right by dx/2
      if (h.includes('w')) { newW = Math.max(MIN_BOX_W, oW - dx); newX = oX + dx / 2; }
      // South edge: bottom moves by dy, top fixed
      if (h.includes('s')) { newH = Math.max(MIN_BOX_H, oH + dy); newY = oY + dy / 2; }
      // North edge: top moves by dy, bottom fixed
      if (h.includes('n')) { newH = Math.max(MIN_BOX_H, oH - dy); newY = oY + dy / 2; }
      blk.boxW = newW; blk.boxH = newH;
      blk.sheetX = newX; blk.sheetY = newY;
      canvas.style.cursor = resizeHandleCursor(h);
      requestRender(); return;
    }

    // Block dragging (border or label)
    if (blockDragging && blockDragOffset) {
      const sh = px2s(px, py);
      blockDragging.sheetX = sh.x - blockDragOffset.dx;
      blockDragging.sheetY = sh.y - blockDragOffset.dy;
      canvas.style.cursor = 'move';
      requestRender(); return;
    }

    // v1 V25 plate hover snap probe retired by architecture-v2 Phase 2.
    // v2 plate snap will land when the v2 selection/grip layer (Phase 10)
    // brings host-edge soft-snap onto the v2 pointer pipeline.

    // V25 — when in select tool and 2D mode and NOT currently dragging,
    // run a hover-pick so the user gets cursor feedback + visible grip
    // highlight before they click. This makes node-editing feel reactive.
    if (sheetMode === '2d' && tool === 'select' && !v25Drag && !blockDragging && !blockResizing && !selBoxStart && activeBlock) {
      const real = px2real(activeBlock, px, py);
      const hover = (typeof v25HoverPick === 'function') ? v25HoverPick(activeBlock, real.u, real.v) : null;
      const newHover = hover ? { entId: hover.ent.id, handle: hover.handle } : null;
      // Only re-render if hover state actually changed.
      const changed = (!!v25Hover) !== (!!newHover) ||
        (v25Hover && newHover && (v25Hover.entId !== newHover.entId || v25Hover.handle !== newHover.handle));
      v25Hover = newHover;
      // Cursor feedback
      if (newHover) {
        if (newHover.handle === 'rotate') canvas.style.cursor = 'grab';
        else if (newHover.handle && newHover.handle !== 'body') canvas.style.cursor = 'crosshair';
        else if (newHover.handle === 'body') canvas.style.cursor = 'move';
        else canvas.style.cursor = 'pointer';
      } else if (canvas.style.cursor !== 'default') {
        canvas.style.cursor = 'default';
      }
      if (changed) requestRender();
    }

    // V25 — drag selected v25 entity (or its handle)
    if (sheetMode === '2d' && v25Drag && activeBlock) {
      v25Hover = null; // hide hover affordance during drag
      const real = px2real(activeBlock, px, py);
      // Snap to grid for clean placement
      const u = snapOn ? Math.round(real.u / gridSize) * gridSize : real.u;
      const v = snapOn ? Math.round(real.v / gridSize) * gridSize : real.v;
      const du = u - v25Drag.lastU, dv = v - v25Drag.lastV;
      if (du !== 0 || dv !== 0) {
        v25Move(v25Drag.ent, du, dv, v25Drag.handle);
        // V25-layout-overhaul Phase 6.3 — body-translation snap. Only fires
        // when the user is moving the whole member (not pulling an end-handle
        // or rotation handle), so end-edits stay precise. Mutates ent.u/ent.v
        // when a snap catches; activeEdgeSnaps drives the dashed feedback
        // line via the existing drawEdgeSnapLines() in the main render path.
        // Body-translation soft-snap. Only fires on whole-entity drag (not
        // end-handle / vertex / rotate handles, so per-handle edits stay
        // precise). Architecture-v2 Phase 2 retired the v1 V25 plate leg
        // here; v2 plate body-snap arrives with Phase 10's grip migration.
        if (v25Drag.handle === 'body' && v25Drag.ent
            && v25Drag.ent.type === 'mem2') {
          activeEdgeSnaps = v25ApplySnap(activeBlock, [v25Drag.ent]);
        }
        v25Drag.lastU = u; v25Drag.lastV = v;
        canvas.style.cursor = (v25Drag.handle === 'body') ? 'move'
                            : (v25Drag.handle === 'rotate') ? 'grabbing' : 'crosshair';
        requestRender();
      }
      return;
    }

    if (isPanning && panLast) {
      viewport.panX += px - panLast.px;
      viewport.panY += py - panLast.py;
      panLast = { px, py };
      requestRender(); return;
    }

    // Grip drag (resize/extend)
    if (activeGrip && gripStart && !rotateMode && activeBlock) {
      const real = px2real(activeBlock, px, py);
      // Pass raw world coordinates — applyGripDrag handles rotation internally
      applyGripDrag(activeGrip, real.u, real.v);
      invalidateWeldCache();
      requestRender(); return;
    }

    // Rotation drag
    if (rotateMode && rotatePivot && activeGrip && activeBlock) {
      const real = px2real(activeBlock, px, py);
      const currentAngle = Math.atan2(real.v - rotatePivot.v, real.u - rotatePivot.u);
      const deltaAngle = (currentAngle - rotateStartAngle) * 180 / Math.PI;
      const baseRot = gripSnapshot.rot || 0;
      applyRotation(activeGrip.obj, baseRot + deltaAngle);
      invalidateWeldCache();
      requestRender(); return;
    }

    if (dragMoving && dragStart && activeBlock) {
      const real = px2real(activeBlock, px, py);
      const du = real.u - dragStart.u, dv = real.v - dragStart.v;
      const vk = activeBlock.viewKey;
      // Apply raw delta
      selected3D.forEach(obj => {
        if (vk === 'elevation') { obj.x += du; obj.y += dv; }
        else if (vk === 'sectionA') { obj.z += du; obj.y += dv; }
        else { obj.x += du; obj.z += dv; }
      });
      // Edge snap: check if any dragged edge is near a target face
      activeEdgeSnaps = applyEdgeSnap(selected3D, vk);
      dragStart = { u: real.u, v: real.v };
      invalidateWeldCache();
      requestRender(); return;
    }

    // Update cursor style for resize handles, border drag, grip hover, cut line hover.
    // V25 — in 2D mode the v25 hover-pick (above) owns the cursor, so skip
    // the 3D-only resize/cut-line affordances here.
    if (sheetMode !== '2d' && tool === 'select' && activeBlock && !dragMoving && !selBoxStart) {
      // Priority: resize handle > border > grip > cut line > default
      const rh = hitTestResizeHandle(activeBlock, px, py);
      if (rh) { canvas.style.cursor = resizeHandleCursor(rh); }
      else if (hitTestBlockBorder(activeBlock, px, py)) { canvas.style.cursor = 'move'; }
      else if (selected3D.length > 0) {
        const grip = hitTestGrip(activeBlock, px, py);
        if (grip) { canvas.style.cursor = grip.cursor; }
        else if (activeBlock.viewKey === 'elevation') {
          const cutHover = hitTestCutLine(activeBlock, px, py);
          canvas.style.cursor = cutHover === 'secA' ? 'ew-resize' : cutHover === 'planB' ? 'ns-resize' : 'default';
        } else { canvas.style.cursor = 'default'; }
      } else if (activeBlock.viewKey === 'elevation') {
        const cutHover = hitTestCutLine(activeBlock, px, py);
        canvas.style.cursor = cutHover === 'secA' ? 'ew-resize' : cutHover === 'planB' ? 'ns-resize' : 'default';
      } else { canvas.style.cursor = 'default'; }
    }

    // Update active block on hover
    const hoverBlock = blockAtPixel(px, py);
    if (hoverBlock && !dragMoving && !isPanning && !activeGrip && !rotateMode) activeBlock = hoverBlock;

    // Reset tab-to-cycle when cursor moves significantly
    if (cycleHits.length > 0) {
      if (!cycleLastPx || Math.hypot(px - cycleLastPx.px, py - cycleLastPx.py) > 3) {
        cycleHits = []; cycleIndex = 0;
      }
    }
    cycleLastPx = { px, py };

    requestRender();
  });

  // V25 — double-click on a CLOSED lineSet (when in select tool) opens a
  // hatch-pattern dropdown so the user can fill the polygon they just drew.
  canvas.addEventListener('dblclick', (e) => {
    if (sheetMode !== '2d') return;
    if (tool === 'select' && activeBlock) {
      const { px, py } = getPixelXY(e);
      const real = px2real(activeBlock, px, py);
      // plate-grouping-stiffener — double-click a plate↔flange joint opens the
      // weld / bolt / none menu (priority over the inspector-open dblclick).
      if (typeof v25JointTryMenu === 'function' &&
          v25JointTryMenu(activeBlock, real.u, real.v, e.clientX, e.clientY)) return;
      const hit = (typeof v25HitTest === 'function') ? v25HitTest(activeBlock, real.u, real.v) : null;
      // Premium note (noteBox): double-click opens the inline text editor. Uses
      // the same block-local coords as the other 2D click paths (real.u/real.v).
      if (typeof nbOpenEditorAt === 'function' && nbOpenEditorAt(activeBlock, real.u, real.v)) {
        e.preventDefault();
        return;
      }
      if (hit && hit.type === 'lineSet' && hit.closed) {
        if (typeof v25OpenFillPicker === 'function') v25OpenFillPicker(hit, e.clientX, e.clientY);
        e.preventDefault();
        return;
      }
      // Double-click on a steel-member end face (in elevation) → open a
      // small "end cap" dropdown so the user can flip that end between a
      // normal solid edge and a breakline. Mid-member double-clicks fall
      // through to the Settings tab.
      if (hit && hit.type === 'mem2' && (hit.aspect || 'elev') === 'elev'
          && typeof v25HitMemberEnd === 'function') {
        const which = v25HitMemberEnd(hit, real.u, real.v);
        if (which && typeof v25OpenEndCapPopup === 'function') {
          v25Selected = [hit.id];
          if (typeof v25UpdateInspector === 'function') v25UpdateInspector();
          v25OpenEndCapPopup(hit, which, e.clientX, e.clientY);
          e.preventDefault();
          return;
        }
      }
      // Double-click any v25 entity → select it and open the Settings tab so
      // the user sees every property (size, length, angle, colours, opacity).
      if (hit) {
        v25Selected = [hit.id];
        if (typeof v25UpdateInspector === 'function') v25UpdateInspector();
        if (typeof window.bbRailSwitchTab === 'function') window.bbRailSwitchTab('settings');
        e.preventDefault();
        return;
      }
    }
    if (tool === 'v25-line' && v25State.polyPts && v25State.polyPts.length >= 2) {
      const last = v25State.polyPts[v25State.polyPts.length - 1];
      const prev = v25State.polyPts[v25State.polyPts.length - 2];
      const ppmm = viewport.zoom / drawingScale;
      // If the last two clicks are within ~6 px on screen, treat as a dblclick
      // duplicate and drop the last one.
      if (Math.hypot(last.u - prev.u, last.v - prev.v) * ppmm < 6) {
        v25State.polyPts.pop();
      }
      if (typeof v25FinishLineSet === 'function' && v25State.polyPts.length >= 2) {
        v25FinishLineSet();
      } else {
        v25State.polyPts = []; requestRender();
      }
      e.preventDefault();
      return;
    }
    if (tool === 'v25-bar' && v25State.polyPts && v25State.polyPts.length >= 2) {
      const last = v25State.polyPts[v25State.polyPts.length - 1];
      const prev = v25State.polyPts[v25State.polyPts.length - 2];
      const ppmm = viewport.zoom / drawingScale;
      if (Math.hypot(last.u - prev.u, last.v - prev.v) * ppmm < 6) {
        v25State.polyPts.pop();
      }
      if (typeof v25FinishBarPoly === 'function' && v25State.polyPts.length >= 2) {
        v25FinishBarPoly();
      } else {
        v25State.polyPts = []; requestRender();
      }
      e.preventDefault();
    }
  });

  canvas.addEventListener('mouseup', (e) => {
    // V25-layout-overhaul — Phase 4 hatch tool decides drag vs click on release.
    // Runs before any other release logic so we don't double-handle the event.
    if (tool === 'v25-hatch' && v25State.hatchDownPx && v25State.hatchDownWorld
        && v25State.polyPts.length === 0 && activeBlock) {
      const dx = e.clientX - v25State.hatchDownPx.x;
      const dy = e.clientY - v25State.hatchDownPx.y;
      const moved = Math.hypot(dx, dy);
      const a = v25State.hatchDownWorld;
      if (moved > 4) {
        // Drag → rectangle from down position to release position
        const { px, py } = getPixelXY(e);
        const upR = px2real(activeBlock, px, py);
        const u = Math.min(a.u, upR.u), v = Math.min(a.v, upR.v);
        const w = Math.abs(upR.u - a.u), h = Math.abs(upR.v - a.v);
        if (w > 1 && h > 1) {
          v25Add('mat', { shape: 'rect', material: v25Last.material, u, v, w, h });
        }
      } else {
        // Click → start polyline at the down-world position
        v25State.polyPts.push({ u: a.u, v: a.v });
      }
      v25State.hatchDownPx = null;
      v25State.hatchDownWorld = null;
      requestRender();
      return;
    }
    // V25 plain text-box (v25-note) decides single-click vs press-drag-to-size
    // on release — mirrors the hatch tool branch above.
    if (tool === 'v25-note' && v25State.noteDownPx && v25State.noteDownWorld && activeBlock) {
      const dx = e.clientX - v25State.noteDownPx.x, dy = e.clientY - v25State.noteDownPx.y;
      const moved = Math.hypot(dx, dy);
      const { px, py } = getPixelXY(e);
      const up = px2real(activeBlock, px, py);
      if (typeof nbTextToolCommit === 'function') nbTextToolCommit(activeBlock, v25State.noteDownWorld, { u: up.u, v: up.v }, moved > 4);
      v25State.noteDownPx = null; v25State.noteDownWorld = null;
      requestRender();
      return;
    }
    // v1 V25 plate placement commit branch retired by architecture-v2
    // Phase 2 on 2026-05-22. v2 plates commit through
    // js/v2/tools/place-plate-tool.js's onPointerUp ->
    // placeElementTransaction -> v2.engine.undoStack.applyTransaction.

    // Release orbit drag (but stay in orbit mode until Enter)
    if (v3dOrbiting) {
      v3dHandleOrbitUp();
      canvas.style.cursor = 'grab';
      return;
    }
    // V25 — release v25 entity drag
    if (v25Drag) {
      // plate-grouping-stiffener — on dropping a grouped assembly, snap its
      // end-plate flush to a beam flange and register the (default-bare) joint.
      const _grpDrag = (v25Drag.handle === 'body' && v25Drag.ent && v25Drag.ent.groupId) ? v25Drag.ent.groupId : null;
      // Hold the move-undo context before clearing the drag. The flange-snap
      // below mutates the assembly further, so the AFTER snapshot is taken once
      // the on-screen state is fully settled (post-snap).
      const _dragEnt = v25Drag.ent;
      const _undoBefore = v25Drag.undoBefore;
      const _undoView = (activeBlock && activeBlock.viewKey) || null;
      v25Drag = null;
      // The flange-snap can RE-WELD/RE-BOLT an already-jointed assembly at the
      // drop point: v25JointSnapGroupToFlange -> applyJoint splices the old
      // weld/bolt out and creates fresh ones via addEnt2D, which each push their
      // OWN {act:'addEnt2D'} undo entry. Those would sit UNDER the v25Move push
      // below, so the move would not be atomic — one Ctrl+Z would strand the
      // new weld, a second would delete it (orphaned-then-lost). Capture the
      // stack depth here, then strip any addEnt2D entries the snap added so the
      // joint delta is owned solely by the single v25Move action. The new
      // weld/bolt stay on-screen and are picked up by the _undoAfter snapshot;
      // undo()/redo() reconcile the changed entity set by id.
      const _undoDepth = undoStack.length;
      if (_grpDrag && typeof v25JointSnapGroupToFlange === 'function') v25JointSnapGroupToFlange(_grpDrag);
      if (undoStack.length > _undoDepth) {
        for (let i = undoStack.length - 1; i >= _undoDepth; i--) {
          if (undoStack[i] && undoStack[i].act === 'addEnt2D') undoStack.splice(i, 1);
        }
      }
      // Record the entity move as ONE atomic undo action. moveObj only restores
      // objects3D, so 2D-entity moves get their own 'v25Move' act (handled in
      // base undo()/redo() in 05-state.js). Skip if nothing actually changed
      // (a click with no drag) — otherwise Ctrl+Z would unwind a no-op.
      if (_undoBefore && _undoView) {
        const _undoAfter = v25SnapshotMoveTargets(_dragEnt);
        if (v25MoveSnapshotsDiffer(_undoBefore, _undoAfter)) {
          undoStack.push({ act: 'v25Move', view: _undoView, before: _undoBefore, after: _undoAfter });
          if (undoStack.length > 100) undoStack.shift();
          redoStack = [];
        }
      }
      // V25-layout-overhaul Phase 6.3 — clear snap state + feedback when the
      // drag ends so the dashed guides don't linger.
      activeEdgeSnaps = [];
      if (typeof v25ResetSnapState === 'function') v25ResetSnapState();
      canvas.style.cursor = 'default';
      requestRender();
      return;
    }

    if (blockResizing) {
      blockResizing = null;
      blockResizeStart = null;
      canvas.style.cursor = 'default';
      requestRender();
      return;
    }
    if (blockDragging) {
      blockDragging = null;
      blockDragOffset = null;
      canvas.style.cursor = 'default';
      requestRender();
      return;
    }
    if (draggingCutLine) {
      draggingCutLine = null;
      canvas.style.cursor = 'default';
      requestRender();
      return;
    }
    if (isPanning) {
      isPanning = false; panLast = null;
      container.classList.remove('grabbing');
      return;
    }
    // Finish grip drag or rotation
    if (activeGrip) {
      if (gripSnapshot) {
        const before = [gripSnapshot];
        const after = [JSON.parse(JSON.stringify(activeGrip.obj))];
        undoStack.push({ act: 'moveObj', before, after });
        if (undoStack.length > 100) undoStack.shift();
        redoStack = [];
      }
      // V24.A5 — clear the live-angle overlay state once the drag ends.
      if (activeGrip.obj && '_liveRotAngleDeg' in activeGrip.obj) {
        delete activeGrip.obj._liveRotAngleDeg;
      }
      activeGrip = null; gripStart = null; gripSnapshot = null;
      rotateMode = false; rotatePivot = null; rotateStartAngle = null;
      canvas.style.cursor = 'default';
      if (typeof v3dMarkDirty === 'function') v3dMarkDirty();
      requestRender();
      return;
    }

    if (dragMoving) {
      if (dragSnapshots) {
        const after = selected3D.map(o => JSON.parse(JSON.stringify(o)));
        undoStack.push({ act: 'moveObj', before: dragSnapshots, after });
        if (undoStack.length > 100) undoStack.shift();
        redoStack = [];
      }
      dragMoving = false; dragStart = null; dragSnapshots = null;
      activeEdgeSnaps = [];
      snapOffsetU = 0; snapOffsetV = 0; snappedAxisU = false; snappedAxisV = false;
      if (typeof v3dMarkDirty === 'function') v3dMarkDirty();
      return;
    }
    if (selBoxStart && activeBlock) {
      const { px, py } = getPixelXY(e);
      const real = px2real(activeBlock, px, py);
      const u1 = Math.min(selBoxStart[0], real.u), u2 = Math.max(selBoxStart[0], real.u);
      const v1 = Math.min(selBoxStart[1], real.v), v2 = Math.max(selBoxStart[1], real.v);
      // Same 2-px noise threshold as the render overlay so a stationary click
      // never finalises a (zero-area) selection.
      if (u2 - u1 > 2 || v2 - v1 > 2) {
        // Crossing (R→L) selects anything the box touches; window (L→R)
        // requires full containment. Bluebeam / AutoCAD / Revit convention.
        const crossing = real.u < selBoxStart[0];
        if (selBoxMode === '2d') {
          // V25 2D paper-space marquee — filter entities2D for the active view
          // and dispatch through v25Selected (ids, not refs).
          const list = (typeof entities2D !== 'undefined' && entities2D[activeBlock.viewKey]) || [];
          const hitIds = list.filter(ent => {
            if (ent._v2Mirror) return false;   // plate mirrors are v2-selected below
            const b = (typeof v25EntBounds === 'function') ? v25EntBounds(ent) : null;
            if (!b) return false;
            // v25EntBounds returns {L,R,B,T} with L<R and B<T already.
            if (crossing) return b.L <= u2 && b.R >= u1 && b.B <= v2 && b.T >= v1;
            return b.L >= u1 && b.R <= u2 && b.B >= v1 && b.T <= v2;
          }).map(en => en.id);
          v25Selected = e.shiftKey
            ? Array.from(new Set([...(v25Selected || []), ...hitIds]))
            : hitIds;
          if (typeof v25UpdateInspector === 'function') v25UpdateInspector();
          // plate-marquee-fix (2026-06-01) — v2 plates live in v2.appState.model,
          // not entities2D, so the loop above can't see them. Let the v2 edit-
          // plate tool select an enclosed plate via its own polygon hit-test
          // (sets state.selectedId, exactly like a single-click select). The
          // requestRender() below repaints the plate's grips + rotation handle.
          // NB: `v2` is a LOCAL here (the box's max-V coord, line ~1329), so the
          // global v2 namespace MUST be reached via window.v2 — using bare `v2`
          // reads the number and silently no-ops (the original bug).
          const _v2ns = window.v2;
          if (_v2ns && _v2ns.tools && _v2ns.tools.editPlate &&
              typeof _v2ns.tools.editPlate.selectInRect === 'function') {
            _v2ns.tools.editPlate.selectInRect(
              activeBlock, { L: u1, R: u2, B: v1, T: v2 }, crossing, e.shiftKey
            );
          }
        } else {
          // 3D-projected mode marquee — existing behaviour.
          const hits = objects3D.filter(obj => {
            const b = getObj2DBounds(obj, activeBlock);
            if (!b) return false;
            if (crossing) return b.u1 <= u2 && b.u2 >= u1 && b.v1 <= v2 && b.v2 >= v1;
            return b.u1 >= u1 && b.u2 <= u2 && b.v1 >= v1 && b.v2 <= v2;
          });
          selected3D = e.shiftKey ? [...selected3D, ...hits] : hits;
        }
      }
      selBoxStart = null;
      selBoxMode = null;
      requestRender();
    }
  });

  canvas.addEventListener('dblclick', (e) => {
    // V25-layout-overhaul — close v25-hatch polyline on dblclick.
    // The dblclick is preceded by a mousedown that pushed an extra point
    // (or kicked off hatchDown state). Drop the trailing artefact and
    // close if we have ≥3 real vertices.
    if (tool === 'v25-hatch') {
      // The dblclick mousedown either pushed a polyPt (if polyPts was non-empty)
      // or set hatchDownPx (if polyPts was empty). Strip both.
      if (v25State.hatchDownPx) {
        v25State.hatchDownPx = null;
        v25State.hatchDownWorld = null;
      } else if (v25State.polyPts.length > 0) {
        v25State.polyPts.pop();
      }
      if (v25State.polyPts.length >= 3) {
        v25Add('mat', {
          shape: 'poly', material: v25Last.material,
          pts: [...v25State.polyPts],
        });
      }
      v25State.polyPts = [];
      requestRender();
      return;
    }
    // v1 V25 plate poly close on dblclick retired by architecture-v2
    // Phase 2. v2 plates close polygons via PlacePlateTool.onDblClick.
    if (tool === 'polyline' && polyPts.length >= 2) { finishPolyline(); return; }
    if (tool === 'draw-rev-cloud' && polyPts.length >= 3) {
      // Last point is from the dblclick mousedown — drop it before committing
      polyPts.pop();
      if (polyPts.length >= 3) {
        addEnt2D(mkEnt2D(activeBlock.viewKey, 'revisionCloud', {
          pts: [...polyPts], lw: LW.MW,
        }));
      }
      polyPts = [];
      requestRender();
      return;
    }
    // V22.6 — hatch close on dblclick (same pattern as rev-cloud)
    if (tool === 'draw-hatch' && polyPts.length >= 3) {
      polyPts.pop();
      if (polyPts.length >= 3) {
        const patternStr = prompt('Hatch pattern (steel / cross / concrete):', 'steel');
        const pattern = (patternStr || 'steel').toLowerCase();
        addEnt2D(mkEnt2D(activeBlock.viewKey, 'hatch', {
          pts: [...polyPts], pattern, spacing: 3, lw: LW.HATCH,
        }));
      }
      polyPts = [];
      requestRender();
      return;
    }
    if (tool === 'draw-plate' && platePts.length >= 3) {
      // Remove the last point (added by the mousedown of the dblclick)
      platePts.pop();
      finishDrawPlate();
      return;
    }

    // Double-click on weld interface: show properties popup
    const { px, py } = getPixelXY(e);
    if (tool === 'select' && activeBlock) {
      // Blockwork — double-click an edge (elevation) or an end (section) to
      // open the Edge-of-wall / Break-line picker for that side; the coursing
      // re-anchors to whichever edges are walls. Checked first so it wins over
      // the weld/joint popups when the cursor is on a wall.
      if (sheetMode === '2d' && typeof v25HitTest === 'function'
          && typeof v25NearestWallEdge === 'function' && typeof v25ShowWallEdgeMenu === 'function') {
        const [cu, cv] = getCursor(activeBlock);
        const wallHit = v25HitTest(activeBlock, cu, cv);
        if (wallHit && wallHit.type === 'blockWall') {
          const target = v25NearestWallEdge(activeBlock, wallHit, cu, cv);
          if (target) {
            v25Selected = [wallHit.id];
            if (typeof v25UpdateInspector === 'function') v25UpdateInspector();
            requestRender();
            v25ShowWallEdgeMenu(wallHit, target, e.clientX, e.clientY);
            return;
          }
        }
      }
      // V25-layout-overhaul Phase 6.5 — prefer the 2D weld pipeline when in
      // 2D mode so dblclicks on the AS 1101.3 hatch open the same popup
      // (type / size / enabled). 3D pipeline is checked next as a fallback.
      // V14-J — SHS joint popup takes precedence over the weld popup so that
      // a dblclick at a node opens the priority + mitre editor. Try V25 (2D
      // paper-space) joint first, then 3D-mode joint, then weld interface.
      if (sheetMode === '2d' && typeof hitTestJointV25 === 'function') {
        const v25Joint = hitTestJointV25(activeBlock, px, py);
        if (v25Joint) {
          showJointPopupV25(v25Joint, e.clientX, e.clientY, activeBlock.viewKey);
          return;
        }
      }
      if (sheetMode === '2d' && typeof v25HitTestWeld === 'function') {
        const v25Hit = v25HitTestWeld(activeBlock, px, py);
        if (v25Hit) {
          showWeldPopup(v25Hit, e.clientX, e.clientY);
          return;
        }
      }
      if (typeof hitTestJoint === 'function') {
        const jointHit = hitTestJoint(activeBlock, px, py);
        if (jointHit) {
          showJointPopup(jointHit, e.clientX, e.clientY);
          return;
        }
      }
      const weldHit = hitTestWeld(activeBlock, px, py);
      if (weldHit) {
        showWeldPopup(weldHit, e.clientX, e.clientY);
        return;
      }
    }

    // Double-click on view label: toggle hidden, or start drag
    const labelBlock = hitTestViewLabel(px, py);
    if (labelBlock) {
      if (e.shiftKey) {
        // Shift + double-click: toggle hide/show
        labelBlock.hidden = !labelBlock.hidden;
        requestRender();
      } else if (labelBlock.hidden) {
        // Double-click hidden label: unhide
        labelBlock.hidden = false;
        requestRender();
      } else if (labelBlock.viewKey === 'isometric') {
        // Double-click ISOMETRIC label: enter orbit mode
        v3dStartOrbit(px, py);
        canvas.style.cursor = 'grab';
      } else {
        // Double-click visible label: enter block drag mode
        blockDragging = labelBlock;
        const sh = px2s(px, py);
        blockDragOffset = { dx: sh.x - labelBlock.sheetX, dy: sh.y - labelBlock.sheetY };
        canvas.style.cursor = 'move';
        requestRender();
      }
      return;
    }

    // V25-layout-overhaul Phase 6 — double-click on any selected entity
    // auto-switches to the rail Settings tab so the user can immediately
    // edit properties (line width, colour, hatch fill, opacity, etc.).
    // Relies on the preceding mousedown(s) having already populated
    // selected3D / v25Selected via the existing hit-test logic.
    const has3D = (typeof selected3D !== 'undefined') && Array.isArray(selected3D) && selected3D.length > 0;
    const hasV25 = (typeof v25Selected !== 'undefined') && Array.isArray(v25Selected) && v25Selected.length > 0;
    if ((has3D || hasV25) && typeof window.bbRailSwitchToSettings === 'function') {
      // Refresh inspector before switching — guarantees the Settings tab shows
      // the just-selected entity's fields rather than a stale snapshot.
      if (typeof v25UpdateInspector === 'function') { try { v25UpdateInspector(); } catch(_){} }
      if (typeof updateInspector === 'function')    { try { updateInspector(); }    catch(_){} }
      window.bbRailSwitchToSettings();
    }
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const { px, py } = getPixelXY(e);
    // Get sheet coords before zoom
    const before = px2s(px, py);
    let f;
    if (e.ctrlKey) f = Math.pow(2, -e.deltaY * 0.005);
    else f = e.deltaY > 0 ? 0.97 : 1.03;
    viewport.zoom = Math.max(0.1, Math.min(50, viewport.zoom * f));
    // Adjust pan so the point under the cursor stays put
    const after = s2px(before.x, before.y);
    viewport.panX += px - after.x;
    viewport.panY += py - after.y;
    requestRender();
  }, { passive: false });

  canvas.addEventListener('contextmenu', e => {
    e.preventDefault();
    // plate-grouping-stiffener — right-click in 2D select mode: a plate↔flange
    // joint menu (weld / bolt / none) takes priority, else Group / Ungroup.
    if (sheetMode === '2d' && tool === 'select' && activeBlock) {
      const _r = canvas.getBoundingClientRect();
      const _real = px2real(activeBlock, e.clientX - _r.left, e.clientY - _r.top);
      if (typeof v25JointTryMenu === 'function' && _real &&
          v25JointTryMenu(activeBlock, _real.u, _real.v, e.clientX, e.clientY)) return;
      if (typeof v25ShowGroupContextMenu === 'function') v25ShowGroupContextMenu(e.clientX, e.clientY);
    }
  });
}

// ============================================================
