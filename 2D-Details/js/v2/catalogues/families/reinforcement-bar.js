/**
 * StructDraw v2 · Catalogue Layer · families · Reinforcement Bar
 * LAYER: catalogue — the `bar` family. Pure data; self-registers on load.
 * READS:  window.v2.families
 * WRITES: window.v2.families.ReinforcementBarFamily (+ registry entry 'bar')
 *
 * Classic <script>, no build step. Deformed reinforcing bar N12–N36. v1 has no
 * rebar catalogue; the rows below are v2-native data (AS/NZS 4671 nominal
 * cross-sectional areas). See 04-catalogue-system.md §3.
 */
'use strict';
(function () {
  const v2 = (window.v2 = window.v2 || {});

  const ReinforcementBarFamily = {
    id: 'bar',
    category: 'reinforcement',
    label: 'Reinforcement Bar',
    sourceStandard: 'AS/NZS 4671:2019',
    paramSchema: {
      d:    { type: 'number', label: 'Nominal diameter',     unit: 'mm' },
      area: { type: 'number', label: 'Cross-sectional area', unit: 'mm²' },
    },
    types: [
      { id: 'N12', d: 12, area: 110 },
      { id: 'N16', d: 16, area: 200 },
      { id: 'N20', d: 20, area: 310 },
      { id: 'N24', d: 24, area: 450 },
      { id: 'N28', d: 28, area: 620 },
      { id: 'N32', d: 32, area: 800 },
      { id: 'N36', d: 36, area: 1020 },
    ],
    defaultMaterial: 'reinforcement-n500',
    rendererKey: 'reinforcement:bar',
  };

  v2.families.register(ReinforcementBarFamily);
  v2.families.ReinforcementBarFamily = ReinforcementBarFamily;
})();
