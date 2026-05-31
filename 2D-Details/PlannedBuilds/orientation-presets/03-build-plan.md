# 03 — Build plan

Four phases. Each phase ends with a node syntax check on every new/edited JS file, a browser smoke-test through `dev/index.html` with the DevTools console clean, and an entry in the CHANGELOG.

## Phase 1 — orientation catalogue + row component (no UI integration yet)

Create `dev/js/72b-orientation-presets.js` containing:
- `let lastUsedOrientation = {};` declared at the top.
- `const V25_ORIENT = { ... }` with the full catalogue for UB / UC / WB / PFC / SHS / RHS / CHS per `02-design.md`. EA/UA entries left as `[]` placeholders with a TODO comment.
- `v25BuildOrientationRow(memberType)` returning an `HTMLDivElement`.
- `v25SetOrientation(memberType, presetId)` mutating `v25State` + `lastUsedOrientation` and calling `v25UpdateOptionsBar` + `requestRender`.

Move the `lastUsedOrientation` declaration to `dev/js/60-tile-palette.js` next to `lastUsedSection` (per the file-touched list — the variable is conceptually a sibling of `lastUsedSection`).

Add the new script tag to `dev/index.html` between `72-v25-options-bar.js` and `73-init.js`.

Add CSS rules for `.v25-orient-btn` (and `.v25-orient-btn.active`) to `dev/css/styles.css`. Style as 32×32 square icon button, 1px border using `--border` token, 4px padding, hover lifts to `--surface-3`, active uses `--accent` background.

Verification:
- `node --check dev/js/72b-orientation-presets.js`.
- Open `dev/index.html`, switch to a 2D sheet, type `v25BuildOrientationRow('pfc')` in the console — confirm it returns a `<div>` with 6 buttons.
- Console must stay clean.

## Phase 2 — wire into the quick-options bar (placeholder icons)

Edit `dev/js/72-v25-options-bar.js`:
- Remove the Aspect `<select>` (lines 73–78) and the PFC Open-face `<select>` (lines 83–91) from the `v25-mem` branch.
- After the Section/Pick row, inject `<div id="v25OrientSlot"></div>`.
- After `bar.innerHTML = ...`, replace the placeholder with `v25BuildOrientationRow(mt)`.
- Remove the corresponding `wire('v25o-aspect', ...)` and `wire('v25o-openside', ...)` handlers further down.

Edit `dev/js/69-v25-dispatch.js`:
- In `v25SetMember` (line 156), after setting `v25State.section`, apply `lastUsedOrientation[type]` if present by calling `v25SetOrientation(type, lastUsedOrientation[type])` instead of mutating `v25State.aspect` directly.
- In the placement handler (around line 464 where the entity `props` are built), add `rot: v25State.rot || 0` to the `props` object.

Use placeholder icons for Phase 2 — re-use the existing `#icon-ub` / `#icon-pfc` / `#icon-shs` / `#icon-rhs` / `#icon-chs` for every preset in that type's row. They'll all look the same per type but the wiring is testable.

Verification:
- `node --check` on the two edited files.
- Open `dev/index.html`, switch to a 2D sheet, click the UB tile — confirm 3 buttons appear in the bar.
- Click each — confirm the cursor preview updates (web-vertical vs web-horizontal vs elevation).
- Click the PFC tile — confirm 6 buttons appear and each maps to a distinct `(aspect, rot, openSide)` triple. Verify by placing one of each on the canvas and confirming the renderer shows the expected orientation.
- Confirm `lastUsedOrientation` persists across tile re-clicks within the session (UB → other tile → UB should reopen at last orientation).
- DevTools console clean.

## Phase 3 — author the orientation icons

Hand-author ~22 inline SVG symbols (3 UB-family + 6 PFC + 3 SHS + 3 RHS + 3 CHS + 4 placeholder spots for EA/UA when Dan confirms). Each icon is 24×24 viewBox, single stroke, no fill, matches the visual weight of the existing `#icon-ub` / `#icon-pfc`. Suggested approach:

- Elevation icons show the member outline as drawn at long length:long axis horizontal.
- Section icons show the cross-section profile (I, C, square, rectangle, circle).
- PFC elevation distinguishes toes-away (solid lines) vs toes-toward (dashed open-face edge).
- PFC section orientations rotate the C-shape 0° / 180° / 90° / 270°.

Add each as a `<symbol id="icon-orient-...">` block at the top of `dev/index.html` inside the existing SVG sprite.

Update the `icon` field of every entry in `V25_ORIENT` to point to the real symbol id.

For PFC elevation toes-toward, also extend the renderer in `dev/js/68-v25-tools.js` (PFC elevation branch — currently identical to UB) to draw the open-face edge as a dashed AS 1100 hidden line. Approximately 6 lines of new code.

Verification:
- Open `dev/index.html`, hover each button — confirm the tooltip label matches the icon.
- Compare a placed PFC at "toes toward" with one at "toes away" — confirm the dashed-edge convention is visible.
- Compare against the corresponding STP 6011 detail visually.

