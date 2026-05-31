# Premium Text-Box (`noteBox`)

Status: 🔨 Building
Last touched: 2026-05-30
Owner: Dan McCarron
Scope: A ground-up replacement for the cumbersome `prompt()`-based annotation flow — a premium 2D-mode text box with auto-wrapping outline (optional), one or more leader arrows, switchable lettering styles (authentic single-stroke CAD + 70s hand-drawn + modern), inline WYSIWYG editing, full grip editing, and per-detail defaults.

## TL;DR
Today the 2D "text box" is six fragmented entity types (`text`, `note`, `mtext`, `leader2`, `txtBox`) all created via blocking `prompt()` dialogs with crude fixed-pixel arrowheads, no inline editing, no box, no real wrap, and no style choice. This rebuild adds ONE first-class `noteBox` entity that:

- Places with **two clicks** (`q` → click box position → click arrow target) then opens an **inline editor** — type and watch the box auto-wrap to tidy proportions.
- **Reposition / resize / re-point** with grips; drag the body (arrows follow), drag a side to re-wrap, drag a tip to re-aim.
- **Shift-click adds a branch arrow** (and shift-click a tip removes it) — multi-leader, beating Revit/Bluebeam.
- **Switchable lettering** via a style registry: `professional` (crisp single-stroke CAD lettering, Bligh-Tanner-clean), `draftsman` (the same single-stroke font with a subtle ink-wobble + per-glyph jitter = authentic 1970s hand-drafted lettering), `plex` (modern IBM Plex). Flick between them in the options bar; **set a per-detail default** that sticks.
- **Optional outline** — boxed (thin rectangle) or leader-only (the standard Bligh-Tanner note look).
- Discrete, high-quality, scale-true arrowheads (filled / dot / open).

The key idea: real structural lettering is **single-stroke**, not a filled TTF. One bespoke single-stroke vector font does double duty — crisp = professional CAD, wobbled = hand-drawn — is fully offline, and **exports as true vector lines** to PDF and as MTEXT to DXF.

## Navigation
- [`CONTRACT.md`](CONTRACT.md) — **the frozen build spec.** Entity schema, style registry, every algorithm, every integration snippet. The build was executed against this.
- [`01-context.md`](01-context.md) — why, who for, the daily-workflow lens.
- [`02-design.md`](02-design.md) — architecture + **Files touched**.
- [`03-build-plan.md`](03-build-plan.md) — phased plan + progress tracker.
- [`04-open-questions.md`](04-open-questions.md) — decisions + how each was resolved.
