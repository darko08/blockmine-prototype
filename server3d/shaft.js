// BLOCKMINE: the one shared shaft. The server decides everything: where a miner can be, what his lamp shows him, what
// he breaks, what his bag holds, who is caught when the block lands and what is paid. The page only draws it and sends
// what the player does. Uses the game's own rules (3d/rules3d.js), mine (3d/mine3d.js) and money (3d/economy3d.js).
'use strict';
const crypto = require('crypto');
globalThis.window = globalThis;
require('../js/rng.js'); require('../cutaway/settings.js');
const R = require('../3d/rules3d.js'), MineGen = require('../3d/mine3d.js'), { Economy, Purse } = require('../3d/economy3d.js');
const S = globalThis.SETTINGS, T = S.tile;

const SEND_EVERY = 0.2;            // s between state messages to each miner
const NEAR = 18 * T;               // other miners nearer than this are drawn in full; the rest as points of light
const NEAR_MAX = 12;               // at most this many drawn in full (the nearest)
const FAR_EVERY = 1;               // s between updates of the far lights
const GLIMMER = 3;                 // ore glimmers (no kind, no value) out to this many times the light
const SLACK = 0.35;                // s of network jitter forgiven on every move
const MAX_MSGS = 40;               // per second per miner; more are dropped
const STROKE_GAP = 0.3;            // s: the quickest a person drags along a crack again
const hmac = (key, s) => crypto.createHmac('sha256', key).update(s).digest('hex');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

class Shaft {
  constructor(store, opts = {}) {
    this.store = store; this.opts = opts;
    this.eco = Economy(R, store.get('economy'));
    this.secret = store.get('secret') || crypto.randomBytes(32).toString('hex');
    store.set('secret', this.secret);
    this.players = new Map();       // token -> player (kept while the server runs; the purse is stored)
    this.conns = new Set();
    this.mine = null; this.hatch = 'waiting'; this.block = null; this.prev = null;
    this.vaultLog = []; this.vaultSeq = 0;   // what flowed in and out of the Vault, for everyone's screen
    this.clock = 0; this.stats = { blocks: 0, caught: 0, banked: 0, rejectedMoves: 0, msgs: 0, tickMs: 0, tickMax: 0 };
  }

  // ---------- blocks ----------
  onBlock(b) {
    if (this.block && b.height <= this.block.height) return;
    const first = !this.block;
    // the knock: everyone still below is caught; then the hatch shuts for a moment and a new mine opens
    if (!first) {
      for (const p of this.players.values()) if (p.shift && this.below(p)) this.caught(p);
      this.stats.blocks++;
    }
    const minersBelow = [...this.players.values()].filter((p) => p.conn && p.purse.hasKit).length;
    this.prev = this.block && { height: this.block.height, seed: this.block.seed, commit: this.block.commit };
    const seed = hmac(this.secret, b.hash);
    this.block = { height: b.height, hash: b.hash, seed, commit: sha(seed), arrivedAt: Date.now(), minersBelow };
    this.hatch = first ? 'open' : 'shut';
    this.broadcast({ t: 'knock', height: b.height, first });
    const open = () => {
      this.mine = MineGen.generate(seed, S, R, minersBelow);
      MineGen.layoutTerrain(this.mine); MineGen.layoutNodes(this.mine, this.eco.budget());
      this.mine.regrowRng = globalThis.seededRandom(seed + '|regrow'); this.mine.regrowT = 0;
      this.mine.vaultHome = this.mine.vault;
      this.hatch = 'open';
      for (const p of this.players.values()) { p.known = new Set(); p.glim = new Set(); }
      for (const c of this.conns) if (c.player) this.sendBlock(c.player);
      this.save();
    };
    if (first) open(); else setTimeout(open, (S.hatchShutSeconds * 1000) / (this.opts.speed || 1));
  }
  // what the page needs to draw the mine: its shape, never its seed (the seed would give away the ore and the Vault)
  mineView() {
    const m = this.mine;
    return { levels: m.levels, ladders: m.ladders, terrain: m.terrain, c0: m.c0, surface: m.surface, cols: m.cols,
      look: sha(this.block.seed + '|look'), minersBelow: m.minersBelow };
  }
  sendBlock(p) {
    const b = this.block;
    p.conn.send({ t: 'block', height: b.height, hash: b.hash, arrivedAt: b.arrivedAt, commit: b.commit, hatch: this.hatch,
      reveal: this.prev, mine: this.mine ? this.mineView() : null, pot: Math.floor(this.eco.pot), vault: Math.floor(this.eco.vault) });
  }

