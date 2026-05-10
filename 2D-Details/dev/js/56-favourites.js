'use strict';

// V21 favourites strip
// Extracted from dev/index.html lines 14384-14513 (2026-05-02 modular split)

// V21 FAVOURITES STRIP
// ============================================================
// Tracks last-used tiles + user-pinned ones in localStorage. Appears at
// the top of the palette regardless of mode — a bolt stays useful whether
// you're in Model, Draw, or Annotate.

const FAV_MAX_RECENT = 6;
let _favRecent = [];   // array of { tileId, label, icon, sub }
let _favPinned = [];

function _favStorageLoad() {
  try {
    const raw = localStorage.getItem('structdraw_favourites');
    if (!raw) return;
    const j = JSON.parse(raw);
    if (Array.isArray(j.recent)) _favRecent = j.recent;
    if (Array.isArray(j.pinned)) _favPinned = j.pinned;
  } catch (e) {}
}
function _favStorageSave() {
  try {
    localStorage.setItem('structdraw_favourites', JSON.stringify({
      recent: _favRecent, pinned: _favPinned,
    }));
  } catch (e) {}
}

function rememberFavouriteTile(spec) {
  // Build a stable id based on tile + size
  const sub = spec.sub || '';
  const entry = { tileId: spec.id, label: spec.label, icon: spec.icon, sub };
  _favRecent = _favRecent.filter(e => !(e.tileId === entry.tileId && e.sub === entry.sub));
  _favRecent.unshift(entry);
  if (_favRecent.length > FAV_MAX_RECENT) _favRecent.length = FAV_MAX_RECENT;
  _favStorageSave();
  renderFavourites();
}

function rememberFavourite(payload) {
  // Called from selectMemberBySection / selectMemberByBolt helpers before
  // spec is captured. Build a synthetic spec.
  if (payload.type === 'member') {
    const iconMap = { ub: 'icon-ub', uc: 'icon-uc', shs: 'icon-shs' };
    rememberFavouriteTile({
      id: payload.memberType,
      label: payload.memberType.toUpperCase(),
      icon: iconMap[payload.memberType] || 'icon-ub',
      sub: payload.section,
    });
  } else if (payload.type === 'bolt') {
    rememberFavouriteTile({ id: 'bolt', label: 'Bolt', icon: 'icon-bolt', sub: payload.size });
  }
}

function renderFavourites() {
  const host = document.getElementById('favouritesList');
  const wrap = document.getElementById('paletteFavourites');
  if (!host || !wrap) return;
  const all = [..._favPinned, ..._favRecent.filter(r => !_favPinned.some(p => p.tileId === r.tileId && p.sub === r.sub))].slice(0, FAV_MAX_RECENT);
  if (all.length === 0) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';
  host.innerHTML = '';
  for (const entry of all) {
    const isPinned = _favPinned.some(p => p.tileId === entry.tileId && p.sub === entry.sub);
    const t = document.createElement('div');
    t.className = 'fav-tile' + (isPinned ? ' pinned' : '');
    t.title = (entry.sub ? `${entry.label} — ${entry.sub}` : entry.label) + ' (right-click for options)';
    t.innerHTML = `<svg class="icon"><use href="#${entry.icon}"/></svg>
                   <div class="fav-tile__label">${entry.sub || entry.label}</div>`;
    t.addEventListener('click', () => _favReplay(entry));
    t.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      _favToggleMenu(e, entry);
    });
    host.appendChild(t);
  }
}

function _favReplay(entry) {
  // Re-dispatch the action based on the tileId.
  if (entry.tileId === 'ub' || entry.tileId === 'uc' || entry.tileId === 'shs') {
    if (entry.sub) selectMemberBySection(entry.tileId, entry.sub);
    return;
  }
  if (entry.tileId === 'bolt') {
    if (entry.sub) selectMemberByBolt(entry.sub);
    return;
  }
  // Fallback — find the tile in current palette and fake-click it.
  const t = document.querySelector(`.tile[data-tile-id="${entry.tileId}"]`);
  if (t) t.click();
}

function _favToggleMenu(ev, entry) {
  // Simple context: pin / unpin / remove
  const menu = document.createElement('div');
  menu.className = 'menu open';
  menu.style.left = ev.clientX + 'px';
  menu.style.top = ev.clientY + 'px';
  const pinned = _favPinned.some(p => p.tileId === entry.tileId && p.sub === entry.sub);
  menu.innerHTML = `
    <div class="menu-item" data-a="${pinned ? 'unpin' : 'pin'}">
      <span>${pinned ? 'Unpin' : 'Pin to favourites'}</span>
    </div>
    <div class="menu-item" data-a="remove"><span>Remove</span></div>
  `;
  document.body.appendChild(menu);
  const close = () => { menu.remove(); document.removeEventListener('click', onOut, true); };
  const onOut = (e) => { if (!menu.contains(e.target)) close(); };
  setTimeout(() => document.addEventListener('click', onOut, true), 0);
  menu.addEventListener('click', (e) => {
    const it = e.target.closest('.menu-item'); if (!it) return;
    const a = it.dataset.a;
    if (a === 'pin') {
      _favPinned.push(entry);
    } else if (a === 'unpin') {
      _favPinned = _favPinned.filter(p => !(p.tileId === entry.tileId && p.sub === entry.sub));
    } else if (a === 'remove') {
      _favRecent = _favRecent.filter(p => !(p.tileId === entry.tileId && p.sub === entry.sub));
      _favPinned = _favPinned.filter(p => !(p.tileId === entry.tileId && p.sub === entry.sub));
    }
    _favStorageSave();
    close();
    renderFavourites();
  });
}

// Load persisted favourites on first parse
_favStorageLoad();

