'use strict';

// ============================================================
// SESSION STORE — multi-file-workspace IndexedDB autosave + restore
// (multi-file-workspace Phase 2, 2026-06-05) — self-contained module
// ============================================================
// LAYER: band 9-adjacent (workspace persistence) — shared.
//   READS:  workspace, project, _projectSnapshotActive, _projectLoadSheet,
//           migratePage, renderFileTabs (all resolved at CALL time).
//   WRITES: the IndexedDB DB 'structdraw' (store 'workspace', key 'current');
//           on restore, mutates `workspace.files` / `workspace.activeFileIdx` /
//           `workspace._nextFileId` and repoints `project`. Exposes
//           window.markSessionDirty so mutation points elsewhere can persist.
//
// WHY IndexedDB (not localStorage): imported PDFs live as Uint8Array byte
// buffers in file.pdfBlobs and are MBs each. IndexedDB stores binary natively
// via STRUCTURED CLONE — we put the workspace record object directly (never
// JSON.stringify it), so Uint8Array pdfBlobs survive a relaunch intact. A
// localStorage string store would force base64 (1.33x bloat + a parse step).
//
// The IndexedDB session is ALWAYS-CURRENT crash-safety (auto-restored on boot).
// It is distinct from the per-file `dirty` flag, which tracks unsaved changes
// to a manual `.sdproj` on DISK (set on mutate, cleared on exportProject).
//
// Defensive posture matches the v2-layer / pdf.js guards: every IndexedDB call
// is wrapped so a missing/blocked/quota-exceeded DB logs and degrades to
// "session disabled" — the app keeps drawing and manual `.sdproj` save/load
// still works. Nothing here ever throws into the app or blocks the render loop.
// ============================================================

