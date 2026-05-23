'use strict';

// V21 tile palette — mode-filtered tile grid
// Extracted from dev/index.html lines 15537-15929 (2026-05-02 modular split)

// V21 TILE PALETTE — mode-filtered tile grid
// ============================================================
// Replaces the flat scrolling library. Tiles are grouped into sections per
// mode; clicking a tile activates a tool (with last-used size); clicking
// the chevron opens a size-picker dropdown (see V21.5).
//
// Each tile descriptor:
//   id       — stable handle for last-used tracking + favourites
//   kind     — 'tool' | 'member' | 'bolt' | 'plate' | 'connection' | 'soon'
//   label    — tile caption
//   icon     — symbol id (without '#')
//   chord    — optional chord code e.g. 'M-U'
//   onClick  — function to run when tile body is clicked
//   picker   — optional config for size-picker dropdown
//   soon     — if true, renders as faded placeholder with popover
//   soonTag  — version label e.g. 'V22'
//   soonNote — description of the feature for placeholder popover

// Runtime state — last-used size per section tile (e.g. 'ub' → '360UB 50.7').
let lastUsedSection = {};

// Palette definitions (static — rendered per mode).
function getPaletteDef() {
  return {
    model: [
      {
        title: 'Sections',
        tiles: [
          // Order = user's frequency-of-use, most → least:
          // UB · PFC · SHS · RHS · CHS · EA · UA · UC · WB.
          { id: 'ub',  kind: 'member', label: 'UB',  sub: lastUsedSection.ub  || '360UB 50.7', icon: 'icon-ub',  chord: 'M-U',
            onClick: () => selectMemberBySection('ub',  lastUsedSection.ub  || '360UB 50.7'),
            picker: { kind: 'ub'  } },
          { id: 'pfc', kind: 'member', label: 'PFC', sub: lastUsedSection.pfc || '200PFC 22.9', icon: 'icon-pfc', chord: 'M-P',
            onClick: () => selectMemberBySection('pfc', lastUsedSection.pfc || '200PFC 22.9'),
            picker: { kind: 'pfc' } },
          { id: 'shs', kind: 'member', label: 'SHS', sub: lastUsedSection.shs || '150x6',     icon: 'icon-shs', chord: 'M-S',
            onClick: () => selectMemberBySection('shs', lastUsedSection.shs || '150x6'),
            picker: { kind: 'shs' } },
          { id: 'rhs', kind: 'member', label: 'RHS', sub: lastUsedSection.rhs || '100x50x5', icon: 'icon-rhs',
            onClick: () => selectMemberBySection('rhs', lastUsedSection.rhs || '100x50x5'),
            picker: { kind: 'rhs' } },
          { id: 'chs', kind: 'member', label: 'CHS', sub: lastUsedSection.chs || '88.9x5.9', icon: 'icon-chs',
            onClick: () => selectMemberBySection('chs', lastUsedSection.chs || '88.9x5.9'),
            picker: { kind: 'chs' } },
          { id: 'ea',  kind: 'member', label: 'EA',  sub: lastUsedSection.ea || 'EA75x75x6', icon: 'icon-ea',
            onClick: () => selectMemberBySection('ea', lastUsedSection.ea || 'EA75x75x6'),
            picker: { kind: 'ea' } },
          { id: 'ua',  kind: 'member', label: 'UA',  sub: lastUsedSection.ua || 'UA100x75x8', icon: 'icon-ua',
            onClick: () => selectMemberBySection('ua', lastUsedSection.ua || 'UA100x75x8'),
            picker: { kind: 'ua' } },
          { id: 'uc',  kind: 'member', label: 'UC',  sub: lastUsedSection.uc  || '250UC 72.9', icon: 'icon-uc',  chord: 'M-C',
            onClick: () => selectMemberBySection('uc',  lastUsedSection.uc  || '250UC 72.9'),
            picker: { kind: 'uc'  } },
          { id: 'wb',  kind: 'member', label: 'WB',  sub: lastUsedSection.wb  || '700WB130',  icon: 'icon-ub',  chord: 'M-W',
            onClick: () => selectMemberBySection('wb',  lastUsedSection.wb  || '700WB130'),
            picker: { kind: 'wb'  } },
        ],
      },
      {
        title: 'Fasteners',
        tiles: [
          { id: 'bolt', kind: 'bolt', label: 'Bolt', sub: lastUsedSection.bolt || 'M20', icon: 'icon-bolt', chord: 'M-B',
            onClick: () => selectMemberByBolt(lastUsedSection.bolt || 'M20'),
            picker: { kind: 'bolt' } },
          { id: 'boltGroup', kind: 'tool', label: 'Group', icon: 'icon-bolt-group', chord: 'M-G',
            onClick: () => document.getElementById('boltGroupDialog').classList.add('visible') },
          { id: 'slot', kind: 'tool', label: 'Slot', icon: 'icon-slot',
            onClick: () => setTool('draw-slot') },
        ],
      },
      {
        title: 'Plates',
        tiles: [
          { id: 'plate', kind: 'tool', label: 'Plate', icon: 'icon-plate', chord: 'M-L',
            onClick: () => {
              tool = 'draw-plate';
              platePts = []; plateBlock = null; plateDimInput = ''; plateDimActive = false;
              drawMember = null; drawStart = null; placing = null;
              clickPts = []; polyPts = [];
              canvas.style.cursor = 'crosshair';
              updateStatus();
              highlightActiveTile();
            } },
        ],
      },
      {
        title: 'Connections',
        tiles: [
          { id: 'conn-cap',   kind: 'connection', label: 'Cap Plate', icon: 'icon-cap-plate', chord: 'M-K',
            onClick: () => openConnectionDialog('capPlate') },
          { id: 'conn-base',  kind: 'connection', label: 'Baseplate', icon: 'icon-baseplate',
            onClick: () => openConnectionDialog('baseplate') },
          { id: 'conn-wsp',   kind: 'connection', label: 'WSP',       icon: 'icon-wsp',
            onClick: () => openConnectionDialog('wsp') },
          { id: 'conn-splice',kind: 'connection', label: 'Splice',    icon: 'icon-splice',
            onClick: () => openConnectionDialog('splice') },
        ],
      },
    ],
    draw: [
      {
        title: 'Primitives',
        tiles: [
          { id: 't-select',  kind: 'tool', label: 'Select',   icon: 'icon-select',   onClick: () => setTool('select') },
          { id: 't-line',    kind: 'tool', label: 'Line',     icon: 'icon-line',     chord: 'D-L', onClick: () => setTool('line') },
          { id: 't-rect',    kind: 'tool', label: 'Rect',     icon: 'icon-rect',     chord: 'D-R', onClick: () => setTool('rect') },
          { id: 't-circle',  kind: 'tool', label: 'Circle',   icon: 'icon-circle',   chord: 'D-C', onClick: () => setTool('circle') },
          { id: 't-poly',    kind: 'tool', label: 'Polyline', icon: 'icon-polyline', chord: 'D-P', onClick: () => setTool('polyline') },
          { id: 't-cl',      kind: 'tool', label: 'Centreline', icon: 'icon-line',   onClick: () => setTool('draw-centreline') },
          { id: 't-arc',     kind: 'tool', label: 'Arc',      icon: 'icon-arc',      onClick: () => setTool('arc') },
          { id: 't-polygon', kind: 'tool', label: 'Polygon',  icon: 'icon-polygon',  onClick: () => setTool('polygon') },
          { id: 't-spline',  kind: 'soon', label: 'Spline',   icon: 'icon-spline',   soonTag: 'V23', soonNote: 'Smooth curve through control points.' },
        ],
      },
      {
        title: 'Fill',
        tiles: [
          { id: 't-hatch',   kind: 'tool', label: 'Hatch',    icon: 'icon-hatch', onClick: () => { polyPts = []; setTool('draw-hatch'); } },
          { id: 't-fill',    kind: 'soon', label: 'Fill',     icon: 'icon-fill',  soonTag: 'V23', soonNote: 'Solid colour fill for enclosed regions.' },
        ],
      },
      {
        title: 'Text',
        tiles: [
          { id: 't-text',    kind: 'tool', label: 'Text',     icon: 'icon-text',  chord: 'D-T', onClick: () => setTool('text') },
          { id: 't-mtext',   kind: 'tool', label: 'MText',    icon: 'icon-mtext', onClick: () => setTool('place-mtext') },
        ],
      },
      {
        title: 'Construction',
        tiles: [
          { id: 't-break',   kind: 'tool', label: 'Break',    icon: 'icon-break-line', chord: 'D-B', onClick: () => setTool('draw-breakline') },
          { id: 't-offset',  kind: 'tool', label: 'Offset',   icon: 'icon-offset',     onClick: () => setTool('offset') },
          { id: 't-fillet',  kind: 'tool', label: 'Fillet',   icon: 'icon-fillet',     onClick: () => setTool('fillet') },
          { id: 't-chamfer', kind: 'tool', label: 'Chamfer',  icon: 'icon-chamfer',    onClick: () => setTool('chamfer') },
        ],
      },
    ],
    annotate: [
      {
        title: 'Dimensions',
        tiles: [
          { id: 'a-dimH',      kind: 'tool', label: 'Dim H',      icon: 'icon-dim-h',        chord: 'A-H', onClick: () => { dimType = 'horizontal'; setTool('dimension'); } },
          { id: 'a-dimV',      kind: 'tool', label: 'Dim V',      icon: 'icon-dim-v',        chord: 'A-V', onClick: () => { dimType = 'vertical'; setTool('dimension'); } },
          { id: 'a-aligned',   kind: 'tool', label: 'Aligned',    icon: 'icon-dim-aligned',  onClick: () => { dimType = 'aligned'; setTool('dimension'); } },
          { id: 'a-angular',   kind: 'tool', label: 'Angular',    icon: 'icon-dim-angular',  onClick: () => { dimType = 'angular'; setTool('dimension'); } },
          { id: 'a-chain',     kind: 'tool', label: 'Chain',      icon: 'icon-dim-chain',    chord: 'A-C', onClick: () => { dimType = 'horizontal'; setTool('dimension'); } },
          { id: 'a-baseline',  kind: 'tool', label: 'Baseline',   icon: 'icon-dim-baseline', onClick: () => { dimType = 'horizontal'; setTool('dimension'); } },
          { id: 'a-ordinate',  kind: 'soon', label: 'Ordinate',   icon: 'icon-dim-ordinate', soonTag: 'V23', soonNote: 'Ordinate dims from a single datum origin.' },
        ],
      },
      {
        title: 'Tags',
        tiles: [
          { id: 'a-memberTag', kind: 'tool', label: 'Member Tag',  icon: 'icon-member-tag',  chord: 'A-T', onClick: () => setTool('place-member-tag') },
          { id: 'a-matTag',    kind: 'tool', label: 'Material Tag',icon: 'icon-material-tag', onClick: () => setTool('place-material-tag') },
          { id: 'a-boltCall',  kind: 'tool', label: 'Bolt Callout',icon: 'icon-bolt-callout', onClick: () => setTool('place-bolt-callout') },
          { id: 'a-note',      kind: 'tool', label: 'Note',         icon: 'icon-note',        onClick: () => setTool('place-note') },
        ],
      },
      {
        title: 'Symbols',
        tiles: [
          { id: 'a-section',   kind: 'tool', label: 'Section',     icon: 'icon-section-mark', chord: 'A-S', onClick: () => setTool('draw-sectionmark') },
          { id: 'a-weld',      kind: 'tool', label: 'Weld',        icon: 'icon-weld',         chord: 'A-W',
            onClick: () => {
              tool = 'draw-weld'; weldStep = 0; weldP1 = null;
              clickPts = []; polyPts = []; placing = null; drawMember = null;
              canvas.style.cursor = 'crosshair';
              updateStatus();
              highlightActiveTile();
            } },
          { id: 'a-detailRef', kind: 'tool', label: 'Detail Ref',  icon: 'icon-detail-ref',   onClick: () => setTool('place-detail-ref') },
          { id: 'a-grid',      kind: 'tool', label: 'Grid Line',   icon: 'icon-grid-line',    onClick: () => setTool('draw-gridline') },
        ],
      },
      {
        title: 'Revisions',
        tiles: [
          { id: 'a-revT',      kind: 'tool', label: 'Rev Tri',     icon: 'icon-rev-triangle', chord: 'A-R', onClick: () => setTool('place-rev-triangle') },
          { id: 'a-revCloud',  kind: 'tool', label: 'Rev Cloud',   icon: 'icon-rev-cloud',
            onClick: () => { polyPts = []; setTool('draw-rev-cloud'); } },
          { id: 'a-revSched',  kind: 'tool', label: 'Rev Schedule',icon: 'icon-rev-schedule', onClick: () => setTool('place-rev-schedule') },
          { id: 'a-detailCard',kind: 'tool', label: 'Detail Card', icon: 'icon-rect',         onClick: () => setTool('draw-detail-card') },
        ],
      },
    ],
  };
}

