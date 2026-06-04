# 03 — Build plan

Each phase is independently testable and shippable. Browser-test at every boundary
(copy repo to `/tmp` + `python3 -m http.server` — the iCloud path can't be served
directly, per project memory `local-testing-setup`). DevTools console must stay clean.

---

## Phase 1 — Shared modifier rule + Pipeline A (v25 2D entities)

The core, highest-value path.

1. `js/07-globals.js`: add `IS_MAC`, `isDupDragModifier(e)` (expose on `window`),
   `dragDupPending`. Reuse any existing Mac flag from `js/42-keyboard.js` if present.
2. `js/71-v25-selection.js`: extract `v25CloneEntsInPlace(ids)` from
   `v25DuplicateSelected()` (zero-offset clone, `ent2dIdN++`, fresh `groupId` for grouped
   clones); refactor `v25DuplicateSelected()` to call it then apply the +30 offset.
3. `js/39-events.js`: mousedown (`~248`) set `v25Drag.dupPending` on modifier+`body`;
   mousemove (`~1075`) first-move clone + retarget; mouseup (`~1305`) single add-undo.

**Test:** Alt-drag a bolt, a `mem2`, a `noteBox`, a `leader2`, a `mat` hatch → one copy
each, original unmoved, copy selected on release. Alt-drag a multi-selection and a group →
all copied; copy is an independent group. Plain drag still moves; grip/rotate still
edits; modifier-click without drag makes no copy. One Ctrl+Z removes the copy.

---

## Phase 2 — Pipeline C (3D-mode objects)

1. `js/39-events.js`: mousedown (`~969`) `dragDupPending` on modifier+body; mousemove
   (`~1132`) first-move deep-clone of `selected3D` + retarget; mouseup (`~1400`) add-undo.

**Test:** Alt-drag a UB and a bolt in 3D → copy at the drop point; original unmoved; undo
removes it. Confirm existing Ctrl+D duplicate still works unchanged.

---

## Phase 3 — Pipeline B (v2 plates)

1. `js/v2/tools/edit-plate.js`: in `onPointerDown` body branch (`~498`), on
   `window.isDupDragModifier(event)` compose a `placeElement` clone of the hit element
   (drop `groupId` from `params`), `apply` it, resolve the new id from `tx.data.element`,
   and point `state.bodyDrag` at the clone.

**Test:** Alt-drag a plate → independent copy at the drop point; original unmoved; the
copy is selected and its vertex/edge/rotate handles work; undo removes the copy. Re-run
the **`plate-orientation-presets`** drag/snap/ortho tests to confirm no regression (that
feature also edits this file).

---

## Phase 4 — Polish + cross-cutting checks

- **Both modes** sweep of the success criteria in `README.md`.
- **Continuous duplicate:** Alt-drag the just-dropped copy again → another copy (falls out
  of "copy selected on release"); confirm it feels right.
- **Mac context menu:** Ctrl-click (no Alt) still opens the Group/Joint menu.
- `CHANGELOG.md` one-liner.
- Update this tracker + the dashboard row; hand to Dan for review/commit.

---

## Progress tracker

| Phase | Status | Notes / deviations |
|---|---|---|
| 1 — modifier rule + v25 entities | ✅ Done + verified | Browser-verified via synthetic-gesture harness: copy-on-first-move, original intact, selection follows copy, `v25Add` one-step undo + redo, plain-drag still moves, modifier-click-no-move makes no copy. **Deviations:** (a) added `js/05-state.js` `v25Add`/`objAddMany` undo+redo cases; (b) one-line export `window.v25NewGroupId` in `js/72f-v25-grouping.js`; (c) the inspector Duplicate button (`v25DuplicateSelected`) is now undoable too (was a no-op on undo before) — shares the new `v25CloneEntsInPlace` helper. |
| 2 — 3D objects | ✅ Done + verified | Browser-verified: Alt-drag clones obj on first move, original stays, `objAddMany` one-step undo + redo, plain-drag still `moveObj`. Uses `dragDupPending`/`dragDupObjIds` globals. |
| 3 — v2 plates | ✅ Done + verified | Browser-verified via direct editPlate handler calls: Alt-body-drag clones an **independent** plate (group id dropped, thickness/material/`v2Source` preserved so it stays selectable), original unchanged, copy follows cursor; plain drag still moves; modifier-click-no-move makes no copy. Two-step v2 undo (place + move) removes it — documented. New `duplicatePlateElement()` helper + `dupPending` on `state.bodyDrag`. **Note:** v2 model is immutable (`applyTransaction → newModel`), so all reads go through `v2.appState.model` fresh — confirmed the code does this. |
| 4 — polish + checks | ✅ Done | Clean console on load (no `node` here → browser-verified on a `/tmp` copy, port 8865). CHANGELOG updated. Continuous-duplicate falls out of "copy selected on release". Mac context menu untouched (Ctrl reserved as right-click on Mac). **Remaining manual checks for Dan:** real pointer-device feel of each gesture, and the Windows Ctrl-drag path (can't be exercised on this macOS box). |
