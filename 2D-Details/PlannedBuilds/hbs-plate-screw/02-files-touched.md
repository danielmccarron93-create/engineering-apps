# HBS Plate Screw — files touched

For multi-build conflict detection (a parallel build session is active). All edits
are **additive** (new branches / new file / new tiles) so subset-commits stay clean.

| File | Change | New / Edit |
|---|---|---|
| `js/72i-v25-screw.js` | **NEW** — orientation presets, options-bar row, pick-and-set tool, one-sided bearing-face finder, section profile drawer (head + shank + thread + tip) | new file |
| `index.html` | add `icon-screw` + 5 `icon-orient-screw-*` SVG symbols; add `<script src="js/72i-v25-screw.js">` tag before 73-init; flip autoloader flag note | edit |
| `js/99-tmbr-autoload.js` | `TMBR_AUTOLOAD_EXAMPLE = false` (file already HTML-unwired) | edit |
| `js/69-v25-dispatch.js` | `v25DrawEnt` screw route; `v25TryHandleClick` `v25-screw` branch; `v25DrawPreview` screw ghost; `v25ActiveTileId` screw map | edit (additive) |
| `js/72-v25-options-bar.js` | `v25-screw` options branch; orient-row swap; size-select wiring | edit (additive) |
| `js/74-v26-bb-rail.js` | `d-screw` tile in the Members section | edit (additive) |
| `js/71-v25-selection.js` | `screw` cases in `v25EntBounds` / `v25EntHandles` / `v25HitHandle`; inspector field block | edit (additive) |
| `js/09-snap.js` | add `v25-screw` to the per-axis face-snap tool list | edit (1 token) |
| `js/45-dxf-export.js` | `screw` DXF branch (S-SCREW layer) | edit (additive) |
| `CHANGELOG.md` | one line | edit |

**Reused unchanged:** `js/02c-data-screws.js`, `js/02e-catalogue-lookups.js`,
`js/77-screw-entity.js` (`drawScrewEnt` for the end-on view + hit helpers),
`js/33-draw-bolt.js` (thread + polygon helpers).
