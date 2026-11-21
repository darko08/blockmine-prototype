// Blockmine, cutaway version: a side-on mine, 12 levels joined by ladders, laid out from each block's hash.
// Every number is in cutaway/settings.js; every picture is a file listed there.
(function () {
  const S = window.SETTINGS;
  const TEST = new URLSearchParams(location.search).has('test');
  const T = S.tile, $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mmss = (ms) => {
    const t = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = String(t % 60).padStart(2, '0');
    return h ? h + ':' + String(m).padStart(2, '0') + ':' + s : m + ':' + s;
  };
  const Z = { sky: 0, rock: 1, tunnel: 2, ladder: 3, ore: 4, oreGlow: 5, crack: 6, bag: 7, miner: 8, lamp: 9, light: 10, sparks: 11, fog: 20, glimmer: 21, hatch: 3.5, label: 23, fx: 24 };
  const FONT = '"Cormorant Garamond", Georgia, serif';
  // the phone action button's symbols (same drawings as the prompt above his head)
  const ICON = {
    ladder: '<svg viewBox="0 0 64 64" width="34" height="34" fill="none" stroke="#e0b878" stroke-width="6" stroke-linecap="round"><path d="M18 6V58M46 6V58M18 16H46M18 28H46M18 40H46M18 52H46"/></svg>',
    pick: '<svg viewBox="0 0 64 64" width="34" height="34" fill="none" stroke="#e0b878" stroke-linecap="round"><path d="M14 54L44 18" stroke-width="6"/><path d="M18 14Q40 4 58 30" stroke-width="7"/></svg>',
  };

  const records = Records(TEST, 'cutaway');
  if (TEST) $('test').style.display = 'block';

  class Mine extends Phaser.Scene {
    constructor() { super('cutaway'); }

    preload() {
      const v = (p) => p + '?v=' + S.artVersion;
      for (const [key, path] of Object.entries(S.art)) {
        if (Array.isArray(path)) path.forEach((p, i) => this.load.image(key + i, v(p)));
        else this.load.image(key, v(path));
      }
    }

    create() {
      window.blockmine = this;                               // handy for testing from the console
      this.makeTextures();
      this.cameras.main.setBackgroundColor('#000000');
      this.input.addPointer(4);
      this.input.mouse && this.input.mouse.disableContextMenu();

      this.mine = null; this.nodes = []; this.mineObjs = [];
      this.mode = 'ground'; this.lvl = -1; this.ladderK = null; this.mx = 0; this.my = 0; this.vx = 0; this.vy = 0; this.falling = null;
      this.stun = 0; this.pitReturn = null; this.facing = 1; this.speed = 1; this.walkDist = 0; this.climbDist = 0; this.moving = false;
      this.keys = { left: false, right: false, up: false, down: false }; this.pad = { left: false, right: false }; this.press = { jump: false, action: false };
      this.mining = null; this.drag = null;
      this.bag = []; this.oil = S.oilStart; this.inShift = false;
      this.hatch = 'waiting'; this.paused = false; this.overlay = false;
      this.shutTimer = null; this.msgUntil = 0; this.clock = 0; this.blockInfo = null; this.risk = 0;

      this.crackG = this.add.graphics().setDepth(Z.crack);
            this.buildMiner();
      this.buildFx();

      this.input.on('pointerdown', (p) => this.down(p));
      this.input.on('pointermove', (p) => this.move(p));
      this.input.on('pointerup', (p) => this.up(p));
      this.input.on('pointerupoutside', (p) => this.up(p));

      this.scale.on('resize', () => this.fitCamera());
      this.fitCamera();
      this.bindHud();
      startChain(TEST, (b) => this.onBlock(b), (s) => this.onStatus(s));
    }

    makeTextures() {
      const canvas = (key, n, draw) => { const t = this.textures.createCanvas(key, n, n); draw(t.getContext(), n); t.refresh(); };
      canvas('glow', 128, (c, n) => {
        const g = c.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
        g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.fillRect(0, 0, n, n);
      });
      canvas('fadeX', 64, (c, n) => {   // black on the left fading to clear on the right
        const g = c.createLinearGradient(0, 0, n, 0);
        g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.fillRect(0, 0, n, n);
      });
      // the soil-and-rock edge under the ground line: the upper rock painting with a ragged top, darkening downward
      if (!this.textures.exists('soilEdge')) {
        const src = this.textures.get('rock0').getSourceImage(), W = 512, H = 128;
        const t = this.textures.createCanvas('soilEdge', W, H), c = t.getContext(), rng = seededRandom('soil');
        c.drawImage(src, 0, 0, src.width, src.height * H / W, 0, 0, W, H);
        const g = c.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, 'rgba(40,28,16,0.15)'); g.addColorStop(0.55, 'rgba(10,8,6,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0.62)');
        c.fillStyle = g; c.fillRect(0, 0, W, H);
        c.globalCompositeOperation = 'destination-in';
        c.beginPath(); c.moveTo(0, H);
        let y = 14;
        for (let x = 0; x <= W; x += 8) { y = Math.max(4, Math.min(30, y + (rng() - 0.5) * 10)); c.lineTo(x, (x === W ? 14 : y)); }
        c.lineTo(W, H); c.closePath(); c.fillStyle = '#000'; c.fill();
        // and loose stones sitting on the edge
        c.globalCompositeOperation = 'source-over';
        for (let i = 0; i < 22; i++) {
          const x = rng() * W, r = 3 + rng() * 7, yy = 18 + rng() * 22;
          const v = rng() * 30; c.fillStyle = `rgba(${Math.round(58 + v)},${Math.round(48 + v * 0.85)},${Math.round(38 + v * 0.7)},1)`;
          c.beginPath(); c.ellipse(x, yy, r * 1.3, r, rng() * 3, 0, Math.PI * 2); c.fill();
          c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(x + 1, yy + r * 0.5, r * 1.1, r * 0.5, 0, 0, Math.PI * 2); c.fill();
        }
        t.refresh();
      }
      canvas('rubble', 128, (c, n) => {   // a mound of loose rock, sitting on the bottom edge
        const rng = seededRandom('rubble');
        for (let i = 0; i < 60; i++) {
          const t = i / 60, x = n * (0.1 + 0.8 * rng()), top = n - (n * 0.55) * Math.sin(Math.PI * (x / n)) * (0.6 + 0.4 * rng());
          const y = top + (n - top) * rng() * 0.7, r = 4 + rng() * 9 * (1 - t * 0.4), v = rng() * 35;
          c.fillStyle = `rgb(${Math.round(52 + v)},${Math.round(44 + v * 0.85)},${Math.round(36 + v * 0.7)})`;
          c.beginPath(); c.ellipse(x, Math.min(n - r * 0.6, y), r * 1.3, r, rng() * 3, 0, Math.PI * 2); c.fill();
          c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(x + 1, Math.min(n - r * 0.3, y + r * 0.5), r, r * 0.45, 0, 0, Math.PI * 2); c.fill();
        }
      });
      // small brass symbols for the E prompt: a ladder and a pick
      const brass = '#e0b878';
      canvas('iconLadder', 64, (c, n) => {
        c.strokeStyle = brass; c.lineWidth = 6; c.lineCap = 'round';
        c.beginPath(); c.moveTo(18, 6); c.lineTo(18, 58); c.moveTo(46, 6); c.lineTo(46, 58);
        for (const y of [16, 28, 40, 52]) { c.moveTo(18, y); c.lineTo(46, y); }
        c.stroke();
      });
      canvas('iconPick', 64, (c, n) => {
        c.strokeStyle = brass; c.lineCap = 'round';
        c.lineWidth = 6; c.beginPath(); c.moveTo(14, 54); c.lineTo(44, 18); c.stroke();
        c.lineWidth = 7; c.beginPath(); c.moveTo(18, 14); c.quadraticCurveTo(40, 4, 58, 30); c.stroke();
      });
      canvas('dot', 16, (c, n) => {
        const g = c.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
        g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.fillRect(0, 0, n, n);
      });
    }

    // ---------- building ----------
    buildMine() {
      this.mineObjs.forEach((o) => o.destroy()); this.mineObjs = [];
      const keep = (o) => { this.mineObjs.push(o); return o; };
      const m = this.mine, G = m.G, W = S.cols * T, side = 30 * T, last = S.levels - 1;
      const k = 0.5;   // world units per texture pixel for the rock paintings
      const tile = (x, y, w, h, key, depth) => {
        const t = keep(this.add.tileSprite(x, y, w, h, key).setOrigin(0, 0).setDepth(depth).setTileScale(k));
        t.tilePositionX = x / k; t.tilePositionY = y / k;
        return t;
      };
      const img = (x, y, key, depth) => keep(this.add.image(x, y, key).setDepth(depth));
      // the night above the hatch: a painted backdrop standing on the ground line
      keep(this.add.graphics().setDepth(Z.sky)).fillStyle(0x07080b, 1).fillRect(-side, -3000, W + 2 * side, 3000);
      const sky = img(W / 2, 0, 'surface', Z.sky + 0.1).setOrigin(0.5, S.surfaceGround);
      sky.setScale(S.surfaceWidth / sky.width);
      // four bands of solid rock, one per zone, much darker than the hollow tunnels
      for (let z = 0; z < 4; z++) {
        const y0 = z === 0 ? 0 : G.floorY(z * S.zoneLevels - 1), y1 = z === 3 ? G.floorY(last) + 30 * T : G.floorY(z * S.zoneLevels + S.zoneLevels - 1);
        tile(-side, y0, W + 2 * side, y1 - y0, 'rock' + z, Z.rock).setTint(S.rockTint);
      }
      // a soil-and-rock edge instead of a hard line under the ground
      const soil = keep(this.add.tileSprite(-side, -S.soilEdge * 0.3, W + 2 * side, S.soilEdge, 'soilEdge').setOrigin(0, 0).setDepth(Z.rock + 0.5));
      soil.setTileScale(S.soilEdge / 128);
      // ladders, each in its own dark hole through the rock
      m.ladders.forEach((d) => {
        const lx = G.colX(d.c), y0 = G.floorY(d.top), y1 = G.floorY(d.bottom), up = d.top < 0 ? 0 : T * 0.6;
        tile(d.c * T + 3, y0, T - 6, G.ceilY(d.bottom) - y0 + 4, 'shaft' + G.zone(Math.max(0, d.top)), Z.tunnel - 0.1).setTint(0x8a8178);
        const lad = keep(this.add.tileSprite(lx, y0 - up, S.ladderWidth, y1 - y0 + up, 'ladder').setOrigin(0.5, 0).setDepth(Z.ladder));
        lad.setTileScale(S.ladderWidth / this.textures.get('ladder').getSourceImage().width);
      });
      // the tunnels: this zone's painted tunnel strip, repeating sideways, lined up in world space so its posts are where the
      // ore placement expects them; the ends fade into the rock
      const rnd = seededRandom(m.hash + '|props');
      m.levels.forEach((seg, l) => {
        const z = G.zone(l), x = seg.a * T, w = (seg.b - seg.a + 1) * T, fy = G.floorY(l), cy = G.ceilY(l), st = S.strip[z];
        const ks = MineGen.stripRepeat(S, z) / st.size[0], h = st.size[1] * ks, top = cy - st.ceil * h, pad = T * 0.5;
        const strip = keep(this.add.tileSprite(x - pad, top, w + 2 * pad, h, 'strip' + z).setOrigin(0, 0).setDepth(Z.tunnel).setTileScale(ks));
        strip.tilePositionX = (x - pad) / ks; strip.tilePositionY = 0;
        for (const end of [-1, 1]) {
          const f = img(end < 0 ? x - pad : x + w + pad, top, 'fadeX', Z.tunnel + 0.2).setOrigin(end < 0 ? 0 : 1, 0).setDisplaySize(pad * 2.2, h);
          if (end > 0) f.setFlipX(true);
        }
        // a few things lying about, placed by the block hash
        const ladderXs = m.ladders.filter((d) => d.top === l || d.bottom === l).map((d) => G.colX(d.c));
        const nodesHere = m.nodes.filter((n) => n.l === l);
        const clear = (px) => ladderXs.every((v) => Math.abs(v - px) > T * 1.2) && nodesHere.every((n) => Math.abs(n.x - px) > T && Math.abs(n.standX - px) > T * 0.8);
        const nProps = S.propsPerLevel[0] + Math.floor(rnd() * (S.propsPerLevel[1] - S.propsPerLevel[0] + 1));
        for (let i = 0; i < nProps; i++) {
          const kind = Math.floor(rnd() * S.art.props.length), px = x + T + rnd() * (w - 2 * T), flip = rnd() < 0.5;
          if (!clear(px)) continue;
          const hanging = kind === 3;   // the lantern hangs from the cap beam
          const pr = img(px, hanging ? cy + 2 : fy + 2, 'props' + kind, Z.tunnel + 0.55).setOrigin(0.5, hanging ? 0 : 1).setFlipX(flip);
          pr.setScale(S.propHeight[kind] / pr.height);
          if (hanging) img(px, cy + 2 + S.propHeight[kind] * 0.75, 'glow', Z.tunnel + 0.56).setTint(0xffa040).setBlendMode('ADD').setAlpha(0.55).setDisplaySize(T * 2.2, T * 2.2);
        }
        // gaps (a pit in the floor) and rubble mounds; both need a jump
        for (const t of m.terrain.filter((q) => q.l === l)) {
          if (t.kind === 'gap') {
            const g = keep(this.add.graphics().setDepth(Z.tunnel + 0.6)), d = S.pitDepth * T;
            g.fillStyle(0x020101, 1).fillRect(t.x0, fy - 4, t.x1 - t.x0, d + 4);
            g.fillStyle(0x2a1d12, 1).fillRect(t.x0 - 2, fy - 4, 3, d).fillRect(t.x1 - 1, fy - 4, 3, d);
          } else {
            img((t.x0 + t.x1) / 2, fy + 3, 'rubble', Z.tunnel + 0.6).setOrigin(0.5, 1).setDisplaySize((t.x1 - t.x0) * 1.4, t.h * 2.1);
          }
        }
        // the level number at the start of each level
        keep(this.add.text(x + 4, cy - 3, 'LEVEL ' + (l + 1), { fontFamily: FONT, fontSize: '33px', fontStyle: '500', color: '#ffd28a', stroke: '#000', strokeThickness: 6 })
          .setOrigin(0, 1).setScale(1 / 3).setDepth(Z.label).setAlpha(0.95));
      });
      // the headframe over the shaft; its hatch is open or shut
      this.hatchImg = keep(this.add.image(G.colX(m.c0), 4, this.hatch === 'open' ? 'hatchOpen' : 'hatchShut').setOrigin(0.5, 1).setDepth(Z.hatch));
      this.hatchImg.setScale(S.hatchWidth / this.hatchImg.width);
      // the fog: one pixel per fog cell, stretched smoothly over the mine; plus a memory of the cells you have seen
      const f = this.fog = { x0: -4 * T, y0: 0, cols: Math.ceil((W + 8 * T) / S.fogCell), rows: Math.ceil((G.floorY(last) + 4 * T) / S.fogCell) };
      f.seen = new Uint8Array(f.cols * f.rows);
      if (this.textures.exists('fog')) this.textures.remove('fog');
      f.tex = this.textures.createCanvas('fog', f.cols, f.rows); f.ctx = f.tex.getContext(); f.img = f.ctx.createImageData(f.cols, f.rows);
      keep(this.add.image(f.x0, f.y0, 'fog').setOrigin(0, 0).setScale(S.fogCell).setDepth(Z.fog));
      keep(this.add.graphics().setDepth(Z.fog)).fillStyle(0x000000, 1)
        .fillRect(-side, f.y0 + f.rows * S.fogCell, W + 2 * side, 4000)
        .fillRect(-side, 0, side + f.x0, 6000).fillRect(f.x0 + f.cols * S.fogCell, 0, side, 6000);
    }

    buildMiner() {
      this.minerImg = this.add.image(0, 0, 'minerStand').setOrigin(0.5, 1).setDepth(Z.miner);
      this.lampImg = this.add.image(0, 0, 'lampOut').setDepth(Z.lamp).setVisible(false);
      // the E prompt above his head: a symbol for what E will do, and the key
      this.promptBg = this.add.graphics().setDepth(Z.fx);
      this.promptIcon = this.add.image(0, 0, 'iconLadder').setDepth(Z.fx).setDisplaySize(12, 12);
      this.promptKey = this.add.text(0, 0, 'E', { fontFamily: FONT, fontSize: '33px', fontStyle: '600', color: '#efe8da' }).setOrigin(0.5).setScale(1 / 3).setDepth(Z.fx);   // covers his lantern once the oil is gone
      this.warm = this.add.image(0, 0, 'glow').setDepth(Z.light).setTint(0xff9a30).setBlendMode('ADD');
      this.bagGlow = this.add.image(0, 0, 'glow').setDepth(Z.glimmer).setTint(0xffb547).setBlendMode('ADD').setAlpha(0);
    }

    buildFx() {
      this.sparks = this.add.particles(0, 0, 'dot', {
        speed: { min: 60, max: 200 }, angle: { min: 0, max: 360 }, lifespan: { min: 160, max: 420 },
        scale: { start: 0.45, end: 0 }, tint: [0xffe0a0, 0xffa030, 0xffffff], blendMode: 'ADD', gravityY: 420, emitting: false,
      }).setDepth(Z.sparks);
      this.dust = this.add.particles(0, 0, 'dot', {
        speedY: { min: 20, max: 70 }, speedX: { min: -10, max: 10 }, lifespan: { min: 1600, max: 2800 },
        scale: { start: 0.4, end: 0.15 }, alpha: { start: 0.5, end: 0 }, tint: 0xa39d92, gravityY: 60, emitting: false,
      }).setDepth(Z.fx);
      this.smoke = this.add.particles(0, 0, 'dot', {
        speedY: { min: -40, max: -12 }, speedX: { min: -8, max: 8 }, lifespan: { min: 1400, max: 2400 },
        scale: { start: 0.5, end: 2 }, alpha: { start: 0.4, end: 0 }, tint: 0x8a8580, emitting: false,
      }).setDepth(Z.fx);
    }

    fitCamera() {
      const cam = this.cameras.main, W = this.scale.width, H = this.scale.height;
      cam.setSize(W, H);
      cam.setZoom(Math.min((H * S.minerScreenShare) / S.minerHeight, W / S.viewWidthMin));
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
      if (b.initial || !this.mine) { this.openMine(b, false); return; }
      if (b.missed) {
        if (this.below()) { this.toSurface(); this.bank(); }
        this.openMine(b, true);
        this.say('Feed back. A block came while it was down; you were brought up safely.', 6);
        return;
      }
      Sound.knock();
      this.cameras.main.shake(450, 0.006);
      const v = this.cameras.main.worldView;
      for (let i = 0; i < 80; i++) this.dust.explode(1, v.x + Math.random() * v.width, v.y + Math.random() * v.height * 0.6);
      if (this.below()) this.caught();
      this.hatch = 'shut'; this.mining = null;
      if (this.hatchImg) this.hatchImg.setTexture('hatchShut');
      this.shutTimer = setTimeout(() => this.openMine(b, true), (S.hatchShutSeconds * 1000) / this.speed);
    }

    openMine(b, ring) {
      this.clearNodes();
      this.mine = MineGen.generate(b.hash, S);
      MineGen.layoutNodes(this.mine);
      MineGen.layoutTerrain(this.mine);
      this.mine.spawnRng = seededRandom(b.hash + '|spawn'); this.mine.spawnT = 0;
      this.hatch = 'open';
      this.buildMine();
      this.mine.nodes.forEach((n) => this.showNode(n));
      if (!this.below()) this.toSurface();
      if (ring) Sound.bell();
      this.say('Block ' + b.height.toLocaleString() + ' · the hatch is open', 4);
    }

    showNode(n) {
      n.img = this.add.image(n.x, n.y, n.rich ? 'oreRich' : 'ore' + n.zone).setDepth(Z.ore).setRotation((n.crack - Math.PI / 2) * 0.12);   // out of the back wall
      n.size = (n.r * 3.4) / n.img.width; n.img.setScale(n.size);
      n.glow = this.add.image(n.x, n.y, 'glow').setDepth(Z.oreGlow).setTint(n.rich ? 0xfff0b0 : 0xff8a30).setBlendMode('ADD').setDisplaySize(n.r * 7, n.r * 7);
      const glimmers = n.rich || n.zone >= S.glimmerFromZone;
      n.glim = glimmers ? this.add.image(n.x, n.y, 'glow').setDepth(Z.glimmer).setTint(n.rich ? 0xfff0b0 : 0xff7a20).setBlendMode('ADD').setDisplaySize(n.r * 3.2, n.r * 3.2) : null;
      this.nodes.push(n);
    }
    removeNode(n) {
      n.img.destroy(); n.glow.destroy(); n.glim && n.glim.destroy();
      this.nodes = this.nodes.filter((x) => x !== n);
      this.mine.nodes = this.mine.nodes.filter((x) => x !== n);
    }
    clearNodes() { this.nodes.slice().forEach((n) => this.removeNode(n)); this.nodes = []; }

    spawn(dt) {
      const m = this.mine; if (this.hatch !== 'open' || !m) return;
      m.spawnT += dt;
      while (m.spawnT >= S.spawnEverySeconds) {
        m.spawnT -= S.spawnEverySeconds;
        const w = S.spawnZoneWeights, total = w.reduce((a, b) => a + b, 0);
        let pick = m.spawnRng() * total, z = 0;
        while (pick >= w[z]) { pick -= w[z]; z++; }
        const l = z * S.zoneLevels + Math.floor(m.spawnRng() * S.zoneLevels);
        if (m.nodes.filter((n) => n.l === l).length >= S.maxNodesPerLevel) continue;
        const n = MineGen.makeNode(m, m.spawnRng, l);
        if (n) this.showNode(n);
      }
    }

    // ---------- where the miner is ----------
    toSurface() {
      const m = this.mine;
      this.mode = 'ground'; this.lvl = -1; this.ladderK = null; this.falling = null; this.stun = 0; this.pitReturn = null;
      this.mx = m.G.colX(m.c0) - S.waitOffset * T; this.my = 0; this.vx = this.vy = 0; this.mining = null;
    }
    below() { return this.my > 1; }
    floorY(l) { return this.mine.G.floorY(l); }
    here() {   // for the honest number: where he is on the walking routes
      if (this.mode === 'ladder') return { kind: 'ladder', k: this.ladderK, y: this.my };
      const l = this.falling ? this.falling.toLvl : this.lvl, [x0, x1] = MineGen.span(this.mine, l);
      return { kind: 'level', l, x: clamp(this.mx, x0, x1) };
    }
    fill() { return Math.min(1, this.bagWeight() / S.bagCapacity); }
    factor() { return 1 - (1 - S.fullBagSpeedFactor) * this.fill(); }
    speeds() { const f = this.factor(); return { walk: S.runSpeed * f, up: S.climbSpeed * f, down: S.slideSpeed * f }; }
    hatchLoc() { return { kind: 'level', l: -1, x: this.mine.G.colX(this.mine.c0) }; }
    poseKey() {
      if (this.mining) return 'minerMine';
      if (this.mode === 'ladder') return Math.floor(this.climbDist / S.climbFrameEvery) % 2 ? 'minerClimbB' : 'minerClimbA';
      if (this.mode === 'air' && !this.falling) return 'minerWalk1';
      if (this.moving) return 'minerWalk' + (Math.floor(this.walkDist / S.walkFrameEvery) % 4);
      return 'minerStand';
    }
    // the lantern on his belt is the one lamp: the light comes from there
    lamp() {
      const key = this.poseKey(), P = S.pose[key], tex = this.textures.get(key).getSourceImage();
      const H = S.minerHeight * P.scale, w = H * tex.width / tex.height;
      return { x: this.mx + (P.lantern.x - P.bodyX) * w * this.facing, y: this.my - (1 - P.lantern.y) * H, h: Math.min(0.18, P.lantern.h) * H };
    }
    lampOn() { return this.oil > 0; }

    // ---------- direct control ----------
    bindKeys() {
      const map = { KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down' };
      window.addEventListener('keydown', (e) => {
        if (map[e.code]) { this.keys[map[e.code]] = true; e.preventDefault(); }
        if (e.code === 'Space') { if (!e.repeat) this.press.jump = true; e.preventDefault(); }
        if (e.code === 'KeyE' && !e.repeat) this.press.action = true;
        Sound.unlock();
      });
      window.addEventListener('keyup', (e) => { if (map[e.code]) this.keys[map[e.code]] = false; });
      window.addEventListener('blur', () => { for (const k in this.keys) this.keys[k] = false; });
      // phone: left, right, jump and action buttons. On a ladder, left and right become up and down.
      const hold = (id, on, off) => {
        const b = $(id);
        b.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); Sound.unlock(); on(); });
        for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, off);
      };
      hold('bLeft', () => { this.pad.left = true; }, () => { this.pad.left = false; });
      hold('bRight', () => { this.pad.right = true; }, () => { this.pad.right = false; });
      hold('bJump', () => { this.press.jump = true; }, () => {});
      hold('bAct', () => { this.press.action = true; }, () => {});
    }
    terrainAt(l, x, kind) { return this.mine.terrain.find((t) => t.l === l && t.kind === kind && x > t.x0 && x < t.x1); }
    blockRubble(l, x0, x1, feetY) {   // stop at a rubble mound unless his feet are above it
      for (const t of this.mine.terrain) {
        if (t.l !== l || t.kind !== 'rubble' || feetY <= this.floorY(l) - t.h) continue;
        if (x0 <= t.x0 && x1 > t.x0) return t.x0 - 0.01;
        if (x0 >= t.x1 && x1 < t.x1) return t.x1 + 0.01;
      }
      return x1;
    }
    startFall(kind, k, t) {   // only gaps make him fall: into the pit, then he climbs back out on the near side
      this.mode = 'air'; this.vx = 0; this.vy = Math.max(this.vy, 0); this.mining = null;
      this.falling = { toLvl: this.lvl, toY: this.floorY(this.lvl) + S.pitDepth * T, pit: true, back: this.facing > 0 ? t.x0 - T * 0.35 : t.x1 + T * 0.35 };
    }
    landFall() {
      const f = this.falling; this.falling = null;
      this.mode = 'ground'; this.lvl = f.toLvl; this.my = f.toY; this.vx = this.vy = 0;
      this.stun = S.fallStunSeconds; this.pitReturn = f.pit ? f.back : null;
      this.cameras.main.shake(180, 0.004); Sound.knock && Sound.tick();
      const spill = Math.round(this.bag.length * S.fallSpill);
      for (let i = 0; i < spill; i++) this.bag.splice(Math.floor(Math.random() * this.bag.length), 1);
      this.dust.explode(14, this.mx, this.my - 4);
      if (spill) this.sparks.explode(10 * spill, this.mx, this.my - 10);
      this.say('You fell. Stunned' + (spill ? ', and ' + spill + ' ore spilled from the bag.' : '.'), 3);
    }

    // off a ladder onto the floor at its top or foot
    stepOff(d, atTop, dir) {
      const l = atTop ? d.top : d.bottom;
      this.mode = 'ground'; this.lvl = l; this.my = this.floorY(l); this.ladderK = null;
      if (dir) this.facing = dir;
    }

    // what E does right now: mine a node beside him, or grab the ladder at whose top or foot he stands
    target() {
      if (this.mode !== 'ground' || this.stun > 0 || this.mining || !this.mine) return null;
      const near = this.nodes.filter((n) => n.l === this.lvl && Math.abs(n.x - this.mx) <= (S.oreStandGap + S.mineRange) * T)
        .sort((a, b) => Math.abs(a.x - this.mx) - Math.abs(b.x - this.mx))[0];
      if (near && this.hatch === 'open') return { kind: 'node', n: near };
      const m = this.mine;
      let best = -1, bd = Infinity;
      m.ladders.forEach((d, k) => {
        const dx = Math.abs(m.G.colX(d.c) - this.mx);
        if ((d.top === this.lvl || d.bottom === this.lvl) && dx <= S.grabRange * T && dx < bd) { best = k; bd = dx; }
      });
      return best >= 0 ? { kind: 'ladder', k: best } : null;
    }

    // E: mine a node beside you, or grab a ladder
    action() {
      const tg = this.target();
      if (!tg) return;
      const L = this.lamp(), near = tg.kind === 'node' ? tg.n : null;
      if (near) {
        if (!this.lampOn()) { this.say('Too dark to mine. Your lamp is out.', 2); return; }
        if (this.bagWeight() + near.weight > S.bagCapacity + 1e-9) { this.say('Your bag is full. Drop ore or go up.', 2.5); return; }
        // he stands beside a node, never on it
        if (Math.abs(near.x - this.mx) < S.oreStandGap * T * 0.8) this.mx = near.standX;
        if (Math.hypot(near.x - L.x, near.y - L.y) > S.lampReach * T + Math.abs(near.standX - this.mx)) return;
        this.mining = near; this.facing = near.x < this.mx ? -1 : 1;
        this.say('Drag along the crack to swing', 2);
        return;
      }
      const m = this.mine, best = tg.k;
      if (m.ladders[best].top === -1 && this.lvl === -1 && this.hatch !== 'open') { this.say('The hatch is shut.', 2); return; }
      this.mode = 'ladder'; this.ladderK = best; this.mx = m.G.colX(m.ladders[best].c); this.mining = null;
    }

    physics(dt) {
      const press = this.press; this.press = { jump: false, action: false };
      this.moving = false;
      if (this.stun > 0) {
        this.stun -= dt;
        if (this.stun <= 0) { this.stun = 0; if (this.pitReturn != null) { this.mx = this.pitReturn; this.my = this.floorY(this.lvl); this.pitReturn = null; } }
        return;
      }
      const f = this.factor(), onLadder = this.mode === 'ladder';
      const left = this.keys.left || (!onLadder && this.pad.left), right = this.keys.right || (!onLadder && this.pad.right);
      const up = this.keys.up || (onLadder && this.pad.left), down = this.keys.down || (onLadder && this.pad.right);
      const dir = (right ? 1 : 0) - (left ? 1 : 0);
      if (press.action) this.action();
      if (this.mode === 'ground') {
        const fy = this.floorY(this.lvl), [x0, x1] = MineGen.span(this.mine, this.lvl);
        if (dir && this.mining) this.mining = null;   // moving off leaves the node
        if (press.jump && !this.mining) {
          this.mode = 'air'; this.vy = -Math.sqrt(2 * S.gravity * S.jumpHeight);
          this.vx = dir * S.runSpeed * f;   // in the air he keeps his walking speed
          if (dir) this.facing = dir;
          return;
        }
        if (dir && !this.mining) {
          this.facing = dir;
          const nx = clamp(this.blockRubble(this.lvl, this.mx, this.mx + dir * S.runSpeed * f * dt, fy), x0, x1);
          this.moving = Math.abs(nx - this.mx) > 1e-3; this.walkDist += Math.abs(nx - this.mx); this.mx = nx;
        }
        // walking into a gap without jumping: a fall. Ladder openings are safe to walk across.
        const gap = this.terrainAt(this.lvl, this.mx, 'gap');
        if (gap) this.startFall('gap', 0, gap);
      } else if (this.mode === 'ladder') {
        const d = this.mine.ladders[this.ladderK], y0 = this.floorY(d.top), y1 = this.floorY(d.bottom);
        const v = up ? -S.climbSpeed * f : down ? S.slideSpeed * f : 0;
        this.my += v * dt; this.climbDist += Math.abs(v * dt);
        // he steps off only by climbing past an end; standing on a ladder's top or foot keeps hold of it
        if (v < 0 && this.my <= y0) this.stepOff(d, true, dir);
        else if (v > 0 && this.my >= y1) this.stepOff(d, false, dir);
        else this.my = clamp(this.my, y0, y1);
        if (this.mode === 'ladder' && dir && (this.my === y0 || this.my === y1)) this.stepOff(d, this.my === y0, dir);   // or by walking off at an end
      } else {   // in the air: a jump, or a fall
        this.vy += S.gravity * dt;
        let nx = this.mx + this.vx * dt; const ny = this.my + this.vy * dt;
        if (!this.falling) {
          const [x0, x1] = MineGen.span(this.mine, this.lvl), fy = this.floorY(this.lvl);
          nx = this.blockRubble(this.lvl, this.mx, nx, Math.min(ny, fy));
          if (nx < x0 || nx > x1) { nx = clamp(nx, x0, x1); this.vx = 0; }
          this.mx = nx;
          if (ny >= fy && this.vy > 0) {
            const gap = this.terrainAt(this.lvl, this.mx, 'gap');
            if (gap) { this.my = fy; this.startFall('gap', 0, gap); }
            else { this.my = fy; this.mode = 'ground'; this.vx = this.vy = 0; }
          } else this.my = ny;
        } else {
          this.my = ny;
          if (this.my >= this.falling.toY) { this.my = this.falling.toY; this.landFall(); }
        }
      }
    }

    // ---------- input: dragging along the crack ----------
    down(p) {
      Sound.unlock();
      if (this.overlay || this.paused || !this.mine || !this.mining) return;
      const w = this.cameras.main.getWorldPoint(p.x, p.y);
      if (Math.hypot(w.x - this.mining.x, w.y - this.mining.y) <= this.mining.r * S.nodeTouchSlop * 1.3) {
        this.drag = { id: p.id, node: this.mining, x0: w.x, y0: w.y, x: w.x, y: w.y, len: 0 };
      }
    }
    move(p) {
      const d = this.drag; if (!d || d.id !== p.id) return;
      const w = this.cameras.main.getWorldPoint(p.x, p.y);
      d.len += Math.hypot(w.x - d.x, w.y - d.y); d.x = w.x; d.y = w.y;
    }
    up(p) {
      const d = this.drag; if (!d || d.id !== p.id) return;
      this.drag = null;
      const dx = d.x - d.x0, dy = d.y - d.y0, disp = Math.hypot(dx, dy);
      if (disp < S.swingMinLength || this.mining !== d.node || !this.nodes.includes(d.node)) return;
      this.swing(d.node, dx, dy, disp, d.len);
    }

    // the same swing rule as the rope version: a clean drag breaks a node in 2 swings, a sloppy one in up to 5
    swing(n, dx, dy, disp, len) {
      const align = Math.abs(Math.cos(Math.atan2(dy, dx) - n.crack));
      const straight = disp / Math.max(disp, len);
      const t = clamp((align * straight - S.sloppyAt) / (S.cleanAt - S.sloppyAt), 0, 1);
      const swingsNeeded = S.sloppySwings - t * (S.sloppySwings - S.cleanSwings);
      n.hp -= 1 / swingsNeeded; n.flash = 0.12;
      Sound.tick();
      this.sparks.explode(t >= 1 ? 16 : 7, n.x, n.y);
      this.float(n.x, n.y - n.r - 10, t >= 1 ? 'clean' : t > 0.5 ? 'rough' : 'sloppy');
      if (n.hp <= 1e-9) {
        this.sparks.explode(24, n.x, n.y);
        this.removeNode(n); this.mining = null;
        if (this.bagWeight() + n.weight > S.bagCapacity + 1e-9) this.say('No room in the bag. The ore fell.', 2.5);
        else { this.bag.push({ value: n.value, weight: n.weight }); this.say((n.rich ? 'A rich node! ' : '') + '+' + n.value + ' ore in the bag', 2); }
      }
    }
    float(x, y, txt) {
      const t = this.add.text(x, y, txt, { fontFamily: FONT, fontSize: '15px', color: '#efe8da', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(Z.fx);
      this.tweens.add({ targets: t, y: y - 22, alpha: 0, duration: 750, onComplete: () => t.destroy() });
    }

    caught() {
      this.bag = []; this.inShift = false; this.oil = S.oilStart; this.drag = null;
      this.toSurface();
      records.get().timesCaught++; records.save();
      this.showOverlay('The deep is closed', 'The knock came before you reached the hatch. Your bag is lost. That counts as 1 death.');
    }
    bank() {
      const pts = this.bagValue();
      if (this.inShift) { records.get().totalPoints += pts; records.save(); }
      this.bag = []; this.inShift = false; this.oil = S.oilStart;
      if (pts) this.say('+' + pts + ' points banked', 3);
    }
    bagWeight() { return this.bag.reduce((a, b) => a + b.weight, 0); }
    bagValue() { return this.bag.reduce((a, b) => a + b.value, 0); }

    // ---------- loop ----------
    update(time, deltaMs) {
      const real = Math.min(deltaMs, 100) / 1000, dt = real * this.speed;   // test mode can run the whole game faster or slower
      this.clock += dt;
      if (this.mine && !this.paused && !this.overlay) {
        // small steps, so a fast game still can't skip over a hole or a gap
        for (let left = dt; left > 1e-6;) { const h = Math.min(left, S.maxStep); left -= h; this.step(h); }
      }
      for (const n of this.nodes) n.flash = Math.max(0, n.flash - dt);
      if (this.mine) {
        const cam = this.cameras.main, cx = this.mx, cy = this.my - S.minerHeight * 0.5;
        const ox = cam.midPoint.x, oy = cam.midPoint.y, k = Math.min(1, real * S.cameraFollow);
        cam.centerOn(this.camInit ? ox + (cx - ox) * k : cx, this.camInit ? oy + (cy - oy) * k : cy); this.camInit = true;
        this.draw();
      }
      this.hud();
    }

    step(dt) {
      this.spawn(dt);
      const wasBelow = this.below();
      this.physics(dt);
      const below = this.below();
      if (below && !wasBelow && !this.inShift) { this.inShift = true; records.get().shifts++; records.save(); }
      if (!below && wasBelow) this.bank();
      const h = this.here();
      if (this.mode === 'ground' && h.l >= 0 && h.l + 1 > records.get().deepestLevel) { records.get().deepestLevel = h.l + 1; records.save(); }
      if (below && this.oil > 0) {
        this.oil = Math.max(0, this.oil - S.oilBurnPerSecond * dt);
        if (this.oil === 0) this.lampDied();
      }
      if (this.mining && (!this.lampOn() || !this.nodes.includes(this.mining))) this.mining = null;
    }

    lampDied() {
      this.say('Your lamp is out. Feel your way back to the ladders.', 4);
      const L = this.lamp(); this.smoke.explode(18, L.x, L.y);
    }

    draw() {
      const lit = this.lampOn();
      const key = this.poseKey(), climbing = key === 'minerClimb', P = S.pose[key];
      const bob = 0;   // the walk frames carry the motion
      this.minerImg.setTexture(key).setScale((S.minerHeight * P.scale) / this.minerImg.height).setFlipX(this.facing < 0)
        .setOrigin(this.facing < 0 ? 1 - P.bodyX : P.bodyX, 1).setPosition(this.mx, this.my - bob)
        .setRotation(this.stun > 0 ? Math.sin(this.clock * 7) * 0.1 : 0);
      // the E prompt: a ladder when he stands at a ladder's top or foot, a pick when a node is beside him
      const tg = this.target(), px = this.mx, py = this.my - S.minerHeight * 1.12, show = !!tg && !this.overlay;
      this.promptBg.clear().setVisible(show); this.promptIcon.setVisible(show); this.promptKey.setVisible(show);
      if (show) {
        this.promptBg.fillStyle(0x080604, 0.85).fillRoundedRect(px - 15, py - 8, 30, 16, 3).lineStyle(1, 0xb08d57, 1).strokeRoundedRect(px - 15, py - 8, 30, 16, 3);
        this.promptIcon.setTexture(tg.kind === 'node' ? 'iconPick' : 'iconLadder').setPosition(px - 6, py);
        this.promptKey.setPosition(px + 7, py);
      }
      const sym = !tg ? 'E' : tg.kind === 'node' ? 'pick' : 'ladder';
      if (this.last.bAct !== sym) { this.last.bAct = sym; $('bAct').innerHTML = sym === 'E' ? 'E' : ICON[sym]; }
      // on a phone, the left and right buttons climb and slide while he is on a ladder
      this.set('bLeft', this.mode === 'ladder' ? '▲' : '◀'); this.set('bRight', this.mode === 'ladder' ? '▼' : '▶');
      const L = this.lamp(); L.y -= bob;
      this.lampImg.setVisible(!lit).setPosition(L.x, L.y).setScale((L.h * 1.25) / this.lampImg.height);
      // the bag on his back: a quarter of his height empty, half full
      const fill = Math.min(1, this.bagWeight() / S.bagCapacity), hasOre = this.bag.length > 0;
      const bh = S.bagHeight[0] + (S.bagHeight[1] - S.bagHeight[0]) * fill, bagKey = !hasOre ? 'bagEmpty' : fill < 0.6 ? 'bagHalf' : 'bagFull';
      // the sack is painted on his back; its ore still glows when the lamp is out
      const bx = this.mx - this.facing * S.minerHeight * 0.22, by = this.my - S.minerHeight * 0.8;
      this.warm.setVisible(lit).setPosition(L.x, L.y).setDisplaySize(S.lightRadius * T * 2.2, S.lightRadius * T * 2.2).setAlpha(S.lampWarmth + 0.02 * Math.sin(this.clock * 9));
      this.hatchImg.setTexture(this.hatch === 'open' ? 'hatchOpen' : 'hatchShut');

      // ore: lit glow, deep glimmer through the dark, the crack only on the node you chose
      const cg = this.crackG; cg.clear();
      for (const n of this.nodes) {
        n.img.setScale(n.size * (0.6 + 0.4 * n.hp) * (n.flash > 0 ? 1.1 : 1));
        if (n.flash > 0) n.img.setTintFill(0xfff1c8); else n.img.clearTint();
        const pulse = 0.85 + 0.15 * Math.sin(this.clock * 1.7 + n.id);
        n.glow.setAlpha(0.35 * pulse * (0.5 + 0.5 * n.hp));
        if (n.glim) n.glim.setAlpha(S.glimmer * pulse * (0.6 + 0.4 * n.hp));
        if (n !== this.mining) continue;
        const cx = Math.cos(n.crack) * n.r * 1.4, cy = Math.sin(n.crack) * n.r * 1.4;
        cg.lineStyle(3, 0x120a02, 0.9).lineBetween(n.x - cx, n.y - cy, n.x + cx, n.y + cy);
        cg.lineStyle(1, 0xfff0c0, 0.9).lineBetween(n.x - cx, n.y - cy, n.x + cx, n.y + cy);
        cg.lineStyle(1, 0xb08d57, 0.9).strokeCircle(n.x, n.y, n.r * 1.8);
      }
      this.drawFog(L, lit);
      // with the lamp out, the bag's ore still glows
      this.bagGlow.setPosition(bx, by).setDisplaySize(Math.max(1, bh * 2.4), Math.max(1, bh * 2.4))
        .setAlpha(hasOre ? (lit ? 0.1 : 0.45) * (0.5 + fill) : 0);
    }

    // fog of war: lit around the lamp, dim where you have been, black everywhere else. The surface is never fogged.
    drawFog(L, lit) {
      const f = this.fog, c = S.fogCell, R = S.lightRadius * T, d = f.img.data, dim = lit ? S.fogVisited : S.fogVisitedLampOut;
      for (let j = 0; j < f.rows; j++) {
        const y = f.y0 + (j + 0.5) * c;
        for (let i = 0; i < f.cols; i++) {
          const k = j * f.cols + i, x = f.x0 + (i + 0.5) * c;
          let a = 1;
          if (lit) {
            const dist = Math.hypot(x - L.x, y - L.y);
            if (dist <= R * 0.85) f.seen[k] = 1;               // remember what the lamp shows
            a = clamp((dist - R * 0.55) / (R * 0.45), 0, 1);
          }
          if (f.seen[k]) a = Math.min(a, dim);
          d[k * 4 + 3] = Math.round(a * 255);
        }
      }
      f.ctx.putImageData(f.img, 0, 0); f.tex.refresh();
    }

    // ---------- HUD ----------
    bindHud() {
      const stop = (e) => e.stopPropagation();
      ['drop', 'recBtn', 'ovBtn', 'recClose', 'modeBtn'].forEach((id) => { $(id).addEventListener('pointerdown', stop); });
      this.bindKeys();
      // test mode: the whole game speed
      if (TEST) {
        const sl = $('speed'), show = () => { this.speed = TestClock.speed = S.testSpeeds[+sl.value]; $('speedVal').textContent = this.speed + '×'; };
        sl.max = S.testSpeeds.length - 1;
        let saved = S.testSpeeds.indexOf(1); try { const v = +localStorage.getItem('blockmine.cutaway.testSpeed'); if (v >= 0 && v < S.testSpeeds.length && localStorage.getItem('blockmine.cutaway.testSpeed') !== null) saved = v; } catch (e) {}
        sl.value = saved; show();
        sl.addEventListener('input', () => { show(); try { localStorage.setItem('blockmine.cutaway.testSpeed', sl.value); } catch (e) {} });
        sl.addEventListener('change', () => sl.blur());
        for (const ev of ['pointerdown', 'keydown']) sl.addEventListener(ev, (e) => e.stopPropagation());
        $('speedBox').style.display = 'flex';
      }
      $('drop').onclick = () => { const p = this.bag.pop(); if (p) { Sound.tick(); this.say('Dropped ' + p.value + ' ore', 1.5); } };
      $('recBtn').onclick = () => {
        const r = records.get();
        $('rShifts').textContent = r.shifts; $('rDeep').textContent = r.deepestLevel;
        $('rCaught').textContent = r.timesCaught; $('rPoints').textContent = r.totalPoints;
        $('recMode').textContent = TEST ? '(test mode)' : '(live chain)';
        $('modeBtn').textContent = TEST ? 'Back to live chain' : 'Switch to test mode';
        $('records').style.display = 'flex'; this.overlay = true;
      };
      $('recClose').onclick = () => { $('records').style.display = 'none'; this.overlay = false; };
      $('modeBtn').onclick = () => { location.search = TEST ? '' : '?test'; };
      $('ovBtn').onclick = () => { $('overlay').style.display = 'none'; this.overlay = false; };
      this.last = {};
    }
    showOverlay(title, text) { $('ovTitle').textContent = title; $('ovText').textContent = text; $('overlay').style.display = 'flex'; this.overlay = true; }
    say(text, seconds) { this.msg = text; this.msgUntil = performance.now() + seconds * 1000; }
    set(id, v) { if (this.last[id] !== v) { this.last[id] = v; $(id).textContent = v; } }

    // the honest number: the walking time from where you stand back to the hatch, along the real route,
    // at your speed with this bag. P(block within that time) = 1 - e^(-t / mean); block arrivals are memoryless.
    climbOutSeconds() {
      if (!this.mine || !this.below()) return 0;
      const r = MineGen.route(this.mine, this.here(), this.hatchLoc(), this.speeds());
      return r ? r.time : 0;
    }
    hud() {
      this.set('oil', String(Math.ceil(this.oil)));
      const w = this.bagWeight();
      this.set('bagW', (+w.toFixed(1)) + '/' + S.bagCapacity);
      this.set('bag', this.bagValue() + ' points' + (w >= S.bagCapacity ? ' · full' : ''));
      const r = records.get(), firstShift = r.shifts < S.keysHintShifts || (r.shifts === S.keysHintShifts && this.inShift);
      $('keys').style.display = firstShift ? '' : 'none';
      const mean = TEST ? S.testBlockSeconds : S.averageBlockSeconds, secs = this.climbOutSeconds();
      const pct = secs > 0 ? (1 - Math.exp(-secs / mean)) * 100 : 0;
      this.risk = pct;
      this.set('riskNum', (pct > 0 && pct < 1 ? pct.toFixed(1) : Math.round(pct)) + '%');
      this.set('msg', performance.now() < this.msgUntil ? this.msg : '');
      const bi = this.blockInfo;
      this.set('blockNum', bi ? bi.height.toLocaleString() : '–');
      this.set('blockOpen', bi ? mmss((TEST ? TestClock.now() : Date.now()) - bi.arrivedAt) : '–:––');
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
