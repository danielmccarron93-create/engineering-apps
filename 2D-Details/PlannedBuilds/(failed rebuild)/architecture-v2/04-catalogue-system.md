# Catalogue System — Categories, Families, Types, Materials, Rules

The Catalogue Layer is **pure data + pure lookup functions**. It's what makes the renderer simple (the renderer asks the catalogue "what's the hatch for steel S275?" and renders it) and what makes the rule engine clean (the rule engine asks the catalogue "what's the characteristic capacity of HBS 10×100 at α=90°, edge distance 30mm, predrilled?" and gets a number with a source citation).

This file defines the four catalogues (Category, Family/Type, Material, Rule) and the discipline that keeps the catalogue truly data-only.

---

## 1. The four catalogues at a glance

```
┌─────────────────────────────────────────────────────────────────────────┐
│  CategoryRegistry                                                      │
│  ────────────────                                                      │
│  Defines the top-level taxonomy. Maybe 12-15 categories total.        │
│  Each category declares: default lineweight policy, default visibility,│
│  rendering dispatch fallback, supported geometry kinds.                │
│                                                                        │
│  Examples: beam, column, brace, plate, fastener, reinforcement,        │
│  masonry, concrete-region, timber-member, annotation, sheet-component, │
│  detail-component                                                      │
└─────────────────────────────────────────────────────────────────────────┘
                              ▼ contains
┌─────────────────────────────────────────────────────────────────────────┐
│  FamilyCatalogue                                                       │
│  ────────────────                                                      │
│  Within each category, parametric families. Maybe 50-80 families total.│
│  Each family declares: parameter shape, geometry construction rule,   │
│  default material class, AS-source standard.                          │
│                                                                        │
│  Examples within 'beam': ub, uc, pfc, shs, rhs, chs, ea, ua, wb,       │
│  glt-timber, clt-timber, custom-rect, custom-i                         │
│  Examples within 'fastener': as1252-bolt, rothoblaas-hbs,              │
│  anchor-bolt, shear-stud, chemical-anchor, expansion-anchor            │
└─────────────────────────────────────────────────────────────────────────┘
                              ▼ contains
┌─────────────────────────────────────────────────────────────────────────┐
│  TypeCatalogue                                                         │
│  ────────────                                                          │
│  Concrete catalogue rows. Thousands. This is where AS 3679 section    │
│  property tables, ETA-11/0030 screw capacity tables, etc. live.       │
│                                                                        │
│  Examples: '310UB40.4', 'HBS-10x100', 'M20-8.8-S', '50UA3', …          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  MaterialCatalogue                                                     │
│  ──────────────                                                        │
│  Independent of Categories/Families. Materials are referenced by      │
│  ElementId on each Element. ~30-50 materials total.                    │
│                                                                        │
│  Examples: 'steel-s275', 'steel-s355', 'concrete-n32', 'timber-mgp10',│
│  'timber-gl18-h', 'masonry-cmu190', 'screw-galv-grade-c1022'           │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  RuleCatalogue                                                         │
│  ────────────                                                          │
│  Pure functions implementing AS rules. ~30-60 rules across standards. │
│  Each rule has: applicability predicate, calculation function,        │
│  output shape, source citation.                                       │
│                                                                        │
│  Examples: AS4100-Cl5.2 (member moment capacity),                     │
│  AS3600-Cl8.1 (concrete beam flexure),                                │
│  AS1720-Cl4.4 (timber characteristic strength),                       │
│  ETA-11/0030 Tab.7 (HBS screw withdrawal capacity)                    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. `CategoryRegistry`

Categories are the top-level taxonomy. They drive renderer dispatch fallback, visibility, and lineweight defaults. The set is **small and stable** — most "things" the app draws fit into one of these.

```javascript
// js/v2/catalogues/categories.js
window.v2 = window.v2 || {};
window.v2.categories = window.v2.categories || {};

