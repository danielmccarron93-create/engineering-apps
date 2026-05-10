'use strict';

// V20 legacy library shim
// Extracted from dev/index.html lines 15931-16137 (2026-05-02 modular split)

// LIBRARY (V20 legacy — kept as shim)
// ============================================================
// Populates hidden DOM containers so older references to #ubList etc. still
// resolve. The user-visible library is now the V21 tile palette above.
// This also keeps dialog wiring (Bolt Group, Title Block, Weld Dialog) etc.
// functional because those bindings live inside populateLibrary().

function populateLibrary() {
  // Helper — renders one member-type entry
  const addMemberItem = (listEl, label, member) => {
    const item = document.createElement('div');
    item.className = 'lib-item'; item.textContent = label;
    item.addEventListener('click', () => {
      drawMember = member;
      drawStart = null; drawPreviewEnd = null;
      tool = 'draw-member'; clickPts = []; polyPts = []; placing = null;
      canvas.style.cursor = 'crosshair';
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
      updateStatus();
    });
    listEl.appendChild(item);
  };

  // UB list — only entries whose section name contains "UB"
  const ubList = document.getElementById('ubList');
  Object.keys(UB_DB).filter(n => n.includes('UB')).forEach(name => {
    addMemberItem(ubList, name, { type:'ub', section:name });
  });

  // UC list — columns (UC_DB keys). UC uses the same drawUB renderer because
  // UB_DB has UC entries merged in at load time.
  const ucList = document.getElementById('ucList');
  if (ucList) {
    Object.keys(UC_DB).forEach(name => {
      addMemberItem(ucList, name, { type:'ub', section:name });
    });
  }

  const shsList = document.getElementById('shsList');
  Object.keys(SHS_DB).forEach(name => {
    const item = document.createElement('div');
    item.className = 'lib-item'; item.textContent = name + ' SHS';
    item.addEventListener('click', () => {
      drawMember = { type:'shs', section:name };
      drawStart = null; drawPreviewEnd = null;
      tool = 'draw-member'; clickPts = []; polyPts = []; placing = null;
      canvas.style.cursor = 'crosshair';
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
      updateStatus();
    });
    shsList.appendChild(item);
  });

  const boltList = document.getElementById('boltList');
  Object.keys(BOLT_DB).forEach(name => {
    const item = document.createElement('div');
    item.className = 'lib-item'; item.textContent = name + ' Bolt';
    item.addEventListener('click', () => {
      drawMember = { type:'bolt', boltSize:name };
      drawStart = null; drawPreviewEnd = null;
      tool = 'draw-member'; clickPts = []; polyPts = []; placing = null;
      canvas.style.cursor = 'crosshair';
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
      updateStatus();
    });
    boltList.appendChild(item);
  });

  const plateList = document.getElementById('plateList');
  const plateItem = document.createElement('div');
  plateItem.className = 'lib-item'; plateItem.textContent = 'Draw Plate';
  plateItem.addEventListener('click', () => {
    tool = 'draw-plate';
    platePts = []; plateBlock = null; plateDimInput = ''; plateDimActive = false;
    drawMember = null; drawStart = null; placing = null;
    clickPts = []; polyPts = [];
    canvas.style.cursor = 'crosshair';
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    updateStatus();
  });
  plateList.appendChild(plateItem);

  // Bolt Group item (in plates section)
  const bgItem = document.createElement('div');
  bgItem.className = 'lib-item'; bgItem.textContent = 'Bolt Group';
  bgItem.addEventListener('click', () => {
    document.getElementById('boltGroupDialog').classList.add('visible');
  });
  plateList.appendChild(bgItem);

  // Connections library (V16, drafter §9.x) — parametric connection builders
  const connList = document.getElementById('connList');
  if (connList) {
    const connItems = [
      { kind: 'capPlate',  label: 'Cap Plate' },
      { kind: 'baseplate', label: 'Baseplate' },
      { kind: 'wsp',       label: 'Web Side Plate (WSP)' },
      { kind: 'splice',    label: 'Moment Splice' },
    ];
    for (const { kind, label } of connItems) {
      const item = document.createElement('div');
      item.className = 'lib-item';
      item.textContent = label;
      item.title = `Select a member first, then click to open the ${label.toLowerCase()} wizard.`;
      item.addEventListener('click', () => openConnectionDialog(kind));
      connList.appendChild(item);
    }
  }

  const utilList = document.getElementById('utilList');
  // Centreline
  const clItem = document.createElement('div');
  clItem.className = 'lib-item'; clItem.textContent = 'Centreline';
  clItem.addEventListener('click', () => {
    setTool('draw-centreline'); canvas.style.cursor = 'crosshair';
  });
  utilList.appendChild(clItem);
  // Break Line
  const blItem = document.createElement('div');
  blItem.className = 'lib-item'; blItem.textContent = 'Break Line';
  blItem.addEventListener('click', () => {
    setTool('draw-breakline'); canvas.style.cursor = 'crosshair';
  });
  utilList.appendChild(blItem);
  // Weld Symbol
  const wsItem = document.createElement('div');
  wsItem.className = 'lib-item'; wsItem.textContent = 'Weld Symbol';
  wsItem.addEventListener('click', () => {
    tool = 'draw-weld'; weldStep = 0; weldP1 = null;
    clickPts = []; polyPts = []; placing = null; drawMember = null;
    canvas.style.cursor = 'crosshair';
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    updateStatus();
  });
  utilList.appendChild(wsItem);

  // V17/V18 new library items — order: slot, section mark, member tag, bolt
  // callout, material tag, then the sketch toggles.
  const addUtil = (label, onClick, title) => {
    const item = document.createElement('div');
    item.className = 'lib-item';
    item.textContent = label;
    if (title) item.title = title;
    item.addEventListener('click', onClick);
    utilList.appendChild(item);
    return item;
  };

  addUtil('Slotted Hole', () => {
    setTool('draw-slot'); canvas.style.cursor = 'crosshair';
  }, 'Click to place an M20 standard slot (22×40). AS 1100 §7.7.');

  addUtil('Section Mark', () => {
    setTool('draw-sectionmark'); canvas.style.cursor = 'crosshair';
  }, 'Two clicks to place an A-A cut mark. Letter auto-assigned.');

  addUtil('Member Tag', () => {
    setTool('place-member-tag'); canvas.style.cursor = 'crosshair';
  }, 'Click a member then click to place its auto-label (reads section).');

  addUtil('Bolt Callout', () => {
    setTool('place-bolt-callout'); canvas.style.cursor = 'crosshair';
  }, 'Select N bolts first, then click to place "N/M20 8.8/S" callout.');

  addUtil('Material Tag', () => {
    setTool('place-material-tag'); canvas.style.cursor = 'crosshair';
  }, 'Click plate/member, then text location. Type e.g. "PL 12 THK".');

  // V19 revision + detail callout items
  addUtil('Revision Triangle', () => {
    setTool('place-rev-triangle'); canvas.style.cursor = 'crosshair';
  }, 'Click to place a numbered revision triangle.');

  addUtil('Revision Cloud', () => {
    polyPts = [];
    setTool('draw-rev-cloud'); canvas.style.cursor = 'crosshair';
  }, 'Click corners around revised work; Enter or double-click to close.');

  addUtil('Detail Reference', () => {
    setTool('place-detail-ref'); canvas.style.cursor = 'crosshair';
  }, 'Click to place a "3/S-400" detail callout bubble.');

  addUtil('Detail Card', () => {
    setTool('draw-detail-card'); canvas.style.cursor = 'crosshair';
  }, 'Two clicks to draw a card frame with detail number + scale (V19.4).');

  // Sketch-mode toggles — persistent buttons (visual state reflects the flag)
  const sketchWobble = addUtil(
    sketchOn ? '✓ Sketch wobble' : 'Sketch wobble',
    (e) => {
      sketchOn = !sketchOn;
      e.target.textContent = sketchOn ? '✓ Sketch wobble' : 'Sketch wobble';
      requestRender();
    },
    'Deterministic hand-drawn line wobble. Good for presentation drawings.'
  );
  const sketchGrainItem = addUtil(
    sketchGrain ? '✓ Paper grain' : 'Paper grain',
    (e) => {
      sketchGrain = !sketchGrain;
      e.target.textContent = sketchGrain ? '✓ Paper grain' : 'Paper grain';
      requestRender();
    },
    'Subtle paper-texture overlay (classic theme only).'
  );
}

