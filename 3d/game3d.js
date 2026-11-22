// Blockmine 3D: the mine of the BLOCKMINE brief, drawn in 3D with a lit lantern and shadows.
// The rules are in rules3d.js (numbers), mine3d.js (the mine from the block hash) and economy3d.js (where every point
// goes); the simulator and the server use the same files. The block clock, records and sounds are the 2D game's.
// World: the game's units, x to the right and y downward; in three.js X = x, Y = -y, and Z points at the camera.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const S = window.SETTINGS, RULES = window.RULES, MineGen = window.MineGen3, { Economy, Purse } = window.Economy3;
const TEST = new URLSearchParams(location.search).has('test');
// online: the shared shaft on the server (?online on the server's own address, or ?server=wss://host/ws)
const QS = new URLSearchParams(location.search);
const ONLINE = QS.get('server') || (QS.has('online') ? (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws' : null);
const T = S.tile, $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mmss = (ms) => {
  const t = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = String(t % 60).padStart(2, '0');
  return h ? h + ':' + String(m).padStart(2, '0') + ':' + s : m + ':' + s;
};
const mineralText = (c) => ['coal', 'iron', 'silver'].filter((k) => c[k]).map((k) => c[k] + ' ' + k).join(', ');
const fmt = (n) => Math.round(n).toLocaleString('en');

// ---- the look of the 3D version (its own numbers; the rules' numbers stay in cutaway/settings.js) ----
const V = {
  depth: 2.3 * T,            // how deep the tunnels go into the rock, front to back
  viewHeight: S.minerHeight / S.minerScreenShare,   // world units the camera shows top to bottom, as in 2D
  fov: 32, tilt: 0.07,       // camera: field of view, and a slight look down
  lampIntensity: 120, lampDistance: S.lightRadius * T * 2.6, lampDecay: 1, lampOffset: [0, 18, 42],
  lampFill: 0.45,            // share of the lamp's light that casts no shadow (softens his shadow)
  lampColor: 0xffc890,       // an oil flame: warm, but closer to white than to yellow
  lampHalo: 0.1, flameSize: 0.05,
  ambient: 0.55,             // what lets the fog's "seen" areas stay dimly visible
  moon: 1.1,                 // light on the surface at night
  rockTex: 256,              // world units per repeat of the rock paintings
  propHeight: { cart: 30, barrel: 22, crate: 20, lantern: 18 },
  timberEvery: 5.5 * T,      // spacing of timber sets along a tunnel (zones 1-3)
  pickScale: 0.42,           // pickaxe length as a share of his height
  amberEmissive: [0.35, 0.55, 0.8, 1.1],    // amber (the sats) glows more the deeper it lies
  humRange: 900, music: false,             // world units: the hum of the Deep is heard this far from the Vault, louder closer
  lampSize: 0.16,            // the belt lantern's height, handle included, as a share of his height
  lampHook: [0.04, 0.02, 0.15],   // the belt hook, from his hips: forward, up, to his right (shares of his height)
  turnRate: 7,               // how quickly he turns to face a new way (higher = snappier)
  pickLength: 0.48,          // the pick, end to end, as a share of his height (a real pick is about 0.9 m)
  bagBack: 0.0,              // the strap's top: right over his shoulders, level with his chest bone front to back
  bagUp: 0.17, bagLean: -0.38, bagSwing: 0.5,   // the strap's top above his chest bone; the sack leans back onto his back; it swings half as freely
  pileScale: 1.3,            // 3D deposit piles are this much taller than the 2D pile heights (their base is wide rubble)
  walkStride: 50,            // world units per cycle of the Mixamo walk (a man 1.8 m tall: about 1.65 m)
  climbStride: 18,           // world units climbed per cycle of the Mixamo ladder climb (about two rungs)
  swingSeconds: 1.0,         // one swing of the pick, start to recovery
  jumpTimes: [0.68, 1.03, 1.35, 1.75],   // the Mixamo jump clip: take-off, peak, touch-down, back up from the landing crouch (s)
  landSeconds: 0.22,         // how long the landing crouch shows before he walks or stands again
};
const MODELS = ['miner', 'pick', 'dep_bitcoin', 'dep_iron', 'dep_silver', 'bag_empty', 'bag_half', 'bag_full', 'ladder', 'headframe', 'cart', 'barrel', 'crate', 'lantern', 'timber'];

// ---------- sound: mute button and M, remembered in this browser (same as the 2D page) ----------
const MUTE_KEY = 'blockmine.cutaway.muted';
const ICON = {
  soundOn: '<svg viewBox="0 0 32 32" width="22" height="22" fill="none" stroke="#e0b878" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12H10L17 6V26L10 20H5Z" fill="#e0b878" fill-opacity=".25"/><path d="M21 11.5Q24 16 21 20.5M24.5 8Q30 16 24.5 24"/></svg>',
  soundOff: '<svg viewBox="0 0 32 32" width="22" height="22" fill="none" stroke="#e0b878" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12H10L17 6V26L10 20H5Z" fill="#e0b878" fill-opacity=".25"/><path d="M21.5 12.5L28.5 19.5M28.5 12.5L21.5 19.5"/></svg>',
  ladder: '<svg viewBox="0 0 64 64" width="34" height="34" fill="none" stroke="#e0b878" stroke-width="6" stroke-linecap="round"><path d="M18 6V58M46 6V58M18 16H46M18 28H46M18 40H46M18 52H46"/></svg>',
  pick: '<svg viewBox="0 0 64 64" width="34" height="34" fill="none" stroke="#e0b878" stroke-linecap="round"><path d="M14 54L44 18" stroke-width="6"/><path d="M18 14Q40 4 58 30" stroke-width="7"/></svg>',
};
function setMute(m) {
  Sound.setMuted(m);
  const b = $('mute'); b.innerHTML = m ? ICON.soundOff : ICON.soundOn;
  b.setAttribute('aria-label', m ? 'Sound is off. Turn it on (M)' : 'Sound is on. Turn it off (M)'); b.title = m ? 'Sound off (M)' : 'Sound on (M)';
}
function toggleMute() { const m = !Sound.muted(); setMute(m); try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch (e) {} if (!m) Sound.tick(); }
{ let m = false; try { m = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) {} setMute(m); }
$('mute').addEventListener('pointerdown', (e) => e.stopPropagation());
$('mute').addEventListener('click', () => { toggleMute(); $('mute').blur(); });
window.addEventListener('keydown', (e) => { if (e.code === 'KeyM' && !e.repeat) toggleMute(); });

const records = Records(TEST, 'cutaway3d');
const ECO_KEY = 'blockmine3d.economy' + (TEST ? '.test' : ''), PURSE_KEY = 'blockmine3d.purse' + (TEST ? '.test' : '');
const loadJSON = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
const saveJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
if (TEST) $('test').style.display = 'block';

// ---------- fog of war, painted into every material: lit around the lamp, dim where you have been, black elsewhere ----------
const fogU = { fogMap: { value: null }, fogBox: { value: new THREE.Vector4(0, 0, 1, 1) } };
function fogged(mat) {
  if (mat.userData.fogged) return mat;
  mat.userData.fogged = true;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.fogMap = fogU.fogMap; sh.uniforms.fogBox = fogU.fogBox;
    sh.vertexShader = 'varying vec2 vFogW;\n' + sh.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\n  vFogW = (modelMatrix * vec4(transformed, 1.0)).xy;');
    sh.fragmentShader = 'uniform sampler2D fogMap;\nuniform vec4 fogBox;\nvarying vec2 vFogW;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
  float fa = 0.0;
  if (vFogW.y < -0.5) {
    vec2 fuv = vec2((vFogW.x - fogBox.x) / fogBox.z, 1.0 - (-vFogW.y - fogBox.y) / fogBox.w);
    fa = (fuv.x < 0.0 || fuv.x > 1.0 || fuv.y < 0.0) ? 1.0 : texture2D(fogMap, fuv).a;
  }
  gl_FragColor.rgb *= 1.0 - fa;`);
  };
  mat.needsUpdate = true;
  return mat;
}

// ---------- loading ----------
const loader = new GLTFLoader();
const texLoader = new THREE.TextureLoader();
async function loadAll() {
  const models = {};
  await Promise.all(MODELS.map((n) => new Promise((res) => loader.load('models/' + n + '.glb?v=11', (g) => { models[n] = g; res(); }, undefined, () => res()))));
  const tex = (p) => new Promise((res) => texLoader.load('../' + p + '?v=' + S.artVersion, (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; res(t);
  }, undefined, () => res(null)));
  const rock = await Promise.all(S.art.rock.map(tex)), shaft = await Promise.all(S.art.shaft.map(tex)), surface = await tex(S.art.surface);
  return { models, rock, shaft, surface };
}

// a model, scaled so its height is h, standing on its base (the props were exported with their origin at the base)
function place(model, h, opts = {}) {
  const o = (opts.skinned ? SkeletonUtils.clone(model.scene) : model.scene.clone(true));
  const box = new THREE.Box3().setFromObject(o), size = box.getSize(new THREE.Vector3());
  const k = h / (opts.by === 'width' ? Math.max(size.x, size.z) : size.y);
  o.scale.setScalar(k);
  o.traverse((m) => {
    if (!m.isMesh) return;
    m.castShadow = opts.cast !== false; m.receiveShadow = true;
    if (opts.cloneMat) m.material = m.material.clone();
    fogged(m.material);
  });
  return o;
}

class Game {
  constructor(assets) {
    window.blockmine3d = this;
    this.A = assets;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.4;
    $('game').appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x07080b);
    this.camera = new THREE.PerspectiveCamera(V.fov, 1, 5, 6000);
    this.world = new THREE.Group(); this.scene.add(this.world);       // rebuilt for every block
    this.scene.add(new THREE.HemisphereLight(0x8a93a8, 0x2a2018, V.ambient));
    const moon = new THREE.DirectionalLight(0x9fb0d0, V.moon); moon.position.set(-300, 600, 400); this.scene.add(moon);
    this.lampLight = new THREE.PointLight(V.lampColor, V.lampIntensity, V.lampDistance, V.lampDecay);
    this.lampLight.castShadow = true; this.lampLight.shadow.mapSize.set(1024, 1024); this.lampLight.shadow.bias = -0.002; this.lampLight.shadow.camera.near = 2;
    this.scene.add(this.lampLight);
    this.lampFill = new THREE.PointLight(V.lampColor, V.lampIntensity * V.lampFill, V.lampDistance, V.lampDecay); this.scene.add(this.lampFill);

    this.mine = null; this.nodes = [];
    this.mode = 'ground'; this.lvl = -1; this.ladderK = null; this.mx = 0; this.my = 0; this.vx = 0; this.vy = 0; this.falling = null;
    this.stun = 0; this.pitReturn = null; this.facing = 1; this.speed = 1; this.walkDist = 0; this.climbDist = 0; this.moving = false; this.climbV = 0;
    this.keys = { left: false, right: false, up: false, down: false }; this.pad = { left: false, right: false }; this.press = { jump: false, action: false };
    this.mining = null; this.drag = null; this.swingT = 0;
    this.bag = []; this.inShift = false;
    this.eco = Economy(RULES, loadJSON(ECO_KEY)); this.purse = Purse(RULES, loadJSON(PURSE_KEY));
    this.lampLit = false; this.oilLeft = 0;      // the lamp for this shift; measures of extra oil still burning
    this.hatch = 'waiting'; this.paused = false; this.overlay = false;
    this.shutTimer = null; this.msgUntil = 0; this.clock = 0; this.blockInfo = null; this.risk = 0; this.shake = 0; this.last = {};

    this.buildMiner(); this.buildFx();
    const c = this.renderer.domElement;
    c.addEventListener('pointerdown', (e) => this.down(e)); window.addEventListener('pointermove', (e) => this.move(e));
    window.addEventListener('pointerup', (e) => this.up(e)); window.addEventListener('pointercancel', (e) => this.up(e));
    window.addEventListener('resize', () => this.fit()); this.fit();
    this.bindHud();
    this.prev = performance.now();
    this.renderer.setAnimationLoop((t) => this.frame(t));
    if (ONLINE) this.net = new Net(this, ONLINE); else startChain(TEST, (b) => this.onBlock(b), (s) => this.onStatus(s));
    $('loading').style.display = 'none';
  }

  fit() {
    const W = window.innerWidth, H = window.innerHeight;
    this.renderer.setSize(W, H); this.camera.aspect = W / H;
    // as in 2D: he fills about a fifth of the height, but at least viewWidthMin world units show across
    const viewH = Math.max(V.viewHeight, S.viewWidthMin * 1.0 / this.camera.aspect);
    this.camDist = viewH / 2 / Math.tan(THREE.MathUtils.degToRad(V.fov / 2));
    this.camera.updateProjectionMatrix();
  }

  // ---------- building the mine ----------
  buildMine() {
    const old = this.world; this.scene.remove(old);
    old.traverse((o) => { if (o.geometry && o.userData.own) o.geometry.dispose(); });
    this.world = new THREE.Group(); this.scene.add(this.world);
    const m = this.mine, G = m.G, last = S.levels - 1, D = V.depth, zf = D / 2, zb = -D / 2;
    // the rock: a grid of cells, solid except tunnels and ladder shafts. Solid runs become boxes whose faces are the rock
    // front, the tunnel floors and ceilings and the tunnel ends; the back wall closes every opening.
    const c0 = -14, c1 = m.cols + 14, rows = G.floorY(last) / T + 5;
    const open = new Set(), key = (c, r) => c + ',' + r;
    m.levels.forEach((seg, l) => {
      for (let r = G.ceilY(l) / T; r < G.floorY(l) / T; r++) for (let c = seg.a; c <= seg.b; c++) open.add(key(c, r));
    });
    m.ladders.forEach((d) => { for (let r = G.floorY(d.top) / T; r < G.ceilY(d.bottom) / T; r++) open.add(key(d.c, r)); });
    const zoneOfRow = (r) => { const l = Math.ceil((r * T + 1) / (S.levelSpacing * T)) - 1; return G.zone(clamp(l, 0, last)); };
    const geo = [0, 1, 2, 3].map(() => ({ rock: [], back: [] }));
    const quad = (arr, a, b, c, d, n, uv) => arr.push({ p: [a, b, c, d], n, uv });
    const R = V.rockTex;
    for (let r = 0; r < rows; r++) {
      const z = zoneOfRow(r), y0 = -r * T, y1 = -(r + 1) * T, g = geo[z];
      let c = c0;
      while (c < c1) {
        if (open.has(key(c, r))) {   // back wall of an opening
          const x0 = c * T, x1 = x0 + T;
          quad(g.back, [x0, y1, zb], [x1, y1, zb], [x1, y0, zb], [x0, y0, zb], [0, 0, 1], (p) => [p[0] / R * 2, p[1] / R * 2]);
          c++; continue;
        }
        let e = c; while (e < c1 && !open.has(key(e, r))) e++;
        const x0 = c * T, x1 = e * T;
        quad(g.rock, [x0, y1, zf], [x1, y1, zf], [x1, y0, zf], [x0, y0, zf], [0, 0, 1], (p) => [p[0] / R, p[1] / R]);   // front
        for (let cc = c; cc < e; cc++) {   // tops, bottoms and ends that face an opening (tunnel floors, ceilings, ends)
          const a = cc * T, b = a + T;
          if (r === 0 || open.has(key(cc, r - 1))) quad(g.rock, [a, y0, zf], [b, y0, zf], [b, y0, zb], [a, y0, zb], [0, 1, 0], (p) => [p[0] / R, p[2] / R]);
          if (open.has(key(cc, r + 1))) quad(g.rock, [a, y1, zb], [b, y1, zb], [b, y1, zf], [a, y1, zf], [0, -1, 0], (p) => [p[0] / R, p[2] / R]);
        }
        if (open.has(key(c - 1, r))) quad(g.rock, [x0, y1, zb], [x0, y1, zf], [x0, y0, zf], [x0, y0, zb], [-1, 0, 0], (p) => [p[2] / R, p[1] / R]);
        if (open.has(key(e, r))) quad(g.rock, [x1, y1, zf], [x1, y1, zb], [x1, y0, zb], [x1, y0, zf], [1, 0, 0], (p) => [p[2] / R, p[1] / R]);
        c = e;
      }
    }
    const tint = new THREE.Color(0x8f857b);   // the rock between tunnels: darker than the tunnels, but lit by the lamp
    geo.forEach((g, z) => {
      for (const [list, map, color] of [[g.rock, this.A.rock[z], tint], [g.back, this.A.shaft[z], new THREE.Color(0xd8cfc4)]]) {
        if (!list.length) continue;
        const pos = [], nor = [], uv = [], idx = [];
        list.forEach((q, i) => {
          q.p.forEach((p) => { pos.push(...p); nor.push(...q.n); uv.push(...q.uv(p)); });
          idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
        });
        const bg = new THREE.BufferGeometry();
        bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bg.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
        bg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); bg.setIndex(idx);
        const mesh = new THREE.Mesh(bg, fogged(new THREE.MeshStandardMaterial({ map, color, roughness: 0.95, metalness: 0 })));
        mesh.receiveShadow = true; mesh.userData.own = true;
        this.world.add(mesh);
      }
    });
    // the night above: the painted surface as a far backdrop standing on the ground line, and the ground itself
    if (this.A.surface) {
      const img = this.A.surface.image, w = S.surfaceWidth * 2.2, h = w * img.height / img.width;
      const sky = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: this.A.surface, color: 0x9a9a9a }));
      sky.position.set(m.cols * T / 2, h * (0.5 - S.surfaceGround) * 0.98 + 40, -900); sky.userData.own = true; this.world.add(sky);
    }
    // ladders: one ladder model per ladder, stretched to its length
    const lad = this.A.models.ladder;
    m.ladders.forEach((d) => {
      const lx = G.colX(d.c), y0 = G.floorY(d.top) - (d.top < 0 ? 0 : T * 0.6), y1 = G.floorY(d.bottom);
      const o = place(lad, S.ladderWidth * 1.15, { by: 'width' }), nat = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).y;
      o.rotation.y = Math.PI / 2; o.scale.y *= (y1 - y0) / nat;
      o.position.set(lx, -y1, zb + T * 0.45); this.world.add(o);
    });
    // timber sets against the back wall where the 2D tunnel paintings had their posts; the deepest zone has none
    const timber = this.A.models.timber;
    m.levels.forEach((seg, l) => {
      const z = G.zone(l); if (z === 3 || !timber) return;
      const ladderXs = m.ladders.filter((d) => d.top === l || d.bottom === l).map((d) => G.colX(d.c));
      for (const px of MineGen.postsIn(S, z, seg.a * T + T * 0.5, (seg.b + 1) * T - T * 0.5)) {
        if (ladderXs.some((v) => Math.abs(v - px) < T)) continue;
        const o = place(timber, S.tunnelHeight * T + 2); o.rotation.y = Math.PI / 2;
        o.position.set(px, -G.floorY(l), zb + 6); this.world.add(o);
      }
    });
    // props lying about, placed by the block hash as in 2D
    const rnd = seededRandom(m.hash + '|props'), kinds = ['cart', 'barrel', 'crate', 'lantern'];
    m.levels.forEach((seg, l) => {
      const x = seg.a * T, w = (seg.b - seg.a + 1) * T, fy = G.floorY(l), cy = G.ceilY(l);
      const ladderXs = m.ladders.filter((d) => d.top === l || d.bottom === l).map((d) => G.colX(d.c));
      const nodesHere = m.nodes.filter((n) => n.l === l);
      const clear = (px) => ladderXs.every((v) => Math.abs(v - px) > T * 1.2) && nodesHere.every((n) => Math.abs(n.x - px) > T && Math.abs(n.standX - px) > T * 0.8);
      const nProps = S.propsPerLevel[0] + Math.floor(rnd() * (S.propsPerLevel[1] - S.propsPerLevel[0] + 1));
      for (let i = 0; i < nProps; i++) {
        const kind = kinds[Math.floor(rnd() * 4)], px = x + T + rnd() * (w - 2 * T), flip = rnd() < 0.5;
        if (!clear(px) || !this.A.models[kind]) continue;
        const o = place(this.A.models[kind], V.propHeight[kind]);
        if (kind === 'lantern') {   // hangs from the ceiling, lit
          o.position.set(px, -(cy + 2 + V.propHeight.lantern), zb + T * 0.6);
          const glow = this.glowSprite(0xffa040, T * 2.6, 0.55); glow.position.set(px, -(cy + V.propHeight.lantern * 0.55), zb + T * 0.8); this.world.add(glow);
        } else {
          o.position.set(px, -fy, zb + T * (kind === 'cart' ? 0.75 : 0.6));
          o.rotation.y = (kind === 'cart' ? Math.PI / 2 : 0) + (flip ? 0.4 : -0.3);
        }
        this.world.add(o);
      }
      // gaps (a pit in the floor) and rubble mounds; both need a jump
      for (const t of m.terrain.filter((q) => q.l === l)) {
        if (t.kind === 'gap') {
          const pit = new THREE.Mesh(new THREE.BoxGeometry(t.x1 - t.x0, S.pitDepth * T, D * 0.98), fogged(new THREE.MeshStandardMaterial({ color: 0x050302, roughness: 1 })));
          pit.position.set((t.x0 + t.x1) / 2, -(fy + S.pitDepth * T / 2) + 0.6, 0); pit.userData.own = true; this.world.add(pit);
          // so the hole reads in the dark: pale broken edges on both sides and a faint red glow far down
          const rim = fogged(new THREE.MeshStandardMaterial({ color: 0x8c7f72, roughness: 0.95, flatShading: true })), r3 = seededRandom(m.hash + '|pit' + t.x0);
          for (const x of [t.x0, t.x1]) for (let k = 0; k < 7; k++) {   // broken stones along both lips
            const st = new THREE.Mesh(new THREE.DodecahedronGeometry(1.4 + r3() * 1.2, 0), rim);
            st.position.set(x + (r3() - 0.5) * 3, -fy + 0.6, (k / 6 - 0.5) * D * 0.85); st.scale.set(1.3, 0.55, 1); st.rotation.set(r3() * 3, r3() * 3, r3() * 3);
            st.castShadow = st.receiveShadow = true; st.userData.own = true; this.world.add(st);
          }
          if (!this.pitTex) {   // black at the lips, a dim ember glow from far down in the middle
            const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
            const gr = x.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, '#6a1a06'); gr.addColorStop(0.55, '#260803'); gr.addColorStop(1, '#000000');
            x.fillStyle = gr; x.fillRect(0, 0, 64, 64); this.pitTex = new THREE.CanvasTexture(c); this.pitTex.colorSpace = THREE.SRGBColorSpace;
          }
          const glow = new THREE.Mesh(new THREE.PlaneGeometry(t.x1 - t.x0, D * 0.98), fogged(new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: this.pitTex, emissiveIntensity: 1 })));
          glow.rotation.x = -Math.PI / 2; glow.position.set((t.x0 + t.x1) / 2, -fy + 0.7, 0); glow.userData.own = true; this.world.add(glow);
        } else {
          const r2 = seededRandom(m.hash + '|rubble' + t.x0), mat = fogged(new THREE.MeshStandardMaterial({ color: 0x6f655b, roughness: 0.9, flatShading: true }));
          // a heap of rocks as tall as the mound that blocks him, across the whole depth of the tunnel, so it reads as a
          // barrier to jump over: bigger stones at the bottom and middle, smaller ones on top
          // drawn as the 2D game draws it: about twice the height that stops him, and 1.4 times as wide
          const w = (t.x1 - t.x0) * 1.4, cx = (t.x0 + t.x1) / 2, n = 30, top = t.h * 2.0;
          for (let k = 0; k < n; k++) {
            const u = (r2() - 0.5) * 2, z = (r2() - 0.5) * D * 0.9, peak = top * (1 - 0.6 * u * u);
            const r = Math.max(2.5, top * (0.2 + 0.14 * r2()) * (1 - 0.35 * Math.abs(u)));
            const st = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), mat);
            st.position.set(cx + u * w * 0.5, -(fy - Math.max(r * 0.55, peak - r * 0.7 - r2() * top * 0.3)), z);
            st.scale.set(1.25, 0.8, 1); st.rotation.set(r2() * 3, r2() * 3, r2() * 3);
            st.castShadow = st.receiveShadow = true; st.userData.own = true; this.world.add(st);
          }
        }
      }
      // the level number at the start of each level
      const label = this.textSprite('LEVEL ' + (l + 1), 11); label.position.set(x + 4, -(cy - 3), zf); label.center.set(0, 0); this.world.add(label);
      label.material.depthTest = false; label.renderOrder = 30; label.visible = false; (this.levelLabels = this.levelLabels || [])[l] = label;   // shown whole once he gets there, never half under the dark
    });
    // the headframe over the shaft, and the hatch lid when the hatch is shut
    const hx = G.colX(m.c0);
    if (this.A.models.headframe) { const hf = place(this.A.models.headframe, 190); hf.position.set(hx, 0, -T * 0.6); this.world.add(hf); }
    this.lid = new THREE.Mesh(new THREE.BoxGeometry(T * 1.4, 5, D * 0.9), fogged(new THREE.MeshStandardMaterial({ map: this.A.shaft[0], color: 0x9a7650, roughness: 0.9 })));
    this.lid.position.set(hx, 2.5, 0); this.lid.castShadow = true; this.lid.userData.own = true; this.world.add(this.lid);
    // the fog's memory of what you have seen
    const W = m.cols * T;
    const f = this.fog = { x0: -4 * T, y0: 0, cols: Math.ceil((W + 8 * T) / S.fogCell), rows: Math.ceil((G.floorY(last) + 4 * T) / S.fogCell) };
    f.seen = new Uint8Array(f.cols * f.rows);
    f.canvas = document.createElement('canvas'); f.canvas.width = f.cols; f.canvas.height = f.rows;
    f.ctx = f.canvas.getContext('2d'); f.img = f.ctx.createImageData(f.cols, f.rows);
    if (this.fogTex) this.fogTex.dispose();
    this.fogTex = new THREE.CanvasTexture(f.canvas); this.fogTex.magFilter = this.fogTex.minFilter = THREE.LinearFilter;
    fogU.fogMap.value = this.fogTex; fogU.fogBox.value.set(f.x0, f.y0, f.cols * S.fogCell, f.rows * S.fogCell);
  }

  glowSprite(color, size, alpha) {
    if (!this.glowTex) {
      const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128); this.glowTex = new THREE.CanvasTexture(c);
    }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: alpha }));
    s.scale.set(size, size, 1); return s;
  }
  textSprite(text, h) {
    const c = document.createElement('canvas'), g = c.getContext('2d'), fs = 64;
    g.font = `500 ${fs}px "Cormorant Garamond", Georgia, serif`; c.width = Math.ceil(g.measureText(text).width) + 24; c.height = fs + 24;
    g.font = `500 ${fs}px "Cormorant Garamond", Georgia, serif`; g.lineWidth = 12; g.strokeStyle = '#000'; g.fillStyle = '#ffd28a'; g.textBaseline = 'middle';
    g.strokeText(text, 12, c.height / 2); g.fillText(text, 12, c.height / 2);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
    s.scale.set(h * c.width / c.height, h, 1); s.renderOrder = 5; return s;
  }

  // ---------- the miner ----------
  buildMiner() {
    const mdl = this.A.models.miner;
    const g = this.minerRoot = new THREE.Group(); this.scene.add(g);
    const turn = new THREE.Group(); turn.rotation.y = Math.PI / 2; g.add(turn);   // Mixamo characters face +Z; the game's forward is +X
    const body = this.minerBody = SkeletonUtils.clone(mdl.scene); turn.add(body);
    body.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; fogged(m.material); m.frustumCulled = false; } });
    { body.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(body), k = S.minerHeight / (box.max.y - box.min.y);
      body.scale.setScalar(k); body.position.y = -box.min.y * k; }   // his height in game units, feet on the floor
    this.mixer = new THREE.AnimationMixer(body);
    this.acts = {};
    for (const clip of mdl.animations) { const a = this.mixer.clipAction(clip); a.play(); a.setEffectiveWeight(0); this.acts[clip.name] = a; }
    this.anim = null; this.setAnim('idle');
    const H = S.minerHeight;
    // the lantern on his belt: the one lamp
    // the lantern hangs by its handle from a hook on his belt, at his right hip: it follows his hips and swings a little
    const bone = (n) => body.getObjectByName('mixamorig' + n) || body.getObjectByName('mixamorig:' + n);
    this.hips = bone('Hips');
    this.lampPivot = new THREE.Group(); g.add(this.lampPivot); this.lampAng = 0; this.lampVel = 0; this.lastMx = null;
    if (this.A.models.lantern) {
      this.beltLamp = place(this.A.models.lantern, H * V.lampSize, { cast: false });
      this.beltLamp.position.y = -H * V.lampSize; this.lampPivot.add(this.beltLamp);
      this.lampMats = [];
      this.beltLamp.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); m.material.emissive = new THREE.Color(0xffd6a0); m.material.emissiveMap = m.material.map; m.material.needsUpdate = true; this.lampMats.push(m.material); } });
      // a small flame inside the glass
      this.flame = this.glowSprite(0xffe2b0, H * V.flameSize * 2, 0.9); this.flame.position.set(0, -H * V.lampSize * 0.58, 0); this.lampPivot.add(this.flame);
    }
    this.lampGlow = this.glowSprite(0xffb070, S.lightRadius * T * 1.2, V.lampHalo); this.scene.add(this.lampGlow);
    // the pick, held in his right hand: each frame its handle runs along his forearm, so it follows the swing
    const pick = this.pick = new THREE.Group(); pick.matrixAutoUpdate = false; g.add(pick);
    if (this.A.models.pick) {   // the generated pickaxe, turned so its handle runs along +Y from the grip and its head points along +X
      const p = this.A.models.pick.scene.clone(true); p.scale.setScalar(H * V.pickLength);
      p.rotation.x = Math.PI / 2;   // exported from Blender with the handle along its Y, which glTF turns into -Z
      p.traverse((m) => { if (m.isMesh) fogged(m.material); });
      pick.add(p);
    }
    pick.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    this.bones = { hand: bone('RightHand'), elbow: bone('RightForeArm'), chest: bone('Spine2'), lsh: bone('LeftShoulder'), rsh: bone('RightShoulder') };
    for (const k in this.bags) this.bags[k].rotation.order = 'YXZ';
    this.lampPivot.rotation.order = 'YXZ';
    if (this.acts.swing) { this.acts.swing.setLoop(THREE.LoopOnce); this.acts.swing.clampWhenFinished = true; }
    if (this.acts.jump) { this.acts.jump.setLoop(THREE.LoopOnce); this.acts.jump.clampWhenFinished = true; }
    // the bag on his back, from the 2D art: empty (flat, no glow), half-full and full; one is shown at a time
    this.bags = {};
    for (const [k, h] of [['empty', 0.46], ['half', 0.5], ['full', 0.56]]) {
      const holder = new THREE.Group(), o = place(this.A.models['bag_' + k], H * h, { cloneMat: true });
      o.rotation.y = -Math.PI / 2;   // its front faces backward
      o.position.y = -H * h; holder.userData.h = h;   // the holder is the strap's top, at his shoulder
      holder.add(o); holder.visible = false; g.add(holder);
      holder.userData.mats = []; o.traverse((m) => m.isMesh && holder.userData.mats.push(m.material));
      if (k !== 'empty') holder.userData.mats.forEach((mt) => { mt.emissive = new THREE.Color(0xffa040); mt.emissiveMap = mt.map; mt.needsUpdate = true; });
      this.bags[k] = holder;
    }
    this.bagGlow = this.glowSprite(0xffb547, 30, 0); g.add(this.bagGlow);
  }
  setAnim(name, fade = 0.28) {
    if (this.anim === name || !this.acts[name]) return;
    const next = this.acts[name], prev = this.anim && this.acts[this.anim];
    next.reset(); next.setEffectiveWeight(1); next.timeScale = 1; next.play();
    if (prev) prev.crossFadeTo(next, fade, false);
    this.anim = name;
  }

  buildFx() {   // sparks: a small pool of glowing points with gravity
    const n = 160, g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    this.sparks = { pts: new THREE.Points(g, new THREE.PointsMaterial({ size: 2.6, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })), p: [], n, next: 0 };
    for (let i = 0; i < n; i++) this.sparks.p.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, life: 0, max: 1, c: new THREE.Color() });
    this.sparks.pts.frustumCulled = false; this.scene.add(this.sparks.pts);
  }
  burst(count, x, y, z, tint) {
    const S2 = this.sparks, cols = [0xffe0a0, 0xffa030, 0xffffff];
    for (let i = 0; i < count; i++) {
      const p = S2.p[S2.next++ % S2.n], a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 140;
      Object.assign(p, { x, y: -y, z, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.16 + Math.random() * 0.26 }); p.max = p.life;
      p.c.set(tint || cols[i % 3]);
    }
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
      let lostBag = false;
      if (this.below()) {   // brought up, but not paid: going offline must never be a free way out
        lostBag = this.bag.length > 0;
        this.bag = []; this.inShift = false; this.lampLit = false; this.oilLeft = 0; this.drag = null; this.toSurface();
      }
      this.openMine(b, true);
      this.say('Feed back. A block came while it was down; you were brought up' + (lostBag ? ', and your bag went back to the mine.' : '.'), 6);
      return;
    }
    Sound.knock(); this.shake = 0.45;
    if (this.below()) this.caught();
    this.hatch = 'shut'; this.mining = null;
    this.shutTimer = setTimeout(() => this.openMine(b, true), (S.hatchShutSeconds * 1000) / this.speed);
  }
  openMine(b, ring) {
    this.nodes = [];
    this.mine = MineGen.generate(b.hash, S, RULES, 1);
    MineGen.layoutTerrain(this.mine); MineGen.layoutNodes(this.mine, this.eco.budget());
    this.mine.spawnRng = seededRandom(b.hash + '|spawn'); this.mine.spawnT = 0;
    this.lampLit = false; this.oilLeft = 0;   // a new shift: a new lamp to light
    this.hatch = 'open';
    this.buildMine();
    this.mine.nodes.forEach((n) => this.showNode(n));
    if (!this.below()) this.toSurface();
    if (ring) Sound.bell();
    this.say('Block ' + b.height.toLocaleString() + ' · the hatch is open', 4);
  }

  // deposits: amber (the satoshis: the glowing ore), coal, iron and silver as piles on the floor against the back wall,
  // and on level 15 the Vault, seen only inside a miner's own lamplight
  showNode(n) {
    const M = this.A.models, zb = -V.depth / 2;
    let o;
    if (n.kind === 'vault') o = this.vaultObject(n);
    else {
      const model = { amber: M.dep_bitcoin, coal: M.dep_iron, iron: M.dep_iron, silver: M.dep_silver }[n.kind];
      o = place(model, n.h * V.pileScale * (n.kind === 'coal' ? 0.8 : 1), { cloneMat: true });
      o.rotation.y = (n.crack / Math.PI - 0.5) * 0.5;
      o.position.set(n.x, -(n.base - S.pileSink), zb + V.depth * 0.3);
    }
    n.obj = o; n.mats = []; o.traverse((m) => m.isMesh && n.mats.push(m.material));
    n.z = o.position.z + V.depth * 0.2;
    n.baseScale = o.scale.x;
    if (n.kind === 'amber') {   // the satoshis: its cracks glow and pulse; outside the lamplight only a faint glimmer shows
      n.mats.forEach((mt) => { mt.emissive = new THREE.Color(n.rich ? 0xfff0c0 : 0xffb060); mt.emissiveMap = mt.map; mt.needsUpdate = true; });
      n.glim = this.glowSprite(n.rich ? 0xfff0b0 : 0xff7a20, n.h * 1.4, 0); n.glim.position.set(n.x, -n.y, n.z + 4); n.glim.renderOrder = 10; n.glim.material.depthTest = false;
      this.world.add(n.glim);
    } else if (n.kind === 'silver') {   // a faint cold shimmer where the lamp shows it
      n.glim = this.glowSprite(0xcfe0ff, n.h * 1.6, 0); n.glim.position.set(n.x, -n.y, n.z + 4); this.world.add(n.glim);
      n.mats.forEach((mt) => { mt.metalness = 0.5; mt.roughness = 0.35; });
    } else if (n.kind === 'coal') {   // coal: the iron heap's shape, black and a little glossy
      n.mats.forEach((mt) => { mt.color = new THREE.Color(0x1a1816); mt.roughness = 0.45; mt.metalness = 0.15; mt.map = null; mt.needsUpdate = true; });
    }
    this.world.add(o); this.nodes.push(n);
  }
  // the Vault piece: a slab of dark amber the size of a loaf of bread, glowing from inside, old lamps fused into it
  vaultObject(n) {
    const g = new THREE.Group(), H = S.minerHeight, zb = -V.depth / 2;
    // dark amber with brighter veins, lit from inside: a canvas texture of cracks for the glow
    if (!this.amberTex) {
      const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), r = seededRandom('amber-veins');
      x.fillStyle = '#140600'; x.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 70; i++) { x.strokeStyle = `rgba(255,${120 + r() * 80 | 0},20,${0.25 + r() * 0.6})`; x.lineWidth = 0.6 + r() * 2.2; x.beginPath(); let px = r() * 256, py = r() * 256; x.moveTo(px, py); for (let k = 0; k < 6; k++) { px += (r() - 0.5) * 60; py += (r() - 0.5) * 60; x.lineTo(px, py); } x.stroke(); }
      const gr = x.createRadialGradient(128, 128, 10, 128, 128, 130); gr.addColorStop(0, 'rgba(255,150,40,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
      this.amberTex = new THREE.CanvasTexture(c); this.amberTex.colorSpace = THREE.SRGBColorSpace;
    }
    const slab = new THREE.Mesh(new THREE.BoxGeometry(H * 0.34, H * 0.16, H * 0.2, 4, 3, 3),
      fogged(new THREE.MeshPhysicalMaterial({ color: 0x3a1804, roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.15,
        emissive: new THREE.Color(0xffffff), emissiveMap: this.amberTex, emissiveIntensity: 1.1 })));
    const pos = slab.geometry.attributes.position, rng = seededRandom('vault-slab');
    for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) * (0.9 + rng() * 0.2), pos.getY(i) * (0.82 + rng() * 0.36), pos.getZ(i) * (0.88 + rng() * 0.24));
    slab.geometry.computeVertexNormals(); slab.position.y = H * 0.08; slab.castShadow = true; g.add(slab);
    if (this.A.models.lantern) for (const [x, r] of [[-0.09, 0.5], [0.07, -0.7], [0.12, 1.9]]) {   // the lamps of the fallen, half sunk in it
      const l = place(this.A.models.lantern, H * 0.13, { cast: false }); l.position.set(x * H, H * 0.1, (r > 0 ? 0.08 : 0.06) * H); l.rotation.set(0.9 * Math.sign(r), r, 0.6); g.add(l);
    }
    const inner = new THREE.PointLight(0xff8a30, 6, H * 1.2, 1.6); inner.position.y = H * 0.12; g.add(inner);
    g.position.set(n.x, -(n.base - S.pileSink), zb + V.depth * 0.35);
    g.userData.inner = inner;
    return g;
  }
  removeNode(n) {
    this.world.remove(n.obj); n.glim && this.world.remove(n.glim);
    this.nodes = this.nodes.filter((x) => x !== n);
    this.mine.nodes = this.mine.nodes.filter((x) => x !== n);
  }
  spawn(dt) {   // shallow ore regrows slowly during the shift, drawing on the block's budget
    const m = this.mine; if (this.hatch !== 'open' || !m || this.net) return;   // online the server regrows the ore
    m.spawnT += dt;
    while (m.spawnT >= RULES.regrowEverySeconds) {
      m.spawnT -= RULES.regrowEverySeconds;
      const n = MineGen.regrow(m, m.spawnRng);
      if (n) this.showNode(n);
    }
  }

  // ---------- where the miner is (as in 2D) ----------
  toSurface() {
    const m = this.mine;
    this.mode = 'ground'; this.lvl = -1; this.ladderK = null; this.falling = null; this.stun = 0; this.pitReturn = null;
    this.mx = m.G.colX(m.c0) - S.waitOffset * T; this.my = 0; this.vx = this.vy = 0; this.mining = null;
  }
  below() { return this.my > 1; }
  floorY(l) { return this.mine.G.floorY(l); }
  here() {
    if (this.mode === 'ladder') return { kind: 'ladder', k: this.ladderK, y: this.my };
    const l = this.falling ? this.falling.toLvl : this.lvl, [x0, x1] = MineGen.span(this.mine, l);
    return { kind: 'level', l, x: clamp(this.mx, x0, x1) };
  }
  fill() { return Math.min(1, this.bagWeight() / RULES.bagCapacity); }
  climbFactor() { return RULES.climbFactor(this.bagWeight(), S); }   // only climbing up is slowed by the bag
  speeds() { return { walk: S.runSpeed, up: S.climbSpeed * this.climbFactor(), down: S.slideSpeed }; }
  hatchLoc() { return { kind: 'level', l: -1, x: this.mine.G.colX(this.mine.c0) }; }
  lamp() {   // the belt lantern's place, in game units
    const p = new THREE.Vector3();
    if (this.beltLamp) this.beltLamp.getWorldPosition(p); else p.set(this.mx, -(this.my - S.minerHeight * 0.5), 0);
    return { x: p.x, y: -p.y - S.minerHeight * V.lampSize * 0.4, z: p.z };   // the glass, above the lantern's base
  }
  lampOn() { return true; }   // the basic lamp never goes out
  lightRadius() { return RULES.basicLight * (1 + RULES.oilWidenPerMeasure * this.oilLeft); }   // tiles; extra oil widens it

  // ---------- direct control (as in 2D) ----------
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
  blockRubble(l, x0, x1, feetY) {
    for (const t of this.mine.terrain) {
      if (t.l !== l || t.kind !== 'rubble' || feetY <= this.floorY(l) - t.h) continue;
      if (x0 <= t.x0 && x1 > t.x0) return t.x0 - 0.01;
      if (x0 >= t.x1 && x1 < t.x1) return t.x1 + 0.01;
    }
    return x1;
  }
  startFall(kind, k, t) {
    this.mode = 'air'; this.vx = 0; this.vy = Math.max(this.vy, 0); this.mining = null;
    this.falling = { toLvl: this.lvl, toY: this.floorY(this.lvl) + S.pitDepth * T, pit: true, back: this.facing > 0 ? t.x0 - T * 0.35 : t.x1 + T * 0.35 };
  }
  landFall() {
    const f = this.falling; this.falling = null;
    this.mode = 'ground'; this.lvl = f.toLvl; this.my = f.toY; this.vx = this.vy = 0;
    this.stun = S.fallStunSeconds; this.pitReturn = f.pit ? f.back : null;
    this.shake = 0.18; Sound.tick();
    const spill = Math.round(this.bag.length * S.fallSpill);
    for (let i = 0; i < spill; i++) this.bag.splice(Math.floor(Math.random() * this.bag.length), 1);
    if (spill) this.burst(10 * spill, this.mx, this.my - 10, 0);
    this.say('You fell. Stunned' + (spill ? ', and ' + spill + ' ore spilled from the bag.' : '.'), 3);
  }
  stepOff(d, atTop, dir) {
    const l = atTop ? d.top : d.bottom;
    this.mode = 'ground'; this.lvl = l; this.my = this.floorY(l); this.ladderK = null;
    if (dir) this.facing = dir;
  }
  target() {
    if (this.mode !== 'ground' || this.stun > 0 || this.mining || !this.mine) return null;
    const m = this.mine;
    let best = -1, bd = Infinity;
    m.ladders.forEach((d, k) => {
      const dx = Math.abs(m.G.colX(d.c) - this.mx);
      if (!(d.top === this.lvl || d.bottom === this.lvl) || dx > S.grabRange * T) return;
      const goesDown = d.top === this.lvl, wantDown = !this.keys.up;
      const score = dx - (goesDown === wantDown ? 0.5 * T : 0);   // two ladders at one spot: take the one going your way
      if (score < bd) { best = k; bd = score; }
    });
    if (best >= 0) return { kind: 'ladder', k: best };
    const near = this.nodes.filter((n) => n.l === this.lvl && Math.abs(n.x - this.mx) <= (S.oreStandGap + S.mineRange) * T)
      .sort((a, b) => Math.abs(a.x - this.mx) - Math.abs(b.x - this.mx))[0];
    return near && this.hatch === 'open' ? { kind: 'node', n: near } : null;
  }
  action() {
    const tg = this.target();
    if (!tg) return;
    const near = tg.kind === 'node' ? tg.n : null;
    if (near) {
      if (this.bagWeight() + near.weight > RULES.bagCapacity + 1e-9) { this.say('Your bag is full. Drop ore or go up.', 2.5); return; }
      if (Math.abs(near.x - this.mx) < S.oreStandGap * T * 0.8) this.mx = near.standX;
      this.mining = near; this.facing = near.x < this.mx ? -1 : 1;
      if (this.net) this.net.send({ t: 'pick', id: near.id });
      this.say('Drag along the crack to swing', 2);
      return;
    }
    const m = this.mine, best = tg.k;
    if (m.ladders[best].top === -1 && this.lvl === -1 && this.hatch !== 'open') { this.say('The hatch is shut.', 2); return; }
    if (this.net && m.ladders[best].top === -1 && this.lvl === -1 && !this.lampLit) {   // online: the server lights the lamp and lets him in
      if (this.purse.lamps < 1) { this.say(this.purse.hasKit ? 'You need a lamp to go down. Buy one (300).' : 'Buy the starting kit (1,000) to go down.', 3); this.openShop(); return; }
      this.net.send({ t: 'enter' }); return;
    }
    if (m.ladders[best].top === -1 && this.lvl === -1 && !this.lampLit) {   // one lamp is one shift: light one to go down
      this.freshMoney();
      if (this.purse.lamps < 1) { this.say(this.purse.hasKit ? 'You need a lamp to go down. Buy one (300).' : 'Buy the starting kit (1,000) to go down.', 3); this.openShop(); return; }
      this.purse.lamps -= 1; this.lampLit = true; this.saveMoney();
      this.say('Lamp lit for this shift' + (this.oilLeft ? ' · ' + this.oilLeft + ' measure' + (this.oilLeft > 1 ? 's' : '') + ' of oil' : ''), 2.5);
    }
    this.mode = 'ladder'; this.ladderK = best; this.mx = m.G.colX(m.ladders[best].c); this.mining = null;
  }
  physics(dt) {
    const press = this.press; this.press = { jump: false, action: false };
    this.moving = false; this.climbV = 0;
    if (this.stun > 0) {
      this.stun -= dt;
      if (this.stun <= 0) { this.stun = 0; if (this.pitReturn != null) { this.mx = this.pitReturn; this.my = this.floorY(this.lvl); this.pitReturn = null; } }
      return;
    }
    const cf = this.climbFactor(), onLadder = this.mode === 'ladder';
    const left = this.keys.left || (!onLadder && this.pad.left), right = this.keys.right || (!onLadder && this.pad.right);
    const up = this.keys.up || (onLadder && this.pad.left), down = this.keys.down || (onLadder && this.pad.right);
    const dir = (right ? 1 : 0) - (left ? 1 : 0);
    if (press.action) this.action();
    if (this.mode === 'ground') {
      const fy = this.floorY(this.lvl), [x0, x1] = MineGen.span(this.mine, this.lvl);
      if (dir && this.mining) this.mining = null;
      if (press.jump && !this.mining) {
        this.mode = 'air'; this.vy = -Math.sqrt(2 * S.gravity * S.jumpHeight); this.airT = 0;
        this.vx = dir * S.runSpeed; if (dir) this.facing = dir;
        return;
      }
      if (dir && !this.mining) {
        this.facing = dir;
        const want = this.mx + dir * S.runSpeed * dt, nx = clamp(this.blockRubble(this.lvl, this.mx, want, fy), x0, x1);
        if (Math.abs(nx - want) > 1e-6 && nx === this.blockRubble(this.lvl, this.mx, want, fy) && performance.now() > (this.rubbleHintAt || 0)) {
          this.say('Rubble in the way. Jump over it.', 2); this.rubbleHintAt = performance.now() + 4000;
        }
        this.moving = Math.abs(nx - this.mx) > 1e-3; this.walkDist += Math.abs(nx - this.mx); this.mx = nx;
      }
      const gap = this.terrainAt(this.lvl, this.mx, 'gap');
      if (gap) this.startFall('gap', 0, gap);
      else if (this.moving && !(this.gapHintAt > performance.now())) {
        const ahead = this.terrainAt(this.lvl, this.mx + this.facing * 1.6 * T, 'gap');
        if (ahead) { this.say('A hole in the floor. Jump over it.', 2); this.gapHintAt = performance.now() + 4000; }
      }
    } else if (this.mode === 'ladder') {
      const d = this.mine.ladders[this.ladderK], y0 = this.floorY(d.top), y1 = this.floorY(d.bottom);
      const v = up ? -S.climbSpeed * cf : down ? S.slideSpeed : 0;
      this.my += v * dt; this.climbDist += Math.abs(v * dt); this.climbV = v;
      const onward = (lvl, down) => this.mine.ladders.findIndex((e) => e !== d && (down ? e.top : e.bottom) === lvl && Math.abs(e.c - d.c) < 0.5);
      if (v < 0 && this.my <= y0) { const k = onward(d.top, false); if (k >= 0 && !dir) { this.ladderK = k; this.my = y0 - 0.01; } else this.stepOff(d, true, dir); }
      else if (v > 0 && this.my >= y1) { const k = onward(d.bottom, true); if (k >= 0 && !dir) { this.ladderK = k; this.my = y1 + 0.01; } else this.stepOff(d, false, dir); }
      else this.my = clamp(this.my, y0, y1);
      if (this.mode === 'ladder' && dir && (this.my === y0 || this.my === y1)) this.stepOff(d, this.my === y0, dir);
    } else {
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

  // ---------- input: dragging along the crack, on the plane of the node's face ----------
  worldAt(e, z) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, this.camera);
    const p = new THREE.Vector3(); ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -z), p);
    return { x: p.x, y: -p.y };
  }
  down(e) {
    Sound.unlock();
    if (this.overlay || this.paused || !this.mine || !this.mining) return;
    const w = this.worldAt(e, this.mining.z);
    if (Math.hypot(w.x - this.mining.x, w.y - this.mining.y) <= this.mining.r * S.nodeTouchSlop * 1.6) {
      this.drag = { id: e.pointerId, node: this.mining, x0: w.x, y0: w.y, x: w.x, y: w.y, len: 0 };
    }
  }
  move(e) {
    const d = this.drag; if (!d || d.id !== e.pointerId) return;
    const w = this.worldAt(e, d.node.z);
    d.len += Math.hypot(w.x - d.x, w.y - d.y); d.x = w.x; d.y = w.y;
  }
  up(e) {
    const d = this.drag; if (!d || d.id !== e.pointerId) return;
    this.drag = null;
    const dx = d.x - d.x0, dy = d.y - d.y0, disp = Math.hypot(dx, dy);
    if (disp < S.swingMinLength || this.mining !== d.node || !this.nodes.includes(d.node)) return;
    this.swing(d.node, dx, dy, disp, d.len);
  }
  swing(n, dx, dy, disp, len) {
    const align = Math.abs(Math.cos(Math.atan2(dy, dx) - n.crack));
    const straight = disp / Math.max(disp, len);
    const t = clamp((align * straight - S.sloppyAt) / (S.cleanAt - S.sloppyAt), 0, 1);
    const swingsNeeded = (S.sloppySwings - t * (S.sloppySwings - S.cleanSwings)) * (n.hardness || 1);   // deeper rock is harder
    if (this.net) {   // online: the server counts the strokes and breaks the node
      this.net.send({ t: 'stroke', id: n.id }); n.flash = 0.12; this.swingT = V.swingSeconds; this.swingStart = true; Sound.tick();
      this.burst(t >= 1 ? 16 : 7, n.x, n.y, n.z); return;
    }
    n.hp -= 1 / swingsNeeded; n.flash = 0.12; this.swingT = V.swingSeconds; this.swingStart = true;
    Sound.tick();
    this.burst(t >= 1 ? 16 : 7, n.x, n.y, n.z);
    this.float(n.x, n.y - n.r - 10, n.z, t >= 1 ? 'clean' : t > 0.5 ? 'rough' : 'sloppy');
    if (n.hp <= 1e-9) {
      this.burst(24, n.x, n.y, n.z);
      this.removeNode(n); this.mining = null;
      if (this.bagWeight() + n.weight > RULES.bagCapacity + 1e-9) { this.say('No room in the bag. The ore fell.', 2.5); if (n.kind === 'vault') this.returnVault(); }
      else {
        this.bag.push({ kind: n.kind, sats: n.value, weight: n.weight, l: n.l, dropped: !!n.dropped });
        if (n.kind === 'amber') { this.float(n.x, n.y - n.r - 4, n.z, '+' + fmt(n.value) + ' sats'); this.say((n.rich ? 'A rich node! ' : '') + '+' + fmt(n.value) + ' sats carried. Kept only past the hatch.', 2.5); }
        else if (n.kind === 'vault') this.say('The Vault piece! Worth a tenth of the Vault (now ' + fmt(this.eco.vaultPieceValue()) + ') if you carry it out. Weight 10.', 5);
        else this.say('+1 ' + n.kind + ' in the bag (weight ' + n.weight + ')', 2);
      }
    }
  }
  screen(x, y, z) {
    const v = new THREE.Vector3(x, -y, z).project(this.camera);
    return { x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight };
  }
  float(x, y, z, txt) {
    const p = this.screen(x, y, z), d = document.createElement('div');
    d.className = 'float'; d.textContent = txt; d.style.left = p.x + 'px'; d.style.top = p.y + 'px'; document.body.appendChild(d);
    requestAnimationFrame(() => { d.style.transform = 'translate(-50%, -150%)'; d.style.opacity = '0'; });
    setTimeout(() => d.remove(), 800);
  }

  caught() {   // the knock: the lamp and the bag are lost for good
    this.freshMoney();
    const amber = this.bagSats();
    this.eco.caught(amber); this.saveMoney();
    const hadVault = this.bag.some((p) => p.kind === 'vault');
    this.bag = []; this.inShift = false; this.lampLit = false; this.oilLeft = 0; this.drag = null;
    this.toSurface();
    records.get().timesCaught++; records.save();
    this.showOverlay('The deep is closed', 'The knock came before you reached the hatch. Your lamp and your bag (' + fmt(amber) + ' sats carried) are lost' + (hadVault ? ', and the Vault piece went back to the Vault' : '') + '.');
  }
  bank() {   // past the hatch, the bag is his: the miner keeps 90% of the amber, the studio 10%
    this.freshMoney();
    const sats = this.bagSats(), mins = this.bagMinerals(), r = records.get(), vaultPiece = this.bag.some((p) => p.kind === 'vault');
    const pieceValue = vaultPiece ? this.eco.vaultPieceValue() : 0;
    const kept = this.inShift ? this.eco.carriedOut(sats, pieceValue) : 0;
    if (this.inShift) {
      this.purse.points += kept;
      r.totalPoints += kept; r.minerals = r.minerals || {};
      for (const k in mins) r.minerals[k] = (r.minerals[k] || 0) + mins[k];
      if (vaultPiece) r.vaultPieces = (r.vaultPieces || 0) + 1;
      r.survived = (r.survived || 0) + 1;
      records.save(); this.saveMoney();
    }
    this.bag = []; this.inShift = false;
    const m = mineralText(mins);
    if (kept || m) {
      this.say((vaultPiece ? 'The Vault piece is yours! ' : '') + 'Kept ' + [kept ? fmt(kept) + ' sats' : '', m].filter(Boolean).join(' · ') + (kept ? ' (the Order takes a tenth)' : ''), 4);
      const plus = [kept ? '+' + fmt(kept) + ' sats' : '', ...Object.entries(mins).map(([k, v]) => '+' + v + ' ' + k)].filter(Boolean).join(' · ');
      this.float(this.mine.G.colX(this.mine.c0), -S.minerHeight * 1.4, 0, plus);
      const v = $('vaultCell'); v.classList.remove('flash'); void v.offsetWidth; v.classList.add('flash');
    }
  }
  // drop the last piece: it stays in the tunnel for anyone; dropped amber is worth half, the other half goes to the Vault.
  // The Vault piece is never left lying: dropped, it goes back to the Vault.
  drop() {
    if (this.net) { if (this.bag.length) { const p = this.bag.pop(); Sound.tick(); this.net.send({ t: 'drop' }); this.say(p.kind === 'vault' ? 'The Vault piece went back to the Vault.' : 'Dropped ' + (p.kind === 'amber' ? fmt(p.sats) + ' sats (worth half to whoever picks it up)' : '1 ' + p.kind), 2.5); } return; }
    const p = this.bag.pop(); if (!p) return;
    this.freshMoney();
    Sound.tick();
    if (p.kind === 'vault') { this.returnVault(); this.say('The Vault piece went back to the Vault.', 2.5); return; }
    if (!this.below() || this.mode !== 'ground') { this.say('Dropped ' + (p.kind === 'amber' ? fmt(p.sats) + ' sats' : '1 ' + p.kind) + ' down the shaft.', 1.5); if (p.kind === 'amber') this.eco.dropped(p.sats); this.saveMoney(); return; }
    const value = p.kind === 'amber' && !p.dropped ? this.eco.dropped(p.sats) : p.sats;
    const n = MineGen.makeNode(this.mine, Math.random, this.lvl, p.kind, value, { within: { a: Math.floor(this.mx / T) - 1, b: Math.floor(this.mx / T) + 1 } });
    if (n) { n.dropped = true; this.showNode(n); }
    this.saveMoney();
    this.say('Dropped ' + (p.kind === 'amber' ? fmt(p.sats) + ' sats (now worth ' + fmt(value) + ' to whoever picks it up)' : '1 ' + p.kind), 2.5);
  }
  returnVault() {   // the piece is back where it lay, at the end of its side tunnel on level 15
    const m = this.mine, v = m.vault; if (!v || this.nodes.includes(v)) return;
    v.hp = 1; m.nodes.push(v); this.showNode(v);
  }
  freshMoney() {   // another tab may have spent or earned since: always start from what is stored
    if (this.net) return;   // online, the server holds the purse
    this.eco = Economy(RULES, loadJSON(ECO_KEY)); this.purse = Purse(RULES, loadJSON(PURSE_KEY));
  }
  saveMoney() { if (this.net) return; saveJSON(ECO_KEY, this.eco.toJSON()); saveJSON(PURSE_KEY, this.purse.toJSON()); }
  bagWeight() { return this.bag.reduce((a, b) => a + b.weight, 0); }
  bagSats() { return this.bag.reduce((a, b) => a + b.sats, 0); }
  bagMinerals() { const c = {}; for (const b of this.bag) if (b.kind !== 'amber' && b.kind !== 'vault') c[b.kind] = (c[b.kind] || 0) + 1; return c; }

  // ---------- loop ----------
  frame(now) {
    if (!(now > 0)) now = performance.now();
    const real = clamp(now - this.prev, 0, 100) / 1000, dt = real * this.speed; this.prev = Math.max(this.prev, now);   // never a step back in time
    this.clock += dt;
    if (this.mine && !this.paused && !this.overlay) {
      for (let left = dt; left > 1e-6;) { const h = Math.min(left, S.maxStep); left -= h; this.step(h); }
    }
    for (const n of this.nodes) n.flash = Math.max(0, (n.flash || 0) - dt);
    if (this.mine) this.draw(real, dt);
    if (this.net && this.mine) this.net.frame(real);
    if (this.levelLabels && this.lvl >= 0 && this.levelLabels[this.lvl]) this.levelLabels[this.lvl].visible = true;
    this.hud();
    this.renderer.render(this.scene, this.camera);
  }
  step(dt) {
    this.spawn(dt);
    const wasBelow = this.below();
    this.physics(dt);
    const below = this.below();
    if (below && !wasBelow && !this.inShift) { this.inShift = true; records.get().shifts++; records.save(); }
    if (!below && wasBelow && !this.net) this.bank();   // online the server banks the bag when he is past the hatch
    const h = this.here();
    if (this.mode === 'ground' && h.l >= 0 && h.l + 1 > records.get().deepestLevel) { records.get().deepestLevel = h.l + 1; records.save(); }
    if (below && this.oilLeft > 0) {
      this.oilLeft = Math.max(0, this.oilLeft - dt / RULES.oilSecondsPerMeasure);
      if (this.oilLeft === 0) this.say('Your extra oil is spent. The lamp burns on, its circle small again.', 3);
    }
    if (this.mining && !this.nodes.includes(this.mining)) this.mining = null;
  }

  draw(real, dt) {
    const lit = this.lampOn(), H = S.minerHeight, zb = -V.depth / 2;
    // the miner: walk, climb, swing or stand; turned a little toward you so you see his face
    const g = this.minerRoot;
    const z = this.mode === 'ladder' ? zb + T * 0.45 + H * 0.16 : this.mining ? zb + V.depth * 0.62 : 0;
    g.position.set(this.mx, -this.my, THREE.MathUtils.lerp(g.position.z, z, Math.min(1, real * 10)));
    let yaw = this.facing > 0 ? -0.45 : Math.PI + 0.45;
    if (this.mode === 'ladder') yaw = -Math.PI / 2;   // facing you: Mixamo's ladder clip itself turns him to face the ladder
    if (this.mining) yaw = this.facing > 0 ? -0.15 : Math.PI + 0.15;
    g.rotation.y += (((yaw - g.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, real * V.turnRate);
    g.rotation.z = this.stun > 0 ? Math.sin(this.clock * 7) * 0.1 : 0;
    this.swingT = Math.max(0, this.swingT - dt);
    const sp = this.speeds();
    const dur = (k) => this.acts[k] ? this.acts[k].getClip().duration : 1;
    if (this.mining || this.swingT > 0) {   // a swing plays the whole strike once; between swings he stands ready
      this.setAnim('swing', 0.15);
      const a = this.acts.swing;
      if (this.swingStart) { a.reset(); a.play(); this.swingStart = false; }
      a.timeScale = this.swingT > 0 ? dur('swing') / V.swingSeconds : 0;
      if (!this.swingT) a.time = 0;
    }
    else if (this.mode === 'ladder') {   // climbing up plays the climb; sliding down plays it backward, faster; still = paused
      this.setAnim('climb', 0.2);
      this.acts.climb.timeScale = clamp(-this.climbV * dur('climb') / V.climbStride, -2.2, 2.2);
    }
    else if (this.mode === 'air' && !this.falling) {   // rising: take-off to peak; falling: peak to touch-down, in step with his flight
      this.airT = (this.airT || 0) + dt; this.landT = V.landSeconds;
      const rise = Math.sqrt(2 * S.jumpHeight / S.gravity), J = V.jumpTimes, u = this.airT / rise;
      this.setAnim('jump', 0.08);
      this.acts.jump.timeScale = 0;
      this.acts.jump.time = u < 1 ? J[0] + (J[1] - J[0]) * u : J[1] + (J[2] - J[1]) * Math.min(1, u - 1);
    }
    else if (this.anim === 'jump' && this.landT > 0 && !this.moving) {   // the landing crouch, briefly
      this.landT -= dt;
      this.acts.jump.time = V.jumpTimes[2] + (V.jumpTimes[3] - V.jumpTimes[2]) * (1 - Math.max(0, this.landT) / V.landSeconds);
      if (this.landT <= 0) this.setAnim('idle', 0.2);
    }
    else if (this.moving) { this.setAnim('walk', 0.25); this.acts.walk.timeScale = sp.walk * dur('walk') / V.walkStride; }
    else this.setAnim('idle');
    this.mixer.update(real * Math.max(1, this.speed));
    // the skeleton as this frame's animation left it, for the pick, the bag and the lantern hook
    g.updateMatrixWorld(true);
    const at = (bone) => { const p = new THREE.Vector3(); bone.getWorldPosition(p); return g.worldToLocal(p); };
    // which way his body really faces (a clip can turn him, as the ladder climb does): from his shoulders
    const up = new THREE.Vector3(0, 1, 0), face = new THREE.Vector3(1, 0, 0);
    if (this.bones.lsh && this.bones.rsh) { face.subVectors(at(this.bones.lsh), at(this.bones.rsh)).cross(up); face.y = 0; if (face.lengthSq() > 1e-6) face.normalize(); else face.set(1, 0, 0); }
    const right = new THREE.Vector3().crossVectors(face, up), bodyYaw = Math.atan2(-face.z, face.x);
    if (this.pick && this.bones.hand && this.bones.elbow) {
      this.pick.visible = true;   // he always carries it: in his hand, or across his back on a ladder
      // held in his right fist: the handle runs through the fist (the hand bone's -Z in Mixamo's rig), the grip in the
      // middle of the fist (a little along his fingers, the bone's +Y)
      const hand = at(this.bones.hand), hq = new THREE.Quaternion(), rq = new THREE.Quaternion();
      this.bones.hand.getWorldQuaternion(hq); g.getWorldQuaternion(rq); hq.premultiply(rq.invert());
      const y = new THREE.Vector3(0, 0, -1).applyQuaternion(hq), fingers = new THREE.Vector3(0, 1, 0).applyQuaternion(hq);
      const x = new THREE.Vector3().crossVectors(right, y); if (x.lengthSq() < 1e-4) x.copy(fingers); x.normalize();
      const z = new THREE.Vector3().crossVectors(x, y);
      const grip = hand.clone().addScaledVector(fingers, H * 0.035);
      const swingM = new THREE.Matrix4().makeBasis(x, y, z);
      // carrying: hanging from his hand, the head down and a little forward, the blade pointing the way he faces
      const cy = up.clone().multiplyScalar(-0.93).addScaledVector(face, 0.3).normalize();
      const cx = face.clone().addScaledVector(cy, -face.dot(cy)).normalize(), cz = new THREE.Vector3().crossVectors(cx, cy);
      const carryM = new THREE.Matrix4().makeBasis(cx, cy, cz);
      const want = this.mining || this.swingT > 0 ? 1 : 0;
      this.pickBlend = (this.pickBlend ?? want) + (want - (this.pickBlend ?? want)) * Math.min(1, real * 9);
      const qa = new THREE.Quaternion().setFromRotationMatrix(carryM), qb = new THREE.Quaternion().setFromRotationMatrix(swingM);
      this.pick.matrix.makeRotationFromQuaternion(qa.slerp(qb, this.pickBlend)).setPosition(grip);
      if (this.mode === 'ladder' && this.bones.chest) {   // both hands on the rungs: the pick rides across his back, head up by his shoulder
        const c = at(this.bones.chest), sy = up.clone().multiplyScalar(0.85).addScaledVector(right, -0.5).normalize();
        const sx = new THREE.Vector3().crossVectors(sy, face).normalize(), sz = new THREE.Vector3().crossVectors(sx, sy);
        this.pick.matrix.makeBasis(sx, sy, sz).setPosition(c.addScaledVector(face, -H * 0.17).addScaledVector(up, -H * 0.3).addScaledVector(right, H * 0.1));
      }
      this.pick.matrixWorldNeedsUpdate = true;
    }
    if (this.bones.chest) {   // the bag hangs from his shoulders, against his back, leaning with him
      const c = at(this.bones.chest);
      for (const k in this.bags) { const b = this.bags[k]; b.position.copy(c).addScaledVector(face, -H * V.bagBack).addScaledVector(up, H * V.bagUp); b.rotation.set((this.bagRoll || 0) * V.bagSwing, bodyYaw, V.bagLean + (this.bagAng || 0) * V.bagSwing); }
    }
    // the bag on his back: flat at 0, half-full from 1, full from bagFullAt; its ore glows only with ore in it
    const bw = this.bagWeight(), fill = Math.min(1, bw / S.bagCapacity), hasOre = this.bag.length > 0;
    const stage = !hasOre ? 'empty' : bw < RULES.bagCapacity * 0.7 ? 'half' : 'full';
    for (const k in this.bags) this.bags[k].visible = k === stage;
    // the ore inside shows through; strongest when the lamp is out
    this.bags[stage].userData.mats.forEach((mt) => { mt.emissiveIntensity = hasOre ? (lit ? 0.04 : 0.4) * (0.5 + fill) : 0; });
    this.bagGlow.position.set(-H * 0.24, H * 0.62, H * 0.05); this.bagGlow.scale.setScalar(H * 0.7);
    this.bagGlow.material.opacity = hasOre ? (lit ? 0.06 : 0.35) * (0.5 + fill) : 0;
    // the belt lantern: the hook follows his hips; the lantern swings like a pendulum when he speeds up, stops or turns
    if (this.hips) {
      const hp = new THREE.Vector3(); this.hips.getWorldPosition(hp); g.worldToLocal(hp);
      this.lampPivot.position.copy(hp).addScaledVector(face, H * V.lampHook[0]).addScaledVector(up, H * V.lampHook[1]).addScaledVector(right, H * V.lampHook[2]);
      this.lampPivot.rotation.y = bodyYaw;
    }
    const vx = this.lastMx == null || real <= 0 ? 0 : (this.mx - this.lastMx) / real; this.lastMx = this.mx;
    const fwd = vx * this.facing, step = this.moving ? Math.sin((this.walkDist / V.walkStride) * Math.PI * 2) * 0.09 : 0;
    const target = clamp(-fwd * 0.004, -0.35, 0.35) + step + (this.mode === 'ladder' ? 0 : 0);
    this.lampVel += ((target - this.lampAng) * 38 - this.lampVel * 3.2) * Math.min(real, 0.05);
    this.lampAng += this.lampVel * Math.min(real, 0.05);
    this.lampPivot.rotation.z = this.lampAng;
    // the bag swings the same way, heavier and slower; a fuller bag swings less
    const heavy = 1 - 0.5 * fill, kdt = Math.min(real, 0.05);
    const bagTarget = clamp(-fwd * 0.0035, -0.3, 0.3) * heavy + (this.moving ? Math.sin((this.walkDist / V.walkStride) * Math.PI * 4) * 0.05 * heavy : 0);
    this.bagVel = (this.bagVel || 0) + ((bagTarget - (this.bagAng || 0)) * 22 - (this.bagVel || 0) * 2.6) * kdt;
    this.bagAng = (this.bagAng || 0) + this.bagVel * kdt;
    const rollTarget = this.mode === 'ladder' ? clamp(this.climbV * 0.004, -0.2, 0.2) : 0;
    this.bagRollVel = (this.bagRollVel || 0) + ((rollTarget - (this.bagRoll || 0)) * 22 - (this.bagRollVel || 0) * 2.6) * kdt;
    this.bagRoll = (this.bagRoll || 0) + this.bagRollVel * kdt;
    // the lamp
    this.minerRoot.updateMatrixWorld(true);
    const L = this.lamp();
    this.lampLight.visible = lit;
    this.lampLight.position.set(L.x + V.lampOffset[0], -L.y + V.lampOffset[1], L.z + V.lampOffset[2]);   // a little in front, so he is not blown out
    const reach = this.lightRadius() / RULES.basicLight; this.lampLight.distance = this.lampFill.distance = V.lampDistance * reach;   // oil widens the light
    this.lampLight.intensity = V.lampIntensity * (1 - V.lampFill) * (1 + 0.04 * Math.sin(this.clock * 9));
    this.lampFill.visible = lit; this.lampFill.position.copy(this.lampLight.position); this.lampFill.intensity = V.lampIntensity * V.lampFill;
    this.lampGlow.visible = lit; this.lampGlow.position.set(L.x, -L.y, L.z + 2); this.lampGlow.material.opacity = V.lampHalo * (1 + 0.08 * Math.sin(this.clock * 11));
    const flick = 1 + 0.06 * Math.sin(this.clock * 13) + 0.04 * Math.sin(this.clock * 29 + 1);
    if (this.lampMats) this.lampMats.forEach((mt) => { mt.emissiveIntensity = lit ? 0.55 * flick : 0; });
    if (this.flame) { this.flame.visible = lit; this.flame.scale.setScalar(H * V.flameSize * 2 * flick); }
    this.lid.visible = this.hatch !== 'open';
    // deposits: the pulse, the shimmer, the crack on the one you chose
    for (const n of this.nodes) {
      const s = n.baseScale * (0.6 + 0.4 * n.hp) * (n.flash > 0 ? 1.1 : 1); n.obj.scale.setScalar(s);
      if (n.kind === 'amber') {
        const pulse = 0.7 + 0.3 * Math.sin((this.clock / S.bitcoinPulseSeconds) * Math.PI * 2 + n.id);
        const inLight = Math.hypot(n.x - L.x, n.y - L.y) < this.lightRadius() * T;
        n.mats.forEach((mt) => { mt.emissiveIntensity = V.amberEmissive[n.zone] * pulse * (n.flash > 0 ? 2 : 1); });
        n.glim.material.opacity = (inLight ? 0.35 : S.glimmer) * pulse * (0.6 + 0.4 * n.hp);   // only faintly outside the lamplight
      } else if (n.kind === 'vault') {   // it gives nothing away: seen only inside his own lamplight
        const inLight = Math.hypot(n.x - L.x, n.y - L.y) < this.lightRadius() * T * 0.9;
        n.obj.visible = inLight; n.obj.userData.inner.intensity = 6 * (0.85 + 0.15 * Math.sin(this.clock * 1.3));
      } else if (n.kind === 'silver') {
        const w = S.silverShimmerSpeed * this.clock + n.id;
        n.glim.material.opacity = S.silverShimmer * (0.55 + 0.45 * Math.sin(w) * Math.sin(w * 1.73 + 1));
      }
    }
    this.drawCrack();
    this.hum(L);
    this.drawFog(L, lit);
    // sparks
    const sp2 = this.sparks, pos = sp2.pts.geometry.attributes.position, col = sp2.pts.geometry.attributes.color;
    sp2.p.forEach((p, i) => {
      if (p.life > 0) { p.life -= real; p.vy -= 420 * real; p.x += p.vx * real; p.y += p.vy * real; }
      const a = Math.max(0, p.life / p.max);
      pos.setXYZ(i, p.x, p.y, p.z + 6); col.setXYZ(i, p.c.r * a, p.c.g * a, p.c.b * a);
    });
    pos.needsUpdate = col.needsUpdate = true;
    // camera: follows him; a short shake on the knock
    const cam = this.camera, tx = this.mx, ty = -(this.my - H * 0.5);
    if (!this.camInit || !Number.isFinite(cam.position.y)) { cam.position.set(tx, ty, this.camDist); this.camInit = true; }
    const k = Math.min(1, real * S.cameraFollow);
    this.shake = Math.max(0, this.shake - real);
    const sh = this.shake > 0 ? 3 * this.shake : 0;
    cam.position.x += (tx - cam.position.x) * k; cam.position.y += (ty + this.camDist * V.tilt - cam.position.y) * k; cam.position.z = this.camDist;
    cam.lookAt(cam.position.x + (Math.random() - 0.5) * sh, cam.position.y - this.camDist * V.tilt + (Math.random() - 0.5) * sh, 0);
    // the E prompt above his head, and the phone buttons
    const tg = this.target(), pr = $('prompt'), show = !!tg && !this.overlay;
    pr.style.display = show ? 'flex' : 'none';
    if (show) {
      const p = this.screen(this.mx, this.my - H * 1.15, 0); pr.style.left = p.x + 'px'; pr.style.top = p.y + 'px';
      const sym = tg.kind === 'node' ? 'pick' : 'ladder';
      if (this.last.prompt !== sym) { this.last.prompt = sym; pr.innerHTML = ICON[sym] + 'E'; }
    }
    const sym = !tg ? 'E' : tg.kind === 'node' ? 'pick' : 'ladder';
    if (this.last.bAct !== sym) { this.last.bAct = sym; $('bAct').innerHTML = sym === 'E' ? 'E' : ICON[sym]; }
    this.set('bLeft', this.mode === 'ladder' ? '▲' : '◀'); this.set('bRight', this.mode === 'ladder' ? '▼' : '▶');
  }
  drawCrack() {
    if (!this.crackLine) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(2 * 3 + 65 * 3), 3));
      this.crackLine = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.95, depthTest: false }));
      this.crackLine.renderOrder = 20; this.crackLine.frustumCulled = false; this.scene.add(this.crackLine);
    }
    const n = this.mining; this.crackLine.visible = !!n; if (!n) return;
    const p = this.crackLine.geometry.attributes.position, cx = Math.cos(n.crack) * n.r * 1.4, cy = Math.sin(n.crack) * n.r * 1.4;
    p.setXYZ(0, n.x - cx, -(n.y - cy), n.z + 6); p.setXYZ(1, n.x + cx, -(n.y + cy), n.z + 6);
    // a ring around it, drawn as short segments
    for (let i = 0; i < 32; i++) {
      const a0 = i / 32 * Math.PI * 2, a1 = (i + 1) / 32 * Math.PI * 2, R = n.r * 1.8;
      p.setXYZ(2 + i * 2, n.x + Math.cos(a0) * R, -(n.y + Math.sin(a0) * R), n.z + 6);
      p.setXYZ(3 + i * 2, n.x + Math.cos(a1) * R, -(n.y + Math.sin(a1) * R), n.z + 6);
    }
    p.needsUpdate = true; this.crackLine.geometry.setDrawRange(0, 66);
  }
  hum(L) {   // the hum of the Deep: switched off by the owner (no music); set V.music to bring it back
    if (!V.music) return;
    const v = this.mine && this.mine.vault; if (!v) return;
    const ctx = !Sound.muted() && Sound.unlock && this.humReady ? this.humCtx : null;
    const d = Math.hypot(v.x - L.x, (v.base - 20) - L.y), loud = this.below() ? clamp(1 - d / V.humRange, 0, 1) : 0;
    if (!ctx) { if (!this.humReady && !Sound.muted() && this.below()) this.startHum(); return; }
    this.humGain.gain.setTargetAtTime(Sound.muted() ? 0 : 0.18 * loud * loud, ctx.currentTime, 0.4);
  }
  startHum() {
    const ctx = Sound.unlock(); if (!ctx || ctx.state !== 'running') return;
    this.humCtx = ctx; this.humGain = ctx.createGain(); this.humGain.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
    for (const [f, a] of [[41, 0.6], [61.5, 0.35], [82.4, 0.2]]) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = f; g.gain.value = a; o.connect(g).connect(lp); o.start(); }
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.23; lg.gain.value = 60; lfo.connect(lg).connect(lp.frequency); lfo.start();
    lp.connect(this.humGain).connect(ctx.destination);
    this.humReady = true;
  }
  drawFog(L, lit) {
    const f = this.fog, c = S.fogCell, R = this.lightRadius() * T, d = f.img.data, dim = lit ? S.fogVisited : S.fogVisitedLampOut;
    for (let j = 0; j < f.rows; j++) {
      const y = f.y0 + (j + 0.5) * c;
      for (let i = 0; i < f.cols; i++) {
        const k = j * f.cols + i, x = f.x0 + (i + 0.5) * c;
        let a = 1;
        if (lit) {
          const dist = Math.hypot(x - L.x, y - L.y);
          if (dist <= R * 0.85) f.seen[k] = 1;
          a = clamp((dist - R * 0.55) / (R * 0.45), 0, 1);
        }
        if (f.seen[k]) a = Math.min(a, dim);
        d[k * 4 + 3] = Math.round(a * 255);
      }
    }
    f.ctx.putImageData(f.img, 0, 0); this.fogTex.needsUpdate = true;
  }

  // ---------- HUD (as in 2D) ----------
  bindHud() {
    const stop = (e) => e.stopPropagation();
    ['drop', 'recBtn', 'ovBtn', 'recClose', 'modeBtn'].forEach((id) => { $(id).addEventListener('pointerdown', stop); });
    this.bindKeys();
    if (TEST) {
      const sl = $('speed'), show = () => { this.speed = TestClock.speed = S.testSpeeds[+sl.value]; $('speedVal').textContent = this.speed + '×'; };
      sl.max = S.testSpeeds.length - 1;
      let saved = S.testSpeeds.indexOf(1); try { const v = localStorage.getItem('blockmine.cutaway.testSpeed'); if (v !== null && +v >= 0 && +v < S.testSpeeds.length) saved = +v; } catch (e) {}
      sl.value = saved; show();
      sl.addEventListener('input', () => { show(); try { localStorage.setItem('blockmine.cutaway.testSpeed', sl.value); } catch (e) {} });
      sl.addEventListener('change', () => sl.blur());
      for (const ev of ['pointerdown', 'keydown']) sl.addEventListener(ev, (e) => e.stopPropagation());
      $('speedBox').style.display = 'flex';
    }
    $('drop').onclick = () => this.drop();
    ['shopBtn', 'shopClose', 'buyKit', 'buyLamp', 'buyOil'].forEach((id) => $(id).addEventListener('pointerdown', stop));
    $('shopBtn').onclick = () => { this.freshMoney(); this.openShop(); };
    window.addEventListener('storage', (e) => { if (e.key === ECO_KEY || e.key === PURSE_KEY) this.freshMoney(); });
    $('shopClose').onclick = () => { $('shop').style.display = 'none'; this.overlay = false; };
    $('buyKit').onclick = () => { if (this.net) return this.net.send({ t: 'buy', item: 'kit' }); this.freshMoney(); if (this.purse.buyKit(this.eco)) { Sound.tick(); this.saveMoney(); } this.openShop(); };
    $('buyLamp').onclick = () => { if (this.net) return this.net.send({ t: 'buy', item: 'lamp' }); this.freshMoney(); if (this.purse.buyLamp(this.eco)) { Sound.tick(); this.saveMoney(); } this.openShop(); };
    $('buyOil').onclick = () => {
      if (this.below() || this.lampLit) { this.say('Oil is bought before you go down.', 2); return; }
      if (this.oilLeft >= RULES.oilMaxMeasures) return;
      if (this.net) return this.net.send({ t: 'buy', item: 'oil' });
      this.freshMoney();
      if (this.purse.buyOil(this.eco, 1)) { this.oilLeft += 1; Sound.tick(); this.saveMoney(); }
      this.openShop();
    };
    $('catch').textContent = 'Blocks come at random, every ten minutes on average. The chance one lands within ' +
      RULES.catchRates.map(([s, p]) => (s < 60 ? s + ' s' : s / 60 + ' min') + ': ' + p).join(' · ') + '.';
    $('recBtn').onclick = () => {
      const r = records.get();
      $('rShifts').textContent = r.shifts; $('rDeep').textContent = r.deepestLevel;
      $('rCaught').textContent = r.timesCaught; $('rPoints').textContent = r.totalPoints; $('rVault').textContent = r.vaultPieces || 0;
      $('rMinerals').textContent = mineralText(r.minerals || {}) || 'none';
      $('recMode').textContent = TEST ? '(test mode)' : '(live chain)';
      $('modeBtn').textContent = TEST ? 'Back to live chain' : 'Switch to test mode';
      $('records').style.display = 'flex'; this.overlay = true;
    };
    $('recClose').onclick = () => { $('records').style.display = 'none'; this.overlay = false; };
    $('modeBtn').onclick = () => { location.search = TEST ? '' : '?test'; };
    $('ovBtn').onclick = () => { $('overlay').style.display = 'none'; this.overlay = false; };
  }
  openShop() {
    const p = this.purse, R = RULES, onTop = !this.below() && !this.lampLit;
    $('shopPoints').textContent = fmt(p.points); $('shopLamps').textContent = p.lamps; $('shopOil').textContent = this.oilLeft;
    $('buyKit').style.display = p.hasKit ? 'none' : ''; $('buyKit').disabled = !p.canBuyKit();
    $('buyLamp').style.display = p.hasKit ? '' : 'none'; $('buyLamp').disabled = p.points < R.lampPrice;
    $('buyOil').disabled = !onTop || this.oilLeft >= R.oilMaxMeasures || p.points < R.oilPrice;
    $('shopPot').textContent = fmt(this.eco.pot); $('shopVault').textContent = fmt(this.eco.vault);
    $('shop').style.display = 'flex'; this.overlay = true;
  }
  showOverlay(title, text) { $('ovTitle').textContent = title; $('ovText').textContent = text; $('overlay').style.display = 'flex'; this.overlay = true; }
  say(text, seconds) { this.msg = text; this.msgUntil = performance.now() + seconds * 1000; }
  set(id, v) { if (this.last[id] !== v) { this.last[id] = v; $(id).textContent = v; } }
  climbOutSeconds() {
    if (!this.mine || !this.below()) return 0;
    const r = MineGen.route(this.mine, this.here(), this.hatchLoc(), this.speeds());
    return r ? r.time : 0;
  }
  hud() {
    this.set('oil', this.oilLeft > 0 ? this.oilLeft.toFixed(1) : this.lampLit ? 'basic' : '–');
    this.set('lamps', this.lampLit ? 'lamp lit · ' + this.purse.lamps + ' spare' : this.purse.lamps + ' lamp' + (this.purse.lamps === 1 ? '' : 's'));
    const w = this.bagWeight();
    this.set('bagW', w + '/' + RULES.bagCapacity);
    this.set('bagSats', fmt(this.bagSats()));
    this.set('bag', 'carried, not kept' + (this.bag.some((p) => p.kind === 'vault') ? ' · the Vault piece' : '') + (mineralText(this.bagMinerals()) ? ' · ' + mineralText(this.bagMinerals()) : '') + (w >= RULES.bagCapacity ? ' · full' : ''));
    { const rv = records.get(); this.set('vaultSats', String(rv.totalPoints)); this.set('vault', mineralText(rv.minerals || {}) || 'no minerals'); }   // banked so far
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

// ---------- online: the shared shaft ----------
// The page sends what the player does (where he is, his strokes, what he buys) and draws what the server sends back:
// the shape of the mine, the ore his own lamp shows, faint glimmers further out, the miners near him in full and the
// rest as points of light. The server decides every result.
class Net {
  constructor(game, url) {
    this.g = game; this.url = url; this.sendT = 0; this.others = new Map(); this.lights = [];
    this.connect();
  }
  connect() {
    const ws = this.ws = new WebSocket(this.url);
    ws.onopen = () => { let token = null; try { token = localStorage.getItem('blockmine3d.token'); } catch (e) {} this.send({ t: 'hello', token }); this.g.onStatus('live'); };
    ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } this.on(m); };
    ws.onclose = () => { this.g.onStatus('lost'); setTimeout(() => this.connect(), 3000); };
  }
  send(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
  place() {
    const g = this.g;
    if (g.mode === 'ladder') return { k: g.ladderK, y: g.my };
    if (g.mode === 'ground') return { l: g.lvl, x: g.mx };
    return null;   // falling or jumping: sent when he lands
  }
  frame(real) {
    const g = this.g;
    this.sendT += real;
    if (g.lampLit && this.sendT >= 0.1 && !g.mining) { this.sendT = 0; const p = this.place(); if (p) this.send({ t: 'pos', p, f: g.facing }); }
    for (const o of this.others.values()) o.mixer.update(real);
  }
  item(it) { return { kind: it.kind, sats: it.value || 0, weight: it.weight, dropped: !!it.dropped }; }
  on(m) {
    const g = this.g;
    switch (m.t) {
      case 'welcome':
        try { localStorage.setItem('blockmine3d.token', m.token); } catch (e) {}
        g.purse = Purse(RULES, m.purse); this.id = m.id; break;
      case 'block':
        g.blockInfo = { height: m.height, arrivedAt: m.arrivedAt, prevOpenMs: null };
        g.eco = Economy(RULES, { pot: m.pot, vault: m.vault });
        g.hatch = m.hatch; this.commit = m.commit;
        if (m.reveal) this.check(m.reveal);
        if (m.mine) this.openMine(m);
        break;
      case 'knock':
        if (m.first) break;
        Sound.knock(); g.shake = 0.45; g.hatch = 'shut'; g.mining = null; break;
      case 'state': this.state(m); break;
      case 'entered':
        g.purse = Purse(RULES, m.purse); g.lampLit = true; g.oilLeft = m.oil; g.inShift = true; g.bag = [];
        records.get().shifts++; records.save();
        g.mode = 'ladder'; g.ladderK = 0; g.mx = g.mine.G.colX(g.mine.ladders[0].c); g.my = 0; g.mining = null;
        g.say('Lamp lit for this shift' + (g.oilLeft ? ' · ' + g.oilLeft + ' measure' + (g.oilLeft > 1 ? 's' : '') + ' of oil' : ''), 2.5);
        break;
      case 'got': {
        const n = g.nodes.find((q) => q.id === m.id);
        if (n) { g.burst(24, n.x, n.y, n.z); g.removeNode(n); }
        if (g.mining && g.mining.id === m.id) g.mining = null;
        g.bag = m.bag.map((it) => this.item(it));
        const it = m.item;
        if (it.kind === 'amber') g.say('+' + fmt(it.value) + ' sats carried. Kept only past the hatch.', 2.5);
        else if (it.kind === 'vault') g.say('The Vault piece! Worth a tenth of the Vault if you carry it out. Weight 10.', 5);
        else g.say('+1 ' + it.kind + ' in the bag (weight ' + it.weight + ')', 2);
        break;
      }
      case 'bag': g.bag = m.bag.map((it) => this.item(it)); break;
      case 'snap': this.snap(m.place); break;
      case 'banked': {
        g.purse = Purse(RULES, m.purse); g.inShift = false; g.lampLit = false; g.oilLeft = 0;
        const r = records.get(); r.totalPoints += m.kept; r.survived = (r.survived || 0) + 1; if (m.piece) r.vaultPieces = (r.vaultPieces || 0) + 1; records.save();
        const mins = {}; for (const it of m.bag) if (it.kind !== 'amber' && it.kind !== 'vault') mins[it.kind] = (mins[it.kind] || 0) + 1;
        g.bag = [];
        if (m.kept || Object.keys(mins).length) {
          g.say((m.piece ? 'The Vault piece is yours! ' : '') + 'Kept ' + [m.kept ? fmt(m.kept) + ' sats' : '', mineralText(mins)].filter(Boolean).join(' · ') + (m.kept ? ' (the Order takes a tenth)' : ''), 4);
          const v = $('vaultCell'); v.classList.remove('flash'); void v.offsetWidth; v.classList.add('flash');
        }
        break;
      }
      case 'caught':
        g.purse = Purse(RULES, m.purse); g.bag = []; g.inShift = false; g.lampLit = false; g.oilLeft = 0; g.drag = null; g.toSurface();
        records.get().timesCaught++; records.save();
        g.showOverlay('The deep is closed', 'The knock came before you reached the hatch. Your lamp and your bag (' + fmt(m.sats) + ' sats carried) are lost.');
        break;
      case 'purse':
        g.purse = Purse(RULES, m.purse); if (m.item === 'oil') g.oilLeft = m.oil;
        if (m.ok) Sound.tick();
        if ($('shop').style.display === 'flex') g.openShop();
        break;
      case 'say': g.say(m.text, 3); break;
    }
  }
  openMine(m) {
    const g = this.g, v = m.mine;
    g.nodes = []; this.others.forEach((o) => g.scene.remove(o.root)); this.others.clear();
    g.mine = Object.assign({ S, R: RULES, G: MineGen.geometry(S, RULES), hash: v.look, nodes: [] }, v);
    g.glims = new Map(); g.hatch = m.hatch;
    g.buildMine();
    if (!g.below() || !g.inShift) { g.toSurface(); g.lampLit = false; g.inShift = false; }
    Sound.bell();
    g.say('Block ' + m.height.toLocaleString() + ' · the hatch is open · ' + (v.minersBelow || 0) + ' miners in the shaft', 4);
  }
  state(m) {
    const g = this.g; if (!g.mine) return;
    g.hatch = m.hatch;
    for (const n of m.nodes || []) {
      if (g.nodes.some((q) => q.id === n.id)) continue;
      const gl = g.glims.get(n.id); if (gl) { g.world.remove(gl); g.glims.delete(n.id); }
      const node = Object.assign({ flash: 0 }, n); g.mine.nodes.push(node); g.showNode(node);
    }
    for (const n of m.glim || []) {   // ore glimmers faintly outside the light: no kind, no value
      if (g.glims.has(n.id)) continue;
      const s2 = g.glowSprite(0xff8a3a, 18, 0.16); s2.position.set(n.x, -n.y, 0); s2.material.depthTest = false; s2.renderOrder = 9;
      g.world.add(s2); g.glims.set(n.id, s2);
    }
    for (const id of m.gone || []) {
      const n = g.nodes.find((q) => q.id === id); if (n) g.removeNode(n);
      const gl = g.glims.get(id); if (gl) { g.world.remove(gl); g.glims.delete(id); }
      if (g.mining && g.mining.id === id) g.mining = null;
    }
    if (m.hp) for (const id in m.hp) { const n = g.nodes.find((q) => q.id === +id); if (n) n.hp = m.hp[id]; }
    if (m.far) this.far = m.far;
    this.drawOthers(m.near || [], this.far || []);
  }
  snap(pl) {   // the server says he cannot be where the page put him: back to where he really is
    const g = this.g, G = g.mine.G;
    if (pl.k !== undefined) { g.mode = 'ladder'; g.ladderK = pl.k; g.mx = G.colX(g.mine.ladders[pl.k].c); g.my = pl.y; }
    else { g.mode = 'ground'; g.lvl = pl.l; g.mx = pl.x; g.my = G.floorY(pl.l); g.ladderK = null; }
    g.falling = null; g.vx = g.vy = 0;
  }
  figure() {   // another miner, near enough to see in full: the same model, his own animations
    const g = this.g, mdl = g.A.models.miner, root = new THREE.Group(), turn = new THREE.Group(); turn.rotation.y = Math.PI / 2; root.add(turn);
    const body = SkeletonUtils.clone(mdl.scene); turn.add(body);
    body.traverse((q) => { if (q.isMesh) { q.castShadow = true; fogged(q.material); q.frustumCulled = false; } });
    body.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(body), k = S.minerHeight / (box.max.y - box.min.y);
    body.scale.setScalar(k); body.position.y = -box.min.y * k;
    const mixer = new THREE.AnimationMixer(body), acts = {};
    for (const clip of mdl.animations) acts[clip.name] = mixer.clipAction(clip);
    const lamp = g.glowSprite(0xffc080, 46, 0.5); lamp.position.set(10, S.minerHeight * 0.45, 8); root.add(lamp);
    g.scene.add(root);
    return { root, mixer, acts, anim: null, x: null, y: null };
  }
  drawOthers(near, far) {
    const g = this.g, G = g.mine.G, seen = new Set();
    for (const q of near) {
      seen.add(q.id);
      let o = this.others.get(q.id); if (!o) { o = this.figure(); this.others.set(q.id, o); }
      const pl = q.p, onLadder = pl.k !== undefined, x = onLadder ? G.colX(g.mine.ladders[pl.k].c) : pl.x, y = onLadder ? pl.y : G.floorY(pl.l);
      const moving = o.x !== null && (Math.abs(x - o.x) > 0.5 || Math.abs(y - o.y) > 0.5);
      const name = q.m ? 'swing' : onLadder ? 'climb' : moving ? 'walk' : 'idle';
      if (o.anim !== name && o.acts[name]) { if (o.anim) o.acts[o.anim].fadeOut(0.2); o.acts[name].reset().fadeIn(0.2).play(); o.anim = name; }
      o.x = x; o.y = y;
      o.root.position.set(x, -y, onLadder ? -V.depth * 0.15 : 0);
      o.root.rotation.y = onLadder ? -Math.PI / 2 : q.f < 0 ? Math.PI : 0;
    }
    for (const [id, o] of this.others) if (!seen.has(id)) { g.scene.remove(o.root); this.others.delete(id); }
    // the far ones: a point of light each
    while (this.lights.length < far.length) { const s2 = g.glowSprite(0xffc070, 26, 0.55); s2.material.depthTest = false; s2.renderOrder = 8; g.scene.add(s2); this.lights.push(s2); }
    this.lights.forEach((s2, i) => { const f = far[i]; s2.visible = !!f; if (f) s2.position.set(f[0] * T, -f[1] * T + S.minerHeight * 0.5, V.depth * 0.3); });
  }
  async check(rev) {   // the fairness proof: last block's seed hashes to the fingerprint published when its hatch opened
    if (!rev || !rev.seed || !crypto.subtle) return;
    const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rev.seed));
    const hex = [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
    this.fair = { height: rev.height, ok: hex === rev.commit };
    if (!this.fair.ok) console.warn('Block ' + rev.height + ': the revealed seed does not match its fingerprint');
  }
}

loadAll().then((a) => new Game(a)).catch((e) => { $('loading').textContent = 'Could not load the 3D mine: ' + e.message; console.error(e); });
