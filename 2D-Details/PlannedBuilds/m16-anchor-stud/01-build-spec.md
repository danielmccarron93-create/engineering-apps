# BUILD SPEC — Ramset ChemSet M16 anchor stud (`stud` entity)

**Status:** build-ready. This file IS the spec the implementer follows.
**Feature:** Ramset ChemSet chemical-anchor stud as a to-scale 2D paper-space (V25) fixing.
**Verified against live `js/` + `index.html` on 2026-06-04** (a parallel build session is editing these files; line numbers below were re-checked and any drift from the Phase-1 brief is flagged in §0).

---

## 0. Verification notes (live vs Phase-1 brief)

Every integration anchor was re-read against the working tree. Drift found:

| Brief said | Live reality | Action |
|---|---|---|
| Script tag for `02g` "near line 1451 (after 02c, before 03)" | `02c` is line 1447; `02d`/`02e` follow; `02f-data-spell-terms.js` is **line 1451**; `03-data-bolts.js` is **line 1452**. | Insert `02g` **after line 1451 (`02f`), before line 1452 (`03`)**. "02f is taken by spell-terms" confirmed — `02g` is the correct free number. |
| Script tag for `72j` "at line ~1529 (after 72i, before 73-init)" | `72i-v25-screw.js` is **line 1529**; `73-init.js` is **line 1530**. Also present between 72c and 72i: `72d-v25-plate.js`, `72e`, `72f`, `72g`, `72h` (a parallel session's modules). | Insert `72j` **after line 1529 (`72i`), before line 1530 (`73-init`)**. `72j` is the correct next free number. |
| screw SVG symbols "lines ~199-238" | `icon-screw` + 5 `icon-orient-screw-*` are at **lines 201–238** (header comment at 199). | Add stud symbols immediately after line 238 (after `icon-orient-screw-v-headb`), before `icon-orient-i-sec-h` at 239. |
| `getScrewSpec` lives in 02c | It lives in **`js/02e-catalogue-lookups.js` line 19**. | Mirror: put `getStudSpec` **in the new `02g` data file itself** (self-contained; no dependency on 02e). |
| selection inspector screw field "lines 1949-1956" | Those lines are a **mem2 weld-join** block. The real screw inspector field block is **lines 1985–1993** (`} else if (ent.type === 'screw') {`). | Clone after the screw block at line 1993, before the closing `}` at 1994. |
| selection `v25FastenerHit` screw branch "457-490" | **457–487** (`if (kind === 'screw') { … return … }`). Correct. | Clone a `studKind` path. |
| selection `v25EntBounds` screw case "188-209" | **188–209**. Correct. | Clone `stud` bounds. |
| selection `v25HitEnt` dispatch "289-290" | `v25EntHit` dispatch at **289–291** (`if (t === 'screw') return v25FastenerHit(...,'screw')`). Correct. | Add `stud`. |
| selection body-grip case "802-810" | `v25GripHandles` screw body-grip at **810–813**. | Clone `stud`. |
| selection "~line 1381 case" | `v25HitHandle` screw case at **1407–1410**. | Clone `stud`. |
| options-bar screw branch "172-194" | **172–194**. Correct. | Clone `v25-stud`. |
| options-bar orient swap "256-263" | screw orient swap at **258–265**. | Clone. |
| options-bar size-change wiring "304-309" | `wire('v25o-screw-size', …)` at **306–311**. | Clone `v25o-stud-size`. |
| dispatch draw route "~line 14" | `if (ent.type === 'screw' …)` at **line 14**. | Add `stud` at line 15. |
| dispatch screw click branch "539-555" | **539–555**. Correct. | Clone `v25-stud`. |
| dispatch screw ghost "738-751" | **746–756** (bolt ghost 730–742; screw ghost 746–756). | Clone. |
| dispatch active-tile map "line 939" | `if (tool === 'v25-screw') return 'd-screw';` at **line 944**. | Add `v25-stud` → `'d-stud'`. |
| BB-rail `d-screw` tile "243-254" | **243–254**. Correct. | Clone `d-stud`. |
| snap face-snap tool list "~line 21" | `if (tool === 'draw-plate' \|\| … \|\| tool === 'v25-screw' \|\| v2PlateActive)` at **line 21**. | Add `\|\| tool === 'v25-stud'`. |
| DXF screw branch "580-660" | `} else if (ent.type === 'screw') {` at **line 580**, closing at **650** (next branch `stiff2` at 651). | Clone `stud` branch after 650, before 651. |
| `lastUsedSection` / `lastUsedOrientation` | Defined in `js/60-tile-palette.js` lines 25 / 29 as `{}`. Confirmed — use `lastUsedSection.stud` / `lastUsedOrientation.stud`. | OK. |
| `computeBoltLength` | `js/21-bolt-grip.js` line 133. Exists (AS 1252 length snap). **Not used by the stud** — catalogue L is fixed. | N/A. |

**One extra observation (not blocking):** `js/72d-v25-plate.js` now exists in the tree (a parallel session's module) even though the playbook says the old V25 plate was deleted. It is unrelated to the stud and is left untouched.

**CRITICAL GAP CONFIRMED:** `BOLT_DB` in `js/03-data-bolts.js` (lines 21–29) starts at **M12**. There is **no M8, no M10**. `BOLT_DB.M16` exists: `{ d:16, pitch:2.00, headAF:27, headH:10.75, nutAF:27, nutH:17.1, washOD:37, washT:3.5, minorD:13.835, threadL:38 }`. The stud drawer reuses `BOLT_DB[size]` for the nut/washer, so **M8/M10 studs would read `undefined` and NaN out**. See §3 Step 2 for the mandatory guard.

---

## 1. Summary + locked decisions

A new 2D-mode fixing: the **Ramset ChemSet chemical-anchor stud** — a fully-threaded rod, cast/chemically bonded into concrete, with a plain washer + hex nut on the projecting end and a 45° chisel-cut embedded end. Drawn to true scale per the manufacturer length for each catalogue size (M8…M24, default **M16**).

It **mirrors the HBS screw** (`js/72i-v25-screw.js`) structurally — single-click placement, a to-scale local-axis `P(s,t)` section profile, one-sided bearing-face snap — and **mirrors the AS 1252 bolt** (`js/72c-v25-bolt.js`) for the nut/washer hex geometry (reusing `BOLT_DB[size]`).

### Locked decisions (from Phase-1 review — do NOT re-litigate)

- **New entity type `stud`.** NOT extending the existing `anchor` callout entity, NOT `bolt2`. The existing `anchor` (`drawAnchor2D` / `V25_ANCHOR_DB.chemset`) is the complementary schedule-note symbol and stays **UNTOUCHED**.
- **Tool id** `'v25-stud'`. **New module** `js/72j-v25-stud.js`. **BB-rail Members tile id** `'d-stud'`.
- **New data file** `js/02g-data-anchor-studs.js` (02f is spell-terms). Defines `CHEMSET_STUDS` (keyed `M8`/`M10`/`M12`/`M16`/`M20`/`M24`), `DEFAULT_CHEMSET_SIZE = 'M16'`, `CHEMSET_SIZES`, and `getStudSpec(key)` (mirror of `getScrewSpec`).
- **Entity fields:** `studSpec` (catalogue key, e.g. `'M16'`) + `studOrient`. Entity shape:
  `{ type:'stud', u, v, studSpec:'M16', studOrient:'v-nutT', rot:0 }`.
- **Orientations** named by the NUT / projecting end (like the bolt): `V25_STUD_ORIENT = end, h-nutL, h-nutR, v-nutT, v-nutB`. **Default `v-nutT`** (nut up, stud embeds down into concrete).
- **Geometry:** FULLY-THREADED rod (thread the whole length); plain washer + hex NUT at the projecting end ONLY (reuse `BOLT_DB[size]` `nutAF`/`nutH`/`washOD`/`washT`/`pitch`/`minorD` via `hexPointsAlongU/V` + the screw-teeth thread path); embedded end is a ~45° single-bevel **CHISEL** cut (asymmetric, corner `[L,+d/2]→[L-d,-d/2]`), **pinned so drawn length == catalogue L**. Optional subtle depth-set tick at the embedment line **only when a host fixture is detected**.
- **Bearing snap:** clone `v25ScrewBearingFace` → `v25StudBearingFace` (one-sided; washer underside lands on the nearest **outside** face on the nut side; 400 mm window; `mem2` + v2 plate). Add `'v25-stud'` to the per-axis face-snap tool list in `js/09-snap.js` line 21.
- **Scope:** **2D-only first**. 3D-mode tile + iso geometry **deferred** (same as the screw shipped). Capacity rules (edge / spacing / embed / torque / min-thickness) are captured as **DATA** on `CHEMSET_STUDS` now; the red-highlight checker (`js/79-checks-anchor.js`) is a **later build** — do NOT build it here.

### Module ownership (`js/72j-v25-stud.js`)
Owns: `V25_STUD_ORIENT`, `v25BuildStudOrientationRow()`, `v25PickAndSetStud(spec)`, `v25StudBearingFace(blk, ent)`, `drawStud2D(blk, ent, cs)` + `drawStud2D_Section` + a thread helper (`drawStudThread`). State is set on `v25State` **AFTER** `v25SetTool`; persistence across tool switches lives on `lastUsedSection.stud` / `lastUsedOrientation.stud` (the `js/60-tile-palette.js` globals).

---

## 2. Files touched (for multi-build conflict detection)

**Every edit is ADDITIVE** — new file, new `else-if` branch, new tile, new symbol, new script tag. No existing line is rewritten in place except the single snap-tool `if`-condition (one `||` clause appended). Dan runs parallel sessions and commits subsets, so nothing here may refactor or reorder existing code.

| File | New/Edit | What | Additive note |
|---|---|---|---|
| `js/02g-data-anchor-studs.js` | **New** | `CHEMSET_STUDS`, `CHEMSET_SIZES`, `DEFAULT_CHEMSET_SIZE`, `getStudSpec()` | Whole new file. |
| `js/72j-v25-stud.js` | **New** | `V25_STUD_ORIENT`, orientation row, picker, bearing-face, `drawStud2D` + section + thread | Whole new file. |
| `index.html` | Edit | 1 stud tile symbol + 5 orient symbols (after line 238); 1 script tag for `02g` (after 1451); 1 script tag for `72j` (after 1529) | Pure insertions; no existing tag/symbol changed. |
| `js/69-v25-dispatch.js` | Edit | draw route (`+1` line @ 15); `v25-stud` click branch (new block); `v25-stud` ghost (new block); active-tile map (`+1` line @ ~944) | New branches / lines only. |
| `js/72-v25-options-bar.js` | Edit | `v25-stud` options branch (new `else if`); orient-row swap (new `if`); `v25o-stud-size` wire (new `wire(...)`) | New branches only. |
| `js/74-v26-bb-rail.js` | Edit | `d-stud` tile object in Members section | New tile object only. |
| `js/09-snap.js` | Edit | append `\|\| tool === 'v25-stud'` to the face-snap `if` (line 21) | Single clause appended — the **only** in-place edit. |
| `js/71-v25-selection.js` | Edit | `v25EntBounds` `stud` case; `v25EntHit` `stud` dispatch; `v25FastenerHit` `stud` path; grip-handle `stud` body-grip; `v25HitHandle` `stud`; inspector `stud` field block | New branches only. |
| `js/45-dxf-export.js` | Edit | `stud` DXF branch (new `else if` after the screw branch) | New branch only. |

**No edits to:** `js/03-data-bolts.js` (the M8/M10 guard lives in the stud drawer, NOT here — adding M8/M10 to `BOLT_DB` would be a non-additive change to a shared catalogue another session may touch), `js/02e-catalogue-lookups.js` (`getStudSpec` lives in `02g`), `js/79-checks-anchor.js` (deferred), `js/60-tile-palette.js` (the `lastUsed*` objects already exist as `{}` and accept a new `.stud` key with no edit).

---

## 3. Phase-by-phase build plan

Run `node --check <file>` after every new/edited JS file. Browser smoke-test through `index.html` at each phase boundary (DevTools console must stay clean). Test in **2D mode** (3D deferred).

### Phase 1 — Data file `js/02g-data-anchor-studs.js`

Create the catalogue. Geometry fields the drawer needs are `d` (nominal) and `L` (total length); the projecting nut/washer come from `BOLT_DB[key]`. Embedment `Le` and the deferred capacity data ride along now.

ChemSet stud geometry — `Le` (effective embedment) and `maxFixt` (max fixture/clamp thickness) are the Ramset ChemSet design-guide values; `d` is nominal, `L` is the standard supplied stud length.

```js
'use strict';

/* ============================================================================
 * 02g-data-anchor-studs.js — Ramset ChemSet chemical-anchor stud catalogue.
 * Band-1 (shared data). Loaded in index.html AFTER 02f-data-spell-terms.js and
 * BEFORE 03-data-bolts.js. Classic <script>, per-file strict; globals flow.
 *
 * A ChemSet stud is a fully-threaded steel rod chemically bonded into concrete,
 * with a plain washer + hex nut on the projecting end. The 2D fixing entity
 * `stud` (js/72j-v25-stud.js) draws it to true scale; the projecting nut/washer
 * hex come from BOLT_DB[key] (03-data-bolts.js) — note BOLT_DB starts at M12, so
 * the drawer synthesises the hex for M8/M10 (see js/72j guard).
 *
 * Fields (mm unless noted):
 *   id      — catalogue key (== thread size, e.g. 'M16')
 *   d       — nominal thread (major) diameter
 *   L       — standard supplied stud length (total, nut end → chisel apex)
 *   Le      — effective embedment depth (top-of-concrete → embedded end zone)
 *   maxFixt — max fixturing thickness the standard stud suits (fallback for the
 *             far-face / depth-tick when no host is detected)
 *   --- deferred capacity DATA (consumed later by js/79-checks-anchor.js) ---
 *   edgeMin    — min edge distance c_min (concrete)
 *   spaceMin   — min spacing s_min (centre-to-centre)
 *   embedMin   — min embedment for the tabulated capacity
 *   torque     — recommended installation torque T_inst (Nm)
 *   tMin       — min concrete member thickness
 *   grade      — stud steel grade (property class)
 * ============================================================================ */

const CHEMSET_STUDS = {
  "M8":  { id:"M8",  d:8,  L:110, Le:80,  maxFixt:20,
           edgeMin:40,  spaceMin:40,  embedMin:80,  torque:10,  tMin:100, grade:"5.8" },
  "M10": { id:"M10", d:10, L:130, Le:90,  maxFixt:25,
           edgeMin:45,  spaceMin:50,  embedMin:90,  torque:20,  tMin:120, grade:"5.8" },
  "M12": { id:"M12", d:12, L:160, Le:110, maxFixt:30,
           edgeMin:50,  spaceMin:60,  embedMin:110, torque:40,  tMin:140, grade:"5.8" },
  "M16": { id:"M16", d:16, L:190, Le:125, maxFixt:40,
           edgeMin:65,  spaceMin:80,  embedMin:125, torque:80,  tMin:160, grade:"5.8" },
  "M20": { id:"M20", d:20, L:260, Le:170, maxFixt:50,
           edgeMin:80,  spaceMin:100, embedMin:170, torque:150, tMin:200, grade:"5.8" },
  "M24": { id:"M24", d:24, L:300, Le:210, maxFixt:60,
           edgeMin:100, spaceMin:120, embedMin:210, torque:200, tMin:240, grade:"5.8" },
};

// Default stud size for the stud tool (friendly first pick).
const DEFAULT_CHEMSET_SIZE = "M16";

// Sizes in ascending order — for the options-bar / inspector Size select.
const CHEMSET_SIZES = ["M8", "M10", "M12", "M16", "M20", "M24"];

/**
 * Retrieve a ChemSet stud spec by catalogue key (e.g. "M16").
 * Returns the spec object, or null if not found. Mirror of getScrewSpec (02e).
 */
function getStudSpec(studId) {
  return (typeof CHEMSET_STUDS === 'object' && CHEMSET_STUDS[studId]) || null;
}
```

> The `Le`/`maxFixt`/capacity numbers above are placeholder-but-plausible ChemSet values. If Dan supplies the exact Ramset ChemSet design-guide table, drop the real figures into this file — it is the single source of truth and no drawer logic depends on the capacity fields (only `d` and `L` are load-bearing for the glyph).

`node --check js/02g-data-anchor-studs.js`.

---

### Phase 2 — The BOLT_DB M8/M10 guard (its own step — do NOT skip)

`BOLT_DB` starts at **M12**. The stud drawer needs `nutAF`, `nutH`, `washOD`, `washT`, `pitch`, `minorD` to draw the projecting nut + washer + thread root. For **M8** and **M10** those lookups return `undefined`, and `undefined/2` → `NaN`, which `rPolygon`/`rFillPolygon` swallow silently (blank glyph, no error). **The guard is mandatory and lives inside `js/72j-v25-stud.js`** (not in `03-data-bolts.js` — that shared catalogue must not be mutated by this session).

Add a helper at the top of `drawStud2D_Section` (and reuse it in the DXF branch) that returns a real bolt-hardware record for ANY size, synthesising M8/M10 from standard ISO hex proportions:

```js
// Nut/washer hardware for the projecting end. BOLT_DB (03-data-bolts.js) starts
// at M12 — synthesise a standard hex + plain washer for M8/M10 from ISO metric
// proportions so the glyph never NaNs on an undefined lookup. d = nominal thread.
function studHardware(d) {
  const key = 'M' + Math.round(d);
  const b = (typeof BOLT_DB === 'object' && BOLT_DB[key]) ? BOLT_DB[key] : null;
  if (b) return b;
  // Synthesised fallback (M8/M10). ISO 4032 hex-nut AF, ISO 7089 plain washer.
  const ISO = {
    8:  { nutAF: 13, nutH: 6.8,  washOD: 16, washT: 1.6, pitch: 1.25, minorD: 6.647 },
    10: { nutAF: 17, nutH: 8.4,  washOD: 20, washT: 2.0, pitch: 1.50, minorD: 8.376 },
  };
  const f = ISO[Math.round(d)] || {
    // last-ditch generic proportions (never hit for catalogue sizes)
    nutAF: d * 1.6, nutH: d * 0.87, washOD: d * 2.0, washT: Math.max(1.6, d * 0.18),
    pitch: Math.max(1, d * 0.15), minorD: d * 0.84,
  };
  return { d: d, headAF: f.nutAF, headH: f.nutH, nutAF: f.nutAF, nutH: f.nutH,
           washOD: f.washOD, washT: f.washT, pitch: f.pitch, minorD: f.minorD,
           threadL: d * 2.3 };
}
```

Then in `drawStud2D_Section`: `const H = studHardware(d);` and read `H.nutAF`, `H.nutH`, `H.washOD`, `H.washT`, `H.pitch`, `H.minorD` (never `BOLT_DB[...]` directly).

**Verify:** place an M8 and an M10 stud in 2D mode — both must render a full nut + washer + thread, console clean, no blank/NaN glyph.

---

### Phase 3 — Module `js/72j-v25-stud.js` (orientation row, picker, bearing-face)

Header + the three non-draw exports. Clone the screw module's structure exactly (swap `screw`→`stud`, `Screw`→`Stud`, `HBSPL…`→`M…`, head→nut naming).

**Header comment** — name the band, ownership, load order (after 72i, before 73-init), the entity shape, and the `BOLT_DB` M8/M10 guard.

**`V25_STUD_ORIENT`** (named by the NUT/projecting end; default `v-nutT`):
```js
const V25_STUD_ORIENT = [
  { id: 'end',     label: 'End-on (plan / nut-on)',  icon: 'icon-orient-stud-end' },
  { id: 'h-nutL',  label: 'Horizontal — nut left',   icon: 'icon-orient-stud-h-nutl' },
  { id: 'h-nutR',  label: 'Horizontal — nut right',  icon: 'icon-orient-stud-h-nutr' },
  { id: 'v-nutT',  label: 'Vertical — nut top',      icon: 'icon-orient-stud-v-nutt' },
  { id: 'v-nutB',  label: 'Vertical — nut bottom',   icon: 'icon-orient-stud-v-nutb' },
];
const V25_STUD_DEFAULT_SPEC = 'M16';
```

**`v25BuildStudOrientationRow()`** — exact clone of `v25BuildScrewOrientationRow` (72i lines 83–115): build `#v25OrientRow`, default `activeId` from `v25State.studOrient` → `lastUsedOrientation.stud` → `'v-nutT'`; each button writes `v25State.studOrient` + `lastUsedOrientation.stud`, then `v25UpdateOptionsBar()` + `requestRender()`.

**`v25PickAndSetStud(spec)`** — clone of `v25PickAndSetScrew` (72i 123–148):
```js
function v25PickAndSetStud(spec) {
  const sz = spec
    || (typeof lastUsedSection !== 'undefined' && lastUsedSection && lastUsedSection.stud)
    || V25_STUD_DEFAULT_SPEC;
  if (typeof v25SetTool === 'function') v25SetTool('v25-stud');
  else if (typeof tool !== 'undefined') tool = 'v25-stud';
  if (typeof v25State !== 'undefined' && v25State) {
    v25State.studSpec = sz;
    v25State.studOrient =
      (typeof lastUsedOrientation !== 'undefined' && lastUsedOrientation && lastUsedOrientation.stud)
        ? lastUsedOrientation.stud
        : (v25State.studOrient || 'v-nutT');
  }
  if (typeof lastUsedSection !== 'undefined' && lastUsedSection) lastUsedSection.stud = sz;
  if (typeof v25UpdateOptionsBar === 'function') v25UpdateOptionsBar();
  if (typeof highlightActiveTile === 'function') highlightActiveTile();
  if (typeof requestRender === 'function') requestRender();
}
```

**`v25StudBearingFace(blk, ent)`** — clone of `v25ScrewBearingFace` (72i 162–228), one-sided, returns the single OUTSIDE face on the NUT side nearest the click. Swap orientation logic to the bolt/stud naming:
```js
function v25StudBearingFace(blk, ent) {
  if (!ent || !ent.studOrient || ent.studOrient === 'end') return null;
  const horiz = (ent.studOrient === 'h-nutL' || ent.studOrient === 'h-nutR');
  const axisIsU = horiz;
  const axisPos  = axisIsU ? ent.u : ent.v;
  const transPos = axisIsU ? ent.v : ent.u;
  // bodyDir: +1 = embedded end toward increasing axis coord (nut at the low side).
  // Nut-left / nut-bottom → nut at low side → body runs +axis.
  const bodyDir = (ent.studOrient === 'h-nutL' || ent.studOrient === 'v-nutB') ? 1 : -1;
  // … identical material loop to v25ScrewBearingFace: WINDOW=400, plate2 + mem2,
  //   transverse-ray test, bearing face = (bodyDir===1)?min(lo,hi):max(lo,hi),
  //   nearest the click wins. Return best or null.
}
```
The material-detection loop body (the `plate2` + `mem2` interval math, `bboxFromPts`, `v25BoltMemberWeb`/`v25Mem2HalfDepth`/`v25EntBounds` reads) is **copied verbatim** from `v25ScrewBearingFace` — only the orientation IDs change. Keep the 400 mm `WINDOW`.

`node --check js/72j-v25-stud.js` (will be incomplete until Phase 4 adds the drawers — check again after).

---

### Phase 4 — `drawStud2D` + `drawStud2D_Section` + `drawStudThread` (in `js/72j`)

The geometry core. See §4 for the full station list and pitfalls. Skeleton mirroring `drawScrew2D` (72i 234–262) + `drawScrew2D_Section` (275–363):

```js
function drawStud2D(blk, ent, cs) {
  const orient = ent.studOrient || 'v-nutT';
  const spec = (typeof getStudSpec === 'function') ? getStudSpec(ent.studSpec)
             : (typeof CHEMSET_STUDS === 'object' ? CHEMSET_STUDS[ent.studSpec] : null);
  const S = spec || { d: 16, L: 190, Le: 125, maxFixt: 40 };   // M16-ish fallback
  // End-on: nut hex + washer ring + stud-core circle + AF crosshair (see §4).
  // (No drawScrewEnt analogue — draw the end-on inline or via a small helper.)
  const col = (cs && typeof cs.getPropertyValue === 'function')
    ? ((cs.getPropertyValue('--entity-color').trim()) || '#222') : '#222';
  const pm = (typeof ppm === 'function') ? ppm() : 1;
  const prevAlpha = ctx.globalAlpha;
  if (ent.opacity != null) ctx.globalAlpha = ent.opacity;
  ctx.save();
  if (orient === 'end') drawStud2D_End(blk, ent, S, col, pm);
  else drawStud2D_Section(blk, ent, S, col, pm, orient);
  ctx.restore();
  ctx.setLineDash([]);
  ctx.globalAlpha = prevAlpha;
  return true;
}
```

- **End-on** (`drawStud2D_End`): the projecting end is a NUT, so draw — outer **washer ring** (dashed, `LW.HID`, `washOD/2`), a **hex nut** outline (`hexPointsAlongU` with AF = `nutAF`, or just a hex via 6 points at `nutAF/2`), the **stud core circle** (`d/2`, light fill), and an AF crosshair. No Torx star (that's the screw). Use `studHardware(S.d)` for `nutAF`/`washOD`.
- **Section** (`drawStud2D_Section`): full §4 implementation — fully-threaded rod, projecting nut+washer, chisel embedded end. Uses `v25StudBearingFace` for the bearing plane, `studHardware` for hex/washer, `drawStudThread` for the teeth.
- **`drawStudThread`**: clone of `drawScrewThread` (72i 373–418) — two rows of leaning sawtooth offset half a pitch + subordinate helix diagonals — but run the thread the **WHOLE length** (`s = sNutUnder … sChiselBase`), tapering crest/root to 0 across the chisel run only. Pitch `= Math.max(H.pitch, 1.6 * drawingScale)`, exaggerated for legibility.

`node --check js/72j-v25-stud.js`. Browser: temporarily can't place yet (tool unwired) — wire Phases 5–7 then test.

---

### Phase 5 — `index.html` (symbols + script tags)

**5a. Stud SVG symbols** — insert after line 238 (after `icon-orient-screw-v-headb`), before `icon-orient-i-sec-h` (239). Mirror the screw symbols but: tile glyph shows a nut-block + full-length thread + a chisel point; orient glyphs are named by nut end. The embedded end is a chisel (asymmetric wedge), not a symmetric point.

```html
<!-- ===== ChemSet anchor-stud icons (tile + orientation row, 72j-v25-stud.js) ===== -->
<!-- Tile: side-on stud — nut block + full-length thread + chisel-cut embedded end -->
<symbol id="icon-stud" viewBox="0 0 20 20">
  <path d="M2.5 6.5 L5.5 6.5 L5.5 13.5 L2.5 13.5 Z" stroke-width="0.9"/>
  <path d="M5.5 7.5 L17 7.5 L18.5 12.5 L5.5 12.5 Z" stroke-width="0.85"/>
  <path d="M7.5 7.6 V12.4 M9.5 7.6 V12.4 M11.5 7.6 V12.4 M13.5 7.6 V12.4 M15.5 7.7 V12.3"
        stroke-width="0.5" opacity="0.7"/>
</symbol>
<!-- Stud end-on (plan / nut-on): hex nut + washer ring + core circle -->
<symbol id="icon-orient-stud-end" viewBox="0 0 20 20">
  <circle cx="10" cy="10" r="7" stroke-dasharray="2 1.5" opacity="0.6"/>
  <path d="M5.7 6.3 L14.3 6.3 L16.5 10 L14.3 13.7 L5.7 13.7 L3.5 10 Z" stroke-width="0.85"/>
  <circle cx="10" cy="10" r="3.2"/>
</symbol>
<!-- Stud horizontal section, nut left: nut block L, threaded rod, chisel R -->
<symbol id="icon-orient-stud-h-nutl" viewBox="0 0 20 20">
  <path d="M2.5 6 L5.5 6 L5.5 14 L2.5 14 Z" stroke-width="0.85"/>
  <path d="M5.5 7.5 L16 7.5 L18.5 12.5 L16 9 L5.5 9 Z" stroke-width="0.8"/>
  <path d="M5.5 7.5 H17 M5.5 12.5 H16" stroke-width="0.45" opacity="0.6"/>
  <path d="M7.5 7.6 V12.4 M10 7.6 V12.4 M12.5 7.6 V12.4 M15 7.7 V11.5" stroke-width="0.5" opacity="0.7"/>
  <line x1="1.5" y1="10" x2="18.5" y2="10" stroke-dasharray="2 1.5" stroke-width="0.5" opacity="0.55"/>
</symbol>
<!-- Stud horizontal section, nut right: nut block R, chisel L -->
<symbol id="icon-orient-stud-h-nutr" viewBox="0 0 20 20">
  <path d="M14.5 6 L17.5 6 L17.5 14 L14.5 14 Z" stroke-width="0.85"/>
  <path d="M14.5 7.5 L4 7.5 L1.5 12.5 L4 9 L14.5 9 Z" stroke-width="0.8"/>
  <path d="M12.5 7.6 V12.4 M10 7.6 V12.4 M7.5 7.6 V12.4 M5 7.7 V11.5" stroke-width="0.5" opacity="0.7"/>
  <line x1="1.5" y1="10" x2="18.5" y2="10" stroke-dasharray="2 1.5" stroke-width="0.5" opacity="0.55"/>
</symbol>
<!-- Stud vertical section, nut top: nut block T, chisel B -->
<symbol id="icon-orient-stud-v-nutt" viewBox="0 0 20 20">
  <path d="M6 2.5 L14 2.5 L14 5.5 L6 5.5 Z" stroke-width="0.85"/>
  <path d="M7.5 5.5 L7.5 16 L12.5 18.5 L9 16 L9 5.5 Z" stroke-width="0.8"/>
  <path d="M7.6 7.5 H12.4 M7.6 10 H12.4 M7.6 12.5 H12.4 M7.7 15 H11.5" stroke-width="0.5" opacity="0.7"/>
  <line x1="10" y1="1.5" x2="10" y2="18.5" stroke-dasharray="2 1.5" stroke-width="0.5" opacity="0.55"/>
</symbol>
<!-- Stud vertical section, nut bottom: nut block B, chisel T -->
<symbol id="icon-orient-stud-v-nutb" viewBox="0 0 20 20">
  <path d="M6 14.5 L14 14.5 L14 17.5 L6 17.5 Z" stroke-width="0.85"/>
  <path d="M7.5 14.5 L7.5 4 L12.5 1.5 L9 4 L9 14.5 Z" stroke-width="0.8"/>
  <path d="M7.6 12.5 H12.4 M7.6 10 H12.4 M7.6 7.5 H12.4 M7.7 5 H11.5" stroke-width="0.5" opacity="0.7"/>
  <line x1="10" y1="1.5" x2="10" y2="18.5" stroke-dasharray="2 1.5" stroke-width="0.5" opacity="0.55"/>
</symbol>
```

**5b. Script tags.** Insert `02g` after line 1451 (`02f`), before line 1452 (`03`):
```html
<!-- Ramset ChemSet anchor-stud catalogue (added 2026-06-04). See PlannedBuilds/m16-anchor-stud/. -->
<script src="js/02g-data-anchor-studs.js"></script>
```
Insert `72j` after line 1529 (`72i`), before line 1530 (`73-init`):
```html
<script src="js/72j-v25-stud.js"></script>
```

Browser smoke-test: page loads, console clean, the new `<symbol>`s resolve.

---

### Phase 6 — `js/69-v25-dispatch.js` (draw route, click, ghost, active-tile)

**6a. Draw route** — after line 14 (the `screw` route), add line 15:
```js
if (ent.type === 'stud' && typeof drawStud2D === 'function') { drawStud2D(blk, ent, cs); return true; }
```

**6b. Click branch** — clone the `v25-screw` block (539–555) as a new branch (put it right after the screw branch):
```js
if (tool === 'v25-stud') {
  // Single-click drops a ChemSet anchor stud. Spec / orientation come from
  // v25State (set by v25PickAndSetStud + the options-bar orientation row in
  // js/72j-v25-stud.js). The glyph self-orients via ent.studOrient; section
  // orientations snap the washer underside to a detected plate/member outside
  // face at draw time (v25StudBearingFace), so the placed u,v is just the click.
  const ent = v25Add('stud', {
    studSpec: v25State.studSpec
      || (typeof lastUsedSection !== 'undefined' && lastUsedSection.stud) || 'M16',
    studOrient: v25State.studOrient
      || (typeof lastUsedOrientation !== 'undefined' && lastUsedOrientation.stud) || 'v-nutT',
    u: cu, v: cv, rot: 0,
  });
  v25Selected = [ent.id];
  if (typeof v25UpdateInspector === 'function') v25UpdateInspector();
  return true;
}
```

**6c. Ghost** — clone the screw ghost (746–756) in `v25DrawPreview`:
```js
if (tool === 'v25-stud' && typeof drawStud2D === 'function') {
  const _gst = {
    type: 'stud',
    studSpec:  (typeof v25State !== 'undefined' && v25State.studSpec)  || 'M16',
    studOrient:(typeof v25State !== 'undefined' && v25State.studOrient)|| 'v-nutT',
    u: cu, v: cv, rot: 0, opacity: 0.45, _preview: true,
  };
  ctx.save();
  drawStud2D(blk, _gst, cs);
  ctx.restore();
}
```

**6d. Active-tile map** — after line 944 (`v25-screw` → `'d-screw'`):
```js
if (tool === 'v25-stud') return 'd-stud';
```

`node --check js/69-v25-dispatch.js`.

---

### Phase 7 — `js/72-v25-options-bar.js` (Size select + orient row + wire)

**7a. Options branch** — clone the `v25-screw` branch (172–194) as a new `else if` (put it right after the screw branch). Size from `CHEMSET_SIZES` showing the catalogue length per size:
```js
} else if (tool === 'v25-stud') {
  // ChemSet anchor stud — Size (M8…M24 from the 02g catalogue) + the live
  // orientation row (swapped in below, like the bolt/screw). (72j-v25-stud.js)
  const STUDS = (typeof CHEMSET_STUDS === 'object' && CHEMSET_STUDS) ? CHEMSET_STUDS : {};
  const sizes = (typeof CHEMSET_SIZES === 'object' && CHEMSET_SIZES.length)
    ? CHEMSET_SIZES : Object.keys(STUDS);
  const curSpec = v25State.studSpec
    || (typeof lastUsedSection !== 'undefined' && lastUsedSection.stud) || 'M16';
  const opt = (id) => {
    const s = STUDS[id];
    const lab = s ? (id + ' × ' + s.L) : id;     // e.g. "M16 × 190"
    return `<option value="${id}"${id === curSpec ? ' selected' : ''}>${lab}</option>`;
  };
  html += `<strong>Anchor stud</strong>`;
  html += fld('Size', `<select id="v25o-stud-size" style="width:120px">${sizes.map(opt).join('')}</select>`);
  html += fld('Orientation', `<span id="v25OrientSlot"></span>`);
```

**7b. Orient-row swap** — clone the screw swap (258–265), after it:
```js
// Swap the stud orientation-row placeholder for the live element (the row
// builder reads/writes v25State.studOrient itself). (72j-v25-stud.js)
if (tool === 'v25-stud') {
  const slot = bar.querySelector('#v25OrientSlot');
  if (slot && typeof v25BuildStudOrientationRow === 'function') {
    slot.replaceWith(v25BuildStudOrientationRow());
  }
}
```

**7c. Size-change wire** — clone the `v25o-screw-size` wire (306–311), after it:
```js
wire('v25o-stud-size', e => {
  v25State.studSpec = e.target.value;
  if (typeof lastUsedSection !== 'undefined') lastUsedSection.stud = v25State.studSpec;
  if (typeof highlightActiveTile === 'function') highlightActiveTile();
  if (typeof requestRender === 'function') requestRender();
});
```

`node --check js/72-v25-options-bar.js`.

---

### Phase 8 — `js/74-v26-bb-rail.js` (the `d-stud` Members tile)

Clone the `d-screw` tile (243–254). Place it immediately after `d-screw` in the Members `tiles:` array. 2D-only with a 3D "coming soon" hint:
```js
{ id: 'd-stud', kind: 'tool', label: 'Stud',
  sub: 'ChemSet', icon: 'icon-stud',
  onClick: () => {
    // 2D mode → ChemSet anchor-stud fixing (stud entity) via v25PickAndSetStud
    //   (js/72j-v25-stud.js). 3D-mode stud is a planned follow-on, so other
    //   modes just hint.
    if (sheetMode === '2d' && typeof v25PickAndSetStud === 'function') {
      v25PickAndSetStud(lastUsedSection.stud || 'M16');
    } else if (typeof setStatus === 'function') {
      setStatus('ChemSet stud: switch to 2D paper-space mode to place (3D coming soon)');
    }
  } },
```

`node --check js/74-v26-bb-rail.js`. Browser: the Draw tab → Members now shows a "Stud" tile that arms `v25-stud`, shows the options bar (Size + orientation row), and single-click drops a stud.

---

### Phase 9 — `js/09-snap.js` (face-snap tool list — the one in-place edit)

Line 21, append `|| tool === 'v25-stud'` to the `if` condition:
```js
if (tool === 'draw-plate' || tool === 'draw-member' || tool === 'v25-screw' || tool === 'v25-stud' || v2PlateActive) {
```
`node --check js/09-snap.js`. Verify: with the stud tool armed, the cursor snaps to a `mem2` flange / v2-plate face edge (same as the screw).

---

### Phase 10 — `js/71-v25-selection.js` (bounds, hit, fastener-hit, grips, hit-handle, inspector)

Six additive branches. Clone each screw case to a `stud` case verbatim, swapping field names (`screwSpec`→`studSpec`, `screwOrient`→`studOrient`, `getScrewSpec`→`getStudSpec`, `HBS_PLATE_SCREWS`→`CHEMSET_STUDS`, head→nut, `dK`→`washOD`, and the `S` fallback to a stud-shaped record). **The bearing snap and axis mapping MUST replicate `drawStud2D_Section` exactly** — copy the same `axisIsU`/`bodyDir`/`sBear`/`axisAt` as the drawer.

**10a. `v25EntBounds`** — clone the screw case (188–209) after it. For the stud, the footprint half-width is `washOD/2` (washer is the widest projecting feature), not `dK`:
```js
if (ent.type === 'stud') {
  const S = (typeof getStudSpec === 'function' && getStudSpec(ent.studSpec))
          || (typeof CHEMSET_STUDS === 'object' && CHEMSET_STUDS[ent.studSpec])
          || { d: 16, L: 190 };
  const H = (typeof studHardware === 'function') ? studHardware(S.d) : { washOD: S.d * 1.85, nutH: S.d * 0.87, washT: S.d * 0.18 };
  const halfW = (H.washOD || S.d * 1.85) / 2;
  const orient = ent.studOrient || 'v-nutT';
  if (orient === 'end') {
    return { L: ent.u - halfW, R: ent.u + halfW, B: ent.v - halfW, T: ent.v + halfW };
  }
  // Section: washer underside at the placed u,v (the live glyph snaps it to a
  // face at draw time); rod runs ~L into the material; nut/washer overhang.
  const proj = (H.nutH || 12) + (H.washT || 3.5) + 4;   // nut + washer protrusion
  const bodyLen = (S.L || 190) + 4;
  const nutLow = (orient === 'h-nutL' || orient === 'v-nutB');   // body toward +axis
  const isH = (orient === 'h-nutL' || orient === 'h-nutR');
  const axLo = nutLow ? -proj    : -bodyLen;
  const axHi = nutLow ?  bodyLen :  proj;
  if (isH) return { L: ent.u + axLo, R: ent.u + axHi, B: ent.v - halfW, T: ent.v + halfW };
  return { L: ent.u - halfW, R: ent.u + halfW, B: ent.v + axLo, T: ent.v + axHi };
}
```
> Note: `studHardware` is defined in `js/72j` (loaded before `js/73-init`; `71` loads earlier but the function is only *called* at runtime, so the `typeof` guard is correct). The fallback covers the load-order edge.

**10b. `v25EntHit` dispatch** — after the `screw` dispatch (289–291):
```js
if (t === 'stud') {
  return v25FastenerHit(blk, ent, cursorPx, ctx, 'stud');
}
```

**10c. `v25FastenerHit`** — add a `kind === 'stud'` branch (clone the screw branch 457–487). **Replicate `drawStud2D_Section` axis mapping exactly.** End-on tol uses the nut/washer radius:
```js
if (kind === 'stud') {
  const S = (typeof getStudSpec === 'function' && getStudSpec(ent.studSpec))
          || (typeof CHEMSET_STUDS === 'object' && CHEMSET_STUDS[ent.studSpec])
          || { d: 16, L: 190 };
  const H = (typeof studHardware === 'function') ? studHardware(S.d) : { washOD: S.d * 1.85 };
  const orient = ent.studOrient || 'v-nutT';
  if (orient === 'end') {
    const p = real2Px(ent.u, ent.v);
    const d = Math.hypot(cursorPx.x - p.x, cursorPx.y - p.y);
    const tol = ((H.washOD || S.d * 1.85) / 2) * ppmm + FLOOR_PX;
    return (d <= tol) ? { precise: true, score: d } : null;
  }
  const axisIsU = (orient === 'h-nutL' || orient === 'h-nutR');
  const trans = axisIsU ? ent.v : ent.u;
  const bodyDir = (orient === 'h-nutL' || orient === 'v-nutB') ? 1 : -1;
  const d = S.d || 16;
  const L = S.L || 190;
  // sBear: washer underside = bearing plane. Match drawStud2D_Section's choice
  // (see §4) — sBear = nutH + washT (projection nut→washer stack from origin).
  const sBear = (H.nutH || d * 0.87) + (H.washT || d * 0.22);
  const bearing = (typeof v25StudBearingFace === 'function') ? v25StudBearingFace(blk, ent) : null;
  const junction = (bearing != null) ? bearing : (axisIsU ? ent.u : ent.v);
  const axisAt = (s) => junction + bodyDir * (s - sBear);
  const a0 = axisAt(-2), aL = axisAt(L + 2);
  const A = axisIsU ? real2Px(a0, trans) : real2Px(trans, a0);
  const B = axisIsU ? real2Px(aL, trans) : real2Px(trans, aL);
  const dist = distSeg(cursorPx, A, B);
  const tol = Math.max(FLOOR_PX, ((H.washOD || S.d * 1.85) / 2) * ppmm);
  return (dist <= tol) ? { precise: true, score: dist } : null;
}
```
> **CRITICAL:** the `sBear` value here MUST equal the one chosen in `drawStud2D_Section` (§4). They are tied — if you change the station origin in the drawer, change it here too, or the pick floats off the drawn centreline.

**10d. Grip-handle body-grip** — after the screw case (810–813) in `v25GripHandles`:
```js
} else if (ent.type === 'stud') {
  // Single body grip at the stud nut end — drag to reposition (mirrors bolt2/screw).
  out.push({ key: 'body', u: ent.u, v: ent.v });
}
```

**10e. `v25HitHandle`** — after the screw case (1407–1410):
```js
if (ent.type === 'stud') {
  // Click anywhere on the glyph drags it (mirrors bolt2/screw — simple point move).
  return 'body';
}
```

**10f. Inspector field block** — after the screw block (1985–1993), before the closing `}` (1994):
```js
} else if (ent.type === 'stud') {
  // ChemSet anchor stud (js/72j-v25-stud.js). studSpec is the 02g catalogue key;
  // changing it / the orientation just re-renders via the generic apply handler.
  let studIds = (typeof CHEMSET_STUDS === 'object') ? Object.keys(CHEMSET_STUDS) : [];
  if (ent.studSpec && !studIds.includes(ent.studSpec)) studIds = [ent.studSpec, ...studIds];
  sel('Size (ChemSet)', 'studSpec', studIds);
  sel('Orientation', 'studOrient',
    (typeof V25_STUD_ORIENT === 'object' && V25_STUD_ORIENT)
      ? V25_STUD_ORIENT.map(o => o.id) : ['end','h-nutL','h-nutR','v-nutT','v-nutB']);
}
```

`node --check js/71-v25-selection.js`. Browser: select a placed stud (click on its centreline / nut) → inspector shows Size + Orientation selects; changing either re-renders; drag moves it; orientation sections snap-pick correctly.

---

### Phase 11 — `js/45-dxf-export.js` (the `stud` DXF branch)

Clone the screw branch (580–650) as a new `else if (ent.type === 'stud')` after the screw branch (after line 650, before `stiff2` at 651). Mirror `drawStud2D_Section` geometry on the **S-BOLT** layer: nut hex + washer + full-length thread + chisel embedded end. Use the same `studHardware` synthesis for M8/M10 (inline it or guard `BOLT_DB`). End-on → nut hex + washer ring + core circle + AF cross.

Key differences from the screw DXF branch:
- thread runs the WHOLE length (`sNutUnder … sChiselBase`), not just from `sThread`;
- the embedded end is a **chisel** (asymmetric single bevel `[L,+d/2]→[L-d,-d/2]`), not a symmetric cone — emit the body envelope with the chisel corner, not a centred apex;
- projecting end is a **hex nut + washer** (`hexAlongU/V` + washer rect), not a pan head + collar.

`node --check js/45-dxf-export.js`. Verify: DXF-export a sheet with a stud → open in a DXF viewer, the stud nut/washer/thread/chisel match the canvas.

---

### Phase 12 — End-to-end verification (see §5).

---

## 4. `drawStud2D_Section` geometry — implementation notes

Local axis `s` runs from the **nut-top / projecting end (s=0)** toward the **chisel apex (s=L)**. The transverse coordinate `t` is the half-width off the centreline. Everything is built in `(s,t)` and mapped through `P(s,t)` so all four section orientations share one code path and the bearing snap keeps working.

### Hardware + diameters (catalogue-pinned)
```js
const H = studHardware(S.d);                 // nut/washer hardware (M8/M10-safe)
const d   = S.d   || 16;                     // nominal thread (crest) dia
const L   = S.L   || 190;                    // total length (catalogue, FIXED)
const d2  = (H.minorD || d * 0.84);          // thread root (minor) dia
const nutAF = H.nutAF, nutH = H.nutH;        // hex nut across-flats / height
const washOD = H.washOD, washT = H.washT;    // plain washer OD / thickness
const dh = d/2, d2h = d2/2, washODh = washOD/2, nutAFh = nutAF/2;
```

### Station list (origin at the projecting nut-top, s=0)

| Station | `s` value | What | Half-width `t` |
|---|---|---|---|
| Nut top (free end) | `s = 0` | top of the hex nut (projecting end face) | — |
| **Projecting thread tail** (flat cap, NOT a point) | `s = sBear - tailProj`, `tailProj = max(2*pitch, (L-Le) - (nutH+washT))` | the rod end protruding past the nut (the bit you'd cut/leave proud); FLAT cap, not a point | crest `dh`, root `d2h` |
| Nut outer (chamfered hex) | `s = sBear - washT - nutH` | hex nut outer face | `nutAFh` (via `hexPointsAlongU/V`) |
| Nut underside / washer outer | `s = sBear - washT` | nut bottom = washer top | nut `nutAFh`, washer `washODh` |
| **BEARING PLANE** = washer underside | `s = sBear` | washer bottom — lands on the detected face | `washODh` (crisp full-width bearing line) |
| Fixture far face / top-of-concrete | `s = sBear + t_fixture` | detected clamp thickness, else catalogue `maxFixt` | — |
| Depth-set tick (subtle) | at the concrete face, only if host detected | `LW.HID`, ~0.6 alpha | small cross-tick |
| Chisel base | `s = L - d` | start of the 45° single bevel | from `d2h`→ corner |
| Chisel tip apex | `s = L` | embedded end point | 0 |

**Origin / bearing tie:** set `sBear = nutH + washT` (so the stack nut→washer projects from `s=0` to the bearing plane). `axisAt(sBear) = junction = v25StudBearingFace() ?? click`. `axisAt(s) = junction + bodyDir*(s - sBear)`. **This exact `sBear` is replicated in `v25FastenerHit` (§10c) — keep them identical.**

### Body envelope (single filled polygon, head→tip)
Build the half-profile top edge as `(s,t)` pairs, then mirror to `-t` reversed (mirror the screw's `bodyTop` construction):
```
[ {s:0,           t:dh},            // projecting tail flat cap top  (or start at sTail)
  {s:sNutUnder,   t:dh},            // thread up to nut underside (full thread)
  {s:sBear,       t:dh},            // through the washer zone (still rod dia)
  {s:L-d,         t:dh},            // rod to the chisel base
  {s:L,           t:+dh? },         // *** chisel: asymmetric ***
]
```
**Chisel (asymmetric single bevel):** the apex is NOT centred. The bevel edge runs from `[L, +dh]` (top corner, full width at the apex station) down to `[L-d, -dh]` (bottom corner, one diameter back). So the bottom edge of the body reaches `-dh` at `s=L-d` and the top edge reaches `+dh` at `s=L`, joined by the single diagonal. Concretely, after the top run to `{s:L, t:+dh}` add the bevel point `{s:L-d, t:-dh}` then close back along the bottom. **Pin the apex at `s=L` so the drawn length == catalogue L** (do NOT shorten for the chisel).

### Thread (full length)
`drawStudThread(blk, P, sStart, sChiselBase, L, dh, d2h, d, col, pm)` where `sStart = sTail` (the projecting tail) — thread runs the WHOLE rod. Clone `drawScrewThread` (72i 373–418):
- two rows of filled leaning sawtooth teeth, the second row offset half a pitch (the helix read), plus subordinate helix diagonals;
- `pitch = Math.max(H.pitch, 1.6 * drawingScale)` — **exaggerate** so teeth never collapse to grey fuzz at coarse scales;
- crest at `dh`, root at `d2h`;
- taper crest/root to 0 **only across the chisel run** (`s > sChiselBase`), so teeth shrink into the chisel — `hAt(s, base) = s <= sChiselBase ? base : base * max(0, (L-s)/max(0.5, L-sChiselBase))`.

### Bearing line + nut + washer (overlay, heavier)
- Draw the **crisp full-width bearing line** at `±washOD/2`, `LW.VIS_HEAVY` (the "washer bears here" line — the crispest line in the glyph).
- Hex nut: `hexPointsAlongU(cy, sNutOuterPx, sNutUnderPx, nutAFh)` (or `…AlongV`), fill `colorAlpha(col,0.10)`, stroke `LW.VIS`.
- Washer: rect from the nut underside to the bearing plane at `±washOD/2`, fill `0.10`, stroke `LW.VIS`.

### Centreline + depth tick
- Centreline first (under everything): `colorAlpha(col,0.5)`, `LW.CL`, `DASH.CL_BOLT`, from `axisAt(sTail-2)` to `axisAt(L+2)`.
- Depth-set tick: ONLY if `t_fixture` came from a real detected host (not the `maxFixt` fallback). A short cross-tick at the concrete face (`s = sBear + t_fixture`), `LW.HID`, ~0.6 alpha.

### Lineweights (summary)
| Element | Fill | Stroke |
|---|---|---|
| body / teeth | `colorAlpha(col,0.55)` | `LW.VIS` |
| nut / washer | `colorAlpha(col,0.10)` | `LW.VIS` |
| bearing line | — | `LW.VIS_HEAVY` |
| chisel edge | (part of body) | `LW.VIS` |
| centreline | — | `LW.CL`, `DASH.CL_BOLT` |
| depth tick (host only) | — | `LW.HID`, ~0.6 alpha |

### PITFALLS (do not skip — these silently break the glyph)
1. **`P(s,t)` MUST return `[u,v]` ARRAYS, not `{u,v}` objects.** `rPolygon`/`rFillPolygon` (js/33) read `pts[i][0]`/`pts[i][1]`; passing objects makes every coordinate `undefined` → `NaN` → a silently blank glyph, no console error. Use:
   ```js
   const P = axisIsU ? (s, t) => [axisAt(s), trans + t]
                     : (s, t) => [trans + t, axisAt(s)];
   ```
2. **Exaggerate the thread pitch** (`max(H.pitch, 1.6*drawingScale)`) — true M16 pitch (2.0 mm) collapses to fuzz at typical detail scales.
3. **save/restore `globalAlpha`** — capture `prevAlpha = ctx.globalAlpha` at the top of `drawStud2D`, restore at the end (the ghost preview sets `ent.opacity = 0.45`). Already in the skeleton.
4. **No shank step** — the stud is FULLY THREADED; do NOT add a smooth-shank `dS` zone (that's the screw). The body is one rod dia `d` from the tail to the chisel base.
5. **The chisel is ASYMMETRIC** — single 45° bevel `[L,+dh]→[L-d,-dh]`. Do NOT draw a centred symmetric point (that's the screw tip).
6. **Do NOT derive L from a clamp grip.** Catalogue `L` is fixed; the bolt's `v25BoltClampSpan` length logic does NOT apply. Only the bearing PLANE moves (via `v25StudBearingFace`); the rod length is always `S.L`.
7. **One-sided snap only** — `v25StudBearingFace` returns the single nut-side outside face, never a two-sided span.
8. **`sBear` ties drawer ↔ hit-test** — the value in `drawStud2D_Section` and in `v25FastenerHit` (§10c) must be byte-identical or the pick floats off the line.

---

## 5. Verification checklist

Run after the full build. The reliable signal is **numeric draw-capture**, not screenshots (per memory `v25-fixing-drawing`).

### 5.1 Static checks
- [ ] `node --check` clean on: `js/02g-data-anchor-studs.js`, `js/72j-v25-stud.js`, `js/69-v25-dispatch.js`, `js/72-v25-options-bar.js`, `js/74-v26-bb-rail.js`, `js/09-snap.js`, `js/71-v25-selection.js`, `js/45-dxf-export.js`.
- [ ] `index.html` loads; DevTools console clean; no unresolved `#icon-stud` / `#icon-orient-stud-*` `<use>` warnings.
- [ ] `grep` confirms `getStudSpec`, `CHEMSET_STUDS`, `V25_STUD_ORIENT`, `drawStud2D`, `v25StudBearingFace`, `v25PickAndSetStud` each defined exactly once.

### 5.2 Numeric draw-capture asserts (console)
Stub `rPolygon`/`rFillPolygon`/`rLine`/`hexPointsAlongV` to log their args (or wrap them), place one **M16 `v-nutT`** stud at a known `(u,v)` with no host (so `junction == click`, `t_fixture == maxFixt`), and assert:
- [ ] **Nut hex** outer span = `nutH` (M16: 17.1) at half-width `nutAF/2` (M16: 13.5); 6 hex points present.
- [ ] **Washer** rect width = `washT` (M16: 3.5) at half-width `washOD/2` (M16: 18.5).
- [ ] **Bearing line** drawn at exactly `±washOD/2` about the centreline, at `axisAt(sBear) == junction` (the click v for `v-nutT`), `LW.VIS_HEAVY`.
- [ ] **Thread** teeth present from the tail through to ~`L-d`; crest reaches `d/2` (8.0), root `minorD/2` (M16: 6.9175); pitch == `max(2.0, 1.6*drawingScale)`.
- [ ] **Chisel** body has the asymmetric corner: a vertex at `(L-d, -d/2)` and the apex at `s=L`; the drawn axial extent of the body == `L` (190) within rounding — i.e. **drawn length == catalogue L**.
- [ ] **No NaN** in any logged coordinate (the `[u,v]`-array pitfall guard).
- [ ] Repeat for **M8** and **M10**: nut/washer come from `studHardware` synthesis (M8 nutAF 13, M10 nutAF 17), NOT NaN.

### 5.3 Bearing-snap test
- [ ] Draw a v2 plate (or a `mem2` SHS) edge-on. Arm `v25-stud` `v-nutT`, click ~150 mm above the plate's top face. The washer underside (`sBear`) lands on the plate top face, the rod embeds **below** it, the nut/washer sit **above**. Confirm via draw-capture that `junction == plate-top-face-v`, not the click `v`.
- [ ] Click on the OTHER side / >400 mm away → no snap (`v25StudBearingFace` returns null), washer underside sits at the click.
- [ ] `h-nutL` / `h-nutR` / `v-nutB`: snap picks the correct nut-side face each time (mirror the screw's behaviour).

### 5.4 Interaction + persistence
- [ ] Draw-tab → Members → **Stud** tile arms `v25-stud`; options bar shows Size (M8…M24, "M16 × 190" labels) + the 5-icon orientation row; ghost follows the snapped cursor.
- [ ] Change Size in the options bar → ghost + subsequent placements use it; re-pick the tile → last size/orientation restored (`lastUsedSection.stud` / `lastUsedOrientation.stud`).
- [ ] Select a placed stud → inspector shows Size + Orientation; changing either re-renders live; drag (body grip) moves it; precise pick lands on the centreline at low zoom.
- [ ] Save the sheet, reload → the stud round-trips (automatic via `entities2D[viewKey]` JSON; no save/load code needed).
- [ ] DXF-export → stud appears on **S-BOLT** with nut hex + washer + full thread + chisel; end-on variant exports nut hex + washer ring + core circle + cross.
- [ ] The existing `anchor` ChemSet callout tile (Model palette "Bolts & Anchors") still works and is visually distinct — the new `stud` did not disturb it.

### 5.5 Quality-bar (zoomed look vs the data sheet)
- [ ] Zoom in on a placed M16 section stud. Compare against the Ramset ChemSet stud detail: full-length thread reads as a screw thread (not a knurl), the hex nut + plain washer are recognisable AS hardware, the bearing line is the crispest line, the chisel embedded end is an asymmetric single bevel. Lineweights follow the `LW` table (body `VIS`, bearing `VIS_HEAVY`, centreline `CL` dashed). If any element is visibly worse than the STP 6011 fastener quality bar, fix before "done".
