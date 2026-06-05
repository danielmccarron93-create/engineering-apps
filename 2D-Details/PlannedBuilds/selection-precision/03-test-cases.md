# 03 — Test cases (manual, browser)

No build step and no node here — these are **manual smoke tests** run in `index.html` (or `python3 -m http.server` if `file://` blocks something). All in **2D mode (V25 paper-space)**. DevTools console must stay clean throughout. After each selection, confirm via the inspector panel + the on-canvas highlight which entity is selected.

Legend: **PASS** = the asserted entity is the one selected (highlighted + shown in inspector) and *no other* entity is co-highlighted.

---

## Group 1 — the core bug

### TC-1.1 Screw on timber, no plate
1. Draw a timber post (`mem2`, timber) ~300×300 in elevation.
2. Place an HBS `screw` (section orientation) so its glyph sits **inside** the post.
3. Click **directly on the screw glyph / centreline**.
- **Expected:** the **screw** is selected (precise, tiny score beats the post's area). PASS.

### TC-1.2 Screw on timber UNDER a plate (THE bug)
1. Timber post as above.
2. A v2 **plate** (cleat) placed over part of the post.
3. An HBS `screw` placed on top of both, its glyph over the plate+post overlap.
4. Click **directly on the screw**.
- **Expected:** the **screw** is selected — not the plate, not the timber. PASS. *(This is the headline fix.)*

### TC-1.3 Click the plate (not on the screw)
1. Same scene as TC-1.2.
2. Click on the plate **away from the screw**, inside the plate polygon, over the post.
- **Expected:** the **plate** is selected (smaller area than the post; both are area, plate wins). `window.v25SelPlateIds` has the plate id; `v25Selected` is empty. PASS.

### TC-1.4 Click bare timber
1. Same scene.
2. Click on the post **outside** the plate and **outside** the screw.
- **Expected:** the **timber** is selected. `v25Selected` has the mem2 id; `v25SelPlateIds` is empty. PASS.

### TC-1.5 Bolt2 on a member, section orientation
1. Draw a steel `mem2` in section.
2. Place a `bolt2` (section, e.g. `h-nutR`) so the glyph overlaps the member.
3. Click on the **bolt centreline**.
- **Expected:** the **bolt2** is selected (precise centreline beats the member area). PASS.
- **Sub-check (offset):** the bolt's section glyph re-centres on the detected clamp face. Click where the **drawn** centreline is (not necessarily `ent.u/ent.v`). It must still select. PASS.

---

## Group 2 — repeat-click cycle (must stay deterministic)

### TC-2.1 Outward cycle order screw → plate → timber
1. Scene from TC-1.2 (screw over plate over timber), all three overlapping at one point P.
2. Click P → **screw** selected.
3. Click P again (same spot, < 4 px) → **plate** selected.
4. Click P again → **timber** selected.
5. Click P again → wraps back to **screw**.
- **Expected:** the cycle walks screw → plate → timber → screw, deterministically, every run. PASS.
- **Why it matters:** the stack id-array must be byte-identical across the repeated clicks (`js/39-events.js:275-276`) or the cycle resets to index 0 and step 3 re-selects the screw instead of advancing. The plate synthetic id `'v2plate-'+el.id` must be stable.

### TC-2.2 Cycle resets when the spot moves
1. Click P → screw selected.
2. Click a point > 4 px away that also overlaps all three → **screw** selected again (fresh stack, index 0), not the plate.
- **Expected:** moving the click point restarts the cycle at the most-specific pick. PASS.

### TC-2.3 noteBox arrowhead still wins
1. Place a `noteBox` with an arrow whose **tip** lands inside a `mem2`.
2. Click the **arrow tip**.
- **Expected:** the **noteBox** is selected (PASS0 arrowhead priority preserved, modelled as precise with tip-distance score). PASS.
3. Click again at the same tip spot → cycles to the **member** behind. PASS.

### TC-2.4 Cycle into a plate via the stack
1. Two overlapping v2 plates + a member at point Q (smaller plate on top).
2. Click Q → smaller plate. Click Q → larger plate. Click Q → member.
- **Expected:** plates participate in the outward cycle and tunnel correctly. PASS. *(Exercises § E cycle-resolve plate lookup.)*

---

## Group 3 — every existing entity type still selectable

For each, place the entity in an otherwise empty area and click ON it; confirm it selects (PASS). Then place it overlapping a big `mem2` and confirm the precise/area rule picks correctly.

### TC-3.1 Linear / point (precise — must beat an overlapping member)
- **leader2** — click the leader line and the text anchor; over a member, the leader still wins. PASS.
- **dim2** — click the dim line, a witness line, and the label; over a member, the dim still wins. PASS.
- **line / lineSet** — click the stroke; a line crossing a filled member selects the line. PASS.
- **reoBar** (run) — click a bar segment. PASS. **reoBar** (`sectionDot`) — click the dot. PASS.
- **anchor** — click the shaft; over a member, the anchor wins. PASS.
- **jweld** — click the weld run. PASS.

### TC-3.2 Area / filled (smaller area wins; bare member when nothing tighter)
- **mat** (rect, rotated) — click inside the rotated rectangle; the highlight matches the rotated geometry (not a loose AABB). PASS.
- **mat** (poly, L-shape) — click inside the L; clicking in the L's concave notch (inside the AABB but outside the polygon) selects whatever is actually there, NOT the mat. PASS.
- **blockWall** (elevation) — click inside; PASS. **blockWall** (section strip, rotated) — click on the thin strip; a click just off the rotated strip (inside its AABB) does NOT select it. PASS.
- **mesh** — click inside. PASS.
- **frame** — click ON the border → frame selected. Click INSIDE the frame, over a member drawn within it → the **member** selected, not the frame. PASS. *(Border-only preserved.)*
- **stiff2** — click on the stiffener quad. PASS.
- **txtBox** — click inside the placeholder box. PASS.
- **noteBox body** — click the box body (not a leader) → noteBox selected via the body candidate. PASS.

### TC-3.3 Round glyphs use radial accept
- **screw end-on** — click the head circle → selected; click a bbox corner *outside* the visible circle → does NOT select the screw (falls through to whatever's there). PASS.
- **bolt2 end-on** — same: inside the washer ring selects, outside-ring-but-inside-bbox does not. PASS.

---

## Group 4 — plate drag + edit still work (regression guard)

### TC-4.1 Plate body drag after a unified-stack select
1. Click a plate body (it wins the ranked stack) → plate selected.
2. Without releasing context, drag → the plate **moves** and drops where released.
- **Expected:** drag works (v1 selected it, then `beginBodyDragFromExternalSelect` armed `state.bodyDrag`, and editPlate's capture-phase pointermove/up drives the move). PASS.

### TC-4.2 Plate corner resize still owned by editPlate
1. Grab a plate **corner** and drag.
- **Expected:** the plate **resizes** from that corner (priority-3 still claims, never defers). PASS.

### TC-4.3 Plate rotation handle still owned by editPlate
1. Select a plate, grab its **rotation handle**, drag.
- **Expected:** the plate **rotates**. PASS.

### TC-4.4 Shift multi-select plates still works
1. Shift-click several plates.
- **Expected:** all toggle into `window.v25SelPlateIds` (priority-2 still claims). PASS.

### TC-4.5 Alt/Ctrl copy-drag a plate
1. Hold Alt (or Ctrl on Windows) and body-drag a plate.
- **Expected:** an independent **copy** is dropped; the original is unmoved; one Ctrl+Z removes the copy. (`dupModifier` propagated through `beginBodyDragFromExternalSelect`.) PASS.

### TC-4.6 Grouped plate drags its mates
1. Group a plate with v25 members (`Ctrl+G`).
2. Select the plate via a plain body click and drag.
- **Expected:** the **whole group** moves together (group hooks fired in `beginBodyDragFromExternalSelect`). PASS.

---

## Group 5 — deselect + cross-gesture parity

### TC-5.1 Click empty space deselects everything
1. Select a v1 entity → click bare canvas → deselected (`v25Selected` empty).
2. Select a plate → click bare canvas → deselected (`v25SelPlateIds` empty AND `editPlate.state.selectedId` null). PASS.
- **Why:** once editPlate defers plain body selection, v1 owns the empty-space clear of the plate store (§ E.3).

### TC-5.2 Never both highlighted
1. From a selected v1 entity, click a plate → only the plate highlighted (v1 cleared).
2. From a selected plate, click a v1 entity → only the v1 entity highlighted (plate store cleared).
- **Expected:** after any single click, exactly one of `{v25Selected, v25SelPlateIds}` is non-empty — never both. PASS.

### TC-5.3 Right-click parity
1. Right-click a screw that sits over a plate.
- **Expected:** right-click targets the **screw** (consistent with left-click), OR — if the contextmenu ranked-stack update was deferred — at minimum the existing plate-first behaviour is unchanged and documented. Confirm left-click and right-click don't *silently disagree* on a fresh click. PASS.
2. Right-click a plate body (no fastener) → plate selected, group/depth menu acts on it. PASS.

### TC-5.4 Marquee unaffected
1. Drag a crossing marquee over a mix of members + plates.
- **Expected:** members select via `v25Selected`, plates via `selectInRect` → `v25SelPlateIds`; mirrors are skipped (`_v2Mirror` guard at `:1609`). PASS. *(No code change here — pure regression check.)*

---

## Group 6 — zoom + edge cases

### TC-6.1 Selectable when zoomed out
1. Zoom way out so a screw glyph is a few px.
2. Click it.
- **Expected:** still selectable — the `FLOOR_PX ≈ 5` floor keeps the centreline tolerance grabbable even when `(dK/2)*ppmm` is sub-pixel. PASS.

### TC-6.2 Selectable when zoomed in
1. Zoom in hard on the screw-over-plate stack.
2. Click the screw centreline precisely.
- **Expected:** screw selected; the precise distance is measured to the *drawn* centreline (bearing-face anchored), so it stays accurate at high zoom. PASS.

### TC-6.3 No plate in the scene
1. A scene with only v1 entities (no v2 plates at all).
- **Expected:** the v2-plate enumerator finds nothing, no synthetic candidates, behaviour identical to v1-only ranking. Console clean (no `v2.appState.model` errors). PASS.

### TC-6.4 Save / load round-trip
1. Build the screw-over-plate-over-timber scene, save, reload.
2. Repeat TC-1.2.
- **Expected:** selection precision identical after reload (plate ids stable; save/load of plates is automatic via v2 io + entities2D JSON). PASS.
