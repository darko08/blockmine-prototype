// Retunes the first-guess numbers until the strategies even out: runs the simulator, compares each depth band's diver
// returns (and the Vault runner's) with the median of all strategies, and nudges the drop table's amber ratios and
// the Vault piece's share toward it. Writes the result to sim3d/tuned.json.
//   node sim3d/tune.js [rounds=10] [shifts=3000]
const { Worker } = require('worker_threads');
const fs = require('fs'), path = require('path');
const R = require('../3d/rules3d.js');
const rounds = +(process.argv[2] || 10), shifts = +(process.argv[3] || 3000);
const crowds = [10, 50, 200];
const file = path.join(__dirname, 'strategies.js');
let o = { amberRatio: R.amberRatio.slice(), vaultPieceShare: R.vaultPieceShare };
let vf = 1;   // how much of the money table's flow into the Vault to keep (the rest stays in the pot)
const vaultFlow = (f) => ({ salesTo: { pot: 0.85 + 0.05 * (1 - f), vault: 0.05 * f, counter: 0.10, studio: 0 }, caughtTo: { pot: 0.5 + 0.4 * (1 - f), vault: 0.4 * f, studio: 0.1 } });
const run = (overrides, seed) => Promise.all(crowds.map((miners) => new Promise((res, rej) => {
  const w = new Worker(file, { workerData: { miners, shifts, seed, overrides } }); w.on('message', res); w.on('error', rej);
})));
const median = (a) => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const EXCLUDE = new Set(['diver 15', 'shallow farmer']);   // no satoshis by design: level 15 holds only the Vault; farming is materials only
(async () => {
  for (let r = 1; r <= rounds; r++) {
    const res = await run({ ...o, ...vaultFlow(vf) }, 'tune-' + r);
    const avg = (name) => res.reduce((a, c) => a + c.strategies[name].returnRatio, 0) / res.length;
    const names = Object.keys(res[0].strategies).filter((n) => !EXCLUDE.has(n));
    const all = names.map(avg), target = median(all);
    const tierRet = [0, 1, 2, 3, 4].map((t) => {
      const lv = [[1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11, 12], [13, 14]][t];
      return lv.reduce((a, L) => a + avg('diver ' + L), 0) / lv.length;
    });
    const vault = avg('vault runner'), spread = Math.max(...all) / target;
    console.log(`round ${r}: median ${(target * 100).toFixed(0)}% · tiers ${tierRet.map((v) => (v * 100).toFixed(0) + '%').join(' ')} · vault ${(vault * 100).toFixed(0)}% · best/median ${spread.toFixed(2)} · ratios ${o.amberRatio.map((v) => v.toFixed(0)).join('/')} · vault flow x${vf.toFixed(3)}`);
    const step = (want, have) => Math.min(1.6, Math.max(0.6, Math.pow(want / Math.max(have, 0.01), 0.6)));
    o.amberRatio = o.amberRatio.map((v, t) => v * step(target, tierRet[t]));
    const k = 20 / o.amberRatio[0]; o.amberRatio = o.amberRatio.map((v) => v * k);   // keep level 1-3 at 20 (only ratios matter)
    vf = Math.min(1, Math.max(0.005, vf * step(target, vault)));
  }
  o.amberRatio = o.amberRatio.map((v) => Math.round(v));
  Object.assign(o, vaultFlow(Math.round(vf * 1000) / 1000)); o.vaultFlow = Math.round(vf * 1000) / 1000;
  fs.writeFileSync(path.join(__dirname, 'tuned.json'), JSON.stringify(o, null, 1));
  console.log('tuned', JSON.stringify(o));
})();
