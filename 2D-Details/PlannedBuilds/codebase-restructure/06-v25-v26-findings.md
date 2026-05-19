# Layer 4: 3D engine + V25 2D-Studio + V26 BB-rail findings (`js/64-3d-engine.js` → `js/76-v25-plate.js`)

This layer is the most-actively-developed in the codebase and the boundary between the two product directions. **`64-3d-engine.js` IS the 3D-Studio (Revit-competitor) surface; `65–72 + 74 + 76` ARE the 2D-Studio (Bluebeam-competitor) surface.** The cleanest way to describe what each side needs is to look at this layer.

Three headline findings:

1. **`64-3d-engine.js` is admirably clean** — zero V25 references, pure Three.js boundary. The Revit-competitor side has a well-defined edge. But it only knows about 4 primitive types (`ub`, `shs`, `plate`, `bolt`), so the iso block silently goes empty for newer 3D members (PFC, RHS, CHS, EA, UA, WB).
2. **`76-v25-plate.js` is undocumented in the playbook** — added when V25 plates landed but never added to the file map.
3. **`72-v25-options-bar.js` confirms 4 monkey patches** wrapping `undo`, `v25Add`, `v25SetTool`, `v25TryHandleClick`. The patches are explicitly called out in the playbook as Phase-2 priority #3. Phase 5 of this restructure replaces them with extension hooks.

---

## File-by-file headlines

### V1. `64-3d-engine.js` — 468 lines, the Revit-competitor boundary

- **Real purpose:** Offscreen Three.js r128 isometric renderer. Owns the WebGL scene/camera/lights/materials. `v3dRebuildScene()` walks `objects3D` and constructs meshes. `v3dRenderToImage(blk)` is called from `drawBlockContent` for the iso block.
- **Affiliation:** **3D-mode-only**. **Zero references to `sheetMode`, `entities2D`, `_v25`, or `tool.startsWith('v25-')`**. This is the cleanest boundary in the codebase.
- **Drift:** Accurate per playbook.
- **Smell:** Only handles the original 4 primitive types (`ub`, `shs`, `plate`, `bolt`). PFC/RHS/CHS/EA/UA route through `drawSectionMember` in the 2D path but have **no Three.js builder** here — the iso block silently shows nothing for these section types. WB has no path either.
- **Smell:** `v3dMakeIShape` is hand-rolled extrusion geometry. Each new section needs a corresponding `v3dBuildPFC` / `v3dBuildRHS` / etc. This is the touch-point the integration checklist should warn about but currently doesn't.
- **Fix in Phase 1:** Add to integration checklist — "Step N+1: Add a `v3dBuild<Type>` function in `64-3d-engine.js` so the iso block renders the new type."

### V2. `65-v25-data-mode.js` — V25 catalogues + mode switching

- **Real purpose:** Holds `V25_MEM_CATALOGUE`, `V25_PLATE_CATALOGUE`, `V25_SCREW_CATALOGUE`, etc.; `setSheetMode(mode)` toggles between 3D and 2D modes.
- **Affiliation:** **2D-mode-only** primarily.
- **Smell:** Catalogues here duplicate `02-data-sections.js` in shape — `V25_MEM_CATALOGUE.ub` overlaps with `UB_DB`. Phase 6 considers a unification but it's not blocking.

### V3. `66-v25-helpers-frame.js` — V25 entity helpers + detail frame

- Functions to compute V25 entity frames (`_v25Frame`, `_v25HalfDepth`, `_v25EndPoint`).
- **Smell:** Some of these helpers are private but used by `23a-shs-joints.js` (the V25 joint half). Should be exported with proper names.

### V4. `67-v25-materials.js` — V25 hatch patterns

- 596 lines. Hatch pattern definitions for V25 materials (concrete, steel, timber, masonry, etc.).
- **Smell:** Hatching is also in `26-as1100-hatch.js` (steel only) and `34-draw-2d.js` (concrete + cross-cross inline). Phase 6 consolidates.

### V5. `68-v25-tools.js` — V25 placement tools

- 1,403 lines (playbook says 1,149 — drift +254 lines).
- **Real purpose:** V25 entity placement tools (`v25-mem`, `v25-plate`, `v25-screw`, etc.) including `drawMem2D` which is the V25-mode member renderer (parallel to `29-draw-ub.js` etc.).
- **Top smell — Known Issue #1 in CLAUDE.md:** `function v25Mem2Thickness(ent)` is **defined twice** (lines 946 and 1127 per dev/ — playbook says 734 and 880 which is the original monolith offset). Still a real bug; the second definition wins.
- **Top smell:** `drawMem2D` is the V25 parallel of `29-draw-ub.js`/`30-draw-shs.js`/`31-draw-section.js`/`32-draw-plate.js`. Phase 6 unifies.

