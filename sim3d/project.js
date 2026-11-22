// BLOCKMINE projection: the money and the drops for a crowd size, from the simulator (the learning crowd, the final numbers).
//   node sim3d/project.js [--crowds=100,200,500] [--blocks=1500]
// For each crowd: what players pay in per block and per day, where it goes (miners, the studio, the Order's counter, the
// Vault, the pot), and per level what drops (amber pieces and their sats, materials), what regrows and what is taken.
'use strict';
const { Worker } = require('worker_threads'), path = require('path'), fs = require('fs');
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const CROWDS = arg('crowds', '100,200,500').split(',').map(Number), BLOCKS = +arg('blocks', 1500);
const overrides = JSON.parse(fs.readFileSync(path.join(__dirname, 'tuned.json'), 'utf8'));
const STRATS = 24;   // names in the simulator; every one keeps at least 2% of the crowd
const run = (miners) => new Promise((res, rej) => {
  // shifts per strategy so the rarest strategy (2% of the crowd) gives about BLOCKS measured blocks
  const shifts = Math.max(200, Math.round(BLOCKS * miners * 0.02));
  const w = new Worker(path.join(__dirname, 'strategies.js'), { workerData: { miners, shifts, seed: 'projection', overrides } });
  w.on('message', res); w.on('error', rej);
});
(async () => {
  const t0 = Date.now();
  const results = await Promise.all(CROWDS.map(run));
  fs.writeFileSync(path.join(__dirname, 'projection.json'), JSON.stringify(results.map((r) => ({ miners: r.miners, blocks: r.blocks, books: r.books, levels: r.levels })), null, 1));
  const f = (v) => Math.round(v).toLocaleString('en');
  for (const r of results) {
    const b = r.books, d = (k) => b.end[k] - b.start[k], perDay = 86400 / b.secs, n = b.blocks;
    console.log(`\n=== ${r.miners} miners per block · ${f(n)} blocks measured · average block ${f(b.secs / n)} s`);
    const rows = [
      ['lamps sold', b.lamps], ['oil measures sold', b.oil], ['paid in (lamps + oil)', d('paidIn')],
      ['to miners (kept, past the hatch)', b.kept], ['  of which Vault pieces', b.vaultPaid * 0.9],
      ['to the studio', d('studio')], ['to the Order\'s counter', d('counter')],
      ['Vault grew by', d('vault')], ['pot grew by', d('pot')],
    ];
    for (const [k, v] of rows) console.log(`${k.padEnd(36)} per block ${f(v / n).padStart(10)}   per day ${f(v * perDay).padStart(14)}`);
    console.log(`shifts: ${f(b.out)} out, ${f(b.caught)} caught (${(b.caught / (b.out + b.caught) * 100).toFixed(1)}%) · average block budget ${f(b.budget / n)} sats of amber`);
  }
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} s`);
})();
