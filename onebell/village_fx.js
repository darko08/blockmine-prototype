// ONE BELL: the daylight village's animation, all drawn in code over hill-day.png (no video, nothing generated).
// Waterfall, sun, clouds and their shadows, birds, waving flags, swaying pine tops, a light shimmer on the grass,
// the hatch's breathing glow and its bell swinging at each new block, and the workshops' smoke and fires.
// Kept gentle; "reduce motion" turns everything off except the waterfall.
// Positions are in the painting's pixels (1088 x 1920).
window.makeVillageFx = function (G) {
  'use strict';
  const { ctx, IMG_W } = G;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };

  const SUN = { x: 130, y: 120 };
  const WATER = { x0: 60, y0: 775, x1: 215, y1: 932 };          // the box around the falls and the stream below
  const FALL = { x0: 100, x1: 145, y0: 782, y1: 862 };           // the falling part
  const MIST = { x: 118, y: 862 };
  const HATCH = { x: 626, glowY: 1560, bell: { x0: 598, y0: 1404, x1: 656, y1: 1472, px: 626, py: 1398 } };
  const PINES = [[512, 355], [468, 405], [760, 430], [862, 420], [918, 425], [1044, 330], [968, 455], [602, 455], [55, 595], [150, 612], [228, 598], [345, 580]];
  const FLAGS = [[578, 493], [648, 488], [808, 492], [1008, 520], [207, 712], [447, 693], [553, 832], [822, 818], [903, 828],
    [80, 1035], [143, 1022], [295, 1008], [450, 1046], [688, 1069], [1020, 1078], [66, 1247], [133, 1226], [368, 1235],
    [433, 1263], [800, 1243], [935, 1225], [1040, 1270], [75, 1475], [338, 1455], [375, 1460], [820, 1475], [1043, 1462]];

  let built = false, waterMask = null, waterBuf = null, streaks = null, flagPatches = [], pinePatches = [], bellSprite = null, bellCover = null;
  let rays = null, sunGlow = null, clouds = [], cloudSprites = [], birds = [], nextBirdsAt = 0, swingAt = -1e9;

  // everything taken from the painting is prepared once, when it has loaded
  function build(img) {
    const src = mk(IMG_W, 1920), s = src.getContext('2d');
    s.drawImage(img, 0, 0);
    // the water's shape: its white and pale-blue pixels, softened
    const W = WATER, ww = W.x1 - W.x0, wh = W.y1 - W.y0;
    const d = s.getImageData(W.x0, W.y0, ww, wh), m = new ImageData(ww, wh);
    for (let i = 0; i < d.data.length; i += 4) {
      const r = d.data[i], g = d.data[i + 1], b = d.data[i + 2];
      const water = b > 150 && b >= r - 8 && g > 140 && (r + g + b) > 470;
      m.data[i] = m.data[i + 1] = m.data[i + 2] = 255; m.data[i + 3] = water ? 255 : 0;
    }
    waterMask = mk(ww, wh); waterMask.getContext('2d').putImageData(m, 0, 0);
    const soft = mk(ww, wh), sg = soft.getContext('2d'); sg.filter = 'blur(1.2px)'; sg.drawImage(waterMask, 0, 0); waterMask = soft;
    waterBuf = mk(ww, wh);
    // falling streaks: a tall strip of thin white lines, scrolled down and masked to the water
    streaks = mk(FALL.x1 - FALL.x0, 240); const st = streaks.getContext('2d');
    for (let i = 0; i < 46; i++) {
      const x = rnd(0, streaks.width), y = rnd(0, 240), h = rnd(14, 46);
      const gr = st.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      st.fillStyle = gr; st.fillRect(x, y, rnd(1, 2.4), h); st.fillRect(x, y - 240, rnd(1, 2.4), h);   // wraps
    }
    // flags: a copy of each, to draw waving over the painted one
    flagPatches = FLAGS.map(([x, y]) => { const c = mk(34, 26); c.getContext('2d').drawImage(src, x - 6, y - 13, 34, 26, 0, 0, 34, 26); return { x: x - 6, y: y - 13, c, ph: rnd(0, 6.28), sp: rnd(2.2, 3.2) }; });
    // pine tops: a patch above each top, bent a little at the top
    pinePatches = PINES.map(([x, y]) => { const c = mk(56, 80); c.getContext('2d').drawImage(src, x - 28, y - 10, 56, 80, 0, 0, 56, 80); return { x: x - 28, y: y - 10, c, ph: rnd(0, 6.28) }; });
    // the hatch bell: its bronze pixels as a sprite, and a patch of the stone beside it to cover the painted one
    const B = HATCH.bell, bw = B.x1 - B.x0, bh = B.y1 - B.y0, bd = s.getImageData(B.x0, B.y0, bw, bh);
    for (let i = 0; i < bd.data.length; i += 4) {
      const r = bd.data[i], g = bd.data[i + 1], b = bd.data[i + 2];
      if (!(r > b + 28 && r > 70)) bd.data[i + 3] = 0;   // bronze: warm; the stone wall behind is grey
    }
    bellSprite = mk(bw, bh); bellSprite.getContext('2d').putImageData(bd, 0, 0);
    bellCover = mk(bw, bh); const bc = bellCover.getContext('2d');
    bc.drawImage(src, B.x0 - bw - 6, B.y0, bw, bh, 0, 0, bw, bh);   // the wall just left of the bell
    // sun: rays and glow, pre-rendered
    rays = mk(520, 520); const rg = rays.getContext('2d'); rg.translate(260, 260);
    for (let i = 0; i < 14; i++) {
      rg.rotate(Math.PI * 2 / 14);
      const gr = rg.createLinearGradient(0, 0, 250, 0); gr.addColorStop(0, 'rgba(255,248,210,.5)'); gr.addColorStop(1, 'rgba(255,248,210,0)');
      rg.fillStyle = gr; rg.beginPath(); rg.moveTo(30, -5); rg.lineTo(250, -16); rg.lineTo(250, 16); rg.lineTo(30, 5); rg.closePath(); rg.fill();
    }
    sunGlow = mk(300, 300); const gg = sunGlow.getContext('2d'), gl = gg.createRadialGradient(150, 150, 0, 150, 150, 150);
    gl.addColorStop(0, 'rgba(255,255,235,.9)'); gl.addColorStop(0.25, 'rgba(255,246,200,.45)'); gl.addColorStop(1, 'rgba(255,240,190,0)');
    gg.fillStyle = gl; gg.fillRect(0, 0, 300, 300);
    // clouds: soft white puffs, drawn once each
    for (let k = 0; k < 3; k++) {
      const c = mk(360, 150), cg = c.getContext('2d');
      for (let i = 0; i < 14; i++) {
        const x = rnd(60, 300), y = rnd(60, 100) - Math.sin((x - 60) / 240 * Math.PI) * 30, r = rnd(28, 52);
        const g2 = cg.createRadialGradient(x, y, 0, x, y, r); g2.addColorStop(0, 'rgba(255,255,255,.95)'); g2.addColorStop(0.7, 'rgba(255,255,255,.6)'); g2.addColorStop(1, 'rgba(255,255,255,0)');
        cg.fillStyle = g2; cg.fillRect(x - r, y - r, r * 2, r * 2);
      }
      cloudSprites.push(c);
    }
    clouds = [0, 1, 2].map((k) => ({ s: k, x: rnd(-200, IMG_W), y: [70, 210, 330][k], sp: rnd(5, 9), sc: [0.9, 0.7, 0.55][k] }));
    built = true;
  }

  // ---- drawing (each frame) ---------------------------------------------------------------------------------------------
  // under: what goes on the painting, under the buildings and the interface
  function under(t, img, reduce) {
    if (!built) { if (G.ready(img)) build(img); else return; }
    const T = t / 1000;
    if (!reduce) {
      // clouds drifting, and their faint shadows sliding over the hill
      for (const c of clouds) {
        c.x += c.sp * G.dt; if (c.x > IMG_W + 40) { c.x = -380; c.y = c.y; }
        ctx.save(); ctx.globalAlpha = 0.85; ctx.drawImage(cloudSprites[c.s], c.x, c.y, 360 * c.sc, 150 * c.sc); ctx.restore();
        const sx = c.x * 1.1 + 120, sy = 700 + c.s * 330;
        ctx.save(); ctx.globalAlpha = 0.07; ctx.fillStyle = '#1a2a10';
        ctx.beginPath(); ctx.ellipse(sx + 130 * c.sc, sy, 210 * c.sc, 70 * c.sc, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
      // birds crossing now and then, in a gentle arc
      if (t > nextBirdsAt) {
        const n = 2 + Math.floor(Math.random() * 3), dir = Math.random() < 0.5 ? 1 : -1, y = rnd(300, 430);
        for (let i = 0; i < n; i++) birds.push({ at: t + i * rnd(250, 600), dur: rnd(14000, 19000), dir, y: y + rnd(-25, 25), arc: rnd(30, 70), off: i * rnd(20, 40), ph: rnd(0, 6) });
        nextBirdsAt = t + rnd(16000, 30000);
      }
      birds = birds.filter((b) => t < b.at + b.dur);
      ctx.save(); ctx.strokeStyle = 'rgba(40,40,50,.8)'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
      for (const b of birds) {
        const a = (t - b.at) / b.dur; if (a < 0) continue;
        const x = b.dir > 0 ? -60 + a * (IMG_W + 120) - b.off : IMG_W + 60 - a * (IMG_W + 120) + b.off, y = b.y - Math.sin(a * Math.PI) * b.arc;
        const f = Math.sin(T * 9 + b.ph) * 6;
        ctx.beginPath(); ctx.moveTo(x - 11, y - f); ctx.quadraticCurveTo(x - 5, y - 4, x, y); ctx.quadraticCurveTo(x + 5, y - 4, x + 11, y - f); ctx.stroke();
      }
      ctx.restore();
      // pine tops sway a very little
      for (const p of pinePatches) {
        const sw = Math.sin(T * 0.8 + p.ph) * 1.6;
        for (let y = 0; y < 80; y += 8) { const k = 1 - y / 80, dx = sw * k * k; ctx.drawImage(p.c, 0, y, 56, 8, p.x + dx, p.y + y, 56, 8); }
      }
      // flags wave
      for (const f of flagPatches) {
        for (let x = 0; x < 34; x += 3) { const k = Math.max(0, (x - 6) / 28), dy = Math.sin(T * f.sp + f.ph - x * 0.25) * 2.2 * k; ctx.drawImage(f.c, x, 0, 3, 26, f.x + x, f.y + dy, 3, 26); }
      }
      // a slow shimmer of light across the grass and flowers
      const sh = ((T * 18) % 1700) - 300;
      ctx.save(); ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = 0.35;
      const gr = ctx.createLinearGradient(sh - 260, 0, sh + 260, 0); gr.addColorStop(0, 'rgba(255,255,220,0)'); gr.addColorStop(0.5, 'rgba(255,255,220,.8)'); gr.addColorStop(1, 'rgba(255,255,220,0)');
      ctx.fillStyle = gr; ctx.fillRect(sh - 260, 560, 520, 1100); ctx.restore();
    }
    // the waterfall: white streaks running down, masked to the water; mist at its foot; glints on the stream
    const W = WATER, wb = waterBuf.getContext('2d');
    wb.globalCompositeOperation = 'source-over'; wb.clearRect(0, 0, waterBuf.width, waterBuf.height);
    const off = (T * 90) % 240;
    wb.globalAlpha = 0.75; wb.drawImage(streaks, FALL.x0 - W.x0, FALL.y0 - W.y0 - 240 + off); wb.drawImage(streaks, FALL.x0 - W.x0, FALL.y0 - W.y0 + off);
    wb.globalAlpha = 1;
    for (let i = 0; i < 7; i++) {   // glints drifting along the stream
      const a = ((T * 0.35 + i / 7) % 1), x = 62 + a * 140 + Math.sin(i * 7) * 8, y = 862 + a * 50 + Math.sin(i * 3) * 6;
      const tw = Math.max(0, Math.sin(T * 5 + i * 2)); if (tw < 0.1) continue;
      wb.fillStyle = 'rgba(255,255,255,' + 0.9 * tw + ')'; wb.fillRect(x - W.x0 - 2, y - W.y0 - 0.8, 5, 1.6);
    }
    wb.globalCompositeOperation = 'destination-in'; wb.drawImage(waterMask, 0, 0);
    ctx.drawImage(waterBuf, W.x0, W.y0);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const r = 26 + 6 * Math.sin(T * 1.3 + i * 2), x = MIST.x + (i - 1) * 16, y = MIST.y - 4 + Math.sin(T * 0.9 + i) * 3;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(255,255,255,.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.restore();

    // the hatch: its amber glow breathes; the bell swings a little at each new block
    if (!reduce) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.18 + 0.1 * Math.sin(T * 0.8);
      const g = ctx.createRadialGradient(HATCH.x, HATCH.glowY, 0, HATCH.x, HATCH.glowY, 120); g.addColorStop(0, 'rgba(255,190,90,1)'); g.addColorStop(1, 'rgba(255,150,40,0)');
      ctx.fillStyle = g; ctx.fillRect(HATCH.x - 120, HATCH.glowY - 120, 240, 240); ctx.restore();
      const sa = (t - swingAt) / 1000;
      if (sa >= 0 && sa < 5) {
        const B = HATCH.bell, ang = Math.sin(sa * 5.2) * 0.22 * Math.exp(-sa * 0.75);
        ctx.drawImage(bellCover, B.x0, B.y0);
        ctx.save(); ctx.translate(B.px, B.py); ctx.rotate(ang); ctx.drawImage(bellSprite, B.x0 - B.px, B.y0 - B.py); ctx.restore();
      }
    }
  }

  // a workshop on its plot: smoke from the chimney while working; its fire flickers while working and dims when idle
  // g: where the building is drawn ({x, y, w, h}); marks: fractions of the sprite; working: true/false
  const smoke = new Map();
  function workshop(id, g, marks, working, t, reduce) {
    if (!marks) return;
    const T = t / 1000;
    if (marks.fire) {
      const fx = g.x + marks.fire[0] * g.w, fy = g.y + marks.fire[1] * g.h, r = g.w * 0.12;
      ctx.save();
      if (working) {
        const fl = reduce ? 0.8 : 0.7 + 0.18 * Math.sin(T * 13) + 0.12 * Math.sin(T * 7.3 + 1);
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 * fl;
        const gr = ctx.createRadialGradient(fx, fy, 0, fx, fy, r * 1.8); gr.addColorStop(0, 'rgba(255,200,90,1)'); gr.addColorStop(1, 'rgba(255,120,30,0)');
        ctx.fillStyle = gr; ctx.fillRect(fx - r * 2, fy - r * 2, r * 4, r * 4);
      } else {   // idle: the fire is banked low
        ctx.globalAlpha = 0.55;
        const gr = ctx.createRadialGradient(fx, fy, 0, fx, fy, r); gr.addColorStop(0, 'rgba(40,18,6,.95)'); gr.addColorStop(1, 'rgba(40,18,6,0)');
        ctx.fillStyle = gr; ctx.fillRect(fx - r, fy - r, r * 2, r * 2);
      }
      ctx.restore();
    }
    if (marks.chimney && working && !reduce) {
      const cx = g.x + marks.chimney[0] * g.w, cy = g.y + marks.chimney[1] * g.h;
      let s = smoke.get(id); if (!s) { s = { puffs: [], next: 0 }; smoke.set(id, s); }
      if (t > s.next) { s.puffs.push({ at: t, dx: rnd(-3, 3), r0: rnd(7, 10) }); s.next = t + rnd(380, 620); }
      s.puffs = s.puffs.filter((p) => t - p.at < 3200);
      ctx.save();
      for (const p of s.puffs) {
        const a = (t - p.at) / 3200, x = cx + p.dx + Math.sin(a * 3 + p.dx) * 8 + a * 26, y = cy - 6 - a * 120, r = p.r0 + 4 + a * 30;
        ctx.globalAlpha = 0.9 * (1 - a) * Math.min(1, a * 5);
        const gr = ctx.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(178,174,170,.95)'); gr.addColorStop(0.55, 'rgba(170,166,162,.6)'); gr.addColorStop(1, 'rgba(165,160,155,0)');
        ctx.fillStyle = gr; ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      ctx.restore();
    } else if (smoke.has(id) && !working) smoke.delete(id);
  }

  // the sun, drawn by the village over the top band and under the counters: a slow pulse and very slowly turning
  // faint rays that reach down past the band onto the sky (still, when motion is reduced)
  function sun(t, reduce) {
    if (!built) return;
    const T = reduce ? 0 : t / 1000;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.24 + 0.06 * Math.sin(T * 0.9);
    ctx.translate(SUN.x, SUN.y); ctx.rotate(T * 0.02); ctx.drawImage(rays, -260 * 1.35, -260 * 1.35, 520 * 1.35, 520 * 1.35); ctx.rotate(-T * 0.02);
    ctx.globalAlpha = 0.5 + 0.12 * Math.sin(T * 0.9); const k = 1 + 0.05 * Math.sin(T * 0.9); ctx.drawImage(sunGlow, -150 * k, -150 * k, 300 * k, 300 * k);
    ctx.restore();
  }
  function newBlock(t) { swingAt = t; }
  return { under, sun, workshop, newBlock };
};
