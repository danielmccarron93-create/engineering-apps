/**
 * StructDraw v2 · Transactions · delete-element
 * LAYER: model · transactions — remove an Element.
 * READS:  window.v2.model.{dirtySetForElement, emptyDirtySet}
 * WRITES: window.v2.transactions.deleteElement
 *
 * Classic <script>, no build step. The removed element is captured at apply
 * time so unapply can re-insert it verbatim — including its position in any
 * host's annotationIds list. Deleting a host does NOT cascade to its hosted
 * children in this scaffold (their hostId is left dangling); cascading delete
 * is a tool-layer concern in a later phase. See 03-model-layer.md §8.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.transactions = v2.transactions || {};

  /**
   * Create a transaction that deletes the element with the given id. A no-op
   * (empty DirtySet, both directions) when the id is not present at apply time.
   * @param {string} elementId
   * @returns {Transaction}
   */
  function deleteElement(elementId) {
    let removed = null;       // captured Element, set at apply time
    let hostId = null;        // host whose annotationIds we edited
    let hostIndex = -1;       // index the element occupied in host.annotationIds

    return {
      type: 'delete-element',
      description: 'Delete element ' + elementId,
      data: { elementId: elementId },

      apply: function (model) {
        removed = model.elements.get(elementId) || null;
        if (!removed) return v2.model.emptyDirtySet();
        const dirty = v2.model.dirtySetForElement(model, removed);
        model.elements.delete(elementId);
        hostId = null;
        hostIndex = -1;
        if (removed.category === 'annotation' && removed.hostId != null) {
          const host = model.elements.get(removed.hostId);
          if (host && Array.isArray(host.annotationIds)) {
            const idx = host.annotationIds.indexOf(elementId);
            if (idx !== -1) {
              host.annotationIds.splice(idx, 1);
              hostId = removed.hostId;
              hostIndex = idx;
            }
          }
        }
        return dirty;
      },

      unapply: function (model) {
        if (!removed) return v2.model.emptyDirtySet();
        model.elements.set(elementId, removed);
        if (hostId != null) {
          const host = model.elements.get(hostId);
          if (host) {
            if (!Array.isArray(host.annotationIds)) host.annotationIds = [];
            // restore at the exact original index so list order round-trips
            host.annotationIds.splice(hostIndex, 0, elementId);
          }
        }
        return v2.model.dirtySetForElement(model, removed);
      },
    };
  }

  v2.transactions.deleteElement = deleteElement;
})();
