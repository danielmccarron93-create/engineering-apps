/**
 * StructDraw v2 · Model Layer · view
 * LAYER: model — the View shape (a projection definition), its factory and
 *        projection helpers.
 * READS:  window.v2.model.newViewId
 * WRITES: window.v2.model.{makeView, identityMatrix4, projectPoint,
 *           projectVector, projectPolygon, isPaperSpace, VIEW_TYPES}
 *
 * Classic <script>, no build step. Pure data + pure functions — no DOM, no canvas.
 * A View defines "what slice of the model and how do I project it"; it is
 * independent of any Sheet placement (a View can sit on several Sheets).
 * `modelTransform` is a column-major 4x4 (Three.js convention). See 03-model-layer.md §5.
 *
 * --- JSDoc shapes ----------------------------------------------------------
 * @typedef {number[]} Matrix4  16 numbers, column-major
 *
 * @typedef {object} View
 * @property {string}   id
 * @property {'plan'|'section'|'elevation'|'iso'|'3d-perspective'|'paper-space'} type
 * @property {string}   name
 * @property {Matrix4}  modelTransform        model coords -> view-local coords
 * @property {number}   scale                 e.g. 50 for "1:50"
 * @property {boolean}  showAnnotationsOnly   paper-space: draw only view-local entities
 * @property {Object}  [cutPlane]   @property {number} [cutDepth]  @property {Object} [camera]
 * @property {Map}     [categoryVisibility]
 * @property {Set}     [hideOverrides] @property {Set} [showOverrides]
 * @property {Object}  [lineweightOverride]
 * ---------------------------------------------------------------------------
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.model = v2.model || {};

  const VIEW_TYPES = Object.freeze([
    'plan', 'section', 'elevation', 'iso', '3d-perspective', 'paper-space',
  ]);

  function num(n) { return typeof n === 'number' && isFinite(n) ? n : 0; }

  /** The identity 4x4 (column-major). @returns {Matrix4} */
  function identityMatrix4() {
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  }

  /**
   * Construct a View plain object. `modelTransform` defaults to the identity
   * (correct for a paper-space view); `showAnnotationsOnly` defaults true for
   * paper-space views and false otherwise. An id is minted when not supplied.
   * @param {object} spec
   * @returns {View}
   */
  function makeView(spec) {
    spec = spec || {};
    if (VIEW_TYPES.indexOf(spec.type) === -1) {
      throw new Error(
        'makeView: unknown view type "' + spec.type +
        '" (expected one of: ' + VIEW_TYPES.join(', ') + ')'
      );
    }
    const view = {
      id: spec.id != null ? spec.id : v2.model.newViewId(),
      type: spec.type,
      name: spec.name != null ? spec.name : '',
      modelTransform: (Array.isArray(spec.modelTransform) && spec.modelTransform.length === 16)
        ? spec.modelTransform.slice()
        : identityMatrix4(),
      scale: typeof spec.scale === 'number' ? spec.scale : 1,
      showAnnotationsOnly: spec.showAnnotationsOnly != null
        ? !!spec.showAnnotationsOnly
        : (spec.type === 'paper-space'),
    };
    if (spec.cutPlane) view.cutPlane = spec.cutPlane;
    if (typeof spec.cutDepth === 'number') view.cutDepth = spec.cutDepth;
    if (spec.camera) view.camera = spec.camera;
    if (spec.categoryVisibility instanceof Map) view.categoryVisibility = spec.categoryVisibility;
    if (spec.hideOverrides instanceof Set) view.hideOverrides = spec.hideOverrides;
    if (spec.showOverrides instanceof Set) view.showOverrides = spec.showOverrides;
    if (spec.lineweightOverride) view.lineweightOverride = spec.lineweightOverride;
    return view;
  }

  function transformOf(view) {
    return (view && Array.isArray(view.modelTransform) && view.modelTransform.length === 16)
      ? view.modelTransform
      : identityMatrix4();
  }

  /**
   * Project a model-space 3D point into the view's 2D local space. The depth
   * component is dropped; renderers consume the 2D result.
   * @param {View} view
   * @param {Point3D} p
   * @returns {Point2D}
   */
  function projectPoint(view, p) {
    const m = transformOf(view);
    const x = num(p && p.x), y = num(p && p.y), z = num(p && p.z);
    return {
      x: m[0] * x + m[4] * y + m[8] * z + m[12],
      y: m[1] * x + m[5] * y + m[9] * z + m[13],
    };
  }

  /**
   * Project a model-space 3D vector (rotation/scale only — no translation).
   * @param {View} view
   * @param {Vector3D} v
   * @returns {Point2D}
   */
  function projectVector(view, v) {
    const m = transformOf(view);
    const x = num(v && v.x), y = num(v && v.y), z = num(v && v.z);
    return {
      x: m[0] * x + m[4] * y + m[8] * z,
      y: m[1] * x + m[5] * y + m[9] * z,
    };
  }

  /**
   * Project every vertex of a polygon/polyline.
   * @param {View} view
   * @param {Point3D[]} poly
   * @returns {Point2D[]}
   */
  function projectPolygon(view, poly) {
    return (poly || []).map(function (p) { return projectPoint(view, p); });
  }

  /** @param {View} view @returns {boolean} */
  function isPaperSpace(view) { return !!view && view.type === 'paper-space'; }

  v2.model.VIEW_TYPES      = VIEW_TYPES;
  v2.model.identityMatrix4 = identityMatrix4;
  v2.model.makeView        = makeView;
  v2.model.projectPoint    = projectPoint;
  v2.model.projectVector   = projectVector;
  v2.model.projectPolygon  = projectPolygon;
  v2.model.isPaperSpace    = isPaperSpace;
})();
