# Layer 3: Events/tools/palette findings (`js/39-events.js` → `js/63-layout.js`)

This is the highest-coupling layer in the app — user clicks turn into state mutations here, and 3D-mode and V25 2D-mode wrestle over the same canvas. The playbook flags **three** Phase-2 priorities in this layer: dismantle `39-events.js`, remove the V25 monkey patches (consumed here from the next layer), and lift the scattered globals.

25 files, **7,100 lines total**. Two headline findings:

1. **`39-events.js` is 1,601 lines** — playbook says 1,415. The file is **growing** since the modular split, not shrinking. It's the playbook's #1 refactor target and it's getting harder.
2. **Scattered globals are confirmed in 8 more files** (52, 55, 56, 57, 58, 53, 48 + the V25 monkey-patch state in 72). Lifting these into `appState` (Phase 3) is the foundation for every later refactor.

---

## File-by-file headlines

### E1. `39-events.js` — 1,601 lines (playbook says 1,415; +186 drift)

- **Real purpose:** Single function `initEvents()` registering all canvas listeners (mousedown/move/up/dblclick/wheel/contextmenu). The mouse trees dispatch ALL tools: 3D-mode object placement, 3D-mode grip drag, 3D-mode block drag, V25 2D-mode placement, V25 2D-mode marquee, V25 2D-mode click-cycling, edge-snap, projection-line drag, section-cut drag.
- **Affiliation:** **shared** — branches on `sheetMode` and tool name throughout.
- **Top smells:**
  - **One mega function**. Every tool path is an `if (tool === '…')` branch inside the same mouse handler.
  - **No formal state ownership** — handlers reach into globals declared in 07, 05, 11, 52, 55, 56, 57, 53 without any contract about who owns what.
  - **Hidden side-effects on undocumented globals** — the click-cycle-selection planning folder added `v25ClickCycle` state directly in `07-globals.js` to make this file's mousedown handler work, exactly the pattern that should NOT scale to ~30 tools.
- **Fix in Phase 4:** Tool-handler dispatch table. Each tool exports `{ onMouseDown, onMouseMove, onMouseUp, onKey, onWheel, onDblClick }`. `39-events.js` becomes ~150 lines of routing. Tool handlers live in `events/tool-<name>.js` files (e.g., `events/tool-v25-mem.js`, `events/tool-place-bolt-group.js`). Phase 3 is a prerequisite — handlers need a structured `appState` to declare ownership against.

### E2. `40-placement.js` — 3D-mode component placement

- Two-click placement, polygon placement, ghost-object lifecycle.
- **Smell:** `createPlacingGhost` lives in `38-crosshair.js` even though placement is here. Move in Phase 6.

### E3. `41-tools.js` — Tool state + `setTool`

- Owns the `tool` global and the `setTool(name, options)` function.
- **Smell:** Monkey-patched by `72-v25-options-bar.js` (wraps `setTool` to refresh the options bar). Phase 5 replaces with a hook.

### E4. `42-keyboard.js` — `initKeyboard`

- Owns `Escape`, `Enter`, `Ctrl+Z`, `Ctrl+Y`, `Ctrl+C`, `Ctrl+V`, etc. Coexists with the chord-key system in `57`.
- **Smell:** Two parallel keyboard systems — global keyboard shortcuts (here) and chord-layer mode (57). Different state, different precedence rules. A new keyboard shortcut today needs you to decide which file it belongs to without a documented rule.

### E5. `43-clipboard.js` — `paste` / `paste-in-place`

- **Smell:** `clipboardData` global declared here, mutated from `39-events.js`. Could be encapsulated.

### E6. `44-pdf-export.js` — 632 lines (raster + vector + canvas shim)

- **Real purpose:** PDF export pipeline. Canvas shim makes the existing render code emit jsPDF vector primitives.
- **Smell:** The canvas shim is a clever monkey-patch — replaces `ctx.lineTo` etc. with jsPDF-emitting variants for the duration of an export pass. Works, but invisible to readers of any draw file.
- **Smell:** No mention in CLAUDE.md of how to make a new entity export correctly via the shim. Every new entity type silently risks broken PDF export. Phase 1 should document the shim contract.

### E7. `45-dxf-export.js` — 800 lines

- **Real purpose:** Full DXF emission.
- **Drift:** Accurate per playbook.
- **Smell:** Parallel `if entity.type === '…'` ladder mirrors the one in `34-draw-2d.js`. Every new entity needs an export branch here. Phase 6's dispatch-table refactor should extend here.

