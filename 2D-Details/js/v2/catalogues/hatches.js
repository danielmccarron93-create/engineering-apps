/**
 * StructDraw v2 · Catalogue Layer · hatch patterns
 * LAYER: catalogue — every hatch pattern in one place. Pure data.
 * READS:  window.v2
 * WRITES: window.v2.hatches.{HATCH_PATTERNS, get, names}
 *
 * Classic <script>, no build step. Materials reference a pattern by name;
 * renderers render it by name. This is the v2 unification of the scattered v1
 * hatch implementations (26-as1100-hatch.js, 67-v25-materials.js, inline draws).
 * See 04-catalogue-system.md §7.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.hatches = v2.hatches || {};

  /** Hatch pattern definitions. `weight` is a lineweights.js key. */
  const HATCH_PATTERNS = {
    'as1100-steel-45': {
      type: 'crosshatch', angle: 45, spacing: 2.0, weight: 'fine', color: 'inherit',
    },
    'as1100-steel-90': {
      type: 'crosshatch', angle: -45, spacing: 2.0, weight: 'fine', color: 'inherit',
    },
    'concrete-dot': {
      type: 'dot', spacing: 1.5, radius: 0.25, weight: 'fine', color: 'inherit',
    },
    'concrete-cross-cross': {
      type: 'composite',
      layers: [
        { type: 'crosshatch', angle: 45, spacing: 3 },
        { type: 'crosshatch', angle: -45, spacing: 3 },
      ],
    },
    'timber-grain-horizontal': {
      type: 'lines', angle: 0, spacing: 1.0, weight: 'fine', jitter: 0.2, color: 'inherit',
    },
    'timber-grain-vertical': {
      type: 'lines', angle: 90, spacing: 1.0, weight: 'fine', jitter: 0.2, color: 'inherit',
    },
    'masonry-running-bond': {
      type: 'pattern', tile: 'masonry-cmu-190-running-bond.svg', scale: 1.0,
    },
    'earth-zigzag': {
      type: 'lines', angle: -45, spacing: 3, weight: 'fine', style: 'zigzag',
    },
    'none': { type: 'none' },
  };

  v2.hatches.HATCH_PATTERNS = HATCH_PATTERNS;

  /** @param {string} name @returns {?object} */
  v2.hatches.get = function (name) {
    return Object.prototype.hasOwnProperty.call(HATCH_PATTERNS, name) ? HATCH_PATTERNS[name] : null;
  };

  /** @returns {string[]} */
  v2.hatches.names = function () { return Object.keys(HATCH_PATTERNS); };
})();
