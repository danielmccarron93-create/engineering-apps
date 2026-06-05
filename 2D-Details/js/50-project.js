'use strict';

// V19.5 multi-sheet project save / load
// Extracted from dev/index.html lines 13958-14014 (2026-05-02 modular split)

// PROJECT SAVE / LOAD (V19.5)
// ============================================================
// A project save is just the full `project` object (after snapshotting the
// live globals) serialised to JSON. Extension: .sdproj. Backwards-compatible
// with single-sheet saves via the legacy shape check.

// multi-file-workspace Phase 3 — keep `.sdproj` a SINGLE self-contained JSON file
// even when a file carries imported PDF bytes. A `file.pdfBlobs` map holds the
// raw PDF bytes as Uint8Array (one per imported PDF); JSON can't represent a
// typed array, so each blob is serialised as { "_b64": <base64 string> } on
// export and decoded back to a Uint8Array on load. The two helpers below are the
// only place the base64<->bytes conversion lives.
function _b64FromBytes(u8) {
  // Chunked String.fromCharCode + btoa. Chunking avoids a call-stack overflow on
  // multi-MB PDFs (one giant apply() can blow the argument limit).
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < u8.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}
function _bytesFromB64(b64) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

// Build a JSON-safe shallow copy of a file's `pdfBlobs` map, each Uint8Array
// (or ArrayBuffer) replaced by { "_b64": ... }. Returns a plain object (possibly
// empty). Null/absent input -> {}.
function _encodePdfBlobs(pdfBlobs) {
  const out = {};
  if (!pdfBlobs || typeof pdfBlobs !== 'object') return out;
  for (const k of Object.keys(pdfBlobs)) {
    let v = pdfBlobs[k];
    if (v == null) continue;
    if (v instanceof ArrayBuffer) v = new Uint8Array(v);
    if (v instanceof Uint8Array) out[k] = { _b64: _b64FromBytes(v) };
    // Anything already shaped { _b64 } (re-export of a not-yet-decoded load)
    // rides through untouched.
    else if (v && typeof v === 'object' && typeof v._b64 === 'string') out[k] = { _b64: v._b64 };
  }
  return out;
}

// Walk a just-loaded project object and decode any { "_b64": ... } pdfBlob entry
// back into a live Uint8Array, in place. Safe to call on a project with no PDFs.
// Guards each entry so a malformed blob is skipped rather than thrown.
function _decodePdfBlobsInProject(projObj) {
  if (!projObj || !projObj.pdfBlobs || typeof projObj.pdfBlobs !== 'object') return;
  const map = projObj.pdfBlobs;
  for (const k of Object.keys(map)) {
    const v = map[k];
    if (v instanceof Uint8Array) continue;              // already decoded
    if (v && typeof v === 'object' && typeof v._b64 === 'string') {
      try { map[k] = _bytesFromB64(v._b64); }
      catch (e) { console.warn('[project] could not decode embedded PDF blob "' + k + '"', e); delete map[k]; }
    }
  }
}

function exportProject() {
  // V23.1 — don't snapshot ghost previews into a project file.
  if (connWizState) connWizCancel();
  _projectSnapshotActive();
  // multi-file-workspace Phase 3 — serialise the active file with its PDF bytes
  // embedded as base64 so the `.sdproj` is self-contained. Shallow-clone `project`
  // and swap ONLY `pdfBlobs` for the base64-encoded form; every other field
  // (sheets, activeSheetIdx, per-page size/bg, file metadata) rides through
  // unchanged. A native file with no imported PDF yields an empty {} — identical
  // on disk to before this feature.
  const projOut = Object.assign({}, project, { pdfBlobs: _encodePdfBlobs(project && project.pdfBlobs) });
  const payload = {
    format: 'structdraw-project',
    version: 1,
    savedAt: new Date().toISOString(),
    project: projOut,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const fname = `${sheetInfo.project || 'project'}.sdproj`
    .replace(/[^a-z0-9._-]/gi, '_');
  a.href = url; a.download = fname;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  // multi-file-workspace Phase 2 — a successful `.sdproj` save clears the active
  // file's DISK-dirty flag (the per-file dot tracks unsaved-to-disk changes, NOT
  // the always-current IndexedDB session). Refresh the tabs so the dot clears.
  // Guarded so the legacy single-project path (no workspace layer) is unaffected.
  if (typeof workspaceActiveFile === 'function') {
    const _f = workspaceActiveFile();
    if (_f) _f.dirty = false;
  }
  if (typeof renderFileTabs === 'function') renderFileTabs();
}

function importProject() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.sdproj,.json';
  input.addEventListener('change', (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (data.format !== 'structdraw-project' || !data.project || !Array.isArray(data.project.sheets)) {
          alert('File is not a valid StructDraw project (.sdproj).');
          return;
        }
        // multi-file-workspace Phase 3 — decode any embedded PDF bytes ({ "_b64" })
        // back into live Uint8Array on the loaded project BEFORE it is adopted as a
        // file, so file.pdfBlobs holds real byte buffers (what the PDF renderer and
        // the IndexedDB session both expect). No-op for native saves with no PDF.
        _decodePdfBlobsInProject(data.project);
        // multi-file-workspace — open the loaded .sdproj as a NEW file (a new
        // top-bar tab) instead of clobbering the file the user is working on.
        // Falls back to the legacy in-place replace if the workspace layer
        // isn't loaded.
        const _openName =
          (data.project.sheets[0] && data.project.sheets[0].sheetInfo && data.project.sheets[0].sheetInfo.project)
            ? data.project.sheets[0].sheetInfo.project
            : (file && file.name ? file.name.replace(/\.(sdproj|json)$/i, '') : 'Opened file');
        if (typeof workspaceOpenFile === 'function') {
          workspaceOpenFile(data.project, _openName);
        } else {
          project = data.project;
          if (project.activeSheetIdx < 0 || project.activeSheetIdx >= project.sheets.length) {
            project.activeSheetIdx = 0;
          }
          _projectLoadSheet(project.activeSheetIdx);
        }
        renderSheetBrowser();
        // architecture-v2 Phase 0e — close the Phase-0d async-load gap. After
        // the active sheet is loaded into v1 globals, re-migrate the live v1
        // state into the v2 shadow model (`v2.appState.model`). Guarded —
        // the lookup is a no-op if the v2 layer isn't loaded.
        if (window.v2 && v2.io && v2.io.load &&
            typeof v2.io.load.afterV1Load === 'function') {
          v2.io.load.afterV1Load('importProject');
        }
      } catch (e) {
        console.error(e);
        alert('Could not load project: ' + e.message);
      }
    };
    reader.readAsText(file);
  });
  input.click();
}

