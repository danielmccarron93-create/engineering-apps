# 01 — Domain Knowledge

> The engineering rules that drive every check. **Do not start coding without reading this end‑to‑end.**

This document captures everything we've learned from the Rothoblaas HBS Plate technical data sheet (10 pp.), the ETA‑11/0030 references, and the cross‑checked EN 1995‑1‑1 clauses. The transcribed numerical tables live in `04-catalogues.md`; this file explains the *structure* — what the rules are, where they come from, how they compose, and how they map onto a 2D drawing.

---

## 1. The product

**Rothoblaas HBS Plate** is a self‑tapping pan‑head wood screw designed for steel‑to‑timber connections where a plate sandwiches the timber face. It is approved under **ETA‑11/0030** (European Technical Assessment). The under‑head shoulder interlocks with the plate hole; the "3 THORNS" tip reduces splitting risk and lets the manufacturer specify smaller minimum distances than generic EC5 nail rules would.

Available diameters: **d₁ = 8, 10, 12 mm**.
Available lengths (per p. 214 of the data sheet — full geometry in `04-catalogues.md`):
- d = 8: L = 60, 80, 100, 120, 140, 160 mm
- d = 10: L = 80, 100, 120, 140, 160, 180 mm
- d = 12: L = 100, 120, 140, 160, 180, 200 mm

Each L has a defined thread length b and a useful pre‑drill range AP. Pre‑drill hole diameter is per p. 214 (dV,S = 5/6/7 mm in softwood for d = 8/10/12; dV,H = 6/7/8 mm for hardwood/beech LVL).

---

## 2. The rule families

There are **two distinct families of check** the engine must run, both required:

### 2.1 Geometric checks (minimum distances)

Each screw must satisfy six independent distance requirements. These are independent of applied load magnitude — they depend only on the screw position, the timber member geometry, the grain direction, and the *direction* of the applied load (which classifies each timber edge as stressed or unloaded).

The six requirements:

| Symbol | What it measures | Reference direction |
|---|---|---|
| a₁ | screw‑to‑screw spacing parallel to grain | between two screws |
| a₂ | screw‑to‑screw spacing perpendicular to grain | between two screws |
| a₃,t | distance to **stressed** end | screw‑to‑member‑edge |
| a₃,c | distance to **unloaded** end | screw‑to‑member‑edge |
| a₄,t | distance to **stressed** side edge | screw‑to‑member‑edge |
| a₄,c | distance to **unloaded** side edge | screw‑to‑member‑edge |

a₁/a₂ are *pair‑wise* (every screw pair generates one a₁ check and one a₂ check — actually one combined check, see §6.1 below). a₃/a₄ are *per‑screw, per‑edge*. For a rectangular timber with two end edges (perpendicular to grain) and two side edges (parallel to grain), each screw produces four edge‑distance checks.

### 2.2 Capacity check (design action vs design resistance)

The connection must transfer the applied load. For each screw, the characteristic lateral (shear) capacity R_V,k depends on:

- Screw diameter d
- Screw length L (and the dependent thread length b)
- Plate thickness S_PLATE (categorised thin / intermediate / thick by comparison to d — see p. 221)
- Screw‑to‑grain angle ε of the screw axis relative to grain (the table has ε = 0° and ε = 90° — interpolate for in‑between)
- Load‑to‑grain angle α of the applied force (the table has α = 0° giving R_V,0,k and α = 90° giving R_V,90,k — interpolate)
- Timber substrate (solid timber, glulam, CLT, LVL)
- Timber characteristic density ρₖ → k_dens
- Service class + load duration → k_mod
- Group action: n_ef per row along grain

The design value:

```
R_V,d = (k_mod · k_dens · R_V,k) / γM
R_V,d,group = n_ef · n_rows × R_V,d   (for n_ef-applicable rows)
```

The connection's design resistance is the sum over screws/rows, accounting for n_ef on each row separately.

The check is `F_d ≤ R_V,d,group`, expressed as a **utilisation ratio** η = F_d / R_V,d,group ≤ 1.0.

In v1, we treat the applied F_d as a single lumped value provided by the user on the Connection entity. (Future: per‑load‑case combinations.)

---

## 3. Which rule table applies — the substrate decision tree

