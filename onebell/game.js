// ONE BELL: one ladder, no floor, one decision. The miner goes down by himself and chips the deposit on every level;
// tap once to climb out. A real new Bitcoin block rings the bell: if he is still below the hatch, the bag is lost.
// Everything is drawn on one canvas in the painting's own pixels (shaft.png is 1088 x 1920); the shaft scrolls past him.
(function () {
  'use strict';

  // ---- the painting ---------------------------------------------------------------------------
  const IMG_W = 1088, IMG_H = 1920;
  const LADDER_X = 547;                 // centre between the two rails in shaft.png
  const HATCH_Y = 300;                  // the rim of the hatch, where the ladder starts
  const GAP = 170;                      // one level, in painting pixels (he is about 1.5 levels tall)
  const ANCHOR0 = 372;                  // his hands at the hatch: on the top rungs, head just under the bell
  const levelY = (d) => ANCHOR0 + d * GAP;   // world y of level d (his hands' mark)
  const MID = 760;                      // once his hands reach this screen height he stays there and the shaft scrolls
  const TOP_OFF = 70;                   // at the hatch the painting sits this much lower, under the top panel
  const WALL_L = 390, WALL_R = 695;     // the shaft walls near the top
  const BELL = { x: 547, y: 242 };
  const FADE_TOP = 1365, FADE_BOT = 1452; // the bottom panel fades in here, solid below (bottom quarter = 1440)
  // endless background: the top of shaft.png once (rows 0-1050), then rows 450-1050 repeated; the 200 rows below
  // the strip fade in over the top of each tile, so every join is a blend
  const TOP_END = 1050, STRIP_Y = 450, STRIP_H = 600, BLEND = 200;
  const TOP_PANEL = 236;                // the near-black panel at the top: solid to here, then fading out

  // ---- the rules ------------------------------------------------------------------------------
  const BASE_SEC = 3;                   // seconds per level, going down, and climbing with an empty bag
  const SWING_SEC = 0.9, IMPACT = 0.45; // of each level's 3 s going down: the swing at the deposit, and when the pick lands
  // a fuller bag climbs slower: +0.1 s a level for every deposit in it, never more than 6 s a level
  const climbPerLevel = (count) => Math.min(6, BASE_SEC + 0.1 * count);
  // three climb speeds: STEADY loses nothing; FAST (2x) drops a random deposit every 2 levels; RUN (3x) one every level
  const SPEEDS = [
    { name: 'STEADY', mult: 1, drop: 0 },
    { name: 'FAST', mult: 2, drop: 0.5 },
    { name: 'RUN', mult: 3, drop: 1 },
  ];
  const KINDS = ['copper', 'ember', 'moonstone', 'blackglass'];
  const zoneOf = (n) => Math.floor((n - 1) / 3);                     // levels 1-3 are zone 0, 4-6 zone 1, ...
  const kindOf = (n) => KINDS[zoneOf(n) % 4];
  const valueOf = (n) => { const z = zoneOf(n); return z < 4 ? [3, 9, 24, 60][z] : 60 * (z - 2); };   // 3, 9, 24, 60, then 120, 180, ...
  const GOLD_FROM = 5, GOLD_ODDS = 1 / 8, GOLD_X = 5, GOLD_SEEN = 3;   // bell gold: from level 5, 1 in 8, worth 5x, glimmers 3 levels down
  const qs = new URLSearchParams(location.search);
  const TEST = qs.has('test') && qs.get('test') !== '0';
  // the bell's average gap: 600 s on the real chain, 60 s for the fake bell in test mode
  const MEAN_GAP = TEST ? window.SETTINGS.testBlockSeconds : 600;

  // ---- saved in this browser ------------------------------------------------------------------
  const KEY = TEST ? 'onebell.test.v1' : 'onebell.v1', MUTE_KEY = 'onebell.mute';
  let rec = {};
  try { rec = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { rec = {}; }
  rec = Object.assign({ streak: 0, lastDay: null, best: 0, banked: 0, runs: 0, caught: 0 }, rec);
  const saveRec = () => { try { localStorage.setItem(KEY, JSON.stringify(rec)); } catch (e) {} };
  let muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) {}

  const dayKey = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const today = () => dayKey(new Date());
  const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return dayKey(d); };
  // a streak survives until the end of the day after the last banked run
  const shownStreak = () => (rec.lastDay === today() || rec.lastDay === yesterday() ? rec.streak : 0);

  // ---- art ------------------------------------------------------------------------------------
  const ready = (i) => i && i.complete && i.naturalWidth > 0;
  const load = (src, onload) => { const i = new Image(); if (onload) i.onload = () => onload(i); i.src = src; return i; };
  const shaft = load('assets/shaft.png');

  // the miner: sprite sheets rendered from the 3D version's model and animations (tools/onebell_miner), 12 frames of 256 px
  // each sheet has a body layer and a sack layer (drawn over it, smaller as the bag empties)
  const SHEETS = ['climb_down', 'climb_up', 'swing_left', 'swing_right'];
  const sheet = {}, sackSheet = {};
  SHEETS.forEach((n) => { sheet[n] = load('assets/miner/' + n + '.png?v=3'); sackSheet[n] = load('assets/miner/' + n + '_bag.png?v=3'); });
  let minerMeta = null;
  fetch('assets/miner/miner.json?v=3').then((r) => r.json()).then((m) => { minerMeta = m; }).catch(() => {});
  // a frame is drawn this many painting pixels tall: his figure (about 186 of a frame's 256 px) is 1.5 levels tall
  const FRAME = 256, FIGURE_PX = 186, MINER_DRAW = Math.round(1.5 * GAP * FRAME / FIGURE_PX);
  const avg = (fs, key) => fs.reduce((a, f) => [a[0] + f[key][0] / fs.length, a[1] + f[key][1] / fs.length], [0, 0]);
  const handsOf = (fs) => fs.reduce((a, f) => [a[0] + (f.lhand[0] + f.rhand[0]) / 2 / fs.length, a[1] + (f.lhand[1] + f.rhand[1]) / 2 / fs.length], [0, 0]);

  // deposits: five painted pieces, prepared once: full colour, the rock base's outer edge faded into the wall
  const deps = {};
  ['copper', 'ember', 'moonstone', 'blackglass', 'bellgold'].forEach((k) => load('assets/deposits/' + k + '.png?v=2', (img) => { deps[k] = prepDeposit(img, k); }));
  function boxBlur(src, w, h, r) {   // a box blur of a w x h map, horizontal then vertical
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) { let acc = 0; const row = y * w;
      for (let x = -r; x < w + r; x++) { if (x + r < w) acc += src[row + Math.min(w - 1, Math.max(0, x + r))]; if (x - r - 1 >= 0) acc -= src[row + x - r - 1]; if (x >= 0 && x < w) tmp[row + x] = acc / (2 * r + 1); } }
    for (let x = 0; x < w; x++) { let acc = 0;
      for (let y = -r; y < h + r; y++) { if (y + r < h) acc += tmp[Math.min(h - 1, Math.max(0, y + r)) * w + x]; if (y - r - 1 >= 0) acc -= tmp[(y - r - 1) * w + x]; if (y >= 0 && y < h) out[y * w + x] = acc / (2 * r + 1); } }
    return out;
  }
  function prepDeposit(img, kind) {
    const w = img.naturalWidth, h = img.naturalHeight;
    const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const base = mk(), glow = mk(), sil = mk(), bg = base.getContext('2d');
    bg.drawImage(img, 0, 0);
    let d;
    try { d = bg.getImageData(0, 0, w, h); } catch (e) { return { base, glow: null, sil: null, rim: null, w, h }; }
    const px = d.data, gd = new ImageData(w, h), sd = new ImageData(w, h), gp = gd.data, sp = sd.data;
    // which pixels are the mineral and which the rock it sits in: judged per pixel, then smoothed so the edges are clean
    const raw = new Float32Array(w * h);
    for (let i = 0, p = 0; p < w * h; p++, i += 4) {
      if (!px[i + 3]) continue;
      const r = px[i], g = px[i + 1], b = px[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const V = mx / 255, sat = mx ? (mx - mn) / mx : 0;
      if (kind === 'blackglass') raw[p] = sat < 0.22 && (V < 0.3 || V > 0.5) ? 1 : 0;   // black glass: colourless, very dark or glinting
      else raw[p] = r >= g && g >= b && V < 0.55 && sat < 0.75 ? 1 - Math.min(1, (0.55 - V) / 0.15) : 1;   // rock: dull brown
    }
    const mineralMap = boxBlur(boxBlur(raw, w, h, 4), w, h, 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, a = px[i + 3];
      if (!a) continue;
      const r = px[i], g = px[i + 1], b = px[i + 2], V = Math.max(r, g, b) / 255;
      const m0 = mineralMap[y * w + x], mineral = Math.max(0, Math.min(1, (m0 - 0.3) / 0.35)), rock = 1 - mineral;
      // full colour; only the outer edge of the rock base fades, so it sits in the wall (the crystals are untouched)
      const ex = (x - w / 2) / (w / 2), ey = (y - h / 2) / (h / 2), rr = Math.sqrt(ex * ex + ey * ey);
      const fade = Math.max(0, Math.min(1, (1.0 - rr) / 0.2));
      const edge = 1 - rock * (1 - fade);
      px[i + 3] = a * edge;
      // the glow layer: the mineral only, brighter where it is bright
      const ga = a * mineral * edge * (kind === 'blackglass' ? 0.35 : Math.min(1, V * 1.4));
      gp[i] = r; gp[i + 1] = g; gp[i + 2] = b; gp[i + 3] = ga;
      sp[i + 3] = px[i + 3];                                      // a black silhouette, to darken it with the rock
    }
    // the loose stone: the crystal part of the picture (the mineral pixels only), cut out and scaled down
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    const sd2 = new ImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = y * w + x, i = p * 4, m = Math.max(0, Math.min(1, (mineralMap[p] - 0.4) / 0.3));
      if (m <= 0 || !px[i + 3]) continue;
      sd2.data[i] = px[i]; sd2.data[i + 1] = px[i + 1]; sd2.data[i + 2] = px[i + 2]; sd2.data[i + 3] = px[i + 3] * m;
      if (m > 0.5) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    }
    let stone = null;
    if (x1 > x0 && y1 > y0) {
      const full = mk(); full.getContext('2d').putImageData(sd2, 0, 0);
      const cw = x1 - x0 + 1, chh = y1 - y0 + 1, k = 72 / Math.max(cw, chh);
      stone = document.createElement('canvas'); stone.width = Math.ceil(cw * k); stone.height = Math.ceil(chh * k);
      const sg = stone.getContext('2d'); sg.imageSmoothingQuality = 'high'; sg.drawImage(full, x0, y0, cw, chh, 0, 0, stone.width, stone.height);
    }
    bg.putImageData(d, 0, 0);
    glow.getContext('2d').putImageData(gd, 0, 0);
    sil.getContext('2d').putImageData(sd, 0, 0);
    let rim = null;
    if (kind === 'blackglass') {                                   // a thin warm rim light round the black glass
      rim = mk(); const rg = rim.getContext('2d'), m = mk(), mg = m.getContext('2d');
      const md = new ImageData(w, h);
      for (let i = 0, p = 0; i < gp.length; i += 4, p++) if (mineralMap[p] > 0.55 && px[i + 3] > 60) { md.data[i] = 255; md.data[i + 1] = 176; md.data[i + 2] = 92; md.data[i + 3] = 255; }
      mg.putImageData(md, 0, 0);
      for (const [dx, dy] of [[3, 0], [-3, 0], [0, 3], [0, -3], [2, 2], [-2, 2], [2, -2], [-2, -2]]) rg.drawImage(m, dx, dy);
      rg.globalCompositeOperation = 'destination-out'; rg.drawImage(m, 0, 0);
    }
    return { base, glow, sil, rim, stone, w, h };
  }

  // ---- sound: recordings only -------------------------------------------------------------------
  const bell = new Audio('assets/sounds/bell.mp3'); bell.preload = 'auto';
  // the pick and the falling stones: short recordings (see README for their sources); no generated sounds
  const pickRec = new Audio('assets/sounds/pick.mp3'); pickRec.preload = 'auto';
  const stoneRec = new Audio('assets/sounds/stone.mp3'); stoneRec.preload = 'auto';
  let audioUnlocked = false;
  function unlockAudio() {            // phones only allow sound after a tap
    if (audioUnlocked) return;
    audioUnlocked = true;
    [bell, pickRec, stoneRec].forEach((a) => {
      if (!a) return;
      a.muted = true;
      const p = a.play();
      if (p && p.then) p.then(() => { a.pause(); a.currentTime = 0; a.muted = false; }).catch(() => { a.muted = false; });
      else { a.pause(); a.muted = false; }
    });
  }
  function play(a) { if (!a || muted) return; try { a.pause(); a.currentTime = 0; a.muted = false; const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
  function ringBell() { bellFlashAt = performance.now(); Music.hush(); play(bell); }
  function setMuted(m) {
    muted = m;
    try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch (e) {}
    if (m) { try { bell.pause(); pickRec.pause(); stoneRec.pause(); } catch (e) {} }
  }

  // ---- music: the scored tracks from the 3D version (3d/music), one per zone, crossfaded -----------
  // Levels 1-3, 4-6, 7-9, then 10 and deeper, darker the deeper; at the hatch the first plays softer.
  // M silences everything; N (or the note button) silences only the music. The bell stops the music, so it is heard alone.
  const MUSIC_KEY = 'onebell.music';
  const Music = {
    files: ['../3d/music/depth1.mp3', '../3d/music/depth2.mp3', '../3d/music/depth3.mp3', '../3d/music/depth4.mp3'],
    volume: 0.5, hatch: 0.45, fade: 2.5,
    on: true, tracks: [], tryT: 0, holdUntil: 0,
    bandOf(l) { return l <= 0 ? 0 : Math.min(3, zoneOf(l)); },
    track(i) {
      if (!this.tracks[i]) { const a = new Audio(this.files[i]); a.loop = true; a.preload = 'auto'; a.volume = 0; this.tracks[i] = { a, v: 0 }; }
      return this.tracks[i];
    },
    hush() {
      this.holdUntil = performance.now() + 9000;
      this.tracks.forEach((t) => { if (t) { t.v = 0; t.a.volume = 0; t.a.pause(); } });
    },
    update(dt, l) {
      const band = this.bandOf(l), want = this.on && !muted && performance.now() >= this.holdUntil;
      this.tryT -= dt;
      for (let i = 0; i < this.files.length; i++) {
        const target = want && i === band ? (l === 0 ? this.hatch : 1) : 0;
        if (!target && !this.tracks[i]) continue;
        const t = this.track(i);
        t.v += (target - t.v) * Math.min(1, dt / this.fade * 3);
        if (target === 0 && t.v < 0.005) { t.v = 0; if (!t.a.paused) t.a.pause(); }
        t.a.volume = Math.max(0, Math.min(1, t.v * this.volume));
        if (target > 0 && t.a.paused && this.tryT <= 0) { this.tryT = 1; const p = t.a.play(); if (p && p.catch) p.catch(() => {}); }
      }
    },
  };
  try { Music.on = localStorage.getItem(MUSIC_KEY) !== '0'; } catch (e) {}
  function toggleMusic() { Music.on = !Music.on; Music.tryT = 0; try { localStorage.setItem(MUSIC_KEY, Music.on ? '1' : '0'); } catch (e) {} }

  // ---- state ----------------------------------------------------------------------------------
  let feed = 'connecting';              // 'connecting' | 'live' | 'lost'
  let blockHeight = null, blockAt = 0, blockHash = '';
  let mineHash = '';                    // the mine being drawn (the block hash; kept a moment longer while he is caught)
  let state = 'hatch';                  // 'hatch' | 'down' | 'up' | 'caught'
  let depth = 0;                        // in levels: 0 = hatch
  let seg = { kind: 'move', t: 0, from: 0 };   // going down: 'move' toward the next level, or 'swing' at a deposit
  let bag = 0, bagCount = 0, deepest = 0;   // points in the bag, and how many deposits
  let items = [];                       // the deposits in the bag: { kind, value }
  let speed = 0, dropAcc = 0;           // climbing: the chosen speed (index into SPEEDS), and levels climbed toward the next drop
  let bagShown = 0, minus = [], stones = [], sparks = [];   // the bag number as shown (it counts); "-N"; falling stones; bell-gold sparkles
  let sackAt = null;                    // where the sack on his back is on screen (for stones popping out of it)
  let chipped = new Map();              // level -> time it was chipped (this run)
  let floats = [], bits = [];           // "+N" on its way to the bag; crumbs of a chipped deposit
  let caught = null;                    // { at, depth, frame, sheetName } while showing the moment the bell caught him
  let camY = 0, camFrom = 0, camEase = null;
  let animT = 0, lastSheet = 'climb_down', lastFrame = 0;
  let msg = null;
  let bellFlashAt = -1e9;
  let simT = performance.now();
  let prevTimes = [], avgTime = null, testArrivals = [];
  const clockNow = () => (TEST && window.TestClock ? window.TestClock.now() : Date.now());

  // the level he is on: going down, the last mark he reached; climbing, the mark he is leaving
  const levelNow = () => (state === 'hatch' || depth <= 0 ? 0 : Math.max(1, state === 'up' ? Math.ceil(depth - 1e-6) : Math.floor(depth + 1e-6)));
  // the time to the hatch from where he is, at a speed: level by level, as the bag gets lighter with every stone dropped
  function climbSeconds(sp) {
    const S = SPEEDS[sp == null ? speed : sp];
    let d = depth, c = bagCount, acc = state === 'up' ? dropAcc : 0, t = 0;
    while (d > 1e-9) {
      const step = Math.min(1, d - Math.floor(d - 1e-9));
      t += step * climbPerLevel(c) / S.mult;
      acc += step * S.drop; while (acc >= 1 - 1e-9) { acc -= 1; if (c > 0) c--; }
      d -= step;
    }
    return t;
  }
  const chanceOf = (secs) => Math.min(0.99, 1 - Math.exp(-secs / MEAN_GAP));
  const bellChance = (sp) => chanceOf(climbSeconds(sp));

  function say(big, small, ttl) { msg = { big, small: small || '', at: performance.now(), ttl: ttl || 9000 }; }

  // ---- the mine: the same for every player in the same block --------------------------------------
  const mineCache = new Map();
  function deposit(n) {
    const key = mineHash + ':' + n;
    let d = mineCache.get(key);
    if (d) return d;
    const firstSide = window.seededRandom(mineHash + ':side')() < 0.5 ? 0 : 1;
    const r = window.seededRandom(key);
    const gold = n >= GOLD_FROM && r() < GOLD_ODDS;
    const side = (n + firstSide) % 2 ? 1 : -1;                // alternating left and right
    d = {
      n, gold, side, kind: gold ? 'bellgold' : kindOf(n), value: valueOf(n) * (gold ? GOLD_X : 1),
      x: (side < 0 ? 448 : 646) + (r() - 0.5) * 14, dy: GAP * 0.5 + (r() - 0.5) * 16,
      scale: 0.9 + r() * 0.1, rot: (r() - 0.5) * 0.2, phase: r() * 6.28,
      sparks: Array.from({ length: 5 }, () => [(r() - 0.5) * 0.7, (r() - 0.5) * 0.7, r() * 6.28, 0.6 + r() * 0.8]),
    };
    if (mineCache.size > 400) mineCache.clear();
    mineCache.set(key, d);
    return d;
  }

  // ---- the run --------------------------------------------------------------------------------
  function advance() {
    const now = performance.now();
    let dt = (now - simT) / 1000;
    simT = now;
    if (feed !== 'live' || state === 'hatch' || state === 'caught') return;
    while (dt > 0) {
      const h = Math.min(dt, 0.05); dt -= h;
      animT += h;
      if (state === 'down') {
        seg.t += h;
        if (seg.kind === 'move') {
          const dur = seg.from === 0 ? BASE_SEC : BASE_SEC - SWING_SEC;
          depth = seg.from + Math.min(1, seg.t / dur);
          if (seg.t >= dur) { depth = seg.from + 1; seg = { kind: 'swing', t: seg.t - dur, at: depth, hit: false }; }   // the rest of this step carries on
        } else {
          if (!seg.hit && seg.t >= IMPACT) { seg.hit = true; chip(seg.at); }
          if (seg.t >= SWING_SEC) seg = { kind: 'move', t: seg.t - SWING_SEC, from: seg.at };
        }
        deepest = Math.max(deepest, levelNow());
      } else if (state === 'up') {
        const S = SPEEDS[speed], dl = Math.min(depth, h * S.mult / climbPerLevel(bagCount));
        depth -= dl; dropAcc += dl * S.drop;
        while (dropAcc >= 1 - 1e-9) { dropAcc -= 1; dropStone(); }
        if (depth <= 1e-9) { depth = 0; bank(); return; }
      }
    }
  }

  function chip(n) {
    const d = deposit(n);
    chipped.set(n, performance.now());
    bag += d.value; bagCount++; items.push({ kind: d.kind, value: d.value });
    play(pickRec);
    floats.push({ v: d.value, x: d.x, wy: levelY(n) + d.dy, at: performance.now(), gold: d.gold });
    for (let i = 0; i < 16; i++) bits.push({ x: d.x + (Math.random() - 0.5) * 50, wy: levelY(n) + d.dy + (Math.random() - 0.5) * 40,
      vx: (Math.random() - 0.5) * 120 - d.side * 40, vy: -60 - Math.random() * 120, s: 4 + Math.random() * 7, at: performance.now(),
      c: d.gold ? '#f2c14a' : ['#6b4a2e', '#4a3220', '#8a6a48'][i % 3] });
  }

  // a random deposit falls out of the bag (FAST and RUN)
  function dropStone() {
    if (!items.length) return;
    const it = items.splice(Math.floor(Math.random() * items.length), 1)[0];
    bag -= it.value; bagCount--;
    minus.push({ v: it.value, at: performance.now() });
    play(stoneRec);
    const from = sackAt || { x: LADDER_X, y: MID + 60 }, dir = Math.random() < 0.5 ? -1 : 1, gold = it.kind === 'bellgold';
    stones.push({ kind: it.kind, x: from.x + dir * 20, wy: from.y + camY, vx: dir * (150 + Math.random() * 120), vy: -300 - Math.random() * 100,
      rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 14, g: gold ? 430 : 720, bounced: false, at: performance.now(), trail: [] });
  }
  function resetRun() {
    state = 'hatch'; depth = 0; bag = 0; bagCount = 0; deepest = 0; seg = { kind: 'move', t: 0, from: 0 };
    chipped = new Map(); floats = []; animT = 0; items = []; speed = 0; dropAcc = 0; bagShown = 0; minus = [];
  }

  function bank() {
    const got = bag, lvl = deepest;
    resetRun();
    rec.runs++; rec.banked += got; rec.best = Math.max(rec.best, lvl);
    const t = today();
    if (rec.lastDay !== t) { rec.streak = rec.lastDay === yesterday() ? rec.streak + 1 : 1; rec.lastDay = t; }
    saveRec();
    say('You got out. +' + got.toLocaleString('en-US') + ' points.', 'From level ' + lvl + '. The bag is banked.');
  }

  function press() {
    unlockAudio();
    if (feed !== 'live' || blockHeight === null || state === 'caught') return;
    advance();
    if (state === 'hatch') { resetRun(); state = 'down'; msg = null; }
    else if (state === 'down') {
      if (seg.kind === 'swing' && !seg.hit) depth = seg.at;     // climbing out before the pick lands: no chip
      state = 'up'; speed = 0; dropAcc = 0;                     // STEADY to start with
    }
  }
  function setSpeed(i) { if (state === 'up' && feed === 'live') { advance(); speed = i; } }

  // ---- the chain ------------------------------------------------------------------------------
  function onBlock(b) {
    advance();
    if (!b.initial && (state === 'down' || state === 'up')) {
      if (b.missed) {
        say('A block came while the feed was down.', 'This run does not count. Nothing lost, nothing banked.');
        resetRun();
      } else {
        const lvl = levelNow(), secs = Math.ceil(climbSeconds(state === 'up' ? speed : 0) - 1e-6), lost = bag;
        ringBell();
        rec.caught++; saveRec();
        say('The bell rang. You were on level ' + lvl + ', ' + secs + ' second' + (secs === 1 ? '' : 's') + ' from the hatch.',
          'The bag is lost (' + lost.toLocaleString('en-US') + ' points).', 12000);
        // hold the moment: he stays where the bell caught him, then the new round starts at the hatch
        caught = { at: performance.now(), depth, sheet: lastSheet, frame: lastFrame, count: bagCount };
        state = 'caught'; bag = 0; bagCount = 0;
      }
    } else if (!b.initial && !msg) {
      say('Block ' + b.height.toLocaleString('en-US') + ' found.', 'A new mine. The bell rings only for miners below.', 4000);
    }
    blockHeight = b.height; blockAt = b.arrivedAt; blockHash = b.hash;
    if (state !== 'caught') { resetRun(); mineHash = blockHash; }
    if (TEST) { testArrivals.push(b.arrivedAt); if (testArrivals.length > 50) testArrivals.shift(); prevFromTest(); }
    else refreshPrev(b.height, 0);
  }
  function onStatus(s) { advance(); feed = s; simT = performance.now(); }

  // the previous blocks' times, from the real block timestamps, and the average (this difficulty period's, from mempool.space)
  async function refreshPrev(height, tries) {
    try {
      const api = window.SETTINGS.mempoolApi;
      const list = (await (await fetch(api + '/blocks', { cache: 'no-store' })).json()).sort((a, b) => b.height - a.height);
      if (list[0].height < height && tries < 4) { setTimeout(() => refreshPrev(height, tries + 1), 4000); return; }
      const times = [];
      for (let i = 0; i + 1 < list.length && times.length < 3; i++) if (list[i].height === list[i + 1].height + 1) times.push((list[i].timestamp - list[i + 1].timestamp) * 1000);
      prevTimes = times;
      try { const da = await (await fetch(api + '/v1/difficulty-adjustment', { cache: 'no-store' })).json(); if (da && da.timeAvg > 0) avgTime = da.timeAvg; } catch (e) {}
      if (!avgTime) { const all = []; for (let i = 0; i + 1 < list.length; i++) all.push((list[i].timestamp - list[i + 1].timestamp) * 1000); avgTime = all.reduce((a, v) => a + v, 0) / Math.max(1, all.length); }
    } catch (e) { if (tries < 4) setTimeout(() => refreshPrev(height, tries + 1), 5000); }
  }
  function prevFromTest() {
    const a = testArrivals, t = [];
    for (let i = a.length - 1; i > 0 && t.length < 3; i--) t.push(a[i] - a[i - 1]);
    prevTimes = t;
    avgTime = a.length > 1 ? (a[a.length - 1] - a[0]) / (a.length - 1) : null;
  }

  // ---- screen ---------------------------------------------------------------------------------
  const frame = document.getElementById('frame');
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const safeEl = document.getElementById('safe');
  let scale = 1, dpr = 1, vx0 = 0, VW = IMG_W, safeTop = 0, safeBot = 0;

  function layout() {
    const vw = window.innerWidth, vh = window.innerHeight;
    // portrait 9:16; a narrower phone crops rock off the sides, a wider screen gets the frame centred
    const fw = Math.min(vw, vh * IMG_W / IMG_H);
    frame.style.width = fw + 'px';
    scale = vh / IMG_H;
    VW = fw / scale; vx0 = (IMG_W - VW) / 2;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(fw * dpr); canvas.height = Math.round(vh * dpr);
    const cs = getComputedStyle(safeEl);
    safeTop = (parseFloat(cs.paddingTop) || 0) / scale;
    safeBot = (parseFloat(cs.paddingBottom) || 0) / scale;
  }
  window.addEventListener('resize', layout);
  layout();

  const FONT = "'Cormorant Garamond', Georgia, serif";
  // Cormorant's digits are old-style (0 reads as o); numbers use a serif with lining figures
  const NUMFONT = "'Playfair Display', Georgia, serif";
  const CREAM = '#efe6d2', DIM = '#bfb29a', AMBER = '#ffb547', AMBER_HI = '#ffd27a';

  // w: a weight (Cormorant) or 'num' + weight (numbers font)
  function font(px, w) {
    const num = typeof w === 'string';
    ctx.font = (num ? w.slice(3) || 700 : w || 600) + ' ' + px + 'px ' + (num ? NUMFONT : FONT);
  }
  function spacing(px) { if ('letterSpacing' in ctx) ctx.letterSpacing = px + 'px'; }
  function text(s, x, y, px, w, color, align, ls) {
    font(px, w); spacing(ls || 0);
    ctx.textAlign = align || 'center'; ctx.fillStyle = color;
    ctx.fillText(s, x, y);
    spacing(0);
  }
  function measure(s, px, w, ls) { font(px, w); spacing(ls || 0); const m = ctx.measureText(s).width; spacing(0); return m; }
  function fit(s, px, w, maxW, ls) { const m = measure(s, px, w, ls); return m <= maxW ? px : Math.max(12, Math.floor(px * maxW / m)); }
  function shadow(blur, color) { ctx.shadowBlur = blur; ctx.shadowColor = color || 'rgba(0,0,0,.9)'; ctx.shadowOffsetY = blur ? 2 : 0; }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function wrap(s, px, w, maxW) {
    font(px, w);
    const words = s.split(' '), lines = []; let line = '';
    for (const wd of words) {
      const t = line ? line + ' ' + wd : wd;
      if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = wd; } else line = t;
    }
    if (line) lines.push(line);
    return lines;
  }
  function fmtClock(ms) {
    const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, ss = String(s % 60).padStart(2, '0');
    return h ? h + ':' + String(m).padStart(2, '0') + ':' + ss : m + ':' + ss;
  }
  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  // how dark the rock is outside the lamp at a world height: dim below the hatch, a little darker every 3 levels,
  // never black (the lamp's circle cuts through it, see drawDark)
  const LAMP_R = 430;
  function darkAt(wy) {
    const d = (wy - ANCHOR0) / GAP;
    if (d < 0.3) return 0;
    const z = Math.floor(d / 3) + clamp01((d % 3) - 2);   // steps every 3 levels, eased over the last level of each
    return clamp01(d - 0.3) * Math.min(0.82, 0.32 + 0.55 * (1 - Math.pow(0.84, z)));
  }
  const darkC = document.createElement('canvas'); darkC.width = IMG_W / 4; darkC.height = IMG_H / 4;
  const dctx = darkC.getContext('2d');
  function drawDark(lx, ly, flick) {
    dctx.setTransform(0.25, 0, 0, 0.25, 0, 0);
    dctx.globalCompositeOperation = 'source-over';
    dctx.clearRect(0, 0, IMG_W, IMG_H);
    for (let y = 0; y < FADE_BOT; y += 16) {
      const a = darkAt(y + 8 + camY);
      if (a > 0.005) { dctx.fillStyle = 'rgba(5,3,2,' + a.toFixed(3) + ')'; dctx.fillRect(0, y, IMG_W, 16); }
    }
    dctx.globalCompositeOperation = 'destination-out';   // the lamp's circle
    const R = LAMP_R * 1.05 * flick, g = dctx.createRadialGradient(lx, ly, 0, lx, ly, R);
    g.addColorStop(0, 'rgba(0,0,0,.95)'); g.addColorStop(0.5, 'rgba(0,0,0,.75)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    dctx.fillStyle = g; dctx.fillRect(lx - R, ly - R, R * 2, R * 2);
    ctx.drawImage(darkC, 0, 0, IMG_W, IMG_H);
  }

  let speedRects = [];
  let buttonRect = { x: 0, y: 0, w: 0, h: 0 }, muteRect = { x: 0, y: 0, w: 0, h: 0 }, musicRect = { x: 0, y: 0, w: 0, h: 0 };

  // ---- the miner's picture this frame -----------------------------------------------------------
  let climbPhase = 0, climbPhaseT = 0;
  function minerPose(t) {
    if (!minerMeta) return null;
    let name, f, depthNow = depth, shake = 0, dy = 0;
    const fps = 12 / 1.05;
    if (state === 'caught' && caught) {
      name = caught.sheet; f = caught.frame; depthNow = caught.depth;
      const a = (t - caught.at) / 1000;
      shake = a < 1.2 ? Math.sin(a * 60) * 6 * (1 - a / 1.2) : 0; dy = Math.min(1, a / 0.35) * 26;   // a jolt and a slip down the ladder
    } else if (state === 'hatch') { name = 'climb_down'; f = 0; }
    else if (state === 'down' && seg.kind === 'swing') {
      name = deposit(seg.at).side > 0 ? 'swing_right' : 'swing_left';
      f = Math.min(11, Math.floor(seg.t / SWING_SEC * 12));
    } else if (state === 'down') { name = 'climb_down'; f = Math.floor(animT * fps) % 12; }
    else {   // climbing: the climb runs faster at FAST and RUN, and slower with a heavier bag
      name = 'climb_up';
      climbPhase += (t - (climbPhaseT || t)) / 1000 * fps * SPEEDS[speed].mult * BASE_SEC / climbPerLevel(bagCount) * (feed === 'live' ? 1 : 0);
      f = Math.floor(climbPhase) % 12;
    }
    climbPhaseT = t;
    if (feed !== 'live' && state !== 'caught') f = lastFrame % 12;
    lastSheet = name; lastFrame = f;
    const k = MINER_DRAW / FRAME, M = minerMeta.sheets;
    const climbHands = handsOf(M.climb_down.frames), climbLamp = avg(M.climb_down.frames, 'lamp');
    const handY = levelY(depthNow) - camY + dy;
    let x0, y0;
    if (name.startsWith('swing')) {   // his hips stay where they are on the ladder: lined up by the belt lamp
      const sgn = name === 'swing_left' ? -1 : 1, sl = avg(M[name].frames, 'lamp');
      x0 = LADDER_X + sgn * (climbLamp[0] - climbHands[0]) * k - sl[0] * k;
      y0 = handY + (climbLamp[1] - climbHands[1]) * k - sl[1] * k;
    } else {                          // his hands on the ladder at the level mark
      const hd = handsOf(M[name].frames);
      x0 = LADDER_X - hd[0] * k; y0 = handY - hd[1] * k;
    }
    x0 += shake;
    const fr = M[name].frames[f], lp = fr.lamp;
    return { name, img: sheet[name], sack: sackSheet[name], f, x: x0, y: y0, w: MINER_DRAW, h: MINER_DRAW, k,
      lx: x0 + lp[0] * k, ly: y0 + lp[1] * k, sx: x0 + fr.bag[0] * k, sy: y0 + fr.bag[1] * k };
  }

  // ---- drawing --------------------------------------------------------------------------------
  let lastFrameT = performance.now();
  function draw() {
    advance();
    const t = performance.now(), frameDt = Math.min(0.25, (t - lastFrameT) / 1000);
    lastFrameT = t;
    Music.update(frameDt, levelNow());
    const L = vx0, R = vx0 + VW, CX = IMG_W / 2;

    // the camera: follows his hands down to the middle of the screen, then the shaft scrolls past him
    const want = Math.max(-TOP_OFF, levelY(state === 'caught' && caught ? caught.depth : depth) - MID);
    if (camEase) {
      const a = clamp01((t - camEase.at) / 1200), e = a * a * (3 - 2 * a);
      camY = camEase.from + (want - camEase.from) * e;
      if (a >= 1) camEase = null;
    } else camY = want;
    // the caught moment ends: the new round starts at the hatch, and the camera rises back to it
    if (state === 'caught' && caught && t - caught.at > 2600) {
      camEase = { from: camY, at: t }; caught = null; resetRun(); mineHash = blockHash; simT = performance.now();
    }

    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, -vx0 * dpr * scale, 0);
    ctx.fillStyle = '#060403'; ctx.fillRect(0, 0, IMG_W, IMG_H);
    drawShaft();

    // the bell flares when it rings (while the hatch is on screen)
    const sinceBell = (t - bellFlashAt) / 1000;
    if (sinceBell < 5 && camY < HATCH_Y) {
      const a = Math.max(0, 1 - sinceBell / 5) * (0.75 + 0.25 * Math.sin(sinceBell * 9));
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const by = BELL.y - camY, g = ctx.createRadialGradient(BELL.x, by, 0, BELL.x, by, 300);
      g.addColorStop(0, 'rgba(255,200,110,' + 0.8 * a + ')'); g.addColorStop(0.3, 'rgba(255,150,50,' + 0.35 * a + ')'); g.addColorStop(1, 'rgba(255,120,30,0)');
      ctx.fillStyle = g; ctx.fillRect(BELL.x - 300, by - 300, 600, 600); ctx.restore();
    }

    const pose = minerPose(t);
    const lampX = pose ? pose.lx : LADDER_X, lampY = pose ? pose.ly : levelY(depth) - camY + 120;
    const flick = 1 + 0.035 * Math.sin(t / 77) + 0.025 * Math.sin(t / 131 + 1.3);

    // deposits, one per level, alternating sides
    const lvlTop = Math.max(1, Math.floor((camY - 200 - ANCHOR0) / GAP)), lvlBot = Math.ceil((camY + FADE_BOT - ANCHOR0) / GAP) + 1;
    const here = state === 'caught' && caught ? Math.max(1, Math.floor(caught.depth + 1e-6)) : Math.max(0, Math.floor(depth + 1e-6));
    for (let n = lvlTop; n <= lvlBot; n++) drawDeposit(deposit(n), t, lampX, lampY, here, 'base');
    // the dark of the deep: darker every 3 levels, but never inside the lamp's circle
    drawDark(lampX, lampY, flick);
    for (let n = lvlTop; n <= lvlBot; n++) drawDeposit(deposit(n), t, lampX, lampY, here, 'light');

    // his lamp lights the walls and the rock around him
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const R1 = LAMP_R * flick, g = ctx.createRadialGradient(lampX, lampY, 0, lampX, lampY, R1);
    g.addColorStop(0, 'rgba(255,200,115,.55)'); g.addColorStop(0.12, 'rgba(255,165,60,.32)'); g.addColorStop(0.45, 'rgba(225,115,30,.14)'); g.addColorStop(1, 'rgba(200,90,20,0)');
    ctx.fillStyle = g; ctx.fillRect(lampX - R1, lampY - R1, R1 * 2, R1 * 2);
    ctx.restore();

    // level marks beside the ladder, numbered without end
    const cur = state === 'caught' && caught ? Math.max(1, Math.floor(caught.depth + 1e-6)) : levelNow();
    const clearTop = TOP_PANEL + safeTop + 70;   // below the top panel's fade; above the bottom panel's
    for (let n = Math.max(1, lvlTop); n <= lvlBot; n++) {
      const y = levelY(n) - camY, on = n === cur;
      // a mark and its number are drawn only where no panel is: they fade out before they reach a panel's fade
      const vis = clamp01((y - 34 - clearTop) / 30) * clamp01((FADE_TOP - (y + 18)) / 30);
      if (vis <= 0) continue;
      ctx.save(); ctx.globalAlpha = vis;
      shadow(on ? 18 : 6, on ? 'rgba(255,170,60,.9)' : 'rgba(0,0,0,.9)');
      ctx.strokeStyle = on ? AMBER_HI : 'rgba(214,190,150,.5)'; ctx.lineWidth = on ? 5 : 3;
      ctx.beginPath(); ctx.moveTo(on ? 446 : 458, y); ctx.lineTo(503, y); ctx.stroke();
      text(String(n), on ? 432 : 442, y + (on ? 14 : 11), on ? 40 : 30, on ? 'num700' : 'num500', on ? AMBER_HI : 'rgba(214,196,160,.6)', 'right');
      ctx.restore();
    }

    drawStones(t, frameDt);
    drawFloats(t, clearTop);

    // the near-black panel over the bottom quarter
    const pg = ctx.createLinearGradient(0, FADE_TOP, 0, FADE_BOT);
    pg.addColorStop(0, 'rgba(6,4,3,0)'); pg.addColorStop(1, 'rgba(6,4,3,.97)');
    ctx.fillStyle = pg; ctx.fillRect(L, FADE_TOP, VW, FADE_BOT - FADE_TOP);
    ctx.fillStyle = 'rgba(6,4,3,.97)'; ctx.fillRect(L, FADE_BOT, VW, IMG_H - FADE_BOT);
    // and the same at the top, so nothing scrolls behind the clock and the text
    const tp = TOP_PANEL + safeTop, tg = ctx.createLinearGradient(0, tp, 0, tp + 70);
    tg.addColorStop(0, 'rgba(6,4,3,.97)'); tg.addColorStop(1, 'rgba(6,4,3,0)');
    ctx.fillStyle = 'rgba(6,4,3,.97)'; ctx.fillRect(L, 0, VW, tp);
    ctx.fillStyle = tg; ctx.fillRect(L, tp, VW, 70);

    // the miner, and the hot core of his lamp
    if (pose && ready(pose.img)) {
      ctx.save(); shadow(16, 'rgba(0,0,0,.85)');
      ctx.drawImage(pose.img, pose.f * FRAME, 0, FRAME, FRAME, pose.x, pose.y, pose.w, pose.h);
      ctx.restore();
      // the sack on his back, hung from its straps: smaller as the bag empties
      const count = state === 'caught' && caught ? caught.count : bagCount;
      const ss = 0.5 + 0.5 * clamp01(count / 25);
      if (ready(pose.sack)) {
        ctx.save(); ctx.translate(pose.sx, pose.sy); ctx.scale(ss, ss);
        ctx.drawImage(pose.sack, pose.f * FRAME, 0, FRAME, FRAME, pose.x - pose.sx, pose.y - pose.sy, pose.w, pose.h);
        ctx.restore();
      }
      sackAt = { x: pose.sx, y: pose.sy + 70 * ss };
    }
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const cg = ctx.createRadialGradient(lampX, lampY, 0, lampX, lampY, 30 * flick);
    cg.addColorStop(0, 'rgba(255,224,160,.7)'); cg.addColorStop(1, 'rgba(255,160,60,0)');
    ctx.fillStyle = cg; ctx.fillRect(lampX - 36, lampY - 36, 72, 72); ctx.restore();

    drawBits(t, frameDt);

    shadow(10);
    // ---- top: streak, block, best; the clock; the previous blocks
    const rowY = 54 + safeTop;
    const streakS = 'Streak ' + shownStreak() + ' day' + (shownStreak() === 1 ? '' : 's');
    const bestS = 'Best: ' + (rec.best ? 'level ' + rec.best : '—');
    const sidePx = Math.min(40, fit(streakS, 40, 600, VW * 0.3), fit(bestS, 40, 600, VW * 0.3));
    const sw = measure(streakS, sidePx, 600), bw = measure(bestS, sidePx, 600);
    text(streakS, L + 30, rowY, sidePx, 600, CREAM, 'left');
    text(bestS, R - 30, rowY, sidePx, 600, CREAM, 'right');
    const blockS = blockHeight === null ? (feed === 'lost' ? 'NO FEED' : 'CONNECTING…') : 'BLOCK ' + blockHeight.toLocaleString('en-US') + ' OPEN';
    const room = Math.min(CX - (L + 30 + sw + 24), (R - 30 - bw - 24) - CX) * 2;
    let blockPx = fit(blockS, 32, 'num600', room, 3), clockY, clockPx, prevY, prevPx;
    if (blockPx >= 27) { text(blockS, CX, rowY - 2, blockPx, 'num600', CREAM, 'center', 3); clockY = rowY + 78; clockPx = 84; prevY = clockY + 36; prevPx = 25; }
    else { blockPx = fit(blockS, 28, 'num600', VW - 60, 3); text(blockS, CX, rowY + 40, blockPx, 'num600', CREAM, 'center', 3); clockY = rowY + 98; clockPx = 62; prevY = clockY + 30; prevPx = 22; }
    if (blockHeight !== null) {
      const cs = fmtClock(clockNow() - blockAt);
      text(cs, CX, clockY, clockPx, 'num700', CREAM, 'center', 1);
      // once the hatch has scrolled away, a small glowing bell beside the clock
      if (camY > HATCH_Y - 60) drawBellIcon(CX - measure(cs, clockPx, 'num700', 1) / 2 - 46, clockY - clockPx * 0.36, t);
      if (prevTimes.length) {
        const ps = 'previous ' + prevTimes.map(fmtClock).join(' · ') + (avgTime ? ' · average ' + fmtClock(avgTime) : '');
        text(ps, CX, prevY, fit(ps, prevPx, 'num500', VW - 70, 0.5), 'num500', 'rgba(205,192,168,.78)', 'center', 0.5);
      }
    }

    // TEST badge (test mode only)
    if (TEST) {
      shadow(0);
      const tx = L + 30, ty = rowY + 24;
      ctx.fillStyle = AMBER; ctx.fillRect(tx, ty, 176, 74);
      text('TEST', tx + 88, ty + 57, 58, 700, '#120b03', 'center', 5);
      text('fake bell, about 60 s', tx, ty + 112, 32, 700, AMBER, 'left');
      shadow(10);
    }

    // mute (M) and music (N), under "Best"
    const mx = R - 62, my = rowY + 30, ms = 52;
    muteRect = { x: mx - 14, y: my - 14, w: ms + 28, h: ms + 28 };
    drawSpeaker(mx, my, ms);
    const nx = mx - 74;
    musicRect = { x: nx - 14, y: my - 14, w: ms + 28, h: ms + 28 };
    drawNote(nx, my, ms);

    // ---- LEVEL (left) and BAG (right)
    const lcx = (L + WALL_L) / 2 - 4, rcx = (WALL_R + R) / 2 + 4, sideW = Math.min(WALL_L - L, R - WALL_R) - 36;
    text('LEVEL', lcx, 322, fit('LEVEL', 48, 600, sideW, 6), 600, CREAM, 'center', 6);
    const curS = String(cur);
    text(curS, lcx, 462, fit(curS, 132, 'num700', sideW), 'num700', CREAM, 'center');
    text('BAG', rcx, 322, 48, 600, CREAM, 'center', 6);
    // the bag number counts up and down to the bag's value
    bagShown += (bag - bagShown) * Math.min(1, frameDt * 6); if (Math.abs(bag - bagShown) < 0.6) bagShown = bag;
    const bagS = Math.max(0, Math.round(bagShown)).toLocaleString('en-US'), bagPx = fit(bagS, 132, 'num700', sideW);
    text(bagS, rcx, 462, bagPx, 'num700', CREAM, 'center');
    text('points', rcx, 526, 44, 600, CREAM, 'center');
    // a red "-N" beside it for a moment when a stone falls out
    minus = minus.filter((m) => t - m.at < 1600);
    minus.forEach((m, i) => {
      const a = (t - m.at) / 1600;
      ctx.save(); ctx.globalAlpha = a < 0.75 ? 1 : (1 - a) / 0.25; shadow(10);
      text('-' + m.v.toLocaleString('en-US'), rcx - measure(bagS, bagPx, 'num700') / 2 - 14, 400 + i * 50 - a * 20, 50, 'num700', '#ff5a4a', 'right');
      ctx.restore();
    });

    // ---- the panel: at the hatch (and when caught) the message band, else the percentage band; then the button(s)
    shadow(0);
    if (state === 'hatch' || state === 'caught') {
      const age = msg ? t - msg.at : 1e9;
      if (msg && age < msg.ttl) drawBand(msg.big, msg.small, Math.min(1, (msg.ttl - age) / 800));
      else { msg = null; if (state === 'hatch' && blockHeight !== null) drawBand('Banked: ' + (rec.banked || 0).toLocaleString('en-US') + ' points', '', 1, true); }
    } else {
      const pct = Math.round(bellChance() * 100) + '%';
      ctx.save(); shadow(30, 'rgba(255,150,40,.45)');
      text(pct, CX, 1606, 132, 'num700', AMBER, 'center');
      ctx.restore();
      text('chance the bell beats you', CX, 1668, fit('chance the bell beats you', 40, 600, VW - 60, 1), 600, DIM, 'center', 1);
    }

    const bx = L + 34, bw2 = VW - 68, by = 1706, bh = Math.max(150, IMG_H - 26 - safeBot - by);
    buttonRect = { x: bx, y: by, w: bw2, h: bh };
    let label, enabled = true;
    if (blockHeight === null) { label = feed === 'lost' ? 'NO FEED' : 'CONNECTING'; enabled = false; }
    else if (state === 'caught') { label = 'THE BELL RANG'; enabled = false; }
    else if (feed !== 'live') { label = 'PAUSED'; enabled = false; }
    else if (state === 'hatch') label = 'GO DOWN';
    else if (state === 'down') label = 'CLIMB OUT';
    else if (state === 'up') label = undefined;
    speedRects = [];
    if (state === 'up' && label === undefined) {   // climbing: three speeds side by side, one thumb each
      const gap = 16, w = (bw2 - gap * 2) / 3;
      SPEEDS.forEach((S, i) => {
        const r = { x: bx + i * (w + gap), y: by, w, h: bh };
        speedRects.push(r);
        drawSpeed(r, S, Math.round(bellChance(i) * 100) + '%', i === speed);
      });
    } else drawButton(bx, by, bw2, bh, label || 'CLIMBING…', enabled && !!label);

    // ---- the lost feed, over the shaft
    if (feed === 'lost' && blockHeight !== null) drawCard('Lost the Bitcoin feed.', 'Paused until it is back. A block missed meanwhile never catches you.', 1);

    requestAnimationFrame(draw);
  }

  // the shaft: the painting's top once, then a strip from its middle, mirrored every second tile so no seam shows
  // the repeating tile: rows STRIP_Y..+STRIP_H, with the BLEND rows below them faded in over its top. Its top row
  // continues the row above (TOP_END = STRIP_Y + STRIP_H), and its bottom row runs into the next tile's top.
  let tile = null;
  function makeTile() {
    const c = document.createElement('canvas'); c.width = IMG_W; c.height = STRIP_H; const g = c.getContext('2d');
    g.drawImage(shaft, 0, STRIP_Y, IMG_W, STRIP_H, 0, 0, IMG_W, STRIP_H);
    const b = document.createElement('canvas'); b.width = IMG_W; b.height = BLEND; const bg = b.getContext('2d');
    bg.drawImage(shaft, 0, STRIP_Y + STRIP_H, IMG_W, BLEND, 0, 0, IMG_W, BLEND);
    bg.globalCompositeOperation = 'destination-in';
    const gr = bg.createLinearGradient(0, 0, 0, BLEND); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    bg.fillStyle = gr; bg.fillRect(0, 0, IMG_W, BLEND);
    g.drawImage(b, 0, 0);
    return c;
  }
  function drawShaft() {
    if (!ready(shaft)) return;
    if (!tile) tile = makeTile();
    const top = 0 - camY;
    if (top + TOP_END > 0) ctx.drawImage(shaft, 0, 0, IMG_W, TOP_END, 0, top, IMG_W, TOP_END + 0.5);
    const k0 = Math.max(0, Math.floor((camY - TOP_END) / STRIP_H)), k1 = Math.floor((camY + IMG_H - TOP_END) / STRIP_H);
    for (let k = k0; k <= k1; k++) ctx.drawImage(tile, 0, TOP_END + k * STRIP_H - camY, IMG_W, STRIP_H + 0.5);
  }

  // pass 'base': the picture itself, under the darkness; pass 'light': its glow in the lamp light, over the darkness
  function drawDeposit(d, t, lampX, lampY, here, pass) {
    const art = deps[d.kind];
    if (!art) return;
    const cx = d.x, cy = levelY(d.n) + d.dy - camY;
    if (cy < -GAP || cy > FADE_BOT + GAP) return;
    const h = GAP * 0.95 * d.scale, w = h * art.w / art.h;   // about one level tall
    const ch = chipped.get(d.n), sinceChip = ch ? (t - ch) / 1000 : -1;
    const dist = Math.hypot(cx - lampX, cy - lampY), prox = Math.pow(clamp01(1 - dist / LAMP_R), 1.2);
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(d.rot);
    if (d.side > 0) ctx.scale(-1, 1);              // turned to grow out of the wall on its side
    const shrink = sinceChip >= 0 ? 1 - 0.18 * clamp01(sinceChip / 0.5) : 1;
    ctx.scale(shrink, shrink);
    if (pass === 'base') {
      // chipped: it dims and crumbles
      ctx.globalAlpha = sinceChip >= 0 ? 1 - 0.65 * clamp01(sinceChip / 0.5) : 1;
      ctx.drawImage(art.base, -w / 2, -h / 2, w, h);
    } else if (art.glow && sinceChip < 0) {
      // in the lamp light it shines at full colour; outside it, only the darkness's dim view of it
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.45 * prox * (d.kind === 'bellgold' ? 1.3 : 1);
      ctx.drawImage(art.glow, -w / 2, -h / 2, w, h);
      if (art.rim) { ctx.globalAlpha = 0.25 + 0.6 * prox; ctx.drawImage(art.rim, -w / 2, -h / 2, w, h); }
    }
    ctx.restore();
    if (pass === 'base') return;
    // bell gold glimmers, seen from up to 3 levels above it
    if (d.gold && sinceChip < 0 && d.n <= here + GOLD_SEEN) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const gg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 80);
      const pulse = 0.55 + 0.45 * Math.sin(t / 420 + d.phase);
      gg.addColorStop(0, 'rgba(255,205,90,' + (0.28 * pulse) + ')'); gg.addColorStop(1, 'rgba(255,170,40,0)');
      ctx.fillStyle = gg; ctx.fillRect(cx - 80, cy - 80, 160, 160);
      ctx.strokeStyle = '#fff0c0'; ctx.lineCap = 'round';
      for (const [sx, sy, ph, sp] of d.sparks) {
        const a = Math.max(0, Math.sin(t / 1000 * 2.4 * sp + ph)); if (a < 0.05) continue;
        const px = cx + sx * w, py = cy + sy * h, r = 5 + 9 * a;
        ctx.globalAlpha = a; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(px - r, py); ctx.lineTo(px + r, py); ctx.moveTo(px, py - r); ctx.lineTo(px, py + r); ctx.stroke();
        ctx.beginPath(); ctx.arc(px, py, 2.2, 0, Math.PI * 2); ctx.fillStyle = '#fff6d8'; ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawBits(t, dt) {   // crumbs of a chipped deposit
    bits = bits.filter((b) => (t - b.at) < 1300);
    ctx.save();
    for (const b of bits) {
      b.vy += 420 * dt; b.x += b.vx * dt; b.wy += b.vy * dt;
      ctx.globalAlpha = clamp01(1 - (t - b.at) / 1300); ctx.fillStyle = b.c;
      ctx.beginPath(); ctx.ellipse(b.x, b.wy - camY, b.s / 2, b.s * 0.38, b.vx * 0.01, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // "+N" rises beside the deposit and fades out within one level's height; never into the top panel
  function drawFloats(t, clearTop) {
    floats = floats.filter((f) => t - f.at < 1200);
    for (const f of floats) {
      const a = clamp01((t - f.at) / 1200), e = 1 - Math.pow(1 - a, 2);
      const side = f.x < LADDER_X ? -1 : 1, x = f.x + side * 70, y = f.wy - camY - 20 - e * GAP * 0.85;
      const vis = (a < 0.3 ? 1 : 1 - (a - 0.3) / 0.7) * clamp01((y - 40 - clearTop) / 30);
      if (vis <= 0) continue;
      ctx.save(); shadow(16, f.gold ? 'rgba(255,200,80,.9)' : 'rgba(0,0,0,.9)'); ctx.globalAlpha = vis;
      text('+' + f.v.toLocaleString('en-US'), x, y, f.gold ? 58 : 48, 'num700', f.gold ? '#ffe08a' : AMBER_HI, 'center');
      ctx.restore();
    }
  }

  // falling stones: each keeps its own look as it tumbles down the shaft, bounces once off a wall and fades into the dark
  function drawStones(t, dt) {
    stones = stones.filter((s) => t - s.at < 4500 && s.wy - camY < IMG_H + 100);
    for (const s of stones) {
      s.vy += s.g * dt; s.x += s.vx * dt; s.wy += s.vy * dt; s.rot += s.vr * dt;
      if (!s.bounced && (s.x < 418 || s.x > 676)) { s.bounced = true; s.x = s.x < 418 ? 418 : 676; s.vx = -s.vx * 0.5; s.vy = Math.min(s.vy, 0) * 0.3 - 40; s.vr = -s.vr * 1.3; }
      s.trail.push([s.x, s.wy]); if (s.trail.length > 10) s.trail.shift();
      const art = deps[s.kind], y = s.wy - camY;
      const fade = clamp01((FADE_TOP + 40 - y) / 260), sz = s.kind === 'bellgold' ? 92 : 84;
      if (fade <= 0) continue;
      ctx.save();
      if (s.kind === 'ember') {   // a warm trail
        ctx.globalCompositeOperation = 'lighter';
        s.trail.forEach(([tx, ty], i) => { const r = 4 + i * 1.6, g = ctx.createRadialGradient(tx, ty - camY, 0, tx, ty - camY, r * 2);
          g.addColorStop(0, 'rgba(255,140,40,' + (0.06 * i * fade) + ')'); g.addColorStop(1, 'rgba(255,90,20,0)'); ctx.fillStyle = g; ctx.fillRect(tx - r * 2, ty - camY - r * 2, r * 4, r * 4); });
        ctx.globalCompositeOperation = 'source-over';
      }
      if (s.kind === 'bellgold' && Math.random() < 0.7) sparks.push({ x: s.x + (Math.random() - 0.5) * 30, wy: s.wy + (Math.random() - 0.5) * 30, at: t, vy: -20 + Math.random() * 40 });
      ctx.globalAlpha = fade;
      ctx.translate(s.x, y); ctx.rotate(s.rot);
      if (art && art.stone) {
        const w = sz * art.stone.width / Math.max(art.stone.width, art.stone.height), h = sz * art.stone.height / Math.max(art.stone.width, art.stone.height);
        ctx.drawImage(art.stone, -w / 2, -h / 2, w, h);
        if (s.kind === 'copper') { ctx.globalAlpha = fade * 0.45; ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = '#1a120a'; ctx.fillRect(-w / 2, -h / 2, w, h); }   // dull, no glow
      }
      ctx.restore();
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      if (s.kind === 'moonstone') {   // a cold blue flash
        const fl = Math.max(0, Math.sin((t - s.at) / 1000 * 9)) ** 6 * fade;
        if (fl > 0.02) { const g = ctx.createRadialGradient(s.x, y, 0, s.x, y, 70); g.addColorStop(0, 'rgba(170,210,255,' + 0.8 * fl + ')'); g.addColorStop(1, 'rgba(120,170,255,0)'); ctx.fillStyle = g; ctx.fillRect(s.x - 70, y - 70, 140, 140); }
      } else if (s.kind === 'blackglass') {   // a thin gold glint
        const gl = Math.max(0, Math.sin((t - s.at) / 1000 * 7 + 1)) ** 8 * fade;
        if (gl > 0.02) { ctx.strokeStyle = 'rgba(255,205,110,' + gl + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(s.x - 22, y + 10); ctx.lineTo(s.x + 22, y - 10); ctx.stroke(); }
      } else if (s.kind === 'bellgold' || s.kind === 'ember') {
        const g = ctx.createRadialGradient(s.x, y, 0, s.x, y, 40), c = s.kind === 'ember' ? '255,140,50' : '255,210,100';
        g.addColorStop(0, 'rgba(' + c + ',' + 0.35 * fade + ')'); g.addColorStop(1, 'rgba(' + c + ',0)'); ctx.fillStyle = g; ctx.fillRect(s.x - 40, y - 40, 80, 80);
      }
      ctx.restore();
    }
    // bell gold's sparkles, all the way down
    sparks = sparks.filter((p) => t - p.at < 700);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = '#fff0c0'; ctx.lineWidth = 2;
    for (const p of sparks) {
      const a = 1 - (t - p.at) / 700, y = p.wy - camY + p.vy * (t - p.at) / 1000, r = 3 + 6 * a;
      if (y > FADE_TOP) continue;
      ctx.globalAlpha = a; ctx.beginPath(); ctx.moveTo(p.x - r, y); ctx.lineTo(p.x + r, y); ctx.moveTo(p.x, y - r); ctx.lineTo(p.x, y + r); ctx.stroke();
    }
    ctx.restore();
  }

  // the message band in the bottom panel, where the percentage is while he is below
  function drawBand(big, small, alpha, quiet) {
    const L = vx0, w = VW - 80, CX = IMG_W / 2;
    const bigPx = quiet ? 64 : 50, bigLines = wrap(big, bigPx, 700, w), smallLines = small ? wrap(small, 34, 600, w) : [];
    const h = bigLines.length * (bigPx + 8) + smallLines.length * 42;
    let y = 1588 - h / 2 + bigPx * 0.75;
    ctx.save(); ctx.globalAlpha = alpha;
    bigLines.forEach((l) => { ctx.save(); shadow(24, 'rgba(255,150,40,.35)'); text(l, CX, y, bigPx, 700, quiet ? AMBER : AMBER_HI, 'center'); ctx.restore(); y += bigPx + 8; });
    smallLines.forEach((l) => { text(l, CX, y + 4, 34, 600, DIM, 'center'); y += 42; });
    ctx.restore();
  }

  // one of the three speed buttons: its name, its own live risk, and "drops stones" under FAST and RUN
  function drawSpeed(r, S, pct, on) {
    ctx.save();
    shadow(on ? 36 : 0, 'rgba(255,150,30,.4)');
    const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    if (on) { g.addColorStop(0, '#ffcf6a'); g.addColorStop(0.5, '#f4a93a'); g.addColorStop(1, '#c97c1c'); }
    else { g.addColorStop(0, '#5a4220'); g.addColorStop(1, '#3a2a14'); }
    roundRect(r.x, r.y, r.w, r.h, 30); ctx.fillStyle = g; ctx.fill();
    shadow(0); ctx.lineWidth = on ? 4 : 3; ctx.strokeStyle = on ? '#7a4a12' : 'rgba(214,168,96,.55)'; ctx.stroke();
    const ink = on ? '#22150a' : '#f0d9a8', cx = r.x + r.w / 2, drops = S.drop > 0;
    const top = r.y + r.h * (drops ? 0.34 : 0.4);
    text(S.name, cx, top, fit(S.name, 54, 700, r.w - 24, 2), 700, ink, 'center', 2);
    text(pct, cx, top + 62, 56, 'num700', on ? '#3a1d05' : AMBER, 'center');
    if (drops) text('drops stones', cx, top + 104, fit('drops stones', 28, 600, r.w - 20), 600, on ? '#4a2a0c' : 'rgba(240,217,168,.75)', 'center');
    ctx.restore();
  }

  function drawBellIcon(x, y, t) {
    const ring = (t - bellFlashAt) / 1000 < 5;
    const glow = 0.55 + 0.25 * Math.sin(t / 600) + (ring ? 0.4 * Math.abs(Math.sin(t / 90)) : 0);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y + 4, 0, x, y + 4, 44);
    g.addColorStop(0, 'rgba(255,190,90,' + (0.5 * glow) + ')'); g.addColorStop(1, 'rgba(255,150,40,0)');
    ctx.fillStyle = g; ctx.fillRect(x - 44, y - 40, 88, 88);
    ctx.globalCompositeOperation = 'source-over';
    if (ring) ctx.translate(Math.sin(t / 60) * 2, 0);
    ctx.fillStyle = '#f0b354'; ctx.strokeStyle = '#7a4a12'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 16, y + 14); ctx.quadraticCurveTo(x - 13, y + 8, x - 12, y - 4);
    ctx.quadraticCurveTo(x - 11, y - 16, x, y - 17); ctx.quadraticCurveTo(x + 11, y - 16, x + 12, y - 4);
    ctx.quadraticCurveTo(x + 13, y + 8, x + 16, y + 14); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y + 17, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(x - 3, y - 22, 6, 6);
    ctx.restore();
  }

  function drawButton(x, y, w, h, label, enabled) {
    ctx.save();
    ctx.globalAlpha = enabled ? 1 : 0.42;
    shadow(enabled ? 40 : 0, 'rgba(255,150,30,.35)');
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#ffcf6a'); g.addColorStop(0.5, '#f4a93a'); g.addColorStop(1, '#c97c1c');
    roundRect(x, y, w, h, 40); ctx.fillStyle = g; ctx.fill();
    shadow(0);
    ctx.lineWidth = 4; ctx.strokeStyle = '#7a4a12'; ctx.stroke();
    roundRect(x + 9, y + 9, w - 18, h - 18, 32); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,236,180,.55)'; ctx.stroke();
    const px = fit(label, 112, 700, w - 90, 3);
    text(label, x + w / 2, y + h / 2 + px * 0.33, px, 700, '#22150a', 'center', 3);
    ctx.restore();
  }

  function drawCard(big, small, alpha) {
    const L = vx0, w = VW - 110, x = L + 55;
    const bigLines = wrap(big, 52, 700, w - 60), smallLines = small ? wrap(small, 36, 600, w - 60) : [];
    const h = 50 + bigLines.length * 60 + smallLines.length * 44 + 30;
    const y = 640 - h / 2;
    ctx.save(); ctx.globalAlpha = alpha;
    shadow(30, 'rgba(0,0,0,.9)');
    roundRect(x, y, w, h, 18); ctx.fillStyle = 'rgba(10,7,4,.9)'; ctx.fill();
    shadow(0); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(214,168,96,.7)'; ctx.stroke();
    let yy = y + 50 + 30;
    bigLines.forEach((l) => { text(l, x + w / 2, yy, 52, 700, AMBER_HI, 'center'); yy += 60; });
    yy += 4;
    smallLines.forEach((l) => { text(l, x + w / 2, yy, 36, 600, DIM, 'center'); yy += 44; });
    ctx.restore();
  }

  function drawSpeaker(x, y, s) {
    ctx.save();
    ctx.globalAlpha = 0.85; ctx.fillStyle = CREAM; ctx.strokeStyle = CREAM; ctx.lineWidth = 4; ctx.lineCap = 'round';
    const k = s / 52;
    ctx.beginPath();
    ctx.moveTo(x + 4 * k, y + 18 * k); ctx.lineTo(x + 14 * k, y + 18 * k); ctx.lineTo(x + 27 * k, y + 6 * k);
    ctx.lineTo(x + 27 * k, y + 46 * k); ctx.lineTo(x + 14 * k, y + 34 * k); ctx.lineTo(x + 4 * k, y + 34 * k); ctx.closePath(); ctx.fill();
    if (muted) {
      ctx.beginPath(); ctx.moveTo(x + 35 * k, y + 18 * k); ctx.lineTo(x + 49 * k, y + 34 * k); ctx.moveTo(x + 49 * k, y + 18 * k); ctx.lineTo(x + 35 * k, y + 34 * k); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(x + 29 * k, y + 26 * k, 10 * k, -0.9, 0.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + 29 * k, y + 26 * k, 19 * k, -0.9, 0.9); ctx.stroke();
    }
    ctx.font = '600 ' + Math.round(18 * k) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.fillText('M', x + 26 * k, y + 70 * k);
    ctx.restore();
  }

  function drawNote(x, y, s) {
    ctx.save();
    const k = s / 52;
    ctx.globalAlpha = 0.85; ctx.strokeStyle = CREAM; ctx.fillStyle = 'rgba(239,230,210,.35)'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(x + 19 * k, y + 39 * k); ctx.lineTo(x + 19 * k, y + 12 * k); ctx.lineTo(x + 42 * k, y + 6 * k); ctx.lineTo(x + 42 * k, y + 33 * k); ctx.stroke();
    [[14, 39], [37, 33]].forEach(([cx, cy]) => { ctx.beginPath(); ctx.arc(x + cx * k, y + cy * k, 5.5 * k, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
    if (!Music.on) { ctx.beginPath(); ctx.moveTo(x + 4 * k, y + 4 * k); ctx.lineTo(x + 50 * k, y + 48 * k); ctx.stroke(); }
    ctx.fillStyle = CREAM; ctx.font = '600 ' + Math.round(18 * k) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.fillText('N', x + 26 * k, y + 70 * k);
    ctx.restore();
  }

  // ---- input ----------------------------------------------------------------------------------
  const inside = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  canvas.addEventListener('pointerdown', (e) => {
    const b = canvas.getBoundingClientRect();
    const x = vx0 + (e.clientX - b.left) / scale, y = (e.clientY - b.top) / scale;
    if (inside(muteRect, x, y)) { unlockAudio(); setMuted(!muted); return; }
    if (inside(musicRect, x, y)) { unlockAudio(); toggleMusic(); return; }
    unlockAudio(); Music.tryT = 0;
    if (state === 'up' && speedRects.length) {
      speedRects.forEach((r, i) => { if (inside({ x: r.x - 6, y: r.y - 24, w: r.w + 12, h: r.h + 40 }, x, y)) { e.preventDefault(); setSpeed(i); } });
      return;
    }
    if (inside({ x: buttonRect.x - 10, y: buttonRect.y - 24, w: buttonRect.w + 20, h: buttonRect.h + 40 }, x, y)) { e.preventDefault(); press(); }
  });
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    unlockAudio(); Music.tryT = 0;
    if (e.key === 'm' || e.key === 'M') setMuted(!muted);
    else if (e.key === 'n' || e.key === 'N') toggleMusic();
    else if (e.key === '1' || e.key === '2' || e.key === '3') setSpeed(+e.key - 1);
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); press(); }
  });

  // start
  window.startChain(TEST, onBlock, onStatus);
  requestAnimationFrame(draw);
})();
