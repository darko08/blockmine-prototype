# Blockmine Prototype

A single-player practice mine timed by the real Bitcoin chain. One web page, Phaser 3, plain JavaScript. No accounts, no wallet, no money.

**Play (cutaway mine):** https://darko08.github.io/blockmine-prototype/ · **Rope version:** https://darko08.github.io/blockmine-prototype/rope/ · **Test mode** (simulated blocks about 1 minute apart): add `?test` to either address.

## Cutaway mine (main page)
- A side-on cutaway: the hatch at the top, 12 levels of tunnels joined by ladders, laid out from the block hash. Every block is a new mine; the same block always gives the same mine.
- Four zones of three levels. A node is worth 1 (levels 1–3), 3 (4–6), 8 (7–9) or 20 (10–12); a rare rich node on any level is worth 5 times that.
- Direct control. Keyboard: **A/D** or **←/→** run, **Space** jump, **E** grab a ladder (or start mining a node beside you), **W/S** climb up / slide down; then drag along the node's crack to swing (clean: 2 swings, sloppy: up to 5). Phone: on-screen ◀ ▶, Jump and E buttons; on a ladder ◀ ▶ become ▲ ▼. The controls are shown on screen during your first shift.
- Ladders: he can walk straight across a ladder's top. Standing at a ladder's top or foot shows a ladder symbol with **E** above him; press E to grab it, then W/S. Next to a node it shows a pick with **E**. On a phone the E button shows the same symbol.
- Falls happen only at gaps that need a jump: about 3 seconds stunned and a quarter of the bag spilled. Falls never kill.
- Gaps and rubble need a jump: none on levels 1–3, more with depth. In the air he keeps his walking speed, so a full bag (half speed) jumps half as far as an empty one; every gap and mound is narrow enough to clear with a full bag.
- Speeds: an empty miner runs at 54 units/s, a full bag halves it; sliding down a ladder is three times climbing speed.
- Fog of war: the lamp lights a few metres, tunnels you have walked stay dim, the rest is black. Ore from level 7 down glimmers in the dark.
- Oil burns below the hatch (a full tank lasts about 10 minutes). A full bag halves walking and climbing speed. Passing the hatch banks the bag; if the next block knocks first, the bag is lost and it counts 1 death.
- The percentage is the chance a block lands before you'd reach the hatch if you left now and made no mistakes, from the time of a clean run back along the real route: `1 - e^(-seconds / 600)`.
- A clean round trip to level 12 (down empty, back with a full bag) takes about 5 minutes 40 seconds on an average mine (`node tools/tune_cutaway.js` measures it).
- Block clock, live-feed handling and records work as in the rope version; the cutaway keeps its own record.
- Test mode has a **Game speed** slider (0.25× to 8×) that speeds up everything: moving, oil, new nodes, stuns, the simulated blocks and the block clock.

## One Bell (`/onebell/`)
A separate mini-game: https://darko08.github.io/blockmine-prototype/onebell/ · test: add `?test=1`.
- One ladder, 12 levels. Tap **GO DOWN** at the hatch; the miner goes down by himself (3 s a level) and stops at 12.
- The bag fills every second: levels 1–3 give 1 point, 4–6 give 3, 7–9 give 8, 10–12 give 20.
- Tap **CLIMB OUT** once (3 s a level back up). He cannot go back down: one decision per run. Reaching the hatch banks the bag.
- The percentage is `1 - e^(-climbSeconds / 600)`, where climbSeconds is the time back to the hatch from where he is now.
- A real new Bitcoin block rings the bell (a recording, `onebell/assets/sounds/bell.mp3`, played once). If he is below the hatch the bag is lost. Every block starts a new round.
- Streak (days in a row with a banked run) and Best (deepest level he got out from) stay in this browser. **M** mutes; Space/Enter is the button.
- Music: the 3D version's tracks (`3d/music/`), one per point zone (levels 1–3, 4–6, 7–9, 10–12), crossfaded as he goes down, softer at the hatch. When the bell rings the music stops so the bell is heard alone, then comes back softly. **N** (or the note button) turns only the music off; **M** silences everything.
- Test mode (`?test=1`): a fake bell, random, about 60 s apart (the percentage uses that 60 s average), and its own record. TEST is shown on screen.
- Files: `onebell/index.html`, `onebell/game.js`, `onebell/assets/shaft.png` (background, Runway task d06ecd10), `onebell/assets/sounds/bell.mp3` (first strike of the church bell recording). Uses `js/chain.js` and the miner art in `Assets/cutaway/`.

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
- `Assets/cutaway/` — painted art for the cutaway mine, cut by `python tools/cut_cutaway.py` from the Runway sheets in `Assets/sheets/cutaway/` (the originals are large and kept out of git; the prompts are in `ART_BRIEF.md`). Replace any file to swap it, then bump `artVersion` in `cutaway/settings.js`.
- `Assets/` — painted pieces for the rope version, cut from the sheets in `Assets/sheets/` by `python tools/cut_sheets.py`.
