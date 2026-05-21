/**
 * StructDraw v2 · Engine Layer · dirty bus
 * LAYER: engine — a tiny synchronous publish/subscribe bus for model-dirty
 *        events. The Phase 0d v1-bridge emits on it after every shadow sync;
 *        later phases (renderer, inspector, autosave) subscribe.
 * READS:  (nothing)
 * WRITES: window.v2.engine.dirtyBus
 *
 * Classic <script>, no build step (CLAUDE.md rules 3 & 8). Pure — no DOM, no
 * canvas. Loading this file only creates the bus object; it has no side effect
 * on the running app. A handler that throws is isolated (logged, then skipped)
 * so one bad subscriber cannot break the sync path or the other subscribers.
 * See 07-migration-strategy.md §1 ("the v2 layer maintains a parallel model").
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.engine = v2.engine || {};

  // event name -> ordered list of handler functions
  const channels = new Map();

  function listFor(event) {
    let list = channels.get(event);
    if (!list) { list = []; channels.set(event, list); }
    return list;
  }

  /**
   * Subscribe to an event.
   * @param {string} event
   * @param {Function} handler
   * @returns {Function} an unsubscribe function (idempotent)
   */
  function on(event, handler) {
    if (typeof event !== 'string' || typeof handler !== 'function') {
      throw new Error('dirtyBus.on(event, handler): a string event and a function handler are required');
    }
    listFor(event).push(handler);
    return function off() { offHandler(event, handler); };
  }

  /**
   * Unsubscribe a handler (a no-op if it was never subscribed).
   * @param {string} event
   * @param {Function} handler
   */
  function offHandler(event, handler) {
    const list = channels.get(event);
    if (!list) return;
    const i = list.indexOf(handler);
    if (i !== -1) list.splice(i, 1);
  }

  /**
   * Publish an event to every current subscriber, in subscription order. The
   * handler list is snapshotted first, so a handler that subscribes or
   * unsubscribes during dispatch does not disturb the in-flight delivery.
   * @param {string} event
   * @param {*} [payload]
   * @returns {number} how many handlers received the event
   */
  function emit(event, payload) {
    const list = channels.get(event);
    if (!list || !list.length) return 0;
    const snapshot = list.slice();
    for (let i = 0; i < snapshot.length; i++) {
      try {
        snapshot[i](payload);
      } catch (e) {
        if (window.console && console.error) {
          console.error('[v2.engine.dirtyBus] handler for "' + event + '" threw:', e);
        }
      }
    }
    return snapshot.length;
  }

  /**
   * Remove all handlers for one event, or — with no argument — every handler
   * on every event. Used by tests for a clean slate.
   * @param {string} [event]
   */
  function clear(event) {
    if (event === undefined) channels.clear();
    else channels.delete(event);
  }

  /** @param {string} event @returns {number} current handler count */
  function handlerCount(event) {
    const list = channels.get(event);
    return list ? list.length : 0;
  }

  v2.engine.dirtyBus = {
    on: on,
    off: offHandler,
    emit: emit,
    clear: clear,
    handlerCount: handlerCount,
  };
})();
