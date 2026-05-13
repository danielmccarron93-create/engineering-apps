# StructDraw — File-Structure & Functionality Review

**Reviewer:** Lead-software-dev lens (Revit / AutoCAD / Bluebeam) crossed with AU structural-engineering practitioner lens.
**Date:** 2026-05-12
**Scope:** root `index.html` shell, `css/styles.css`, all 73 `js/NN-*.js` files. `dev/` mirror compared to root.
**Method:** Read the actual code, not just `CLAUDE.md`. Verified file sizes, cross-file dependencies, entity-type vocabularies, dispatch shapes, and standards coverage against the source.

---

## Part 1 — File-structure review

### 1.1 What's good

- The modular split (2026-05-02) was a genuine win. A 22,241-line `index.html` is unmaintainable; 73 files averaging ~270 lines is a different universe.
- `'use strict';` on every file (verified — 0 missing). That preserves the original semantics now that scripts are no longer concatenated inside one parse unit.
- Numbered prefixes enforce load order without a bundler. For an evening-build tool with no Node toolchain, this is pragmatic and removes a whole class of "why doesn't X work" bugs.
- The `dev/` → `root` mirror gives you a release boundary without CI. `bin/release.sh` exists (8 lines, presumably a `cp -r`). That's enough for a single-engineer project.
- The archive policy is healthy: `archive/v1/`, `archive/snapshots/` plus the abandoned-rewrite handoff are kept and not edited. You can roll back.
- `CLAUDE.md` is genuinely useful as a playbook — it documents intent, conventions, and known issues honestly. That's rare.

### 1.2 What's problematic

**The 73-file flat list is at its limit.** When `js/` has 73 entries and you're looking for "where is bolt rendering," the answer is "search by name, hope you find it." File numbers help with load order but not with discovery. You already have natural groupings — they're just not reflected on disk.

**Two state files, not one.** `05-state.js` defines `objects3D`, `entities2D`, `sheetInfo`, `project`, `undoStack`. `07-globals.js` defines `canvas`, `ctx`, `viewport`, `blocks`, `tool`, `drawMember`, `platePts`, `snapOn`, etc. The split is "model" vs "transient UI/canvas state," but it isn't labelled, isn't documented in `CLAUDE.md`, and the line is fuzzy — `secCutX` is in `05-state.js` but is a UI concern (dragging a cut indicator). Phase-2 plan already calls out lifting to a single `appState`. Worth doing.

**`39-events.js` is a god function.** Inside `initEvents` you have 54 `tool === 'X'` branches in one mousedown/move/up/keydown tree. Adding a new tool means surgery on a 1,415-line file. This is the single biggest readability/maintenance hazard in the codebase — flagged by you already, but worth re-emphasising: it should be the first Phase-2 PR, ahead of everything else, because every new tool you add now compounds the problem.

**Dispatch-by-`if/else if`-chain on `ent.type`.** `34-draw-2d.js` line 38+ is one long chain of `else if (ent.type === '...')` covering 26 entity types. Adding a 27th entity means editing the renderer, the hit-test, the bounds, the DXF exporter, the PDF exporter, the layer panel, the inspector, the toolbar — none of which are co-located. Pattern: there's no entity-type registry. A registry-of-handlers (`registerEntity('weld', { draw, hit, bounds, dxf, pdf })`) would let you add a tool by writing one file rather than amending eight.

**V25 monkey patches are a structural smell, not just cosmetic.** `72-v25-options-bar.js` does:

```js
v25TryHandleClick = function(blk, cu, cv, e) { /* wrapped */ }
v25Add            = function(type, props)     { /* wrapped */ }
v25SetTool        = function(t)               { /* wrapped */ }
// + undo wrapping
```

Originals live in `66-v25-helpers-frame.js` and `05-state.js`. There's no `_origUndo` saved before reassignment in some cases, which means if a future file ever re-wraps, the chain is fragile. Recommend an extension-hook pattern (`registerBeforeUndoHook(fn)`) or — if you keep the wrapper — at minimum save the prior reference explicitly.

**`v25Mem2Thickness` is defined twice in the same file.** Lines 734 and 880 of `68-v25-tools.js`. JavaScript silently lets the second win. The first definition is dead code that looks live. Trivial to fix; should be done before the next round of V25 work to avoid confusing future-you.

**Numbered-file ordering bakes in coupling.** Right now `74-v26-bb-rail.js` must load *after* `73-init.js` — the comment says "registers AFTER init." That's an implicit ordering contract not enforced by anything but the filename. If a future file gets number 73a or 75 by accident, you get a runtime error nobody asked for. A real load-order test (script that asserts every required global exists after parsing) would catch this.

