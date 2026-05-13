# StructDraw — Combined Build Brief

**Two builds, one Claude Code session.** This document is the single source of truth for both. Read it end-to-end before doing anything else, then read `CLAUDE.md` end-to-end. Both are mandatory.

**Status:** Planned. Not started.
**Owner:** Dan McCarron.
**Authored:** 2026-05-12.

---

## 0. What you're building

### Build I — PFC Follow-up (bug fixes)
Two small PRs to make Parallel Flange Channel support production-quality. The previous session wired PFC into 2D-Studio mode and verified the 3D-mode canvas panes already render PFC via the unified `drawSectionMember` pipeline. Two issues remain:

- **PR A — Cross-section flow.** The Aspect dropdown (Elevation ↔ Cross-section) doesn't flip a placed PFC, and cross-section placement is broken because the placement flow requires a length drag.
- **PR B — 3D iso parity.** PFC doesn't work in 3D Model mode — the BB-rail Draw tab tile creates 2D entities instead of 3D objects, and the Three.js iso engine has no PFC mesh builder. The bug also affects UB/UC/WB/SHS/RHS — they were never exercised in 3D via BB-rail.

Scope: ~100–200 LOC across 5 files. Bug fixes, not refactors. See Part I below for full detail.

### Build II — Mitre & Priority Joints (feature)
Turn the current single-sided "brace clipped against host" join into a proper joint system with two render modes and support for joints of any arity:

- **Mitre joint mode** (default at 2-member corners) — both members clipped to the angle bisector with a fillet weld along the cut.
- **Priority mode** (default at 3+ member joints; opt-in for 2) — Priority 1 runs through unclipped; everyone else welds onto Priority 1, clipped against its outline. Optional cap plate on Priority 1's joined end. Priority 1 defaults to the first-drawn member.

Scope: ~960 LOC across 10 files (1 new) in V25 2D-mode only. Six phases. See Part II below.

---

## 1. Why a combined brief

These two builds were planned in separate chats. They share two files (`dev/js/69-v25-dispatch.js` and `dev/js/68-v25-tools.js`) and touch overlapping code paths in `drawMem2D` and the `v25-mem` placement branch. A unified brief lets you spot coordination opportunities the single-build briefs couldn't see — for example, both builds add logic to the `tool === 'v25-mem'` dispatch case, and there may be cleaner ways to factor that than landing each build's edits separately.

**You have authority to adjust the sequencing and the per-build internal phasing if you see a better path** — provided you (a) preserve every acceptance criterion, (b) keep `dev/` only edits, no commits, no build step, and (c) hand back to Dan at the same stop-and-test gates this brief calls out. If you do propose an adjusted plan, say so up front, explain why, and wait for Dan's nod before starting code.

---

## 2. Recommended sequence (your starting point)

```
PFC PR A   →   PFC PR B   →   Joints Phase 1   →   2   →   3   →   4   →   5   →   6
```

Eight stop-and-test gates. Each ends with `node --check` clean on every file touched, a CHANGELOG entry, and a one-paragraph summary back to Dan for him to test in `dev/index.html` before the next phase starts.

**Rationale:**
1. **Ship value fast.** PFC PRs are days of work, not weeks. Knocking them out first means Dan has cross-section flow and 3D iso working before we settle into the architectural Joints build.
2. **The shared file is easier to manage in this order.** If PFC PR A goes first, the cross-section single-click fast-path becomes a stable, tested piece of the `v25-mem` branch when Joints arrives. The Joints work then has a clear constraint: "do not regress the cross-section path; add joint creation only to the elevation two-click path." Reverse order forces re-editing the joint placement logic to handle cross-sections, which is more error-prone.
3. **No interleaving.** Joints is V25 2D-mode only; PR B is 3D iso. They never touch each other's files. Mixing phases would create reasoning overhead without saving time.

**Alternative orderings you might consider** (and reasons to reject):

- *Joints first, PFC after.* Rejected: holds Dan's PFC fixes hostage to a 6-phase architectural build.
- *Interleave PR A with Joints Phase 1.* Rejected: the data-model phase of Joints touches save/load and globals, not the placement branch — there's no real synergy.
- *Skip PR B, ship later.* Possible if time is short, but PR B is small (2 files) and the same `bbMemberClick` helper it introduces fixes UB/UC/WB/SHS/RHS at the same time. Worth doing in-session.

**If you see a different best path** — for example, you spot that PR A's `rotEffective` wrapper and Joints' bisector cap can be implemented together more cleanly, or that PFC's cross-section single-click can share a helper with Joints' end-classifier — tell Dan before starting. Don't silently reorder.

---

## 3. Workflow rules (non-negotiable; from `CLAUDE.md`)

