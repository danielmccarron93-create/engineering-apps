'use strict';

// ============================================================
// FILE TABS — multi-file-workspace top-bar tabs + empty-file landing
// (multi-file-workspace, 2026-06-04) — self-contained IIFE
// ============================================================
// LAYER: band 7 (shared UI).
//   READS:  workspace, workspaceActiveFile, workspaceSwitchFile,
//           workspaceAddFile, workspaceCloseFile, workspaceRenameFile,
//           importProject, projectAddSheet, project  (all resolved at CALL
//           time — this IIFE only binds DOM + defines functions at load).
//   WRITES: UI only (#fileTabs contents, #btnAddFile menu, the landing
//           overlay div inside #canvas-container). Exposes
//           window.renderFileTabs so workspace ops in other files can refresh.
//
// Mirrors the structure/robustness of js/74-v26-bb-rail.js: every cross-module
// reference is guarded, init runs on DOMContentLoaded (or a 0ms timeout if the
// DOM is already parsed), and the one public hook is published on window.
//
// A "file" is the existing project shape plus file-level metadata (see
// js/04-workspace.js). The top tabs are one-per-open-file; the rail's Pages tab
// stays one-per-page within the active file. When the active file has zero
// pages, a centred landing overlay invites the user to add a page / open a saved
// file / import a PDF.
// ============================================================
(function fileTabs() {

  function tabsHost() { return document.getElementById('fileTabs'); }
  function addBtn()   { return document.getElementById('btnAddFile'); }
  function canvasHost() { return document.getElementById('canvas-container'); }

  // ---- HTML escape (mirrors escapeForRail in 74) ----
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---- File tabs ----
  // One tab per workspace.files[i]: name + dirty dot + close ×. The active tab
  // is highlighted. Click switches file; double-click renames; × closes.
  function renderFileTabs() {
    const host = tabsHost();
    if (!host || typeof workspace === 'undefined' || !Array.isArray(workspace.files)) return;
    host.innerHTML = '';
    workspace.files.forEach((f, i) => {
      const tab = document.createElement('div');
      tab.className = 'file-tab' + (i === workspace.activeFileIdx ? ' active' : '');
      tab.title = (f && f.name) ? f.name : ('File ' + (i + 1));

      const name = document.createElement('span');
      name.className = 'file-tab__name';
      name.textContent = (f && f.name) ? f.name : ('File ' + (i + 1));
      tab.appendChild(name);

      // Dirty dot — present only while the file has unsaved disk changes.
      if (f && f.dirty) {
        const dot = document.createElement('span');
        dot.className = 'file-tab__dirty';
        dot.title = 'Unsaved changes';
        dot.textContent = '•';
        tab.appendChild(dot);
      }

      // Close ×.
      const close = document.createElement('button');
      close.className = 'file-tab__close';
      close.title = 'Close file';
      close.textContent = '×';
      close.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof workspaceCloseFile === 'function') workspaceCloseFile(i);
      });
      tab.appendChild(close);

      tab.addEventListener('click', () => {
        if (typeof workspaceSwitchFile === 'function') workspaceSwitchFile(i);
      });
      tab.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const cur = (f && f.name) ? f.name : '';
        const next = prompt('File name:', cur);
        if (next && typeof workspaceRenameFile === 'function') {
          workspaceRenameFile(i, next);
        }
      });

      host.appendChild(tab);
    });

    // Keep the empty-file landing in sync with the active file's page count.
    refreshLanding();
  }

  // ---- Add-file menu ----
  // A small dropdown anchored under #btnAddFile, styled with the existing .menu
  // idiom so it matches the menubar across all five themes. Items:
  //   • New file        -> page-less file (lands on the empty-file overlay)
  //   • Open .sdproj…    -> importProject() (opens as a NEW file via workspaceOpenFile)
  //   • Import PDF…      -> window.pdfImportPick() (js/83; guarded — no-op if absent)
  let menuEl = null;

  function closeMenu() {
    if (menuEl) { menuEl.classList.remove('open'); }
    document.removeEventListener('mousedown', onDocMouseDown, true);
    document.removeEventListener('keydown', onMenuKeyDown, true);
  }

  function onDocMouseDown(e) {
    if (!menuEl) return;
    if (menuEl.contains(e.target)) return;
    const b = addBtn();
    if (b && b.contains(e.target)) return;
    closeMenu();
  }

  function onMenuKeyDown(e) {
    if (e.key === 'Escape') { closeMenu(); }
  }

  function buildMenu() {
    const m = document.createElement('div');
    m.className = 'menu file-add-menu';
    m.id = 'fileAddMenu';

    const mkItem = (label, opts) => {
      opts = opts || {};
      const it = document.createElement('div');
      it.className = 'menu-item' + (opts.disabled ? ' disabled' : '');
      const txt = document.createElement('span');
      txt.textContent = label;
      it.appendChild(txt);
      if (opts.hint) {
        const h = document.createElement('span');
        h.className = 'shortcut';
        h.textContent = opts.hint;
        it.appendChild(h);
      }
      if (!opts.disabled && typeof opts.onClick === 'function') {
        it.addEventListener('click', () => { closeMenu(); opts.onClick(); });
      }
      return it;
    };

    m.appendChild(mkItem('New file', {
      onClick: () => {
        if (typeof workspaceAddFile !== 'function') return;
        const n = (typeof workspace !== 'undefined' && workspace.files)
          ? workspace.files.length + 1 : 1;
        const name = prompt('New file name:', 'Untitled ' + n);
        // Cancel -> abort. Empty/blank -> fall back to a default name.
        if (name === null) return;
        workspaceAddFile((name && name.trim()) ? name.trim() : ('Untitled ' + n),
          'native', { seedPage: false });
      },
    }));
    m.appendChild(mkItem('Open .sdproj…', {
      onClick: () => { if (typeof importProject === 'function') importProject(); },
    }));
    // multi-file-workspace Phase 3 — Import PDF opens the picker (js/83). Guarded
    // on window.pdfImportPick so a missing PDF layer (CDN miss / file absent)
    // simply does nothing rather than erroring; native files are unaffected.
    m.appendChild(mkItem('Import PDF…', {
      onClick: () => { if (typeof window.pdfImportPick === 'function') window.pdfImportPick(); },
    }));

    return m;
  }

  function toggleMenu() {
    const b = addBtn();
    if (!b) return;
    if (!menuEl) {
      menuEl = buildMenu();
      document.body.appendChild(menuEl);
    }
    const isOpen = menuEl.classList.contains('open');
    if (isOpen) { closeMenu(); return; }
    // Position under the + button (the .menu rule is position:absolute).
    const r = b.getBoundingClientRect();
    menuEl.style.top = (r.bottom + 4) + 'px';
    menuEl.style.left = r.left + 'px';
    menuEl.classList.add('open');
    document.addEventListener('mousedown', onDocMouseDown, true);
    document.addEventListener('keydown', onMenuKeyDown, true);
  }

  function bindAddButton() {
    const b = addBtn();
    if (!b) return;
    b.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
  }

  // ---- Empty-file landing overlay ----
  // A centred overlay over the drawing area, shown when the active file has zero
  // pages. Built lazily inside #canvas-container (which is position:relative, so
  // an absolute child fills it). Buttons: New blank A1 page / Open saved file /
  // Import PDF.
  let landingEl = null;

  function ensureLanding() {
    if (landingEl) return landingEl;
    const host = canvasHost();
    if (!host) return null;
    const el = document.createElement('div');
    el.className = 'file-landing';
    el.id = 'fileLanding';
    el.style.display = 'none';

    const card = document.createElement('div');
    card.className = 'file-landing__card';

    const h = document.createElement('div');
    h.className = 'file-landing__title';
    h.textContent = 'Empty file';
    card.appendChild(h);

    const sub = document.createElement('div');
    sub.className = 'file-landing__sub';
    sub.textContent = 'This file has no pages yet. Start one below.';
    card.appendChild(sub);

    const actions = document.createElement('div');
    actions.className = 'file-landing__actions';

    // New blank A1 page (primary).
    const bNew = document.createElement('button');
    bNew.className = 'file-landing__btn file-landing__btn--primary';
    bNew.textContent = 'New blank A1 page';
    bNew.addEventListener('click', () => {
      if (typeof projectAddSheet === 'function') projectAddSheet('Page 1');
      // projectAddSheet loads the new page; refresh chrome so the overlay hides.
      if (typeof renderFileTabs === 'function') renderFileTabs();
      if (typeof renderPagesTab === 'function') renderPagesTab();
    });
    actions.appendChild(bNew);

    // Open saved file.
    const bOpen = document.createElement('button');
    bOpen.className = 'file-landing__btn';
    bOpen.textContent = 'Open saved file…';
    bOpen.addEventListener('click', () => {
      if (typeof importProject === 'function') importProject();
    });
    actions.appendChild(bOpen);

    // Import PDF — multi-file-workspace Phase 3. Opens the file picker (js/83).
    // Guarded on window.pdfImportPick so a missing PDF layer degrades to a no-op
    // (the button stays clickable but inert) rather than throwing.
    const bPdf = document.createElement('button');
    bPdf.className = 'file-landing__btn';
    bPdf.title = 'Import a PDF as a new file (one page per PDF page)';
    bPdf.textContent = 'Import PDF';
    bPdf.addEventListener('click', () => {
      if (typeof window.pdfImportPick === 'function') window.pdfImportPick();
    });
    actions.appendChild(bPdf);

    card.appendChild(actions);
    el.appendChild(card);
    host.appendChild(el);
    landingEl = el;
    return el;
  }

  // Show the landing iff the active file has zero pages.
  function refreshLanding() {
    const el = ensureLanding();
    if (!el) return;
    let pages = 0;
    if (typeof workspaceActiveFile === 'function') {
      const f = workspaceActiveFile();
      pages = (f && Array.isArray(f.sheets)) ? f.sheets.length : 0;
    } else if (typeof project !== 'undefined' && project && Array.isArray(project.sheets)) {
      pages = project.sheets.length;
    }
    el.style.display = (pages === 0) ? 'flex' : 'none';
  }

  // ---- Auto-refresh hook ----
  // Wrap renderPagesTab so the landing overlay also re-evaluates whenever the
  // active file's page list changes through the rail (add/delete/switch),
  // mirroring how 74 wraps V1 render functions to stay in sync without editing
  // every callsite.
  function installHooks() {
    if (typeof window.renderPagesTab === 'function') {
      const orig = window.renderPagesTab;
      window.renderPagesTab = function (...a) {
        const r = orig.apply(this, a);
        try { refreshLanding(); } catch (_) {}
        return r;
      };
    }
  }

  // ---- Bottom-ribbon page navigator (‹ N / total ›) ----
  // A compact prev / label / next control in the status bar: click ‹ to go back a
  // page and › to go forward; the label shows current/total. Mirrors Shift+scroll.
  // Reads the active file's pages via the live `project` (repointed at the active
  // file). updatePageNav() is published on window and called from renderPagesTab
  // (js/74), which fires on every page/file change.
  function updatePageNav() {
    const label = document.getElementById('pageNavLabel');
    if (!label) return;
    const prev = document.getElementById('pageNavPrev');
    const next = document.getElementById('pageNavNext');
    let n = 0, idx = 0;
    if (typeof project !== 'undefined' && project && Array.isArray(project.sheets)) {
      n = project.sheets.length;
      idx = project.activeSheetIdx || 0;
    }
    label.textContent = n ? ((idx + 1) + ' / ' + n) : '0 / 0';
    if (prev) prev.disabled = (idx <= 0);
    if (next) next.disabled = (idx >= n - 1);
  }
  function pageNavStep(dir) {
    if (typeof project === 'undefined' || !project || !Array.isArray(project.sheets)) return;
    const n = project.sheets.length;
    const cur = project.activeSheetIdx || 0;
    const target = Math.max(0, Math.min(n - 1, cur + dir));
    if (target !== cur && typeof projectSwitchSheet === 'function') projectSwitchSheet(target);
    updatePageNav();
  }
  function bindPageNav() {
    const prev = document.getElementById('pageNavPrev');
    const next = document.getElementById('pageNavNext');
    if (prev) prev.addEventListener('click', () => pageNavStep(-1));
    if (next) next.addEventListener('click', () => pageNavStep(1));
    updatePageNav();
  }

  // ---- Init ----
  function init() {
    bindAddButton();
    bindPageNav();
    installHooks();
    ensureLanding();
    try { renderFileTabs(); } catch (_) {}
  }

  // Publish the one cross-module hook (workspace ops in 04-workspace.js call
  // renderFileTabs() guarded by typeof, so this must be a global).
  window.renderFileTabs = renderFileTabs;
  // Bottom-ribbon page navigator updater — called by renderPagesTab (js/74) on
  // every page/file change so the ‹ N / total › label + arrow-disabled states
  // stay in sync without each callsite knowing about it.
  window.updatePageNav = updatePageNav;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }
})();
