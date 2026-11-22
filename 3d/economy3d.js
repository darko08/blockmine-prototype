// BLOCKMINE 3D: where every point goes (the money table in the brief). One point = one satoshi; no real money anywhere.
// The pot pays for all amber in the mine and never pays out more than it holds. Used by the page (a practice mine kept
// in this browser), the simulator and the server (where it is the only one that counts).
(function (root) {
  function Economy(R, saved) {
    const e = Object.assign({ pot: R.seedPot, vault: R.seedVault, studio: 0, counter: 0, seeded: R.seedPot, paidIn: 0, paidOut: 0 }, saved || {});

    // a block opens: the amber it may place. Never more than the pot holds.
    e.budget = () => Math.floor(Math.max(0, e.pot) * R.budgetShareOfPot);

    // a player buys lamps, oil or the kit: the money is split by the table and the pot grows
    e.sale = (points) => {
      e.paidIn += points;
      e.pot += points * R.salesTo.pot; e.vault += points * R.salesTo.vault;
      e.counter += points * R.salesTo.counter; e.studio += points * R.salesTo.studio;
    };
    // a bag carried past the hatch: amber leaves the pot (the miner keeps 90%, the studio 10%); a Vault piece leaves
    // the Vault the same way. Returns the points the miner keeps.
    e.carriedOut = (amber, vaultPiece) => {
      const fromPot = Math.min(amber, e.pot), fromVault = Math.min(vaultPiece || 0, e.vault);
      e.pot -= fromPot; e.vault -= fromVault;
      const kept = Math.floor((fromPot + fromVault) * R.carriedOutTo.miner);
      e.studio += fromPot + fromVault - kept; e.paidOut += kept;
      return kept;
    };
    // the knock caught a miner below: what his bag held is split (half stays in the pot, 40% to the Vault, 10% studio)
    e.caught = (amber) => {
      const v = Math.min(amber, e.pot);
      e.pot -= v; e.pot += v * R.caughtTo.pot; e.vault += v * R.caughtTo.vault; e.studio += v * R.caughtTo.studio;
    };
    // a piece of amber dropped and picked up by someone else is worth half; the other half leaves the pot for the Vault
    e.dropped = (amber) => { const half = Math.floor(amber * (1 - R.droppedAmberToPicker)); e.pot -= half; e.vault += half; return amber - half; };
    // the Vault piece is worth a fair share of what the Vault holds when it is carried out
    e.vaultPieceValue = () => Math.floor(e.vault * R.vaultPieceShare);
    // has the mine ever paid out more than came in (the seed counts as in)?
    e.check = () => ({ ok: e.paidOut <= e.paidIn + e.seeded, paidIn: e.paidIn, seeded: e.seeded, paidOut: e.paidOut, pot: e.pot, vault: e.vault, studio: e.studio, counter: e.counter });
    e.toJSON = () => ({ pot: e.pot, vault: e.vault, studio: e.studio, counter: e.counter, seeded: e.seeded, paidIn: e.paidIn, paidOut: e.paidOut });
    return e;
  }

  // a player's own purse: points, lamps, and the shift he is on
  function Purse(R, saved) {
    const p = Object.assign({ points: R.startPoints, lamps: 0, hasKit: false }, saved || {});
    p.canBuyKit = () => !p.hasKit && p.points >= R.kitPrice;
    p.buyKit = (eco) => { if (!p.canBuyKit()) return false; p.points -= R.kitPrice; p.lamps += R.kitLamps; p.hasKit = true; eco.sale(R.kitPrice); return true; };
    p.buyLamp = (eco) => { if (!p.hasKit || p.points < R.lampPrice) return false; p.points -= R.lampPrice; p.lamps += 1; eco.sale(R.lampPrice); return true; };
    p.buyOil = (eco, measures) => { const n = Math.max(0, measures | 0); if (p.points < n * R.oilPrice) return false; p.points -= n * R.oilPrice; eco.sale(n * R.oilPrice); return true; };
    p.toJSON = () => ({ points: p.points, lamps: p.lamps, hasKit: p.hasKit });
    return p;
  }

  root.Economy3 = { Economy, Purse };
  if (typeof module !== 'undefined') module.exports = root.Economy3;
})(typeof window !== 'undefined' ? window : globalThis);
