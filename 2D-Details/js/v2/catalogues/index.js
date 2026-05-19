/**
 * StructDraw v2 · Catalogue Layer · top-level entry point
 * LAYER: catalogue — cross-catalogue lookup helpers + a load-time integrity
 *        sweep. Loaded LAST of the catalogue files.
 * READS:  window.v2.{categories, families, materials, rules, lineweights,
 *           lineStyles, hatches}
 * WRITES: window.v2.catalogues.{lookupCategory, lookupFamily, lookupType,
 *           lookupMaterial, lookupRule, resolveTypeRef, summary, ready}
 *
 * Classic <script>, no build step. The catalogue is the source of truth;
 * everything else (renderer, rule engine, palette) is a consumer that reaches
 * it through these helpers. See 04-catalogue-system.md §§9, 10.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.catalogues = v2.catalogues || {};
  const c = v2.catalogues;

  c.lookupCategory = function (key) {
    return (v2.categories && v2.categories.lookupCategory)
      ? v2.categories.lookupCategory(key) : null;
  };
  c.lookupFamily = function (id) {
    return v2.families ? v2.families.lookup(id) : null;
  };
  c.lookupMaterial = function (id) {
    return v2.materials ? v2.materials.lookup(id) : null;
  };
  c.lookupRule = function (id) {
    return v2.rules ? v2.rules.lookup(id) : null;
  };

  /**
   * Resolve a catalogue Type row within a family.
   * @param {string} family @param {string} typeId @returns {?object}
   */
  c.lookupType = function (family, typeId) {
    const fam = c.lookupFamily(family);
    if (!fam || !Array.isArray(fam.types)) return null;
    for (let i = 0; i < fam.types.length; i++) {
      if (fam.types[i].id === typeId) return fam.types[i];
    }
    return null;
  };

  /**
   * Resolve a full (category, family, type) reference — the triple that
   * uniquely identifies a catalogue entry (04 §3) — into its catalogue objects.
   * Returns null if any leg is unknown or the family/category are inconsistent.
   * @returns {?{category:string, family:object, type:object}}
   */
  c.resolveTypeRef = function (category, family, typeId) {
    const cat = c.lookupCategory(category);
    const fam = c.lookupFamily(family);
    if (!cat || !fam || fam.category !== category) return null;
    const typ = c.lookupType(family, typeId);
    if (!typ) return null;
    return { category: category, family: fam, type: typ };
  };

  /** Catalogue census — entry counts, for diagnostics. */
  c.summary = function () {
    return {
      categories:  v2.categories  ? v2.categories.keys().length   : 0,
      families:    v2.families    ? v2.families.count()           : 0,
      materials:   v2.materials   ? v2.materials.count()          : 0,
      rules:       v2.rules       ? v2.rules.count()              : 0,
      lineweights: v2.lineweights ? v2.lineweights.names().length : 0,
      lineStyles:  v2.lineStyles  ? v2.lineStyles.names().length  : 0,
      hatches:     v2.hatches     ? v2.hatches.names().length     : 0,
    };
  };

  // Integrity sweep: every family's defaultMaterial must resolve to a
  // registered material. A dangling id is a catalogue bug — fail fast at load.
  if (v2.families && v2.materials) {
    v2.families.all().forEach(function (fam) {
      if (fam.defaultMaterial != null && !v2.materials.has(fam.defaultMaterial)) {
        throw new Error('catalogues/index.js: family "' + fam.id +
          '" defaultMaterial "' + fam.defaultMaterial +
          '" is not a registered material');
      }
    });
  }

  c.ready = true;
})();
