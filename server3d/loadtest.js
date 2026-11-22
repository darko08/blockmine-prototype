// Load test for the shared shaft: starts a fresh server for each crowd size and fills it with bot miners that play by
// the rules (down the ladders at legal speed, pick the ore their lamp shows, climb out), plus a few cheaters who try to
// teleport. Reports what the server and each miner's connection had to carry.
//   node server3d/loadtest.js [--miners=10,50,200] [--secs=90] [--block=45]
'use strict';
const { spawn } = require('child_process'), path = require('path'), fs = require('fs'), os = require('os');
globalThis.window = globalThis;
require('../js/rng.js'); require('../cutaway/settings.js');
const R = require('../3d/rules3d.js'), MineGen = require('../3d/mine3d.js');
const S = globalThis.SETTINGS, T = S.tile;
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const CROWDS = arg('miners', '10,50,200').split(',').map(Number), SECS = +arg('secs', 90), BLOCK = +arg('block', 45);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function bot(port, i, cheater, out) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const b = { place: null, mine: null, G: null, bag: [], known: new Map(), goal: 'down', target: 3 + (i % 11), mining: null, lastStroke: 0,
    shift: false, hatch: 'waiting', snaps: 0, bytes: 0, rtt: [], kept: 0, caught: 0, banked: 0, wander: null, t0: Date.now() };
  const send = (m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
  const w = () => b.bag.reduce((a, it) => a + it.weight, 0);
  ws.onopen = () => send({ t: 'hello' });
  ws.onmessage = (ev) => {
    b.bytes += ev.data.length;
    const m = JSON.parse(ev.data);
    if (m.t === 'welcome') { send({ t: 'buy', item: 'kit' }); }
    else if (m.t === 'block') { if (m.mine) { b.mine = Object.assign({ S, R, G: MineGen.geometry(S, R) }, m.mine); b.G = b.mine.G; } b.hatch = m.hatch; b.known.clear(); }
    else if (m.t === 'knock') { b.hatch = 'shut'; }
    else if (m.t === 'state') { b.hatch = m.hatch; for (const n of m.nodes || []) b.known.set(n.id, n); for (const id of m.gone || []) b.known.delete(id); }
    else if (m.t === 'entered') { b.shift = true; b.place = m.place; b.bag = []; b.goal = 'down'; b.target = 1 + Math.floor(Math.random() * 6); b.start = Date.now(); }
    else if (m.t === 'got') { b.bag = m.bag; b.known.delete(m.id); b.mining = null; }
    else if (m.t === 'bag') { b.bag = m.bag; }
    else if (m.t === 'snap') { b.snaps++; b.place = m.place; b.mining = null; }
    else if (m.t === 'banked') { b.shift = false; b.banked++; b.kept += m.kept; b.bag = []; }
    else if (m.t === 'caught') { b.shift = false; b.caught++; b.bag = []; b.mining = null; }
    else if (m.t === 'purse') { if (m.purse.lamps < 1 && m.purse.points >= R.lampPrice) send({ t: 'buy', item: 'lamp' }); }
    else if (m.t === 'pong') { b.rtt.push(Date.now() - m.c); }
  };
  ws.onerror = () => {};
  const step = (dt) => {
    if (!b.mine) return;
    if (!b.shift) { if (b.hatch === 'open' && Math.random() < 0.05) { send({ t: 'buy', item: 'lamp' }); send({ t: 'enter' }); } return; }
    const G = b.G, m = b.mine, p = b.place, walk = S.runSpeed * 0.95;
    if (cheater && Math.random() < dt / 8) { send({ t: 'pos', p: { l: 13, x: G.colX(m.ladders[13].c) } }); return; }   // a teleport
    if (b.mining) { if (Date.now() - b.lastStroke > 380) { b.lastStroke = Date.now(); send({ t: 'stroke', id: b.mining }); } return; }
    const toward = (x) => { const d = x - p.x, s = walk * dt; if (Math.abs(d) <= s) { p.x = x; return true; } p.x += Math.sign(d) * s; return false; };
    if (p.k !== undefined) {   // on a ladder
      const d = m.ladders[p.k], y0 = G.floorY(d.top), y1 = G.floorY(d.bottom);
      if (b.goal === 'down') { p.y = Math.min(y1, p.y + S.slideSpeed * 0.95 * dt); if (p.y >= y1) b.place = { l: d.bottom, x: G.colX(d.c) }; }
      else { p.y = Math.max(y0, p.y - S.climbSpeed * R.climbFactor(w(), S) * 0.95 * dt); if (p.y <= y0) b.place = { l: d.top, x: G.colX(d.c) }; }
    } else if (b.goal === 'down' && p.l < b.target) {
      const k = m.ladders.findIndex((d) => d.top === p.l); if (k < 0) { b.goal = 'up'; return; }
      if (toward(G.colX(m.ladders[k].c))) b.place = { k, y: G.floorY(p.l) };
    } else if (b.goal === 'down') {
      // at the target level: the nearest amber his lamp has shown, else wander; leave when the bag is fullish or late
      const n = [...b.known.values()].filter((q) => q.l === p.l && q.kind !== 'vault' && w() + q.weight <= R.bagCapacity).sort((a, c) => Math.abs(a.standX - p.x) - Math.abs(c.standX - p.x))[0];
      if ((Date.now() - b.start) / 1000 > 50 || w() > 20) { b.goal = 'up'; return; }
      if (n) { if (toward(n.standX)) { b.mining = n.id; b.lastStroke = 0; send({ t: 'pick', id: n.id }); } }
      else { const [a, c] = MineGen.span(m, p.l); if (b.wander === null || Math.abs(b.wander - p.x) < 2) b.wander = a + Math.random() * (c - a); toward(b.wander); }
    } else {
      const k = m.ladders.findIndex((d) => d.bottom === p.l); if (k < 0) return;
      if (toward(G.colX(m.ladders[k].c))) b.place = { k, y: G.floorY(p.l) };
    }
    send({ t: 'pos', p: b.place, f: 1 });
  };
  const iv = setInterval(() => step(0.1), 100);
  const pv = setInterval(() => send({ t: 'ping', c: Date.now() }), 2000);
  out.push(b);
  return () => { clearInterval(iv); clearInterval(pv); try { ws.close(); } catch (e) {} };
}

