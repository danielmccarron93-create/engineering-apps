# 02 — Design: entity schema, refactor, renderer dispatch, integration points

## Entity schema

```js
{
  type:         'bolt2',
  boltSize:     'M20',          // key into BOLT_DB; M12 minimum, M16/M20/M24/M27/M30/M36
  grade:        '8.8/S',        // '4.6/S' | '8.8/S' for v1; AS 4100 §9.3.2
  u:            <number>,       // bolt centre in paper-space, view-local
  v:            <number>,
  aspect:       'elev' | 'sec', // elev = head-on circle; sec = side profile
  rot:          <degrees>,      // 0 = bolt axis along +u for sec aspect; ignored for elev
  gripOverride: <number|null>,  // null = auto-grip via raycast; number = manual override
  washers:      'both',         // 'both' | 'head-only' | 'nut-only' | 'none' — v1 defaults to 'both'
  nutStyle:     'hex',          // 'hex' | 'half' | 'dome' — v1 always 'hex'; AS 1252
}
```

The `id` field is added by the entity factory (UUID) like every other 2D entity.

Defaults are M20 grade 8.8/S, aspect = sec, rot = 0, gripOverride = null, washers = 'both', nutStyle = 'hex'. The first time the Bolt tile is clicked in a session, these defaults apply; thereafter `lastUsedSection.bolt` (already declared in `dev/js/60-tile-palette.js` for the 3D-mode bolt), `lastUsedOrientation.bolt` (added by the `orientation-presets` build), and a new `lastUsedBoltGrade` track per-session memory.

## Refactor of the 3D bolt primitives (Phase 1)

In `dev/js/33-draw-bolt.js`:

**Collapse the two thread-zigzag functions** (lines 96 and 126) into one. New signature:

```js
function drawThreadAlongAxis(blk, cu, cv, startS, endS, rotRad, halfD, halfMin, realP)
```

`startS` and `endS` are signed distances along the bolt axis from `(cu, cv)`. `rotRad` is the axis angle in canvas radians (0 = along +u, π/2 = along +v). Inside the function, transform every endpoint through a 2×2 rotation before calling `rLine`. The two original functions become 4-line wrappers calling the new one with `rotRad = 0` and `π/2`.

**Collapse the two hex-polygon helpers** (lines 51 and 72) into one. New signature:

```js
function hexPointsAlongAxis(cu, cv, outerS, innerS, halfAF, rotRad)
```

Same rotation transform. The two original functions become wrappers.

**Collapse the two side-profile renderers** (`_drawBoltSectionA_V14` line 158 and `_drawBoltPlanB_V14` line 226) into one. New signature:

```js
function drawBoltSideProfile(blk, cu, cv, rotRad, b, gi, col, clCol, boltVisLW, boltCutLW, boltAlpha, pm)
```

The function uses the now-axis-agnostic primitives and `rRect` calls transformed through `rotRad`. The 3D callers at `drawBolt` line 333 and line 395 become two-line wrappers passing `rotRad = 0` and `π/2`.

**Verification:** open `dev/index.html`, draw a 3D model with a UB and a bolt through the web in both sectionA and planB blocks, take screenshots before and after the refactor. They must be pixel-identical (or sub-pixel — anti-aliasing on rotated draws can introduce tiny differences, in which case zoom in and confirm the geometry is the same).

## Auto-grip in 2D (Phase 2)

New function `computeBoltGripInfo2D(boltEnt, sheet)` in either `dev/js/21-bolt-grip.js` (next to the 3D version) or a sibling file. Returns the same shape as the 3D version: `{ grip, axisCentre, boltLen, threadProt }`.

Internally:
1. If `boltEnt.gripOverride` is set, short-circuit: `grip = gripOverride`, `axisCentre = (u, v)`, auto-length as usual.
2. Otherwise, scan every entity in `entities2D[boltEnt.viewKey]` (the current sheet) and call `rayMaterialAlongAxis2D(ent, boltEnt)` for each.
3. Each handler returns either `null` (ray misses) or an array of `[{ sLo, sHi }]` intervals in axis-local coordinates (signed distance from `(boltEnt.u, boltEnt.v)` along `rot`).
4. Merge intervals with the fabrication-gap tolerance (see `05-auto-grip-algorithm.md`), take outermost extents, return.

