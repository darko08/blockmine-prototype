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
  lightRadius: 4.2,                // tiles the lamp lights around the miner
  lampReach: 2.6,                  // tiles from the lamp to a node to swing at it
  fogVisited: 0.58,                // how dark the tunnels you have already walked stay (1 = black)
  fogVisitedLampOut: 0.95,
  fogCell: 16,
  lampWarmth: 0.34,                // strength of the warm glow around the lantern
  rockTint: 0x6b6560,              // solid rock is shaded darker than the tunnels cut into it

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
  minerHeight: 54,                 // world units
  bagHeight: [12, 25],             // a quarter of his height empty, half full

  // --- Camera ---
  viewHeight: 460,                 // world units visible top to bottom (about 4 levels)
  viewWidthMin: 330,               // at least this much across, on narrow phones

  // --- Art: painted pieces cut from Assets/sheets/cutaway by tools/cut_cutaway.py. Replace any file to swap it,
  // then bump artVersion so browsers fetch the new files.
  artVersion: 3,
  art: {
    rock: ['Assets/cutaway/rock_zone1.webp', 'Assets/cutaway/rock_zone2.webp', 'Assets/cutaway/rock_zone3.webp', 'Assets/cutaway/rock_zone4.webp'],
    tunnel: ['Assets/cutaway/tunnel_zone1.webp', 'Assets/cutaway/tunnel_zone2.webp', 'Assets/cutaway/tunnel_zone3.webp', 'Assets/cutaway/tunnel_zone4.webp'],
    ore: ['Assets/cutaway/ore_zone1.webp', 'Assets/cutaway/ore_zone2.webp', 'Assets/cutaway/ore_zone3.webp', 'Assets/cutaway/ore_zone4.webp'],
    oreRich: 'Assets/cutaway/ore_rich.webp',
    ladder: 'Assets/cutaway/ladder.webp',
    post: 'Assets/cutaway/post.webp', beamCap: 'Assets/cutaway/beam_cap.webp', brace: 'Assets/cutaway/brace.webp', floor: 'Assets/cutaway/floor.webp',
    surface: 'Assets/cutaway/surface.webp',
    minerWalk: 'Assets/cutaway/miner_walk.webp', minerClimb: 'Assets/cutaway/miner_climb.webp', minerMine: 'Assets/cutaway/miner_mine.webp',
    bagEmpty: 'Assets/cutaway/bag_empty.webp', bagHalf: 'Assets/cutaway/bag_half.webp', bagFull: 'Assets/cutaway/bag_full.webp',
    lampLit: 'Assets/cutaway/lamp_lit.webp', lampOut: 'Assets/cutaway/lamp_out.webp',
    hatchOpen: 'Assets/cutaway/headframe_open.webp', hatchShut: 'Assets/cutaway/headframe_shut.webp',
    props: ['Assets/cutaway/prop_cart.webp', 'Assets/cutaway/prop_barrel.webp', 'Assets/cutaway/prop_crates.webp', 'Assets/cutaway/prop_pick.webp',
      'Assets/cutaway/prop_shovel.webp', 'Assets/cutaway/prop_rubble.webp', 'Assets/cutaway/prop_rope.webp', 'Assets/cutaway/prop_oilcan.webp'],
  },
  // measured by tools/cut_cutaway.py, as fractions of each picture: the lantern he carries (the one lamp) and his body's centre line
  pose: {
    minerWalk: { lantern: { x: 0.931, y: 0.37, h: 0.142 }, bodyX: 0.461 },
    minerClimb: { lantern: { x: 0.334, y: 0.519, h: 0.122 }, bodyX: 0.426 },
    minerMine: { lantern: { x: 0.389, y: 0.597, h: 0.102 }, bodyX: 0.424 },
  },
  bagStrapX: { bagEmpty: 0.327, bagHalf: 0.362, bagFull: 0.377 },
  backX: 0.2,                      // the bag's strap sits this far behind his centre line (fraction of his picture's width)
  backY: 0.22,                     // and this far down from the top of his head (fraction of his height)

  // --- Timbering and props (world units) ---
  postEvery: 4,                    // tiles between support posts
  postWidth: 9,
  beamHeight: 10,
  floorHeight: 11,
  braceSize: 30,
  ladderWidth: 26,
  hatchWidth: 112,
  surfaceWidth: 2600,
  surfaceGround: 0.83,             // where the ground line sits in the surface painting, as a fraction of its height
  propsPerLevel: [0, 2],           // min, max, laid out from the block hash
  propHeight: [26, 24, 30, 26, 28, 14, 12, 16],   // cart, barrel, crates, pick, shovel, rubble, rope, oil can
  waitOffset: 2.6,                 // tiles left of the shaft where he waits on the surface
};
