# 01 — Context

## The problem
The 2D-mode annotation tooling is the weakest surface in the app. Adding a note today means:
1. Pick one of several overlapping tools (`text`, `note`, `mtext`) — unclear which.
2. A blocking `prompt()` dialog interrupts the drawing flow.
3. For multi-line text you type literal `\n`. For `mtext` you answer a *second* prompt for width.
4. The result can't be edited — you delete and recreate.
5. The arrowhead is a hardcoded 6-pixel triangle that doesn't scale, and there's no text box, no
   auto-wrap (except `mtext`), no style choice.

For a senior engineer laying notes on a detail all evening, that is death by a thousand cuts. It
feels "low quality and very cumbersome" (Dan's words) and is visibly worse than Bluebeam/Revit.

## Who it's for
Dan — a senior Australian structural engineer producing AS 1100 / 4100 / 3600 details that another
senior engineer signs and issues. Notes on a structural detail are not decoration; they carry the
instructions a fabricator/drafter acts on. The bar is **STP Typical Structural Details p.85
(6011.1–6011.6)**: clean leaders, a discrete arrowhead, lettering that looks like it belongs on a
signed structural drawing.

## The daily-workflow lens
- Notes get **placed fast and edited often** → two-click placement + inline WYSIWYG editing, no modal.
- A note usually **points at something** → leader-first design, with the box optional (the classic
  Bligh-Tanner note is leader-only; a boxed note suits a keyed callout).
- One note often points at **several** identical things → **multi-arrow** (shift-click to branch).
- A detail has a **house style** → pick `professional` vs `draftsman` once, set it as the default,
  keep going. Mixed sheets stay possible (style is per-note).

## Why single-stroke lettering is the right call
Structural drawings — hand-drafted ones from the 70s and modern CAD alike — use **single-stroke**
lettering (`romans.shx`, `isocp`, a draughtsman's pen). Filled TTF fonts (what Revit/Bluebeam use)
never look quite right on a detail. A bespoke single-stroke vector font:
- Crisp → professional CAD lettering (Bligh-Tanner clean).
- + subtle ink-wobble + per-glyph jitter → genuine 1970s hand-drafted lettering.
- Is **resolution-independent, fully offline, and exports as real vector lines** to PDF and as text
  to DXF.
This is the differentiator — it's better than, not just equal to, the incumbents for this domain.

## Constraints (from CLAUDE.md)
- 2D-mode (V25 paper-space) only — annotations are paper-space entities; the two-mode mandate is for
  members/fasteners/hatches, not notes.
- No build step; classic `<script>` globals; `'use strict';` per file; metric; AS 1100 lineweights
  via `LW`; the palette (BB-rail tile + `q`) is the discoverable surface — **no** autoload demos,
  floating buttons, or pop-ups.
