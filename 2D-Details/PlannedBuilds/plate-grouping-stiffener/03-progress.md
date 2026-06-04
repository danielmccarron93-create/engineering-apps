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

## Follow-up 3 — plate drag rework, subtle fill, multi-member grouping (2026-06-02) ✅

Dan's third review round. The earlier edge-drag over-grabbed thin plates (any grab was "near an edge") and skewed them on a move. Reworked to his actual mental model + closed two flagged items.

- **Drag model corrected** (`js/v2/tools/edit-plate.js` onPointerDown reworked): plain grab on **body or a long edge → move whole plate** (bodyDrag, edge falls back to body); plain grab on a **corner → move the END (short) edge** the corner belongs to (the shorter of the two edges at that corner), both its corners together, **projected onto the long axis** (`normal`) so the plate stays rectangular (widen/narrow). state.edgeDrag carries `{iA,iB,origVA,origVB,anchorWorld,currentDelta,normal}`; previews in both `drawV2PlatesOnCanvas` + `drawV2PlateSelection` move both corners by the projected delta. **Verified**: body/edge drag translates the rect intact; corner drag widened 800→950 with height unchanged even on a diagonal drag.
- **colorAlpha root fix** (`js/08-coords.js`): the flagged oklch issue. `colorAlpha` now rasterises a wide-gamut colour (oklch/lab/color()) to one sRGB pixel via the cached canvas, then applies alpha. So the plate-selection fill (0.14) is now a light wash, not opaque dark. **Verified**: `colorAlpha(oklch…,0.14)` → `rgba(200,102,78,0.14)`; big selected plate screenshot shows a faint translucent fill.
- **Multi-plate grouping** (`js/72f` + `edit-plate.js` + `live-render.js`): new `window.v25SelPlateIds` co-selection set parallel to `v25Selected`. **Shift+click a plate toggles it** into the set (replaces the old Shift+vertex insert/delete, which collided with multi-select on thin plates — a Shift click on a thin plate always lands in edge tolerance). `selectedPlates()` returns the set ∪ the v2 primary; `group()` stamps all selected members + plates and **merges any pre-existing groups** (no fragmenting); `ungroup()` likewise. Move/rotate already iterate all grouped plates. **Verified**: 2 non-touching plates + a column → Shift-selected (count 2, no reshape), grouped (all 3 share gid), and **both plates rotate with the group**.
- **Files touched:** `js/08-coords.js` · `js/72f-v25-grouping.js` · `js/v2/tools/edit-plate.js` · `js/v2/ui/live-render.js` · `CHANGELOG.md`.
- **Note:** plate vertex insert/delete (Shift+click) retired in favour of Shift+click = multi-select; rectangular plates don't need it. Can be re-added on a non-conflicting gesture if wanted.

## Follow-up 4 — corner-resize (both dims) + marquee multi-plate (2026-06-02) ✅

Dan's final two: (1) a corner drag only changed one dimension (for a tall plate it only got taller, not wider); (2) a marquee selected only one plate.

- **Corner-resize** (`js/v2/tools/edit-plate.js`): replaced the "move the short END edge" corner behaviour with a true rectangle corner-resize. New `plateResizeCorners(ed,du,dv)` helper: grabbed corner = origVi+delta; decompose `(C−O)` onto the plate's edge axes `eu/ev` (taken from the fixed opposite corner O); set grabbed corner = `O+a·eu+b·ev`, the two neighbours = `O+a·eu` and `O+b·ev`, O fixed. Resizes **both** width and height, stays rectangular, works rotated. Non-quad polygons fall back to single-vertex move. edgeDrag now carries `{mode,viI,nAI,nBI,O,eu,ev,origVi,anchorWorld,cur}`; `cur=[{i,x,y}]` written each move and consumed by both live-render previews + the commit. **Verified**: tall 200×600 plate, corner drag (150,150) → 350×750, clean rectangle; horizontal drag → width only; body/long-edge drag still moves whole plate.
- **Marquee multi-plate** (`js/v2/tools/edit-plate.js` `selectInRect`): was keeping only the topmost enclosed plate; now collects EVERY plate in the box into `window.v25SelPlateIds` (Shift=additive, plain=replace), mirroring the v25-member marquee in `js/39-events.js:1448-1465` (which already passes `additive=e.shiftKey`). **Verified**: box over 2 plates → both selected → `Ctrl+G` groups both → they rotate together; box over none (plain) clears.
- **Files touched:** `js/v2/tools/edit-plate.js` · `js/v2/ui/live-render.js` · `CHANGELOG.md`.

## Follow-up 5 — stiffener actually renders (the "dotted line" bug) (2026-06-02) ✅

Dan reported: placing a stiffener showed a **dotted line with no visible plate**, not flush to the flanges (gap at the top flange, slightly into the bottom flange). Root-caused + fixed via a multi-agent workflow (`stiffener-render-fix`: scan → render-polish design → implement 72e/72g → adversarial review), then browser-verified in the main thread.

