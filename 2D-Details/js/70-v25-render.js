'use strict';

// V25 — lineset rendering + text box + swatch previews
// Extracted from dev/index.html lines 19753-20234 (2026-05-02 modular split)

// V25 — LINESET RENDERING + TEXT BOX + SWATCH PREVIEWS
// ============================================================

// `{ type:'lineSet', _v25:true, pts:[{u,v},...], lw, ls, closed, fillMaterial }`
// One unified poly-line entity for all "user-drawn" geometry. Replaces
// having to think about Line vs Polyline — every click extends; right-click
// or Enter finishes; clicking the first vertex closes. Closed sets can be
// filled with any of the V25_MATERIALS hatch patterns via fillMaterial.
function drawLineSet2D(blk, ent, cs) {
  if (!ent.pts || ent.pts.length < 2) return;
  const col = v25EntColour(ent, cs);
  const pm = ppm();
  // Resolve line weight: prefer the AS-1100 ramp level if set, otherwise fall
  // back to the legacy raw `lw` mm value so older drawings render unchanged.
  // Level 0 = "no edge" — skip stroke (fill, when present, still draws).
  let lwMm, _skipStroke = false;
  if (typeof ent.lwLevel === 'number') {
    const lvl = Math.max(0, Math.min(AS1100_LW.length - 1, ent.lwLevel));
    if (lvl === 0) _skipStroke = true;
    lwMm = AS1100_LW[lvl];
  } else {
    lwMm = ent.lw || 0.35;
  }
  const lw = Math.max(0.25, lwMm * pm);
  // V25-layout-overhaul Phase 7 — apply per-entity opacity. Multiplied into
  // existing alpha so nested calls compose correctly.
  const _opacityWas = ctx.globalAlpha;
  ctx.globalAlpha = _opacityWas * v25EntOpacity(ent);
  try {
  // Build the path once — used for both fill (when closed) and stroke.
  const buildPath = () => {
    ctx.beginPath();
    const first = real2px(blk, ent.pts[0].u, ent.pts[0].v);
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < ent.pts.length; i++) {
      const p = real2px(blk, ent.pts[i].u, ent.pts[i].v);
      ctx.lineTo(p.x, p.y);
    }
    if (ent.closed) ctx.closePath();
  };

  // V25 — closed lineSet with a fillMaterial gets a hatch pattern. Reuses
  // the same material renderer used by drawMat2D so the user gets identical
  // patterns whether they pick a Material rect or fill a custom polygon.
  if (ent.closed && ent.fillMaterial && typeof drawMat2D === 'function' && V25_MATERIALS[ent.fillMaterial]) {
    // Build a temporary mat-shaped entity that drawMat2D understands.
    const matEnt = {
      type: 'mat', _v25: true, shape: 'poly', material: ent.fillMaterial,
      pts: ent.pts.map(p => ({ u: p.u, v: p.v })),
    };
    drawMat2D(blk, matEnt, cs);
    // drawMat2D already strokes the outline at the material's edge weight.
    // We skip our own outline below to avoid drawing twice.
    return;
  }

  // Solid fill for closed polygons (independent of the material hatch above).
  if (ent.closed && ent.fillColour) {
    ctx.fillStyle = ent.fillColour;
    buildPath();
    ctx.fill();
  }
  if (!_skipStroke) {
    ctx.strokeStyle = col;
    ctx.lineWidth = lw;
    // V25-layout-overhaul Phase 5 — dotted style. Round-cap so the [0, gap]
    // pattern renders as clean round dots rather than tiny squares.
    const _prevCap = ctx.lineCap;
    if (ent.ls === 'dotted') ctx.lineCap = 'round';
    ctx.setLineDash(
      ent.ls === 'dotted' ? [0, lw * 2.5] :
      ent.ls === 'dashed' ? [6, 3] :
      ent.ls === 'centre' ? [10, 3, 2, 3] :
      ent.ls === 'phantom' ? [12, 3, 2, 3, 2, 3] :
      []
    );
    buildPath();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineCap = _prevCap;
  }
  } finally { ctx.globalAlpha = _opacityWas; }
}

