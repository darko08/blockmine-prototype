// BLOCKMINE strategy simulator: plays the mine with no screen, using the game's own rules (3d/rules3d.js), mine
// (3d/mine3d.js) and money (3d/economy3d.js). Blocks arrive at random, ten minutes apart on average.
//
// For each crowd size (miners below at once) one shared mine runs block after block with one pot, Vault and studio.
// Every shift each miner draws one strategy, so all strategies play in the same mine against the same pot, and each
// gets at least SHIFTS shifts. Reports, per strategy: share caught, satoshis kept per lamp, best and worst hundredth,
// time below; then checks the brief's pass rules.
//
//   node sim3d/strategies.js [shiftsPerStrategy=100000] [--crowds=10,50,200] [--json=out.json]
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const path = require('path');
globalThis.window = globalThis;
require('../js/rng.js'); require('../cutaway/settings.js');
const R = require('../3d/rules3d.js'); const MineGen = require('../3d/mine3d.js'); const { Economy } = require('../3d/economy3d.js');
const S = globalThis.SETTINGS, T = S.tile;

// ---------- the strategies ----------
// each is a plan: {dive, pickDown, pickUp, kinds, outBy, dropAfter, vault, oil}
const STRATS = {};
for (let L = 1; L <= 15; L++) STRATS['diver ' + L] = { dive: L - 1, kinds: ['amber'], fill: true };   // amber only: materials earn nothing until the counter opens
STRATS['shallow farmer'] = { dive: 3, kinds: ['coal', 'iron'], fill: true, levels: [0, 3], materialsOnly: true };
STRATS['top skimmer'] = { dive: 0, kinds: ['amber'], outBy: 55 };
STRATS['picks on the way down'] = { dive: [6, 12], kinds: ['amber'], pickDown: true, fill: true };
STRATS['picks on the way up'] = { dive: [8, 13], kinds: ['amber'], pickUp: true, fill: true };
STRATS['dropper'] = { dive: [8, 13], kinds: ['amber'], fill: true, dropAfter: 270, dropTo: 16 };
STRATS['vault runner'] = { dive: 14, vault: true };
STRATS['wide light (4 oil)'] = { dive: [4, 11], kinds: ['amber'], fill: true, oil: 4 };
STRATS['basic light'] = { dive: [4, 11], kinds: ['amber'], fill: true, oil: 0 };
STRATS['relay pair'] = { relay: true };   // two accounts: one fills deep and drops halfway, the other carries it out
const NAMES = process.env.ONLY ? process.env.ONLY.split(',') : Object.keys(STRATS);

// ---------- helpers ----------
const mv = R.movement(S), walkSpeed = mv.runSpeed, ladderDown = mv.ladderSec;
const ladderUp = (w) => R.climbSecondsPerLevel(w) - mv.walkSec;   // a ladder up with weight w
const SWING_SEC = 1.3, SETUP_SEC = 1.5;
function rngFrom(seed) { return globalThis.seededRandom(String(seed)); }
const ADAPT = process.env.ADAPT !== '0', SHARE_FLOOR = +(process.env.SHARE_FLOOR || 0.02);
function expo(rng, mean) { return -Math.log(1 - rng()) * mean; }
function gauss(rng) { return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng()); }

// a pool of mine layouts per crowd size (layout is slow; values are rescaled to each block's budget)
function makePool(miners, count, seed) {
  const pool = [];
  for (let i = 0; i < count; i++) {
    const m = MineGen.generate(seed + '|pool|' + miners + '|' + i, S, R, miners);
    MineGen.layoutTerrain(m); MineGen.layoutNodes(m, 1e6);
    const G = m.G, levels = m.levels.map((seg, l) => {
      const down = m.ladders.find((d) => d.top === l), up = m.ladders.find((d) => d.bottom === l);
      return { a: seg.a * T, b: (seg.b + 1) * T, down: down ? G.colX(down.c) : null, up: G.colX(up.c) };
    });
    const base = m.nodes.filter((n) => n.kind !== 'vault').map((n) => ({ l: n.l, x: n.standX, kind: n.kind, ratio: n.kind === 'amber' ? (n.rich ? -1 : R.amberRatio[n.tier]) : 0, weight: n.weight, hard: n.hardness }));
    pool.push({ levels, base, vault: { l: m.vault.l, x: m.vault.standX } });
  }
  return pool;
}

