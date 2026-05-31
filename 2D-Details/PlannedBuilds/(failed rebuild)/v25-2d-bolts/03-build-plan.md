# 03 — Build plan

Four phases, each one a focused session. Phase 1 is a pure refactor with zero behaviour change. Phases 2 and 3 deliver the user-visible feature. Phase 4 is polish and the export-pipeline integration.

Every phase ends with `node --check` on every edited file, a browser smoke-test through `dev/index.html` with the DevTools console clean, side-by-side screenshots against the quality bar (3D-mode bolt as the reference), and an entry in `CHANGELOG.md`.

---

## Phase 1 — refactor `dev/js/33-draw-bolt.js` to axis-agnostic primitives

**Goal:** unblock 2D by eliminating the U/V duplication in the existing 3D bolt code. Zero behaviour change in 3D.

Steps:
1. Add `hexPointsAlongAxis(cu, cv, outerS, innerS, halfAF, rotRad)`. Replace `hexPointsAlongU` and `hexPointsAlongV` with 4-line wrappers calling the new function at `rotRad = 0` and `π/2`.
2. Add `drawThreadAlongAxis(blk, cu, cv, startS, endS, rotRad, halfD, halfMin, realP)`. Replace `drawThreadAlongU` and `drawThreadAlongV` similarly.
3. Add `drawBoltSideProfile(blk, cu, cv, rotRad, b, gi, col, clCol, boltVisLW, boltCutLW, boltAlpha, pm)` using the new primitives. Replace `_drawBoltSectionA_V14` and `_drawBoltPlanB_V14` with wrappers passing `rotRad = 0` and `π/2`.
4. Inside `drawBolt` at lines 333 and 395, the call sites now delegate to the wrappers — behaviour unchanged.

Verification:
- `node --check dev/js/33-draw-bolt.js`.
- Load a saved 3D model project (any with bolts in section blocks). Screenshot a sectionA block and a planB block before the refactor (snapshot the current root index.html first into `archive/snapshots/` per `CLAUDE.md` workflow rule).
- After the refactor, take the same screenshots from `dev/index.html`. Pixel-diff — must be identical, or sub-pixel-only differences with the underlying geometry visibly unchanged.
- DevTools console clean.

If any pixel difference appears outside anti-aliasing tolerance, roll back the refactor — something is wrong with the rotation transform.

---

## Phase 2 — core 2D bolt: entity, renderer, auto-grip, tile, placement

**Goal:** Dan can click the Bolt tile on a 2D sheet, hover over a plate or a UB web in cross-section view, see the live preview, and place a bolt that visually matches the 3D-mode equivalent.

Steps:
1. Add `BOLT_GRADES` constant to `dev/js/03-data-bolts.js`.
2. Declare `v25State.boltSize / .boltGrade / .gripOverride` in `dev/js/05-state.js`.
3. Add `rayMaterialAlongAxis2D(ent, boltEnt)` to `dev/js/21-bolt-grip.js` with v1 handlers for `plate2`, `mem2` UB/UC/WB, `mem2` PFC. Per the algorithm in `05-auto-grip-algorithm.md`.
4. Add `computeBoltGripInfo2D(boltEnt)` that iterates `entities2D[boltEnt.viewKey]`, collects intervals from `rayMaterialAlongAxis2D`, merges with fabrication-gap tolerance, returns `{ grip, axisCentre, boltLen, threadProt }`.
5. Add `drawBolt2D(blk, ent, cs)` to `dev/js/68-v25-tools.js`. Dispatches on `ent.aspect`: `'elev'` → head-on circle (port of `33-draw-bolt.js` lines 312–331); `'sec'` → call `drawBoltSideProfile(blk, ent.u, ent.v, rotRad, b, gi, col, clCol, ...)`.
6. Add `'bolt2'` case to `drawEnt2D` in `dev/js/34-draw-2d.js`.
7. Add `v25SetBolt(size)` to `dev/js/69-v25-dispatch.js` near `v25SetMember` (line 156).
8. Add the Bolt tile to `getPaletteDef2D()` in the "Bolts & Anchors (B-)" group.
9. Extend the preview path (around lines 806–826 of `dev/js/69-v25-dispatch.js`) to render a live `bolt2` preview at the cursor. Extend the click handler to commit it.
10. Quick options bar in `dev/js/72-v25-options-bar.js`: add a temporary placeholder branch for `tool === 'v25-bolt'` that just shows the Size dropdown (full options bar comes in Phase 3).

