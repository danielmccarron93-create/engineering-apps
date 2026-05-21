/**
 * StructDraw v2 · I/O Layer · serialise (model -> JSON)
 * LAYER: io — turns a v2 StructuralModel into a JSON-friendly plain object.
 *        The transactional inverse is `deserialise.js`.
 * READS:  window.v2.model.SCHEMA_VERSION
 * WRITES: window.v2.io.{serialise, modelToJSON, modelToString}
 *
 * Classic <script>, no build step (CLAUDE.md rules 3 & 8). Pure — no DOM, no
 * canvas, no window mutation beyond the namespace publishing. The function is
 * total: it never throws, and a partial / malformed model degrades gracefully
 * (missing maps default to empty maps).
 *
 * SHAPE — what gets emitted on disk:
 *   {
 *     schemaVersion: 2,
 *     version: <number>,
 *     project:   <ProjectMetadata>,
 *     elements:  [Element, …],          // Map values, insertion order preserved
 *     materials: [Material, …],
 *     views:     [View, …],
 *     sheets:    [Sheet, …]
 *   }
 *
 * Why arrays-of-values instead of arrays-of-pairs: every shape in v2 already
 * carries its id as a field (Element.id, View.id, …). Serialising as a flat
 * array keeps the disk shape readable in a `.sd2.json`. Deserialise.js rebuilds
 * the Maps by re-indexing each entry on its .id field.
 *
 * Maps with non-id keys (none today, but a defensive hook for future shapes
 * like Element.viewOverrides) are emitted as array-of-pairs; deserialise.js
 * round-trips them as `Map`s.
 *
 * Element / View / Sheet sub-shapes are emitted as-is — the catalogue layer
 * guarantees every model field is JSON-friendly already (numbers, strings,
 * plain objects, arrays). Sets / Maps inside a single element are flattened.
 * See 07-migration-strategy.md §4 and 03-model-layer.md §11.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.io = v2.io || {};

  const SCHEMA_VERSION = (v2.model && v2.model.SCHEMA_VERSION) || 2;

  /** Map<K,V> -> array of values (when V already carries an .id field). */
  function mapValuesArray(m) {
    if (!(m instanceof Map)) return Array.isArray(m) ? m.slice() : [];
    return Array.from(m.values());
  }

  /**
   * Element-level cleanup: Sets and Maps inside an element are flattened so
   * JSON.stringify won't drop them silently. Today only viewOverrides (a Map)
   * is in scope; the function is shape-agnostic for future-proofing.
   */
  function flattenElement(el) {
    if (!el) return el;
    let needsCopy = false;
    if (el.viewOverrides instanceof Map) needsCopy = true;
    if (!needsCopy) return el;
    const out = Object.assign({}, el);
    if (el.viewOverrides instanceof Map) {
      out.viewOverrides = Array.from(el.viewOverrides.entries());
    }
    return out;
  }

  function flattenView(vw) {
    if (!vw) return vw;
    let needsCopy = false;
    if (vw.categoryVisibility instanceof Map) needsCopy = true;
    if (vw.hideOverrides instanceof Set) needsCopy = true;
    if (vw.showOverrides instanceof Set) needsCopy = true;
    if (!needsCopy) return vw;
    const out = Object.assign({}, vw);
    if (vw.categoryVisibility instanceof Map) {
      out.categoryVisibility = Array.from(vw.categoryVisibility.entries());
    }
    if (vw.hideOverrides instanceof Set) {
      out.hideOverrides = Array.from(vw.hideOverrides);
    }
    if (vw.showOverrides instanceof Set) {
      out.showOverrides = Array.from(vw.showOverrides);
    }
    return out;
  }

  /**
   * Serialise a v2 StructuralModel into a JSON-friendly plain object. Pure —
   * the input model is not mutated. The output passes through JSON.stringify /
   * JSON.parse unchanged (apart from the Map/Set flattening done above).
   * @param {StructuralModel} model
   * @returns {object}
   */
  function modelToJSON(model) {
    model = model || {};
    return {
      schemaVersion: typeof model.schemaVersion === 'number'
        ? model.schemaVersion
        : SCHEMA_VERSION,
      version: typeof model.version === 'number' ? model.version : 0,
      project: model.project || null,
      elements:  mapValuesArray(model.elements).map(flattenElement),
      materials: mapValuesArray(model.materials),
      views:     mapValuesArray(model.views).map(flattenView),
      sheets:    mapValuesArray(model.sheets),
    };
  }

  /**
   * Convenience: serialise + JSON.stringify. Pretty-printed by default to match
   * the v1 file convention (`46-save-load.js` writes 2-space pretty JSON).
   * @param {StructuralModel} model
   * @param {object} [opts]
   * @param {number} [opts.indent=2]
   * @returns {string}
   */
  function modelToString(model, opts) {
    const indent = (opts && typeof opts.indent === 'number') ? opts.indent : 2;
    return JSON.stringify(modelToJSON(model), null, indent);
  }

  v2.io.serialise     = modelToJSON;
  v2.io.modelToJSON   = modelToJSON;
  v2.io.modelToString = modelToString;
})();