**`dev/` is gitignored AND is your design-handoff archive.** I see `dev/design-handoff/2d-structural-details-application/` containing tokens, jsx mockups, V25 design intent — this is gone if your laptop fails. That's a single-point-of-failure for design work, separate from the code. Either commit the design-handoff to a sibling repo or move it out of `dev/`.

**`dev/` has 74 JS files but root has 73.** The extra file is `dev/js/23a-shs-joints.js`. That's an unreleased SHS joints module. Worth noting: the V1→root mirror won't catch new-file additions, only diffs of existing files (look at `bin/release.sh` — it `cp -r`'s the directory, which works for adds, but the workflow rule "verify dev/ in browser then mirror" needs you to remember the new file got added in `index.html`'s `<script src>` list too. Easy to miss; recommend a Phase-2 lint that diff-checks `dev/index.html` <script> tags vs `dev/js/*.js` filenames.

**`PROGRESS.md` and `MODULAR_REFACTOR_PLAN.md` are now historical** (per `CLAUDE.md`) but still at root. Move to `archive/` or `docs/historical/` so the root is just: `index.html`, `README.md`, `CHANGELOG.md`, `CLAUDE.md`, `REVIEW_2026-05-12.md`. Less noise.

**No `index.html` script-tag generation.** 73 hand-written `<script src>` tags. If a file gets renumbered, `index.html` must be edited too. A 20-line build step (`bin/build-index.sh` that globs `js/*.js`, sorts numerically, and emits the script tags into a marker block in `index.html`) removes a whole class of "I added a new file and forgot to add the script tag" bugs. No bundler required, no Node toolchain, just `bash`.

### 1.3 Recommended structure (concrete)

You're at the point where folders earn their keep. Here's a proposal that keeps the numbering for load order, groups related files, and lets you find things by purpose:

```
2D-Details/
├── index.html                          (built; <script> block auto-generated)
├── README.md
├── CHANGELOG.md
├── CLAUDE.md
├── REVIEW_2026-05-12.md
│
├── bin/
│   ├── release.sh                      cp dev → root
│   ├── build-index.sh                  glob js/, regenerate <script> block
│   └── check-load-order.sh             assert globals exist after parse
│
├── css/
│   └── styles.css
│
├── js/
│   ├── 00-core/                        Bootstrap, config, state, coords
│   │   ├── 01-config.js
│   │   ├── 05-state.js                 (consolidated — see Phase-2 #2)
│   │   ├── 07-globals.js
│   │   ├── 08-coords.js
│   │   └── 73-init.js
│   │
│   ├── 10-data/                        Catalogues (pure data, no DOM)
│   │   ├── 02-data-sections.js
│   │   ├── 03-data-bolts.js
│   │   └── 65-v25-data-mode.js
│   │
│   ├── 20-geometry/                    Pure geometric algorithms
│   │   ├── 06-detail-block.js
│   │   ├── 09-snap.js
│   │   ├── 10-bounds-hittest.js
│   │   ├── 12-edge-snap.js
│   │   ├── 13-projection-lines.js
│   │   ├── 15-occlusion.js
│   │   ├── 16-live-section-cut.js
│   │   ├── 17-fillet-chamfer.js
│   │   ├── 18-section-profile.js
│   │   ├── 19-member-frame.js
│   │   └── 25-parametric-holes.js
│   │
│   ├── 30-render/                      Drawing primitives + entity renderers
│   │   ├── 20-render-proxy.js
│   │   ├── 22-render-core.js
│   │   ├── 24-draw-primitives.js
│   │   ├── 26-as1100-hatch.js
│   │   ├── 27-rotation-helper.js
│   │   ├── 28-draw-block.js
│   │   ├── 29-draw-ub.js
│   │   ├── 30-draw-shs.js
│   │   ├── 31-draw-section.js
│   │   ├── 32-draw-plate.js
│   │   ├── 33-draw-bolt.js
│   │   ├── 34-draw-2d.js               (split further — see below)
│   │   ├── 35-draw-weld.js
│   │   ├── 36-selection-highlights.js
│   │   ├── 37-view-labels.js
│   │   └── 38-crosshair.js
│   │
│   ├── 40-interact/                    Mouse / keyboard / tools
│   │   ├── 11-grip-handles.js
│   │   ├── 14-section-cuts.js
│   │   ├── 21-bolt-grip.js
│   │   ├── 39-events.js                (split — see Phase-2 #1)
│   │   ├── 40-placement.js
│   │   ├── 41-tools.js
│   │   ├── 42-keyboard.js
│   │   ├── 43-clipboard.js
│   │   └── 55-mirror-tool.js
│   │
│   ├── 50-features/                    Higher-level construction
│   │   ├── 23-auto-weld.js
│   │   ├── 23a-shs-joints.js
│   │   └── 48-connection-builders.js
│   │
│   ├── 60-ui/                          DOM-bound panels
│   │   ├── 47-status-bar.js
│   │   ├── 49-sheet-browser.js
│   │   ├── 52-cmd-palette.js
│   │   ├── 53-layers-panel.js
│   │   ├── 54-kbd-help.js
│   │   ├── 56-favourites.js
│   │   ├── 57-chord-layer.js
│   │   ├── 58-size-picker.js
│   │   ├── 59-inspector.js
│   │   ├── 60-tile-palette.js
│   │   ├── 61-library-shim.js
│   │   ├── 62-toolbar.js
│   │   ├── 63-layout.js
│   │   └── 74-v26-bb-rail.js
│   │
│   ├── 70-io/                          Save / load / export
│   │   ├── 44-pdf-export.js
│   │   ├── 45-dxf-export.js
│   │   ├── 46-save-load.js
│   │   ├── 50-project.js
│   │   └── 51-multi-page-pdf.js
│   │
│   ├── 80-v25/                         Paper-space 2D studio (per-mode)
│   │   ├── 66-v25-helpers-frame.js
│   │   ├── 67-v25-materials.js
│   │   ├── 68-v25-tools.js
│   │   ├── 69-v25-dispatch.js
│   │   ├── 70-v25-render.js
│   │   ├── 71-v25-selection.js
│   │   └── 72-v25-options-bar.js
│   │
│   └── 90-engine-3d/
│       └── 64-3d-engine.js
│
├── docs/                               (was at root)
│   ├── historical/
│   │   ├── MODULAR_REFACTOR_PLAN.md
│   │   ├── PROGRESS.md
│   │   └── handoff_v2_abandoned.md
│   └── design-handoff/                 (moved out of dev/)
│
├── lib/                                (Phase-2: vendor three.js + jspdf)
│
├── Images/
├── Thumbnails-SVG/
└── archive/
```

The folder-numbering (`00-core`, `10-data`, `20-geometry`...) preserves load-order at the folder level. Inside each folder you keep the existing file numbers (so file moves are pure renames; no renumbering churn). Globs work:

```html
<!-- in index.html, built by bin/build-index.sh -->
<script src="js/00-core/01-config.js"></script>
... etc, sorted by full path.
```

This isn't strictly necessary for the app to work — but it cuts navigation cost roughly in half once you know the folder convention, and makes it much easier to onboard the eventual second engineer.

### 1.4 What I would NOT change

- Don't go ESM yet. The classic-script + shared globals model is honest about what the code is. Going ESM requires touching every file and lifting all globals first. That's Phase-3 work, not Phase-2.
- Don't introduce a bundler. The CDN scripts work, the no-build story is genuinely valuable, and you'd be trading a real value for a small win.
- Don't auto-format with Prettier in a separate PR. Mixing formatting and refactor PRs makes diff review impossible. If you adopt Prettier, do one big "format everything" PR and then forget about it.
- Don't delete the `archive/` snapshots, even after V25 is months old. They cost ~1.5 MB of disk and are your get-out-of-jail card.

---

## Part 2 — Functionality review (CAD-lead lens, AU structural-engineering practitioner lens)

Read this as: "if this tool were positioned to compete with Bluebeam Revu + AutoCAD for AU structural detailing, what's missing or weak?" Items are ordered roughly by **how often a working engineer would hit the gap on a real job**.

Note on what's already good before the list: parametric AS sections, AS 1252 bolt rendering, AS 1101.3 auto-weld interface detection, 3D iso companion view, edge-snap with visual indicators, depth-aware occlusion, V25 hatch library with 12 patterns, vector PDF export, the connection-wizard family (cap plate, baseplate, splice, WSP), and the V26 BB-rail. These are genuinely good and ahead of what most engineers can do in Bluebeam.

### 2.1 Precision input (HIGHEST PRIORITY — engineers won't trust the tool without this)

1. **No coordinate input ("dynamic input" / command line).** AutoCAD's killer feature is typing `L<enter>0,0<enter>@3000,0<enter>` to draw a 3 m horizontal line. StructDraw has no equivalent. Engineers detail by dimension, not by clicking-and-hoping. **Recommended:** a status-bar command line accepting `@dx,dy` (relative cartesian), `@dist<angle` (polar), `dist` (continue last direction). Bind to `Tab` while a draw tool is active.
2. **No "dimension while drawing" prompt.** During edge-drawing of a plate, AutoCAD shows the live distance + angle and accepts typed values. You have `plateDimInput` partially — extend it to every two-click tool (line, member, dimension placement, etc.).
3. **No coord-display in status bar.** `47-status-bar.js` should show world coords under the cursor at all times. Right now the engineer can't tell where they are within the view-local coordinate system.
4. **No object-snap modes.** Engineers expect endpoint / midpoint / intersection / perpendicular / tangent / nearest / centre / quadrant / insertion / extension. You have a single `snapOn` boolean and edge-snap. The cleanest way: a snap-mode bitmask (`SNAP_END | SNAP_MID | SNAP_INT | ...`), a toolbar of snap-mode toggles, and `F3` (toggle all) / `F11` (toggle each mode). AS 1100 detailing genuinely uses all of these.
5. **No "from" override snap** ("from this point, 200 mm right"). Used constantly when offsetting from a known origin.

### 2.2 Edit operations (missing core verbs)

6. **No `copy` tool.** Mirror exists (`55-mirror-tool.js`), but copy/move-by-base-point don't. Clipboard paste-in-place (`43-clipboard.js`) is not the same — engineers want to grab the bolt group, type `c<enter>`, pick base, pick destination, repeat.
7. **No `move` tool.** Same shape as copy, without the duplicate.
8. **No `rotate` tool** with base-point + reference-angle. The inspector lets you type a rotation but it's not a modal tool. Engineers rotate by picking two points "from this angle to this angle."
9. **No `array` tool** — rectangular (rows × cols × spacing) or polar (count × included angle). Stairs, anchor patterns, repetitive cleats need this.
10. **No `trim` / `extend`.** Mentioned in `archive/handoff_v2_abandoned.md` Section "V1 → V2 REGRESSION LIST" as still-broken. Fillet and chamfer exist (`17-fillet-chamfer.js` is a stub, `39-events.js` has the fillet/chamfer placement code, `offset` is wired). Trim/extend are the most-used edit verbs in any CAD package — you cannot ship without them.
11. **No `stretch` (window-stretch).** Critical for adjusting plate thickness, beam length, hole position by dragging a window across endpoints. Grip-handle dragging is a partial substitute but doesn't cover multi-object stretch.
12. **No `align` tool.** Pick source 2 points, pick destination 2 points. Used to slot one detail's coord system into another.
13. **No `explode`.** Treat a member as raw lines, or break a polyline into segments. Drafters will demand this for fix-ups.
14. **No `join`.** Inverse of explode. Stitch collinear segments back into a polyline.
15. **No `pedit` (polyline edit).** Add vertex, remove vertex, change linetype, change width — currently polygon vertices are immutable after placement.

### 2.3 Dimensioning (AS 1100 §6 compliance gaps)

16. **Dimension types covered:** horizontal, vertical, aligned, angular, chain, baseline. **Missing:** radial, diameter, arc-length, jogged-linear, jogged-radial, ordinate, leader-with-dim-text.
17. **No dimension styles.** AS 1100 §6.5 calls for separate styles for chain, parallel, and superimposed dimensions, plus distinct text/arrow conventions for fabrication vs setting-out. Currently every dimension uses the same hard-coded look (4-px tick marks, system-ui font). Engineers want at least 3 styles: Steel-fab (architectural ticks), Concrete (filled arrows), Setting-out (open arrows + "±" tolerance text).
18. **Arrow heads are not AS 1100 §5.2 compliant.** The code draws 4-px slash ticks. AS 1100 requires filled triangle (preferred) or oblique stroke depending on style. Wire arrow style into dim-style.
19. **No dimension associativity.** Move a member, the dimension doesn't update — it's stored as `{p1u, p1v, p2u, p2v}` snapshot at place-time. AutoCAD's associative dimensions snap to object endpoints and update on edit. Without this, every member-edit triggers a dimension-redraw chore.
20. **No "dimension overrides".** Engineers need to write "VARIES" or "MIN 75" or "≥ FOOTPRINT" instead of the computed number. Currently the rendered number is auto-computed (`Math.round(dist)`). Add `ent.textOverride`.
21. **No tolerance, prefix, or suffix support.** "75 ± 2 TYP", "Ø 24", "L = 1200 LG", etc.
22. **No dimension scale-factor.** Dimension text is the same screen-mm regardless of `drawingScale`. AS 1100 wants 2.5 mm or 3.5 mm dim text on the printed sheet — that's a paper-space size, currently fudged.

### 2.4 Annotation (AS 1100 §11 and beyond)

23. **No "edit text in place".** Text entities can only be edited via the Inspector. Double-click should open an in-canvas text input at the entity location.
24. **`mtext` exists but doesn't word-wrap.** Per `archive/handoff_v2_abandoned.md`. Confirmed in `34-draw-2d.js` — no `wrapWidth` handling. Engineers write 3-5 line annotation blocks; this is a daily-use gap.
25. **No leader-with-shoulder.** AS 1100 §11.7 — leader bends to horizontal at the text. Currently `v25-leader` is a straight line + text.
26. **No "shape leaders" (multileader).** Single leader pointing to several pieces of text.
27. **No paragraph styles** — bullets, numbered notes, hanging indent. Welding notes and general notes routinely need lists.
28. **No `mtext` background mask.** Notes over linework should mask the line behind them so they're readable. Currently text just overdraws — at low zoom on a dense detail it's illegible.
29. **No field codes.** "Sheet 1 of 5", "{=area}", "{=length}" — at minimum the title-block fields should be cross-referenceable from any leader.

### 2.5 Detail re-use (the workflow Bluebeam can't do well)

30. **No proper detail-library concept.** Favourites strip (`56-favourites.js`) tracks recent tiles but isn't a library of saved full details. Engineers want to save "Cap plate to RHS 100×100×6" as a parametric template and recall it on any sheet.
31. **No project-level detail referencing.** `detailRef` is a callout. AutoCAD-style "detail X on sheet Y" with the back-reference (sheet Y shows "referenced from sheet 3") doesn't exist. Cross-sheet navigation: click a detail-ref bubble → jump to that sheet.
32. **No snip/clip-and-paste between sheets** (was working in V1 per archive). This was a flagship V1 differentiator; partial in V25 per `CLAUDE.md`.
33. **No multi-detail copy.** Copy the contents of detail block 2 from sheet 1 to a blank block on sheet 7. The clipboard is single-block-scoped.
34. **No "standard details" library by company.** A working Bligh Tanner office library would have 80–200 typical details (slab edge, lift core, anchor pattern, base plate types A/B/C/D...). Today's tool requires re-drawing each one.

### 2.6 Section profiles & members (AS 4100 coverage)

35. **Section catalogue is 8 categories, ~212 lines.** Verified: UB, UC, SHS, PFC, RHS, CHS, EA, UA, WB (just added). **Missing:** TFB (taper-flange beam), TFC (taper-flange channel), welded columns (WC), parallel-flange channel (already PFC, fine), cold-formed Z and C purlins (Lysaght / Stratco), open-web steel joists, hollow-flange beams, **rail sections** (railcar customers), and **light-gauge steel framing (LGSF)** which Bligh Tanner uses for façades and infill walls.
36. **No section-database import.** The catalogue is hand-coded. Engineers need to pull from OneSteel / InfraBuild / Stratco datasheets without you having to ship an update.
37. **No "user-defined section" path.** Hot-rolled plate built-up sections (twin PFC, plated UB, capped UC) are routine in heavy industry. Currently there's no way to define them parametrically.
38. **Plate is a polygon, which is correct** — but you can't get a parametric "300 × 200 × 16 PL" with a centred bolt pattern that auto-updates if the plate is resized. Add a parametric-plate type with: width, depth, thickness, edge-distance, bolt grid (rows × cols × pitch × gauge).
39. **No haunches / castellations / web openings.** Tapered beams, cellular beams (FabSec, Westok), and rectangular web cuts (services penetrations) are common; currently you'd have to draw them as raw geometry.

### 2.7 Concrete & reinforcement (AS 3600 — currently very thin)

40. **No mention of AS 3600 in code** — verified (`grep -rn "AS 3600" js/` returns nothing). The README claims AS 3600 compliance but no clauses are referenced. Engineers will catch this.
41. **No reinforcement scheduling.** V25 has `reoBar` placement but no auto-generated bar schedule (mark, type, diameter, length, shape code, count). AS 3600 details *require* a bar schedule. The rev-schedule pattern in `34-draw-2d.js:106` is a good template — replicate for bars.
42. **No bar bending shape codes (BS 8666 / AS 3600 §13).** Pick a shape code, fill in dimensions, schedule auto-fills the bar length. This is table-stakes for any concrete detailer.
43. **No bar-mark cross-referencing.** Pick a `reoBar`, give it mark "B1", placing the same mark elsewhere on the sheet should reference the same bar (so the schedule counts correctly).
44. **No cover annotation.** Concrete cover is per-face and per-element; currently no first-class concept.
45. **No lap-length annotation** (AS 3600 §13.2.2). Engineers calculate `L_sy.t = 0.5 k_1 k_3 k_4 k_5 f_sy d_b / (k_2 sqrt(f'_c))` and tag the lap. Could be a parametric annotation: pick bar, pick concrete grade, return lap with citation.
46. **No development-length annotation** (AS 3600 §13.1.2.3). Same shape as lap.
47. **No stirrup / fitment family.** R-bar and N-bar exist as types but no closed/open/diamond/U-shape fitment primitive with cog dimensions.
48. **No mesh layer rendering** — `v25-mesh` exists, but no SL/RL designation, mesh schedule, or lap-splice rendering.
49. **No PT tendon representation.** Post-tensioned concrete is common in commercial AU work; needs duct, anchor, stressing pan, end-bell drawing.
50. **No precast detailing primitives.** Lifters (Ancon, Halfen), foam-back panels, panel-to-panel connections, dowel pockets.

### 2.8 Mass timber (your specialty — currently absent)

51. **No GLT, CLT, or LVL primitives.** This is in your stated specialty area and there's nothing in the catalogue. CLT panels need: thickness, layup (3-/5-/7-ply), grain direction per layer, edge profile. GLT beams need: width, depth, lamella thickness, finger-joint indicator.
52. **No timber-connection family.** Self-drilling screws (SFS WT, Rothoblaas VGZ/VGS), nail plates, Tecnaria connectors, screw plates, glued-in rods (AS 1720.1 §4.4).
53. **No AS 1720.1 hatch / grain indicators.** V25 has timber hatch but no end-grain vs side-grain switching for the same component in different views.
54. **No timber-fire-rating annotation.** AS 1720.4 charring rate × duration is a standard callout for mass timber; cite + auto-calc would be a differentiator.

### 2.9 Connections (good library, but capped)

55. **Connection wizards: cap plate, baseplate, splice, web side plate.** Strong start. **Missing:** moment end-plate (AS 4100 §9.1.4), bolted apex haunch, finger plate, fin plate to web, gusset for brace, shear tab, cleat angle to UB/UC, holding-down bolt template, slab-on-grade dowel, pinned/fixed bearing pad.
56. **No design verification.** A wizard places geometry but doesn't check capacity. Optional: wire to a "design check" pop-up running AS 4100 §9.3 (single shear bolt: `φV_f = φ 0.62 f_uf k_r n_n A_c`, etc.) so the detail comes with a Vu/φVf utilisation. This is the *killer feature* that no other CAD tool has — AS-compliant design check baked into the detail.
57. **No detail-callout from wizard.** A wizard creates the detail; it should also create the title bar ("CAP PLATE TO 200UB22.3 — N16-8.8/S BOLTS") with a callout grid showing PL t, fillet weld leg, bolt edge-distances, etc.

### 2.10 Layers, lineweights, line types (AS 1100 §5)

58. **Layer system is visibility-only.** `53-layers-panel.js` groups entity types but doesn't expose: per-layer colour, per-layer line type, per-layer lineweight, per-layer plot/no-plot, layer-state-manager (save/restore). Real CAD layer system is a 6-attribute table.
59. **No line-type library beyond hidden/centre/phantom.** AS 1100 calls for ~12 line types (centre, hidden, phantom, break, cutting-plane, viewing-plane, leader, dim, extension, chain-thick, chain-thin, double-dash). The `_v25EdgeDash` function in `67-v25-materials.js` is small; expand to a full line-type table indexed by name.
60. **No standard layer naming.** ISO 13567 / BS 1192 / AU industry practice expects `S-COL`, `S-BEAM`, `S-BOLT`, `S-WELD-FILLET`, etc. Currently you have ent-type-based grouping, which works for visibility but not for DXF/DWG round-trip with drafters.

### 2.11 Sheet & paper management

61. **A1 is hard-coded.** AS 1100 §3.1 allows A0/A1/A2/A3 portrait/landscape. `01-config.js` defines `SHEET.W = 841`, `SHEET.H = 594`. Make it a per-sheet property with a setter; UI in the title-block dialog.
62. **No proper title block editor.** The dialog exists (`btnTitleBlock` in `62-toolbar.js`) but the title block is rendered from a fixed template. Bligh Tanner has a specific TB; an engineer at Acor has a different one. Per-template-file (`templates/title-blocks/bligh-tanner.json`) loadable at project create.
63. **No revision table at top of title block.** Currently revisions are triangles + a generated schedule (good!) but the *title-block* row of revisions ("Rev | Date | By | Chk | App | Description") is the AU industry standard. Add as part of TB template.
64. **No drawing-status stamps** (FOR INFORMATION, FOR APPROVAL, ISSUED FOR CONSTRUCTION, etc.). Engineers need these on every issue.
65. **No "north arrow" or "scale bar" primitive.** Trivial to add; currently no first-class entity.
66. **No second-scale views on the same sheet.** All blocks on one sheet share `drawingScale`. Real detail sheets routinely have 1:10, 1:5, 1:25, 1:50 in different blocks. Block-level scale override is the fix.
67. **No A1 print verification.** PDF export goes to a fixed page; no "test-print at 100%" preview that overlays a scale bar against a known dimension.

### 2.12 Output / interop

68. **No DWG export.** DXF is text-format ASCII; fabricators want DWG (binary). DXF reads fine in most CAM software but DWG is what drafters expect. ODA Open Design Alliance C library is the only sane way; not browser-friendly. Workaround: a Node/desktop bundle for the office that converts DXF → DWG on save.
69. **DXF coverage is partial.** Verified — `45-dxf-export.js` handles: line, rect, circle, text, materialTag, memberTag, centreline, slot, dim, weld, sectionMark, detailRef, revisionTriangle, revisionCloud, breakline. **Missing from DXF:** plate (the polygon ent), hatch, mtext, gridLine, note, detailCard, revSchedule, polygon, arc, all V25 entities (anchor, bar, wall, frame, lineSet, mat, mesh, txtBox). When a drafter imports the DXF half the sheet is missing.
70. **No IFC export.** BIM coordination is increasingly required on AU projects. IFC 2x3 or IFC 4 export of the 3D iso would let architects/services coordinate clashes. Long-term Phase-3 item.
71. **No SVG export.** Useful for embedding details in Word/InDesign reports without losing quality.
72. **No image-paste-as-background.** Sketching over an architect's plan PDF or an old hand-drawn detail is daily Bluebeam workflow. Currently no way to bring in raster underlay.
73. **No raster snap.** Even if you add image underlay, the user needs to be able to snap to features in the raster (or at least eyeball-snap with a magnifier).
74. **PDF vector coverage** — `44-pdf-export.js` does the canvas shim. Worth audit: a few entities may render via raster fallback because the shim doesn't translate them. Suggest a test sheet with all 26 ent types + 11 V25 ent types, exported vector, opened in Acrobat, inspected for missing strokes.

### 2.13 Selection & manipulation

75. **No window-vs-crossing selection.** Drag right-to-left = crossing (any object touched), drag left-to-right = window (fully inside). Currently I see one selection box behaviour in `39-events.js`; verify both directions are wired with the correct semantics.
76. **No "select similar".** Right-click a bolt, "select all bolts on sheet". Used to bulk-change properties.
77. **No "select previous".** Common 2-keystroke recall.
78. **No filter-by-property.** Select all M20-8.8 bolts but not M16-4.6.
79. **No groups.** Listed as a V1→V2 regression in the archive. Group / ungroup / open-group are core CAD verbs.
80. **Inspector doesn't multi-select.** Verified — `updateInspector()` in `59-inspector.js` handles one object at a time. Multi-select should show common props as editable + "<varies>" for differing props.

### 2.14 Snap & precision UX

81. **No polar tracking.** AS 1100 details routinely use 15°, 30°, 45°, 60°, 75°, 90° lines. Polar tracking (auto-snap when within 1° of one of those angles) is essential. Ortho is partial; polar is the upgrade.
82. **No "track from" / extension-snap.** Hover an endpoint, move away, get a temporary extension line for snapping to.
83. **No grid override.** `gridSize = 10` is per-canvas; should be per-view-block or per-sheet, with rapid 1/5/10/25/50 cycling.
84. **No isometric snap mode** (30°/90°/150° grid). Different from the 3D iso engine — this is for hand-drawn iso details on the 2D sheet.

### 2.15 Reliability & engineer-trust features

85. **No autosave.** Phase-2 item per `CLAUDE.md`. A throttled `localStorage` write every ~30 s, plus "dirty" indicator in title bar, plus "recover unsaved work" prompt on next load. Browser crash = lost work is unacceptable for paid work.
86. **No undo levels limit, no redo-after-edit clearing visible to user.** The current `undoStack` / `redoStack` in `05-state.js` is in-memory only and unbounded. Long sessions risk RAM blowout.
87. **No "save as template."** Save the current sheet (or project) as a starting template for the next job.
88. **No file-level schema version.** Phase-2 item per `CLAUDE.md`. `.sd2.json` has no `schemaVersion`; loading an old file when the data model changes will silently misinterpret entities.
89. **No "convert to V25-compatible / V26-compatible" migrator.** Tied to schema-version.
90. **No crash-recovery breadcrumbs.** When `render()` throws, the user gets a blank canvas, not a "we hit an error in entity 'memberTag' (id 47) — skipped, sheet still draws."

### 2.16 Performance (will bite at scale)

91. **No render culling.** `render()` walks every entity every frame. Once a sheet has 500+ entities, pan/zoom will stutter. Add per-block AABB culling: skip entities whose bounds don't intersect the visible viewport.
92. **No dirty-rect rendering.** A full canvas redraw on every mouse move is fine at 73-file size; at 1,500-entity sheets it'll drop frames.
93. **No worker for occlusion / depth-sort.** `15-occlusion.js` runs on the main thread. As 3D object count grows, will block UI.
94. **All globals on `window`.** Every property access is a hash lookup. Negligible at current scale; worth knowing for Phase-3.

### 2.17 Things to deprioritise (positioning, not weakness)

Worth saying out loud, because not having these is a feature for an AS-focused tool: live collaboration, cloud sync, animation/timeline, PBR rendering, splines, NURBS surfaces, parametric history tree (Revit-style), 3D constraints solver, simulation (FEA). The tool stays sharper if you don't try to compete with Revit on BIM. Bluebeam doesn't have any of these either.

---

## Part 3 — Recommended priority order (if you were filing tickets)

This is *my* ordering, your call.

**P0 (Cannot ship to other engineers without these):**

- Phase-2 #1: split `39-events.js` into a tool-handler dispatch table
- Phase-2 #2: lift mutable globals into `appState`
- Phase-2 #4: schema-versioned `.sd2.json` + load-time migrator
- Phase-2 #5: autosave + dirty indicator
- Item 1: coord input ("dynamic input" / command line)
- Items 6–10: copy, move, rotate, array, trim, extend, stretch
- Item 41: AS 3600 reinforcement bar schedule
- Item 68: DXF coverage gap (currently ~50% of ent types not in DXF)

**P1 (Will unblock daily-use within Bligh Tanner):**

- Item 4: real object-snap modes (endpoint/mid/int/perp/tan/nearest/centre/quadrant)
- Item 16: dimension types — radial, diameter, leader-with-dim, jogged, ordinate
- Item 19: associative dimensions
- Item 22: dimension scale-factor (paper-space text sizing)
- Item 30–34: detail library + cross-sheet detail re-use
- Item 51–54: mass-timber primitives (GLT, CLT, AS 1720.1 connections)
- Item 60: standard ISO 13567 / BS 1192 layer naming
- Item 61, 62: A0/A2/A3 + per-template title block
- Item 75–80: window/crossing selection + select-similar + groups
- Item 91: render culling

**P2 (Differentiators / commercial-release prerequisites):**

- Item 36: section-database import / parametric user-section
- Item 42: AS 3600 §13 bar-bending shape codes
- Item 45, 46: parametric lap/development annotation with clause citation
- Item 56: AS-compliant design verification baked into wizards
- Item 67: print-to-scale preview
- Item 70: IFC export
- Items 82, 84: polar tracking, isometric-snap mode

**P3 (Phase-3 commercial-release polish):**

- Phase-2 #3: replace V25 monkey patches with proper extension hooks
- Phase-2 #6: vendor `three.min.js` + `jspdf.umd.min.js` to `lib/`
- Phase-2 #7: fix `v25Mem2Thickness` duplicate (10-minute fix; do it sooner)
- Per-customer branding theme files
- JSDOM test harness
- Manifest + service worker for iPad PWA

---

## Part 4 — Single-paragraph summary

The codebase is in good shape for what it is: a single-engineer evening project that has crossed the line from prototype to working tool, with a careful modular split that hasn't damaged behaviour. The biggest structural risks are concentrated, named, and have plans (`39-events.js`, the global-state split, the V25 monkey patches, the missing schema version, the missing autosave). The biggest *functional* gaps versus a commercial AU structural detailer's expectations are coord input, the missing core edit verbs (copy/move/rotate/trim/extend), associative dimensions, a real bar schedule, mass-timber primitives, and DXF coverage of all ent types. None of these are blocked by the architecture — each is a focused PR. The thing that would make this tool *uncatchable* in the AU market is welding AS-compliant design checks into the wizards so the detail emerges with a utilisation ratio attached. No competing CAD tool does that.

---

*End of review.*
