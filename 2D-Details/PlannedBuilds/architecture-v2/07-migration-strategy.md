# Migration Strategy — Strangler Fig

The architecture-v2 plan is only worth building if Dan's daily-use app keeps working through every phase. A "stop shipping for six months and rewrite" approach has a poor track record across the industry — Netscape 6, Joel Spolsky's famous warning, Mozilla's own multi-year XUL purge. We are not going to do that.

Instead: **the new architecture grows alongside the old.** Existing v1 code keeps running. New features get built in the v2 architecture. Old features migrate to v2 when they're next touched anyway. After 12-18 months of evening sessions the v2 architecture is load-bearing and the v1 code has shrunk to a handful of legacy draw functions — which then get retired in a planned sweep.

This is the strangler fig pattern, named after the fig tree species that grows around a host tree and eventually replaces it.

---

## 1. The two-architecture phase — months 0-12

```
┌─────────────────────────────────────────────────────────────────────────┐
│  index.html                                                        │
│                                                                        │
│  <script src="js/01-config.js"></script>          ── v1 (existing)    │
│  <script src="js/02-data-sections.js"></script>   ── v1 (existing)    │
│  ...                                                                  │
│  <script src="js/74-v26-bb-rail.js"></script>     ── v1 (existing)    │
│  <script src="js/76-v25-plate.js"></script>       ── v1 (existing)    │
│                                                                        │
│  <!-- v2 layer loads AFTER v1, builds the v2 model from v1 state -->  │
│  <script src="js/v2/model/element.js"></script>                       │
│  <script src="js/v2/model/model.js"></script>                         │
│  <script src="js/v2/catalogues/categories.js"></script>               │
│  ...                                                                  │
│  <script src="js/v2/engine/init.js"></script>     ── runs LAST        │
└─────────────────────────────────────────────────────────────────────────┘
```

The v2 layer is **additive**. Every v2 file is in `js/v2/`. Every v2 export goes onto `window.v2.*` so it's namespaced and never clashes with v1's flat globals.

The v1 code keeps running. The user opens StructDraw and sees exactly what they see today. Behind the scenes, the v2 layer is also constructing a `v2.appState.model` from the v1 state — but nothing in the UI uses it yet. This is the "shadow model" phase: v2 maintains a parallel structural model that's always in sync with v1 state, but v1 is still the authority.

```javascript
// js/v2/engine/v1-bridge.js
// Watches v1 state mutations and mirrors them into the v2 model
function initV1Bridge() {
  // Wrap v1 functions that mutate state
  const origPlaceObject = window.placeObject;
  window.placeObject = function(...args) {
    const result = origPlaceObject.apply(this, args);
    syncV2ModelFromV1();  // rebuild v2 model from current v1 state
    return result;
  };
  // Similarly for entities2D additions, deletes, edits, save/load
  // ... 
}

function syncV2ModelFromV1() {
  // Walk objects3D + entities2D, produce equivalent v2 Elements
  // This is essentially the v1→v2 schema migrator running in-process
  const newModel = migrateV1ToV2({
    objects3D: window.objects3D,
    entities2D: window.entities2D,
    blocks: window.blocks,
  });
  window.v2.appState.model = newModel;
}
```

The bridge code is **temporary infrastructure**. It exists only during the strangler-fig phase. When a feature migrates to v2-authoritative (v2 model is the source, v1 is read-only / display), the bridge for that feature's data shape gets retired.

---

## 2. The migration order — feature by feature, easiest first

The order is chosen by **leverage divided by risk**:

- **Leverage** = how many code paths get cleaned up when this feature migrates.
- **Risk** = how likely the migration is to break daily-use behaviour.

Order from highest leverage / lowest risk to lowest leverage / highest risk:

### Stage A — Foundations (no user-visible features yet)

| Phase | What migrates | Risk | Notes |
|---|---|---|---|
| 0a | Docs realignment (the absorbed Phase 1 from `codebase-restructure/`) | None | Pure documentation. Build chat already specified. |
| 0b | v2 model layer + transactions + I/O scaffold | Low | New code in `js/v2/`. v1 code unchanged. No UI changes. |
| 0c | v2 catalogue layer (categories, families, types, materials, hatches, lineweights) | Low | New data files. v1 catalogues stay; v2 families import from them. |
| 0d | v2 → v1 bridge (shadow model) | Low-medium | Wraps v1 mutators; v2 model always reflects v1 state. v1 still authoritative. |
| 0e | v1 → v2 schema migration (load `.sd2.json` v1 → v2 model in memory) | Medium | Critical correctness — every v1 fixture file must migrate cleanly. Heavy testing. |
| 0f | v2 Canvas2DRenderer scaffold + render-context + 3-4 worked draw functions | Low | Renders into a hidden test canvas. Not the user-facing canvas. |
| 0g | v2 ThreeJSRenderer scaffold + 3-4 worked mesh builders | Low | Same — hidden test renderer. |

