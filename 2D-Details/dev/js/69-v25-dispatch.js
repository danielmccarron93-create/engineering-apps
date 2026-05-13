'use strict';

// V25 — dispatch hook + tool dispatch + 2D-mode palette + chord-prefix install
// Extracted from dev/index.html lines 19031-19752 (2026-05-02 modular split)

// ---- DISPATCH HOOK ----
// Called from drawEnt2D for the new entity types.
function v25DrawEnt(blk, ent, cs) {
  if (ent.type === 'frame') { drawFrame2D(blk, ent, cs); return true; }
  if (ent.type === 'mat') { drawMat2D(blk, ent, cs); return true; }
  if (ent.type === 'blockWall') { drawBlockWall2D(blk, ent, cs); return true; }
  if (ent.type === 'anchor') { drawAnchor2D(blk, ent, cs); return true; }
  if (ent.type === 'reoBar') { drawReoBar2D(blk, ent, cs); return true; }
  if (ent.type === 'mesh') { drawMesh2D(blk, ent, cs); return true; }
  if (ent.type === 'leader2') { drawLeader2D(blk, ent, cs); return true; }
  if (ent.type === 'mem2') { drawMem2D(blk, ent, cs); return true; }
  if (ent.type === 'lineSet' && typeof drawLineSet2D === 'function') { drawLineSet2D(blk, ent, cs); return true; }
  if (ent.type === 'txtBox' && typeof drawTxtBox2D === 'function') { drawTxtBox2D(blk, ent, cs); return true; }
  return false;
}

