'use strict';

// Three.js r128 isometric view engine
// Extracted from dev/index.html lines 16573-17035 (2026-05-02 modular split)

// 3D ISOMETRIC VIEW ENGINE (Three.js r128)
// Renders to an offscreen canvas, then blits into the 2D sheet
// as a 4th detail block at true 1:10 scale using OrthographicCamera.
// ============================================================

let v3dScene, v3dCamera, v3dRenderer, v3dGroup;
let v3dDirty = true;
let v3dOpts = { edges: true, transparent: false, wireframe: false };

// Orbit angle only — no zoom (scale is locked to drawingScale)
let v3dOrbit = { theta: Math.PI * 0.25, phi: Math.PI * 0.35 };
let v3dOrbiting = false;  // true when user is orbiting
let v3dOrbitDrag = null;   // { x, y, theta, phi }

// ---- Materials ----
let v3dMatSteel, v3dMatPlate, v3dMatBolt, v3dMatEdge;

// Offscreen render resolution (pixels) — re-calculated on each render
let v3dTexW = 512, v3dTexH = 512;

function v3dInit() {
  v3dScene = new THREE.Scene();
  v3dScene.background = null; // transparent

  // Orthographic camera — frustum set per-render to match 1:10 scale
  v3dCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100000);

  v3dRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: false });
  v3dRenderer.setClearColor(0x000000, 0);
  v3dRenderer.setPixelRatio(1); // we control resolution ourselves

  // Lighting
  const amb = new THREE.AmbientLight(0xffffff, 0.5);
  v3dScene.add(amb);
  const dir1 = new THREE.DirectionalLight(0xffffff, 0.7);
  dir1.position.set(300, 500, 400);
  v3dScene.add(dir1);
  const dir2 = new THREE.DirectionalLight(0xffffff, 0.25);
  dir2.position.set(-200, -100, -300);
  v3dScene.add(dir2);

  // Geometry group
  v3dGroup = new THREE.Group();
  v3dScene.add(v3dGroup);

  // V24.A2 — World-axis gizmo at origin. THREE.AxesHelper draws X=red,
  // Y=green, Z=blue (industry standard). Sits in world coordinates so it
  // serves as an orientation reference for any rotated members in the scene.
  // Arm length is 500mm (5cm on a 1:10 sheet) — readable but not dominating.
  // Uses a fatter shader material (depthTest off) so it reads through meshes.
  const axesHelper = new THREE.AxesHelper(500);
  if (axesHelper.material) {
    axesHelper.material.depthTest = false;
    axesHelper.material.linewidth = 2; // hint; most platforms ignore for 1
  }
  axesHelper.renderOrder = 999;
  v3dScene.add(axesHelper);

  // Materials
  v3dMatSteel = new THREE.MeshStandardMaterial({
    color: 0xb0b0b0, metalness: 0.05, roughness: 0.85,
    transparent: true, opacity: 0.82, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
  });
  v3dMatPlate = new THREE.MeshStandardMaterial({
    color: 0xc8c0a0, metalness: 0.05, roughness: 0.85,
    transparent: true, opacity: 0.78, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
  });
  v3dMatBolt = new THREE.MeshStandardMaterial({
    color: 0x606060, metalness: 0.15, roughness: 0.70,
    transparent: true, opacity: 0.65, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
  });
  v3dMatEdge = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 1, transparent: true, opacity: 0.5 });

  v3dDirty = true;
}

