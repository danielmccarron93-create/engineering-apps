# Premium Text-Box (`noteBox`) — FROZEN BUILD CONTRACT

**This file is the single source of truth for the build.** Every agent reads it and follows it
verbatim. Do not rename a symbol, change a field name, or alter an algorithm without it being
reflected here. If two files disagree, this file wins.

The feature is a premium 2D-mode (V25 paper-space) annotation entity: a text box with an
auto-wrapping outline (optional), one or more leader arrows, and switchable lettering styles —
including an authentic single-stroke vector font that reads as professional CAD lettering when
crisp and as 1970s hand-drafted lettering when given a subtle ink-wobble.

It replaces the cumbersome `prompt()`-based `text`/`note`/`mtext` flow. Those legacy entity types
are **left intact** (old saves still render); we simply add a better one and point the palette +
the `q` key at it.

---

## 0. Glossary of the coordinate system (read first)

- Entities store geometry in **real-world mm** as `(u, v)` with **v up**.
- `real2px(blk, u, v)` → `{x, y}` screen px. Internally `sy = blk.sheetY - v/drawingScale`, so
  **increasing v = up = decreasing screen-y**.
- `px2real(blk, px, py)` → `{u, v}`.
- `ppm()` → pixels-per-real-mm = `viewport.zoom / drawingScale` (returns `1` during PDF export).
  Call it once per draw as `const pm = ppm();`.
- Lengths in mm convert to px by `* pm`. A line width in mm converts by `lwPx(mm) = Math.max(0.75, mm*pm)`.
- `entities2D[viewKey]` is the per-view entity array. `viewKey ∈ {'elevation','sectionA','planB', …}`.

---

## 1. Entity schema (FROZEN)

```js
{
  id,                    // set by mkEnt2D
  type: 'noteBox',
  view,                  // set by mkEnt2D (the viewKey)
  _v25: true,            // set by v25Add — routes through v25DrawEnt / v25 selection
  layer: '0', lw, ls,    // set by mkEnt2D (unused by our drawer but kept for consistency)

  // --- geometry: the text box is anchored at its TOP-LEFT corner ---
  u, v,                  // real-world mm, TOP-LEFT corner of the box (v is up)
  boxW,                  // box width in mm. Auto-filled by nbLayout when autoSize.
  autoSize: true,        // true → width auto-fits text; false → user-resized, text wraps to boxW

  // --- content ---
  text: '',              // raw user text; may contain '\n' for explicit line breaks
  textCase: 'upper',     // 'upper' | 'normal'  (structural default: upper)

  // --- presentation ---
  style: 'professional', // 'professional' | 'draftsman' | 'plex'   (see §2)
  boxed: true,           // truthy → draw the thin outline; falsy → text + leader(s) only
  sz: 2.5,               // text cap height in mm (overrides the style's default)
  arrowStyle: 'arrow',   // 'arrow' | 'dot' | 'open'

  // --- leaders: zero or more arrow tips, in real-world mm ---
  arrows: [ { u, v } ],  // each entry is one arrowhead target. May be [] (box only).

  // --- v25 common display overrides (optional) ---
  colour,                // hex string; falls back to --entity-color
  opacity,               // 0..1; falls back to 1
}
```

Box rectangle (derived): with height `boxH` from `nbLayout`, the box spans
`u ∈ [u, u+boxW]` and `v ∈ [v-boxH, v]`. **Top edge = ent.v, left edge = ent.u.**

Transient (never serialized — keep off the entity or underscore-prefixed and cleared):
- `ent._editing` — boolean, true only while the inline editor is open (drawer skips drawing the
  text so the textarea is the single source of truth). Cleared on editor close.
- Layout caching uses a module-level `WeakMap` (see §3 `nbLayout`), **not** a field on `ent`, so
  saved JSON stays clean.

---

## 2. Named constants + style registry (FROZEN — define in `js/97`)

