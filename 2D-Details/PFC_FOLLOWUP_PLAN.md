# PFC Follow-up — Plan

**Status:** dev/ has PFC working in 2D-Studio mode (elevation aspect). Two follow-up PRs are needed to make it production-quality. Read `CLAUDE.md` end-to-end before touching anything — the workflow rules are non-negotiable.

This doc was authored 2026-05-12 after the initial PFC wire-up landed in `dev/`. Files touched in that session:

- `dev/js/57-chord-layer.js` — `M-P` chord enabled
- `dev/js/68-v25-tools.js` — `'pfc'` branch in `drawMem2D()`, plus `v25Mem2HalfDepth()` and both copies of `v25Mem2Thickness()`
- `dev/js/69-v25-dispatch.js` — PFC tile in `getPaletteDef2D()` `Steel Members` group; `openSide` stamped onto new entities
- `dev/js/71-v25-selection.js` — inspector `Type` + Section + new "Open face" dropdowns
- `dev/js/72-v25-options-bar.js` — `dbS` switch knows PFC; conditional Open face control
- `dev/js/74-v26-bb-rail.js` — BB-rail Draw tab PFC tile (replaces "soon" placeholder)
- `CHANGELOG.md` — entry under Unreleased

`node --check` is clean on all six. 3D Model-mode placement of PFC was already wired end-to-end through the unified `drawSectionMember()` pipeline (`18-section-profile.js` → `28-draw-block.js` → `31-draw-section.js` → `40-placement.js`), so the canvas-based elevation/sectionA/planB panes already render PFC. The two remaining gaps are below.

---

## Issue 1 — Cross-section flow is broken (PR A)

### Symptoms

