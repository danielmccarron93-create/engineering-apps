'use strict';

// LAYER: band 9 (V25 2D-mode) — premium note / text-box UI.
// READS:  tool, shiftHeld, sheetMode, activeBlock, entities2D, v25Selected,
//         viewport, drawingScale, v25Last, canvas, #canvas-container,
//         real2px, px2real, ppm, getCursor, cursorSheet,
//         nbLayout, nbBounds, nbAddArrow, nbRemoveArrowNear, NB (from js/97),
//         v25Add, requestRender, v25UpdateInspector, v25UpdateOptionsBar
// WRITES: window.nbPlace, window.nbEditor (declared in js/07-globals.js),
//         v25Selected, v25Last.note*, localStorage 'sd2.noteDefaults'
//
// Premium 2D-mode 'noteBox' entity UI: two-click placement, the WYSIWYG inline
// <textarea> editor, the quick-options bar, and defaults persistence. The entity
// geometry / render / DXF live in js/97; the single-stroke font in js/96. Every
// cross-file call is typeof-guarded so load order can't break it.
//
// nbPlace  — {blk,u,v} first click (box top-left) during two-click placement.
// nbEditor — inline text-editor overlay state {ent, el, blk, raf}.
// Both are top-level globals declared in js/07-globals.js; this file reaches
// them through `window.*` so it works whether or not that declaration has run.

// ------------------------------------------------------------------
// Small helpers
// ------------------------------------------------------------------

// NB constants live in js/97; fall back to literals so this file is robust even
// if js/97 has not loaded yet (the values mirror CONTRACT §2 exactly).
function _nbC() {
  return (typeof NB === 'object' && NB) ? NB : {
    CAP_MM: 2.5, LINEH: 1.30, PAD_FACTOR: 0.45, PAD_MIN_MM: 1.0,
    AUTO_MINW_MM: 26, MINW_MM: 12, HIT_TOL_PX: 8, MIN_PX: 0.75,
  };
}

// px per sheet-mm. The noteBox is PAPER-space sized (see js/97 _nbZoom): the box,
// text and padding are fixed paper sizes scaled by viewport.zoom — NOT ppm()
// (zoom/drawingScale), which would shrink them by 1/scale. Using viewport.zoom
// here keeps the editor overlay and the placement preview lined up exactly with
// the box drawn by drawNoteBox2D.
function _nbPm() {
  return (typeof viewport === 'object' && viewport && typeof viewport.zoom === 'number') ? viewport.zoom : 1;
}

// Real-world mm tolerance for a given pixel tolerance at the current zoom.
function _nbTolMm(tolPx) {
  const z = (typeof viewport === 'object' && viewport) ? viewport.zoom : 1;
  const ds = drawingScale || 10;
  const pmm = z / ds;            // px per mm
  return pmm > 0 ? (tolPx / pmm) : tolPx;
}

