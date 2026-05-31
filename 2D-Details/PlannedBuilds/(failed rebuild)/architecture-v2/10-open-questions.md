# Open Questions — decisions awaiting Dan's input

> **🟢 ALL DECISIONS LOCKED 2026-05-19** (in conversation with Dan; recorded here for traceability)
>
> ## Locked answers — summary
>
> **Group A (Phase 0a gating):**
> - Q1 LAYER comments → **Document-only in Phase 0a** (v1 retiring anyway; v2 files get the comment as they're built)
> - Q2 archive/v1/ empties → **Check git history, restore if available; otherwise delete + remove playbook framing**
> - Q3 completed-plans format → **Hybrid rule documented** (single-file plans → `.md`, multi-file plans → `/` folder)
> - Q4 CHANGELOG `schemaVersion: 2` claim → **Moved to "Planned for v2.0" section**
> - Q5 `--timber-color` → **Warm tan `#d2a76a` defined per theme** in `styles.css`; absorbs into v2 timber materials' `display.color`
>
> **Group B (Phase 0b architectural forks):**
> - Q6 v2 module loading → **`window.v2.*` namespace, classic scripts** (no build step)
> - Q7 ElementId → **UUID v4 via `crypto.randomUUID()`**
> - Q8 Element shape → **Plain object via factory function** (`makeElement({...})`)
> - Q9 Test framework → **Vitest with JSDOM**
>
> **Group C (later phases):**
> - Q10 Save format → **Keep `.sd2.json`, bump schemaVersion**
> - Q11 v2 BB-rail → **Phased replacement** alongside v1 during migration
> - Q12 3D-mode model-tab palette → **Promoted to catalogue-driven** (iterate family registry)
> - Q13 Connection wizard migration → **Phase 11 as planned**
> - Q14 IFC export → **Separate later folder; not in v2.0 scope**
> - Q15 Per-customer branding → **Phase 9** (Bligh Tanner + ACOR placeholder + Generic profiles)
> - Q16 Spatial index → **Add when performance demands** (linear scan adequate to ~1,000 elements)
> - Q17 Plugin surface → **Document the hook shape, don't build**
> - Q18 Multi-user co-editing → **v3 territory; design now, build later**
>
> ## What this unlocks
>
> Every phase in `09-build-plan.md` is now unblocked. The first build chat (Phase 0a — docs realignment) can start.
>
> The detailed rationale for each question is preserved below for future reference.

---

Each question had a recommended option in **bold**. All questions are now 🟢 locked. Phase tags say which build chat each gated. The body below is preserved for traceability.

---

## Group A — Gating Phase 0a (docs realignment)

### Q1. 🟡 LAYER comments — full sweep, 5 worked-example files, or document-only?

**Blocks:** Phase 0a

Phase 0a documents the v2 file-number-bands (in CLAUDE.md). It can optionally add the LAYER comment block (per `02-target-architecture.md` discussion in `codebase-restructure/`) to existing v1 files.

| Option | Description |
|---|---|
| **A — Document-only in Phase 0a (Recommended for v2 path)** | Document the convention. Don't add LAYER comments to v1 files because v1 is being retired anyway. Add the comments to v2 files as they're built. |
| B — 5 worked-example files | Apply to the 5 most-edited v1 files as a teaching pattern. |
| C — Skip entirely | The convention exists in v2 files (where the directory structure already communicates layer); v1 doesn't need it. |

**Dan's answer:**

### Q2. 🟡 `archive/v1/` empty files — restore, delete, or document?

**Blocks:** Phase 0a

`archive/v1/CHANGELOG.md` etc. are all 0 bytes. Playbook calls them "rollback path of last resort."

| Option | Description |
|---|---|
| **A — Restore from git history (Recommended)** | `git log --all --diff-filter=D --follow archive/v1/CHANGELOG.md` to find the deletion. Restore. |
| B — Delete the empty files; remove playbook framing | Honest about reality. |
| C — Leave as-is; add "stub" annotation | Cheapest. |

**Dan's answer:**

### Q3. 🟡 `archive/completed-plans/` format — flat files or folders?

**Blocks:** Phase 0a

| Option | Description |
|---|---|
| **A — Document the hybrid rule (Recommended)** | Single-file plans → `.md`. Multi-file plans → folder. Pick by content shape. |
| B — Always folders | Wasteful for single-file plans. |
| C — Always flat files | Won't work for the 10-file timber-screws folder when it ships. |

**Dan's answer:**

### Q4. 🟡 CHANGELOG `schemaVersion: 2` claim — remove or move?

**Blocks:** Phase 0a

| Option | Description |
|---|---|
| **A — Move to "Planned for v2.0" section (Recommended)** | Honest. The line moves back to the active CHANGELOG once Phase 0e ships schemaVersion: 2 for real. |
| B — Delete the line entirely | Clean break; loses historical-intent record. |
| C — Implement immediately | Out of scope for Phase 0a (docs only). |

**Dan's answer:**

### Q5. 🟡 `--timber-color` CSS variable — define or drop?

**Blocks:** Phase 0a (the in-flight timber-screws ship in v1 before v2 starts — fix the silent fallback first)

| Option | Description |
|---|---|
| **A — Define per theme in `styles.css` (Recommended)** | Add `--timber-color: #d2a76a` (warm tan) to each of the 5 themes. Visual distinction. |
| B — Drop the lookup; use `--entity-color` | Lose distinction. |
| C — Global default in `:root` outside themes | Doesn't theme-vary. |

**Dan's answer:**

---

## Group B — Gating Phase 0b (model layer scaffold)

### Q6. 🟡 v2 namespace — `window.v2.*` or ES modules?

**Blocks:** Phase 0b

The playbook says classic scripts, no build step. v2 has to fit that constraint AND be amenable to future ESM migration.

| Option | Description |
|---|---|
| **A — `window.v2.*` namespace, classic scripts (Recommended)** | Matches playbook. Every v2 file does `window.v2.x.y = …`. ESM migration later is a mechanical conversion. |
| B — ES modules now (`import`/`export`) | Cleaner code but requires a bundler OR `<script type="module">` (which has its own constraints, especially `file://` development). Breaks the no-build-step rule. |
| C — Hybrid: build step optional | Use ESM but also commit a bundled UMD output. Doubles maintenance. |

**Dan's answer:**

### Q7. 🟡 ElementId — UUID v4, or short opaque string?

**Blocks:** Phase 0b

| Option | Description |
|---|---|
| **A — UUID v4 via `crypto.randomUUID()` (Recommended)** | 36 characters, globally unique, no collision risk, future-proof for multi-user editing. Slight verbosity in saved files. |
| B — Short Crockford base32, 12 chars (e.g., `a3xq7p2bvk4n`) | More readable; need a generator function; tiny non-zero collision risk on millions of elements. |
| C — Monotonic counter | Smallest IDs but breaks under merge/import. Not recommended. |

**Dan's answer:**

### Q8. 🟡 Element shape — class or plain object?

**Blocks:** Phase 0b

| Option | Description |
|---|---|
| **A — Plain object with factory function (Recommended)** | `const elem = makeElement({...})` returns `{ id, category, family, type, geometry, ... }`. Serialises trivially. No `this`. Pure functions on the shape. Matches the no-build-step constraint cleanly. |
| B — JS class with `toJSON` / `fromJSON` | More OOP-style. Slightly more constructor logic; needs a custom JSON reviver to rehydrate Maps/Sets. |
| C — TypeScript interface with classes | Requires TS build step. Out per playbook. |

**Dan's answer:**

### Q9. 🟡 Test framework — Vitest, Jest, or something else?

**Blocks:** Phase 0b (CI tests need a runner)

| Option | Description |
|---|---|
| **A — Vitest with JSDOM (Recommended)** | Fast, modern, ESM-native test runner. Works without a bundler. `vitest run` from CLI; `vitest watch` for dev. JSDOM environment built in. Lightweight to install. |
| B — Jest with JSDOM | More widely known. Slower. More setup. |
| C — Native Node.js test runner (`node --test`) | Zero dependencies. Less mature; weaker browser-API simulation. |
| D — No tests; manual smoke testing only | Cheapest now, expensive later. Strongly not recommended for an architecture this size. |

**Dan's answer:**

---

## Group C — Gating later phases

### Q10. 🟡 Save format — extend existing `.sd2.json` or new `.sd3` extension?

**Blocks:** Phase 0e

| Option | Description |
|---|---|
| **A — Keep `.sd2.json`; bump schemaVersion (Recommended)** | Files saved before v2 stay `.sd2.json`. Files saved after Phase 0e load also `.sd2.json` with `schemaVersion: 2`. Migration is automatic on open. |
| B — New `.sd3.json` for v2 files | Cleaner separation; user has to remember which file is which. Loss of mental model continuity. |
| C — Two-file output during transition | Save both v1 and v2 to disk. Doubles file count. |

**Dan's answer:**

### Q11. 🟡 What's the v2 BB-rail's relationship to v1's V26 BB-rail?

**Blocks:** Phase 1 (pilot UI work)

| Option | Description |
|---|---|
| **A — Phased replacement (Recommended)** | v2 BB-rail is built fresh in `js/v2/ui/palette-bb-rail.js`. During the migration window, v1 BB-rail renders v1-authoritative tiles; v2 BB-rail renders v2-authoritative tiles. They sit side-by-side OR the v2 rail subsumes the v1 rail tile-by-tile as features migrate. |
| B — v2 takes over entirely from Phase 1 | Risky — every v2 tile must work from day one. |
| C — Keep v1 BB-rail forever | Defeats the architectural cleanup. |

**Dan's answer:**

### Q12. 🟡 The 3D-mode model-tab palette (`60-tile-palette.js`) — what happens to it?

**Blocks:** Phase 4 (members migration — this is when the 3D-mode palette gets exercised heavily)

| Option | Description |
|---|---|
| **A — Promote to the v2 catalogue (Recommended)** | The Model-tab palette in v2 is built by iterating the family catalogue and showing tiles for every family with a 3D renderer. No separate palette file. |
| B — Keep as a hand-maintained tile list | Two sources of truth (catalogue + palette). Drift risk. |
| C — Retire entirely; use only the V26 BB-rail | Loses the model-tab/paper-tab distinction that the current UX has. |

**Dan's answer:**

### Q13. 🟡 The connection-wizard family (`48-connection-builders.js`) — when does it migrate?

**Blocks:** Phase 11 (scheduling decision)

| Option | Description |
|---|---|
| **A — Phase 11, as planned (Recommended)** | Connection wizards are compositional — they place multiple elements at once. Becomes a `BatchTransaction` composer. Best done after members + plates + fasteners are all v2 to lean on. |
| B — Earlier (Phase 4-5) | Possible but the wizard is heavily coupled to the things it places. Wait. |
| C — Defer indefinitely | The 2D-mode connection wizard is a gap in v1 too; v2 is the chance to add it. |

**Dan's answer:**

### Q14. 🟡 IFC export — Phase 13, separate later folder, or never?

**Blocks:** Phase 13 (DXF + PDF full coverage) — IFC could ride alongside or separately

| Option | Description |
|---|---|
| **A — Separate later folder (Recommended)** | IFC is a substantial standard (~200-300 IFC entities). Worth its own PlannedBuilds folder when it's time. Not v2.0. |
| B — Bundle into Phase 13 | Same files-touched layer (renderer/emitter), but doubles Phase 13's scope. |
| C — Never | Loses BIM interop story. |

**Dan's answer:**

### Q15. 🟡 Per-customer branding (Bligh Tanner vs ACOR vs generic) — when?

**Blocks:** Phase 9 (sheet components — title-block is the obvious touchpoint)

| Option | Description |
|---|---|
| **A — Phase 9 (Recommended)** | When titleblocks migrate, parameterise on customer. Configure via `appState.project.customerProfile`. Three initial profiles: Bligh Tanner, ACOR (placeholder), Generic. |
| B — Later (post-Phase 13) | Defer until v2 is stable. |
| C — Build into Phase 0c (catalogue layer) | Earlier than needed. |

**Dan's answer:**

### Q16. 🟡 Spatial index — when to add?

**Blocks:** Optional optimisation; gates only itself

| Option | Description |
|---|---|
| **A — Add when performance demands it, no earlier (Recommended)** | Linear scan over `model.elements.values()` is fine for < 1,000 elements. Most detail sheets have 50-200 elements. Build the spatial index (R-tree or grid) when measured frame time exceeds 16ms on a representative sheet. |
| B — Add in Phase 0b (model layer scaffold) | Premature optimisation. The shape might not be right until we know what query patterns dominate. |
| C — Add in Phase 4 (members) | Members are the highest-count category; reasonable trigger. |

**Dan's answer:**

### Q17. 🟡 Plugin / extension surface — design now or defer?

**Blocks:** Phase ∞ (v1 retirement) realistically

| Option | Description |
|---|---|
| **A — Document the surface, don't build it (Recommended)** | The architecture naturally supports plugins (register category, register family, register renderer entry, register rule). Document in `02-target-architecture.md` as a hook for the future. Build the surface only when there's a real plugin to write. |
| B — Build the plugin loader in Phase 0 | Premature. No plugin to test against. |
| C — Defer entirely | Loses the "second-engineer/contractor" attractiveness of the architecture. |

**Dan's answer:**

### Q18. 🟡 Co-editing / multi-user — when?

**Blocks:** v2.x or v3 territory; informational only

| Option | Description |
|---|---|
| **A — v3 territory; design now but don't build (Recommended)** | Transactional architecture is the foundation for it. Decide build trigger when v2.0 ships. |
| B — Build during Phase 0b | Wildly premature. |
| C — Never | Loses team-collaboration story (which a Revit competitor needs eventually). |

**Dan's answer:**

---

## Group D — Decisions Dan has already made (recorded here for traceability)

### D1. ✅ Ship the four in-flight ideas in v1 first

Decision made 2026-05-19 via AskUserQuestion. timber-screws Phase 5 corrective, orientation-presets, v25-2d-bolts, click-cycle-selection mirror — all ship in v1. v2 starts after.

### D2. ✅ Highest-quality final product over fastest path

Decision made 2026-05-19. Trade-off rebalances toward Path C (strangler fig) over Path A (incremental cleanup).

### D3. ✅ Unlimited evening time

Decision made 2026-05-19. Cadence is "as much as it needs and whenever required" — phasing is by quality, not by deadline.

### D4. ✅ New planning folder for the architecture rebuild

Decision made 2026-05-19. This folder (`PlannedBuilds/architecture-v2/`) is the canonical home. `codebase-restructure/` Phase 1 absorbs into it as Phase 0a; Phases 2-7 of that folder are superseded.

---

## Summary of blocking status

| Question | Blocks | Answered? |
|---|---|---|
| Q1 — LAYER comments | Phase 0a | 🟡 |
| Q2 — `archive/v1/` empties | Phase 0a | 🟡 |
| Q3 — completed-plans format | Phase 0a | 🟡 |
| Q4 — CHANGELOG schemaVersion claim | Phase 0a | 🟡 |
| Q5 — `--timber-color` definition | Phase 0a | 🟡 |
| Q6 — v2 namespace (window.v2 vs ESM) | Phase 0b | 🟡 |
| Q7 — ElementId format | Phase 0b | 🟡 |
| Q8 — Element class vs plain object | Phase 0b | 🟡 |
| Q9 — Test framework | Phase 0b | 🟡 |
| Q10 — Save format / file extension | Phase 0e | 🟡 |
| Q11 — v2 BB-rail relationship to v1 | Phase 1 | 🟡 |
| Q12 — 3D-mode model-tab palette future | Phase 4 | 🟡 |
| Q13 — Connection wizard migration timing | Phase 11 | 🟡 |
| Q14 — IFC export | Phase 13+ | 🟡 |
| Q15 — Per-customer branding timing | Phase 9 | 🟡 |
| Q16 — Spatial index timing | Optional | 🟡 |
| Q17 — Plugin surface | Phase ∞ | 🟡 |
| Q18 — Multi-user co-editing | v3 | 🟡 |
