# StructDraw — Timber Screw Connection Designer

> **v1 target: Rothoblaas HBS Plate, steel‑to‑timber, elevation view.**
> Feature planning folder. Pre‑implementation — no code written yet.
> Last updated: 2026‑05‑18

---

## TL;DR for a fresh Claude Code session

You're picking this up cold. Do this in order:

1. **Read the project root `CLAUDE.md`** — workflow rules (edit `dev/` only, classic `<script>` files, no build step, Australian Standards, metric), file conventions, the 74‑file numbered structure of `js/`. Non‑negotiable.
2. **Read this README end‑to‑end.**
3. **Read `01-domain-knowledge.md`** — the engineering rules. You cannot start coding without this; the rules dictate the data model.
4. **Skim `04-catalogues.md`** — the transcribed Rothoblaas tables. This is the data layer's source of truth.
5. **Check `08-open-questions.md`** — if Dan hasn't answered any of these, ask him before writing code.
6. **Open `07-build-plan.md` Phase 0** and start.

After every phase, update `07-build-plan.md` with what was completed, what deviated, and what came up. Append findings (ETA quirks, EC5 footnotes, edge cases discovered while implementing) to `01-domain-knowledge.md` so the next session inherits them.

---

## The feature in one paragraph

A first‑class screw‑to‑timber connection designer inside StructDraw. The engineer draws a timber column in elevation, drops a steel plate on its face, places Rothoblaas HBS plate screws through the plate into the timber, and sets the connection's load vector. The tool live‑checks minimum spacings (a₁, a₂), end distances (a₃,t / a₃,c), edge distances (a₄,t / a₄,c), effective number of screws for group action (n_ef), and design shear capacity vs applied load — all per the Rothoblaas ETA‑11/0030 rule set cross‑referenced to EN 1995‑1‑1. Failing dimensions are flagged on canvas with red leaders; the inspector panel shows per‑screw breakdown and group utilisation. After v1 the same architecture extends to timber‑to‑timber, CLT, and other fastener systems.

---

## v1 scope

**In scope:**
- One **timber column** in **elevation only** (grain along the long axis of the rectangle, member drawn as a rectangle in view space).
- One **steel plate** drawn over the column's face (rectangular; thickness as a numerical property; not as a 3D body).
- **Rothoblaas HBS Plate screws** at Ø8, Ø10, Ø12 mm in the lengths listed in the ETA (see `04-catalogues.md` for the full geometry table).
- **Steel‑to‑timber** rules from p. 215 of the HBS Plate data sheet, both **with and without pre‑drilling** (toggle on the connection).
- A single **load vector** on the connection (magnitude in kN, direction as a 2D unit vector in view space; α computed from grain direction).
- The six edge/spacing checks per screw, pair‑wise checks between every pair of screws in the connection, n_ef for rows along grain.
- **Design shear capacity** by interpolating between the α=0° and α=90° tables on pp. 216–217, applying k_mod (from service class + load duration), γM = 1.3, k_dens for the timber's density class, and n_ef for the group.
- **Live red‑leader visualization** of failing dimensions on canvas.
- **Inspector panel** showing per‑screw check breakdown and group utilisation.

**Out of scope for v1 (the v1.x roadmap):**
- Plan view of the same connection → v1.1
- Timber‑to‑timber connections (trivial 1.5× a₁/a₂ modifier on top of v1) → v1.1
- CLT (different rule set, see p. 219) → v1.2
- Sandwich plates as structural input → v1.3 (drawing‑only in v1)
- Other fastener types (coach screws, washers, glued‑in rods)
- Axial pull‑out, combined shear+tension (Fv,d/RV,d)² + (Fax,d/Rax,d)² check
- Auto‑arrange / auto‑grid placement → v1.1
- Multi‑screw drag‑select → v1.1
- DXF/PDF export of the screw schedule (uses existing export pipeline; no new work)

