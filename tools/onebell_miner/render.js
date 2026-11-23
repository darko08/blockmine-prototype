// Renders One Bell's miner sprite sheets from the 3D models (see render.html) and writes them to onebell/assets/miner.
// Usage (from the repo root): node tools/onebell_miner/render.js   (needs Playwright with Chromium, and Python for the server)
// Each sheet has a body layer (<name>.png) and a sack layer (<name>_bag.png) that the game draws over it and shrinks
// as the bag empties. swing_left is swing_right mirrored. The model has no stumble animation, so no "caught" sheet.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');

(async () => {
  const root = path.resolve(__dirname, '../..'), outDir = path.join(root, 'onebell/assets/miner'), port = 8799;
  const server = spawn('python3', ['-m', 'http.server', String(port)], { cwd: root, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  const px = process.env.HTTPS_PROXY || process.env.https_proxy;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'], ...(px ? { proxy: { server: px, bypass: 'localhost,127.0.0.1' } } : {}) });
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.log('page error:', e.message));
    await page.goto(`http://localhost:${port}/tools/onebell_miner/render.html`);
    await page.waitForFunction(() => window.__result, null, { timeout: 180000 });
    const res = await page.evaluate(() => window.__result);
    // the left swing is the right one mirrored, frame by frame
    const mirror = (src) => page.evaluate((src) => new Promise((ok) => {
      const i = new Image(); i.onload = () => {
        const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const g = c.getContext('2d');
        const n = 12, w = i.width / n;
        for (let f = 0; f < n; f++) { g.save(); g.translate(f * w + w, 0); g.scale(-1, 1); g.drawImage(i, f * w, 0, w, i.height, 0, 0, w, i.height); g.restore(); }
        ok(c.toDataURL('image/png'));
      }; i.src = src;
    }), src);
    res.out.swing_left = await mirror(res.out.swing_right);
    res.out.swing_left_bag = await mirror(res.out.swing_right_bag);
    const R = res.meta.sheets.swing_right, S = res.meta.size, flip = ([x, y]) => [+(S - x).toFixed(1), y];
    res.meta.sheets.swing_left = { ...R, mirrored: 'swing_right', frames: R.frames.map((f) => ({ lhand: flip(f.rhand), rhand: flip(f.lhand), lamp: flip(f.lamp), bag: flip(f.bag), head: flip(f.head) })) };
    res.meta.missing = ['caught: the model has no stumble animation (its clips are ' + res.clips.join(', ') + ')'];
    fs.mkdirSync(outDir, { recursive: true });
    for (const f of fs.readdirSync(outDir)) if (f.endsWith('.png')) fs.unlinkSync(path.join(outDir, f));
    for (const [k, d] of Object.entries(res.out)) fs.writeFileSync(path.join(outDir, k + '.png'), Buffer.from(d.split(',')[1], 'base64'));
    fs.writeFileSync(path.join(outDir, 'miner.json'), JSON.stringify(res.meta, null, 1));
    console.log('clips on the model:', res.clips.join(', '));
    console.log('wrote', Object.keys(res.out).map((k) => k + '.png').join(', '), '+ miner.json to', outDir);
  } finally { await browser.close(); server.kill(); }
})();