// ---------- one crowd size ----------
function runCrowd(miners, shiftsPerStrategy, seed, vaultRace) {
  const rng = rngFrom(seed + '|crowd|' + miners);
  const eco = Economy(R);
  const pool = makePool(miners, 24, seed);
  const stats = {}; NAMES.forEach((n) => (stats[n] = { shifts: 0, caught: 0, kept: [], below: 0, reached15: 0, ahead: 0, cost: 0 }));
  let minPot = Infinity, blocks = 0;
  const warm = ADAPT ? 3000 : 300;           // blocks before measuring, so the pot (and the crowd) settles
  // the crowd learns: each strategy's share of the miners drifts toward what has paid lately (never below a floor,
  // so every strategy is still measured). With ADAPT=0 every strategy keeps an equal share.
  const share = {}, raw = {}, recent = {}; NAMES.forEach((n) => { share[n] = 1 / NAMES.length; raw[n] = 1; recent[n] = 0.5; });
  const drawName = () => { let x = rng(), acc = 0; for (const n of NAMES) { acc += share[n]; if (x < acc) return n; } return NAMES[NAMES.length - 1]; };
  const relearn = () => {
    const mean = NAMES.reduce((a, n) => a + share[n] * recent[n], 0);
    NAMES.forEach((n) => (raw[n] = Math.max(1e-9, raw[n] * Math.exp(0.5 * (recent[n] - mean)))));
    const floor = SHARE_FLOOR, free = 1 - floor * NAMES.length, sum = NAMES.reduce((a, n) => a + raw[n], 0);
    NAMES.forEach((n) => (raw[n] /= sum));
    NAMES.forEach((n) => (share[n] = floor + free * raw[n]));
  };
  const enough = () => vaultRace ? stats['vault runner'].shifts >= shiftsPerStrategy : NAMES.every((n) => stats[n].shifts >= shiftsPerStrategy);
  while (!enough() || blocks < warm) {
    blocks++;
    if (ADAPT && blocks % 20 === 0) relearn();
    const measuring = blocks > warm;
    const layout = pool[Math.floor(rng() * pool.length)];
    const B = expo(rng, R.secondsPerLevel * 0 + 600);              // the block lasts this long
    // this block's ore, valued from the pot's budget (the drop table gives the ratios)
    const budget = eco.budget(), rich = rng() < R.richLevel1Chance ? R.richLevel1Lamps * R.lampPrice : 0;
    const now = budget * (1 - R.regrowShareOfBudget) - rich;
    const ratioSum = layout.base.reduce((a, n) => a + Math.max(0, n.ratio), 0), per = Math.max(0, now) / ratioSum;
    const spread = () => Math.exp(R.amberValueSpread * gauss(rng) - R.amberValueSpread * R.amberValueSpread / 2);   // mean 1
    const nodes = layout.base.map((n, i) => ({ id: i, l: n.l, x: n.x, kind: n.kind, weight: n.weight, hard: n.hard, value: n.ratio > 0 ? Math.floor(n.ratio * per * spread()) : n.ratio < 0 ? (rich ? rich : 0) : 0, taken: false }));
    let regrowLeft = budget - nodes.reduce((a, n) => a + n.value, 0);
    const byLevel = layout.levels.map(() => []); nodes.forEach((n) => byLevel[n.l].push(n));
    // shallow regrowth during the block, from what the budget keeps back
    const regrowTimes = []; for (let t = R.regrowEverySeconds; t < B; t += R.regrowEverySeconds) regrowTimes.push(t);
    let vaultTaken = false, dropped = [];
    // the miners of this block: each draws a strategy (a relay pair takes two places)
    const crew = [];
    for (let k = 0; k < (vaultRace || 0); k++) crew.push({ name: 'vault runner', racer: true });   // the Vault race: this many runners every block
    while (crew.length < miners) {
      const name = ADAPT ? drawName() : NAMES[Math.floor(rng() * NAMES.length)];
      if (name === 'relay pair') { const depth = 9 + Math.floor(rng() * 4), half = Math.floor(depth / 2); crew.push({ name, role: 'diver', depth, half }); crew.push({ name, role: 'carrier', depth, half }); }
      else crew.push({ name });
    }
    crew.length = miners;
    // play each miner through the block, in order of their next action, so ore is taken first come, first served
    const P = crew.map((c, i) => ({ ...c, i, t: rng() * 20, l: -1, x: layout.levels[0].up, bag: [], w: 0, sats: 0, out: false, caught: false, done: false,
      plan: c.name === 'relay pair' ? (c.role === 'diver' ? { dive: c.depth, kinds: ['amber'], fill: true, relayDrop: c.half } : { dive: c.half, relayCarry: true }) : STRATS[c.name],
      seen: {}, quality: 0.55 + rng() * 0.45, below: 0, deepest: -1 }));
    P.forEach((p) => { p.oil = p.plan.oil || 0; p.start = p.t; if (Array.isArray(p.plan.dive)) p.plan = { ...p.plan, dive: p.plan.dive[0] + Math.floor(rng() * (p.plan.dive[1] - p.plan.dive[0] + 1)) }; });
    const lightAt = (p) => R.basicLight * T * (1 + R.oilWidenPerMeasure * Math.max(0, p.oil - Math.max(0, p.t - p.start) / R.oilSecondsPerMeasure));
    const regrowUpTo = (t) => {
      while (regrowTimes.length && regrowTimes[0] <= t) {
        regrowTimes.shift();
        const l = Math.floor(rng() * R.regrowTiers * 3), tier = R.tier(l), amber = rng() < 0.6, lv = layout.levels[l];
        const v = amber ? Math.floor(R.amberRatio[tier] * per) : 0;
        if (amber && (v <= 0 || v > regrowLeft)) continue;
        const kind = amber ? 'amber' : R.materials[tier][Math.floor(rng() * R.materials[tier].length)];
        const n = { id: nodes.length, l, x: lv.a + rng() * (lv.b - lv.a), kind, weight: R.weight[kind], hard: R.swingsHardness[tier], value: v, taken: false };
        if (amber) regrowLeft -= v;
        nodes.push(n); byLevel[l].push(n);
      }
    };
    const heap = [...P];
    const pop = () => { let k = 0; for (let j = 1; j < heap.length; j++) if (heap[j].t < heap[k].t) k = j; return heap.splice(k, 1)[0]; };
    while (heap.length) {
      const p = pop();
      if (p.t >= B) { if (p.l >= 0 && !p.out) p.caught = true; continue; }
      regrowUpTo(p.t);
      if (step(p)) heap.push(p);
    }
    // one step of a miner's plan: returns true while he still has something to do
    function step(p) {
      const plan = p.plan, lv = p.l >= 0 ? layout.levels[p.l] : null;
      const goTo = (x) => { p.t += Math.abs(x - p.x) / walkSpeed; p.x = x; markSeen(p); };
      const descend = () => {   // walk to the ladder down and take it: 10 s a level whatever the bag holds
        const x = p.l < 0 ? layout.levels[0].up : lv.down; goTo(x); p.t += ladderDown; p.l += 1; p.x = p.l === 0 ? layout.levels[0].up : layout.levels[p.l - 1].down; p.deepest = Math.max(p.deepest, p.l); markSeen(p);
      };
      const ascend = () => { goTo(lv.up); p.t += ladderUp(p.w); p.l -= 1; p.x = p.l >= 0 ? layout.levels[p.l].down : 0; if (p.l < 0) { p.out = true; return false; } markSeen(p); return true; };
      const room = (n) => p.w + n.weight <= R.bagCapacity;
      const pick = (n) => {   // walk to it, swing until it breaks
        n.taken = true; goTo(n.x);
        const swings = n.hard * (R.swingsHardness ? 1 : 1) * (2 + 3 * (1 - p.quality));
        p.t += SETUP_SEC + swings * SWING_SEC;
        if (p.t >= B) return;
        p.bag.push({ kind: n.kind, value: n.value, weight: n.weight }); p.w += n.weight; p.sats += n.value;
      };
      const want = (n) => !n.taken && room(n) && plan.kinds && plan.kinds.includes(n.kind);
      const nearestSeen = () => { let best = null, bd = Infinity; for (const n of byLevel[p.l]) if (want(n) && p.seen[n.id]) { const d = Math.abs(n.x - p.x); if (d < bd) { bd = d; best = n; } } return best; };
      const explore = () => {   // walk toward the nearest part of the level not yet lit
        const lit = p.lit[p.l] || [p.x, p.x], L = lightAt(p);
        const left = lit[0] - L > lv.a + 1, right = lit[1] + L < lv.b - 1;
        if (!left && !right) return false;
        const tx = (!right || (left && p.x - lit[0] < lit[1] - p.x)) ? Math.max(lv.a, lit[0] - L * 1.5) : Math.min(lv.b, lit[1] + L * 1.5);
        goTo(tx); return true;
      };
      const elapsed = p.t - p.start, outBy = plan.outBy;
      if (p.l < 0 && !p.started) { p.started = true; p.lit = {}; descend(); return true; }
      // the relay carrier waits halfway for his partner's dropped bag
      if (plan.relayCarry) {
        if (p.relayGot) return ascend();   // on his way out with his partner's bag
        if (p.l < plan.dive) { descend(); return true; }
        const bag = dropped.find((d) => d.pair === p.i - 1 && !d.taken);
        if (bag) { bag.taken = true; goTo(bag.x); for (const it of bag.items) { p.bag.push(it); p.w += it.weight; p.sats += it.value; } p.relayGot = true; }
        if (p.relayGot) return ascend();
        p.t += 5; return p.t < B;
      }
      // going down
      if (!p.turned) {
        if (plan.vault) {
          if (p.l < 14) { descend(); return true; }
          if (vaultTaken) { p.turned = true; return true; }
          // the hum gives the distance; a short probe gives the direction, then he walks to it and it shows in his light
          goTo(p.x + (layout.vault.x > p.x ? -1 : 1) * T); goTo(layout.vault.x);
          if (vaultTaken) { p.turned = true; return true; }
          vaultTaken = true; p.t += SETUP_SEC + R.swingsHardness[5] * (2 + 3 * (1 - p.quality)) * SWING_SEC;
          if (p.t < B) { p.bag.push({ kind: 'vault', value: 0, weight: R.weight.vault }); p.w += R.weight.vault; p.vault = true; }
          p.turned = true; return true;
        }
        if (plan.pickDown && p.l >= 0) { const n = nearestSeen(); if (n && Math.abs(n.x - p.x) < 6 * T) { pick(n); return true; } }
        if (p.l < plan.dive) { descend(); return true; }
        // at the target: fill the bag, exploring the tunnels for what the light shows
        if (outBy && elapsed > outBy) { p.turned = true; return true; }
        const n = nearestSeen();
        if (n) { pick(n); if (!plan.fill || p.w < R.bagCapacity - 1) return true; }
        else if (explore()) return true;
        p.turned = true; return true;
      }
      // going up (the dropper lightens the bag once he has been below long enough)
      if (plan.dropAfter && elapsed > plan.dropAfter && p.w > plan.dropTo) {
        p.bag.sort((a, b) => b.weight - a.weight);
        while (p.w > plan.dropTo && p.bag.length) { const it = p.bag.shift(); p.w -= it.weight; p.sats -= it.value; if (it.kind === 'amber') eco.dropped(it.value); }
      }
      if (plan.relayDrop !== undefined && p.l === plan.relayDrop && !p.dropped) {
        p.dropped = true;
        dropped.push({ pair: p.i, x: p.x, items: p.bag.map((it) => ({ ...it, value: it.kind === 'amber' ? eco.dropped(it.value) : it.value })), taken: false });
        p.bag = []; p.w = 0; p.sats = 0;
      }
      if (plan.pickUp && p.l >= 0) { const n = nearestSeen(); if (n && Math.abs(n.x - p.x) < 5 * T) { pick(n); return true; } }
      if (outBy && p.l === 0 && p.w === 0) { const n = nearestSeen(); if (n && elapsed < outBy) { pick(n); return true; } }
      return ascend();
    }
    function markSeen(p) {
      if (p.l < 0) return;
      const L = lightAt(p), lit = p.lit[p.l] || (p.lit[p.l] = [p.x, p.x]);
      lit[0] = Math.min(lit[0], p.x); lit[1] = Math.max(lit[1], p.x);
      for (const n of byLevel[p.l]) if (n.x >= lit[0] - L && n.x <= lit[1] + L) p.seen[n.id] = 1;
    }
    // settle the block: bags out, bags caught
    for (const p of P) {
      p.below = Math.min(p.t, B) - p.start;
      const amber = p.bag.reduce((a, it) => a + (it.kind === 'amber' ? it.value : 0), 0);
      let kept = 0;
      if (p.out) kept = eco.carriedOut(amber, p.vault ? eco.vaultPieceValue() : 0);
      else if (p.started) { p.caught = true; eco.caught(amber); }
      const cost = R.lampPrice + (p.oil || 0) * R.oilPrice;
      eco.sale(cost);
      minPot = Math.min(minPot, eco.pot);
      recent[p.name] += 0.01 * (kept / cost - recent[p.name]);
      if (!measuring) continue;
      if (vaultRace && !p.racer) continue;   // in the race, only the racers are measured
      const st = stats[p.name];
      st.shifts++; st.cost += cost; st.kept.push(p.name === 'relay pair' ? kept : kept); st.below += p.below;
      if (p.caught) st.caught++;
      if (p.deepest >= 14) st.reached15++;
      if (kept > cost) st.ahead++;
    }
  }
  // summarise
  const out = { miners, blocks, minPot, eco: eco.check(), share: { ...share }, strategies: {} };
  for (const n of NAMES) {
    const st = stats[n], k = st.kept.sort((a, b) => a - b), N = k.length;
    const mean = k.reduce((a, b) => a + b, 0) / N, costPer = st.cost / st.shifts;
    const hundredth = Math.max(1, Math.floor(N / 100));
    out.strategies[n] = {
      shifts: N, caught: st.caught / N, keptPerLamp: mean, costPerLamp: costPer, returnRatio: mean / costPer,
      worst1: k.slice(0, hundredth).reduce((a, b) => a + b, 0) / hundredth, best1: k.slice(N - hundredth).reduce((a, b) => a + b, 0) / hundredth,
      below: st.below / N, reached15: st.reached15 / N, ahead: st.ahead / N,
    };
  }
  return out;
}