// ---- Render the 3D scene to an offscreen image, return it ----
// Called from drawBlockContent when viewKey === 'isometric'
// blk has sheetX, sheetY; we compute the view extents from objects3D bounding box.
function v3dRenderToImage(blk) {
  if (!v3dRenderer || !v3dScene) return null;
  if (v3dDirty) { v3dRebuildScene(); v3dDirty = false; }

  // Compute 3D bounding box of all geometry
  const box = new THREE.Box3();
  if (v3dGroup.children.length > 0) {
    box.setFromObject(v3dGroup);
  } else {
    box.set(new THREE.Vector3(-200, -200, -200), new THREE.Vector3(200, 200, 200));
  }
  const centre = new THREE.Vector3();
  box.getCenter(centre);
  const size = new THREE.Vector3();
  box.getSize(size);

  // The view extent in real-world mm — add padding
  const pad = 40; // mm padding around content
  const extentX = size.x + pad * 2;
  const extentY = size.y + pad * 2;
  const extentZ = size.z + pad * 2;
  const maxExtent = Math.max(extentX, extentY, extentZ);

  // Sheet size of this block: maxExtent / drawingScale (in sheet-mm)
  const sheetSizeMM = maxExtent / drawingScale;
  // Convert to screen pixels
  const sheetSizePx = sheetSizeMM * viewport.zoom;

  // Set offscreen resolution (capped for performance)
  v3dTexW = Math.min(1024, Math.max(128, Math.round(sheetSizePx * DPR)));
  v3dTexH = v3dTexW; // square for isometric
  v3dRenderer.setSize(v3dTexW, v3dTexH);

  // Set orthographic frustum so 1mm real = 1 pixel / (texPx / maxExtent)
  // i.e. the frustum covers maxExtent mm in each direction
  const halfW = maxExtent / 2;
  const halfH = maxExtent / 2;
  v3dCamera.left = -halfW;
  v3dCamera.right = halfW;
  v3dCamera.top = halfH;
  v3dCamera.bottom = -halfH;
  v3dCamera.near = -maxExtent * 2;
  v3dCamera.far = maxExtent * 2;
  v3dCamera.updateProjectionMatrix();

  // Position camera based on orbit angles, looking at centre
  const dist = maxExtent;
  const sp = Math.sin(v3dOrbit.phi), cp = Math.cos(v3dOrbit.phi);
  const st = Math.sin(v3dOrbit.theta), ct = Math.cos(v3dOrbit.theta);
  v3dCamera.position.set(
    centre.x + dist * sp * ct,
    centre.y + dist * cp,
    centre.z + dist * sp * st
  );
  v3dCamera.lookAt(centre);

  // Render
  v3dRenderer.render(v3dScene, v3dCamera);

  // Return the canvas element and the sheet dimensions for blitting
  return {
    canvas: v3dRenderer.domElement,
    sheetW: sheetSizeMM,  // sheet-mm
    sheetH: sheetSizeMM
  };
}

// ---- Build I-section profile shape for extrusion ----
function v3dMakeIShape(d, bf, tf, tw, r1) {
  const shape = new THREE.Shape();
  const hd = d / 2, hbf = bf / 2, htw = tw / 2;
  const r = Math.min(r1 || 0, Math.min((bf - tw) / 4, (d - 2 * tf) / 4));

  // Start at bottom-left of bottom flange, go clockwise
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
  // Bottom flange left
  shape.lineTo(-hbf, -hd + tf);
  shape.lineTo(-hbf, -hd);

  return shape;
}

// ---- Add mesh + edges helper ----
// Edges are added as CHILDREN of the mesh so they inherit all transforms
// (position, rotation, scale) automatically — no sync needed.
function v3dAddMesh(geom, mat, parent) {
  parent = parent || v3dGroup;
  const mesh = new THREE.Mesh(geom, mat);
  parent.add(mesh);
  if (v3dOpts.edges) {
    const edgeGeom = new THREE.EdgesGeometry(geom, 15);
    const edgeLine = new THREE.LineSegments(edgeGeom, v3dMatEdge);
    // Add as child of mesh — position (0,0,0) relative to mesh = perfect alignment
    mesh.add(edgeLine);
  }
  return mesh;
}

