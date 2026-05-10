'use strict';

// Coordinate transforms (s2px, px2s, real2px, px2real, sheetLen) + colour utility
// Extracted from dev/index.html lines 3588-3683 (2026-05-02 modular split)

// COORDINATE TRANSFORMS
// ============================================================

// Sheet-mm → screen-px
function s2px(sx, sy) {
  return {
    x: sx * viewport.zoom + viewport.panX,
    y: sy * viewport.zoom + viewport.panY
  };
}

// Screen-px → sheet-mm
function px2s(px, py) {
  return {
    x: (px - viewport.panX) / viewport.zoom,
    y: (py - viewport.panY) / viewport.zoom
  };
}

// Real-world mm in a block → screen-px
function real2px(block, u, v) {
  // v is Y-up in real world, sheet is Y-down
  const sx = block.sheetX + u / drawingScale;
  const sy = block.sheetY - v / drawingScale;  // flip Y
  return s2px(sx, sy);
}

// Screen-px → real-world mm for a block
function px2real(block, px, py) {
  const sh = px2s(px, py);
  return {
    u: (sh.x - block.sheetX) * drawingScale,
    v: -(sh.y - block.sheetY) * drawingScale  // flip Y back
  };
}

// Sheet length in mm → screen pixels
function sheetLen(mm) { return mm * viewport.zoom; }

// ============================================================
// UTILITY
// ============================================================

// Cached canvas context for colour parsing — avoids creating a DOM element per call
const _colorCtx = document.createElement('canvas').getContext('2d');
const _colorCache = {};

function colorAlpha(cssColor, alpha) {
  // Fast path: cache parsed RGB per cssColor string
  const key = cssColor + '|' + alpha;
  if (_colorCache[key]) return _colorCache[key];

  _colorCtx.fillStyle = cssColor;
  const res = _colorCtx.fillStyle;
  let result;
  if (res.startsWith('#')) {
    const r = parseInt(res.slice(1,3),16), g = parseInt(res.slice(3,5),16), b = parseInt(res.slice(5,7),16);
    result = `rgba(${r},${g},${b},${alpha})`;
  } else {
    result = res.replace(/rgba?\(([^)]+)\)/, (_, inner) => {
      const parts = inner.split(',').map(s=>s.trim());
      return `rgba(${parts[0]},${parts[1]},${parts[2]},${alpha})`;
    });
  }
  _colorCache[key] = result;
  return result;
}

function constrainUV(u, v, ou, ov) {
  const du = u - ou, dv = v - ov;
  const ang = Math.atan2(dv, du);
  // V25 — in 2D mode the default snap is 45° (covers 0/45/90/135/etc.) so
  // the user gets clean orthogonal + 1:1 brace lines without holding any
  // modifier; orthoOn promotes to strict 90° steps. Shift bypass handled
  // by the caller (gating in getCursor).
  let step;
  if (sheetMode === '2d') {
    step = orthoOn ? Math.PI / 2 : Math.PI / 4;
  } else {
    step = (orthoOn && !shiftHeld) ? Math.PI / 2 : Math.PI / 4;
  }
  const snapped = Math.round(ang / step) * step;
  const len = Math.hypot(du, dv);
  return [ou + len * Math.cos(snapped), ov + len * Math.sin(snapped)];
}

function getEnt2DSnapPoints(ent) {
  if (ent.type === 'line' || ent.type === 'centreline' || ent.type === 'breakline')
    return [[ent.u1, ent.v1], [ent.u2, ent.v2], [(ent.u1+ent.u2)/2, (ent.v1+ent.v2)/2]];
  if (ent.type === 'rect') return [[ent.u, ent.v], [ent.u+ent.w, ent.v], [ent.u, ent.v+ent.h], [ent.u+ent.w, ent.v+ent.h], [ent.u+ent.w/2, ent.v+ent.h/2]];
  if (ent.type === 'circle') return [[ent.cu, ent.cv]];
  if (ent.type === 'weld') return [[ent.u, ent.v]];
  return [];
}

// ============================================================
