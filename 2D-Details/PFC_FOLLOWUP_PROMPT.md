# Kickoff prompt for new Claude Code session

Paste this into a fresh Claude Code session opened in `/Users/danielmccarron/Documents/GitHub/engineering-apps/2D-Details/`. The plan doc has everything else.

---

I'm continuing work on StructDraw, a browser-based 2D structural detailing tool. The last session wired Parallel Flange Channels (PFC) into 2D-Studio mode and verified the 3D Model-mode canvas path. Two follow-up issues remain:

1. The Aspect dropdown (Elevation ↔ Cross-section) doesn't flip a placed PFC, and cross-section placement is broken because the placement flow requires a length drag.
2. PFC doesn't work in 3D mode — the BB-rail Draw tab tile creates 2D entities instead of 3D objects, and the Three.js iso engine has no PFC mesh builder.

Read `CLAUDE.md` end-to-end first — the workflow rules are non-negotiable (edit `dev/` only, no git, no build step, classic scripts). Then read `PFC_FOLLOWUP_PLAN.md` for the full plan with file/line targets, fix patterns, and test plans for both PRs.

Start with PR A (Aspect/Cross-section flow) — it's the higher-priority production issue and touches three files. PR B (3D iso parity) can follow.

Don't bundle either with refactors or with the CLAUDE.md known-issue tickets. Run `node --check` on each file you touch. Stop and hand back after each PR — I'll do the dev → root mirror and commit myself.
