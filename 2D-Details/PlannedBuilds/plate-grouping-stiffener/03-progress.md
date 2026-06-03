# Progress tracker — grouping · joint · stiffener

**All five phases complete and verified in the preview sandbox (2026-06-01).** No `node` on this machine, so verification was browser-based: app copied to `/tmp/sd_app`, served via the `structdraw-py` launch config, exercised through the Claude preview tools (programmatic API, real `KeyboardEvent`/`MouseEvent` dispatch, and screenshots). DevTools console stayed clean throughout.

## Phase 1 — Stiffener tool ✅
- New `stiff2` entity in `js/72e-v25-stiffener.js`: two-endpoint model (`uTop/vTop/uBot/vBot`), `thk`, `weld`, `hostId`, `groupId`.
- BB-rail **STIFF** tile (`74-v26-bb-rail.js`) + custom `icon-stiffener` symbol (`index.html`).
- Dispatch: render (`drawStiff2D`), click (`v25PlaceStiffener`), preview (`v25PreviewStiffener` via `38-crosshair.js`) wired in `69-v25-dispatch.js`.
- Snap: nearest **column centreline** (or cursor X under Shift), spans **inner flange faces** (`v ± d/2 ∓ tf`).
- Edit: top/bottom grip handles via `71-v25-selection.js` hooks (`v25StiffBounds/Grips/ApplyGrip`); ortho by default, Shift = slant.
- Options bar (`72-v25-options-bar.js`): Thickness 6–20 mm + Weld-both toggle (persist on `v25Last.stiffThk/stiffWeld`).
- DXF branch (`45-dxf-export.js`): S-STEEL outline + S-WELD ticks.
- **Verified:** real canvas click placed a stiffener at u=700 (snapped from a 710 click), full-depth 141.7…−141.7, 10 mm; drag-shorten (ortho) + Shift-slant both correct.

## Phase 2 — Cross-system grouping ✅
- `js/72f-v25-grouping.js` (new) + `v25GroupSeq` global (`07-globals.js`).
- Co-selection bridge: Shift-click a member without clearing the plate selection (edit-plate "empty click deselect" made Shift-aware).
- `v25Group` / `v25Ungroup`; **Ctrl+G / Ctrl+Shift+G** (`42-keyboard.js`, before the bare-`g` grid toggle); right-click menu (`39-events.js` contextmenu).
- Move-together: `v25GroupOnV25Move` hook at the top of `v25Move`; plate-drag snapshot hooks (`begin/move/end`) in `edit-plate.js`.
- **Verified:** group via direct call + real Ctrl+G keydown (grid did NOT toggle); drag column → plate follows (both +150); drag plate → column follows (−100); ungroup breaks the link; lone entities unaffected.

## Phase 3 — Group-move flange snap + joint(none) ✅
- `v25JointSnapGroupToFlange` (`72g`): on group-drop, snap the end-plate's near edge to the nearest non-group beam flange outer face; one rigid correction to all group members; record `plate.params.flange = {memberId, columnId, mode:'none', edgeV, …}`.
- Wired into the v25 mouseup release (`39-events.js`) and the plate-drag-end commit (`edit-plate.js`).
- **Verified:** plate dropped 40 mm proud snapped to exactly the UB top-flange face (193.5 → 153.5); joint recorded UB as member, SHS as column, mode `none` (no weld by default).

## Phase 4 — Joint weld/bolt menu ✅
- Double-click / right-click the joint → menu (`v25JointTryMenu`): **Weld together** / **Bolt together** / **No connection**.
- Weld → `jweld` entity (fillet ticks along the interface). Bolt → two real `bolt2` at column-centre ± (colHalf + **50 mm**), `v-nutB`, `gripOverride = plateThk + tf`, tagged `jointPlateId` + `groupId`. Mode-switch removes the other set.
- DXF `jweld` branch (S-WELD).
- **Verified:** bolt → 2 bolts at u=705.5 & 894.5 (= 800 ± (44.5+50)), grip 27.8; weld → 1 jweld spanning the plate; None → all cleared; menu labels correct ("Plate ↔ 310UB 46.2 joint / Weld / ✓ Bolt (2/M50) / None").

