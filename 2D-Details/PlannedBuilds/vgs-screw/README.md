# VGS fully-threaded screw — 2D fixing (Rothoblaas)

```
Status: 👀 Built — in review
Last touched: 2026-06-10
Owner: Dan McCarron
Scope: Rothoblaas VGS fully-threaded timber screws (Ø9/11/13, 80–1500 mm) as a 2D-mode fixing — extends the shipped HBS `screw` entity/tool with a second family, exact catalogue geometry, csk + hex heads.
```

**Status:** built same-day (2026-06-10) in a single ultracode workflow session — catalogue
generation, renderer, wiring, selection, DXF and icons run as parallel agents off one locked
design. Pending Dan's diff review + browser sign-off + commit. Archive to
`archive/completed-plans/` on ship.

## What this is

The **Rothoblaas VGS** (ETA-11/0030) fully-threaded countersunk/hex timber screw as a
2D paper-space fixing, **mirroring the shipped HBS screw feature** (`PlannedBuilds/hbs-plate-screw/`,
`js/72i-v25-screw.js`): pick it from the V26 BB-rail Members section, choose one of the same
five orientation presets (end-on / horizontal head-L / head-R / vertical head-T / head-B),
single-click placement, drawn to **true catalogue scale** at any drawing scale, with the same
subtle bearing-face snap onto a plate or member face.

VGS is the deep-thread workhorse for timber-to-timber and reinforcement screws —
**fully threaded** (no smooth shank, unlike HBS), Ø9 / Ø11 / Ø13, lengths 80–1500 mm:

- **L ≤ 600 mm** → **countersunk head with ribs** (90° countersink, TX drive) — sits flush
  with the outer face it fixes through.
- **L > 600 mm** → **hexagonal head + integral washer flange** (SW17/SW19) — sits proud,
  bearing on the flange underside.

The user checks embedment into timber elements **visually**, so head shape, thread extent
(`b = L − 10` csk / `L − 20` hex and Ø13 csk ≥ 300) and total length are exact to the
catalogue at any scale — same quality bar as the HBS / ChemSet-stud drawers.

## Reuse vs build

No new entity, no new tool. VGS **extends the existing `screw` entity + `v25-screw` tool**;
the catalogue spec id selects the family (`VGS…` = VGS via `isVgsSpec()`, `HBSPL…` = HBS).
Orientation presets, bearing-face snap, selection/grips, options-bar plumbing and the
end-on drawer pattern are all shared with HBS. New pieces: the 76-entry catalogue
(`js/02j-data-vgs-screws.js`, generated from the catalogue PDF + manufacturer IFC models),
the csk/hex section profile drawers, family-aware size groups, the `d-vgs` tile + icons.

**Deferred (explicitly out of scope, same as HBS/stud):** 3D-mode rendering, and any
capacity/spacing rule checking (the catalogue carries `ftens_k` / `My_k` / `fax_k` /
`SPLATE_min` etc. as data for a future checker).

See `02-design.md` for the locked design + files-touched ledger and `04-progress.md` for
the phase log.
