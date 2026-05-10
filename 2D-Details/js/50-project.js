'use strict';

// V19.5 multi-sheet project save / load
// Extracted from dev/index.html lines 13958-14014 (2026-05-02 modular split)

// PROJECT SAVE / LOAD (V19.5)
// ============================================================
// A project save is just the full `project` object (after snapshotting the
// live globals) serialised to JSON. Extension: .sdproj. Backwards-compatible
// with single-sheet saves via the legacy shape check.
function exportProject() {
  // V23.1 — don't snapshot ghost previews into a project file.
  if (connWizState) connWizCancel();
  _projectSnapshotActive();
  const payload = {
    format: 'structdraw-project',
    version: 1,
    savedAt: new Date().toISOString(),
    project: project,
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
        project = data.project;
        if (project.activeSheetIdx < 0 || project.activeSheetIdx >= project.sheets.length) {
          project.activeSheetIdx = 0;
        }
        _projectLoadSheet(project.activeSheetIdx);
        renderSheetBrowser();
      } catch (e) {
        console.error(e);
        alert('Could not load project: ' + e.message);
      }
    };
    reader.readAsText(file);
  });
  input.click();
}

