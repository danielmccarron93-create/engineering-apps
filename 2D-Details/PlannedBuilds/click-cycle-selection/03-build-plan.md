# 03 — Build plan (COMPLETE — this is the executed record + re-apply guide)

> **This build is done.** All five files below were edited in worktree
> `claude/stupefied-kowalevski-2b02d9` (uncommitted) and verified — see
> `05-verification.md`. This document is (a) the record of exactly what was
> done and (b) a precise re-apply guide if the worktree is ever lost. The
> canonical source is the worktree diff (`git diff` on that branch); the code
> below is reproduced for re-apply.

The change is ~123 insertions / 20 deletions across 5 files. No new files.

---

## Step 1 — `dev/js/07-globals.js` ✅

Immediately after the `TAB-TO-CYCLE SELECTION STATE` block (the `cycleHits` /
`cycleIndex` / `cycleLastPx` declarations), before `// ---- BOLT GROUP STATE ----`, add:

```js
// ---- V25 2D CLICK-CYCLING SELECTION STATE ----
// Bluebeam-style: clicking the same screen point repeatedly steps down the
// z-stack of overlapping V25 entities. null when no cycle is armed.
let v25ClickCycle = null;  // { clientX, clientY, viewKey, ids:[...], index }
const V25_CYCLE_PX = 4;    // px tolerance for "same spot" + clean-click test
```

## Step 2 — `dev/js/71-v25-selection.js` ✅

Replace the `v25HitTest` function (~line 135) with three functions:

**(a) `v25HitTestAll`** — a mechanical copy of the *old* `v25HitTest` body:
keep the identical tolerance setup (`cap`, `TOL_PX`, `LINE_TOL_PX`, `TXT_TOL_PX_X/Y`)
and the identical reverse `for` loop; declare `const hits = []` before the loop;
change every `return ent;` to `hits.push(ent); continue;` (3 sites — 2 in the
`leader2` block, 1 generic); keep the `frame` interior `continue` as-is;
`return hits;` at the end. Result is ordered top-most → bottom-most.

**(b) `v25HitTest`** — now a thin wrapper (keeps all other callers identical):

```js
function v25HitTest(blk, u, v) {
  const all = v25HitTestAll(blk, u, v);
  return all.length ? all[0] : null;
}
```

**(c) `v25ClickCycleCurrentEnt`** — new helper:

```js
function v25ClickCycleCurrentEnt(blk, e) {
  if (!v25ClickCycle || !blk || !e) return null;
  if (v25ClickCycle.viewKey !== blk.viewKey) return null;
  if (Math.hypot(e.clientX - v25ClickCycle.clientX,
                  e.clientY - v25ClickCycle.clientY) > V25_CYCLE_PX) return null;
  const id = v25ClickCycle.ids[v25ClickCycle.index];
  const arr = entities2D[blk.viewKey] || [];
  return arr.find(en => en.id === id) || null;
}
```

## Step 3 — `dev/js/39-events.js` ✅ (five branches)

**3a — mousedown grip branch (~line 183).** Wrap the existing grip-grab body in
a re-click guard so a cycle re-click falls through to the select branch:

```js
      if (nearestSel) {
        // Don't let a grip grab swallow a click-cycle re-click: when this
        // click continues an active cycle on the selected entity, fall
        // through to the cycle logic below instead of starting a grip drag.
        const cycEnt = (typeof v25ClickCycleCurrentEnt === 'function')
          ? v25ClickCycleCurrentEnt(activeBlock, e) : null;
        const cycleReclick = cycEnt && v25Selected.length === 1 && v25Selected[0] === cycEnt.id;
        if (!cycleReclick) {
          if (!v25Selected.includes(nearestSel.ent.id)) v25Selected = [nearestSel.ent.id];
          v25Drag = { ent: nearestSel.ent, handle: nearestSel.handle, lastU: cu, lastV: cv };
          if (typeof v25UpdateInspector === 'function') v25UpdateInspector();
          requestRender();
          return;
        }
      }
```

**3b — mousedown select branch (~line 198).** Replace `const hit = v25HitTest(...)`
and its `if (hit) { ... }` block with (the trailing `else if (!e.shiftKey) {`
keeps the existing near-miss / marquee chain attached):

