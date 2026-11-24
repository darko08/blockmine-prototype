// ONE BELL: the village, the home screen. Ores from the mine are smelted and worked into goods, goods fill orders for
// coins, and coins, goods and bell gold raise the bell tower. Everything is kept in this browser (localStorage).
// game.js calls window.makeVillage(G) with its canvas and drawing helpers; this file draws and handles the village.
window.makeVillage = function (G) {
  'use strict';
  const { ctx, IMG_W, IMG_H, ORES, text, fit, measure, shadow, roundRect, wrap, clamp01, fmtClock, drawOreIcon } = G;
  const { CREAM, DIM, AMBER, AMBER_HI } = G.colors;

  // ---- the painting and its plots (anchors: the centre of each plot's ground, in painting pixels) ----------------
  // daylight: hill-day.png and the buildings in assets/village/day (the dusk ones stay in the repo, unused)
  const hill = G.load('assets/village/hill-day.png?v=1');
  const FX = window.makeVillageFx(G);
  // where the chimney top and the fire are inside the smelter and glassworks sprites (fractions of their size)
  const MARKS = { smelter: { chimney: [0.652, 0.004], fire: [0.361, 0.544] }, glassworks: { chimney: [0.652, 0.004], fire: [0.62, 0.626] } };
  const MOTION_KEY = 'onebell.reduceMotion';
  let reduce = false; try { reduce = localStorage.getItem(MOTION_KEY) === '1'; } catch (e) {}
  let motionRect = { x: 0, y: 0, w: 0, h: 0 }, lastT = 0;
  const BUILDINGS = ['smelter', 'lampworks', 'jeweller', 'glassworks', 'cottage', 'tower'];
  const art = {}; BUILDINGS.forEach((k) => { art[k] = G.load('assets/village/day/' + k + '.png?v=1'); });
  const P = (x, y, w) => ({ x: IMG_W * x / 100, y: IMG_H * y / 100, w });
  const PLOTS = {
    P1: P(69, 28, 330), P2: P(33, 38, 300), P3: P(65, 44, 300), P4: P(24, 56, 330), P5: P(77, 57, 320),
    P6: P(23, 67, 320), P7: P(84, 67, 250), P8: P(23, 77, 290), P9: P(85, 78, 250),
  };
  const HATCH = P(57, 77, 240);
  const PLOT_ORDER = Object.keys(PLOTS).sort((a, b) => PLOTS[a].y - PLOTS[b].y);   // higher ones first

  // ---- the rules ---------------------------------------------------------------------------------------------------
  const GOODS = ['bar', 'lamp', 'jewel', 'pane'];
  const GOOD_NAME = { bar: ['copper bar', 'copper bars'], lamp: ['lamp', 'lamps'], jewel: ['jewel', 'jewels'], pane: ['pane', 'panes'] };
  const PRICE = { bar: 10, lamp: 40, jewel: 100, pane: 220 };   // coins per item, paid by orders
  const WORKSHOPS = {
    smelter: { name: 'Smelter', makes: 'bar', needs: { copper: 2 }, secs: 60 },
    lampworks: { name: 'Lamp works', makes: 'lamp', needs: { ember: 2, bar: 1 }, secs: 180 },
    jeweller: { name: 'Jeweller', makes: 'jewel', needs: { moonstone: 2, bar: 1 }, secs: 360 },
    glassworks: { name: 'Glassworks', makes: 'pane', needs: { blackglass: 2, bar: 1 }, secs: 600 },
  };
  const QUEUE_MAX = 5, COTTAGES_MAX = 4, ORDERS_MAX = 5, ORDER_GAP = 60e3, SKIP_AFTER = 180e3, TOWER_STAGES = 7;
  function buildCost(type) {
    if (type === 'smelter') return { copper: 3 };   // one short run pays for it
    if (type === 'lampworks') return { bar: 6, ember: 6 };
    if (type === 'jeweller') return { bar: 10, lamp: 4, moonstone: 6 };
    if (type === 'glassworks') return { bar: 14, jewel: 4, blackglass: 6 };
    if (type === 'cottage') return { bar: 5, lamp: 2, coins: 100 * (count('cottage') + 1) };
    return {};
  }
  function towerCost(n) {
    const c = { bellgold: 2 * n, bar: 5 * n, lamp: 2 * n, coins: 150 * n };
    if (n >= 3) c.jewel = n;
    if (n >= 5) c.pane = n;
    return c;
  }
  const ITEM_NAME = { copper: ['copper', 'copper'], ember: ['ember', 'ember'], moonstone: ['moonstone', 'moonstone'], blackglass: ['blackglass', 'blackglass'],
    bellgold: ['bell gold', 'bell gold'], bar: ['copper bar', 'copper bars'], lamp: ['lamp', 'lamps'], jewel: ['jewel', 'jewels'], pane: ['pane', 'panes'], coins: ['coin', 'coins'] };
  const itemName = (k, n) => n + ' ' + ITEM_NAME[k][n === 1 ? 0 : 1];
  const RED = '#a01808', BROWN = '#2c1a08';   // on the parchment: what is missing, and what is there
  const BUILD_NAME = { smelter: 'Smelter', lampworks: 'Lamp works', jeweller: 'Jeweller', glassworks: 'Glassworks', cottage: 'Cottage' };

  // ---- saved state -------------------------------------------------------------------------------------------------
  const KEY = G.TEST ? 'onebell.village.test.v1' : 'onebell.village.v1';
  let v = null;
  try { v = JSON.parse(localStorage.getItem(KEY)); } catch (e) { v = null; }
  v = Object.assign({ ores: {}, goods: {}, coins: 0, plots: {}, tower: 0, orders: [] }, v || {});
  ORES.forEach((k) => { v.ores[k] = v.ores[k] || 0; });
  GOODS.forEach((k) => { v.goods[k] = v.goods[k] || 0; });
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} };

  const have = (k) => (k === 'coins' ? v.coins : ORES.includes(k) ? v.ores[k] : v.goods[k]) || 0;
  function take(cost) { for (const k in cost) { if (k === 'coins') v.coins -= cost[k]; else if (ORES.includes(k)) v.ores[k] -= cost[k]; else v.goods[k] -= cost[k]; } }
  const missing = (cost) => Object.keys(cost).filter((k) => have(k) < cost[k]);
  const affordable = (cost) => missing(cost).length === 0;
  const count = (type) => Object.values(v.plots).filter((b) => b.type === type).length;
  const builtTypes = () => new Set(Object.values(v.plots).map((b) => b.type));

  // ---- workshops: one at a time, up to 5 queued; they keep working while the game is closed --------------------------
  // a workshop: { type, queue (items paid for, not finished), start (ms the current one started), ready (finished) }
  function tick(b, now) {
    const W = WORKSHOPS[b.type]; if (!W) return;
    while (b.queue > 0 && b.start != null && b.start + W.secs * 1000 <= now) { b.start += W.secs * 1000; b.queue--; b.ready++; }
    if (b.queue === 0) b.start = null;
  }
  function tickAll() {
    const now = Date.now(); let changed = false;
    for (const id in v.plots) { const b = v.plots[id]; const before = b.ready; tick(b, now); if (b.ready !== before) changed = true; }
    if (changed) save();
  }

  // ---- orders: one, plus one per cottage, up to 5 -----------------------------------------------------------------------
  const orderSlots = () => Math.min(ORDERS_MAX, 1 + count('cottage'));
  function makeable() {   // goods the player can already make
    const t = builtTypes(), g = [];
    for (const k in WORKSHOPS) if (t.has(k)) g.push(WORKSHOPS[k].makes);
    return g.length ? g : ['bar'];   // before any workshop: copper bars, the first thing to make
  }
  function newOrder() {
    const g = makeable(), good = g[Math.floor(Math.random() * g.length)], n = 1 + Math.floor(Math.random() * 4);
    return { good, n, reward: n * PRICE[good], since: Date.now() };
  }
  function tickOrders() {
    let changed = false;
    while (v.orders.length < orderSlots()) { v.orders.push(newOrder()); changed = true; }
    v.orders.forEach((o, i) => { if (o.wait && Date.now() >= o.wait) { v.orders[i] = newOrder(); changed = true; } });
    if (changed) save();
  }

  // ---- what is on screen right now ----------------------------------------------------------------------------------
  let panel = null;          // { kind: 'build' | 'workshop' | 'tower', plot }
  let orderIdx = 0;
  let flyers = [];           // things flying to the counters: { kind, from:{x,y}, to:{x,y}, at, dur, good? }
  let dust = [];             // puffs of a new building
  let toast = null;          // { text, at }
  let rects = [];            // tap targets this frame: { x, y, w, h, fn }
  const counterPos = {};     // where each counter's icon is (for flyers)
  const pendingIn = {};      // per counter: how many are still flying in (shown when they land)

  // ---- placeholder icons for goods and the coin, drawn in code (icon art will come later) ------------------------------
  function drawGood(k, x, y, s, alpha) {
    ctx.save(); ctx.globalAlpha = alpha == null ? 1 : alpha; ctx.translate(x, y); const u = s / 40;
    ctx.lineJoin = 'round'; ctx.lineWidth = 2 * u;
    if (k === 'bar') {          // a copper ingot
      const g = ctx.createLinearGradient(0, -12 * u, 0, 12 * u); g.addColorStop(0, '#f0a060'); g.addColorStop(1, '#8a4418');
      ctx.beginPath(); ctx.moveTo(-14 * u, -8 * u); ctx.lineTo(14 * u, -8 * u); ctx.lineTo(19 * u, 9 * u); ctx.lineTo(-19 * u, 9 * u); ctx.closePath();
      ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#4a2008'; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,220,170,.7)'; ctx.beginPath(); ctx.moveTo(-11 * u, -5 * u); ctx.lineTo(11 * u, -5 * u); ctx.stroke();
    } else if (k === 'lamp') {  // a miner's lamp: glowing glass in a dark frame
      const g = ctx.createRadialGradient(0, 2 * u, 0, 0, 2 * u, 14 * u); g.addColorStop(0, '#fff2b0'); g.addColorStop(0.5, '#ffb030'); g.addColorStop(1, '#a04a08');
      roundRect(-9 * u, -8 * u, 18 * u, 20 * u, 4 * u); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#2a1a0a'; ctx.stroke();
      ctx.fillStyle = '#2a1a0a'; ctx.fillRect(-11 * u, 11 * u, 22 * u, 4 * u); ctx.fillRect(-7 * u, -12 * u, 14 * u, 4 * u);
      ctx.beginPath(); ctx.arc(0, -14 * u, 5 * u, Math.PI, 0); ctx.stroke();
    } else if (k === 'jewel') { // a cut jewel
      const g = ctx.createLinearGradient(-14 * u, -12 * u, 14 * u, 14 * u); g.addColorStop(0, '#e8d0ff'); g.addColorStop(0.5, '#9a5ad8'); g.addColorStop(1, '#3c1a70');
      ctx.beginPath(); ctx.moveTo(-15 * u, -4 * u); ctx.lineTo(-8 * u, -12 * u); ctx.lineTo(8 * u, -12 * u); ctx.lineTo(15 * u, -4 * u); ctx.lineTo(0, 15 * u); ctx.closePath();
      ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#2a0e4a'; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.2 * u; ctx.beginPath(); ctx.moveTo(-15 * u, -4 * u); ctx.lineTo(15 * u, -4 * u); ctx.moveTo(-5 * u, -4 * u); ctx.lineTo(0, 15 * u); ctx.lineTo(5 * u, -4 * u); ctx.stroke();
    } else if (k === 'pane') {  // a leaded glass pane
      const g = ctx.createLinearGradient(-14 * u, -14 * u, 14 * u, 14 * u); g.addColorStop(0, '#bfe6f0'); g.addColorStop(1, '#3a7a8c');
      roundRect(-13 * u, -14 * u, 26 * u, 28 * u, 3 * u); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#1c2a2e'; ctx.lineWidth = 2.5 * u; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -14 * u); ctx.lineTo(0, 14 * u); ctx.moveTo(-13 * u, 0); ctx.lineTo(13 * u, 0); ctx.stroke();
    } else if (k === 'coins') { // a coin
      const g = ctx.createRadialGradient(-4 * u, -4 * u, 0, 0, 0, 15 * u); g.addColorStop(0, '#fff0a8'); g.addColorStop(0.6, '#e8b030'); g.addColorStop(1, '#9a6a10');
      ctx.beginPath(); ctx.arc(0, 0, 14 * u, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#6a4408'; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 9.5 * u, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(106,68,8,.7)'; ctx.lineWidth = 1.4 * u; ctx.stroke();
      ctx.fillStyle = '#7a5008'; ctx.beginPath(); ctx.moveTo(0, -5 * u); ctx.lineTo(4 * u, 0); ctx.lineTo(0, 5 * u); ctx.lineTo(-4 * u, 0); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  function drawItem(k, x, y, s, alpha) { if (ORES.includes(k)) drawOreIcon(k, x, y, s * 1.15, alpha == null ? 1 : alpha); else drawGood(k, x, y, s, alpha); }

  // ---- buildings on their plots --------------------------------------------------------------------------------------
  function geom(id, type) {   // where a building stands: its picture scaled to the plot's width, its feet on the ground
    const p = PLOTS[id], img = art[type], w = (type === 'tower' ? 0.86 : 1.06) * p.w;   // the grass patch covers the fence
    const h = G.ready(img) ? w * img.naturalHeight / img.naturalWidth : w * 0.85;
    const bottom = p.y + p.w * 0.16;
    return { x: p.x - w / 2, y: bottom - h, w, h, bottom };
  }
  function drawBuilding(id, b, t) {
    const g = geom(id, b.type), img = art[b.type];
    if (!G.ready(img)) return g;
    const age = (Date.now() - (b.at || 0)) / 1000;
    let dy = 0, sq = 1;
    if (age < 0.55) { const a = age / 0.55; dy = -(1 - a * a) * 220; }                          // drops in
    else if (age < 0.85) { const a = (age - 0.55) / 0.3; sq = 1 - 0.07 * Math.sin(a * Math.PI); }   // and settles
    if (age >= 0.55 && !b.dusted) { b.dusted = true; puff(PLOTS[id].x, g.bottom - 10, g.w); }
    ctx.save();
    ctx.translate(g.x + g.w / 2, g.bottom + dy); ctx.scale(1 / sq, sq);
    ctx.drawImage(img, -g.w / 2, -g.h, g.w, g.h);
    ctx.restore();
    return g;
  }
  function puff(x, y, w) {
    for (let i = 0; i < 26; i++) dust.push({ x: x + (Math.random() - 0.5) * w * 0.9, y: y + (Math.random() - 0.5) * 20, vx: (Math.random() - 0.5) * 160, vy: -30 - Math.random() * 80, r: 14 + Math.random() * 22, at: performance.now() });
  }
  function drawDust(t) {
    dust = dust.filter((d) => t - d.at < 1100);
    ctx.save();
    for (const d of dust) {
      const a = (t - d.at) / 1100, k = a * 1.1;
      ctx.globalAlpha = 0.5 * (1 - a); ctx.fillStyle = '#b8a084';
      ctx.beginPath(); ctx.arc(d.x + d.vx * k, d.y + d.vy * k, d.r * (1 + a), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  function tag(x, y, s, t, opts) {   // a small label over a building
    opts = opts || {};
    const px = 34, w = measure(s, px, 'num600') + 34, h = 50;
    const bounce = opts.bounce && !reduce ? Math.abs(Math.sin(t / 260)) * 10 : 0, yy = y - bounce;
    ctx.save();
    if (opts.glow) { shadow(26, 'rgba(255,190,80,.9)'); }
    else shadow(10, 'rgba(0,0,0,.7)');
    roundRect(x - w / 2, yy - h / 2, w, h, 12);
    const g = ctx.createLinearGradient(0, yy - h / 2, 0, yy + h / 2);
    // a solid parchment backing with a dark outline, so it reads over flowers and stone
    if (opts.glow) { g.addColorStop(0, '#ffe39a'); g.addColorStop(1, '#e8a032'); } else { g.addColorStop(0, '#f6e8c6'); g.addColorStop(1, '#dcc496'); }
    ctx.fillStyle = g; ctx.fill(); shadow(0); ctx.lineWidth = 4; ctx.strokeStyle = '#2a1806'; ctx.stroke();
    text(s, x, yy + 12, px, 'num600', '#2a1808', 'center');
    ctx.restore();
    return { x: x - w / 2, y: yy - h / 2, w, h };
  }

  // ---- drawing the village --------------------------------------------------------------------------------------------
  function draw(t) {
    tickAll(); tickOrders();
    const V = G.view(), L = V.vx0, R = V.vx0 + V.VW, CX = IMG_W / 2;
    rects = [];
    ctx.fillStyle = '#0a0806'; ctx.fillRect(0, 0, IMG_W, IMG_H);
    if (G.ready(hill)) ctx.drawImage(hill, 0, 0, IMG_W, IMG_H);
    G.dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0; lastT = t;
    FX.under(t, hill, reduce);

    // the hatch: tapping it goes down too
    rects.push({ x: HATCH.x - 130, y: HATCH.y - 150, w: 260, h: 230, fn: goDown });

    // plots, higher ones first so the lower ones overlap them
    for (const id of PLOT_ORDER) {
      const p = PLOTS[id], b = v.plots[id];
      if (id === 'P1') {
        let g = null;
        if (v.tower > 0) g = drawBuilding('P1', { type: 'tower', at: v.towerAt, dusted: true }, t);
        const top = g ? g.y - 6 : p.y - 70;
        const label = v.tower >= TOWER_STAGES ? 'Complete' : v.tower > 0 ? 'Stage ' + v.tower + ' of 7' : 'Bell tower';
        const r = tag(p.x, top, label, t, { glow: v.tower < TOWER_STAGES && affordable(towerCost(v.tower + 1)) });
        rects.push({ x: p.x - p.w / 2, y: Math.min(r.y, p.y - p.w * 0.6), w: p.w, h: p.y + p.w * 0.2 - Math.min(r.y, p.y - p.w * 0.6), fn: () => { panel = { kind: 'tower', plot: 'P1' }; } });
        continue;
      }
      if (!b) {   // an empty plot: a quiet "+" to build on it
        // a small parchment circle with a brown plus and a thin dark outline; all pulse together, never below half
        const pulse = reduce ? 1 : 0.78 + 0.22 * Math.sin(t / 700);
        ctx.save(); ctx.globalAlpha = pulse; shadow(6, 'rgba(0,0,0,.45)');
        ctx.beginPath(); ctx.arc(p.x, p.y, 17, 0, Math.PI * 2); ctx.fillStyle = '#f2e2bc'; ctx.fill();
        shadow(0); ctx.lineWidth = 2; ctx.strokeStyle = '#2a1806'; ctx.stroke();
        ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.strokeStyle = '#6a3e12';
        ctx.beginPath(); ctx.moveTo(p.x - 8, p.y); ctx.lineTo(p.x + 8, p.y); ctx.moveTo(p.x, p.y - 8); ctx.lineTo(p.x, p.y + 8); ctx.stroke();
        ctx.restore();
        rects.push({ x: p.x - p.w / 2, y: p.y - p.w * 0.28, w: p.w, h: p.w * 0.5, fn: () => { panel = { kind: 'build', plot: id }; } });
        continue;
      }
      const g = drawBuilding(id, b, t);
      if (WORKSHOPS[b.type]) { tick(b, Date.now()); FX.workshop(id, g, MARKS[b.type], b.queue > 0, t, reduce); }
      rects.push({ x: g.x, y: g.y, w: g.w, h: g.h, fn: () => tapBuilding(id) });
      if (WORKSHOPS[b.type]) {
        const W = WORKSHOPS[b.type];
        if (b.ready > 0) {
          const r = tag(tagX(b.type, g), g.y - 30, 'Ready' + (b.ready > 1 ? ' ×' + b.ready : ''), t, { bounce: true, glow: true });
          rects.push({ x: r.x - 10, y: r.y - 10, w: r.w + 20, h: r.h + 20, fn: () => collect(id) });
        } else if (b.queue > 0) {
          const left = b.start + W.secs * 1000 - Date.now();
          tag(tagX(b.type, g), g.y - 30, fmtClock(Math.max(0, left) + 999) + (b.queue > 1 ? '  +' + (b.queue - 1) : ''), t);
        }
      }
    }
    drawDust(t);

    // ---- top: the counters, and the small line under them
    // a soft dark band, about 45% opaque, ending just under the streak line; the sun's glow is drawn over it
    const bandEnd = 58 + V.safeTop + 172, tg = ctx.createLinearGradient(0, 0, 0, bandEnd + 40);
    tg.addColorStop(0, 'rgba(8,6,4,.45)'); tg.addColorStop(bandEnd / (bandEnd + 40), 'rgba(8,6,4,.45)'); tg.addColorStop(1, 'rgba(8,6,4,0)');
    ctx.fillStyle = tg; ctx.fillRect(L, 0, V.VW, bandEnd + 40);
    FX.sun(t, reduce);
    const top = 58 + V.safeTop, cells = [...ORES, 'coins'], cw = (V.VW - 40) / cells.length;
    cells.forEach((k, i) => {
      const cx = L + 20 + cw * (i + 0.5), n = have(k) - (pendingIn[k] || 0);
      counterPos[k] = { x: cx - cw * 0.2, y: top - 8 };
      drawItem(k, cx - cw * 0.22, top - 8, 56, n > 0 ? 1 : 0.4);
      thin(); text(fmtN(n), cx + cw * 0.04, top + 9, fit(fmtN(n), 48, 'num700', cw * 0.55), 'num700', n > 0 ? CREAM : 'rgba(239,230,210,.4)', 'left'); shadow(0);
    });
    // the goods, the same size and brightness as the ores; dim only those the player cannot make yet (and has none of)
    const canMake = new Set(Object.keys(WORKSHOPS).filter((k) => count(k) > 0).map((k) => WORKSHOPS[k].makes));
    const gx0 = CX - cw * 2;
    GOODS.forEach((k, i) => {
      const cx = gx0 + cw * (i + 0.5), n = have(k) - (pendingIn[k] || 0), on = n > 0 || canMake.has(k);
      counterPos[k] = { x: cx - cw * 0.22, y: top + 72 };
      drawGood(k, cx - cw * 0.22, top + 72, 56, on ? 1 : 0.4);
      thin(); text(fmtN(n), cx + cw * 0.04, top + 89, fit(fmtN(n), 48, 'num700', cw * 0.55), 'num700', on ? CREAM : 'rgba(239,230,210,.4)', 'left'); shadow(0);
    });
    const rec = G.rec, st = G.streak();
    const line = 'Streak ' + st + ' day' + (st === 1 ? '' : 's') + '   ·   Best: ' + (rec.best ? 'level ' + rec.best : '—') + '   ·   Score ' + fmtN(rec.banked || 0);
    thin(); text(line, CX, top + 146, fit(line, 32, 600, V.VW - 60), 600, DIM, 'center'); shadow(0);

    drawOrderCard(t, L + 22, top + 172);

    // ---- bottom: the big button, and the block under it
    const blk = G.block(), live = blk.feed === 'live' && blk.height !== null;
    const bw = V.VW * 0.7, bh = 118, bx = L + (V.VW - bw) / 2, by = 1836 - V.safeBot - bh;   // two thirds high, 70% wide
    G.drawButton(bx, by, bw, bh, live ? 'GO DOWN' : blk.height === null ? 'CONNECTING' : 'PAUSED', live);
    if (live) rects.push({ x: bx - 10, y: by - 20, w: bw + 20, h: bh + 40, fn: goDown });
    const bl = blk.height === null ? 'Connecting to the Bitcoin chain…' : 'Block ' + blk.height.toLocaleString('en-US') + ' open ' + fmtClock(blk.now - blk.at);
    // the block line on a dark strip
    const sy = 1846 - V.safeBot, sg = ctx.createLinearGradient(0, sy - 10, 0, IMG_H);
    sg.addColorStop(0, 'rgba(8,6,4,0)'); sg.addColorStop(0.18, 'rgba(8,6,4,.82)'); sg.addColorStop(1, 'rgba(8,6,4,.9)');
    ctx.fillStyle = sg; ctx.fillRect(L, sy - 10, V.VW, IMG_H - sy + 10);
    shadow(8); text(bl, CX, 1888 - V.safeBot, 34, 'num500', DIM, 'center'); shadow(0);
    G.drawSoundIcons(R - 64, 1846 - V.safeBot, L + 22, 1846 - V.safeBot);
    // reduce motion, beside the mute button
    motionRect = { x: R - 158, y: 1832 - V.safeBot, w: 80, h: 80 };
    drawMotionIcon(R - 144, 1846 - V.safeBot, 44);
    rects.push({ ...motionRect, fn: toggleMotion });

    if (toast && t - toast.at < 6000) {
      const a = Math.min(1, (6000 - (t - toast.at)) / 600);
      ctx.save(); ctx.globalAlpha = a; shadow(20, 'rgba(255,170,60,.6)'); text(toast.text, CX, 1620, fit(toast.text, 40, 700, V.VW - 60), 700, AMBER_HI, 'center'); ctx.restore();
    }
    drawFlyers(t);
    if (panel) drawPanel(t, V);
  }
  const fmtN = (n) => Math.max(0, n).toLocaleString('en-US');
  // a thin dark shadow under counter text, so it reads over the sun's glow
  function thin() { ctx.shadowColor = 'rgba(0,0,0,.95)'; ctx.shadowBlur = 3; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 1.5; }

  // ---- the order card (top left): its smallest text is the streak line's size (32) ------------------------------
  let cardAt = { x: 0, y: 0, w: 0, h: 0 };
  function drawOrderCard(t, x0, y0) {
    if (orderIdx >= v.orders.length) orderIdx = 0;
    const o = v.orders[orderIdx];
    if (!o) return;
    const w = 300, h = o.wait ? 62 : 190, x = x0, y = y0;   // waiting: a small one-line card
    cardAt = { x, y, w, h };
    ctx.save(); shadow(18, 'rgba(0,0,0,.7)');
    roundRect(x, y, w, h, 14);
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#efdcb2'); g.addColorStop(1, '#cdb07c');
    ctx.fillStyle = g; ctx.fill(); shadow(0); ctx.lineWidth = 3; ctx.strokeStyle = '#6a4a1c'; ctx.stroke();
    roundRect(x + 6, y + 6, w - 12, h - 12, 10); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(106,74,28,.5)'; ctx.stroke();
    const ink = BROWN, cx = x + w / 2;
    if (o.wait) {
      const s1 = 'Next order in ' + fmtClock(Math.max(0, o.wait - Date.now()) + 999);
      text(s1, cx, y + 42, Math.max(32, fit(s1, 34, 'num600', w - 24)), 'num600', ink, 'center');
    } else {
      const nm = GOOD_NAME[o.good][o.n === 1 ? 0 : 1], title = o.n + ' ' + nm;
      text(title, cx, y + 38, Math.max(32, fit(title, 36, 700, w - 24)), 700, ink, 'center');
      drawGood(o.good, cx, y + 70, 40);
      const rw = 'Reward', rs = fmtN(o.reward), rwW = measure(rw, 32, 600), rsW = measure(rs, 34, 'num700');
      const rx = cx - (rwW + 44 + rsW) / 2;
      text(rw, rx, y + 124, 32, 600, ink, 'left');
      drawGood('coins', rx + rwW + 20, y + 113, 30);
      text(rs, rx + rwW + 40, y + 125, 34, 'num700', ink, 'left');
      const skip = Date.now() - o.since > SKIP_AFTER;
      const ok = have(o.good) >= o.n, fb = { x: x + 16, y: y + 138, w: w - 32 - (skip ? 76 : 0), h: 42 };
      ctx.save(); ctx.globalAlpha = ok ? 1 : 0.5; shadow(ok ? 16 : 0, 'rgba(255,150,30,.6)');
      roundRect(fb.x, fb.y, fb.w, fb.h, 12);
      const bg = ctx.createLinearGradient(0, fb.y, 0, fb.y + fb.h); bg.addColorStop(0, '#ffcf6a'); bg.addColorStop(1, '#c97c1c');
      ctx.fillStyle = bg; ctx.fill(); shadow(0); ctx.lineWidth = 2.5; ctx.strokeStyle = '#7a4a12'; ctx.stroke();
      text(ok ? 'FILL' : 'have ' + Math.min(have(o.good), o.n) + ' of ' + o.n, fb.x + fb.w / 2, fb.y + 31, ok ? 34 : 32, 700, '#22150a', 'center', ok ? 3 : 0);
      ctx.restore();
      if (ok) rects.push({ x: fb.x - 6, y: fb.y - 6, w: fb.w + 12, h: fb.h + 12, fn: () => fill(orderIdx) });
      if (skip) {
        const sb = { x: x + w - 86, y: y + 138, w: 70, h: 42 };
        text('skip', sb.x + sb.w / 2, sb.y + 31, 32, 600, '#5a3a14', 'center');
        rects.push({ x: sb.x, y: sb.y - 6, w: sb.w + 10, h: sb.h + 12, fn: () => { v.orders[orderIdx] = newOrder(); save(); } });
      }
    }
    ctx.restore();
    if (v.orders.length > 1) {   // more orders: ‹ 1/3 ›, beside the card's top, on a dark pill
      const px = x + w + 12, py = y + 4;
      ctx.save(); roundRect(px, py, 170, 48, 24); ctx.fillStyle = 'rgba(12,8,4,.72)'; ctx.fill(); ctx.restore();
      thin();
      text((orderIdx + 1) + ' / ' + v.orders.length, px + 85, py + 35, 32, 'num600', CREAM, 'center');
      text('‹', px + 24, py + 37, 42, 700, CREAM, 'center'); text('›', px + 146, py + 37, 42, 700, CREAM, 'center');
      shadow(0);
      rects.push({ x: px - 6, y: py - 6, w: 70, h: 60, fn: () => { orderIdx = (orderIdx + v.orders.length - 1) % v.orders.length; } });
      rects.push({ x: px + 106, y: py - 6, w: 70, h: 60, fn: () => { orderIdx = (orderIdx + 1) % v.orders.length; } });
    }
  }
  function fill(i) {
    const o = v.orders[i]; if (!o || o.wait || have(o.good) < o.n) return;
    v.goods[o.good] -= o.n; v.coins += o.reward;
    v.orders[i] = { wait: Date.now() + ORDER_GAP };
    fly('coins', { x: cardAt.x + cardAt.w / 2, y: cardAt.y + cardAt.h * 0.6 }, Math.min(8, Math.ceil(o.reward / 40)), o.reward);   // to the coin counter
    save();
  }

  // ---- tapping buildings ----------------------------------------------------------------------------------------------
  function tapBuilding(id) {
    const b = v.plots[id];
    if (WORKSHOPS[b.type] && b.ready > 0) return collect(id);
    if (WORKSHOPS[b.type]) panel = { kind: 'workshop', plot: id };
  }
  function collect(id) {
    const b = v.plots[id], W = WORKSHOPS[b.type]; if (!W || !b.ready) return;
    const n = b.ready; b.ready = 0; v.goods[W.makes] += n; save();
    const g = geom(id, b.type);
    fly(W.makes, { x: PLOTS[id].x, y: g.y + 20 }, n, n);
  }
  function queueOne(id) {
    const b = v.plots[id], W = WORKSHOPS[b.type];
    if (!W || b.queue >= QUEUE_MAX || !affordable(W.needs)) return;
    tick(b, Date.now());
    take(W.needs); b.queue++; if (b.start == null) b.start = Date.now();
    save();
  }
  function build(id, type) {
    const cost = buildCost(type);
    if (!affordable(cost)) return;
    if (type === 'cottage' ? count('cottage') >= COTTAGES_MAX : count(type) > 0) return;
    take(cost);
    v.plots[id] = { type, at: Date.now(), queue: 0, start: null, ready: 0 };
    panel = null; save(); tickOrders();
  }
  function buildStage() {
    const n = v.tower + 1, cost = towerCost(n);
    if (n > TOWER_STAGES || !affordable(cost)) return;
    take(cost); v.tower = n; v.towerAt = Date.now(); save();
    const g = geom('P1', 'tower'); puff(PLOTS.P1.x, g.bottom - 10, g.w);
    panel = null;
  }

  // ---- flying things: stones from the hatch into the ore counters; goods and coins to theirs --------------------------
  // count: how many sprites fly; amount: how much the counter goes up in all (each sprite carries its share)
  function fly(kind, from, n, amount) {
    if (!n) return;
    const per = amount / n;
    pendingIn[kind] = (pendingIn[kind] || 0) + amount;
    for (let i = 0; i < n; i++) flyers.push({ kind, from: { x: from.x + (Math.random() - 0.5) * 40, y: from.y + (Math.random() - 0.5) * 30 }, at: performance.now() + i * 90 + Math.random() * 60, dur: 750 + Math.random() * 250, amount: per });
  }
  function drawFlyers(t) {
    const done = [];
    for (const f of flyers) {
      const a = (t - f.at) / f.dur;
      if (a < 0) continue;
      const to = counterPos[f.kind] || { x: 540, y: 60 };
      if (a >= 1) { done.push(f); continue; }
      const e = a < 0.5 ? 2 * a * a : 1 - Math.pow(-2 * a + 2, 2) / 2;
      const x = f.from.x + (to.x - f.from.x) * e, y = f.from.y + (to.y - f.from.y) * e - Math.sin(a * Math.PI) * 140;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; const gl = ctx.createRadialGradient(x, y, 0, x, y, 40);
      gl.addColorStop(0, 'rgba(255,200,110,.45)'); gl.addColorStop(1, 'rgba(255,160,60,0)'); ctx.fillStyle = gl; ctx.fillRect(x - 40, y - 40, 80, 80); ctx.restore();
      drawItem(f.kind, x, y, 44 + 10 * Math.sin(a * Math.PI));
    }
    if (done.length) {
      done.forEach((f) => { pendingIn[f.kind] = Math.max(0, (pendingIn[f.kind] || 0) - f.amount); });
      flyers = flyers.filter((f) => !done.includes(f));
    }
  }

  // ---- menus -----------------------------------------------------------------------------------------------------------
  // icons and amounts: with haveNeed, "have / need" for each; what is missing in dark red, the rest in dark brown
  function costRow(cost, x, y, size, haveNeed) {
    let cx = x;
    for (const k of Object.keys(cost)) {
      const lack = have(k) < cost[k];
      drawItem(k, cx + size / 2, y - size * 0.32, size);
      const s = haveNeed ? fmtN(have(k)) + ' / ' + fmtN(cost[k]) : fmtN(cost[k]);
      text(s, cx + size + 4, y, size * 0.8, 'num700', lack ? RED : BROWN, 'left');
      cx += size + 14 + measure(s, size * 0.8, 'num700') + 18;
    }
    return cx;
  }
  // how many more of a workshop's goods the player can queue: what they can afford, up to the queue's room
  function canQueue(b) {
    const W = WORKSHOPS[b.type]; let n = 0;
    while (b.queue + n < QUEUE_MAX && Object.keys(W.needs).every((k) => have(k) >= W.needs[k] * (n + 1))) n++;
    return n;
  }
  function drawPanel(t, V) {
    const L = V.vx0, w = Math.min(V.VW - 40, 900), x = L + (V.VW - w) / 2;
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(L, 0, V.VW, IMG_H); ctx.restore();
    rects = [];   // only the panel takes taps now
    rects.push({ x: L, y: 0, w: V.VW, h: IMG_H, fn: () => { panel = null; } });   // tapping outside closes it
    const rows = [], ink = '#2c1a08';
    let title = '', h = 0;
    if (panel.kind === 'build') {
      title = 'Build on this plot';
      const types = ['smelter', 'lampworks', 'jeweller', 'glassworks', 'cottage'];
      types.forEach((ty) => {
        const cost = buildCost(ty), done = ty === 'cottage' ? count('cottage') >= COTTAGES_MAX : count(ty) > 0;
        const sub = ty === 'cottage' ? count('cottage') + ' of 4 built' : WORKSHOPS[ty] ? 'makes ' + GOOD_NAME[WORKSHOPS[ty].makes][1] : '';
        rows.push({ ty, cost, done, ok: !done && affordable(cost), sub, fn: () => build(panel.plot, ty) });
      });
      h = 130 + rows.length * 150 + 30;
    } else if (panel.kind === 'workshop') {
      const b = v.plots[panel.plot], W = WORKSHOPS[b.type];
      title = W.name; h = 640;
    } else if (panel.kind === 'tower') {
      title = v.tower >= TOWER_STAGES ? 'The bell tower is complete' : 'Bell tower: stage ' + (v.tower + 1) + ' of 7';
      h = v.tower >= TOWER_STAGES ? 330 : 470;
    }
    const y = Math.max(240, (IMG_H - h) / 2 - 80);
    ctx.save(); shadow(40, 'rgba(0,0,0,.8)');
    roundRect(x, y, w, h, 22);
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#f2e2bc'); g.addColorStop(1, '#d4ba8a');
    ctx.fillStyle = g; ctx.fill(); shadow(0); ctx.lineWidth = 4; ctx.strokeStyle = '#6a4a1c'; ctx.stroke();
    ctx.restore();
    rects.push({ x, y, w, h, fn: () => {} });   // taps on the card itself do nothing, unless on a row or button
    text(title, x + 40, y + 70, fit(title, 46, 700, w - 140), 700, ink, 'left');
    text('✕', x + w - 50, y + 70, 44, 700, '#6a4a1c', 'center');
    rects.push({ x: x + w - 100, y: y + 10, w: 90, h: 90, fn: () => { panel = null; } });

    if (panel.kind === 'build') {
      rows.forEach((r, i) => {
        const ry = y + 110 + i * 150, rh = 136;
        ctx.save(); ctx.globalAlpha = r.ok ? 1 : 0.5;
        roundRect(x + 24, ry, w - 48, rh, 14); ctx.fillStyle = r.ok ? 'rgba(255,240,200,.75)' : 'rgba(120,100,70,.25)'; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(106,74,28,.5)'; ctx.stroke();
        const img = art[r.ty]; if (G.ready(img)) { const iw = 130, ih = iw * img.naturalHeight / img.naturalWidth; ctx.drawImage(img, x + 34, ry + rh / 2 - ih / 2, iw, ih); }
        ctx.restore();
        ctx.save(); if (!r.ok) ctx.globalAlpha = 0.75;
        text(BUILD_NAME[r.ty], x + 180, ry + 46, 38, 700, ink, 'left');
        text(r.done ? (r.ty === 'cottage' ? 'all 4 built' : 'built') : r.sub, x + w - 46, ry + 46, 26, 600, '#5a3a14', 'right');
        if (!r.done) costRow(r.cost, x + 180, ry + 108, 34, true);
        ctx.restore();
        if (r.ok) rects.push({ x: x + 24, y: ry, w: w - 48, h: rh, fn: r.fn });
      });
    } else if (panel.kind === 'workshop') {
      const b = v.plots[panel.plot], W = WORKSHOPS[b.type]; tick(b, Date.now());
      text('Makes one at a time, up to 5 in the queue.', x + 40, y + 120, 28, 600, '#5a3a14', 'left');
      // the recipe: inputs -> output, and the time
      let cx = costRow(W.needs, x + 40, y + 210, 48);
      text('→', cx + 4, y + 206, 50, 700, ink, 'left');
      drawItem(W.makes, cx + 90, y + 192, 54);
      text('1', cx + 124, y + 210, 40, 'num700', ink, 'left');
      text(fmtClock(W.secs * 1000) + ' each', x + w - 40, y + 210, 32, 'num600', '#5a3a14', 'right');
      const qs = 'In the queue: ' + b.queue + ' of ' + QUEUE_MAX + (b.queue ? '  ·  next in ' + fmtClock(b.start + W.secs * 1000 - Date.now() + 999) : '');
      text(qs, x + 40, y + 290, 32, 'num600', ink, 'left');
      // the player's stock of the inputs and the output
      const stock = 'You have: ' + [...Object.keys(W.needs), W.makes].map((k) => itemName(k, have(k))).join(', ');
      text(stock, x + 40, y + 340, fit(stock, 32, 'num600', w - 80), 'num600', BROWN, 'left');
      if (b.ready) text('Ready to collect: ' + b.ready, x + 40, y + 386, 32, 'num600', '#7a4a08', 'left');
      const room = b.queue < QUEUE_MAX, nq = canQueue(b), can = room && nq > 0;
      if (room && !nq) {   // cannot afford one: what is missing
        const miss = Object.keys(W.needs).filter((k) => have(k) < W.needs[k]).map((k) => itemName(k, W.needs[k] - have(k)));
        text('Missing: ' + miss.join(', '), x + 40, y + 432, fit('Missing: ' + miss.join(', '), 32, 'num600', w - 80), 'num600', RED, 'left');
      }
      const gap = 24, bw2 = (w - 80 - gap) / 2;
      const m1 = { x: x + 40, y: y + h - 130, w: bw2, h: 96 }, m2 = { x: x + 40 + bw2 + gap, y: y + h - 130, w: bw2, h: 96 };
      G.drawButton(m1.x, m1.y, m1.w, m1.h, room ? 'MAKE ONE' : 'QUEUE FULL', can);
      G.drawButton(m2.x, m2.y, m2.w, m2.h, can && nq > 1 ? 'FILL QUEUE +' + nq : 'FILL QUEUE', can);
      if (can) {
        rects.push({ ...m1, fn: () => queueOne(panel.plot) });
        rects.push({ ...m2, fn: () => { for (let i = canQueue(v.plots[panel.plot]); i > 0; i--) queueOne(panel.plot); } });
      }
    } else if (panel.kind === 'tower') {
      if (v.tower >= TOWER_STAGES) {
        text('At every new block your bell rings over the village.', x + 40, y + 160, fit('At every new block your bell rings over the village.', 32, 600, w - 80), 600, ink, 'left');
      } else {
        const n = v.tower + 1, cost = towerCost(n);
        text('This stage costs:', x + 40, y + 140, 32, 600, '#5a3a14', 'left');
        const keys = Object.keys(cost), half = Math.ceil(keys.length / 2);
        costRow(Object.fromEntries(keys.slice(0, half).map((k) => [k, cost[k]])), x + 40, y + 220, 44, true);
        costRow(Object.fromEntries(keys.slice(half).map((k) => [k, cost[k]])), x + 40, y + 290, 44, true);
        const can = affordable(cost), mb = { x: x + 40, y: y + h - 130, w: w - 80, h: 96 };
        G.drawButton(mb.x, mb.y, mb.w, mb.h, 'BUILD STAGE ' + n, can);
        if (can) rects.push({ ...mb, fn: buildStage });
      }
    }
  }

  // ---- input and hooks for game.js ---------------------------------------------------------------------------------------
  function tap(x, y) {
    for (let i = rects.length - 1; i >= 0; i--) { const r = rects[i]; if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) { r.fn(); return; } }
  }
  function goDown() { if (panel) return; G.goDown(); }
  // back from the mine with the bag banked: the ores go into the stores, and fly in from the hatch
  function banked(counts) {
    for (const k in counts) v.ores[k] = (v.ores[k] || 0) + counts[k];
    save();
  }
  function arrive(counts) {
    if (!counts) return;
    for (const k in counts) if (counts[k] > 0) fly(k, { x: HATCH.x, y: HATCH.y - 40 }, Math.min(10, counts[k]), counts[k]);
  }
  // a workshop's tag sits over its roof, clear of the chimney (and its smoke)
  const tagX = (type, g) => (MARKS[type] ? g.x + g.w * 0.34 : g.x + g.w / 2);
  function toggleMotion() { reduce = !reduce; try { localStorage.setItem(MOTION_KEY, reduce ? '1' : '0'); } catch (e) {} }
  // a wave mark; crossed through when motion is reduced
  function drawMotionIcon(x, y, s) {
    const k = s / 52;
    ctx.save(); ctx.globalAlpha = 0.85; ctx.strokeStyle = CREAM; ctx.lineWidth = 4; ctx.lineCap = 'round';
    for (let r = 0; r < 2; r++) {
      ctx.beginPath();
      for (let i = 0; i <= 20; i++) { const xx = x + 4 * k + i * 2.2 * k, yy = y + (16 + r * 16) * k + Math.sin(i / 20 * Math.PI * 2) * 6 * k; if (i) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); }
      ctx.stroke();
    }
    if (reduce) { ctx.beginPath(); ctx.moveTo(x + 2 * k, y + 2 * k); ctx.lineTo(x + 50 * k, y + 48 * k); ctx.stroke(); }
    ctx.fillStyle = CREAM; ctx.font = '600 ' + Math.round(16 * k) + 'px ' + "'Cormorant Garamond', Georgia, serif"; ctx.textAlign = 'center';
    ctx.fillText(reduce ? 'still' : 'motion', x + 26 * k, y + 72 * k);
    ctx.restore();
  }
  function newBlock() { FX.newBlock(performance.now()); }
  function bellLine() { toast = { text: 'Your bell rings over the village.', at: performance.now() }; }
  const towerComplete = () => v.tower >= TOWER_STAGES;
  function key(k) { if (k === 'Escape') panel = null; else if ((k === ' ' || k === 'Enter') && !panel) goDown(); }

  return { draw, tap, key, banked, arrive, bellLine, towerComplete, newBlock };
};
