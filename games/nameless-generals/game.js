'use strict';

// Nameless Generals: towers joined by roads. Every tower you hold raises
// soldiers, and the more towers you hold the faster they all raise them.
// Drag from your towers to a connected tower to march soldiers there and
// take it. Forges, watchtowers and shrines are worth fighting over. Play a
// quick skirmish or the ten-level campaign. Everything is drawn on one
// canvas.

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

  // Special towers.
  const FORGE_POWER = 2; // soldiers marching out of a forge count double when attacking
  const WATCH_RANGE = 200; // a watchtower guards your towers this close to it
  const WATCH_DEF = 1.25; // ...and their defenders count this much more
  const SHRINE_BONUS = 0.15; // each shrine you hold: +15% production everywhere

  const KINDS = {
    forge: {
      name: 'Forge',
      color: '#ea580c',
      lines: ['Soldiers marching out of here', `count ×${FORGE_POWER} when they attack`],
    },
    watch: {
      name: 'Watchtower',
      color: '#0891b2',
      lines: [`Your towers nearby defend +${Math.round((WATCH_DEF - 1) * 100)}%`, 'and armies coming at them are revealed'],
    },
    shrine: {
      name: 'Shrine',
      color: '#ca8a04',
      lines: ['While you hold it, all your towers', `raise soldiers ${Math.round(SHRINE_BONUS * 100)}% faster`],
    },
  };

  const SIZES = {
    small: { towers: 12, label: 'Small', specials: { forge: 1, shrine: 1 } },
    medium: { towers: 18, label: 'Medium', specials: { forge: 1, watch: 1, shrine: 1 } },
    large: { towers: 26, label: 'Large', specials: { forge: 2, watch: 2, shrine: 1 } },
  };

  // AI: seconds between decisions, and how much extra it wants before attacking.
  // The hidden ones are only used by the campaign.
  const SKILL = {
    recruit: { think: 3.2, margin: 1.5, upgrade: 0.2, label: 'Recruit', hidden: true },
    easy: { think: 2.4, margin: 1.35, upgrade: 0.3, label: 'Easy' },
    normal: { think: 1.5, margin: 1.15, upgrade: 0.5, label: 'Normal' },
    hard: { think: 0.9, margin: 1.05, upgrade: 0.75, label: 'Hard' },
    brutal: { think: 0.7, margin: 1.0, upgrade: 0.85, label: 'Brutal', hidden: true },
  };

  const PLAYERS = [
    { name: 'You', color: '#2563eb' },
    { name: 'Crimson', color: '#dc2626' },
    { name: 'Verdant', color: '#16a34a' },
    { name: 'Amber', color: '#d97706' },
  ];
  const NEUTRAL = '#a8a29e';

  // Campaign. Each level is a fixed seed, so its map is the same every time.
  // Stars: 'time' levels give two and three stars for finishing within the
  // two times; 'towers' levels for holding that many towers at the end.
  const LEVELS = [
    {
      name: 'Green Banners',
      blurb: 'One sleepy rival and a quiet valley. Learn the roads, then take every tower.',
      goal: { type: 'conquer' }, rivals: 1, towers: 10, ai: 'recruit', seed: 1101, specials: {}, weather: 'clear',
      stars: [240, 150],
    },
    {
      name: 'The Iron Forge',
      blurb: 'A forge stands between you and Crimson. Soldiers marching out of it hit twice as hard.',
      goal: { type: 'capital' }, rivals: 1, towers: 12, ai: 'recruit', seed: 2207, specials: { forge: 1 },
      stars: [210, 130],
    },
    {
      name: 'Two Fronts',
      blurb: 'Crimson and Verdant both want the valley. A shrine in the middle speeds up whoever holds it.',
      goal: { type: 'conquer' }, rivals: 2, towers: 14, ai: 'easy', seed: 3101, specials: { shrine: 1 },
      stars: [420, 270],
    },
    {
      name: 'Watchers on the Ridge',
      blurb: 'Two watchtowers overlook the ridge. Claim the land and hold it.',
      goal: { type: 'hold', towers: 8, secs: 45 }, rivals: 1, towers: 16, ai: 'normal', seed: 4106, specials: { watch: 2 },
      stars: [200, 130],
    },
    {
      name: 'Holy Ground',
      blurb: 'Two shrines, two rivals. Hold both shrines at once to win the faithful.',
      goal: { type: 'shrines', secs: 30 }, rivals: 2, towers: 16, ai: 'normal', seed: 5106, specials: { shrine: 2, forge: 1 },
      stars: [240, 160],
    },
    {
      name: 'Clean Sweep',
      blurb: 'The king is watching. Defeat Crimson without giving up a single tower.',
      goal: { type: 'flawless' }, rivals: 1, towers: 14, ai: 'easy', seed: 6107, specials: { watch: 1, forge: 1 }, weather: 'rain',
      stars: [330, 220],
    },
    {
      name: 'Outnumbered',
      blurb: 'Both rivals start a tower up on you. Strike first, strike hard.',
      goal: { type: 'conquer' }, rivals: 2, towers: 18, ai: 'normal', seed: 7107, setup: 'outnumbered',
      specials: { forge: 1, watch: 1, shrine: 1 }, stars: [560, 400],
    },
    {
      name: 'Siege of Crimson',
      blurb: 'Crimson\'s capital is a level 3 fortress behind well-garrisoned strongholds. Bring forges.',
      goal: { type: 'capital' }, rivals: 1, towers: 18, ai: 'hard', seed: 8104, setup: 'fortress',
      specials: { forge: 2, watch: 1 }, stars: [330, 220],
    },
    {
      name: 'Last Stand',
      blurb: 'Three hard rivals close in from every side. Your fortress must not fall.',
      goal: { type: 'survive', secs: 180 }, rivals: 3, towers: 20, ai: 'hard', seed: 9109, setup: 'surrounded',
      specials: { watch: 2, shrine: 1 }, stars: [4, 7], starKind: 'towers',
    },
    {
      name: 'Nameless No More',
      blurb: 'Every rival, every relic, one great map. Win it all and the bards will finally learn your name.',
      goal: { type: 'conquer' }, rivals: 3, towers: 24, ai: 'brutal', seed: 10101,
      specials: { forge: 2, watch: 2, shrine: 2 }, stars: [900, 600],
    },
  ];

  const params = new URLSearchParams(location.search);
  const AUTOPLAY = params.has('autoplay');
  const SPEED = Math.min(32, Math.max(0.25, Number(params.get('speed')) || 1));

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const ease = (k) => 1 - (1 - clamp(k, 0, 1)) ** 3;
  const lerp = (a, b, k) => a + (b - a) * k;

  function shade(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const f = (c) => clamp(Math.round(c + (amount < 0 ? c : 255 - c) * amount), 0, 255);
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }

  function formatTime(t) {
    t = Math.max(0, Math.floor(t));
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  }

  // Small seeded random generator: campaign maps and scenery stay put.
  function seeded(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Screen shake and the final zoom are skipped for people who ask for less motion.
  const motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reducedMotion = () => !!(motionQuery && motionQuery.matches);

  const DEFAULT_SAVE = {
    wins: 0, games: 0, opponents: 2, skill: 'normal', size: 'medium', fastest: null,
    specials: true, tutorial: false, stars: [], best: [],
  };

  function loadSave() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s && typeof s === 'object') {
        const out = { ...DEFAULT_SAVE, ...s };
        if (!Array.isArray(out.stars)) out.stars = [];
        if (!Array.isArray(out.best)) out.best = [];
        if (!SKILL[out.skill] || SKILL[out.skill].hidden) out.skill = 'normal';
        if (!SIZES[out.size]) out.size = 'medium';
        return out;
      }
    } catch {
      // Fall through to defaults.
    }
    return { ...DEFAULT_SAVE, stars: [], best: [] };
  }

  const save = loadSave();

  function writeSave() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    } catch {
      // Storage can be unavailable (private mode); progress is just not kept.
    }
  }

  const levelStars = (k) => save.stars[k] || 0;
  const totalStars = () => LEVELS.reduce((s, _, k) => s + levelStars(k), 0);
  const levelOpen = (k) => k === 0 || levelStars(k - 1) > 0;

  // ---------------------------------------------------------------------------
  // Sound (tiny WebAudio synth)
  // ---------------------------------------------------------------------------

  const Sound = {
    ctx: null,
    out: null,
    noiseBuf: null,
    muted: false,
    last: {},

    unlock() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        // A gentle compressor keeps big battles from clipping.
        this.out = this.ctx.createDynamicsCompressor();
        this.out.threshold.value = -18;
        this.out.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    },

    // Plays unless muted, rate-limited per sound. The menu's demo battle
    // and bot simulations stay silent.
    play(name, gap, fn) {
      if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
      if (state && (state.sim || state.mode === 'menu')) return;
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
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.out);
      o.start(t);
      o.stop(t + dur + 0.02);
    },

    // Filtered white noise: whooshes, clinks and thumps.
    noise(dur, vol, freq, type = 'bandpass', slideTo = 0, delay = 0, q = 1) {
      const c = this.ctx;
      if (!this.noiseBuf) {
        this.noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      const t = c.currentTime + delay;
      const s = c.createBufferSource();
      s.buffer = this.noiseBuf;
      const f = c.createBiquadFilter();
      f.type = type;
      f.Q.value = q;
      f.frequency.setValueAtTime(freq, t);
      if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f).connect(g).connect(this.out);
      s.start(t, Math.random() * 0.5);
      s.stop(t + dur + 0.02);
    },

    select() { this.play('select', 0.03, () => this.tone(660, 0.05, 'sine', 0.05)); },
    send(big) {
      this.play('send', 0.06, () => {
        this.noise(0.22, big ? 0.09 : 0.06, 500, 'bandpass', 2600, 0, 1.2);
        this.tone(440, 0.07, 'triangle', 0.05);
        this.tone(660, 0.09, 'triangle', 0.045, null, 0.05);
        if (big) this.tone(880, 0.1, 'triangle', 0.035, null, 0.1);
      });
    },
    clash() {
      this.play('clash', 0.07, () => {
        this.noise(0.05, 0.05, 3200 + Math.random() * 1500, 'highpass');
        this.tone(900 + Math.random() * 500, 0.04, 'square', 0.012);
      });
    },
    roadFight() { this.play('road', 0.1, () => { this.tone(220, 0.08, 'square', 0.025, 140); this.noise(0.12, 0.05, 900); }); },
    capture() {
      this.play('capture', 0.12, () => {
        this.tone(150, 0.28, 'sine', 0.16, 50);
        this.noise(0.18, 0.06, 1200, 'lowpass', 300);
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.055, null, 0.04 + i * 0.05));
      });
    },
    lost() {
      this.play('lost', 0.2, () => {
        this.tone(330, 0.3, 'sawtooth', 0.045, 140);
        this.noise(0.3, 0.06, 500, 'lowpass', 120);
      });
    },
    upgrade() {
      this.play('upgrade', 0.2, () => {
        [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.16, 'sine', 0.06, null, i * 0.045));
        this.noise(0.4, 0.03, 6000, 'highpass', 0, 0.12);
      });
    },
    bad() { this.play('bad', 0.2, () => this.tone(180, 0.12, 'square', 0.03)); },
    warn() { this.play('warn', 1.5, () => [0, 0.13].forEach((d) => this.tone(980, 0.07, 'square', 0.022, null, d))); },
    ding() { this.play('ding', 0.1, () => { this.tone(880, 0.12, 'sine', 0.06); this.tone(1320, 0.2, 'sine', 0.05, null, 0.08); }); },
    star(i) { this.play(`star${i}`, 0.05, () => { this.tone(660 * 2 ** (i * 4 / 12), 0.3, 'triangle', 0.07); this.noise(0.25, 0.03, 7000, 'highpass'); }); },
    eliminated() {
      this.play('elim', 0.5, () => [784, 659, 523, 392].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.06, null, i * 0.09)));
    },
    win() {
      this.play('end', 1, () => {
        this.tone(110, 0.6, 'sine', 0.18, 45);
        this.noise(0.5, 0.06, 2000, 'lowpass', 200);
        [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.45, 'triangle', 0.08, null, 0.1 + i * 0.13));
      });
    },
    lose() {
      this.play('end', 1, () => [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.45, 'sawtooth', 0.05, null, i * 0.2)));
    },
  };

  // ---------------------------------------------------------------------------
  // Map: towers placed apart, joined by roads that never cross
  // ---------------------------------------------------------------------------

  const MAP = { x0: 50, x1: W - 50, y0: 140, y1: H - 36 };
  // Keep towers out from under the bottom corner panels.
  const clearOfHud = (p) => !(p.y > H - 95 && (p.x < 330 || p.x > W - 330));

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

  // Builds a map from `rng`, so the same seed always makes the same map.
  function makeMap(n, nPlayers, rng, specials = {}) {
    const rand = (lo, hi) => lo + rng() * (hi - lo);
    const randInt = (lo, hi) => Math.floor(rand(lo, hi + 1));
    const area = (MAP.x1 - MAP.x0) * (MAP.y1 - MAP.y0);
    const minD = Math.sqrt(area / n) * 0.72;
    for (let attempt = 0; attempt < 300; attempt++) {
      const towers = [];
      for (let tries = 0; tries < 4000 && towers.length < n; tries++) {
        const p = { x: rand(MAP.x0, MAP.x1), y: rand(MAP.y0, MAP.y1) };
        if (clearOfHud(p) && towers.every((t) => dist(t, p) >= minD)) towers.push(p);
      }
      if (towers.length < n) continue;
      towers.forEach((t, i) => Object.assign(t, {
        i, owner: -1, n: 0, level: 1, capital: false, kind: null, links: [], watchers: [],
        pop: 0, flash: 0, wipe: 0, wipeFrom: null, smokeT: rand(0, 2),
      }));

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
        t.level = rng() < 0.25 ? 2 : 1;
        t.n = randInt(6, 14) + (t.level - 1) * 8;
      }
      placeSpecials(towers, caps, hops, specials, rng);
      for (const t of towers) t.watchers = towers.filter((w) => w.kind === 'watch' && dist(w, t) <= WATCH_RANGE).map((w) => w.i);
      return { towers, roads, caps };
    }
    throw new Error('Could not generate a map');
  }

  // Specials go on contested ground: about as far from every capital, never
  // right next to one, and spread apart from each other.
  function placeSpecials(towers, caps, hops, specials, rng) {
    const kinds = [];
    for (const k of ['shrine', 'forge', 'watch']) for (let j = 0; j < (specials[k] || 0); j++) kinds.push(k);
    const taken = [];
    for (const kind of kinds) {
      let best = null;
      let bestScore = -Infinity;
      for (const t of towers) {
        if (t.owner >= 0 || t.kind) continue;
        const ds = caps.map((c) => hops[c][t.i]);
        const near = Math.min(...ds);
        const spread = Math.max(...ds) - near;
        const apart = taken.length ? Math.min(...taken.map((j) => hops[j][t.i])) : 4;
        // Tall specials by the top edge would poke their labels into the HUD.
        const score = -spread * 3 + Math.min(apart, 4) * 2 - (near < 2 ? 8 : 0) - (t.y < 200 ? 5 : 0) + rng() * 1.5;
        if (score > bestScore) {
          bestScore = score;
          best = t;
        }
      }
      if (!best) break;
      best.kind = kind;
      best.n += kind === 'shrine' ? 8 : kind === 'forge' ? 6 : 4;
      taken.push(best.i);
    }
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

  // opts: { opponents, size, skill, specials, seed, bot, level }. With a
  // level, the campaign's map, rivals and objective are used instead.
  function newGame(opts = {}) {
    const lv = opts.level >= 0 && LEVELS[opts.level] ? LEVELS[opts.level] : null;
    const nPlayers = 1 + (lv ? lv.rivals : opts.opponents ?? save.opponents);
    const sizeKey = opts.size || save.size;
    const seed = lv ? lv.seed : opts.seed ?? (Math.random() * 2 ** 32) >>> 0;
    const rng = seeded(seed);
    const useSpecials = opts.specials ?? save.specials;
    const specials = lv ? lv.specials : useSpecials ? SIZES[sizeKey].specials : {};
    const map = makeMap(lv ? lv.towers : SIZES[sizeKey].towers, nPlayers, rng, specials);
    const skillKey = lv ? lv.ai : opts.skill || save.skill;
    const bot = AUTOPLAY || !!opts.bot;
    state = {
      mode: 'playing',
      towers: map.towers,
      roads: map.roads,
      caps: map.caps,
      t: 0,
      skillKey,
      skill: SKILL[skillKey],
      sizeKey,
      level: lv ? opts.level : -1,
      goal: lv ? lv.goal : { type: 'conquer' },
      goalsOn: !!lv,
      hold: 0,
      seed,
      sim: false,
      weather: lv && lv.weather ? lv.weather : rng() < 0.35 ? 'rain' : 'clear',
      dayPhase: 0.1 + rng() * 0.2, // games start in the morning
      players: map.caps.map((c, k) => ({
        id: k,
        name: PLAYERS[k].name,
        color: PLAYERS[k].color,
        alive: true,
        ai: k > 0 || bot ? { think: rand(0.5, 1.5) } : null,
        towers: 1,
        shrines: 0,
        soldiers: 20,
        out: 0,
      })),
      groups: [],
      parts: [],
      rings: [],
      floats: [],
      smoke: [],
      texts: [],
      sel: [],
      drag: null,
      frac: 0.5,
      lastSend: null,
      winner: -1,
      result: null,
      endT: 0,
      finale: null,
      watching: false,
      shake: 0,
      lastCapture: null,
      lastLoss: null,
      tut: !bot && !save.tutorial && (!lv || opts.level === 0) ? { step: 0, t: 0, target: -1 } : null,
      stats: { sent: 0, captured: 0, lost: 0, peak: 1 },
    };
    if (lv && lv.setup) SETUPS[lv.setup]();
    if (state.tut) {
      // Point the first lesson at the weakest neighbour, and make sure half
      // the capital's soldiers can take it.
      const cap = state.towers[state.caps[0]];
      const near = cap.links.map((j) => state.towers[j]).filter((t) => t.owner < 0).sort((a, b) => a.n - b.n)[0];
      if (near) {
        near.n = Math.min(near.n, 7);
        state.tut.target = near.i;
      }
    }
    background = null;
    if (lv && !bot) banner(`Level ${opts.level + 1}: ${goalText(lv.goal, lv.rivals)}`, '#1c1917');
  }

  // Campaign twists applied after the map is made.
  const SETUPS = {
    // Every rival starts with its weakest neighbour already taken.
    outnumbered() {
      for (const p of state.players.slice(1)) grabNear(p.id, 1, 14);
    },
    // Crimson's capital is a level 3 fortress, and the towers around it are
    // well-garrisoned strongholds.
    fortress() {
      const T = state.towers;
      const c = T[state.caps[1]];
      Object.assign(c, { level: 3, n: 50 });
      for (const j of c.links) {
        const t = T[j];
        if (t.owner < 0 && !t.kind) Object.assign(t, { level: 2, n: Math.max(t.n, 24) });
      }
      T[state.caps[0]].n += 10;
    },
    // Rivals start a tower up; your capital is a level 3 fortress.
    surrounded() {
      for (const p of state.players.slice(1)) grabNear(p.id, 1, 10);
      Object.assign(state.towers[state.caps[0]], { level: 3, n: 45 });
    },
  };

  function grabNear(id, k, n) {
    const T = state.towers;
    T[state.caps[id]].links
      .map((j) => T[j])
      .filter((t) => t.owner < 0 && !t.kind)
      .sort((a, b) => a.n - b.n)
      .slice(0, k)
      .forEach((t) => Object.assign(t, { owner: id, n }));
  }

  function goalText(g, rivals) {
    if (g.type === 'capital') return rivals > 1 ? 'Take the enemy capitals' : 'Take the enemy capital';
    if (g.type === 'hold') return `Hold ${g.towers} towers for ${g.secs} s`;
    if (g.type === 'shrines') return `Hold every shrine for ${g.secs} s`;
    if (g.type === 'flawless') return 'Win without losing a tower';
    if (g.type === 'survive') return `Survive for ${formatTime(g.secs)}`;
    return rivals >= 3 ? `Beat all ${rivals} rivals` : rivals === 2 ? 'Beat both rivals' : 'Defeat your rival';
  }

  function starRules(lv) {
    const [a, b] = lv.stars;
    if (lv.starKind === 'towers') return [`hold ${a}+ towers at the end`, `hold ${b}+ towers at the end`];
    return [`finish within ${formatTime(a)}`, `finish within ${formatTime(b)}`];
  }

  function starsEarned() {
    const lv = LEVELS[state.level];
    if (!lv || !state.result || !state.result.won) return 0;
    const [a, b] = lv.stars;
    if (lv.starKind === 'towers') return 1 + (me().towers >= a) + (me().towers >= b);
    return 1 + (state.t <= a) + (state.t <= b);
  }

  const me = () => state.players[0];
  const colorOf = (owner) => (owner >= 0 ? state.players[owner].color : NEUTRAL);
  const towerCap = (t) => CAP[t.level] * (t.capital ? 1.2 : 1);
  // Your watchtower guards the towers you hold around it.
  const guarded = (t) => t.owner >= 0 && t.watchers.some((w) => state.towers[w].owner === t.owner);
  const defMul = (t) => DEF[t.level] * (guarded(t) ? WATCH_DEF : 1);
  const power = (t) => (t.kind === 'forge' ? FORGE_POWER : 1);

  function productionRate(t) {
    if (t.owner < 0) return 0;
    const p = state.players[t.owner];
    return PROD[t.level] * (t.capital ? 1.2 : 1) * (1 + PER_TOWER_BONUS * (p.towers - 1) + SHRINE_BONUS * p.shrines);
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

  // Every tower the `sources` can march to: anything next to a tower they
  // reach through their owner's land.
  function reachable(owner, sources) {
    const T = state.towers;
    const out = new Set();
    for (const s of sources) {
      const d = bfsHops(T, s, (t) => t.owner === owner);
      T.forEach((t, i) => {
        if (d[i] === Infinity) return;
        if (i !== s) out.add(i);
        for (const j of t.links) out.add(j);
      });
    }
    for (const s of sources) out.delete(s);
    return out;
  }

  // Sends a share of the soldiers in each source tower to `to`.
  function send(owner, sources, to, frac) {
    let sent = 0;
    let from = 0;
    for (const s of sources) {
      const t = state.towers[s];
      if (s === to || t.owner !== owner) continue;
      const amount = Math.floor(t.n * frac);
      if (amount < 1) continue;
      const path = route(owner, s, to);
      if (!path) continue;
      t.n -= amount;
      state.groups.push({ id: nextGroup++, owner, path, leg: 0, d: 0, n: amount, power: power(t), siege: false });
      sent += amount;
      from++;
    }
    if (sent && owner === 0) {
      state.stats.sent += sent;
      Sound.send(sent >= 30);
      tutEvent('send', from);
    }
    return sent;
  }

  // What sending the selection to `to` would do: soldiers sent, and how
  // many would be left over after beating the defenders (negative: short).
  function preview(sources, to) {
    const T = state.towers;
    const t = T[to];
    let count = 0;
    let strength = 0;
    let far = 0;
    for (const s of sources) {
      if (s === to || T[s].owner !== 0) continue;
      const path = route(0, s, to);
      if (!path) continue;
      const amount = Math.floor(T[s].n * state.frac);
      count += amount;
      strength += amount * power(T[s]);
      let len = 0;
      for (let k = 1; k < path.length; k++) len += dist(T[path[k - 1]], T[path[k]]);
      far = Math.max(far, len);
    }
    if (t.owner === 0) return { count, own: true };
    const inc = incoming(0, to);
    const growth = t.owner >= 0 ? productionRate(t) * (far / MARCH) : 0;
    const def = Math.min(towerCap(t) * 1.2, t.n + growth) * defMul(t) - inc.minePow;
    return { count, own: false, spare: Math.floor(strength - def), eta: far / MARCH };
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
    if (owner === 0) {
      Sound.upgrade();
      const cy = t.y - towerH(t) / 2;
      ring(t.x, cy, '#f59e0b', 60, 0.7);
      burst(t.x, t.y - towerH(t), '#fde68a', 16, true);
      floatText(t.x, t.y - towerH(t) - 40, `Level ${t.level}!`, '#b45309', 1);
      tutEvent('upgrade');
    }
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
    for (const p of state.players) {
      p.towers = 0;
      p.shrines = 0;
    }
    for (const t of T) {
      if (t.owner < 0) continue;
      const p = state.players[t.owner];
      p.towers++;
      if (t.kind === 'shrine') p.shrines++;
    }

    for (const t of T) {
      t.pop = Math.max(0, t.pop - dt * 2.5);
      t.flash = Math.max(0, t.flash - dt * 3);
      t.wipe = Math.max(0, t.wipe - dt * 1.4);
      if (t.owner < 0) continue;
      const cap = towerCap(t);
      if (t.n < cap) t.n = Math.min(cap, t.n + productionRate(t) * dt);
      else t.n -= (t.n - cap) * 0.04 * dt;
    }

    // March. An army reaching a hostile tower lays siege to it.
    for (const g of state.groups) {
      if (g.n <= 0) continue;
      if (g.siege) {
        siegeTick(g, dt);
        continue;
      }
      g.d += MARCH * dt;
      const a = g.path[g.leg];
      const b = g.path[g.leg + 1];
      const L = roadLength(a, b);
      if (g.d < L) continue;
      const last = g.leg + 1 === g.path.length - 1;
      if (!last && T[b].owner === g.owner) {
        g.leg++;
        g.d -= L;
      } else if (T[b].owner === g.owner) {
        reinforce(g, T[b]);
      } else {
        // The road ahead was cut: fight for the tower in the way.
        g.path = g.path.slice(0, g.leg + 2);
        g.d = L;
        startSiege(g, T[b]);
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
          const m = Math.min(g1.n * g1.power, g2.n * g2.power);
          g1.n = Math.max(0, g1.n - m / g1.power);
          g2.n = Math.max(0, g2.n - m / g2.power);
          if (g1.n < 1e-6) g1.n = 0;
          if (g2.n < 1e-6) g2.n = 0;
          if (state.sim) continue;
          const p = groupPos(g1.n > 0 ? g1 : g2);
          burst(p.x, p.y, '#78716c', 12);
          burst(p.x, p.y - 4, '#fde68a', 8, true);
          ring(p.x, p.y, '#fff', 26, 0.4);
          if (g1.owner === 0 || g2.owner === 0) {
            Sound.roadFight();
            floatText(p.x, p.y - 22, `-${Math.round(m)}`, '#57534e', 0);
          }
        }
      }
    }
    state.groups = state.groups.filter((g) => g.n > 0);

    // AI. Rivals wait while you read the first lesson.
    for (const p of state.players) {
      if (!p.ai || !p.alive || (state.tut && state.tut.step === 0)) continue;
      p.ai.think -= dt;
      if (p.ai.think <= 0) {
        p.ai.think = state.skill.think * rand(0.8, 1.2) * (p.id === 0 ? SKILL.normal.think / state.skill.think : 1);
        if (state.tut) p.ai.think *= 1.6;
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
        if (p.id !== 0) Sound.eliminated();
      }
    }

    // Is the game over?
    if (state.winner < 0) {
      const alive = state.players.filter((p) => p.alive);
      if (alive.length === 1) {
        state.winner = alive[0].id;
        if (!state.result) endGame(state.winner === 0, state.winner === 0 ? 'conquest' : 'conquered');
        else if (state.watching) state.endT = 1.5;
      } else if (!state.result) {
        if (!me().alive && !me().ai) endGame(false, 'eliminated');
        else if (state.goalsOn && me().alive) checkGoal(dt);
      }
    }
    return total;
  }

  // Campaign objectives other than plain conquest.
  function checkGoal(dt) {
    const g = state.goal;
    const T = state.towers;
    if (g.type === 'capital') {
      if (state.caps.slice(1).every((c) => T[c].owner === 0)) endGame(true, 'capital');
    } else if (g.type === 'hold' || g.type === 'shrines') {
      const ok = g.type === 'hold' ? me().towers >= g.towers : T.every((t) => t.kind !== 'shrine' || t.owner === 0);
      if (ok && state.hold === 0) banner(`Hold on for ${g.secs} seconds!`, '#1d4ed8');
      else if (!ok && state.hold > 3) banner('The hold was broken', '#b91c1c');
      state.hold = ok ? state.hold + dt : 0;
      if (state.hold >= g.secs) endGame(true, g.type);
    } else if (g.type === 'flawless') {
      if (state.stats.lost > 0) endGame(false, 'flawless');
    } else if (g.type === 'survive') {
      if (state.t >= g.secs) endGame(true, 'survive');
    }
  }

  // Decides the game, then plays the slow-motion finale before the results.
  function endGame(won, reason) {
    state.result = { won, reason };
    if (state.sim || state.mode === 'menu') return;
    const T = state.towers;
    let focus = null;
    if (won && state.lastCapture && state.lastCapture.owner === 0 && state.t - state.lastCapture.t < 3) focus = state.lastCapture;
    else if (!won && state.lastLoss && state.t - state.lastLoss.t < 3) focus = state.lastLoss;
    if (!focus) {
      const mine = T.filter((t) => t.owner === 0).sort((a, b) => b.n - a.n)[0];
      focus = mine ? { x: mine.x, y: mine.y - towerH(mine) / 2 } : { x: W / 2, y: H / 2 };
    }
    const winner = state.winner >= 0 ? state.players[state.winner] : null;
    const SUBS = {
      conquest: 'The map is yours',
      conquered: winner ? `${winner.name} takes the map` : 'The map is lost',
      eliminated: 'Your last tower has fallen',
      capital: state.caps.length > 2 ? 'Their capitals are yours' : 'Their capital is yours',
      hold: 'The land is held',
      shrines: 'The shrines are yours',
      survive: 'You held the line',
      flawless: 'You lost a tower',
    };
    state.finale = {
      t: 0,
      dur: 2.8,
      x: focus.x,
      y: focus.y,
      won,
      title: won ? 'Victory!' : state.level >= 0 ? 'Mission failed' : 'Defeat',
      sub: SUBS[reason] || '',
    };
    state.sel = [];
    state.drag = null;
    if (won) {
      Sound.win();
      shakeIt(10);
      for (let k = 0; k < 3; k++) ring(focus.x, focus.y, k ? '#fde68a' : me().color, 140 + k * 70, 1 + k * 0.3);
    } else {
      Sound.lose();
      shakeIt(6);
    }
  }

  function startSiege(g, t) {
    g.siege = true;
    g.st = 0;
    g.hurt = 0;
    g.ft = 0.2;
    // Bigger fights take a little longer, but never more than ~1.3 s.
    g.rate = 6 + 0.8 * Math.min(g.n * g.power, t.n * defMul(t));
    if (g.owner === 0 || t.owner === 0) Sound.clash();
  }

  // Attackers and defenders trade blows until one side is gone.
  function siegeTick(g, dt) {
    const t = state.towers[g.path[g.path.length - 1]];
    if (t.owner === g.owner) {
      reinforce(g, t);
      return;
    }
    const D = defMul(t);
    const x = Math.min(g.rate * dt, g.n * g.power, t.n * D);
    g.n -= x / g.power;
    t.n -= x / D;
    g.st += dt;
    g.hurt += x / D;
    t.flash = 1;
    if (state.sim) {
      // Skip the show.
    } else {
      const seen = g.owner === 0 || t.owner === 0;
      if (Math.random() < dt * 16) spark(t, g);
      if (seen) Sound.clash();
      g.ft -= dt;
      if (g.ft <= 0) {
        g.ft = 0.35;
        if (seen && g.hurt >= 1) {
          const k = Math.floor(g.hurt);
          g.hurt -= k;
          floatText(t.x + rand(-10, 10), t.y - towerH(t) - 24, `-${k}`, t.owner === 0 ? '#b91c1c' : '#57534e', 0);
        }
      }
    }
    if (t.n <= 1e-6 && g.n > 1e-6) capture(t, g);
    else if (g.n <= 1e-6) {
      g.n = 0;
      t.n = Math.max(0, t.n);
      if (t.owner === 0 && !state.sim) floatText(t.x, t.y - towerH(t) - 40, 'Held!', '#1d4ed8', 0);
    }
  }

  function reinforce(g, t) {
    t.n += g.n;
    if (!state.sim && t.owner === 0 && g.n >= 1) {
      floatText(t.x + 14, t.y - towerH(t) - 26, `+${Math.floor(g.n)}`, colorOf(0), 0);
      ring(t.x, t.y, colorOf(0), 34, 0.4);
    }
    g.n = 0;
  }

  function capture(t, g) {
    const before = t.owner;
    t.wipeFrom = colorOf(before);
    t.owner = g.owner;
    t.n = g.n;
    g.n = 0;
    t.pop = 1;
    t.wipe = 1;
    const cy = t.y - towerH(t) / 2;
    state.lastCapture = { x: t.x, y: cy, t: state.t, owner: t.owner };
    const ai = state.players[t.owner].ai;
    if (ai) ai.lastCapture = state.t;
    if (t.owner === 0) state.stats.captured++;
    else if (before === 0) {
      state.stats.lost++;
      state.lastLoss = { x: t.x, y: cy, t: state.t };
    }
    if (state.sim) return;
    const col = colorOf(t.owner);
    ring(t.x, cy, col, 95, 0.8);
    ring(t.x, t.y, '#fff', 55, 0.5);
    burst(t.x, cy, col, 26);
    burst(t.x, cy, '#fde68a', 12, true);
    const top = t.y - towerH(t) - 46;
    if (t.owner === 0) {
      Sound.capture();
      shakeIt(5);
      floatText(t.x, top, t.kind ? `${KINDS[t.kind].name} taken!` : 'Captured!', col, 1);
      tutEvent('capture');
    } else if (before === 0) {
      Sound.lost();
      shakeIt(7);
      floatText(t.x, top, 'Lost!', '#b91c1c', 1);
    } else {
      shakeIt(1.5);
    }
    if (t.kind) banner(`${state.players[t.owner].name === 'You' ? 'You hold' : `${state.players[t.owner].name} holds`} the ${KINDS[t.kind].name.toLowerCase()}`, col);
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
    if (state.sim || state.mode === 'menu') return;
    state.texts.push({ text, color, t: 3 });
    if (state.texts.length > 3) state.texts.shift();
  }

  // ---------------------------------------------------------------------------
  // AI
  // ---------------------------------------------------------------------------

  // Soldiers already heading for tower i: friendly (and their attack
  // strength) and hostile attack strength.
  function incoming(owner, i) {
    let mine = 0;
    let minePow = 0;
    let theirs = 0;
    for (const g of state.groups) {
      if (g.path[g.path.length - 1] !== i) continue;
      if (g.owner === owner) {
        mine += g.n;
        minePow += g.n * g.power;
      } else theirs += g.n * g.power;
    }
    return { mine, minePow, theirs };
  }

  const KIND_VALUE = { shrine: 9, forge: 7, watch: 5 };

  function aiThink(p) {
    const T = state.towers;
    const sk = p.id === 0 ? SKILL.normal : state.skill;
    const own = T.filter((t) => t.owner === p.id);
    if (!own.length) return;
    const isFront = (t) => t.links.some((j) => T[j].owner !== p.id);

    // 1. Defend towers that are about to fall (specials most of all).
    for (const t of own) {
      const inc = incoming(p.id, t.i);
      if (inc.theirs > t.n * defMul(t) + inc.mine - (t.kind ? 6 : 2)) {
        const helpers = t.links.map((j) => T[j]).filter((o) => o.owner === p.id && o.n > 6);
        if (helpers.length) send(p.id, helpers.map((o) => o.i), t.i, 0.6);
      }
    }

    // 2. Attack the best neighbouring tower we can take together. Forges a
    // couple of roads back join in: their soldiers hit twice as hard.
    // After a long stand-off it attacks with everything; after a long time
    // without a capture it stops trickling soldiers forward and sends one
    // big wave from every tower in reach instead.
    const bold = state.t - (p.ai.lastAttack || 0) > 30;
    const stalled = state.t - (p.ai.lastCapture || 0) > 90;
    const hopsFrom = new Map();
    const hopsOf = (o) => {
      if (!hopsFrom.has(o.i)) hopsFrom.set(o.i, bfsHops(T, o.i, (x) => x.owner === p.id));
      return hopsFrom.get(o.i);
    };
    const extra = own.filter((t) => (t.kind === 'forge' && t.n >= 8) || (stalled && t.n >= 6));
    let best = null;
    for (const c of T) {
      if (c.owner === p.id) continue;
      const sup = c.links.map((j) => T[j]).filter((o) => o.owner === p.id && o.n >= 4);
      for (const o of extra) {
        const reach = o.kind === 'forge' && !stalled ? 2 : 4;
        if (!sup.includes(o) && c.links.some((j) => T[j].owner === p.id && hopsOf(o)[j] <= reach)) sup.push(o);
      }
      if (!sup.length) continue;
      const inc = incoming(p.id, c.i);
      // Neutral towers do not grow; enemy towers grow while we march.
      const march = Math.max(...sup.map((o) => dist(o, c))) / MARCH;
      const growth = c.owner >= 0 ? productionRate(c) * march : 0;
      // Grow bolder as the game drags on, and throw everything in after a
      // long stand-off (two equal stacks would otherwise stare forever).
      if (!p.ai.wave) p.ai.wave = rand(1.25, 2.2); // each big wave waits for a different edge
      const margin = stalled ? p.ai.wave : bold ? 1 : Math.max(1, sk.margin - state.t / 1500);
      const need = (c.n + growth) * defMul(c) * margin + 2 - inc.minePow;
      if (need <= 0) continue;
      const avail = sup.reduce((s, o) => s + o.n * (bold ? 1 : 0.85) * power(o), 0);
      if (avail < need) continue;
      let value = c.owner < 0 ? 10 : 13;
      if (c.capital) value += 8;
      if (c.kind) value += KIND_VALUE[c.kind];
      value += (c.level - 1) * 5;
      // Prefer to finish off weak rivals.
      if (c.owner >= 0 && state.players[c.owner].towers <= 2) value += 10;
      const score = value / (need + 8);
      if (!best || score > best.score) best = { score, c, sup, need, avail };
    }
    if (best) {
      const frac = stalled ? 1 : bold ? clamp(best.need / best.avail + 0.05, 0.35, 1) : clamp(best.need / best.avail * 0.85 + 0.1, 0.35, 0.85);
      send(p.id, best.sup.map((o) => o.i), best.c.i, frac);
      p.ai.lastAttack = state.t;
      if (stalled) p.ai.wave = 0;
    }

    // 3. Upgrade a safe tower now and then.
    if (!best && Math.random() < sk.upgrade) {
      const safe = own.filter((t) => !isFront(t) && canUpgrade(t) && t.n > UPGRADE[t.level] + 6);
      const t = safe.sort((a, b) => b.n - a.n)[0] || (own.length === 1 && canUpgrade(own[0]) && own[0].n > 45 ? own[0] : null);
      if (t) upgrade(p.id, t.i);
    }

    // 4. Move soldiers from every safe tower up to the front. Forges keep
    // theirs for attacks. In a long war, safe towers save up and upgrade
    // instead, which breaks even grinds at a single road.
    const fronts = own.filter(isFront);
    if (!fronts.length || stalled) return;
    const late = state.t > 480;
    for (const t of own) {
      if (isFront(t)) continue;
      if (late && t.level < 3) {
        if (canUpgrade(t) && Math.random() < sk.upgrade) upgrade(p.id, t.i);
        continue;
      }
      if (t.n < 12 || (t.kind === 'forge' && t.n < towerCap(t) - 2)) continue;
      const d = bfsHops(T, t.i, (o) => o.owner === p.id);
      let target = null;
      for (const f of fronts) if (d[f.i] !== Infinity && (!target || d[f.i] < d[target.i])) target = f;
      if (target) send(p.id, [t.i], target.i, 0.7);
    }
  }

  // ---------------------------------------------------------------------------
  // Tutorial: four short lessons the first time you play
  // ---------------------------------------------------------------------------

  const TUT = [
    'Drag from your blue tower to the glowing tower next to it to send soldiers.',
    'Your soldiers march down the road and fight the defenders. More soldiers wins!',
    'Click one of your towers, then press Upgrade (or U) so it raises soldiers faster.',
    'Drag a box around your towers (or press A), then click a target to attack with all of them.',
  ];

  function tutEvent(kind, n) {
    const tut = state.tut;
    if (!tut) return;
    const s = tut.step;
    if ((s === 0 && kind === 'send') || (s === 1 && kind === 'capture') || (s === 2 && kind === 'upgrade') || (s === 3 && kind === 'send' && n >= 2)) tutNext();
  }

  function tutNext() {
    const tut = state.tut;
    tut.step++;
    tut.t = 0;
    Sound.ding();
    if (tut.step >= TUT.length) endTutorial(true);
  }

  function endTutorial(done) {
    state.tut = null;
    save.tutorial = true;
    writeSave();
    if (done) banner('You are ready, General! Press R to repeat your last send.', '#1d4ed8');
  }

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  function burst(x, y, color, n, glow = false) {
    if (state.sim || state.parts.length > 500) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = rand(30, glow ? 150 : 110);
      state.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, life: rand(0.3, 0.7), color, size: rand(1.5, 3), glow });
    }
  }

  // A few bright sparks where the attackers hit the wall.
  function spark(t, g) {
    if (state.parts.length > 500) return;
    const a = state.towers[g.path[g.path.length - 2]];
    const L = dist(a, t) || 1;
    const ux = (a.x - t.x) / L;
    const uy = (a.y - t.y) / L;
    const x = t.x + ux * towerR(t) * 0.95 + rand(-5, 5);
    const y = t.y + uy * towerR(t) * 0.3 - rand(2, towerH(t) * 0.5);
    for (let k = 0; k < 3; k++) {
      state.parts.push({ x, y, vx: rand(-60, 60) + ux * 50, vy: rand(-110, -20), life: rand(0.15, 0.35), color: k ? '#fde68a' : '#fff7ed', size: rand(1.2, 2.4), glow: true });
    }
  }

  function ring(x, y, color, r1, dur = 0.7) {
    if (state.sim || state.mode === 'menu') return;
    state.rings.push({ x, y, color, r1, t: 0, dur });
  }

  function floatText(x, y, text, color, big = 0) {
    if (state.sim || state.mode === 'menu' || state.floats.length > 40) return;
    state.floats.push({ x, y, text, color, big, t: 0, dur: big ? 1.6 : 1.1 });
  }

  function shakeIt(a) {
    if (!state.sim && state.mode !== 'menu' && !reducedMotion()) state.shake = Math.max(state.shake, a);
  }

  function updateEffects(dt) {
    for (const q of state.parts) {
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vy += 160 * dt;
      q.life -= dt;
    }
    state.parts = state.parts.filter((q) => q.life > 0);
    for (const r of state.rings) r.t += dt;
    state.rings = state.rings.filter((r) => r.t < r.dur);
    for (const f of state.floats) f.t += dt;
    state.floats = state.floats.filter((f) => f.t < f.dur);
    for (const b of state.texts) b.t -= dt;
    state.texts = state.texts.filter((b) => b.t > 0);
    state.shake = state.shake > 0.2 ? state.shake * Math.exp(-dt * 7) : 0;

    // Chimney smoke from the bigger towers; forges belch it.
    for (const t of state.towers) {
      const forge = t.kind === 'forge';
      if (state.smoke.length > 140 || (!forge && (t.owner < 0 || t.kind || (t.level < 2 && !t.capital)))) continue;
      t.smokeT -= dt;
      if (t.smokeT > 0) continue;
      t.smokeT = forge ? rand(0.22, 0.4) * (t.owner < 0 ? 2 : 1) : rand(1.1, 2.2);
      const c = chimney(t);
      state.smoke.push({ x: c.x, y: c.y, vx: rand(5, 11), vy: rand(-17, -10), r: rand(2.2, 3.6), life: 0, max: rand(2, 3), dark: forge });
    }
    for (const s of state.smoke) {
      s.life += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx += dt * 2;
      s.r += dt * 3.2;
    }
    state.smoke = state.smoke.filter((s) => s.life < s.max);
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

  // A soft round light: bright in the middle, fading out.
  const lightCache = new Map();
  function light(color) {
    if (!lightCache.has(color)) {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 64;
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      lightCache.set(color, c);
    }
    return lightCache.get(color);
  }

  // Tower size and height by level and kind: watchtowers are tall and thin,
  // forges squat and wide, shrines low under their dome.
  const KIND_R = { watch: 0.82, forge: 1.08, shrine: 1 };
  const KIND_H = { watch: 1.35, forge: 0.85, shrine: 0.78 };
  const towerR = (t) => (15 + t.level * 3.5 + (t.capital ? 4 : 0)) * (KIND_R[t.kind] || 1);
  const towerH = (t) => (14 + t.level * 8 + (t.capital ? 8 : 0)) * (KIND_H[t.kind] || 1);

  // Where smoke leaves a tower.
  function chimney(t) {
    const r = towerR(t);
    const top = t.y - towerH(t);
    if (t.kind === 'forge') return { x: t.x + r * 0.42, y: top - r * 1.05 };
    return { x: t.x + r * 0.5, y: top - r * 0.5 };
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
    // Grass tufts, pebbles and the odd flower.
    for (let k = 0; k < 90; k++) {
      const x = rand(0, W);
      const y = rand(60, H);
      if (!clear(x, y, 2)) continue;
      if (k % 3 === 0) {
        g.fillStyle = 'rgba(150,140,120,0.45)';
        g.beginPath();
        g.ellipse(x, y, rand(2, 4), rand(1.2, 2.2), 0, 0, Math.PI * 2);
        g.fill();
      } else {
        g.strokeStyle = 'rgba(110,140,80,0.55)';
        g.lineWidth = 1;
        g.beginPath();
        for (let j = -1; j <= 1; j++) {
          g.moveTo(x + j * 2, y);
          g.lineTo(x + j * 3.2, y - rand(4, 7));
        }
        g.stroke();
        if (k % 7 === 1) {
          g.fillStyle = k % 2 ? '#f9a8d4' : '#fde68a';
          g.beginPath();
          g.arc(x, y - 6, 1.6, 0, Math.PI * 2);
          g.fill();
        }
      }
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
        if (clear(x, y, r)) trees.push({ x, y, r, pine: rnd() < 0.3 });
      }
    }
    trees.sort((a, b) => a.y - b.y);
    for (const tr of trees) {
      g.fillStyle = 'rgba(80,70,40,0.14)';
      g.beginPath();
      g.ellipse(tr.x + 3, tr.y + tr.r * 0.9, tr.r, tr.r * 0.4, 0, 0, Math.PI * 2);
      g.fill();
      if (tr.pine) {
        g.fillStyle = '#7a9c6c';
        g.beginPath();
        g.moveTo(tr.x, tr.y - tr.r * 1.7);
        g.lineTo(tr.x + tr.r * 0.85, tr.y + tr.r * 0.6);
        g.lineTo(tr.x - tr.r * 0.85, tr.y + tr.r * 0.6);
        g.closePath();
        g.fill();
        g.fillStyle = '#93b384';
        g.beginPath();
        g.moveTo(tr.x, tr.y - tr.r * 1.7);
        g.lineTo(tr.x - tr.r * 0.85, tr.y + tr.r * 0.6);
        g.lineTo(tr.x - tr.r * 0.1, tr.y + tr.r * 0.6);
        g.closePath();
        g.fill();
        continue;
      }
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
    g.setLineDash([]);
    // Ground around the special towers: scorched earth by forges, a ring of
    // standing stones round shrines.
    for (const t of T) {
      if (t.kind === 'forge') {
        g.globalAlpha = 0.35;
        g.drawImage(glow('#57534e'), t.x - 46, t.y - 18, 92, 40);
        g.globalAlpha = 1;
        // A woodpile and an anvil by the door.
        g.fillStyle = '#8b6b4a';
        for (let k = 0; k < 3; k++) g.fillRect(t.x - 38 + k * 2, t.y + 6 - k * 3, 14, 3);
        g.fillStyle = '#44403c';
        g.fillRect(t.x + 26, t.y + 4, 11, 4);
        g.fillRect(t.x + 29, t.y + 8, 5, 4);
      } else if (t.kind === 'shrine') {
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2;
          const sx = t.x + Math.cos(a) * 40;
          const sy = t.y + Math.sin(a) * 16 + 2;
          g.fillStyle = 'rgba(80,70,40,0.18)';
          g.beginPath();
          g.ellipse(sx + 1.5, sy + 1.5, 3.5, 1.6, 0, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#b8ad95';
          g.fillRect(sx - 2, sy - 7, 4, 8);
          g.fillStyle = '#d6cdb8';
          g.fillRect(sx - 2, sy - 7, 2, 8);
        }
      }
    }
    return c;
  }

  // ---------------------------------------------------------------------------
  // Time of day and weather
  // ---------------------------------------------------------------------------

  const DAY_LEN = 330; // seconds for a whole day and night

  // How dark, warm and rainy it is right now.
  function ambience() {
    const phase = (state.dayPhase + state.t / DAY_LEN) % 1; // 0 dawn, .25 noon, .5 dusk, .75 night
    const sun = Math.sin(phase * Math.PI * 2);
    const night = clamp((0.08 - sun) / 0.55, 0, 1) * 0.8;
    const warm = clamp(1 - Math.abs(sun - 0.05) / 0.32, 0, 1);
    const rain = state.weather === 'rain' ? clamp(Math.sin(state.t / 45 + (state.seed % 7)) * 1.4 + 0.2, 0, 1) : 0;
    return { phase, sun, night, warm, rain };
  }

  // Multiplies the world by a tint: white at noon, amber at dusk, blue at night.
  function drawTint(amb) {
    let r = 255;
    let g = 255;
    let b = 255;
    const mix = (tr, tg, tb, k) => {
      r = lerp(r, tr, k);
      g = lerp(g, tg, k);
      b = lerp(b, tb, k);
    };
    mix(255, 196, 150, amb.warm * 0.55);
    mix(92, 108, 170, amb.night);
    mix(205, 210, 222, amb.rain * 0.3);
    if (r > 253 && g > 253 && b > 253) return;
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
    ctx.fillRect(-20, -20, W + 40, H + 40);
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawRain(amb, now) {
    if (amb.rain <= 0.02) return;
    const n = Math.floor(170 * amb.rain);
    ctx.strokeStyle = 'rgba(215,225,240,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const h1 = ((i * 7919) % 1000) / 1000;
      const h2 = ((i * 104729) % 997) / 997;
      const y = ((h2 * (H + 40) + now * (480 + h1 * 160)) % (H + 40)) - 20;
      const x = (((h1 * W + y * 0.28) % W) + W) % W;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 3.5, y - 12);
    }
    ctx.stroke();
  }

  // Big soft cloud shadows drifting across the map.
  function drawClouds() {
    ctx.globalAlpha = 0.07;
    for (let i = 0; i < 4; i++) {
      const span = W + 700;
      const x = ((i * 337 + (state.seed % 400) + state.t * (7 + i * 2.5)) % span) - 350;
      const y = 110 + ((i * 151 + (state.seed % 90)) % 360);
      ctx.drawImage(glow('#334155'), x - 170, y - 80, 340, 160);
      ctx.drawImage(glow('#334155'), x - 60, y - 110, 220, 130);
    }
    ctx.globalAlpha = 1;
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

  // Is an enemy army marching on a tower of yours that your watchtower sees?
  const revealed = (g) => {
    const t = state.towers[g.path[g.path.length - 1]];
    return g.owner !== 0 && t.owner === 0 && guarded(t);
  };

  function render() {
    const s = canvas.width / W;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    if (!state) return;
    if (!background) background = makeBackground();
    const T = state.towers;
    const now = performance.now() / 1000;
    const amb = ambience();
    const f = state.finale;

    // Camera: screen shake, and the slow zoom on the deciding capture.
    let z = 1;
    let fx = W / 2;
    let fy = H / 2;
    if (f && !reducedMotion()) {
      z = 1 + 0.3 * ease(f.t / 1.1);
      fx = f.x;
      fy = f.y;
    }
    const sx = state.shake ? (Math.random() * 2 - 1) * state.shake : 0;
    const sy = state.shake ? (Math.random() * 2 - 1) * state.shake : 0;
    ctx.fillStyle = '#e4ddcb';
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(s * z, 0, 0, s * z, s * ((1 - z) * fx + sx), s * ((1 - z) * fy + sy));
    ctx.drawImage(background, 0, 0, W, H);

    // Territory.
    ctx.globalAlpha = 0.16;
    for (const t of T) {
      if (t.owner < 0) continue;
      ctx.drawImage(glow(colorOf(t.owner)), t.x - 95, t.y - 80, 190, 160);
    }
    ctx.globalAlpha = 1;

    const interactive = state.mode === 'playing' && !f;
    const hover = interactive && input.over ? towerAt(input.mx, input.my) : -1;

    // Watchtower ranges.
    for (const w of T) {
      if (w.kind !== 'watch') continue;
      const on = hover === w.i;
      ctx.strokeStyle = colorOf(w.owner);
      ctx.globalAlpha = on ? 0.7 : 0.22;
      ctx.lineWidth = on ? 2 : 1.5;
      ctx.setLineDash([5, 7]);
      ctx.lineDashOffset = -now * 8;
      ctx.beginPath();
      ctx.ellipse(w.x, w.y, WATCH_RANGE, WATCH_RANGE * 0.62, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (on) {
        ctx.globalAlpha = 0.06;
        ctx.fillStyle = colorOf(w.owner);
        ctx.fill();
      }
    }
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    ctx.globalAlpha = 1;

    // While dragging, light up where the selection can march and dim the rest.
    const dragging = interactive && state.drag && !state.drag.box && state.sel.length > 0;
    const reach = interactive && state.sel.length ? reachable(0, state.sel) : null;

    // Drag arrows.
    if (interactive && state.sel.length && ((state.drag && !state.drag.box) || hover >= 0)) {
      const target = hover >= 0 && !state.sel.includes(hover) ? hover : -1;
      for (const i of state.sel) {
        const a = T[i];
        const ok = target >= 0 && route(0, i, target);
        const tx = target >= 0 ? T[target].x : input.mx;
        const ty = target >= 0 ? T[target].y - towerH(T[target]) / 2 : input.my;
        if ((!state.drag || state.drag.box) && target < 0) continue;
        arrow(a.x, a.y - towerH(a) / 2, tx, ty, target >= 0 ? (ok ? colorOf(0) : '#a8a29e') : 'rgba(37,99,235,0.55)', target >= 0 && !ok, now);
      }
    }

    // Selection box.
    const d = state.drag;
    if (interactive && d && d.box && d.moved) {
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

    // The first lesson: a ghost arrow from your capital to its target.
    const tut = state.tut;
    if (interactive && tut && tut.step === 0 && tut.target >= 0 && !state.drag) {
      const a = T[state.caps[0]];
      const b = T[tut.target];
      if (a.owner === 0) {
        const ay = a.y - towerH(a) / 2;
        const by = b.y - towerH(b) / 2;
        ctx.globalAlpha = 0.75;
        ctx.setLineDash([10, 8]);
        ctx.lineDashOffset = -now * 40;
        arrow(a.x, ay, b.x, by, '#2563eb', false, now, true);
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
        const k = ease((now % 1.6) / 1.2);
        ctx.globalAlpha = 1 - Math.max(0, (now % 1.6) - 1.2) / 0.4;
        const hx = lerp(a.x, b.x, k);
        const hy = lerp(ay, by, k);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.strokeStyle = '#1d4ed8';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(hx, hy, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // Armies besieging from behind a tower are hidden by it, so draw those
    // first and the ones in front after the towers.
    drawGroups(now, false);

    // Towers, back to front.
    const order = [...T].sort((a, b) => a.y - b.y);
    for (const t of order) {
      let ringStyle = null;
      if (tut && tut.target === t.i && tut.step === 0) ringStyle = 'tut';
      else if (tut && tut.step === 2 && t.owner === 0 && canUpgrade(t)) ringStyle = 'tut';
      else if (reach && reach.has(t.i) && (dragging || t.owner !== 0)) ringStyle = dragging ? 'reach' : 'hint';
      const dim = dragging && !reach.has(t.i) && !state.sel.includes(t.i);
      drawTower(t, t.i === hover, now, dim ? 0.38 : 1, ringStyle);
    }
    drawGroups(now, true);

    // Smoke, cloud shadows and effects.
    for (const q of state.smoke) {
      const k = q.life / q.max;
      ctx.globalAlpha = Math.min(1, q.life * 4) * (1 - k) * (q.dark ? 0.42 : 0.3);
      ctx.fillStyle = q.dark ? '#44403c' : '#a8a29e';
      ctx.beginPath();
      ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    drawClouds();
    for (const r of state.rings) {
      const k = r.t / r.dur;
      const rr = r.r1 * ease(k);
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 1 + 5 * (1 - k);
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, rr, rr * 0.55, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const q of state.parts) {
      if (q.glow) continue;
      ctx.globalAlpha = Math.min(1, q.life / 0.3);
      ctx.fillStyle = q.color;
      ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
    }
    ctx.globalAlpha = 1;

    // Light, weather, then everything that glows.
    drawTint(amb);
    drawRain(amb, now);
    drawLights(amb, now);

    // Labels stay crisp on top of the tint.
    for (const t of order) drawCount(t, dragging && !reach.has(t.i) && !state.sel.includes(t.i));
    drawGroupLabels(now);
    drawFloats();

    // Upgrade button for a single selected tower of yours.
    const ub = interactive ? upgradeButton() : null;
    if (ub) {
      const hov = input.over && inside(ub, input.mx, input.my);
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      roundRect(ub.x + 1, ub.y + 2, ub.w, ub.h, 8);
      ctx.fill();
      roundRect(ub.x, ub.y, ub.w, ub.h, 8);
      ctx.fillStyle = ub.ok ? (hov ? '#1d4ed8' : '#2563eb') : '#a8a29e';
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(ub.label, ub.x + ub.w / 2, ub.y + 15);
    }

    // What the send would do, next to the cursor.
    if (interactive && state.sel.length && hover >= 0 && !state.sel.includes(hover) && !(d && d.box)) drawPreview(hover, reach);

    ctx.setTransform(s, 0, 0, s, 0, 0);
    if (state.mode !== 'menu') {
      // The HUD steps aside for the finale.
      hudA = f && !f.done ? 1 - ease(f.t / 0.4) : 1;
      ctx.globalAlpha = hudA;
      if (hudA > 0.01) drawHud(hover, amb, now);
      ctx.globalAlpha = 1;
    }
    if (f) drawFinale(f);
  }

  function arrow(x1, y1, x2, y2, color, dashed, now, keepDash) {
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
    if (!keepDash) ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - Math.cos(a - 0.45) * 14, y2 - Math.sin(a - 0.45) * 14);
    ctx.lineTo(x2 - Math.cos(a + 0.45) * 14, y2 - Math.sin(a + 0.45) * 14);
    ctx.closePath();
    ctx.fill();
  }

  // One little soldier: a shadow, a body and (for forge armies) a hot rim.
  function soldier(x, y, col, hot) {
    ctx.fillStyle = 'rgba(60,50,30,0.18)';
    ctx.beginPath();
    ctx.ellipse(x + 1.5, y + 5.5, 4.2, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = col;
    ctx.strokeStyle = hot ? '#fb923c' : '#fff';
    ctx.lineWidth = hot ? 1.8 : 1.2;
    ctx.beginPath();
    ctx.arc(x, y, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Where each soldier of a besieging army stands: in an arc around the
  // tower on the side it came from, lunging at the wall.
  function siegeSpots(g, now) {
    const T = state.towers;
    const t = T[g.path[g.path.length - 1]];
    const a = T[g.path[g.path.length - 2]];
    const base = Math.atan2((a.y - t.y) / 0.45, a.x - t.x);
    const n = Math.min(14, Math.ceil(g.n));
    const spots = [];
    for (let k = 0; k < n; k++) {
      const row = k < 7 ? 0 : 1;
      const j = row ? k - 7 : k;
      const m = Math.min(7, row ? n - 7 : n);
      const ang = base + (j - (m - 1) / 2) * 0.3;
      const lunge = Math.max(0, Math.sin(now * 11 + k * 1.9 + g.id)) * 4;
      const R = towerR(t) * 1.3 + 8 + row * 9 - lunge;
      spots.push({ x: t.x + Math.cos(ang) * R, y: t.y + Math.sin(ang) * R * 0.45 - 2, front: Math.sin(ang) > -0.1 });
    }
    return spots;
  }

  function drawGroups(now, front) {
    for (const g of state.groups) {
      const col = colorOf(g.owner);
      const hot = g.power > 1;
      if (g.siege) {
        for (const p of siegeSpots(g, now)) if (p.front === front) soldier(p.x, p.y, col, hot);
        continue;
      }
      if (front) continue;
      const n = Math.min(12, Math.ceil(g.n));
      // Armies your watchtower has spotted get a red trail to their target.
      if (revealed(g)) {
        const p = groupPos(g);
        const t = state.towers[g.path[g.path.length - 1]];
        ctx.strokeStyle = 'rgba(220,38,38,0.7)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 6]);
        ctx.lineDashOffset = -now * 30;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        for (let k = g.leg + 1; k < g.path.length; k++) ctx.lineTo(state.towers[g.path[k]].x, state.towers[g.path[k]].y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
        ctx.globalAlpha = 0.25 + Math.sin(now * 8) * 0.15;
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.ellipse(t.x, t.y, towerR(t) * 1.6, towerR(t) * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      for (let k = n - 1; k >= 0; k--) {
        const p = groupPos(g, k * 8);
        const bob = Math.sin(now * 12 + k + g.id) * 0.8;
        soldier(p.x, p.y - 2 + bob, col, hot);
        if (k === 0) {
          // The leader carries a pennant.
          ctx.strokeStyle = '#57534e';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(p.x + 3, p.y - 3 + bob);
          ctx.lineTo(p.x + 3, p.y - 15 + bob);
          ctx.stroke();
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.moveTo(p.x + 3, p.y - 15 + bob);
          ctx.lineTo(p.x + 11, p.y - 12.5 + bob + Math.sin(now * 9 + g.id) * 1.2);
          ctx.lineTo(p.x + 3, p.y - 10 + bob);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }

  function drawGroupLabels(now) {
    for (const g of state.groups) {
      if (g.n < 1) continue;
      const col = colorOf(g.owner);
      let x;
      let y;
      if (g.siege) {
        const spots = siegeSpots(g, 0);
        x = spots.reduce((s, p) => s + p.x, 0) / spots.length;
        y = Math.min(...spots.map((p) => p.y)) - 12;
      } else {
        const p = groupPos(g);
        x = p.x;
        y = p.y - 12;
      }
      const label = `${Math.floor(g.n)}${g.power > 1 ? ` ×${g.power}` : ''}`;
      ctx.font = 'bold 11px system-ui, sans-serif';
      const w = ctx.measureText(label).width + 8;
      roundRect(x - w / 2, y - 8, w, 14, 7);
      ctx.fillStyle = col;
      ctx.fill();
      if (g.power > 1) {
        ctx.strokeStyle = '#fb923c';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(label, x, y + 3);
      if (revealed(g) && !g.siege) {
        // A pulsing warning marker over spotted armies.
        const k = 1 + Math.sin(now * 8) * 0.12;
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.arc(x + w / 2 + 8, y - 1, 7 * k, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px system-ui, sans-serif';
        ctx.fillText('!', x + w / 2 + 8, y + 2.5);
      }
    }
  }

  function drawFloats() {
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    for (const fl of state.floats) {
      const k = fl.t / fl.dur;
      const pop = fl.big ? 1 + (1 - ease(fl.t / 0.25)) * 0.7 : 1;
      ctx.globalAlpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      ctx.font = `bold ${Math.round((fl.big ? 18 : 13) * pop)}px system-ui, sans-serif`;
      const y = fl.y - ease(k) * (fl.big ? 22 : 30);
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 4;
      ctx.strokeText(fl.text, fl.x, y);
      ctx.fillStyle = fl.color;
      ctx.fillText(fl.text, fl.x, y);
    }
    ctx.globalAlpha = 1;
  }

  // Everything that gives off light: lit windows at night, forge fires,
  // watchtower lanterns, shrine gems, sparks.
  function drawLights(amb, now) {
    ctx.globalCompositeOperation = 'lighter';
    for (const t of state.towers) {
      const r = towerR(t);
      const h = towerH(t);
      const top = t.y - h;
      const flick = 0.85 + Math.sin(now * 13 + t.i * 3) * 0.08 + Math.sin(now * 23 + t.i) * 0.07;
      if (t.kind === 'forge') {
        const c = chimney(t);
        ctx.globalAlpha = (0.45 + amb.night * 0.5) * flick;
        ctx.drawImage(light('#fb923c'), c.x - 16, c.y - 8, 32, 26);
        ctx.drawImage(light('#f97316'), t.x - r * 0.6, t.y - r * 0.75, r * 1.2, r * 1.2);
      } else if (t.kind === 'watch' && t.owner >= 0) {
        const p = 0.8 + Math.sin(now * 3 + t.i) * 0.2;
        ctx.globalAlpha = (0.35 + amb.night * 0.65) * p;
        ctx.drawImage(light('#fde047'), t.x - 22, top - r * 0.28 - 22, 44, 44);
      } else if (t.kind === 'shrine') {
        const p = 0.75 + Math.sin(now * 2.2 + t.i) * 0.25;
        ctx.globalAlpha = (t.owner >= 0 ? 0.45 : 0.2) * p + amb.night * 0.4;
        ctx.drawImage(light('#fef08a'), t.x - 20, top - r * 1.45 - 20, 40, 40);
      }
      if (t.owner >= 0 && amb.night > 0.12 && t.kind !== 'forge') {
        // Warm lit windows.
        ctx.globalAlpha = amb.night * 0.75 * flick;
        ctx.drawImage(light('#fbbf24'), t.x - 10, t.y - r * 0.4 - 8, 20, 20);
        for (let k = 1; k < t.level + (t.capital ? 1 : 0); k++) {
          const wy = t.y - (h * k) / (t.level + 1) - 4;
          ctx.drawImage(light('#fcd34d'), t.x - 7, wy - 7, 14, 14);
        }
      }
    }
    for (const q of state.parts) {
      if (!q.glow) continue;
      ctx.globalAlpha = Math.min(1, q.life / 0.2);
      ctx.drawImage(light(q.color), q.x - q.size * 2.5, q.y - q.size * 2.5, q.size * 5, q.size * 5);
      ctx.fillStyle = q.color;
      ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawTower(t, hovered, now, alpha, ringStyle) {
    const color = colorOf(t.owner);
    ctx.globalAlpha = alpha;
    drawTowerBase(t, hovered, now, color, ringStyle);
    if (t.wipe > 0 && t.wipeFrom && t.wipeFrom !== color) {
      // The new owner's colour floods up the tower from the ground.
      const r = towerR(t);
      const h = towerH(t);
      const bottom = t.y + r * 0.6;
      const cut = bottom - ease(1 - t.wipe) * (h + r * 2.4 + 30);
      drawTowerBody(t, t.wipeFrom, now);
      ctx.save();
      ctx.beginPath();
      ctx.rect(t.x - r * 2, cut, r * 4, bottom - cut + 20);
      ctx.clip();
      drawTowerBody(t, color, now);
      ctx.restore();
      ctx.globalAlpha = alpha * Math.min(1, t.wipe * 3);
      ctx.drawImage(light('#ffffff'), t.x - r * 1.5, cut - 6, r * 3, 12);
    } else {
      drawTowerBody(t, color, now);
    }
    if (t.flash > 0) {
      const ry = towerR(t) * 0.36;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = `rgba(220,38,38,${t.flash})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(t.x, t.y - towerH(t), towerR(t) + 3, ry + 1.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawTowerBase(t, hovered, now, color, ringStyle) {
    const pop = 1 + Math.sin(t.pop * Math.PI) * 0.14;
    const r = towerR(t) * pop;
    const { x, y } = t;
    const ry = r * 0.36;

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
    ctx.fillStyle = t.kind === 'shrine' ? '#efe6cc' : '#e4dac2';
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.22, ry * 1.22, 0, 0, Math.PI * 2);
    ctx.fill();

    // A slow golden pulse round shrines.
    if (t.kind === 'shrine') {
      const k = (now * 0.5 + t.i * 0.37) % 1;
      ctx.strokeStyle = `rgba(234,179,8,${(1 - k) * (t.owner >= 0 ? 0.55 : 0.3)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, y + 1, r * (1.2 + k * 0.9), r * (1.2 + k * 0.9) * 0.4, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Selection, hover and target rings around the plinth.
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
    } else if (ringStyle) {
      const tutRing = ringStyle === 'tut';
      const pulse = 1 + Math.sin(now * (tutRing ? 5 : 4)) * 0.06;
      ctx.strokeStyle = tutRing ? '#f59e0b' : ringStyle === 'reach' ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.55)';
      ctx.lineWidth = tutRing ? 3.5 : 2.5;
      ctx.setLineDash(tutRing ? [] : [6, 5]);
      ctx.lineDashOffset = -now * 12;
      ctx.beginPath();
      ctx.ellipse(x, y + 1, (r + 10) * pulse, (r + 10) * 0.4 * pulse, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    }
  }

  function drawFlag(x, top, fh, fw, color, now, seed) {
    ctx.strokeStyle = '#57534e';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, top - fh);
    ctx.stroke();
    // The cloth ripples more towards its free end.
    const seg = 6;
    const pts = [];
    for (let k = 0; k <= seg; k++) {
      const u = k / seg;
      pts.push({ x: x + fw * u, y: top - fh + Math.sin(now * 6 + seed - u * 4) * 2.4 * u });
    }
    const fall = fh * 0.42;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts) ctx.lineTo(p.x, p.y + (p.x - x) * 0.08);
    for (let k = seg; k >= 0; k--) ctx.lineTo(pts[k].x, pts[k].y + fall - (pts[k].x - x) * 0.12);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawTowerBody(t, color, now) {
    const pop = 1 + Math.sin(t.pop * Math.PI) * 0.14;
    const r = towerR(t) * pop;
    const h = towerH(t) * pop;
    const { x, y } = t;
    const ry = r * 0.36;
    const top = y - h;
    const owned = color !== NEUTRAL;

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

    // Door (a glowing furnace mouth on forges) and windows.
    ctx.fillStyle = t.kind === 'forge' ? '#7c2d12' : shade(color, -0.6);
    ctx.beginPath();
    ctx.roundRect(x - r * 0.24, y + ry * 0.55 - r * 0.62, r * 0.48, r * 0.62, [r * 0.24, r * 0.24, 0, 0]);
    ctx.fill();
    if (t.kind === 'forge') {
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.roundRect(x - r * 0.16, y + ry * 0.55 - r * 0.36, r * 0.32, r * 0.36, [r * 0.16, r * 0.16, 0, 0]);
      ctx.fill();
    }
    ctx.fillStyle = shade(color, -0.6);
    const wins = t.kind === 'watch' ? t.level + 1 : t.level + (t.capital ? 1 : 0);
    for (let k = 1; k < wins; k++) {
      const wy = y - (h * k) / (wins + (t.kind === 'watch' ? 0 : 1)) - 3;
      ctx.beginPath();
      ctx.roundRect(x - 2, wy - 5, 4, 8, [2, 2, 0, 0]);
      ctx.fill();
    }

    if (t.kind === 'watch') return drawWatchTop(t, color, now, x, top, r, ry, owned);
    if (t.kind === 'shrine') return drawShrineTop(t, color, now, x, top, r, ry, owned);
    if (t.kind === 'forge') return drawForgeTop(t, color, now, x, top, r, ry, owned);

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
    // A little chimney on the bigger towers.
    if (owned && (t.level >= 2 || t.capital)) {
      ctx.fillStyle = '#78716c';
      ctx.fillRect(x + r * 0.38, top - r * 0.5, r * 0.24, r * 0.5);
      ctx.fillStyle = '#57534e';
      ctx.fillRect(x + r * 0.34, top - r * 0.56, r * 0.32, r * 0.1);
    }
    for (let k = 0; k < merlons; k++) merlon(k, true);

    // Flag on every tower you hold, bigger on capitals.
    if (owned) drawFlag(x, top, t.capital ? 24 : 16, t.capital ? 15 : 11, color, now, t.i);
  }

  // Watchtower: an open lantern gallery under a tall pointed roof.
  function drawWatchTop(t, color, now, x, top, r, ry, owned) {
    const gh = r * 0.62; // gallery height
    ctx.fillStyle = shade(color, 0.3);
    ctx.beginPath();
    ctx.ellipse(x, top, r * 1.12, ry * 1.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#292524';
    ctx.fillRect(x - r * 0.8, top - gh, r * 1.6, gh);
    ctx.fillStyle = owned ? '#fde047' : '#78716c';
    ctx.beginPath();
    ctx.arc(x, top - gh * 0.5, r * 0.26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shade(color, -0.2);
    for (const k of [-0.8, -0.27, 0.27, 0.8]) ctx.fillRect(x + k * r - 1.5, top - gh, 3, gh);
    // The roof, lit from the left.
    const roofTop = top - gh - r * 1.5;
    const g = ctx.createLinearGradient(x - r, 0, x + r, 0);
    g.addColorStop(0, shade(color, -0.15));
    g.addColorStop(0.35, shade(color, -0.3));
    g.addColorStop(1, shade(color, -0.6));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - r * 1.18, top - gh + 2);
    ctx.quadraticCurveTo(x, top - gh + ry * 1.4, x + r * 1.18, top - gh + 2);
    ctx.lineTo(x, roofTop);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.4, top - gh);
    ctx.lineTo(x, roofTop);
    ctx.stroke();
    if (owned) drawFlag(x, roofTop, 13, 10, color, now, t.i);
    else {
      ctx.fillStyle = '#57534e';
      ctx.beginPath();
      ctx.arc(x, roofTop, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Shrine: a golden dome with a glowing gem on its spire.
  function drawShrineTop(t, color, now, x, top, r, ry, owned) {
    ctx.fillStyle = shade(color, 0.32);
    ctx.beginPath();
    ctx.ellipse(x, top, r * 1.08, ry * 1.08, 0, 0, Math.PI * 2);
    ctx.fill();
    const dh = r * 1.05;
    const g = ctx.createLinearGradient(x - r, 0, x + r, 0);
    g.addColorStop(0, '#fcd34d');
    g.addColorStop(0.35, '#fef3c7');
    g.addColorStop(0.6, '#f59e0b');
    g.addColorStop(1, '#92400e');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.92, top);
    ctx.bezierCurveTo(x - r * 0.92, top - dh * 0.9, x - r * 0.25, top - dh, x, top - dh * 1.12);
    ctx.bezierCurveTo(x + r * 0.25, top - dh, x + r * 0.92, top - dh * 0.9, x + r * 0.92, top);
    ctx.ellipse(x, top, r * 0.92, ry * 0.9, 0, 0, Math.PI);
    ctx.closePath();
    ctx.fill();
    // Ribs on the dome.
    ctx.strokeStyle = 'rgba(146,64,14,0.35)';
    ctx.lineWidth = 1;
    for (const k of [-0.5, 0, 0.5]) {
      ctx.beginPath();
      ctx.moveTo(x + k * r * 0.9, top + ry * 0.6 * (1 - Math.abs(k)));
      ctx.quadraticCurveTo(x + k * r * 0.6, top - dh * 0.8, x, top - dh * 1.1);
      ctx.stroke();
    }
    // Spire and gem.
    const gy = top - dh * 1.12 - r * 0.38;
    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x, top - dh * 1.1);
    ctx.lineTo(x, gy + 4);
    ctx.stroke();
    const p = 1 + Math.sin(now * 3 + t.i) * 0.1;
    ctx.fillStyle = owned ? color : '#fef9c3';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, gy - 5 * p);
    ctx.lineTo(x + 3.6 * p, gy);
    ctx.lineTo(x, gy + 5 * p);
    ctx.lineTo(x - 3.6 * p, gy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (owned) drawFlag(x - r * 0.95, top + 2, 14, 10, color, now, t.i);
  }

  // Forge: a flat stone roof and a great chimney with fire in its mouth.
  function drawForgeTop(t, color, now, x, top, r, ry, owned) {
    ctx.fillStyle = shade(color, 0.3);
    ctx.beginPath();
    ctx.ellipse(x, top, r * 1.04, ry * 1.04, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#57534e';
    ctx.beginPath();
    ctx.ellipse(x, top + 1, r * 0.8, ry * 0.76, 0, 0, Math.PI * 2);
    ctx.fill();
    // Chimney.
    const cw = r * 0.46;
    const cx = x + r * 0.42;
    const ch = r * 1.05;
    const g = ctx.createLinearGradient(cx - cw / 2, 0, cx + cw / 2, 0);
    g.addColorStop(0, '#78716c');
    g.addColorStop(1, '#44403c');
    ctx.fillStyle = g;
    ctx.fillRect(cx - cw / 2, top - ch, cw, ch + 2);
    ctx.fillStyle = '#292524';
    ctx.fillRect(cx - cw / 2 - 2, top - ch - 3, cw + 4, 4);
    const flick = 0.75 + Math.sin(now * 17 + t.i) * 0.25;
    ctx.fillStyle = `rgba(251,146,60,${flick})`;
    ctx.beginPath();
    ctx.ellipse(cx, top - ch - 2, cw * 0.36, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
    // Anvil sign on the front of the roof rim.
    ctx.fillStyle = '#1c1917';
    const ax = x - r * 0.38;
    const ay = top - 1;
    ctx.beginPath();
    ctx.moveTo(ax - 7, ay - 6);
    ctx.lineTo(ax + 6, ay - 6);
    ctx.lineTo(ax + 4, ay - 3);
    ctx.lineTo(ax + 2, ay - 3);
    ctx.lineTo(ax + 3, ay + 1);
    ctx.lineTo(ax - 3, ay + 1);
    ctx.lineTo(ax - 2, ay - 3);
    ctx.lineTo(ax - 4, ay - 3);
    ctx.closePath();
    ctx.fill();
    if (owned) drawFlag(x - r * 0.75, top - 1, 16, 11, color, now, t.i);
  }

  // A small round badge with the special tower's emblem.
  function kindIcon(kind, x, y, s = 1) {
    ctx.fillStyle = KINDS[kind].color;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 8.5 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#fff';
    if (kind === 'forge') {
      // Hammer.
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-0.6);
      ctx.scale(s, s);
      ctx.fillRect(-1, -2, 2, 7.5);
      ctx.fillRect(-4.5, -5, 9, 3.6);
      ctx.restore();
    } else if (kind === 'watch') {
      // Eye.
      ctx.lineWidth = 1.4 * s;
      ctx.beginPath();
      ctx.moveTo(x - 5.5 * s, y);
      ctx.quadraticCurveTo(x, y - 5.5 * s, x + 5.5 * s, y);
      ctx.quadraticCurveTo(x, y + 5.5 * s, x - 5.5 * s, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 1.9 * s, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Four-pointed star.
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 - Math.PI / 2;
        const rr = (k % 2 ? 2 : 5.8) * s;
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawCount(t, dim) {
    const color = t.owner >= 0 ? colorOf(t.owner) : '#78716c';
    const extra = t.kind === 'watch' ? towerR(t) * 2.2 : t.kind === 'shrine' ? towerR(t) * 1.4 : t.kind === 'forge' ? towerR(t) * 0.9 : 0;
    const top = t.y - towerH(t) - towerR(t) * 0.4 - extra - (t.owner >= 0 ? (t.capital ? 28 : 20) : 8);
    const label = String(Math.floor(t.n));
    ctx.globalAlpha = dim ? 0.45 : 1;
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
    if (t.kind) kindIcon(t.kind, t.x - w / 2 - 4, top - 13);
    // A shield when a watchtower guards it.
    if (guarded(t)) {
      const sx = t.x + w / 2 + 4;
      const sy = top - 18;
      ctx.fillStyle = KINDS.watch.color;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(sx - 5.5, sy);
      ctx.lineTo(sx + 5.5, sy);
      ctx.lineTo(sx + 5, sy + 6);
      ctx.quadraticCurveTo(sx + 3, sy + 10, sx, sy + 12);
      ctx.quadraticCurveTo(sx - 3, sy + 10, sx - 5, sy + 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    // One pip per level.
    for (let k = 0; k < t.level; k++) {
      ctx.fillStyle = t.owner >= 0 ? color : '#a8a29e';
      ctx.beginPath();
      ctx.arc(t.x + (k - (t.level - 1) / 2) * 7, top + 5, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Spotted attacks: how many are coming.
    if (t.owner === 0 && guarded(t)) {
      const inc = incoming(0, t.i).theirs;
      if (inc >= 1) {
        const txt = `⚠ ${Math.round(inc)} coming`;
        ctx.font = 'bold 11px system-ui, sans-serif';
        const ww = ctx.measureText(txt).width + 10;
        roundRect(t.x - ww / 2, top + 10, ww, 16, 8);
        ctx.fillStyle = '#dc2626';
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillText(txt, t.x, top + 22);
      }
    }
    ctx.globalAlpha = 1;
  }

  // "Send 24 · wins with 9 to spare" next to the cursor.
  function drawPreview(target, reach) {
    let line1;
    let line2;
    let col2 = '#57534e';
    if (!reach || !reach.has(target)) {
      line1 = 'No road there';
      line2 = 'Towers only march along roads';
    } else {
      const p = preview(state.sel, target);
      const forge = state.sel.some((i) => state.towers[i].kind === 'forge' && i !== target);
      line1 = `Send ${p.count}${forge ? ' (forge ×2)' : ''}`;
      if (p.count < 1) line2 = 'Not enough soldiers to send';
      else if (p.own) {
        line2 = 'Reinforce your tower';
        col2 = '#1d4ed8';
      } else if (p.spare >= 1) {
        line2 = `Wins with ${p.spare} to spare`;
        col2 = '#15803d';
      } else {
        line2 = `Not enough · ${1 - p.spare} short`;
        col2 = '#b91c1c';
      }
      if (p.eta) line1 += ` · ${Math.ceil(p.eta)} s`;
    }
    ctx.font = 'bold 12px system-ui, sans-serif';
    const w = Math.max(ctx.measureText(line1).width, ctx.measureText(line2).width) + 20;
    let x = input.mx + 18;
    let y = input.my + 16;
    if (x + w > W - 8) x = input.mx - 18 - w;
    if (y + 40 > H - 56) y = input.my - 56;
    panel(x, y, w, 40);
    ctx.fillStyle = col2;
    ctx.fillRect(x, y + 8, 3, 24);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#1c1917';
    ctx.fillText(line1, x + 11, y + 17);
    ctx.fillStyle = col2;
    ctx.fillText(line2, x + 11, y + 33);
  }

  // ---------------------------------------------------------------------------
  // HUD
  // ---------------------------------------------------------------------------

  const SYS = { x0: W - 132, y: 16, size: 32, gap: 6 };
  let hudA = 1; // HUD opacity: it fades out for the finale

  function sysButtons() {
    const paused = state && state.mode === 'paused';
    return [
      { id: 'pause', label: paused ? '▶' : 'II', tip: paused ? 'Resume (P)' : 'Pause (P)' },
      { id: 'mute', label: Sound.muted ? '♪̸' : '♪', tip: Sound.muted ? 'Sound on (M)' : 'Mute (M)' },
      { id: 'full', label: '⛶', tip: 'Fullscreen (F)' },
    ].map((b, k) => ({ ...b, x: SYS.x0 + k * (SYS.size + SYS.gap), y: SYS.y, w: SYS.size, h: SYS.size }));
  }

  const FRACS = [0.25, 0.5, 0.75, 1];
  function fracButtons() {
    return FRACS.map((f, k) => ({
      id: `frac:${f}`, f, label: `${f * 100}%`, tip: `Send ${f * 100}% of each tower's soldiers (key ${k + 1})`,
      x: 70 + k * 50, y: H - 42, w: 46, h: 28,
    }));
  }

  function upgradeButton() {
    if (state.sel.length !== 1 || state.drag) return null;
    const t = state.towers[state.sel[0]];
    if (t.owner !== 0 || t.level >= 3) return null;
    const ok = canUpgrade(t);
    const cost = UPGRADE[t.level];
    return {
      id: 'upgrade', ok, label: `▲ Upgrade · ${cost}`,
      tip: ok ? `Level ${t.level + 1}: +${(PROD[t.level + 1] / PROD[t.level] * 100 - 100).toFixed(0)}% soldiers, holds ${CAP[t.level + 1]} (U)` : `Needs ${cost + 1} soldiers in the tower`,
      x: t.x - 58, y: t.y + 14, w: 116, h: 22,
    };
  }

  const selectAllButton = () => ({ id: 'all', label: 'Select all (A)', tip: 'Select every tower you hold', x: 296, y: H - 44, w: 108, h: 28 });
  const repeatButton = () => ({
    id: 'repeat', label: '↻ Repeat (R)', x: 410, y: H - 44, w: 100, h: 28,
    tip: state.lastSend ? 'Send again from the same towers to the same target' : 'Nothing sent yet',
  });
  const tutSkipButton = () => (state.tut && state.mode === 'playing' ? { id: 'tutskip', label: 'Skip', tip: 'Skip the lessons', x: W / 2 + 214, y: 86, w: 56, h: 26 } : null);

  function hitTest(x, y) {
    if (!state || state.mode === 'menu') return null;
    for (const b of sysButtons()) if (inside(b, x, y)) return b;
    if (state.finale) return null;
    const ts = tutSkipButton();
    if (ts && inside(ts, x, y)) return ts;
    if (inside(selectAllButton(), x, y)) return selectAllButton();
    if (inside(repeatButton(), x, y)) return repeatButton();
    for (const b of fracButtons()) if (inside(b, x, y)) return b;
    const ub = upgradeButton();
    if (ub && inside(ub, x, y)) return ub;
    return null;
  }

  function panel(x, y, w, h, fill = 'rgba(255,255,255,0.92)') {
    ctx.fillStyle = 'rgba(70,55,30,0.12)';
    roundRect(x + 1, y + 2, w, h, 10);
    ctx.fill();
    ctx.fillStyle = fill;
    roundRect(x, y, w, h, 10);
    ctx.fill();
  }

  function button(b, on, hover) {
    roundRect(b.x, b.y, b.w, b.h, 7);
    ctx.fillStyle = on ? colorOf(0) : hover ? '#e7e5e4' : '#f5f5f4';
    ctx.fill();
    ctx.fillStyle = on ? '#fff' : '#292524';
    ctx.textAlign = 'center';
    ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 4.5);
  }

  // Wraps a list of lines in a small panel near (x, y), kept on screen.
  function tooltip(lines, x, y, above) {
    ctx.font = 'bold 12px system-ui, sans-serif';
    const w = Math.max(...lines.map((l) => ctx.measureText(l.text).width)) + 20;
    const h = lines.length * 16 + 12;
    const tx = clamp(x - w / 2, 8, W - w - 8);
    const ty = above ? y - h - 8 : y + 8;
    panel(tx, ty, w, h);
    ctx.textAlign = 'left';
    lines.forEach((l, k) => {
      ctx.fillStyle = l.color || (k === 0 ? '#1c1917' : '#57534e');
      ctx.font = k === 0 || l.bold ? 'bold 12px system-ui, sans-serif' : '12px system-ui, sans-serif';
      ctx.fillText(l.text, tx + 10, ty + 19 + k * 16);
    });
  }

  function towerTip(t) {
    const owner = t.owner >= 0 ? state.players[t.owner].name : 'Neutral';
    const kind = t.kind ? KINDS[t.kind] : null;
    const lines = [{ text: `${kind ? kind.name : t.capital ? 'Capital' : 'Tower'} · ${owner === 'You' ? 'yours' : owner} · level ${t.level}` }];
    if (t.owner >= 0) lines.push({ text: `+${productionRate(t).toFixed(2)} soldiers/s, holds ${Math.round(towerCap(t))}` });
    else lines.push({ text: 'Neutral: does not grow until taken' });
    lines.push({ text: `Each defender counts ×${defMul(t).toFixed(2)}${guarded(t) ? ' (watchtower)' : ''}` });
    if (kind) for (const l of kind.lines) lines.push({ text: l, color: kind.color, bold: true });
    if (t.owner === 0 && t.level < 3) lines.push({ text: `Click, then Upgrade for ${UPGRADE[t.level]} soldiers`, color: '#1d4ed8' });
    if (t.owner !== 0 && !state.sel.length) lines.push({ text: 'Drag your soldiers here to attack', color: '#1d4ed8' });
    return lines;
  }

  function drawHud(hoverTower, amb, now) {
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
    ctx.textAlign = 'left';
    x = bx;
    for (const p of ps) {
      ctx.globalAlpha = hudA * (p.alive ? 1 : 0.4);
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
    ctx.globalAlpha = hudA;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#57534e';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText(formatTime(state.t), 12 + W - 170, 52);
    // Sun or moon by the clock.
    const ix = W - 208;
    if (amb.night > 0.35) {
      ctx.fillStyle = '#64748b';
      ctx.beginPath();
      ctx.arc(ix, 48, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(ix + 3, 46, 5.4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = amb.warm > 0.4 ? '#f97316' : '#f59e0b';
      ctx.beginPath();
      ctx.arc(ix, 48, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + now * 0.3;
        ctx.moveTo(ix + Math.cos(a) * 6.5, 48 + Math.sin(a) * 6.5);
        ctx.lineTo(ix + Math.cos(a) * 9, 48 + Math.sin(a) * 9);
      }
      ctx.stroke();
    }
    if (amb.rain > 0.1) {
      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let k = 0; k < 3; k++) {
        ctx.moveTo(ix - 22 + k * 4, 44);
        ctx.lineTo(ix - 24 + k * 4, 52);
      }
      ctx.stroke();
    }

    // Campaign objective, just under the top bar.
    if (state.level >= 0) drawObjective();

    // System buttons.
    panel(W - 140, 12, 128, 40);
    ctx.font = 'bold 14px system-ui, sans-serif';
    for (const b of sysButtons()) button(b, false, hover && hover.id === b.id);

    // Send amount.
    panel(12, H - 50, 272, 40);
    ctx.fillStyle = '#57534e';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Send', 24, H - 24);
    for (const b of fracButtons()) button(b, state.frac === b.f, hover && hover.id === b.id);

    // Select all and repeat.
    const sa = selectAllButton();
    const rb = repeatButton();
    panel(sa.x - 6, H - 50, rb.x + rb.w - sa.x + 12, 40);
    button(sa, false, hover && hover.id === 'all');
    ctx.globalAlpha = hudA * (state.lastSend ? 1 : 0.45);
    button(rb, false, hover && hover.id === 'repeat');
    ctx.globalAlpha = hudA;
    if (state.sel.length > 1) {
      const txt = `${state.sel.length} selected`;
      const w = ctx.measureText(txt).width + 18;
      panel(rb.x + rb.w + 14, H - 44, w, 28, colorOf(0));
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(txt, rb.x + rb.w + 14 + w / 2, H - 25);
    }

    // Your production.
    const mine = state.towers.filter((t) => t.owner === 0);
    const rate = mine.reduce((s, t) => s + (t.n < towerCap(t) ? productionRate(t) : 0), 0);
    const bonus = Math.round(PER_TOWER_BONUS * 100 * Math.max(0, mine.length - 1) + SHRINE_BONUS * 100 * me().shrines);
    panel(W - 312, H - 50, 300, 40);
    ctx.fillStyle = '#292524';
    ctx.textAlign = 'center';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText(`${mine.length} tower${mine.length === 1 ? '' : 's'} · +${rate.toFixed(1)} soldiers/s · +${bonus}% bonus`, W - 162, H - 25);

    // Tooltips: HUD buttons first, then towers.
    if (hover && hover.tip) {
      const top = hover.y < H / 2;
      tooltip([{ text: hover.tip }], hover.x + hover.w / 2, top ? hover.y + hover.h : hover.y, !top);
    } else if (hoverTower >= 0 && !state.drag && (!state.sel.length || state.sel.includes(hoverTower))) {
      const t = state.towers[hoverTower];
      const lines = towerTip(t);
      ctx.font = 'bold 12px system-ui, sans-serif';
      const w = Math.max(...lines.map((l) => ctx.measureText(l.text).width)) + 20;
      let tx = t.x + towerR(t) + 16;
      if (tx + w > W - 10) tx = t.x - towerR(t) - 16 - w;
      const h = lines.length * 16 + 12;
      const ty = clamp(t.y - towerH(t) - 20, 70, H - 60 - h);
      tooltip(lines, tx + w / 2, ty - 8, false);
    }

    // Lessons.
    if (state.tut && state.mode === 'playing') drawTutorial(hover);

    // Banners.
    const by = state.tut ? 160 : state.level >= 0 ? 104 : 78;
    state.texts.forEach((b, k) => {
      ctx.globalAlpha = hudA * (Math.min(1, b.t / 0.5) * Math.min(1, (3 - b.t) / 0.15));
      ctx.font = 'bold 17px system-ui, sans-serif';
      const w = ctx.measureText(b.text).width + 32;
      panel(W / 2 - w / 2, by + k * 40, w, 32);
      ctx.fillStyle = b.color;
      ctx.fillRect(W / 2 - w / 2 + 10, by + k * 40 + 26, w - 20, 2);
      ctx.textAlign = 'center';
      ctx.fillText(b.text, W / 2, by + 21 + k * 40);
    });
    ctx.globalAlpha = hudA;
  }

  function drawObjective() {
    const g = state.goal;
    const lv = LEVELS[state.level];
    const T = state.towers;
    let text = `★ ${goalText(g, lv.rivals)}`;
    let prog = -1;
    if (g.type === 'hold') {
      text += ` · ${me().towers}/${g.towers} towers`;
      prog = state.hold / g.secs;
    } else if (g.type === 'shrines') {
      const sh = T.filter((t) => t.kind === 'shrine');
      text += ` · ${sh.filter((t) => t.owner === 0).length}/${sh.length} held`;
      prog = state.hold / g.secs;
    } else if (g.type === 'survive') {
      text += ` · ${formatTime(g.secs - state.t)} left`;
      prog = state.t / g.secs;
    } else if (g.type === 'capital') {
      const caps = state.caps.slice(1);
      if (caps.length > 1) text += ` · ${caps.filter((c) => T[c].owner === 0).length}/${caps.length}`;
    } else if (g.type === 'flawless') {
      text += state.stats.lost ? ' · failed' : ' · no towers lost';
    } else {
      const left = state.players.filter((p) => p.id && p.alive).length;
      text += ` · ${left} left`;
    }
    ctx.font = 'bold 12px system-ui, sans-serif';
    const w = ctx.measureText(text).width + 24;
    const h = prog >= 0 ? 30 : 24;
    panel(12, 70, w, h, 'rgba(28,25,23,0.82)');
    ctx.fillStyle = '#fde68a';
    ctx.textAlign = 'left';
    ctx.fillText(text, 24, 86);
    if (prog >= 0) {
      roundRect(24, 92, w - 24, 4, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fill();
      if (prog > 0) {
        roundRect(24, 92, (w - 24) * clamp(prog, 0, 1), 4, 2);
        ctx.fillStyle = '#fbbf24';
        ctx.fill();
      }
    }
  }

  function drawTutorial(hover) {
    const tut = state.tut;
    const w = 560;
    const x = W / 2 - w / 2;
    const y = 74;
    // Wrap the lesson onto up to two lines.
    ctx.font = 'bold 13px system-ui, sans-serif';
    const lines = [''];
    for (const word of TUT[tut.step].split(' ')) {
      const next = lines[lines.length - 1] ? `${lines[lines.length - 1]} ${word}` : word;
      if (ctx.measureText(next).width > w - 110 && lines[lines.length - 1]) lines.push(word);
      else lines[lines.length - 1] = next;
    }
    const h = 30 + lines.length * 17;
    ctx.globalAlpha = hudA * (Math.min(1, tut.t / 0.3));
    panel(x, y, w, h, 'rgba(255,255,255,0.97)');
    ctx.fillStyle = '#2563eb';
    roundRect(x, y, 6, h, [10, 0, 0, 10]);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.fillText(`LESSON ${tut.step + 1} OF ${TUT.length}`, x + 18, y + 17);
    for (let j = 0; j < TUT.length; j++) {
      ctx.fillStyle = j <= tut.step ? '#2563eb' : '#d6d3d1';
      ctx.beginPath();
      ctx.arc(x + 118 + j * 10, y + 13.5, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#1c1917';
    ctx.font = 'bold 13px system-ui, sans-serif';
    lines.forEach((l, k) => ctx.fillText(l, x + 18, y + 35 + k * 17));
    const sb = tutSkipButton();
    ctx.font = 'bold 12px system-ui, sans-serif';
    button(sb, false, hover && hover.id === 'tutskip');
    ctx.globalAlpha = hudA;
  }

  // Letterbox bars and a big title over the slow-motion finale.
  function drawFinale(f) {
    if (f.done) return;
    const k = ease(f.t / 0.5);
    const out = f.t > f.dur - 0.35 ? (f.dur - f.t) / 0.35 : 1;
    ctx.fillStyle = 'rgba(12,10,9,0.78)';
    ctx.fillRect(0, 0, W, 54 * k);
    ctx.fillRect(0, H - 54 * k, W, 54 * k);
    ctx.globalAlpha = clamp(f.t / 0.35, 0, 1) * clamp(out, 0, 1);
    const pop = 1 + (1 - ease(f.t / 0.45)) * 0.5;
    ctx.save();
    ctx.translate(W / 2, H * 0.44);
    ctx.scale(pop, pop);
    ctx.textAlign = 'center';
    ctx.font = 'bold 64px system-ui, sans-serif';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(28,25,23,0.85)';
    ctx.strokeText(f.title, 0, 0);
    const g = ctx.createLinearGradient(0, -50, 0, 6);
    g.addColorStop(0, f.won ? '#fef3c7' : '#fee2e2');
    g.addColorStop(1, f.won ? '#f59e0b' : '#ef4444');
    ctx.fillStyle = g;
    ctx.fillText(f.title, 0, 0);
    ctx.restore();
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(28,25,23,0.8)';
    ctx.strokeText(f.sub, W / 2, H * 0.44 + 38);
    ctx.fillStyle = '#fff';
    ctx.fillText(f.sub, W / 2, H * 0.44 + 38);
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------------------
  // Menus (HTML overlay)
  // ---------------------------------------------------------------------------

  const overlay = document.getElementById('overlay');
  let briefLevel = 0;

  function optionRow(name, values, current) {
    return `<div class="ng-opt"><span>${name}</span>${values
      .map(([v, label]) => `<button type="button" data-opt="${name}" data-val="${v}" class="${String(v) === String(current) ? 'on' : ''}">${label}</button>`)
      .join('')}</div>`;
  }

  function record() {
    if (!save.games) return '';
    return `<p class="help">Skirmish record: ${save.wins} won of ${save.games}${save.fastest ? ` · fastest win ${formatTime(save.fastest)}` : ''}</p>`;
  }

  const starRow = (n, anim) =>
    `<span class="ng-stars${anim ? ' anim' : ''}">${[0, 1, 2].map((k) => `<i class="${k < n ? 'on' : ''}" style="--d:${k * 0.35 + 0.2}s">★</i>`).join('')}</span>`;

  const HELP = 'Drag from your tower to a connected tower to send soldiers. Drag a box around towers (or Shift-click, or A for all), then click a target. Click a tower to upgrade it. 1–4 set how many to send, R repeats your last send.';

  function showOverlay(kind) {
    if (!kind) {
      overlay.classList.remove('open');
      overlay.innerHTML = '';
      return;
    }
    let html = '';
    if (kind === 'menu') {
      html = `
        <h2>Nameless Generals</h2>
        <p>Raise soldiers, march them down the roads and take every tower. Forges, watchtowers and shrines are worth the fight.</p>
        <div class="ng-modes">
          <button type="button" class="ng-mode primary" data-act="campaign"><b>Campaign</b><small>10 battles · ★ ${totalStars()} of ${LEVELS.length * 3}</small></button>
          <button type="button" class="ng-mode" data-act="skirmish"><b>Skirmish</b><small>A quick battle, your rules</small></button>
        </div>
        ${record()}
        <p class="help"><button type="button" class="ng-link" data-act="tutorial">Play the tutorial</button></p>`;
    } else if (kind === 'skirmish') {
      html = `
        <h2>Skirmish</h2>
        ${optionRow('Rivals', [[1, '1'], [2, '2'], [3, '3']], save.opponents)}
        ${optionRow('Difficulty', Object.entries(SKILL).filter(([, s]) => !s.hidden).map(([k, s]) => [k, s.label]), save.skill)}
        ${optionRow('Map', Object.entries(SIZES).map(([k, s]) => [k, s.label]), save.size)}
        ${optionRow('Specials', [['on', 'On'], ['off', 'Off']], save.specials ? 'on' : 'off')}
        <div class="row">
          <button type="button" class="primary" data-act="start">Start</button>
          <button type="button" data-act="menu">Back</button>
        </div>
        ${record()}
        <p class="help">${HELP}</p>`;
    } else if (kind === 'campaign') {
      html = `
        <h2>Campaign</h2>
        <p class="help">★ ${totalStars()} of ${LEVELS.length * 3} stars · win a level to open the next</p>
        <div class="ng-levels">${LEVELS.map((lv, k) => {
          const open = levelOpen(k);
          return `<button type="button" class="ng-level${open ? '' : ' locked'}" data-level="${k}"${open ? '' : ' disabled'}>
            <span class="num">${open ? k + 1 : '🔒'}</span><b>${lv.name}</b>${starRow(levelStars(k), false)}</button>`;
        }).join('')}</div>
        <div class="row"><button type="button" data-act="menu">Back</button></div>`;
    } else if (kind === 'brief') {
      const lv = LEVELS[briefLevel];
      const rules = starRules(lv);
      const best = save.best[briefLevel];
      html = `
        <p class="ng-kicker">Level ${briefLevel + 1} of ${LEVELS.length}</p>
        <h2>${lv.name}</h2>
        <p>${lv.blurb}</p>
        <p class="ng-goal">★ ${goalText(lv.goal, lv.rivals)}</p>
        <p class="help">${lv.rivals} rival${lv.rivals > 1 ? 's' : ''} (${SKILL[lv.ai].label}) · ${lv.towers} towers<br>★★ ${rules[0]} · ★★★ ${rules[1]}</p>
        ${levelStars(briefLevel) ? `<p class="help">Your best: ${starRow(levelStars(briefLevel), false)}${best && lv.starKind !== 'towers' ? ` in ${formatTime(best)}` : ''}</p>` : ''}
        <div class="row">
          <button type="button" class="primary" data-act="play-level">Begin</button>
          <button type="button" data-act="campaign">Back</button>
        </div>`;
    } else if (kind === 'paused') {
      const lv = LEVELS[state.level];
      html = `
        <h2>Paused</h2>
        ${lv ? `<p class="ng-goal">★ ${goalText(lv.goal, lv.rivals)}</p>` : ''}
        <div class="row">
          <button type="button" class="primary" data-act="resume">Resume</button>
          <button type="button" data-act="retry">Restart</button>
          <button type="button" data-act="menu">Quit to menu</button>
        </div>
        <p class="help">${HELP}</p>`;
    } else if (kind === 'over') {
      const won = !!(state.result && state.result.won);
      const winner = state.winner >= 0 ? state.players[state.winner] : null;
      const stats = `<p class="help">${state.stats.captured} towers captured · ${state.stats.sent.toLocaleString()} soldiers sent · most towers held ${state.stats.peak}</p>`;
      if (state.level >= 0) {
        const lv = LEVELS[state.level];
        const last = state.level === LEVELS.length - 1;
        const fresh = won && state.prevStars === 0 && !last;
        html = won
          ? `
            <p class="ng-kicker">Level ${state.level + 1} · ${lv.name}</p>
            <h2>${last ? 'Campaign complete!' : 'Victory!'}</h2>
            ${starRow(state.earned, true)}
            <p>${goalText(lv.goal, lv.rivals)} in ${formatTime(state.t)}.${state.earned < 3 ? ` Next star: ${starRules(lv)[state.earned - 1]}.` : ' A perfect battle.'}</p>
            ${stats}
            ${fresh ? `<p class="ng-goal">New level unlocked: ${LEVELS[state.level + 1].name}</p>` : ''}
            <div class="row">
              ${last ? '' : '<button type="button" class="primary" data-act="next">Next level</button>'}
              <button type="button"${last ? ' class="primary"' : ''} data-act="retry">Play again</button>
              <button type="button" data-act="campaign">Levels</button>
            </div>`
          : `
            <p class="ng-kicker">Level ${state.level + 1} · ${lv.name}</p>
            <h2>Mission failed</h2>
            <p>${state.finale ? state.finale.sub : 'The battle was lost'}. ${goalText(lv.goal, lv.rivals)} to win.</p>
            ${stats}
            <div class="row">
              <button type="button" class="primary" data-act="retry">Try again</button>
              <button type="button" data-act="campaign">Levels</button>
            </div>`;
      } else {
        const others = state.players.filter((p) => p.alive && p.id !== 0).length;
        html = `
          <h2>${won ? 'Victory' : me().alive ? 'Game over' : 'Defeated'}</h2>
          <p>${won ? `You conquered the map in ${formatTime(state.t)}.` : winner && winner.id !== 0 ? `${winner.name} took the map after ${formatTime(state.t)}.` : `You held out for ${formatTime(me().out || state.t)}.`}</p>
          ${stats}
          ${record()}
          <div class="row">
            <button type="button" class="primary" data-act="retry">Play again</button>
            ${!won && others > 1 && state.winner < 0 ? '<button type="button" data-act="watch">Watch the rest</button>' : ''}
            <button type="button" data-act="menu">Menu</button>
          </div>`;
      }
    }
    overlay.innerHTML = `<div class="ng-panel ng-${kind}">${html}</div>`;
    overlay.classList.add('open');
    overlay.scrollTop = 0;
    if (kind === 'over' && state.level >= 0 && state.result && state.result.won) {
      for (let k = 0; k < state.earned; k++) setTimeout(() => Sound.star(k), 200 + k * 350);
    }
  }

  // The menu sits over a live bot battle.
  function showMenu(kind = 'menu') {
    if (!state || state.mode !== 'menu') demo();
    showOverlay(kind);
  }

  function demo() {
    newGame({ bot: true, opponents: 3, size: 'medium', specials: true });
    state.mode = 'menu';
  }

  // Starts a campaign level, or a skirmish with the saved options (level -1).
  function start(level = -1) {
    newGame(level >= 0 ? { level } : {});
    showOverlay(null);
  }

  function finish() {
    const first = state.mode !== 'over' && !state.watching;
    state.mode = 'over';
    const won = !!(state.result && state.result.won);
    if (first) {
      if (state.level >= 0) {
        const k = state.level;
        state.earned = starsEarned();
        state.prevStars = levelStars(k);
        if (state.earned > levelStars(k)) save.stars[k] = state.earned;
        if (won && (!save.best[k] || state.t < save.best[k])) save.best[k] = Math.floor(state.t);
      } else {
        save.games++;
        if (won) {
          save.wins++;
          if (!save.fastest || state.t < save.fastest) save.fastest = Math.floor(state.t);
        }
      }
      writeSave();
    }
    showOverlay('over');
  }

  function togglePause() {
    if (!state) return;
    if (state.mode === 'playing' && !state.finale) {
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
    else if (state.mode !== 'playing') return;
    else if (b.id === 'all') selectAll();
    else if (b.id === 'repeat') repeatSend();
    else if (b.id === 'tutskip') endTutorial(false);
    else if (b.id.startsWith('frac:')) {
      state.frac = b.f;
      Sound.select();
    } else if (b.id === 'upgrade') upgrade(0, state.sel[0]);
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
      else if (b.dataset.opt === 'Specials') save.specials = v === 'on';
      writeSave();
      showOverlay('skirmish');
      return;
    }
    if (b.dataset.level) {
      briefLevel = Number(b.dataset.level);
      showOverlay('brief');
      return;
    }
    const act = b.dataset.act;
    if (act === 'start') start();
    else if (act === 'play-level') start(briefLevel);
    else if (act === 'retry') start(state.level);
    else if (act === 'next') {
      briefLevel = Math.min(LEVELS.length - 1, state.level + 1);
      showOverlay('brief');
    } else if (act === 'menu' || act === 'campaign' || act === 'skirmish') showMenu(act);
    else if (act === 'tutorial') {
      save.tutorial = false;
      writeSave();
      start(0);
    } else if (act === 'resume') togglePause();
    else if (act === 'watch') {
      state.watching = true;
      state.finale = null;
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

  const playing = () => state && state.mode === 'playing' && !state.finale && me().alive && !me().ai;

  function sendSelection(to) {
    const sources = state.sel.filter((i) => i !== to);
    if (!sources.length) return;
    if (send(0, sources, to, state.frac)) {
      state.lastSend = { sources, to, frac: state.frac };
      const t = state.towers[to];
      ring(t.x, t.y, colorOf(0), 40, 0.45);
    } else Sound.bad();
    state.sel = [];
  }

  // R: the same towers send the same share to the same target again.
  function repeatSend() {
    const ls = state.lastSend;
    const sources = ls ? ls.sources.filter((i) => state.towers[i].owner === 0) : [];
    if (!sources.length || !send(0, sources, ls.to, ls.frac)) {
      Sound.bad();
      return false;
    }
    const t = state.towers[ls.to];
    ring(t.x, t.y, colorOf(0), 40, 0.45);
    return true;
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
    else if (!playing()) return;
    else if (k >= '1' && k <= '4') state.frac = FRACS[Number(k) - 1];
    else if (k === 'u' && state.sel.length === 1) upgrade(0, state.sel[0]);
    else if (k === 'a') selectAll();
    else if (k === 'r') repeatSend();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state && state.mode === 'playing' && !AUTOPLAY) togglePause();
  });

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------

  // Watchtowers call out armies marching on the towers they guard.
  let spotCool = 0;
  function scout(dt) {
    spotCool = Math.max(0, spotCool - dt);
    for (const g of state.groups) {
      if (g.spotted || g.siege || !revealed(g)) continue;
      g.spotted = true;
      if (spotCool > 0) continue;
      spotCool = 2.5;
      Sound.warn();
      const t = state.towers[g.path[g.path.length - 1]];
      floatText(t.x, t.y - towerH(t) - 56, 'Attack spotted!', '#b91c1c', 0);
    }
  }

  let last = performance.now();
  function frame(now) {
    const real = Math.min(0.05, (now - last) / 1000);
    last = now;
    let slow = 1;
    if (state) {
      const f = state.finale;
      if (f && !f.done) {
        // Slow motion, easing back towards normal speed at the end.
        f.t += real;
        slow = f.t < 1.8 ? 0.2 : 0.2 + (f.t - 1.8) * 0.6;
        if (f.t >= f.dur) {
          f.done = true;
          finish();
        }
      }
      if (state.mode === 'playing' || state.mode === 'menu') {
        let left = real * (state.mode === 'menu' ? 1.5 : SPEED) * slow;
        while (left > 0) {
          const dt = Math.min(1 / 60, left);
          step(dt);
          left -= dt;
        }
        const tut = state.tut;
        if (tut && state.mode === 'playing') {
          tut.t += real;
          if ((tut.step === 1 && tut.t > 14) || (tut.step === 3 && tut.t > 40)) tutNext();
        }
        if (state.mode === 'playing') scout(real);
        if (state.endT > 0) {
          state.endT -= real;
          if (state.endT <= 0) {
            state.endT = 0;
            finish();
          }
        }
        // Keep the selection to towers you still own.
        state.sel = state.sel.filter((i) => state.towers[i].owner === 0);
      }
      // The menu's demo battle starts over when it is decided.
      if (state.mode === 'menu' && (state.winner >= 0 || state.t > 420)) demo();
    }
    if (state && state.mode !== 'paused') updateEffects(real * slow);
    render();
    requestAnimationFrame(frame);
  }

  // Plays a whole game with bots in every seat; returns a summary. With
  // { level, goals: true } it plays a campaign level and checks whether the
  // bot in your seat completed the objective.
  function simulate(opts = {}) {
    const keep = state;
    newGame({ ...opts, bot: true });
    state.sim = true;
    state.goalsOn = !!opts.goals && state.level >= 0;
    const dt = 1 / 20;
    const limit = opts.limit || 1800;
    while (state.winner < 0 && !state.result && state.t < limit) step(dt);
    const out = {
      winner: state.winner,
      won: !!(state.result && state.result.won),
      reason: state.result ? state.result.reason : 'timeout',
      t: Math.round(state.t),
      towers: state.players.map((p) => p.towers),
      out: state.players.map((p) => Math.round(p.out)),
      specials: state.towers.filter((t) => t.kind).map((t) => `${t.kind}:${t.owner}`),
    };
    state = keep;
    background = null;
    return out;
  }

  // Hooks for automated testing (?autoplay plays with a bot).
  window.__ng = {
    get state() { return state; },
    get save() { return save; },
    LEVELS,
    start,
    startLevel: (k) => start(k),
    send,
    upgrade,
    repeatSend,
    preview,
    reachable,
    simulate,
    step,
    towerAt,
    newGame,
    showOverlay,
  };

  if (AUTOPLAY) start();
  else showMenu();
  requestAnimationFrame(frame);
})();
