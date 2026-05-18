# 07 — Build Plan

> Phased implementation plan. Each phase has concrete files, definition-of-done, and verification step. Designed to be picked up in any order at any phase by a fresh Claude Code session.

**Total v1 effort estimate**: 6–10 working sessions at engineer-day pace (~3–4 weeks evenings). v1.1 adds 2 more, v1.2 adds 3 more. These are rough — Dan will refine after Phase 0.

**Working principle from project root `CLAUDE.md`**: bug fixes don't bundle with refactors. Each phase is one feature PR. Test in `dev/` in a browser. Update `CHANGELOG.md`. Dan reviews and mirrors `dev/` → root.

---

## Phase 0 — Resolve open questions (no code)

**Goal**: get Dan's input on the items in `08-open-questions.md` so the data model and rule engine are unambiguous.

**Steps**:
1. Re-read `08-open-questions.md`. Identify which questions block Phase 1 (most do).
2. Walk through each blocking question with Dan. Capture answers in `08-open-questions.md`.
3. Update `01-domain-knowledge.md` with any new findings.
4. Mark Phase 0 complete in this file when all blocking Qs are resolved.

**DoD**: every Q1–Q8 in `08-open-questions.md` has an "Answer" recorded.

**No files created.** Just conversation.

---

## Phase 1 — Data layer

**Goal**: catalogue files in place. No drawing yet. No engine yet. Just the data is loadable.

**Files created**:
- `dev/js/02b-data-timber.js` — TimberClass entries, TimberSection presets, k_mod matrix
- `dev/js/02c-data-screws.js` — Rothoblaas HBS Plate ScrewSpec entries (18 entries)
- `dev/js/02d-data-rothoblaas-rules.js` — RuleSet entries (6 — steel/timber × predrilled/not × α=0/90), NefTable, CapacityTables (p. 216 minimum; p. 217 optional)
- `dev/js/02e-catalogue-lookups.js` (or fold into 02d) — helpers: `getScrewSpec`, `getRuleSet`, `lerpNef`, `interpRuleAtAlpha`

**Files edited**:
- `dev/index.html` — add the new `<script>` tags in numerical order

**Verification**:
- Open dev in browser. DevTools console: type `HBS_PLATE_SCREWS['HBSPL12200']` — should return the full ScrewSpec.
- Type `lerpNef(3, 5)` — should return 1.86.
- Type `interpRuleAtAlpha(getRuleSet('steel-to-timber', 'glulam', true), 'a3t', 12, 0)` — should return 144 (= 12·d).
- Type `interpRuleAtAlpha(... , 'a3t', 12, 90)` — should return 84 (= 7·d).
- Type `interpRuleAtAlpha(... , 'a3t', 12, 45)` — should return 114 (linear interp).

**DoD**: every catalogue value from `04-catalogues.md` is queryable from the browser console with correct return.

---

## Phase 2 — Entity types (no engine, no checks)

**Goal**: the user can draw a timber member, place a steel plate over it, drop HBS screws on the plate, and see them on canvas. No structural checks yet — just geometry.

**Files created**:
- `dev/js/75-timber-member.js` — TimberMember entity, `drawTimberMember(ent, ctx, view)`, grain-direction hatch, default outline from rectangle
- `dev/js/76-screw-entity.js` — Screw entity, `drawScrew(ent, ctx, view)`, head and shank views, screw-to-grain detection

**Files edited**:
- `dev/js/05-state.js` — add `FEATURE_TIMBER_SCREWS` flag
- `dev/js/07-globals.js` — add `tmbrCurrentConnectionId` (null when no connection active)
- `dev/js/26-as1100-hatch.js` — extend with `drawTimberGrainHatch(outline, grainDir, ctx)`
- `dev/js/28-draw-block.js` — dispatch new types
- `dev/js/41-tools.js` — register `tool-timber-member`, `tool-screw`, `tool-steel-plate-flag` (or wire to existing plate with material flag)
- `dev/js/42-keyboard.js` — bind T, P, H chords
- `dev/js/62-toolbar.js` — wire tools
- `dev/js/60-tile-palette.js` — add tile mode for timber connections
- `dev/js/58-size-picker.js` — show screw sizes when screw tool active
- `dev/js/53-layers-panel.js` — add `timber`, `steel`, `screws` layers (no `connections-meta` yet)