**v1 success criteria:**
1. Dan's worked example (12 mm HBS, 6 screws in 3 rows × 2 columns at 60 mm × 100 mm, vertical load on plate, predrilled, see `09-test-cases.md`) reproduces with all six edge checks passing per his hand calc, and n_ef = 1.86 for each row.
2. Switching pre‑drilling off increases the required spacings as per the upper p. 215 table.
3. Rotating the load vector to α = 90° (horizontal) reclassifies which edges are stressed vs unloaded and changes the required values correctly.
4. The capacity output matches a Rothoblaas MyProject calculation (or hand calc against pp. 216–217) for the same inputs to within ~2 % (interpolation tolerance).

---

## Why this matters

Today, Dan does these by hand: draw to scale in Bluebeam, measure six distances per screw, look up six required values per screw, look up capacity, apply n_ef, apply k_mod, check utilisation. For a 6‑screw connection that's ~60 manual lookups per design iteration. When the layout changes (rotate the plate, swap screw size), it all redoes. This feature collapses that to live feedback while drawing.

The quality bar for the visual output is the **STP Typical Structural Details PDF page 85, details 6011.1–6011.6** referenced in the project `CLAUDE.md`.

---

## Folder map

| File | Purpose |
|---|---|
| `README.md` | this file — start here |
| `01-domain-knowledge.md` | Rothoblaas + EN 1995‑1‑1 + ETA‑11/0030 rule structure; all engineering facts |
| `02-data-model.md` | entity schemas: TimberMember, SteelPlate, Screw, Connection, catalogue entries |
| `03-rule-engine.md` | the check algorithm — inputs, outputs, edge classification, multiplier chain |
| `04-catalogues.md` | transcribed Rothoblaas tables (geometry, spacing, capacity, n_ef, k_dens) |
| `05-architecture.md` | integration with the existing 74‑file numbered structure; new files; edits to existing |
| `06-ux.md` | tool palette, interaction patterns, dimension display, inspector layout |
| `07-build-plan.md` | phased work plan with concrete tickets per phase |
| `08-open-questions.md` | design decisions still to land; ask Dan before coding |
| `09-test-cases.md` | verification cases including Dan's worked example with expected numbers |

---

## Workflow rules (from project root `CLAUDE.md`)

These are non‑negotiable for any session working on this feature:

1. **Edit `dev/` only.** Never touch the released root files (`index.html`, `css/`, `js/`) directly. After Dan tests in a browser and approves, mirror `dev/` → root with the helper sequence in `CLAUDE.md`.
2. **Dan handles all git.** Don't stage, commit, push, or branch. Leave the working tree clean.
3. **No build step.** Classic `<script>` files only — no modules, no bundler. Three.js r128 and jsPDF 2.5.1 via CDN.
4. **Metric only.** Y up in world, down on canvas.
5. **Australian Standards + relevant EN/ETA** only.
6. **Each `js/NN-name.js` starts with `'use strict';`.** Per‑file strict mode.
7. **Bug fixes don't bundle with refactors.** Each PR is one concern.
8. **Globals go in `dev/js/07-globals.js`** — not scattered.
9. **Update `CHANGELOG.md`** with a one‑line entry per user‑visible change.

When in doubt, re‑read project root `CLAUDE.md`. It's authoritative.

---

## Current status (2026‑05‑18)

