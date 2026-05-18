# Maintenance Rules

Read this before any styling change. The core rule:

> This is an aesthetic system. It does not touch behaviour. If a change requires editing
> JavaScript, stop — that is a feature change, not a styling change.

## Never touch (these are behaviour)

- Any file in `js/` — application logic, drawing, geometry, calculations, snapping, events.
- `lib/` — third-party libraries.
- `dev/` — development scaffold.
- `onclick=`, `oninput=`, `data-*` attributes — event wiring.
- Existing `id=` and `class=` values in HTML — JavaScript selects elements by them.
- The `<script>` tag order in `index.html`.
- The original `css/styles.css` — it is the kill-switch safety net. Leave it untouched.

## Safe to change (these are aesthetics)

- `css/02-design-tokens.css` — colours, type, radii, themes.
- `css/03-component-redesign.css` — component styling and targeted overrides.
- New CSS files, provided they are linked after `redesign.css`.
- The `data-theme` attribute on `<html>`.

## Rules for changes

1. Never hardcode a colour. Add a token to all three themes and reference it.
2. Never rename or remove an existing class or id.
3. No CSS framework, preprocessor, or build step — plain CSS only.
4. Use `!important` only to override an inline `style="..."` you cannot otherwise reach,
   and leave a comment explaining what it fixes.
5. Adding a wrapper `<div>` is a last resort — try CSS first, and confirm no JS depends on
   the DOM shape.

## Behaviour vs aesthetics

If unsure, assume behaviour. Specifically, **behaviour** = anything in a `.js` file, any
`onclick`/`oninput`/`data-*`, adding or removing HTML elements, or anything that changes
the shape of the DOM tree.

**Aesthetic** = editing the redesign CSS files, toggling the `data-theme` attribute, and
(rarely, carefully) swapping an inline `style="color:#xxx"` for a token on an element that
no JavaScript reads.

## Verifying a change

1. Serve the app locally (`python3 -m http.server` from the app folder) and open it.
2. Switch through Warm, Mono, Dark.
3. Click through a real workflow: draw a beam, place a column, open Schedules, open the
   Raft Designer, open the Floor/Joist Calc Sheet, switch levels, Export PDF, Save, reload.
4. Check the browser console for new errors.
5. Test the kill switch: comment out the `redesign.css` link — the app must revert cleanly.