1. Place a PFC in 2D mode (drag two clicks → elevation rectangle appears).
2. Try to flip its aspect to cross-section via the options-bar `Aspect` dropdown → nothing happens.
3. Try drawing a new PFC after switching options-bar Aspect to "Cross-section" → either nothing happens (drag was too short) or you get a tilted parallelogram-looking thing (drag's rotation got stamped onto a section view).

### Root causes

**1a — Aspect change in the options bar never reaches placed entities.**
`dev/js/72-v25-options-bar.js` line ~110: `wire('v25o-aspect', e => { v25State.aspect = e.target.value; v25UpdateOptionsBar(); });`. That only updates `v25State.aspect`, which is read at placement time in `dev/js/69-v25-dispatch.js` line ~359 (`aspect: v25State.aspect || 'elev'`). It never writes back to `v25Selected` entities.

Same bug applies to the new `v25o-openside` wire — only affects future placements.

**1b — Two-click drag is wrong for cross-sections.**
`dev/js/69-v25-dispatch.js` line ~338: the `tool === 'v25-mem'` handler always requires a click + drag with `length > 5 mm` to place. For a cross-section there's no length to define — placement should be single-click. Today, dragging across the canvas to satisfy the length check stamps `rot = atan2(dy, dx)` onto the entity, so the resulting C-shape renders at a random angle.

**1c — Switching an existing entity from elev to sec carries stale `rot`.**
Even if you select the placed elevation PFC and use the inspector to flip its `aspect` to `'sec'`, the entity's `rot` (set from the elevation drag) still applies, so you get a tilted C-shape that looks broken. The cleaner fix is for the cross-section renderer to ignore `ent.rot` regardless of how the entity got there.

### Fix plan for PR A

Touch three files. All edits in `dev/`. None of these are structural refactors — bug fixes only (per CLAUDE.md rule 9).

#### File 1 — `dev/js/72-v25-options-bar.js`

Find the `wire('v25o-aspect', …)` and `wire('v25o-openside', …)` handlers (around line 110-115). Replace both with versions that also iterate `v25Selected` and apply the change to any selected mem2:

```js
wire('v25o-aspect', e => {
  v25State.aspect = e.target.value;
  // Also apply to current selection so the existing PFC flips in place.
  (v25Selected || []).forEach(id => {
    const ent = (entities2D[activeBlock.viewKey] || []).find(x => x && x.id === id);
    if (ent && ent.type === 'mem2') ent.aspect = e.target.value;
  });
  if (typeof requestRender === 'function') requestRender();
  v25UpdateOptionsBar();
});
wire('v25o-openside', e => {
  v25State.openSide = e.target.value;
  (v25Selected || []).forEach(id => {
    const ent = (entities2D[activeBlock.viewKey] || []).find(x => x && x.id === id);
    if (ent && ent.type === 'mem2' && ent.memberType === 'pfc') ent.openSide = e.target.value;
  });
  if (typeof requestRender === 'function') requestRender();
});
```

Watch for the existing v25-dispatch save/undo behaviour — these direct mutations may need wrapping in whatever undo-friendly pattern `v25SetProp()` or similar uses. Search the file for examples of "edit a selected entity and undo it cleanly". If there is no helper, accept the limitation and note it in the PR description.

#### File 2 — `dev/js/69-v25-dispatch.js`

Find `if (tool === 'v25-mem') {` (around line 338). Currently both first and second click run through the same two-click path. Add a fast-path before the `if (!v25State.dragStart)` branch:

```js
if (tool === 'v25-mem') {
  // Cross-section placement: single click, no drag, no rotation.
  if ((v25State.aspect || 'elev') === 'sec') {
    const props = {
      memberType: v25State.memberType,
      section: v25State.section,
      u: cu, v: cv,
      length: 0,
      rot: 0,
      aspect: 'sec',
      endA: 'normal',
      endB: 'normal',
    };
    if (v25State.memberType === 'pfc') {
      props.openSide = v25State.openSide || '-v';
    }
    const ent = v25Add('mem2', props);
    if (ent) {
      v25Selected = [ent.id];
      if (typeof v25UpdateInspector === 'function') v25UpdateInspector();
    }
    return true;
  }
  // Elevation aspect: existing two-click drag path. Unchanged below.
  if (!v25State.dragStart) { … }
}
```

The cross-section branch deliberately:
- skips the host-probe (`v25Mem2HostUnderCursor`) — cross-sections don't auto-join
- bypasses the snap pass at the end of the existing branch — same reason
- pre-selects the new entity so the user can immediately drag it or edit it

Test: with PFC tool armed and Aspect = "Cross-section", a single click on the canvas should place a C-shape.

#### File 3 — `dev/js/68-v25-tools.js`

In `drawMem2D()`'s `'pfc'` branch, the cross-section sub-branch currently uses the local rotation matrix `cosR/sinR` derived from `ent.rot`. The `project()` helper applies it. For cross-section, we want the C-shape drawn axis-aligned regardless of `ent.rot`.

Two options:

**Option A (surgical):** inside the `if (aspect === 'sec')` block of the PFC branch, build an alternate `projectSec()` that ignores `ent.rot`:

```js
if (aspect === 'sec') {
  const projectSec = (lu, lv) => real2px(blk, ent.u + lu, ent.v + lv);
  // … use projectSec instead of project in the strokeLine/fillPoly calls below
}
```

**Option B (broader, but cleaner):** zero `cosR/sinR` for the `'sec'` aspect across all member types. That makes cross-sections always axis-aligned, which matches every other drafting tool. UB, UC, WB, SHS, RHS, CHS branches all have the same issue in principle, though it manifests less because their cross-sections are symmetric. Recommend Option B with an option-bar override (a future "rotate cross-section" field on the inspector) if needed.

Implementation note: `cosR/sinR` is captured at the top of `drawMem2D()` (line ~367). Wrap that with a conditional:

```js
const rotEffective = (aspect === 'sec') ? 0 : (ent.rot || 0);
const rot = rotEffective * Math.PI / 180;
const cosR = Math.cos(rot), sinR = Math.sin(rot);
```

This makes every cross-section view axis-aligned. Test by toggling an existing rotated elevation member's aspect to 'sec' via the inspector — it should snap upright.

### Test plan for PR A

In `dev/index.html`:

1. Place PFC in elevation (drag two clicks). ✓ Already works.
2. Switch Aspect dropdown in options bar to "Cross-section" with the PFC still selected. Confirm the placed PFC flips in place to a C-shape, axis-aligned.
3. Switch the Open face dropdown between '-v' and '+v'. Confirm the C flips up ↔ down.
4. Click "Cross-section" Aspect first (entity de-selected), then single-click on canvas. Confirm a C-shape appears at the click point with no length, no rotation, ready for further editing.
5. Place an elevation PFC at 30° rotation. Use the inspector (Settings tab) to flip Aspect to 'sec'. Confirm the resulting C-shape is upright, NOT tilted 30°.
6. Undo / redo through all the above. No errors in console.

---

## Issue 2 — PFC does nothing in 3D Model mode (PR B)

### Symptoms

Toggle to 3D mode. Click PFC in the BB-rail Draw tab. Drag on any pane. Nothing visible happens (or the PFC appears only in the active pane and not in the others).

### Root causes

**2a — BB-rail tiles always invoke the V25 2D pipeline, regardless of `sheetMode`.**
`dev/js/74-v26-bb-rail.js` `getDrawTabDef()` (around line 186) wires every member tile's `onClick` to `v25PickAndSetMember(type)`. That sets `tool = 'v25-mem'`, which creates a `mem2` 2D entity in `entities2D[blk.viewKey]`. In 3D Model mode, that entity exists in only one pane (the one you drew it in) — it does not auto-project to the other panes the way a proper `objects3D` entry would.

`dev/js/60-tile-palette.js` line ~39 has the *correct* 3D path: clicks call `selectMemberBySection('pfc', section)` which sets up `drawMember = { type: 'pfc', section }` + `tool = 'draw-member'`. That flow ends in `dev/js/40-placement.js` line ~72, which calls `mkObj('pfc', ...)` and adds to `objects3D`. That properly renders in elevation/sectionA/planB via `drawSectionMember`.

Note this isn't unique to PFC — the BB-rail UB / UC / WB / SHS / RHS tiles have the identical bug. They were just never exercised in 3D mode.

**2b — The Three.js iso pane has no PFC builder.**
`dev/js/64-3d-engine.js` lines 247-252:

```js
objects3D.forEach(obj => {
  if (obj.type === 'ub') v3dBuildUB(obj);
  else if (obj.type === 'shs') v3dBuildSHS(obj);
  else if (obj.type === 'plate') v3dBuildPlate(obj);
  else if (obj.type === 'bolt') v3dBuildBolt(obj);
});
```

No branches for `'pfc' | 'rhs' | 'chs' | 'ea' | 'ua'`. So even when 2a is fixed and a proper `objects3D` PFC exists, the iso pane (the only Three.js view) renders nothing for it. The canvas-based elevation/sectionA/planB panes still work because they go through `drawSectionMember`.

### Fix plan for PR B

Touch two files. Both edits in `dev/`.

#### File 1 — `dev/js/74-v26-bb-rail.js`

Modify each member tile's `onClick` in `getDrawTabDef()` to branch on `sheetMode`. Cleanest is a helper at the top of the file:

```js
function bbMemberClick(type) {
  if (sheetMode === '2d') {
    return v25PickAndSetMember(type);
  }
  // 3D mode — go via the proper objects3D path so the member appears in all
  // four panes, not just the one we drew in.
  const def = (typeof lastUsedSection !== 'undefined' && lastUsedSection[type])
            || (typeof V25_MEM_DEFAULTS !== 'undefined' && V25_MEM_DEFAULTS[type])
            || '';
  if (def) selectMemberBySection(type, def);
}
```

Then change each tile from `onClick: () => v25PickAndSetMember('pfc')` to `onClick: () => bbMemberClick('pfc')`. Apply to all six member tiles (UB, UC, WB, PFC, SHS, RHS) for consistency. UB / UC / WB / SHS / RHS were silently broken in 3D mode too — they get fixed for free.

`V25_MEM_DEFAULTS` is defined in `dev/js/69-v25-dispatch.js` around line 167. It's already a global (classic script). The helper above will work without import gymnastics.

#### File 2 — `dev/js/64-3d-engine.js`

Add `v3dBuildPFC()` and route it in the dispatch. Geometry: extrude a C-shape polygon along the member axis.

Model after `v3dBuildSHS()` (which extrudes a hollow box). The local frame convention is documented around line 256-266 of the file:

> The canonical local frame of the UB / SHS / etc. meshes below is:
> length → local +X, depth → local +Y, width → local +Z

So the C-shape lives in the local Y-Z plane, extruded along local +X. The 8-vertex polygon is the same one the 2D `drawMem2D` PFC branch already computes — copy that logic.

Pseudocode:

```js
function v3dBuildPFC(obj) {
  const s = PFC_DB[obj.section]; if (!s) return;
  const { d, bf, tf, tw } = s;
  const hd = d / 2, hbf = bf / 2;
  const openUp = (obj.openSide || '-v') === '+v';
  // Build C polygon in local Y-Z plane: Y = depth, Z = width.
  // Match the 2D coords from drawMem2D — see dev/js/68-v25-tools.js 'pfc' / 'sec'.
  const ySpine = openUp ? -hd : +hd;
  const yOpen  = openUp ? +hd : -hd;
  const yFlangeInner = openUp ? yOpen - tf : yOpen + tf;
  const zSpine = -hbf;
  const zWebInner = -hbf + tw;
  const zOpen = +hbf;
  const shape = new THREE.Shape();
  shape.moveTo(zOpen, yOpen);
  shape.lineTo(zOpen, yFlangeInner);
  shape.lineTo(zWebInner, yFlangeInner);
  shape.lineTo(zWebInner, -yFlangeInner);
  shape.lineTo(zOpen, -yFlangeInner);
  shape.lineTo(zOpen, -yOpen);
  shape.lineTo(zSpine, -yOpen);
  shape.lineTo(zSpine, yOpen);
  shape.closePath();
  const geom = new THREE.ExtrudeGeometry(shape, { depth: obj.length, bevelEnabled: false });
  // Extrude direction is local +Z; we want local +X. Rotate the geometry
  // about Y so local Z → local X. (Mirrors v3dBuildSHS — copy its rotation
  // matrix exactly so the frame axes line up with UB/SHS conventions.)
  geom.rotateY(-Math.PI / 2);
  const mesh = new THREE.Mesh(geom, v3dMatBeam);
  // Apply pivot/orientation the same way v3dBuildUB does — copy the
  // _v3dApplyMemberFrame call pattern.
  const pivot = new THREE.Group();
  pivot.position.set(obj.x, obj.y, obj.z);
  pivot.add(mesh);
  _v3dApplyMemberFrame(pivot, obj);
  v3dScene.add(pivot);
  // Track for removal on next rebuild.
  v3dMembers.push(pivot);
}
```

Important details when copying from `v3dBuildSHS`:

- Use the **same material** (`v3dMatBeam` or whatever UB/SHS use).
- Use the **same edge-rendering** (the `v3dMatEdge` line overlay if present).
- Use the **same opacity/wireframe** treatment driven by `v3dOpts`.
- Push the pivot to **the same tracking array** so it gets cleared on rebuild.

Then add to the dispatch at line ~248:

```js
objects3D.forEach(obj => {
  if (obj.type === 'ub') v3dBuildUB(obj);
  else if (obj.type === 'shs') v3dBuildSHS(obj);
  else if (obj.type === 'pfc') v3dBuildPFC(obj);
  else if (obj.type === 'plate') v3dBuildPlate(obj);
  else if (obj.type === 'bolt') v3dBuildBolt(obj);
});
```

**Stretch goal for PR B (recommended):** also stub out `v3dBuildRHS`, `v3dBuildCHS`, `v3dBuildEA`, `v3dBuildUA` so the same pattern works for all V22.1 sections. Each is similar geometry — extrude a polygon along +X. CHS is a `THREE.CylinderGeometry` not an `ExtrudeGeometry`. EA/UA are L-shapes. RHS is the same as SHS but with non-square outer / inner. ~30 lines each. Don't gold-plate it; copy the patterns.

### Test plan for PR B

In `dev/index.html`:

1. Toggle to 3D mode. Four panes visible.
2. Click PFC tile in BB-rail Draw tab. Cursor changes to crosshair, status bar shows the PFC tool armed.
3. Drag in the elevation pane. Confirm the PFC appears as a side-view rectangle in elevation, as a C-shape (or top-view) in sectionA + planB, and as a 3D extruded C-shape in the iso pane.
4. Rotate the iso pane (mouse drag) to confirm the 3D mesh looks correct from multiple angles.
5. Open the inspector (Settings tab) for the placed PFC. Confirm `Open face` field is present. Toggle it — the C-shape orientation should flip in iso AND in sectionA.
6. Place a UB next to the PFC in elevation. Confirm both auto-mitre + weld at their intersection (the existing pipeline; the only change is that PFC now participates).
7. Save the project, reload, re-open the file. Confirm the PFC persists in 3D mode.

---

## Sequencing & non-goals

**PR A first.** Cross-section views are core daily activity for steel connection details (web side plates, baseplate cross-sections, etc.). 3D iso parity (PR B) is nice-to-have for sanity checks but most production drafting happens in elevation/sectionA/planB which already work.

**Non-goals for these PRs:**

- Don't extend to other section types beyond what's named (PFC and family).
- Don't refactor the BB-rail render pipeline. Just patch the onClicks.
- Don't fix the duplicated `v25Mem2Thickness` (CLAUDE.md known issue #1) — separate ticket, don't bundle.
- Don't touch the 3D Model palette in `60-tile-palette.js` — it already works. The bug is only in the BB-rail palette.
- Don't change PFC catalogue data — already AISC-correct.

---

## Workflow rules (from CLAUDE.md — non-negotiable)

1. **Edit `dev/` only.** Never touch root `js/`. After Dan verifies dev/ in a browser, he runs the mirror script himself.
2. **No git operations.** Don't stage, commit, push, branch. Dan does that.
3. **No build step.** Each file is a classic `<script>`. Run `node --check dev/js/NN-name.js` after editing.
4. **`'use strict';` at top of every js file** — already there, don't remove.
5. **Three.js r128 only.** Don't use APIs introduced after r128. `ExtrudeGeometry`, `Shape`, `CylinderGeometry`, `Group`, `Quaternion` are all fine.
6. **Bug fixes don't bundle with refactors.** Keep PR A and PR B independent. Don't sneak the duplicate-function fix or other CLAUDE.md known issues into either.
7. **Globals go in `07-globals.js` or `05-state.js`.** Not in your new code.
8. **One-line CHANGELOG entry per PR** in the existing Unreleased block.

---

## Suggested workflow per PR

1. Read `CLAUDE.md` end-to-end. Then re-read the relevant files referenced above.
2. Open `dev/index.html` in a browser and verify the current state (PFC works in 2D elevation, doesn't work in cross-section, doesn't work in 3D mode iso).
3. Make the changes file-by-file.
4. `node --check` each file as you go.
5. Reload `dev/index.html` and step through the test plan.
6. Console must stay clean.
7. Update `CHANGELOG.md` Unreleased block with a one-liner.
8. Stop. Hand back to Dan for the dev → root mirror and commit.

---

## Files referenced (quick index)

| File | What it owns | PR |
|---|---|---|
| `dev/js/64-3d-engine.js` | Three.js iso engine | PR B |
| `dev/js/68-v25-tools.js` | `drawMem2D()`, helpers | PR A |
| `dev/js/69-v25-dispatch.js` | V25 tool dispatch + placement | PR A |
| `dev/js/72-v25-options-bar.js` | Top options bar UI | PR A |
| `dev/js/74-v26-bb-rail.js` | Bluebeam-style left rail | PR B |
| `dev/js/02-data-sections.js` | PFC_DB (already correct) | reference only |
| `dev/js/31-draw-section.js` | 3D `drawSectionMember()` (already handles PFC) | reference only |
| `dev/js/18-section-profile.js` | `sectionProfile()` (already handles PFC) | reference only |

End of plan.
