/**
 * StructDraw v2 · I/O Layer · deserialise (JSON -> model)
 * LAYER: io — turns a JSON-friendly plain object (the shape `serialise.js`
 *        emits) back into a v2 StructuralModel. The transactional inverse of
 *        `serialise.js`.
 * READS:  window.v2.model.{makeModel, makeProject, makeElement, makeView,
 *           makeSheet, makeMaterial}
 * WRITES: window.v2.io.{deserialise, modelFromJSON, modelFromString}
 *
 * Classic <script>, no build step (CLAUDE.md rules 3 & 8). Pure — no DOM. The
 * function is total: a partial / malformed input degrades to an empty model
 * rather than throwing. Tolerates BOTH the on-disk array shape (the emitter's
 * output) AND the in-memory Map shape (round-tripping a live model).
 *
 * ROUND-TRIP CONTRACT — for any model `m`:
 *   modelFromJSON(modelToJSON(m))  is structurally equal to `m`
 *   (Map ordering, element identity, version, project metadata all preserved).
 * The round-trip test lives in tests/v2/io/serialise-roundtrip.test.js.
 *
 * Note this file does NOT do v1 -> v2 migration — it reads a v2-shaped JSON
 * verbatim. The v1 -> v2 path is `io/load.js` (which calls migrations/v1-to-v2.js
 * for v1 schemas, then this file for v2 schemas).
 * See 07-migration-strategy.md §4 and 03-model-layer.md §11.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.io = v2.io || {};

  /** Re-index an array of {id, …} entries as a Map keyed by .id. */
  function indexById(arr) {
    const m = new Map();
    if (!Array.isArray(arr)) return m;
    for (let i = 0; i < arr.length; i++) {
      const item = arr[i];
      if (item && typeof item.id === 'string' && item.id.length) m.set(item.id, item);
    }
    return m;
  }

  /** Accept the on-disk array OR an in-memory Map / pair-array. */
  function toMap(v, factory) {
    if (v instanceof Map) {
      // Already a Map of factories' outputs — pass through.
      return new Map(v);
    }
    if (Array.isArray(v)) {
      // Heuristic — pair-array (entries) when every element is a [key,value]
      // pair with the value carrying an id. Otherwise treat as values-array.
      const looksLikePairs = v.length > 0 && Array.isArray(v[0]) && v[0].length === 2;
      const valuesArr = looksLikePairs ? v.map(function (p) { return p[1]; }) : v;
      const normalised = (typeof factory === 'function')
        ? valuesArr.map(function (x) {
            try { return factory(x); } catch (e) { return x; }
          })
        : valuesArr;
      return indexById(normalised);
    }
    return new Map();
  }

  /** Re-wrap a serialised element through makeElement so the runtime contract
   *  (id present, geometry valid, categories in the closed set) is rebuilt. */
  function rehydrateElement(el) {
    if (!el || typeof el !== 'object') return null;
    const spec = Object.assign({}, el);
    // viewOverrides is emitted as an array of pairs; rehydrate to Map.
    if (Array.isArray(el.viewOverrides)) {
      spec.viewOverrides = new Map(el.viewOverrides);
    }
    return v2.model.makeElement(spec);
  }

  function rehydrateView(vw) {
    if (!vw || typeof vw !== 'object') return null;
    const spec = Object.assign({}, vw);
    if (Array.isArray(vw.categoryVisibility)) {
      spec.categoryVisibility = new Map(vw.categoryVisibility);
    }
    if (Array.isArray(vw.hideOverrides)) {
      spec.hideOverrides = new Set(vw.hideOverrides);
    }
    if (Array.isArray(vw.showOverrides)) {
      spec.showOverrides = new Set(vw.showOverrides);
    }
    return v2.model.makeView(spec);
  }

  function rehydrateSheet(s)    { return s ? v2.model.makeSheet(s) : null; }
  function rehydrateMaterial(m) { return m ? v2.model.makeMaterial(m) : null; }

  /**
   * Deserialise a JSON-friendly plain object back into a v2 StructuralModel.
   * Pure — the input is not mutated.
   * @param {object} json   the output of `modelToJSON` (or any v2-shape object)
   * @returns {StructuralModel}
   */
  function modelFromJSON(json) {
    json = json || {};
    const elements  = toMap(json.elements,  rehydrateElement);
    const materials = toMap(json.materials, rehydrateMaterial);
    const views     = toMap(json.views,     rehydrateView);
    const sheets    = toMap(json.sheets,    rehydrateSheet);
    const project   = json.project
      ? v2.model.makeProject(Object.assign({}, json.project))
      : v2.model.makeProject({ id: 'v2-project' });
    return v2.model.makeModel({
      elements: elements,
      materials: materials,
      views: views,
      sheets: sheets,
      project: project,
      version: typeof json.version === 'number' ? json.version : 0,
    });
  }

  /**
   * Convenience: JSON.parse + modelFromJSON. Returns null on a parse error so
   * callers can distinguish "bad JSON" from "empty model".
   * @param {string} text
   * @returns {?StructuralModel}
   */
  function modelFromString(text) {
    let parsed;
    try { parsed = JSON.parse(text); }
    catch (e) { return null; }
    return modelFromJSON(parsed);
  }

  v2.io.deserialise      = modelFromJSON;
  v2.io.modelFromJSON    = modelFromJSON;
  v2.io.modelFromString  = modelFromString;
})();
