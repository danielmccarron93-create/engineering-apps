# 04 — Catalogues

> The actual numerical tables, transcribed from the Rothoblaas HBS Plate data sheet and the references in `01-domain-knowledge.md`. **This file is the data‑layer source of truth.** When implementing `02b-data-timber.js`, `02c-data-screws.js`, and `02d-data-rothoblaas-rules.js`, every number comes from here.

Source: Rothoblaas HBS Plate technical data sheet (`hbs-plate-en-technical-data-sheet.pdf`), 10 pp., pages 212–221 of the master Rothoblaas catalogue.

---

## 1. ScrewSpec entries — geometry and mechanical parameters

### 1.1 Ø8 mm — TX 40 bit, M_ins,rec = 25 Nm

| Code | L [mm] | b [mm] | AP [mm] | pcs |
|---|---|---|---|---|
| HBSPL860  |  60 |  52 | 1–10 | 100 |
| HBSPL880  |  80 |  55 | 1–15 | 100 |
| HBSPL8100 | 100 |  75 | 1–15 | 100 |
| HBSPL8120 | 120 |  95 | 1–15 | 100 |
| HBSPL8140 | 140 | 110 | 1–20 | 100 |
| HBSPL8160 | 160 | 130 | 1–20 | 100 |

Common geometry (all Ø8):
- dK (head diameter) = 13.5 mm
- d2 (thread/core diameter) = 5.9 mm
- dS (shank diameter) = 6.3 mm
- t1 (head thickness) = 13.5 mm
- tK (washer thickness) = 4.5 mm
- dUK (underhead diameter) = 10.0 mm
- dV,steel (steel plate hole) = 11.0 mm
- dV,S (softwood pre-drill) = 5.0 mm
- dV,H (hardwood/beech LVL pre-drill) = 6.0 mm
- ftens,k = 32.0 kN
- My,k = 33.4 Nm

### 1.2 Ø10 mm — TX 40 bit, M_ins,rec = 35 Nm

| Code | L [mm] | b [mm] | AP [mm] | pcs |
|---|---|---|---|---|
| HBSPL1080  |  80 |  60 | 1–10 | 50 |
| HBSPL10100 | 100 |  75 | 1–15 | 50 |
| HBSPL10120 | 120 |  95 | 1–15 | 50 |
| HBSPL10140 | 140 | 110 | 1–20 | 50 |
| HBSPL10160 | 160 | 130 | 1–20 | 50 |
| HBSPL10180 | 180 | 150 | 1–20 | 50 |

Common geometry (all Ø10):
- dK = 16.5, d2 = 6.6, dS = 7.2, t1 = 16.5, tK = 5.0, dUK = 12.0
- dV,steel = 13.0, dV,S = 6.0, dV,H = 7.0
- ftens,k = 40.0 kN, My,k = 45.0 Nm

### 1.3 Ø12 mm — TX 50 bit, M_ins,rec = 50 Nm

| Code | L [mm] | b [mm] | AP [mm] | pcs |
|---|---|---|---|---|
| HBSPL12100 | 100 |  75 | 1–15 | 25 |
| HBSPL12120 | 120 |  90 | 1–20 | 25 |
| HBSPL12140 | 140 | 110 | 1–20 | 25 |
| HBSPL12160 | 160 | 120 | 1–30 | 25 |
| HBSPL12180 | 180 | 140 | 1–30 | 25 |
| HBSPL12200 | 200 | 160 | 1–30 | 25 |

Common geometry (all Ø12):
- dK = 18.5, d2 = 7.3, dS = 8.55, t1 = 19.5, tK = 5.5, dUK = 13.0
- dV,steel = 14.0, dV,S = 7.0, dV,H = 8.0
- ftens,k = 50.0 kN, My,k = 65.0 Nm

### 1.4 Withdrawal and head-pull-through (for v1.x axial capacity)

| Parameter | Softwood (≤ 440 kg/m³) | LVL softwood (410–550) | Beech LVL pre-drilled (590–750) |
|---|---|---|---|
| fax,k [N/mm²] | 11.7 | 15.0 | 29.0 |
| fhead,k [N/mm²] | 10.5 | 20.0 | — |
| ρa [kg/m³] | 350 | 500 | 730 |

---

## 2. Minimum-distance tables — STEEL-TO-TIMBER (p. 215)