After Stage A, v2 is ~70% built but invisible to the user. Every existing v1 feature works exactly as before. The v2 layer is testable in isolation and has unit tests covering the model, catalogues, and migration.

### Stage B — Pilot (one user-visible feature on v2)

| Phase | What migrates | Risk | Notes |
|---|---|---|---|
| 1a | Pilot feature on v2 (see `08-pilot-feature.md` for the chosen feature) | Medium | First feature where v2 is authoritative. v1 reads from v2 for this feature. Heavy verification. |
| 1b | Cut the v1 path for the pilot feature | Medium | Once v2 is solid, retire the v1 path for the pilot. v1 BB-rail tile points to v2 placement tool. |

After Stage B, ONE feature is fully v2 (model, catalogue, render, tool, save/load). The architecture's claims are proven on a real feature in real use.

### Stage C — Migration sweep (feature by feature)

Each migration is a self-contained build chat with its own files-touched list. Order is opportunistic:

| Order | Feature family | Rationale |
|---|---|---|
| 1 | Pilot (Stage B) | Proves the architecture. |
| 2 | Plates (`plate2`) | Structurally simple, no parallel 3D-only impl yet, contained. Likely pilot candidate too. |
| 3 | Bolts (V25 2D bolt + 3D bolt unified) | High dedup payoff — replaces a planned axis-agnostic refactor in `v25-2d-bolts/`. |
| 4 | Members (UB/UC/PFC/SHS/RHS/CHS/EA/UA/WB family) | Biggest single-shot. Eliminates the parallel `drawUB`+`drawMem2D` pair. |
| 5 | Timber members (GLT/CLT/custom-rect) | Adds 3D renderer that doesn't exist today; finishes the timber-screws journey. |
| 6 | Fasteners (timber screws, anchors, shear studs) | Replaces the parallel timber-screw entity types. The example you raised. |
| 7 | Joints (auto-weld + SHS joint trim, unified algorithm) | Massive dedup — collapses the 1,182-line `23a-shs-joints.js` |
| 8 | Annotations (dimensions, leaders, tags, callouts, marks, revisions) | High-volume; touches every renderer. |
| 9 | Sheet components (titleblock, revisions schedule) | Office-standard integration. |
| 10 | Selection + grip handles | Replaces both the 3D-mode and V25 selection systems. |
| 11 | Connection wizard (cap plate / baseplate / splice / WSP) | Becomes a "compose multiple transactions" composer. Adds the 2D wizard equivalent currently missing. |
| 12 | Detail callout / detail card / detail reference | Multi-sheet detail navigation. |
| 13 | DXF + PDF export full coverage | Final renderer registrations for any family without DXF/PDF entries. |
| 14 | (any remaining features) | Long tail. |

At each step, the v1 code path for that feature is retired AFTER the v2 path has been live and verified for one week of daily use.

### Stage D — v1 retirement (months 12-18)

When the migration sweep reaches > 90% feature coverage, the remaining v1 files are:

- v1 catalogue files (`02-data-sections.js`, etc.) — keep as raw data sources; v2 family files import them. Eventually inline into v2 catalogue files.
- v1 init code (`73-init.js`) — minimal, mostly DOM setup. Either retire or move to `v2/engine/init.js`.
- v1 bridge (`v2/engine/v1-bridge.js`) — retire when last v1-authoritative feature migrates.

The flat `js/01-…/99-…` numbering is fully replaced by the structured `js/v2/` tree.

---

## 3. What "v2 is authoritative" means for a feature

A feature is "v2-authoritative" when the following are true:

1. **All edits go through v2 transactions.** The v1 tool path for the feature is retired or replaced with a thin wrapper that builds a v2 transaction.
2. **All reads come from the v2 model.** The Inspector, rules engines, schedules, exports all query `v2.appState.model`. No callers read from `objects3D` or `entities2D` for this feature's entity type.
3. **The v2 renderer is the rendering authority.** The v1 draw function for this feature is either deleted or kept as a fallback only inside the v2 dispatch.
4. **Save/load uses the v2 serialiser.** The `.sd2.json` for this feature's elements is the v2 shape, with `schemaVersion: 2` and the v2 element shape.
5. **Undo/redo goes through the UndoStack.** No snapshot-based undo for this feature.

A feature transitions from "v1-authoritative" → "shadow in v2" → "v2-authoritative". The shadow phase is the safety net: both architectures track the same edits; if v2 has a bug, switch back to v1 and the data is intact.

