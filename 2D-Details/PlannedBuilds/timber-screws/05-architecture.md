# 05 — Architecture

> How this feature plugs into StructDraw's existing 74‑file numbered structure. Pairs with `02-data-model.md` (entities) and `03-rule-engine.md` (algorithm).

The feature is structurally additive — new files at the end of the load order, plus light edits to existing dispatch / inspector / toolbar files. No refactor of existing modules.

---

## 1. New files to add

All paths relative to `dev/js/`. File numbers follow the project root `CLAUDE.md` convention (load order matters; gaps allow inserts; don't reuse retired numbers).

### Data layer (load between existing data files)

| File | Purpose | Mirrors |
|---|---|---|
| `02b-data-timber.js` | TimberSection presets, TimberClass entries, k_mod matrix | `02-data-sections.js` |
| `02c-data-screws.js` | Rothoblaas HBS Plate ScrewSpec entries | `03-data-bolts.js` |
| `02d-data-rothoblaas-rules.js` | RuleSet, NefTable, CapacityTable consts | (no precedent — new) |

These are **classic `<script>`** files exporting top-level consts (per project root `CLAUDE.md` workflow rule #8 — globals via top-level only, no modules).

### Entity / drawing layer (numbers 75–79, new territory)

| File | Purpose | Mirrors |
|---|---|---|
| `75-timber-member.js` | TimberMember entity creation, draw, grip handles, grain‑direction hatching | `29-draw-ub.js`, `30-draw-shs.js`, `31-draw-section.js` |
| `76-screw-entity.js` | Screw entity creation, draw, head/shank views, grip handles | `33-draw-bolt.js`, `21-bolt-grip.js` |
| `77-connection.js` | Connection entity, load‑vector arrow, member binding | (no precedent — new) |
| `78-checks-timber.js` | The CheckEngine — `checkConnection(c, model) → result` | (no precedent — new) |
| `79-checks-render.js` | Render check results on canvas (red leaders, dimensions, badges) | `13-projection-lines.js`, `35-draw-weld.js` |

These files own the new structural logic. They are isolated — `78-checks-timber.js` is a pure function with no DOM/canvas access, so it's straightforwardly testable.

### Catalogue helpers (small, may collapse into one)

| File | Purpose |
|---|---|
| `02e-catalogue-lookups.js` | Helper fns: `getScrewSpec(id)`, `getRuleSet(...)`, `lerpNef(n, a1d)` |

May not warrant its own file — could live at the top of `78-checks-timber.js`. Decide during Phase 0.

---

## 2. Existing files needing edits

| File | Edit |
|---|---|
| `05-state.js` | Add feature flag `FEATURE_TIMBER_SCREWS = true` (default on in dev/, off in v1 release builds initially) |
| `07-globals.js` | Add `currentConnectionId` (the connection being edited in the inspector); no other globals — Connection lives in `blocks[i].ents[]` |
| `28-draw-block.js` | Dispatch `'timber-member'`, `'steel-plate'`, `'screw'`, `'connection'` to the new draw functions |
| `41-tools.js` | Register new tools: `tool-timber-member`, `tool-screw`, `tool-load-arrow` |
| `42-keyboard.js` | Add chord layer entries (e.g. `T` for timber-member tool, `H` for HBS screw — see `06-ux.md`) |
| `46-save-load.js` | Add `schemaVersion: 2`; serialise/deserialise new entity types (works out of the box since the format is JSON-of-ents — just need version bump) |
| `47-status-bar.js` | Surface check overall status when a Connection is selected |
| `52-cmd-palette.js` | Add commands: "Insert timber column", "Insert HBS screw", "Set load direction" |
| `53-layers-panel.js` | Add layers: `timber`, `steel`, `screws`, `connections-meta` |
| `56-favourites.js` | Add favourites for common screw specs (HBSPL12×100 etc.) |
| `58-size-picker.js` | Hook screw size picker into the screw tool |
| `59-inspector.js` | The big edit. Add Connection inspector panel with check breakdown. |
| `60-tile-palette.js` | Add tiles for timber sections, HBS screw sizes |
| `62-toolbar.js` | Wire the new tools into the toolbar |
| `74-v26-bb-rail.js` | If using BB-rail in v26 left-rail, add timber-connection chord group |

Per project root `CLAUDE.md`: **bug fixes don't bundle with refactors.** This feature touches a lot of files but every change is the same nature — wiring a new entity type into existing dispatch points. That's additive, not refactor; it qualifies as one feature PR.

---

## 3. Load order

The numbered prefix on each file determines `<script>` load order in `index.html`. Order matters because globals defined in earlier files are referenced by later files.

For the new files:
```
02-data-sections.js          (existing)
02b-data-timber.js           NEW — timber classes, k_mod
02c-data-screws.js           NEW — HBS Plate catalogue
02d-data-rothoblaas-rules.js NEW — rule tables
02e-catalogue-lookups.js     NEW — lookup helpers
03-data-bolts.js             (existing — bolts catalogue)
...
74-v26-bb-rail.js            (existing — last existing file)
75-timber-member.js          NEW
76-screw-entity.js           NEW
77-connection.js             NEW
78-checks-timber.js          NEW
79-checks-render.js          NEW
```

Update `dev/index.html` `<script>` tags to include the new files in numerical order.

---

## 4. Integration touchpoints

### 4.1 Tools registration

`41-tools.js` defines tool IDs and their cursor/snap/preview behaviour. Add:

```
'tool-timber-member' — two-click rectangle placement, uses snap, sets default grainDir to long axis
'tool-screw'         — single-click placement, requires active Connection, uses snap to edge / grid
'tool-load-arrow'    — two-click vector placement, sets connection.load.F_d_dir and magnitude
```

### 4.2 Block-level draw dispatch

`28-draw-block.js` currently dispatches on `ent.type`. Add cases:
```js
switch (ent.type) {
  case 'ub':           drawUB(...); break;
  case 'bolt':         drawBolt(...); break;
  // ... existing cases
  case 'timber-member':  drawTimberMember(ent, ctx, view); break;  // 75-
  case 'steel-plate':    drawSteelPlate(ent, ctx, view);    break;  // existing 32-plate, but with steel-plate flag
  case 'screw':          drawScrew(ent, ctx, view);         break;  // 76-
  case 'connection':     drawConnectionOverlay(ent, ctx);   break;  // 77- (renders the load arrow + check badges)
  // ...
}
```

`'steel-plate'` is a small variant of the existing plate entity. Decide whether to use the existing plate type and add a `material: 'steel'` flag, or a new `'steel-plate'` type. Recommended: reuse `'plate'` with `material` flag — keeps the drawing primitive shared.

### 4.3 Inspector panel

`59-inspector.js` currently dispatches on selection type. Add Connection panel: when the selected ent is a Connection, render the check‑result table per `03-rule-engine.md` §7. When the selected ent is a Screw, render screw spec + which connection it belongs to + its individual check rows.

### 4.4 Status bar

`47-status-bar.js` reads the current selection and shows context. Add: when a Connection is selected, show "✓ PASS" or "✗ FAIL η=3.52" badge.

### 4.5 Save / load schema

`46-save-load.js` reads/writes `.sd2.json`. The format is a JSON dump of `blocks` and their `ents[]`. New entity types serialise trivially. **Required edit**: add `schemaVersion: 2` to the root of the JSON (currently absent — project root `CLAUDE.md` known issue #5). On load, if `schemaVersion < 2`, run a migration shim (no-op for v1 since old files have no connections).

---

## 5. The Connection lifecycle

How a Connection is created and managed in the UI (more detail in `06-ux.md`):

1. User draws a TimberMember (with grainDir).
2. User draws a SteelPlate over part of the timber.
3. User invokes "Start connection" (toolbar / palette).
4. Tool prompts: "Click the rear member" → user clicks the timber → bound as rear.
5. Tool prompts: "Click the front entity" → user clicks the plate → bound as front.
6. Connection is created with no screws and no load.
7. User invokes the screw tool. Screws are now placed *into* the active Connection.
8. User invokes "Set load" → two clicks define the load vector; magnitude prompt in inspector.
9. Engine runs on every screw placement, screw drag, member edit, plate edit, load edit.

The Connection is the **selection anchor** for the check inspector. Selecting any screw highlights the Connection; selecting the Connection shows all checks.

---

## 6. Rendering layers

Per `53-layers-panel.js`'s existing layer system, add four layers:

| Layer | Default visible | Contents |
|---|---|---|
| `timber` | yes | TimberMember outlines, grain hatching |
| `steel`  | yes | SteelPlate outlines, plate hatching |
| `screws` | yes | Screw heads, shank lines |
| `connections-meta` | yes | Load arrow, check badges, red‑leader dimensions, edge classification indicators |

`connections-meta` is the layer engineers toggle off when exporting the final drawing — they want the screws + hatching + dimensions, but not the check leaders.

---

## 7. Existing modules used as‑is

The feature leans heavily on existing infrastructure. No edits needed to these:

| Module | What we use |
|---|---|
| `06-detail-block.js` | DetailBlock projection, blocks containing entities |
| `08-coords.js` | s2px, px2s, real2px, px2real for screen ↔ world mapping |
| `09-snap.js` | Object snap when placing screws (snap to plate edge, member edge, existing screw) |
| `10-bounds-hittest.js` | Hit-test for clicking screws / members |
| `11-grip-handles.js` | Grip handles for moving screws, resizing member outlines |
| `12-edge-snap.js` | Edge snap when placing screws (snap to a column of existing screws) |
| `22-render-core.js` | Render loop, `requestRender`, `drawSheet` |
| `24-draw-primitives.js` | rLine, dimensioning primitives |
| `26-as1100-hatch.js` | Cross-hatching — extend with timber-grain pattern and steel-plate pattern |
| `36-selection-highlights.js` | Selection highlight rendering |
| `37-view-labels.js` | View labels on blocks |
| `43-clipboard.js` | Paste connections (with screw refs remapped to new IDs) |
| `44-pdf-export.js` | PDF export — connections export as drawing entities; check badges suppressed |
| `45-dxf-export.js` | DXF export — same |

The hatch module deserves attention. Existing `26-as1100-hatch.js` does steel cross-hatching. We need to add **timber grain hatching** (parallel lines along the grain direction) and **steel‑plate hatching** (which probably reuses existing steel hatch, but on the plate outline rather than a section profile).

---

## 8. Testing approach

Per `09-test-cases.md` — full test cases. Architecturally:

- The rule engine in `78-checks-timber.js` is a **pure function**. Test by calling with fixture connections and asserting against expected results.
- A small headless test harness can be added to `dev/test/test-rules.html` — it loads the catalogue files + the rule engine + a fixtures file, runs every test case, prints pass/fail.
- This is consistent with the project root `CLAUDE.md` Phase‑3 priority "A JSDOM-based test harness exercising every tool." For now, browser‑based test harness is enough.

The drawing layer (`75-`, `76-`, `77-`, `79-`) is harder to unit‑test but can be manually verified against the test cases.

---

## 9. Naming conventions to follow

Per project root `CLAUDE.md` "Variable conventions":

| Prefix / suffix | Use for |
|---|---|
| `u, v` | view-local 2D coords (real mm). Use for screw positions, edge distances, grain‑frame components |
| `x, y, z` | world 3D coords. **Not used in v1** — everything is 2D view-local |
| `px, py` | screen pixels |
| `sx, sy` | sheet-mm |
| `r` prefix | draw fns that take real-world coords (e.g. `rLine`) |
| `tmbr` prefix | new prefix for timber-feature globals (parallels existing `bb`, `v25`, `v3d`) |

For example: `tmbrCheckCache`, `tmbrCurrentConnectionId`, `tmbrRender()`. Keep all new globals in `07-globals.js` with this prefix so they're easy to find/grep.

---

## 10. Out-of-scope architectural concerns

These do not block v1 but are worth flagging:

- **Plugin extraction.** The whole timber-screw feature could be extracted to a plugin in `js/addons/timber-screws/` for Phase 3 (commercial release). The architecture is already plugin-shaped — new files at the end of load order, all new globals prefixed, no edits to existing core. Just package them as a single bundle.
- **ESM migration.** When the project root migrates to ESM (Phase 3), this feature is ESM-friendly — each new file becomes its own module with explicit imports of catalogue / engine.
- **MyProject parity.** Rothoblaas ships MyProject software with the full ETA logic. Long-term, we should test our engine output against MyProject for the same inputs to catch any divergence. Park for v1.x.
