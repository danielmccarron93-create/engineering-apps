/*
 * Vitest setup — loads the StructDraw classic <script> files into the JSDOM
 * window so the v2 test files can exercise window.v2.* exactly as a browser
 * would.
 *
 * FOUR groups load here, in order:
 *
 *  0. Three.js r128 (Phase 0g). Vitest can `import` the npm `three` package
 *     (devDependency pinned to 0.128.0 — see package.json) and republish the
 *     namespace as `globalThis.THREE`, exactly the way a browser's CDN
 *     `<script src="three.min.js">` does. Loaded FIRST because v2 render/
 *     threejs files reference `THREE.Scene` / `THREE.Group` etc. at top level.
 *
 *  1. v1 catalogue DATA files (js/02*.js, js/03-data-bolts.js). The v2
 *     catalogue layer imports these rather than duplicating them
 *     (04-catalogue-system.md §11). v1 declares each catalogue as a bare
 *     top-level `const` (UB_DB, HBS_PLATE_SCREWS, …) — NOT window.*. In a
 *     browser all classic <script>s share one global scope, so a later v2
 *     script sees the bare const; but indirect eval gives each file its own
 *     scope, so the const would not survive. For each v1 data file we append
 *     explicit `globalThis.X = X;` assignments — evaluated in the SAME eval,
 *     where the const is in scope — which republishes the data as a global the
 *     v2 catalogue scripts resolve. No v1 source file is modified.
 *
 *  2. The v2 model + transactions layer (Phase 0b).
 *  3. The v2 catalogue + io + engine + render layers (Phases 0c–0g).
 *
 * Groups 2 & 3 are classic scripts that publish on window.v2.* directly, so
 * plain indirect eval suffices. Vitest runs setupFiles once per test file (each
 * in a fresh JSDOM), so every test file gets its own clean window.v2.
 */
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// --- Group 0: Three.js r128 -------------------------------------------------
// Republish the npm package onto globalThis so the v2 threejs scripts (which
// reference `THREE.Scene`, `THREE.ExtrudeGeometry`, etc.) resolve the same way
// they do in the browser. Pinned to r128 per CLAUDE.md rule 6.
globalThis.THREE = THREE;

const HERE = dirname(fileURLToPath(import.meta.url));
const V2_ROOT = resolve(HERE, '../../js/v2');
const V1_ROOT = resolve(HERE, '../../js');

// --- Group 1: v1 catalogue data --------------------------------------------
// [file, [bare-const names to republish onto globalThis]]. Order matters:
// 03-data-bolts.js reads UB_DB / UC_DB / WB_DB defined by 02-data-sections.js.
const V1_DATA = [
  ['02-data-sections.js',
    ['UB_DB', 'WB_DB', 'UC_DB', 'SHS_DB', 'PFC_DB', 'RHS_DB', 'CHS_DB', 'EA_DB', 'UA_DB']],
  ['02b-data-timber.js',
    ['TIMBER_CLASSES', 'TIMBER_SECTIONS', 'K_MOD', 'GAMMA_M_CONNECTIONS',
     'SERVICE_CLASSES', 'LOAD_DURATIONS', 'TIMBER_DEFAULTS']],
  ['02c-data-screws.js',
    ['HBS_PLATE_SCREWS', 'SCREW_SYSTEMS', 'DEFAULT_SCREW_SPEC', 'HBS_LENGTHS_BY_D']],
  ['02d-data-rothoblaas-rules.js',
    ['ROTHOBLAAS_RULESETS', 'ROTHOBLAAS_NEF_TABLE', 'ROTHOBLAAS_CAPACITY_TABLES',
     'ROTHOBLAAS_RULESET_VERSION', 'PLATE_THICKNESS_CATEGORY']],
  ['03-data-bolts.js',
    ['BOLT_DB', 'BOLT_LENGTHS', 'DASH', 'LW', 'CONN_DEFAULTS']],
];

for (const [rel, names] of V1_DATA) {
  const code = readFileSync(resolve(V1_ROOT, rel), 'utf8');
  const exportsSnippet = names.map((n) => 'globalThis.' + n + ' = ' + n + ';').join('');
  // The appended assignments run in the same eval as the file body, so the
  // file's top-level `const`s are in scope to be republished onto globalThis.
  (0, eval)(code + '\n;' + exportsSnippet + '\n//# sourceURL=js/' + rel + '\n');
}

