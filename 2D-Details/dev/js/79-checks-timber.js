'use strict';

// Timber-screw connection rule engine — the live checks.
// Added 2026-05-18 (Phase 4) for the Rothoblaas HBS Plate connection designer.
// See dev/feature-timber-screws/03-rule-engine.md for the algorithm spec, and
// 09-test-cases.md for the verification fixtures.
//
// Top-level API:
//   checkConnection(connection, model?)  → ConnectionCheckResult
//
// The result is the single source of truth for the inspector (Phase 6), the
// canvas-overlay renderer (Phase 5), and the export pipeline. Every number is
// traceable to its formula and table source so an engineer can audit the calc.
//
// Pure function: no DOM, no canvas, no side effects on the connection.
// Caches result on connection.checks if caller wishes (engine itself does not).
//
// Implementation strategy: walk the eight steps from 03-rule-engine.md §3
// exactly, emit the structured result, return.


// ============================================================
// TOP-LEVEL
// ============================================================

function checkConnection(connection, model) {
  // Result skeleton — populated as we go
  const result = {
    connectionId: connection ? connection.id : null,
    timestamp:    Date.now(),
    ruleSetVersion: null,
    alpha: null,
    epsilon: 90,
    loadGrainComponent: 0,
    loadCrossGrainComponent: 0,
    edgeChecks: [],
    pairChecks: [],
    rowChecks: [],
    capacity: {
      perScrew: [],
      groupReduction: [],
      R_V_d_total: 0,
      F_d_applied: 0,
      eta: 0,
      pass: false,
      multiplierTrace: null
    },
    overall: 'PASS',
    failingItems: [],
    warnings: []
  };

  if (!connection) {
    result.overall = 'ERROR';
    result.failingItems.push({ kind: 'input', detail: 'No connection provided' });
    return result;
  }

  // -- Step 1: Resolve rule context --
  const ctx = _resolveContext(connection, model, result);
  if (ctx.error) {
    result.overall = 'ERROR';
    return result;
  }
  result.ruleSetVersion = ctx.ruleSet.id + ' (' + (connection.ruleSetVersion || 'unversioned') + ')';

  // Bail early if no screws — geometry-less connection
  if (ctx.screws.length === 0) {
    result.overall = 'WARN';
    result.warnings.push('Connection has no screws — add screws to evaluate.');
    return result;
  }

  // -- Step 2: Geometric reference frame --
  const frame = _buildGeometricFrame(connection, ctx);
  result.alpha = frame.alpha;
  result.epsilon = frame.epsilon;
  result.loadGrainComponent     = frame.F_dot_grain;
  result.loadCrossGrainComponent = frame.F_dot_perp;

  // -- Mixed-diameter guard (out of v1 scope) --
  const diameters = new Set(ctx.screws.map(function (s) {
    const sp = getScrewSpec(s.screwSpec);
    return sp ? sp.d : null;
  }));
  if (diameters.size > 1) {
    result.overall = 'ERROR';
    result.failingItems.push({
      kind: 'mixed-diameter',
      detail: 'Mixed screw diameters in connection — v1 requires uniform diameter.'
    });
    return result;
  }
  const d = [...diameters][0];
  if (!d) {
    result.overall = 'ERROR';
    result.failingItems.push({ kind: 'screw-spec', detail: 'Screw spec not found in catalogue.' });
    return result;
  }
  ctx.d = d;

  // -- Step 3: Edge classification + Step 4: required values --
  const required = _resolveRequiredDistances(ctx, frame, result);

  // -- Step 5: Per-screw edge-distance checks --
  result.edgeChecks = _checkEdgeDistances(ctx, frame, required);

  // -- Step 6: Pair-wise spacing checks --
  result.pairChecks = _checkPairSpacing(ctx, frame, required);

  // -- Step 7: n_ef row detection --
  result.rowChecks = _detectRows(ctx, frame, required);

  // -- Step 8: Capacity calculation --
  result.capacity = _computeCapacity(ctx, frame, result.rowChecks);

  // -- Step 9: Roll up --
  _rollUp(result, ctx);

  return result;
}


// ============================================================
// STEP 1 — RULE CONTEXT
// ============================================================

