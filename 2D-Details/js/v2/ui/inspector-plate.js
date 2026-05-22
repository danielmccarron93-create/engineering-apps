/**
 * StructDraw v2 · UI · plate inspector panel
 * LAYER: ui — reads a selected v2 plate Element from the model and renders a
 *        property panel; edits dispatch `editElement` transactions through
 *        the undo stack so they participate in undo/autosave.
 * READS:  v2.appState.model; v2.catalogues.lookupFamily / lookupType;
 *           v2.transactions.editElement; v2.engine.undoStack; v2.ui.sizePicker
 * WRITES: v2.ui.inspectorPlate
 *
 * Classic <script>, no build step (CLAUDE.md rules 3 & 8). The panel renders
 * into a caller-supplied host element — Phase 1 does NOT wire it into v1's
 * `#inspectorRoot` automatically because the v2 selection layer is Phase 10.
 * For the soak Dan can invoke it from DevTools:
 *
 *     const id = [...v2.appState.model.elements.values()]
 *       .find(e => e.category === 'plate').id;
 *     v2.ui.inspectorPlate.show(id, document.getElementById('inspectorRoot'));
 *
 * Or call `renderForElement(id, host)` to (re-)render the panel.
 * See PlannedBuilds/architecture-v2/08-pilot-feature.md §4.6 and
 *     PlannedBuilds/architecture-v2/06-tools-and-transactions.md §10.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.ui = v2.ui || {};

  function num(n, dflt) { return (typeof n === 'number' && isFinite(n)) ? n : (dflt === undefined ? 0 : dflt); }

  function plateOf(elementId) {
    if (!v2.appState || !v2.appState.model || !(v2.appState.model.elements instanceof Map)) return null;
    const el = v2.appState.model.elements.get(elementId);
    if (!el || el.category !== 'plate') return null;
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
   * Apply an editElement transaction with `changes` for the given plate.
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

  /**
   * Render the inspector panel into a host element. Returns the panel
   * element (or null when the host is missing or no plate is selected).
   * @param {string} elementId
   * @param {?HTMLElement} host
   * @returns {?HTMLElement}
   */
  function renderForElement(elementId, host) {
    if (typeof document === 'undefined') return null;
    if (!host) return null;
    const el = plateOf(elementId);
    if (!el) {
      host.innerHTML = '<div class="v2-inspector empty">No v2 plate selected.</div>';
      return null;
    }
    const fam = familyOf(el);
    const typ = typeOf(el);
    const mat = materialOf(el);
    const thk = num(el.params && el.params.thickness, typ && typ.thickness, 10);

    host.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'v2-inspector plate-panel';
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

    // Header
    const header = section('Plate (v2)');
    header.appendChild(row('Element id', staticValue(el.id)));
    header.appendChild(row('Family',     staticValue(fam ? (fam.label || fam.id) : (el.family || '-'))));
    panel.appendChild(header);

    // Thickness — size picker drives `editElement({type, params:{thickness}})`
    const thicknessSection = section('Thickness');
    const thkHost = document.createElement('div');
    thicknessSection.appendChild(thkHost);
    if (v2.ui.sizePicker && typeof v2.ui.sizePicker.renderInto === 'function') {
      v2.ui.sizePicker.renderInto(thkHost, el.family || 'plate-flat', el.type || null, function (typeId) {
        const newType = v2.catalogues && typeof v2.catalogues.lookupType === 'function'
          ? v2.catalogues.lookupType(el.family || 'plate-flat', typeId) : null;
        const newThk = (newType && typeof newType.thickness === 'number') ? newType.thickness : thk;
        const nextParams = Object.assign({}, el.params || {}, { thickness: newThk });
        applyEdit(el.id, { type: typeId, params: nextParams });
        renderForElement(el.id, host);
      });
    }
    thicknessSection.appendChild(row('Current', staticValue(thk + ' mm')));
    panel.appendChild(thicknessSection);

    // Material — read-only display + a future-friendly hook the next phase wires up.
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
    geomSection.appendChild(row('Kind',    staticValue(geom.kind || '-')));
    geomSection.appendChild(row('Vertices',
      staticValue(String((geom.polygon && geom.polygon.length) || (geom.points && geom.points.length) || 0))));
    if (geom.viewId) geomSection.appendChild(row('View', staticValue(geom.viewId)));
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

  v2.ui.inspectorPlate = {
    show: show,
    renderForElement: renderForElement,
    applyEdit: applyEdit,
  };
})();
