# HBS Plate Screw — progress

**Status: COMPLETE** (2026-06-03). All phases done + verified in-browser (no console errors).

| Phase | What | Status |
|---|---|---|
| 0 | Review (workflow) + decisions + planning folder | ✅ done |
| 0b | Neutralise autoloader (flag → false; already HTML-unwired) | ✅ done |
| 1 | New module `js/72i-v25-screw.js` (presets, row, pick, bearing-face, section drawer) | ✅ done |
| 2 | Icons + script tag in `index.html` | ✅ done |
| 3 | Dispatch wiring `js/69` (draw route, click branch, preview ghost, active-tile) | ✅ done |
| 4 | BB-rail tile `js/74` (`d-screw` in Members) | ✅ done |
| 5 | Options bar `js/72` (`v25-screw` branch + row swap + wiring) | ✅ done |
| 6 | Snap `js/09` (`v25-screw` in face-snap list) | ✅ done |
| 7 | Selection + inspector `js/71` (bounds / handles / hit / field block) | ✅ done |
| 8 | DXF `js/45` (`screw` branch, S-BOLT layer) | ✅ done |
| 9 | Browser test (place, orient, face-snap, select, options, no errors) | ✅ done |
| 10 | CHANGELOG + hand to Dan | ✅ done |

## Verification (browser, served from /tmp copy, launch config `sd-screw`)
- Clean load, no console errors; all new globals defined; 18-size catalogue present.
- **Section geometry numerically exact** (HBSPL12200, h-headL): head top u=280.5 (=junction−t1),
  pan cap → u=286.1, taper to shank at junction u=300; shank ±dS/2; thread u=320.5→466.1 with
  crest d/2=6.0 (proud of shank) + root d2/2=3.65; tip taper to point at u=L=480.5; centreline.
- **Bearing snap exact**: v-headT above a plate → head lands on plate TOP face (v=320);
  v-headB below → BOTTOM face (v=300); click 580 mm away (>400 mm window) → null (no snap).
- **End-on**: head circle + Torx X + dashed clearance/shank ring (reuses `drawScrewEnt`).
- **UI**: HBS tile in Members palette (screw icon); arms `v25-screw`; options bar shows
  grouped Size select (Ø8 TX40 / Ø10 TX40 / Ø12 TX50, labels "Ø8 × 60") + 5-button orientation row;
  tile highlight (`d-screw`); `lastUsedSection.screw` persists.
- **Selection**: bounds correct, hit-test finds the screw, body grip; inspector shows
  Size (18) + Orientation (5) selects.

## Deferred (next builds, as scoped)
- Cleat rules (too-thick-plate red highlight, min edge distances / spacings — data already in `02d`).
- The `connection` grouping + rule-engine UI (`78`/`79`).
- 3D-mode tile + iso geometry (the two-mode rule's other half).

## Notes / deviations
- State flow: screw sets `v25State.screwSpec/screwOrient` *after* `v25SetTool`; persists via
  `lastUsedSection.screw` / `lastUsedOrientation.screw` — no edit to the `v25SetTool` latch
  machinery (cleaner than the bolt, lower collision with the parallel build session).
- DXF on the existing **S-BOLT** layer (no new layer-table entry needed).
- No `node` locally → syntax verified via clean browser load (parse errors would surface in console).