function _resolveContext(connection, model, result) {
  // Resolve entities via either a passed-in model or the global entities2D.
  // The model contract is purely { getEntityById(id) → Entity }.
  const view = connection.view;
  const lookup = (model && typeof model.getEntityById === 'function')
    ? model.getEntityById
    : function (id) { return tmbrGetEntityById(view, id); };

  const ctx = {
    connection: connection,
    view: view,
    front: lookup(connection.front && connection.front.id),
    rear:  lookup(connection.rear  && connection.rear.id),
    screws: (connection.screws || [])
              .map(lookup)
              .filter(function (s) { return s && s.type === 'screw'; })
  };

  if (!ctx.rear) {
    result.failingItems.push({ kind: 'missing-entity', detail: 'Rear timber member not found.' });
    ctx.error = true;
    return ctx;
  }
  if (!ctx.front) {
    result.failingItems.push({ kind: 'missing-entity', detail: 'Front entity (plate or member) not found.' });
    ctx.error = true;
    return ctx;
  }

  // Substrate family (from rear member's class)
  const rearClass = getTimberClass(ctx.rear.timberClass);
  if (!rearClass) {
    result.failingItems.push({
      kind: 'timber-class',
      detail: 'TimberClass "' + ctx.rear.timberClass + '" not in catalogue.'
    });
    ctx.error = true;
    return ctx;
  }
  ctx.rearClass = rearClass;

  // Pick rule set
  // CLT lateral face has its own family; for v1 we treat 'clt' as a stub.
  let ruleFamily = rearClass.family;
  if (ruleFamily === 'mgp') ruleFamily = 'mgp';
  ctx.ruleSet = getRuleSet(connection.connectionType, ruleFamily, !!connection.preDrilled);
  if (!ctx.ruleSet) {
    result.failingItems.push({
      kind: 'no-rule-set',
      detail: 'No rule set matches (' + connection.connectionType + ', ' + ruleFamily +
              ', preDrilled=' + connection.preDrilled + ').'
    });
    ctx.error = true;
    return ctx;
  }

  // Modifiers
  ctx.isTimberToTimber = (connection.connectionType === 'timber-to-timber');
  ctx.isDouglasFir = /doug.?fir/i.test(rearClass.species || '');

  // Density adjustment (capacity-only; spacings unchanged)
  ctx.k_dens_v = rearClass.k_dens_v || 1.0;
  if (Math.abs(ctx.k_dens_v - 1.0) > 0.001 && (rearClass.rho_k || 0) > 385) {
    result.warnings.push(
      'Substrate ' + ctx.rear.timberClass + ' ρₖ = ' + rearClass.rho_k +
      ' > base 385; k_dens = ' + ctx.k_dens_v.toFixed(2) + ' applied to capacity.'
    );
  }

  // Service class + load duration → k_mod
  const load = connection.load || {};
  ctx.k_mod = getKmod(load.serviceClass || 'SC1', load.loadCase || 'medium');
  ctx.gamma_M = (typeof GAMMA_M_CONNECTIONS === 'number') ? GAMMA_M_CONNECTIONS : 1.3;
  ctx.serviceClass = load.serviceClass || 'SC1';
  ctx.loadCase     = load.loadCase     || 'medium';

  // Plate thickness for capacity lookup
  ctx.plateThickness = (ctx.front.thickness != null) ? ctx.front.thickness : 10;

  // Note re: ε / α ambiguity (Q1 in open-questions.md)
  result.warnings.push(
    'Using p. 216 R_V,90,k (ε=90°) for all α — conservative placeholder pending Q1.'
  );

  return ctx;
}


// ============================================================
// STEP 2 — GEOMETRIC REFERENCE FRAME
// ============================================================

function _buildGeometricFrame(connection, ctx) {
  const g = ctx.rear.grainDir || { u: 0, v: 1 };
  const grain = unit2D(g);
  const perp  = perp2D(grain);

  const F = connection.load && connection.load.F_d_dir ? connection.load.F_d_dir : { u: 0, v: -1 };
  const Fhat = unit2D(F);

  // α: angle between F and grain, normalised to [0, 90°]
  const alpha = angleBetweenSymmetric(Fhat, grain);
  // ε: screw axis vs grain. For v1 we assume the screw drives perpendicular
  // to the page (head-on view) and the in-plane vectors are grain-aligned —
  // so ε = 90°. Real ε ≠ 90° support is v1.x.
  const epsilon = 90;

  const F_dot_grain = Fhat.u * grain.u + Fhat.v * grain.v;
  const F_dot_perp  = Fhat.u * perp.u  + Fhat.v * perp.v;

  return {
    grain: grain,
    perp:  perp,
    Fhat:  Fhat,
    alpha: alpha,
    epsilon: epsilon,
    F_dot_grain: F_dot_grain,
    F_dot_perp:  F_dot_perp
  };
}