  // ---------- miners ----------
  join(conn, msg) {
    let token = typeof msg.token === 'string' && /^[0-9a-f]{32}$/.test(msg.token) ? msg.token : null;
    let saved = token && this.store.get('p:' + token);
    if (!saved) { token = crypto.randomBytes(16).toString('hex'); saved = { name: 'Miner ' + (1000 + Math.floor(Math.random() * 9000)), purse: null }; }
    let p = this.players.get(token);
    if (!p) {
      p = { token, name: saved.name, purse: Purse(R, saved.purse), shift: false, place: { l: -1, x: 0 }, placeT: 0, bag: [], oil: 0,
        mining: null, known: new Set(), glim: new Set(), sendT: 0, msgs: 0, msgT: 0, facing: 1, id: crypto.randomBytes(4).toString('hex') };
      this.players.set(token, p);
    }
    if (p.conn && p.conn !== conn) p.conn.close(4000);   // one page per miner: a second tab takes over
    p.conn = conn; conn.player = p; this.conns.add(conn);
    if (!p.shift && this.mine) p.place = { l: -1, x: MineGen.point(this.mine, { kind: 'level', l: -1, x: this.surfaceX() }).x };
    p.placeT = this.clock;
    conn.send({ t: 'welcome', token, id: p.id, name: p.name, purse: p.purse.toJSON(), shift: p.shift });
    if (this.block) this.sendBlock(p);
    this.savePlayer(p);
  }
  leave(conn) { this.conns.delete(conn); if (conn.player && conn.player.conn === conn) conn.player.conn = null; }   // still below? caught at the knock
  surfaceX() { return this.mine.G.colX(this.mine.c0) - 2 * T; }
  below(p) { return p.shift && !(p.place.k === undefined && p.place.l < 0); }
  weight(p) { return p.bag.reduce((a, it) => a + it.weight, 0); }
  sats(p) { return p.bag.reduce((a, it) => a + (it.kind === 'amber' ? it.value : 0), 0); }
  lightTiles(p) {
    const burnt = p.shift ? (this.clock - p.shiftStart) / R.oilSecondsPerMeasure : 0;
    return R.basicLight * (1 + R.oilWidenPerMeasure * Math.max(0, p.oil - burnt));
  }
  xy(place) { return MineGen.point(this.mine, place.k !== undefined ? { kind: 'ladder', k: place.k, y: place.y } : { kind: 'level', l: place.l, x: place.x }); }

  message(conn, msg) {
    const p = conn.player;
    this.stats.msgs++;
    if (!p) { if (msg && msg.t === 'hello') this.join(conn, msg); return; }
    // flood guard
    const now = this.clock;
    if (now - p.msgT >= 1) { p.msgT = now; p.msgs = 0; }
    if (++p.msgs > MAX_MSGS) return;
    switch (msg && msg.t) {
      case 'buy': return this.buy(p, msg.item);
      case 'enter': return this.enter(p);
      case 'pos': return this.move(p, msg.p, msg.f);
      case 'pick': return this.pick(p, msg.id);
      case 'stroke': return this.stroke(p, msg.id);
      case 'drop': return this.drop(p);
      case 'name': if (typeof msg.name === 'string') { p.name = msg.name.replace(/[^\w \-.]/g, '').slice(0, 20) || p.name; this.savePlayer(p); } return;
      case 'ping': return conn.send({ t: 'pong', c: msg.c, s: Date.now() });
    }
  }
  buy(p, item) {
    let ok = false;
    if (item === 'kit') ok = p.purse.buyKit(this.eco);
    else if (item === 'lamp') ok = p.purse.buyLamp(this.eco);
    else if (item === 'oil') ok = !p.shift && p.oil < R.oilMaxMeasures && p.purse.buyOil(this.eco, 1) && ++p.oil > 0;
    if (ok) this.vaultEvent('in', (item === 'kit' ? R.kitPrice : item === 'lamp' ? R.lampPrice : R.oilPrice) * R.salesTo.vault);
    p.conn.send({ t: 'purse', ok, item, purse: p.purse.toJSON(), oil: p.oil });
    if (ok) { this.savePlayer(p); this.dirty = true; }
  }
  enter(p) {
    if (p.shift || this.hatch !== 'open' || !this.mine) return p.conn.send({ t: 'say', text: this.hatch !== 'open' ? 'The hatch is shut.' : 'You are already below.' });
    if (p.purse.lamps < 1) return p.conn.send({ t: 'say', text: p.purse.hasKit ? 'You need a lamp to go down. Buy one (300).' : 'Buy the starting kit (1,000) to go down.' });
    p.purse.lamps -= 1; p.shift = true; p.shiftStart = this.clock; p.bag = []; p.mining = null;
    p.place = { k: 0, y: this.mine.G.floorY(-1) }; p.placeT = this.clock; p.deepest = -1;
    this.savePlayer(p);
    p.conn.send({ t: 'entered', purse: p.purse.toJSON(), oil: p.oil, place: p.place });
  }