## Phase 5 — Reproduce the sketch ✅
- Full detail built (UB + SHS column + welded end-plate, grouped, dropped on flange, bolted, + full-depth stiffener) — `types=[mem2,mem2,bolt2,bolt2,stiff2,plate2]`. Screenshot matches Dan's sketch.
- DXF export of the whole detail: ~54 KB, valid (SECTION…EOF), carries S-STEEL/S-WELD/S-BOLT. No throw.

## Files touched (final)
`index.html` · `js/07-globals.js` · `js/38-crosshair.js` · `js/39-events.js` · `js/42-keyboard.js` · `js/45-dxf-export.js` · `js/69-v25-dispatch.js` · `js/71-v25-selection.js` · `js/72-v25-options-bar.js` · `js/72e-v25-stiffener.js` (new) · `js/72f-v25-grouping.js` (new) · `js/72g-v25-joint.js` (new) · `js/74-v26-bb-rail.js` · `js/v2/tools/edit-plate.js` · `CHANGELOG.md`

## Notes for Dan's review
- **The existing column→end-plate weld-on-snap** (your "dragged the plate to snap to the end of the column … added weld lines, which was perfect") is **untouched** — this build only *adds* the group/joint/stiffener paths on top. Worth a quick confirm in-browser that it still appears as before.
- The joint's default-bare behaviour is deliberate (your spec): no weld until you pick Weld or Bolt on the joint menu.
- Bolt edge distance (50 mm to column face) and stiffener thickness (10 mm) are defaults; both are exposed (bolt via the joint, stiffener via the options bar / end-drag).
- Build/verify ran from `/tmp/sd_app`; the live source tree under `2D-Details/` is the authoritative copy (the `/tmp` copy is a throwaway serve dir). A throwaway `.claude/launch.json` `structdraw` config I added early was not needed — Dan's existing `structdraw-py` config (serves `/tmp/sd_app`) is what's used.

## Follow-up — group-flash + rotate-together (2026-06-02) ✅

Dan's review feedback after the build landed: (1) grouping was hard to *see*, and (2) a grouped column + plate should rotate together so the assembly can be flipped (e.g. cap plate → base plate).

- **Group-flash feedback.** On a successful `Ctrl+G`, every member of the new group is washed in `--selected-color`, fading over 3 s (ease-out, peak α 0.42). Self-driven via `requestAnimationFrame`, keyed off the group id (not the selection) so it survives a click-away. New `startGroupFlash` / `pumpFlash` / `drawGroupFlash` + `flashOutline` / `platePoly` helpers in `js/72f-v25-grouping.js`; `group()` calls `startGroupFlash(gid)`. Painted from the v2 live-render wrapper (`js/v2/ui/live-render.js`) **after** `drawV2PlatesOnCanvas` / `drawV2BoltsOnCanvas` so the wash composites on top of both the v25 members and the v2 plates.
- **Rotate-together.** Mirrors the move-together design. v25 rotate-ball path (`js/71-v25-selection.js` `v25Move` mem2/mat/blockWall rotate branches) calls `window.v25GroupOnV25Rotate(ent, pivotU, pivotV, dTheta)` with an **incremental** delta about the dragged member's own pivot. v2 plate rotate-handle path (`js/v2/tools/edit-plate.js` rotate begin/move/up) calls snapshot hooks `v25GroupOnPlateRotate{Begin,Move,End,Cancel}` with an **absolute** angle about the plate centroid. Rigid-body rule: rotate each member's start point about the pivot and advance `rot` by the same delta (far end follows); plates rotate every polygon vertex; stiffeners rotate both endpoints. **Escape mid-drag** now restores the group (`plateRotateCancel` + `plateDragCancel`).
- **Verified (preview sandbox, `/tmp/sd_app`, console clean):**
  - Full path through real `v25Move`: grouped SHS column + cap plate, drove the column rotate-ball to a snapped 180° → plate flipped from v 2000→0 (top → bottom), `(x,y)→(1600−x, 2000−y)` about the column midpoint (800, 1000), exact; column held its vertical span at `rot 270`. Before/after screenshots match the "cap plate → base plate" intent.
  - Plate-handle path: `v25GroupOnPlateRotate*` rotated the column rigidly about the plate centroid (exact).
  - `drawGroupFlash` emits 2 fills + 2 strokes over the resolved group (1 ent + 1 plate).
  - Escape mid-rotate restored the column to its pre-drag pose.
