# Design Principles

Every visual decision in StructuralSketch should serve at least one of these five
principles. They are the "why" behind the tokens and component styles.

## 1. Calm, not silent

The app should feel quiet but alive — not so minimal it looks unfinished, not so busy it
fatigues. Calm comes from:

- Generous spacing — 12–16px around major regions, 8–10px within groups.
- Restrained colour — the accent appears in under 5% of pixels at rest.
- Hairline 1px borders — never 2px, never thick dividers.
- Soft, warm-tinted shadows — `0 6px 24px rgba(...,0.07)`, not bold drop shadows.

"Alive" comes from 120–180ms hover transitions and small, quiet motion cues.

## 2. Paper, not panels

The drawing area should feel like a sheet of paper, not a software panel. The workspace is
a fine dot-grid; the drawing canvas is a slightly elevated card with a soft shadow. **Even
in Dark mode, the paper is the lightest surface in the canvas region** — never the darkest.

## 3. Numbers deserve their own font

Every measurement, mark ID (B1, PF2, C1), grid label, section size (310UB46), material
grade (N32), and quantity is set in **Geist Mono**. Numbers and identifiers carry precise
meaning for structural engineers — they should not share a font with prose. See
`typography.md`.

## 4. The accent earns its appearance

The accent colour (terracotta / blue / amber) appears in only four places:

- The active tool button in the ribbon.
- The active layer or selected row in a panel.
- The primary button on a modal (Commit, Export PDF).
- The selection highlight on the canvas.

Everywhere else the accent is absent. That is what makes "active" instantly visible.

## 5. Three themes, one app

Warm, Mono, and Dark share **identical layout, type sizes, spacing, and shadow shapes**.
Only the colour tokens change. Switching theme mid-session should feel like the app faded
between moods — never like jumping between different apps. A fourth theme is a ~50-line
token addition, not a redesign (see `components.md`).

## Anti-patterns to avoid

- Heavy gradients on buttons — use flat fills or a single soft shadow.
- The bright Revit-blue accent in the Warm or Dark themes — the accent must suit the theme.
- Emoji used as icons — use proper SVG.
- ALL-CAPS micro-labels below 10px — minimum 10px for caps, with 0.08em letter-spacing.
- Excel-style alternating row stripes — use a single hover state instead.
- Hardcoded hex colours in component CSS — every colour must be a token.

## What "warmth" means here

The Warm theme is the default because the goal is "subtle warmth and quality that makes the
app enjoyable to use". Concretely that means: warm cream off-white paper (not pure white),
an earthy terracotta accent (not a screaming orange), a serif italic lurking in subtitles,
lower contrast than a typical CAD UI, tabular numerals everywhere a number appears, and one
consistent set of corner radii instead of a hodgepodge.