For ρₖ ≤ 420 kg/m³. Higher density requires the kdens adjustment on capacity (not spacing).

### 2.1 WITHOUT pre-drilled hole

#### α = 0° (load parallel to grain)

| Distance | Formula | d=8 | d=10 | d=12 |
|---|---|---|---|---|
| a₁ | 12·d·0.7 |  67 |  84 | 101 |
| a₂ |  5·d·0.7 |  28 |  35 |  42 |
| a₃,t | 15·d | 120 | 150 | 180 |
| a₃,c | 10·d |  80 | 100 | 120 |
| a₄,t |  5·d |  40 |  50 |  60 |
| a₄,c |  5·d |  40 |  50 |  60 |

#### α = 90° (load perpendicular to grain)

| Distance | Formula | d=8 | d=10 | d=12 |
|---|---|---|---|---|
| a₁ | 5·d·0.7 |  28 |  35 |  42 |
| a₂ | 5·d·0.7 |  28 |  35 |  42 |
| a₃,t | 10·d |  80 | 100 | 120 |
| a₃,c | 10·d |  80 | 100 | 120 |
| a₄,t | 10·d |  80 | 100 | 120 |
| a₄,c |  5·d |  40 |  50 |  60 |

### 2.2 WITH pre-drilled hole

#### α = 0° (load parallel to grain)

| Distance | Formula | d=8 | d=10 | d=12 |
|---|---|---|---|---|
| a₁ | 5·d·0.7 |  28 |  35 |  42 |
| a₂ | 3·d·0.7 |  17 |  21 |  25 |
| a₃,t | 12·d |  96 | 120 | 144 |
| a₃,c |  7·d |  56 |  70 |  84 |
| a₄,t |  3·d |  24 |  30 |  36 |
| a₄,c |  3·d |  24 |  30 |  36 |

#### α = 90° (load perpendicular to grain)

| Distance | Formula | d=8 | d=10 | d=12 |
|---|---|---|---|---|
| a₁ | 4·d·0.7 |  22 |  28 |  34 |
| a₂ | 4·d·0.7 |  22 |  28 |  34 |
| a₃,t | 7·d |  56 |  70 |  84 |
| a₃,c | 7·d |  56 |  70 |  84 |
| a₄,t | 7·d |  56 |  70 |  84 |
| a₄,c | 3·d |  24 |  30 |  36 |

**Range definitions** (p. 215 schematic — for the edge classification rule in `03-rule-engine.md` §3):
- **stressed end**: −90° < α < 90° → a₃,t applies
- **unloaded end**: 90° < α < 270° → a₃,c applies
- **stressed edge**: 0° < α < 180° → a₄,t applies
- **unloaded edge**: 180° < α < 360° → a₄,c applies

---

## 3. Minimum-distance tables — STEEL-TO-CLT lateral face (p. 219) [v1.2]

WITHOUT pre-drilled hole. **No α distinction** — CLT cross-laminated structure makes distances direction-independent.

| Distance | Formula | d=8 | d=10 | d=12 |
|---|---|---|---|---|
| a₁ | 4·d | 32 | 40 | 48 |
| a₂ | 2.5·d | 20 | 25 | 30 |
| a₃,t | 6·d | 48 | 60 | 72 |
| a₃,c | 6·d | 48 | 60 | 72 |
| a₄,t | 6·d | 48 | 60 | 72 |
| a₄,c | 2.5·d | 20 | 25 | 30 |

Minimum CLT thickness: tCLT,min = 10·d₁. CLT narrow-face is on p. 39 of the master Rothoblaas book — not extracted here, defer to v1.2.

---

## 4. n_ef table (p. 215)

For n screws arranged parallel to grain at spacing a₁. Linear interpolation in a₁ permitted.

| n \ a₁ | 4·d | 5·d | 6·d | 7·d | 8·d | 9·d | 10·d | 11·d | 12·d | 13·d | ≥14·d |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2 | 1.41 | 1.48 | 1.55 | 1.62 | 1.68 | 1.74 | 1.80 | 1.85 | 1.90 | 1.95 | 2.00 |
| 3 | 1.73 | 1.86 | 2.01 | 2.16 | 2.28 | 2.41 | 2.54 | 2.65 | 2.76 | 2.88 | 3.00 |
| 4 | 2.00 | 2.19 | 2.41 | 2.64 | 2.83 | 3.03 | 3.25 | 3.42 | 3.61 | 3.80 | 4.00 |
| 5 | 2.24 | 2.49 | 2.77 | 3.09 | 3.34 | 3.62 | 3.93 | 4.17 | 4.43 | 4.71 | 5.00 |