### E8. `46-save-load.js` — Single-sheet JSON save/load

- **Top smell:** No `schemaVersion` field (known issue #5). CHANGELOG claims it was added; the file says `version: '1.0'`.
- **Fix in Phase 7:** Add `schemaVersion: 1` + load-time migration scaffold.

### E9. `47-status-bar.js` — `updateStatus`

- Trivial. Status string composition for the bottom bar.

### E10. `48-connection-builders.js` — V16 cap plate / baseplate / splice / WSP

- **Real purpose:** Connection wizard — composes a set of `objects3D` from a connection type + parameters.
- **Smell:** Connection-wizard state lives in top-level mutable `let`s here. Phase 3 — move to `appState.wizards.connection`.
- **Smell:** Wizard is **3D-mode-only**. There's no V25 2D-mode equivalent — the user can't compose a baseplate or cap plate from V25 entities through a wizard. Open question for Dan: is that a v1.x gap?

### E11. `49-sheet-browser.js` — V19.5 sheet browser sidebar

- **Drift:** Accurate per playbook.

### E12. `50-project.js` — V19.5 multi-sheet save/load

- **Top smell:** Same schema-version problem as `46-save-load.js`. `version: 1` literal, no schemaVersion.

### E13. `51-multi-page-pdf.js` — V19.5 multi-page PDF

- Stitches `44-pdf-export.js` across sheets.

### E14. `52-cmd-palette.js` — V20 Ctrl+K palette

- **Top smell:** Declares top-level mutable state (`cmdPaletteOpen`, `cmdPaletteFilter`, etc.) outside `07-globals.js`. Phase 3 — move to `appState.ui.cmdPalette`.

### E15. `53-layers-panel.js` — V20 layer visibility

- **Top smell:** Owns `layerVisibility` global. Read by every drawer. Phase 3 — move to `appState.ui.layers`.

### E16. `54-kbd-help.js` — V20 keyboard help

- Static help overlay. Trivial.

### E17. `55-mirror-tool.js` — V20 mirror tool

- **Top smell:** Top-level state for live mirror-axis preview. Phase 3.

### E18. `56-favourites.js` — V21 favourites strip

- **Top smell:** `favourites` array stored in localStorage AND mirrored to a top-level `let`. Phase 3.

### E19. `57-chord-layer.js` — V21 chord layer (M/D/A/H/B/K/W)

- **Top smell:** Parallel keyboard system (see E4). Phase 3 unifies under `appState.ui.chord`.

### E20. `58-size-picker.js` — V21 size-picker dropdown

- **Top smell:** Declares `lastUsedSection[type]` global — read by many other files. Phase 3 — move to `appState.ui.sizePicker`.
- **Touch-point for integration checklist:** A new structural section needs its catalogue wired here. Currently this is done by adding a new `if memberType === '…'` branch — should be a `SIZE_PICKER_REGISTRY[memberType] = { catalogue, columns }` table.

### E21. `59-inspector.js` — V21 inspector + V24.A3 orientation preview

- **Top smell:** 22-way `if entity.type === '…'` ladder for property panels. Same dispatch-table candidate as `34-draw-2d.js`.
- **Touch-point for integration checklist:** A new entity type needs an inspector branch here. Hard to add discoverably.

### E22. `60-tile-palette.js` — V21 mode-filtered tile grid (3D-mode Model palette)

- **Top smell:** `getPaletteDef()` is the source of truth for the 3D-mode palette. Mirrors `getDrawTabDef()` in `74-v26-bb-rail.js` for the 2D-mode palette. Two parallel palette definitions with overlapping content (every member type appears in both).
- **Top smell:** No shared catalogue — adding a new structural type requires editing both. The "Adding a new member" checklist makes this explicit but the duplication is structural.
- **Fix consideration for Phase 6:** Single `PALETTE_REGISTRY` consumed by both palette builders. Out of scope for Phase 4 — phase ordering matters.

### E23. `61-library-shim.js` — V20 legacy library shim

- Back-compat for V20 callers. Should be auditable for removal — does anything still call it?

### E24. `62-toolbar.js` — `initToolbar` + dispatch

- Owns the top toolbar's buttons.

### E25. `63-layout.js` — `fitToView` + `layoutBlocks` + resize

- Owns block placement on the sheet.

---

## Layer-level summary

### The 5 worst structural problems in this layer

1. **`39-events.js` is monolithic and growing.** 1,601 lines, one function, dispatches ~30 tools, side-effects globals declared in 8 other files. The playbook's #1 Phase-2 ticket and the file is bigger now than when the ticket was written.
2. **Scattered globals across 8 files** outside the canonical `07-globals.js`. Every new feature finds a new home for its state. Phase 3 lifts everything into `appState`.
3. **Two parallel palette definitions** — `60-tile-palette.js` `getPaletteDef()` for 3D mode, `74-v26-bb-rail.js` `getDrawTabDef()` for 2D mode. Every new structural type has to be added to both (the integration checklist enforces this manually).
4. **Two parallel keyboard systems** — `42-keyboard.js` global shortcuts vs `57-chord-layer.js` chord mode. Different precedence rules, no documented split.
5. **22-way entity-type ladder in `59-inspector.js`** mirrors the one in `34-draw-2d.js` and `45-dxf-export.js`. Same dispatch-table candidate, three implementations.

### Concrete dispatch-table design for `39-events.js` (Phase 4)

```
// dev/js/39-events.js (slimmed to ~150 lines)
const TOOL_HANDLERS = {
  'select':        require('events/tool-select'),
  'v25-select':    require('events/tool-v25-select'),
  'v25-mem':       require('events/tool-v25-mem'),
  'v25-plate':     require('events/tool-v25-plate'),
  'v25-bolt':      require('events/tool-v25-bolt'),       // future
  'line':          require('events/tool-line'),
  'rect':          require('events/tool-rect'),
  'circle':        require('events/tool-circle'),
  'polyline':      require('events/tool-polyline'),
  'draw-member':   require('events/tool-draw-member'),
  'draw-plate':    require('events/tool-draw-plate'),
  'place-bolt-group': require('events/tool-place-bolt-group'),
  'mirror':        require('events/tool-mirror'),
  // ... one entry per tool
};
// each handler exports { onMouseDown, onMouseMove, onMouseUp, onKey, onWheel, onDblClick }

// 39-events.js dispatch:
canvas.addEventListener('mousedown', e => {
  const h = TOOL_HANDLERS[tool];
  if (h && h.onMouseDown) h.onMouseDown(e, appState);
});
// ... mirror for the other event types
```

Each handler is a single file with full ownership of its tool's state (declared in `appState.tools.<toolName>`). The `events/` subdirectory makes the tool surface area visible at a glance.

### Every "scattered global" found in this layer (grouped)

**UI state** (move to `appState.ui.*`):
- `cmdPaletteOpen`, `cmdPaletteFilter` (52)
- `layerVisibility` (53)
- `mirrorAxis`, `mirrorLivePreview` (55)
- `favourites` (56)
- `chordKey`, `chordTimer` (57)
- `lastUsedSection[type]` (58)
- `inspectorOpen`, `inspectorEntity` (59 — likely)
- `paletteMode`, `paletteCategory` (60)
- `activeChordKey` (57)

**Tool state** (move to `appState.tools.*`):
- `tool` (07 — correctly placed)
- `drawStart`, `clickPts`, `polyPts` (07)
- `placing`, `placingGhost` (07)
- `dragging`, `dragStart`, `dragOffset` (07)
- `boltGroupConfig` (38 likely — needs verify)

**Wizard state** (move to `appState.wizards.*`):
- Connection-wizard state (48)

**Model dialog state** (move to `appState.dialogs.*`):
- `_weldDialogLast` (23)
- `_shsJointPopup` (23a)
- `_v25JointCache`, `_v25JointCacheDirty` (23a)
- `mitrePairs` (23a)

**V25 monkey-patch state** (eliminated entirely in Phase 5):
- 4 wrapped functions in `72-v25-options-bar.js`

### Files where the 2D/3D split is clearly violated

- **`39-events.js`** is honestly mixed (it has to be — events go to whatever tool is active). Not a violation, but the lack of structure makes the mixing painful.
- **`44-pdf-export.js`** + **`45-dxf-export.js`** are both mode-agnostic but have to know every entity type. Phase 6 dispatch-table refactor extends to these.
- **`60-tile-palette.js`** + **`74-v26-bb-rail.js`** are split cleanly by mode but duplicate the same catalogue content. Phase 6 unifies.

### Suggested file-boundary changes for this layer (consolidated into Phase 4)

1. Create `dev/js/events/` subdirectory (the first non-flat structure in `js/`).
2. One file per tool inside `events/`.
3. `39-events.js` becomes the dispatch + global-event setup file.
4. Touch-point document: how to add a new tool — single new file, single line in the dispatch table.
