# VGS screw — progress

**Status: built, in review** (2026-06-10). Single ultracode workflow session: the design
was locked up front (see `02-design.md`), the catalogue generated and validated first,
then the renderer / wiring / selection / DXF / icons built by parallel agents against the
locked spec.

| Phase | What | Status |
|---|---|---|
| 0 | Design lock — extend `screw`/`v25-screw` (no new entity/tool), family keyed off spec id; profile stations derived from catalogue pp.166–168 + manufacturer IFC parametric models | ✅ done |
| 1 | Catalogue `js/02j-data-vgs-screws.js` generated (76 entries: Ø9 ×21, Ø11 ×30, Ø13 ×25) + `js/02e` `getScrewSpec()` VGS resolution | ✅ done + validated (JXA parse, entry-count + field audit, b-rule cross-check) |
| 2 | Section profile drawers (csk + hex) in `js/72i`; end-on family branch in `js/77` | ✅ built (parallel agent) |
| 3 | Dispatch / preview / active-tile wiring `js/69`; options bar family branch + VGS size groups `js/72`/`72i` | ✅ built (parallel agent) |
| 4 | BB-rail `d-vgs` tile `js/74`; `icon-vgs` + `icon-orient-vgs-*` sprites + `02j` script tag `index.html` | ✅ built (parallel agent) |
| 5 | Selection / bounds / inspector `js/71`; DXF screw-branch VGS profile `js/45` | ✅ built (parallel agent) |
| 6 | Review + browser verification (placement, all 5 orientations, csk vs hex bearing snap, size groups, select/grips, DXF, clean console) | ⏳ pending — results not yet recorded at time of writing |
| 7 | CHANGELOG + dashboard row + hand to Dan | ✅ done |

## Notes / flags for review

- **VGS11750 `b` value:** catalogue p.167 prints b=680 (internally inconsistent with the
  p.168 `b = L − tK` hex rule and every neighbouring entry); shipped **b=730** — Dan to
  confirm against ETA-11/0030. Flagged inline in `js/02j` too.
- **Ø13 csk L ≥ 300:** `b = L − 20` per the printed catalogue (not the usual csk L − 10) —
  intentional, not a generation error. Drawers always use catalogue `L − b`, never a
  hardcoded thread-start offset.
- Catalogue + lookups (`02j`/`02e`) were finished and validated **before** the parallel
  build fan-out, so every agent coded against the same frozen schema.

## Deferred (same scope line as HBS / ChemSet stud)

- 3D-mode tile + iso geometry (the two-mode rule's other half — owed alongside the HBS
  and stud backfill).
- Capacity / spacing checks (`ftens_k`, `My_k`, `fax_k`, `SPLATE_min`, pre-drill rules are
  captured as catalogue data for a future checker).