// Helpers for tiles that set up a member-draw. Keeps behaviour identical to
// the old library click handlers but routes through the tile system.
//
// Welded Beams render via the same I-section pipeline as UB/UC, so the
// drawMember.type is normalised to 'ub' for placement / drawUB lookups while
// lastUsedSection.wb still tracks the WB-specific picker state.
function selectMemberBySection(type, section) {
  const placementType = (type === 'wb') ? 'ub' : type;
  drawMember = { type: placementType, section };
  drawStart = null; drawPreviewEnd = null;
  tool = 'draw-member';
  clickPts = []; polyPts = []; placing = null;
  if (canvas && canvas.style) canvas.style.cursor = 'crosshair';
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  updateStatus();
  lastUsedSection[type] = section;
  if (typeof rememberFavourite === 'function') rememberFavourite({ type: 'member', memberType: type, section });
  highlightActiveTile();
}
function selectMemberByBolt(size) {
  drawMember = { type: 'bolt', boltSize: size };
  drawStart = null; drawPreviewEnd = null;
  tool = 'draw-member';
  clickPts = []; polyPts = []; placing = null;
  if (canvas && canvas.style) canvas.style.cursor = 'crosshair';
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  updateStatus();
  lastUsedSection.bolt = size;
  if (typeof rememberFavourite === 'function') rememberFavourite({ type: 'bolt', size });
  highlightActiveTile();
}

