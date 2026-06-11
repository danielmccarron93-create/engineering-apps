'use strict';

// V25 — entity helpers + detail frame
// Extracted from dev/index.html lines 17212-17295 (2026-05-02 modular split)

// ---- SCALE PER FRAME ----
// In 2D mode each detail frame can carry its own scale (1:5/10/20/50).
// The render-time real-to-pixel pipeline still uses the global drawingScale,
// so when we render content inside a frame we temporarily swap drawingScale.
let _v25FrameScale = null;
function v25WithFrameScale(scale, fn) {
  const prev = drawingScale;
  drawingScale = scale || prev;
  try { fn(); } finally { drawingScale = prev; }
}

// ---- ENTITY HELPERS ----
// Free-rotation (ent.rot, degrees CCW in world coords) of a world point about a
// fixing's anchor (ent.u, ent.v). The to-scale fixings (bolt2 72c / screw 72i /
// stud 72j) draw their glyph axis-aligned then spin it rigidly about the anchor;
// hit-test / centreline / grips / DXF use this same transform to stay in sync.
function v25FixingRotPt(ent, u, v) {
  const deg = Number(ent && ent.rot) || 0;
  if (!deg) return { u, v };
  const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  const du = u - ent.u, dv = v - ent.v;
  return { u: ent.u + du * c - dv * s, v: ent.v + du * s + dv * c };
}
// Inverse — map a world point back into the fixing's unrotated local frame.
function v25FixingUnrotPt(ent, u, v) {
  const deg = Number(ent && ent.rot) || 0;
  if (!deg) return { u, v };
  const r = -deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  const du = u - ent.u, dv = v - ent.v;
  return { u: ent.u + du * c - dv * s, v: ent.v + du * s + dv * c };
}

function v25Add(type, props) {
  const vk = (activeBlock && activeBlock.viewKey) || 'elevation';
  const ent = mkEnt2D(vk, type, { _v25: true, ...props });
  // Auto-depth: a newly drawn member defaults to sitting IN FRONT of any
  // existing member it overlaps, so the older (first-drawn) member's covered
  // span auto-dashes as a hidden line. Run BEFORE addEnt2D so the chosen z is
  // captured by the undo snapshot. Right-click "Send to Back" still overrides.
  // (v25DepthAutoBackOnPlace — 72h-v25-depth-order.js)
  if (type === 'mem2' && typeof v25DepthAutoBackOnPlace === 'function') {
    v25DepthAutoBackOnPlace(ent, vk);
  }
  addEnt2D(ent);
  requestRender();
  return ent;
}

// ---- DETAIL FRAME ----
// { type:'frame', u, v, w, h, title, scale, ref, showBorder }
function drawFrame2D(blk, ent, cs) {
  const col = cs.getPropertyValue('--entity-color').trim();
  const muteCol = cs.getPropertyValue('--mute').trim();
  const pm = ppm();

  if (ent.showBorder !== false) {
    ctx.strokeStyle = colorAlpha(col, 0.55);
    ctx.lineWidth = Math.max(0.4, LW.MW * pm);
    ctx.setLineDash([]);
    rRect(blk, ent.u, ent.v, ent.w, ent.h);
  }

  // Title block under the frame: TITLE / SCALE 1:N / [REF]
  const titleH = 24; // mm of title strip below the frame
  const tlScreen = real2px(blk, ent.u, ent.v); // bottom-left in screen px
  const titleY = ent.v - 2; // 2mm gap below frame
  const titleP = real2px(blk, ent.u + ent.w / 2, titleY);
  ctx.fillStyle = col; ctx.textBaseline = 'top'; ctx.textAlign = 'center';
  const titleSize = Math.max(11, 5 * pm);
  ctx.font = `bold ${titleSize}px system-ui`;
  ctx.fillText((ent.title || 'DETAIL').toUpperCase(), titleP.x, titleP.y);
  const subSize = Math.max(8, 3 * pm);
  ctx.font = `${subSize}px system-ui`;
  ctx.fillStyle = muteCol;
  ctx.fillText(`SCALE 1 : ${ent.scale || 10}`, titleP.x, titleP.y + titleSize + 2);

  if (ent.ref) {
    // Reference number in a small box bottom-left (e.g. "6092.2")
    const refX = ent.u + 8;
    const refY = titleY - 14;
    const refP = real2px(blk, refX, refY);
    const refW = Math.max(40, ctx.measureText(ent.ref).width + 16);
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.4, LW.MW * pm);
    ctx.strokeRect(refP.x - 4, refP.y - 2, refW, subSize + 8);
    ctx.fillStyle = col; ctx.textAlign = 'left';
    ctx.font = `${subSize + 1}px system-ui`;
    ctx.fillText(ent.ref, refP.x, refP.y + 2);
  }
  ctx.textAlign = 'start';
}

// Hit-test for selecting / dragging frames. Returns 'body' | 'nw'..'se' | null.
function v25FrameHandleAt(ent, blk, px, py) {
  const tl = real2px(blk, ent.u, ent.v + ent.h);
  const br = real2px(blk, ent.u + ent.w, ent.v);
  const tol = 6;
  const onL = Math.abs(px - tl.x) < tol;
  const onR = Math.abs(px - br.x) < tol;
  const onT = Math.abs(py - tl.y) < tol;
  const onB = Math.abs(py - br.y) < tol;
  if (onT && onL) return 'nw';
  if (onT && onR) return 'ne';
  if (onB && onL) return 'sw';
  if (onB && onR) return 'se';
  if (onT) return 'n';
  if (onB) return 's';
  if (onL) return 'w';
  if (onR) return 'e';
  if (px > tl.x && px < br.x && py > tl.y && py < br.y) return 'body';
  return null;
}

