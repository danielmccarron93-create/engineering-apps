# 02 — Data Model

> Entity schemas, relationships, and where each piece of state lives. Pairs with `05-architecture.md` (which says *where* in the codebase) and `01-domain-knowledge.md` (which says *why* the fields exist).

The data model is built around four entity types: **TimberMember**, **SteelPlate**, **Screw**, and **Connection** — plus catalogue entries that screws and members reference. The Connection is the new concept; everything else mirrors existing patterns.

---

## 1. Catalogue entries (immutable, ship with the app)

### 1.1 ScrewSpec — one entry per (system, d, L) combination

```js
{
  id: 'HBSPL12200',            // matches Rothoblaas code, p. 214
  system: 'rothoblaas-hbs-plate',
  d: 12,                       // nominal diameter [mm]
  L: 200,                      // total length [mm]
  b: 160,                      // thread length [mm]
  AP_min: 1,                   // useful pre-drill min depth [mm]
  AP_max: 30,                  // useful pre-drill max depth [mm]
  dK: 18.5,                    // head diameter [mm]
  d2: 7.3,                     // thread (core) diameter [mm]
  dS: 8.55,                    // shank diameter [mm]
  t1: 19.5,                    // head thickness [mm]
  tK: 5.5,                     // washer thickness [mm]
  dUK: 13.0,                   // underhead diameter [mm]
  dV_steel: 14.0,              // hole in steel plate [mm]
  dV_S: 7.0,                   // pre-drill in softwood [mm]
  dV_H: 8.0,                   // pre-drill in hardwood/beech LVL [mm]
  bit: 'TX50',                 // installation bit
  torque_rec: 50,              // recommended torque [Nm]
  ftens_k: 50.0,               // characteristic tensile strength [kN]
  My_k: 65.0,                  // characteristic yield moment [Nm]
  fax_k: { softwood: 11.7, lvl_softwood: 15.0, beech_lvl_predrilled: 29.0 }, // [N/mm²]
  fhead_k: { softwood: 10.5, lvl_softwood: 20.0 },                            // [N/mm²]
  pcs_per_box: 25
}
```

The catalogue ships with all 18 ScrewSpec entries (d ∈ {8,10,12} × 6 lengths each) per `04-catalogues.md`.

### 1.2 RuleSet — the spacing rule table for a (substrate, connection_type, pre_drilled) combination

```js
{
  id: 'rothoblaas-hbs-steel-to-timber-predrilled',
  source: 'Rothoblaas HBS Plate ETA-11/0030 p. 215 (bottom table)',
  applies_to: {
    fastener_system: 'rothoblaas-hbs-plate',
    connection_type: 'steel-to-timber',
    substrate_family: ['solid-timber', 'glulam', 'lvl-softwood'],
    pre_drilled: true
  },
  // Endpoint values; α between 0 and 90 interpolates linearly
  // Each entry: { formula: <function of d, α=0>, formula90: <function of d, α=90> }
  spacings: {
    a1:  { atZero: (d) => 5*d*0.7, atNinety: (d) => 4*d*0.7 },
    a2:  { atZero: (d) => 3*d*0.7, atNinety: (d) => 4*d*0.7 },
    a3t: { atZero: (d) => 12*d,    atNinety: (d) => 7*d   },
    a3c: { atZero: (d) => 7*d,     atNinety: (d) => 7*d   },
    a4t: { atZero: (d) => 3*d,     atNinety: (d) => 7*d   },
    a4c: { atZero: (d) => 3*d,     atNinety: (d) => 3*d   }
  }
}
```

Functions returning numbers (not raw numbers) so the inspector can show the formula, not just the value. Six RuleSet entries cover steel-to-timber × pre-drilled-yes/no × (solid/glulam/LVL) — see `04-catalogues.md`.

CLT gets its own RuleSet (no α interpolation, single column). Timber-to-timber for v1.1 is a small derived RuleSet with `a1_modifier: 1.5, a2_modifier: 1.5` applied on top of the steel-to-timber table.

### 1.3 NefTable — n_ef lookup