1. **Edit `dev/` only.** Root `js/`, root `css/`, root `index.html` are released code — Dan mirrors `dev/` → root himself after each phase or PR.
2. **No git operations.** Don't stage, commit, push, branch. Dan does that.
3. **No build step.** Each `.js` is a classic `<script>`. Run `node --check dev/js/NN-name.js` after every edit.
4. **`'use strict';` at the top of every `dev/js/*.js` file.** Already there — don't remove.
5. **All globals live in `dev/js/05-state.js` or `dev/js/07-globals.js`.** Not scattered across new code.
6. **Three.js r128 only.** No APIs from r142+ (no `CapsuleGeometry`, etc.). `ExtrudeGeometry`, `Shape`, `CylinderGeometry`, `Group`, `Quaternion` are all fine.
7. **Classic scripts, not modules.** No `import` / `export`. Globals flow between files via load order.
8. **One-line `CHANGELOG.md` entry per phase or PR** in the existing Unreleased block.
9. **Bug fixes don't bundle with refactors.** The PFC PRs are explicitly framed this way. Same applies to Joints phases — keep them clean.
10. **Don't drive-by fix Known Issues** (`CLAUDE.md` Known Issues list — duplicate `v25Mem2Thickness`, `initEvents` size, V25 monkey patches, top-level globals, save schema versioning except where the Joints build explicitly bumps it, autosave, CDN vendoring). Those are separate tickets.
11. **Australian Standards only:** AS 1100 / AS 4100 / AS 3600 / AS 1101 / AS 1252 / NCC. Lineweights use the `LW` constants. Metric units, Y up in world coords, down on canvas.
12. **Per-file new-file rule.** New `js/NN-name.js` only when the change is ≥150 LOC AND topically distinct. Joints requires one new file: `dev/js/75-v25-joint-popup.js`.

---

## 4. File overlap & coordination matrix

| File | PFC PR A | PFC PR B | Joints | Coordination |
|---|---|---|---|---|
| `dev/js/05-state.js` | — | — | +5 (joints global) | Joints only |
| `dev/js/22-render-core.js` | — | — | +15 (flash + cap plate hooks) | Joints only |
| `dev/js/39-events.js` | — | — | +40 (joint hit-test, pick-mode) | Joints only |
| `dev/js/46-save-load.js` | — | — | +30 (schema v2 migration) | Joints only |
| `dev/js/50-project.js` | — | — | +20 | Joints only |
| `dev/js/64-3d-engine.js` | — | +60 (v3dBuildPFC) | — | PR B only |
| `dev/js/68-v25-tools.js` | +5 (rotEffective near line 367) | — | +400 (joint helpers, bisector cap, etc.) | **OVERLAP — same file, different functions. Land PR A first.** |
| `dev/js/69-v25-dispatch.js` | +25 (sec single-click fast-path) | — | +80 (end-vs-side classifier, joint creation) | **OVERLAP — same branch `tool === 'v25-mem'`, different sub-branches. Land PR A first; Joints preserves the sec fast-path.** |
| `dev/js/71-v25-selection.js` | — | — | +120 (joint inspector section) | Joints only |
| `dev/js/72-v25-options-bar.js` | +20 (apply aspect/openside to selection) | — | — | PR A only |
| `dev/js/74-v26-bb-rail.js` | — | +10 (bbMemberClick helper) | — | PR B only |
| **NEW** `dev/js/75-v25-joint-popup.js` | — | — | +250 | Joints only |
| `dev/index.html` | — | — | +1 (`<script>` tag) | Joints only |
| `CHANGELOG.md` | +1 | +1 | +6 (one per phase) | Append-only, no conflict |

**Coordination notes:**

- **`dev/js/69-v25-dispatch.js`**: PFC PR A adds a `sec`-aspect early return at the top of the `if (tool === 'v25-mem')` branch (single click, no drag, no rotation). Joints later modifies the elevation two-click path inside the same branch to call a new end-vs-side classifier and create or extend a joint on end-to-end contact. **The sec fast-path must be preserved**. The Joints phase that touches this file should run with the sec branch already in place and add its logic only to the elevation path.

- **`dev/js/68-v25-tools.js`**: PR A adds a small `rotEffective = (aspect === 'sec') ? 0 : (ent.rot || 0)` wrapper near the top of `drawMem2D`. Joints adds ~400 LOC of new functions (joint helpers, bisector cap, priority cap, hit-test, setters) **later** in the same file and turns `v25Mem2ResolveCap` into a dispatcher. The two changes are in different functions and don't directly conflict, but you must hold the conventions and patterns consistent — read the entire file before Joints' Phase 2 starts, even if PR A is already in.

---

## 5. Existing code reading list

Before starting any code, read these files in this order. This is the same reading list both builds need; doing it once at the start of the session is cheaper than reading-as-you-go.

