'use strict';

// Crosshair + click preview overlay
// Extracted from dev/index.html lines 10890-11243 (2026-05-02 modular split)

// CROSSHAIR & CLICK PREVIEW
// ============================================================

function drawCrosshair(blk, cs) {
  if (!cursorSheet) return;
  const isDrawing = tool !== 'select' || clickPts.length > 0;
  if (!isDrawing && !placing) return;

  const [cu, cv] = getCursor(blk);
  const p = real2px(blk, cu, cv);

  ctx.strokeStyle = cs.getPropertyValue('--crosshair-color').trim();
  ctx.lineWidth = 0.5; ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(0, p.y); ctx.lineTo(W, p.y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(p.x, 0); ctx.lineTo(p.x, H); ctx.stroke();

  ctx.fillStyle = cs.getPropertyValue('--crosshair-text').trim();
  ctx.font = '9px system-ui';
  ctx.fillText(`${cu.toFixed(1)}, ${cv.toFixed(1)}`, p.x + 10, p.y - 8);
}

function drawClickPreview(blk, cs) {
  if (!cursorSheet) return;
  const [cu, cv] = getCursor(blk);
  const selCol = cs.getPropertyValue('--selected-color').trim();
  ctx.strokeStyle = selCol; ctx.lineWidth = 1; ctx.setLineDash(DASH.SNAP);

  if (tool === 'line' && clickPts.length === 1) {
    rLine(blk, clickPts[0].u, clickPts[0].v, cu, cv);
    const dist = Math.hypot(cu - clickPts[0].u, cv - clickPts[0].v);
    const mp = real2px(blk, (clickPts[0].u+cu)/2, (clickPts[0].v+cv)/2);
    ctx.fillStyle = selCol; ctx.font = '10px system-ui';
    ctx.fillText(dist.toFixed(1) + 'mm', mp.x + 8, mp.y - 8);
  }
  else if (tool === 'rect' && clickPts.length === 1) {
    const p = clickPts[0];
    const p1 = real2px(blk, Math.min(p.u, cu), Math.max(p.v, cv));
    const w = Math.abs(cu - p.u) / drawingScale * viewport.zoom;
    const h = Math.abs(cv - p.v) / drawingScale * viewport.zoom;
    ctx.strokeRect(p1.x, p1.y, w, h);
  }
  else if (tool === 'circle' && clickPts.length === 1) {
    const p = clickPts[0];
    const r = Math.hypot(cu - p.u, cv - p.v) / drawingScale * viewport.zoom;
    const cp = real2px(blk, p.u, p.v);
    ctx.beginPath(); ctx.arc(cp.x, cp.y, r, 0, Math.PI*2); ctx.stroke();
  }
  else if (tool === 'polyline' && polyPts.length > 0) {
    ctx.setLineDash([]); ctx.strokeStyle = cs.getPropertyValue('--entity-color').trim();
    ctx.lineWidth = Math.max(1, 0.35 * ppm());
    ctx.beginPath();
    const fp = real2px(blk, polyPts[0].u, polyPts[0].v);
    ctx.moveTo(fp.x, fp.y);
    for (let i = 1; i < polyPts.length; i++) {
      const pp = real2px(blk, polyPts[i].u, polyPts[i].v);
      ctx.lineTo(pp.x, pp.y);
    }
    ctx.stroke();
    ctx.setLineDash(DASH.SNAP); ctx.strokeStyle = selCol; ctx.lineWidth = 1;
    const last = polyPts[polyPts.length-1];
    rLine(blk, last.u, last.v, cu, cv);
    ctx.fillStyle = selCol;
    polyPts.forEach(pt => {
      const vp = real2px(blk, pt.u, pt.v);
      ctx.fillRect(vp.x-3, vp.y-3, 6, 6);
    });
  }
  else if (tool === 'draw-member' && drawMember) {
    const pm = ppm();
    if (drawStart && drawStart.blk === blk) {
      // Drawing in progress: show centreline + faint outline from start to cursor
      const su = drawStart.cu, sv = drawStart.cv;
      const p1 = real2px(blk, su, sv);
      const p2 = real2px(blk, cu, cv);
      const du = cu - su, dv = cv - sv;
      const len = Math.hypot(du, dv);
      const angle = Math.atan2(dv, du);

      // Perpendicular offset direction (for member depth outline)
      const perpU = -Math.sin(angle);
      const perpV = Math.cos(angle);

      // Get member half-depth for outline
      let halfDepth = 0;
      if (drawMember.type === 'ub') {
        const s = UB_DB[drawMember.section];
        if (s) halfDepth = s.d / 2;
      } else if (drawMember.type === 'shs') {
        const s = SHS_DB[drawMember.section];
        if (s) halfDepth = s.B / 2;
      } else if (drawMember.type === 'plate') {
        halfDepth = (drawMember.ph || 100) / 2;
      }

      // --- Centreline: dot-dash (AS 1100 chain-dot) ---
      ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--cl-color').trim() || '#00bb00';
      ctx.lineWidth = Math.max(0.25, LW.CL * pm);
      const clDash = 12 / viewport.zoom * drawingScale;
      const clDot = 1 / viewport.zoom * drawingScale;
      const clGap = 3 / viewport.zoom * drawingScale;
      // Extend centreline 15mm beyond member ends
      const ext = 15;
      const exU = Math.cos(angle) * ext;
      const exV = Math.sin(angle) * ext;
      const cl1 = real2px(blk, su - exU, sv - exV);
      const cl2 = real2px(blk, cu + exU, cv + exV);
      ctx.setLineDash([clDash / drawingScale * viewport.zoom, clGap / drawingScale * viewport.zoom, clDot / drawingScale * viewport.zoom, clGap / drawingScale * viewport.zoom]);
      ctx.beginPath(); ctx.moveTo(cl1.x, cl1.y); ctx.lineTo(cl2.x, cl2.y); ctx.stroke();
      ctx.setLineDash([]);

      // --- Faint outline: member edges ---
      if (halfDepth > 0) {
        ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--entity-color').trim() || '#cccccc';
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = Math.max(0.25, LW.HID * pm);
        // Four corners of the member outline
        const c1 = real2px(blk, su + perpU * halfDepth, sv + perpV * halfDepth);
        const c2 = real2px(blk, cu + perpU * halfDepth, cv + perpV * halfDepth);
        const c3 = real2px(blk, cu - perpU * halfDepth, cv - perpV * halfDepth);
        const c4 = real2px(blk, su - perpU * halfDepth, sv - perpV * halfDepth);
        ctx.beginPath();
        ctx.moveTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y);
        ctx.lineTo(c3.x, c3.y); ctx.lineTo(c4.x, c4.y);
        ctx.closePath(); ctx.stroke();
        ctx.globalAlpha = 1.0;
      }

      // --- Start point marker ---
      ctx.fillStyle = '#00aaff';
      ctx.beginPath(); ctx.arc(p1.x, p1.y, 3, 0, Math.PI * 2); ctx.fill();

      // --- Live dimension readout near cursor ---
      if (len > 1) {
        const midPx = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        const offsetPx = 16; // pixels offset from centreline
        const labelX = midPx.x + perpU * offsetPx * viewport.zoom * 0.05 + 10;
        const labelY = midPx.y - 15;
        const rotDeg = Math.round(angle * 180 / Math.PI * 10) / 10;
        const dimText = `${Math.round(len)} mm`;
        const angleText = `${rotDeg}°`;

        ctx.font = `bold 12px 'Segoe UI', sans-serif`;
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 3;
        // Background pill
        const tm = ctx.measureText(dimText);
        const tm2 = ctx.measureText(angleText);
        const tw = Math.max(tm.width, tm2.width) + 16;
        const th = 36;
        const rx = p2.x + 15, ry = p2.y - th - 5;
        ctx.fillStyle = 'rgba(30,30,30,0.85)';
        ctx.beginPath();
        ctx.roundRect(rx, ry, tw, th, 4);
        ctx.fill();
        // Text
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.font = `bold 11px 'Segoe UI', sans-serif`;
        ctx.fillText(dimText, rx + 6, ry + 4);
        ctx.font = `10px 'Segoe UI', sans-serif`;
        ctx.fillStyle = '#aaaaaa';
        ctx.fillText(angleText, rx + 6, ry + 20);
        ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
      }
    } else if (!drawStart) {
      // Before first click: show crosshair and section label at cursor
      const p = real2px(blk, cu, cv);
      ctx.fillStyle = '#00aaff';
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
      // Label
      let label = '';
      if (drawMember.type === 'ub') label = drawMember.section;
      else if (drawMember.type === 'shs') label = drawMember.section + ' SHS';
      else if (drawMember.type === 'pfc' || drawMember.type === 'rhs'
            || drawMember.type === 'chs' || drawMember.type === 'ea' || drawMember.type === 'ua') {
        label = drawMember.section + ' ' + drawMember.type.toUpperCase();
      }
      else if (drawMember.type === 'bolt') label = drawMember.boltSize + ' Bolt';
      else if (drawMember.type === 'plate') label = `Plate ${drawMember.pw || '?'}×${drawMember.ph || '?'}×${drawMember.pt || '?'}`;
      if (label) {
        ctx.font = `10px 'Segoe UI', sans-serif`;
        ctx.fillStyle = 'rgba(30,30,30,0.8)';
        const lm = ctx.measureText(label);
        ctx.fillRect(p.x + 12, p.y - 18, lm.width + 8, 18);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(label, p.x + 16, p.y - 9);
        ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
      }
    }
  }
  else if (tool === 'draw-plate' && blk) {
    const pm = ppm();
    const col = cs.getPropertyValue('--entity-color').trim();
    const cutLW = Math.max(1, LW.CUT * pm);

    if (platePts.length > 0 && plateBlock === blk) {
      // Draw completed edges (solid thick lines)
      ctx.strokeStyle = col;
      ctx.lineWidth = cutLW;
      ctx.setLineDash([]);
      for (let i = 0; i < platePts.length - 1; i++) {
        const p1 = real2px(blk, platePts[i].u, platePts[i].v);
        const p2 = real2px(blk, platePts[i+1].u, platePts[i+1].v);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();

        // Edge dimension label
        const edgeLen = Math.hypot(platePts[i+1].u - platePts[i].u, platePts[i+1].v - platePts[i].v);
        const midPx = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        ctx.font = `9px 'Segoe UI', sans-serif`;
        ctx.fillStyle = 'rgba(30,30,30,0.75)';
        const dtxt = Math.round(edgeLen) + '';
        const dtm = ctx.measureText(dtxt);
        ctx.fillRect(midPx.x - dtm.width/2 - 3, midPx.y - 14, dtm.width + 6, 16);
        ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(dtxt, midPx.x, midPx.y - 6);
        ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
      }

      // Draw rubber-band edge to cursor (dashed)
      const last = platePts[platePts.length - 1];
      const pLast = real2px(blk, last.u, last.v);
      const pCur = real2px(blk, cu, cv);
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(0.5, LW.VIS * pm);
      ctx.setLineDash(DASH.UI_ALT);
      ctx.beginPath(); ctx.moveTo(pLast.x, pLast.y); ctx.lineTo(pCur.x, pCur.y); ctx.stroke();
      ctx.setLineDash([]);

      // Closing edge preview (dashed, from cursor back to first point)
      if (platePts.length >= 2) {
        const pFirst = real2px(blk, platePts[0].u, platePts[0].v);
        ctx.globalAlpha = 0.3;
        ctx.setLineDash(DASH.SNAP);
        ctx.beginPath(); ctx.moveTo(pCur.x, pCur.y); ctx.lineTo(pFirst.x, pFirst.y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1.0;
      }

      // Light fill preview of the polygon
      if (platePts.length >= 2) {
        ctx.globalAlpha = 0.06;
        ctx.fillStyle = col;
        ctx.beginPath();
        const fp = real2px(blk, platePts[0].u, platePts[0].v);
        ctx.moveTo(fp.x, fp.y);
        for (let i = 1; i < platePts.length; i++) {
          const pp = real2px(blk, platePts[i].u, platePts[i].v);
          ctx.lineTo(pp.x, pp.y);
        }
        ctx.lineTo(pCur.x, pCur.y);
        ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1.0;
      }

      // Vertex markers
      ctx.fillStyle = '#00aaff';
      platePts.forEach(pt => {
        const pp = real2px(blk, pt.u, pt.v);
        ctx.beginPath(); ctx.arc(pp.x, pp.y, 3, 0, Math.PI * 2); ctx.fill();
      });

      // Live dimension: current edge length near cursor
      const rubberLen = Math.hypot(cu - last.u, cv - last.v);
      if (rubberLen > 1) {
        const angle = Math.atan2(cv - last.v, cu - last.u);
        const rotDeg = Math.round(angle * 180 / Math.PI * 10) / 10;
        const dimText = plateDimActive && plateDimInput ?
          plateDimInput + '_ mm' : Math.round(rubberLen) + ' mm';
        const angleText = rotDeg + '°';

        ctx.font = `bold 11px 'Segoe UI', sans-serif`;
        const tw = Math.max(ctx.measureText(dimText).width, ctx.measureText(angleText).width) + 16;
        const th = 36;
        const rx = pCur.x + 15, ry = pCur.y - th - 5;
        ctx.fillStyle = 'rgba(30,30,30,0.85)';
        ctx.beginPath(); ctx.roundRect(rx, ry, tw, th, 4); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(dimText, rx + 6, ry + 4);
        ctx.font = `10px 'Segoe UI', sans-serif`;
        ctx.fillStyle = '#aaaaaa';
        ctx.fillText(angleText, rx + 6, ry + 20);
        ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
      }

      // Vertex count / hint
      ctx.font = `10px 'Segoe UI', sans-serif`;
      ctx.fillStyle = 'rgba(30,30,30,0.7)';
      const hint = platePts.length >= 3 ? `${platePts.length} pts — dbl-click or Enter to close` : `${platePts.length} pt${platePts.length > 1 ? 's' : ''} — click to add vertices`;
      const htm = ctx.measureText(hint);
      ctx.fillRect(pCur.x + 15, pCur.y + 8, htm.width + 8, 16);
      ctx.fillStyle = '#cccccc'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(hint, pCur.x + 19, pCur.y + 16);
      ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';

    } else if (platePts.length === 0) {
      // Before first click: crosshair with "Draw Plate" label
      const p = real2px(blk, cu, cv);
      ctx.fillStyle = '#00aaff';
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
      ctx.font = `10px 'Segoe UI', sans-serif`;
      ctx.fillStyle = 'rgba(30,30,30,0.8)';
      const label = 'Draw Plate — click first corner';
      const lm = ctx.measureText(label);
      ctx.fillRect(p.x + 12, p.y - 18, lm.width + 8, 18);
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(label, p.x + 16, p.y - 9);
      ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
    }
  }
  // Bolt group placement preview
  else if (tool === 'place-bolt-group' && boltGroupConfig && blk) {
    const cfg = boltGroupConfig;
    const hg = (cfg.cols - 1) * cfg.gauge / 2;
    const hp = (cfg.rows - 1) * cfg.pitch / 2;
    const bData = BOLT_DB[cfg.boltSize] || BOLT_DB.M20;
    const boltR = (bData.d / 2) * viewport.zoom / drawingScale;
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = '#00aaff'; ctx.fillStyle = '#00aaff';
    ctx.lineWidth = 1; ctx.setLineDash([]);
    for (let r = 0; r < cfg.rows; r++) {
      for (let c = 0; c < cfg.cols; c++) {
        const bu = cu - hg + c * cfg.gauge;
        const bv = cv - hp + r * cfg.pitch;
        const bp = real2px(blk, bu, bv);
        ctx.beginPath(); ctx.arc(bp.x, bp.y, boltR, 0, Math.PI * 2); ctx.stroke(); ctx.fill();
      }
    }
    ctx.globalAlpha = 1.0;
    // Label
    ctx.fillStyle = 'rgba(30,30,30,0.8)';
    const label = `${cfg.rows}×${cfg.cols} ${cfg.boltSize} (${cfg.gauge}g × ${cfg.pitch}p)`;
    const p = real2px(blk, cu, cv);
    const lm = ctx.measureText(label);
    ctx.fillRect(p.x + 12, p.y - 18, lm.width + 8, 18);
    ctx.fillStyle = '#ffffff'; ctx.font = '10px system-ui';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(label, p.x + 16, p.y - 9);
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
  }
  ctx.setLineDash([]);
}

function createPlacingGhost(u, v) {
  if (!placing) return null;
  if (placing.type === 'ub') return { id:-1, type:'ub', section:placing.section, x:u, y:v, z:0, length:placing.length||600 };
  if (placing.type === 'shs') return { id:-1, type:'shs', section:placing.section, x:u, y:v, z:0, length:placing.length||500, rot:90 };
  if (placing.type === 'plate') return { id:-1, type:'plate', x:u, y:v, z:0, pw:placing.pw, ph:placing.ph, pt:placing.pt };
  if (placing.type === 'bolt') return { id:-1, type:'bolt', boltSize:placing.boltSize, x:u, y:v, z:0 };
  return null;
}

// ============================================================
