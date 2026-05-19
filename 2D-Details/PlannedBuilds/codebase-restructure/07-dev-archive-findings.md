# Repo-level findings — dev/ vs root, archive/, CHANGELOG, .claude/, README

This file covers everything outside `js/`. The findings here are mostly cheap fixes (Phase 1) and one significant code-touching corrective (Phase 2, already planned in `timber-screws/`).

---

## R1. `dev/` vs root `js/` — 9 dev-only files

These exist in `dev/js/` but not in root `js/`. All are wired in `dev/index.html`. All are part of the in-flight `timber-screws/` build.

| File | Lines | Wired? | Purpose |
|---|---|---|---|
| `02b-data-timber.js` | 221 | yes (line 1236) | Timber catalogue (16 strength classes, k_mod, γM, 29 AU section presets) |
| `02c-data-screws.js` | 231 | yes (line 1237) | Rothoblaas HBS Plate catalogue (18 screws from ETA-11/0030 p. 214) |
| `02d-data-rothoblaas-rules.js` | 315 | yes (line 1238) | Min-distance rule sets, n_ef table, R_V,k tables |
| `02e-catalogue-lookups.js` | 340 | yes (line 1239) | Pure-function helpers (getScrewSpec, getCapacity, classifyEdgeByLoad, …) |
| `75-timber-conn-entities.js` | 267 | yes (line 1315) | ⚠ **anti-pattern** — parallel `'timber-member'` + `'steel-plate'` entity factories |
| `77-screw-entity.js` | 121 | yes (line 1316) | `'screw'` entity type (numbered 77 because 76 was taken) |
| `78-connection.js` | 382 | yes (line 1318) | `'connection'` entity + `tmbrBindScrew`/`tmbrSetLoad`/`tmbrCreateExampleConnection` + `drawConnection` |
| `79-checks-timber.js` | 670 | yes (line 1320) | Rule engine `checkConnection(connection, model?)` — 9-step pipeline |
| `99-tmbr-autoload.js` | 192 | yes (line 1322) | ⚠ **anti-pattern** — autoloader + floating button (forbidden by playbook) |

**Status:** Phases 1–4 of `timber-screws/` are shipped to `dev/`. Phase 5 (the corrective) is planned but not executed. Phase 2 of THIS restructure executes Phase 5 of timber-screws.

**Specific anti-pattern confirmations:**

- `99-tmbr-autoload.js` injects a `position: fixed; top: 12px; right: 12px; z-index: 9999` button labelled "🔩 Timber-screw example" on every page load. The button is always injected even when `TMBR_AUTOLOAD_EXAMPLE` is false.
- `75-timber-conn-entities.js` defines parallel entity types `'timber-member'` and `'steel-plate'` instead of using `mem2 + memberType:'timber'` and `plate2` per the integration checklist. The playbook explicitly calls this out as the wrong shape; the corrective plan reroutes both.
- 10+ in-source comments reference `dev/feature-timber-screws/` — that folder no longer exists; the planning content moved to `PlannedBuilds/timber-screws/` on 2026-05-18. Phase 1 find/replaces all occurrences.

**Other dev/ vs root drift:**

- `dev/index.html` differs from root by 18 lines — purely the 9 timber script tags.
- `dev/index.html` loads `76-v25-plate.js` AFTER `99-tmbr-autoload.js` (last in the script list, out of numeric order). Root loads 76 at its natural position. After Phase 5/Phase 2 of this restructure, restore 76 to natural position.
- `dev/css/styles.css` and root `css/styles.css` are byte-identical.
- `--timber-color` CSS variable is referenced in `dev/js/75-timber-conn-entities.js:64` and **not defined anywhere** in either `styles.css`. Silent fallback to `--entity-color`. Phase 1: either define per theme, or drop the lookup.

---

## R2. `archive/v1/` is empty

