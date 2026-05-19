/**
 * StructDraw v2 · Transactions · move-element
 * LAYER: model · transactions — replace an Element's geometry.
 * READS:  window.v2.model.{dirtySetForElement, mergeDirtySets, emptyDirtySet}
 * WRITES: window.v2.transactions.moveElement
 *
 * Classic <script>, no build step. The prior geometry is captured at apply time
 * so unapply restores it exactly. The DirtySet unions the element's pre-move and
 * post-move footprints so the renderer clears both regions. See 03-model-layer.md §8.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.transactions = v2.transactions || {};

  /**
   * Create a transaction that moves (re-geometries) an element. A no-op when
   * the id is not present at apply time.
   * @param {string} elementId
   * @param {Geometry} newGeometry
   * @returns {Transaction}
   */
  function moveElement(elementId, newGeometry) {
    let oldGeometry = null;
    let applied = false;

    return {
      type: 'move-element',
      description: 'Move element ' + elementId,
      data: { elementId: elementId, newGeometry: newGeometry },

      apply: function (model) {
        const el = model.elements.get(elementId);
        if (!el) return v2.model.emptyDirtySet();
        oldGeometry = el.geometry;
        const before = v2.model.dirtySetForElement(model, el);
        el.geometry = newGeometry;
        applied = true;
        return v2.model.mergeDirtySets(before, v2.model.dirtySetForElement(model, el));
      },

      unapply: function (model) {
        const el = model.elements.get(elementId);
        if (!el || !applied) return v2.model.emptyDirtySet();
        const before = v2.model.dirtySetForElement(model, el);
        el.geometry = oldGeometry;
        return v2.model.mergeDirtySets(before, v2.model.dirtySetForElement(model, el));
      },
    };
  }

  v2.transactions.moveElement = moveElement;
})();
