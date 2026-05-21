/**
 * StructDraw v2 · Render Layer · threejs · build mesh beam SHS
 * LAYER: render/threejs — Square Hollow Section mesh builder. Consumes a
 *        RenderContext and returns a THREE.Group (four wall boxes + edges).
 * READS:  globalThis.THREE; window.v2.render.threejs.{makeEdgeMaterial,
 *           registerRenderer}
 * WRITES: registers itself at `beam:shs` AND `column:shs` — an SHS used as a
 *           column has the same hollow profile / material / wall thickness,
 *           just a vertical orientation conferred by the LinearMember frame.
 *
 * Classic <script>, no build step (CLAUDE.md rules 3 & 8). Three.js r128 only.
 * The SHS is modelled as four BoxGeometry wall slabs assembled into a Group —
 * the same approach as v1's `v3dBuildSHS` so a side-by-side smoke test in the
 * browser shows the same hollow profile (interior visible through the cut
 * faces). ExtrudeGeometry of a hollow polygon would also work but BoxGeometry
 * gives cleaner edges and a smaller vertex count for the determinism check.
 *
 * --- LOCAL → WORLD MAPPING -------------------------------------------------
 * Each wall box has its long axis along local +Z; the four walls sit in a
 * B×B cross-section in the X-Y plane. The Group is positioned at `start` and
 * oriented so:
 *   local +X (right/left wall direction)      ←  axisW
 *   local +Y (top/bottom wall direction)      ←  axisV
 *   local +Z (extrusion direction)            ←  axisU = start → end
 * The walls are shifted along +Z by length/2 so the box covers 0..length
 * along the local +Z axis, putting the group's origin at the `start` end.
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

  /** SHS section dims from the catalogue Type — { B, t }. */
  function sectionFor(ctx) {
    const t = ctx && ctx.type;
    if (!t) return null;
    if (!(t.B > 0) || !(t.t > 0)) return null;
    return { B: t.B, t: t.t };
  }

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

  function buildMeshBeamSHS(element, ctx) {
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

    const B = s.B, wt = s.t;
    const hB = B / 2;

    const group = new THREE.Group();
    group.name = 'v2:beam:shs:' + element.id;
    group.userData = group.userData || {};
    group.userData.v2Family = 'shs';
    group.userData.v2Length = length;
    group.userData.v2Section = s;

    const material = (ctx.threeMaterials && typeof ctx.threeMaterials.get === 'function')
      ? ctx.threeMaterials.get(ctx.material || element.materialId)
      : new THREE.MeshStandardMaterial({ color: 0xa8a8a8 });

    // Four wall slabs. BoxGeometry(width=X, height=Y, depth=Z) — depth is the
    // extrusion direction. Centre each box at z = length/2 so the group runs
    // 0..length along local +Z (matching the extrude direction of UB above).
    const walls = [
      { w: B,            h: wt,           d: length, px: 0,           py:  hB - wt / 2 },
      { w: B,            h: wt,           d: length, px: 0,           py: -hB + wt / 2 },
      { w: wt,           h: B - 2 * wt,   d: length, px:  hB - wt / 2, py: 0           },
      { w: wt,           h: B - 2 * wt,   d: length, px: -hB + wt / 2, py: 0           },
    ];
    for (let i = 0; i < walls.length; i++) {
      const wDef = walls[i];
      const geom = new THREE.BoxGeometry(wDef.w, wDef.h, wDef.d);
      geom.name = 'v2:beam:shs:wall' + i + ':' + element.id;
      const mesh = new THREE.Mesh(geom, material);
      mesh.position.set(wDef.px, wDef.py, length / 2);
      mesh.name = 'v2:beam:shs:wall' + i + ':' + element.id;
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geom, 15),
        v2.render.threejs.makeEdgeMaterial());
      mesh.add(edges);
      group.add(mesh);
    }

    group.position.set(num(g.start && g.start.x), num(g.start && g.start.y), num(g.start && g.start.z));
    group.quaternion.setFromRotationMatrix(frameBasis(g.frame));
    if (g.rotation) {
      const tw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), g.rotation);
      group.quaternion.multiply(tw);
    }
    return group;
  }

  v2.render.threejs.registerRenderer('beam:shs',   buildMeshBeamSHS);
  v2.render.threejs.registerRenderer('column:shs', buildMeshBeamSHS);
  v2.render.threejs.buildMeshBeamSHS = buildMeshBeamSHS;
})();
