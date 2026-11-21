// Every speed, cost and rate in Blockmine lives here.
// World units: the shaft is 360 units wide; one level is LEVEL_HEIGHT units tall.
window.SETTINGS = {
  // --- Chain timer ---
  averageBlockSeconds: 600,        // Bitcoin's 10-minute average, used for the honest number
  testBlockSeconds: 60,            // test mode: simulated blocks, exponential, this mean
  hatchShutSeconds: 3,             // after the knock, hatch stays shut this long before the new mine opens
  feedStaleSeconds: 45,            // no message from mempool.space this long = feed lost, game pauses
  feedReconnectSeconds: 5,
  mempoolSocket: 'wss://mempool.space/api/v1/ws',
  mempoolApi: 'https://mempool.space/api',

  // --- Shaft ---
  levels: 4,
  levelHeight: 500,
  shaftHalfWidth: 180,
  wallThickness: 80,
  surfaceY: -70,                   // where the miner waits above the hatch

  // --- Movement (units per second) ---
  descendSpeed: 170,
  climbSpeed: 120,
  fullBagClimbFactor: 0.5,         // a full bag climbs at half speed (scales linearly with weight)

  // --- Lamp and oil ---
  oilStart: 100,
  oilBurnPerSecond: 0.5,           // burns only while below the hatch
  lampReach: 215,                  // how far from the lamp you can press a node to stop there

  // --- Ore ---
  nodesPerLevel: [5, 7, 9, 11],    // laid out from the block hash
  oreValue: [1, 2, 4, 8],          // points per piece, by level (randomised +-30%)
  oreRadius: [13, 15, 17, 19],
  oreWeight: [1, 1, 1.5, 2],       // bag weight per piece, by level
  bagCapacity: 10,                 // weight; a full bag refuses more ore
  spawnEverySeconds: 20,           // new nodes keep appearing while the hatch is open
  spawnLevelWeights: [1, 2, 3, 4], // new nodes favour the deep
  maxNodes: 60,

  // --- Swinging ---
  swingMinLength: 35,              // a drag shorter than this is not a swing
  cleanSwings: 2,                  // a clean drag breaks a node in this many swings
  sloppySwings: 5,                 // a sloppy one takes up to this many
  cleanAt: 0.92,                   // alignment x straightness at or above this = clean
  sloppyAt: 0.45,                  // at or below this = sloppiest
  nodeTouchSlop: 2.4,              // press within radius x this counts as pressing the node

  // --- Art (pass 2). Swap any piece by replacing its file; set a crystal entry to a file path to replace the drawn crystals.
  art: {
    wall: 'Assets/tex_wall.webp', deep: 'Assets/tex_deep.webp',
    minerHang: 'Assets/miner_hang.webp', minerSwing: 'Assets/miner_swing.webp', minerClimb: 'Assets/miner_climb.webp',
    bagEmpty: 'Assets/bag_empty.webp', bagHalf: 'Assets/bag_half.webp', bagFull: 'Assets/bag_full.webp',
    lampLit: 'Assets/lamp_lit.webp', lampOut: 'Assets/lamp_out.webp',
    hatchOpen: 'Assets/hatch_open.webp', hatchShut: 'Assets/hatch_shut.webp',
    beamH: 'Assets/beam_horizontal.webp', beamV: 'Assets/beam_vertical.webp', beamD: 'Assets/beam_diagonal.webp',
    crystals: null,   // e.g. ['Assets/crystal_1.webp', 'Assets/crystal_2.webp', 'Assets/crystal_3.webp', 'Assets/crystal_4.webp'] (one per level)
  },
  // where the rope meets each painted piece, as a fraction of its width (measured by tools/cut_sheets.py)
  ropeX: { minerHang: 0.454, minerSwing: 0.077, minerClimb: 0.556, bagEmpty: 0.356, bagHalf: 0.336, bagFull: 0.384, lampLit: 0.5, lampOut: 0.5 },
  minerHeight: 150,       // world units
  lampHeight: 40,
  bagHeight: [46, 76],    // empty -> full
  bagRope: [26, 44],      // rope length empty -> full (the bag pulls it down)
  wallTextureScale: 0.55,
  lightRadius: 280,       // soft warm circle around the lamp (world units)
  darkness: 0.96,         // how black the unlit shaft is
  oreGlowInDark: 0.32,    // ore glows faintly even in the dark
  poseFadeMs: 140,        // the miner slides between his 3 poses

  // --- Camera ---
  viewWidth: 420,                  // world units visible across (shaft plus some wall)
  viewHeightMin: 620,
  cameraLead: 0.12,                // look a little below the miner
};
