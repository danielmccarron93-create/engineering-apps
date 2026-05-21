/**
 * StructDraw v2 · I/O Layer · save (stub for Phase 0e)
 * LAYER: io — assembles the on-disk save payload from a v2 model.
 * READS:  window.v2.io.modelToJSON, window.v2.io.modelToString
 * WRITES: window.v2.io.save (an object with stub-level methods)
 *
 * Classic <script>, no build step (CLAUDE.md rules 3 & 8). Pure — no DOM, no
 * download, no file-system access. The shipped app still writes v1 .sd2.json
 * through `js/46-save-load.js`'s `saveProject` until v2 becomes authoritative.
 *
 * PHASE 0e SCOPE — stub only. This file:
 *   1. Defines the payload shape the post-pilot save path will emit
 *      (`schemaVersion: 2`, full v2 model + a legacy v1 slice for any
 *      family still v1-authoritative — per 07-migration-strategy.md §4).
 *   2. Provides `previewSavePayload(model, v1?)` so other v2 code can see
 *      what a v2 save WILL look like, even before the file write is wired.
 *   3. Provides `saveModelToString(model)` — the pure-data path through the
 *      serialise.js converter. No FileReader, no Blob, no document.createElement.
 *
 * NOT in scope until later phases:
 *   - Replacing `js/46-save-load.js`'s `saveProject` (a Phase 1+ change).
 *   - Round-tripping `weldOverrides` / `mitrePairs` / `priorityForPairV25` /
 *     `sheetInfo` / `blocks` — those are still v1-authoritative slices that
 *     a future migration adds to the v2 model in their natural shape.
 * See 07-migration-strategy.md §4 ("the save-file lifecycle").
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.io = v2.io || {};

  /**
   * Build the on-disk save payload from a v2 model. Optional `v1Slice` carries
   * the v1-authoritative bits that have not migrated yet (objects3D /
   * entities2D / blocks / weldOverrides / etc.); pass null when v2 is fully
   * authoritative. Per 07-migration-strategy.md §4 the v1 slice is dropped at
   * schemaVersion 3 (when v1 retires).
   * @param {StructuralModel} model
   * @param {?object} v1Slice
   * @returns {object}
   */
  function previewSavePayload(model, v1Slice) {
    const payload = {
      schemaVersion: 2,
      v2: v2.io.modelToJSON(model),
    };
    if (v1Slice && typeof v1Slice === 'object') {
      payload.v1 = {
        objects3D:  Array.isArray(v1Slice.objects3D)  ? v1Slice.objects3D  : [],
        entities2D: (v1Slice.entities2D && typeof v1Slice.entities2D === 'object')
          ? v1Slice.entities2D : {},
        blocks:     Array.isArray(v1Slice.blocks)     ? v1Slice.blocks     : [],
      };
      // Optional v1-only fields surface as-is. Phase 0e is read-only on these.
      ['weldOverrides', 'mitrePairs', 'priorityForPairV25', 'sheetInfo',
       'drawingScale', 'gridSize', 'nudgeSize', 'secCutX', 'planCutY'].forEach(function (k) {
        if (v1Slice[k] !== undefined) payload.v1[k] = v1Slice[k];
      });
    }
    return payload;
  }

  /**
   * Convenience: previewSavePayload + JSON.stringify. Two-space pretty-printed
   * to match the v1 file convention. Pure — no Blob, no download.
   * @param {StructuralModel} model
   * @param {?object} v1Slice
   * @returns {string}
   */
  function saveModelToString(model, v1Slice) {
    return JSON.stringify(previewSavePayload(model, v1Slice), null, 2);
  }

  v2.io.save = {
    previewSavePayload: previewSavePayload,
    saveModelToString: saveModelToString,
    // Hook reserved for Phase 1+: a real saveProject replacement attaches here.
    writeFile: null,
  };
})();
