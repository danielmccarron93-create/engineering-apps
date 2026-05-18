# Completed plans archive

Build briefs / planning docs / reviews from features that have shipped. Kept for posterity (audit trail of decisions and rationale), not for reference during active work — the actual behaviour is in the released code and the CHANGELOG.

Files are date-prefixed (`YYYY-MM-DD_topic.md`) so they sort chronologically. Two date conventions: the date is when the doc was authored, not when the build shipped.

| File | Origin | What it was |
|---|---|---|
| `2026-05-02_modular-refactor-plan.md` | root `MODULAR_REFACTOR_PLAN.md` | Plan for splitting the 22k-line monolithic `index.html` into 73 numbered `js/NN-*.js` files. Shipped 2026-05-02. |
| `2026-05-02_modular-refactor-progress.md` | root `PROGRESS.md` | Live tracker from the modular-refactor session. Final state captured before being marked historical. |
| `2026-05-12_code-review.md` | root `REVIEW_2026-05-12.md` | Lead-software-dev × AU-structural-engineer review of the codebase after the modular split. Informed the Phase-2 / Phase-3 priorities now listed in `CLAUDE.md`. |
| `2026-05-12_mitre-priority-joints-build.md` | root `MITRE_PRIORITY_JOINTS_BUILD.md` | Build spec for the V25 mitre + priority-joint logic. |
| `2026-05-12_mitre-priority-joints-prompt.md` | root `MITRE_PRIORITY_JOINTS_PROMPT.md` | Kickoff prompt template for the mitre build. Pattern for future build-chat prompts. |
| `2026-05-12_pfc-followup-plan.md` | root `PFC_FOLLOWUP_PLAN.md` | Phase-2 follow-up plan for PFC (Aspect dropdown for cross-section + 3D mode wiring) after the initial V25 PFC tile landed. |
| `2026-05-12_pfc-followup-prompt.md` | root `PFC_FOLLOWUP_PROMPT.md` | Kickoff prompt for the PFC follow-up build chat. |
| `2026-05-12_structdraw-combined-build.md` | root `STRUCTDRAW_COMBINED_BUILD.md` | Combined build brief for running two related builds in one Claude Code session — pattern reference for future multi-build coordination. |

Moved here 2026-05-18 during the `PlannedBuilds/` restructure. See the project-root `CLAUDE.md` for the current planning-folder convention.