// ---- 2D-mode PALETTE ----
function getPaletteDef2D() {
  return {
    model: [
      { title: 'Lines', tiles: [
        { id: 'v25-line-thick', kind: 'tool', label: 'Thick',
          linePreview: { lw: 0.50, ls: 'solid' },
          onClick: () => v25SetLine(0.50, 'solid') },
        { id: 'v25-line-thin', kind: 'tool', label: 'Thin',
          linePreview: { lw: 0.25, ls: 'solid' },
          onClick: () => v25SetLine(0.25, 'solid') },
        { id: 'v25-line-dashed', kind: 'tool', label: 'Dashed',
          linePreview: { lw: 0.25, ls: 'dashed' },
          onClick: () => v25SetLine(0.25, 'dashed') },
        { id: 'v25-line-cl', kind: 'tool', label: 'Centreline',
          linePreview: { lw: 0.18, ls: 'centre' },
          onClick: () => v25SetLine(0.18, 'centre') },
      ]},
      { title: 'Text', tiles: [
        { id: 'v25-text', kind: 'tool', label: 'Text',     icon: 'icon-text', chord: 'A-X', onClick: () => v25SetTool('v25-text') },
        { id: 'v25-leader', kind: 'tool', label: 'Leader', icon: 'icon-note', chord: 'A-L', onClick: () => v25SetTool('v25-leader') },
      ]},
      { title: 'Detail Frames', tiles: [
        { id: 'v25-frame', kind: 'tool', label: 'Frame', icon: 'icon-rect',
          onClick: () => v25SetTool('v25-frame') },
      ]},
      { title: 'Steel Members', tiles: [
        { id: 'v25-ub-2d', kind: 'member', label: 'UB',  sub: lastUsedSection.ub  || '360UB 50.7', icon: 'icon-ub', chord: 'M-U',
          onClick: () => v25PickAndSetMember('ub'),
          picker: { kind: 'ub' } },
        { id: 'v25-uc-2d', kind: 'member', label: 'UC',  sub: lastUsedSection.uc  || '250UC 72.9', icon: 'icon-uc', chord: 'M-C',
          onClick: () => v25PickAndSetMember('uc'),
          picker: { kind: 'uc' } },
        { id: 'v25-wb-2d', kind: 'member', label: 'WB',  sub: lastUsedSection.wb  || '700WB130',  icon: 'icon-ub', chord: 'M-W',
          onClick: () => v25PickAndSetMember('wb'),
          picker: { kind: 'wb' } },
        { id: 'v25-pfc-2d', kind: 'member', label: 'PFC', sub: lastUsedSection.pfc || '200PFC 22.9', icon: 'icon-pfc', chord: 'M-P',
          onClick: () => v25PickAndSetMember('pfc'),
          picker: { kind: 'pfc' } },
        { id: 'v25-shs-2d', kind: 'member', label: 'SHS', sub: lastUsedSection.shs || '150x6', icon: 'icon-shs', chord: 'M-S',
          onClick: () => v25PickAndSetMember('shs'),
          picker: { kind: 'shs' } },
        { id: 'v25-rhs-2d', kind: 'member', label: 'RHS', sub: lastUsedSection.rhs || '100x50x5', icon: 'icon-rhs',
          onClick: () => v25PickAndSetMember('rhs'),
          picker: { kind: 'rhs' } },
      ]},
      { title: 'Walls (W-)', tiles: [
        { id: 'v25-wall-90',  kind: 'tool', label: '90 BLK',  icon: 'icon-rect', chord: 'W-9', onClick: () => v25SetWallBlock('90') },
        { id: 'v25-wall-140', kind: 'tool', label: '140 BLK', icon: 'icon-rect', chord: 'W-1', onClick: () => v25SetWallBlock('140') },
        { id: 'v25-wall-190', kind: 'tool', label: '190 BLK', icon: 'icon-rect', chord: 'W-2', onClick: () => v25SetWallBlock('190') },
        { id: 'v25-wall-290', kind: 'tool', label: '290 BLK', icon: 'icon-rect', chord: 'W-3', onClick: () => v25SetWallBlock('290') },
      ]},
      { title: 'Materials (H-)', tiles: [
        { id: 'v25-mat-conc',  kind: 'tool', label: 'Concrete',    materialPreview: 'concrete',    icon: 'icon-hatch', chord: 'H-C', onClick: () => v25SetMaterial('concrete') },
        { id: 'v25-mat-reo',   kind: 'tool', label: 'Reo conc.',   materialPreview: 'reoConcrete', icon: 'icon-hatch', chord: 'H-R', onClick: () => v25SetMaterial('reoConcrete') },
        { id: 'v25-mat-block', kind: 'tool', label: 'Blockwork',   materialPreview: 'blockwork',   icon: 'icon-hatch', chord: 'H-B', onClick: () => v25SetMaterial('blockwork') },
        { id: 'v25-mat-brick', kind: 'tool', label: 'Brickwork',   materialPreview: 'brickwork',   icon: 'icon-hatch', chord: 'H-K', onClick: () => v25SetMaterial('brickwork') },
        { id: 'v25-mat-earth', kind: 'tool', label: 'Earth',       materialPreview: 'earth',       icon: 'icon-hatch', chord: 'H-E', onClick: () => v25SetMaterial('earth') },
        { id: 'v25-mat-back',  kind: 'tool', label: 'Backfill',    materialPreview: 'backfill',    icon: 'icon-hatch', chord: 'H-F', onClick: () => v25SetMaterial('backfill') },
        { id: 'v25-mat-sand',  kind: 'tool', label: 'Sand',        materialPreview: 'sand',        icon: 'icon-hatch', chord: 'H-S', onClick: () => v25SetMaterial('sand') },
        { id: 'v25-mat-tmbE',  kind: 'tool', label: 'Timber elev', materialPreview: 'timberElev',  icon: 'icon-hatch', chord: 'H-T', onClick: () => v25SetMaterial('timberElev') },
        { id: 'v25-mat-tmbS',  kind: 'tool', label: 'Timber sec',  materialPreview: 'timberSec',   icon: 'icon-hatch', chord: 'H-X', onClick: () => v25SetMaterial('timberSec') },
        { id: 'v25-mat-steel', kind: 'tool', label: 'Steel solid', materialPreview: 'steelSolid',  icon: 'icon-hatch', chord: 'H-L', onClick: () => v25SetMaterial('steelSolid') },
        { id: 'v25-mat-ins',   kind: 'tool', label: 'Insulation',  materialPreview: 'insulation',  icon: 'icon-hatch', chord: 'H-I', onClick: () => v25SetMaterial('insulation') },
        { id: 'v25-mat-wat',   kind: 'tool', label: 'Water',       materialPreview: 'water',       icon: 'icon-hatch', chord: 'H-W', onClick: () => v25SetMaterial('water') },
        { id: 'v25-mat-tank',  kind: 'tool', label: 'Tanking',     materialPreview: 'tanking',     icon: 'icon-hatch', chord: 'H-N', onClick: () => v25SetMaterial('tanking') },
      ]},
      { title: 'Bolts & Anchors (B-)', tiles: [
        { id: 'v25-anc-trubolt', kind: 'tool', label: 'Trubolt', icon: 'icon-bolt', chord: 'B-T', onClick: () => v25SetAnchor('trubolt') },
        { id: 'v25-anc-chemset', kind: 'tool', label: 'Chemset', icon: 'icon-bolt', chord: 'B-C', onClick: () => v25SetAnchor('chemset') },
        { id: 'v25-anc-coach',   kind: 'tool', label: 'Coach',   icon: 'icon-bolt', chord: 'B-O', onClick: () => v25SetAnchor('coach') },
        { id: 'v25-anc-tek',     kind: 'tool', label: 'Tek',     icon: 'icon-bolt', chord: 'B-K', onClick: () => v25SetAnchor('selftap') },
        { id: 'v25-anc-thru',    kind: 'tool', label: 'Through', icon: 'icon-bolt', chord: 'B-B', onClick: () => v25SetAnchor('through') },
      ]},
      { title: 'Reinforcement (K-)', tiles: [
        { id: 'v25-bar-N12', kind: 'tool', label: 'N12', icon: 'icon-line', chord: 'K-2', onClick: () => v25SetBar('N12') },
        { id: 'v25-bar-N16', kind: 'tool', label: 'N16', icon: 'icon-line', chord: 'K-6', onClick: () => v25SetBar('N16') },
        { id: 'v25-bar-N20', kind: 'tool', label: 'N20', icon: 'icon-line', chord: 'K-N', onClick: () => v25SetBar('N20') },
        { id: 'v25-bar-N24', kind: 'tool', label: 'N24', icon: 'icon-line', chord: 'K-4', onClick: () => v25SetBar('N24') },
        { id: 'v25-bar-dot', kind: 'tool', label: 'Bar dot', icon: 'icon-circle', chord: 'K-D', onClick: () => v25SetTool('v25-bar-dot') },
        { id: 'v25-mesh-72', kind: 'tool', label: 'SL72', icon: 'icon-hatch', chord: 'K-M', onClick: () => v25SetMesh('SL72') },
        { id: 'v25-mesh-82', kind: 'tool', label: 'SL82', icon: 'icon-hatch', chord: 'K-8', onClick: () => v25SetMesh('SL82') },
        { id: 'v25-mesh-92', kind: 'tool', label: 'SL92', icon: 'icon-hatch', chord: 'K-9', onClick: () => v25SetMesh('SL92') },
      ]},
    ],
    draw: [
      { title: 'Primitives', tiles: [
        { id: 't-select',  kind: 'tool', label: 'Select',   icon: 'icon-select',   onClick: () => setTool('select') },
        { id: 't-line',    kind: 'tool', label: 'Line',     icon: 'icon-line',     chord: 'D-L', onClick: () => setTool('line') },
        { id: 't-rect',    kind: 'tool', label: 'Rect',     icon: 'icon-rect',     chord: 'D-R', onClick: () => setTool('rect') },
        { id: 't-circle',  kind: 'tool', label: 'Circle',   icon: 'icon-circle',   chord: 'D-C', onClick: () => setTool('circle') },
        { id: 't-poly',    kind: 'tool', label: 'Polyline', icon: 'icon-polyline', chord: 'D-P', onClick: () => setTool('polyline') },
        { id: 't-cl',      kind: 'tool', label: 'Centreline', icon: 'icon-line',   onClick: () => setTool('draw-centreline') },
        { id: 't-arc',     kind: 'tool', label: 'Arc',      icon: 'icon-arc',      onClick: () => setTool('arc') },
        { id: 't-polygon', kind: 'tool', label: 'Polygon',  icon: 'icon-polygon',  onClick: () => setTool('polygon') },
        { id: 't-break',   kind: 'tool', label: 'Break',    icon: 'icon-break-line', chord: 'D-B', onClick: () => setTool('draw-breakline') },
        { id: 't-text',    kind: 'tool', label: 'Text',     icon: 'icon-text',     chord: 'D-T', onClick: () => setTool('text') },
      ]},
    ],
    annotate: [
      { title: 'Dimensions', tiles: [
        { id: 'a-dimH',     kind: 'tool', label: 'Dim H',    icon: 'icon-dim-h',       chord: 'A-H', onClick: () => { dimType='horizontal'; setTool('dimension'); } },
        { id: 'a-dimV',     kind: 'tool', label: 'Dim V',    icon: 'icon-dim-v',       chord: 'A-V', onClick: () => { dimType='vertical'; setTool('dimension'); } },
        { id: 'a-aligned',  kind: 'tool', label: 'Aligned',  icon: 'icon-dim-aligned', onClick: () => { dimType='aligned'; setTool('dimension'); } },
        { id: 'a-angular',  kind: 'tool', label: 'Angular',  icon: 'icon-dim-angular', onClick: () => { dimType='angular'; setTool('dimension'); } },
      ]},
      { title: 'Tags & Symbols', tiles: [
        { id: 'a-section',  kind: 'tool', label: 'Section',  icon: 'icon-section-mark', chord: 'A-S', onClick: () => setTool('draw-sectionmark') },
        { id: 'a-grid',     kind: 'tool', label: 'Grid Line',icon: 'icon-grid-line',    onClick: () => setTool('draw-gridline') },
      ]},
    ],
  };
}

