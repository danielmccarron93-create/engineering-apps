/**
 * StructDraw v2 · Catalogue Layer · families · Revision
 * LAYER: catalogue — the `revision` family. Pure data; self-registers.
 * READS:  window.v2.families
 * WRITES: window.v2.families.RevisionFamily (+ registry entry 'revision')
 *
 * Classic <script>, no build step. An annotation family — revision clouds and
 * revision markers. See 04-catalogue-system.md §3.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});

  const RevisionFamily = {
    id: 'revision',
    category: 'annotation',
    label: 'Revision',
    sourceStandard: 'AS 1100.101-1992',
    paramSchema: {
      textHeight: { type: 'number', label: 'Text height', unit: 'mm' },
    },
    types: [
      { id: 'revision-cloud',    label: 'Revision cloud' },
      { id: 'revision-triangle', label: 'Revision triangle' },
      { id: 'revision-tag',      label: 'Revision tag' },
    ],
    defaultMaterial: null,
    rendererKey: 'annotation:revision',
  };

  v2.families.register(RevisionFamily);
  v2.families.RevisionFamily = RevisionFamily;
})();