The Rothoblaas data sheet contains **six independent minimum‑distance rule tables**. The engine must select the correct one based on substrate + connection type + pre‑drilling. This is the first decision in the rule pipeline:

```
Connection type?
├── Steel‑to‑timber
│   ├── Substrate = solid timber / glulam / LVL
│   │   ├── Pre‑drilled?
│   │   │   ├── YES → use p. 215 BOTTOM table (with pre‑drilled hole)
│   │   │   └── NO  → use p. 215 TOP table (without pre‑drilled hole)
│   │   └── Apply Douglas‑fir modifier if applicable (1.5× on a₁ and a₃)
│   │
│   └── Substrate = CLT (lateral face)
│       ├── Pre‑drilled? → use p. 219 CLT table (no pre‑drilling variant in v1)
│       └── (narrow‑face CLT is on p. 39 — defer to v1.2)
│
└── Timber‑to‑timber
    └── Take steel‑to‑timber values and multiply a₁ and a₂ by 1.5
        (per p. 221 "NOTES | TIMBER" note 2). a₃ and a₄ unchanged.
```

For v1 we implement only the **steel‑to‑timber, solid‑timber/glulam/LVL** branch. The other branches are stubbed in the catalogue with `TODO: v1.x` and the rule engine fails fast with a clear error if the user picks them.

---

## 4. The α = 0° vs α = 90° distinction (and interpolation)

The minimum‑distance tables on p. 215 give two columns: **α = 0°** (load parallel to grain) and **α = 90°** (load perpendicular to grain). The Rothoblaas notes on p. 221 reference EN 1995‑1‑1, which permits linear interpolation between these endpoints for intermediate α.

The values that **change with α** are (for steel‑to‑timber, with pre‑drilling, 12 mm screw, as an example):

| Distance | At α=0° | At α=90° | Interpolate? |
|---|---|---|---|
| a₁ | 5d·0.7 = 42 | 4d·0.7 = 34 | yes, linear in α |
| a₂ | 3d·0.7 = 25 | 4d·0.7 = 34 | yes |
| a₃,t | 12d = 144 | 7d = 84 | yes |
| a₃,c | 7d = 84 | 7d = 84 | no |
| a₄,t | 3d = 36 | 7d = 84 | yes |
| a₄,c | 3d = 36 | 3d = 36 | no |

So at general α, **interpolate linearly between the endpoints** per the formulas. The engine should compute the lookup as `required(d, α) = lerp(table[α=0°], table[α=90°], α/90°)`.

**Important**: Rothoblaas's underlying formulas (e.g. `a₁ = 5d·0.7` at α=0°) are derived from EN 1995‑1‑1 nail/bolt angle‑dependent formulas (like `(4 + |cos α|)·d` for bolts, `(5 + 5|cos α|)·d` for nails). The Rothoblaas tables condense them into endpoint values. Linear interpolation between endpoints is a *defensible approximation* of the underlying smooth function — we accept it as standard practice (and as what Rothoblaas MyProject does internally).

---

## 5. Edge classification — the dot‑product rule

This is the rule that ties the load direction to "which a₃/a₄ value applies to which edge of the timber." It's the key engineering decision in the engine.

**Setup**: every rectangular timber member has four edges. We label them by their outward unit normal `n̂_edge`:
- two **end edges** (perpendicular to grain) — outward normals point along the grain direction `±û`
- two **side edges** (parallel to grain) — outward normals point perpendicular to grain `±v̂`

Given a load vector `F` on the connection, unit vector `F̂ = F / |F|`:

**For each end edge** (perpendicular to grain):
- if `F̂ · n̂_edge > 0` → the load is pointing *into* this edge → **stressed end** → use a₃,t
- if `F̂ · n̂_edge < 0` → the load is pointing *away from* this edge → **unloaded end** → use a₃,c
- if `F̂ · n̂_edge = 0` → load has no parallel‑to‑grain component → use a₃,c (the more relaxed value, since this edge isn't being stressed by the load's grain‑parallel component)

**For each side edge** (parallel to grain): same rule, mapping to a₄,t / a₄,c.

