# 03 — Rule Engine

> The algorithmic core of the feature. Inputs, outputs, every step explicit. The engineering rules are in `01-domain-knowledge.md`; this file is the *algorithm spec*.

The engine is a pure function: given a Connection, return a structured result. It must be deterministic, fast (target: full check on every drag frame), and self-describing (the inspector reads the output as the "audit trail").

```
checkConnection(connection, model) → ConnectionCheckResult
```

No side effects. Caller (the renderer + the inspector) consumes the result.

---

## 1. Inputs (pulled from the Connection and the model)

From the Connection:
- `front` (steel plate or timber member ref)
- `rear` (timber member ref)
- `connectionType` (`steel-to-timber` | `timber-to-timber` | `steel-to-clt`)
- `preDrilled` (bool)
- `screws[]` (array of screw IDs)
- `load.F_d_mag`, `load.F_d_dir`, `load.loadCase`, `load.serviceClass`

From the model (resolved via refs):
- For each screw: its position, its ScrewSpec (catalogue)
- The rear member's outline, grainDir, TimberClass
- The front entity's geometry; if steel plate, its `thickness`
- Selected RuleSet (from connectionType + preDrilled + rear.class.family)
- The CapacityTable (from connectionType)
- The NefTable
- k_mod from EN 1995-1-1 Table 3.1 keyed by (serviceClass, loadCase)
- γM = 1.3 (constant for connections)
- k_dens from rear.class

---

## 2. Output

```js
ConnectionCheckResult = {
  connectionId: 'c1',
  timestamp: 1747576800000,
  ruleSetVersion: 'rothoblaas-hbs-plate-eta-11-0030-2019',

  // Derived geometric quantities
  alpha: 0,                         // load-to-grain angle [deg]
  epsilon: 90,                      // screw-to-grain angle [deg]
  loadGrainComponent: -1.0,         // F̂ · û  (signed)
  loadCrossGrainComponent: 0.0,     // F̂ · v̂

  // Per-screw edge-distance checks
  edgeChecks: [
    {
      screwId: 's1',
      results: [
        { ruleType: 'a3t', edgeId: 'bottom', applied: 200, required: 144, formula: '12·d', pass: true, severity: 'ok' },
        { ruleType: 'a3c', edgeId: 'top',    applied: 900, required: 84,  formula: '7·d',  pass: true, severity: 'ok' },
        { ruleType: 'a4c', edgeId: 'left',   applied: 120, required: 36,  formula: '3·d',  pass: true, severity: 'ok' },
        { ruleType: 'a4c', edgeId: 'right',  applied: 120, required: 36,  formula: '3·d',  pass: true, severity: 'ok' }
      ]
    },
    // ... per screw
  ],

  // Pair-wise spacing checks
  pairChecks: [
    {
      pair: ['s1', 's2'],
      du: 60, dv: 0,
      a1_req: 42, a2_req: 25,
      // Pass criterion: |du|≥a1_req OR |dv|≥a2_req
      pass: true,
      governing: 'a1',           // which condition was satisfied
      severity: 'ok'
    },
    // ... C(n,2) entries
  ],

  // n_ef per detected row along grain
  rowChecks: [
    {
      rowId: 'r1',
      screws: ['s1', 's2', 's3'],
      n: 3,
      a1_in_d: 5,                // 60 mm / 12 mm = 5d
      n_ef: 1.86
    },
    {
      rowId: 'r2',
      screws: ['s4', 's5', 's6'],
      n: 3,
      a1_in_d: 5,
      n_ef: 1.86
    }
  ],

  // Capacity calculation, fully traced
  capacity: {
    perScrew: [
      {
        screwId: 's1',
        Rvk_at_eps90_alpha0:   3.95,   // from CapacityTable p. 217 lookup
        Rvk_at_eps90_alpha90: 11.12,   // from CapacityTable p. 216
        Rvk_interp_alpha:      3.95,   // α = 0 → use alpha0 endpoint
        k_dens:                1.05,
        Rvk_dens_adjusted:     4.15,
        k_mod:                 0.60,
        gamma_M:               1.3,
        Rvd:                   1.91,   // per-screw design value [kN]
      },
      // ...
    ],
    groupReduction: [
      { rowId: 'r1', n: 3, n_ef: 1.86, R_row: 3.55 },   // n_ef × Rvd
      { rowId: 'r2', n: 3, n_ef: 1.86, R_row: 3.55 }
    ],
    R_V_d_total: 7.10,             // [kN]
    F_d_applied: 25.0,
    eta: 3.52,                     // 25 / 7.1 → FAIL (>1.0)
    pass: false
  },

  // Roll-up
  overall: 'FAIL',
  failingItems: [
    { kind: 'capacity', detail: 'η = 3.52 > 1.0' }
  ],
  warnings: [
    'n_ef table truncated at n = 5; this layout has n = 3 — table lookup OK',
    'Substrate GL28h has ρₖ = 425 > base 385; k_dens = 1.05 applied'
  ]
}
```

