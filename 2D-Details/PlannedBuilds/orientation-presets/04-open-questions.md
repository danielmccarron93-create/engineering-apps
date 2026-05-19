# 04 — Open questions

Each question lists Claude's recommendation up front. Dan strikes through and writes the final answer when he replies.

## Q1 — EA and UA orientation count (blocking Phase 1 catalogue)

**Recommendation:** ship without EA/UA in v1. They're lower-frequency than the I-family and HSS-family, and the canonical orientation count for UA in particular is contested (typical-details sheets variously show 4 or 8 orientations depending on whether the two diagonal flips are considered distinct). Defer to v1.x once Dan has consulted the Bligh Tanner standard or his own typical-details preference.

**Status:** open. If Dan wants EA/UA in v1, please pick:
- EA: 3 (elev, sec heel-down-left, sec heel-down-right) or 4 (the above plus heel-up-left, heel-up-right)?
- UA: 4 (the four heel-pointing corners) or 8 (the above plus the four "long-leg-up" variants)?

## Q2 — PFC elevation toes-toward/away convention

**Recommendation:** distinguish them by drawing the open-face flange edge as a dashed AS 1100 hidden line in the toes-toward variant, and as solid lines in the toes-away variant. This matches the AS 1100 §3.6 convention for edges behind the visible face. Cost: ~6 lines of new code in the PFC elevation branch of `dev/js/68-v25-tools.js`.

**Status:** open. Confirm or propose an alternative convention (e.g. an inset second line representing the inner face of the open side).

## Q3 — Chord-key strategy for orientation cycling

**Recommendation:** ship without chord keys in v1. The mouse interaction is already a single click and the chord-key system in `dev/js/57-chord-layer.js` is already crowded (M/D/A/H/B/K/W). If we add an orientation chord later it would be `O` followed by a digit, but the value-per-friction is low — users will form muscle memory for the icon positions in the row faster than for chord sequences.

**Status:** open. Dan to confirm; if he wants chords, the spec is "after a member is armed, `O 1..9` cycles to that orientation index in the active type's catalogue."

## Q4 — SHS rotation in section view

**Recommendation:** SHS is biaxial-symmetric so rotation in cross-section is cosmetic and we ship with one section orientation. RHS is the only HSS member where the user actually cares (on-edge vs lay-flat), and it gets two section orientations in the v1 catalogue.

**Status:** open. Confirm SHS gets one section orientation only; rejecting this means adding a second SHS section orientation just for cosmetic alignment.

## Q5 — Apply orientation row to 3D-mode placement too?

**Recommendation:** no, not in this feature. 3D-mode members derive their visible orientation from the host detail-block's `viewKey` (Elevation / Section A / Plan B), not from a per-entity aspect field. Adding orientation buttons to 3D-mode placement is a different design conversation about how a single 3D PFC chooses its `openSide` at create time; that should be its own planning folder.

**Status:** open for visibility but no action required. Dan to confirm scope stays V25-2D-mode-only.

## Q6 — Inspector still exposes aspect/rot/openSide?

**Recommendation:** yes, keep all three editable in the Inspector for post-placement edits. The orientation row is only the *placement* affordance; post-placement edits via Inspector or grip handles continue to work the way they do today.

**Status:** likely uncontroversial. Confirm and we proceed.
