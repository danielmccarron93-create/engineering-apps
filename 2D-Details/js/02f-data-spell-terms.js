'use strict';

// LAYER: band-1 (shared data). Engineering spell-check term database.
//   WRITES (globals): window.SD_SPELL_TERMS  (read by js/80-spellcheck.js).
//
// The hand-editable "dictionary of correctly-spelled words" for Australian
// structural detailing — proprietary product / brand names and trade jargon a
// general en-AU dictionary does NOT contain, so the note spell-checker never
// red-squiggles them. Compiled 2026-06-01 by category research (anchors &
// fixings, reo & post-tensioning, composite decking & flooring, walling &
// cladding, timber connectors & engineered timber, grouts/sealants/passive-fire,
// and general trade vocabulary), then adversarially de-noised (fabricated or
// typo-masking entries dropped — e.g. "tilling" was rejected because it masks
// the real typo of "tiling"; "maxima" because it is an ordinary word).
//
// TO GROW THIS LIST: just add the lowercase token to `allow` (single words,
// a–z only — split multi-word/hyphenated brands into parts, e.g. "Klip-Lok" ->
// "klip","lok"). Anything with a digit (M20, N16, 310UB40.4) or a short all-caps
// designator (UB, SHS, FFL) is already skipped by the tokeniser — no entry
// needed. Engineers can also grow it live in-app via the right-click
// "Add to engineering dictionary" action (persisted to localStorage).
//
// Brands represented (provenance, not exhaustive): Hilti, Ramset, Reid/ReidBar,
// Powers, Allfasteners, Ancon/Leviat, Lenton, Macsim, Bremick, DeWalt, Würth,
// Mungo · InfraBuild/OneSteel, Griptec/Dextra, Macalloy, Dywidag, VSL,
// Freyssinet, ONEMESH, Bogar, AUSREO, Bestbar · Lysaght (Bondek/Trimdek/Custom
// Orb/Klip-Lok/Spandek/Longline), Stramit (Condeck/Monoclad), Fielders
// (KingFlor/SlimDek/Nailstrip/Shadowline), Stratco, BlueScope
// (Zincalume/Colorbond), Smorgon ARC, Westkon, ComFlor, Speedfloor, Ultrafloor,
// Transfloor, Hollowcore, Ultraspan, Hambro, Armourdeck · CSR Hebel
// (PowerPanel/PowerFloor), Dincel, AFS Rediwall/Logicwall, Speedpanel, Bondor
// (SolarSpan/InsulWall), Ritek, Versiclad, James Hardie Scyon
// (Linea/Axon/ExoTec/EasyLap/HardieFlex/Villaboard/Blueboard), Cemintel,
// Weathertex, BGC · Pryda, MiTek, Multinail, Simpson Strong-Tie, Rothoblaas,
// Lumberlok, Bowmac, SPAX, SFS Intec, Bostitch, Paslode, Buildex, Zenith,
// Raptor, Anzor, Tilling SmartLVL, Hyne, Wesbeam, Carter Holt Harvey Futurebuild
// (hySPAN/hyJOIST/hyCHORD), XLam CLT, Kerto · Sika (Sikaflex/SikaGrout/Sikadur),
// Fosroc (Conbextra/Nitomortar/Renderoc/Proofex/Dekguard), Parchem
// (Emer-Proof/Lanko/Vandex), Davco, BASF MasterFlow/MasterSeal, Nullifire,
// Promat (Promaseal/SupaWrap), Trafalgar (FyreFLEX/FyreWRAP), Denso, Tremco,
// Bostik, Ardex, Megapoxy/Epirez, Rondo/Knauf.

