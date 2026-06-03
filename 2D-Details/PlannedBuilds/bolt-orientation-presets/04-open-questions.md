# 04 — Open questions

All resolved or carry a recommended default. **Nothing blocking** — a build chat can start Phase 1.

## Resolved in the plan chat (2026-05-31)

- **Q. Which modes?** → **2D-mode only.** 3D bolts already clamp + orient from the model.
- **Q. Grip in 2D paper-space?** → End-on = circle, **no clamp**. Clamp **only in section**, auto-detected from the already-drawn 2D stack (plate + member webs/walls). No 3D raycast.
- **Q. Orientation set?** → Five presets: `end`, `h-nutR`, `h-nutL`, `v-nutB`, `v-nutT` (end-on + horizontal×2 + vertical×2, nut on either side).

## Carries a recommended default (confirm during build if it bites)

- **Q1. Clamp face-positioning precision.** v1 sums crossed-material thickness and centres the bolt on the stack centroid → exact *grip length*, visually centred, but washer faces aren't pixel-snapped to each plate face.
  **Recommendation:** ship the centred version; rely on drag + `gripOverride`. Exact per-glyph face alignment is a later refinement only if it reads poorly at the STP 6011 bar.

- **Q2. Reading v2 plate thickness from the v1 side.** The clamp needs a 2D plate's `pt` and footprint.
  **Recommendation:** reuse the `plate2` mirror that `js/v2/engine/v1-bridge.js mirrorV2IntoV1` injects for auto-weld (face extraction already exists near `js/68:1170`). Confirm the cleanest field for thickness; if awkward, read the v2 plate element params directly. Fall back to `gripOverride` if a plate can't be measured.

- **Q3. Bolt size/grade floor + defaults.** Default **M20, 8.8/S**; size floor **M12**.
  **Recommendation:** Size picker M12–M36 from `BOLT_DB`; Grade `4.6/S` & `8.8/S`. Out of scope: /TF, /TB variants.

- **Q4. Auto-callout on placement.** Whether placing a bolt also drops a `boltCallout` ("M20 8.8/S") label.
  **Recommendation:** **out of scope** for v1 — keep placement to the glyph only; callouts stay a separate manual action.

- **Q5. SHS/RHS/CHS as hosts.** `v25Mem2Thickness` returns wall `t` for these, so a section bolt through one wall clamps `t`; a through-bolt across both walls isn't auto-handled.
  **Recommendation:** v1 uses the single wall `t` (correct for a one-wall fixing); the through-HSS case is a later UX decision.
