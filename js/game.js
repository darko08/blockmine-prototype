// Blockmine prototype, pass 2: painted art. All numbers come from settings.js, all art paths too.
(function () {
  const S = window.SETTINGS;
  const TEST = new URLSearchParams(location.search).has('test');
  const DEPTH = S.levels * S.levelHeight;
  const AMBER = 0xffb547, $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mmss = (ms) => {
    const t = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = String(t % 60).padStart(2, '0');
    return h ? h + ':' + String(m).padStart(2, '0') + ':' + s : m + ':' + s;
  };
  const Z = { back: 0, beam: 1, wall: 2, ore: 3, crack: 4, hatch: 5, bag: 6, miner: 7, lamp: 8, light: 9, sparks: 10, dark: 20, glow: 21, fx: 22 };

  const records = Records(TEST);
  if (TEST) $('test').style.display = 'block';

  class Mine extends Phaser.Scene {
    constructor() { super('mine'); }

    preload() { Art.preload(this); }

    create() {
      window.blockmine = this;                            // handy for testing from the console
      Art.make(this);
      this.cameras.main.setBackgroundColor('#000000');
      this.input.addPointer(4);                           // several fingers at once
      this.input.mouse && this.input.mouse.disableContextMenu();

      this.minerY = S.surfaceY; this.minerX = 0; this.mining = null; this.climbing = false;
      this.bag = []; this.oil = S.oilStart; this.inShift = false;
      this.hatch = 'waiting'; this.paused = false; this.overlay = false;
      this.nodes = []; this.mine = null; this.holds = new Set(); this.drag = null;
      this.shutTimer = null; this.msgUntil = 0; this.clock = 0; this.jolt = 0;
      this.blockInfo = null;

      this.crackG = this.add.graphics().setDepth(Z.crack);
      this.buildMiner();
      this.buildLight();
      this.buildFx();

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

    // ---------- building the scene ----------
    // the shaft is rebuilt whenever the screen changes shape: it fills shaftScreenFraction of the width, rock fills the rest
    buildShaft(hw) {
      if (this.shaftObjs) this.shaftObjs.forEach((o) => o.destroy());
      const objs = this.shaftObjs = [], keep = (o) => { objs.push(o); return o; };
      const far = 3000, top = -1500, split = 2 * S.levelHeight, bottom = DEPTH + 600;
      const tile = (x, y, w, h, key, tint) => {
        const t = keep(this.add.tileSprite(x, y, w, h, key).setOrigin(0, 0).setTileScale(S.wallTextureScale));
        t.tilePositionX = x / S.wallTextureScale; t.tilePositionY = y / S.wallTextureScale;
        if (tint) t.setTint(tint);
        return t;
      };
      // back wall of the shaft (darker); the side walls: upper rock near the top, deep rock lower down; the floor
      tile(-hw, top, 2 * hw, split - top, 'wall', 0x77716a).setDepth(Z.back);
      tile(-hw, split, 2 * hw, bottom - split, 'deep', 0x8a7f76).setDepth(Z.back);
      for (const x of [-hw - far, hw]) {
        tile(x, top, far, split - top, 'wall').setDepth(Z.wall);
        tile(x, split, far, bottom - split, 'deep').setDepth(Z.wall);
      }
      tile(-hw, DEPTH, 2 * hw, bottom - DEPTH, 'deep').setDepth(Z.wall);
      // timber sets: a cross beam at every level line, its ends tucked under the posts down both edges
      const beamY = (l) => l * S.levelHeight;
      for (let l = 0; l < S.levels; l++) {
        keep(this.add.image(0, beamY(l), 'beamH').setDisplaySize(2 * hw, S.beamThickness).setDepth(l === 0 ? Z.hatch - 0.5 : Z.beam));
      }
      const pw = S.postWidth;
      for (const side of [-1, 1]) {
        const p = keep(this.add.tileSprite(side * hw, -S.beamThickness, pw, DEPTH + S.beamThickness, 'beamV').setOrigin(0.5, 0).setDepth(Z.wall + 0.5));
        p.setTileScale(pw / p.texture.getSourceImage().width); if (side > 0) p.setFlipX(true);
        // a clean square cap where each beam meets the post
        for (let l = 0; l < S.levels; l++) {
          const c = keep(this.add.image(side * hw, beamY(l), 'beamV').setDisplaySize(pw + 6, S.beamThickness + 8).setDepth(Z.wall + 0.6));
          c.setTint(0xb8a890);
        }
      }
      // level numbers on the back wall, clear of the posts and beams
      for (let l = 0; l < S.levels; l++) {
        const side = l % 2 ? 1 : -1;
        keep(this.add.text(side * (hw - pw / 2 - 12), beamY(l) + S.beamThickness / 2 + 10, ['I', 'II', 'III', 'IV'][l] || String(l + 1),
          { fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: '24px', color: '#b08d57' })
          .setOrigin(side > 0 ? 1 : 0, 0).setDepth(Z.crack).setAlpha(0.6));
      }
      const key = this.hatchImg ? this.hatchImg.texture.key : 'hatchShut';
      this.hatchImg = keep(this.add.image(0, 26, key).setOrigin(0.5, 1).setDepth(Z.hatch));
      this.hatchImg.setScale(Math.min(2 * hw - pw - 20, 300) / this.hatchImg.width);
    }

    // ore sits in the rock wall just past the post; the lamp-reach rule uses reachDx, which doesn't depend on the screen
    placeNode(n) {
      n.x = n.side * (this.hw + S.postWidth / 2 + n.r * 0.85 + n.inset);
      n.img.x = n.x; n.glow.x = n.x;
    }

    buildMiner() {
      this.ropeG = this.add.graphics().setDepth(Z.bag);
      this.bagImg = this.add.image(0, 0, 'bagEmpty').setDepth(Z.bag).setVisible(false);
      this.poseA = this.add.image(0, 0, 'minerHang').setDepth(Z.miner);
      this.poseB = this.add.image(0, 0, 'minerHang').setDepth(Z.miner).setAlpha(0);
      this.pose = { key: '', flip: false };
      this.setPose('minerHang', false, true);
      this.lampImg = this.add.image(0, 0, 'lampLit').setOrigin(0.5, 0).setDepth(Z.lamp);
      this.lampImg.setScale(S.lampHeight / this.lampImg.height);
      this.flame = this.add.image(0, 0, 'glow').setDepth(Z.light).setTint(0xffc060).setBlendMode('ADD').setAlpha(0.7).setDisplaySize(34, 34);
    }

    buildLight() {
      this.warm = this.add.image(0, 0, 'glow').setDepth(Z.light).setTint(0xff9a30).setBlendMode('ADD').setAlpha(0.16);
      this.warm.setDisplaySize(S.lightRadius * 2.2, S.lightRadius * 2.2);
      this.darkImg = this.add.image(0, 0, 'darkHole').setDepth(Z.dark).setAlpha(S.darkness);
      this.darkImg.setScale(S.lightRadius / 64);             // the hole's radius is a quarter of the 256px texture
      this.darkG = this.add.graphics().setDepth(Z.dark);
      this.bagGlow = this.add.image(0, 0, 'glow').setDepth(Z.glow).setTint(AMBER).setBlendMode('ADD').setAlpha(0);
    }

    buildFx() {
      this.sparks = this.add.particles(0, 0, 'dot', {
        speed: { min: 80, max: 280 }, angle: { min: 0, max: 360 }, lifespan: { min: 180, max: 460 },
        scale: { start: 0.55, end: 0 }, tint: [0xffe0a0, 0xffa030, 0xffffff], blendMode: 'ADD', gravityY: 520, emitting: false,
      }).setDepth(Z.sparks);
      this.dust = this.add.particles(0, 0, 'dot', {
        speedY: { min: 20, max: 80 }, speedX: { min: -12, max: 12 }, lifespan: { min: 1800, max: 3200 },
        scale: { start: 0.45, end: 0.2 }, alpha: { start: 0.5, end: 0 }, tint: 0xa39d92, gravityY: 70, emitting: false,
      }).setDepth(Z.fx);
      this.smoke = this.add.particles(0, 0, 'dot', {
        speedY: { min: -45, max: -15 }, speedX: { min: -10, max: 10 }, lifespan: { min: 1600, max: 2600 },
        scale: { start: 0.7, end: 2.8 }, alpha: { start: 0.4, end: 0 }, tint: 0x8a8580, emitting: false,
      }).setDepth(Z.fx);
    }

    setPose(key, flip, instant) {
      if (this.pose.key === key && this.pose.flip === flip) return;
      this.pose = { key, flip };
      const next = this.poseB, cur = this.poseA;
      next.setTexture(key).setFlipX(flip).setOrigin(flip ? 1 - S.ropeX[key] : S.ropeX[key], 0);
      next.setScale(S.minerHeight / next.height).setRotation(0);
      this.tweens.killTweensOf([cur, next]);
      if (instant) { next.setAlpha(1); cur.setAlpha(0); }
      else {
        this.tweens.add({ targets: next, alpha: 1, duration: S.poseFadeMs });
        this.tweens.add({ targets: cur, alpha: 0, duration: S.poseFadeMs });
      }
      this.poseA = next; this.poseB = cur;
    }

    fitCamera() {
      const cam = this.cameras.main, W = this.scale.width, H = this.scale.height;
      cam.setSize(W, H);
      const zoom = Math.min(W / S.viewWidth, H / S.viewHeightMin);
      cam.setZoom(zoom);
      const hw = Math.round(clamp((W / zoom) * S.shaftScreenFraction / 2, S.shaftHalfWidthMin, S.shaftHalfWidthMax));
      if (hw !== this.hw) { this.hw = hw; this.buildShaft(hw); this.nodes.forEach((n) => this.placeNode(n)); }
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
      this.blockInfo = { height: b.height, arrivedAt: b.arrivedAt || Date.now(), prevOpenMs: b.prevOpenMs };
      if (b.initial) { this.openMine(b, false); return; }
      if (b.missed) {
        // a block came while the feed was down: no catch; bring the miner up safely
        if (this.minerY > 0) { this.minerY = S.surfaceY; this.mining = null; this.bank(); }
        this.openMine(b, true);
        this.say('Feed back. A block came while it was down; you were brought up safely.', 6);
        return;
      }
      Sound.knock();
      this.cameras.main.shake(450, 0.007);
      const v = this.cameras.main.worldView;
      for (let i = 0; i < 90; i++) this.dust.explode(1, v.x + Math.random() * v.width, v.y + Math.random() * v.height * 0.6);
      if (this.minerY > 0) this.caught();
      this.hatch = 'shut'; this.clearNodes(); this.mining = null;
      this.shutTimer = setTimeout(() => this.openMine(b, true), S.hatchShutSeconds * 1000);
    }

    openMine(b, ring) {
      const rng = seededRandom(b.hash);
      this.clearNodes();
      this.mine = { hash: b.hash, height: b.height, spawnRng: seededRandom(b.hash + '|spawn'), spawnT: 0, nextId: 0 };
      for (let l = 0; l < S.levels; l++) for (let i = 0; i < S.nodesPerLevel[l]; i++) this.addNode(rng, l);
      this.hatch = 'open';
      if (ring) Sound.bell();
      this.say('Block ' + b.height.toLocaleString() + ' · the hatch is open', 4);
    }

    addNode(rng, level) {
      const r = S.oreRadius[level] * (0.8 + 0.4 * rng());
      for (let tries = 0; tries < 12; tries++) {
        // same draws in the same order as before: the same block lays out the same mine under the same rules
        const side = rng() < 0.5 ? -1 : 1, xr = rng();
        const reachDx = S.reachHalfWidth - r * 0.5 - xr * 22;
        const y = level * S.levelHeight + 40 + rng() * (S.levelHeight - 80);
        const crack = rng() * Math.PI;
        const value = Math.max(1, Math.round(S.oreValue[level] * (0.7 + 0.6 * rng())));
        const tilt = (rng() - 0.5) * 0.6 - side * 0.5;
        if (this.nodes.some((n) => Math.hypot(n.side * n.reachDx - side * reachDx, n.y - y) < n.r + r + 10)) continue;
        const n = { id: this.mine.nextId++, side, reachDx, inset: xr * 14, y, r, crack, value, weight: S.oreWeight[level], level, hp: 1, flash: 0 };
        n.img = this.add.image(0, y, 'crystal' + Math.min(level, 3)).setDepth(Z.ore).setRotation(tilt).setTint(S.oreTint);
        n.size = (r * 4.2) / n.img.width; n.img.setScale(n.size);
        n.glow = this.add.image(0, y, 'glow').setDepth(Z.glow).setTint(S.oreTint).setBlendMode('ADD').setDisplaySize(r * 5, r * 5);
        this.placeNode(n);
        this.nodes.push(n);
        return;
      }
    }
    removeNode(n) { n.img.destroy(); n.glow.destroy(); this.nodes = this.nodes.filter((x) => x !== n); }
    clearNodes() { for (const n of this.nodes) { n.img.destroy(); n.glow.destroy(); } this.nodes = []; }

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
    inReach(n) { return Math.hypot(n.reachDx, n.y - this.minerY) <= S.lampReach; }

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
      n.hp -= 1 / swingsNeeded; n.flash = 0.12;
      Sound.tick();
      this.sparks.explode(t >= 1 ? 18 : 8, n.x, n.y);
      // a small jolt toward the rock; he stays on the rope
      this.tweens.add({ targets: this, jolt: 5 * n.side, duration: 70, yoyo: true, ease: 'Quad.easeOut' });
      this.float(n.x, n.y - n.r - 8, t >= 1 ? 'clean' : t > 0.5 ? 'rough' : 'sloppy');
      if (n.hp <= 1e-9) {
        this.sparks.explode(26, n.x, n.y);
        this.removeNode(n); this.mining = null;
        if (this.bagWeight() + n.weight > S.bagCapacity + 1e-9) this.say('No room in the bag. The ore fell.', 2.5);
        else { this.bag.push({ value: n.value, weight: n.weight }); this.say('+' + n.value + ' ore in the bag', 1.5); }
      }
    }

    float(x, y, txt) {
      const t = this.add.text(x, y, txt, { fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: '16px', color: '#efe8da' }).setOrigin(0.5).setDepth(Z.fx);
      this.tweens.add({ targets: t, y: y - 26, alpha: 0, duration: 750, onComplete: () => t.destroy() });
    }

    // ---------- loop ----------
    bagWeight() { return this.bag.reduce((a, b) => a + b.weight, 0); }
    bagValue() { return this.bag.reduce((a, b) => a + b.value, 0); }
    climbSpeed() { return S.climbSpeed * (1 - (1 - S.fullBagClimbFactor) * Math.min(1, this.bagWeight() / S.bagCapacity)); }

    update(time, deltaMs) {
      const dt = Math.min(deltaMs, 100) / 1000;
      this.clock += dt;
      this.climbing = false;
      if (!this.paused && !this.overlay) {
        this.spawn(dt);
        const wasBelow = this.minerY > 0;
        if (this.mining) {
          if (!this.lampOn() || !this.nodes.includes(this.mining)) this.mining = null;
        } else if (this.holds.size > 0) {
          if (this.hatch === 'open') this.minerY = Math.min(DEPTH - 30, this.minerY + S.descendSpeed * dt);
        } else if (this.minerY > S.surfaceY) {
          this.minerY = Math.max(S.surfaceY, this.minerY - this.climbSpeed() * dt);
          this.climbing = true;
        }
        const below = this.minerY > 0;
        if (below && !wasBelow && !this.inShift) { this.inShift = true; records.get().shifts++; records.save(); }
        if (!below && wasBelow) this.bank();
        if (below) {
          const lvl = Math.min(S.levels, Math.floor(this.minerY / S.levelHeight) + 1);
          if (lvl > records.get().deepestLevel) { records.get().deepestLevel = lvl; records.save(); }
          if (this.oil > 0) {
            this.oil = Math.max(0, this.oil - S.oilBurnPerSecond * dt);
            if (this.oil === 0) this.lampDied();
          }
        }
      }
      for (const n of this.nodes) n.flash = Math.max(0, n.flash - dt);
      // at a node he swings over on the rope until the pick reaches the wall
      const targetX = this.mining ? this.mining.side * Math.max(0, this.hw - 68) : 0;
      this.minerX += (targetX - this.minerX) * Math.min(1, dt * 8);
      const cam = this.cameras.main;
      cam.centerOn(0, this.minerY + (cam.height / cam.zoom) * S.cameraLead);
      this.draw();
      this.hud();
    }

    lampDied() {
      this.say('Your lamp is out. Let go to climb by feel.', 4);
      this.smoke.explode(22, this.lampX, this.lampY + 6);
    }

    draw() {
      const x = this.minerX + this.jolt, y = this.minerY, lit = this.lampOn();
      this.hatchImg.setTexture(this.hatch === 'open' ? 'hatchOpen' : 'hatchShut');

      // the miner: 3 painted poses, sliding between them
      if (this.mining) this.setPose('minerSwing', this.mining.x < 0);
      else if (this.climbing) this.setPose('minerClimb', false);
      else this.setPose('minerHang', false);
      const top = y - S.minerHeight * 0.42;
      this.poseA.setPosition(x, top); this.poseB.setPosition(x, top);

      // lamp on the belt
      const facing = this.pose.flip ? -1 : 1;
      this.lampX = x + 22 * facing; this.lampY = y + 2;
      this.lampImg.setTexture(lit ? 'lampLit' : 'lampOut').setPosition(this.lampX, this.lampY);
      this.flame.setVisible(lit).setPosition(this.lampX, this.lampY + S.lampHeight * 0.62)
        .setAlpha(0.55 + 0.15 * Math.sin(this.clock * 11) + 0.08 * Math.sin(this.clock * 23));

      // the rope from the headframe to his hands
      const g = this.ropeG; g.clear();
      g.lineStyle(2.2, 0x6b5638, 1); g.lineBetween(x, -1500, x, top + 4);
      // the bag hangs from his belt, on the side away from the lamp; it swells and drags as it fills
      const fill = Math.min(1, this.bagWeight() / S.bagCapacity), hasOre = this.bag.length > 0;
      const bagKey = !hasOre ? 'bagEmpty' : fill < 0.6 ? 'bagHalf' : 'bagFull';
      const bh = S.bagHeight[0] + (S.bagHeight[1] - S.bagHeight[0]) * fill;
      const sway = Math.sin(this.clock * 2.1) * 0.08 * (1 - fill);
      const bx = x - 12 * facing, by = top + S.minerHeight * S.beltY;
      g.lineStyle(2, 0x8a7350, 1); g.lineBetween(x - 4 * facing, by - 2, bx, by + 4);
      this.bagImg.setVisible(true).setTexture(bagKey).setOrigin(S.ropeX[bagKey], 0).setPosition(bx, by).setRotation(sway);
      this.bagImg.setScale(bh / this.bagImg.height);

      // ore and cracks
      const cg = this.crackG; cg.clear();
      for (const n of this.nodes) {
        const s = n.size * (0.6 + 0.4 * n.hp) * (n.flash > 0 ? 1.08 : 1);
        n.img.setScale(s);
        if (n.flash > 0) n.img.setTintFill(0xfff1c8); else n.img.setTint(S.oreTint);
        n.glow.setAlpha(S.oreGlowInDark * (0.55 + 0.45 * n.hp) * (0.85 + 0.15 * Math.sin(this.clock * 1.7 + n.id)));
        if (n !== this.mining) continue;              // the crack shows only on the node you have chosen
        const cx = Math.cos(n.crack) * n.r * 1.35, cy = Math.sin(n.crack) * n.r * 1.35;
        cg.lineStyle(3, 0x120a02, 0.85); cg.lineBetween(n.x - cx, n.y - cy, n.x + cx, n.y + cy);
        cg.lineStyle(1, 0xfff0c0, 0.8); cg.lineBetween(n.x - cx, n.y - cy, n.x + cx, n.y + cy);
        cg.lineStyle(1, 0xb08d57, 0.9); cg.strokeCircle(n.x, n.y, n.r * 1.7);
      }

      // darkness over the whole shaft, a soft warm circle cut around the lamp
      const v = this.cameras.main.worldView, dg = this.darkG; dg.clear();
      const lx = this.lampX, ly = this.lampY + S.lampHeight * 0.6;
      this.warm.setVisible(lit).setPosition(lx, ly).setAlpha(0.26 + 0.03 * Math.sin(this.clock * 9));
      dg.fillStyle(0x000000, S.darkness);
      const L = v.x - 20, T = v.y - 20, R = v.right + 20, B = v.bottom + 20;
      if (lit) {
        const half = this.darkImg.displayWidth / 2;
        this.darkImg.setVisible(true).setPosition(lx, ly);
        const x0 = lx - half, x1 = lx + half, y0 = ly - half, y1 = ly + half;
        if (y0 > T) dg.fillRect(L, T, R - L, y0 - T);
        if (y1 < B) dg.fillRect(L, y1, R - L, B - y1);
        if (x0 > L) dg.fillRect(L, Math.max(T, y0), x0 - L, Math.min(B, y1) - Math.max(T, y0));
        if (x1 < R) dg.fillRect(x1, Math.max(T, y0), R - x1, Math.min(B, y1) - Math.max(T, y0));
      } else {
        this.darkImg.setVisible(false);
        dg.fillStyle(0x000000, S.darknessLampOut);
        dg.fillRect(L, T, R - L, B - T);
      }
      // with the lamp out, the bag's ore still glows
      const glowR = hasOre ? bh * (0.55 + 0.45 * fill) : 0;
      this.bagGlow.setPosition(bx, by + bh * 0.55).setDisplaySize(glowR * 2 || 1, glowR * 2 || 1)
        .setAlpha(hasOre ? (lit ? 0.12 : 0.45) * (0.5 + fill) : 0);
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
      this.set('bagLabel', 'Bag ' + (+w.toFixed(1)) + '/' + S.bagCapacity + (w >= S.bagCapacity ? ' · full' : ''));
      // the honest number: P(block within the climb time) = 1 - e^(-t / mean). Block arrivals are memoryless.
      const mean = TEST ? S.testBlockSeconds : S.averageBlockSeconds;
      const secs = Math.max(0, this.minerY) / this.climbSpeed();
      const pct = this.minerY > 0 ? (1 - Math.exp(-secs / mean)) * 100 : 0;
      this.set('riskNum', (pct > 0 && pct < 1 ? pct.toFixed(1) : Math.round(pct)) + '%');
      this.set('msg', performance.now() < this.msgUntil ? this.msg : '');
      // the block clock: counts up from the moment the block arrived. Never a countdown.
      const bi = this.blockInfo;
      this.set('blockNum', bi ? 'Block ' + bi.height.toLocaleString() : 'Block');
      this.set('blockOpen', bi ? mmss(Date.now() - bi.arrivedAt) : '–:––');
      this.set('prevOpen', bi && bi.prevOpenMs != null ? 'previous block open ' + mmss(bi.prevOpenMs) : 'previous block open —');
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
