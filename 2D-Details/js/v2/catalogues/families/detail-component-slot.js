/**
 * StructDraw v2 · Catalogue Layer · families · Bolt Slot / Hole
 * LAYER: catalogue — the `slot` family. Pure data; self-registers.
 * READS:  window.v2.families
 * WRITES: window.v2.families.SlotFamily (+ registry entry 'slot')
 *
 * Classic <script>, no build step. A detail-component family — slotted and
 * oversize bolt holes. See 04-catalogue-system.md §3.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});

  const SlotFamily = {
    id: 'slot',
    category: 'detail-component',
    label: 'Bolt Slot / Hole',
    sourceStandard: 'AS 4100-2020 Cl 14.3.5.2',
    paramSchema: {
      width:  { type: 'number', label: 'Slot width',  unit: 'mm' },
      length: { type: 'number', label: 'Slot length', unit: 'mm' },
    },
    types: [
      { id: 'short-slot',   label: 'Short slotted hole' },
      { id: 'long-slot',    label: 'Long slotted hole' },
      { id: 'oversize-hole', label: 'Oversize hole' },
    ],
    defaultMaterial: null,
    rendererKey: 'detail-component:slot',
  };

  v2.families.register(SlotFamily);
  v2.families.SlotFamily = SlotFamily;
})();
