# 09 — Test Cases

> Concrete verification fixtures with expected outputs. Used by the engine in Phase 4 of `07-build-plan.md` and by the test harness in Phase 8. Every test case has exact numerical expectations so we know whether the engine is correct or not.

All test cases are at view-local scale (mm). Member outlines are rectangles defined by `[u_min, v_min, u_max, v_max]`. Grain direction is a unit vector `(û_u, û_v)`. Load vector `F̂` is unit; magnitude separate.

---

## Test 1 — Dan's canonical worked example (PRIMARY)

This is the example Dan hand-checked. **If the engine doesn't reproduce this, v1 is not done.**

### Setup
- TimberMember: outline `[0, 0, 340, 1100]` (340 wide × 1100 tall column), grainDir = `(0, 1)`, class = `GL28h` (ρₖ = 425, k_dens,v = 1.05)
- SteelPlate: outline approx `[110, 200, 230, 1100]` (120 wide × 900 tall plate covering most of column face), thickness = 10 mm
- 6 screws of spec `HBSPL12200` at positions (u, v):
  - s1: (120, 200)
  - s2: (220, 200)
  - s3: (120, 260)
  - s4: (220, 260)
  - s5: (120, 320)
  - s6: (220, 320)
  - (i.e. two columns at u = 120 and u = 220 = a₂ = 100 mm apart; three rows along grain at v = 200, 260, 320 = a₁ = 60 mm apart)
  - Bottom edge of column at v = 0. So s1 is 200 mm from bottom (a₃,t direction).
  - Top edge at v = 1100. So s5 is 1100 − 320 = 780 mm... wait, the original sketch has 900 mm to top. Recheck: column total height should be 60 + 60 + 200 = 320 + remaining top space + 200 below = …

  **Geometric setup from Dan's sketch**: 200 (below s1) + 60 (s1→s3) + 60 (s3→s5) + 900 (above s5) = 1220 total column height. Adjust outline to `[0, 0, 340, 1220]` and s5 at v = 320. Then s5 to top = 1220 − 320 = 900 ✓.

- Connection: front = plate, rear = column, type = steel-to-timber, preDrilled = true, F_d = 25 kN, F̂ = `(0, -1)`, loadCase = medium-term, serviceClass = SC1

### Expected derived
- α = 0° (load parallel to grain — F̂ = (0,−1), û = (0,1), angle = 180°, normalised to [0,90°] = 0°)
- ε = 90° (screw axis is into the page, grain in‑plane, so perpendicular)
- k_mod = 0.80 (Table 3.1, SC1 × medium-term)
- γM = 1.3
- k_dens,v = 1.05

### Expected edge classifications (per `03-rule-engine.md` §3)
- Bottom edge (n̂ = (0, −1)): F̂·n̂ = +1 → **stressed end** → a₃,t = 12d = 144 mm
- Top edge (n̂ = (0, +1)): F̂·n̂ = −1 → **unloaded end** → a₃,c = 7d = 84 mm
- Left edge (n̂ = (−1, 0)): F̂·n̂ = 0 → **unloaded side** → a₄,c = 3d = 36 mm
- Right edge (n̂ = (+1, 0)): F̂·n̂ = 0 → **unloaded side** → a₄,c = 3d = 36 mm

### Expected per-screw edge applied values

For screw s1 at (120, 200):
| Edge | Applied | Required | Pass |
|---|---|---|---|
| Bottom (a₃,t) | 200 | 144 | ✓ |
| Top (a₃,c) | 1220 − 200 = 1020 | 84 | ✓ |
| Left (a₄,c) | 120 | 36 | ✓ |
| Right (a₄,c) | 340 − 120 = 220 | 36 | ✓ |

For screw s5 at (120, 320):
| Edge | Applied | Required | Pass |
|---|---|---|---|
| Bottom (a₃,t) | 320 | 144 | ✓ |
| Top (a₃,c) | 1220 − 320 = 900 | 84 | ✓ |
| Left (a₄,c) | 120 | 36 | ✓ |
| Right (a₄,c) | 220 | 36 | ✓ |

All other screws similarly pass.

### Expected pair-wise

a₁_req = 5·12·0.7 = 42 mm; a₂_req = 3·12·0.7 = 25.2 mm.

15 pairs total. Each pair is one of:
- Within a row (Δv = 0, Δu = 100): |Δu| = 100 ≥ 42 → pass (a₁ satisfied)
- Within a column (Δu = 0, Δv ∈ {60, 120}): |Δu| = 0 < 42 BUT |Δv| = 60 or 120 ≥ 25.2 → pass (a₂ satisfied)
- Diagonal (Δu = 100, Δv ∈ {60, 120}): both ≥ requireds → pass

All 15 pairs pass.

### Expected n_ef

Two rows along grain (column u = 120 and column u = 220, each with 3 screws at v = 200, 260, 320).
For each row: n = 3, a₁ = 60 = 5d. From the table: n_ef = 1.86.

### Expected capacity