function _nbDist(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

// The currently-selected noteBox entity in this view (last matching id in
// v25Selected), or null. Used by shift-click and the options bar live-apply.
function _nbSelectedNote(blk) {
  if (typeof v25Selected === 'undefined' || !Array.isArray(v25Selected) || !v25Selected.length) return null;
  const vk = (blk && blk.viewKey) || (typeof activeBlock === 'object' && activeBlock && activeBlock.viewKey) || 'elevation';
  const arr = (typeof entities2D === 'object' && entities2D && entities2D[vk]) ? entities2D[vk] : null;
  if (!arr) return null;
  // last id wins (matches CONTRACT §5 "last id in v25Selected")
  for (let i = v25Selected.length - 1; i >= 0; i--) {
    const id = v25Selected[i];
    const ent = arr.find(e => e && e.id === id);
    if (ent && ent.type === 'noteBox') return ent;
  }
  return null;
}

// Layout wrapper — returns a sane fallback if js/97 hasn't loaded.
function _nbLayout(ent) {
  if (typeof nbLayout === 'function') return nbLayout(ent);
  const C = _nbC();
  const cap = ent.sz || C.CAP_MM;
  const pad = Math.max(C.PAD_MIN_MM, cap * C.PAD_FACTOR);
  return {
    boxW: ent.boxW || (C.AUTO_MINW_MM + 2 * pad), boxH: cap * C.LINEH + 2 * pad,
    lines: [{ text: (ent.text || ''), wMm: 0 }], capMm: cap,
    lineHMm: cap * C.LINEH, padMm: pad, Wc: ent.boxW || C.AUTO_MINW_MM,
  };
}

// ------------------------------------------------------------------
// Defaults persistence — nbDefaultProps / nbLoadDefaults / nbSaveDefaults
// ------------------------------------------------------------------

function nbDefaultProps() {
  const L = (typeof v25Last === 'object' && v25Last) ? v25Last : {};
  return {
    style: L.noteStyle || 'plex',
    boxed: (L.noteBoxed !== false),
    sz: L.noteSz || 3.5,
    arrowStyle: L.noteArrow || 'arrow',
    textCase: 'upper',
    leaderLwMm: ((typeof v25Last === 'object' && v25Last && v25Last.noteLeaderLw) || 0.25),
  };
}

function nbLoadDefaults() {
  if (typeof v25Last !== 'object' || !v25Last) return;
  try {
    const raw = window.localStorage && window.localStorage.getItem('sd2.noteDefaults');
    if (!raw) return;
    const d = JSON.parse(raw);
    if (!d || typeof d !== 'object') return;
    if (d.style != null) v25Last.noteStyle = d.style;
    if (d.boxed != null) v25Last.noteBoxed = !!d.boxed;
    if (d.sz != null) v25Last.noteSz = +d.sz || 3.5;
    if (d.arrow != null) v25Last.noteArrow = d.arrow;
    if (d.leaderLw != null) v25Last.noteLeaderLw = +d.leaderLw || 0.25;
  } catch (_e) { /* ignore — defaults just fall back to literals */ }
}

function nbSaveDefaults() {
  if (typeof v25Last !== 'object' || !v25Last) return;
  try {
    if (!(window.localStorage)) return;
    window.localStorage.setItem('sd2.noteDefaults', JSON.stringify({
      style: v25Last.noteStyle || 'professional',
      boxed: (v25Last.noteBoxed !== false),
      sz: v25Last.noteSz || 3.5,
      arrow: v25Last.noteArrow || 'arrow',
      leaderLw: (v25Last.noteLeaderLw || 0.25),
    }));
  } catch (_e) { /* localStorage may be unavailable (private mode / file://) */ }
}

// ------------------------------------------------------------------
// Placement — nbToolClick / nbToolPreview / nbSelectShiftClick
// ------------------------------------------------------------------

function nbToolClick(blk, cu, cv, e) {
  // Shift-click while a note is selected = add/remove a leader arrow on it.
  if (typeof shiftHeld !== 'undefined' && shiftHeld && _nbSelectedNote(blk)) {
    return nbSelectShiftClick(blk, cu, cv);
  }

  const place = window.nbPlace;
  if (!place) {
    // FIRST click — the ARROW HEAD (head-first placement). Remember the tip and
    // wait for the box top-left.
    window.nbPlace = { blk: blk, tipU: cu, tipV: cv };
    if (typeof requestRender === 'function') requestRender();
    return true;
  }

  // SECOND click — the BOX top-left at (cu,cv). The arrow points at the fixed
  // head; a second click within CLOSE_MM of the head means "box only", no arrow.
  const a = place;
  window.nbPlace = null;
  const CLOSE_MM = 3; // CONTRACT §3: a second click within 3mm of the head = "box only", no arrow
  const arrows = (_nbDist(a.tipU, a.tipV, cu, cv) < CLOSE_MM) ? [] : [{ u: a.tipU, v: a.tipV }];

  let ent = null;
  if (typeof v25Add === 'function') {
    ent = v25Add('noteBox', Object.assign(nbDefaultProps(), {
      u: cu, v: cv, text: '', autoSize: true, arrows: arrows,
    }));
  }
  if (ent) {
    if (typeof v25Selected !== 'undefined') v25Selected = [ent.id];
    nbOpenEditor(ent);                 // immediately edit, focus the textarea
  }
  if (typeof requestRender === 'function') requestRender();
  return true;
}

// Placement preview, branching on the active tool:
//   v25-notebox (LEADER note, head-first): BEFORE the first click a small
//     arrowhead/target marker tracks the cursor ("click to place the arrow
//     head"). AFTER the first click the head is PINNED, a ghost box tracks the
//     cursor (top-left at cursor) and a dashed auto-dogleg leader previews from
//     the box edge back to the fixed head — matching what the second click makes.
//   v25-note (PLAIN text box, no arrow): a ghost box tracks the cursor; if a
//     press-drag is active (v25State.noteDownWorld set) a dashed sizing
//     rectangle is drawn from the drag-start to the cursor instead.
function nbToolPreview(blk, cs) {
  if (typeof ctx === 'undefined' || !ctx || typeof real2px !== 'function') return;
  const C = _nbC();
  const z = _nbPm();   // px per sheet-mm (paper-space)
  const ds = (typeof drawingScale !== 'undefined' && drawingScale) ? drawingScale : 10;
  const cap = ((typeof v25Last === 'object' && v25Last && v25Last.noteSz) || 3.5);
  const pad = Math.max(C.PAD_MIN_MM || 1.0, cap * (C.PAD_FACTOR || 0.45));
  const lineH = cap * (C.LINEH || 1.3);
  const boxW = (C.PLACEHOLDER_W_MM || 36) + 2 * pad;   // paper-mm, ~4 words
  const boxH = 2 * lineH + 2 * pad;                    // 2 lines
  const leaderLw = ((typeof v25Last === 'object' && v25Last && v25Last.noteLeaderLw) || 0.25);

  const accent = (function () {
    try {
      const cs2 = cs || (typeof getComputedStyle === 'function' ? getComputedStyle(document.documentElement) : null);
      const c = cs2 && cs2.getPropertyValue ? cs2.getPropertyValue('--accent') : '';
      return (c && c.trim()) || '#4a90d9';
    } catch (_e) { return '#4a90d9'; }
  })();

  const activeTool = (typeof tool !== 'undefined') ? tool : '';

  let cur = null;
  if (typeof getCursor === 'function') { const r = getCursor(blk); if (r && r.length === 2) cur = { u: r[0], v: r[1] }; }

  function ghostBox(TL) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(C.MIN_PX || 0.75, 0.18 * z);
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(TL.x, TL.y, boxW * z, boxH * z);
    ctx.restore();
    if (ctx.setLineDash) ctx.setLineDash([]);
  }

  // Small target/arrowhead marker at a pixel point — "click to place the head".
  function targetMarker(P) {
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = accent;
    ctx.fillStyle = accent;
    ctx.lineWidth = Math.max(C.MIN_PX || 0.75, 0.25 * z);
    // little ring
    ctx.beginPath();
    ctx.arc(P.x, P.y, Math.max(3, 0.9 * z), 0, Math.PI * 2);
    ctx.stroke();
    // centre dot
    ctx.beginPath();
    ctx.arc(P.x, P.y, Math.max(1, 0.25 * z), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Dashed leader + faint arrowhead at the head end, given ordered px points
  // (last point is the head/tip).
  function dashedLeader(px) {
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(C.MIN_PX || 0.75, leaderLw * z);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.moveTo(px[0].x, px[0].y);
    for (let k = 1; k < px.length; k++) ctx.lineTo(px[k].x, px[k].y);
    ctx.stroke();
    ctx.setLineDash([]);
    // faint arrowhead at the head end (final segment)
    const A = px[px.length - 2], T = px[px.length - 1];
    const dx = T.x - A.x, dy = T.y - A.y, L = Math.hypot(dx, dy) || 1;
    const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    const hl = (C.ARROW_LEN_MM || 3.0) * z, hw = (C.ARROW_HW_MM || 0.7) * z;
    ctx.beginPath();
    ctx.moveTo(T.x, T.y); ctx.lineTo(T.x - ux * hl + nx * hw, T.y - uy * hl + ny * hw);
    ctx.moveTo(T.x, T.y); ctx.lineTo(T.x - ux * hl - nx * hw, T.y - uy * hl - ny * hw);
    ctx.stroke();
    ctx.restore();
    if (ctx.setLineDash) ctx.setLineDash([]);
  }

  // -- PLAIN text box (no arrow) -------------------------------------------
  if (activeTool === 'v25-note') {
    const down = (typeof v25State === 'object' && v25State) ? v25State.noteDownWorld : null;
    if (down && down.blk === blk && cur) {
      // Press-drag in progress — dashed sizing rectangle from drag-start to cursor.
      const A = real2px(blk, down.u, down.v);
      const B = real2px(blk, cur.u, cur.v);
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = accent;
      ctx.lineWidth = Math.max(C.MIN_PX || 0.75, 0.18 * z);
      ctx.setLineDash([5, 3]);
      ctx.strokeRect(Math.min(A.x, B.x), Math.min(A.y, B.y), Math.abs(B.x - A.x), Math.abs(B.y - A.y));
      ctx.restore();
      if (ctx.setLineDash) ctx.setLineDash([]);
      return;
    }
    // Idle — the box ghost tracks the cursor (top-left at cursor).
    if (cur) ghostBox(real2px(blk, cur.u, cur.v));
    return;
  }

  // -- LEADER note (head-first) --------------------------------------------
  const place = window.nbPlace;
  if (!place || place.blk !== blk) {
    // BEFORE the first click — a target marker tracks the cursor (the arrow head).
    if (cur) targetMarker(real2px(blk, cur.u, cur.v));
    return;
  }

  // AFTER the first click — head pinned; ghost box tracks the cursor, dashed
  // dogleg leader previews from the box edge back to the fixed head.
  if (!cur) { return; }
  ghostBox(real2px(blk, cur.u, cur.v));
  const head = { u: place.tipU, v: place.tipV };
  const rect = { uL: cur.u, uR: cur.u + boxW * ds, vT: cur.v, vB: cur.v - boxH * ds };
  let pts;
  if (typeof nbAutoShoulderForRect === 'function') {
    const sh = nbAutoShoulderForRect(rect, head, ds);
    pts = [sh.mid, sh.node, head];
  } else {
    pts = [{ u: (rect.uL + rect.uR) / 2, v: rect.vB }, head];
  }
  const px = pts.map(function (p) { return real2px(blk, p.u, p.v); });
  dashedLeader(px);
}

function nbSelectShiftClick(blk, cu, cv) {
  const ent = _nbSelectedNote(blk);
  if (!ent) return false;
  const nodeTol = _nbTolMm((_nbC().HIT_TOL_PX || 8) + 2);   // a touch generous so nodes are easy to hit
  // 1) on a leader node (a kink, or the default auto-dogleg shoulder) → branch a
  //    NEW arrow from it (shared shoulder, fanned leg you then drag to the target).
  if (typeof nbAddArrowNodeBranch === 'function' && nbAddArrowNodeBranch(ent, cu, cv, nodeTol)) {
    if (typeof requestRender === 'function') requestRender();
    return true;
  }
  // 2) on an arrow tip → remove that arrow.
  if (typeof nbRemoveArrowNear === 'function' && nbRemoveArrowNear(ent, cu, cv, nodeTol)) {
    if (typeof requestRender === 'function') requestRender();
    return true;
  }
  // 3) on a leader line (not on a node) → add an orthogonal-shouldered kink node.
  if (typeof nbAddNodeAtLeader === 'function' && nbAddNodeAtLeader(ent, cu, cv, _nbTolMm(10))) {
    if (typeof requestRender === 'function') requestRender();
    return true;
  }
  // 4) empty space → add a new arrow from the box to the click.
  if (typeof nbAddArrow === 'function') nbAddArrow(ent, cu, cv);
  if (typeof requestRender === 'function') requestRender();
  return true;
}

// ------------------------------------------------------------------
// Inline editor — nbOpenEditor / nbCloseEditor / nbOpenEditorAt
// ------------------------------------------------------------------

function _nbEditorHost() {
  return document.getElementById('canvas-container') || document.body;
}

// Create the <textarea> once and append it to #canvas-container.
function _nbEnsureTextarea() {
  let el = document.getElementById('nbEditorTA');
  if (el) return el;
  el = document.createElement('textarea');
  el.id = 'nbEditorTA';
  el.setAttribute('spellcheck', 'false');
  el.setAttribute('autocomplete', 'off');
  el.setAttribute('autocapitalize', 'off');
  el.wrap = 'soft';
  // Fully inline styling (no CSS file changes). Mirrors the options-bar cssText
  // approach. Background subtle so the canvas box shows through; the textarea is
  // the single source of truth for text while open.
  el.style.cssText = [
    'position:absolute',
    'box-sizing:border-box',
    'margin:0',
    'z-index:60',
    'resize:none',
    'overflow:hidden',
    'border:1px dashed var(--accent, #4a90d9)',
    'outline:none',
    'background:var(--surface, rgba(255,255,255,0.04))',
    'white-space:pre-wrap',
    'word-break:normal',
    'overflow-wrap:break-word',
    'letter-spacing:0',
  ].join(';');
  _nbEditorHost().appendChild(el);
  return el;
}

// Position/size the textarea over the entity's box for the current viewport.
function _nbPositionEditor() {
  const ed = window.nbEditor;
  if (!ed || !ed.el || !ed.ent || !ed.blk) return;
  if (typeof real2px !== 'function') return;
  const ent = ed.ent, blk = ed.blk, el = ed.el;
  const pm = _nbPm();
  const lay = _nbLayout(ent);
  const TL = real2px(blk, ent.u, ent.v);

  // The textarea lives inside #canvas-container; real2px returns coords relative
  // to the canvas. The canvas sits at the container's top-left, so canvas px map
  // 1:1 to container px (matches how the options bar is positioned). Use the
  // canvas element's offset within the host to be safe if it is ever inset.
  let offL = 0, offT = 0;
  try {
    const host = _nbEditorHost();
    if (typeof canvas !== 'undefined' && canvas && canvas.getBoundingClientRect && host.getBoundingClientRect) {
      const cr = canvas.getBoundingClientRect();
      const hr = host.getBoundingClientRect();
      offL = cr.left - hr.left;
      offT = cr.top - hr.top;
    }
  } catch (_e) { offL = 0; offT = 0; }

  const capPx = Math.max(6, lay.capMm * pm);
  const padPx = Math.max(0, lay.padMm * pm);
  const lineHPx = Math.max(capPx, lay.lineHMm * pm);
  const wPx = Math.max(8, lay.boxW * pm);
  const hPx = Math.max(lineHPx + 2 * padPx, lay.boxH * pm);

  el.style.left = (offL + TL.x) + 'px';
  el.style.top = (offT + TL.y) + 'px';
  el.style.width = wPx + 'px';
  el.style.height = hPx + 'px';
  el.style.padding = padPx + 'px';
  el.style.fontSize = capPx + 'px';
  el.style.lineHeight = lineHPx + 'px';

  // Style-dependent presentation. For `web` styles (plex, routed*) the editor
  // uses the style's real font family so typing is WYSIWYG — including the
  // Routed Gothic cuts (the half-italic's lean is baked into the font, so no
  // synthetic slant). Stroke styles get a monospace stand-in.
  const styleName = ent.style || 'professional';
  const stDef = (typeof nbStyle === 'function') ? nbStyle(styleName) : null;
  if (stDef && stDef.font === 'web') {
    el.style.fontFamily = stDef.family || "'IBM Plex Sans', system-ui, sans-serif";
    el.style.fontWeight = String(stDef.weight || 400);
  } else {
    // Technical monospace stand-in for the stroke font so typing feels WYSIWYG.
    el.style.fontFamily = "'IBM Plex Mono', ui-monospace, monospace";
    el.style.fontWeight = '400';
  }
  // Inclined "engineer" stroke style → synthetic lean to match the slanted
  // render. The Routed Gothic Lean cut carries its slope in the font itself.
  el.style.fontStyle = (styleName === 'engineer') ? 'italic' : 'normal';
  el.style.textTransform = (ent.textCase !== 'normal') ? 'uppercase' : 'none';

  // Colour: prefer the entity colour, fall back to --entity-color.
  let col = ent.colour;
  if (!col) {
    try {
      const cs = (typeof getComputedStyle === 'function') ? getComputedStyle(document.documentElement) : null;
      col = cs ? (cs.getPropertyValue('--entity-color') || '').trim() : '';
    } catch (_e) { col = ''; }
  }
  el.style.color = col || '#111';

  // Spell-check: keep the squiggle overlay glued to the textarea each frame.
  if (typeof nbSpellSync === 'function') nbSpellSync();
}

// rAF loop that keeps the textarea glued to the box while panning/zooming.
function _nbEditorTick() {
  const ed = window.nbEditor;
  if (!ed) return;             // closed — stop the loop
  _nbPositionEditor();
  ed.raf = window.requestAnimationFrame(_nbEditorTick);
}

function nbOpenEditor(ent) {
  if (!ent) return;
  // Close any editor already open on a different entity first (commit it).
  if (window.nbEditor && window.nbEditor.ent && window.nbEditor.ent !== ent) {
    nbCloseEditor(true);
  }
  const blk = (typeof activeBlock === 'object' && activeBlock) ? activeBlock : null;
  const el = _nbEnsureTextarea();
  el.value = ent.text || '';
  ent._editing = true;
  window.nbEditor = { ent: ent, el: el, blk: blk, raf: 0 };

  // Spell-check: attach the live red-squiggle overlay (guarded; no-op if js/81
  // is absent or spell-check is switched off).
  if (typeof nbSpellAttach === 'function') nbSpellAttach(el, ent);

  // input → live update + autoSize relayout + re-render.
  el.oninput = function () {
    const cur = window.nbEditor;
    if (!cur || cur.ent !== ent) return;
    ent.text = el.value;
    if (ent.autoSize && typeof nbLayout === 'function') nbLayout(ent); // refresh derived boxW
    _nbPositionEditor();
    if (typeof requestRender === 'function') requestRender();
    if (typeof nbSpellInput === 'function') nbSpellInput();   // re-check spelling (debounced)
  };

  // keys: Enter = newline (default textarea behaviour, allow it);
  //       Esc or Ctrl/Cmd+Enter = commit.
  el.onkeydown = function (e) {
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      nbCloseEditor(true);
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault(); e.stopPropagation();
      nbCloseEditor(true);
    } else {
      // Plain Enter inserts a newline; stop it bubbling to global keyboard
      // handlers so it doesn't trigger tool shortcuts.
      e.stopPropagation();
    }
  };

  _nbPositionEditor();
  // Focus + place caret at the end after the element is laid out.
  window.setTimeout(function () {
    try { el.focus(); const n = el.value.length; el.setSelectionRange(n, n); } catch (_e) { /* */ }
  }, 0);

  // Deferred outside-click → commit (mirrors the size-picker discipline so the
  // opening click doesn't immediately close the editor).
  window.setTimeout(function () {
    document.addEventListener('mousedown', _nbOutsideClick, true);
  }, 0);

  // Keep it positioned across pan/zoom.
  if (window.nbEditor) window.nbEditor.raf = window.requestAnimationFrame(_nbEditorTick);

  if (typeof requestRender === 'function') requestRender();
}

function _nbOutsideClick(e) {
  const ed = window.nbEditor;
  if (!ed || !ed.el) return;
  if (e.target === ed.el || ed.el.contains(e.target)) return;
  // Swallow this click so it ONLY finishes the note (doesn't also place/select
  // another entity underneath).
  if (e.preventDefault) e.preventDefault();
  if (e.stopImmediatePropagation) e.stopImmediatePropagation();
  nbCloseEditor(true);
}

function nbCloseEditor(commit) {
  const ed = window.nbEditor;
  if (!ed) return;
  const ent = ed.ent, el = ed.el;

  if (commit && ent && el) ent.text = el.value;
  if (ent) delete ent._editing;

  // Stop the position loop + outside-click listener.
  if (ed.raf) { try { window.cancelAnimationFrame(ed.raf); } catch (_e) { /* */ } }
  document.removeEventListener('mousedown', _nbOutsideClick, true);

  // An empty note shouldn't persist — remove it on commit.
  if (commit && ent && (!ent.text || ent.text.trim() === '')) {
    const vk = (ed.blk && ed.blk.viewKey)
      || (typeof activeBlock === 'object' && activeBlock && activeBlock.viewKey)
      || ent.view || 'elevation';
    const arr = (typeof entities2D === 'object' && entities2D && entities2D[vk]) ? entities2D[vk] : null;
    if (arr) {
      const idx = arr.indexOf(ent);
      if (idx >= 0) arr.splice(idx, 1);
    }
    if (typeof v25Selected !== 'undefined' && Array.isArray(v25Selected)) {
      v25Selected = v25Selected.filter(id => id !== ent.id);
    }
  }

  // Spell-check: tear down the squiggle overlay first (restores the textarea).
  if (typeof nbSpellDetach === 'function') nbSpellDetach();

  // Tear down the overlay.
  if (el) { el.oninput = null; el.onkeydown = null; if (el.parentNode) el.parentNode.removeChild(el); }
  window.nbEditor = null;

  if (typeof requestRender === 'function') requestRender();
  if (typeof v25UpdateInspector === 'function') v25UpdateInspector();
  if (typeof v25UpdateOptionsBar === 'function') v25UpdateOptionsBar();
}

// Double-click to edit: hit-test a noteBox at (cu,cv) using nbBounds.
function nbOpenEditorAt(blk, cu, cv) {
  const vk = (blk && blk.viewKey)
    || (typeof activeBlock === 'object' && activeBlock && activeBlock.viewKey) || 'elevation';
  const arr = (typeof entities2D === 'object' && entities2D && entities2D[vk]) ? entities2D[vk] : null;
  if (!arr || typeof nbBounds !== 'function') return false;
  // Topmost first (later entities draw on top).
  for (let i = arr.length - 1; i >= 0; i--) {
    const ent = arr[i];
    if (!ent || ent.type !== 'noteBox') continue;
    const b = nbBounds(ent);
    if (b && cu >= b.L && cu <= b.R && cv >= b.B && cv <= b.T) {
      nbOpenEditor(ent);
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------------
// Options bar — nbOptionsBarHTML / nbBindOptionsBar
// ------------------------------------------------------------------

function nbOptionsBarHTML() {
  const L = (typeof v25Last === 'object' && v25Last) ? v25Last : {};
  const style = L.noteStyle || 'plex';
  const boxed = (L.noteBoxed !== false);
  const sz = L.noteSz || 3.5;
  const arrow = L.noteArrow || 'arrow';
  const leaderLw = (L.noteLeaderLw || 0.25);

  // Same `fld(label, innerHTML)` look as the other tools in js/72.
  const fld = (label, inner) =>
    `<label style="display:flex;align-items:center;gap:4px"><span style="color:var(--text-mute);font-size:11px">${label}</span>${inner}</label>`;

  const styleOpts = [
    ['professional', 'Professional'],
    ['draftsman', 'Draftsman'],
    ['engineer', 'Engineer'],
    ['plex', 'Plex'],
    ['routed', 'Routed Gothic'],
    ['routedWide', 'Routed Gothic Wide'],
    ['routedHalf', 'Routed Gothic Lean'],
  ].map(([v, lbl]) => `<option value="${v}"${v === style ? ' selected' : ''}>${lbl}</option>`).join('');

  const arrowOpts = ['arrow', 'dot', 'open']
    .map(v => `<option value="${v}"${v === arrow ? ' selected' : ''}>${v}</option>`).join('');

  let html = '<strong>Note</strong>';
  html += fld('Style', `<select id="nbo-style">${styleOpts}</select>`);
  html += fld('Outline', `<input type="checkbox" id="nbo-boxed"${boxed ? ' checked' : ''}/>`);
  html += fld('Size mm', `<input type="number" id="nbo-sz" step="0.5" value="${sz}" style="width:56px"/>`);
  html += fld('Arrow line mm', `<input type="number" id="nbo-leaderlw" step="0.05" value="${leaderLw}" style="width:56px"/>`);
  html += fld('Arrow', `<select id="nbo-arrow">${arrowOpts}</select>`);
  html += '<span style="color:var(--text-mute);font-size:11px;margin-left:4px">New notes use these · q to place · double-click to edit · Shift-click adds an arrow</span>';
  return html;
}

function nbBindOptionsBar(bar) {
  if (!bar || !bar.querySelector) return;
  const L = (typeof v25Last === 'object' && v25Last) ? v25Last : null;

  // Apply a field to the currently-selected note (live preview) + persist.
  const applyToSelected = (field, value) => {
    const ent = _nbSelectedNote(activeBlock);
    if (ent) {
      ent[field] = value;
      if (typeof requestRender === 'function') requestRender();
      if (typeof v25UpdateInspector === 'function') v25UpdateInspector();
    }
  };

  const styleEl = bar.querySelector('#nbo-style');
  if (styleEl) styleEl.addEventListener('change', (e) => {
    if (L) L.noteStyle = e.target.value;
    nbSaveDefaults();
    applyToSelected('style', e.target.value);
  });

  const boxedEl = bar.querySelector('#nbo-boxed');
  if (boxedEl) boxedEl.addEventListener('change', (e) => {
    if (L) L.noteBoxed = !!e.target.checked;
    nbSaveDefaults();
    applyToSelected('boxed', !!e.target.checked);
  });

  const szEl = bar.querySelector('#nbo-sz');
  if (szEl) szEl.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value) || 2.5;
    if (L) L.noteSz = v;
    nbSaveDefaults();
    applyToSelected('sz', v);
  });

  const leaderLwEl = bar.querySelector('#nbo-leaderlw');
  if (leaderLwEl) leaderLwEl.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value) || 0.25;
    if (L) L.noteLeaderLw = v;
    nbSaveDefaults();
    applyToSelected('leaderLwMm', v);
  });

  const arrowEl = bar.querySelector('#nbo-arrow');
  if (arrowEl) arrowEl.addEventListener('change', (e) => {
    if (L) L.noteArrow = e.target.value;
    nbSaveDefaults();
    applyToSelected('arrowStyle', e.target.value);
  });
}

