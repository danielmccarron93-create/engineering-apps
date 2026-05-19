/**
 * StructDraw v2 · Transactions · place-element
 * LAYER: model · transactions — create a new Element.
 * READS:  window.v2.model.{makeElement, dirtySetForElement, emptyDirtySet}
 * WRITES: window.v2.transactions.placeElement
 *
 * Classic <script>, no build step. A Transaction is the ONLY way the model
 * changes: it carries an apply()/unapply() pair, each returning a DirtySet, so
 * undo/redo and dirty-region rendering come for free. See 03-model-layer.md §8
 * and 06-tools-and-transactions.md §4.
 *
 * --- JSDoc shape -----------------------------------------------------------
 * @typedef {object} Transaction
 * @property {string} type           discriminator
 * @property {string} description    human-readable, for the undo stack
 * @property {Object} data           type-specific payload
 * @property {(model:StructuralModel)=>DirtySet} apply
 * @property {(model:StructuralModel)=>DirtySet} unapply
 * ---------------------------------------------------------------------------
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.transactions = v2.transactions || {};

  /**
   * Create a transaction that places a new Element into the model. When the
   * element is an annotation hosted by another element, the host's
   * `annotationIds` back-reference is maintained (and reversed on unapply).
   * A non-annotation hosted element (a screw in a beam) sets `hostId` but is
   * NOT listed in the host's `annotationIds` — that list tracks annotations only.
   * @param {object} spec  forwarded to v2.model.makeElement (mints the id)
   * @returns {Transaction}
   */
  function placeElement(spec) {
    const element = v2.model.makeElement(spec);
    const linksToHost = element.category === 'annotation' && element.hostId != null;
    // Captured at apply time: did the host already own an annotationIds array?
    // If apply() had to create it, unapply() must delete it again so the host
    // round-trips exactly (an absent array is not the same as an empty one).
    let hostHadAnnotationIds = false;

    return {
      type: 'place-element',
      description: 'Place ' + (element.family || element.category) +
                   (element.type ? ' ' + element.type : ''),
      data: { element: element },

      apply: function (model) {
        model.elements.set(element.id, element);
        if (linksToHost) {
          const host = model.elements.get(element.hostId);
          if (host) {
            hostHadAnnotationIds = Array.isArray(host.annotationIds);
            if (!hostHadAnnotationIds) host.annotationIds = [];
            if (host.annotationIds.indexOf(element.id) === -1) {
              host.annotationIds.push(element.id);
            }
          }
        }
        return v2.model.dirtySetForElement(model, element);
      },

      unapply: function (model) {
        const dirty = v2.model.dirtySetForElement(model, element);
        model.elements.delete(element.id);
        if (linksToHost) {
          const host = model.elements.get(element.hostId);
          if (host && Array.isArray(host.annotationIds)) {
            if (hostHadAnnotationIds) {
              host.annotationIds = host.annotationIds.filter(function (id) {
                return id !== element.id;
              });
            } else {
              // apply() created the array — remove it so the host round-trips
              delete host.annotationIds;
            }
          }
        }
        return dirty;
      },
    };
  }

  v2.transactions.placeElement = placeElement;
})();
