# Progress — selection-precision

Status: ✅ Built + reviewed + browser-verified 2026-06-04. Awaiting Dan's diff review + commit.

## How it was built
Multi-agent workflow (`/workflows`): 4 parallel scouts (hit-stack · screw/bolt geometry ·
v2-plate fold · callers/cycle) → 1 synthesiser (this plan folder + the authoritative spec) →
1 implementer → 3 parallel adversarial reviewers (correctness · regression · syntax/perf).

The first run's implementer finished its edits on disk but the workflow errored on the final
structured-output handshake; a second `/workflows` run did the review + fix against the on-disk code.

## What shipped
- `js/71-v25-selection.js` — `v25EntHit` (precise per-entity hit → `{precise,score}`),
  `v25FastenerHit` (bearing/clamp-re-centred screw & bolt centrelines), `_v25PolyAreaMM2`,
  `_v25PlateCandidates` (v2-plate fold), reworked `v25HitTestStack` (collect → dedup-by-id →
  stable sort `precise DESC → score ASC → idx DESC`). `v25HitTest` signature unchanged.
- `js/39-events.js` — plate-vs-v1 selection-state writes on single-click, cycle-advance, and
  double-click; mutual-exclusion (`v25Selected` xor `v25SelPlateIds`) held at every site.
- `js/v2/tools/edit-plate.js` — `beginBodyDragFromExternalSelect` hook + priority-4 deferral.

## Review outcome
correctness = **pass** · regression = **pass-with-fixes** · syntax/perf = **pass**. 0 in-scope
blocker/major. 7 correctness checks CONFIRMED (screw wins stack[0]; cycle deterministic & id-array
byte-stable; dedup keeps better-ranked; screw/bolt centrelines pixel-faithful; plate fold avoids the
`[x,y]`/`[u,v]` trap; mutual-exclusion held).

### Two minor regression findings — fixed inline
1. **(high)** Double-click on a plate wrote the synthetic `v2plate-` id into `v25Selected` without
   clearing `v25SelPlateIds` → routed to the plate store (mirrors the single-click plate-wins branch).
2. **(med)** AABB pre-filter anchored on `ent.u/v` could gate out a valid click on a bearing-re-centred
   fastener → gate skipped for `screw`/`bolt2`; the cheap precise centreline test always runs.

### Hover pre-highlight — ✅ BUILT (2026-06-04, same session)
Revit-style "show what a click will select". Mouse-move in 2D select mode outlines the top pick by
its **real silhouette** (member/plate/mat polygon · screw/bolt bearing-re-centred centreline · dim
halo), as a soft solid glow distinct from the dashed selection outline. Replaces the old bbox hover
affordance and fixes the v2-plate no-op. New: `v25HoverOutline`, `v25FastenerCentreline` (geometry
mirror of `v25FastenerHit`, hit-test left untouched), `v25DrawHoverPrehighlight`, `v25MatPolyWorld`,
`v25BlockWallPolyWorld` in `js/71`; `v25Hover.ent` carried from the mouse-move hook in `js/39`.
Exception-guarded so a geometry edge case can't break render. Browser-verified (hover→screw resolves
to a centreline outline; mat→4-pt polygon; draw path no-throw; boots console-clean).

### Open follow-ups (not built)
- **Minor (low):** a selected v2 plate has no "near-miss don't-deselect" grace like v1 entities — a
  near-but-not-on click deselects it slightly more eagerly. Cosmetic asymmetry; deferred.

## Browser verification (2026-06-04, on the fixed code, real pick path)
Screw on a filled mat: direct click → `[screw, mat]` (screw wins); `v25HitTest` → screw; 150 mm-off
click → `[mat]`; identical clicks → byte-identical id array (cycle-stable); empty space → `[]`. App
boots console-clean. (`/tmp/sd-selprec` snapshot, launch config `sd-selprec` :8905.)