  // ---------- movement: the server accepts a new place only if he could have got there in the time since the last ----------
  speeds(p) { return { walk: S.runSpeed, down: S.slideSpeed, up: S.climbSpeed * R.climbFactor(this.weight(p), S) }; }
  minTime(a, b, sp) {
    const m = this.mine, G = m.G;
    if (a.k !== undefined && b.k !== undefined && a.k === b.k) return Math.abs(b.y - a.y) / (b.y > a.y ? sp.down : sp.up);
    const outs = a.k !== undefined ? this.ladderEnds(a, sp, true) : [{ l: a.l, x: a.x, t: 0 }];
    const ins = b.k !== undefined ? this.ladderEnds(b, sp, false) : [{ l: b.l, x: b.x, t: 0 }];
    let best = Infinity;
    for (const o of outs) for (const i of ins) best = Math.min(best, o.t + this.groundTime(o.l, o.x, i.l, i.x, sp) + i.t);
    return best;
  }
  ladderEnds(pl, sp, leaving) {
    const d = this.mine.ladders[pl.k], G = this.mine.G, col = G.colX(d.c), y0 = G.floorY(d.top), y1 = G.floorY(d.bottom);
    // leaving: from y up to the top or down to the bottom; arriving: from the top down to y, or from the bottom up to y
    return leaving ? [{ l: d.top, x: col, t: (pl.y - y0) / sp.up }, { l: d.bottom, x: col, t: (y1 - pl.y) / sp.down }]
                   : [{ l: d.top, x: col, t: (pl.y - y0) / sp.down }, { l: d.bottom, x: col, t: (y1 - pl.y) / sp.up }];
  }
  groundTime(l1, x1, l2, x2, sp) {
    const m = this.mine, G = m.G;
    if (l1 === l2) return Math.abs(x2 - x1) / sp.walk;
    let states = [{ x: x1, t: 0 }], l = l1;
    const reach = (x) => Math.min(...states.map((s) => s.t + Math.abs(x - s.x) / sp.walk));
    while (l !== l2) {
      const next = [];
      if (l2 > l) {   // down a ladder, or through a hole in the floor
        const d = m.ladders.find((q) => q.top === l);
        if (d) { const c = G.colX(d.c); next.push({ x: c, t: reach(c) + (G.floorY(d.bottom) - G.floorY(d.top)) / sp.down }); }
        for (const g of m.terrain) if (g.l === l && g.kind === 'gap') { const c = (g.x0 + g.x1) / 2; next.push({ x: c, t: reach(c) + 0.5 }); }
        l++;
      } else {        // up: only by a ladder
        const d = m.ladders.find((q) => q.bottom === l);
        if (!d) return Infinity;
        const c = G.colX(d.c); next.push({ x: c, t: reach(c) + (G.floorY(d.bottom) - G.floorY(d.top)) / sp.up });
        l--;
      }
      if (!next.length) return Infinity;
      states = next;
    }
    return reach(x2);
  }
  validPlace(pl) {
    const m = this.mine;
    if (!pl || typeof pl !== 'object') return null;
    if (pl.k !== undefined) {
      const k = pl.k | 0, d = m.ladders[k]; if (!d || !Number.isFinite(pl.y)) return null;
      const y = Math.min(Math.max(pl.y, m.G.floorY(d.top)), m.G.floorY(d.bottom));
      return { k, y };
    }
    const l = pl.l | 0; if (l < -1 || l >= R.levels || !Number.isFinite(pl.x)) return null;
    const [a, b] = MineGen.span(m, l);
    return { l, x: Math.min(Math.max(pl.x, a), b) };
  }
  move(p, raw, facing) {
    if (!this.mine || !p.shift || p.mining) return;
    const to = this.validPlace(raw); if (!to) return;
    const need = this.minTime(p.place, to, this.speeds(p)), had = (this.clock - p.placeT) * (this.opts.speed || 1);
    if (had + SLACK < need * 0.9) {   // faster than he can move: refuse, and tell the page where he really is
      this.stats.rejectedMoves++;
      p.conn.send({ t: 'snap', place: p.place });
      return;
    }
    p.place = to; p.placeT = this.clock; p.facing = facing === -1 ? -1 : 1;
    if (to.k === undefined && to.l >= 0) p.deepest = Math.max(p.deepest, to.l);
    if (to.k === undefined && to.l < 0) this.bank(p);   // past the hatch: the bag is his
  }

