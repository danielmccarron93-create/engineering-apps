# StructuralSketch Design System

This folder is the **style guide** for StructuralSketch. It exists so the app keeps a
single, consistent look as new features are added — instead of each feature being styled
in isolation and ending up feeling "tacked on".

## How the theming works

The redesign is **additive**. The original `css/styles.css` is untouched. New styling is
layered on top by `css/redesign.css`, which is linked in `index.html` *after* `styles.css`:

```
css/styles.css                     <- original — never edited
css/redesign.css                   <- entry point — @imports the two files below
   |- css/02-design-tokens.css      <- the 3 themes (Warm / Mono / Dark)
   |- css/03-component-redesign.css <- restyles the existing component classes
```

`styles.css` already defines its colours as CSS variables (`--bg-app`, `--text-primary`,
`--accent`, ...). `02-design-tokens.css` redefines those same variables per theme, so the
whole app re-colours automatically with no JavaScript involved.

The active theme is set by `data-theme="warm" | "mono" | "dark"` on the `<html>` element.
A small script in `index.html` drives the top-right toggle and remembers the choice in
`localStorage`.

## The kill switch

If anything ever looks wrong, comment out **one line** in `index.html`:

```html
<!-- <link rel="stylesheet" href="css/redesign.css"> -->
```

The app instantly reverts to its original appearance. No data is lost, no behaviour changes.

## The single source of truth

**`css/02-design-tokens.css` is the source of truth for all colour, type, radius, spacing,
shadow, and motion.** Never hardcode a colour anywhere else. If you need a new colour, add
a token there (in all three themes) and reference it with `var(--ss-...)`.

## Adding a new feature? Stay on-brand.

This checklist is the whole point of this folder. When you build a new tool, panel, or
modal — in this chat or any future one — run through it so the feature looks native:

- [ ] **No hardcoded colours.** Use `var(--ss-...)` tokens (see `components.md`). No `#hex`,
      no `rgb()`, no inline `style="color:..."`.
- [ ] **Use the three fonts.** Body/labels -> `var(--ss-font-sans)`. Numbers, IDs, sizes,
      dimensions -> `var(--ss-font-mono)`. Subtitles/hints -> `var(--ss-font-serif)` italic.
      See `typography.md`.
- [ ] **Reuse existing component classes.** A new dialog should use `.modal-overlay` +
      `.modal-box`; a new panel should match `#layer-panel` / `#props-panel`; buttons should
      use `.btn-primary` / `.rbtn` / `.tbtn`. Reusing classes means automatic theming.
- [ ] **If you must add a new modal/panel class**, add it to the modal selector lists in
      `03-component-redesign.css` so it inherits the chrome (radius, shadow, overlay).
- [ ] **Test in all three themes** before considering the feature done.
- [ ] **Respect the principles** in `principles.md` — generous spacing, hairline borders,
      a restrained accent, soft shadows.

## Files in this folder

- `README.md` — this file.
- `principles.md` — the five design principles and what "warmth" means.
- `typography.md` — the three fonts and where each is used.
- `components.md` — token reference, class-by-class treatment, and how to add a 4th theme.
- `maintenance-rules.md` — what is safe to change vs what must never be touched.
- `reference-mockup/` — a working HTML mockup of the target look. Open
  `StructuralSketch Redesign.html` in a browser and use the top-right toggle.
