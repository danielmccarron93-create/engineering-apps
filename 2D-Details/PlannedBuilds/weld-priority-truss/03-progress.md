# weld-priority-truss — progress

Built in one session (2026-06-05), planned + reviewed via multi-agent workflows (deep-analysis + adversarial critique up front; adversarial code review at the end). No `node` locally — JS validated with a `jsc` parse-check (`new Function`), behaviour verified headlessly in the browser preview by building trusses in `entities2D` and inspecting the computed trims numerically (per the project's "numeric draw-capture, not screenshots" rule).

| Phase | What | Status | Verification |
|---|---|---|---|
| 0 | Recon — anchors, undo dispatch, cache chain, SHS cap | ✅ | `invalidateWeldCache`→`invalidateJointCache` clears V25 caches; `sel` renderer supports `{v,l}`; undo is a clean `act` switch (and is monkey-patched by `72`). |
| 1 | rankKey + read helpers + component cache (`23a`) | ✅ | jsc OK; page loads clean; render unchanged (helpers unused). |
| 2 | Cut-rule rewrite — the cascade core (`23a`) | ✅ | T-MAIN: chord SOLID, diag-2 cut (straight, 1 cutter), diag-3 cut (kinked, 2 cutters); flip diag-3→1 reverses which diagonal cuts which (`diag2CutChanged:true`); mode `default→rank`. |
| 3 | Write helpers + atomic undo (`23a`, `05`) | ✅ | `MakeMemberThrough` → `{d3:1,chord:2,d2:3}`; **undo reverts all 3 atomically**, redo reapplies; L-corner pick-1 → SOLID + partner CUT; `SetCornerMitre` restores MITRE. |
| 4 | UI — popup, dblclick, inspector, node menu | ✅ | Popup opens (title/options/badges/Run-through); change applies via insert-shift + badges flip live; **real double-click on a welded member body opens the popup** (`hitId` found with `_v25:true`); end click → end-cap; inspector shows Rank + Resolved. Console clean. |
| 5 | Multi-cutter poly-cap — all 4 elevation branches (`68`) | ✅ | diag-2 (1 cutter) `kinks:[]`, 2-pt cap; diag-3 (2 cutters) `kinks:[-4.8]`, 3-pt cap `[(86.6,50),(55,-5),(71.4,-50)]`; visual screenshot shows the node rendering (chord solid + 2 diagonals welded in). |
| 6 | Regression sweep + CHANGELOG + docs | ✅ | Full matrix below; adversarial review workflow run. |

## Regression matrix (all pass)

- **T-MAIN** — 3-member node cascade + poly-cap kink. ✅
- **T-MITRE** — plain 2-member corner defaults to MITRE; `v25CornerIsMitre` true. ✅
- **T7 (legacy)** — `priorityForPairV25` set, no rank → mode `legacy`, winner SOLID / other CUT, byte-identical. ✅
- **T-THROUGH-RANK** — diagonal `weldPriority=1` outranks chord `weldPriority=3`, but the through-chord still cuts it (diagonal `CUT`, chord untrimmed `SOLID`). ✅
- **T-DISJOINT** — two separate nodes → components `[90,91,92]`/`[95,96,97]`; re-rank one leaves the other untouched. ✅
- **T-SINGLETON** — isolated member not welded, no popup/row. ✅
- **T-UNDO** — one Ctrl+Z reverts a whole-component re-rank. ✅
- **T-DELETE** — rank then delete a member → recompute, no crash. ✅
- **T-3D-SAFETY** — `showJointPopup`/`effectiveShsPriority`/`_computeEndCut` (3D) intact and unused by the V25 path. ✅

## Notes / learnings

- V25 `v25HitTestStack` ignores entities without `ent._v25===true` — hand-built test entities need that flag (the joint math itself does not).
- `undo` is wrapped by `72-v25-options-bar.js`, so `undo.toString()` checks are false-negatives — test undo *behaviourally*.
- Local preview must be served from `/tmp` with **no-cache headers** (`/tmp/sd-weldpri-serve.py`) — plain `python -m http.server` lets the browser cache stale JS; bump the port once to clear an already-cached file.

## Adversarial review workflow (4 reviewers + synthesis) — run + addressed

Verdict was **FIX-FIRST**: one must-fix correctness bug + three cheap same-file improvements. All addressed and re-verified:

| # | Finding | Fix | Verified |
|---|---|---|---|
| 1/2 | **[MED] Component-wide mode clobbered untouched mitre corners.** Ranking one corner of a multi-corner component (portal frame) materialised ranks component-wide → an unrelated mitred corner silently became a butt cut; and "Mitre" couldn't restore it. | Made the plain-corner mitre **corner-local**: a corner mitres if `mitrePairs[pair]` is set OR neither of its two members carries an explicit `weldPriority`. `v25AssignRankInsertShift` now snapshots the component's currently-mitred corners and re-asserts `mitrePairs` for every one it materialises but did not target; `v25SetCornerMitre` writes `mitrePairs` so it sticks in rank mode; the `v25EntFields` undo record carries the mitre-flag before/after. | A-B-C zigzag: rank corner AB → **C stays MITRE**; "Mitre" on AB while C ranked → A=MITRE; undo restores all to MITRE atomically. |
| 3 | **[MED] poly-cap `strokeCapPts` bypassed AS 1100 depth-occlusion** (canvas only). | Route each cap segment through the existing `strokeLine` (occlusion clip) instead of a raw `project`+`stroke`; keeps the kink. All 4 branches. | Renders clean; occlusion path restored. |
| 4 | **[LOW] `_computeEndCutV25` read `M.view` instead of the threaded `viewKey`.** | Added a `viewKey` param, threaded from `jointTrimsForMem2` / `v25MemberCutState` (falls back to `M.view`). | jsc + matrix unchanged. |
| 5 | **[LOW] `computeShsJointsV25` never cleared its dirty flag** → O(n²) rebuild per call. | Set `_v25JointCacheDirty = false` after populating the cache (every mutation re-dirties via `invalidateWeldCache`). | matrix unchanged. |

Discarded (false-positives / unreachable): the byte-identity caveat for never-configured old apexes (intended), the stale-popup-after-delete guard (popup closes on outside-mousedown), height clamp, innerHTML (numeric id + catalogue dropdowns only), and the fill-winding / kink-math / undo-atomicity confirmations (verified correct).

## Pending
- Dan's diff review + browser smoke-test + commit (5 files: `js/23a`, `js/68`, `js/39`, `js/71`, `js/05`).
