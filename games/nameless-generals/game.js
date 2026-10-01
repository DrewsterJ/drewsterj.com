'use strict';

// Nameless Generals: towers joined by roads. Every tower you hold raises
// soldiers, and the more towers you hold the faster they all raise them.
// Drag from your towers to a connected tower to march soldiers there and
// take it. Capture every rival capital's last tower to win. Everything is
// drawn on one canvas.

(() => {
  // ---------------------------------------------------------------------------
  // Tuning
  // ---------------------------------------------------------------------------

  const W = 1000;
  const H = 560;
  const SAVE_KEY = 'nameless-generals';

  const PROD = [0, 0.5, 0.7, 0.95]; // soldiers per second, by tower level
  const CAP = [0, 50, 80, 120]; // towers stop growing past this
  const DEF = [0, 1, 1.1, 1.25]; // each defender is worth this many attackers
  const UPGRADE = [0, 15, 30]; // soldiers spent to go from level n to n + 1
  const PER_TOWER_BONUS = 0.05; // +5% production for each tower you own
  const MARCH = 46; // soldier speed in px/s

  const SIZES = {
    small: { towers: 12, label: 'Small' },
    medium: { towers: 18, label: 'Medium' },
    large: { towers: 26, label: 'Large' },
  };

  // AI: seconds between decisions, and how much extra it wants before attacking.
  const SKILL = {
    easy: { think: 2.4, margin: 1.35, upgrade: 0.3, label: 'Easy' },
    normal: { think: 1.5, margin: 1.15, upgrade: 0.5, label: 'Normal' },
    hard: { think: 0.9, margin: 1.05, upgrade: 0.75, label: 'Hard' },
  };

  const PLAYERS = [
    { name: 'You', color: '#2563eb' },
    { name: 'Crimson', color: '#dc2626' },
    { name: 'Verdant', color: '#16a34a' },
    { name: 'Amber', color: '#d97706' },
  ];
  const NEUTRAL = '#a8a29e';

  const params = new URLSearchParams(location.search);
  const AUTOPLAY = params.has('autoplay');
  const SPEED = Math.min(32, Math.max(0.25, Number(params.get('speed')) || 1));

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const randInt = (lo, hi) => Math.floor(rand(lo, hi + 1));
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function shade(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const f = (c) => clamp(Math.round(c + (amount < 0 ? c : 255 - c) * amount), 0, 255);
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }

  function formatTime(t) {
    t = Math.max(0, Math.floor(t));
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  }

  const DEFAULT_SAVE = { wins: 0, games: 0, opponents: 2, skill: 'normal', size: 'medium', fastest: null };

  function loadSave() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s && typeof s === 'object') return { ...DEFAULT_SAVE, ...s };
    } catch {
      // Fall through to defaults.
    }
    return { ...DEFAULT_SAVE };
  }

  const save = loadSave();

  function writeSave() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    } catch {
      // Storage can be unavailable (private mode); settings are just not kept.
    }
  }

  // ---------------------------------------------------------------------------
  // Sound (tiny WebAudio synth)
  // ---------------------------------------------------------------------------

  const Sound = {
    ctx: null,
    muted: false,
    last: {},

    unlock() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    },

    play(name, gap, fn) {
      if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
      const now = this.ctx.currentTime;
      if (this.last[name] && now - this.last[name] < gap) return;
      this.last[name] = now;
      fn();
    },

    tone(freq, dur, type, vol, slideTo, delay = 0) {
      const c = this.ctx;
      const t = c.currentTime + delay;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    },

    select() { this.play('select', 0.03, () => this.tone(660, 0.05, 'sine', 0.05)); },
    send() { this.play('send', 0.05, () => { this.tone(440, 0.06, 'triangle', 0.05); this.tone(660, 0.08, 'triangle', 0.04, null, 0.05); }); },
    clash() { this.play('clash', 0.08, () => this.tone(220, 0.06, 'square', 0.02, 160)); },
    capture() {
      this.play('capture', 0.15, () => [523, 659, 784].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.06, null, i * 0.06)));
    },
    lost() { this.play('lost', 0.2, () => this.tone(330, 0.25, 'sawtooth', 0.04, 150)); },
    upgrade() {
      this.play('upgrade', 0.2, () => [392, 523, 659, 1047].forEach((f, i) => this.tone(f, 0.14, 'sine', 0.06, null, i * 0.05)));
    },
    bad() { this.play('bad', 0.2, () => this.tone(180, 0.12, 'square', 0.03)); },
    eliminated() {
      this.play('elim', 0.5, () => [784, 659, 523, 392].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.06, null, i * 0.09)));
    },
    win() {
      this.play('end', 1, () => [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.08, null, i * 0.13)));
    },
    lose() {
      this.play('end', 1, () => [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.45, 'sawtooth', 0.05, null, i * 0.2)));
    },
  };

  // ---------------------------------------------------------------------------
  // Map: towers placed apart, joined by roads that never cross
  // ---------------------------------------------------------------------------

  const MAP = { x0: 50, x1: W - 50, y0: 132, y1: H - 36 };
  // Keep towers out from under the bottom corner panels.
  const clearOfHud = (p) => !(p.y > H - 95 && (p.x < 320 || p.x > W - 330));

  function segmentsCross(a, b, c, d) {
    if (a === c || a === d || b === c || b === d) return false;
    const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
    return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
  }

  // Does segment a-b pass too close to tower c?
  function nearSegment(a, b, c, r) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const k = clamp(((c.x - a.x) * dx + (c.y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
    return Math.hypot(a.x + dx * k - c.x, a.y + dy * k - c.y) < r;
  }

  function makeMap(sizeKey, nPlayers) {
    const n = SIZES[sizeKey].towers;
    const area = (MAP.x1 - MAP.x0) * (MAP.y1 - MAP.y0);
    const minD = Math.sqrt(area / n) * 0.72;
    for (let attempt = 0; attempt < 300; attempt++) {
      const towers = [];
      for (let tries = 0; tries < 4000 && towers.length < n; tries++) {
        const p = { x: rand(MAP.x0, MAP.x1), y: rand(MAP.y0, MAP.y1) };
        if (clearOfHud(p) && towers.every((t) => dist(t, p) >= minD)) towers.push(p);
      }
      if (towers.length < n) continue;
      towers.forEach((t, i) => Object.assign(t, { i, owner: -1, n: 0, level: 1, capital: false, links: [], pop: 0, flash: 0 }));

      // Greedy planar roads: shortest first, no crossings, at most 4 per tower.
      const pairs = [];
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) pairs.push([a, b, dist(towers[a], towers[b])]);
      pairs.sort((p, q) => p[2] - q[2]);
      const roads = [];
      const maxLen = minD * 2.1;
      const ok = (a, b) => {
        const A = towers[a];
        const B = towers[b];
        if (roads.some(([c, d]) => segmentsCross(A, B, towers[c], towers[d]))) return false;
        return !towers.some((c) => c !== A && c !== B && nearSegment(A, B, c, 26));
      };
      for (const [a, b, d] of pairs) {
        if (d > maxLen) break;
        if (towers[a].links.length >= 4 || towers[b].links.length >= 4) continue;
        if (!ok(a, b)) continue;
        roads.push([a, b]);
        towers[a].links.push(b);
        towers[b].links.push(a);
      }
      // Join any separate islands with the shortest valid road.
      for (let guard = 0; guard < 20; guard++) {
        const comp = components(towers);
        if (Math.max(...comp) === 0) break;
        let bestPair = null;
        for (const [a, b, d] of pairs) {
          if (comp[a] === comp[b] || !ok(a, b)) continue;
          bestPair = [a, b, d];
          break;
        }
        if (!bestPair) break;
        roads.push([bestPair[0], bestPair[1]]);
        towers[bestPair[0]].links.push(bestPair[1]);
        towers[bestPair[1]].links.push(bestPair[0]);
      }
      if (Math.max(...components(towers)) !== 0) continue;
      if (towers.some((t) => t.links.length === 0)) continue;

      // Capitals: far apart, each with a fair share of nearby towers.
      const hops = towers.map((t) => bfsHops(towers, t.i));
      let caps = null;
      let bestScore = -Infinity;
      for (let tries = 0; tries < 300; tries++) {
        const pickSet = [];
        while (pickSet.length < nPlayers) {
          const c = randInt(0, n - 1);
          if (!pickSet.includes(c)) pickSet.push(c);
        }
        let minHop = Infinity;
        for (let a = 0; a < nPlayers; a++) for (let b = a + 1; b < nPlayers; b++) minHop = Math.min(minHop, hops[pickSet[a]][pickSet[b]]);
        // Towers each capital is strictly closest to.
        const share = new Array(nPlayers).fill(0);
        for (const t of towers) {
          const ds = pickSet.map((c) => hops[c][t.i]);
          const m = Math.min(...ds);
          if (ds.filter((d) => d === m).length === 1) share[ds.indexOf(m)]++;
        }
        const score = minHop * 10 - (Math.max(...share) - Math.min(...share)) * 6;
        if (score > bestScore) {
          bestScore = score;
          caps = pickSet;
        }
      }
      if (Math.min(...caps.slice(1).map((c) => hops[caps[0]][c])) < 2) continue;
      caps.forEach((c, k) => {
        const t = towers[c];
        t.owner = k;
        t.capital = true;
        t.level = 2;
        t.n = 20;
      });
      for (const t of towers) {
        if (t.owner >= 0) continue;
        t.level = Math.random() < 0.25 ? 2 : 1;
        t.n = randInt(6, 14) + (t.level - 1) * 8;
      }
      return { towers, roads, caps };
    }
    throw new Error('Could not generate a map');
  }

  function components(towers) {
    const comp = new Array(towers.length).fill(-1);
    let c = 0;
    for (const t of towers) {
      if (comp[t.i] >= 0) continue;
      const stack = [t.i];
      comp[t.i] = c;
      while (stack.length) {
        const u = stack.pop();
        for (const v of towers[u].links) {
          if (comp[v] < 0) {
            comp[v] = c;
            stack.push(v);
          }
        }
      }
      c++;
    }
    return comp;
  }

  function bfsHops(towers, start, passable = () => true) {
    const d = new Array(towers.length).fill(Infinity);
    const prev = new Array(towers.length).fill(-1);
    d[start] = 0;
    const q = [start];
    for (let k = 0; k < q.length; k++) {
      const u = q[k];
      for (const v of towers[u].links) {
        if (d[v] !== Infinity || !passable(towers[v])) continue;
        d[v] = d[u] + 1;
        prev[v] = u;
        q.push(v);
      }
    }
    d.prev = prev;
    return d;
  }

  // ---------------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------------

  let state = null;
  let nextGroup = 1;

  function newGame(opts = {}) {
    const nPlayers = 1 + (opts.opponents ?? save.opponents);
    const sizeKey = opts.size || save.size;
    const map = makeMap(sizeKey, nPlayers);
    const skillKey = opts.skill || save.skill;
    state = {
      mode: 'playing',
      towers: map.towers,
      roads: map.roads,
      t: 0,
      skillKey,
      skill: SKILL[skillKey],
      sizeKey,
      seed: (Math.random() * 2 ** 32) >>> 0,
      players: map.caps.map((c, k) => ({
        id: k,
        name: PLAYERS[k].name,
        color: PLAYERS[k].color,
        alive: true,
        ai: k > 0 || AUTOPLAY || opts.bot ? { think: rand(0.5, 1.5) } : null,
        towers: 1,
        soldiers: 20,
        out: 0,
      })),
      groups: [],
      parts: [],
      texts: [],
      sel: [],
      drag: null,
      frac: 0.5,
      winner: -1,
      endT: 0,
      watching: false,
      stats: { sent: 0, captured: 0, lost: 0, peak: 1 },
    };
    background = null;
  }

  const me = () => state.players[0];
  const towerCount = (id) => state.towers.reduce((n, t) => n + (t.owner === id ? 1 : 0), 0);

  function productionRate(t) {
    if (t.owner < 0) return 0;
    const owned = state.players[t.owner].towers;
    return PROD[t.level] * (t.capital ? 1.2 : 1) * (1 + PER_TOWER_BONUS * (owned - 1));
  }

  // ---------------------------------------------------------------------------
  // Orders
  // ---------------------------------------------------------------------------

  // Path from `from` to `to` that only passes through `owner`'s towers.
  function route(owner, from, to) {
    const T = state.towers;
    if (T[from].links.includes(to)) return [from, to];
    const d = bfsHops(T, from, (t) => t.owner === owner || t.i === to);
    if (d[to] === Infinity) return null;
    const path = [];
    for (let i = to; i !== -1; i = d.prev[i]) path.push(i);
    return path.reverse();
  }

  // Sends a share of the soldiers in each source tower to `to`.
  function send(owner, sources, to, frac) {
    let sent = 0;
    for (const s of sources) {
      const t = state.towers[s];
      if (s === to || t.owner !== owner) continue;
      const amount = Math.floor(t.n * frac);
      if (amount < 1) continue;
      const path = route(owner, s, to);
      if (!path) continue;
      t.n -= amount;
      state.groups.push({ id: nextGroup++, owner, path, leg: 0, d: 0, n: amount });
      sent += amount;
    }
    if (sent && owner === 0) {
      state.stats.sent += sent;
      Sound.send();
    }
    return sent;
  }

  function canUpgrade(t) {
    return t.level < 3 && t.n >= UPGRADE[t.level] + 1;
  }

  function upgrade(owner, i) {
    const t = state.towers[i];
    if (t.owner !== owner || !canUpgrade(t)) {
      if (owner === 0) Sound.bad();
      return false;
    }
    t.n -= UPGRADE[t.level];
    t.level++;
    t.pop = 1;
    if (owner === 0) Sound.upgrade();
    return true;
  }

  // ---------------------------------------------------------------------------
  // Simulation
  // ---------------------------------------------------------------------------

  function roadLength(a, b) {
    return dist(state.towers[a], state.towers[b]);
  }

  function step(dt) {
    state.t += dt;
    const T = state.towers;
    for (const p of state.players) p.towers = 0;
    for (const t of T) if (t.owner >= 0) state.players[t.owner].towers++;

    for (const t of T) {
      t.pop = Math.max(0, t.pop - dt * 2.5);
      t.flash = Math.max(0, t.flash - dt * 3);
      if (t.owner < 0) continue;
      const cap = CAP[t.level] * (t.capital ? 1.2 : 1);
      if (t.n < cap) t.n = Math.min(cap, t.n + productionRate(t) * dt);
      else t.n -= (t.n - cap) * 0.04 * dt;
    }

    // March.
    for (const g of state.groups) {
      if (g.n <= 0) continue;
      g.d += MARCH * dt;
      const a = g.path[g.leg];
      const b = g.path[g.leg + 1];
      if (g.d >= roadLength(a, b)) {
        const last = g.leg + 1 === g.path.length - 1;
        if (!last && T[b].owner === g.owner) {
          g.leg++;
          g.d -= roadLength(a, b);
        } else {
          arrive(g, T[b]);
          g.n = 0;
        }
      }
    }

    // Armies meeting head-on along a road fight it out.
    const byRoad = new Map();
    for (const g of state.groups) {
      if (g.n <= 0) continue;
      const a = g.path[g.leg];
      const b = g.path[g.leg + 1];
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      if (!byRoad.has(key)) byRoad.set(key, []);
      byRoad.get(key).push(g);
    }
    for (const list of byRoad.values()) {
      if (list.length < 2) continue;
      for (const g1 of list) {
        for (const g2 of list) {
          if (g1 === g2 || g1.owner === g2.owner || g1.n <= 0 || g2.n <= 0) continue;
          if (g1.path[g1.leg] !== g2.path[g2.leg + 1]) continue; // same direction
          const L = roadLength(g1.path[g1.leg], g1.path[g1.leg + 1]);
          if (g1.d + g2.d < L) continue;
          const m = Math.min(g1.n, g2.n);
          g1.n -= m;
          g2.n -= m;
          const p = groupPos(g1.n > 0 ? g1 : g2);
          burst(p.x, p.y, '#78716c', 10);
          if (g1.owner === 0 || g2.owner === 0) Sound.clash();
        }
      }
    }
    state.groups = state.groups.filter((g) => g.n > 0);

    // AI.
    for (const p of state.players) {
      if (!p.ai || !p.alive) continue;
      p.ai.think -= dt;
      if (p.ai.think <= 0) {
        p.ai.think = state.skill.think * rand(0.8, 1.2) * (p.id === 0 ? SKILL.normal.think / state.skill.think : 1);
        aiThink(p);
      }
    }

    // Eliminations.
    let total = 0;
    for (const p of state.players) p.soldiers = 0;
    for (const t of T) if (t.owner >= 0) state.players[t.owner].soldiers += t.n;
    for (const g of state.groups) state.players[g.owner].soldiers += g.n;
    for (const p of state.players) total += p.soldiers;
    state.stats.peak = Math.max(state.stats.peak, me().towers);
    for (const p of state.players) {
      if (!p.alive) continue;
      const hasTower = T.some((t) => t.owner === p.id);
      const hasGroup = state.groups.some((g) => g.owner === p.id);
      if (!hasTower && !hasGroup) {
        p.alive = false;
        p.out = state.t;
        banner(`${p.name === 'You' ? 'You were' : `${p.name} was`} eliminated`, p.color);
        if (p.id === 0) Sound.lose();
        else Sound.eliminated();
      }
    }
    if (state.winner < 0) {
      const alive = state.players.filter((p) => p.alive);
      if (alive.length === 1) {
        state.winner = alive[0].id;
        if (state.winner === 0) Sound.win();
        state.endT = 1.5;
      } else if (!me().alive && !state.watching && !me().ai && state.endT === 0) {
        state.endT = 1.5;
      }
    }
    return total;
  }

  function arrive(g, t) {
    if (t.owner === g.owner) {
      t.n += g.n;
      return;
    }
    const def = t.n * DEF[t.level];
    if (g.n > def) {
      const before = t.owner;
      t.owner = g.owner;
      t.n = g.n - def;
      t.pop = 1;
      burst(t.x, t.y - 20, state.players[g.owner].color, 22);
      if (g.owner === 0) {
        state.stats.captured++;
        Sound.capture();
      } else if (before === 0) {
        state.stats.lost++;
        Sound.lost();
      }
    } else {
      t.n -= g.n / DEF[t.level];
      t.flash = 1;
      burst(t.x, t.y - 20, '#78716c', 6);
    }
  }

  function groupPos(g, back = 0) {
    const T = state.towers;
    const a = T[g.path[g.leg]];
    const b = T[g.path[g.leg + 1]];
    const L = dist(a, b) || 1;
    const k = clamp((g.d - back) / L, 0, 1);
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, dx: (b.x - a.x) / L, dy: (b.y - a.y) / L };
  }

  function banner(text, color) {
    state.texts.push({ text, color, t: 3 });
  }

  // ---------------------------------------------------------------------------
  // AI
  // ---------------------------------------------------------------------------

  // Soldiers already heading for tower i, split into friendly and hostile.
  function incoming(owner, i) {
    let mine = 0;
    let theirs = 0;
    for (const g of state.groups) {
      if (g.path[g.path.length - 1] !== i) continue;
      if (g.owner === owner) mine += g.n;
      else theirs += g.n;
    }
    return { mine, theirs };
  }

  function aiThink(p) {
    const T = state.towers;
    const sk = p.id === 0 ? SKILL.normal : state.skill;
    const own = T.filter((t) => t.owner === p.id);
    if (!own.length) return;
    const isFront = (t) => t.links.some((j) => T[j].owner !== p.id);

    // 1. Defend towers that are about to fall.
    for (const t of own) {
      const inc = incoming(p.id, t.i);
      if (inc.theirs > t.n * DEF[t.level] + inc.mine - 2) {
        const helpers = t.links.map((j) => T[j]).filter((o) => o.owner === p.id && o.n > 6);
        if (helpers.length) send(p.id, helpers.map((o) => o.i), t.i, 0.6);
      }
    }

    // 2. Attack the best neighbouring tower we can take together.
    let best = null;
    for (const c of T) {
      if (c.owner === p.id) continue;
      const sup = c.links.map((j) => T[j]).filter((o) => o.owner === p.id && o.n >= 4);
      if (!sup.length) continue;
      const inc = incoming(p.id, c.i);
      // Neutral towers do not grow; enemy towers grow while we march.
      const march = Math.max(...sup.map((o) => dist(o, c))) / MARCH;
      const growth = c.owner >= 0 ? productionRate(c) * march : 0;
      // Grow bolder as the game drags on.
      const margin = Math.max(1, sk.margin - state.t / 1500);
      const need = (c.n + growth) * DEF[c.level] * margin + 2 - inc.mine;
      if (need <= 0) continue;
      const avail = sup.reduce((s, o) => s + o.n * 0.85, 0);
      if (avail < need) continue;
      let value = c.owner < 0 ? 10 : 13;
      if (c.capital) value += 8;
      value += (c.level - 1) * 5;
      // Prefer to finish off weak rivals.
      if (c.owner >= 0 && state.players[c.owner].towers <= 2) value += 10;
      const score = value / (need + 8);
      if (!best || score > best.score) best = { score, c, sup, need, avail };
    }
    if (best) {
      const frac = clamp(best.need / best.avail * 0.85 + 0.1, 0.35, 0.85);
      send(p.id, best.sup.map((o) => o.i), best.c.i, frac);
    }

    // 3. Upgrade a safe tower now and then.
    if (!best && Math.random() < sk.upgrade) {
      const safe = own.filter((t) => !isFront(t) && canUpgrade(t) && t.n > UPGRADE[t.level] + 6);
      const t = safe.sort((a, b) => b.n - a.n)[0] || (own.length === 1 && canUpgrade(own[0]) && own[0].n > 45 ? own[0] : null);
      if (t) upgrade(p.id, t.i);
    }

    // 4. Move soldiers from every safe tower up to the front.
    const fronts = own.filter(isFront);
    if (!fronts.length) return;
    for (const t of own) {
      if (isFront(t) || t.n < 12) continue;
      const d = bfsHops(T, t.i, (o) => o.owner === p.id);
      let target = null;
      for (const f of fronts) if (d[f.i] !== Infinity && (!target || d[f.i] < d[target.i])) target = f;
      if (target) send(p.id, [t.i], target.i, 0.7);
    }
  }

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  function burst(x, y, color, n) {
    if (state.parts.length > 400) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = rand(30, 110);
      state.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, life: rand(0.3, 0.6), color, size: rand(1.5, 3) });
    }
  }

  function updateEffects(dt) {
    for (const q of state.parts) {
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vy += 160 * dt;
      q.life -= dt;
    }
    state.parts = state.parts.filter((q) => q.life > 0);
    for (const b of state.texts) b.t -= dt;
    state.texts = state.texts.filter((b) => b.t > 0);
  }

  // ---------------------------------------------------------------------------
  // Canvas
  // ---------------------------------------------------------------------------

  const stage = document.getElementById('stage');
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let background = null;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = canvas.clientWidth || W;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(w * dpr * (H / W));
    background = null; // redraw the map at the new resolution
  }
  window.addEventListener('resize', resize);
  document.addEventListener('fullscreenchange', resize);
  resize();

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  const inside = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

  const glowCache = new Map();
  function glow(color) {
    if (!glowCache.has(color)) {
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 128;
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, color);
      grad.addColorStop(0.55, color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 128, 128);
      glowCache.set(color, c);
    }
    return glowCache.get(color);
  }

  // Tower size and height by level.
  const towerR = (t) => 15 + t.level * 3.5 + (t.capital ? 4 : 0);
  const towerH = (t) => 14 + t.level * 8 + (t.capital ? 8 : 0);

  // Small seeded random generator, so the scenery stays put when redrawn.
  function seeded(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // The ground, trees and roads never change during a game: draw them once
  // at the canvas's real resolution.
  function makeBackground() {
    const S = Math.max(1, canvas.width / W);
    const rnd = seeded(state.seed);
    const rand = (lo, hi) => lo + rnd() * (hi - lo);
    const randInt = (lo, hi) => Math.floor(rand(lo, hi + 1));
    const c = document.createElement('canvas');
    c.width = W * S;
    c.height = H * S;
    const g = c.getContext('2d');
    g.scale(S, S);
    g.fillStyle = '#f1ede2';
    g.fillRect(0, 0, W, H);
    const T = state.towers;
    const clear = (x, y, r) =>
      T.every((t) => Math.hypot(t.x - x, t.y - y) > r + 26) &&
      state.roads.every(([a, b]) => !nearSegment(T[a], T[b], { x, y }, r + 10));
    for (let k = 0; k < 40; k++) {
      g.fillStyle = k % 3 ? 'rgba(206,221,187,0.45)' : 'rgba(228,214,185,0.5)';
      g.beginPath();
      g.ellipse(rand(0, W), rand(0, H), rand(40, 120), rand(25, 70), rand(0, 3), 0, Math.PI * 2);
      g.fill();
    }
    for (let k = 0; k < 160; k++) {
      g.fillStyle = 'rgba(160,150,120,0.25)';
      g.beginPath();
      g.arc(rand(0, W), rand(0, H), rand(0.8, 1.6), 0, Math.PI * 2);
      g.fill();
    }
    // Trees in little clusters.
    const trees = [];
    for (let k = 0; k < 26; k++) {
      const cx = rand(20, W - 20);
      const cy = rand(70, H - 10);
      const n = randInt(2, 6);
      for (let j = 0; j < n; j++) {
        const x = cx + rand(-30, 30);
        const y = cy + rand(-18, 18);
        const r = rand(7, 13);
        if (clear(x, y, r)) trees.push({ x, y, r });
      }
    }
    trees.sort((a, b) => a.y - b.y);
    for (const tr of trees) {
      g.fillStyle = 'rgba(80,70,40,0.14)';
      g.beginPath();
      g.ellipse(tr.x + 3, tr.y + tr.r * 0.9, tr.r, tr.r * 0.4, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#8fae7e';
      g.beginPath();
      g.arc(tr.x, tr.y, tr.r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#a7c294';
      g.beginPath();
      g.arc(tr.x - tr.r * 0.3, tr.y - tr.r * 0.3, tr.r * 0.55, 0, Math.PI * 2);
      g.fill();
    }
    // Roads.
    g.lineCap = 'round';
    for (const [w, col] of [[17, 'rgba(120,100,60,0.12)'], [15, '#d8cbad'], [10, '#efe7d4']]) {
      g.strokeStyle = col;
      g.lineWidth = w;
      g.beginPath();
      for (const [a, b] of state.roads) {
        g.moveTo(T[a].x, T[a].y);
        g.lineTo(T[b].x, T[b].y);
      }
      g.stroke();
    }
    g.strokeStyle = 'rgba(200,185,150,0.7)';
    g.lineWidth = 1.2;
    g.setLineDash([4, 7]);
    g.beginPath();
    for (const [a, b] of state.roads) {
      g.moveTo(T[a].x, T[a].y);
      g.lineTo(T[b].x, T[b].y);
    }
    g.stroke();
    return c;
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  function towerAt(x, y) {
    let best = -1;
    let bd = Infinity;
    for (const t of state.towers) {
      const cy = t.y - towerH(t) / 2;
      const d = Math.hypot(t.x - x, (cy - y) * 0.9);
      if (d < towerR(t) + 16 && d < bd) {
        bd = d;
        best = t.i;
      }
    }
    return best;
  }

  function render() {
    const s = canvas.width / W;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    if (!state) return;
    if (!background) background = makeBackground();
    ctx.drawImage(background, 0, 0, W, H);
    const T = state.towers;
    const now = performance.now() / 1000;

    // Territory.
    ctx.globalAlpha = 0.16;
    for (const t of T) {
      if (t.owner < 0) continue;
      ctx.drawImage(glow(state.players[t.owner].color), t.x - 95, t.y - 80, 190, 160);
    }
    ctx.globalAlpha = 1;

    // Drag arrows.
    const hover = input.over ? towerAt(input.mx, input.my) : -1;
    if (state.sel.length && ((state.drag && !state.drag.box) || hover >= 0)) {
      const target = hover >= 0 && !state.sel.includes(hover) ? hover : -1;
      for (const i of state.sel) {
        const a = T[i];
        const ok = target >= 0 && route(0, i, target);
        const tx = target >= 0 ? T[target].x : input.mx;
        const ty = target >= 0 ? T[target].y - towerH(T[target]) / 2 : input.my;
        if ((!state.drag || state.drag.box) && target < 0) continue;
        arrow(a.x, a.y - towerH(a) / 2, tx, ty, target >= 0 ? (ok ? me().color : '#a8a29e') : 'rgba(37,99,235,0.55)', target >= 0 && !ok);
      }
    }

    // Selection box.
    const d = state.drag;
    if (d && d.box && d.moved) {
      const x0 = Math.min(d.x, input.mx);
      const y0 = Math.min(d.y, input.my);
      ctx.fillStyle = 'rgba(37,99,235,0.1)';
      ctx.strokeStyle = 'rgba(37,99,235,0.8)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      roundRect(x0, y0, Math.abs(input.mx - d.x), Math.abs(input.my - d.y), 4);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Marching soldiers.
    for (const g of state.groups) {
      const col = state.players[g.owner].color;
      const n = Math.min(12, Math.ceil(g.n));
      for (let k = n - 1; k >= 0; k--) {
        const p = groupPos(g, k * 8);
        const bob = Math.sin(now * 12 + k + g.id) * 0.8;
        ctx.fillStyle = 'rgba(60,50,30,0.18)';
        ctx.beginPath();
        ctx.ellipse(p.x + 1.5, p.y + 3.5, 4.2, 1.8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = col;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(p.x, p.y - 2 + bob, 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      if (g.n >= 2) {
        const p = groupPos(g);
        const label = String(Math.floor(g.n));
        ctx.font = 'bold 11px system-ui, sans-serif';
        const w = ctx.measureText(label).width + 8;
        roundRect(p.x - w / 2, p.y - 20, w, 14, 7);
        ctx.fillStyle = col;
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText(label, p.x, p.y - 9);
      }
    }

    // Towers, back to front.
    const order = [...T].sort((a, b) => a.y - b.y);
    for (const t of order) drawTower(t, t.i === hover, now);
    for (const t of order) drawCount(t);

    // Upgrade button for a single selected tower of yours.
    const ub = upgradeButton();
    if (ub) {
      const hov = input.over && inside(ub, input.mx, input.my);
      roundRect(ub.x, ub.y, ub.w, ub.h, 8);
      ctx.fillStyle = ub.ok ? (hov ? '#1d4ed8' : '#2563eb') : '#a8a29e';
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(ub.label, ub.x + ub.w / 2, ub.y + 15);
    }

    for (const q of state.parts) {
      ctx.globalAlpha = Math.min(1, q.life / 0.3);
      ctx.fillStyle = q.color;
      ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
    }
    ctx.globalAlpha = 1;

    drawHud(hover);
  }

  function arrow(x1, y1, x2, y2, color, dashed) {
    const a = Math.atan2(y2 - y1, x2 - x1);
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 12) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    if (dashed) ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2 - Math.cos(a) * 12, y2 - Math.sin(a) * 12);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - Math.cos(a - 0.45) * 14, y2 - Math.sin(a - 0.45) * 14);
    ctx.lineTo(x2 - Math.cos(a + 0.45) * 14, y2 - Math.sin(a + 0.45) * 14);
    ctx.closePath();
    ctx.fill();
  }

  function drawTower(t, hovered, now) {
    const color = t.owner >= 0 ? state.players[t.owner].color : NEUTRAL;
    const pop = 1 + Math.sin(t.pop * Math.PI) * 0.14;
    const r = towerR(t) * pop;
    const h = towerH(t) * pop;
    const { x, y } = t;
    const ry = r * 0.36;
    const top = y - h;

    // Soft shadow cast to the lower right.
    ctx.fillStyle = 'rgba(60,45,20,0.2)';
    ctx.beginPath();
    ctx.ellipse(x + r * 0.45, y + ry * 0.7, r * 1.45, ry * 1.35, 0, 0, Math.PI * 2);
    ctx.fill();

    // Stone plinth.
    ctx.fillStyle = '#c9bc9b';
    ctx.beginPath();
    ctx.ellipse(x, y + 3, r * 1.25, ry * 1.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e4dac2';
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.22, ry * 1.22, 0, 0, Math.PI * 2);
    ctx.fill();

    // Selection and hover rings around the plinth.
    if (state.sel.includes(t.i)) {
      const pulse = 1 + Math.sin(now * 6) * 0.04;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.ellipse(x, y + 1, (r + 11) * pulse, (r + 11) * 0.4 * pulse, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    } else if (hovered) {
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(x, y + 1, r + 9, (r + 9) * 0.4, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Body, lit from the upper left.
    const grad = ctx.createLinearGradient(x - r, 0, x + r, 0);
    grad.addColorStop(0, shade(color, -0.12));
    grad.addColorStop(0.3, shade(color, 0.12));
    grad.addColorStop(0.55, color);
    grad.addColorStop(1, shade(color, -0.42));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x - r, top);
    ctx.lineTo(x - r, y);
    ctx.ellipse(x, y, r, ry, 0, Math.PI, 0, true);
    ctx.lineTo(x + r, top);
    ctx.closePath();
    ctx.fill();

    // Stone courses.
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(0,0,0,0.09)';
    ctx.lineWidth = 1;
    for (let cy = y - 6; cy > top + 4; cy -= 7) {
      ctx.beginPath();
      ctx.ellipse(x, cy, r, ry, 0, 0.15, Math.PI - 0.15);
      ctx.stroke();
    }
    // A soft highlight down the lit side.
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x - r * 0.62, top, r * 0.22, h + ry);
    ctx.restore();

    // Door and windows.
    ctx.fillStyle = shade(color, -0.6);
    ctx.beginPath();
    ctx.roundRect(x - r * 0.24, y + ry * 0.55 - r * 0.62, r * 0.48, r * 0.62, [r * 0.24, r * 0.24, 0, 0]);
    ctx.fill();
    for (let k = 1; k < t.level + (t.capital ? 1 : 0); k++) {
      const wy = y - (h * k) / (t.level + 1) - 3;
      ctx.beginPath();
      ctx.roundRect(x - 2, wy - 5, 4, 8, [2, 2, 0, 0]);
      ctx.fill();
    }

    // Battlements: back ones first, then the rim, then the front ones.
    const merlons = 10;
    const mw = r * 0.34;
    const mh = r * 0.36;
    const merlon = (k, front) => {
      const a = (k / merlons) * Math.PI * 2 + Math.PI / merlons;
      const s2 = Math.sin(a);
      if (front !== s2 > 0) return;
      const mx = x + Math.cos(a) * r * 0.9;
      const my = top + s2 * ry * 0.9;
      ctx.fillStyle = shade(color, front ? -0.05 - Math.cos(a) * 0.25 : -0.3);
      ctx.fillRect(mx - mw / 2, my - mh, mw, mh);
      ctx.fillStyle = shade(color, 0.3);
      ctx.fillRect(mx - mw / 2, my - mh - 1.5, mw, 2.5);
    };
    for (let k = 0; k < merlons; k++) merlon(k, false);
    ctx.fillStyle = shade(color, 0.32);
    ctx.beginPath();
    ctx.ellipse(x, top, r * 1.02, ry * 1.02, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shade(color, -0.22);
    ctx.beginPath();
    ctx.ellipse(x, top + 1, r * 0.74, ry * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let k = 0; k < merlons; k++) merlon(k, true);

    // Flag on every tower you hold, bigger on capitals.
    if (t.owner >= 0) {
      const fh = t.capital ? 24 : 16;
      const fw = t.capital ? 15 : 11;
      ctx.strokeStyle = '#57534e';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, top - fh);
      ctx.stroke();
      const wave = Math.sin(now * 5 + t.i) * 1.6;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, top - fh);
      ctx.quadraticCurveTo(x + fw * 0.5, top - fh + 1 + wave, x + fw, top - fh + 3);
      ctx.quadraticCurveTo(x + fw * 0.5, top - fh + 7 + wave, x, top - fh + fh * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    if (t.flash > 0) {
      ctx.strokeStyle = `rgba(220,38,38,${t.flash})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(x, top, r + 3, ry + 1.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawCount(t) {
    const color = t.owner >= 0 ? state.players[t.owner].color : '#78716c';
    const top = t.y - towerH(t) - towerR(t) * 0.4 - (t.owner >= 0 ? (t.capital ? 28 : 20) : 8);
    const label = String(Math.floor(t.n));
    ctx.font = 'bold 15px system-ui, sans-serif';
    const w = Math.max(30, ctx.measureText(label).width + 16);
    ctx.fillStyle = 'rgba(70,55,30,0.16)';
    roundRect(t.x - w / 2 + 1, top - 20, w, 22, 11);
    ctx.fill();
    roundRect(t.x - w / 2, top - 22, w, 22, 11);
    ctx.fillStyle = t.owner >= 0 ? color : '#fff';
    ctx.fill();
    ctx.strokeStyle = t.owner >= 0 ? 'rgba(255,255,255,0.9)' : '#a8a29e';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = t.owner >= 0 ? '#fff' : '#57534e';
    ctx.textAlign = 'center';
    ctx.fillText(label, t.x, top - 6);
    // One pip per level.
    for (let k = 0; k < t.level; k++) {
      ctx.fillStyle = t.owner >= 0 ? color : '#a8a29e';
      ctx.beginPath();
      ctx.arc(t.x + (k - (t.level - 1) / 2) * 7, top + 5, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---------------------------------------------------------------------------
  // HUD
  // ---------------------------------------------------------------------------

  const SYS = { x0: W - 132, y: 16, size: 32, gap: 6 };

  function sysButtons() {
    const paused = state && state.mode === 'paused';
    return [
      { id: 'pause', label: paused ? '▶' : 'II' },
      { id: 'mute', label: Sound.muted ? '♪̸' : '♪' },
      { id: 'full', label: '⛶' },
    ].map((b, k) => ({ ...b, x: SYS.x0 + k * (SYS.size + SYS.gap), y: SYS.y, w: SYS.size, h: SYS.size }));
  }

  const FRACS = [0.25, 0.5, 0.75, 1];
  function fracButtons() {
    return FRACS.map((f, k) => ({ id: `frac:${f}`, f, label: `${f * 100}%`, x: 70 + k * 50, y: H - 42, w: 46, h: 28 }));
  }

  function upgradeButton() {
    if (state.sel.length !== 1 || state.drag) return null;
    const t = state.towers[state.sel[0]];
    if (t.owner !== 0 || t.level >= 3) return null;
    const ok = canUpgrade(t);
    return { id: 'upgrade', ok, label: `▲ Upgrade · ${UPGRADE[t.level]}`, x: t.x - 58, y: t.y + 14, w: 116, h: 22 };
  }

  const selectAllButton = () => ({ id: 'all', label: 'Select all (A)', x: 296, y: H - 44, w: 116, h: 28 });

  function hitTest(x, y) {
    if (!state) return null;
    for (const b of sysButtons()) if (inside(b, x, y)) return b;
    if (inside(selectAllButton(), x, y)) return selectAllButton();
    for (const b of fracButtons()) if (inside(b, x, y)) return b;
    const ub = upgradeButton();
    if (ub && inside(ub, x, y)) return ub;
    return null;
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = 'rgba(70,55,30,0.1)';
    roundRect(x + 1, y + 2, w, h, 10);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    roundRect(x, y, w, h, 10);
    ctx.fill();
  }

  function drawHud(hoverTower) {
    const hover = input.over ? hitTest(input.mx, input.my) : null;
    const ps = state.players;

    // Balance of power.
    panel(12, 12, W - 158, 52);
    const bx = 24;
    const bw = W - 182;
    let total = 0;
    for (const p of ps) total += p.alive ? p.soldiers : 0;
    let x = bx;
    roundRect(bx, 22, bw, 10, 5);
    ctx.save();
    ctx.clip();
    for (const p of ps) {
      if (!p.alive) continue;
      const w = total ? (p.soldiers / total) * bw : bw / ps.length;
      ctx.fillStyle = p.color;
      ctx.fillRect(x, 22, w + 0.5, 10);
      x += w;
    }
    ctx.restore();
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    x = bx;
    for (const p of ps) {
      ctx.globalAlpha = p.alive ? 1 : 0.4;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(x + 5, 48, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#292524';
      const label = p.alive ? `${p.name}  ${p.towers} tower${p.towers === 1 ? '' : 's'} · ${Math.floor(p.soldiers)}` : `${p.name}  out`;
      ctx.font = p.id === 0 ? 'bold 12px system-ui, sans-serif' : '12px system-ui, sans-serif';
      ctx.fillText(label, x + 14, 52);
      x += ctx.measureText(label).width + 34;
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#57534e';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText(formatTime(state.t), 12 + W - 170, 52);

    // System buttons.
    panel(W - 140, 12, 128, 40);
    for (const b of sysButtons()) {
      roundRect(b.x, b.y, b.w, b.h, 7);
      ctx.fillStyle = hover && hover.id === b.id ? '#e7e5e4' : '#f5f5f4';
      ctx.fill();
      ctx.fillStyle = '#292524';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.label, b.x + b.w / 2, b.y + 21);
    }

    // Send amount.
    panel(12, H - 50, 272, 40);
    ctx.fillStyle = '#57534e';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Send', 24, H - 24);
    for (const b of fracButtons()) {
      const on = state.frac === b.f;
      roundRect(b.x, b.y, b.w, b.h, 7);
      ctx.fillStyle = on ? me().color : hover && hover.id === b.id ? '#e7e5e4' : '#f5f5f4';
      ctx.fill();
      ctx.fillStyle = on ? '#fff' : '#292524';
      ctx.textAlign = 'center';
      ctx.fillText(b.label, b.x + b.w / 2, b.y + 18);
    }

    const sa = selectAllButton();
    panel(sa.x - 6, H - 50, sa.w + 12, 40);
    roundRect(sa.x, sa.y, sa.w, sa.h, 7);
    ctx.fillStyle = hover && hover.id === 'all' ? '#e7e5e4' : '#f5f5f4';
    ctx.fill();
    ctx.fillStyle = '#292524';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(sa.label, sa.x + sa.w / 2, sa.y + 18);
    if (state.sel.length > 1) {
      ctx.fillStyle = me().color;
      ctx.textAlign = 'left';
      ctx.fillText(`${state.sel.length} towers selected · click a target`, sa.x + sa.w + 16, sa.y + 18);
    }

    // Your production.
    const mine = state.towers.filter((t) => t.owner === 0);
    const rate = mine.reduce((s, t) => s + (t.n < CAP[t.level] * (t.capital ? 1.2 : 1) ? productionRate(t) : 0), 0);
    panel(W - 312, H - 50, 300, 40);
    ctx.fillStyle = '#292524';
    ctx.textAlign = 'center';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText(`${mine.length} tower${mine.length === 1 ? '' : 's'} · +${rate.toFixed(1)} soldiers/s · +${Math.round(PER_TOWER_BONUS * 100 * Math.max(0, mine.length - 1))}% bonus`, W - 162, H - 25);

    // Tower tooltip.
    if (hoverTower >= 0 && !state.drag) {
      const t = state.towers[hoverTower];
      const owner = t.owner >= 0 ? state.players[t.owner].name : 'Neutral';
      const lines = [
        `${t.capital ? 'Capital · ' : ''}${owner} · level ${t.level}`,
        t.owner >= 0 ? `+${productionRate(t).toFixed(2)}/s, holds ${Math.round(CAP[t.level] * (t.capital ? 1.2 : 1))}` : 'Does not grow until taken',
        `Defenders count ×${DEF[t.level]}`,
      ];
      ctx.font = '12px system-ui, sans-serif';
      const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 20;
      let tx = t.x + towerR(t) + 14;
      if (tx + w > W - 10) tx = t.x - towerR(t) - 14 - w;
      const ty = clamp(t.y - towerH(t) - 10, 70, H - 110);
      panel(tx, ty, w, 60);
      ctx.textAlign = 'left';
      lines.forEach((l, k) => {
        ctx.fillStyle = k === 0 ? '#1c1917' : '#57534e';
        ctx.font = k === 0 ? 'bold 12px system-ui, sans-serif' : '12px system-ui, sans-serif';
        ctx.fillText(l, tx + 10, ty + 18 + k * 16);
      });
    }

    // Banners.
    state.texts.forEach((b, k) => {
      ctx.globalAlpha = Math.min(1, b.t / 0.5);
      ctx.font = 'bold 18px system-ui, sans-serif';
      const w = ctx.measureText(b.text).width + 32;
      panel(W / 2 - w / 2, 78 + k * 40, w, 32);
      ctx.fillStyle = b.color;
      ctx.textAlign = 'center';
      ctx.fillText(b.text, W / 2, 100 + k * 40);
    });
    ctx.globalAlpha = 1;

    if (state.t < 8 && state.mode === 'playing' && !state.players[0].ai) {
      ctx.globalAlpha = Math.min(1, (8 - state.t) / 1.5);
      const msg = 'Drag from your blue tower to a connected tower to send soldiers';
      ctx.font = 'bold 14px system-ui, sans-serif';
      const w = ctx.measureText(msg).width + 32;
      panel(W / 2 - w / 2, 72, w, 32);
      ctx.fillStyle = '#1d4ed8';
      ctx.textAlign = 'center';
      ctx.fillText(msg, W / 2, 93);
      ctx.globalAlpha = 1;
    }
  }

  // ---------------------------------------------------------------------------
  // Menus (HTML overlay)
  // ---------------------------------------------------------------------------

  const overlay = document.getElementById('overlay');

  function optionRow(name, values, current) {
    return `<div class="ng-opt"><span>${name}</span>${values
      .map(([v, label]) => `<button type="button" data-opt="${name}" data-val="${v}" class="${String(v) === String(current) ? 'on' : ''}">${label}</button>`)
      .join('')}</div>`;
  }

  function record() {
    if (!save.games) return '';
    return `<p class="help">Record: ${save.wins} won of ${save.games}${save.fastest ? ` · fastest win ${formatTime(save.fastest)}` : ''}</p>`;
  }

  function showOverlay(kind) {
    if (!kind) {
      overlay.classList.remove('open');
      overlay.innerHTML = '';
      return;
    }
    if (kind === 'menu') {
      overlay.innerHTML = `
        <div class="ng-panel">
          <h2>Nameless Generals</h2>
          <p>Every tower you hold raises soldiers, and each tower you own makes all of them faster. March along the roads, take towers, and wipe out every rival.</p>
          ${optionRow('Rivals', [[1, '1'], [2, '2'], [3, '3']], save.opponents)}
          ${optionRow('Difficulty', Object.entries(SKILL).map(([k, s]) => [k, s.label]), save.skill)}
          ${optionRow('Map', Object.entries(SIZES).map(([k, s]) => [k, s.label]), save.size)}
          <div class="row"><button type="button" class="primary" data-act="start">Start</button></div>
          ${record()}
          <p class="help">Drag from your tower to a connected tower to send soldiers. To use several towers, drag a box around them (or Shift-click, or press A for all), then click the target. Click one tower to upgrade it. 1–4 set how many to send.</p>
        </div>`;
    } else if (kind === 'paused') {
      overlay.innerHTML = `
        <div class="ng-panel">
          <h2>Paused</h2>
          <div class="row">
            <button type="button" class="primary" data-act="resume">Resume</button>
            <button type="button" data-act="menu">Quit to menu</button>
          </div>
        </div>`;
    } else if (kind === 'over') {
      const won = state.winner === 0;
      const winner = state.winner >= 0 ? state.players[state.winner] : null;
      const others = state.players.filter((p) => p.alive && p.id !== 0).length;
      overlay.innerHTML = `
        <div class="ng-panel">
          <h2>${won ? 'Victory' : me().alive ? 'Game over' : 'Defeated'}</h2>
          <p>${won ? `You conquered the map in ${formatTime(state.t)}.` : winner && winner.id !== 0 ? `${winner.name} took the map after ${formatTime(state.t)}.` : `You held out for ${formatTime(me().out || state.t)}.`}</p>
          <p class="help">${state.stats.captured} towers captured · ${state.stats.sent.toLocaleString()} soldiers sent · most towers held ${state.stats.peak}</p>
          ${record()}
          <div class="row">
            <button type="button" class="primary" data-act="start">Play again</button>
            ${!won && others > 1 && state.winner < 0 ? '<button type="button" data-act="watch">Watch the rest</button>' : ''}
            <button type="button" data-act="menu">Menu</button>
          </div>
        </div>`;
    }
    overlay.classList.add('open');
  }

  function showMenu() {
    newGame();
    state.mode = 'menu';
    showOverlay('menu');
  }

  function start() {
    newGame();
    showOverlay(null);
  }

  function finish() {
    const first = state.mode !== 'over' && !state.watching;
    state.mode = 'over';
    if (first) {
      save.games++;
      if (state.winner === 0) {
        save.wins++;
        if (!save.fastest || state.t < save.fastest) save.fastest = Math.floor(state.t);
      }
      writeSave();
    }
    showOverlay('over');
  }

  function togglePause() {
    if (!state) return;
    if (state.mode === 'playing') {
      state.mode = 'paused';
      state.drag = null;
      showOverlay('paused');
    } else if (state.mode === 'paused') {
      state.mode = 'playing';
      showOverlay(null);
    }
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (stage.requestFullscreen) stage.requestFullscreen().catch(() => {});
  }

  function activate(b) {
    if (b.id === 'pause') togglePause();
    else if (b.id === 'mute') Sound.muted = !Sound.muted;
    else if (b.id === 'full') toggleFullscreen();
    else if (b.id === 'all') {
      if (state.mode === 'playing') selectAll();
    } else if (b.id.startsWith('frac:')) {
      state.frac = b.f;
      Sound.select();
    } else if (b.id === 'upgrade' && state.mode === 'playing') upgrade(0, state.sel[0]);
  }

  overlay.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    Sound.unlock();
    if (b.dataset.opt) {
      const v = b.dataset.val;
      if (b.dataset.opt === 'Rivals') save.opponents = Number(v);
      else if (b.dataset.opt === 'Difficulty') save.skill = v;
      else if (b.dataset.opt === 'Map') save.size = v;
      writeSave();
      showMenu();
      return;
    }
    const act = b.dataset.act;
    if (act === 'start') start();
    else if (act === 'resume') togglePause();
    else if (act === 'menu') showMenu();
    else if (act === 'watch') {
      state.watching = true;
      state.mode = 'playing';
      showOverlay(null);
    }
  });

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------

  const input = { mx: W / 2, my: H / 2, over: false };

  function toCanvas(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }

  const playing = () => state && state.mode === 'playing' && me().alive && !me().ai;

  function sendSelection(to) {
    const sources = state.sel.filter((i) => i !== to);
    if (!sources.length) return;
    if (!send(0, sources, to, state.frac)) Sound.bad();
    state.sel = [];
  }

  const ownTower = (i) => i >= 0 && state.towers[i].owner === 0;

  function selectAll() {
    state.sel = state.towers.filter((t) => t.owner === 0).map((t) => t.i);
    Sound.select();
  }

  canvas.addEventListener('pointermove', (e) => {
    const p = toCanvas(e);
    input.mx = p.x;
    input.my = p.y;
    input.over = true;
    const d = state && state.drag;
    if (!d || !playing()) return;
    if (Math.hypot(p.x - d.x, p.y - d.y) > 8) d.moved = true;
    if (d.box) return;
    const i = towerAt(p.x, p.y);
    // Swiping over more of your towers adds them to the group.
    if (ownTower(i) && !state.sel.includes(i)) {
      state.sel.push(i);
      Sound.select();
    }
  });
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') input.over = false;
  });
  canvas.addEventListener('pointerdown', (e) => {
    Sound.unlock();
    if (e.button !== 0) return;
    const p = toCanvas(e);
    input.mx = p.x;
    input.my = p.y;
    input.over = e.pointerType === 'mouse';
    const hit = hitTest(p.x, p.y);
    if (hit) {
      activate(hit);
      return;
    }
    if (!playing()) return;
    canvas.setPointerCapture(e.pointerId);
    const i = towerAt(p.x, p.y);
    const add = e.shiftKey || e.ctrlKey || e.metaKey;
    if (i < 0) {
      // Empty ground: drag a box to select towers.
      if (!add) state.sel = [];
      state.drag = { box: true, x: p.x, y: p.y, moved: false, keep: [...state.sel] };
      return;
    }
    if (!ownTower(i)) {
      // Someone else's tower: send the selection there.
      if (state.sel.length) sendSelection(i);
      return;
    }
    if (add) {
      // Shift-click toggles a tower in or out of the selection.
      state.sel = state.sel.includes(i) ? state.sel.filter((j) => j !== i) : [...state.sel, i];
      Sound.select();
      return;
    }
    // Your own tower: keep the selection if it is part of it, so you can drag
    // the whole group; otherwise select just this one.
    const wasGroup = state.sel.includes(i) && state.sel.length > 1;
    if (!state.sel.includes(i)) state.sel = [i];
    state.drag = { start: i, x: p.x, y: p.y, moved: false, wasGroup };
    Sound.select();
  });
  window.addEventListener('pointerup', (e) => {
    if (!state || !state.drag) return;
    const d = state.drag;
    state.drag = null;
    if (!playing()) return;
    const p = toCanvas(e);
    if (d.box) {
      if (!d.moved) return;
      const x0 = Math.min(d.x, p.x);
      const x1 = Math.max(d.x, p.x);
      const y0 = Math.min(d.y, p.y);
      const y1 = Math.max(d.y, p.y);
      const inBox = state.towers.filter((t) => t.owner === 0 && t.x >= x0 - 8 && t.x <= x1 + 8 && t.y - towerH(t) / 2 >= y0 - 14 && t.y - towerH(t) / 2 <= y1 + 14);
      state.sel = [...new Set([...d.keep, ...inBox.map((t) => t.i)])];
      if (inBox.length) Sound.select();
      return;
    }
    const i = towerAt(p.x, p.y);
    if (!d.moved) {
      // A plain click on a tower that was part of a group selects just it.
      if (i === d.start && state.sel.length > 1 && !d.wasGroup) state.sel = [i];
      return;
    }
    if (i >= 0 && (!state.sel.includes(i) || state.sel.length > 1)) {
      if (state.sel.includes(i) && ownTower(i)) {
        // Dragged the group onto one of its own towers: gather there.
        state.sel = state.sel.filter((j) => j !== i);
      }
      sendSelection(i);
    }
  });
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (state) state.sel = [];
  });

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    Sound.unlock();
    const k = e.key.toLowerCase();
    if (k === 'm') Sound.muted = !Sound.muted;
    else if (k === 'f') toggleFullscreen();
    else if (k === 'p' || k === 'escape') togglePause();
    else if (!state || state.mode !== 'playing') return;
    else if (k >= '1' && k <= '4') state.frac = FRACS[Number(k) - 1];
    else if (k === 'u' && state.sel.length === 1) upgrade(0, state.sel[0]);
    else if (k === 'a') selectAll();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state && state.mode === 'playing' && !AUTOPLAY) togglePause();
  });

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------

  let last = performance.now();
  function frame(now) {
    const real = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (state && state.mode === 'playing') {
      let left = real * SPEED;
      while (left > 0) {
        const dt = Math.min(1 / 60, left);
        step(dt);
        left -= dt;
      }
      if (state.endT > 0) {
        state.endT -= real;
        if (state.endT <= 0) {
          state.endT = 0;
          if (state.winner >= 0 || !me().alive) finish();
        }
      }
      // Keep the selection to towers you still own.
      state.sel = state.sel.filter((i) => state.towers[i].owner === 0);
    }
    if (state && state.mode !== 'paused') updateEffects(real);
    render();
    requestAnimationFrame(frame);
  }

  // Plays a whole game with bots in every seat; returns a summary.
  function simulate(opts = {}) {
    const keep = state;
    newGame({ ...opts, bot: true });
    const dt = 1 / 20;
    while (state.winner < 0 && state.t < (opts.limit || 1800)) {
      step(dt);
      state.parts.length = 0;
    }
    const out = {
      winner: state.winner,
      t: Math.round(state.t),
      towers: state.players.map((p) => p.towers),
      out: state.players.map((p) => Math.round(p.out)),
    };
    state = keep;
    background = null;
    return out;
  }

  // Hooks for automated testing (?autoplay plays with a bot).
  window.__ng = {
    get state() { return state; },
    start,
    send,
    upgrade,
    simulate,
    step,
    towerAt,
    newGame,
  };

  if (AUTOPLAY) start();
  else showMenu();
  requestAnimationFrame(frame);
})();