  // ---------- ore ----------
  sees(p, n, mult = 1) {
    const a = this.xy(p.place), r = this.lightTiles(p) * T * mult;
    return Math.hypot(n.x - a.x, n.y - a.y) <= r + n.r;
  }
  pick(p, id) {
    const n = this.mine && this.mine.nodes.find((q) => q.id === id);
    if (!n || !p.shift || p.place.k !== undefined || p.place.l !== n.l) return;
    if (Math.abs(n.x - p.place.x) > (S.oreStandGap + S.mineRange) * T + 2 || !this.sees(p, n)) return;
    if (this.weight(p) + n.weight > R.bagCapacity) return p.conn.send({ t: 'say', text: 'Your bag is full. Drop ore or go up.' });
    if (n.miner && n.miner !== p) return p.conn.send({ t: 'say', text: 'Someone is already working that node.' });
    n.miner = p; p.mining = { n, strokes: 0, last: -1 };
  }
  stroke(p, id) {
    const mi = p.mining; if (!mi || mi.n.id !== id) return;
    if (this.clock - mi.last < STROKE_GAP / (this.opts.speed || 1)) return;   // quicker than a hand: not counted
    mi.last = this.clock; mi.strokes++;
    const need = Math.ceil(2 * mi.n.hardness);
    mi.n.hp = Math.max(0, 1 - mi.strokes / need);
    if (mi.strokes < need) return;
    const n = mi.n; p.mining = null; n.miner = null;
    if (!this.mine.nodes.includes(n)) return;
    this.mine.nodes.splice(this.mine.nodes.indexOf(n), 1);
    const item = { kind: n.kind, value: n.kind === 'vault' ? 0 : n.value, weight: n.weight };
    p.bag.push(item);
    p.conn.send({ t: 'got', id: n.id, item, bag: p.bag, vault: n.kind === 'vault' });
  }
  drop(p) {
    const it = p.bag.pop(); if (!it) return;
    if (it.kind === 'vault') { this.returnVault(); p.conn.send({ t: 'say', text: 'The Vault piece went back to the Vault.' }); p.conn.send({ t: 'bag', bag: p.bag }); return; }
    const value = it.kind === 'amber' && !it.dropped ? this.eco.dropped(it.value) : it.value;
    if (it.kind === 'amber' && !it.dropped) this.vaultEvent('in', it.value - value);
    if (p.place.k === undefined && p.place.l >= 0) {
      const T0 = Math.floor(p.place.x / T);
      const n = MineGen.makeNode(this.mine, Math.random, p.place.l, it.kind, value, { within: { a: T0 - 1, b: T0 + 1 } });
      if (n) n.dropped = true;
    }
    this.dirty = true;
    p.conn.send({ t: 'bag', bag: p.bag });
  }
  returnVault() { const m = this.mine, v = m.vaultHome; if (v && !m.nodes.includes(v)) { v.hp = 1; m.nodes.push(v); } }

