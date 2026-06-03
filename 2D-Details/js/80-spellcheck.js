'use strict';

// LAYER: 80–89 reserved (future shared modules). Spell-check ENGINE (no DOM).
//   READS  (globals): Typo (lib/typo.js), window.SD_SPELL_TERMS (js/02f),
//                     spellEnabled (js/07-globals.js) — all typeof-guarded.
//   WRITES (globals): spellEnsureLoaded, spellReady, spellTokenise, spellScan,
//                     spellCheckWord, spellSuggest, spellShouldCheck,
//                     spellAddUserWord, spellAddEngWord, spellIgnoreWord,
//                     spellIsEnabled, spellSetEnabled, spellOnLoaded,
//                     spellUserWords  (all are global function declarations).
//   Module-private state lives in `let _sp*` (house style, cf. _nbLayoutCache).
//
// A jargon-aware spell-checker for note text — the Bluebeam/Revit-grade engine
// behind the live red squiggle + right-click fix (js/81). It pairs the vendored
// Typo.js Hunspell checker (lib/typo.js) + bundled en-AU dictionary
// (dict/en_AU.*) with the engineering allow-list (js/02f) so REAL prose typos
// get flagged while structural shorthand (M20, SHS, U.N.O.) and proprietary
// product names (Bondek, Reidbar, Hebel, Hilti …) never do.
//
// Design: PlannedBuilds/notebox-spellcheck/02-design.md. No DOM here — this is
// pure + headlessly testable; js/81 owns all UI.

// ------------------------------------------------------------------
// Module state
// ------------------------------------------------------------------
let _spDict = null;       // Typo instance once loaded (null until lazy-load resolves)
let _spLoading = null;    // in-flight load Promise (so the dict loads exactly once)
let _spAllow = null;      // Set<string> lower-cased static allow-list (terms+abbrev)
let _spUser = null;       // Set<string> "Add to dictionary" (localStorage)
let _spEng = null;        // Set<string> "Add to engineering dictionary" (localStorage)
let _spIgnore = new Set(); // session-only "Ignore" words
const _spLoadedCbs = [];  // callbacks fired once the dict finishes loading

const _SP_LS_ENABLED = 'sd2.spellEnabled';
const _SP_LS_USER = 'sd2.spellUserDict';
const _SP_LS_ENG = 'sd2.spellEngTerms';

// Belt-and-braces fallback if js/02f failed to load — the engine still silences
// the worst offenders rather than red-squiggling every abbreviation.
const _SP_FALLBACK_ALLOW = [
  'galv', 'galvanised', 'weldmesh', 'purlin', 'nogging', 'packer', 'ferrule',
  'grout', 'shim', 'cogged', 'chamfer', 'fillet', 'gusset', 'cleat', 'haunch',
  'corbel', 'soffit', 'starter', 'dowel', 'stiffener', 'bondek', 'reidbar',
  'hebel', 'hilti', 'ramset', 'reo', 'uno', 'typ', 'crs', 'ffl', 'hdg',
];

// ------------------------------------------------------------------
// Enabled flag (on by default; persisted to localStorage)
// ------------------------------------------------------------------
function spellIsEnabled() {
  if (typeof spellEnabled !== 'undefined') return !!spellEnabled;
  return true;
}

function spellSetEnabled(on) {
  on = !!on;
  if (typeof spellEnabled !== 'undefined') { try { spellEnabled = on; } catch (_e) { /* */ } }
  try { if (window.localStorage) window.localStorage.setItem(_SP_LS_ENABLED, on ? '1' : '0'); } catch (_e) { /* */ }
  return on;
}

function _spLoadEnabledPref() {
  try {
    const raw = window.localStorage && window.localStorage.getItem(_SP_LS_ENABLED);
    if (raw === null || raw === undefined) return;               // never set → keep default (on)
    const on = !(raw === '0' || raw === 'false');
    if (typeof spellEnabled !== 'undefined') { try { spellEnabled = on; } catch (_e) { /* */ } }
  } catch (_e) { /* localStorage unavailable → default on */ }
}

// ------------------------------------------------------------------
// Allow-list + user/eng/ignore sets
// ------------------------------------------------------------------
function _spArrFromLS(key) {
  try {
    const raw = window.localStorage && window.localStorage.getItem(key);
    if (!raw) return [];
    const a = JSON.parse(raw);
    return Array.isArray(a) ? a : [];
  } catch (_e) { return []; }
}
function _spSaveSet(key, set) {
  try { if (window.localStorage) window.localStorage.setItem(key, JSON.stringify(Array.from(set))); } catch (_e) { /* */ }
}