// ============================================================
// STEP 3 + 4 — EDGE CLASSIFICATION AND REQUIRED VALUES
// ============================================================

function _resolveRequiredDistances(ctx, frame, result) {
  const d = ctx.d;
  const a = frame.alpha;
  const rs = ctx.ruleSet;

  // Baseline values at this α
  let a1_req  = interpRuleAtAlpha(rs, 'a1',  d, a);
  let a2_req  = interpRuleAtAlpha(rs, 'a2',  d, a);
  let a3t_req = interpRuleAtAlpha(rs, 'a3t', d, a);
  let a3c_req = interpRuleAtAlpha(rs, 'a3c', d, a);
  let a4t_req = interpRuleAtAlpha(rs, 'a4t', d, a);
  let a4c_req = interpRuleAtAlpha(rs, 'a4c', d, a);

  // Modifiers — apply in the documented order
  if (ctx.isDouglasFir) {
    a1_req  *= 1.5;
    a3t_req *= 1.5;
    a3c_req *= 1.5;
    result.warnings.push('Douglas fir substrate — a₁ and a₃ multiplied by 1.5 (Rothoblaas p. 221 note).');
  }
  if (ctx.isTimberToTimber) {
    a1_req *= 1.5;
    a2_req *= 1.5;
    result.warnings.push('Timber-to-timber connection — a₁ and a₂ multiplied by 1.5 (Rothoblaas p. 221 note).');
  }

  return {
    a1: a1_req, a2: a2_req,
    a3t: a3t_req, a3c: a3c_req,
    a4t: a4t_req, a4c: a4c_req,
    formulas: {
      a1:  ruleFormulaString(rs, 'a1',  a),
      a2:  ruleFormulaString(rs, 'a2',  a),
      a3t: ruleFormulaString(rs, 'a3t', a),
      a3c: ruleFormulaString(rs, 'a3c', a),
      a4t: ruleFormulaString(rs, 'a4t', a),
      a4c: ruleFormulaString(rs, 'a4c', a)
    }
  };
}


// ============================================================
// STEP 5 — PER-SCREW EDGE-DISTANCE CHECKS
// ============================================================

function _checkEdgeDistances(ctx, frame, required) {
  const rear = ctx.rear;
  const out = [];

  // Build the four AABB edges with their outward normals + edge type
  // (end = perpendicular to grain → a3 family; side = parallel → a4 family)
  // Uses timberMemberEdges from 75-timber-conn-entities.js
  const edges = timberMemberEdges(rear).map(function (e) {
    // Compute the signed perpendicular distance from each screw to this edge.
    // Edge midpoints + normals are derived from the AABB. The
    // outward normals are axis-aligned: bottom (0,-1), top (0,1), left (-1,0),
    // right (1,0). For point P, distance to edge along outward normal is:
    //   bottom: rearY - 0 ?  Actually: distance = perpendicular component.
    // For the bottom edge at v = rear.v with normal (0,-1):
    //   distance from screw at (su, sv) along outward normal = rear.v - sv (negative if inside)
    // Cleaner: each edge is one face of the AABB. The "applied" distance is
    // the distance from the screw to that face inside the member.
    let applied;
    if (e.id === 'bottom')      applied = arguments[2].v - rear.v;
    else if (e.id === 'top')    applied = (rear.v + rear.h) - arguments[2].v;
    else if (e.id === 'left')   applied = arguments[2].u - rear.u;
    else if (e.id === 'right') applied = (rear.u + rear.w) - arguments[2].u;
    return Object.assign({}, e, { applied: applied });
  });

  // The arguments[2] trick above is fragile — refactor to a pure helper.
  function appliedDistance(screw, edge) {
    if (edge.id === 'bottom') return screw.v - rear.v;
    if (edge.id === 'top')    return (rear.v + rear.h) - screw.v;
    if (edge.id === 'left')   return screw.u - rear.u;
    if (edge.id === 'right')  return (rear.u + rear.w) - screw.u;
    return NaN;
  }

  // For each screw, classify each edge by load direction, look up required, compare.
  const screws = ctx.screws;
  for (let i = 0; i < screws.length; i++) {
    const screw = screws[i];
    const results = [];
    const edgesForScrew = timberMemberEdges(rear);
    for (let j = 0; j < edgesForScrew.length; j++) {
      const e = edgesForScrew[j];
      const classification = classifyEdgeByLoad(frame.Fhat, e.normal);
      let ruleType, req, formula;
      if (e.type === 'end') {
        if (classification === 'stressed') { ruleType = 'a3t'; req = required.a3t; formula = required.formulas.a3t; }
        else                                { ruleType = 'a3c'; req = required.a3c; formula = required.formulas.a3c; }
      } else { // side
        if (classification === 'stressed') { ruleType = 'a4t'; req = required.a4t; formula = required.formulas.a4t; }
        else                                { ruleType = 'a4c'; req = required.a4c; formula = required.formulas.a4c; }
      }
      const applied = appliedDistance(screw, e);
      const pass = (applied + 1e-6) >= req;
      results.push({
        edgeId:        e.id,
        edgeType:      e.type,
        classification: classification,
        ruleType:      ruleType,
        applied:       applied,
        required:      req,
        formula:       formula,
        pass:          pass,
        severity:      pass ? 'ok' : 'fail'
      });
    }
    out.push({ screwId: screw.id, results: results });
  }
  return out;
}


