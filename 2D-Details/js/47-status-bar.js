'use strict';

// Status bar updater
// Extracted from dev/index.html lines 13259-13356 (2026-05-02 modular split)

// STATUS BAR
// ============================================================

function updateStatus() {
  const blk = activeBlock;
  const labels = { elevation: 'Elevation', sectionA: 'Section A', planB: 'Plan B' };
  document.getElementById('statusView').textContent = blk ? labels[blk.viewKey] : 'Sheet';

  if (blk && cursorSheet) {
    const [cu, cv] = getCursor(blk);
    if (blk.viewKey === 'elevation') {
      document.getElementById('statusX').textContent = cu.toFixed(1);
      document.getElementById('statusY').textContent = cv.toFixed(1);
      document.getElementById('statusZ').textContent = '-';
    } else if (blk.viewKey === 'sectionA') {
      document.getElementById('statusX').textContent = '-';
      document.getElementById('statusY').textContent = cv.toFixed(1);
      document.getElementById('statusZ').textContent = cu.toFixed(1);
    } else {
      document.getElementById('statusX').textContent = cu.toFixed(1);
      document.getElementById('statusY').textContent = '-';
      document.getElementById('statusZ').textContent = cv.toFixed(1);
    }
  }

  document.getElementById('statusScale').textContent = `1:${drawingScale}`;

  let toolLabel = tool.charAt(0).toUpperCase() + tool.slice(1);
  if (tool === 'place-component' && placing) toolLabel = 'Place ' + (placing.section || placing.boltSize || 'Plate');
  if (tool === 'draw-member' && drawMember) {
    const name = drawMember.section || drawMember.boltSize || 'Plate';
    toolLabel = drawStart ? `Draw ${name}: pick end point` : `Draw ${name}: pick start point`;
  }
  if (tool === 'draw-plate') {
    if (platePts.length === 0) toolLabel = 'Plate: pick first corner';
    else if (platePts.length < 3) toolLabel = `Plate: ${platePts.length} pts — keep clicking`;
    else toolLabel = `Plate: ${platePts.length} pts — dbl-click/Enter to close`;
  }
  if (tool === 'polyline' && polyPts.length > 0) toolLabel = `Polyline (${polyPts.length} pts)`;
  if (tool === 'dimension') {
    const dtLabel = dimType === 'aligned' ? 'Aligned' : dimType === 'angular' ? 'Angular' : dimType === 'vertical' ? 'Vert' : 'Horiz';
    const steps = dimType === 'angular' ? ['Vertex', 'Ray 1', 'Ray 2'] : ['Pick 1st', 'Pick 2nd', 'Offset'];
    toolLabel = `Dim (${dtLabel}): ${steps[dimStep]} [A/H/N]`;
  }
  if (tool === 'place-bolt-group') toolLabel = 'Bolt Group: click to place';
  if (tool === 'draw-weld') toolLabel = weldStep === 0 ? 'Weld: pick joint point' : 'Weld: pick direction';
  if (tool === 'draw-breakline') toolLabel = clickPts.length === 0 ? 'Break Line: pick start' : 'Break Line: pick end';
  if (tool === 'draw-centreline') toolLabel = clickPts.length === 0 ? 'Centreline: pick start' : 'Centreline: pick end';
  // Fix D (2026-05-23): v2 active tool's statusText overrides v1's tool label.
  // Lets PlacePlateTool surface "Rect — click first corner" etc. through v1's
  // existing status bar without v2 needing its own status DOM.
  const v2Tool = (window.v2 && v2.engine && typeof v2.engine.activeTool === 'function')
    ? v2.engine.activeTool() : null;
  if (v2Tool && typeof v2Tool.statusText === 'function') {
    try {
      const ts = (v2.appState && v2.appState.tools && v2.appState.tools[v2Tool.id]) || {};
      const s = v2Tool.statusText({ toolState: ts });
      if (typeof s === 'string' && s.length) toolLabel = s;
    } catch (e) { /* fall through to v1 label */ }
  }
  document.getElementById('statusTool').textContent = toolLabel;

  document.getElementById('prop3DCount').textContent = objects3D.length;
  const ent2dTotal = entities2D.elevation.length + entities2D.sectionA.length + entities2D.planB.length;
  document.getElementById('prop2DCount').textContent = ent2dTotal;
  document.getElementById('propSelectedCount').textContent = selected3D.length;

  // Properties
  if (selected3D.length === 1) {
    const o = selected3D[0];
    let selLabel = o.type.toUpperCase() + (o.section ? ' — ' + o.section : o.boltSize ? ' — ' + o.boltSize : '');
    if (o.type === 'bolt') {
      const gi = computeBoltGripInfo(o);
      selLabel += ` | Grip:${gi.grip.toFixed(0)} L:${gi.boltLen}`;
    }
    document.getElementById('propSelection').textContent = selLabel;
    document.getElementById('propX').value = (o.x || 0).toFixed(0);
    document.getElementById('propY').value = (o.y || 0).toFixed(0);
    document.getElementById('propZ').value = (o.z || 0).toFixed(0);
    if (o.pw !== undefined) {
      document.getElementById('propW').value = o.pw;
      document.getElementById('propH').value = o.ph;
      document.getElementById('propD').value = o.pt;
    } else if (o.length !== undefined) {
      document.getElementById('propW').value = '';
      document.getElementById('propH').value = '';
      document.getElementById('propD').value = o.length;
    } else if (o.type === 'bolt') {
      const gi = computeBoltGripInfo(o);
      document.getElementById('propW').value = 'G:' + gi.grip.toFixed(0);
      document.getElementById('propH').value = 'L:' + gi.boltLen;
      document.getElementById('propD').value = '';
    } else {
      document.getElementById('propW').value = '';
      document.getElementById('propH').value = '';
      document.getElementById('propD').value = '';
    }
  } else {
    document.getElementById('propSelection').textContent = selected3D.length > 0 ? `${selected3D.length} selected` : 'None';
    ['propX','propY','propZ','propW','propH','propD'].forEach(id => document.getElementById(id).value = '');
  }

  const pp = document.getElementById('propsPanel');
  if (pp) pp.classList.toggle('visible', selected3D.length > 0);

  // V21 — drive the Inspector panel and the active-tile highlight.
  if (typeof updateInspector === 'function') updateInspector();
  if (typeof highlightActiveTile === 'function') highlightActiveTile();
}