  // ---------- the end of a shift ----------
  bank(p) {
    const sats = this.sats(p), piece = p.bag.some((it) => it.kind === 'vault');
    const pieceValue = piece ? this.eco.vaultPieceValue() : 0;
    const kept = this.eco.carriedOut(sats, pieceValue);
    if (piece) this.vaultEvent('out', pieceValue, p.name);
    p.purse.points += kept; p.shift = false; p.oil = 0; p.mining = null;
    const bag = p.bag; p.bag = []; this.stats.banked++;
    p.conn && p.conn.send({ t: 'banked', kept, piece, bag, purse: p.purse.toJSON() });
    this.savePlayer(p); this.dirty = true;
  }
  caught(p) {
    const sats = this.sats(p);
    this.eco.caught(sats); this.vaultEvent('knock', Math.min(sats, this.eco.pot) * R.caughtTo.vault);
    if (p.bag.some((it) => it.kind === 'vault')) this.returnVault();
    if (p.mining) { p.mining.n.miner = null; p.mining = null; }
    p.bag = []; p.shift = false; p.oil = 0; this.stats.caught++;
    p.place = { l: -1, x: this.surfaceX() };
    p.conn && p.conn.send({ t: 'caught', sats, purse: p.purse.toJSON() });
    this.savePlayer(p); this.dirty = true;
  }

  // ---------- the world clock ----------
  tick(dt) {
    const t0 = process.hrtime.bigint();
    this.clock += dt;
    const m = this.mine;
    if (m && this.hatch === 'open') {
      m.regrowT += dt * (this.opts.speed || 1);
      while (m.regrowT >= R.regrowEverySeconds) { m.regrowT -= R.regrowEverySeconds; MineGen.regrow(m, m.regrowRng); }
    }
    for (const p of this.players.values()) {
      if (!p.conn || this.clock - p.sendT < SEND_EVERY) continue;
      p.sendT = this.clock;
      this.sendState(p);
    }
    if (this.dirty && this.clock - (this.savedT || 0) > 10) this.save();
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    this.stats.tickMs = this.stats.tickMs * 0.98 + ms * 0.02; this.stats.tickMax = Math.max(this.stats.tickMax, ms);
  }
  sendState(p) {
    const m = this.mine, out = { t: 'state', hatch: this.hatch, shift: p.shift, light: this.lightTiles(p) };
    // the Vault: its amount, and what flowed since this miner's last look (merged knock events go as one surge)
    out.vault = Math.floor(this.eco.vault);
    if (p.vaultSeen === undefined) p.vaultSeen = this.vaultSeq;
    if (this.vaultSeq > p.vaultSeen) {
      const ev = this.vaultLog.filter((e) => e.n > p.vaultSeen), knock = ev.filter((e) => e.k === 'knock').reduce((x, e) => x + e.a, 0);
      out.vev = ev.filter((e) => e.k !== 'knock').slice(-20).map((e) => ({ k: e.k, a: e.a, who: e.who }));
      if (knock) out.vev.push({ k: 'knock', a: knock });
      p.vaultSeen = this.vaultSeq;
    }
    if (m) {
      // ore: what his own lamp shows, once; a faint glimmer (no kind, no value) a little further out; never the Vault's glimmer
      const add = [], glim = [], gone = [];
      const live = new Set(m.nodes.map((n) => n.id));
      for (const id of p.known) if (!live.has(id)) { gone.push(id); p.known.delete(id); }
      for (const id of p.glim) if (!live.has(id)) { gone.push(id); p.glim.delete(id); }
      if (p.shift) for (const n of m.nodes) {
        if (p.known.has(n.id)) continue;
        if (this.sees(p, n)) { p.known.add(n.id); add.push(nodeView(n)); }
        else if (n.kind !== 'vault' && !p.glim.has(n.id) && this.sees(p, n, GLIMMER)) { p.glim.add(n.id); glim.push({ id: n.id, l: n.l, x: Math.round(n.x), y: Math.round(n.y) }); }
      }
      if (add.length) out.nodes = add;
      if (glim.length) out.glim = glim;
      if (gone.length) out.gone = gone;
      for (const id of p.known) { const n = m.nodes.find((q) => q.id === id); if (n && n.hp < 1) (out.hp = out.hp || {})[id] = n.hp; }
      // the hum of the Deep: louder nearer the Vault (a level, never a place)
      const v = m.vaultHome;
      if (p.shift && v && m.nodes.includes(v)) { const a = this.xy(p.place); out.hum = Math.round(Math.max(0, 1 - Math.hypot(v.x - a.x, v.y - a.y) / 900) * 100) / 100; }
      // the other miners: near ones in full, far ones as points of light
      const a = this.xy(p.place), cand = [], far = [], sendFar = this.clock - (p.farT || 0) >= FAR_EVERY;
      for (const q of this.players.values()) {
        if (q === p || !q.shift) continue;
        const b = this.xy(q.place), d = Math.hypot(b.x - a.x, b.y - a.y);
        if (d < NEAR) cand.push({ q, d }); else if (sendFar) far.push([Math.round(b.x / T), Math.round(b.y / T)]);
      }
      cand.sort((u, v) => u.d - v.d);
      const near = [];
      p.names = p.names || new Set();
      cand.forEach(({ q, d }, i) => {
        if (i >= NEAR_MAX) { if (sendFar) { const b = this.xy(q.place); far.push([Math.round(b.x / T), Math.round(b.y / T)]); } return; }
        const pl = q.place.k !== undefined ? { k: q.place.k, y: Math.round(q.place.y) } : { l: q.place.l, x: Math.round(q.place.x) };
        const v = { id: q.id, p: pl, f: q.facing, m: q.mining ? q.mining.n.id : 0 };
        if (!p.names.has(q.id)) { p.names.add(q.id); v.name = q.name; }   // a name is sent once
        near.push(v);
      });
      out.near = near;
      if (sendFar) { out.far = far; p.farT = this.clock; }
    }
    p.conn.send(out);
  }
  vaultEvent(k, a, who) {   // small trickles add up until they make a whole sat
    if (!(a > 0)) return;
    if (k === 'in') { this.vaultAcc = (this.vaultAcc || 0) + a; if (this.vaultAcc < 1) return; a = Math.floor(this.vaultAcc); this.vaultAcc -= a; }
    this.vaultLog.push({ n: ++this.vaultSeq, k, a: Math.round(a), who }); if (this.vaultLog.length > 300) this.vaultLog.shift();
  }
  broadcast(msg) { for (const c of this.conns) if (c.player) c.send(msg); }

