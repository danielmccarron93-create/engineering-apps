/**
 * StructDraw v2 · Render Layer · threejs · material library
 * LAYER: render/threejs — Three.js material library keyed by v2 material id.
 *        The library translates a v2 catalogue Material descriptor (`steel-s300`
 *        → display.color 'var(--mat-steel)', class 'steel', …) into a single
 *        cached THREE.MeshStandardMaterial mesh builders share.
 * READS:  globalThis.THREE; window.v2.catalogues.lookupMaterial (optional)
 * WRITES: window.v2.render.threejs.{makeLibrary, makeEdgeMaterial,
 *           colorStringToHex, FALLBACK_COLORS_BY_ID, FALLBACK_COLORS_BY_CLASS,
 *           CLASS_PBR}
 *
 * Classic <script>, no build step (CLAUDE.md rules 3 & 8). Three.js r128 only
 * (CLAUDE.md rule 6). One library instance per ThreeJSRenderer — the
 * `ensureThreeJSRenderer` factory calls `makeLibrary()` and threads the result
 * through every mesh builder via `ctx.threeMaterials`. Disposing the renderer
 * disposes the library which disposes every cached material in one sweep.
 *
 * --- HOW A MESH BUILDER USES THE LIBRARY ---------------------------------
 *   const mat = ctx.threeMaterials.get(ctx.material);   // by descriptor
 *   const mat = ctx.threeMaterials.get('steel-s300');   // by id
 * Both return the SAME THREE.MeshStandardMaterial for repeated calls — so a
 * UB and a plate of the same material share one material object, which is the
 * Three.js convention for batch-render-friendly scenes.
 *
 * --- COLOUR RESOLUTION ---------------------------------------------------
 * A v2 material's `display.color` is usually a theme CSS variable
 * (`var(--mat-steel)`). The library resolves it through three layers in order:
 *   1. Hex literal '#xxxxxx' or '#xxx' → parsed directly.
 *   2. `var(--name, fallback)` → getComputedStyle(document.body) in the browser;
 *      the fallback string is recursively resolved when CSS lookup fails.
 *   3. `FALLBACK_COLORS_BY_ID[matId]` first, then `FALLBACK_COLORS_BY_CLASS[class]`,
 *      then a generic grey 0xb0b0b0. The fallback path is what the JSDOM
 *      test exercises — JSDOM resolves no CSS variables, so the literal hex
 *      stamped in `FALLBACK_COLORS_BY_ID` is the assertion target.
 * The fallback table is intentionally non-empty for every v2 material the
 * catalogue layer ships — Phase 0e populates `model.materials` from the
 * catalogue, so every Element in a migrated fixture resolves to a known id.
 *
 * See 04-catalogue-system.md §4 (Material shape — display.color,
 * structural.density), 05-render-pipeline.md §2.3 (ThreeJSRenderer shape),
 * and the v1 reference materials at js/64-3d-engine.js lines 65-80
 * (v3dMatSteel / v3dMatPlate / v3dMatBolt / v3dMatEdge).
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.render = v2.render || {};
  v2.render.threejs = v2.render.threejs || {};

  if (typeof THREE === 'undefined') {
    if (window.console && console.warn) {
      console.warn('[v2.render.threejs.materials] THREE is undefined — library unavailable');
    }
    return;
  }

  /**
   * Fallback colour palette keyed by v2 material id. Used when display.color is
   * a CSS variable we cannot resolve (JSDOM, pre-theme-load). Each value is the
   * AS-grade-typical visualisation colour — mirrors v1's v3dMatSteel /
   * v3dMatPlate / v3dMatBolt and the `--timber-color` decision (Q5, warm tan).
   */
  const FALLBACK_COLORS_BY_ID = {
    'steel-s275':              0xb0b0b0,
    'steel-s300':              0xb0b0b0,
    'steel-s355':              0xa8a8a8,
    'concrete-n20':            0xcccccc,
    'concrete-n25':            0xc8c8c8,
    'concrete-n32':            0xc4c4c4,
    'concrete-n40':            0xbcbcbc,
    'concrete-n50':            0xb4b4b4,
    'timber-mgp10':            0xd2a76a,
    'timber-mgp12':            0xc7975e,
    'timber-gl18h':            0xb9874a,
    'timber-gl22h':            0xae7b3d,
    'timber-clt-c24':          0xd5b486,
    'masonry-cmu190':          0xa09080,
    'reinforcement-n500':      0x808080,
    'screw-galv-grade-c1022':  0x707070,
    'bolt-as1252-grade-8.8':   0x606060,
    'bolt-as1252-grade-10.9':  0x585858,
  };

  /** Fallback by material class — used when the id is unknown. */
  const FALLBACK_COLORS_BY_CLASS = {
    'steel':         0xb0b0b0,
    'concrete':      0xc4c4c4,
    'timber':        0xd2a76a,
    'masonry':       0xa09080,
    'fastener':      0x606060,
    'reinforcement': 0x808080,
  };

  /** PBR defaults per material class — metalness / roughness mirror v1. */
  const CLASS_PBR = {
    'steel':         { metalness: 0.05, roughness: 0.85 },
    'concrete':      { metalness: 0.00, roughness: 0.95 },
    'timber':        { metalness: 0.00, roughness: 0.90 },
    'masonry':       { metalness: 0.00, roughness: 0.95 },
    'fastener':      { metalness: 0.15, roughness: 0.70 },
    'reinforcement': { metalness: 0.10, roughness: 0.75 },
  };

  function clampHex(n) { return (n | 0) & 0xffffff; }

  /**
   * Resolve a CSS-friendly colour string to a numeric 0xRRGGBB.
   *   '#xxxxxx' / '#xxx'                    → parsed
   *   'var(--name, fallbackStr)'            → getComputedStyle, then fallback
   *   'rgb(r,g,b)' / 'rgba(r,g,b,a)'        → packed
   *   anything unresolved                   → caller's fallback
   * @param {?string} input
   * @param {number}  fallback   0xRRGGBB if no resolution succeeds
   * @returns {number}
   */
  function colorStringToHex(input, fallback) {
    if (typeof input !== 'string' || input.length === 0) return clampHex(fallback);
    const s = input.trim();
    if (s.charAt(0) === '#') {
      const hex = s.slice(1);
      if (hex.length === 3) {
        const r = parseInt(hex.charAt(0), 16);
        const g = parseInt(hex.charAt(1), 16);
        const b = parseInt(hex.charAt(2), 16);
        if (isFinite(r) && isFinite(g) && isFinite(b)) {
          return ((r * 17) << 16) | ((g * 17) << 8) | (b * 17);
        }
      }
      if (hex.length === 6) {
        const n = parseInt(hex, 16);
        if (isFinite(n)) return clampHex(n);
      }
      return clampHex(fallback);
    }
    if (s.indexOf('var(') === 0) {
      const inside = s.slice(4, s.length - 1);
      const comma = inside.indexOf(',');
      const name = (comma === -1 ? inside : inside.slice(0, comma)).trim();
      const fallStr = comma === -1 ? '' : inside.slice(comma + 1).trim();
      if (typeof document !== 'undefined' && document.body && typeof getComputedStyle === 'function') {
        try {
          const cs = getComputedStyle(document.body);
          const v = (cs.getPropertyValue(name) || '').trim();
          if (v) return colorStringToHex(v, fallback);
        } catch (e) { /* fall through */ }
      }
      if (fallStr) return colorStringToHex(fallStr, fallback);
      return clampHex(fallback);
    }
    if (s.indexOf('rgb') === 0) {
      const open = s.indexOf('(');
      const close = s.indexOf(')');
      if (open !== -1 && close !== -1 && close > open) {
        const parts = s.slice(open + 1, close).split(',').map(function (p) { return parseFloat(p); });
        if (parts.length >= 3 &&
            isFinite(parts[0]) && isFinite(parts[1]) && isFinite(parts[2])) {
          const r = Math.max(0, Math.min(255, parts[0] | 0));
          const g = Math.max(0, Math.min(255, parts[1] | 0));
          const b = Math.max(0, Math.min(255, parts[2] | 0));
          return (r << 16) | (g << 8) | b;
        }
      }
    }
    return clampHex(fallback);
  }

  /** Picks the best fallback hex for the given v2 material descriptor. */
  function fallbackHexFor(descriptor) {
    if (descriptor) {
      if (descriptor.id && FALLBACK_COLORS_BY_ID[descriptor.id] != null) {
        return FALLBACK_COLORS_BY_ID[descriptor.id];
      }
      if (descriptor.class && FALLBACK_COLORS_BY_CLASS[descriptor.class] != null) {
        return FALLBACK_COLORS_BY_CLASS[descriptor.class];
      }
    }
    return 0xb0b0b0;
  }

  /**
   * Build a brand-new THREE.MeshStandardMaterial for the given v2 descriptor.
   * Mirrors v1's v3dMatSteel/Plate/Bolt: polygonOffset is enabled so edge
   * lines (added by mesh builders as child LineSegments) read cleanly without
   * z-fighting. Double-sided so a thin plate is visible from both faces.
   */
  function buildMaterial(descriptor, opts) {
    opts = opts || {};
    const cls = (descriptor && descriptor.class) || 'steel';
    const display = (descriptor && descriptor.display) || {};
    const pbr = CLASS_PBR[cls] || CLASS_PBR.steel;
    const colorHex = colorStringToHex(display.color, fallbackHexFor(descriptor));
    const transparent = opts.transparent === true;
    const opacity = typeof opts.opacity === 'number' ? opts.opacity : 1.0;
    const mat = new THREE.MeshStandardMaterial({
      color: colorHex,
      metalness: pbr.metalness,
      roughness: pbr.roughness,
      side: THREE.DoubleSide,
      transparent: transparent,
      opacity: opacity,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    mat.name = (descriptor && descriptor.id) ? ('v2:mat:' + descriptor.id) : 'v2:mat:__default';
    // Stamp the v2 metadata for debug — tests can `mesh.material.userData.v2MaterialId`.
    mat.userData = mat.userData || {};
    if (descriptor && descriptor.id)    mat.userData.v2MaterialId    = descriptor.id;
    if (descriptor && descriptor.class) mat.userData.v2MaterialClass = descriptor.class;
    return mat;
  }

  /**
   * Construct a per-renderer material library.
   * @param {object} [opts]
   * @param {boolean} [opts.transparent=false]   start materials transparent
   * @param {number}  [opts.opacity=1.0]
   * @returns {{
   *   get: (descriptorOrId)=>THREE.Material,
   *   dispose: ()=>void,
   *   byId: Map<string,THREE.Material>,
   *   size: ()=>number,
   * }}
   */
  function makeLibrary(opts) {
    opts = opts || {};
    const byId = new Map();

    /**
     * Resolve a v2 material descriptor or id to the cached THREE material.
     * Repeated calls with the same id return the same material object.
     * @param {?object|string} descriptorOrId
     */
    function get(descriptorOrId) {
      let descriptor = null;
      if (descriptorOrId && typeof descriptorOrId === 'object') {
        descriptor = descriptorOrId;
      } else if (typeof descriptorOrId === 'string') {
        if (v2.catalogues && typeof v2.catalogues.lookupMaterial === 'function') {
          descriptor = v2.catalogues.lookupMaterial(descriptorOrId);
        }
        if (!descriptor) descriptor = { id: descriptorOrId };
      }
      const key = (descriptor && descriptor.id) || '__default';
      if (byId.has(key)) return byId.get(key);
      const mat = buildMaterial(descriptor, opts);
      byId.set(key, mat);
      return mat;
    }

    function dispose() {
      byId.forEach(function (m) {
        if (m && typeof m.dispose === 'function') {
          try { m.dispose(); } catch (e) { /* ignore */ }
        }
      });
      byId.clear();
    }

    return {
      get: get,
      dispose: dispose,
      byId: byId,
      size: function () { return byId.size; },
    };
  }

  /**
   * The shared edge material — mesh builders attach a LineSegments outline as
   * a child of every Mesh. Matches v1's v3dMatEdge: a thin black line at 50%
   * opacity, depthTest enabled so it reads against the underlying mesh.
   */
  function makeEdgeMaterial(opts) {
    opts = opts || {};
    return new THREE.LineBasicMaterial({
      color: opts.color != null ? opts.color : 0x000000,
      // r128 LineBasicMaterial accepts linewidth but most platforms ignore for 1.
      linewidth: opts.linewidth || 1,
      transparent: true,
      opacity: typeof opts.opacity === 'number' ? opts.opacity : 0.5,
    });
  }

  v2.render.threejs.makeLibrary               = makeLibrary;
  v2.render.threejs.makeEdgeMaterial          = makeEdgeMaterial;
  v2.render.threejs.colorStringToHex          = colorStringToHex;
  v2.render.threejs.fallbackHexFor            = fallbackHexFor;
  v2.render.threejs.FALLBACK_COLORS_BY_ID     = FALLBACK_COLORS_BY_ID;
  v2.render.threejs.FALLBACK_COLORS_BY_CLASS  = FALLBACK_COLORS_BY_CLASS;
  v2.render.threejs.CLASS_PBR                 = CLASS_PBR;
})();
