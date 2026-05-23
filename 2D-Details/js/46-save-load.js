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
  // architecture-v2 Phase 2 — embed the v2 slice when the v2 layer is loaded
  // so v2-authoritative elements (plates today; bolts/members later) survive
  // .sd2.json save/load. v2.io.save.previewSavePayload wraps `data` as
  // { schemaVersion: 2, v2: <serialised v2 model>, v1: <data> }. Without this
  // graft, a plate placed in the v2 PlacePlateTool would vanish on next load.
  // Guarded — falls back to bare-v1 save if the v2 layer isn't loaded.
  let toWrite = data;
  if (window.v2 && v2.io && v2.io.save &&
      typeof v2.io.save.previewSavePayload === 'function' &&
      v2.appState && v2.appState.model) {
    try {
      toWrite = v2.io.save.previewSavePayload(v2.appState.model, data);
    } catch (err) {
      if (window.console && console.error) {
        console.error('[v2] previewSavePayload threw, saving bare v1:', err);
      }
      toWrite = data;
    }
  }
  const blob = new Blob([JSON.stringify(toWrite, null, 2)], { type: 'application/json' });
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
      const parsed = JSON.parse(ev.target.result);
      // architecture-v2 Phase 2 — schemaVersion >= 2 wraps the v1 slice in
      // `parsed.v1` and stores v2-authoritative elements (plates today) in
      // `parsed.v2`. Bare v1 files (schemaVersion absent) still load
      // unchanged. The v2 slice is grafted onto the shadow further down
      // (after afterV1Load re-migrates v1 -> v2).
      const isV2File = parsed && typeof parsed === 'object' &&
                       typeof parsed.schemaVersion === 'number' &&
                       parsed.schemaVersion >= 2 &&
                       parsed.v1 && typeof parsed.v1 === 'object';
      const data = isV2File ? parsed.v1 : parsed;
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
      // architecture-v2 Phase 2 — graft v2-authoritative elements from the
      // file (plates today; bolts/members later) onto the shadow AFTER
      // afterV1Load re-migrated v1 -> v2. Without this graft, the migrator's
      // empty/zero plate output overwrites any plate the user had saved.
      if (isV2File && parsed.v2 && window.v2 && v2.io &&
          typeof v2.io.modelFromJSON === 'function' && v2.appState) {
        try {
          const v2Model = v2.io.modelFromJSON(parsed.v2);
          if (v2Model && v2Model.elements instanceof Map &&
              v2.appState.model && v2.appState.model.elements instanceof Map) {
            // Phase 3: extend the load-side graft to also restore v2 bolts
            // when the `useV2For.bolts` flag is on. Plates stay unconditional
            // (Phase 2). Mirrors v1-bridge.js captureV2Authoritative — the
            // same elements that survive a bridge re-sync also survive a
            // file load.
            const boltsAuth = !!(v2.featureFlags &&
              typeof v2.featureFlags.get === 'function' && v2.featureFlags.get('bolts'));
            v2Model.elements.forEach(function (el) {
              if (!el || !el.params) return;
              const src = el.params.v2Source;
              const isV2Plate = el.category === 'plate'    && src === 'place-plate-tool';
              const isV2Bolt  = el.category === 'fastener' && src === 'place-bolt-tool' && boltsAuth;
              if (isV2Plate || isV2Bolt) {
                v2.appState.model.elements.set(el.id, el);
              }
            });
            // Re-render so v2 plates appear immediately on the canvas + iso.
            if (v2.engine && v2.engine.dirtyBus &&
                typeof v2.engine.dirtyBus.emit === 'function') {
              v2.engine.dirtyBus.emit('model-changed', {
                source: 'loadProject-v2-graft',
              });
            }
          }
        } catch (err) {
          if (window.console && console.error) {
            console.error('[v2] v2-slice load failed (file load continues):', err);
          }
        }
      }
    } catch (err) {
      alert('Error loading file: ' + err.message);
    }
  };
  reader.readAsText(file);
}