---

## 4. The save-file lifecycle

This is the trickiest part of the migration and deserves its own subsection.

### Before any migration

`.sd2.json` shape:

```javascript
{
  version: '1.0',
  objects3D: [...],
  entities2D: { elevation: [...], sectionA: [...], planB: [...], isometric: [...] },
  blocks: [...],
  // sheet-level fields
}
```

### After Stage A (v2 model exists but not authoritative)

Save format unchanged. The v2 model is rebuilt from the loaded v1 fields on every load. Saving still emits the v1 shape. v2 schemaVersion is internal only.

### After Stage B/C (each migrated feature)

`.sd2.json` shape gradually shifts to:

```javascript
{
  schemaVersion: 2,                  // the v2 flag is now set on save
  v1: {                              // legacy fields, only populated for non-migrated families
    objects3D: [...],
    entities2D: { ... },
    blocks: [...]
  },
  v2: {                              // v2 model, fully serialised
    elements: [...],                 // every Element
    materials: [...],
    views: [...],
    sheets: [...],
    project: {...}
  }
}
```

Loading:
1. If `schemaVersion === 2`: load `v2` directly. For any v1-only family present in `v1.*`, run the in-memory v1→v2 migrator to mirror into the v2 model (and mark those families as "still v1-authoritative" so saves emit the v1 fields).
2. If `schemaVersion` absent: load v1 path; immediately run the in-memory migrator to build the v2 model.

Saving:
1. Always emit `schemaVersion: 2`.
2. Always emit the full `v2.*` shape.
3. For families still v1-authoritative, also emit the `v1.*` fields so a v1-only reader (if any) can still load.

### After Stage D (v1 retired)

`.sd2.json` shape:

```javascript
{
  schemaVersion: 3,                  // bump when v1 fields fully retired
  model: {
    elements: [...],
    materials: [...],
    views: [...],
    sheets: [...],
    project: {...}
  }
}
```

The migration from schemaVersion 2 → 3 strips the `v1.*` fields and promotes `v2.*` to root.

A `.sd2.json` opened in v3 that was originally saved in v1 has gone through two migrations (v1→v2, v2→v3) automatically on each open. The user never sees a migration prompt — it just works.

---

## 5. The principle that makes this safe

**Every migration is reversible until the v1 path is retired.**

During the shadow phase for any feature, you can flip a feature flag `useV2For.<feature> = false` and the app reverts to the v1 path. The v2 model is still constructed (shadow) but not authoritative. This means:

- If a v2-pilot ships and a bug shows up in daily use, flip the flag, ship a fix in the v1 path while debugging v2 separately.
- Every migration phase has a "rollback to v1" lever, removed only after the v2 path has soaked.

This is what gives the strangler fig its resilience. Mozilla's XUL purge took 5+ years partly because they couldn't roll back individual subsystems — when something broke, the whole pipeline broke. v2 is designed to keep individual subsystems independently switchable for the entire migration window.

---

## 6. The four in-flight ideas — explicit treatment

Per Dan's decision (2026-05-19): all four in-flight ideas ship in v1 first.

| Idea | What happens during the v2 migration |
|---|---|
| `click-cycle-selection/` | Ships in v1 (just needs mirror). When selection migrates to v2 (Stage C, order 10), the v1 click-cycle code gets reimplemented on `v2.render.Canvas2DRenderer.hitTestAll` — same algorithm, cleaner home. |
| `timber-screws/` | Phase 5 corrective ships in v1, removing the autoloader + parallel entity types per the planning folder's `10-corrective-plan.md`. The shipped v1 version stays daily-use until Stage C, order 5/6, when timber members + fasteners migrate to v2. At that point, the v2 implementation is built fresh on the new architecture, with full 2D + 3D from the start. |
| `orientation-presets/` | Ships in v1. Becomes a UX-pattern reference for v2's `orientationPresets` field on the family object (in `04-catalogue-system.md`). |
| `v25-2d-bolts/` | Ships in v1, including its planned axis-agnostic refactor of `33-draw-bolt.js`. The refactor proves the dedup approach that v2's bolt renderer reuses. When bolts migrate to v2 (Stage C, order 3), the v1 axis-agnostic primitives port directly into the v2 Canvas2DRenderer's bolt draw function. |

**None of these four ideas pivots to v2 mid-flight.** Each ships v1 cleanly; v2 absorbs the learnings.

---

## 7. The cost honesty

This section is the brake. It exists so a future build chat doesn't underestimate the work.

