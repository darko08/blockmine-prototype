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

  // where the painted strip for a zone repeats, and where its painted posts land, in world units
  function stripRepeat(S, z) { const st = S.strip[z]; return st.size[0] * (S.tunnelHeight * S.tile) / ((st.floor - st.ceil) * st.size[1]); }
  function postsIn(S, z, xa, xb) {
    const R = stripRepeat(S, z), out = [];
    for (let k = Math.floor(xa / R) - 1; k <= Math.ceil(xb / R); k++) for (const f of S.strip[z].posts) { const x = (k + f) * R; if (x >= xa - S.tile && x <= xb + S.tile) out.push(x); }
    return out;
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
    // ore sits in the tunnel's back wall at chest height; he stands beside it, never on it. Keep clear of ladders,
    // of the painted timber posts, and of other nodes and their standing spots.
    const ladderXs = mine.ladders.filter((d) => d.bottom === l || d.top === l).map((d) => G.colX(d.c));
    const postXs = postsIn(S, zone, seg.a * T, (seg.b + 1) * T);
    const [x0, x1] = span(mine, l), y = G.floorY(l) - S.oreChestHeight, gap = S.oreStandGap * T;
    const clearOfLadders = (x) => ladderXs.every((v) => Math.abs(v - x) > T * 1.1);
    const clearOfPosts = (x) => postXs.every((v) => Math.abs(v - x) > S.orePostClear * T);
    for (let tries = 0; tries < S.orePlaceTries; tries++) {
      const onEnd = rng() < 0.3, rich = rng() < S.richChance, crack = rng() * Math.PI, jitter = rng() - 0.5;
      let n;
      if (onEnd) {   // near an end wall; he stands on the inward side
        const side = rng() < 0.5 ? -1 : 1;
        if (here.some((m) => m.kind === 'end' && m.side === side)) continue;
        const x = side < 0 ? seg.a * T + T * 0.55 : (seg.b + 1) * T - T * 0.55;
        n = { kind: 'end', side, col: side < 0 ? seg.a : seg.b, x, y: y + jitter * 6, standX: x - side * gap };
      } else {       // along the wall; he stands on the side toward the middle of the tunnel
        const col = randInt(rng, seg.a, seg.b), x = G.colX(col) + jitter * T * 0.5;
        const dir = x < (x0 + x1) / 2 ? 1 : -1;
        let standX = x + dir * gap;
        if (standX < x0 || standX > x1) standX = x - dir * gap;
        n = { kind: 'wall', side: 0, col, x, y: y + jitter * 6, standX };
      }
      if (n.standX < x0 || n.standX > x1 || !clearOfLadders(n.x) || !clearOfPosts(n.x) || !clearOfLadders(n.standX)) continue;
      if ((mine.terrain || []).some((t) => t.l === l && [n.x, n.standX].some((v) => v > t.x0 - T && v < t.x1 + T))) continue;
      if (here.some((m) => Math.abs(m.x - n.x) < gap * 2 || Math.abs(m.x - n.standX) < gap * 0.8 || Math.abs(m.standX - n.x) < gap * 0.8)) continue;
      // which deposit: Bitcoin ore (sats), or a mineral (amber, iron, silver) counted by kind
      const kinds = Object.keys(S.depositMix), total = kinds.reduce((a, k) => a + S.depositMix[k][zone], 0);
      let pick = rng() * total, kind = kinds[kinds.length - 1];
      for (const k of kinds) { if (pick < S.depositMix[k][zone]) { kind = k; break; } pick -= S.depositMix[k][zone]; }
      const sizeRoll = rng();
      const btc = kind === 'bitcoin', isRich = btc && rich;
      Object.assign(n, {
        id: (mine.nextId = (mine.nextId || 0) + 1), l, zone, kind, rich: isRich, crack, hp: 1, flash: 0,
        value: btc ? S.zoneValue[zone] * (isRich ? S.richMultiplier : 1) : 0,
        weight: S.zoneWeight[zone] * S.kindWeight[kind], r: S.oreRadius * (isRich ? 1.25 : 1),
      });
      if (kind !== 'amber') {   // a pile on the floor against the back wall, its top at about his chest; amber stays in the wall
        let pile = 0;
        if (btc) pile = isRich ? 2 : S.bitcoinSize[zone];
        else { let u = sizeRoll; while (pile < 2 && u >= S.mineralSizeOdds[pile]) { u -= S.mineralSizeOdds[pile]; pile++; } }
        n.pile = pile; n.h = S.pileHeight[pile] * (isRich ? 1.15 : 1);
        n.base = G.floorY(l) + S.pileSink; n.y = n.base - n.h * 0.5; n.r = Math.max(S.oreRadius * 0.8, n.h * 0.5);
      }
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

  // ---------- gaps and rubble that need a jump ----------
  // none on levels 1-3, more with depth. Each is narrower than a jump with a full bag, so none is ever impossible.
  function jumpLimits(S) {
    const air = 2 * Math.sqrt(2 * S.jumpHeight / S.gravity), full = S.runSpeed * S.fullBagSpeedFactor * air;   // a full-bag jump
    return { gap: Math.min(S.gapWidth[1], full * S.gapSafety), rubble: Math.min(S.rubbleWidth[1], full * S.rubbleSafety) };
  }
  function layoutTerrain(mine) {
    const S = mine.S, G = mine.G, T = S.tile, rng = seededRandom(mine.hash + '|terrain'), lim = jumpLimits(S), out = [];
    mine.terrain = out;
    mine.levels.forEach((seg, l) => {
      const [lo, hi] = S.terrainPerZone[G.zone(l)], count = lo + Math.floor(rng() * (hi - lo + 1));
      const [x0, x1] = span(mine, l);
      const ladderXs = mine.ladders.filter((d) => d.top === l || d.bottom === l).map((d) => G.colX(d.c));
      const nodes = (mine.nodes || []).filter((n) => n.l === l);
      for (let i = 0; i < count; i++) {
        for (let tries = 0; tries < 30; tries++) {
          const gap = rng() < S.gapShare, wr = gap ? [S.gapWidth[0], lim.gap] : [S.rubbleWidth[0], lim.rubble];
          const w = wr[0] + rng() * (wr[1] - wr[0]), cx = x0 + 1.5 * T + rng() * (x1 - x0 - 3 * T), a = cx - w / 2, b = cx + w / 2;
          const hgt = gap ? 0 : S.rubbleHeight * (0.8 + 0.2 * rng());
          if (x1 - x0 < 4 * T) break;
          if (ladderXs.some((v) => v > a - 1.5 * T && v < b + 1.5 * T)) continue;
          if (nodes.some((n) => [n.x, n.standX].some((v) => v > a - 1.2 * T && v < b + 1.2 * T))) continue;
          if (out.some((t) => t.l === l && t.x1 > a - 2.5 * T && t.x0 < b + 2.5 * T)) continue;
          out.push({ l, kind: gap ? 'gap' : 'rubble', x0: a, x1: b, h: hgt });
          break;
        }
      }
    });
    return out;
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

  root.MineGen = { geometry, generate, layoutNodes, layoutTerrain, jumpLimits, makeNode, route, nearest, point, span, stripRepeat, postsIn };
})(typeof window !== 'undefined' ? window : globalThis);