- ✅ Engineering rule research complete — Rothoblaas HBS Plate ETA‑11/0030 (pp. 212–221) reviewed in full; EN 1995‑1‑1 §8.5 / §8.7.2 / §8.3 cross‑referenced
- ✅ Dan's worked example verified end‑to‑end (12 mm HBS predrilled, 6 screws 3×2 at 60 mm × 100 mm, α = 0°, all six checks pass; n_ef = 1.86)
- ✅ Rule structure formalised (per‑edge classification by dot product of load with edge normal — see `03-rule-engine.md`)
- ✅ Data model drafted (see `02-data-model.md`)
- ✅ Architecture decided (new files 02b/02c/02d/75–79 — see `05-architecture.md`)
- 🔶 Open questions: Q2 (AU class scope) and Q5 (default screw) answered. Q1/Q8 (ε vs α in capacity tables) parked with conservative placeholder. Remainder non-blocking for Phases 1–3.
- ✅ **Phase 1 complete (2026-05-18)**: 4 catalogue files written and verified. All values in Dan's worked example reproduce exactly via console queries. See `07-build-plan.md` progress tracker.
- ⏳ Phase 2 next: entity types (TimberMember, SteelPlate, Screw drawing)

---

## Source documents and references

- **Rothoblaas HBS Plate technical data sheet** — Dan's uploaded PDF (`hbs-plate-en-technical-data-sheet.pdf`, 10 pp.). Tables transcribed into `04-catalogues.md`. Citation: pages 212–221 of the master Rothoblaas catalogue.
- **EN 1995‑1‑1** — §8.5 (bolts), §8.7.2 (laterally loaded screws), §8.3 (nails, for d ≤ 6 mm — informational, HBS is d ≥ 8 mm).
- **ETA‑11/0030** — the European Technical Assessment for HBS, referenced by Rothoblaas tables (citations in `01-domain-knowledge.md`).
- **Project root `CLAUDE.md`** — StructDraw playbook (workflow, file structure, quality bar).
- **STP Typical Structural Details PDF** — visual quality bar reference (page 85, details 6011.1–6011.6).

---

## Glossary

| Term | Meaning |
|---|---|
| **a₁** | min spacing parallel to grain (within a row along grain) |
| **a₂** | min spacing perpendicular to grain (between rows across grain) |
| **a₃,t** | min distance to **stressed end** (parallel to grain, end the load points toward) |
| **a₃,c** | min distance to **unloaded end** (opposite, parallel to grain) |
| **a₄,t** | min distance to **stressed edge** (perpendicular to grain, edge the load points toward) |
| **a₄,c** | min distance to **unloaded edge** (opposite, perpendicular to grain) |
| **α** | angle between load vector and grain direction (0° = parallel, 90° = perpendicular) |
| **ε** | angle between screw axis and grain direction (capacity tables on pp. 216–217 are at ε = 0° and ε = 90°) |
| **n_ef** | effective number of screws in a row parallel to grain (group reduction factor for shear) |
| **R_V,k** | characteristic lateral (shear) load‑bearing capacity per screw |
| **R_V,d** | design lateral capacity = R_V,k · k_mod / γM |
| **k_mod** | load‑duration × service‑class modifier on characteristic → design capacity |
| **γM** | partial safety factor for material (1.3 for connections per EN 1995‑1‑1 §2.4.1) |
| **k_dens** | density adjustment factor for ρₖ above 385 kg/m³ (table on p. 221) |
| **ρₖ** | characteristic density (kg/m³) |
| **ETA** | European Technical Assessment (HBS has ETA‑11/0030) |
| **SC1–SC4** | service class — humidity exposure (SC1 dry indoor → SC4 exterior). Drives k_mod. |
| **d (or d₁)** | nominal screw diameter (8, 10, 12 for HBS Plate) |
| **L** | total screw length |
| **b** | thread length |
| **S_PLATE** | thickness of the steel plate (drives the thin / intermediate / thick capacity tables) |

---

## Out‑of‑band notes for the next session

- Dan is a Senior Structural Engineer at Bligh Tanner (Brisbane). Output should be defensible in an audit. Show working, cite clauses.
- The user's preference is **accuracy over speed**. Verify before moving on. First‑principles thinking.
- This feature is on the path to a **commercial product** (StructDraw eventually sells to Australian structural engineers). Code quality, separability, and per‑customer branding paths matter.
- If anything in this folder conflicts with the project root `CLAUDE.md`, the project root wins. Flag the conflict back to Dan.
