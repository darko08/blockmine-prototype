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
- One ladder with no floor. Tap **GO DOWN** at the hatch; the miner goes down by himself, 3 s a level, until you tap **CLIMB OUT** or the bell rings. Once he reaches the middle of the screen the shaft scrolls past him. Level marks are numbered without end.
- One deposit per level on the wall beside the ladder, alternating sides. Passing a level he chips it by himself (a short swing; the deposit dims and crumbles and "+N" floats to the bag). Levels 1–3 copper (3), 4–6 ember (9), 7–9 moonstone (24), 10–12 blackglass (60); from 13 the four repeat, 3 levels each, and every zone is worth 60 more than the one before (120, 180, 240, …). From level 5, each level has a 1 in 8 chance of **bell gold** instead (5 times that level's value); it glimmers from up to 3 levels above. The mine comes from the block hash: the same for everyone in a block, new at every block.
- Climbing takes 3 s a level + 0.1 s for every deposit in the bag, never more than 6 s a level (points do not change the speed). While he climbs, three buttons replace the one: **STEADY** (that speed, nothing lost; selected at the start), **FAST** (twice as fast, one random stone falls out of the bag for every 8 levels climbed) and **RUN** (three times as fast, one for every 5); one running count of levels climbed toward the next drop, which switching speed does not reset and STEADY does not add to; keys 1, 2, 3. Each button shows its own live risk (rounded to the nearest whole percent), and FAST and RUN show their price for the rest of the climb: "loses about N stones", N = levels left ÷ 8 or ÷ 5, rounded down ("loses nothing" at 0). The big percentage shows the selected one's. A falling deposit pops out of the sack, tumbles down the shaft, bounces once off a wall and fades into the dark, in its own look (copper dull, ember with a warm trail, moonstone with a cold blue flash, blackglass with a gold glint, bell gold sparkling and falling slower); a red "-N" shows by the bag number, which counts down. The stone sprites are the crystal parts of the deposit pictures, cut out and scaled down in code. The percentage is `1 - e^(-climbSeconds / 600)` for the full climb from where he is at that speed (level by level, as the bag gets lighter), whole percent, up to 99%: about 8% at level 12, 15% at 20, 32% at 38, 45% at 60.
- A real new Bitcoin block rings the bell (a recording, `onebell/assets/sounds/bell.mp3`, played once). If he is below the hatch the bag is lost. Every block starts a new round.
- Under the clock: the last three blocks' times from the real block timestamps, newest first, and the average (mempool.space's average block time for the current difficulty period).
- At the hatch the bottom panel shows the message ("You got out. +N points.", or the bell) in place of the percentage, then "Banked: N points", the total of all banked runs. Streak (days in a row with a banked run), Best (deepest level he got out from, no limit) and the banked total stay in this browser. **M** mutes everything; **N** (or the note button) only the music; Space/Enter is the button.
- Music: the 3D version's tracks (`3d/music/`), one per zone (levels 1–3, 4–6, 7–9, 10 and deeper), crossfaded, softer at the hatch; the bell stops it so the bell is heard alone.
- Background: the top of `onebell/assets/shaft.png` once (rows 0–1050), then rows 450–1050 repeated, with the next 200 rows faded in over each tile's top so the joins blend. Outside the lamp the rock gets a little darker every 3 levels, but never black, and inside the lamp's circle the walls stay lit at any depth. Near-black panels at the top and bottom: nothing scrolls behind the text.
- Miner: sprite sheets in `onebell/assets/miner/` rendered from the 3D version's model and animations (`3d/models`): an orthographic camera, level at his chest height, pointing horizontally at his back (about 15° to his right, so the lamp shows), his spine upright and his head and neck from the idle clip, legs halfway from the climb's crouch toward standing. Sheets: climb down (the climb reversed), climb up (played faster at FAST and RUN, slower with a heavier bag), swing right (legs and left hand keep a climb pose on the ladder; the right arm, straight, rises out to his side and strikes down to the side at the deposit's height, half a level below his hands) and swing left (mirrored). Each has a sack layer (`*_bag.png`) that the game draws over him and shrinks as the bag empties. `miner.json` holds each frame's hands, head, lantern and sack strap. In the game he is about 1.5 levels tall, hands on the current level mark; a level is 170 px of the painting. Re-render with `node tools/onebell_miner/render.js`. The model has no stumble animation, so when the bell catches him the game holds his last frame with a jolt and a short slip.
- Deposits: `onebell/assets/deposits/` (copper, ember, moonstone, blackglass, bellgold), cut from the Runway sheet (task b2279055), drawn at full colour, about one level tall, one per level; only the outer edge of the rock base fades into the wall. They shine in the lamp light and are dim outside it; blackglass has a warm rim.
- Sounds (recordings only): `bell.mp3` (the first strike of the church bell recording supplied for the game); `pick.mp3`, one blow from "Nail and hammer #1" by Joseph Sardin, BigSoundBank, CC0 (https://bigsoundbank.com/nail-and-hammer-1-s0005.html — no pickaxe recording was found, this is the closest real strike); `stone.mp3`, one drop from "Fall of Stone" by Joseph Sardin, BigSoundBank, CC0 (https://bigsoundbank.com/fall-of-stone-s1022.html). Both trimmed, faded and levelled.
- Test mode (`?test=1`): a fake bell, random, about 60 s apart (the percentage uses that 60 s average), and its own record. TEST is shown on screen.

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
