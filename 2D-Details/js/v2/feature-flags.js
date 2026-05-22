/**
 * StructDraw v2 · feature-flags
 * LAYER: root — runtime feature flags read by every v2 layer that needs to
 *        decide "am I authoritative for this family yet?". The Phase 1 pilot
 *        introduces `useV2For.plates`; Phase 3 will add `useV2For.bolts`; the
 *        full migration sweep (Phases 4-13) lights one flag per family until
 *        Phase ∞ retires the table.
 * READS:  (nothing)
 * WRITES: window.v2.featureFlags
 *
 * Classic <script>, no build step (CLAUDE.md rules 3 & 8). Loading this file
 * only defines the namespace; it has NO effect on the running app until a flag
 * is flipped.
 *
 * Flags default OFF — Phase 1 ships with `useV2For.plates = false` so Dan's
 * daily-use browser behaviour is byte-identical to today. Dan flips a flag
 * manually in DevTools for soak:
 *
 *     v2.featureFlags.set('plates', true)
 *
 * The setter emits `feature-flags-changed` on the dirty bus (when present) so
 * the live integration hooks can re-render the relevant UI surfaces.
 * See PlannedBuilds/architecture-v2/08-pilot-feature.md §4.10 and
 *     PlannedBuilds/architecture-v2/09-build-plan.md "Phase 1".
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});

  /** The complete set of recognised family flags. Keys here ARE the API. */
  const FLAG_KEYS = ['plates'];

  /** The mutable per-family authority map. Keys are family-area names. */
  const useV2For = { plates: false };

  function isKnownKey(key) { return FLAG_KEYS.indexOf(key) !== -1; }

  /**
   * Read a flag. Returns false (never undefined) for an unknown key so
   * call-sites can guard with a single `if (v2.featureFlags.get('plates'))`.
   * @param {string} key
   * @returns {boolean}
   */
  function get(key) {
    if (!isKnownKey(key)) return false;
    return useV2For[key] === true;
  }

  /**
   * Flip a flag and announce the change. Returns the new value. Unknown keys
   * are rejected — feature flags are not a free-form key/value store, they are
   * a declared switchboard so a typo (`'plate'` vs `'plates'`) is loud.
   * @param {string} key
   * @param {boolean} value
   * @returns {boolean}
   */
  function set(key, value) {
    if (!isKnownKey(key)) {
      throw new Error('v2.featureFlags.set: unknown flag "' + key +
        '" (expected one of: ' + FLAG_KEYS.join(', ') + ')');
    }
    const next = value === true;
    const changed = useV2For[key] !== next;
    useV2For[key] = next;
    if (changed && v2.engine && v2.engine.dirtyBus &&
        typeof v2.engine.dirtyBus.emit === 'function') {
      v2.engine.dirtyBus.emit('feature-flags-changed', { key: key, value: next });
    }
    return next;
  }

  /** A frozen snapshot of the current flag state — for diagnostics. */
  function snapshot() { return Object.assign({}, useV2For); }

  v2.featureFlags = {
    FLAG_KEYS: FLAG_KEYS.slice(),
    useV2For: useV2For,
    get: get,
    set: set,
    snapshot: snapshot,
  };
})();
