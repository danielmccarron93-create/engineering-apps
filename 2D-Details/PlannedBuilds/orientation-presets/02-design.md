# 02 — Design: orientation catalogue, row component, integration points

## Orientation catalogue

A single static data table keyed by member type. Each entry is a pure transform of `{ aspect, rot, openSide? }` plus an icon and a human label.

```js
// dev/js/72b-orientation-presets.js
const V25_ORIENT = {
  ub: [
    { id: 'elev',     label: 'Elevation',         icon: 'icon-orient-ub-elev',    aspect: 'elev', rot: 0 },
    { id: 'sec-vert', label: 'Section — web vert',icon: 'icon-orient-ub-sec-v',   aspect: 'sec',  rot: 0 },
    { id: 'sec-horz', label: 'Section — web horz',icon: 'icon-orient-ub-sec-h',   aspect: 'sec',  rot: 90 },
  ],
  uc:  /* same shape as ub */,
  wb:  /* same shape as ub */,
  pfc: [
    { id: 'elev-away',   label: 'Elev — toes away',     icon: 'icon-orient-pfc-elev-away',   aspect: 'elev', rot: 0,   openSide: '-v' },
    { id: 'elev-toward', label: 'Elev — toes toward',   icon: 'icon-orient-pfc-elev-toward', aspect: 'elev', rot: 0,   openSide: '+v' },
    { id: 'sec-up',      label: 'Section — toes up',    icon: 'icon-orient-pfc-sec-up',      aspect: 'sec',  rot: 0,   openSide: '+v' },
    { id: 'sec-down',    label: 'Section — toes down',  icon: 'icon-orient-pfc-sec-down',    aspect: 'sec',  rot: 0,   openSide: '-v' },
    { id: 'sec-left',    label: 'Section — toes left',  icon: 'icon-orient-pfc-sec-left',    aspect: 'sec',  rot: 90,  openSide: '-v' },
    { id: 'sec-right',   label: 'Section — toes right', icon: 'icon-orient-pfc-sec-right',   aspect: 'sec',  rot: 270, openSide: '-v' },
  ],
  shs: [
    { id: 'elev',     label: 'Elevation',           icon: 'icon-orient-shs-elev',  aspect: 'elev', rot: 0 },
    { id: 'sec',      label: 'Section',             icon: 'icon-orient-shs-sec',   aspect: 'sec',  rot: 0 },
    /* SHS is biaxial-symmetric so rotation is cosmetic; v2 if needed */
  ],
  rhs: [
    { id: 'elev',         label: 'Elevation',            icon: 'icon-orient-rhs-elev',     aspect: 'elev', rot: 0 },
    { id: 'sec-on-edge',  label: 'Section — on edge',    icon: 'icon-orient-rhs-edge',     aspect: 'sec',  rot: 0 },
    { id: 'sec-lay-flat', label: 'Section — lay flat',   icon: 'icon-orient-rhs-flat',     aspect: 'sec',  rot: 90 },
  ],
  chs: [
    { id: 'elev',     label: 'Elevation',           icon: 'icon-orient-chs-elev',  aspect: 'elev', rot: 0 },
    { id: 'sec',      label: 'Section',             icon: 'icon-orient-chs-sec',   aspect: 'sec',  rot: 0 },
  ],
  // ea, ua — deferred to v1.x pending Dan's confirmation of canonical orientation count
};
```

UC and WB share the I-section shape with UB and inherit the same three-orientation set.

PFC orientations are the canonical six from a Bligh Tanner / STP typical-details sheet. The `openSide` field maps to the existing renderer logic in `dev/js/68-v25-tools.js` line 535 (`openUp = ent.openSide === '+v'`) so no renderer changes are needed — only the value being written. The two elevation orientations (toes away / toes toward) are *new* — currently the elevation renderer doesn't distinguish them visually because PFC in elevation looks like a UB outline. Suggested distinction: in the toes-toward variant, the open face is shown as a slightly broken / dashed line per AS 1100 §3.6 (hidden edges of the open face); the toes-away variant uses solid lines. Worth a small extension to the existing renderer in Phase 3 — flagged in `04-open-questions.md` Q4.

## Row component

