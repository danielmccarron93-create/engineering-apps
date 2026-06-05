# M16 anchor stud — progress

**Status: COMPLETE** (2026-06-04). All phases done + browser-verified (clean console;
numeric draw-capture exact in all four section orientations; bearing snap, interactive
placement, options bar, selection, and DXF all confirmed).

| Phase | What | Status |
|---|---|---|
| 0 | Orient — read CLAUDE.md, kickoff brief, data sheets | ✅ done |
| 1 | Review + geometry (`/workflows`): fit-audit, geometry recipe, catalogue, build-spec + adversarial critic | ✅ done |
| 2 | Surfaced open questions → Dan decided (below) | ✅ done |
| 3 | New files: `js/02g-data-anchor-studs.js` + `js/72j-v25-stud.js` | ✅ done |
| 4 | Wire all surfaces (index.html, 69, 74, 72, 09, 71, 45) | ✅ done |
| 5 | Verify (numeric draw-capture + render-pipeline + bearing snap + interactive + DXF + screenshots) | ✅ done |
| 6 | CHANGELOG + planning-folder docs + memory | ✅ done |

## Decisions (Dan, Phase 2)
- **Scope:** 2D-only first; 3D-mode tile + iso geometry deferred (as the screw shipped).
- **Sizes:** full **M8–M24** family (catalogue already built; M8/M10 get the AS-1112/1237 nut/washer fallback since `BOLT_DB` starts at M12).
- **Embed depiction:** **"also hatch the bond zone"** — draw the to-scale rod (nut + washer + full thread + 45° chisel), washer snaps to the bearing face, AND hatch the embedded (bonded) length + drill-hole walls + concrete-face line + depth-set tick.

## Entity model (confirmed by the Phase-1 fit-audit)
A **new `stud` type** mirroring the screw (`72i`): single-click, to-scale local-axis
`P(s,t)` section profile, one-sided bearing snap. NOT an extension of the existing
`anchor` callout entity (a schematic leader+text symbol — wrong shape; left untouched)
and NOT `bolt2` (two-sided clamp — wrong interaction model for a bonded one-ended stud).

## Verification (browser, /tmp copy, launch config `sd-stud`, port 8901)
- Clean load, no console errors; all 14 new globals defined; catalogue exact (M16: L190/Le165/embed125); all 6 SVG icons present; CHEMSET tile live in the Members palette.
- **Numeric draw-capture exact** (M16, v-nutT, no host): projection +25 = L−Le ✓; embedded tip at −165 = Le ✓; washer span 37 = washOD ✓; bearing line at the click v ✓; asymmetric chisel `(+8,−165)→(−8,−149)` ✓; hex nut ±13.5 AF chamfered ✓; bond hatch from the concrete face (−40) to the hole bottom ✓. All four section orientations symmetric (axisSpan 202.9, transSpan 37).
- **Bearing snap exact** (one-sided): v-nutT above a plate → washer on the plate TOP (face 60, fixtureThk 20); v-nutB below → BOTTOM (face 40); >400 mm away → null; transverse miss → null.
- **Render pipeline** reaches `drawStud2D` for every placed stud (87 segments painted); end-on renders without throw.
- **Interactive path:** `v25PickAndSetStud('M20')` → tool `v25-stud`, options bar + 5-button orientation row build, active tile `d-stud`, a real dispatch click places `{type:'stud', studSpec:'M20', studOrient:'v-nutT'}`.
- **DXF** (`_dxfEmit2DEntity`): 9 LINEs + 3 LWPOLYLINEs on S-BOLT per section orientation; 2 circles + cross for end-on; M8 (BOLT_DB gap) works via the fallback; zero errors.
- **Screenshots:** the glyph reads as a proper ChemSet stud — chamfered hex nut, washer bearing on the baseplate, solid grip rod through the plate, threaded rod with sawtooth/helix, drill-hole walls, 45° chisel tip, dashed centreline.

## Bug found + fixed during verification
**Thread overshoot.** The shared `drawThreadAlongU/V` (js/33) has a distance-based stop
condition tuned for short bolt thread zones; over the stud's long full-rod span it
marched spurious sawtooth teeth ~24 mm **past the chisel** into the bond zone (caught by
the numeric draw-capture — invisible in a screenshot). Fixed with a self-contained,
bounded `drawStudThread` in `js/72j` (fixed `for k < n` loop, n = floor(span/pitch)). The
shared bolt helper was **not** modified (it is used by the bolt; additive-only constraint).

## As-built reconciliation vs `01-build-spec.md`
The build-spec doc was authored before the two new files existed; a few of its details
were superseded during the build (the adversarial critic flagged these). The **as-built
code is authoritative**; the deviations:
- `js/02g` was written with the **real** Ramset field names (`ec/ac/embed/Tr/bm/fy_cs/Z/codes/Le`), not the spec's placeholder names (`edgeMin/torque/…`). The deferred `js/79-checks-anchor.js` must read the real names.
- The M8/M10 nut/washer guard is named **`STUD_NUT_FALLBACK` + `studDims()`** in `js/72j` (not the spec's `studHardware`).
- The chisel polygon is **hand-built asymmetric** (`[+d/2 at L] → [−d/2 at L−d]`), not mirrored from the screw's symmetric tip (the spec's "mirror the screw" line was wrong for an asymmetric chisel — correctly avoided).
- Thread uses the local bounded `drawStudThread`, not the shared `drawThreadAlong*` (see the bug note above).

## Deferred (future builds, as scoped)
- **3D-mode** tile (`60-tile-palette.js`) + iso geometry (`64-3d-engine.js` `v3dBuildStud`) + per-view drawers — the other half of CLAUDE.md's two-mode rule.
- **Red-highlight capacity checker** `js/79-checks-anchor.js`: read `CHEMSET_STUDS[size].{ec,ac,embed,Tr,bm}` and flag a placed stud that violates min edge distance / spacing / embedment / member thickness. The full Reo 502 Table 2 (incl. install-only M30/M36) can live there as `CHEMSET_INSTALL_LIMITS`. Data is already captured on the catalogue.
- Bond-zone adhesive hatch is present but subtle (thin annulus at 1:10); a more prominent adhesive fill is an easy tuning tweak if Dan wants it.
