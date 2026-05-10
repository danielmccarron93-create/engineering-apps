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

// ---- TWO-CLICK DRAW-MEMBER STATE ----
let drawMember = null;       // { type, section, ... } — what we're drawing (set from library)
let drawStart = null;        // { blk, cu, cv } — first click point (real-world view coords)
let drawPreviewEnd = null;   // { cu, cv } — live cursor position during draw (real-world)

// ---- POLYGON PLATE DRAWING STATE ----
let platePts = [];           // [{u, v}, ...] — polygon vertices in view coords (during drawing)
let plateBlock = null;       // which DetailBlock the plate is being drawn in
let plateDimInput = '';      // typed dimension string during edge drawing
let plateDimActive = false;  // true when user is typing a dimension mid-edge

let spaceHeld = false, shiftHeld = false;
let snapOn = true, orthoOn = false, gridOn = false;
let gridSize = 10;
let nudgeSize = 10;

let clipboardObjs = null;

// ---- TAB-TO-CYCLE SELECTION STATE ----
let cycleHits = [];    // all objects under cursor (for Tab cycling)
let cycleIndex = 0;    // current index in cycleHits
let cycleLastPx = null; // cursor position when cycle started

// ---- BOLT GROUP STATE ----
let boltGroupConfig = null; // { boltSize, rows, cols, gauge, pitch }

// ---- WELD SYMBOL STATE ----
let weldStep = 0;
let weldP1 = null;

// ---- DIMENSION TYPE STATE ----
let dimType = 'horizontal'; // 'horizontal', 'vertical', 'aligned', 'angular'

// Mouse state
let isPanning = false, panLast = null;
let dragMoving = false, dragStart = null, dragSnapshots = null;
let selBoxStart = null;
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