The output is the **single source of truth** for everything the inspector and canvas-overlay renderer display. No duplication of logic.

---

## 3. Algorithm

The engine runs in seven steps, in order. Each step's output is consumed by the next.

### Step 1 — Resolve the rule context

Decide which RuleSet, CapacityTable, and modifiers apply.

```
substrate_family = rear.class.family    // 'glulam' | 'solid-timber' | 'lvl-softwood' | 'clt'
ruleSet = selectRuleSet(connectionType, substrate_family, preDrilled)
capacityTables = selectCapacityTables(connectionType, substrate_family)
  // returns { eps0: <table>, eps90: <table> }
nefTable = selectNefTable(fastener_system)
k_mod = k_mod_lookup(load.serviceClass, load.loadCase)
gamma_M = 1.3
k_dens_v = rear.class.k_dens_v
isDouglas = (rear.class.species === 'doug-fir')
isTimberToTimber = (connectionType === 'timber-to-timber')
```

If no RuleSet matches: return result with `overall: 'ERROR'`, warning explaining why.

### Step 2 — Compute geometric reference frame on the rear member

```
û = rear.grainDir.normalized()
v̂ = perpendicular(û)        // 90° CCW
F̂ = load.F_d_dir.normalized()
α = angleBetween(F̂, ±û)     // 0..90° (use min of angle and 180-angle)
ε = angleBetween(screwAxis, û)
// For elevation view with screws driven into the page, ε = 90° (screws perpendicular to grain).
// For section view through the column, ε = 90° still (screws are still in-plane perpendicular).
// For other cases, the screw axis matters — but in v1 the screw is always perpendicular to the page
// so ε is determined by the relative orientation of grain and view normal.
// SIMPLIFICATION FOR v1: ε = 90° (steel plate on side of column, screws horizontal).
```

For v1, assume ε = 90° (steel plate on lateral face of column or beam). v1.x will support ε ≠ 90° (screws into end grain, inclined screws).

### Step 3 — Classify each edge of the rear member

For the rear member (rectangle in v1), compute the four edge outward normals:
```
edges = [
  { id: 'end+',  type: 'end',  n̂: +û },   // perpendicular to grain, positive grain direction
  { id: 'end-',  type: 'end',  n̂: -û },
  { id: 'side+', type: 'side', n̂: +v̂ },   // parallel to grain, perpendicular direction
  { id: 'side-', type: 'side', n̂: -v̂ }
]
```

For each edge, compute `F̂ · n̂`:
- if > 0 and type == 'end': **stressed end** → a₃,t applies
- if < 0 and type == 'end': **unloaded end** → a₃,c applies
- if = 0 and type == 'end': **unloaded** → a₃,c
- if > 0 and type == 'side': **stressed edge** → a₄,t applies
- if < 0 and type == 'side': **unloaded edge** → a₄,c applies
- if = 0 and type == 'side': **unloaded** → a₄,c

Annotate each edge with its applicable rule.

### Step 4 — Compute required values from the RuleSet

