# Measure / Dimension tool — build progress

**Status: BUILT + browser-verified (2026-06-04). Awaiting Dan's review.**

Built start-to-finish in one chat: a 9-agent understanding/synthesis **workflow** mapped the V25 pipeline (`02-design.md` is its brief), then implemented + browser-verified phase by phase against `/tmp/sd-measure` (no-cache python server, port 8902).

## User decisions locked in
- **`m` = Measure everywhere** (not mode-aware). 2D → `v25-measure`; 3D → legacy `dimension`. **Mirror relocated to `i`.**
- **Typing a number resizes the dimension itself** — P1 anchored, P2 slides to the exact length (live, on each digit).

## Entity / tool
- New V25 entity **`dim2`**, tool **`v25-measure`**. NOT an extension of legacy `dim` (which auto-recomputes its label and is shared by the 3D tool + connection-builders).
- Data model: `p1u/p1v/p2u/p2v` (real-mm), `off` (SIGNED, **paper-mm**), `textOverride`, `sz/term/prec/units`. Paper-mm sizing via `_nbZoom()` so the standoff/text/terminators stay constant across drawing scales.

## Phases (all done + verified)
1. **Entity + renderer + placement + dispatch** — `js/82-v25-dimension.js` (new), `js/69`, `js/07`, `index.html`. Verified: two-click placement creates a `dim2`; renderer draws dashed witness lines, thin dim line (LW.DIM), tick/arrow/dot terminators, upright centred label.
2. **Live preview** — `js/38-crosshair.js`. Ghost dimension (reuses the real drawer) + length pill during rubber-band; armed cursor marker.
3. **Selection / grips / drag** — 7 additive `dim2` branches in `js/71-v25-selection.js` (bounds, hit-test, handles, snap points, hit-handle, move, inspector). `p1`/`p2`/`off`/`body` grips. Verified: drag off −12→−32, drag p2 600→700, body translate.
4. **Keyboard** — `js/42-keyboard.js` (`m` activate + AWAITING type-to-set, placed early so label letters don't fire tool shortcuts), `js/57-chord-layer.js` (retire `M` chord-prefix). Verified: type 400→400, backspace→40, letters→label, Enter commits, Esc reverts; `i`→Mirror; `m` in 3D→legacy dimension.
5. **Double-click inline editor** — `js/82` (input over the dim line) + `js/39-events.js` dblclick route. Verified: number→rescale, text→override, blank→measured, undoable (`v25Move` snapshot), real dblclick opens it.
6. **Discoverability + options + export** — `js/74` Draw-tab **Measure** tile (active-highlight via `v25ActiveTileId`; legacy kept as "Dim (old)"), `js/72` options bar (text height/terminator/precision/units/offset → `v25Last`), `js/65` defaults, `js/45` DXF on `S-DIM`. Verified: tile activates tool; all 5 options wired; DXF emits 3 LINEs + label.

## Verification summary
Console clean throughout. Real-pointer placement, real-keyboard type-to-set, real double-click all confirmed. Save/load JSON round-trip clean (no `_editing`/`_preview`/`_clickLen` leak). Regression smoke-test green (leader2, mem2, line/select/dimension shortcuts, hit-test, inspector all intact). A focused adversarial-review workflow (3 lenses → verify) was run as the capstone.

## Adversarial review round (2026-06-04)
A `dim-tool-review` workflow (3 lenses → adversarial verify, 18 agents) raised 15 candidates, confirmed 10. **All addressed:**
- **[med] real bug I introduced** — the editor's no-op guard called `v25MoveTargetsDiffer` (doesn't exist; correct name `v25MoveSnapshotsDiffer`) AND snapshotted `before` after flagging `_editing` — so every editor commit pushed a phantom undo + wiped redo. Fixed both (rename + snapshot before `_editing`). Verified: no-op commit pushes nothing & keeps redo; a real edit pushes undo and Ctrl+Z reverts.
- **[med]** no min-length guard on the 2nd click → degenerate zero-length dim. Added `len > 5` guard (mirrors sibling tools).
- **[med]** a letter typed after a digit leaked to global tool shortcuts (e.g. `5` then `l` switched tools). Added a catch-all swallow in the AWAITING block.
- **[low]** v1 `setTool` didn't clear `v25State.dragStart`/measure* (ortho-origin cursor glitch) → added teardown; **[low]** lone `.` latched number-mode → fixed; **[low]** label-click pickup box at wrong perpendicular distance → matched renderer `tgap`; **[low]** `M` while another chord overlay open orphaned it → close it; **[low]** negative options-bar offset discarded → use magnitude.
- **Rejected [low]** "witness lines should be solid (AS 1100)" — Dan explicitly asked for dashed extension lines, and the reference image shows dashed. Kept dashed.

All fixes re-verified in-browser; regression smoke-test re-run green after the shared-`setTool` change.

## Follow-up refinements (2026-06-04, post-review)
Dan's review feedback — all done + browser-verified:
1. **Font.** Dimension label now uses the noteBox font system, **Plex by default**, with the full text-box font set selectable in the **Properties** tab and as the tool default in the options bar. New `style` field on `dim2`; renderer draws web fonts (plex/routed) via `fillText` and stroke fonts via `nbStrokeText`; the inspector `sel` renderer was extended to accept `{v,l}` option objects for friendly labels. (`js/82`, `js/71`, `js/72`, `js/65`, `js/69`, `js/38`.)
2. **Separate line properties.** The solid **dimension line** and the **extension lines** each have independent **width / colour / style (solid·dashed·dotted)** in Properties: `dimLw/dimColour/dimLs` + `extLw/extColour/extLs` (colours fall back to the generic colour → theme `--mute`; widths are paper-mm so the control is visible; `dim2DashPx` maps the style). Terminators + label follow the dim-line colour. (`js/82` renderer, `js/71` inspector.)
3. **No selection box.** `v25DrawSelectionHighlight` skips the AABB for `dim2` and instead traces a thin translucent halo along the dim + witness lines; the endpoint (`p1`/`p2`) squares and the `off` circle remain as nodes — so a selected dimension reads as a draggable line and never covers the dimensioned members.
Regression re-checked: other entities' inspectors (string-opt selects) unaffected by the `sel` change; the colour **Reset** buttons clear `dimColour`/`extColour` overrides.

## Flagged for Dan (non-blocking)
- **`M` chord-prefix retired** to free `m` for Measure — the Model member quick-keys (M-U/M-C/…) no longer work; members remain on the palette. `CHORD_BINDINGS.M` is kept in code so it can be relocated to another prefix if wanted.
- **Mirror moved to `i`** (was `m`).
- The legacy 3-click dimension stays in the Measure section as **"Dim (old)"** — say the word to remove/repoint it.
- Default terminator = oblique **tick** (AS 1100 / matches the example image); arrow/dot available per-dim and as the tool default.
- Dimension labels are **unitless** by default (AS 1100 convention — sheet states mm); switch a dim to `units: m`, or type a `textOverride` for a suffix.

## Files touched
`js/82-v25-dimension.js` (new), `index.html`, `js/07-globals.js`, `js/38-crosshair.js`, `js/39-events.js`, `js/42-keyboard.js`, `js/45-dxf-export.js`, `js/57-chord-layer.js`, `js/65-v25-data-mode.js`, `js/69-v25-dispatch.js`, `js/71-v25-selection.js`, `js/72-v25-options-bar.js`, `js/74-v26-bb-rail.js`, `CHANGELOG.md`.
