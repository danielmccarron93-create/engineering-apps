/**
 * StructDraw v2 · Catalogue Layer · families · Title Block
 * LAYER: catalogue — the `titleblock` family. Pure data; self-registers.
 * READS:  window.v2.families
 * WRITES: window.v2.families.TitleblockFamily (+ registry entry 'titleblock')
 *
 * Classic <script>, no build step. A sheet-component family. Per-customer
 * branding (Bligh Tanner / ACOR / Generic) is parameterised in Phase 9
 * (open question Q15) — for now the office-standard variants are catalogue
 * rows. See 04-catalogue-system.md §3.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});

  const TitleblockFamily = {
    id: 'titleblock',
    category: 'sheet-component',
    label: 'Title Block',
    sourceStandard: 'AS 1100.101-1992 §5',
    paramSchema: {
      sheetSize: { type: 'enum', label: 'Sheet size',
                   values: ['A1', 'A2', 'A3', 'A4'] },
    },
    types: [
      { id: 'bligh-tanner-a1', label: 'Bligh Tanner — A1' },
      { id: 'bligh-tanner-a3', label: 'Bligh Tanner — A3' },
      { id: 'generic-a1',      label: 'Generic — A1' },
    ],
    defaultMaterial: null,
    rendererKey: 'sheet-component:titleblock',
  };

  v2.families.register(TitleblockFamily);
  v2.families.TitleblockFamily = TitleblockFamily;
})();