// ---- Rebuild 3D scene from objects3D ----
function v3dDisposeRecursive(obj) {
  while (obj.children.length) {
    const c = obj.children[0];
    v3dDisposeRecursive(c);
    if (c.geometry) c.geometry.dispose();
    obj.remove(c);
  }
}
function v3dRebuildScene() {
  // Clear old geometry (recursively — edges are children of meshes)
  v3dDisposeRecursive(v3dGroup);

  // Update material options
  const opacity = v3dOpts.transparent ? 0.75 : 1.0;
  v3dMatSteel.transparent = v3dOpts.transparent;
  v3dMatSteel.opacity = opacity;
  v3dMatSteel.wireframe = v3dOpts.wireframe;
  v3dMatPlate.transparent = v3dOpts.transparent;
  v3dMatPlate.opacity = v3dOpts.transparent ? 0.70 : 1.0;
  v3dMatPlate.wireframe = v3dOpts.wireframe;
  v3dMatBolt.transparent = v3dOpts.transparent;
  v3dMatBolt.opacity = v3dOpts.transparent ? 0.55 : 1.0;
  v3dMatBolt.wireframe = v3dOpts.wireframe;
  v3dMatEdge.visible = v3dOpts.edges;

  objects3D.forEach(obj => {
    if (obj.type === 'ub') v3dBuildUB(obj);
    else if (obj.type === 'shs') v3dBuildSHS(obj);
    else if (obj.type === 'plate') v3dBuildPlate(obj);
    else if (obj.type === 'bolt') v3dBuildBolt(obj);
  });
}

// ---- Build UB in 3D ----
// UB beams span along X-axis (horizontal). I-section profile sits in Y-Z plane
// (depth d along Y, flange width bf along Z). Extrude direction (local +Z) must
// map to world +X.  Rotation about Y by -90° achieves: localZ→X, localX→-Z, localY→Y.
// V24 Phase A — apply the member's 3D frame to a Three.js pivot group.
// Legacy behaviour: Z-axis rotation only (applied via pivot.rotation.z).
// New behaviour: full orientation by constructing a quaternion from the
// frame's {axis (length, world +X in canonical), up (world +Y canonical),
// right (world +Z canonical)} basis. The canonical local frame of the
// UB / SHS / etc. meshes below is: length → local +X, depth → local +Y,
// width → local +Z. So the frame's (axis, up, right) columns form the
// rotation matrix that maps local → world.
function _v3dApplyMemberFrame(pivot, obj) {
  if (obj.axis && obj.up) {
    const f = memberFrame(obj);
    const m = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(f.axis.x, f.axis.y, f.axis.z),
      new THREE.Vector3(f.up.x, f.up.y, f.up.z),
      new THREE.Vector3(f.right.x, f.right.y, f.right.z),
    );
    pivot.quaternion.setFromRotationMatrix(m);
    return;
  }
  // Legacy path
  if (obj.rot) pivot.rotation.z = (obj.rot || 0) * Math.PI / 180;
}

function v3dBuildUB(obj) {
  const s = UB_DB[obj.section]; if (!s) return;
  const shape = v3dMakeIShape(s.d, s.bf, s.tf, s.tw, s.r1);
  const hl = obj.length / 2;

  const extrudeSettings = { depth: obj.length, bevelEnabled: false };
  const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);

  // Use a pivot group for the UB — keeps transforms clean
  // Extrude goes along local +Z. Rotate -90° about Y so it maps to world +X.
  // Profile: shape X (bf) → world -Z, shape Y (d) → world Y
  const pivot = new THREE.Group();
  pivot.position.set(obj.x || 0, obj.y || 0, obj.z || 0);
  _v3dApplyMemberFrame(pivot, obj);
  v3dGroup.add(pivot);

  const mesh = v3dAddMesh(geom, v3dMatSteel, pivot);
  mesh.rotation.set(0, Math.PI / 2, 0);   // localZ → world +X (extrusion along beam span)
  mesh.position.set(-hl, 0, 0);            // centre beam span at pivot
}