For n > 5 (out of v1 explicit support): use EN 1995‑1‑1 §8.3.1.1 formula `n_ef = min(n, n^0.9 · (a₁/(13·d))^0.25)` — v1.1.

---

## 5. Capacity tables — STEEL-TO-TIMBER, ε = 90° (p. 216)

R_V,90,k [kN] — characteristic lateral shear capacity, **screw axis perpendicular to grain**, load at 90° to grain (per the page header diagram). For load at α = 0°, see §6 below. The connecting axis convention: ε is the screw‑to‑grain angle; α is the load‑to‑grain angle. Both equal 90° in this table.

**Verification needed**: confirm with Dan that "R_V,90,k" in this table means α=90° (load perpendicular to grain) at ε=90°. See `08-open-questions.md` Q8.

### 5.1 d = 8 mm

| L [mm] | b [mm] | SPLATE 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12 |
|---|---|---|---|---|---|---|---|---|---|
|  60 |  52 | 3.14 | 3.09 | 3.03 | 3.64 | 4.13 | 5.12 | 5.12 | 5.12 |
|  80 |  55 | 4.22 | 4.17 | 4.11 | 4.72 | 5.22 | 6.21 | 6.21 | 6.21 |
| 100 |  75 | 5.31 | 5.25 | 5.20 | 5.68 | 6.04 | 6.78 | 6.78 | 6.78 |
| 120 |  95 | 5.86 | 5.86 | 5.86 | 6.22 | 6.57 | 7.29 | 7.29 | 7.29 |
| 140 | 110 | 6.24 | 6.24 | 6.24 | 6.59 | 6.95 | 7.67 | 7.67 | 7.67 |
| 160 | 130 | 6.74 | 6.74 | 6.74 | 7.10 | 7.46 | 8.17 | 8.17 | 8.17 |

### 5.2 d = 10 mm

| L | b | SPLATE 3 | 4 | 5 | 6 | 8 | 10 | 12 | 16 |
|---|---|---|---|---|---|---|---|---|---|
|  80 |  60 | 4.87 | 4.81 | 4.75 | 5.42 | 6.50 | 7.58 | 7.58 | 7.58 |
| 100 |  75 | 6.14 | 6.08 | 6.01 | 6.61 | 7.56 | 8.50 | 8.50 | 8.50 |
| 120 |  95 | 7.34 | 7.34 | 7.28 | 7.70 | 8.42 | 9.14 | 9.14 | 9.14 |
| 140 | 110 | 7.81 | 7.81 | 7.81 | 8.17 | 8.89 | 9.61 | 9.61 | 9.61 |
| 160 | 130 | 8.44 | 8.44 | 8.44 | 8.80 | 9.52 | 10.24 | 10.24 | 10.24 |
| 180 | 150 | 8.68 | 8.68 | 8.68 | 9.12 | 10.00 | 10.87 | 10.87 | 10.87 |

### 5.3 d = 12 mm

| L | b | SPLATE 4 | 5 | 6 | 8 | 10 | 12 | 16 | 20 |
|---|---|---|---|---|---|---|---|---|---|
| 100 |  75 |  6.90 |  6.83 |  6.76 |  8.16 |  9.41 | 10.67 | 10.67 | 10.67 |
| 120 |  90 |  8.34 |  8.27 |  8.20 |  9.32 | 10.29 | 11.27 | 11.27 | 11.27 |
| 140 | 110 |  9.73 |  9.71 |  9.64 | 10.49 | 11.26 | 12.03 | 12.03 | 12.03 |
| 160 | 120 | 10.11 | 10.11 | 10.11 | 10.87 | 11.64 | 12.41 | 12.41 | 12.41 |
| 180 | 140 | 10.86 | 10.86 | 10.86 | 11.63 | 12.40 | 13.17 | 13.17 | 13.17 |
| 200 | 160 | 11.12 | 11.12 | 11.12 | 12.05 | 12.99 | 13.92 | 13.92 | 13.92 |

---

## 6. Capacity tables — STEEL-TO-TIMBER, ε = 0° (p. 217)

