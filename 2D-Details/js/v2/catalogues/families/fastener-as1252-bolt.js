/**
 * StructDraw v2 · Catalogue Layer · families · AS 1252 Structural Bolt
 * LAYER: catalogue — the `as1252-bolt` family. Pure data; self-registers.
 * READS:  window.v2.families; v1 global BOLT_DB
 * WRITES: window.v2.families.As1252BoltFamily (+ registry entry 'as1252-bolt')
 *
 * Classic <script>, no build step. Imports the v1 BOLT_DB assembly-dimension
 * catalogue (04 §11). The grade (4.6 / 8.8 / 10.9) is an instance-level param,
 * not a catalogue row — see `grades` and the bolt materials.
 * See 04-catalogue-system.md §3.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});

  const BOLT_SRC = (typeof BOLT_DB !== 'undefined') ? BOLT_DB : {};

  const As1252BoltFamily = {
    id: 'as1252-bolt',
    category: 'fastener',
    label: 'AS 1252 Structural Bolt',
    sourceStandard: 'AS/NZS 1252.1-2016',
    paramSchema: {
      d:       { type: 'number', label: 'Shank diameter',    unit: 'mm' },
      pitch:   { type: 'number', label: 'Thread pitch',      unit: 'mm' },
      headAF:  { type: 'number', label: 'Head across-flats', unit: 'mm' },
      headH:   { type: 'number', label: 'Head height',       unit: 'mm' },
      nutAF:   { type: 'number', label: 'Nut across-flats',  unit: 'mm' },
      nutH:    { type: 'number', label: 'Nut height',        unit: 'mm' },
      washOD:  { type: 'number', label: 'Washer OD',         unit: 'mm' },
      washT:   { type: 'number', label: 'Washer thickness',  unit: 'mm' },
      minorD:  { type: 'number', label: 'Thread minor dia',  unit: 'mm' },
      threadL: { type: 'number', label: 'Thread length',     unit: 'mm' },
    },
    types: Object.keys(BOLT_SRC).map(function (k) {
      const r = BOLT_SRC[k];
      return {
        id: k, d: r.d, pitch: r.pitch, headAF: r.headAF, headH: r.headH,
        nutAF: r.nutAF, nutH: r.nutH, washOD: r.washOD, washT: r.washT,
        minorD: r.minorD, threadL: r.threadL,
      };
    }),
    grades: ['4.6', '8.8', '10.9'],
    defaultMaterial: 'bolt-as1252-grade-8.8',
    rendererKey: 'fastener:as1252-bolt',
  };

  v2.families.register(As1252BoltFamily);
  v2.families.As1252BoltFamily = As1252BoltFamily;
})();
