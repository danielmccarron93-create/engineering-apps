# Open questions — decisions awaiting Dan's input before Phase 1 starts

Each question has a recommended option in **bold**. Mark the question 🟢 once answered. Phase tags say which build chat is blocked by each.

---

## Q1. Subdirectory adoption — when, if ever? 🟡

**Blocks:** Phase 8+ (out of scope for this restructure)

The aspirational end-state is `js/shared/`, `js/three-d-studio/`, `js/two-d-studio/` subdirectories. The proposed structure (file-number bands + LAYER comments) achieves 90% of the same clarity with zero file moves. Is the subdirectory step the right end-state, or are the bands sufficient indefinitely?

| Option | Description |
|---|---|
| **A — Bands suffice indefinitely (Recommended)** | Stay flat. Bands + LAYER comments deliver the clarity. Subdirectory moves break every git-blame trail and IDE bookmark. |
| B — Subdirectories after Phase 6 | Adopt subdirectory layout once dedup is complete. Mechanical moves because bands already declare destinations. |
| C — Subdirectories in Phase 1 | Big bang. Risky because it breaks every Files-touched reference in PlannedBuilds. |

Recommendation: **A**. Revisit only if the codebase doubles in size. The bands give you the discipline without the cost.

**Dan's answer:**

---

## Q2. Mandatory LAYER comments — full sweep or incremental? 🟡

**Blocks:** Phase 1

Phase 1 proposes adding the LAYER comment block to the 5 most-edited files (`28`, `34`, `39`, `68`, `74`) as a worked example. The remaining 70 files would acquire it incrementally as features touch them.

| Option | Description |
|---|---|
| **A — 5 worked-example files in Phase 1 (Recommended)** | Documents the convention; doesn't blow up the diff. |
| B — Full sweep — all 75 files in Phase 1 | One-time effort, but the diff is ~150 lines for almost zero behaviour change. |
| C — No worked examples — document the convention in CLAUDE.md only | Lightest touch, but the next build chat has no reference. |

Recommendation: **A**. Worked examples without a megadiff.

**Dan's answer:**

---

## Q3. `archive/v1/` empty files — restore, delete, or document? 🟡

**Blocks:** Phase 1

`archive/v1/CHANGELOG.md`, `DRAFTER_MAPPING.md`, `HANDOFF.md`, `STRUCTDRAW_PROJECT_BRIEF.md`, `index.html` are all 0 bytes. Same for `archive/snapshots/2026-05-01_pre-layout-overhaul.html`. The playbook calls them "the rollback path of last resort."

| Option | Description |
|---|---|
| **A — Restore from git history (Recommended)** | Find the commits that deleted/zeroed them and restore. `git log --all --diff-filter=D` to locate. Preserves the rollback claim. |
| B — Delete the empty files; remove playbook framing | Honest about reality. Lose the rollback path. |
| C — Leave as-is; add "stub" annotation to playbook | Cheapest. Reader knows they're empty but doesn't get rollback value. |

Recommendation: **A** if git history has them; **B** otherwise. The CHANGELOG link to `archive/v1/CHANGELOG.md` should either work or be removed.

**Dan's answer:**

---

## Q4. `archive/completed-plans/` format — flat files or folders? 🟡

**Blocks:** Phase 1

Playbook says "Move the idea folder to `archive/completed-plans/<YYYY-MM-DD>_<idea>/` (date = ship date)." Reality is 8 flat `.md` files.

| Option | Description |
|---|---|
| **A — Document the hybrid rule (Recommended)** | "Single-file plans → archive as `<date>_<idea>.md`. Multi-file plans (folder has more than just README) → archive as `<date>_<idea>/` folder. Pick by actual content shape." |
| B — Always folders | Update playbook claim is correct; convert the 8 flat files into single-file folders. Wasteful. |
| C — Always flat files | Update playbook to say "always flat." Won't work for the timber-screws folder which has 10+ files. |

Recommendation: **A**. Honest about what makes sense.

**Dan's answer:**

---

## Q5. CHANGELOG `schemaVersion: 2` claim — remove or move to "Planned"? 🟡

