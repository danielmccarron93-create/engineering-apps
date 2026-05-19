/**
 * StructDraw v2 · Catalogue Layer · namespace + registries
 * LAYER: catalogue — initialises the v2 catalogue namespaces and the family /
 *        material / rule registries. First catalogue script loaded.
 * READS:  window.v2 (created by _namespace.js), window.v2.BUILD
 * WRITES: window.v2.{catalogues, categories, lineweights, lineStyles, hatches,
 *           families, materials, rules}
 *
 * Classic <script>, no build step (CLAUDE.md rules 3 & 8). The catalogue layer
 * is pure data + pure lookup functions — no DOM, no canvas, no rendering. It is
 * loaded after the v2 model + transactions layer; the family / material / rule
 * files self-register into the registries this file defines, so this file MUST
 * load before any of them. Mirrors Phase 0b's `_namespace.js` pattern.
 * See PlannedBuilds/architecture-v2/04-catalogue-system.md.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});

  // Catalogue sub-namespaces — each catalogue file fills its own slot.
  v2.catalogues  = v2.catalogues  || {};
  v2.categories  = v2.categories  || {};
  v2.lineweights = v2.lineweights || {};
  v2.lineStyles  = v2.lineStyles  || {};
  v2.hatches     = v2.hatches     || {};

  /**
   * Build a small registry: an insertion-ordered id->entry Map with register /
   * lookup / all helpers, plus an optional secondary index over a field.
   * @param {?string} indexField  secondary-index field (e.g. 'category')
   * @param {string}  label       noun used in error messages
   */
  function makeRegistry(indexField, label) {
    const byId = new Map();
    const reg = {
      _byId: byId,
      register: function (entry) {
        if (!entry || typeof entry.id !== 'string' || entry.id.length === 0) {
          throw new Error('v2 ' + label + ' registry: an entry with a string id is required');
        }
        if (byId.has(entry.id)) {
          throw new Error('v2 ' + label + ' registry: duplicate id "' + entry.id + '"');
        }
        byId.set(entry.id, entry);
        return entry;
      },
      lookup: function (id) { return byId.get(id) || null; },
      has: function (id) { return byId.has(id); },
      all: function () { return Array.from(byId.values()); },
      ids: function () { return Array.from(byId.keys()); },
      count: function () { return byId.size; },
    };
    if (indexField) {
      reg.by = function (value) {
        return reg.all().filter(function (e) { return e[indexField] === value; });
      };
    }
    return reg;
  }

  // families — registry indexed by category.
  v2.families = v2.families || makeRegistry('category', 'family');
  v2.families.byCategory = v2.families.by;

  // materials — registry indexed by material class.
  v2.materials = v2.materials || makeRegistry('class', 'material');
  v2.materials.byClass = v2.materials.by;

  // rules — registry indexed by source standard.
  v2.rules = v2.rules || makeRegistry('standard', 'rule');
  v2.rules.byStandard = v2.rules.by;

  /**
   * Every registered rule whose appliesTo(element, model) is truthy.
   * @param {Element} element
   * @param {StructuralModel} model
   * @returns {object[]}
   */
  v2.rules.applicableTo = function (element, model) {
    return v2.rules.all().filter(function (r) {
      try {
        return typeof r.appliesTo === 'function' && !!r.appliesTo(element, model);
      } catch (e) {
        return false;
      }
    });
  };

  // Keep the BUILD stamp truthful as the catalogue layer comes online.
  if (v2.BUILD) {
    v2.BUILD.phase = '0c';
    if (Array.isArray(v2.BUILD.layers) && v2.BUILD.layers.indexOf('catalogues') === -1) {
      v2.BUILD.layers.push('catalogues');
    }
    v2.BUILD.note = 'Model + transactions + catalogue layers. v1 remains authoritative for the running app.';
  }
})();