function applyOverrides(o) { for (const [k, v] of Object.entries(o || {})) R[k] = v; }
module.exports = { runCrowd, applyOverrides, NAMES, report };
if (!isMainThread) {
  applyOverrides(workerData.overrides);
  parentPort.postMessage(runCrowd(workerData.miners, workerData.shifts, workerData.seed, workerData.vaultRace));
} else if (require.main === module) {
  const args = process.argv.slice(2);
  const shifts = +(args.find((a) => /^\d+$/.test(a)) || 100000);
  const crowds = (args.find((a) => a.startsWith('--crowds=')) || '--crowds=10,50,200').slice(9).split(',').map(Number);
  const jsonOut = (args.find((a) => a.startsWith('--json=')) || '').slice(7);
  const seed = 'blockmine-sim-1';
  const t0 = Date.now();
  const overrides = process.env.OVERRIDES ? JSON.parse(require('fs').readFileSync(process.env.OVERRIDES, 'utf8')) : null;
  const job = (miners, vaultRace) => new Promise((res, rej) => {
    const w = new Worker(__filename, { workerData: { miners, shifts, seed, overrides, vaultRace } }); w.on('message', res); w.on('error', rej);
  });
  const races = [];
  for (const miners of crowds) for (const k of [1, 10]) if (k < miners) races.push({ miners, k });
  Promise.all([...crowds.map((m) => job(m, 0)), ...races.map((r) => job(r.miners, r.k))]).then((all) => {
    const results = all.slice(0, crowds.length);
    results.races = races.map((r, i) => ({ ...r, s: all[crowds.length + i].strategies['vault runner'] }));
    if (jsonOut) require('fs').writeFileSync(jsonOut, JSON.stringify({ rules: R, results }, null, 1));
    report(results, shifts, (Date.now() - t0) / 1000);
  });
}

