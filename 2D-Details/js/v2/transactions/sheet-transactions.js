/**
 * StructDraw v2 · Transactions · sheet transactions
 * LAYER: model · transactions — create a Sheet / place a View on a Sheet / edit a Sheet.
 * READS:  window.v2.model.{makeSheet, makeSheetPlacement, emptyDirtySet}
 * WRITES: window.v2.transactions.{createSheet, placeViewOnSheet, editSheet}
 *
 * Classic <script>, no build step. placeViewOnSheet pushes a SheetPlacement and
 * removes that exact object (by reference) on unapply, so the placements array
 * round-trips precisely. See 03-model-layer.md §§6, 8.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.transactions = v2.transactions || {};
  const hasOwn = Object.prototype.hasOwnProperty;

  function sheetDirty(sheetId, viewId) {
    const ds = v2.model.emptyDirtySet();
    if (sheetId != null) ds.sheets.add(sheetId);
    if (viewId != null) ds.views.add(viewId);
    return ds;
  }

  /**
   * Create a transaction that adds a new Sheet.
   * @param {object} sheetSpec  forwarded to v2.model.makeSheet (mints the id)
   * @returns {Transaction}
   */
  function createSheet(sheetSpec) {
    const sheet = v2.model.makeSheet(sheetSpec);
    return {
      type: 'create-sheet',
      description: 'Create sheet ' + (sheet.name || sheet.id),
      data: { sheet: sheet },
      apply: function (model) {
        model.sheets.set(sheet.id, sheet);
        return sheetDirty(sheet.id, null);
      },
      unapply: function (model) {
        model.sheets.delete(sheet.id);
        return sheetDirty(sheet.id, null);
      },
    };
  }

  /**
   * Create a transaction that places a View onto a Sheet. A no-op when the
   * sheet is not present at apply time.
   * @param {string} sheetId
   * @param {string} viewId
   * @param {object} [placementSpec]  originOnSheet / rotation / clipBoundary
   * @returns {Transaction}
   */
  function placeViewOnSheet(sheetId, viewId, placementSpec) {
    const placement = v2.model.makeSheetPlacement(
      Object.assign({}, placementSpec || {}, { viewId: viewId })
    );
    let applied = false;
    return {
      type: 'place-view-on-sheet',
      description: 'Place a view on sheet ' + sheetId,
      data: { sheetId: sheetId, viewId: viewId, placement: placement },
      apply: function (model) {
        const sheet = model.sheets.get(sheetId);
        if (!sheet) return v2.model.emptyDirtySet();
        sheet.placements.push(placement);
        applied = true;
        return sheetDirty(sheetId, viewId);
      },
      unapply: function (model) {
        const sheet = model.sheets.get(sheetId);
        if (!sheet || !applied) return v2.model.emptyDirtySet();
        const idx = sheet.placements.indexOf(placement);
        if (idx !== -1) sheet.placements.splice(idx, 1);
        return sheetDirty(sheetId, viewId);
      },
    };
  }

  /**
   * Create a transaction that patches a Sheet's fields. A no-op when the id is
   * not present at apply time.
   * @param {string} sheetId
   * @param {Object} changes
   * @returns {Transaction}
   */
  function editSheet(sheetId, changes) {
    if (changes && hasOwn.call(changes, 'id')) {
      throw new Error('editSheet: a sheet id cannot be changed');
    }
    const keys = changes ? Object.keys(changes) : [];
    let prior = null;
    let applied = false;
    return {
      type: 'edit-sheet',
      description: 'Edit sheet ' + sheetId,
      data: { sheetId: sheetId, changes: changes },
      apply: function (model) {
        const sheet = model.sheets.get(sheetId);
        if (!sheet) return v2.model.emptyDirtySet();
        prior = keys.map(function (k) {
          return { key: k, had: hasOwn.call(sheet, k), value: sheet[k] };
        });
        for (let i = 0; i < keys.length; i++) sheet[keys[i]] = changes[keys[i]];
        applied = true;
        return sheetDirty(sheetId, null);
      },
      unapply: function (model) {
        const sheet = model.sheets.get(sheetId);
        if (!sheet || !applied) return v2.model.emptyDirtySet();
        for (let i = 0; i < prior.length; i++) {
          const p = prior[i];
          if (p.had) sheet[p.key] = p.value;
          else delete sheet[p.key];
        }
        return sheetDirty(sheetId, null);
      },
    };
  }

  v2.transactions.createSheet      = createSheet;
  v2.transactions.placeViewOnSheet = placeViewOnSheet;
  v2.transactions.editSheet        = editSheet;
})();