// ============================================================
// STEP 6 — PAIR-WISE SPACING
// ============================================================

function _checkPairSpacing(ctx, frame, required) {
  const screws = ctx.screws;
  const grain = frame.grain;
  const perp  = frame.perp;
  const out = [];

  for (let i = 0; i < screws.length; i++) {
    for (let j = i + 1; j < screws.length; j++) {
      const a = screws[i], b = screws[j];
      const du_world = b.u - a.u;
      const dv_world = b.v - a.v;
      // Project into grain frame: Δu = along grain, Δv = across grain
      const delta_along = du_world * grain.u + dv_world * grain.v;
      const delta_cross = du_world * perp.u  + dv_world * perp.v;
      const absAlong = Math.abs(delta_along);
      const absCross = Math.abs(delta_cross);
      // Pass if EITHER clearance is satisfied (EN 1995-1-1 / Rothoblaas convention)
      const passAlong = absAlong + 1e-6 >= required.a1;
      const passCross = absCross + 1e-6 >= required.a2;
      const pass = passAlong || passCross;
      let governing = null;
      if (pass) {
        governing = passAlong ? 'a1' : 'a2';
      }
      out.push({
        pair: [a.id, b.id],
        delta_along: delta_along,
        delta_cross: delta_cross,
        a1_required: required.a1,
        a2_required: required.a2,
        pass: pass,
        governing: governing,
        severity: pass ? 'ok' : 'fail'
      });
    }
  }
  return out;
}


// ============================================================
// STEP 7 — n_ef ROW DETECTION
// ============================================================
//
// A "row along grain" is a cluster of screws sharing an across-grain (perp)
// coordinate. Group screws by their delta_cross-from-origin value within a
// small tolerance, then within each cluster compute a₁ (the minimum
// along-grain spacing) and look up n_ef.

