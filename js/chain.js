// The timer: real Bitcoin blocks from mempool.space, or simulated ones in test mode.
// onBlock({hash, height, initial, missed, arrivedAt, prevOpenMs})
// arrivedAt: ms timestamp the block arrived; prevOpenMs: how long the block before it stayed open (null if unknown)  onStatus('live' | 'lost' | 'connecting')
(function () {
  const S = window.SETTINGS;

  function LiveChain(onBlock, onStatus) {
    let ws = null, height = -1, lastMsg = 0, status = '', retry = null, lastArrival = null;
    const set = (s) => { if (s !== status) { status = s; onStatus(s); } };

    // the latest blocks with their timestamps (the block's own clock, set by whoever mined it)
    async function tip() {
      const r = await fetch(S.mempoolApi + '/blocks', { cache: 'no-store' });
      if (!r.ok) throw 0;
      const list = (await r.json()).sort((a, b) => b.height - a.height);
      const top = list[0], prev = list[1];
      return { height: top.height, hash: top.id, timestamp: top.timestamp, prevTimestamp: prev && prev.height === top.height - 1 ? prev.timestamp : null };
    }
    // live: arrival = the moment the feed delivered it. Fetched on (re)connect: the block's timestamp.
    function take(b, missed, live) {
      if (!b || !b.hash || !(b.height > height)) return;
      const initial = height < 0, now = Date.now();
      const stamped = b.timestamp ? Math.min(now, b.timestamp * 1000) : now;
      const arrivedAt = live ? now : stamped;
      let prevOpenMs = null;
      if (live && lastArrival && b.height === height + 1) prevOpenMs = arrivedAt - lastArrival;
      else if (b.timestamp && b.prevTimestamp) prevOpenMs = Math.max(0, (b.timestamp - b.prevTimestamp) * 1000);
      height = b.height; lastArrival = arrivedAt;
      onBlock({ hash: b.hash, height: b.height, initial, missed: !initial && missed, arrivedAt, prevOpenMs });
    }
    async function connect() {
      clearTimeout(retry);
      set('connecting');
      try {
        const t = await tip();
        take(t, true);          // a block that came while the feed was down is "missed", never a catch
      } catch (e) { return lose(); }
      try { ws = new WebSocket(S.mempoolSocket); } catch (e) { return lose(); }
      ws.onopen = () => {
        lastMsg = Date.now();
        ws.send(JSON.stringify({ action: 'want', data: ['blocks', 'stats'] }));
        set('live');
      };
      ws.onmessage = (ev) => {
        lastMsg = Date.now();
        if (status !== 'live') set('live');
        let d; try { d = JSON.parse(ev.data); } catch (e) { return; }
        if (d.block) {
          const b = d.block;
          take({ hash: b.id, height: b.height, timestamp: b.timestamp, prevTimestamp: null }, false, true);
        }
        if (Array.isArray(d.blocks) && d.blocks.length) {
          const sorted = d.blocks.slice().sort((a, b) => b.height - a.height), top = sorted[0], prev = sorted[1];
          take({ hash: top.id, height: top.height, timestamp: top.timestamp, prevTimestamp: prev && prev.height === top.height - 1 ? prev.timestamp : null }, true, false);
        }
      };
      ws.onclose = ws.onerror = () => lose();
    }
    function lose() {
      if (ws) { ws.onclose = ws.onerror = ws.onmessage = null; try { ws.close(); } catch (e) {} ws = null; }
      set('lost');
      clearTimeout(retry);
      retry = setTimeout(connect, S.feedReconnectSeconds * 1000);
    }
    setInterval(() => {
      if (status === 'live' && Date.now() - lastMsg > S.feedStaleSeconds * 1000) lose();
    }, 2000);
    window.addEventListener('online', () => { if (status === 'lost') connect(); });
    connect();
  }

  // test mode keeps its own clock, which runs at the game speed chosen on the slider (window.TestClock.speed)
  const TestClock = window.TestClock = { t: Date.now(), speed: 1, now() { return this.t; } };

  function TestChain(onBlock, onStatus) {
    let height = 900000, last = TestClock.now(), due = 0, real = performance.now();
    onStatus('live');
    function next() {
      // same randomness as the real chain: arrivals are exponential (memoryless), here with a 1-minute mean
      due = TestClock.now() - Math.log(1 - Math.random()) * S.testBlockSeconds * 1000;
    }
    setInterval(() => {
      const n = performance.now(); TestClock.t += (n - real) * TestClock.speed; real = n;
      if (TestClock.now() >= due) {
        const now = TestClock.now(), prevOpenMs = now - last; last = now;
        onBlock({ hash: randomHash(), height: ++height, initial: false, missed: false, arrivedAt: now, prevOpenMs });
        next();
      }
    }, 50);
    onBlock({ hash: randomHash(), height, initial: true, missed: false, arrivedAt: last, prevOpenMs: null });
    next();
  }

  window.startChain = function (test, onBlock, onStatus) {
    return test ? TestChain(onBlock, onStatus) : LiveChain(onBlock, onStatus);
  };
})();
