# VGS screw — locked design

Locked before the build (2026-06-10); the parallel build agents implemented this verbatim.
Do not redesign in follow-on chats — deviations go in `04-progress.md`.

## Architecture: extend, don't invent

VGS **extends the existing `screw` entity type and `v25-screw` tool** used by the HBS screw
(`js/72i-v25-screw.js`, entity helpers `js/77-screw-entity.js`). The catalogue spec id keys
the family: ids starting `VGS` = VGS family (`isVgsSpec(id)` in `js/02j`), `HBSPL` = HBS.
Shared with HBS, unchanged in behaviour:

- the five orientation presets — `end` / `h-headL` / `h-headR` / `v-headT` / `v-headB`
  (named by head side; the screw drives away from the head);
- the one-sided **bearing-face snap** (`v25ScrewBearingFace`) onto plate/member faces;
- placement (single-click), preview ghost, selection bounds/grips, inspector,
  `lastUsedSection.screw` / `lastUsedOrientation.screw` latches.

Family-specific: the drawn section profile (csk vs hex head, fully-threaded body), the
end-on glyph head, the options-bar size optgroups, the BB-rail tile + icons.

## Catalogue — `js/02j-data-vgs-screws.js` (NEW, generated)

**GENERATED** from the Rothoblaas VGS catalogue PDF (TIMBER pp.164–179: geometry table
p.166, codes/dimensions p.167, install data p.178) cross-checked against the
**manufacturer IFC parametric models** (head profile segments H1–H5, inner-head /
under-head diameters, tip-cone lengths). Do not hand-edit per-length entries; regenerate
or edit the shared per-diameter values. **76 entries**, validated by JXA parse + field audit.

Globals: `VGS_SCREWS` (entry map), `VGS_LENGTHS_BY_D` `{9: 21 ids, 11: 30, 13: 25}`,
`VGS_SIZE_GROUPS` (5 optgroups: Ø9 csk · Ø11 csk · Ø11 hex SW17 · Ø13 csk · Ø13 hex SW19),
`V25_VGS_DEFAULT_SPEC = 'VGS11300'` (friendly first pick, Ø11 × 300 csk), `isVgsSpec(id)`.

Per-entry fields (mm): `id`, `system:'rothoblaas-vgs'`, `headType:'csk'|'hex'`,
`d` (nominal Ø = thread crest: 9/11/13), `L` (total length), `b` (threaded length),
`d2` (thread root Ø), `tip` (tip-cone length), `pitch` (nominal, visual),
`dV_S`/`dV_H` (pre-drill), `SPLATE_min`, `bit`, `torque_rec`, `ftens_k`, `My_k`, `fy_k`,
`fax_k`, `fbk_concrete`, `pcs_per_box`.
Csk-only (all L ≤ 600): `dK` (head Ø 16/19.3/22), `t1` (head depth 6.5/8.2/9.4),
`dIn` (inner-head Ø where the 90° countersink cone ends: 10.92/10.58/12.06),
`dU` (under-head neck Ø 6.5/7.7/8.78), `hRim`/`hCone`/`hRib`/`hCham` (head profile segment
lengths from the IFC: rim cylinder at dK → 90° cone dK→dIn → ribbed cone dIn→dU →
chamfer neck→thread-root).
Hex-only (all L > 600): `SW` (across flats 17/19), `tS` (hex thickness 6.4/7.5),
`dFl` (integral washer flange Ø 15.1/16.9), `tFl` (flange thickness 2.0/2.56),
`dU` (neck Ø 13.3/15.15), `hCham` (neck→thread taper length).

`getScrewSpec()` in `js/02e-catalogue-lookups.js` already resolves VGS ids (done alongside
the catalogue, pre-build).

### ⚠ Data notes (record for Dan — confirm on review)

- **VGS11750:** catalogue p.167 prints **b = 680** for VGS11750 — internally inconsistent
  with the p.168 rule **b = L − tK** (tK = 20 hex) and with every neighbouring hex entry;
  **we ship b = 730** and flag it for Dan to confirm against ETA-11/0030.
- **Ø13 csk L ≥ 300** uses **b = L − 20** per the printed catalogue (**not** L − 10, the
  rule every other csk size follows).

## Drawn-profile geometry (from the IFC mesh + catalogue pp.166/168)

Local axis `s` runs from the head TOP (`s = 0`) toward the tip, exactly like the HBS drawer.
Half-profile stations below give `t` = half-width at axial station `s`.

**CSK family** (fully threaded, countersunk — bearing FLUSH):
- `L` is head-top → tip apex. **Bearing plane = head top (`sBear = 0`)** — a countersunk
  head sits flush with the outer face of the plate/timber it fixes through, so the
  bearing-face snap coordinate maps to `s = 0`.