```js
{
  id: 'rothoblaas-hbs-nef',
  source: 'Rothoblaas HBS Plate p. 215',
  // Keys: n (2..5), a1_in_d (4..14, step 1, "≥14d" caps at 14)
  // Values: n_ef
  table: {
    2: { 4: 1.41, 5: 1.48, 6: 1.55, 7: 1.62, 8: 1.68, 9: 1.74,
         10: 1.80, 11: 1.85, 12: 1.90, 13: 1.95, 14: 2.00 },
    3: { 4: 1.73, 5: 1.86, 6: 2.01, 7: 2.16, 8: 2.28, 9: 2.41,
         10: 2.54, 11: 2.65, 12: 2.76, 13: 2.88, 14: 3.00 },
    4: { 4: 2.00, 5: 2.19, 6: 2.41, 7: 2.64, 8: 2.83, 9: 3.03,
         10: 3.25, 11: 3.42, 12: 3.61, 13: 3.80, 14: 4.00 },
    5: { 4: 2.24, 5: 2.49, 6: 2.77, 7: 3.09, 8: 3.34, 9: 3.62,
         10: 3.93, 11: 4.17, 12: 4.43, 13: 4.71, 14: 5.00 }
  }
}
```

Lookup: `nef(n, a1_in_d)` interpolates linearly in a1, snaps n to discrete value. n > 5: clamp to n = 5 with warning (or use EN 1995 formula in v1.1).

### 1.4 CapacityTable — characteristic shear capacity by screw × plate thickness

```js
{
  id: 'rothoblaas-hbs-steel-to-timber-Rv90',
  source: 'Rothoblaas HBS Plate p. 216',
  epsilon: 90,                  // screw-to-grain angle [deg]
  alpha: 90,                    // load-to-grain angle for which this table is valid [deg]
  // Indexed by [screwId][plateThicknessMm]
  values: {
    'HBSPL12100': { 4: 6.90, 5: 6.83, 6: 6.76, 8: 8.16, 10: 9.41, 12: 10.67, 16: 10.67, 20: 10.67 },
    'HBSPL12120': { 4: 8.34, 5: 8.27, 6: 8.20, 8: 9.32, 10: 10.29, 12: 11.27, 16: 11.27, 20: 11.27 },
    'HBSPL12140': { 4: 9.73, 5: 9.71, 6: 9.64, 8: 10.49, 10: 11.26, 12: 12.03, 16: 12.03, 20: 12.03 },
    'HBSPL12160': { 4: 10.11, 5: 10.11, 6: 10.11, 8: 10.87, 10: 11.64, 12: 12.41, 16: 12.41, 20: 12.41 },
    'HBSPL12180': { 4: 10.86, 5: 10.86, 6: 10.86, 8: 11.63, 10: 12.40, 12: 13.17, 16: 13.17, 20: 13.17 },
    'HBSPL12200': { 4: 11.12, 5: 11.12, 6: 11.12, 8: 12.05, 10: 12.99, 12: 13.92, 16: 13.92, 20: 13.92 }
    // ... and equivalent for d=8, d=10
  }
}
```

We need **four CapacityTable instances**:
- p. 216 — steel-to-timber R_V,90,k (ε = 90°)
- p. 217 — steel-to-timber R_V,0,k (ε = 0°)
- p. 218 — timber-to-timber R_V,90,k and R_V,0,k (v1.1)
- p. 219 — steel-to-CLT R_V,90,k (v1.2)

### 1.5 TimberClass — strength class and density

```js
{
  id: 'GL28h',
  family: 'glulam',
  rho_k: 425,                  // kg/m³
  k_dens_v: 1.05,              // shear capacity multiplier
  k_dens_ax: 1.08,             // axial capacity multiplier (for v1.x)
  standard: 'EN 14080',
  notes: 'common Australian glulam for portal frames'
}
```

Shipped classes (v1): C24, C30, GL24h, GL26h, GL28h, GL30h, GL32h. Australian F-grades and MGP grades TBD per `08-open-questions.md`.

### 1.6 TimberSection — rectangular cross-section presets

