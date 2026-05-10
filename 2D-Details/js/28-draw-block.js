'use strict';

// Draw block content + view markers
// Extracted from dev/index.html lines 8226-8328 (2026-05-02 modular split)

// DRAW BLOCK CONTENT
// ============================================================

function drawBlockContent(blk, cs) {
  // --- ISOMETRIC BLOCK: blit 3D render onto the 2D canvas ---
  if (blk.viewKey === 'isometric') {
    if (sheetMode === '2d') return; // V25 — no 3D iso in paper-space mode
    const result = v3dRenderToImage(blk);
    if (!result) return;
    const { canvas: v3dCvs, sheetW, sheetH } = result;

    // Calculate where to draw on the 2D canvas:
    // The block's sheetX/sheetY is the centre of the isometric view in sheet-mm.
    // The 3D image covers sheetW × sheetH sheet-mm.
    const topLeftSheet = s2px(blk.sheetX - sheetW / 2, blk.sheetY - sheetH / 2);
    const botRightSheet = s2px(blk.sheetX + sheetW / 2, blk.sheetY + sheetH / 2);
    const dw = botRightSheet.x - topLeftSheet.x;
    const dh = botRightSheet.y - topLeftSheet.y;

    ctx.drawImage(v3dCvs, topLeftSheet.x, topLeftSheet.y, dw, dh);
    return;
  }

  const col = cs.getPropertyValue('--entity-color').trim();
  const hidCol = cs.getPropertyValue('--hid-color').trim();
  const clCol = cs.getPropertyValue('--cl-color').trim();
  const vk = blk.viewKey;

  // V25 — in 2D mode we render the elevation pane only and skip the 3D
  // object pipeline entirely. Just paint the per-view 2D entities (which
  // include the new V25 entity types via drawEnt2D's dispatch).
  if (sheetMode === '2d') {
    if (entities2D[vk]) entities2D[vk].forEach(ent => {
      const isPrev = ent.__preview === true;
      if (isPrev) { ctx.save(); ctx.globalAlpha = (ctx.globalAlpha ?? 1) * 0.5; }
      drawEnt2D(blk, ent, cs);
      if (isPrev) ctx.restore();
    });
    // V25-layout-overhaul Phase 6.4 — auto-weld hatch on top of member
    // outlines, beneath the selection highlight so picked members still read.
    if (typeof drawV25AutoWelds === 'function') drawV25AutoWelds(blk, cs);
    if (typeof v25DrawSelectionHighlight === 'function') v25DrawSelectionHighlight(blk, cs);
    if (typeof v25DrawPreview === 'function') v25DrawPreview(blk, cs);
    if (typeof v25DrawSnapIndicator === 'function') v25DrawSnapIndicator(blk, cs);
    return;
  }

  // Sort objects back-to-front by depth axis (painter's algorithm)
  const sorted = [...objects3D].sort((a, b) => getDepthValue(a, vk) - getDepthValue(b, vk));

  // Pre-filter objects by section cut classification (live cut planes).
  // V20 also filters by layer-visibility.
  const visibleObjs = sorted.filter(obj => {
    if (typeof layerVisibility === 'object' && layerVisibility[obj.type] === false) return false;
    const cc = getCutClass(obj, vk);
    obj._cutClass = cc; // stash for draw functions
    return cc !== 'hidden';
  });

  // Draw 3D objects with occlusion (only among visible objects).
  // V23.1 — preview objects (from the inline connection wizard) render at
  // 50% opacity so they read as a ghost until committed.
  visibleObjs.forEach(obj => {
    const occRects = getOcclusionRects(obj, vk);
    const cc = obj._cutClass || null;
    const isPrev = obj.__preview === true;
    // V25-layout-overhaul Phase 6.1 — per-object opacity. Multiplied into the
    // existing globalAlpha so it composes with the wizard-preview ghost (0.5).
    const objOp = (obj.opacity == null || isNaN(obj.opacity))
      ? 1 : Math.max(0, Math.min(1, +obj.opacity));
    const needSave = isPrev || objOp < 1;
    if (needSave) {
      ctx.save();
      ctx.globalAlpha = (ctx.globalAlpha ?? 1) * (isPrev ? 0.5 : 1) * objOp;
    }
    // V24 Phase A — route member renderers through the orientation proxy so
    // non-default frames (axis != +X) dispatch to the correct view branch.
    // Plates + bolts keep their existing dispatch (they don't use frames).
    if (obj.type === 'ub') drawMemberProxied(drawUB, blk, obj, col, hidCol, clCol, cs, occRects, cc);
    else if (obj.type === 'shs') drawMemberProxied(drawSHS, blk, obj, col, hidCol, clCol, cs, occRects, cc);
    else if (obj.type === 'plate') drawPlate(blk, obj, col, hidCol, clCol, cs, occRects, cc);
    else if (obj.type === 'bolt') drawBolt(blk, obj, col, hidCol, clCol, cs, occRects, cc);
    // V22.1 new section types use the unified renderer
    else if (obj.type === 'pfc' || obj.type === 'rhs' || obj.type === 'chs'
          || obj.type === 'ea'  || obj.type === 'ua') {
      drawMemberProxied(drawSectionMember, blk, obj, col, hidCol, clCol, cs, occRects, cc);
    }
    if (needSave) ctx.restore();
  });

  // Draw auto-weld hatching at member interfaces
  drawAutoWelds(blk, cs);

  // Draw 2D entities (ghost preview wrap for wizard items)
  if (entities2D[blk.viewKey]) entities2D[blk.viewKey].forEach(ent => {
    const isPrev = ent.__preview === true;
    if (isPrev) { ctx.save(); ctx.globalAlpha = (ctx.globalAlpha ?? 1) * 0.5; }
    drawEnt2D(blk, ent, cs);
    if (isPrev) ctx.restore();
  });
}

// ============================================================