1. `CLAUDE.md` — playbook, workflow rules, variable conventions, lineweight constants, Known Issues. **Not optional.**
2. `dev/js/68-v25-tools.js` — `drawMem2D` (~line 350), `v25Mem2ResolveCap` (~1020), `_drawCapWeld` (~549), `v25Mem2HostUnderCursor` (~977), `v25Mem2WorldOutline`, `v25Mem2WorldCentreline`, `v25FirstSegPolyHit`, `_v25SegSegIntersect`, `v25OpenEndCapPopup` (~1117). Both PFC PR A and Joints touch this.
3. `dev/js/69-v25-dispatch.js` — `tool === 'v25-mem'` branch (~line 332). Both PFC PR A and Joints touch this.
4. `dev/js/71-v25-selection.js` — end-handle drag (~877), inspector "Auto-mitre joins" block (~1019). Joints touches this.
5. `dev/js/39-events.js` — `dblclick` handler (~1087). Joints touches this. Note: the file is 1,400+ lines and is a Phase-2 refactor target in the playbook. **Minimise additions.**
6. `dev/js/22-render-core.js` — V25 overlay invocation site. Joints touches this.
7. `dev/js/46-save-load.js`, `dev/js/50-project.js` — Joints' save migration.
8. `dev/js/05-state.js`, `dev/js/07-globals.js` — where globals live.
9. `dev/js/23-auto-weld.js` — `showWeldPopup` is the style/UX reference for the new joint popup.
10. `dev/js/72-v25-options-bar.js` — PR A's edit site (~line 110) and the monkey-patch wrappers around `undo` / `v25Add` (Known Issue #3 — honour them, don't remove them).
11. `dev/js/74-v26-bb-rail.js` — `getDrawTabDef` (~line 186). PR B's edit site.
12. `dev/js/64-3d-engine.js` — Three.js iso engine. PR B's `v3dBuildPFC` lands here, modelled on `v3dBuildSHS`.
13. `dev/js/60-tile-palette.js` (~line 39) — the **correct** 3D placement path PR B will piggy-back on (`selectMemberBySection` → `drawMember = {…}` → `tool = 'draw-member'` → `40-placement.js`).
14. `dev/js/02-data-sections.js` — PFC_DB (already AISC-correct), SHS_DB, UB_DB, UC_DB. Reference only.

---

# PART I — PFC Follow-up

## I.A — PR A: Cross-section flow

### I.A.1 Symptoms

