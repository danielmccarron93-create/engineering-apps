/**
 * StructDraw v2 · Catalogue Layer · families · Rothoblaas HBS Plate screw
 * LAYER: catalogue — the `rothoblaas-hbs` family. Pure data; self-registers.
 * READS:  window.v2.families; v1 global HBS_PLATE_SCREWS
 * WRITES: window.v2.families.RothoblaasHbsFamily (+ registry entry 'rothoblaas-hbs')
 *
 * Classic <script>, no build step. Imports the v1 HBS_PLATE_SCREWS catalogue
 * (04 §11). The v1 product code (e.g. 'HBSPL12200') is kept verbatim as the
 * type id so the rule layer (rules/eta-11-0030/) and the Phase 0e migrator can
 * key into it directly. 04 §3's `HBS-12x200` ids were illustrative — the real
 * v1 keys are authoritative. See 04-catalogue-system.md §3.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});

  const SCREW_SRC = (typeof HBS_PLATE_SCREWS !== 'undefined') ? HBS_PLATE_SCREWS : {};

  const RothoblaasHbsFamily = {
    id: 'rothoblaas-hbs',
    category: 'fastener',
    label: 'Rothoblaas HBS Plate (steel-to-timber)',
    sourceStandard: 'ETA-11/0030 (2019-09-24)',
    paramSchema: {
      d:          { type: 'number', label: 'Nominal diameter', unit: 'mm' },
      L:          { type: 'number', label: 'Total length',     unit: 'mm' },
      b:          { type: 'number', label: 'Threaded length',  unit: 'mm' },
      dK:         { type: 'number', label: 'Head diameter',    unit: 'mm' },
      d2:         { type: 'number', label: 'Thread root dia',  unit: 'mm' },
      dS:         { type: 'number', label: 'Shank diameter',   unit: 'mm' },
      t1:         { type: 'number', label: 'Head thickness',   unit: 'mm' },
      bit:        { type: 'string', label: 'Installation bit' },
      torque_rec: { type: 'number', label: 'Install torque',   unit: 'Nm' },
      ftens_k:    { type: 'number', label: 'Char. tensile strength', unit: 'kN' },
      My_k:       { type: 'number', label: 'Char. yield moment',     unit: 'Nm' },
    },
    types: Object.keys(SCREW_SRC).map(function (k) {
      const r = SCREW_SRC[k];
      return {
        id: k, d: r.d, L: r.L, b: r.b, dK: r.dK, d2: r.d2, dS: r.dS,
        t1: r.t1, bit: r.bit, torque_rec: r.torque_rec,
        ftens_k: r.ftens_k, My_k: r.My_k,
      };
    }),
    defaultMaterial: 'screw-galv-grade-c1022',
    rendererKey: 'fastener:rothoblaas-hbs',
  };

  v2.families.register(RothoblaasHbsFamily);
  v2.families.RothoblaasHbsFamily = RothoblaasHbsFamily;
})();
