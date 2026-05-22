/**
 * StructDraw v2 · ui · namespace bootstrap
 * LAYER: ui — initialises window.v2.ui.* so every UI module can register
 *        against it without a guard. First v2/ui script loaded.
 * READS:  window.v2
 * WRITES: window.v2.ui
 *
 * Classic <script>, no build step (CLAUDE.md rules 3 & 8). Loading this file
 * has no side effect beyond defining the namespace.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.ui = v2.ui || {};
})();
