# StructDraw — 2D Structural Details

A browser-based tool for producing AS 1100 / AS 4100 / AS 3600 / AS 1101 / AS 1252 compliant 2D structural details, built by a structural engineer for structural engineers. No installer, no build step — open `index.html` in a modern browser and it runs.

## Features

- **A1 detail sheets** with up to four projected views (Elevation / Section A / Plan B / Isometric)
- **Parametric steel members** — UB / UC / PFC / SHS / RHS / CHS / EA / UA — auto-rendered in plan, elevation, and section
- **AS 1252 bolts** with realistic hex profiles and sawtooth threads
- **AS 1100 cross-hatching** for steel cuts
- **AS 1101.3 weld symbols** with auto-detected weld interfaces
- **3D isometric view** (Three.js) — draw in 2D, verify in 3D
- **V25 2D paper-space mode** for blockwork details, anchors, reinforcement
- **5 themes**: warm-light (default), warm-dark, classic, dark, BT (Bligh Tanner brand)
- **PDF export** — vector (preferred) and raster fallback
- **DXF export** — AutoCAD R2013 ASCII for drafter handoff
- **Multi-page projects** with a Bluebeam-style sheet browser
- **Save / load** projects as `.sd2.json`
- **Snap engine** with edge-snap, ortho, polar, grid
- **Command palette** (Ctrl+K) and full keyboard shortcuts

## Run it

```bash
# Serve over HTTP (recommended — file:// can have CORS quirks)
python3 -m http.server 8765

# Then open
open http://localhost:8765/index.html
```

Or just double-click `index.html` — most features work from `file://` too.

## Project layout

```
2D-Details/
├── index.html              the app shell
├── css/styles.css          ~1,500 lines, 5 themes
├── js/                     numbered JS files (classic <script>) + v2/ tree
│   ├── 01-config.js        sheet config
│   ├── ...
│   └── 74-v26-bb-rail.js   left-rail module (loads last)
│
├── archive/                historical snapshots and shipped-plan archive
├── Images/                 section thumbnails (PNG)
└── Thumbnails-SVG/         SVG previews
```

See [CLAUDE.md](CLAUDE.md) for the full file map and developer playbook.

## Development workflow

One source tree — `index.html`, `css/`, `js/`. No build step, no staging copy.

1. Edit the files directly.
2. Test in a browser at `http://localhost:8765/`.
3. Commit when it works; push to GitHub.

Git is the safety net: the uncommitted working tree is "in progress", a commit
is a checkpoint, and a push is the off-machine backup.

## Architecture in one paragraph

A 22,000-line app split into 75 numbered classic-script files plus one CSS file. All globals stay top-level — `tool`, `blocks`, `viewport`, `ctx`, etc. are accessible across files because classic `<script>` tags share global scope. No build step, no bundler, no transpiler — every file runs in any modern browser as-is. Dependencies are Three.js r128 and jsPDF 2.5.1, loaded from CDN at the top of the shell. The thin shell `index.html` (1,310 lines) is the HTML body + `<link>` for CSS + 75 `<script src>` tags in numeric load order.

## Standards

| Code | Subject |
|---|---|
| AS 1100 | Drawing & lineweight conventions |
| AS 4100 | Steel structures |
| AS 3600 | Concrete structures |
| AS 1101 | Welding symbols |
| AS 1252 | High-strength bolts |
| AS/NZS 3679.1 | Hot-rolled steel sections |
| AS/NZS 1163 | Cold-formed hollow sections |
| AS/NZS 4455 | Concrete masonry units |
| NCC | National Construction Code (when relevant) |

## Limitations (today)

- Single-user. No live collaboration.
- File-based persistence (`.sd2.json`). No cloud sync.
- No autosave — save manually before closing the browser.
- CDN-only deps (works offline only after first load and only if cached).

See [CLAUDE.md → Phase 2 priorities](CLAUDE.md) for the upgrade path.

## License

Proprietary. © Daniel McCarron, all rights reserved.

This may be relicensed for distribution as the product matures. For now, the source is here to make the development workflow visible — it is not open-source.