For the screw's diameter d, interpolate the RuleSet between α=0° and α=90°:
```
a1_req  = lerp(ruleSet.spacings.a1.atZero(d),  ruleSet.spacings.a1.atNinety(d),  α/90)
a2_req  = lerp(ruleSet.spacings.a2.atZero(d),  ruleSet.spacings.a2.atNinety(d),  α/90)
a3t_req = lerp(ruleSet.spacings.a3t.atZero(d), ruleSet.spacings.a3t.atNinety(d), α/90)
a3c_req = lerp(ruleSet.spacings.a3c.atZero(d), ruleSet.spacings.a3c.atNinety(d), α/90)
a4t_req = lerp(ruleSet.spacings.a4t.atZero(d), ruleSet.spacings.a4t.atNinety(d), α/90)
a4c_req = lerp(ruleSet.spacings.a4c.atZero(d), ruleSet.spacings.a4c.atNinety(d), α/90)
```

Apply modifiers:
```
if isDouglas:   a1_req *= 1.5; a3t_req *= 1.5; a3c_req *= 1.5      // p. 221 note
if isTimberToTimber: a1_req *= 1.5; a2_req *= 1.5                  // p. 221 note (v1.1)
```

If multiple screw diameters in one connection — error (out of v1 scope; require uniform d).

### Step 5 — Per-screw edge-distance checks

For each screw and each of the 4 edges:
- `applied` = signed distance from screw to edge along the edge's outward normal
- `required` = a₃,t / a₃,c / a₄,t / a₄,c as determined by Step 3
- `pass` = (applied ≥ required)
- `severity` = 'ok' if pass; 'fail' if applied < required

Emit one `edgeChecks` record per screw with four sub-results.

**Distance computation**: for a rectangular outline with vertices `[v0, v1, v2, v3]`, edge `e_i` has parametric form `(v_i, v_{i+1})` with outward normal `n̂_i`. Signed distance from point `p` to edge `e_i` is `(p - v_i) · n̂_i`. For an interior point of a convex polygon, all signed distances are positive. If any is negative → screw is *outside* the member → warning, but still report the value.

### Step 6 — Pair-wise spacing checks

For each pair (i, j), i < j:
```
Δ = p_j - p_i
Δu = Δ · û
Δv = Δ · v̂
pass = (|Δu| ≥ a1_req) || (|Δv| ≥ a2_req)
governing = which condition was satisfied (if any)
```

If both conditions fail → emit fail with both deltas + both requireds for the inspector.

### Step 7 — n_ef detection and per-row calculation

**Cluster detection algorithm**:
```
1. For each screw, compute u = screw.pos · û, v = screw.pos · v̂.
2. Group screws by v-coordinate using DBSCAN-style clustering with ε_v = a2_req/2.
   (Two screws are in the same row if their v-coords differ by < a2_req/2.)
3. For each cluster with ≥ 2 members:
   - Sort by u-coordinate
   - Consecutive spacings: a1[k] = u[k+1] - u[k]
   - Take a1 = min(a1[k]) (most conservative)
   - n = cluster size
   - n_ef = nefTable lookup at (n, a1/d), linear interpolation in a1/d
4. Single screws (clusters of 1): n_ef = 1 (no group reduction)
```

For Dan's example: v-coordinates {0, 100} → two clusters. Each has 3 screws at a1 = 60 = 5d. nefTable[3][5] = 1.86. ✓

### Step 8 — Capacity calculation

For each screw, look up R_V,k at both ε=90° endpoints (α=0° and α=90°) — wait, ε is fixed at 90° for v1. So we use the **ε=90° tables for α=0° and α=90° both**. The lookup keys are (screwSpec.id, plateThickness):

```
Rvk_alpha0  = capacityTable_eps90_alpha0.values[screwSpec.id][plateThickness]   // p. 217 with ε=90 column? — confirm in catalogue
Rvk_alpha90 = capacityTable_eps90_alpha90.values[screwSpec.id][plateThickness]  // p. 216
Rvk_interp  = lerp(Rvk_alpha0, Rvk_alpha90, α/90)
```

