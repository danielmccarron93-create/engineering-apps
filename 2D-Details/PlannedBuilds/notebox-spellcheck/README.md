# Note-box spell-check engine

```
Status: 👀 In review — built + browser-verified 2026-06-01 (proceeded on the recommended defaults; OQ-DICT-LICENCE fact-checked: en-AU dict is (MIT AND BSD), commercial-safe). Pending Dan's review + commit.
Last touched: 2026-06-01
Owner: Dan McCarron
Scope: Revit/Bluebeam-style spell-check for note text — bundled en-AU dictionary +
       engineering allow-list, live squiggles + right-click fix in the noteBox editor,
       and a "check all notes" sweep across the sheet.
```

> **Picking this up later:** the plan is finished and self-contained. Dan deferred to do
> other upgrades first (2026-05-31) and did not answer the open questions individually —
> so a build chat should proceed on the **Recommendation** lines in
> [`04-open-questions.md`](04-open-questions.md), confirming only the dictionary licence
> (a fact-check) before bundling. Start at Phase 0 in [`03-build-plan.md`](03-build-plan.md).

## TL;DR

The premium `noteBox` editor is a real `<textarea>`. Native browser spell-check would
work with a one-line flag — but it flags every piece of structural shorthand (`M20`,
`SHS`, `U.N.O.`, `CRS`, `galv`) and can't be taught an allow-list. So we're building a
**custom engine** instead: a bundled en-AU dictionary + a curated engineering
allow-list, so real typos get flagged and shorthand never does. This is the only path
that also gives a Revit-style **document sweep** ("check all the notes on this sheet").

Same bundling philosophy as the Routed Gothic font we just shipped: **vendored locally,
no CDN** — works offline, immune to CDN changes (and aligns with Phase-2 goal #6).

## What "done" looks like

- Type a note → real misspellings get a red wavy underline **live**, in the editor.
- Right-click a flagged word → **suggestions** + Ignore + Add to dictionary. Click a
  suggestion to fix it in place. (The Bluebeam workflow.)
- Engineering shorthand and section/bolt/bar designators are **never** flagged.
- A **"Check spelling"** command sweeps every text entity on the sheet, lists the
  misspellings, and lets you jump-to-and-fix each one. (The Revit workflow.)
- A Settings toggle turns the whole thing on/off (default on). Australian English.

## Quality bar

The reference is the in-place feel of **Bluebeam Revu** (live squiggle + right-click
fix) and the sweep of **Revit** ("Check Spelling" dialog). The engineering allow-list
is what makes it usable for a structural engineer rather than noise — that is the
feature, not a nicety.

## Navigation

- [`01-context.md`](01-context.md) — what/who/why, and how Revit & Bluebeam actually behave
- [`02-design.md`](02-design.md) — architecture, data model, integration points, **Files touched**
- [`03-build-plan.md`](03-build-plan.md) — phased build (each phase browser-verified)
- [`04-open-questions.md`](04-open-questions.md) — **decisions pending Dan** (each with a recommendation)
- [`05-test-cases.md`](05-test-cases.md) — verification fixtures (tokeniser, allow-list, suggestions, sweep)

## Status / next step

This is a **plan**. No code is written yet (per the two-chat workflow in `CLAUDE.md`).
The blocking items are in [`04-open-questions.md`](04-open-questions.md) — most notably
the **dictionary licence** (an en-AU Hunspell dictionary must be confirmed
commercial-bundling-safe, the same diligence we did for the font). Once Dan answers,
this moves to ✅ Ready to build and a fresh build chat executes `03-build-plan.md`.

## Relationship to other ideas

Extends the shipped `premium-textbox/` `noteBox` (its `CONTRACT.md` is FROZEN — this
attaches to the editor lifecycle, it does **not** change the entity contract). The
live-squiggle hooks into `js/98` are additive and guarded. Touches `index.html` and
`css/styles.css` (as most ideas do) but in new, isolated blocks.
