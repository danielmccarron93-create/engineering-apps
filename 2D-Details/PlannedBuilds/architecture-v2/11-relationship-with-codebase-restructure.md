# Relationship with `codebase-restructure/`

When the codebase-review work began (2026-05-19, earlier in the same chat), the deliverable was `PlannedBuilds/codebase-restructure/` — a seven-phase incremental cleanup plan. After Dan asked the bigger question ("if Revit were building this, would the structure look like this?"), the response was this folder (`architecture-v2/`), which is a deeper rebuild plan.

The two folders are not contradictory. The cleanup plan's Phase 1 (docs realignment) is still the right first move; the other six phases are mostly superseded by v2 because v2 dissolves the problems they were solving.

This file is the explicit mapping so a future build chat doesn't accidentally execute superseded work.

---

## The mapping

| `codebase-restructure/` phase | What it does | Status under architecture-v2 |
|---|---|---|
| Phase 1 — Docs realignment | Update CLAUDE.md / README / CHANGELOG to be truthful; fix mirror command; document conventions; add `23a-shs-joints.js` + `76-v25-plate.js` to file map; resolve `archive/v1/` framing; reconcile schemaVersion claim. No code changes. | **Carried over verbatim as Phase 0a of `architecture-v2/`**. Identical Files-touched table. Identical exit criterion. Identical open questions (Qs 1-5 in `architecture-v2/10-open-questions.md` mirror Qs 1-5 in `codebase-restructure/10-open-questions.md`). |
| Phase 2 — Execute timber-screws Phase 5 corrective | Delete `99-tmbr-autoload.js`, delete parallel entity types, wire TIMBER + HBS SCREW tiles properly per the integration checklist. | **Still applicable**. The timber-screws Phase 5 corrective ships in v1 first per Dan's decision (D1 in `architecture-v2/10-open-questions.md`). Execute it from the `timber-screws/10-corrective-plan.md` directly. It is not relabelled as a v2 phase — it ships as the last v1 build before v2 starts. |
| Phase 3 — Lift scattered globals into `appState` | Move ~25 globals from `07-globals.js` + other files into a single `appState`. | **Superseded by v2**. v2 introduces `window.v2.appState` as the structured state holder. The v1 globals stay in place during the migration window because they're load-bearing for v1 code. The retirement happens automatically as features migrate to v2 (each migration moves its feature's state into `appState.tools.<feature>` or wherever). Phase ∞ (v1 retirement) finishes the cleanup. |
| Phase 4 — Split `39-events.js` into tool-handler dispatch table | Replace the 1,601-line monolith with `events/tool-*.js` modules. | **Superseded by v2**. v2's Tool Layer (`06-tools-and-transactions.md`) is the same architectural pattern at a different scope. The v2 implementation is `js/v2/engine/event-dispatch.js` + per-tool files in `js/v2/tools/`. v1's `39-events.js` is left untouched until Phase ∞ retires it. |
| Phase 5 — Replace V25 monkey patches with hooks | Replace the 3-4 `_v25_orig*` wrappers in `72-v25-options-bar.js` with named extension hooks on `undo`, `v25Add`, `v25SetTool`, `v25TryHandleClick`. | **Superseded by v2**. v2's transaction-based architecture means the options bar is a UI subscriber to model dirty events, not a function-wrapper. The monkey patches stay in v1 (where they currently work) until Phase ∞ retires the V25 options bar. |
| Phase 6 — Dedup parallel implementations (joints, auto-welds, selection, bolts) | Unify the four parallel 3D/V25 pairs by extracting frame-agnostic algorithms. | **Superseded by v2**. v2 has one Geometry layer (`05-render-pipeline.md` §5), so jointTrim and occlusionClip are one algorithm each. The migration phases (Phase 7 for joints, Phase 3 for bolts in `architecture-v2/09-build-plan.md`) deliver the same dedup as a side effect of moving the feature to v2. |
| Phase 7 — Schema-version save format + autosave | Add `schemaVersion: 1` to `.sd2.json` + load-time migrator + throttled autosave + dirty title-bar indicator. | **Superseded by v2**. v2's I/O layer (`07-migration-strategy.md` §4) introduces `schemaVersion: 2` save format with a v1→v2 migration scaffold. v2's Engine Layer adds autosave + dirty indicator as part of Phase 0d + Phase 1. The dedicated Phase 7 in `codebase-restructure/` is no longer needed. |

---

## Practical implications

### For a fresh chat opening this folder

- **Phase 0a is real and should be executed first.** It's identical to what `codebase-restructure/` Phase 1 specified.
- **Don't execute `codebase-restructure/` Phases 2-7.** They're either absorbed (Phase 2 → execute via `timber-screws/10-corrective-plan.md`) or superseded (Phases 3-7) by the v2 plan.
- **The `codebase-restructure/` folder is kept for reference, not for execution.** Its diagnosis (`02-current-state-audit.md`) is still useful — every drift item it lists is still valid. Its prescription (Phases 2-7) is superseded.

### For the `codebase-restructure/` folder itself

The folder should be marked as "Partially superseded" in `PlannedBuilds/README.md` dashboard. Its `09-build-plan.md` should add a banner at the top:

> **Status note (added 2026-05-19):** Phases 2-7 of this plan are superseded by `PlannedBuilds/architecture-v2/`. Execute Phase 1 (docs realignment) — it carries over as Phase 0a of v2. The diagnosis in `02-current-state-audit.md` is still authoritative; the prescription beyond Phase 1 is not.

This avoids the failure mode where a future chat picks up `codebase-restructure/`, doesn't read this note, and executes Phase 3 (which would be net-negative work since Phase 3 fights with v2's appState design).

### For the dashboard at `PlannedBuilds/README.md`

The row for `codebase-restructure/` should be updated to reflect partial supersession. The new row for `architecture-v2/` should make it clear that this is the active long-term plan.

---

## When to retire `codebase-restructure/`

`codebase-restructure/` moves to `archive/completed-plans/` (or the planned archive folder per Q3) when:

1. Phase 0a of `architecture-v2/` is complete (the docs realignment work that was Phase 1 of `codebase-restructure/`).
2. The four in-flight ideas have shipped.
3. Phase 0b of `architecture-v2/` has started.

At that point, `codebase-restructure/` has served its purpose (it produced the diagnosis that motivated `architecture-v2/`) and can be archived. Its `02-current-state-audit.md` is the lasting artefact — a snapshot of the v1 codebase's drift before the rebuild began.

---

## The diagnosis vs the prescription

The clearest way to think about the two folders:

- **`codebase-restructure/02-current-state-audit.md`** is the diagnosis. What's wrong with v1. Still authoritative.
- **`architecture-v2/`** is the prescription. What we're going to do about it. Authoritative.
- **`codebase-restructure/` Phases 2-7** were a smaller, faster prescription that doesn't reach the desired end state. Superseded.

The diagnosis didn't change. The prescription did, after the user pushed back on the depth of the original recommendation. Both responses are useful as artefacts of the thinking process. Only the bigger prescription is the build target.
