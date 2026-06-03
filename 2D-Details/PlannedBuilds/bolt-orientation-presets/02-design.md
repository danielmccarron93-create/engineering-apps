# 02 — Design

## New entity: `bolt2`

A V25 paper-space entity (parallels `mem2` / `anchor`), created via `v25Add` / `mkEnt2D` so it lands in `entities2D[viewKey]`.

| field | meaning |
|---|---|
| `type: 'bolt2'` | entity type |
| `view` | set by `mkEnt2D` — names the `entities2D` bucket it renders into |
| `u, v` | centre point (real-world mm) |
| `size` | `'M20'` etc. — key into `BOLT_DB` (`js/03-data-bolts.js`) |
| `grade` | `'8.8'` (default), `cat` `'S'` — carried for a future callout/label |
| `boltOrient` | preset id: `'end' \| 'h-nutR' \| 'h-nutL' \| 'v-nutB' \| 'v-nutT'` |
| `gripOverride` | optional manual grip (mm). When set, auto-detect is skipped |

Grip is **recomputed each render** from the on-page material (stays live if a plate moves), unless `gripOverride` is set. Save/load is automatic (plain JSON in `entities2D`).

## Orientation catalogue + row UI (mirror `72b`)

Kept in the **new file** (separate from `V25_ORIENT`, so the member feature is untouched):

```js
const V25_BOLT_ORIENT = [
  { id:'end',    label:'End-on (circle)',        icon:'icon-orient-bolt-end'   },
  { id:'h-nutR', label:'Horizontal — nut right', icon:'icon-orient-bolt-h-nutr'},
  { id:'h-nutL', label:'Horizontal — nut left',  icon:'icon-orient-bolt-h-nutl'},
  { id:'v-nutB', label:'Vertical — nut bottom',  icon:'icon-orient-bolt-v-nutb'},
  { id:'v-nutT', label:'Vertical — nut top',     icon:'icon-orient-bolt-v-nutt'},
];
```

`v25BuildBoltOrientationRow()` returns the icon-button row, reusing the `.v25-orient-btn` CSS and the SVG-sprite `<use href="#...">` pattern from `v25BuildOrientationRow` (`72b`). Clicking a button writes `v25State.boltOrient`, remembers it in `lastUsedOrientation.bolt`, refreshes the options bar (active-highlight) and kicks a render. The `boltOrient` id encodes both **axis** (`end`/`h`/`v`) and **nut side** — the renderer derives head/nut ends from it.

Five new SVG `<symbol id="icon-orient-bolt-*">` glyphs go in the `index.html` sprite — single-stroke, matching the existing `icon-orient-*` weight: a circle-crosshair for `end`, and small bolt side-profiles (head block + shaft + nut) mirrored/rotated for the four directional ones.

## Renderer — `drawBolt2D(blk, ent, cs)`

- **`boltOrient === 'end'`** → circle of washer/hole Ø + crosshair (reuse the elevation end-on look from `drawBolt`). No clamp.
- **horizontal / vertical** → side-view glyph clamped to the `v25BoltClampSpan` result:
  - hex head + hex nut via `hexPointsAlongU` / `hexPointsAlongV` (`js/33`),
  - threaded shank via `drawThreadAlongU` / `drawThreadAlongV` (`js/33`),
  - washers at the two clamp faces, dashed centreline (`DASH`),
  - head on one face, nut + washer + thread protrusion on the other — sides chosen by `boltOrient`.
- Lineweights from `LW`, dash styles from `DASH` (both `js/03-data-bolts.js`). No hand-rolled widths.

## Clamp detection — `v25BoltClampSpan(blk, ent)` (core new logic)

For `boltOrient === 'end'`: return `null` (draw circle, no clamp).

For section orientations the bolt axis is **axis-aligned** (horizontal for `h-*`, vertical for `v-*`):

1. **Candidate cull** — iterate `entities2D[blk.viewKey]`; keep entities whose `v25EntBounds(ent)` AABB straddles the bolt centreline on the transverse axis and spans the bolt position on the clamp axis.
2. **Per-entity along-axis material thickness:**
   - **member (`mem2`)** → `v25Mem2Thickness(ent)` (`js/68:1148`) — web thickness for UB/UC/WB/PFC, wall thickness for SHS/RHS/CHS. *This is the reuse that makes back-to-back PFC webs correct: each PFC contributes `tw`, not its bbox/channel depth.*
   - **v2 plate** → plate thickness `pt` (read via the v2 plate element / the `plate2` mirror that auto-weld already consumes — see open question Q2).
   - other types (blockWall, mat/hatch) → ignored in v1.
