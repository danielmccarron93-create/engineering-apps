# 02 — Design

## Architecture at a glance

Four layers, smallest blast radius first:

```
┌─ js/80-spellcheck.js  (ENGINE, no DOM) ───────────────────────────────┐
│  • lazy-loads the vendored checker (lib/typo) + dict (dict/en_AU.*)    │
│  • tokenise(text) → words worth checking (skips codes/numbers/units)   │
│  • check(word) → ok?  /  suggest(word) → [fixes]                       │
│  • allow-list: catalogue-derived (UB/SHS/M20/N16…) + curated abbrevs   │
│  • user dict + ignore set (localStorage 'sd2.spellUserDict')           │
│  • spellEnabled flag (localStorage 'sd2.spellEnabled', default on)     │
└────────────────────────────────────────────────────────────────────────┘
        ▲ pure functions, typeof-guarded, no globals leaked but its API
        │
┌─ js/81-spellcheck-ui.js  (DOM) ──────────────────────────────────────┐
│  • EDITOR overlay: a backdrop <div> mirroring the noteBox textarea,    │
│    drawing red wavy underlines under flagged words (live, debounced)   │
│  • right-click menu (reuses .menu/.menu-item): suggestions / ignore /  │
│    add-to-dictionary / add-to-engineering-dictionary                   │
│  • SWEEP: scan every text entity on the sheet → results panel →        │
│    jump-to + replace/ignore/add per hit                                │
└────────────────────────────────────────────────────────────────────────┘
        ▲ attached by                         ▲ launched by
        │                                      │
┌─ js/98 (noteBox editor) ─┐      ┌─ js/52 cmd-palette + js/74 Settings ─┐
│  open → nbSpellAttach     │      │  "Check spelling" command            │
│  input/position → Sync    │      │  Settings: on/off toggle             │
│  close → nbSpellDetach    │      └──────────────────────────────────────┘
└───────────────────────────┘
```

The engine (`80`) has **no DOM dependency** and is unit-testable headlessly. All
cross-file calls are `typeof`-guarded (the house style) so load order can't break things,
and so the noteBox editor degrades gracefully to "no squiggles" if `80`/`81` are absent.

## The vendored assets

- `lib/typo.min.js` — **Typo.js** (Christopher Finke, MIT). Single classic-script file;
  `new Typo("en_AU", affData, dicData)` then `.check(word)` / `.suggest(word)`. (Final
  library choice is OQ-LIB.)
- `dict/en_AU.aff`, `dict/en_AU.dic` — Hunspell **en-AU** affix + dictionary. ~0.5–1 MB.
  (Source + **licence** is OQ-DICT-LICENCE — a hard gate, see open questions.)

Establishes the project's first `lib/` and `dict/` directories — consistent with Phase-2
goal #6 (vendor three.js / jspdf to `lib/`). Loaded **lazily** (`fetch` the `.aff`/`.dic`
text on first need), so startup and first paint are untouched.

## Tokeniser — the heart of "low noise"

`tokenise(text)` only emits tokens worth spell-checking. A token is **skipped** (treated
as correct, never flagged) when ANY of:

| Skip rule | Examples skipped |
|---|---|
| contains a digit | `M20`, `N16-200`, `100x50x6`, `32MPa`, `8No`, `AS4100` |
| all upper-case AND ≤ 4 letters (likely an abbrev/designator) | `UB`, `PFC`, `SHS`, `EW`, `FFL`, `UNO`, `TYP` |
| in the engineering allow-list (case-insensitive) | `galv`, `weldmesh`, `chamfer`, `purlin`, `nogging` |
| in the user dictionary / ignore set | anything the user added |
| length < 2, or non-alphabetic (punctuation, `Ø`, `@`, `&`, `/`) | `&`, `@`, `Ø` |

Everything else (ordinary alphabetic words ≥ 2 chars) is checked against the dictionary.
The "all-caps ≤ 4 letters" rule is the pragmatic one — it silences the dense abbreviation
soup of a steel detail. (Caps words ≥ 5 letters like `GORUT` are *still* checked, so real
typed-in-caps typos are caught. Threshold is tunable — OQ-CAPS.)

