/**
 * StructDraw v2 · Render Layer · threejs · build mesh AS 1252 bolt
 * LAYER: render/threejs — AS 1252 bolt mesh builder. Consumes a RenderContext
 *        and returns a THREE.Group (shank cylinder + hex head + hex nut +
 *        washers). Phase 0g scaffold of v1's `v3dBuildBolt`.
 * READS:  globalThis.THREE; window.v2.render.threejs.{makeEdgeMaterial,
 *           registerRenderer}
 * WRITES: registers itself at `fastener:as1252-bolt` AND `fastener:*` (the
 *           category-generic fallback so every fastener family — anchor,
 *           shear-stud, Rothoblaas HBS — appears in the iso scene until each
 *           gains a dedicated builder in a later phase).
 *
 * Classic <script>, no build step (CLAUDE.md rules 3 & 8). Three.js r128 only.
 * Phase 0g scaffold draws a complete bolt assembly using just primitive
 * geometries — head + shaft + nut + two washers. v1's `v3dBuildBolt` reaches
 * into `computeBoltGripInfo` (which derives the grip length from the connected
 * plates and the connection state); Phase 0g cannot, because the model layer
 * does not yet expose connection grouping. Instead we derive a sensible total
 * length from the catalogue Type's defaults — head + nut + washers + a 1.5×d
 * grip placeholder — which gives the iso view a visible bolt in the right
 * position. The Phase 1 pilot or Phase 11 (connection wizards) will replace
 * this with a connection-aware grip calculation.
 *
 * --- LOCAL → WORLD MAPPING -------------------------------------------------
 * The Group is built with the shaft running along LOCAL +Z (cylinder default
 * after a -π/2 rotation about X). The Group is positioned at the bolt's
 * location and oriented so local +Z points along the bolt's `normal` (head →
 * tip direction). When the geometry is a view-local annotation point (the
 * migrator's fallback for V25 single-point fasteners), the location's z = 0
 * and the bolt sits flat in world XY.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.render = v2.render || {};
  v2.render.threejs = v2.render.threejs || {};

  if (typeof THREE === 'undefined' ||
      typeof v2.render.threejs.registerRenderer !== 'function') {
    return;
  }

  function num(n, dflt) { return (typeof n === 'number' && isFinite(n)) ? n : (dflt === undefined ? 0 : dflt); }

  /** Dimensions from the catalogue Type — sensible defaults from `d` if absent. */
  function dimsFor(ctx) {
    const t = (ctx && ctx.type) || {};
    const d = num(t.d, 20);
    return {
      d:       d,
      headAF:  num(t.headAF,  d * 1.6),
      headH:   num(t.headH,   d * 0.7),
      nutAF:   num(t.nutAF,   d * 1.6),
      nutH:    num(t.nutH,    d * 0.8),
      washOD:  num(t.washOD,  d * 2.0),
      washT:   num(t.washT,   d * 0.15),
      threadL: num(t.threadL, d * 2.0),
    };
  }

  /** Locate the bolt in world 3D — varies by geometry kind. */
  function anchorAndNormal(element) {
    const g = element && element.geometry;
    if (!g) return null;
    if (g.kind === 'point') {
      const loc = g.location || {};
      const n = g.normal || { x: 0, y: 0, z: 1 };
      return {
        location: { x: num(loc.x), y: num(loc.y), z: num(loc.z) },
        normal:   { x: num(n.x),   y: num(n.y),   z: num(n.z, 1) },
      };
    }
    if (g.kind === 'annotation' && Array.isArray(g.points) && g.points.length) {
      return {
        location: { x: num(g.points[0].x), y: num(g.points[0].y), z: 0 },
        normal:   { x: 0, y: 0, z: 1 },
      };
    }
    if (g.kind === 'region' && Array.isArray(g.polygon) && g.polygon.length) {
      let sx = 0, sy = 0;
      for (let i = 0; i < g.polygon.length; i++) {
        sx += num(g.polygon[i].x); sy += num(g.polygon[i].y);
      }
      return {
        location: { x: sx / g.polygon.length, y: sy / g.polygon.length, z: 0 },
        normal:   { x: 0, y: 0, z: 1 },
      };
    }
    return null;
  }

  function buildMeshBoltAS1252(element, ctx) {
    if (!element || !ctx) return null;
    const place = anchorAndNormal(element);
    if (!place) return null;
    const dims = dimsFor(ctx);

    const grip = dims.d * 1.5; // placeholder grip — Phase 11 replaces this
    const shaftLen = dims.headH + grip + dims.washT * 2 + dims.nutH + dims.threadL * 0.25;

    const group = new THREE.Group();
    group.name = 'v2:fastener:as1252-bolt:' + element.id;
    group.userData = group.userData || {};
    group.userData.v2Family = element.family || 'as1252-bolt';
    group.userData.v2Dims = dims;

    const material = (ctx.threeMaterials && typeof ctx.threeMaterials.get === 'function')
      ? ctx.threeMaterials.get(ctx.material || element.materialId)
      : new THREE.MeshStandardMaterial({ color: 0x606060 });

    // Cylinders are built along THREE's default +Y, then rotated -π/2 about X
    // so they end up along local +Z (matching our axisU convention from beams).
    function cyl(geom, posZ) {
      const mesh = new THREE.Mesh(geom, material);
      mesh.rotation.set(Math.PI / 2, 0, 0);
      mesh.position.set(0, 0, posZ);
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geom, 15),
        v2.render.threejs.makeEdgeMaterial()));
      return mesh;
    }

    // Shaft — runs from head-side washer to thread tip.
    const shaftGeom = new THREE.CylinderGeometry(dims.d / 2, dims.d / 2, shaftLen, 12);
    shaftGeom.name = 'v2:fastener:shaft:' + element.id;
    group.add(cyl(shaftGeom, 0));

    // Hex head — at the negative end of the shaft (head-side).
    const headR = dims.headAF / 2 / Math.cos(Math.PI / 6);
    const headGeom = new THREE.CylinderGeometry(headR, headR, dims.headH, 6);
    headGeom.name = 'v2:fastener:head:' + element.id;
    group.add(cyl(headGeom, -shaftLen / 2 - dims.headH / 2));

    // Hex nut — at the positive end of the shaft (nut-side).
    const nutR = dims.nutAF / 2 / Math.cos(Math.PI / 6);
    const nutGeom = new THREE.CylinderGeometry(nutR, nutR, dims.nutH, 6);
    nutGeom.name = 'v2:fastener:nut:' + element.id;
    group.add(cyl(nutGeom, shaftLen / 2 + dims.nutH / 2));

    // Washers — one under the head, one under the nut.
    const washGeom = new THREE.CylinderGeometry(dims.washOD / 2, dims.washOD / 2, dims.washT, 16);
    washGeom.name = 'v2:fastener:washer:' + element.id;
    group.add(cyl(washGeom.clone(), -shaftLen / 2 + dims.washT / 2));
    group.add(cyl(washGeom.clone(),  shaftLen / 2 - dims.washT / 2));
    // Dispose the template geometry — the clones are independent now.
    washGeom.dispose();

    // Orient so local +Z (shaft direction) → world `normal`.
    const n = place.normal;
    const nLen = Math.hypot(n.x, n.y, n.z);
    if (nLen > 1e-9) {
      const nVec = new THREE.Vector3(n.x / nLen, n.y / nLen, n.z / nLen);
      const z = new THREE.Vector3(0, 0, 1);
      group.quaternion.setFromUnitVectors(z, nVec);
    }
    group.position.set(place.location.x, place.location.y, place.location.z);

    return group;
  }

  v2.render.threejs.registerRenderer('fastener:as1252-bolt', buildMeshBoltAS1252);
  // category-generic fallback — every other fastener family routes here until
  // it gains its own builder. A family-specific registration overrides this
  // per the dispatch lookup rules.
  v2.render.threejs.registerRenderer('fastener:*', buildMeshBoltAS1252);
  v2.render.threejs.buildMeshBoltAS1252 = buildMeshBoltAS1252;
})();
