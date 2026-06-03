# StructDraw — 2D-Mode Bolt: Orientation Presets + Section Clamping

Status: ✅ Ready to build
Last touched: 2026-05-31
Owner: Dan McCarron
Scope: Give 2D paper-space (V25) bolts the same icon-row orientation presets the members just got, plus make a bolt drawn in a section view clamp the already-drawn plate/steel thickness the way 3D-mode bolts do.

---

## TL;DR for a fresh chat

You're picking this up cold. Do this in order:

1. Read project root `CLAUDE.md` — workflow rules, the two-mode requirement, the "Adding a new member, fastener, or hatch type — integration checklist". Non-negotiable.
2. Read `PlannedBuilds/README.md` — the dashboard. Note `premium-textbox/` is mid-build and shares a few files (`69`, `71`, `72`, `74`, `45`, `index.html`) — different functions/branches, but rebase carefully if it lands first.
3. Read this README end-to-end.
4. Read `01-context.md` (how bolts work today, the two goals) and `02-design.md` (entity, catalogue, clamp detection, integration points + Files-touched).
5. Read `04-open-questions.md` — all resolved/recommended; nothing blocking.
6. If build chat: open `03-build-plan.md` and walk it phase by phase, browser-smoke-testing at each boundary.

> This folder was written fresh on 2026-05-31 from a focused plan chat. A much older, sprawling plan for the same idea is parked at `PlannedBuilds/(failed rebuild)/v25-2d-bolts/` — **ignore it**; it predates the live v2 plate path and the member orientation-presets feature, and Dan asked to start clean.

---

## The idea in one paragraph

The 2D-mode members (UB/UC/PFC/SHS/RHS…) recently gained **orientation preset icon rows** — a row of small icon buttons in the quick-options bar that let the user pick the standard orientation before placing (`js/72b-orientation-presets.js`). Bolts get the same treatment: a five-icon row — **end-on (circle), horizontal nut-right, horizontal nut-left, vertical nut-bottom, vertical nut-top** — so the engineer picks the bolt's direction and which side the nut sits, then places. On top of that, when a bolt is placed in a **section/side view**, it auto-detects the plate(s)/member(s) it crosses (which are always drawn first) and clamps their combined thickness — head + washers + nut, snapped to a standard AS 1252 length — exactly like the 3D-mode bolt. End-on bolts stay a plain circle (no clamp; plate thickness is unknown and irrelevant in that view). This is a new **v1** 2D paper-space entity, `bolt2`, living in `entities2D[viewKey]` and reusing the existing bolt drawing primitives and bolt-length maths.

---

## Why this matters

Cleat-plate and web-bolt details are the highest-frequency thing Dan draws — web side plates, baseplates, splices, back-to-back PFC webs. Every one needs a bolt in section with the head and nut clamping the right material at the right grip. Today, the only way to get that in StructDraw is to switch to 3D-model mode, build a 3D joint, and project a section — overhead that pushes Dan back to Bluebeam for small details. A 2D bolt that auto-grips the visible geometry produces a defensible AS 1101-quality detail directly on the V25 sheet in one click, and the orientation row makes nut-side and direction a visible, one-click choice instead of a mental translation.

Reference quality bar: **STP Typical Structural Details PDF page 85, details 6011.1–6011.6** — every cap-plate / baseplate / splice / WSP / tilt-up bolt on that page is drawn the way this feature will draw them.

---

## Confirmed scope (locked in the plan chat, 2026-05-31)