The per-host-type handlers for v1 are `plate2`, `mem2` UB/UC/WB, `mem2` PFC. Full algorithm and edge cases in `05-auto-grip-algorithm.md`.

## Renderer dispatch (Phase 2)

In `dev/js/68-v25-tools.js` add:

```js
function drawBolt2D(blk, ent, cs) {
  const b = BOLT_DB[ent.boltSize] || BOLT_DB.M20;
  const col   = v25EntColour(ent, cs);
  const clCol = cs.getPropertyValue('--cl-color').trim() || col;
  const pm = ppm();
  const cutLW = Math.max(1, LW.CUT * pm);
  const visLW = Math.max(0.5, LW.VIS * pm);

  if ((ent.aspect || 'sec') === 'elev') {
    // Head-on view — near-copy of 33-draw-bolt.js lines 312-331
    const p = real2px(blk, ent.u, ent.v);
    const r  = (b.d / 2)      * viewport.zoom / drawingScale;
    const wr = (b.washOD / 2) * viewport.zoom / drawingScale;
    const hr = (b.headAF / 2) * viewport.zoom / drawingScale;
    // ... washer ring, bolt hole, crosshair (paste & adapt from line 318)
    return;
  }

  // Side profile — auto-grip then render
  const gi = computeBoltGripInfo2D(ent);
  const rotRad = (ent.rot || 0) * Math.PI / 180;
  drawBoltSideProfile(blk, ent.u, ent.v, rotRad, b, gi, col, clCol, visLW, cutLW, 0.25, pm);
}
```

Dispatch added to the existing entity-draw switch in `dev/js/34-draw-2d.js` or wherever `drawEnt2D` dispatches by `ent.type` — add a case for `'bolt2'` calling `drawBolt2D`.

## Placement / preview / tool (Phase 2)

In `dev/js/69-v25-dispatch.js`:

**Add `v25SetBolt(size)` near `v25SetMember` (line 156):**

```js
function v25SetBolt(size) {
  v25SetTool('v25-bolt');
  v25State.boltSize  = size || lastUsedSection.bolt || 'M20';
  v25State.boltGrade = lastUsedBoltGrade || '8.8/S';
  v25State.aspect    = 'sec';
  v25State.rot       = 0;
  lastUsedSection.bolt = v25State.boltSize;
  if (typeof v25UpdateOptionsBar === 'function') v25UpdateOptionsBar();
  if (typeof highlightActiveTile === 'function') highlightActiveTile();
}
```

**Add the Bolt tile** to `getPaletteDef2D()` in the "Bolts & Anchors (B-)" group (around line 90):

```js
{ id: 'v25-bolt-2d', kind: 'bolt', label: 'Bolt',
  sub: lastUsedSection.bolt || 'M20', icon: 'icon-bolt', chord: 'B-L',
  onClick: () => v25SetBolt(lastUsedSection.bolt || 'M20'),
  picker: { kind: 'bolt' } },
```

**Extend the preview path** (around lines 806–826) to handle `tool === 'v25-bolt'`. The preview is a `bolt2` entity built from `v25State` at the cursor's (u, v); the renderer is called as normal so the preview shows the same auto-grip behaviour the placed bolt will have. As the cursor moves over different host material, the preview updates live.

**Extend the click handler** to commit the preview as a real entity:

```js
if (tool === 'v25-bolt') {
  return v25Add('bolt2', {
    boltSize:  v25State.boltSize,
    grade:     v25State.boltGrade,
    u: cu, v: cv,
    aspect:    v25State.aspect || 'sec',
    rot:       v25State.rot || 0,
    washers:   'both',
    nutStyle:  'hex',
  });
}
```

## Options bar (Phase 3)

In `dev/js/72-v25-options-bar.js` add a new branch:

```js
} else if (tool === 'v25-bolt') {
  const size  = v25State.boltSize  || 'M20';
  const grade = v25State.boltGrade || '8.8/S';
  html += `<strong>Bolt</strong>`;
  html += fld('Size',
    `<select id="v25o-boltsize">` +
    Object.keys(BOLT_DB)
      .filter(k => parseInt(k.slice(1), 10) >= 12)
      .map(k => `<option value="${k}"${k === size ? ' selected' : ''}>${k}</option>`)
      .join('') +
    `</select>`);
  html += fld('Grade',
    `<select id="v25o-boltgrade">` +
    BOLT_GRADES
      .map(g => `<option value="${g}"${g === grade ? ' selected' : ''}>${g}</option>`)
      .join('') +
    `</select>`);
  html += `<div id="v25OrientSlot"></div>`; // populated below
}
```