(function sessionStore() {

  const DB_NAME = 'structdraw';
  const DB_VERSION = 1;
  const STORE = 'workspace';
  const RECORD_KEY = 'current';
  const SAVE_DEBOUNCE_MS = 800;

  // The opened IDBDatabase handle (set by sessionInit). null while closed or if
  // IndexedDB is unavailable — every consumer guards on it.
  let _db = null;
  // True once sessionInit has settled (success OR failure) so we never re-open.
  let _initDone = false;
  let _initPromise = null;

  // While true, ALL saves are skipped. Set around sessionRestore so loading a
  // record back into the live model (which fires _projectLoadSheet etc.) can't
  // re-trigger a save and create a restore→save→restore loop.
  let _sessionSuspend = false;

  // Trailing-edge debounce timer handle for markSessionDirty → sessionSave.
  let _saveTimer = null;

  // ---- DB open / upgrade ----
  // Returns a promise that resolves (to the db, or null on failure) once the DB
  // is ready. Idempotent: subsequent calls return the same settled promise.
  function sessionInit() {
    if (_initPromise) return _initPromise;
    _initPromise = new Promise((resolve) => {
      let idb = null;
      try {
        idb = (typeof indexedDB !== 'undefined') ? indexedDB : null;
      } catch (_) { idb = null; }
      if (!idb) {
        _initDone = true;
        resolve(null);
        return;
      }
      let req;
      try {
        req = idb.open(DB_NAME, DB_VERSION);
      } catch (e) {
        console.warn('[session] indexedDB.open failed; session disabled.', e);
        _initDone = true;
        resolve(null);
        return;
      }
      req.onupgradeneeded = function () {
        try {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            db.createObjectStore(STORE);
          }
        } catch (e) {
          console.warn('[session] upgrade failed.', e);
        }
      };
      req.onsuccess = function () {
        _db = req.result;
        _initDone = true;
        // If the connection is later closed/versioned out, drop it so we stop
        // trying to use a dead handle (saves just no-op from then on).
        if (_db) _db.onclose = function () { _db = null; };
        resolve(_db);
      };
      req.onerror = function () {
        console.warn('[session] indexedDB open error; session disabled.', req.error);
        _initDone = true;
        resolve(null);
      };
      req.onblocked = function () {
        // Another tab holds an older version open. Don't hang; degrade.
        console.warn('[session] indexedDB open blocked; session disabled.');
        _initDone = true;
        resolve(null);
      };
    });
    return _initPromise;
  }

  // ---- Save ----
  // Snapshot live globals into the active file FIRST, then store the minimal
  // workspace record via structured clone (the object itself, NOT JSON). Never
  // throws. Skipped while suspended or before a workspace exists.
  function sessionSave() {
    if (_sessionSuspend) return;
    if (!_db) return;
    if (typeof workspace === 'undefined' || !workspace || !Array.isArray(workspace.files)) return;
    if (!workspace.files.length) return;
    // Flush the live globals (current page) back into the active file so what we
    // persist is up to date — exactly the same flush exportProject() does.
    try {
      if (typeof _projectSnapshotActive === 'function') _projectSnapshotActive();
    } catch (e) {
      // A snapshot failure shouldn't kill the save of the rest of the workspace.
      console.warn('[session] snapshot before save failed.', e);
    }
    // Store ONLY the structural fields. pdfBlobs (Uint8Array) ride along inside
    // workspace.files and survive structured clone natively — do NOT base64 them
    // here (that's only needed for the JSON `.sdproj` on disk).
    const record = {
      files: workspace.files,
      activeFileIdx: workspace.activeFileIdx,
      _nextFileId: workspace._nextFileId,
    };
    let tx;
    try {
      tx = _db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      // put(value, key) — structured clone of the object graph (binary intact).
      store.put(record, RECORD_KEY);
      tx.onerror = function () {
        // Most likely QuotaExceededError on a big PDF. Log, keep drawing.
        console.warn('[session] save transaction error (quota?).', tx.error);
      };
      tx.onabort = function () {
        console.warn('[session] save transaction aborted.', tx.error);
      };
    } catch (e) {
      // DataCloneError (something un-cloneable slipped into the model) or the
      // handle died between the guard and here. Never propagate.
      console.warn('[session] sessionSave failed; continuing.', e);
    }
  }

  // ---- Dirty signal (debounced fan-in) ----
  // Called from every content mutation + workspace op. Coalesces a burst of
  // edits into a single trailing-edge save. Exposed on window so mutation
  // points in other files can persist without importing this module.
  function markSessionDirty() {
    if (_sessionSuspend) return;
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(function () {
      _saveTimer = null;
      try { sessionSave(); } catch (e) { console.warn('[session] debounced save failed.', e); }
    }, SAVE_DEBOUNCE_MS);
  }

  // ---- Read the stored record ----
  function _readRecord() {
    return new Promise((resolve) => {
      if (!_db) { resolve(null); return; }
      let req;
      try {
        const tx = _db.transaction(STORE, 'readonly');
        req = tx.objectStore(STORE).get(RECORD_KEY);
      } catch (e) {
        console.warn('[session] read transaction failed.', e);
        resolve(null);
        return;
      }
      req.onsuccess = function () { resolve(req.result || null); };
      req.onerror = function () {
        console.warn('[session] read error.', req.error);
        resolve(null);
      };
    });
  }

  // ---- Restore ----
  // async. Returns true iff a non-empty saved workspace was loaded into the live
  // model. Wraps the whole load in _sessionSuspend so the _projectLoadSheet it
  // fires can't re-trigger a save (no restore→save loop). Returns false on any
  // error or empty record, leaving the existing seed in place.
  function sessionRestore() {
    _sessionSuspend = true;
    // Cancel any debounced save already queued before restore began (e.g. the
    // boot-time default-scene edits in 73-init.js mark the seed dirty *before*
    // workspaceInit() runs). Without this, that timer could fire after restore
    // lifts the suspend and persist a now-stale seed over the restored record.
    if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
    return _readRecord().then((rec) => {
      if (!rec || !Array.isArray(rec.files) || rec.files.length === 0) {
        return false;
      }
      // Adopt the restored files. migratePage every page of every file so an
      // older record (saved before later per-page fields existed) is backfilled
      // before anything reads it.
      const files = rec.files;
      if (typeof migratePage === 'function') {
        files.forEach((f) => {
          if (f && Array.isArray(f.sheets)) f.sheets.forEach(migratePage);
        });
      }
      workspace.files = files;
      // Clamp the active index into range.
      let active = (typeof rec.activeFileIdx === 'number') ? rec.activeFileIdx : 0;
      if (active < 0) active = 0;
      if (active > files.length - 1) active = files.length - 1;
      workspace.activeFileIdx = active;
      // _nextFileId must clear every restored id so freshly-added files don't
      // collide with a restored one.
      let maxId = 0;
      files.forEach((f) => {
        if (f && typeof f.id === 'number' && f.id > maxId) maxId = f.id;
      });
      workspace._nextFileId = maxId + 1;
      // Repoint the live `project` at the restored active file and load its
      // active page into the globals (this drives the whole render pipeline).
      project = files[active];
      if (typeof _projectLoadSheet === 'function' && project && Array.isArray(project.sheets) && project.sheets.length) {
        let pIdx = (typeof project.activeSheetIdx === 'number') ? project.activeSheetIdx : 0;
        if (pIdx < 0) pIdx = 0;
        if (pIdx > project.sheets.length - 1) pIdx = project.sheets.length - 1;
        _projectLoadSheet(pIdx);
      }
      return true;
    }).catch((e) => {
      console.warn('[session] restore failed; keeping seed.', e);
      return false;
    }).then((ok) => {
      // ALWAYS lift the suspend, success or failure, so live edits persist again.
      _sessionSuspend = false;
      return ok;
    });
  }

  // Publish the cross-module hooks. markSessionDirty is called (guarded by
  // typeof) from 04-workspace.js + the 05-state.js mutation points; the other
  // entry points are used by workspaceInit's async restore.
  window.markSessionDirty = markSessionDirty;
  window.sessionInit = sessionInit;
  window.sessionRestore = sessionRestore;
  window.sessionSave = sessionSave;

})();
