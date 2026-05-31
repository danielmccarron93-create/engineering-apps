# 08 — Open Questions

> Design decisions that need Dan's input before Phase 1 of `07-build-plan.md`. Each Q has a recommendation; mark **ANSWER** below when Dan responds.

If a Q is unanswered, a fresh Claude Code session **must not** start the corresponding code work — it'll guess and we'll have to redo it.

---

## Q1 — ε meaning in pp. 216–217 capacity tables

**Question**: in the Rothoblaas tables for steel‑to‑timber on pp. 216–217, the header says "ε = 90°" (p. 216) and "ε = 0°" (p. 217), and the values are labelled R_V,90,k and R_V,0,k. Is **ε** the *screw‑to‑grain angle* (screw axis vs grain) or the *load‑to‑grain angle* (force direction vs grain)? If ε is the screw axis angle, then there's no α (load angle) dimension in the tables — does Rothoblaas assume α = ε? Or is the table's R_V valid for any α at that ε?

**Why it matters**: drives whether we interpolate between two tables for general α, or use a single table directly. Affects Step 8 of `03-rule-engine.md`. Currently the engine spec is **conservative**: use p. 216 R_V,90,k for all α as a placeholder until clarified.

**Recommendation**: read the Rothoblaas Smartbook (Timber Screws) referenced on p. 221, or run a check through Rothoblaas MyProject software for a known geometry at α = 0° and α = 90°, compare results.

**ANSWER**: _(awaiting Dan)_

---

## Q2 — Australian timber class equivalence

**Question**: the data sheet ships with European strength classes (C24, C30, GL24h…GL32h). Australian structural timber uses F‑grades (F4, F5, F7, F11, F14, F17, F22, F27, F34) for sawn and MGP10/MGP12/MGP15 for machine graded, plus GL grades that mostly align with EU. What's Dan's preferred mapping for v1?

**Why it matters**: drives the TimberClass catalogue contents in `02b-data-timber.js` and the inspector dropdown.

**Recommendation**: ship v1 with EU classes only (GL24h, GL26h, GL28h, GL30h, GL32h, C24, C30). Add Australian classes in v1.1 with explicit equivalence: F17 ≈ C24, F22 ≈ C30, F27 ≈ GL28h (approximate). Dan to confirm or revise.

**ANSWER**: _(awaiting Dan)_

---

## Q3 — k_mod default selection

**Question**: every connection needs (service class, load duration) → k_mod. What's the sensible default for an Australian structural engineer building a typical multi-storey timber portal?

**Why it matters**: drives the default value when a Connection is first created. If the default is wrong by a factor of 1.5, the engineer will dismiss the tool.

**Recommendation**: default SC1 (most building interiors) + medium-term (imposed live load) → k_mod = 0.80. This matches the typical k₁ regime in AS 1720.1. Editable on the connection.

**ANSWER**: _(awaiting Dan)_

---

## Q4 — Schema versioning approach

**Question**: project root `CLAUDE.md` known-issue #5 flags "no schema version on the .sd2.json save format." We're going to bump to schemaVersion: 2 for this feature. Is now the right time to also retrofit a load-time migrator for v1 → v2 files? Or wait until v2 is widely used?

**Why it matters**: if we don't do it now, every future schema change accumulates migration debt.

**Recommendation**: add `schemaVersion` field and a no-op migration for v1 → v2 (since v1 files have no Connections). Lay the groundwork for future migrations as a Phase 2 wishlist item.

**ANSWER**: _(awaiting Dan)_

---

## Q5 — Default screw spec for the screw tool

**Question**: when the user picks the HBS screw tool fresh, what's the default? HBSPL12200? HBSPL10100?

**Why it matters**: small UX detail but matters for first impression.

**Recommendation**: HBSPL12200 (Ø12 × 200 mm) — it's a versatile size for typical 200‑wide glulam beams and was the size in Dan's worked example.

**ANSWER**: _(awaiting Dan)_

---

## Q6 — α boundary condition (F̂·n̂ exactly zero)

**Question**: when the load is purely parallel to grain (α = 0°), the two side edges of the timber have F̂·n̂ = 0 — neither stressed nor unloaded strictly. `01-domain-knowledge.md` §5 currently maps this to "unloaded" (a₄,c). Is this the right call?

**Why it matters**: edge classification affects the required spacing at boundary load angles.

**Recommendation**: stick with "unloaded at boundary" because that's what Dan's hand calc does (he used a₄,c = 3d = 36 mm for both side edges of the column at α=0°, and got PASS). Confirm.

**ANSWER**: _(awaiting Dan)_

---

## Q7 — Single-load-case scope for v1

**Question**: in v1, the Connection has one load vector. In reality a connection sees multiple load cases (dead, live, wind, seismic) with different magnitudes and possibly different directions. Each gets its own k_mod (different load duration), so different design capacities.

**Why it matters**: governs whether v1 is "a single‑case checker" or "a multi‑case checker." Multi‑case adds significant UX (load case list, governing case identification).

**Recommendation**: v1 is single‑case. The engineer manually iterates between load cases by changing the load and re‑checking. v1.x adds load‑case list.

**ANSWER**: _(awaiting Dan)_

---

## Q8 — α‑interpolation on capacity (linked to Q1)