async function crowd(miners, port) {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-load-'));
  const srv = spawn(process.execPath, [path.join(__dirname, 'server.js'), '--port=' + port, '--data=' + data, '--test-blocks=' + BLOCK, '--static='], { stdio: ['ignore', 'pipe', 'inherit'] });
  await sleep(800);
  const bots = [], stops = [];
  for (let i = 0; i < miners; i++) { stops.push(bot(port, i, i % 20 === 19, bots)); if (i % 20 === 19) await sleep(50); }
  const t0 = process.cpuUsage, start = Date.now();
  const samples = [];
  for (let s = 0; s < SECS; s += 5) {
    await sleep(5000);
    try { samples.push(await (await fetch(`http://127.0.0.1:${port}/api/health`)).json()); } catch (e) {}
  }
  const h = samples[samples.length - 1] || {};
  stops.forEach((f) => f()); srv.kill('SIGTERM'); await sleep(300);
  fs.rmSync(data, { recursive: true, force: true });
  const secs = (Date.now() - start) / 1000, honest = bots.filter((b, i) => i % 20 !== 19), cheats = bots.filter((b, i) => i % 20 === 19);
  const rtt = bots.flatMap((b) => b.rtt).sort((a, c) => a - c), q = (f) => rtt.length ? rtt[Math.min(rtt.length - 1, Math.floor(rtt.length * f))] : 0;
  const peak = samples.reduce((a, s) => Math.max(a, s.below || 0), 0);
  return {
    miners, secs: Math.round(secs), blocks: h.stats && h.stats.blocks, peakBelow: peak,
    tickAvgMs: h.stats && +h.stats.tickMs.toFixed(2), tickMaxMs: h.stats && +h.stats.tickMax.toFixed(1),
    rssMB: h.mem && Math.round(h.mem.rss / 1048576), cpuPct: h.cpu, kbPerMinerPerSec: +(bots.reduce((a, b) => a + b.bytes, 0) / bots.length / secs / 1024).toFixed(1),
    rttP50: q(0.5), rttP95: q(0.95), rttMax: rtt[rtt.length - 1] || 0,
    honestSnaps: honest.reduce((a, b) => a + b.snaps, 0), cheaterSnaps: cheats.reduce((a, b) => a + b.snaps, 0), cheaters: cheats.length,
    banked: bots.reduce((a, b) => a + b.banked, 0), caught: bots.reduce((a, b) => a + b.caught, 0), satsKept: bots.reduce((a, b) => a + b.kept, 0),
    rejectedMoves: h.stats && h.stats.rejectedMoves, potNeverOverpaid: h.check,
  };
}
(async () => {
  const rows = [];
  for (let i = 0; i < CROWDS.length; i++) { const r = await crowd(CROWDS[i], 5390 + i); rows.push(r); console.log(JSON.stringify(r)); }
  console.log('\nminers  peak below  tick avg/max ms  server RSS  CPU  KB/s per miner  ping p50/p95/max ms  honest snaps  cheater snaps  banked  caught');
  for (const r of rows) console.log(`${String(r.miners).padStart(6)}  ${String(r.peakBelow).padStart(10)}  ${String(r.tickAvgMs + ' / ' + r.tickMaxMs).padStart(15)}  ${String(r.rssMB + ' MB').padStart(10)}  ${String(r.cpuPct + '%').padStart(4)}  ${String(r.kbPerMinerPerSec).padStart(14)}  ${String(r.rttP50 + ' / ' + r.rttP95 + ' / ' + r.rttMax).padStart(19)}  ${String(r.honestSnaps).padStart(12)}  ${String(r.cheaterSnaps + ' of ' + r.cheaters).padStart(13)}  ${String(r.banked).padStart(6)}  ${String(r.caught).padStart(6)}`);
})();
