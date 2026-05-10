'use strict';

// AS 1101.3 weld symbol renderer
// Extracted from dev/index.html lines 10500-10680 (2026-05-02 modular split)

// AS 1101.3 weld symbol renderer.
// Data model (on the 2D entity):
//   u, v          — joint point (arrow tip, real-world mm in view)
//   angle         — arrow direction (radians)
//   weldType      — 'fillet' | 'square' | 'single-v' | 'double-v' |
//                   'partial-pen' | 'bevel'
//   size          — arrow-side weld size (mm)
//   otherSize     — other-side weld size (mm, optional — presence triggers
//                   both-sides symbol with a mirrored glyph above the line)
//   otherType     — other-side weld type (optional; defaults to same as arrow)
//   allAround     — bool; draws a full circle at the elbow
//   siteWeld      — bool; draws a filled flag/pennant at the elbow
//   tail          — string; if set, draws a forked-tail on the far end of
//                   the reference line with this text inside (reference to
//                   a procedure, spec, or note, e.g. "AS 1554.1 SP")
//   length        — string; appended after size on arrow-side (e.g. "6-100"
//                   for a 6mm intermittent weld in 100mm pitch)
function drawWeld2D(blk, ent, cs) {
  const col = cs.getPropertyValue('--entity-color').trim();
  const pm = ppm();
  const jp = real2px(blk, ent.u, ent.v);
  const angle = ent.angle || 0;
  const refLen = Math.max(20, 8 * pm);
  const symSize = Math.max(6, 3 * pm);

  const symLW = Math.max(0.5, LW.DIM * pm);    // reference/arrow line — DIM weight
  const glyphLW = Math.max(0.5, LW.MW * pm);   // weld symbol glyph — medium weight

  ctx.strokeStyle = col; ctx.fillStyle = col;
  ctx.lineWidth = symLW; ctx.setLineDash(DASH.SOLID);
  ctx.lineCap = 'butt';

  // ---- Arrow from joint point toward elbow ----
  const elbowX = jp.x + Math.cos(angle) * refLen * 0.5;
  const elbowY = jp.y + Math.sin(angle) * refLen * 0.5;
  ctx.beginPath(); ctx.moveTo(jp.x, jp.y); ctx.lineTo(elbowX, elbowY); ctx.stroke();
  // Solid arrowhead at joint point
  const aLen = 6, aWid = 2.5;
  const au = Math.cos(angle), av = Math.sin(angle);
  ctx.beginPath();
  ctx.moveTo(jp.x, jp.y);
  ctx.lineTo(jp.x + au*aLen + av*aWid, jp.y + av*aLen - au*aWid);
  ctx.lineTo(jp.x + au*aLen - av*aWid, jp.y + av*aLen + au*aWid);
  ctx.closePath(); ctx.fill();

  // ---- Horizontal reference line from elbow ----
  const refEndX = elbowX + refLen;
  ctx.beginPath(); ctx.moveTo(elbowX, elbowY); ctx.lineTo(refEndX, elbowY); ctx.stroke();

  // ---- Weld symbol glyph(s) ----
  const symX = (elbowX + refEndX) / 2;
  const arrowType = ent.weldType || 'fillet';
  const otherType = ent.otherType || arrowType;
  const hasOther = ent.otherSize !== undefined && ent.otherSize !== null && ent.otherSize !== '';

  ctx.lineWidth = glyphLW;
  // Arrow side (below the reference line — side nearest the joint)
  drawWeldGlyph(symX, elbowY, symSize, arrowType, col, /*above=*/false);
  if (hasOther) {
    // Other side (above the line — mirrored)
    drawWeldGlyph(symX, elbowY, symSize, otherType, col, /*above=*/true);
  }
  ctx.lineWidth = symLW;

  // ---- Size labels ----
  ctx.fillStyle = col;
  ctx.font = `${Math.max(7, 2.5 * pm)}px system-ui`;
  ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
  const sizeText = (ent.length ? String(ent.length) : String(ent.size ?? 6));
  // Arrow side — left of the glyph, vertical-centred to the glyph body below
  ctx.fillText(sizeText, symX - symSize * 0.8, elbowY + symSize * 0.5);
  if (hasOther) {
    const otherText = String(ent.otherSize ?? ent.size ?? 6);
    ctx.fillText(otherText, symX - symSize * 0.8, elbowY - symSize * 0.5);
  }

  // ---- Tail reference (forked tail + spec text) ----
  if (ent.tail) {
    const tailLen = Math.max(10, 5 * pm);
    const forkHalf = Math.max(3, 1.8 * pm);
    ctx.lineWidth = symLW;
    ctx.beginPath();
    ctx.moveTo(refEndX, elbowY);
    ctx.lineTo(refEndX + tailLen, elbowY - forkHalf);
    ctx.moveTo(refEndX, elbowY);
    ctx.lineTo(refEndX + tailLen, elbowY + forkHalf);
    ctx.stroke();
    ctx.font = `${Math.max(7, 2.2 * pm)}px system-ui`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(ent.tail, refEndX + tailLen + 3, elbowY);
  }

  // ---- All-round circle at elbow ----
  if (ent.allAround) {
    ctx.lineWidth = glyphLW;
    ctx.beginPath();
    ctx.arc(elbowX, elbowY, Math.max(3.5, 1.8 * pm), 0, Math.PI * 2);
    ctx.stroke();
  }

  // ---- Site/field weld flag at elbow (AS 1101.3 filled pennant) ----
  if (ent.siteWeld) {
    const flagH = Math.max(7, 3.5 * pm);
    const flagW = Math.max(4, 2.2 * pm);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(elbowX, elbowY);
    ctx.lineTo(elbowX, elbowY - flagH);
    ctx.lineTo(elbowX + flagW, elbowY - flagH * 0.65);
    ctx.closePath();
    ctx.fill();
  }

  ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
}