const CATEGORIES = {
  beam: {
    label: 'Beam',
    geometryKinds: ['linear'],
    defaultLineweight: {
      cut:    'thick',     // when a section view cuts through the beam
      proj:   'medium',    // when projected (elevation, plan)
      hidden: 'thin-dash',
    },
    defaultMaterialClass: 'steel',
    visibility: { default: true },
  },

  column: {
    label: 'Column',
    geometryKinds: ['linear'],
    defaultLineweight: { cut: 'thick', proj: 'medium', hidden: 'thin-dash' },
    defaultMaterialClass: 'steel',
    visibility: { default: true },
  },

  brace: {
    label: 'Brace',
    geometryKinds: ['linear'],
    defaultLineweight: { cut: 'medium', proj: 'thin', hidden: 'thin-dash' },
    defaultMaterialClass: 'steel',
    visibility: { default: true },
  },

  plate: {
    label: 'Plate',
    geometryKinds: ['plate'],
    defaultLineweight: { cut: 'thick', proj: 'medium', hidden: 'thin-dash' },
    defaultMaterialClass: 'steel',
    visibility: { default: true },
  },

  fastener: {
    label: 'Fastener',
    geometryKinds: ['point'],
    defaultLineweight: { cut: 'thin', proj: 'thin', hidden: 'thin-dash' },
    defaultMaterialClass: 'fastener',
    visibility: { default: true },
  },

  reinforcement: {
    label: 'Reinforcement',
    geometryKinds: ['linear', 'polyline'],
    defaultLineweight: { cut: 'medium', proj: 'medium', hidden: 'thin-dash' },
    defaultMaterialClass: 'reinforcement',
    visibility: { default: true },
  },

  masonry: {
    label: 'Masonry',
    geometryKinds: ['region'],
    defaultLineweight: { cut: 'medium', proj: 'thin', hidden: 'thin-dash' },
    defaultMaterialClass: 'masonry',
    visibility: { default: true },
  },

  'concrete-region': {
    label: 'Concrete',
    geometryKinds: ['region'],
    defaultLineweight: { cut: 'thick', proj: 'medium', hidden: 'thin-dash' },
    defaultMaterialClass: 'concrete',
    visibility: { default: true },
  },

  annotation: {
    label: 'Annotation',
    geometryKinds: ['annotation', 'polyline'],
    defaultLineweight: { cut: 'thin', proj: 'thin', hidden: 'thin' },
    defaultMaterialClass: null,  // annotations don't reference a structural material
    visibility: { default: true },
  },

  'sheet-component': {
    label: 'Sheet Component',
    geometryKinds: ['annotation'],
    defaultLineweight: { cut: 'medium', proj: 'medium', hidden: 'medium' },
    defaultMaterialClass: null,
    visibility: { default: true },
  },

  'detail-component': {
    label: 'Detail Component',
    geometryKinds: ['region', 'polyline', 'annotation'],
    defaultLineweight: { cut: 'medium', proj: 'thin', hidden: 'thin-dash' },
    defaultMaterialClass: null,
    visibility: { default: true },
  },
};

window.v2.categories.CATEGORIES = CATEGORIES;
window.v2.categories.lookupCategory = (key) => CATEGORIES[key];
```

**Why categories are small and stable:** if you find yourself wanting to add a category often, the granularity is wrong. Categories are the broadest possible classification — Beam covers UB/UC/PFC/SHS/RHS/CHS/EA/UA/WB/timber-beam/etc. all together. The finer distinctions are families.

**Adding a category is a meaningful change** that triggers updates to: the V26 BB-rail (potentially a new tab or section), the Inspector (a new property panel pattern), the rule engine (rules that target this category), and the renderer (a new dispatch entry per renderer). Adding a category is the equivalent of "Revit added a new top-level element class" — it doesn't happen often.

---

## 3. `FamilyCatalogue`

Within each category, families. A family is a parametric template — it knows how to construct geometry from a Type's parameters, what params it takes, and which renderer keys it dispatches under.

```javascript
// js/v2/catalogues/families/beam-ub.js
window.v2.families = window.v2.families || {};

