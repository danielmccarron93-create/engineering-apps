## Mitre & Priority Joints — Build Spec

**Status:** Planned. Not started.
**Owner:** Dan McCarron.
**Scope:** V25 2D-mode only (`sheetMode === '2d'`). 3D mode is out of scope.
**Last updated:** 2026-05-12.

---

## 1. Goal

Turn the current single-sided "brace clipped against host" behaviour into a proper joint system with two render modes and support for joints of any arity.

**Mitre joint mode (default for 2 members):** Both members are clipped to the angle bisector and a fillet weld is drawn along the cut. Symmetric. Used for L-corners and similar two-member meetings.

**Priority mode (default for 3+ members; opt-in for 2):** The Priority 1 member renders unclipped (continues through the joint). Every other member welds onto Priority 1, clipped against its outline. An optional cap plate sits on Priority 1's joined end. Priority 1 is, by default, the **first-drawn** member; subsequent members take ascending priority numbers in draw order.

Dan must be able to flip between modes and reorder priorities via a popup that opens on double-click anywhere in the joint area.

---

## 2. What exists today (so the implementer can read it before changing it)

Pertinent reading, in this order:

1. `js/68-v25-tools.js`
   - `drawMem2D` (line ~350) — the V25 member renderer for elevation and section.
   - `v25Mem2ResolveCap` (line ~1020) — current brace-against-host cap resolver. Walks the brace's top/bottom edges back from the far end, intersects with the host's outline polygon, returns `{topLocalX, botLocalX, weldSize}`. The whole new render logic should plug in here.
   - `_drawCapWeld` (line ~549) — AS 1101 fillet tick hatching along a cap line.
   - `v25Mem2HostUnderCursor` (line ~977) — host probe used at placement time.
   - `v25Mem2WorldOutline`, `v25Mem2WorldCentreline`, `v25FirstSegPolyHit`, `_v25SegSegIntersect` — geometry helpers we'll reuse.
   - `computeV25WeldInterfaces` / `drawV25AutoWelds` / `v25HitTestWeld` — the face-stack auto-weld pipeline (separate from member-to-member joins; not the same thing).
   - `v25OpenEndCapPopup` (line ~1117) — the existing pattern for small popups anchored to the cursor.
2. `js/69-v25-dispatch.js`
   - The `tool === 'v25-mem'` branch (line ~332) — placement workflow, where host probing currently fires.
3. `js/71-v25-selection.js`
   - End-handle drag section (line ~877) — keeps the join in sync as members are dragged.
   - Inspector "Auto-mitre joins" block (line ~1019) — current inspector exposure of `endAJoin`/`endBJoin`.
4. `js/39-events.js`
   - `dblclick` handler (line ~1087) — where the joint popup will hook in, before the existing `v25HitTestWeld` and `v25HitMemberEnd` branches.
5. `js/22-render-core.js` — invocation site for V25 overlays (joint flash highlight will hook here).

The single-sided join still has value: a brace meeting the side (not the end) of a chord is the original use case. The new joint system should run **alongside** that, not replace it.

---

## 3. Data model — first-class joint

A joint is a sheet-level object stored per viewKey, parallel to `entities2D[viewKey]`:

```js
v25Joints[viewKey] = [
  {
    id: 'jnt-0001',
    members: [
      // ordered by priority — index 0 = priority 1
      { memberId: 17, end: 'B', priority: 1 },
      { memberId: 22, end: 'A', priority: 2 },
      { memberId: 23, end: 'A', priority: 3 },
    ],
    mode: 'mitre' | 'priority',
    weld: { size: 6, type: 'fillet' },     // applied to all auto-welds emitted by this joint
    capPlate: {                             // only meaningful in priority mode
      show: true,
      thk: 6,                               // mm; catalogue: 6 / 8 / 10 / 12 / 16 / 20
      overhang: 10,                         // mm beyond Priority 1's outer faces
      label: true,                          // draw "CAP PL 6 THK" leader
    },
  },
]
```

