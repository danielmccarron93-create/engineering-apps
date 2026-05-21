/*
 * StructDraw v2 — Phase 0g ThreeJSRenderer mesh test.
 *
 * JSDOM has no WebGL: `canvas.getContext('webgl')` returns null and r128's
 * WebGLRenderer cannot run. We do NOT need WebGL for this test — the
 * ThreeJSRenderer's job in Phase 0g is to BUILD THE SCENE GRAPH (geometry,
 * meshes, materials, transforms), and the THREE geometry constructors compute
 * vertex data eagerly without WebGL. So this file asserts SCENE-GRAPH SHAPE,
 * not pixels. The Phase 0g build plan calls this out explicitly:
 *
 *   > Test boundary: build meshes for the baseplate fixture … through the v2
 *   > ThreeJSRenderer to a hidden scene. JSDOM has no WebGL, so the test
 *   > asserts SCENE-GRAPH SHAPE not pixels:
 *   >   - The renderer namespace + dispatch table are populated by the script
 *   >     load.
 *   >   - Every Element gets dispatched to exactly one mesh builder (or the
 *   >     category fallback) — none silently vanish.
 *   >   - Each mesh builder produces a THREE.Object3D … with the expected
 *   >     vertex count (proxy for "the geometry is right").
 *   >   - Two consecutive render passes produce STRUCTURALLY IDENTICAL scene
 *   >     graphs (the determinism the Phase 0g exit criterion calls for).
 *   >   - The mesh builder respects the v2 material — mesh.material.color for
 *   >     a steel-s300 element matches the catalogue's resolved colour.
 *
 * The browser-side visual comparison against v1's iso render of the same
 * fixture is Dan's manual smoke-test step. The v2 hidden scene can be made
 * visible via a DevTools console toggle — see the Phase 0g build-chat prompt.
 *
 * window.v2 and globalThis.THREE are populated by tests/v2/setup.mjs.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(HERE, '../../fixtures/v1/baseplate.sdproj');

/** Load the fixture, build the model, render through the elevation view. */
function renderBaseplateOnce() {
  const parsed = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
  const model = window.v2.io.load.fromParsed(parsed);
  const view = model.views.get('v1-view-elevation');
  const renderer = window.v2.render.threejs.ensureThreeJSRenderer({});
  const dispatches = renderer.render(model, view, null);
  return { model: model, view: view, renderer: renderer, dispatches: dispatches };
}

/** Walk an Object3D and return the count of every Mesh / LineSegments + vertex totals. */
function summariseObject(obj) {
  const summary = { meshes: 0, lines: 0, totalVertices: 0, materialNames: [], geometryNames: [] };
  function walk(o) {
    if (!o) return;
    if (o.isMesh) {
      summary.meshes++;
      if (o.geometry && o.geometry.attributes && o.geometry.attributes.position) {
        summary.totalVertices += o.geometry.attributes.position.count;
      }
      if (o.geometry && o.geometry.name) summary.geometryNames.push(o.geometry.name);
      if (o.material && o.material.name) summary.materialNames.push(o.material.name);
    }
    if (o.isLineSegments) {
      summary.lines++;
      if (o.geometry && o.geometry.attributes && o.geometry.attributes.position) {
        summary.totalVertices += o.geometry.attributes.position.count;
      }
    }
    if (o.children && o.children.length) {
      for (let i = 0; i < o.children.length; i++) walk(o.children[i]);
    }
  }
  walk(obj);
  return summary;
}

/** A flat snapshot of every mesh in the renderer — used for determinism. */
function snapshotMeshes(renderer) {
  const out = [];
  // Iteration order is the model's insertion order, which the renderer matches.
  renderer.meshById.forEach(function (obj, id) {
    out.push({
      id: id,
      name: obj.name,
      type: obj.type,
      isGroup: !!obj.isGroup,
      isMesh:  !!obj.isMesh,
      position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
      quaternion: {
        x: obj.quaternion.x, y: obj.quaternion.y,
        z: obj.quaternion.z, w: obj.quaternion.w,
      },
      summary: summariseObject(obj),
    });
  });
  // Sort by elementId so order doesn't depend on Map iteration timing.
  out.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
  return out;
}

