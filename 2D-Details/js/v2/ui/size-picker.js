/**
 * StructDraw v2 · UI · generic size picker
 * LAYER: ui — a family-agnostic <select>-based size picker. Reads the
 *        catalogue's `family.types` array; emits the chosen type id to a
 *        caller-supplied onChange. Plates use it to switch thickness; future
 *        families (members, bolts) use it for section / size.
 * READS:  v2.catalogues.lookupFamily; v2.appState.ui
 * WRITES: v2.ui.sizePicker
 *
 * Classic <script>, no build step (CLAUDE.md rules 3 & 8). Loading this file
 * only defines the namespace; the render functions are called by the caller
 * (the v2 inspector panel, the future v2 BB-rail's plate-tile size dropdown,
 * tests). Phase 1 ships the picker as a stand-alone widget; Phase 11+ wires
 * it into the v2 BB-rail tile flow.
 *
 * --- Public API -----------------------------------------------------------
 *   v2.ui.sizePicker.optionsFor(familyId) -> [{id, label}]
 *   v2.ui.sizePicker.renderInto(host, familyId, current, onChange) -> element
 *   v2.ui.sizePicker.choose(familyId, typeId)          -> stores on appState.ui
 * --------------------------------------------------------------------------
 * See PlannedBuilds/architecture-v2/08-pilot-feature.md §4.6 (UI additions).
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.ui = v2.ui || {};

  /** Read the type list from the catalogue. Returns [] when unavailable. */
  function optionsFor(familyId) {
    if (!familyId || !v2.catalogues || typeof v2.catalogues.lookupFamily !== 'function') return [];
    const fam = v2.catalogues.lookupFamily(familyId);
    if (!fam || !Array.isArray(fam.types)) return [];
    return fam.types.map(function (t) {
      const label = typeof t.label === 'string'
        ? t.label
        : (typeof t.thickness === 'number' ? (t.id + ' (' + t.thickness + ' mm)') : t.id);
      return { id: t.id, label: label, type: t };
    });
  }

  /** Persist the user's choice for a family on the UI state slot. */
  function choose(familyId, typeId) {
    if (!v2.appState) return;
    if (!v2.appState.ui) v2.appState.ui = {};
    // Keep family-specific keys so plate vs member don't collide.
    if (familyId === 'plate-flat') {
      v2.appState.ui.activePlateFamily = familyId;
      v2.appState.ui.activePlateType = typeId;
    }
    v2.appState.ui.activeFamily = familyId;
    v2.appState.ui.activeType   = typeId;
  }

  /**
   * Render a <select> into the host element. Returns the created element.
   * The caller owns the host (we do not append the host to document).
   * @param {?HTMLElement} host
   * @param {string} familyId
   * @param {?string} current
   * @param {?Function} onChange
   * @returns {?HTMLElement}
   */
  function renderInto(host, familyId, current, onChange) {
    if (!host || typeof document === 'undefined') return null;
    const opts = optionsFor(familyId);
    const sel = document.createElement('select');
    sel.className = 'v2-size-picker';
    sel.setAttribute('data-v2-family', familyId);
    for (let i = 0; i < opts.length; i++) {
      const o = document.createElement('option');
      o.value = opts[i].id;
      o.textContent = opts[i].label;
      if (opts[i].id === current) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener('change', function () {
      choose(familyId, sel.value);
      if (typeof onChange === 'function') onChange(sel.value);
    });
    host.appendChild(sel);
    return sel;
  }

  v2.ui.sizePicker = {
    optionsFor: optionsFor,
    renderInto: renderInto,
    choose: choose,
  };
})();
