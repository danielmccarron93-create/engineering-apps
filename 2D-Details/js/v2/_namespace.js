/**
 * StructDraw v2 · namespace root
 * LAYER: v2 root — initialises the window.v2.* namespace. First v2 script loaded.
 * READS:  window.v2 (if a prior script created it)
 * WRITES: window.v2, window.v2.model, window.v2.transactions, window.v2.BUILD
 *
 * Classic <script>, no build step (CLAUDE.md workflow rules 3 & 8). Loading this
 * file — and every other js/v2/ file — has NO side effect beyond defining the
 * namespace and its pure factory functions. v1 stays authoritative for the running
 * app until a later phase wires v2 in.
 * See PlannedBuilds/architecture-v2/03-model-layer.md §11.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.model = v2.model || {};
  v2.transactions = v2.transactions || {};
  v2.BUILD = v2.BUILD || {
    architecture: 'v2',
    phase: '0b',
    layers: ['model', 'transactions'],
    note: 'Model-layer scaffold. v1 remains authoritative for the running app.',
  };
})();
