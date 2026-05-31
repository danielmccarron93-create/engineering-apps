# 04 — Open questions

Each question lists Claude's recommendation up front. Dan strikes through and writes the final answer when he replies.

## Q1 — Fabrication-gap tolerance for plate stacks (blocking Phase 2)

**Recommendation:** when two adjacent material intervals along the bolt axis are separated by less than 5 mm of free space, merge them into a single grip block. The 5 mm value reflects typical fabrication tolerances for steel-to-steel butt joints — anything tighter is real material continuity, anything looser is a real gap (e.g. a packer plate gap that should be detailed explicitly).

**Rationale:** the T-cleat sketch shows two plates butted face-to-face. In the user's drawing they may not be perfectly touching at the pixel level — a 0.5 mm visual gap shouldn't make the bolt 0.5 mm longer than it should be. The 5 mm tolerance absorbs sketch-quality input without falsely merging real gaps.

**Status:** open. Confirm 5 mm or propose an alternative.

## Q2 — Free-space placement indicator

**Recommendation:** a faint orange dot at the bolt centre, plus a tooltip on hover saying "grip = ? (no host material detected)". The bolt is placed at the default 12 mm grip and the user can override in the Inspector.

**Rationale:** silent failure (just defaulting to 12 mm with no visual signal) hides a problem that's easy to miss until the drawing is being checked. A loud visual signal (red flash, modal) is overkill for what's often an intentional choice (e.g. annotating where a bolt will go before drawing the host plate).

**Status:** open. Confirm orange dot vs alternative (red dot, exclamation mark, no indicator).

## Q3 — Default washers count

**Recommendation:** `'both'` (one washer head-side, one washer nut-side). Matches AS 4100 §9.3.2.2 standard practice for general-purpose connections.

**Status:** likely uncontroversial. Confirm.

## Q4 — Grade dropdown — show both grades or only 8.8/S by default?

**Recommendation:** show both `4.6/S` and `8.8/S` from v1 in a single dropdown, defaulting to `8.8/S`. The /S grade family is the only one in scope for v1; the dropdown is two options now and grows when /TF and /TB are added in v1.x.

**Status:** open. Confirm scope is /S only for v1 (not /TF or /TB).

## Q5 — Connection-builder integration (cap plate / baseplate / WSP / splice)

**Recommendation:** out of scope for this build. The connection builders in `dev/js/48-connection-builders.js` currently emit 3D bolts inside their macros. Teaching them to emit `bolt2` on a 2D sheet is a substantial cross-cutting change that deserves its own planning folder.

**Suggested follow-up:** after this build ships, open a `2d-connection-builders` planning folder covering: (a) detecting whether the active sheet is 2D, (b) emitting `bolt2` + `plate2` instead of 3D bolts + 3D plates, (c) the macro-explode UX (do the user-placed entities stay grouped or explode into independent primitives?).

**Status:** flagged for Dan. Confirm scope stays as proposed.

## Q6 — One-sided fixing for HSS members (parked for v1.x)

**Out of scope for v1** as agreed in the planning conversation. SHS / RHS / CHS hosts come in v1.1 with their own UX decision around through-bolt vs one-sided.

**No action required for v1.** Flagging here so it's recorded.

## Q7 — Bolt callout text format

**Recommendation:** the callout text format `"<n>/M<size> <grade> BOLTS w/ STD WASHERS"` (e.g. "2/M20 8.8/S BOLTS w/ STD WASHERS") matches typical Bligh Tanner detail callouts. The `<n>` field is populated by counting bolts in a user-selected group when the callout tool runs against multiple selected `bolt2` entities; for a single bolt it's "1/".

**Status:** open. Confirm format or paste a typical Bligh Tanner bolt callout string for Claude to match.

## Q8 — Inspector grip-override UI

**Recommendation:** a checkbox "Auto-grip" (default checked) with a numeric grip field that's read-only when auto is on and editable when auto is off. Toggling Auto on recomputes the raycast.

**Status:** open. Confirm or propose alternative (e.g. a tri-state: auto / manual / locked-to-current-auto-value).

## Q9 — Save-format migration scaffold (closing known issue #5)

**Recommendation:** add `schemaVersion: 1` to all new saves. On load, if `data.schemaVersion === undefined` treat as 0 and pass through unchanged (no migration logic needed for the absent-to-1 step since the only schema addition is the `bolt2` entity type which old saves won't have). Set up the `migrate(data, fromVersion, toVersion)` function shape so future schema changes have somewhere to land.

**Status:** open. Confirm this is the right moment to roll the schema-version work into the bolt build rather than wait for a dedicated PR.