// ------------------------------------------------------------------
// Web-font preload — nbPreloadWebFonts
// ------------------------------------------------------------------
// The stroke styles need no font. The `web` styles render via ctx.fillText,
// which only paints a custom font once that font is actually LOADED. IBM Plex
// is already loaded by the UI chrome; the bundled Routed Gothic cuts are used
// nowhere else in the DOM, so the canvas would silently fall back until a note
// happens to trigger a load. Load them explicitly here, then re-render and drop
// any layout cached against fallback metrics (so a saved sheet opened with a
// Routed Gothic note re-flows correctly the instant the real glyphs arrive).
function nbPreloadWebFonts() {
  try {
    if (!(typeof document !== 'undefined' && document.fonts && document.fonts.load)) return;
    const fams = ["'Routed Gothic'", "'Routed Gothic Wide'", "'Routed Gothic Half Italic'"];
    const onReady = function () {
      if (typeof nbClearLayoutCache === 'function') nbClearLayoutCache();
      if (typeof requestRender === 'function') requestRender();
    };
    fams.forEach(function (fam) {
      document.fonts.load('16px ' + fam).then(onReady).catch(function () { /* missing → keep fallback */ });
    });
  } catch (_e) { /* document.fonts unsupported → fallback face, still legible */ }
}

// ------------------------------------------------------------------
// Load persisted defaults once at startup (guarded).
// ------------------------------------------------------------------
if (typeof v25Last !== 'undefined') {
  try { nbLoadDefaults(); } catch (_e) { /* defaults fall back to literals */ }
}
try { nbPreloadWebFonts(); } catch (_e) { /* preload is best-effort */ }
