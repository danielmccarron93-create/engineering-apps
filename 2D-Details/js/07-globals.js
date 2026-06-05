'use strict';

// Top-level mutable state — canvas, ctx, viewport, blocks, tool, drag/grip/cycle/rotate
// Extracted from dev/index.html lines 3500-3587 (2026-05-02 modular split)

// GLOBAL STATE
// ============================================================

const DPR = window.devicePixelRatio || 1;

let canvas, ctx;
let container;
let W = 0, H = 0; // canvas CSS size

// Viewport: sheet coords → screen
let viewport = { panX: 0, panY: 0, zoom: 1 };  // zoom = screen-px per sheet-mm

let drawingScale = 10; // 1:10 default

// V25 — per-sheet drawing mode. '3d' = projected views (current default),
// '2d' = single paper-space pane filling the drawing area for hand-drawn
// structural details (blockwork, hatches, anchors, reo, leaders, frames).
// Mirrors the active sheet's `mode` field; updated by applySheetMode().
let sheetMode = '3d';

// Detail blocks
let blocks = [];
let activeBlock = null;

let tool = 'select';
let clickPts = [];
let polyPts = [];
let dimStep = 0, dimP1 = null, dimP2 = null;
let placing = null;

// ---- TIMBER-SCREW CONNECTION FEATURE (2026-05-18, Phase 2) ----
// All new globals for this feature use the `tmbr` prefix per
// PlannedBuilds/timber-screws/05-architecture.md §9.
//
// tmbrCurrentConnectionId — id of the Connection entity that newly-placed
//   screws bind to. Null when no connection is active (Phase 2 default; Phase 3
//   wires the "Start connection" flow that sets it). When non-null, the screw
//   placement tool stamps `connectionId` on each new screw entity.
let tmbrCurrentConnectionId = null;

// ---- TWO-CLICK DRAW-MEMBER STATE ----
let drawMember = null;       // { type, section, ... } — what we're drawing (set from library)
let drawStart = null;        // { blk, cu, cv } — first click point (real-world view coords)
let drawPreviewEnd = null;   // { cu, cv } — live cursor position during draw (real-world)

// ---- POLYGON PLATE DRAWING STATE ----
let platePts = [];           // [{u, v}, ...] — polygon vertices in view coords (during drawing)
let plateBlock = null;       // which DetailBlock the plate is being drawn in
let plateDimInput = '';      // typed dimension string during edge drawing
let plateDimActive = false;  // true when user is typing a dimension mid-edge

// ---- PREMIUM NOTE / TEXT-BOX TOOL STATE ----
// Premium note / text-box tool (v25 'noteBox' entity — see js/96–98).
let nbPlace = null;   // {blk,u,v} first click (box top-left) during two-click placement
let nbEditor = null;  // inline text-editor overlay state {ent, el, blk}

// ---- DIMENSION / MEASURE TOOL STATE (v25 'dim2' entity — see js/82) ----
// The first measured point lives on v25State.dragStart (so getCursor's ortho
// origin picks it up); measureP1 mirrors it only so the keyboard typing block
// can read it cheaply.
let measureP1 = null;          // {u,v} first measured point (mirror of v25State.dragStart)
let measureDimInput = '';      // typed-digit buffer (set exact length after 2nd click)
let measureDimActive = false;  // true while a typed length is being entered
let measureClickLen = 0;       // as-clicked length (mm) — revert target if the buffer is cleared
let measureAwaitId = null;     // id of the just-placed dim2 awaiting digit/letter typing
let dimEditor = null;          // inline double-click editor state {ent, el, blk, raf}

let spaceHeld = false, shiftHeld = false, altHeld = false;
let snapOn = true, orthoOn = false, gridOn = false;
let gridSize = 5;
let nudgeSize = 10;
let spellEnabled = true;   // note spell-check on by default (js/80 + js/81); persisted to localStorage

let clipboardObjs = null;

// Snapshot-tool clipboard (2D paper-space region capture). Null until a capture.
// { bytes, paperMM:{w,h}, srcW, srcH, originSheet:{x,y}, shape, polySheet, committed:{} } | null
let snapClip = null;

// ---- TAB-TO-CYCLE SELECTION STATE ----
let cycleHits = [];    // all objects under cursor (for Tab cycling)
let cycleIndex = 0;    // current index in cycleHits
let cycleLastPx = null; // cursor position when cycle started