// Draw an individual weld-type glyph at (cx, cy) with nominal size `size`.
// `above` = true flips the glyph vertically (for the other-side face of a
// both-sides weld). `col` is the ink colour. Assumes stroke/fill style and
// lineWidth are already set by the caller.
function drawWeldGlyph(cx, cy, size, type, col, above) {
  const dir = above ? -1 : 1; // flip Y for other-side glyphs
  const half = size / 2;
  const bottom = cy + size * dir;

  if (type === 'fillet') {
    // Filled right-triangle sitting on the reference line; hypotenuse away.
    ctx.beginPath();
    ctx.moveTo(cx - half, cy);
    ctx.lineTo(cx + half, cy);
    ctx.lineTo(cx - half, bottom);
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = colorAlpha(col, 0.3);
    ctx.fill();
    ctx.fillStyle = col;
  } else if (type === 'square') {
    // Two parallel vertical strokes (square-butt preparation — no bevel).
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.25, cy);
    ctx.lineTo(cx - size * 0.25, bottom);
    ctx.moveTo(cx + size * 0.25, cy);
    ctx.lineTo(cx + size * 0.25, bottom);
    ctx.stroke();
  } else if (type === 'single-v') {
    // V shape (full-penetration butt) — apex at bottom.
    ctx.beginPath();
    ctx.moveTo(cx - half, cy);
    ctx.lineTo(cx, bottom);
    ctx.lineTo(cx + half, cy);
    ctx.stroke();
  } else if (type === 'double-v') {
    // X shape (V above + V below centreline).
    ctx.beginPath();
    ctx.moveTo(cx - half, cy);
    ctx.lineTo(cx, cy + half * dir);
    ctx.lineTo(cx + half, cy);
    ctx.moveTo(cx - half, bottom);
    ctx.lineTo(cx, cy + half * dir);
    ctx.lineTo(cx + half, bottom);
    ctx.stroke();
  } else if (type === 'partial-pen') {
    // Partial-penetration single-V — shorter V with a flat land at root.
    ctx.beginPath();
    ctx.moveTo(cx - half, cy);
    ctx.lineTo(cx - size * 0.15, cy + size * 0.65 * dir);
    ctx.lineTo(cx + size * 0.15, cy + size * 0.65 * dir);
    ctx.lineTo(cx + half, cy);
    ctx.stroke();
  } else if (type === 'bevel') {
    // Bevel (asymmetric V, one vertical + one angled).
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, bottom);
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + half, bottom);
    ctx.stroke();
  }
}

// ============================================================
