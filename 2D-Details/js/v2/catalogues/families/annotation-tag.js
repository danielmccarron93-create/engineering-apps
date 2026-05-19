/**
 * StructDraw v2 · Catalogue Layer · families · Tag
 * LAYER: catalogue — the `tag` family. Pure data; self-registers.
 * READS:  window.v2.families
 * WRITES: window.v2.families.TagFamily (+ registry entry 'tag')
 *
 * Classic <script>, no build step. An annotation family — member / plate /
 * bolt callout tags. See 04-catalogue-system.md §3.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});

  const TagFamily = {
    id: 'tag',
    category: 'annotation',
    label: 'Tag',
    sourceStandard: 'AS 1100.101-1992',
    paramSchema: {
      textHeight: { type: 'number', label: 'Text height', unit: 'mm' },
      shape:      { type: 'enum',   label: 'Tag shape',
                    values: ['none', 'circle', 'box', 'hexagon'] },
    },
    types: [
      { id: 'beam-tag',    label: 'Beam tag' },
      { id: 'column-tag',  label: 'Column tag' },
      { id: 'plate-tag',   label: 'Plate tag' },
      { id: 'bolt-tag',    label: 'Bolt tag' },
      { id: 'generic-tag', label: 'Generic tag' },
    ],
    defaultMaterial: null,
    rendererKey: 'annotation:tag',
  };

  v2.families.register(TagFamily);
  v2.families.TagFamily = TagFamily;
})();