// ---- TOOL DISPATCH ----
// We piggyback on the existing `tool` global by using a v25- prefix.
function v25SetTool(t) {
  // Reset state cleanly (mirrors setTool's reset behaviour)
  clickPts = []; polyPts = [];
  dimStep = 0; dimP1 = null; dimP2 = null; dimType = 'horizontal';
  placing = null; drawMember = null; drawStart = null; drawPreviewEnd = null;
  platePts = []; plateBlock = null; plateDimInput = ''; plateDimActive = false;
  boltGroupConfig = null; weldStep = 0; weldP1 = null;
  cycleHits = []; cycleIndex = 0;
  v25State = { polyPts: [], dragStart: null };
  tool = t;
  if (canvas) canvas.style.cursor = 'crosshair';
  if (typeof updateStatus === 'function') updateStatus();
  if (typeof highlightActiveTile === 'function') highlightActiveTile();
  requestRender();
}
let v25State = { polyPts: [], dragStart: null };

function v25SetMember(type, section, aspect) {
  v25SetTool('v25-mem');
  v25State.memberType = type;
  v25State.section = section;
  v25State.aspect = aspect || v25State.aspect || 'elev';
  lastUsedSection[type] = section;
  // Refresh the options bar now that state is fully populated (v25SetTool
  // resets v25State first, so the bar would otherwise show empty fields).
  if (typeof v25UpdateOptionsBar === 'function') v25UpdateOptionsBar();
  if (typeof highlightActiveTile === 'function') highlightActiveTile();
}

