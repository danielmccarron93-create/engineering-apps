# Claude Code Prompt — Mitre & Priority Joints Build

Copy the section between the `===PROMPT START===` and `===PROMPT END===` markers and paste it as the first message in a fresh Claude Code chat opened in the StructDraw repo root.

---

===PROMPT START===

You are working on StructDraw, a single-engineer browser tool for AS 1100 / AS 4100 / AS 3600 / AS 1101 / AS 1252 compliant 2D structural details. The codebase is a no-build, classic-script HTML/JS app — read `CLAUDE.md` end-to-end before touching anything.

## Your job

Implement the Mitre & Priority Joints feature, fully specified in `MITRE_PRIORITY_JOINTS_BUILD.md`. The spec covers the data model, render rules, interaction flow, file-by-file change list, migration, and phased delivery. Treat it as the source of truth. If the spec is ambiguous, **stop and ask** — do not guess.

## Before you write any code

1. Read `CLAUDE.md` end-to-end. Pay particular attention to: the workflow rules (dev/ only, no commits, no build step), variable conventions (`u/v` view-local, `x/y/z` world, `px/py` pixels, `sx/sy` sheet-mm, `r` prefix = real-world coords), AS 1100 lineweight constants (`LW`), and Known Issues (do not fix in passing).
2. Read `MITRE_PRIORITY_JOINTS_BUILD.md` end-to-end.
3. Read these existing source files in this order, so you understand what's already there:
   - `js/68-v25-tools.js` — focus on `drawMem2D`, `v25Mem2ResolveCap`, `_drawCapWeld`, `v25Mem2HostUnderCursor`, `v25Mem2WorldOutline`, `v25Mem2WorldCentreline`, `v25FirstSegPolyHit`, `v25OpenEndCapPopup`. These are the foundations the new code plugs into or reuses.
   - `js/69-v25-dispatch.js` — the `tool === 'v25-mem'` branch around line 332. This is where placement-time joint creation hooks in.
   - `js/71-v25-selection.js` — the end-handle drag block around line 877 and the inspector "Auto-mitre joins" block around line 1019. The new inspector "Joint" section replaces / extends the latter.
   - `js/39-events.js` — the `dblclick` handler around line 1087. The new joint hit-test goes BEFORE the existing weld hit-test.
   - `js/22-render-core.js` — where V25 overlays are invoked from the render loop.
   - `js/46-save-load.js` and `js/50-project.js` — for the schema-v2 migration.
   - `js/05-state.js` and `js/07-globals.js` — globals live here, nowhere else.
   - `js/23-auto-weld.js` — `showWeldPopup` is the style/UX reference for the joint popup.

When you've finished reading, **summarise back to me in ≤ 200 words** your understanding of (a) the data model, (b) the rendering dispatch in `v25Mem2ResolveCap`, and (c) the placement-time joint-vs-legacy classifier. Wait for my confirmation before starting Phase 1.

## How you work

- All edits go in `dev/` only. Mirror dev/ → root is Dan's job, not yours.
- One phase at a time. After each phase, run `node --check` on every file you changed and report success. Then stop and wait for Dan to test in a browser. Do not start the next phase until Dan says go.
- Each `js/NN-name.js` file must start with `'use strict';`.
- Classic `<script>` only. No `import` / `export`. Globals flow between files.
- New global mutable state goes in `js/05-state.js` or `js/07-globals.js`. Nowhere else.
- New file `js/75-v25-joint-popup.js` is required by the spec. Add the `<script src="js/75-v25-joint-popup.js"></script>` line to `dev/index.html` after `js/74-v26-bb-rail.js`. Don't reuse a retired number.
- Update `CHANGELOG.md` with a one-line entry per phase.
- **Do not commit, push, branch, or stage anything.** Leave the working tree clean.
- **Do not** fix any of the Known Issues listed in `CLAUDE.md` — those are separate tickets.
- **Do not** refactor `js/39-events.js` beyond the minimum addition the spec requires. It's a Phase-2 target in the playbook; this build adds to it, doesn't reorganise it.
- Keep additions to `js/39-events.js` minimal. The popup and pick-mode state machine live in `js/75-v25-joint-popup.js`, not inside the events file.
- Use the existing variable conventions and helper functions wherever they fit. Don't reinvent geometry primitives — `_v25SegSegIntersect`, `v25FirstSegPolyHit`, `v25Mem2WorldOutline`, `v25Mem2WorldCentreline`, `real2px`, `px2real` are all there.
- Lineweights must use the `LW` constants. Colours must come from CSS variables via `getComputedStyle` (see how `drawMem2D` does it).
- Joint mutations must go through the existing `undo` path. `js/72-v25-options-bar.js` wraps `undo` and `v25Add`; honour that wrapper.

