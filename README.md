# Blockmine Prototype

A single-player practice mine timed by the real Bitcoin chain. One web page, Phaser 3, plain JavaScript. No accounts, no wallet, no money.

**Play:** https://darko08.github.io/blockmine-prototype/ · **Test mode** (simulated blocks about 1 minute apart): add `?test` to the address.

## How it plays
- A new block (live from mempool.space) rings the bell, opens the hatch, and lays out a mine from that block's hash. The same block always gives the same mine.
- The next block knocks. Anyone below the hatch is caught and loses the bag ("the deep is closed", 1 death).
- Hold on empty rock to go down; let go to climb. Press a node within your lamp's reach to stop there, then drag along its crack to swing: a clean drag breaks it in 2 swings, a sloppy one in up to 5.
- Oil burns below the hatch; at 0 the lamp dies and only your bag glows. Every piece of ore adds weight; a full bag climbs at half speed.
- The block clock at the top centre shows the current block and how long its hatch has been open, counting up from the moment it arrived (never a countdown), and how long the previous block stayed open. The first block after you load uses the block's own timestamp; later ones use the moment the feed delivered them.
- Passing the hatch banks your bag. The number beside the clock is the chance a block lands before you'd reach the hatch if you left now: `1 - e^(-climb seconds / 600)`.
- If the live feed drops, the game pauses; a block missed during the outage never catches you.
- Your record (shifts, deepest level, times caught, total points) stays in this browser. Test mode keeps a separate record.

## Files
- `settings.js` — every speed, cost and rate.
- `js/` — game, chain feed, seeded randomness, sounds, records.
- `Assets/` — painted pieces for pass 2, cut from `Assets/sheets/` by `tools/cut_sheets.py`. Replace a file to swap a piece, then bump `artVersion` in `settings.js` (and the `?v=` on the script tags when code changes) so browsers fetch the new files.