**Blocks:** Phase 1 (and Phase 7's CHANGELOG entry)

The CHANGELOG `[Unreleased]` section claims "Save-format schemaVersion: 2 field" was added on 2026-05-12. The code says otherwise.

| Option | Description |
|---|---|
| **A — Move to "Planned for v25.6" section (Recommended)** | Honest about state. Phase 7 implements it for real and the line moves back. |
| B — Delete the line entirely | Clean break but loses the historical-intent record. |
| C — Leave as-is; implement immediately in Phase 1 | Out of scope — Phase 1 is docs only. |

Recommendation: **A**.

**Dan's answer:**

---

## Q6. `--timber-color` CSS variable — define or drop? 🟡

**Blocks:** Phase 2 (the timber-screws corrective)

`dev/js/75-timber-conn-entities.js:64` reads `--timber-color`; never defined in `styles.css` (silent fallback to `--entity-color`).

| Option | Description |
|---|---|
| **A — Define per theme (Recommended)** | Add `--timber-color: #d2a76a` (warm tan) to each of the 5 themes in `styles.css`. Timber renders distinct from concrete/steel. |
| B — Drop the lookup; use `--entity-color` everywhere | Lose visual distinction; gain simplicity. |
| C — Make it a global default in `:root` outside the themes | Simplest of A; doesn't theme-vary. |

Recommendation: **A**. Visual distinction matters for STP-quality details.

**Dan's answer:**

---

## Q7. Phase ordering — strict or flexible? 🟡

**Blocks:** Phase 1 (mostly affects when subsequent phases start)

The phased plan assumes Phase 1 → 2 → 3 → 4 → 5 → 6 → 7 in order. Some phases CAN run in parallel:

- Phase 2 (timber-screws corrective) is mostly independent of Phase 1 — could run in parallel.
- Phase 7 (schema version + autosave) is independent of Phases 3–6.
- Phase 6 has 8 sub-phases that are mostly independent of each other.

| Option | Description |
|---|---|
| **A — Strict order, single chat per phase (Recommended)** | Cleanest. No merge conflicts between concurrent build chats. Slower wall-clock. |
| B — Phase 1 first (always); then Phases 2 + 3 in parallel; then 4 + 5 + 7 in parallel; then 6 last | Fastest wall-clock. Risk of conflicts when concurrent chats touch the same files. |
| C — Strict order, but Phase 6's sub-phases parallel | Middle ground. Each sub-phase touches different files so parallelism is safe. |

Recommendation: **A** for the first time through, then **C** if the cadence demands it.

**Dan's answer:**

---

## Q8. Should this restructure absorb the timber-screws planning folder? 🟡

**Blocks:** Phase 2 completion

When Phase 2 finishes, the timber-screws feature is shipped. Per the standard workflow, the folder moves to `archive/completed-plans/2026-MM-DD_timber-screws/`.

| Option | Description |
|---|---|
| **A — Standard archive (Recommended)** | Move timber-screws to `archive/completed-plans/` when shipped. Update the dashboard. |
| B — Merge timber-screws into this folder | Treat as a sub-phase. Loses the careful work in the timber-screws folder. |
| C — Keep timber-screws active until full restructure is shipped | Confusing — the corrective work happens in Phase 2, not in a future timber-screws phase. |

Recommendation: **A**.

**Dan's answer:**

---

## Q9. Should the connection-wizard (`48-connection-builders.js`) get a 2D-Studio equivalent? 🟡

**Blocks:** Future planning (not this restructure)

The wizard composes a cap plate / baseplate / splice / WSP from 3D members. There's no V25 2D-mode equivalent — a user can't compose these in 2D mode.

| Option | Description |
|---|---|
| **A — Defer; no 2D-Studio wizard in this restructure (Recommended)** | Out of scope. Capture as a future planning idea. |
| B — Add a 2D wizard in Phase 6 | Significant scope creep. The wizard is non-trivial. |
| C — Drop the 3D wizard | The 3D side has it because cap plates / baseplates are the bread and butter of 3D-Studio. Removing would break daily use. |

Recommendation: **A**. Capture as a separate `PlannedBuilds/2d-connection-wizard/` if Dan wants.

**Dan's answer:**

---

## Q10. Stale `bt-struct-tools` paths in `.claude/settings.local.json` — prune now? 🟡

**Blocks:** Phase 1 (optional inclusion)

The Claude Code per-project allow-list has 100+ entries referencing the old repo path `/Users/danielmccarron/Documents/GitHub/bt-struct-tools/2D-Details/`. The repo moved to `engineering-apps/2D-Details/`. The old entries just fail-deny silently.

| Option | Description |
|---|---|
| **A — Leave for now; prune opportunistically (Recommended)** | Harmless. Don't bloat Phase 1's diff. |
| B — Prune as part of Phase 1 | One-time cleanup. ~100 lines deleted. |
| C — Prune in a separate micro-PR | Cleanest history; smallest cost. |

Recommendation: **A**. Cost > benefit right now.

**Dan's answer:**

---

## Summary of blocking status

Once Q1–Q7 are answered, Phase 1 can start.
Q6, Q8 block Phase 2.
Q9 is informational only.
Q10 is optional.

| Question | Blocks | Answered? |
|---|---|---|
| Q1 — Subdirectory adoption | Phase 8+ | 🟡 |
| Q2 — LAYER comment sweep scope | Phase 1 | 🟡 |
| Q3 — `archive/v1/` empties | Phase 1 | 🟡 |
| Q4 — completed-plans format | Phase 1 | 🟡 |
| Q5 — CHANGELOG `schemaVersion` claim | Phase 1 | 🟡 |
| Q6 — `--timber-color` definition | Phase 2 | 🟡 |
| Q7 — Phase ordering | Phase 1 (advisory) | 🟡 |
| Q8 — Timber-screws archive policy | Phase 2 completion | 🟡 |
| Q9 — 2D-Studio connection wizard | Future planning | 🟡 |
| Q10 — Stale Claude paths | Phase 1 (optional) | 🟡 |