function _detectRows(ctx, frame, required) {
  const screws = ctx.screws;
  if (screws.length === 0) return [];

  const grain = frame.grain;
  const perp  = frame.perp;
  const d = ctx.d;

  // Project each screw into the grain frame
  const projected = screws.map(function (s) {
    return {
      id: s.id,
      screw: s,
      along: s.u * grain.u + s.v * grain.v,
      cross: s.u * perp.u  + s.v * perp.v
    };
  });

  // Cluster by cross-coordinate using ε = a₂_req / 2
  const eps = required.a2 / 2 || 10;
  const sorted = projected.slice().sort(function (a, b) { return a.cross - b.cross; });

  const clusters = [];
  let current = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].cross - current[current.length - 1].cross < eps) {
      current.push(sorted[i]);
    } else {
      clusters.push(current);
      current = [sorted[i]];
    }
  }
  clusters.push(current);

  // For each cluster compute n_ef
  const rows = [];
  for (let c = 0; c < clusters.length; c++) {
    const cluster = clusters[c];
    cluster.sort(function (a, b) { return a.along - b.along; });
    const n = cluster.length;
    let a1_min = Infinity;
    if (n >= 2) {
      for (let k = 0; k + 1 < cluster.length; k++) {
        const sp = cluster[k + 1].along - cluster[k].along;
        if (sp < a1_min) a1_min = sp;
      }
    }
    const a1_in_d = (n >= 2) ? a1_min / d : null;
    const n_ef   = (n >= 2) ? lerpNef(n, a1_in_d) : 1;
    rows.push({
      rowId: 'r' + (c + 1),
      screwIds: cluster.map(function (p) { return p.id; }),
      n: n,
      a1: (n >= 2) ? a1_min : null,
      a1_in_d: a1_in_d,
      n_ef: n_ef
    });
  }
  return rows;
}


// ============================================================
// STEP 8 — CAPACITY CHAIN
// ============================================================

function _computeCapacity(ctx, frame, rows) {
  const conn = ctx.connection;
  const F_d  = (conn.load && conn.load.F_d_mag != null) ? conn.load.F_d_mag : 0;

  // R_V,k base — for v1, use p. 216 (ε=90°) for all α (see Q1 placeholder).
  // If/when Q1 resolves, swap to α-interpolation between p. 216 and p. 217.
  const lookupKey = 'eps90_alpha90';

  const perScrew = [];
  for (let i = 0; i < ctx.screws.length; i++) {
    const sp = getScrewSpec(ctx.screws[i].screwSpec);
    const cap = getCapacity(ctx.screws[i].screwSpec, ctx.plateThickness, lookupKey);
    perScrew.push({
      screwId: ctx.screws[i].id,
      screwSpec: ctx.screws[i].screwSpec,
      plateThickness: ctx.plateThickness,
      Rvk_base: cap.R_Vk,
      capacityWarnings: cap.warnings,
      k_dens: ctx.k_dens_v,
      Rvk_dens_adjusted: cap.R_Vk * ctx.k_dens_v,
      k_mod: ctx.k_mod,
      gamma_M: ctx.gamma_M,
      Rvd: (cap.R_Vk * ctx.k_dens_v * ctx.k_mod) / ctx.gamma_M
    });
  }

  // Group reduction per row
  const groupReduction = [];
  let R_V_d_total = 0;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    // Use the first screw's R_V,d for the row (v1 enforces uniform diameter,
    // so per-screw capacities only differ if plate thickness or spec varies —
    // the engine's mixed-diameter guard runs upstream).
    const sample = perScrew.find(function (ps) { return ps.screwId === row.screwIds[0]; });
    const Rvd = sample ? sample.Rvd : 0;
    const R_row = row.n_ef * Rvd;
    groupReduction.push({
      rowId: row.rowId,
      n:     row.n,
      n_ef:  row.n_ef,
      a1:    row.a1,
      a1_in_d: row.a1_in_d,
      Rvd_per_screw: Rvd,
      R_row: R_row
    });
    R_V_d_total += R_row;
  }

  const eta = (R_V_d_total > 0) ? F_d / R_V_d_total : Infinity;

  return {
    perScrew:       perScrew,
    groupReduction: groupReduction,
    R_V_d_total:    R_V_d_total,
    F_d_applied:    F_d,
    eta:            eta,
    pass:           (eta + 1e-6 <= 1.0) && isFinite(eta),
    multiplierTrace: {
      k_mod: ctx.k_mod,
      gamma_M: ctx.gamma_M,
      k_dens: ctx.k_dens_v,
      serviceClass: ctx.serviceClass,
      loadCase: ctx.loadCase,
      timberClass: ctx.rear.timberClass,
      plateThickness: ctx.plateThickness,
      capacityTable: 'p. 216 (ε=90°)'
    }
  };
}


// ============================================================
// STEP 9 — ROLL UP
// ============================================================

