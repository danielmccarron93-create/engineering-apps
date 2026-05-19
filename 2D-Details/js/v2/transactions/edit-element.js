/**
 * StructDraw v2 · Transactions · edit-element
 * LAYER: model · transactions — patch top-level fields of an Element.
 * READS:  window.v2.model.{dirtySetForElement, emptyDirtySet}
 * WRITES: window.v2.transactions.editElement
 *
 * Classic <script>, no build step. `changes` is a shallow patch over the
 * element's top-level fields — typically `params`, `materialId` or `type` (the
 * Inspector dispatches one of these per edit). Prior values are captured per
 * key (distinguishing "was absent" from "was undefined") so unapply restores
 * the element exactly. The `id` field cannot be changed. Geometry changes go
 * through moveElement, not editElement. See 03-model-layer.md §8.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.transactions = v2.transactions || {};
  const hasOwn = Object.prototype.hasOwnProperty;

  /**
   * Create a transaction that patches an element's fields. A no-op when the id
   * is not present at apply time.
   * @param {string} elementId
   * @param {Object} changes  field -> new value
   * @returns {Transaction}
   */
  function editElement(elementId, changes) {
    if (changes && hasOwn.call(changes, 'id')) {
      throw new Error('editElement: an element id cannot be changed');
    }
    const keys = changes ? Object.keys(changes) : [];
    let prior = null;     // [{ key, had, value }]
    let applied = false;

    return {
      type: 'edit-element',
      description: 'Edit element ' + elementId +
                   (keys.length ? ' (' + keys.join(', ') + ')' : ''),
      data: { elementId: elementId, changes: changes },

      apply: function (model) {
        const el = model.elements.get(elementId);
        if (!el) return v2.model.emptyDirtySet();
        prior = keys.map(function (k) {
          return { key: k, had: hasOwn.call(el, k), value: el[k] };
        });
        for (let i = 0; i < keys.length; i++) {
          el[keys[i]] = changes[keys[i]];
        }
        applied = true;
        return v2.model.dirtySetForElement(model, el);
      },

      unapply: function (model) {
        const el = model.elements.get(elementId);
        if (!el || !applied) return v2.model.emptyDirtySet();
        for (let i = 0; i < prior.length; i++) {
          const p = prior[i];
          if (p.had) el[p.key] = p.value;
          else delete el[p.key];
        }
        return v2.model.dirtySetForElement(model, el);
      },
    };
  }

  v2.transactions.editElement = editElement;
})();