### V6. `69-v25-dispatch.js` — V25 dispatch + 2D-mode palette + chords

- Owns `v25TryHandleClick`, `V25_MEM_DEFAULTS`, `v25SetMember`, `v25SetTool`.
- **Top smell:** Three of the four monkey-patched functions live here (`v25Add`, `v25SetTool`, `v25TryHandleClick`). The wrapper sits in `72`.
- **Touch-point for integration checklist:** A new `mem2` variant adds an entry to `V25_MEM_DEFAULTS`. A new tool path adds a branch to `v25TryHandleClick`. Currently undocumented.

### V7. `70-v25-render.js` — V25 lineset + text + swatch previews

- Rendering utilities specific to V25.

### V8. `71-v25-selection.js` — V25 selection / hit-test / drag

- 1,484 lines (playbook says 1,336 — drift +148).
- **Real purpose:** V25 hit-testing, marquee, click-cycling, drag.
- **Smell:** Parallel to `36-selection-highlights.js` (the 3D version) — same algorithm gap as joints/welds/bolts.
- **Note:** The `click-cycle-selection/` build added `v25HitTestAll` as an extension point — verified at line 136 of the worktree copy (`.claude/worktrees/stupefied-kowalevski-2b02d9/.../71-v25-selection.js`). Not yet in main `dev/js/71-v25-selection.js`; lands when that worktree is mirrored. Good pattern — Phase 4 should generalise it.

### V9. `72-v25-options-bar.js` — V25 quick options + monkey patches

- Top quick-options bar for V25 placement.
- **Top smell:** Monkey patches. The file header comment says "4 monkey patches (undo / setTool / Add / TryHandleClick)" but **verification of `dev/js/72-v25-options-bar.js` finds only 3 visible**:
  - `_v25_origTryHandleClick = v25TryHandleClick` at line 195 — wraps click handler
  - `_v25_origAdd = v25Add` at line 205 — wraps add to log entity creation for options-bar
  - `_v25_origSetTool = v25SetTool` at line 220 — wraps tool change to render the right options bar
  - The 4th (`undo` wrap) is referenced in the header comment but not present in the dev/ file. Either the patch was removed and the comment is stale, or it lives elsewhere (Phase 5 starts by reconciling).
- **Fix in Phase 5:** Replace each `_orig*` wrapper with a registered hook (`undo.after`, `v25Add.after`, `v25SetTool.before`, `v25TryHandleClick.after`). Documented hook surface in `42-keyboard.js` / `69-v25-dispatch.js`.

### V10. `73-init.js` — DOMContentLoaded bootstrap

- **Smell:** Seeds demo `objects3D` on first load. `99-tmbr-autoload.js` reaches into these by exact `section + length` match — couples two files invisibly. Phase 2 removes the autoloader; the demo seed itself is fine.

### V11. `74-v26-bb-rail.js` — V26 BB-rail IIFE

- **Real purpose:** V26 Bluebeam-style left rail; the 2D-mode primary palette. Runs as IIFE registered AFTER `73-init.js`.
- **Touch-point for integration checklist:** Every 2D-mode entity needs a tile here AND in `60-tile-palette.js` (for 3D-mode placement of the same entity if applicable). Two parallel palettes (see E22 in `05-events-tools-findings.md`).
- **Smell:** Runs after init via IIFE — fragile bootstrap order. If a future file tries to register BEFORE `73-init.js`, the BB-rail breaks silently. Phase 1 documents the contract.

### V12. `76-v25-plate.js` — ⚠ entirely missing from the playbook

- **Real purpose:** V25 `plate2` entity renderer + helpers. Adds elevation/section/face-on/edge-on aspects, thickness handling.
- **Affiliation:** **2D-mode-only**.
- **Drift:** Same as `23a-shs-joints.js` — playbook file map skips it entirely.
- **Fix in Phase 1:** Add to file map with one-line description.

---

## The V25 entity model (consolidated across this layer)

This is the single canonical answer for "what 2D-Studio entity types exist today, and where is each one wired?"