  // ---------- keeping ----------
  savePlayer(p) { this.store.set('p:' + p.token, { name: p.name, purse: p.purse.toJSON() }); }
  save() { this.store.set('economy', this.eco.toJSON()); this.store.flush(); this.dirty = false; this.savedT = this.clock; }
  health() {
    const ps = [...this.players.values()];
    return { ok: true, height: this.block && this.block.height, hatch: this.hatch, connected: this.conns.size, below: ps.filter((p) => this.below(p)).length,
      pot: Math.floor(this.eco.pot), vault: Math.floor(this.eco.vault), check: this.eco.check().ok, stats: this.stats, mem: process.memoryUsage(), cpu: this.cpuPct() };
  }
  cpuPct() {   // the server's own CPU use since the last ask, in % of one core
    const now = process.hrtime.bigint(), c = process.cpuUsage(), last = this.cpuLast || { now, c };
    const used = (c.user + c.system - last.c.user - last.c.system) / 1000, wall = Number(now - last.now) / 1e6;
    this.cpuLast = { now, c }; return wall > 0 ? Math.round(used / wall * 100) : 0;
  }
}
function nodeView(n) {
  return { id: n.id, l: n.l, kind: n.kind, value: n.kind === 'amber' ? n.value : 0, weight: n.weight, x: n.x, standX: n.standX,
    y: n.y, base: n.base, h: n.h, r: n.r, pile: n.pile, crack: n.crack, hardness: n.hardness, rich: n.rich, hp: n.hp, tier: n.tier, zone: n.zone };
}
module.exports = { Shaft, R, S, MineGen };
