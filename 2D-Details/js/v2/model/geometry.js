/**
 * StructDraw v2 · Model Layer · geometry
 * LAYER: model — the Geometry discriminated union, its factories and pure helpers.
 * READS:  (nothing — fully pure)
 * WRITES: window.v2.model.{linearMember, plate, pointInstance, annotation, region,
 *           polyline, point3, vec3, identityFrame, frameFromAxis, geometryKind,
 *           geometryViewId, isModelLevel, isViewLocal, geometryBoundingBox,
 *           bboxIntersects, bboxUnion, GEOMETRY_KINDS}
 *
 * Classic <script>, no build step. Pure data + pure functions — no DOM, no canvas.
 * See 03-model-layer.md §4. Heavier geometric math (joint trim, occlusion,
 * projection) is a later `geometry/` folder; this file only assembles the
 * discriminated-union shapes and the AABB helpers the model layer itself needs.
 *
 * --- JSDoc shapes ----------------------------------------------------------
 * @typedef {{x:number, y:number, z:number}} Point3D
 * @typedef {{x:number, y:number}}           Point2D
 * @typedef {{x:number, y:number, z:number}} Vector3D
 * @typedef {{axisU:Vector3D, axisV:Vector3D, axisW:Vector3D}} Frame3D  orthonormal triad
 * @typedef {Point3D[]} Polygon3D
 * @typedef {Point2D[]} Polygon2D
 * @typedef {{min:Point3D, max:Point3D}} BoundingBox3D
 *
 * @typedef {object} LinearMember   beam, column, brace, timber member
 * @property {'linear'} kind
 * @property {Point3D}  start
 * @property {Point3D}  end
 * @property {Frame3D}  frame      axisU = start->end long axis
 * @property {number}   rotation   rotation about axisU (radians)
 *
 * @typedef {object} Plate
 * @property {'plate'}    kind
 * @property {Point3D}    origin
 * @property {Polygon3D}  polygon  vertices on the plate plane (world coords)
 * @property {Frame3D}    frame    plate-local frame (normal = axisW)
 * @property {number}     thickness
 *
 * @typedef {object} PointInstance   bolt, screw, anchor
 * @property {'point'}  kind
 * @property {Point3D}  location
 * @property {Vector3D} normal       head -> tip direction
 * @property {number}   rotation     rotation about normal (radians)
 * @property {number} [embedmentDepth]
 *
 * @typedef {object} Annotation      dimension, leader, tag, callout — view-local
 * @property {'annotation'} kind
 * @property {string}    viewId
 * @property {Point2D[]} points      view-space (paper-space mm)
 * @property {string[]}  refs        referenced model elements
 * @property {Object}    data        type-specific fields
 *
 * @typedef {object} Region          hatch / masonry / concrete poly
 * @property {'region'} kind
 * @property {?string}  viewId       null = model-level solid, else view-local hatch
 * @property {Polygon3D|Polygon2D} polygon
 * @property {Frame3D} [frame]
 *
 * @typedef {object} Polyline        break line, leader path, free polyline
 * @property {'polyline'} kind
 * @property {?string}  viewId
 * @property {(Point3D|Point2D)[]} points
 * @property {boolean}  closed
 *
 * @typedef {LinearMember|Plate|PointInstance|Annotation|Region|Polyline} Geometry
 * ---------------------------------------------------------------------------
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.model = v2.model || {};

  const GEOMETRY_KINDS = Object.freeze([
    'linear', 'plate', 'point', 'annotation', 'region', 'polyline',
  ]);

  // --- tiny private vector math (file-local; not a shared module yet) --------
  function num(n) { return typeof n === 'number' && isFinite(n) ? n : 0; }
  function asP3(p) { p = p || {}; return { x: num(p.x), y: num(p.y), z: num(p.z) }; }
  function asP2(p) { p = p || {}; return { x: num(p.x), y: num(p.y) }; }
  function sub3(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
  function dot3(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
  function cross3(a, b) {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x,
    };
  }
  function len3(a) { return Math.sqrt(dot3(a, a)); }
  function scale3(a, s) { return { x: a.x * s, y: a.y * s, z: a.z * s }; }
  function normalize3(a) {
    const L = len3(a);
    return L > 1e-9 ? scale3(a, 1 / L) : { x: 0, y: 0, z: 0 };
  }

  // --- public point/vector constructors -------------------------------------
  /** @returns {Point3D} */
  function point3(x, y, z) { return { x: num(x), y: num(y), z: num(z) }; }
  /** @returns {Vector3D} */
  function vec3(x, y, z) { return { x: num(x), y: num(y), z: num(z) }; }

  /** The world-aligned orthonormal frame. @returns {Frame3D} */
  function identityFrame() {
    return {
      axisU: { x: 1, y: 0, z: 0 },
      axisV: { x: 0, y: 1, z: 0 },
      axisW: { x: 0, y: 0, z: 1 },
    };
  }

  /**
   * Build an orthonormal Frame3D for a linear member running start -> end.
   * axisU follows the member; axisV is the "up" in the section plane derived
   * from upHint via Gram-Schmidt; axisW completes the right-handed triad.
   * Degenerate (zero-length) members return the identity frame.
   * @param {Point3D} start
   * @param {Point3D} end
   * @param {Vector3D} [upHint]  defaults to world +Z
   * @returns {Frame3D}
   */
  function frameFromAxis(start, end, upHint) {
    const dir = sub3(asP3(end), asP3(start));
    if (len3(dir) <= 1e-9) return identityFrame();
    const axisU = normalize3(dir);
    let up = normalize3(upHint || { x: 0, y: 0, z: 1 });
    if (len3(up) <= 1e-9 || Math.abs(dot3(axisU, up)) > 0.999) {
      up = { x: 0, y: 1, z: 0 };
      if (Math.abs(dot3(axisU, up)) > 0.999) up = { x: 1, y: 0, z: 0 };
    }
    let axisV = normalize3(sub3(up, scale3(axisU, dot3(up, axisU))));
    if (len3(axisV) <= 1e-9) axisV = { x: 0, y: 1, z: 0 };
    const axisW = normalize3(cross3(axisU, axisV));
    return { axisU, axisV, axisW };
  }

  // --- Geometry factories ---------------------------------------------------

  /**
   * @param {{start:Point3D, end:Point3D, frame?:Frame3D, rotation?:number, upHint?:Vector3D}} spec
   * @returns {LinearMember}
   */
  function linearMember(spec) {
    spec = spec || {};
    if (!spec.start || !spec.end) {
      throw new Error('linearMember: start and end Point3D are required');
    }
    return {
      kind: 'linear',
      start: asP3(spec.start),
      end: asP3(spec.end),
      frame: spec.frame || frameFromAxis(spec.start, spec.end, spec.upHint),
      rotation: num(spec.rotation),
    };
  }

  /**
   * @param {{polygon:Polygon3D, origin?:Point3D, frame?:Frame3D, thickness?:number}} spec
   * @returns {Plate}
   */
  function plate(spec) {
    spec = spec || {};
    if (!Array.isArray(spec.polygon) || spec.polygon.length < 3) {
      throw new Error('plate: polygon with >= 3 Point3D vertices is required');
    }
    return {
      kind: 'plate',
      origin: asP3(spec.origin || spec.polygon[0]),
      polygon: spec.polygon.map(asP3),
      frame: spec.frame || identityFrame(),
      thickness: num(spec.thickness),
    };
  }

  /**
   * @param {{location:Point3D, normal?:Vector3D, rotation?:number, embedmentDepth?:number}} spec
   * @returns {PointInstance}
   */
  function pointInstance(spec) {
    spec = spec || {};
    if (!spec.location) {
      throw new Error('pointInstance: location Point3D is required');
    }
    const g = {
      kind: 'point',
      location: asP3(spec.location),
      normal: spec.normal ? asP3(spec.normal) : { x: 0, y: 0, z: 1 },
      rotation: num(spec.rotation),
    };
    if (typeof spec.embedmentDepth === 'number') {
      g.embedmentDepth = spec.embedmentDepth;
    }
    return g;
  }

  /**
   * @param {{viewId:string, points:Point2D[], refs?:string[], data?:Object}} spec
   * @returns {Annotation}
   */
  function annotation(spec) {
    spec = spec || {};
    if (spec.viewId == null) {
      throw new Error('annotation: viewId is required (annotations are view-local)');
    }
    if (!Array.isArray(spec.points)) {
      throw new Error('annotation: a points array is required');
    }
    return {
      kind: 'annotation',
      viewId: spec.viewId,
      points: spec.points.map(asP2),
      refs: Array.isArray(spec.refs) ? spec.refs.slice() : [],
      data: spec.data ? Object.assign({}, spec.data) : {},
    };
  }

  /**
   * @param {{polygon:Array, viewId?:?string, frame?:Frame3D}} spec
   * @returns {Region}
   */
  function region(spec) {
    spec = spec || {};
    if (!Array.isArray(spec.polygon) || spec.polygon.length < 3) {
      throw new Error('region: polygon with >= 3 vertices is required');
    }
    const viewId = spec.viewId == null ? null : spec.viewId;
    const g = {
      kind: 'region',
      viewId: viewId,
      polygon: spec.polygon.map(viewId == null ? asP3 : asP2),
    };
    if (spec.frame) g.frame = spec.frame;
    return g;
  }

  /**
   * @param {{points:Array, viewId?:?string, closed?:boolean}} spec
   * @returns {Polyline}
   */
  function polyline(spec) {
    spec = spec || {};
    if (!Array.isArray(spec.points) || spec.points.length < 2) {
      throw new Error('polyline: a points array with >= 2 entries is required');
    }
    const viewId = spec.viewId == null ? null : spec.viewId;
    return {
      kind: 'polyline',
      viewId: viewId,
      points: spec.points.map(viewId == null ? asP3 : asP2),
      closed: spec.closed === true,
    };
  }

  // --- discriminator / classification helpers -------------------------------

  /** @param {Geometry} geom @returns {?string} the geometry.kind discriminator */
  function geometryKind(geom) {
    return geom && typeof geom.kind === 'string' ? geom.kind : null;
  }

  /**
   * The view a geometry belongs to, or null if it is model-level (3D).
   * linear/plate/point are always model-level; annotation is always view-local;
   * region/polyline are view-local when their viewId is a non-null string.
   * @param {Geometry} geom
   * @returns {?string}
   */
  function geometryViewId(geom) {
    if (!geom) return null;
    return geom.viewId == null ? null : geom.viewId;
  }

  /** @param {Geometry} geom @returns {boolean} */
  function isViewLocal(geom) { return geometryViewId(geom) != null; }
  /** @param {Geometry} geom @returns {boolean} */
  function isModelLevel(geom) { return geometryViewId(geom) == null; }

  // --- bounding boxes -------------------------------------------------------

  function bboxOfPoints(points) {
    if (!points || !points.length) return null;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < points.length; i++) {
      const p = points[i] || {};
      const x = num(p.x), y = num(p.y), z = num(p.z);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }
    return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } };
  }

  /**
   * Axis-aligned bounding box of a geometry. For view-local geometry the box is
   * in view-space (z = 0). Scaffold-level: a coarse AABB sufficient as a dirty
   * hint; the render layer computes section-accurate bounds later.
   * @param {Geometry} geom
   * @returns {?BoundingBox3D}
   */
  function geometryBoundingBox(geom) {
    if (!geom) return null;
    switch (geom.kind) {
      case 'linear': return bboxOfPoints([geom.start, geom.end]);
      case 'point':  return bboxOfPoints([geom.location]);
      case 'plate':  return bboxOfPoints(geom.polygon.concat([geom.origin]));
      case 'annotation':
      case 'polyline': return bboxOfPoints(geom.points);
      case 'region': return bboxOfPoints(geom.polygon);
      default: return null;
    }
  }

  /**
   * True if two 3D bounding boxes overlap (inclusive on edges).
   * @param {?BoundingBox3D} a
   * @param {?BoundingBox3D} b
   * @returns {boolean}
   */
  function bboxIntersects(a, b) {
    if (!a || !b) return false;
    return (
      a.min.x <= b.max.x && a.max.x >= b.min.x &&
      a.min.y <= b.max.y && a.max.y >= b.min.y &&
      a.min.z <= b.max.z && a.max.z >= b.min.z
    );
  }

  /**
   * Smallest box enclosing both inputs. Tolerates a null operand.
   * @param {?BoundingBox3D} a
   * @param {?BoundingBox3D} b
   * @returns {?BoundingBox3D}
   */
  function bboxUnion(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    return {
      min: {
        x: Math.min(a.min.x, b.min.x),
        y: Math.min(a.min.y, b.min.y),
        z: Math.min(a.min.z, b.min.z),
      },
      max: {
        x: Math.max(a.max.x, b.max.x),
        y: Math.max(a.max.y, b.max.y),
        z: Math.max(a.max.z, b.max.z),
      },
    };
  }

  v2.model.GEOMETRY_KINDS     = GEOMETRY_KINDS;
  v2.model.point3             = point3;
  v2.model.vec3               = vec3;
  v2.model.identityFrame      = identityFrame;
  v2.model.frameFromAxis      = frameFromAxis;
  v2.model.linearMember       = linearMember;
  v2.model.plate              = plate;
  v2.model.pointInstance      = pointInstance;
  v2.model.annotation         = annotation;
  v2.model.region             = region;
  v2.model.polyline           = polyline;
  v2.model.geometryKind       = geometryKind;
  v2.model.geometryViewId     = geometryViewId;
  v2.model.isViewLocal        = isViewLocal;
  v2.model.isModelLevel       = isModelLevel;
  v2.model.geometryBoundingBox = geometryBoundingBox;
  v2.model.bboxIntersects     = bboxIntersects;
  v2.model.bboxUnion          = bboxUnion;
})();
