'use strict';

// V19.5 sheet browser sidebar
// Extracted from dev/index.html lines 13901-13956 (2026-05-02 modular split)

// SHEET BROWSER (V19.5)
// ============================================================
// Renders the Sheets section in the left sidebar. Called on init and after
// every project mutation (add/delete/rename/switch).
// V21 — Chrome-style top-bar tabs (replaces the old sidebar sheet browser).
// Each tab shows drawing number + name; × deletes; double-click renames;
// body click switches.
function renderSheetBrowser() {
  const host = document.getElementById('sheetList');
  if (!host) return;
  host.innerHTML = '';
  for (let i = 0; i < project.sheets.length; i++) {
    const s = project.sheets[i];
    const active = (i === project.activeSheetIdx);
    const tab = document.createElement('div');
    tab.className = 'sheet-tab' + (active ? ' active' : '');
    tab.title = `${s.sheetInfo?.drawingNo || ''} — ${s.name || `Sheet ${i+1}`}`;

    const dno = (s.sheetInfo && s.sheetInfo.drawingNo) ? s.sheetInfo.drawingNo : '';
    if (dno) {
      const d = document.createElement('span');
      d.className = 'sheet-tab__dno';
      d.textContent = dno;
      tab.appendChild(d);
    }
    const name = document.createElement('span');
    name.className = 'sheet-tab__title';
    name.textContent = s.name || `Sheet ${i+1}`;
    tab.appendChild(name);

    const close = document.createElement('span');
    close.className = 'sheet-tab__close';
    close.innerHTML = '<svg class="icon icon-sm"><use href="#icon-close"/></svg>';
    close.title = 'Delete sheet';
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      projectDeleteSheet(i);
    });
    tab.appendChild(close);

    // Click tab body = switch; double-click name = rename inline
    tab.addEventListener('click', () => projectSwitchSheet(i));
    tab.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const n = prompt('Sheet name:', s.name);
      if (n) projectRenameSheet(i, n);
    });
    host.appendChild(tab);
  }
}

function wireSheetBrowser() {
  // V21 — wiring now lives in initToolbar so it can bind alongside the
  // hamburger menu dispatcher. Kept as a no-op for anywhere still calling it.
}