R_V,0,k [kN] — characteristic lateral shear capacity, **load at α = 0° (parallel to grain)**, ε = 0° in the diagram. **The ε = 0° label means screw axis aligned with grain — typical for end-grain insertion.** This is *not* Dan's case (his screw axis is perpendicular to grain at ε = 90°).

**Verification pending Dan** on whether ε in the header is the screw‑to‑grain angle or the load‑to‑grain angle. Until resolved: this table is reserved for v1.x end‑grain support. For v1 (Dan's case), use p. 216 only.

### 6.1 d = 12 mm (for reference)

| L | b | SPLATE 4 | 5 | 6 | 8 | 10 | 12 | 16 | 20 |
|---|---|---|---|---|---|---|---|---|---|
| 100 |  75 | 2.76 | 2.73 | 2.70 | 3.36 | 3.95 | 4.54 | 4.54 | 4.54 |
| 120 |  90 | 3.34 | 3.31 | 3.28 | 3.94 | 4.55 | 5.15 | 5.15 | 5.15 |
| 140 | 110 | 3.91 | 3.88 | 3.85 | 4.56 | 5.21 | 5.86 | 5.86 | 5.86 |
| 160 | 120 | 4.49 | 4.46 | 4.43 | 5.10 | 5.72 | 6.34 | 6.34 | 6.34 |
| 180 | 140 | 5.06 | 5.03 | 5.00 | 5.56 | 6.06 | 6.56 | 6.56 | 6.56 |
| 200 | 160 | 5.33 | 5.33 | 5.33 | 5.82 | 6.31 | 6.79 | 6.79 | 6.79 |

(d=8 and d=10 tables omitted from this transcription — see PDF p. 217 if needed for v1.x.)

### 6.2 Plate thickness categorisation (p. 221)

The thin/intermediate/thick categories drive the diagram on p. 216 but the table values are tabulated by raw SPLATE — engine just looks up by mm.

- **Thin plate**: SPLATE ≤ 0.5·d₁
- **Intermediate plate**: 0.5·d₁ < SPLATE < d₁
- **Thick plate**: SPLATE ≥ d₁

For d=12: thin ≤ 6, intermediate 6–12, thick ≥ 12.

---

## 7. Capacity tables — TIMBER-TO-TIMBER (p. 218) [v1.1]

R_V,90,k and R_V,0,k for timber-to-timber, plus the axial capacity columns (R_ax,90,k, R_ax,0,k, R_head,k, R_tens,k) for v1.x combined shear+tension.

### 7.1 d = 12 mm (timber-to-timber excerpt)

| L | b | A [mm] | R_V,90,k | R_V,0,k | SPAN | R_V,k (panel) | R_ax,90,k | R_ax,0,k | R_head,k | R_tens,k |
|---|---|---|---|---|---|---|---|---|---|---|
| 100 |  75 | 25 | 4.49 | 2.99 | 25 | 4.65 | 11.36 | 3.41 | 3.88 | 50.00 |
| 120 |  90 | 30 | 4.69 | 3.54 | 25 | 4.65 | 13.64 | 4.09 | 3.88 | 50.00 |
| 140 | 110 | 30 | 4.69 | 3.88 | 25 | 4.65 | 16.67 | 5.00 | 3.88 | 50.00 |
| 160 | 120 | 40 | 4.97 | 4.15 | 25 | 4.65 | 18.18 | 5.45 | 3.88 | 50.00 |
| 180 | 140 | 40 | 4.97 | 4.15 | 25 | 4.65 | 21.21 | 6.36 | 3.88 | 50.00 |
| 200 | 160 | 40 | 4.97 | 4.15 | 25 | 4.65 | 24.24 | 7.27 | 3.88 | 50.00 |

(d=8 and d=10 omitted — see PDF.)

---

## 8. Capacity tables — STEEL-TO-CLT lateral (p. 219) [v1.2]

R_V,90,k for steel-to-CLT, plus R_ax,90,k for axial. CLT capacity is grain-direction-independent on lateral face.

| d | L | b | SPLATE 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|
|  8 |  60 |  52 | 2.85 | 2.81 | 2.76 | 3.33 | 3.80 | 4.75 | 4.75 | 4.75 |
|  8 |  80 |  55 | 3.84 | 3.79 | 3.74 | 4.31 | 4.78 | 5.72 | 5.72 | 5.72 |
| ... | ... | ... | ... | ... | ... | ... | ... | ... | ... | ... |

(Full table omitted — see PDF p. 219.)

---

## 9. Density adjustment factors (p. 221)

Base ρₖ for the capacity tables is **385 kg/m³** (GL24h). For other classes:

| ρₖ [kg/m³] | Class | k_dens,v | k_dens,ax |
|---|---|---|---|
| 350 | C24 | 0.90 | 0.92 |
| 380 | C30 | 0.98 | 0.98 |
| 385 | GL24h | 1.00 (base) | 1.00 (base) |
| 405 | GL26h | 1.02 | 1.04 |
| 425 | GL28h | 1.05 | 1.08 |
| 430 | GL30h | 1.05 | 1.09 |
| 440 | GL32h | 1.07 | 1.11 |

```
R'_V,k    = k_dens,v  · R_V,k
R'_ax,k   = k_dens,ax · R_ax,k
R'_head,k = k_dens,ax · R_head,k
```

---

## 10. Service-class × load-duration matrix → k_mod

Per **EN 1995‑1‑1 Table 3.1** for solid timber and glulam:

| Load duration class | SC1 | SC2 | SC3 |
|---|---|---|---|
| Permanent | 0.60 | 0.60 | 0.50 |
| Long-term | 0.70 | 0.70 | 0.55 |
| Medium-term | 0.80 | 0.80 | 0.65 |
| Short-term | 0.90 | 0.90 | 0.70 |
| Instantaneous | 1.10 | 1.10 | 0.90 |

For LVL: differs slightly — TBD per `08-open-questions.md`. For panel products (OSB, plywood): differs again.

**Service class definitions** (EN 1995‑1‑1 §2.3.1.3):
- **SC1**: characterised by moisture content corresponding to T = 20 °C and RH ≤ 65 %. Most building interiors.
- **SC2**: T = 20 °C, RH ≤ 85 %. Covered exterior, partially heated.
- **SC3**: outdoor or very humid environments.

**Load duration classes** (EN 1995‑1‑1 §2.3.1.2):
- **Permanent**: > 10 years. Self-weight.
- **Long-term**: 6 months – 10 years. Storage.
- **Medium-term**: 1 week – 6 months. Imposed live load.
- **Short-term**: < 1 week. Snow, wind in some cases.
- **Instantaneous**: seconds. Accidental loads, impact.

**For Australian use**: NCC + AS 1170 load combinations map to these — not 1:1 with AS 1720.1's k1 system. We'll document the mapping in v1.x.

---

## 11. Combined verification (p. 221, for v1.x)

```
(F_v,d / R_V,d)² + (F_ax,d / R_ax,d)² ≤ 1
```

Applies when a screw carries both shear and axial. v1 is pure shear; skip.

---

## 12. Installation parameters (p. 220) — for fabrication notes

| d [mm] | M_ins,rec [Nm] |
|---|---|
|  8 | 25 |
| 10 | 35 |
| 12 | 50 |

**Notes** (paraphrased from p. 220 — relevant for the screw schedule output):
- Use torque-controlled screwdriver (e.g. TORQUE LIMITER), not pulse/impact wrench.
- Maintain insertion angle; pre-drill guide hole for precise inclinations.
- Avoid bending.
- Ensure full contact between screw head and metal element.
- Install in one continuous stroke; do not hammer.
- Not for dynamic loads.
- Stop on damage to fastener or timber.

---

## 13. Where this maps in code

Per `05-architecture.md`:

- ScrewSpec entries → `dev/js/02c-data-screws.js` const `HBS_PLATE_SCREWS`
- RuleSet entries → `dev/js/02d-data-rothoblaas-rules.js` const `ROTHOBLAAS_RULESETS`
- NefTable → same file, const `ROTHOBLAAS_NEF_TABLE`
- CapacityTable entries → same file, const `ROTHOBLAAS_CAPACITY_TABLES`
- TimberClass entries → `dev/js/02b-data-timber.js` const `TIMBER_CLASSES`
- TimberSection presets → same file, const `TIMBER_SECTIONS`
- k_mod matrix → `dev/js/02b-data-timber.js` const `K_MOD`

Catalogue files have **no logic** — just exported consts. Logic lives in the rule engine.