After `bar.innerHTML = ...`, inject `v25BuildOrientationRow('bolt2')` into the orient slot — same mechanism as the member orientation row from `orientation-presets`.

`BOLT_GRADES` is a new constant in `dev/js/03-data-bolts.js`: `const BOLT_GRADES = ['4.6/S', '8.8/S'];`

Wire the change events for `v25o-boltsize` and `v25o-boltgrade` further down the function.

## Orientation row catalogue entry

In `dev/js/72b-orientation-presets.js` (created by the `orientation-presets` build), add:

```js
V25_ORIENT.bolt2 = [
  { id: 'elev',        label: 'Head-on (elev)',          icon: 'icon-orient-bolt-elev',  aspect: 'elev', rot: 0   },
  { id: 'sec-right',   label: 'Section — head right',    icon: 'icon-orient-bolt-right', aspect: 'sec',  rot: 0   },
  { id: 'sec-left',    label: 'Section — head left',     icon: 'icon-orient-bolt-left',  aspect: 'sec',  rot: 180 },
  { id: 'sec-up',      label: 'Section — head up',       icon: 'icon-orient-bolt-up',    aspect: 'sec',  rot: 270 },
  { id: 'sec-down',    label: 'Section — head down',     icon: 'icon-orient-bolt-down',  aspect: 'sec',  rot: 90  },
];
```

`v25SetOrientation('bolt2', presetId)` already mutates `v25State.aspect` and `v25State.rot`; no new mechanism needed.

## Files touched (in released app) — full ledger

See the table in `README.md` "Files touched" section. Repeated and expanded here:

| Phase | File | What changes |
|---|---|---|
| 1 | `dev/js/33-draw-bolt.js` | Deduplicate U/V pairs into axis-agnostic primitives; 3D callers become wrappers. |
| 2 | `dev/js/21-bolt-grip.js` | Extract `rayMaterialAlongAxis2D` + per-host-type handlers (`plate2`, `mem2` UB/UC/WB, `mem2` PFC). Add `computeBoltGripInfo2D`. |
| 2 | `dev/js/68-v25-tools.js` | Add `drawBolt2D`. |
| 2 | `dev/js/34-draw-2d.js` | Add `'bolt2'` case to the entity dispatch. |
| 2 | `dev/js/69-v25-dispatch.js` | Add `v25SetBolt`, Bolt tile in palette, preview/click for `v25-bolt`. |
| 2 | `dev/js/05-state.js` | Declare `v25State.boltSize / .boltGrade / .gripOverride`. |
| 3 | `dev/js/03-data-bolts.js` | Add `BOLT_GRADES` constant. |
| 3 | `dev/js/72-v25-options-bar.js` | New branch for `v25-bolt`. |
| 3 | `dev/js/72b-orientation-presets.js` | Add `V25_ORIENT.bolt2` (created by the `orientation-presets` build). |
| 3 | `dev/index.html` | 5 new icon symbols for bolt orientations. |
| 3 | `dev/js/46-save-load.js` | Add `bolt2` to allow-list. Add `schemaVersion: 1` + migration scaffold. |
| 4 | `dev/js/71-v25-selection.js` | `bolt2` hit-test, grip handles. |
| 4 | `dev/js/59-inspector.js` | `bolt2` Inspector panel. |
| 4 | `dev/js/43-clipboard.js` | `bolt2` copy/paste. |
| 4 | `dev/js/45-dxf-export.js` | `bolt2` emission as DXF LINE / POLYLINE / ARC. |
| 4 | `dev/css/styles.css` | Free-space orange-dot indicator style. |

## Non-changes worth noting

- 3D mode bolt rendering after the Phase 1 refactor must be visually identical to before. This is a hard regression-test boundary, not a soft target.
- The V25 anchor tiles and their renderer stay untouched.
- `computeBoltGripInfo` for 3D mode stays untouched; `computeBoltGripInfo2D` is a parallel function.
- The connection builders in `dev/js/48-connection-builders.js` continue to emit 3D bolts. Making them emit `bolt2` on a 2D sheet is a separate planning conversation (flagged in `04-open-questions.md` Q5).
