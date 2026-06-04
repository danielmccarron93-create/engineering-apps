# HBS Plate Screw — 2D fixing (Rothoblaas)

**Status:** building (single merged plan+build chat, 2026-06-03).
**Scope decision:** 2D Draw-tab only this build; 3D-mode tile is the immediate follow-on.

## What this is

A new **timber-screw fixing** for 2D paper-space mode, mirroring the existing `bolt2`
fixing: pick it from the V26 BB-rail Draw tab, choose a standard orientation
(plan / section in each direction), place it single-click, drawn to true scale for
every standard Rothoblaas HBS Plate length. The head **subtly snaps to the outside
face** of a plate or steel member (e.g. a UB flange) when drawn in section.

Deferred to later builds (explicitly out of scope now): the "cleat rules"
(too-thick-plate red highlight, min edge distances / spacings), the `connection`
grouping + rule-engine UI, and 3D-mode rendering.

## Reuse vs build

The engineering layer is **already built and verified** (parked timber-screw feature):
- `js/02c-data-screws.js` — `HBS_PLATE_SCREWS` catalogue (18 SKUs, all geometry). Verified against the PDF, exact match. **Reuse as-is.**
- `js/77-screw-entity.js` — the `screw` entity (`mkScrewEnt`) + `drawScrewEnt` (head-on plan circle) + hit helpers. **Reuse;** add orientation + section drawer.
- `js/02d/02e` — spacing/edge/capacity rule tables + lookups, for the deferred cleat rules.

Missing piece (this build) = the **UI hook**, mirroring `bolt2` (`js/72c-v25-bolt.js`).

## Geometry reconciliation (important)

In the catalogue: `d` (8/10/12) = thread **major/outer** dia; `d2` (5.9/6.6/7.3) =
thread **root/minor** dia; `dS` (6.3/7.2/8.55) = smooth shank; `dK` = head dia;
`t1` = head + under-head length (head-top → shank start); `tK` = collar/washer
thickness; `L` = total length; `b` = threaded length. Confirmed by the supplied DXF
(crest 8.0, root 5.9, shank 6.3 for Ø8).

## Decisions (from the build chat)

- **2D only now** (3D follow-on).
- **Remove the autoloader** (already HTML-commented; flag flipped to false too).
- Reuse the `02c` catalogue + `screw` entity (don't reinvent).
- Orientation set = `end` (plan) + `h-headL` / `h-headR` / `v-headT` / `v-headB`
  (named by head side; the screw drives away from the head).
- Default size on first pick: `HBSPL8120` (Ø8 × 120). Size labels: "Ø8 × 120".
- Add a real inspector panel for the screw (the bolt has none — this is the better bar).

See `03-progress.md` for phase-by-phase status and `02-files-touched.md` for the change ledger.
