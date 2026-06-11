# Section rotation — free tilt for sec-aspect members + fixings

```
Status: 🔨 Building
Last touched: 2026-06-10
Owner: Dan McCarron
Scope: Make the SETTINGS-panel Rotation° field freely tilt 2D-mode section glyphs (every mem2 memberType) and the four 2D fixings (bolt2 / screw / stud / anchor), to suit inclined wall sheeting, raking braces and sloping soffits.
```

**Planned 2026-06-10, building in same session.**

## User story

Dan is detailing an inclined wall-sheeting connection. He double-clicks an SHS drawn
in **section** aspect (a cross-section glyph) — the generic dblclick branch in
`js/39-events.js:1586-1594` selects it and opens the left SETTINGS panel. He types
**30** into the existing **Rotation°** field (`js/71-v25-selection.js:2729`) and the
SHS glyph tilts 30° on the paper — square becomes diamond-ish — with its hatch-free
walls, inner-wall lines and centrelines all riding the same spin. Hit-test, selection
halo, snap corners, depth-order occlusion and DXF all follow the tilted glyph.

The same works for:

- **Every `mem2` memberType** — `ub`, `uc`, `wb`, `pfc`, `shs`, `rhs`, `chs`, `glt`
  (incl. GLT grain, notches and voids, which ride the member's local frame).
- **Every 2D fixing** — `bolt2`, `screw` (both the HBS and the new VGS family —
  both section drawers in `js/72i`), `stud` (the Rotation° row they already show
  via the generic inspector fallback at `js/71-v25-selection.js:2906-2908` stops being
  a dead control) and `anchor` (already rotates — `js/68-v25-tools.js:319-336`; this
  build fixes its rotation-blind marquee bounds).

The discrete **Roll° (axis)** select (0/90/180/270, `js/71:2727`) keeps its meaning:
it picks the base face/spin preset. **Rotation° composes on top of roll** for section
glyphs. A sec glyph also gains the same perpendicular **rotate ball** drag handle that
elevation members / CLT / mats already have (45° snaps, Shift = free), which is the
only *undoable* rotation surface (panel edits don't push undo — pre-existing).

## Why now

The gap is one line: `drawMem2D` ignores `ent.rot` for sec glyphs whenever `ent.roll`
is set (`js/68-v25-tools.js:774`). Everything else is making the geometry consumers
(outline, hit, bounds, snaps, notch frame, DXF, fixings) agree with the renderer.

## Files in this folder

- `README.md` — this file.
- `02-design.md` — **the build contract**: data-model rule, shared helpers, file-by-file edit plan, files touched, non-goals.
- `03-test-plan.md` — numbered machine-checkable test cases with expected numeric outcomes.