1. Place a PFC in 2D mode (drag two clicks → elevation rectangle appears). ✓ Works.
2. Try to flip its aspect to cross-section via the options-bar `Aspect` dropdown → nothing happens.
3. Try drawing a new PFC after switching options-bar Aspect to "Cross-section" → either nothing happens (drag too short) or you get a tilted parallelogram (drag's rotation got stamped onto a section view).

### I.A.2 Root causes

**1a — Aspect change in the options bar never reaches placed entities.**
`dev/js/72-v25-options-bar.js` line ~110: `wire('v25o-aspect', e => { v25State.aspect = e.target.value; v25UpdateOptionsBar(); });`. Only updates `v25State.aspect`, which is read at placement time in `dev/js/69-v25-dispatch.js` line ~359 (`aspect: v25State.aspect || 'elev'`). Never writes back to selected entities. Same bug on the new `v25o-openside` wire.

**1b — Two-click drag is wrong for cross-sections.**
`dev/js/69-v25-dispatch.js` line ~338: the `tool === 'v25-mem'` handler always requires a click + drag with `length > 5 mm` to place. For a cross-section there's no length to define — placement should be a single click. Today, dragging across the canvas stamps `rot = atan2(dy, dx)` onto the entity, so the C-shape renders at a random angle.

**1c — Switching an existing entity from elev to sec carries stale `rot`.**
Even if the user selects a placed elevation PFC and flips its `aspect` to `'sec'` via the inspector, the entity's `rot` (set from the elevation drag) still applies. The cleaner fix is for the cross-section renderer to ignore `ent.rot` regardless of how the entity got there.

### I.A.3 Fix plan

Touch three files. All edits in `dev/`. Bug fixes only — no structural refactors.

**File 1 — `dev/js/72-v25-options-bar.js`**

Replace `wire('v25o-aspect', …)` and `wire('v25o-openside', …)` (around line 110-115) so they also propagate to `v25Selected` entities:

```js
wire('v25o-aspect', e => {
  v25State.aspect = e.target.value;
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

Check whether `v25SetProp` (or equivalent) exists for undo-friendly mutation; if it does, use it. If not, accept the limitation and note it in the CHANGELOG entry. Honour the existing `72-v25-options-bar.js` monkey-patches around `undo` / `v25Add` (Known Issue #3) — don't remove or duplicate them.

**File 2 — `dev/js/69-v25-dispatch.js`**

Inside `if (tool === 'v25-mem')` (around line 338), add a single-click fast-path **before** the existing `if (!v25State.dragStart)` two-click logic:

```js
if (tool === 'v25-mem') {
  // Cross-section placement: single click, no drag, no rotation.
  if ((v25State.aspect || 'elev') === 'sec') {
    const props = {
      memberType: v25State.memberType,
      section: v25State.section,
      u: cu, v: cv,
      length: 0, rot: 0, aspect: 'sec',
      endA: 'normal', endB: 'normal',
    };
    if (v25State.memberType === 'pfc') props.openSide = v25State.openSide || '-v';
    const ent = v25Add('mem2', props);
    if (ent) {
      v25Selected = [ent.id];
      if (typeof v25UpdateInspector === 'function') v25UpdateInspector();
    }
    return true;
  }
  // Elevation aspect: existing two-click drag path. Unchanged.
  if (!v25State.dragStart) { … }
}
```

Sec branch skips the host probe (cross-sections don't auto-join) and bypasses the snap pass. Pre-selects the new entity for immediate editing.

**File 3 — `dev/js/68-v25-tools.js`**

In `drawMem2D`, wrap the `cosR`/`sinR` capture (line ~367) so cross-section views are always axis-aligned regardless of `ent.rot`:

```js
const rotEffective = (aspect === 'sec') ? 0 : (ent.rot || 0);
const rot = rotEffective * Math.PI / 180;
const cosR = Math.cos(rot), sinR = Math.sin(rot);
```

This is the broader of the two options in the original plan (Option B) — applies to UB/UC/WB/SHS/RHS/CHS cross-sections too. Justified because every other drafting tool draws cross-sections axis-aligned by default. If you find a reason this breaks an existing case, fall back to Option A (a localised `projectSec()` inside the PFC `'sec'` block) and document why.

### I.A.4 Test plan

In `dev/index.html`:

1. Place PFC in elevation (drag two clicks). ✓ Already works.
2. With the placed PFC selected, switch Aspect dropdown to "Cross-section" → PFC flips in place to an axis-aligned C-shape.
3. Switch Open face '-v' ↔ '+v' → C flips up ↔ down.
4. Deselect, click "Cross-section" in Aspect dropdown, single-click on canvas → C-shape appears at click point, no length, no rotation.
5. Place an elevation PFC at 30° rotation; flip its Aspect to 'sec' via inspector → upright, NOT tilted 30°.
6. Undo / redo through all the above. Console clean.

### I.A.5 Stop and hand back

Run `node --check` on the three files. Update `CHANGELOG.md`. Summarise to Dan: which files changed, LOC, acceptance check pass/fail, anything unexpected. Wait for green light.

---

## I.B — PR B: 3D iso parity

### I.B.1 Symptoms

Toggle to 3D mode. Click PFC in BB-rail Draw tab. Drag on any pane. Nothing visible happens, or the PFC appears only in the pane it was drawn in.

### I.B.2 Root causes

**2a — BB-rail tiles always invoke the V25 2D pipeline, regardless of `sheetMode`.**
`dev/js/74-v26-bb-rail.js` `getDrawTabDef()` (around line 186) wires every member tile's `onClick` to `v25PickAndSetMember(type)`. That sets `tool = 'v25-mem'`, which creates a `mem2` 2D entity. In 3D Model mode that entity exists in only one pane — it doesn't auto-project to the others the way a proper `objects3D` entry would. This bug affects UB / UC / WB / SHS / RHS too; they were never exercised in 3D via BB-rail.

`dev/js/60-tile-palette.js` line ~39 has the **correct** 3D path: `selectMemberBySection('pfc', section)` → `drawMember = { type: 'pfc', section }` + `tool = 'draw-member'` → ends in `dev/js/40-placement.js` line ~72 calling `mkObj('pfc', …)` which properly populates `objects3D` and renders via `drawSectionMember`.

**2b — The Three.js iso pane has no PFC builder.**
`dev/js/64-3d-engine.js` lines 247-252 dispatch covers `'ub'`, `'shs'`, `'plate'`, `'bolt'`. No branches for `'pfc' | 'rhs' | 'chs' | 'ea' | 'ua'`. So even when 2a is fixed and a proper `objects3D` PFC exists, the iso pane renders nothing for it.

### I.B.3 Fix plan

Touch two files. Both in `dev/`.

**File 1 — `dev/js/74-v26-bb-rail.js`**

Add a helper at the top of the file:

```js
function bbMemberClick(type) {
  if (sheetMode === '2d') return v25PickAndSetMember(type);
  const def = (typeof lastUsedSection !== 'undefined' && lastUsedSection[type])
            || (typeof V25_MEM_DEFAULTS !== 'undefined' && V25_MEM_DEFAULTS[type])
            || '';
  if (def) selectMemberBySection(type, def);
}
```

Then change each member tile (UB, UC, WB, PFC, SHS, RHS) in `getDrawTabDef()` from `onClick: () => v25PickAndSetMember('pfc')` to `onClick: () => bbMemberClick('pfc')`. Six tiles total — they all get fixed at once.

`V25_MEM_DEFAULTS` is global (`dev/js/69-v25-dispatch.js` line ~167). No import gymnastics needed.

**File 2 — `dev/js/64-3d-engine.js`**

Add `v3dBuildPFC(obj)`. Model after `v3dBuildSHS`. Geometry: extrude the same C-shape polygon that the 2D `drawMem2D` PFC branch already computes, along the member's local +X axis.

Local frame convention (line 256-266 of the file):
> length → local +X, depth → local +Y, width → local +Z

Pseudocode in the source plan covers the shape construction; copy the rotation-matrix and material patterns from `v3dBuildSHS` exactly. Critical: same material (`v3dMatBeam` or whatever UB/SHS use), same edge-rendering (`v3dMatEdge`), same opacity/wireframe treatment driven by `v3dOpts`, same tracking array so rebuild clears it.

Add to the dispatch at line ~248:
```js
else if (obj.type === 'pfc') v3dBuildPFC(obj);
```

**Stretch goal (dropped from this session).** The source plan suggested also stubbing `v3dBuildRHS / CHS / EA / UA`. **Don't do that in PR B.** Same `bbMemberClick` helper above already routes those types correctly; the 3D iso side is a separate ticket. If Dan wants those after both builds ship, he'll raise a fresh PR. Keep PR B focused.

### I.B.4 Test plan

1. Toggle to 3D mode. Four panes visible.
2. Click PFC tile in BB-rail Draw tab. Cursor → crosshair, status bar shows PFC tool armed.
3. Drag in elevation pane. PFC appears as side-view rectangle in elevation, C-shape (or top-view) in sectionA + planB, 3D extruded C-shape in iso pane.
4. Rotate iso pane (mouse drag). 3D mesh looks correct from multiple angles.
5. Inspector → toggle Open face → C flips in iso and sectionA.
6. Place a UB next to the PFC in elevation. Confirm auto-mitre + weld at intersection (existing pipeline — PFC just participates).
7. Save / reload / re-open. PFC persists.

### I.B.5 Stop and hand back

`node --check`. CHANGELOG. Summary. Wait for green light before starting Joints.

---

# PART II — Mitre & Priority Joints

## II.1 Goal

Replace the single-sided "brace clipped against host" mechanic with a proper joint system supporting two render modes:

- **Mitre joint mode** — default for 2-member meetings at corners. Both members clipped to the angle bisector. Fillet weld along the cut. Symmetric.
- **Priority mode** — default for 3+ member joints; opt-in for 2. Priority 1 renders unclipped (continues through the joint). Everyone else welds onto Priority 1, clipped against its outline. Optional cap plate on Priority 1's joined end. Priority 1 defaults to **first-drawn**; subsequent members take ascending priorities in draw order.

Dan must be able to flip between modes and reorder priorities via a popup that opens on double-click in the joint area.

## II.2 Scope

V25 2D-mode only (`sheetMode === '2d'`). 3D mode is out of scope for Joints.

## II.3 Data model — first-class joint

Joints are sheet-level objects parallel to `entities2D[viewKey]`:

```js
v25Joints[viewKey] = [
  {
    id: 'jnt-0001',
    members: [
      { memberId: 17, end: 'B', priority: 1 },    // first-drawn = priority 1
      { memberId: 22, end: 'A', priority: 2 },
      { memberId: 23, end: 'A', priority: 3 },
    ],
    mode: 'mitre' | 'priority',
    weld: { size: 6, type: 'fillet' },
    capPlate: {
      show: true,
      thk: 6,                  // mm; catalogue: 6 / 8 / 10 / 12 / 16 / 20
      overhang: 10,            // mm beyond Priority 1's outer faces
      label: true,             // draw "CAP PL 6 THK" leader
    },
  },
]
```

**Invariants:**
- `members.length >= 2`.
- `mode === 'mitre'` requires `members.length === 2`. Auto-promote to `'priority'` if a third joins.
- A `(memberId, end)` pair appears in at most ONE joint.
- Priority 1 is preserved across edits unless explicitly reassigned.

**New helpers in `dev/js/68-v25-tools.js`:**
- `v25JointForMemberEnd(viewKey, memberId, end) → joint | null`
- `v25JointPriority(joint, memberId, end) → 1 | 2 | … | null`
- `v25JointPriority1Member(joint) → { memberId, end }`
- `v25JointWorldOrigin(viewKey, joint) → { u, v }` (intersection of member centrelines, or centroid)

**Persistence:** saved per-view in `.sd2.json` under `sheet.v25Joints[viewKey]`. Schema bumped to `2`. Load-time migration upgrades any v1 pair where two members' `endXJoin.hostId` reference each other near each other's ends into a `mode: 'mitre'` joint. Side-contact joins stay on legacy fields.

## II.4 Placement behaviour

After each click during the `v25-mem` tool, probe with `v25Mem2HostUnderCursor` plus a new classifier `v25ClassifyContact(host, cu, cv) → 'end-A' | 'end-B' | 'side' | 'centreline-mid'` (end-zone band = same as `v25HitMemberEnd`).

On commit:
- **End-to-end contact** → joint:
  - If host's end already in a joint → push new member as `priority = members.length + 1`. Auto-promote to `'priority'` if it becomes 3-way.
  - Else → new joint, `members = [{host, 1}, {new, 2}]`, `mode = 'mitre'`.
- **Side contact** → legacy single-sided brace path (existing behaviour unchanged).

Default mode rules:
- 2-way joint → `mode: 'mitre'`.
- 3+-way joint → `mode: 'priority'`, priorities in draw order.

## II.5 Rendering rules

`v25Mem2ResolveCap(ent, end)` becomes a dispatcher. Return contract `{ topLocalX, botLocalX, weldSize }` unchanged so the existing call-sites in `drawMem2D` don't need shape changes.

```
v25Mem2ResolveCap(ent, end) =>
  joint = v25JointForMemberEnd(view, ent.id, end)
  if joint && mode === 'mitre'    → v25BisectorCap(ent, end, joint)
  if joint && mode === 'priority':
      priority = v25JointPriority(joint, ent.id, end)
      if priority === 1 → null   // no clip, full-length render
      else              → v25PriorityCap(ent, end, joint)
  // No joint: legacy single-sided brace path
  return <existing v25Mem2ResolveCap body>
```

### II.5.1 Bisector cap (mitre mode)

1. Each member's centreline direction at the joined end → outward unit vector.
2. Bisector direction = normalised sum of the two outward vectors (handles any angle).
3. Bisector line through joint origin (centreline intersection). Intersect with member's top + bottom edges in local frame → `topLocalX`, `botLocalX`.
4. Return `{topLocalX, botLocalX, weldSize: joint.weld.size}`.
5. Weld ticks via `_drawCapWeld` on the bisector. Drawing on both members puts ticks on both sides of the cut — that's correct AS 1101 for the butt at the mitre. Optional flag on the joint to suppress one side if double-stroke reads badly.

### II.5.2 Priority cap (non-Priority-1 members in priority mode)

Reuse existing `v25Mem2ResolveCap` body but force host = Priority 1's member. Walk edges, clip against Priority 1's outline polygon, weld ticks via `_drawCapWeld`.

### II.5.3 Cap plate (Priority 1 in priority mode)

After `drawMem2D` finishes Priority 1, draw a small rectangle in its local frame at the joined end:
- Width along Priority 1's depth = section depth + 2 × `capPlate.overhang`.
- Thickness along Priority 1's length = `capPlate.thk` (drawn outside the member, on the joint side).
- Lineweight = `LW.CUT`.
- Optional centre-line crosshair.
- Optional leader: `"CAP PL <thk> THK"` text + arrow, position upper-left by default.

Cap plate lives on the joint, not on a member, so deleting the joint removes the plate.

### II.5.4 Joint flash highlight (during priority-pick)

When `v25State.jointEdit` is active, after `drawV25AutoWelds` call `drawV25JointFlash(blk)`:
- For each joint member, stroke outline at `LW.CUT × 1.5` in `--accent` colour with `ctx.globalAlpha` oscillating 0.4 ↔ 1.0 at ~1.5 Hz.
- Animation via `requestAnimationFrame` looping `requestRender` while the popup is open.
- Currently assigned Priority 1 gets a static thicker outline (no pulse) so the user can tell it's locked in.

## II.6 Interaction

### II.6.1 Joint hit-test

`v25HitTestJoint(blk, px, py) → joint | null`. Walk `v25Joints[blk.viewKey]`, project each joint origin to pixels, return nearest within ~14 px.

### II.6.2 Double-click flow

In `dev/js/39-events.js` `dblclick` handler — insert BEFORE the existing `v25HitTestWeld` and `v25HitMemberEnd` branches at line ~1088:

```js
if (sheetMode === '2d' && tool === 'select' && activeBlock) {
  const joint = v25HitTestJoint(activeBlock, px, py);
  if (joint) {
    v25OpenJointPopup(joint, e.clientX, e.clientY);
    e.preventDefault();
    return;
  }
}
```

### II.6.3 Joint popup (new file `dev/js/75-v25-joint-popup.js`)

Style matches `v25OpenEndCapPopup` and `showWeldPopup` (same CSS variables, same shadow/border).

**Header:** "Joint — `<n>` members" + × close.

**Mode selector:**
- 2-way: radio Mitre joint (default) | Priority mode.
- 3+-way: header reads "Priority mode (auto)" — mode locked.

**Body (Mitre mode):**
- Weld size stepper.
- Read-only summary: "Bisector angle: 90.0°, weld length: 142 mm".

**Body (Priority mode):**
- Ordered member list with ▲▼ reorder controls and "Make Priority 1" radio per row.
- Cap plate sub-section: show checkbox, thickness dropdown (6 / 8 / 10 / 12 / 16 / 20), overhang stepper (default 10), show-label checkbox.
- Weld size stepper.

**Footer (only during `v25State.jointEdit.phase === 'pick'`):** "Pick on canvas: click a member to make it Priority 1, then click others to set 2, 3…"

### II.6.4 Priority-pick canvas loop

1. User clicks "Pick on canvas" in the popup (or just clicks a joint member while popup is in Priority mode).
2. Set `v25State.jointEdit = { jointId, phase: 'pick', assignments: [] }`.
3. Flash animation starts.
4. Intercept mousedown in dispatch: clicks on joint members append to `assignments` (Nth click = priority N). Clicks elsewhere ignored.
5. Re-render after each click so the popup's priority list updates live.
6. **Commit:** dblclick anywhere, Enter, or popup "Apply" button → write assignments to `joint.members`, padding any unassigned member onto the end in its previous priority order. Stop flash. Close popup.
7. **Cancel:** Esc or click outside → restore previous joint state from a snapshot taken when pick-mode started.

### II.6.5 Inspector integration (`dev/js/71-v25-selection.js`)

When the selected member has an end in a joint, replace the existing "Auto-mitre joins" inspector section with a "Joint" section:
- Read-only summary: joint id, member count, mode.
- Mode selector (3+-way locked to Priority).
- Priority readout + "Open joint popup" button.
- Cap plate controls when mode = priority.
- Weld size.

Popup and inspector both write through the same setters:
- `v25SetJointMode(joint, mode)`
- `v25SetJointPriorities(joint, orderedMemberRefs)`
- `v25SetJointCapPlate(joint, capPlatePartial)`
- `v25SetJointWeld(joint, weldPartial)`

Each setter calls `requestRender()` and emits an `undo` snapshot through the existing `72-v25-options-bar.js` monkey-patched `undo`.

## II.7 End-handle drag

In `dev/js/71-v25-selection.js` (~877-910), extend the live host-probe:
- In a joint + still in contact with joint's other members → keep joint, no change.
- Dragged away beyond catch tolerance → remove this `(memberId, end)` from the joint. If joint drops to 1 member, delete the joint.
- Dragged onto a different host → leave old joint (minus this member) and probe for a new join as today.

`v25ApplySnap` is unchanged (edge proximity only, not joint membership).

## II.8 Save migration

- Bump `schemaVersion` to `2` on saved sheets.
- New top-level `v25Joints` keyed by viewKey.
- Legacy `mem2.endAJoin / endBJoin` stay for back-compat (side-contact braces use them).
- On load with `schemaVersion < 2` or missing: scan every `mem2` for `endAJoin/endBJoin`. If the host's nearest end (probed at the brace's joined-end point) is within tolerance → pair into a new joint, `mode: 'mitre'`. Else leave as legacy single-sided. Idempotent.

## II.9 Export

- PDF (`dev/js/44-pdf-export.js`) goes through the canvas shim → `drawMem2D` → `v25Mem2ResolveCap`. Pickups joint rendering for free. Confirm visually.
- DXF (`dev/js/45-dxf-export.js`) emits geometry directly. Same `v25Mem2ResolveCap` for cap lines, but cap plate needs explicit DXF emission: add `dxfEmitJointCapPlates(joint)`. Loop joints after members.

## II.10 File-by-file change list

(See Section 4 for the combined matrix. Joints' contribution:)

- `dev/js/05-state.js` — add `v25Joints` global. +5.
- `dev/js/22-render-core.js` — invoke `drawV25JointFlash(blk)` after `drawV25AutoWelds`; cap-plate render hook after `drawMem2D` for each joint. +15.
- `dev/js/39-events.js` — `dblclick` joint hit-test before existing branches. Mousedown pick-mode intercept. Keydown Enter/Esc. +40 max. Keep additions minimal — this file is a Phase-2 refactor target.
- `dev/js/46-save-load.js` — serialise/deserialise `v25Joints`. Schema-v2 handshake. +30.
- `dev/js/50-project.js` — same, multi-sheet. +20.
- `dev/js/68-v25-tools.js` — joint helpers, bisector cap, priority cap, cap-plate renderer, joint hit-test, joint setters. +400.
- `dev/js/69-v25-dispatch.js` — placement classifier, joint creation, mousedown pick-mode intercept. +80.
- `dev/js/71-v25-selection.js` — inspector "Joint" section. End-handle drag joint sync. +120.
- **NEW** `dev/js/75-v25-joint-popup.js` — popup + pick-mode state machine + flash animation. +250.
- `dev/index.html` — `<script src="js/75-v25-joint-popup.js"></script>` after `js/74-v26-bb-rail.js`. +1.
- `CHANGELOG.md` — one line per phase.

## II.11 Phases

**Phase 1 — Data model + save/load migration.** Joints exist in data; no render or behaviour changes. Acceptance: round-trip a legacy `.sd2.json` with auto-mitre joins. Old behaviour visually unchanged.

**Phase 2 — Mitre joint rendering (2-way).** Bisector cap in `v25Mem2ResolveCap`. Placement creates 2-way mitre joints on end-to-end contact. Acceptance: reproduces "MITRE JOINT MODE" reference (SHS column + SHS beam at L-corner, both mitred at bisector, fillet weld ticks along cut).

**Phase 3 — Joint popup + Priority mode (2-way).** New `dev/js/75-v25-joint-popup.js`, joint hit-test, dblclick hook, priority-pick loop, flash highlight, cap plate rendering. Acceptance: dblclick a mitre joint → popup → switch to Priority → click beam to make it Priority 1 → vertical clips, cap plate appears on top of beam, leader visible. Matches "PRIORITY MODE" reference.

**Phase 4 — N-way joints.** Allow joints to grow ≥3 members; auto-promote mode on third member. Popup priority list with reorder. Acceptance: reproduces Dan's 3-way truss sketch (bottom chord = P1, vertical = P2, two diagonals = P3 + P4, all welded to bottom chord).

**Phase 5 — Inspector parity + DXF cap plate emission.** Inspector "Joint" section exposes the same controls as the popup. DXF cap plate emission. Acceptance: every popup field works identically from the inspector; DXF round-trip preserves the cap plate.

**Phase 6 — Polish.** Undo coverage for every joint mutation. Weld type override (fillet/butt/PP) on the joint. Plate-thickness catalogue dropdown everywhere it appears. Visual diff against STP Typical Structural Details PDF p. 85 details 6011.1–6011.6.

## II.12 Acceptance criteria — full feature

1. 2-way mitre joint in elevation: both members clipped to bisector, fillet weld ticks along cut. Lineweights AS 1100 compliant.
2. 2-way priority joint: Priority 1 unclipped, Priority 2 clipped against Priority 1's outer face, fillet weld ticks on Priority 2's cap, cap plate visible on Priority 1's joined end with optional "CAP PL t THK" leader.
3. 3-way joint defaults to Priority mode with first-drawn = Priority 1. Subsequent members weld onto Priority 1 (not onto each other).
4. Joint state survives save/load round-trip.
5. Legacy `.sd2.json` files migrate to paired mitre joints on load.
6. PDF and DXF reproduce the joint cleanly.
7. Single-sided brace-into-chord joins keep working unchanged.
8. Undo undoes one joint mutation at a time.
9. Dragging a member end away from a joint cleanly breaks its membership.

## II.13 Out of scope

- 3D world joints (V25 2D-mode only for this build).
- Bolted moment connections — flange plates, end plates, web cleats.
- Weld type override beyond fillet vs full-pen (symbol only, no partial-pen geometry differences).
- Pre-defined "common joint" templates (portal knee, ridge, baseplate). Future builds.
- Tooltips and onboarding for the popup.

## II.14 Known quirks to watch

- `dev/js/68-v25-tools.js` has `v25Mem2Thickness` defined twice (~734 and ~880). Do not fix in passing (`CLAUDE.md` Known Issue #1). Build must not introduce a third definition.
- `dev/js/39-events.js` is 1,400+ lines (Known Issue #2). Keep additions minimal — popup logic lives in `js/75-v25-joint-popup.js`, not inside events.
- V25 monkey patches in `dev/js/72-v25-options-bar.js` wrap `undo` and `v25Add` (Known Issue #3). Joint mutations must go through them so undo works.
- All new globals go in `dev/js/05-state.js` or `dev/js/07-globals.js` per the playbook. No scattered top-level `let`s.

## II.15 Test fixtures Dan will prepare

- `tests/fixtures/joint-mitre-90.sd2.json` — UB column + UB beam at 90°, mitre.
- `tests/fixtures/joint-mitre-45.sd2.json` — same at 45° (validates non-orthogonal bisector).
- `tests/fixtures/joint-priority-2way.sd2.json` — column + beam with cap plate.
- `tests/fixtures/joint-priority-3way.sd2.json` — Dan's truss markup case.
- `tests/fixtures/joint-legacy-v1.sd2.json` — pre-build save, validates migration.

No automated harness yet (Phase-3 wishlist). Open + visually verify at each phase.

---

# 6. Combined out-of-scope

- Don't fix `CLAUDE.md` Known Issues in passing. Especially: duplicate `v25Mem2Thickness`, `initEvents` size, V25 monkey patches structural rewrite, top-level globals lift, save schema versioning (beyond what Joints Phase 1 needs), autosave, CDN vendoring, V1→V2 regression list.
- Don't refactor `dev/js/39-events.js` or the BB-rail render pipeline beyond minimum patches.
- Don't touch `dev/js/60-tile-palette.js` — already works.
- Don't extend PFC PR B's 3D iso parity to RHS/CHS/EA/UA in this session. Separate ticket.
- Don't change PFC catalogue data — already AISC-correct.
- Don't add bolted-connection or template features inside Joints.

---

# 7. Combined acceptance — done means

1. PR A test plan (Section I.A.4) passes. Cross-section single-click placement works. Aspect dropdown flips placed entities. No tilted cross-sections.
2. PR B test plan (Section I.B.4) passes. PFC works end-to-end in 3D Model mode across all four panes. BB-rail member tiles route correctly for all six section types.
3. All 9 Joints acceptance items (Section II.12) pass against Dan's five test fixtures.
4. No new console errors in `dev/index.html`.
5. `CHANGELOG.md` has one Unreleased entry per PR / phase.
6. `dev/` mirrors cleanly to root with no extra files Dan didn't ask for.

---

# 8. What to do if you find a better path

The recommended sequence (PR A → PR B → Joints 1–6, eight gates total) is **a default, not a constraint**. If, during your initial reading pass, you spot:

- A clean shared helper that lets PR A and a later Joints phase land in the same edit (e.g. unifying placement-time contact classification, since both builds add similar logic to `tool === 'v25-mem'`),
- A render path overlap that means PR A's `rotEffective` wrapper and Joints' bisector cap can be tested against the same fixture,
- A way to collapse two gates into one without losing test coverage,
- A reason to do Joints Phase 1 (data model + migration only, no rendering) BEFORE PR B because they're file-disjoint and migrating save files earlier de-risks the rest of the build,

…then write the adjusted plan up as a single short note to Dan **before writing code**. Quote which section of this brief you're deviating from, why, and what the new gate list looks like. Wait for his nod. Don't silently reorder.

Areas where you should NOT deviate without explicit approval:
- Workflow rules (Section 3).
- Schema-v2 migration semantics (Section II.8).
- Phase-by-phase acceptance criteria (Sections I.A.4, I.B.4, II.12).
- Known Issues guardrail (Sections 3.10, II.14, 6).

---

# 9. How to hand back at each gate

At every stop-and-test gate, post the following to Dan:

1. **Files changed**: list of files + ± LOC each.
2. **What you did**: 3–6 bullets, no fluff.
3. **`node --check` results**: list each file + "clean" or the error.
4. **Acceptance check**: the criterion for this gate from the relevant test plan, with how you verified it (manual reasoning, looking at the code path, etc. — you can't run the browser, so make your reasoning visible).
5. **CHANGELOG entry**: the one-liner you added.
6. **Anything unexpected**: edge cases, quirks, places you stopped short.
7. **What's next**: the next gate's first action.

Then **stop**. Do not start the next phase until Dan says go.

---

# 10. Source attribution

This brief consolidates two prior planning docs:
- `MITRE_PRIORITY_JOINTS_BUILD.md` (Joints, authored in a parallel session).
- `PFC_FOLLOWUP_PLAN.md` (PFC follow-up, authored in another parallel session).

Both source docs are now superseded by this combined brief. If you want to cross-check a detail in either, they're still on disk — but treat this file as authoritative if they disagree.

---

*End of brief.*
