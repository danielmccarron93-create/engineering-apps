/**
 * StructDraw v2 · tools · namespace bootstrap
 * LAYER: tools — initialises window.v2.tools.* so every tool file can
 *        register against `v2.tools` and `v2.engine.registerTool` without a
 *        guard. First v2/tools script loaded.
 * READS:  window.v2
 * WRITES: window.v2.tools
 *
 * Classic <script>, no build step (CLAUDE.md rules 3 & 8). Loading this file
 * has no side effect beyond defining the namespace. The tool files load AFTER
 * this so they can call `v2.engine.registerTool(Tool)` on top-level eval.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.tools = v2.tools || {};
})();
