# Typography

StructuralSketch uses three typefaces, all free and Google-hosted, loaded in `index.html`.
The fallbacks in each token mean the app still works if Google Fonts is unreachable.

| Family | Token | Used for | Weights |
|---|---|---|---|
| **Geist** | `--ss-font-sans` | Body text, labels, buttons, headers | 400, 500, 600, 700 |
| **Geist Mono** | `--ss-font-mono` | Numbers, IDs, dimensions, sizes, grades | 400, 500, 600 |
| **Source Serif 4** | `--ss-font-serif` | Subtitles, hints, empty states — *italic only* | 400i, 500i |

## Geist (sans)

The default UI font: header brand name, ribbon button labels, modal body copy, panel
headers, status-bar labels.

## Geist Mono

Everywhere a number, code, ID, or technical value appears:

- Mark IDs — `B1`, `PF2`, `C1`, `FL2`, `BR3`
- Section sizes — `310UB46.2`, `100x100x5 SHS`
- Canvas dimensions — `14 400`, `9 400`
- Status-bar coordinates — `x 8240  y 4500`
- Material grades — `300PLUS`, `N32`
- Quantities and utilisation — `25.7 m3`, `1.84 t`, `0.78`, `L/410`
- Grid bubbles — `A`, `B`, `1`, `2`

## Source Serif 4 (italic only)

This is the "warmth" font — use it *sparingly*. Only for:

- The subtitle next to the app title.
- Modal subtitles.
- Footnotes in modal footers.
- Empty-state messages in tables.
- The hint paragraph in the Raft Designer.

Never use serif italic for buttons, labels, mark IDs, or anything functional.

## The font link

In `index.html`'s `<head>`, above the other stylesheet links:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&family=Source+Serif+4:ital,wght@0,400;0,500;1,400;1,500&display=swap" rel="stylesheet">
```

The existing `Architects+Daughter` link stays — it is used for handwriting-style
annotations on drawings and is unrelated to the UI redesign.

## Numeric features

The redesign CSS sets `font-feature-settings: "ss01", "cv11"` globally. To force tabular
(monospaced) numerals on a specific element, use `font-variant-numeric: tabular-nums`.