// Build one tile DOM node.
function makeTile(spec) {
  const tile = document.createElement('div');
  // V21.10 — tiles with a sub-size (e.g. UB with "360UB 50.7") get a taller
  // height via the .has-sub modifier. Pure-icon tiles stay compact at 48px.
  const hasSub = !!spec.sub;
  tile.className = 'tile'
    + (spec.kind === 'soon' ? ' placeholder' : '')
    + (hasSub ? ' has-sub' : '');
  tile.dataset.tileId = spec.id;
  tile.title = spec.label + (spec.sub ? ` — ${spec.sub}` : '')
    + (spec.chord ? ` — ${spec.chord.replace('-', ' then ')}` : '')
    + (spec.kind === 'soon' ? ` (placeholder — ${spec.soonTag || 'soon'})` : '');

  const iconBox = document.createElement('div');
  iconBox.className = 'tile__icon';
  // V25 — material tiles get a real swatch preview of their hatch pattern;
  // line tiles get a thickness/style preview line.
  if (spec.materialPreview && typeof v25DrawMaterialSwatch === 'function') {
    const cv = document.createElement('canvas');
    cv.width = 36; cv.height = 36;
    cv.style.cssText = 'width:36px;height:36px;display:block;border:1px solid var(--border);background:var(--paper,#fff);border-radius:3px';
    iconBox.appendChild(cv);
    // Defer paint until tile is in DOM so getComputedStyle works.
    setTimeout(() => v25DrawMaterialSwatch(cv, spec.materialPreview), 0);
  } else if (spec.linePreview && typeof v25DrawLineSwatch === 'function') {
    const cv = document.createElement('canvas');
    cv.width = 36; cv.height = 36;
    cv.style.cssText = 'width:36px;height:36px;display:block';
    iconBox.appendChild(cv);
    setTimeout(() => v25DrawLineSwatch(cv, spec.linePreview), 0);
  } else {
    iconBox.innerHTML = `<svg class="icon"><use href="#${spec.icon}"/></svg>`;
  }
  tile.appendChild(iconBox);

  // Only render the label row if there's a sub-size to show — pure-icon tiles
  // rely on the icon + tooltip, which keeps the tile compact.
  if (hasSub) {
    const labelRow = document.createElement('div');
    labelRow.className = 'tile__label';
    labelRow.innerHTML = `<span>${spec.sub}</span>`;
    if (spec.picker) {
      const chev = document.createElement('span');
      chev.className = 'tile__chev';
      chev.textContent = '▾';
      chev.title = 'Pick size';
      chev.addEventListener('click', (e) => {
        e.stopPropagation();
        openSizePicker(spec.picker.kind, spec.id, chev);
      });
      labelRow.appendChild(chev);
    }
    tile.appendChild(labelRow);
  }

  if (spec.kind === 'soon') {
    const badge = document.createElement('span');
    badge.className = 'tile__soon';
    badge.textContent = spec.soonTag || 'soon';
    tile.appendChild(badge);
    tile.addEventListener('click', (ev) => showSoonPopover(ev, spec));
  } else {
    tile.addEventListener('click', (ev) => {
      // If the chevron was clicked, its own handler ran already (stopPropagation)
      if (typeof spec.onClick === 'function') {
        spec.onClick();
        if (typeof rememberFavouriteTile === 'function') rememberFavouriteTile(spec);
      }
    });
  }

  return tile;
}

