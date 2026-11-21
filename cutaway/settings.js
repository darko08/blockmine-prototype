// Blockmine, cutaway version. Every speed, cost and rate lives here.
// World units: one tile is TILE units (think of a tile as about a metre).
window.SETTINGS = {
  // --- Chain timer (same as the rope version) ---
  averageBlockSeconds: 600,        // Bitcoin's 10-minute average, used for the honest number
  testBlockSeconds: 60,
  testSpeeds: [0.25, 0.5, 1, 2, 4, 8],   // test mode: the whole-game speed slider's steps
  maxStep: 1 / 60,                 // the game moves in steps no longer than this (seconds of game time)            // test mode: simulated blocks, exponential, this mean
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

  // --- Moving: direct control (world units per second; a full bag halves all of them) ---
  runSpeed: 54,                    // empty: twice the old walking speed
  climbSpeed: 15.5,                // up a ladder
  slideSpeed: 46.5,                // down a ladder: three times climbing speed
  fullBagSpeedFactor: 0.5,         // a full bag moves at half the empty speed (scales linearly with weight)
  jumpHeight: 16,                  // world units
  gravity: 170,                    // with jumpHeight sets how long a jump lasts (about 0.87 s)
  // in the air he keeps his walking speed, so a jump carries walking speed x air time:
  // empty about 47 units (1.5 tiles), full bag about 23 (half: the bag halves his speed)
  grabRange: 0.6,                  // tiles: standing this close to a ladder's top or foot, E grabs it (he can walk across its top)
  mineRange: 0.7,                  // tiles past his standing spot that E still reaches a node
  fallStunSeconds: 3,              // falling into a gap (the only place he can fall): stunned this long
  fallSpill: 0.25,                 // and this share of the bag spills (rounded to whole pieces). Falls never kill.
  pitDepth: 0.9,                   // tiles: how deep a gap's pit is

  // --- Gaps and rubble, laid out from the block hash ---
  terrainPerZone: [[0, 0], [0, 1], [1, 2], [2, 3]],   // min, max per level: none on levels 1-3, more with depth
  gapShare: 0.5,                   // share of them that are gaps (the rest are rubble mounds)
  gapWidth: [14, 40],              // world units (capped so a full bag can always clear it)
  rubbleWidth: [12, 34],
  rubbleHeight: 9,
  gapSafety: 0.8,                  // the widest gap is this share of a full-bag jump
  rubbleSafety: 0.6,               // the widest mound is this share of a full-bag jump (he must stay above it)
  keysHintShifts: 1,               // show the controls on screen for this many shifts

  // --- Lamp and oil ---
  oilStart: 100,
  oilBurnPerSecond: 0.17,          // burns only below the hatch: a full tank lasts about 10 minutes
  lightRadius: 4.2,                // tiles the lamp lights around the miner
  lampReach: 2.6,                  // tiles from the lamp to a node to swing at it
  fogVisited: 0.58,                // how dark the tunnels you have already walked stay (1 = black)
  fogVisitedLampOut: 0.95,
  fogCell: 16,
  lampWarmth: 0.34,                // strength of the warm glow around the lantern
  rockTint: 0x4a4541,              // solid rock between tunnels is shaded much darker than the hollow tunnels

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
  oreChestHeight: 30,              // ore sits in the tunnel wall this far above the floor (his chest)
  oreStandGap: 0.95,               // tiles: he stands this far beside a node, never on it
  orePostClear: 0.55,              // tiles: ore keeps this far from the painted timber posts
  orePlaceTries: 40,               // attempts to find a free spot for each node

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

  // --- Camera: follows him, keeping him near the centre ---
  minerScreenShare: 0.2,           // he is about a fifth of the screen height
  viewWidthMin: 160,               // but at least this many world units across (5 tiles), so a tall phone still shows the tunnel
  cameraFollow: 10,                // how quickly the camera catches up (higher = tighter)

  // --- Art: painted pieces cut from Assets/sheets/cutaway by tools/cut_cutaway.py. Replace any file to swap it,
  // then bump artVersion so browsers fetch the new files.
  artVersion: 4,
  art: {
    rock: ['Assets/cutaway/rock_zone1.webp', 'Assets/cutaway/rock_zone2.webp', 'Assets/cutaway/rock_zone3.webp', 'Assets/cutaway/rock_zone4.webp'],
    strip: ['Assets/cutaway/strip_zone1.webp', 'Assets/cutaway/strip_zone2.webp', 'Assets/cutaway/strip_zone3.webp', 'Assets/cutaway/strip_zone4.webp'],
    shaft: ['Assets/cutaway/tunnel_zone1.webp', 'Assets/cutaway/tunnel_zone2.webp', 'Assets/cutaway/tunnel_zone3.webp', 'Assets/cutaway/tunnel_zone4.webp'],
    ore: ['Assets/cutaway/ore_zone1.webp', 'Assets/cutaway/ore_zone2.webp', 'Assets/cutaway/ore_zone3.webp', 'Assets/cutaway/ore_zone4.webp'],
    oreRich: 'Assets/cutaway/ore_rich.webp',
    ladder: 'Assets/cutaway/ladder.webp',
    surface: 'Assets/cutaway/surface.webp',
    minerWalk0: 'Assets/cutaway/miner_walk0.webp', minerWalk1: 'Assets/cutaway/miner_walk1.webp',
    minerWalk2: 'Assets/cutaway/miner_walk2.webp', minerWalk3: 'Assets/cutaway/miner_walk3.webp',
    minerClimbA: 'Assets/cutaway/miner_climbA.webp', minerClimbB: 'Assets/cutaway/miner_climbB.webp',
    minerMine: 'Assets/cutaway/miner_mine.webp', minerStand: 'Assets/cutaway/miner_stand.webp',
    lampOut: 'Assets/cutaway/lamp_out.webp',
    hatchOpen: 'Assets/cutaway/headframe_open.webp', hatchShut: 'Assets/cutaway/headframe_shut.webp',
    props: ['Assets/cutaway/prop_cart.webp', 'Assets/cutaway/prop_barrel.webp', 'Assets/cutaway/prop_crate.webp', 'Assets/cutaway/prop_lantern.webp'],
  },
  // measured by tools/cut_cutaway.py. The tunnel strips: ceiling and floor lines, painted posts (fractions), picture size.
  strip: [
    { size: [1024, 403], ceil: 0.182, floor: 0.879, posts: [0.124, 0.447, 0.84] },
    { size: [1024, 403], ceil: 0.182, floor: 0.879, posts: [0.119, 0.513, 0.958] },
    { size: [1024, 415], ceil: 0.177, floor: 0.883, posts: [0.274, 0.784] },
    { size: [1024, 415], ceil: 0.178, floor: 0.883, posts: [] },
  ],
  // the miner's poses: drawn height relative to standing (scale), body centre line, and the belt lantern (the one lamp)
  pose: {
    minerWalk0: { scale: 1.0, bodyX: 0.402, lantern: { x: 0.568, y: 0.478, h: 0.127 } },
    minerWalk1: { scale: 0.997, bodyX: 0.527, lantern: { x: 0.783, y: 0.48, h: 0.208 } },
    minerWalk2: { scale: 0.997, bodyX: 0.398, lantern: { x: 0.592, y: 0.479, h: 0.142 } },
    minerWalk3: { scale: 1.0, bodyX: 0.519, lantern: { x: 0.771, y: 0.479, h: 0.213 } },
    minerClimbA: { scale: 1.048, bodyX: 0.464, lantern: { x: 0.632, y: 0.408, h: 0.152 } },
    minerClimbB: { scale: 1.008, bodyX: 0.449, lantern: { x: 0.625, y: 0.398, h: 0.137 } },
    minerMine: { scale: 0.979, bodyX: 0.357, lantern: { x: 0.421, y: 0.421, h: 0.152 } },
    minerStand: { scale: 1.0, bodyX: 0.437, lantern: { x: 0.69, y: 0.466, h: 0.173 } },
  },
  walkFrameEvery: 9,               // world units walked per walk frame
  climbFrameEvery: 10,             // world units climbed per climbing frame

  // --- Ladders, headframe, surface, props (world units) ---
  ladderWidth: 26,
  hatchWidth: 112,
  surfaceWidth: 2600,
  surfaceGround: 0.83,             // where the ground line sits in the surface painting, as a fraction of its height
  soilEdge: 64,                    // height of the soil-and-rock edge under the ground line
  propsPerLevel: [0, 2],           // min, max, laid out from the block hash
  propHeight: [28, 22, 20, 24],    // cart, barrel, crate, hanging lantern
  waitOffset: 2.6,                 // tiles left of the shaft where he waits on the surface
};
