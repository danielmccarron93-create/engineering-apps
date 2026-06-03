# 01 — Context

## The idea

Add spell-check to the note text box, "like Revit or Bluebeam" — a live red squiggle
under misspelled words while typing, a right-click menu to fix them, and (Revit-style) a
command that checks every note on the sheet at once.

## Who it's for

Dan, and eventually any senior Australian structural engineer using StructDraw to
annotate details. The text on a structural detail is short, dense, and **full of
shorthand**: section sizes (`310UB40.4`), bolt designators (`M20`, `4.6/S`), bar callouts
(`N16-200`, `SL82`), abbreviations (`U.N.O.`, `TYP`, `CRS`, `c/c`, `FFL`, `GALV`, `HDG`),
and standard references (`AS 4100`). A spell-checker that flags all of those is worse than
none — the engineer learns to ignore the squiggles and a real typo (`GORUT BEDDING`,
`DERILL & EPOXY`) slips onto an issued drawing.

So the defining requirement is **jargon-awareness**: real prose typos get caught,
structural shorthand never does. This is why we are *not* using the browser's native
spell-check (which is one flag away but can't be taught an allow-list).

## Why now

The `premium-textbox` `noteBox` just shipped a proper inline `<textarea>` editor — the
hard part (a real editing surface) already exists. Spell-check is the natural next layer
on top of it. It also pushes two Phase-2 goals forward: vendoring assets locally for
offline use (goal #6), and making the annotation workflow genuinely production-grade.

## How the reference tools actually behave

**Bluebeam Revu** — *in-place, live.*
- As you type in a text box / callout, misspelled words get a red wavy underline.
- Right-click a flagged word → a menu of suggestions, plus **Ignore All** and **Add to
  Dictionary**. Pick a suggestion and it replaces the word.
- Has a custom dictionary the user grows over time; supports multiple languages.

**Revit** — *batch sweep.*
- "Check Spelling" (Annotate tab, or F7) opens a dialog that walks the text notes in the
  selection / view, showing each misspelling with **Ignore / Ignore All / Change / Change
  All / Add**. It's a sweep over already-placed text, not a live squiggle.
- Also has a user dictionary and respects an exceptions list.

**What we take from each:**
- From Bluebeam: the **live squiggle + right-click fix** inside the editor.
- From Revit: the **sweep** that checks all placed notes (the live squiggle only helps
  while a box is open; the sweep catches everything already on the sheet).
- From both: a **user dictionary** ("add to dictionary" persists), plus our own twist —
  an **engineering allow-list** seeded from the app's own catalogues so shorthand is
  silent from day one.

## Constraints carried from `CLAUDE.md`

- **No build step / classic scripts.** The checker must be a single classic `<script>`
  (no bundler), and globals flow between files. Rules out anything that needs npm/ESM
  bundling unless it ships a UMD/standalone build.
- **Offline + commercial.** Vendor the checker and dictionary locally (no CDN). The
  dictionary licence must permit redistribution in a commercial product — this needs the
  same diligence we did for the font (see `04-open-questions.md` OQ-DICT-LICENCE).
- **`noteBox` CONTRACT is FROZEN.** Spell-check attaches to the editor's lifecycle; it
  must not change the entity shape, save format, or the editor's existing behaviour.
- **AS / metric / en-AU.** Australian spelling is the default (colour, centre,
  galvanised, metre), not US.
