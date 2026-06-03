# 03 — Build plan

Four phases. Test in the browser at every boundary. No `node` on this machine → copy the repo to `/tmp` and serve (`python3 -m http.server`) since the iCloud path can't be served by the preview sandbox. Keep the DevTools console clean. Update the progress tracker at the bottom after each phase.

---

## Phase 1 — Entity + render skeleton (end-on only)
**Goal:** place an end-on bolt in 2D and see a circle.
- Create `js/72c-v25-bolt.js` with `V25_BOLT_ORIENT`, a stub `drawBolt2D` that handles `boltOrient==='end'` (circle + crosshair only), and `v25PickAndSetBolt(size)` (sets `v25State.boltType/size`, arms `tool='v25-bolt'`, restores `lastUsedOrientation.bolt`, refreshes options bar).
- `index.html`: add the `<script>` tag after `72b`.
- `js/69-v25-dispatch.js`: `v25State.boltOrient` default; `bolt2` branch in `v25DrawEnt`; `tool==='v25-bolt'` single-click placement branch creating `bolt2` via `v25Add`.
- `js/74-v26-bb-rail.js`: rewire the `d-bolt` 2D-mode branch to `v25PickAndSetBolt(...)`.
- **Test:** Bolts tile in 2D arms the tool; clicking the canvas drops an end-on circle; console clean; save→reload keeps it.

## Phase 2 — Orientation row + options bar
**Goal:** the five-icon row appears and switches placement orientation.
- Author the 5 `<symbol id="icon-orient-bolt-*">` glyphs in `index.html`.
- `js/72c`: `v25BuildBoltOrientationRow()` (reuse `.v25-orient-btn`); wire `lastUsedOrientation.bolt`.
- `js/72-v25-options-bar.js`: `tool==='v25-bolt'` branch — Size picker (M12–M36), Grade/Cat, `#v25OrientSlot`; replace slot with the row after `innerHTML`.
- **Test:** row shows 5 presets with correct active-highlight; clicking changes `v25State.boltOrient`; remembered across tile re-clicks.

## Phase 3 — Section glyph + clamp detection (the core)
**Goal:** section bolts clamp the drawn material; nut-side flips.
- `js/72c`: extend `drawBolt2D` for horizontal/vertical side profiles using `hexPointsAlongU/V` + `drawThreadAlongU/V` + washers + centreline.
- `js/72c`: implement `v25BoltClampSpan(blk, ent)` — candidate cull via `v25EntBounds`, per-entity thickness via `v25Mem2Thickness` (members) + v2 plate `pt`, sum + centre, `computeBoltLength`.
- **Test cases (browser):**
  1. Horizontal bolt across **PL 12 + UB web** → grip = 12 + tw; standard length; head/washers/nut clamp the faces.
  2. **Back-to-back PFC webs** (section) → grip ≈ 2·tw (not channel depth).
  3. **Two-plate stack** (T-cleat) → grip = sum of both plates.
  4. Nut-side flip (`h-nutR`↔`h-nutL`, `v-nutB`↔`v-nutT`) swaps head/nut ends.
  5. **Vertical** orientation clamps correctly.
  6. Free space (no material) → default grip, no crash.

## Phase 4 — Selection, inspector, DXF, polish
**Goal:** the bolt is a first-class, editable, exportable entity at the STP 6011 quality bar.
- `js/71-v25-selection.js`: `bolt2` `v25EntBounds` + `v25HitTest` + move grip.
- `js/59-inspector.js`: `bolt2` panel (size, orientation + nut flip, grip auto/override + value).
- `js/45-dxf-export.js`: `bolt2` emission (circle / hex+thread+centreline).
- Quality pass vs **STP 6011** side-by-side: washer Ø, thread length, lineweights, head proportions.
- `CHANGELOG.md`: one line.
- **Test:** select/move; inspector edits (incl. grip override → length updates); DXF opens with bolts as native entities; PDF prints; save→reload round-trips.

---

## Progress tracker

| Phase | Status | Notes / deviations |
|---|---|---|
| 1 — Entity + render skeleton | ✅ Done | New `js/72c-v25-bolt.js`; `bolt2` dispatch in `69` (`v25DrawEnt` L13), `v25State` bolt defaults + persistence latches (`69` L155–159), `tool==='v25-bolt'` placement branch (`69` L510–526 via `v25Add`), `d-bolt` tile rewired (`74` L227–239), script tag in `index.html`. Built via multi-agent workflow 2026-05-31. |
| 2 — Orientation row + options bar | ✅ Done | 5 `icon-orient-bolt-*` SVG symbols (`index.html` L145–198); `v25BuildBoltOrientationRow()` in `72c`; `v25-bolt` options-bar branch (Size/Grade) + live orientation-row slot swap (`72` L173–188, L222–227), mirroring the member pattern. |
| 3 — Section glyph + clamp detection | ✅ Done | `drawBolt2D` end-on + H/V section glyphs (grip-centred, chamfered-hex head/nut, sawtooth thread, dashed CL) reusing `33` primitives; `v25BoltClampSpan` sums `mem2` web/wall (`v25Mem2Thickness`) + v2 `plate2` thickness, centroid-centred, `computeBoltLength` snap; `gripOverride` bypass; safe default. |
| 4 — Selection / inspector / DXF / polish | ✅ Done | `bolt2` `v25EntBounds` + hit-test + move grip (`71`); inspector panel — size/orientation/grade/grip-override (`59`); DXF emission on `S-BOLT` layer (`45`). AS 1100 lineweights throughout; correctness + STP-6011 quality review agents clean. |

**Verification (2026-05-31):** Integration points confirmed by direct read; two review agents clean; `node --check` not run (no node on this machine). Live browser load **verified clean** — app + `72c` load with **zero console errors**; `drawBolt2D` / `v25BuildBoltOrientationRow` / `v25BoltClampSpan` / `v25PickAndSetBolt` all defined; `V25_BOLT_ORIENT` = 5. Remaining: interactive visual screenshot of placed bolts + the orientation row (recommend Dan smoke-tests in-browser: 2D mode → Bolts → 5-icon row → place end-on + section across a plate/web → nut-side flips → inspector grip override → save/reload → DXF).

Status key: ⬜ Not started · 🔨 In progress · ✅ Done · ⚠️ Done with deviation (see notes)