**Note on table cross-reference**: page 216 has ε=90° (the SCHEMATIC at top is the screw axis vs grain). Page 217 has ε=0° (screw aligned with grain — end-grain insertion). For Dan's case ε=90°, so use p. 216 throughout. *Both* α=0° and α=90° are columns within the p. 216 table — wait no, p. 216 has ONE column of values per screw × plate thickness, but does it represent α=0° or α=90°?

Looking at p. 216 header again: "ε = 90°" is shown in the geometry diagrams. The table gives `R_V,90,k` which is shorthand for "R_V when load is at 90° to grain". So **page 216 = ε 90° AND α 90° (load perp to grain)**.

Page 217 header: same ε = 90° geometry but `R_V,0,k` = load at 0° to grain.

**Wait — re-reading p. 217 header**: "ε = 0°". So page 217 has ε = 0° (screw aligned with grain) — that's end-grain insertion, not what we have. Let me re-check the PDF text.

From the transcribed PDF text in `04-catalogues.md` (file to be written):
- p. 216 STRUCTURAL VALUES | STEEL-TO-TIMBER, "ε = 90°" — this is the screw axis perpendicular to grain (typical case, side of column). The R_V,90,k value is the capacity in this configuration.
- p. 217 same but "ε = 0°" — screw axis parallel to grain (driven into end of column). Gives R_V,0,k.

So **ε is the screw axis vs grain**. Not α. And the table value is the capacity *in that geometry* for the unspecified α (which is presumably the load perpendicular to the screw axis, i.e. side-loaded).