function _spBuildAllow() {
  if (_spAllow) return _spAllow;
  const s = new Set();
  const T = (typeof window !== 'undefined' && window.SD_SPELL_TERMS) ? window.SD_SPELL_TERMS : null;
  const allow = (T && Array.isArray(T.allow)) ? T.allow : _SP_FALLBACK_ALLOW;
  const abbrev = (T && Array.isArray(T.abbrev)) ? T.abbrev : [];
  for (let i = 0; i < allow.length; i++) { const w = ('' + allow[i]).toLowerCase().trim(); if (w) s.add(w); }
  for (let i = 0; i < abbrev.length; i++) { const w = ('' + abbrev[i]).toLowerCase().trim(); if (w) s.add(w); }
  _spAllow = s;
  return s;
}

function _spEnsureUserSets() {
  if (!_spUser) _spUser = new Set(_spArrFromLS(_SP_LS_USER).map(w => ('' + w).toLowerCase()));
  if (!_spEng) _spEng = new Set(_spArrFromLS(_SP_LS_ENG).map(w => ('' + w).toLowerCase()));
}

// Words the user has added (user + engineering). Exposed for tests/inspection.
function spellUserWords() {
  _spEnsureUserSets();
  return { user: Array.from(_spUser), eng: Array.from(_spEng), ignore: Array.from(_spIgnore) };
}

function spellAddUserWord(w) {
  _spEnsureUserSets();
  const lc = _spLetters(w).toLowerCase();
  if (lc.length >= 1) { _spUser.add(lc); _spSaveSet(_SP_LS_USER, _spUser); }
  return lc;
}
function spellAddEngWord(w) {
  _spEnsureUserSets();
  const lc = _spLetters(w).toLowerCase();
  if (lc.length >= 1) { _spEng.add(lc); _spSaveSet(_SP_LS_ENG, _spEng); }
  return lc;
}
function spellIgnoreWord(w) {
  const lc = _spLetters(w).toLowerCase();
  if (lc.length >= 1) _spIgnore.add(lc);
  return lc;
}

// ------------------------------------------------------------------
// Lazy dictionary load (Typo.js + en-AU Hunspell), memoised
// ------------------------------------------------------------------
function spellReady() { return _spDict !== null; }

// Register a callback fired once the dictionary is loaded (e.g. re-run the
// live overlay so squiggles appear the moment the dict arrives). Fires
// immediately if already loaded.
function spellOnLoaded(cb) {
  if (typeof cb !== 'function') return;
  if (_spDict) { try { cb(); } catch (_e) { /* */ } return; }
  _spLoadedCbs.push(cb);
}

function spellEnsureLoaded() {
  if (_spDict) return Promise.resolve(_spDict);
  if (_spLoading) return _spLoading;
  if (typeof Typo !== 'function') {
    // Checker not available — resolve to null; check() degrades to "ok".
    return Promise.resolve(null);
  }
  _spLoading = _spLoadDictData().then(function (data) {
    if (!data || !data.aff || !data.dic) return null;
    _spDict = new Typo('en_AU', data.aff, data.dic);
    const cbs = _spLoadedCbs.splice(0, _spLoadedCbs.length);
    for (let i = 0; i < cbs.length; i++) { try { cbs[i](); } catch (_e) { /* */ } }
    return _spDict;
  }).catch(function (err) {
    // Leave _spDict null (degrade to "never flag"); allow a later retry.
    _spLoading = null;
    if (typeof console !== 'undefined') console.warn('[spellcheck] dictionary load failed:', err && err.message);
    return null;
  });
  return _spLoading;
}

// Get the vendored aff/dic STRINGS. They ship as a JS file
// (dict/en_AU-dict.js → window.SD_SPELL_AFF / SD_SPELL_DIC) loaded via a <script>
// tag rather than fetch(), because Chrome blocks fetch()/XHR of local files on
// file:// — and StructDraw is designed to run by simply opening index.html.
// <script src> DOES work on file:// (it is how every js/*.js loads), so this
// path works whether the app is opened from disk or served over http. Lazy:
// the ~0.5 MB dictionary only loads when a note is first edited / a sweep runs.
function _spLoadDictData() {
  if (window.SD_SPELL_AFF && window.SD_SPELL_DIC) {
    return Promise.resolve({ aff: window.SD_SPELL_AFF, dic: window.SD_SPELL_DIC });
  }
  return _spInjectScript('dict/en_AU-dict.js').then(function () {
    return (window.SD_SPELL_AFF && window.SD_SPELL_DIC)
      ? { aff: window.SD_SPELL_AFF, dic: window.SD_SPELL_DIC } : null;
  });
}

// Inject a <script> once and resolve when it has finished loading. spellEnsureLoaded
// memoises via _spLoading, so this runs exactly once per session.
function _spInjectScript(src) {
  return new Promise(function (resolve, reject) {
    try {
      if (typeof document === 'undefined') { reject(new Error('no document')); return; }
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('load ' + src)); };
      (document.head || document.documentElement).appendChild(s);
    } catch (e) { reject(e); }
  });
}