const UbFamily = {
  id: 'ub',
  category: 'beam',
  label: 'Universal Beam',
  sourceStandard: 'AS 3679.1-2010',

  // Parameter shape — what every Type in this family must specify
  paramSchema: {
    d:   { type: 'number', label: 'Section depth', unit: 'mm', min: 50 },
    bf:  { type: 'number', label: 'Flange width', unit: 'mm', min: 30 },
    tf:  { type: 'number', label: 'Flange thickness', unit: 'mm', min: 3 },
    tw:  { type: 'number', label: 'Web thickness', unit: 'mm', min: 3 },
    r1:  { type: 'number', label: 'Root radius', unit: 'mm', min: 0 },
    mass:{ type: 'number', label: 'Mass per metre', unit: 'kg/m', min: 0 },
  },

  // The catalogue rows (Types). Sourced from AS 3679.1 Table A1.
  types: [
    { id: '610UB125',   d: 612, bf: 229, tf: 19.6, tw: 11.9, r1: 14, mass: 125 },
    { id: '610UB113',   d: 607, bf: 228, tf: 17.3, tw: 11.2, r1: 14, mass: 113 },
    { id: '610UB101',   d: 602, bf: 228, tf: 14.8, tw: 10.6, r1: 14, mass: 101 },
    // ...
    { id: '310UB40.4',  d: 304, bf: 165, tf:  10.2, tw:  6.1, r1: 11, mass: 40.4 },
    { id: '310UB32.0',  d: 298, bf: 149, tf:  8.0,  tw:  5.5, r1: 13, mass: 32.0 },
    // ... full AS 3679.1 Table A1, ~50 rows
  ],

  // Default material — instances of this family use this material unless overridden
  defaultMaterial: 'steel-s300',

  // Hatch override (rarely used — most beams use the material's hatch)
  // hatchCut: null,  // null = use material default

  // Renderer keys this family dispatches under (allows renderer to specialise)
  rendererKey: 'beam:ub',

  // Optional: how to construct the section profile for cut views
  // Returns a polygon in the section's local 2D coords.
  buildSectionProfile(type) {
    return sectionProfile.iSection(type.d, type.bf, type.tf, type.tw, type.r1);
  },

  // Optional: orientation presets — how this family is typically placed
  orientationPresets: [
    { id: 'web-vertical-flange-top', label: 'Web vertical, top flange up',
      rotation: 0,    icon: '#icon-ub-orient-1' },
    { id: 'web-vertical-flange-bot', label: 'Web vertical, bottom flange up',
      rotation: Math.PI, icon: '#icon-ub-orient-2' },
    { id: 'web-horizontal',          label: 'Web horizontal (laid on side)',
      rotation: Math.PI/2, icon: '#icon-ub-orient-3' },
  ],
};