```js
const NB = {
  CAP_MM: 2.5,            // default cap height if neither ent.sz nor style.sizeMm
  LINEH: 1.30,            // line height = cap * LINEH
  PAD_FACTOR: 0.45, PAD_MIN_MM: 1.0,   // inner padding = max(PAD_MIN, cap*PAD_FACTOR)
  AUTO_MAXLINE_MM: 55,    // auto-size: don't make lines longer than this before wrapping
  AUTO_MINW_MM: 26,       // auto-size: minimum content width
  AUTO_ASPECT: 6.0,       // auto-size target width:height ratio for multi-line blocks
  MINW_MM: 12,            // hard minimum content width when manually resized
  ARROW_LEN_MM: 3.0, ARROW_HW_MM: 0.7,  // slender filled arrowhead
  ARROW_DOT_MM: 0.9, ARROW_OPEN_DEG: 20,
  WOBBLE_MM: 0.28, WOBBLE_MAX_PX: 2.0,  // hand-ink amplitude for draftsman
  BOX_LW_MM: 0.18,        // default box outline weight (thin)
  LEADER_LW_MM: 0.38,     // leader weight (slightly thicker than the box outline)
  MIN_PX: 0.75,           // floor for any rendered line width in px
  HIT_TOL_PX: 8,          // pixel tolerance for "near an arrow tip"
};

// cap = stroke-font cap height in font units; ALL glyph y-coords live in [0..14], baseline y=0, y UP.
const NB_FONT_CAP = 14;

const NB_STYLES = {
  professional: { font:'stroke', wobble:0,    jitter:0,   sizeMm:2.5, textWeightMm:0.18,
                  boxLwMm:0.18, leaderLwMm:0.38, letterSpacingMm:0.25, upperDefault:true,
                  label:'Professional' },
  draftsman:    { font:'stroke', wobble:0.28, jitter:0.55, sizeMm:2.8, textWeightMm:0.24,
                  boxLwMm:0.22, leaderLwMm:0.40, letterSpacingMm:0.40, upperDefault:true,
                  label:'Draftsman (70s hand)' },
  plex:         { font:'web', family:"'IBM Plex Sans', system-ui, sans-serif", weight:500,
                  wobble:0, jitter:0, sizeMm:2.5, textWeightMm:0, boxLwMm:0.18, leaderLwMm:0.38,
                  letterSpacingMm:0.20, upperDefault:false, label:'Plex (modern)' },
};
function nbStyle(name){ return NB_STYLES[name] || NB_STYLES.professional; }
```

The two showpiece styles (`professional`, `draftsman`) share ONE single-stroke vector font defined
in `js/96`. `professional` draws it crisp (no wobble); `draftsman` adds ink-wobble + per-glyph
jitter. `plex` is a modern fallback using the already-loaded IBM Plex Sans (no new font is loaded;
the feature is fully offline).

---

## 3. `js/96-stroke-font.js` — single-stroke vector font (NEW FILE, owner: agent-stroke)

A bespoke single-stroke ("stick"/SHX-like) font. This is what makes the lettering authentic — real
structural lettering, both modern CAD (`romans.shx`) and 1970s hand lettering, is single-stroke,
**not** a filled TTF. Crisp = CAD; wobbled = hand-drawn.

### Font data model
```js
// y is UP, baseline at y=0, CAP HEIGHT = 14 units. All glyphs are uppercase + digits + punctuation.
// Each glyph: { adv:Number(advance width in units), strokes:[ stroke, ... ] }
// Each stroke is a polyline: [ [x,y], [x,y], ... ] drawn with the pen down (no fills, ever).
const NB_GLYPHS = {
  'A': { adv:12, strokes:[ [[0,0],[6,14],[12,0]], [[2.4,5.6],[9.6,5.6]] ] },
  // ... full set, see "Glyph set" below ...
};
const NB_FONT = { cap: 14, space: 8, glyphs: NB_GLYPHS };
```

### Glyph set to author (uppercase structural alphabet)
- `A–Z` (26), `0–9` (10), space.
- Punctuation/symbols: `. , : ; ' " - – / \ ( ) [ ] & % # @ ! ? + = × ° ⌀ ½`.
- Lowercase `a–z`: map to the uppercase glyph (structural lettering is all-caps). `nbGlyph('a')`
  returns the `'A'` glyph. (For `style:'plex'` the web font handles case; the stroke font never
  needs lowercase shapes.)
- Any character with no glyph → render a small `.notdef` box OR fall back to the web font for that
  single glyph (see `nbStrokeText` fallback). Never throw.

**Proportions (author to these):** cap height 14, digit height 14, x-positions in 0..~12, advances
10–13 for letters, 6–8 for `I`/punctuation, comma/period sit near baseline with a small tail.
Round letters (`O C G Q S D P R B U J`) use 8–14 short segments so they look smooth at print size.
`O` should be a clean oval, not a diamond. Keep stroke order natural (how a hand draws it) — it
makes the draftsman jitter look organic. Aim for the clean, slightly-condensed engineering hand in
classic Australian structural drawings (think AS 1100 lettering / `isocp`).