**In scope:**
- New `bolt2` 2D paper-space entity: `{ type:'bolt2', view, u, v, size, grade, cat, boltOrient, gripOverride? }`.
- Five orientation presets surfaced as an icon row in the quick-options bar: `end`, `h-nutR`, `h-nutL`, `v-nutB`, `v-nutT`.
- Renderer `drawBolt2D`: end-on → circle + crosshair (washer ring); section → chamfered-hex head + washers + threaded shank + nut + thread protrusion + dashed centreline, AS 1100/1101.
- Section auto-grip from the already-drawn 2D stack: member web/wall thickness via `v25Mem2Thickness`, v2 plate thickness; summed and centred; length snapped via `computeBoltLength` → `BOLT_LENGTHS`.
- Manual `gripOverride` in the Inspector as the guaranteed-correct escape hatch.
- 2D **Bolts** BB-rail tile rewired to arm the new `v25-bolt` tool (instead of the 3D `selectMemberByBolt` path).
- Selection/hit-test + move, Inspector panel, DXF emission, save/load (automatic via `entities2D`).

**Out of scope (defer):**
- Pixel-perfect washer-face snapping to each plate face (v1 centres the bolt on the clamped stack; exact per-glyph face alignment is a later refinement — drag + override cover it).
- SHS/RHS/CHS *through-bolt vs one-wall* UX nuance (wall thickness is still used; the one-wall case is a later decision).
- 3D-mode changes (bolts already clamp + orient from the model).
- Bolt groups / multi-bolt placement; auto-dropping a `boltCallout` label on placement; connection-builder macros emitting `bolt2`.

**v1 success criteria:**
1. Arm **Bolts** on a 2D sheet → five-icon orientation row appears; console clean.
2. End-on preset → circle + crosshair, selectable, labelled "M20".
3. Horizontal-section bolt across a PL 12 + member → head/washers/nut clamp the combined thickness; length is a standard `BOLT_LENGTHS` value.
4. Bolt through back-to-back PFC webs (section) → grip ≈ 2·tw, not the channel depth.
5. Nut-side flip (`h-nutR`↔`h-nutL`, `v-nutB`↔`v-nutT`) swaps head/nut ends; vertical orientation clamps correctly.
6. Inspector grip override updates the length; save→reload round-trips; DXF emits.

---

## Files touched (in released app)

See `02-design.md` for the full table. Headline: **new file `js/72c-v25-bolt.js`** (sibling to `72b`; the band-9 2D-mode reserved range `96–98` is taken by `premium-textbox`), plus thin inserts in `index.html`, `69`, `72`, `74`, `71`, `59`, `45`, and `CHANGELOG.md`.

---

## Folder navigation

| File | Purpose |
|---|---|
| `README.md` | this file — start here |
| `01-context.md` | how bolts render in 3D vs 2D today; why a new 2D entity; the two goals |
| `02-design.md` | entity schema, orientation catalogue, clamp-detection design, renderer, integration points, Files-touched |
| `03-build-plan.md` | four phases + progress tracker |
| `04-open-questions.md` | decisions (all resolved/recommended; nothing blocking) |

---

## Dependency / overlap with other in-flight ideas

- **`orientation-presets/`** (shipped/ready) — this feature mirrors its `.v25-orient-btn` row pattern but keeps its own `V25_BOLT_ORIENT` catalogue in the new file, so the member feature is untouched (no regression risk).
- **`premium-textbox/`** (🔨 building) — shares `index.html`, `69`, `71`, `72`, `74`, `45` but in different functions/branches. If it lands first, rebase the thin inserts; no logical conflict.

## How to start (copy-paste prompt for a fresh chat)

```
You're picking up the bolt-orientation-presets build idea for StructDraw.

1. Read /CLAUDE.md end-to-end (the project root playbook).
2. Read /PlannedBuilds/README.md (the dashboard).
3. Read /PlannedBuilds/bolt-orientation-presets/README.md and every other file in that folder.
4. Check /PlannedBuilds/bolt-orientation-presets/04-open-questions.md (nothing should be blocking).
5. BUILD: walk /PlannedBuilds/bolt-orientation-presets/03-build-plan.md phase by phase.
   Test in the browser at each boundary (copy repo to /tmp + python3 -m http.server —
   the iCloud path can't be served directly). Update the progress tracker after each phase.
```
