/**
 * StructDraw v2 · Transactions · registry
 * LAYER: model · transactions — the transaction-type registry. Loaded LAST of
 *        the v2/transactions files (it reads the factories the others defined).
 * READS:  window.v2.transactions.{placeElement, deleteElement, ...}
 * WRITES: window.v2.transactions.{registry, types, isTransaction}
 *
 * Classic <script>, no build step. The registry maps each transaction `type`
 * discriminator to its factory function — a single point of truth used by
 * tests now, and (in later phases) by transaction replay / co-editing.
 * See 03-model-layer.md §8.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  const t = (v2.transactions = v2.transactions || {});

  /** type discriminator -> factory function. Mirrors the §8 transaction taxonomy. */
  const FACTORIES = {
    'place-element': t.placeElement,
    'delete-element': t.deleteElement,
    'move-element': t.moveElement,
    'edit-element': t.editElement,
    'batch': t.batch,
    'create-view': t.createView,
    'edit-view': t.editView,
    'delete-view': t.deleteView,
    'create-sheet': t.createSheet,
    'place-view-on-sheet': t.placeViewOnSheet,
    'edit-sheet': t.editSheet,
    'define-material': t.defineMaterial,
    'edit-material': t.editMaterial,
  };

  /**
   * Duck-type check for a Transaction object.
   * @param {*} o
   * @returns {boolean}
   */
  function isTransaction(o) {
    return !!o &&
      typeof o.type === 'string' &&
      typeof o.apply === 'function' &&
      typeof o.unapply === 'function';
  }

  t.registry = new Map(Object.keys(FACTORIES).map(function (type) {
    return [type, FACTORIES[type]];
  }));
  t.types = Object.freeze(Object.keys(FACTORIES));
  t.isTransaction = isTransaction;
})();