window.v2.families.UbFamily = UbFamily;
window.v2.families.register(UbFamily);
```

**Family files are catalogues, period.** They contain data (the Type rows) and small pure helpers (`buildSectionProfile`). They do not render. They do not hit-test. They do not dispatch events. The renderer uses them as a lookup; the rule engine uses them as a lookup.

**One file per family.** UB lives in `families/beam-ub.js`; UC in `families/beam-uc.js`; PFC in `families/beam-pfc.js`; etc. There are maybe 50-80 families across all categories. The file count looks large but each file is 100-300 lines of data, no logic. Easy to git-blame, easy to PR-review, easy to extend.

**The Rothoblaas HBS family** (the timber screws being built today):

```javascript
// js/v2/catalogues/families/fastener-rothoblaas-hbs.js
const RothoblaasHbsFamily = {
  id: 'rothoblaas-hbs',
  category: 'fastener',
  label: 'Rothoblaas HBS Plate (steel-to-timber)',
  sourceStandard: 'ETA-11/0030 (2019-09-24)',

  paramSchema: {
    d:           { type: 'number', label: 'Diameter', unit: 'mm' },
    L:           { type: 'number', label: 'Total length', unit: 'mm' },
    Lthread:     { type: 'number', label: 'Threaded length', unit: 'mm' },
    headType:    { type: 'enum', values: ['CSK', 'WW'], label: 'Head' },
    Rax_k:       { type: 'number', label: 'Char. axial cap.', unit: 'kN' },
    Rlat_k:      { type: 'number', label: 'Char. lateral cap.', unit: 'kN' },
  },

  // 18 rows from ETA-11/0030 p.214
  types: [
    { id: 'HBS-8x100',  d: 8,  L: 100, Lthread: 60,  headType: 'CSK', Rax_k: 4.1, Rlat_k: 2.7 },
    { id: 'HBS-8x120',  d: 8,  L: 120, Lthread: 70,  headType: 'CSK', Rax_k: 4.1, Rlat_k: 3.2 },
    // ... 18 total
    { id: 'HBS-12x200', d: 12, L: 200, Lthread: 80,  headType: 'CSK', Rax_k: 7.2, Rlat_k: 5.4 },
  ],

  defaultMaterial: 'screw-galv-grade-c1022',
  rendererKey: 'fastener:rothoblaas-hbs',

  // No orientation presets — fasteners are point-placed at a normal
};
```

Adding a new screw size: one row in the `types` array. Adding a new screw family (e.g. Rothoblaas TBS, Wϋrth ASSY, SFS-intec WT): one new family file. No renderer change. No palette change (the BB-rail iterates the catalogue to build its tile list).

---

## 4. `MaterialCatalogue`

Materials are independent of families and categories. The same Material ("Steel S275") is referenced by every steel beam, every steel plate, every steel-only fastener (where applicable).

```javascript
// js/v2/catalogues/materials/steel-s275.js
const SteelS275 = {
  id: 'steel-s275',
  name: 'Steel S275',
  class: 'steel',
  grade: 'S275',
  sourceStandard: 'AS 3678-2016',

  display: {
    hatchCut:  { pattern: 'as1100-steel-45',     spacing: 2.0, angle: 45 },
    hatchProj: { pattern: 'none' },               // no hatch on projected views
    color:      'var(--mat-steel)',               // CSS variable, theme-aware
    outlineCut:  { weight: 'thick',  style: 'solid' },
    outlineProj: { weight: 'medium', style: 'solid' },
  },

  structural: {
    fy: 275,            // MPa, yield
    fu: 440,            // MPa, ultimate
    E:  200000,         // MPa
    G:  80000,          // MPa
    density: 7850,      // kg/m³
    poissonRatio: 0.3,
  },
};
```

**Display properties drive rendering.** Renderer asks the material for its hatchCut. Material says "as1100-steel-45 at 2.0mm spacing, 45°." Renderer's hatch primitive draws it. Want a heavier hatch app-wide? Edit the spacing. Want a per-customer office override? Override the material at project level.

**Structural properties drive rules.** AS 4100 capacity check asks the steel material for fy and uses it in Cl 5.2 calculation. AS 3600 reinforcement check asks the rebar material for fsy. The rule and the renderer use the same material — no duplication.

**The `--mat-steel` CSS variable** sits in `styles.css` next to the existing theme variables. Currently the codebase has hardcoded colours scattered across renderers and an undefined `--timber-color`. In v2, all element-display colours come through CSS variables on materials.

---

## 5. `RuleCatalogue`

Rules are pure functions of `(model, element, context) → CheckResult`. They live in `catalogues/rules/` organised by standard.

```javascript
// js/v2/catalogues/rules/as4100/cl5-2-member-moment-capacity.js
const Rule = {
  id: 'AS4100-Cl5.2',
  standard: 'AS 4100-2020',
  clause: 'Cl 5.2',
  label: 'Member moment capacity (Mb)',

  // Which elements this rule applies to
  appliesTo(element, model) {
    if (element.category !== 'beam') return false;
    const mat = model.materials.get(element.materialId);
    return mat && mat.class === 'steel';
  },

  // Run the check
  check(element, model, context) {
    const family = lookupFamily(element.family);
    const type = family.types.find(t => t.id === element.type);
    const mat = model.materials.get(element.materialId);
    
    const Mb = computeMemberMomentCapacity(type, mat, context);  // pure math
    const Mu = context.designMoment;  // from load case
    const eta = Mu / Mb;
    
    return {
      ruleId: 'AS4100-Cl5.2',
      passed: eta <= 1.0,
      utilisation: eta,
      Mb, Mu,
      citation: 'AS 4100-2020 Cl 5.2.1',
      verboseSteps: [/* the step-by-step calc for audit trail */],
    };
  },
};
```

**Rules don't reach into Elements directly.** They go through the model and the catalogues. This makes them composable, testable, and source-traceable. The verboseSteps array is exactly what an engineer would want in a signing-the-drawing audit trail — every step with its clause reference.

**The current `js/79-checks-timber.js`** (the timber-screw rule engine, 670 lines) becomes ~5 rule files in `catalogues/rules/eta-11-0030/` plus `catalogues/rules/as1720/` — each rule self-contained, each unit-testable. The current single-function `checkConnection(connection, model?)` becomes "run every applicable rule against every fastener and aggregate the results."

---

## 6. Lineweight + line-style catalogue

Two small sub-catalogues that everything else references.

```javascript
// js/v2/catalogues/lineweights.js
const LINEWEIGHTS = {
  thick:  0.70,  // mm — AS 1100 cut + visible
  medium: 0.50,  // mm — AS 1100 visible
  thin:   0.25,  // mm — AS 1100 hidden / centre / dimension
  fine:   0.18,  // mm — AS 1100 construction
};

