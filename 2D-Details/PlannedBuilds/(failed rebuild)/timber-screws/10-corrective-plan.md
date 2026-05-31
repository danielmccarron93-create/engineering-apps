# 10 — Corrective Plan (Phase 5 reset)

> Diagnosis and re-plan after Dan's 2026-05-18 feedback.
> Read after `README.md` and `01-domain-knowledge.md`; supersedes anything in `05-architecture.md` and `06-ux.md` that contradicts the locked architectural decisions in §"Locked architectural decisions" below.

---

## Locked architectural decisions (Dan-approved 2026-05-18)

These are the architectural calls that drive every code change in Phase 5+. Do not revisit in the build chat without explicit Dan-approval — they are the answer to the misstep in Phase 4-visibility.

1. **TIMBER is a variant of V25 `mem2`** with `memberType: 'timber'`. NOT a standalone entity type. The existing V25 placement / drag / resize / mitre / save-load / options-bar tooling carries it. The timber-specific bits (grain hatch, size label) are a sub-renderer inside `drawMem2D` that fires when `memberType === 'timber'`. Grain direction is derived from `mem2.rot` (always along the long axis of a glulam member — true by definition for sawn/glulam).
2. **STEEL PLATE is the existing V25 `plate2`.** No parallel `SteelPlate` entity. The connection's front-member ref points to a `plate2` ID. The rule engine reads plate thickness from `plate2.thk` (the existing V25 field), not from any new field.
3. **HBS SCREW is its own entity type** (`'screw'`). Justified because it's a fastener with single-click placement and a fastener catalogue (`HBS_PLATE_SCREWS`) rather than a section catalogue. Parallels the existing `anchor` type (Trubolt / Chemset / Coach / Tek / Through). The screw tile activates a new `v25-screw` tool path.
4. **CONNECTION is its own entity type** (`'connection'`) — already built in Phase 3. Front/rear refs are `{ id, kind }` where `kind ∈ { 'plate2', 'mem2' }`.
5. **TIMBER and HBS SCREW tiles live in the V26 BB-rail Members section** (`74-v26-bb-rail.js` `getDrawTabDef()`, around line 220) — sitting alongside UB / PFC / SHS / RHS / UC / WB / BOLT / BOLT GRP / PLATE. Also added to the 3D-mode Model palette (`60-tile-palette.js` `getPaletteDef().model`) per the two-mode requirement in `CLAUDE.md`. NOT floating buttons, NOT autoloaders, NOT side panels.
6. **Connection creation is a "Start Connection" tile** in a new "Timber Connections" section of `getDrawTabDef()` (mirroring the existing Cap Plate / Baseplate / WSP / Splice tiles in the 3D-mode palette). Click sequence: select tile → click rear member → click front entity → connection created and made the active connection (`tmbrCurrentConnectionId`). Newly-placed screws then auto-bind.
7. **Engineering layer from Phases 1, 3, 4 is preserved unchanged** — catalogues, `Connection` model, rule engine all stay. Only the entity-shape adapters in `_resolveContext` of `79-checks-timber.js` change (read plate thickness from `plate2.thk`, derive grain direction from `mem2.rot`, compute AABB from `mem2` geometry + section width).
8. **Phase 4 verification still applies** — Test 1 (Dan's worked example) must still reproduce η ≈ 0.801 PASS after the engine is re-wired to read from V25 entity shapes. The 74-assertion suite in `tmbr-phase4-verify.js` is the regression net; rebuild the fixture using V25 factories (`v25Add('mem2', {memberType: 'timber', ...})`, `v25Add('plate2', ...)`, `v25Add('screw', ...)`) and re-run.

---

## The diagnosis

Phases 1–4 built the right **engineering layer** — catalogue, entity model, rule engine, all reproducing Dan's worked example. But Phase 4's "make it visible" step missed the actual user-visible surface.

The app already has a polished palette UI for placing structural members: the **V26 BB-rail Draw tab** in `74-v26-bb-rail.js`, function `getDrawTabDef()`, "Members" section (around line 186). UB / PFC / SHS / RHS / UC / WB / BOLT / BOLT GRP / PLATE tiles all live there, all clickable, all run through `v25PickAndSetMember(type)` → `v25SetMember(type, section, aspect)` → `v25SetTool('v25-mem')`, all use the V25 `mem2` paper-space entity (plus `plate2` for plates), all expose Section / Aspect / Thk in the top options bar (`72-v25-options-bar.js`).

Dan's expectation — and the right design — is that **TIMBER** and **HBS SCREW** should be additional tiles in that same Members section, behaving exactly like UB / PFC / BOLT do. He draws a timber column with the new TIMBER tile, drops a plate on it with the existing PLATE tile, places HBS plate screws with the new SCREW tile. Same muscle memory, same options bar, same selection / drag / resize. The Connection entity and rule engine I already built then bind those V25 entities into a checkable group.

What I built instead in Phase 4-visibility:
- A **separate `SteelPlate` entity type** parallel to the V25 `plate2` (wrong — should reuse `plate2`).
- A **floating button + autoloader** that drops a pre-baked example onto the canvas (wrong — Dan wants tiles, not a demo loader).
- A **`TimberMember` entity type** rendered directly through `34-draw-2d.js` dispatch (wrong — should be a `mem2` variant so it inherits all the V25 tooling for free).

The engineering layer is fine. The **UI hook layer is wrong** and needs to be replaced.

---

## Architecture call: integrate via V25 `mem2` and `plate2`, not parallel types

Three integration choices considered:

**Option A — Add `memberType: 'timber'` as a variant of V25 `mem2`.** Timber columns become `mem2` entities with `memberType: 'timber'` and `section: 'GL 600×600'`. The grain direction is derived from `mem2.rot` (always along the long axis of the member — true by definition for sawn/glulam). All V25 tooling — placement, drag, resize, mitre join with adjacent members, options-bar Section/Aspect — works without modification. Drawing dispatches inside `drawMem2D` (or wherever `mem2` renders) with a timber-specific sub-renderer that does outline + grain hatch (reuses my existing `drawTimberGrainHatch` helper).

**Option B — Keep `timber-member` as its own entity type, but route the V25 tile through a custom tool that creates `timber-member` entities.** More glue, fewer V25 features for free, harder to maintain parity with the steel members.

**Option C — Same as Option A but also as a parallel type.** Worst of both.

→ **Option A.** Timber is a `mem2` variant. Delete `timber-member` as a top-level entity type; keep the timber-specific drawing helper (it gets called from `drawMem2D` when `mem2.memberType === 'timber'`).

For the steel plate: **always use the existing V25 `plate2` entity** (`76-v25-plate.js`). It already supports `aspect: 'elev' | 'sec'`, has a `thk` field, has the options-bar integration. Delete my `SteelPlate`.

For the screw: **keep as its own entity type** (`'screw'`). A screw isn't a "member" structurally — it's a fastener and a connection element. It does single-click placement, not drag, and has a fastener catalogue (`HBS_PLATE_SCREWS`) rather than a section catalogue. Same model as the existing `v25-anchor` tool (Trubolt / Chemset / etc.). Connection binding (Phase 3 `tmbrBindScrew`) stays as-is.

For the Connection: **front/rear refs now point to `mem2` or `plate2` entity IDs**, not my parallel `timber-member` / `steel-plate` types. The rule engine reads geometry from the V25 entity (rear AABB derived from `mem2.u/v/length/rot` + section dimensions from `TIMBER_SECTIONS`, plate thickness from `plate2.thk`, grain direction from `mem2.rot`).

---

## Rollback — what to delete

| File | Action | Reason |
|---|---|---|
| `dev/js/99-tmbr-autoload.js` | **DELETE entire file** | Floating button + autoloader was the wrong UI hook |
| `dev/index.html` | Remove `<script src="js/99-tmbr-autoload.js">` line | Companion to above |
| `dev/js/75-timber-conn-entities.js` | Remove `mkSteelPlate`, `drawSteelPlate`, `steelPlateBounds` (keep the timber-member helpers as reusable building blocks for the `mem2`-timber sub-renderer); also remove `mkTimberMember` + `drawTimberMember` (refactor into a sub-renderer that operates on a `mem2` instead) | Use V25 `plate2` and `mem2`-timber variant instead |
| `dev/js/34-draw-2d.js` | Remove the `'timber-member'` and `'steel-plate'` dispatch cases. Keep the `'screw'` and `'connection'` cases. | Timber routes through `mem2` (V25 dispatcher), plate routes through `plate2` (V25 dispatcher) |
| `PlannedBuilds/timber-screws/verification/phase2-fixture.svg`, `phase3-fixture.svg` | Keep — they're historical verification artefacts | No reason to delete |

After rollback the feature still has the catalogue, the Connection model, the rule engine, and the screw entity. It just no longer has the misguided UI hook.

---

## What to add

### 1. TIMBER tile in `getDrawTabDef()` Members section

In `dev/js/74-v26-bb-rail.js` around line 220 (between UC and WB, or alongside them), add:

```
{ id: 'v25-tmbr-2d', kind: 'member', label: 'Timber',
  sub: 'GLT', icon: 'icon-rect',   // pick an icon or add a timber-specific one
  onClick: () => v25PickAndSetMember('timber'),
  picker: { kind: 'timber' } },
```

### 2. HBS SCREW tile, also in Members

After PLATE (around line 236) or between BOLT GRP and PLATE:

```
{ id: 'v25-hbs-2d', kind: 'tool', label: 'HBS Screw',
  sub: 'HBS', icon: 'icon-bolt',
  onClick: () => tmbrSetScrewTool(),
  picker: { kind: 'hbs' } },
```

### 3. `v25PickAndSetMember('timber')` → routes to `v25SetMember('timber', section, aspect)`

In `dev/js/69-v25-dispatch.js`:

- Extend `V25_MEM_DEFAULTS` with `timber: 'GL 600×600'` (from `TIMBER_SECTIONS` catalogue).
- The existing `v25PickAndSetMember(type)` already handles arbitrary types via the defaults table — no code path change needed beyond adding the default.

### 4. `mem2` placement understands `memberType: 'timber'`

The `v25-mem` click handler in `v25TryHandleClick` (lines 419–500 of `69-v25-dispatch.js`) calls `v25Add('mem2', { memberType, section, u, v, length, rot, aspect, ... })`. Already type-agnostic — when `memberType === 'timber'`, the same code creates the entity. The only change needed is downstream:

- **Drawing**: `drawMem2D` (in `68-v25-tools.js` or wherever it lives) must dispatch to a timber-specific renderer for `memberType === 'timber'`. New helper `_drawMem2Timber(blk, ent, cs)` that:
  - Resolves `TIMBER_SECTIONS[ent.section]` to get width `b` and depth `d`.
  - Computes the AABB rectangle in view-local coords from `ent.u, v, length, rot` + section `b`.
  - Strokes the outline (heavier than steel — visible-heavy lineweight per AS 1100).
  - Calls the existing `drawTimberGrainHatch()` helper (will be lifted out of `75-timber-conn-entities.js` into the same place where `drawMem2D` lives).
  - Stamps the size/class tag.
- **Section catalogue lookups**: the existing pickers go through `UB_DB`, `PFC_DB`, etc. We need a sibling lookup for `TIMBER_SECTIONS`. Either extend the picker logic to dispatch by type, or expose a `getTimberSection(id)` lookup (already exists in `02e-catalogue-lookups.js`).
- **Cross-section aspect**: V25 members support `aspect: 'sec'` (cross-section view). For a timber column drawn `aspect: 'sec'` it's a `b × d` rectangle with grain perpendicular to the page (no grain hatch visible — just the rectangle with a small "+" or a section symbol). Defer to v1.x.

### 5. Size-picker handles `picker.kind = 'timber'`

In `dev/js/58-size-picker.js`, add a branch that populates the picker dropdown from `TIMBER_SECTIONS` (instead of `UB_DB`, etc.). Reuse the existing dropdown chrome — only the data source changes.

### 6. Screw tile activates `v25-screw` tool

New function `tmbrSetScrewTool(spec)` in `dev/js/77-screw-entity.js` that mirrors `v25SetMaterial` / `v25SetAnchor`:

```
function tmbrSetScrewTool(screwSpec) {
  v25Last.screwSpec = screwSpec || v25Last.screwSpec || DEFAULT_SCREW_SPEC;
  v25SetTool('v25-screw');
}
```

### 7. `v25TryHandleClick` handles `tool === 'v25-screw'`

In `dev/js/69-v25-dispatch.js`, add a branch — single-click placement:

```
if (tool === 'v25-screw') {
  const spec = v25Last.screwSpec || DEFAULT_SCREW_SPEC;
  const ent = v25Add('screw', { u: cu, v: cv, screwSpec: spec });
  // If a Connection is active, bind the screw to it automatically.
  if (tmbrCurrentConnectionId) {
    const conn = tmbrGetConnection('elevation', tmbrCurrentConnectionId);
    if (conn) tmbrBindScrew(conn, ent);
  }
  v25Selected = [ent.id];
  return true;
}
```

The existing `drawScrewEnt` in `77-screw-entity.js` already renders the screw correctly — it just needs the click route to call it.

### 8. Screw size picker

Either reuse the bolt picker (which uses `BOLT_LENGTHS` + `BOLT_DB`) or add a dedicated HBS picker that reads from `HBS_PLATE_SCREWS` grouped by diameter (8 / 10 / 12). Probably a new picker since HBS sizes are paired d × L, not just one dimension.

### 9. Options bar adds Screw spec when `v25-screw` tool is active

In `dev/js/72-v25-options-bar.js`, add a `v25-screw` branch that renders a "Spec | HBSPL12200 | Pick…" dropdown (mirroring the existing Section dropdown for `v25-mem`). Selecting an entry calls `tmbrSetScrewTool(newSpec)`.

### 10. Connection front/rear ref V25 entities

In `dev/js/78-connection.js`, update `inferConnectionType(frontEnt, rearEnt)` and the schema docs:

```
inferConnectionType — new mapping
  plate2 (with material steel) + mem2 (memberType: 'timber') → 'steel-to-timber'
  mem2 (timber)              + mem2 (timber)              → 'timber-to-timber'  (v1.1)
  plate2                     + mem2 (memberType: 'mass-timber-clt')  → 'steel-to-clt'  (v1.2)
```

The `front` and `rear` refs (`{ id, kind }`) need updating: `kind` becomes `'plate2'` or `'mem2'` rather than `'steel-plate'` or `'timber-member'`.

### 11. Rule engine reads from V25 entity shapes

In `dev/js/79-checks-timber.js`, function `_resolveContext`:

- **Plate thickness**: change `ctx.plateThickness = ctx.front.thickness` → `ctx.plateThickness = ctx.front.thk` (the `plate2` field name). Default to `V25_PLATE_DEFAULT_THK` (10) if absent.
- **Rear AABB**: timber `mem2` doesn't store `u, v, w, h` directly. Compute the AABB from `mem2.u, v, length, rot` plus `TIMBER_SECTIONS[mem2.section]`'s `b` (width). Helper `tmbrMem2TimberAABB(ent)` → `{ uMin, uMax, vMin, vMax, grainDir }`.
- **Grain direction**: derived from `mem2.rot`. For rot=0° → grain is +u (horizontal beam); rot=90° → grain is +v (vertical column).
- **Timber class**: pull from `mem2.timberClass` if set, else fall back to `TIMBER_SECTIONS[mem2.section].default_class`.

### 12. "Start Connection" UX

The Connection entity needs a way to be created from selected entities. Three options to discuss with Dan (open question):

**A. Auto-detect on screw placement.** When the user places a screw and a plate-over-timber combination exists at that location, infer the Connection automatically. Pros: zero clicks. Cons: ambiguous when there are multiple plates / timbers on the sheet.

**B. Inspector action button.** Select a plate + a timber (multi-select), an inspector button appears: "Create connection". Pros: explicit, no ambiguity. Cons: needs multi-select wiring.

**C. Dedicated Connection tile in the Members section.** A "CONN" tile that, when clicked, prompts "Click rear member" → "Click front entity". Pros: discoverable. Cons: extra clicks.

→ **Recommend C for v1** (most discoverable, mirrors the existing "Cap Plate / Baseplate / WSP / Splice" Connection tiles in `60-tile-palette.js`). Auto-detect (A) as a follow-on enhancement.

### 13. Inspector breakdown for Connection (Phase 6, still to come)

When a Connection is selected, the right-side Inspector panel (in `59-inspector.js`) shows the full check breakdown — overall status, η, multiplier chain, per-screw edge distances, pair table, n_ef rows. The engine already produces the data; this is just UI work. Same Phase 6 deliverable as before, just rebased on the new tile-driven workflow.

---

## File-by-file change ledger

| File | Action | Effort |
|---|---|---|
| `dev/js/99-tmbr-autoload.js` | DELETE | 1 min |
| `dev/index.html` | Remove autoload script tag | 1 min |
| `dev/js/75-timber-conn-entities.js` | Remove `mkSteelPlate`/`drawSteelPlate`; remove `mkTimberMember`/`drawTimberMember`; **keep** `drawTimberGrainHatch`, `timberMemberEdges`, `timberMemberBounds` as exported helpers (the `mem2`-timber sub-renderer + the rule engine still use them); rename file to `75-timber-conn-helpers.js` | 30 min |
| `dev/js/34-draw-2d.js` | Remove `'timber-member'` and `'steel-plate'` dispatch cases | 5 min |
| `dev/js/74-v26-bb-rail.js` | Add TIMBER and HBS SCREW tiles in Members section | 15 min |
| `dev/js/69-v25-dispatch.js` | Add `'timber'` to `V25_MEM_DEFAULTS`; add `v25-screw` branch in `v25TryHandleClick` | 30 min |
| `dev/js/68-v25-tools.js` | Extend `drawMem2D` to dispatch timber to a sub-renderer; add `_drawMem2Timber` helper (uses lifted `drawTimberGrainHatch` from 75) | 1–2 h (needs careful read of existing `drawMem2D`) |
| `dev/js/58-size-picker.js` | Add `kind === 'timber'` branch (populate from `TIMBER_SECTIONS`); add `kind === 'hbs'` branch (populate from `HBS_PLATE_SCREWS`) | 30 min |
| `dev/js/77-screw-entity.js` | Add `tmbrSetScrewTool(spec)` entry point; keep the existing `mkScrewEnt`/`drawScrewEnt` as-is (used directly by `v25Add`) | 15 min |
| `dev/js/72-v25-options-bar.js` | Add `v25-screw` tool branch — Spec dropdown | 30 min |
| `dev/js/78-connection.js` | Update `inferConnectionType` to detect `plate2` + `mem2(timber)`; update schema doc comments; add Connection tile-creation flow in tile-palette / BB-rail | 30 min |
| `dev/js/79-checks-timber.js` | Update `_resolveContext` to read plate thickness from `plate2.thk`, AABB and grain direction from `mem2(timber)` geometry, timber class via section default | 1 h |
| `dev/js/74-v26-bb-rail.js` (Connections section, if we add it) | Add CONN tile that runs the click-rear → click-front flow | 1 h |
| `dev/js/59-inspector.js` | Phase 6 — full Connection inspector panel | 2–3 h |

**Total**: roughly 8–10 hours of focused work. Two sessions.

---

## Implementation order (new Phase 5+)

1. **Rollback** — delete `99-tmbr-autoload.js`, remove its script tag, remove dispatch cases for the abandoned types, lift helpers out of `75-timber-conn-entities.js`. Test the app still loads cleanly (no broken references) with no timber-screw UI visible. ✅ when DevTools console is clean on `dev/index.html` load.
2. **TIMBER tile only** — add the TIMBER tile, the `v25PickAndSetMember('timber')` route, the timber section picker, and the `_drawMem2Timber` sub-renderer. Test that clicking TIMBER → picking GL 600×600 → drag-drawing on canvas produces a timber column with grain hatch.
3. **HBS SCREW tile only** — add the SCREW tile, the `tmbrSetScrewTool`, the `v25-screw` click branch, the screw picker, the options-bar branch. Test that clicking SCREW → picking HBSPL12200 → clicking on the canvas drops the screw head.
4. **Connection creation** — add the CONN tile in a new "Timber Connections" section of `getDrawTabDef()`. Test the click-rear → click-front flow creates a Connection that visibly highlights both members + draws the load arrow at the rear centroid.
5. **Engine integration** — adapt `78-connection.js` and `79-checks-timber.js` to read from `mem2(timber)` and `plate2`. Run Phase 4's test fixtures against the new entity shapes (rebuilt) and confirm η ≈ 0.801 PASS.
6. **Inspector breakdown** (the original Phase 6) — render the full check result in the Inspector panel.

---

## Open questions for Dan before the next code session

1. **Timber as `mem2` variant — confirmed?** This is the central architectural decision. If yes, the existing V25 member tooling carries timber for free. If no, we need a parallel `timber-member` entity with its own placement / drag / selection wiring.

2. **Connection creation UX** (§12 above): A (auto-detect), B (inspector multi-select), or C (CONN tile with rear→front clicks)? Recommend C for v1.

3. **Screw cluster placement**: single-click each, or also a "grid" mode where two clicks define a rectangle and the tool drops an N × M screw grid at minimum legal spacing? Recommend single-click for v1, grid mode for v1.1.

4. **Plate-side checks (AS 4100 / EN 1993‑1‑8)**: the Rothoblaas tables don't check the plate side (bolt/screw edge distances on the steel). v1 surface the warning "Plate‑side edge distances not checked"; v1.2 add the AS 4100 check. Confirm OK to defer.

5. **The autoloader was the wrong thing — confirm to delete entirely, or keep behind a `?autoload=demo` URL parameter** for future demo purposes? Recommend delete; the future "load a saved detail" feature will replace it cleanly.

---

## What's preserved from Phases 1–4

| Phase | What | Status |
|---|---|---|
| 1 | Catalogues (`02b/02c/02d/02e`) | ✅ unchanged — the data layer is correct |
| 2 | Entity types | 🔶 `timber-member` and `steel-plate` deleted (use V25 `mem2` / `plate2`); `screw` kept |
| 3 | Connection entity + binding API | ✅ kept; only `front`/`rear` `kind` values change |
| 4 | Rule engine | 🔶 kept; `_resolveContext` reads from V25 entity shapes instead of my parallel types |

The engineering is intact. The UI hook is what's being redone.
