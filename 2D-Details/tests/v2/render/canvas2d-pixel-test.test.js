/*
 * StructDraw v2 — Phase 0f Canvas2DRenderer pixel test.
 *
 * JSDOM does not implement HTMLCanvasElement#getContext — `canvas.getContext('2d')`
 * returns null. We cannot pixel-snapshot a real canvas in this harness. The
 * Phase 0f build plan calls this out explicitly:
 *
 *   > snapshot the produced pixel buffer (or a deterministic stroke log if
 *   > pixel-snapshotting JSDOM proves flaky — pick the path that's testable),
 *   > and assert structural identity with a recorded expected output. The
 *   > pixel-similarity-to-v1 comparison the build plan calls for is partly a
 *   > manual smoke-test step Dan does in the browser; the JSDOM test asserts
 *   > the renderer produces the same OUTPUT SHAPE on two runs (determinism)
 *   > and the right ELEMENTS get drawn.
 *
 * So this file asserts the DETERMINISTIC STROKE LOG path:
 *   1. Render the baseplate fixture through Canvas2DRenderer with a null
 *      canvas (the backend records primitives but issues no canvas calls).
 *   2. Every Element in the model is dispatched to exactly one draw function
 *      (or the category fallback) — none silently vanish.
 *   3. Two consecutive render passes produce STRUCTURALLY IDENTICAL primitive
 *      logs (the determinism the Phase 0f exit criterion calls for).
 *   4. Specific elements emit the primitives their families promise (the UB
 *      emits a polygon + centreline + label; the SHS emits a polygon; each
 *      plate emits a polygon; the AS 1100 cut hatch fires when `cutClass:
 *      'cut'` is forced — proving the catalogue→primitive plumbing works).
 *   5. The hit-test dispatch table picks the right element when the cursor
 *      lies on a member centreline / inside a plate.
 *
 * The browser-side pixel comparison against v1's render of the same fixture
 * is Dan's manual smoke-test (the v2 hidden canvas can be made visible via a
 * console toggle — Phase 0f §10 of the build-chat prompt).
 *
 * window.v2 is populated by tests/v2/setup.mjs; describe / it / expect are globals.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(HERE, '../../fixtures/v1/baseplate.sdproj');

/** Render the baseplate fixture once and return the (model, dispatches, log). */
function renderBaseplateOnce() {
  const parsed = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
  const model = window.v2.io.load.fromParsed(parsed);
  // Render every view; the elevation view holds the migrated plate2 entities.
  const r = window.v2.render.canvas2d.ensureCanvasRenderer(null, { ppm: 1 });
  const result = {
    model: model,
    perView: [],          // [{view, dispatches, primitives}]
    primitiveLog: [],     // flat record across every view, in render order
  };
  for (const view of model.views.values()) {
    const dispatches = r.render(model, view, null);
    const snapshot = r.backend.record.slice();
    result.perView.push({ view: view, dispatches: dispatches, primitives: snapshot });
    for (let i = 0; i < snapshot.length; i++) {
      result.primitiveLog.push({ viewId: view.id, primitive: snapshot[i] });
    }
  }
  return result;
}