window.SD_SPELL_TERMS = {
  version: 'au-struct-2026-06-01',

  // Never-flag tokens (lowercase, alphabetic only). Checked case-insensitively.
  allow: [
    // — anchors, fixings & brands —
    'hilti', 'ramset', 'reid', 'powers', 'allfasteners', 'ancon', 'leviat',
    'macsim', 'bremick', 'dewalt', 'wurth', 'wuerth', 'mungo', 'dynabolt',
    'dynabolted', 'dyna', 'trubolt', 'tru', 'chemset', 'ankascrew', 'anka',
    'spatec', 'wercs', 'swiftlift', 'hangermate', 'masonbolt', 'brembolt',
    'kwik', 'hus', 'hst', 'hsl', 'hsa', 'hvu', 'throughbolt', 'tek', 'csk',
    'nyloc', 'jamnut', 'anzor', 'buildex', 'zenith', 'raptor', 'konnect',
    // — reo, mesh, couplers, post-tensioning —
    'infrabuild', 'onesteel', 'reidbar', 'bartec', 'lenton', 'griptec', 'dextra',
    'macalloy', 'dywidag', 'vsl', 'freyssinet', 'onemesh', 'bogar', 'ausreo',
    'bestbar', 'reo', 'decoiled', 'lockshear', 'trimesh', 'weldmesh',
    'posttensioned', 'proofload', 'ligature', 'ligatures', 'stirrup', 'stirrups',
    // — composite decking & suspended flooring —
    'bondek', 'condeck', 'kingflor', 'kingfloor', 'comflor', 'speedfloor',
    'ultrafloor', 'transfloor', 'hollowcore', 'ultraspan', 'hambro', 'armourdeck',
    'fastdeck', 'slimdek', 'slimflor', 'deckform', 'edgeform', 'powerdek',
    'reflor', 'flor', 'formply', 'formwork', 'unpropped', 'setdown', 'drummy',
    'birdsmouth', 'birdmouth', 'crossfall', 'reentrant', 'embossment', 'subfloor',
    'nogs', 'westkon', 'smorgon', 'bluescope', 'aluzinc',
    // — walling, cladding & lightweight systems —
    'hebel', 'powerpanel', 'powerfloor', 'powerfence', 'dincel', 'afs',
    'rediwall', 'logicwall', 'speedpanel', 'bondor', 'solarspan', 'insulwall',
    'colorbond', 'zincalume', 'trimdek', 'klip', 'lok', 'spandek', 'longline',
    'stramit', 'stratco', 'monoclad', 'monopanel', 'fielders', 'kingklip',
    'nailstrip', 'shadowline', 'ritek', 'versiclad', 'versipanel', 'scyon',
    'linea', 'axon', 'exotec', 'easylap', 'hardieflex', 'hardie', 'villaboard',
    'blueboard', 'cemintel', 'barestone', 'weathertex', 'bgc', 'fibro',
    'customorb', 'sarking', 'fascias',
    // — timber connectors, fasteners & engineered timber —
    'pryda', 'mitek', 'multinail', 'simpson', 'strongtie', 'rothoblaas',
    'lumberlok', 'bowmac', 'spax', 'sfs', 'bostitch', 'paslode', 'tilling',
    'smartlvl', 'hyne', 'wesbeam', 'ejoist', 'hyspan', 'hyjoist', 'hychord',
    'hyframe', 'hyplank', 'futurebuild', 'truform', 'lgl', 'lvl', 'glt', 'clt',
    'xlam', 'lamella', 'lamellas', 'glulam', 'kerto', 'meyspan', 'specbeam',
    'mgp', 'triplegrip', 'multigrip', 'multigrips', 'minigrip', 'minigrips',
    'unitie', 'unities', 'looptie', 'speedbrace', 'anchaplate', 'framelok',
    'cyclone', 'tiedown', 'locknail', 'nailplate', 'gangnail', 'torx', 'wirox',
    'powerlag', 'powerlags', 'assy', 'merbau', 'radiata', 'brushbox',
    'tallowwood', 'ironbark', 'blackbutt', 'blackwood', 'jarrah', 'cypress',
    'knauf', 'rondo',
    // — grouts, sealants, waterproofing, epoxies, passive fire —
    'sika', 'sikaflex', 'sikagrout', 'sikadur', 'fosroc', 'conbextra',
    'nitomortar', 'renderoc', 'nitobond', 'nitoseal', 'nitoprime', 'nitoflor',
    'nitoproof', 'proofex', 'dekguard', 'galvafroid', 'conplast', 'supercast',
    'sbr', 'parchem', 'lanko', 'duragrout', 'durabed', 'davco', 'masterflow',
    'masteremaco', 'masterseal', 'nullifire', 'promat', 'promaseal', 'grafitex',
    'supawrap', 'trafalgar', 'fyreflex', 'fyrewrap', 'ceasefire', 'intumescent',
    'firestop', 'denso', 'petrolatum', 'tremco', 'dymonic', 'bostik', 'ardex',
    'thixotropic', 'siloxane', 'silane', 'weatherseal', 'hydroseal', 'vandex',
    'nukote', 'megapoxy', 'epirez', 'duragal', 'supagal', 'galv', 'galvanised',
    'galvanising', 'galvanized', 'hdg',
    // — general structural / detailing trade vocabulary —
    'purlin', 'purlins', 'girt', 'girts', 'nogging', 'noggin', 'noggins',
    'noggings', 'packer', 'packers', 'ferrule', 'ferruled', 'ferrules', 'cogged',
    'cogging', 'cogwall', 'corewall', 'chamfered', 'filleted', 'castellated',
    'kicker', 'kickers', 'upstand', 'upstands', 'downstand', 'screeded',
    'shimmed', 'dowelled', 'capplate', 'baseplate', 'mullion', 'mullions',
    'cored', 'drilled', 'tabbed', 'kerfed', 'strutting', 'epoxied', 'toenail',
    'toenailed', 'skewnail', 'backgouge', 'interpass', 'fettle', 'fettled',
    'tremie', 'shotcrete', 'gunite', 'ferrocement', 'blockwork', 'brickwork',
    'greenstar', 'subfloor', 'weephole', 'weepholes', 'truss', 'trusses',
  ],

  // Standard AU drawing abbreviations (UPPERCASE for readability). Merged into
  // the allow-set case-insensitively by js/80. The tokeniser already silences
  // all-caps <=4 letters; the >=5-letter ones below are what truly need listing
  // (APPROX, REINF, HORIZ, SETOUT, DATUM, SCALE, HOLDING, TYPCL, …).
  abbrev: [
    'AGG', 'APPD', 'APPROX', 'AS', 'ASF', 'BCA', 'BM', 'BOF', 'BP', 'BPL', 'BTM',
    'CAP', 'CC', 'CEM', 'CFW', 'CHAM', 'CHFR', 'CHK', 'CHS', 'CJP', 'CL', 'CONC',
    'CRS', 'CTR', 'CTRS', 'CTS', 'CW', 'DATUM', 'DES', 'DET', 'DIA', 'DOWN',
    'DPC', 'DPM', 'DRG', 'DRN', 'DWG', 'EA', 'EF', 'EGL', 'EL', 'ELEV', 'EQ',
    'ER', 'EW', 'FALL', 'FAR', 'FE', 'FF', 'FFE', 'FFL', 'FGL', 'FP', 'FS', 'FW',
    'GA', 'GALV', 'GIRT', 'GL', 'GP', 'GRAD', 'HAND', 'HD', 'HDB', 'HDG',
    'HOLDING', 'HORIZ', 'INV', 'ISS', 'KN', 'KNM', 'KPA', 'LG', 'LH', 'LWC',
    'MAX', 'MIN', 'MM', 'MPA', 'NCC', 'NEAR', 'NF', 'NGL', 'NOM', 'NS', 'NTS',
    'NWC', 'OC', 'OPP', 'OPSL', 'OPSW', 'PC', 'PFC', 'PJP', 'PLN', 'PS', 'PT',
    'PURL', 'RAD', 'RC', 'REINF', 'REV', 'RH', 'RHS', 'RL', 'RWP', 'SCALE',
    'SECT', 'SETOUT', 'SHS', 'SHT', 'SIM', 'SL', 'SOG', 'SOP', 'SP', 'SSL', 'TB',
    'TBM', 'THK', 'TM', 'TOC', 'TOF', 'TOP', 'TOS', 'TYP', 'TYPCL', 'TYPE', 'UA',
    'UB', 'UC', 'UNO', 'UNS', 'VERT', 'WD', 'WP', 'WRF', 'WSP',
  ],
};
