# M16 anchor studs — kickoff brief (read me first)

**Purpose.** Add **M16 anchor studs** as a new, drawn-to-scale 2D fixing, the same way the
Rothoblaas HBS plate screw and the AS 1252 bolts already work: pick a tile in the Draw tab →
choose a standard orientation (plan / section, each direction) → single-click to place →
drawn to true scale for every standard length → the head/end **subtly snaps to the outside
face** of a plate or steel member in section.

This brief exists so you don't have to re-derive the process. It captures exactly what worked
when we built the HBS screw in the previous chat, including the bug that cost the most time.
**Dan will attach the M16 stud-anchor data sheet(s) (and ideally a DXF) to this chat.**

> This is a merged **plan + build** chat (like the screw build was). Read `CLAUDE.md` end-to-end
> first, then this brief, then the attached data sheets. Surface the open questions below
> **before** writing code, then build.

---

## 0. The two worked examples to copy

- **`js/72c-v25-bolt.js`** — the AS 1252 bolt. THE mirror template for a multi-orientation
  section fixing (end-on + horizontal/vertical section, nut-side presets, auto-clamp to
  material, options-bar orientation row, single-click placement).
- **`js/72i-v25-screw.js`** — the HBS plate screw we just built. A second worked example: a
  to-scale section profile (head + body + threaded teeth + tip) reconstructed from the DXF,
  with a one-sided bearing-face snap. Clone whichever is the closer fit.

A stud anchor is essentially a **threaded rod with a nut + washer at the projecting end and an
embedded anchor end** (cast-in head/plate, or a sleeve/cone for an expansion anchor, or a bonded
length for chemical). Geometrically it's close to a long bolt — so `bolt2` is likely the closer
template, with the embedded end + projection drawn per the data sheet.

---

## 1. The proven process (in order)

**Phase 0 — orient.** Read `CLAUDE.md`, this brief, the data sheet(s)/DXF. Note the
"two-mode requirement" and the "Adding a new member/fastener" checklist in `CLAUDE.md`.

**Phase 1 — review + geometry (use `/workflows`).** Fan out parallel agents to:
1. **Reverse-engineer the bolt2/screw pattern** end-to-end (tile → tool → placement →
   plan/section orientation → face snap → selection/grips → options bar → DXF). Output a
   file-by-file "mirror plan."
2. **Audit existing fit.** Is there an existing entity this should extend rather than a new
   type? Relevant: the V25 `anchor` entity (`V25_ANCHOR_DB` in `js/65-v25-data-mode.js`;
   `drawAnchor2D` in `js/68-v25-tools.js`) covers trubolt/chemset/coach/selftap/through — BUT
   it's a single downward symbol with a leader+text callout, **no plan/section orientation
   switching**, so it's probably the wrong shape for what Dan wants (multi-orientation, to
   scale). Also check the baseplate connection builder (`js/48-connection-builders.js`) for any
   existing anchor-bolt drawing to stay consistent with. Decide: extend `anchor`, mirror
   `bolt2`, or a new `stud`/`anchorStud` type. Default: a new type mirroring `bolt2`, justified
   in the data-model doc.
3. **Extract exact geometry from the DXF** (if Dan provides one) — layer-aware, normalized to
   the nominal diameter, cross-checked against the data-sheet dimension table. Produce an
   implementation recipe (see §4).
4. **Parse the data sheet** for the catalogue (diameters/lengths/embedments), nut/washer dims,
   and the edge-distance / embedment / spacing rules (capture these for later capacity rules,
   even if not built now — mirrors how the screw's cleat rules were deferred but the data
   captured in `js/02d`).

**Phase 2 — decide + ask.** Resolve the open questions (§5) with Dan **before coding**.

**Phase 3 — build.** Mirror the screw/bolt wiring across every surface (§3 checklist).

**Phase 4 — verify** (§6). Numeric draw-capture for exact geometry + zoomed screenshots for
the look. Compare against the data-sheet diagram before calling it done (the STP 6011 / data-
sheet quality bar).

---

## 2. Critical lessons / gotchas (the expensive ones — do NOT relearn these)

