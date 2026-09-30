'use strict';

// Nameless Tanks: roam a web of crystal arenas, shatter enemies, absorb their
// shards to grow, and evolve your tank. Everything is drawn on one canvas;
// there are no image or audio files.

(() => {
  // ---------------------------------------------------------------------------
  // Tuning
  // ---------------------------------------------------------------------------

  const W = 1000;
  const H = 560;
  const ARENA_R = 560;
  const GRID = 5; // the world is a GRID x GRID web of rooms
  const TIERS = [0, 60, 240, 620]; // mass needed for each tier
  const MASS_CAP = 1000;
  const MAX_LEVEL = 8; // danger level of the deepest rooms
  const START_MASS = 24;
  const PORTAL_R = 34;

  const params = new URLSearchParams(location.search);
  const SPEED = Math.min(32, Math.max(0.25, Number(params.get('speed')) || 1));
  const AUTOPLAY = params.has('autoplay');
  const AIM_ERROR = Number(params.get('aim')) || 0.06; // autoplay aim wobble, in radians
  const REACT = Number(params.get('react')) || 0.25; // autoplay reaction time, in seconds

  // Gun fields: a = angle offset, off = sideways offset, dmg, rate (seconds
  // between shots), spd, size, and optional pierce, spread, explode (radius),
  // home, split, bomblets, ring (fires in every direction).
  const FORMS = {
    seed: {
      name: 'Seed', tier: 0, speed: 235, r: 15, next: ['twin', 'lancer'],
      desc: 'A single cannon.',
      guns: [{ a: 0, off: 0, dmg: 10, rate: 0.28, spd: 560, size: 4 }],
    },
    twin: {
      name: 'Twin', tier: 1, speed: 230, r: 19, next: ['spread', 'swarm'], parent: 'seed',
      desc: 'Two quick parallel cannons.',
      guns: [
        { a: 0, off: -7, dmg: 10, rate: 0.22, spd: 580, size: 4 },
        { a: 0, off: 7, dmg: 10, rate: 0.22, spd: 580, size: 4, delay: 0.11 },
      ],
    },
    lancer: {
      name: 'Lancer', tier: 1, speed: 220, r: 19, next: ['rail', 'mortar'], parent: 'seed',
      desc: 'Slow, heavy lances that pierce two enemies.',
      guns: [{ a: 0, off: 0, dmg: 30, rate: 0.5, spd: 900, size: 5, pierce: 2 }],
    },
    spread: {
      name: 'Spread', tier: 2, speed: 225, r: 23, next: ['nova'], parent: 'twin',
      desc: 'A five-way fan of shots.',
      guns: [-0.32, -0.16, 0, 0.16, 0.32].map((a) => ({ a, off: 0, dmg: 10, rate: 0.3, spd: 560, size: 4 })),
    },
    swarm: {
      name: 'Swarm', tier: 2, speed: 245, r: 23, next: ['hive'], parent: 'twin',
      desc: 'A rapid gatling, plus a rear gun.',
      guns: [
        { a: 0, off: 0, dmg: 8, rate: 0.075, spd: 620, size: 3.5, spread: 0.07 },
        { a: Math.PI, off: 0, dmg: 8, rate: 0.2, spd: 520, size: 3.5 },
      ],
    },
    rail: {
      name: 'Rail', tier: 2, speed: 210, r: 23, next: ['prism'], parent: 'lancer',
      desc: 'A rail gun that punches through five enemies.',
      guns: [{ a: 0, off: 0, dmg: 70, rate: 0.75, spd: 1400, size: 5.5, pierce: 5 }],
    },
    mortar: {
      name: 'Mortar', tier: 2, speed: 215, r: 23, next: ['cluster'], parent: 'lancer',
      desc: 'Slow shells that explode on impact.',
      guns: [{ a: 0, off: 0, dmg: 28, rate: 0.62, spd: 440, size: 7, explode: 75 }],
    },
    nova: {
      name: 'Nova', tier: 3, speed: 225, r: 28, next: [], parent: 'spread',
      desc: 'A wide fan, and a burst in every direction.',
      guns: [
        ...[-0.4, -0.2, 0, 0.2, 0.4].map((a) => ({ a, off: 0, dmg: 13, rate: 0.26, spd: 600, size: 4.5 })),
        { a: 0, off: 0, dmg: 10, rate: 0.85, spd: 420, size: 4, ring: 12 },
      ],
    },
    hive: {
      name: 'Hive', tier: 3, speed: 255, r: 28, next: [], parent: 'swarm',
      desc: 'A gatling and two streams of homing drones.',
      guns: [
        { a: 0, off: 0, dmg: 10, rate: 0.07, spd: 660, size: 3.5, spread: 0.05 },
        { a: 1.2, off: 0, dmg: 12, rate: 0.28, spd: 360, size: 4, home: true },
        { a: -1.2, off: 0, dmg: 12, rate: 0.28, spd: 360, size: 4, home: true, delay: 0.14 },
      ],
    },
    prism: {
      name: 'Prism', tier: 3, speed: 215, r: 28, next: [], parent: 'rail',
      desc: 'Piercing beams that split into three on every hit.',
      guns: [{ a: 0, off: 0, dmg: 90, rate: 0.65, spd: 1500, size: 6, pierce: 6, split: 3 }],
    },
    cluster: {
      name: 'Cluster', tier: 3, speed: 220, r: 28, next: [], parent: 'mortar',
      desc: 'Big shells that burst into six bomblets.',
      guns: [{ a: 0, off: 0, dmg: 38, rate: 0.6, spd: 460, size: 8, explode: 90, bomblets: 6 }],
    },
  };

  // Enemy fields: hp, r, speed, touch (contact damage), drop (mass), color.
  const ENEMIES = {
    mite: { hp: 14, r: 9, speed: 150, touch: 8, drop: 3, color: '#f472b6', sides: 3 },
    spiker: { hp: 30, r: 13, speed: 95, touch: 8, drop: 6, color: '#fb923c', sides: 4 },
    charger: { hp: 45, r: 14, speed: 70, touch: 14, drop: 8, color: '#facc15', sides: 3 },
    splitter: { hp: 40, r: 15, speed: 105, touch: 10, drop: 6, color: '#34d399', sides: 4 },
    spinner: { hp: 65, r: 17, speed: 45, touch: 10, drop: 11, color: '#a78bfa', sides: 6 },
    guardian: { hp: 620, r: 38, speed: 55, touch: 20, drop: 120, color: '#ef4444', sides: 8 },
    boss: { hp: 8500, r: 74, speed: 30, touch: 30, drop: 0, color: '#e879f9', sides: 7 },
  };

  // Which enemies appear, from which depth, and how common they are.
  const ROOM_MIX = [
    ['mite', 0, 10],
    ['spiker', 1, 6],
    ['charger', 2, 4],
    ['splitter', 2, 4],
    ['spinner', 3, 3],
  ];

  const DIRS = { E: [1, 0, 0], S: [0, 1, Math.PI / 2], W: [-1, 0, Math.PI], N: [0, -1, -Math.PI / 2] };
  const OPPOSITE = { E: 'W', W: 'E', N: 'S', S: 'N' };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const form = () => FORMS[state.player.form];
  const angleLerp = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

  function loadBest() {
    try {
      return JSON.parse(localStorage.getItem('nameless-tanks-best')) || null;
    } catch {
      return null;
    }
  }

  function saveBest(run) {
    const best = loadBest();
    if (best && best.won && (!run.won || best.time <= run.time)) return;
    if (best && !run.won && !best.won && best.depth >= run.depth) return;
    try {
      localStorage.setItem('nameless-tanks-best', JSON.stringify(run));
    } catch {
      // Storage can be unavailable (private mode); the record is just not kept.
    }
  }

  // ---------------------------------------------------------------------------
  // Sound (tiny WebAudio synth)
  // ---------------------------------------------------------------------------

  const Sound = {
    ctx: null,
    muted: false,
    last: {},
    noiseBuf: null,

    unlock() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        const len = this.ctx.sampleRate;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
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

    noise(dur, vol, freq) {
      const c = this.ctx;
      const t = c.currentTime;
      const s = c.createBufferSource();
      s.buffer = this.noiseBuf;
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = freq;
      const g = c.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f).connect(g).connect(c.destination);
      s.start(t, Math.random() * 0.5);
      s.stop(t + dur);
    },

    shoot() { this.play('shoot', 0.05, () => this.tone(880, 0.06, 'square', 0.025, 440)); },
    heavy() { this.play('heavy', 0.1, () => { this.tone(300, 0.15, 'sawtooth', 0.05, 90); this.noise(0.1, 0.1, 1500); }); },
    enemyShot() { this.play('eshot', 0.08, () => this.tone(520, 0.08, 'triangle', 0.03, 300)); },
    hit() { this.play('hit', 0.04, () => this.noise(0.05, 0.08, 3000)); },
    shatter() { this.play('shatter', 0.05, () => { this.noise(0.18, 0.14, 5000); this.tone(1200, 0.12, 'triangle', 0.04, 2400); }); },
    boom() { this.play('boom', 0.08, () => { this.noise(0.4, 0.3, 500); this.tone(110, 0.3, 'sine', 0.2, 40); }); },
    absorb(pitch) { this.play('absorb', 0.03, () => this.tone(600 + pitch * 40, 0.07, 'sine', 0.04)); },
    hurt() { this.play('hurt', 0.2, () => this.tone(220, 0.25, 'sawtooth', 0.06, 80)); },
    portal() { this.play('portal', 0.3, () => this.tone(300, 0.4, 'sine', 0.08, 1200)); },
    click() { this.play('click', 0.02, () => this.tone(900, 0.04, 'triangle', 0.06)); },
    evolve() {
      this.play('evolve', 0.5, () => [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.08, null, i * 0.08)));
    },
    devolve() {
      this.play('devolve', 0.5, () => [659, 523, 392].forEach((f, i) => this.tone(f, 0.3, 'sawtooth', 0.05, null, i * 0.1)));
    },
    cleared() {
      this.play('cleared', 0.5, () => [523, 784].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.06, null, i * 0.1)));
    },
    win() {
      this.play('end', 1, () => [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.08, null, i * 0.13)));
    },
    lose() {
      this.play('end', 1, () => [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.45, 'sawtooth', 0.05, null, i * 0.2)));
    },
  };

  // ---------------------------------------------------------------------------
  // World generation
  // ---------------------------------------------------------------------------

  function makeWorld() {
    const rooms = [];
    for (let gy = 0; gy < GRID; gy++) {
      for (let gx = 0; gx < GRID; gx++) {
        rooms.push({ id: gy * GRID + gx, gx, gy, links: {}, d: 0, visited: false, cleared: false, pending: [] });
      }
    }
    const at = (gx, gy) => (gx >= 0 && gy >= 0 && gx < GRID && gy < GRID ? rooms[gy * GRID + gx] : null);
    const link = (a, dir) => {
      const [dx, dy] = DIRS[dir];
      const b = at(a.gx + dx, a.gy + dy);
      a.links[dir] = b.id;
      b.links[OPPOSITE[dir]] = a.id;
    };
    // A random maze from the centre, then a few extra doors so there are loops.
    const start = at(2, 2);
    const seen = new Set([start.id]);
    const stack = [start];
    while (stack.length) {
      const r = stack[stack.length - 1];
      const options = Object.keys(DIRS).filter((dir) => {
        const [dx, dy] = DIRS[dir];
        const n = at(r.gx + dx, r.gy + dy);
        return n && !seen.has(n.id);
      });
      if (!options.length) {
        stack.pop();
        continue;
      }
      const dir = pick(options);
      const [dx, dy] = DIRS[dir];
      const n = at(r.gx + dx, r.gy + dy);
      link(r, dir);
      seen.add(n.id);
      stack.push(n);
    }
    for (let k = 0; k < 12; k++) {
      const r = pick(rooms);
      const dir = pick(Object.keys(DIRS));
      const [dx, dy] = DIRS[dir];
      if (at(r.gx + dx, r.gy + dy) && r.links[dir] === undefined) link(r, dir);
    }
    // Depth is the number of rooms from the start.
    const queue = [start];
    const depth = new Map([[start.id, 0]]);
    while (queue.length) {
      const r = queue.shift();
      for (const id of Object.values(r.links)) {
        if (!depth.has(id)) {
          depth.set(id, depth.get(r.id) + 1);
          queue.push(rooms[id]);
        }
      }
    }
    const maxD = Math.max(...depth.values());
    // Danger level runs from 0 at the start to MAX_LEVEL in the farthest rooms.
    for (const r of rooms) r.d = Math.round((MAX_LEVEL * depth.get(r.id)) / maxD);
    const boss = pick(rooms.filter((r) => depth.get(r.id) === maxD));
    boss.boss = true;
    const guardCandidates = rooms.filter((r) => !r.boss && r.d >= 3 && r.d < MAX_LEVEL);
    for (let k = 0; k < 2 && guardCandidates.length; k++) {
      const g = guardCandidates.splice((Math.random() * guardCandidates.length) | 0, 1)[0];
      g.guardian = true;
    }
    for (const r of rooms) r.pending = roomEnemies(r);
    return { rooms, start: start.id, maxD };
  }

  function roomEnemies(r) {
    if (r.boss) return ['boss', 'spiker', 'spiker'];
    if (r.id === 12) return ['mite', 'mite', 'mite', 'mite'];
    const count = Math.min(16, 3 + r.d * 2);
    const mix = ROOM_MIX.filter(([, from]) => r.d >= from);
    const total = mix.reduce((s, [, , w]) => s + w, 0);
    const list = [];
    for (let k = 0; k < count; k++) {
      let x = Math.random() * total;
      for (const [type, , w] of mix) {
        if (x < w) { list.push(type); break; }
        x -= w;
      }
    }
    if (r.guardian) list.unshift('guardian');
    return list;
  }

  // ---------------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------------

  let state = null;
  const input = { keys: new Set(), mx: W / 2 + 100, my: H / 2, down: false, over: false };

  function newGame() {
    const world = makeWorld();
    state = {
      mode: 'playing', // 'menu' | 'playing' | 'paused' | 'choosing' | 'over'
      t: 0,
      world,
      room: null,
      player: {
        x: 0, y: 0, vx: 0, vy: 0, aim: 0,
        form: 'seed', mass: START_MASS, cds: [0], inv: 0, flash: 0, spin: 0,
      },
      enemies: [],
      bullets: [],
      foes: [], // enemy bullets
      shards: [],
      parts: [],
      rings: [],
      texts: [],
      banner: null,
      cam: { x: 0, y: 0, zoom: 1 },
      shake: 0,
      fade: 0,
      portalCd: 0,
      combo: 0,
      comboT: 0,
      stats: { kills: 0, rooms: 1, maxTier: 0, deepest: 0 },
    };
    enterRoom(world.start, null);
  }

  function enterRoom(id, fromDir) {
    const s = state;
    if (s.room) {
      // Remember who is still alive here for next time.
      s.room.pending = s.enemies.filter((e) => e.type !== 'mite' || !e.spawned).map((e) => e.type);
    }
    const room = s.world.rooms[id];
    const firstVisit = !room.visited;
    room.visited = true;
    s.room = room;
    s.enemies = [];
    s.bullets = [];
    s.foes = [];
    s.shards = [];
    if (firstVisit && id !== s.world.start) s.stats.rooms++;
    s.stats.deepest = Math.max(s.stats.deepest, room.d);
    const p = s.player;
    if (fromDir) {
      const [, , a] = DIRS[OPPOSITE[fromDir]];
      p.x = Math.cos(a) * (ARENA_R - 90);
      p.y = Math.sin(a) * (ARENA_R - 90);
    } else {
      p.x = 0;
      p.y = 0;
    }
    p.vx = 0;
    p.vy = 0;
    s.cam.x = p.x;
    s.cam.y = p.y;
    s.portalCd = 1;
    s.fade = 0.5;
    for (const type of room.pending) spawnEnemy(type, true);
    room.pending = [];
    if (room.boss) s.banner = { text: 'The Core', sub: 'Shatter it to win', t: 3 };
    else if (room.guardian && s.enemies.some((e) => e.type === 'guardian')) s.banner = { text: 'Guardian', sub: 'Shoot its shields away first', t: 2.5 };
    else s.banner = { text: `Depth ${room.d}`, sub: room.cleared ? 'Cleared' : `${s.enemies.length} enemies`, t: 1.6 };
  }

  function spawnEnemy(type, awayFromPlayer, x, y) {
    const t = ENEMIES[type];
    const d = state.room.d;
    const scale = 1 + 0.35 * d;
    if (x === undefined) {
      for (let tries = 0; tries < 20; tries++) {
        const a = rand(0, Math.PI * 2);
        const r = type === 'boss' ? 0 : rand(0, ARENA_R * 0.8);
        x = Math.cos(a) * r;
        y = Math.sin(a) * r;
        if (!awayFromPlayer || Math.hypot(x - state.player.x, y - state.player.y) > 320) break;
      }
    }
    const e = {
      type, x, y, vx: 0, vy: 0,
      hp: t.hp * (type === 'boss' ? 1 : scale),
      maxHp: t.hp * (type === 'boss' ? 1 : scale),
      // The Core has its own damage scale; its bullet rings are dangerous enough.
      r: t.r, dmg: type === 'boss' ? 3.3 : 1 + 0.45 * d,
      cd: rand(0.8, 2), t: rand(0, 10), flash: 0, spin: rand(0, 6), state: 'idle', timer: rand(1, 2.5),
    };
    if (type === 'guardian') {
      e.shields = [0, 1, 2, 3].map((k) => ({ a: (k * Math.PI) / 2, hp: 60 * scale, max: 60 * scale }));
    }
    state.enemies.push(e);
    return e;
  }

  // ---------------------------------------------------------------------------
  // Player
  // ---------------------------------------------------------------------------

  function toWorld(mx, my) {
    const c = state.cam;
    return { x: (mx - W / 2) / c.zoom + c.x, y: (my - H / 2) / c.zoom + c.y };
  }

  function updatePlayer(dt) {
    const p = state.player;
    const f = form();
    let ix = 0;
    let iy = 0;
    const k = input.keys;
    if (k.has('a') || k.has('arrowleft')) ix -= 1;
    if (k.has('d') || k.has('arrowright')) ix += 1;
    if (k.has('w') || k.has('arrowup')) iy -= 1;
    if (k.has('s') || k.has('arrowdown')) iy += 1;
    if (AUTOPLAY) [ix, iy] = botMove(dt);
    const len = Math.hypot(ix, iy) || 1;
    const tx = (ix / len) * f.speed;
    const ty = (iy / len) * f.speed;
    const blend = Math.min(1, dt * 10);
    p.vx += (tx - p.vx) * blend;
    p.vy += (ty - p.vy) * blend;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const d = Math.hypot(p.x, p.y);
    if (d > ARENA_R - f.r) {
      p.x *= (ARENA_R - f.r) / d;
      p.y *= (ARENA_R - f.r) / d;
    }
    const target = AUTOPLAY ? bot.aimPoint : toWorld(input.mx, input.my);
    p.aim = Math.atan2(target.y - p.y, target.x - p.x);
    p.inv -= dt;
    p.flash -= dt;
    p.spin += dt * 0.6;

    const firing = AUTOPLAY ? bot.fire : input.down || k.has(' ');
    f.guns.forEach((g, i) => {
      if (p.cds[i] === undefined) p.cds[i] = g.delay || 0;
      p.cds[i] -= dt;
      if (firing && p.cds[i] <= 0) {
        p.cds[i] = g.rate;
        fireGun(p, g, f);
      }
    });

    // Portals.
    state.portalCd -= dt;
    if (state.portalCd <= 0) {
      for (const [dir, id] of Object.entries(state.room.links)) {
        const pp = portalPos(dir);
        if (Math.hypot(p.x - pp.x, p.y - pp.y) < PORTAL_R + f.r * 0.5) {
          Sound.portal();
          enterRoom(id, dir);
          return;
        }
      }
    }
  }

  function fireGun(p, g, f) {
    const shots = g.ring ? g.ring : 1;
    for (let k = 0; k < shots; k++) {
      const base = g.ring ? p.aim + (k / shots) * Math.PI * 2 : p.aim + g.a;
      const a = base + (g.spread ? rand(-g.spread, g.spread) : 0);
      const ox = Math.cos(p.aim + Math.PI / 2) * g.off;
      const oy = Math.sin(p.aim + Math.PI / 2) * g.off;
      const muzzle = f.r + 4;
      state.bullets.push({
        x: p.x + ox + Math.cos(a) * muzzle, y: p.y + oy + Math.sin(a) * muzzle,
        vx: Math.cos(a) * g.spd, vy: Math.sin(a) * g.spd,
        dmg: g.dmg, r: g.size, life: 1.6, pierce: g.pierce || 1, hit: new Set(),
        explode: g.explode, home: g.home, split: g.split, bomblets: g.bomblets, spd: g.spd,
      });
    }
    if (g.explode || (g.pierce && g.pierce > 1)) Sound.heavy();
    else Sound.shoot();
    // Recoil nudges the tank backwards a little.
    p.vx -= Math.cos(p.aim) * g.dmg * 0.4;
    p.vy -= Math.sin(p.aim) * g.dmg * 0.4;
  }

  function hurtPlayer(dmg, fromX, fromY) {
    const p = state.player;
    if (p.inv > 0 || state.mode !== 'playing') return;
    p.inv = 0.6;
    p.flash = 0.15;
    p.mass -= dmg;
    state.shake = Math.max(state.shake, 6);
    Sound.hurt();
    // Knock back, and spill some mass as shards that can be picked up again.
    const a = Math.atan2(p.y - fromY, p.x - fromX);
    p.vx += Math.cos(a) * 260;
    p.vy += Math.sin(a) * 260;
    dropShards(p.x, p.y, Math.floor(dmg * 0.45), 220);
    if (p.mass <= 0) {
      p.mass = 0;
      finish(false);
      return;
    }
    const f = form();
    if (f.tier > 0 && p.mass < TIERS[f.tier]) {
      p.form = f.parent;
      p.cds = [];
      addText(p.x, p.y - 40, `Devolved to ${FORMS[p.form].name}`, '#fca5a5', 1.6);
      Sound.devolve();
    }
  }

  function gainMass(v) {
    const p = state.player;
    p.mass = Math.min(MASS_CAP, p.mass + v);
    const f = form();
    if (f.tier < 3 && p.mass >= TIERS[f.tier + 1] && f.next.length) {
      state.mode = 'choosing';
      input.down = false;
      if (AUTOPLAY) choose(pick(f.next));
    }
  }

  function choose(id) {
    const p = state.player;
    p.form = id;
    p.cds = [];
    state.mode = 'playing';
    state.stats.maxTier = Math.max(state.stats.maxTier, FORMS[id].tier);
    state.rings.push({ x: p.x, y: p.y, r: 10, life: 0.8, max: 0.8, color: '#67e8f9' });
    burst(p.x, p.y, '#67e8f9', 40, 320);
    addText(p.x, p.y - 50, `${FORMS[id].name}!`, '#a5f3fc', 1.6);
    Sound.evolve();
  }

  // ---------------------------------------------------------------------------
  // Bullets, enemies and shards
  // ---------------------------------------------------------------------------

  function updateBullets(dt) {
    for (const b of state.bullets) {
      if (b.home) {
        let best = null;
        let bd = 420;
        for (const e of state.enemies) {
          const d = Math.hypot(e.x - b.x, e.y - b.y);
          if (d < bd) { bd = d; best = e; }
        }
        if (best) {
          const a = angleLerp(Math.atan2(b.vy, b.vx), Math.atan2(best.y - b.y, best.x - b.x), Math.min(1, dt * 6));
          b.vx = Math.cos(a) * b.spd;
          b.vy = Math.sin(a) * b.spd;
        }
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || Math.hypot(b.x, b.y) > ARENA_R) {
        b.dead = true;
        if (b.explode) explode(b);
        else burst(b.x, b.y, '#a5f3fc', 3, 60);
        continue;
      }
      for (const e of state.enemies) {
        if (e.dead || b.hit.has(e)) continue;
        // Guardian shields block shots.
        if (e.shields) {
          let blocked = false;
          for (const sh of e.shields) {
            if (sh.hp <= 0) continue;
            const sx = e.x + Math.cos(sh.a + e.spin) * (e.r + 24);
            const sy = e.y + Math.sin(sh.a + e.spin) * (e.r + 24);
            if (Math.hypot(b.x - sx, b.y - sy) < 13 + b.r) {
              sh.hp -= b.dmg;
              burst(sx, sy, '#fca5a5', 5, 120);
              Sound.hit();
              if (sh.hp <= 0) {
                burst(sx, sy, '#ef4444', 18, 240);
                Sound.shatter();
              }
              blocked = true;
              break;
            }
          }
          if (blocked) {
            b.dead = true;
            if (b.explode) explode(b);
            break;
          }
        }
        if (Math.hypot(e.x - b.x, e.y - b.y) < e.r + b.r) {
          b.hit.add(e);
          damageEnemy(e, b.dmg, b.x, b.y);
          if (b.split) {
            const a = Math.atan2(b.vy, b.vx);
            for (const da of [-0.5, 0.5]) {
              state.bullets.push({
                x: b.x, y: b.y, vx: Math.cos(a + da) * b.spd * 0.8, vy: Math.sin(a + da) * b.spd * 0.8,
                dmg: b.dmg * 0.5, r: b.r * 0.7, life: 0.5, pierce: 1, hit: new Set([e]), spd: b.spd,
              });
            }
          }
          b.pierce--;
          if (b.pierce <= 0) {
            b.dead = true;
            if (b.explode) explode(b);
            break;
          }
        }
      }
    }
    state.bullets = state.bullets.filter((b) => !b.dead);
  }

  function explode(b) {
    const r = b.explode;
    state.rings.push({ x: b.x, y: b.y, r: 8, life: 0.35, max: 0.35, color: '#fdba74', grow: r * 2.6 });
    burst(b.x, b.y, '#fb923c', 16, 260);
    state.shake = Math.max(state.shake, 3);
    Sound.boom();
    for (const e of state.enemies) {
      if (!e.dead && Math.hypot(e.x - b.x, e.y - b.y) < r + e.r) damageEnemy(e, b.dmg, e.x, e.y);
    }
    if (b.bomblets) {
      for (let k = 0; k < b.bomblets; k++) {
        const a = (k / b.bomblets) * Math.PI * 2 + rand(-0.2, 0.2);
        state.bullets.push({
          x: b.x, y: b.y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260,
          dmg: b.dmg * 0.5, r: 4, life: 0.35, pierce: 1, hit: new Set(), explode: r * 0.55, spd: 260,
        });
      }
    }
  }

  function damageEnemy(e, dmg, hx, hy) {
    e.hp -= dmg;
    e.flash = 0.08;
    burst(hx, hy, ENEMIES[e.type].color, 3, 90);
    Sound.hit();
    if (e.hp > 0) return;
    e.dead = true;
    const t = ENEMIES[e.type];
    state.stats.kills++;
    burst(e.x, e.y, t.color, 14 + t.r, 260);
    state.rings.push({ x: e.x, y: e.y, r: e.r, life: 0.3, max: 0.3, color: t.color });
    Sound.shatter();
    if (e.type === 'boss') {
      state.shake = 16;
      for (let k = 0; k < 6; k++) burst(e.x + rand(-60, 60), e.y + rand(-60, 60), pick(['#e879f9', '#67e8f9', '#fde047']), 30, 420);
      // Let the explosion play out before the victory screen.
      const run = state;
      run.mode = 'over';
      run.won = true;
      setTimeout(() => {
        if (state === run) finish(true);
      }, 900);
      return;
    }
    dropShards(e.x, e.y, Math.round(t.drop * (1 + 0.25 * state.room.d)), 160);
    if (e.type === 'splitter') {
      for (let k = 0; k < 3; k++) {
        const m = spawnEnemy('mite', false, e.x + rand(-12, 12), e.y + rand(-12, 12));
        m.spawned = true;
        m.vx = rand(-200, 200);
        m.vy = rand(-200, 200);
      }
    }
  }

  function enemyShot(e, a, spd, dmg, size = 5) {
    state.foes.push({ x: e.x + Math.cos(a) * e.r, y: e.y + Math.sin(a) * e.r, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, dmg: dmg * e.dmg, r: size, life: 4 });
  }

  function updateEnemies(dt) {
    const p = state.player;
    const f = form();
    for (const e of state.enemies) {
      if (e.dead) continue;
      const t = ENEMIES[e.type];
      e.t += dt;
      e.flash -= dt;
      e.cd -= dt;
      e.spin += dt * (e.type === 'spinner' ? 2 : 0.8);
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const toP = Math.atan2(dy, dx);
      let ax = 0;
      let ay = 0;
      const steer = (angle, speed) => {
        ax = Math.cos(angle) * speed;
        ay = Math.sin(angle) * speed;
      };

      if (e.type === 'mite' || e.type === 'splitter') {
        steer(toP + Math.sin(e.t * 3) * 0.4, t.speed);
      } else if (e.type === 'spiker') {
        // Hold a firing distance: close in, back off, or circle.
        const want = 280;
        if (d > want + 40) steer(toP, t.speed);
        else if (d < want - 40) steer(toP + Math.PI, t.speed);
        else steer(toP + Math.PI / 2, t.speed * 0.8);
        if (e.cd <= 0) {
          e.cd = rand(1.4, 1.9);
          enemyShot(e, toP, 270, 8);
          Sound.enemyShot();
        }
      } else if (e.type === 'charger') {
        e.timer -= dt;
        if (e.state === 'idle') {
          steer(toP + Math.PI / 2, t.speed * 0.6);
          if (e.timer <= 0) { e.state = 'wind'; e.timer = 0.5; e.dashA = toP; }
        } else if (e.state === 'wind') {
          ax = 0;
          ay = 0;
          if (e.timer <= 0) { e.state = 'dash'; e.timer = 0.45; }
        } else {
          steer(e.dashA, 540);
          if (e.timer <= 0) { e.state = 'idle'; e.timer = rand(1.8, 2.8); }
        }
      } else if (e.type === 'spinner') {
        steer(e.t * 0.5, t.speed);
        if (e.cd <= 0) {
          e.cd = 1.3;
          for (let k = 0; k < 6; k++) enemyShot(e, e.spin + (k / 6) * Math.PI * 2, 200, 6);
          Sound.enemyShot();
        }
      } else if (e.type === 'guardian') {
        steer(d > 220 ? toP : toP + Math.PI / 2, t.speed);
        if (e.cd <= 0) {
          e.cd = 1.2;
          for (const da of [-0.2, 0, 0.2]) enemyShot(e, toP + da, 300, 10, 6);
          Sound.enemyShot();
        }
      } else if (e.type === 'boss') {
        steer(toP, d > 260 ? t.speed : -t.speed);
        const phase = e.hp / e.maxHp;
        if (e.cd <= 0) {
          if (phase > 0.66) {
            e.cd = 1.7;
            for (let k = 0; k < 16; k++) enemyShot(e, e.spin + (k / 16) * Math.PI * 2, 190, 9, 7);
            for (const da of [-0.15, 0, 0.15]) enemyShot(e, toP + da, 320, 10, 6);
          } else if (phase > 0.33) {
            e.cd = 1.4;
            for (let k = 0; k < 20; k++) enemyShot(e, e.spin * 1.5 + (k / 20) * Math.PI * 2, 210, 9, 7);
            if (state.enemies.filter((x) => x.type === 'mite').length < 8) {
              for (let k = 0; k < 3; k++) spawnEnemy('mite', false, e.x + rand(-80, 80), e.y + rand(-80, 80)).spawned = true;
            }
          } else {
            e.cd = 0.9;
            for (let k = 0; k < 24; k++) enemyShot(e, e.spin * 2 + (k / 24) * Math.PI * 2, 240, 10, 7);
            for (const da of [-0.25, -0.1, 0.1, 0.25]) enemyShot(e, toP + da, 360, 10, 6);
          }
          Sound.enemyShot();
        }
      }
      const blend = Math.min(1, dt * 4);
      e.vx += (ax - e.vx) * blend;
      e.vy += (ay - e.vy) * blend;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      const ed = Math.hypot(e.x, e.y);
      if (ed > ARENA_R - e.r) {
        e.x *= (ARENA_R - e.r) / ed;
        e.y *= (ARENA_R - e.r) / ed;
      }
      // Touching the player hurts both.
      if (d < e.r + f.r) {
        hurtPlayer(t.touch * e.dmg, e.x, e.y);
        if (e.type !== 'boss' && e.type !== 'guardian') {
          e.vx -= Math.cos(toP) * 300;
          e.vy -= Math.sin(toP) * 300;
          if (e.type === 'charger' && e.state === 'dash') e.state = 'idle';
        }
      }
    }
    // Keep enemies from stacking on top of each other.
    const es = state.enemies;
    for (let i = 0; i < es.length; i++) {
      for (let j = i + 1; j < es.length; j++) {
        const a = es[i];
        const b = es[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        const min = a.r + b.r;
        if (d < min) {
          const push = (min - d) / 2;
          a.x -= (dx / d) * push;
          a.y -= (dy / d) * push;
          b.x += (dx / d) * push;
          b.y += (dy / d) * push;
        }
      }
    }
    state.enemies = state.enemies.filter((e) => !e.dead);
  }

  function updateFoes(dt) {
    const p = state.player;
    const f = form();
    for (const b of state.foes) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || Math.hypot(b.x, b.y) > ARENA_R) b.dead = true;
      else if (Math.hypot(b.x - p.x, b.y - p.y) < f.r + b.r) {
        b.dead = true;
        hurtPlayer(b.dmg, b.x, b.y);
      }
    }
    state.foes = state.foes.filter((b) => !b.dead);
  }

  function dropShards(x, y, total, power) {
    while (total > 0) {
      const v = Math.min(total, total > 20 ? 5 : total > 6 ? 2 : 1);
      total -= v;
      const a = rand(0, Math.PI * 2);
      const s = rand(0.3, 1) * power;
      state.shards.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, v, life: 22, spin: rand(0, 6), delay: 0.3 });
    }
  }

  function updateShards(dt) {
    const p = state.player;
    const f = form();
    const magnet = 150 + f.tier * 25;
    state.comboT -= dt;
    if (state.comboT <= 0) state.combo = 0;
    for (const s of state.shards) {
      s.life -= dt;
      s.delay -= dt;
      s.spin += dt * 3;
      const d = Math.hypot(p.x - s.x, p.y - s.y);
      if (s.delay <= 0 && d < magnet) {
        const pull = 1400 * (1 - d / magnet) + 300;
        s.vx += ((p.x - s.x) / d) * pull * dt;
        s.vy += ((p.y - s.y) / d) * pull * dt;
      }
      s.vx *= 1 - Math.min(1, dt * 2.5);
      s.vy *= 1 - Math.min(1, dt * 2.5);
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.delay <= 0 && d < f.r + 6) {
        s.dead = true;
        state.combo++;
        state.comboT = 0.4;
        Sound.absorb(Math.min(20, state.combo));
        gainMass(s.v);
        if (state.mode !== 'playing') break;
      }
      if (s.life <= 0) s.dead = true;
    }
    state.shards = state.shards.filter((s) => !s.dead);
  }

  function step(dt) {
    state.t += dt;
    updatePlayer(dt);
    if (state.mode !== 'playing') return;
    updateBullets(dt);
    updateEnemies(dt);
    updateFoes(dt);
    updateShards(dt);
    if (!state.room.cleared && !state.enemies.length && state.mode === 'playing') {
      state.room.cleared = true;
      state.banner = { text: 'Room cleared', sub: `${remainingRooms()} rooms left to clear`, t: 2 };
      Sound.cleared();
    }
  }

  function remainingRooms() {
    return state.world.rooms.filter((r) => !r.cleared).length;
  }

  function finish(won) {
    state.mode = 'over';
    state.won = won;
    input.down = false;
    const run = { won, time: Math.round(state.t), depth: state.stats.deepest, kills: state.stats.kills, form: form().name };
    state.prevBest = loadBest();
    saveBest(run);
    if (won) Sound.win();
    else Sound.lose();
    showOverlay('over');
  }

  // ---------------------------------------------------------------------------
  // Autoplay bot (for automated testing): keeps its distance from enemies,
  // aims with lead and some wobble, collects shards, then heads for the
  // nearest room it has not cleared.
  // ---------------------------------------------------------------------------

  const bot = { aimPoint: { x: 1, y: 0 }, fire: false, react: 0, target: null, wob: 0, strafe: 1, strafeT: 0 };

  function botPath() {
    // Breadth-first search to the nearest room that is not cleared.
    const rooms = state.world.rooms;
    const start = state.room.id;
    const prev = new Map([[start, null]]);
    const queue = [start];
    while (queue.length) {
      const id = queue.shift();
      const r = rooms[id];
      if (id !== start && !r.cleared && (!r.boss || form().tier >= 3 || rooms.every((x) => x.cleared || x.boss))) {
        let cur = id;
        while (prev.get(cur) !== start) cur = prev.get(cur);
        return Object.entries(rooms[start].links).find(([, v]) => v === cur)[0];
      }
      for (const n of Object.values(r.links)) {
        if (!prev.has(n)) {
          prev.set(n, id);
          queue.push(n);
        }
      }
    }
    return null;
  }

  function botMove(dt) {
    const p = state.player;
    const f = form();
    bot.strafeT -= dt;
    if (bot.strafeT <= 0) {
      bot.strafe = -bot.strafe;
      bot.strafeT = rand(1.5, 3);
    }
    // Aim.
    const living = state.enemies.filter((e) => !e.dead);
    if (!bot.target || bot.target.dead || !living.includes(bot.target)) {
      bot.target = living.sort((a, b) => dist(a, p) - dist(b, p))[0] || null;
      bot.react = REACT;
      bot.wob = rand(-AIM_ERROR, AIM_ERROR);
    }
    bot.react -= dt;
    bot.fire = false;
    if (bot.target && bot.react <= 0) {
      const e = bot.target;
      const spd = f.guns[0].spd;
      const tt = dist(e, p) / spd;
      const lx = e.x + e.vx * tt;
      const ly = e.y + e.vy * tt;
      const a = Math.atan2(ly - p.y, lx - p.x) + bot.wob;
      bot.aimPoint = { x: p.x + Math.cos(a) * 200, y: p.y + Math.sin(a) * 200 };
      bot.fire = true;
      if (Math.random() < dt * 2) bot.wob = rand(-AIM_ERROR, AIM_ERROR);
    }
    // Move: dodge nearby bullets, keep range from enemies, else collect shards or leave.
    let mx = 0;
    let my = 0;
    for (const b of state.foes) {
      const d = Math.hypot(b.x - p.x, b.y - p.y);
      if (d < 120) {
        const side = Math.sign((b.x - p.x) * b.vy - (b.y - p.y) * b.vx) || 1;
        mx += (-b.vy * side) / (d + 20);
        my += (b.vx * side) / (d + 20);
      }
    }
    if (living.length) {
      const e = living.reduce((a, b) => (dist(a, p) < dist(b, p) ? a : b));
      const d = dist(e, p);
      const a = Math.atan2(p.y - e.y, p.x - e.x);
      const want = e.type === 'boss' ? 330 : 240;
      const radial = d < want ? 1 : -0.4;
      mx += Math.cos(a) * radial + Math.cos(a + Math.PI / 2) * bot.strafe * 0.8;
      my += Math.sin(a) * radial + Math.sin(a + Math.PI / 2) * bot.strafe * 0.8;
      // Stay off the walls.
      mx -= (p.x / ARENA_R) * 0.9;
      my -= (p.y / ARENA_R) * 0.9;
      if (state.shards.length && d > 200) {
        const s = state.shards.reduce((a, b) => (dist(a, p) < dist(b, p) ? a : b));
        mx += ((s.x - p.x) / (dist(s, p) + 1)) * 0.5;
        my += ((s.y - p.y) / (dist(s, p) + 1)) * 0.5;
      }
    } else if (state.shards.length) {
      const s = state.shards.reduce((a, b) => (dist(a, p) < dist(b, p) ? a : b));
      mx += s.x - p.x;
      my += s.y - p.y;
    } else {
      const dir = botPath();
      if (dir) {
        const pp = portalPos(dir);
        mx += pp.x - p.x;
        my += pp.y - p.y;
      }
    }
    return [mx, my];
  }

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  function burst(x, y, color, n, power) {
    for (let k = 0; k < n; k++) {
      const a = rand(0, Math.PI * 2);
      const v = rand(0.2, 1) * power;
      state.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.3, 0.8), max: 0.8, color, size: rand(1.5, 3.5) });
    }
  }

  function addText(x, y, text, color, life = 1) {
    state.texts.push({ x, y, text, color, life, max: life });
  }

  function updateEffects(dt) {
    for (const p of state.parts) {
      p.life -= dt;
      p.vx *= 1 - Math.min(1, dt * 2);
      p.vy *= 1 - Math.min(1, dt * 2);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    state.parts = state.parts.filter((p) => p.life > 0);
    if (state.parts.length > 900) state.parts.splice(0, state.parts.length - 900);
    for (const r of state.rings) {
      r.life -= dt;
      r.r += dt * (r.grow || 240);
    }
    state.rings = state.rings.filter((r) => r.life > 0);
    for (const t of state.texts) {
      t.life -= dt;
      t.y -= 20 * dt;
    }
    state.texts = state.texts.filter((t) => t.life > 0);
    if (state.banner) {
      state.banner.t -= dt;
      if (state.banner.t <= 0) state.banner = null;
    }
    state.shake = Math.max(0, state.shake - dt * 30);
    state.fade = Math.max(0, state.fade - dt * 1.5);
    // Camera follows the player and zooms out as the tank grows.
    const p = state.player;
    const c = state.cam;
    c.zoom += ((1 - form().tier * 0.07) - c.zoom) * Math.min(1, dt * 2);
    c.x += (p.x - c.x) * Math.min(1, dt * 6);
    c.y += (p.y - c.y) * Math.min(1, dt * 6);
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  const stage = document.getElementById('stage');
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const glowCache = new Map();

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || W;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(w * dpr * (H / W));
  }
  window.addEventListener('resize', resize);
  document.addEventListener('fullscreenchange', resize);
  resize();

  // A soft round glow sprite per colour, drawn once and reused.
  function glow(color) {
    if (!glowCache.has(color)) {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 64;
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 0.55;
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      glowCache.set(color, c);
    }
    return glowCache.get(color);
  }

  function drawGlow(x, y, r, color) {
    ctx.drawImage(glow(color), x - r, y - r, r * 2, r * 2);
  }

  function polygon(x, y, r, sides, rot) {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = rot + (i / sides) * Math.PI * 2;
      if (i) ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      else ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
  }

  function portalPos(dir) {
    const a = DIRS[dir][2];
    return { x: Math.cos(a) * (ARENA_R - 8), y: Math.sin(a) * (ARENA_R - 8) };
  }

  function render() {
    const s = canvas.width / W;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    // Deep space background with a slow parallax hex grid.
    ctx.fillStyle = '#060913';
    ctx.fillRect(0, 0, W, H);
    if (!state) return;
    const c = state.cam;
    const shx = rand(-state.shake, state.shake);
    const shy = rand(-state.shake, state.shake);
    drawStars(c);

    ctx.save();
    ctx.translate(W / 2 + shx, H / 2 + shy);
    ctx.scale(c.zoom, c.zoom);
    ctx.translate(-c.x, -c.y);
    drawArena();
    drawPortals();
    ctx.globalCompositeOperation = 'lighter';
    for (const sh of state.shards) drawShard(sh);
    ctx.globalCompositeOperation = 'source-over';
    for (const e of state.enemies) drawEnemy(e);
    drawPlayer();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of state.bullets) {
      drawGlow(b.x, b.y, b.r * 3.5, '#22d3ee');
      ctx.fillStyle = '#ecfeff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const b of state.foes) {
      drawGlow(b.x, b.y, b.r * 3.5, '#f43f5e');
      ctx.fillStyle = '#fb7185';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const p of state.parts) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    for (const r of state.rings) {
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = r.life / r.max;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.textAlign = 'center';
    for (const t of state.texts) {
      ctx.globalAlpha = clamp(t.life / t.max * 1.5, 0, 1);
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    if (state.fade > 0) {
      ctx.fillStyle = `rgba(165, 243, 252, ${state.fade * 0.6})`;
      ctx.fillRect(0, 0, W, H);
    }
    drawHud();
    if (state.mode === 'choosing') drawChoice();
    drawCursor();
  }

  function drawStars(c) {
    const r = (seed) => {
      const x = Math.sin(seed * 12.9898) * 43758.5453;
      return x - Math.floor(x);
    };
    for (let k = 0; k < 120; k++) {
      const depthF = 0.15 + r(k + 1) * 0.35;
      let x = (r(k + 7) * 2400 - c.x * depthF) % 1400;
      let y = (r(k + 13) * 1600 - c.y * depthF) % 900;
      if (x < 0) x += 1400;
      if (y < 0) y += 900;
      ctx.fillStyle = `rgba(186, 230, 253, ${0.2 + r(k + 3) * 0.5})`;
      ctx.fillRect(x - 200, y - 170, 1.5, 1.5);
    }
  }

  function drawArena() {
    // Floor.
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, ARENA_R);
    g.addColorStop(0, '#0e1a2e');
    g.addColorStop(0.85, '#0b1424');
    g.addColorStop(1, '#10223a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, ARENA_R, 0, Math.PI * 2);
    ctx.fill();
    // Hex grid, clipped to the arena.
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.07)';
    ctx.lineWidth = 1;
    const size = 38;
    const hw = size * Math.sqrt(3);
    for (let row = -18; row <= 18; row++) {
      for (let col = -12; col <= 12; col++) {
        const x = col * hw + (row % 2 ? hw / 2 : 0);
        const y = row * size * 1.5;
        if (Math.hypot(x, y) > ARENA_R + size) continue;
        polygon(x, y, size, 6, Math.PI / 6);
        ctx.stroke();
      }
    }
    ctx.restore();
    // Rim.
    ctx.strokeStyle = 'rgba(103, 232, 249, 0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, ARENA_R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(103, 232, 249, 0.15)';
    ctx.lineWidth = 12;
    ctx.stroke();
  }

  function drawPortals() {
    const rooms = state.world.rooms;
    for (const [dir, id] of Object.entries(state.room.links)) {
      const pp = portalPos(dir);
      const next = rooms[id];
      const color = next.boss ? '#f472b6' : next.cleared ? '#4ade80' : next.visited ? '#fde047' : '#67e8f9';
      const pulse = 1 + Math.sin(state.t * 4) * 0.08;
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(pp.x, pp.y, PORTAL_R * 2.4, color);
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(pp.x, pp.y, PORTAL_R * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(pp.x, pp.y, PORTAL_R * 0.6 * pulse, state.t * 2, state.t * 2 + Math.PI * 1.3);
      ctx.stroke();
      // Label, pulled inside the arena so it stays readable.
      const a = DIRS[dir][2];
      const lx = Math.cos(a) * (ARENA_R - 70);
      const ly = Math.sin(a) * (ARENA_R - 70);
      ctx.fillStyle = color;
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(next.boss ? 'THE CORE' : next.cleared ? 'Cleared' : `Depth ${next.d}`, lx, ly + 4);
    }
  }

  function drawShard(s) {
    if (s.life < 4 && Math.floor(s.life * 6) % 2) return;
    const size = 3 + s.v * 0.9;
    drawGlow(s.x, s.y, size * 3, '#22d3ee');
    ctx.fillStyle = '#a5f3fc';
    polygon(s.x, s.y, size, 4, s.spin);
    ctx.fill();
  }

  function drawEnemy(e) {
    const t = ENEMIES[e.type];
    const color = e.flash > 0 ? '#ffffff' : t.color;
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(e.x, e.y, e.r * 2.6, t.color);
    ctx.globalCompositeOperation = 'source-over';

    if (e.type === 'charger' && e.state === 'wind') {
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.6)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.x + Math.cos(e.dashA) * 300, e.y + Math.sin(e.dashA) * 300);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const rot = e.type === 'charger' ? Math.atan2(e.vy, e.vx) : e.spin;
    ctx.fillStyle = shadeHex(t.color, 0.35);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    if (e.type === 'boss') {
      // A cluster of crystals around a pulsing core.
      for (let k = 0; k < 7; k++) {
        const a = e.spin * 0.5 + (k / 7) * Math.PI * 2;
        polygon(e.x + Math.cos(a) * e.r * 0.6, e.y + Math.sin(a) * e.r * 0.6, e.r * 0.5, 5, a);
        ctx.fill();
        ctx.stroke();
      }
      const pulse = 0.5 + 0.5 * Math.sin(state.t * 5);
      ctx.fillStyle = e.flash > 0 ? '#fff' : `rgba(253, 244, 255, ${0.6 + pulse * 0.4})`;
      polygon(e.x, e.y, e.r * 0.45, 7, -e.spin);
      ctx.fill();
      ctx.stroke();
    } else {
      polygon(e.x, e.y, e.r, t.sides, rot);
      ctx.fill();
      ctx.stroke();
      // Inner facet.
      ctx.strokeStyle = shadeHex(t.color, 0.8);
      ctx.lineWidth = 1.2;
      polygon(e.x, e.y, e.r * 0.5, t.sides, -rot);
      ctx.stroke();
      if (e.type === 'spiker') {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        for (let k = 0; k < 4; k++) {
          const a = rot + (k / 4) * Math.PI * 2 + Math.PI / 4;
          ctx.beginPath();
          ctx.moveTo(e.x + Math.cos(a) * e.r * 0.8, e.y + Math.sin(a) * e.r * 0.8);
          ctx.lineTo(e.x + Math.cos(a) * e.r * 1.5, e.y + Math.sin(a) * e.r * 1.5);
          ctx.stroke();
        }
      }
    }
    if (e.shields) {
      for (const sh of e.shields) {
        if (sh.hp <= 0) continue;
        const sx = e.x + Math.cos(sh.a + e.spin) * (e.r + 24);
        const sy = e.y + Math.sin(sh.a + e.spin) * (e.r + 24);
        ctx.fillStyle = `rgba(254, 202, 202, ${0.4 + 0.6 * (sh.hp / sh.max)})`;
        polygon(sx, sy, 13, 3, sh.a + e.spin);
        ctx.fill();
        ctx.strokeStyle = '#fecaca';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    if (e.hp < e.maxHp) {
      const w = e.type === 'boss' ? 200 : Math.max(24, e.r * 2);
      const y = e.y - e.r - (e.type === 'boss' ? 30 : 12);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(e.x - w / 2, y, w, 4);
      ctx.fillStyle = t.color;
      ctx.fillRect(e.x - w / 2, y, w * clamp(e.hp / e.maxHp, 0, 1), 4);
    }
  }

  function shadeHex(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => clamp(Math.round(v * amount), 0, 255);
    return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
  }

  // The tank: guns, a ring of hexagonal cells that grows with mass, and a core.
  function drawTank(x, y, formId, mass, aim, spin, flash, alpha = 1) {
    const f = FORMS[formId];
    ctx.save();
    ctx.globalAlpha = alpha;
    // Guns.
    for (const g of f.guns) {
      if (g.ring) continue;
      const a = aim + g.a;
      const ox = Math.cos(aim + Math.PI / 2) * g.off;
      const oy = Math.sin(aim + Math.PI / 2) * g.off;
      ctx.save();
      ctx.translate(x + ox, y + oy);
      ctx.rotate(a);
      const len = f.r + 6 + (g.pierce ? 8 : 0) + (g.explode ? 2 : 0);
      const w = g.size * 1.6;
      ctx.fillStyle = '#0e7490';
      ctx.strokeStyle = '#67e8f9';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(0, -w / 2, len, w, 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    // Cells.
    const cells = clamp(Math.round(4 + mass / 14), 4, 34);
    const ring1 = Math.min(cells, 8);
    const ring2 = cells - ring1;
    const cellR = f.r * 0.24;
    const drawRing = (n, rr, offset) => {
      for (let i = 0; i < n; i++) {
        const a = spin * (offset ? -1 : 1) + offset + (i / n) * Math.PI * 2;
        const cx = x + Math.cos(a) * rr;
        const cy = y + Math.sin(a) * rr;
        ctx.fillStyle = flash ? '#fff' : 'rgba(34, 211, 238, 0.35)';
        polygon(cx, cy, cellR, 6, a);
        ctx.fill();
        ctx.strokeStyle = '#67e8f9';
        ctx.lineWidth = 1.3;
        ctx.stroke();
      }
    };
    drawRing(ring1, f.r * 0.72, 0);
    if (ring2) drawRing(ring2, f.r * 1.02, Math.PI / ring2);
    // Core.
    ctx.fillStyle = flash ? '#fff' : '#0e7490';
    polygon(x, y, f.r * 0.5, 6, spin * 0.5);
    ctx.fill();
    ctx.strokeStyle = '#a5f3fc';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ecfeff';
    polygon(x, y, f.r * 0.2, 6, -spin);
    ctx.fill();
    ctx.restore();
  }

  function drawPlayer() {
    const p = state.player;
    const f = form();
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(p.x, p.y, f.r * 3, '#06b6d4');
    ctx.globalCompositeOperation = 'source-over';
    const blink = p.inv > 0 && Math.floor(p.inv * 20) % 2;
    drawTank(p.x, p.y, p.form, p.mass, p.aim, p.spin, p.flash > 0, blink ? 0.4 : 1);
  }

  // --- HUD ------------------------------------------------------------------------

  const SYS = { x0: W - 132, y: 10, size: 36, gap: 6 };
  const inside = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

  function sysButtons() {
    const paused = state && state.mode === 'paused';
    return [
      { id: 'pause', label: paused ? '▶' : 'II' },
      { id: 'mute', label: Sound.muted ? '♪̸' : '♪' },
      { id: 'full', label: '⛶' },
    ].map((b, k) => ({ ...b, x: SYS.x0 + k * (SYS.size + SYS.gap), y: SYS.y, w: SYS.size, h: SYS.size }));
  }

  function choiceCards() {
    const next = form().next;
    return next.map((id, k) => ({ id: `choose:${id}`, form: id, x: W / 2 - 250 + k * 260, y: 150, w: 240, h: 250 }));
  }

  function hitTest(x, y) {
    if (!state) return null;
    for (const b of sysButtons()) if (inside(b, x, y)) return b;
    if (state.mode === 'choosing') for (const c of choiceCards()) if (inside(c, x, y)) return c;
    return null;
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  function drawHud() {
    const p = state.player;
    const f = form();
    const hover = hitTest(input.mx, input.my);

    // Form and mass.
    ctx.fillStyle = 'rgba(8, 15, 30, 0.75)';
    roundRect(12, 10, 300, 58, 10);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#a5f3fc';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText(f.name, 24, 32);
    for (let k = 0; k < 4; k++) {
      ctx.fillStyle = k <= f.tier ? '#22d3ee' : 'rgba(255,255,255,0.15)';
      polygon(24 + ctx.measureText(f.name).width + 14 + k * 13, 27, 4.5, 6, 0);
      ctx.fill();
    }
    const lo = TIERS[f.tier];
    const hi = f.tier < 3 ? TIERS[f.tier + 1] : MASS_CAP;
    const frac = clamp((p.mass - lo) / (hi - lo), 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    roundRect(24, 42, 276, 12, 6);
    ctx.fill();
    ctx.fillStyle = p.mass - lo < (hi - lo) * 0.15 && f.tier > 0 ? '#f87171' : '#22d3ee';
    roundRect(24, 42, Math.max(12, 276 * frac), 12, 6);
    ctx.fill();
    ctx.fillStyle = '#ecfeff';
    ctx.font = '600 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(f.tier < 3 ? `Mass ${Math.floor(p.mass)} · evolve at ${hi}` : `Mass ${Math.floor(p.mass)} · final form`, 162, 51.5);

    // Room info.
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(8, 15, 30, 0.75)';
    roundRect(12, 74, 170, 26, 8);
    ctx.fill();
    ctx.fillStyle = '#e0f2fe';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillText(state.room.boss ? 'The Core' : `Depth ${state.room.d} · ${state.enemies.length} enemies`, 22, 91);

    drawMinimap();

    for (const b of sysButtons()) {
      const hot = hover && hover.id === b.id;
      ctx.fillStyle = hot ? 'rgba(165,243,252,0.3)' : 'rgba(8, 15, 30, 0.75)';
      roundRect(b.x, b.y, b.w, b.h, 8);
      ctx.fill();
      ctx.fillStyle = '#e0f2fe';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
      ctx.textBaseline = 'alphabetic';
    }

    if (state.banner && state.mode !== 'choosing') {
      const bn = state.banner;
      ctx.globalAlpha = clamp(bn.t, 0, 1);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ecfeff';
      ctx.font = 'bold 34px system-ui, sans-serif';
      ctx.fillText(bn.text, W / 2, 150);
      ctx.fillStyle = '#a5f3fc';
      ctx.font = '600 14px system-ui, sans-serif';
      ctx.fillText(bn.sub, W / 2, 176);
      ctx.globalAlpha = 1;
    }
  }

  function drawMinimap() {
    const cell = 16;
    const gap = 5;
    const size = GRID * cell + (GRID - 1) * gap;
    const x0 = W - size - 16;
    const y0 = 56;
    ctx.fillStyle = 'rgba(8, 15, 30, 0.75)';
    roundRect(x0 - 8, y0 - 8, size + 16, size + 16, 10);
    ctx.fill();
    const rooms = state.world.rooms;
    const known = new Set();
    for (const r of rooms) {
      if (r.visited) {
        known.add(r.id);
        for (const n of Object.values(r.links)) known.add(n);
      }
    }
    const pos = (r) => [x0 + r.gx * (cell + gap), y0 + r.gy * (cell + gap)];
    // Doors between known rooms.
    ctx.strokeStyle = 'rgba(165, 243, 252, 0.35)';
    ctx.lineWidth = 2;
    for (const r of rooms) {
      if (!r.visited) continue;
      const [ax, ay] = pos(r);
      for (const n of Object.values(r.links)) {
        const [bx, by] = pos(rooms[n]);
        ctx.beginPath();
        ctx.moveTo(ax + cell / 2, ay + cell / 2);
        ctx.lineTo(bx + cell / 2, by + cell / 2);
        ctx.stroke();
      }
    }
    for (const r of rooms) {
      const [x, y] = pos(r);
      if (r.id === state.room.id) ctx.fillStyle = '#22d3ee';
      else if (r.cleared) ctx.fillStyle = 'rgba(74, 222, 128, 0.55)';
      else if (r.visited) ctx.fillStyle = 'rgba(253, 224, 71, 0.55)';
      else if (known.has(r.id)) ctx.fillStyle = 'rgba(165, 243, 252, 0.18)';
      else ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
      roundRect(x, y, cell, cell, 3);
      ctx.fill();
      if (r.boss) {
        ctx.fillStyle = '#f472b6';
        polygon(x + cell / 2, y + cell / 2, 5, 4, state.t);
        ctx.fill();
      } else if (r.guardian && !r.cleared && known.has(r.id)) {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(x + cell / 2, y + cell / 2, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawChoice() {
    const hover = hitTest(input.mx, input.my);
    ctx.fillStyle = 'rgba(2, 6, 23, 0.75)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ecfeff';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.fillText('Evolve', W / 2, 110);
    ctx.fillStyle = '#a5f3fc';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText('Pick a new form (1 or 2). Lose too much mass and you devolve.', W / 2, 134);
    choiceCards().forEach((c, k) => {
      const f = FORMS[c.form];
      const hot = hover && hover.id === c.id;
      ctx.fillStyle = hot ? 'rgba(34, 211, 238, 0.18)' : 'rgba(15, 23, 42, 0.9)';
      roundRect(c.x, c.y, c.w, c.h, 14);
      ctx.fill();
      ctx.strokeStyle = hot ? '#67e8f9' : 'rgba(103, 232, 249, 0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.save();
      ctx.translate(c.x + c.w / 2, c.y + 82);
      ctx.scale(1.9, 1.9);
      drawTank(0, 0, c.form, TIERS[f.tier] + 40, -Math.PI / 2, state.t, false);
      ctx.restore();
      ctx.fillStyle = '#ecfeff';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${k + 1}. ${f.name}`, c.x + c.w / 2, c.y + 160);
      ctx.fillStyle = '#bae6fd';
      ctx.font = '13px system-ui, sans-serif';
      wrap(f.desc, c.x + c.w / 2, c.y + 184, c.w - 30, 17);
      if (f.next.length) {
        ctx.fillStyle = '#7dd3fc';
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillText(`Leads to: ${f.next.map((n) => FORMS[n].name).join(', ')}`, c.x + c.w / 2, c.y + c.h - 16);
      }
    });
  }

  function wrap(text, x, y, width, lineH) {
    const words = text.split(' ');
    let line = '';
    let n = 0;
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > width && line) {
        ctx.fillText(line, x, y + n * lineH);
        n++;
        line = w;
      } else line = test;
    }
    ctx.fillText(line, x, y + n * lineH);
  }

  function drawCursor() {
    const over = hitTest(input.mx, input.my);
    const aiming = state && state.mode === 'playing' && input.over && !over;
    canvas.style.cursor = aiming ? 'none' : over ? 'pointer' : 'default';
    if (!aiming) return;
    ctx.strokeStyle = 'rgba(165, 243, 252, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(input.mx, input.my, 9, 0, Math.PI * 2);
    ctx.moveTo(input.mx - 14, input.my);
    ctx.lineTo(input.mx - 5, input.my);
    ctx.moveTo(input.mx + 5, input.my);
    ctx.lineTo(input.mx + 14, input.my);
    ctx.moveTo(input.mx, input.my - 14);
    ctx.lineTo(input.mx, input.my - 5);
    ctx.moveTo(input.mx, input.my + 5);
    ctx.lineTo(input.mx, input.my + 14);
    ctx.stroke();
  }

  // ---------------------------------------------------------------------------
  // Overlays (menu, pause, game over) and input
  // ---------------------------------------------------------------------------

  const overlay = document.getElementById('overlay');

  function formatTime(t) {
    return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  }

  function showOverlay(kind) {
    if (!kind) {
      overlay.classList.remove('open');
      overlay.innerHTML = '';
      return;
    }
    const best = loadBest();
    const bestLine = best
      ? `<p class="help">Best run: ${best.won ? `shattered the Core in ${formatTime(best.time)}` : `reached depth ${best.depth}`} as ${best.form}.</p>`
      : '';
    if (kind === 'menu') {
      overlay.innerHTML = `
        <div>
          <h2>Nameless Tanks</h2>
          <p>Roam a web of crystal arenas. Shatter enemies, absorb their shards to grow, and evolve your tank. Find and destroy the Core.</p>
          <div class="row"><button type="button" class="primary" data-act="start">Start</button></div>
          <p class="help">WASD or arrows to move · mouse to aim · hold click or Space to fire · P pause · F fullscreen</p>
          ${bestLine}
        </div>`;
    } else if (kind === 'paused') {
      overlay.innerHTML = `
        <div>
          <h2>Paused</h2>
          <div class="row">
            <button type="button" class="primary" data-act="resume">Resume</button>
            <button type="button" data-act="menu">Quit to menu</button>
          </div>
        </div>`;
    } else if (kind === 'over') {
      const s = state.stats;
      overlay.innerHTML = `
        <div>
          <h2>${state.won ? 'The Core is shattered' : 'Shattered'}</h2>
          <p>${state.won ? `You won in ${formatTime(state.t)} as ${form().name}.` : `You fell at depth ${state.room.d} after ${formatTime(state.t)}.`}</p>
          <p>${s.kills} enemies · ${s.rooms} rooms explored · deepest ${s.deepest}</p>
          ${bestLine}
          <div class="row">
            <button type="button" class="primary" data-act="start">Play again</button>
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

  function togglePause() {
    if (!state) return;
    if (state.mode === 'playing') {
      state.mode = 'paused';
      input.down = false;
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

  function activate(id) {
    if (id === 'pause') togglePause();
    else if (id === 'mute') Sound.muted = !Sound.muted;
    else if (id === 'full') toggleFullscreen();
    else if (id.startsWith('choose:') && state.mode === 'choosing') choose(id.slice(7));
  }

  overlay.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    Sound.unlock();
    if (b.dataset.act === 'start') start();
    else if (b.dataset.act === 'resume') togglePause();
    else if (b.dataset.act === 'menu') showMenu();
  });

  function toCanvas(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }

  canvas.addEventListener('pointermove', (e) => {
    const p = toCanvas(e);
    input.mx = p.x;
    input.my = p.y;
    input.over = true;
  });
  canvas.addEventListener('pointerleave', () => {
    input.over = false;
  });
  canvas.addEventListener('pointerdown', (e) => {
    Sound.unlock();
    if (e.button !== 0) return;
    const p = toCanvas(e);
    input.mx = p.x;
    input.my = p.y;
    input.over = true;
    const hit = hitTest(p.x, p.y);
    if (hit) {
      activate(hit.id);
      return;
    }
    input.down = true;
    canvas.setPointerCapture(e.pointerId);
  });
  window.addEventListener('pointerup', () => {
    input.down = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    Sound.unlock();
    const k = e.key.toLowerCase();
    if (k === 'm') { Sound.muted = !Sound.muted; return; }
    if (k === 'f') { toggleFullscreen(); return; }
    if (k === 'p' || k === 'escape') { togglePause(); return; }
    if (state && state.mode === 'choosing' && (k === '1' || k === '2')) {
      const c = choiceCards()[Number(k) - 1];
      if (c) choose(c.form);
      return;
    }
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) {
      input.keys.add(k);
      e.preventDefault();
    }
  });
  document.addEventListener('keyup', (e) => input.keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => {
    input.keys.clear();
    input.down = false;
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
      while (left > 0 && state.mode === 'playing') {
        const dt = Math.min(1 / 60, left);
        step(dt);
        left -= dt;
      }
    }
    if (state && state.mode !== 'paused') updateEffects(real);
    render();
    requestAnimationFrame(frame);
  }

  // Hooks for automated testing (?autoplay plays with a bot).
  window.__nt = {
    get state() { return state; },
    input,
    start,
    choose,
    FORMS,
    step(dt) {
      step(dt);
      updateEffects(dt);
    },
  };

  if (AUTOPLAY) start();
  else showMenu();
  requestAnimationFrame(frame);
})();