- **Files touched:** `js/72f-v25-grouping.js` · `js/71-v25-selection.js` · `js/v2/tools/edit-plate.js` · `js/v2/ui/live-render.js` · `CHANGELOG.md`.

## Follow-up 2 — joint-menu fixes, plate edge-drag, flash pulse (2026-06-02) ✅

Dan's second review round. Diagnosed with a 6-agent investigation workflow (`grouping-followup-investigate`), then implemented + browser-verified in the main thread.

- **Flash pulse @ 30%.** Root cause beyond the brief: the theme accent (`--selected-color`) is an `oklch()` colour and `colorAlpha()` only handles hex/rgb, so the wash was rendering **opaque** regardless of the alpha passed. Switched the flash to `ctx.globalAlpha` (format-proof) + a raised-sine envelope `0.30·sin(3πt)²` → 3 pulses peaking at 0.30, zero by t=1. (`js/72f-v25-grouping.js`.) **Verified** by clock-controlled sampling: peaks 0.30 at t≈0.17/0.5/0.83, troughs 0, gone at t≥1; plus a visual peak screenshot showing a true translucent wash.
- **Plate edge-drag.** New `state.edgeDrag` in `edit-plate.js`: a mid-edge grab moves BOTH endpoints (delta-based, correct for an off-vertex grab); Shift→only the nearest node; Shift+click→insert vertex (the old Shift+edge insert, deferred via `pendingInsert`); the old non-Shift edge→bodyDrag thin-cleat fallback was folded in. Vertex delete (Shift+corner) untouched. Preview added in both `drawV2PlatesOnCanvas` and `drawV2PlateSelection` (`js/v2/ui/live-render.js`). **Verified**: plain drag moved both top corners 40→90; Shift+drag moved only the nearest; Shift+click inserted a vertex.
- **Joint default = none + auto-weld suppression.** The weld-on-drop was NOT the joint mode (already 'none') nor a `v25AutoWeldForPlate` (doesn't exist) — it was the always-on geometric `computeV25WeldInterfaces`→`drawV25AutoWelds` hatching the sub-2 mm plate↔flange contact every render. New `v25PlateJointSuppressesWeld(plate2, mem2)` in `js/68-v25-tools.js` skips the interface a registered flange joint owns (member-scoped, so the plate↔column cap weld is preserved). **Verified**: before grouping, 2 weld interfaces (plate↔beam + plate↔column); after the joint registers, only plate↔column remains.
- **Auto-open menu.** `openMenuForPlate(pl)` in `js/72g-v25-joint.js`, called from `snapGroupToFlange` on FIRST registration (`!prev.mode`), positions the menu at the contact line via `real2px`+canvas rect. **Verified**: menu auto-opens after the snap.
- **Menu readable + actions fixed + M20.** Container now `var(--surface-2)`+`var(--text)` (was undefined `--panel-bg`→dark on dark `--text`); hover sets `--accent-ink`. **Verified** bg `rgb(248,242,229)` / text `rgb(42,36,31)`. Outside-close listener changed from capture `pointerdown` (which detached the menu before the item's `mousedown`) to a guarded capture `mousedown` → **Bolt click now creates 2×M20, None clears, menu closes**. Label fixed to "Bolt together (2/M20)" (was `BOLT_EDGE_MM`=50). Same readability + close-listener fix applied to the 72f Group/Ungroup menu.
- **Files touched:** `js/68-v25-tools.js` · `js/72g-v25-joint.js` · `js/72f-v25-grouping.js` · `js/v2/tools/edit-plate.js` · `js/v2/ui/live-render.js` · `CHANGELOG.md`.
- **Open follow-ups flagged for Dan:** (a) `colorAlpha()` can't alpha an `oklch()` colour → other translucent fills (plate-selection fill, drag guides) render opaque in the oklch themes — a root `colorAlpha` fix (rasterise to rgb) would restore them app-wide; (b) thin-cleat whole-plate move is now via the interior/grouped column rather than an edge grab.
