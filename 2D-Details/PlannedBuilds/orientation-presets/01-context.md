# 01 — Context: how aspect/orientation works today and what's wrong with it

## What exists today

When a user clicks a 2D-mode Member tile (UB / UC / WB / PFC / SHS / RHS / CHS) from the V26 BB-rail Members section in `dev/js/74-v26-bb-rail.js`, the dispatcher in `dev/js/69-v25-dispatch.js` runs `v25PickAndSetMember(type)` at line 190, which sets `tool = 'v25-mem'`, writes the chosen type into `v25State.memberType` and a default section into `v25State.section`, and leaves `v25State.aspect` at whatever it was (defaulting to `'elev'`). The quick-options bar at the top of the canvas is then rebuilt by `v25UpdateOptionsBar` in `dev/js/72-v25-options-bar.js`. For `tool === 'v25-mem'` (line 48), it renders:

1. A bold member-type label ("UB", "PFC", etc.).
2. A `<select>` for Section, populated from the appropriate `UB_DB` / `PFC_DB` / etc., with a "Pick…" button for the centred picker.
3. A `<select>` for Aspect, with two options: "Elevation" and "Cross-section".
4. *Only when both `memberType === 'pfc'` and `aspect === 'sec'`*: a third `<select>` for Open face (−v / +v).

The renderer at `dev/js/68-v25-tools.js` line 421 onward then dispatches on `ent.memberType` and `ent.aspect` (lines 428, 529, 634 for the three section-shape families) to draw the appropriate outline. For PFC in cross-section, the `ent.openSide` field flips the C-shape orientation at line 535.

Post-placement, the user can rotate the member by selecting it and dragging a grip handle (via `dev/js/11-grip-handles.js`), or by editing `ent.rot` in the Inspector (`dev/js/59-inspector.js`).

## What's wrong with that UX

Three problems compound across the day-to-day workflow.

**The Aspect dropdown hides information.** Two clicks to switch from elevation to cross-section — one to open the dropdown, one to pick. For a feature used 50+ times per detail sheet, that's friction. Worse, the user has to remember which dropdown holds "Cross-section" — it's not visible until the dropdown opens.

**The PFC Open-face dropdown is conditional and conceptually inverted.** It only appears when Aspect is "Cross-section", which means the user has to make the Aspect choice *first* before they can express the orientation. A drafter doesn't think this way — they think "PFC, toes pointing down" as one decision, not "PFC, then Cross-section, then Open-face −v". The label "−v (toward bottom)" requires the user to mentally map the field name to the screen direction. Drafting language ("toes up", "toes down") is more natural.

**Post-placement rotation works but isn't a discovery mechanism.** The 24 ortho presets in `dev/js/19-member-frame.js` (the V24 member-frame system) cover the rotational possibilities, but only after the member is placed. A user who's about to place a PFC has no visual menu of "here are the six standard orientations" — they have to know to draw it, then rotate it, then maybe flip openSide via the Inspector.

## How the orientation row fixes it

Replace both dropdowns with a row of small icon buttons in the same quick-options bar. Each icon shows the actual member orientation as it will appear on the page. Click the icon = pick that orientation. The row sits below the Section/Pick row and replaces the Aspect dropdown entirely.

For a UB, the row shows three icons: elevation (horizontal beam outline), cross-section with web vertical (I-shape standing up), cross-section with web horizontal (I-shape lying down). For a PFC, six icons: two elevations (toes facing away / toes facing towards the reader, distinguished by which face is solid vs broken), four cross-sections (toes up, toes down, toes left, toes right). For SHS/RHS/CHS, three (elevation plus two cross-section orientations). EA and UA are deferred to v1.x pending Dan's confirmation of the canonical orientation count.

The orientation row is also the discoverability surface for the *next* feature in the queue — `v25-2d-bolts`. Once the bolt entity exists, the same row mechanism shows the bolt's five orientations (head-on circle + four side profiles) when the user clicks the Bolt tile. One UI primitive, two consumers.

## Adjacent things that don't change

The 3D-mode Model palette in `dev/js/60-tile-palette.js` (`getPaletteDef().model`) is untouched. 3D members get their aspect from the host block's `viewKey` (Elevation / Section A / Plan B), not from a per-entity field, so the orientation-row UX has no equivalent there. The same logic applies to 3D bolts in `dev/js/33-draw-bolt.js`.

The Inspector still exposes `aspect`, `rot`, and `openSide` as editable fields for post-placement editing — the orientation row only changes the *placement* flow.

`ent.rot` continues to work the same way for ad-hoc rotation after placement (drag a grip, type a value in the Inspector). The orientation presets just set the initial `rot` value when a preset is clicked. The two systems compose cleanly — a user who wants 22° rotation still types it in the Inspector after placement.

## Quality-bar reference

The orientation set per type is calibrated against the **STP Typical Structural Details PDF page 85, details 6011.1–6011.6**. Those typical-detail sheets render exactly the orientations this catalogue exposes; the row icons should match their visual idiom.