// Per-type sensible defaults — used when the user hasn't picked a size yet
// and just wants to start drawing. Each entry must exist in its respective
// catalogue (UB_DB, UC_DB, etc.) so the renderer has dimensions to work with.
// Once the user picks a different size from the centred picker, that choice
// is stored in `lastUsedSection[type]` and takes precedence next time the
// tile is clicked — so the tile remembers what you drew last.
const V25_MEM_DEFAULTS = {
  ub:  '310UB 46.2',
  uc:  '250UC 72.9',
  shs: '89x5',
  rhs: '150x100x4',
  wb:  '700WB130',
  pfc: '200PFC 22.9',
  chs: '88.9x5.9',
  ea:  'EA75x75x6',
  ua:  'UA100x75x8',
};

// Click on a steel-member tile: arm the draw tool immediately at the
// last-used size (or a sensible per-type default) so the user can start
// drawing right away. Size changes happen via the top options-bar Section
// dropdown / Pick… button, or via the Settings tab after placement.
function v25PickAndSetMember(type) {
  const def = (typeof lastUsedSection !== 'undefined' && lastUsedSection[type])
            || V25_MEM_DEFAULTS[type] || '';
  if (def) v25SetMember(type, def);
}
function v25SetMaterial(material) {
  v25Last.material = material;
  v25SetTool('v25-mat');
}
// V25-layout-overhaul — Phase 4 hatch placement tool.
// Activated by Draw-tab Hatches tiles. Distinguishes click vs drag on
// release: short release = polyline mode (more clicks add nodes,
// double-click closes); drag release = rectangle from down to up.
function v25SetHatch(material) {
  v25Last.material = material;
  v25SetTool('v25-hatch');
  // Reset polyline state when starting fresh
  v25State.polyPts = [];
  v25State.hatchDownPx = null;
  v25State.hatchDownWorld = null;
}
function v25SetWallBlock(blockKey) {
  v25Last.blockThk = blockKey;
  v25SetTool('v25-wall');
}
function v25SetAnchor(kind) {
  v25Last.anchor = kind;
  const def = V25_ANCHOR_DB[kind];
  if (def && def.defaults) {
    v25Last.anchorSize = def.defaults.size;
    v25Last.anchorEmbed = def.defaults.embed;
  }
  v25SetTool('v25-anchor');
}
function v25SetBar(barKey) {
  v25Last.reoBar = barKey;
  v25SetTool('v25-bar');
}
function v25SetMesh(meshKey) {
  v25Last.mesh = meshKey;
  v25SetTool('v25-mesh');
}
function v25SetLine(lw, ls) {
  v25Last.lineLw = lw;
  v25Last.lineLs = ls;
  v25SetTool('v25-line');
}

