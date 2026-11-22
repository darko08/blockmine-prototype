// BLOCKMINE shared-shaft server. Node 22+ only, no packages.
//   node server3d/server.js [--port=5300] [--data=server3d/data] [--test-blocks=60] [--speed=1] [--static=.]
// Live: blocks come from mempool.space (WebSocket, with the REST tip as a fallback). --test-blocks=N: simulated blocks,
// N seconds apart on average. Serves the game's files too (--static), so one address is enough to play.
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { accept } = require('./ws.js');
const { Shaft, S } = require('./shaft.js');

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const PORT = +arg('port', 5300), DATA = path.resolve(arg('data', path.join(__dirname, 'data'))), TEST = +arg('test-blocks', 0);
const SPEED = +arg('speed', 1), STATIC = arg('static', path.join(__dirname, '..'));

// ---------- the store: one JSON file, written whole and atomically ----------
function Store(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'shaft.json');
  let data = {}; try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {}
  let dirty = false;
  return {
    get: (k) => data[k], set: (k, v) => { data[k] = v; dirty = true; },
    flush() { if (!dirty) return; const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(data)); fs.renameSync(tmp, file); dirty = false; },
  };
}
const store = Store(DATA);
const shaft = new Shaft(store, { speed: SPEED });

// ---------- blocks ----------
function testBlocks() {
  let height = 900000;
  const next = () => {
    shaft.onBlock({ height: height++, hash: crypto.randomBytes(32).toString('hex') });
    setTimeout(next, (-Math.log(1 - Math.random()) * TEST * 1000) / SPEED);
  };
  next();
}
function liveBlocks() {
  let ws = null, last = 0;
  const tip = async () => {
    try {
      const r = await fetch(S.mempoolApi + '/blocks', { cache: 'no-store' });
      const top = (await r.json()).sort((a, b) => b.height - a.height)[0];
      if (top) shaft.onBlock({ height: top.height, hash: top.id });
    } catch (e) {}
  };
  const connect = () => {
    try { ws = new WebSocket(S.mempoolSocket); } catch (e) { return setTimeout(connect, 10000); }
    ws.onopen = () => { last = Date.now(); ws.send(JSON.stringify({ action: 'want', data: ['blocks'] })); };
    ws.onmessage = (ev) => {
      last = Date.now();
      let d; try { d = JSON.parse(ev.data); } catch (e) { return; }
      if (d.block) shaft.onBlock({ height: d.block.height, hash: d.block.id });
    };
    ws.onclose = ws.onerror = () => { ws = null; setTimeout(connect, 5000); };
  };
  tip(); connect();
  setInterval(tip, 30000);   // the slower path, in case the socket misses one
  setInterval(() => { if (ws && Date.now() - last > 120000) try { ws.close(); } catch (e) {} }, 10000);
}
if (TEST > 0) testBlocks(); else liveBlocks();

// ---------- the world clock ----------
let prev = process.hrtime.bigint();
setInterval(() => { const now = process.hrtime.bigint(); shaft.tick(Number(now - prev) / 1e9); prev = now; }, 50);

// ---------- HTTP: health, fairness proofs, the game's files ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/health') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(shaft.health())); }
  if (!STATIC) { res.writeHead(404); return res.end(); }
  let file = path.normalize(path.join(STATIC, decodeURIComponent(url.pathname)));
  if (!file.startsWith(path.resolve(STATIC)) || /[\\/](\.git|server3d[\\/]data|art-source|sim3d)([\\/]|$)/.test(file)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (e, st) => {
    if (!e && st.isDirectory()) file = path.join(file, 'index.html');
    fs.readFile(file, (e2, buf) => {
      if (e2) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(buf);
    });
  });
});
server.on('upgrade', (req, socket) => {
  if (new URL(req.url, 'http://x').pathname !== '/ws') return socket.destroy();
  accept(req, socket, (conn) => {
    conn.onmessage = (msg) => shaft.message(conn, msg);
    conn.onclose = () => shaft.leave(conn);
  });
});
server.listen(PORT, '127.0.0.1', () => console.log(`BLOCKMINE shaft on http://127.0.0.1:${PORT} · ${TEST ? 'test blocks every ~' + TEST + ' s' : 'live blocks'} · data ${DATA}`));
const bye = () => { shaft.save(); process.exit(0); };
process.on('SIGINT', bye); process.on('SIGTERM', bye);
