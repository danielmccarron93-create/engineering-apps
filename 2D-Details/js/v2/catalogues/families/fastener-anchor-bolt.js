/**
 * StructDraw v2 · Catalogue Layer · families · Anchor Bolt
 * LAYER: catalogue — the `anchor-bolt` family. Pure data; self-registers.
 * READS:  window.v2.families
 * WRITES: window.v2.families.AnchorBoltFamily (+ registry entry 'anchor-bolt')
 *
 * Classic <script>, no build step. Cast-in / chemical / mechanical anchors.
 * v1 has no anchor catalogue (the v1 baseplate wizard hard-codes M24); the
 * rows below are v2-native data covering the common AS 5216 anchor range.
 * See 04-catalogue-system.md §3.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});

  const AnchorBoltFamily = {
    id: 'anchor-bolt',
    category: 'fastener',
    label: 'Anchor Bolt',
    sourceStandard: 'AS 5216-2021',
    paramSchema: {
      d:          { type: 'number', label: 'Bolt diameter',     unit: 'mm' },
      embedment:  { type: 'number', label: 'Embedment depth',   unit: 'mm' },
      anchorType: { type: 'enum',   label: 'Anchor type',
                    values: ['cast-in', 'chemical', 'mechanical'] },
    },
    types: [
      { id: 'AB-M12-cast-in',   d: 12, embedment: 300, anchorType: 'cast-in' },
      { id: 'AB-M16-cast-in',   d: 16, embedment: 300, anchorType: 'cast-in' },
      { id: 'AB-M20-cast-in',   d: 20, embedment: 375, anchorType: 'cast-in' },
      { id: 'AB-M24-cast-in',   d: 24, embedment: 450, anchorType: 'cast-in' },
      { id: 'AB-M30-cast-in',   d: 30, embedment: 525, anchorType: 'cast-in' },
      { id: 'AB-M16-chemical',  d: 16, embedment: 125, anchorType: 'chemical' },
      { id: 'AB-M20-chemical',  d: 20, embedment: 170, anchorType: 'chemical' },
      { id: 'AB-M24-chemical',  d: 24, embedment: 210, anchorType: 'chemical' },
      { id: 'AB-M12-mechanical', d: 12, embedment: 70, anchorType: 'mechanical' },
      { id: 'AB-M16-mechanical', d: 16, embedment: 85, anchorType: 'mechanical' },
    ],
    defaultMaterial: 'bolt-as1252-grade-8.8',
    rendererKey: 'fastener:anchor-bolt',
  };

  v2.families.register(AnchorBoltFamily);
  v2.families.AnchorBoltFamily = AnchorBoltFamily;
})();
