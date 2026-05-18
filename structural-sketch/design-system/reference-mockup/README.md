# Reference Mockup

This folder contains the working, themed proof-of-concept that the redesign is based on.

## How to view

Open `StructuralSketch Redesign.html` in any modern browser (Chrome / Edge / Safari / Firefox). It loads from `unpkg.com` for React/Babel and `fonts.googleapis.com` for the fonts. You need an internet connection.

## What you'll see

- A faithful re-creation of the StructuralSketch main screen, themed three ways.
- Top-right toggle: **Warm / Mono / Dark**. Click each to see all three themes.
- Click **Raft Slab** in the Design ribbon group → the Raft Designer modal.
- Click **Schedules** in the Document group → the Schedules modal with 9 tab categories.
- Click **Export** (top right) → the PDF export modal.

## What it is NOT

- This is **NOT** the real StructuralSketch app. It does not draw, calculate, snap, or save. It is a static visual reference.
- The sample plan in the canvas is hardcoded SVG — your real app's canvas keeps working as-is.
- The data in Schedules and Raft Designer is illustrative, not real.

## What to use it for

- A visual target for Claude Code: "make my app look like this."
- A reference for component layout, spacing, type sizes, and color usage.
- A demo to share with collaborators to confirm the direction.

## Files

- `StructuralSketch Redesign.html` — entry point.
- `styles.css` — all three themes + every component.
- `app.jsx` — top-level React component (theme state, modal state).
- `chrome.jsx` — header, ribbon, panels, status bar.
- `canvas.jsx` — the sample SVG framing plan.
- `modals.jsx` — Raft Designer, Schedules, PDF export.
- `icons.jsx` — the icon set.

These files are NOT meant to be copied into your real project. They are reference only. The CSS in `02-design-tokens.css` and `03-component-redesign.css` is the actual deliverable that Claude Code will apply to your existing code.