### Public API (FROZEN signatures)
```js
function nbGlyph(ch)                                  // → glyph object or null; maps a–z to A–Z
function nbStrokeAdvanceUnits(str, letterSpacingUnits)// → total advance in font units
function nbStrokeTextWidthMm(str, capMm, letterSpacingMm)   // → width in mm
function nbStrokeTextWidthPx(str, capPx, letterSpacingPx)   // → width in px
// Draw `str` with baseline-LEFT origin at (xPx, yPx), cap height = capPx.
// opts: { weightPx, color, letterSpacingPx, wobbleAmpPx, jitter, seed, align }
//   align 'left'|'center'|'right' positions the string horizontally relative to xPx.
//   wobbleAmpPx>0 → hand-ink wobble; jitter 0..1 → per-glyph baseline/rotation/scale jitter.
// Returns the total advance width in px.
function nbStrokeText(ctx, str, xPx, yPx, capPx, opts)
// Low-level: stroke a polyline of screen-px points, optionally wobbled. Reused by §4 for the box
// outline + leaders in draftsman style. Deterministic given seed (no shimmer between frames).
function nbWobbleStroke(ctx, ptsPx, ampPx, seed)
function nbStrokeFontSelfCheck()  // → { glyphCount, missing:[chars expected but absent], empty:[chars with 0 strokes] }
```

### Rendering rules
- Glyph point `(gx,gy)` → screen: `scale = capPx/NB_FONT.cap; X = penX + gx*scale; Y = baselineY - gy*scale`.
- `ctx.lineWidth = max(NB.MIN_PX, weightPx)`, `lineCap='round'`, `lineJoin='round'`.
- Wobble: reuse a deterministic hash (mirror `_sketchRand`/`_sketchHash` from
  `js/24-draw-primitives.js`) seeded from glyph index + codepoint so the same text always wobbles the
  same way. Subdivide each stroke segment ~ every 6px; fade jitter to 0 at stroke endpoints.
- `jitter` (draftsman): per glyph, offset baseline by `±jitter*0.10*capPx`, rotate `±jitter*1.5°`,
  scale `1 ± jitter*0.04`, all deterministic from glyph index. Subtle — it should read as a steady
  hand, not a shaky one.
- Fallback: if `nbGlyph(ch)` is null AND the char is printable, draw it with the canvas web font at
  the same cap height (`ctx.font = capPx+'px IBM Plex Sans'`) so unknown glyphs still appear.

`'use strict';` at top. `node --check` must pass. Include `nbStrokeFontSelfCheck` so we can verify
the alphabet is complete.

---

## 4. `js/97-v25-notebox.js` — entity geometry + render + DXF (NEW FILE, owner: agent-core)

Depends on `js/96` API (above) and on existing globals: `real2px`, `px2real`, `ppm`, `ctx`,
`v25EntColour(ent,cs)`, `v25EntOpacity(ent)`, `rFillPoly(blk, pts)`, `LW`, the `_dxf*` helpers.
(`v25EntColour`/`v25EntOpacity` exist in the v25 render code — mirror how `drawTxtBox2D` in
`js/70-v25-render.js` uses them.)

### Public API (FROZEN)
```js
function nbLayout(ent)        // pure; → { boxW, boxH, lines:[{text,wMm}], capMm, lineHMm, padMm, Wc }
function nbBoxRectReal(ent)   // → { uL, uR, vT, vB } using nbLayout
function nbAttachPoint(ent, tip)   // → {u,v} where a leader meets the box edge facing `tip`
function drawNoteBox2D(blk, ent, cs)      // the drawer registered in v25DrawEnt
function nbBounds(ent)        // → {L,R,B,T} tight to the box (+1mm pad) for hit-test
function nbHandles(ent)       // → [ {key,u,v,shape?} ] grips
function nbMove(ent, handle, du, dv)      // applies a grip/body drag
function nbAddArrow(ent, u, v)            // push a new arrow tip
function nbRemoveArrowNear(ent, u, v, tolMm)   // → true if one was removed
function nbDxfEmit(b, blk, ent)           // emit DXF (box lines + MTEXT per line + leaders + heads)
// NOTE: nbDefaultProps() lives in js/98 (§5), NOT here — it reads the v25Last defaults store.
```

