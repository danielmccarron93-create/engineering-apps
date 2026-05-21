'use strict';

// Save / load project (single sheet JSON)
// Extracted from dev/index.html lines 13193-13257 (2026-05-02 modular split)

// SAVE / LOAD PROJECT (JSON)
// ============================================================

function saveProject() {
  // V23.1 — commit or discard any open wizard before serialising.
  if (connWizState) connWizCancel();
  const data = {
    version: '1.0',
    timestamp: new Date().toISOString(),
    drawingScale, gridSize, nudgeSize, secCutX, planCutY,
    objects3D: objects3D,
    entities2D: entities2D,
    weldOverrides: weldOverrides,
    // V14-J — per-pair joint overrides. mitrePairs is the legacy 3D + V25
    // mitre flag (V25 default is now mitre, so V25 entries here are no-ops
    // but kept for back-compat reads). priorityForPairV25 stores the user's
    // explicit "this member is priority" choice for a V25 pair; absent means
    // mitre. Per-object weldPriorityBoost is round-tripped via objects3D.
    mitrePairs: (typeof mitrePairs !== 'undefined') ? mitrePairs : {},
    priorityForPairV25: (typeof priorityForPairV25 !== 'undefined') ? priorityForPairV25 : {},
    sheetInfo: sheetInfo,
    blocks: blocks.map(b => ({ viewKey: b.viewKey, sheetX: b.sheetX, sheetY: b.sheetY, boxW: b.boxW, boxH: b.boxH, hidden: b.hidden }))
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `structdraw-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function loadProject(file) {
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      objects3D = data.objects3D || [];
      entities2D = data.entities2D || { elevation: [], sectionA: [], planB: [] };
      // Restore settings
      if (data.drawingScale) { drawingScale = data.drawingScale; document.getElementById('scaleSelect').value = drawingScale; }
      if (data.gridSize) { gridSize = data.gridSize; document.getElementById('gridSizeSelect').value = gridSize; }
      if (data.nudgeSize) { nudgeSize = data.nudgeSize; document.getElementById('nudgeSizeSelect').value = nudgeSize; }
      if (data.secCutX !== undefined) secCutX = data.secCutX;
      if (data.planCutY !== undefined) planCutY = data.planCutY;
      if (data.weldOverrides) weldOverrides = data.weldOverrides; else weldOverrides = {};
      if (typeof mitrePairs !== 'undefined') {
        mitrePairs = data.mitrePairs || {};
      }
      if (typeof priorityForPairV25 !== 'undefined') {
        priorityForPairV25 = data.priorityForPairV25 || {};
      }
      if (data.sheetInfo) Object.assign(sheetInfo, data.sheetInfo);
      // Restore block positions
      if (data.blocks) {
        data.blocks.forEach(sb => {
          const blk = blocks.find(b => b.viewKey === sb.viewKey);
          if (blk) { blk.sheetX = sb.sheetX; blk.sheetY = sb.sheetY; if (sb.boxW) blk.boxW = sb.boxW; if (sb.boxH) blk.boxH = sb.boxH; if (sb.hidden !== undefined) blk.hidden = sb.hidden; }
        });
      }
      // Recalculate ID counters to avoid collisions
      objIdN = objects3D.reduce((m, o) => Math.max(m, o.id || 0), 0) + 1;
      const allEnts = [...entities2D.elevation, ...entities2D.sectionA, ...entities2D.planB];
      ent2dIdN = allEnts.reduce((m, e) => Math.max(m, e.id || 0), 0) + 1;
      // Reset state
      selected3D = []; undoStack = []; redoStack = [];
      // V24 Phase A — upgrade legacy members loaded from older .json files.
      if (typeof migrateAllMembers === 'function') migrateAllMembers();
      if (typeof v3dMarkDirty === 'function') v3dMarkDirty();
      invalidateWeldCache();
      fitToView(); requestRender();
      // architecture-v2 Phase 0e — close the Phase-0d async-load gap. After
      // every v1 global is repopulated, re-migrate the live v1 state into the
      // v2 shadow model (`v2.appState.model`). Guarded — the lookup is a
      // no-op if the v2 layer isn't loaded.
      if (window.v2 && v2.io && v2.io.load &&
          typeof v2.io.load.afterV1Load === 'function') {
        v2.io.load.afterV1Load('loadProject');
      }
    } catch (err) {
      alert('Error loading file: ' + err.message);
    }
  };
  reader.readAsText(file);
}

