# 05 — Test cases

Browser-console fixtures (no `node` on this machine). Drive them against the loaded app
after each phase. The strings are real structural-detail text — the tokeniser + allow-list
must stay quiet on all the shorthand and only flag the genuine typos.

## A. Tokeniser — what gets checked vs skipped

For each input, list the tokens the engine should actually spell-check (everything else
is skipped and treated as correct).

| Input string | Checked tokens (the rest skipped) |
|---|---|
| `M20 BOLTS @ 70 CRS` | *(none — all skipped: digit/allcaps-short)* |
| `8 No. M16 4.6/S BOLTS` | `No` *(or skipped if allow-listed)* |
| `DRILL & EPOXY N16 STARTERS` | `DRILL`, `EPOXY`, `STARTERS` |
| `GROUT BEDDING 30 THK TYP.` | `GROUT`, `BEDDING` |
| `GALV. PURLIN CLEAT U.N.O.` | `PURLIN`, `CLEAT` *(GALV allow-listed)* |
| `310UB40.4 BEAM` | `BEAM` |
| `100x100x6 SHS POST` | `POST` |
| `CFW ALL ROUND 6 CFW` | `ALL`, `ROUND` |
| `Ø20 HOLES @ 150` | `HOLES` |

## B. check(word) — true = correctly spelled / accepted

| Word | Expected | Why |
|---|---|---|
| `GROUT` | ✅ true | dictionary |
| `GORUT` | ❌ false | typo |
| `DERILL` | ❌ false | typo (of DRILL) |
| `BEDDING` | ✅ true | dictionary |
| `M20` | ✅ true | skipped (digit) → accepted |
| `galv` / `GALV` | ✅ true | engineering allow-list (case-insensitive) |
| `weldmesh` | ✅ true | engineering allow-list |
| `purlin` | ✅ true | allow-list (en-AU dict may miss it) |
| `nogging` | ✅ true | allow-list |
| `colour` | ✅ true | en-AU spelling accepted |
| `color` | ❌ false | US spelling flagged under en-AU *(confirm desired — OQ none, expected)* |
| `centre` | ✅ true | en-AU |
| `galvanised` | ✅ true | en-AU (not `galvanized`) |

## C. suggest(word) — the top suggestions must contain the obvious fix

| Word | Must include |
|---|---|
| `GORUT` | `GROUT` |
| `DERILL` | `DRILL` |
| `EPOXSY` | `EPOXY` |
| `STARTRES` | `STARTERS` |
| `CONCRET` | `CONCRETE` |

(Casing: suggestions should respect the input's case — `GORUT` → `GROUT`, not `grout` —
since note text is typically upper-case.)

## D. Live overlay (Phase 2)

1. Open a note, type `GORUT BEDDING TYP` → exactly one underline, under `GORUT`.
2. Fix it to `GROUT` → underline clears on next debounce.
3. Type a long wrapping line → squiggle stays under the right word after wrap.
4. Pan/zoom/resize the box → squiggles stay glued to their words (overlay tracks the
   textarea, which is rAF-glued to the box).
5. Toggle the note to a Routed Gothic style and a stroke style → overlay still aligns
   (it mirrors the textarea's font, which the editor already sets per style).

## E. Right-click fix (Phase 3)

1. Right-click `GORUT` → menu lists `GROUT` (+ others) + Ignore + Add×2.
2. Click `GROUT` → only that token changes, in editor **and** on the canvas note.
3. "Ignore" → squiggle clears this session; reload → it's flagged again (ignore is
   session-only).
4. "Add to dictionary" on a bespoke product name → squiggle clears; **persists** across
   reload (localStorage).
5. Right-click a correctly-spelled word → native browser menu (copy/paste) still appears.

## F. Sweep (Phase 4)

Fixture: place these in one sheet —
- `noteBox`: `GORUT BEDDING TYP`
- `noteBox`: `DERILL & EPOXY N16 STARTERS`
- `memberTag` mark: `310UB40.4` (no typo → no hit)
- `leader2` txt: `CONTINUOUS CFW U.N.O.` (no hit)
- `txtBox`: `SETOUT FORM EDGE` (`SETOUT` allow-listed/ok; no hit) + `MISLAIGNED` (hit)

Run "Check spelling" → exactly 3 hits: `GORUT`, `DERILL`, `MISLAIGNED`. Each:
- **Go to** selects the entity and centres the view on it.
- **Replace** with the suggestion writes back to the right field and re-renders (and for
  the `noteBox`, the box re-flows — layout cache invalidated).
- **Ignore** / **Add** behave as in §E.
- After fixing all three, a re-run reports 0 hits.

## G. Settings + regression (Phase 5)

1. Settings → "Spell-check notes" OFF → no squiggles, right-click is native, sweep is
   disabled/greyed. Reload → still off.
2. ON again → behaviour returns.
3. **Regression (FROZEN contract):** placement (two-click), typing, Enter/newline,
   Esc/Ctrl-Enter commit, empty-note auto-delete, leader add/branch, grip move/resize all
   behave exactly as before with the overlay attached. No console errors.