| Entity type | Defined in | Rendered by | Hit-tested by | Size picker | Options bar | Inspector | Save/load | Status |
|---|---|---|---|---|---|---|---|---|
| `mem2` (UB/UC/PFC/SHS/RHS/CHS/EA/UA/WB) | `68-v25-tools.js` + `02-data-sections.js` | `drawMem2D` in 68 | `71-v25-selection.js` | 58 | 72 (`v25-mem` branch) | 59 | automatic via `entities2D` | ✅ shipped |
| `plate2` | `76-v25-plate.js` | `drawPlate2D` in 76 | 71 | n/a (thk only) | 72 (`v25-plate` branch) | 59 | automatic | ✅ shipped |
| `screw` | `dev/js/77-screw-entity.js` | `drawScrewEnt` in 77 | (none — selection via parent connection) | n/a | 72 (`v25-screw` branch — pending) | 59 (pending) | automatic | 🔶 in flight (timber-screws phase 5) |
| `anchor` | `68-v25-tools.js` | `drawAnchor2D` in 68 | 71 | n/a | 72 (`v25-anchor` branch) | 59 | automatic | ✅ shipped |
| `mat` (hatch material) | `67-v25-materials.js` | `drawMat2D` in `34-draw-2d.js` (likely) | 71 | n/a | 72 | 59 | automatic | ✅ shipped |
| `blockWall` | `68-v25-tools.js` | `drawBlockWall2D` in 68 | 71 | n/a | 72 | 59 | automatic | ✅ shipped |
| `reoBar` | `68-v25-tools.js` | renderer in `34` or `70` | 71 | n/a | 72 | 59 | automatic | ✅ shipped |
| `mesh` | `68-v25-tools.js` | renderer in `34` or `70` | 71 | n/a | 72 | 59 | automatic | ✅ shipped |
| `leader2` | `68-v25-tools.js` | `drawLeader2D` in 68 | 71 | n/a | 72 | 59 | automatic | ✅ shipped |
| `frame` (detail frame) | `66-v25-helpers-frame.js` | `drawDetailFrame` in 70 | 71 | n/a | 72 | 59 | automatic | ✅ shipped |
| `connection` | `dev/js/78-connection.js` | `drawConnection` in 78 | 71 (need to verify) | n/a | 72 (no) | 59 (no) | automatic | 🔶 in flight (timber-screws phase 5 — rename/reroute) |
| `bolt2` (planned) | not yet | not yet | 71 (planned extension) | new branch in 58 | 72 (`v25-bolt` branch — new) | 59 (new) | automatic + schemaVersion | 📐 planned (v25-2d-bolts) |
| `timber-member` ❌ | `dev/js/75-timber-conn-entities.js` | `drawTimberMember` in 75 | n/a | n/a | n/a | n/a | automatic | ⚠ anti-pattern — Phase 2 deletes, reroutes through `mem2 + memberType:'timber'` |
| `steel-plate` ❌ | `dev/js/75-timber-conn-entities.js` | `drawSteelPlate` in 75 | n/a | n/a | n/a | n/a | automatic | ⚠ anti-pattern — Phase 2 deletes, reroutes through `plate2` |

The two anti-pattern entries are exactly the parallel types the playbook warns against. The corrective plan exists at `PlannedBuilds/timber-screws/10-corrective-plan.md` Phase 5; Phase 2 of this restructure executes it.

The "Save/load" column is automatic because every entity lives in `entities2D[viewKey]` which is JSON-serialised whole. **This is the cleanest part of the V25 design** — once an entity is in `entities2D`, it persists for free. The thing that doesn't yet exist is a `schemaVersion` field on the save format (Phase 7).

---

## The 3D engine boundary

`64-3d-engine.js` is the textbook example of a clean module boundary in this codebase:

- Reads `objects3D`, `drawingScale`, `viewport.zoom`, `DPR`, `UB_DB`, `SHS_DB`, `BOLT_DB`, `memberFrame()`, `computeBoltGripInfo()`.
- Writes only its own `v3d*` module state.
- Calls `requestRender()` from `22-render-core.js` on orbit transitions.
- **Zero references to V25.** Zero references to `entities2D`. Zero references to `sheetMode`. Zero references to any tool name starting with `v25-`.

This is the shape every module-boundary should aspire to in the proposed structure (`08-proposed-structure.md`). If the V25 2D-Studio side were extracted into its own module with the same discipline, the codebase would have a real 2-product organisation.

The leak inside the engine itself is downward — it only knows about 4 primitive types. Every new 3D section needs a builder added here. The integration checklist should call this out as a mandatory step (Phase 1 task).

---

## Bootstrap order (73-init vs 74-bb-rail IIFE)

- `73-init.js` runs on `DOMContentLoaded`. Bootstraps canvas, seeds demo objects, initialises tools, calls `render()`.
- `74-v26-bb-rail.js` is an IIFE that runs immediately as it parses. It depends on `setTool`, `tool`, `entities2D` already being defined — those are defined by files 41, 07, 07 respectively, all of which load BEFORE 74.
- The playbook says "74 registers AFTER 73-init" — what this really means is the SCRIPT TAG order. `74` loads after `73` in the `<script>` list in `index.html`. The IIFE runs at parse time, AFTER 73-init has run its top-level code but BEFORE its DOMContentLoaded handler fires.
- **Is this fragile?** Mildly. If a future file is added with a lower number that depends on 74-bb-rail being registered, it'll break. **No file currently does this** (74's exports are window-attached so they're available to any later file). The mild fragility is that the IIFE pattern is undocumented in the playbook — Phase 1 documents it.