// Render the palette based on currentMode.
function populateTilePalette() {
  const host = document.getElementById('paletteGroups');
  if (!host) return;
  host.innerHTML = '';
  // V25 — pick 2D palette when the active sheet is in 2D paper-space mode.
  // In 2D mode we ignore the Model/Draw/Annotate switcher and render every
  // group as one scrollable list (the switcher is hidden by body.sheet-2d).
  let defs;
  if (sheetMode === '2d' && typeof getPaletteDef2D === 'function') {
    const all = getPaletteDef2D();
    defs = [].concat(all.model || [], all.draw || [], all.annotate || []);
  } else {
    defs = getPaletteDef()[currentMode] || [];
  }
  for (const group of defs) {
    const g = document.createElement('div');
    g.className = 'palette-group';
    const t = document.createElement('div');
    t.className = 'palette-group__title';
    t.textContent = group.title;
    g.appendChild(t);
    const grid = document.createElement('div');
    grid.className = 'palette-grid';
    for (const spec of group.tiles) grid.appendChild(makeTile(spec));
    g.appendChild(grid);
    host.appendChild(g);
  }
  highlightActiveTile();
  if (typeof renderFavourites === 'function') renderFavourites();
}

// Highlight the tile matching the current active tool / member / bolt.
// V25-layout-overhaul — also iterates the Draw rail tab host so tiles
// rendered there get highlighted alongside the legacy palette.
function highlightActiveTile() {
  const hosts = [
    document.getElementById('paletteGroups'),
    document.getElementById('bbDrawHost'),
  ].filter(Boolean);
  if (!hosts.length) return;
  hosts.forEach(h => h.querySelectorAll('.tile').forEach(t => t.classList.remove('active')));
  let id = null;
  if (tool === 'draw-member' && drawMember) {
    if (drawMember.type === 'bolt') id = 'bolt';
    // WB members carry type:'ub' (shared I-section pipeline) so we sniff the
    // section name to highlight the WB tile rather than UB.
    else if (drawMember.type === 'ub' && drawMember.section && drawMember.section.includes('WB')) id = 'wb';
    else if (drawMember.type) id = drawMember.type;
  } else if (tool === 'line') id = 't-line';
  else if (tool === 'rect') id = 't-rect';
  else if (tool === 'circle') id = 't-circle';
  else if (tool === 'polyline') id = 't-poly';
  else if (tool === 'text') id = 't-text';
  else if (tool === 'dimension') id = 'a-dimH';
  else if (tool === 'draw-plate') id = 'plate';
  else if (tool === 'draw-weld') id = 'a-weld';
  else if (tool === 'draw-centreline') id = 't-cl';
  else if (tool === 'draw-breakline') id = 't-break';
  else if (tool === 'draw-slot') id = 'slot';
  else if (tool === 'draw-sectionmark') id = 'a-section';
  else if (tool === 'place-member-tag') id = 'a-memberTag';
  else if (tool === 'place-bolt-callout') id = 'a-boltCall';
  else if (tool === 'place-material-tag') id = 'a-matTag';
  else if (tool === 'place-rev-triangle') id = 'a-revT';
  else if (tool === 'draw-rev-cloud') id = 'a-revCloud';
  else if (tool === 'place-detail-ref') id = 'a-detailRef';
  else if (tool === 'draw-detail-card') id = 'a-detailCard';
  else if (tool === 'select') id = 't-select';
  // V25 — overlay highlight for v25- tools
  if (typeof v25ActiveTileId === 'function') {
    const v25Id = v25ActiveTileId();
    if (v25Id) id = v25Id;
  }
  // Fix L (2026-05-23) — v2 active tool override. v1's `tool` global doesn't
  // change when a v2 tool is active, so the Plate tile stays un-highlighted
  // unless we explicitly recognise v2's place-plate here.
  if (window.v2 && v2.engine && typeof v2.engine.activeTool === 'function') {
    const v2Tool = v2.engine.activeTool();
    if (v2Tool && v2Tool.id === 'place-plate') id = 'plate';
  }
  if (id) {
    hosts.forEach(h => {
      const el = h.querySelector(`.tile[data-tile-id="${id}"]`);
      if (el) el.classList.add('active');
    });
  }
}

// Placeholder popover — shown when the user clicks a faded tile.
let _soonPopoverEl = null;
function showSoonPopover(ev, spec) {
  if (_soonPopoverEl) _soonPopoverEl.remove();
  const pop = document.createElement('div');
  pop.className = 'soon-popover open';
  pop.innerHTML = `
    <h4>${spec.label}</h4>
    <p>${spec.soonNote || 'Coming soon.'}</p>
    <span class="version-tag">Planned for ${spec.soonTag || 'a future release'}</span>
  `;
  const rect = ev.currentTarget.getBoundingClientRect();
  pop.style.left = (rect.right + 8) + 'px';
  pop.style.top = rect.top + 'px';
  document.body.appendChild(pop);
  _soonPopoverEl = pop;
  const close = () => {
    if (_soonPopoverEl) { _soonPopoverEl.remove(); _soonPopoverEl = null; }
    document.removeEventListener('click', onOut, true);
  };
  const onOut = (e) => { if (!pop.contains(e.target)) close(); };
  setTimeout(() => document.addEventListener('click', onOut, true), 0);
}

