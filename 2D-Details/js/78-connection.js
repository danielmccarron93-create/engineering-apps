'use strict';

// Connection — the central concept of the timber-screw feature.
// Added 2026-05-18 (Phase 3) for the Rothoblaas HBS Plate connection designer.
// See PlannedBuilds/timber-screws/02-data-model.md §2.4 for the full schema.
//
// A Connection groups a front entity (steel plate or timber member, depending
// on connectionType), a rear timber member, and a set of screws. It owns the
// applied load vector and the service-class / load-duration context. In
// Phase 4+ it will also own the cached check result.
//
// Phase 3 ships the entity model, the load-arrow renderer, and a pure-function
// programmatic API. Tool registration (the click-driven workflow) lands in
// Phase 3.5 once the 39-events.js dispatch tree is refactored — that's a
// separate PR scope per the project root CLAUDE.md workflow rule on
// "bug fixes do not bundle with structural refactors."


// ============================================================
// FACTORY
// ============================================================
//
// type: 'connection'
// Fields:
//   front          — { id, kind }   refs the front entity by ID + entity type
//   rear           — { id, kind }   refs the rear entity by ID
//   connectionType — 'steel-to-timber' | 'timber-to-timber' | 'steel-to-clt'
//   preDrilled     — bool
//   screws         — array of Screw entity IDs that belong to this connection
//   load           — { F_d_mag, F_d_dir, loadCase, serviceClass }
//   checks         — populated by Phase 4 rule engine; null in Phase 3
//   ruleSetVersion — stamp for forward-compat
//
// Note on entity IDs: stable across save/load (see 46-save-load.js — ent2dIdN
// is reset to max(existing IDs)+1 on load, so old IDs survive).

function mkConnection(viewKey, frontEnt, rearEnt, opts) {
  const o = opts || {};
  const defaults = {
    front: { id: frontEnt.id, kind: frontEnt.type },
    rear:  { id: rearEnt.id,  kind: rearEnt.type },
    connectionType: inferConnectionType(frontEnt, rearEnt),
    preDrilled: true,
    screws: [],
    load: {
      F_d_mag:      o.F_d_mag      != null ? o.F_d_mag      : 25.0,         // kN
      F_d_dir:      o.F_d_dir                 || { u: 0, v: -1 },           // downward default
      loadCase:     o.loadCase                || 'medium',
      serviceClass: o.serviceClass            || 'SC1'
    },
    checks: null,
    ruleSetVersion: (typeof ROTHOBLAAS_RULESET_VERSION === 'string')
                  ? ROTHOBLAAS_RULESET_VERSION
                  : 'rothoblaas-hbs-plate-eta-11-0030-2019',
    layer: 'connections-meta',
    lw: 0.5,
    ls: 'solid'
  };
  return mkEnt2D(viewKey, 'connection', Object.assign({}, defaults, o));
}


// Infer the connection type from the two member entity types.
// v1 supports steel-to-timber; the others stub for v1.1 / v1.2.
function inferConnectionType(frontEnt, rearEnt) {
  const ft = frontEnt && frontEnt.type;
  const rt = rearEnt  && rearEnt.type;
  if (ft === 'steel-plate'   && rt === 'timber-member') return 'steel-to-timber';
  if (ft === 'timber-member' && rt === 'timber-member') return 'timber-to-timber';
  // CLT detection would key off rearEnt.timberClass.family === 'clt'
  return 'steel-to-timber';   // safe default; engine will error if mismatch
}


// ============================================================
// PROGRAMMATIC API — used by both the eventual click flow and tests
// ============================================================

// Bind a screw entity to a connection. Sets screw.connectionId; appends to
// connection.screws[]. Idempotent.
function tmbrBindScrew(connection, screwEnt) {
  if (!connection || !screwEnt) return;
  if (screwEnt.connectionId === connection.id) return;
  // Detach from any previous connection first
  if (screwEnt.connectionId) tmbrUnbindScrewFromCurrent(screwEnt);
  screwEnt.connectionId = connection.id;
  if (connection.screws.indexOf(screwEnt.id) === -1) {
    connection.screws.push(screwEnt.id);
  }
  // Invalidate cached check result — geometry changed
  connection.checks = null;
}


// Unbind a screw from its current connection (if any).
function tmbrUnbindScrewFromCurrent(screwEnt) {
  if (!screwEnt || !screwEnt.connectionId) return;
  const conn = tmbrGetConnection(screwEnt.view, screwEnt.connectionId);
  if (conn) {
    const i = conn.screws.indexOf(screwEnt.id);
    if (i !== -1) conn.screws.splice(i, 1);
    conn.checks = null;
  }
  screwEnt.connectionId = null;
}


// Set / replace the connection's applied load.
function tmbrSetLoad(connection, F_d_dir, F_d_mag, opts) {
  if (!connection) return;
  // Normalise the direction vector (the engine assumes unit length).
  const m = Math.sqrt(F_d_dir.u * F_d_dir.u + F_d_dir.v * F_d_dir.v) || 1;
  connection.load.F_d_dir = { u: F_d_dir.u / m, v: F_d_dir.v / m };
  connection.load.F_d_mag = +F_d_mag || 0;
  if (opts) {
    if (opts.loadCase)     connection.load.loadCase     = opts.loadCase;
    if (opts.serviceClass) connection.load.serviceClass = opts.serviceClass;
  }
  connection.checks = null;
}