### `nbLayout(ent)` algorithm
```
cap   = ent.sz || nbStyle(ent.style).sizeMm || NB.CAP_MM
lineH = cap * NB.LINEH
pad   = max(NB.PAD_MIN_MM, cap*NB.PAD_FACTOR)
raw   = (ent.text||'')
text  = (ent.textCase!=='normal') ? raw.toUpperCase() : raw
paras = text.split('\n')
measure(s) = style.font==='stroke' ? nbStrokeTextWidthMm(s,cap,style.letterSpacingMm)
                                   : webWidthMm(s,cap,style)          // canvas measureText @100px scaled
if ent.autoSize:
   natural = max over paras of measure(para)
   if natural <= NB.AUTO_MAXLINE_MM:  Wc = max(natural, smallest sensible)   // no extra wrapping
   else:  Wc = clamp( sqrt(sumWidth*lineH*NB.AUTO_ASPECT), NB.AUTO_MINW_MM, NB.AUTO_MAXLINE_MM )
   lines = wrap each para to Wc (greedy by word; a word wider than Wc overflows, no mid-word break)
   Wc = max measured line width across `lines`       // hug the text
   ent.boxW = Wc + 2*pad                              // write derived width back (autoSize only)
else:
   Wc = max(NB.MINW_MM, (ent.boxW||natural) - 2*pad)
   lines = wrap each para to Wc
boxH = lines.length*lineH + 2*pad
cache by signature (text|style|cap|boxW|autoSize) in a module WeakMap<ent,Object>
return { boxW: ent.boxW (or Wc+2pad), boxH, lines, capMm:cap, lineHMm:lineH, padMm:pad, Wc }
```
`webWidthMm(s,cap,style)`: set `ctx.save(); ctx.font = "100px "+family; w = ctx.measureText(s).width; ctx.restore();`
then `mm = w*cap/100 + (s.length-1)*letterSpacingMm`.

### `nbAttachPoint(ent, tip)`
Ray from box centre `C=((uL+uR)/2,(vB+vT)/2)` toward `tip`; intersect with the box rectangle; return
that boundary point (a clean attach centred on the facing side). If `tip===C`, return top-centre.

### `drawNoteBox2D(blk, ent, cs)`
```
col = v25EntColour(ent, cs);  prevA = ctx.globalAlpha; ctx.globalAlpha = prevA * v25EntOpacity(ent)
try {
  pm = ppm(); st = nbStyle(ent.style); lay = nbLayout(ent)
  TL = real2px(blk, ent.u, ent.v); wPx = lay.boxW*pm; hPx = lay.boxH*pm
  lwPx = mm => Math.max(NB.MIN_PX, mm*pm)
  ampPx = st.wobble ? Math.min(NB.WOBBLE_MAX_PX, st.wobble*pm) : 0
  // 1) outline (optional)
  if (ent.boxed) {
     ctx.strokeStyle=col; ctx.lineWidth=lwPx(st.boxLwMm); ctx.lineJoin='round'
     corners = [TL, TL+(wPx,0), TL+(wPx,hPx), TL+(0,hPx)] (closed)
     ampPx>0 ? nbWobbleStroke(ctx, corners.closed, ampPx, seedFrom(ent.id)) : crisp rect path stroke
  }
  // 2) leaders + arrowheads  (draw BEFORE text so text sits on top)
  for (i,a) of ent.arrows:
     att = nbAttachPoint(ent,a); A=real2px(blk,att.u,att.v); T=real2px(blk,a.u,a.v)
     ctx.strokeStyle=col; ctx.lineWidth=lwPx(st.leaderLwMm)
     ampPx>0 ? nbWobbleStroke(ctx,[A,T],ampPx,seedFrom(ent.id*97+i)) : line A→T
     drawArrowHead(blk, A, T, ent.arrowStyle, col, pm)   // see below
  // 3) text (skip while editing — textarea is the source of truth)
  if (!ent._editing):
     for (li, line) of lay.lines:
        lineTopPx = TL.y + lay.padMm*pm + li*lay.lineHMm*pm
        baseY = lineTopPx + lay.capMm*pm           // cap sits from baseline up
        x = TL.x + lay.padMm*pm
        if st.font==='stroke':
           nbStrokeText(ctx, line.text, x, baseY, lay.capMm*pm,
              { weightPx:lwPx(st.textWeightMm), color:col, letterSpacingPx:st.letterSpacingMm*pm,
                wobbleAmpPx:ampPx, jitter:st.jitter, seed:seedFrom(ent.id*131+li), align:'left' })
        else:  // plex web font
           ctx.font = st.weight+' '+(lay.capMm*pm)+"px "+st.family
           ctx.fillStyle=col; ctx.textAlign='left'; ctx.textBaseline='alphabetic'
           ctx.fillText(line.text, x, baseY)
} finally { ctx.globalAlpha = prevA; ctx.textAlign='start' }
```
`drawArrowHead(blk, A, T, kind, col, pm)`:
- `arrow`: unit vector `A→T`; filled triangle tip=T, base two points at `T - u*L ± n*HW`
  (L=ARROW_LEN_MM*pm, HW=ARROW_HW_MM*pm). Use `ctx.fill()` (build path in px). Slender + crisp.