describe('Phase 0f — Canvas2DRenderer scaffold renders the baseplate fixture', () => {
  let firstRun;

  beforeAll(() => {
    firstRun = renderBaseplateOnce();
  });

  it('the renderer namespace + dispatch table are populated by the script load', () => {
    expect(window.v2.render).toBeTruthy();
    expect(window.v2.render.canvas2d).toBeTruthy();
    expect(window.v2.render.canvas2d.Canvas2DRenderer).toBeTruthy();
    // beam:ub, beam:shs, plate:*, fastener:as1252-bolt are the four worked
    // entries the Phase 0f plan calls for. fastener:* is the category-generic
    // fallback that the spec also requires.
    const r = window.v2.render.canvas2d.RENDERERS;
    expect(r.get('beam:ub')).toBeTypeOf('function');
    expect(r.get('beam:shs')).toBeTypeOf('function');
    expect(r.get('plate:*')).toBeTypeOf('function');
    expect(r.get('fastener:as1252-bolt')).toBeTypeOf('function');
    expect(r.get('fastener:*')).toBeTypeOf('function');
  });

  it('the hit-test table covers every category in the dispatch table', () => {
    const h = window.v2.render.canvas2d.HIT_TESTS;
    expect(h.get('beam:*')).toBeTypeOf('function');
    expect(h.get('plate:*')).toBeTypeOf('function');
    expect(h.get('column:*')).toBeTypeOf('function');
  });

  it('detects the baseplate fixture as a v1 multi-sheet project', () => {
    const parsed = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
    expect(window.v2.io.load.detectSchemaVersion(parsed)).toBe('v1-project');
  });

  it('migrates the fixture to a v2 model with the expected element census', () => {
    expect(firstRun.model.elements.size).toBe(4);
    expect(firstRun.model.views.size).toBe(3);
    expect(firstRun.model.sheets.size).toBe(1);
    const categories = Array.from(firstRun.model.elements.values()).map((e) => e.category).sort();
    expect(categories).toEqual(['beam', 'beam', 'plate', 'plate']);
  });

  it('every element gets dispatched to a draw function in every view it appears in', () => {
    // 4 elements × 3 views = 12 dispatch slots — but only the 2 plates are
    // view-local (elevation only); the 2 beams are model-level (every view).
    // 2 beams × 3 views + 2 plates × 1 view = 8 dispatches.
    const flat = [];
    for (const v of firstRun.perView) flat.push(...v.dispatches);
    expect(flat.length).toBe(8);
    for (const d of flat) {
      expect(d.ok).toBe(true);
      expect(d.elementId).toMatch(/^v1[oe]:/);
      // Beam UB / Beam SHS / Plate plate-flat all have specific renderers
      // registered — no element should hit the genericDraw fallback.
      expect(d.resolved).toBe('specific');
    }
  });

  it('routes the UB beam to `beam:ub` and the SHS beam to `beam:shs`', () => {
    const elevation = firstRun.perView.find((v) => v.view.id === 'v1-view-elevation');
    expect(elevation).toBeTruthy();
    const byElement = new Map();
    for (const d of elevation.dispatches) byElement.set(d.elementId, d);
    expect(byElement.get('v1o:1').key).toBe('beam:ub');
    expect(byElement.get('v1o:2').key).toBe('beam:shs');
    expect(byElement.get('v1e:1').key).toBe('plate:plate-flat');
    expect(byElement.get('v1e:2').key).toBe('plate:plate-flat');
  });

  it('emits the expected primitive shapes per element in the elevation view', () => {
    const elevation = firstRun.perView.find((v) => v.view.id === 'v1-view-elevation');
    const kinds = elevation.primitives.map((p) => p.kind);
    // UB projected: polygon (rect) + 2 hidden web lines + centreline + label.
    // SHS projected: polygon (outer) + 2 hidden inner lines + centreline + label.
    // 2 plates: polygon each.
    expect(kinds.filter((k) => k === 'polygon').length).toBeGreaterThanOrEqual(4);
    expect(kinds.filter((k) => k === 'line').length).toBeGreaterThanOrEqual(6);
    expect(kinds.filter((k) => k === 'text').length).toBe(2);
    // No primitive may be undefined / null in the log.
    for (const p of elevation.primitives) {
      expect(p).toBeTruthy();
      expect(typeof p.kind).toBe('string');
    }
  });

  it('the plate-only views only render the model-level beams (no view-local plates leak)', () => {
    // sectionA and planB have NO entities2D in the baseplate fixture — they
    // should render only the two beams (model-level, visible in every view).
    for (const v of firstRun.perView) {
      if (v.view.id === 'v1-view-elevation') continue;
      expect(v.dispatches.length).toBe(2);
      const keys = v.dispatches.map((d) => d.key).sort();
      expect(keys).toEqual(['beam:shs', 'beam:ub']);
    }
  });

  it('a forced cutClass="cut" pulls in the AS 1100 steel hatch primitive', () => {
    // Pick the UB and render it through a fresh backend with cutClass forced.
    const ub = Array.from(firstRun.model.elements.values()).find((e) => e.family === 'ub');
    const view = firstRun.model.views.get('v1-view-elevation');
    const backend = window.v2.render.canvas2d.makeBackend(null, { ppm: 1 });
    const dispatch = window.v2.render.canvas2d.Canvas2DRenderer.renderElement(
      ub, firstRun.model, view, backend, { cutClass: 'cut' });
    expect(dispatch.ok).toBe(true);
    const kinds = backend.record.map((p) => p.kind);
    // CUT-class UB: I-section polygon + hatch + centreline + label.
    expect(kinds).toContain('polygon');
    expect(kinds).toContain('hatch');
    const hatch = backend.record.find((p) => p.kind === 'hatch');
    expect(hatch.pattern).toBe('as1100-steel-45');
    expect(hatch.polygon.length).toBe(12); // 12 vertices of the I-section
  });

  it('two consecutive render passes produce structurally identical primitive logs', () => {
    const a = renderBaseplateOnce();
    const b = renderBaseplateOnce();
    // The primitive log is a deterministic function of the model + dispatch
    // table + view set. If anything sneaks Date.now() / Math.random() into a
    // draw fn this assertion fails immediately.
    expect(b.primitiveLog).toEqual(a.primitiveLog);
  });

  it('hit-test routes a cursor on the UB centreline to the UB beam', () => {
    const ub = Array.from(firstRun.model.elements.values()).find((e) => e.family === 'ub');
    const view = firstRun.model.views.get('v1-view-elevation');
    // The UB lives at (0, 0, 0) -> (600, 0, 0). View projection is identity
    // (the migrator does not yet attach a real modelTransform — see Phase 0d
    // notes), so the centreline runs from (0, 0) to (600, 0) in view-space.
    const r = window.v2.render.canvas2d.ensureCanvasRenderer(null, { ppm: 1 });
    const hit = r.hitTest(firstRun.model, view, { x: 300, y: 0 });
    expect(hit).toBeTruthy();
    expect(hit.element.id).toBe(ub.id);
    // The hit `.key` reflects the element's own (category, family) identity —
    // the hit-test entry is registered category-generic at `beam:*` but the
    // key stamped on the result is the element's `beam:ub` so callers know
    // which family matched.
    expect(hit.key).toBe('beam:ub');
  });

  it('hit-test misses entirely when the cursor lies away from every element', () => {
    const view = firstRun.model.views.get('v1-view-elevation');
    const r = window.v2.render.canvas2d.ensureCanvasRenderer(null, { ppm: 1 });
    const hit = r.hitTest(firstRun.model, view, { x: 100000, y: 100000 });
    expect(hit).toBe(null);
  });

  it('the renderer subscribes to dirtyBus without throwing when none is present', () => {
    // attachDirty is a no-op (returns an empty unsubscribe) when the dirty
    // bus is missing — the test harness loads the bus, so subscribe + emit
    // should round-trip a payload through.
    const r = window.v2.render.canvas2d.ensureCanvasRenderer(null, { ppm: 1 });
    let seen = null;
    const off = r.attachDirty((payload) => { seen = payload; });
    window.v2.engine.dirtyBus.emit('model-changed', { source: 'render-test' });
    expect(seen).toEqual({ source: 'render-test' });
    off();
  });
});
