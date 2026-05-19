/**
 * StructDraw v2 · Model Layer · structural model
 * LAYER: model — the StructuralModel root, applyTransaction, the query API and
 *        the DirtySet machinery.
 * READS:  window.v2.model.{newId, geometryViewId, elementBoundingBox,
 *           bboxIntersects, bboxUnion}
 * WRITES: window.v2.model.{makeModel, makeProject, applyTransaction, query,
 *           elementsByCategory, elementsByFamily, elementsInBox, elementsInView,
 *           hostedBy, annotationsOf, emptyDirtySet, mergeDirtySets,
 *           dirtySetForElement}
 *
 * Classic <script>, no build step. Pure data + pure functions — no DOM, no canvas,
 * no undo state (the UndoStack lives in the Engine layer — a later phase).
 * The model is a plain object; functions take it as their first argument.
 * See 03-model-layer.md §§2, 8, 9.
 *
 * --- JSDoc shapes ----------------------------------------------------------
 * @typedef {object} ProjectMetadata
 * @property {string} id @property {string} name @property {string} units
 * @property {number} createdAt
 *
 * @typedef {object} StructuralModel
 * @property {number} schemaVersion          bumped per breaking change to this shape
 * @property {Map<string,Element>}  elements
 * @property {Map<string,Material>} materials
 * @property {Map<string,View>}     views
 * @property {Map<string,Sheet>}    sheets
 * @property {ProjectMetadata}      project
 * @property {number} version                incremented by applyTransaction
 *
 * @typedef {object} DirtySet
 * @property {Set<string>} elements
 * @property {Set<string>} views
 * @property {Set<string>} sheets
 * @property {BoundingBox3D} [bbox]
 * ---------------------------------------------------------------------------
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.model = v2.model || {};

  /** The schema version produced by this build. See 03-model-layer.md §10. */
  const SCHEMA_VERSION = 2;

  function toMap(v) {
    if (v instanceof Map) return new Map(v);
    if (Array.isArray(v)) return new Map(v);
    return new Map();
  }

  /**
   * Construct a ProjectMetadata plain object.
   * @param {object} [spec]
   * @returns {ProjectMetadata}
   */
  function makeProject(spec) {
    spec = spec || {};
    return {
      id: spec.id != null ? spec.id : v2.model.newId(),
      name: spec.name != null ? spec.name : 'Untitled Project',
      units: 'mm',
      createdAt: typeof spec.createdAt === 'number' ? spec.createdAt : Date.now(),
    };
  }

  /**
   * Construct a StructuralModel. Maps may be seeded from a Map or an
   * array-of-pairs (the JSON.stringify-friendly form). version starts at 0.
   * @param {object} [spec]
   * @returns {StructuralModel}
   */
  function makeModel(spec) {
    spec = spec || {};
    return {
      schemaVersion: SCHEMA_VERSION,
      elements: toMap(spec.elements),
      materials: toMap(spec.materials),
      views: toMap(spec.views),
      sheets: toMap(spec.sheets),
      project: spec.project || makeProject(),
      version: typeof spec.version === 'number' ? spec.version : 0,
    };
  }

  // --- DirtySet helpers -----------------------------------------------------

  /** @returns {DirtySet} an empty dirty set */
  function emptyDirtySet() {
    return { elements: new Set(), views: new Set(), sheets: new Set() };
  }

  /**
   * Union two DirtySets (used to fold a batch transaction's child results).
   * @param {DirtySet} a
   * @param {DirtySet} b
   * @returns {DirtySet}
   */
  function mergeDirtySets(a, b) {
    a = a || emptyDirtySet();
    b = b || emptyDirtySet();
    const out = {
      elements: new Set(),
      views: new Set(),
      sheets: new Set(),
    };
    a.elements.forEach(function (x) { out.elements.add(x); });
    b.elements.forEach(function (x) { out.elements.add(x); });
    a.views.forEach(function (x) { out.views.add(x); });
    b.views.forEach(function (x) { out.views.add(x); });
    a.sheets.forEach(function (x) { out.sheets.add(x); });
    b.sheets.forEach(function (x) { out.sheets.add(x); });
    const bbox = v2.model.bboxUnion(a.bbox, b.bbox);
    if (bbox) out.bbox = bbox;
    return out;
  }

  /** Views potentially showing an element. Scaffold: model-level => every view. */
  function viewsShowingElement(model, element) {
    const vid = v2.model.geometryViewId(element && element.geometry);
    if (vid != null) return new Set([vid]);
    return new Set(model.views.keys());
  }

  /** Sheets that place any of the given views. */
  function sheetsShowingViews(model, viewIds) {
    const out = new Set();
    for (const sheet of model.sheets.values()) {
      for (let i = 0; i < sheet.placements.length; i++) {
        if (viewIds.has(sheet.placements[i].viewId)) {
          out.add(sheet.id);
          break;
        }
      }
    }
    return out;
  }

  /**
   * Build the DirtySet for a single element changing — the views it appears in
   * and the sheets placing those views, plus a coarse bbox hint.
   * @param {StructuralModel} model
   * @param {Element} element
   * @returns {DirtySet}
   */
  function dirtySetForElement(model, element) {
    const views = viewsShowingElement(model, element);
    const ds = {
      elements: new Set([element.id]),
      views: views,
      sheets: sheetsShowingViews(model, views),
    };
    const bbox = v2.model.elementBoundingBox(element);
    if (bbox) ds.bbox = bbox;
    return ds;
  }

  // --- applyTransaction -----------------------------------------------------

  /**
   * Apply a transaction, producing a NEW versioned model. The four Maps are
   * shallow-copied so adds/deletes do not leak into the prior model snapshot;
   * the transaction mutates the copies. (Element objects themselves are shared
   * by reference — undo is replay-based via tx.unapply, not snapshot-based, so
   * a deep clone is intentionally avoided.) See 03-model-layer.md §2.
   * @param {StructuralModel} model
   * @param {Transaction} tx
   * @returns {{newModel: StructuralModel, dirty: DirtySet}}
   */
  function applyTransaction(model, tx) {
    if (!tx || typeof tx.apply !== 'function') {
      throw new Error('applyTransaction: a Transaction with an apply() method is required');
    }
    const newModel = {
      schemaVersion: model.schemaVersion,
      project: model.project,
      version: (typeof model.version === 'number' ? model.version : 0) + 1,
      elements: new Map(model.elements),
      materials: new Map(model.materials),
      views: new Map(model.views),
      sheets: new Map(model.sheets),
    };
    const dirty = tx.apply(newModel);
    return { newModel: newModel, dirty: dirty };
  }

  // --- query API ------------------------------------------------------------

  /**
   * Every element matching a predicate. Linear scan — adequate to ~1,000
   * elements (open question Q16: a spatial index is added only when measured
   * performance demands it).
   * @param {StructuralModel} model
   * @param {(elem:Element, model:StructuralModel)=>boolean} predicate
   * @returns {Element[]}
   */
  function query(model, predicate) {
    const out = [];
    for (const el of model.elements.values()) {
      if (predicate(el, model)) out.push(el);
    }
    return out;
  }

  function elementsByCategory(model, category) {
    return query(model, function (e) { return e.category === category; });
  }

  function elementsByFamily(model, category, family) {
    return query(model, function (e) {
      return e.category === category && e.family === family;
    });
  }

  function elementsInBox(model, box) {
    return query(model, function (e) {
      return v2.model.bboxIntersects(v2.model.elementBoundingBox(e), box);
    });
  }

  /**
   * Elements visible in a view: every model-level element, plus the view-local
   * elements whose geometry.viewId matches. Accepts a View object or a viewId.
   * @param {StructuralModel} model
   * @param {View|string} view
   * @returns {Element[]}
   */
  function elementsInView(model, view) {
    const viewId = (typeof view === 'string') ? view : (view && view.id);
    return query(model, function (e) {
      const vid = v2.model.geometryViewId(e.geometry);
      return vid == null ? true : vid === viewId;
    });
  }

  function hostedBy(model, hostId) {
    return query(model, function (e) { return e.hostId === hostId; });
  }

  /**
   * The child annotation elements owned by an element.
   * @param {StructuralModel} model
   * @param {string} elementId
   * @returns {Element[]}
   */
  function annotationsOf(model, elementId) {
    const host = model.elements.get(elementId);
    if (!host || !Array.isArray(host.annotationIds)) return [];
    return host.annotationIds
      .map(function (id) { return model.elements.get(id); })
      .filter(Boolean);
  }

  v2.model.SCHEMA_VERSION    = SCHEMA_VERSION;
  v2.model.makeProject       = makeProject;
  v2.model.makeModel         = makeModel;
  v2.model.emptyDirtySet     = emptyDirtySet;
  v2.model.mergeDirtySets    = mergeDirtySets;
  v2.model.dirtySetForElement = dirtySetForElement;
  v2.model.applyTransaction  = applyTransaction;
  v2.model.query             = query;
  v2.model.elementsByCategory = elementsByCategory;
  v2.model.elementsByFamily  = elementsByFamily;
  v2.model.elementsInBox     = elementsInBox;
  v2.model.elementsInView    = elementsInView;
  v2.model.hostedBy          = hostedBy;
  v2.model.annotationsOf     = annotationsOf;
})();