**Worked example** (Dan's case): timber column with vertical grain, load downward (F̂ = (0, −1) in screen space with y‑up world).
- Bottom edge (n̂ = (0, −1)): F̂·n̂ = +1 → **stressed end** → a₃,t = 12d
- Top edge (n̂ = (0, +1)): F̂·n̂ = −1 → **unloaded end** → a₃,c = 7d
- Left edge (n̂ = (−1, 0)): F̂·n̂ = 0 → no perp component → a₄,c = 3d
- Right edge (n̂ = (+1, 0)): F̂·n̂ = 0 → a₄,c = 3d

**Why this rule is correct**: the Rothoblaas schematic on p. 215 defines the stressed/unloaded ranges in terms of α intervals (e.g. "stressed end: −90° < α < 90°"). For an edge whose outward normal is in the +grain direction, F̂·n̂ > 0 means cos(α_edge) > 0 where α_edge is the angle of the load from the edge normal. That's exactly the −90° < α < 90° range. So the dot‑product rule is the projective equivalent of the Rothoblaas angle‑range definition. Verified by hand‑checking on multiple α values.

**Edge case — F̂·n̂ exactly zero**: this is a boundary in the original Rothoblaas definition (strict inequalities). We map to "unloaded" because the load has no component pushing toward that edge. This is conservative *only* in the sense that a₃,c ≤ a₃,t and a₄,c ≤ a₄,t — so using c at the boundary gives the *smaller* required distance. Hmm — wait, that's the *less* conservative choice. **Re‑check**: at the boundary, the edge isn't really stressed by the parallel‑to‑grain component. The Rothoblaas figure shows a₃,t applies "when −90° < α < 90°", i.e. when the load has a component toward this edge. At exactly α=90° (F perpendicular to this edge's normal), the load has zero component toward the edge — neither stressed nor unloaded in the strict sense. **Decision for v1**: at the boundary, use a₃,c (unloaded). Rationale: matches Dan's hand calc; matches Rothoblaas MyProject behaviour where load purely perpendicular to grain doesn't trigger a₃,t. Document this assumption clearly in the inspector output.

---

## 6. Pair‑wise spacing check (a₁ and a₂)

For each pair of screws (i, j), compute the inter‑screw vector in view space:
```
Δ = p_j − p_i
```
Decompose into the member's local grain frame (û is the grain unit vector, v̂ is perpendicular):
```
Δu = Δ · û    (component along grain)
Δv = Δ · v̂    (component perpendicular to grain)
```

The required values are `a₁_req` (parallel to grain) and `a₂_req` (perpendicular to grain), looked up from the active substrate/pre‑drilling/α table.

**The pass/fail rule (EN 1995‑1‑1 §8.3/§8.5 style)**: a pair is non‑compliant when **both** of these are true simultaneously:
- |Δu| < a₁_req  *and*  |Δv| < a₂_req

Or stated positively: the pair is compliant if at least one of:
- |Δu| ≥ a₁_req (sufficient grain‑parallel separation), or
- |Δv| ≥ a₂_req (sufficient grain‑perpendicular separation)

is satisfied. Geometrically, the exclusion zone around each screw is a rectangle of half‑sides (a₁_req, a₂_req) in the (û, v̂) frame — a screw is "too close" to another only if it sits inside that rectangle. (Older EC5 commentary sometimes describes this as an *ellipse* but the rule is rectangular.)

**Important**: the engine should report the failing components — i.e. "Δu = 60 < a₁_req = 65 AND Δv = 22 < a₂_req = 25" — so Dan can see *why* the pair fails.

For Dan's worked example: each pair within a row has Δu = 60, Δv = 0. So |Δv| < a₂_req — but |Δu| = 60 ≥ a₁_req = 42 → at least one condition satisfied → PASS. Each pair across a row has Δu = 0, Δv = 100. |Δu| = 0 < 42 BUT |Δv| = 100 ≥ a₂_req = 25 → PASS. Diagonal pairs have Δu = 60, Δv = 100 — both clearances satisfied — PASS.

---

## 7. n_ef — group reduction for shear

For a row of n screws arranged **parallel to grain at spacing a₁**, the effective number for shear is < n (because of group action / row‑splitting effects). The Rothoblaas table on p. 215 gives n_ef as a function of (n, a₁) for n = 2…5 and a₁ from 4d to ≥14d. Linear interpolation in a₁ is explicitly allowed.

**Detection algorithm** (the engine must identify rows automatically):
1. Group screws by *u‑coordinate cluster* (i.e. screws with identical/near‑identical column position in the grain frame). Each cluster is a candidate row along grain.
2. For each cluster, sort screws by v‑coordinate (across grain).
3. Wait — no. A "row parallel to grain" is a line of screws *along* the grain direction. So we group by *v‑coordinate cluster* (constant across‑grain position), then sort by u (along grain).
4. For each cluster with n ≥ 2 screws, compute a₁ = spacing along grain between consecutive screws. If spacings vary within a cluster, use the smallest (most conservative — produces the lowest n_ef).
5. Look up n_ef from the table by interpolating on a₁.
6. **Capacity for that row** = n_ef · R_V,d (instead of n · R_V,d).

For Dan's example: two clusters of v‑coordinate (left column of screws, right column of screws), each with n = 3 screws along grain at a₁ = 60 mm = 5d. n_ef = 1.86 per the table.

**Edge case — non‑uniform a₁ within a row**: the standard advice is to use the average a₁ for interpolation, but conservatism says use the smallest a₁. **Decision for v1**: use the smallest spacing within the row. Document.

**Edge case — single screws (not in a row)**: n_ef does not apply; treat as n = 1, full capacity per screw.

**Edge case — n > 5**: Rothoblaas table tops out at n = 5. For n > 5, interpolation isn't valid. **Decision for v1**: flag with a warning and use n_ef from n = 5 as a conservative cap. (EN 1995‑1‑1 §8.3.1.1 actually has a formula `n_ef = min(n, n^0.9 · (a₁ / (13·d))^(1/4))` which extends naturally — adopt that formula for n > 5 in v1.1.)

---

## 8. The multiplier chain (k_mod, γM, k_dens, n_ef)

Design capacity flows through several multipliers in a fixed order. The engine should apply them as an explicit chain so the inspector can show *why* a number is what it is.

```
Step 1:  R_V,k          (look up from p. 216 or p. 217 table by d, L, S_PLATE, ε)
Step 2:  Apply α interpolation:
         R_V,k(α) = lerp(R_V,0,k, R_V,90,k, α / 90°)
Step 3:  Apply density modifier:
         R_V,k' = k_dens(ρₖ, class) · R_V,k(α)
Step 4:  Apply k_mod / γM to get design value per screw:
         R_V,d = (k_mod · R_V,k') / γM
Step 5:  Apply group reduction for each row along grain:
         R_V,d,row = n_ef(n, a₁) · R_V,d
Step 6:  Sum across rows and single screws:
         R_V,d,total = Σ R_V,d,row + Σ R_V,d,single
Step 7:  Utilisation:
         η = F_d / R_V,d,total
```

| Multiplier | Source | Notes |
|---|---|---|
| k_mod | EN 1995‑1‑1 Table 3.1 | Function of service class + load duration class. v1: user‑selectable on the connection; default SC1 + medium‑term → k_mod = 0.80. |
| γM | EN 1995‑1‑1 §2.4.1 | 1.3 for connections. v1: hard‑coded. NA: AS 1720.1 uses a different framework (capacity factor φ) — not applicable here. |
| k_dens | Rothoblaas p. 221 | Function of ρₖ. v1: user picks timber class (C24/C30/GL24h/GL26h/GL28h/GL30h/GL32h) → ρₖ → k_dens. |
| n_ef | Rothoblaas p. 215 | Function of n and a₁ for rows along grain. Auto‑detected from screw layout. |
| 1.5 × a₁/a₃ | Rothoblaas p. 221 | Douglas fir. v1: substrate flag. |
| 1.5 × a₁/a₂ | Rothoblaas p. 221 | Timber‑to‑timber. v1.1. |

---

## 9. Cross‑reference to EN 1995‑1‑1

The Rothoblaas tables are an ETA‑specific *calibration* of the EN 1995‑1‑1 framework for HBS Plate specifically. They are **the source of truth for HBS**, not the generic EC5 rules. But it helps to know the generic rules for two reasons: (1) verifying Rothoblaas's tables aren't anomalous, (2) extending the engine later to other fastener types that don't have their own ETA tables.

**EN 1995‑1‑1 §8.7.2** — laterally loaded screws:
- d ≤ 6 mm: nail rules of §8.3 apply
- d > 6 mm (some refs say d > 8 mm): bolt rules of §8.5 apply

HBS Plate (d = 8/10/12) is right at the bolt boundary. Rothoblaas uses a hybrid: nail‑style with‑pre‑drilling and without‑pre‑drilling distinction (which the generic bolt rules don't have), but with bolt‑style values when pre‑drilled.

**EN 1995‑1‑1 §8.5.1.1 Table 8.4** (bolts) at α = 0°:
- a₁ = (4 + |cos α|)·d = 5d
- a₂ = 4d
- a₃,t = max(7d, 80 mm)
- a₃,c = 4d (at α = 0°)
- a₄,t = max((2 + 2 sin α)·d, 3d) = 3d
- a₄,c = 3d

Compared to Rothoblaas with‑pre‑drilling at α = 0°: a₁ smaller (3.5d vs 5d — Rothoblaas less conservative on splitting, justified by 3 THORNS tip); a₃,t much larger (12d vs 7d — Rothoblaas more conservative on end pull‑out); a₄ matches.

**EN 1995‑1‑1 §8.3.1.2 Table 8.2** (nails, no pre‑drilling, d ≥ 5 mm, ρₖ ≤ 420) at α = 0°:
- a₁ = (5 + 7|cos α|)·d = 12d
- a₂ = 5d
- a₃,t = (10 + 5|cos α|)·d = 15d
- a₃,c = 10d
- a₄,t = (5 + 2|sin α|)·d = 5d
- a₄,c = 5d

Compared to Rothoblaas without‑pre‑drilling at α = 0°: a₃,t/a₃,c/a₄,t/a₄,c **match exactly**. a₁ and a₂ in Rothoblaas have a 0.7 modifier (≈ the nail‑with‑pre‑drilling factor), implying Rothoblaas treats the 3 THORNS tip as equivalent to a partial pre‑drill effect on splitting risk.

**Takeaway**: the Rothoblaas tables are defensibly derived from the EC5 framework. They're not arbitrary. If we ever need to support a fastener without its own ETA, we can fall back on §8.3/§8.5 rules.

**EN 1995‑1‑1 §8.3.1.1** — group factor formula (for nail rows, generalises to screws):
```
n_ef = min(n, n^k_ef)        where k_ef depends on a₁ and pre-drilling
```
This gives a continuous formula extending the n=2…5 table. Use for v1.1 if Dan wants > 5 screws per row.

---

## 10. Capacity tables (pp. 216–217, 218, 219)

The data sheet has **four capacity tables**:

| Page | Connection type | Substrate | Key columns |
|---|---|---|---|
| 216 | steel‑to‑timber | solid timber / glulam / LVL | R_V,90,k by d, L, b, S_PLATE (ε = 90°) |
| 217 | steel‑to‑timber | solid timber / glulam / LVL | R_V,0,k by d, L, b, S_PLATE (ε = 0°) |
| 218 | timber‑to‑timber | solid timber / glulam / LVL | R_V,90,k, R_V,0,k, panel‑to‑timber, axial, head pull‑through, steel tension |
| 219 | steel‑to‑CLT (lateral) | CLT | R_V,90,k by d, L, b, S_PLATE (single ε; CLT capacity is direction‑independent) |

**ε is the screw‑to‑grain angle** (axis of the screw vs grain direction). For Dan's elevation drawing of a column with a plate on the side, the screw axis is **horizontal** and the grain is **vertical** → ε = 90° → use the p. 216 table.

For Dan's case (12 mm screw, L = 200, b = 160, S_PLATE = some value): the table on p. 216 gives a range of R_V,90,k depending on plate thickness:
- S_PLATE = 4 mm: 11.12 kN
- S_PLATE = 5 mm: 11.12 kN
- S_PLATE = 6 mm: 11.12 kN
- S_PLATE = 8 mm: 12.05 kN
- S_PLATE = 10 mm: 12.99 kN
- S_PLATE = 12 mm: 13.92 kN
- S_PLATE = 16 mm: 13.92 kN
- S_PLATE = 20 mm: 13.92 kN

(See `04-catalogues.md` for the full transcription.)

The plate thickness is categorised per p. 221:
- **Thin plate**: S_PLATE ≤ 0.5·d₁
- **Intermediate plate**: 0.5·d₁ < S_PLATE < d₁
- **Thick plate**: S_PLATE ≥ d₁

For Dan's 12 mm screw, thin = ≤6, intermediate = 6–12, thick = ≥12. The capacity tables on p. 216–217 give discrete values per plate thickness — interpolate linearly between adjacent values, or use the table as a step function (Rothoblaas uses discrete values; either is defensible).

---

## 11. Combined shear and axial (parked for v1)

Per p. 221:
```
(F_v,d / R_V,d)² + (F_ax,d / R_ax,d)² ≤ 1
```
In v1 the connection is assumed pure shear (F_ax,d = 0). If a future load case introduces axial component, this interaction check is needed. The axial capacities are in p. 218 (R_ax,90,k, R_ax,0,k, R_head,k, R_tens,k).

---

## 12. Service class, load duration, k_mod (EN 1995‑1‑1 Table 3.1)

The user must declare **service class** (SC1/2/3) and **load duration** (permanent / long‑term / medium‑term / short‑term / instantaneous). The product gives k_mod. Excerpted for solid timber and glulam:

| Load duration | SC1 | SC2 | SC3 |
|---|---|---|---|
| Permanent | 0.60 | 0.60 | 0.50 |
| Long‑term | 0.70 | 0.70 | 0.55 |
| Medium‑term | 0.80 | 0.80 | 0.65 |
| Short‑term | 0.90 | 0.90 | 0.70 |
| Instantaneous | 1.10 | 1.10 | 0.90 |

(For LVL and panel products the values differ slightly — defer to v1.x.)

**For connections** with two materials having different k_mod (e.g. solid timber + LVL), use the geometric mean: `k_mod = sqrt(k_mod,1 · k_mod,2)` per EN 1995‑1‑1 §2.3.2.1(2). v1 has one substrate per connection so this doesn't bite yet.

---

## 13. Density / strength class lookup

For a timber strength class (e.g. GL28h), look up ρₖ from EN 14080 (glulam) or EN 338 (sawn). Excerpted relevant values (matches the table on p. 221 of the data sheet):

| Class | ρₖ [kg/m³] | k_dens,v |
|---|---|---|
| C16 | 310 | 0.85 (extrapolated) |
| C24 | 350 | 0.90 |
| C30 | 380 | 0.98 |
| GL24h | 385 | 1.00 (base) |
| GL26h | 405 | 1.02 |
| GL28h | 425 | 1.05 |
| GL30h | 430 | 1.05 |
| GL32h | 440 | 1.07 |

The base ρₖ for the capacity tables is **385 kg/m³** (matching GL24h). Any other class uses k_dens,v to scale R_V,k. The catalogue holds the class → (ρₖ, k_dens) mapping.

For Australian timber species (e.g. F‑grades, MGP grades) the equivalence to GL classes needs explicit mapping — TBD in `08-open-questions.md`.

---

## 14. Things still to clarify (cross‑referenced to `08-open-questions.md`)

- Australian timber class equivalence (F17 → ?, MGP10 → ?) — needs Dan's input.
- For combined fasteners (HBS + glued‑in rods etc.) — out of scope v1.
- Whether to support full Hankinson interpolation on capacity vs piecewise α‑linear — current spec is α‑linear (Rothoblaas tables are tabulated at endpoints only).
- Plate‑side checks (bolt edge distance on the steel plate to AS 4100 / EN 1993‑1‑8) — not in the Rothoblaas scope but engineers often want it. Park for v1.2.

---

## 15. Rule‑set versioning

The ETA‑11/0030 will be re‑issued periodically. The saved connection file must record:
```json
{
  "ruleSet": "rothoblaas-hbs-plate",
  "etaVersion": "ETA-11/0030 (2019 revision)",
  "checkedOn": "2026-05-18"
}
```
so a future ETA update doesn't silently re‑evaluate the design. This dovetails with the project root `CLAUDE.md` known‑issue #5 (schema version field).
