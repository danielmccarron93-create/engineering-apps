/**
 * StructDraw v2 · Transactions · material transactions
 * LAYER: model · transactions — define / edit a Material.
 * READS:  window.v2.model.{makeMaterial, geometryViewId, emptyDirtySet}
 * WRITES: window.v2.transactions.{defineMaterial, editMaterial}
 *
 * Classic <script>, no build step. defineMaterial adds or replaces a material;
 * when it replaces, the prior material is captured for an exact unapply. Both
 * transactions dirty every element that references the material. See
 * 03-model-layer.md §§7, 8.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.transactions = v2.transactions || {};
  const hasOwn = Object.prototype.hasOwnProperty;

  /** DirtySet covering every element that uses the given material. */
  function materialDirty(model, materialId) {
    const ds = v2.model.emptyDirtySet();
    for (const el of model.elements.values()) {
      if (el.materialId === materialId) {
        ds.elements.add(el.id);
        const vid = v2.model.geometryViewId(el.geometry);
        if (vid != null) ds.views.add(vid);
      }
    }
    return ds;
  }

  /**
   * Create a transaction that defines (adds or replaces) a Material.
   * @param {object} materialSpec  forwarded to v2.model.makeMaterial
   * @returns {Transaction}
   */
  function defineMaterial(materialSpec) {
    const material = v2.model.makeMaterial(materialSpec);
    let priorExisted = false;
    let priorValue = null;
    return {
      type: 'define-material',
      description: 'Define material ' + material.id,
      data: { material: material },
      apply: function (model) {
        priorExisted = model.materials.has(material.id);
        priorValue = priorExisted ? model.materials.get(material.id) : null;
        model.materials.set(material.id, material);
        return materialDirty(model, material.id);
      },
      unapply: function (model) {
        if (priorExisted) model.materials.set(material.id, priorValue);
        else model.materials.delete(material.id);
        return materialDirty(model, material.id);
      },
    };
  }

  /**
   * Create a transaction that patches a Material's fields. A no-op when the id
   * is not present at apply time.
   * @param {string} materialId
   * @param {Object} changes
   * @returns {Transaction}
   */
  function editMaterial(materialId, changes) {
    if (changes && hasOwn.call(changes, 'id')) {
      throw new Error('editMaterial: a material id cannot be changed');
    }
    const keys = changes ? Object.keys(changes) : [];
    let prior = null;
    let applied = false;
    return {
      type: 'edit-material',
      description: 'Edit material ' + materialId,
      data: { materialId: materialId, changes: changes },
      apply: function (model) {
        const material = model.materials.get(materialId);
        if (!material) return v2.model.emptyDirtySet();
        prior = keys.map(function (k) {
          return { key: k, had: hasOwn.call(material, k), value: material[k] };
        });
        for (let i = 0; i < keys.length; i++) material[keys[i]] = changes[keys[i]];
        applied = true;
        return materialDirty(model, materialId);
      },
      unapply: function (model) {
        const material = model.materials.get(materialId);
        if (!material || !applied) return v2.model.emptyDirtySet();
        for (let i = 0; i < prior.length; i++) {
          const p = prior[i];
          if (p.had) material[p.key] = p.value;
          else delete material[p.key];
        }
        return materialDirty(model, materialId);
      },
    };
  }

  v2.transactions.defineMaterial = defineMaterial;
  v2.transactions.editMaterial   = editMaterial;
})();
