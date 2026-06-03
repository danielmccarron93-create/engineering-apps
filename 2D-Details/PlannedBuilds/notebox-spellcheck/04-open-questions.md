# 04 — Open questions

Each has a **recommendation**. 🔴 = blocking (build can't start until answered);
🟡 = shapes the build but has a safe default if unanswered. Answer inline (`> Dan: …`).

> **⏸ DEFERRED 2026-05-31.** Dan chose to build other upgrades first and did **not** answer
> these individually. The plan is intentionally left **build-ready on the defaults**: a
> future build chat should treat each **Recommendation** below as the decision unless Dan
> says otherwise. The only item that is a hard gate is **OQ-DICT-LICENCE**, and that's a
> *fact-check, not a preference* — verify the chosen en-AU dictionary's licence permits
> commercial redistribution in Phase 0 before bundling it (exactly as we did for the
> font's SIL OFL). Everything else can proceed on the recommendations.

---

### 🔴 OQ-DICT-LICENCE — which en-AU dictionary, and is it commercial-safe?

The single most important question, and the same diligence we did for the font. Common
en-AU Hunspell dictionaries and their licences:
- **`wooorm/dictionaries` → `dictionary-en-au`**: `(MIT AND BSD)` packaging over a
  SCOWL/Hunspell base — generally redistributable, attribution required. Cleanest option.
- **LibreOffice/OpenOffice en-AU**: often `LGPL`/`MPL` (or tri-licence). Bundling a data
  file is usually fine but adds licence obligations.
- **Avoid GPL-only** dictionaries (copyleft would taint a commercial product).

**Recommendation:** use the `dictionary-en-au` (SCOWL-derived, MIT/BSD) `.aff`/`.dic`,
vendor it into `dict/` with its `LICENCE` file alongside (exactly like `fonts/OFL.txt`).
Build chat must read + confirm the licence before Phase 0 completes; if it's not clean,
fall back to a SCOWL plain wordlist (smaller, weaker suggestions).

> Dan:

---

### 🔴 OQ-LIB — which checker library?

- **Typo.js** (Finke, MIT) — single classic-script file, `.check`/`.suggest`, loads
  Hunspell `.aff`/`.dic`. Zero bundling. *Recommended.*
- **nspell** (wooorm, MIT) — better maintained, but ships as ESM/CJS; needs a UMD build
  vendored (we have no bundler).
- **Homegrown** — a wordlist + Levenshtein suggestions. Smallest, but worst suggestions
  and no affix handling (plurals/inflections mis-flag).

**Recommendation:** **Typo.js** — it's the no-build-step fit, and pairs with the same
Hunspell `.aff`/`.dic` from OQ-DICT-LICENCE.

> Dan:

---

### 🟡 OQ-SQUIGGLE-SCOPE — underline canvas-rendered notes too, or editor-only?

Live squiggles in the **editor only** (canvas notes covered by the sweep) is far simpler
and avoids drawing red wave under every placed note (which would clutter the actual
drawing and look unprofessional on a screenshot/PDF).

**Recommendation:** **editor-only** live squiggles + the sweep for placed text. (Squiggles
never appear in PDF/DXF output regardless.)

> Dan:

---

### 🟡 OQ-SWEEP-SCOPE — what does "Check spelling" cover?

Current **sheet** (all its views) / current **view** only / whole **project** (all sheets).

**Recommendation:** **current sheet** for v1 (the natural unit of work), with the function
written to take a scope arg so "whole project" is a later one-liner.

> Dan:

---

### 🟡 OQ-SWEEP-COVERAGE — which entities does the sweep check?

All text-bearing entities (`noteBox`, `txtBox`, `note`, `mtext`, `leader2`, `memberTag`,
`materialTag`, `detailRef`) vs `noteBox`-only.

**Recommendation:** **all text-bearing entities** — the sweep is exactly where breadth
pays off (a typo in a member tag or leader matters as much as in a note).

> Dan:

---

### 🟡 OQ-SWEEP-UI — where do sweep results live?

A right-hand **results panel** (reuse the sheet-browser sidebar styling) / a cmd-palette
-style centred overlay / a section in the Settings tab.

**Recommendation:** a **results panel** (list of hits with Go-to/Replace/Ignore/Add),
reusing existing sidebar styling so it feels native.

> Dan:

---

### 🟡 OQ-MENU — custom right-click menu always, or only on a flagged word?

If always-custom inside the editor, we'd have to reimplement cut/copy/paste. If
only-on-flagged, normal right-click (native cut/copy/paste) still works elsewhere.

**Recommendation:** **custom menu only when right-clicking a flagged word**; otherwise
let the native menu through.

> Dan:

---

### 🟡 OQ-CAPS — the all-caps abbreviation skip threshold

Tokeniser skips all-caps tokens ≤ N letters as assumed abbreviations. N=4 skips
`UB/PFC/SHS/UNO/TYP/FFL` but still checks `GORUT` (5). Too high → misses short caps typos;
too low → flags real abbreviations.

**Recommendation:** **N = 4**, tunable, and back it with the engineering allow-list (which
covers longer abbreviations like `GALV`, `APPROX` explicitly).

> Dan:

---

### 🟡 OQ-ALLOWLIST — curated list in code, or an editable data file?

Keep the curated structural vocabulary inline in `js/80` vs a standalone
`js/02f-data-spell-terms.js` Dan can edit.

**Recommendation:** **inline in `js/80` for v1** + user "Add to engineering dictionary"
(localStorage). Promote to a data file later only if the list grows large or Dan wants to
hand-edit it.

> Dan:

---

### 🟡 OQ-TOGGLE-DEFAULT — spell-check on or off by default?

**Recommendation:** **on by default**, with the Settings toggle + persistence (so anyone
who finds it noisy can switch it off and that sticks).

> Dan:

---

### 🟡 OQ-F7 — add the F7 sweep shortcut?

Revit/Word use **F7** for "check spelling". Cheap to add in `js/42`.

**Recommendation:** **yes**, F7 launches the sweep (plus the cmd-palette command).

> Dan:

---

## Summary for the impatient

If you just reply "go with all your recommendations, and use the MIT/BSD `dictionary-en-au`
provided its licence checks out", that unblocks everything and the build chat can run
Phase 0→5. The only thing that can still stop it is the dictionary licence not being
clean — in which case we fall back to the SCOWL wordlist.