// js/v2/catalogues/line-styles.js
const LINE_STYLES = {
  solid:        { dash: [], offset: 0 },
  'thin-dash':  { dash: [3, 2], weight: 'thin' },
  'centre':     { dash: [10, 2, 2, 2], weight: 'thin' },  // long-short-long
  'phantom':    { dash: [10, 2, 2, 2, 2, 2], weight: 'thin' },
  // ...
};
```

Every renderer pulls from these tables. There is no `ctx.lineWidth = 0.5` literal anywhere in the renderer code. This is the v2 answer to the hand-rolled-lineweights smell.

---

## 7. Hatch pattern catalogue

```javascript
// js/v2/catalogues/hatches.js
const HATCH_PATTERNS = {
  'as1100-steel-45': {
    type: 'crosshatch',
    angle: 45,        // degrees
    spacing: 2.0,     // mm
    weight: 'fine',
    color: 'inherit', // inherit from material
  },
  'as1100-steel-90': {
    type: 'crosshatch',
    angle: -45,
    spacing: 2.0,
    weight: 'fine',
  },
  'concrete-dot': {
    type: 'dot',
    spacing: 1.5,
    radius: 0.25,
    weight: 'fine',
  },
  'concrete-cross-cross': {
    type: 'composite',
    layers: [
      { type: 'crosshatch', angle: 45, spacing: 3 },
      { type: 'crosshatch', angle: -45, spacing: 3 },
    ],
  },
  'timber-grain-horizontal': {
    type: 'lines',
    angle: 0,
    spacing: 1.0,
    weight: 'fine',
    jitter: 0.2,      // organic variation
  },
  'timber-grain-vertical': {
    type: 'lines',
    angle: 90,
    spacing: 1.0,
    weight: 'fine',
    jitter: 0.2,
  },
  'masonry-running-bond': {
    type: 'pattern',
    tile: 'masonry-cmu-190-running-bond.svg',  // SVG asset
    scale: 1.0,
  },
  'earth-zigzag': {
    type: 'lines',
    angle: -45,
    spacing: 3,
    weight: 'fine',
    style: 'zigzag',
  },
  'none': {
    type: 'none',
  },
  // ...
};
```

All hatches in one place. Renderers render them by name. Materials reference them by name. Adding a new pattern is one entry; using it is editing one material.

---

## 8. The catalogue → renderer interface

Renderers don't see Categories, Families, or Types directly. They see a small **render context** assembled from the catalogue:

```javascript
// js/v2/render/render-context.js
function buildRenderContext(element, model) {
  const cat = CATEGORIES[element.category];
  const fam = lookupFamily(element.family);
  const typ = fam.types.find(t => t.id === element.type);
  const mat = model.materials.get(element.materialId);
  
  return {
    category: cat,
    family: fam,
    type: typ,
    material: mat,
    lineweight: {
      cut:    LINEWEIGHTS[cat.defaultLineweight.cut],
      proj:   LINEWEIGHTS[cat.defaultLineweight.proj],
      hidden: LINEWEIGHTS[cat.defaultLineweight.hidden],
    },
    hatchCut:  HATCH_PATTERNS[mat?.display?.hatchCut?.pattern  ?? 'none'],
    hatchProj: HATCH_PATTERNS[mat?.display?.hatchProj?.pattern ?? 'none'],
    color: resolveCSSVar(mat?.display?.color ?? '--entity-color'),
  };
}
```

The renderer receives a Render Context, not the raw Element. This decouples renderers from the catalogue file structure — when we add per-customer office-standard overrides (different lineweights, different hatches), the override layer slots in here.

---

## 9. File layout

```
js/v2/catalogues/
├── categories.js                 — CATEGORIES registry
├── lineweights.js                — LINEWEIGHTS table
├── line-styles.js                — LINE_STYLES table
├── hatches.js                    — HATCH_PATTERNS catalogue
│
├── families/
│   ├── beam-ub.js                — UB family + AS 3679 types
│   ├── beam-uc.js                — UC family + types
│   ├── beam-pfc.js
│   ├── beam-shs.js
│   ├── beam-rhs.js
│   ├── beam-chs.js
│   ├── beam-ea.js
│   ├── beam-ua.js
│   ├── beam-wb.js                — Welded Beam (the WB the playbook missed)
│   ├── beam-glt.js               — Glulam timber
│   ├── beam-clt.js               — CLT panels
│   ├── beam-custom-rect.js       — Free rectangular timber
│   ├── column-ub.js              — UB used as column (different orientation defaults)
│   ├── column-uc.js
│   ├── column-shs.js
│   ├── column-pfc.js
│   ├── column-rhs.js
│   ├── column-chs.js
│   ├── plate-flat.js             — Standard flat plates
│   ├── plate-bent.js             — Bent/folded plates (future)
│   ├── fastener-as1252-bolt.js   — AS 1252 high-strength bolts (M16/M20/M24/M30/M36)
│   ├── fastener-rothoblaas-hbs.js — HBS Plate timber screws
│   ├── fastener-rothoblaas-tbs.js — TBS timber screws (future)
│   ├── fastener-anchor-bolt.js   — Cast-in / chemical / mechanical anchors
│   ├── fastener-shear-stud.js    — Headed shear studs
│   ├── reinforcement-bar.js      — N12, N16, N20, N24, N28, N32, N36 rebar
│   ├── reinforcement-mesh.js     — SL62, SL72, SL81, etc.
│   ├── masonry-cmu.js            — 90/140/190/290 CMU
│   ├── annotation-dimension.js   — dim style variants
│   ├── annotation-leader.js
│   ├── annotation-tag.js
│   ├── annotation-section-mark.js
│   ├── annotation-detail-callout.js
│   ├── annotation-revision.js
│   ├── sheet-titleblock.js       — Bligh Tanner standard + per-customer
│   ├── detail-component-breakline.js
│   ├── detail-component-slot.js
│   ├── detail-component-weld-symbol.js
│   ├── ...
│   └── index.js                  — exports + registration
│
├── materials/
│   ├── steel-s275.js
│   ├── steel-s300.js             — AS 3679 grade 300
│   ├── steel-s355.js
│   ├── concrete-n20.js
│   ├── concrete-n25.js
│   ├── concrete-n32.js
│   ├── concrete-n40.js
│   ├── concrete-n50.js
│   ├── timber-mgp10.js           — AS 1720 MGP10
│   ├── timber-mgp12.js
│   ├── timber-gl18h.js           — AS 1720 GL18h
│   ├── timber-gl22h.js
│   ├── timber-clt-c24.js         — CLT C24
│   ├── masonry-cmu190.js
│   ├── reinforcement-n500.js     — N grade reinforcement
│   ├── screw-galv-grade-c1022.js
│   ├── bolt-as1252-grade-8.8.js
│   ├── bolt-as1252-grade-10.9.js
│   └── index.js
│
└── rules/
    ├── as4100/
    │   ├── cl5-2-member-moment-capacity.js
    │   ├── cl5-3-laterally-restrained.js
    │   ├── cl6-2-axial-tension.js
    │   ├── cl6-3-axial-compression.js
    │   ├── cl9-7-fillet-welds.js
    │   ├── cl9-3-bolted-connections.js
    │   └── index.js
    ├── as3600/
    │   ├── cl8-1-beam-flexure.js
    │   ├── cl8-2-beam-shear.js
    │   ├── cl11-development-length.js
    │   └── index.js
    ├── as1720/
    │   ├── cl3-2-bending.js
    │   ├── cl4-4-modification-factors.js
    │   └── index.js
    ├── eta-11-0030/
    │   ├── tab7-axial-withdrawal.js
    │   ├── tab8-lateral-capacity.js
    │   ├── min-distances.js
    │   └── index.js
    ├── as3700/                   — Masonry
    └── index.js                  — exports + registration
