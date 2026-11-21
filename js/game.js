// Blockmine prototype, pass 1: plain shapes. All numbers come from settings.js.
(function () {
  const S = window.SETTINGS;
  const TEST = new URLSearchParams(location.search).has('test');
  const DEPTH = S.levels * S.levelHeight;
  const AMBER = 0xffb547, GRAY = 0x5a5a5a, $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const records = Records(TEST);
  if (TEST) $('test').style.display = 'block';

  class Mine extends Phaser.Scene {
    constructor() { super('mine'); }

    create() {
      window.blockmine = this;                            // handy for testing from the console
      this.cameras.main.setBackgroundColor('#000000');
      this.input.addPointer(4);                         // several fingers at once
      this.input.mouse && this.input.mouse.disableContextMenu();

      this.minerY = S.surfaceY; this.mining = null;
      this.bag = []; this.oil = S.oilStart; this.inShift = false;
      this.hatch = 'waiting'; this.paused = false; this.overlay = false;
      this.nodes = []; this.mine = null; this.holds = new Set(); this.drag = null;
      this.shutTimer = null; this.msgUntil = 0;

      this.drawShaft();
      this.g = this.add.graphics().setDepth(10);
      this.dark = this.add.graphics().setDepth(50);
      this.glow = this.add.graphics().setDepth(60);

      this.input.on('pointerdown', (p) => this.down(p));
      this.input.on('pointermove', (p) => this.move(p));
      this.input.on('pointerup', (p) => this.up(p));
      this.input.on('pointerupoutside', (p) => this.up(p));
      this.input.on('gameout', () => this.holds.clear());

      this.scale.on('resize', () => this.fitCamera());
      this.fitCamera();
      this.bindHud();

      startChain(TEST, (b) => this.onBlock(b), (s) => this.onStatus(s));
    }

    // ---------- layout ----------
    drawShaft() {
      const w = this.add.graphics(), hw = S.shaftHalfWidth, far = 4000;
      w.fillStyle(GRAY, 1);
      w.fillRect(-hw - far, 0, far, DEPTH + 400);           // left wall
      w.fillRect(hw, 0, far, DEPTH + 400);                  // right wall
      w.fillRect(-hw - far, DEPTH, 2 * far, 400);           // floor
      w.fillStyle(0x2a2a2a, 1);
      w.fillRect(-hw - far, -2, 2 * far, 2);                // ground line at the hatch
      w.lineStyle(1, 0x333333, 1);
      for (let l = 1; l < S.levels; l++) w.lineBetween(-hw, l * S.levelHeight, hw, l * S.levelHeight);
      for (let l = 0; l < S.levels; l++) {
        this.add.text(-hw + 6, l * S.levelHeight + 6, 'Level ' + (l + 1), { fontFamily: 'Georgia, serif', fontSize: '13px', color: '#555' });
      }
      this.hatchG = this.add.graphics().setDepth(5);
    }

    fitCamera() {
      const cam = this.cameras.main, W = this.scale.width, H = this.scale.height;
      cam.setSize(W, H);
      cam.setZoom(Math.min(W / S.viewWidth, H / S.viewHeightMin));
    }

    // ---------- the chain ----------
    onStatus(s) {
      this.paused = s !== 'live';
      if (s === 'lost') this.say('Live feed lost. The game is paused; you cannot be caught while it is down.', 1e9);
      else if (s === 'connecting' && this.hatch === 'waiting') this.say('Connecting to the Bitcoin chain…', 1e9);
      else if (s === 'live' && this.msgUntil > performance.now() + 1e8) this.say(this.hatch === 'waiting' ? 'Waiting for a block…' : 'Live feed is back.', 3);
    }

    onBlock(b) {
      clearTimeout(this.shutTimer);
      if (b.initial) { this.openMine(b, false); return; }
      if (b.missed) {
        // a block came while the feed was down: no catch; bring the miner up safely
        if (this.minerY > 0) { this.minerY = S.surfaceY; this.mining = null; this.bank(); }
        this.openMine(b, true);
        this.say('Feed back. A block came while it was down; you were brought up safely.', 6);
        return;
      }
      Sound.knock();
      this.cameras.main.shake(400, 0.006);
      if (this.minerY > 0) this.caught();
      this.hatch = 'shut'; this.nodes = []; this.mining = null;
      this.shutTimer = setTimeout(() => this.openMine(b, true), S.hatchShutSeconds * 1000);
    }

    openMine(b, ring) {
      const rng = seededRandom(b.hash);
      this.mine = { hash: b.hash, height: b.height, spawnRng: seededRandom(b.hash + '|spawn'), spawnT: 0, nextId: 0 };
      this.nodes = [];
      for (let l = 0; l < S.levels; l++) for (let i = 0; i < S.nodesPerLevel[l]; i++) this.addNode(rng, l);
      this.hatch = 'open';
      if (ring) Sound.bell();
      this.say('Block ' + b.height.toLocaleString() + ' · the hatch is open', 4);
    }

    addNode(rng, level) {
      const r = S.oreRadius[level] * (0.8 + 0.4 * rng());
      for (let tries = 0; tries < 12; tries++) {
        const side = rng() < 0.5 ? -1 : 1;
        const x = side * (S.shaftHalfWidth - r * 0.5 - rng() * 22);
        const y = level * S.levelHeight + 40 + rng() * (S.levelHeight - 80);
        const crack = rng() * Math.PI;
        const value = Math.max(1, Math.round(S.oreValue[level] * (0.7 + 0.6 * rng())));
        if (this.nodes.some((n) => Math.hypot(n.x - x, n.y - y) < n.r + r + 10)) continue;
        this.nodes.push({ id: this.mine.nextId++, x, y, r, crack, value, weight: S.oreWeight[level], level, hp: 1, flash: 0 });
        return;
      }
    }

    spawn(dt) {
      if (this.hatch !== 'open' || this.nodes.length >= S.maxNodes) return;
      const m = this.mine; m.spawnT += dt;
      while (m.spawnT >= S.spawnEverySeconds) {
        m.spawnT -= S.spawnEverySeconds;
        const w = S.spawnLevelWeights, total = w.reduce((a, b) => a + b, 0);
        let pick = m.spawnRng() * total, level = 0;
        while (pick >= w[level]) { pick -= w[level]; level++; }
        this.addNode(m.spawnRng, level);
      }
    }

    caught() {
      this.bag = []; this.mining = null; this.inShift = false;
      this.minerY = S.surfaceY; this.oil = S.oilStart; this.holds.clear(); this.drag = null;
      records.get().timesCaught++; records.save();
      this.showOverlay('The deep is closed', 'The knock came before you reached the hatch. Your bag is lost. That counts as 1 death.');
    }

    bank() {
      const pts = this.bagValue();
      if (this.inShift) { records.get().totalPoints += pts; records.save(); }
      this.bag = []; this.inShift = false; this.oil = S.oilStart;
      if (pts) this.say('+' + pts + ' points banked', 3);
    }

    // ---------- input ----------
    world(p) { return this.cameras.main.getWorldPoint(p.x, p.y); }
    lampOn() { return this.oil > 0; }
    inReach(n) { return Math.hypot(n.x, n.y - this.minerY) <= S.lampReach; }

    down(p) {
      Sound.unlock();
      if (this.overlay || this.paused) return;
      const w = this.world(p);
      if (this.mining) {
        const n = this.mining;
        if (Math.hypot(w.x - n.x, w.y - n.y) <= n.r * S.nodeTouchSlop * 1.3) return this.startDrag(p, w, n);
        this.mining = null;                                   // pressing bare rock leaves the node
      } else if (this.lampOn() && this.hatch === 'open') {
        let best = null, bd = 1e9;
        for (const n of this.nodes) {
          const d = Math.hypot(w.x - n.x, w.y - n.y);
          if (d <= n.r * S.nodeTouchSlop && d < bd && this.inReach(n)) { best = n; bd = d; }
        }
        if (best) {
          if (this.bagWeight() + best.weight > S.bagCapacity + 1e-9) { this.say('Your bag is full. Drop ore or climb.', 2.5); }
          else { this.mining = best; return this.startDrag(p, w, best); }
        }
      }
      this.holds.add(p.id);
    }
    startDrag(p, w, n) { this.drag = { id: p.id, node: n, x0: w.x, y0: w.y, x: w.x, y: w.y, len: 0 }; }
    move(p) {
      const d = this.drag; if (!d || d.id !== p.id) return;
      const w = this.world(p);
      d.len += Math.hypot(w.x - d.x, w.y - d.y); d.x = w.x; d.y = w.y;
    }
    up(p) {
      this.holds.delete(p.id);
      const d = this.drag; if (!d || d.id !== p.id) return;
      this.drag = null;
      const dx = d.x - d.x0, dy = d.y - d.y0, disp = Math.hypot(dx, dy);
      if (disp < S.swingMinLength || this.mining !== d.node || !this.nodes.includes(d.node)) return;
      this.swing(d.node, dx, dy, disp, d.len);
    }

    swing(n, dx, dy, disp, len) {
      const align = Math.abs(Math.cos(Math.atan2(dy, dx) - n.crack));
      const straight = disp / Math.max(disp, len);
      const t = clamp((align * straight - S.sloppyAt) / (S.cleanAt - S.sloppyAt), 0, 1);
      const swingsNeeded = S.sloppySwings - t * (S.sloppySwings - S.cleanSwings);
      n.hp -= 1 / swingsNeeded; n.flash = 0.15;
      Sound.tick();
      this.float(n.x, n.y - n.r - 6, t >= 1 ? 'clean' : t > 0.5 ? 'rough' : 'sloppy');
      if (n.hp <= 1e-9) {
        this.nodes = this.nodes.filter((x) => x !== n); this.mining = null;
        if (this.bagWeight() + n.weight > S.bagCapacity + 1e-9) this.say('No room in the bag. The ore fell.', 2.5);
        else { this.bag.push({ value: n.value, weight: n.weight }); this.say('+' + n.value + ' ore in the bag', 1.5); }
      }
    }

    float(x, y, txt) {
      const t = this.add.text(x, y, txt, { fontFamily: 'Georgia, serif', fontSize: '13px', color: '#e8e2d6' }).setOrigin(0.5).setDepth(20);
      this.tweens.add({ targets: t, y: y - 24, alpha: 0, duration: 700, onComplete: () => t.destroy() });
    }

    // ---------- loop ----------
    bagWeight() { return this.bag.reduce((a, b) => a + b.weight, 0); }
    bagValue() { return this.bag.reduce((a, b) => a + b.value, 0); }
    climbSpeed() { return S.climbSpeed * (1 - (1 - S.fullBagClimbFactor) * Math.min(1, this.bagWeight() / S.bagCapacity)); }

    update(time, deltaMs) {
      const dt = Math.min(deltaMs, 100) / 1000;
      if (!this.paused && !this.overlay) {
        this.spawn(dt);
        const wasBelow = this.minerY > 0;
        if (this.mining) {
          if (!this.lampOn() || !this.nodes.includes(this.mining)) this.mining = null;
        } else if (this.holds.size > 0) {
          if (this.hatch === 'open') this.minerY = Math.min(DEPTH - 30, this.minerY + S.descendSpeed * dt);
        } else {
          this.minerY = Math.max(S.surfaceY, this.minerY - this.climbSpeed() * dt);
        }
        const below = this.minerY > 0;
        if (below && !wasBelow && !this.inShift) { this.inShift = true; records.get().shifts++; records.save(); }
        if (!below && wasBelow) this.bank();
        if (below) {
          const lvl = Math.min(S.levels, Math.floor(this.minerY / S.levelHeight) + 1);
          if (lvl > records.get().deepestLevel) { records.get().deepestLevel = lvl; records.save(); }
          if (this.oil > 0) {
            this.oil = Math.max(0, this.oil - S.oilBurnPerSecond * dt);
            if (this.oil === 0) this.say('Your lamp is out. Let go to climb by feel.', 4);
          }
        }
      }
      for (const n of this.nodes) n.flash = Math.max(0, n.flash - dt);
      const cam = this.cameras.main;
      cam.centerOn(0, this.minerY + (cam.height / cam.zoom) * S.cameraLead);
      this.draw();
      this.hud();
    }

    draw() {
      const g = this.g, hw = S.shaftHalfWidth, y = this.minerY;
      g.clear();
      // hatch
      const h = this.hatchG; h.clear();
      h.fillStyle(0x8a8a8a, 1);
      if (this.hatch === 'open') { h.fillRect(-hw, -6, 34, 6); h.fillRect(hw - 34, -6, 34, 6); }
      else h.fillRect(-hw, -6, 2 * hw, 6);
      // ore
      for (const n of this.nodes) {
        const reach = this.lampOn() && this.inReach(n);
        g.fillStyle(n.flash > 0 ? 0xffffff : AMBER, reach ? 1 : 0.55);
        g.fillCircle(n.x, n.y, n.r * (0.55 + 0.45 * n.hp));
        const cx = Math.cos(n.crack) * n.r * 1.25, cy = Math.sin(n.crack) * n.r * 1.25;
        g.lineStyle(2, 0x3a2400, reach ? 0.9 : 0.4); g.lineBetween(n.x - cx, n.y - cy, n.x + cx, n.y + cy);
        if (n === this.mining) { g.lineStyle(1.5, 0xffffff, 0.8); g.strokeCircle(n.x, n.y, n.r + 6); }
      }
      // rope, reach, lamp
      g.lineStyle(1, 0x777777, 1); g.lineBetween(0, -600, 0, y);
      if (this.lampOn()) {
        g.lineStyle(1, AMBER, 0.12); g.strokeCircle(0, y, S.lampReach);
        if (this.mining) { g.lineStyle(1, AMBER, 0.35); g.lineBetween(0, y, this.mining.x, this.mining.y); }
        g.fillStyle(0xffffff, 1); g.fillCircle(0, y, 4);
        g.fillStyle(0xfff2c0, 0.25); g.fillCircle(0, y, 9);
      }
      // lamp out below the hatch: dark except the glow of the bag
      this.dark.clear(); this.glow.clear();
      if (!this.lampOn() && y > 0) {
        const cam = this.cameras.main, v = cam.worldView;
        this.dark.fillStyle(0x000000, 1); this.dark.fillRect(v.x - 10, v.y - 10, v.width + 20, v.height + 20);
        const w = this.bagWeight();
        if (w > 0) {
          const r = 8 + 2.2 * w;
          this.glow.fillStyle(AMBER, 0.12); this.glow.fillCircle(0, y + 22, r * 2);
          this.glow.fillStyle(AMBER, 0.5); this.glow.fillCircle(0, y + 22, r);
        }
      }
    }

    // ---------- HUD ----------
    bindHud() {
      const stop = (e) => e.stopPropagation();
      ['drop', 'recBtn', 'ovBtn', 'recClose', 'modeBtn'].forEach((id) => { $(id).addEventListener('pointerdown', stop); });
      $('drop').onclick = () => {
        const p = this.bag.pop();
        if (p) { Sound.tick(); this.say('Dropped ' + p.value + ' ore', 1.5); }
      };
      $('recBtn').onclick = () => {
        const r = records.get();
        $('rShifts').textContent = r.shifts; $('rDeep').textContent = r.deepestLevel;
        $('rCaught').textContent = r.timesCaught; $('rPoints').textContent = r.totalPoints;
        $('recMode').textContent = TEST ? '(test mode)' : '(live chain)';
        $('modeBtn').textContent = TEST ? 'Back to live chain' : 'Switch to test mode';
        $('records').style.display = 'flex'; this.overlay = true; this.holds.clear();
      };
      $('recClose').onclick = () => { $('records').style.display = 'none'; this.overlay = false; };
      $('modeBtn').onclick = () => { location.search = TEST ? '' : '?test'; };
      $('ovBtn').onclick = () => { $('overlay').style.display = 'none'; this.overlay = false; };
      this.last = {};
    }
    showOverlay(title, text) {
      $('ovTitle').textContent = title; $('ovText').textContent = text;
      $('overlay').style.display = 'flex'; this.overlay = true;
    }
    say(text, seconds) { this.msg = text; this.msgUntil = performance.now() + seconds * 1000; }
    set(id, v) { if (this.last[id] !== v) { this.last[id] = v; $(id).textContent = v; } }

    hud() {
      this.set('oil', String(Math.ceil(this.oil)));
      const w = this.bagWeight();
      this.set('bag', String(this.bagValue()));
      const lbl = $('bag').previousElementSibling, t = 'Bag ' + (+w.toFixed(1)) + '/' + S.bagCapacity + (w >= S.bagCapacity ? ' full' : '');
      if (lbl.textContent !== t) lbl.textContent = t;
      // the honest number: P(block within the climb time) = 1 - e^(-t / mean). Block arrivals are memoryless.
      const mean = TEST ? S.testBlockSeconds : S.averageBlockSeconds;
      const secs = Math.max(0, this.minerY) / this.climbSpeed();
      const pct = this.minerY > 0 ? (1 - Math.exp(-secs / mean)) * 100 : 0;
      this.set('riskNum', (pct > 0 && pct < 1 ? pct.toFixed(1) : Math.round(pct)) + '%');
      this.set('msg', performance.now() < this.msgUntil ? this.msg : '');
    }
  }

  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#000000',
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    input: { activePointers: 5 },
    render: { antialias: true, powerPreference: 'high-performance' },
    banner: false,
    scene: Mine,
  });
})();
