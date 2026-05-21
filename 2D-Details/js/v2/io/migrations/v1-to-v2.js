/**
 * StructDraw v2 · I/O Layer · migrations · v1 -> v2
 * LAYER: io/migrations — migrates the v1 .sd2.json shape (objects3D +
 *        entities2D + blocks) into a v2 StructuralModel.
 * READS:  window.v2.model.{makeModel, makeProject, makeElement, makeView,
 *           makeSheet, makeSheetPlacement, linearMember, plate, pointInstance,
 *           annotation, region, polyline};
 *           window.v2.families (catalogue — OPTIONAL, for defaultMaterial)
 * WRITES: window.v2.io.migrations.{v1ToV2, V1_TO_V2, OBJ_TYPE_MAP, ENT_TYPE_MAP}
 *
 * Classic <script>, no build step (CLAUDE.md rules 3 & 8). Pure data + pure
 * functions — no DOM, no canvas. The v1 state is PASSED IN, never read from a
 * window.* global, so the function is unit-testable in isolation.
 *
 * DETERMINISTIC: identical input always yields a structurally identical model.
 * Element / view / sheet / project ids are stable strings derived from the v1
 * ids; createdAt is derived, not Date.now(); no UUID is minted. That is what
 * lets the Phase 0d v1-bridge assert `appState.model` equals a fresh migration
 * of the current v1 state, and is what 03-model-layer.md §10 means by a
 * "replayable, diffable" migration.
 *
 * TOTAL: it never throws. Every objects3D item and every entities2D item maps
 * to EXACTLY ONE v2 Element — count fidelity is absolute (an unrecognised v1
 * type still produces one fallback Element). Geometry is always valid; a
 * malformed v1 item degrades to a minimal valid Element rather than aborting.
 *
 * Phase 0d scope (legacy): correct category / family / type (taxonomy fidelity,
 * per the 04-catalogue-system.md taxonomy) and valid, plausible geometry.
 *
 * Phase 0e extensions (this file, current build):
 *   - ENT_TYPE_MAP gains lineSet / txtBox (the two v25 dispatch types Phase 0d
 *     was missing) and upgrades `frame` from annotation -> region (a frame has
 *     u/v/w/h area, not a single anchor point).
 *   - geometryPointsFor harvests (u, v, w, h) rectangles for frame / mat /
 *     rect / slot / txtBox, and (cu, cv, r) circles for arc / circle — so
 *     region / polyline kinds get a real outline instead of the Phase-0d
 *     pad-by-duplication degenerate shape.
 *   - model.materials is now POPULATED from the v2 catalogue (when loaded) with
 *     just the materials actually referenced by migrated elements. Phase 0d
 *     left the map empty; Phase 0e gives the model the minimum self-contained
 *     material set so the model can be serialised and so the Phase 0f renderer
 *     has everything it needs without a catalogue round-trip. Loading order is
 *     tolerant — if v2.materials is not present, the map is left empty (the
 *     migrator stays usable in unit tests that do not load the catalogue).
 *
 * Phase 0e does NOT yet rewrite the coordinate mapping for objects3D linear
 * members (the legacy "axis * length" approximation stays); that becomes a
 * concern in the renderer phase when full geometric fidelity matters.
 * See 03-model-layer.md §10 and 07-migration-strategy.md §§1, 4.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.io = v2.io || {};
  v2.io.migrations = v2.io.migrations || {};

  // Stable ids for the single project / sheet a v1 file migrates into.
  const PROJECT_ID = 'v1-project';
  const SHEET_ID   = 'v1-sheet';

  /**
   * v1 objects3D `type` -> v2 (category, family). objects3D items are always
   * model-level (real 3D geometry). See 04-catalogue-system.md §§2-3.
   */
  const OBJ_TYPE_MAP = Object.freeze({
    ub:    { category: 'beam',     family: 'ub'  },
    uc:    { category: 'beam',     family: 'uc'  },
    shs:   { category: 'beam',     family: 'shs' },
    rhs:   { category: 'beam',     family: 'rhs' },
    chs:   { category: 'beam',     family: 'chs' },
    pfc:   { category: 'beam',     family: 'pfc' },
    ea:    { category: 'beam',     family: 'ea'  },
    ua:    { category: 'beam',     family: 'ua'  },
    wb:    { category: 'beam',     family: 'wb'  },
    plate: { category: 'plate',    family: 'plate-flat'  },
    bolt:  { category: 'fastener', family: 'as1252-bolt' },
  });

  /**
   * v1 entities2D `type` -> v2 (category, family, geometry kind). entities2D
   * items are always view-local; `kind` is one of annotation / region /
   * polyline (the three view-local geometry kinds — never the model-level
   * linear / plate / point). `mem2` resolves its family from `ent.memberType`.
   */
  const ENT_TYPE_MAP = Object.freeze({
    // V25 structural members + plates
    mem2:            { category: 'beam',           family: null,         kind: 'polyline' },
    plate2:          { category: 'plate',          family: 'plate-flat', kind: 'region'   },
    'steel-plate':   { category: 'plate',          family: 'plate-flat', kind: 'region'   },
    'timber-member': { category: 'timber-member',  family: 'custom-rect', kind: 'polyline' },
    // fasteners — single-point in v1; carried as a one-point annotation so the
    // element stays view-local (pointInstance geometry has no viewId field).
    screw:  { category: 'fastener', family: 'rothoblaas-hbs', kind: 'annotation' },
    anchor: { category: 'fastener', family: 'anchor-bolt',    kind: 'annotation' },
    bolt:   { category: 'fastener', family: 'as1252-bolt',    kind: 'annotation' },
    // detail components
    weld:       { category: 'detail-component', family: 'weld-symbol', kind: 'annotation' },
    breakline:  { category: 'detail-component', family: 'breakline',   kind: 'polyline'   },
    slot:       { category: 'detail-component', family: 'slot',        kind: 'region'     },
    connection: { category: 'detail-component', family: null,          kind: 'annotation' },
    // Phase 0e: a `frame` carries a (u,v,w,h) rectangular area, NOT a single
    // anchor point — promote to region so the 4 corners survive migration.
    frame:      { category: 'detail-component', family: null,          kind: 'region'     },
    hatch:      { category: 'detail-component', family: null,          kind: 'region'     },
    mat:        { category: 'detail-component', family: null,          kind: 'region'     },
    // masonry + reinforcement
    blockWall: { category: 'masonry',       family: 'cmu',  kind: 'region'   },
    reoBar:    { category: 'reinforcement', family: 'bar',  kind: 'polyline' },
    mesh:      { category: 'reinforcement', family: 'mesh', kind: 'region'   },
    // annotations
    dim:              { category: 'annotation', family: 'dimension',      kind: 'annotation' },
    leader2:          { category: 'annotation', family: 'leader',         kind: 'annotation' },
    note:             { category: 'annotation', family: 'leader',         kind: 'annotation' },
    text:             { category: 'annotation', family: 'tag',            kind: 'annotation' },
    mtext:            { category: 'annotation', family: 'tag',            kind: 'annotation' },
    materialTag:      { category: 'annotation', family: 'tag',            kind: 'annotation' },
    memberTag:        { category: 'annotation', family: 'tag',            kind: 'annotation' },
    boltCallout:      { category: 'annotation', family: 'tag',            kind: 'annotation' },
    sectionMark:      { category: 'annotation', family: 'section-mark',   kind: 'annotation' },
    detailCard:       { category: 'annotation', family: 'detail-callout', kind: 'annotation' },
    detailRef:        { category: 'annotation', family: 'detail-callout', kind: 'annotation' },
    revisionCloud:    { category: 'annotation', family: 'revision',       kind: 'annotation' },
    revisionTriangle: { category: 'annotation', family: 'revision',       kind: 'annotation' },
    revSchedule:      { category: 'annotation', family: 'revision',       kind: 'annotation' },
    // generic draw primitives
    line:       { category: 'annotation',       family: null, kind: 'polyline'   },
    centreline: { category: 'annotation',       family: null, kind: 'polyline'   },
    gridLine:   { category: 'annotation',       family: null, kind: 'polyline'   },
    arc:        { category: 'annotation',       family: null, kind: 'annotation' },
    circle:     { category: 'annotation',       family: null, kind: 'annotation' },
    rect:       { category: 'detail-component', family: null, kind: 'region'     },
    polygon:    { category: 'detail-component', family: null, kind: 'region'     },
    // Phase 0e — v25 dispatch types Phase 0d did not name explicitly.
    lineSet:    { category: 'annotation',       family: null, kind: 'polyline'   },
    txtBox:     { category: 'annotation',       family: 'tag', kind: 'annotation' },
  });

  /** Fallback when a v1 type is not in the maps above (count fidelity is kept). */
  const OBJ_FALLBACK = { category: 'detail-component', family: null };
  const ENT_FALLBACK = { category: 'annotation', family: null, kind: 'annotation' };

  /** Default material id per category — used when the catalogue is unavailable. */
  const CATEGORY_DEFAULT_MATERIAL = {
    beam: 'steel-s300', column: 'steel-s300', brace: 'steel-s300',
    plate: 'steel-s300', fastener: 'bolt-as1252-grade-8.8',
    reinforcement: 'reinforcement-n500', masonry: 'masonry-cmu190',
    'concrete-region': 'concrete-n32', 'timber-member': 'timber-mgp10',
    annotation: null, 'detail-component': null, 'sheet-component': null,
  };

  /** v1 viewKey -> v2 View type / human name. Unknown keys -> paper-space. */
  const VIEW_TYPE = { elevation: 'elevation', sectionA: 'section', planB: 'plan', isometric: 'iso' };
  const VIEW_NAME = { elevation: 'Elevation', sectionA: 'Section A', planB: 'Plan B', isometric: 'Isometric' };

  // --- tiny helpers ---------------------------------------------------------

  function num(n, dflt) {
    return (typeof n === 'number' && isFinite(n)) ? n : (dflt === undefined ? 0 : dflt);
  }

  function viewIdFor(viewKey) { return 'v1-view-' + viewKey; }

  /** Coerce an arbitrary v1 vertex ({x,y,z} | {u,v} | [a,b,c]) to a Point3D. */
  function toPoint3(p) {
    if (Array.isArray(p)) return { x: num(p[0]), y: num(p[1]), z: num(p[2]) };
    if (p && typeof p === 'object') {
      if (typeof p.x === 'number' || typeof p.y === 'number' || typeof p.z === 'number') {
        return { x: num(p.x), y: num(p.y), z: num(p.z) };
      }
      if (typeof p.u === 'number' || typeof p.v === 'number') {
        return { x: num(p.u), y: num(p.v), z: 0 };
      }
    }
    return { x: 0, y: 0, z: 0 };
  }

  /** The catalogue's family default material, else a per-category default. */
  function defaultMaterialFor(category, family) {
    if (family && v2.families && typeof v2.families.lookup === 'function') {
      const fam = v2.families.lookup(family);
      if (fam && typeof fam.defaultMaterial === 'string' && fam.defaultMaterial.length) {
        return fam.defaultMaterial;
      }
    }
    return Object.prototype.hasOwnProperty.call(CATEGORY_DEFAULT_MATERIAL, category)
      ? CATEGORY_DEFAULT_MATERIAL[category] : null;
  }

  // --- objects3D geometry ---------------------------------------------------

  function buildObjGeometry(obj, category) {
    const origin = { x: num(obj.x), y: num(obj.y), z: num(obj.z) };
    if (category === 'plate') {
      let poly = Array.isArray(obj.polyPts) ? obj.polyPts.map(toPoint3) : [];
      if (poly.length < 3) {
        poly = [
          { x: origin.x, y: origin.y, z: origin.z },
          { x: origin.x + 100, y: origin.y, z: origin.z },
          { x: origin.x + 100, y: origin.y + 100, z: origin.z },
          { x: origin.x, y: origin.y + 100, z: origin.z },
        ];
      }
      return v2.model.plate({
        polygon: poly,
        origin: origin,
        thickness: num(obj.pt != null ? obj.pt : obj.thk),
      });
    }
    if (category === 'fastener') {
      return v2.model.pointInstance({ location: origin, normal: obj.normal });
    }
    if (category === 'beam' || category === 'column' ||
        category === 'brace' || category === 'timber-member') {
      const L = num(obj.length);
      const ax = (obj.axis && typeof obj.axis === 'object') ? obj.axis : { x: 1, y: 0, z: 0 };
      const end = {
        x: origin.x + num(ax.x) * L,
        y: origin.y + num(ax.y) * L,
        z: origin.z + num(ax.z) * L,
      };
      return v2.model.linearMember({ start: origin, end: end, rotation: num(obj.rot) });
    }
    // Unknown 3D object — a model-level point keeps it in the model, counted.
    return v2.model.pointInstance({ location: origin });
  }

  // --- entities2D geometry --------------------------------------------------

  /** Pull a flat list of view-space {x,y} vertices off any v1 entity. */
  function collectEntPoints(ent) {
    const pts = [];
    const arrs = ['pts', 'points', 'polyPts', 'verts'];
    for (let a = 0; a < arrs.length; a++) {
      const arr = ent[arrs[a]];
      if (Array.isArray(arr)) {
        for (let j = 0; j < arr.length; j++) {
          const p = arr[j];
          if (Array.isArray(p) && p.length >= 2) {
            pts.push({ x: num(p[0]), y: num(p[1]) });
          } else if (p && typeof p === 'object') {
            if (typeof p.u === 'number' || typeof p.v === 'number') pts.push({ x: num(p.u), y: num(p.v) });
            else if (typeof p.x === 'number' || typeof p.y === 'number') pts.push({ x: num(p.x), y: num(p.y) });
          }
        }
        if (pts.length) return pts;
      }
    }
    // numbered point fields (p1u/p1v ... p6u/p6v — dimensions, leaders)
    for (let k = 1; k <= 6; k++) {
      const pu = ent['p' + k + 'u'], pv = ent['p' + k + 'v'];
      if (typeof pu === 'number' || typeof pv === 'number') pts.push({ x: num(pu), y: num(pv) });
    }
    if (pts.length) return pts;
    // segment endpoints
    if (typeof ent.u1 === 'number' || typeof ent.u2 === 'number') {
      return [{ x: num(ent.u1), y: num(ent.v1) }, { x: num(ent.u2), y: num(ent.v2) }];
    }
    if (typeof ent.x1 === 'number' || typeof ent.x2 === 'number') {
      return [{ x: num(ent.x1), y: num(ent.y1) }, { x: num(ent.x2), y: num(ent.y2) }];
    }
    // single origin
    if (typeof ent.u === 'number' || typeof ent.v === 'number') {
      return [{ x: num(ent.u), y: num(ent.v) }];
    }
    return pts;
  }

  /** The four outline corners of a V25 plate2 (rect / poly / section cleat). */
  function plate2Points(ent) {
    if (ent.aspect === 'elev' && ent.shape === 'poly' && Array.isArray(ent.pts)) {
      return ent.pts.map(function (p) {
        return { x: num(p.u, num(p.x)), y: num(p.v, num(p.y)) };
      });
    }
    const u = num(ent.u), v = num(ent.v);
    if (ent.aspect === 'sec') {
      const L = num(ent.length), thk = num(ent.thk, 10);
      return [
        { x: u, y: v - thk / 2 }, { x: u + L, y: v - thk / 2 },
        { x: u + L, y: v + thk / 2 }, { x: u, y: v + thk / 2 },
      ];
    }
    const w = num(ent.w), h = num(ent.h);
    return [
      { x: u, y: v }, { x: u + w, y: v }, { x: u + w, y: v + h }, { x: u, y: v + h },
    ];
  }

  /** The centreline endpoints of a V25 mem2 (from u,v + length + rot°). */
  function mem2Points(ent) {
    const u = num(ent.u), v = num(ent.v);
    const L = num(ent.length), r = num(ent.rot) * Math.PI / 180;
    return [{ x: u, y: v }, { x: u + L * Math.cos(r), y: v + L * Math.sin(r) }];
  }

  /** Four corners of a (u,v,w,h) rectangle (Phase 0e — frame / mat / rect / slot / txtBox). */
  function uvwhRectPoints(ent) {
    const u = num(ent.u), v = num(ent.v);
    const w = num(ent.w), h = num(ent.h);
    return [
      { x: u, y: v }, { x: u + w, y: v },
      { x: u + w, y: v + h }, { x: u, y: v + h },
    ];
  }
  function isUVWHRect(ent) {
    return ent && typeof ent.u === 'number' && typeof ent.v === 'number'
                && typeof ent.w === 'number' && typeof ent.h === 'number';
  }

  /**
   * Four cardinal points of a (cu,cv,r) circle (Phase 0e — arc / circle). Two
   * points would suffice for a polyline kind and four for a region kind; four
   * also gives a fair AABB hint for the bridge's dirty bus.
   */
  function circleSamplePoints(ent) {
    const cu = num(ent.cu, num(ent.u)), cv = num(ent.cv, num(ent.v)), r = num(ent.r);
    return [
      { x: cu + r, y: cv },
      { x: cu, y: cv + r },
      { x: cu - r, y: cv },
      { x: cu, y: cv - r },
    ];
  }
  function isCircular(ent) {
    return ent && typeof ent.r === 'number' &&
      (typeof ent.cu === 'number' || typeof ent.cv === 'number' ||
       typeof ent.u  === 'number' || typeof ent.v  === 'number');
  }

  function geometryPointsFor(ent) {
    if (ent.type === 'plate2') return plate2Points(ent);
    if ((ent.type === 'mem2' || ent.type === 'timber-member') &&
        typeof ent.length === 'number' && typeof ent.rot === 'number') {
      return mem2Points(ent);
    }
    // Explicit polylines/polygons (pts/points/polyPts/verts) or numbered fields
    // win — they were authored that way. Otherwise fall back to derived shapes.
    const pts = collectEntPoints(ent);
    if (pts.length >= 2) return pts;
    // (u, v, w, h) — frame / mat / rect / slot / txtBox / hatch in V25 +
    // many V22-era detail components.
    if (isUVWHRect(ent)) return uvwhRectPoints(ent);
    // (cu, cv, r) — arc / circle.
    if (isCircular(ent)) return circleSamplePoints(ent);
    return pts;        // 0 or 1 point — region/polyline pad-by-duplication
  }

  function buildEntGeometry(ent, kind, viewId) {
    const pts = geometryPointsFor(ent);
    try {
      if (kind === 'region') {
        const poly = pts.slice();
        while (poly.length < 3) {
          poly.push(poly.length ? { x: poly[poly.length - 1].x, y: poly[poly.length - 1].y } : { x: 0, y: 0 });
        }
        return v2.model.region({ viewId: viewId, polygon: poly });
      }
      if (kind === 'polyline') {
        const line = pts.slice();
        while (line.length < 2) {
          line.push(line.length ? { x: line[line.length - 1].x, y: line[line.length - 1].y } : { x: 0, y: 0 });
        }
        return v2.model.polyline({ viewId: viewId, points: line, closed: false });
      }
      return v2.model.annotation({ viewId: viewId, points: pts, refs: [], data: {} });
    } catch (e) {
      // An annotation with an empty points array is always valid.
      return v2.model.annotation({ viewId: viewId, points: [], refs: [], data: {} });
    }
  }

  // --- per-item migration ---------------------------------------------------

  function migrateObject(obj, index) {
    const rawId = (obj.id != null) ? obj.id : ('i' + index);
    try {
      const map = OBJ_TYPE_MAP[obj.type] || OBJ_FALLBACK;
      let type = null;
      if (map.category === 'beam' || map.category === 'column' ||
          map.category === 'brace' || map.category === 'timber-member') {
        type = (typeof obj.section === 'string') ? obj.section : null;
      } else if (map.category === 'fastener') {
        type = (typeof obj.boltSize === 'string') ? obj.boltSize : null;
      }
      return v2.model.makeElement({
        id: 'v1o:' + rawId,
        category: map.category,
        family: map.family,
        type: type,
        geometry: buildObjGeometry(obj, map.category),
        materialId: defaultMaterialFor(map.category, map.family),
        params: {
          v1Type: (obj.type != null) ? obj.type : null,
          v1Id: (obj.id != null) ? obj.id : null,
          v1Source: 'objects3D',
        },
        createdAt: num(obj.id, index),
      });
    } catch (e) {
      return v2.model.makeElement({
        id: 'v1o:' + rawId,
        category: 'detail-component',
        family: null,
        type: null,
        geometry: v2.model.pointInstance({ location: { x: 0, y: 0, z: 0 } }),
        materialId: null,
        params: {
          v1Type: (obj && obj.type != null) ? obj.type : null,
          v1Id: (obj && obj.id != null) ? obj.id : null,
          v1Source: 'objects3D',
          migrationFallback: true,
        },
        createdAt: num(obj && obj.id, index),
      });
    }
  }

  function migrateEntity(ent, viewKey, index) {
    const viewId = viewIdFor(viewKey);
    const rawId = (ent.id != null) ? ent.id : ('i' + index);
    try {
      const map = ENT_TYPE_MAP[ent.type] || ENT_FALLBACK;
      let family = map.family;
      if (ent.type === 'mem2' && typeof ent.memberType === 'string') family = ent.memberType;
      let type = null;
      if ((ent.type === 'mem2' || ent.type === 'timber-member') && typeof ent.section === 'string') {
        type = ent.section;
      }
      return v2.model.makeElement({
        id: 'v1e:' + rawId,
        category: map.category,
        family: family,
        type: type,
        geometry: buildEntGeometry(ent, map.kind, viewId),
        materialId: defaultMaterialFor(map.category, family),
        params: {
          v1Type: (ent.type != null) ? ent.type : null,
          v1Id: (ent.id != null) ? ent.id : null,
          v1Source: 'entities2D',
          v1View: viewKey,
        },
        createdAt: num(ent.id, index),
      });
    } catch (e) {
      return v2.model.makeElement({
        id: 'v1e:' + rawId,
        category: 'annotation',
        family: null,
        type: null,
        geometry: v2.model.annotation({ viewId: viewId, points: [], refs: [], data: {} }),
        materialId: null,
        params: {
          v1Type: (ent && ent.type != null) ? ent.type : null,
          v1Id: (ent && ent.id != null) ? ent.id : null,
          v1Source: 'entities2D',
          v1View: viewKey,
          migrationFallback: true,
        },
        createdAt: num(ent && ent.id, index),
      });
    }
  }

  // --- the migration --------------------------------------------------------

  /**
   * Migrate a v1 .sd2.json shape into a v2 StructuralModel.
   * @param {{objects3D?:Array, entities2D?:Object, blocks?:Array}} v1
   *        The v1 state — accepts a full v1 save object (extra keys ignored)
   *        or just the three relevant slices. Missing slices default empty.
   * @returns {StructuralModel}
   */
  function v1ToV2(v1) {
    v1 = v1 || {};
    const objects3D  = Array.isArray(v1.objects3D) ? v1.objects3D : [];
    const entities2D = (v1.entities2D && typeof v1.entities2D === 'object') ? v1.entities2D : {};
    const blocks     = Array.isArray(v1.blocks) ? v1.blocks : [];

    const elements = new Map();

    // objects3D -> model-level Elements
    for (let i = 0; i < objects3D.length; i++) {
      const obj = objects3D[i];
      if (!obj || typeof obj !== 'object') continue;
      const el = migrateObject(obj, i);
      elements.set(el.id, el);
    }

    // The view keys, in a deterministic order: blocks order first, then any
    // additional entities2D buckets not placed on a block.
    const viewKeys = [];
    function addViewKey(vk) {
      if (vk != null && viewKeys.indexOf(vk) === -1) viewKeys.push(vk);
    }
    for (let b = 0; b < blocks.length; b++) {
      if (blocks[b]) addViewKey(blocks[b].viewKey);
    }
    Object.keys(entities2D).forEach(addViewKey);

    // entities2D -> view-local Elements
    for (let vk = 0; vk < viewKeys.length; vk++) {
      const viewKey = viewKeys[vk];
      const bucket = entities2D[viewKey];
      if (!Array.isArray(bucket)) continue;
      for (let e = 0; e < bucket.length; e++) {
        const ent = bucket[e];
        if (!ent || typeof ent !== 'object') continue;
        const elEnt = migrateEntity(ent, viewKey, e);
        elements.set(elEnt.id, elEnt);
      }
    }

    // Views — one per view key.
    const views = new Map();
    for (let w = 0; w < viewKeys.length; w++) {
      const view = v2.model.makeView({
        id: viewIdFor(viewKeys[w]),
        type: VIEW_TYPE[viewKeys[w]] || 'paper-space',
        name: VIEW_NAME[viewKeys[w]] || String(viewKeys[w]),
        scale: 1,
      });
      views.set(view.id, view);
    }

    // One auto-generated Sheet — a placement per block, else one per view.
    const placements = [];
    if (blocks.length) {
      for (let p = 0; p < blocks.length; p++) {
        const blk = blocks[p];
        if (!blk || blk.viewKey == null) continue;
        placements.push(v2.model.makeSheetPlacement({
          viewId: viewIdFor(blk.viewKey),
          originOnSheet: { x: num(blk.sheetX), y: num(blk.sheetY) },
          rotation: 0,
        }));
      }
    } else {
      for (let q = 0; q < viewKeys.length; q++) {
        placements.push(v2.model.makeSheetPlacement({
          viewId: viewIdFor(viewKeys[q]),
          originOnSheet: { x: 0, y: 0 },
        }));
      }
    }
    const sheet = v2.model.makeSheet({
      id: SHEET_ID, name: 'Sheet 1', size: 'A1', placements: placements,
    });

    return v2.model.makeModel({
      elements: elements,
      // Phase 0e — the model is now self-contained for everything its elements
      // reference. Only materials actually referenced get added (smallest set);
      // catalogue absence is tolerated (empty map — see populateMaterials).
      materials: populateMaterials(elements),
      views: views,
      sheets: new Map([[sheet.id, sheet]]),
      project: v2.model.makeProject({ id: PROJECT_ID, name: 'StructDraw v1 Project', createdAt: 0 }),
      version: 0,
    });
  }

  /**
   * Populate the smallest sufficient material map for the migrated elements.
   * Walks elements once, deduplicates materialIds, looks each up in the v2
   * catalogue registry (`window.v2.materials`). When the catalogue is not
   * loaded (a unit test that only loads the migrator + model layer), the map
   * is left empty — the migrator stays usable in isolation.
   * Materials added in catalogue-registration order so the map is deterministic.
   * @param {Map<string,Element>} elements
   * @returns {Map<string,Material>}
   */
  function populateMaterials(elements) {
    const out = new Map();
    if (!v2.materials || typeof v2.materials.lookup !== 'function') return out;
    const wantedIds = new Set();
    elements.forEach(function (el) {
      if (el && typeof el.materialId === 'string' && el.materialId.length) {
        wantedIds.add(el.materialId);
      }
    });
    if (!wantedIds.size) return out;
    // The catalogue exposes all() in registration order; iterate that and
    // pick out the wanted ids in that order to keep the map deterministic.
    if (typeof v2.materials.all === 'function') {
      const all = v2.materials.all();
      for (let i = 0; i < all.length; i++) {
        const mat = all[i];
        if (mat && wantedIds.has(mat.id)) out.set(mat.id, mat);
      }
    } else {
      wantedIds.forEach(function (id) {
        const mat = v2.materials.lookup(id);
        if (mat) out.set(id, mat);
      });
    }
    return out;
  }

  v2.io.migrations.v1ToV2 = v1ToV2;
  v2.io.migrations.OBJ_TYPE_MAP = OBJ_TYPE_MAP;
  v2.io.migrations.ENT_TYPE_MAP = ENT_TYPE_MAP;
  // Migration descriptor — the registry shape 03-model-layer.md §10 expects.
  // Phase 0e's io/load.js picks this up to route schemaVersion 1 -> 2.
  v2.io.migrations.V1_TO_V2 = Object.freeze({ from: 1, to: 2, run: v1ToV2 });
})();