```

This is ~80-100 files. Each one is small (50-300 lines). Each one is a catalogue or a rule — no dispatch, no events, no DOM. Reviewing one is reviewing one engineering standard's data.

---

## 10. The mental model — one diagram per "thing"

Adding a new structural primitive to the app — say, the Rothoblaas TBS screw — under v2 is:

1. **Create `families/fastener-rothoblaas-tbs.js`** with the 12 screw types from the TBS datasheet.
2. **Confirm `materials/screw-galv-grade-c1022.js` covers it** (or create a TBS-specific material).
3. **Confirm rules in `rules/eta-11-0030/`** cover the new screw type's geometry (or add a rule).
4. **Confirm `render/canvas2d/render-fastener.js` dispatches on family**. If it generic-handles `category === 'fastener'`, the new TBS screws render immediately. If they need a specific renderer, add an entry.

That's it. No edits to `39-events.js`. No edits to the tool layer. No edits to the inspector. No edits to the BB-rail (it iterates the catalogue). No edits to the size picker (it iterates the catalogue). No autoloader script.

The catalogue is the source of truth; everything else is a consumer.

---

## 11. Co-existence with the current v1 catalogues

The current v1 catalogues live as flat data files (`02-data-sections.js`, `03-data-bolts.js`, `02b-data-timber.js`, etc.). The v2 catalogue files **import the v1 data**.

```javascript
// js/v2/catalogues/families/beam-ub.js
const UbFamily = {
  id: 'ub',
  category: 'beam',
  // ...
  types: Object.entries(window.UB_DB).map(([id, data]) => ({
    id,
    d: data.d,
    bf: data.bf,
    tf: data.tf,
    tw: data.tw,
    r1: data.r1,
    mass: data.mass,
  })),
  // ...
};
```

No duplicated section data. The v2 family imports the v1 catalogue array. When the v1 → v2 migration is fully done, the v1 catalogue files can be deleted and the v2 family files can inline the data — but during the migration window, both layers share the same source of truth.