```js
      const stack = (typeof v25HitTestAll === 'function') ? v25HitTestAll(activeBlock, cu, cv) : [];
      if (stack.length) {
        if (e.shiftKey) {
          // Additive select — never cycles; ends any active cycle.
          v25Selected = Array.from(new Set([...(v25Selected || []), stack[0].id]));
          v25ClickCycle = null;
          const handle = (typeof v25HitHandle === 'function') ? v25HitHandle(activeBlock, stack[0], cu, cv) : 'body';
          v25Drag = { ent: stack[0], handle, lastU: cu, lastV: cv,
                      cyclePending: false, downClientX: e.clientX, downClientY: e.clientY };
          if (typeof v25UpdateInspector === 'function') v25UpdateInspector();
          requestRender();
          return;
        }
        const stackIds = stack.map(en => en.id);
        const cycEnt = (typeof v25ClickCycleCurrentEnt === 'function')
          ? v25ClickCycleCurrentEnt(activeBlock, e) : null;
        const reclick = cycEnt && v25ClickCycle
          && v25ClickCycle.ids.length === stackIds.length
          && v25ClickCycle.ids.every((id, i) => id === stackIds[i])
          && v25Selected.length === 1 && v25Selected[0] === cycEnt.id;
        if (reclick) {
          // Keep the selection; arm a BODY drag for the cycled entity.
          // Mouse-up decides: clean click advances the cycle, drag moves it.
          v25Drag = { ent: cycEnt, handle: 'body', lastU: cu, lastV: cv,
                      cyclePending: true, downClientX: e.clientX, downClientY: e.clientY };
          requestRender();
          return;
        }
        // Fresh click — select the top-most entity, arm a new cycle.
        const top = stack[0];
        v25Selected = [top.id];
        v25ClickCycle = { clientX: e.clientX, clientY: e.clientY,
                          viewKey: activeBlock.viewKey, ids: stackIds, index: 0 };
        const handle = (typeof v25HitHandle === 'function') ? v25HitHandle(activeBlock, top, cu, cv) : 'body';
        v25Drag = { ent: top, handle, lastU: cu, lastV: cv,
                    cyclePending: false, downClientX: e.clientX, downClientY: e.clientY };
        if (typeof v25UpdateInspector === 'function') v25UpdateInspector();
        requestRender();
        return;
      } else if (!e.shiftKey) {
```

**3c — mouseup `v25Drag` release branch (~line 1369).** Just before `v25Drag = null;`:

```js
      const wasCleanClick = v25Drag.downClientX != null &&
        Math.hypot(e.clientX - v25Drag.downClientX, e.clientY - v25Drag.downClientY) <= V25_CYCLE_PX;
      if (v25Drag.cyclePending && wasCleanClick && v25ClickCycle && v25ClickCycle.ids.length) {
        v25ClickCycle.index = (v25ClickCycle.index + 1) % v25ClickCycle.ids.length;
        v25Selected = [v25ClickCycle.ids[v25ClickCycle.index]];
        if (typeof v25UpdateInspector === 'function') v25UpdateInspector();
      } else if (v25Drag.cyclePending && !wasCleanClick) {
        v25ClickCycle = null; // a real drag of the cycled entity ends the cycle
      }
```

**3d — dblclick select branch (~line 1188).** Change the hit source from
top-most-only to cycle-aware:

```js
      const cycEnt = (typeof v25ClickCycleCurrentEnt === 'function')
        ? v25ClickCycleCurrentEnt(activeBlock, e) : null;
      const hit = cycEnt || ((typeof v25HitTest === 'function') ? v25HitTest(activeBlock, real.u, real.v) : null);
```

**3e — marquee mouseup (~line 1484).** Just before `selBoxStart = null;`:

```js
      if (selBoxMode === '2d') v25ClickCycle = null; // a marquee ends any click-cycle
```

## Step 4 — `dev/js/47-status-bar.js` ✅

In `updateStatus()`, after the `tool === 'draw-centreline'` label line and before
`document.getElementById('statusTool').textContent = toolLabel;`:

```js
  // V26 — when a click-cycle is live over a stack of overlapping V25
  // entities, show how deep the current pick is.
  if (sheetMode === '2d' && v25ClickCycle
      && Array.isArray(v25ClickCycle.ids) && v25ClickCycle.ids.length > 1
      && Array.isArray(v25Selected) && v25Selected.length === 1
      && v25Selected[0] === v25ClickCycle.ids[v25ClickCycle.index]) {
    toolLabel = `Select — ${v25ClickCycle.index + 1} of ${v25ClickCycle.ids.length} under cursor (click to cycle)`;
  }
```

## Step 5 — `2D-Details/CHANGELOG.md` ✅

One line at the top of the `### Added` list in the `[Unreleased]` section,
describing the click-cycling feature.

---

## Progress tracker

- [x] Step 1 — `07-globals.js`: `v25ClickCycle` + `V25_CYCLE_PX`
- [x] Step 2 — `71-v25-selection.js`: `v25HitTestAll` + wrapper + `v25ClickCycleCurrentEnt`
- [x] Step 3 — `39-events.js`: 5 cycle-aware branches
- [x] Step 4 — `47-status-bar.js`: cycle depth hint
- [x] Step 5 — `CHANGELOG.md`: entry added
- [x] `node --check` clean on all 4 edited JS files
- [x] Functional verification via synthetic events (see `05-verification.md`)
- [ ] **Dan: visual click-test in a real browser** (see `05-verification.md`)
- [ ] **Dan: integrate worktree branch → `main`, mirror `dev/` → root, commit**

## Verification

Layer 1 (static) and Layer 2 (functional, synthetic events) are complete and
passed — full results in `05-verification.md`. Layer 3 (the hands-on visual
click-test) is left for Dan because the preview environment renders the canvas
at 0×0; the step-by-step browser test is in `05-verification.md`.