// `{ type:'txtBox', _v25:true, u, v, txt, sz, align }`
// Plain text box without a leader (the leader2 entity handles the with-arrow
// case). Origin is the baseline of the first line.
function drawTxtBox2D(blk, ent, cs) {
  const col = v25EntColour(ent, cs);
  // V25-layout-overhaul Phase 7 — opacity override.
  const _opacityWas = ctx.globalAlpha;
  ctx.globalAlpha = _opacityWas * v25EntOpacity(ent);
  try {
  const pm = ppm();
  const fs = Math.max(9, (ent.sz || 3) * pm);
  ctx.font = `${fs}px system-ui`;
  ctx.fillStyle = col;
  ctx.textAlign = ent.align || 'left';
  ctx.textBaseline = 'middle';
  const lines = String(ent.txt || '').split('\n');
  const lh = Math.max(11, (ent.sz || 3) * pm * 1.2);
  const p = real2px(blk, ent.u, ent.v);
  lines.forEach((ln, i) => ctx.fillText(ln, p.x, p.y + i * lh));
  ctx.textAlign = 'start';
  } finally { ctx.globalAlpha = _opacityWas; }
}

// ---- Material swatch (palette tile preview) ----
// Renders a 36×36 px miniature of the actual hatch pattern so the user can
// see "concrete" vs "blockwork" vs "earth" at a glance.
function v25DrawMaterialSwatch(canvas, materialKey) {
  const ctx2 = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx2.clearRect(0, 0, W, H);
  ctx2.strokeStyle = '#2c2c2c';
  ctx2.fillStyle = '#2c2c2c';
  ctx2.lineWidth = 0.6;
  // Border
  ctx2.strokeRect(1, 1, W - 2, H - 2);
  ctx2.save();
  ctx2.beginPath();
  ctx2.rect(1, 1, W - 2, H - 2);
  ctx2.clip();
  const def = (typeof V25_MATERIALS === 'object' && V25_MATERIALS[materialKey]) || {};
  if (materialKey === 'concrete' || materialKey === 'reoConcrete') {
    // Hand-drawn aggregate (outlined triangles) + scattered fines (dots).
    // Different seed per material so the two tiles look distinct.
    let s = materialKey === 'reoConcrete' ? 73 : 41;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const triCount = materialKey === 'reoConcrete' ? 9 : 6;
    const dotCount = 30;
    // Triangles
    ctx2.lineWidth = 0.7;
    ctx2.strokeStyle = '#2c2c2c';
    ctx2.fillStyle = '#ffffff';
    ctx2.lineJoin = 'round';
    for (let i = 0; i < triCount; i++) {
      const cx = 3 + rnd() * (W - 6);
      const cy = 3 + rnd() * (H - 6);
      const sizeBias = rnd();
      const sz = 1.4 + sizeBias * sizeBias * 2.4;
      const baseRot = rnd() * Math.PI * 2;
      ctx2.beginPath();
      for (let k = 0; k < 3; k++) {
        const ang = baseRot + (k / 3) * Math.PI * 2 + (rnd() - 0.5) * 0.5;
        const r = sz * (0.85 + rnd() * 0.3);
        const px = cx + Math.cos(ang) * r;
        const py = cy + Math.sin(ang) * r;
        if (k === 0) ctx2.moveTo(px, py); else ctx2.lineTo(px, py);
      }
      ctx2.closePath();
      ctx2.fill();
      ctx2.stroke();
    }
    // Fines
    ctx2.fillStyle = '#2c2c2c';
    for (let i = 0; i < dotCount; i++) {
      const cx = 2 + rnd() * (W - 4);
      const cy = 2 + rnd() * (H - 4);
      ctx2.beginPath();
      ctx2.arc(cx, cy, 0.45, 0, Math.PI * 2);
      ctx2.fill();
    }
  } else if (materialKey === 'blockwork' || materialKey === 'brickwork') {
    // Hand-drawn running-bond preview. Blockwork = 2 blocks wide ×
    // ~4 courses; brickwork = 4 bricks wide × ~7 courses (smaller unit).
    const isBrick = materialKey === 'brickwork';
    const courseH = isBrick ? 4.5 : 8;
    const blockW = isBrick ? 8 : 16;
    let s = isBrick ? 53 : 29;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const wob = (m) => (rnd() - 0.5) * m;
    ctx2.lineWidth = 0.7;
    ctx2.strokeStyle = '#2c2c2c';
    ctx2.lineCap = 'round';
    ctx2.lineJoin = 'round';
    // Bed joints
    for (let y = 2 + courseH; y < H - 1; y += courseH) {
      ctx2.beginPath();
      const segs = 6;
      for (let k = 0; k <= segs; k++) {
        const x = 2 + (k / segs) * (W - 4);
        const yy = y + (k === 0 || k === segs ? 0 : wob(0.6));
        if (k === 0) ctx2.moveTo(x, yy); else ctx2.lineTo(x, yy);
      }
      ctx2.stroke();
    }
    // Perp joints — alternating offset
    let course = 0;
    for (let y = 2; y < H - 1; y += courseH) {
      const off = (course % 2) ? blockW * 0.5 : 0;
      for (let x = 2 + off; x < W - 2; x += blockW) {
        if (x <= 3 || x >= W - 3) continue;
        ctx2.beginPath();
        const segs = 3;
        for (let k = 0; k <= segs; k++) {
          const t = k / segs;
          const yy = y + t * courseH;
          const xx = x + (k === 0 || k === segs ? 0 : wob(0.5));
          if (k === 0) ctx2.moveTo(xx, yy); else ctx2.lineTo(xx, yy);
        }
        ctx2.stroke();
      }
      // Centre dot per block face on blockwork only
      if (!isBrick) {
        ctx2.fillStyle = '#2c2c2c';
        for (let x = 2 + off + blockW / 2; x < W; x += blockW) {
          ctx2.beginPath();
          ctx2.arc(x, y + courseH / 2, 0.55, 0, Math.PI * 2);
          ctx2.fill();
        }
      }
      course++;
    }
  } else if (materialKey === 'earth') {
    // 45° hatch
    ctx2.lineWidth = 0.5;
    for (let d = -H; d < W + H; d += 4) {
      ctx2.beginPath(); ctx2.moveTo(d, 0); ctx2.lineTo(d + H, H); ctx2.stroke();
    }
  } else if (materialKey === 'backfill') {
    ctx2.lineWidth = 0.5;
    for (let d = -H; d < W + H; d += 5) {
      ctx2.beginPath(); ctx2.moveTo(d, 0); ctx2.lineTo(d + H, H); ctx2.stroke();
      ctx2.beginPath(); ctx2.moveTo(d, H); ctx2.lineTo(d + H, 0); ctx2.stroke();
    }
  } else if (materialKey === 'grout') {
    // V25-layout-overhaul — Phase 4. Fine dense dots, no jitter.
    for (let y = 2; y < H; y += 2.5) {
      for (let x = 2; x < W; x += 2.5) {
        ctx2.beginPath();
        ctx2.arc(x, y, 0.35, 0, Math.PI*2);
        ctx2.fill();
      }
    }
  } else if (materialKey === 'soil') {
    // V25-layout-overhaul — Phase 4. 45° hatch with topsoil ticks at top.
    ctx2.lineWidth = 0.5;
    for (let d = -H; d < W + H; d += 5) {
      ctx2.beginPath(); ctx2.moveTo(d, 0); ctx2.lineTo(d + H, H); ctx2.stroke();
    }
    // Topsoil tick marks
    ctx2.lineWidth = 0.7;
    for (let x = 2; x < W; x += 4) {
      ctx2.beginPath(); ctx2.moveTo(x, 1); ctx2.lineTo(x, 4); ctx2.stroke();
    }
  } else if (materialKey === 'sand') {
    let s = 33;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    for (let y = 3; y < H; y += 3) {
      for (let x = 3; x < W; x += 3) {
        ctx2.beginPath();
        ctx2.arc(x + (rnd()-0.5)*1.5, y + (rnd()-0.5)*1.5, 0.4, 0, Math.PI*2);
        ctx2.fill();
      }
    }
  } else if (materialKey === 'timberElev') {
    // Wavy vertical grain lines, varying period and phase per line.
    let s = 31;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    ctx2.lineWidth = 0.7;
    ctx2.strokeStyle = '#2c2c2c';
    ctx2.lineCap = 'round';
    const lines = 7;
    const N = 26;
    for (let i = 0; i < lines; i++) {
      const baseX = 3 + ((i + 0.5) / lines) * (W - 6);
      const amp = 0.6 + rnd() * 1.2;
      const period = 14 + rnd() * 18;
      const phase = rnd() * Math.PI * 2;
      const drift = (rnd() - 0.5) * 1.4;
      ctx2.beginPath();
      for (let k = 0; k <= N; k++) {
        const t = k / N;
        const y = 2 + t * (H - 4);
        const x = baseX + drift + Math.sin(y / period * Math.PI * 2 + phase) * amp;
        if (k === 0) ctx2.moveTo(x, y); else ctx2.lineTo(x, y);
      }
      ctx2.stroke();
    }
  } else if (materialKey === 'timberSec') {
    // End-grain rings centred near the lower-middle, with radial cracks.
    let s = 67;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    ctx2.lineWidth = 0.7;
    ctx2.strokeStyle = '#2c2c2c';
    ctx2.lineCap = 'round';
    ctx2.lineJoin = 'round';
    const cx = W * 0.5, cy = H * 0.62;
    // Pith
    ctx2.fillStyle = '#2c2c2c';
    ctx2.beginPath();
    ctx2.arc(cx, cy, 0.9, 0, Math.PI * 2);
    ctx2.fill();
    const maxR = Math.hypot(Math.max(W - cx, cx), Math.max(H - cy, cy));
    const Nr = 32;
    for (let r = 3; r < maxR; r += 2.6 + rnd() * 1.2) {
      const amp = 0.15 + rnd() * 0.5;
      const lobes = 3 + Math.floor(rnd() * 3);
      const phase = rnd() * Math.PI * 2;
      ctx2.beginPath();
      for (let k = 0; k <= Nr; k++) {
        const a = (k / Nr) * Math.PI * 2;
        const rr = r + Math.sin(a * lobes + phase) * amp;
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr;
        if (k === 0) ctx2.moveTo(x, y); else ctx2.lineTo(x, y);
      }
      ctx2.closePath();
      ctx2.stroke();
    }
    // 3 radial cracks
    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * Math.PI * 2 + rnd() * 0.6;
      ctx2.beginPath();
      const segs = 5;
      const endR = maxR * (0.55 + rnd() * 0.4);
      for (let k = 0; k <= segs; k++) {
        const t = k / segs;
        const rr = 1.5 + t * (endR - 1.5);
        const a = ang + (rnd() - 0.5) * 0.25;
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr;
        if (k === 0) ctx2.moveTo(x, y); else ctx2.lineTo(x, y);
      }
      ctx2.stroke();
    }
  } else if (materialKey === 'steelSolid') {
    ctx2.fillStyle = 'rgba(44,44,44,0.85)';
    ctx2.fillRect(2, 2, W-4, H-4);
  } else if (materialKey === 'insulation') {
    ctx2.beginPath();
    for (let i = 0; i <= 30; i++) {
      const t = i / 30;
      const x = 2 + t * (W - 4);
      const y = H/2 + Math.sin(t * Math.PI * 6) * (H/3);
      if (i === 0) ctx2.moveTo(x, y); else ctx2.lineTo(x, y);
    }
    ctx2.stroke();
  } else if (materialKey === 'water') {
    for (let li = 0; li < 4; li++) {
      const y0 = 5 + li * 8;
      ctx2.beginPath();
      for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        const x = 2 + t * (W - 4);
        const y = y0 + Math.sin(t * Math.PI * 4 + li) * 1.5;
        if (i === 0) ctx2.moveTo(x, y); else ctx2.lineTo(x, y);
      }
      ctx2.stroke();
    }
  } else if (materialKey === 'tanking') {
    ctx2.lineWidth = 1.4;
    ctx2.strokeRect(2, 2, W-4, H-4);
    ctx2.lineWidth = 0.5;
    for (let d = -H; d < W + H; d += 6) {
      ctx2.beginPath(); ctx2.moveTo(d, 0); ctx2.lineTo(d + H, H); ctx2.stroke();
    }
  }
  ctx2.restore();
}

