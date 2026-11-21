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
  reachHalfWidth: 180,             // lamp reach is measured as if the ore sat this far from the rope (the rule, independent of screen)
  shaftScreenFraction: 0.6,        // the shaft fills this share of the screen width on wide screens; the rock walls the rest
  shaftScreenFractionNarrow: 0.5,  // on tall phone screens, so the ore in the walls stays in view
  shaftHalfWidthMin: 60, shaftHalfWidthMax: 420,
  postWidth: 34,                   // timber posts down both edges of the shaft
  beamThickness: 30,
  surfaceY: -70,                   // where the miner waits above the hatch

  // --- Movement (units per second) ---
  descendSpeed: 170,
  climbSpeed: 120,
  fullBagClimbFactor: 0.5,         // a full bag climbs at half speed (scales linearly with weight)

  // --- Lamp and oil ---
  oilStart: 100,
  oilBurnPerSecond: 0.5,           // burns only while below the hatch
  lampReach: 215,                  // how far from the lamp you can press a node to stop there (see reachHalfWidth)

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

  artVersion: 4,                   // bump after replacing art files so browsers fetch the new ones
  // --- Art. Swap any piece by replacing its file (sheets in Assets/sheets are cut by tools/cut_sheets.py).
  art: {
    rockUpper: 'Assets/rock_upper.webp', rockDeep: 'Assets/rock_deep.webp', rockJoin: 'Assets/rock_join.webp',
    minerHang: 'Assets/miner_hang.webp', minerSwing: 'Assets/miner_swing.webp', minerClimb: 'Assets/miner_climb.webp',
    bagEmpty: 'Assets/bag_empty.webp', bagHalf: 'Assets/bag_half.webp', bagFull: 'Assets/bag_full.webp',
    lampLit: 'Assets/lamp_lit.webp', lampOut: 'Assets/lamp_out.webp',
    hatchOpen: 'Assets/hatch_open.webp', hatchShut: 'Assets/hatch_shut.webp',
    beamH: 'Assets/beam_horizontal.webp', beamV: 'Assets/beam_vertical.webp',
    // ore by level: small, medium, large, large
    crystals: ['Assets/ore_small.webp', 'Assets/ore_medium.webp', 'Assets/ore_large.webp', 'Assets/ore_large.webp'],
  },
  // measured by tools/cut_sheets.py, as fractions of each piece's width/height
  ropeX: { minerHang: 0.561, minerSwing: 0.444, minerClimb: 0.79, bagEmpty: 0.407, bagHalf: 0.399, bagFull: 0.391 },
  // the lantern painted on his belt is the one lamp: its centre and height in each pose
  lantern: { minerHang: { x: 0.189, y: 0.542, h: 0.15 }, minerSwing: { x: 0.194, y: 0.588, h: 0.13 }, minerClimb: { x: 0.185, y: 0.538, h: 0.14 } },
  hipX: { minerHang: 0.66, minerSwing: 0.55, minerClimb: 0.6 },   // where the bag hangs, the hip away from the lantern
  beltY: 0.44,            // his belt, as a fraction of his height from the top
  minerHeight: 150,       // world units
  bagHeight: [37, 75],    // a quarter of his height empty, at most half his height full
  oreTint: 0xffffff,      // multiply tint on the ore art (white = as painted)
  oreRockGlow: 0.3,       // the soft orange light each node throws on the rock around it
  rockScale: 0.9,         // world units per backdrop pixel
  lightRadius: 280,       // soft warm circle around the lamp (world units)
  darkness: 0.66,         // how black the unlit rock is (the walls still show, dimly)
  darknessLampOut: 0.97,  // with the lamp out
  oreGlowInDark: 0.32,    // ore glows faintly even in the dark
  poseFadeMs: 140,        // the miner slides between his 3 poses

  // --- Camera ---
  minerScreenShare: 0.25,          // the camera zooms so the miner is this share of the screen height
  cameraLead: 0.12,                // look a little below the miner
};
