// The cutaway mine: laid out from the block hash, plus the walking routes through it.
// Levels: -1 is the surface by the hatch, 0..11 are the 12 tunnels. Ladder 0 is the shaft from the hatch to level 0.
// A place in the mine is {kind:'level', l, x} (standing on a tunnel floor) or {kind:'ladder', k, y} (on a ladder).
(function (root) {
  const randInt = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));

  function geometry(S) {
    const T = S.tile;
    return {
      T,
      colX: (c) => c * T + T / 2,
      floorY: (l) => (l < 0 ? 0 : (l + 1) * S.levelSpacing * T),
      ceilY: (l) => (l + 1) * S.levelSpacing * T - S.tunnelHeight * T,
      zone: (l) => Math.min(3, Math.floor(l / S.zoneLevels)),
    };
  }

  // ---------- layout ----------
  function generate(hash, S) {
    const rng = seededRandom(hash), G = geometry(S), T = S.tile;
    const c0 = Math.floor(S.cols / 2) + randInt(rng, -4, 4);
    const surface = { a: c0 - S.surfaceWidth, b: c0 + S.surfaceWidth };
    const levels = [], ladders = [{ c: c0, top: -1, bottom: 0 }];
    let entry = [c0];
    for (let l = 0; l < S.levels; l++) {
      const lo = Math.min(...entry), hi = Math.max(...entry);
      let a = Math.max(1, lo - randInt(rng, S.tunnelReach[0], S.tunnelReach[1]));
      let b = Math.min(S.cols - 2, hi + randInt(rng, S.tunnelReach[0], S.tunnelReach[1]));
      while (b - a + 1 < S.tunnelMinLength) { if (a > 1) a--; if (b - a + 1 < S.tunnelMinLength && b < S.cols - 2) b++; }
      levels.push({ a, b });
      if (l === S.levels - 1) break;
      // ladders down: away from where you came in, so every level means a walk
      const pick = (avoid, gap) => {
        let best = null;
        for (let t = 0; t < 14; t++) {
          const c = randInt(rng, a + 1, b - 1);
          if (avoid.every((v) => Math.abs(v - c) >= gap)) return c;
          if (best === null) best = c;
        }
        return best;
      };
      const first = pick(entry, 3), next = [first];
      if (rng() < S.secondLadderChance && b - a >= 10) {
        const second = pick([first, ...entry], 5);
        if (Math.abs(second - first) >= 5) next.push(second);
      }
      next.forEach((c) => ladders.push({ c, top: l, bottom: l + 1 }));
      entry = next;
    }
    const mine = { hash, c0, surface, levels, ladders, G, S };
    mine.nodeRng = rng;                 // the same stream carries on into the ore layout
    return mine;
  }

  // walkable x range of a level (surface included)
  function span(mine, l) {
    const T = mine.S.tile, seg = l < 0 ? mine.surface : mine.levels[l];
    return [seg.a * T + T * 0.3, (seg.b + 1) * T - T * 0.3];
  }

  // ---------- ore ----------
  function makeNode(mine, rng, l) {
    const S = mine.S, G = mine.G, T = S.tile, seg = mine.levels[l], zone = G.zone(l);
    const nodes = mine.nodes || (mine.nodes = []);
    const here = nodes.filter((n) => n.l === l);
    const inLadders = mine.ladders.filter((d) => d.bottom === l).map((d) => d.c);   // these come down through the ceiling
    for (let tries = 0; tries < 16; tries++) {
      const onEnd = rng() < 0.3, rich = rng() < S.richChance, crack = rng() * Math.PI, jitter = rng() - 0.5;
      let n;
      if (onEnd) {
        const side = rng() < 0.5 ? -1 : 1;
        if (here.some((m) => m.kind === 'end' && m.side === side)) continue;
        const x = side < 0 ? seg.a * T : (seg.b + 1) * T;
        n = { kind: 'end', side, col: side < 0 ? seg.a : seg.b, x, y: G.floorY(l) - S.tunnelHeight * T * (0.45 + jitter * 0.3), standX: x - side * T * 0.45 };
      } else {
        const col = randInt(rng, seg.a, seg.b);
        if (inLadders.some((c) => Math.abs(c - col) <= 1)) continue;
        if (here.some((m) => m.kind === 'ceil' && Math.abs(m.col - col) <= 1)) continue;
        const x = G.colX(col) + jitter * T * 0.5;
        n = { kind: 'ceil', side: 0, col, x, y: G.ceilY(l) + 4, standX: Math.min(span(mine, l)[1], Math.max(span(mine, l)[0], x)) };
      }
      Object.assign(n, {
        id: (mine.nextId = (mine.nextId || 0) + 1), l, zone, rich, crack, hp: 1, flash: 0,
        value: S.zoneValue[zone] * (rich ? S.richMultiplier : 1), weight: S.zoneWeight[zone], r: S.oreRadius * (rich ? 1.25 : 1),
      });
      nodes.push(n);
      return n;
    }
    return null;
  }
  function layoutNodes(mine) {
    mine.nodes = [];
    for (let l = 0; l < mine.S.levels; l++) for (let i = 0; i < mine.S.nodesPerLevel; i++) makeNode(mine, mine.nodeRng, l);
    return mine.nodes;
  }

  // ---------- routes ----------
  function point(mine, loc) {
    if (loc.kind === 'level') return { x: loc.x, y: mine.G.floorY(loc.l) };
    return { x: mine.G.colX(mine.ladders[loc.k].c), y: loc.y };
  }
  // speeds: {walk, up, down} in world units per second
  function route(mine, from, to, sp) {
    const G = mine.G, V = [];
    const add = (loc, l, k) => { const p = point(mine, loc); V.push({ loc, l, k, x: p.x, y: p.y }); };
    add(from, from.kind === 'level' ? from.l : null, from.kind === 'ladder' ? from.k : null);
    add(to, to.kind === 'level' ? to.l : null, to.kind === 'ladder' ? to.k : null);
    mine.ladders.forEach((d, k) => {
      V.push({ loc: { kind: 'level', l: d.top, x: G.colX(d.c) }, l: d.top, k, x: G.colX(d.c), y: G.floorY(d.top) });
      V.push({ loc: { kind: 'level', l: d.bottom, x: G.colX(d.c) }, l: d.bottom, k, x: G.colX(d.c), y: G.floorY(d.bottom) });
    });
    const edge = (u, v) => {
      if (u.l !== null && u.l === v.l) return { t: Math.abs(u.x - v.x) / sp.walk, ctx: { kind: 'level', l: u.l } };
      if (u.k !== null && u.k === v.k) { const dy = v.y - u.y; return { t: dy < 0 ? -dy / sp.up : dy / sp.down, ctx: { kind: 'ladder', k: u.k } }; }
      return null;
    };
    const n = V.length, dist = new Array(n).fill(Infinity), prev = new Array(n).fill(-1), done = new Array(n).fill(false);
    dist[0] = 0;
    for (;;) {
      let u = -1;
      for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0 || u === 1) break;
      done[u] = true;
      for (let v = 0; v < n; v++) {
        if (done[v]) continue;
        const e = edge(V[u], V[v]);
        if (e && dist[u] + e.t < dist[v]) { dist[v] = dist[u] + e.t; prev[v] = u; }
      }
    }
    if (dist[1] === Infinity) return null;
    const steps = [];
    for (let v = 1; v !== 0; v = prev[v]) steps.unshift({ x: V[v].x, y: V[v].y, loc: V[v].loc, ctx: edge(V[prev[v]], V[v]).ctx });
    return { time: dist[1], steps };
  }

  // the walkable place nearest a point you tapped
  function nearest(mine, wx, wy) {
    const G = mine.G, T = mine.S.tile, H = mine.S.tunnelHeight * T;
    let best = null, bd = Infinity;
    const consider = (d, loc) => { if (d < bd) { bd = d; best = loc; } };
    for (let l = -1; l < mine.levels.length; l++) {
      const [x0, x1] = span(mine, l), fy = G.floorY(l), top = l < 0 ? fy - 3 * T : fy - H;
      const x = Math.max(x0, Math.min(x1, wx));
      const dy = wy < top ? top - wy : wy > fy ? wy - fy : 0;
      consider(Math.hypot(wx - x, dy), { kind: 'level', l, x });
    }
    mine.ladders.forEach((d, k) => {
      const lx = G.colX(d.c), y0 = G.floorY(d.top), y1 = G.floorY(d.bottom);
      const y = Math.max(y0, Math.min(y1, wy)), dx = Math.max(0, Math.abs(wx - lx) - T * 0.5);
      // a little preference for floors, so a tap next to a ladder foot means the floor
      consider(Math.hypot(dx, wy - y) + T * 0.3, y === y0 ? { kind: 'level', l: d.top, x: lx } : y === y1 ? { kind: 'level', l: d.bottom, x: lx } : { kind: 'ladder', k, y });
    });
    return { loc: best, dist: bd };
  }

  root.MineGen = { geometry, generate, layoutNodes, makeNode, route, nearest, point, span };
})(typeof window !== 'undefined' ? window : globalThis);
