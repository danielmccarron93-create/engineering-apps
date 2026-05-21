/**
 * StructDraw v2 · Render Layer · view helpers
 * LAYER: render — view-side projection + visibility helpers consumed by every
 *        renderer. Pure functions; no DOM, no canvas, no model mutation.
 * READS:  window.v2.model.{geometryViewId, geometryBoundingBox, bboxIntersects,
 *           elementsInView, projectPoint, projectVector, projectPolygon}
 * WRITES: window.v2.render.{isInView, elementsForView, projectPoint,
 *           projectVector, projectPolygon, projectGeometry2D, geometryFitsBbox,
 *           visibleInView, classifyCut}
 *
 * Classic <script>, no build step (CLAUDE.md rules 3 & 8). v1's renderer holds
 * its view math as global functions (s2px / px2s / real2px / px2real,
 * `08-coords.js`). v2 lifts that into the model + view layer (the View carries
 * a 4x4 modelTransform) and the renderer composes view-projection here.
 * See 03-model-layer.md §5 and 05-render-pipeline.md §§3, 4.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.render = v2.render || {};

  /* ----------------- visibility helpers ----------------------------------- */

  /**
   * Is this element visible in the given view?
   *   - model-level geometry (linear / plate / point) is visible in every view
   *     (the renderer projects it through view.modelTransform).
   *   - view-local geometry (annotation / view-local region / view-local
   *     polyline) is visible only in the view whose id matches geometry.viewId.
   * `dirtyRegion` is consulted opportunistically — when present and a bbox is
   * supplied, an element whose bbox doesn't intersect the region is filtered.
   * @param {Element} element
   * @param {View} view
   * @param {?DirtySet} [dirtyRegion]
   * @returns {boolean}
   */
  function isInView(element, view, dirtyRegion) {
    if (!element || !view) return false;
    const geomViewId = v2.model.geometryViewId(element.geometry);
    if (geomViewId != null && geomViewId !== view.id) return false;
    if (dirtyRegion && dirtyRegion.elements instanceof Set) {
      // When the dirty region names specific elements, restrict to those.
      if (dirtyRegion.elements.size > 0 && !dirtyRegion.elements.has(element.id)) {
        // The dirty hint is a SUBSET — if it names the element, draw; if not,
        // skip. (Phase 0f scaffold consumes the hint; the spatial-index
        // optimisation is deliberately deferred per 05 §8.)
        return false;
      }
    }
    return true;
  }

  /**
   * Every element visible in `view`, in deterministic insertion order (the
   * model's Map preserves insertion order which is the v1 z-order — first
   * placed renders behind later placements; the renderer uses that as painter's
   * algorithm input until a real spatial sort lands).
   * @param {StructuralModel} model
   * @param {View} view
   * @param {?DirtySet} [dirtyRegion]
   * @returns {Element[]}
   */
  function elementsForView(model, view, dirtyRegion) {
    if (!model || !view) return [];
    const out = [];
    for (const el of model.elements.values()) {
      if (isInView(el, view, dirtyRegion)) out.push(el);
    }
    return out;
  }

  /* ----------------- projection (model 3D -> view-local 2D) --------------- */

  /**
   * Project a model-space 3D point into view-local 2D. Delegates to
   * `v2.model.projectPoint` so projection math lives in one place; this wrapper
   * exists so renderer code reads `v2.render.projectPoint(view, p)` (consistent
   * with the rest of the render-layer API).
   */
  function projectPoint(view, p) {
    return v2.model.projectPoint(view, p);
  }

  function projectVector(view, vct) {
    return v2.model.projectVector(view, vct);
  }

  function projectPolygon(view, poly) {
    return v2.model.projectPolygon(view, poly);
  }

  /**
   * Project an Element's geometry to a flat array of view-local 2D vertices.
   * Used by polygon / polyline / hit-test consumers that want "where does this
   * element show up on the paper" without re-implementing the projection per
   * geometry kind.
   * @param {Geometry} geom
   * @param {View} view
   * @returns {Point2D[]}
   */
  function projectGeometry2D(geom, view) {
    if (!geom) return [];
    switch (geom.kind) {
      case 'linear':
        return [projectPoint(view, geom.start), projectPoint(view, geom.end)];
      case 'point':
        return [projectPoint(view, geom.location)];
      case 'plate':
        return (geom.polygon || []).map(function (p) { return projectPoint(view, p); });
      case 'annotation':
      case 'polyline':
        return (geom.points || []).map(function (p) {
          // view-local geometry is already 2D — just defensively coerce.
          return { x: typeof p.x === 'number' ? p.x : 0, y: typeof p.y === 'number' ? p.y : 0 };
        });
      case 'region': {
        // view-local regions carry 2D points; model-level regions carry 3D.
        if (geom.viewId != null) {
          return (geom.polygon || []).map(function (p) {
            return { x: typeof p.x === 'number' ? p.x : 0, y: typeof p.y === 'number' ? p.y : 0 };
          });
        }
        return (geom.polygon || []).map(function (p) { return projectPoint(view, p); });
      }
      default:
        return [];
    }
  }

  /* ----------------- cut classification (Phase 0f scaffold) -------------- */

  /**
   * Classify how an element appears in a view: cut by the section plane,
   * projected (the typical case), hidden by an occluder, or beyond the view's
   * cut depth. Phase 0f scaffold: returns 'projected' for every element because
   * the v1-migrated views the renderer reads through don't carry a `cutPlane`
   * yet. The real implementation (mirrors v1's getCutClass / live-section-cut
   * classification) lands when the view layer learns about cut planes.
   * @returns {'cut'|'projected'|'hidden'|'beyond'}
   */
  function classifyCut(element, view) {
    void element; void view;
    return 'projected';
  }

  /**
   * Coarse element-fits-bbox check used by dirty-region tests.
   * @param {Element} element
   * @param {?BoundingBox3D} bbox
   * @returns {boolean}
   */
  function geometryFitsBbox(element, bbox) {
    if (!bbox) return true;
    const eb = v2.model.elementBoundingBox(element);
    return v2.model.bboxIntersects(eb, bbox);
  }

  /** Tiny convenience: visible + classifiable in one call. */
  function visibleInView(element, view, dirtyRegion) {
    if (!isInView(element, view, dirtyRegion)) return null;
    return classifyCut(element, view);
  }

  v2.render.isInView          = isInView;
  v2.render.elementsForView   = elementsForView;
  v2.render.projectPoint      = projectPoint;
  v2.render.projectVector     = projectVector;
  v2.render.projectPolygon    = projectPolygon;
  v2.render.projectGeometry2D = projectGeometry2D;
  v2.render.classifyCut       = classifyCut;
  v2.render.geometryFitsBbox  = geometryFitsBbox;
  v2.render.visibleInView     = visibleInView;
})();