// ---- Build SHS in 3D (hollow square tube) ----
function v3dBuildSHS(obj) {
  const s = SHS_DB[obj.section]; if (!s) return;
  const B = s.B, t = s.t;
  const hB = B / 2;

  const pivot = new THREE.Group();
  pivot.position.set(obj.x || 0, obj.y || 0, obj.z || 0);
  _v3dApplyMemberFrame(pivot, obj);
  v3dGroup.add(pivot);

  // Four walls as thin boxes — length along X (matching UB convention & 2D views)
  // BoxGeometry(w=X, h=Y, d=Z), cross-section B×B in Y-Z plane
  const walls = [
    { w: obj.length, h: t, d: B, px: 0, py: hB - t / 2, pz: 0 },          // top (Y+)
    { w: obj.length, h: t, d: B, px: 0, py: -hB + t / 2, pz: 0 },         // bottom (Y-)
    { w: obj.length, h: B - 2 * t, d: t, px: 0, py: 0, pz: hB - t / 2 },  // front (Z+)
    { w: obj.length, h: B - 2 * t, d: t, px: 0, py: 0, pz: -hB + t / 2 }, // back (Z-)
  ];

  walls.forEach(w => {
    const geom = new THREE.BoxGeometry(w.w, w.h, w.d);
    const mesh = v3dAddMesh(geom, v3dMatSteel, pivot);
    mesh.position.set(w.px, w.py, w.pz);
  });
}

// ---- Build Plate in 3D ----
function v3dBuildPlate(obj) {
  if (obj.polyPts) {
    // Polygon plate: extrude a THREE.Shape along the normal axis
    const normal = obj.normal || 'z';
    const pt = obj.pt || 10;

    // Build the 2D shape from polyPts offsets
    const shape = new THREE.Shape();
    // Map polyPts to the 2D plane of the face
    const pts2d = obj.polyPts.map(p => {
      if (normal === 'z') return [p.dx, p.dy];       // face is X,Y
      if (normal === 'x') return [p.dz, p.dy];       // face is Z,Y
      return [p.dx, p.dz];                            // face is X,Z (normal=y)
    });

    shape.moveTo(pts2d[0][0], pts2d[0][1]);
    for (let i = 1; i < pts2d.length; i++) {
      shape.lineTo(pts2d[i][0], pts2d[i][1]);
    }
    shape.closePath();

    const geom = new THREE.ExtrudeGeometry(shape, { depth: pt, bevelEnabled: false });

    // Position and rotate to align extrusion direction with normal axis
    const mesh = v3dAddMesh(geom, v3dMatPlate);
    if (normal === 'z') {
      mesh.position.set(obj.x || 0, obj.y || 0, (obj.z || 0) - pt/2);
    } else if (normal === 'x') {
      mesh.rotation.set(0, Math.PI / 2, 0);
      mesh.position.set((obj.x || 0) - pt/2, obj.y || 0, obj.z || 0);
    } else { // y
      mesh.rotation.set(-Math.PI / 2, 0, 0);
      mesh.position.set(obj.x || 0, (obj.y || 0) - pt/2, obj.z || 0);
    }
    return;
  }

  // Legacy rectangular plate
  const pw = obj.pw || 200, ph = obj.ph || 200, pt = obj.pt || 10;
  const geom = new THREE.BoxGeometry(pw, ph, pt);
  const mesh = v3dAddMesh(geom, v3dMatPlate);
  mesh.position.set(obj.x || 0, obj.y || 0, obj.z || 0);
  if (obj.rot) mesh.rotation.z = (obj.rot || 0) * Math.PI / 180;
}

