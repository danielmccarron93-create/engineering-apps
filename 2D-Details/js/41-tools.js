'use strict';

// Tool state machine + setTool
// Extracted from dev/index.html lines 12825-12863 (2026-05-02 modular split)

// TOOL STATE
// ============================================================

function setTool(t) {
  clickPts = []; polyPts = [];
  dimStep = 0; dimP1 = null; dimP2 = null; dimType = 'horizontal';
  placing = null; drawMember = null; drawStart = null; drawPreviewEnd = null;
  platePts = []; plateBlock = null; plateDimInput = ''; plateDimActive = false;
  boltGroupConfig = null; weldStep = 0; weldP1 = null;
  cycleHits = []; cycleIndex = 0;
  v25CycleIds = []; v25CycleIndex = 0; v25CycleLastPx = null;
  if (typeof snapResetTransient === 'function') snapResetTransient();
  // Tear down v25 transient state so leaving a v25 tool (e.g. measure) via a v1
  // setTool route (letter shortcut / Draw-tab tile) doesn't leak its first-click
  // origin into the next tool's ortho, mirroring v25SetTool's reset.
  if (typeof v25State === 'object' && v25State) { v25State.dragStart = null; v25State.polyPts = []; }
  if (typeof measureAwaitId !== 'undefined') { measureP1 = null; measureDimInput = ''; measureDimActive = false; measureAwaitId = null; measureClickLen = 0; }
  tool = t;
  canvas.style.cursor = t === 'select' ? 'default' : 'crosshair';
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  const map = { select:'toolSelect', line:'toolLine', rect:'toolRect',
    circle:'toolCircle', polyline:'toolPolyline', dimension:'toolDim', text:'toolText' };
  if (map[t]) document.getElementById(map[t])?.classList.add('active');
  // member-size-from-top-bar (2026-06-04) — refresh the 2D options bar so
  // switching into the Select tool surfaces a selected member's size editor (and
  // switching out of it hides the bar again).
  if (typeof v25UpdateOptionsBar === 'function') v25UpdateOptionsBar();
  requestRender();
}

function cancelDraw() {
  clickPts = []; polyPts = [];
  dimStep = 0; dimP1 = null; dimP2 = null;
  placing = null;
  drawMember = null; drawStart = null; drawPreviewEnd = null;
  platePts = []; plateBlock = null; plateDimInput = ''; plateDimActive = false;
  boltGroupConfig = null; weldStep = 0; weldP1 = null;
  requestRender();
}

function finishPolyline() {
  if (polyPts.length < 2) { polyPts = []; requestRender(); return; }
  const vk = activeBlock ? activeBlock.viewKey : 'elevation';
  for (let i = 0; i < polyPts.length - 1; i++) {
    addEnt2D(mkEnt2D(vk, 'line', { u1:polyPts[i].u, v1:polyPts[i].v, u2:polyPts[i+1].u, v2:polyPts[i+1].v, lw:0.35 }));
  }
  polyPts = [];
  requestRender();
}

