// Bell and knock, made with Web Audio so there are no sound files to load.
(function () {
  let ctx = null;
  function ac() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function bell() {
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    [[660, 0.35], [1320, 0.18], [1980, 0.1], [2640, 0.06], [1667, 0.08]].forEach(([f, v]) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
      o.connect(g).connect(c.destination); o.start(t); o.stop(t + 3);
    });
  }
  function thud(at) {
    const c = ctx, t = at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.35);
    g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.55);
    const len = c.sampleRate * 0.25, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const n = c.createBufferSource(), f = c.createBiquadFilter(), ng = c.createGain();
    n.buffer = buf; f.type = 'lowpass'; f.frequency.value = 400; ng.gain.value = 0.7;
    n.connect(f).connect(ng).connect(c.destination); n.start(t);
  }
  function knock() {
    const c = ac(); if (!c) return;
    thud(c.currentTime); thud(c.currentTime + 0.32);
  }
  function tick() {
    const c = ac(); if (!c) return;
    const t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle'; o.frequency.value = 1400 + Math.random() * 400;
    g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.1);
  }
  window.Sound = { unlock: ac, bell, knock, tick };
})();
