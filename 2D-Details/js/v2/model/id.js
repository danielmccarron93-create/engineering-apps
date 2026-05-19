/**
 * StructDraw v2 · Model Layer · identity
 * LAYER: model — opaque, unique-within-a-document identifiers.
 * READS:  crypto (Web Crypto — browser global / Node global; optional)
 * WRITES: window.v2.model.{newId, newElementId, newViewId, newSheetId, isId}
 *
 * Classic <script>, no build step. Pure functions — no DOM, no canvas.
 * ElementIds / ViewIds / SheetIds are UUID v4 (open question Q7, locked 2026-05-19).
 * See 03-model-layer.md §1.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});
  v2.model = v2.model || {};

  /**
   * Mint a UUID v4 string. Prefers crypto.randomUUID() (modern browsers including
   * file:// secure contexts, and Node 18+). Falls back to crypto.getRandomValues(),
   * then to Math.random(), so the function is total — it never throws.
   * @returns {string} a canonical lowercase UUID v4
   */
  function uuidv4() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    const bytes = new Uint8Array(16);
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
    const hex = [];
    for (let i = 0; i < 16; i++) hex.push(bytes[i].toString(16).padStart(2, '0'));
    return (
      hex.slice(0, 4).join('') + '-' +
      hex.slice(4, 6).join('') + '-' +
      hex.slice(6, 8).join('') + '-' +
      hex.slice(8, 10).join('') + '-' +
      hex.slice(10, 16).join('')
    );
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  /**
   * True if the value looks like a minted id (canonical UUID string).
   * @param {*} value
   * @returns {boolean}
   */
  function isId(value) {
    return typeof value === 'string' && UUID_RE.test(value);
  }

  v2.model.newId        = uuidv4;
  v2.model.newElementId = uuidv4;
  v2.model.newViewId    = uuidv4;
  v2.model.newSheetId   = uuidv4;
  v2.model.isId         = isId;
})();