- `dot`: filled circle radius `ARROW_DOT_MM*pm` at T.
- `open`: two strokes from T back along `±ARROW_OPEN_DEG`.
- `seedFrom(n)` = `Math.round(n)` (deterministic; passed to wobble).

### `nbHandles(ent)` (grips)
```
lay=nbLayout(ent); uL=ent.u; uR=ent.u+lay.boxW; vT=ent.v; vB=ent.v-lay.boxH; vMid=(vT+vB)/2
[ {key:'move', u:uL, v:vT},
  {key:'w-w',  u:uL, v:vMid},
  {key:'w-e',  u:uR, v:vMid},
  ...ent.arrows.map((a,i)=>({key:'arrow:'+i, u:a.u, v:a.v, shape:'circle'})) ]
```

### `nbMove(ent, handle, du, dv)`
```
if handle==='body' || handle==='move':
   ent.u+=du; ent.v+=dv; ent.arrows.forEach(a=>{a.u+=du; a.v+=dv})
else if handle==='w-e':
   ent.autoSize=false; ent.boxW=Math.max(NB.MINW_MM,(ent.boxW||nbLayout(ent).boxW)+du)
else if handle==='w-w':
   ent.autoSize=false; w0=(ent.boxW||nbLayout(ent).boxW); nw=Math.max(NB.MINW_MM,w0-du)
   ent.u += (w0-nw); ent.boxW=nw           // left edge follows the cursor; right edge fixed
else if handle starts 'arrow:':
   i=+handle.split(':')[1]; if(ent.arrows[i]){ ent.arrows[i].u+=du; ent.arrows[i].v+=dv }
```
(Caller requests render. `nbLayout` recomputes height/lines after a width change.)

### `nbBounds(ent)`
```
lay=nbLayout(ent); return { L:ent.u-1, R:ent.u+lay.boxW+1, B:ent.v-lay.boxH-1, T:ent.v+1 }
```

