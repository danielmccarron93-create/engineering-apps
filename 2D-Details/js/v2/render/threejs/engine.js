/**
 * StructDraw v2 · Render Layer · threejs · engine
 * LAYER: render/threejs — scene / camera / lights / framing infrastructure for
 *        the v2 Three.js renderer. Pure constructors — no WebGL context, no DOM
 *        beyond the optional canvas the browser code later passes to a
 *        WebGLRenderer. The JSDOM test exercises this file without WebGL.
 * READS:  globalThis.THREE (CDN-loaded in the browser, npm-loaded in setup.mjs)
 * WRITES: window.v2.render.threejs.{makeScene, makeCamera, frameSceneCamera,
 *           disposeObject, DEFAULT_ORBIT}
 *
 * Classic <script>, no build step (CLAUDE.md rules 3 & 8). Three.js r128 only
 * (CLAUDE.md rule 6) — every constructor used here is part of r128 and survives
 * the eventual ESM migration unchanged. The v1 sister file `js/64-3d-engine.js`
 * does the same job for the user-facing iso block; that file keeps running
 * until the Phase 1 pilot wires the v2 renderer into the iso block proper.
 * See 05-render-pipeline.md §2.3 (ThreeJSRenderer shape) and the v1 reference
 * at js/64-3d-engine.js (468 lines).
 *
 * --- WHAT THIS FILE BUILDS ------------------------------------------------
 *   makeScene(opts)
 *     -> { scene, group, ambient, key, fill, axes? }
 *     A fresh THREE.Scene with a `Group` for the renderer's meshes, an ambient
 *     light, two directional lights, and an optional AxesHelper. The lighting
 *     intensities mirror v1's iso engine so a side-by-side smoke test in the
 *     browser is visually comparable. The group is the renderer's mount point;
 *     meshes are added/removed there, not on the scene root.
 *
 *   makeCamera(opts)
 *     -> THREE.OrthographicCamera
 *     An ortho camera with a placeholder frustum. The frustum is sized per
 *     render via `frameSceneCamera` (or the Phase 1 pilot's own framing).
 *
 *   frameSceneCamera(camera, sceneOrGroup, orbit)
 *     -> { box, centre, size, maxExtent }
 *     Fits the camera around the scene's bounding box plus a 40 mm AS 1100
 *     pad. Orbit defaults to v1's iso angles so the v2 iso block defaults to
 *     the same vantage point as v1 — making "is this Three.js diff visible?"
 *     a clean diff. Used by the browser path; the JSDOM test does not call it.
 *
 *   disposeObject(obj)
 *     Recursive geometry + material + child dispose, copying v1's
 *     `v3dDisposeRecursive`. Used by ThreeJSRenderer.removeMesh.
 *
 * --- WHAT THIS FILE DOES NOT BUILD ----------------------------------------
 *   No WebGLRenderer. WebGL is browser-only; Phase 0g's test boundary is JSDOM
 *   so the renderer instantiation lives in the future Phase 1 pilot file that
 *   wires the v2 scene into the user-facing iso block. The materials library
 *   is its own file (`materials.js`) so disposes can stack cleanly.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.render = v2.render || {};
  v2.render.threejs = v2.render.threejs || {};

  // If THREE is not yet available (e.g., this file loaded before the CDN
  // script in a misconfigured page), record a stub namespace so a later script
  // load can still register builders without exploding. The browser's load
  // order in `index.html` puts three.min.js at the top of <body> long before
  // this file; the JSDOM harness republishes the npm THREE on `globalThis`
  // BEFORE evaluating this file (`tests/v2/setup.mjs` group 0).
  if (typeof THREE === 'undefined') {
    if (window.console && console.warn) {
      console.warn('[v2.render.threejs] THREE is undefined — engine helpers unavailable');
    }
    return;
  }

  // v1 iso-engine orbit angles, preserved verbatim so the v2 iso view defaults
  // to the same vantage point as v1 — making smoke-test diffs visually clean.
  const DEFAULT_ORBIT = Object.freeze({ theta: Math.PI * 0.25, phi: Math.PI * 0.35 });

  function num(n, dflt) { return (typeof n === 'number' && isFinite(n)) ? n : dflt; }

  /**
   * Build a fresh scene + group + lighting rig.
   *
   * Lighting matches v1's iso engine: ambient 0.5 + two directionals (key 0.7
   * from +X/+Y/+Z octant; fill 0.25 from the opposite). The `showAxes` opt
   * mounts a THREE.AxesHelper for debug. Defaults are off; the Phase 1 pilot
   * may flip it on for the iso block.
   *
   * @param {object} [opts]
   * @param {number} [opts.ambientIntensity=0.5]
   * @param {number} [opts.keyLightIntensity=0.7]
   * @param {number} [opts.fillLightIntensity=0.25]
   * @param {boolean} [opts.showAxes=false]
   * @param {number} [opts.axesSize=500]
   * @param {?(number|string|object)} [opts.background=null]   THREE-friendly bg
   * @returns {{ scene:THREE.Scene, group:THREE.Group, ambient:THREE.AmbientLight,
   *            key:THREE.DirectionalLight, fill:THREE.DirectionalLight,
   *            axes:?THREE.AxesHelper }}
   */
  function makeScene(opts) {
    opts = opts || {};
    const scene = new THREE.Scene();
    scene.background = opts.background != null ? opts.background : null;

    const group = new THREE.Group();
    group.name = 'v2-render-group';
    scene.add(group);

    const ambient = new THREE.AmbientLight(0xffffff, num(opts.ambientIntensity, 0.5));
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffffff, num(opts.keyLightIntensity, 0.7));
    key.position.set(300, 500, 400);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, num(opts.fillLightIntensity, 0.25));
    fill.position.set(-200, -100, -300);
    scene.add(fill);

    let axes = null;
    if (opts.showAxes) {
      axes = new THREE.AxesHelper(num(opts.axesSize, 500));
      if (axes.material) {
        axes.material.depthTest = false;
        // r128's AxesHelper exposes a single LineBasicMaterial — linewidth is
        // a hint most platforms ignore for 1, but we leave it for parity with v1.
        axes.material.linewidth = 2;
      }
      axes.renderOrder = 999;
      scene.add(axes);
    }
    return { scene: scene, group: group, ambient: ambient, key: key, fill: fill, axes: axes };
  }

  /**
   * Build the iso-block camera (orthographic — the iso view is always ortho).
   * The frustum is a placeholder; `frameSceneCamera` resizes it per render.
   * @param {object} [opts]
   * @param {number} [opts.near=-100000]
   * @param {number} [opts.far=100000]
   * @returns {THREE.OrthographicCamera}
   */
  function makeCamera(opts) {
    opts = opts || {};
    return new THREE.OrthographicCamera(
      -1, 1, 1, -1,
      num(opts.near, -100000), num(opts.far, 100000)
    );
  }

  /**
   * Size the camera frustum around the scene's bounding box + a 40 mm pad.
   * Mirrors v1's `v3dRenderToImage` framing. The orbit object names the iso
   * angles (theta, phi); defaults to DEFAULT_ORBIT. The camera's near/far are
   * set conservatively to ±2 × maxExtent so the box can never clip.
   * @param {THREE.OrthographicCamera} camera
   * @param {THREE.Object3D} sceneOrGroup     usually the makeScene group
   * @param {?{theta:number, phi:number}} [orbit]
   * @returns {{ box:THREE.Box3, centre:THREE.Vector3, size:THREE.Vector3, maxExtent:number }}
   */
  function frameSceneCamera(camera, sceneOrGroup, orbit) {
    orbit = orbit || DEFAULT_ORBIT;
    const box = new THREE.Box3();
    if (sceneOrGroup && sceneOrGroup.children && sceneOrGroup.children.length) {
      box.setFromObject(sceneOrGroup);
    } else {
      box.set(new THREE.Vector3(-200, -200, -200), new THREE.Vector3(200, 200, 200));
    }
    const centre = new THREE.Vector3();
    box.getCenter(centre);
    const size = new THREE.Vector3();
    box.getSize(size);
    const pad = 40;
    const maxExtent = Math.max(size.x + pad * 2, size.y + pad * 2, size.z + pad * 2, 100);
    const half = maxExtent / 2;
    camera.left = -half;   camera.right  = half;
    camera.top  = half;    camera.bottom = -half;
    camera.near = -maxExtent * 2;
    camera.far  =  maxExtent * 2;
    camera.updateProjectionMatrix();

    const dist = maxExtent;
    const sp = Math.sin(orbit.phi), cp = Math.cos(orbit.phi);
    const st = Math.sin(orbit.theta), ct = Math.cos(orbit.theta);
    camera.position.set(
      centre.x + dist * sp * ct,
      centre.y + dist * cp,
      centre.z + dist * sp * st
    );
    camera.lookAt(centre);
    return { box: box, centre: centre, size: size, maxExtent: maxExtent };
  }

  /**
   * Recursively dispose a THREE.Object3D + every child geometry/material.
   * Detaches from parent. Idempotent — calling it twice is safe (the second
   * call walks zero children).
   * Mirrors v1's `v3dDisposeRecursive` in `js/64-3d-engine.js`.
   * @param {?THREE.Object3D} obj
   */
  function disposeObject(obj) {
    if (!obj) return;
    if (obj.children && obj.children.length) {
      const kids = obj.children.slice();
      for (let i = 0; i < kids.length; i++) disposeObject(kids[i]);
    }
    if (obj.geometry && typeof obj.geometry.dispose === 'function') {
      try { obj.geometry.dispose(); } catch (e) { /* ignore */ }
    }
    if (obj.material) {
      if (Array.isArray(obj.material)) {
        for (let i = 0; i < obj.material.length; i++) {
          const m = obj.material[i];
          if (m && typeof m.dispose === 'function') {
            try { m.dispose(); } catch (e) { /* ignore */ }
          }
        }
      } else if (typeof obj.material.dispose === 'function') {
        // NB: shared materials (from the materials library) are disposed by
        // the library itself; calling dispose() on a still-referenced material
        // is benign in r128.
      }
    }
    if (obj.parent && typeof obj.parent.remove === 'function') {
      obj.parent.remove(obj);
    }
  }

  v2.render.threejs.makeScene        = makeScene;
  v2.render.threejs.makeCamera       = makeCamera;
  v2.render.threejs.frameSceneCamera = frameSceneCamera;
  v2.render.threejs.disposeObject    = disposeObject;
  v2.render.threejs.DEFAULT_ORBIT    = DEFAULT_ORBIT;
})();