describe('Phase 0g — ThreeJSRenderer scaffold renders the baseplate fixture', () => {
  let firstRun;

  beforeAll(() => {
    firstRun = renderBaseplateOnce();
  });

  it('Three.js r128 is available in the JSDOM harness', () => {
    expect(window.THREE).toBeTruthy();
    // r128 publishes the revision as the string '128'.
    expect(String(window.THREE.REVISION)).toBe('128');
    expect(typeof window.THREE.Scene).toBe('function');
    expect(typeof window.THREE.ExtrudeGeometry).toBe('function');
    expect(typeof window.THREE.BoxGeometry).toBe('function');
    expect(typeof window.THREE.CylinderGeometry).toBe('function');
    expect(typeof window.THREE.MeshStandardMaterial).toBe('function');
    expect(typeof window.THREE.Group).toBe('function');
    // Sanity-check the absence of APIs introduced AFTER r128.
    // CapsuleGeometry is r129+; should not exist.
    expect(typeof window.THREE.CapsuleGeometry).toBe('undefined');
  });

  it('the renderer namespace + dispatch table are populated by the script load', () => {
    expect(window.v2.render.threejs).toBeTruthy();
    expect(window.v2.render.threejs.ThreeJSRenderer).toBeTruthy();
    expect(typeof window.v2.render.threejs.ensureThreeJSRenderer).toBe('function');
    const R = window.v2.render.threejs.RENDERERS;
    // Every Canvas2D entry from Phase 0f has a matching Three.js entry.
    expect(R.get('beam:ub')).toBeTypeOf('function');
    expect(R.get('beam:shs')).toBeTypeOf('function');
    expect(R.get('plate:*')).toBeTypeOf('function');
    expect(R.get('fastener:as1252-bolt')).toBeTypeOf('function');
    // The column re-uses (UB and SHS used as a column dispatch to the same mesh fn).
    expect(R.get('column:ub')).toBeTypeOf('function');
    expect(R.get('column:shs')).toBeTypeOf('function');
    // The fastener:* category-generic fallback.
    expect(R.get('fastener:*')).toBeTypeOf('function');
  });

  it('bumps v2.BUILD.phase to 0g once the renderer script loads', () => {
    expect(window.v2.BUILD).toBeTruthy();
    expect(window.v2.BUILD.phase).toBe('0g');
    expect(window.v2.BUILD.layers).toContain('render-threejs');
  });

  it('migrates the fixture to a v2 model with the expected element census', () => {
    expect(firstRun.model.elements.size).toBe(4);
    expect(firstRun.model.views.size).toBe(3);
    expect(firstRun.model.sheets.size).toBe(1);
    const categories = Array.from(firstRun.model.elements.values()).map(e => e.category).sort();
    expect(categories).toEqual(['beam', 'beam', 'plate', 'plate']);
  });

  it('every element gets dispatched to a specific mesh builder (none silently vanish)', () => {
    // The elevation view sees all 4 elements: 2 model-level beams + 2 view-local plates.
    expect(firstRun.dispatches.length).toBe(4);
    for (const d of firstRun.dispatches) {
      expect(d.ok).toBe(true);
      expect(d.resolved).toBe('specific');
      expect(d.mesh).toBeTruthy();
      // Every element id minted by the migrator starts with v1o:/v1e:.
      expect(d.elementId).toMatch(/^v1[oe]:/);
    }
  });

  it('routes UB → beam:ub, SHS → beam:shs, plates → plate:plate-flat (resolved via plate:*)', () => {
    const byId = new Map();
    for (const d of firstRun.dispatches) byId.set(d.elementId, d);
    expect(byId.get('v1o:1').key).toBe('beam:ub');
    expect(byId.get('v1o:2').key).toBe('beam:shs');
    expect(byId.get('v1e:1').key).toBe('plate:plate-flat');
    expect(byId.get('v1e:2').key).toBe('plate:plate-flat');
    // The plate entries hit the `plate:*` category-generic fallback — still
    // counts as 'specific' per the dispatch-table convention (matches the
    // canvas2d-pixel-test assertion exactly).
    expect(byId.get('v1e:1').resolved).toBe('specific');
    expect(byId.get('v1e:2').resolved).toBe('specific');
  });

  it('the UB element produces an ExtrudeGeometry mesh with a non-trivial vertex count', () => {
    const ub = Array.from(firstRun.model.elements.values()).find(e => e.family === 'ub');
    const mesh = firstRun.renderer.meshFor(ub.id);
    expect(mesh).toBeTruthy();
    expect(mesh.isMesh).toBe(true);
    // ExtrudeGeometry of the 12-vertex I-section profile — the cap triangulation
    // and the side faces give a positive vertex count. The hardcoded number
    // depends on r128's tessellation; we assert "well above the 12 outline
    // vertices" without locking the test to an exact tessellation count.
    expect(mesh.geometry.attributes.position.count).toBeGreaterThan(12);
    expect(mesh.userData.v2Family).toBe('ub');
    expect(mesh.userData.v2Length).toBe(600);  // start (0,0,0) → end (600,0,0)
    // Edge overlay is a LineSegments child.
    expect(mesh.children.length).toBeGreaterThanOrEqual(1);
    const edges = mesh.children.find(c => c.isLineSegments);
    expect(edges).toBeTruthy();
  });

  it('the SHS element produces a Group of 4 wall meshes', () => {
    const shs = Array.from(firstRun.model.elements.values()).find(e => e.family === 'shs');
    const group = firstRun.renderer.meshFor(shs.id);
    expect(group).toBeTruthy();
    expect(group.isGroup).toBe(true);
    // 4 walls — each is a Mesh with an EdgesGeometry child.
    const meshChildren = group.children.filter(c => c.isMesh);
    expect(meshChildren.length).toBe(4);
    for (const wall of meshChildren) {
      expect(wall.geometry.attributes.position.count).toBeGreaterThan(0);
      const edges = wall.children.find(c => c.isLineSegments);
      expect(edges).toBeTruthy();
    }
    expect(group.userData.v2Family).toBe('shs');
    expect(group.userData.v2Length).toBe(500);
  });

  it('each plate element produces an ExtrudeGeometry mesh of its polygon outline', () => {
    const plates = Array.from(firstRun.model.elements.values()).filter(e => e.category === 'plate');
    expect(plates.length).toBe(2);
    for (const plate of plates) {
      const mesh = firstRun.renderer.meshFor(plate.id);
      expect(mesh).toBeTruthy();
      expect(mesh.isMesh).toBe(true);
      expect(mesh.geometry.attributes.position.count).toBeGreaterThan(0);
      expect(mesh.userData.v2Family).toBe('plate-flat');
      expect(mesh.userData.v2GeometryKind).toBe('region');
      expect(mesh.userData.v2Thickness).toBe(10);   // the fixture's thk = 10
    }
  });

  it('steel-s300 elements (UB + plates) share one cached THREE material', () => {
    const ub = Array.from(firstRun.model.elements.values()).find(e => e.family === 'ub');
    const plate = Array.from(firstRun.model.elements.values()).find(e => e.category === 'plate');
    const ubMesh = firstRun.renderer.meshFor(ub.id);
    const plateMesh = firstRun.renderer.meshFor(plate.id);
    expect(ubMesh.material).toBe(plateMesh.material);
    // The library names materials `v2:mat:<id>` for debug — the UB and plate
    // both default to steel-s300 per the catalogue's family.defaultMaterial.
    expect(ubMesh.material.name).toBe('v2:mat:steel-s300');
    expect(ubMesh.material.userData.v2MaterialId).toBe('steel-s300');
    expect(ubMesh.material.userData.v2MaterialClass).toBe('steel');
  });

  it('the steel-s300 material colour matches the JSDOM fallback (0xb0b0b0)', () => {
    // JSDOM does not resolve the `var(--mat-steel)` declared on steel-s300, so
    // the materials library falls back to FALLBACK_COLORS_BY_ID['steel-s300'] —
    // the same warm-grey hex v1's v3dMatSteel uses for visual continuity.
    const ub = Array.from(firstRun.model.elements.values()).find(e => e.family === 'ub');
    const mesh = firstRun.renderer.meshFor(ub.id);
    expect(mesh.material.color.getHex()).toBe(0xb0b0b0);
  });

  it('the steel-s355 material (SHS) gets the SHS-grade fallback colour', () => {
    const shs = Array.from(firstRun.model.elements.values()).find(e => e.family === 'shs');
    const group = firstRun.renderer.meshFor(shs.id);
    // Walls share a single material — pick any wall.
    const wall = group.children.find(c => c.isMesh);
    expect(wall.material.color.getHex()).toBe(0xa8a8a8);
    expect(wall.material.userData.v2MaterialId).toBe('steel-s355');
  });

  it('a forced `fastener:*` dispatch builds a bolt placeholder (registry coverage)', () => {
    // The baseplate fixture has no fasteners, so the bolt mesh builder doesn't
    // exercise via the migrated model. We construct a minimal Element directly
    // to verify the dispatch table routes `fastener:as1252-bolt` end-to-end.
    const renderer = window.v2.render.threejs.ensureThreeJSRenderer({});
    const elem = {
      id: 'test-bolt-1',
      category: 'fastener',
      family: 'as1252-bolt',
      type: 'M20',
      materialId: 'bolt-as1252-grade-8.8',
      geometry: window.v2.model.pointInstance({
        location: { x: 100, y: 200, z: 50 },
        normal:   { x: 0,   y: 0,   z: 1  },
      }),
      params: {}, createdAt: 0,
    };
    const model = firstRun.model;
    // Don't mutate the cached model — just probe through renderElement.
    const dispatch = window.v2.render.threejs.ThreeJSRenderer.renderElement(
      elem, model, firstRun.view, {
        scene: renderer.scene, group: renderer.group,
        upsertMesh: function () {}, removeMesh: function () {},
      }, renderer.materials);
    expect(dispatch.ok).toBe(true);
    expect(dispatch.resolved).toBe('specific');
    expect(dispatch.key).toBe('fastener:as1252-bolt');
    expect(dispatch.mesh).toBeTruthy();
    expect(dispatch.mesh.isGroup).toBe(true);
    // The bolt group has 5 children: shaft + head + nut + 2 washers.
    const meshes = dispatch.mesh.children.filter(c => c.isMesh);
    expect(meshes.length).toBe(5);
    expect(dispatch.mesh.position.x).toBe(100);
    expect(dispatch.mesh.position.y).toBe(200);
    expect(dispatch.mesh.position.z).toBe(50);
    renderer.dispose();
  });

  it('two consecutive render passes produce structurally identical scene graphs', () => {
    const a = renderBaseplateOnce();
    const b = renderBaseplateOnce();
    const snapA = snapshotMeshes(a.renderer);
    const snapB = snapshotMeshes(b.renderer);
    // If anything sneaks Date.now() / Math.random() / Map-order non-determinism
    // into a mesh builder this assertion fails immediately. We compare
    // structurally — vertex counts, positions, quaternions, material names.
    expect(snapB).toEqual(snapA);
    a.renderer.dispose();
    b.renderer.dispose();
  });

  it('removing an element clears its mesh on the next render', () => {
    const renderer = window.v2.render.threejs.ensureThreeJSRenderer({});
    const parsed = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
    const model = window.v2.io.load.fromParsed(parsed);
    const view = model.views.get('v1-view-elevation');
    renderer.render(model, view, null);
    expect(renderer.meshById.size).toBe(4);
    const ub = Array.from(model.elements.values()).find(e => e.family === 'ub');
    model.elements.delete(ub.id);
    renderer.render(model, view, null);
    expect(renderer.meshById.size).toBe(3);
    expect(renderer.meshFor(ub.id)).toBe(null);
    renderer.dispose();
  });

  it('out-of-view elements are skipped (sectionA view sees only the model-level beams)', () => {
    const parsed = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
    const model = window.v2.io.load.fromParsed(parsed);
    // The migrator builds view ids as `v1-view-<viewKey>` and v1's entities2D
    // buckets are camelCase ('sectionA' / 'planB' / 'elevation').
    const view = model.views.get('v1-view-sectionA');
    expect(view).toBeTruthy();
    const renderer = window.v2.render.threejs.ensureThreeJSRenderer({});
    const dispatches = renderer.render(model, view, null);
    // 2 beams dispatch (model-level, visible in every view); 2 plates are
    // view-local to elevation and resolved 'out-of-view'.
    expect(dispatches.length).toBe(4);
    const resolved = dispatches.map(d => d.resolved).sort();
    expect(resolved).toEqual(['out-of-view', 'out-of-view', 'specific', 'specific']);
    expect(renderer.meshById.size).toBe(2);
    renderer.dispose();
  });

  it('the renderer subscribes to dirtyBus and round-trips a model-changed payload', () => {
    const renderer = window.v2.render.threejs.ensureThreeJSRenderer({});
    let seen = null;
    const off = renderer.attachDirty((payload) => { seen = payload; });
    window.v2.engine.dirtyBus.emit('model-changed', { source: 'threejs-test' });
    expect(seen).toEqual({ source: 'threejs-test' });
    off();
    renderer.dispose();
  });

  it('dispose() tears the scene-graph cache down to empty', () => {
    const renderer = window.v2.render.threejs.ensureThreeJSRenderer({});
    const parsed = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
    const model = window.v2.io.load.fromParsed(parsed);
    const view = model.views.get('v1-view-elevation');
    renderer.render(model, view, null);
    expect(renderer.meshById.size).toBe(4);
    expect(renderer.materials.size()).toBeGreaterThan(0);
    renderer.dispose();
    expect(renderer.meshById.size).toBe(0);
    expect(renderer.materials.size()).toBe(0);
  });
});