```js
// dev/js/72b-orientation-presets.js

function v25BuildOrientationRow(memberType) {
  const presets = V25_ORIENT[memberType] || [];
  if (!presets.length) return document.createElement('div'); // empty fallback
  const row = document.createElement('div');
  row.id = 'v25OrientRow';
  row.style.cssText = 'display:flex;gap:4px;align-items:center;flex-wrap:wrap';
  const lastId = (lastUsedOrientation[memberType])
    || (v25State.aspect === 'sec' ? presets.find(p => p.aspect === 'sec')?.id : presets[0].id)
    || presets[0].id;
  for (const p of presets) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'v25-orient-btn' + (p.id === lastId ? ' active' : '');
    btn.title = p.label;
    btn.innerHTML = `<svg class="icon"><use href="#${p.icon}"/></svg>`;
    btn.addEventListener('click', () => v25SetOrientation(memberType, p.id));
    row.appendChild(btn);
  }
  return row;
}

function v25SetOrientation(memberType, presetId) {
  const p = (V25_ORIENT[memberType] || []).find(x => x.id === presetId);
  if (!p) return;
  v25State.aspect = p.aspect;
  v25State.rot = p.rot || 0;
  if (p.openSide !== undefined) v25State.openSide = p.openSide;
  lastUsedOrientation[memberType] = presetId;
  if (typeof v25UpdateOptionsBar === 'function') v25UpdateOptionsBar();
  if (typeof requestRender === 'function') requestRender();
}
```

Styling for `.v25-orient-btn` lives in `dev/css/styles.css` and matches the existing options-bar chip aesthetic (1px border, 4px padding, hover lift). Active state uses the existing `--accent` token.

The `v25State.rot` field is read by the click-handler in `dev/js/69-v25-dispatch.js` (around line 464 where `props` is built for the placed entity) — it needs a small addition to copy `v25State.rot` into the new entity's `rot` field. Currently rot defaults to 0 from the entity factory.

## Integration into the options bar

In `dev/js/72-v25-options-bar.js` at the `tool === 'v25-mem'` branch starting at line 48, the existing `<select id="v25o-aspect">` (lines 73–78) and `<select id="v25o-openside">` (lines 83–91) are removed. After the Section/Pick row at line 72, append:

```js
html += '<div id="v25OrientSlot"></div>';
```

Then after `bar.innerHTML = html + ...` at line 133, replace the orient-slot placeholder with the live row:

```js
const slot = bar.querySelector('#v25OrientSlot');
if (slot) slot.replaceWith(v25BuildOrientationRow(mt));
```

This keeps the row injection localised to the function that already manages the bar's contents — no new mutation paths.

The `v25SetMember(type, section, aspect)` function in `dev/js/69-v25-dispatch.js` line 156 needs one small change: when called, look up `lastUsedOrientation[type]` and apply that preset if one exists. Otherwise fall back to today's behaviour (aspect = 'elev', rot = 0, openSide unset). This makes the tile-click flow re-apply the user's last orientation choice for that type.

## Files touched (in released app)

| File | What changes |
|---|---|
| `dev/index.html` | Add ~25 inline SVG icon symbols to the sprite block at the top of the file. Naming convention: `icon-orient-<type>-<id>` (e.g. `icon-orient-pfc-sec-up`). Visual weight matches existing `#icon-ub` / `#icon-pfc`. |
| `dev/js/60-tile-palette.js` | Declare `let lastUsedOrientation = {};` alongside `let lastUsedSection = {};` at line 25. |
| `dev/js/69-v25-dispatch.js` | In `v25SetMember` (line 156), apply `lastUsedOrientation[type]` if present. In the placement click-handler (around line 464), copy `v25State.rot` into the placed entity's `rot` field. |
| `dev/js/72-v25-options-bar.js` | Remove the Aspect dropdown (lines 73–78) and PFC Open-face dropdown (lines 83–91) from the `v25-mem` branch. Inject the orientation row in their place via `v25BuildOrientationRow(mt)`. |
| `dev/css/styles.css` | Add `.v25-orient-btn` rule set (size, padding, border, hover, active). |

New files:
- `dev/js/72b-orientation-presets.js` — orientation catalogue (`V25_ORIENT`), row component (`v25BuildOrientationRow`), setter (`v25SetOrientation`). Loaded after `72-v25-options-bar.js`, before `73-init.js`. Per `CLAUDE.md` "What goes in a new file" — this is self-contained and topically distinct, so a new file is justified.

## Non-changes worth noting

The renderer in `dev/js/68-v25-tools.js` is untouched. The mem2 entity schema is untouched (`aspect`, `rot`, `openSide` already exist as fields). The 3D-mode Model palette in `dev/js/60-tile-palette.js getPaletteDef()` is untouched — the orientation row is V25-2D-mode only.

Save / load is automatically compatible because the entity schema doesn't change — the same `{ aspect, rot, openSide }` triple is written. No `schemaVersion` bump needed for this feature on its own (the bump can ride on the next feature that actually changes schema).