// Toggle / set the pre-drilling flag.
function tmbrSetPreDrilled(connection, value) {
  connection.preDrilled = !!value;
  connection.checks = null;
}


// ---- LOOKUPS ----

// Find a Connection entity by id. Searches the same view bucket the entity
// id should live in (callers pass viewKey; for screws we can resolve via
// screwEnt.view).
function tmbrGetConnection(viewKey, connectionId) {
  const bucket = entities2D[viewKey] || [];
  for (let i = 0; i < bucket.length; i++) {
    if (bucket[i].type === 'connection' && bucket[i].id === connectionId) return bucket[i];
  }
  return null;
}


// Find an entity by ID within a view bucket (works for any type).
function tmbrGetEntityById(viewKey, entId) {
  const bucket = entities2D[viewKey] || [];
  for (let i = 0; i < bucket.length; i++) {
    if (bucket[i].id === entId) return bucket[i];
  }
  return null;
}


// Return every Screw entity bound to the given connection.
function tmbrGetScrewsForConnection(connection) {
  if (!connection) return [];
  const out = [];
  const bucket = entities2D[connection.view] || [];
  for (let i = 0; i < bucket.length; i++) {
    if (bucket[i].type === 'screw' && bucket[i].connectionId === connection.id) {
      out.push(bucket[i]);
    }
  }
  return out;
}


// Compute a sensible "anchor point" for the connection — used as the origin
// of the load-arrow rendering and as a future inspector-selection cue. Centred
// on the rear member's centroid; if rear is missing or invalid, falls back to
// the front entity, then to (0, 0).
function tmbrConnectionAnchor(connection) {
  if (!connection) return { u: 0, v: 0 };
  let ent = null;
  if (connection.rear)  ent = tmbrGetEntityById(connection.view, connection.rear.id);
  if (!ent && connection.front) ent = tmbrGetEntityById(connection.view, connection.front.id);
  if (!ent) return { u: 0, v: 0 };
  if (ent.w != null && ent.h != null) {
    return { u: ent.u + ent.w / 2, v: ent.v + ent.h / 2 };
  }
  return { u: ent.u || 0, v: ent.v || 0 };
}


// ============================================================
// RENDERING — load arrow + member highlight overlay
// ============================================================
//
// The Connection draws as an overlay: it doesn't replace the rendering of its
// bound entities (those still render via their own draw fns), it adds the
// load arrow and a faint highlight around the bound members so the engineer
// can see at a glance which entities belong to which connection.

function drawConnection(blk, ent, cs) {
  // Skip if no load is set
  if (!ent.load || !ent.load.F_d_dir) return;

  const pm = ppm();
  const col = cs.getPropertyValue('--load-arrow-color').trim()
           || cs.getPropertyValue('--accent').trim()
           || '#cc4422';
  const muteCol = cs.getPropertyValue('--mute').trim() || '#888';

  ctx.setLineDash([]);

  // 1. Highlight the bound members with a thin coloured outline. Subtle —
  //    just enough to communicate "these belong to this connection."
  drawConnectionMemberHighlight(blk, ent, col, pm);

  // 2. Load arrow.
  drawLoadArrow(blk, ent, col, muteCol, pm);
}


// Faint coloured outline around each bound member.
function drawConnectionMemberHighlight(blk, ent, col, pm) {
  const refs = [];
  if (ent.front) refs.push(ent.front.id);
  if (ent.rear)  refs.push(ent.rear.id);

  ctx.strokeStyle = colorAlpha(col, 0.35);
  ctx.lineWidth = Math.max(0.3, LW.MW * pm * 0.6);
  ctx.setLineDash([6, 4]);   // dashed so it reads as an annotation, not a primary outline

  refs.forEach(function (id) {
    const e = tmbrGetEntityById(ent.view, id);
    if (e && e.w != null && e.h != null) {
      // Inset 4 mm so the highlight sits just inside the member outline
      const ins = 4;
      rRect(blk, e.u + ins, e.v + ins, e.w - 2 * ins, e.h - 2 * ins);
    }
  });
  ctx.setLineDash([]);
}