// --- Groups 2 & 3: v2 source — identical order to the <script> tags in
// index.html. The catalogues/ block is Phase 0c.
const LOAD_ORDER = [
  '_namespace.js',
  'model/id.js',
  'model/geometry.js',
  'model/element.js',
  'model/material.js',
  'model/view.js',
  'model/sheet.js',
  'model/model.js',
  'transactions/place-element.js',
  'transactions/delete-element.js',
  'transactions/move-element.js',
  'transactions/edit-element.js',
  'transactions/batch.js',
  'transactions/view-transactions.js',
  'transactions/sheet-transactions.js',
  'transactions/material-transactions.js',
  'transactions/index.js',
  // --- catalogue layer (Phase 0c) — _catalogue-namespace first, index.js last
  'catalogues/_catalogue-namespace.js',
  'catalogues/categories.js',
  'catalogues/hatches.js',
  'catalogues/line-styles.js',
  'catalogues/lineweights.js',
  'catalogues/families/annotation-detail-callout.js',
  'catalogues/families/annotation-dimension.js',
  'catalogues/families/annotation-leader.js',
  'catalogues/families/annotation-revision.js',
  'catalogues/families/annotation-section-mark.js',
  'catalogues/families/annotation-tag.js',
  'catalogues/families/beam-chs.js',
  'catalogues/families/beam-clt.js',
  'catalogues/families/beam-custom-rect.js',
  'catalogues/families/beam-ea.js',
  'catalogues/families/beam-glt.js',
  'catalogues/families/beam-pfc.js',
  'catalogues/families/beam-rhs.js',
  'catalogues/families/beam-shs.js',
  'catalogues/families/beam-ua.js',
  'catalogues/families/beam-ub.js',
  'catalogues/families/beam-uc.js',
  'catalogues/families/beam-wb.js',
  'catalogues/families/detail-component-breakline.js',
  'catalogues/families/detail-component-slot.js',
  'catalogues/families/detail-component-weld-symbol.js',
  'catalogues/families/fastener-anchor-bolt.js',
  'catalogues/families/fastener-as1252-bolt.js',
  'catalogues/families/fastener-rothoblaas-hbs.js',
  'catalogues/families/fastener-shear-stud.js',
  'catalogues/families/masonry-cmu.js',
  'catalogues/families/plate-flat.js',
  'catalogues/families/reinforcement-bar.js',
  'catalogues/families/reinforcement-mesh.js',
  'catalogues/families/sheet-titleblock.js',
  'catalogues/families/index.js',
  'catalogues/materials/bolt-as1252-grade-10.9.js',
  'catalogues/materials/bolt-as1252-grade-8.8.js',
  'catalogues/materials/concrete-n20.js',
  'catalogues/materials/concrete-n25.js',
  'catalogues/materials/concrete-n32.js',
  'catalogues/materials/concrete-n40.js',
  'catalogues/materials/concrete-n50.js',
  'catalogues/materials/masonry-cmu190.js',
  'catalogues/materials/reinforcement-n500.js',
  'catalogues/materials/screw-galv-grade-c1022.js',
  'catalogues/materials/steel-s275.js',
  'catalogues/materials/steel-s300.js',
  'catalogues/materials/steel-s355.js',
  'catalogues/materials/timber-clt-c24.js',
  'catalogues/materials/timber-gl18h.js',
  'catalogues/materials/timber-gl22h.js',
  'catalogues/materials/timber-mgp10.js',
  'catalogues/materials/timber-mgp12.js',
  'catalogues/materials/index.js',
  'catalogues/rules/as1720/cl3-2-bending.js',
  'catalogues/rules/as1720/cl4-4-modification-factors.js',
  'catalogues/rules/as4100/cl5-2-member-moment-capacity.js',
  'catalogues/rules/as4100/cl9-3-bolted-connections.js',
  'catalogues/rules/as4100/cl9-7-fillet-welds.js',
  'catalogues/rules/eta-11-0030/min-distances.js',
  'catalogues/rules/eta-11-0030/tab7-axial-withdrawal.js',
  'catalogues/rules/eta-11-0030/tab8-lateral-capacity.js',
  'catalogues/rules/index.js',
  'catalogues/index.js',
  // --- io + engine layer (Phases 0d + 0e) — appState + dirty-bus + migrator
  //     + io scaffold (serialise / deserialise / save / load), then the
  //     v1-bridge, then init.js last (same order as index.html).
  'appState.js',
  'engine/dirty-bus.js',
  'io/migrations/v1-to-v2.js',
  'io/serialise.js',
  'io/deserialise.js',
  'io/save.js',
  'io/load.js',
  'engine/v1-bridge.js',
  'engine/init.js',
  // --- render layer (Phase 0f) — namespace first, then primitives (data only),
  //     then view helpers and render-context (build the per-element ctx), then
  //     the canvas2d backend + dispatch table, then the worked draw + hit-test
  //     files that self-register into the dispatch tables on load.
  'render/_render-namespace.js',
  'render/primitives/line.js',
  'render/primitives/polyline.js',
  'render/primitives/polygon.js',
  'render/primitives/arc.js',
  'render/primitives/text.js',
  'render/primitives/hatch.js',
  'render/view-helpers.js',
  'render/render-context.js',
  'render/canvas2d/backend.js',
  'render/canvas2d/index.js',
  'render/canvas2d/draw-beam-ub.js',
  'render/canvas2d/draw-beam-shs.js',
  'render/canvas2d/draw-plate.js',
  'render/canvas2d/draw-fastener-as1252-bolt.js',
  'render/canvas2d/hit-test-linear.js',
  'render/canvas2d/hit-test-plate.js',
  // --- threejs renderer (Phase 0g) — engine + materials before index, index
  //     before mesh builders. Mirrors the canvas2d order (`backend.js` →
  //     `index.js` → draw fns). The renderer outputs to a HIDDEN scene; the
  //     user-facing iso block keeps using v1's js/64-3d-engine.js through
  //     Phase 0g and only swaps over when the Phase 1 pilot makes plates
  //     v2-authoritative.
  'render/threejs/engine.js',
  'render/threejs/materials.js',
  'render/threejs/index.js',
  'render/threejs/build-mesh-beam-ub.js',
  'render/threejs/build-mesh-beam-shs.js',
  'render/threejs/build-mesh-plate.js',
  'render/threejs/build-mesh-fastener-as1252-bolt.js',
];

for (const rel of LOAD_ORDER) {
  const code = readFileSync(resolve(V2_ROOT, rel), 'utf8');
  // Indirect eval: executes the classic script in global scope. The script's
  // `window.v2.* = ...` assignments populate the JSDOM window the tests see.
  // The sourceURL keeps stack traces pointing at the real file.
  (0, eval)(code + '\n//# sourceURL=js/v2/' + rel + '\n');
}