- Stations: `{s:0, t:dK/2}` → `{s:hRim, t:dK/2}` (rim) → `{s:hRim+hCone, t:dIn/2}`
  (90° countersink cone) → `{s:hRim+hCone+hRib, t:dU/2}` (ribbed cone; this station ≈ `t1`)
  → neck at `dU/2` until `sCham0` → chamfer to `{s:sThread, t:d2/2}` where
  `sThread = L − b` (10 mm csk; 20 mm for Ø13 csk L ≥ 300 — **always catalogue `L − b`,
  never hardcoded**) and `sCham0 = max(headEnd, sThread − hCham)` → thread-root core at
  `d2/2` to `sTipBase = L − tip` → tip cone to apex `{s:L, t:0}`.
- Thread teeth (crest `d/2`, root `d2/2`) from `sThread` to the apex, teeth shrinking over
  the tip cone — reuses/extends the existing `drawScrewThread`.

**HEX family** (fully threaded, hex head + integral washer flange — bearing PROUD):
- Catalogue `L` is measured from the **under-head plane (flange top) → tip** (per the IFC:
  hex head sits above z = 0, shaft below). With `s = 0` at the hex-head TOP: hex head rect
  (width `SW`, across-flats side view, with the standard two hex-facet lines) from `s = 0`
  to `tS`; washer flange rect (width `dFl`) from `tS` to `tS + tFl`;
  **bearing plane = flange underside: `sBear = tS + tFl`** (head proud by `tS + tFl`).
  Glyph total length = `tS + L`.
- Neck at `dU/2` from `s = tS + tFl` to `sCham0 = (tS + (L − b)) − hCham`, chamfer to
  `d2/2` at `sThread = tS + (L − b)` (`L − b` = 20 for all hex), thread-root core to
  `sTipBase = tS + L − tip`, tip cone to apex at `s = tS + L`.

**Visual language mirrors HBS exactly:** body fill `colorAlpha(col, 0.55)`; centreline
`DASH.CL_BOLT` at `LW.CL`; body outline `LW.VIS`; head overlay `LW.VIS_HEAVY` with a crisp
heavy bearing line across the bearing plane; thread pitch exaggerated for legibility:
`pitch = Math.max(S.pitch, 1.6 * drawingScale)` (≥ 1.6 mm on paper).
`rPolygon`/`rFillPolygon` take `[u,v]` **arrays**, not objects (the HBS NaN lesson).

## UI surfaces

- **BB-rail tile `d-vgs`** in the Members section (`js/74`), beside the HBS tile; icon
  `icon-vgs` + orientation icons `icon-orient-vgs-*` in the `index.html` SVG sprite.
- **Options bar** (`js/72` / `js/72i`): family-aware Size select — VGS specs grouped via
  `VGS_SIZE_GROUPS` (5 optgroups), HBS keeps its existing groups; same 5-button
  orientation row.
- **Inspector** (`js/71`): the existing screw field block, family-aware size list.
- **DXF** (`js/45`): rides the screw branch with the VGS profile.

## Files touched

For multi-build conflict detection (parallel build sessions are active). All edits are
additive (new family branches / new file / new tile).

| File | Change | New / Edit |
|---|---|---|
| `js/02j-data-vgs-screws.js` | **NEW** — generated 76-entry VGS catalogue + `VGS_LENGTHS_BY_D` / `VGS_SIZE_GROUPS` / `V25_VGS_DEFAULT_SPEC` / `isVgsSpec` | new file (done pre-build, do not edit) |
| `js/02e-catalogue-lookups.js` | `getScrewSpec()` resolves `VGS…` ids | edit (done pre-build, do not edit) |
| `js/72i-v25-screw.js` | VGS csk/hex section profile drawers + family routing + family-aware options row | edit (additive) |
| `js/77-screw-entity.js` | end-on glyph family branch (csk/hex head circle) | edit (additive) |
| `js/69-v25-dispatch.js` | family-aware draw route / click branch / preview ghost / active-tile map | edit (additive) |
| `js/71-v25-selection.js` | VGS-aware bounds / hit / inspector size list | edit (additive) |
| `js/72-v25-options-bar.js` | family-aware `v25-screw` options branch (VGS size groups) | edit (additive) |
| `js/74-v26-bb-rail.js` | `d-vgs` tile in Members | edit (additive) |
| `js/45-dxf-export.js` | VGS profile in the screw DXF branch | edit (additive) |
| `index.html` | `icon-vgs` + `icon-orient-vgs-*` SVG symbols; `<script>` tag for `02j` | edit |
| `CHANGELOG.md` | one entry | edit |

**Reused unchanged:** `js/02c-data-screws.js` (HBS catalogue), `js/09-snap.js`
(`v25-screw` already in the face-snap list), `js/33-draw-bolt.js` (thread + polygon
helpers). Save/load automatic via `entities2D` JSON.
