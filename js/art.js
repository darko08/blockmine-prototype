// Art loading and the few textures the game draws for itself (light, glow, sparks, stand-in crystals).
(function () {
  const S = window.SETTINGS;

  window.Art = {
    preload(scene) {
      const v = (p) => p + (S.artVersion ? '?v=' + S.artVersion : '');
      for (const [key, path] of Object.entries(S.art)) {
        if (key === 'crystals') continue;
        if (path) scene.load.image(key, v(path));
      }
      (S.art.crystals || []).forEach((p, i) => scene.load.image('crystal' + i, v(p)));
    },

    make(scene) {
      const tex = scene.textures;
      const canvas = (key, size, draw) => {
        if (tex.exists(key)) return;
        const t = tex.createCanvas(key, size, size), c = t.getContext();
        draw(c, size); t.refresh();
      };
      // darkness with a soft hole in the middle: hole radius = size/4
      canvas('darkHole', 256, (c, n) => {
        c.fillStyle = '#000'; c.fillRect(0, 0, n, n);
        c.globalCompositeOperation = 'destination-out';
        const g = c.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 4);
        g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.5, 'rgba(0,0,0,0.97)');
        g.addColorStop(0.8, 'rgba(0,0,0,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.fillRect(0, 0, n, n);
      });
      canvas('glow', 128, (c, n) => {
        const g = c.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
        g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.fillRect(0, 0, n, n);
      });
      canvas('dot', 16, (c, n) => {
        const g = c.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
        g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.fillRect(0, 0, n, n);
      });
      // stand-in crystals until a crystal sheet arrives: one cluster per level, richer deeper
      for (let k = 0; k < 4; k++) {
        if (tex.exists('crystal' + k)) continue;
        canvas('crystal' + k, 128, (c, n) => {
          const rng = seededRandom('crystal' + k), shards = 3 + k;
          const hue = [38, 34, 30, 26][k];
          for (let i = 0; i < shards; i++) {
            const ang = -Math.PI / 2 + (rng() - 0.5) * 1.9, len = n * (0.22 + 0.2 * rng()) * (1 + k * 0.08), w = n * (0.06 + 0.04 * rng());
            c.save(); c.translate(n / 2 + (rng() - 0.5) * n * 0.2, n * 0.62 + (rng() - 0.5) * n * 0.1); c.rotate(ang + Math.PI / 2);
            const g = c.createLinearGradient(-w, 0, w, 0);
            g.addColorStop(0, `hsl(${hue},85%,${22 + k * 3}%)`); g.addColorStop(0.45, `hsl(${hue + 6},100%,${58 + k * 4}%)`); g.addColorStop(1, `hsl(${hue},80%,${30 + k * 3}%)`);
            c.fillStyle = g; c.strokeStyle = 'rgba(40,20,0,0.85)'; c.lineWidth = 2;
            c.beginPath(); c.moveTo(-w, 0); c.lineTo(-w, -len); c.lineTo(0, -len - w * 1.6); c.lineTo(w, -len); c.lineTo(w, 0); c.closePath();
            c.fill(); c.stroke();
            c.fillStyle = 'rgba(255,245,210,0.55)'; c.fillRect(-w * 0.15, -len * 0.95, w * 0.3, len * 0.8);
            c.restore();
          }
        });
      }
    },
  };
})();