// ---- Line swatch (palette tile preview) ----
function v25DrawLineSwatch(canvas, def) {
  const ctx2 = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx2.clearRect(0, 0, W, H);
  ctx2.strokeStyle = '#2c2c2c';
  // Map mm → px (rough; just for visual contrast)
  ctx2.lineWidth = Math.max(0.6, (def.lw || 0.35) * 3);
  // V25-layout-overhaul Phase 5 — dotted swatch uses round-cap zero-length
  // dashes so the preview renders as proper round dots.
  const _prevCap = ctx2.lineCap;
  if (def.ls === 'dotted') ctx2.lineCap = 'round';
  ctx2.setLineDash(
    def.ls === 'dotted' ? [0, ctx2.lineWidth * 2.5] :
    def.ls === 'dashed' ? [4, 2] :
    def.ls === 'centre' ? [8, 2, 2, 2] :
    def.ls === 'phantom' ? [10, 2, 2, 2, 2, 2] :
    []
  );
  ctx2.beginPath();
  ctx2.moveTo(3, H/2); ctx2.lineTo(W - 3, H/2);
  ctx2.stroke();
  ctx2.setLineDash([]);
  ctx2.lineCap = _prevCap;
}

// Open a hatch-fill picker anchored at (clientX, clientY). Each option shows
// a 32x32 swatch of the actual hatch pattern. Selecting one sets ent.fillMaterial
// (or clears it for "(none)") and re-renders.
let v25FillPickerEl = null;
function v25OpenFillPicker(ent, clientX, clientY) {
  v25CloseFillPicker();
  const el = document.createElement('div');
  el.className = 'v25-fill-picker';
  el.style.cssText = 'position:fixed;background:var(--surface-2,#fff);color:var(--text);border:1px solid var(--border, #ccc);border-radius:8px;padding:8px;z-index:1100;box-shadow:var(--shadow-pop, 0 6px 20px rgba(0,0,0,0.15));max-width:340px;display:grid;grid-template-columns:repeat(4, 60px);gap:6px';
  // Position
  const top = Math.min(clientY + 6, window.innerHeight - 280);
  const left = Math.min(clientX + 6, window.innerWidth - 360);
  el.style.left = left + 'px';
  el.style.top = top + 'px';
  // Header
  const hdr = document.createElement('div');
  hdr.style.cssText = 'grid-column:1/-1;font:bold 11px system-ui;color:var(--text-mute, #666);letter-spacing:.04em;text-transform:uppercase;margin-bottom:2px';
  hdr.textContent = 'Fill with hatch pattern';
  el.appendChild(hdr);
  // (none) option to clear an existing fill
  const noneCell = document.createElement('div');
  noneCell.style.cssText = 'cursor:pointer;border:1px solid var(--border, #ccc);border-radius:6px;padding:4px;text-align:center;font:10px system-ui;color:var(--text-mute, #666);background:var(--surface-3,#fafafa);height:60px;display:flex;align-items:center;justify-content:center';
  noneCell.textContent = '(none)';
  noneCell.title = 'Clear fill';
  noneCell.addEventListener('click', () => {
    delete ent.fillMaterial;
    v25CloseFillPicker();
    requestRender();
  });
  el.appendChild(noneCell);
  // One swatch per material
  Object.keys(V25_MATERIALS).forEach(matKey => {
    const cell = document.createElement('div');
    cell.style.cssText = 'cursor:pointer;border:' + (ent.fillMaterial === matKey ? '2px solid var(--accent, #c0392b)' : '1px solid var(--border, #ccc)') + ';border-radius:6px;padding:4px;background:var(--paper, #fff);text-align:center;font:9px system-ui;color:var(--text, #222);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px';
    cell.title = (V25_MATERIALS[matKey].label || matKey);
    const cv = document.createElement('canvas');
    cv.width = 36; cv.height = 36;
    cv.style.cssText = 'width:36px;height:36px;display:block';
    cell.appendChild(cv);
    const lbl = document.createElement('div');
    lbl.textContent = (V25_MATERIALS[matKey].label || matKey);
    lbl.style.cssText = 'max-width:54px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    cell.appendChild(lbl);
    cell.addEventListener('click', () => {
      ent.fillMaterial = matKey;
      ent.closed = true; // ensure
      v25CloseFillPicker();
      if (typeof v25UpdateInspector === 'function') v25UpdateInspector();
      requestRender();
    });
    el.appendChild(cell);
    setTimeout(() => v25DrawMaterialSwatch(cv, matKey), 0);
  });
  document.body.appendChild(el);
  v25FillPickerEl = el;
  // Close on outside click / esc
  const onOut = (ev) => {
    if (!el.contains(ev.target)) v25CloseFillPicker();
  };
  const onKey = (ev) => {
    if (ev.key === 'Escape') v25CloseFillPicker();
  };
  setTimeout(() => {
    document.addEventListener('mousedown', onOut, true);
    document.addEventListener('keydown', onKey, true);
  }, 0);
  el._cleanup = () => {
    document.removeEventListener('mousedown', onOut, true);
    document.removeEventListener('keydown', onKey, true);
  };
}
function v25CloseFillPicker() {
  if (v25FillPickerEl) {
    if (v25FillPickerEl._cleanup) v25FillPickerEl._cleanup();
    v25FillPickerEl.remove();
    v25FillPickerEl = null;
  }
}

function toast(text, ms) {
  let t = document.getElementById('v25Toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'v25Toast';
    t.style.cssText = 'position:fixed;bottom:60px;left:50%;transform:translateX(-50%);background:#222;color:#fff;padding:8px 14px;border-radius:8px;font:12px system-ui;z-index:9999;opacity:0;transition:opacity .2s;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,.3)';
    document.body.appendChild(t);
  }
  t.textContent = text;
  t.style.opacity = '1';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.opacity = '0'; }, ms || 1500);
}

// ============================================================
