/**
 * StructDraw v2 · Model Layer · element
 * LAYER: model — the universal Element shape, its factory and element-level helpers.
 * READS:  window.v2.model.{newElementId, GEOMETRY_KINDS, geometryBoundingBox,
 *           geometryViewId}
 * WRITES: window.v2.model.{makeElement, elementBoundingBox, elementMaterial,
 *           elementCategory, isHosted, isCategory, CATEGORIES}
 *
 * Classic <script>, no build step. Pure data + pure functions — no DOM, no canvas.
 * Every structural and annotation primitive in v2 is an Element (Q8: plain object
 * via factory). See 03-model-layer.md §3.
 *
 * --- JSDoc shapes ----------------------------------------------------------
 * @typedef {string} Category   one of CATEGORIES
 * @typedef {string} FamilyId   parametric family within a category (catalogue, Phase 0c)
 * @typedef {string} TypeId     concrete catalogue row within a family
 *
 * @typedef {object} Element
 * @property {string}    id           UUID v4
 * @property {Category}  category     top-level taxonomy / render dispatch key
 * @property {?FamilyId} family        parametric family (null until catalogue exists)
 * @property {?TypeId}   type          concrete catalogue row (null until catalogue exists)
 * @property {Geometry}  geometry      discriminated by geometry.kind
 * @property {?string}   materialId    reference into model.materials
 * @property {Object}    params        per-instance free-form parameters
 * @property {number}    createdAt     epoch ms
 * @property {string}   [hostId]       host element id, for hosted elements
 * @property {Map}      [viewOverrides] per-view visibility / appearance
 * @property {string[]} [annotationIds] child annotation element ids
 * ---------------------------------------------------------------------------
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.model = v2.model || {};

  /** The closed set of top-level categories. Families/types are catalogue-driven (Phase 0c). */
  const CATEGORIES = Object.freeze([
    'beam', 'column', 'brace', 'plate', 'fastener', 'reinforcement', 'masonry',
    'concrete-region', 'timber-member', 'annotation', 'detail-component',
    'sheet-component',
  ]);

  /** @param {*} c @returns {boolean} */
  function isCategory(c) { return CATEGORIES.indexOf(c) !== -1; }

  /**
   * Construct an Element plain object. Validates the closed sets (category and
   * geometry kind); family/type are accepted as-is because the catalogue layer
   * that defines them is Phase 0c. An id is minted when one is not supplied.
   * @param {object} spec
   * @returns {Element}
   */
  function makeElement(spec) {
    spec = spec || {};
    if (!isCategory(spec.category)) {
      throw new Error(
        'makeElement: unknown category "' + spec.category +
        '" (expected one of: ' + CATEGORIES.join(', ') + ')'
      );
    }
    const geom = spec.geometry;
    if (!geom || typeof geom.kind !== 'string') {
      throw new Error('makeElement: geometry with a .kind discriminator is required');
    }
    if (v2.model.GEOMETRY_KINDS.indexOf(geom.kind) === -1) {
      throw new Error('makeElement: unknown geometry kind "' + geom.kind + '"');
    }
    const el = {
      id: spec.id != null ? spec.id : v2.model.newElementId(),
      category: spec.category,
      family: spec.family != null ? spec.family : null,
      type: spec.type != null ? spec.type : null,
      geometry: geom,
      materialId: spec.materialId != null ? spec.materialId : null,
      params: spec.params ? Object.assign({}, spec.params) : {},
      createdAt: typeof spec.createdAt === 'number' ? spec.createdAt : Date.now(),
    };
    if (spec.hostId != null) el.hostId = spec.hostId;
    if (spec.viewOverrides instanceof Map) el.viewOverrides = spec.viewOverrides;
    if (Array.isArray(spec.annotationIds)) el.annotationIds = spec.annotationIds.slice();
    return el;
  }

  /**
   * Axis-aligned bounding box of an element's geometry.
   * @param {Element} elem
   * @returns {?BoundingBox3D}
   */
  function elementBoundingBox(elem) {
    return v2.model.geometryBoundingBox(elem && elem.geometry);
  }

  /**
   * Resolve an element's Material from the model. Returns null when unset/unknown.
   * @param {Element} elem
   * @param {StructuralModel} model
   * @returns {?Material}
   */
  function elementMaterial(elem, model) {
    if (!elem || !model || !model.materials || elem.materialId == null) return null;
    return model.materials.get(elem.materialId) || null;
  }

  /** @param {Element} elem @returns {?Category} */
  function elementCategory(elem) { return elem ? elem.category : null; }

  /** @param {Element} elem @returns {boolean} true when the element has a host */
  function isHosted(elem) { return !!elem && elem.hostId != null; }

  v2.model.CATEGORIES        = CATEGORIES;
  v2.model.isCategory        = isCategory;
  v2.model.makeElement       = makeElement;
  v2.model.elementBoundingBox = elementBoundingBox;
  v2.model.elementMaterial   = elementMaterial;
  v2.model.elementCategory   = elementCategory;
  v2.model.isHosted          = isHosted;
})();