| File | Playbook claim | Actual |
|---|---|---|
| `archive/v1/CHANGELOG.md` | "pre-V25 V1 archive (DO NOT EDIT)" | 0 bytes |
| `archive/v1/DRAFTER_MAPPING.md` | same | 0 bytes |
| `archive/v1/HANDOFF.md` | same | 0 bytes |
| `archive/v1/STRUCTDRAW_PROJECT_BRIEF.md` | same | 0 bytes |
| `archive/v1/index.html` | same | 0 bytes |
| `archive/snapshots/2026-04-29_pre-v25-backup.html` | "rollback path" | 635 KB ✓ |
| `archive/snapshots/2026-05-01_pre-layout-overhaul.html` | "rollback path" | 0 bytes ❌ |
| `archive/snapshots/2026-05-02_pre-modular-split.html` | "rollback for the split itself" | 957 KB ✓ |
| `archive/handoff_v2_abandoned.md` | "stale, kept for context" | 23 KB ✓ |

**Two snapshots are real (pre-V25 and pre-modular-split). The other three archive references are dead.** The CHANGELOG has a link at line 3 pointing to `archive/v1/CHANGELOG.md` (now empty).

Fix in Phase 1 — three options for Dan in `10-open-questions.md` (Q3):
1. Restore from git history (`git log --all --diff-filter=D` to find the deletion commits).
2. Delete the empty files and update the playbook to remove the rollback-path framing.
3. Leave as-is but document the empties so future readers know they're stubs.

---

## R3. `archive/completed-plans/` — flat files vs the playbook's folder claim

- **Playbook says:** "Move the idea folder to `archive/completed-plans/<YYYY-MM-DD>_<idea>/` (date = ship date)."
- **Reality:** 8 flat `<YYYY-MM-DD>_<idea>.md` files. The README inside that folder explicitly says "Files are date-prefixed" — self-consistent, but contradicts the playbook.

Recommended fix (Phase 1, Q4 in `10-open-questions.md`):

> "Single-file plans → archive as `<date>_<idea>.md`. Multi-file plans (i.e., the folder has more than just a README) → archive as `<date>_<idea>/` folder. Pick by the actual content shape, not by ceremony."

Update both `CLAUDE.md` and `archive/completed-plans/README.md` to say this.

---

## R4. CHANGELOG.md claims `schemaVersion: 2` shipped; code says version is `1.0` / `1`

- **CHANGELOG `[Unreleased]` (2026-05-12 entry):** "Save-format schemaVersion: 2 field"
- **`dev/js/46-save-load.js:13`:** `version: '1.0'`
- **`dev/js/50-project.js:17`:** `version: 1`
- **No `schemaVersion` field anywhere in `dev/js/`.**

Fix in Phase 1:
- Remove the CHANGELOG line OR move it to a "Planned for v25.6" section.

