'use strict';

// V22.4 fillet / chamfer helpers
// Extracted from dev/index.html lines 6590-6605 (2026-05-02 modular split)

// V22.4 FILLET / CHAMFER HELPERS
// ============================================================
// Convert a (u, v) point in view-local coords to a plate `polyPts` delta
// {dx, dy, dz}. View-local coords already encode the plate's in-plane axes
// (u and v are the two axes perpendicular to plate normal). The third
// (depth) axis is preserved from `currentVertex` so we don't lose data
// on a non-zero-depth vertex.
function _uvToDelta(viewKey, uv, currentVertex) {
  const [u, v] = uv;
  const cur = currentVertex || { dx: 0, dy: 0, dz: 0 };
  if (viewKey === 'elevation') return { dx: u, dy: v, dz: cur.dz || 0 };
  if (viewKey === 'sectionA')  return { dx: cur.dx || 0, dy: v, dz: u };
  return { dx: u, dy: cur.dy || 0, dz: v };
}

// ============================================================
