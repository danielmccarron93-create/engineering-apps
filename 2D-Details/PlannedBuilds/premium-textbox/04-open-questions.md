# 04 — Open questions (and how they were resolved)

Dan's brief was detailed, so most decisions were resolvable with strong, reversible defaults rather
than blocking the build. Where a choice is genuinely his taste (which lettering to default to), the
design makes it a one-click setting and the build ships multiple candidates to pick from.

| # | Question | Resolution |
|---|---|---|
| 1 | Hand-drawn font: web "handwriting" TTF vs authentic single-stroke vector? | **Single-stroke vector font** (bespoke, `js/96`). It's what real structural lettering is, looks better than any TTF on a detail, is offline + resolution-independent, and exports as true vector. The *same* font crisp = `professional`, wobbled = `draftsman`. |
| 2 | New entity vs extend a legacy one? | **New `noteBox` entity.** The legacy `text`/`note`/`mtext`/`leader2`/`txtBox` are fragmented and `prompt()`-bound; a clean first-class entity is the right call. Legacy types stay loadable for old saves. |
| 3 | Scope: 2D only, or both modes? | **2D-mode (V25) only** — annotations are paper-space; CLAUDE.md's two-mode mandate is for members/fasteners/hatches. Design leaves room to extend to 3D later. |
| 4 | How does "set a default" work? | Options bar writes `v25Last.note*` + persists to `localStorage`; new notes read it. Style is **per-note** so mixed sheets stay possible; the default just seeds new notes. |
| 5 | Outline on/off? | Per-note `boxed` flag. Default on (thin outline). Off = the classic Bligh-Tanner leader-only note. Toggle in options bar + inspector. |
| 6 | Add-arrow gesture? | **Shift-click** while the note is selected (or active) adds a branch arrow; **Shift-click an existing tip removes it.** Matches Dan's "hold shift and click to add an extra arrow". |
| 7 | Editing model? | Inline `<textarea>` overlay (WYSIWYG, live re-wrap), not a modal. Enter = newline; Esc / click-away / Ctrl-Enter = commit; empty commit discards the note. Double-click re-edits. |
| 8 | Which style is the default? | **Dan's call after seeing it.** Build ships `professional` as the initial default and screenshots all three; Dan picks, and "set as default" makes it stick. |

## Anything still needing Dan
- Pick the default lettering style after reviewing the screenshots (Q8). One click; not blocking the
  build.
- Confirm the `draftsman` hand-wobble intensity feels right (tunable: `NB_STYLES.draftsman.wobble` /
  `.jitter`) — easy to dial in during review.