**Conclusion for v1**: for ε = 90° (Dan's case), use p. 216 (R_V,90,k = capacity when load is perpendicular to grain) AND p. 217 (R_V,0,k = capacity when load is parallel to grain)... no, p. 217 is ε = 0° per the header. Hmm.

**Reconcile**: looking at Dan's own sketch and the schematic on pp. 216–217. The diagrams show a screw going into the side of a horizontal timber block, with F arrow either parallel or perpendicular to grain. ε denotes the angle between **the screw axis and the grain**. The label R_V,90,k means "lateral shear capacity when load is at 90° to grain" — the load direction is implicit in the diagram.

**HOLD — flag for verification before coding**. This needs Dan to confirm. The Rothoblaas naming convention `R_V,90,k` is ambiguous between "ε at 90°" and "α at 90°". My current best interpretation:

- **p. 216 (R_V,90,k, ε=90°)**: screw axis perpendicular to grain (typical side connection), load at 90° to grain (perpendicular). So screw axis IS perpendicular to load — standard lateral loading.
- **p. 217 (R_V,0,k, ε=0°)**: screw axis parallel to grain (end-grain insertion), load at 0° to grain (parallel). Screw axis IS parallel to load — *axial* loading on the screw, not lateral.

If that interpretation is right, then **only p. 216 is relevant for Dan's case** and we need to **interpolate in load angle α within that single table**. But the p. 216 table gives ONE capacity per (screwSpec, plate thickness) — no α dimension. So how do we account for load at general α?

**Possible resolutions**:
1. The R_V,90,k value is the capacity when ε=90°, AND it's already valid for general α (Rothoblaas computes the worst case in the table). v1 would use it directly with no α-interpolation.
2. The α-interpolation we need to do is BETWEEN tables on different pages — but pp. 216 and 217 differ in ε, not α.
3. There's a missing table somewhere giving R_V at intermediate α — we'd compute it via EN 1995-1-1's Johansen equations with embedment strength fhα,k = fh0,k / (k90·sin²α + cos²α).

**Decision pending Dan's input** — see `08-open-questions.md` Q8. For v1, **start by using p. 216 R_V,90,k as the capacity regardless of α**, with a clear inspector note. Then refine when Dan clarifies the interpretation. This is structurally conservative because at α = 0° (load parallel to grain) the actual capacity is *higher* per Rothoblaas's own MyProject software (we'd get more capacity by computing Johansen, but using R_V,90,k = the cross-grain value is conservative).

Apply the rest of the chain:
```
Rvk_dens = k_dens_v · Rvk_interp
Rvd_per_screw = (k_mod · Rvk_dens) / gamma_M
```

### Step 9 — Group total and utilisation

For each row with n_ef:
```
R_row_d = n_ef · Rvd_per_screw    (n_ef already accounts for group reduction)
```
For single screws (not in a row):
```
R_single_d = Rvd_per_screw
```
Total:
```
R_V_d_total = Σ R_row_d  +  Σ R_single_d
η = F_d_mag / R_V_d_total
pass_capacity = (η ≤ 1.0)
```

### Step 10 — Roll up overall result

```
overall = 'PASS' if (all edge checks pass) && (all pair checks pass) && (capacity passes)
        = 'FAIL' if (any check fails)
        = 'WARN' if (all pass but there are warnings — e.g. screw outside outline)
```

---

## 4. Performance budget

The engine runs on every drag frame. Target: < 5 ms for a typical 6-screw connection. For a 20-screw connection: < 20 ms.

- Edge checks: O(n_screws × n_edges) = O(n) where n_screws ≤ ~20 typical. Trivial.
- Pair checks: O(n_screws²) = O(400) for n = 20. Trivial.
- Cluster detection: O(n_screws²) worst case. Trivial.
- Capacity: O(n_screws) table lookups. Trivial.

No optimisation needed for v1. If we ever hit perf issues with 100+ screws, can move to spatial hashing — but that's well beyond engineer-day workflow.

---

## 5. Caching strategy

The CheckResult is cached on the Connection (`connection.checks`). Recompute is triggered by:
- Screw added / removed / moved
- Member outline changed
- Grain direction changed
- Load direction or magnitude changed
- Pre-drilling toggled
- Service class or load duration changed
- Screw spec changed
- Timber class changed

Anything else (e.g. layer visibility toggle) does not trigger recompute.

For the render loop: read from cache. Recompute is fired by event handlers (debounce 10 ms during drags to avoid mid-drag spam).

---

## 6. Determinism

For reproducibility (audit trail) the engine must be deterministic. No `Math.random`, no `Date.now()` except for the result timestamp. Floating-point ops use double precision and standard JS semantics; tolerances:

- Distance pass/fail: `applied ≥ required - 1e-6` (effectively integer-mm in practice, but allow sub-mm geometry)
- Cluster grouping: ε_v = a2_req / 2 (sharp threshold; small jitter in v-coord won't reclassify a row unless it's borderline)
- Unit vector normalisation: tolerance 1e-9 on |v|² = 1

---

## 7. Inspector contract

The inspector reads `connection.checks` and renders:

1. **Overall status badge** at top: PASS (green) / FAIL (red) / WARN (amber).
2. **Capacity panel**: applied F_d, design R_V,d total, η, pass/fail. With expandable "multiplier breakdown" showing k_mod, γM, k_dens, n_ef per row, R_V,k base.
3. **Per-screw distance panel** (one row per screw): four edge distances with applied/required/pass/formula. Failing rows highlighted red.
4. **Pair panel** (one row per failing pair): the two screws, Δu, Δv, a1_req, a2_req, governing condition. Passing pairs collapsed by default.
5. **Group reduction panel**: detected rows with n_ef.
6. **Warnings panel**: any flagged issues.

Every number traceable to a formula → engineer can audit before signing the detail.

---

## 8. Failure modes the engine must handle gracefully

| Situation | Handling |
|---|---|
| Connection has no screws | overall = 'WARN', message "Add screws to evaluate" |
| Connection has no load defined | overall = 'WARN', spacing checks still run (load-direction-dependent ones default to "stressed" everywhere — conservative), capacity check skipped |
| Mixed screw diameters in one connection | overall = 'ERROR', refuse to compute (v1 requires uniform d) |
| Screw outside rear member outline | warn but still compute (applied distance will be negative — show as such) |
| Rear member outline is not convex | warn (the dot-product edge-classification rule assumes convex) |
| TimberClass missing from catalogue | error, refuse to compute |
| Plate thickness outside CapacityTable range | extrapolate? No — clamp to nearest tabulated value and warn |
| α > 90° because of how F̂ and û are oriented | normalise to [0, 90°] using `min(α, 180° − α)`; the spacing rules and capacity tables are symmetric |