- **Phase 0a (docs realignment):** ~1-2 hours, single build chat. Already specified.
- **Phase 0b (v2 model layer):** 3-4 weeks of evening sessions. Carefully designed shapes, full unit tests on Element/Geometry/Transaction/View/Sheet, JSDOM-test harness.
- **Phase 0c (catalogue layer):** 2-3 weeks. ~80-100 family + material + rule files. Mostly data, but data has to be sourced and cited carefully (AS 3679 tables, ETA-11/0030 capacity tables, AS 1252 bolt specs).
- **Phase 0d (v2→v1 bridge):** 1-2 weeks. Watches v1 mutations; mirrors into v2.
- **Phase 0e (v1→v2 migration):** 2-3 weeks. Every v1 entity shape needs a migration function. Heavy fixture-based testing.
- **Phase 0f (Canvas2D renderer scaffold):** 1-2 weeks. The renderer infrastructure + 3-4 pilot draw functions.
- **Phase 0g (Three.js renderer scaffold):** 1-2 weeks. Similar.
- **Total Phase 0:** 12-17 weeks of evening sessions before the user sees any change. **3-4 months calendar time at a steady cadence.**
- **Stage B (pilot feature):** 2-3 weeks per feature for the first few; faster as patterns settle.
- **Stage C (migration sweep):** ~12-15 features, average 2-3 weeks each = **6-9 months total** assuming steady cadence.
- **Stage D (v1 retirement):** 4-6 weeks. The cleanup sweep.

**Total estimated wall-clock time:** 12-18 months of evening sessions at a steady cadence to reach a state where v2 is the load-bearing architecture and v1 is retired. The first ~3-4 months produce zero user-visible change but build the foundation for everything else. The next ~6-9 months are visible progress, feature by feature, with each feature noticeably better than its v1 counterpart (better undo, better autosave, schedules and rules just work). The final ~3 months are cleanup.

This is a real commitment. It's the cost of the highest-quality final product. Path A (incremental cleanup) is significantly cheaper but never produces a Revit-class architecture. The user has explicitly chosen quality over cost, and this is what quality costs.

---

## 8. What can fail and how we mitigate

| Failure mode | Mitigation |
|---|---|
| Phase 0 drags on, ships nothing visible for 6 months | Strict phase boundaries; every sub-phase has a deliverable. Phase 0b ships a unit-tested model layer, even if invisible. Phase 0c ships a full catalogue. Each is a real artefact. |
| v2 model diverges from v1 state (shadow goes stale) | The bridge is the only sync path; every v1 mutation is wrapped. CI test: open the app, do 100 random actions, assert v1 state equals migrated-v2 state. |
| Performance regression — v2's "iterate all elements" is slower than v1's per-array dispatch | Spatial index built before pilot ships; render cache; dirty-region rendering. Benchmark target: ≤ v1 frame time on the STP 6011 reference detail. |
| The migration sweep stalls at 60% — half the codebase is v1, half is v2, dual maintenance forever | Hard rule: no new features in v1 once v2's pilot ships. Every new feature goes into v2. Existing v1 features migrate opportunistically. Even at 60% migration, the new architecture is the load-bearing one for everything being actively developed. |
| Bridge code becomes a permanent dependency | Audit bridge complexity quarterly; retire bridge slices as features migrate. Final phase explicitly retires bridge. |
| A v1 feature breaks during a v2 phase | Feature flag rollback; the v1 path is untouched until the v2 path has soaked. |
| Schema migration loses data | Every v1 fixture in the test suite has a known-good v2 migration output. Migration is replayable, diffable, and unit-tested. |

---

## 9. What this looks like one year from now

Imagining the codebase a year out:

- `js/` is now a thin layer of v1 init + bridge code, declining.
- `js/v2/` is the load-bearing architecture: ~150 files organised by layer (model, catalogues, render, tools, engine, io, ui).
- New features (let's say AS 4100 capacity-check inspector panels, automatic connection design wizards for V2 — i.e. 2D-Studio versions of cap-plate/baseplate/splice, IFC export for Tekla handoff, multi-user co-editing prototype) live entirely in `v2/`.
- Old features (V22-era annotation entities, click-cycle selection, the timber-screw feature, V21 favourites) are all in `v2/`. The v1 implementations are deleted.
- `CLAUDE.md` is half its current size — the layered architecture is self-explanatory through the directory structure, so the playbook can be terse.
- Unit-test coverage is real: every model operation, every catalogue lookup, every rule, every renderer dispatch.
- New features take 2-3 evening sessions, not 6, because the integration checklist is "register one Renderer entry" not "edit 12 files."
- The codebase is in a shape that could plausibly attract a second contributor (a Bligh Tanner colleague, or a contractor) because the architecture is documented and the layer boundaries are real.

This is the destination. The strangler-fig path is how we get there without breaking the daily-use app along the way.