```js
{
  id: 'glulam-200x600',
  family: 'glulam',
  b: 200,                      // width [mm]
  d: 600,                      // depth [mm]
  default_class: 'GL28h'       // user can override
}
```

This mirrors `02-data-sections.js` for steel. v1 includes a small list of common Aus glulam sizes; add more as needed.

---

## 2. Live model entities (mutable, per-detail)

### 2.1 TimberMember

```js
{
  id: 't1',
  type: 'timber-member',
  blockId: <block this entity belongs to>,
  // Geometry in view-local 2D (mm) — same convention as existing entities
  outline: [{u: 0, v: 0}, {u: 600, v: 0}, {u: 600, v: 200}, {u: 0, v: 200}],
  // The grain direction unit vector in view-local coords.
  // For a column drawn upright in elevation, grain is along the long axis.
  // Defaults: long axis of bounding box, but EDITABLE (some details have angled grain).
  grainDir: {u: 0, v: 1},
  // Catalogue refs
  section: 'glulam-200x600',
  class: 'GL28h',
  // Display state
  layer: 'timber',
  visible: true,
  selected: false
}
```

The **grain direction** is the most important field. It drives the entire rule engine. The user must see it on the canvas (a small hatching pattern along grain — see `06-ux.md`) and be able to edit it via the inspector (4 cardinal presets + free angle).

### 2.2 SteelPlate

```js
{
  id: 'p1',
  type: 'steel-plate',
  blockId: <block this entity belongs to>,
  // Outline in view-local coords (polygon)
  outline: [{u: ..., v: ...}, ...],
  thickness: 8,                // S_PLATE [mm] — drives capacity lookup
  grade: '350MPa',             // for steel-side checks in v1.2
  layer: 'steel',
  visible: true,
  selected: false
}
```

The plate is a regular drawing entity that adopts a structural role only when associated with a Connection. In v1 the user draws the plate first, then "starts a connection" that pulls the plate in as the steel side.

### 2.3 Screw

```js
{
  id: 's1',
  type: 'screw',
  blockId: <block this entity belongs to>,
  // Position in view space — single point (the head, on the plate face)
  pos: {u: 50, v: 100},
  // Catalogue ref
  screwSpec: 'HBSPL12200',
  // The Connection this screw belongs to (drives all checks)
  connectionId: 'c1',
  // Drawing presentation
  showHead: true,              // for elevation
  showShank: false,            // for section/plan views
  layer: 'screws',
  visible: true,
  selected: false
}
```

A screw without a connectionId is *placed but unattached* — drawn on canvas, no checks. Attaching to a Connection registers it for checking.

### 2.4 Connection — the new central concept

```js
{
  id: 'c1',
  type: 'connection',
  blockId: <block this entity belongs to>,

  // The members. v1 = one front (steel plate) + one rear (timber).
  // v1.1 (timber-to-timber) = two timber members.
  front: { ref: 'p1', kind: 'steel-plate' },
  rear:  { ref: 't1', kind: 'timber-member' },

  // Type
  connectionType: 'steel-to-timber',   // | 'timber-to-timber' | 'steel-to-clt'
  preDrilled: true,

  // The screws (ordered list — order is purely UI, not structural)
  screws: ['s1', 's2', 's3', 's4', 's5', 's6'],

  // The applied design action — magnitude and direction in view-local 2D.
  // F_d.dir is the unit vector; F_d.mag is the magnitude in kN (design value).
  // α (load-to-grain angle) is COMPUTED, not stored, from F_d.dir and rear.grainDir.
  load: {
    F_d_mag: 25.0,             // [kN] design action
    F_d_dir: {u: 0, v: -1},    // unit vector (downward in view space)
    loadCase: 'permanent',     // for k_mod (or 'long' | 'medium' | 'short' | 'instantaneous')
    serviceClass: 'SC1'        // for k_mod
  },

  // Cached check results (recomputed on any change, see `03-rule-engine.md`)
  checks: {
    timestamp: <epoch ms>,
    spacing: [<per-screw and per-pair results>],
    capacity: { R_V_d_total: 75.6, eta: 0.33, pass: true },
    overall: 'PASS',           // 'PASS' | 'FAIL' | 'WARN'
    multiplierTrace: {         // For inspector breakdown
      k_mod: 0.80,
      gamma_M: 1.3,
      k_dens: 1.05,
      n_ef_per_row: [{rowId: 'r1', n: 3, a1: 60, n_ef: 1.86}, ...]
    }
  },

  // Rule-set version stamp (for forward-compatibility)
  ruleSetVersion: 'rothoblaas-hbs-plate-eta-11-0030-2019',

  layer: 'connections-meta',   // checks render on this layer (toggleable)
  visible: true
}
```