**Question**: assuming Q1 resolves that ε is the screw‑to‑grain angle and α is unspecified in the capacity table, how do we compute capacity at intermediate α between 0° and 90°? Options:
- (a) interpolate linearly between two CapacityTable lookups (e.g. one labelled α=0° and one labelled α=90° if we can isolate them)
- (b) compute from first principles via EN 1995‑1‑1's embedment strength formula f_h,α,k = f_h,0,k / (k90·sin²α + cos²α) and Johansen's yield equations
- (c) call Rothoblaas MyProject API (probably not available outside their software)
- (d) use the more conservative of the two endpoint values (a worst‑case approach)

**Why it matters**: this is the difference between a capacity check that's exact at endpoints and conservative in between (option a) versus exact everywhere (option b) versus always conservative (option d).

**Recommendation**: (a) for v1 — it's defensible (Rothoblaas MyProject does similar), simple, and gives correct values at the table endpoints. v1.x can refine to (b) once we've validated against MyProject.

**ANSWER**: _(awaiting Dan)_

---

## Q9 — Plate-side checks

**Question**: the steel plate also has minimum bolt edge distances per AS 4100 §9.6 / EN 1993‑1‑8. The Rothoblaas tables only check the timber side. Engineers typically also need plate‑side checks. Is this in scope for v1?

**Why it matters**: completeness of the check. Without it, the engineer needs to mentally cross-check the plate side, defeating the purpose of the tool.

**Recommendation**: v1.2 adds plate-side checks. v1 explicitly flags in the inspector: "Plate‑side edge distances not checked — verify per AS 4100." Documented limitation.

**ANSWER**: _(awaiting Dan)_

---

## Q10 — γM vs φ (Eurocode vs AS framework)

**Question**: the Rothoblaas tables and the entire ETA design framework use EN 1995‑1‑1's partial factor approach (R_d = R_k · k_mod / γM). AS 1720.1 uses a capacity factor approach (φR_k). For an Australian engineer, do we present the result in EN style (η = F_d / R_d) or AS style (φ N* / N_capacity)?

**Why it matters**: which numbers the engineer is most familiar with. Affects the inspector display.

**Recommendation**: v1 presents η = F_d / R_V,d (Eurocode) with a footnote: "Method: EN 1995‑1‑1 / Rothoblaas ETA‑11/0030. AS 1720.1 governs by separate AS check if applicable." Australian engineers familiar with NCC Verification Method B1 design routes will accept this.

**ANSWER**: _(awaiting Dan)_

---

## Q11 — Detail naming conventions

**Question**: when saving a Connection to a detail library, what's the naming convention? "TimberConn‑01", "T2C‑HBS12‑6×2‑GL28h", or freeform user-named?

**Why it matters**: searchability if Dan builds a library of 50+ saved connections over time.

**Recommendation**: freeform with auto‑generated suggestion. The suggestion encodes the key parameters: e.g. "HBS12‑6@5d×8d‑GL28h‑PD" (Ø12, 6 screws, 5d × 8d grid, GL28h, pre-drilled). User can rename.

**ANSWER**: _(awaiting Dan)_

---

## Q12 — How does the existing app handle compound entities?

**Question**: the Connection is a "compound" entity that references other entities by ID. Does the existing app's selection model support clicking on a screw and getting a "this is part of Connection c1" hint? Or do screws and Connections live as completely separate selectable things?

**Why it matters**: drives the click‑hit‑test behaviour. If a screw is part of a Connection, clicking it could either (a) select the screw, (b) select the Connection, or (c) cycle between them.

**Recommendation**: cycle on repeated click (click screw once → select screw; click again → select parent Connection). Matches Bluebeam-style cycling. Verify with existing `10-bounds-hittest.js` behaviour.

**ANSWER**: _(awaiting Dan)_

---

## Q13 — Live recompute throttling

**Question**: during a drag of one screw, the engine recomputes every mouse-move event. For a 6‑screw connection that's fine. For a 30‑screw connection (future), perhaps too much. Should we debounce/throttle the recompute during drag, with a final accurate recompute on drag-end?

**Why it matters**: perceived UI responsiveness. If the user feels lag, they distrust the tool.

**Recommendation**: no throttle in v1 (engine is fast enough). Add throttle in v1.x only if profiling reveals it.

**ANSWER**: _(awaiting Dan)_

---

## Q14 — Are AS 1720.1's screw rules ever the right path?

**Question**: AS 1720.1 §4.4 has its own screw spacing and capacity rules (different from EN 1995 and Rothoblaas). Some engineers explicitly want to design Rothoblaas screws to AS 1720.1 rather than the ETA. Should v1 support an "AS 1720.1 mode" alongside the Rothoblaas ETA mode?

**Why it matters**: scope creep risk. Two rule paths to maintain.

**Recommendation**: v1 is ETA‑only. The Rothoblaas screws are designed per the ETA; engineers designing to AS 1720.1 should use generic coach screws or batten screws and rely on AS data. Document this in the inspector. v1.x can add AS 1720.1 mode if Dan needs it.

**ANSWER**: _(awaiting Dan)_

---

## Q15 — Live testing against Rothoblaas MyProject

**Question**: at some point during v1 development, we should run identical inputs through MyProject and compare. When? Phase 4 (engine ready)? Phase 8 (tests ready)?

**Why it matters**: discrepancies surface engine bugs. Earlier discovery = less rework.

**Recommendation**: Phase 4 — as soon as the engine runs end-to-end. Dan to provide MyProject output for the worked example.

**ANSWER**: _(awaiting Dan)_

---

## Status legend

- _(awaiting Dan)_ — blocking; do not start dependent code work
- _(parked)_ — non-blocking; v1.x or later
- _(answered: ...)_ — locked decision, move on
