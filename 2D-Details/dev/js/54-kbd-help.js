'use strict';

// V20 keyboard help
// Extracted from dev/index.html lines 14308-14316 (2026-05-02 modular split)

// KEYBOARD HELP (V20)
// ============================================================
function toggleKbdHelp() {
  const p = document.getElementById('kbdHelp');
  if (!p) return;
  const open = p.style.display !== 'none';
  p.style.display = open ? 'none' : 'flex';
}