// ---- Build Bolt in 3D ----
function v3dBuildBolt(obj) {
  const b = BOLT_DB[obj.boltSize || 'M20']; if (!b) return;
  const gi = computeBoltGripInfo(obj);
  const r = b.d / 2;
  const ox = obj.x || 0, oy = obj.y || 0;
  const hG = gi.grip / 2;

  // Grip-centred layout along Z (same logic as 2D V14 renderers)
  const zGripL     = gi.zCentre - hG;                   // material head-side face
  const zGripR     = gi.zCentre + hG;                   // material nut-side face
  const zWashHeadL = zGripL - b.washT;                  // head washer outer face
  const zHeadOuter = zWashHeadL - b.headH;              // head chamfer face
  const zWashNutR  = zGripR + b.washT;                  // nut washer outer face
  const zNutOuter  = zWashNutR + b.nutH;                // nut outer face
  const threadProt = gi.threadProt;
  const zThreadTip = zNutOuter + threadProt;

  // Shank cylinder from under head washer to thread tip
  const shankLen = zThreadTip - zWashHeadL;
  const shankCZ  = (zWashHeadL + zThreadTip) / 2;

  // All geometry built along Y axis (Three.js cylinder default), rotated π/2 about X for Z.

  // Shank
  const shaftGeom = new THREE.CylinderGeometry(r, r, shankLen, 12);
  const shaft = v3dAddMesh(shaftGeom, v3dMatBolt);
  shaft.rotation.set(Math.PI / 2, 0, 0);
  shaft.position.set(ox, oy, shankCZ);

  // Head — hex prism
  const headR = b.headAF / 2 / Math.cos(Math.PI / 6);
  const headGeom = new THREE.CylinderGeometry(headR, headR, b.headH, 6);
  const head = v3dAddMesh(headGeom, v3dMatBolt);
  head.rotation.set(Math.PI / 2, 0, 0);
  head.position.set(ox, oy, zHeadOuter + b.headH / 2);

  // Head-side washer — disc touching grip face
  const washGeom = new THREE.CylinderGeometry(b.washOD / 2, b.washOD / 2, b.washT, 16);
  const washH = v3dAddMesh(washGeom, v3dMatBolt);
  washH.rotation.set(Math.PI / 2, 0, 0);
  washH.position.set(ox, oy, zWashHeadL + b.washT / 2);

  // Nut-side washer — disc touching grip face
  const washN = v3dAddMesh(washGeom.clone(), v3dMatBolt);
  washN.rotation.set(Math.PI / 2, 0, 0);
  washN.position.set(ox, oy, zGripR + b.washT / 2);

  // Nut — hex prism
  const nutR = b.nutAF / 2 / Math.cos(Math.PI / 6);
  const nutGeom = new THREE.CylinderGeometry(nutR, nutR, b.nutH, 6);
  const nut = v3dAddMesh(nutGeom, v3dMatBolt);
  nut.rotation.set(Math.PI / 2, 0, 0);
  nut.position.set(ox, oy, zWashNutR + b.nutH / 2);

  // Thread protrusion — thin cylinder beyond nut
  if (threadProt > 0) {
    const thGeom = new THREE.CylinderGeometry(r * 0.9, r * 0.9, threadProt, 8);
    const th = v3dAddMesh(thGeom, v3dMatBolt);
    th.rotation.set(Math.PI / 2, 0, 0);
    th.position.set(ox, oy, zNutOuter + threadProt / 2);
  }
}

// ---- Mark scene dirty (call from addObj, delObj, render, etc.) ----
function v3dMarkDirty() { v3dDirty = true; }

// ---- Orbit interaction ----
// Activated by double-clicking the ISOMETRIC label. Locked by Enter/Escape/click elsewhere.
function v3dStartOrbit(px, py) {
  v3dOrbiting = true;
  v3dOrbitDrag = { x: px, y: py, theta: v3dOrbit.theta, phi: v3dOrbit.phi };
}
function v3dStopOrbit() {
  v3dOrbiting = false;
  v3dOrbitDrag = null;
  requestRender();
}
function v3dHandleOrbitMove(px, py) {
  if (!v3dOrbiting || !v3dOrbitDrag) return;
  const dx = px - v3dOrbitDrag.x, dy = py - v3dOrbitDrag.y;
  v3dOrbit.theta = v3dOrbitDrag.theta + dx * 0.007;
  v3dOrbit.phi = Math.max(0.05, Math.min(Math.PI - 0.05, v3dOrbitDrag.phi - dy * 0.007));
  requestRender();
}
function v3dHandleOrbitDown(px, py) {
  // Start a new drag reference
  v3dOrbitDrag = { x: px, y: py, theta: v3dOrbit.theta, phi: v3dOrbit.phi };
}
function v3dHandleOrbitUp() {
  v3dOrbitDrag = null;
}

