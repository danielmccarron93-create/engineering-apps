/**
 * StructDraw v2 · Tools · tool registry
 * LAYER: tools — re-registers every v2 tool with the engine. Each tool file
 *        already self-registers on load (so a console grep of `v2.engine.TOOLS`
 *        before this file loads still shows the tool); this file's purpose is
 *        to provide a single explicit "all tools loaded" handle for tests +
 *        diagnostics, and to be the load-order sentinel later phases append
 *        new tool files to.
 * READS:  window.v2.tools.* + window.v2.engine.registerTool
 * WRITES: window.v2.tools.registry
 *
 * Classic <script>, no build step (CLAUDE.md rules 3 & 8). Loaded AFTER every
 * tool file. Calling registerAll() is a no-op when the tools have already
 * self-registered (the registry just `.set()`s them again).
 *
 * Phase 1 ships ONE tool — `place-plate`. Phase 3+ extends this list with
 * `place-fastener`, `place-member`, etc. — one line per tool.
 * See PlannedBuilds/architecture-v2/06-tools-and-transactions.md §7.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.tools = v2.tools || {};

  /** Every tool we expect to be present once the v2 scripts have loaded. */
  const KNOWN_TOOL_IDS = ['place-plate'];

  function pickTool(id) {
    // Each tool publishes its plain-object form on v2.tools.<PascalName> AND
    // (via its own helper namespace) on v2.tools.<kebab>. Resolve either.
    if (id === 'place-plate' && v2.tools.PlacePlateTool) return v2.tools.PlacePlateTool;
    return null;
  }

  function registerAll() {
    const out = [];
    if (!v2.engine || typeof v2.engine.registerTool !== 'function') return out;
    for (let i = 0; i < KNOWN_TOOL_IDS.length; i++) {
      const id = KNOWN_TOOL_IDS[i];
      const tool = pickTool(id);
      if (tool) {
        v2.engine.registerTool(tool);
        out.push(id);
      }
    }
    return out;
  }

  /** Diagnostic snapshot of registered tools. */
  function summary() {
    return {
      known: KNOWN_TOOL_IDS.slice(),
      registered: v2.engine && v2.engine.TOOLS instanceof Map
        ? Array.from(v2.engine.TOOLS.keys())
        : [],
    };
  }

  v2.tools.registry = {
    KNOWN_TOOL_IDS: KNOWN_TOOL_IDS.slice(),
    registerAll: registerAll,
    summary: summary,
  };

  // Run once at load — each tool already self-registered, so this is
  // idempotent. The explicit call is a defence against load-order regressions.
  registerAll();
})();