// Click dispatch — called from the existing canvas mousedown (after the
// existing built-in tool handlers, before the default fall-through).
// Returns true if the click was handled.
function v25TryHandleClick(blk, cu, cv, e) {
  if (!tool || !tool.startsWith('v25-')) return false;

  if (tool === 'v25-frame') {
    // Two-click rectangle frame. Place with placeholder title/ref and let the
    // user edit via the inspector — non-blocking, faster than prompts.
    if (!v25State.dragStart) {
      v25State.dragStart = { u: cu, v: cv, blk };
    } else {
      const a = v25State.dragStart;
      const u = Math.min(a.u, cu), v = Math.min(a.v, cv);
      const w = Math.abs(cu - a.u), h = Math.abs(cv - a.v);
      if (w > 50 && h > 50) {
        const ent = v25Add('frame', {
          u, v, w, h,
          title: 'NEW DETAIL', scale: 10,
          ref: (v25Last.nextRef || (6090 + (entities2D.elevation.filter(e => e.type==='frame').length))).toString() + '.1',
          showBorder: true,
        });
        // Auto-select for edit
        v25Selected = [ent.id];
        if (typeof v25UpdateInspector === 'function') v25UpdateInspector();
      }
      v25State.dragStart = null;
    }
    return true;
  }

  if (tool === 'v25-mat') {
    // Two-click rect of material
    if (!v25State.dragStart) {
      v25State.dragStart = { u: cu, v: cv, blk };
    } else {
      const a = v25State.dragStart;
      const u = Math.min(a.u, cu), v = Math.min(a.v, cv);
      const w = Math.abs(cu - a.u), h = Math.abs(cv - a.v);
      if (w > 1 && h > 1) {
        v25Add('mat', { shape: 'rect', material: v25Last.material, u, v, w, h });
      }
      v25State.dragStart = null;
    }
    return true;
  }

  // V25-layout-overhaul — hatch placement (click=poly, drag=rect).
  // The mousedown only RECORDS state. The mouseup hook decides:
  //   - if mouse moved > 4 px on screen → drag → create rect
  //   - else → treat as a click → push to polyline; further clicks extend.
  // Double-click closes the polyline (handled in dblclick).
  if (tool === 'v25-hatch') {
    if (v25State.polyPts.length === 0) {
      // Fresh start: store the down position; commit decision happens on mouseup.
      v25State.hatchDownPx = { x: e.clientX, y: e.clientY };
      v25State.hatchDownWorld = { u: cu, v: cv, blk };
    } else {
      // Polyline already in progress — extend or close.
      // Hold Shift to constrain the new vertex to be orthogonal (H or V)
      // relative to the previous vertex.
      const last = v25State.polyPts[v25State.polyPts.length - 1];
      let cuEff = cu, cvEff = cv;
      if (e.shiftKey) {
        const o = v25OrthoSnap(last.u, last.v, cu, cv);
        cuEff = o.u; cvEff = o.v;
      }
      const first = v25State.polyPts[0];
      const cursorPx = real2px(blk, cuEff, cvEff);
      const firstPx = real2px(blk, first.u, first.v);
      const nearFirst = Math.hypot(cursorPx.x - firstPx.x, cursorPx.y - firstPx.y) < 14;
      if (nearFirst && v25State.polyPts.length >= 3) {
        v25Add('mat', { shape: 'poly', material: v25Last.material, pts: [...v25State.polyPts] });
        v25State.polyPts = [];
      } else if (Math.hypot(cuEff - last.u, cvEff - last.v) > 0.1) {
        v25State.polyPts.push({ u: cuEff, v: cvEff });
      }
    }
    requestRender();
    return true;
  }

  if (tool === 'v25-wall') {
    // Two-click wall: lengthMM × heightMM
    if (!v25State.dragStart) {
      v25State.dragStart = { u: cu, v: cv, blk };
    } else {
      const a = v25State.dragStart;
      const u = Math.min(a.u, cu), v = Math.min(a.v, cv);
      const lengthMM = Math.abs(cu - a.u), heightMM = Math.abs(cv - a.v);
      if (lengthMM > 5 && heightMM > 5) {
        v25Add('blockWall', {
          blockKey: v25Last.blockThk, u, v, lengthMM, heightMM,
          aspect: 'elev', showJoints: true, showTag: true,
        });
      }
      v25State.dragStart = null;
    }
    return true;
  }

  if (tool === 'v25-mem') {
    // Two-click member length. Aspect (elevation vs cross-section) is
    // controlled by the quick-options bar (v25State.aspect).
    if (!v25State.dragStart) {
      // Remember any host the FIRST click was near so endA can be joined on
      // commit. The host probe runs in elevation only (sec view is excluded
      // inside the helper).
      const hitA = v25Mem2HostUnderCursor(blk, cu, cv, null);
      v25State.dragStart = { u: cu, v: cv, blk, joinHostA: hitA ? hitA.ent.id : null };
    } else {
      const a = v25State.dragStart;
      const dx = cu - a.u, dy = cv - a.v;
      const length = Math.hypot(dx, dy);
      const rot = Math.atan2(dy, dx) * 180 / Math.PI;
      if (length > 5) {
        // Host probe for the second click → endB join. Skip if same host as A
        // already covers this end (e.g. user double-clicked on one chord).
        const hitB = v25Mem2HostUnderCursor(blk, cu, cv, null);
        const props = {
          memberType: v25State.memberType, section: v25State.section,
          u: a.u, v: a.v, length, rot,
          aspect: v25State.aspect || 'elev',
          // Sensible default for elevation views: start end is solid (member
          // is shown anchored), far end is a breakline (continues beyond the
          // detail). Cross-sections never show end caps so this is harmless.
          endA: 'normal',
          endB: 'breakline',
        };
        // PFC carries an open-face flag; default mirrors AS 1100 §3.12 (open
        // face away from column / support).
        if (v25State.memberType === 'pfc') {
          props.openSide = v25State.openSide || '-v';
        }
        if ((props.aspect === 'elev') && a.joinHostA) {
          props.endAJoin = { hostId: a.joinHostA };
          props.endA = 'mitre';
        }
        if ((props.aspect === 'elev') && hitB) {
          props.endBJoin = { hostId: hitB.ent.id };
          props.endB = 'mitre';
        }
        const ent = v25Add('mem2', props);
        // V25-layout-overhaul Phase 6.5 — snap on initial placement. If the
        // new member's edges land within the catch zone of an existing
        // member, latch immediately so the auto-weld appears on the next
        // frame. One-shot, so reset the soft-snap state right after.
        if (ent && ent.type === 'mem2' && typeof v25ApplySnap === 'function') {
          v25ResetSnapState();
          v25ApplySnap(activeBlock, [ent]);
          v25ResetSnapState();
        }
      }
      v25State.dragStart = null;
    }
    return true;
  }

  if (tool === 'v25-anchor') {
    // First click: anchor head; second click: text box position (auto leader)
    if (!v25State.dragStart) {
      v25State.dragStart = { u: cu, v: cv, blk };
    } else {
      const a = v25State.dragStart;
      const def = V25_ANCHOR_DB[v25Last.anchor];
      const ent = v25Add('anchor', {
        kind: v25Last.anchor,
        size: v25Last.anchorSize,
        embed: v25Last.anchorEmbed,
        count: (def.defaults && def.defaults.count) || 1,
        spacing: (def.defaults && def.defaults.spacing) || 200,
        u: a.u, v: a.v, rot: 0,
        txtU: cu, txtV: cv,
        txt: '',  // empty → render template
      });
      v25State.dragStart = null;
    }
    return true;
  }

  if (tool === 'v25-bar') {
    // Polyline bar: each click adds a vertex; Enter or right-click finishes
    v25State.polyPts.push({ u: cu, v: cv });
    requestRender();
    return true;
  }
  if (tool === 'v25-bar-dot') {
    v25Add('reoBar', { barKey: v25Last.reoBar, sectionDot: true, pts: [{ u: cu, v: cv }] });
    return true;
  }

  if (tool === 'v25-mesh') {
    if (!v25State.dragStart) {
      v25State.dragStart = { u: cu, v: cv, blk };
    } else {
      const a = v25State.dragStart;
      const u = Math.min(a.u, cu), v = Math.min(a.v, cv);
      const w = Math.abs(cu - a.u), h = Math.abs(cv - a.v);
      if (w > 5 && h > 5) {
        v25Add('mesh', { meshKey: v25Last.mesh, shape: 'rect', u, v, w, h, position: 'BTM' });
      }
      v25State.dragStart = null;
    }
    return true;
  }

  if (tool === 'v25-leader') {
    // Two-click leader: arrow tip, then text position. Auto-select the
    // entity so the inspector shows the text field for inline editing.
    if (!v25State.dragStart) {
      v25State.dragStart = { u: cu, v: cv, blk };
    } else {
      const a = v25State.dragStart;
      const ent = v25Add('leader2', {
        tipU: a.u, tipV: a.v,
        txtU: cu, txtV: cv,
        txt: v25Last.leaderText || 'CALLOUT',
      });
      v25Selected = [ent.id];
      if (typeof v25UpdateInspector === 'function') v25UpdateInspector();
      v25State.dragStart = null;
    }
    return true;
  }

  if (tool === 'v25-line') {
    // Polyline: each click extends. Right-click / Enter / Esc finishes.
    // V25 — if the user clicks the FIRST vertex (within snap distance), close
    // the shape and finish — gives the user a proper polygon they can fill.
    if (v25State.polyPts.length >= 2) {
      const first = v25State.polyPts[0];
      const cursorPx = real2px(blk, cu, cv);
      const firstPx = real2px(blk, first.u, first.v);
      if (Math.hypot(cursorPx.x - firstPx.x, cursorPx.y - firstPx.y) < 14) {
        const ent = v25Add('lineSet', {
          pts: [...v25State.polyPts],
          lw: v25Last.lineLw || 0.35,
          ls: v25Last.lineLs || 'solid',
          closed: true,
        });
        v25State.polyPts = [];
        v25Selected = [ent.id];
        if (typeof v25UpdateInspector === 'function') v25UpdateInspector();
        return true;
      }
    }
    v25State.polyPts.push({ u: cu, v: cv });
    requestRender();
    return true;
  }

  if (tool === 'v25-text') {
    // Single-click drops a text box. Auto-select for inline edit.
    const ent = v25Add('txtBox', {
      u: cu, v: cv,
      txt: v25Last.textDefault || 'TEXT',
      sz: 3, align: 'left',
    });
    v25Selected = [ent.id];
    if (typeof v25UpdateInspector === 'function') v25UpdateInspector();
    return true;
  }

  return false;
}

