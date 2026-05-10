'use strict';

// Paste + paste-in-place
// Extracted from dev/index.html lines 13173-13191 (2026-05-02 modular split)

// PASTE
// ============================================================

function pasteObjects() {
  if (!clipboardObjs || !clipboardObjs.length) return;
  const offset = 30;
  const pasted = [];
  clipboardObjs.forEach(orig => {
    const o = JSON.parse(JSON.stringify(orig));
    o.id = objIdN++;
    o.x = (o.x || 0) + offset;
    o.y = (o.y || 0) + offset;
    addObj(o);
    pasted.push(objects3D[objects3D.length - 1]);
  });
  selected3D = pasted;
  requestRender();
}

