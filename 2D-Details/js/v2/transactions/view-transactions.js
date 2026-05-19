/**
 * StructDraw v2 · Transactions · view transactions
 * LAYER: model · transactions — create / edit / delete a View.
 * READS:  window.v2.model.{makeView, emptyDirtySet}
 * WRITES: window.v2.transactions.{createView, editView, deleteView}
 *
 * Classic <script>, no build step. deleteView does NOT cascade to the view's
 * sheet placements or its view-local elements in this scaffold — cascade is a
 * later-phase concern; round-trip correctness for the single view is exact.
 * See 03-model-layer.md §8.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.transactions = v2.transactions || {};
  const hasOwn = Object.prototype.hasOwnProperty;

  function viewDirty(viewId) {
    const ds = v2.model.emptyDirtySet();
    ds.views.add(viewId);
    return ds;
  }

  /**
   * Create a transaction that adds a new View.
   * @param {object} viewSpec  forwarded to v2.model.makeView (mints the id)
   * @returns {Transaction}
   */
  function createView(viewSpec) {
    const view = v2.model.makeView(viewSpec);
    return {
      type: 'create-view',
      description: 'Create view ' + (view.name || view.type),
      data: { view: view },
      apply: function (model) {
        model.views.set(view.id, view);
        return viewDirty(view.id);
      },
      unapply: function (model) {
        model.views.delete(view.id);
        return viewDirty(view.id);
      },
    };
  }

  /**
   * Create a transaction that patches a View's fields. A no-op when the id is
   * not present at apply time.
   * @param {string} viewId
   * @param {Object} changes
   * @returns {Transaction}
   */
  function editView(viewId, changes) {
    if (changes && hasOwn.call(changes, 'id')) {
      throw new Error('editView: a view id cannot be changed');
    }
    const keys = changes ? Object.keys(changes) : [];
    let prior = null;
    let applied = false;
    return {
      type: 'edit-view',
      description: 'Edit view ' + viewId,
      data: { viewId: viewId, changes: changes },
      apply: function (model) {
        const view = model.views.get(viewId);
        if (!view) return v2.model.emptyDirtySet();
        prior = keys.map(function (k) {
          return { key: k, had: hasOwn.call(view, k), value: view[k] };
        });
        for (let i = 0; i < keys.length; i++) view[keys[i]] = changes[keys[i]];
        applied = true;
        return viewDirty(viewId);
      },
      unapply: function (model) {
        const view = model.views.get(viewId);
        if (!view || !applied) return v2.model.emptyDirtySet();
        for (let i = 0; i < prior.length; i++) {
          const p = prior[i];
          if (p.had) view[p.key] = p.value;
          else delete view[p.key];
        }
        return viewDirty(viewId);
      },
    };
  }

  /**
   * Create a transaction that deletes a View. A no-op when the id is not
   * present at apply time.
   * @param {string} viewId
   * @returns {Transaction}
   */
  function deleteView(viewId) {
    let removed = null;
    return {
      type: 'delete-view',
      description: 'Delete view ' + viewId,
      data: { viewId: viewId },
      apply: function (model) {
        removed = model.views.get(viewId) || null;
        if (!removed) return v2.model.emptyDirtySet();
        model.views.delete(viewId);
        return viewDirty(viewId);
      },
      unapply: function (model) {
        if (!removed) return v2.model.emptyDirtySet();
        model.views.set(viewId, removed);
        return viewDirty(viewId);
      },
    };
  }

  v2.transactions.createView = createView;
  v2.transactions.editView   = editView;
  v2.transactions.deleteView = deleteView;
})();
