/**
 * StructDraw v2 · Catalogue Layer · families · Leader
 * LAYER: catalogue — the `leader` family. Pure data; self-registers.
 * READS:  window.v2.families
 * WRITES: window.v2.families.LeaderFamily (+ registry entry 'leader')
 *
 * Classic <script>, no build step. An annotation family.
 * See 04-catalogue-system.md §3.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});

  const LeaderFamily = {
    id: 'leader',
    category: 'annotation',
    label: 'Leader',
    sourceStandard: 'AS 1100.101-1992',
    paramSchema: {
      textHeight: { type: 'number', label: 'Text height', unit: 'mm' },
      arrowStyle: { type: 'enum',   label: 'Arrow style',
                    values: ['closed', 'open', 'tick', 'dot', 'none'] },
    },
    types: [
      { id: 'straight',      label: 'Straight' },
      { id: 'curved',        label: 'Curved' },
      { id: 'multi-segment', label: 'Multi-segment' },
    ],
    defaultMaterial: null,
    rendererKey: 'annotation:leader',
  };

  v2.families.register(LeaderFamily);
  v2.families.LeaderFamily = LeaderFamily;
})();
