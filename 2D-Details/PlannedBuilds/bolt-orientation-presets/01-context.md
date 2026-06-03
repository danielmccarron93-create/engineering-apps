# 01 — Context

## What the user asked for

> "We have now built in good icon previews for the standard orientation of members like UBs etc which are working really well. Now I want to do the same thing for bolts — add an icon the user can select to easily orient the bolt for whichever direction they are drawing in 2D (vertical / horizontal / elevation) and with the nut/washer on either side per my sketch. Also, when I add the bolts I want them to draw the way they currently do in 3D mode where the head and nut clamp the thickness of the steel and plate."

The sketch shows five bolt figures: an end-on circle-with-crosshair, two horizontal side views (nut/washer on the right, and nut/washer on the left), and two vertical side views (nut at bottom, nut at top).

## Two goals

1. **Orientation presets for bolts** — the bolt analogue of the member orientation row (`js/72b-orientation-presets.js`): a row of icon buttons in the V25 quick-options bar, one per standard bolt orientation, with the "nut on either side" requirement handled as a head/nut flip.
2. **Section clamping** — a 2D bolt placed in a section/side view should clamp the combined thickness of the already-drawn plate(s)/member(s), like the 3D-mode bolt.

## How bolts work today

### 3D mode (the reference look — works well)
- A bolt is an `objects3D` entity drawn by `drawBolt()` (`js/33-draw-bolt.js`): end-on circle in elevation views; chamfered-hex side profile with washers / threaded shank / nut / thread protrusion in section/plan views (`_drawBoltSectionA_V14`, `_drawBoltPlanB_V14`).
- Grip (clamp thickness) is auto-detected by `computeBoltGripInfo()` (`js/21-bolt-grip.js`), which **raycasts through `objects3D`** and sums the material intervals along the bolt's Z axis. `computeBoltLength(grip, size)` then snaps to the next standard `BOLT_LENGTHS`.

### 2D paper-space (V25) mode — no real bolt today
- Clicking the 2D **Bolts** tile (`js/74-v26-bb-rail.js`, tile `d-bolt`) falls through to `selectMemberByBolt()`, which arms the **3D** `draw-member` tool and creates an `objects3D` bolt — a 3D object, not a paper-space entity.
- There is a dormant, flag-gated-off **v2** bolt path (`js/v2/...`, `useV2For.bolts=false`) that only ever draws an end-on circle (no clamp). Per the playbook the v2 rebuild is abandoned and **bolts stay v1** — do not resurrect the v2 path.
- The only 2D bolt-ish entity is `boltCallout` (`js/34-draw-2d.js`) — a pure text label (e.g. "4/M20 8.8/S"), no glyph, no clamp.

## Why a new v1 `bolt2` entity

The orientation row is a 2D placement-state concept (in 3D the orientation comes from the model), and the section clamp must read **2D entities** (`mem2`, v2 plates) — `computeBoltGripInfo` only sees `objects3D`, so it can't measure a 2D stack. The clean solution is a first-class v1 paper-space entity, `bolt2`, mirroring `mem2`: lives in `entities2D[viewKey]`, renders via a `drawBolt2D` that reuses the existing `33-draw-bolt.js` primitives, and gets a 2D-aware grip detector.

## The key simplification (from the user's clarifications)

- **End-on bolts need no clamp** — just a circle. Plate thickness is unknown/irrelevant in that view.
- **Clamping only matters in section**, and the bolt is always added *after* the plate/members are drawn (e.g. back-to-back PFC webs), so the material to clamp is already on the page and can be auto-detected from the 2D entities.
- This means no 3D raycast is needed — the grip is the sum of the crossed 2D entities' along-axis thickness, which we can read directly from `v25Mem2Thickness(ent)` (web/wall) and the v2 plate thickness.