// ------------------------------------------------------------------
// Tokeniser + checks
// ------------------------------------------------------------------
function _spLetters(w) { return ('' + (w || '')).replace(/[^A-Za-z]/g, ''); }

// spellTokenise(text) → [{word,start,end}] for every word-like run. A run is a
// maximal sequence of letters/digits/apostrophes, so "M20", "AS4100",
// "100x50x6" stay whole (and are later skipped by the digit rule). Indices are
// into `text` exactly as given (the UI passes the DISPLAY string so indices line
// up under the rendered glyphs).
function spellTokenise(text) {
  const out = [];
  const s = '' + (text || '');
  // A token starts with a letter (ASCII or accented Latin — but NOT the Latin-1
  // math symbols × U+00D7 / ÷ U+00F7) and continues with letters/digits. An
  // apostrophe is kept only when ANOTHER letter follows it, so "don't" stays
  // whole while a trailing possessive/quote ("STARTERS'", "'GROUT'") does not
  // glue the quote onto the word (which the dictionary would otherwise mis-flag).
  const L = 'A-Za-zÀ-ÖØ-öø-ÿĀ-ɏ';
  const re = new RegExp('[' + L + '](?:[' + L + '0-9]|[\'’](?=[' + L + ']))*', 'g');
  let m;
  while ((m = re.exec(s)) !== null) {
    out.push({ word: m[0], start: m.index, end: m.index + m[0].length });
  }
  return out;
}

// spellShouldCheck(word) → should this token be spell-checked at all?
// false = treated as correct (skipped). Mirrors the skip rules in 02-design.md.
function spellShouldCheck(word) {
  const w = '' + (word || '');
  const letters = _spLetters(w);
  if (letters.length < 2) return false;            // too short / punctuation
  if (/[0-9]/.test(w)) return false;               // digit-bearing designator (M20, N16-200)
  const lc = letters.toLowerCase();
  const allow = _spBuildAllow();
  _spEnsureUserSets();
  if (allow.has(lc) || _spUser.has(lc) || _spEng.has(lc) || _spIgnore.has(lc)) return false;
  if (w === w.toUpperCase() && letters.length <= 4) return false;   // short all-caps designator (UB, PFC, FFL)
  return true;
}

// _spDictOk(word) → is the word accepted by the dictionary? true when the dict
// is not yet loaded (so the editor is never blocked / never wrongly flags).
function _spDictOk(word) {
  if (!_spDict) return true;
  try {
    if (_spDict.check(word)) return true;
    const lc = word.toLowerCase();
    if (lc !== word && _spDict.check(lc)) return true;          // all-caps/Title of a valid word
    const cap = lc.charAt(0).toUpperCase() + lc.slice(1);
    if (cap !== word && _spDict.check(cap)) return true;
    return false;
  } catch (_e) { return true; }
}

// spellCheckWord(word) → true if correctly spelled / accepted (or skipped).
function spellCheckWord(word) {
  if (!spellShouldCheck(word)) return true;
  return _spDictOk(word);
}

// spellScan(text) → { bad: [{word,start,end}] } — the misspelled tokens with
// positions. Suggestions are computed lazily (spellSuggest) on demand.
function spellScan(text) {
  const bad = [];
  if (!spellIsEnabled()) return { bad: bad };
  const toks = spellTokenise(text);
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (spellShouldCheck(t.word) && !_spDictOk(t.word)) bad.push(t);
  }
  return { bad: bad };
}

// spellSuggest(word, limit) → recased suggestions matching the input's case.
function spellSuggest(word, limit) {
  limit = limit || 5;
  if (!_spDict) return [];
  let raw = [];
  try { raw = _spDict.suggest(('' + word).toLowerCase(), limit) || []; } catch (_e) { raw = []; }
  const w = '' + word;
  const letters = _spLetters(w);
  const allCaps = letters.length > 0 && w === w.toUpperCase();
  const titled = letters.length > 1 && w.charAt(0) === w.charAt(0).toUpperCase() && w.slice(1) === w.slice(1).toLowerCase();
  const seen = new Set();
  const out = [];
  for (let i = 0; i < raw.length && out.length < limit; i++) {
    let s = '' + raw[i];
    if (allCaps) s = s.toUpperCase();
    else if (titled) s = s.charAt(0).toUpperCase() + s.slice(1);
    if (!seen.has(s)) { seen.add(s); out.push(s); }
  }
  return out;
}

// ------------------------------------------------------------------
// Startup (guarded; no dictionary load — that is lazy on first need)
// ------------------------------------------------------------------
try { _spLoadEnabledPref(); } catch (_e) { /* */ }
try { _spBuildAllow(); } catch (_e) { /* */ }
try { _spEnsureUserSets(); } catch (_e) { /* */ }
