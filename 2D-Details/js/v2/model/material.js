/**
 * StructDraw v2 · Model Layer · material
 * LAYER: model — the Material shape, its factory and lookup helpers.
 * READS:  (nothing — pure)
 * WRITES: window.v2.model.{makeMaterial, defaultDisplayProps, materialById,
 *           materialsByClass, isMaterialClass, MATERIAL_CLASSES}
 *
 * Classic <script>, no build step. Pure data + pure functions — no DOM.
 * Materials carry both display (hatch / colour / line style) and structural
 * (fy, fu, E, density …) properties; renderers never hardcode a hatch — they
 * ask the material. The populated AS-standard material catalogue is Phase 0c.
 * See 03-model-layer.md §7.
 *
 * --- JSDoc shapes ----------------------------------------------------------
 * @typedef {'steel'|'concrete'|'timber'|'masonry'|'soil'|'fastener'|'other'} MaterialClass
 *
 * @typedef {object} DisplayProps
 * @property {string} hatchCut    hatch when the element is cut by a section
 * @property {string} hatchProj   hatch when the element is projected
 * @property {string} color       CSS colour (theme-aware token resolved by renderer)
 * @property {string} outlineCut  line style of the cut outline
 * @property {string} outlineProj line style of the projected outline
 *
 * @typedef {object} StructuralProps  shape varies by class; all fields optional
 * @property {string} [sourceStandard]
 * @property {number} [fy] @property {number} [fu] @property {number} [E]
 * @property {number} [G]  @property {number} [density]
 * @property {number} [characteristicStrength]
 *
 * @typedef {object} Material
 * @property {string}         id          short stable string ('steel-s275')
 * @property {string}         name
 * @property {MaterialClass}  class
 * @property {string}         grade
 * @property {DisplayProps}   display
 * @property {StructuralProps} structural
 * ---------------------------------------------------------------------------
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.model = v2.model || {};

  const MATERIAL_CLASSES = Object.freeze([
    'steel', 'concrete', 'timber', 'masonry', 'soil', 'fastener', 'other',
  ]);

  /** @param {*} c @returns {boolean} */
  function isMaterialClass(c) { return MATERIAL_CLASSES.indexOf(c) !== -1; }

  /** Neutral display properties used when a material spec omits `display`. */
  function defaultDisplayProps() {
    return {
      hatchCut: 'none',
      hatchProj: 'none',
      color: '#000000',
      outlineCut: 'solid',
      outlineProj: 'solid',
    };
  }

  /**
   * Construct a Material plain object. The id is a short, stable, human-readable
   * string (it appears verbatim in saved .sd2.json files) and is required.
   * @param {object} spec
   * @returns {Material}
   */
  function makeMaterial(spec) {
    spec = spec || {};
    if (typeof spec.id !== 'string' || spec.id.length === 0) {
      throw new Error('makeMaterial: a stable string id is required (e.g. "steel-s275")');
    }
    if (!isMaterialClass(spec.class)) {
      throw new Error(
        'makeMaterial: unknown material class "' + spec.class +
        '" (expected one of: ' + MATERIAL_CLASSES.join(', ') + ')'
      );
    }
    return {
      id: spec.id,
      name: spec.name != null ? spec.name : spec.id,
      class: spec.class,
      grade: spec.grade != null ? spec.grade : '',
      display: spec.display ? Object.assign(defaultDisplayProps(), spec.display)
                            : defaultDisplayProps(),
      structural: spec.structural ? Object.assign({}, spec.structural) : {},
    };
  }

  /**
   * @param {StructuralModel} model
   * @param {string} id
   * @returns {?Material}
   */
  function materialById(model, id) {
    if (!model || !model.materials) return null;
    return model.materials.get(id) || null;
  }

  /**
   * @param {StructuralModel} model
   * @param {MaterialClass} cls
   * @returns {Material[]}
   */
  function materialsByClass(model, cls) {
    const out = [];
    if (!model || !model.materials) return out;
    for (const m of model.materials.values()) {
      if (m.class === cls) out.push(m);
    }
    return out;
  }

  v2.model.MATERIAL_CLASSES   = MATERIAL_CLASSES;
  v2.model.isMaterialClass    = isMaterialClass;
  v2.model.defaultDisplayProps = defaultDisplayProps;
  v2.model.makeMaterial       = makeMaterial;
  v2.model.materialById       = materialById;
  v2.model.materialsByClass   = materialsByClass;
})();
