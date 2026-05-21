/**
 * StructDraw v2 · Render Layer · threejs · build mesh plate
 * LAYER: render/threejs — Plate mesh builder. Consumes a RenderContext and
 *        returns a THREE.Mesh (extruded polygon + edge overlay).
 * READS:  globalThis.THREE; window.v2.render.threejs.{makeEdgeMaterial,
 *           registerRenderer}
 * WRITES: registers itself at `plate:*` (the category-generic fallback the
 *           dispatch table consults when no plate-family-specific mesh builder
 *           is registered).
 *
 * Classic <script>, no build step (CLAUDE.md rules 3 & 8). Three.js r128 only.
 * The migrator can produce EITHER:
 *   - a model-level Plate geometry (3D polygon vertices) — from objects3D.plate.
 *   - a view-local Region geometry (2D polygon vertices) — from
 *     entities2D[…].plate2 (the V25 paper-space plate).
 * Both shapes carry a polygon; this builder projects to a plate-local 2D
 * shape, extrudes by the type's thickness, and orients the mesh through the
 * plate's frame (model-level) or flat in world XY (view-local).
 *
 * --- WHY VIEW-LOCAL PLATES STILL APPEAR IN 3D ----------------------------
 * Per 05-render-pipeline.md §2.3, "the iso view's camera does the projection
 * in three.js space" — the renderer's job is to put SOMETHING in the scene
 * for every element so the user sees the plate's outline in the iso block.
 * For view-local plates that have no real 3D position yet, we render the
 * polygon flat in world XY (z = 0) so the iso camera sees a real 3D mesh.
 * Phase 1's pilot promotes view-local plates to model-level Plate geometry;
 * after that this code path becomes dead and can be retired.
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

  /**
   * Project a model-level plate polygon (3D vertices in world coords) into the
   * plate's local 2D frame. Returns the (origin, axisU, axisV, axisW, points2d)
   * needed to position the extruded mesh back in world space.
   */
  function projectModelLevel(geom) {
    const frame = geom.frame || {
      axisU: { x: 1, y: 0, z: 0 },
      axisV: { x: 0, y: 1, z: 0 },
      axisW: { x: 0, y: 0, z: 1 },
    };
    const origin = geom.origin || (geom.polygon && geom.polygon[0]) || { x: 0, y: 0, z: 0 };
    const u = frame.axisU || { x: 1, y: 0, z: 0 };
    const vAxis = frame.axisV || { x: 0, y: 1, z: 0 };
    const points2d = (geom.polygon || []).map(function (p) {
      const dx = num(p.x) - num(origin.x);
      const dy = num(p.y) - num(origin.y);
      const dz = num(p.z) - num(origin.z);
      return {
        x: dx * num(u.x) + dy * num(u.y) + dz * num(u.z),
        y: dx * num(vAxis.x) + dy * num(vAxis.y) + dz * num(vAxis.z),
      };
    });
    return { origin: origin, frame: frame, points2d: points2d };
  }

  /** Build a THREE.Shape from a 2D points array (>= 3 vertices, closed). */
  function shapeFromPoints(points2d) {
    if (!Array.isArray(points2d) || points2d.length < 3) return null;
    const shape = new THREE.Shape();
    shape.moveTo(num(points2d[0].x), num(points2d[0].y));
    for (let i = 1; i < points2d.length; i++) {
      shape.lineTo(num(points2d[i].x), num(points2d[i].y));
    }
    shape.closePath();
    return shape;
  }

  function buildMeshPlate(element, ctx) {
    if (!element || !ctx) return null;
    const g = element.geometry;
    if (!g) return null;

    let points2d = null;
    let thickness = num(ctx.type && ctx.type.thickness, 10);
    let position = new THREE.Vector3(0, 0, 0);
    let quaternion = new THREE.Quaternion();

    if (g.kind === 'plate') {
      thickness = num(g.thickness, thickness);
      const proj = projectModelLevel(g);
      points2d = proj.points2d;
      // Plate local frame: axisU on local +X, axisV on local +Y, axisW on +Z
      // (extrusion direction = plate normal).
      const f = proj.frame;
      const m4 = new THREE.Matrix4().makeBasis(
        new THREE.Vector3(num(f.axisU && f.axisU.x), num(f.axisU && f.axisU.y), num(f.axisU && f.axisU.z)),
        new THREE.Vector3(num(f.axisV && f.axisV.x), num(f.axisV && f.axisV.y), num(f.axisV && f.axisV.z)),
        new THREE.Vector3(num(f.axisW && f.axisW.x), num(f.axisW && f.axisW.y), num(f.axisW && f.axisW.z))
      );
      quaternion.setFromRotationMatrix(m4);
      position.set(num(proj.origin && proj.origin.x), num(proj.origin && proj.origin.y), num(proj.origin && proj.origin.z));
    } else if (g.kind === 'region') {
      // view-local region — polygon vertices are 2D (u, v).
      points2d = (g.polygon || []).map(function (p) {
        return { x: num(p && p.x), y: num(p && p.y) };
      });
    } else if (g.kind === 'polyline') {
      // Some plate variants migrated as polyline — treat as a closed extrusion.
      points2d = (g.points || []).map(function (p) {
        return { x: num(p && p.x), y: num(p && p.y) };
      });
    } else {
      return null;
    }

    const shape = shapeFromPoints(points2d);
    if (!shape) return null;

    const geom = new THREE.ExtrudeGeometry(shape, {
      depth: thickness, bevelEnabled: false,
    });
    geom.name = 'v2:plate:geom:' + element.id;

    const material = (ctx.threeMaterials && typeof ctx.threeMaterials.get === 'function')
      ? ctx.threeMaterials.get(ctx.material || element.materialId)
      : new THREE.MeshStandardMaterial({ color: 0xb0b0b0 });

    const mesh = new THREE.Mesh(geom, material);
    mesh.name = 'v2:plate:' + element.id;
    mesh.userData = mesh.userData || {};
    mesh.userData.v2Family = element.family || 'plate-flat';
    mesh.userData.v2Thickness = thickness;
    mesh.userData.v2GeometryKind = g.kind;

    mesh.position.copy(position);
    mesh.quaternion.copy(quaternion);

    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geom, 15),
      v2.render.threejs.makeEdgeMaterial());
    edges.name = 'v2:plate:edges:' + element.id;
    mesh.add(edges);

    return mesh;
  }

  v2.render.threejs.registerRenderer('plate:*', buildMeshPlate);
  v2.render.threejs.buildMeshPlate = buildMeshPlate;
})();