function report(results, shifts, secs) {
  const f = (v, d = 0) => v.toLocaleString('en', { maximumFractionDigits: d, minimumFractionDigits: d });
  let allPass = true;
  for (const r of results) {
    console.log(`\n=== ${r.miners} miners below · ${f(r.blocks)} blocks · pot low ${f(r.minPot)} · paid out ${f(r.eco.paidOut)} of ${f(r.eco.paidIn + r.eco.seeded)} in (seed incl.) · ${r.eco.ok ? 'never paid more than came in' : 'PAID MORE THAN CAME IN'}`);
    console.log('strategy'.padEnd(24) + 'caught  kept/lamp  return  worst1%  best1%   below  reach15  ahead');
    for (const [n, s] of Object.entries(r.strategies)) {
      console.log(n.padEnd(24) + (f(s.caught * 100, 1) + '%').padStart(6) + f(s.keptPerLamp).padStart(11) + (f(s.returnRatio * 100) + '%').padStart(8) + f(s.worst1).padStart(9) + f(s.best1).padStart(8) + (f(s.below) + 's').padStart(8) + (f(s.reached15 * 100) + '%').padStart(9) + (f(s.ahead * 100) + '%').padStart(7));
    }
    const ss = Object.entries(r.strategies), returns = ss.map(([, s]) => s.returnRatio).sort((a, b) => b - a);
    const med = returns[Math.floor(returns.length / 2)];
    const SH = ['diver 1', 'diver 2', 'diver 3', 'top skimmer'].filter((n) => r.strategies[n]);
    const shallowAhead = SH.reduce((a, n) => a + r.strategies[n].ahead, 0) / Math.max(1, SH.length);
    const checks = {
      'never pays out more than the pot holds': r.eco.ok && r.minPot >= 0,
      'no strategy returns more than it costs': ss.every(([, s]) => s.returnRatio < 1),
      'no strategy beats the others by more than a tenth (best within 10% of the second best)': returns[0] <= returns[1] * 1.1,
      'about one shallow run in four slightly ahead (levels 1-3 and the top skimmer, 15-35%)': shallowAhead >= 0.15 && shallowAhead <= 0.35,
      'a basic lamp reaches level 15 in a real share (diver 15 >= 30%)': r.strategies['diver 15'] && r.strategies['diver 15'].reached15 >= 0.3,
    };
    for (const [k, v] of Object.entries(checks)) { console.log((v ? 'PASS ' : 'FAIL ') + k); if (!v) allPass = false; }
    console.log(`best ${f(returns[0] * 100)}% · second ${f(returns[1] * 100)}% · median ${f(med * 100)}% · shallow runs ahead ${f(shallowAhead * 100)}%`);
    if (r.share) console.log('crowd learned: ' + Object.entries(r.share).sort((a, b) => b[1] - a[1]).map(([n, v]) => `${n} ${f(v * 100)}%`).join(' · '));
  }
  if (results.races) {
    console.log('\n=== the Vault race: one runner alone vs ten racing for the one piece each block');
    for (const r of results.races) console.log(`${String(r.miners).padStart(4)} miners · ${String(r.k).padStart(2)} vault runner${r.k > 1 ? 's' : ' '} · return ${f(r.s.returnRatio * 100)}% · caught ${f(r.s.caught * 100, 1)}% · ahead ${f(r.s.ahead * 100, 1)}% · best1% ${f(r.s.best1)}`);
  }
  console.log(`\n${allPass ? 'ALL CHECKS PASS' : 'SOME CHECKS FAIL'} · ${f(shifts)} shifts per strategy per crowd · ${f(secs, 1)} s`);
}
