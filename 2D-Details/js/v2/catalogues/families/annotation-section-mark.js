/**
 * StructDraw v2 · Catalogue Layer · families · Section Mark
 * LAYER: catalogue — the `section-mark` family. Pure data; self-registers.
 * READS:  window.v2.families
 * WRITES: window.v2.families.SectionMarkFamily (+ registry entry 'section-mark')
 *
 * Classic <script>, no build step. An annotation family — section cuts,
 * detail bubbles and elevation marks. See 04-catalogue-system.md §3.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});

  const SectionMarkFamily = {
    id: 'section-mark',
    category: 'annotation',
    label: 'Section Mark',
    sourceStandard: 'AS 1100.101-1992',
    paramSchema: {
      radius:     { type: 'number', label: 'Bubble radius', unit: 'mm' },
      textHeight: { type: 'number', label: 'Text height',   unit: 'mm' },
    },
    types: [
      { id: 'section-cut',    label: 'Section cut' },
      { id: 'detail-bubble',  label: 'Detail bubble' },
      { id: 'elevation-mark', label: 'Elevation mark' },
    ],
    defaultMaterial: null,
    rendererKey: 'annotation:section-mark',
  };

  v2.families.register(SectionMarkFamily);
  v2.families.SectionMarkFamily = SectionMarkFamily;
})();