## Phases (per the spec, Section 11)

1. Data model + save/load migration. Joints exist in data; no render changes. Acceptance: round-trip a legacy file.
2. Mitre joint rendering (2-way). Bisector cap in `v25Mem2ResolveCap`. Placement creates 2-way mitre joints on end-to-end contact. Acceptance: reproduces the "MITRE JOINT MODE" sketch in Dan's markup.
3. Joint popup + Priority mode (2-way). New `js/75-v25-joint-popup.js`. Joint hit-test. Dblclick hook. Priority pick loop with flash highlight. Cap plate rendering. Acceptance: reproduces the "PRIORITY MODE" sketch.
4. N-way joints. Auto-promote on third member. Reorder controls in the popup. Acceptance: reproduces Dan's 3-way truss sketch.
5. Inspector parity + DXF cap plate emission.
6. Polish — undo coverage, weld type override, plate-thickness catalogue dropdown.

After each phase, give me:
- A short bullet list of what changed (files + LOC).
- The acceptance check from the spec, with how you've verified it.
- Anything you noticed that wasn't in the spec.

## What to do if you hit something unexpected

- Spec ambiguity → stop, quote the ambiguous lines, ask Dan.
- A Known Issue blocks progress → flag it, propose a minimal local workaround, ask before going further. Do not "drive-by fix" Known Issues.
- A geometry edge case (parallel members, zero-length cap, degenerate joint) → handle it defensively (bail out cleanly, return null, fall back to legacy render), don't crash. Document the case in CHANGELOG.

## What "done" looks like for the whole build

Every acceptance criterion in Section 12 of `MITRE_PRIORITY_JOINTS_BUILD.md` passes when tested manually in `dev/index.html` against the five fixture sketches Dan will prepare (Section 15). No console errors. No DXF/PDF regressions on existing files.

Start by reading `CLAUDE.md` and `MITRE_PRIORITY_JOINTS_BUILD.md`, then give me your ≤200-word summary as described above. Wait for confirmation before Phase 1.

===PROMPT END===

---

## How to use this prompt

1. Open a new Claude Code chat in the repo root: `/Users/danielmccarron/Documents/GitHub/engineering-apps/2D-Details`.
2. Paste the block above (between the markers) as the first message.
3. Claude Code will read the playbook + spec and report back with a summary. Verify the summary makes sense before approving Phase 1.
4. After each phase, manually open `dev/index.html` and test the acceptance criterion from the spec. Approve before moving on.
5. After all phases are approved in dev/, mirror dev/ → root per `CLAUDE.md` ("Mirroring `dev/` → root").

## Notes

- The prompt deliberately makes Claude Code stop and ask before Phase 1. This guards against it misreading the spec and writing 400 LOC the wrong way.
- The prompt forbids drive-by fixes to Known Issues. Without that line, agentic coders tend to "tidy" things like the double `v25Mem2Thickness` definition and quietly change unrelated behaviour.
- The prompt requires `node --check` per file per phase. That's the only safety net on a no-build, no-test codebase right now.
