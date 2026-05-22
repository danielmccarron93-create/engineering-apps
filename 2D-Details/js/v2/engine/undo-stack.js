/**
 * StructDraw v2 · Engine Layer · undo stack
 * LAYER: engine — `applyTransaction`, `undo`, `redo`. The transactional spine
 *        of the v2 model: every mutation goes through here so undo/redo and
 *        autosave come for free. See 06-tools-and-transactions.md §5.
 * READS:  window.v2.model.applyTransaction; window.v2.appState;
 *           window.v2.engine.dirtyBus (optional emitter)
 * WRITES: window.v2.engine.undoStack with:
 *           applyTransaction(tx) -> {newModel, dirty}
 *           undo() / redo()
 *           canUndo() / canRedo()
 *           clear() / depth() / lastTransaction()
 *
 * Classic <script>, no build step (CLAUDE.md rules 3 & 8). Loading this file
 * only creates the namespace; no globals are wrapped. The implementation
 * mirrors 06-tools-and-transactions.md §5 — constant-time undo regardless of
 * model size, because we replay the transaction's apply/unapply closures
 * rather than snapshotting the whole element store.
 *
 * --- Why this exists alongside v1's undo ----------------------------------
 * v1's `undo()` (js/05-state.js) snapshots the whole entity store before each
 * tool action — gets slower as the model grows, and is incompatible with the
 * v2 transactional shape. Phase 1 keeps both stacks live in parallel:
 *   - A v1 mutation (addObj / addEnt2D / etc.) pushes to v1's stack.
 *   - A v2 transaction (placeElement / editElement / etc.) pushes here.
 *   - Ctrl+Z by default still hits v1's undo; the v2 stack is exposed via
 *     `v2.engine.undoStack.undo()` (consoles, tests, future wraps).
 * Phase 2's "retire v1 plate path" removes plates from v1's stack, so the
 * v2 plate's Ctrl+Z journey is unambiguous. Phase ∞ unifies into one stack.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.engine = v2.engine || {};

  /** Two stacks of `{tx, dirty}` entries. Newest at the end. */
  const undoEntries = [];
  const redoEntries = [];

  function emit(event, payload) {
    if (v2.engine && v2.engine.dirtyBus &&
        typeof v2.engine.dirtyBus.emit === 'function') {
      v2.engine.dirtyBus.emit(event, payload);
    }
  }

  function currentModel() {
    return (v2.appState && v2.appState.model) || null;
  }

  function publishModel(newModel) {
    if (v2.appState) v2.appState.model = newModel;
  }

  /**
   * Apply a transaction, push it onto the undo stack, clear the redo stack
   * and announce the new model on the dirty bus. Returns the produced model
   * + dirty set so the caller (a tool) can react if it wants.
   * @param {Transaction} tx
   * @returns {{newModel:StructuralModel, dirty:DirtySet}}
   */
  function applyTransaction(tx) {
    const model = currentModel();
    if (!model) throw new Error('undoStack.applyTransaction: appState.model is not initialised');
    if (!tx || typeof tx.apply !== 'function' || typeof tx.unapply !== 'function') {
      throw new Error('undoStack.applyTransaction: a Transaction with apply + unapply is required');
    }
    const result = v2.model.applyTransaction(model, tx);
    publishModel(result.newModel);
    undoEntries.push({ tx: tx, dirty: result.dirty });
    redoEntries.length = 0;     // any new edit clears the redo stack
    emit('model-changed', {
      source: 'undo-stack', action: 'apply', tx: tx.type,
      model: result.newModel, dirty: result.dirty,
    });
    if (v2.engine.autosave && typeof v2.engine.autosave.markDirty === 'function') {
      v2.engine.autosave.markDirty();
    }
    return result;
  }

  /**
   * Pop the most recent transaction off the undo stack and unapply it. A no-op
   * (returns null) when the stack is empty.
   * @returns {?{newModel:StructuralModel, dirty:DirtySet}}
   */
  function undo() {
    if (!undoEntries.length) return null;
    const model = currentModel();
    if (!model) return null;
    const entry = undoEntries.pop();
    // Build a new model snapshot before mutating — mirrors applyTransaction's
    // "newModel is a fresh shallow copy" semantics so versions still bump and
    // listeners see a different reference. (The Map shallow-copy means
    // entry.tx.unapply mutates the snapshot only, never the prior model.)
    const newModel = {
      schemaVersion: model.schemaVersion,
      project: model.project,
      version: (typeof model.version === 'number' ? model.version : 0) + 1,
      elements:  new Map(model.elements),
      materials: new Map(model.materials),
      views:     new Map(model.views),
      sheets:    new Map(model.sheets),
    };
    const dirty = entry.tx.unapply(newModel);
    publishModel(newModel);
    redoEntries.push(entry);
    emit('model-changed', {
      source: 'undo-stack', action: 'undo', tx: entry.tx.type,
      model: newModel, dirty: dirty,
    });
    if (v2.engine.autosave && typeof v2.engine.autosave.markDirty === 'function') {
      v2.engine.autosave.markDirty();
    }
    return { newModel: newModel, dirty: dirty };
  }

  /**
   * Pop the most recent un-applied transaction off the redo stack and apply
   * it again. A no-op (returns null) when the stack is empty.
   * @returns {?{newModel:StructuralModel, dirty:DirtySet}}
   */
  function redo() {
    if (!redoEntries.length) return null;
    const model = currentModel();
    if (!model) return null;
    const entry = redoEntries.pop();
    const result = v2.model.applyTransaction(model, entry.tx);
    publishModel(result.newModel);
    undoEntries.push({ tx: entry.tx, dirty: result.dirty });
    emit('model-changed', {
      source: 'undo-stack', action: 'redo', tx: entry.tx.type,
      model: result.newModel, dirty: result.dirty,
    });
    if (v2.engine.autosave && typeof v2.engine.autosave.markDirty === 'function') {
      v2.engine.autosave.markDirty();
    }
    return result;
  }

  function canUndo() { return undoEntries.length > 0; }
  function canRedo() { return redoEntries.length > 0; }
  function depth()   { return { undo: undoEntries.length, redo: redoEntries.length }; }
  function lastTransaction() {
    return undoEntries.length ? undoEntries[undoEntries.length - 1].tx : null;
  }
  function clear() { undoEntries.length = 0; redoEntries.length = 0; }

  v2.engine.undoStack = {
    applyTransaction: applyTransaction,
    undo: undo,
    redo: redo,
    canUndo: canUndo,
    canRedo: canRedo,
    depth: depth,
    lastTransaction: lastTransaction,
    clear: clear,
  };

  // Convenience aliases that match 06-tools-and-transactions.md §5's signatures.
  v2.engine.applyTransaction = applyTransaction;
})();