### `nbDxfEmit(b, blk, ent)`
Use `_dxfBlockPlace(blk,u,v)` → `{x,y}` then the existing helpers on layer `'S-NOTE'`:
- if `ent.boxed`: 4× `_dxfLine` around the box rect.
- per wrapped line: `_dxfText(b,'S-NOTE', x, y, line.text, lay.capMm)` (positions like the drawer,
  but DXF y is up — place each line's baseline; spacing = lineHMm).
- per arrow: `_dxfLine` attach→tip, then arrowhead as a small filled SOLID or 3 short `_dxfLine`s
  (a tiny triangle), or `_dxfCircle` for `dot`.
Text content is the cased text (uppercased when `textCase==='upper'`).

`'use strict';` at top. `node --check` must pass.

---

## 5. `js/98-v25-notebox-ui.js` — placement, inline editor, options bar, defaults (NEW FILE, owner: agent-ui)

Depends on §4 API, on `js/96`, and existing globals: `tool`, `shiftHeld`, `sheetMode`,
`activeBlock`, `entities2D`, `v25Add`, `v25Selected`, `requestRender`, `real2px`, `px2real`,
`ppm`, `v25UpdateInspector`, `v25UpdateOptionsBar`, `canvas`, the `#canvas-container` element, and
`v25Last` (the per-tool last-used store used across the options bar).

### Placement — `nbToolClick(blk, cu, cv, e)` → boolean (consumed?)
```
if shiftHeld AND a noteBox is currently selected: return nbSelectShiftClick(blk,cu,cv)  // add/remove arrow
if !nbPlace:                                   // FIRST click = box top-left
   nbPlace = { blk, u:cu, v:cv }; requestRender(); return true
else:                                          // SECOND click = arrow tip
   a = nbPlace; nbPlace = null
   arrows = (dist(a,(cu,cv)) < 3mm) ? [] : [ {u:cu, v:cv} ]
   ent = v25Add('noteBox', Object.assign(nbDefaultProps(), { u:a.u, v:a.v, text:'', autoSize:true, arrows }))
   v25Selected = [ent.id]
   nbOpenEditor(ent)                           // immediately edit, focus textarea
   requestRender(); return true
```
`nbPlace` is a global declared in `js/07-globals.js` (§7). The tool stays active after placing so
the user can place another note after committing (press `q` to re-arm if needed).

### Placement preview — `nbToolPreview(blk, cs)`
If `nbPlace && nbPlace.blk===blk`: draw a faint dashed ghost box at `nbPlace` (default ~`AUTO_MINW`
wide × one line tall) and a dashed rubber-band line from the ghost-box centre to the live cursor,
with a faint arrowhead — previewing the leader the second click will set. Read the live cursor from
the same source `drawClickPreview`/`drawCrosshair` use (`cursorSheet` / the block-local cursor the
crosshair already computes). Keep it lightweight.

### Shift-click arrows — `nbSelectShiftClick(blk, cu, cv)` → boolean
```
ent = the selected noteBox in this view (last id in v25Selected whose entity.type==='noteBox'); if none return false
tolMm = NB.HIT_TOL_PX / (viewport.zoom/drawingScale)
if nbRemoveArrowNear(ent,cu,cv,tolMm): requestRender(); return true   // shift-click an existing tip removes it
nbAddArrow(ent,cu,cv); requestRender(); return true                   // else add a new branch arrow
```

### Inline editor — `nbOpenEditor(ent)` / `nbCloseEditor(commit)`
- Create a `<textarea>` once (id `nbEditorTA`), append to `#canvas-container`, store state in the
  global `nbEditor = { ent, el, blk }` (§7). Mirror the size-picker teardown discipline in
  `js/58-size-picker.js` (mount, focus, Esc to close, deferred outside-click listener).
- Position/size each frame it's open: `TL=real2px(blk,ent.u,ent.v); lay=nbLayout(ent)`. Set
  `el.style.left/top` to `TL` + canvas offset, `width=lay.boxW*pm`, `font-size=lay.capMm*pm`,
  `line-height=lay.lineHMm*pm`, `padding=lay.padMm*pm`, `color=entityColour`, transparent/!subtle
  background, no border (or 1px dashed accent), `text-transform: uppercase` when `textCase==='upper'`.
  Font-family: `plex` → IBM Plex Sans; stroke styles → `'IBM Plex Mono', monospace` (a technical
  monospace stand-in so typing feels WYSIWYG; the committed canvas uses the true stroke font).
- Set `ent._editing = true` while open (drawer skips the text). On `input`: `ent.text=el.value`; if
  `ent.autoSize` recompute layout and resize the textarea to the box; `requestRender()`.
- Keys: `Enter` = newline; `Esc` or `Ctrl/Cmd+Enter` = commit; clicking outside = commit.
- Commit (`nbCloseEditor(true)`): `delete ent._editing`; if `ent.text.trim()===''` remove the entity
  from `entities2D[blk.viewKey]` (an empty note shouldn't persist); `nbEditor=null`; remove the
  textarea; `requestRender(); v25UpdateInspector?.(); v25UpdateOptionsBar?.()`.
- Style this fully inline in JS (like the options bar's `cssText`) — **no CSS file changes**.

### Double-click to edit — `nbOpenEditorAt(blk, cu, cv)` → boolean
Hit-test a noteBox at `(cu,cv)` (use `nbBounds`); if hit, `nbOpenEditor(hit)` and return true.

### Options bar — `nbOptionsBarHTML()` / `nbBindOptionsBar(bar)`
Surfaces the **defaults for the next note** (and live-applies to a selected note). Build with the
same `fld(label, innerHTML)` look as the other tools in `js/72`. Controls:
- Style: a 3-way segmented control / `<select id="nbo-style">` (Professional / Draftsman / Plex)
  bound to `v25Last.noteStyle`.
- Outline: `<input type="checkbox" id="nbo-boxed">` bound to `v25Last.noteBoxed`.
- Size mm: `<input type="number" id="nbo-sz" step="0.5">` bound to `v25Last.noteSz`.
- Arrow: `<select id="nbo-arrow">` (arrow / dot / open) bound to `v25Last.noteArrow`.
- A muted hint: `New notes use these · q to place · double-click to edit · Shift-click adds an arrow`.
`nbBindOptionsBar(bar)`: on any change → write `v25Last.note*`, call `nbSaveDefaults()`, and if a
noteBox is selected also set the matching field on it + `requestRender()` + `v25UpdateInspector()`.

### Defaults persistence — `nbDefaultProps()` / `nbLoadDefaults()` / `nbSaveDefaults()`
```
nbDefaultProps(): { style: v25Last.noteStyle||'professional',
                    boxed: (v25Last.noteBoxed!==false),
                    sz:    v25Last.noteSz||2.5,
                    arrowStyle: v25Last.noteArrow||'arrow',
                    textCase:'upper' }
nbLoadDefaults(): try localStorage 'sd2.noteDefaults' → assign into v25Last.note* (guarded)
nbSaveDefaults(): try localStorage.setItem('sd2.noteDefaults', JSON.stringify({style,boxed,sz,arrow}))
```
Call `nbLoadDefaults()` once at the bottom of this file (guard `typeof v25Last`).

`'use strict';` at top. `node --check` must pass.

---

## 6. Integration edits (one owner per existing file — thin, pinned)

> Each integration agent edits exactly ONE file, finds the right spot by the function names below,
> inserts the snippet, keeps it minimal, matches local style, and runs `node --check` on the file.
> Every call is `typeof`-guarded so load order can't break it.

### `js/07-globals.js` (owner: agent-globals)
Add near the other 2D tool-state globals:
```js
// Premium note / text-box tool (v25 'noteBox' entity — see js/96–98).
let nbPlace = null;   // {blk,u,v} first click (box top-left) during two-click placement
let nbEditor = null;  // inline text-editor overlay state {ent, el, blk}
```

### `js/42-keyboard.js` (owner: agent-keyboard)
In `initKeyboard`, in the single-letter tool block (next to the existing `'t' → setTool('text')`),
**inside** the guard that already prevents shortcuts while typing in an `INPUT`/`TEXTAREA`:
```js
if ((e.key === 'q' || e.key === 'Q') && sheetMode === '2d' && typeof v25SetTool === 'function')
  v25SetTool('v25-notebox');
```
(Verify the textarea guard exists; the inline editor is a `<textarea>` and `q` must type into it,
not switch tools.)

### `js/69-v25-dispatch.js` (owner: agent-dispatch) — TWO inserts
In `v25DrawEnt(blk, ent, cs)`, beside the other `if (ent.type===…)` lines:
```js
if (ent.type === 'noteBox' && typeof drawNoteBox2D === 'function') { drawNoteBox2D(blk, ent, cs); return true; }
```
In `v25TryHandleClick(blk, cu, cv, e)`, near the top of the tool branches:
```js
if (tool === 'v25-notebox') return (typeof nbToolClick === 'function') ? nbToolClick(blk, cu, cv, e) : false;
```

### `js/38-crosshair.js` (owner: agent-crosshair)
In the active-tool preview path (`drawClickPreview` or equivalent), add:
```js
if (tool === 'v25-notebox' && typeof nbToolPreview === 'function') nbToolPreview(blk, cs);
```

### `js/39-events.js` (owner: agent-events) — TWO behaviours
1. **Double-click edits a note.** In the canvas double-click handler (or `mousedown` with
   `e.detail===2`) while `sheetMode==='2d'`: compute block-local `(cu,cv)` the same way the existing
   2D click code does, then
   `if (typeof nbOpenEditorAt==='function' && nbOpenEditorAt(activeBlock, cu, cv)) return;`
2. **Shift-click adds/removes an arrow on a selected note in SELECT mode.** In the 2D select-click
   path, before it clears/!changes selection, when `shiftHeld`:
   `if (typeof nbSelectShiftClick==='function' && nbSelectShiftClick(activeBlock, cu, cv)) return;`
   (Only consumes when a noteBox is selected — the function returns false otherwise.)
Place both so they don't disturb existing tool routing; guard with `typeof`.

### `js/71-v25-selection.js` (owner: agent-selection) — FOUR inserts
- In `v25EntBounds(ent)`, before the final `return null;`:
  `if (ent.type === 'noteBox' && typeof nbBounds === 'function') return nbBounds(ent);`
- In `v25EntHandles(ent)`, right after `if (!ent) return out;`:
  `if (ent.type === 'noteBox' && typeof nbHandles === 'function') return nbHandles(ent);`
- In `v25Move(ent, handle, du, dv)`, at the very top (after any null guard, BEFORE the generic body
  translate):
  `if (ent.type === 'noteBox') { if (typeof nbMove==='function') nbMove(ent, handle, du, dv); return; }`
- In `v25UpdateInspector()`, add a branch alongside the other `else if (ent.type===…)` blocks (uses
  the local `txt/num/sel` closures):
  ```js
  } else if (ent.type === 'noteBox') {
    txt('Text', 'text', true);
    sel('Style', 'style', ['professional','draftsman','plex']);
    sel('Outline box', 'boxed', ['true','']);
    num('Text size (mm)', 'sz', 0.5);
    sel('Arrow', 'arrowStyle', ['arrow','dot','open']);
    sel('Case', 'textCase', ['upper','normal']);
  ```
  (`boxed` stored as `'true'`/`''` — truthiness matches the drawer. This mirrors how `reoBar`'s
  `cogStart` uses `['','true']`.)

### `js/72-v25-options-bar.js` (owner: agent-options)
In `v25UpdateOptionsBar()`, add a tool branch beside the others:
```js
} else if (tool === 'v25-notebox') {
  html += (typeof nbOptionsBarHTML === 'function') ? nbOptionsBarHTML() : '<strong>Note</strong>';
}
```
After `bar.innerHTML = html;` (where the other tools bind their inputs), add:
```js
if (tool === 'v25-notebox' && typeof nbBindOptionsBar === 'function') nbBindOptionsBar(bar);
```

### `js/74-v26-bb-rail.js` (owner: agent-bbrail)
In `getDrawTabDef()`, add a tile (new "Annotate" section, or into the existing notes/text group) —
reuse an existing text/leader SVG symbol id from the sprite (grep the file/`index.html` for
`icon-` ids; pick the most note/leader-like). The tile activates the tool:
```js
{ id:'v25-notebox', kind:'tool', label:'Note', icon:'<existing-icon-id>',
  onClick: () => { if (typeof v25SetTool==='function') v25SetTool('v25-notebox'); } }
```
Ensure the active-tile highlight (`highlightActiveTile`) keys off `id`/`tool` consistently with the
other tiles.

### `js/45-dxf-export.js` (owner: agent-dxf)
In `_dxfEmit2DEntity(b, blk, ent)`, add:
```js
else if (ent.type === 'noteBox') { if (typeof nbDxfEmit === 'function') nbDxfEmit(b, blk, ent); }
```

### `index.html` (owner: agent-index)
After the `js/74-v26-bb-rail.js` script tag, add (no font/link changes — the stroke font is
self-contained and `plex` uses the already-loaded IBM Plex Sans):
```html
<script src="js/96-stroke-font.js"></script>
<script src="js/97-v25-notebox.js"></script>
<script src="js/98-v25-notebox-ui.js"></script>
```

---

## 7. What NOT to touch / guardrails
- Do **not** modify or delete the legacy `text` / `note` / `mtext` / `leader2` / `txtBox` entity
  types or their drawers. Old saves must still load. We only ADD `noteBox`.
- Do **not** add autoload demos, floating buttons, pop-ups, or side panels. The BB-rail tile + the
  `q` key + the inline editor are the only surfaces.
- Do **not** add CSS-file rules; style the editor inline in JS.
- Do **not** add external fonts / CDN links. Stroke font is self-contained; `plex` reuses IBM Plex.
- Every cross-file call is `typeof`-guarded. Every new `.js` starts with `'use strict';`.
- Save/load is automatic (plain JSON of `entities2D`). Keep transient state off the entity (WeakMap
  cache; `_editing` cleared on close) so saved files stay clean.

## 8. Verification checklist (Phase 3 + manual)
- `node --check` passes on all three new files and all ten edited files.
- Coherence: every symbol referenced across files exists with the contract's name/signature; all
  eleven integration inserts are present; entity field names match §1 everywhere.
- `nbStrokeFontSelfCheck()` reports a complete alphabet (A–Z, 0–9, listed punctuation), no empties.
- Manual (browser, 2D mode): `q` → click box → click arrow → type → wraps to a tidy box; drag body
  to move (arrows follow); drag right/left mid grips to resize (text re-wraps, height re-fits); drag
  an arrow tip to re-point; Shift-click adds a second arrow; Shift-click a tip removes it; toggle
  Outline off (Bligh-Tanner leader-only look); flick Professional ↔ Draftsman ↔ Plex; set size;
  double-click re-edits; defaults persist for the next note; save → reload → identical; PDF (raster
  + vector) and DXF contain the note.
