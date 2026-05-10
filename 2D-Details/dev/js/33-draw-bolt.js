'use strict';

// Draw bolt + AS 1100 realistic primitives (V14)
// Extracted from dev/index.html lines 9074-9523 (2026-05-02 modular split)

// DRAW BOLT
// ============================================================

// ============================================================
// AS 1100 REALISTIC BOLT PRIMITIVES (V14)
// ============================================================
// Chamfered hex side profiles + sawtooth thread indication per drafter
// §7.3–7.5. All helpers operate in view-local real-world coords (u, v).
// Convention: larger v renders higher on screen (Y-flip handled in real2px).

// Stroke a closed polygon defined by an array of [u, v] real-world points.
function rPolygon(blk, pts) {
  if (!pts || pts.length < 3) return;
  ctx.beginPath();
  const p0 = real2px(blk, pts[0][0], pts[0][1]);
  ctx.moveTo(p0.x, p0.y);
  for (let i = 1; i < pts.length; i++) {
    const p = real2px(blk, pts[i][0], pts[i][1]);
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.stroke();
}

// Fill a closed polygon (no stroke).
function rFillPolygon(blk, pts) {
  if (!pts || pts.length < 3) return;
  ctx.beginPath();
  const p0 = real2px(blk, pts[0][0], pts[0][1]);
  ctx.moveTo(p0.x, p0.y);
  for (let i = 1; i < pts.length; i++) {
    const p = real2px(blk, pts[i][0], pts[i][1]);
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.fill();
}

// Chamfered hex side profile — bolt axis along u (horizontal on screen).
//   cv     = v coord of bolt centreline
//   outerU = u of the chamfered (outer, head-crown or nut-crown) face
//   innerU = u of the flat (inner, washer-side) face
//   halfAF = half across-flats (= headAF/2 or nutAF/2)
// Returns a 6-point closed polygon as [[u,v], ...].
// The 'outer' edge carries 30° chamfers at both corners; the 'inner' edge is flat.
function hexPointsAlongU(cv, outerU, innerU, halfAF) {
  const span = outerU - innerU;               // signed — outerU may be < or > innerU
  const dir  = Math.sign(span) || 1;
  const abs  = Math.abs(span);
  const ch   = Math.min(abs * 0.25, halfAF * 0.3);
  const chS  = ch * dir;
  return [
    [innerU,       cv - halfAF],
    [outerU - chS, cv - halfAF],
    [outerU,       cv - halfAF + ch],
    [outerU,       cv + halfAF - ch],
    [outerU - chS, cv + halfAF],
    [innerU,       cv + halfAF],
  ];
}

// Chamfered hex side profile — bolt axis along v (vertical on screen).
//   cu     = u coord of bolt centreline
//   outerV = v of the chamfered (outer) face
//   innerV = v of the flat (inner, washer-side) face
//   halfAF = half across-flats
function hexPointsAlongV(cu, outerV, innerV, halfAF) {
  const span = outerV - innerV;
  const dir  = Math.sign(span) || 1;
  const abs  = Math.abs(span);
  const ch   = Math.min(abs * 0.25, halfAF * 0.3);
  const chS  = ch * dir;
  return [
    [cu - halfAF,       innerV],
    [cu - halfAF,       outerV - chS],
    [cu - halfAF + ch,  outerV],
    [cu + halfAF - ch,  outerV],
    [cu + halfAF,       outerV - chS],
    [cu + halfAF,       innerV],
  ];
}

// Sawtooth thread indication — bolt axis along u, zone from startU to endU.
// Real M20 pitch (2.5 mm) at 1:10 scale = 0.25 mm on sheet, which is illegible.
// Drafter §11.16: exaggerate pitch so the thread stays visible at any drawing
// scale. Formula below gives ~0.9 mm sheet pitch regardless of drawingScale.
//   cv      = v coord of bolt centreline
//   halfD   = shank major radius (= b.d / 2) in real-world mm
//   halfMin = thread minor (root) radius (= b.minorD / 2)
//   realP   = real thread pitch (b.pitch)
function drawThreadAlongU(blk, cv, startU, endU, halfD, halfMin, realP) {
  const absLen = Math.abs(endU - startU);
  if (absLen < 0.1) return;
  const dir = Math.sign(endU - startU) || 1;
  const pitchReal = Math.max(0.9 * drawingScale, realP * 1.8);
  const pm = ppm();
  // Thin minor-diameter lines along the thread zone (AS 1100 root-diameter lines)
  const savedLW = ctx.lineWidth;
  ctx.lineWidth = Math.max(0.15, LW.HATCH * pm);
  rLine(blk, startU, cv + halfMin, endU, cv + halfMin);
  rLine(blk, startU, cv - halfMin, endU, cv - halfMin);
  ctx.lineWidth = savedLW;
  // Sawtooth zigzag on the two shank edges: one full pitch = halfD → halfMin → halfD.
  let u = startU;
  let safetyMax = Math.ceil(absLen / Math.max(0.1, pitchReal)) + 4;
  while (Math.abs(endU - u) > pitchReal * 0.25 && safetyMax-- > 0) {
    const u2 = u + pitchReal * 0.5 * dir;
    const u3 = u + pitchReal * dir;
    // Clamp at the end of the zone so the last tooth stops cleanly.
    const u2c = (Math.abs(u2 - startU) > absLen) ? endU : u2;
    const u3c = (Math.abs(u3 - startU) > absLen) ? endU : u3;
    rLine(blk, u,   cv + halfD,   u2c, cv + halfMin);
    rLine(blk, u2c, cv + halfMin, u3c, cv + halfD);
    rLine(blk, u,   cv - halfD,   u2c, cv - halfMin);
    rLine(blk, u2c, cv - halfMin, u3c, cv - halfD);
    u = u3;
  }
}

// Sawtooth thread indication — bolt axis along v (vertical on screen).
function drawThreadAlongV(blk, cu, startV, endV, halfD, halfMin, realP) {
  const absLen = Math.abs(endV - startV);
  if (absLen < 0.1) return;
  const dir = Math.sign(endV - startV) || 1;
  const pitchReal = Math.max(0.9 * drawingScale, realP * 1.8);
  const pm = ppm();
  const savedLW = ctx.lineWidth;
  ctx.lineWidth = Math.max(0.15, LW.HATCH * pm);
  rLine(blk, cu + halfMin, startV, cu + halfMin, endV);
  rLine(blk, cu - halfMin, startV, cu - halfMin, endV);
  ctx.lineWidth = savedLW;
  let v = startV;
  let safetyMax = Math.ceil(absLen / Math.max(0.1, pitchReal)) + 4;
  while (Math.abs(endV - v) > pitchReal * 0.25 && safetyMax-- > 0) {
    const v2 = v + pitchReal * 0.5 * dir;
    const v3 = v + pitchReal * dir;
    const v2c = (Math.abs(v2 - startV) > absLen) ? endV : v2;
    const v3c = (Math.abs(v3 - startV) > absLen) ? endV : v3;
    rLine(blk, cu + halfD,   v,   cu + halfMin, v2c);
    rLine(blk, cu + halfMin, v2c, cu + halfD,   v3c);
    rLine(blk, cu - halfD,   v,   cu - halfMin, v2c);
    rLine(blk, cu - halfMin, v2c, cu - halfD,   v3c);
    v = v3;
  }
}

// ---- V14 sectionA renderer (bolt axis along u = z) ----
// Replaces the schematic rectangle stack with a chamfered hex head + sawtooth
// thread + chamfered hex nut. Called from drawBolt() when V14_NEW_BOLTS is on.
// _drawBoltSectionA_V14: grip-aware renderer.
// Washers sit directly against the material faces; head and nut stick out beyond.
// gi = { grip, zCentre, boltLen, threadProt } from computeBoltGripInfo().
function _drawBoltSectionA_V14(blk, obj, b, gi, col, clCol, boltVisLW, boltCutLW, boltAlpha, pm) {
  const cy = obj.y;
  const hG = gi.grip / 2;

  // ---- Grip-centred layout along u = z ----
  const zGripL      = gi.zCentre - hG;                      // material head-side face
  const zGripR      = gi.zCentre + hG;                      // material nut-side face
  const zWashHeadL  = zGripL - b.washT;                     // head washer outer face
  const zHeadOuter  = zWashHeadL - b.headH;                 // chamfered head outer face
  const zWashNutR   = zGripR + b.washT;                     // nut washer outer face
  const zNutOuter   = zWashNutR + b.nutH;                   // chamfered nut outer face
  const threadProt  = gi.threadProt;                         // thread stick-out past nut
  const zThreadTip  = zNutOuter + threadProt;

  // Shank spans from under head washer to thread tip
  const shankL = zWashHeadL;
  const shankR = zThreadTip;
  const shankLen = shankR - shankL;

  const halfD   = b.d / 2;
  const halfMin = b.minorD / 2;
  const halfAFh = b.headAF / 2;
  const halfAFn = b.nutAF / 2;
  const halfWO  = b.washOD / 2;

  ctx.setLineDash([]);

  // 1. Shank rectangle (full visible bolt barrel from head-under to thread tip)
  ctx.strokeStyle = col; ctx.lineWidth = boltVisLW;
  ctx.fillStyle = colorAlpha(col, boltAlpha * 0.4);
  rFillRect(blk, shankL, cy - halfD, shankLen, halfD * 2);
  rRect(blk, shankL, cy - halfD, shankLen, halfD * 2);

  // 2. Sawtooth thread indication (threaded zone measured back from thread tip)
  const threadZone = Math.min(b.threadL, shankLen);
  if (threadZone > 0.1) {
    ctx.strokeStyle = colorAlpha(col, 0.85);
    ctx.lineWidth = Math.max(0.3, LW.VIS * pm * 0.7);
    drawThreadAlongU(blk, cy, shankR - threadZone, shankR, halfD, halfMin, b.pitch);
  }

  // 3. Washers — touching the grip faces
  ctx.strokeStyle = col; ctx.lineWidth = boltCutLW;
  ctx.fillStyle = colorAlpha(col, boltAlpha);
  rFillRect(blk, zWashHeadL, cy - halfWO, b.washT, halfWO * 2);
  rRect(blk, zWashHeadL, cy - halfWO, b.washT, halfWO * 2);
  rFillRect(blk, zGripR, cy - halfWO, b.washT, halfWO * 2);
  rRect(blk, zGripR, cy - halfWO, b.washT, halfWO * 2);

  // 4. Chamfered hex head
  const headPts = hexPointsAlongU(cy, zHeadOuter, zWashHeadL, halfAFh);
  ctx.fillStyle = colorAlpha(col, boltAlpha);
  rFillPolygon(blk, headPts);
  rPolygon(blk, headPts);

  // 5. Chamfered hex nut
  const nutPts = hexPointsAlongU(cy, zNutOuter, zWashNutR, halfAFn);
  ctx.fillStyle = colorAlpha(col, boltAlpha);
  rFillPolygon(blk, nutPts);
  rPolygon(blk, nutPts);

  // 6. Bolt centreline
  ctx.strokeStyle = clCol; ctx.lineWidth = 0.5;
  ctx.setLineDash(DASH.CL_BOLT);
  rLine(blk, zHeadOuter - 4, cy, zThreadTip + 4, cy);
  ctx.setLineDash([]);
}

// _drawBoltPlanB_V14: grip-aware, bolt axis along v = z.
function _drawBoltPlanB_V14(blk, obj, b, gi, col, clCol, boltVisLW, boltCutLW, boltAlpha, pm) {
  const cx = obj.x;
  const hG = gi.grip / 2;

  // ---- Grip-centred layout along v = z ----
  const zGripL      = gi.zCentre - hG;
  const zGripR      = gi.zCentre + hG;
  const zWashHeadL  = zGripL - b.washT;
  const zHeadOuter  = zWashHeadL - b.headH;
  const zWashNutR   = zGripR + b.washT;
  const zNutOuter   = zWashNutR + b.nutH;
  const threadProt  = gi.threadProt;
  const zThreadTip  = zNutOuter + threadProt;

  const shankL = zWashHeadL;
  const shankR = zThreadTip;
  const shankLen = shankR - shankL;

  const halfD   = b.d / 2;
  const halfMin = b.minorD / 2;
  const halfAFh = b.headAF / 2;
  const halfAFn = b.nutAF / 2;
  const halfWO  = b.washOD / 2;

  ctx.setLineDash([]);

  // 1. Shank rectangle
  ctx.strokeStyle = col; ctx.lineWidth = boltVisLW;
  ctx.fillStyle = colorAlpha(col, boltAlpha * 0.4);
  rFillRect(blk, cx - halfD, shankL, halfD * 2, shankLen);
  rRect(blk, cx - halfD, shankL, halfD * 2, shankLen);

  // 2. Sawtooth thread
  const threadZone = Math.min(b.threadL, shankLen);
  if (threadZone > 0.1) {
    ctx.strokeStyle = colorAlpha(col, 0.85);
    ctx.lineWidth = Math.max(0.3, LW.VIS * pm * 0.7);
    drawThreadAlongV(blk, cx, shankR - threadZone, shankR, halfD, halfMin, b.pitch);
  }

  // 3. Washers
  ctx.strokeStyle = col; ctx.lineWidth = boltCutLW;
  ctx.fillStyle = colorAlpha(col, boltAlpha);
  rFillRect(blk, cx - halfWO, zWashHeadL, halfWO * 2, b.washT);
  rRect(blk, cx - halfWO, zWashHeadL, halfWO * 2, b.washT);
  rFillRect(blk, cx - halfWO, zGripR, halfWO * 2, b.washT);
  rRect(blk, cx - halfWO, zGripR, halfWO * 2, b.washT);

  // 4. Chamfered hex head
  const headPts = hexPointsAlongV(cx, zHeadOuter, zWashHeadL, halfAFh);
  ctx.fillStyle = colorAlpha(col, boltAlpha);
  rFillPolygon(blk, headPts);
  rPolygon(blk, headPts);

  // 5. Chamfered hex nut
  const nutPts = hexPointsAlongV(cx, zNutOuter, zWashNutR, halfAFn);
  ctx.fillStyle = colorAlpha(col, boltAlpha);
  rFillPolygon(blk, nutPts);
  rPolygon(blk, nutPts);

  // 6. Bolt centreline
  ctx.strokeStyle = clCol; ctx.lineWidth = 0.5;
  ctx.setLineDash(DASH.CL_BOLT);
  rLine(blk, cx, zHeadOuter - 4, cx, zThreadTip + 4);
  ctx.setLineDash([]);
}

// ============================================================
// DRAW BOLT
// ============================================================

function drawBolt(blk, obj, col, hidCol, clCol, cs, occRects, cutClass) {
  occRects = occRects || [];
  const b = BOLT_DB[obj.boltSize] || BOLT_DB.M20;
  const pm = ppm();
  const isCut = cutClass === 'cut';
  const boltVisLW = isCut ? Math.max(0.5, LW.VIS * pm) : Math.max(0.3, LW.HID * pm);
  const boltCutLW = isCut ? Math.max(1, LW.CUT * pm) : Math.max(0.5, LW.VIS * pm);
  const boltAlpha = isCut ? 0.25 : 0.10;

  // Compute grip info: grip thickness, zCentre (auto-aligned), nominal bolt length
  const gi = computeBoltGripInfo(obj);
  const grip = gi.grip;
  const boltLen = obj.boltLength || gi.boltLen;

  if (blk.viewKey === 'elevation') {
    // End-on view: bolt circle + crosshair + washer ring
    const p = real2px(blk, obj.x, obj.y);
    const r = (b.d / 2) * viewport.zoom / drawingScale;
    const wr = (b.washOD / 2) * viewport.zoom / drawingScale;
    const hr = (b.headAF / 2) * viewport.zoom / drawingScale;
    ctx.setLineDash([]);
    // Washer outline (dashed lighter)
    ctx.strokeStyle = colorAlpha(col, 0.4); ctx.lineWidth = Math.max(0.3, LW.HID * pm);
    ctx.beginPath(); ctx.arc(p.x, p.y, wr, 0, Math.PI*2); ctx.stroke();
    // Bolt hole
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.5, LW.VIS * pm);
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI*2); ctx.stroke();
    ctx.fillStyle = colorAlpha(col, 0.20); ctx.fill();
    // Head crosshair
    ctx.beginPath();
    ctx.moveTo(p.x-hr, p.y); ctx.lineTo(p.x+hr, p.y);
    ctx.moveTo(p.x, p.y-hr); ctx.lineTo(p.x, p.y+hr);
    ctx.stroke();
  }
  else if (blk.viewKey === 'sectionA') {
    if (V14_NEW_BOLTS) { _drawBoltSectionA_V14(blk, obj, b, gi, col, clCol, boltVisLW, boltCutLW, boltAlpha, pm); return; }
    // Section A: bolt axis along Z (horizontal), side profile showing head→washer→shank→washer→nut
    const cz = obj.z, cy = obj.y;
    const halfShank = boltLen / 2;
    // Shank origin: head side at cz - halfShank, nut side at cz + halfShank
    // Layout from left to right: head | washer | shank ---- | washer | nut | thread protrusion
    const zHead   = cz - halfShank - b.washT - b.headH; // left edge of head
    const zWashH  = cz - halfShank - b.washT;            // head-side washer left edge
    const zShankL = cz - halfShank;                       // shank left edge
    const zShankR = cz + halfShank;                       // shank right edge
    const zWashN  = zShankR;                              // nut-side washer left edge
    const zNut    = zShankR + b.washT;                    // nut left edge
    const zEnd    = zNut + b.nutH;                        // nut right edge
    const threadProt = 2 * b.p;                           // thread protrusion beyond nut

    ctx.setLineDash([]);

    // Shank
    ctx.strokeStyle = col; ctx.lineWidth = boltVisLW;
    rRect(blk, zShankL, cy - b.d/2, boltLen, b.d);
    ctx.fillStyle = colorAlpha(col, boltAlpha * 0.4);
    rFillRect(blk, zShankL, cy - b.d/2, boltLen, b.d);

    // Thread indication — short dashes at nut end of shank
    const threadLen = Math.min(boltLen * 0.3, 30);
    ctx.strokeStyle = colorAlpha(col, 0.5); ctx.lineWidth = Math.max(0.3, LW.HID * pm);
    ctx.setLineDash(DASH.THREAD);
    rLine(blk, zShankR - threadLen, cy - b.d/2 + 1, zShankR - threadLen, cy + b.d/2 - 1);
    ctx.setLineDash([]);

    // Head-side washer (thin rectangle)
    ctx.strokeStyle = col; ctx.lineWidth = boltCutLW;
    rRect(blk, zWashH, cy - b.washOD/2, b.washT, b.washOD);
    ctx.fillStyle = colorAlpha(col, boltAlpha);
    rFillRect(blk, zWashH, cy - b.washOD/2, b.washT, b.washOD);

    // Bolt head
    rRect(blk, zHead, cy - b.headAF/2, b.headH, b.headAF);
    ctx.fillStyle = colorAlpha(col, boltAlpha);
    rFillRect(blk, zHead, cy - b.headAF/2, b.headH, b.headAF);

    // Nut-side washer
    rRect(blk, zWashN, cy - b.washOD/2, b.washT, b.washOD);
    ctx.fillStyle = colorAlpha(col, boltAlpha);
    rFillRect(blk, zWashN, cy - b.washOD/2, b.washT, b.washOD);

    // Nut
    rRect(blk, zNut, cy - b.nutAF/2, b.nutH, b.nutAF);
    ctx.fillStyle = colorAlpha(col, boltAlpha);
    rFillRect(blk, zNut, cy - b.nutAF/2, b.nutH, b.nutAF);

    // Thread protrusion beyond nut
    ctx.strokeStyle = col; ctx.lineWidth = boltVisLW;
    rRect(blk, zEnd, cy - b.d/2, threadProt, b.d);

    // Centreline along bolt axis
    ctx.strokeStyle = clCol; ctx.lineWidth = 0.5;
    ctx.setLineDash(DASH.CL_BOLT);
    rLine(blk, zHead - 4, cy, zEnd + threadProt + 4, cy);
    ctx.setLineDash([]);
  }
  else { // planB — looking down along Y, bolt axis is Z (vertical in this view)
    if (V14_NEW_BOLTS) { _drawBoltPlanB_V14(blk, obj, b, gi, col, clCol, boltVisLW, boltCutLW, boltAlpha, pm); return; }
    const cx = obj.x, cz = obj.z;
    const halfShank = boltLen / 2;
    const zHead   = cz - halfShank - b.washT - b.headH;
    const zWashH  = cz - halfShank - b.washT;
    const zShankL = cz - halfShank;
    const zShankR = cz + halfShank;
    const zWashN  = zShankR;
    const zNut    = zShankR + b.washT;
    const zEnd    = zNut + b.nutH;
    const threadProt = 2 * b.p;

    ctx.setLineDash([]);

    // Shank
    ctx.strokeStyle = col; ctx.lineWidth = boltVisLW;
    rRect(blk, cx - b.d/2, zShankL, b.d, boltLen);
    ctx.fillStyle = colorAlpha(col, boltAlpha * 0.4);
    rFillRect(blk, cx - b.d/2, zShankL, b.d, boltLen);

    // Thread indication
    const threadLen = Math.min(boltLen * 0.3, 30);
    ctx.strokeStyle = colorAlpha(col, 0.5); ctx.lineWidth = Math.max(0.3, LW.HID * pm);
    ctx.setLineDash(DASH.THREAD);
    rLine(blk, cx - b.d/2 + 1, zShankR - threadLen, cx + b.d/2 - 1, zShankR - threadLen);
    ctx.setLineDash([]);

    // Head-side washer
    ctx.strokeStyle = col; ctx.lineWidth = boltCutLW;
    rRect(blk, cx - b.washOD/2, zWashH, b.washOD, b.washT);
    ctx.fillStyle = colorAlpha(col, boltAlpha);
    rFillRect(blk, cx - b.washOD/2, zWashH, b.washOD, b.washT);

    // Head
    rRect(blk, cx - b.headAF/2, zHead, b.headAF, b.headH);
    ctx.fillStyle = colorAlpha(col, boltAlpha);
    rFillRect(blk, cx - b.headAF/2, zHead, b.headAF, b.headH);

    // Nut-side washer
    rRect(blk, cx - b.washOD/2, zWashN, b.washOD, b.washT);
    ctx.fillStyle = colorAlpha(col, boltAlpha);
    rFillRect(blk, cx - b.washOD/2, zWashN, b.washOD, b.washT);

    // Nut
    rRect(blk, cx - b.nutAF/2, zNut, b.nutAF, b.nutH);
    ctx.fillStyle = colorAlpha(col, boltAlpha);
    rFillRect(blk, cx - b.nutAF/2, zNut, b.nutAF, b.nutH);

    // Thread protrusion
    ctx.strokeStyle = col; ctx.lineWidth = boltVisLW;
    rRect(blk, cx - b.d/2, zEnd, b.d, threadProt);

    // Centreline along bolt axis
    ctx.strokeStyle = clCol; ctx.lineWidth = 0.5;
    ctx.setLineDash(DASH.CL_BOLT);
    rLine(blk, cx, zHead - 4, cx, zEnd + threadProt + 4);
    ctx.setLineDash([]);
  }
}

// ============================================================
