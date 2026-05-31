# 02 — Design

The authoritative spec is **[`CONTRACT.md`](CONTRACT.md)**. This file is the human-readable
architecture summary + the mandatory Files-touched declaration.

## Architecture at a glance
A single new 2D-mode entity `type:'noteBox'` (a `_v25` entity), wired through the existing V25
lifecycle (defaults → tool dispatch → render hook → selection/grips → inspector → options bar →
save/load → DXF). All the substantial new logic lives in three new band-9 files; existing files get
only thin, `typeof`-guarded delegating inserts.

```
js/96-stroke-font.js     NEW  single-stroke vector font (data + renderer + measure + wobble)
js/97-v25-notebox.js     NEW  entity: layout/wrap, arrow geometry, drawNoteBox2D, bounds/handles/move, DXF
js/98-v25-notebox-ui.js  NEW  two-click placement, inline editor, shift-click arrows, options bar, defaults
```

- **Lettering** — one bespoke single-stroke font (`js/96`) renders both the `professional` (crisp)
  and `draftsman` (wobbled + jittered) styles; `plex` uses the already-loaded IBM Plex Sans. A
  data-driven `NB_STYLES` registry (`js/97`) makes adding a style a one-object change, and makes
  flicking + defaulting trivial.
- **Geometry** — box anchored at its top-left `(u,v)`; `nbLayout` wraps text and auto-fits the box
  to tidy proportions (or to a user-dragged width); leaders attach to the box edge facing each tip;
  arrowheads are slender, scale-true, AS-1100-weighted.
- **Interaction** — `q` arms the tool; two clicks place; inline `<textarea>` gives WYSIWYG editing
  with live re-wrap; grips move/resize/re-point; shift-click branches/removes arrows; double-click
  re-edits.
- **Output** — PDF raster (canvas rasterised — everything appears), PDF vector (stroke font draws as
  real vector lines via the canvas shim → crisp), DXF (box lines + MTEXT + leader/arrow geometry).
- **Defaults** — stored in `v25Last.note*`, persisted to `localStorage`; the options bar is the
  flick-and-set-default surface, the inspector is the per-note editor.

## Files touched (released app)

**New files**
- `js/96-stroke-font.js`
- `js/97-v25-notebox.js`
- `js/98-v25-notebox-ui.js`

**Edited files (thin inserts — see CONTRACT §6)**
- `js/07-globals.js` — `nbPlace`, `nbEditor` globals
- `js/42-keyboard.js` — `q` → `v25SetTool('v25-notebox')` (2D mode, inside the typing-guard)
- `js/69-v25-dispatch.js` — `v25DrawEnt` render branch + `v25TryHandleClick` tool branch
- `js/38-crosshair.js` — placement preview hook
- `js/39-events.js` — double-click-to-edit + select-mode shift-click-arrow hooks
- `js/71-v25-selection.js` — `v25EntBounds` / `v25EntHandles` / `v25Move` / `v25UpdateInspector` branches
- `js/72-v25-options-bar.js` — options-bar tool branch + bind
- `js/74-v26-bb-rail.js` — BB-rail "Note" tile
- `js/45-dxf-export.js` — `_dxfEmit2DEntity` branch
- `index.html` — three `<script>` includes (no font/CSS changes)
- `CHANGELOG.md` — one user-visible line

**Explicitly NOT touched:** `css/styles.css` (editor styled inline), legacy `text`/`note`/`mtext`/
`leader2`/`txtBox` drawers (kept for back-compat), the v2 plate path, any 3D-mode file.

## Conflict check vs in-flight ideas
Only other in-flight idea is `orientation-presets/`, which touches `index.html` (SVG sprite), `60`,
`69`, `72`, `styles.css`, and new `72b`. Overlap: `index.html`, `js/69`, `js/72`. The overlaps are
in **different functions** (orientation-presets edits the *member* options/placement in `69`/`72`
and the SVG sprite + member orientation row; this idea adds a *noteBox* tool branch in `69`/`72` and
three script tags in `index.html`). No conflicting intent on the same lines, but a build that lands
both should apply them as separate hunks. Currently `orientation-presets` is not being built in this
session, so no live conflict.
