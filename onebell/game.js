// ONE BELL: one ladder, one decision. The miner goes down by himself; tap once to climb out.
// A real new Bitcoin block rings the bell. If he is still below the hatch, the bag is lost.
// Everything is drawn on one canvas in the painting's own pixels (shaft.png is 1088 x 1920).
(function () {
  'use strict';

  // ---- the painting ---------------------------------------------------------------------------
  const IMG_W = 1088, IMG_H = 1920;
  const LADDER_X = 547;                 // centre between the two rails in shaft.png
  const HATCH_Y = 300;                  // the rim of the hatch, where the ladder starts
  const LEVEL_GAP = 84;                 // level 12 sits at 1308, just above the panel's fade
  const WALL_L = 390, WALL_R = 695;     // the shaft walls near the top
  const BELL = { x: 547, y: 242 };
  const FADE_TOP = 1365, FADE_BOT = 1452; // the bottom panel fades in here, solid below (bottom quarter = 1440)
  const levelY = (d) => HATCH_Y + d * LEVEL_GAP;

  // ---- the rules ------------------------------------------------------------------------------
  const LEVELS = 12, SEC_PER_LEVEL = 3;
  const rate = (lvl) => (lvl <= 3 ? 1 : lvl <= 6 ? 3 : lvl <= 9 ? 8 : 20);   // points per second
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
  const load = (src) => { const i = new Image(); i.src = src; return i; };
  const art = {
    shaft: load('assets/shaft.png'),
    climbA: load('../Assets/cutaway/miner_climbA.webp'),
    climbB: load('../Assets/cutaway/miner_climbB.webp'),
    stand: load('../Assets/cutaway/miner_stand.webp'),
  };
  // where the lantern sits inside each miner picture (fractions of its width / height)
  const aspect = (img) => (img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 0.38);
  const LANTERN = { climbA: [0.545, 0.411], climbB: [0.512, 0.384], stand: [0.634, 0.448] };
  const MINER_H = 300;

  // ---- the bell: the recording, once, then silence ----------------------------------------------
  const bell = new Audio('assets/sounds/bell.mp3');
  bell.preload = 'auto';
  let audioUnlocked = false;
  function unlockAudio() {            // phones only allow sound after a tap
    if (audioUnlocked) return;
    audioUnlocked = true;
    bell.muted = true;
    const p = bell.play();
    if (p && p.then) p.then(() => { bell.pause(); bell.currentTime = 0; bell.muted = false; }).catch(() => { bell.muted = false; });
    else { bell.pause(); bell.muted = false; }
  }
  function ringBell() {
    bellFlashAt = performance.now();
    Music.hush();                     // the bell is heard alone
    if (muted) return;
    try { bell.pause(); bell.currentTime = 0; bell.muted = false; const p = bell.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
  }
  function setMuted(m) {
    muted = m;
    try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch (e) {}
    if (m) { try { bell.pause(); } catch (e) {} }
  }

  // ---- music: the scored tracks from the 3D version (3d/music), one per point zone, crossfaded ----
  // Levels 1-3, 4-6, 7-9 and 10-12 each have their own loop, darker the deeper; at the hatch the first plays softer.
  // M silences everything; N (or the note button) silences only the music. When the bell rings the music stops,
  // so the bell is heard alone, and comes back softly a few seconds after the bell has died away.
  const MUSIC_KEY = 'onebell.music';
  const Music = {
    files: ['../3d/music/depth1.mp3', '../3d/music/depth2.mp3', '../3d/music/depth3.mp3', '../3d/music/depth4.mp3'],
    volume: 0.5, hatch: 0.45, fade: 2.5,       // overall level; at the hatch the first track plays softer; seconds to cross
    on: true, tracks: [], tryT: 0, holdUntil: 0,
    bandOf(l) { return l <= 3 ? 0 : l <= 6 ? 1 : l <= 9 ? 2 : 3; },   // l: the level (0 = hatch)
    track(i) {
      if (!this.tracks[i]) { const a = new Audio(this.files[i]); a.loop = true; a.preload = 'auto'; a.volume = 0; this.tracks[i] = { a, v: 0 }; }
      return this.tracks[i];
    },
    hush() {                                   // stop at once, then stay quiet through the bell and a little silence
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
        // browsers start sound only after a tap or a key: keep trying until one has happened
        if (target > 0 && t.a.paused && this.tryT <= 0) { this.tryT = 1; const p = t.a.play(); if (p && p.catch) p.catch(() => {}); }
      }
    },
  };
  try { Music.on = localStorage.getItem(MUSIC_KEY) !== '0'; } catch (e) {}
  function toggleMusic() {
    Music.on = !Music.on; Music.tryT = 0;
    try { localStorage.setItem(MUSIC_KEY, Music.on ? '1' : '0'); } catch (e) {}
  }

  // ---- state ----------------------------------------------------------------------------------
  let feed = 'connecting';              // 'connecting' | 'live' | 'lost'
  let blockHeight = null, blockAt = 0;  // the open block and when it arrived (ms)
  let state = 'hatch';                  // 'hatch' | 'down' | 'up'
  let depth = 0;                        // in levels, 0 = hatch, 12 = bottom
  let bag = 0, tickAcc = 0, deepest = 0;
  let msg = null;                       // { big, small, at, ttl }
  let bellFlashAt = -1e9;
  let simT = performance.now();
  const clockNow = () => (TEST && window.TestClock ? window.TestClock.now() : Date.now());

  const levelNow = () => (state === 'hatch' || depth <= 0 ? 0 : Math.max(1, Math.min(LEVELS, Math.floor(depth + 1e-6))));
  const climbSeconds = () => depth * SEC_PER_LEVEL;
  const bellChance = () => 1 - Math.exp(-climbSeconds() / MEAN_GAP);

  function say(big, small, ttl) { msg = { big, small: small || '', at: performance.now(), ttl: ttl || 9000 }; }

  // move the world on to "now" (also called before every block, so a hidden tab stays exact)
  function advance() {
    const now = performance.now();
    let dt = (now - simT) / 1000;
    simT = now;
    if (feed !== 'live' || state === 'hatch') return;   // a lost feed pauses the run
    while (dt > 0) {
      const h = Math.min(dt, 0.05); dt -= h;
      if (state === 'down') depth = Math.min(LEVELS, depth + h / SEC_PER_LEVEL);
      else if (state === 'up') depth = Math.max(0, depth - h / SEC_PER_LEVEL);
      deepest = Math.max(deepest, levelNow());
      tickAcc += h;
      while (tickAcc >= 1) { tickAcc -= 1; bag += rate(Math.max(1, levelNow())); }
      if (state === 'up' && depth <= 0) { bank(); return; }
    }
  }

  function bank() {
    const got = bag, lvl = deepest;
    state = 'hatch'; depth = 0; bag = 0; tickAcc = 0; deepest = 0;
    rec.runs++; rec.banked += got; rec.best = Math.max(rec.best, lvl);
    const t = today();
    if (rec.lastDay !== t) { rec.streak = rec.lastDay === yesterday() ? rec.streak + 1 : 1; rec.lastDay = t; }
    saveRec();
    say('You got out. +' + got.toLocaleString('en-US') + ' points.', 'From level ' + lvl + '. The bag is banked.');
  }

  function press() {
    unlockAudio();
    if (feed !== 'live' || blockHeight === null) return;
    advance();
    if (state === 'hatch') { state = 'down'; depth = 0; bag = 0; tickAcc = 0; deepest = 0; msg = null; }
    else if (state === 'down') { state = 'up'; }
  }

  // ---- the chain ------------------------------------------------------------------------------
  function onBlock(b) {
    advance();
    if (!b.initial && state !== 'hatch') {
      if (b.missed) {
        say('A block came while the feed was down.', 'This run does not count. Nothing lost, nothing banked.');
      } else {
        const lvl = levelNow(), secs = Math.ceil(climbSeconds() - 1e-6), lost = bag;
        ringBell();
        rec.caught++; saveRec();
        say('The bell rang. You were on level ' + lvl + ', ' + secs + ' second' + (secs === 1 ? '' : 's') + ' from the hatch.',
          'The bag is lost (' + lost.toLocaleString('en-US') + ' points).', 12000);
      }
    } else if (!b.initial && !msg) {
      say('Block ' + b.height.toLocaleString('en-US') + ' found.', 'A new round. The bell rings only for miners below.', 4000);
    }
    // a new block always starts a new round
    state = 'hatch'; depth = 0; bag = 0; tickAcc = 0; deepest = 0;
    blockHeight = b.height; blockAt = b.arrivedAt;
  }
  function onStatus(s) { advance(); feed = s; simT = performance.now(); }

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
  // the largest size up to px that fits in maxW
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

  let buttonRect = { x: 0, y: 0, w: 0, h: 0 }, muteRect = { x: 0, y: 0, w: 0, h: 0 }, musicRect = { x: 0, y: 0, w: 0, h: 0 };

  function minerPose(t) {
    if (state === 'hatch') {
      const img = art.stand, h = MINER_H * 0.74, w = h * aspect(img);
      const x = 716 - w / 2, y = HATCH_Y + 2 - h;   // on the ledge right of the hatch, facing it
      return { img, x, y, w, h, flip: true, lx: x + (1 - LANTERN.stand[0]) * w, ly: y + LANTERN.stand[1] * h };
    }
    const moving = feed === 'live' && (state === 'up' || depth < LEVELS);
    const key = moving && Math.floor(depth * 4) % 2 ? 'climbB' : 'climbA';
    const img = art[key], h = MINER_H, w = h * aspect(img);
    const lx = LADDER_X - 6, ly = levelY(depth);
    const x = lx - LANTERN[key][0] * w, y = ly - LANTERN[key][1] * h;
    return { img, x, y, w, h, lx, ly };
  }

  let lastFrame = performance.now();
  function draw() {
    advance();
    const t = performance.now(), frameDt = Math.min(0.25, (t - lastFrame) / 1000);
    lastFrame = t;
    Music.update(frameDt, levelNow());
    const L = vx0, R = vx0 + VW, CX = IMG_W / 2;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, -vx0 * dpr * scale, 0);
    ctx.fillStyle = '#060403'; ctx.fillRect(0, 0, IMG_W, IMG_H);
    if (art.shaft.complete && art.shaft.naturalWidth) ctx.drawImage(art.shaft, 0, 0, IMG_W, IMG_H);

    // the bell flares when it rings
    const sinceBell = (t - bellFlashAt) / 1000;
    if (sinceBell < 5) {
      const a = Math.max(0, 1 - sinceBell / 5) * (0.75 + 0.25 * Math.sin(sinceBell * 9));
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(BELL.x, BELL.y, 0, BELL.x, BELL.y, 300);
      g.addColorStop(0, 'rgba(255,200,110,' + 0.8 * a + ')'); g.addColorStop(0.3, 'rgba(255,150,50,' + 0.35 * a + ')'); g.addColorStop(1, 'rgba(255,120,30,0)');
      ctx.fillStyle = g; ctx.fillRect(BELL.x - 300, BELL.y - 300, 600, 600); ctx.restore();
    }

    // level marks 1-12 beside the ladder
    const cur = levelNow();
    for (let n = 1; n <= LEVELS; n++) {
      const y = levelY(n), on = n === cur;
      ctx.save();
      shadow(on ? 18 : 6, on ? 'rgba(255,170,60,.9)' : 'rgba(0,0,0,.9)');
      ctx.strokeStyle = on ? AMBER_HI : 'rgba(214,190,150,.5)'; ctx.lineWidth = on ? 5 : 3;
      ctx.beginPath(); ctx.moveTo(on ? 446 : 458, y); ctx.lineTo(503, y); ctx.stroke();
      text(String(n), on ? 432 : 442, y + (on ? 14 : 11), on ? 40 : 30, on ? 'num700' : 'num500', on ? AMBER_HI : 'rgba(214,196,160,.55)', 'right');
      ctx.restore();
    }

    // his lamp lights the rock around him
    const pose = minerPose(t);
    const flick = 1 + 0.035 * Math.sin(t / 77) + 0.025 * Math.sin(t / 131 + 1.3);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const R1 = 330 * flick, g = ctx.createRadialGradient(pose.lx, pose.ly, 0, pose.lx, pose.ly, R1);
    g.addColorStop(0, 'rgba(255,200,115,.75)'); g.addColorStop(0.15, 'rgba(255,165,60,.42)'); g.addColorStop(0.45, 'rgba(225,115,30,.15)'); g.addColorStop(1, 'rgba(200,90,20,0)');
    ctx.fillStyle = g; ctx.fillRect(pose.lx - R1, pose.ly - R1, R1 * 2, R1 * 2);
    ctx.restore();

    // the near-black panel over the bottom quarter
    const pg = ctx.createLinearGradient(0, FADE_TOP, 0, FADE_BOT);
    pg.addColorStop(0, 'rgba(6,4,3,0)'); pg.addColorStop(1, 'rgba(6,4,3,.97)');
    ctx.fillStyle = pg; ctx.fillRect(L, FADE_TOP, VW, FADE_BOT - FADE_TOP);
    ctx.fillStyle = 'rgba(6,4,3,.97)'; ctx.fillRect(L, FADE_BOT, VW, IMG_H - FADE_BOT);

    // the miner, with the lamp's hot core drawn over his lantern
    if (pose.img.complete && pose.img.naturalWidth) {
      ctx.save(); shadow(14, 'rgba(0,0,0,.8)');
      if (pose.flip) { ctx.translate(pose.x + pose.w, pose.y); ctx.scale(-1, 1); ctx.drawImage(pose.img, 0, 0, pose.w, pose.h); }
      else ctx.drawImage(pose.img, pose.x, pose.y, pose.w, pose.h);
      ctx.restore();
    }
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const cg = ctx.createRadialGradient(pose.lx, pose.ly, 0, pose.lx, pose.ly, 34 * flick);
    cg.addColorStop(0, 'rgba(255,220,150,.55)'); cg.addColorStop(1, 'rgba(255,160,60,0)');
    ctx.fillStyle = cg; ctx.fillRect(pose.lx - 40, pose.ly - 40, 80, 80); ctx.restore();

    shadow(10);
    // ---- top row: streak, block, best
    const rowY = 60 + safeTop;
    const streakS = 'Streak ' + shownStreak() + ' day' + (shownStreak() === 1 ? '' : 's');
    const bestS = 'Best: ' + (rec.best ? 'level ' + rec.best : '—');
    const sidePx = Math.min(40, fit(streakS, 40, 600, VW * 0.3), fit(bestS, 40, 600, VW * 0.3));
    const sw = measure(streakS, sidePx, 600), bw = measure(bestS, sidePx, 600);
    text(streakS, L + 30, rowY, sidePx, 600, CREAM, 'left');
    text(bestS, R - 30, rowY, sidePx, 600, CREAM, 'right');
    const blockS = blockHeight === null ? (feed === 'lost' ? 'NO FEED' : 'CONNECTING…') : 'BLOCK ' + blockHeight.toLocaleString('en-US') + ' OPEN';
    const room = Math.min(CX - (L + 30 + sw + 24), (R - 30 - bw - 24) - CX) * 2;
    let blockPx = fit(blockS, 32, 'num600', room, 3), clockY, clockPx;
    if (blockPx >= 27) { text(blockS, CX, rowY - 2, blockPx, 'num600', CREAM, 'center', 3); clockY = 170; clockPx = 98; }
    else { blockPx = fit(blockS, 30, 'num600', VW - 60, 3); text(blockS, CX, rowY + 46, blockPx, 'num600', CREAM, 'center', 3); clockY = 178; clockPx = 74; }
    if (blockHeight !== null) text(fmtClock(clockNow() - blockAt), CX, clockY + safeTop, clockPx, 'num700', CREAM, 'center', 1);

    // TEST badge (test mode only)
    if (TEST) {
      shadow(0);
      const tx = L + 30, ty = rowY + 26;
      ctx.fillStyle = AMBER; ctx.fillRect(tx, ty, 176, 74);
      text('TEST', tx + 88, ty + 57, 58, 700, '#120b03', 'center', 5);
      text('fake bell, about 60 s', tx, ty + 112, 32, 700, AMBER, 'left');
      shadow(10);
    }

    // mute, under "Best"
    const mx = R - 62, my = rowY + 32, ms = 52;
    muteRect = { x: mx - 14, y: my - 14, w: ms + 28, h: ms + 28 };
    drawSpeaker(mx, my, ms);
    const nx = mx - 74;
    musicRect = { x: nx - 14, y: my - 14, w: ms + 28, h: ms + 28 };
    drawNote(nx, my, ms);

    // ---- LEVEL (left) and BAG (right)
    const lcx = (L + WALL_L) / 2 - 4, rcx = (WALL_R + R) / 2 + 4, sideW = Math.min(WALL_L - L, R - WALL_R) - 36;
    text('LEVEL', lcx, 322, fit('LEVEL', 48, 600, sideW, 6), 600, CREAM, 'center', 6);
    text(String(cur), lcx, 462, 132, 'num700', CREAM, 'center');
    text('BAG', rcx, 322, 48, 600, CREAM, 'center', 6);
    const bagS = bag.toLocaleString('en-US');
    text(bagS, rcx, 462, fit(bagS, 132, 'num700', sideW), 'num700', CREAM, 'center');
    text('points', rcx, 526, 44, 600, CREAM, 'center');

    // ---- the panel: percentage band, then the button
    shadow(0);
    const pct = Math.round(bellChance() * 100) + '%';
    ctx.save(); shadow(30, 'rgba(255,150,40,.45)');
    text(pct, CX, 1606, 132, 'num700', AMBER, 'center');
    ctx.restore();
    text('chance the bell beats you', CX, 1668, fit('chance the bell beats you', 40, 600, VW - 60, 1), 600, DIM, 'center', 1);

    const bx = L + 34, bw2 = VW - 68, by = 1706, bh = Math.max(150, IMG_H - 26 - safeBot - by);
    buttonRect = { x: bx, y: by, w: bw2, h: bh };
    let label, enabled = true;
    if (blockHeight === null) { label = feed === 'lost' ? 'NO FEED' : 'CONNECTING'; enabled = false; }
    else if (feed !== 'live') { label = 'PAUSED'; enabled = false; }
    else if (state === 'hatch') label = 'GO DOWN';
    else if (state === 'down') label = 'CLIMB OUT';
    else { label = 'CLIMBING…'; enabled = false; }
    drawButton(bx, by, bw2, bh, label, enabled);

    // ---- messages over the shaft
    if (feed === 'lost' && blockHeight !== null) drawCard('Lost the Bitcoin feed.', 'Paused until it is back. A block missed meanwhile never catches you.', 1);
    else if (msg) {
      const age = t - msg.at;
      if (age > msg.ttl) msg = null;
      else drawCard(msg.big, msg.small, Math.min(1, (msg.ttl - age) / 800));
    }

    requestAnimationFrame(draw);
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
    const y = 760 - h / 2;
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
    unlockAudio(); Music.tryT = 0;     // any tap lets the music start
    if (inside({ x: buttonRect.x - 10, y: buttonRect.y - 24, w: buttonRect.w + 20, h: buttonRect.h + 40 }, x, y)) { e.preventDefault(); press(); }
  });
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    unlockAudio(); Music.tryT = 0;
    if (e.key === 'm' || e.key === 'M') { setMuted(!muted); }
    else if (e.key === 'n' || e.key === 'N') { toggleMusic(); }
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); press(); }
  });

  // start
  window.startChain(TEST, onBlock, onStatus);
  requestAnimationFrame(draw);
})();