## Phase 4 — polish

- Confirm the active-button highlight visually distinguishes the chosen preset (vs hover state).
- Add a tiny "Rotate 90°" affordance on the active button (a `↻` icon that rotates `rot` by 90° in place) — handy for users who want a non-standard angle off a preset.
- Make sure undo (`Ctrl+Z`) doesn't get confused by the orientation row changes (it shouldn't — orientation changes only mutate `v25State`, which isn't on the undo stack).
- Update `CHANGELOG.md` with one line: "2D mode: orientation row replaces Aspect dropdown for members."

## Progress tracker

Update after every phase:

- [x] Phase 1 — catalogue + row component + CSS + script tag (verified 2026-05-30: node --check clean; browser globals + counts correct; row returns 6 PFC / 3 UB / 0 EA buttons; console clean; dropdowns still live = parity intact)
- [x] Phase 2 — wire into options bar with placeholder icons (verified 2026-05-30: node --check clean on 72-v25-options-bar.js + 69-v25-dispatch.js; browser — Aspect + PFC Open-face dropdowns replaced by the Orientation row, 3 UB / 6 PFC buttons; real DOM button-click updates v25State.aspect/rot/openSide + moves the active highlight; lastUsedOrientation restored on tile re-pick (UB→PFC→UB reopens at web-horiz); placed cross-sections carry rot 90 / 0 and openSide '-v' and render visibly rotated; console clean). Note: the elevation two-click path keeps its drag-angle rot — the preset rot only drives cross-section placement. Plan's `dev/` paths are stale; edited the real js/ tree.
- [x] Phase 2.5 — full elevation + section orientation matrix (added 2026-05-30 from Dan's sketch review; plan at `~/.claude/plans/serene-launching-barto.md`). Introduced the `roll` axial-orientation field (section glyph spin + elevation face; `rot` stays the drag angle). Added the missing **second elevation** per member: UB/UC/WB flange-face (width-tall, hidden/dashed web), RHS deep-vs-flat, and made **PFC toes-toward** render its flange-roots hidden (this was the old Phase-3 "PFC elevation dashed-edge" item → now done). Fixed the pre-existing **RHS square-render bug** (drew depth×depth, ignored `bf`) and the **`v25Mem2HalfDepth` constant-50 RHS bug** (now roll-aware). Inspector gained a Roll control replacing the retired (no-op) open-face select. Verified in browser (port 8771): all orientations place with correct `roll`, render distinctly (UB web-face depth-tall + solid flanges vs flange-face width-tall + dashed web; RHS deep vs flat heights; PFC toes-away solid vs toes-toward dashed roots; PFC 4 section directions corrected after a y-flip label swap), hit-boxes roll-aware (UB flange-face halfDepth = bf/2), inspector Roll edits apply (string→Number coerced), persistence intact, console clean. Files: `72b-orientation-presets.js`, `68-v25-tools.js`, `69-v25-dispatch.js`, `72-v25-options-bar.js`, `71-v25-selection.js`. ⚠ Known follow-ups: CHS section still renders as a square (pre-existing; CHS not in the sketch); fixing the RHS half-depth changes existing RHS joint/mitre visuals (now correct vs the old constant 50) — re-check any saved RHS-brace drawing.
- [x] Phase 3 — author real orientation icons (verified 2026-05-30). 18 single-stroke `icon-orient-*` SVG symbols added to `index.html`'s sprite (4 shared I-family for UB/UC/WB, 6 PFC, 2 SHS, 4 RHS, 2 CHS); `V25_ORIENT.icon` fields repointed from the placeholder palette glyphs. Elevations render the member horizontally (solid flange-roots for web-face / toes-away; AS 1100 dashed for flange-face / toes-toward / tube bores; deep vs flat proportions); sections render the end-on profile (I, H, channel [ U ] ∩, square/rect tube, circle). Browser-verified: every catalogue icon resolves to a symbol, UB row shows 4 distinct icons + PFC row shows 6, console clean. The PFC-elevation dashed-edge sub-item that was bundled here shipped earlier in Phase 2.5. (Note: icon authoring is per the *current* matrix, which expanded in Phase 2.5 — 18 icons vs the ~22 the original plan estimated against the old matrix.)
- [x] Phase 4 — polish + CHANGELOG (verified 2026-05-30). (1) Active-button highlight confirmed visually distinct from hover — active uses the `--accent-bg`/`--accent-brd` treatment, hover uses neutral `--surface-3`. (2) Added a ↻ **Rotate 90°** button at the end of the orientation row (`v25RotateOrientation90` in `72b`) that advances to the next preset of the current aspect by ascending roll, wrapping (UB sec web-vert↔web-horz; PFC sec cycles 0→90→180→270→0 = right→up→left→down; PFC elev away↔toward); placement-state only via `v25SetOrientation`, hidden for symmetric SHS/CHS (each aspect has <2 presets). (3) Undo safety confirmed — `undoStack.length` unchanged across rotations (orientation changes only mutate `v25State`). (4) CHANGELOG updated. Browser-verified on port 8771, console clean.