1. **`rPolygon` / `rFillPolygon` (js/33) take points as `[u, v]` ARRAYS, not `{u, v}` objects.**
   They read `pts[i][0]` / `pts[i][1]`. Passing `{u,v}` objects makes every vertex
   `real2px(undefined, undefined)` → `NaN` → the fill/stroke **silently draws nothing (no
   error thrown)**. This is the single bug that made the screw look like "thin wavy lines" —
   the head/body/teeth never rendered; only the `rLine`-based centreline showed. **Build all
   polygons as `[u,v]` arrays** (the bolt's `hexPointsAlongU/V` do this).
   `rLine(blk, u1,v1,u2,v2)` takes explicit numbers (fine). `rRect/rFillRect(blk,u,v,w,h)` too.

2. **The real `LW` constant** (in `js/03-data-bolts.js`) is
   `{CUT:1.20, VIS_HEAVY:0.70, VIS:0.65, MW:0.50, DIM:0.40, HID:0.30, CL:0.30, HATCH:0.18}`.
   **CLAUDE.md's `{thick, medium, thin, fine}` names are STALE** — don't use them. Cuts heavy,
   primary outlines `VIS_HEAVY`, visible `VIS`, hidden/centreline `HID`/`CL`, hatch `HATCH`.

3. **Fine detail (threads, knurls) is sub-pixel at true scale** at 1:10. To stay legible:
   - **Exaggerate the pitch**: `pitch = max(cataloguePitch, ~1.6 · drawingScale)` (≥~1.6 mm on
     paper at any scale). Fewer, bolder features read; true micro-pitch turns to grey fuzz.
   - **Solid fills + opaque strokes.** Fill the body/teeth at one alpha (~0.55) and stroke
     outlines OPAQUE. The screw's first attempt used 0.14/0.40 alphas → a translucent ghost.
   - Keep the true OUTER diameter honest (it's the real size); exaggerate only the *pattern*.

4. **Drawing-pipeline facts:**
   - `drawEnt2D` (`js/34`) calls `v25DrawEnt` (`js/69`) FIRST and returns early if it handles
     the entity — so add your draw route in `v25DrawEnt`.
   - Coordinates: `real2px(blk, u, v)` → buffer px; `u,v` are view-local mm, `+v` is up.
   - Reuse the shared helpers: `rLine`, `rRect/rFillRect`, `rPolygon/rFillPolygon`,
     `drawThreadAlongU/V` + `hexPointsAlongU/V` (`js/33`), `colorAlpha`, `ppm()` (px/mm),
     `DASH.CL_BOLT`.

5. **State flow (additive, low-collision):** `v25SetTool` REBUILDS `v25State` from module
   latches, so set your fixing's state on `v25State` **after** calling `v25SetTool`, and persist
   choices via the shared `lastUsedSection.<type>` / `lastUsedOrientation.<type>` globals
   (defined in `js/60-tile-palette.js`). This needs **zero edits** to the `v25SetTool` latch
   machinery — important because a parallel build session is often editing the same V25 files.
   Keep every edit additive (new `else if` branches, new tiles) so Dan's subset-commits stay clean.

6. **Face/bearing snap:** copy `v25ScrewBearingFace` (one-sided, `js/72i`) or `v25BoltClampSpan`
   (two-sided clamp, `js/72c`): scan `entities2D[viewKey]` for `mem2` + `plate2` (v2 plate
   mirrors) along the fixing axis at the transverse position, within a ~400 mm window, and land
   the head/end on the detected outside face. Also add the new tool to the per-axis face-snap
   list in `snapUV` (`js/09`, ~line 21) so the click also catches the face.

7. **`t1`-type "thickness" fields may not be a side-profile length.** On the screw, catalogue
   `t1` (head thickness) turned out to be the Torx-recess depth, NOT the drawn head length —
   the DXF proved it. Verify each dimension's meaning against the DXF/diagram, don't assume.

---

## 3. Integration checklist (every surface — mirror the screw build exactly)

- **New module `js/72x-v25-<type>.js`** (next free sub-letter; `72d`–`72i` are taken, so likely
  `72j`): orientation presets array, `v25Build<Type>OrientationRow()`, `v25PickAndSet<Type>(spec)`,
  the bearing-face finder, and `draw<Type>2D` + the section profile drawer. Load its `<script>`
  in `index.html` after the other `72x` files and **before** `js/73-init.js`.
- **`index.html`** — SVG `<symbol>`s: a tile icon + one per orientation, beside the bolt/screw
  icons (search `icon-orient-bolt-*` / `icon-orient-screw-*`).
- **`js/69-v25-dispatch.js`** — `v25DrawEnt` draw route; `v25TryHandleClick` `'v25-<type>'` branch
  (single-click `v25Add(...)`); `v25DrawPreview` ghost; `v25ActiveTileId` mapping.
- **`js/74-v26-bb-rail.js`** — a tile in the Draw-tab **Members** section (`getDrawTabDef()`).
- **`js/72-v25-options-bar.js`** — a `'v25-<type>'` branch (Size select + orientation-row
  placeholder), the row-swap block, and the size-change wiring.
- **`js/09-snap.js`** — add `'v25-<type>'` to the per-axis face-snap tool list.
- **`js/71-v25-selection.js`** — `v25EntBounds`, `v25EntHandles`, `v25HitHandle` cases, and an
  inspector field block (Size + Orientation + any stud-specific fields).
- **`js/45-dxf-export.js`** — a DXF branch mirroring the drawer geometry (S-BOLT layer is fine).
- **Data** — catalogue in `js/02*` (or a new `js/02x-data-*.js`); save/load is automatic via
  `entities2D[viewKey]` JSON.
- **Both modes** are mandated by `CLAUDE.md`. The screw shipped **2D-only first, 3D as a fast
  follow-on** — CONFIRM the same scope with Dan, don't silently do 2D-only.

---

## 4. DXF geometry extraction (if Dan provides a DXF)

This worked cleanly for the screw:
- Files are often **CRLF** — set `awk 'BEGIN{RS="\r\n"}'` or strip `\r`, or naive `/^ENDBLK$/`
  matches fail.
- Geometry lives in the **BLOCKS** section (one block per size, e.g. `HBSPL8120_8x120`, plus
  enlarged detail blocks). Find a block's range: grep the name → next `ENDBLK`.
- It's **layer-aware**: the clean product outline, the thread/teeth, and the dimension/callout
  lines are on different layers — extract the outline layer for the silhouette.
- Group codes: `LINE` 10/20=start, 11/21=end; `LWPOLYLINE` repeated 10/20 vertices; `ARC`
  10/20=centre, 40=r, 50/51=angles; `CIRCLE` 10/20,40. Pair code→value with awk/a tiny parser.
- **Watch out for construction artefacts**: an arc *centre* can read as the widest point even
  though no geometry is drawn there (this caused a false "head is wider than dK" reading until
  the outline was traced properly).
- **Normalize** the profile to the nominal diameter, then **pin the load-bearing diameters to
  the data-sheet values** at draw time (so each size is exact even though the trace is one size).
- **Reconcile every DXF measurement against the data-sheet table** and resolve discrepancies
  (note which source to trust — usually the published table for diameters).

---

## 5. Open questions to resolve with Dan + the data sheet (BEFORE coding)

1. **What exactly is the element?** Cast-in headed stud (e.g. welded/forged head on a baseplate)?
   Post-installed **expansion/sleeve anchor** (cone + sleeve)? **Chemical/bonded** threaded rod?
   Threaded rod + nut(s) + washer? This drives the embedded-end geometry.
2. **Family or single size?** M16 only, or M12/M16/M20/M24 (+ length range)? Build the catalogue
   to match.
3. **Entity model:** new `stud`/`anchorStud` type mirroring `bolt2` (recommended for
   multi-orientation, to-scale section) vs extending the existing single-orientation `anchor`.
4. **Orientations:** confirm the set — end-on (plan) + section each direction (up/down/left/right)
   like the bolt/screw. Named by which end is the head/nut.
5. **What it snaps to:** the projecting (nut/washer) end bears on the steel/plate outside face,
   or the baseplate top? The embedded end goes into concrete/grout — does the drawing show the
   concrete face, embedment depth, projection above?
6. **What to draw:** nut + washer + projection + thread + embedded length + anchor end
   (head/cone/sleeve/bond). How much is schematic vs to-scale.
7. **Scope:** 2D-only first (3D follow-on) — same as the screw? Confirm.
8. **Deferred rules:** capture edge distances / embedment / spacing / capacity from the data
   sheet now (store as data) even if the red-highlight/check logic is built later — mirrors the
   screw's deferred "cleat rules."

---

## 6. Local testing setup (environment quirks)

- **No `node`** on this machine → can't `node --check`. Verify via the browser instead (a parse
  error in a classic `<script>` surfaces in the console immediately).
- **The iCloud project path won't serve** via `python3 -m http.server`, and `npx` isn't
  installed. The working pattern: `rsync` the project to `/tmp/sd-<feature>-verify/`, add a
  `.claude/launch.json` config (`/bin/zsh -c "cd /tmp/... && python3 -m http.server <port>"`,
  `autoPort:true`), `preview_start` it. Re-sync + `location.reload()` to pick up JS edits.
- In `preview_eval`, reference **bare globals** (`v25State`, `entities2D`, `drawScrew2D`), not
  `window.*` (top-level `let`/`const` aren't window properties; `function` decls are).
- **Screenshot framing is fiddly** (DPR=2, the window resizes and a resize triggers the app's
  fit-to-view which resets your zoom, and screenshot px ≠ canvas-buffer px). So:
  **the reliable geometry check is a NUMERIC draw-capture** — temporarily stub
  `rFillPolygon`/`rPolygon`/`rLine` to record the actual `[u,v]` coordinates passed during one
  `drawX2D` call, and assert the head/shank/thread/tip coordinates against the catalogue. Use
  screenshots (zoomed in, set zoom+pan then screenshot immediately) for the "does it look right"
  gut-check, not for pixel-measuring. Confirm the console is clean after every reload.

---

## 7. Reference material in-repo

- `CLAUDE.md` — the project playbook (read fully).
- `js/72c-v25-bolt.js`, `js/72i-v25-screw.js` — the two worked fixings to clone.
- `PlannedBuilds/hbs-plate-screw/` — the screw build's plan, files-touched ledger, and progress
  (incl. the geometry-rewrite post-mortem in `03-progress.md`).
- `CHANGELOG.md` (2026-06-03 HBS screw entries) — what shipped + the array-bug fix note.
- Auto-memory: `hbs-screw-feature.md`, `v25-fixing-drawing.md` (the gotchas), `local-testing-setup.md`,
  `parallel-build-sessions.md`.

---

### Suggested first message for the new chat
> "Add **M16 anchor studs** as a new to-scale 2D fixing, mirroring the HBS screw / bolt. Read
> `CLAUDE.md` then `PlannedBuilds/m16-anchor-stud/00-kickoff-brief.md` first — it has the full
> process and the lessons from the screw build. Data sheet(s) [+ DXF] attached. Use `/workflows`
> for the review + DXF geometry extraction, surface the open questions, then build it end-to-end."
