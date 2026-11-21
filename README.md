# Blockmine Prototype

A single-player practice mine timed by the real Bitcoin chain. One web page, Phaser 3, plain JavaScript. No accounts, no wallet, no money.

**Play (cutaway mine):** https://darko08.github.io/blockmine-prototype/ · **Rope version:** https://darko08.github.io/blockmine-prototype/rope/ · **Test mode** (simulated blocks about 1 minute apart): add `?test` to either address.

## Cutaway mine (main page)
- A side-on cutaway: the hatch at the top, 12 levels of tunnels joined by ladders, laid out from the block hash. Every block is a new mine; the same block always gives the same mine.
- Four zones of three levels. A node is worth 1 (levels 1–3), 3 (4–6), 8 (7–9) or 20 (10–12); a rare rich node on any level is worth 5 times that.
- Tap or click where to go: the miner walks there and takes the ladders himself. Tap a node your lamp lights and he walks to it; drag along its crack to swing (clean: 2 swings, sloppy: up to 5). **Go up** walks him back to the hatch.
- Fog of war: the lamp lights a few metres, tunnels you have walked stay dim, the rest is black. Ore from level 7 down glimmers in the dark.
- Oil burns below the hatch (a full tank lasts about 10 minutes). A full bag halves walking and climbing speed. Passing the hatch banks the bag; if the next block knocks first, the bag is lost and it counts 1 death.
- The percentage is the chance a block lands before you'd reach the hatch if you left now, from the real walking time along the route back: `1 - e^(-seconds / 600)`.
- A round trip to level 12 (down empty, back with a full bag) takes about 8 minutes on an average mine (`node tools/tune_cutaway.js` measures it).
- Block clock, live-feed handling and records work as in the rope version; the cutaway keeps its own record.

## Rope version (`/rope/`)
- Hold on empty rock to go down; let go to climb. Press a node within lamp reach to stop there, then drag along its crack to swing.
- Same block clock, oil, bag, hatch, knock and record rules.

## Shared rules
- A new block (live from mempool.space) rings the bell and opens the hatch. The block clock counts up from the moment it arrived (never a countdown) and shows how long the previous block stayed open.
- If the live feed drops, the game pauses; a block missed during the outage never catches you.
- Your record (shifts, deepest level, times caught, total points) stays in this browser. Test mode keeps a separate record.

## Files
- `cutaway/settings.js` — every speed, cost and rate for the cutaway mine. `settings.js` — the same for the rope version.
- `cutaway/mine.js` — the mine from the block hash, and the walking routes. `cutaway/game.js` — the cutaway game.
- `js/` — rope game, chain feed, seeded randomness, sounds, records (shared).
- `Assets/cutaway/` — placeholder art for the cutaway mine (`python tools/make_placeholders.py`). Replace any file to swap it, then bump `artVersion` in `cutaway/settings.js`.
- `Assets/` — painted pieces for the rope version, cut from the sheets in `Assets/sheets/` by `python tools/cut_sheets.py`.
