'use strict';

// V22.1 unified section renderer (PFC / RHS / CHS / EA / UA)
// Extracted from dev/index.html lines 8645-8883 (2026-05-02 modular split)

// V22.1 UNIFIED SECTION RENDERER — PFC / RHS / CHS / EA / UA
// ============================================================
// Handles the five new V22 section types with proper per-view geometry.
// In ELEVATION: all sections render as a side view (rectangle bounded by
// member length × outer depth, with section-specific internal lines).
// In SECTION A / PLAN B: the true profile (C / box / circle / L) is drawn.
//
// Falls back to UB/SHS renderers for ub/shs — those already have their
// own dedicated drawUB/drawSHS pathways.

function drawSectionMember(blk, obj, col, hidCol, clCol, cs, occRects, cutClass) {
  const p = sectionProfile(obj);
  if (!p) return;
  occRects = occRects || [];
  const pm = ppm();
  const hidLW = Math.max(0.25, LW.HID * pm);
  const cutLW = Math.max(1, LW.CUT * pm);
  const visLW = Math.max(0.5, LW.VIS * pm);
  const visHLW = Math.max(0.6, LW.VIS_HEAVY * pm);
  const hl = (obj.length || 0) / 2;
  const hd = (p.d || 0) / 2;   // projected depth (elevation Y half-span)
  const hbf = (p.bf || 0) / 2; // width perpendicular to depth (Z half-span)

  const rc = blk.viewKey === 'elevation' ? [obj.x, obj.y] :
             blk.viewKey === 'sectionA' ? [obj.z, obj.y] : [obj.x, obj.z];
  occRects = localizeOccRects(occRects, obj, rc[0], rc[1], blk);

  withRotation(blk, obj, rc[0], rc[1], () => {

  // ---- ELEVATION ----
  if (blk.viewKey === 'elevation') {
    const cx = obj.x, cy = obj.y;
    const L = cx - hl, R = cx + hl, T = cy + hd, B = cy - hd;

    if (p.shape === 'c') {
      // PFC side elevation — outer rectangle + flange-tip inner lines
      rLineOcc(blk, L, T, R, T, occRects, col, hidCol, cutLW, hidLW);
      rLineOcc(blk, L, B, R, B, occRects, col, hidCol, cutLW, hidLW);
      rLineOcc(blk, L, T, L, B, occRects, col, hidCol, visLW, hidLW);
      rLineOcc(blk, R, T, R, B, occRects, col, hidCol, visLW, hidLW);
      // Flange thickness lines (inner face of each flange)
      const tf = p.tf || 0;
      rLineOcc(blk, L, T - tf, R, T - tf, occRects, col, hidCol, visLW, hidLW);
      rLineOcc(blk, L, B + tf, R, B + tf, occRects, col, hidCol, visLW, hidLW);
    } else if (p.shape === 'box') {
      // RHS side elevation — simple rectangle
      rLineOcc(blk, L, T, R, T, occRects, col, hidCol, cutLW, hidLW);
      rLineOcc(blk, L, B, R, B, occRects, col, hidCol, cutLW, hidLW);
      rLineOcc(blk, L, T, L, B, occRects, col, hidCol, visLW, hidLW);
      rLineOcc(blk, R, T, R, B, occRects, col, hidCol, visLW, hidLW);
    } else if (p.shape === 'circle') {
      // CHS side elevation — rectangle with rounded ends
      const D = p.D;
      rLineOcc(blk, L, T, R, T, occRects, col, hidCol, cutLW, hidLW);
      rLineOcc(blk, L, B, R, B, occRects, col, hidCol, cutLW, hidLW);
      rLineOcc(blk, L, T, L, B, occRects, col, hidCol, visLW, hidLW);
      rLineOcc(blk, R, T, R, B, occRects, col, hidCol, visLW, hidLW);
      // Hidden back-edge of cylinder (visual cue)
      ctx.strokeStyle = hidCol; ctx.lineWidth = hidLW;
      ctx.setLineDash(DASH.HIDDEN);
      rLine(blk, L, cy + D / 4, R, cy + D / 4);
      rLine(blk, L, cy - D / 4, R, cy - D / 4);
      ctx.setLineDash([]);
    } else if (p.shape === 'l') {
      // Angle side elevation — rectangle bounded by leg lengths
      rLineOcc(blk, L, T, R, T, occRects, col, hidCol, cutLW, hidLW);
      rLineOcc(blk, L, B, R, B, occRects, col, hidCol, cutLW, hidLW);
      rLineOcc(blk, L, T, L, B, occRects, col, hidCol, visLW, hidLW);
      rLineOcc(blk, R, T, R, B, occRects, col, hidCol, visLW, hidLW);
      // Leg-thickness line (faint inner edge showing the angle presence)
      const t = p.t || 0;
      rLineOcc(blk, L, B + t, R, B + t, occRects, col, hidCol, visLW, hidLW);
    }

    // Centreline
    ctx.strokeStyle = clCol; ctx.lineWidth = Math.max(0.25, LW.CL * pm);
    ctx.setLineDash(DASH.CL);
    rLine(blk, L - 10, cy, R + 10, cy);
    ctx.setLineDash([]);

    // Label
    ctx.fillStyle = cs.getPropertyValue('--mute').trim();
    const fs = Math.max(6, 1.8 * pm);
    ctx.font = `${fs}px system-ui`; ctx.textAlign = 'center';
    const lp = real2px(blk, cx, T + 6);
    ctx.fillText(obj.section, lp.x, lp.y);
    ctx.textAlign = 'start';
  }

  // ---- SECTION A (Z-Y plane) ----
  else if (blk.viewKey === 'sectionA') {
    const cz = obj.z, cy = obj.y;

    if (p.shape === 'c') {
      // PFC true C-profile: back spine (at +Z edge) + top/bottom flanges toward -Z
      // Drafter §3.12 default: open face pointing AWAY from the column.
      // We draw with spine on +Z side by convention.
      const tw = p.tw || 0, tf = p.tf || 0;
      const zSpine = cz + hbf;
      const zToe = cz - hbf;
      // Outer outline
      ctx.strokeStyle = col; ctx.lineWidth = cutClass === 'cut' ? cutLW : visLW;
      ctx.setLineDash([]);
      rLine(blk, zSpine, cy + hd, zToe, cy + hd);      // top flange outer
      rLine(blk, zToe, cy + hd, zToe, cy + hd - tf);   // top flange tip
      rLine(blk, zToe, cy + hd - tf, zSpine - tw, cy + hd - tf); // top flange inner
      rLine(blk, zSpine - tw, cy + hd - tf, zSpine - tw, cy - hd + tf); // web
      rLine(blk, zSpine - tw, cy - hd + tf, zToe, cy - hd + tf); // bot flange inner
      rLine(blk, zToe, cy - hd + tf, zToe, cy - hd);   // bot flange tip
      rLine(blk, zToe, cy - hd, zSpine, cy - hd);      // bot flange outer
      rLine(blk, zSpine, cy - hd, zSpine, cy + hd);    // spine
      if (cutClass === 'cut') {
        drawCrossHatch(blk, zToe, cy - hd, p.bf, p.d, col);
      }
      // Centrelines
      ctx.strokeStyle = clCol; ctx.lineWidth = Math.max(0.25, LW.CL * pm);
      ctx.setLineDash(DASH.CL);
      rLine(blk, zToe - 6, cy, zSpine + 6, cy);
      rLine(blk, cz, cy - hd - 6, cz, cy + hd + 6);
      ctx.setLineDash([]);
    } else if (p.shape === 'box') {
      // RHS profile: outer box + inner box (hollow)
      const t = p.t || 5;
      const hI_z = hbf - t, hI_y = hd - t;
      ctx.strokeStyle = col; ctx.lineWidth = cutClass === 'cut' ? cutLW : visLW;
      ctx.setLineDash([]);
      rLine(blk, cz - hbf, cy + hd, cz + hbf, cy + hd);
      rLine(blk, cz + hbf, cy + hd, cz + hbf, cy - hd);
      rLine(blk, cz + hbf, cy - hd, cz - hbf, cy - hd);
      rLine(blk, cz - hbf, cy - hd, cz - hbf, cy + hd);
      // Inner
      rLine(blk, cz - hI_z, cy + hI_y, cz + hI_z, cy + hI_y);
      rLine(blk, cz + hI_z, cy + hI_y, cz + hI_z, cy - hI_y);
      rLine(blk, cz + hI_z, cy - hI_y, cz - hI_z, cy - hI_y);
      rLine(blk, cz - hI_z, cy - hI_y, cz - hI_z, cy + hI_y);
      if (cutClass === 'cut') {
        drawCrossHatchHollow(blk, cz - hbf, cy - hd, p.bf, p.d, cz - hI_z, cy - hI_y, p.bf - 2 * t, p.d - 2 * t, col);
      }
      ctx.strokeStyle = clCol; ctx.lineWidth = Math.max(0.25, LW.CL * pm);
      ctx.setLineDash(DASH.CL);
      rLine(blk, cz - hbf - 6, cy, cz + hbf + 6, cy);
      rLine(blk, cz, cy - hd - 6, cz, cy + hd + 6);
      ctx.setLineDash([]);
    } else if (p.shape === 'circle') {
      // CHS profile: two concentric circles
      const D = p.D, t = p.t;
      ctx.strokeStyle = col; ctx.lineWidth = cutClass === 'cut' ? cutLW : visLW;
      ctx.setLineDash([]);
      const centre = real2px(blk, cz, cy);
      const rOuter = (D / 2) * viewport.zoom / drawingScale;
      const rInner = (D / 2 - t) * viewport.zoom / drawingScale;
      ctx.beginPath(); ctx.arc(centre.x, centre.y, rOuter, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(centre.x, centre.y, rInner, 0, Math.PI * 2); ctx.stroke();
      if (cutClass === 'cut') {
        // Steel hatch inside the wall annulus (approximate via even-odd fill clip)
        ctx.save();
        ctx.beginPath();
        ctx.arc(centre.x, centre.y, rOuter, 0, Math.PI * 2);
        ctx.arc(centre.x, centre.y, rInner, 0, Math.PI * 2, true);
        ctx.clip('evenodd');
        drawCrossHatch(blk, cz - D / 2, cy - D / 2, D, D, col);
        ctx.restore();
      }
      ctx.strokeStyle = clCol; ctx.lineWidth = Math.max(0.25, LW.CL * pm);
      ctx.setLineDash(DASH.CL);
      rLine(blk, cz - D / 2 - 6, cy, cz + D / 2 + 6, cy);
      rLine(blk, cz, cy - D / 2 - 6, cz, cy + D / 2 + 6);
      ctx.setLineDash([]);
    } else if (p.shape === 'l') {
      // L-angle: heel at (-bf, -d), legs along +Z (short) and +Y (long)
      const t = p.t || 5;
      const zH = cz - hbf, yH = cy - hd;
      ctx.strokeStyle = col; ctx.lineWidth = cutClass === 'cut' ? cutLW : visLW;
      ctx.setLineDash([]);
      // Outer L outline
      rLine(blk, zH, yH, zH + p.bf, yH);               // bottom
      rLine(blk, zH + p.bf, yH, zH + p.bf, yH + t);    // short-leg outer tip
      rLine(blk, zH + p.bf, yH + t, zH + t, yH + t);   // inner horizontal
      rLine(blk, zH + t, yH + t, zH + t, yH + p.d);    // inner vertical
      rLine(blk, zH + t, yH + p.d, zH, yH + p.d);      // long-leg outer tip
      rLine(blk, zH, yH + p.d, zH, yH);                // heel
      if (cutClass === 'cut') {
        // Hatch the L shape via clip
        ctx.save();
        ctx.beginPath();
        const pt = u => real2px(blk, u[0], u[1]);
        const pts = [[zH, yH], [zH + p.bf, yH], [zH + p.bf, yH + t],
                     [zH + t, yH + t], [zH + t, yH + p.d], [zH, yH + p.d]];
        const fp = pt(pts[0]); ctx.moveTo(fp.x, fp.y);
        for (let i = 1; i < pts.length; i++) { const q = pt(pts[i]); ctx.lineTo(q.x, q.y); }
        ctx.closePath(); ctx.clip();
        drawCrossHatch(blk, zH, yH, p.bf, p.d, col);
        ctx.restore();
      }
      ctx.strokeStyle = clCol; ctx.lineWidth = Math.max(0.25, LW.CL * pm);
      ctx.setLineDash(DASH.CL);
      rLine(blk, zH - 4, cy, zH + p.bf + 4, cy);
      rLine(blk, cz, yH - 4, cz, yH + p.d + 4);
      ctx.setLineDash([]);
    }
  }

  // ---- PLAN B (X-Z plane) ----
  else {
    const cx = obj.x, cz = obj.z;
    const L = cx - hl, R = cx + hl, T = cz + hbf, B = cz - hbf;
    if (p.shape === 'circle') {
      // CHS plan: rectangle length × D + centreline
      rLineOcc(blk, L, T, R, T, occRects, col, hidCol, visLW, hidLW);
      rLineOcc(blk, L, B, R, B, occRects, col, hidCol, visLW, hidLW);
      rLineOcc(blk, L, T, L, B, occRects, col, hidCol, visLW, hidLW);
      rLineOcc(blk, R, T, R, B, occRects, col, hidCol, visLW, hidLW);
    } else {
      // All other sections: simple rectangle of length × bf
      rLineOcc(blk, L, T, R, T, occRects, col, hidCol, visLW, hidLW);
      rLineOcc(blk, L, B, R, B, occRects, col, hidCol, visLW, hidLW);
      rLineOcc(blk, L, T, L, B, occRects, col, hidCol, visLW, hidLW);
      rLineOcc(blk, R, T, R, B, occRects, col, hidCol, visLW, hidLW);
      if (p.shape === 'c') {
        // Show flange-tip inner lines at top/bottom (open face direction)
        const tf = p.tf || 0;
        ctx.strokeStyle = hidCol; ctx.lineWidth = hidLW;
        ctx.setLineDash(DASH.HIDDEN);
        rLine(blk, L, T - tf, R, T - tf);
        rLine(blk, L, B + tf, R, B + tf);
        ctx.setLineDash([]);
      }
    }
    // Centrelines
    ctx.strokeStyle = clCol; ctx.lineWidth = Math.max(0.25, LW.CL * pm);
    ctx.setLineDash(DASH.CL);
    rLine(blk, L - 8, cz, R + 8, cz);
    ctx.setLineDash([]);
  }

  }); // end withRotation
}

// ============================================================
