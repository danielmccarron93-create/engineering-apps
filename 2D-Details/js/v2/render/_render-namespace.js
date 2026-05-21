/**
 * StructDraw v2 · Render Layer · namespace
 * LAYER: render — initialises the v2 render namespaces. First render script
 *        loaded; the primitives + backend + dispatch-table files self-register
 *        into the slots created here.
 * READS:  window.v2 (created by _namespace.js)
 * WRITES: window.v2.render.{primitives, canvas2d, threejs}
 *
 * Classic <script>, no build step (CLAUDE.md rules 3 & 8). The render layer is
 * a consumer of the model + catalogue layers — it queries the model, resolves
 * a Render Context from the catalogues and emits backend-agnostic primitives
 * that a backend (canvas2d today; threejs in Phase 0g) translates into pixels
 * or meshes. The user-facing v1 canvas keeps using v1's draw functions through
 * Phase 0f — this layer outputs to a hidden test canvas only.
 * See PlannedBuilds/architecture-v2/05-render-pipeline.md.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});

  v2.render            = v2.render            || {};
  v2.render.primitives = v2.render.primitives || {};
  v2.render.canvas2d   = v2.render.canvas2d   || {};
  v2.render.threejs    = v2.render.threejs    || {};

  // Keep the BUILD stamp truthful as the render layer comes online.
  if (v2.BUILD) {
    v2.BUILD.phase = '0f';
    if (Array.isArray(v2.BUILD.layers) && v2.BUILD.layers.indexOf('render') === -1) {
      v2.BUILD.layers.push('render');
    }
    v2.BUILD.note = 'Model + transactions + catalogue + io + render scaffold layers. v1 still authoritative for the running app.';
  }
})();