**Verification (manual)**:
- Pick timber member tool. Click twice to place a 600×340 rectangle. See timber hatch along long axis.
- Edit grainDir in inspector (placeholder UI is fine). Hatch rotates.
- Pick steel plate tool. Click twice. Plate appears with steel hatch.
- Pick HBS screw tool. Click 6 times. Screws appear as heads (circles with X cross) where clicked.
- Save and reload — all entities persist.

**DoD**: Dan can draw the geometry of his canonical example by clicking on canvas, save it, reload it.

**Notes / pitfalls**:
- The screw head primitive can mirror the existing `33-draw-bolt.js` head — same visual style.
- The grain hatch line spacing should be `view-scale-aware` — finer lines when zoomed in.
- The steel plate hatching should be the existing AS 1100 steel hatch from `26-as1100-hatch.js`.

---

## Phase 3 — Connection entity (still no checks)

**Goal**: the user can group a plate, a timber member, and screws into a Connection. The load vector exists on the Connection (but doesn't yet drive checks).

**Files created**:
- `dev/js/77-connection.js` — Connection entity, `drawConnectionOverlay(ent, ctx)` (renders the load arrow + an outline highlight of the bound members), connection-creation flow (the click-rear → click-front prompts)

**Files edited**:
- `dev/js/28-draw-block.js` — dispatch `'connection'`
- `dev/js/41-tools.js` — register `tool-load-arrow`, `action-start-connection`
- `dev/js/52-cmd-palette.js` — add "Start connection", "Set load"
- `dev/js/42-keyboard.js` — Ctrl+L, Shift+C chords
- `dev/js/53-layers-panel.js` — add `connections-meta` layer
- `dev/js/59-inspector.js` — add a basic Connection inspector panel (just shows members + load fields, no checks yet)
- `dev/js/46-save-load.js` — bump `schemaVersion: 2`; persist connection refs (screw → connectionId)

**Verification**:
- After Phase 2 entities exist, invoke "Start connection". Click column → click plate → connection created.
- Pick "Set load" → click twice → load arrow appears on canvas.
- Inspector shows the connection, its members, the load vector.
- Save and reload — connection persists.

**DoD**: a Connection exists in the model and round‑trips through save/load.

---

## Phase 4 — Rule engine (no rendering yet)

**Goal**: the engine in `78-checks-timber.js` runs and produces a correct `ConnectionCheckResult` for Dan's worked example.

**Files created**:
- `dev/js/78-checks-timber.js` — the `checkConnection(c, model)` function per `03-rule-engine.md`

**Files edited**: none.

**Verification**:
- In browser console: build a fixture Connection matching Dan's worked example (12mm HBS, 6 screws 3×2 at 60×100, vertical load, predrilled, GL28h column).
- Call `checkConnection(c, model)`.
- Expected output (per `09-test-cases.md` Test 1):
  - α = 0°
  - All 24 edge checks pass
  - All 15 pair checks pass
  - 2 rows detected, each n=3, a₁=60mm=5d, n_ef=1.86
  - Capacity total: ~31 kN (TBD against MyProject)
  - η ≈ 0.80 if F_d = 25 kN
  - overall = 'PASS'

**DoD**: Test 1 from `09-test-cases.md` passes (all numbers within tolerance).

**Notes**:
- Engine is a pure function; test in isolation before wiring to UI.
- Add 2–3 unit tests in `dev/test/test-rules.html` covering Tests 1, 2, 3 from `09-test-cases.md`.

---

## Phase 5 — Check rendering on canvas

**Goal**: the engine's output is visible on canvas as red leaders / green dimensions / status badges. Inspector still primitive.

**Files created**:
- `dev/js/79-checks-render.js` — render fns: `renderEdgeChecks`, `renderPairChecks`, `renderConnectionBadge`, `renderExclusionZone`

**Files edited**:
- `dev/js/22-render-core.js` — call `renderChecksForConnection(c, ctx, view)` after entities are drawn
- `dev/js/77-connection.js` — wire `connection.checks` to be recomputed on relevant events

**Verification**:
- Load Dan's fixture. See all 6 screws with edge distances dimensioned (governing-only by default, all if `show_all` flag on).
- Drag a screw close to the bottom edge → a₃,t turns red, dimension thickens, status badge flips to FAIL.
- Drag back to a passing position → returns to green.

**DoD**: live red/green feedback works during drag of any screw.

---

## Phase 6 — Inspector (full check breakdown)

**Goal**: the inspector shows the full per-screw table, the pair table, the n_ef detection, and the capacity multiplier trace as in `06-ux.md` §9.

**Files created**: none.

**Files edited**:
- `dev/js/59-inspector.js` — flesh out the Connection panel with the full breakdown UI

**Verification**:
- Select the Connection. See the panel with all sections.
- Expand "Spacing & edge distance checks" — all 24 rows visible.
- Expand "Capacity" — sees the multiplier chain (R_V,k → k_dens → k_mod → γM → R_V,d).
- Toggle pre-drilled off — values change to non-predrilled rules; some checks now fail.
- Toggle service class to SC3 — k_mod drops, capacity drops, η rises.

**DoD**: every number from `03-rule-engine.md` §2 output schema is visible somewhere in the inspector.

---

## Phase 7 — Export and polish

**Goal**: the detail exports cleanly to PDF / DXF without the live-check overlay; screw schedule generates.

**Files created**:
- (potentially) `dev/js/77-connection.js` — add `generateScrewSchedule(connection)` returning a text block to include in the detail

**Files edited**:
- `dev/js/44-pdf-export.js` — verify `connections-meta` layer is excluded by default
- `dev/js/45-dxf-export.js` — same
- `dev/js/47-status-bar.js` — show "✓ PASS η=0.80" when a Connection is selected

**Verification**:
- Export Dan's example to PDF. Inspect output: timber + plate + screws + grain hatch + minimum dimensions + screw schedule visible; no red leaders, no check badges.
- Detail looks at least as clean as STP 6011 (per project root `CLAUDE.md` quality bar).

**DoD**: the PDF output is ready to put on an A1 detail sheet.

---

## Phase 8 — Test coverage

**Goal**: every test case in `09-test-cases.md` runs and passes.

**Files created**:
- `dev/test/test-rules.html` — browser-based test harness loading the catalogue and engine, running each fixture, printing PASS/FAIL with details

**Files edited**:
- `dev/CHANGELOG.md` — one-line entry: "Add Rothoblaas HBS Plate timber-screw connection designer (v1)"

**Verification**:
- Open `dev/test/test-rules.html` in browser. All test cases pass.

**DoD**: green run of test harness. Hand off to Dan for review and mirror to root.

---

## Phase 9 — v1.1 (timber-to-timber)

Add timber-to-timber rule set (1.5× modifier on a₁, a₂). New CapacityTable entries from p. 218. Update UI to support a TimberMember as the front member instead of a SteelPlate.

**Effort**: 1–2 sessions.

---

## Phase 10 — v1.2 (CLT)

Add CLT rule set (p. 219). New entity flag: `clt-lateral` vs `clt-narrow`. Distinct hatching for CLT. Capacity table from p. 219.

**Effort**: 2–3 sessions.

---

## Phase 11 — v1.x (deferred features)

In priority order (TBD with Dan):
- Auto‑place mode (solver for tightest passing grid)
- Plan view of the same connection
- Sandwich plate as structural input
- Multi-screw drag select / chord groups
- Per-load-case combinations
- Combined shear + tension check (axial)
- ε ≠ 90° (inclined screws, end-grain insertion)
- Australian timber class mapping
- AS 1720.1 alternative rule path (parallel to ETA)
- Plate-side edge distance check (AS 4100 / EN 1993‑1‑8)

---

## Progress tracking

Update this section at the end of each session. Use ✅ done, ⏳ in progress, ⬜ not started.

| Phase | Status | Session | Notes |
|---|---|---|---|
| 0 — Resolve open questions | 🔶 | 2026-05-18 | Q2 (AU class scope) and Q5 (default screw) answered; Q1/Q8 (ε vs α in capacity tables) parked — engine uses p. 216 R_V,90,k for all α as a conservative placeholder. Q3/Q4/Q6/Q9/Q10 etc. still pending but non-blocking for Phases 1–3. |
| 1 — Data layer | ✅ | 2026-05-18 | 4 catalogue files written. Verification: every number in Dan's worked example reproduces exactly (a₁=42, a₃,t=144, n_ef=1.86, R_V,k=12.99 kN, full chain η=0.801 for F_d=25 kN). 16 timber classes (EU + AU F-grades + MGP), 29 section presets, 18 HBS screws, 2 rule sets, 2 capacity tables (pp. 216, 217). |
| 2 — Entity types | ✅ | 2026-05-18 | TimberMember + SteelPlate in `75-timber-conn-entities.js`; Screw in `77-screw-entity.js` (76 was already taken by `76-v25-plate.js`). Dispatch wired in `34-draw-2d.js` gated by `FEATURE_TIMBER_SCREWS` flag (`05-state.js`). `tmbrCurrentConnectionId` global added to `07-globals.js`. Headless verification reproduces the fixture: timber outline at (0,0,340,1220), 423 grain-hatch lines, tag "340×1220 / GL28h"; plate outline at (110,200,120,900), AS 1100 cross-hatch, "PL 10" tag; 6 screws at correct (u,v) with 3 concentric circles (r=9.25/7.00/6.00 mm matching catalogue dK/dV/d) and X bit indicator; edges classify correctly (top/bottom=end, left/right=side for grain=+v); JSON round-trip clean. Static SVG at `dev/feature-timber-screws/verification/phase2-fixture.svg`. Tools / placement UI deferred to Phase 3. |
| 3 — Connection entity | ✅ | 2026-05-18 | `78-connection.js` (~290 lines): `mkConnection`, `tmbrBindScrew` / `tmbrUnbindScrewFromCurrent`, `tmbrSetLoad` (normalises direction + invalidates cached checks), `tmbrSetPreDrilled`, `tmbrGetConnection` / `tmbrGetEntityById` / `tmbrGetScrewsForConnection`, `tmbrConnectionAnchor`, `tmbrDeleteConnection` (graceful cleanup, unbinds screws), `drawConnection` (load arrow at rear centroid + magnitude/sub-labels + dashed inset highlight around bound members), and `tmbrCreateExampleConnection()` console helper that builds Dan's full Test 1 fixture in one call. `'connection'` dispatch case added to `34-draw-2d.js`. 36 assertions pass: connection refs, screw binding, load vector normalisation, anchor at column centroid (170, 610), rule-set version stamp, JSON round-trip preserves all refs, setLoad invalidates checks, setPreDrilled invalidates checks, unbind/rebind cycle, deleteConnection unbinds all screws cleanly. SVG at `verification/phase3-fixture.svg` shows the load arrow + bound-member highlight overlaying the Phase 2 fixture. |
| 3.5 — Click-tool integration | ⬜ | — | DEFERRED FROM PHASE 3. Wire `tool-tmbr-timber-member`, `tool-tmbr-steel-plate`, `tool-tmbr-screw`, `action-tmbr-start-connection`, `tool-tmbr-load-arrow` into `41-tools.js` + `40-placement.js` + `39-events.js`. The dispatch tree in `39-events.js` is the 1,415-line mousedown/move/up handler called out in known-issue #2 in the project root `CLAUDE.md`; integrating without untangling it is risky. v1 deliverable: programmatic flow via the Phase 3 factories is enough for testing; production UX comes after Phase 4 when the live checks justify the tool polish. |
| 4 — Rule engine | ✅ | 2026-05-18 | `79-checks-timber.js` (~440 lines): pure `checkConnection(connection, model?) → ConnectionCheckResult`. Implements the 9-step algorithm from `03-rule-engine.md` exactly — rule-context resolution, geometric frame (grain + perp + Fhat + α + ε), dot-product edge classification, α-interpolated required distances (with Douglas-fir × 1.5 and timber-to-timber × 1.5 modifier chain), per-screw edge checks (4 per screw), pair-wise spacing (C(n,2) pairs, pass if either a₁ OR a₂ satisfied), n_ef row detection by across-grain clustering with ε=a₂/2 and along-grain spacing detection, full capacity multiplier chain (R_V,k base from p. 216 → k_dens → k_mod / γM → n_ef × per-row → sum), η utilisation, and PASS/FAIL/WARN/ERROR roll-up. Console helper `tmbrCheckExampleConnection()` runs the engine against the live example and prints a digest. **All 8 v1 acceptance gate tests pass — 74/74 assertions** (Test 1 the worked example to within ≤ 0.005 on η, plus Tests 2/3/7/9/11/12/13 covering α=90° edge reclassification, no-predrilling a₁ violation, capacity overload at F=100 kN, single screw with no n_ef, mixed-diameter ERROR, SC3 service-class capacity drop, and permanent-duration capacity drop). Engine returns `overall: 'WARN'` for the gate case because of the ε/α placeholder warning — that will become 'PASS' when Q1 resolves and the warning is removed. |
| 5 — Palette integration + rollback | ⬜ | — | **REVISED FROM "Check rendering" after Dan's 2026-05-18 feedback.** See `10-corrective-plan.md` for locked architectural decisions and file-by-file ledger. Rollback the misguided autoloader + parallel SteelPlate / TimberMember types; add TIMBER and HBS SCREW tiles to V26 BB-rail Members section + 3D-mode Model palette; wire TIMBER as `mem2` variant with `memberType: 'timber'`, plate as existing V25 `plate2`, screw via new `v25-screw` tool. Rebuild Test 1 fixture using V25 factories and re-run the Phase 4 74-assertion suite to confirm η = 0.801 PASS still holds. |
| 5.5 — Connection creation flow | ⬜ | — | Add a "Timber Connections" section to `getDrawTabDef()` with a CONN tile that drives the click-rear → click-front flow, sets `tmbrCurrentConnectionId`, auto-binds newly-placed screws. Mirror the existing Cap Plate / Baseplate / WSP / Splice connection tiles in the 3D-mode palette. |
| 6 — Inspector breakdown | ⬜ | — | |
| 7 — Export and polish | ⬜ | — | |
| 8 — Test coverage | ⬜ | — | |
| 9 — v1.1 timber-to-timber | ⬜ | — | |
| 10 — v1.2 CLT | ⬜ | — | |
| 11 — v1.x deferred | ⬜ | — | |

---

## Sequencing notes

- **Why phases 1–3 don't include engine work**: get the data and the visuals right before piling on logic. If the entity drawing has bugs, the engine output will be confusing because it sits on top of the visuals.
- **Why engine before render**: the engine is pure-function and easy to test. Render reads from the engine output. If the render code is built first, it'd need stub data — wasted work.
- **Why inspector is its own phase**: it's the most UI-heavy piece. Easier to iterate when the data flowing into it is already correct.

---

## After v1 ships

- Dan uses it in real projects for ~2 weeks. Bug list inevitable.
- Update `01-domain-knowledge.md` with any ETA quirks discovered in use.
- Run a real project's connection through both StructDraw and Rothoblaas MyProject. Compare. Document any divergence in a new file `delta-vs-myproject.md`.
- Decide v1.x prioritisation with Dan.
