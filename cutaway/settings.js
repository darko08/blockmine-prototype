// Blockmine, cutaway version. Every speed, cost and rate lives here.
// World units: one tile is TILE units (think of a tile as about a metre).
window.SETTINGS = {
  // --- Chain timer (same as the rope version) ---
  averageBlockSeconds: 600,        // Bitcoin's 10-minute average, used for the honest number
  testBlockSeconds: 60,            // test mode: simulated blocks, exponential, this mean
  hatchShutSeconds: 3,             // after the knock, the hatch stays shut this long before the new mine opens
  feedStaleSeconds: 45,
  feedReconnectSeconds: 5,
  mempoolSocket: 'wss://mempool.space/api/v1/ws',
  mempoolApi: 'https://mempool.space/api',

  // --- The mine, laid out from the block hash ---
  tile: 32,
  cols: 36,                        // the mine is this many tiles wide
  levels: 12,
  zoneLevels: 3,                   // 4 zones of 3 levels
  levelSpacing: 4,                 // tiles from one level's floor to the next
  tunnelHeight: 2,                 // tiles of open tunnel above each floor
  tunnelMinLength: 9,              // tiles
  tunnelReach: [3, 15],            // a tunnel runs this many tiles (min, max) each way past the ladder that reaches it
  secondLadderChance: 0.45,        // chance a pair of levels gets a second ladder
  surfaceWidth: 4,                 // tiles of ground either side of the hatch

  // --- Moving (world units per second; a full bag halves all of them). Tuned with tools/tune_cutaway.js so a
  // round trip to level 12 (down empty, back up with a full bag) takes about 8 minutes.
  walkSpeed: 27,
  ladderUpSpeed: 15.5,
  ladderDownSpeed: 21,
  fullBagSpeedFactor: 0.5,         // scales linearly with bag weight

  // --- Lamp and oil ---
  oilStart: 100,
  oilBurnPerSecond: 0.17,          // burns only below the hatch: a full tank lasts about 10 minutes
  lightRadius: 3.5,                // tiles the lamp lights around the miner
  lampReach: 2.6,                  // tiles from the lamp to a node to swing at it
  fogVisited: 0.72,                // how dark the tunnels you have already walked stay (1 = black)
  fogVisitedLampOut: 0.95,
  fogCell: 16,                     // world units per fog cell

  // --- Ore ---
  nodesPerLevel: 4,                // laid out from the block hash; more appear while the hatch is open
  zoneValue: [1, 3, 8, 20],        // points per node: levels 1-3, 4-6, 7-9, 10-12
  zoneWeight: [1, 1.5, 2, 2.5],    // bag weight per node, by zone
  richChance: 0.025,               // any level: a rare rich node
  richMultiplier: 5,
  bagCapacity: 10,
  spawnEverySeconds: 20,
  spawnZoneWeights: [1, 2, 3, 4],  // new nodes favour the deep
  maxNodesPerLevel: 7,
  glimmerFromZone: 2,              // zones from this one down (0-based: 2 = levels 7-12) glimmer in the dark
  glimmer: 0.28,
  oreRadius: 11,                   // world units

  // --- Swinging (same rule as the rope version) ---
  swingMinLength: 35,
  cleanSwings: 2,
  sloppySwings: 5,
  cleanAt: 0.92,
  sloppyAt: 0.45,
  nodeTouchSlop: 2.2,              // press within radius x this counts as pressing the node

  // --- Miner and bag ---
  minerHeight: 50,                 // world units
  bagHeight: [12, 25],             // a quarter of his height empty, half full

  // --- Camera ---
  viewHeight: 560,                 // world units visible top to bottom (about 4 levels)
  viewWidthMin: 330,               // at least this much across, on narrow phones

  // --- Art: placeholders for now; replace any file to swap it. artVersion: bump so browsers fetch new files.
  artVersion: 2,
  art: {
    rock: ['Assets/cutaway/rock_zone1.png', 'Assets/cutaway/rock_zone2.png', 'Assets/cutaway/rock_zone3.png', 'Assets/cutaway/rock_zone4.png'],
    tunnel: ['Assets/cutaway/tunnel_zone1.png', 'Assets/cutaway/tunnel_zone2.png', 'Assets/cutaway/tunnel_zone3.png', 'Assets/cutaway/tunnel_zone4.png'],
    ore: ['Assets/cutaway/ore_zone1.png', 'Assets/cutaway/ore_zone2.png', 'Assets/cutaway/ore_zone3.png', 'Assets/cutaway/ore_zone4.png'],
    oreRich: 'Assets/cutaway/ore_rich.png',
    ladder: 'Assets/cutaway/ladder.png',
    sky: 'Assets/cutaway/surface.png',
    minerWalk: 'Assets/cutaway/miner_walk.png', minerClimb: 'Assets/cutaway/miner_climb.png', minerMine: 'Assets/cutaway/miner_mine.png',
    bagEmpty: 'Assets/cutaway/bag_empty.png', bagHalf: 'Assets/cutaway/bag_half.png', bagFull: 'Assets/cutaway/bag_full.png',
    lampLit: 'Assets/cutaway/lamp_lit.png', lampOut: 'Assets/cutaway/lamp_out.png',
    hatchOpen: 'Assets/cutaway/hatch_open.png', hatchShut: 'Assets/cutaway/hatch_shut.png',
  },
};
