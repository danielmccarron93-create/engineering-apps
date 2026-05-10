'use strict';

// Drawing primitives for detail blocks + V17 sketch wobble
// Extracted from dev/index.html lines 7930-8020 (2026-05-02 modular split)

// DRAWING PRIMITIVES for detail blocks
// ============================================================
// All drawing uses real-world coords, transformed through the block

// V17 sketch wobble — deterministic "hand drawn" jitter. A seed derived from
// endpoint coordinates guarantees the same line always wobbles the same way,
// so pan/zoom doesn't make the drawing "dance". Amplitude is capped at 0.4mm
// sheet-space so technical legibility is preserved.
function _sketchHash(x) {
  // Mulberry32-style hash → deterministic 0..1 pseudo-random
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
}
function _sketchRand(seed, i) {
  return _sketchHash(seed * 1315423911 + i * 2654435761) - 0.5;
}
// Draw an already-transformed screen-space line with wobble if sketch mode
// is on. `pdfExportMode` skips wobble (crisp vector PDF always takes priority).
function _lineW(x1, y1, x2, y2) {
  if (!sketchOn || pdfExportMode) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    return;
  }
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 2) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    return;
  }
  const segLen = 8; // subdivide every ~8 screen-px for smooth wobble
  const n = Math.max(3, Math.min(60, Math.ceil(len / segLen)));
  const amp = Math.min(1.6, 0.4 * ppm()); // cap at 0.4mm sheet amplitude
  const seed = Math.round(x1 * 7 + y1 * 13 + x2 * 17 + y2 * 19);
  const ux = dx / len, uy = dy / len;
  const px = -uy, py = ux;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const jitter = _sketchRand(seed, i) * amp;
    // Fade out jitter near the endpoints so joints still look crisp
    const fade = Math.min(1, Math.min(t, 1 - t) * 4);
    const j = jitter * fade;
    ctx.lineTo(x1 + dx * t + px * j, y1 + dy * t + py * j);
  }
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function rLine(blk, u1, v1, u2, v2) {
  const p1 = real2px(blk, u1, v1);
  const p2 = real2px(blk, u2, v2);
  _lineW(p1.x, p1.y, p2.x, p2.y);
}

function rRect(blk, u, v, w, h) {
  const p = real2px(blk, u, v + h); // top-left in screen (v+h because Y is up)
  const sw = w / drawingScale * viewport.zoom;
  const sh = h / drawingScale * viewport.zoom;
  if (!sketchOn || pdfExportMode) {
    ctx.strokeRect(p.x, p.y, sw, sh);
    return;
  }
  // Wobbled rect: four wobble-lines instead of strokeRect
  _lineW(p.x, p.y, p.x + sw, p.y);
  _lineW(p.x + sw, p.y, p.x + sw, p.y + sh);
  _lineW(p.x + sw, p.y + sh, p.x, p.y + sh);
  _lineW(p.x, p.y + sh, p.x, p.y);
}

function rFillRect(blk, u, v, w, h) {
  const p = real2px(blk, u, v + h);
  const sw = w / drawingScale * viewport.zoom;
  const sh = h / drawingScale * viewport.zoom;
  ctx.fillRect(p.x, p.y, sw, sh);
}

// Stroke a circle at real-world (cu, cv) with real-world diameter d
function rCircle(blk, cu, cv, d) {
  const p = real2px(blk, cu, cv);
  const r = (d / 2) / drawingScale * viewport.zoom;
  ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
}
function rFillCircle(blk, cu, cv, d) {
  const p = real2px(blk, cu, cv);
  const r = (d / 2) / drawingScale * viewport.zoom;
  ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
}

// ============================================================
