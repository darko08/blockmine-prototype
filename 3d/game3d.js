// Blockmine 3D: the cutaway mine with real 3D models, a lit lantern and shadows.
// The rules are the 2D cutaway's: the same mine from the block hash (cutaway/mine.js), the same settings
// (cutaway/settings.js), the same block clock, records and sounds. Only the drawing is new.
// World: the game's units, x to the right and y downward; in three.js X = x, Y = -y, and Z points at the camera.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const S = window.SETTINGS;
const TEST = new URLSearchParams(location.search).has('test');
const T = S.tile, $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mmss = (ms) => {
  const t = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = String(t % 60).padStart(2, '0');
  return h ? h + ':' + String(m).padStart(2, '0') + ':' + s : m + ':' + s;
};
const mineralText = (c) => ['amber', 'iron', 'silver'].filter((k) => c[k]).map((k) => c[k] + ' ' + k).join(', ');

// ---- the look of the 3D version (its own numbers; the rules' numbers stay in cutaway/settings.js) ----
const V = {
  depth: 2.3 * T,            // how deep the tunnels go into the rock, front to back
  viewHeight: S.minerHeight / S.minerScreenShare,   // world units the camera shows top to bottom, as in 2D
  fov: 32, tilt: 0.07,       // camera: field of view, and a slight look down
  lampIntensity: 120, lampDistance: S.lightRadius * T * 2.6, lampDecay: 1, lampOffset: [0, 18, 42], lampFill: 0.45,   // share of the lamp's light that casts no shadow (softens his shadow) lampColor: 0xffc890,   // an oil flame: warm, but closer to white than to yellow
  lampHalo: 0.1, flameSize: 0.05,
  ambient: 0.55,             // what lets the fog's "seen" areas stay dimly visible
  moon: 1.1,                 // light on the surface at night
  rockTex: 256,              // world units per repeat of the rock paintings
  propHeight: { cart: 30, barrel: 22, crate: 20, lantern: 18 },
  timberEvery: 5.5 * T,      // spacing of timber sets along a tunnel (zones 1-3)
  pickScale: 0.42,           // pickaxe length as a share of his height
  bitcoinEmissive: [0.35, 0.55, 0.8, 1.1],
  lampSize: 0.16,            // the belt lantern's height, handle included, as a share of his height
  lampHook: [0.04, 0.02, 0.15],   // the belt hook, from his hips: forward, up, to his right (shares of his height)
  turnRate: 7,               // how quickly he turns to face a new way (higher = snappier)
  pickLength: 0.48,          // the pick, end to end, as a share of his height (a real pick is about 0.9 m)
  bagBack: 0.09,             // how far behind his chest bone the bag hangs (his back is about 0.1 behind it)
  pileScale: 1.3,            // 3D deposit piles are this much taller than the 2D pile heights (their base is wide rubble)
  walkStride: 50,            // world units per cycle of the Mixamo walk (a man 1.8 m tall: about 1.65 m)
  climbStride: 18,           // world units climbed per cycle of the Mixamo ladder climb (about two rungs)
  swingSeconds: 1.0,         // one swing of the pick, start to recovery
  jumpTimes: [0.68, 1.03, 1.35, 1.75],   // the Mixamo jump clip: take-off, peak, touch-down, back up from the landing crouch (s)
  landSeconds: 0.22,         // how long the landing crouch shows before he walks or stands again
};
const MODELS = ['miner', 'pick', 'dep_bitcoin', 'dep_iron', 'dep_silver', 'dep_amber', 'bag_empty', 'bag_half', 'bag_full', 'ladder', 'headframe', 'cart', 'barrel', 'crate', 'lantern', 'timber'];

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
  await Promise.all(MODELS.map((n) => new Promise((res) => loader.load('models/' + n + '.glb?v=10', (g) => { models[n] = g; res(); }, undefined, () => res()))));
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
    this.bag = []; this.oil = S.oilStart; this.inShift = false;
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
    startChain(TEST, (b) => this.onBlock(b), (s) => this.onStatus(s));
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
    const c0 = -14, c1 = S.cols + 14, rows = G.floorY(last) / T + 5;
    const open = new Set(), key = (c, r) => c + ',' + r;
    m.levels.forEach((seg, l) => {
      for (let r = G.ceilY(l) / T; r < G.floorY(l) / T; r++) for (let c = seg.a; c <= seg.b; c++) open.add(key(c, r));
    });
    m.ladders.forEach((d) => { for (let r = G.floorY(d.top) / T; r < G.ceilY(d.bottom) / T; r++) open.add(key(d.c, r)); });
    const zoneOfRow = (r) => { const l = Math.ceil((r * T + 1) / (S.levelSpacing * T)) - 1; return clamp(Math.floor(l / S.zoneLevels), 0, 3); };
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
      sky.position.set(S.cols * T / 2, h * (0.5 - S.surfaceGround) * 0.98 + 40, -900); sky.userData.own = true; this.world.add(sky);
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
    });
    // the headframe over the shaft, and the hatch lid when the hatch is shut
    const hx = G.colX(m.c0);
    if (this.A.models.headframe) { const hf = place(this.A.models.headframe, 190); hf.position.set(hx, 0, -T * 0.6); this.world.add(hf); }
    this.lid = new THREE.Mesh(new THREE.BoxGeometry(T * 1.4, 5, D * 0.9), fogged(new THREE.MeshStandardMaterial({ map: this.A.shaft[0], color: 0x9a7650, roughness: 0.9 })));
    this.lid.position.set(hx, 2.5, 0); this.lid.castShadow = true; this.lid.userData.own = true; this.world.add(this.lid);
    // the fog's memory of what you have seen
    const W = S.cols * T;
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
      o.rotation.y = -Math.PI / 2 + 0.35;   // its front faces backward, turned a little toward you
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
      if (this.below()) { this.toSurface(); this.bank(); }
      this.openMine(b, true);
      this.say('Feed back. A block came while it was down; you were brought up safely.', 6);
      return;
    }
    Sound.knock(); this.shake = 0.45;
    if (this.below()) this.caught();
    this.hatch = 'shut'; this.mining = null;
    this.shutTimer = setTimeout(() => this.openMine(b, true), (S.hatchShutSeconds * 1000) / this.speed);
  }
  openMine(b, ring) {
    this.nodes = [];
    this.mine = MineGen.generate(b.hash, S);
    MineGen.layoutNodes(this.mine); MineGen.layoutTerrain(this.mine);
    this.mine.spawnRng = seededRandom(b.hash + '|spawn'); this.mine.spawnT = 0;
    this.hatch = 'open';
    this.buildMine();
    this.mine.nodes.forEach((n) => this.showNode(n));
    if (!this.below()) this.toSurface();
    if (ring) Sound.bell();
    this.say('Block ' + b.height.toLocaleString() + ' · the hatch is open', 4);
  }

  // deposits, made from the 2D art: Bitcoin ore, iron and silver as piles on the floor against the back wall (as tall as
  // the 2D piles), amber crystals growing out of the back wall at chest height
  showNode(n) {
    const M = this.A.models, zb = -V.depth / 2, amber = n.kind === 'amber';
    const o = place(M['dep_' + n.kind], amber ? n.r * 3.0 : n.h * V.pileScale, { cloneMat: true });
    const jit = (n.crack / Math.PI - 0.5) * 0.5;
    if (amber) {   // the cluster's base against the wall, crystals pointing out and up
      o.rotation.set(Math.PI * 0.32, jit, 0);
      o.position.set(n.x, -(n.y + n.r * 1.2), zb + 1);
    } else {
      o.rotation.y = jit;
      o.position.set(n.x, -(n.base - S.pileSink), zb + V.depth * 0.3);
    }
    n.obj = o; n.mats = []; o.traverse((m) => m.isMesh && n.mats.push(m.material));
    n.z = amber ? zb + n.r * 2 : o.position.z + V.depth * 0.2;
    n.baseScale = o.scale.x;
    if (n.kind === 'bitcoin') {   // the only deposit that glows, pulses, and glimmers through the fog: its cracks light up
      n.mats.forEach((mt) => { mt.emissive = new THREE.Color(n.rich ? 0xfff0c0 : 0xffb060); mt.emissiveMap = mt.map; mt.needsUpdate = true; });
      n.glim = this.glowSprite(n.rich ? 0xfff0b0 : 0xff7a20, n.h * 1.4, 0); n.glim.position.set(n.x, -n.y, n.z + 4); n.glim.renderOrder = 10; n.glim.material.depthTest = false;
      this.world.add(n.glim);
    } else if (n.kind === 'silver') {   // a faint cold shimmer where the lamp shows it
      n.glim = this.glowSprite(0xcfe0ff, n.h * 1.6, 0); n.glim.position.set(n.x, -n.y, n.z + 4); this.world.add(n.glim);
      n.mats.forEach((mt) => { mt.metalness = 0.5; mt.roughness = 0.35; });
    } else if (amber) {   // amber catches the lamp light; a soft inner warmth
      n.mats.forEach((mt) => { mt.emissive = new THREE.Color(0xff9a30); mt.emissiveMap = mt.map; mt.emissiveIntensity = 0.25; mt.needsUpdate = true; });
    }
    this.world.add(o); this.nodes.push(n);
  }
  removeNode(n) {
    this.world.remove(n.obj); n.glim && this.world.remove(n.glim);
    this.nodes = this.nodes.filter((x) => x !== n);
    this.mine.nodes = this.mine.nodes.filter((x) => x !== n);
  }
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
  fill() { return Math.min(1, this.bagWeight() / S.bagCapacity); }
  factor() { return 1 - (1 - S.fullBagSpeedFactor) * this.fill(); }
  speeds() { const f = this.factor(); return { walk: S.runSpeed * f, up: S.climbSpeed * f, down: S.slideSpeed * f }; }
  hatchLoc() { return { kind: 'level', l: -1, x: this.mine.G.colX(this.mine.c0) }; }
  lamp() {   // the belt lantern's place, in game units
    const p = new THREE.Vector3();
    if (this.beltLamp) this.beltLamp.getWorldPosition(p); else p.set(this.mx, -(this.my - S.minerHeight * 0.5), 0);
    return { x: p.x, y: -p.y - S.minerHeight * V.lampSize * 0.4, z: p.z };   // the glass, above the lantern's base
  }
  lampOn() { return this.oil > 0; }

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
      if ((d.top === this.lvl || d.bottom === this.lvl) && dx <= S.grabRange * T && dx < bd) { best = k; bd = dx; }
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
      if (!this.lampOn()) { this.say('Too dark to mine. Your lamp is out.', 2); return; }
      if (this.bagWeight() + near.weight > S.bagCapacity + 1e-9) { this.say('Your bag is full. Drop ore or go up.', 2.5); return; }
      if (Math.abs(near.x - this.mx) < S.oreStandGap * T * 0.8) this.mx = near.standX;
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
    this.moving = false; this.climbV = 0;
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
      if (dir && this.mining) this.mining = null;
      if (press.jump && !this.mining) {
        this.mode = 'air'; this.vy = -Math.sqrt(2 * S.gravity * S.jumpHeight); this.airT = 0;
        this.vx = dir * S.runSpeed * f; if (dir) this.facing = dir;
        return;
      }
      if (dir && !this.mining) {
        this.facing = dir;
        const want = this.mx + dir * S.runSpeed * f * dt, nx = clamp(this.blockRubble(this.lvl, this.mx, want, fy), x0, x1);
        if (Math.abs(nx - want) > 1e-6 && nx === this.blockRubble(this.lvl, this.mx, want, fy) && performance.now() > (this.rubbleHintAt || 0)) {
          this.say('Rubble in the way. Jump over it.', 2); this.rubbleHintAt = performance.now() + 4000;
        }
        this.moving = Math.abs(nx - this.mx) > 1e-3; this.walkDist += Math.abs(nx - this.mx); this.mx = nx;
      }
      const gap = this.terrainAt(this.lvl, this.mx, 'gap');
      if (gap) this.startFall('gap', 0, gap);
    } else if (this.mode === 'ladder') {
      const d = this.mine.ladders[this.ladderK], y0 = this.floorY(d.top), y1 = this.floorY(d.bottom);
      const v = up ? -S.climbSpeed * f : down ? S.slideSpeed * f : 0;
      this.my += v * dt; this.climbDist += Math.abs(v * dt); this.climbV = v;
      if (v < 0 && this.my <= y0) this.stepOff(d, true, dir);
      else if (v > 0 && this.my >= y1) this.stepOff(d, false, dir);
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
    const swingsNeeded = S.sloppySwings - t * (S.sloppySwings - S.cleanSwings);
    n.hp -= 1 / swingsNeeded; n.flash = 0.12; this.swingT = V.swingSeconds; this.swingStart = true;
    Sound.tick();
    this.burst(t >= 1 ? 16 : 7, n.x, n.y, n.z);
    this.float(n.x, n.y - n.r - 10, n.z, t >= 1 ? 'clean' : t > 0.5 ? 'rough' : 'sloppy');
    if (n.hp <= 1e-9) {
      this.burst(24, n.x, n.y, n.z);
      this.removeNode(n); this.mining = null;
      if (this.bagWeight() + n.weight > S.bagCapacity + 1e-9) this.say('No room in the bag. The ore fell.', 2.5);
      else {
        this.bag.push({ kind: n.kind, sats: n.value, weight: n.weight });
        this.say(n.kind === 'bitcoin' ? (n.rich ? 'Rich Bitcoin ore! ' : '') + '+' + n.value + ' sats in the bag' : '+1 ' + n.kind + ' in the bag', 2);
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

  caught() {
    this.bag = []; this.inShift = false; this.oil = S.oilStart; this.drag = null;
    this.toSurface();
    records.get().timesCaught++; records.save();
    this.showOverlay('The deep is closed', 'The knock came before you reached the hatch. Your bag is lost. That counts as 1 death.');
  }
  bank() {
    const sats = this.bagSats(), mins = this.bagMinerals(), r = records.get();
    if (this.inShift) {
      r.totalPoints += sats; r.minerals = r.minerals || {};
      for (const k in mins) r.minerals[k] = (r.minerals[k] || 0) + mins[k];
      records.save();
    }
    this.bag = []; this.inShift = false; this.oil = S.oilStart;
    const m = mineralText(mins);
    if (sats || m) {
      this.say('Banked ' + [sats ? sats + ' sats' : '', m].filter(Boolean).join(' · '), 3);
      const plus = [sats ? '+' + sats + ' sats' : '', ...Object.entries(mins).map(([k, v]) => '+' + v + ' ' + k)].filter(Boolean).join(' · ');
      this.float(this.mine.G.colX(this.mine.c0), -S.minerHeight * 1.4, 0, plus);
      const v = $('vaultCell'); v.classList.remove('flash'); void v.offsetWidth; v.classList.add('flash');
    }
  }
  bagWeight() { return this.bag.reduce((a, b) => a + b.weight, 0); }
  bagSats() { return this.bag.reduce((a, b) => a + b.sats, 0); }
  bagMinerals() { const c = {}; for (const b of this.bag) if (b.kind !== 'bitcoin') c[b.kind] = (c[b.kind] || 0) + 1; return c; }

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
    this.hud();
    this.renderer.render(this.scene, this.camera);
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
      if (this.oil === 0) this.say('Your lamp is out. Feel your way back to the ladders.', 4);
    }
    if (this.mining && (!this.lampOn() || !this.nodes.includes(this.mining))) this.mining = null;
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
        this.pick.matrix.makeBasis(sx, sy, sz).setPosition(c.addScaledVector(face, -H * (V.bagBack + 0.08)).addScaledVector(up, -H * 0.3).addScaledVector(right, H * 0.1));
      }
      this.pick.matrixWorldNeedsUpdate = true;
    }
    if (this.bones.chest) {   // the bag hangs from his shoulders, against his back, leaning with him
      const c = at(this.bones.chest);
      for (const k in this.bags) { const b = this.bags[k]; b.position.copy(c).addScaledVector(face, -H * V.bagBack).addScaledVector(up, H * 0.1); b.rotation.set(this.bagRoll || 0, bodyYaw, -0.1 + (this.bagAng || 0)); }
    }
    // the bag on his back: flat at 0, half-full from 1, full from bagFullAt; its ore glows only with ore in it
    const bw = this.bagWeight(), fill = Math.min(1, bw / S.bagCapacity), hasOre = this.bag.length > 0;
    const stage = !hasOre ? 'empty' : bw < S.bagFullAt ? 'half' : 'full';
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
      if (n.kind === 'bitcoin') {
        const pulse = 0.7 + 0.3 * Math.sin((this.clock / S.bitcoinPulseSeconds) * Math.PI * 2 + n.id);
        n.mats.forEach((mt) => { mt.emissiveIntensity = V.bitcoinEmissive[n.zone] * pulse * (n.flash > 0 ? 2 : 1); });
        n.glim.material.opacity = S.glimmer * 1.3 * pulse * (0.6 + 0.4 * n.hp);
      } else if (n.kind === 'silver') {
        const w = S.silverShimmerSpeed * this.clock + n.id;
        n.glim.material.opacity = S.silverShimmer * (0.55 + 0.45 * Math.sin(w) * Math.sin(w * 1.73 + 1));
      }
    }
    this.drawCrack();
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
  drawFog(L, lit) {
    const f = this.fog, c = S.fogCell, R = S.lightRadius * T, d = f.img.data, dim = lit ? S.fogVisited : S.fogVisitedLampOut;
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
    $('drop').onclick = () => { const p = this.bag.pop(); if (p) { Sound.tick(); this.say('Dropped ' + (p.kind === 'bitcoin' ? p.sats + ' sats' : '1 ' + p.kind), 1.5); } };
    $('recBtn').onclick = () => {
      const r = records.get();
      $('rShifts').textContent = r.shifts; $('rDeep').textContent = r.deepestLevel;
      $('rCaught').textContent = r.timesCaught; $('rPoints').textContent = r.totalPoints;
      $('rMinerals').textContent = mineralText(r.minerals || {}) || 'none';
      $('recMode').textContent = TEST ? '(test mode)' : '(live chain)';
      $('modeBtn').textContent = TEST ? 'Back to live chain' : 'Switch to test mode';
      $('records').style.display = 'flex'; this.overlay = true;
    };
    $('recClose').onclick = () => { $('records').style.display = 'none'; this.overlay = false; };
    $('modeBtn').onclick = () => { location.search = TEST ? '' : '?test'; };
    $('ovBtn').onclick = () => { $('overlay').style.display = 'none'; this.overlay = false; };
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
    this.set('oil', String(Math.ceil(this.oil)));
    const w = this.bagWeight();
    this.set('bagW', (+w.toFixed(1)) + '/' + S.bagCapacity);
    this.set('bagSats', String(this.bagSats()));
    this.set('bag', (mineralText(this.bagMinerals()) || 'no minerals') + (w >= S.bagCapacity ? ' · full' : ''));
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

loadAll().then((a) => new Game(a)).catch((e) => { $('loading').textContent = 'Could not load the 3D mine: ' + e.message; console.error(e); });
