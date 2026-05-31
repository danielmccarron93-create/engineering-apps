# Pilot Feature — what ships first on v2

The pilot feature is the proof point. It has to be small enough to ship in 2-3 evening sessions, representative enough that the patterns it establishes generalise to every later feature, and useful enough that Dan actually uses it in daily work (so we get real feedback, not synthetic).

This file evaluates four candidate pilots, picks one, and lays out exactly what shipping it on the v2 architecture looks like.

---

## 1. Selection criteria

A good pilot has all of these:

1. **Touches every v2 layer.** Model, Catalogue, Render, Tool, Engine, I/O — all exercised. A pilot that doesn't touch one layer leaves that layer unproven.
2. **Has both a 2D-paper and a model-level expression.** The whole point of v2 is one Element rendered by multiple renderers; a pilot that's view-local-only doesn't test the cross-renderer dispatch.
3. **Is structurally simple.** No complex AS-compliance rules. No multi-element compositions. The pilot shouldn't double as a structural-engineering deep dive — that's a distraction from architecture validation.
4. **Has a clean v1 → v2 migration path.** Existing v1 saves with this entity type must migrate cleanly so we don't lose data.
5. **Is contained.** The pilot can be the v2 authority for its feature without dragging in another feature's migration.
6. **Is useful in real detail work.** Dan should be able to use it for actual daily output during the soak period.

A bad pilot has any of these:

