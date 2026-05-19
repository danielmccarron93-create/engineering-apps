/**
 * StructDraw v2 · Catalogue Layer · families · Flat Plate
 * LAYER: catalogue — the `plate-flat` family. Pure data; self-registers.
 * READS:  window.v2.families
 * WRITES: window.v2.families.PlateFlatFamily (+ registry entry 'plate-flat')
 *
 * Classic <script>, no build step. A flat steel plate of arbitrary polygon
 * outline; the `type` selects the standard thickness. v1 has no plate-thickness
 * catalogue, so the PL list below is v2-native data (AS/NZS 3678 plate).
 * See 04-catalogue-system.md §3.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});

  const PlateFlatFamily = {
    id: 'plate-flat',
    category: 'plate',
    label: 'Flat Plate',
    sourceStandard: 'AS/NZS 3678-2016',
    paramSchema: {
      thickness: { type: 'number', label: 'Plate thickness', unit: 'mm', min: 3 },
    },
    types: [
      { id: 'PL6',  thickness: 6 },
      { id: 'PL8',  thickness: 8 },
      { id: 'PL10', thickness: 10 },
      { id: 'PL12', thickness: 12 },
      { id: 'PL16', thickness: 16 },
      { id: 'PL20', thickness: 20 },
      { id: 'PL25', thickness: 25 },
      { id: 'PL32', thickness: 32 },
    ],
    defaultMaterial: 'steel-s300',
    rendererKey: 'plate:flat',
  };

  v2.families.register(PlateFlatFamily);
  v2.families.PlateFlatFamily = PlateFlatFamily;
})();
