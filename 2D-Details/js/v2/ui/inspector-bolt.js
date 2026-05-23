/**
 * StructDraw v2 · UI · bolt inspector panel
 * LAYER: ui — reads a selected v2 bolt Element from the model and renders a
 *        property panel; edits dispatch `editElement` transactions through
 *        the undo stack so they participate in undo/autosave.
 * READS:  v2.appState.model; v2.catalogues.lookupFamily / lookupType /
 *           lookupMaterial; v2.transactions.editElement; v2.engine.undoStack
 * WRITES: v2.ui.inspectorBolt
 *
 * Classic <script>, no build step (CLAUDE.md rules 3 & 8). The panel renders
 * into a caller-supplied host element — Phase 3 does NOT wire it into v1's
 * `#inspectorRoot` automatically because the v2 selection layer is Phase 10.
 * For the soak Dan can invoke it from DevTools:
 *
 *     const id = [...v2.appState.model.elements.values()]
 *       .find(e => e.category === 'fastener').id;
 *     v2.ui.inspectorBolt.show(id, document.getElementById('inspectorRoot'));
 *
 * Or call `renderForElement(id, host)` to (re-)render the panel.
 *
 * Fields editable in Phase 3:
 *   - Size (Type id) — sliderable via size picker when present, falls back to
 *     a plain <select> of the family's `types`.
 *   - Grade — `4.6 | 8.8 | 10.9` (picks the matching material id).
 *   - Aspect — `'sec'` (side profile) | `'elev'` (head-on circle).
 *   - Rotation (degrees) — 0..359, integer step.
 *   - Grip override — number; null = auto (Phase 3 stubs auto to 12 mm).
 *     v25-2d-bolts/05-auto-grip-algorithm.md is the real auto-grip; until
 *     Phase 10 (selection + grip handles), the user dials grip here.
 *   - Washers — `'both' | 'head-only' | 'nut-only' | 'none'`.
 *   - Nut style — `'hex'` (v1 only — half / dome reserved for Phase 11).
 *
 * See PlannedBuilds/architecture-v2/08-pilot-feature.md §4.6,
 *     PlannedBuilds/v25-2d-bolts/02-design.md ("Inspector exposes …").
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.ui = v2.ui || {};

  function num(n, dflt) { return (typeof n === 'number' && isFinite(n)) ? n : (dflt === undefined ? 0 : dflt); }

  function boltOf(elementId) {
    if (!v2.appState || !v2.appState.model || !(v2.appState.model.elements instanceof Map)) return null;
    const el = v2.appState.model.elements.get(elementId);
    if (!el || el.category !== 'fastener') return null;
    return el;
  }

  function familyOf(el) {
    if (!el || !el.family || !v2.catalogues || typeof v2.catalogues.lookupFamily !== 'function') return null;
    return v2.catalogues.lookupFamily(el.family);
  }

  function typeOf(el) {
    if (!el || !el.family || !el.type || !v2.catalogues || typeof v2.catalogues.lookupType !== 'function') return null;
    return v2.catalogues.lookupType(el.family, el.type);
  }

  function materialOf(el) {
    if (!el || !el.materialId) return null;
    const model = v2.appState && v2.appState.model;
    if (model && model.materials && model.materials.has(el.materialId)) {
      return model.materials.get(el.materialId);
    }
    if (v2.catalogues && typeof v2.catalogues.lookupMaterial === 'function') {
      return v2.catalogues.lookupMaterial(el.materialId);
    }
    return null;
  }

  /**
   * Apply an editElement transaction with `changes` for the given bolt.
   * @param {string} elementId
   * @param {Object} changes
   * @returns {?{newModel:StructuralModel, dirty:DirtySet}}
   */
  function applyEdit(elementId, changes) {
    if (!v2.transactions || typeof v2.transactions.editElement !== 'function') return null;
    if (!v2.engine || !v2.engine.undoStack) return null;
    const tx = v2.transactions.editElement(elementId, changes);
    return v2.engine.undoStack.applyTransaction(tx);
  }

  /** Edit a single `params.*` field, preserving the rest. */
  function editParam(el, key, value) {
    const next = Object.assign({}, el.params || {});
    if (value === null || value === undefined) {
      delete next[key];
    } else {
      next[key] = value;
    }
    return applyEdit(el.id, { params: next });
  }

  /**
   * Render the inspector panel into a host element. Returns the panel
   * element (or null when the host is missing or no bolt is selected).
   * @param {string} elementId
   * @param {?HTMLElement} host
   * @returns {?HTMLElement}
   */
  function renderForElement(elementId, host) {
    if (typeof document === 'undefined') return null;
    if (!host) return null;
    const el = boltOf(elementId);
    if (!el) {
      host.innerHTML = '<div class="v2-inspector empty">No v2 bolt selected.</div>';
      return null;
    }
    const fam = familyOf(el);
    const typ = typeOf(el);
    const mat = materialOf(el);
    const params = el.params || {};

    host.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'v2-inspector bolt-panel';
    panel.setAttribute('data-v2-element-id', el.id);

    function section(title) {
      const s = document.createElement('div');
      s.className = 'v2-inspector-section';
      const h = document.createElement('div');
      h.className = 'v2-inspector-title';
      h.textContent = title;
      s.appendChild(h);
      return s;
    }
    function row(label, valueNode) {
      const r = document.createElement('div');
      r.className = 'v2-inspector-row';
      const l = document.createElement('label');
      l.textContent = label;
      r.appendChild(l);
      r.appendChild(valueNode);
      return r;
    }
    function staticValue(text) {
      const s = document.createElement('span');
      s.className = 'v2-inspector-value';
      s.textContent = text;
      return s;
    }
    function selectOf(options, current, onPick) {
      const sel = document.createElement('select');
      for (let i = 0; i < options.length; i++) {
        const o = document.createElement('option');
        o.value = options[i].value;
        o.textContent = options[i].label;
        if (options[i].value === current) o.selected = true;
        sel.appendChild(o);
      }
      sel.addEventListener('change', function () { onPick(sel.value); });
      return sel;
    }
    function numberInput(value, onChange) {
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.step = 'any';
      if (value !== null && value !== undefined && isFinite(value)) inp.value = String(value);
      inp.addEventListener('change', function () {
        const v = inp.value === '' ? null : parseFloat(inp.value);
        onChange(v == null || isNaN(v) ? null : v);
      });
      return inp;
    }

    // Header
    const header = section('Bolt (v2)');
    header.appendChild(row('Element id', staticValue(el.id)));
    header.appendChild(row('Family',     staticValue(fam ? (fam.label || fam.id) : (el.family || '-'))));
    panel.appendChild(header);

    // Size — pick from the family's types[].
    const sizeSection = section('Size');
    if (fam && Array.isArray(fam.types) && fam.types.length) {
      const opts = fam.types.map(function (t) { return { value: t.id, label: t.id }; });
      sizeSection.appendChild(row('Type', selectOf(opts, el.type || 'M20', function (nextType) {
        applyEdit(el.id, { type: nextType });
        renderForElement(el.id, host);
      })));
    }
    if (typ && typeof typ.d === 'number') {
      sizeSection.appendChild(row('Shank d', staticValue(typ.d + ' mm')));
    }
    panel.appendChild(sizeSection);

    // Grade — picks the matching material id.
    const gradeSection = section('Grade');
    const gradeOpts = (fam && Array.isArray(fam.grades) ? fam.grades : ['4.6', '8.8', '10.9'])
      .map(function (g) { return { value: g, label: g }; });
    gradeSection.appendChild(row('Grade', selectOf(gradeOpts, params.grade || '8.8', function (g) {
      const nextMaterial = 'bolt-as1252-grade-' + g;
      const nextParams = Object.assign({}, el.params || {}, { grade: g });
      applyEdit(el.id, { materialId: nextMaterial, params: nextParams });
      renderForElement(el.id, host);
    })));
    panel.appendChild(gradeSection);

    // Aspect — sec / elev (matches v25-2d-bolts/02-design.md).
    const aspectSection = section('Aspect');
    aspectSection.appendChild(row('Aspect', selectOf(
      [{ value: 'sec', label: 'Section (side profile)' },
       { value: 'elev', label: 'Elevation (head-on circle)' }],
      params.aspect || 'sec',
      function (a) { editParam(el, 'aspect', a); renderForElement(el.id, host); }
    )));
    panel.appendChild(aspectSection);

    // Rotation — degrees, integer-ish.
    const rotSection = section('Rotation');
    rotSection.appendChild(row('Degrees', numberInput(num(params.rot, 0), function (v) {
      editParam(el, 'rot', v == null ? 0 : v);
      renderForElement(el.id, host);
    })));
    panel.appendChild(rotSection);

    // Grip — auto vs override.
    const gripSection = section('Grip');
    const auto = (params.gripOverride === null || params.gripOverride === undefined);
    const autoBtn = document.createElement('button');
    autoBtn.type = 'button';
    autoBtn.textContent = auto ? 'Auto (12 mm stub)' : 'Override';
    autoBtn.addEventListener('click', function () {
      if (auto) {
        editParam(el, 'gripOverride', num(params.grip, 12));
      } else {
        editParam(el, 'gripOverride', null);
      }
      renderForElement(el.id, host);
    });
    gripSection.appendChild(row('Mode', autoBtn));
    gripSection.appendChild(row('Current',
      staticValue(num(params.gripOverride, num(params.grip, 12)) + ' mm')));
    if (!auto) {
      gripSection.appendChild(row('Override', numberInput(num(params.gripOverride, 12), function (v) {
        editParam(el, 'gripOverride', v == null ? null : v);
        renderForElement(el.id, host);
      })));
    }
    panel.appendChild(gripSection);

    // Washers + nut style.
    const fastenerSection = section('Fastener parts');
    fastenerSection.appendChild(row('Washers', selectOf(
      [{ value: 'both', label: 'Both' },
       { value: 'head-only', label: 'Head only' },
       { value: 'nut-only', label: 'Nut only' },
       { value: 'none', label: 'None' }],
      params.washers || 'both',
      function (w) { editParam(el, 'washers', w); renderForElement(el.id, host); }
    )));
    fastenerSection.appendChild(row('Nut style', selectOf(
      [{ value: 'hex', label: 'Hex (AS 1252)' }],
      params.nutStyle || 'hex',
      function (n) { editParam(el, 'nutStyle', n); renderForElement(el.id, host); }
    )));
    panel.appendChild(fastenerSection);

    // Material — read-only display.
    const materialSection = section('Material');
    materialSection.appendChild(row('Id',    staticValue(el.materialId || '-')));
    if (mat) {
      materialSection.appendChild(row('Grade', staticValue(mat.grade || mat.name || mat.id)));
      materialSection.appendChild(row('Class', staticValue(mat.class || '-')));
    }
    panel.appendChild(materialSection);

    // Geometry summary
    const geomSection = section('Geometry');
    const geom = el.geometry || {};
    geomSection.appendChild(row('Kind', staticValue(geom.kind || '-')));
    if (geom.kind === 'point' && geom.location) {
      geomSection.appendChild(row('Location',
        staticValue('(' + num(geom.location.x).toFixed(1) + ', ' +
                          num(geom.location.y).toFixed(1) + ')')));
    }
    panel.appendChild(geomSection);

    host.appendChild(panel);
    return panel;
  }

  /** Console convenience — locate the inspector host and render. */
  function show(elementId, host) {
    if (!host && typeof document !== 'undefined') {
      host = document.getElementById('inspectorRoot');
    }
    return renderForElement(elementId, host);
  }

  v2.ui.inspectorBolt = {
    show: show,
    renderForElement: renderForElement,
    applyEdit: applyEdit,
  };
})();