---

## Layer-level summary

### The 5 worst structural problems in this layer

1. **`v25Mem2Thickness` is defined twice in `68-v25-tools.js`** — Known Issue #1 from the playbook, still real, line numbers changed. Phase 6 fix.
2. **4 monkey patches in `72-v25-options-bar.js`** — Phase 5 replaces with hooks.
3. **`76-v25-plate.js` is missing from the playbook** — Phase 1 fix.
4. **`64-3d-engine.js` only renders 4 primitive types** — silent missing iso for PFC/RHS/CHS/EA/UA/WB. Phase 1 documents the gap in the integration checklist; the actual builders are out of scope for this restructure (separate Phase-3 feature work).
5. **Two parallel palette definitions** — `60` for 3D mode, `74` for 2D mode. Phase 6 unifies via a shared registry.

### Proposal for cleanly separating 2D-Studio from 3D-Studio

The cleanest hypothetical end-state (probably Phase-8 territory, beyond this restructure):

```
js/
├── shared/
│   ├── 01-config.js
│   ├── 02-data-sections.js
│   ├── 03-data-bolts.js
│   ├── 08-coords.js  (+ ppm)
│   ├── 22-render-core.js
│   ├── 24-draw-primitives.js  (+ memberFillAlpha + polygon primitives + _clipPolygon)
│   ├── 26-as1100-hatch.js  (+ all hatch patterns)
│   ├── 28-draw-block.js  (dispatcher)
│   ├── 35-draw-weld.js  (AS 1101 symbol used by both modes via mkEnt2D)
│   ├── appState.js  (single mutable state object — Phase 3 lands this)
│   └── events/  (dispatch table — Phase 4 lands this)
├── three-d-studio/   (Revit competitor)
│   ├── 05-state.js  (objects3D, projectModel)
│   ├── 06-detail-block.js  (DetailBlock + projection)
│   ├── 09-snap.js, 10-bounds-hittest.js, 11-grip-handles.js, 12-edge-snap.js
│   ├── 13-projection-lines.js, 14-section-cuts.js, 15-occlusion.js, 15a-occlusion-clip.js
│   ├── 17-fillet-chamfer.js  (V22.4 stub)
│   ├── 19-member-frame.js, 20-render-proxy.js, 21-bolt-grip.js
│   ├── 23-auto-weld.js  (detection only — dialog moves to shared)
│   ├── 27-rotation-helper.js
│   ├── 29-draw-ub.js, 30-draw-shs.js, 31-draw-section.js, 32-draw-plate.js
│   ├── 33-draw-bolt-3d.js
│   ├── 36-selection-highlights.js
│   ├── 37-view-labels.js
│   ├── 38-crosshair.js
│   ├── 48-connection-builders.js
│   ├── 60-tile-palette.js  (model tab)
│   └── 64-3d-engine.js
└── two-d-studio/   (Bluebeam competitor)
    ├── 23a-shs-joints.js  (now frame-agnostic engine + 3D + V25 adapters)
    ├── 25-parametric-holes.js  (extended for plate2)
    ├── 33b-draw-bolt-2d.js  (Phase 6, what v25-2d-bolts adds)
    ├── 34a-dispatch.js, 34b-dim.js, 34c-annotations.js, 34d-sheet.js, 34e-shapes.js
    ├── 65-v25-data-mode.js
    ├── 66-v25-helpers-frame.js
    ├── 67-v25-materials.js
    ├── 68-v25-tools.js  (drawMem2D extracted to per-section files? optional)
    ├── 69-v25-dispatch.js
    ├── 70-v25-render.js
    ├── 71-v25-selection.js
    ├── 72-v25-options-bar.js  (post-Phase-5, no more monkey patches)
    ├── 74-v26-bb-rail.js
    └── 76-v25-plate.js
```

This is the **aspirational** layout. The phased plan in `09-build-plan.md` does NOT propose moving files into subdirectories — that's a bigger break than this restructure should commit to. Instead, Phase 1 introduces **file-number bands** that encode the same separation while keeping the flat directory.

### Suggested file-boundary changes for this layer (consolidated into the relevant phases)

- Phase 1: Document `76-v25-plate.js`. Document the bootstrap order rule. Document the V25 entity model table.
- Phase 5: Remove the 4 monkey patches in `72-v25-options-bar.js`.
- Phase 6: Fix `v25Mem2Thickness` duplicate. Unify the parallel palette definitions in `60` + `74`.
- Future (Phase 8+, out of scope): Extract files into the `shared/` + `three-d-studio/` + `two-d-studio/` subdirectories.