3. **Grip** = Σ thicknesses of the crossed material (adjacent clamp pack); the bolt is positioned spanning that grip, centred on the crossed-material centroid along the axis.
4. **Length** = `computeBoltLength(grip, size)` (`js/21`) → nearest standard `BOLT_LENGTHS` satisfying grip + 2·washer + nut + thread protrusion (same formula the 3D bolt uses).
5. **No material found** → fall back to a small default grip; the Inspector `gripOverride` is the correction path.

`gripOverride`, when present, replaces steps 1–3 (length still via `computeBoltLength`).

## Integration points / Files touched (in released app)

| File | What changes |
|---|---|
| **NEW `js/72c-v25-bolt.js`** | `V25_BOLT_ORIENT`, `v25BuildBoltOrientationRow()`, `v25PickAndSetBolt(size)`, `drawBolt2D()`, `v25BoltClampSpan()`. Band 9 (V25 2D-mode); sub-letter sibling of `72b`. `<script>` inserted after the `72b` line, before `73-init`. (~250–350 lines → justifies a new file.) |
| `index.html` | 5 `<symbol id="icon-orient-bolt-*">` glyphs in the SVG sprite; `<script src="js/72c-v25-bolt.js"></script>` after the `72b` tag (line ~1409). |
| `js/69-v25-dispatch.js` | (a) `boltOrient` default in `v25State`; (b) `if (ent.type==='bolt2'){ drawBolt2D(...); return true; }` in `v25DrawEnt` (line ~16); (c) `tool==='v25-bolt'` single-click placement branch (mirror `v25-anchor`, line ~483) creating `bolt2` via `v25Add`; (d) optional cursor preview ghost. |
| `js/72-v25-options-bar.js` | `else if (tool==='v25-bolt')` branch: Size picker (M12–M36), Grade/Cat, and a `#v25OrientSlot` placeholder; after `innerHTML`, replace the slot with `v25BuildBoltOrientationRow()` (mirror the `v25-mem` slot logic at lines ~169/197). |
| `js/74-v26-bb-rail.js` | `d-bolt` tile (line ~227): change the **2D-mode** branch to `v25PickAndSetBolt(lastUsedSection.bolt || 'M20')` instead of `selectMemberByBolt()`. 3D-mode branch unchanged. |
| `js/71-v25-selection.js` | `bolt2` in `v25EntBounds` (circle bounds for end-on; clamp-rect for section) + a `v25HitTest` branch. Minimal move grip for v1. |
| `js/59-inspector.js` | `bolt2` properties panel: size dropdown, orientation select (+ nut-side flip), grip auto/override + grip value. |
| `js/45-dxf-export.js` | `bolt2` emission: circle for end-on; hex polygons + sawtooth thread + centreline (LINE/POLYLINE/ARC) for section. |
| `CHANGELOG.md` | one line. |

Save/load (`46`) and clipboard (`43`) pick `bolt2` up automatically via the generic `entities2D` paths; PDF (`44`) picks up the shared draw fn. Verify both with a test sheet; only add an explicit allow-list entry if a filter drops unknown types.

### Reused (do not reinvent)
- `hexPointsAlongU/V`, `drawThreadAlongU/V`, `rPolygon`, `rFillPolygon` — `js/33-draw-bolt.js`
- `BOLT_DB`, `BOLT_LENGTHS`, `LW`, `DASH` — `js/03-data-bolts.js`
- `computeBoltLength(grip, size)` — `js/21-bolt-grip.js`
- `v25Mem2Thickness(ent)`, `v25Add` — `js/68`, `js/66`
- `v25EntBounds(ent)`, `v25HitTest` — `js/71-v25-selection.js`
- `mkEnt2D` — `js/05-state.js`
- `.v25-orient-btn` styling + sprite-icon pattern — `css/styles.css`, `js/72b`

### Two-mode requirement note
Per `CLAUDE.md`, structural members must work in both modes. Bolts already exist and clamp in **3D mode**; this build adds the **2D-mode** half (the orientation row is inherently 2D, since 3D orients from the model). So the two-mode obligation is satisfied — 3D bolts are intentionally untouched.