Verification (this is the success-criteria-1 + 2 boundary):
- 360UB drawn in 2D-mode cross-section view via the Member tile. Click Bolt tile (default M20). Hover over the web — confirm preview shows the bolt with grip ≈ `tw` (around 8 mm) and the head/nut sitting right against the web faces. Click — entity placed, matches preview.
- Repeat over a 10 mm plate — grip = 10. Over a 2-plate stack (T-cleat case) — grip = 20 with both plates clamped.
- Repeat over free space — bolt commits with 12 mm default grip and the orange-dot indicator visible.
- Save the file (`.sd2.json`), reload, confirm the `bolt2` entities round-trip (basic save/load is automatic if `entities2D` is iterated generically; explicit allow-list comes in Phase 3 step 12).
- Side-by-side with a 3D-mode bolt through the same UB web — they must be visually indistinguishable except for any deliberate differences (e.g. 2D doesn't have the projection-line context the 3D detail block has).

---

## Phase 3 — orientations, grade, full options bar, save-format version

**Goal:** all five orientation presets work, grade is selectable, save format is versioned.

Steps:
11. Confirm `orientation-presets` build has shipped (or is being built in the same multi-build session). Add `V25_ORIENT.bolt2` entries to `dev/js/72b-orientation-presets.js` per `02-design.md`.
12. Author the 5 bolt orientation icons as inline SVG symbols in `dev/index.html`.
13. Replace the Phase 2 placeholder options-bar branch in `dev/js/72-v25-options-bar.js` with the full branch: Size dropdown (M12 floor), Grade dropdown, orientation row injection. Wire change events.
14. Add `bolt2` to the entity allow-list in `dev/js/46-save-load.js`. **In the same change, add `schemaVersion: 1` to the save format** and a one-line `if (data.schemaVersion !== 1)` migration scaffold (closes known issue #5 in `CLAUDE.md`). Saves written before this point have no `schemaVersion` field; treat absent as 0 and pass through unchanged.

Verification (success criteria 3 + 5):
- Click Bolt tile. Cycle through the five orientation presets in the row — confirm each rotates the cursor preview correctly and the auto-grip still resolves the right material at the new orientation.
- Place one bolt at each orientation. Save. Reload. All five round-trip identically.
- Switch grade from 8.8/S to 4.6/S — confirm the entity records the grade (visible in the Inspector once that lands in Phase 4; for Phase 3 verify via the saved JSON).

---

## Phase 4 — Inspector, hit-test, clipboard, DXF, polish

**Goal:** the bolt is a first-class entity in every workflow — editable, selectable, copyable, exportable.

Steps:
15. Add `bolt2` hit-test to `dev/js/71-v25-selection.js`. Elev: circle within washer OD. Sec: rectangle aligned to bolt axis (head AF × overall length). Add grip handles: centre move + rotate-90 grip on the head end.
16. Add `bolt2` panel to `dev/js/59-inspector.js`. Fields: size (dropdown M12+), grade (4.6/S | 8.8/S), aspect (elev | sec), rot (number), grip auto/override toggle, grip value (read-only when auto, editable when override), washers (both | head-only | nut-only | none), nut style (read-only "hex" for v1).
17. Add `bolt2` to `dev/js/43-clipboard.js` for copy / paste / paste-in-place.
18. Add `bolt2` emission to `dev/js/45-dxf-export.js`. Hex polygons as DXF POLYLINE, threaded sawtooth as DXF LINE segments, centreline as DXF LINE with `DASH.CL_BOLT` mapped to the closest DXF linetype.
19. Add the orange-dot indicator style to `dev/css/styles.css`.
20. (Optional polish) wire `place-bolt-callout` so a click on a placed `bolt2` drops the "<n>/M<size> <grade> BOLTS w/ STD WASHERS" callout text via leader. This may be a separate small change; skip if it grows past 30 minutes.
21. Update `CHANGELOG.md`: "2D mode: new through-bolt entity with auto-grip across plates, UB/UC/WB and PFC webs/flanges. AS 1101 side profile, AS 1252 catalogue. Defaults to M20 8.8/S. Save format now schema-versioned (schemaVersion: 1)."

Verification (success criteria 4 + 6 + general polish):
- Select a placed bolt — confirm hit-test works in both aspects.
- Edit grade in Inspector — confirm change persists.
- Toggle grip override — confirm manual value overrides the raycast result.
- Copy/paste — bolt copies cleanly.
- DXF export — open the resulting DWG in a CAD tool (or `dev/index.html`'s own DXF re-import if available) — confirm geometry is intact and selectable as native entities.
- Open the saved `.sd2.json` in a text editor — confirm `schemaVersion: 1` field is present.
- Run the full Phase 1 visual regression once more — 3D-mode bolts must still render identically.

---

## Progress tracker

Update after every phase:

- [ ] Phase 1 — refactor 33-draw-bolt.js to axis-agnostic primitives (3D regression-tested)
- [ ] Phase 2 — bolt2 entity + renderer + auto-grip + tile + live preview + placement
- [ ] Phase 3 — orientation row + grade dropdown + save schemaVersion: 1
- [ ] Phase 4 — Inspector + hit-test + clipboard + DXF + polish

## Phase boundary gates (don't skip)

- **End of Phase 1:** 3D bolt visual regression test. If anything changed, stop and fix before Phase 2.
- **End of Phase 2:** Reproduce the screenshot 3 scenario (bolt through 360UB web) in 2D mode. Must be visually indistinguishable from the 3D-mode equivalent. If not, the auto-grip or the renderer is wrong.
- **End of Phase 3:** Save format migration tested both forward (new save → load in same version) and backward (old save without `schemaVersion` → load cleanly with no errors).
- **End of Phase 4:** DXF export round-trip if possible. At minimum, open the DXF in a viewer and confirm the hex polygons, threads, and centreline are visible and the right scale.
