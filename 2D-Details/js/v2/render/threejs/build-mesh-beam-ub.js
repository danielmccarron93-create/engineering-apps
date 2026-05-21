/**
 * StructDraw v2 · Render Layer · threejs · build mesh beam UB
 * LAYER: render/threejs — Universal Beam mesh builder. Consumes a RenderContext
 *        and returns a THREE.Object3D. Never touches the catalogue directly
 *        (the context already carries the resolved type / material / etc.).
 * READS:  globalThis.THREE; window.v2.render.threejs.{makeEdgeMaterial,
 *           registerRenderer}
 * WRITES: registers itself at `beam:ub` AND `column:ub` — a UB used as a
 *           column has the same I-section profile / material / fillets, just a
 *           vertical orientation conferred by the LinearMember frame.
 *
 * Classic <script>, no build step (CLAUDE.md rules 3 & 8). Three.js r128 only.
 * The mesh is an ExtrudeGeometry of the AS 3679.1 I-section profile, with the
 * extrusion direction running along the member's `axisU` (start → end). The v1
 * sister file `js/64-3d-engine.js` does the equivalent for `v3dBuildUB`; this
 * builder mirrors v1's I-section construction so a side-by-side smoke test in
 * the browser shows no visible deviation.
 *
 * --- LOCAL → WORLD MAPPING -------------------------------------------------
 * The extruded geometry sits in its own local frame:
 *   local +X (profile width direction)        ←  axisW
 *   local +Y (profile depth direction)        ←  axisV
 *   local +Z (extrusion direction)            ←  axisU = start → end
 * We build a column-major rotation matrix from (axisW, axisV, axisU) and apply
 * it to the mesh. Position is `start` — the extrusion runs forward (along
 * +axisU). The element's optional `geometry.rotation` is applied as a local +Z
 * twist via Quaternion multiplication. v1 does the same via a pivot group.
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

  /** UB section dims from the catalogue Type — { d, bf, tf, tw, r1 }. */
  function sectionFor(ctx) {
    const t = ctx && ctx.type;
    if (!t) return null;
    if (!(t.d > 0) || !(t.bf > 0) || !(t.tf > 0) || !(t.tw > 0)) return null;
    return { d: t.d, bf: t.bf, tf: t.tf, tw: t.tw, r1: num(t.r1) };
  }

  /**
   * Build the I-section Shape — origin at section centroid, depth along local
   * +Y, flange width along local +X. Same vertex pattern as v1's
   * `v3dMakeIShape` so the extrusion vertex topology matches end-on.
   * @param {number} d   section depth
   * @param {number} bf  flange width
   * @param {number} tf  flange thickness
   * @param {number} tw  web thickness
   * @param {number} r1  root radius (clamped sensibly)
   * @returns {THREE.Shape}
   */
  function makeIShape(d, bf, tf, tw, r1) {
    const shape = new THREE.Shape();
    const hd = d / 2, hbf = bf / 2, htw = tw / 2;
    const r = Math.min(r1 || 0, Math.min((bf - tw) / 4, (d - 2 * tf) / 4));

    // Start at bottom-left of bottom flange, walk clockwise.
    shape.moveTo(-hbf, -hd);
    shape.lineTo(hbf, -hd);
    shape.lineTo(hbf, -hd + tf);
    // Fillet to web right
    if (r > 0.1) {
      shape.lineTo(htw + r, -hd + tf);
      shape.quadraticCurveTo(htw, -hd + tf, htw, -hd + tf + r);
    } else {
      shape.lineTo(htw, -hd + tf);
    }
    // Web right side up
    if (r > 0.1) {
      shape.lineTo(htw, hd - tf - r);
      shape.quadraticCurveTo(htw, hd - tf, htw + r, hd - tf);
    } else {
      shape.lineTo(htw, hd - tf);
    }
    // Top flange
    shape.lineTo(hbf, hd - tf);
    shape.lineTo(hbf, hd);
    shape.lineTo(-hbf, hd);
    shape.lineTo(-hbf, hd - tf);
    // Fillet to web left
    if (r > 0.1) {
      shape.lineTo(-htw - r, hd - tf);
      shape.quadraticCurveTo(-htw, hd - tf, -htw, hd - tf - r);
    } else {
      shape.lineTo(-htw, hd - tf);
    }
    // Web left side down
    if (r > 0.1) {
      shape.lineTo(-htw, -hd + tf + r);
      shape.quadraticCurveTo(-htw, -hd + tf, -htw - r, -hd + tf);
    } else {
      shape.lineTo(-htw, -hd + tf);
    }
    // Bottom flange left return
    shape.lineTo(-hbf, -hd + tf);
    shape.lineTo(-hbf, -hd);

    return shape;
  }

  /** Construct the basis matrix mapping (local X,Y,Z) → (axisW, axisV, axisU). */
  function frameBasis(frame) {
    const f = frame || {};
    const u = f.axisU || { x: 1, y: 0, z: 0 };
    const vAxis = f.axisV || { x: 0, y: 1, z: 0 };
    const w = f.axisW || { x: 0, y: 0, z: 1 };
    return new THREE.Matrix4().makeBasis(
      new THREE.Vector3(w.x, w.y, w.z),
      new THREE.Vector3(vAxis.x, vAxis.y, vAxis.z),
      new THREE.Vector3(u.x, u.y, u.z)
    );
  }

  /**
   * Build a Three.js mesh for a UB element.
   * @param {Element}        element
   * @param {RenderContext}  ctx
   * @returns {?THREE.Object3D}
   */
  function buildMeshBeamUB(element, ctx) {
    if (!element || !ctx) return null;
    const g = element.geometry;
    if (!g || g.kind !== 'linear') return null;
    const s = sectionFor(ctx);
    if (!s) return null;

    const dx = num(g.end && g.end.x) - num(g.start && g.start.x);
    const dy = num(g.end && g.end.y) - num(g.start && g.start.y);
    const dz = num(g.end && g.end.z) - num(g.start && g.start.z);
    const length = Math.hypot(dx, dy, dz);
    if (length < 1e-6) return null;

    const shape = makeIShape(s.d, s.bf, s.tf, s.tw, s.r1);
    const geom = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false });
    geom.name = 'v2:beam:ub:geom:' + element.id;

    const material = (ctx.threeMaterials && typeof ctx.threeMaterials.get === 'function')
      ? ctx.threeMaterials.get(ctx.material || element.materialId)
      : new THREE.MeshStandardMaterial({ color: 0xb0b0b0 });

    const mesh = new THREE.Mesh(geom, material);
    mesh.name = 'v2:beam:ub:' + element.id;
    mesh.userData = mesh.userData || {};
    mesh.userData.v2Family = 'ub';
    mesh.userData.v2Length = length;
    mesh.userData.v2Section = s;

    mesh.position.set(num(g.start && g.start.x), num(g.start && g.start.y), num(g.start && g.start.z));
    mesh.quaternion.setFromRotationMatrix(frameBasis(g.frame));
    if (g.rotation) {
      const tw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), g.rotation);
      mesh.quaternion.multiply(tw);
    }

    // Edges as a child LineSegments — inherits all parent transforms.
    const edgeGeom = new THREE.EdgesGeometry(geom, 15);
    const edges = new THREE.LineSegments(edgeGeom, v2.render.threejs.makeEdgeMaterial());
    edges.name = 'v2:beam:ub:edges:' + element.id;
    mesh.add(edges);

    return mesh;
  }

  v2.render.threejs.registerRenderer('beam:ub',   buildMeshBeamUB);
  v2.render.threejs.registerRenderer('column:ub', buildMeshBeamUB);
  v2.render.threejs.buildMeshBeamUB = buildMeshBeamUB;
})();