// ---- 2D CLICK-AGAIN CYCLE (noteBox-over-member pick) ----
// Repeat-clicking the same spot in 2D select walks the hit-stack underneath the
// top pick (Bluebeam/AutoCAD "click again to get the thing behind"). Distinct
// from the 3D Tab-cycle above (cycleHits/…) which writes selected3D.
let v25CycleIds = [];      // ordered entity ids under the last click (stack order)
let v25CycleIndex = 0;     // which stack entry is currently selected
let v25CycleLastPx = null; // {x,y} canvas px of the last cycle click

// ---- BOLT GROUP STATE ----
let boltGroupConfig = null; // { boltSize, rows, cols, gauge, pitch }

// ---- WELD SYMBOL STATE ----
let weldStep = 0;
let weldP1 = null;

// ---- GROUPING STATE (plate-grouping-stiffener) ----
// Monotonic counter for minting group ids (see js/72f-v25-grouping.js). A
// `groupId` is stamped on every member (v25 ent.groupId / v2 plate
// params.groupId) so a welded assembly moves as one unit.
let v25GroupSeq = 0;

// ---- DIMENSION TYPE STATE ----
let dimType = 'horizontal'; // 'horizontal', 'vertical', 'aligned', 'angular'

// Mouse state
let isPanning = false, panLast = null;
let dragMoving = false, dragStart = null, dragSnapshots = null;

// ---- SHIFT-SCROLL PAGE NAVIGATION (multi-file-workspace) ----
// Shift+wheel steps between pages in the active file's project.sheets. Wheel
// deltas are tiny and noisy (esp. trackpads), so we accumulate them here and
// move a number of pages PROPORTIONAL to the piled-up delta: one notch ≈ one
// page, a hard flick = several pages in a single direct jump. The whole-step
// amount is subtracted off after each jump (the sub-threshold remainder is kept
// so slow drips still eventually advance). Read/written only by the wheel handler
// in js/39-events.js.
let pageNavAccum = 0;

// ---- MODIFIER-DRAG DUPLICATE (Bluebeam-style copy-drag) ----
// Hold the duplicate modifier and body-drag any item to drop an exact copy; the
// original stays put and the COPY follows the cursor. Modifier = Alt on every
// platform, plus Ctrl on Windows/Linux only — on macOS Ctrl+click is the system
// right-click (it drives the Group/Joint context menu in js/39-events.js), so
// Ctrl is deliberately left alone there. isDupDragModifier() is the single
// source of truth, read by both the v1 event tree (js/39-events.js) and the v2
// plate tool (js/v2/tools/edit-plate.js, via window).
const IS_MAC = /Mac|iPhone|iPad/.test((typeof navigator !== 'undefined' && navigator.platform) || '');
function isDupDragModifier(e) { return !!(e && (e.altKey || (e.ctrlKey && !IS_MAC))); }
if (typeof window !== 'undefined') window.isDupDragModifier = isDupDragModifier;
// 3D-object pipeline cross-event state — set at mousedown, consumed on the first
// mousemove. (The v25 and v2-plate pipelines stash the equivalent flag on their
// per-drag object instead, so they need no module-level global.)
let dragDupPending = false;   // modifier+body seen at 3D mousedown, awaiting first move
let dragDupObjIds = null;     // ids of the 3D clones the current copy-drag added (for the mouseup undo)

let selBoxStart = null;
// Which finaliser the mouseup branch should run for the marquee that
// `selBoxStart` started: '3d' = filter objects3D + getObj2DBounds, '2d' = filter
// entities2D[viewKey] + v25EntBounds. Captured at mousedown so a sheet-mode
// switch mid-drag doesn't pick the wrong list. Null when no marquee is active.
let selBoxMode = null;
let blockDragging = null; // for dragging detail block positions
let blockDragOffset = null;
let blockResizing = null;  // { block, handle } — which block/corner is being resized
let blockResizeStart = null; // { sx, sy, boxW, boxH } snapshot at resize start
let cursorSheet = null;  // current cursor in sheet-mm

// ---- GRIP HANDLE STATE ----
// Grip types: 'edge-l','edge-r','edge-t','edge-b' (plate resize),
//             'end-top','end-bot' (member length), 'rotate' (rotation handle)
let activeGrip = null;   // { obj, type, block } — which grip is being dragged
let gripStart = null;    // { u, v } in real-world coords at drag start
let gripSnapshot = null; // deep copy of obj before grip drag

// ---- ROTATION STATE ----
// Objects store rotation as obj.rot (degrees, in active view plane).
// Default 0° means upright/horizontal as currently drawn.
let rotateMode = false;
let rotatePivot = null;  // { u, v } in real-world coords
let rotateStartAngle = null; // radians from pivot to initial click

// ============================================================