## The engineering allow-list

Two sources, merged at load:

1. **Auto-derived from the app's own catalogues** (so it stays in sync as catalogues
   grow): section family prefixes + common designations from `02-data-sections.js`
   (`UB UC PFC RHS SHS CHS EA UA`), bolt designators from `03-data-bolts.js`
   (`M12 M16 M20 M24 M30 M36`, grades `4.6 8.8 …`). These are mostly digit-bearing so the
   tokeniser already skips them — this list is the belt-and-braces for the wordy ones.
2. **Curated structural-vocabulary list** (in `80`): trade words a general en-AU dict may
   miss + standard abbreviations spelled out — e.g. `galv galvanised weldmesh purlin
   nogging packer ferrule grout shim cog cogged lap chamfer fillet gusset cleat haunch
   corbel soffit nib starter dowel chair bondek trimmer stiffener` and abbreviations
   `UNO NTS TYP CRS DIA GALV HDG FFL SSL RL CL EQ MIN MAX APPROX EW EF NF FF CFW FW SOP`.

User-grown terms ("Add to engineering dictionary") persist alongside the user dict.
Whether the curated list later graduates to an editable data file is OQ-ALLOWLIST.

## Editor squiggle overlay (the fiddly bit)

Technique: a **backdrop `<div>`** inserted as a sibling behind the existing `#nbEditorTA`
textarea, styled to mirror it **exactly** (same left/top/width/height/padding/font/size/
line-height/letter-spacing/`white-space:pre-wrap`/`word-break`/`overflow-wrap`/
`text-transform`). The backdrop renders the note text with flagged words wrapped in
`<span class="sp-bad">`; the textarea sits on top with a transparent background so its
caret/selection stay live and the red squiggles show through under the words.

- The noteBox editor already owns textarea creation, positioning (`_nbPositionEditor`,
  rAF-glued to the box) and input. The overlay just **shadows** those: `81` exposes
  `nbSpellAttach(el, ent)`, `nbSpellSync()`, `nbSpellDetach()`, and `98` calls them at
  open / on-input+on-position / on-close. All guarded — if `81` is missing, nothing
  happens.
- Re-check is **debounced** (~250 ms) on input; re-layout of spans is cheap.
- `text-transform: uppercase` is mirrored onto the backdrop so squiggles line up with the
  displayed (uppercased) glyphs. Wrapping matches because the backdrop copies the exact
  wrap-affecting CSS.
- Squiggles are **editor-only** by default (canvas-rendered notes are covered by the
  sweep, not per-glyph canvas underlines — OQ-SQUIGGLE-SCOPE).

## Right-click fix menu

On `contextmenu` inside the textarea: map `clientX/clientY` → caret index
(`el.selectionStart` after a synthetic caret set, or a measured hit-test) → the token at
that index. If that token is flagged, `preventDefault` the native menu and open a
`.menu.open` (the js/56 favourites pattern + existing CSS) listing:

```
  <suggestion 1>        ← click replaces the token in textarea + ent.text, re-checks
  <suggestion 2>
  <suggestion 3>
  ───────────
  Ignore (this session)
  Add to dictionary
  Add to engineering dictionary
```

If the token is **not** flagged, we let the native menu through (so normal
cut/copy/paste still works). (Custom-always vs custom-on-flagged is OQ-MENU.)

## Document sweep (Revit-style)

`spellSweep(scope)` walks text entities and collects `{entId, view, type, field, word,
context, suggestions}` hits. Field map per entity type (from `js/71` inspector):

| Entity type | Text field(s) |
|---|---|
| `noteBox` | `text` |
| `txtBox` | `txt` |
| `note`, `mtext` | `txt` |
| `leader2` | `txt` (override) |
| `memberTag` | `mark`, `spacing` |
| `materialTag`, `detailRef` | `title`, `ref`, (text) |

Results render in a **panel** (reusing the sheet-browser sidebar styling, OQ-SWEEP-UI).
Each hit: **Go to** (select the entity + centre the view), **Replace** (write the fix
back to the field, `requestRender`; for a `noteBox` also invalidate its layout cache),
**Ignore**, **Add to dictionary**. Sweep scope (current sheet vs view vs whole project)
is OQ-SWEEP-SCOPE; entity coverage (all text types vs noteBox-only) is OQ-SWEEP-COVERAGE.

