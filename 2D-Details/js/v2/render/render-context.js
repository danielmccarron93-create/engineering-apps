/**
 * StructDraw v2 · Render Layer · render context
 * LAYER: render — `buildRenderContext(elem, model, view, opts)` resolves the
 *        catalogue lookups every draw function expects so the draw function
 *        itself never touches the catalogue. Pure — no DOM, no canvas, no
 *        model mutation.
 * READS:  window.v2.{catalogues, categories, families, materials, lineweights,
 *           hatches, model, render}
 * WRITES: window.v2.render.{buildRenderContext, resolveLineweight, resolveColor}
 *
 * Classic <script>, no build step. The render context is the single object a
 * draw function consults to decide every visual property — category, family,
 * type, material, lineweight, hatch, colour, cut class, backend. v1's
 * scattered access to `LW`, `colorAlpha`, `cs.getPropertyValue('--entity-color')`
 * and `getCutClass` collapses into one struct. The Phase 0g three.js renderer
 * receives the same context shape with a `'threejs'` backend instead of canvas2d.
 * See 05-render-pipeline.md §3 and 04-catalogue-system.md §8.
 *
 * --- JSDoc shape (the contract every draw function relies on) ------------
 * @typedef {object} RenderContext
 * @property {Element}        element       the element being drawn
 * @property {StructuralModel} model
 * @property {View}           view
 * @property {string}         rendererName  'canvas2d' | 'threejs' | 'dxf' | …
 * @property {Backend}        backend       the per-renderer output sink
 * @property {object}         category      v2.categories descriptor (key + label + …)
 * @property {?object}        family        v2.families.lookup() result, or null
 * @property {?object}        type          family.types row, or null
 * @property {?object}        material      v2.materials.lookup() result, or null
 * @property {object}         lineweight    { cut:number, proj:number, hidden:number } in mm
 * @property {?object}        hatchCut      v2.hatches descriptor, or null
 * @property {?object}        hatchProj     v2.hatches descriptor, or null
 * @property {string}         color         resolved colour string ('#xxxxxx' or 'var(--x)')
 * @property {'cut'|'projected'|'hidden'|'beyond'} cutClass
 * @property {boolean}        isSelected
 * @property {boolean}        isHovered
 * --------------------------------------------------------------------------
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.render = v2.render || {};

  /** A safe lineweight (mm) for a key — falls back to medium if unknown. */
  function resolveLineweight(key) {
    if (typeof key === 'number' && isFinite(key)) return key;
    if (v2.lineweights && typeof v2.lineweights.get === 'function') {
      const w = v2.lineweights.get(key);
      if (typeof w === 'number') return w;
      const med = v2.lineweights.get('medium');
      if (typeof med === 'number') return med;
    }
    return 0.5;
  }

  /**
   * Pick the colour for an element: material display colour wins; otherwise a
   * sensible default per category (annotation -> mute, everything else ->
   * entity colour). Theme CSS variables pass through unchanged — the canvas2d
   * backend resolves them against `getComputedStyle(document.body)` at draw
   * time. In a JSDOM test the backend gracefully falls back to a literal.
   */
  function resolveColor(material, category) {
    if (material && material.display && typeof material.display.color === 'string') {
      return material.display.color;
    }
    if (category && (category.key === 'annotation' ||
                     category.key === 'sheet-component' ||
                     category.key === 'detail-component')) {
      return 'var(--mute, #888888)';
    }
    return 'var(--entity-color, #000000)';
  }

  /** Resolve a category's defaultLineweight triple to numeric mm. */
  function resolveLineweightTriple(category) {
    const lw = (category && category.defaultLineweight) || {};
    return {
      cut:    resolveLineweight(lw.cut    || 'thick'),
      proj:   resolveLineweight(lw.proj   || 'medium'),
      hidden: resolveLineweight(lw.hidden || 'thin-dash'),
    };
  }

  /**
   * Build the RenderContext for one element. Pure — does not draw and does not
   * mutate the model. The renderer calls this once per element per render pass
   * and threads the result into the per-element draw function.
   *
   * `opts` is optional and carries selection / cut overrides:
   *   { backend, view, cutClass?, isSelected?, isHovered?, rendererName? }
   * The backend / view fields are passed straight through onto the context.
   * @param {Element} element
   * @param {StructuralModel} model
   * @param {object} [opts]
   * @returns {RenderContext}
   */
  function buildRenderContext(element, model, opts) {
    opts = opts || {};
    const lookups = (v2.catalogues && typeof v2.catalogues.lookupCategory === 'function')
      ? v2.catalogues
      : { lookupCategory: function () { return null; },
          lookupFamily:   function () { return null; },
          lookupType:     function () { return null; },
          lookupMaterial: function () { return null; } };

    const catDesc = lookups.lookupCategory(element.category);
    // Categories include a `.key` field in v2.categories.all() output but not
    // in v2.categories.CATEGORIES[<key>] directly. Stamp the key here so draw
    // functions can branch on it without reaching back to the registry.
    const category = catDesc
      ? Object.assign({ key: element.category }, catDesc)
      : { key: element.category, label: element.category, defaultLineweight: {} };

    const family = (element.family && lookups.lookupFamily)
      ? lookups.lookupFamily(element.family) : null;
    const type = (element.family && element.type && lookups.lookupType)
      ? lookups.lookupType(element.family, element.type) : null;

    let material = null;
    if (element.materialId) {
      // Prefer the model's own materials map (it is the model's source of
      // truth post-Phase 0e migration) and fall back to the global catalogue.
      if (model && model.materials && model.materials.has(element.materialId)) {
        material = model.materials.get(element.materialId);
      } else if (lookups.lookupMaterial) {
        material = lookups.lookupMaterial(element.materialId);
      }
    }

    const hatches = (v2.hatches && typeof v2.hatches.get === 'function')
      ? v2.hatches
      : { get: function () { return null; } };
    const matHatchCut  = material && material.display && material.display.hatchCut;
    const matHatchProj = material && material.display && material.display.hatchProj;
    const hatchCut  = matHatchCut  ? hatches.get(matHatchCut)  : null;
    const hatchProj = matHatchProj ? hatches.get(matHatchProj) : null;

    const cutClass = opts.cutClass != null
      ? opts.cutClass
      : (opts.view ? v2.render.classifyCut(element, opts.view) : 'projected');

    return {
      element: element,
      model: model || null,
      view: opts.view || null,
      rendererName: typeof opts.rendererName === 'string' ? opts.rendererName : 'canvas2d',
      backend: opts.backend || null,

      category: category,
      family: family,
      type: type,
      material: material,

      lineweight: resolveLineweightTriple(category),
      hatchCut: hatchCut,
      hatchProj: hatchProj,
      color: resolveColor(material, category),

      cutClass: cutClass,
      isSelected: opts.isSelected === true,
      isHovered:  opts.isHovered  === true,
    };
  }

  v2.render.buildRenderContext = buildRenderContext;
  v2.render.resolveLineweight  = resolveLineweight;
  v2.render.resolveColor       = resolveColor;
})();