- CapacityTable lookup at HBSPL12200 / S_PLATE = 10: from p. 216 (ε = 90°), R_V,90,k = 12.99 kN
- (Pending Q1: if ε is screw‑to‑grain angle and α matters separately, this value applies for α = 90°. For α = 0° we'd need a separate value or interpolation. Provisional v1: use 12.99 for all α.)
- R_V,k = 12.99 kN
- k_dens,v = 1.05 → R'_V,k = 13.64 kN
- k_mod = 0.80, γM = 1.3 → R_V,d = (0.80 · 13.64) / 1.3 = 8.39 kN per screw
- Group: 2 rows × n_ef(=1.86) × 8.39 = 31.21 kN total
- η = 25 / 31.21 = **0.80** → PASS

### Expected overall: PASS

### Expected warnings
- "Using p. 216 R_V,90,k for all α — see Q1 in 08-open-questions.md until resolved"
- "GL28h ρₖ = 425 > base 385; k_dens = 1.05 applied"

---

## Test 2 — Same as Test 1 but α = 90° (horizontal load)

### Change
- F̂ = `(1, 0)` (load horizontal, perpendicular to grain)

### Expected derived
- α = 90°
- Edge classifications change:
  - Bottom (n̂ = (0,−1)): F̂·n̂ = 0 → **unloaded end** → a₃,c = 7d = 84 mm
  - Top (n̂ = (0,+1)): F̂·n̂ = 0 → **unloaded end** → a₃,c = 84 mm
  - Left (n̂ = (−1, 0)): F̂·n̂ = −1 → **unloaded side** → a₄,c = 3d = 36 mm
  - Right (n̂ = (+1, 0)): F̂·n̂ = +1 → **stressed side** → a₄,t = 7d = 84 mm

### Required values at α = 90° (from `04-catalogues.md` §2.2 lower table)
- a₁_req = 4·d·0.7 = 33.6 mm (was 42)
- a₂_req = 4·d·0.7 = 33.6 mm (was 25)
- a₃,t_req = 7d = 84 mm (was 144)
- a₃,c_req = 7d = 84 mm (was 84 — unchanged)
- a₄,t_req = 7d = 84 mm (was 36)
- a₄,c_req = 3d = 36 mm (was 36 — unchanged)

### Expected checks

For screw s1 at (120, 200):
- Bottom (now a₃,c = 84): applied 200 ≥ 84 → pass
- Top (a₃,c = 84): applied 1020 ≥ 84 → pass
- Left (a₄,c = 36): applied 120 ≥ 36 → pass
- Right (a₄,t = 84): applied 220 ≥ 84 → pass

For screw s2 at (220, 200):
- Right (a₄,t = 84): applied 340 − 220 = 120 ≥ 84 → pass

All edges pass for all screws.

### Pair-wise

- Within column (Δu = 0, Δv = 60): |Δv| = 60 ≥ a₂_req = 33.6 → pass
- Across row (Δu = 100): pass

### n_ef
- Now we have rows in the *cross-grain* direction... wait, no. n_ef applies to rows **along grain** regardless of load direction. The geometry is unchanged. So still 2 rows along grain at a₁ = 60 mm, n = 3, n_ef = 1.86.

### Capacity
- At α = 90°: use p. 216 R_V,90,k = 12.99 kN (same as Test 1)
- Same multiplier chain → R_V,d = 8.39 kN/screw → group 31.21 kN → η = 0.80 → PASS

### Expected overall: PASS

---

## Test 3 — Same as Test 1 but pre-drilling OFF

### Change
- `preDrilled = false`

### Required values at α = 0° (from `04-catalogues.md` §2.1 upper table)
- a₁_req = 12·d·0.7 = 100.8 mm (was 42)
- a₂_req = 5·d·0.7 = 42 mm (was 25)
- a₃,t_req = 15d = 180 mm (was 144)
- a₃,c_req = 10d = 120 mm (was 84)
- a₄,t_req = 5d = 60 mm (was 36)
- a₄,c_req = 5d = 60 mm (was 36)

### Expected checks
For screw s1 at (120, 200):
- Bottom (a₃,t = 180): applied 200 ≥ 180 → pass (barely!)
- Top (a₃,c = 120): applied 1020 ≥ 120 → pass
- Left (a₄,c = 60): applied 120 ≥ 60 → pass
- Right (a₄,c = 60): applied 220 ≥ 60 → pass

Pair-wise:
- Within row (Δu = 100, Δv = 0): |Δu| = 100 < a₁_req = 100.8 (!) AND |Δv| = 0 < a₂_req = 42 → **FAIL** by 0.8 mm
- Within column (Δu = 0, Δv = 60): |Δu| = 0 < 100.8 AND |Δv| = 60 ≥ 42 → pass (a₂ satisfied)

### Expected overall: FAIL — by 0.8 mm on the within-row a₁ spacing. (Educational: pre-drilling makes a real difference.)

Expected fail message: "Pair (s1, s2): grain-parallel spacing = 100 mm, just below required 100.8 mm. Either enable pre-drilling or increase spacing by 0.8 mm."

---

## Test 4 — Timber-to-timber (v1.1 scope — placeholder)

Same as Test 1 but front = TimberMember (not SteelPlate). Apply 1.5× modifier to a₁, a₂:

### Required values
- a₁_req = 42 × 1.5 = 63 mm
- a₂_req = 25 × 1.5 = 37.8 mm

### Expected checks
- Within row (Δu = 100): 100 ≥ 63 → pass
- Within column (Δv = 60): 60 < 63 (!) → FAIL by 3 mm

Educational outcome: a layout that passes for steel-to-timber may fail for timber-to-timber.

### Note: v1.1 only. v1 should reject timber-to-timber connectionType with an explicit "not yet supported" error.

---

## Test 5 — Douglas fir modifier (v1.x)

Same as Test 1 but `class.species = 'doug-fir'`. Apply 1.5× to a₁, a₃,t, a₃,c:

### Required values
- a₁_req = 42 × 1.5 = 63 mm
- a₃,t_req = 144 × 1.5 = 216 mm
- a₃,c_req = 84 × 1.5 = 126 mm

### Expected checks
- s1 bottom: applied 200 < 216 → FAIL by 16 mm

Educational outcome: Doug fir needs the screws further from the loaded end.

---

## Test 6 — Edge case: F̂ exactly perpendicular to a side edge

Same as Test 1 but F̂ = `(1, 0)` (horizontal load).

Already covered in Test 2. Right side is stressed (a₄,t = 84). Left is unloaded (a₄,c = 36).

---

## Test 7 — Capacity FAIL (high load)

Same as Test 1 but F_d = 100 kN (instead of 25).

### Expected
- η = 100 / 31.21 = 3.20 → **FAIL**
- Inspector message: "η = 3.20 — connection is overloaded by 220 %. Options: add ~14 more screws (n = 20), upgrade to deeper embedment, or reduce load to ≤ 31 kN."

---

## Test 8 — Out-of-table plate thickness

Same as Test 1 but plate thickness = 7 mm (between tabulated values 6 and 8).

### Expected
- CapacityTable lookup: 6 mm gives R_V,k = 9.41, 8 mm gives 12.05. Linear interp at 7: ≈ 10.73.
- Or per Rothoblaas table semantics (step function): use nearest = 6 mm (more conservative) → 9.41.

**Engine decision (TBD)**: linear interp vs step. Recommendation: linear interp, with warning "interpolated between S_PLATE = 6 and 8 mm tabulated values."

---

## Test 9 — Single screw (no pair check, no n_ef)

Same as Test 1 but only s1 placed.

### Expected
- 0 pair checks
- 1 row of n = 1 → no n_ef applies → R_V,d_total = R_V,d_per_screw = 8.39 kN
- η = 25 / 8.39 = 2.98 → FAIL

---

## Test 10 — Screw outside outline (warn but compute)

Same as Test 1 but s4 moved to (400, 260) — outside the column (column width 340).

### Expected
- s4 right-edge applied: 340 − 400 = −60 (negative)
- Warning: "Screw s4 placed outside timber outline."
- Engine still computes; check shows applied = −60 < required = 36 → FAIL

---

## Test 11 — Mixed screw diameters (error)

Same as Test 1 but s1–s3 are HBSPL12200, s4–s6 are HBSPL10180.

### Expected
- `overall = 'ERROR'`
- Message: "Mixed screw diameters in connection — v1 requires uniform diameter."

---

## Test 12 — Service class change

Same as Test 1 but serviceClass = SC3.

### Expected
- k_mod for SC3 medium-term = 0.65 (not 0.80)
- R_V,d_per_screw = (0.65 × 13.64) / 1.3 = 6.82 kN
- Group total = 2 × 1.86 × 6.82 = 25.37 kN
- η = 25 / 25.37 = 0.99 → PASS (just barely!)

---

## Test 13 — Load duration change

Same as Test 1 but loadCase = permanent.

### Expected
- k_mod for SC1 permanent = 0.60
- R_V,d_per_screw = (0.60 × 13.64) / 1.3 = 6.30 kN
- Group total = 2 × 1.86 × 6.30 = 23.42 kN
- η = 25 / 23.42 = 1.07 → FAIL (permanent load with same forces overloads)

---

## How to use these tests

Each test is a tuple (inputs, expected_outputs). The test harness in `dev/test/test-rules.html` (Phase 8 of `07-build-plan.md`) iterates them, calls `checkConnection(...)`, and asserts:

```
for test in TESTS:
    result = checkConnection(test.input)
    assert result.overall == test.expected.overall
    for each expected_edge_check:
        actual = find_in result.edgeChecks[screw][edge]
        assert abs(actual.required - expected.required) < 0.01
        assert abs(actual.applied - expected.applied) < 0.01
        assert actual.pass == expected.pass
    assert abs(result.capacity.eta - test.expected.eta) < 0.01
    assert result.capacity.pass == test.expected.pass
```

Tolerance: 0.01 absolute on dimensions (sub-millimetre) and 0.01 absolute on η.

---

## Acceptance threshold for v1

Phase 4 (engine) is done when: **Test 1, Test 2, Test 3, Test 7, Test 9, Test 11, Test 12, Test 13 all pass**.

Tests 4, 5, 6, 8, 10 are v1.x extensions.

Test 1 is the gate — without it, nothing else matters.
