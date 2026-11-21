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

  // --- Camera ---
  viewWidth: 440,                  // world units visible across (shaft plus some wall)
  viewHeightMin: 620,
  cameraLead: 0.12,                // look a little below the miner
};
