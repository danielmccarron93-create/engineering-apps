'use strict';

// ============================================================
// WORKSPACE MODEL (multi-file-workspace, 2026-06-04)
// ============================================================
// LAYER: band 1 (config/data/state/coords) — shared.
//   READS:  project, sheetInfo, _projectMakeSheet, _projectSnapshotActive,
//           _projectLoadSheet, projectInit, projectAddSheet, migratePage,
//           connWizState, connWizCancel  (all resolved at CALL time — this file
//           loads BEFORE 05-state.js, which is fine: nothing here runs at load).
//   WRITES: workspace (declared here), project (repointed at the active file).
//
// A "workspace" holds several open FILES at once (browser-style file tabs). A
// FILE is exactly the existing `project` shape (sheets[], activeSheetIdx,
// _nextSheetId) plus file-level metadata. The live global `project` becomes a
// pointer at the ACTIVE file: switching files snapshots the live globals back
// into the old file, repoints `project`, and loads the new file's active page.
// Because `project` is a top-level `let` in 05-state.js, reassigning it here
// transparently re-targets ALL existing per-page machinery (render loop, events,
// Pages rail) with zero edits elsewhere.
//
// `project` STAYS declared in 05-state.js. This file only repoints it.

let workspace = { files: [], activeFileIdx: 0, _nextFileId: 1 };

// The active file object (the one `project` currently points at).
function workspaceActiveFile() {
  return workspace.files[workspace.activeFileIdx];
}

// Build a fresh project-shaped FILE object carrying the file-level metadata. No
// pages are added here — callers decide whether to seed a page. `kind` is a
// cosmetic origin hint ('native' | 'pdf' | 'mixed').
function _workspaceMakeFile(name, kind) {
  return {
    id: workspace._nextFileId++,
    name: name || 'Untitled',
    kind: kind || 'native',
    // --- existing project fields ---
    sheets: [],
    activeSheetIdx: 0,
    _nextSheetId: 1,
    // --- file-level fields ---
    pdfBlobs: {},
    _nextPdfId: 1,
    dirty: false,
    diskName: null,
  };
}

// Switch the active file. Snapshots live globals into the current file, repoints
// the `project` global, then loads the target file's active page. Cheap because
// it reuses the existing snapshot/restore machinery wholesale.
function workspaceSwitchFile(idx) {
  if (idx === workspace.activeFileIdx) return;
  // Don't carry an open connection wizard across files (matches projectSwitchSheet).
  if (typeof connWizState !== 'undefined' && connWizState
      && typeof connWizCancel === 'function') connWizCancel();
  _projectSnapshotActive();
  workspace.activeFileIdx = idx;
  project = workspace.files[idx];
  _projectLoadSheet(project.activeSheetIdx);
  if (typeof renderFileTabs === 'function') renderFileTabs();
  if (typeof renderPagesTab === 'function') renderPagesTab();
  // Persist the new active-file pointer (no disk-dirty: switching isn't an edit).
  if (typeof markSessionDirty === 'function') markSessionDirty();
}

// Add a brand-new file and switch to it. opts.seedPage (default true): when
// true, the file gets one native A1 page (via projectAddSheet, after repoint);
// when false the file stays page-less -> the empty-file landing shows. Returns
// the new file.
function workspaceAddFile(name, kind, opts) {
  opts = opts || {};
  const seedPage = (opts.seedPage !== false);
  // Snapshot the outgoing file before we repoint away from it.
  _projectSnapshotActive();
  const f = _workspaceMakeFile(name, kind);
  workspace.files.push(f);
  workspace.activeFileIdx = workspace.files.length - 1;
  project = f;
  if (seedPage) {
    // projectAddSheet snapshots+makes+pushes+loads. project already has no
    // pages, so this seeds sheets[0] and loads it. Use the same path the rail
    // "add page" button uses so a seeded page is identical to a hand-added one.
    if (typeof projectAddSheet === 'function') {
      projectAddSheet('Page 1');
    } else {
      f.sheets.push(_projectMakeSheet('Page 1'));
      _projectLoadSheet(0);
    }
  } else {
    // Page-less file -> landing. Nothing to load; just refresh the chrome.
    if (typeof renderFileTabs === 'function') renderFileTabs();
    if (typeof renderPagesTab === 'function') renderPagesTab();
  }
  // Persist the new file into the session (no disk-dirty — disk-dirty is set
  // only by content edits, cleared by exportProject).
  if (typeof markSessionDirty === 'function') markSessionDirty();
  return f;
}

