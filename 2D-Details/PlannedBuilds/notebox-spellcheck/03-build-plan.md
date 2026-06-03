# 03 — Build plan

Phased so each boundary is independently verifiable and shippable. A build chat stops at
each boundary, browser-tests through `index.html`, and updates the progress tracker.
There is no `node` on this machine — verification is browser-based (load the `/tmp` served
copy, drive the editor, screenshot), exactly as the font feature was verified.

**Gate:** do not start Phase 1 until `04-open-questions.md` is answered — especially
**OQ-DICT-LICENCE** (the dictionary must be confirmed commercial-bundling-safe first).

---

## Phase 0 — Vendor the assets (no app wiring yet)

- Download the chosen checker → `lib/typo.min.js`; verify it's the expected file
  (integrity-check like the font: size, a known string, MIT licence header).
- Download en-AU Hunspell `.aff` + `.dic` → `dict/`; **read and save the licence**
  alongside; confirm it permits commercial redistribution (the OQ-DICT-LICENCE gate).
- Add `<script>` tags to `index.html`. Smoke-test: page still loads, console clean,
  `typeof Typo === 'function'`.

**Verify:** app loads unchanged; the lib global exists; no console errors.

## Phase 1 — Engine (`js/80-spellcheck.js`), headless-testable

- Lazy loader: `spellEnsureLoaded()` → fetch `.aff`/`.dic`, build the Typo instance once
  (memoised Promise). Until resolved, `check()` returns "ok" (never flags) so the editor
  is never blocked.
- `tokenise(text)` per the skip rules in `02-design.md`.
- `check(word)` (allow-list → user dict → ignore set → Typo) and `suggest(word)` (top N).
- Build the allow-list from `02-data-sections.js` / `03-data-bolts.js` + the curated list.
- `addUserWord` / `addEngWord` / `ignoreWord` + localStorage load/save.
- `spellEnabled` getter/setter + localStorage.

**Verify (browser console):** drive the test fixtures in `05-test-cases.md` —
`tokenise` skips the right tokens; `check('GORUT')` false, `check('GROUT')` true,
`check('M20')`/`check('galv')` true (allow-listed); `suggest('GORUT')` includes `GROUT`.

## Phase 2 — Live squiggles in the editor (`js/81` overlay + `js/98` hooks)

- `nbSpellAttach(el, ent)` builds the backdrop div behind `#nbEditorTA`; `nbSpellSync()`
  mirrors the textarea geometry/style and re-renders flagged spans (debounced);
  `nbSpellDetach()` tears it down.
- Wire guarded calls into `js/98`: open → attach, oninput + `_nbPositionEditor` → sync,
  `nbCloseEditor` → detach.
- `css/styles.css`: `.sp-backdrop`, `.sp-bad` (red wavy underline).

**Verify:** open a note, type `GORUT BEDDING TYP` → only `GORUT` is underlined; `M20`,
`TYP`, `BEDDING` clean; squiggles track the words while you pan/zoom/resize the box;
uppercase display still aligns. Screenshot.

## Phase 3 — Right-click fix menu (`js/81`)

- `contextmenu` on the textarea → token hit-test → if flagged, custom `.menu.open` with
  suggestions + Ignore + Add-to-dictionary + Add-to-engineering-dictionary.
- Clicking a suggestion replaces just that token in `el.value` + `ent.text`, re-syncs,
  re-renders the note. "Add" updates the engine sets + localStorage and clears the squiggle.

**Verify:** right-click `GORUT` → suggestions include `GROUT`; click it → word fixed in
editor and on canvas; "Add to dictionary" on a custom term makes its squiggle disappear
and persists across reload. Right-click a correct word → native menu still works.

## Phase 4 — Document sweep (`js/81` + `js/52` + optional `js/42`)

- `spellSweep(scope)` over the text-entity field map; results panel (reuse sidebar
  styling) with Go-to / Replace / Ignore / Add per hit.
- cmd-palette "Check spelling…" command; optional F7 shortcut.

