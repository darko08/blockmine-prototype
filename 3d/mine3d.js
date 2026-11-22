// BLOCKMINE 3D: the mine for one block, laid out from the block hash (plus the server's secret, once there is a server).
// 15 levels joined by ladders, side tunnels on every level (more as more miners go down), the Great Vault in one side
// tunnel of level 15, and ore whose satoshis come from the block's amber budget. Used by the page, the simulator and
// the server. Levels: -1 is the surface by the hatch, 0..14 are the 15 levels. Ladder 0 is the shaft from the hatch.
// A place in the mine is {kind:'level', l, x} (standing on a tunnel floor) or {kind:'ladder', k, y} (on a ladder).
(function (root) {
  const randInt = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));
  const seeded = (s) => (root.seededRandom ? root.seededRandom(s) : require('../js/rng.js').seededRandom(s));

  function geometry(S, R) {
    const T = S.tile;
    return {
      T,
      colX: (c) => c * T + T / 2,
      floorY: (l) => (l < 0 ? 0 : (l + 1) * S.levelSpacing * T),
      ceilY: (l) => (l + 1) * S.levelSpacing * T - S.tunnelHeight * T,
      tier: (l) => R.tier(l),
      zone: (l) => (l < 0 ? 0 : R.artZoneOfTier[R.tier(l)]),     // which painted set
    };
  }

  // ---------- layout ----------
  // One ladder down per level, always R.ladderStep tiles from the ladder that came down, so every level takes the same
  // time. The main gallery runs a little past both ladders; side tunnels open off both ends of it.
  function generate(hash, S, R, minersBelow) {
    const rng = seeded(hash), G = geometry(S, R), T = S.tile, step = R.ladderStep, L = R.sideTunnelLength;
    const extra = Math.floor((minersBelow || 0) / R.minersPerExtraTunnel);
    const sides = R.sideTunnelsBase + extra;                             // side tunnels on each level
    const width = 2 * (4 + step + Math.ceil(sides / 2) * L) + 8;         // columns the mine needs
    const c0 = Math.floor(width / 2) + randInt(rng, -2, 2);
    const surface = { a: c0 - S.surfaceWidth, b: c0 + S.surfaceWidth };
    const levels = [], ladders = [{ c: c0, top: -1, bottom: 0 }];
    let entry = c0, dir = rng() < 0.5 ? -1 : 1;
    for (let l = 0; l < R.levels; l++) {
      const last = l === R.levels - 1;
      // the next ladder down, step tiles away, turning back if it would run toward the edge
      let exit = entry + dir * step;
      if (Math.abs(exit - width / 2) > width / 2 - (Math.ceil(sides / 2) * L + 6)) { dir = -dir; exit = entry + dir * step; }
      const lo = Math.min(entry, last ? entry : exit) - 2, hi = Math.max(entry, last ? entry : exit) + 2;
      // side tunnels: alternate left and right of the main gallery, each one further out
      const tunnels = [];
      let left = lo, right = hi;
      for (let s = 0; s < sides; s++) {
        if (s % 2 === 0) { tunnels.push({ a: left - L, b: left - 1, side: -1 }); left -= L; }
        else { tunnels.push({ a: right + 1, b: right + L, side: 1 }); right += L; }
      }
      levels.push({ a: left, b: right, main: { a: lo, b: hi }, tunnels });
      if (!last) ladders.push({ c: exit, top: l, bottom: l + 1 });
      entry = exit; if (rng() < 0.35) dir = -dir;
    }
    const mine = { hash, c0, surface, levels, ladders, G, S, R, cols: width, minersBelow: minersBelow || 0 };
    mine.nodeRng = rng;
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
  // A place for a node on level l, clear of ladders, posts, gaps and other nodes; he stands beside it, never on it.
  function findSpot(mine, rng, l, within) {
    const S = mine.S, G = mine.G, T = S.tile, seg = mine.levels[l], zone = G.zone(l);
    const nodes = mine.nodes || (mine.nodes = []), here = nodes.filter((n) => n.l === l);
    const ladderXs = mine.ladders.filter((d) => d.bottom === l || d.top === l).map((d) => G.colX(d.c));
    const postXs = postsIn(S, zone, seg.a * T, (seg.b + 1) * T);
    const [x0, x1] = span(mine, l), gap = S.oreStandGap * T;
    const lo = within ? within.a * T + T * 0.5 : x0, hi = within ? (within.b + 1) * T - T * 0.5 : x1;
    for (let tries = 0; tries < S.orePlaceTries; tries++) {
      const x = lo + rng() * (hi - lo), dirIn = x < (x0 + x1) / 2 ? 1 : -1;
      let standX = x + dirIn * gap;
      if (standX < x0 || standX > x1) standX = x - dirIn * gap;
      if (standX < x0 || standX > x1) continue;
      if (ladderXs.some((v) => Math.abs(v - x) <= T * 1.1 || Math.abs(v - standX) <= T * 1.1)) continue;
      if (postXs.some((v) => Math.abs(v - x) <= S.orePostClear * T)) continue;
      if ((mine.terrain || []).some((t) => t.l === l && [x, standX].some((v) => v > t.x0 - T && v < t.x1 + T))) continue;
      if (here.some((m) => Math.abs(m.x - x) < gap * 2 || Math.abs(m.x - standX) < gap * 0.8 || Math.abs(m.standX - x) < gap * 0.8)) continue;
      return { x, standX };
    }
    return null;
  }
  // value: satoshis (amber only); kind: amber, coal, iron, silver or vault
  function makeNode(mine, rng, l, kind, value, opts = {}) {
    const S = mine.S, R = mine.R, G = mine.G, tier = R.tier(l);
    const spot = findSpot(mine, rng, l, opts.within);
    if (!spot) return null;
    const pile = kind === 'vault' ? 2 : kind === 'amber' ? Math.min(2, Math.floor(tier / 2) + (opts.rich ? 1 : 0)) : Math.floor(rng() * 3);
    const n = {
      id: (mine.nextId = (mine.nextId || 0) + 1), l, tier, zone: G.zone(l), kind, value: value || 0, rich: !!opts.rich,
      weight: R.weight[kind], crack: rng() * Math.PI, hp: 1, flash: 0, x: spot.x, standX: spot.standX,
      hardness: R.swingsHardness[tier], pile, regrown: !!opts.regrown,
    };
    n.h = S.pileHeight[pile] * (opts.rich ? 1.15 : 1) * (kind === 'vault' ? 0.9 : 1);
    n.base = G.floorY(l) + S.pileSink; n.y = n.base - n.h * 0.5; n.r = Math.max(S.oreRadius * 0.8, n.h * 0.5);
    mine.nodes.push(n);
    return n;
  }

  // Lay out the block's ore. budget: the satoshis of amber this block may place (from the pot). The drop table gives
  // the ratios between levels; the values are scaled so the amber placed now plus the regrowth reserve equals budget.
  function layoutNodes(mine, budget) {
    // ore scales with the tunnels (the base counts are for a main gallery and two side tunnels), so the density stays the same
    const R = mine.R, rng = mine.nodeRng, scale = (mine.levels[0].tunnels.length + 1) / (R.sideTunnelsBase + 1);
    mine.nodes = [];
    const plan = [];
    for (let l = 0; l < R.levels - 1; l++) {
      const t = R.tier(l);
      for (let i = 0; i < Math.round(R.amberNodesPerLevel[t] * scale); i++) plan.push({ l, kind: 'amber', ratio: R.amberRatio[t] });
      for (let i = 0; i < Math.round(R.materialNodesPerLevel[t] * scale); i++) plan.push({ l, kind: R.materials[t][Math.floor(rng() * R.materials[t].length)] });
    }
    // a rich node on level 1, now and then: worth about ten lamps
    const placing = budget * (1 - R.regrowShareOfBudget);
    const rich = rng() < R.richLevel1Chance ? Math.floor(Math.min(R.richLevel1Lamps * R.lampPrice, placing * R.richMaxShare)) : 0;
    const now = placing - rich;
    const ratioSum = plan.reduce((a, p) => a + (p.ratio || 0), 0);
    const perRatio = ratioSum > 0 ? Math.max(0, now) / ratioSum : 0;
    mine.amberPlaced = 0;
    for (const p of plan) {
      const g = Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng()), sp = R.amberValueSpread || 0;
      const v = p.kind === 'amber' ? Math.floor(p.ratio * perRatio * Math.exp(sp * g - sp * sp / 2)) : 0;   // pieces vary, the mean is kept
      const n = makeNode(mine, rng, p.l, p.kind, v);
      if (n) mine.amberPlaced += v;
    }
    if (rich > 0 && now >= 0) { const n = makeNode(mine, rng, 0, 'amber', rich, { rich: true }); if (n) mine.amberPlaced += rich; }
    mine.regrowLeft = budget - mine.amberPlaced;      // what regrowth may still place this block
    mine.perRatio = perRatio;
    // the Great Vault: in a side tunnel of level 15, a different one every block
    const last = R.levels - 1, tunnels = mine.levels[last].tunnels;
    mine.vaultTunnel = Math.floor(rng() * tunnels.length);
    const t = tunnels[mine.vaultTunnel];
    mine.vault = makeNode(mine, rng, last, 'vault', 0, { within: { a: t.side < 0 ? t.a : t.b - 2, b: t.side < 0 ? t.a + 2 : t.b } });
    return mine.nodes;
  }
  // shallow ore regrows slowly during the shift, drawing on the same budget
  function regrow(mine, rng) {
    const R = mine.R;
    const l = Math.floor(rng() * R.regrowTiers * 3), t = R.tier(l), amber = rng() < 0.6;
    if (amber) {
      const v = Math.floor(R.amberRatio[t] * mine.perRatio);
      if (v <= 0 || v > mine.regrowLeft) return null;
      const n = makeNode(mine, rng, l, 'amber', v, { regrown: true });
      if (n) mine.regrowLeft -= v;
      return n;
    }
    return makeNode(mine, rng, l, R.materials[t][Math.floor(rng() * R.materials[t].length)], 0, { regrown: true });
  }

  // ---------- gaps and rubble that need a jump ----------
  // none on levels 1-3, a few deeper. Each is narrower than a jump, so none is ever impossible.
  function jumpLimits(S) {
    const air = 2 * Math.sqrt(2 * S.jumpHeight / S.gravity), jump = S.runSpeed * air;   // walking is not slowed by the bag
    return { gap: Math.min(S.gapWidth[1], jump * S.gapSafety), rubble: Math.min(S.rubbleWidth[1], jump * S.rubbleSafety) };
  }
  function layoutTerrain(mine) {
    const S = mine.S, G = mine.G, T = S.tile, rng = seeded(mine.hash + '|terrain'), lim = jumpLimits(S), out = [];
    mine.terrain = out;
    mine.levels.forEach((seg, l) => {
      const [lo, hi] = S.terrainPerZone[G.tier(l)], count = lo + Math.floor(rng() * (hi - lo + 1));
      const x0 = seg.main.a * T + 1.5 * T, x1 = (seg.main.b + 1) * T - 1.5 * T;   // only in the main gallery
      const ladderXs = mine.ladders.filter((d) => d.top === l || d.bottom === l).map((d) => G.colX(d.c));
      for (let i = 0; i < count; i++) {
        for (let tries = 0; tries < 30; tries++) {
          const gap = rng() < S.gapShare, wr = gap ? [S.gapWidth[0], lim.gap] : [S.rubbleWidth[0], lim.rubble];
          const w = wr[0] + rng() * (wr[1] - wr[0]), cx = x0 + rng() * (x1 - x0), a = cx - w / 2, b = cx + w / 2;
          if (x1 - x0 < 3 * T) break;
          if (ladderXs.some((v) => v > a - 1.5 * T && v < b + 1.5 * T)) continue;
          if (out.some((t) => t.l === l && t.x1 > a - 2.5 * T && t.x0 < b + 2.5 * T)) continue;
          out.push({ l, kind: gap ? 'gap' : 'rubble', x0: a, x1: b, h: gap ? 0 : S.rubbleHeight * (0.8 + 0.2 * rng()) });
          break;
        }
      }
    });
    return out;
  }

  // ---------- routes (for the honest number on screen) ----------
  function point(mine, loc) {
    if (loc.kind === 'level') return { x: loc.x, y: mine.G.floorY(loc.l) };
    return { x: mine.G.colX(mine.ladders[loc.k].c), y: loc.y };
  }
  // with one ladder per level, the way up is: walk to this level's up-ladder, climb, repeat
  function route(mine, from, to, sp) {
    const G = mine.G;
    let t = 0, l, x;
    if (from.kind === 'ladder') { const d = mine.ladders[from.k]; t += (from.y - G.floorY(d.top)) / sp.up; l = d.top; x = G.colX(d.c); }
    else { l = from.l; x = from.x; }
    while (l > to.l) {
      const d = mine.ladders.find((q) => q.bottom === l);
      t += Math.abs(G.colX(d.c) - x) / sp.walk + (G.floorY(d.bottom) - G.floorY(d.top)) / sp.up;
      l = d.top; x = G.colX(d.c);
    }
    if (l === to.l) t += Math.abs(to.x - x) / sp.walk;
    return { time: t };
  }

  root.MineGen3 = { geometry, generate, layoutNodes, layoutTerrain, regrow, makeNode, jumpLimits, route, point, span, stripRepeat, postsIn };
  if (typeof module !== 'undefined') module.exports = root.MineGen3;
})(typeof window !== 'undefined' ? window : globalThis);
