'use strict';

// initKeyboard — keyboard event handling
// Extracted from dev/index.html lines 12865-13171 (2026-05-02 modular split)

// KEYBOARD
// ============================================================

function initKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.key === ' ') { spaceHeld = true; e.preventDefault(); return; }
    if (e.key === 'Shift') { shiftHeld = true; requestRender(); return; }
    if (e.key === 'Alt') { altHeld = true; requestRender(); return; }
    // V20 global shortcuts that MUST work even while inputs are focused.
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault(); _palOpen(); return;
    }
    if (e.key === 'Escape' && _palVisible) { e.preventDefault(); _palClose(); return; }
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

    // ---- DIMENSION VALUE / LABEL TYPING (v25 measure tool, after the 2nd click) ----
    // Runs BEFORE every tool shortcut so typing a length, a label letter, or even
    // a capital 'M' edits the just-placed dimension instead of switching tools or
    // toggling the sheet mode. Digits live-rescale (anchored at P1); a printable
    // non-digit starts a text label; Enter commits, Esc reverts. (js/82)
    if (tool === 'v25-measure' && measureAwaitId != null && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const _arr = (activeBlock && entities2D[activeBlock.viewKey]) || null;
      const _ent = _arr ? _arr.find(x => x.id === measureAwaitId) : null;
      if (_ent) {
        const inText = (_ent.textOverride != null);
        if (e.key === 'Enter') {
          measureAwaitId = null; measureDimInput = ''; measureDimActive = false; measureClickLen = 0;
          requestRender(); e.preventDefault(); return;
        }
        if (e.key === 'Escape') {
          if (measureDimActive && measureClickLen > 0 && typeof dim2SetLength === 'function') dim2SetLength(_ent, measureClickLen);
          if (_ent.textOverride === '') _ent.textOverride = null;
          measureAwaitId = null; measureDimInput = ''; measureDimActive = false; measureClickLen = 0;
          requestRender(); e.preventDefault(); return;
        }
        if (e.key === 'Backspace') {
          if (inText) {
            _ent.textOverride = _ent.textOverride.slice(0, -1);
            if (_ent.textOverride.length === 0) _ent.textOverride = null;
          } else if (measureDimActive) {
            measureDimInput = measureDimInput.slice(0, -1);
            if (measureDimInput.length === 0) { measureDimActive = false; if (typeof dim2SetLength === 'function') dim2SetLength(_ent, measureClickLen); }
            else { const l = parseFloat(measureDimInput); if (l > 0 && typeof dim2SetLength === 'function') dim2SetLength(_ent, l); }
          }
          requestRender(); e.preventDefault(); return;
        }
        // NUMBER MODE: digits / decimal point — live-rescale anchored at P1.
        // Reject a 2nd decimal point, and only latch number-mode once the buffer
        // is a positive number (so a lone '.' doesn't lock out a text label).
        if (!inText && /^[0-9.]$/.test(e.key)) {
          if (e.key === '.' && measureDimInput.includes('.')) { e.preventDefault(); return; }
          measureDimInput += e.key;
          const l = parseFloat(measureDimInput);
          if (l > 0) { measureDimActive = true; if (typeof dim2SetLength === 'function') dim2SetLength(_ent, l); }
          requestRender(); e.preventDefault(); return;
        }
        // TEXT MODE: a printable non-digit starts a label (geometry unchanged);
        // once started, any printable char extends it.
        if ((inText || !measureDimActive) && /^[\x20-\x7E]$/.test(e.key)) {
          _ent.textOverride = (_ent.textOverride || '') + e.key;
          requestRender(); e.preventDefault(); return;
        }
        // Any other printable char while awaiting input (e.g. a letter typed
        // after a digit, which number-mode blocks from starting a label) is
        // swallowed so it can't leak to the global tool shortcuts below.
        if (/^[\x20-\x7E]$/.test(e.key)) { e.preventDefault(); return; }
      }
    }

    // V20 help overlay — `?` (shift + / on US keyboard). Allow pressing ? to
    // toggle from anywhere outside an input.
    if (e.key === '?') { e.preventDefault(); toggleKbdHelp(); return; }
    // V20 mirror shortcut. V25 — Shift+M toggles 3D/2D sheet mode.
    if (e.key === 'M' && e.shiftKey && !e.ctrlKey && !e.metaKey) {
      if (typeof toggleSheetMode === 'function') toggleSheetMode();
      e.preventDefault(); return;
    }
    // 'm' = Measure / Dimension tool (Mirror relocated to 'i'). 2D paper-space →
    // the v25 dimension tool (js/82); 3D model space → the legacy dimension tool,
    // which is the measure equivalent there. (Skipped while a dimension is
    // awaiting typed input — the capture block above already handled the key.)
    if ((e.key === 'm' || e.key === 'M') && !e.shiftKey && !(e.ctrlKey || e.metaKey)) {
      if (sheetMode === '2d' && typeof v25SetTool === 'function') v25SetTool('v25-measure');
      else setTool('dimension');
      e.preventDefault(); return;
    }

    // ---- TAB-TO-CYCLE SELECTION ----
    if (e.key === 'Tab' && tool === 'select' && activeBlock && cursorSheet) {
      e.preventDefault();
      if (cycleHits.length === 0) {
        cycleHits = hitTestAll3D(activeBlock, cursorSheet.px, cursorSheet.py);
        cycleIndex = 0;
      } else {
        cycleIndex = (cycleIndex + 1) % cycleHits.length;
      }
      if (cycleHits.length > 0) {
        selected3D = [cycleHits[cycleIndex]];
        requestRender();
      }
      return;
    }

    // ---- CTRL+S SAVE / CTRL+O LOAD ----
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault(); saveProject(); return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'o' || e.key === 'O')) {
      e.preventDefault(); document.getElementById('fileInput').click(); return;
    }

    // ---- CTRL+D DUPLICATE / CTRL+SHIFT+D MIRROR ----
    if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D') && selected3D.length > 0) {
      e.preventDefault();
      if (e.shiftKey) {
        // Mirror about vertical axis through selection centroid
        let cx = 0; selected3D.forEach(o => cx += o.x); cx /= selected3D.length;
        const before = selected3D.map(o => JSON.parse(JSON.stringify(o)));
        selected3D.forEach(o => {
          o.x = 2 * cx - o.x;
          if (o.rot) o.rot = (360 - o.rot) % 360;
          if (o.polyPts) o.polyPts.forEach(p => p.dx = -p.dx);
        });
        const after = selected3D.map(o => JSON.parse(JSON.stringify(o)));
        undoStack.push({ act:'moveObj', before, after });
        if (undoStack.length > 100) undoStack.shift(); redoStack = [];
      } else {
        // Duplicate with 30mm offset
        const pasted = [];
        selected3D.forEach(orig => {
          const o = JSON.parse(JSON.stringify(orig));
          o.id = objIdN++; o.x = (o.x || 0) + 30; o.y = (o.y || 0) + 30;
          addObj(o); pasted.push(objects3D[objects3D.length - 1]);
        });
        selected3D = pasted;
      }
      if (typeof v3dMarkDirty === 'function') v3dMarkDirty();
      requestRender(); return;
    }

    // ---- DIM TYPE TOGGLE (while in dimension tool) ----
    if (tool === 'dimension' && dimStep >= 0) {
      if (e.key === 'a' || e.key === 'A') { dimType = 'aligned'; requestRender(); e.preventDefault(); return; }
      if (e.key === 'h' || e.key === 'H') { dimType = 'horizontal'; requestRender(); e.preventDefault(); return; }
      if (e.key === 'v' || e.key === 'V') { dimType = 'vertical'; requestRender(); e.preventDefault(); return; }
      if (e.key === 'n' || e.key === 'N') { dimType = 'angular'; requestRender(); e.preventDefault(); return; }
    }

    if (e.key === 'v' || e.key === 'V') setTool('select');
    if ((e.key === 'i' || e.key === 'I') && !(e.ctrlKey || e.metaKey)) setTool('mirror'); // Mirror (relocated from 'm')
    if (e.key === 'l' || e.key === 'L') setTool('line');
    if (e.key === 'c' || e.key === 'C') setTool('circle');
    if (e.key === 'p' || e.key === 'P') setTool('polyline');
    if (e.key === 'd' || e.key === 'D') setTool('dimension');
    if ((e.key === 't' || e.key === 'T') && sheetMode === '2d' && typeof v25SetTool === 'function') { v25SetTool('v25-note'); return; }
    if (e.key === 't' || e.key === 'T') setTool('text');
    if ((e.key === 'q' || e.key === 'Q') && sheetMode === '2d' && typeof v25SetTool === 'function') v25SetTool('v25-notebox');

    // R key: rotate selected object(s), or Rect tool if nothing selected.
    // V24.A3: beam-like members cycle roll (R +90°, Shift+R -90°), Alt+R
    // flips the axis direction end-for-end. Plates/bolts still use scalar rot.
    if (e.key === 'r' || e.key === 'R') {
      if (selected3D.length > 0 && tool === 'select') {
        const before = selected3D.map(o => JSON.parse(JSON.stringify(o)));
        const step = e.shiftKey ? -90 : 90;
        selected3D.forEach(obj => {
          if (isMemberType(obj.type)) {
            const p = presetFromFrame(memberFrame(obj));
            if (e.altKey) {
              setMemberFrameFromPreset(obj, p.axisLetter, -p.dir, p.rollDeg);
            } else {
              const newRoll = ((p.rollDeg + step) % 360 + 360) % 360;
              setMemberFrameFromPreset(obj, p.axisLetter, p.dir, newRoll);
            }
          } else {
            obj.rot = (((obj.rot || 0) + step) % 360 + 360) % 360;
          }
        });
        const after = selected3D.map(o => JSON.parse(JSON.stringify(o)));
        undoStack.push({ act: 'moveObj', before, after });
        if (undoStack.length > 100) undoStack.shift();
        redoStack = [];
        if (typeof v3dMarkDirty === 'function') v3dMarkDirty();
        if (typeof invalidateWeldCache === 'function') invalidateWeldCache();
        if (typeof updateInspector === 'function') updateInspector();
        requestRender();
        e.preventDefault();
      } else {
        setTool('rect');
      }
    }

    // V25 — keyboard toggles also update the visible top-bar tool buttons
    // (#sbSnap / #sbOrtho / #sbGrid) so the active state stays in sync with
    // F3 / F8 / G keypresses. Pre-V25 only updated the hidden #btnX mirrors.
    if (e.key === 'F3') { snapOn = !snapOn;
      document.getElementById('btnSnap').classList.toggle('active', snapOn);
      document.getElementById('sbSnap')?.classList.toggle('active', snapOn);
      e.preventDefault(); }
    if (e.key === 'F8') { orthoOn = !orthoOn;
      document.getElementById('btnOrtho').classList.toggle('active', orthoOn);
      document.getElementById('sbOrtho')?.classList.toggle('active', orthoOn);
      e.preventDefault(); }
    // plate-grouping-stiffener — Ctrl+G group / Ctrl+Shift+G ungroup. MUST
    // come before the bare g/G grid toggle below (which has no ctrl guard).
    if ((e.ctrlKey || e.metaKey) && (e.key === 'g' || e.key === 'G')) {
      e.preventDefault();
      if (sheetMode === '2d') {
        if (e.shiftKey) { if (typeof v25Ungroup === 'function') v25Ungroup(); }
        else            { if (typeof v25Group   === 'function') v25Group(); }
      }
      return;
    }
    if (e.key === 'g' || e.key === 'G') { gridOn = !gridOn;
      document.getElementById('btnGrid').classList.toggle('active', gridOn);
      document.getElementById('sbGrid')?.classList.toggle('active', gridOn);
      requestRender(); }
    if (e.key === 'f' || e.key === 'F') { fitToView(); e.preventDefault(); }
    if (e.key === 'F7') { if (typeof spellSweep === 'function') spellSweep(); e.preventDefault(); return; }

    // Dynamic dimension input for draw-plate and draw-member
    if ((tool === 'draw-plate' && platePts.length > 0) || (tool === 'draw-member' && drawStart)) {
      // Number keys, decimal point, minus, Backspace for dimension input
      if (/^[0-9.]$/.test(e.key)) {
        plateDimInput += e.key;
        plateDimActive = true;
        requestRender(); e.preventDefault(); return;
      }
      if (e.key === 'Backspace' && plateDimActive) {
        plateDimInput = plateDimInput.slice(0, -1);
        if (plateDimInput.length === 0) plateDimActive = false;
        requestRender(); e.preventDefault(); return;
      }
      if (e.key === 'Enter' && plateDimActive && plateDimInput) {
        const len = parseFloat(plateDimInput);
        if (len > 0 && tool === 'draw-plate' && platePts.length > 0 && cursorSheet && plateBlock) {
          // Place point at exact typed length from last point
          const [cu, cv] = getCursor(plateBlock);
          const last = platePts[platePts.length - 1];
          const du = cu - last.u, dv = cv - last.v;
          const angle = Math.atan2(dv, du);
          platePts.push({ u: last.u + Math.cos(angle) * len, v: last.v + Math.sin(angle) * len });
          plateDimInput = ''; plateDimActive = false;
          requestRender(); e.preventDefault(); return;
        }
        if (len > 0 && tool === 'draw-member' && drawStart && activeBlock) {
          // Place member at exact typed length from start point
          const [cu, cv] = getCursor(activeBlock);
          const du = cu - drawStart.cu, dv = cv - drawStart.cv;
          const angle = Math.atan2(dv, du);
          const endU = drawStart.cu + Math.cos(angle) * len;
          const endV = drawStart.cv + Math.sin(angle) * len;
          finishDrawMember(drawStart.blk, drawStart.cu, drawStart.cv, endU, endV);
          plateDimInput = ''; plateDimActive = false;
          requestRender(); e.preventDefault(); return;
        }
      }
    }

    if (e.key === 'Escape') {
      // Marquee in progress takes top priority — Escape kills the rubber-band
      // without touching the existing selection, matching Bluebeam/AutoCAD.
      if (selBoxStart) {
        selBoxStart = null; selBoxMode = null;
        requestRender(); e.preventDefault(); return;
      }
      // V23.1 — inline connection wizard takes priority on Escape
      if (connWizState) { connWizCancel(); e.preventDefault(); return; }
      // V25 — cancel a v25 tool's in-progress action. Architecture-v2
      // Phase 2 retired the v1 plate state slots from v25State; v2's
      // PlacePlateTool handles its own Escape via
      // js/v2/tools/place-plate-tool.js onKey.
      if (tool && tool.startsWith('v25-')) {
        const had = v25State.dragStart || v25State.polyPts.length
                  || v25State.hatchDownPx || v25State.noteDownPx
                  || (typeof window !== 'undefined' && window.nbPlace);
        if (had) {
          v25State.dragStart = null; v25State.polyPts = [];
          v25State.hatchDownPx = null; v25State.hatchDownWorld = null;
          // noteBox: cancel an in-progress leader-note first click (head) or a
          // v25-note press-drag so Escape leaves no dangling placement state.
          v25State.noteDownPx = null; v25State.noteDownWorld = null;
          if (typeof window !== 'undefined') window.nbPlace = null;
          v25SnapInfo = null;
          requestRender();
        } else {
          setTool('select');
        }
        e.preventDefault(); return;
      }
      if (tool === 'draw-plate' && platePts.length > 0) {
        // Cancel current plate polygon but stay in draw-plate mode
        platePts = []; plateBlock = null; plateDimInput = ''; plateDimActive = false;
        requestRender();
      } else if (tool === 'draw-plate') {
        cancelDraw(); setTool('select');
      } else if (drawStart && drawMember) {
        drawStart = null; drawPreviewEnd = null; requestRender();
      } else if (drawMember) {
        cancelDraw(); setTool('select');
      } else if (clickPts.length > 0 || polyPts.length > 0 || dimStep > 0 || placing) {
        cancelDraw();
      } else if (selected3D.length > 0) { selected3D = []; requestRender(); }
      else setTool('select');
    }

    if (e.key === 'Enter' && tool === 'draw-plate' && platePts.length >= 3 && !plateDimActive) {
      // Enter also closes the plate polygon (alternative to double-click)
      finishDrawPlate();
    }
    if (e.key === 'Enter' && tool === 'polyline' && polyPts.length >= 2) finishPolyline();
    // V25 — Enter finishes a reo-bar polyline or a free polyline
    if (e.key === 'Enter' && tool === 'v25-bar' && typeof v25FinishBarPoly === 'function') {
      v25FinishBarPoly(); e.preventDefault();
    }
    if (e.key === 'Enter' && tool === 'v25-line' && typeof v25FinishLineSet === 'function') {
      v25FinishLineSet(); e.preventDefault();
    }
    // v1 V25 plate Enter-close retired by architecture-v2 Phase 2; v2's
    // PlacePlateTool.onKey handles Enter to close its polygon mode.
    // V25 — Delete / Backspace removes selected v25 entities
    if ((e.key === 'Delete' || e.key === 'Backspace') && Array.isArray(v25Selected) && v25Selected.length) {
      if (typeof v25DeleteSelected === 'function') {
        v25DeleteSelected();
        e.preventDefault();
      }
    }
    // V25 — Arrow-key nudge for selected v25 entities (Bluebeam-style).
    // Plain arrow = nudgeSize, Shift+arrow = nudgeSize × 10.
    if (sheetMode === '2d' && Array.isArray(v25Selected) && v25Selected.length &&
        (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      const step = (nudgeSize || 10) * (e.shiftKey ? 10 : 1);
      let du = 0, dv = 0;
      if (e.key === 'ArrowLeft') du = -step;
      if (e.key === 'ArrowRight') du = step;
      if (e.key === 'ArrowUp') dv = step;       // V is up in real-world coords
      if (e.key === 'ArrowDown') dv = -step;
      const arr = entities2D[(activeBlock && activeBlock.viewKey) || 'elevation'] || [];
      v25Selected.forEach(id => {
        const ent = arr.find(en => en.id === id);
        if (ent && typeof v25Move === 'function') v25Move(ent, du, dv, 'body');
      });
      requestRender();
      e.preventDefault();
    }
    if (e.key === 'Enter' && tool === 'draw-rev-cloud' && polyPts.length >= 3) {
      addEnt2D(mkEnt2D(activeBlock.viewKey, 'revisionCloud', {
        pts: [...polyPts], lw: LW.MW,
      }));
      polyPts = [];
      requestRender();
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selected3D.length > 0) {
        [...selected3D].forEach(obj => delObj(obj.id));
        selected3D = []; requestRender();
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { undo(); e.preventDefault(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') { redo(); e.preventDefault(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') { selected3D = [...objects3D]; requestRender(); e.preventDefault(); }

    if ((e.ctrlKey || e.metaKey) && e.key === 'c' && !e.shiftKey) {
      if (selected3D.length > 0) { clipboardObjs = selected3D.map(o => JSON.parse(JSON.stringify(o))); e.preventDefault(); }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'v' && !e.shiftKey) {
      if (clipboardObjs && clipboardObjs.length > 0) { pasteObjects(); e.preventDefault(); }
    }

    // Arrow keys: nudge
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key) && selected3D.length > 0 && activeBlock) {
      const n = e.shiftKey ? 1 : (e.ctrlKey ? 50 : nudgeSize);
      const before = selected3D.map(o => JSON.parse(JSON.stringify(o)));
      const vk = activeBlock.viewKey;
      selected3D.forEach(obj => {
        if (vk === 'elevation') {
          if (e.key === 'ArrowLeft') obj.x -= n; if (e.key === 'ArrowRight') obj.x += n;
          if (e.key === 'ArrowUp') obj.y += n; if (e.key === 'ArrowDown') obj.y -= n;
        } else if (vk === 'sectionA') {
          if (e.key === 'ArrowLeft') obj.z -= n; if (e.key === 'ArrowRight') obj.z += n;
          if (e.key === 'ArrowUp') obj.y += n; if (e.key === 'ArrowDown') obj.y -= n;
        } else {
          if (e.key === 'ArrowLeft') obj.x -= n; if (e.key === 'ArrowRight') obj.x += n;
          if (e.key === 'ArrowUp') obj.z += n; if (e.key === 'ArrowDown') obj.z -= n;
        }
      });
      const after = selected3D.map(o => JSON.parse(JSON.stringify(o)));
      undoStack.push({ act:'moveObj', before, after });
      if (undoStack.length > 100) undoStack.shift();
      redoStack = [];
      e.preventDefault(); requestRender();
    }
  });

  document.addEventListener('keyup', (e) => {
    if (e.key === ' ') spaceHeld = false;
    if (e.key === 'Shift') { shiftHeld = false; requestRender(); }
    if (e.key === 'Alt') { altHeld = false; requestRender(); }
  });
}

