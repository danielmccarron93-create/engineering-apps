/**
 * StructDraw v2 · Transactions · batch
 * LAYER: model · transactions — an atomic group of transactions.
 * READS:  window.v2.model.{mergeDirtySets, emptyDirtySet}
 * WRITES: window.v2.transactions.batch
 *
 * Classic <script>, no build step. apply() runs the child transactions in
 * order; unapply() runs them in REVERSE order — the correctness requirement for
 * undoing a group whose members touch the same field. The merged DirtySet is
 * the union of the children's. See 03-model-layer.md §8.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.transactions = v2.transactions || {};

  /**
   * Create a transaction that applies several transactions atomically.
   * @param {Transaction[]} txs  child transactions, already built by factories
   * @returns {Transaction}
   */
  function batch(txs) {
    const list = Array.isArray(txs) ? txs.slice() : [];

    return {
      type: 'batch',
      description: 'Batch (' + list.length +
                   (list.length === 1 ? ' change)' : ' changes)'),
      data: { txs: list },

      apply: function (model) {
        let dirty = v2.model.emptyDirtySet();
        for (let i = 0; i < list.length; i++) {
          dirty = v2.model.mergeDirtySets(dirty, list[i].apply(model));
        }
        return dirty;
      },

      unapply: function (model) {
        let dirty = v2.model.emptyDirtySet();
        for (let i = list.length - 1; i >= 0; i--) {
          dirty = v2.model.mergeDirtySets(dirty, list[i].unapply(model));
        }
        return dirty;
      },
    };
  }

  v2.transactions.batch = batch;
})();