// Adopt an already-parsed .sdproj project object as a NEW file (does NOT clobber
// the current file). Stamps any missing file-level metadata, migrates each page,
// pushes, repoints, loads. Returns the new file.
function workspaceOpenFile(projectObj, name) {
  if (!projectObj) return null;
  // Stamp the file-level metadata onto the adopted project object if absent.
  if (projectObj.id == null) projectObj.id = workspace._nextFileId++;
  if (projectObj.name == null) projectObj.name = name || 'Untitled';
  else if (name) projectObj.name = name;
  if (projectObj.kind == null) projectObj.kind = 'native';
  if (projectObj.pdfBlobs == null) projectObj.pdfBlobs = {};
  if (projectObj._nextPdfId == null) projectObj._nextPdfId = 1;
  if (projectObj.dirty == null) projectObj.dirty = false;
  if (projectObj.diskName == null) projectObj.diskName = null;
  if (!Array.isArray(projectObj.sheets)) projectObj.sheets = [];
  if (projectObj.activeSheetIdx == null) projectObj.activeSheetIdx = 0;
  if (projectObj._nextSheetId == null) {
    projectObj._nextSheetId = projectObj.sheets.length + 1;
  }
  // Backfill per-page fields on every adopted page (old saves lack them).
  if (typeof migratePage === 'function') projectObj.sheets.forEach(migratePage);
  // Snapshot the outgoing file before repointing away.
  _projectSnapshotActive();
  workspace.files.push(projectObj);
  workspace.activeFileIdx = workspace.files.length - 1;
  project = projectObj;
  if (project.sheets.length) {
    const idx = Math.min(project.activeSheetIdx || 0, project.sheets.length - 1);
    _projectLoadSheet(idx);
  } else {
    if (typeof renderFileTabs === 'function') renderFileTabs();
    if (typeof renderPagesTab === 'function') renderPagesTab();
  }
  if (typeof renderFileTabs === 'function') renderFileTabs();
  // Persist the newly-opened file into the session.
  if (typeof markSessionDirty === 'function') markSessionDirty();
  return project;
}

// Close a file. Confirms if the file has unsaved disk changes. Never allows zero
// files: closing the last one opens a fresh empty file in its place. Repoints to
// a valid neighbour and loads it.
function workspaceCloseFile(idx) {
  const f = workspace.files[idx];
  if (!f) return;
  if (f.dirty) {
    const label = f.name || 'this file';
    if (!confirm(`"${label}" has unsaved changes. Close it anyway?`)) return;
  }
  // Closing the last remaining file -> replace it with a fresh empty one so the
  // workspace is never empty (landing shows).
  if (workspace.files.length <= 1) {
    workspace.files.splice(idx, 1);
    workspace.activeFileIdx = 0;
    workspaceAddFile('Untitled', 'native', { seedPage: false });
    return;
  }
  const wasActive = (idx === workspace.activeFileIdx);
  workspace.files.splice(idx, 1);
  // Repoint to a valid neighbour. If we removed a file before the active one,
  // the active index shifts down by one.
  let newActive = workspace.activeFileIdx;
  if (wasActive) {
    newActive = Math.min(idx, workspace.files.length - 1);
  } else if (idx < workspace.activeFileIdx) {
    newActive = workspace.activeFileIdx - 1;
  }
  workspace.activeFileIdx = newActive;
  project = workspace.files[newActive];
  if (project.sheets.length) {
    const pIdx = Math.min(project.activeSheetIdx || 0, project.sheets.length - 1);
    _projectLoadSheet(pIdx);
  }
  if (typeof renderFileTabs === 'function') renderFileTabs();
  if (typeof renderPagesTab === 'function') renderPagesTab();
  // Persist the closure (the file list shrank). The last-file branch above
  // returns through workspaceAddFile, which persists on its own.
  if (typeof markSessionDirty === 'function') markSessionDirty();
}

// Rename a file (the label on its top tab).
function workspaceRenameFile(idx, name) {
  const f = workspace.files[idx];
  if (!f) return;
  f.name = name;
  if (typeof renderFileTabs === 'function') renderFileTabs();
  // Persist the new name (no disk-dirty: a rename isn't a content edit).
  if (typeof markSessionDirty === 'function') markSessionDirty();
}