Fix in Phase 7:
- Actually implement `schemaVersion: 1` + load-time migration scaffold (closes Known Issue #5 from the playbook).

---

## R5. `README.md` mirror command is broken; `bin/release.sh` exists

- **`README.md` line 57:** `cp dev/index.html index.html && cp -r dev/css/ ./css/ && cp -r dev/js/ ./js/`
  - This command **nests directories** on second run because `cp -r dev/js/ ./js/` onto an existing `js/` directory creates `js/js/` rather than replacing.
- **`CLAUDE.md` "Mirroring" section:** Includes the `rm -rf css/ js/` step. Correct, but verbose.
- **`bin/release.sh` exists** and uses `set -euo pipefail` + existence checks + the full sequence. Production-grade.
- **`CLAUDE.md` Phase-2 priorities:** "A `bin/release.sh` helper is on the Phase-2 wishlist." Already shipped.

Fix in Phase 1:
1. Replace inline command in README with: "Run `./bin/release.sh` from the repo root."
2. Replace inline command in CLAUDE.md with same.
3. Remove `bin/release.sh` from the Phase-2 wishlist.

---

## R6. `.claude/` folder — undocumented

Contents:

| Entry | Purpose | Documented? |
|---|---|---|
| `launch.json` | VS Code-style dev-server config (ports 8765 / 8766 for root + dev) | No |
| `settings.local.json` | Claude Code per-project tool-allow-list. Many entries reference the **stale repo path** `/Users/danielmccarron/Documents/GitHub/bt-struct-tools/2D-Details/` (the repo moved to `engineering-apps/2D-Details/`) | No |
| `worktrees/sleepy-yalow-dca094/` | Git worktree at the parent repo level, last touched 2026-05-13 | No |
| `worktrees/stupefied-kowalevski-2b02d9/` | Where the `click-cycle-selection` feature was built; last touched 2026-05-18 | Only via `PlannedBuilds/click-cycle-selection/README.md` |

**No `commands/`, no `hooks/`, no slash commands.**

Fix in Phase 1: Add a short `.claude/` paragraph to CLAUDE.md describing the launch-config + the worktree-as-feature-branch pattern.
Optional fix: Prune stale `bt-struct-tools` paths from `settings.local.json` — harmless but messy.

---

## R7. `PlannedBuilds/` dashboard vs folder contents

**Correction from earlier impression:** The `click-cycle-selection/` folder DOES exist (the original user message implied otherwise). All 4 dashboard rows correspond to real folders. The dashboard statuses match the folder READMEs in all four cases.

The one drift inside the planning folders:

- **`PlannedBuilds/timber-screws/README.md`** opens with "Pre-implementation — no code written yet" even though Phases 1–4 are shipped in `dev/`. The TL;DR section correctly routes the reader through `10-corrective-plan.md` for the live state, but the opening line is stale.

Fix in Phase 1: Update the opening paragraph of `PlannedBuilds/timber-screws/README.md` to reflect the current state. The dashboard's status emoji ("🔶 Phase 5 reset — ready to build") is already accurate.

---

## R8. Conventions in the working code that aren't documented anywhere

These are real patterns a fresh chat has to discover by grepping. Phase 1 documents each in `CLAUDE.md`:

| Convention | Where it appears | Suggested home in CLAUDE.md |
|---|---|---|
| Sub-letter file numbers (`02b`, `02c`, `23a`) for sibling modules | 5 files in dev/, plus `23a-shs-joints.js` in root | "What goes in a new file" section |
| `tmbr` prefix for the timber-screws feature | Used widely; mentioned once in playbook step 7 | OK as-is |
| `view` field on every 2D entity (`view: 'elevation'` etc.) — set by `mkEnt2D` | Every V25 entity | "Variable conventions" table |
| `drawingScale` (mm-real per mm-sheet) global | Used by every drawer | "Variable conventions" table |
| `--timber-color` CSS variable referenced but not defined | `dev/js/75:64` | Either define per theme or drop |
| `ROTHOBLAAS_RULESET_VERSION` stamp on every Connection | `dev/js/78-connection.js:52-54` | "Save-format conventions" section |
| Demo objects identified by exact `section + length` match | `dev/js/99-tmbr-autoload.js:61-62` | Removed in Phase 2 |
| `'use strict';` first line of every file | All 84 dev/js files | Already documented (rule #7) ✓ |
| IIFE registration AFTER 73-init (load order matters) | `74-v26-bb-rail.js` | "Adding a new feature" section |

---

## R9. Mirror sequence integrity

`./bin/release.sh` (or the manual sequence) correctly mirrors all 84 dev/js files (including the 9 timber files) + the byte-identical CSS. No dotfiles in `dev/js/` or `dev/css/` to worry about. `.DS_Store` in `dev/` would NOT be copied because the mirror copies `dev/css/` and `dev/js/`, not `dev/` itself.

The mirror sequence does NOT clean up dropped files. If Phase 2 deletes `99-tmbr-autoload.js`, `75-timber-conn-entities.js`, etc. from `dev/`, the mirror DOES clean them from root (because `rm -rf css/ js/` happens first). ✓

---

## Summary — what Phase 1 fixes from this layer

Phase 1 (docs only, single build chat) closes:
- R1 (dev-only files documented + autoload anti-pattern flagged)
- R2 (archive/v1/ option chosen per Q3)
- R3 (completed-plans format documented per Q4)
- R4 (CHANGELOG `schemaVersion` claim reconciled)
- R5 (mirror commands point to `bin/release.sh`)
- R6 (`.claude/` documented)
- R7 (timber-screws README opening line updated)
- R8 (conventions documented)

Phase 2 (build chat, executes `timber-screws/10-corrective-plan.md`) closes:
- R1's anti-pattern entries (autoloader, parallel entity types, floating button)
- The 76-v25-plate.js load-order quirk in dev/index.html
- The 10+ stale `dev/feature-timber-screws/` references (cleaned during the same pass)

Phase 7 (build chat) closes:
- R4's underlying code reality (actually implement `schemaVersion: 1`)