// The load arrow itself: a shaft pointing in F_d_dir, with an arrowhead at
// the tip and a magnitude label next to the shaft. Drawn at the connection
// anchor (rear member centroid by default).
function drawLoadArrow(blk, ent, col, muteCol, pm) {
  const a = tmbrConnectionAnchor(ent);
  const d = ent.load.F_d_dir;
  const mag = ent.load.F_d_mag;

  // Shaft length in view-local mm. Independent of magnitude — magnitude is
  // shown as text. Future enhancement: scale length with magnitude using a
  // configurable kN-per-mm ratio.
  const shaftLen = 120;    // visual length on the drawing
  const headLen  = 20;
  const headW    = 12;

  // The arrow points FROM the anchor TOWARD the direction of action. Tail at
  // anchor, tip at anchor + d * shaftLen.
  const tipU  = a.u + d.u * shaftLen;
  const tipV  = a.v + d.v * shaftLen;

  // Shaft line — drawn slightly heavier than dimensions so it reads as a force
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(0.8, LW.VIS_HEAVY * pm * 0.8);
  ctx.setLineDash([]);
  rLine(blk, a.u, a.v, tipU, tipV);

  // Arrowhead — equilateral triangle pointing along d. Two side points are at
  // tip minus (headLen along d) ± (headW along perpendicular).
  const pu = -d.v, pv = d.u;   // perpendicular CCW
  const baseU = tipU - d.u * headLen;
  const baseV = tipV - d.v * headLen;
  const leftU  = baseU + pu * (headW / 2);
  const leftV  = baseV + pv * (headW / 2);
  const rightU = baseU - pu * (headW / 2);
  const rightV = baseV - pv * (headW / 2);

  // Filled triangle for the arrowhead — use real-coord primitives via canvas
  // path (no rFillPolygon importable here; use ctx directly through real2px)
  ctx.fillStyle = col;
  ctx.beginPath();
  const tipP   = real2px(blk, tipU,   tipV);
  const leftP  = real2px(blk, leftU,  leftV);
  const rightP = real2px(blk, rightU, rightV);
  ctx.moveTo(tipP.x,   tipP.y);
  ctx.lineTo(leftP.x,  leftP.y);
  ctx.lineTo(rightP.x, rightP.y);
  ctx.closePath();
  ctx.fill();

  // Magnitude label — placed perpendicular to the shaft, offset from midpoint.
  const midU = (a.u + tipU) / 2;
  const midV = (a.v + tipV) / 2;
  const labelOffset = 18;    // perpendicular distance from shaft
  const labU = midU + pu * labelOffset;
  const labV = midV + pv * labelOffset;
  const labP = real2px(blk, labU, labV);
  const fs = Math.max(8, 2.6 * pm);
  ctx.fillStyle = col;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${fs}px system-ui`;
  ctx.fillText(`${mag.toFixed(1)} kN`, labP.x, labP.y);
  // Sub-label: load case + service class
  ctx.font = `${fs * 0.75}px system-ui`;
  ctx.fillStyle = muteCol;
  ctx.fillText(`${ent.load.loadCase} • ${ent.load.serviceClass}`,
               labP.x, labP.y + fs * 0.8);
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}


// ============================================================
// MEMORY-SAFE TEARDOWN — drop a Connection cleanly
// ============================================================
//
// Removes the Connection from entities2D and clears connectionId on all its
// screws. Doesn't delete the bound members or screws themselves (the engineer
// may want to keep them as raw drawing objects).

function tmbrDeleteConnection(connection) {
  if (!connection) return;
  // Unbind screws
  const screws = tmbrGetScrewsForConnection(connection);
  screws.forEach(function (s) { s.connectionId = null; });
  // Remove from the entity bucket
  const bucket = entities2D[connection.view];
  if (bucket) {
    const i = bucket.indexOf(connection);
    if (i !== -1) bucket.splice(i, 1);
  }
}


// ============================================================
// CONSOLE HELPER — build Dan's worked example end-to-end
// ============================================================
//
// Run from DevTools console:  tmbrCreateExampleConnection()
// Produces the exact Test 1 fixture from PlannedBuilds/timber-screws/
// 09-test-cases.md, ready for visual inspection / future check engine.

function tmbrCreateExampleConnection() {
  const vk = 'elevation';

  // 1. Timber column (GL28h, 340 × 1220, grain vertical)
  const column = mkTimberMember(vk, {
    u: 0, v: 0, w: 340, h: 1220, timberClass: 'GL28h'
  });
  addEnt2D(column);

  // 2. Steel plate over the column face (120 × 900, 10 mm thick)
  const plate = mkSteelPlate(vk, {
    u: 110, v: 200, w: 120, h: 900, thickness: 10
  });
  addEnt2D(plate);

  // 3. Connection — must exist before screws so they can bind
  const conn = mkConnection(vk, plate, column, {
    preDrilled: true,
    F_d_mag: 25.0,
    F_d_dir: { u: 0, v: -1 },         // vertical load down
    loadCase: 'medium',
    serviceClass: 'SC1'
  });
  addEnt2D(conn);
  tmbrCurrentConnectionId = conn.id;   // future placement tools bind to this

  // 4. Six screws (3 rows along grain × 2 columns across grain at 60 × 100)
  const positions = [
    [120, 200], [220, 200],   // row 1
    [120, 260], [220, 260],   // row 2
    [120, 320], [220, 320]    // row 3
  ];
  positions.forEach(function (pos) {
    const s = mkScrewEnt(vk, { u: pos[0], v: pos[1], screwSpec: 'HBSPL12200' });
    addEnt2D(s);
    tmbrBindScrew(conn, s);
  });

  requestRender();
  console.log('Connection created — id', conn.id,
              '— bound', conn.screws.length, 'screws to plate', plate.id,
              'on column', column.id);
  return { connection: conn, column: column, plate: plate };
}