- Composes multiple existing entity types (e.g. a connection wizard — too much coupling).
- Is mostly UI (e.g. the favourites strip — doesn't exercise the model layer).
- Has heavy parallel implementations to dedup (e.g. joints — best to migrate AFTER patterns are proven on something simpler).
- Has high structural-engineering correctness stakes (e.g. AS 4100 capacity check — should not also be where we prove the architecture).
- Has no v1 equivalent (e.g. a brand-new feature — no migration to validate).

---

## 2. Candidates

### Candidate A — `plate2` (V25 plates)

**What it is:** Two-aspect plate primitive in V25 2D-Studio mode. Already exists in `js/76-v25-plate.js` (422 lines). Heavily used. Has elevation (face-on) and section (edge-on) aspects.

**Pros:**
- Structurally simple — a polygon with a thickness.
- Two-aspect rendering exercises both face-on (full polygon) and edge-on (thin line + AS 1100 hatch) — proving the renderer can handle category-but-not-family dispatch (`plate:*` works for any plate family).
- Already has a robust V1 implementation to test the migration against.
- No 3D-mode equivalent yet — so v2 ships with a 3D renderer that adds *new* capability beyond v1 (the user gets value from v2 immediately, not just architectural cleanness).
- Hosts bolts naturally — the plate→bolt hosting relationship is the simplest worked example of `hostId`.
- Touches every v2 layer:
  - Model — Element with `geometry: { kind: 'plate', polygon, frame, thickness }`
  - Catalogue — `Plate` family + `steel-s275` material
  - Render — Canvas2D draw + jsPDF + DXF + Three.js mesh
  - Tool — `PlacePlateTool` (two-click rectangle + polygon mode)
  - Engine — `PlaceElementTransaction`, undo/redo, autosave
  - I/O — migration from v1 `plate2` to v2 Element

**Cons:**
- No structural-engineering rule check yet (which is fine — rule layer is proven elsewhere). 
- Doesn't exercise hosted-element behaviour from the host side until bolts also migrate.

**Effort:** ~3-4 weeks evening sessions (after Phase 0 lands).

### Candidate B — Dimension (AS 1100 aligned dimension)

**What it is:** The aligned dimension entity from `drawDim2D` in `js/34-draw-2d.js`. Heavy-use annotation.

**Pros:**
- Exercises the view-local geometry path (annotations live on views).
- Forces the View object to be well-designed (dimensions reference points, which need to be resolved in view-local coords).
- Cross-cutting — touches every paper view a user makes.

**Cons:**
- View-local only — doesn't exercise the model-level rendering path or the cross-renderer 3D capability.
- Annotation logic is fiddly (six dimension variants, witness lines, text placement, leader styling) — distracts from architecture validation.
- High volume but low structural significance — not a satisfying "see, v2 enables more" demo.

**Effort:** ~4-5 weeks. Bigger than plate2 because of the variant proliferation.

### Candidate C — Rothoblaas HBS screw

**What it is:** The user's exact example. The timber-screw feature that's mid-build in the timber-screws planning folder.

**Pros:**
- Direct fulfilment of the user's stated example — "add one screw, works in both modes."
- Has a rule engine attached (`79-checks-timber.js`) — exercises the rule catalogue.
- Strong narrative — "the feature that revealed the problem becomes the proof of the solution."
- Hosted-element from the host side (host = timber member).

**Cons:**
- Depends on timber members existing in v2 first (the host element type). Timber members are not yet in v1 as a first-class `mem2` variant — that's pending the timber-screws Phase 5 corrective.
- Significant coupling — pilot would need to migrate timber-member + screw + connection + rule engine all at once. Too much for a pilot.
- The user has explicitly said to ship the in-flight timber-screws Phase 5 in v1 first. Reusing it as the v2 pilot weeks later means double-implementing.

**Effort:** ~6-8 weeks (because of the coupled migration). Not pilot-sized.

### Candidate D — Through-bolt (V25 2D bolt + 3D bolt unified)

**What it is:** A new shared bolt entity that replaces both the current V14 3D bolt (`js/33-draw-bolt.js`) and the planned `v25-2d-bolts` V25 bolt entity.

**Pros:**
- Exact pound-for-pound proof of the dedup case — one entity, two renderers.
- The `v25-2d-bolts` planning folder's axis-agnostic refactor of `33-draw-bolt.js` is preparation for this — the primitives are already going to exist when v2 starts.
- Hosted by plates (the standard cap-plate-and-baseplate hosting story).
- Exercises the size catalogue + material + hatch (AS 1101 head profile).
- Already-shipped v1 path (the V14 3D bolt) to compare against.

**Cons:**
- Depends on plates existing in v2 first (because bolts host into plates).
- Bigger than plate2 because the head-on vs side-profile dispatch + thread sawtooth + grip auto-detection adds complexity.
- The v25-2d-bolts feature ships in v1 first (per Dan's decision), so when v2 lands, both v1 and v2 will have a 2D bolt — the v1 one becomes redundant. Double-implementation pain.

**Effort:** ~5-6 weeks. Possible second pilot after plates.

---

## 3. Recommendation — Candidate A (plate2)

The pilot is `plate2`. The rationale:

1. **Smallest scope that proves every layer.** Plates are the simplest non-trivial structural primitive — a polygon + a thickness + a material. Every v2 layer gets exercised without the pilot becoming a multi-feature monster.
2. **Adds 3D capability that doesn't exist in v1.** Currently V25 plates have no 3D renderer. v2's first 3D plate renderer ships as part of the pilot — Dan gets a feature improvement, not just architectural cleanness.
3. **Hosted-element example without coupling.** Bolts host into plates. When bolts migrate later, the host side is already proven.
4. **Cleanest v1 → v2 migration.** v1 `plate2` shape (in `entities2D[viewKey]`, with `polygon`, `thk`, `aspect`, `frame`) maps directly to v2's Element with `geometry: { kind: 'plate', polygon, frame, thickness }` and `category: 'plate'`. Straightforward.
5. **Doesn't fight any in-flight idea.** None of the four in-flight ideas touches `76-v25-plate.js` significantly. Click-cycle adds `v25HitTestAll` (orthogonal). v25-2d-bolts uses plate2 as a host but doesn't change it. Orientation-presets doesn't touch plate2.
6. **No structural-engineering correctness stakes.** Plates don't have an AS-compliance rule check yet (no plate-capacity rule in the current rule engine). The pilot focuses on architecture, not rule validation.

The pilot ships in `js/v2/` alongside the v1 `js/76-v25-plate.js`. v1 still works for any plate created before the pilot. New plates go through v2 once the pilot is wired into the BB-rail. Existing v1 plates appear in v2 via the shadow-model bridge; once the pilot is the v2 authority, the bridge code stops mirroring plates from v1 (because v2 now owns them).

---

## 4. What "ship the plate pilot" looks like — the full task list

### 4.1 Model layer additions

```
js/v2/model/element.js       — already exists from Phase 0b
js/v2/model/geometry.js      — add the Plate geometry shape if not already present
js/v2/model/material.js      — already exists
```

### 4.2 Catalogue layer additions

```
js/v2/catalogues/families/plate-flat.js      — Plate family + Type list (PL6, PL8, PL10, PL12, PL16, PL20, PL25, PL32)
js/v2/catalogues/materials/steel-s275.js     — already exists from Phase 0c
```

The Plate family is the simplest — types are just thicknesses:

```javascript
const PlateFlatFamily = {
  id: 'flat',
  category: 'plate',
  label: 'Flat plate',
  sourceStandard: 'AS 3678-2016',
  paramSchema: {
    thickness: { type: 'number', label: 'Thickness', unit: 'mm', min: 3, max: 100 },
  },
  types: [
    { id: 'PL6',  thickness: 6 },
    { id: 'PL8',  thickness: 8 },
    { id: 'PL10', thickness: 10 },
    { id: 'PL12', thickness: 12 },
    { id: 'PL16', thickness: 16 },
    { id: 'PL20', thickness: 20 },
    { id: 'PL25', thickness: 25 },
    { id: 'PL32', thickness: 32 },
  ],
  defaultMaterial: 'steel-s275',
  rendererKey: 'plate:flat',
  buildSectionProfile(type, plate) {
    // For edge-on (cut) view: a thin rectangle of length = plate width, height = thickness
    return [{u: 0, v: 0}, {u: plateWidth(plate), v: 0}, 
            {u: plateWidth(plate), v: type.thickness}, {u: 0, v: type.thickness}];
  },
};
```

### 4.3 Render layer additions

```
js/v2/render/canvas2d/draw-plate.js               — Canvas2DRenderer entry
js/v2/render/pdf/draw-plate.js                    — VectorRenderer entry (shares primitives)
js/v2/render/dxf/emit-plate.js                    — DXF emission
js/v2/render/threejs/build-mesh-plate.js          — Three.js extruded polygon
js/v2/render/canvas2d/hit-test-plate.js           — hit-test entry
```

The Canvas2D draw function ~80 lines (face-on and edge-on branches). The Three.js mesh is `THREE.ExtrudeGeometry` of the polygon × thickness.

### 4.4 Tool layer additions

```
js/v2/tools/place-plate-tool.js     — two-click rectangle mode + polygon mode
js/v2/tools/move-plate-tool.js      — covered by generic move-tool.js
```

The PlacePlateTool exports onPointerDown/Move/Up + drawPreview. Two-click rectangle is the default; polygon mode is triggered by the `P` key.

### 4.5 Transaction additions

```
js/v2/transactions/place-element.js   — already exists; the place-plate tool uses it
```

No new transaction type needed — `PlaceElementTransaction` is generic.

### 4.6 UI additions

```
js/v2/ui/palette-bb-rail.js          — BB-rail registers a Plate tile that dispatches to PlacePlateTool
js/v2/ui/inspector-plate.js          — inspector panel for plate properties
js/v2/ui/size-picker.js              — Plate thickness picker
```

The BB-rail tile is one entry. The Inspector panel is ~50 lines (thickness dropdown, material dropdown, aspect override). The size picker is generic — it reads from the family's `types` array.

### 4.7 I/O additions

```
js/v2/io/migrations/v1-to-v2.js
  — add: walk v1 entities2D for type === 'plate2' → produce v2 plate Elements
js/v2/io/serialise.js                 — supports the Element shape (already in place)
```

The v1 → v2 plate migration is ~30 lines: extract polygon, frame, thickness, aspect from each v1 `plate2` entity, construct a v2 Element with `geometry: { kind: 'plate', polygon, frame, thickness }`.

### 4.8 Test fixtures

```
tests/v2/migrations/v1-to-v2-plate.test.js     — JSDOM test of the migration
tests/v2/render/draw-plate.test.js             — JSDOM test of the renderer
tests/v2/tools/place-plate-tool.test.js        — JSDOM test of tool behaviour
tests/fixtures/v1-plate-sample.sd2.json        — known v1 file with plates
tests/fixtures/v2-plate-expected.json          — expected v2 model after migration
```

The fixture-based test is the key correctness gate: load v1 sample → migrate → assert v2 matches the expected output exactly.

### 4.9 Wire it into index.html

```html
<!-- After all v2 scaffold scripts -->
<script src="js/v2/catalogues/families/plate-flat.js"></script>
<script src="js/v2/render/canvas2d/draw-plate.js"></script>
<script src="js/v2/render/threejs/build-mesh-plate.js"></script>
<script src="js/v2/tools/place-plate-tool.js"></script>
<script src="js/v2/ui/inspector-plate.js"></script>
```

### 4.10 Soak period

Once the pilot is wired:
- One week of daily use with v1 plate path still available as fallback (feature flag `useV2For.plates`).
- Smoke tests on STP 6011 detail sheets: place 8-10 plates, dimension them, export PDF, export DXF, save, reload, verify dimensions match.
- Performance comparison: 100-plate sheet, frame time should be ≤ v1.
- Visual diff: the rendered output should be pixel-identical to v1 (or visibly improved). Compare side-by-side screenshots.

### 4.11 Retire the v1 plate path

After soak:
- Delete `js/76-v25-plate.js` (or stub it to a deprecation warning).
- Remove the v1 plate dispatch from `js/68-v25-tools.js` and `js/69-v25-dispatch.js`.
- Remove the v1 plate hit-test from `js/71-v25-selection.js`.
- Update CLAUDE.md (or its v2 equivalent) to mark plates as v2-authoritative.

---

## 5. After the pilot — what's been proven

When the plate pilot ships and soaks for a week, the architecture has been proven on a real feature in daily use. Specifically:

- A new structural element added once and rendered by every renderer the registration covered.
- v1 → v2 migration of existing user data works on real files.
- The transactional architecture supports undo/redo/autosave for real interactions.
- The catalogue + material flow drives the lineweight + hatch + colour with no hardcoded primitives.
- The hosted-element shape (bolts→plates) is ready for the next pilot.
- The 3D renderer dispatch works — plates appear in the iso view (which they don't today in v1 V25 mode).
- The Inspector pattern works.
- Performance is acceptable.
- Save/load is correct.

This unlocks Stage C (the migration sweep). Every subsequent feature follows the same shape: catalogue row, family file, renderer registrations across 3-5 renderers, tool file, inspector panel, migration entry. The first feature took 3-4 weeks to design and build; subsequent features should be 1-2 weeks each as the patterns become rote.

---

## 6. Risk — what if the pilot fails?

A pilot can "fail" in several ways:

1. **Architecture-level issue surfaces during pilot.** E.g., we discover during plate implementation that the View's `modelTransform` doesn't compose cleanly with the canvas transform. → Resolve in v2 architecture; revisit `02-target-architecture.md` and `05-render-pipeline.md`.
2. **Performance is unacceptable.** E.g., re-rendering 100 plates per frame takes 200ms. → Add the spatial index + dirty regions earlier than planned.
3. **Migration loses data.** E.g., complex v1 plate polygons don't round-trip through v2. → Migration test fixtures catch this in CI; fix the migrator.
4. **User finds the v2 plate experience worse than v1 in daily use.** E.g., the click flow changed and Dan doesn't like it. → Adjust the PlacePlateTool's interactions until the experience matches or exceeds v1. The v1 fallback flag stays available throughout.

The pilot is **a learning artefact**. Every weakness it exposes is cheap to fix because we've only built one feature on the architecture; correcting course is light. By contrast, discovering an architecture-level issue after migrating 5 features means refactoring all 5. The pilot's purpose is to surface issues at the cheapest possible point.

If the pilot reveals a fundamental architectural error — something that requires a structural rethink — we go back to `02-target-architecture.md` and adjust. The plan folder is iterable; the build phases are sequenced so a Phase 0 redesign costs weeks, not months.

---

## 7. What this folder commits to (for the build chat)

The pilot is `plate2`. The deliverable list in §4 is the contract. A build chat assigned to "execute the v2 pilot" follows that list end-to-end, ships the soak, retires the v1 path. After the pilot, Dan and the build chat collaboratively decide which feature is Stage C order 2 (probably bolts; possibly members, depending on what was learned).