- **Root cause (invisibility):** `drawStiff2D` + `v25PreviewStiffener` (and `drawJWeld2D` in `72g`) read `window.ctx`, but `ctx` is a top-level `let` in `07-globals.js` — a global *lexical* binding, **not** a `window` property — so `window.ctx` is `undefined` and `if (!context) return` fired every render; the plate never painted. The "dotted line" was the **dashed selection-highlight box** (`v25DrawSelectionHighlight`, which uses bare `ctx`) drawn around the invisible, auto-selected entity. **Phase-1's original "verified" only inspected entity coords, not pixels, so it missed that nothing drew.** Fix: use the bare global `ctx`; drop `window.ppm` for the in-file `ppmm()`.
- **Lineweights:** `LW.medium/fine/thin` don't exist (valid: `CUT/VIS_HEAVY/VIS/MW/DIM/HID/CL/HATCH`) → outline `LW.VIS`, hatch `LW.HATCH`, weld `LW.DIM`.
- **Render polish (STP 6011):** render-only **min-2 px width guard** (`buildRenderCorners`, leaves the true `ent` for hit-test/bounds/grips); AS 1100 **thin-section-solid** fill below 6 px on-screen / ≥2-line 45° steel cross-hatch above; **2–8 even, capped fillet ticks** per long edge (skip when too small). **Geometry untouched** — `resolvePlacement` / `stiffCorners` / `vTop`/`vBot` unchanged.
- **Regression caught in my review-of-the-workflow:** the polish moved the outline `stroke()` to *after* the infill, but `hatchQuad` leaves its last 45° line as the current path (its `restore()` doesn't reset the path), so in the hatch regime the outline stroked a stray hatch segment instead of the plate border. Fixed by re-pathing the quad immediately before the outline stroke (`drawStiff2D`).
- **Verified (preview sandbox `/tmp/structdraw-verify`, served via a new `sd-stiffener-verify` launch config, console clean throughout):**
  - Placed through the **real** `v25PlaceStiffener` → `resolvePlacement` path on a 360UB 50.7 (d=356, tf=11.5) → `vTop = 166.5`, `vBot = −166.5` = the inner flange faces **exactly** (`flushTop` & `flushBot` true).
  - At 1:10 working zoom (true plate width 1.5 px) a canvas pixel sample found **6 dark px** across the stiffener — i.e. it's **drawn** (was 0 = invisible before the fix); the min-width guard renders it as a clean ~2 px solid strip.
  - 22× detail screenshot: stiffener **flush to the top-flange inner face**, clean 45° steel hatch, crisp vertical outline (confirms the re-path fix in the hatch regime), small fillet ticks on the edges.
- **Files touched:** `js/72e-v25-stiffener.js` · `js/72g-v25-joint.js` · `CHANGELOG.md`. (`.claude/launch.json` gained a local `sd-stiffener-verify` serve config — local-only, not part of the source change.)

## Follow-up 6 — stiffener hatch made opt-in + double-click popup; re-verified (2026-06-03)

A refinement to `js/72e` made **right after** Follow-up 5 (the file's last edit postdated this tracker's FU5 write), found unverified/undocumented on a build-resume and **re-verified on 2026-06-03**. **Supersedes FU5's "thin-section-solid fill below 6 px / auto cross-hatch above" render rule** — that approach was replaced by an explicit opt-in.

- **Hatch is now opt-in, not automatic.** A stiffener draws by default as an **open outlined plate** — render-only min-2 px width guard + `LW.VIS` outline, **no solid fill, no auto-hatch** (clearest at 1:10). AS 1100 45° steel cross-hatch is drawn only when `ent.hatch === true`. The post-hatch outline re-paths the quad first (the FU5 stray-hatch-segment fix) so it strokes the plate border even in the hatch regime. (`js/72e-v25-stiffener.js` `drawStiff2D`.)
- **Two ways to enable hatch.** (1) the Stiffener **quick-options bar** carries a *Steel hatch* checkbox beside Thickness (6–20 mm) + Weld-both, persisted to `v25Last.stiffHatch` so it applies to the next placement (`js/72-v25-options-bar.js`); (2) **double-clicking** a stiffener opens a small properties popup — Thickness / Weld both sides / Steel hatch — mutating the entity live and persisting the choice (`v25OpenStiffPopup` in `js/72e`, wired into the 2D-mode dblclick handler at `js/39-events.js:1275`).
- **Verified (preview sandbox `sd-live` :8873 — a *fresh* copy of the live tree made this session at `/tmp/sd-live-verify`; macOS TCC blocks python from serving `~/Documents` directly, so it can't be the source dir itself, but it is byte-current with the post-20:17 FU6 code; console clean throughout):**
  - Placed via the real `v25PlaceStiffener` path on a 360UB 50.7 → `vTop 1166.5 / vBot 833.5` = inner flange faces **exactly**; `hostId` bound to the beam.
  - Pixel scan: vertical slice through the web region read **0 ink without** the stiffener vs **1340 ink with** it (web-only 0 → 468) — a clean ~2 px outlined strip, ink on **both** edges, hollow centre (default un-hatched). The FU5 invisibility fix holds (it draws, not just a selection box).
  - Double-click popup opens readable (cream-on-dark) with Thickness 6/8/**10**/12/16/20, Weld-both ✓, Steel hatch ✗. Toggling *Steel hatch* drives `ent.hatch` true/false **and** `v25Last.stiffHatch`; on a deliberately-wide test plate hatch-on added **+1505 ink** vs hatch-off (screenshot confirmed). Placement does **not** auto-open the popup (only a double-click does).
  - **Placement gating:** stiffener **rejected** on a hollow section (SHS 89×3.5, no flanges) and **accepted** on a channel (380PFC 55.2 → flush `vTop 1172.5 / vBot 827.5`) and a UB — i.e. the I-section/channel-only `beamDims` gate works.
- **Files touched (this refinement):** `js/72e-v25-stiffener.js` · `js/72-v25-options-bar.js` · `js/39-events.js` (dblclick branch) · `CHANGELOG.md`.