**Invariants:**
- `members.length >= 2`.
- `mode === 'mitre'` requires `members.length === 2`. If a third member is added, `mode` is auto-promoted to `'priority'` and priorities are assigned in draw order.
- A given `(memberId, end)` pair can appear in at most ONE joint.
- Priority 1 is preserved across edits unless the user explicitly reassigns it.

**Lookup helpers (new, in `js/68-v25-tools.js`):**
- `v25JointForMemberEnd(viewKey, memberId, end) -> joint | null`
- `v25JointPriority(joint, memberId, end) -> 1 | 2 | … | null`
- `v25JointPriority1Member(joint) -> { memberId, end }`
- `v25JointWorldOrigin(viewKey, joint) -> {u, v}` — the natural pick location for the joint (intersection of all member centrelines, or centroid when they don't intersect cleanly).

**Persistence:** Saved in `.sd2.json` under `sheet.v25Joints[viewKey]`. Schema version bumped to `2`. Load-time migration: for any v1 file with `mem2.endAJoin` / `endBJoin` referencing another member's end (i.e. that member also points back at this one within tolerance), upgrade to a paired joint with `mode: 'mitre'`. Single-sided brace-into-side joins (host probe hit the SIDE not the END) stay on the legacy fields and continue to use the old code path.

---

## 4. Placement behaviour

When the user places a member via the `v25-mem` tool:

1. After each click, probe with an **enriched** host detector that returns not just the host member but also which **end-zone** of the host the cursor is in:
   - `v25Mem2HostUnderCursor` already finds the nearest member.
   - Add a classifier `v25ClassifyContact(host, cu, cv)` returning `'end-A' | 'end-B' | 'side' | 'centreline-mid'`. End-zones are the same `endZone` band as `v25HitMemberEnd` (half a section depth or 25 % of length, whichever is smaller).
2. On second click (commit), decide joint vs legacy:
   - **End-to-end contact** (cursor in host end-zone, new member's joined end lands there) → create or extend a joint:
     - If the host's end is already in a joint → push the new member as `priority = members.length + 1`. Auto-promote mode to `'priority'` if it becomes 3-way.
     - If not → create a new joint with `members = [{host, 1}, {new, 2}]`, `mode = 'mitre'`.
   - **Side contact** (cursor in host middle, hits centreline or outline mid-span) → keep the existing single-sided brace path: write `endXJoin.hostId` on the new member only, mode stays implicit ('mitre' against the host outline). This is unchanged behaviour.
3. The "first click joins endA" trick at `js/69-v25-dispatch.js:339` works the same way but pushes into the joint instead of a single field when end-to-end.

**Default mode rules at creation:**
- 2-way joint → `mode: 'mitre'`.
- 3+-way joint → `mode: 'priority'`, priorities in **draw order** (first drawn = priority 1).

**No regression:** placing a member with no near-host commit produces the same standalone member as today.

---

## 5. Rendering rules

`v25Mem2ResolveCap(braceEnt, endKey)` becomes a dispatcher. Its return contract `{ topLocalX, botLocalX, weldSize }` stays the same so the existing call-sites in `drawMem2D` for UB/UC and SHS/RHS/CHS don't need to change shape.

```
v25Mem2ResolveCap(ent, end) =>
  joint = v25JointForMemberEnd(view, ent.id, end)
  if joint && joint.mode === 'mitre'  → return v25BisectorCap(ent, end, joint)
  if joint && joint.mode === 'priority':
      priority = v25JointPriority(joint, ent.id, end)
      if priority === 1 → return null   // no clip, full-length render
      else              → return v25PriorityCap(ent, end, joint)   // clip against priority-1's outline
  // No joint: legacy single-sided brace path
  return <existing v25Mem2ResolveCap body>
```

### 5.1 Bisector cap (mitre mode)

Inputs: two members meeting at a corner.

1. Get each member's centreline direction at the joined end (unit vector pointing away from the joint).
2. Bisector direction = normalised sum of the two outward unit vectors (handles any angle).
3. Bisector line passes through the **joint origin** (centreline intersection). Find the bisector line's intersection with the member's top edge and bottom edge in the member's local frame → `topLocalX`, `botLocalX`.
4. Return `{topLocalX, botLocalX, weldSize: joint.weld.size}`.
5. Weld hatching: `_drawCapWeld` already draws ticks along the cap line. For mitre joints, drawing it on both members puts ticks on both sides of the cut — that's correct AS 1101 for a butt weld at the mitre. Optionally suppress on the second member to avoid double-stroking; leave a flag on the joint if needed later.

### 5.2 Priority cap (priority mode, non-Priority-1 members)

Reuse the existing `v25Mem2ResolveCap` body but force the host to be **Priority 1's member** (not whatever the legacy `endXJoin.hostId` says). The brace's top/bottom edges are walked back and clipped against Priority 1's outline polygon. Weld ticks via `_drawCapWeld` as today.

### 5.3 Cap plate (priority mode, on Priority 1)

After `drawMem2D` finishes the Priority 1 member, draw the cap plate as a small rectangle in Priority 1's local frame at its joined end:

- Width along Priority 1's depth = section depth + `2 × capPlate.overhang`.
- Thickness along Priority 1's length = `capPlate.thk` (drawn on the OUTSIDE of the member — i.e. on the joint side, normal to Priority 1's centreline).
- Lineweight = `LW.CUT` (it's a section through a plate).
- Optional centre-line crosshair at the plate centroid.
- Optional leader: `"CAP PL <thk> THK"` text + arrow pointing at the plate. Position the text box to the upper-left of the plate by default; reuse the same primitives as the V25 leader tool (`drawLeader2D` if separated, otherwise inline).

Cap plate lives on the joint, not on a member, so deleting the joint removes the plate.

### 5.4 Joint flash highlight (during priority-pick interaction)

When `v25State.jointEdit` is active, after `drawV25AutoWelds(blk, cs)` in the render path, call `drawV25JointFlash(blk)`:

- For each member referenced by the joint being edited, stroke the outline polygon at `LW.CUT` × 1.5 in `--accent` colour with `ctx.globalAlpha` oscillating between 0.4 and 1.0 at ~1.5 Hz.
- Animation via `requestAnimationFrame` looping `requestRender` while the popup is open.
- The currently assigned Priority 1 (if any) gets a static thicker outline, no pulse — so the user can tell which one is "locked in" already.

---

## 6. Interaction

### 6.1 Joint hit-test

```
v25HitTestJoint(blk, px, py) → joint | null
```
Walks `v25Joints[blk.viewKey]`. For each joint, compute `v25JointWorldOrigin`, project to pixels, return the closest within ~14 px. Tie-break by smaller distance.

### 6.2 Double-click flow

In `js/39-events.js` `dblclick` handler — insert BEFORE the existing `v25HitTestWeld` and `v25HitMemberEnd` branches at line ~1088:

```
if (sheetMode === '2d' && tool === 'select' && activeBlock) {
  const joint = v25HitTestJoint(activeBlock, px, py);
  if (joint) {
    v25OpenJointPopup(joint, e.clientX, e.clientY);
    e.preventDefault();
    return;
  }
}
```

### 6.3 Joint popup (new file: `js/75-v25-joint-popup.js`)

Visual style matches `v25OpenEndCapPopup` and `showWeldPopup` (same CSS variables, same shadow/border).

**Header:** "Joint — <n> members" with a small × close button.

**Mode selector:**
- 2-way: radio buttons — Mitre joint (default) | Priority mode.
- 3+-way: header reads "Priority mode (auto)" — mode is locked, no Mitre option.

**Body when Mode = Mitre:**
- Weld size stepper (mm).
- Read-only summary: "Bisector angle: 90.0°, weld length: 142 mm".

**Body when Mode = Priority:**
- Ordered list of members showing current priority and section label, e.g.:
  ```
  1 ▲▼  SHS 89×5     (vertical)        [Make Priority 1]
  2 ▲▼  SHS 89×5     (beam)
  3 ▲▼  SHS 89×5     (diagonal)
  ```
  ▲▼ buttons re-order. "Make Priority 1" radio per row (alternative to drag).
- Cap plate sub-section (only when Priority mode):
  - Show cap plate checkbox.
  - Thickness dropdown: 6 / 8 / 10 / 12 / 16 / 20.
  - Overhang stepper (default 10).
  - Show label checkbox.
- Weld size stepper.

**Footer:** "Pick on canvas: click a member to make it Priority 1, then click others to set 2, 3…" — only shown when the popup is open and `v25State.jointEdit.phase === 'pick'`.

### 6.4 Priority-pick canvas loop

When the user clicks "Pick on canvas" inside the popup (or just clicks a member while the popup is open in Priority mode), the canvas enters pick-mode:

1. Set `v25State.jointEdit = { jointId, phase: 'pick', assignments: [] }`.
2. Start the flash animation (Section 5.4).
3. Intercept mousedown on the canvas in `js/69-v25-dispatch.js`:
   - If the click hits a joint member → append `{memberId, end}` to `assignments`. The Nth click becomes priority N.
   - If the click hits a non-joint member → ignore.
   - If the click misses everything → ignore (don't deselect).
4. Re-render after each click so the popup's priority list updates live.
5. **Commit:** double-click anywhere, press Enter, or click "Apply" in the popup. Write `assignments` to `joint.members` in order, padding any unassigned member onto the end in its previous priority order. Stop the flash. Close the popup.
6. **Cancel:** Esc or click outside. Restore previous joint state from a snapshot taken when pick-mode started.

### 6.5 Inspector integration (`js/71-v25-selection.js`)

When the selected member has an end that participates in a joint, the existing "Auto-mitre joins" inspector section is replaced by a "Joint" section:

- Read-only summary: joint id, member count, mode.
- Mode selector (same options as the popup; 3+-way locks to Priority).
- Priority controls (read-only "You are Priority N" + "Open joint popup" button).
- Cap plate controls when mode = priority.
- Weld size.

The inspector and the popup write through the same setter functions:
- `v25SetJointMode(joint, mode)`
- `v25SetJointPriorities(joint, orderedMemberRefs)`
- `v25SetJointCapPlate(joint, capPlatePartial)`
- `v25SetJointWeld(joint, weldPartial)`

Each setter calls `requestRender()` and emits an `undo` snapshot.

---

## 7. End-handle drag

In `js/71-v25-selection.js:877-910`, the existing live host-probe must extend to joints:

- If the dragged end is in a joint and stays in contact with the joint's other members → keep the joint, no change.
- If it's dragged away from the joint origin by more than the catch tolerance → remove this `(memberId, end)` from the joint. If the joint drops to 1 member, delete the joint.
- If it's dragged onto a different host → leave the old joint (minus this member) and probe for a new join target as today.

Snapping (`v25ApplySnap`) should keep working with no changes — it only deals with edge proximity, not joint membership.

---

## 8. Inspector & save migration

**Save format (`js/46-save-load.js`, `js/50-project.js`):**
- New top-level `schemaVersion: 2` on the saved sheet.
- New field `v25Joints` keyed by viewKey, mirrors `entities2D` shape.
- Old `mem2.endAJoin / endBJoin` stay on the entity for back-compat (legacy brace-into-side joins still use them).

**Load-time migration (run when `schemaVersion < 2` or missing):**
1. For each `mem2` in `entities2D[viewKey]`, if it has `endAJoin` or `endBJoin` pointing to another `mem2`:
   - Check whether the host's nearest end (via `v25Mem2HostUnderCursor` against the brace's joined-end point) is within tolerance.
   - If yes → pair them into a new joint with `mode: 'mitre'`.
   - If no (side contact) → leave the single-sided field alone.
2. Bump `schemaVersion` to 2.
3. Migration runs idempotently on every load before any user interaction.

---

## 9. Export

- `js/44-pdf-export.js` and `js/45-dxf-export.js` re-walk `entities2D` and call `drawMem2D` (PDF via canvas shim) or emit cap geometry directly (DXF). Since `v25Mem2ResolveCap` is the single source of truth for cap line geometry, **both export paths should pick up the new rendering for free** — confirm by visual diff and DXF round-trip after Phase 2.
- Cap plate rendering needs an explicit DXF emission (rectangle + optional label) since DXF doesn't go through canvas. Add `dxfEmitJointCapPlates(joint)` in `js/45-dxf-export.js`. Loop joints after members.

---

## 10. File-by-file change list

| File | Change | LOC est. |
|---|---|---|
| `js/05-state.js` | Add `v25Joints` global object keyed by viewKey | +5 |
| `js/22-render-core.js` | Call `drawV25JointFlash(blk)` after `drawV25AutoWelds`; cap-plate render hook after `drawMem2D` for each joint | +15 |
| `js/39-events.js` | `dblclick`: joint hit-test before existing branches. Mousedown: pick-mode intercept when `v25State.jointEdit` is active. Keydown: Enter/Esc in pick-mode | +40 |
| `js/46-save-load.js` | Serialise/deserialise `v25Joints`; schema-version handshake | +30 |
| `js/50-project.js` | Same, multi-sheet flavour | +20 |
| `js/68-v25-tools.js` | Joint helpers, bisector cap, priority cap, cap-plate renderer, joint hit-test, joint setters | +400 |
| `js/69-v25-dispatch.js` | Placement: classify end vs side contact, push into or create joints. Mousedown pick-mode intercept | +80 |
| `js/71-v25-selection.js` | Inspector "Joint" section. End-handle drag joint sync | +120 |
| **NEW** `js/75-v25-joint-popup.js` | Popup, pick-mode state machine, flash animation | +250 |
| `index.html` | Add `<script src="js/75-v25-joint-popup.js"></script>` after `js/74-v26-bb-rail.js` | +1 |
| `CHANGELOG.md` | One-line entry | +1 |

Approx total: ~960 LOC across 9 existing files + 1 new file.

---

## 11. Phased delivery

Each phase ends with a working, manually-tested dev/ state. Dan reviews and mirrors dev → root between phases.

**Phase 1 — Data model + load/save migration.**
- Add `v25Joints` global, save/load wiring, migration of existing files.
- No rendering or behaviour changes yet — joints exist in data only.
- Acceptance: open an existing `.sd2.json` with auto-mitre joins, save it, reopen — joints round-trip cleanly. Old behaviour visually unchanged.

**Phase 2 — Mitre joint rendering (2-way only).**
- Bisector cap implementation in `v25Mem2ResolveCap`.
- Placement creates a 2-way mitre joint on end-to-end contact.
- Acceptance: place an SHS column then an SHS beam meeting at the top → both members render mitred at the bisector, fillet weld along the cut. Reproduces the "MITRE JOINT MODE" reference in Dan's markup.

**Phase 3 — Joint popup + Priority mode (2-way).**
- Add `js/75-v25-joint-popup.js`, joint hit-test, dblclick hook.
- Priority pick loop with flash highlight.
- Cap plate rendering.
- Acceptance: double-click a 2-way mitre joint → popup opens → switch to Priority → click the beam to make it Priority 1 → vertical clips, cap plate appears on top of the beam, "CAP PL 6 THK" leader visible. Matches "PRIORITY MODE" reference in Dan's markup.

**Phase 4 — N-way joints.**
- Allow joints to grow to 3+ members; auto-promote mode on third member.
- Popup priority list with reorder controls.
- Acceptance: place horizontal chord, then vertical at the chord's mid-span (end-to-side, this stays legacy single-sided OR becomes a joint depending on contact classification — confirm with Dan during build), then two diagonals → end result matches Dan's 3-way truss markup with Priority 1 = chord, Priority 2 = vertical, Priority 3 + 4 = diagonals.

**Phase 5 — Inspector parity + DXF cap plate emission.**
- "Joint" section in inspector exposes the same controls as the popup.
- DXF export emits cap-plate rectangles + labels.
- Acceptance: every popup field works identically from the inspector. DXF round-trip preserves the cap plate.

**Phase 6 — Polish.**
- Undo/redo coverage for joint mutations.
- Weld type override (fillet/butt/PP) on the joint.
- Catalogue dropdown for plate thickness everywhere.
- Visual diff against reference: STP Typical Structural Details PDF, p. 85, details 6011.1–6011.6.

---

## 12. Acceptance criteria — full feature

A joint detail is considered good enough when:

1. A 2-way mitre joint in elevation renders both members clipped to the bisector, fillet weld ticks along the cut. Lineweights AS 1100 compliant (cuts `LW.CUT`, weld ticks `LW.HATCH`).
2. A 2-way priority joint renders Priority 1 unclipped, Priority 2 clipped against Priority 1's outer face, fillet weld ticks on Priority 2's cap. Cap plate visible on Priority 1's joined end with optional "CAP PL t THK" leader.
3. A 3-way joint defaults to Priority mode with first-drawn = Priority 1. Subsequent members weld onto Priority 1 (NOT onto each other), each with its own fillet weld cap.
4. Joint state survives save/load round-trip.
5. Joints in legacy `.sd2.json` files (no `v25Joints` field) migrate to paired mitre joints on load.
6. PDF export and DXF export reproduce the joint cleanly.
7. Single-sided brace-into-chord joins (cursor on host side, not host end) keep working exactly as today.
8. Undo undoes one joint mutation at a time.
9. Dragging a member end away from a joint cleanly breaks its membership; dragging onto another joint extends that joint.

---

## 13. Out of scope (this build)

- 3D world joints. `js/64-3d-engine.js` and friends are untouched.
- Bolted moment connections — flange plates, end plates, web cleats. Future builds.
- Weld type override beyond fillet vs full-pen (no partial-pen geometry differences for now — weld symbol only).
- Pre-defined "common joint" templates (e.g. portal knee, ridge, base plate templates). Phase 7+.
- Tooltips and onboarding for the popup.

---

## 14. Known quirks / things to watch

- `js/68-v25-tools.js` has `v25Mem2Thickness` defined twice (lines ~734 and ~880). Do **not** fix this in passing — it's a pre-existing ticket in `CLAUDE.md` Known Issues. The build must not introduce a third definition.
- `js/39-events.js` is 1,400+ lines and is itself a Phase-2 refactor target in the playbook. Keep this build's additions in `js/39-events.js` minimal — the popup logic lives in `js/75-v25-joint-popup.js`, not inside the events file.
- The V25 monkey patches in `js/72-v25-options-bar.js` wrap `undo` and `v25Add`. Joint mutations must go through the same undo path so they're not silently lost.
- All globals additions go in `js/05-state.js` or `js/07-globals.js` per the playbook. No scattered top-level `let`s.

---

## 15. Test fixtures Dan should prepare

- `tests/fixtures/joint-mitre-90.sd2.json` — UB column + UB beam at 90°, mitre joint.
- `tests/fixtures/joint-mitre-45.sd2.json` — same at 45° (validates the bisector at a non-orthogonal angle).
- `tests/fixtures/joint-priority-2way.sd2.json` — column + beam in priority mode with cap plate.
- `tests/fixtures/joint-priority-3way.sd2.json` — Dan's truss markup case.
- `tests/fixtures/joint-legacy-v1.sd2.json` — pre-build save with `endAJoin` set, used to validate migration.

These don't need automated tests (no test harness yet — Phase-3 wishlist) but should be opened and visually verified at each phase.

---

*End of spec.*
