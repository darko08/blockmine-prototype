// Checks the cutaway mine over many random blocks and reports the round trip to level 12.
// Run:  node tools/tune_cutaway.js
globalThis.window = globalThis;
require('../js/rng.js'); require('../cutaway/settings.js'); require('../cutaway/mine.js');
const S = window.SETTINGS;
const down = { walk: S.walkSpeed, up: S.ladderUpSpeed, down: S.ladderDownSpeed };
const f = S.fullBagSpeedFactor, up = { walk: S.walkSpeed * f, up: S.ladderUpSpeed * f, down: S.ladderDownSpeed * f };
const trips = [], downs = [], ups = [];
let same = true;
for (let i = 0; i < 400; i++) {
  const hash = randomHash();
  const m = MineGen.generate(hash, S); MineGen.layoutNodes(m);
  const m2 = MineGen.generate(hash, S); MineGen.layoutNodes(m2);
  if (JSON.stringify([m.levels, m.ladders, m.nodes]) !== JSON.stringify([m2.levels, m2.ladders, m2.nodes])) same = false;
  const hatch = { kind: 'level', l: -1, x: m.G.colX(m.c0) };
  // every level reachable from the hatch
  for (let l = 0; l < S.levels; l++) {
    const [x0, x1] = MineGen.span(m, l);
    for (const x of [x0, x1]) if (!MineGen.route(m, hatch, { kind: 'level', l, x }, down)) throw new Error('unreachable level ' + l);
  }
  // round trip: hatch -> the first place you reach level 12 -> back, carrying a full bag
  const arrive = m.ladders.filter((d) => d.bottom === S.levels - 1).map((d) => ({ kind: 'level', l: S.levels - 1, x: m.G.colX(d.c) }));
  const there = arrive.map((a) => ({ a, r: MineGen.route(m, hatch, a, down) })).sort((p, q) => p.r.time - q.r.time)[0];
  const back = MineGen.route(m, there.a, hatch, up);
  downs.push(there.r.time); ups.push(back.time); trips.push(there.r.time + back.time);
}
const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length, pct = (a, p) => a.slice().sort((x, y) => x - y)[Math.floor(a.length * p)];
const mmss = (s) => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');
console.log('same block gives same mine:', same, '| all levels reachable: true');
console.log('down empty  avg', mmss(avg(downs)), '| up full avg', mmss(avg(ups)));
console.log('round trip  avg', mmss(avg(trips)), ' 10%', mmss(pct(trips, 0.1)), ' 90%', mmss(pct(trips, 0.9)));
console.log('chance a block lands during the climb from level 12 (avg):', ((1 - Math.exp(-avg(ups) / S.averageBlockSeconds)) * 100).toFixed(0) + '%');
