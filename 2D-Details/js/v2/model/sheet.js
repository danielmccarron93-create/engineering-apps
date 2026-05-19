/**
 * StructDraw v2 · Model Layer · sheet
 * LAYER: model — the Sheet shape (a composition of View placements), its factory
 *        and placement helpers.
 * READS:  window.v2.model.newSheetId
 * WRITES: window.v2.model.{makeSheet, makeSheetPlacement, addPlacement, SHEET_SIZES}
 *
 * Classic <script>, no build step. Pure data + pure functions — no DOM.
 * A Sheet is a layout: up to N View placements plus a title block. The same
 * View can appear on multiple Sheets. See 03-model-layer.md §6.
 *
 * --- JSDoc shapes ----------------------------------------------------------
 * @typedef {'A0'|'A1'|'A2'|'A3'|'A4'|'custom'} SheetSize
 *
 * @typedef {object} SheetPlacement
 * @property {string}    viewId
 * @property {Point2D}   originOnSheet   paper-mm
 * @property {number}    rotation
 * @property {Point2D[]} [clipBoundary]  non-rectangular detail callouts
 *
 * @typedef {object} Sheet
 * @property {string}          id
 * @property {string}          name
 * @property {SheetSize}       size
 * @property {SheetPlacement[]} placements
 * @property {?Object}         titleBlock
 * @property {Object[]}        revisions
 * ---------------------------------------------------------------------------
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.model = v2.model || {};

  const SHEET_SIZES = Object.freeze(['A0', 'A1', 'A2', 'A3', 'A4', 'custom']);

  function num(n) { return typeof n === 'number' && isFinite(n) ? n : 0; }

  /**
   * Construct a SheetPlacement plain object. Idempotent — passing an existing
   * placement back through simply re-normalises it.
   * @param {object} spec
   * @returns {SheetPlacement}
   */
  function makeSheetPlacement(spec) {
    spec = spec || {};
    if (spec.viewId == null) {
      throw new Error('makeSheetPlacement: viewId is required');
    }
    const pl = {
      viewId: spec.viewId,
      originOnSheet: spec.originOnSheet
        ? { x: num(spec.originOnSheet.x), y: num(spec.originOnSheet.y) }
        : { x: 0, y: 0 },
      rotation: num(spec.rotation),
    };
    if (Array.isArray(spec.clipBoundary)) {
      pl.clipBoundary = spec.clipBoundary.map(function (p) {
        return { x: num(p && p.x), y: num(p && p.y) };
      });
    }
    return pl;
  }

  /**
   * Construct a Sheet plain object. An id is minted when not supplied.
   * @param {object} spec
   * @returns {Sheet}
   */
  function makeSheet(spec) {
    spec = spec || {};
    return {
      id: spec.id != null ? spec.id : v2.model.newSheetId(),
      name: spec.name != null ? spec.name : '',
      size: spec.size != null ? spec.size : 'A1',
      placements: Array.isArray(spec.placements)
        ? spec.placements.map(makeSheetPlacement)
        : [],
      titleBlock: spec.titleBlock != null ? spec.titleBlock : null,
      revisions: Array.isArray(spec.revisions) ? spec.revisions.slice() : [],
    };
  }

  /**
   * Return a new Sheet with one extra placement appended (pure — the input
   * Sheet is not mutated). Sheet transactions mutate the placements array in
   * place for precise undo; this helper is for non-transaction callers.
   * @param {Sheet} sheet
   * @param {object} placementSpec
   * @returns {Sheet}
   */
  function addPlacement(sheet, placementSpec) {
    return Object.assign({}, sheet, {
      placements: sheet.placements.concat([makeSheetPlacement(placementSpec)]),
    });
  }

  v2.model.SHEET_SIZES       = SHEET_SIZES;
  v2.model.makeSheetPlacement = makeSheetPlacement;
  v2.model.makeSheet         = makeSheet;
  v2.model.addPlacement      = addPlacement;
})();
