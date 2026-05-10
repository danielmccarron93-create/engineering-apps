'use strict';

// V26 — Bluebeam-style left rail (Pages / Layers / Settings) — self-contained IIFE
// Extracted from dev/index.html lines 21807-22237 (2026-05-02 modular split)

// V26 — Bluebeam-style left rail (Pages / Layers / Settings)
// Self-contained module: reads from V1 globals, writes UI only.
// ============================================================
(function bbRail() {
  const RAIL_MIN = 180, RAIL_MAX = 600, RAIL_DEFAULT = 280, COLLAPSE_THRESHOLD = 110;
  const STORAGE_KEY = 'sd_bb_rail_w_v26';

  function railEl()  { return document.getElementById('bbRail'); }
  function mainEl()  { return document.getElementById('mainLayout'); }
  function handle()  { return document.getElementById('bbRailHandle'); }

  // ---- Tab switching ----
  function switchTab(name) {
    const tabs = document.querySelectorAll('#bbRail .bb-rail__tab');
    const panels = document.querySelectorAll('#bbRail .bb-rail__panel');
    tabs.forEach(t => t.classList.toggle('active', t.dataset.bbtab === name));
    panels.forEach(p => p.classList.toggle('active', p.dataset.bbpanel === name));
    if (name === 'draw')    { try { renderDrawTab(); } catch(_){} }
    if (name === 'pages')   renderPagesTab();
    if (name === 'layers')  renderLayersTab();
    if (name === 'settings') refreshSettingsTab();
    // Make sure the rail isn't collapsed when we programmatically switch.
    const m = mainEl();
    if (m && m.classList.contains('bb-rail-collapsed') && typeof setRailWidth === 'function') {
      const stored = parseFloat(localStorage.getItem(STORAGE_KEY) || RAIL_DEFAULT) || RAIL_DEFAULT;
      setRailWidth(stored);
    }
  }
  // V25-layout-overhaul Phase 6 — expose a thin shim so external code (the
  // canvas dblclick handler) can route the user to the Settings tab when
  // they double-click an entity. Kept namespaced to avoid global pollution.
  window.bbRailSwitchToSettings = function() { switchTab('settings'); };
  window.bbRailSwitchTab = switchTab;
  function bindTabs() {
    document.querySelectorAll('#bbRail .bb-rail__tab').forEach(t => {
      t.addEventListener('click', () => switchTab(t.dataset.bbtab));
    });
  }

  // ---- Pages tab ----
  function renderPagesTab() {
    const host = document.getElementById('bbPagesList');
    if (!host || typeof project === 'undefined' || !Array.isArray(project.sheets)) return;
    host.innerHTML = '';
    project.sheets.forEach((s, i) => {
      const card = document.createElement('div');
      card.className = 'bb-page-card' + (i === project.activeSheetIdx ? ' active' : '');
      const dno = (s.sheetInfo && s.sheetInfo.drawingNo) || '';
      const name = s.name || `Sheet ${i+1}`;
      const mode = (s.mode || '3d').toUpperCase();
      const scale = s.drawingScale ? `1:${s.drawingScale}` : '';
      // V25 — split drawing-number and sheet name into separate spans so the
      // mono dno can size independently of the sans name. CSS .bb-page-card
      // grid (56px | 1fr) lays them out; if dno is empty, name spans both cols
      // via the .bb-page-card__title fallback rule.
      card.innerHTML = (dno
        ? `<span class="bb-page-card__dno">${escapeForRail(dno)}</span><span class="bb-page-card__name">${escapeForRail(name)}</span>`
        : `<div class="bb-page-card__title">${escapeForRail(name)}</div>`) +
        `<div class="bb-page-card__meta">${mode} mode${scale ? ' · ' + scale : ''}</div>`;
      card.addEventListener('click', () => {
        if (typeof projectSwitchSheet === 'function') projectSwitchSheet(i);
        renderPagesTab();
      });
      card.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const n = prompt('Sheet name:', s.name || '');
        if (n && typeof projectRenameSheet === 'function') {
          projectRenameSheet(i, n); renderPagesTab();
        }
      });
      // close (delete) button
      if (project.sheets.length > 1) {
        const close = document.createElement('button');
        close.className = 'bb-page-card__close';
        close.title = 'Delete sheet';
        close.textContent = '×';
        close.addEventListener('click', (e) => {
          e.stopPropagation();
          if (typeof projectDeleteSheet === 'function' && confirm(`Delete "${name}"?`)) {
            projectDeleteSheet(i); renderPagesTab();
          }
        });
        card.appendChild(close);
      }
      host.appendChild(card);
    });
  }
  function bindPagesActions() {
    const add = document.getElementById('bbPagesAdd');
    const dup = document.getElementById('bbPagesDuplicate');
    if (add) add.addEventListener('click', () => {
      const n = prompt('New sheet name:', `Sheet ${project.sheets.length + 1}`);
      if (n && typeof projectAddSheet === 'function') { projectAddSheet(n); renderPagesTab(); }
    });
    if (dup) dup.addEventListener('click', () => {
      // V1 doesn't expose a clean duplicate — fall back to add-with-copied-name
      if (typeof projectAddSheet === 'function') {
        const cur = project.sheets[project.activeSheetIdx];
        const name = (cur && cur.name ? cur.name + ' (copy)' : `Sheet ${project.sheets.length + 1}`);
        projectAddSheet(name); renderPagesTab();
      }
    });
  }

  // ---- Layers tab ----
  // Mirrors renderLayerPanel into our own host (renderLayerPanel writes to
  // #layerPanelList — so we duplicate the logic against #bbLayersList).
  function renderLayersTab() {
    const host = document.getElementById('bbLayersList');
    if (!host) return;
    host.innerHTML = '';
    const groups = (typeof _layerGroups !== 'undefined') ? _layerGroups : [];
    if (!groups.length) {
      // V25 — note: removed inline font/color styles so the rail's --text-mute
      // theme token applies (was hardcoded `system-ui`/`var(--mute)`).
      host.innerHTML = '<div class="rail-empty">No layer groups available.</div>';
      return;
    }
    groups.forEach(grp => {
      const row = document.createElement('div');
      row.className = 'layer-row';
      // V25 — inline cssText removed so the .layer-row CSS rule applies.
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = (typeof _layerGroupOn === 'function') ? _layerGroupOn(grp) : true;
      cb.id = 'bbLyr_' + grp.label.replace(/\s+/g,'_');
      cb.addEventListener('change', () => {
        if (typeof _layerGroupSet === 'function') _layerGroupSet(grp, cb.checked);
        if (typeof requestRender === 'function') requestRender();
        // mirror to old panel if open
        if (typeof renderLayerPanel === 'function') renderLayerPanel();
      });
      const lab = document.createElement('label');
      lab.htmlFor = cb.id; lab.textContent = grp.label;
      row.appendChild(cb); row.appendChild(lab);
      host.appendChild(row);
    });
  }

  // ---- Draw tab (V25-layout-overhaul) ----
  // Hand-curated tile spec mirroring Dan's sketches: Lines / Text / Members /
  // Hatches / Measure. Each section is a 4-column grid (CSS in .bb-draw).
  // Tiles re-use existing tool IDs where possible so highlightActiveTile()
  // and v25ActiveTileId() keep working without changes.
  function getDrawTabDef() {
    const lus = (typeof lastUsedSection !== 'undefined') ? lastUsedSection : {};
    const openBoltDialog = () => {
      const dlg = document.getElementById('boltGroupDialog');
      if (dlg) dlg.classList.add('visible');
    };
    return [
      { title: 'Linework', tiles: [
        { id: 'v25-line-thick',  kind: 'tool', label: 'Thick',
          linePreview: { lw: 0.50, ls: 'solid' },
          onClick: () => v25SetLine(0.50, 'solid') },
        { id: 'v25-line-thin',   kind: 'tool', label: 'Thin',
          linePreview: { lw: 0.25, ls: 'solid' },
          onClick: () => v25SetLine(0.25, 'solid') },
        { id: 'v25-line-dotted', kind: 'tool', label: 'Dotted',
          linePreview: { lw: 0.25, ls: 'dotted' },
          onClick: () => v25SetLine(0.25, 'dotted') },
        { id: 'v25-line-cl',     kind: 'tool', label: 'Centre',
          linePreview: { lw: 0.18, ls: 'centre' },
          onClick: () => v25SetLine(0.18, 'centre') },
        { id: 't-rect',    kind: 'tool', label: 'Rect',
          icon: 'icon-rect',     onClick: () => setTool('rect') },
        { id: 't-poly',    kind: 'tool', label: 'Polyline',
          icon: 'icon-polyline', onClick: () => setTool('polyline') },
        { id: 't-circle',  kind: 'tool', label: 'Circle',
          icon: 'icon-circle',   onClick: () => setTool('circle') },
      ]},
      { title: 'Text', tiles: [
        { id: 'd-textbox', kind: 'soon', label: 'Text box',
          icon: 'icon-rect', soonTag: 'soon',
          soonNote: 'Bordered text box — coming in a follow-on build.' },
        { id: 'v25-leader', kind: 'tool', label: 'Leader',
          icon: 'icon-note', onClick: () => v25SetTool('v25-leader') },
        { id: 'd-text', kind: 'tool', label: 'Text',
          icon: 'icon-text', onClick: () => setTool('text') },
      ]},
      { title: 'Members', tiles: [
        // Order = user's frequency-of-use, most → least:
        // Row 1: UB · PFC · SHS · RHS
        // Row 2: CHS · EA · UA · UC
        // Row 3: WB · BOLT · BOLT GRP · PLATE
        { id: 'v25-ub-2d', kind: 'member', label: 'UB',
          sub: 'UB', icon: 'icon-ub',
          onClick: () => v25PickAndSetMember('ub'),
          picker: { kind: 'ub' } },
        { id: 'd-pfc', kind: 'soon', label: 'PFC',
          sub: 'PFC', icon: 'icon-pfc', soonTag: 'soon',
          soonNote: 'PFC drawing — coming in a follow-on build.' },
        { id: 'v25-shs-2d', kind: 'member', label: 'SHS',
          sub: 'SHS', icon: 'icon-shs',
          onClick: () => v25PickAndSetMember('shs'),
          picker: { kind: 'shs' } },
        { id: 'v25-rhs-2d', kind: 'member', label: 'RHS',
          sub: 'RHS', icon: 'icon-rhs',
          onClick: () => v25PickAndSetMember('rhs'),
          picker: { kind: 'rhs' } },
        { id: 'd-chs', kind: 'soon', label: 'CHS',
          sub: 'CHS', icon: 'icon-chs', soonTag: 'soon',
          soonNote: 'CHS drawing — coming in a follow-on build.' },
        { id: 'd-ea', kind: 'soon', label: 'EA',
          sub: 'EA', icon: 'icon-ea', soonTag: 'soon',
          soonNote: 'Equal Angle drawing — coming in a follow-on build.' },
        { id: 'd-ua', kind: 'soon', label: 'UA',
          sub: 'UA', icon: 'icon-ua', soonTag: 'soon',
          soonNote: 'Unequal Angle drawing — coming in a follow-on build.' },
        { id: 'v25-uc-2d', kind: 'member', label: 'UC',
          sub: 'UC', icon: 'icon-uc',
          onClick: () => v25PickAndSetMember('uc'),
          picker: { kind: 'uc' } },
        { id: 'v25-wb-2d', kind: 'member', label: 'WB',
          sub: 'WB', icon: 'icon-ub',
          onClick: () => v25PickAndSetMember('wb'),
          picker: { kind: 'wb' } },
        { id: 'd-bolt', kind: 'tool', label: 'Bolts',
          sub: 'BOLT', icon: 'icon-bolt',
          onClick: () => selectMemberByBolt(lastUsedSection.bolt || 'M20') },
        { id: 'd-bolt-group', kind: 'tool', label: 'Bolt grp',
          sub: 'BOLT GRP', icon: 'icon-bolt-group', onClick: openBoltDialog },
        { id: 'plate', kind: 'tool', label: 'Plate',
          sub: 'PLATE', icon: 'icon-plate', onClick: () => setTool('draw-plate') },
      ]},
      { title: 'Hatches', tiles: [
        { id: 'd-hat-existing', kind: 'tool', label: 'Existing',
          materialPreview: 'reoConcrete', icon: 'icon-hatch',
          onClick: () => v25SetHatch('reoConcrete') },
        { id: 'd-hat-new', kind: 'tool', label: 'New conc.',
          materialPreview: 'concrete', icon: 'icon-hatch',
          onClick: () => v25SetHatch('concrete') },
        { id: 'd-hat-block', kind: 'tool', label: 'Block',
          materialPreview: 'blockwork', icon: 'icon-hatch',
          onClick: () => v25SetHatch('blockwork') },
        { id: 'd-hat-brick', kind: 'tool', label: 'Brick',
          materialPreview: 'brickwork', icon: 'icon-hatch',
          onClick: () => v25SetHatch('brickwork') },
        { id: 'd-hat-tmb-end', kind: 'tool', label: 'Tmb end',
          materialPreview: 'timberSec', icon: 'icon-hatch',
          onClick: () => v25SetHatch('timberSec') },
        { id: 'd-hat-tmb-side', kind: 'tool', label: 'Tmb side',
          materialPreview: 'timberElev', icon: 'icon-hatch',
          onClick: () => v25SetHatch('timberElev') },
        { id: 'd-hat-grout', kind: 'tool', label: 'Grout',
          materialPreview: 'grout', icon: 'icon-hatch',
          onClick: () => v25SetHatch('grout') },
        { id: 'd-hat-sand', kind: 'tool', label: 'Sand',
          materialPreview: 'sand', icon: 'icon-hatch',
          onClick: () => v25SetHatch('sand') },
        { id: 'd-hat-back', kind: 'tool', label: 'Backfill',
          materialPreview: 'backfill', icon: 'icon-hatch',
          onClick: () => v25SetHatch('backfill') },
        { id: 'd-hat-soil', kind: 'tool', label: 'Soil',
          materialPreview: 'soil', icon: 'icon-hatch',
          onClick: () => v25SetHatch('soil') },
        { id: 'd-hat-ins', kind: 'tool', label: 'Insul.',
          materialPreview: 'insulation', icon: 'icon-hatch',
          onClick: () => v25SetHatch('insulation') },
        { id: 'd-hat-cross', kind: 'tool', label: 'Cross',
          materialPreview: 'earth', icon: 'icon-hatch',
          onClick: () => v25SetHatch('earth') },
      ]},
      { title: 'Measure', tiles: [
        { id: 'a-aligned', kind: 'tool', label: 'Dim line',
          icon: 'icon-dim-chain',
          onClick: () => { dimType = 'aligned'; setTool('dimension'); } },
        { id: 'a-dimH',    kind: 'tool', label: 'Dim',
          icon: 'icon-dim-h',
          onClick: () => { dimType = 'horizontal'; setTool('dimension'); } },
        { id: 'd-area',  kind: 'soon', label: 'Area',
          icon: 'icon-polygon', soonTag: 'soon',
          soonNote: 'Area measurement — coming in a follow-on build.' },
        { id: 'd-angle', kind: 'soon', label: 'Angle',
          icon: 'icon-dim-angular', soonTag: 'soon',
          soonNote: 'Angle measurement — coming in a follow-on build.' },
      ]},
    ];
  }

  function renderDrawTab() {
    const host = document.getElementById('bbDrawHost');
    if (!host || typeof makeTile !== 'function') return;
    host.innerHTML = '';
    for (const group of getDrawTabDef()) {
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
    if (typeof highlightActiveTile === 'function') highlightActiveTile();
  }

  // ---- Settings tab ----
  function reparentInspectorIntoSettings() {
    const host = document.getElementById('bbSettingsHost');
    const insp = document.getElementById('inspectorRoot');
    if (!host || !insp || host.contains(insp)) return;
    // Move the inspector aside into the Settings tab. Its existing children
    // (#inspEyebrow, #inspH1, #inspectorBody) keep their IDs, so updateInspector
    // continues to drive them.
    host.appendChild(insp);
    // Override the aside's CSS so it fills the panel naturally.
    insp.style.borderLeft = 'none';
    insp.style.width = 'auto';
    insp.style.padding = '0';
    insp.style.background = 'transparent';
  }
  function refreshSettingsTab() {
    if (typeof updateInspector === 'function') updateInspector();
  }

  // ---- Drag-resize ----
  function setRailWidth(w) {
    w = Math.max(0, Math.min(RAIL_MAX, w));
    if (w < COLLAPSE_THRESHOLD) {
      mainEl().classList.add('bb-rail-collapsed');
      handle().classList.add('collapsed-edge');
      handle().title = 'Click to expand the side rail';
    } else {
      mainEl().classList.remove('bb-rail-collapsed');
      handle().classList.remove('collapsed-edge');
      handle().title = 'Drag to resize · double-click to collapse';
      const clamped = Math.max(RAIL_MIN, w);
      document.documentElement.style.setProperty('--bb-rail-w', clamped + 'px');
      try { localStorage.setItem(STORAGE_KEY, String(clamped)); } catch (_) {}
    }
    if (typeof resize === 'function') resize();
    if (typeof requestRender === 'function') requestRender();
  }
  function bindHandle() {
    const h = handle();
    if (!h) return;
    let dragging = false, startX = 0, startW = 0;
    h.addEventListener('mousedown', (e) => {
      // If collapsed, click anywhere on the edge expands.
      if (mainEl().classList.contains('bb-rail-collapsed')) {
        const stored = parseFloat(localStorage.getItem(STORAGE_KEY) || RAIL_DEFAULT) || RAIL_DEFAULT;
        setRailWidth(stored);
        return;
      }
      dragging = true; startX = e.clientX;
      startW = parseFloat(getComputedStyle(railEl()).width) || RAIL_DEFAULT;
      h.classList.add('dragging');
      e.preventDefault();
      const mv = (ev) => {
        if (!dragging) return;
        const w = startW + (ev.clientX - startX);
        setRailWidth(w);
      };
      const up = () => {
        dragging = false; h.classList.remove('dragging');
        window.removeEventListener('mousemove', mv);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mousemove', mv);
      window.addEventListener('mouseup', up);
    });
    h.addEventListener('dblclick', () => {
      if (mainEl().classList.contains('bb-rail-collapsed')) {
        const stored = parseFloat(localStorage.getItem(STORAGE_KEY) || RAIL_DEFAULT) || RAIL_DEFAULT;
        setRailWidth(stored);
      } else {
        setRailWidth(0);
      }
    });
  }

  // ---- Auto-refresh hooks ----
  // Intercept V1's render functions so the rail's tabs stay in sync without
  // having to find every callsite.
  function installHooks() {
    if (typeof window.renderSheetBrowser === 'function') {
      const orig = window.renderSheetBrowser;
      window.renderSheetBrowser = function(...a) { const r = orig.apply(this, a); try { renderPagesTab(); } catch(_){} return r; };
    }
    if (typeof window.renderLayerPanel === 'function') {
      const orig = window.renderLayerPanel;
      window.renderLayerPanel = function(...a) { const r = orig.apply(this, a); try { renderLayersTab(); } catch(_){} return r; };
    }
    if (typeof window.updateInspector === 'function') {
      // updateInspector already writes into #inspectorBody — which now lives in our Settings tab.
      // No need to wrap; the function already targets the moved DOM.
    }
  }

  function escapeForRail(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // ---- Init ----
  function init() {
    // restore stored width
    try {
      const w = parseFloat(localStorage.getItem(STORAGE_KEY));
      if (w && w >= RAIL_MIN && w <= RAIL_MAX) {
        document.documentElement.style.setProperty('--bb-rail-w', w + 'px');
      } else {
        document.documentElement.style.setProperty('--bb-rail-w', RAIL_DEFAULT + 'px');
      }
    } catch (_) { document.documentElement.style.setProperty('--bb-rail-w', RAIL_DEFAULT + 'px'); }

    bindTabs();
    bindPagesActions();
    bindHandle();
    reparentInspectorIntoSettings();
    installHooks();

    // First render
    try { renderDrawTab(); } catch(_){}
    renderPagesTab();
    renderLayersTab();
    refreshSettingsTab();

    // Watch selection changes — the Settings tab needs to update on every selection.
    // V1 calls updateInspector() inside its selection handlers already, so the moved
    // #inspectorBody updates automatically. Nothing to add here.
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }
})();
