## Decision 1: Tool name and entity type name

**Options:** Tool: 'v25-measure' vs 'v25-dim'.  Entity type: 'measure' vs 'dim2'.  (The maps use these interchangeably — maps 1/3 lean 'measure', maps 2/5/6/7/8 lean 'dim2'/'v25-dim'.)

**Recommendation:** Tool = 'v25-measure', entity type = 'dim2'. Rationale: the USER-facing concept is a Bluebeam 'Measure' tool (so the tile label is 'Measure' and the verb 'm' matches), but the ENTITY is a dimension annotation that should sit next to the legacy 'dim' in DXF/layers/mental-model — 'dim2' makes the 'this is the v25 successor to dim' relationship obvious and avoids a third vocabulary word. Lock both names in Phase 1 so every file agrees; mixing them is the single biggest cross-file consistency risk.

---

## Decision 2: Coordinate field shape: flat suffixed (p1u/p1v/p2u/p2v) vs nested objects (p1:{u,v}) vs anchor+angle+length (u1/v1/dirAngle/lengthMm)

**Options:** (a) flat p1u/p1v/p2u/p2v + off — matches leader2 and legacy dim;  (b) nested p1:{u,v},p2:{u,v} — map 2's proposal;  (c) anchor u1/v1 + dirAngle + lengthMm — map 6's proposal, makes typed-length trivial.

**Recommendation:** (a) flat p1u/p1v/p2u/p2v/off. Verified at js/71-v25-selection.js:1296-1303 that the generic v25Move body tail translates u/v/tipU/tipV/txtU/txtV/pts only — nested objects (b) would ALSO be skipped, so (b) buys nothing and breaks consistency. leader2 (the template) and legacy dim both use flat suffixed fields, so DXF/hit-test/grip code patterns copy 1:1. The only cost — the body tail won't move p1u..p2v — is handled with one explicit 4-line v25Move body branch (already in the brief). (c) is elegant for rescale but worse for two-grip endpoint editing and diverges from every existing two-point entity; reject.

---

## Decision 3: Offset (`off`) units: paper-mm (constant standoff at any scale) vs real-world mm (legacy behaviour)

**Options:** (a) paper-mm scaled by _nbZoom() — Bluebeam-constant standoff, the noteBox convention;  (b) real-world mm scaled by real2px — what legacy drawDim2D does (offset shrinks 1/scale as drawingScale grows).

**Recommendation:** (a) paper-mm. This is the central quality-bar fix flagged by maps 5 and 8: legacy drawDim2D's real-mm offset makes the dim-line standoff change apparent size at different drawing scales (a known wart). Storing `off` in paper-mm and rendering it as `off*_nbZoom()` px keeps the Bluebeam-clean constant standoff. Consequence to keep consistent: the v25Move 'off' grip drag delta is real-mm, so divide by drawingScale when writing ent.off (done in the brief). v25EntBounds can stay coarse/real-mm — it's only a selection AABB. NOTE this means `off` is NOT directly comparable to legacy dim's `off`; that's fine since dim2 is a separate type.

---

## Decision 4: Legacy BB-rail Measure tiles ('Dim line' a-aligned / 'Dim' a-dimH at js/74:324/327) — leave, repoint, or remove?

**Options:** (a) leave both pointing at legacy setTool('dimension');  (b) repoint both to v25SetTool('v25-measure');  (c) remove them and keep only the new Measure tile.

**Recommendation:** (a) leave them for this build, add the new 'Measure' tile alongside. Rationale: the legacy 'dimension' tool still serves 3D mode and is wired into connection-builders/layers/DXF; repointing the 2D tiles (b) silently strands users who expect the old 3-click horizontal/aligned/angular dim, and removing (c) deletes a working surface. Ship the new tool additively; once it has proven parity in real use, a follow-up chat can repoint or retire the legacy 2D tiles deliberately. Flag for Dan: do you want the two old 2D Measure tiles repointed to the new tool now, or kept until the new one is bedded in?

---

## Decision 5: Undo for typed-length rescale and inline-editor value/text edits

**Options:** (a) push a manual {act:'v25Move'}-style before/after undo snapshot around each value commit (typed-Enter rescale AND dblclick-editor commit);  (b) leave them un-undoable, matching every other v25 inspector edit (the generic inspector listener at js/71:1598 only requestRender()s, no undo).

**Recommendation:** (a) for the typed-length rescale and the double-click editor commit — these are primary, deliberate value changes the user will expect Ctrl+Z to revert (Bluebeam/Revit both undo a dimension value edit). Reuse the v25SnapshotMoveTargets before/after pattern (js/39 ~30-56) and push {act:'v25Move', view, before, after}. Leave the INSPECTOR-panel field edits (offset/text-height/units) un-undoable to stay in parity with all other v25 types (matching is the lower-surprise choice there). This is a small net-new behaviour beyond strict parity — calling it out rather than silently bolting it on, per the gotcha in maps 2 and 6.

---

