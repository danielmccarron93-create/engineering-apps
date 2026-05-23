# StructDraw — Architecture v2 — Plate Fix Plan (Phase 1+2 corrective)

Status: ✅ Ready to build — Q1-Q7 locked 2026-05-23
Last touched: 2026-05-23
Owner: Dan McCarron
Scope: Bring v2 plates to **full v1-plate2 parity** in a single fix chat. Fixes every bug from the 2026-05-23 diagnosis chat and addresses the seven fundamental issues that produced them. After this fix, v2 plates do everything v1 plate2 did + the new architecture benefits, with no "Phase N later" markers.

---

## TL;DR for the build chat

You're picking this up cold. Do this in order:

1. Read `/CLAUDE.md` end-to-end — especially "Target user / quality bar / two-mode requirement", "Adding a new member, fastener, or hatch type", and rule 10 (don't delete `archive/snapshots/`).
2. Read `/PlannedBuilds/README.md` — the dashboard.
3. Read `/PlannedBuilds/architecture-v2/README.md` + `08-pilot-feature.md` + `09-build-plan.md` Phase 1+2 rows (the contract Phase 1+2 were meant to deliver).
4. Read this file end-to-end. Q1-Q7 are locked — don't re-litigate.
5. Read every v2 file in §7 "Files touched" and the v1 files we'll restore/extend.
6. Note working-tree state: Phase 3 (bolts) is uncommitted. Stash it (`git stash`) before starting W1; restore after W12 if Dan wants. Bolts re-plan once this ships.
7. Execute W1 → W13 in the stated order. Verify each block against its gate before advancing.
8. Stop after W12 soak rehearsal for Dan's review before W13 docs + commit.

---

## 1. Why this exists

Phase 1 (pilot — plates) was tracker-marked ✅ on 2026-05-22. Phase 2 (retire v1 plate path) shipped the same day. The 2026-05-23 diagnosis chat surfaced eleven distinct bugs on the v2 plate tool, mapping to seven fundamental issues:

| # | Bug | Root cause |
|---|---|---|
| 1 | Can't Escape Plate tool; can't switch to another tool | No lifecycle handshake — `setActiveTool(null)` never called by Esc or v1 tile clicks |
| 2 | Can't select a placed v2 plate | No v2 selection layer; v1's selection iterates `entities2D` only |
| 3 | Can't drag a placed v2 plate | Same as #2 |
| 4 | Can't rotate a placed v2 plate | Same as #2 + no rotation field on `region` geometry |
| 5 | No subtle edge-snap on placement | `event-dispatch.js viewToModel` calls `px2real` and stops — never invokes `snapUV` / edge-snap |
| 6 | "PL 10 THK" label on every plate | Hardcoded in `live-render.js` — invented behaviour, v1 didn't do this |
| 7 | Plate shaded grey | Hardcoded `colorAlpha(col, 0.06)` fill regardless of aspect |
| 8 | Outline too thick | Uses `LW.CUT` for every plate; v1 used `LW.VIS` for face-on, `LW.CUT` for cut |
| 9a | No snap to member outer edge | Same as #5 |
| 9b | No auto-weld lines | v1 auto-weld iterates `entities2D`; v2 plates not there |
| 10a | Lost rectangle drag-to-commit | UX cascade from #1 (state machine corrupted by lifecycle bugs) |
| 10b | Lost polygon mode | Only reachable via `P` key, no visible UI |
| 11 | 2D plate appearing in 3D mode | `buildV2PlatesInScene` unconditional; view-local `region` plates shouldn't appear in 3D |

The **seven fundamentals** (covered by this fix):

- F1: The "smallest shim" downgrades v1 (hardcoded label/fill/lineweight regardless of aspect).
- F2: Selection/grip/move was Phase 10 — but unusable without it. Brought forward.
- F3: No tool lifecycle handshake between v1 and v2. Added.
- F4: Geometry-kind mismatch between brief and impl. Decision locked: `region` stays, 3D rendering gated.
- F5: Snap pipeline not exposed to v2 tools. Wired through `buildCtx`.
- F6: Phase 2 retired v1 plate2 before Phase 1 soak. Workflow gate updated (§10).
- F7: v2-authoritative graft preserves state but not behaviour. Mirror seam adds behaviour participation.

---

## 2. Goal & non-goals

### Goal

After this fix ships:

- v2 plates do **everything** v1 plate2 did with the same UX: place (rect drag-release OR two-click OR polygon), select, move, rotate via grip, resize via grips, change thickness, change aspect (elev/sec), delete, undo, redo, save, reload, export to PDF, export to DXF.
- Visual quality matches v1 plate2 at the AS 1100 + STP 6011 quality bar.
- Mirror seam pattern is the template every future migration uses (bolts, members, timber, etc.).
- v2 keeps owning the data model (the rebuild's legitimate goal — cleaner file structure — is preserved).
- No "Phase N later" markers remain on plates.

### Non-goals (out of scope for this chat)

- ❌ Building a v2-native selection layer (W6 mirror approach uses v1's).
- ❌ Replacing the live-render shim with a full `Canvas2DRenderer` wiring (W3 makes the shim AS-correct; full rewrite is a future phase).
- ❌ Promoting `region` geometry to model-level `plate` (Q4 — keep `region`).
- ❌ Unifying v1+v2 undo stacks (W9 uses synthetic v1-stack entries).
- ❌ ESM, TypeScript, bundler.
- ❌ Phase 3 (bolts) progress — stays stashed until plates ship and soak.
- ❌ Restoring the v1 plate2 placement tool (v2 PlacePlateTool is the only way to create plates).

---

## 3. Strategy — "v1 interactive layer, v2 model store"

The seven fundamentals collapse to one missing piece: **v2 plates need to be visible to v1's selection, snap, grip, edge-snap, auto-weld, PDF, and DXF systems** — not as second-class shimmed paint, but as full participants.

**The seam:** the v1-bridge adds a `mirrorV2IntoV1` step to its sync flow. After every shadow re-sync, walk `v2.appState.model.elements` and inject a synthetic v1-shaped entry for each v2 plate into `entities2D[viewKey]`:

```javascript
{
  kind: 'plate2',           // matches the type v1's layers look for
  _v2Mirror: true,          // marker so v1 doesn't write directly
  _v2Id: el.id,             // back-reference to the v2 element
  polygon: [...],           // copied from el.geometry.polygon
  aspect: 'elev',           // from el.params.aspect
  thk: 10,                  // from el.params.thickness
  frame: {...},             // copied from el.geometry.frame
}
```

v1's selection, hit-test, grip handles, move, rotate, edge-snap, auto-weld, PDF/DXF, copy-paste, mirror tool — all treat the mirror as an ordinary plate2 and act on it. When v1's grip-drag or move handler tries to mutate the mirror, an interceptor translates the v1 mutation into a v2 `editElement` transaction and applies through `v2.engine.undoStack`. Direct mirror mutations are blocked (the next sync would clobber them anyway).

This is not a shortcut. It's the right interim state:

- Preserves daily-use behaviour (every v1 layer keeps working unchanged on plate2 mirrors).
- Keeps v2 as the source of truth for plate data.
- Sets the template: every future migration mirrors v2 elements into v1's interactive layer, then later phases gradually move each v1 layer (selection, snap, grip, etc.) into v2-native form one at a time.
- Fully reversible (the mirror is a runtime extension to v1-bridge; remove the function, it's gone).

The plate placement path is the ONE v1 layer that's already v2-native (PlacePlateTool). Every other v1 layer keeps working on the plate2 mirror.

---

## 4. Locked open questions

These were debated in the diagnosis chat and locked 2026-05-23. **Do not re-litigate.**

| # | Question | Locked answer | Rationale |
|---|---|---|---|
| Q1 | Aspect picker UX — one tile + Aspect chip, or two tiles? | **One tile + Aspect chip in options bar** | Matches v1 plate2 muscle memory. Less rail clutter. |
| Q2 | Ctrl+Z — stack coordinator or push synthetic v1 entries for v2 transactions? | **Push synthetic v1 entries** | v1's Ctrl+Z just works; user doesn't care which store the mutation came from. |
| Q3 | Mirror direction — v2-only ever (v1 plate2 stays deleted) or restore v1 plate2 as fallback? | **v2-only** | No backwards steps. The mirror gives v1's *behaviours* to v2 elements without restoring v1 plate2 storage. |
| Q4 | Geometry kind — keep `region` or promote to `plate`? | **Keep `region`** | v1 plate2 was view-local; matching it preserves daily-use semantics. Model-level plates with frames are a future feature. |
| Q5 | 3D rendering of view-local v2 plates — remap or skip? | **Skip entirely** | v1 plate2 didn't appear in 3D. Matching v1 = skipping. The "new 3D capability" deliverable from the pilot brief is unreachable with `region` geometry; don't half-ship. |
| Q6 | Inspector — extend v1's `59-inspector.js` or wire v2's `inspector-plate.js` to v1's selection? | **Extend v1's inspector to call v2's panel** | One inspector code path. v1's panel pattern is known. Less to reinvent. |
| Q7 | Snap source-of-truth — mirror participates in v1's snap or build v2-native snap now? | **Mirror participates** | v1's snap is the proven AS-grade snap. Reuse it. |

---

## 5. Work blocks

Each block: **what** · **files touched** · **verification gate** · **estimated effort**.

### W1 — Tool lifecycle handshake (foundation)
**Fixes bugs:** 1, 10a (downstream)

**What:**
- `PlacePlateTool.onKey` Esc handler calls `v2.engine.setActiveTool(null)` after clearing state.
- Wrap v1's `setTool` (`js/41-tools.js`), `v25SetTool` (`js/69-v25-dispatch.js`), `v25SetHatch`, `v25PickAndSetMember` to call `v2.engine.releaseActiveTool()` before running original.
- Add `v2.engine.releaseActiveTool()` helper (calls `setActiveTool(null)` if any v2 tool active; no-op otherwise).
- BB-rail tile container's outer click handler releases v2 tool before dispatching the tile's onClick (belt-and-braces).
- Surface "v2 tool active" visual state on the BB-rail Plate tile (CSS class — same active-state pattern other tiles use).

**Files touched:**
- `js/v2/tools/place-plate-tool.js` — Esc deactivates tool
- `js/v2/engine/active-tool.js` — `releaseActiveTool()` export
- `js/v2/engine/v1-bridge.js` — extend `WRAPPED` with `setTool`, `v25SetTool`, `v25SetHatch`, `v25PickAndSetMember`; wrappers call `releaseActiveTool()` before original
- `js/74-v26-bb-rail.js` — tile click outer handler + active-state CSS class for Plate tile

**Verification gate:**
- Click Plate tile → press Esc → click UB tile → click canvas → a UB places (not a plate).
- Click Plate tile → click UB tile (no Esc) → click canvas → a UB places.
- Plate tile shows active state when v2 PlacePlateTool active.
- DevTools `v2.engine.activeTool()` returns null after Esc or tile switch.

**Effort:** 2 h.

---

### W2 — Snap pipeline exposed to v2 buildCtx
**Fixes bugs:** 5, 9a

**What:**
- `event-dispatch.js viewToModel` runs cursor through v1's snap stack after `px2real`: `snapUV` (grid), edge-snap probe from `12-edge-snap.js`, ortho lock if Shift held.
- The cursor's `.u` / `.v` returned to the tool is the snapped value.
- Visual snap indicators (priority-point highlight, edge-snap highlight) fire from v1's existing snap paths — no v2 work needed there.

**Files touched:**
- `js/v2/engine/event-dispatch.js` — `viewToModel` calls `snapUV` + `edgeSnap` after `px2real`

**Verification gate:**
- Hover cursor near a UB flange edge → cursor snaps to the edge → place plate → plate corner is exactly on the edge.
- Hold Shift while placing second corner → ortho-locks to horizontal/vertical from first corner.
- Snap visual indicator appears at priority points.

**Effort:** 2 h.

---

### W3 — Aspect-aware rendering (AS 1100 compliance)
**Fixes bugs:** 6, 7, 8

**What:**
- `PlacePlateTool.buildPlateTx` reads `appState.ui.activePlateAspect` and stamps `params.aspect` on every placed element.
- `drawV2PlatesOnCanvas` in `live-render.js` branches on `el.params.aspect`:
  - `'elev'` (face-on) → outline at `LW.VIS` (0.35 mm × ppm), NO fill, NO label
  - `'sec'` (edge-on / cut) → outline at `LW.CUT` (0.70 mm × ppm), AS 1100 45° steel hatch (use `as1100-steel-45` hatch primitive from Phase 0f catalogue), NO label
- Delete the centroid `fillText('PL ' + thk + ' THK', …)` block.
- Delete the unconditional `colorAlpha(col, 0.06)` fill.
- Wire the existing hatch primitive at `js/v2/render/canvas2d/primitives/hatch.js` (or reuse v1's hatch fn — pick whichever is simpler).

**Files touched:**
- `js/v2/tools/place-plate-tool.js` — `buildPlateTx` includes `aspect`
- `js/v2/ui/live-render.js` — aspect-branched draw, removed label + fill, wired hatch

**Verification gate:**
- Place an `elev` plate → thin outline, no fill, no label.
- Place a `sec` plate → thick outline, AS 1100 45° steel hatch, no label.
- Side-by-side screenshot vs a v1 plate2 from git history (`git show <pre-Phase-2 commit>:js/76-v25-plate.js` for reference) → visually equivalent or better.

**Effort:** 3 h.

---

### W4 — Aspect picker (Options bar)
**Fixes:** Aspect changeability

**What:**
- When `v2.engine.activeTool()?.id === 'place-plate'`, `72-v25-options-bar.js` renders an Aspect chip showing `Elev` / `Sec`. Click toggles `appState.ui.activePlateAspect` and emits a `dirtyBus` event so the tool's preview re-renders.
- Same chip pattern v1 had. The chip is the SAME chip slot v1 plate2 used; just wired to v2 state instead of v1's `v25Last.plateAspect`.

**Files touched:**
- `js/72-v25-options-bar.js` — add v2 plate aspect branch
- `js/v2/ui/palette-bb-rail.js` — `activatePlate()` defaults aspect from `appState.ui.activePlateAspect` (already does this; verify)

**Verification gate:**
- Click Plate tile → Options bar shows Aspect chip → click `Sec` → next placement renders as a section plate (W3 branch fires).

**Effort:** 1.5 h.

---

### W5 — Polygon mode UX
**Fixes bug:** 10b

**What:**
- When PlacePlateTool active, Options bar renders a Mode chip `Rect` / `Poly`. Click toggles `appState.tools['place-plate'].mode`.
- Status bar reads `tool.statusText(ctx)` and shows the current mode + next-action hint (the `statusText` fn already exists in `place-plate-tool.js:269-279` — `47-status-bar.js` just needs to call it).
- Keep `P` and `R` keyboard shortcuts as power-user paths.

**Files touched:**
- `js/72-v25-options-bar.js` — Mode chip
- `js/47-status-bar.js` — call `v2.engine.activeTool()?.statusText(ctx)` when a v2 tool is active

**Verification gate:**
- Click Mode chip → Poly → click 5 times + dblclick → 5-vertex polygon plate placed.
- Switch back to Rect → click-drag-release → rectangle.
- Status bar shows current mode + next-action hint at all times.

**Effort:** 1.5 h.

---

### W6 — v2→v1 mirror (THE CENTRAL SEAM)
**Fixes bugs:** 2, 3, 4, 9b — unlocks W7, W8, W11

**What:**

Add to `js/v2/engine/v1-bridge.js`:

- `mirrorV2IntoV1()` — walks `v2.appState.model.elements`. For each `category === 'plate' && params.v2Source === 'place-plate-tool'`:
  - Compute the viewKey from `el.geometry.viewId` (strip `v1-view-` prefix).
  - Inject `{kind: 'plate2', _v2Mirror: true, _v2Id: el.id, polygon, aspect, thk, frame}` into `entities2D[viewKey]`.
  - Stable id derived from `el.id` so multiple syncs don't duplicate; remove on next sync if v2 element is gone.
- Call `mirrorV2IntoV1()` at the END of `syncFromV1()`, after the v2-authoritative graft.

Intercept v1 plate2 mutators in `js/71-v25-selection.js` grip-drag paths:

- When a grip-drag would mutate a plate2 entry with `_v2Mirror: true`:
  - Translate the new polygon into an `editElement` transaction: `v2.transactions.editElement(entry._v2Id, {geometry: v2.model.region({viewId, polygon: newPoly})})`.
  - Apply through `v2.engine.undoStack.applyTransaction(tx)`.
  - DO NOT mutate the mirror directly — the next sync regenerates it from v2.
- Same pattern for: body-drag move (`39-events.js` move handlers), delete (`71-v25-selection.js v25DeleteSelected`), rotation grip (if v1 had a rotation grip path for plate2 — restore it).

Restore the deleted plate2 READ paths from Phase 2 (so v1's existing layers SEE the mirror):

- `js/71-v25-selection.js` — restore `v25EntBounds` plate2 branch, `v25EntHandles` plate2 handle generation (grip positions at polygon vertices + edge midpoints + a rotation handle).
- `js/68-v25-tools.js` — restore plate2 edge-collection (so `23-auto-weld.js` sees plate2 edges).
- `js/69-v25-dispatch.js` — restore plate2 draw dispatch BUT make it a no-op for `_v2Mirror: true` entries (the v2 live-render handles paint; the mirror is for hit-test/edges only). Non-mirror plate2 should never exist post-Phase-2 — assert this if encountered.
- `js/39-events.js` — restore plate2 snap probe contribution (so edge-snap to plate edges works) and body-drag-snap leg (so a moved plate snaps to other geometry).

**Files touched:**
- `js/v2/engine/v1-bridge.js` — `mirrorV2IntoV1` + interceptor helpers
- `js/71-v25-selection.js` — restore read paths + grip-drag translation
- `js/68-v25-tools.js` — restore edge-collection
- `js/69-v25-dispatch.js` — restore draw dispatch (no-op for mirrors)
- `js/39-events.js` — restore snap probe + body-drag-snap

**Verification gate:**
- Click a placed v2 plate → selection highlights appear.
- Grip handles appear at all polygon vertices + edge midpoints + a rotation handle.
- Drag a vertex grip → polygon resizes → `v2.appState.model.elements.get(id).geometry.polygon` reflects the new shape.
- Drag the plate body → moves; v2 element moves.
- Drag the rotation grip → polygon rotates; v2 element's polygon updates (rotation field on params if needed, see Q4 note).
- Delete key → plate disappears from canvas + from `v2.appState.model.elements`.
- All operations participate in Ctrl+Z (via W9).

**Effort:** 6-8 h. The biggest block.

---

### W7 — Auto-weld participation
**Fixes bug:** 9b

**What:**
- W6's mirror puts plate2-shaped entries in `entities2D`. v1's `23-auto-weld.js` walks `entities2D` and member objects — it will pick up the mirrors automatically.
- Verification only; no code change unless an issue surfaces.

**Files touched:** none.

**Verification gate:**
- Place a section (`sec`) plate touching a UB flange in the elevation view → auto-weld lines appear at the contact.
- Move the plate away → auto-weld lines disappear.
- Two plates touching each other → auto-weld between them.

**Effort:** 0.5 h verification.

---

### W8 — Inspector wired to selection (Q6)
**Fixes:** Inspector deferred-to-Phase-10 issue

**What:**
- Extend `js/59-inspector.js` — when the selected entity is `_v2Mirror: true` AND `kind === 'plate2'`, call `v2.ui.inspectorPlate.renderForElement(entry._v2Id, host)` instead of v1's own panel.
- `v2.ui.inspectorPlate` already exists and works (per the Phase 1 build) — verify it dispatches edits through `v2.engine.undoStack` correctly.
- Verify the size-picker (thickness dropdown) is wired and changes the thickness via `editElement`.

**Files touched:**
- `js/59-inspector.js` — branch on `_v2Mirror` for plate2
- `js/v2/ui/inspector-plate.js` — verify (no edit expected)
- `js/v2/ui/size-picker.js` — verify (no edit expected)

**Verification gate:**
- Select a v2 plate → Inspector shows: Family (plate-flat), Thickness (picker dropdown), Material (steel-s300), Geometry summary.
- Change thickness in the picker → plate re-renders with the new thickness; AS hatch density updates for `sec` plates.
- Material section reads correctly (read-only for now per Phase 1 inspector design).

**Effort:** 2 h.

---

### W9 — Ctrl+Z routes through both stacks
**Fixes:** Ctrl+Z doesn't reach v2 plate ops

**What:**
- Per Q2: on every `v2.engine.undoStack.applyTransaction` call, push a synthetic entry onto v1's `undoStack` (from `js/05-state.js`).
- Synthetic entry shape: `{apply: () => v2.engine.undoStack.redo(), undo: () => v2.engine.undoStack.undo(), _v2: true, _v2TxType: tx.type}`.
- v1's Ctrl+Z handler walks v1's stack — it now interleaves v1 and v2 mutations chronologically. The synthetic entry's undo calls v2's undo; apply calls v2's redo.
- Verify v1's `undo()` / `redo()` handlers tolerate the synthetic shape (they should — just need `.apply()` / `.undo()` methods on the entry).

**Files touched:**
- `js/v2/engine/undo-stack.js` — push synthetic v1 entry on every apply
- `js/05-state.js` — verify undo handler tolerates the new entry shape

**Verification gate:**
- Place v2 plate → Ctrl+Z → plate gone. Ctrl+Y → plate back.
- Place v2 plate → place v1 UB → place v2 plate → Ctrl+Z × 3 → empty sheet (reverse chronological).
- Mixed sequence: v1 + v2 mutations interleaved → Ctrl+Z walks them in reverse order correctly.

**Effort:** 1.5 h.

---

### W10 — 3D rendering of view-local plates skipped (Q5)
**Fixes bug:** 11

**What:**
- `buildV2PlatesInScene` in `live-render.js` gates each element on `el.geometry.kind === 'plate'` (model-level only).
- View-local `region` plates are skipped — matches v1 plate2's 2D-only behaviour.
- Future model-level plates (a separate feature with `kind: 'plate'` geometry + frame) will render in 3D when that geometry kind ships.

**Files touched:**
- `js/v2/ui/live-render.js` — gate `buildV2PlatesInScene` on `geometry.kind === 'plate'`

**Verification gate:**
- Place v2 plate in 2D mode → switch to 3D mode → plate NOT in iso view (matches v1 plate2 behaviour).
- Existing 3D-mode objects (UB, SHS members) still render in 3D.

**Effort:** 0.5 h.

---

### W11 — PDF + DXF export pipelines
**Fixes:** Export deferred-to-Phase-13 issue

**What:**
- With W6's mirror entries in `entities2D`, v1's `44-pdf-export.js` vector path and `45-dxf-export.js` walk them as ordinary plate2 entries.
- If Phase 2 deleted the plate2 PDF/DXF emit branches (check git history — `git show <Phase 2 commit>:js/44-pdf-export.js`), restore them.
- For mirror entries, the PDF/DXF emit can use the same AS-correct draw branches as W3 (aspect-aware lineweight + hatch for sec).
- The canvas raster PDF path will pick up the v2 live-render output automatically (since the shim paints into the canvas before export captures it).

**Files touched:**
- `js/44-pdf-export.js` — verify/restore plate2 vector emit
- `js/45-dxf-export.js` — verify/restore plate2 DXF emit (with `_v2Mirror` handling — emit as POLYLINE on the PLATE layer with the right lineweight)

**Verification gate:**
- Place 3 v2 plates (mix of elev + sec) → Export PDF (vector) → plates appear at correct scale with correct lineweight + hatch on sec plates.
- Export PDF (raster) → same visual.
- Export DXF → open in a DXF viewer → plates are POLYLINEs on PLATE layer, lineweight encoded.

**Effort:** 2-3 h.

---

### W12 — Soak rehearsal + STP 6011 comparison
**Fixes:** Phase 1 exit criterion never tested

**What:**
- Build a baseplate detail using only v2 plates + v1 members (UB column + base plate + bolts).
- Compare side-by-side with the STP 6011 baseplate (page 85, detail 6011.2).
- Walk through every plate2-equivalent operation:
  1. Place 4 sec plates (cleats) and 1 elev plate (base) — verify drag-release + two-click + polygon.
  2. Select each → verify grips appear.
  3. Move via body drag → verify mirror sync.
  4. Rotate via rotation grip → verify polygon rotates + v2 element updates.
  5. Resize via vertex grip → verify polygon resizes + v2 element updates.
  6. Change thickness via Inspector → verify AS hatch density updates.
  7. Change aspect via Options bar chip → verify visual switches.
  8. Delete one plate → verify removal + Ctrl+Z restores it.
  9. Place ~5 more plates → save sheet → reload → verify round-trip preserves all geometry/aspect/thickness.
  10. Export PDF (vector + raster) → verify visual.
  11. Export DXF → verify drafter handoff.
  12. Switch to 3D mode → verify plates NOT in iso (W10).
  13. Verify auto-welds at plate-member contacts (W7).
- Test in browser preview via `.claude/launch.json "structdraw-root"` on port 8765.

**Files touched:** none — verification only.

**Verification gate:**
- Side-by-side screenshot of v2-plate baseplate vs STP 6011 baseplate matches at the AS 1100 quality bar.
- Zero console errors during the workflow.
- Round-trip save/reload preserves all plate geometry, aspects, thicknesses.
- PDF + DXF export visually correct.
- Dan reviews + signs off before W13.

**Effort:** 2 h.

---

### W13 — Documentation update (post-soak)
**Fixes:** F6 — workflow lesson; documentation drift

**What:**
- Update `CLAUDE.md` "Adding a new member, fastener, or hatch type" checklist:
  - Document the v1-behaviour-on-v2-storage strategy + mirror seam as the official pattern for v2 migrations.
  - Add note: "A v2 element type is not 'done' until every v1 layer (selection, snap, grip, edit, auto-weld, export) acts on it through the mirror or natively. No Phase advances until this is true."
- Update `PlannedBuilds/architecture-v2/09-build-plan.md`:
  - Mark Phase 1 + Phase 2 ✅ properly Complete (this fix completes them).
  - Add "Phase complete" gate definition to every Phase 3+ row: "Phase ships when (a) v2 implementation matches v1's behaviour through the mirror seam AND (b) Dan reports zero regressions after 1 week of daily-use soak."
  - Phase 3 (bolts) row reset to "⏳ Pending" — re-plan needed.
- Update `PlannedBuilds/architecture-v2/08-pilot-feature.md` §4:
  - Append the mirror seam pattern as part of the per-feature deliverables list.
  - Add: "If a v2 element type's mirror doesn't make v1's selection/snap/grip/auto-weld/export work on it, the phase is incomplete regardless of code merged."
- Update `PlannedBuilds/architecture-v2/07-migration-strategy.md`:
  - Document the mirror seam as the official strangler-fig transition mechanism.
  - Add a section explaining the layer-by-layer migration path: mirror first, then gradually replace v1 layers with v2-native equivalents.
- Update `CHANGELOG.md` with a single line summarising the fix.

**Files touched:**
- `CLAUDE.md`
- `PlannedBuilds/architecture-v2/09-build-plan.md`
- `PlannedBuilds/architecture-v2/08-pilot-feature.md`
- `PlannedBuilds/architecture-v2/07-migration-strategy.md`
- `CHANGELOG.md`

**Verification gate:**
- A fresh build chat opening `PlannedBuilds/architecture-v2/` understands the mirror seam from the docs alone, without needing to read the v1-bridge source.
- The Phase complete gate is explicit and unambiguous.

**Effort:** 1 h.

---

## 6. Execution order

Linear, single build chat (potentially across multiple sittings):

1. **Foundation:** W1 → W3 → W10 — fast visible wins, gives daily-use a working tool first.
2. **Placement quality:** W2 → W4 → W5 — snap, aspect picker, polygon UX.
3. **Central seam:** W6 — longest block; everything after depends on it. Test thoroughly before advancing.
4. **Behaviour reach:** W7 → W8 → W9 → W11 — auto-weld, inspector, undo, export.
5. **Verify + document:** W12 → (Dan reviews) → W13.

**Total effort:** 25-29 hours focused work. 3-4 evening sessions or one focused weekend.

| Block | Effort | Deps | Cumulative |
|---|---|---|---|
| W1 | 2 h | — | 2 h |
| W2 | 2 h | W1 | 4 h |
| W3 | 3 h | — | 7 h |
| W4 | 1.5 h | W3 | 8.5 h |
| W5 | 1.5 h | W1 | 10 h |
| W6 | 6-8 h | W1 | 16-18 h |
| W7 | 0.5 h | W6 | 16.5-18.5 h |
| W8 | 2 h | W6 | 18.5-20.5 h |
| W9 | 1.5 h | — | 20-22 h |
| W10 | 0.5 h | — | 20.5-22.5 h |
| W11 | 2-3 h | W6 | 22.5-25.5 h |
| W12 | 2 h | all | 24.5-27.5 h |
| W13 | 1 h | post-W12 review | 25.5-28.5 h |

---

## 7. Files touched (summary)

**New v2 files:** none. (W6's mirror logic extends existing `v1-bridge.js`.)

**Modified v2 files (7):**
- `js/v2/tools/place-plate-tool.js` (W1, W3)
- `js/v2/engine/active-tool.js` (W1)
- `js/v2/engine/event-dispatch.js` (W2)
- `js/v2/engine/v1-bridge.js` (W1, W6)
- `js/v2/engine/undo-stack.js` (W9)
- `js/v2/ui/live-render.js` (W3, W10)
- `js/v2/ui/palette-bb-rail.js` (W4 verify)

**Modified v1 files (11) — mostly restoring deleted plate2 READ paths from Phase 2:**
- `js/05-state.js` (W9 verify)
- `js/39-events.js` (W6 — restore snap probe + body-drag-snap)
- `js/41-tools.js` (W1 — lifecycle wrap)
- `js/44-pdf-export.js` (W11 — verify/restore plate2 vector emit)
- `js/45-dxf-export.js` (W11 — verify/restore plate2 DXF emit)
- `js/47-status-bar.js` (W5 — call v2 statusText)
- `js/59-inspector.js` (W8 — v2 plate panel branch)
- `js/68-v25-tools.js` (W6 — restore edge-collection)
- `js/69-v25-dispatch.js` (W6 — restore draw dispatch; W1 — lifecycle wrap)
- `js/71-v25-selection.js` (W6 — restore bounds + handles + grip-drag translation)
- `js/72-v25-options-bar.js` (W4, W5 — Aspect + Mode chips)
- `js/74-v26-bb-rail.js` (W1 — release v2 on non-plate tile clicks + active-state class)

**Tests (in `tests/v2/`):**
- Mirror round-trip: place v2 plate → grip-drag-move-rotate-resize → verify v2 model reflects mutations.
- Auto-weld fires on plate-member contact.
- Ctrl+Z reaches v2 plates from v1's stack interleaved with v1 ops.
- PDF + DXF emit v2 plates correctly.
- Lifecycle: Esc + tile switch releases v2 tool.

**Documentation (5) — W13:**
- `CLAUDE.md`
- `PlannedBuilds/architecture-v2/07-migration-strategy.md`
- `PlannedBuilds/architecture-v2/08-pilot-feature.md`
- `PlannedBuilds/architecture-v2/09-build-plan.md`
- `CHANGELOG.md`

---

## 8. Out of scope (do not do)

- ❌ Building a v2-native selection layer (W6 mirror uses v1's).
- ❌ Replacing the live-render shim with a full `Canvas2DRenderer` wiring.
- ❌ Promoting `region` geometry to model-level `plate`.
- ❌ Unifying v1+v2 undo stacks (W9 uses synthetic v1-stack entries).
- ❌ ESM, TypeScript, bundler.
- ❌ Phase 3 (bolts) — stays stashed.
- ❌ Restoring the v1 plate2 placement tool.
- ❌ Touching `archive/snapshots/` (CLAUDE.md rule 10).
- ❌ Touching `archive/completed-plans/`.

---

## 9. Verification before commit

After W12 (soak rehearsal) Dan reviews. Before W13 + commit:

- Every bug in §1's table is verifiably fixed.
- The STP 6011 baseplate side-by-side matches at AS quality bar.
- Zero console errors during the W12 workflow.
- All v2 tests pass (`npm test`).
- A new `tests/fixtures/v1/` fixture with v2 plates is recorded for regression coverage.
- `git diff --stat` matches the §7 Files touched list (no surprises).

Dan handles commit + push himself per CLAUDE.md rule 2.

---

## 10. Workflow updates for future migrations

Lessons from the Phase 1+2 misstep, codified in W13's doc updates:

**The Phase complete gate.** A Phase ships only when:

1. **v2 implementation matches v1 behaviour** for the migrated element type through the mirror seam (or v2-native, where appropriate).
2. **Dan reports zero regressions** after one week of daily-use soak.
3. Both conditions explicit in the Phase tracker row, not implicit in the brief.

**No Phase N+1 starts until Phase N's soak completes.** Phase 2 (retirement) of any future migration cannot begin until Phase N (build) has actually soaked. The "Built — soak pending" tracker status blocks the next phase's start date, not just its retirement.

**Mirror seam is the default for every migration.** Every Phase 3+ migration uses the W6 mirror pattern unless explicitly justified otherwise. The mirror lets v1's working interactive layers act on v2 elements during the transition — preserves daily-use, gives the team time to migrate v1 layers one at a time in later phases.

**Shim deferrals must be explicit.** Any "the proper rendering / selection / snap layer lands in Phase N" deferral must be called out in the brief AND have an explicit replacement gate. Phase 1's live-render.js shim "Phase 5+ work" comment was buried in a file header and never tracked — that's why it stayed broken in daily use. Future deferrals are tracked rows in the progress table, not file comments.

---

*End of plan. Hand off to a fresh /goal build chat with the prompt in this file's chat-history sibling. After W12, Dan reviews; after Dan's sign-off, the build chat ships W13 docs + Dan commits.*
