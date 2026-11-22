// BLOCKMINE 3D: the rules of the brief, on top of the cutaway settings (cutaway/settings.js) for the mine's shapes and
// movement. Loaded by the page, the strategy simulator and the server, so all three play by the same numbers.
// Every number here is a first guess the simulator may retune, unless it is marked as the owner's.
(function (root) {
  const base = root.SETTINGS;
  const R = {
    // ---------- the shaft (the owner's: exactly 15 levels, the Vault at the bottom) ----------
    levels: 15,
    // which "tier" each level belongs to (levels 1-3, 4-6, 7-9, 10-12, 13-14, 15 = the Vault)
    tierOfLevel: [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5],
    artZoneOfTier: [0, 1, 2, 3, 3, 3],          // which painted rock/tunnel set each tier uses (there are four)

    // ---------- time: 10 s per level down, 10 x (1 + W/40) s per level up ----------
    secondsPerLevel: 10,
    ladderStep: 6,                               // tiles from the ladder you came down to the next one down
    walkShareOfLevel: 0.356,                     // of the 10 s: walking between ladders; the rest is on the ladder
    // ---------- weight (the owner's order: Vault piece heaviest, then amber, then the rest) ----------
    bagCapacity: 40,
    weight: { vault: 10, amber: 4, silver: 3, iron: 2, coal: 1 },
    weightSlows: 40,                             // each unit of weight adds 1/40 of the empty climb time

    // ---------- side tunnels: the mine grows sideways with the crowd ----------
    sideTunnelLength: 7,                         // tiles
    sideTunnelsBase: 2,                          // per level, one at each end of the main gallery
    minersPerExtraTunnel: 10,                    // one more side tunnel per level for every 10 miners below

    // ---------- ore: the drop table sets ratios only; the block's amber budget sets the satoshis ----------
    amberRatio: [20, 40, 80, 150, 300],          // satoshis per amber piece by tier, before scaling to the budget
    materials: [['coal'], ['coal', 'iron'], ['iron'], ['iron', 'silver'], ['silver']],
    amberNodesPerLevel: [6, 4, 3, 2, 1],         // many poor pieces near the top, a few rich ones deep down
    materialNodesPerLevel: [3, 3, 3, 3, 2],
    regrowEverySeconds: 30,                      // shallow ore (tiers 0 and 1) regrows slowly, from the same budget
    regrowTiers: 2,
    regrowShareOfBudget: 0.25,                   // of each block's budget, kept back for regrowth
    richLevel1Chance: 0.1,                       // per block: a rich node on level 1 ...
    richLevel1Lamps: 10,                         // ... worth about ten lamps
    swingsHardness: [1, 1.25, 1.5, 1.75, 2, 2.5],   // deeper nodes take more swings (times the clean/sloppy counts)

    // ---------- the pot, the Vault and the studio (the money table in the brief) ----------
    seedPot: 100000,                             // the owner's: seed the points pot at the start of the season
    budgetShareOfPot: 0.04,                      // each block places this share of the pot as amber
    salesTo: { pot: 0.85, vault: 0.05, counter: 0.10, studio: 0 },
    carriedOutTo: { miner: 0.9, studio: 0.1 },
    caughtTo: { pot: 0.5, vault: 0.4, studio: 0.1 },
    droppedAmberToPicker: 0.5,                   // the other half goes to the Vault (stops relays)
    vaultPieceShare: 0.1,                        // a Vault piece is worth a tenth of the Vault
    seedVault: 0,

    // ---------- kit, lamps and oil (the owner's prices: kit 1,000 with three lamps, then 300 a lamp) ----------
    kitPrice: 1000, kitLamps: 3,
    lampPrice: 300,
    startPoints: 2000,                           // points-only season: what a new player starts with
    oilPrice: 50, oilMaxMeasures: 4,
    oilWidenPerMeasure: 0.25,                    // each measure widens the light by about a quarter
    oilSecondsPerMeasure: 150,                   // a measure burns down in this long below the hatch
    basicLight: 3.2,                             // tiles: the basic lamp's circle of light (it never goes out)

    // ---------- printed on screen: the chance a block lands within a time, from the ten-minute average ----------
    catchRates: [[10, '1 in 60'], [60, '1 in 10'], [180, '1 in 4'], [300, '4 in 10']],
  };
  R.tier = (l) => (l < 0 ? -1 : R.tierOfLevel[Math.min(l, R.levels - 1)]);
  R.climbSecondsPerLevel = (w) => R.secondsPerLevel * (1 + w / R.weightSlows);

  // the movement the cutaway game uses, set so a level takes 10 s down and 10 x (1 + W/40) s up
  function movement(S) {
    const T = S.tile, ladder = S.levelSpacing * T, walk = R.ladderStep * T;
    const walkSec = R.secondsPerLevel * R.walkShareOfLevel, ladderSec = R.secondsPerLevel - walkSec;
    return { runSpeed: walk / walkSec, slideSpeed: ladder / ladderSec, climbSpeed: ladder / ladderSec, walkSec, ladderSec, ladderLength: ladder };
  }
  // how much weight slows him on a ladder going up, so a whole level up takes 10 x (1 + W/40) s; walking is not slowed
  R.climbFactor = (w, mv) => mv.ladderSec / (R.climbSecondsPerLevel(w) - mv.walkSec);

  if (base) {
    const S = Object.assign({}, base, {
      levels: R.levels,
      bagCapacity: R.bagCapacity,
      terrainPerZone: [[0, 0], [0, 1], [1, 1], [1, 2], [1, 2], [0, 1]],   // gaps and rubble by tier
      lightRadius: R.basicLight,
      glimmer: 0.12,                               // ore glows only faintly outside the lamplight
      cols: 60,
    });
    Object.assign(S, movement(S));
    root.SETTINGS = S;
  }
  R.movement = movement;
  root.RULES = R;
  if (typeof module !== 'undefined') module.exports = R;
})(typeof window !== 'undefined' ? window : globalThis);