// Finish the current v25-line polyline (called from Enter or right-click).
function v25FinishLineSet() {
  if (tool !== 'v25-line' || v25State.polyPts.length < 2) {
    v25State.polyPts = []; requestRender(); return;
  }
  const ent = v25Add('lineSet', {
    pts: [...v25State.polyPts],
    lw: v25Last.lineLw || 0.35,
    ls: v25Last.lineLs || 'solid',
    closed: false,
  });
  v25State.polyPts = [];
  v25Selected = [ent.id];
  if (typeof v25UpdateInspector === 'function') v25UpdateInspector();
}

// Finish the current v25-bar polyline.
function v25FinishBarPoly() {
  if (tool !== 'v25-bar' || v25State.polyPts.length < 2) {
    v25State.polyPts = []; requestRender(); return;
  }
  v25Add('reoBar', {
    barKey: v25Last.reoBar,
    pts: [...v25State.polyPts],
    cogStart: false, cogEnd: false,
    mark: '', spacing: '',
  });
  v25State.polyPts = [];
}

// Live preview during drag — draws ghost rect/wall/etc while the second click
// hasn't landed yet. Called from the render loop after the entities draw.
function v25DrawPreview(blk, cs) {
  if (!tool || !tool.startsWith('v25-')) return;
  if (!cursorSheet) return;
  const [cu, cv] = getCursor(blk);
  const col = cs.getPropertyValue('--selected-color').trim();
  const pm = ppm();
  ctx.strokeStyle = colorAlpha(col, 0.55);
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  if (v25State.dragStart && (tool === 'v25-frame' || tool === 'v25-mat' || tool === 'v25-wall' || tool === 'v25-mesh')) {
    const a = v25State.dragStart;
    const u = Math.min(a.u, cu), v = Math.min(a.v, cv);
    const w = Math.abs(cu - a.u), h = Math.abs(cv - a.v);
    rRect(blk, u, v, w, h);
  }
  // V25-layout-overhaul — Phase 4 hatch placement preview.
  //   Drag-rect preview: show rect from hatch down-world to current cursor.
  //   Polyline preview:  show committed segments + rubber-band to cursor.
  if (tool === 'v25-hatch' && v25State.hatchDownWorld) {
    const a = v25State.hatchDownWorld;
    const u = Math.min(a.u, cu), v = Math.min(a.v, cv);
    const w = Math.abs(cu - a.u), h = Math.abs(cv - a.v);
    rRect(blk, u, v, w, h);
  }
  if (tool === 'v25-hatch' && v25State.polyPts.length) {
    for (let i = 0; i < v25State.polyPts.length - 1; i++) {
      const p = v25State.polyPts[i], q = v25State.polyPts[i+1];
      rLine(blk, p.u, p.v, q.u, q.v);
    }
    const last = v25State.polyPts[v25State.polyPts.length - 1];
    let pu = cu, pv = cv;
    if (typeof shiftHeld !== 'undefined' && shiftHeld) {
      const o = v25OrthoSnap(last.u, last.v, cu, cv);
      pu = o.u; pv = o.v;
    }
    rLine(blk, last.u, last.v, pu, pv);
    // Close-shape highlight if cursor near first vertex (≥3 pts).
    if (v25State.polyPts.length >= 3) {
      const first = v25State.polyPts[0];
      const cursorPx = real2px(blk, pu, pv);
      const firstPx = real2px(blk, first.u, first.v);
      if (Math.hypot(cursorPx.x - firstPx.x, cursorPx.y - firstPx.y) < 14) {
        ctx.beginPath();
        ctx.arc(firstPx.x, firstPx.y, 8, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
  if (v25State.dragStart && tool === 'v25-mem') {
    const a = v25State.dragStart;
    rLine(blk, a.u, a.v, cu, cv);
  }
  if (v25State.dragStart && (tool === 'v25-anchor' || tool === 'v25-leader')) {
    const a = v25State.dragStart;
    rLine(blk, a.u, a.v, cu, cv);
  }
  if ((tool === 'v25-bar' || tool === 'v25-line') && v25State.polyPts.length) {
    for (let i = 0; i < v25State.polyPts.length - 1; i++) {
      const p = v25State.polyPts[i], q = v25State.polyPts[i+1];
      rLine(blk, p.u, p.v, q.u, q.v);
    }
    const last = v25State.polyPts[v25State.polyPts.length - 1];
    rLine(blk, last.u, last.v, cu, cv);
    // V25 — close-shape highlight: if the cursor is hovering the first
    // vertex (within 14 px) and we have ≥2 vertices, draw a ring around it
    // so the user sees the click will close the polygon.
    if (tool === 'v25-line' && v25State.polyPts.length >= 2) {
      const first = v25State.polyPts[0];
      const cursorPx = real2px(blk, cu, cv);
      const firstPx = real2px(blk, first.u, first.v);
      const dPx = Math.hypot(cursorPx.x - firstPx.x, cursorPx.y - firstPx.y);
      if (dPx < 14) {
        ctx.setLineDash([]);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(firstPx.x, firstPx.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // "Close" label
        ctx.fillStyle = col;
        ctx.font = 'bold 10px system-ui';
        ctx.textBaseline = 'top';
        ctx.fillText('close', firstPx.x + 12, firstPx.y + 4);
      }
    }
  }
  ctx.setLineDash([]);
}

// Tool-name → tile-id for active highlight (called from highlightActiveTile)
function v25ActiveTileId() {
  if (tool === 'v25-frame') return 'v25-frame';
  // V25-layout-overhaul — Phase 4 — map active hatch material to the new
  // Draw-tab tile id so the active tile highlights while drawing.
  if (tool === 'v25-hatch') {
    const map = {
      reoConcrete: 'd-hat-existing', concrete: 'd-hat-new',
      blockwork: 'd-hat-block', brickwork: 'd-hat-brick',
      timberSec: 'd-hat-tmb-end', timberElev: 'd-hat-tmb-side',
      grout: 'd-hat-grout', sand: 'd-hat-sand',
      backfill: 'd-hat-back', soil: 'd-hat-soil',
      insulation: 'd-hat-ins', earth: 'd-hat-cross',
    };
    return map[v25Last.material] || null;
  }
  if (tool === 'v25-mat') return 'v25-mat-' + (v25Last.material === 'concrete' ? 'conc' :
    v25Last.material === 'reoConcrete' ? 'reo' :
    v25Last.material === 'blockwork' ? 'block' :
    v25Last.material === 'brickwork' ? 'brick' :
    v25Last.material === 'earth' ? 'earth' :
    v25Last.material === 'backfill' ? 'back' :
    v25Last.material === 'sand' ? 'sand' :
    v25Last.material === 'timberElev' ? 'tmbE' :
    v25Last.material === 'timberSec' ? 'tmbS' :
    v25Last.material === 'steelSolid' ? 'steel' :
    v25Last.material === 'insulation' ? 'ins' :
    v25Last.material === 'water' ? 'wat' :
    v25Last.material === 'tanking' ? 'tank' : 'conc');
  if (tool === 'v25-wall') return 'v25-wall-' + v25Last.blockThk;
  if (tool === 'v25-mem' && v25State && v25State.memberType) return 'v25-' + v25State.memberType + '-2d';
  if (tool === 'v25-anchor') return 'v25-anc-' + (v25Last.anchor === 'selftap' ? 'tek' : (v25Last.anchor === 'through' ? 'thru' : v25Last.anchor));
  if (tool === 'v25-bar') return 'v25-bar-' + v25Last.reoBar;
  if (tool === 'v25-bar-dot') return 'v25-bar-dot';
  if (tool === 'v25-mesh') return 'v25-mesh-' + (v25Last.mesh.replace('SL', '').replace('RL', ''));
  if (tool === 'v25-leader') return 'v25-leader';
  if (tool === 'v25-text') return 'v25-text';
  if (tool === 'v25-line') {
    const lw = v25Last.lineLw, ls = v25Last.lineLs;
    if (ls === 'centre') return 'v25-line-cl';
    if (ls === 'dotted') return 'v25-line-dotted';
    if (ls === 'dashed') return 'v25-line-dashed';
    if (lw >= 0.4) return 'v25-line-thick';
    return 'v25-line-thin';
  }
  return null;
}

// ---- Install new chord prefixes (H / B / K / W) ----
function v25InstallChords() {
  if (!CHORD_BINDINGS) return;
  // V25-layout-overhaul — H-chord routes to the new v25-hatch placement tool.
  // Steel solid / Water / Tanking entries removed (materials retired). New
  // Grout (G) and Soil (O) entries added.
  CHORD_BINDINGS.H = {
    label: 'Hatches',
    items: [
      { key: 'R', label: 'Existing concrete',  run: () => v25SetHatch('reoConcrete') },
      { key: 'C', label: 'New concrete',       run: () => v25SetHatch('concrete') },
      { key: 'B', label: 'Blockwork',          run: () => v25SetHatch('blockwork') },
      { key: 'K', label: 'Brick',              run: () => v25SetHatch('brickwork') },
      { key: 'X', label: 'Timber end grain',   run: () => v25SetHatch('timberSec') },
      { key: 'T', label: 'Timber side grain',  run: () => v25SetHatch('timberElev') },
      { key: 'G', label: 'Grout',              run: () => v25SetHatch('grout') },
      { key: 'S', label: 'Sand',               run: () => v25SetHatch('sand') },
      { key: 'F', label: 'Backfill',           run: () => v25SetHatch('backfill') },
      { key: 'O', label: 'Soil',               run: () => v25SetHatch('soil') },
      { key: 'I', label: 'Insulation',         run: () => v25SetHatch('insulation') },
      { key: 'E', label: 'Cross hatch',        run: () => v25SetHatch('earth') },
    ],
  };
  CHORD_BINDINGS.B = {
    label: 'Bolts / Anchors',
    items: [
      { key: 'B', label: 'Through-bolt',  run: () => v25SetAnchor('through') },
      { key: 'T', label: 'Trubolt',       run: () => v25SetAnchor('trubolt') },
      { key: 'C', label: 'Chemset',       run: () => v25SetAnchor('chemset') },
      { key: 'O', label: 'Coach screw',   run: () => v25SetAnchor('coach') },
      { key: 'K', label: 'Tek screw',     run: () => v25SetAnchor('selftap') },
    ],
  };
  CHORD_BINDINGS.K = {
    label: 'Reinforcement',
    items: [
      { key: '2', label: 'N12 bar',     run: () => v25SetBar('N12') },
      { key: '6', label: 'N16 bar',     run: () => v25SetBar('N16') },
      { key: 'N', label: 'N20 bar',     run: () => v25SetBar('N20') },
      { key: '4', label: 'N24 bar',     run: () => v25SetBar('N24') },
      { key: 'D', label: 'Bar dot (in section)', run: () => v25SetTool('v25-bar-dot') },
      { key: 'M', label: 'SL72 mesh',   run: () => v25SetMesh('SL72') },
      { key: '8', label: 'SL82 mesh',   run: () => v25SetMesh('SL82') },
      { key: '9', label: 'SL92 mesh',   run: () => v25SetMesh('SL92') },
    ],
  };
  CHORD_BINDINGS.W = {
    label: 'Walls (Blockwork)',
    items: [
      { key: '9', label: '90 series',   run: () => v25SetWallBlock('90') },
      { key: '1', label: '140 series',  run: () => v25SetWallBlock('140') },
      { key: '2', label: '190 series',  run: () => v25SetWallBlock('190') },
      { key: '3', label: '290 series',  run: () => v25SetWallBlock('290') },
    ],
  };
  // Extend existing A (annotate) chord with leader
  if (CHORD_BINDINGS.A && CHORD_BINDINGS.A.items) {
    if (!CHORD_BINDINGS.A.items.some(i => i.key === 'L')) {
      CHORD_BINDINGS.A.items.push({ key: 'L', label: 'Leader callout', run: () => v25SetTool('v25-leader') });
    }
  }
}

// Light-weight toast for mode-switch confirmation.
// ============================================================
