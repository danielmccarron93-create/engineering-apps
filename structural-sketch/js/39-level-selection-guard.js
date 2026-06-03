// ══════════════════════════════════════════════════════════
// LEVEL-AWARE SELECTION GUARD  (Issue 1)
// ──────────────────────────────────────────────────────────
// PROBLEM
//   Rendering already filters by floor — project.getVisibleElements()
//   (10-levels.js) returns only the active level, and the floor below is
//   drawn as a faded, non-interactive "ghost" (drawGhostUnderlay).
//   BUT selection does not. hitTestElement (06-drawing-tools.js) and its
//   ~10 monkey-patched extensions (08-shapes, 14-tools-extended, 16-founding,
//   18-details-system, 28-floor-designer, 34/37-joist*) all scan the FULL
//   project.elements array and skip an element only when its LAYER is hidden
//   — el.level is never consulted. So on Level 1 you can still click/drag/edit
//   members on any floor (e.g. the Ground-Floor slab).
//
// FIX
//   One decorator — loaded LAST, after every hitTestElement patch — that
//   rejects hits which are not "selectable on the active level":
//     • elements on the active level, OR
//     • a column that physically continues into this level (reusing the same
//       `extends` model that already powers getInheritedColumns), OR
//     • the floor directly below, ONLY when the opt-in "Edit floor below"
//       toggle is on (default OFF), OR
//     • elements with no level at all (safety — never hide un-leveled
//       annotations; getVisibleElements would already hide them from view).
//
// REVERSIBILITY
//   Delete the <script> tag for this file in index.html to fully restore the
//   previous cross-floor behaviour. Nothing else is modified. The toggle can
//   also be flipped at runtime via levelSystem.editFloorBelow.
// ══════════════════════════════════════════════════════════

// Opt-in flag: allow editing the ghosted floor directly below. Default OFF.
if (typeof levelSystem !== 'undefined' && levelSystem.editFloorBelow === undefined) {
    levelSystem.editFloorBelow = false;
}

// ── Predicate ─────────────────────────────────────────────
function isSelectableOnActiveLevel(el) {
    if (!el) return false;
    if (typeof levelSystem === 'undefined') return true; // levels not loaded — no filtering
    if (!el.level) return true;                          // un-leveled (annotations etc.) stay selectable

    const levels = levelSystem.levels;
    const activeIdx = levelSystem.activeLevelIndex;
    const activeId = levels[activeIdx] && levels[activeIdx].id;

    if (el.level === activeId) return true;              // on this floor

    const elIdx = levels.findIndex(l => l.id === el.level);

    // Columns that continue into the active floor stay editable here, so an
    // engineer can move the column + the beams framing into it together.
    // GF columns are created with extends:'above' (06-drawing-tools.js:877),
    // so a GF column remains editable on Level 1 — exactly the desired default.
    if (el.type === 'column') {
        const ext = el.extends || 'below';
        if (elIdx === activeIdx - 1 && (ext === 'above' || ext === 'both')) return true; // from below, extends up
        if (elIdx === activeIdx + 1 && (ext === 'below' || ext === 'both')) return true; // from above, extends down
    }

    // Opt-in: edit the floor directly below (the "Edit floor below" toggle).
    if (levelSystem.editFloorBelow && elIdx === activeIdx - 1) return true;

    return false;
}

// ── Decorate the fully-composed hitTestElement ────────────
// This file loads after every other hitTestElement patch, so we wrap the
// final composed function. Reassigning the global is the same mechanism every
// other patch in this codebase uses (e.g. 08-shapes.js, 16-founding.js).
if (typeof hitTestElement === 'function') {
    const _hitBeforeLevelGuard = hitTestElement;
    hitTestElement = function (sheetPos, tolerance) {
        const hit = _hitBeforeLevelGuard(sheetPos, tolerance);
        if (!hit || isSelectableOnActiveLevel(hit)) return hit;

        // The topmost hit is on another floor. It may be masking a selectable
        // element directly beneath it (e.g. a beam under a slab that was drawn
        // afterwards). Retry against only the selectable elements so z-order
        // overlap still resolves correctly. The swap is synchronous and
        // restored in finally; all hitTest patches read project.elements live
        // and have no side effects, so this is safe.
        const all = project.elements;
        try {
            project.elements = all.filter(isSelectableOnActiveLevel);
            const retry = _hitBeforeLevelGuard(sheetPos, tolerance);
            return (retry && isSelectableOnActiveLevel(retry)) ? retry : null;
        } finally {
            project.elements = all;
        }
    };
}

// ── "Edit floor below" toggle (level bar) ─────────────────
function injectEditBelowToggle() {
    const bar = document.getElementById('level-bar');
    if (!bar || document.getElementById('edit-below-toggle')) return;

    const wrap = document.createElement('label');
    wrap.id = 'edit-below-wrap';
    wrap.title = 'Allow selecting / editing members on the floor directly below (off by default)';
    wrap.style.cssText =
        'display:flex;align-items:center;gap:5px;font-size:11px;font-weight:600;' +
        'font-family:var(--font-ui);color:var(--text-secondary);cursor:pointer;' +
        'margin-right:10px;white-space:nowrap;user-select:none;';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = 'edit-below-toggle';
    cb.checked = !!(typeof levelSystem !== 'undefined' && levelSystem.editFloorBelow);
    cb.style.cssText = 'cursor:pointer;margin:0;';
    cb.addEventListener('change', () => {
        if (typeof levelSystem !== 'undefined') levelSystem.editFloorBelow = cb.checked;
        if (typeof engine !== 'undefined' && engine.requestRender) engine.requestRender();
    });

    const txt = document.createElement('span');
    txt.textContent = 'Edit floor below';

    wrap.appendChild(cb);
    wrap.appendChild(txt);

    const manageBtn = document.getElementById('level-manage-btn');
    if (manageBtn) bar.insertBefore(wrap, manageBtn);
    else bar.appendChild(wrap);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectEditBelowToggle);
} else {
    injectEditBelowToggle();
}