**Verify:** place several notes/tags with planted typos; run the sweep; each hit lists
correctly; Go-to selects + centres the entity; Replace writes back and re-renders;
counts update. Screenshot the panel.

## Phase 5 — Settings toggle + polish (`js/74`)

- "Spell-check notes" checkbox in the Settings tab (default on), persisted; when off,
  attach/sync/sweep all no-op.
- Pass over: debounce timing, suggestion count, menu styling vs the app theme, the
  STP-quality "does this feel like Bluebeam" check.
- `CHANGELOG.md` entry; update this folder's progress tracker; update the dashboard row.

**Verify:** toggle off → no squiggles, no menu, sweep disabled; toggle on → returns;
survives reload. Full regression pass on the noteBox editor (placement, typing, leaders,
commit/cancel) to confirm the overlay didn't disturb the FROZEN contract.

---

## Progress tracker

| Phase | Status | Notes |
|---|---|---|
| 0 — vendor assets | ✅ done (2026-06-01) | Typo.js (Modified BSD) + en-AU Hunspell *(MIT AND BSD)* vendored to `lib/`+`dict/` with licences; OQ-DICT-LICENCE gate cleared by fact-check. |
| 1 — engine | ✅ done | `js/80-spellcheck.js` + dictionary moved to a dedicated data file `js/02f-data-spell-terms.js` (337 allow tokens + 138 abbrevs, adversarially vetted). Browser-console fixtures from `05` all pass. |
| 2 — live squiggles | ✅ done | Backdrop `<div>` overlay; only the typo is underlined, proprietary terms clean; tracks the box. |
| 3 — right-click fix | ✅ done | Suggestions + Ignore + Add×2; replace fixes editor + canvas. |
| 4 — sweep | ✅ done | `spellSweep()` over the full field map; results panel with Go-to/fix/Ignore/Add; F7 + palette. |
| 5 — settings + polish | ✅ done | "Spell-check notes" toggle in the Settings tab (`js/59`) → global `spellEnabled` + `localStorage` (NOT `sheetInfo`); on by default. |

**Built 2026-06-01** — browser-verified end-to-end on a served `/tmp` copy (no console errors). A 5-dimension adversarial review pass followed (contract-safety, engine edge-cases, overlay alignment, UI/sweep robustness, house-style); findings were applied + re-verified: per-frame font/transform mirror on the squiggle backdrop (fixes alignment before the first keystroke — the double-click-then-right-click-fix flow), a stale-hit guard so the sweep can never Replace into a wrong-sheet colliding-id entity, sweep-Replace routed through an open editor, trailing-apostrophe + `×÷` tokeniser fixes, the Settings toggle reconciling a live editor overlay, and a guarded palette command. **Post-handoff fix (2026-06-01):** the dictionary was loading via `fetch('dict/en_AU.*')`, which Chrome blocks on `file://` — so opening `index.html` directly from disk gave no squiggles (silent degrade-to-"never-flag"). Switched to a vendored `dict/en_AU-dict.js` (the aff/dic as JS globals) loaded via `<script>` injection in `js/80` (works on `file://` *and* http, still lazy). Re-verified end-to-end in the real q→place→type flow: `MOSTSG` flagged, dictionary injected + ready. Pending Dan's review + commit; then archive per the ship checklist.

> Note on scope: live squiggles are **editor-only** by design (they show while a note's text box is open, and never print to PDF/DXF) — placed notes are checked via **F7 / "Check spelling"**. If you'd prefer the red mark to also stay visible on *placed* notes on-screen (still suppressed in export), that's a small, well-scoped follow-up.

## Out of scope (explicitly, for v1)

- Squiggles drawn on canvas-rendered notes (sweep covers placed text instead).
- Grammar / style checking. Spelling only.
- Multiple languages / language switcher (en-AU fixed; structure leaves room to add).
- Spell-checking the inspector's text fields live (the sweep already reads them).
- Auto-correct-as-you-type. Suggestions are offered, never auto-applied.