// Initialise the workspace at boot. Idempotent. Seeds files[0] from the EXISTING
// global `project` (which projectInit() populates with sheets[0] exactly as
// today) so a clean launch is identical to before multi-file. Session restore
// (IndexedDB) lands in a later phase and will run ahead of this seed.
function workspaceInit() {
  if (workspace.files.length) return;
  // projectInit() seeds project.sheets[0] from the current default globals.
  if (typeof projectInit === 'function') projectInit();
  // Adopt the existing global `project` as file[0]. Stamp the file-level
  // metadata onto it in place (project STAYS the same object; we just enrich it).
  if (project.id == null) project.id = workspace._nextFileId++;
  if (project.name == null) {
    project.name = (typeof sheetInfo !== 'undefined' && sheetInfo && sheetInfo.project)
      ? sheetInfo.project : 'Untitled';
  }
  if (project.kind == null) project.kind = 'native';
  if (project.pdfBlobs == null) project.pdfBlobs = {};
  if (project._nextPdfId == null) project._nextPdfId = 1;
  if (project.dirty == null) project.dirty = false;
  if (project.diskName == null) project.diskName = null;
  workspace.files = [project];
  workspace.activeFileIdx = 0;
  if (typeof renderFileTabs === 'function') renderFileTabs();

  // multi-file-workspace Phase 2 — IndexedDB session restore. The synchronous
  // seed above ALWAYS runs first, so the app has a usable file[0] immediately
  // and boot is never blocked. THEN, asynchronously, try to restore the last
  // session: open the DB, read the saved workspace, and if one was present
  // (files.length>0) it replaces the seed in place and repoints `project`.
  // sessionRestore() suspends saves around itself, so the _projectLoadSheet it
  // fires can't loop back into a save. Guarded so a missing 84-session-store.js
  // (or an unavailable IndexedDB) degrades to "seed only" with no error.
  if (typeof sessionInit === 'function' && typeof sessionRestore === 'function') {
    sessionInit().then(function () {
      return sessionRestore();
    }).then(function (restored) {
      if (restored) {
        // The restored workspace replaced the seed — refresh all chrome so the
        // top tabs and the Pages rail reflect the restored files/pages.
        if (typeof renderFileTabs === 'function') renderFileTabs();
        if (typeof renderPagesTab === 'function') renderPagesTab();
        // Re-fit the viewport to the RESTORED active page. The synchronous
        // fitToView() in 73-init ran against the seed A1; if the restored page is
        // a different size (e.g. an imported A3/A4 PDF page) the seed fit is stale
        // and the page would open off-centre/wrongly-zoomed until the user pans.
        // Guarded so a missing layout layer degrades to the (stale) seed fit.
        if (typeof fitToView === 'function') fitToView();
      }
    }).catch(function (e) {
      // Never let a session failure break boot — the seed is already live.
      if (typeof console !== 'undefined') console.warn('[session] init/restore chain failed; using seed.', e);
    });
  }
}

// multi-file-workspace Phase 2 — single guarded helper called from the content
// mutation points (addObj/delObj/addEnt2D/undo/redo in 05-state.js). Marks the
// ACTIVE file disk-dirty (drives the top-tab dot) AND persists the session
// (debounced). Kept here (not in 05) so the mutation fns only need a one-line
// guarded call and all the workspace/session coupling lives in one file.
function workspaceTouchActive() {
  const f = (typeof workspaceActiveFile === 'function') ? workspaceActiveFile() : null;
  if (f) f.dirty = true;
  if (typeof renderFileTabs === 'function') renderFileTabs();
  if (typeof markSessionDirty === 'function') markSessionDirty();
  // multi-file-workspace polish — the active page's content just changed, so its
  // cached Pages-rail thumbnail is stale. Invalidate it (by stable page id) so the
  // next renderPagesTab regenerates a fresh preview. Guarded so a missing
  // js/85-page-thumbnails.js (or a no-page file) is a no-op. NOTE: this only drops
  // the cache entry; it does NOT eagerly re-render — the rail re-requests lazily.
  if (typeof window !== 'undefined' && typeof window.pageThumbInvalidate === 'function'
      && f && Array.isArray(f.sheets)) {
    const p = f.sheets[f.activeSheetIdx];
    // Pass the owning file id so the invalidation is scoped to THIS file's page —
    // page.id is only file-local (every file's _nextSheetId starts at 1), so an
    // id-only invalidation would also drop a same-id page in every other open file.
    if (p && p.id != null) window.pageThumbInvalidate(p.id, f.id);
  }
}
