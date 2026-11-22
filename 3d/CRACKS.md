# BLOCKMINE 3D: cheat hunt (job 7)

Tried as a cheater would, in the browser on the 3D build (practice mode, 22 Nov 2026), plus the strategy simulator.
A one-page game cannot be made cheat-proof: everything it knows, the player can read and change. So each crack says
what was fixed in the page now and what must wait for the shared-shaft server, where the server decides every result.

| # | Crack | Tried | Result | Fix in the page now | Fix on the server |
|---|---|---|---|---|---|
| 1 | Change points or lamps in the browser | Wrote 1,000,000 points into the stored purse | Accepted | None possible (practice points only) | The purse lives on the server; the page only shows it |
| 2 | Change speed, weight or bag size | `SETTINGS.runSpeed`, `RULES.weight`, `RULES.bagCapacity` are read live | Works | None possible | The server moves the miner from his inputs and caps speed and climb per tick by the bag's weight |
| 3 | See ore outside the lamplight | All 82 nodes of the block, with their satoshi values, are in the page | Works (the fog is only drawn over them) | None possible | The server sends only the nodes inside that miner's own light; outside it, a faint glimmer with no kind or value |
| 4 | Find the Vault without searching | Rebuilt the mine from the public block hash alone | Same Vault tunnel and spot as the game (level 15, tunnel 1, x 904) | None possible | Lay out the mine from a secret seed: HMAC(server secret, block hash). Publish a hash of the secret first and reveal it after the block, so anyone can check the layout was fair. The hum level is sent, never the position |
| 5 | Learn of the block early | The page hears blocks from mempool.space | A faster node or feed can give a few seconds' warning | — | The server's own arrival time decides catches, taken from the earliest of several feeds. The warning left is seconds, the same for everyone who runs a fast node |
| 6 | Go offline while below, wait for the block, reconnect | Missed block with a full bag | Was: brought up safely and the bag banked (a free way out) | **Fixed:** you are brought up but the bag goes back to the mine (no gain, no loss beyond the lamp) | Disconnected below = still below: caught if the block lands |
| 7 | Two tabs spend the same lamp | Spent a lamp in one tab, lit in the other | Was: each tab had its own copy of the purse | **Fixed:** the purse and pot are read fresh from storage before every spend or payout, and kept in step across tabs | One purse, on the server |
| 8 | Replay a good shift | Back up the browser storage before diving, restore it if caught; the same block hash gives the same mine | Works | None possible | Results are recorded on the server; one entry per lamp per block |
| 9 | Script the pick gesture (a bot) | Pointer events can be dispatched from the console | Works | None possible | Check the timing and shape of each stroke, rate-limit swings, flag inhuman patterns |
| 10 | The relay (one account dives, drops the bag halfway, a second carries it out) | Simulator, 100,000 shifts | Relay pair returns about a fifth of its cost | Already fixed: dropped amber is worth half to the picker, the other half goes to the Vault | Same rule |
| 11 | Two hands on the Vault piece | Dropped it, got caught with it | It returns to the Vault each time; one piece per block | Already fixed | Same rule |
| 12 | Drain the Vault with many accounts | Simulator: 10 Vault runners racing every block | Each runner gets back 8–31% of the cost | Nothing needed: racing loses | Same rule |
| 13 | The mine pays out more than came in | Simulator, all strategies and crowds | Never: payouts stay below what came in (seed counted) | The pot funds each block's amber | Same rule; the server holds the pot |
| 14 | Test mode (`?test`) | Speed slider, simulated blocks | Uses its own practice purse and pot, kept apart from the real ones | Nothing needed | Test mode is never served by the real shaft |

Also found by the simulator (not a cheat, a strategy): in a small shaft (10 miners), diving to levels 8–13 and picking
on the way up pays best, so a learning crowd moves to it until it pays no better than the rest. With 50 and 200 miners
no strategy stands out.