The Connection is **the structural unit**. Every check happens at Connection scope. Save/load serialises Connections with refs to entity IDs.

---

## 3. Relationships

```
Block (existing — detail block on a sheet)
 └── contains: TimberMember(s), SteelPlate(s), Screw(s), Connection(s)

Connection
 ├── refs: front entity (SteelPlate or TimberMember)
 ├── refs: rear entity (TimberMember)
 ├── owns: list of Screw IDs (the screws this connection checks)
 └── owns: load vector

Screw
 ├── refs: ScrewSpec (catalogue)
 └── ref:  Connection (its owning connection)

TimberMember
 ├── refs: TimberSection (catalogue, optional — user can draw freeform)
 └── refs: TimberClass (catalogue) — drives ρₖ and k_dens

ScrewSpec (catalogue, immutable)
RuleSet (catalogue, immutable)
NefTable (catalogue, immutable)
CapacityTable (catalogue, immutable)
TimberClass (catalogue, immutable)
TimberSection (catalogue, immutable)
```

---

## 4. Where each piece of state lives

| State | Where | Why |
|---|---|---|
| Catalogue (ScrewSpec, RuleSet, etc.) | new files `02b-data-timber.js`, `02c-data-screws.js`, `02d-data-rothoblaas-rules.js` | Mirrors existing `02-data-sections.js` and `03-data-bolts.js` pattern. Top-level consts. |
| Entity instances (TimberMember, SteelPlate, Screw, Connection) | the `blocks[i].ents[]` array in the existing block model | Same place as existing PFC, plates, bolts. The new `type:` values are dispatched by `28-draw-block.js`. |
| Per-connection mutable state (load vector, checks, etc.) | inside the Connection entity in `ents[]` | Persists with save/load. |
| Cached check results | `connection.checks` (recomputed on any relevant change) | Rendering reads from cache for speed. |
| Selected screw highlight, drag state | existing `36-selection-highlights.js` + `07-globals.js` | No new global state. |
| Pre-drilling toggle, service class, load duration | on the Connection entity | These define the rule context. |

Following the project root `CLAUDE.md` rule #8: any new top-level mutable globals go in `07-globals.js`. No scattering.

---

## 5. Save/load implications

The existing `.sd2.json` save format (per `46-save-load.js`) serialises `blocks` and their `ents[]`. New entity types add naturally — they're just new `type` values. **No format change needed**, but:

- Bump `schemaVersion` to 2 (currently no field — known issue #5 from project root `CLAUDE.md`). Add this proactively.
- Add `connectionRuleSetVersion` to each Connection so re-opening a 2026 file on a 2028 app doesn't silently re-check against a newer ETA.
- The migration on load: if `schemaVersion < 2`, no Connections exist — no migration needed yet.

---

## 6. Validation invariants (engine should assert)

- Every Screw with `connectionId` set → that Connection exists.
- A Connection's `screws[]` matches the set of Screws pointing back to it (`connectionId === c.id`).
- `rear.grainDir` is a unit vector (|grainDir| ≈ 1.0 ± 0.001).
- `load.F_d_dir` is a unit vector.
- The screws are geometrically inside the rear timber member's outline (warn if outside).
- The screws are geometrically inside the steel plate's outline (warn if outside).
- Front and rear are not the same entity.
- `screwSpec` is in the catalogue.
- `class` is in the TimberClass catalogue.

Violations produce warnings in the inspector but don't block rendering (the user might be mid-edit).
