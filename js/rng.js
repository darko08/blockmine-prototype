// Seeded randomness: the same block hash always gives the same mine.
(function () {
  function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }
  function sfc32(a, b, c, d) {
    return function () {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
      let t = (a + b) | 0;
      a = b ^ (b >>> 9); b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11); d = (d + 1) | 0;
      t = (t + d) | 0; c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    };
  }
  window.seededRandom = function (seed) {
    const s = xmur3(String(seed));
    const r = sfc32(s(), s(), s(), s());
    for (let i = 0; i < 12; i++) r();
    return r;
  };
  window.randomHash = function () {
    const b = new Uint8Array(32);
    crypto.getRandomValues(b);
    b[0] = 0; b[1] = 0; b[2] = 0; // looks like a block hash
    return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  };
})();
