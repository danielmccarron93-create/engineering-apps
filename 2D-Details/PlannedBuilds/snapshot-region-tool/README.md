Status: 🔨 Building
Last touched: 2026-06-05
Owner: Dan McCarron
Scope: Bluebeam-style `G` snapshot — outline a region (box or polygon), capture it as a crisp high-DPI image, paste it (at cursor or in-place across pages), then trace/resize/fade it.

# Snapshot / region-capture tool (`G`)

## TL;DR

Re-creates the Bluebeam **Snapshot** workflow inside StructDraw's 2D paper-space mode:

1. Press **`G`** (2D mode only) → the **Snapshot** tool.
2. **Drag a box** around anything, or **click node-to-node** to trace a polygon around a detail.
3. On release / double-click, the outlined region is captured as a **high-resolution raster** (crisp PDF content + your own linework) at the **same paper scale**, and copied to an internal clipboard. A subtle vintage-Polaroid capture flash plays inside the region.
4. **`Cmd/Ctrl+V`** pastes it where you click; **`Cmd/Ctrl+Shift+V`** pastes it *in place* — same paper position, even after you switch to another page.
5. The pasted image is a first-class entity: **drag to move, grips to resize** (corner = aspect-locked, edge = free), **opacity slider** in the inspector. Fade it down and **trace over an imported PDF detail** with real parametric members.

## Why this is powerful for a structural engineer

- **Vectorise legacy details.** Import a supplier/old-job PDF (already supported via `multi-file-workspace`), snapshot a detail, paste it onto a blank sheet at ~30% opacity, and trace it with live UB/plate/AS 1252 bolt/AS 1101 weld entities — producing an editable, DXF-exportable detail from a dumb raster.
- **Detail reuse.** Snapshot a cap-plate from sheet 3, paste-in-place onto sheet 7, tweak.
- **Composition.** Pull a region out as an enlarged "Detail X" callout.
- **Exact scale.** Capture is paper-space, so a pasted copy is the exact physical size of the source.

## Locked design decisions (from the plan chat, 2026-06-05)

| Decision | Choice |
|---|---|
| Keybinding | **`G` = Snapshot in 2D paper-space mode only**; bare `G` keeps toggling the grid in 3D mode. |
| Mode scope | **2D paper-space only** (matches the annotation family — dims/leaders/text are 2D-only). |
| Rectangular capture fill | **Transparent** (tracing-paper) for native content; a PDF zone brings its own white backing (faithful, fades nicely for tracing). |
| PDF zone quality | **Crisp** — re-render the outlined PDF region through pdf.js at ~300 DPI for the zone (not the on-screen down-sampled bitmap). |
| Paste keys | `Cmd/Ctrl+V` at cursor; `Cmd/Ctrl+Shift+V` paste-in-place (same paper coords, cross-page). |
| Coordinate storage | Standard **real-mm `u,v,w,h`** convention (reuses all existing selection/grip/resize math) **plus** an authoritative `paperMM:{w,h}` so paste reproduces exact paper size under any `drawingScale`. |
| Raster storage | `file.imageBlobs[imgId] = Uint8Array(PNG)` — mirrors `file.pdfBlobs` exactly (rides existing `.sdproj` base64 round-trip + IndexedDB session; cross-page paste-in-place shares one raster). |
| DXF | Snapshots are **skipped** in DXF (a raster can't vectorise; you trace it with entities that do export) — logged, documented. |
| PDF export | Picked up automatically (raster re-render + the vector shim's `drawImage`). |
| Discoverability | A **Snapshot tile** in the V26 BB-rail (no floating buttons, per playbook). |

## Visual design (the "feel")

- **Snip marquee** must read as *"taking a picture"*, clearly distinct from the normal selection box: a **camera-style outline** — dashed teal/cyan stroke with small **corner ticks/crop-marks**, the area *outside* the outline dimmed by a soft scrim, and a live size readout. Polygon trace shows the same styling along the placed nodes with a rubber-band to the cursor.
- **Capture flash** (on release / double-click): a **subtle vintage-Polaroid** confirmation confined to the captured region — a quick warm-white bloom that rises fast and eases out over ~200–240 ms, with a faint border pulse. Deliberately gentle: "you took a photo," not a strobe.

## Files touched (released app)

- **NEW** `js/86-v25-snapshot.js` — `snapshot` entity, capture compositor, snip-tool pointer logic, clipboard, paste/paste-in-place, draw, snip-marquee + Polaroid-flash overlays, runtime image-decode cache.
- `js/83-pdf-document.js` — add `window.renderPdfPageRegionToCanvas(file, bg, zoneMm, dpi)` (crisp zone render).
- `index.html` — `<script>` tag for 86; BB-rail Snapshot tile markup + SVG icon.
- `js/22-render-core.js` — one guarded line at the render tail to draw the snip-marquee + Polaroid-flash overlays (`snapDrawOverlay`).
- `js/74-v26-bb-rail.js` — Snapshot tile in the tool/annotate section + active-tile highlight.
- `js/42-keyboard.js` — `G` (2D-gated) → Snapshot tool; `Cmd/Ctrl+V` + `Cmd/Ctrl+Shift+V` snapshot-paste branches (fall through to existing 3D paste).
- `js/41-tools.js` — clear snapshot transient state in `setTool`.
- `js/39-events.js` — thin `tool==='snapshot'` hooks calling 86's pointer handlers (mousedown/move/up/dblclick).
- `js/69-v25-dispatch.js` — `snapshot` branch in `v25DrawEnt` → `drawSnapshot2D`.
- `js/71-v25-selection.js` — `snapshot` branches: bounds, hit-test (area, ranks low), handles (corners+edges+rotate), move/resize, inspector panel.
- `js/07-globals.js` — `snapClip`, snapshot capture/flash transient state.
- `js/04-workspace.js` — seed `file.imageBlobs` / `_nextImageId` on file create (mirror `pdfBlobs`).
- `js/50-project.js` — base64 round-trip `imageBlobs` on `.sdproj` save/load (mirror `pdfBlobs`).
- `js/45-dxf-export.js` — skip `snapshot` with a logged note.
- `CHANGELOG.md`.

(`js/84-session-store.js` needs no change — structured clone carries `imageBlobs` Uint8Arrays natively, exactly as it does `pdfBlobs`.)

## Dependency

Leans on the committed `multi-file-workspace`/PDF layer: `workspaceActiveFile()`, `file.pdfBlobs`, `page.bg`, `drawPdfBackground`, `renderPdfPageToBitmap` (js/83). All live and tracked.

## Navigation

- `02-design.md` — data model, capture pipeline, coordinate maths, persistence, visual spec, every integration point.
- `03-build-plan.md` — phased build + per-phase test cases.