function _rollUp(result, ctx) {
  let anyEdgeFail = false;
  for (let i = 0; i < result.edgeChecks.length; i++) {
    const ec = result.edgeChecks[i];
    for (let j = 0; j < ec.results.length; j++) {
      if (!ec.results[j].pass) {
        anyEdgeFail = true;
        result.failingItems.push({
          kind: 'edge-distance',
          screwId: ec.screwId,
          edgeId:  ec.results[j].edgeId,
          ruleType: ec.results[j].ruleType,
          applied:  ec.results[j].applied,
          required: ec.results[j].required,
          detail: 'Screw ' + ec.screwId + ' edge ' + ec.results[j].edgeId +
                  ' (' + ec.results[j].ruleType + '): applied ' +
                  ec.results[j].applied.toFixed(1) + ' < required ' +
                  ec.results[j].required.toFixed(1) + ' mm'
        });
      }
    }
  }

  let anyPairFail = false;
  for (let i = 0; i < result.pairChecks.length; i++) {
    const pc = result.pairChecks[i];
    if (!pc.pass) {
      anyPairFail = true;
      result.failingItems.push({
        kind: 'pair-spacing',
        pair: pc.pair,
        delta_along: pc.delta_along,
        delta_cross: pc.delta_cross,
        a1_required: pc.a1_required,
        a2_required: pc.a2_required,
        detail: 'Pair (' + pc.pair[0] + ',' + pc.pair[1] + '): |Δu|=' +
                Math.abs(pc.delta_along).toFixed(1) + ' < a₁=' + pc.a1_required.toFixed(1) +
                ' AND |Δv|=' + Math.abs(pc.delta_cross).toFixed(1) +
                ' < a₂=' + pc.a2_required.toFixed(1) + ' mm'
      });
    }
  }

  const capacityFail = !result.capacity.pass && result.capacity.F_d_applied > 0;
  if (capacityFail) {
    result.failingItems.push({
      kind: 'capacity',
      eta: result.capacity.eta,
      F_d: result.capacity.F_d_applied,
      R_V_d_total: result.capacity.R_V_d_total,
      detail: 'η = ' + result.capacity.eta.toFixed(3) + ' > 1.0 (F_d=' +
              result.capacity.F_d_applied.toFixed(1) + ' kN, R_V,d=' +
              result.capacity.R_V_d_total.toFixed(1) + ' kN).'
    });
  }

  if (anyEdgeFail || anyPairFail || capacityFail) {
    result.overall = 'FAIL';
  } else if (result.warnings.length > 0) {
    result.overall = 'WARN';
  } else {
    result.overall = 'PASS';
  }
}


// ============================================================
// CONSOLE HELPER — verify Dan's worked example
// ============================================================
//
// Run from DevTools console:  tmbrCheckExampleConnection()
// Re-runs the rule engine against the live example connection (the one
// tmbrCreateExampleConnection() built) and prints the result.

function tmbrCheckExampleConnection() {
  // Find the most-recently-created connection in the elevation bucket
  const bucket = (entities2D && entities2D.elevation) || [];
  const conn = bucket.slice().reverse().find(function (e) { return e.type === 'connection'; });
  if (!conn) {
    console.warn('No Connection in entities2D.elevation. Run tmbrCreateExampleConnection() first.');
    return null;
  }
  const result = checkConnection(conn);
  console.log('Overall:', result.overall, '— η =', result.capacity.eta.toFixed(3));
  console.log('  α=' + result.alpha.toFixed(1) + '°  k_mod=' + result.capacity.multiplierTrace.k_mod +
              '  k_dens=' + result.capacity.multiplierTrace.k_dens +
              '  γM=' + result.capacity.multiplierTrace.gamma_M);
  console.log('  R_V,d total =', result.capacity.R_V_d_total.toFixed(2), 'kN');
  console.log('  Rows detected:',
              result.rowChecks.map(function (r) {
                return r.rowId + ' (n=' + r.n + ', a₁=' + (r.a1 || 0).toFixed(0) +
                       ' = ' + (r.a1_in_d || 0).toFixed(2) + '·d, n_ef=' + r.n_ef.toFixed(3) + ')';
              }).join(' | '));
  if (result.failingItems.length) {
    console.log('  FAILS:');
    result.failingItems.forEach(function (f) { console.log('    -', f.detail); });
  }
  if (result.warnings.length) {
    console.log('  warnings:');
    result.warnings.forEach(function (w) { console.log('    -', w); });
  }
  // Cache on the connection for the inspector (Phase 6) to read
  conn.checks = result;
  return result;
}
