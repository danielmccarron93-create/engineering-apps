# Components & Tokens

## Token reference

All tokens are defined in `css/02-design-tokens.css`. Theme-independent tokens (fonts,
radii, layout heights, motion) live in `:root`. Colour tokens are redefined per theme.

### Theme-independent

| Token | Value |
|---|---|
| `--ss-font-sans` / `-mono` / `-serif` | the three families |
| `--ss-r-1` … `--ss-r-4` | 4 / 6 / 10 / 14px — inputs, buttons, cards, modals |
| `--ss-r-pill` | 999px |
| `--ss-h-header` / `-ribbon` / `-status` | 48 / 92 / 32px |
| `--ss-ease`, `--ss-dur-fast/base/slow` | 120 / 200 / 360ms |

### Colour tokens (redefined per theme)

| Group | Tokens |
|---|---|
| Surfaces | `--ss-bg-app`, `-surface`, `-canvas`, `-elevated`, `-sunken`, `-hover`, `-active` |
| Ink (text) | `--ss-ink-1` (primary) … `--ss-ink-5` (faintest) |
| Lines | `--ss-line-1` (hairline) … `--ss-line-3` (strong) |
| Accent | `--ss-accent`, `-hover`, `-soft`, `-line`, `-ink`, `-fg` |
| Semantic | `--ss-ok`, `--ss-warn`, `--ss-danger` |
| Plan / drawing | `--ss-plan-paper`, `-grid`, `-ink`, `-beam`, `-column`, `-wall`, `-zone` |
| Shadows | `--ss-shadow-1` … `--ss-shadow-4` |

### Bridge tokens

`02-design-tokens.css` also re-defines the *original* `styles.css` variable names
(`--bg-app`, `--text-primary`, `--accent`, `--border-subtle`, …), mapping each to a new
`--ss-*` token. This is how the original stylesheet inherits the new themes without being
rewritten. **Don't remove the bridge block** — it is load-bearing.

## Component treatment

`03-component-redesign.css` restyles existing class names; no HTML class needs to change.
What each area becomes:

| Area | Classes | Treatment |
|---|---|---|
| Header | `header`, `.app-title`, `.app-subtitle`, `.tbtn` | 48px slim bar, serif-italic subtitle, flat ghost buttons; `#btn-export-pdf` becomes the filled accent button |
| Theme toggle | `.ss-theme-seg` | segmented pill, top-right of header |
| Ribbon | `.toolbar`, `.ribbon-panel`, `.rbtn`, `.rbtn-sm`, `.rbtn-split` | flat buttons, accent-soft when active, group separators via border-left |
| Status bar | `#status-bar`, `.status-label`, `.status-value`, `.ortho-badge` | 32px, mono numerals, uppercase labels |
| Floating panels | `#layer-panel`, `#props-panel`, `.layer-row`, `.prop-row` | frosted glass, rounded rows, accent-soft when active |
| Modals (generic) | `.modal-overlay` + `.modal-box` and the named modal IDs | translucent backdrop, 14px-radius elevated card, soft shadow |
| Schedules | `.schedule-tab`, `#schedule-table`, `.edit-cell` | underline-active tabs, sticky uppercase headers, mono cells |
| Raft Designer | `.raft-*` | sectioned panel, mono inputs, pass/fail tinted cards |
| Level bar | `#level-bar`, `.level-tab` | 2px accent-underline active tab |
| Banners | `.tool-banner`, `.calib-banner`, `.banner-btn` | frosted, hairline, soft shadow |
| Context menu | `#context-menu`, `.ctx-item` | card chrome, accent-soft hover |

Buttons follow one family: `.btn-primary` / `.raft-btn.primary` / `.banner-btn.primary`
are filled accent; cancels are ghost; everything else is outlined.

## How to add a fourth theme

1. In `css/02-design-tokens.css`, copy the entire `[data-theme="mono"]` block.
2. Rename the selector, e.g. `[data-theme="blueprint"]`.
3. Change the colour values. Keep **every** token name — never add or drop tokens.
4. Keep that theme's bridge-token block unchanged (it only maps names).
5. In `index.html`, add a fourth button to `.ss-theme-seg`:
   `<button type="button" data-ss-theme="blueprint">…</button>`.
6. Add `blueprint` to the `VALID` array in the theme-toggle script.
7. Add a `.ss-theme-seg .ss-dot[data-theme="blueprint"]` swatch rule in
   `03-component-redesign.css`.

No component CSS changes are needed — that is the point of the token system.
