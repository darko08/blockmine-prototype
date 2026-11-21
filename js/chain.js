// The timer: real Bitcoin blocks from mempool.space, or simulated ones in test mode.
// onBlock({hash, height, initial, missed})  onStatus('live' | 'lost' | 'connecting')
(function () {
  const S = window.SETTINGS;

  function LiveChain(onBlock, onStatus) {
    let ws = null, height = -1, lastMsg = 0, status = '', retry = null;
    const set = (s) => { if (s !== status) { status = s; onStatus(s); } };

    async function tip() {
      const [h, hash] = await Promise.all([
        fetch(S.mempoolApi + '/blocks/tip/height', { cache: 'no-store' }).then((r) => { if (!r.ok) throw 0; return r.text(); }),
        fetch(S.mempoolApi + '/blocks/tip/hash', { cache: 'no-store' }).then((r) => { if (!r.ok) throw 0; return r.text(); }),
      ]);
      return { height: parseInt(h, 10), hash: hash.trim() };
    }
    function take(b, missed) {
      if (!b || !b.hash || !(b.height > height)) return;
      const initial = height < 0;
      height = b.height;
      onBlock({ hash: b.hash, height: b.height, initial, missed: !initial && missed });
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
        if (d.block) take({ hash: d.block.id, height: d.block.height }, false);
        if (Array.isArray(d.blocks) && d.blocks.length) {
          const top = d.blocks.reduce((a, b) => (b.height > a.height ? b : a));
          take({ hash: top.id, height: top.height }, true);
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

  function TestChain(onBlock, onStatus) {
    let height = 900000;
    onStatus('live');
    function next() {
      // same randomness as the real chain: arrivals are exponential (memoryless), here with a 1-minute mean
      const wait = -Math.log(1 - Math.random()) * S.testBlockSeconds * 1000;
      setTimeout(() => { onBlock({ hash: randomHash(), height: ++height, initial: false, missed: false }); next(); }, wait);
    }
    onBlock({ hash: randomHash(), height, initial: true, missed: false });
    next();
  }

  window.startChain = function (test, onBlock, onStatus) {
    return test ? TestChain(onBlock, onStatus) : LiveChain(onBlock, onStatus);
  };
})();
