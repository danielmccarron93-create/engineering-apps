# 03 — Build plan

Test in the browser at every boundary. No `node` on this machine → copy the repo to `/tmp` and serve (`python3 -m http.server`); the iCloud path can't be served by the preview sandbox. Keep the DevTools console clean. Update the progress tracker after each phase.

Built via multi-agent **workflow** (mirroring the bolt feature). The two workstreams are file-disjoint, so implementation fans out; a review phase checks cross-file consistency against the `02-design.md` contracts; the orchestrator integration-reads + browser-verifies (workflow agents can't drive the browser).

---

## Phase 1 — Drag overhaul (smooth + free + Shift-ortho guide + face snap)
**Goal:** a placed plate moves smoothly and freely; Shift locks to ortho with a dotted guide; it softly snaps to a member face; corner-resize stays ortho-by-default.
- `js/v2/engine/event-dispatch.js` — raw cursor in `viewToModel` while an edit-plate drag is live (A1).
- `js/v2/tools/edit-plate.js` — invert body-move ortho (free default, Shift lock + `orthoAxis`); `computeBodySnap` soft face-snap + `snapLines`; `render2D` per-move (no 3D dirty); edge-fallback body selection. Vertex/resize ortho unchanged (A2/A3).
- `js/v2/ui/live-render.js` — `drawV2PlateDragGuides` (dotted ortho guide + snap indicators) after `drawV2PlateSelection` (A4).
- **Test:** place a plate; drag it — smooth, free, no grid hop, no lag; hold Shift → locks H/V + dotted guide; drag a vertical cleat toward a UB web → near edge snaps to the web face + indicator line; drag away → releases; drag a corner → still ortho by default, Shift frees it; rotate handle still works; console clean.

## Phase 2 — Orientation model + vertical cleat + auto-select
**Goal:** the Plate tool supports three orientations and auto-selects the plate after placing.
- `js/v2/tools/place-plate-tool.js` — `elevation|h-cleat|v-cleat`, `verticalCleatPolygon`, cleat-mode generalisation, `selectAfterPlace` (B1).
- `js/v2/ui/palette-bb-rail.js` — default `activePlateOrientation = 'elevation'` + legacy map (B5).
- **Test:** each orientation places correctly (elevation = free rect/poly; h-cleat = thin horizontal strip of the chosen thickness; v-cleat = thin vertical strip); after a commit the tool releases and the new plate is selected & immediately draggable; Esc still cancels an in-flight placement.

## Phase 3 — Orientation icon row + thickness (the UI)
**Goal:** the three-icon row appears in the quick-options bar; thickness kept at 12 mm.
- NEW `js/72d-v25-plate.js` — `V25_PLATE_ORIENT` + `v25BuildPlateOrientationRow()` (B2).
- `index.html` — 3 `icon-orient-plate-*` symbols + `<script>` tag after `72c` (B3).
- `js/72-v25-options-bar.js` — orientation `<select>` → `#v25OrientSlot` row; thickness always enabled; slot swap before the early return (B4).
- **Test:** arm Plate in 2D → three icons (Elevation / H-cleat / V-cleat) with correct active highlight; clicking one switches placement orientation (and resets any half-built geometry); thickness shows 12 mm and is selectable; switching thickness changes the cleat strip dimension; icons read cleanly at the STP-6011 bar (single-stroke, AS 1100 weight).

## Phase 4 — Integration + verification + polish
**Goal:** everything works together at the quality bar.
- Cross-file consistency review (state field names, orientation ids, fn/icon names) against `02-design.md`.
- Browser end-to-end: place each orientation, drag/snap, Shift-ortho guide, corner resize, rotate, save→reload round-trip, a DXF + PDF smoke check.
- `CHANGELOG.md` — one line.
- Quality pass vs STP 6011 (cleat lineweights, snap subtlety, guide subtlety, icon clarity).

---

## Progress tracker

| Phase | Status | Notes / deviations |
|---|---|---|
| 1 — Drag overhaul | ⬜ Not started | |
| 2 — Orientation model + auto-select | ⬜ Not started | |
| 3 — Orientation icon row + thickness | ⬜ Not started | |
| 4 — Integration + verification | ⬜ Not started | |

Status key: ⬜ Not started · 🔨 In progress · ✅ Done · ⚠️ Done with deviation (see notes)