Launched from a `js/52` cmd-palette command "Check spelling…" and optionally **F7**
(Revit's shortcut) via `js/42`.

## Settings + persistence

- BB-rail **Settings** tab (`refreshSettingsTab` in `js/74`): a checkbox **"Spell-check
  notes"** (default on) + a line noting the dictionary is en-AU. Persists to
  `localStorage 'sd2.spellEnabled'`.
- User dictionary + engineering additions: `localStorage 'sd2.spellUserDict'` /
  `'sd2.spellEngTerms'` (mirrors the `sd2.noteDefaults` convention in `js/98`).
- Ignore set is **session-only** (not persisted) — matches Bluebeam's "Ignore".

## Data model / state

No change to any entity. New module-level state lives in the engine:

```
// js/80-spellcheck.js
let _spDict      = null;     // Typo instance once loaded (null until lazy-load resolves)
let _spLoading   = null;     // in-flight load Promise (so we load once)
let _spAllow     = null;     // Set<string> lower-cased allow-list (built once)
let _spUser      = null;     // Set<string> from localStorage 'sd2.spellUserDict'
let _spIgnore    = new Set();// session-only "ignore" words
let spellEnabled = true;     // mirror of localStorage 'sd2.spellEnabled'
```

Per the house rule, any genuinely global flag goes in `js/07-globals.js`; everything else
stays module-private in `80`. (Only `spellEnabled` is arguably global — OQ none, default
to module-private with a getter.)

## Files touched

**NEW**
- `lib/typo.min.js` — vendored checker (classic script, MIT).
- `dict/en_AU.aff`, `dict/en_AU.dic` — bundled en-AU Hunspell dictionary (+ a `LICENCE`/
  attribution file alongside, per OQ-DICT-LICENCE).
- `js/80-spellcheck.js` — engine (band 80–89 "future shared modules", per `CLAUDE.md`).
- `js/81-spellcheck-ui.js` — editor overlay, right-click menu, sweep, settings wiring.

**MODIFIED**
- `index.html` — `<script>` tags for `lib/typo.min.js`, `js/80`, `js/81` (after `js/98`).
- `css/styles.css` — `.sp-bad` (wavy underline), `.sp-backdrop` (overlay), sweep-panel
  styles (reuse `.menu` for the right-click menu).
- `js/98-v25-notebox-ui.js` — guarded `nbSpellAttach/Sync/Detach` calls in the editor
  open/input/position/close lifecycle; mirror the existing `spellcheck="false"` decision
  (leave native off — we own squiggles).
- `js/74-v26-bb-rail.js` — Settings-tab "Spell-check notes" toggle in `refreshSettingsTab`.
- `js/52-cmd-palette.js` — "Check spelling…" command → `spellSweep`.
- `js/42-keyboard.js` — optional F7 shortcut for the sweep (OQ-F7).

**No change** to save/load (no entity fields added), DXF/PDF export, or the noteBox
entity/render/contract.

## Risks & mitigations

- **Dictionary licence** (highest risk) — must be commercial-bundling-safe. Gate the
  build on confirming it (OQ-DICT-LICENCE). Fallback: a permissive SCOWL-derived wordlist
  (smaller, weaker suggestions) if no suitable Hunspell licence.
- **Overlay wrap/alignment drift** — the backdrop must match the textarea's wrapping
  exactly or squiggles sit under the wrong glyphs. Mitigation: copy the textarea's
  computed style for all wrap-affecting properties; cover with the test fixtures in `05`.
- **Bundle size** — ~1 MB dict. Mitigation: lazy-load on first edit (or idle), gzip on
  the server; it never blocks startup.
- **False positives** — the whole design hinges on the tokeniser + allow-list. Mitigation:
  the test fixtures in `05` are mostly real detail strings; tune thresholds against them.
- **CONTRACT drift** — keep all `98` hooks additive + guarded; zero change to entity shape.
